import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

const MODULES = [
  "TENDER",
  "TENDER_SECURITY",
  "PG_BG",
  "CREDIT_COMMITMENT",
  "PROJECT_EXPENSE",
  "GENERAL_EXPENSE",
  "RECEIPT",
  "PAYMENT",
  "BANK_TRANSFER",
  "JOURNAL_ENTRY",
];

export class SaveApprovalRuleDto {
  @IsIn(MODULES) module!: string;
  @IsOptional() @IsString() @MaxLength(60) transactionType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxAmount?: number;
  @IsBoolean() approvalRequired!: boolean;
  @IsString() @MaxLength(80) approverRole!: string;
  @IsInt() @Min(1) @Max(5) approvalLevel!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateApprovalRuleDto extends SaveApprovalRuleDto {}
