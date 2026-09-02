import { Type } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

export class LcPaymentAllocationDto {
  @IsString()
  accountId!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CreateLcItemDto {
  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @IsString()
  productName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  usdUnitPrice!: number;

  /** Manual/accepted BDT unit price when it differs from usdUnitPrice x rate
   * (e.g. supplier invoice rounding). Optional — falls back to the calculated value. */
  @IsOptional()
  @IsNumber()
  acceptedBdtUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsNumber()
  cbm?: number;

  @IsOptional()
  @IsString()
  hsCode?: string;
}

export class CreateLcDto {
  @IsString()
  workspaceId!: string;

  @IsString()
  lcNumber!: string;

  @IsDateString()
  lcDate!: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsString()
  supplierName!: string;

  @IsOptional()
  @IsString()
  supplierCountry?: string;

  @IsOptional()
  @IsString()
  purchaseOrderRef?: string;

  @IsOptional()
  @IsString()
  piReference?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankBranch?: string;

  @IsOptional()
  @IsString()
  lcType?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsNumber()
  exchangeRate!: number;

  @IsOptional()
  @IsString()
  incoterm?: string;

  @IsOptional()
  @IsString()
  originCountry?: string;

  @IsOptional()
  @IsString()
  originPort?: string;

  @IsOptional()
  @IsString()
  destinationPort?: string;

  @IsOptional()
  @IsString()
  destinationWarehouseId?: string;

  @IsOptional()
  @IsDateString()
  lastShipmentDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsIn(["UNPAID", "PARTIAL", "PAID"])
  purchasePaymentStatus?: "UNPAID" | "PARTIAL" | "PAID";

  @IsOptional()
  @IsNumber()
  purchasePaidAmount?: number;

  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LcPaymentAllocationDto)
  paymentAllocations?: LcPaymentAllocationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLcItemDto)
  items!: CreateLcItemDto[];
}
