import { describe, expect, it } from "vitest";

import { getTrialBalanceRows } from "@/lib/erp-data";
import type { AppDataset, TrialBalanceRow, VoucherRecord } from "@/types/domain";

const WORKSPACE_ID = "workflow-financial-test-workspace";
const TOTAL = 112_800;

function buildDataset(vouchers: VoucherRecord[]): AppDataset {
  return {
    workspaces: [],
    users: [],
    parties: [],
    stockItems: [],
    vouchers,
    dashboardMetrics: [],
    trialBalance: [],
    summary: [],
    approvals: [],
    quickShortcuts: [],
    subscription: {
      currentPlan: { code: "test", name: "Test", description: "", priceLabel: "-", billingLabel: "-" },
      status: "paid-active",
      renewalDate: "",
      daysRemaining: 0,
      usages: [],
      plans: [],
      upgradeRequest: null,
    },
    workspaceSubscriptions: {},
  };
}

function buildVoucher(
  input: Partial<VoucherRecord> & Pick<VoucherRecord, "id" | "voucherType" | "voucherDate" | "lines">,
): VoucherRecord {
  return {
    workspaceId: WORKSPACE_ID,
    voucherNumber: input.id,
    createdAt: `${input.voucherDate}T10:00:00.000Z`,
    partyName: "Manufacturing Supplier",
    particulars: "Workflow financial invariant",
    debit: TOTAL,
    credit: TOTAL,
    amount: TOTAL,
    status: "posted",
    enteredBy: "Test User",
    currency: "BDT",
    ...input,
  };
}

function rowByAccount(rows: TrialBalanceRow[], accountId: string) {
  return rows.find((row) => row.accountId === accountId);
}

function expectBalanced(rows: TrialBalanceRow[]) {
  const debit = rows.reduce((sum, row) => sum + row.debit, 0);
  const credit = rows.reduce((sum, row) => sum + row.credit, 0);

  expect(debit).toBe(credit);
}

function nonZeroClosingBalances(rows: TrialBalanceRow[]) {
  return Object.fromEntries(
    rows
      .filter((row) => row.closingBalance !== 0)
      .map((row) => [row.accountId ?? row.ledger, row.closingBalance])
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  );
}

const settlementCreditLines = [
  {
    id: "cash-credit",
    accountId: "cash-main",
    ledger: "Cash in Hand",
    description: "Cash settlement",
    debit: 0,
    credit: 30_000,
    costCenter: "Cash-in-Hand",
  },
  {
    id: "bank-credit",
    accountId: "bank-brac",
    ledger: "Brac Borenno",
    description: "Bank settlement",
    debit: 0,
    credit: 40_000,
    costCenter: "Bank Accounts",
  },
  {
    id: "payable-credit",
    accountId: "supplier-account",
    ledger: "Manufacturing Supplier",
    description: "Unpaid supplier balance",
    debit: 0,
    credit: 42_800,
  },
] satisfies VoucherRecord["lines"];

