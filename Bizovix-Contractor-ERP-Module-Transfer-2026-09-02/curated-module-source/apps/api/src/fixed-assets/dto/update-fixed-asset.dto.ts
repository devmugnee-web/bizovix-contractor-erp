import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

const conditions = ["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;
const operationalStatuses = ["AVAILABLE", "ASSIGNED", "ACTIVE", "UNDER_MAINTENANCE", "DAMAGED", "LOST", "RETIRED"] as const;

// Edits are limited to fields that carry no General Ledger impact: descriptive
// details, the (future-only) depreciation estimates, and the asset name (which
// also renames its linked ledger). Purchase cost, cost components and funding
// are deliberately NOT here — changing a posted acquisition amount means
// re-posting its opening-balance voucher against fresh funding splits, so the
// correct flow for a wrong amount is delete + re-create, not edit.
export class UpdateFixedAssetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  assignedToName?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsIn(conditions)
  condition?: (typeof conditions)[number];

  @IsOptional()
  @IsIn(operationalStatuses)
  operationalStatus?: (typeof operationalStatuses)[number];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  salvageValue?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usefulLifeMonths?: number;

  @IsOptional()
  @IsIn(["STRAIGHT_LINE"])
  depreciationMethod?: "STRAIGHT_LINE";

  @IsOptional()
  useManualDepreciation?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  manualDepreciationAmount?: number | null;
}
