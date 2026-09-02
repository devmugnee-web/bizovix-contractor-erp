import { describe, expect, it } from "vitest";

import {
  buildTallyAccountingXml,
  createTallyVoucherGuid,
  mapVoucherTypeToTally,
  parseTallyExportXml,
} from "@/lib/tally-xml";
import type { VoucherRecord, VoucherType } from "@/types/domain";

function voucher(overrides: Partial<VoucherRecord> = {}): VoucherRecord {
  return {
    id: "voucher-1",
    workspaceId: "workspace-1",
    voucherType: "sales",
    documentKind: null,
    voucherNumber: "SAL-0001",
    voucherDate: "2026-08-26",
    createdAt: "2026-08-26T10:00:00.000Z",
    partyName: "A & B Traders",
    particulars: "Goods <sold>",
    debit: 1_250.5,
    credit: 1_250.5,
    amount: 1_250.5,
    status: "posted",
    enteredBy: "Tester",
    narration: "Goods <sold> & delivered",
    currency: "BDT",
    lines: [
      { id: "party", ledger: "A & B Traders", description: "", debit: 1_250.5, credit: 0 },
      { id: "sales", ledger: "Sales <Local>", description: "", debit: 0, credit: 1_250.5 },
    ],
    ...overrides,
  };
}

