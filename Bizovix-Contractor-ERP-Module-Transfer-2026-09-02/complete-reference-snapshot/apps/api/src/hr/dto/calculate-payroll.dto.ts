import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";

export class PayrollEntryDto {
  @IsString()
  employeeId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  presentDays!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  iouDeduction?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  loanDeduction?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  fineDeduction?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  lunchBillDeduction?: number;
}

export class CalculatePayrollDto {
  @IsInt()
  @Min(2000)
  periodYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  totalWorkingDays!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PayrollEntryDto)
  entries!: PayrollEntryDto[];
}
