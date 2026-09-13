import { Type } from "class-transformer";
import { IsDateString, IsNumber, IsPositive, Matches, Max } from "class-validator";

export class SetMonthlyTargetDto {
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(90_000_000_000_000)
  targetAmount!: number;
}
