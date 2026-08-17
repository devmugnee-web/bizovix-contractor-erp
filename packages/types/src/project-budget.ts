import type { ProjectBudgetStatus } from "./enums";

export const BUDGET_CATEGORIES = [
  "Material",
  "Labour",
  "Transport",
  "Subcontract",
  "Equipment",
  "Accommodation",
  "Site Expense",
  "Bank / Financial Charges",
  "Overhead",
  "Contingency",
  "Other",
] as const;

export interface ProjectBudgetLineRecord {
  id: string;
  budgetId: string;
  expenseHeadId: string;
  expenseHead: { id: string; name: string };
  category: string;
  description: string | null;
  amount: string;
  remarks: string | null;
}

export interface ProjectBudgetVersion {
  id: string;
  organizationId: string;
  cmsWorkId: string;
  version: number;
  status: ProjectBudgetStatus;
  totalBudget: string;
  revisionNote: string | null;
  createdById: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: ProjectBudgetLineRecord[];
}

export interface BudgetLineInput {
  category: string;
  description?: string;
  amount: number;
  remarks?: string;
}

export interface CreateProjectBudgetInput {
  revisionNote?: string;
  lines: BudgetLineInput[];
}

export interface ProjectBudgetSummary {
  hasApprovedBudget: boolean;
  activeBudgetId: string | null;
  activeVersion: number | null;
  contractValue: string;
  totalBudget: string;
  contingency: string;
  unallocated: string;
  expectedGrossMargin: string;
  expectedMarginPct: string;
}

export interface BudgetVsActualRow {
  category: string;
  budget: string;
  actual: string;
  variance: string;
  variancePct: string;
  status: "Within Budget" | "Near Limit" | "Over Budget";
}

export interface BudgetVsActual {
  hasApprovedBudget: boolean;
  rows: BudgetVsActualRow[];
  totals: { budget: string; actual: string; variance: string };
}
