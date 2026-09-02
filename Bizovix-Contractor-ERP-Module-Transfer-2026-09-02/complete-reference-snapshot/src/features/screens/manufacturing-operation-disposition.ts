import type {
  ManufacturingOrderActionKind,
  ManufacturingOperationExecutionRecord,
  ManufacturingProductionOrderRecord,
} from "@/types/manufacturing";

export type ManufacturingDispositionAction = Extract<
  ManufacturingOrderActionKind,
  "POST_SCRAP_DISPOSITION" | "CREATE_REWORK_DISPOSITION"
>;

export type ManufacturingDispositionCandidate = {
  execution: ManufacturingOperationExecutionRecord;
  recordedQuantity: number;
  postedQuantity: number;
  remainingQuantity: number;
};

type ManufacturingDispositionOrder = Pick<
  ManufacturingProductionOrderRecord,
  "operationExecutions" | "transactions"
>;

const transactionTypeByAction: Record<
  ManufacturingDispositionAction,
  "SCRAP_RECEIPT" | "REWORK_RECEIPT"
> = {
  POST_SCRAP_DISPOSITION: "SCRAP_RECEIPT",
  CREATE_REWORK_DISPOSITION: "REWORK_RECEIPT",
};

function normalizedQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function isManufacturingDispositionAction(
  action: ManufacturingOrderActionKind | "" | undefined,
): action is ManufacturingDispositionAction {
  return (
    action === "POST_SCRAP_DISPOSITION" ||
    action === "CREATE_REWORK_DISPOSITION"
  );
}

export function manufacturingDispositionCandidates(
  order: ManufacturingDispositionOrder,
  action: ManufacturingDispositionAction,
): ManufacturingDispositionCandidate[] {
  const transactionType = transactionTypeByAction[action];

  return order.operationExecutions.flatMap((execution) => {
    if (execution.status !== "COMPLETED") return [];
    const recordedQuantity =
      action === "POST_SCRAP_DISPOSITION"
        ? execution.scrapQuantity
        : execution.reworkQuantity;
    const postedQuantity = order.transactions
      .filter(
        (transaction) =>
          transaction.status === "POSTED" &&
          transaction.transactionType === transactionType &&
          transaction.operationExecutionId === execution.id,
      )
      .flatMap((transaction) => transaction.lines)
      .reduce((total, line) => total + line.quantity, 0);
    const remainingQuantity = normalizedQuantity(
      recordedQuantity - postedQuantity,
    );

    return remainingQuantity > 0
      ? [
          {
            execution,
            recordedQuantity,
            postedQuantity,
            remainingQuantity,
          },
        ]
      : [];
  });
}
