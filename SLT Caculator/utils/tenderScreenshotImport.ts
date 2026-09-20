import { createWorker, OEM, PSM } from "tesseract.js"

import type { BidderRow, ImportedBidderRow, ScreenshotImportMode } from "@/types"
import { normalizeNumericInput, parseNumber } from "@/utils/calculator"
import { extractOpeningReportTable, type PdfPositionedPage } from "@/utils/tenderPdfTextExtraction"

export interface CropRegion {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  scaleFactor: number
  threshold: number
}

export interface OCRProgressUpdate {
  variant: OCRVariant
  progress: number
  status: string
}

export interface OCRTextResult {
  confidence: number
  text: string
  lines: OCRLineResult[]
  words?: OCRWordResult[]
}

type OCRVariant = "names" | "amounts"

interface OCRLineResult {
  confidence: number
  text: string
  x0: number
  x1: number
  y0: number
  y1: number
}

interface OCRWordResult {
  confidence: number
  text: string
  x0: number
  x1: number
  y0: number
  y1: number
}

interface OCRRowField {
  confidence: number
  value: string
  yCenter: number
  synthetic?: boolean
}

interface TenderRowBand {
  y0: number
  y1: number
  yCenter: number
}

const OCR_NAME_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/&.,()- "
const OCR_AMOUNT_WHITELIST = "0123456789.,"

export const NAME_COLUMN_REGION: CropRegion = {
  // Start inside the Name of Tenderer column so serial/header artifacts do not become bidder names.
  xPercent: 4.2,
  yPercent: 0,
  widthPercent: 20,
  heightPercent: 100,
  scaleFactor: 4,
  threshold: 180
}

export const SERIAL_NUMBER_COLUMN_REGION: CropRegion = {
  // Read the left SL No column separately so row count follows the screenshot exactly.
  xPercent: 1,
  yPercent: 0,
  widthPercent: 4.8,
  heightPercent: 100,
  scaleFactor: 4,
  threshold: 214
}

export const FINAL_AMOUNT_COLUMN_REGION: CropRegion = {
  // Capture the full rightmost final amount column; OCR can then choose the rightmost number per row.
  xPercent: 78,
  yPercent: 0,
  widthPercent: 21.5,
  heightPercent: 100,
  scaleFactor: 4,
  threshold: 235
}

export const FINAL_AMOUNT_FALLBACK_COLUMN_REGION: CropRegion = {
  ...FINAL_AMOUNT_COLUMN_REGION,
  threshold: 180
}

export async function cropImageRegion(file: File, region: CropRegion): Promise<HTMLCanvasElement> {
  const image = await loadImage(file)
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  const cropX = Math.round((region.xPercent / 100) * sourceWidth)
  const cropY = Math.round((region.yPercent / 100) * sourceHeight)
  const cropWidth = Math.round((region.widthPercent / 100) * sourceWidth)
  const cropHeight = Math.round((region.heightPercent / 100) * sourceHeight)
  const padding = 24
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Canvas context not available.")
  }

  canvas.width = Math.max(1, Math.round(cropWidth * region.scaleFactor) + padding * 2)
  canvas.height = Math.max(1, Math.round(cropHeight * region.scaleFactor) + padding * 2)

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = false
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    padding,
    padding,
    canvas.width - padding * 2,
    canvas.height - padding * 2
  )

  applyBinaryContrast(canvas, region.threshold)

  return canvas
}

export async function runOCR(
  canvas: HTMLCanvasElement,
  options: {
    onProgress?: (update: OCRProgressUpdate) => void
    pageSegMode?: PSM
    variant: OCRVariant
  }
): Promise<OCRTextResult> {
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    logger: (message) => {
      options.onProgress?.({
        variant: options.variant,
        progress: typeof message.progress === "number" ? message.progress : 0,
        status: message.status ?? "Reading screenshot..."
      })
    }
  })

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: options.variant === "amounts" ? OCR_AMOUNT_WHITELIST : OCR_NAME_WHITELIST,
      tessedit_pageseg_mode: options.pageSegMode ?? PSM.SINGLE_COLUMN,
      user_defined_dpi: "300"
    })

    const result = await worker.recognize(canvas, {}, { blocks: true })

    return {
      confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : 0,
      text: result.data.text ?? "",
      lines: extractOCRLines(result.data.blocks),
      words: extractOCRWords(result.data.blocks)
    }
  } finally {
    await worker.terminate()
  }
}

