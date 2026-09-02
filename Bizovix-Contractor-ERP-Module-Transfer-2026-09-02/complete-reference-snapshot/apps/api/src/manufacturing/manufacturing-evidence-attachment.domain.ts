import { createHash } from "node:crypto";

import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/index.js";

export const MANUFACTURING_EVIDENCE_ATTACHMENT_LIMIT = 5;
export const MANUFACTURING_EVIDENCE_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
export const MANUFACTURING_EVIDENCE_ATTACHMENT_TOTAL_MAX_BYTES =
  8 * 1024 * 1024;

const MIME_EXTENSIONS = new Map<string, ReadonlySet<string>>([
  ["application/pdf", new Set(["pdf"])],
  ["image/png", new Set(["png"])],
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/webp", new Set(["webp"])],
  ["text/plain", new Set(["txt", "log"])],
  ["text/csv", new Set(["csv"])],
  ["application/json", new Set(["json"])],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    new Set(["docx"]),
  ],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    new Set(["xlsx"]),
  ],
]);

type AttachmentInput = {
  fileName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  sha256?: unknown;
  dataUrl?: unknown;
};

function attachmentObject(value: unknown, index: number): AttachmentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException(
      `Evidence attachment ${index + 1} must be an object.`,
    );
  }
  return value as AttachmentInput;
}

function hasUnsafeFileNameCharacter(fileName: string) {
  return Array.from(fileName).some(
    (character) =>
      character === "\\" ||
      character === "/" ||
      character.charCodeAt(0) <= 0x1f,
  );
}

function normalizedFileName(value: unknown, index: number): string {
  if (typeof value !== "string")
    throw new BadRequestException(
      `Evidence attachment ${index + 1} requires a file name.`,
    );
  const fileName = value.trim();
  if (
    !fileName ||
    fileName.length > 160 ||
    hasUnsafeFileNameCharacter(fileName) ||
    fileName === "." ||
    fileName === ".."
  ) {
    throw new BadRequestException(
      `Evidence attachment ${index + 1} has an invalid file name.`,
    );
  }
  return fileName;
}

function normalizedMimeType(
  value: unknown,
  fileName: string,
  index: number,
): string {
  if (typeof value !== "string")
    throw new BadRequestException(
      `Evidence attachment ${index + 1} requires a MIME type.`,
    );
  const mimeType = value.trim().toLowerCase();
  const extensions = MIME_EXTENSIONS.get(mimeType);
  if (!extensions)
    throw new BadRequestException(
      `Evidence attachment ${index + 1} uses an unsupported file type.`,
    );
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()!.toLowerCase()
    : "";
  if (!extensions.has(extension)) {
    throw new BadRequestException(
      `Evidence attachment ${index + 1} file extension does not match its MIME type.`,
    );
  }
  return mimeType;
}

function decodeDataUrl(
  value: unknown,
  mimeType: string,
  index: number,
): Buffer {
  if (typeof value !== "string")
    throw new BadRequestException(
      `Evidence attachment ${index + 1} requires file data.`,
    );
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || match[1].trim().toLowerCase() !== mimeType) {
    throw new BadRequestException(
      `Evidence attachment ${index + 1} must be a matching base64 data URL.`,
    );
  }
  const encoded = match[2];
  if (!encoded || encoded.length % 4 !== 0) {
    throw new BadRequestException(
      `Evidence attachment ${index + 1} has invalid base64 data.`,
    );
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== encoded) {
    throw new BadRequestException(
      `Evidence attachment ${index + 1} has invalid base64 data.`,
    );
  }
  if (bytes.length > MANUFACTURING_EVIDENCE_ATTACHMENT_MAX_BYTES) {
    throw new BadRequestException(
      `Evidence attachment ${index + 1} exceeds the 2 MB limit.`,
    );
  }
  return bytes;
}

function assertEvidenceContent(bytes: Buffer, mimeType: string, index: number) {
  const startsWith = (...signature: number[]) =>
    signature.every((value, offset) => bytes[offset] === value);
  const invalid = () =>
    new BadRequestException(
      `Evidence attachment ${index + 1} content does not match its file type.`,
    );
  if (
    mimeType === "application/pdf" &&
    bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
  )
    throw invalid();
  if (
    mimeType === "image/png" &&
    !startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  )
    throw invalid();
  if (mimeType === "image/jpeg" && !startsWith(0xff, 0xd8, 0xff))
    throw invalid();
  if (
    mimeType === "image/webp" &&
    !(
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    )
  )
    throw invalid();
  if (
    mimeType.includes("openxmlformats-officedocument") &&
    !startsWith(0x50, 0x4b, 0x03, 0x04)
  )
    throw invalid();
  if (
    ["text/plain", "text/csv", "application/json"].includes(mimeType) &&
    bytes.includes(0)
  )
    throw invalid();
  if (mimeType === "application/json") {
    try {
      JSON.parse(bytes.toString("utf8"));
    } catch {
      throw invalid();
    }
  }
}

export function normalizeManufacturingEvidenceAttachments(
  value: unknown,
): Prisma.InputJsonObject[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new BadRequestException("Evidence attachments must be an array.");
  if (value.length > MANUFACTURING_EVIDENCE_ATTACHMENT_LIMIT) {
    throw new BadRequestException(
      `A controlled record may contain at most ${MANUFACTURING_EVIDENCE_ATTACHMENT_LIMIT} evidence attachments.`,
    );
  }

  let totalBytes = 0;
  const seenHashes = new Set<string>();
  return value.map((raw, index) => {
    const attachment = attachmentObject(raw, index);
    const fileName = normalizedFileName(attachment.fileName, index);
    const mimeType = normalizedMimeType(attachment.mimeType, fileName, index);
    const bytes = decodeDataUrl(attachment.dataUrl, mimeType, index);
    assertEvidenceContent(bytes, mimeType, index);
    totalBytes += bytes.length;
    if (totalBytes > MANUFACTURING_EVIDENCE_ATTACHMENT_TOTAL_MAX_BYTES) {
      throw new BadRequestException(
        "Evidence attachments exceed the combined 8 MB limit.",
      );
    }

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (
      attachment.sizeBytes !== undefined &&
      attachment.sizeBytes !== bytes.length
    ) {
      throw new BadRequestException(
        `Evidence attachment ${index + 1} size does not match its file data.`,
      );
    }
    if (attachment.sha256 !== undefined && attachment.sha256 !== sha256) {
      throw new BadRequestException(
        `Evidence attachment ${index + 1} checksum does not match its file data.`,
      );
    }
    if (seenHashes.has(sha256))
      throw new BadRequestException(
        `Evidence attachment ${index + 1} duplicates another attachment.`,
      );
    seenHashes.add(sha256);

    const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
    return { fileName, mimeType, sizeBytes: bytes.length, sha256, dataUrl };
  });
}
