import { BadRequestException, ConflictException } from "@nestjs/common";
import { CostingMethod, Prisma } from "../generated/prisma/index.js";

export type MovingAverageMovement = {
  id: string;
  warehouseId: string;
  inventoryItemId: string;
  transactionType: string;
  transactionId: string;
  transactionLineId: string;
  movementType: "IN" | "OUT";
  quantity: number;
  transactionDate: Date | string;
  createdAt: Date | string;
  inputUnitCost?: number | null;
  costingVersion?: number;
  reversalOfId?: string | null;
  costSourceMovementId?: string | null;
  exactSourceUnitCost?: number | null;
};

export type CostedMovement = MovingAverageMovement & {
  unitCost: number;
  movementValue: number;
  balanceQuantity: number;
  balanceValue: number;
  averageCost: number;
};

export type MovingAverageBalance = {
  warehouseId: string;
  inventoryItemId: string;
  quantity: number;
  value: number;
  averageCost: number;
};

const DECIMAL_PLACES = 6;
const COSTING_EPSILON = new Prisma.Decimal(1).div(new Prisma.Decimal(10).pow(DECIMAL_PLACES));

function costingIntegrityError(message: string): never {
  throw new BadRequestException(`Moving Weighted Average integrity error: ${message}`);
}

function decimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

function nonNegativeDecimal(value: Prisma.Decimal.Value | null | undefined) {
  const parsed = decimal(value);
  return parsed.isNegative() ? decimal(0) : parsed;
}

function roundCost(value: Prisma.Decimal.Value) {
  return decimal(value).toDecimalPlaces(DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP);
}

function movementPriority(movement: MovingAverageMovement) {
  if (movement.transactionType === "STOCK_TRANSFER_OUT") return 0;
  if (movement.transactionType === "STOCK_TRANSFER_IN") return 1;
  return 0;
}

function compareMovements(left: MovingAverageMovement, right: MovingAverageMovement) {
  const dateDifference = new Date(left.transactionDate).getTime() - new Date(right.transactionDate).getTime();
  if (dateDifference !== 0) return dateDifference;

  if (left.transactionId === right.transactionId && left.transactionLineId === right.transactionLineId) {
    const priorityDifference = movementPriority(left) - movementPriority(right);
    if (priorityDifference !== 0) return priorityDifference;
  }

  const createdDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (createdDifference !== 0) return createdDifference;
  return left.id.localeCompare(right.id);
}

function balanceKey(movement: Pick<MovingAverageMovement, "warehouseId" | "inventoryItemId">) {
  return `${movement.warehouseId}:${movement.inventoryItemId}`;
}

function transferKey(movement: Pick<MovingAverageMovement, "transactionId" | "transactionLineId">) {
  return `${movement.transactionId}:${movement.transactionLineId}`;
}

/**
 * Perpetual moving-weighted-average replay, isolated by warehouse and product.
 * Purchases/openings/positive adjustments blend their acquisition cost; ordinary
 * issues consume the current average. Returns, reversals and transfers retain the
 * exact source cost supplied through their movement link.
 */
