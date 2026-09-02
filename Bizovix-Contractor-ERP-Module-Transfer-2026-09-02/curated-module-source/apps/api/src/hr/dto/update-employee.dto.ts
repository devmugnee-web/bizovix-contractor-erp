import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEmail, IsIn, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from "class-validator";

import { SalaryComponentDto } from "./salary-component.dto.js";

const genders = ["MALE", "FEMALE", "OTHER"] as const;
const employmentTypes = ["PERMANENT", "PROBATION", "CONTRACTUAL", "INTERN"] as const;
const employeeStatuses = ["ACTIVE", "INACTIVE", "RESIGNED", "TERMINATED"] as const;
const paymentMethods = ["CASH", "BANK", "MFS"] as const;

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  designationId?: string | null;

  @IsOptional()
  @IsString()
  gradeId?: string | null;

  @IsOptional()
  @IsString()
  businessUnitId?: string | null;

  @IsOptional()
  @IsString()
  divisionId?: string | null;

  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  costCenterId?: string | null;

  @IsOptional()
  @IsString()
  reportingManagerId?: string | null;

  @IsOptional()
  @IsIn(employmentTypes)
  employmentType?: (typeof employmentTypes)[number];

  @IsOptional()
  @IsIn(employeeStatuses)
  status?: (typeof employeeStatuses)[number];

  @IsOptional()
  @IsDateString()
  joiningDate?: string;

  @IsOptional()
  @IsDateString()
  probationEndDate?: string | null;

  @IsOptional()
  @IsDateString()
  contractEndDate?: string | null;

  @IsOptional()
  @IsDateString()
  resignationDate?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  grossSalary?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  salaryComponents?: SalaryComponentDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  pfRate?: number | null;

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
