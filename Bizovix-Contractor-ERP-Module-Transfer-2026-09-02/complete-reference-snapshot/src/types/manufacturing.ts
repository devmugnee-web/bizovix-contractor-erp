export type ManufacturingMode = "GENERAL" | "PHARMACEUTICAL" | "HYBRID";

export type ManufacturingItemRole =
  | "RAW_MATERIAL"
  | "PACKAGING_MATERIAL"
  | "INTERMEDIATE"
  | "BULK"
  | "FINISHED_GOOD"
  | "BY_PRODUCT"
  | "CONSUMABLE";

export type ManufacturingMakeBuy = "MAKE" | "BUY" | "BOTH";
export type ManufacturingVersionStatus = "DRAFT" | "APPROVED" | "RETIRED";
export type ManufacturingPlanStatus =
  | "DRAFT"
  | "APPROVED"
  | "RELEASED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "CLOSED";
export type ManufacturingLotStatus =
  | "PLANNED"
  | "RELEASED"
  | "IN_PRODUCTION"
  | "QC_HOLD"
  | "COMPLETED"
  | "CANCELLED"
  | "CLOSED";
export type ManufacturingMrpRunStatus =
  "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "SUPERSEDED";
export type ManufacturingOrderType =
  | "ASSEMBLY"
  | "PHARMACEUTICAL"
  | "PACKAGING"
  | "REWORK"
  | "REPROCESSING"
  | "SUBCONTRACT";
export type ManufacturingOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "RESERVED"
  | "ISSUED"
  | "IN_PRODUCTION"
  | "QC_HOLD"
  | "QA_RELEASED"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED";
export type ManufacturingMaterialStatus =
  | "PLANNED"
  | "PARTIALLY_RESERVED"
  | "RESERVED"
  | "PARTIALLY_ISSUED"
  | "ISSUED"
  | "PARTIALLY_RETURNED"
  | "RETURNED"
  | "CONSUMED"
  | "CANCELLED";
export type ManufacturingReservationStatus =
  | "ACTIVE"
  | "PARTIALLY_ISSUED"
  | "ISSUED"
  | "RELEASED"
  | "EXPIRED"
  | "CANCELLED";
export type ManufacturingTransactionType =
  | "MATERIAL_REQUISITION"
  | "MATERIAL_ISSUE"
  | "MATERIAL_RETURN"
  | "PACKAGING_ISSUE"
  | "PACKAGING_RETURN"
  | "PRODUCTION_RECEIPT"
  | "SCRAP_RECEIPT"
  | "REWORK_RECEIPT"
  | "QA_RELEASE"
  | "LOCATION_TRANSFER";
export type ManufacturingTransactionStatus =
  "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "CANCELLED" | "REVERSED";
export type ManufacturingOperationStatus =
  | "PENDING"
  | "READY"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED";
export type ManufacturingQualityInspectionType =
  "IN_PROCESS" | "FINISHED_GOOD" | "PACKAGING" | "RELEASE";
export type ManufacturingQualityStatus =
  "PENDING" | "IN_PROGRESS" | "PASSED" | "FAILED" | "HOLD" | "WAIVED";
export type ManufacturingSerialStatus =
  "CREATED" | "QC_HOLD" | "RELEASED" | "REWORK" | "SCRAPPED" | "CONSUMED";
export type ManufacturingCostStatus =
  "DRAFT" | "PROVISIONAL" | "FINALIZED" | "VOIDED";
export type ManufacturingCostType =
  | "MATERIAL"
  | "LABOUR"
  | "MACHINE"
  | "OVERHEAD"
  | "PACKAGING"
  | "SUBCONTRACT"
  | "OTHER"
  | "SCRAP_RECOVERY"
  | "VARIANCE";
export type ManufacturingWorkflowOutcome =
  "EXECUTED" | "ZERO_REVIEW" | "NOT_APPLICABLE";
export type ManufacturingWorkflowReviewStatus =
  "PENDING" | "REVIEWED" | "APPROVED" | "REJECTED";

export type ManufacturingWorkflowGroup =
  | "DASHBOARD_CONTROL_CENTER"
  | "MASTERS_FORMULA"
  | "PLANNING_MRP"
  | "PRODUCTION_BATCH_ORDERS"
  | "MATERIALS_DISPENSING"
  | "PRODUCTION_EXECUTION"
  | "QUALITY_COMPLIANCE"
  | "PACKAGING_RELEASE"
  | "COSTING_ACCOUNTS"
  | "REPORTS_ANALYTICS"
  | "SETUP_WORKFLOW_AUDIT";

export type ManufacturingOrderActionKind =
  | "SUBMIT"
  | "APPROVE"
  | "AMEND"
  | "CANCEL"
  | "RESERVE_MATERIALS"
  | "RELEASE_RESERVATION"
  | "ISSUE_MATERIALS"
  | "RETURN_MATERIALS"
  | "PACKAGING_ISSUE"
  | "PACKAGING_RETURN"
  | "START_PRODUCTION"
  | "START_OPERATION"
  | "PAUSE_PRODUCTION"
  | "RESUME_PRODUCTION"
  | "COMPLETE_OPERATION"
  | "POST_SCRAP_DISPOSITION"
  | "CREATE_REWORK_DISPOSITION"
  | "COMPLETE_PRODUCTION"
  | "PLACE_QC_HOLD"
  | "RECORD_IN_PROCESS_RESULT"
  | "RECORD_QUALITY_RESULT"
  | "QA_RELEASE"
  | "POST_PRODUCTION_RECEIPT"
  | "CLOSE";

