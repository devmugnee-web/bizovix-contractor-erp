import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { VendorDeviceStatus } from "@bizovix/database";

export class QueryVendorDevicesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(VendorDeviceStatus)
  status?: VendorDeviceStatus;

  /** Derived filter — online/offline is computed from lastSeenAt, not a stored column. */
  @IsOptional()
  @IsIn(["online", "offline"])
  onlineStatus?: "online" | "offline";

  @IsOptional()
  @IsString()
  licenseId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
