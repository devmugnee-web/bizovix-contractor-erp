import type { ImportedBidderRow } from "@/types"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { parseNumber } from "@/utils/calculator"
import { runOCR } from "@/utils/tenderScreenshotImport"
import {
  extractOpeningReportTable,
  type PdfPositionedPage
} from "@/utils/tenderPdfTextExtraction"

export interface PdfImportedBidderRow extends ImportedBidderRow {
  serial: string
}

const MONEY_PATTERN = /^\d{1,15}(?:\.\d{1,6})?$/

export async function extractTenderRowsFromPdf(
  file: File,
  onProgress?: (message: string) => void
): Promise<PdfImportedBidderRow[]> {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString()

  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: PdfPositionedPage[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    onProgress?.(`Searching PDF text... page ${pageNumber} of ${document.numPages}`)
    const page = await document.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()
    const items = textContent.items.flatMap((item) => {
      if (!("str" in item) || !item.str.trim()) return []
      return [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width }]
    })

    pages.push({ height: viewport.height, width: viewport.width, items })
  }

  const textRows = extractOpeningReportRows(pages)

  if (textRows.length > 0) {
    return textRows
  }

  onProgress?.("No usable text table found. Starting scanned PDF OCR...")
  return extractRowsWithOcr(document, onProgress)
}

export function extractOpeningReportRows(pages: PdfPositionedPage[]): PdfImportedBidderRow[] {
  return extractOpeningReportTable(pages).map((row) => createPdfImportedRow(row.serial, row.name, row.amount))
}

async function extractRowsWithOcr(
  document: PDFDocumentProxy,
  onProgress?: (message: string) => void
): Promise<PdfImportedBidderRow[]> {
  const pages: PdfPositionedPage[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    onProgress?.(`Scanning page ${pageNumber} of ${document.numPages} for Opening Report Header...`)
    const page = await document.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 3 })
    const canvas = documentCanvas(viewport.width, viewport.height)
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) continue
    await page.render({ canvas, canvasContext: context, viewport }).promise
    const result = await runOCR(canvas, { variant: "names" })
    const lineItems = result.lines.filter((line) => {
      const normalized = line.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
      return normalized.includes("opening report header") || normalized.includes("opening report footer")
    }).map((line) => ({
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
    pages.push({ width: canvas.width, height: canvas.height, items: [...lineItems, ...wordItems].filter((item) => item.text) })
  }

  return extractOpeningReportTable(pages).map((row) => createPdfImportedRow(row.serial, row.name, row.amount, true))
}

export function createPdfImportedRow(
  serial: string,
  name: string,
  amount: string,
  ocrFallback = false,
  id = crypto.randomUUID()
): PdfImportedBidderRow {
  const cleanSerial = serial.trim()
  const cleanName = name.replace(/\s+/g, " ").trim()
  const cleanAmount = normalizePdfAmount(amount)
  const notes: string[] = []

  if (!isPositiveInteger(cleanSerial)) notes.push("S. No must be a positive integer.")
  if (!cleanName) notes.push("Bidder name is missing.")
  if (!cleanAmount || parseNumber(cleanAmount) <= 0) notes.push("Bidding amount is invalid.")
  if (ocrFallback) notes.push("Extracted with OCR. Please verify this row.")

  return {
    id,
    serial: cleanSerial,
    name: cleanName,
    amount: cleanAmount,
    status: notes.length > 0 ? "Needs Review" : "Ready",
    notes,
    confidence: notes.length > 0 ? 0.7 : 0.99
  }
}

export function normalizePdfAmount(value: string): string {
  const normalized = value.replace(/,/g, "").replace(/\s+/g, "").trim()
  if (!MONEY_PATTERN.test(normalized)) return ""
  const [integerPart, decimalPart] = normalized.split(".")
  const integer = integerPart.replace(/^0+(?=\d)/, "") || "0"
  return decimalPart === undefined ? integer : `${integer}.${decimalPart}`
}

export function formatPdfAmountForCalculator(value: string): string {
  const normalized = normalizePdfAmount(value)
  if (!normalized) return ""
  const [integer, decimal] = normalized.split(".")
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return decimal === undefined ? grouped : `${grouped}.${decimal}`
}

function isPositiveInteger(value: string) {
  return /^\d+$/.test(value.trim()) && Number.parseInt(value, 10) > 0
}

function documentCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.ceil(width)
  canvas.height = Math.ceil(height)
  return canvas
}
