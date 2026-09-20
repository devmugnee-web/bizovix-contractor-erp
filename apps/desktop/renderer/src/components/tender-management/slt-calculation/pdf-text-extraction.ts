export interface PdfPositionedText {
  text: string;
  x: number;
  y: number;
  width: number;
}

export interface PdfPositionedPage {
  width: number;
  height: number;
  items: PdfPositionedText[];
}

export interface ExtractedTenderRow {
  serial: string;
  name: string;
  amount: string;
}

interface DetectedColumns {
  serialNameBoundaryRatio: number;
  nameAmountBoundaryRatio: number;
  headerBottomY: number;
}

const OPENING_HEADER = "opening report header";
const OPENING_FOOTER = "opening report footer";
const MONEY_TOKEN_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

export function extractOpeningReportTable(pages: PdfPositionedPage[]): ExtractedTenderRow[] {
  const headerPageIndex = pages.findIndex((page) => hasSectionLabel(page, OPENING_HEADER));
  if (headerPageIndex < 0) return [];
  const headerPage = pages[headerPageIndex];
  if (!headerPage) return [];
  const columns = detectColumns(headerPage);
  if (!columns) return [];

  const rows: ExtractedTenderRow[] = [];
  let expectedSerial = 1;
  for (let pageIndex = headerPageIndex; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (!page) continue;
    const header = findSectionLabel(page, OPENING_HEADER);
    const footer = findSectionLabel(page, OPENING_FOOTER);
    const pageRows = detectRows(
      page,
      columns.serialNameBoundaryRatio,
      columns.nameAmountBoundaryRatio,
      pageIndex === headerPageIndex ? columns.headerBottomY : page.height,
      footer?.y ?? 0,
      expectedSerial,
    );
    for (const row of pageRows) {
      if (Number(row.serial) !== expectedSerial) continue;
      rows.push(row);
      expectedSerial += 1;
    }
    if (footer || (header && pageIndex !== headerPageIndex)) break;
  }
  return rows;
}

function detectColumns(page: PdfPositionedPage): DetectedColumns | null {
  const header = findSectionLabel(page, OPENING_HEADER);
  if (!header) return null;
  let markers = page.items
    .map((item) => ({ item, column: parseColumnMarker(item.text) }))
    .filter((entry): entry is { item: PdfPositionedText; column: number } => entry.column !== null)
    .filter((entry) => entry.item.y < header.y);

  if (![1, 2, 3, 6].every((column) => markers.some((entry) => entry.column === column))) {
    const splitLine = groupItemsIntoLines(page.items)
      .filter((line) => (line[0]?.y ?? Number.POSITIVE_INFINITY) < header.y)
      .map((line) =>
        line
          .map((item) => ({ item, column: parseBareColumnMarker(item.text) }))
          .filter(
            (entry): entry is { item: PdfPositionedText; column: number } => entry.column !== null,
          ),
      )
      .filter((line) =>
        [1, 2, 3, 6].every((column) => line.some((entry) => entry.column === column)),
      )
      .sort((left, right) => (right[0]?.item.y ?? 0) - (left[0]?.item.y ?? 0))[0];
    if (splitLine) markers = splitLine;
  }

  const marker1 = markers.find((entry) => entry.column === 1)?.item;
  const marker2 = markers.find((entry) => entry.column === 2)?.item;
  const marker3 = markers.find((entry) => entry.column === 3)?.item;
  const marker6 = markers.find((entry) => entry.column === 6)?.item;
  if (!marker1 || !marker2 || !marker3 || !marker6) return detectSemanticColumns(page, header);
  const center1 = centerX(marker1);
  const center2 = centerX(marker2);
  const center3 = centerX(marker3);
  if (!(center1 < center2 && center2 < center3 && center3 < centerX(marker6))) return null;
  return {
    serialNameBoundaryRatio: midpoint(center1, center2) / page.width,
    nameAmountBoundaryRatio: midpoint(center2, center3) / page.width,
    headerBottomY: Math.min(...markers.map((entry) => entry.item.y)) - 1,
  };
}

function detectSemanticColumns(
  page: PdfPositionedPage,
  sectionHeader: PdfPositionedText,
): DetectedColumns | null {
  const band = page.items.filter(
    (item) => item.y < sectionHeader.y && item.y > sectionHeader.y - page.height * 0.18,
  );
  const serial = findSectionLabel(page, "s no") ?? findHeaderAnchor(band, ["s", "no"]);
  const name =
    findSectionLabel(page, "name of tenderer") ??
    findSectionLabel(page, "name of bidder") ??
    findHeaderAnchor(band, ["tenderer", "bidder"]);
  const amount =
    findSectionLabel(page, "quoted amount in bdt without discount") ??
    findHeaderAnchor(band, ["without discount"]) ??
    findSectionLabel(page, "bidding amount");
  const finalAmount =
    findSectionLabel(page, "quoted amount in bdt with discount") ??
    findHeaderAnchor(band, ["with discount"]);
  if (!serial || !name || !amount || !finalAmount) return null;
  if (!(
    centerX(serial) < centerX(name) &&
    centerX(name) < centerX(amount) &&
    centerX(amount) < centerX(finalAmount)
  ))
    return null;
  const multiline =
    normalizeLabel(amount.text) === "without discount" ||
    normalizeLabel(finalAmount.text) === "with discount";
  return {
    serialNameBoundaryRatio:
      (multiline ? name.x : midpoint(serial.x + serial.width, name.x)) / page.width,
    nameAmountBoundaryRatio:
      (multiline ? amount.x : midpoint(name.x + name.width, amount.x)) / page.width,
    headerBottomY: Math.min(serial.y, name.y, amount.y, finalAmount.y) - 1,
  };
}

