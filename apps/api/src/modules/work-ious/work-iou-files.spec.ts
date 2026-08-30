import { BadRequestException } from "@nestjs/common";
import {
  assertWorkIouFiles,
  hasValidWorkIouFileSignature,
  type UploadedWorkIouFile,
} from "./work-iou-files";

function file(mimetype: string, bytes: number[], originalname = "file.bin"): UploadedWorkIouFile {
  const buffer = Buffer.from(bytes);
  return { originalname, mimetype, size: buffer.length, buffer };
}

describe("Work IOU attachment validation", () => {
  it("accepts a PDF whose content matches its MIME type", () => {
    const pdf = file("application/pdf", [...Buffer.from("%PDF-1.7")], "voucher.pdf");
    expect(hasValidWorkIouFileSignature(pdf)).toBe(true);
    expect(() => assertWorkIouFiles([pdf])).not.toThrow();
  });

  it("rejects MIME spoofing", () => {
    const fakePdf = file("application/pdf", [...Buffer.from("not a pdf")], "voucher.pdf");
    expect(() => assertWorkIouFiles([fakePdf])).toThrow(BadRequestException);
  });

  it("accepts DOCX ZIP and legacy DOC signatures", () => {
    const docx = file(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      [
        0x50,
        0x4b,
        0x03,
        0x04,
        ...Buffer.from("[Content_Types].xml word/document.xml"),
      ],
      "invoice.docx",
    );
    const doc = file(
      "application/msword",
      [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00],
      "invoice.doc",
    );
    expect(() => assertWorkIouFiles([docx, doc])).not.toThrow();
  });

  it("rejects a generic ZIP renamed as DOCX and an oversized file name", () => {
    const renamedZip = file(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      [0x50, 0x4b, 0x03, 0x04, ...Buffer.from("random/archive.txt")],
      "archive.docx",
    );
    const longNamePdf = file(
      "application/pdf",
      [...Buffer.from("%PDF-1.7")],
      `${"a".repeat(252)}.pdf`,
    );
    expect(() => assertWorkIouFiles([renamedZip])).toThrow(BadRequestException);
    expect(() => assertWorkIouFiles([longNamePdf])).toThrow(BadRequestException);
  });
});