export function calculateMovingAverage(movements: MovingAverageMovement[], allowNegativeStock = false) {
  const states = new Map<string, {
    quantity: Prisma.Decimal;
    value: Prisma.Decimal;
    averageCost: Prisma.Decimal;
    lastUnitCost: Prisma.Decimal;
  }>();
  const calculatedById = new Map<string, CostedMovement>();
  const transferCosts = new Map<string, number>();
  const calculated: CostedMovement[] = [];

  for (const movement of [...movements].sort(compareMovements)) {
    const key = balanceKey(movement);
    const state = states.get(key) ?? {
      quantity: decimal(0),
      value: decimal(0),
      averageCost: decimal(0),
      lastUnitCost: decimal(0),
    };
    const quantity = decimal(movement.quantity).abs();
    const exactReversalCost = movement.reversalOfId ? calculatedById.get(movement.reversalOfId)?.unitCost : undefined;
    const exactSourceCost = movement.exactSourceUnitCost ?? (
      movement.costSourceMovementId ? calculatedById.get(movement.costSourceMovementId)?.unitCost : undefined
    );
    const carriedTransferCost = movement.transactionType === "STOCK_TRANSFER_IN"
      ? transferCosts.get(transferKey(movement))
      : undefined;
    const requestedInputCost = nonNegativeDecimal(movement.inputUnitCost);

    if (movement.reversalOfId && exactReversalCost === undefined) {
      costingIntegrityError(`reversal ${movement.id} cannot find its active source movement ${movement.reversalOfId}`);
    }
    if (movement.costSourceMovementId && exactSourceCost === undefined) {
      costingIntegrityError(`movement ${movement.id} cannot find its source-cost movement ${movement.costSourceMovementId}`);
    }
    if (movement.transactionType === "STOCK_TRANSFER_IN" && carriedTransferCost === undefined) {
      costingIntegrityError(`transfer-in movement ${movement.id} has no matching transfer-out cost`);
    }

    let unitCost: Prisma.Decimal;
    if (exactReversalCost !== undefined) unitCost = decimal(exactReversalCost);
    else if (exactSourceCost !== undefined) unitCost = decimal(exactSourceCost);
    else if (carriedTransferCost !== undefined) unitCost = decimal(carriedTransferCost);
    else if (movement.movementType === "IN" && movement.inputUnitCost != null) unitCost = requestedInputCost;
    else {
      unitCost = !state.averageCost.isZero()
        ? state.averageCost
        : !state.lastUnitCost.isZero()
          ? state.lastUnitCost
          : requestedInputCost;
    }
    unitCost = roundCost(unitCost);

    // While stock is negative, its book value is carried at the last valid
    // positive average. A later receipt first clears that shortfall at the
    // frozen cost; only the quantity that crosses back above zero enters stock
    // at the receipt cost. The difference belongs to negative-inventory/COGS
    // variance, not to the value of the newly positive on-hand quantity.
    let movementValue = roundCost(quantity.mul(unitCost));
    if (allowNegativeStock && movement.movementType === "IN" && state.quantity.isNegative()) {
      const frozenCost = !state.averageCost.isZero() ? state.averageCost : state.lastUnitCost;
      const quantityToZero = Prisma.Decimal.min(quantity, state.quantity.abs());
      const positiveRemainder = Prisma.Decimal.max(decimal(0), quantity.sub(quantityToZero));
      movementValue = roundCost(quantityToZero.mul(frozenCost).add(positiveRemainder.mul(unitCost)));
    }
    state.quantity = roundCost(movement.movementType === "IN" ? state.quantity.add(quantity) : state.quantity.sub(quantity));
    state.value = roundCost(movement.movementType === "IN" ? state.value.add(movementValue) : state.value.sub(movementValue));

    if (!allowNegativeStock && state.quantity.lessThan(COSTING_EPSILON.negated())) {
      costingIntegrityError(
        `movement ${movement.id} makes historical warehouse stock negative (${state.quantity.toFixed(DECIMAL_PLACES)})`,
      );
    }
    if (state.quantity.abs().lessThanOrEqualTo(COSTING_EPSILON)) {
      if (state.value.abs().greaterThan(COSTING_EPSILON)) {
        costingIntegrityError(
          `movement ${movement.id} leaves ${state.value.toFixed(DECIMAL_PLACES)} value with zero stock; post a purchase-cost variance instead`,
        );
      }
      state.quantity = decimal(0);
      state.value = decimal(0);
      state.averageCost = decimal(0);
    } else if (state.quantity.isNegative()) {
      // Stock has run temporarily negative under an ALLOW_NEGATIVE policy (a
      // delivery posted before its matching receipt catches up). value/quantity
      // is not a meaningful ratio while quantity itself is negative — dividing
      // here would silently invert the cost and corrupt every movement layered
      // on top until someone noticed. Freeze the average cost at its last valid
      // value instead; unitCost above already draws from this same frozen
      // value, so every movement during the shortfall keeps using it
      // consistently, and the ordinary recompute below resumes automatically
      // the moment a later receipt brings the balance back to zero or positive.
    } else {
      if (state.value.lessThan(COSTING_EPSILON.negated())) {
        costingIntegrityError(
          `movement ${movement.id} makes inventory value negative (${state.value.toFixed(DECIMAL_PLACES)})`,
        );
      }
      if (state.value.abs().lessThanOrEqualTo(COSTING_EPSILON)) state.value = decimal(0);
      state.averageCost = roundCost(state.value.div(state.quantity));
    }
    if (unitCost.isPositive() && !state.quantity.isNegative()) state.lastUnitCost = unitCost;

    const row: CostedMovement = {
      ...movement,
      unitCost: unitCost.toNumber(),
      movementValue: movementValue.toNumber(),
      balanceQuantity: state.quantity.toNumber(),
      balanceValue: state.value.toNumber(),
      averageCost: state.averageCost.toNumber(),
    };
    calculated.push(row);
    calculatedById.set(movement.id, row);
    states.set(key, state);

    if (movement.transactionType === "STOCK_TRANSFER_OUT") transferCosts.set(transferKey(movement), row.unitCost);
  }

  const balances = new Map<string, MovingAverageBalance>();
  for (const [key, state] of states) {
    const separator = key.indexOf(":");
    balances.set(key, {
      warehouseId: key.slice(0, separator),
      inventoryItemId: key.slice(separator + 1),
      quantity: state.quantity.toNumber(),
      value: state.value.toNumber(),
      averageCost: state.averageCost.toNumber(),
    });
  }
  return { movements: calculated, balances };
}

