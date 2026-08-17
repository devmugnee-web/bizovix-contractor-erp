export const DEDUCTION_TYPES = ["VAT", "AIT", "OTHER"] as const;

export interface DeductionConfigRecord {
  id: string;
  type: string;
  name: string;
  code: string | null;
  rate: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeductionConfigInput {
  type: string;
  name: string;
  code?: string;
  rate: number;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export type UpdateDeductionConfigInput = Partial<CreateDeductionConfigInput>;
