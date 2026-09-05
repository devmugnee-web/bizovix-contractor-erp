import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { ProjectCostingReport } from "@bizovix/types";

/** PDF-only context: never substitutes another project's bill or sample data. */
export interface BillLetterContext {
  payeeName?: string | null;
  reference?: string | null;
  date?: string | null;
  contract?: { number: string; date: string; label: string } | null;
  productDetails?: Record<string, string>;
}

export const BILL_PAGE_MARGINS = { top: 90, bottom: 72, left: 72, right: 72 };
export const BILL_PAYMENT_REQUEST = "Therefore, you are kindly requested to pay the above bill in favor of Mugnee Multiple.";
const EXTENDED_LED_DISCOUNT = "Discount for Extended LED Display";
const SMALL = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function integerWords(value: bigint): string {
  if (value < 20n) return SMALL[Number(value)]!;
  if (value < 100n) return TENS[Number(value / 10n)]! + (value % 10n ? `-${SMALL[Number(value % 10n)]}` : "");
  for (const [scale, label] of [[10000000n, "Crore"], [100000n, "Lakh"], [1000n, "Thousand"], [100n, "Hundred"]] as const) {
    if (value >= scale) return `${integerWords(value / scale)} ${label}${value % scale ? ` ${integerWords(value % scale)}` : ""}`;
  }
  return "Zero";
}

export function billAmountInWords(value: string): string {
  const amount = new Prisma.Decimal(value);
  const [taka, paisa] = amount.abs().toFixed(2).split(".");
  return `${amount.isNegative() ? "Minus " : ""}${integerWords(BigInt(taka!))} Taka${Number(paisa) ? ` and ${integerWords(BigInt(paisa!))} Paisa` : ""} Only.`;
}

export function billNumber(value: string, minimum = 3, maximum = minimum, grouped = false): string {
  const [whole, fraction = ""] = new Prisma.Decimal(value).toFixed(maximum).split(".");
  const trimmed = fraction.replace(/0+$/, "").padEnd(minimum, "0");
  const integer = grouped ? whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole!;
  return integer + (trimmed ? `.${trimmed}` : "");
}

export function billLetterTotals(report: Pick<ProjectCostingReport, "rows" | "itemsTotalPrice" | "adjustments" | "totalPrice">) {
  const adjustments = report.adjustments ?? [];
  const isExtendedDiscount = (entry: { label: string }) => entry.label.trim() === EXTENDED_LED_DISCOUNT;
  const discounts = adjustments.filter(isExtendedDiscount);
  return [
    { label: "Total=", amount: report.itemsTotalPrice ?? report.rows.reduce((sum, row) => sum.plus(row.totalPrice), new Prisma.Decimal(0)).toFixed(2), digits: 3 },
    // The requested template row is always present. A missing amount stays blank;
    // it must not invent a deduction or change the saved grand total.
    ...(discounts.length ? discounts.map((entry) => ({ ...entry, label: EXTENDED_LED_DISCOUNT, digits: 3 })) : [{ label: EXTENDED_LED_DISCOUNT, amount: null, digits: 3 }]),
    ...adjustments.filter((entry) => !isExtendedDiscount(entry)).map((entry) => ({ ...entry, digits: 3 })),
    { label: "Grand Total =", amount: report.totalPrice, digits: 2 },
  ];
}

function dateLabel(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(date).replace(/ /g, "-");
}

