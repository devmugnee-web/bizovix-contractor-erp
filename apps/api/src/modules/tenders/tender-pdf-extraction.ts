import { BadRequestException } from "@nestjs/common";
import {
  TENDER_PROCUREMENT_METHODS,
  type TenderPdfExtractedData,
  type TenderPdfExtractionResult,
  type TenderProcurementMethod,
} from "@bizovix/types";
import { extractText, extractTextItems, getDocumentProxy } from "unpdf";

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

function cleanWorkName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let cleaned = value
    .replace(new RegExp(`^${DATE_VALUE_PATTERN}\\s*`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;

  const workStart =
    /\b(?:Construction|Reconstruction|Supply|Delivery|Procurement|Purchase|Repair|Renovation|Installation|Operation|Maintenance|Development|Improvement|Rehabilitation|Consultancy|Consulting|Printing|Hiring|Providing|Establishment|Upgradation|Expansion|Extension|Replacement|Retrofitting|Design|Manufacturing)\b/i.exec(
      cleaned,
    );
  if (workStart && workStart.index > 0) {
    cleaned = cleaned.slice(workStart.index);
  } else {
    cleaned = cleaned.replace(
      /^(?=[A-Z0-9./_-]*\d)(?=[A-Z0-9./_-]*[./_-])[A-Z0-9./_-]+(?:\s+(?=[0-9./_-]*\d)[0-9./_-]+)?\s+(?=\p{L})/iu,
      "",
    );
  }
  return truncate(cleaned, 1_000) || undefined;
}

function extractWorkName(text: string): string | undefined {
  const candidates = [
    captureBetween(
      text,
      /(?:Product\s*\/\s*Work\s+Name|Name\s+of\s+Work|Tender\/Proposal\s+Title)/i,
      /Tender\s+Type|Procurement\s+Method|Closing\s+Date|Category/i,
    ),
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
      /Brief\s+Description\s+of\s+(?:Goods(?:\s+and\s+Related\s+Service)?|Works?|Services?)/i,
      /Evaluation\s+Type|Document\s+Available|Tender\/Proposal\s+Document\s+Price/i,
    ),
  ];
  const primaryCandidates = candidates
    .slice(0, 3)
    .map(cleanWorkName)
    .filter((value): value is string => !!value);
  return primaryCandidates.reduce<string | undefined>(
    (longest, value) => !longest || value.length > longest.length ? value : longest,
    undefined,
  ) ?? cleanWorkName(candidates[3]);
}

function extractRemarks(text: string): string | undefined {
  const value = captureBetween(
    text,
    /(?:Remarks|Special\s+Instructions?|Additional\s+Information)/i,
    /Eligibility|Tender\/Proposal\s+Closing|Document\s+Available|Lot\s+No/i,
  );
  return value ? truncate(value, 2_000) : undefined;
}

const NOTICE_LABELS = {
  paName: /(?:Name\s+of\s+Official\s+Inviting\s+Tender(?:\/Proposal)?|PA\s+Name|PE\s+Name)/i,
  paDesignation: /(?:Designation\s+of\s+Official\s+Inviting\s+Tender(?:\/Proposal)?|PA\s+Designation|Designation)/i,
  paPhone: /\b(?:(?:PA\s+)?Phone|Telephone|Mobile|Tel\.?)(?:\s+(?:Number|No\.?))?(?=\s*:)/i,
  paAddress: /(?:Address\s+of\s+Official\s+Inviting\s+Tender(?:\/Proposal)?|PA\s+Address|Address)/i,
  noticeOrganization: /(?:Organi[sz]ation(?:\s+Name)?|Agency)/i,
};

// e-GP notices can include an office table headed "PE Name Designation Lead Office".
// Those are column headings, not labelled PA values. Prefer the official-details
// section and require a colon so a header cannot become a person's name.
function capturePaField(text: string, labels: RegExp[], stop: RegExp, nestedAddress = false): string | undefined {
  const compact = singleLineText(text);
  for (const label of labels) {
    const match = new RegExp(`(?:${label.source})\\s*:\\s*`, "i").exec(compact);
    if (!match) continue;
    let remainder = compact.slice(match.index + match[0].length);
    if (nestedAddress) remainder = remainder.replace(/^Address\s*:\s*/i, "");
    const end = new RegExp(`(?:^|\\s)(?:${stop.source})\\s*:`, "i").exec(remainder);
    const footer = /\b(?:The procuring entity reserves|Documents\b|Note\s*:)/i.exec(remainder);
    const value = truncate(remainder.slice(0, Math.min(end?.index ?? remainder.length, footer?.index ?? remainder.length)), nestedAddress ? 1000 : 300);
    // An explicitly empty field must stay empty, not consume the next label.
    return value && !/^(?:n\/a|not applicable|none|not provided|[-–—]+)$/i.test(value) ? value : undefined;
  }
  return undefined;
}

