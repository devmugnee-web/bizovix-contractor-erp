import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateCompanyProfileDto {
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MaxLength(150) displayName?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(150) website?: string;
  @IsOptional() @IsString() @MaxLength(60) tradeLicenseNo?: string;
  @IsOptional() @IsString() @MaxLength(60) tinNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) binNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) registrationNumber?: string;
  @IsOptional() @IsString() @MaxLength(150) signatoryName?: string;
  @IsOptional() @IsString() @MaxLength(150) signatoryDesignation?: string;
}
