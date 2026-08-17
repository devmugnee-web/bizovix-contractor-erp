export const BOQ_SECTIONS = [
  "Civil Works",
  "Electrical Works",
  "Mechanical Works",
  "Supply Items",
  "Installation",
  "Testing & Commissioning",
  "Other",
] as const;

export interface BoqItemRecord {
  id: string;
  cmsWorkId: string;
  sectionId: string | null;
  section: { id: string; name: string } | null;
  itemCode: string | null;
  description: string;
  unit: string;
  contractQty: string;
  unitRate: string;
  contractAmount: string;
  executedQty: string;
  executedValue: string;
  remainingQty: string;
  remainingValue: string;
  progressPct: string;
  specification: string | null;
  remarks: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBoqItemInput {
  section?: string;
  itemCode?: string;
  description: string;
  unit: string;
  contractQty: number;
  unitRate: number;
  specification?: string;
  remarks?: string;
}

export type UpdateBoqItemInput = Partial<CreateBoqItemInput>;

export interface BoqSummary {
  totalItems: number;
  totalBoqValue: string;
  executedValue: string;
  remainingValue: string;
  overallProgressPct: string;
  contractValue: string;
  differenceFromContract: string;
  hasDifferenceWarning: boolean;
}
