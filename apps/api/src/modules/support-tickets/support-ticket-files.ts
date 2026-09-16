import { BadRequestException } from "@nestjs/common";

export const SUPPORT_MAX_FILES = 5;
export const SUPPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const SUPPORT_ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "application/pdf",
]);

export interface UploadedSupportFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export function assertSupportFiles(files: UploadedSupportFile[]): void {
  if (files.length > SUPPORT_MAX_FILES) {
    throw new BadRequestException(`Upload at most ${SUPPORT_MAX_FILES} files`);
  }
  for (const file of files) {
    if (!file.buffer || !file.size || file.size > SUPPORT_MAX_FILE_SIZE) {
      throw new BadRequestException("Each attachment must be at most 5 MB");
    }
    const bytes = file.buffer;
    const valid =
      (file.mimetype === "image/png" &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (file.mimetype === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (file.mimetype === "application/pdf" && bytes.subarray(0, 5).toString() === "%PDF-");
    if (!valid) throw new BadRequestException("Only valid PNG, JPG or PDF files are allowed");
  }
}

export function safeSupportFileName(name: string): string {
  return name.replace(/^.*[\\/]/, "").replace(/[\x00-\x1f\x7f]/g, "").slice(0, 255) || "attachment";
}
