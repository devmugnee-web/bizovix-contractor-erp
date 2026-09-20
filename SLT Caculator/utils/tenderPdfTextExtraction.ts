export interface PdfPositionedText {
  text: string
  x: number
  y: number
  width: number
}

export interface PdfPositionedPage {
  width: number
  height: number
  items: PdfPositionedText[]
}

export interface ExtractedTenderRow {
  serial: string
  name: string
  amount: string
}

interface DetectedColumns {
  serialNameBoundaryRatio: number
  nameAmountBoundaryRatio: number
  headerBottomY: number
}

const OPENING_HEADER = "opening report header"
const OPENING_FOOTER = "opening report footer"
const MONEY_TOKEN_PATTERN = /\d[\d,]*(?:\.\d+)?/g

export function extractOpeningReportTable(pages: PdfPositionedPage[]): ExtractedTenderRow[] {
  const headerPageIndex = pages.findIndex((page) => hasSectionLabel(page, OPENING_HEADER))
  if (headerPageIndex < 0) return []

  const columns = detectColumns(pages[headerPageIndex])
  if (!columns) return []

  const rows: ExtractedTenderRow[] = []
  let expectedSerial = 1

  for (let pageIndex = headerPageIndex; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex]
    const header = findSectionLabel(page, OPENING_HEADER)
    const footer = findSectionLabel(page, OPENING_FOOTER)
    const upperY = pageIndex === headerPageIndex ? columns.headerBottomY : page.height
    const lowerY = footer?.y ?? 0
    const pageRows = detectRows(
      page,
      columns.serialNameBoundaryRatio,
      columns.nameAmountBoundaryRatio,
      upperY,
      lowerY,
      expectedSerial
    )

    for (const row of pageRows) {
      if (Number(row.serial) !== expectedSerial) continue
      rows.push(row)
      expectedSerial += 1
    }

    if (footer) break
    if (header && pageIndex !== headerPageIndex) break
  }

  return rows
}

function detectColumns(page: PdfPositionedPage): DetectedColumns | null {
  const header = findSectionLabel(page, OPENING_HEADER)
  if (!header) return null

  let markers = page.items
    .map((item) => ({ item, column: parseColumnMarker(item.text) }))
    .filter((entry): entry is { item: PdfPositionedText; column: number } => entry.column !== null)
    .filter((entry) => entry.item.y < header.y)

  if (![1, 2, 3, 6].every((column) => markers.some((entry) => entry.column === column))) {
    const splitMarkerLine = groupItemsIntoLines(page.items)
      .filter((line) => line[0].y < header.y)
      .map((line) => line
        .map((item) => ({ item, column: parseBareColumnMarker(item.text) }))
        .filter((entry): entry is { item: PdfPositionedText; column: number } => entry.column !== null))
      .filter((line) => [1, 2, 3, 6].every((column) => line.some((entry) => entry.column === column)))
      .sort((left, right) => right[0].item.y - left[0].item.y)[0]

    if (splitMarkerLine) markers = splitMarkerLine
  }

  const marker1 = markers.find((entry) => entry.column === 1)?.item
  const marker2 = markers.find((entry) => entry.column === 2)?.item
  const marker3 = markers.find((entry) => entry.column === 3)?.item
  const marker6 = markers.find((entry) => entry.column === 6)?.item

  if (!marker1 || !marker2 || !marker3 || !marker6) {
    return detectSemanticColumns(page, header)
  }

  const center1 = centerX(marker1)
  const center2 = centerX(marker2)
  const center3 = centerX(marker3)

  if (!(center1 < center2 && center2 < center3 && center3 < centerX(marker6))) return null

  return {
    serialNameBoundaryRatio: midpoint(center1, center2) / page.width,
    nameAmountBoundaryRatio: midpoint(center2, center3) / page.width,
    headerBottomY: Math.min(...markers.map((entry) => entry.item.y)) - 1
  }
}

function detectSemanticColumns(page: PdfPositionedPage, sectionHeader: PdfPositionedText): DetectedColumns | null {
  const headerBand = page.items.filter((item) => item.y < sectionHeader.y && item.y > sectionHeader.y - page.height * 0.18)
  const serialHeader = findSectionLabel(page, "s no")
    ?? findHeaderAnchor(headerBand, ["s", "no"])
  const nameHeader = findSectionLabel(page, "name of tenderer")
    ?? findSectionLabel(page, "name of bidder")
    ?? findHeaderAnchor(headerBand, ["tenderer", "bidder"])
  const firstAmountHeader = findSectionLabel(page, "quoted amount in bdt without discount")
    ?? findHeaderAnchor(headerBand, ["without discount"])
    ?? findSectionLabel(page, "bidding amount")
  const finalAmountHeader = findSectionLabel(page, "quoted amount in bdt with discount")
    ?? findHeaderAnchor(headerBand, ["with discount"])

  if (!serialHeader || !nameHeader || !firstAmountHeader || !finalAmountHeader) return null
  if (![serialHeader, nameHeader, firstAmountHeader, finalAmountHeader].every((item) => item.y < sectionHeader.y)) return null

  const nameCenter = centerX(nameHeader)
  const firstAmountCenter = centerX(firstAmountHeader)
  const finalAmountCenter = centerX(finalAmountHeader)
  if (!(centerX(serialHeader) < nameCenter && nameCenter < firstAmountCenter && firstAmountCenter < finalAmountCenter)) return null

  const multilineHeaders = normalizeLabel(firstAmountHeader.text) === "without discount"
    || normalizeLabel(finalAmountHeader.text) === "with discount"

  return {
    serialNameBoundaryRatio: (multilineHeaders
      ? nameHeader.x
      : midpoint(serialHeader.x + serialHeader.width, nameHeader.x)) / page.width,
    nameAmountBoundaryRatio: (multilineHeaders
      ? firstAmountHeader.x
      : midpoint(nameHeader.x + nameHeader.width, firstAmountHeader.x)) / page.width,
    headerBottomY: Math.min(serialHeader.y, nameHeader.y, firstAmountHeader.y, finalAmountHeader.y) - 1
  }
}