export async function readOpeningReportScreenshot(
  file: File,
  onProgress?: (progress: number) => void
): Promise<ImportedBidderRow[]> {
  const image = await loadImage(file)
  const scale = Math.min(3, Math.max(1, 1200 / image.naturalHeight))
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d", { willReadFrequently: true })

  if (!context) throw new Error("Canvas context not available.")

  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const result = await runOCR(canvas, {
    variant: "names",
    pageSegMode: PSM.SPARSE_TEXT,
    onProgress: ({ progress }) => onProgress?.(progress)
  })
  const sectionLabels = result.lines
    .filter((line) => {
      const normalized = line.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
      return normalized.includes("report header") || normalized.includes("report footer")
    })
    .map((line) => ({
      text: line.text.trim(),
      x: line.x0,
      y: canvas.height - line.y1,
      width: line.x1 - line.x0
    }))
  const wordItems = (result.words ?? []).map((word) => ({
    text: word.text.trim(),
    x: word.x0,
    y: canvas.height - word.y1,
    width: word.x1 - word.x0
  }))
  const page: PdfPositionedPage = {
    width: canvas.width,
    height: canvas.height,
    items: [...sectionLabels, ...wordItems].filter((item) => item.text)
  }

  const positionedRows = extractOpeningReportTable([page]).map((row) =>
    createImportedBidderRow(row.name, row.amount, { id: crypto.randomUUID() })
  )

  if (positionedRows.length > 0) return positionedRows

  const headerLine = result.lines.find((line) => normalizeOcrLabel(line.text).includes("report header"))
  const footerLine = result.lines.find((line) => normalizeOcrLabel(line.text).includes("report footer"))
  if (!headerLine || !footerLine) return []

  onProgress?.(0.45)
  return readOpeningReportGridRows(
    image,
    headerLine.y1 / scale,
    footerLine.y0 / scale,
    (progress) => onProgress?.(0.45 + progress * 0.55)
  )
}

async function readOpeningReportGridRows(
  image: HTMLImageElement,
  headerBottom: number,
  footerTop: number,
  onProgress?: (progress: number) => void
): Promise<ImportedBidderRow[]> {
  const grid = detectOpeningReportGrid(image, headerBottom, footerTop)
  if (!grid) return []

  const nameCanvases = cropDetectedGridRows(image, grid.rowBands, grid.columns[1], grid.columns[2], "names")
  const amountCanvases = cropDetectedGridRows(
    image,
    grid.rowBands,
    grid.columns[grid.columns.length - 2],
    grid.columns[grid.columns.length - 1],
    "amounts"
  )
  const nameResults = await runOCRBatch(nameCanvases, {
    variant: "names",
    pageSegMode: PSM.SINGLE_LINE,
    onProgress: (progress) => onProgress?.(progress * 0.55)
  })
  const amountResults = await runOCRBatch(amountCanvases, {
    variant: "amounts",
    pageSegMode: PSM.SINGLE_LINE,
    onProgress: (progress) => onProgress?.(0.55 + progress * 0.45)
  })

  return grid.rowBands
    .map((_rowBand, index) => createImportedBidderRow(
      nameResults[index]?.text ?? "",
      extractRightmostBidAmount(amountResults[index]?.text ?? ""),
      { id: crypto.randomUUID() }
    ))
    .filter((row) => row.name.trim().length > 0 || parseNumber(row.amount) > 0)
}

function detectOpeningReportGrid(
  image: HTMLImageElement,
  headerBottom: number,
  footerTop: number
): { columns: number[]; rowBands: TenderRowBand[] } | null {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null

  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const horizontalCandidates: Array<{ y: number; strength: number }> = []

  for (let y = Math.max(0, Math.floor(headerBottom)); y <= Math.min(canvas.height - 1, Math.ceil(footerTop)); y += 1) {
    let strength = 0
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4
      if (isTableGridPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])) strength += 1
    }
    if (strength >= canvas.width * 0.45) horizontalCandidates.push({ y, strength })
  }

  const horizontalLines = collapseLineRuns(horizontalCandidates)
  if (horizontalLines.length < 3) return null
  const bodyLines = horizontalLines.slice(1)
  const bodyTop = bodyLines[0]
  const bodyBottom = bodyLines[bodyLines.length - 1]
  const verticalCandidates: Array<{ y: number; strength: number }> = []

  for (let x = 0; x < canvas.width; x += 1) {
    let strength = 0
    for (let y = bodyTop; y <= bodyBottom; y += 1) {
      const offset = (y * canvas.width + x) * 4
      if (isTableGridPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])) strength += 1
    }
    if (strength >= (bodyBottom - bodyTop) * 0.55) verticalCandidates.push({ y: x, strength })
  }

  const columns = collapseLineRuns(verticalCandidates)
  if (columns.length < 4) return null

  const rowBands = bodyLines.slice(0, -1).map((line, index) => ({
    y0: line,
    y1: bodyLines[index + 1],
    yCenter: midpoint(line, bodyLines[index + 1])
  }))

  return { columns, rowBands }
}