export const MOVING_AVERAGE_COSTING_VERSION = 2;

type PersistedMovingAverageMovement = Omit<
  MovingAverageMovement,
  "quantity" | "inputUnitCost" | "costingVersion"
> & {
  quantity: Prisma.Decimal.Value;
  inputUnitCost: Prisma.Decimal.Value | null;
  costingVersion: number;
  unitCost: Prisma.Decimal.Value;
  movementValue: Prisma.Decimal.Value;
  balanceQuantity: Prisma.Decimal.Value;
  balanceValue: Prisma.Decimal.Value;
  averageCost: Prisma.Decimal.Value;
};

function persistedMovingAverageValuation(
  movements: PersistedMovingAverageMovement[],
  allowNegativeStock: boolean,
) {
  const costedMovements = movements.map((movement) => ({
    ...movement,
    movementType: movement.movementType,
    quantity: Number(movement.quantity),
    inputUnitCost:
      movement.inputUnitCost == null ? null : Number(movement.inputUnitCost),
    unitCost: Number(movement.unitCost),
    movementValue: Number(movement.movementValue),
    balanceQuantity: Number(movement.balanceQuantity),
    balanceValue: Number(movement.balanceValue),
    averageCost: Number(movement.averageCost),
  })) satisfies CostedMovement[];
  const balances = new Map<string, MovingAverageBalance>();
  for (const movement of costedMovements) {
    balances.set(balanceKey(movement), {
      warehouseId: movement.warehouseId,
      inventoryItemId: movement.inventoryItemId,
      quantity: movement.balanceQuantity,
      value: movement.balanceValue,
      averageCost: movement.averageCost,
    });
  }
  assertPersistedCostingIntegrity(costedMovements, allowNegativeStock);
  return { movements: costedMovements, balances };
}

/**
 * Returns the already-posted moving-average audit trail without repairing or
 * reconciling it. Read endpoints must never recost stock or create GL journals.
 * Posting/startup maintenance owns stale-version repair; a read fails clearly
 * instead of silently changing accounting state.
 */
