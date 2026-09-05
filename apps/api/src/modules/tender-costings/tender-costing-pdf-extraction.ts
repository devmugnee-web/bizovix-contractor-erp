import { BadRequestException } from "@nestjs/common";
import type {
  TenderCostingPdfExtractedRow,
  TenderCostingPdfExtractionResult,
  TenderCostingPdfFileResult,
} from "@bizovix/types";
import { extractTextItems, getDocumentProxy } from "unpdf";

export const MAX_TENDER_COSTING_PDF_FILES = 10;
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
const SERIAL_PREFIX = "(?:Item\\s+)?[0-9০-৯]+(?:\\.[0-9০-৯]+)*\\s*[).:-]?";

function normalizeDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit] ?? digit);
}

function compactLine(value: string): string {
  return normalizeDigits(value)
    .replace(/\u00a0/g, " ")
    .replace(/[ ]+/g, " ")
    .trim();
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
    .replace(new RegExp(`^${SERIAL_PREFIX}\\s+`, "i"), "")
    .replace(/^[-:;,.\s]+|[-:;,.\s]+$/g, "")
    .slice(0, 500)
    .trim();
  if (description.length < 2 || !/[\p{L}]/u.test(description)) return undefined;
  if (
    /^(?:sl\.?\s*(?:no\.?)?|item\s*(?:no\.?)?|description(?:\s+of\s+(?:goods|works|item))?|product(?:\s*\/\s*work)?(?:\s+name)?|unit|uom|qty|quantity|unit\s+(?:price|rate)|rate|amount|total(?:\s+price)?|grand\s+total|subtotal|carried\s+forward|brought\s+forward)$/i.test(
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
  trailingValue = "",
): TenderCostingPdfExtractedRow | undefined {
  const description = cleanDescription(descriptionValue);
  if (!description) return undefined;
  const unit = unitValue ? normalizeUnit(unitValue) : undefined;
  const parsedQuantity = parseNonNegativeNumber(quantityValue);
  const quantity = parsedQuantity && parsedQuantity > 0 ? parsedQuantity : undefined;
  const prices = numbersFrom(trailingValue);
  const unitPrice = prices[0] && prices[0] > 0 ? prices[0] : undefined;
  const totalPrice = prices[1] && prices[1] > 0 ? prices[1] : undefined;
  return {
    description,
    ...(unit ? { unit } : {}),
    ...(quantity ? { quantity } : {}),
    ...(unitPrice ? { unitPrice } : {}),
    ...(totalPrice ? { totalPrice } : {}),
  };
}

function parseSeparatedRow(line: string): TenderCostingPdfExtractedRow | undefined {
  const cells = line
    .split(/\t+|\s*\|\s*|\s{2,}/)
    .map(compactLine)
    .filter(Boolean);
  if (cells.length < 3) return undefined;
  const unitIndex = cells.findIndex((cell) => Boolean(normalizeUnit(cell)));
  if (unitIndex < 1) return undefined;

  const beforeUnit = cells.slice(0, unitIndex);
  const first = beforeUnit[0] ?? "";
  const hasSerial = new RegExp(`^${SERIAL_PREFIX}(?:\\s+|$)`, "i").test(first);
  const descriptionCells = [...beforeUnit];
  if (hasSerial) {
    const withoutSerial = first.replace(new RegExp(`^${SERIAL_PREFIX}\\s*`, "i"), "");
    descriptionCells.splice(0, 1, withoutSerial);
  }
  const afterUnit = cells.slice(unitIndex + 1);
  const numericValues = afterUnit.flatMap(numbersFrom);
  if (numericValues.length === 0) return undefined;
  return makeRow(
    descriptionCells.join(" "),
    cells[unitIndex],
    String(numericValues[0]),
    numericValues.slice(1).join(" "),
  );
}

function parseInlineRow(
  line: string,
  allowWithoutSerial: boolean,
): TenderCostingPdfExtractedRow | undefined {
  const serialQuantityUnit = new RegExp(
    `^\\s*${SERIAL_PREFIX}\\s+(.+?)\\s+(${NUMBER_CAPTURE})\\s+(${UNIT_CAPTURE})(?:\\s+(.*))?$`,
    "iu",
  ).exec(line);
  if (serialQuantityUnit) {
    return makeRow(
      serialQuantityUnit[1] ?? "",
      serialQuantityUnit[3],
      serialQuantityUnit[2],
      serialQuantityUnit[4],
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
      serialUnitQuantity[4],
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
      quantityUnit[4],
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
        unitQuantity[4],
      )
    : undefined;
}

function parseStackedRow(
  lines: string[],
  startIndex: number,
): { row: TenderCostingPdfExtractedRow; endIndex: number } | undefined {
  const start = new RegExp(`^\\s*${SERIAL_PREFIX}(?:\\s+(.+))?$`, "iu").exec(
    lines[startIndex] ?? "",
  );
  if (!start) return undefined;
  const descriptionParts = start[1] ? [start[1]] : [];
  const limit = Math.min(lines.length, startIndex + 10);

  for (let index = startIndex + 1; index < limit; index += 1) {
    const line = lines[index] ?? "";
    if (new RegExp(`^\\s*${SERIAL_PREFIX}\\s*$`, "iu").test(line)) break;
    const unitAndQuantity = new RegExp(
      `^\\s*(${UNIT_CAPTURE})\\s+(${NUMBER_CAPTURE})(?:\\s+(.*))?$`,
      "iu",
    ).exec(line);
    if (unitAndQuantity) {
      const row = makeRow(
        descriptionParts.join(" "),
        unitAndQuantity[1],
        unitAndQuantity[2],
        unitAndQuantity[3],
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
      const row = makeRow(
        descriptionParts.join(" "),
        unit,
        followingNumbers[0] === undefined ? undefined : String(followingNumbers[0]),
        followingNumbers.slice(1).join(" "),
      );
      return row ? { row, endIndex } : undefined;
    }
    if (cleanDescription(line)) descriptionParts.push(line);
  }
  return undefined;
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

function rowKey(row: TenderCostingPdfExtractedRow): string {
  return [
    row.description.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""),
    row.unit?.toLocaleLowerCase() ?? "",
    row.quantity ?? "",
  ].join("|");
}

export function parseTenderCostingPdfText(rawText: string): TenderCostingPdfExtractedRow[] {
  const lines = rawText
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map(compactLine)
    .filter(Boolean);
  const tableLikely =
    /bill\s+of\s+quantit|price\s+schedule|schedule\s+of\s+requirements|item\s+description|description\s+of\s+(?:goods|works|item)|product\s*(?:\/\s*work)?\s+name|\bqty\b|\bquantity\b/i.test(
      rawText,
    );
  const rows: TenderCostingPdfExtractedRow[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^(?:sub\s*total|grand\s+total|total|carried\s+forward|brought\s+forward)\b/i.test(line)) {
      continue;
    }
    const direct = parseSeparatedRow(line) ?? parseInlineRow(line, tableLikely);
    if (direct) {
      rows.push(direct);
      continue;
    }
    const stacked = parseStackedRow(lines, index);
    if (stacked) {
      rows.push(stacked.row);
      index = stacked.endIndex;
    }
  }
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = rowKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
      const rows = pageTexts.flatMap(parseTenderCostingPdfText);
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

  const seen = new Set<string>();
  let duplicateRowsSkipped = 0;
  const rows = extractedRows.filter((row) => {
    const key = rowKey(row);
    if (seen.has(key)) {
      duplicateRowsSkipped += 1;
      return false;
    }
    seen.add(key);
    return true;
  });
  if (rows.length === 0) {
    const firstError = fileResults.find((file) => file.error)?.error;
    throw new BadRequestException(firstError ?? "No product rows were found in the selected PDFs");
  }
  return {
    rows,
    files: fileResults,
    totalPages: fileResults.reduce((total, file) => total + file.totalPages, 0),
    duplicateRowsSkipped,
  };
}
