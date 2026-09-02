import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { CostPaymentAllocationDto } from "./create-cost-entry.dto.js";

export class UpdateLcCostEntryDto {
  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsNumber()
  foreignAmount?: number;

  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  bdtAmount?: number;

  @IsOptional()
  @IsBoolean()
  includeInLandedCost?: boolean;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  attachmentName?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsIn(["CREDIT", "CASH_BANK_MFS"])
  paymentMethod?: "CREDIT" | "CASH_BANK_MFS";

  @IsOptional()
  @IsString()
  creditPayeeName?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CostPaymentAllocationDto)
  paymentAllocations?: CostPaymentAllocationDto[];
}
