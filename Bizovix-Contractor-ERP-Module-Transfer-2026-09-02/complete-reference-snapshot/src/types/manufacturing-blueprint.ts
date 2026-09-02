import type { ManufacturingJsonObject } from "@/types/manufacturing";

export type ManufacturingResourceKind =
  "WORK_CENTER" | "PRODUCTION_LINE" | "ROOM" | "EQUIPMENT";

export type ManufacturingReadinessState =
  "READY" | "DUE_SOON" | "BLOCKED" | "NOT_REQUIRED";

export type ManufacturingCleaningState =
  "CLEAN" | "DUE" | "BLOCKED" | "NOT_REQUIRED";

export type ManufacturingCalendarStatus =
  "AVAILABLE" | "NON_WORKING" | "BLOCKED";

export type ManufacturingControlRecordKind =
  | "DEMAND_PLAN"
  | "MASTER_PRODUCTION_SCHEDULE"
  | "CAMPAIGN"
  | "QUALITY_SPECIFICATION"
  | "TEST_METHOD"
  | "PACKAGING_CONFIGURATION"
  | "ARTWORK_SPECIFICATION"
  | "REASON_CODE";

export type ManufacturingControlRecordStatus =
  "DRAFT" | "APPROVED" | "RETIRED" | "CANCELLED";

export type ManufacturingDocumentKind =
  | "BOM"
  | "DEMAND_PLAN"
  | "MASTER_PRODUCTION_SCHEDULE"
  | "CAMPAIGN"
  | "PRODUCTION_PLAN"
  | "PRODUCTION_ORDER"
  | "MATERIAL_REQUISITION"
  | "MATERIAL_ISSUE"
  | "MATERIAL_RETURN"
  | "QC_INSPECTION"
  | "PACKAGING_ORDER"
  | "FINISHED_GOODS_RECEIPT"
  | "QA_RELEASE"
  | "CAPACITY_CHECK";

export interface ManufacturingResourceRecord {
  id: string;
  workspaceId: string;
  kind: ManufacturingResourceKind;
  code: string;
  name: string;
  parentResourceId: string | null;
  warehouseId: string | null;
  locationId: string | null;
  capacityMinutesPerDay: number;
  qualificationState: ManufacturingReadinessState;
  qualificationValidUntil: string | null;
  calibrationState: ManufacturingReadinessState;
  calibrationDueAt: string | null;
  maintenanceState: ManufacturingReadinessState;
  maintenanceDueAt: string | null;
  cleaningState: ManufacturingCleaningState;
  lastCleanedAt: string | null;
  readinessEvidenceReference: string | null;
  readinessNote: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parentResource?: { id: string; code: string; name: string } | null;
}

export interface CreateManufacturingResourceInput {
  workspaceId: string;
  kind: ManufacturingResourceKind;
  code: string;
  name: string;
  parentResourceId?: string | null;
  warehouseId?: string | null;
  locationId?: string | null;
  capacityMinutesPerDay?: number;
  qualificationState?: ManufacturingReadinessState;
  qualificationValidUntil?: string | null;
  calibrationState?: ManufacturingReadinessState;
  calibrationDueAt?: string | null;
  maintenanceState?: ManufacturingReadinessState;
  maintenanceDueAt?: string | null;
  cleaningState?: ManufacturingCleaningState;
  lastCleanedAt?: string | null;
  readinessEvidenceReference?: string | null;
  readinessNote?: string | null;
  isActive?: boolean;
}

export interface UpdateManufacturingResourceReadinessInput {
  workspaceId: string;
  qualificationState: ManufacturingReadinessState;
  qualificationValidUntil?: string | null;
  calibrationState: ManufacturingReadinessState;
  calibrationDueAt?: string | null;
  maintenanceState: ManufacturingReadinessState;
  maintenanceDueAt?: string | null;
  cleaningState: ManufacturingCleaningState;
  lastCleanedAt?: string | null;
  evidenceReference: string;
  note?: string | null;
  idempotencyKey: string;
  transactionDate: string;
}

