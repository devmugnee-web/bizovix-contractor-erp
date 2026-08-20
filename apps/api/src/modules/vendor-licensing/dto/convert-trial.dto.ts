import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Min } from "class-validator";

export class ConvertTrialDto {
  @IsString()
  packageId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDevices?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
