import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

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
}

export class CreateAccountingPeriodDto {
  @IsString() @MaxLength(40) label!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
}

export class SetPeriodStatusDto {
  @IsIn(["OPEN", "LOCKED"]) status!: string;
}
