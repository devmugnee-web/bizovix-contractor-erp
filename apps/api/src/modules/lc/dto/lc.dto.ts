import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from "class-validator";

const BASES = ["PURCHASE_VALUE", "USD_VALUE", "QUANTITY", "WEIGHT", "CBM", "EQUAL"] as const;
const MODES = ["AUTO", "MANUAL_AMOUNT", "MANUAL_PERCENTAGE", "HYBRID", "DIRECT_PRODUCT"] as const;

export class PaymentAllocationDto {
  @IsString() accountId!: string;
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsString() reference?: string;
}

export class LcItemInputDto {
  @IsOptional() @IsString() itemId?: string;
  @IsString() productName!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @Type(() => Number) @IsNumber() @IsPositive() quantity!: number;
  @Type(() => Number) @IsNumber() @Min(0) foreignUnitPrice!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) acceptedBdtUnitPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weight?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cbm?: number;
  @IsOptional() @IsString() hsCode?: string;
}

export class CreateLcDto {
  @IsOptional() @IsString() lcNumber?: string;
  @IsDateString() lcDate!: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsString() supplierName!: string;
  @IsOptional() @IsString() supplierCountry?: string;
  @IsOptional() @IsString() purchaseOrderRef?: string;
  @IsOptional() @IsString() piReference?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankBranch?: string;
  @IsOptional() @IsString() lcType?: string;
  @IsOptional() @IsString() currency?: string;
  @Type(() => Number) @IsNumber() @IsPositive() exchangeRate!: number;
  @IsOptional() @IsString() incoterm?: string;
  @IsOptional() @IsString() originCountry?: string;
  @IsOptional() @IsString() originPort?: string;
  @IsOptional() @IsString() destinationPort?: string;
  @IsOptional() @IsString() destinationWarehouseId?: string;
  @IsOptional() @IsDateString() lastShipmentDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsIn(["UNPAID", "PARTIAL", "PAID"]) purchasePaymentStatus?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) purchasePaidAmount?: number;
  @IsOptional() @IsString() paymentReference?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto) paymentAllocations?: PaymentAllocationDto[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LcItemInputDto) items!: LcItemInputDto[];
}

export class UpdateLcDto {
  @IsOptional() @IsDateString() lcDate?: string;
  @IsOptional() @IsString() supplierId?: string | null;
  @IsOptional() @IsString() supplierName?: string;
  @IsOptional() @IsString() supplierCountry?: string;
  @IsOptional() @IsString() purchaseOrderRef?: string;
  @IsOptional() @IsString() piReference?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankBranch?: string;
  @IsOptional() @IsString() lcType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() exchangeRate?: number;
  @IsOptional() @IsString() incoterm?: string;
  @IsOptional() @IsString() originCountry?: string;
  @IsOptional() @IsString() originPort?: string;
  @IsOptional() @IsString() destinationPort?: string;
  @IsOptional() @IsString() destinationWarehouseId?: string | null;
  @IsOptional() @IsDateString() lastShipmentDate?: string | null;
  @IsOptional() @IsDateString() expiryDate?: string | null;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsIn(["UNPAID", "PARTIAL", "PAID"]) purchasePaymentStatus?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) purchasePaidAmount?: number;
  @IsOptional() @IsString() paymentReference?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto) paymentAllocations?: PaymentAllocationDto[];
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LcItemInputDto) items?: LcItemInputDto[];
}

export class LcStatusDto { @IsIn(["DRAFT", "ACTIVE", "COSTING_PENDING", "ALLOCATION_PENDING", "READY_TO_FINALIZE", "FINALIZED", "CLOSED", "CANCELLED"]) status!: string; @IsOptional() @IsString() reason?: string; }