function cropDetectedGridRows(
  image: HTMLImageElement,
  rowBands: TenderRowBand[],
  x0: number,
  x1: number,
  variant: OCRVariant
): HTMLCanvasElement[] {
  const scale = variant === "amounts" ? 4 : 3
  const padding = 18

  return rowBands.map((row) => {
    const sourceX = Math.max(0, Math.floor(x0 + 2))
    const sourceY = Math.max(0, Math.floor(row.y0 + 2))
    const sourceWidth = Math.max(1, Math.ceil(x1 - x0 - 4))
    const sourceHeight = Math.max(1, Math.ceil(row.y1 - row.y0 - 4))
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas context not available.")

    canvas.width = sourceWidth * scale + padding * 2
    canvas.height = sourceHeight * scale + padding * 2
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = false
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      padding,
      padding,
      sourceWidth * scale,
      sourceHeight * scale
    )
    return canvas
  })
}

function normalizeOcrLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function midpoint(left: number, right: number) {
  return (left + right) / 2
}

export async function readTenderRowsByDetectedBands(
  file: File,
  onProgress?: (progress: number) => void
): Promise<ImportedBidderRow[]> {
  const rowBands = await detectTenderRowBands(file)

  if (rowBands.length === 0) {
    return []
  }

  onProgress?.(0.08)

  const nameCanvases = await cropImageRowRegions(file, rowBands, NAME_COLUMN_REGION)
  const amountCanvases = await cropImageRowRegions(file, rowBands, FINAL_AMOUNT_COLUMN_REGION)
  const fallbackAmountCanvases = await cropImageRowRegions(file, rowBands, FINAL_AMOUNT_FALLBACK_COLUMN_REGION)

  onProgress?.(0.18)

  const nameResults = await runOCRBatch(nameCanvases, {
    variant: "names",
    pageSegMode: PSM.SINGLE_LINE,
    onProgress: (progress) => onProgress?.(0.18 + progress * 0.34)
  })
  const amountResults = await runOCRBatch(amountCanvases, {
    variant: "amounts",
    pageSegMode: PSM.SINGLE_LINE,
    onProgress: (progress) => onProgress?.(0.52 + progress * 0.24)
  })
  const fallbackAmountResults = await runOCRBatch(fallbackAmountCanvases, {
    variant: "amounts",
    pageSegMode: PSM.SINGLE_LINE,
    onProgress: (progress) => onProgress?.(0.76 + progress * 0.24)
  })

  const primaryAmounts = amountResults.map((result, index) => ({
    confidence: result.confidence,
    value: normalizeBidAmount(result.text),
    yCenter: rowBands[index]?.yCenter ?? index
  }) satisfies OCRRowField)
  const fallbackAmounts = fallbackAmountResults.map((result, index) => ({
    confidence: result.confidence,
    value: normalizeBidAmount(result.text),
    yCenter: rowBands[index]?.yCenter ?? index
  }) satisfies OCRRowField)
  const mergedAmounts = mergeAmountFields(primaryAmounts, fallbackAmounts)

  return rowBands
    .map((rowBand, index) => {
      const cleanedName = cleanBidderName(nameResults[index]?.text ?? "")
      const amount = mergedAmounts[index]?.value ?? ""

      return createImportedBidderRow(cleanedName, amount, {
        id: crypto.randomUUID(),
        mismatchDetected: cleanedName.length === 0 || parseNumber(amount) <= 0
      })
    })
    .filter((row) => row.name.trim().length > 0 || parseNumber(row.amount) > 0)
}

export function parseBidderNames(result: OCRTextResult): OCRRowField[] {
  const lines = result.lines.length > 0 ? result.lines : fallbackOCRLines(result.text)

  return lines
    .map((line) => {
      const cleanedName = cleanBidderName(line.text)

      return {
        confidence: line.confidence,
        value: cleanedName,
        yCenter: (line.y0 + line.y1) / 2
      } satisfies OCRRowField
    })
    .filter((line) => line.value.length > 0)
    .filter((line) => !isHeaderLine(line.value))
}

async function detectTenderRowBands(file: File): Promise<TenderRowBand[]> {
  const image = await loadImage(file)
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d", { willReadFrequently: true })

  if (!context) {
    return []
  }

  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  context.drawImage(image, 0, 0)

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const horizontalLines: Array<{ y: number; strength: number }> = []
  const minimumLineStrength = Math.max(40, canvas.width * 0.22)

  for (let y = 0; y < canvas.height; y += 1) {
    let greenPixelCount = 0

    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4

      if (isTableGridPixel(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2])) {
        greenPixelCount += 1
      }
    }

    if (greenPixelCount >= minimumLineStrength) {
      horizontalLines.push({ y, strength: greenPixelCount })
    }
  }

  const lineCenters = collapseLineRuns(horizontalLines)
  const rowHeight = estimateRowHeight(lineCenters)

  if (lineCenters.length < 2 || rowHeight <= 0) {
    return []
  }

  const startIndex = findFirstBodyLineIndex(lineCenters, rowHeight)
  const rowBands: TenderRowBand[] = []

  for (let index = startIndex; index < lineCenters.length - 1; index += 1) {
    const y0 = lineCenters[index]
    const y1 = lineCenters[index + 1]
    const gap = y1 - y0

    if (gap < rowHeight * 0.55 || gap > rowHeight * 1.65) {
      if (rowBands.length > 0) {
        break
      }

      continue
    }

    rowBands.push({
      y0,
      y1,
      yCenter: (y0 + y1) / 2
    })
  }

  return rowBands
}

