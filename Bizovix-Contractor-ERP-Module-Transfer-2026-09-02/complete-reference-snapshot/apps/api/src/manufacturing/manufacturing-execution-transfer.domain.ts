import { Prisma } from "../generated/prisma/index.js";

export type ManufacturingExecutionTransferKind =
  "WIP_TRANSFER" | "BULK_PRODUCT_TRANSFER";

export type ManufacturingTransferQuantityBucket = "AVAILABLE" | "HOLD";

type TransferableLot = {
  availableQuantity: Prisma.Decimal.Value;
  reservedQuantity: Prisma.Decimal.Value;
  holdQuantity: Prisma.Decimal.Value;
  rejectedQuantity: Prisma.Decimal.Value;
  location: { disposition: string } | null;
};

const WIP_ORDER_STATES = new Set(["IN_PRODUCTION", "QC_HOLD", "COMPLETED"]);
const BULK_ORDER_STATES = new Set([
  "IN_PRODUCTION",
  "QC_HOLD",
  "QA_RELEASED",
  "COMPLETED",
]);
const WIP_ITEM_ROLES = new Set(["INTERMEDIATE", "BULK", "FINISHED_GOOD"]);
const BULK_ITEM_ROLES = new Set(["BULK"]);
const WIP_SOURCE_DISPOSITIONS = new Set(["WIP", "QC_HOLD"]);
const BULK_SOURCE_DISPOSITIONS = new Set([
  "WIP",
  "QC_HOLD",
  "STAGING",
  "RELEASED",
]);

function decimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

export function isExecutionTransferOrderStateAllowed(
  kind: ManufacturingExecutionTransferKind,
  status: string,
) {
  return (kind === "WIP_TRANSFER" ? WIP_ORDER_STATES : BULK_ORDER_STATES).has(
    status,
  );
}

export function isExecutionTransferItemRoleAllowed(
  kind: ManufacturingExecutionTransferKind,
  role: string | null | undefined,
) {
  if (!role) return false;
  return (kind === "WIP_TRANSFER" ? WIP_ITEM_ROLES : BULK_ITEM_ROLES).has(role);
}

export function isExecutionTransferSourceDispositionAllowed(
  kind: ManufacturingExecutionTransferKind,
  disposition: string | null | undefined,
) {
  if (!disposition) return false;
  return (
    kind === "WIP_TRANSFER" ? WIP_SOURCE_DISPOSITIONS : BULK_SOURCE_DISPOSITIONS
  ).has(disposition);
}

export function resolveExecutionTransferQuantity(lot: TransferableLot) {
  const disposition = lot.location?.disposition ?? null;
  if (disposition === "QC_HOLD") {
    return {
      bucket: "HOLD" as const,
      quantity: decimal(lot.holdQuantity).toDecimalPlaces(
        4,
        Prisma.Decimal.ROUND_HALF_UP,
      ),
    };
  }
  return {
    bucket: "AVAILABLE" as const,
    quantity: Prisma.Decimal.max(
      decimal(0),
      decimal(lot.availableQuantity).sub(lot.reservedQuantity),
    ).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
  };
}

export function isExecutionTransferDestinationAllowed(
  kind: ManufacturingExecutionTransferKind,
  bucket: ManufacturingTransferQuantityBucket,
  disposition: string,
) {
  if (bucket === "HOLD") return disposition === "QC_HOLD";
  if (kind === "WIP_TRANSFER") return ["WIP", "STAGING"].includes(disposition);
  return ["WIP", "STAGING", "RELEASED"].includes(disposition);
}

export function shouldMoveWholeExecutionLot(
  lot: TransferableLot,
  bucket: ManufacturingTransferQuantityBucket,
  quantity: Prisma.Decimal.Value,
) {
  const requested = decimal(quantity);
  if (bucket === "HOLD") {
    return (
      requested.equals(lot.holdQuantity) &&
      decimal(lot.availableQuantity).isZero() &&
      decimal(lot.reservedQuantity).isZero() &&
      decimal(lot.rejectedQuantity).isZero()
    );
  }
  return (
    requested.equals(lot.availableQuantity) &&
    decimal(lot.reservedQuantity).isZero() &&
    decimal(lot.holdQuantity).isZero() &&
    decimal(lot.rejectedQuantity).isZero()
  );
}

export function executionTransferLotNumber(
  sourceLotNumber: string,
  kind: ManufacturingExecutionTransferKind,
  requestHash: string,
) {
  const marker = kind === "WIP_TRANSFER" ? "WIP" : "BLK";
  return `${sourceLotNumber}-${marker}-${requestHash.slice(0, 10).toUpperCase()}`;
}
