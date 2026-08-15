import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class SaveReceiptDto {
  @IsDateString() receiptDate!: string;
  @IsIn(["PROJECT", "GENERAL"]) receiptCategory!: "PROJECT" | "GENERAL";
  @IsString() @IsNotEmpty() receiptType!: string;
  @IsOptional() @IsString() workId?: string;
  @IsString() @IsNotEmpty() receivedFrom!: string;
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsString() @IsNotEmpty() receivedInAccountId!: string;
  @IsString() @IsNotEmpty() paymentMethod!: string;
  @IsOptional() @IsString() @MaxLength(100) referenceNo?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsIn(["PENDING", "RECEIVED"]) status?: "PENDING" | "RECEIVED";
}
