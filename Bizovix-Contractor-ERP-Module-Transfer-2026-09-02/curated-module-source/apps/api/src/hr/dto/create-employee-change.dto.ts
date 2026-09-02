import { IsDateString, IsIn, IsOptional, IsString, MinLength } from "class-validator";

const changeTypes = [
  "PROMOTION",
  "TRANSFER",
  "DEPARTMENT_CHANGE",
  "DESIGNATION_CHANGE",
  "GRADE_CHANGE",
  "SALARY_REVISION",
  "REPORTING_MANAGER_CHANGE",
  "LOCATION_CHANGE",
  "EMPLOYMENT_TYPE_CHANGE",
] as const;

export class CreateEmployeeChangeDto {
  @IsString()
  @MinLength(1)
  employeeId!: string;

  @IsIn(changeTypes)
  changeType!: (typeof changeTypes)[number];

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  previousValue?: string;

  @IsOptional()
  @IsString()
  newValue?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
