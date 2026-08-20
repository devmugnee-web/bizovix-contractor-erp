import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Min } from "class-validator";

export class UpdateVendorLicenseDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDevices?: number;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
