import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min } from "class-validator";
import { VendorBillingCycle, VendorLicenseType } from "@bizovix/database";

export class CreateVendorPackageDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(VendorLicenseType)
  type!: VendorLicenseType;

  /** Only meaningful when type = SUBSCRIPTION; defaults to MONTHLY at issuance if omitted. */
  @IsOptional()
  @IsEnum(VendorBillingCycle)
  billingCycle?: VendorBillingCycle;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDevices!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
