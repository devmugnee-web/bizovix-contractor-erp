export function buildGeneralExpenseJournalLines(input: { amount: number; paymentMode: "CASH_BANK" | "PAYABLE"; expenseLedgerAccountId?: string | null; bankAccountId?: string | null; partyName?: string | null }) {
  if (!(input.amount > 0)) throw new Error("Expense amount must be positive");
  if (input.paymentMode === "CASH_BANK" && !input.bankAccountId) throw new Error("Payment account is required");
  if (input.paymentMode === "PAYABLE" && !input.partyName) throw new Error("Payable party is required");
  const debit = input.expenseLedgerAccountId
    ? { accountId: input.expenseLedgerAccountId, debit: input.amount, credit: 0 }
    : { systemKey: "GENERAL_EXPENSE", debit: input.amount, credit: 0 };
  const credit = input.paymentMode === "CASH_BANK"
    ? { bankAccountId: input.bankAccountId!, debit: 0, credit: input.amount }
    : { systemKey: "ACCOUNTS_PAYABLE", debit: 0, credit: input.amount, partyName: input.partyName!, partyType: "VENDOR" };
  return [debit, credit];
}
