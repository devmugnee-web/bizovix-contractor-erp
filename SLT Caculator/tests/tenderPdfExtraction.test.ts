import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"

import {
  extractOpeningReportTable,
  type PdfPositionedPage
} from "../utils/tenderPdfTextExtraction.ts"

const expectedRows = [
  { serial: "1", name: "M/S. A & J International", amount: "3126700.000" },
  { serial: "2", name: "Maxwell International", amount: "3134430.000" },
  { serial: "3", name: "md abu musa", amount: "3290740.000" },
  { serial: "4", name: "M/s. Hoque Techno Associates", amount: "3414400.000" },
  { serial: "5", name: "MUGNEE MULTIPLE", amount: "3581524.350" }
]

const samples = [
  "tender-opening-report-sample.pdf",
  "tender-opening-report-sample-alt.pdf"
]

for (const sample of samples) {
  test(`${sample} extracts the exact Opening Report table`, async () => {
    const pages = await readPositionedPages(path.join("public", "samples", sample))
    assert.deepEqual(extractOpeningReportTable(pages), expectedRows)
  })
}

test("samples place Opening Report Header on different pages", async () => {
  const headerPages = await Promise.all(samples.map(async (sample) => {
    const pages = await readPositionedPages(path.join("public", "samples", sample))
    return pages.findIndex((page) => page.items.some((item) => item.text === "Opening Report Header")) + 1
  }))

  assert.deepEqual(headerPages, [2, 3])
})

test("extracts exact columns when header and column markers are split into separate PDF items", () => {
  const page: PdfPositionedPage = {
    width: 600,
    height: 800,
    items: [
      { text: "Opening", x: 40, y: 700, width: 48 },
      { text: "Report", x: 92, y: 700, width: 42 },
      { text: "Header", x: 138, y: 700, width: 44 },
      { text: "(", x: 45, y: 665, width: 3 },
      { text: "1", x: 49, y: 665, width: 7 },
      { text: ")", x: 57, y: 665, width: 3 },
      { text: "2", x: 185, y: 665, width: 7 },
      { text: "3", x: 355, y: 665, width: 7 },
      { text: "6", x: 550, y: 665, width: 7 },
      { text: "1", x: 49, y: 625, width: 7 },
      { text: "M/S. Exact Bidder", x: 95, y: 625, width: 110 },
      { text: "3,000,000.000", x: 350, y: 625, width: 80 },
      { text: "3,126,700.000", x: 500, y: 625, width: 85 },
      { text: "Opening", x: 40, y: 580, width: 48 },
      { text: "Report", x: 92, y: 580, width: 42 },
      { text: "Footer", x: 138, y: 580, width: 42 }
    ]
  }

  assert.deepEqual(extractOpeningReportTable([page]), [
    { serial: "1", name: "M/S. Exact Bidder", amount: "3126700.000" }
  ])
})

test("extracts S. No, Name of Tenderer, and exact rightmost amount from semantic e-GP headers", () => {
  const page: PdfPositionedPage = {
    width: 1900,
    height: 900,
    items: [
      { text: "Opening Report Header", x: 850, y: 700, width: 180 },
      { text: "S. No", x: 35, y: 660, width: 50 },
      { text: "Name of Tenderer", x: 200, y: 660, width: 150 },
      { text: "Quoted Amount (in BDT) Without Discount", x: 520, y: 660, width: 340 },
      { text: "Discount in Percentage (%)", x: 990, y: 660, width: 220 },
      { text: "Discount in Amount", x: 1260, y: 660, width: 180 },
      { text: "Quoted Amount (in BDT) with Discount", x: 1550, y: 660, width: 320 },
      { text: "1", x: 52, y: 620, width: 8 },
      { text: "Mahmood & Co.", x: 100, y: 620, width: 120 },
      { text: "3064320.000", x: 790, y: 620, width: 100 },
      { text: "0.0", x: 1170, y: 620, width: 25 },
      { text: "0.0", x: 1410, y: 620, width: 25 },
      { text: "3064320.000", x: 1770, y: 620, width: 105 },
      { text: "2", x: 52, y: 590, width: 8 },
      { text: "Techseen Services", x: 100, y: 590, width: 140 },
      { text: "3070998.000", x: 790, y: 590, width: 100 },
      { text: "0.000", x: 1160, y: 590, width: 35 },
      { text: "0.000", x: 1400, y: 590, width: 35 },
      { text: "3070998.000", x: 1770, y: 590, width: 105 },
      { text: "Opening Report Footer", x: 20, y: 550, width: 180 }
    ]
  }

  assert.deepEqual(extractOpeningReportTable([page]), [
    { serial: "1", name: "Mahmood & Co.", amount: "3064320.000" },
    { serial: "2", name: "Techseen Services", amount: "3070998.000" }
  ])
})

test("extracts the three exact columns when e-GP headers wrap onto multiple lines", () => {
  const page: PdfPositionedPage = {
    width: 900,
    height: 900,
    items: [
      { text: "Opening Report Header", x: 390, y: 520, width: 145 },
      { text: "S.", x: 110, y: 490, width: 12 },
      { text: "No", x: 108, y: 475, width: 16 },
      { text: "Name of Tenderer", x: 150, y: 482, width: 105 },
      { text: "Quoted Amount (in BDT)", x: 285, y: 490, width: 145 },
      { text: "Without Discount", x: 305, y: 475, width: 110 },
      { text: "Discount in", x: 475, y: 490, width: 70 },
      { text: "Percentage (%)", x: 470, y: 475, width: 85 },
      { text: "Discount in", x: 575, y: 490, width: 70 },
      { text: "Amount", x: 590, y: 475, width: 45 },
      { text: "Quoted Amount (in BDT)", x: 675, y: 490, width: 145 },
      { text: "with Discount", x: 700, y: 475, width: 90 },
      { text: "1", x: 118, y: 445, width: 7 },
      { text: "Mahmood & Co.", x: 146, y: 445, width: 85 },
      { text: "3064320.000", x: 350, y: 445, width: 78 },
      { text: "0.0", x: 530, y: 445, width: 20 },
      { text: "0.0", x: 625, y: 445, width: 20 },
      { text: "3064320.000", x: 740, y: 445, width: 78 },
      { text: "Opening Report Footer", x: 108, y: 410, width: 140 }
    ]
  }

  assert.deepEqual(extractOpeningReportTable([page]), [
    { serial: "1", name: "Mahmood & Co.", amount: "3064320.000" }
  ])
})

async function readPositionedPages(filePath: string): Promise<PdfPositionedPage[]> {
  const bytes = new Uint8Array(await fs.readFile(filePath))
  const document = await getDocument({ data: bytes, verbosity: 0 }).promise
  const pages: PdfPositionedPage[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items = content.items.flatMap((item) => {
      if (!("str" in item) || !item.str.trim()) return []
      return [{
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5],
        width: item.width
      }]
    })
    pages.push({ width: viewport.width, height: viewport.height, items })
  }

  return pages
}
