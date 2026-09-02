import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

const jobOpeningStatuses = ["OPEN", "ON_HOLD", "CLOSED"] as const;

export class UpdateJobOpeningDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  designationId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfPositions?: number;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(jobOpeningStatuses)
  status?: (typeof jobOpeningStatuses)[number];
}