function findHeaderAnchor(items: PdfPositionedText[], labels: string[]) {
  return items.find((item) => {
    const normalized = normalizeLabel(item.text)
    return labels.some((label) => normalized === label || normalized.includes(label))
  })
}

function detectRows(
  page: PdfPositionedPage,
  serialNameBoundaryRatio: number,
  nameAmountBoundaryRatio: number,
  upperY: number,
  lowerY: number,
  expectedSerial: number
): ExtractedTenderRow[] {
  const serialBoundary = page.width * serialNameBoundaryRatio
  const nameBoundary = page.width * nameAmountBoundaryRatio
  const scopedItems = page.items.filter((item) => item.y < upperY && item.y > lowerY)
  const serialItems = scopedItems
    .filter((item) => centerX(item) < serialBoundary && isPositiveInteger(item.text))
    .filter((item) => Number(item.text.trim()) >= expectedSerial)
    .sort((left, right) => right.y - left.y)

  return serialItems.flatMap((serialItem, index) => {
    const previous = serialItems[index - 1]
    const next = serialItems[index + 1]
    const rowTop = previous ? midpoint(previous.y, serialItem.y) : serialItem.y + estimateRowPadding(serialItems, index)
    const rowBottom = next ? midpoint(serialItem.y, next.y) : serialItem.y - estimateRowPadding(serialItems, index)
    const rowItems = scopedItems.filter((item) => item.y <= rowTop && item.y > rowBottom)
    const name = rowItems
      .filter((item) => centerX(item) >= serialBoundary && centerX(item) < nameBoundary)
      .sort(readingOrder)
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
    const monetaryTokens = rowItems
      .filter((item) => item.x + item.width > nameBoundary)
      .sort((left, right) => left.x - right.x)
      .flatMap((item) => item.text.match(MONEY_TOKEN_PATTERN) ?? [])
      .map(normalizeMoneyToken)
      .filter(Boolean)
    const amount = monetaryTokens.at(-1) ?? ""

    return name && amount ? [{ serial: serialItem.text.trim(), name, amount }] : []
  })
}

function findSectionLabel(page: PdfPositionedPage, label: string) {
  const directMatch = page.items.find((item) => normalizeLabel(item.text).includes(label))
  if (directMatch) return directMatch

  const targetWords = label.split(" ")
  const lines = groupItemsIntoLines(page.items)

  for (const line of lines) {
    const ordered = [...line].sort((left, right) => left.x - right.x)
    const normalized = normalizeLabel(ordered.map((item) => item.text).join(" "))
    if (!containsWordsInOrder(normalized.split(" "), targetWords)) continue

    return {
      text: ordered.map((item) => item.text).join(" "),
      x: Math.min(...ordered.map((item) => item.x)),
      y: ordered.reduce((sum, item) => sum + item.y, 0) / ordered.length,
      width: Math.max(...ordered.map((item) => item.x + item.width)) - Math.min(...ordered.map((item) => item.x))
    }
  }

  return undefined
}

function hasSectionLabel(page: PdfPositionedPage, label: string) {
  return Boolean(findSectionLabel(page, label))
}

function parseColumnMarker(value: string): number | null {
  const match = value.trim().match(/^\(([1-6])\)/)
  if (!match) return null
  const column = Number(match[1])
  return column >= 1 && column <= 6 ? column : null
}

function parseBareColumnMarker(value: string): number | null {
  const match = value.trim().match(/^([1-6])$/)
  return match ? Number(match[1]) : null
}

function groupItemsIntoLines(items: PdfPositionedText[]) {
  const lines: PdfPositionedText[][] = []
  const ordered = [...items].sort((left, right) => (right.y - left.y) || (left.x - right.x))

  for (const item of ordered) {
    const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= 3)
    if (line) line.push(item)
    else lines.push([item])
  }

  return lines
}

function containsWordsInOrder(words: string[], target: string[]) {
  let targetIndex = 0
  for (const word of words) {
    if (word === target[targetIndex]) targetIndex += 1
    if (targetIndex === target.length) return true
  }
  return false
}

function normalizeMoneyToken(value: string) {
  const normalized = value.replace(/,/g, "")
  return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : ""
}

function isPositiveInteger(value: string) {
  return /^\d+$/.test(value.trim()) && Number(value) > 0
}

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function centerX(item: PdfPositionedText) {
  return item.x + item.width / 2
}

function midpoint(left: number, right: number) {
  return (left + right) / 2
}

function readingOrder(left: PdfPositionedText, right: PdfPositionedText) {
  return (right.y - left.y) || (left.x - right.x)
}

function estimateRowPadding(items: PdfPositionedText[], index: number) {
  const adjacent = items[index + 1] ?? items[index - 1]
  return adjacent ? Math.max(8, Math.abs(items[index].y - adjacent.y) / 2) : 14
}