describe("workflow-mode trial balance invariants", () => {
  it("keeps Direct and Receipt Note -> Bill ending balances equivalent while preserving split settlement lines", () => {
    const directBill = buildVoucher({
      id: "direct-purchase-bill",
      voucherType: "purchase",
      voucherDate: "2026-08-01",
      documentKind: "bill",
      workflowOrigin: "DIRECT",
      lines: [
        {
          id: "direct-inventory",
          accountId: "inventory-control",
          ledger: "Inventory Control",
          description: "Direct purchase",
          debit: TOTAL,
          credit: 0,
        },
        ...settlementCreditLines,
      ],
    });

    const receiptNote = buildVoucher({
      id: "receipt-note",
      voucherType: "purchase",
      voucherDate: "2026-08-01",
      documentKind: "receipt-note",
      workflowOrigin: "ORDER_FLOW",
      lines: [
        {
          id: "receipt-inventory",
          accountId: "inventory-control",
          ledger: "Inventory Control",
          description: "Goods received",
          debit: TOTAL,
          credit: 0,
        },
        {
          id: "receipt-grni-credit",
          accountId: "purchase-bill-pending",
          ledger: "Purchase Bill Pending",
          description: "Unbilled goods",
          debit: 0,
          credit: TOTAL,
        },
      ],
    });
    const receiptBackedBill = buildVoucher({
      id: "receipt-backed-bill",
      voucherType: "purchase",
      voucherDate: "2026-08-02",
      documentKind: "bill",
      sourceVoucherId: receiptNote.id,
      workflowOrigin: "ORDER_FLOW",
      lines: [
        {
          id: "bill-grni-debit",
          accountId: "purchase-bill-pending",
          ledger: "Purchase Bill Pending",
          description: "Clear received-not-billed goods",
          debit: TOTAL,
          credit: 0,
        },
        ...settlementCreditLines.map((line) => ({ ...line, id: `advanced-${line.id}` })),
      ],
    });

    const directRows = getTrialBalanceRows(buildDataset([directBill]), WORKSPACE_ID);
    const advancedRows = getTrialBalanceRows(buildDataset([receiptNote, receiptBackedBill]), WORKSPACE_ID);

    expectBalanced(directRows);
    expectBalanced(advancedRows);
    expect(nonZeroClosingBalances(advancedRows)).toEqual(nonZeroClosingBalances(directRows));

    expect(rowByAccount(advancedRows, "cash-main")).toMatchObject({
      ledger: "Cash in Hand",
      group: "Cash-in-Hand",
      debit: 0,
      credit: 30_000,
      closingBalance: -30_000,
    });
    expect(rowByAccount(advancedRows, "bank-brac")).toMatchObject({
      ledger: "Brac Borenno",
      group: "Bank Accounts",
      debit: 0,
      credit: 40_000,
      closingBalance: -40_000,
    });
    expect(rowByAccount(advancedRows, "supplier-account")).toMatchObject({
      ledger: "Manufacturing Supplier",
      group: "Sundry Creditors",
      debit: 0,
      credit: 42_800,
      closingBalance: -42_800,
    });
    expect(rowByAccount(advancedRows, "purchase-bill-pending")).toMatchObject({
      debit: TOTAL,
      credit: TOTAL,
      closingBalance: 0,
    });
  });

  it("uses persisted inverse lines so a Receipt Note reversal pair nets to zero", () => {
    const original = buildVoucher({
      id: "receipt-note-to-reverse",
      voucherType: "purchase",
      voucherDate: "2026-08-03",
      voucherNumber: "GRN-20260803-0001",
      documentKind: "receipt-note",
      workflowOrigin: "ORDER_FLOW",
      status: "reversed",
      lines: [
        {
          id: "original-inventory",
          accountId: "inventory-control",
          ledger: "Inventory Control",
          description: "Goods received",
          debit: TOTAL,
          credit: 0,
        },
        {
          id: "original-grni",
          accountId: "purchase-bill-pending",
          ledger: "Purchase Bill Pending",
          description: "Unbilled goods",
          debit: 0,
          credit: TOTAL,
        },
      ],
    });
    const reversal = buildVoucher({
      id: "receipt-note-reversal",
      voucherType: "purchase",
      voucherDate: "2026-08-04",
      voucherNumber: "GRN-20260803-0001-REV",
      documentKind: "receipt-note",
      workflowOrigin: "ORDER_FLOW",
      reversalOfId: original.id,
      lines: [
        {
          id: "reversal-inventory",
          accountId: "inventory-control",
          ledger: "Inventory Control",
          description: "Reverse goods received",
          debit: 0,
          credit: TOTAL,
        },
        {
          id: "reversal-grni",
          accountId: "purchase-bill-pending",
          ledger: "Purchase Bill Pending",
          description: "Reverse unbilled goods",
          debit: TOTAL,
          credit: 0,
        },
      ],
    });

    const rows = getTrialBalanceRows(buildDataset([original, reversal]), WORKSPACE_ID);

    expectBalanced(rows);
    expect(rowByAccount(rows, "inventory-control")).toMatchObject({
      debit: TOTAL,
      credit: TOTAL,
      closingBalance: 0,
    });
    expect(rowByAccount(rows, "purchase-bill-pending")).toMatchObject({
      debit: TOTAL,
      credit: TOTAL,
      closingBalance: 0,
    });
    expect(rows.every((row) => row.closingBalance === 0)).toBe(true);
  });
});
