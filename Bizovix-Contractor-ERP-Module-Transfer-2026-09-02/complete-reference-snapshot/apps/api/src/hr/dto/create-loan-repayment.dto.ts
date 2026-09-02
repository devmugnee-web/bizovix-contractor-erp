import { IsDateString, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateLoanRepaymentDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  amount!: number;

  @IsDateString()
  paidDate!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