export class LcCostHeadDto {
  @IsString() name!: string;
  @IsOptional() @IsString() code?: string;
  @IsIn(["LC_BANKING", "ORIGIN", "FREIGHT", "INSURANCE", "CUSTOMS", "TAX", "CNF", "PORT", "DESTINATION_TRANSPORT", "LOCAL", "OTHER"]) category!: string;
  @IsOptional() @IsString() defaultCurrency?: string;
  @IsOptional() @IsIn(BASES) defaultAllocationMethod?: string;
  @IsOptional() @IsIn(BASES) fallbackAllocationMethod?: string;
  @IsOptional() @IsBoolean() includeInLandedCost?: boolean;
  @IsOptional() @IsBoolean() manualOverrideAllowed?: boolean;
  @IsOptional() @IsString() glAccountId?: string;
}
export class UpdateLcCostHeadDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(BASES) defaultAllocationMethod?: string;
  @IsOptional() @IsIn(BASES) fallbackAllocationMethod?: string;
  @IsOptional() @IsBoolean() includeInLandedCost?: boolean;
  @IsOptional() @IsBoolean() manualOverrideAllowed?: boolean;
  @IsOptional() @IsString() glAccountId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ShipmentDto {
  @IsOptional() @IsIn(["SEA", "AIR", "ROAD", "RAIL", "COURIER", "MULTIMODAL"]) transportMode?: string;
  @IsOptional() @IsString() shipmentNumber?: string;
  @IsOptional() @IsString() blAwbNumber?: string;
  @IsOptional() @IsDateString() etd?: string;
  @IsOptional() @IsDateString() eta?: string;
  @IsOptional() @IsString() containerNumber?: string;
  @IsOptional() @IsString() forwarderName?: string;
  @IsOptional() @IsString() shippingLine?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class LcCostEntryDto {
  @IsString() costHeadId!: string;
  @IsOptional() @IsString() shipmentId?: string;
  @IsOptional() @IsString() vendorName?: string;
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsDateString() invoiceDate?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) foreignAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() exchangeRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() bdtAmount?: number;
  @IsOptional() @IsIn(MODES) allocationMode?: string;
  @IsOptional() @IsIn(BASES) allocationBasis?: string;
  @IsOptional() @IsBoolean() includeInLandedCost?: boolean;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsOptional() @IsString() attachmentName?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsIn(["CREDIT", "CASH_BANK_MFS"]) paymentMethod?: string;
  @IsOptional() @IsString() creditPayeeName?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto) paymentAllocations?: PaymentAllocationDto[];
}
export class UpdateLcCostEntryDto {
  @IsOptional() @IsString() vendorName?: string;
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsDateString() invoiceDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) foreignAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() exchangeRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() bdtAmount?: number;
  @IsOptional() @IsBoolean() includeInLandedCost?: boolean;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsOptional() @IsString() attachmentName?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsIn(["CREDIT", "CASH_BANK_MFS"]) paymentMethod?: string;
  @IsOptional() @IsString() creditPayeeName?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto) paymentAllocations?: PaymentAllocationDto[];
}

export class AllocationRowDto { @IsString() lcItemId!: string; @IsOptional() @Type(() => Number) @IsNumber() @Min(0) manualAmount?: number; @IsOptional() @Type(() => Number) @IsNumber() @Min(0) manualPercentage?: number; @IsOptional() @IsString() overrideReason?: string; }
export class SaveAllocationDto { @IsIn(MODES) allocationMode!: string; @IsOptional() @IsIn(BASES) allocationBasis?: string; @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => AllocationRowDto) rows!: AllocationRowDto[]; }

export class LcGrnItemDto { @IsString() lcItemId!: string; @Type(() => Number) @IsNumber() @Min(0) receivedQuantity!: number; @IsOptional() @Type(() => Number) @IsNumber() @Min(0) damagedQuantity?: number; @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rejectedQuantity?: number; }
export class LcGrnDto { @IsOptional() @IsString() grnNumber?: string; @IsDateString() receivedDate!: string; @IsOptional() @IsString() warehouseId?: string; @IsOptional() @IsString() remarks?: string; @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LcGrnItemDto) items!: LcGrnItemDto[]; }

export class ProfitRowDto { @IsString() lcItemId!: string; @IsIn(["PERCENTAGE", "FIXED"]) profitMode!: string; @Type(() => Number) @IsNumber() @Min(0) profitValue!: number; }
export class ProfitDto { @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ProfitRowDto) items!: ProfitRowDto[]; }
export class InventoryPostingRowDto { @IsString() lcItemId!: string; @IsString() warehouseId!: string; @IsOptional() @IsString() itemId?: string; @IsIn(["EXISTING", "NEW", "ONE_TIME"]) postingType!: string; }
export class InventoryPostingDto { @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InventoryPostingRowDto) items!: InventoryPostingRowDto[]; }
export class UpdateInventoryPostingRowDto { @IsString() lcItemId!: string; @IsString() warehouseId!: string; @IsString() itemId!: string; }
export class UpdateInventoryPostingDto { @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => UpdateInventoryPostingRowDto) items!: UpdateInventoryPostingRowDto[]; }
export class ReopenLcDto { @IsString() reason!: string; }
export class WarehouseDto { @IsString() code!: string; @IsString() name!: string; @IsOptional() @IsString() address?: string; }
