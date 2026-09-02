import { apiRequest } from "@/services/api-client";
import type {
  ManufacturingLabelStatus,
  ManufacturingPackageLevel,
  ManufacturingPackagingOrderRecord,
  ManufacturingSerialPackagingWorkspace,
  ManufacturingSerialRuleRecord,
  ManufacturingSignedInput,
} from "@/types/manufacturing-packaging";

function post<T>(path: string, body: unknown) {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function getManufacturingSerialPackagingWorkspace(
  workspaceId: string,
  orderId?: string,
) {
  const params = new URLSearchParams({ workspaceId });
  if (orderId) params.set("orderId", orderId);
  return apiRequest<ManufacturingSerialPackagingWorkspace>(
    `/manufacturing/serial-packaging/workspace?${params}`,
  );
}

export function createManufacturingSerialRule(input: {
  workspaceId: string;
  orderId?: string | null;
  code: string;
  name: string;
  inventoryItemId: string;
  prefix: string;
  suffix?: string | null;
  startNumber: number;
  endNumber: number;
  padding?: number;
}) {
  return post<ManufacturingSerialRuleRecord>(
    "/manufacturing/serial-packaging/serial-rules",
    input,
  );
}

export function activateManufacturingSerialRule(
  ruleId: string,
  input: ManufacturingSignedInput,
) {
  return post<{ rule: ManufacturingSerialRuleRecord; replayed: boolean }>(
    `/manufacturing/serial-packaging/serial-rules/${encodeURIComponent(ruleId)}/activate`,
    input,
  );
}

export function allocateManufacturingSerials(
  ruleId: string,
  input: ManufacturingSignedInput & {
    orderId: string;
    orderLotId?: string | null;
    quantity: number;
  },
) {
  return post<{
    serials: Array<{ id: string; serialNumber: string }>;
    replayed: boolean;
  }>(
    `/manufacturing/serial-packaging/serial-rules/${encodeURIComponent(ruleId)}/allocate`,
    input,
  );
}

export function recordManufacturingSerialQc(
  input: ManufacturingSignedInput & {
    orderId: string;
    orderLotId?: string | null;
    inspections: Array<{
      serialId: string;
      passed: boolean;
      holdReason?: string | null;
      results: Array<{
        parameterCode: string;
        parameterName: string;
        actualText?: string | null;
        passed: boolean;
        remarks?: string | null;
      }>;
    }>;
  },
) {
  return post<{
    replayed: boolean;
    approvalProgress: {
      totalStages: number;
      completedStages: number;
      nextStage: number | null;
      complete: boolean;
    } | null;
  }>("/manufacturing/serial-packaging/serial-qc", input);
}

export function createManufacturingPackagingOrder(
  input: ManufacturingSignedInput & {
    orderId: string;
    orderLotId?: string | null;
    packagingConfigurationId: string;
    packagingOrderNumber?: string;
    plannedQuantity: number;
    unit: string;
  },
) {
  return post<{
    packagingOrder: ManufacturingPackagingOrderRecord;
    replayed: boolean;
  }>("/manufacturing/serial-packaging/packaging-orders", input);
}

export function retryManufacturingPackagingMaterialReservation(
  packagingOrderId: string,
  input: ManufacturingSignedInput,
) {
  return post<{
    packagingOrder: ManufacturingPackagingOrderRecord;
    replayed: boolean;
  }>(
    `/manufacturing/serial-packaging/packaging-orders/${encodeURIComponent(packagingOrderId)}/reserve-materials`,
    input,
  );
}

export function recordManufacturingPackagingLineClearance(
  packagingOrderId: string,
  input: ManufacturingSignedInput & { evidenceReference: string },
) {
  return post<{
    packagingOrder: ManufacturingPackagingOrderRecord;
    replayed: boolean;
  }>(
    `/manufacturing/serial-packaging/packaging-orders/${encodeURIComponent(packagingOrderId)}/line-clearance`,
    input,
  );
}

export function reconcileManufacturingPackaging(
  packagingOrderId: string,
  input: ManufacturingSignedInput & {
    lines: Array<{
      inventoryItemId: string;
      usedQuantity: number;
      returnedQuantity: number;
      rejectedQuantity: number;
      destroyedQuantity: number;
      unit: string;
      note?: string | null;
    }>;
  },
) {
  return post<{
    packagingOrder: ManufacturingPackagingOrderRecord;
    replayed: boolean;
  }>(
    `/manufacturing/serial-packaging/packaging-orders/${encodeURIComponent(packagingOrderId)}/reconcile`,
    input,
  );
}

export function registerManufacturingPackagingLabels(
  packagingOrderId: string,
  input: ManufacturingSignedInput & {
    labels: Array<{
      labelCode: string;
      serialId?: string | null;
      status: ManufacturingLabelStatus;
      dispositionReason?: string | null;
    }>;
  },
) {
  return post<{
    packagingOrder: ManufacturingPackagingOrderRecord;
    replayed: boolean;
  }>(
    `/manufacturing/serial-packaging/packaging-orders/${encodeURIComponent(packagingOrderId)}/labels`,
    input,
  );
}

export function registerManufacturingPackageUnits(
  packagingOrderId: string,
  input: ManufacturingSignedInput & {
    units: Array<{
      code: string;
      level: ManufacturingPackageLevel;
      parentCode?: string | null;
      serialId?: string | null;
      quantity?: number;
      note?: string | null;
    }>;
  },
) {
  return post<{
    packagingOrder: ManufacturingPackagingOrderRecord;
    replayed: boolean;
  }>(
    `/manufacturing/serial-packaging/packaging-orders/${encodeURIComponent(packagingOrderId)}/package-units`,
    input,
  );
}

export function confirmManufacturingPackagingReleaseReadiness(
  packagingOrderId: string,
  input: ManufacturingSignedInput,
) {
  return post<{
    packagingOrder: ManufacturingPackagingOrderRecord;
    replayed: boolean;
  }>(
    `/manufacturing/serial-packaging/packaging-orders/${encodeURIComponent(packagingOrderId)}/release-readiness`,
    input,
  );
}
