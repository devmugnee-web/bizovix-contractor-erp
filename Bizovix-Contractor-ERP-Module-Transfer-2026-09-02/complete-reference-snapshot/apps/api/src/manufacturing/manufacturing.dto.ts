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
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const MANUFACTURING_MODES = ["GENERAL", "PHARMACEUTICAL", "HYBRID"] as const;
const MAKE_BUY = ["MAKE", "BUY", "BOTH"] as const;
const ORDER_TYPES = [
  "ASSEMBLY",
  "PHARMACEUTICAL",
  "PACKAGING",
  "REWORK",
  "REPROCESSING",
  "SUBCONTRACT",
] as const;
const ACTION_KINDS = [
  "SUBMIT",
  "APPROVE",
  "AMEND",
  "CANCEL",
  "RESERVE_MATERIALS",
  "RELEASE_RESERVATION",
  "ISSUE_MATERIALS",
  "RETURN_MATERIALS",
  "PACKAGING_ISSUE",
  "PACKAGING_RETURN",
  "START_PRODUCTION",
  "START_OPERATION",
  "PAUSE_PRODUCTION",
  "RESUME_PRODUCTION",
  "COMPLETE_OPERATION",
  "POST_SCRAP_DISPOSITION",
  "CREATE_REWORK_DISPOSITION",
  "COMPLETE_PRODUCTION",
  "PLACE_QC_HOLD",
  "RECORD_IN_PROCESS_RESULT",
  "RECORD_QUALITY_RESULT",
  "QA_RELEASE",
  "POST_PRODUCTION_RECEIPT",
  "CLOSE",
] as const;
const WORKFLOW_GROUPS = [
  "DASHBOARD_CONTROL_CENTER",
  "MASTERS_FORMULA",
  "PLANNING_MRP",
  "PRODUCTION_BATCH_ORDERS",
  "MATERIALS_DISPENSING",
  "PRODUCTION_EXECUTION",
  "QUALITY_COMPLIANCE",
  "PACKAGING_RELEASE",
  "COSTING_ACCOUNTS",
  "REPORTS_ANALYTICS",
  "SETUP_WORKFLOW_AUDIT",
] as const;

export class UpdateManufacturingSettingsDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsIn(MANUFACTURING_MODES) mode!: (typeof MANUFACTURING_MODES)[number];
  @IsOptional() @IsString() rawMaterialWarehouseId?: string | null;
  @IsOptional() @IsString() wipWarehouseId?: string | null;
  @IsOptional() @IsString() finishedGoodsQualityWarehouseId?: string | null;
  @IsOptional() @IsString() finishedGoodsReleasedWarehouseId?: string | null;
  @IsOptional() @IsString() rejectedWarehouseId?: string | null;
  @IsOptional() @IsString() scrapWarehouseId?: string | null;
  @IsOptional() @IsString() rawMaterialInventoryAccountId?: string | null;
  @IsOptional() @IsString() packagingInventoryAccountId?: string | null;
  @IsOptional() @IsString() wipInventoryAccountId?: string | null;
  @IsOptional() @IsString() finishedGoodsInventoryAccountId?: string | null;
  @IsOptional() @IsString() manufacturingVarianceAccountId?: string | null;
  @IsOptional() @IsString() labourClearingAccountId?: string | null;
  @IsOptional() @IsString() overheadAbsorptionAccountId?: string | null;
  @IsOptional() @IsString() scrapRecoveryAccountId?: string | null;
  @IsBoolean() reservationRequired!: boolean;
  @IsBoolean() issueBeforeProduction!: boolean;
  @IsBoolean() negativeStockAllowed!: boolean;
  @IsBoolean() serialTrackingRequired!: boolean;
  @IsBoolean() qualityReleaseRequired!: boolean;
  @IsBoolean() partialProductionAllowed!: boolean;
  @IsBoolean() electronicSignatureRequired!: boolean;
  @IsBoolean() approvalRequired!: boolean;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

export class CreateManufacturingBomDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() bomNumber?: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() finishedProductId!: string;
  @IsOptional() @IsIn(MAKE_BUY) makeBuy?: (typeof MAKE_BUY)[number];
  @IsOptional() @IsString() notes?: string;
}

