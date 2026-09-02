import { describe, expect, it } from "vitest";

import { getPartyLedgerDelta, getPartyLedgerMovement, voucherBelongsToParty, voucherBelongsToPartyType } from "@/lib/party-ledger";
import type { VoucherRecord } from "@/types/domain";

function voucher(lines: VoucherRecord["lines"], overrides: Partial<VoucherRecord> = {}) {
  return { voucherType: "purchase", documentKind: "bill", lines, ...overrides } as VoucherRecord;
}

describe("party ledger movement", () => {
  it("does not affect a supplier when a cash-settled return has no supplier ledger line", () => {
    const movement = getPartyLedgerMovement(voucher([
      { id: "cash", ledger: "Cash in Hand", description: "", debit: 184_500, credit: 0 },
      { id: "return", ledger: "Purchase Return", description: "", debit: 0, credit: 184_500 },
    ]), "Raduga");

    expect(movement).toEqual({ hasPosting: false, debit: 0, credit: 0 });
  });

  it("keeps same-named customer and supplier postings in their own control ledgers", () => {
    const supplierBill = voucher([
      { id: "supplier", ledger: "Shahida", description: "", debit: 0, credit: 434_000 },
    ]);
    const customerInvoice = voucher([
      { id: "customer", ledger: "Shahida", description: "", debit: 250_000, credit: 0 },
    ], { voucherType: "sales", documentKind: "invoice" });

    expect(voucherBelongsToPartyType(supplierBill, "supplier")).toBe(true);
    expect(voucherBelongsToPartyType(supplierBill, "customer")).toBe(false);
    expect(getPartyLedgerDelta(supplierBill, "Shahida", "customer")).toBe(0);
    expect(getPartyLedgerDelta(customerInvoice, "Shahida", "supplier")).toBe(0);
  });

  it("adds every matching party line in the same voucher", () => {
    const record = voucher([
      { id: "party-1", ledger: "Raduga", description: "", debit: 654_500, credit: 0 },
      { id: "party-2", ledger: "Raduga", description: "", debit: 45_500, credit: 0 },
      { id: "bank", ledger: "Brac Borrenno", description: "", debit: 0, credit: 700_000 },
    ]);

    expect(getPartyLedgerMovement(record, "Raduga")).toEqual({ hasPosting: true, debit: 700_000, credit: 0 });
    expect(getPartyLedgerDelta(record, "Raduga", "supplier")).toBe(-700_000);
  });

  it("uses stable party and control-ledger IDs after both display captions change", () => {
    const party = { id: "customer-1", name: "Renamed Customer", type: "customer" as const, ledgerAccountId: "ar-customer-1" };
    const record = voucher([
      { id: "party", accountId: "ar-customer-1", ledger: "Historical Customer Name", description: "", debit: 125_000, credit: 0 },
      { id: "sales", accountId: "sales", ledger: "Historical Sales Caption", description: "", debit: 0, credit: 125_000 },
    ], { voucherType: "sales", documentKind: "invoice", partyId: "customer-1", partyName: "Historical Customer Name" });

    expect(voucherBelongsToParty(record, party)).toBe(true);
    expect(getPartyLedgerMovement(record, party)).toEqual({ hasPosting: true, debit: 125_000, credit: 0 });
    expect(getPartyLedgerDelta(record, party)).toBe(125_000);
  });

  it("does not merge same-named parties when voucher.partyId points elsewhere", () => {
    const queriedParty = { id: "supplier-2", name: "Shahida", type: "supplier" as const, ledgerAccountId: "ap-supplier-2" };
    const record = voucher([
      { id: "party", accountId: "ap-supplier-1", ledger: "Shahida", description: "", debit: 0, credit: 80_000 },
    ], { partyId: "supplier-1", partyName: "Shahida" });

    expect(voucherBelongsToParty(record, queriedParty)).toBe(false);
    expect(getPartyLedgerMovement(record, queriedParty)).toEqual({ hasPosting: false, debit: 0, credit: 0 });
  });

  it("does not fall back to a matching caption when an authoritative line accountId disagrees", () => {
    const party = { id: "supplier-1", name: "Raduga", type: "supplier" as const, ledgerAccountId: "ap-raduga" };
    const record = voucher([
      { id: "wrong-account", accountId: "some-other-account", ledger: "Raduga", description: "", debit: 0, credit: 45_000 },
    ], { partyId: "supplier-1", partyName: "Raduga" });

    expect(getPartyLedgerMovement(record, party)).toEqual({ hasPosting: false, debit: 0, credit: 0 });
  });

  it("keeps an explicit name fallback for genuinely ID-less historical postings", () => {
    const legacyParty = { id: "supplier-legacy", name: "Legacy Supplier", type: "supplier" as const };
    const record = voucher([
      { id: "legacy-party", ledger: "Legacy Supplier", description: "", debit: 0, credit: 25_000 },
    ], { partyName: "Legacy Supplier" });

    expect(voucherBelongsToParty(record, legacyParty)).toBe(true);
    expect(getPartyLedgerMovement(record, legacyParty)).toEqual({ hasPosting: true, debit: 0, credit: 25_000 });
  });

  it("recognizes an ID-linked opening-balance journal as party movement", () => {
    const party = { id: "customer-opening", name: "Opening Customer", type: "customer" as const, ledgerAccountId: "ar-opening" };
    const record = voucher([
      { id: "party", accountId: "ar-opening", ledger: "Opening Customer", description: "", debit: 30_000, credit: 0 },
      { id: "equity", accountId: "opening-equity", ledger: "Opening Balance Equity", description: "", debit: 0, credit: 30_000 },
    ], { voucherType: "journal", partyId: "customer-opening", partyName: "Opening Customer" });

    expect(getPartyLedgerDelta(record, party)).toBe(30_000);
  });
});