describe("Tally accounting XML generation", () => {
  it.each<[VoucherType, string]>([
    ["sales", "Sales"],
    ["purchase", "Purchase"],
    ["credit-note", "Credit Note"],
    ["debit-note", "Debit Note"],
    ["receipt", "Receipt"],
    ["payment", "Payment"],
    ["journal", "Journal"],
    ["contra", "Contra"],
  ])("maps %s to Tally's %s voucher type", (bizovixType, tallyType) => {
    expect(mapVoucherTypeToTally(bizovixType)).toBe(tallyType);
  });

  it("emits every balanced ledger line with stable identity and escaped XML", () => {
    const record = voucher({ id: "sale-id-42", voucherNumber: 'SAL-<42>"' });
    const first = buildTallyAccountingXml([record], { companyName: "Mugnee & Company" });
    const second = buildTallyAccountingXml([record], { companyName: "Mugnee & Company" });

    expect(first.excludedVouchers).toEqual([]);
    expect(first.exportedVouchers).toHaveLength(1);
    expect(first.totalDebit).toBe(1_250.5);
    expect(first.totalCredit).toBe(1_250.5);
    expect(first.exportedVouchers[0]?.guid).toBe(createTallyVoucherGuid("sale-id-42"));
    expect(second.exportedVouchers[0]?.guid).toBe(first.exportedVouchers[0]?.guid);
    expect(first.xml).toContain("Mugnee &amp; Company");
    expect(first.xml).toContain("A &amp; B Traders");
    expect(first.xml).toContain("Sales &lt;Local&gt;");
    expect(first.xml).toContain("Goods &lt;sold&gt; &amp; delivered");

    const document = new DOMParser().parseFromString(first.xml, "application/xml");
    const voucherElement = document.querySelector("VOUCHER");
    const ledgerEntries = Array.from(document.querySelectorAll("ALLLEDGERENTRIES\\.LIST"));
    expect(voucherElement?.getAttribute("REMOTEID")).toBe(createTallyVoucherGuid("sale-id-42"));
    expect(voucherElement?.querySelector("GUID")?.textContent).toBe(createTallyVoucherGuid("sale-id-42"));
    expect(voucherElement?.querySelector("DATE")?.textContent).toBe("20260826");
    expect(ledgerEntries).toHaveLength(2);
    expect(ledgerEntries.map((entry) => entry.querySelector("AMOUNT")?.textContent)).toEqual(["-1250.50", "1250.50"]);
    expect(ledgerEntries.map((entry) => entry.querySelector("ISDEEMEDPOSITIVE")?.textContent)).toEqual(["Yes", "No"]);
  });

  it("uses shared half-away-from-zero rounding for signed Tally amounts", () => {
    const result = buildTallyAccountingXml([
      voucher({
        debit: 1.005,
        credit: 1.005,
        amount: 1.005,
        lines: [
          { id: "party", ledger: "A & B Traders", description: "", debit: 1.005, credit: 0 },
          { id: "sales", ledger: "Sales", description: "", debit: 0, credit: 1.005 },
        ],
      }),
    ], { companyName: "Mugnee" });

    expect(result.excludedVouchers).toEqual([]);
    expect(result.totalDebit).toBe(1.01);
    expect(result.totalCredit).toBe(1.01);
    expect(result.xml).toContain("<AMOUNT>-1.01</AMOUNT>");
    expect(result.xml).toContain("<AMOUNT>1.01</AMOUNT>");
  });

  it("normalizes binary floating artifacts before balancing and serializing", () => {
    const result = buildTallyAccountingXml([
      voucher({
        debit: 0.1 + 0.2,
        credit: 0.3,
        amount: 0.3,
        lines: [
          { id: "party", ledger: "A & B Traders", description: "", debit: 0.1 + 0.2, credit: 0 },
          { id: "sales", ledger: "Sales", description: "", debit: 0, credit: 0.3 },
        ],
      }),
    ], { companyName: "Mugnee" });

    expect(result.excludedVouchers).toEqual([]);
    expect(result.totalDebit).toBe(0.3);
    expect(result.totalCredit).toBe(0.3);
    expect(result.xml).toContain("<AMOUNT>-0.30</AMOUNT>");
    expect(result.xml).toContain("<AMOUNT>0.30</AMOUNT>");
  });

  it("omits non-financial, non-posted, unsupported, and unbalanced vouchers", () => {
    const result = buildTallyAccountingXml([
      voucher({ id: "quotation", documentKind: "quotation" }),
      voucher({ id: "draft", status: "draft" }),
      voucher({ id: "unsupported", voucherType: "expense" }),
      voucher({
        id: "unbalanced",
        voucherType: "journal",
        lines: [
          { id: "cash", ledger: "Cash", description: "", debit: 100, credit: 0 },
          { id: "income", ledger: "Income", description: "", debit: 0, credit: 90 },
        ],
      }),
    ], { companyName: "Mugnee" });

    expect(result.exportedVouchers).toEqual([]);
    expect(result.excludedVouchers).toHaveLength(4);
    expect(result.excludedVouchers.map((entry) => entry.issues[0]?.code)).toEqual([
      "non-financial-document",
      "invalid-status",
      "unsupported-voucher-type",
      "unbalanced-voucher",
    ]);
    expect(result.xml).not.toContain("<VOUCHER ");
  });
});

