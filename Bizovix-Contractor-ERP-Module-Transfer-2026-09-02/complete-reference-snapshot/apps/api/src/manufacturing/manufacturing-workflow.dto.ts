import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const MANUFACTURING_MODES = ["GENERAL", "PHARMACEUTICAL", "HYBRID"] as const;
const RUN_STATUSES = [
  "DRAFT",
  "PLANNED",
  "PENDING_APPROVAL",
  "APPROVED",
  "MATERIAL_QC_PENDING",
  "MATERIAL_READY",
  "RESERVED",
  "STAGED",
  "ISSUED",
  "IN_PRODUCTION",
  "PRODUCTION_COMPLETE",
  "QC_PENDING",
  "QC_PASSED",
  "PACKAGING",
  "PACKAGING_RECONCILED",
  "FG_Q",
  "RELEASE_READY",
  "FG_R",
  "COST_FINALIZED",
  "CLOSED",
  "PERIOD_LOCKED",
  "CANCELLED",
  "ON_HOLD",
] as const;
const STEP_TRANSITION_ACTIONS = [
  "TRIGGER",
  "START",
  "SAVE_DRAFT",
  "SUBMIT",
  "APPROVE",
  "BEGIN_POSTING",
  "CONFIRM_POSTED",
  "COMPLETE",
  "MARK_N_A",
  "HOLD",
  "RESUME",
  "REJECT",
  "FAIL",
] as const;

export class ListManufacturingRunsQueryDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsOptional() @IsIn(RUN_STATUSES) status?: (typeof RUN_STATUSES)[number];
  @IsOptional() @IsString() productionOrderId?: string;
  @IsOptional() @IsString() productId?: string;
}

export class StartManufacturingRunDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(191) idempotencyKey!: string;
  @IsOptional()
  @IsIn(MANUFACTURING_MODES)
  manufacturingMode?: (typeof MANUFACTURING_MODES)[number];
  @IsOptional() @IsString() @IsNotEmpty() productionPlanId?: string | null;
  @IsOptional() @IsString() @IsNotEmpty() productionOrderId?: string | null;
  @IsOptional() @IsString() @IsNotEmpty() productId?: string | null;
  @IsOptional() @IsDateString() startedAt?: string;
}

export class DiscardEmptyManufacturingRunDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) expectedVersion?: number;
}

export class UpdateManufacturingWorkflowConfigurationDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() workflowDefinitionVersion!: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(159)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(159, { each: true })
  hiddenStepSerials!: number[];
  @IsInt() @Min(0) expectedRevision!: number;
}

export class CreateManufacturingRunStepOccurrenceDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(191) occurrenceKey!: string;
}

export class TransitionManufacturingRunStepDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(191) idempotencyKey!: string;
  @IsIn(STEP_TRANSITION_ACTIONS)
  action!: (typeof STEP_TRANSITION_ACTIONS)[number];
  @IsOptional() @IsString() @MaxLength(2000) reason?: string | null;
  @IsOptional() @IsString() @MaxLength(100) reasonCode?: string | null;
  @IsOptional() @IsString() @MaxLength(100) sourceRecordType?: string | null;
  @IsOptional() @IsString() @MaxLength(191) sourceRecordId?: string | null;
  @IsOptional() @IsString() @MaxLength(191) signatureMeaning?: string | null;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) expectedVersion?: number;
}
