import { Type } from "class-transformer";
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class SaveProjectExpenseDto {
  @IsString() @IsNotEmpty() workId!: string;
  @IsDateString() expenseDate!: string;
  @IsString() @IsNotEmpty() expenseHeadId!: string;
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsString() @IsNotEmpty() expenseById!: string;
  @IsString() @IsNotEmpty() paidFromAccountId!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
