export type MaterialExceptionKind =
  "ADDITIONAL_ISSUE" | "SUBSTITUTION" | "STATUS_TRANSFER" | "DESTRUCTION";

export interface MaterialExceptionMaterial {
  id: string;
  bomComponentId: string | null;
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  status: string;
  expectedQuantity: number;
  reservedQuantity: number;
  issuedQuantity: number;
  returnedQuantity: number;
  consumedQuantity: number;
  scrappedQuantity: number;
  unaccountedQuantity: number;
  requirementVariance: number;
  reconciled: boolean;
  substitutionAllowed: boolean;
  substituteGroup: string | null;
}

export interface MaterialExceptionOrder {
  id: string;
  bomVersionId: string;
  orderNumber: string;
  status: string;
  finishedProduct: string;
  materials: MaterialExceptionMaterial[];
}

export interface MaterialExceptionLot {
  id: string;
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  warehouseId: string;
  warehouse: string;
  warehouseType: string;
  locationId: string | null;
  location: string | null;
  disposition: string | null;
  lotNumber: string;
  availableQuantity: number;
  holdQuantity: number;
  rejectedQuantity: number;
  reservedQuantity: number;
  unit: string;
  unitCost: string;
  manufacturedAt: string | null;
  retestDueAt: string | null;
  expiresAt: string | null;
}

export interface MaterialExceptionLocation {
  id: string;
  warehouseId: string;
  warehouse: string;
  code: string;
  name: string;
  disposition: string;
}

export interface DestructionQualityCase {
  id: string;
  code: string;
  name: string;
  details: Record<string, unknown>;
}

export interface MaterialExceptionRequest {
  id: string;
  kind: MaterialExceptionKind;
  status: "PENDING" | "REVIEWED" | "APPROVED" | "REJECTED";
  transactionDate: string;
  title: string;
  reason: string | null;
  note: string | null;
  input: {
    kind: MaterialExceptionKind;
    orderId: string;
    sourceOrderMaterialId: string | null;
    substituteInventoryItemId: string | null;
    inventoryLotId: string | null;
    destinationLocationId: string | null;
    qualityCaseId: string | null;
    quantity: string;
    unit: string | null;
    reason: string;
  };
  createdBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
}

export interface MaterialControlView {
  orders: MaterialExceptionOrder[];
  items: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    unit: string;
  }>;
  lots: MaterialExceptionLot[];
  locations: MaterialExceptionLocation[];
  qualityCases: DestructionQualityCase[];
  requests: MaterialExceptionRequest[];
  retestActions: Array<{
    id: string;
    inventoryLotId: string | null;
    transactionDate: string;
    reason: string | null;
    previousRetestDueAt: string | null;
    retestDueAt: string | null;
    qualityCaseId: string | null;
    qualityCaseCode: string | null;
    createdBy: { id: string; name: string };
    approvedBy: { id: string; name: string } | null;
    approvedAt: string | null;
  }>;
}

export interface CreateMaterialExceptionInput {
  workspaceId: string;
  kind: MaterialExceptionKind;
  orderId: string;
  sourceOrderMaterialId?: string | null;
  substituteInventoryItemId?: string | null;
  inventoryLotId?: string | null;
  destinationLocationId?: string | null;
  qualityCaseId?: string | null;
  quantity: number;
  unit?: string | null;
  reason: string;
  transactionDate: string;
  idempotencyKey: string;
}

export interface DecideMaterialExceptionInput {
  workspaceId: string;
  action: "APPROVE" | "REJECT";
  reason: string;
  signatureMeaning: string;
  reauthenticationPassword?: string | null;
  transactionDate: string;
  idempotencyKey: string;
}

export interface RetestManufacturingInventoryLotInput {
  workspaceId: string;
  qualityCaseId: string;
  retestDueAt: string;
  transactionDate: string;
  reason: string;
  idempotencyKey: string;
}