async function cropImageRowRegions(
  file: File,
  rowBands: TenderRowBand[],
  region: CropRegion
): Promise<HTMLCanvasElement[]> {
  const image = await loadImage(file)
  const sourceWidth = image.naturalWidth
  const cropX = Math.round((region.xPercent / 100) * sourceWidth)
  const cropWidth = Math.round((region.widthPercent / 100) * sourceWidth)
  const padding = 18

  return rowBands.map((rowBand) => {
    const cropY = Math.max(0, Math.floor(rowBand.y0 + 1))
    const cropHeight = Math.max(1, Math.ceil(rowBand.y1 - rowBand.y0 - 2))
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")

    if (!context) {
      throw new Error("Canvas context not available.")
    }

    canvas.width = Math.max(1, Math.round(cropWidth * region.scaleFactor) + padding * 2)
    canvas.height = Math.max(1, Math.round(cropHeight * region.scaleFactor) + padding * 2)
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = false
    context.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      padding,
      padding,
      canvas.width - padding * 2,
      canvas.height - padding * 2
    )
    applyBinaryContrast(canvas, region.threshold)

    return canvas
  })
}

async function runOCRBatch(
  canvases: HTMLCanvasElement[],
  options: {
    onProgress?: (progress: number) => void
    pageSegMode: PSM
    variant: OCRVariant
  }
): Promise<OCRTextResult[]> {
  if (canvases.length === 0) {
    return []
  }

  const worker = await createWorker("eng", OEM.LSTM_ONLY)

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: options.variant === "amounts" ? OCR_AMOUNT_WHITELIST : OCR_NAME_WHITELIST,
      tessedit_pageseg_mode: options.pageSegMode,
      user_defined_dpi: "300"
    })

    const results: OCRTextResult[] = []

    for (let index = 0; index < canvases.length; index += 1) {
      const result = await worker.recognize(canvases[index], {}, { blocks: true })
      results.push({
        confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : 0,
        text: result.data.text ?? "",
        lines: extractOCRLines(result.data.blocks)
      })
      options.onProgress?.((index + 1) / canvases.length)
    }

    return results
  } finally {
    await worker.terminate()
  }
}

export function parseBidderSerials(result: OCRTextResult): OCRRowField[] {
  const lines = result.lines.length > 0 ? result.lines : fallbackOCRLines(result.text)

  return lines
    .map((line) => {
      const serialMatch = isSerialHeaderLine(line.text) ? null : line.text.match(/\b(\d{1,3})\b/)
      const serialValue = serialMatch?.[1] ?? ""

      return {
        confidence: line.confidence,
        value: serialValue,
        yCenter: (line.y0 + line.y1) / 2
      } satisfies OCRRowField
    })
    .filter((line) => line.value.length > 0)
    .filter((line) => isLikelySerial(line.value))
    .filter((line) => line.confidence >= 45 || Number.parseInt(line.value, 10) <= 30)
    .filter((line, index, collection) => {
      const numericSerial = Number.parseInt(line.value, 10)
      const previous = collection[index - 1]

      if (!previous) {
        return true
      }

      const previousSerial = Number.parseInt(previous.value, 10)
      return numericSerial !== previousSerial
    })
}

export function parseBidAmounts(result: OCRTextResult): OCRRowField[] {
  const lines = result.lines.length > 0 ? result.lines : fallbackOCRLines(result.text)

  return lines
    .map((line) => {
      const amount = extractRightmostBidAmount(line.text)

      return {
        confidence: line.confidence,
        value: amount,
        yCenter: (line.y0 + line.y1) / 2
      } satisfies OCRRowField
    })
    .filter((line) => line.value.length > 0)
}

