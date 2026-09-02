import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateJobOpeningDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  designationId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfPositions?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
