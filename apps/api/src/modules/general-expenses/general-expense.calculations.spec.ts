import { buildGeneralExpenseJournalLines } from "./general-expense.calculations";

describe("general expense accounting", () => {
  it.each(["CASH_BANK", "PAYABLE"] as const)("builds a balanced %s journal", (paymentMode) => {
    const lines = buildGeneralExpenseJournalLines({ amount: 1250.5, paymentMode, expenseLedgerAccountId: "expense-ledger", bankAccountId: paymentMode === "CASH_BANK" ? "bank" : null, partyName: paymentMode === "PAYABLE" ? "Vendor" : null });
    expect(lines.reduce((sum, line) => sum + line.debit, 0)).toBe(1250.5);
    expect(lines.reduce((sum, line) => sum + line.credit, 0)).toBe(1250.5);
  });
  it("rejects an expense without a direct Chart of Accounts ID", () => {
    expect(() => buildGeneralExpenseJournalLines({ amount: 100, paymentMode: "CASH_BANK", expenseLedgerAccountId: "", bankAccountId: "bank" })).toThrow("Account ID");
  });
  it("rejects incomplete payment routing", () => {
    expect(() => buildGeneralExpenseJournalLines({ amount: 100, paymentMode: "PAYABLE", expenseLedgerAccountId: "expense-ledger" })).toThrow("Payable party");
  });
});
