import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

const loanTypes = ["LOAN", "SALARY_ADVANCE", "EXPENSE_ADVANCE"] as const;

export class CreateEmployeeLoanDto {
  @IsString()
  employeeId!: string;

  @IsIn(loanTypes)
  loanType!: (typeof loanTypes)[number];

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  principalAmount!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsDateString()
  applicationDate!: string;
}
