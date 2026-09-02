import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const ITEM_ROLES = [
  "RAW_MATERIAL",
  "PACKAGING_MATERIAL",
  "INTERMEDIATE",
  "BULK",
  "FINISHED_GOOD",
  "BY_PRODUCT",
  "CONSUMABLE",
] as const;
const MAKE_BUY = ["MAKE", "BUY", "BOTH"] as const;
const LOCATION_DISPOSITIONS = [
  "RELEASED",
  "RESERVED",
  "STAGING",
  "WIP",
  "QC_HOLD",
  "REWORK",
  "REJECTED",
  "SCRAP",
] as const;
const SUPPLY_SUGGESTION_TYPES = [
  "PURCHASE_REQUISITION",
  "STOCK_TRANSFER",
] as const;

export class CreateManufacturingItemProfileDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() inventoryItemId!: string;
  @IsIn(ITEM_ROLES) role!: (typeof ITEM_ROLES)[number];
  @IsOptional() @IsIn(MAKE_BUY) makeBuy?: (typeof MAKE_BUY)[number];
  @IsOptional() @IsBoolean() lotTracked?: boolean;
  @IsOptional() @IsBoolean() serialTracked?: boolean;
  @IsOptional() @IsBoolean() expiryTracked?: boolean;
  @IsOptional() @IsBoolean() qcRequired?: boolean;
  @IsOptional() @IsInt() @Min(1) shelfLifeDays?: number | null;
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  @Max(100)
  standardYieldPercent?: number;
  @IsOptional() @IsString() defaultIssueLocationId?: string | null;
  @IsOptional() @IsString() defaultReceiptLocationId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateManufacturingItemProfileDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsOptional() @IsIn(ITEM_ROLES) role?: (typeof ITEM_ROLES)[number];
  @IsOptional() @IsIn(MAKE_BUY) makeBuy?: (typeof MAKE_BUY)[number];
  @IsOptional() @IsBoolean() lotTracked?: boolean;
  @IsOptional() @IsBoolean() serialTracked?: boolean;
  @IsOptional() @IsBoolean() expiryTracked?: boolean;
  @IsOptional() @IsBoolean() qcRequired?: boolean;
  @IsOptional() @IsInt() @Min(1) shelfLifeDays?: number | null;
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  @Max(100)
  standardYieldPercent?: number;
  @IsOptional() @IsString() defaultIssueLocationId?: string | null;
  @IsOptional() @IsString() defaultReceiptLocationId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateManufacturingLocationDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() warehouseId!: string;
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsIn(LOCATION_DISPOSITIONS)
  disposition!: (typeof LOCATION_DISPOSITIONS)[number];
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateManufacturingLocationDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsOptional() @IsString() @IsNotEmpty() code?: string;
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional()
  @IsIn(LOCATION_DISPOSITIONS)
  disposition?: (typeof LOCATION_DISPOSITIONS)[number];
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateManufacturingRoutingDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsOptional() @IsString() code?: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() finishedProductId!: string;
  @IsOptional() @IsString() description?: string | null;
}

export class ManufacturingRoutingOperationDto {
  @IsInt() @Min(1) sequence!: number;
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() workCenterCode?: string | null;
  @IsOptional() @IsString() productionLineCode?: string | null;
  @IsOptional() @IsNumber() @Min(0) setupMinutes?: number;
  @IsOptional() @IsNumber() @Min(0) runMinutesPerUnit?: number;
  @IsOptional() @IsNumber() @Min(0) queueMinutes?: number;
  @IsOptional() @IsBoolean() isSubcontracted?: boolean;
  @IsOptional() @IsBoolean() qcRequired?: boolean;
  @IsOptional() @IsString() instructions?: string | null;
  @IsString() @IsNotEmpty() responsibleUserId!: string;
}

export class CreateManufacturingRoutingVersionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsOptional() @IsInt() @Min(1) versionNumber?: number;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsString() changeReason?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManufacturingRoutingOperationDto)
  operations!: ManufacturingRoutingOperationDto[];
}

export class ManufacturingPlanningApprovalDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
  @IsOptional() @IsString() note?: string | null;
  @IsOptional() @IsString() signatureMeaning?: string | null;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
}

export class ManufacturingPlanLotDto {
  @IsString() @IsNotEmpty() lotNumber!: string;
  @IsInt() @Min(1) sequence!: number;
  @IsNumber() @Min(0.0001) plannedQuantity!: number;
  @IsOptional() @IsDateString() plannedStartDate?: string | null;
  @IsOptional() @IsDateString() plannedEndDate?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

export class CreateManufacturingPlanDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() planNumber?: string;
  @IsString() @IsNotEmpty() finishedProductId!: string;
  @IsString() @IsNotEmpty() bomVersionId!: string;
  @IsOptional() @IsString() routingVersionId?: string | null;
  @IsNumber() @Min(0.0001) plannedQuantity!: number;
  @IsString() @IsNotEmpty() unit!: string;
  @IsDateString() plannedStartDate!: string;
  @IsDateString() plannedEndDate!: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManufacturingPlanLotDto)
  lots!: ManufacturingPlanLotDto[];
}

export class CalculateManufacturingMrpDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() planId!: string;
  @IsOptional() @IsNumber() @Min(0.0001) scenarioQuantity?: number;
  @IsOptional() @IsString() warehouseId?: string | null;
  @IsOptional() @IsString() runNumber?: string;
  @IsDateString() asOfDate!: string;
  @IsOptional() @IsDateString() horizonEndDate?: string | null;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() note?: string | null;
}

export class CreateManufacturingSupplySuggestionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() mrpRequirementId!: string;
  @IsIn(SUPPLY_SUGGESTION_TYPES)
  type!: (typeof SUPPLY_SUGGESTION_TYPES)[number];
  @IsNumber() @Min(0.0001) requestedQuantity!: number;
  @IsOptional() @IsString() sourceWarehouseId?: string | null;
  @IsOptional() @IsString() destinationWarehouseId?: string | null;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class ConvertManufacturingSupplySuggestionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(160) externalReference?: string | null;
  @IsOptional() @IsDateString() expectedReceiptDate?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class CancelManufacturingSupplySuggestionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}
