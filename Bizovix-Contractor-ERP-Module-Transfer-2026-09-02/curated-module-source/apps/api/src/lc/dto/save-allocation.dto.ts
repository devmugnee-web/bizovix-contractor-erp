import { Type } from "class-transformer";
import { IsArray, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

const MODES = ["AUTO", "MANUAL_AMOUNT", "MANUAL_PERCENTAGE", "HYBRID", "DIRECT_PRODUCT"] as const;
const BASES = ["PURCHASE_VALUE", "USD_VALUE", "QUANTITY", "WEIGHT", "CBM", "EQUAL"] as const;

export class AllocationRowInputDto {
  @IsString()
  lcItemId!: string;

  /** Exact final amount — required for MANUAL_AMOUNT/DIRECT_PRODUCT rows,
   * and for any row being fixed under HYBRID. */
  @IsOptional()
  @IsNumber()
  manualAmount?: number;

  /** 0-100 — required for MANUAL_PERCENTAGE rows. */
  @IsOptional()
  @IsNumber()
  manualPercentage?: number;

  @IsOptional()
  @IsString()
  overrideReason?: string;
}

export class SaveLcAllocationDto {
  @IsIn(MODES)
  allocationMode!: (typeof MODES)[number];

  @IsOptional()
  @IsIn(BASES)
  allocationBasis?: (typeof BASES)[number];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationRowInputDto)
  rows!: AllocationRowInputDto[];
}
