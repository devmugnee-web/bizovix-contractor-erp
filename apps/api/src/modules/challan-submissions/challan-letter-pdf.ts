import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { BadRequestException } from "@nestjs/common";

/** Deliberately non-financial: prices and totals cannot enter the template. */
export interface ChallanLetter {
  reference: string;
  date: string;
  tenderNumber: string | null;
  recipient: { name: string | null; designation: string | null; organization: string | null; address: string | null };
  contract: { number: string; date: string; label: string } | null;
  rows: { description: string; unit: string; quantity: string; deliveryPlace: string }[];
}

// Match the supplied Word document: Letter, 1-inch text margins and a centered
// 7.375-inch table (the reference table extends beyond the paragraph margins).
export const CHALLAN_LAYOUT = { page: "LETTER", margin: 72, tableWidth: 531 } as const;
export const CHALLAN_HEADINGS = ["Sl. No.", "Name of Goods", "Unit", "Qty", "Place of Delivery"] as const;

// Notice imports can include the field label in the saved address. Strip only
// leading labels for delivery display; never change the stored PA information.
export function challanDeliveryAddress(value?: string | null) {
  return (value ?? "").trim().replace(/^(?:address\s*[:：]\s*)+/i, "").trim();
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dhaka",
  }).format(date).replace(/ /g, "-") : "";
}

export function challanQuantity(value: string) {
  const trimmed = value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return /^\d$/.test(trimmed) ? trimmed.padStart(2, "0") : trimmed;
}

