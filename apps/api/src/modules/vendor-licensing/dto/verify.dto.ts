import { IsNotEmpty, IsString } from "class-validator";

export class VerifyLicenseDto {
  @IsString()
  @IsNotEmpty()
  licenseKey!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;
}
