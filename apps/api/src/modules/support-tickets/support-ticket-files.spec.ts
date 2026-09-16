import { BadRequestException } from "@nestjs/common";
import { assertSupportFiles, safeSupportFileName, type UploadedSupportFile } from "./support-ticket-files";

function upload(mimetype: string, buffer: Buffer): UploadedSupportFile {
  return { originalname: "screenshot.png", mimetype, size: buffer.length, buffer };
}

describe("support ticket attachments", () => {
  it("accepts a real PNG signature", () => {
    expect(() => assertSupportFiles([upload("image/png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]))])).not.toThrow();
  });

  it("rejects a spoofed file even if its MIME type is allowed", () => {
    expect(() => assertSupportFiles([upload("application/pdf", Buffer.from("not a PDF"))])).toThrow(BadRequestException);
  });

  it("rejects more than five files and files above five MB", () => {
    const file = upload("application/pdf", Buffer.from("%PDF-1.7"));
    expect(() => assertSupportFiles(Array(6).fill(file))).toThrow(BadRequestException);
    expect(() => assertSupportFiles([{ ...file, size: 5 * 1024 * 1024 + 1 }])).toThrow(BadRequestException);
  });

  it("strips paths and control characters from attachment names", () => {
    expect(safeSupportFileName("C:\\tmp\\secret\u0000.pdf")).toBe("secret.pdf");
  });
});
