import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateFinanceSettingDto {
  @IsOptional() @IsString() defaultCashAccountId?: string;
  @IsOptional() @IsString() defaultPettyCashAccountId?: string;
  @IsOptional() @IsString() defaultBankChargeAccountId?: string;
  @IsOptional() @IsString() defaultReceivableAccountId?: string;
  @IsOptional() @IsString() defaultPayableAccountId?: string;
  @IsOptional() @IsString() defaultProjectRevenueAccountId?: string;
  @IsOptional() @IsString() defaultGeneralExpenseAccountId?: string;
  @IsOptional() @IsString() defaultTenderDocumentExpenseAccountId?: string;
  @IsOptional() @IsString() defaultCreditCommitmentChargeAccountId?: string;
  @IsBoolean() autoPostApproved!: boolean;
  @IsBoolean() requireApprovalBeforePosting!: boolean;
  @IsBoolean() allowBackdatedTransactions!: boolean;
  @IsBoolean() allowFutureDatedTransactions!: boolean;
  /** Supplier Bill 3-way-match rate tolerance (%) — omit/null means zero tolerance, so any
   * invoice-vs-PO rate difference is flagged as a variance. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) billRateTolerancePct?: number;
}

export class CreateAccountingPeriodDto {
  @IsString() @MaxLength(40) label!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
}

export class SetPeriodStatusDto {
  @IsIn(["OPEN", "LOCKED"]) status!: string;
}
