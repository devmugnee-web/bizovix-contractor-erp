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

const RESOURCE_KINDS = [
  "WORK_CENTER",
  "PRODUCTION_LINE",
  "ROOM",
  "EQUIPMENT",
] as const;
const READINESS_STATES = [
  "READY",
  "DUE_SOON",
  "BLOCKED",
  "NOT_REQUIRED",
] as const;
const CLEANING_STATES = ["CLEAN", "DUE", "BLOCKED", "NOT_REQUIRED"] as const;
const CALENDAR_STATES = ["AVAILABLE", "NON_WORKING", "BLOCKED"] as const;
const DOCUMENT_KINDS = [
  "DEMAND_PLAN",
  "MASTER_PRODUCTION_SCHEDULE",
  "CAMPAIGN",
  "PRODUCTION_PLAN",
  "PRODUCTION_ORDER",
  "MATERIAL_REQUISITION",
  "MATERIAL_ISSUE",
  "MATERIAL_RETURN",
  "QC_INSPECTION",
  "PACKAGING_ORDER",
  "FINISHED_GOODS_RECEIPT",
  "QA_RELEASE",
  "CAPACITY_CHECK",
] as const;
const QUALITY_RESULT_TYPES = ["NUMERIC", "TEXT", "BOOLEAN"] as const;
const PACKAGING_COMPONENT_TYPES = [
  "PRIMARY",
  "SECONDARY",
  "TERTIARY",
  "LABEL",
  "INSERT",
] as const;
const REASON_PROCESSES = [
  "MATERIAL_ISSUE",
  "MATERIAL_RETURN",
  "SCRAP",
  "DEVIATION",
  "HOLD",
  "REWORK",
  "REJECTION",
  "CANCELLATION",
  "CLOSE",
] as const;

export class ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
}

export class CreateManufacturingResourceDto extends ManufacturingWorkspaceDto {
  @IsIn(RESOURCE_KINDS) kind!: (typeof RESOURCE_KINDS)[number];
  @IsString() @IsNotEmpty() @MaxLength(80) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @IsString() parentResourceId?: string | null;
  @IsOptional() @IsString() warehouseId?: string | null;
  @IsOptional() @IsString() locationId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(1440) capacityMinutesPerDay?: number;
  @IsOptional()
  @IsIn(READINESS_STATES)
  qualificationState?: (typeof READINESS_STATES)[number];
  @IsOptional() @IsDateString() qualificationValidUntil?: string | null;
  @IsOptional()
  @IsIn(READINESS_STATES)
  calibrationState?: (typeof READINESS_STATES)[number];
  @IsOptional() @IsDateString() calibrationDueAt?: string | null;
  @IsOptional()
  @IsIn(READINESS_STATES)
  maintenanceState?: (typeof READINESS_STATES)[number];
  @IsOptional() @IsDateString() maintenanceDueAt?: string | null;
  @IsOptional()
  @IsIn(CLEANING_STATES)
  cleaningState?: (typeof CLEANING_STATES)[number];
  @IsOptional() @IsDateString() lastCleanedAt?: string | null;
  @IsOptional() @IsString() @MaxLength(240) readinessEvidenceReference?:
    string | null;
  @IsOptional() @IsString() @MaxLength(1000) readinessNote?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateManufacturingResourceDto extends ManufacturingWorkspaceDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @IsString() parentResourceId?: string | null;
  @IsOptional() @IsString() warehouseId?: string | null;
  @IsOptional() @IsString() locationId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(1440) capacityMinutesPerDay?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateManufacturingResourceReadinessDto extends ManufacturingWorkspaceDto {
  @IsIn(READINESS_STATES)
  qualificationState!: (typeof READINESS_STATES)[number];
  @IsOptional() @IsDateString() qualificationValidUntil?: string | null;
  @IsIn(READINESS_STATES) calibrationState!: (typeof READINESS_STATES)[number];
  @IsOptional() @IsDateString() calibrationDueAt?: string | null;
  @IsIn(READINESS_STATES) maintenanceState!: (typeof READINESS_STATES)[number];
  @IsOptional() @IsDateString() maintenanceDueAt?: string | null;
  @IsIn(CLEANING_STATES) cleaningState!: (typeof CLEANING_STATES)[number];
  @IsOptional() @IsDateString() lastCleanedAt?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(240) evidenceReference!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
}

export class CreateManufacturingShiftDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() @MaxLength(80) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsInt() @Min(0) @Max(1439) startMinute!: number;
  @IsInt() @Min(1) @Max(1440) endMinute!: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) breakMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateManufacturingCalendarSlotDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() resourceId!: string;
  @IsString() @IsNotEmpty() shiftId!: string;
  @IsDateString() workDate!: string;
  @IsInt() @Min(0) @Max(1440) availableMinutes!: number;
  @IsOptional()
  @IsIn(CALENDAR_STATES)
  status?: (typeof CALENDAR_STATES)[number];
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class AssignOperationResourceDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() resourceId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) requiredUnits?: number;
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  @Max(1000)
  capacityMultiplier?: number;
  @IsOptional() @IsBoolean() isMandatory?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class ControlRecordLineDto {
  @IsInt() @Min(1) sequence!: number;
  @IsString() @IsNotEmpty() inventoryItemId!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsString() @IsNotEmpty() unit!: string;
  @IsOptional() @IsDateString() requiredDate?: string | null;
}

export class CreateDemandPlanDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsDateString() demandFrom!: string;
  @IsDateString() demandTo!: string;
  @IsOptional() @IsString() customerReference?: string | null;
  @IsOptional() @IsString() forecastReference?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ControlRecordLineDto)
  lines!: ControlRecordLineDto[];
}

