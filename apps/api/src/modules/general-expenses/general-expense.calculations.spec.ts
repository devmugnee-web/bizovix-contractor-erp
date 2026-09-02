import { buildGeneralExpenseJournalLines } from "./general-expense.calculations";

describe("general expense accounting", () => {
  it.each(["CASH_BANK", "PAYABLE"] as const)("builds a balanced %s journal", (paymentMode) => {
    const lines = buildGeneralExpenseJournalLines({ amount: 1250.5, paymentMode, expenseLedgerAccountId: "expense-ledger", bankAccountId: paymentMode === "CASH_BANK" ? "bank" : null, partyName: paymentMode === "PAYABLE" ? "Vendor" : null });
    expect(lines.reduce((sum, line) => sum + line.debit, 0)).toBe(1250.5);
    expect(lines.reduce((sum, line) => sum + line.credit, 0)).toBe(1250.5);
  });
  it("falls back to the protected general-expense control key without mutating it", () => {
    expect(buildGeneralExpenseJournalLines({ amount: 100, paymentMode: "CASH_BANK", bankAccountId: "bank" })[0]).toMatchObject({ systemKey: "GENERAL_EXPENSE", debit: 100 });
  });
  it("rejects incomplete payment routing", () => {
    expect(() => buildGeneralExpenseJournalLines({ amount: 100, paymentMode: "PAYABLE" })).toThrow("Payable party");
  });
});
