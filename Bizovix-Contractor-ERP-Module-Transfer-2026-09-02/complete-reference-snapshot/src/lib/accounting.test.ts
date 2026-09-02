import { describe, expect, it } from "vitest";

import { roundCurrencyAmount, validateVoucherInput } from "@/lib/accounting";
import type { VoucherFormInput } from "@/types/domain";

function salesVoucher(debit: number, credit: number): VoucherFormInput {
  return {
    workspaceId: "workspace-1",
    voucherType: "sales",
    voucherDate: "2026-08-29",
    partyName: "Roja Enterprise",
    status: "posted",
    settlementMode: "accounts-payable",
    lines: [
      {
        id: "receivable",
        ledger: "Roja Enterprise",
        description: "Customer receivable settlement",
        debit,
        credit: 0,
      },
      {
        id: "revenue",
        ledger: "Sales Account",
        description: "Sales revenue",
        debit: 0,
        credit,
      },
    ],
  };
}

describe("validateVoucherInput currency precision", () => {
  it("accepts a sales voucher whose raw totals differ only below one paisa", () => {
    const result = validateVoucherInput(salesVoucher(280_044.92, 280_044.91999999998));

    expect(result.debit).toBe(280_044.92);
    expect(result.credit).toBe(280_044.92);
    expect(result.lines[1]?.credit).toBe(280_044.92);
  });

  it("normalizes an LC-derived sub-paisa total to the displayed BDT amount", () => {
    const lcDerivedTotal = 161_777.777777 + 40_370.43 + 82_896.70891 - 5_000;
    const result = validateVoucherInput(salesVoucher(280_044.92, lcDerivedTotal));

    expect(lcDerivedTotal).toBeCloseTo(280_044.916687, 6);
    expect(result.debit).toBe(280_044.92);
    expect(result.credit).toBe(280_044.92);
    expect(result.lines[1]?.credit).toBe(280_044.92);
  });

  it("still rejects a real one-paisa imbalance", () => {
    expect(() => validateVoucherInput(salesVoucher(280_044.92, 280_044.91))).toThrow(
      "Total debit and total credit must be equal.",
    );
  });

  it("balances multi-line vouchers from amounts that carry sub-paisa precision", () => {
    const result = validateVoucherInput({
      ...salesVoucher(0, 0),
      voucherType: "journal",
      lines: [
        {
          id: "inventory-a",
          ledger: "Inventory A",
          description: "LC item A",
          debit: 161_777.777777,
          credit: 0,
        },
        {
          id: "inventory-b",
          ledger: "Inventory B",
          description: "LC item B",
          debit: 40_370.43,
          credit: 0,
        },
        {
          id: "inventory-c",
          ledger: "Inventory C",
          description: "LC item C",
          debit: 82_896.70891,
          credit: 0,
        },
        {
          id: "goods-in-transit",
          ledger: "Goods in Transit",
          description: "Clear LC landed cost",
          debit: 0,
          credit: 285_044.916687,
        },
      ],
    });

    expect(result.debit).toBe(285_044.92);
    expect(result.credit).toBe(285_044.92);
    expect(result.lines.map(({ debit, credit }) => [debit, credit])).toEqual([
      [161_777.78, 0],
      [40_370.43, 0],
      [82_896.71, 0],
      [0, 285_044.92],
    ]);
  });

  it("does not create an imbalance from binary floating-point addition", () => {
    const result = validateVoucherInput({
      ...salesVoucher(0, 0),
      voucherType: "journal",
      lines: [
        {
          id: "cash-a",
          ledger: "Cash A",
          description: "First receipt",
          debit: 0.1,
          credit: 0,
        },
        {
          id: "cash-b",
          ledger: "Cash B",
          description: "Second receipt",
          debit: 0.2,
          credit: 0,
        },
        {
          id: "receivable",
          ledger: "Accounts Receivable",
          description: "Settled receivable",
          debit: 0,
          credit: 0.1 + 0.2,
        },
      ],
    });

    expect(result.debit).toBe(0.3);
    expect(result.credit).toBe(0.3);
    expect(result.lines[2]?.credit).toBe(0.3);
  });

  it("keeps a balanced split balanced after row-level paisa rounding", () => {
    const result = validateVoucherInput({
      ...salesVoucher(0, 0),
      voucherType: "journal",
      lines: [
        { id: "a", ledger: "Expense A", description: "Split A", debit: 33.335, credit: 0 },
        { id: "b", ledger: "Expense B", description: "Split B", debit: 33.335, credit: 0 },
        { id: "cash", ledger: "Cash", description: "Settlement", debit: 0, credit: 66.67 },
      ],
    });

    expect(result.debit).toBe(66.67);
    expect(result.credit).toBe(66.67);
  });
});

describe("roundCurrencyAmount", () => {
  it.each([
    [0, 0],
    [10, 10],
    [1.005, 1.01],
    [2.675, 2.68],
    [161_777.777777, 161_777.78],
    [280_044.91999999998, 280_044.92],
  ])("rounds %s to BDT minor-unit precision as %s", (input, expected) => {
    expect(roundCurrencyAmount(input)).toBe(expected);
  });

  it("normalizes a value repeatedly without changing it again", () => {
    const once = roundCurrencyAmount(7_600_000.005);

    expect(roundCurrencyAmount(once)).toBe(once);
  });
});
