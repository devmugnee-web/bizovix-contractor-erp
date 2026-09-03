import { BadRequestException } from "@nestjs/common";
import {
  TENDER_PROCUREMENT_METHODS,
  type TenderPdfExtractedData,
  type TenderPdfExtractionResult,
  type TenderProcurementMethod,
} from "@bizovix/types";
import { extractText, getDocumentProxy } from "unpdf";

export const MAX_TENDER_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_TENDER_PDF_PAGES = 50;
const PDF_PARSE_TIMEOUT_MS = 20_000;

export interface UploadedTenderPdf {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const PROCUREMENT_METHOD_NAMES: Array<[RegExp, TenderProcurementMethod]> = [
  [/\bone\s+stage\s+two\s+envelopes?\s+tendering\s+method\b/i, "OSTETM"],
  [/\btwo\s+stage\s+tendering\s+method\b/i, "TSTM"],
  [/\bopen\s+tendering\s+method\b/i, "OTM"],
  [/\blimited\s+tendering\s+method\b/i, "LTM"],
  [/\brequest\s+for\s+quotation\s+works\b/i, "RFQU"],
  [/\brequest\s+for\s+quotation\s+limited\b/i, "RFQL"],
  [/\brequest\s+for\s+quotation\b/i, "RFQ"],
  [/\bquality\s+and\s+cost\s+based\s+selection\b/i, "QCBS"],
  [/\bleast\s+cost\s+selection\b/i, "LCS"],
  [/\bselection\s+under\s+a\s+fixed\s+budget\b/i, "SFB"],
  [/\bsingle\s+source\s+selection\b/i, "SSS"],
  [/\bselection\s+based\s+on\s+consultants'?\s+qualifications\b/i, "SBCQ"],
  [/\bindividual\s+consultant\b/i, "IC"],
  [/\bcommunity\s+service\s+engagement\b/i, "CSE"],
  [/\bdirect\s+procurement\s+method\b/i, "DPM"],
  [/\bdirect\s+contracting\b/i, "DC"],
];

const DATE_VALUE_PATTERN =
  "(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.\\s](?:[A-Za-z]{3,9}|\\d{1,2})[-/.\\s]\\d{2,4})(?:\\s+(?:at\\s+)?\\d{1,2}[:.]\\d{2}(?:\\s*[AP]M)?)?";

function compactText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function singleLineText(text: string): string {
  return compactText(text).replace(/\s+/g, " ");
}

function truncate(value: string, maxLength: number): string {
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/^[:;,.\-\s]+|[:;,.\-\s]+$/g, "")
    .trim();
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength).trim();
}

function captureBetween(text: string, label: RegExp, stop: RegExp): string | undefined {
  const labelSource = label.source;
  const stopSource = stop.source;
  const match = new RegExp(`${labelSource}\\s*:?\\s*(.+?)(?=\\s+${stopSource}\\s*:?|$)`, "i").exec(
    singleLineText(text),
  );
  return match?.[1] ? truncate(match[1], 2_500) : undefined;
}

function toIsoDate(year: number, month: number, day: number): string | undefined {
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const iso = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(value);
  if (iso) {
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return toIsoDate(Number(iso[1]), month, day);
  }

  const match = new RegExp(
    `\\b(\\d{1,2})[-/.\\s]([A-Za-z]{3,9}|\\d{1,2})[-/.\\s](\\d{2,4})\\b`,
    "i",
  ).exec(value);
  if (!match) return undefined;

  const day = Number(match[1]);
  const monthToken = match[2].toLowerCase();
  const month = /^\d+$/.test(monthToken) ? Number(monthToken) : MONTHS[monthToken];
  const yearValue = Number(match[3]);
  const year = yearValue < 100 ? 2000 + yearValue : yearValue;
  return month ? toIsoDate(year, month, day) : undefined;
}

function extractTenderId(text: string): string | undefined {
  const match =
    /\b(?:e[-\s]?)?Tender\/Proposal\s+ID\s*:?\s*([A-Z0-9][A-Z0-9./_-]{3,99})\b/i.exec(
      text,
    ) ??
    /\b(?:e[-\s]?)?Tender\s+ID\s*:?\s*([A-Z0-9][A-Z0-9./_-]{3,99})\b/i.exec(text);
  return match?.[1] && /\d/.test(match[1]) ? match[1] : undefined;
}

