import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { VendorLicenseType } from "@bizovix/database";
import { CreateVendorCustomerDto } from "./create-customer.dto";

export class IssueVendorLicenseDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateVendorCustomerDto)
  newCustomer?: CreateVendorCustomerDto;

  @IsString()
  packageId!: string;

  @IsOptional()
  @IsEnum(VendorLicenseType)
  type?: VendorLicenseType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDevices?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
