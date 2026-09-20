import fs from "node:fs"
import path from "node:path"

const bidders = [
  ["1", "M/S. A & J International", "3126700.000"],
  ["2", "Maxwell International", "3134430.000"],
  ["3", "md abu musa", "3290740.000"],
  ["4", "M/s. Hoque Techno Associates", "3414400.000"],
  ["5", "MUGNEE MULTIPLE", "3581524.350"]
]

const samples = [
  {
    file: "tender-opening-report-sample.pdf",
    pageCount: 2,
    width: 612,
    height: 792,
    tablePage: 2,
    tableTop: 650,
    columns: [42, 150, 282, 370, 445, 540],
    mergeFinalColumns: false
  },
  {
    file: "tender-opening-report-sample-alt.pdf",
    pageCount: 3,
    width: 595,
    height: 842,
    tablePage: 3,
    tableTop: 755,
    columns: [32, 132, 264, 354, 430, 525],
    mergeFinalColumns: true
  }
]

for (const sample of samples) {
  const pages = Array.from({ length: sample.pageCount }, (_, index) =>
    index + 1 === sample.tablePage ? createTablePage(sample) : createIntroPage(sample, index + 1)
  )
  const bytes = buildPdf(pages, sample.width, sample.height)
  fs.writeFileSync(path.join("public", "samples", sample.file), bytes)
}

function createIntroPage(sample, pageNumber) {
  return [
    text(48, sample.height - 70, 18, "e-GP Tender Opening Report"),
    text(48, sample.height - 100, 11, `Tender details and supporting information - page ${pageNumber}`),
    text(48, sample.height - 140, 10, "This page intentionally contains earlier tender information only."),
    text(48, 35, 9, `${pageNumber}/${sample.pageCount}`)
  ]
}

function createTablePage(sample) {
  const [serialX, nameX, quotedX, percentX, discountX, finalX] = sample.columns
  const top = sample.tableTop
  const commands = [
    text(170, top, 16, "Opening Report Header"),
    text(serialX, top - 28, 9, "S. No"),
    text(nameX - 35, top - 28, 9, "Name of Tenderer"),
    text(quotedX - 45, top - 28, 8, "Quoted Amount Without Discount"),
    text(percentX - 24, top - 28, 8, "Discount %"),
    text(discountX - 18, top - 28, 8, "Discount Amount"),
    text(finalX - 52, top - 28, 8, "Quoted Amount with Discount"),
    text(serialX, top - 43, 8, "(1)"),
    text(nameX, top - 43, 8, "(2)"),
    text(quotedX, top - 43, 8, "(3)"),
    text(percentX, top - 43, 8, "(4)"),
    text(discountX, top - 43, 8, "(5)"),
    text(finalX, top - 43, 8, "(6) = (2) - (5)")
  ]

  bidders.forEach(([serial, name, amount], index) => {
    const y = top - 72 - index * 38
    commands.push(text(serialX + 4, y, 10, serial))
    commands.push(text(nameX - 48, y, 10, name))
    commands.push(text(quotedX - 22, y, 10, amount))
    if (sample.mergeFinalColumns) {
      commands.push(text(percentX - 12, y, 10, `0.000 0.000 ${amount}`))
    } else {
      commands.push(text(percentX, y, 10, "0.000"))
      commands.push(text(discountX, y, 10, "0.000"))
      commands.push(text(finalX - 18, y, 10, amount))
    }
  })

  commands.push(text(42, top - 72 - bidders.length * 38, 12, "Opening Report Footer"))
  commands.push(text(48, 35, 9, `${sample.tablePage}/${sample.pageCount}`))
  return commands
}

function text(x, y, size, value) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

function buildPdf(pages, width, height) {
  const objects = []
  const addObject = (body) => {
    objects.push(body)
    return objects.length
  }

  const catalogId = addObject("")
  const pagesId = addObject("")
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
  const pageIds = []

  for (const pageCommands of pages) {
    const stream = pageCommands.join("\n")
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    pageIds.push(pageId)
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`

  let output = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output))
    output += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(output, "binary")
}
