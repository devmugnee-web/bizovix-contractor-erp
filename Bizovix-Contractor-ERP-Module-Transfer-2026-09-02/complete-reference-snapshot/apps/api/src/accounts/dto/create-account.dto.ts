import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsObject, IsOptional, IsString, Min, MinLength } from "class-validator";

const accountLevels = ["MAIN_CATEGORY", "CATEGORY", "LEDGER"] as const;
const accountNatures = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "DIRECT_EXPENSE", "INDIRECT_EXPENSE"] as const;

export class CreateAccountDto {
  @IsIn(accountLevels)
  level!: (typeof accountLevels)[number];

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(accountNatures)
  nature!: (typeof accountNatures)[number];

  @IsOptional()
  @IsBoolean()
  isControlAccount?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresItemDetails?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  openingBalance?: number;

  @IsOptional()
  @IsDateString()
  openingBalanceDate?: string | null;

  @IsOptional()
  @IsString()
  openingBalanceSourceAccountId?: string | null;

  @IsOptional()
  @IsArray()
  openingBalanceSources?: Array<{ accountId: string; amount: number }>;

  @IsOptional()
  @IsObject()
  bankDetails?: Record<string, unknown> | null;
}
