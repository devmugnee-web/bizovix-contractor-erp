import { Prisma } from "../generated/prisma/index.js";

type Db = Prisma.TransactionClient;

type MaterialVarianceRow = {
  id: string;
  inventoryItemId: string;
  unit: string;
  requiredQuantity: Prisma.Decimal | number | string;
  consumedQuantity: Prisma.Decimal | number | string;
  scrappedQuantity: Prisma.Decimal | number | string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decimalText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return clean(value);
}

/**
 * Resolves maker-checker quality evidence to exact order-material variances.
 * No action payload/free-text can approve a variance: the immutable approved
 * QUALITY_CASE and its signed approval review are the sole authority.
 */
export async function resolveApprovedMaterialVariances(
  db: Db,
  input: {
    workspaceId: string;
    orderId: string;
    actionDate: Date;
    materials: MaterialVarianceRow[];
  },
): Promise<Map<string, string>> {
  const variances = input.materials.filter((material) =>
    new Prisma.Decimal(material.consumedQuantity)
      .add(material.scrappedQuantity)
      .sub(material.requiredQuantity)
      .isZero()
      ? false
      : true,
  );
  if (!variances.length) return new Map();

  const itemIds = [...new Set(variances.map((row) => row.inventoryItemId))];
  const cases = await db.manufacturingControlRecord.findMany({
    where: {
      workspaceId: input.workspaceId,
      kind: "QUALITY_CASE",
      status: "APPROVED",
      inventoryItemId: { in: itemIds },
    },
    select: {
      id: true,
      inventoryItemId: true,
      payload: true,
      createdByUserId: true,
      approvedByUserId: true,
      approvedAt: true,
    },
  });
  if (!cases.length) return new Map();
  const approvals = await db.manufacturingWorkflowReview.findMany({
    where: {
      workspaceId: input.workspaceId,
      workflowCode: "GOVERNANCE_RECORD_APPROVE",
      entityId: { in: cases.map((entry) => entry.id) },
      status: "APPROVED",
      signatureHash: { not: null },
    },
    select: {
      entityId: true,
      approvedByUserId: true,
      approvedAt: true,
      signatureHash: true,
    },
  });

  const matched = new Map<string, string>();
  const usedCases = new Set<string>();
  for (const material of variances) {
    const variance = new Prisma.Decimal(material.consumedQuantity)
      .add(material.scrappedQuantity)
      .sub(material.requiredQuantity);
    const evidence = cases.find((record) => {
      if (usedCases.has(record.id)) return false;
      const payload = object(record.payload);
      const details = object(payload.details);
      const caseType = clean(details.caseType)?.toUpperCase();
      const state = clean(details.state)?.toUpperCase();
      const quantity = decimalText(details.approvedVarianceQuantity);
      const review = approvals.find(
        (entry) =>
          entry.entityId === record.id &&
          entry.approvedByUserId === record.approvedByUserId &&
          entry.approvedAt &&
          entry.approvedAt <= input.actionDate,
      );
      return (
        (caseType === "DEVIATION" || caseType === "CHANGE_CONTROL") &&
        ["APPROVED", "CLOSED", "RESOLVED"].includes(state ?? "") &&
        clean(details.productionOrderId) === input.orderId &&
        clean(details.orderMaterialId) === material.id &&
        clean(details.inventoryItemId) === material.inventoryItemId &&
        record.inventoryItemId === material.inventoryItemId &&
        clean(details.sourceReference) === material.id &&
        clean(details.approvedVarianceUnit) === material.unit &&
        Boolean(clean(details.varianceReason)) &&
        quantity !== null &&
        (() => {
          try {
            return new Prisma.Decimal(quantity).equals(variance);
          } catch {
            return false;
          }
        })() &&
        Boolean(record.approvedByUserId) &&
        Boolean(record.approvedAt) &&
        record.createdByUserId !== record.approvedByUserId &&
        record.approvedAt! <= input.actionDate &&
        Boolean(review)
      );
    });
    if (evidence) {
      usedCases.add(evidence.id);
      matched.set(material.id, evidence.id);
    }
  }
  return matched;
}
