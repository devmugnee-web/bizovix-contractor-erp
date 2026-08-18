import { Type } from "class-transformer";
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class SaveSupplierPaymentDto {
  /** Payments are always raised against an approved Supplier Bill — the Payable and supplier are
   * derived from it, so a caller can never pair a bill with an unrelated payable. Generic
   * (non-procurement) payables keep using the existing Accounting payable-payment path. */
  @IsString()
  @IsNotEmpty()
  supplierBillId!: string;

  @IsString()
  @IsNotEmpty()
  bankAccountId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  paymentDate!: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
