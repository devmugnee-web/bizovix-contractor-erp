import { IsNotEmpty, IsString } from "class-validator";

export class DeactivateDeviceDto {
  @IsString()
  @IsNotEmpty()
  licenseKey!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;
}
