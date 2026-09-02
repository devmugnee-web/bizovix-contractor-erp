import { z } from "zod";

export const generalExpenseSchema = z.object({
  expenseDate: z.string().min(1, "Expense date is required"),
  expenseHeadId: z.string().min(1, "Expense head is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  expenseById: z.string().min(1, "Expense by is required"),
  paymentMode: z.enum(["CASH_BANK", "PAYABLE"]),
  expenseNature: z.enum(["DIRECT", "INDIRECT"]),
  paidFromAccountId: z.string().optional(),
  payablePartyId: z.string().optional(),
  expenseLedgerAccountId: z.string().optional(),
  description: z.string().max(500, "Description is too long").optional(),
}).superRefine((value, context) => {
  if (value.paymentMode === "CASH_BANK" && !value.paidFromAccountId) context.addIssue({ code: "custom", path: ["paidFromAccountId"], message: "Paid from account is required" });
  if (value.paymentMode === "PAYABLE" && !value.payablePartyId) context.addIssue({ code: "custom", path: ["payablePartyId"], message: "Payable party is required" });
});

export type GeneralExpenseFormValues = z.infer<typeof generalExpenseSchema>;
