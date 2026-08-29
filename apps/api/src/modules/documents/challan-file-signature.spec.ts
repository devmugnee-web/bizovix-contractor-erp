import { hasValidChallanFileSignature } from "./documents.service";

describe("hasValidChallanFileSignature", () => {
  it("accepts PDF, JPEG, and PNG magic bytes for the matching MIME type", () => {
    expect(hasValidChallanFileSignature("application/pdf", Buffer.from("%PDF-1.7"))).toBe(true);
    expect(hasValidChallanFileSignature("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      true,
    );
    expect(
      hasValidChallanFileSignature(
        "image/png",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true);
  });

  it("rejects a file whose content does not match the declared MIME type", () => {
    expect(hasValidChallanFileSignature("application/pdf", Buffer.from([0xff, 0xd8, 0xff]))).toBe(
      false,
    );
    expect(hasValidChallanFileSignature("image/jpeg", Buffer.from("%PDF-1.7"))).toBe(false);
    expect(hasValidChallanFileSignature("image/png", Buffer.from("not-a-png"))).toBe(false);
  });

  it("rejects truncated signatures and unsupported MIME types", () => {
    expect(hasValidChallanFileSignature("application/pdf", Buffer.from("%PDF"))).toBe(false);
    expect(hasValidChallanFileSignature("image/jpeg", Buffer.from([0xff, 0xd8]))).toBe(false);
    expect(hasValidChallanFileSignature("image/png", Buffer.from([0x89, 0x50]))).toBe(false);
    expect(hasValidChallanFileSignature("text/plain", Buffer.from("plain text"))).toBe(false);
  });
});
