import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

const CATEGORIES = [
  "LC_BANKING",
  "ORIGIN",
  "FREIGHT",
  "INSURANCE",
  "CUSTOMS",
  "TAX",
  "CNF",
  "PORT",
  "DESTINATION_TRANSPORT",
  "LOCAL",
  "OTHER",
] as const;

const BASES = ["PURCHASE_VALUE", "USD_VALUE", "QUANTITY", "WEIGHT", "CBM", "EQUAL"] as const;

export class CreateLcCostHeadDto {
  @IsString()
  workspaceId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @IsOptional()
  @IsString()
  defaultCurrency?: string;

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
}
