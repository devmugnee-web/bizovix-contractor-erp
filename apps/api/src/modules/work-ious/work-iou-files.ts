import { BadRequestException } from "@nestjs/common";

export const WORK_IOU_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const WORK_IOU_MAX_FILES = 10;

export const WORK_IOU_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type UploadedWorkIouFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

function beginsWith(buffer: Buffer, bytes: number[]) {
  return buffer.subarray(0, bytes.length).equals(Buffer.from(bytes));
}

export function hasValidWorkIouFileSignature(file: UploadedWorkIouFile) {
  if (file.mimetype === "application/pdf") {
    return file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"));
  }
  if (file.mimetype === "image/jpeg") return beginsWith(file.buffer, [0xff, 0xd8, 0xff]);
  if (file.mimetype === "image/png") {
    return beginsWith(file.buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (file.mimetype === "application/msword") {
    return beginsWith(file.buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  if (
    file.mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return (
      beginsWith(file.buffer, [0x50, 0x4b, 0x03, 0x04]) &&
      file.buffer.includes(Buffer.from("[Content_Types].xml")) &&
      file.buffer.includes(Buffer.from("word/"))
    );
  }
  return false;
}

export function assertWorkIouFiles(files: UploadedWorkIouFile[]) {
  if (!files.length) throw new BadRequestException("Select at least one attachment");
  if (files.length > WORK_IOU_MAX_FILES) {
    throw new BadRequestException(`A maximum of ${WORK_IOU_MAX_FILES} attachments is allowed`);
  }
  for (const file of files) {
    if (!file.originalname.trim() || file.originalname.length > 255) {
      throw new BadRequestException("Attachment file names must be between 1 and 255 characters");
    }
    if (!WORK_IOU_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Only PDF, JPG, PNG, DOC and DOCX files are allowed");
    }
    if (file.size <= 0 || file.size > WORK_IOU_MAX_FILE_SIZE) {
      throw new BadRequestException("Each attachment must be between 1 byte and 10 MB");
    }
    if (!hasValidWorkIouFileSignature(file)) {
      throw new BadRequestException(`File content does not match its type: ${file.originalname}`);
    }
  }
}
