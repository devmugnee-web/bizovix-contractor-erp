import { AlignmentType, BorderStyle, Document, LineRuleType, Packer, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType } from "docx";
import type { IParagraphOptions, IRunOptions, ISectionPropertiesOptions } from "docx";
import type { Response } from "express";

export const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const WORD_FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Nirmala UI", eastAsia: "Times New Roman" };
const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

export function wordDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(date).replace(/ /g, "-") : "";
}

export function wordRun(text: string, options: IRunOptions = {}) {
  return new TextRun({ text, font: WORD_FONT, color: "000000", ...options });
}

export function wordParagraph(text: string | TextRun[], size: number, options: IParagraphOptions = {}) {
  return new Paragraph({
    children: typeof text === "string" ? text.replace(/\r/g, "").split("\n").map((line, index) => wordRun(line, { break: index ? 1 : undefined, size: size * 2, sizeComplexScript: size * 2 })) : text,
    spacing: { before: 0, after: 0, line: Math.round(size * 23), lineRule: LineRuleType.AT_LEAST },
    ...options,
  });
}

export function wordCell(children: Paragraph[], width: number, padding: number, span = 1) {
  return new TableCell({ children, width: { size: width, type: WidthType.DXA }, columnSpan: span, verticalAlign: VerticalAlign.CENTER,
    margins: { top: padding, bottom: padding, left: padding, right: padding } });
}

export function wordTable(rows: TableRow[], widths: number[], ruled = true) {
  const edge = ruled ? border : noBorder;
  return new Table({ rows, columnWidths: widths, width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    layout: TableLayoutType.FIXED, alignment: AlignmentType.CENTER,
    borders: { top: edge, bottom: edge, left: edge, right: edge, insideHorizontal: edge, insideVertical: edge } });
}

export function wordReference(reference: string, date: string, width: number, size: number) {
  const first = Math.round(width * 0.76);
  return wordTable([new TableRow({ cantSplit: true, children: [
    wordCell([wordParagraph([wordRun(`Ref: ${reference}`, { bold: true, size: size * 2 })], size)], first, 0),
    wordCell([wordParagraph([wordRun(`Date: ${wordDate(date)}`, { bold: true, size: size * 2 })], size)], width - first, 0),
  ] })], [first, width - first], false);
}

export function wordDescription(description: string, size: number) {
  return description.replace(/\s*\b(Brand|Model)\s*:/gi, "\n$1:").trim().split("\n").map((line, index) =>
    wordParagraph([wordRun(line, { bold: index === 0, boldComplexScript: index === 0, size: size * 2, sizeComplexScript: size * 2 })], size));
}

export function packWordLetter(title: string, children: (Paragraph | Table)[], page: ISectionPropertiesOptions["page"], size: number) {
  return Packer.toBuffer(new Document({ title, creator: "Bizovix", description: `${title} document`,
    styles: { default: { document: { run: { font: WORD_FONT, size: size * 2, sizeComplexScript: size * 2, color: "000000" }, paragraph: { spacing: { before: 0, after: 0 } } } } },
    sections: [{ properties: { page }, children }],
  }));
}

export function sendWordDocument(response: Response, buffer: Buffer, filename: string) {
  response.setHeader("Content-Type", WORD_MIME);
  response.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`);
  response.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  response.setHeader("Content-Length", String(buffer.length));
  response.setHeader("Cache-Control", "private, no-store");
  response.send(buffer);
}