export function mergeAmountFields(primaryAmounts: OCRRowField[], fallbackAmounts: OCRRowField[]): OCRRowField[] {
  if (primaryAmounts.length === 0) {
    return fallbackAmounts
  }

  if (fallbackAmounts.length === 0) {
    return primaryAmounts
  }

  const totalRows = Math.max(primaryAmounts.length, fallbackAmounts.length)
  const mergedAmounts: OCRRowField[] = []

  for (let index = 0; index < totalRows; index += 1) {
    const primaryAmount = primaryAmounts[index]
    const fallbackAmount = fallbackAmounts[index]

    if (!primaryAmount) {
      if (fallbackAmount) {
        mergedAmounts.push(fallbackAmount)
      }
      continue
    }

    if (!fallbackAmount) {
      mergedAmounts.push(primaryAmount)
      continue
    }

    const previousAmount = mergedAmounts[mergedAmounts.length - 1]
    const nextPrimaryAmount = primaryAmounts[index + 1]
    const primaryValue = parseNumber(primaryAmount.value)
    const fallbackValue = parseNumber(fallbackAmount.value)
    const previousValue = parseNumber(previousAmount?.value)
    const nextPrimaryValue = parseNumber(nextPrimaryAmount?.value)
    const primaryBreaksAscendingOrder = previousValue > 0 && primaryValue > 0 && primaryValue + 100 < previousValue
    const fallbackKeepsAscendingOrder = previousValue <= 0 || fallbackValue >= previousValue * 0.95
    const primaryHasLargeForwardJump =
      nextPrimaryValue > 0 && primaryValue > nextPrimaryValue * 1.6 && fallbackValue < primaryValue
    const primaryLooksTooSmall = primaryValue > 0 && primaryValue < 100000 && fallbackValue >= 100000

    mergedAmounts.push(
      (primaryLooksTooSmall || primaryBreaksAscendingOrder || primaryHasLargeForwardJump) && fallbackKeepsAscendingOrder
        ? fallbackAmount
        : primaryAmount
    )
  }

  return mergedAmounts
}

export function normalizeBidAmount(value: string): string {
  if (!value) {
    return ""
  }

  let normalizedInput = value
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/\s+/g, "")
    .replace(/[.,]+$/, "")

  const commaCount = (normalizedInput.match(/,/g) ?? []).length

  if (!normalizedInput.includes(".") && commaCount === 1 && /,\d{1,2}$/.test(normalizedInput)) {
    normalizedInput = normalizedInput.replace(/,(\d{1,3})$/, ".$1")
  }

  const digitsOnlyCandidate = normalizedInput.replace(/,/g, "").replace(/[^\d.]/g, "")

  if (!digitsOnlyCandidate) {
    return ""
  }

  const decimalDotWasSeen = digitsOnlyCandidate.includes(".")
  const firstDecimalIndex = digitsOnlyCandidate.indexOf(".")
  const normalized =
    firstDecimalIndex === -1
      ? digitsOnlyCandidate
      : `${digitsOnlyCandidate.slice(0, firstDecimalIndex + 1)}${digitsOnlyCandidate
          .slice(firstDecimalIndex + 1)
          .replace(/\./g, "")}`

  const parsedValue = Number.parseFloat(normalized)

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return ""
  }

  const recoveredNormalized = recoverMissingDecimalPoint(normalized, decimalDotWasSeen)
  const [integerPart = "", decimalPart = ""] = recoveredNormalized.split(".")
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0"
  const rawAmount = decimalPart ? `${normalizedInteger}.${decimalPart}` : normalizedInteger

  return normalizeNumericInput(rawAmount, { allowDecimal: true, maxDecimals: 3 })
}

function extractRightmostBidAmount(value: string): string {
  if (!value) {
    return ""
  }

  const normalizedLine = value
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalizedLine) {
    return ""
  }

  const candidateMatches = Array.from(normalizedLine.matchAll(/\d[\d\s.,]*/g))

  for (let index = candidateMatches.length - 1; index >= 0; index -= 1) {
    const normalizedCandidate = normalizeBidAmount(candidateMatches[index]?.[0] ?? "")

    if (isLikelyFinalBidAmount(normalizedCandidate)) {
      return normalizedCandidate
    }
  }

  return ""
}

function recoverMissingDecimalPoint(value: string, decimalDotWasSeen: boolean) {
  if (decimalDotWasSeen || value.length < 9 || !/0{2,3}$/.test(value)) {
    return value
  }

  if (value.length === 9) {
    return value.replace(/0{2}$/, "")
  }

  return value.replace(/0{3}$/, "")
}

export function cleanBidderName(name: string): string {
  if (!name) {
    return ""
  }

  const cleaned = name
    .replace(/\u00a0/g, " ")
    .replace(/[\u201C\u201D\u2018\u2019"]/g, "")
    .replace(/[|]/g, "I")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/^\s*\(?\d+\)?\s*[.)-]?\s*/g, "")
    .replace(/^\s*\d+\s*[.)-]?\s*/g, "")
    .replace(/[^\w\s/&().,-]/g, " ")
    .replace(/_/g, " ")
    .replace(/^\s*(?:MIS|MS|M\/S)(\.)?/i, (_match, dot: string | undefined) => (dot ? "M/S." : "M/S"))
    .replace(/^M\/S\.(?=[A-Za-z])/i, "M/S. ")
    .replace(/^M\/S(?=[A-Za-z])/i, "M/S ")
    .replace(/\bALHASIB\b/gi, "AL-HASIB")
    .replace(/\bSAFEICT\b/gi, "SAFE ICT")
    .replace(/\bCptimal\b/gi, "Optimal")
    .replace(/\bLid\./gi, "Ltd.")
    .replace(/\bMUGMNEE\b/gi, "MUGNEE")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned || /^\(?\d+\)?$/.test(cleaned) || /^\d+$/.test(cleaned)) {
    return ""
  }

  return cleaned
}

