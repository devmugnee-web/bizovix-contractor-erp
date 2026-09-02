import type { ExpenseHeadOption, ExpensePersonOption, ProjectExpenseExport } from "./project-expense";

export interface GeneralExpenseAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface GeneralExpense {
  id: string;
  expenseDate: string;
  amount: string;
  description: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "AMENDED";
  expenseNature: "DIRECT" | "INDIRECT";
  paymentMode: "CASH_BANK" | "PAYABLE";
  expenseHead: ExpenseHeadOption;
  expenseBy: ExpensePersonOption;
  paidFromAccount: { id: string; accountName: string; accountNumber: string | null } | null;
  expenseLedger: { id: string; code: string; name: string } | null;
  payableParty: { id: string; code: string; name: string } | null;
  payable: { id: string; status: string; amount: string; paidAmount: string } | null;
  attachments: GeneralExpenseAttachment[];
}

export interface GeneralExpenseQuery {
  page?: number;
  limit?: number;
  search?: string;
  expenseHeadId?: string;
  expenseById?: string;
  paidFromAccountId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface SaveGeneralExpenseInput {
  expenseDate: string;
  expenseHeadId: string;
  amount: number;
  expenseById: string;
  paidFromAccountId?: string;
  paymentMode?: "CASH_BANK" | "PAYABLE";
  expenseNature?: "DIRECT" | "INDIRECT";
  expenseLedgerAccountId?: string;
  payablePartyId?: string;
  description?: string;
}

export type GeneralExpenseExport = ProjectExpenseExport;