function detectRows(
  page: PdfPositionedPage,
  serialNameRatio: number,
  nameAmountRatio: number,
  upperY: number,
  lowerY: number,
  expectedSerial: number,
): ExtractedTenderRow[] {
  const serialBoundary = page.width * serialNameRatio;
  const nameBoundary = page.width * nameAmountRatio;
  const scoped = page.items.filter((item) => item.y < upperY && item.y > lowerY);
  const serials = scoped
    .filter((item) => centerX(item) < serialBoundary && isPositiveInteger(item.text))
    .filter((item) => Number(item.text.trim()) >= expectedSerial)
    .sort((left, right) => right.y - left.y);

  return serials.flatMap((serial, index) => {
    const previous = serials[index - 1];
    const next = serials[index + 1];
    const top = previous
      ? midpoint(previous.y, serial.y)
      : serial.y + estimateRowPadding(serials, index);
    const bottom = next
      ? midpoint(serial.y, next.y)
      : serial.y - estimateRowPadding(serials, index);
    const rowItems = scoped.filter((item) => item.y <= top && item.y > bottom);
    const name = rowItems
      .filter((item) => centerX(item) >= serialBoundary && centerX(item) < nameBoundary)
      .sort(readingOrder)
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = rowItems
      .filter((item) => item.x + item.width > nameBoundary)
      .sort((left, right) => left.x - right.x)
      .flatMap((item) => item.text.match(MONEY_TOKEN_PATTERN) ?? [])
      .map((value) => value.replace(/,/g, ""))
      .filter((value) => /^\d+(?:\.\d+)?$/.test(value));
    const amount = tokens.at(-1) ?? "";
    return name && amount ? [{ serial: serial.text.trim(), name, amount }] : [];
  });
}

function findSectionLabel(page: PdfPositionedPage, label: string) {
  const direct = page.items.find((item) => normalizeLabel(item.text).includes(label));
  if (direct) return direct;
  const target = label.split(" ");
  for (const line of groupItemsIntoLines(page.items)) {
    const ordered = [...line].sort((left, right) => left.x - right.x);
    if (
      !containsWordsInOrder(
        normalizeLabel(ordered.map((item) => item.text).join(" ")).split(" "),
        target,
      )
    )
      continue;
    return {
      text: ordered.map((item) => item.text).join(" "),
      x: Math.min(...ordered.map((item) => item.x)),
      y: ordered.reduce((sum, item) => sum + item.y, 0) / ordered.length,
      width:
        Math.max(...ordered.map((item) => item.x + item.width)) -
        Math.min(...ordered.map((item) => item.x)),
    };
  }
  return undefined;
}

function findHeaderAnchor(items: PdfPositionedText[], labels: string[]) {
  return items.find((item) => labels.some((label) => normalizeLabel(item.text).includes(label)));
}
function groupItemsIntoLines(items: PdfPositionedText[]) {
  const lines: PdfPositionedText[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs((candidate[0]?.y ?? item.y) - item.y) <= 3);
    if (line) line.push(item);
    else lines.push([item]);
  }
  return lines;
}
function containsWordsInOrder(words: string[], target: string[]) {
  let index = 0;
  for (const word of words) {
    if (word === target[index]) index += 1;
    if (index === target.length) return true;
  }
  return false;
}
function hasSectionLabel(page: PdfPositionedPage, label: string) {
  return Boolean(findSectionLabel(page, label));
}
function parseColumnMarker(value: string) {
  const match = value.trim().match(/^\(([1-6])\)/);
  return match ? Number(match[1]) : null;
}
function parseBareColumnMarker(value: string) {
  const match = value.trim().match(/^([1-6])$/);
  return match ? Number(match[1]) : null;
}
function isPositiveInteger(value: string) {
  return /^\d+$/.test(value.trim()) && Number(value) > 0;
}
function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function centerX(item: PdfPositionedText) {
  return item.x + item.width / 2;
}
function midpoint(left: number, right: number) {
  return (left + right) / 2;
}
function readingOrder(left: PdfPositionedText, right: PdfPositionedText) {
  return right.y - left.y || left.x - right.x;
}
function estimateRowPadding(items: PdfPositionedText[], index: number) {
  const adjacent = items[index + 1] ?? items[index - 1];
  const current = items[index];
  return current && adjacent ? Math.max(8, Math.abs(current.y - adjacent.y) / 2) : 14;
}