export class ManufacturingBomComponentDto {
  @IsString() @IsNotEmpty() inventoryItemId!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsString() @IsNotEmpty() unit!: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) scrapPercentage?: number;
  @IsOptional() @IsBoolean() isOptional?: boolean;
  @IsOptional() @IsString() substituteGroup?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

export class CreateManufacturingBomVersionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsOptional() @IsInt() @Min(1) versionNumber?: number;
  @IsNumber() @Min(0.0001) outputQuantity!: number;
  @IsString() @IsNotEmpty() outputUnit!: string;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsString() changeReason?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManufacturingBomComponentDto)
  components!: ManufacturingBomComponentDto[];
}

export class ApproveManufacturingVersionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() signatureMeaning?: string | null;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
}

export class ManufacturingOrderLotDto {
  @IsString() @IsNotEmpty() lotNumber!: string;
  @IsNumber() @Min(0.0001) plannedQuantity!: number;
}

export class CreateManufacturingOrderDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() orderNumber?: string;
  @IsIn(ORDER_TYPES) orderType!: (typeof ORDER_TYPES)[number];
  @IsString() @IsNotEmpty() finishedProductId!: string;
  @IsString() @IsNotEmpty() bomVersionId!: string;
  @IsString() @IsNotEmpty() routingVersionId!: string;
  @IsOptional() @IsString() planId?: string | null;
  @IsOptional() @IsString() planLotId?: string | null;
  @IsNumber() @Min(0.0001) plannedQuantity!: number;
  @IsString() @IsNotEmpty() unit!: string;
  @IsString() @IsNotEmpty() sourceWarehouseId!: string;
  @IsString() @IsNotEmpty() destinationWarehouseId!: string;
  @IsOptional() @IsString() sourceLocationId?: string | null;
  @IsOptional() @IsString() destinationLocationId?: string | null;
  @IsDateString() plannedStartDate!: string;
  @IsDateString() plannedEndDate!: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManufacturingOrderLotDto)
  lots?: ManufacturingOrderLotDto[];
}

export class ManufacturingOrderActionLineDto {
  @IsOptional() @IsString() orderMaterialId?: string;
  @IsOptional() @IsString() orderLotId?: string;
  @IsOptional() @IsString() inventoryItemId?: string;
  @IsOptional() @IsString() inventoryLotId?: string;
  @IsOptional() @IsString() lotId?: string;
  @IsOptional() @IsString() lotNumber?: string;
  @IsOptional() @IsString() sourceWarehouseId?: string;
  @IsOptional() @IsString() destinationWarehouseId?: string;
  @IsOptional() @IsString() sourceLocationId?: string;
  @IsOptional() @IsString() destinationLocationId?: string;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsString() reasonCode?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) serialNumbers?: string[];
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

export class ManufacturingOrderActionDto {
  @IsIn(ACTION_KINDS) kind!: (typeof ACTION_KINDS)[number];
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManufacturingOrderActionLineDto)
  lines?: ManufacturingOrderActionLineDto[];
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() signatureMeaning?: string | null;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
}

export class CreateManufacturingWorkflowReviewDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsIn(WORKFLOW_GROUPS) group!: (typeof WORKFLOW_GROUPS)[number];
  @IsString() @IsNotEmpty() workflowKey!: string;
  @IsOptional() @IsString() entityType?: string | null;
  @IsOptional() @IsString() entityId?: string | null;
  @IsIn(["ZERO_REVIEW", "NOT_APPLICABLE"])
  outcome!: "ZERO_REVIEW" | "NOT_APPLICABLE";
  @IsOptional()
  @IsIn(["PENDING"])
  status?: "PENDING";
  @IsOptional() @IsString() reason?: string | null;
  @IsOptional() @IsString() note?: string | null;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

export class TransitionManufacturingWorkflowReviewDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsIn(["REVIEW", "APPROVE", "REJECT"])
  action!: "REVIEW" | "APPROVE" | "REJECT";
  @IsOptional() @IsString() reason?: string | null;
  @IsOptional() @IsString() signatureMeaning?: string | null;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
  @IsDateString() transactionDate!: string;
}