export async function readMovingAverageCosts(
  db: Prisma.TransactionClient,
  workspaceId: string,
  inventoryItemIds?: string[],
) {
  await assertMovingAverageCostingMethod(db, workspaceId);
  const allowNegativeStock = await resolveNegativeStockPolicy(db, workspaceId);
  const uniqueItemIds = inventoryItemIds
    ? [...new Set(inventoryItemIds.filter(Boolean))]
    : undefined;
  if (uniqueItemIds && uniqueItemIds.length === 0) {
    return calculateMovingAverage([]);
  }
  const movements = await db.stockMovement.findMany({
    where: {
      workspaceId,
      voidedAt: null,
      ...(uniqueItemIds
        ? { inventoryItemId: { in: uniqueItemIds } }
        : {}),
    },
    orderBy: [
      { transactionDate: "asc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
  const staleMovement = movements.find(
    (movement) =>
      movement.costingVersion !== MOVING_AVERAGE_COSTING_VERSION,
  );
  if (staleMovement) {
    throw new ConflictException(
      "Inventory costing is pending reconciliation. Complete the controlled inventory repair before viewing valuation reports.",
    );
  }
  return persistedMovingAverageValuation(movements, allowNegativeStock);
}

const ACQUISITION_TRANSACTION_TYPES = new Set(["PURCHASE", "BILL", "RECEIPT_NOTE"]);
const OPENING_TRANSACTION_TYPES = new Set(["OPENING_STOCK", "OPENING_STOCK_ADJUSTMENT", "MIGRATION_OPENING"]);
const RETURN_TRANSACTION_TYPES = new Set(["CREDIT_NOTE", "DEBIT_NOTE"]);
// A sales return restores the original issue cost. A purchase return relieves
// inventory at the current warehouse MWA; its supplier refund remains on the
// voucher, so any price difference never distorts or strands stock value.
const EXACT_RETURN_COST_TRANSACTION_TYPES = new Set(["CREDIT_NOTE"]);

function assertPersistedCostingIntegrity(movements: CostedMovement[], allowNegativeStock = false) {
  for (const movement of movements) {
    const quantity = decimal(movement.balanceQuantity);
    const value = decimal(movement.balanceValue);
    if (!allowNegativeStock && quantity.lessThan(COSTING_EPSILON.negated())) {
      costingIntegrityError(
        `movement ${movement.id} has negative historical warehouse stock (${quantity.toFixed(DECIMAL_PLACES)})`,
      );
    }
    if (quantity.abs().lessThanOrEqualTo(COSTING_EPSILON) && value.abs().greaterThan(COSTING_EPSILON)) {
      costingIntegrityError(
        `movement ${movement.id} has ${value.toFixed(DECIMAL_PLACES)} value with zero stock`,
      );
    }
    if (quantity.isPositive() && value.lessThan(COSTING_EPSILON.negated())) {
      costingIntegrityError(`movement ${movement.id} has negative inventory value (${value.toFixed(DECIMAL_PLACES)})`);
    }
  }
}

async function lockWorkspaceCostingReplay(db: Prisma.TransactionClient, workspaceId: string) {
  // Every stock mutation rebuilds before commit. A transaction-level advisory
  // lock serializes those replays, preventing two concurrent adjustments from
  // both marking mutually unseen histories as current. The optional shape is
  // only for lightweight unit-test doubles; a real Prisma transaction always
  // exposes $queryRaw.
  // pg_advisory_xact_lock() returns void, which $queryRaw cannot deserialize
  // ("Failed to deserialize column of type 'void'") — $executeRaw only needs
  // the affected-row count, so it never attempts to decode the column.
  const lockClient = db as unknown as { $executeRaw?: (query: Prisma.Sql) => Promise<unknown> };
  if (typeof lockClient.$executeRaw === "function") {
    await lockClient.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-mwa:${workspaceId}`}, 0))`,
    );
  }
}

/**
 * The current runtime implements one costing engine only. Reading the company
 * setting here keeps every caller (posting, reports, masters and bootstrap)
 * from silently applying MWA to data configured for a different method.
 */
export async function assertMovingAverageCostingMethod(db: Prisma.TransactionClient, workspaceId: string) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { companyId: true } });
  if (!workspace) throw new BadRequestException("Inventory workspace was not found");
  const settings = await db.accountingSettings.findUnique({
    where: { companyId: workspace.companyId },
    select: { costingMethod: true },
  });
  const configuredMethod = settings?.costingMethod ?? CostingMethod.MOVING_WEIGHTED_AVERAGE;
  if (configuredMethod !== CostingMethod.MOVING_WEIGHTED_AVERAGE) {
    throw new BadRequestException(
      `Costing method ${configuredMethod} is not supported by this inventory runtime. Select Moving Weighted Average first.`,
    );
  }
}