function extractTenderType(text: string): string | undefined {
  const match =
    /\b(?:Procurement\s+Nature|Tender\s+Type)\s*:?\s*(Physical\s+Service|Works?|Goods?|Services?)\b/i.exec(
      text,
    );
  if (!match?.[1]) return undefined;
  const normalized = match[1].toLowerCase();
  if (normalized.startsWith("work")) return "Works";
  if (normalized.startsWith("good")) return "Goods";
  if (normalized.startsWith("physical")) return "Physical Service";
  return "Services";
}

function extractProcurementMethod(text: string): TenderProcurementMethod | undefined {
  const compact = singleLineText(text);
  const section = /\bProcurement\s+Method\s*:?\s*(.{1,180})/i.exec(compact)?.[1] ?? compact;
  const supportedMethods = TENDER_PROCUREMENT_METHODS.join("|");
  const code = new RegExp(`(?:\\(|\\b)(${supportedMethods})(?:\\)|\\b)`, "i")
    .exec(section)?.[1]
    ?.toUpperCase();
  if (code && TENDER_PROCUREMENT_METHODS.includes(code as TenderProcurementMethod)) {
    return code as TenderProcurementMethod;
  }
  return PROCUREMENT_METHOD_NAMES.find(([pattern]) => pattern.test(section))?.[1];
}

function extractSubmissionDeadline(text: string): string | undefined {
  const compact = singleLineText(text);
  const patterns = [
    new RegExp(
      `Tender\\/Proposal\\s+Closing(?:\\s+Date\\s+and\\s+Time)?\\s*:?\\s*(${DATE_VALUE_PATTERN})`,
      "i",
    ),
    new RegExp(`Closing\\s+Date(?:\\s+and\\s+Time)?\\s*:?\\s*(${DATE_VALUE_PATTERN})`, "i"),
    new RegExp(`Submission\\s+Deadline\\s*:?\\s*(${DATE_VALUE_PATTERN})`, "i"),
    new RegExp(
      `Last\\s+Date(?:\\s+and\\s+Time)?\\s+of\\s+Submission\\s*:?\\s*(${DATE_VALUE_PATTERN})`,
      "i",
    ),
  ];
  return parseDate(patterns.map((pattern) => pattern.exec(compact)?.[1]).find(Boolean));
}

function looksLikePackageCode(value: string): boolean {
  const words = value.split(/\s+/);
  return value.length <= 100 && words.length <= 6 && /\d/.test(value) && /[-/]/.test(value);
}

