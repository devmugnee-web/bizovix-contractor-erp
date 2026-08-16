import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const PAYMENT_METHOD_TYPES = ["BANK_TRANSFER", "CARD", "MOBILE_FINANCIAL_SERVICE", "MANUAL"];

export class UpdateBillingProfileDto {
  @IsOptional() @IsString() @MaxLength(150) billingName?: string;
  @IsOptional() @IsEmail() billingEmail?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) billingAddress?: string;
  @IsOptional() @IsString() @MaxLength(60) tinNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) binNumber?: string;
  @IsIn(PAYMENT_METHOD_TYPES) paymentMethodType!: string;
  @IsOptional() @IsString() @MaxLength(150) paymentMethodLabel?: string;
}