export function pairNamesWithAmounts(names: OCRRowField[], amounts: OCRRowField[]): ImportedBidderRow[] {
  if (amounts.length === 0) {
    return names
      .map((name) =>
        createImportedBidderRow(name.value, "", {
          id: crypto.randomUUID(),
          mismatchDetected: true
        })
      )
      .filter(isUsableImportedRow)
  }

  const usedNameIndexes = new Set<number>()
  const rows = amounts.map((amount, index) => {
    const nextAmount = amounts[index + 1]
    const previousAmount = amounts[index - 1]
    const upperBound = previousAmount ? (previousAmount.yCenter + amount.yCenter) / 2 : Number.NEGATIVE_INFINITY
    const lowerBound = nextAmount ? (amount.yCenter + nextAmount.yCenter) / 2 : Number.POSITIVE_INFINITY
    const matchedName = findBestRowFieldForBandWithIndex(names, upperBound, lowerBound)

    if (matchedName) {
      usedNameIndexes.add(matchedName.index)
    }

    return createImportedBidderRow(matchedName?.field.value ?? "", amount.value, {
      id: crypto.randomUUID(),
      mismatchDetected: !matchedName || names.length !== amounts.length
    })
  })

  const unmatchedNameRows = names
    .map((name, index) => ({ name, index }))
    .filter(({ index }) => !usedNameIndexes.has(index))
    .map(({ name }) =>
      createImportedBidderRow(name.value, "", {
        id: crypto.randomUUID(),
        mismatchDetected: true
      })
    )

  return [...rows, ...unmatchedNameRows].filter(isUsableImportedRow)
}

export function pairRowsBySerials(
  serials: OCRRowField[],
  names: OCRRowField[],
  amounts: OCRRowField[]
): ImportedBidderRow[] {
  if (serials.length === 0) {
    return pairNamesWithAmounts(names, amounts)
  }

  const completedSerials = completeSerialGaps(serials)

  const rows = completedSerials.map((serial, index) => {
    const nextSerial = completedSerials[index + 1]
    const previousSerial = completedSerials[index - 1]
    const upperBound = previousSerial ? (previousSerial.yCenter + serial.yCenter) / 2 : Number.NEGATIVE_INFINITY
    const lowerBound = nextSerial ? (serial.yCenter + nextSerial.yCenter) / 2 : Number.POSITIVE_INFINITY
    const matchedName = findBestRowFieldForBand(names, upperBound, lowerBound)
    const matchedAmount = findBestRowFieldForBand(amounts, upperBound, lowerBound)

    return createImportedBidderRow(matchedName?.value ?? "", matchedAmount?.value ?? "", {
      id: crypto.randomUUID(),
      mismatchDetected: !matchedName || !matchedAmount
    })
  })

  return rows.filter((row, index) => isUsableImportedRow(row) || completedSerials[index]?.synthetic === true)
}

export function chooseBestBidderSerials(
  primarySerials: OCRRowField[],
  fallbackSerials: OCRRowField[],
  names: OCRRowField[],
  amounts: OCRRowField[]
): OCRRowField[] {
  const expectedMinimum = Math.max(2, amounts.length || names.length)

  if (primarySerials.length >= expectedMinimum) {
    return primarySerials
  }

  if (fallbackSerials.length >= expectedMinimum) {
    return fallbackSerials
  }

  return []
}

function completeSerialGaps(serials: OCRRowField[]): OCRRowField[] {
  const sortedSerials = [...serials].sort((left, right) => left.yCenter - right.yCenter)
  const completedSerials: OCRRowField[] = []

  if (sortedSerials.length === 0) {
    return completedSerials
  }

  const firstSerialNumber = Number.parseInt(sortedSerials[0]?.value ?? "", 10)

  if (firstSerialNumber > 1 && sortedSerials.length > 1) {
    const secondSerialNumber = Number.parseInt(sortedSerials[1]?.value ?? "", 10)
    const serialGap = Math.max(1, secondSerialNumber - firstSerialNumber)
    const rowHeight = (sortedSerials[1].yCenter - sortedSerials[0].yCenter) / serialGap

    for (let serialNumber = 1; serialNumber < firstSerialNumber; serialNumber += 1) {
      completedSerials.push({
        confidence: sortedSerials[0].confidence,
        value: serialNumber.toString(),
        yCenter: sortedSerials[0].yCenter - rowHeight * (firstSerialNumber - serialNumber),
        synthetic: true
      })
    }
  }

  sortedSerials.forEach((serial, index) => {
    const previousSerial = completedSerials[completedSerials.length - 1]
    const currentSerialNumber = Number.parseInt(serial.value, 10)
    const previousSerialNumber = Number.parseInt(previousSerial?.value ?? "", 10)

    if (previousSerial && currentSerialNumber - previousSerialNumber > 1) {
      const missingCount = currentSerialNumber - previousSerialNumber - 1
      const rowHeight = (serial.yCenter - previousSerial.yCenter) / (missingCount + 1)

      for (let offset = 1; offset <= missingCount; offset += 1) {
        completedSerials.push({
          confidence: Math.min(previousSerial.confidence, serial.confidence),
          value: (previousSerialNumber + offset).toString(),
          yCenter: previousSerial.yCenter + rowHeight * offset,
          synthetic: true
        })
      }
    }

    if (!previousSerial || currentSerialNumber !== previousSerialNumber) {
      completedSerials.push(serial)
    }
  })

  return completedSerials
}