export function generateChallanLetterPdf(letter: ChallanLetter): Promise<Buffer> {
  if (!letter.rows.length) return Promise.reject(new BadRequestException("Add goods and save the challan before downloading its PDF"));
  const needsBengali = /[\u0980-\u09ff]/.test(JSON.stringify(letter));
  const unicodeFont = needsBengali ? [process.env.BIZOVIX_PDF_FONT_PATH, "C:/Windows/Fonts/Nirmala.ttf", "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf"].find((file): file is string => !!file && existsSync(file)) : undefined;
  if (needsBengali && !unicodeFont) return Promise.reject(new BadRequestException("A Bengali PDF font must be configured to export these goods correctly"));
  const regular = unicodeFont ?? "Times-Roman";
  const bold = unicodeFont ?? "Times-Bold";
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: CHALLAN_LAYOUT.page, margin: CHALLAN_LAYOUT.margin });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const left = CHALLAN_LAYOUT.margin;
    const width = doc.page.width - left * 2;
    const bottom = doc.page.height - left;
    const tableLeft = (doc.page.width - CHALLAN_LAYOUT.tableWidth) / 2;
    const widths = [985, 4410, 900, 900, 3425].map((twips) => twips / 20);
    const edges = [tableLeft];
    widths.forEach((cellWidth) => edges.push(edges[edges.length - 1]! + cellWidth));
    const padding = 4;
    const headerHeight = 26;
    let y: number = left;
    const font = (isBold = false, size = 11) => doc.font(isBold ? bold : regular).fontSize(size).fillColor("black");
    font();
    const lineHeight = Math.max(12, doc.currentLineHeight(true));
    const nextPage = () => { doc.addPage(); y = left; };
    function paragraph(text: string, isBold = false, gap = 0) {
      font(isBold);
      if (y + doc.heightOfString(text, { width, lineGap: 0 }) > bottom) nextPage();
      doc.text(text, left, y, { width, lineGap: 0 });
      y = doc.y + gap;
    }
    font(true, 16);
    doc.text("Challan", left, y, { width, align: "center", underline: true });
    y = doc.y + 12;
    font(true);
    const dateWidth = 110;
    const ref = `Ref: ${letter.reference}`;
    const refHeight = doc.heightOfString(ref, { width: width - dateWidth - 12 });
    doc.text(ref, left, y, { width: width - dateWidth - 12 });
    doc.text(`Date: ${dateLabel(letter.date)}`, left + width - dateWidth, y, { width: dateWidth });
    y += Math.max(refHeight, 14) + 12;
    paragraph("To", true);
    const pa = letter.recipient;
    if (pa.name) paragraph(pa.name, true);
    if (pa.designation) paragraph(pa.designation, true);
    if (!pa.name && !pa.designation) paragraph("________________________");
    if (pa.organization) paragraph(pa.organization);
    if (pa.address) paragraph(pa.address);
    y += 15;
    paragraph("Sub: Application for Acceptance of goods.", true, 12);
    paragraph("Dear Sir,", true, 12);
    const contract = letter.contract ? `, ${letter.contract.label}: ${letter.contract.number} Dated: ${dateLabel(letter.contract.date)}` : "";
    paragraph(`With due all respect to you, I would like to inform you that, we are ready for supply the goods as per the Tender Id: ${letter.tenderNumber || "________________"}${contract}.`, false, 10);
    paragraph("So, now please accept the goods mentioned as below:", false, 10);

    function grid(height: number) {
      doc.strokeColor("black").lineWidth(0.5).rect(tableLeft, y, CHALLAN_LAYOUT.tableWidth, height).stroke();
      edges.slice(1, -1).forEach((x) => doc.moveTo(x, y).lineTo(x, y + height).stroke());
    }
    function header() {
      if (y + headerHeight + lineHeight + 2 * padding > bottom) nextPage();
      grid(headerHeight);
      CHALLAN_HEADINGS.forEach((title, index) => {
        font(true);
        const available = widths[index]! - padding * 2;
        const height = doc.heightOfString(title, { width: available });
        doc.text(title, edges[index]! + padding, y + (headerHeight - height) / 2, { width: available, align: "center" });
      });
      y += headerHeight;
    }
    function wrap(text: string, index: number, isBold = false) {
      font(isBold);
      const available = widths[index]! - padding * 2;
      const lines: { text: string; bold: boolean }[] = [];
      for (const part of text.replace(/\r/g, "").split("\n")) {
        let current = "";
        for (const word of part.split(/\s+/).filter(Boolean)) {
          const next = current ? `${current} ${word}` : word;
          if (doc.widthOfString(next) <= available) { current = next; continue; }
          if (current) lines.push({ text: current, bold: isBold });
          current = "";
          for (const character of word) {
            if (current && doc.widthOfString(current + character) > available) { lines.push({ text: current, bold: isBold }); current = ""; }
            current += character;
          }
        }
        lines.push({ text: current, bold: isBold });
      }
      return lines;
    }
    header();
    letter.rows.forEach((row, rowIndex) => {
      const description = row.description.replace(/\s*\b(Brand|Model)\s*:/gi, "\n$1:").trim();
      const cells = [
        wrap(String(rowIndex + 1).padStart(2, "0"), 0),
        description.split("\n").flatMap((part, index) => wrap(part, 1, index === 0)),
        wrap(row.unit, 2), wrap(challanQuantity(row.quantity), 3), wrap(challanDeliveryAddress(row.deliveryPlace), 4),
      ];
      const fullHeight = Math.max(...cells.map((lines) => lines.length)) * lineHeight + 2 * padding;
      // Keep ordinary rows together; split only rows too large for an entire page.
      if (fullHeight <= bottom - left - headerHeight && y + fullHeight > bottom) { nextPage(); header(); }
      while (cells.some((lines) => lines.length)) {
        if (bottom - y < lineHeight + 2 * padding) { nextPage(); header(); }
        const capacity = Math.max(1, Math.floor((bottom - y - 2 * padding) / lineHeight));
        const fragments = cells.map((lines) => lines.splice(0, capacity));
        const height = Math.max(...fragments.map((lines) => lines.length)) * lineHeight + 2 * padding;
        grid(height);
        fragments.forEach((lines, index) => lines.forEach((line, lineIndex) => {
          font(line.bold);
          const offset = index === 1 ? padding : (height - lines.length * lineHeight) / 2;
          doc.text(line.text, edges[index]! + padding, y + offset + lineIndex * lineHeight, { width: widths[index]! - 2 * padding, lineBreak: false, align: index === 1 ? "left" : "center" });
        }));
        y += height;
        if (cells.some((lines) => lines.length)) { nextPage(); header(); }
      }
    });
    y += 24;
    paragraph("Yours Truly,");
    doc.end();
  });
}
