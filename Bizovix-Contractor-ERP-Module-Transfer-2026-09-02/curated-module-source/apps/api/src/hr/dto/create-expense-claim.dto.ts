import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

const expenseCategories = ["TRAVEL", "MEAL", "TRANSPORTATION", "ACCOMMODATION", "OTHER"] as const;

export class CreateExpenseClaimDto {
  @IsString()
  employeeId!: string;

  @IsIn(expenseCategories)
  category!: (typeof expenseCategories)[number];

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  amount!: number;

  @IsDateString()
  expenseDate!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