export function createImportedBidderRow(
  name: string,
  amount: string,
  options: {
    id?: string
    mismatchDetected?: boolean
  } = {}
): ImportedBidderRow {
  const cleanedName = cleanBidderName(name)
  const normalizedAmount = normalizeBidAmount(amount)
  const notes: string[] = []
  const numericAmount = parseNumber(normalizedAmount)
  const letterCount = cleanedName.replace(/[^A-Za-z]/g, "").length
  const hasBlockingIssue = cleanedName.length === 0 || numericAmount <= 0

  if (!cleanedName) {
    notes.push("Bidder name is missing.")
  } else {
    if (letterCount < 4) {
      notes.push("Bidder name looks incomplete.")
    }

    if (!/[A-Za-z]/.test(cleanedName)) {
      notes.push("Bidder name should contain letters.")
    }
  }

  if (!normalizedAmount) {
    notes.push("Final bidding amount is missing.")
  } else if (normalizedAmount.length < 6 || normalizedAmount.length > 13) {
    notes.push("Final bidding amount looks unusual.")
  }

  if (options.mismatchDetected) {
    notes.push("OCR row counts did not match exactly.")
  }

  return {
    id: options.id ?? crypto.randomUUID(),
    name: cleanedName,
    amount: normalizedAmount,
    status: notes.length > 0 ? "Needs Review" : "Ready",
    notes,
    confidence: hasBlockingIssue ? 0.35 : notes.length > 0 ? 0.72 : 0.96
  }
}

export function importBiddersToCalculator(
  rows: ImportedBidderRow[],
  mode: ScreenshotImportMode,
  existingBidders: BidderRow[],
  createId: () => string
): BidderRow[] {
  const normalizedRows = rows
    .map((row) => ({
      name: cleanBidderName(row.name),
      amount: normalizeBidAmount(row.amount)
    }))
    .filter((row) => row.name.length > 0 && parseNumber(row.amount) > 0)
    .map((row) => ({
      id: createId(),
      name: row.name,
      amount: row.amount,
      checked: true
    }) satisfies BidderRow)

  if (normalizedRows.length === 0) {
    return existingBidders
  }

  const hasMeaningfulExistingBidders = existingBidders.some(
    (bidder) => bidder.name.trim().length > 0 || parseNumber(bidder.amount) > 0
  )

  if (mode === "append" && hasMeaningfulExistingBidders) {
    return [...existingBidders, ...normalizedRows]
  }

  return normalizedRows
}

function applyBinaryContrast(canvas: HTMLCanvasElement, threshold: number) {
  const context = canvas.getContext("2d")

  if (!context) {
    return
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue)
    const binaryValue = luminance > threshold ? 255 : 0

    data[index] = binaryValue
    data[index + 1] = binaryValue
    data[index + 2] = binaryValue
    data[index + 3] = 255
  }

  context.putImageData(imageData, 0, 0)
}

function isTableGridPixel(red: number, green: number, blue: number) {
  return green > 135 && green > red + 18 && green > blue + 18 && red > 60 && red < 210 && blue < 190
}

function collapseLineRuns(lines: Array<{ y: number; strength: number }>) {
  const collapsedLines: number[] = []
  let currentRun: Array<{ y: number; strength: number }> = []

  lines.forEach((line) => {
    const previousLine = currentRun[currentRun.length - 1]

    if (!previousLine || line.y - previousLine.y <= 1) {
      currentRun.push(line)
      return
    }

    collapsedLines.push(getWeightedLineCenter(currentRun))
    currentRun = [line]
  })

  if (currentRun.length > 0) {
    collapsedLines.push(getWeightedLineCenter(currentRun))
  }

  return collapsedLines
}

function getWeightedLineCenter(lines: Array<{ y: number; strength: number }>) {
  const totalStrength = lines.reduce((total, line) => total + line.strength, 0)

  if (totalStrength <= 0) {
    return lines[0]?.y ?? 0
  }

  return Math.round(lines.reduce((total, line) => total + line.y * line.strength, 0) / totalStrength)
}

