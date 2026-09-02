import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class SaveGeneralExpenseDto {
  @IsDateString() expenseDate!: string;
  @IsString() @IsNotEmpty() expenseHeadId!: string;
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsString() @IsNotEmpty() expenseById!: string;
  @IsOptional() @IsString() paidFromAccountId?: string;
  @IsOptional() @IsIn(["CASH_BANK", "PAYABLE"]) paymentMode?: "CASH_BANK" | "PAYABLE";
  @IsOptional() @IsIn(["DIRECT", "INDIRECT"]) expenseNature?: "DIRECT" | "INDIRECT";
  @IsOptional() @IsString() expenseLedgerAccountId?: string;
  @IsOptional() @IsString() payablePartyId?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
