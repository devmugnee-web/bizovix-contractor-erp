import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

const separationTypes = ["RESIGNATION", "TERMINATION", "RETIREMENT", "CONTRACT_EXPIRY"] as const;

export class CreateExitProcessDto {
  @IsString()
  employeeId!: string;

  @IsIn(separationTypes)
  separationType!: (typeof separationTypes)[number];

  @IsOptional()
  @IsDateString()
  noticeStartDate?: string;

  @IsOptional()
  @IsDateString()
  lastWorkingDate?: string;
}