describe("Tally exported XML parsing", () => {
  it("previews both common ledger-list forms with debit, credit, and decoded text", () => {
    const parsed = parseTallyExportXml(`<?xml version="1.0"?>
      <ENVELOPE><BODY><DATA>
        <TALLYMESSAGE>
          <VOUCHER REMOTEID="remote-sales" VCHTYPE="Sales">
            <DATE>20260826</DATE><GUID>guid-sales</GUID><VOUCHERNUMBER>S-1</VOUCHERNUMBER>
            <NARRATION>Sale &amp; delivery</NARRATION>
            <ALLLEDGERENTRIES.LIST><LEDGERNAME>Customer</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-1000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>1000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER REMOTEID="remote-receipt">
            <DATE>20260827</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>R-1</VOUCHERNUMBER>
            <LEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-500</AMOUNT></LEDGERENTRIES.LIST>
            <LEDGERENTRIES.LIST><LEDGERNAME>Customer</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>500</AMOUNT></LEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </DATA></BODY></ENVELOPE>`);

    expect(parsed.validationIssues).toEqual([]);
    expect(parsed.vouchers).toHaveLength(2);
    expect(parsed.vouchers[0]).toMatchObject({
      date: "2026-08-26",
      voucherNumber: "S-1",
      voucherType: "Sales",
      bizovixVoucherType: "sales",
      guid: "guid-sales",
      remoteId: "remote-sales",
      narration: "Sale & delivery",
      debit: 1_000,
      credit: 1_000,
      validationIssues: [],
    });
    expect(parsed.vouchers[1]).toMatchObject({
      date: "2026-08-27",
      voucherNumber: "R-1",
      voucherType: "Receipt",
      bizovixVoucherType: "receipt",
      guid: "remote-receipt",
      debit: 500,
      credit: 500,
      validationIssues: [],
    });
    expect(parsed.vouchers[0]?.ledgerEntries).toEqual([
      { ledgerName: "Customer", amount: -1_000, debit: 1_000, credit: 0, isDeemedPositive: true },
      { ledgerName: "Sales", amount: 1_000, debit: 0, credit: 1_000, isDeemedPositive: false },
    ]);
  });

  it("returns validation issues for malformed and unbalanced input", () => {
    const malformed = parseTallyExportXml("<ENVELOPE><VOUCHER></ENVELOPE>");
    expect(malformed.vouchers).toEqual([]);
    expect(malformed.validationIssues[0]?.code).toBe("malformed-xml");

    const unbalanced = parseTallyExportXml(`
      <ENVELOPE><VOUCHER VCHTYPE="Journal" REMOTEID="j-1">
        <DATE>20260826</DATE><VOUCHERNUMBER>J-1</VOUCHERNUMBER>
        <LEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>100</AMOUNT></LEDGERENTRIES.LIST>
        <LEDGERENTRIES.LIST><LEDGERNAME>Income</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>90</AMOUNT></LEDGERENTRIES.LIST>
      </VOUCHER></ENVELOPE>`);

    expect(unbalanced.vouchers[0]?.validationIssues.map((entry) => entry.code)).toEqual([
      "amount-sign-mismatch",
      "unbalanced-voucher",
    ]);
  });

  it("rounds imported negative half-cent debits symmetrically with credits", () => {
    const parsed = parseTallyExportXml(`
      <ENVELOPE><VOUCHER VCHTYPE="Journal" REMOTEID="half-cent-journal">
        <DATE>20260829</DATE><VOUCHERNUMBER>J-ROUND-1</VOUCHERNUMBER>
        <LEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-1.005</AMOUNT></LEDGERENTRIES.LIST>
        <LEDGERENTRIES.LIST><LEDGERNAME>Income</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>1.005</AMOUNT></LEDGERENTRIES.LIST>
      </VOUCHER></ENVELOPE>`);

    expect(parsed.vouchers[0]).toMatchObject({
      debit: 1.01,
      credit: 1.01,
      validationIssues: [],
    });
    expect(parsed.vouchers[0]?.ledgerEntries).toEqual([
      { ledgerName: "Cash", amount: -1.01, debit: 1.01, credit: 0, isDeemedPositive: true },
      { ledgerName: "Income", amount: 1.01, debit: 0, credit: 1.01, isDeemedPositive: false },
    ]);
  });

  it("reads the party ledger and blocks inventory vouchers in accounting-only import", () => {
    const parsed = parseTallyExportXml(`
      <ENVELOPE><VOUCHER VCHTYPE="Sales" REMOTEID="inventory-sale-1">
        <DATE>20260826</DATE><VOUCHERNUMBER>S-2</VOUCHERNUMBER><PARTYLEDGERNAME>Rahim Customer</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>Rahim Customer</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-100</AMOUNT></ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST>
        <ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Item A</STOCKITEMNAME></ALLINVENTORYENTRIES.LIST>
      </VOUCHER></ENVELOPE>`);

    expect(parsed.vouchers[0]?.partyLedgerName).toBe("Rahim Customer");
    expect(parsed.vouchers[0]?.validationIssues.map((entry) => entry.code)).toContain("inventory-voucher-not-supported");
  });
});
