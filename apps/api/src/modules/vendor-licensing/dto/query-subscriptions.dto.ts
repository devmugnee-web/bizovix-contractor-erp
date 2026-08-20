import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
import { VendorBillingCycle, VendorSubscriptionStatus } from "@bizovix/database";

export class QueryVendorSubscriptionsDto {
  @IsOptional()
  @IsEnum(VendorSubscriptionStatus)
  status?: VendorSubscriptionStatus;

  @IsOptional()
  @IsEnum(VendorBillingCycle)
  billingCycle?: VendorBillingCycle;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expiringWithinDays?: number;

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
