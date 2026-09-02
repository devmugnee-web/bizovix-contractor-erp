import type {
  ManufacturingProductionOrderMaterialRecord,
  ManufacturingProductionOrderSummary,
} from "@/types/manufacturing";

export function qualityCaseOrderLinkValues(
  order: ManufacturingProductionOrderSummary | undefined,
  orderId: string,
) {
  return {
    productionOrderId: orderId,
    inventoryItemId: order?.finishedProductId ?? "",
    sourceReference: order?.orderNumber ?? "",
    orderMaterialId: "",
    approvedVarianceQuantity: "",
    approvedVarianceUnit: "",
    varianceReason: "",
  };
}

export function qualityCaseMaterialLinkValues(
  material: ManufacturingProductionOrderMaterialRecord,
) {
  return {
    orderMaterialId: material.id,
    inventoryItemId: material.inventoryItemId,
    approvedVarianceUnit: material.unit,
    sourceReference: material.id,
  };
}