export class ScheduleLineDto extends ControlRecordLineDto {
  @IsDateString() plannedStartDate!: string;
  @IsDateString() plannedEndDate!: string;
}

export class CreateMasterProductionScheduleDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() demandPlanId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleLineDto)
  lines!: ScheduleLineDto[];
}

export class CreateManufacturingCampaignDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() masterProductionScheduleId!: string;
  @IsString() @IsNotEmpty() finishedProductId!: string;
  @IsNumber() @Min(0.0001) plannedQuantity!: number;
  @IsString() @IsNotEmpty() unit!: string;
  @IsDateString() plannedStartDate!: string;
  @IsDateString() plannedEndDate!: string;
  @IsOptional() @IsString() manufacturingPlanId?: string | null;
  @IsOptional() @IsString() campaignStrategy?: string | null;
}

export class CreateTestMethodDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() procedureReference!: string;
  @IsOptional() @IsString() instrumentRequirement?: string | null;
  @IsOptional() @IsString() samplingInstruction?: string | null;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
}

export class QualityParameterDto {
  @IsInt() @Min(1) sequence!: number;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() testMethodRecordId!: string;
  @IsIn(QUALITY_RESULT_TYPES)
  resultType!: (typeof QUALITY_RESULT_TYPES)[number];
  @IsOptional() @IsString() unit?: string | null;
  @IsOptional() @IsNumber() lowerLimit?: number | null;
  @IsOptional() @IsNumber() upperLimit?: number | null;
  @IsOptional() @IsString() expectedText?: string | null;
  @IsOptional() @IsBoolean() expectedBoolean?: boolean | null;
  @IsOptional() @IsBoolean() critical?: boolean;
}

export class CreateQualitySpecificationDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() inventoryItemId!: string;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QualityParameterDto)
  parameters!: QualityParameterDto[];
}

export class PackagingComponentDto {
  @IsInt() @Min(1) sequence!: number;
  @IsString() @IsNotEmpty() inventoryItemId!: string;
  @IsIn(PACKAGING_COMPONENT_TYPES)
  componentType!: (typeof PACKAGING_COMPONENT_TYPES)[number];
  @IsNumber() @Min(0.0001) quantityPerFinishedUnit!: number;
  @IsString() @IsNotEmpty() unit!: string;
}

export class CreatePackagingConfigurationDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() finishedProductId!: string;
  @IsOptional() @IsString() artworkSpecificationId?: string | null;
  @IsNumber() @Min(0.0001) packSize!: number;
  @IsString() @IsNotEmpty() packUnit!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PackagingComponentDto)
  components!: PackagingComponentDto[];
}

export class CreateArtworkSpecificationDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() finishedProductId!: string;
  @IsString() @IsNotEmpty() assetReference!: string;
  @IsString() @IsNotEmpty() approvalReference!: string;
  @IsOptional() @IsString() market?: string | null;
  @IsOptional() @IsString() language?: string | null;
  @IsOptional() @IsString() labelCopyReference?: string | null;
}

export class CreateManufacturingReasonCodeDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(REASON_PROCESSES, { each: true })
  processes!: (typeof REASON_PROCESSES)[number][];
  @IsOptional() @IsBoolean() evidenceRequired?: boolean;
  @IsOptional() @IsBoolean() approvalRequired?: boolean;
  @IsOptional() @IsString() description?: string | null;
}

export class ApproveManufacturingControlRecordDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() signatureMeaning!: string;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
  @IsOptional() @IsString() note?: string | null;
}

export class ConfigureManufacturingDocumentSequenceDto extends ManufacturingWorkspaceDto {
  @IsIn(DOCUMENT_KINDS) documentKind!: (typeof DOCUMENT_KINDS)[number];
  @IsString() @IsNotEmpty() @MaxLength(40) prefix!: string;
  @IsOptional() @IsInt() @Min(1) nextNumber?: number;
  @IsOptional() @IsInt() @Min(3) @Max(12) padding?: number;
  @IsOptional() @IsBoolean() resetAnnually?: boolean;
  @IsOptional() @IsIn(["NEVER", "ANNUAL", "MONTHLY"]) resetPeriod?:
    "NEVER" | "ANNUAL" | "MONTHLY";
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class IssueManufacturingDocumentNumberDto extends ManufacturingWorkspaceDto {
  @IsIn(DOCUMENT_KINDS) documentKind!: (typeof DOCUMENT_KINDS)[number];
  @IsDateString() issuedAt!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() entityType?: string | null;
  @IsOptional() @IsString() entityId?: string | null;
}

export class RunManufacturingCapacityCheckDto extends ManufacturingWorkspaceDto {
  @IsString() @IsNotEmpty() planId!: string;
  @IsDateString() asOfDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() note?: string | null;
}

export class EnsureManufacturingPeriodDto extends ManufacturingWorkspaceDto {
  @IsInt() @Min(2000) @Max(2200) periodYear!: number;
  @IsInt() @Min(1) @Max(12) periodMonth!: number;
}

export class ValidateManufacturingPeriodDto extends EnsureManufacturingPeriodDto {
  @IsOptional() @IsString() validationReference?: string | null;
}

export class LockManufacturingPeriodDto extends EnsureManufacturingPeriodDto {
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() signatureMeaning!: string;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
  @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @IsString() validationReference?: string | null;
}

export class ArchiveManufacturingPeriodDto extends EnsureManufacturingPeriodDto {
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() signatureMeaning!: string;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
  @IsString() @IsNotEmpty() reason!: string;
}

/** Reserved for future metadata without accepting arbitrary control-record payloads. */
export class ManufacturingEvidenceDto {
  @IsString() @IsNotEmpty() reference!: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
