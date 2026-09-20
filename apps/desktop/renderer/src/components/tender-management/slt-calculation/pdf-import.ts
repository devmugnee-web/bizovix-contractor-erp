import type { PDFDocumentProxy } from "pdfjs-dist";
import { parseNumber } from "./calculator";
import { extractOpeningReportTable, type PdfPositionedPage } from "./pdf-text-extraction";
import type { PdfImportedBidderRow } from "./types";

const MONEY_PATTERN = /^\d{1,15}(?:\.\d{1,6})?$/;

export async function extractTenderRowsFromPdf(
  file: File,
  onProgress?: (message: string) => void,
): Promise<PdfImportedBidderRow[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: PdfPositionedPage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.(`Reading PDF text — page ${pageNumber} of ${pdf.numPages}`);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items = textContent.items.flatMap((item) => {
      if (!("str" in item) || !item.str.trim()) return [];
      return [
        { text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width },
      ];
    });
    pages.push({ width: viewport.width, height: viewport.height, items });
  }
  const textRows = toImportedRows(pages, false);
  if (textRows.length) return textRows;
  onProgress?.("No text table found. Starting OCR for scanned pages…");
  return extractRowsWithOcr(pdf, onProgress);
}

async function extractRowsWithOcr(
  pdf: PDFDocumentProxy,
  onProgress?: (message: string) => void,
): Promise<PdfImportedBidderRow[]> {
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const pages: PdfPositionedPage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.(`Scanning page ${pageNumber} of ${pdf.numPages} with OCR…`);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 3 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) continue;
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const worker = await createWorker("eng", OEM.LSTM_ONLY);
    try {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        user_defined_dpi: "300",
      });
      const result = await worker.recognize(canvas, {}, { blocks: true });
      const blocks = result.data.blocks ?? [];
      const items = blocks
        .flatMap((block) =>
          block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.flatMap((line) =>
              line.words.map((word) => ({
                text: word.text.trim(),
                x: word.bbox.x0,
                y: canvas.height - word.bbox.y1,
                width: word.bbox.x1 - word.bbox.x0,
              })),
            ),
          ),
        )
        .filter((item) => item.text);
      pages.push({ width: canvas.width, height: canvas.height, items });
    } finally {
      await worker.terminate();
    }
  }
  return toImportedRows(pages, true);
}

function toImportedRows(pages: PdfPositionedPage[], ocr: boolean) {
  return extractOpeningReportTable(pages).map((row) =>
    createPdfImportedRow(row.serial, row.name, row.amount, ocr),
  );
}

export function createPdfImportedRow(
  serial: string,
  name: string,
  amount: string,
  ocr = false,
  id = crypto.randomUUID(),
): PdfImportedBidderRow {
  const cleanSerial = serial.trim();
  const cleanName = name.replace(/\s+/g, " ").trim();
  const cleanAmount = normalizePdfAmount(amount);
  const notes: string[] = [];
  if (!/^\d+$/.test(cleanSerial) || Number(cleanSerial) <= 0) notes.push("Invalid serial number.");
  if (!cleanName) notes.push("Bidder name is missing.");
  if (!cleanAmount || parseNumber(cleanAmount) <= 0) notes.push("Bidding amount is invalid.");
  if (ocr) notes.push("OCR result — please verify.");
  return {
    id,
    serial: cleanSerial,
    name: cleanName,
    amount: cleanAmount,
    status: notes.length ? "Needs Review" : "Ready",
    notes,
    confidence: notes.length ? 0.7 : 0.99,
  };
}

function normalizePdfAmount(value: string) {
  const normalized = value.replace(/,/g, "").replace(/\s+/g, "").trim();
  if (!MONEY_PATTERN.test(normalized)) return "";
  const [integerPart = "0", decimalPart] = normalized.split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "") || "0";
  return decimalPart === undefined ? integer : `${integer}.${decimalPart}`;
}

export function formatPdfAmount(value: string) {
  const normalized = normalizePdfAmount(value);
  if (!normalized) return "";
  const [integer = "0", decimal] = normalized.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal === undefined ? grouped : `${grouped}.${decimal}`;
}
