import { IsOptional, IsString } from "class-validator";

export class RevokeVendorLicenseDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
