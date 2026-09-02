import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

const MODES = ["AUTO", "MANUAL_AMOUNT", "MANUAL_PERCENTAGE", "HYBRID", "DIRECT_PRODUCT"] as const;
const BASES = ["PURCHASE_VALUE", "USD_VALUE", "QUANTITY", "WEIGHT", "CBM", "EQUAL"] as const;

export class CostPaymentAllocationDto {
  @IsString()
  accountId!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CreateLcCostEntryDto {
  @IsString()
  costHeadId!: string;

  @IsOptional()
  @IsString()
  shipmentId?: string;

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
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  foreignAmount?: number;

  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  /** Required when currency is BDT (no conversion needed); computed from
   * foreignAmount x exchangeRate otherwise. */
  @IsOptional()
  @IsNumber()
  bdtAmount?: number;

  @IsOptional()
  @IsIn(MODES)
  allocationMode?: (typeof MODES)[number];

  @IsOptional()
  @IsIn(BASES)
  allocationBasis?: (typeof BASES)[number];

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
