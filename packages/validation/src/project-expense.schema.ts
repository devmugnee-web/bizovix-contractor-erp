import { z } from "zod";

export const projectExpenseSchema = z.object({
  expenseDate: z.string().min(1, "Expense date is required"),
  expenseHeadId: z.string().min(1, "Expense head is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  expenseById: z.string().min(1, "Expense by is required"),
  paidFromAccountId: z.string().min(1, "Paid from account is required"),
  description: z.string().max(500, "Description is too long").optional(),
});

export type ProjectExpenseFormValues = z.infer<typeof projectExpenseSchema>;
