import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from "class-validator";

const attendanceStatuses = ["PRESENT", "ABSENT", "LEAVE", "HOLIDAY"] as const;

// Every uploaded sheet uses different headers (biometric machine exports,
// hand-kept spreadsheets, HR templates from other tools) — the dialog that
// builds this DTO already normalizes whatever it finds into this shape and
// derives `status` itself, so the only thing required here is knowing which
// employee and which day a row is about. Everything else stays optional and
// is best-effort: `hr.service.ts#importAttendance` skips a row it can't
// resolve rather than failing the whole file over one bad line.
export class ImportAttendanceRowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  employeeCode?: string;

  // Fallback identifier when the sheet only has a name column (the common
  // case for biometric device exports) — resolved against Employee.name at
  // import time.
  @IsOptional()
  @IsString()
  @MinLength(1)
  employeeName?: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsIn(attendanceStatuses)
  status?: (typeof attendanceStatuses)[number];

  @IsOptional()
  @IsString()
  checkIn?: string;

  @IsOptional()
  @IsString()
  checkOut?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  lateMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  overtimeMinutes?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ImportAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportAttendanceRowDto)
  rows!: ImportAttendanceRowDto[];
}
