import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { BadRequestException } from "@nestjs/common";
import type { ProjectCostingReport } from "@bizovix/types";
import { generateBillLetterPdf, type BillLetterContext } from "./bill-letter-pdf";

const number = (value: string, digits = 2) => Number(value).toLocaleString("en-US", { minimumFractionDigits: digits === 2 ? 2 : 0, maximumFractionDigits: digits });

// PDF coordinates are points (72 per inch). Keep the requested letterhead and
// footer spaces clear on every page, including continuation pages and page numbers.
const PAGE_MARGINS = { top: 1.25 * 72, bottom: 72, left: 32, right: 32 };
const FOOTER_HEIGHT = 10;
const FOOTER_GAP = 14;

export function generateProjectCostingPdf(report: ProjectCostingReport, context?: BillLetterContext): Promise<Buffer> {
  if (report.source === "TENDER_COSTING") return generateBillLetterPdf(report, context);
  const needsBengali = /[\u0980-\u09ff]/.test(JSON.stringify(report));
  const unicodeFont = needsBengali ? [process.env.BIZOVIX_PDF_FONT_PATH, "C:/Windows/Fonts/Nirmala.ttf", "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf"].find((path): path is string => !!path && existsSync(path)) : undefined;
  if (needsBengali && !unicodeFont) return Promise.reject(new BadRequestException("A Bengali PDF font must be configured to export these product names correctly"));
  const regular = unicodeFont ?? "Helvetica";
  const bold = unicodeFont ?? "Helvetica-Bold";
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: PAGE_MARGINS, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const left = PAGE_MARGINS.left;
    const top = PAGE_MARGINS.top;
    const widths = [27, 205, 40, 62, 98, 99];
    const tableWidth = widths.reduce((a, b) => a + b, 0);
    const footerY = doc.page.height - PAGE_MARGINS.bottom - FOOTER_HEIGHT;
    const bottom = footerY - FOOTER_GAP;
    const headings = ["SL", "Product Name", "Unit", "Quantity", "Unit Price", "Total Price"];
    let y = top;

    doc.fillColor("#10244c").font(bold).fontSize(18).text("Project Items (BOQ)", left, y);
    doc.moveDown(0.4).fontSize(11).text(report.project.workName, { width: tableWidth });
    doc.moveDown(0.4).font(regular).fontSize(9).fillColor("#52627d").text(report.project.organizationName, { width: tableWidth });
    doc.moveDown(0.4).text(`Tender ID: ${report.tenderNumber ?? "-"}${report.costingDate ? `    |    Costing Date: ${report.costingDate.slice(0, 10)}` : ""}    |    Currency: BDT`, { width: tableWidth });
    doc.moveDown(0.8).font(bold).fontSize(10).fillColor("#10244c").text("PA Information", { width: tableWidth });
    doc.moveDown(0.4).font(regular).fontSize(9);
    const paFields = [["PA Name", report.pa.name], ["Designation", report.pa.designation], ["Phone Number", report.pa.phone], ["Address", report.pa.address]];
    if (report.pa.email) paFields.push(["Email", report.pa.email]);
    for (const [label, value] of paFields) doc.text(`${label}: ${value || "-"}`, { width: tableWidth, lineGap: 3 });
    y = doc.y + 18;

    function header() {
      if (y + 28 > bottom) { doc.addPage(); y = top; }
      doc.rect(left, y, tableWidth, 27).fill("#245cb7");
      let x = left;
      headings.forEach((title, i) => {
        doc.font(bold).fontSize(8).fillColor("#ffffff").text(title, x + 5, y + 9, { width: widths[i]! - 10, align: i >= 3 ? "right" : "left", lineBreak: false });
        x += widths[i]!;
      });
      y += 27;
    }

    // Wrap by measured width, including long unbroken names, then paginate rows safely.
    function linesFor(text: string): string[] {
      doc.font(regular).fontSize(9);
      const lines: string[] = [];
      for (const paragraph of text.replace(/\r/g, "").split("\n")) {
        let current = "";
        for (const word of paragraph.split(/\s+/)) {
          const next = current ? `${current} ${word}` : word;
          if (doc.widthOfString(next) <= widths[1]! - 12) { current = next; continue; }
          if (current) lines.push(current);
          current = "";
          for (const character of word) {
            if (current && doc.widthOfString(current + character) > widths[1]! - 12) { lines.push(current); current = ""; }
            current += character;
          }
        }
        lines.push(current);
      }
      return lines;
    }

    header();
    report.rows.forEach((row, index) => {
      const lines = linesFor(row.productName);
      const lineHeight = doc.currentLineHeight(true) + 1;
      const fullHeight = Math.max(30, lines.length * lineHeight + 12);
      // Keep ordinary product rows together; only exceptionally long rows span pages.
      if (fullHeight <= bottom - top - 27 && y + fullHeight > bottom) {
        doc.addPage(); y = top; header();
      }
      let firstPart = true;
      while (lines.length) {
        if (bottom - y < 30) { doc.addPage(); y = top; header(); }
        const capacity = Math.max(1, Math.floor((bottom - y - 12) / lineHeight));
        const fragment = lines.splice(0, capacity);
        const height = Math.max(30, fragment.length * lineHeight + 12);
        if (index % 2 === 0) doc.rect(left, y, tableWidth, height).fill("#f5f8fc");
        const cells = [firstPart ? String(index + 1) : "", fragment.join("\n"), firstPart ? row.unit : "", firstPart ? number(row.quantity, 3) : "", firstPart ? number(row.unitPrice, 2) : "", firstPart ? number(row.totalPrice) : ""];
        let x = left;
        cells.forEach((cell, i) => {
          doc.font(regular).fontSize(9).fillColor("#10244c").text(cell, x + 5, y + 6, { width: widths[i]! - 10, align: i >= 3 ? "right" : "left", lineGap: 1, lineBreak: i === 1 });
          x += widths[i]!;
        });
        y += height;
        doc.moveTo(left, y).lineTo(left + tableWidth, y).strokeColor("#e1e7f0").stroke();
        firstPart = false;
        if (lines.length) { doc.addPage(); y = top; header(); }
      }
    });
    const totals = [
      ...(report.adjustments?.length ? [{ label: "Items Total", amount: report.itemsTotalPrice || "0" }, ...report.adjustments] : []),
      { label: "Total (BDT)", amount: report.totalPrice },
    ];
    for (const [index, entry] of totals.entries()) {
      if (y + 40 > bottom) { doc.addPage(); y = top; }
      doc.font(index === totals.length - 1 ? bold : regular).fontSize(index === totals.length - 1 ? 11 : 9).fillColor("#10244c").text(`${entry.label}: ${number(entry.amount)}`, left, y + 15, { width: tableWidth, align: "right" });
      y = doc.y + 3;
    }
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font(regular).fontSize(8).fillColor("#68768d").text(`${i + 1} / ${range.count}`, left, footerY, { width: tableWidth, align: "right", lineBreak: false });
    }
    doc.end();
  });
}
