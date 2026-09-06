import { BadRequestException } from "@nestjs/common";
import { AlignmentType, TableRow, type Paragraph, type Table } from "docx";
import { packWordLetter, wordCell, wordDate, wordDescription, wordParagraph, wordReference, wordRun, wordTable } from "../../common/documents/word-letter";
import { CHALLAN_HEADINGS, challanQuantity, challanDeliveryAddress, type ChallanLetter } from "./challan-letter-pdf";

export function generateChallanLetterWord(letter: ChallanLetter): Promise<Buffer> {
  if (!letter.rows.length) return Promise.reject(new BadRequestException("No goods are available for this challan"));
  const size = 11;
  const p = (text: string, bold = false, after = 0) => wordParagraph([wordRun(text, { bold, size: size * 2, sizeComplexScript: size * 2 })], size, { spacing: { before: 0, after, line: 250 } });
  const children: (Paragraph | Table)[] = [
    wordParagraph([wordRun("Challan", { bold: true, underline: {}, size: 32 })], 16, { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240 } }),
    wordReference(letter.reference, letter.date, 9360, size), p("", false, 30), p("To", true),
  ];
  if (letter.recipient.name) children.push(p(letter.recipient.name, true));
  if (letter.recipient.designation) children.push(p(letter.recipient.designation, true));
  if (!letter.recipient.name && !letter.recipient.designation) children.push(p("________________________"));
  if (letter.recipient.organization) children.push(p(letter.recipient.organization));
  if (letter.recipient.address) children.push(wordParagraph(letter.recipient.address, size));
  children.push(wordParagraph([wordRun("Sub: Application for Acceptance of goods.", { bold: true })], size, { spacing: { before: 300, after: 240 } }), p("Dear Sir,", true, 240));
  const contract = letter.contract ? `, ${letter.contract.label}: ${letter.contract.number} Dated: ${wordDate(letter.contract.date)}` : "";
  children.push(p(`With due all respect to you, I would like to inform you that, we are ready for supply the goods as per the Tender Id: ${letter.tenderNumber || "________________"}${contract}.`, false, 200));
  children.push(p("So, now please accept the goods mentioned as below:", false, 200));
  const widths = [985, 4410, 900, 900, 3425];
  const cell = (text: string, index: number, bold = false) => wordCell([wordParagraph([wordRun(text, { bold, size: size * 2 })], size, { alignment: AlignmentType.CENTER })], widths[index]!, 80);
  const rows = [new TableRow({ tableHeader: true, cantSplit: true, children: CHALLAN_HEADINGS.map((text, index) => cell(text, index, true)) })];
  letter.rows.forEach((row, index) => rows.push(new TableRow({ cantSplit: row.description.length + row.deliveryPlace.length < 1800, children: [
    cell(String(index + 1).padStart(2, "0"), 0), wordCell(wordDescription(row.description, size), widths[1]!, 80),
    cell(row.unit, 2), cell(challanQuantity(row.quantity), 3), cell(challanDeliveryAddress(row.deliveryPlace), 4),
  ] })));
  children.push(wordTable(rows, widths));
  children.push(wordParagraph("Yours Truly,", size, { spacing: { before: 480, after: 0 } }));
  return packWordLetter("Challan", children, { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 720, footer: 720 } }, size);
}
