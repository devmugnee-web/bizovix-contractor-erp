export type IncomingMaterialLotStatus =
  | "QUARANTINE"
  | "RELEASED"
  | "REJECTED"
  | "PARTIALLY_RELEASED"
  | "RETEST_DUE"
  | "EXPIRED"
  | "DEPLETED";
export type MaterialLotAllocationMethod = "FIFO" | "FEFO";
export type MaterialHandlingStage =
  "STAGED" | "VERIFIED" | "ISSUE_SCAN" | "RETURN_SCAN";

export interface MaterialSourceMovementRecord {
  id: string;
  transactionType: string;
  transactionId: string;
  transactionLineId: string;
  referenceNo: string | null;
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
  registeredQuantity: number;
  unregisteredQuantity: number;
  unit: string;
  unitCost: string;
  transactionDate: string;
}

export interface IncomingMaterialLotRecord {
  id: string;
  inventoryItemId: string;
  itemCode: string | null;
  itemName: string | null;
  warehouseId: string;
  warehouseCode: string | null;
  warehouseName: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  lotNumber: string;
  receivedQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  allocatableQuantity: number;
  holdQuantity: number;
  rejectedQuantity: number;
  unit: string;
  unitCost: string;
  manufacturedAt: string | null;
  retestDueAt: string | null;
  expiresAt: string | null;
  receivedAt: string;
  status: IncomingMaterialLotStatus;
}

export interface MaterialLotAllocationRecord extends IncomingMaterialLotRecord {
  suggestedQuantity: number;
}

export interface MaterialLotAllocationResult {
  method: MaterialLotAllocationMethod;
  asOf: string;
  requiredQuantity: number;
  allocatedQuantity: number;
  shortageQuantity: number;
  allocations: MaterialLotAllocationRecord[];
}

export interface MaterialRequisitionLineRecord {
  id: string;
  sourceDocumentLineId: string | null;
  orderMaterialId: string;
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  inventoryLotId: string;
  lotNumber: string | null;
  lotLocationId: string | null;
  lotLocationCode: string | null;
  lotLocationName: string | null;
  lotDisposition: string | null;
  expiresAt: string | null;
  quantity: number;
  unit: string;
  lotAvailableQuantity: number;
  lotReservedQuantity: number;
  lotBalances: Array<{
    orderLotId: string;
    issuedQuantity: number;
    returnedQuantity: number;
    returnableQuantity: number;
  }>;
}

export interface MaterialHandlingVerifierRecord {
  id: string;
  name: string;
  membershipRole: string;
}

export interface MaterialRequisitionRecord {
  id: string;
  requisitionNumber: string;
  status:
    "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "CANCELLED" | "REVERSED";
  transactionDate: string;
  orderId: string;
  orderNumber: string | null;
  orderStatus: string | null;
  warehouseId: string;
  locationId: string | null;
  reservation: { id: string; reservationNumber: string; status: string } | null;
  note: string | null;
  createdAt: string;
  approvedLines: MaterialRequisitionLineRecord[];
  lines: MaterialRequisitionLineRecord[];
}

export interface RegisterIncomingMaterialLotInput {
  workspaceId: string;
  inventoryItemId: string;
  warehouseId: string;
  locationId?: string | null;
  sourceStockMovementId: string;
  sourceReference: string;
  lotNumber: string;
  quantity: number;
  unit: string;
  manufacturedAt?: string | null;
  retestDueAt?: string | null;
  expiresAt?: string | null;
  transactionDate: string;
  idempotencyKey: string;
  note?: string | null;
}

export interface InspectIncomingMaterialLotInput {
  workspaceId: string;
  decision: "RELEASED" | "REJECTED";
  sampleQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  results: Array<{
    parameterCode: string;
    parameterName: string;
    testMethod?: string | null;
    specification?: string | null;
    actualValue?: number | null;
    actualText?: string | null;
    passed: boolean;
    remarks?: string | null;
  }>;
  reason?: string | null;
  note?: string | null;
  transactionDate: string;
  idempotencyKey: string;
}

export interface CreateMaterialRequisitionInput {
  workspaceId: string;
  orderId: string;
  transactionDate: string;
  idempotencyKey: string;
  lines: Array<{
    orderMaterialId: string;
    inventoryLotId: string;
    quantity: number;
    unit?: string;
  }>;
  note?: string | null;
}

export interface MaterialRequisitionTransitionInput {
  workspaceId: string;
  transactionDate: string;
  idempotencyKey: string;
  note?: string | null;
}

export interface RecordMaterialHandlingEvidenceInput {
  workspaceId: string;
  requisitionId: string;
  requisitionLineId: string;
  orderLotId: string;
  stage: MaterialHandlingStage;
  barcode: string;
  quantity?: number | null;
  transactionId?: string | null;
  locationId?: string | null;
  verifierUserId?: string | null;
  transactionDate: string;
  idempotencyKey: string;
  note?: string | null;
}

export interface MaterialHandlingEvidenceResult {
  review: { id: string };
  transaction: {
    id: string;
    transactionNumber: string;
    transactionType: "LOCATION_TRANSFER";
  } | null;
  stagedInventoryLotId: string | null;
  stagedRequisitionLineId: string | null;
  stagedLocationId: string | null;
  replayed: boolean;
}