export function generateBillLetterPdf(report: ProjectCostingReport, context: BillLetterContext = {}): Promise<Buffer> {
  const needsBengali = /[\u0980-\u09ff]/.test(JSON.stringify({ report, context }));
  const unicodeFont = needsBengali ? [process.env.BIZOVIX_PDF_FONT_PATH, "C:/Windows/Fonts/Nirmala.ttf", "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf"].find((file): file is string => !!file && existsSync(file)) : undefined;
  if (needsBengali && !unicodeFont) return Promise.reject(new BadRequestException("A Bengali PDF font must be configured to export these product names correctly"));
  const regular = unicodeFont ?? "Times-Roman";
  const bold = unicodeFont ?? "Times-Bold";
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: BILL_PAGE_MARGINS, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const left = BILL_PAGE_MARGINS.left;
    const top = BILL_PAGE_MARGINS.top;
    const bottom = doc.page.height - BILL_PAGE_MARGINS.bottom;
    const width = doc.page.width - left - BILL_PAGE_MARGINS.right;
    const widths = [0.065, 0.435, 0.07, 0.065, 0.18, 0.185].map((ratio) => ratio * width);
    const edges = [left];
    widths.forEach((cellWidth) => edges.push(edges[edges.length - 1]! + cellWidth));
    doc.font(regular).fontSize(9);
    const lineHeight = Math.max(11.5, doc.currentLineHeight(true) + 1);
    const padding = 3;
    const tableHeaderHeight = 26;
    let y = top;
    doc.fillColor("black").strokeColor("black").lineWidth(0.5);

    function nextPage() { doc.addPage(); y = top; }
    function font(isBold = false, size = 10) { doc.font(isBold ? bold : regular).fontSize(size).fillColor("black"); }
    function paragraph(text: string, isBold = false, gap = 0) {
      font(isBold);
      const height = doc.heightOfString(text, { width, lineGap: 1 });
      if (y + height > bottom) nextPage();
      doc.text(text, left, y, { width, lineGap: 1 });
      y = doc.y + gap;
    }
    function labelled(label: string, value: string, gap = 0) {
      font();
      const height = doc.heightOfString(`${label} ${value}`, { width, lineGap: 1 });
      if (y + height > bottom) nextPage();
      font(true);
      doc.text(`${label} `, left, y, { width, lineGap: 1, continued: true });
      font();
      doc.text(value, { width, lineGap: 1 });
      y = doc.y + gap;
    }

    font(true, 14);
    doc.text("Bill", left, y, { width, align: "center", underline: true });
    y = doc.y + 13;
    font(true);
    const dateWidth = width * 0.24;
    const ref = `Ref: ${context.reference || ""}`;
    const refHeight = doc.heightOfString(ref, { width: width - dateWidth - 12 });
    doc.text(ref, left, y, { width: width - dateWidth - 12 });
    doc.text(`Date: ${dateLabel(context.date)}`, left + width - dateWidth, y, { width: dateWidth });
    y += Math.max(12, refHeight) + 12;
    paragraph("To", true);
    if (report.pa.name || !report.pa.designation) paragraph(report.pa.name || "________________________", true);
    if (report.pa.designation) paragraph(report.pa.designation, true);
    if (report.project.organizationName) paragraph(report.project.organizationName);
    if (report.pa.address) paragraph(report.pa.address);
    if (report.pa.phone) paragraph(`Phone: ${report.pa.phone}`);
    if (report.pa.email) paragraph(`Email: ${report.pa.email}`);
    y += 12;
    const workName = report.project.workName.replace(/[.\s]+$/, "");
    labelled("Sub:", `Submission of Bill for ${workName}.`, 10);
    paragraph("Dear Sir,", true);
    const contract = context.contract ? `, ${context.contract.label}: ${context.contract.number}, Dated: ${dateLabel(context.contract.date)}` : "";
    // A costing export is not evidence that delivery or contract completion occurred.
    paragraph(`With due all respect to you, I would like to submit the bill for ${workName} as per the Tender Id: ${report.tenderNumber || "________________"}${contract}. The bill is as below:`, false, 10);
    paragraph("So, now please accept the goods mentioned as below:", false, 2);

    function grid(height: number, merged = false) {
      doc.rect(left, y, width, height).stroke();
      for (const x of merged ? [edges[5]!] : edges.slice(1, -1)) doc.moveTo(x, y).lineTo(x, y + height).stroke();
    }
    function tableHeader() {
      if (y + tableHeaderHeight + 18 > bottom) nextPage();
      grid(tableHeaderHeight);
      ["Sl\nNo.", "Description of Item", "Unit", "Qty", "Unit BDT", "Total BDT"].forEach((title, index) => {
        font(true, 9);
        const cellWidth = widths[index]! - 2 * padding;
        const height = doc.heightOfString(title, { width: cellWidth });
        doc.text(title, edges[index]! + padding, y + (tableHeaderHeight - height) / 2, { width: cellWidth, align: "center" });
      });
      y += tableHeaderHeight;
    }
    function wrap(text: string, cellWidth: number, isBold = false): string[] {
      font(isBold, 9);
      const lines: string[] = [];
      for (const paragraph of text.replace(/\r/g, "").split("\n")) {
        let current = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          const next = current ? `${current} ${word}` : word;
          if (doc.widthOfString(next) <= cellWidth) { current = next; continue; }
          if (current) lines.push(current);
          current = "";
          for (const character of word) {
            if (current && doc.widthOfString(current + character) > cellWidth) { lines.push(current); current = ""; }
            current += character;
          }
        }
        lines.push(current);
      }
      return lines;
    }
    function cellText(text: string, index: number, height: number, align: "left" | "center" | "right") {
      const available = widths[index]! - 2 * padding;
      font(false, 9);
      // Preserve every digit and unit label without breaking them across lines.
      const size = Math.min(9, 9 * available / Math.max(1, doc.widthOfString(text)));
      font(false, size);
      doc.text(text, edges[index]! + padding, y + (height - doc.currentLineHeight()) / 2, { width: available, align, lineBreak: false });
    }

    tableHeader();
    report.rows.forEach((row, index) => {
      const details = context.productDetails?.[row.id]?.trim();
      const description = row.productName + (details && !row.productName.includes(details) ? `\n${details}` : "");
      const paragraphs = description.replace(/\s*\b(Brand|Model)\s*:/gi, "\n$1:").trim().split("\n");
      const lines = paragraphs.flatMap((line, part) => wrap(line, widths[1]! - 2 * padding, part === 0).map((text) => ({ text, bold: part === 0 })));
      const fullHeight = Math.max(18, lines.length * lineHeight + 2 * padding);
      if (fullHeight <= bottom - top - tableHeaderHeight && y + fullHeight > bottom) { nextPage(); tableHeader(); }
      let first = true;
      while (lines.length) {
        if (bottom - y < 18) { nextPage(); tableHeader(); }
        const capacity = Math.max(1, Math.floor((bottom - y - 2 * padding) / lineHeight));
        const fragment = lines.splice(0, capacity);
        const height = Math.max(18, fragment.length * lineHeight + 2 * padding);
        grid(height);
        fragment.forEach((line, lineIndex) => {
          font(line.bold, 9);
          doc.text(line.text, edges[1]! + padding, y + padding + lineIndex * lineHeight, { width: widths[1]! - 2 * padding, lineBreak: false });
        });
        if (first) {
          cellText(String(index + 1), 0, height, "center");
          cellText(row.unit, 2, height, "center");
          const qty = billNumber(row.quantity, 0, 3);
          cellText(/^\d$/.test(qty) ? qty.padStart(2, "0") : qty, 3, height, "center");
          cellText(billNumber(row.unitPrice, 3, 6), 4, height, "right");
          cellText(billNumber(row.totalPrice), 5, height, "right");
        }
        y += height;
        first = false;
        if (lines.length) { nextPage(); tableHeader(); }
      }
    });

    const totals = billLetterTotals(report);
    const inWords = billAmountInWords(report.totalPrice);
    const closing = BILL_PAYMENT_REQUEST;
    font();
    const closingHeight = doc.heightOfString(`In Words: ${inWords}\n${closing}\n\nYours Truly,`, { width, lineGap: 1 }) + 12;
    if (totals.length * 18 + closingHeight <= bottom - top && y + totals.length * 18 + closingHeight > bottom) nextPage();
    for (const entry of totals) {
      if (y + 18 > bottom) nextPage();
      grid(18, true);
      font(true, 9);
      doc.text(entry.label, left + padding, y + 4, { width: edges[5]! - left - 2 * padding, align: "right", lineBreak: false });
      if (entry.amount !== null) {
        const amount = /discount/i.test(entry.label) && new Prisma.Decimal(entry.amount).isNegative() ? new Prisma.Decimal(entry.amount).abs().toString() : entry.amount;
        cellText(billNumber(amount, entry.digits, entry.digits, true), 5, 18, "right");
      }
      y += 18;
    }
    y += 4;
    labelled("In Words:", inWords);
    paragraph(closing, false, 12);
    paragraph("Yours Truly,");
    doc.end();
  });
}
