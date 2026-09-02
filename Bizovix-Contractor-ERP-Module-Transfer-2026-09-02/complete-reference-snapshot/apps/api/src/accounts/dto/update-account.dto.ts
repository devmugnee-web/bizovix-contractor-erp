import { IsArray, IsBoolean, IsDateString, IsNumber, IsObject, IsOptional, IsString, Min, MinLength } from "class-validator";

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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

  @IsOptional()
  @IsBoolean()
  printOnInvoices?: boolean;
}
