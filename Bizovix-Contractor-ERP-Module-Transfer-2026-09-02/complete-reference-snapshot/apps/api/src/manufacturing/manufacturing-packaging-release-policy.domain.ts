import { Prisma } from "../generated/prisma/index.js";

export type ManufacturingPackagingConfigurationPolicyRecord = {
  id: string;
  inventoryItemId: string | null;
  status: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
};

export type ManufacturingPackagingNaEvidence = {
  workflowGroup: string;
  workflowCode: string;
  entityType: string | null;
  entityId: string | null;
  outcome: string | null;
  status: string;
  transactionDate: Date;
  createdByUserId: string;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  signatureHash: string | null;
};

export type ManufacturingPackagingOrderPolicyRecord = {
  id: string;
  orderId: string;
  orderLotId: string | null;
  packagingConfigurationId: string;
  status: string;
  plannedQuantity: Prisma.Decimal.Value;
  releaseReadyAt: Date | null;
};

export type ManufacturingFinishedGoodsReceiptPolicyRecord = {
  id: string;
  orderId: string | null;
  status: string;
  transactionDate: Date;
  quantity: Prisma.Decimal.Value;
};

export type ManufacturingPackagingReleasePolicyDecision = {
  required: boolean;
  ready: boolean;
  configurationIds: string[];
  packagingOrderIds: string[];
  finishedGoodsReceiptIds: string[];
  requiredQuantity: string;
  packagingQuantity: string;
  receiptQuantity: string;
  naEvidenceAccepted: boolean;
  issues: string[];
};

const PACKAGING_NA_WORKFLOW = "qa-release";

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

export function evaluateManufacturingPackagingReleasePolicy(input: {
  orderId: string;
  finishedProductId: string;
  requiredQuantity: Prisma.Decimal.Value;
  at: Date;
  configurations: ManufacturingPackagingConfigurationPolicyRecord[];
  naEvidence: ManufacturingPackagingNaEvidence[];
  packagingOrders: ManufacturingPackagingOrderPolicyRecord[];
  finishedGoodsReceipts: ManufacturingFinishedGoodsReceiptPolicyRecord[];
}): ManufacturingPackagingReleasePolicyDecision {
  const requiredQuantity = decimal(input.requiredQuantity);
  if (!requiredQuantity.isFinite() || requiredQuantity.lessThanOrEqualTo(0)) {
    throw new Error(
      "Packaging release requires a positive finished-goods quantity.",
    );
  }

  const configurations = input.configurations.filter(
    (configuration) =>
      configuration.status === "APPROVED" &&
      configuration.inventoryItemId === input.finishedProductId &&
      (!configuration.effectiveFrom ||
        configuration.effectiveFrom <= input.at) &&
      (!configuration.effectiveTo || configuration.effectiveTo >= input.at),
  );
  const configurationIds = new Set(
    configurations.map((configuration) => configuration.id),
  );
  const naEvidenceAccepted = input.naEvidence.some(
    (evidence) =>
      evidence.workflowGroup === "PACKAGING_RELEASE" &&
      evidence.workflowCode === PACKAGING_NA_WORKFLOW &&
      evidence.entityType === "MANUFACTURING_ORDER" &&
      evidence.entityId === input.orderId &&
      evidence.outcome === "NOT_APPLICABLE" &&
      evidence.status === "APPROVED" &&
      evidence.transactionDate <= input.at &&
      Boolean(evidence.approvedByUserId) &&
      evidence.approvedByUserId !== evidence.createdByUserId &&
      Boolean(evidence.approvedAt && evidence.approvedAt <= input.at) &&
      Boolean(evidence.signatureHash?.trim()),
  );
  const base = {
    configurationIds: [...configurationIds],
    packagingOrderIds: [] as string[],
    finishedGoodsReceiptIds: [] as string[],
    requiredQuantity: requiredQuantity.toString(),
    packagingQuantity: "0",
    receiptQuantity: "0",
    naEvidenceAccepted,
  };

  if (configurationIds.size === 0) {
    if (naEvidenceAccepted) {
      return { required: false, ready: true, ...base, issues: [] };
    }
    return {
      required: true,
      ready: false,
      ...base,
      issues: [
        "No effective APPROVED packaging configuration or approved order-level packaging N/A evidence exists.",
      ],
    };
  }

  if (naEvidenceAccepted) {
    return {
      required: true,
      ready: false,
      ...base,
      issues: [
        "Approved packaging N/A evidence conflicts with an effective approved product packaging configuration.",
      ],
    };
  }

  const receipts = input.finishedGoodsReceipts.filter(
    (receipt) =>
      receipt.orderId === input.orderId && receipt.status === "POSTED",
  );
  const receiptQuantity = receipts.reduce(
    (total, receipt) => total.add(receipt.quantity),
    decimal(0),
  );
  const latestReceiptAt = receipts.reduce<Date | null>(
    (latest, receipt) =>
      !latest || receipt.transactionDate > latest
        ? receipt.transactionDate
        : latest,
    null,
  );
  const packagingOrders = input.packagingOrders.filter(
    (order) =>
      order.orderId === input.orderId &&
      order.orderLotId === null &&
      configurationIds.has(order.packagingConfigurationId) &&
      order.status !== "CANCELLED",
  );
  const packagingQuantity = packagingOrders.reduce(
    (total, order) => total.add(order.plannedQuantity),
    decimal(0),
  );
  const issues: string[] = [];
  if (!receiptQuantity.equals(requiredQuantity)) {
    issues.push(
      "Posted finished-goods receipt quantity must exactly equal the accepted order quantity before packaging release readiness.",
    );
  }
  if (!packagingQuantity.equals(requiredQuantity)) {
    issues.push(
      "Order-level packaging quantity must exactly equal the accepted finished-goods quantity.",
    );
  }
  if (!packagingOrders.length) {
    issues.push(
      "An order-level packaging order using the effective approved product configuration is required.",
    );
  }
  if (
    packagingOrders.some(
      (order) =>
        order.status !== "RELEASE_READY" ||
        !order.releaseReadyAt ||
        !latestReceiptAt ||
        order.releaseReadyAt < latestReceiptAt,
    )
  ) {
    issues.push(
      "Every covering packaging order must reach RELEASE_READY after the latest posted finished-goods receipt.",
    );
  }

  return {
    required: true,
    ready: issues.length === 0,
    ...base,
    packagingOrderIds: packagingOrders.map((order) => order.id),
    finishedGoodsReceiptIds: receipts.map((receipt) => receipt.id),
    packagingQuantity: packagingQuantity.toString(),
    receiptQuantity: receiptQuantity.toString(),
    issues,
  };
}
