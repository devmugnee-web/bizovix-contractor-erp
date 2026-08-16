import { Type } from "class-transformer";
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

export class QueryInvoiceDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsString() status?: string;
}

const PAYMENT_METHOD_TYPES = ["BANK_TRANSFER", "CARD", "MOBILE_FINANCIAL_SERVICE", "MANUAL"];

export class RecordPaymentDto {
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsIn(PAYMENT_METHOD_TYPES) method!: string;
  @IsOptional() @IsString() reference?: string;
}

export class VerifyPaymentDto {
  @IsIn(["VERIFIED", "REJECTED"]) status!: string;
}
