import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MANUFACTURING_EVIDENCE_ATTACHMENT_LIMIT,
  normalizeManufacturingEvidenceAttachments,
} from "./manufacturing-evidence-attachment.domain.js";

function attachment(
  fileName = "uat-evidence.txt",
  contents = "approved UAT evidence",
) {
  const bytes = Buffer.from(contents, "utf8");
  return {
    fileName,
    mimeType: "text/plain",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    dataUrl: `data:text/plain;base64,${bytes.toString("base64")}`,
  };
}

describe("manufacturing evidence attachments", () => {
  it("normalizes retrievable evidence and binds its size and checksum", () => {
    expect(normalizeManufacturingEvidenceAttachments([attachment()])).toEqual([
      attachment(),
    ]);
  });

  it("rejects tampered size, checksum and MIME metadata", () => {
    expect(() =>
      normalizeManufacturingEvidenceAttachments([
        { ...attachment(), sizeBytes: 1 },
      ]),
    ).toThrow(/size does not match/i);
    expect(() =>
      normalizeManufacturingEvidenceAttachments([
        { ...attachment(), sha256: "0".repeat(64) },
      ]),
    ).toThrow(/checksum does not match/i);
    expect(() =>
      normalizeManufacturingEvidenceAttachments([
        { ...attachment(), mimeType: "application/pdf" },
      ]),
    ).toThrow(/extension does not match/i);
    expect(() =>
      normalizeManufacturingEvidenceAttachments([
        {
          ...attachment("fake.pdf"),
          mimeType: "application/pdf",
          dataUrl: "data:application/pdf;base64,bm90IGEgcGRm",
          sizeBytes: 9,
          sha256: undefined,
        },
      ]),
    ).toThrow(/content does not match/i);
  });

  it("rejects duplicate, unsafe and excessive evidence", () => {
    expect(() =>
      normalizeManufacturingEvidenceAttachments([
        attachment(),
        attachment("copy.txt"),
      ]),
    ).toThrow(/duplicates/i);
    expect(() =>
      normalizeManufacturingEvidenceAttachments([
        attachment("../evidence.txt"),
      ]),
    ).toThrow(/invalid file name/i);
    expect(() =>
      normalizeManufacturingEvidenceAttachments(
        Array.from(
          { length: MANUFACTURING_EVIDENCE_ATTACHMENT_LIMIT + 1 },
          (_, index) => attachment(`${index}.txt`, String(index)),
        ),
      ),
    ).toThrow(/at most/i);
  });
});
