export type ManufacturingExecutionTransferKind =
  "WIP_TRANSFER" | "BULK_PRODUCT_TRANSFER";

export interface ManufacturingExecutionTransferContext {
  kind: ManufacturingExecutionTransferKind;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    type: string;
    finishedProductId: string;
    finishedProductCode: string;
    finishedProductName: string;
    lots: Array<{
      id: string;
      lotNumber: string;
      status: string;
      plannedQuantity: number;
      completedQuantity: number;
    }>;
    operationExecutions: Array<{
      id: string;
      orderLotId: string | null;
      status: string;
      operationId: string;
      operationCode: string;
      operationName: string;
      sequence: number;
      goodQuantity: number;
      completedAt: string | null;
    }>;
  }>;
  sourceLots: Array<{
    id: string;
    lotNumber: string;
    inventoryItemId: string;
    itemCode: string;
    itemName: string;
    itemRole: string;
    orderId: string;
    orderNumber: string;
    orderLotId: string;
    orderLotNumber: string | null;
    sourceOperationExecutionId: string | null;
    stockBacked: boolean;
    sourceClassification: string;
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    locationId: string;
    locationCode: string;
    locationName: string;
    disposition: string;
    quantityBucket: "AVAILABLE" | "HOLD";
    transferableQuantity: number;
    unit: string;
    unitCost: string;
    manufacturedAt: string | null;
    expiresAt: string | null;
    retestDueAt: string | null;
    serials: Array<{ id: string; serialNumber: string; status: string }>;
  }>;
  locations: Array<{
    id: string;
    code: string;
    name: string;
    disposition: string;
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
  }>;
  electronicSignature: {
    required: boolean;
    policyReady: boolean;
    allowedMeanings: string[];
    reauthenticationRequired: boolean;
  };
  recentTransfers: ManufacturingExecutionTransferRecord[];
}

export interface ManufacturingExecutionTransferRecord {
  id: string;
  transactionNumber: string;
  kind: ManufacturingExecutionTransferKind;
  transactionDate: string;
  orderId: string;
  orderNumber: string | null;
  orderLotId: string | null;
  orderLotNumber: string | null;
  operationExecutionId: string | null;
  operationCode: string | null;
  sourceInventoryLotId: string | null;
  sourceLotNumber: string | null;
  destinationInventoryLotId: string | null;
  destinationLotNumber: string | null;
  inventoryItemId: string | null;
  itemCode: string | null;
  itemName: string | null;
  fromWarehouseId: string | null;
  fromWarehouseName: string | null;
  toWarehouseId: string | null;
  toWarehouseName: string | null;
  fromLocationId: string | null;
  fromLocationName: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  quantity: number;
  unit: string | null;
  unitCost: string;
  totalCost: string;
  interWarehouse: boolean;
  note: string | null;
  postedAt: string | null;
  postedByUserId: string | null;
  postedByName: string | null;
  stockMovementIds: string[];
}

export interface PostManufacturingExecutionTransferInput {
  workspaceId: string;
  kind: ManufacturingExecutionTransferKind;
  orderId: string;
  orderLotId: string;
  operationExecutionId: string;
  sourceInventoryLotId: string;
  destinationLocationId: string;
  quantity: number;
  serialIds?: string[];
  transactionDate: string;
  idempotencyKey: string;
  note?: string | null;
  signatureMeaning?: string | null;
  reauthenticationPassword?: string | null;
}
