import { roundMoney, sumMoney } from "@/lib/money";
import type { PartyRecord, VoucherRecord } from "@/types/domain";

export type PartyLedgerIdentity = Pick<PartyRecord, "id" | "name" | "type" | "ledgerAccountId">;

function normalizePartyKey(value: string) {
  return value.trim().toLowerCase();
}

function emptyMovement() {
  return { hasPosting: false, debit: 0, credit: 0 };
}

export function voucherBelongsToPartyType(voucher: VoucherRecord, partyType: PartyRecord["type"]) {
  if (partyType === "supplier") {
    if (voucher.voucherType === "payment" || voucher.voucherType === "debit-note") return true;
    return voucher.voucherType === "purchase"
      && voucher.documentKind !== "purchase-order"
      && voucher.documentKind !== "receipt-note";
  }

  if (voucher.voucherType === "receipt" || voucher.voucherType === "credit-note") return true;
  return voucher.voucherType === "sales"
    && voucher.documentKind !== "sale-order"
    && voucher.documentKind !== "delivery-note"
    && voucher.documentKind !== "quotation"
    && voucher.documentKind !== "proforma";
}

/**
 * Resolves the business party attached to a voucher without allowing two
 * same-named parties to collapse into one statement. `partyId` is authoritative;
 * the control/sub-ledger account is the next-best stable identity. The caption
 * fallback exists only for historical vouchers that pre-date both IDs.
 */
export function voucherBelongsToParty(voucher: VoucherRecord, party: PartyLedgerIdentity) {
  if (voucher.partyId) return voucher.partyId === party.id;

  if (party.ledgerAccountId && voucher.lines.some((line) => line.accountId === party.ledgerAccountId)) {
    return true;
  }

  return voucherBelongsToPartyType(voucher, party.type)
    && normalizePartyKey(voucher.partyName) === normalizePartyKey(party.name)
    && voucher.lines.some((line) => !line.accountId && normalizePartyKey(line.ledger) === normalizePartyKey(party.name));
}

export function getPartyLedgerMovement(voucher: VoucherRecord, party: PartyLedgerIdentity | string) {
  // Keep the string overload for legacy callers while report statements pass a
  // full identity. New ID-aware code must use the object form below.
  if (typeof party === "string") {
    const partyKey = normalizePartyKey(party);
    const lines = voucher.lines.filter((line) => normalizePartyKey(line.ledger) === partyKey);
    return {
      hasPosting: lines.length > 0,
      debit: sumMoney(lines.map((line) => line.debit)),
      credit: sumMoney(lines.map((line) => line.credit)),
    };
  }

  if (voucher.partyId && voucher.partyId !== party.id) return emptyMovement();

  const partyKey = normalizePartyKey(party.name);
  const voucherHasPartyId = Boolean(voucher.partyId);
  const legacyVoucherMatches = voucherHasPartyId
    || (voucherBelongsToPartyType(voucher, party.type) && normalizePartyKey(voucher.partyName) === partyKey);
  const lines = voucher.lines.filter((line) => {
    if (line.accountId) {
      return Boolean(party.ledgerAccountId) && line.accountId === party.ledgerAccountId;
    }

    // A missing line accountId marks genuinely legacy data. If the voucher has
    // a stable partyId it already proved ownership; otherwise require the old
    // type/name guards as well.
    return legacyVoucherMatches && normalizePartyKey(line.ledger) === partyKey;
  });
  return {
    hasPosting: lines.length > 0,
    debit: sumMoney(lines.map((line) => line.debit)),
    credit: sumMoney(lines.map((line) => line.credit)),
  };
}

export function getPartyLedgerDelta(voucher: VoucherRecord, party: PartyLedgerIdentity): number;
export function getPartyLedgerDelta(voucher: VoucherRecord, partyName: string, partyType: PartyRecord["type"]): number;
export function getPartyLedgerDelta(
  voucher: VoucherRecord,
  party: PartyLedgerIdentity | string,
  legacyPartyType?: PartyRecord["type"],
) {
  const isLegacyCall = typeof party === "string";
  const partyType = isLegacyCall ? legacyPartyType : party.type;
  if (!partyType) return 0;
  if (isLegacyCall) {
    if (!voucherBelongsToPartyType(voucher, partyType)) return 0;
  } else if (!voucherBelongsToParty(voucher, party)) {
    return 0;
  }
  const movement = getPartyLedgerMovement(voucher, party);
  return roundMoney(partyType === "customer" ? movement.debit - movement.credit : movement.credit - movement.debit);
}
