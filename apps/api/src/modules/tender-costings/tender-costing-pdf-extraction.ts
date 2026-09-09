import { BadRequestException } from "@nestjs/common";
import type {
  TenderCostingPdfExtractedRow,
  TenderCostingPdfExtractionResult,
  TenderCostingPdfFileResult,
} from "@bizovix/types";
import { extractTextItems, getDocumentProxy } from "unpdf";

export const MAX_TENDER_COSTING_PDF_FILES = 20;
export const MAX_TENDER_COSTING_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_TENDER_COSTING_PDF_TOTAL_BYTES = 50 * 1024 * 1024;
export const MAX_TENDER_COSTING_PDF_PAGES = 50;
const PDF_PARSE_TIMEOUT_MS = 20_000;

export interface UploadedTenderCostingPdf {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface PositionedText {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

const BANGLA_DIGITS: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/^(?:no|nos|number|numbers|each|ea)$/i, "Nos"],
  [/^(?:pc|pcs|piece|pieces)$/i, "Pcs"],
  [/^sets?$/i, "Set"],
  [/^lots?$/i, "Lot"],
  [/^(?:ls|lumpsum|lumpsums)$/i, "LS"],
  [/^(?:kg|kgs|kilogram|kilograms)$/i, "Kg"],
  [/^(?:mt|ton|tons|tonne|tonnes)$/i, "MT"],
  [/^(?:m|mtr|mtrs|meter|meters|metre|metres|rm)$/i, "Meter"],
  [/^(?:sqm|sqmeter|sqmeters|squaremeter|squaremeters)$/i, "Sqm"],
  [/^(?:sqft|sft|squarefeet|squarefoot)$/i, "Sqft"],
  [/^(?:cft|cubicfeet|cubicfoot)$/i, "Cft"],
  [/^bags?$/i, "Bag"],
  [/^boxes?$/i, "Box"],
  [/^pairs?$/i, "Pair"],
  [/^jobs?$/i, "Job"],
  [/^services?$/i, "Service"],
];

const UNIT_CAPTURE =
  "(?:Nos?\\.?|Numbers?|Each|EA|Pcs?\\.?|Pieces?|Sets?|Lots?|L\\.?\\s*S\\.?|Lump\\s*Sum|Kgs?\\.?|Kilograms?|M\\.?T\\.?|Tons?|Tonnes?|Mtrs?\\.?|Meters?|Metres?|R\\.?M\\.?|Sq\\.?\\s*M\\.?|Sqm|Sq\\.?\\s*Ft\\.?|Sqft|Sft|Cft|Bags?|Boxes?|Pairs?|Jobs?|Services?)";
const NUMBER_CAPTURE = "[0-9০-৯][0-9০-৯,]*(?:\\.[0-9০-৯]+)?";
const ITEM_NO_CAPTURE = "[0-9০-৯]+(?:\\.[0-9০-৯]+)*";
const SERIAL_PREFIX = `(?:Item\\s+)?${ITEM_NO_CAPTURE}\\s*[).:-]?`;

function normalizeDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit] ?? digit);
}

function compactLine(value: string): string {
  return normalizeDigits(value)
    .replace(/\u00a0/g, " ")
    .replace(/[ ]+/g, " ")
    .trim();
}

function extractItemNo(value: string): string | undefined {
  const originalValue = value.replace(/\u00a0/g, " ").trim();
  const match = new RegExp(
    `^\\s*(?:Item\\s+)?(${ITEM_NO_CAPTURE})\\s*[).:-]?`,
    "iu",
  ).exec(originalValue);
  return match?.[1]?.trim() || undefined;
}

function normalizeUnit(value: string): string | undefined {
  const normalized = compactLine(value)
    .replace(/[().,:;/\\-]/g, "")
    .replace(/\s+/g, "");
  return UNIT_ALIASES.find(([pattern]) => pattern.test(normalized))?.[1];
}

function parseNonNegativeNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = normalizeDigits(value)
    .replace(/(?:BDT|TK\.?|TAKA|USD|EUR|GBP|CNY|INR|৳|\$|€|£)/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();
  const match = /^\(?(-?\d+(?:\.\d+)?)\)?$/.exec(normalized);
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function numbersFrom(value: string): number[] {
  const matches = normalizeDigits(value).match(
    /(?:BDT|TK\.?|TAKA|USD|EUR|GBP|CNY|INR|৳|\$|€|£)?\s*\(?-?\d[\d,]*(?:\.\d+)?\)?/gi,
  );
  return (matches ?? []).flatMap((match) => {
    const parsed = parseNonNegativeNumber(match);
    return parsed === undefined ? [] : [parsed];
  });
}

function cleanDescription(value: string): string | undefined {
  const description = compactLine(value)
    .replace(
      /^(?:(?:group\s+)?(?:n\/?a|not\s+applicable))(?:\s*[-:|]\s*|\s+)(?=\S)/i,
      "",
    )
    .replace(/^[-:;,.\s]+|[-:;,.\s]+$/g, "")
    .trim();
  if (description.length < 2 || !/[\p{L}]/u.test(description)) return undefined;
  if (
    /^(?:sl\.?\s*(?:no\.?)?|item\s*(?:no\.?)?|description(?:\s+of\s+(?:goods|works|item))?|product(?:\s*\/\s*work)?(?:\s+name)?|unit|uom|qty|quantity|unit\s+(?:price|rate)|rate|amount|total(?:\s+price)?|grand\s+total|subtotal|carried\s+forward|brought\s+forward|bill\s+of\s+quantities|price\s+schedule|schedule\s+of\s+requirements|technical\s+specifications?|terms\s+and\s+conditions?|general\s+requirements?|notes?|page\s+\d+(?:\s+of\s+\d+)?)$/i.test(
      description,
    )
  ) {
    return undefined;
  }
  return description;
}

function makeRow(
  descriptionValue: string,
  unitValue: string | undefined,
  quantityValue: string | undefined,
  itemNoValue?: string,
): TenderCostingPdfExtractedRow | undefined {
  const description = cleanDescription(descriptionValue);
  if (!description) return undefined;
  const itemNo = itemNoValue ? extractItemNo(itemNoValue) : undefined;
  const unit = unitValue ? normalizeUnit(unitValue) : undefined;
  const parsedQuantity = parseNonNegativeNumber(quantityValue);
  const quantity = parsedQuantity && parsedQuantity > 0 ? parsedQuantity : undefined;
  return {
    ...(itemNo ? { itemNo } : {}),
    description,
    ...(unit ? { unit } : {}),
    ...(quantity ? { quantity } : {}),
  };
}

interface SeparatedColumnLayout {
  columnCount: number;
  descriptionIndex: number;
  unitIndex: number;
  quantityIndex: number;
}

function separatedCells(line: string): string[] {
  return line
    .split(/\t+|\s*\|\s*|\s{2,}/)
    .map(compactLine)
    .filter(Boolean);
}

function detectSeparatedColumnLayout(line: string): SeparatedColumnLayout | undefined {
  const cells = separatedCells(line);
  const descriptionIndex = cells.findIndex((cell) =>
    /^(?:description\s+of\s+(?:item|goods|works)|product(?:\s*\/\s*work)?\s+name)$/i.test(cell),
  );
  const unitIndex = cells.findIndex((cell) =>
    /^(?:measurement(?:\s+unit)?|unit(?:\s+of\s+measurement)?|uom)$/i.test(cell),
  );
  const quantityIndex = cells.findIndex((cell) => /^(?:quantity|qty)$/i.test(cell));
  if (descriptionIndex < 0 || unitIndex < 0 || quantityIndex < 0) return undefined;
  return { columnCount: cells.length, descriptionIndex, unitIndex, quantityIndex };
}

function parseSeparatedRow(
  line: string,
  layout?: SeparatedColumnLayout,
): TenderCostingPdfExtractedRow | undefined {
  const cells = separatedCells(line);
  if (cells.length < 3) return undefined;
  const first = cells[0] ?? "";
  const hasSerial = new RegExp(`^${SERIAL_PREFIX}$`, "i").test(first);
  if (!hasSerial) return undefined;

  if (
    layout &&
    cells.length >= layout.columnCount &&
    Math.max(layout.descriptionIndex, layout.unitIndex, layout.quantityIndex) < cells.length
  ) {
    const mappedRow = makeRow(
      cells[layout.descriptionIndex] ?? "",
      cells[layout.unitIndex],
      cells[layout.quantityIndex],
      first,
    );
    if (mappedRow?.unit && mappedRow.quantity) return mappedRow;
  }

  const unitIndex = cells.findIndex((cell) => Boolean(normalizeUnit(cell)));
  if (unitIndex < 1) return undefined;

  const beforeUnit = cells.slice(0, unitIndex);
  const descriptionCells = [...beforeUnit];
  descriptionCells.splice(0, 1);
  const firstDescriptionCell = descriptionCells[0] ?? "";
  const descriptionValue = /^(?:n\/?a|not\s+applicable)$/i.test(firstDescriptionCell)
    ? (descriptionCells[1] ?? "")
    : firstDescriptionCell.replace(
        /^(?:(?:group\s+)?(?:n\/?a|not\s+applicable))\s*[-:|]?\s+(?=\S)/i,
        "",
      );
  const afterUnit = cells.slice(unitIndex + 1);
  const numericValues = afterUnit.flatMap(numbersFrom);
  if (numericValues.length === 0) return undefined;
  return makeRow(
    descriptionValue,
    cells[unitIndex],
    String(numericValues[0]),
    first,
  );
}

function parseInlineRow(
  line: string,
  allowWithoutSerial: boolean,
): TenderCostingPdfExtractedRow | undefined {
  const itemNo = extractItemNo(line);
  const serialQuantityUnit = new RegExp(
    `^\\s*${SERIAL_PREFIX}\\s+(.+?)\\s+(${NUMBER_CAPTURE})\\s+(${UNIT_CAPTURE})(?:\\s+(.*))?$`,
    "iu",
  ).exec(line);
  if (serialQuantityUnit) {
    return makeRow(
      serialQuantityUnit[1] ?? "",
      serialQuantityUnit[3],
      serialQuantityUnit[2],
      itemNo,
    );
  }
  const serialUnitQuantity = new RegExp(
    `^\\s*${SERIAL_PREFIX}\\s+(.+?)\\s+(${UNIT_CAPTURE})\\s+(${NUMBER_CAPTURE})(?:\\s+(.*))?$`,
    "iu",
  ).exec(line);
  if (serialUnitQuantity) {
    return makeRow(
      serialUnitQuantity[1] ?? "",
      serialUnitQuantity[2],
      serialUnitQuantity[3],
      itemNo,
    );
  }
  if (!allowWithoutSerial) return undefined;

  const quantityUnit = new RegExp(
    `^\\s*(.+?)\\s+(${NUMBER_CAPTURE})\\s+(${UNIT_CAPTURE})(?:\\s+(.*))?$`,
    "iu",
  ).exec(line);
  if (quantityUnit) {
    return makeRow(
      quantityUnit[1] ?? "",
      quantityUnit[3],
      quantityUnit[2],
    );
  }
  const unitQuantity = new RegExp(
    `^\\s*(.+?)\\s+(${UNIT_CAPTURE})\\s+(${NUMBER_CAPTURE})(?:\\s+(.*))?$`,
    "iu",
  ).exec(line);
  return unitQuantity
      ? makeRow(
          unitQuantity[1] ?? "",
          unitQuantity[2],
          unitQuantity[3],
        )
    : undefined;
}

function mergedRowText(lines: string[]): string {
  return compactLine(
    lines
      .join(" ")
      .replace(/\s*\|\s*/g, " ")
      .replace(/\t+/g, " "),
  );
}

function extendDescription(
  lines: string[],
  startIndex: number,
  row: TenderCostingPdfExtractedRow,
  layout?: SeparatedColumnLayout,
): { row: TenderCostingPdfExtractedRow; endIndex: number } {
  const descriptionParts = [row.description];
  let endIndex = startIndex;
  const limit = lines.length;

  for (let index = startIndex + 1; index < limit; index += 1) {
    const line = lines[index] ?? "";
    if (
      detectSeparatedColumnLayout(line) ||
      /^(?:sub\s*total|grand\s+total|total|carried\s+forward|brought\s+forward)\b/i.test(line) ||
      parseSeparatedRow(line, layout) ||
      parseInlineRow(line, false) ||
      parseInlineRow(line, true) ||
      normalizeUnit(line) ||
      /^\s*[\d,.()]+\s*$/.test(normalizeDigits(line))
    ) {
      break;
    }

    const continuation = cleanDescription(
      line.replace(/\s*\|\s*/g, " ").replace(/\t+/g, " "),
    );
    if (!continuation) break;
    descriptionParts.push(continuation);
    endIndex = index;
  }

  return {
    row: {
      ...row,
      description: descriptionParts.join(" ").replace(/\s+/g, " ").trim(),
    },
    endIndex,
  };
}

function parseStackedRow(
  lines: string[],
  startIndex: number,
): { row: TenderCostingPdfExtractedRow; endIndex: number } | undefined {
  const start = new RegExp(`^\\s*${SERIAL_PREFIX}(?:\\s+(.+))?$`, "iu").exec(
    lines[startIndex] ?? "",
  );
  if (!start) return undefined;
  const itemNo = extractItemNo(lines[startIndex] ?? "");
  const descriptionParts = start[1] ? [start[1]] : [];
  const limit = lines.length;

  for (let index = startIndex + 1; index < limit; index += 1) {
    const line = lines[index] ?? "";
    const standaloneSerial = new RegExp(`^\\s*${SERIAL_PREFIX}\\s*$`, "iu").test(line);
    if (
      standaloneSerial &&
      descriptionParts.length > 0 &&
      !normalizeUnit(lines[index + 1] ?? "")
    ) {
      break;
    }

    const combined = parseInlineRow(
      mergedRowText(lines.slice(startIndex, index + 1)),
      false,
    );
    if (combined?.unit && combined.quantity) {
      return { row: combined, endIndex: index };
    }

    const unitAndQuantity = new RegExp(
      `^\\s*(${UNIT_CAPTURE})\\s+(${NUMBER_CAPTURE})(?:\\s+(.*))?$`,
      "iu",
    ).exec(line);
    if (unitAndQuantity) {
      const row = makeRow(
        descriptionParts.join(" "),
        unitAndQuantity[1],
        unitAndQuantity[2],
        itemNo,
      );
      return row ? { row, endIndex: index } : undefined;
    }
    const unit = normalizeUnit(line);
    if (unit) {
      const followingNumbers: number[] = [];
      let endIndex = index;
      for (let valueIndex = index + 1; valueIndex < Math.min(limit, index + 5); valueIndex += 1) {
        const values = numbersFrom(lines[valueIndex] ?? "");
        if (values.length === 0) break;
        followingNumbers.push(...values);
        endIndex = valueIndex;
      }
      const precedingNumbers = numbersFrom(lines[index - 1] ?? "");
      const quantity = followingNumbers[0] ?? precedingNumbers[0];
      const row = makeRow(
        descriptionParts.join(" "),
        unit,
        quantity === undefined ? undefined : String(quantity),
        itemNo,
      );
      return row ? { row, endIndex } : undefined;
    }
    if (cleanDescription(line)) descriptionParts.push(line);
  }
  return undefined;
}

interface PositionedPageParseResult {
  rows: TenderCostingPdfExtractedRow[];
  leadingDescription?: string;
}

interface TechnicalSpecificationLayout {
  itemX: number;
  itemNameBoundary: number;
  nameSpecificationBoundary: number;
}

interface DetectedTechnicalSpecificationLayout {
  layout: TechnicalSpecificationLayout;
  headerBottom: number;
}

function orderedPositionedText(items: PositionedText[]): string {
  return items
    .sort((left, right) => right.y - left.y || left.x - right.x)
    .map((item) => compactLine(item.str))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectTechnicalSpecificationLayout(
  items: PositionedText[],
): DetectedTechnicalSpecificationLayout | undefined {
  const visibleItems = items.filter((item) => item.str.trim());
  const nameHeader = visibleItems.find((item) =>
    /^name\s+of\s+goods$/i.test(compactLine(item.str)),
  );
  const specificationHeader = visibleItems.find((item) =>
    /^detailed\s+technical\s+specification/i.test(compactLine(item.str)),
  );
  if (!nameHeader || !specificationHeader || nameHeader.x >= specificationHeader.x) {
    return undefined;
  }
  const itemHeader = visibleItems
    .filter(
      (item) =>
        item.x < nameHeader.x &&
        /^(?:item|item\s+no\.?|sl\.?)$/i.test(compactLine(item.str)),
    )
    .sort((left, right) => right.y - left.y)[0];
  if (!itemHeader) return undefined;

  return {
    layout: {
      itemX: itemHeader.x,
      itemNameBoundary: (itemHeader.x + nameHeader.x) / 2,
      nameSpecificationBoundary: (nameHeader.x + specificationHeader.x) / 2,
    },
    headerBottom: Math.min(itemHeader.y, nameHeader.y, specificationHeader.y) - 2,
  };
}

function parsePositionedTechnicalSpecificationPage(
  items: PositionedText[],
  layout: TechnicalSpecificationLayout,
  headerBottom = Number.POSITIVE_INFINITY,
): TenderCostingPdfExtractedRow[] {
  const serialPattern = new RegExp(
    `^(?:Item\\s+)?${ITEM_NO_CAPTURE}\\s*[).:-]?$`,
    "iu",
  );
  const bodyItems = items.filter((item) => item.str.trim() && item.y < headerBottom);
  const anchors = bodyItems
    .filter(
      (item) =>
        item.x >= layout.itemX - 10 &&
        item.x < layout.itemNameBoundary &&
        serialPattern.test(item.str.trim()),
    )
    .sort((left, right) => right.y - left.y || left.x - right.x);

  return anchors.flatMap((anchor, index) => {
    const nextAnchor = anchors[index + 1];
    const name = orderedPositionedText(
      bodyItems.filter(
        (item) =>
          item.y <= anchor.y + 2 &&
          (!nextAnchor || item.y > nextAnchor.y + 2) &&
          item.x >= layout.itemNameBoundary &&
          item.x < layout.nameSpecificationBoundary,
      ),
    );
    const row = makeRow(name, undefined, undefined, anchor.str);
    return row ? [row] : [];
  });
}

interface PriceScheduleLayout {
  itemX: number;
  itemDescriptionBoundary: number;
  descriptionUnitBoundary: number;
  unitQuantityBoundary: number;
  quantityEndBoundary: number;
  descriptionContentX: number;
}

interface DetectedPriceScheduleLayout {
  layout: PriceScheduleLayout;
  headerBottom: number;
}

function detectPriceScheduleLayout(
  items: PositionedText[],
): DetectedPriceScheduleLayout | undefined {
  const visibleItems = items.filter((item) => item.str.trim());
  const hasGroupedBoqColumns =
    visibleItems.some((item) => /^group$/i.test(compactLine(item.str))) &&
    visibleItems.some((item) => /^code$/i.test(compactLine(item.str)));
  if (hasGroupedBoqColumns) return undefined;
  const descriptionHeader = visibleItems.find((item) =>
    /^description\s+of\s+(?:item|goods|works)$/i.test(compactLine(item.str)),
  );
  const quantityHeader = visibleItems.find((item) =>
    /^(?:quantity|qty)$/i.test(compactLine(item.str)),
  );
  if (!descriptionHeader || !quantityHeader || descriptionHeader.x >= quantityHeader.x) {
    return undefined;
  }
  const itemHeader = visibleItems
    .filter(
      (item) =>
        item.x < descriptionHeader.x &&
        /^(?:item|item\s+no\.?|sl\.?|serial)$/i.test(compactLine(item.str)),
    )
    .sort((left, right) => right.y - left.y)[0];
  const unitHeader = visibleItems
    .filter(
      (item) =>
        item.x > descriptionHeader.x &&
        item.x < quantityHeader.x &&
        /^(?:measurement|unit|uom)$/i.test(compactLine(item.str)),
    )
    .sort((left, right) => left.x - right.x)[0];
  if (!itemHeader || !unitHeader) return undefined;

  const nextHeader = visibleItems
    .filter(
      (item) =>
        item.x > quantityHeader.x + 5 &&
        Math.abs(item.y - quantityHeader.y) <= 24,
    )
    .sort((left, right) => left.x - right.x)[0];
  const itemDescriptionBoundary = (itemHeader.x + descriptionHeader.x) / 2;
  const descriptionUnitBoundary = (descriptionHeader.x + unitHeader.x) / 2;
  const unitQuantityBoundary = (unitHeader.x + quantityHeader.x) / 2;
  const headerBottom =
    Math.min(itemHeader.y, descriptionHeader.y, unitHeader.y, quantityHeader.y) - 2;
  const firstAnchor = visibleItems
    .filter(
      (item) =>
        item.y < headerBottom &&
        item.x >= itemHeader.x - 10 &&
        item.x < itemDescriptionBoundary &&
        new RegExp(`^(?:Item\\s+)?${ITEM_NO_CAPTURE}\\s*[).:-]?$`, "iu").test(
          item.str.trim(),
        ),
    )
    .sort((left, right) => right.y - left.y)[0];
  const descriptionContentX = firstAnchor
    ? visibleItems
        .filter(
          (item) =>
            item.y <= firstAnchor.y + 2 &&
            item.x >= itemDescriptionBoundary &&
            item.x < descriptionUnitBoundary,
        )
        .sort((left, right) => left.x - right.x)[0]?.x
    : undefined;

  return {
    layout: {
      itemX: itemHeader.x,
      itemDescriptionBoundary,
      descriptionUnitBoundary,
      unitQuantityBoundary,
      quantityEndBoundary: nextHeader
        ? (quantityHeader.x + nextHeader.x) / 2
        : Number.POSITIVE_INFINITY,
      descriptionContentX: descriptionContentX ?? itemDescriptionBoundary + 2,
    },
    headerBottom,
  };
}

function positionedColumnText(
  items: PositionedText[],
  contentX: number,
  tolerance = 5,
): string {
  const ordered = items
    .filter((item) => Math.abs(item.x - contentX) <= tolerance)
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const stopIndex = ordered.findIndex((item) =>
    /^(?:note\s+\d+\s*:|about\s+e-gp|copyright\b)/i.test(compactLine(item.str)),
  );
  return orderedPositionedText(stopIndex >= 0 ? ordered.slice(0, stopIndex) : ordered);
}

function positionedColumnRangeText(
  items: PositionedText[],
  startX: number,
  endX: number,
): string {
  const ordered = items
    .filter((item) => item.x >= startX && item.x < endX)
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const stopIndex = ordered.findIndex((item) =>
    /^(?:note\s+\d+\s*:|about\s+e-gp|copyright\b)/i.test(compactLine(item.str)),
  );
  return orderedPositionedText(stopIndex >= 0 ? ordered.slice(0, stopIndex) : ordered);
}

function parsePositionedPriceSchedulePage(
  items: PositionedText[],
  layout: PriceScheduleLayout,
  headerBottom = Number.POSITIVE_INFINITY,
): PositionedPageParseResult {
  const serialPattern = new RegExp(
    `^(?:Item\\s+)?${ITEM_NO_CAPTURE}\\s*[).:-]?$`,
    "iu",
  );
  const bodyItems = items.filter((item) => item.str.trim() && item.y < headerBottom);
  const anchors = bodyItems
    .filter(
      (item) =>
        item.x >= layout.itemX - 10 &&
        item.x < layout.itemDescriptionBoundary &&
        serialPattern.test(item.str.trim()),
    )
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const firstAnchorY = anchors[0]?.y;
  const leadingDescription = positionedColumnRangeText(
    bodyItems.filter(
      (item) => firstAnchorY === undefined || item.y > firstAnchorY + 2,
    ),
    layout.itemDescriptionBoundary,
    layout.descriptionUnitBoundary,
  );
  const rows = anchors.flatMap((anchor, index) => {
    const nextAnchor = anchors[index + 1];
    const rowItems = bodyItems.filter(
      (item) => item.y <= anchor.y + 2 && (!nextAnchor || item.y > nextAnchor.y + 2),
    );
    const description = positionedColumnRangeText(
      rowItems,
      layout.itemDescriptionBoundary,
      layout.descriptionUnitBoundary,
    );
    const unitText = orderedPositionedText(
      rowItems.filter(
        (item) =>
          item.x >= layout.descriptionUnitBoundary && item.x < layout.unitQuantityBoundary,
      ),
    );
    const quantityText = orderedPositionedText(
      rowItems.filter(
        (item) =>
          item.x >= layout.unitQuantityBoundary && item.x < layout.quantityEndBoundary,
      ),
    );
    const quantity = numbersFrom(quantityText)[0];
    const row = makeRow(
      description,
      unitText,
      quantity === undefined ? undefined : String(quantity),
      anchor.str,
    );
    return row ? [row] : [];
  });
  return { rows, ...(leadingDescription ? { leadingDescription } : {}) };
}

interface BillOfQuantitiesLayout {
  itemX: number;
  codeContentX?: number;
  descriptionContentX: number;
  unitContentX: number;
  quantityContentX: number;
}

interface DetectedBillOfQuantitiesLayout {
  layout: BillOfQuantitiesLayout;
  headerBottom: number;
}

function detectBillOfQuantitiesLayout(
  items: PositionedText[],
): DetectedBillOfQuantitiesLayout | undefined {
  const visibleItems = items.filter((item) => item.str.trim());
  const descriptionHeader = visibleItems.find((item) =>
    /^description\s+of\s+(?:item|goods|works)$/i.test(compactLine(item.str)),
  );
  const quantityHeader = visibleItems.find((item) =>
    /^(?:quantity|qty)$/i.test(compactLine(item.str)),
  );
  const measurementHeader = visibleItems.find((item) =>
    /^measurement$/i.test(compactLine(item.str)),
  );
  const itemHeader = visibleItems
    .filter(
      (item) =>
        descriptionHeader &&
        item.x < descriptionHeader.x &&
        /^(?:item|item\s+no\.?|sl\.?)$/i.test(compactLine(item.str)),
    )
    .sort((left, right) => right.y - left.y)[0];
  if (!descriptionHeader || !quantityHeader || !measurementHeader || !itemHeader) {
    return undefined;
  }
  const headerBottom =
    Math.min(itemHeader.y, descriptionHeader.y, measurementHeader.y, quantityHeader.y) - 2;
  const firstAnchor = visibleItems
    .filter(
      (item) =>
        item.y < headerBottom &&
        item.x >= itemHeader.x - 10 &&
        item.x < itemHeader.x + 16 &&
        new RegExp(`^${ITEM_NO_CAPTURE}$`, "iu").test(item.str.trim()),
    )
    .sort((left, right) => right.y - left.y)[0];
  if (!firstAnchor) return undefined;
  const firstLineItems = visibleItems
    .filter((item) => Math.abs(item.y - firstAnchor.y) <= 2 && item.x > firstAnchor.x)
    .sort((left, right) => left.x - right.x);
  const unitItem = firstLineItems.find((item) => Boolean(normalizeUnit(item.str)));
  const quantityItem = unitItem
    ? firstLineItems.find(
        (item) => item.x > unitItem.x && parseNonNegativeNumber(item.str) !== undefined,
      )
    : undefined;
  if (!unitItem || !quantityItem) return undefined;
  const textItems = firstLineItems.filter(
    (item) => item.x < unitItem.x && !/^(?:n\/?a)$/i.test(compactLine(item.str)),
  );
  const descriptionItem = textItems.at(-1);
  const codeItem = textItems.length > 1 ? textItems.at(-2) : undefined;
  if (!descriptionItem) return undefined;

  return {
    layout: {
      itemX: itemHeader.x,
      ...(codeItem ? { codeContentX: codeItem.x } : {}),
      descriptionContentX: descriptionItem.x,
      unitContentX: unitItem.x,
      quantityContentX: quantityItem.x,
    },
    headerBottom,
  };
}

function parsePositionedBillOfQuantitiesPage(
  items: PositionedText[],
  layout: BillOfQuantitiesLayout,
  headerBottom = Number.POSITIVE_INFINITY,
): PositionedPageParseResult {
  const bodyItems = items.filter((item) => item.str.trim() && item.y < headerBottom);
  const descriptionStartBoundary =
    ((layout.codeContentX ?? layout.itemX) + layout.descriptionContentX) / 2;
  const descriptionEndBoundary =
    (layout.descriptionContentX + layout.unitContentX) / 2;
  const serialPattern = new RegExp(`^${ITEM_NO_CAPTURE}$`, "iu");
  const anchors = bodyItems
    .filter(
      (item) =>
        item.x >= layout.itemX - 10 &&
        item.x < layout.itemX + 16 &&
        serialPattern.test(item.str.trim()),
    )
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const firstAnchorY = anchors[0]?.y;
  const leadingDescription = positionedColumnRangeText(
    bodyItems.filter(
      (item) => firstAnchorY === undefined || item.y > firstAnchorY + 2,
    ),
    descriptionStartBoundary,
    descriptionEndBoundary,
  );
  const rows = anchors.flatMap((anchor, index) => {
    const nextAnchor = anchors[index + 1];
    const rowItems = bodyItems.filter(
      (item) => item.y <= anchor.y + 2 && (!nextAnchor || item.y > nextAnchor.y + 2),
    );
    const description = positionedColumnRangeText(
      rowItems,
      descriptionStartBoundary,
      descriptionEndBoundary,
    );
    const unitText = positionedColumnText(rowItems, layout.unitContentX);
    const quantityText = positionedColumnText(rowItems, layout.quantityContentX);
    const quantity = numbersFrom(quantityText)[0];
    const row = makeRow(
      description,
      unitText,
      quantity === undefined ? undefined : String(quantity),
      anchor.str,
    );
    return row ? [row] : [];
  });
  return { rows, ...(leadingDescription ? { leadingDescription } : {}) };
}

function parsePositionedBoqPage(items: PositionedText[]): PositionedPageParseResult {
  const visibleItems = items.filter((item) => item.str.trim());
  const descriptionHeader = visibleItems.find((item) =>
    /^description\s+of\s+(?:item|goods|works)$/i.test(compactLine(item.str)),
  );
  const quantityHeader = visibleItems.find((item) =>
    /^(?:quantity|qty)$/i.test(compactLine(item.str)),
  );
  if (!descriptionHeader || !quantityHeader || descriptionHeader.x >= quantityHeader.x) {
    return { rows: [] };
  }

  const itemHeader = visibleItems
    .filter(
      (item) =>
        item.x < descriptionHeader.x &&
        /^(?:item|item\s+no\.?|sl\.?|serial)$/i.test(compactLine(item.str)),
    )
    .sort((left, right) => right.y - left.y)[0];
  const unitHeader = visibleItems
    .filter(
      (item) =>
        item.x > descriptionHeader.x &&
        item.x < quantityHeader.x &&
        /^(?:measurement|unit|uom)$/i.test(compactLine(item.str)),
    )
    .sort((left, right) => left.x - right.x)[0];
  if (!itemHeader || !unitHeader) return { rows: [] };

  const nextHeader = visibleItems
    .filter(
      (item) =>
        item.x > quantityHeader.x + 5 &&
        Math.abs(item.y - quantityHeader.y) <= 24,
    )
    .sort((left, right) => left.x - right.x)[0];
  const itemDescriptionBoundary = (itemHeader.x + descriptionHeader.x) / 2;
  const descriptionUnitBoundary = (descriptionHeader.x + unitHeader.x) / 2;
  const unitQuantityBoundary = (unitHeader.x + quantityHeader.x) / 2;
  const quantityEndBoundary = nextHeader
    ? (quantityHeader.x + nextHeader.x) / 2
    : Number.POSITIVE_INFINITY;
  const headerBottom =
    Math.min(itemHeader.y, descriptionHeader.y, unitHeader.y, quantityHeader.y) - 2;
  const bodyItems = visibleItems.filter((item) => item.y < headerBottom);
  const serialPattern = new RegExp(
    `^(?:Item\\s+)?${ITEM_NO_CAPTURE}\\s*[).:-]?$`,
    "iu",
  );
  const anchors = bodyItems
    .filter(
      (item) =>
        item.x >= itemHeader.x - 10 &&
        item.x < itemDescriptionBoundary &&
        serialPattern.test(compactLine(item.str)),
    )
    .sort((left, right) => right.y - left.y || left.x - right.x);
  if (anchors.length === 0) return { rows: [] };

  const inDescriptionColumn = (item: PositionedText) =>
    item.x >= itemDescriptionBoundary && item.x < descriptionUnitBoundary;
  const leadingDescription = orderedPositionedText(
    bodyItems.filter(
      (item) => item.y > (anchors[0]?.y ?? headerBottom) + 2 && inDescriptionColumn(item),
    ),
  );
  const rows = anchors.flatMap((anchor, index) => {
    const nextAnchor = anchors[index + 1];
    const rowItems = bodyItems.filter(
      (item) => item.y <= anchor.y + 2 && (!nextAnchor || item.y > nextAnchor.y + 2),
    );
    const description = orderedPositionedText(rowItems.filter(inDescriptionColumn));
    const unitText = orderedPositionedText(
      rowItems.filter(
        (item) => item.x >= descriptionUnitBoundary && item.x < unitQuantityBoundary,
      ),
    );
    const quantityText = orderedPositionedText(
      rowItems.filter(
        (item) => item.x >= unitQuantityBoundary && item.x < quantityEndBoundary,
      ),
    );
    const quantity = numbersFrom(quantityText)[0];
    const row = makeRow(
      description,
      unitText,
      quantity === undefined ? undefined : String(quantity),
      anchor.str,
    );
    return row ? [row] : [];
  });

  return {
    rows,
    ...(leadingDescription ? { leadingDescription } : {}),
  };
}

function pdfItemsToLines(items: PositionedText[]): string[] {
  const rows: Array<{ y: number; items: PositionedText[] }> = [];
  const sorted = items
    .filter((item) => item.str.trim())
    .sort((left, right) => right.y - left.y || left.x - right.x);
  for (const item of sorted) {
    const tolerance = Math.max(2, item.fontSize * 0.35);
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => {
      const ordered = row.items.sort((left, right) => left.x - right.x);
      let line = "";
      let previous: PositionedText | undefined;
      for (const item of ordered) {
        if (previous) {
          const gap = item.x - (previous.x + previous.width);
          const characterWidth = previous.width / Math.max(previous.str.length, 1);
          line += gap > Math.max(6, characterWidth * 1.8) ? "  " : " ";
        }
        line += item.str;
        previous = item;
      }
      return line.trim();
    })
    .filter(Boolean);
}

export function parseTenderCostingPdfText(rawText: string): TenderCostingPdfExtractedRow[] {
  const lines = rawText
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map(compactLine)
    .filter(Boolean);
  const rows: TenderCostingPdfExtractedRow[] = [];
  let separatedLayout: SeparatedColumnLayout | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const detectedLayout = detectSeparatedColumnLayout(line);
    if (detectedLayout) {
      separatedLayout = detectedLayout;
      continue;
    }
    if (/^(?:sub\s*total|grand\s+total|total|carried\s+forward|brought\s+forward)\b/i.test(line)) {
      continue;
    }
    const direct =
      parseSeparatedRow(line, separatedLayout) ??
      parseInlineRow(line, false) ??
      parseInlineRow(line, true);
    if (direct) {
      const extended = extendDescription(lines, index, direct, separatedLayout);
      rows.push(extended.row);
      index = extended.endIndex;
      continue;
    }
    const stacked = parseStackedRow(lines, index);
    if (stacked) {
      rows.push(stacked.row);
      index = stacked.endIndex;
    }
  }
  return rows;
}

export function hasValidTenderCostingPdfSignature(file: UploadedTenderCostingPdf): boolean {
  return file.buffer.length >= 5 && file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"));
}

function assertTenderCostingPdf(file: UploadedTenderCostingPdf) {
  if (!["application/pdf", "application/octet-stream"].includes(file.mimetype)) {
    throw new BadRequestException("Only PDF files are allowed");
  }
  if (file.size <= 0 || file.size > MAX_TENDER_COSTING_PDF_BYTES) {
    throw new BadRequestException("Each BOQ PDF must be 10 MB or smaller");
  }
  if (file.originalname.length > 255) {
    throw new BadRequestException("A BOQ PDF file name is too long");
  }
  if (!hasValidTenderCostingPdfSignature(file)) {
    throw new BadRequestException("The selected file is not a valid PDF");
  }
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new BadRequestException(message)), PDF_PARSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function extractTenderCostingPdfs(
  files: UploadedTenderCostingPdf[] | undefined,
): Promise<TenderCostingPdfExtractionResult> {
  if (!files?.length) throw new BadRequestException("Select at least one BOQ PDF to import");
  if (files.length > MAX_TENDER_COSTING_PDF_FILES) {
    throw new BadRequestException(
      `You can import up to ${MAX_TENDER_COSTING_PDF_FILES} BOQ PDFs at a time`,
    );
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TENDER_COSTING_PDF_TOTAL_BYTES) {
    throw new BadRequestException("The selected BOQ PDFs cannot exceed 50 MB in total");
  }

  const extractedRows: TenderCostingPdfExtractedRow[] = [];
  const fileResults: TenderCostingPdfFileResult[] = [];
  for (const file of files) {
    let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
    try {
      assertTenderCostingPdf(file);
      pdf = await withTimeout(
        getDocumentProxy(new Uint8Array(file.buffer), { maxImageSize: 16_777_216 }),
        `${file.originalname} took too long to open`,
      );
      if (pdf.numPages > MAX_TENDER_COSTING_PDF_PAGES) {
        throw new BadRequestException(
          `${file.originalname} cannot contain more than ${MAX_TENDER_COSTING_PDF_PAGES} pages`,
        );
      }
      const extracted = await withTimeout(
        extractTextItems(pdf),
        `${file.originalname} took too long to read`,
      );
      const pageTexts = extracted.items.map((pageItems) =>
        pdfItemsToLines(pageItems as PositionedText[]).join("\n"),
      );
      if (pageTexts.join(" ").replace(/\s+/g, " ").trim().length < 20) {
        throw new BadRequestException(
          `${file.originalname} has no readable text. Scanned image PDFs need OCR`,
        );
      }
      const rows: TenderCostingPdfExtractedRow[] = [];
      let technicalSpecificationLayout: TechnicalSpecificationLayout | undefined;
      let priceScheduleLayout: PriceScheduleLayout | undefined;
      let billOfQuantitiesLayout: BillOfQuantitiesLayout | undefined;
      extracted.items.forEach((pageItems, pageIndex) => {
        const detectedTechnicalLayout = detectTechnicalSpecificationLayout(
          pageItems as PositionedText[],
        );
        if (detectedTechnicalLayout) {
          technicalSpecificationLayout = detectedTechnicalLayout.layout;
        }
        if (technicalSpecificationLayout) {
          rows.push(
            ...parsePositionedTechnicalSpecificationPage(
              pageItems as PositionedText[],
              technicalSpecificationLayout,
              detectedTechnicalLayout?.headerBottom,
            ),
          );
          return;
        }
        const detectedPriceScheduleLayout = detectPriceScheduleLayout(
          pageItems as PositionedText[],
        );
        if (detectedPriceScheduleLayout) {
          priceScheduleLayout = detectedPriceScheduleLayout.layout;
        }
        if (priceScheduleLayout) {
          const positioned = parsePositionedPriceSchedulePage(
            pageItems as PositionedText[],
            priceScheduleLayout,
            detectedPriceScheduleLayout?.headerBottom,
          );
          if (positioned.leadingDescription && rows.length > 0) {
            const previous = rows[rows.length - 1];
            if (previous) {
              previous.description = `${previous.description} ${positioned.leadingDescription}`
                .replace(/\s+/g, " ")
                .trim();
            }
          }
          rows.push(...positioned.rows);
          return;
        }
        const detectedBillOfQuantitiesLayout = detectBillOfQuantitiesLayout(
          pageItems as PositionedText[],
        );
        if (detectedBillOfQuantitiesLayout) {
          billOfQuantitiesLayout = detectedBillOfQuantitiesLayout.layout;
        }
        if (billOfQuantitiesLayout) {
          const positioned = parsePositionedBillOfQuantitiesPage(
            pageItems as PositionedText[],
            billOfQuantitiesLayout,
            detectedBillOfQuantitiesLayout?.headerBottom,
          );
          if (positioned.leadingDescription && rows.length > 0) {
            const previous = rows[rows.length - 1];
            if (previous) {
              previous.description = `${previous.description} ${positioned.leadingDescription}`
                .replace(/\s+/g, " ")
                .trim();
            }
          }
          rows.push(...positioned.rows);
          return;
        }
        const positioned = parsePositionedBoqPage(pageItems as PositionedText[]);
        if (positioned.leadingDescription && rows.length > 0) {
          const previous = rows[rows.length - 1];
          if (previous) {
            previous.description = `${previous.description} ${positioned.leadingDescription}`
              .replace(/\s+/g, " ")
              .trim();
          }
        }
        if (positioned.rows.length > 0) {
          rows.push(...positioned.rows);
          return;
        }
        rows.push(...parseTenderCostingPdfText(pageTexts[pageIndex] ?? ""));
      });
      if (rows.length === 0) {
        throw new BadRequestException(
          `No product rows were found in ${file.originalname}. Use a BOQ or price schedule PDF`,
        );
      }
      extractedRows.push(...rows);
      fileResults.push({
        fileName: file.originalname,
        totalPages: extracted.totalPages,
        extractedRowCount: rows.length,
      });
    } catch (error) {
      fileResults.push({
        fileName: file.originalname,
        totalPages: pdf?.numPages ?? 0,
        extractedRowCount: 0,
        error: error instanceof Error ? error.message : "This BOQ PDF could not be read",
      });
    } finally {
      await pdf?.destroy().catch(() => undefined);
    }
  }

  const rows = extractedRows;
  if (rows.length === 0) {
    const firstError = fileResults.find((file) => file.error)?.error;
    throw new BadRequestException(firstError ?? "No product rows were found in the selected PDFs");
  }
  return {
    rows,
    files: fileResults,
    totalPages: fileResults.reduce((total, file) => total + file.totalPages, 0),
    duplicateRowsSkipped: 0,
  };
}
