import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from "class-validator";

export class SaveReceiptDto {
  @IsDateString() receiptDate!: string;
  @IsIn(["PROJECT", "GENERAL"]) receiptCategory!: "PROJECT" | "GENERAL";
  @IsString() @IsNotEmpty() receiptType!: string;
  @IsOptional() @IsString() workId?: string;
  @IsOptional() @IsString() receivableId?: string;
  @IsOptional() @IsString() receiptHeadAccountId?: string;
  @IsString() @IsNotEmpty() receivedFrom!: string;
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() grossAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) vatDeductedAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) taxDeductedAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) securityDepositDeductedAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) otherDeductionAmount?: number;
  @IsString() @IsNotEmpty() receivedInAccountId!: string;
  @IsString() @IsNotEmpty() paymentMethod!: string;
  @IsOptional() @IsString() @MaxLength(100) chequeNo?: string;
  @IsOptional() @IsDateString() chequeDate?: string;
  @IsOptional() @IsString() @MaxLength(150) chequeBankName?: string;
  @IsOptional() @IsString() @MaxLength(100) referenceNo?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsIn(["PENDING", "RECEIVED"]) status?: "PENDING" | "RECEIVED";
}
