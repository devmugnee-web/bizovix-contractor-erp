import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from "class-validator";

import { SalaryComponentDto } from "./salary-component.dto.js";

export class UpdatePayrollSettingsDto {
  @IsIn(["CALENDAR_MONTH", "CUSTOM_CUTOFF"])
  cycleType!: "CALENDAR_MONTH" | "CUSTOM_CUTOFF";

  @IsInt()
  @Min(1)
  @Max(28)
  cycleStartDay!: number;

  @IsInt()
  @Min(1)
  @Max(28)
  paymentDay!: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  salaryComponents?: SalaryComponentDto[];
}
