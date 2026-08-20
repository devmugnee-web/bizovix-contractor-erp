import { IsOptional, IsString } from "class-validator";

export class SuspendVendorLicenseDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
