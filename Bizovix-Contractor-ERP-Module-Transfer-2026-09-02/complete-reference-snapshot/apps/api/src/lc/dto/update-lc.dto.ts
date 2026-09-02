import { Type } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { CreateLcItemDto, LcPaymentAllocationDto } from "./create-lc.dto.js";

export class UpdateLcDto {
  @IsOptional()
  @IsDateString()
  lcDate?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  supplierName?: string;

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
  @IsNumber()
  exchangeRate?: number;

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

  /** Full replace of the product list — only allowed before any GRN has been
   * recorded (see LcService.update). Cannot be combined with paymentAllocations
   * in the same call; save products first, then adjust payment separately. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLcItemDto)
  items?: CreateLcItemDto[];
}
