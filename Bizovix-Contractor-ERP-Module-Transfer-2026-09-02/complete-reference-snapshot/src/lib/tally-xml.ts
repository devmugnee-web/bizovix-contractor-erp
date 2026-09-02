import type { VoucherRecord, VoucherType } from "@/types/domain";
import { moneyAmountsEqual, roundMoney, sumMoney } from "@/lib/money";

export type TallyVoucherType =
  | "Sales"
  | "Purchase"
  | "Credit Note"
  | "Debit Note"
  | "Receipt"
  | "Payment"
  | "Journal"
  | "Contra";

export type TallyValidationIssueCode =
  | "invalid-status"
  | "non-financial-document"
  | "unsupported-voucher-type"
  | "missing-voucher-id"
  | "missing-voucher-number"
  | "missing-voucher-date"
  | "invalid-voucher-date"
  | "missing-guid"
  | "missing-ledger-name"
  | "invalid-ledger-amount"
  | "mixed-ledger-amount"
  | "no-ledger-entries"
  | "unbalanced-voucher"
  | "amount-sign-mismatch"
  | "duplicate-guid"
  | "inventory-voucher-not-supported"
  | "malformed-xml"
  | "no-vouchers";

export interface TallyValidationIssue {
  code: TallyValidationIssueCode;
  message: string;
  severity: "error" | "warning";
  ledgerIndex?: number;
}

export interface TallyExcludedVoucher {
  voucherId: string;
  voucherNumber: string;
  issues: TallyValidationIssue[];
}

export interface TallyExportedVoucher {
  voucherId: string;
  voucherNumber: string;
  voucherType: TallyVoucherType;
  guid: string;
  debit: number;
  credit: number;
}

export interface TallyAccountingXmlResult {
  xml: string;
  exportedVouchers: TallyExportedVoucher[];
  excludedVouchers: TallyExcludedVoucher[];
  totalDebit: number;
  totalCredit: number;
}

export interface TallyAccountingXmlOptions {
  /** Exact company name as it appears in TallyPrime. */
  companyName: string;
}

export interface TallyLedgerPreviewEntry {
  ledgerName: string;
  /** The signed amount exactly as represented by Tally: debit is normally negative. */
  amount: number;
  debit: number;
  credit: number;
  isDeemedPositive: boolean | null;
}

export interface TallyVoucherPreviewRecord {
  date: string;
  rawDate: string;
  voucherNumber: string;
  voucherType: string;
  bizovixVoucherType: VoucherType | null;
  guid: string;
  remoteId: string;
  narration: string;
  partyLedgerName: string;
  ledgerEntries: TallyLedgerPreviewEntry[];
  debit: number;
  credit: number;
  validationIssues: TallyValidationIssue[];
}

export interface TallyXmlParseResult {
  vouchers: TallyVoucherPreviewRecord[];
  /** Document-level issues. Voucher-specific issues live on each preview row. */
  validationIssues: TallyValidationIssue[];
}

const TALLY_AMOUNT_PRECISION = 2;

const VOUCHER_TYPE_TO_TALLY: Partial<Record<VoucherType, TallyVoucherType>> = {
  sales: "Sales",
  purchase: "Purchase",
  "credit-note": "Credit Note",
  "debit-note": "Debit Note",
  receipt: "Receipt",
  payment: "Payment",
  journal: "Journal",
  contra: "Contra",
};

const TALLY_TO_VOUCHER_TYPE = new Map<string, VoucherType>(
  Object.entries(VOUCHER_TYPE_TO_TALLY).map(([bizovixType, tallyType]) => [
    normaliseToken(tallyType ?? ""),
    bizovixType as VoucherType,
  ]),
);

/** Workflow documents that must not be exported as accounting vouchers. */
const NON_FINANCIAL_DOCUMENT_KINDS = new Set([
  "quotation",
  "estimate",
  "proforma",
  "proforma-invoice",
  "sale-order",
  "sales-order",
  "delivery-note",
  "delivery-challan",
  "purchase-order",
  "receipt-note",
  "goods-receipt",
  "goods-receipt-note",
  "grn",
]);

interface PreparedLedgerLine {
  ledgerName: string;
  description: string;
  billReference: string;
  debit: number;
  credit: number;
  signedTallyAmount: number;
}