function extractPaPhone(text: string): string | undefined {
  const compact = singleLineText(text);
  const officialStart = compact.search(/Procuring\s+Entity\s+Details|Contact\s+details\s+of\s+Official/i);
  const scope = officialStart >= 0 ? compact.slice(officialStart) : compact;
  const phone = "\\+?[\\d(][\\d ()-]*\\d";
  const matches = scope.matchAll(new RegExp(
    NOTICE_LABELS.paPhone.source + "\\s*:\\s*(" + phone + "(?:\\s*[,;/]\\s*" + phone + ")*)", "gi",
  ));
  for (const match of matches) {
    const value = match[1].trim();
    if (value.length <= 100 && value.split(/[,;/]/).every((number) => {
      const digits = number.replace(/\D/g, "").length;
      return digits >= 7 && digits <= 15;
    })) return value;
  }
  return undefined;
}

interface NoticeTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

// Read the amount from its actual table column, never from adjacent dates or lot numbers.
export function extractTenderSecurityFromTable(pages: NoticeTextItem[][], text: string): number | undefined {
  // Multi-page tables without an explicit single-lot notice may contain unseen continuation rows.
  if (pages.length > 1 && !/Invitation\s+for\s*:\s*Tender\s*[-–—]\s*Single\s+Lot\b/i.test(singleLineText(text))) return undefined;
  const rows: Array<number | undefined> = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    const items = page.filter((item) => item.str.trim());
    for (const security of items.filter((item) => /\bsecurity\b/i.test(item.str))) {
      const center = security.x + security.width / 2;
      const tolerance = Math.max(3, security.fontSize * 0.65);
      const header = items.filter((item) =>
        Math.abs(item.x + item.width / 2 - center) <= Math.max(10, security.fontSize * 1.5)
        && Math.abs(item.y - security.y) <= security.fontSize * 5
        && /[A-Za-z]/.test(item.str),
      ).sort((a, b) => b.y - a.y);
      let label = header.map((item) => item.str).join(" ");
      if (!/Tender\s*\/\s*Proposal\s+security/i.test(label) && pageIndex > 0) {
        const previousTenderLabel = pages[pageIndex - 1].find((item) =>
          /^Tender\s*\/\s*Proposal$/i.test(item.str.trim())
          && item.y <= item.fontSize * 5
          && Math.abs(item.x + item.width / 2 - center) <= Math.max(10, security.fontSize * 1.5),
        );
        if (previousTenderLabel) label = `${previousTenderLabel.str} ${label}`;
      }
      if (!/Tender\s*\/\s*Proposal\s+security\s*\(\s*Amount\s+in\s+BDT\s*\)/i.test(label)) continue;
      const top = Math.max(...header.map((item) => item.y));
      const bottom = Math.min(...header.map((item) => item.y));
      const left = Math.min(...header.map((item) => item.x));
      const right = Math.max(...header.map((item) => item.x + item.width));
      const lotHeader = items.find((item) =>
        /^Lot\s+No\.?$/i.test(item.str.trim())
        && item.y >= bottom - tolerance
        && item.y <= top + tolerance,
      ) ?? items.find((item) => {
        if (!/^Lot$/i.test(item.str.trim()) || item.y < bottom - tolerance || item.y > top + tolerance) {
          return false;
        }
        const center = item.x + item.width / 2;
        return items.some((part) =>
          /^No\.?$/i.test(part.str.trim())
          && part.y >= bottom - tolerance
          && part.y <= top + tolerance
          && Math.abs(part.x + part.width / 2 - center) <= Math.max(tolerance, item.fontSize),
        );
      });
      if (!lotHeader) continue;
      const sectionEnd = items.filter((item) => item.y < bottom && /Procuring\s+Entity\s+Details|Official\s+Inviting/i.test(item.str));
      const endY = sectionEnd.length ? Math.max(...sectionEnd.map((item) => item.y)) : 0;
      const lotRows = items.filter((item) => /^\d+$/.test(item.str.trim())
        && item.y < bottom - tolerance && item.y > endY
        && item.x + item.width / 2 >= lotHeader.x - tolerance
        && item.x + item.width / 2 <= lotHeader.x + lotHeader.width + tolerance);
      for (const lot of lotRows) {
        const cells = items.filter((item) => Math.abs(item.y - lot.y) <= tolerance
          && item.x >= left - tolerance && item.x + item.width <= right + tolerance
          && /^\d[\d,]*(?:\.\d{1,2})?$/.test(item.str.trim()));
        rows.push(cells.length === 1 ? Number(cells[0].str.replace(/,/g, "")) : undefined);
      }
    }
  }
  // Do not silently choose one lot or assume how multiple lots should be combined.
  return rows.length === 1 && Number.isFinite(rows[0]) ? rows[0] : undefined;
}