function estimateRowHeight(lineCenters: number[]) {
  const gaps = lineCenters
    .slice(1)
    .map((lineCenter, index) => lineCenter - lineCenters[index])
    .filter((gap) => gap >= 14 && gap <= 70)
    .sort((left, right) => left - right)

  if (gaps.length === 0) {
    return 0
  }

  return gaps[Math.floor(gaps.length / 2)]
}

function findFirstBodyLineIndex(lineCenters: number[], rowHeight: number) {
  for (let index = 0; index < lineCenters.length - 2; index += 1) {
    const firstGap = lineCenters[index + 1] - lineCenters[index]
    const secondGap = lineCenters[index + 2] - lineCenters[index + 1]

    if (isLikelyRowGap(firstGap, rowHeight) && isLikelyRowGap(secondGap, rowHeight)) {
      return index
    }
  }

  return 0
}

function isLikelyRowGap(gap: number, rowHeight: number) {
  return gap >= rowHeight * 0.65 && gap <= rowHeight * 1.45
}

function isLikelyFinalBidAmount(value: string) {
  if (!value) {
    return false
  }

  return /^\d{6,10}(?:\.\d{1,3})?$/.test(value.replace(/,/g, ""))
}

function isSerialHeaderLine(value: string) {
  if (!value) {
    return true
  }

  const trimmedValue = value.trim()
  const normalized = trimmedValue.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

  return (
    /^\(\s*\d{1,3}\s*\)$/.test(trimmedValue) ||
    normalized.includes("s no") ||
    normalized.includes("sl no") ||
    normalized.includes("serial") ||
    normalized.includes("name of tenderer") ||
    normalized.includes("quoted amount")
  )
}

function isUsableImportedRow(row: ImportedBidderRow) {
  if (parseNumber(row.amount) > 0) {
    return true
  }

  const letterCount = row.name.replace(/[^A-Za-z]/g, "").length

  return letterCount >= 4 && !isHeaderLine(row.name)
}

function isLikelySerial(value: string) {
  if (!value) {
    return false
  }

  return /^\d{1,3}$/.test(value) && Number.parseInt(value, 10) > 0
}

function findBestRowFieldForBand(
  fields: OCRRowField[],
  upperBound: number,
  lowerBound: number
): OCRRowField | undefined {
  return findBestRowFieldForBandWithIndex(fields, upperBound, lowerBound)?.field
}

function findBestRowFieldForBandWithIndex(
  fields: OCRRowField[],
  upperBound: number,
  lowerBound: number
): { field: OCRRowField; index: number } | undefined {
  const candidates = fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => field.yCenter > upperBound && field.yCenter <= lowerBound)

  if (candidates.length === 0) {
    return undefined
  }

  return candidates.sort((left, right) => {
    if (right.field.confidence !== left.field.confidence) {
      return right.field.confidence - left.field.confidence
    }

    return left.field.yCenter - right.field.yCenter
  })[0]
}

function isHeaderLine(value: string) {
  if (!value) {
    return true
  }

  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

  if (!normalized) {
    return true
  }

  return (
    normalized.includes("name of tenderer") ||
    normalized.includes("quoted amount") ||
    normalized.includes("discount") ||
    normalized.includes("tenderer") ||
    /^\d+$/.test(normalized) ||
    normalized === "s no" ||
    normalized === "sl no"
  )
}

function extractOCRLines(blocks: Tesseract.Block[] | null | undefined): OCRLineResult[] {
  if (!blocks || blocks.length === 0) {
    return []
  }

  return blocks
    .flatMap((block) => block.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.lines ?? [])
    .map((line) => ({
      confidence: Number.isFinite(line.confidence) ? line.confidence : 0,
      text: line.text ?? "",
      x0: line.bbox.x0,
      x1: line.bbox.x1,
      y0: line.bbox.y0,
      y1: line.bbox.y1
    }))
    .sort((left, right) => (left.y0 - right.y0) || (left.x0 - right.x0))
}

function extractOCRWords(blocks: Tesseract.Block[] | null | undefined): OCRWordResult[] {
  if (!blocks || blocks.length === 0) return []

  return blocks
    .flatMap((block) => block.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.lines ?? [])
    .flatMap((line) => line.words ?? [])
    .map((word) => ({
      confidence: Number.isFinite(word.confidence) ? word.confidence : 0,
      text: word.text ?? "",
      x0: word.bbox.x0,
      x1: word.bbox.x1,
      y0: word.bbox.y0,
      y1: word.bbox.y1
    }))
    .sort((left, right) => (left.y0 - right.y0) || (left.x0 - right.x0))
}

function fallbackOCRLines(text: string): OCRLineResult[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({
      confidence: 0,
      text: line,
      x0: 0,
      x1: 0,
      y0: index,
      y1: index
    }))
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Failed to read screenshot image."))
    }

    image.src = objectUrl
  })
}