interface PreparedVoucher {
  voucher: VoucherRecord;
  tallyType: TallyVoucherType;
  tallyDate: string;
  guid: string;
  lines: PreparedLedgerLine[];
  debit: number;
  credit: number;
}

function normaliseToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function roundTallyAmount(value: number) {
  const rounded = roundMoney(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatTallyAmount(value: number) {
  const rounded = roundTallyAmount(value);
  return rounded.toFixed(TALLY_AMOUNT_PRECISION);
}

function issue(
  code: TallyValidationIssueCode,
  message: string,
  severity: TallyValidationIssue["severity"] = "error",
  ledgerIndex?: number,
): TallyValidationIssue {
  return { code, message, severity, ...(ledgerIndex === undefined ? {} : { ledgerIndex }) };
}

function isRealCalendarDate(year: number, month: number, day: number) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function normaliseTallyDate(value: string): { tallyDate: string; isoDate: string } | null {
  const trimmed = value.trim();
  const compactMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const match = compactMatch ?? isoMatch;

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isRealCalendarDate(year, month, day)) return null;

  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return {
    tallyDate: `${year}${monthText}${dayText}`,
    isoDate: `${year}-${monthText}-${dayText}`,
  };
}

function prepareLedgerLines(voucher: VoucherRecord) {
  const issues: TallyValidationIssue[] = [];
  const lines: PreparedLedgerLine[] = [];

  if (!Array.isArray(voucher.lines)) {
    return {
      lines,
      issues: [issue("no-ledger-entries", "The voucher has no ledger entries.")],
    };
  }

  voucher.lines.forEach((line, ledgerIndex) => {
    const debitValue = Number(line.debit);
    const creditValue = Number(line.credit);

    if (!Number.isFinite(debitValue) || !Number.isFinite(creditValue) || debitValue < 0 || creditValue < 0) {
      issues.push(issue(
        "invalid-ledger-amount",
        `Ledger entry ${ledgerIndex + 1} has a negative or non-numeric amount.`,
        "error",
        ledgerIndex,
      ));
      return;
    }

    const debit = roundTallyAmount(debitValue);
    const credit = roundTallyAmount(creditValue);

    // Zero-value form placeholders do not belong in an accounting export.
    if (debit === 0 && credit === 0) return;

    if (!line.ledger?.trim()) {
      issues.push(issue("missing-ledger-name", `Ledger entry ${ledgerIndex + 1} has no ledger name.`, "error", ledgerIndex));
      return;
    }

    if (debit > 0 && credit > 0) {
      issues.push(issue(
        "mixed-ledger-amount",
        `Ledger entry ${ledgerIndex + 1} contains both a debit and a credit.`,
        "error",
        ledgerIndex,
      ));
      return;
    }

    lines.push({
      ledgerName: line.ledger.trim(),
      description: line.description?.trim() ?? "",
      billReference: line.billReference?.trim() ?? "",
      debit,
      credit,
      // Tally's native accounting-voucher XML uses negative amounts for debits
      // and positive amounts for credits.
      signedTallyAmount: debit > 0 ? -debit : credit,
    });
  });

  if (lines.length === 0) {
    issues.push(issue("no-ledger-entries", "The voucher has no non-zero ledger entries."));
  }

  return { lines, issues };
}

function prepareVoucher(voucher: VoucherRecord): { prepared: PreparedVoucher | null; issues: TallyValidationIssue[] } {
  const issues: TallyValidationIssue[] = [];
  const tallyType = mapVoucherTypeToTally(voucher.voucherType);

  if (!tallyType) {
    issues.push(issue("unsupported-voucher-type", `Voucher type "${voucher.voucherType}" is not supported by Tally accounting export.`));
  }

  if (voucher.status !== "posted") {
    issues.push(issue("invalid-status", `Only posted vouchers can be exported; this voucher is ${voucher.status}.`));
  }

  const documentKind = normaliseToken(voucher.documentKind ?? "");
  if (documentKind && NON_FINANCIAL_DOCUMENT_KINDS.has(documentKind)) {
    issues.push(issue("non-financial-document", `Document kind "${voucher.documentKind}" is not an accounting voucher.`));
  }

  if (!voucher.id?.trim()) {
    issues.push(issue("missing-voucher-id", "The voucher has no Bizovix ID, so a stable Tally identity cannot be generated."));
  }

  if (!voucher.voucherNumber?.trim()) {
    issues.push(issue("missing-voucher-number", "The voucher has no voucher number."));
  }

  let tallyDate = "";
  if (!voucher.voucherDate?.trim()) {
    issues.push(issue("missing-voucher-date", "The voucher has no voucher date."));
  } else {
    const normalisedDate = normaliseTallyDate(voucher.voucherDate);
    if (!normalisedDate) {
      issues.push(issue("invalid-voucher-date", `Voucher date "${voucher.voucherDate}" is not a valid YYYY-MM-DD date.`));
    } else {
      tallyDate = normalisedDate.tallyDate;
    }
  }

  const preparedLines = prepareLedgerLines(voucher);
  issues.push(...preparedLines.issues);
  const debit = sumMoney(preparedLines.lines.map((line) => line.debit));
  const credit = sumMoney(preparedLines.lines.map((line) => line.credit));

  if (preparedLines.lines.length > 0 && !moneyAmountsEqual(debit, credit)) {
    issues.push(issue(
      "unbalanced-voucher",
      `Voucher is not balanced (debit ${formatTallyAmount(debit)}, credit ${formatTallyAmount(credit)}).`,
    ));
  }

  if (issues.some((entry) => entry.severity === "error") || !tallyType) {
    return { prepared: null, issues };
  }

  return {
    prepared: {
      voucher,
      tallyType,
      tallyDate,
      guid: createTallyVoucherGuid(voucher.id),
      lines: preparedLines.lines,
      debit,
      credit,
    },
    issues,
  };
}

/** Escapes text for both XML text nodes and quoted attribute values. */
export function escapeTallyXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function mapVoucherTypeToTally(voucherType: VoucherType): TallyVoucherType | null {
  return VOUCHER_TYPE_TO_TALLY[voucherType] ?? null;
}

export function mapTallyVoucherTypeToBizovix(tallyVoucherType: string): VoucherType | null {
  return TALLY_TO_VOUCHER_TYPE.get(normaliseToken(tallyVoucherType)) ?? null;
}

/**
 * Creates a deterministic UUID-shaped remote identity from a Bizovix voucher ID.
 * It is deliberately synchronous so XML generation remains browser-only and
 * does not depend on Node's crypto module.
 */
export function createTallyVoucherGuid(voucherId: string) {
  const source = `bizovix:tally:voucher:${voucherId.trim()}`;

  const hash32 = (seed: number) => {
    let hash = (0x811c9dc5 ^ seed) >>> 0;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b) >>> 0;
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
    return (hash ^ (hash >>> 16)) >>> 0;
  };

  const hexadecimal = [0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344]
    .map((seed) => hash32(seed).toString(16).padStart(8, "0"))
    .join("")
    .split("");

  // Mark the deterministic value as version 5 / RFC-4122 variant shaped.
  hexadecimal[12] = "5";
  hexadecimal[16] = ((Number.parseInt(hexadecimal[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const compact = hexadecimal.join("");
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

export function validateVoucherForTallyExport(voucher: VoucherRecord) {
  return prepareVoucher(voucher).issues;
}

function billAllocationXml(line: PreparedLedgerLine, prepared: PreparedVoucher) {
  const isPartyLedger = Boolean(
    prepared.voucher.partyName?.trim()
      && line.ledgerName.localeCompare(prepared.voucher.partyName.trim(), undefined, { sensitivity: "accent" }) === 0,
  );
  if (!isPartyLedger) return "";

  const createsOutstanding = prepared.tallyType === "Sales" || prepared.tallyType === "Purchase";
  const billType = line.billReference ? "Agst Ref" : createsOutstanding ? "New Ref" : "On Account";
  const billName = line.billReference || (createsOutstanding ? prepared.voucher.voucherNumber : "On Account");

  return `
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <BILLALLOCATIONS.LIST>
                <NAME>${escapeTallyXml(billName)}</NAME>
                <BILLTYPE>${billType}</BILLTYPE>
                <AMOUNT>${formatTallyAmount(line.signedTallyAmount)}</AMOUNT>
              </BILLALLOCATIONS.LIST>`;
}

function voucherXml(prepared: PreparedVoucher) {
  const voucher = prepared.voucher;
  const narration = voucher.narration?.trim() || voucher.particulars?.trim() || "";
  const reference = voucher.reference?.trim() || voucher.voucherNumber.trim();
  const hasPartyLedger = prepared.lines.some(
    (line) => voucher.partyName?.trim()
      && line.ledgerName.localeCompare(voucher.partyName.trim(), undefined, { sensitivity: "accent" }) === 0,
  );
  const partyLedgerXml = hasPartyLedger
    ? `\n            <PARTYLEDGERNAME>${escapeTallyXml(voucher.partyName.trim())}</PARTYLEDGERNAME>`
    : "";
  const ledgerXml = prepared.lines.map((line) => {
    const isDebit = line.debit > 0;
    return `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escapeTallyXml(line.ledgerName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
              <ISLASTDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISLASTDEEMEDPOSITIVE>
              <AMOUNT>${formatTallyAmount(line.signedTallyAmount)}</AMOUNT>${billAllocationXml(line, prepared)}
            </ALLLEDGERENTRIES.LIST>`;
  }).join("");

  return `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER REMOTEID="${escapeTallyXml(prepared.guid)}" VCHTYPE="${prepared.tallyType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${prepared.tallyDate}</DATE>
            <GUID>${escapeTallyXml(prepared.guid)}</GUID>
            <VOUCHERTYPENAME>${prepared.tallyType}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeTallyXml(voucher.voucherNumber.trim())}</VOUCHERNUMBER>
            <REFERENCE>${escapeTallyXml(reference)}</REFERENCE>
            <NARRATION>${escapeTallyXml(narration)}</NARRATION>${partyLedgerXml}
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <ISINVOICE>No</ISINVOICE>${ledgerXml}
          </VOUCHER>
        </TALLYMESSAGE>`;
}

/**
 * Builds an accounting-only Tally import envelope. Invalid, non-posted,
 * non-financial, unsupported, or unbalanced vouchers are reported and omitted.
 */
export function buildTallyAccountingXml(
  vouchers: readonly VoucherRecord[],
  options: TallyAccountingXmlOptions,
): TallyAccountingXmlResult {
  const companyName = options.companyName.trim();
  if (!companyName) {
    throw new Error("The exact Tally company name is required.");
  }

  const preparedVouchers: PreparedVoucher[] = [];
  const excludedVouchers: TallyExcludedVoucher[] = [];

  vouchers.forEach((voucher) => {
    const result = prepareVoucher(voucher);
    if (result.prepared) {
      preparedVouchers.push(result.prepared);
    } else {
      excludedVouchers.push({
        voucherId: voucher.id ?? "",
        voucherNumber: voucher.voucherNumber ?? "",
        issues: result.issues,
      });
    }
  });

  const exportedVouchers = preparedVouchers.map<TallyExportedVoucher>((prepared) => ({
    voucherId: prepared.voucher.id,
    voucherNumber: prepared.voucher.voucherNumber,
    voucherType: prepared.tallyType,
    guid: prepared.guid,
    debit: prepared.debit,
    credit: prepared.credit,
  }));
  const vouchersXml = preparedVouchers.map(voucherXml).join("");
  const totalDebit = sumMoney(exportedVouchers.map((voucher) => voucher.debit));
  const totalCredit = sumMoney(exportedVouchers.map((voucher) => voucher.credit));

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeTallyXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${vouchersXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`,
    exportedVouchers,
    excludedVouchers,
    totalDebit,
    totalCredit,
  };
}

function elementName(element: Element) {
  return (element.localName || element.tagName).toUpperCase();
}

function descendantsNamed(root: ParentNode, names: readonly string[]) {
  const wantedNames = new Set(names.map((name) => name.toUpperCase()));
  return Array.from(root.querySelectorAll("*")).filter((element) => wantedNames.has(elementName(element)));
}

function directChildText(element: Element, names: readonly string[]) {
  const wantedNames = new Set(names.map((name) => name.toUpperCase()));
  const child = Array.from(element.children).find((candidate) => wantedNames.has(elementName(candidate)));
  return child?.textContent?.trim() ?? "";
}

function attributeValue(element: Element, name: string) {
  const wantedName = name.toUpperCase();
  const attribute = Array.from(element.attributes).find((candidate) => candidate.name.toUpperCase() === wantedName);
  return attribute?.value.trim() ?? "";
}

function parseLogical(value: string): boolean | null {
  const normalised = value.trim().toLowerCase();
  if (["yes", "true", "1"].includes(normalised)) return true;
  if (["no", "false", "0"].includes(normalised)) return false;
  return null;
}

function parseTallyAmount(value: string): number | null {
  let normalised = value.trim().replaceAll(",", "");
  if (!normalised) return null;

  const isParenthesised = /^\(.*\)$/.test(normalised);
  if (isParenthesised) normalised = normalised.slice(1, -1);

  // For a compound foreign-currency value, Tally places the base amount after
  // the equals sign. The base amount is the useful value for this preview.
  const relevantPart = normalised.includes("=") ? normalised.split("=").at(-1) ?? normalised : normalised;
  const matches = relevantPart.match(/[-+]?\d+(?:\.\d+)?/g);
  if (!matches?.length) return null;

  const parsed = Number(matches.at(-1));
  if (!Number.isFinite(parsed)) return null;
  return roundTallyAmount(isParenthesised ? -Math.abs(parsed) : parsed);
}

function parsePreviewLedgerEntry(element: Element, ledgerIndex: number) {
  const issues: TallyValidationIssue[] = [];
  const ledgerName = directChildText(element, ["LEDGERNAME"]);
  const rawAmount = directChildText(element, ["AMOUNT"]);
  const amount = parseTallyAmount(rawAmount);
  const isDeemedPositive = parseLogical(directChildText(element, ["ISDEEMEDPOSITIVE"]));

  if (!ledgerName) {
    issues.push(issue("missing-ledger-name", `Ledger entry ${ledgerIndex + 1} has no ledger name.`, "error", ledgerIndex));
  }

  if (amount === null) {
    issues.push(issue(
      "invalid-ledger-amount",
      `Ledger entry ${ledgerIndex + 1} has an invalid amount${rawAmount ? `: "${rawAmount}"` : "."}`,
      "error",
      ledgerIndex,
    ));
    return { entry: null, issues };
  }

  // Native Tally XML says Yes + negative for debit, No + positive for credit.
  // Prefer the explicit flag when present, while warning about contradictory XML.
  const isDebit = isDeemedPositive ?? amount < 0;
  if (amount !== 0 && isDeemedPositive !== null && (isDeemedPositive ? amount > 0 : amount < 0)) {
    issues.push(issue(
      "amount-sign-mismatch",
      `Ledger entry ${ledgerIndex + 1} has an amount sign that conflicts with ISDEEMEDPOSITIVE.`,
      "warning",
      ledgerIndex,
    ));
  }

  const magnitude = Math.abs(amount);
  return {
    entry: {
      ledgerName,
      amount,
      debit: isDebit ? magnitude : 0,
      credit: isDebit ? 0 : magnitude,
      isDeemedPositive,
    } satisfies TallyLedgerPreviewEntry,
    issues,
  };
}

function parsePreviewVoucher(voucherElement: Element): TallyVoucherPreviewRecord {
  const validationIssues: TallyValidationIssue[] = [];
  const rawDate = directChildText(voucherElement, ["DATE", "EFFECTIVEDATE"]);
  const normalisedDate = normaliseTallyDate(rawDate);
  const voucherNumber = directChildText(voucherElement, ["VOUCHERNUMBER"]);
  const voucherType = attributeValue(voucherElement, "VCHTYPE")
    || directChildText(voucherElement, ["VOUCHERTYPENAME"]);
  const remoteId = attributeValue(voucherElement, "REMOTEID")
    || directChildText(voucherElement, ["REMOTEID"]);
  const guid = directChildText(voucherElement, ["GUID"]) || remoteId;
  const narration = directChildText(voucherElement, ["NARRATION"]);
  const partyLedgerName = directChildText(voucherElement, ["PARTYLEDGERNAME"]);

  if (!rawDate) {
    validationIssues.push(issue("missing-voucher-date", "The voucher has no date."));
  } else if (!normalisedDate) {
    validationIssues.push(issue("invalid-voucher-date", `Voucher date "${rawDate}" is not a valid Tally YYYYMMDD date.`));
  }

  if (!voucherNumber) {
    validationIssues.push(issue("missing-voucher-number", "The voucher has no voucher number."));
  }

  const bizovixVoucherType = mapTallyVoucherTypeToBizovix(voucherType);
  if (!voucherType || !bizovixVoucherType) {
    validationIssues.push(issue(
      "unsupported-voucher-type",
      voucherType ? `Tally voucher type "${voucherType}" is not supported.` : "The voucher has no voucher type.",
    ));
  }

  if (!guid) {
    validationIssues.push(issue("missing-guid", "The voucher has no GUID or REMOTEID; duplicate-safe import cannot be guaranteed.", "warning"));
  }

  const ledgerElements = descendantsNamed(voucherElement, ["ALLLEDGERENTRIES.LIST", "LEDGERENTRIES.LIST"]);
  if (descendantsNamed(voucherElement, ["ALLINVENTORYENTRIES.LIST", "INVENTORYENTRIES.LIST"]).length > 0) {
    validationIssues.push(issue("inventory-voucher-not-supported", "Inventory vouchers require stock-item, unit, and warehouse mapping and are blocked in accounting-only import."));
  }
  const ledgerEntries: TallyLedgerPreviewEntry[] = [];
  ledgerElements.forEach((ledgerElement, ledgerIndex) => {
    const parsed = parsePreviewLedgerEntry(ledgerElement, ledgerIndex);
    validationIssues.push(...parsed.issues);
    if (parsed.entry) ledgerEntries.push(parsed.entry);
  });

  if (ledgerEntries.length === 0) {
    validationIssues.push(issue("no-ledger-entries", "The voucher has no readable ledger entries."));
  }

  const debit = sumMoney(ledgerEntries.map((entry) => entry.debit));
  const credit = sumMoney(ledgerEntries.map((entry) => entry.credit));
  if (ledgerEntries.length > 0 && !moneyAmountsEqual(debit, credit)) {
    validationIssues.push(issue(
      "unbalanced-voucher",
      `Voucher is not balanced (debit ${formatTallyAmount(debit)}, credit ${formatTallyAmount(credit)}).`,
    ));
  }

  return {
    date: normalisedDate?.isoDate ?? rawDate,
    rawDate,
    voucherNumber,
    voucherType,
    bizovixVoucherType,
    guid,
    remoteId,
    narration,
    partyLedgerName,
    ledgerEntries,
    debit,
    credit,
    validationIssues,
  };
}

/** Parses a Tally-exported XML file into non-mutating import-preview rows. */
export function parseTallyExportXml(xml: string): TallyXmlParseResult {
  if (typeof DOMParser === "undefined") {
    return {
      vouchers: [],
      validationIssues: [issue("malformed-xml", "DOMParser is unavailable; Tally XML must be parsed in a browser context.")],
    };
  }

  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = descendantsNamed(document, ["PARSERERROR"])[0]
    ?? (document.documentElement && elementName(document.documentElement) === "PARSERERROR" ? document.documentElement : undefined);
  if (parserError) {
    return {
      vouchers: [],
      validationIssues: [issue("malformed-xml", parserError.textContent?.trim() || "The Tally XML file is malformed.")],
    };
  }

  const voucherElements = descendantsNamed(document, ["VOUCHER"]);
  if (document.documentElement && elementName(document.documentElement) === "VOUCHER") {
    voucherElements.unshift(document.documentElement);
  }

  if (voucherElements.length === 0) {
    return {
      vouchers: [],
      validationIssues: [issue("no-vouchers", "The XML file contains no Tally vouchers.")],
    };
  }

  const vouchers = voucherElements.map(parsePreviewVoucher);
  const rowsByGuid = new Map<string, TallyVoucherPreviewRecord[]>();
  vouchers.forEach((voucher) => {
    if (!voucher.guid) return;
    const key = voucher.guid.toLowerCase();
    rowsByGuid.set(key, [...(rowsByGuid.get(key) ?? []), voucher]);
  });
  rowsByGuid.forEach((matchingVouchers, guid) => {
    if (matchingVouchers.length < 2) return;
    matchingVouchers.forEach((voucher) => {
      voucher.validationIssues.push(issue("duplicate-guid", `GUID/REMOTEID "${guid}" occurs more than once in this file.`));
    });
  });

  return { vouchers, validationIssues: [] };
}
