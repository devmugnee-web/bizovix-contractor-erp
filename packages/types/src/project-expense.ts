export interface ExpenseHeadOption {
  id: string;
  name: string;
  budgetCategory?: string | null;
  isActive?: boolean;
}

export interface SaveExpenseHeadInput {
  name: string;
  budgetCategory?: string | null;
  isActive?: boolean;
}

export interface ExpensePersonOption {
  id: string;
  name: string;
}

export interface ProjectExpense {
  id: string;
  workId: string;
  expenseDate: string;
  amount: string;
  description: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  expenseHead: ExpenseHeadOption;
  expenseBy: ExpensePersonOption;
  paidFromAccount: { id: string; accountName: string; accountNumber: string | null };
}

export interface ProjectExpenseQuery {
  workId: string;
  page?: number;
  limit?: number;
  search?: string;
  expenseHeadId?: string;
  expenseById?: string;
  paidFromAccountId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface SaveProjectExpenseInput {
  workId: string;
  expenseDate: string;
  expenseHeadId: string;
  amount: number;
  expenseById: string;
  paidFromAccountId: string;
  description?: string;
}

export interface ProjectExpenseExport {
  filename: string;
  content: string;
}
