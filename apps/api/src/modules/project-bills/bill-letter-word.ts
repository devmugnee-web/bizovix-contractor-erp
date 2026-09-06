import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { ProjectCostingReport } from "@bizovix/types";
import { AlignmentType, TableRow, type Paragraph, type Table } from "docx";
import { packWordLetter, wordCell, wordDate, wordDescription, wordParagraph, wordReference, wordRun, wordTable } from "../../common/documents/word-letter";
import { billAmountInWords, billLetterTotals, billNumber, BILL_PAGE_MARGINS, BILL_PAYMENT_REQUEST, type BillLetterContext } from "./bill-letter-pdf";

export function generateBillLetterWord(report: ProjectCostingReport, context: BillLetterContext = {}): Promise<Buffer> {
  if (!report.rows.length) return Promise.reject(new BadRequestException("No saved costing items are available for this tender"));
  const pageWidth = 11906;
  const width = pageWidth - 20 * (BILL_PAGE_MARGINS.left + BILL_PAGE_MARGINS.right);
  const widths = [0.065, 0.435, 0.07, 0.065, 0.18].map((ratio) => Math.round(width * ratio));
  widths.push(width - widths.reduce((sum, value) => sum + value, 0));
  const p = (text: string, bold = false, after = 0) => wordParagraph([wordRun(text, { bold, size: 20, sizeComplexScript: 20 })], 10, { spacing: { before: 0, after, line: 230 } });
  const children: (Paragraph | Table)[] = [
    wordParagraph([wordRun("Bill", { bold: true, underline: {}, size: 28 })], 14, { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 260 } }),
    wordReference(context.reference || "", context.date || "", width, 10), p("", false, 40), p("To", true),
  ];
  if (report.pa.name || !report.pa.designation) children.push(p(report.pa.name || "________________________", true));
  if (report.pa.designation) children.push(p(report.pa.designation, true));
  if (report.project.organizationName) children.push(p(report.project.organizationName));
  if (report.pa.address) children.push(wordParagraph(report.pa.address, 10));
  if (report.pa.phone) children.push(p(`Phone: ${report.pa.phone}`));
  if (report.pa.email) children.push(p(`Email: ${report.pa.email}`));
  const workName = report.project.workName.replace(/[.\s]+$/, "");
  children.push(wordParagraph([wordRun("Sub: ", { bold: true }), wordRun(`Submission of Bill for ${workName}.`)], 10, { spacing: { before: 240, after: 200 } }), p("Dear Sir,", true));
  const contract = context.contract ? `, ${context.contract.label}: ${context.contract.number}, Dated: ${wordDate(context.contract.date)}` : "";
  children.push(p(`With due all respect to you, I would like to submit the bill for ${workName} as per the Tender Id: ${report.tenderNumber || "________________"}${contract}. The bill is as below:`, false, 200));
  children.push(p("So, now please accept the goods mentioned as below:", false, 40));
  const cell = (text: string, index: number, bold = false, align: "center" | "right" = "center") => wordCell([wordParagraph([wordRun(text, { bold, size: 18 })], 9, { alignment: align })], widths[index]!, 60);
  const rows = [new TableRow({ tableHeader: true, cantSplit: true, children: ["Sl No.", "Description of Item", "Unit", "Qty", "Unit BDT", "Total BDT"].map((text, index) => cell(text, index, true)) })];
  report.rows.forEach((row, index) => {
    const details = context.productDetails?.[row.id]?.trim();
    const description = row.productName + (details && !row.productName.includes(details) ? `\n${details}` : "");
    const qty = billNumber(row.quantity, 0, 3);
    rows.push(new TableRow({ cantSplit: description.length < 1800, children: [
      cell(String(index + 1), 0), wordCell(wordDescription(description, 9), widths[1]!, 60), cell(row.unit, 2),
      cell(/^\d$/.test(qty) ? qty.padStart(2, "0") : qty, 3), cell(billNumber(row.unitPrice, 3, 6), 4, false, "right"), cell(billNumber(row.totalPrice), 5, false, "right"),
    ] }));
  });
  for (const entry of billLetterTotals(report)) {
    const value = entry.amount === null ? "" : billNumber(/discount/i.test(entry.label) ? new Prisma.Decimal(entry.amount).abs().toString() : entry.amount, entry.digits, entry.digits, true);
    rows.push(new TableRow({ cantSplit: true, children: [
      wordCell([wordParagraph([wordRun(entry.label, { bold: true, size: 18 })], 9, { alignment: AlignmentType.RIGHT })], width - widths[5]!, 60, 5), cell(value, 5, false, "right"),
    ] }));
  }
  children.push(wordTable(rows, widths));
  children.push(wordParagraph([wordRun("In Words: ", { bold: true }), wordRun(billAmountInWords(report.totalPrice))], 10, { spacing: { before: 80, after: 0 } }));
  children.push(p(BILL_PAYMENT_REQUEST, false, 240), p("Yours Truly,"));
  return packWordLetter("Bill", children, { size: { width: pageWidth, height: 16838 }, margin: {
    top: BILL_PAGE_MARGINS.top * 20, bottom: BILL_PAGE_MARGINS.bottom * 20, left: BILL_PAGE_MARGINS.left * 20, right: BILL_PAGE_MARGINS.right * 20, header: 720, footer: 720,
  } }, 10);
}
