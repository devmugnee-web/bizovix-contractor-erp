import { IsNumber, IsString, Min, MinLength } from "class-validator";

export class SalaryComponentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  percent!: number;
}
