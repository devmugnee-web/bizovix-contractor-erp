import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class RequestTrialDto {
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Optional device fingerprint — when provided, reusing it blocks unlimited repeat-trial abuse from the same install. */
  @IsOptional()
  @IsString()
  deviceId?: string;
}
