import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

const separationTypes = ["RESIGNATION", "TERMINATION", "RETIREMENT", "CONTRACT_EXPIRY"] as const;
const exitProcessStatuses = ["IN_PROGRESS", "COMPLETED"] as const;

export class UpdateExitProcessDto {
  @IsOptional()
  @IsIn(separationTypes)
  separationType?: (typeof separationTypes)[number];

  @IsOptional()
  @IsDateString()
  noticeStartDate?: string;

  @IsOptional()
  @IsDateString()
  lastWorkingDate?: string;

  @IsOptional()
  @IsBoolean()
  departmentClearance?: boolean;

  @IsOptional()
  @IsBoolean()
  assetClearance?: boolean;

  @IsOptional()
  @IsBoolean()
  financeClearance?: boolean;

  @IsOptional()
  @IsBoolean()
  hrClearance?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  finalSettlementAmount?: number | null;

  @IsOptional()
  @IsString()
  exitInterviewNotes?: string | null;

  @IsOptional()
  @IsIn(exitProcessStatuses)
  status?: (typeof exitProcessStatuses)[number];
}
