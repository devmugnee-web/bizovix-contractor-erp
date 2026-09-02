import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

const BASES = ["PURCHASE_VALUE", "USD_VALUE", "QUANTITY", "WEIGHT", "CBM", "EQUAL"] as const;

export class UpdateLcCostHeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(BASES)
  defaultAllocationMethod?: (typeof BASES)[number];

  @IsOptional()
  @IsIn(BASES)
  fallbackAllocationMethod?: (typeof BASES)[number];

  @IsOptional()
  @IsBoolean()
  includeInLandedCost?: boolean;

  @IsOptional()
  @IsBoolean()
  manualOverrideAllowed?: boolean;

  @IsOptional()
  @IsString()
  glAccountId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