export interface ManufacturingShiftRecord {
  id: string;
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  isActive: boolean;
}

export interface CreateManufacturingShiftInput {
  workspaceId: string;
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  breakMinutes?: number;
  isActive?: boolean;
}

export interface ManufacturingCalendarSlotRecord {
  id: string;
  resourceId: string;
  shiftId: string;
  workDate: string;
  availableMinutes: number;
  status: ManufacturingCalendarStatus;
  note: string | null;
  resource: {
    id: string;
    code: string;
    name: string;
    kind: ManufacturingResourceKind;
  };
  shift: { id: string; code: string; name: string };
}

export interface CreateManufacturingCalendarSlotInput {
  workspaceId: string;
  resourceId: string;
  shiftId: string;
  workDate: string;
  availableMinutes: number;
  status?: ManufacturingCalendarStatus;
  note?: string | null;
}

export interface AssignManufacturingOperationResourceInput {
  workspaceId: string;
  resourceId: string;
  requiredUnits?: number;
  capacityMultiplier?: number;
  isMandatory?: boolean;
  note?: string | null;
}

export interface ManufacturingControlRecordLine {
  id: string;
  inventoryItemId: string;
  sequence: number;
  quantity: number;
  unit: string;
  requiredDate: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  metadata: ManufacturingJsonObject | null;
  inventoryItem?: { itemCode: string; itemName: string };
}

export interface ManufacturingControlRecord {
  id: string;
  kind: ManufacturingControlRecordKind;
  code: string;
  name: string;
  versionNumber: number;
  status: ManufacturingControlRecordStatus;
  sourceRecordId: string | null;
  planId: string | null;
  inventoryItemId: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  payload: ManufacturingJsonObject;
  lines: ManufacturingControlRecordLine[];
  createdAt: string;
  approvedAt: string | null;
}

export interface ManufacturingControlLineInput {
  sequence: number;
  inventoryItemId: string;
  quantity: number;
  unit: string;
  requiredDate?: string | null;
}

export interface CreateDemandPlanInput {
  workspaceId: string;
  code: string;
  name: string;
  demandFrom: string;
  demandTo: string;
  customerReference?: string | null;
  forecastReference?: string | null;
  lines: ManufacturingControlLineInput[];
}

export interface CreateMasterProductionScheduleInput {
  workspaceId: string;
  code: string;
  name: string;
  demandPlanId: string;
  lines: Array<
    ManufacturingControlLineInput & {
      plannedStartDate: string;
      plannedEndDate: string;
    }
  >;
}

export interface CreateManufacturingCampaignInput {
  workspaceId: string;
  code: string;
  name: string;
  masterProductionScheduleId: string;
  finishedProductId: string;
  plannedQuantity: number;
  unit: string;
  plannedStartDate: string;
  plannedEndDate: string;
  manufacturingPlanId?: string | null;
  campaignStrategy?: string | null;
}

export interface CreateTestMethodInput {
  workspaceId: string;
  code: string;
  name: string;
  procedureReference: string;
  instrumentRequirement?: string | null;
  samplingInstruction?: string | null;
  effectiveFrom?: string | null;
}

export interface QualityParameterInput {
  sequence: number;
  name: string;
  testMethodRecordId: string;
  resultType: "NUMERIC" | "TEXT" | "BOOLEAN";
  unit?: string | null;
  lowerLimit?: number | null;
  upperLimit?: number | null;
  expectedText?: string | null;
  expectedBoolean?: boolean | null;
  critical?: boolean;
}

export interface CreateQualitySpecificationInput {
  workspaceId: string;
  code: string;
  name: string;
  inventoryItemId: string;
  effectiveFrom?: string | null;
  parameters: QualityParameterInput[];
}

