import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEmail, IsIn, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from "class-validator";

import { SalaryComponentDto } from "./salary-component.dto.js";

const genders = ["MALE", "FEMALE", "OTHER"] as const;
const employmentTypes = ["PERMANENT", "PROBATION", "CONTRACTUAL", "INTERN"] as const;
const employeeStatuses = ["ACTIVE", "INACTIVE", "RESIGNED", "TERMINATED"] as const;
const paymentMethods = ["CASH", "BANK", "MFS"] as const;

export class CreateEmployeeDto {
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  fatherOrSpouseName?: string;

  @IsOptional()
  @IsIn(genders)
  gender?: (typeof genders)[number];

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  presentAddress?: string;

  @IsOptional()
  @IsString()
  permanentAddress?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  designationId?: string;

  @IsOptional()
  @IsString()
  gradeId?: string;

  @IsOptional()
  @IsString()
  businessUnitId?: string;

  @IsOptional()
  @IsString()
  divisionId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  reportingManagerId?: string;

  @IsOptional()
  @IsIn(employmentTypes)
  employmentType?: (typeof employmentTypes)[number];

  @IsOptional()
  @IsIn(employeeStatuses)
  status?: (typeof employeeStatuses)[number];

  @IsDateString()
  joiningDate!: string;

  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  @IsOptional()
  @IsDateString()
  contractEndDate?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  grossSalary!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  salaryComponents!: SalaryComponentDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  pfRate?: number;

  @IsOptional()
  @IsIn(paymentMethods)
  paymentMethod?: (typeof paymentMethods)[number];

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  mfsProvider?: string;

  @IsOptional()
  @IsString()
  mfsAccountNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