function extractNoticeDetails(text: string): TenderPdfExtractedData {
  const result: TenderPdfExtractedData = {};
  const stop = new RegExp([
    ...Object.values(NOTICE_LABELS).map((label) => label.source),
    "Ministry(?:\\s*\\/\\s*Division)?", "Procuring\\s+Entity(?:\\s+Name)?",
    "District", "Country", "City", "Thana", "Postal\\s+Code", "Fax(?:\\s+No\\.?)?",
    "E-?mail", "Contact\\s+[Dd]etails", "Tender\\/Proposal\\s+ID",
    "Tender\\/Proposal\\s+Package", "Tender\\/Proposal\\s+Closing", "Tender\\/Proposal\\s+Opening",
    "Procurement\\s+Nature", "Procurement\\s+Method", "Tender\\s+Security",
    "Document\\s+Fee", "Tender(?:\\/Proposal)?\\s+Document\\s+Price", "Pre[-\\s]?Tender", "Pre[-\\s]?Bid", "Meeting\\s+End",
    "Brief\\s+Description", "Eligibility", "Invitation\\s+Reference", "Lot\\s+No",
  ].join("|"), "i");
  const organization = captureBetween(text, NOTICE_LABELS.noticeOrganization, stop);
  if (organization && !/^(?:n\/a|not applicable|none)$/i.test(organization)) {
    result.noticeOrganization = truncate(organization, 300);
  }
  const officialStart = text.search(/\bProcuring\s+Entity\s+Details\s*:/i);
  const paScope = officialStart >= 0 ? text.slice(officialStart) : text;
  const paStop = new RegExp(`${stop.source}|\\bName`, "i");
  result.paName = capturePaField(paScope, [
    /\bName\s+of\s+Official\s+Inviting\s+Tender(?:\/Proposal)?/i,
    /\b(?:PA|PE)\s+Name/i,
    /\bOfficial\s+Inviting\s+Tender(?:\/Proposal)?\s*:\s*Name/i,
  ], paStop);
  result.paDesignation = capturePaField(paScope, [
    /\bDesignation\s+of\s+Official\s+Inviting\s+Tender(?:\/Proposal)?/i,
    /\bPA\s+Designation/i,
    /\bDesignation/i,
  ], paStop);
  result.paAddress = capturePaField(paScope, [
    /\bAddress\s+of\s+Official\s+Inviting\s+Tender(?:\/Proposal)?/i,
    /\bPA\s+Address/i,
    /\bAddress/i,
  ], paStop, true);
  result.paPhone = extractPaPhone(text);
  const amount = (label: string) => {
    const matches = [...singleLineText(text).matchAll(new RegExp(
      label + "\\s*(?:\\(\\s*(?:(?:Amount\\s+)?In\\s+)?(?:BDT|Tk\\.?|Taka)\\s*\\))?\\s*:?\\s*(?:BDT|Tk\\.?|Taka)?\\s*([\\d,]+(?:\\.\\d{1,2})?)(?![\\d,.]|\\s*%)", "gi",
    ))];
    // Multiple different lot amounts require review; do not guess their total.
    const values = [...new Set(matches.map((m) => Number(m[1].replace(/,/g, ""))))];
    return values.length === 1 && Number.isFinite(values[0]) ? values[0] : undefined;
  };
  result.documentFee = amount("(?:Tender(?:\\/Proposal)?\\s+Document\\s+Price|Price\\s+of\\s+(?:Tender\\s+)?Document|Document\\s+(?:Fee|Price))");
  result.estimatedTenderSecurityAmount = amount("(?:Tender(?:\\/Proposal)?\\s+Security(?:\\s+Amount)?|Security\\s+Amount)");
  const meeting = new RegExp(
    "(?:Pre[-\\s]?(?:Tender|Bid)(?:\\/Proposal)?\\s+Meeting\\s+End|Meeting\\s+End)(?:\\s+Date(?:\\s+(?:and|&)\\s+Time)?)?\\s*:?\\s*(" + DATE_VALUE_PATTERN + ")", "i",
  ).exec(singleLineText(text))?.[1];
  const date = parseDate(meeting);
  if (date && meeting) {
    const time = /(\d{1,2})[:.](\d{2})(?:\s*([AP]M))?\s*$/i.exec(meeting);
    let hour = Number(time?.[1] ?? 0);
    const minute = Number(time?.[2] ?? 0);
    if (time?.[3]) hour = hour % 12 + (time[3].toUpperCase() === "PM" ? 12 : 0);
    if (hour < 24 && minute < 60 && (!time?.[3] || (Number(time[1]) >= 1 && Number(time[1]) <= 12))) {
      result.preBidEndDate = date + "T" + String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0") + ":00+06:00";
    }
  }
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
}

export function parseTenderPdfText(rawText: string): TenderPdfExtractedData {
  const text = compactText(rawText);
  const data: TenderPdfExtractedData = extractNoticeDetails(text);
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
    const positioned = await withTimeout(extractTextItems(pdf), "Tender PDF took too long to read");
    const securityAmount = extractTenderSecurityFromTable(positioned.items, text);
    // The notice table is authoritative: this is the value shown under
    // "Tender/Proposal Security (Amount in BDT)", not another security figure.
    if (securityAmount !== undefined) data.estimatedTenderSecurityAmount = securityAmount;
    const extractedFieldCount = Object.values(data).filter((value) => value !== undefined && value !== "").length;
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