export type ManufacturingJsonValue =
  | string
  | number
  | boolean
  | null
  | ManufacturingJsonValue[]
  | { [key: string]: ManufacturingJsonValue };
export type ManufacturingJsonObject = { [key: string]: ManufacturingJsonValue };

export interface ManufacturingSettingsRecord {
  id: string;
  workspaceId: string;
  mode: ManufacturingMode;
  rawMaterialWarehouseId: string | null;
  wipWarehouseId: string | null;
  finishedGoodsQualityWarehouseId: string | null;
  finishedGoodsReleasedWarehouseId: string | null;
  rejectedWarehouseId: string | null;
  scrapWarehouseId: string | null;
  rawMaterialInventoryAccountId: string | null;
  packagingInventoryAccountId: string | null;
  wipInventoryAccountId: string | null;
  finishedGoodsInventoryAccountId: string | null;
  manufacturingVarianceAccountId: string | null;
  labourClearingAccountId: string | null;
  overheadAbsorptionAccountId: string | null;
  scrapRecoveryAccountId: string | null;
  reservationRequired: boolean;
  issueBeforeProduction: boolean;
  negativeStockAllowed: boolean;
  serialTrackingRequired: boolean;
  qualityReleaseRequired: boolean;
  partialProductionAllowed: boolean;
  electronicSignatureRequired: boolean;
  approvalRequired: boolean;
  settings: ManufacturingJsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateManufacturingSettingsInput {
  workspaceId: string;
  mode: ManufacturingMode;
  rawMaterialWarehouseId?: string | null;
  wipWarehouseId?: string | null;
  finishedGoodsQualityWarehouseId?: string | null;
  finishedGoodsReleasedWarehouseId?: string | null;
  rejectedWarehouseId?: string | null;
  scrapWarehouseId?: string | null;
  rawMaterialInventoryAccountId?: string | null;
  packagingInventoryAccountId?: string | null;
  wipInventoryAccountId?: string | null;
  finishedGoodsInventoryAccountId?: string | null;
  manufacturingVarianceAccountId?: string | null;
  labourClearingAccountId?: string | null;
  overheadAbsorptionAccountId?: string | null;
  scrapRecoveryAccountId?: string | null;
  reservationRequired: boolean;
  issueBeforeProduction: boolean;
  negativeStockAllowed: boolean;
  serialTrackingRequired: boolean;
  qualityReleaseRequired: boolean;
  partialProductionAllowed: boolean;
  electronicSignatureRequired: boolean;
  approvalRequired: boolean;
  settings?: ManufacturingJsonObject;
}

export type ManufacturingReadinessState =
  "READY" | "WARNING" | "BLOCKED" | "NOT_APPLICABLE";

export interface ManufacturingReadinessCheck {
  code: string;
  label: string;
  state: ManufacturingReadinessState;
  count: number | null;
  message: string | null;
  actionGroup: ManufacturingWorkflowGroup | null;
  actionView: string | null;
}

export interface ManufacturingReadiness {
  workspaceId: string;
  ready: boolean;
  evaluatedAt: string;
  checks: ManufacturingReadinessCheck[];
  blockerCount: number;
  warningCount: number;
}

export interface ManufacturingDashboardCount {
  status: ManufacturingOrderStatus;
  count: number;
}

export interface ManufacturingDashboardActivity {
  id: string;
  occurredAt: string;
  eventType: string;
  referenceId: string | null;
  referenceNumber: string | null;
  description: string;
  performedBy: string | null;
}

export interface ManufacturingDashboard {
  workspaceId: string;
  asOf: string;
  plannedOrders: number;
  readyToStart: number;
  materialShortage: number;
  inProduction: number;
  qualityHold: number;
  releasePending: number;
  completedToday: number;
  wipValue: string;
  activeOrders: number;
  orderPipeline: ManufacturingDashboardCount[];
  recentOrders: ManufacturingProductionOrderSummary[];
  recentActivity: ManufacturingDashboardActivity[];
}

export interface ManufacturingAvailabilityQuery {
  workspaceId: string;
  warehouseId?: string;
  inventoryItemId?: string;
  itemRole?: ManufacturingItemRole;
  search?: string;
  asOf?: string;
  includeZeroStock?: boolean;
}

export interface ManufacturingAvailabilityRow {
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  itemRole: ManufacturingItemRole;
  category: string | null;
  unit: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHandQuantity: number;
  reservedQuantity: number;
  qualityHoldQuantity: number;
  availableQuantity: number;
  unitCost: number;
  stockValue: number;
  lotNumber: string | null;
  expiryDate: string | null;
}

export interface ManufacturingAvailabilitySnapshot {
  workspaceId: string;
  asOf: string;
  totalItems: number;
  totalAvailableQuantity: number;
  totalStockValue: number;
  rows: ManufacturingAvailabilityRow[];
}

export interface ManufacturingBomComponentRecord {
  id: string;
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  itemRole: ManufacturingItemRole;
  unit: string;
  quantity: number;
  scrapPercentage: number;
  isOptional: boolean;
  substituteGroup: string | null;
  notes: string | null;
}

export interface ManufacturingBomVersionRecord {
  id: string;
  bomId: string;
  versionNumber: number;
  status: ManufacturingVersionStatus;
  outputQuantity: number;
  outputUnit: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  changeReason: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  components: ManufacturingBomComponentRecord[];
  createdAt: string;
  updatedAt: string;
  approvalProgress?: ManufacturingApprovalProgress;
}

export interface ManufacturingBomRecord {
  id: string;
  workspaceId: string;
  bomNumber: string;
  name: string;
  finishedProductId: string;
  finishedProductCode: string;
  finishedProductName: string;
  makeBuy: ManufacturingMakeBuy;
  isActive: boolean;
  approvedVersion: ManufacturingBomVersionRecord | null;
  versions: ManufacturingBomVersionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ManufacturingBomListQuery {
  workspaceId: string;
  search?: string;
  finishedProductId?: string;
  status?: ManufacturingVersionStatus;
  activeOnly?: boolean;
}

export interface CreateManufacturingBomInput {
  workspaceId: string;
  idempotencyKey: string;
  bomNumber?: string;
  name: string;
  finishedProductId: string;
  makeBuy?: ManufacturingMakeBuy;
  notes?: string;
}

export interface ManufacturingBomComponentInput {
  inventoryItemId: string;
  quantity: number;
  unit: string;
  scrapPercentage?: number;
  isOptional?: boolean;
  substituteGroup?: string | null;
  notes?: string | null;
}

export interface CreateManufacturingBomVersionInput {
  workspaceId: string;
  versionNumber?: number;
  outputQuantity: number;
  outputUnit: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  changeReason?: string | null;
  components: ManufacturingBomComponentInput[];
}

export interface ApproveManufacturingBomVersionInput {
  workspaceId: string;
  idempotencyKey: string;
  transactionDate: string;
  note?: string;
  signatureMeaning?: string | null;
  reauthenticationPassword?: string | null;
}

export type ManufacturingLocationDisposition =
  | "RELEASED"
  | "RESERVED"
  | "STAGING"
  | "WIP"
  | "QC_HOLD"
  | "REWORK"
  | "REJECTED"
  | "SCRAP";

export interface ManufacturingLocationReference {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
}

export interface ManufacturingItemProfileRecord {
  id: string;
  workspaceId: string;
  inventoryItemId: string;
  itemCode: string | null;
  itemName: string | null;
  unit: string | null;
  role: ManufacturingItemRole;
  makeBuy: ManufacturingMakeBuy;
  lotTracked: boolean;
  serialTracked: boolean;
  expiryTracked: boolean;
  qcRequired: boolean;
  shelfLifeDays: number | null;
  standardYieldPercent: number;
  defaultIssueLocation: ManufacturingLocationReference | null;
  defaultReceiptLocation: ManufacturingLocationReference | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManufacturingItemProfileListQuery {
  workspaceId: string;
  role?: ManufacturingItemRole;
  makeBuy?: ManufacturingMakeBuy;
  active?: boolean;
  search?: string;
}

export interface CreateManufacturingItemProfileInput {
  workspaceId: string;
  inventoryItemId: string;
  role: ManufacturingItemRole;
  makeBuy?: ManufacturingMakeBuy;
  lotTracked?: boolean;
  serialTracked?: boolean;
  expiryTracked?: boolean;
  qcRequired?: boolean;
  shelfLifeDays?: number | null;
  standardYieldPercent?: number;
  defaultIssueLocationId?: string | null;
  defaultReceiptLocationId?: string | null;
  isActive?: boolean;
}

export interface UpdateManufacturingItemProfileInput {
  workspaceId: string;
  role?: ManufacturingItemRole;
  makeBuy?: ManufacturingMakeBuy;
  lotTracked?: boolean;
  serialTracked?: boolean;
  expiryTracked?: boolean;
  qcRequired?: boolean;
  shelfLifeDays?: number | null;
  standardYieldPercent?: number;
  defaultIssueLocationId?: string | null;
  defaultReceiptLocationId?: string | null;
  isActive?: boolean;
}

export interface ManufacturingLocationRecord {
  id: string;
  workspaceId: string;
  warehouseId: string;
  warehouseCode: string | null;
  warehouseName: string | null;
  code: string;
  name: string;
  disposition: ManufacturingLocationDisposition;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManufacturingLocationListQuery {
  workspaceId: string;
  warehouseId?: string;
  disposition?: ManufacturingLocationDisposition;
  active?: boolean;
  search?: string;
}

export interface CreateManufacturingLocationInput {
  workspaceId: string;
  warehouseId: string;
  code: string;
  name: string;
  disposition: ManufacturingLocationDisposition;
  description?: string | null;
  isActive?: boolean;
}

export interface UpdateManufacturingLocationInput {
  workspaceId: string;
  code?: string;
  name?: string;
  disposition?: ManufacturingLocationDisposition;
  description?: string | null;
  isActive?: boolean;
}

export interface ManufacturingOperationResourceRequirementRecord {
  id: string;
  resourceId: string;
  requiredUnits: number;
  capacityMultiplier: number;
  isMandatory: boolean;
  note: string | null;
  resource: {
    id: string;
    code: string;
    name: string;
    kind: "WORK_CENTER" | "PRODUCTION_LINE" | "ROOM" | "EQUIPMENT";
    isActive: boolean;
    qualificationState: "READY" | "DUE_SOON" | "BLOCKED" | "NOT_REQUIRED";
    calibrationState: "READY" | "DUE_SOON" | "BLOCKED" | "NOT_REQUIRED";
    maintenanceState: "READY" | "DUE_SOON" | "BLOCKED" | "NOT_REQUIRED";
    cleaningState: "CLEAN" | "DUE" | "BLOCKED" | "NOT_REQUIRED";
  };
}

export interface ManufacturingRoutingOperationRecord {
  id: string;
  sequence: number;
  code: string;
  name: string;
  workCenterCode: string | null;
  productionLineCode: string | null;
  setupMinutes: number;
  runMinutesPerUnit: number;
  queueMinutes: number;
  isSubcontracted: boolean;
  qcRequired: boolean;
  instructions: string | null;
  responsibleUserId: string | null;
  resourceRequirements: ManufacturingOperationResourceRequirementRecord[];
}

export interface ManufacturingRoutingVersionRecord {
  id: string;
  routingId: string;
  versionNumber: number;
  status: ManufacturingVersionStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  changeReason: string | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  operations: ManufacturingRoutingOperationRecord[];
  createdAt: string;
  updatedAt: string;
  approvalProgress?: ManufacturingApprovalProgress;
}

export interface ManufacturingRoutingRecord {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  finishedProductId: string;
  finishedProduct: {
    id: string;
    itemCode: string;
    itemName: string;
    unit: string;
  } | null;
  description: string | null;
  isActive: boolean;
  versions: ManufacturingRoutingVersionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ManufacturingRoutingListQuery {
  workspaceId: string;
  finishedProductId?: string;
  active?: boolean | "all";
  search?: string;
}

export interface CreateManufacturingRoutingInput {
  workspaceId: string;
  code?: string;
  name: string;
  finishedProductId: string;
  description?: string | null;
}

export interface ManufacturingRoutingOperationInput {
  sequence: number;
  code: string;
  name: string;
  workCenterCode?: string | null;
  productionLineCode?: string | null;
  setupMinutes?: number;
  runMinutesPerUnit?: number;
  queueMinutes?: number;
  isSubcontracted?: boolean;
  qcRequired?: boolean;
  instructions?: string | null;
  responsibleUserId: string;
}

export interface ManufacturingRoutingAssigneeRecord {
  id: string;
  name: string;
  email: string;
}

export interface ManufacturingRunPreflight {
  ready: boolean;
  finishedProduct: {
    id: string;
    itemCode: string;
    itemName: string;
    unit: string;
  } | null;
  quantity: number;
  asOf: string;
  sourceWarehouseId: string | null;
  blockerCount: number;
  warningCount: number;
  checks: Array<{
    code: string;
    label: string;
    state: "READY" | "BLOCKED" | "WARNING";
    message: string;
    actionGroup: ManufacturingWorkflowGroup;
    actionView: string;
  }>;
}

export interface CreateManufacturingRoutingVersionInput {
  workspaceId: string;
  versionNumber?: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  changeReason?: string | null;
  operations: ManufacturingRoutingOperationInput[];
}

export interface ManufacturingPlanningApprovalInput {
  workspaceId: string;
  idempotencyKey: string;
  transactionDate: string;
  note?: string | null;
  signatureMeaning?: string | null;
  reauthenticationPassword?: string | null;
}

export interface ManufacturingApprovalProgress {
  totalStages: number;
  completedStages: number;
  nextStage: number | null;
  complete: boolean;
  workflowCode?: string | null;
  replayed?: boolean;
}

export interface ManufacturingPlanLotRecord {
  id: string;
  lotNumber: string;
  sequence: number;
  plannedQuantity: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  status: ManufacturingLotStatus;
  notes: string | null;
}

export interface ManufacturingPlanRecord {
  id: string;
  workspaceId: string;
  planNumber: string;
  finishedProductId: string;
  finishedProduct: {
    id: string;
    itemCode: string;
    itemName: string;
    unit: string;
  } | null;
  bomVersionId: string;
  bom: {
    id: string;
    code: string;
    name: string;
    versionNumber: number;
    status: ManufacturingVersionStatus;
  } | null;
  routingVersionId: string | null;
  routing: {
    id: string;
    code: string;
    name: string;
    versionNumber: number;
    status: ManufacturingVersionStatus;
  } | null;
  status: ManufacturingPlanStatus;
  plannedQuantity: number;
  unit: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  notes: string | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  lots: ManufacturingPlanLotRecord[];
  mrpRunCount: number;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
  approvalProgress?: ManufacturingApprovalProgress;
}

export interface ManufacturingPlanListQuery {
  workspaceId: string;
  status?: ManufacturingPlanStatus;
  finishedProductId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface ManufacturingPlanLotInput {
  lotNumber: string;
  sequence: number;
  plannedQuantity: number;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  notes?: string | null;
}

export interface CreateManufacturingPlanInput {
  workspaceId: string;
  idempotencyKey: string;
  planNumber?: string;
  finishedProductId: string;
  bomVersionId: string;
  routingVersionId?: string | null;
  plannedQuantity: number;
  unit: string;
  plannedStartDate: string;
  plannedEndDate: string;
  notes?: string | null;
  lots: ManufacturingPlanLotInput[];
}

export interface ManufacturingMrpRequirementRecord {
  id: string;
  inventoryItemId: string;
  itemCode: string | null;
  itemName: string | null;
  bomComponentId: string | null;
  warehouseId: string | null;
  locationId: string | null;
  requiredDate: string | null;
  unit: string;
  grossRequirement: number;
  onHandQuantity: number;
  activeReservationQty: number;
  scheduledReceiptQty: number;
  availableQuantity: number;
  netRequirement: number;
  shortageQuantity: number;
  snapshotUnitCost: number;
}

export interface ManufacturingMrpRunRecord {
  id: string;
  workspaceId: string;
  runNumber: string;
  planId: string;
  planNumber: string | null;
  finishedProduct: {
    id: string;
    itemCode: string;
    itemName: string;
  } | null;
  status: ManufacturingMrpRunStatus;
  asOfDate: string | null;
  horizonEndDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  warehouseId: string | null;
  maxProducibleQuantity: number | null;
  planQuantity: number | null;
  scenarioQuantity: number | null;
  isWhatIfScenario: boolean;
  canFulfillPlan: boolean | null;
  shortageItemCount: number | null;
  requirements: ManufacturingMrpRequirementRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ManufacturingMrpRunListQuery {
  workspaceId: string;
  planId?: string;
  status?: ManufacturingMrpRunStatus;
}

export interface CalculateManufacturingMrpInput {
  workspaceId: string;
  planId: string;
  scenarioQuantity?: number;
  warehouseId?: string | null;
  runNumber?: string;
  asOfDate: string;
  horizonEndDate?: string | null;
  idempotencyKey: string;
  note?: string | null;
}

export interface CalculateManufacturingMrpResult {
  run: ManufacturingMrpRunRecord;
  replayed: boolean;
}

export interface ManufacturingProductionOrderMaterialRecord {
  id: string;
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  itemRole: ManufacturingItemRole | null;
  unit: string;
  plannedQuantity: number;
  reservedQuantity: number;
  issuedQuantity: number;
  returnedQuantity: number;
  consumedQuantity: number;
  scrappedQuantity: number;
  availableQuantity: number;
  packagingLotRequirements: Record<string, number>;
  status: ManufacturingMaterialStatus;
  sourceWarehouseId: string | null;
  sourceWarehouseName: string | null;
}

export interface ManufacturingProductionLotRecord {
  id: string;
  lotNumber: string;
  plannedQuantity: number;
  completedQuantity: number;
  rejectedQuantity: number;
  status: ManufacturingLotStatus;
  actualStartDate: string | null;
  actualEndDate: string | null;
}

export interface ManufacturingReservationLineRecord {
  id: string;
  orderMaterialId: string;
  inventoryItemId: string;
  inventoryLotId: string | null;
  quantity: number;
  issuedQuantity: number;
  releasedQuantity: number;
  outstandingQuantity: number;
  unit: string;
}

export interface ManufacturingReservationRecord {
  id: string;
  reservationNumber: string;
  warehouseId: string;
  locationId: string | null;
  status: string;
  reservedAt: string | null;
  releasedAt: string | null;
  lines: ManufacturingReservationLineRecord[];
}

export interface ManufacturingInventoryLotSummary {
  id: string;
  lotNumber: string;
  warehouseId: string;
  availableQuantity: number;
  holdQuantity: number;
  unitCost: number;
}

export interface ManufacturingTransactionLineRecord {
  id: string;
  inventoryItemId: string;
  orderMaterialId: string | null;
  reservationLineId: string | null;
  sourceInventoryLotId: string | null;
  destinationInventoryLotId: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  stockMovements: Array<{
    id: string;
    warehouseId: string;
    movementType: string;
    quantity: number;
    unitCost: number;
    movementValue: number;
  }>;
  sourceInventoryLot: ManufacturingInventoryLotSummary | null;
  destinationInventoryLot: ManufacturingInventoryLotSummary | null;
  serialNumbers: string[];
}

export interface ManufacturingTransactionRecord {
  id: string;
  transactionNumber: string;
  transactionType: string;
  status: string;
  transactionDate: string;
  orderLotId: string | null;
  operationExecutionId: string | null;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  voucherEntryId: string | null;
  lines: ManufacturingTransactionLineRecord[];
  journal: { id: string; status: string; debit: number; credit: number } | null;
}

export interface ManufacturingScrapDispositionPayload extends ManufacturingJsonObject {
  operationExecutionId: string;
  destinationLocationId: string;
  scrapInventoryItemId: string;
  scrapLotNumber: string;
  recoveryUnitCost: number;
  reasonCode: string;
}

export interface ManufacturingReworkDispositionPayload extends ManufacturingJsonObject {
  operationExecutionId: string;
  reworkType: "REWORK" | "REPROCESSING";
  bomVersionId: string;
  routingVersionId: string;
  plannedStartDate: string;
  plannedEndDate: string;
  reasonCode: string;
}

export interface ManufacturingQualityInspectionRecord {
  id: string;
  inspectionNumber: string;
  inspectionType: string;
  status: string;
  orderLotId: string | null;
  operationExecutionId: string | null;
  sourceTransactionId: string | null;
  sampleQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  holdQuantity: number;
  holdReason: string | null;
  inspectedAt: string | null;
  results: Array<{
    id: string;
    parameterCode: string;
    parameterName: string;
    testMethod: string | null;
    unit: string | null;
    specificationMin: number | null;
    specificationMax: number | null;
    specificationText: string | null;
    actualValue: number | null;
    actualText: string | null;
    passed: boolean | null;
    remarks: string | null;
  }>;
}

export interface ManufacturingApplicableQualitySpecificationParameter {
  parameterCode: string;
  parameterName: string;
  sequence: number;
  resultType: "NUMERIC" | "TEXT" | "BOOLEAN";
  unit: string | null;
  testMethodRecordId: string;
  testMethodCode: string;
  testMethodName: string;
  testMethodVersion: number;
  testMethodSnapshot: string;
  lowerLimit: string | null;
  upperLimit: string | null;
  expectedText: string | null;
  expectedBoolean: boolean | null;
  critical: boolean;
  specificationText: string;
}

export interface ManufacturingApplicableQualitySpecification {
  id: string;
  code: string;
  name: string;
  versionNumber: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  approvedAt: string | null;
  parameters: ManufacturingApplicableQualitySpecificationParameter[];
}

export interface ManufacturingSerialRecord {
  id: string;
  serialNumber: string;
  orderLotId: string | null;
  inventoryLotId: string | null;
  warehouseId: string | null;
  locationId: string | null;
  status: string;
  releasedAt: string | null;
}

export interface ManufacturingCostSnapshotRecord {
  id: string;
  versionNumber: number;
  status: string;
  currency: string;
  materialCost: number;
  packagingCost: number;
  labourCost: number;
  machineCost: number;
  overheadCost: number;
  subcontractCost: number;
  otherCost: number;
  scrapRecovery: number;
  varianceAmount: number;
  totalCost: number;
  completedQuantity: number;
  unitCost: number;
  voucherEntryId: string | null;
  finalizedAt: string | null;
}

export interface ManufacturingOperationExecutionRecord {
  id: string;
  orderLotId: string | null;
  routingOperationId: string;
  operationSequence: number | null;
  operationCode: string | null;
  operationName: string | null;
  qcRequired: boolean;
  status: string;
  plannedQuantity: number;
  inputQuantity: number;
  goodQuantity: number;
  rejectedQuantity: number;
  scrapQuantity: number;
  reworkQuantity: number;
  startedAt: string | null;
  completedAt: string | null;
  pauseReason: string | null;
}

export interface ManufacturingProductionOrderSummary {
  id: string;
  workspaceId: string;
  orderNumber: string;
  orderType: ManufacturingOrderType;
  status: ManufacturingOrderStatus;
  finishedProductId: string;
  finishedProductCode: string;
  finishedProductName: string;
  bomVersionId: string;
  bomNumber: string;
  bomVersionNumber: number;
  routingVersionId: string | null;
  operationExecutionCount: number;
  plannedQuantity: number;
  completedQuantity: number;
  priority: number;
  unit: string;
  sourceWarehouseId: string;
  sourceWarehouseName: string;
  sourceLocationId: string | null;
  sourceLocationCode: string | null;
  sourceLocationName: string | null;
  destinationWarehouseId: string;
  destinationWarehouseName: string;
  destinationLocationId: string | null;
  destinationLocationCode: string | null;
  destinationLocationName: string | null;
  plannedStartDate: string;
  plannedEndDate: string;
  materialStatus: ManufacturingMaterialStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ManufacturingProductionOrderRecord extends ManufacturingProductionOrderSummary {
  notes: string | null;
  planId: string | null;
  planLotId: string | null;
  materials: ManufacturingProductionOrderMaterialRecord[];
  lots: ManufacturingProductionLotRecord[];
  actionHistory: ManufacturingOrderActionHistoryRecord[];
  reservations: ManufacturingReservationRecord[];
  transactions: ManufacturingTransactionRecord[];
  qualityInspections: ManufacturingQualityInspectionRecord[];
  serials: ManufacturingSerialRecord[];
  costSnapshots: ManufacturingCostSnapshotRecord[];
  operationExecutions: ManufacturingOperationExecutionRecord[];
  workflowReviews: ManufacturingWorkflowReviewRecord[];
}

export interface ManufacturingOrderListQuery {
  workspaceId: string;
  search?: string;
  status?: ManufacturingOrderStatus;
  orderType?: ManufacturingOrderType;
  warehouseId?: string;
  from?: string;
  to?: string;
}

export interface CreateManufacturingOrderInput {
  workspaceId: string;
  idempotencyKey: string;
  orderNumber?: string;
  orderType: ManufacturingOrderType;
  finishedProductId: string;
  bomVersionId: string;
  routingVersionId: string;
  planId?: string | null;
  planLotId?: string | null;
  plannedQuantity: number;
  unit: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
  plannedStartDate: string;
  plannedEndDate: string;
  notes?: string | null;
  lots?: Array<{
    lotNumber: string;
    plannedQuantity: number;
  }>;
}

export interface ManufacturingOrderActionLineInput {
  orderMaterialId?: string;
  orderLotId?: string;
  inventoryItemId?: string;
  inventoryLotId?: string;
  lotId?: string;
  lotNumber?: string;
  sourceWarehouseId?: string;
  destinationWarehouseId?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  quantity?: number;
  unit?: string;
  unitCost?: number;
  reasonCode?: string;
  serialNumbers?: string[];
  payload?: ManufacturingJsonObject;
}

export interface ManufacturingOrderActionInput {
  kind: ManufacturingOrderActionKind;
  idempotencyKey: string;
  transactionDate: string;
  lines?: ManufacturingOrderActionLineInput[];
  payload?: ManufacturingJsonObject;
  note?: string;
  signatureMeaning?: string | null;
  reauthenticationPassword?: string | null;
}

export interface ManufacturingOrderActionHistoryRecord {
  id: string;
  kind: ManufacturingOrderActionKind;
  fromStatus: ManufacturingOrderStatus | null;
  toStatus: ManufacturingOrderStatus;
  transactionDate: string;
  note: string | null;
  signatureMeaning?: string | null;
  approvalProgress?: ManufacturingApprovalProgress | null;
  performedBy: string | null;
  createdAt: string;
}

export interface ManufacturingOrderActionResult {
  order: ManufacturingProductionOrderRecord;
  action: ManufacturingOrderActionHistoryRecord;
  transactionIds: string[];
  stockMovementIds: string[];
  replayed: boolean;
}

export interface ManufacturingWorkflowReviewRecord {
  id: string;
  workspaceId: string;
  group: ManufacturingWorkflowGroup;
  workflowKey: string;
  entityType: string | null;
  entityId: string | null;
  outcome: ManufacturingWorkflowOutcome;
  status: ManufacturingWorkflowReviewStatus;
  reason: string | null;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  transactionDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManufacturingWorkflowReviewListQuery {
  workspaceId: string;
  group?: ManufacturingWorkflowGroup;
  workflowKey?: string;
  entityType?: string;
  entityId?: string;
  outcome?: ManufacturingWorkflowOutcome;
  status?: ManufacturingWorkflowReviewStatus;
  from?: string;
  to?: string;
}

export interface CreateManufacturingWorkflowReviewInput {
  workspaceId: string;
  group: ManufacturingWorkflowGroup;
  workflowKey: string;
  entityType?: string | null;
  entityId?: string | null;
  outcome: ManufacturingWorkflowOutcome;
  status?: "PENDING";
  reason?: string | null;
  note?: string | null;
  transactionDate: string;
  idempotencyKey: string;
  payload?: ManufacturingJsonObject;
}

export interface TransitionManufacturingWorkflowReviewInput {
  workspaceId: string;
  action: "REVIEW" | "APPROVE" | "REJECT";
  reason?: string | null;
  signatureMeaning?: string | null;
  reauthenticationPassword?: string | null;
  transactionDate: string;
}

export type ManufacturingFlowGroupCode =
  "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

export type ManufacturingWorkflowStepStatus =
  | "BLOCKED"
  | "READY"
  | "IN_PROGRESS"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "POSTING"
  | "POSTED"
  | "COMPLETED"
  | "ON_HOLD"
  | "REJECTED"
  | "FAILED"
  | "N_A"
  | "CANCELLED"
  | "CLOSED"
  | "LOCKED";

export type ManufacturingWorkflowGroupState =
  | "LOCKED"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "COMPLETED_WITH_NA"
  | "BLOCKED";

export type ManufacturingRunStatus =
  | "DRAFT"
  | "PLANNED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "MATERIAL_QC_PENDING"
  | "MATERIAL_READY"
  | "RESERVED"
  | "STAGED"
  | "ISSUED"
  | "IN_PRODUCTION"
  | "PRODUCTION_COMPLETE"
  | "QC_PENDING"
  | "QC_PASSED"
  | "PACKAGING"
  | "PACKAGING_RECONCILED"
  | "FG_Q"
  | "RELEASE_READY"
  | "FG_R"
  | "COST_FINALIZED"
  | "CLOSED"
  | "PERIOD_LOCKED"
  | "CANCELLED"
  | "ON_HOLD";

export interface ManufacturingWorkflowStepDefinitionRecord {
  id: string;
  legacyGroupCode: string;
  legacyStepCode: string;
  flowGroupCode: ManufacturingFlowGroupCode;
  flowGroupName: string;
  flowGroupOrder: number;
  flowSerial: number;
  title: string;
  displayOrder: number;
  executionOrder: number;
  stepType: string;
  applicabilityType: string;
  repeatable: boolean;
  postingEffect: string;
  postingDescription: string | null;
  permissionKey: string;
  route: string;
  completionRule: ManufacturingJsonObject;
  allowedModes: ManufacturingMode[];
  isBlocking: boolean;
  isActive: boolean;
  dependencies: Array<{
    prerequisiteFlowSerial: number;
    requiredStatus: ManufacturingWorkflowStepStatus;
    dependencyType: string;
    conditionExpression: ManufacturingJsonObject | null;
  }>;
}

export interface ManufacturingWorkflowGroupDefinitionRecord {
  id: string;
  legacyGroupCode: string;
  flowGroupCode: ManufacturingFlowGroupCode;
  name: string;
  flowGroupOrder: number;
  expectedStepCount: number;
  steps: ManufacturingWorkflowStepDefinitionRecord[];
}

export interface ManufacturingWorkflowDefinitionRecord {
  id: string;
  version: string;
  isActive: boolean;
  effectiveFrom: string;
  totalGroups: 11;
  totalSteps: 159;
  groups: ManufacturingWorkflowGroupDefinitionRecord[];
}

/**
 * Workspace-scoped presentation preferences for the Manufacturing navigator.
 *
 * Hiding a step never changes the versioned workflow definition, an existing
 * run, its dependencies, or any inventory/accounting behavior. The API maps
 * the public serials to stable catalog identities before persisting them.
 */
export interface ManufacturingWorkflowConfigurationRecord {
  workspaceId: string;
  workflowDefinitionVersion: string;
  totalSteps: number;
  hiddenStepSerials: number[];
  enabledStepSerials: number[];
  revision: number;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

export interface UpdateManufacturingWorkflowConfigurationInput {
  workspaceId: string;
  workflowDefinitionVersion: string;
  hiddenStepSerials: number[];
  expectedRevision: number;
}

export interface ManufacturingWorkflowElectronicSignatureContext {
  required: boolean;
  policyReady: boolean;
  policyRecordId: string | null;
  policyCode: string | null;
  policyVersion: number | null;
  allowedMeanings: string[];
  reauthenticationRequired: boolean;
  mfaRequired: boolean;
  mfaAvailable: boolean;
  blockedReason: string | null;
}

export interface ManufacturingRunStepRecord {
  id: string;
  occurrenceKey: string;
  flowSerial: number;
  legacyStepCode: string;
  flowGroupCode: ManufacturingFlowGroupCode;
  title: string;
  route: string;
  status: ManufacturingWorkflowStepStatus;
  applicable: boolean;
  blockerReason: string | null;
  naReason: string | null;
  postingEffect: string;
  permissionKey: string;
  completionRule: ManufacturingJsonObject;
  applicabilityType: string;
  stepType: string;
  repeatable: boolean;
  isBlocking: boolean;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  approvedBy: string | null;
  signatureReference: string | null;
  version: number;
  prerequisites: Array<{
    flowSerial: number;
    occurrenceKey: string;
    title: string;
    requiredStatus: ManufacturingWorkflowStepStatus;
    actualStatus: ManufacturingWorkflowStepStatus;
    route: string;
    dependencyType: string;
    conditionExpression: ManufacturingJsonObject | null;
  }>;
  missingPrerequisites: Array<{
    flowSerial: number;
    occurrenceKey: string;
    title: string;
    requiredStatus: ManufacturingWorkflowStepStatus;
    actualStatus: ManufacturingWorkflowStepStatus;
    route: string;
  }>;
}

export interface ManufacturingRunGroupProgress {
  flowGroupCode: ManufacturingFlowGroupCode;
  name: string;
  state: ManufacturingWorkflowGroupState;
  applicable: number;
  completed: number;
  notApplicable: number;
  blocked: number;
  pendingApproval: number;
}

export interface ManufacturingNextRequiredAction {
  state: "READY" | "BLOCKED" | "COMPLETE";
  runId: string;
  step: ManufacturingRunStepRecord | null;
  blockerReason: string | null;
  fixingRoute: string | null;
}

export interface ManufacturingRunRecord {
  id: string;
  workspaceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: string;
  productionPlanId: string | null;
  productionOrderId: string | null;
  productId: string | null;
  manufacturingMode: ManufacturingMode;
  status: ManufacturingRunStatus;
  currentGroup: ManufacturingFlowGroupCode;
  currentStepSerial: number;
  version: number;
  startedAt: string;
  completedAt: string | null;
  closedAt: string | null;
  groups: ManufacturingRunGroupProgress[];
  steps: ManufacturingRunStepRecord[];
  nextAction: ManufacturingNextRequiredAction;
}

export interface ManufacturingRunStepTransitionRecord {
  id: string;
  occurrenceKey: string;
  fromStatus: ManufacturingWorkflowStepStatus;
  toStatus: ManufacturingWorkflowStepStatus;
  sourceAction: ManufacturingRunStepTransitionAction;
  reason: string | null;
  performedByUserId: string;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  signatureReference: string | null;
  createdAt: string;
  flowSerial: number;
  title: string;
  route: string;
}

export interface StartManufacturingRunInput {
  workspaceId: string;
  idempotencyKey: string;
  manufacturingMode?: ManufacturingMode;
  productionPlanId?: string | null;
  productionOrderId?: string | null;
  productId?: string | null;
  startedAt?: string;
}

export interface DiscardEmptyManufacturingRunInput {
  workspaceId: string;
  reason: string;
  expectedVersion?: number;
}

export interface CreateManufacturingRunStepOccurrenceInput {
  workspaceId: string;
  occurrenceKey: string;
}

export type ManufacturingRunStepTransitionAction =
  | "TRIGGER"
  | "START"
  | "SAVE_DRAFT"
  | "SUBMIT"
  | "APPROVE"
  | "BEGIN_POSTING"
  | "CONFIRM_POSTED"
  | "COMPLETE"
  | "MARK_N_A"
  | "HOLD"
  | "RESUME"
  | "REJECT"
  | "FAIL";

export interface TransitionManufacturingRunStepInput {
  workspaceId: string;
  idempotencyKey: string;
  action: ManufacturingRunStepTransitionAction;
  reason?: string | null;
  reasonCode?: string | null;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  signatureMeaning?: string | null;
  reauthenticationPassword?: string | null;
  evidence?: ManufacturingJsonObject;
  expectedVersion?: number;
}
