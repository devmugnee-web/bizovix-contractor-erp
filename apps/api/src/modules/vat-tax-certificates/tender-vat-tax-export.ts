import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { BadRequestException } from "@nestjs/common";
import type { TenderVatTaxService } from "./tender-vat-tax.service";
type Report = Awaited<ReturnType<TenderVatTaxService["exportData"]>>;
const kind = (value: string | null) => value === "SELF_DEPOSIT" ? "Self Deposit" : value === "BILL_DEDUCTION" ? "Bill Deduction" : "All methods";
const money = (value: string) => { const [whole, fraction = "00"] = value.split("."); return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`; };
function scope(report: Report) { return `${report.dateFrom || "Beginning"} to ${report.dateTo || "Present"} | ${kind(report.entryKind)} | ${report.taxType || "VAT & Tax"}`; }
const tenderHeaders = ["SL", "Tender ID", "Work Name", "VAT (BDT)", "Tax (BDT)", "Total (BDT)"];
const entryHeaders = ["Date", "Tender ID", "Type", "Method", "Payment / Bill Reference", "Amount (BDT)"];

export async function tenderTaxExcel(report: Report) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = "Bizovix";
  // Excel has 15 significant digits. Preserve larger exact decimal values as text.
  const exactMoney = (s: string) => s.replace(/[^0-9]/g, "").length <= 15 ? Number(s) : s;
  const summary = workbook.addWorksheet("Tender Summary");
  summary.addRow(["Tender VAT & Tax Register"]); summary.addRow([scope(report)]);
  summary.addRow(["Method", "VAT (BDT)", "Tax (BDT)"]);
  summary.addRow(["Self deposits", exactMoney(report.totals.depositedVat), exactMoney(report.totals.depositedTax)]);
  summary.addRow(["Bill deductions", exactMoney(report.totals.deductedVat), exactMoney(report.totals.deductedTax)]);
  summary.addRow(["Total", exactMoney(report.totals.vat), exactMoney(report.totals.tax)]);
  summary.addRow(["Certificates and costing estimates are not counted again."]); summary.addRow([]); summary.addRow(tenderHeaders);
  summary.mergeCells("A1:F1"); summary.mergeCells("A2:F2"); summary.mergeCells("A7:F7");
  summary.getRow(1).height = 26; summary.getRow(1).font = { size: 15, bold: true }; summary.getRow(2).height = 24;
  report.tenders.forEach((t, i) => summary.addRow([i + 1, t.tenderNumber || "", t.workName, exactMoney(t.vat), exactMoney(t.tax), exactMoney(t.total)]));
  summary.addRow(["", "", "Total", exactMoney(report.totals.vat), exactMoney(report.totals.tax), exactMoney(report.totals.total)]);
  summary.columns.forEach((c, i) => { c.width = [8, 22, 60, 23, 23, 23][i] ?? 22; });
  summary.autoFilter = { from: { row: 9, column: 1 }, to: { row: 9 + report.tenders.length, column: 6 } };
  const entries = workbook.addWorksheet("Entries"); entries.addRow([scope(report)]);
  entries.mergeCells("A1:H1"); entries.getRow(1).height = 25;
  entries.addRow([...entryHeaders, "Work Name", "Notes"]);
  report.entries.forEach((e) => entries.addRow([e.entryDate, e.tender.tenderNumber || "", e.taxType, kind(e.entryKind), e.referenceNo, exactMoney(e.amount), e.tender.workName, e.notes || ""]));
  entries.columns.forEach((c, i) => { c.width = [16, 22, 10, 22, 35, 23, 60, 60][i] ?? 22; });
  entries.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + report.entries.length, column: 8 } };
  for (const [sheet, headerRow] of [[summary, 9], [entries, 2]] as const) {
    sheet.views = [{ state: "frozen", ySplit: headerRow }];
    sheet.getRow(headerRow).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF245CB7" } }; });
    sheet.eachRow((row) => {
      let lines = 1;
      row.eachCell((cell) => {
        cell.alignment = { vertical: "top", wrapText: true };
        if (typeof cell.value === "number" && (sheet === entries ? Number(cell.col) === 6 : row.number <= 6 || Number(cell.col) >= 4)) cell.numFmt = "#,##0.00";
        if (row.number > headerRow) lines = Math.max(lines, ...String(cell.value ?? "").split("\n").map((text) => Math.ceil(text.length / Math.max(6, (sheet.getColumn(Number(cell.col)).width ?? 20) - 2))));
      });
      if (row.number > headerRow) row.height = Math.max(19, lines * 15);
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function tenderTaxPdf(report: Report): Promise<Buffer> {
  const bengali = /[\u0980-\u09ff]/.test(JSON.stringify(report));
  const font = bengali ? [process.env.BIZOVIX_PDF_FONT_PATH, "C:/Windows/Fonts/Nirmala.ttf", "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf"].find((p): p is string => !!p && existsSync(p)) : "Helvetica";
  if (!font) throw new BadRequestException("A Bengali PDF font must be configured before exporting this report");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 35 });
    const chunks: Buffer[] = []; doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    doc.font(font).fontSize(17).text("Tender VAT & Tax Register");
    doc.moveDown(0.3).fontSize(9).text(scope(report));
    if (report.detail && report.tenders[0]) doc.moveDown(0.4).text(`${report.tenders[0].tenderNumber || ""} | ${report.tenders[0].workName}`);
    doc.moveDown().fontSize(10).text(`VAT: BDT ${money(report.totals.vat)}     Tax: BDT ${money(report.totals.tax)}     Total: BDT ${money(report.totals.total)}`);
    doc.fontSize(8).text(`Self deposits: VAT ${money(report.totals.depositedVat)}, Tax ${money(report.totals.depositedTax)}   |   Bill deductions: VAT ${money(report.totals.deductedVat)}, Tax ${money(report.totals.deductedTax)}`);
    doc.text("Based on deposit/deduction dates. Costing estimates and certificates are not added to these totals.");
    const left = 35, bottom = doc.page.height - 35, width = doc.page.width - 70, padding = 5, line = 12;
    const ratios = report.detail ? [0.12, 0.13, 0.07, 0.16, 0.35, 0.17] : [0.05, 0.13, 0.37, 0.15, 0.15, 0.15];
    const widths = ratios.map((ratio) => ratio * width), headers = report.detail ? entryHeaders : tenderHeaders;
    const rows = report.detail ? report.entries.map((e) => [e.entryDate, e.tender.tenderNumber || "—", e.taxType, kind(e.entryKind), e.referenceNo, money(e.amount)])
      : report.tenders.map((t, i) => [String(i + 1), t.tenderNumber || "—", t.workName, money(t.vat), money(t.tax), money(t.total)]);
    let y = doc.y + 15;
    const page = () => { doc.addPage(); y = 35; };
    function cells(texts: string[], height: number, heading = false) {
      let x = left;
      texts.forEach((text, i) => { doc.rect(x, y, widths[i]!, height).fillAndStroke(heading ? "#245cb7" : "#ffffff", "#dbe3ef"); doc.fillColor(heading ? "#ffffff" : "#142442").fontSize(8).text(text, x + padding, y + padding, { width: widths[i]! - 2 * padding, lineGap: 2, lineBreak: false }); x += widths[i]!; });
      y += height;
    }
    const header = () => { if (y + 50 > bottom) page(); cells(headers, 26, true); };
    function wrap(text: string, col: number) {
      doc.fontSize(8); const output: string[] = [];
      for (const part of text.replace(/\r/g, "").split("\n")) {
        let current = "";
        for (const word of part.split(/\s+/).filter(Boolean)) {
          const next = current ? `${current} ${word}` : word;
          if (doc.widthOfString(next) <= widths[col]! - 2 * padding) { current = next; continue; }
          if (current) output.push(current); current = "";
          for (const c of word) { if (current && doc.widthOfString(current + c) > widths[col]! - 2 * padding) { output.push(current); current = ""; } current += c; }
        }
        output.push(current);
      }
      return output;
    }
    header();
    for (const row of rows) {
      const lines = row.map(wrap);
      const height = Math.max(...lines.map((l) => l.length)) * line + padding * 2;
      if (height < bottom - 61 && y + height > bottom) { page(); header(); }
      while (lines.some((l) => l.length)) {
        if (y + line + padding * 2 > bottom) { page(); header(); }
        const capacity = Math.max(1, Math.floor((bottom - y - padding * 2) / line));
        const parts = lines.map((l) => l.splice(0, capacity)); const h = Math.max(...parts.map((l) => l.length)) * line + padding * 2;
        const top = y; cells(parts.map(() => ""), h);
        let x = left;
        parts.forEach((lines, col) => { lines.forEach((text, i) => doc.fontSize(8).fillColor("#142442").text(text, x + padding, top + padding + i * line, { width: widths[col]! - padding * 2, lineBreak: false })); x += widths[col]!; });
      }
    }
    if (!rows.length) { if (y + 30 > bottom) page(); doc.text("No entries in the selected period.", left, y + 10); }
    doc.end();
  });
}
