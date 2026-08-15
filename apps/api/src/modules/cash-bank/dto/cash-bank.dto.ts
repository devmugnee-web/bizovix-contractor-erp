import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class QueryLedgerDto {
  @IsOptional() @Type(() => Number) page?: number;
  @IsOptional() @Type(() => Number) limit?: number;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() direction?: string;
  @IsOptional() @IsString() sourceModule?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class CreateBankAccountDto {
  @IsString() @MaxLength(120) bankName!: string;
  @IsString() @MaxLength(120) accountName!: string;
  @IsString() @MaxLength(80) accountNumber!: string;
  @IsString() @MaxLength(120) branch!: string;
  @IsOptional() @IsString() routingNumber?: string;
  @IsIn(["Current", "Savings", "SND", "OD", "Loan", "Other"]) bankAccountType!: string;
  @Type(() => Number) @IsNumber() openingBalance!: number;
  @IsDateString() openingBalanceDate!: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsIn(["Active", "Inactive"]) status?: string;
}

export class CreateCashTransactionDto {
  @IsIn(["IN", "OUT"]) direction!: "IN" | "OUT";
  @IsDateString() transactionDate!: string;
  @Type(() => Number) @IsPositive() amount!: number;
  @IsString() category!: string;
  @IsString() party!: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() referenceNo?: string;
  @IsOptional() @IsString() description?: string;
}

export class CreatePettyExpenseDto {
  @IsDateString() transactionDate!: string;
  @Type(() => Number) @IsPositive() amount!: number;
  @IsString() category!: string;
  @IsString() party!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() referenceNo?: string;
}

export class CreateTransferDto {
  @IsDateString() transferDate!: string;
  @IsString() fromAccountId!: string;
  @IsString() toAccountId!: string;
  @Type(() => Number) @IsPositive() amount!: number;
  @IsOptional() @Type(() => Number) @IsNumber() bankCharge?: number;
  @IsOptional() @IsString() referenceNo?: string;
  @IsOptional() @IsString() description?: string;
}

export class CreateReconciliationDto {
  @IsString() accountId!: string;
  @IsDateString() statementFrom!: string;
  @IsDateString() statementTo!: string;
  @Type(() => Number) @IsNumber() statementBalance!: number;
}

export class CreateChequeDto {
  @IsString() chequeNo!: string;
  @IsIn(["RECEIVED", "ISSUED"]) type!: string;
  @IsOptional() @IsString() accountId?: string;
  @IsString() bankName!: string;
  @IsOptional() @IsString() branch?: string;
  @IsString() party!: string;
  @Type(() => Number) @IsPositive() amount!: number;
  @IsDateString() chequeDate!: string;
  @IsOptional() @IsDateString() actionDate?: string;
  @IsOptional() @IsString() referenceNo?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdateChequeStatusDto {
  @IsIn(["PENDING", "DEPOSITED", "CLEARED", "BOUNCED", "CANCELLED"]) status!: string;
  @IsOptional() @IsDateString() actionDate?: string;
}