/**
 * Whether this company has opted in to letting a warehouse's stock run
 * temporarily negative (e.g. a delivery posted before its matching receipt
 * catches up) instead of rejecting the posting outright. Shared by the
 * costing replay below and by inventory.service.ts's own pre-check so both
 * agree on the same answer.
 */
export async function resolveNegativeStockPolicy(db: Prisma.TransactionClient, workspaceId: string) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { companyId: true } });
  if (!workspace) return false;
  const settings = await db.accountingSettings.findUnique({
    where: { companyId: workspace.companyId },
    select: { negativeStockPolicy: true },
  });
  return settings?.negativeStockPolicy === "ALLOW_NEGATIVE";
}

/** Rebuilds affected item histories so backdated postings update every later cost. */
export async function rebuildMovingAverageCosts(db: Prisma.TransactionClient, workspaceId: string, inventoryItemIds?: string[]) {
  await assertMovingAverageCostingMethod(db, workspaceId);
  const allowNegativeStock = await resolveNegativeStockPolicy(db, workspaceId);
  const uniqueItemIds = inventoryItemIds ? [...new Set(inventoryItemIds.filter(Boolean))] : undefined;
  if (uniqueItemIds && uniqueItemIds.length === 0) return calculateMovingAverage([]);

  const loadMovements = () => db.stockMovement.findMany({
    where: { workspaceId, voidedAt: null, ...(uniqueItemIds ? { inventoryItemId: { in: uniqueItemIds } } : {}) },
    orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  let movements = await loadMovements();
  if (movements.length === 0) return calculateMovingAverage([]);

  if (movements.some((movement) => movement.costingVersion !== MOVING_AVERAGE_COSTING_VERSION)) {
    await lockWorkspaceCostingReplay(db, workspaceId);
    // Under READ COMMITTED this second read includes any costing mutation that
    // committed while we waited for the lock. Serializable callers may instead
    // receive a retryable serialization failure, but can never commit a stale
    // all-version-current history.
    movements = await loadMovements();
  }

  // Posted mutations mark their new/changed movement at version 0 and replay
  // before commit.  Once every row is current, report reads can use the
  // persisted audit trail without recosting or writing during a GET request.
  if (movements.every((movement) => movement.costingVersion === MOVING_AVERAGE_COSTING_VERSION)) {
    return persistedMovingAverageValuation(movements, allowNegativeStock);
  }

  const transactionIds = [...new Set(movements.map((movement) => movement.transactionId))];
  const itemIds = [...new Set(movements.map((movement) => movement.inventoryItemId))];
  const [voucherLines, adjustments, items, revaluations] = await Promise.all([
    db.voucherInventoryItem.findMany({
      where: { voucher: { workspaceId } },
      select: {
        id: true,
        voucherId: true,
        inventoryItemId: true,
        warehouseId: true,
        itemName: true,
        quantity: true,
        unitPrice: true,
        sourceInventoryLineId: true,
        createdAt: true,
        voucher: { select: { sourceVoucherId: true, discountAmount: true } },
      },
    }),
    db.inventoryAdjustment.findMany({ where: { id: { in: transactionIds } }, select: { id: true, unitPrice: true } }),
    db.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, openingRate: true } }),
    db.inventoryCostRevaluation.findMany({
      where: {
        workspaceId,
        isActive: true,
        ...(uniqueItemIds ? { inventoryItemId: { in: uniqueItemIds } } : {}),
      },
      select: {
        id: true,
        sourceMovementId: true,
        billingInventoryLineId: true,
        quantity: true,
        revisedUnitCost: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const voucherLineById = new Map(voucherLines.map((line) => [line.id, line]));
  const voucherLinesByVoucherId = new Map<string, typeof voucherLines>();
  for (const line of voucherLines) {
    voucherLinesByVoucherId.set(line.voucherId, [...(voucherLinesByVoucherId.get(line.voucherId) ?? []), line]);
  }
  for (const lines of voucherLinesByVoucherId.values()) {
    lines.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));
  }
  const inferredSourceLineById = new Map<string, string>();
  const ambiguousSourceLineIds = new Set<string>();
  for (const lines of voucherLinesByVoucherId.values()) {
    const sourceVoucherId = lines[0]?.voucher.sourceVoucherId;
    if (!sourceVoucherId) continue;
    const sourceLines = voucherLinesByVoucherId.get(sourceVoucherId) ?? [];
    for (const line of lines) {
      if (line.sourceInventoryLineId) continue;
      const sameItem = sourceLines.filter((candidate) =>
        line.inventoryItemId && candidate.inventoryItemId
          ? line.inventoryItemId === candidate.inventoryItemId
          : line.itemName.trim().toLowerCase() === candidate.itemName.trim().toLowerCase(),
      );
      const sameWarehouse = line.warehouseId
        ? sameItem.filter((candidate) => candidate.warehouseId === line.warehouseId)
        : sameItem;
      const candidates = sameWarehouse.length ? sameWarehouse : sameItem;
      if (candidates.length === 1) inferredSourceLineById.set(line.id, candidates[0].id);
      else if (candidates.length > 1) ambiguousSourceLineIds.add(line.id);
    }
  }
  const acquisitionFactorByVoucherId = new Map<string, number>();
  for (const [voucherId, lines] of voucherLinesByVoucherId) {
    const gross = lines.reduce((sum, line) => sum.add(decimal(line.quantity).mul(decimal(line.unitPrice))), decimal(0));
    const discount = decimal(lines[0]?.voucher.discountAmount);
    const factor = gross.isPositive()
      ? Prisma.Decimal.max(decimal(0), gross.sub(discount)).div(gross)
      : decimal(1);
    acquisitionFactorByVoucherId.set(voucherId, factor.toNumber());
  }
  // Reversals deliberately retain the original transactionLineId.  A plain
  // Map over every movement would therefore let a later reversal replace the
  // physical source row and make a return fall back to the then-current
  // average.  Source documents must always resolve to the original movement.
  const movementByLineId = new Map(
    movements
      .filter((movement) => !movement.reversalOfId)
      .map((movement) => [movement.transactionLineId, movement]),
  );
  const adjustmentRateById = new Map(adjustments.map((adjustment) => [adjustment.id, Number(adjustment.unitPrice)]));
  const openingRateByItem = new Map(items.map((item) => [item.id, Number(item.openingRate)]));
  const revaluationsBySourceMovement = new Map<string, typeof revaluations>();
  const revaluationsByBillingLine = new Map<string, typeof revaluations>();
  for (const revaluation of revaluations) {
    revaluationsBySourceMovement.set(
      revaluation.sourceMovementId,
      [...(revaluationsBySourceMovement.get(revaluation.sourceMovementId) ?? []), revaluation],
    );
    revaluationsByBillingLine.set(
      revaluation.billingInventoryLineId,
      [...(revaluationsByBillingLine.get(revaluation.billingInventoryLineId) ?? []), revaluation],
    );
  }
  const revisedUnitCostByBillingLine = new Map<string, number>();
  for (const [billingLineId, billingLineRevaluations] of revaluationsByBillingLine) {
    const firstRate = decimal(billingLineRevaluations[0]?.revisedUnitCost);
    if (billingLineRevaluations.some((revaluation) => decimal(revaluation.revisedUnitCost).sub(firstRate).abs().greaterThan(COSTING_EPSILON))) {
      costingIntegrityError(`billing inventory line ${billingLineId} has inconsistent revised unit costs`);
    }
    revisedUnitCostByBillingLine.set(billingLineId, firstRate.toNumber());
  }
  for (const [sourceMovementId, sourceRevaluations] of revaluationsBySourceMovement) {
    const sourceMovement = movements.find((movement) => movement.id === sourceMovementId);
    if (!sourceMovement) {
      throw new BadRequestException(`Inventory revaluation ${sourceRevaluations[0]?.id ?? ""} has no active source movement`);
    }
    const revaluedQuantity = sourceRevaluations.reduce(
      (total, revaluation) => total.add(decimal(revaluation.quantity)),
      decimal(0),
    );
    if (revaluedQuantity.greaterThan(decimal(sourceMovement.quantity).abs().add(COSTING_EPSILON))) {
      throw new BadRequestException("Purchase Bills exceed the quantity received on their source Receipt Note line");
    }
  }

  const sourceLineIdFor = (lineId: string) => {
    if (ambiguousSourceLineIds.has(lineId)) {
      costingIntegrityError(`inventory line ${lineId} has multiple possible source lines; select the exact source line`);
    }
    return voucherLineById.get(lineId)?.sourceInventoryLineId ?? inferredSourceLineById.get(lineId) ?? null;
  };

  const findCostSourceMovementId = (movement: typeof movements[number]) => {
    if (!RETURN_TRANSACTION_TYPES.has(movement.transactionType)) return null;
    const line = voucherLineById.get(movement.transactionLineId);
    let sourceLineId = sourceLineIdFor(movement.transactionLineId);
    if (!sourceLineId) {
      if (line?.voucher.sourceVoucherId) {
        costingIntegrityError(`return line ${movement.transactionLineId} cannot resolve its source document line`);
      }
      // Preserve explicitly supported legacy standalone debit/credit notes.
      return null;
    }
    const visited = new Set<string>();
    while (sourceLineId && !visited.has(sourceLineId)) {
      visited.add(sourceLineId);
      const sourceMovement = movementByLineId.get(sourceLineId);
      if (sourceMovement) return sourceMovement.id;
      if (!voucherLineById.has(sourceLineId)) {
        costingIntegrityError(`return line ${movement.transactionLineId} references missing source line ${sourceLineId}`);
      }
      sourceLineId = sourceLineIdFor(sourceLineId);
    }
    if (sourceLineId) costingIntegrityError(`inventory source lineage contains a cycle at line ${sourceLineId}`);
    return costingIntegrityError(`return line ${movement.transactionLineId} has no active physical source movement`);
  };

  const findExactSourceUnitCost = (movement: typeof movements[number]) => {
    if (!EXACT_RETURN_COST_TRANSACTION_TYPES.has(movement.transactionType)) return null;
    let sourceLineId = sourceLineIdFor(movement.transactionLineId);
    const visited = new Set<string>();
    while (sourceLineId && !visited.has(sourceLineId)) {
      visited.add(sourceLineId);
      const revisedUnitCost = revisedUnitCostByBillingLine.get(sourceLineId);
      if (revisedUnitCost !== undefined) return revisedUnitCost;
      if (movementByLineId.has(sourceLineId)) return null;
      sourceLineId = sourceLineIdFor(sourceLineId);
    }
    return null;
  };

  const persistedInputUnitCostByMovementId = new Map<string, number | null>();
  const replayInput = movements.map((movement) => {
    let inputUnitCost = movement.inputUnitCost == null ? null : Number(movement.inputUnitCost);
    if (ACQUISITION_TRANSACTION_TYPES.has(movement.transactionType) && (movement.costingVersion ?? 0) < MOVING_AVERAGE_COSTING_VERSION) {
      const sourceLine = voucherLineById.get(movement.transactionLineId);
      inputUnitCost = sourceLine
        ? Number(sourceLine.unitPrice) * (acquisitionFactorByVoucherId.get(sourceLine.voucherId) ?? 1)
        : inputUnitCost;
    }
    if (inputUnitCost === null && movement.movementType === "IN") {
      if (ACQUISITION_TRANSACTION_TYPES.has(movement.transactionType)) {
        const sourceLine = voucherLineById.get(movement.transactionLineId);
        inputUnitCost = sourceLine ? Number(sourceLine.unitPrice) : null;
      } else if (movement.transactionType === "STOCK_ADJUSTMENT") {
        inputUnitCost = adjustmentRateById.get(movement.transactionId) ?? null;
      } else if (OPENING_TRANSACTION_TYPES.has(movement.transactionType)) {
        inputUnitCost = openingRateByItem.get(movement.inventoryItemId) ?? null;
      }
    }
    persistedInputUnitCostByMovementId.set(movement.id, inputUnitCost);

    const sourceRevaluations = revaluationsBySourceMovement.get(movement.id) ?? [];
    if (sourceRevaluations.length && movement.movementType === "IN") {
      const sourceQuantity = decimal(movement.quantity).abs();
      const revaluedQuantity = sourceRevaluations.reduce(
        (total, revaluation) => total.add(decimal(revaluation.quantity)),
        decimal(0),
      );
      const unrevaluedQuantity = Prisma.Decimal.max(decimal(0), sourceQuantity.sub(revaluedQuantity));
      const baseUnitCost = nonNegativeDecimal(inputUnitCost);
      const revisedValue = sourceRevaluations.reduce(
        (total, revaluation) => total.add(decimal(revaluation.quantity).mul(decimal(revaluation.revisedUnitCost))),
        unrevaluedQuantity.mul(baseUnitCost),
      );
      inputUnitCost = sourceQuantity.isPositive()
        ? roundCost(revisedValue.div(sourceQuantity)).toNumber()
        : baseUnitCost.toNumber();
    }

    const sourceMovementId = findCostSourceMovementId(movement);
    return {
      ...movement,
      movementType: movement.movementType,
      quantity: Number(movement.quantity),
      inputUnitCost,
      costSourceMovementId: EXACT_RETURN_COST_TRANSACTION_TYPES.has(movement.transactionType)
        ? sourceMovementId
        : null,
      exactSourceUnitCost: findExactSourceUnitCost(movement),
    } satisfies MovingAverageMovement;
  });

  const result = calculateMovingAverage(replayInput, allowNegativeStock);
  for (const movement of result.movements) {
    await db.stockMovement.update({
      where: { id: movement.id },
      data: {
        // Revaluation changes the effective replay rate, not the original GRN
        // rate. Retaining that provisional source rate makes later/partial bills
        // deterministic instead of compounding an earlier overlay.
        inputUnitCost: persistedInputUnitCostByMovementId.has(movement.id)
          ? persistedInputUnitCostByMovementId.get(movement.id)
          : movement.inputUnitCost,
        unitCost: movement.unitCost,
        movementValue: movement.movementValue,
        balanceQuantity: movement.balanceQuantity,
        balanceValue: movement.balanceValue,
        averageCost: movement.averageCost,
        costingVersion: MOVING_AVERAGE_COSTING_VERSION,
      },
    });
  }
  return result;
}
