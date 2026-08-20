import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class HeartbeatDto {
  @IsString()
  @IsNotEmpty()
  licenseKey!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsOptional()
  @IsString()
  appVersion?: string;
}