function cleanWorkName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let cleaned = value
    .replace(new RegExp(`^${DATE_VALUE_PATTERN}\\s*`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;

  const workStart =
    /\b(?:Construction|Supply|Procurement|Purchase|Repair|Renovation|Installation|Operation|Maintenance|Development|Improvement|Rehabilitation|Consultancy|Consulting|Printing|Hiring|Providing|Establishment|Upgradation)\b/i.exec(
      cleaned,
    );
  if (workStart && workStart.index > 0) {
    cleaned = cleaned.slice(workStart.index);
  } else {
    const parts = cleaned.split(/\s{2,}|\s(?=[A-Z][a-z]+\s)/, 2);
    if (parts.length === 2 && looksLikePackageCode(parts[0])) cleaned = parts[1];
  }
  return truncate(cleaned, 300) || undefined;
}

function extractWorkName(text: string): string | undefined {
  const candidates = [
    captureBetween(
      text,
      /Tender\/Proposal\s+Package\s+No\.?\s+and\s+Description/i,
      /Category|Scheduled\s+Tender|Eligibility\s+of\s+Tenderer/i,
    ),
    captureBetween(
      text,
      /Tender\/Proposal\s+Package\s+Name/i,
      /Procurement\s+Method|Category|Tender\/Proposal\s+Type/i,
    ),
    captureBetween(
      text,
      /(?:Product\s*\/\s*Work\s+Name|Name\s+of\s+Work|Tender\/Proposal\s+Title)/i,
      /Tender\s+Type|Procurement\s+Method|Closing\s+Date|Category/i,
    ),
    captureBetween(
      text,
      /Brief\s+Description\s+of\s+(?:Goods(?:\s+and\s+Related\s+Service)?|Works?|Services?)/i,
      /Evaluation\s+Type|Document\s+Available|Tender\/Proposal\s+Document\s+Price/i,
    ),
  ];
  return candidates.map(cleanWorkName).find((value) => !!value);
}

function extractRemarks(text: string): string | undefined {
  const value = captureBetween(
    text,
    /(?:Remarks|Special\s+Instructions?|Additional\s+Information)/i,
    /Eligibility|Tender\/Proposal\s+Closing|Document\s+Available|Lot\s+No/i,
  );
  return value ? truncate(value, 2_000) : undefined;
}

export function parseTenderPdfText(rawText: string): TenderPdfExtractedData {
  const text = compactText(rawText);
  const data: TenderPdfExtractedData = {};
  const egpTenderId = extractTenderId(text);
  const workName = extractWorkName(text);
  const tenderType = extractTenderType(text);
  const procurementMethod = extractProcurementMethod(text);
  const submissionDeadline = extractSubmissionDeadline(text);
  const remarks = extractRemarks(text);

  if (egpTenderId) data.egpTenderId = egpTenderId;
  if (workName) data.workName = workName;
  if (tenderType) data.tenderType = tenderType;
  if (procurementMethod) data.procurementMethod = procurementMethod;
  if (submissionDeadline) data.submissionDeadline = submissionDeadline;
  if (remarks) data.remarks = remarks;
  return data;
}

export function hasValidTenderPdfSignature(file: UploadedTenderPdf): boolean {
  return file.buffer.length >= 5 && file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"));
}

export function assertTenderPdf(
  file: UploadedTenderPdf | undefined,
): asserts file is UploadedTenderPdf {
  if (!file) throw new BadRequestException("Select a tender PDF to import");
  if (!["application/pdf", "application/octet-stream"].includes(file.mimetype)) {
    throw new BadRequestException("Only PDF files are allowed");
  }
  if (file.size <= 0 || file.size > MAX_TENDER_PDF_BYTES) {
    throw new BadRequestException("Tender PDF must be 10 MB or smaller");
  }
  if (file.originalname.length > 255) {
    throw new BadRequestException("Tender PDF file name is too long");
  }
  if (!hasValidTenderPdfSignature(file)) {
    throw new BadRequestException("The selected file is not a valid PDF");
  }
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new BadRequestException(message)), PDF_PARSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function extractTenderPdf(
  file: UploadedTenderPdf | undefined,
): Promise<TenderPdfExtractionResult> {
  assertTenderPdf(file);
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await withTimeout(
      getDocumentProxy(new Uint8Array(file.buffer), { maxImageSize: 16_777_216 }),
      "Tender PDF took too long to open",
    );
    if (pdf.numPages > MAX_TENDER_PDF_PAGES) {
      throw new BadRequestException(
        `Tender PDF cannot contain more than ${MAX_TENDER_PDF_PAGES} pages`,
      );
    }
    const result = await withTimeout(
      extractText(pdf, { mergePages: true }),
      "Tender PDF took too long to read",
    );
    const text = result.text;
    if (singleLineText(text).length < 30) {
      throw new BadRequestException(
        "No readable text was found. Please use a text-based PDF; scanned image PDFs need OCR.",
      );
    }

    const data = parseTenderPdfText(text);
    const extractedFieldCount = Object.values(data).filter(Boolean).length;
    if (extractedFieldCount === 0) {
      throw new BadRequestException("No supported tender information was found in this PDF");
    }

    const warnings: string[] = [];
    if (!data.egpTenderId) warnings.push("Tender ID was not found");
    if (!data.workName) warnings.push("Product / Work Name was not found");
    if (!data.tenderType) warnings.push("Tender Type was not found");
    if (!data.procurementMethod) warnings.push("Procurement Method was not found");
    if (!data.submissionDeadline) warnings.push("Closing / Submission Date was not found");
    return { data, extractedFieldCount, totalPages: result.totalPages, warnings };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException("The tender PDF could not be read");
  } finally {
    await pdf?.destroy().catch(() => undefined);
  }
}
