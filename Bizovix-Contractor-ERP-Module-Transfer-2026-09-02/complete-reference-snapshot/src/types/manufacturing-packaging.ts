export type QuantityValue = string | number;

export type ManufacturingSerialRuleStatus = "DRAFT" | "ACTIVE" | "RETIRED";
export type ManufacturingPackagingOrderStatus =
  | "MATERIAL_SHORT"
  | "DRAFT"
  | "LINE_CLEARED"
  | "IN_PROGRESS"
  | "EXECUTED"
  | "RECONCILED"
  | "RELEASE_READY"
  | "CLOSED"
  | "CANCELLED";
export type ManufacturingLabelStatus =
  "ISSUED" | "USED" | "RETURNED" | "VOIDED" | "DESTROYED";
export type ManufacturingPackageLevel =
  "UNIT" | "CARTON" | "SHIPPER" | "PALLET";

export interface ManufacturingPackagingOrderOption {
  id: string;
  orderNumber: string;
  status: string;
  finishedProductId: string;
  plannedQuantity: QuantityValue;
  completedQuantity: QuantityValue;
  unit: string;
  finishedProduct: { itemCode: string; itemName: string; unit: string };
  lots: Array<{
    id: string;
    lotNumber: string;
    plannedQuantity: QuantityValue;
    completedQuantity: QuantityValue;
    status: string;
  }>;
}

export interface ManufacturingSerialRuleRecord {
  id: string;
  orderId: string | null;
  code: string;
  name: string;
  inventoryItemId: string;
  prefix: string;
  suffix: string | null;
  startNumber: number;
  endNumber: number;
  nextNumber: number;
  padding: number;
  status: ManufacturingSerialRuleStatus;
  inventoryItem: {
    id: string;
    itemCode: string;
    itemName: string;
    unit: string;
  } | null;
}

export interface PackagingConfigurationRecord {
  id: string;
  code: string;
  name: string;
  versionNumber: number;
  status: "APPROVED";
  inventoryItemId: string;
  payload: Record<string, unknown>;
  lines: Array<{
    id: string;
    inventoryItemId: string;
    sequence: number;
    quantity: QuantityValue;
    unit: string;
    inventoryItem: { itemCode: string; itemName: string; unit: string };
  }>;
}

export interface ManufacturingSerialQcRecord {
  id: string;
  inspectionNumber: string;
  status: string;
  inspectedAt: string | null;
  holdReason: string | null;
  results: Array<{
    id: string;
    parameterName: string;
    actualValue: QuantityValue | null;
    actualText: string | null;
    passed: boolean | null;
  }>;
}

export interface ManufacturingSerialRecord {
  id: string;
  serialNumber: string;
  orderId: string | null;
  orderLotId: string | null;
  inventoryLotId: string | null;
  status: string;
  qualityInspections: ManufacturingSerialQcRecord[];
}

export interface ManufacturingPendingSerialQcApproval {
  entityId: string;
  orderId: string | null;
  orderLotId: string | null;
  transactionDate: string;
  inspectorName: string | null;
  approvalProgress: {
    totalStages: number;
    completedStages: number;
    nextStage: number | null;
    complete: false;
  };
  submission: Array<{
    serialId: string;
    passed: boolean;
    holdReason: string | null;
    results: Array<{
      parameterCode: string;
      parameterName: string;
      testMethod: string | null;
      unit: string | null;
      specificationMin: number | null;
      specificationMax: number | null;
      specificationText: string | null;
      actualValue: number | null;
      actualText: string | null;
      passed: boolean;
      remarks: string | null;
    }>;
  }>;
}

export interface ManufacturingPackagingOrderRecord {
  id: string;
  packagingOrderNumber: string;
  status: ManufacturingPackagingOrderStatus;
  materialShortage: {
    checkedAt: string;
    warehouseId: string;
    lines: Array<{
      orderMaterialId: string;
      inventoryItemId: string;
      itemCode: string;
      itemName: string;
      lotTracked: boolean;
      requiredQuantity: string;
      availableQuantity: string;
      shortageQuantity: string;
      unit: string;
      warehouseId: string;
    }>;
  } | null;
  orderId: string;
  orderLotId: string | null;
  packagingConfigurationId: string;
  plannedQuantity: QuantityValue;
  unit: string;
  lineClearanceReference: string | null;
  lineClearanceNote: string | null;
  lineClearedAt: string | null;
  executedAt: string | null;
  reconciledAt: string | null;
  releaseReadyAt: string | null;
  order: Omit<ManufacturingPackagingOrderOption, "lots">;
  orderLot: ManufacturingPackagingOrderOption["lots"][number] | null;
  packagingConfiguration: PackagingConfigurationRecord;
  reconciliations: Array<{
    id: string;
    inventoryItemId: string;
    issuedQuantity: QuantityValue;
    usedQuantity: QuantityValue;
    returnedQuantity: QuantityValue;
    rejectedQuantity: QuantityValue;
    destroyedQuantity: QuantityValue;
    unit: string;
  }>;
  events: Array<{
    id: string;
    sequence: number;
    eventType: string;
    transactionDate: string;
    evidenceReference: string | null;
    note: string | null;
  }>;
  labels: Array<{
    id: string;
    labelCode: string;
    serialId: string | null;
    status: ManufacturingLabelStatus;
    dispositionReason: string | null;
    serial: { serialNumber: string; status: string } | null;
  }>;
  packageUnits: Array<{
    id: string;
    code: string;
    level: ManufacturingPackageLevel;
    parentId: string | null;
    serialId: string | null;
    quantity: QuantityValue;
    serial: { serialNumber: string; status: string } | null;
  }>;
}

export interface ManufacturingSerialPackagingWorkspace {
  orders: ManufacturingPackagingOrderOption[];
  serialTrackedProducts: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    unit: string;
  }>;
  serialRules: ManufacturingSerialRuleRecord[];
  packagingConfigurations: PackagingConfigurationRecord[];
  packagingOrders: ManufacturingPackagingOrderRecord[];
  serials: ManufacturingSerialRecord[];
  pendingSerialQcApprovals: ManufacturingPendingSerialQcApproval[];
}

export interface ManufacturingSignedInput {
  workspaceId: string;
  idempotencyKey: string;
  transactionDate: string;
  signatureMeaning: string;
  reauthenticationPassword?: string | null;
  note?: string | null;
}