export interface PackagingComponentInput {
  sequence: number;
  inventoryItemId: string;
  componentType: "PRIMARY" | "SECONDARY" | "TERTIARY" | "LABEL" | "INSERT";
  quantityPerFinishedUnit: number;
  unit: string;
}

export interface CreatePackagingConfigurationInput {
  workspaceId: string;
  code: string;
  name: string;
  finishedProductId: string;
  artworkSpecificationId?: string | null;
  packSize: number;
  packUnit: string;
  components: PackagingComponentInput[];
}

export interface CreateArtworkSpecificationInput {
  workspaceId: string;
  code: string;
  name: string;
  finishedProductId: string;
  assetReference: string;
  approvalReference: string;
  market?: string | null;
  language?: string | null;
  labelCopyReference?: string | null;
}

export interface CreateManufacturingReasonCodeInput {
  workspaceId: string;
  code: string;
  name: string;
  processes: Array<
    | "MATERIAL_ISSUE"
    | "MATERIAL_RETURN"
    | "SCRAP"
    | "DEVIATION"
    | "HOLD"
    | "REWORK"
    | "REJECTION"
    | "CANCELLATION"
    | "CLOSE"
  >;
  evidenceRequired?: boolean;
  approvalRequired?: boolean;
  description?: string | null;
}

export interface ApproveManufacturingControlRecordInput {
  workspaceId: string;
  idempotencyKey: string;
  transactionDate: string;
  signatureMeaning: string;
  reauthenticationPassword?: string | null;
  note?: string | null;
}

export interface ManufacturingDocumentSequenceRecord {
  id: string;
  documentKind: ManufacturingDocumentKind;
  prefix: string;
  nextNumber: number;
  padding: number;
  resetAnnually: boolean;
  lastIssuedYear: number | null;
  resetPeriod: "NEVER" | "ANNUAL" | "MONTHLY";
  lastIssuedPeriod: string | null;
  isActive: boolean;
}

export interface ConfigureManufacturingDocumentSequenceInput {
  workspaceId: string;
  documentKind: ManufacturingDocumentKind;
  prefix: string;
  nextNumber?: number;
  padding?: number;
  resetAnnually?: boolean;
  resetPeriod?: "NEVER" | "ANNUAL" | "MONTHLY";
  isActive?: boolean;
}

export interface ManufacturingCapacityCheckRecord {
  id: string;
  planId: string;
  checkNumber: string;
  status: "READY" | "BLOCKED";
  asOfDate: string;
  requiredMinutes: number;
  availableMinutes: number;
  result: ManufacturingJsonObject;
  blockers: ManufacturingJsonObject | ManufacturingJsonObject[];
  createdAt: string;
}

export interface RunManufacturingCapacityCheckInput {
  workspaceId: string;
  planId: string;
  asOfDate: string;
  idempotencyKey: string;
  note?: string | null;
}

export interface ManufacturingPeriodRecord {
  id: string;
  periodYear: number;
  periodMonth: number;
  periodStart: string;
  periodEnd: string;
  status: "OPEN" | "LOCKED" | "ARCHIVED";
  lastValidation: ManufacturingJsonObject | null;
  lastValidatedAt: string | null;
  lockedAt: string | null;
  lockReason: string | null;
  archivedAt: string | null;
  archiveReason: string | null;
}

export interface ManufacturingPeriodKeyInput {
  workspaceId: string;
  periodYear: number;
  periodMonth: number;
}

export interface ManufacturingPeriodValidation {
  period: { year: number; month: number; start: string; end: string };
  validatedAt: string;
  lockable: boolean;
  blockerCount: number;
  counts: Record<string, number>;
  references: ManufacturingJsonObject;
  validationReference: string | null;
  evidencePack?: {
    ready: boolean;
    eligible: Array<{
      id: string;
      code: string;
      evidenceReference: string;
      periodFrom: string;
      periodTo: string;
      attachmentCount: number;
    }>;
    blockers: string[];
  };
}
