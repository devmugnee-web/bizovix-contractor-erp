import { Prisma } from "../generated/prisma/index.js";
import { toPaisa } from "../accounting/money.util.js";

/**
 * Pure manufacturing rules shared by controllers/services and tests.
 *
 * This module deliberately has no Prisma client, repository, clock or network
 * dependency. Quantities and MWA rates remain Decimal; only postable money is
 * converted to integer paisa. A caller can therefore validate a command before
 * opening its stock/accounting transaction and repeat the same validation
 * inside that transaction without getting a different rounding result.
 */

export type DomainNumber = Prisma.Decimal | number | string;

export type ManufacturingWipTransactionInput = {
  status: string;
  transactionType: string;
  lines?: Array<{
    inventoryItemId: string;
    orderMaterialId?: string | null;
    stockMovements?: Array<{
      warehouseId: string;
      movementType: "IN" | "OUT" | string;
      quantity: DomainNumber;
      movementValue: DomainNumber;
      voidedAt?: Date | string | null;
    }>;
  }>;
};

export function calculateManufacturingWipBalance(
  transactions: ManufacturingWipTransactionInput[],
  wipWarehouseId: string,
) {
  const balances = new Map<
    string,
    { quantity: Prisma.Decimal; value: Prisma.Decimal }
  >();
  const add = (
    itemKey: string,
    quantity: Prisma.Decimal,
    value: Prisma.Decimal,
  ) => {
    const current = balances.get(itemKey) ?? { quantity: ZERO, value: ZERO };
    balances.set(itemKey, {
      quantity: current.quantity.add(quantity),
      value: current.value.add(value),
    });
  };

  for (const transaction of transactions) {
    if (transaction.status !== "POSTED") continue;
    const isIssue =
      transaction.transactionType === "MATERIAL_ISSUE" ||
      transaction.transactionType === "PACKAGING_ISSUE";
    const isReturn =
      transaction.transactionType === "MATERIAL_RETURN" ||
      transaction.transactionType === "PACKAGING_RETURN";
    const isReceipt = transaction.transactionType === "PRODUCTION_RECEIPT";
    if (!isIssue && !isReturn && !isReceipt) continue;
    for (const line of transaction.lines ?? []) {
      if (isReceipt && !line.orderMaterialId) continue;
      for (const movement of line.stockMovements ?? []) {
        if (movement.voidedAt || movement.warehouseId !== wipWarehouseId)
          continue;
        const entersWip = isIssue && movement.movementType === "IN";
        const leavesWip =
          (isReturn || isReceipt) && movement.movementType === "OUT";
        if (!entersWip && !leavesWip) continue;
        const direction = entersWip
          ? new Prisma.Decimal(1)
          : new Prisma.Decimal(-1);
        add(
          line.inventoryItemId,
          decimal(movement.quantity, "movement.quantity").mul(direction),
          decimal(movement.movementValue, "movement.movementValue").mul(
            direction,
          ),
        );
      }
    }
  }

  return [...balances.values()].reduce(
    (total, row) => ({
      quantity: total.quantity.add(row.quantity.abs()),
      value: total.value.add(row.value.abs()),
    }),
    { quantity: ZERO, value: ZERO },
  );
}

export type LotQualityInspectionInput = {
  id: string;
  orderLotId?: string | null;
  inspectionType: string;
  serialId?: string | null;
  status: string;
  sampleQuantity: DomainNumber;
  acceptedQuantity: DomainNumber;
  rejectedQuantity: DomainNumber;
  inspectedByUserId?: string | null;
  approvedByUserId?: string | null;
  inspectedAt?: Date | string | null;
  createdAt: Date | string;
};

export function findUnallocatedLotTrackedReservationMaterials(
  materials: Array<{
    itemName: string;
    lotTracked: boolean;
    plannedQuantity: DomainNumber;
    issuedQuantity: DomainNumber;
    reservedQuantity: DomainNumber;
  }>,
) {
  return materials
    .filter(
      (material) =>
        material.lotTracked &&
        decimal(material.plannedQuantity, "plannedQuantity")
          .sub(decimal(material.issuedQuantity, "issuedQuantity"))
          .sub(decimal(material.reservedQuantity, "reservedQuantity"))
          .greaterThan(0),
    )
    .map((material) => material.itemName);
}

export function summarizeLotQualityInspections(
  inspections: LotQualityInspectionInput[],
  orderLotId: string,
) {
  const eligible = inspections.filter(
    (row) =>
      row.orderLotId === orderLotId && row.inspectionType === "FINISHED_GOOD",
  );
  const byTime = (
    left: LotQualityInspectionInput,
    right: LotQualityInspectionInput,
  ) =>
    new Date(left.inspectedAt ?? left.createdAt).getTime() -
    new Date(right.inspectedAt ?? right.createdAt).getTime();
  const aggregate = eligible
    .filter((row) => !row.serialId)
    .sort(byTime)
    .at(-1);

  const latestBySerial = new Map<string, LotQualityInspectionInput>();
  for (const row of eligible
    .filter((entry) => Boolean(entry.serialId))
    .sort(byTime))
    latestBySerial.set(row.serialId!, row);
  const serialRows = [...latestBySerial.values()];
  const latestSerial = serialRows.sort(byTime).at(-1);
  if (aggregate && (!latestSerial || byTime(latestSerial, aggregate) <= 0))
    return aggregate;
  if (!serialRows.length) return undefined;
  return {
    id: `serial-summary:${orderLotId}`,
    orderLotId,
    inspectionType: "FINISHED_GOOD",
    serialId: null,
    status: serialRows.every((row) => row.status === "PASSED")
      ? "PASSED"
      : serialRows.some((row) => row.status === "FAILED")
        ? "FAILED"
        : "HOLD",
    sampleQuantity: serialRows.reduce(
      (total, row) => total.add(decimal(row.sampleQuantity, "sampleQuantity")),
      ZERO,
    ),
    acceptedQuantity: serialRows.reduce(
      (total, row) =>
        total.add(decimal(row.acceptedQuantity, "acceptedQuantity")),
      ZERO,
    ),
    rejectedQuantity: serialRows.reduce(
      (total, row) =>
        total.add(decimal(row.rejectedQuantity, "rejectedQuantity")),
      ZERO,
    ),
    inspectedAt: serialRows
      .map((row) => row.inspectedAt ?? row.createdAt)
      .sort()
      .at(-1)!,
    createdAt: serialRows
      .map((row) => row.createdAt)
      .sort()
      .at(-1)!,
  };
}

export interface DomainIssue {
  code: string;
  message: string;
  path?: string;
}

export class ManufacturingDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly issues: DomainIssue[] = [],
  ) {
    super(message);
    this.name = "ManufacturingDomainError";
  }
}

const ZERO = new Prisma.Decimal(0);
const ONE_HUNDRED = new Prisma.Decimal(100);

function decimal(value: DomainNumber, path: string): Prisma.Decimal {
  let result: Prisma.Decimal;
  try {
    result =
      value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  } catch {
    throw new ManufacturingDomainError(
      "INVALID_NUMBER",
      `${path} must be a finite number.`,
    );
  }
  if (!result.isFinite()) {
    throw new ManufacturingDomainError(
      "INVALID_NUMBER",
      `${path} must be a finite number.`,
    );
  }
  return result;
}

function nonNegative(value: DomainNumber, path: string): Prisma.Decimal {
  const result = decimal(value, path);
  if (result.lessThan(0)) {
    throw new ManufacturingDomainError(
      "NEGATIVE_VALUE",
      `${path} cannot be negative.`,
    );
  }
  return result;
}

function positive(value: DomainNumber, path: string): Prisma.Decimal {
  const result = decimal(value, path);
  if (result.lessThanOrEqualTo(0)) {
    throw new ManufacturingDomainError(
      "NON_POSITIVE_VALUE",
      `${path} must be greater than zero.`,
    );
  }
  return result;
}

function nonBlank(value: string, path: string): string {
  const result = value.trim();
  if (!result)
    throw new ManufacturingDomainError(
      "BLANK_IDENTIFIER",
      `${path} is required.`,
    );
  return result;
}

function maxZero(value: Prisma.Decimal): Prisma.Decimal {
  return value.lessThan(0) ? ZERO : value;
}

function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.add(value), ZERO);
}

export function paisaToDecimal(value: bigint): Prisma.Decimal {
  return new Prisma.Decimal(value.toString()).dividedBy(100);
}

export function paisaToNumber(value: bigint): number {
  return paisaToDecimal(value).toNumber();
}

export interface BomMaterialLineInput {
  materialId: string;
  quantityPerOutput: DomainNumber;
  wastagePercent?: DomainNumber;
  unit?: string;
}

export interface MaterialLotFlowInput {
  materialId: string;
  inventoryLotId?: string | null;
  direction: "ISSUE" | "RETURN";
  quantity: DomainNumber;
}

export interface NetMaterialLotConsumption {
  materialId: string;
  inventoryLotId: string | null;
  quantity: Prisma.Decimal;
}

/**
 * Reconciles lot-wise issues and returns without losing the source-lot link.
 * The result is suitable for finished-goods genealogy and guarantees that a
 * return can never make the net consumption for a material lot negative.
 */
export function calculateNetMaterialLotConsumption(
  flows: MaterialLotFlowInput[],
): NetMaterialLotConsumption[] {
  const order: string[] = [];
  const balances = new Map<string, NetMaterialLotConsumption>();

  flows.forEach((flow, index) => {
    const materialId = nonBlank(flow.materialId, `flows[${index}].materialId`);
    const inventoryLotId = flow.inventoryLotId?.trim() || null;
    const quantity = nonNegative(flow.quantity, `flows[${index}].quantity`);
    const key = JSON.stringify([materialId, inventoryLotId]);
    const current = balances.get(key) ?? {
      materialId,
      inventoryLotId,
      quantity: ZERO,
    };
    if (!balances.has(key)) order.push(key);
    current.quantity =
      flow.direction === "ISSUE"
        ? current.quantity.add(quantity)
        : current.quantity.sub(quantity);
    balances.set(key, current);
  });

  for (const row of balances.values()) {
    if (row.quantity.lessThan(0)) {
      throw new ManufacturingDomainError(
        "MATERIAL_LOT_RETURN_EXCEEDS_ISSUE",
        `Returned quantity exceeds issued quantity for material ${row.materialId}${row.inventoryLotId ? ` lot ${row.inventoryLotId}` : ""}.`,
      );
    }
  }

  return order
    .map((key) => balances.get(key)!)
    .filter((row) => row.quantity.greaterThan(0));
}

export interface BomRequirement {
  materialId: string;
  unit?: string;
  baseQuantity: Prisma.Decimal;
  wastageQuantity: Prisma.Decimal;
  requiredQuantity: Prisma.Decimal;
}

/** Aggregates duplicate material lines while retaining their individual wastage. */
export function calculateBomRequirements(
  lines: BomMaterialLineInput[],
  plannedOutputQuantity: DomainNumber,
): BomRequirement[] {
  const planned = positive(plannedOutputQuantity, "plannedOutputQuantity");
  if (lines.length === 0) {
    throw new ManufacturingDomainError(
      "EMPTY_BOM",
      "At least one BOM material line is required.",
    );
  }

  const order: string[] = [];
  const requirements = new Map<string, BomRequirement>();
  lines.forEach((line, index) => {
    const materialId = nonBlank(line.materialId, `lines[${index}].materialId`);
    const perOutput = positive(
      line.quantityPerOutput,
      `lines[${index}].quantityPerOutput`,
    );
    const wastagePercent = nonNegative(
      line.wastagePercent ?? 0,
      `lines[${index}].wastagePercent`,
    );
    const unit = line.unit?.trim() || undefined;
    const baseQuantity = perOutput.mul(planned);
    const wastageQuantity = baseQuantity
      .mul(wastagePercent)
      .dividedBy(ONE_HUNDRED);
    const existing = requirements.get(materialId);

    if (!existing) {
      order.push(materialId);
      requirements.set(materialId, {
        materialId,
        unit,
        baseQuantity,
        wastageQuantity,
        requiredQuantity: baseQuantity.add(wastageQuantity),
      });
      return;
    }

    if (
      existing.unit &&
      unit &&
      existing.unit.toLowerCase() !== unit.toLowerCase()
    ) {
      throw new ManufacturingDomainError(
        "BOM_UNIT_MISMATCH",
        `Material ${materialId} uses conflicting BOM units (${existing.unit} and ${unit}).`,
      );
    }
    existing.unit ??= unit;
    existing.baseQuantity = existing.baseQuantity.add(baseQuantity);
    existing.wastageQuantity = existing.wastageQuantity.add(wastageQuantity);
    existing.requiredQuantity = existing.requiredQuantity
      .add(baseQuantity)
      .add(wastageQuantity);
  });

  return order.map((materialId) => requirements.get(materialId)!);
}

export interface MaterialAvailabilityInput {
  materialId: string;
  onHandQuantity: DomainNumber;
  reservedQuantity?: DomainNumber;
}

export interface MaterialCapacity {
  materialId: string;
  requiredPerOutput: Prisma.Decimal;
  onHandQuantity: Prisma.Decimal;
  reservedQuantity: Prisma.Decimal;
  availableQuantity: Prisma.Decimal;
  overReservedQuantity: Prisma.Decimal;
  producibleQuantity: Prisma.Decimal;
}

export interface MaxProducibleResult {
  maxProducibleQuantity: Prisma.Decimal;
  bottleneckMaterialIds: string[];
  capacities: MaterialCapacity[];
}

export function calculateMaxProducible(
  bomLines: BomMaterialLineInput[],
  availability: MaterialAvailabilityInput[],
): MaxProducibleResult {
  const perOutput = calculateBomRequirements(bomLines, 1);
  const availabilityByMaterial = new Map<
    string,
    { onHand: Prisma.Decimal; reserved: Prisma.Decimal }
  >();

  availability.forEach((row, index) => {
    const materialId = nonBlank(
      row.materialId,
      `availability[${index}].materialId`,
    );
    if (availabilityByMaterial.has(materialId)) {
      throw new ManufacturingDomainError(
        "DUPLICATE_AVAILABILITY",
        `Material ${materialId} appears more than once in availability.`,
      );
    }
    availabilityByMaterial.set(materialId, {
      onHand: nonNegative(
        row.onHandQuantity,
        `availability[${index}].onHandQuantity`,
      ),
      reserved: nonNegative(
        row.reservedQuantity ?? 0,
        `availability[${index}].reservedQuantity`,
      ),
    });
  });

  const capacities = perOutput.map<MaterialCapacity>((requirement) => {
    const stock = availabilityByMaterial.get(requirement.materialId) ?? {
      onHand: ZERO,
      reserved: ZERO,
    };
    const rawAvailable = stock.onHand.sub(stock.reserved);
    const availableQuantity = maxZero(rawAvailable);
    return {
      materialId: requirement.materialId,
      requiredPerOutput: requirement.requiredQuantity,
      onHandQuantity: stock.onHand,
      reservedQuantity: stock.reserved,
      availableQuantity,
      overReservedQuantity: maxZero(rawAvailable.negated()),
      producibleQuantity: availableQuantity
        .dividedBy(requirement.requiredQuantity)
        .floor(),
    };
  });

  const maxProducibleQuantity = capacities.reduce(
    (minimum, row) =>
      row.producibleQuantity.lessThan(minimum)
        ? row.producibleQuantity
        : minimum,
    capacities[0].producibleQuantity,
  );
  return {
    maxProducibleQuantity,
    bottleneckMaterialIds: capacities
      .filter((row) => row.producibleQuantity.equals(maxProducibleQuantity))
      .map((row) => row.materialId),
    capacities,
  };
}

export interface ReservationAvailabilityInput {
  onHandQuantity: DomainNumber;
  totalReservedQuantity: DomainNumber;
  currentOrderReservedQuantity?: DomainNumber;
  requestedOrderQuantity: DomainNumber;
}

export interface ReservationAvailabilityResult {
  canReserve: boolean;
  reservedByOtherOrders: Prisma.Decimal;
  availableForOrder: Prisma.Decimal;
  existingOrderReservation: Prisma.Decimal;
  additionalQuantityRequired: Prisma.Decimal;
  projectedAvailableQuantity: Prisma.Decimal;
  shortfallQuantity: Prisma.Decimal;
  currentOverReservationQuantity: Prisma.Decimal;
  projectedOverReservationQuantity: Prisma.Decimal;
}

/**
 * Evaluates a desired total reservation, not merely its incremental change.
 * This makes create and edit commands use the same calculation.
 */
export function evaluateReservationAvailability(
  input: ReservationAvailabilityInput,
): ReservationAvailabilityResult {
  const onHand = nonNegative(input.onHandQuantity, "onHandQuantity");
  const totalReserved = nonNegative(
    input.totalReservedQuantity,
    "totalReservedQuantity",
  );
  const currentOrderReserved = nonNegative(
    input.currentOrderReservedQuantity ?? 0,
    "currentOrderReservedQuantity",
  );
  const requested = nonNegative(
    input.requestedOrderQuantity,
    "requestedOrderQuantity",
  );
  if (currentOrderReserved.greaterThan(totalReserved)) {
    throw new ManufacturingDomainError(
      "RESERVATION_TOTAL_INCONSISTENT",
      "The current order reservation cannot exceed the total active reservation.",
    );
  }

  const reservedByOtherOrders = totalReserved.sub(currentOrderReserved);
  const rawAvailableForOrder = onHand.sub(reservedByOtherOrders);
  const availableForOrder = maxZero(rawAvailableForOrder);
  const shortfallQuantity = maxZero(requested.sub(availableForOrder));
  const projectedRawAvailability = onHand
    .sub(reservedByOtherOrders)
    .sub(requested);
  return {
    canReserve: shortfallQuantity.equals(0),
    reservedByOtherOrders,
    availableForOrder,
    existingOrderReservation: currentOrderReserved,
    additionalQuantityRequired: maxZero(requested.sub(currentOrderReserved)),
    projectedAvailableQuantity: maxZero(projectedRawAvailability),
    shortfallQuantity,
    currentOverReservationQuantity: maxZero(totalReserved.sub(onHand)),
    projectedOverReservationQuantity: maxZero(
      projectedRawAvailability.negated(),
    ),
  };
}

export function assertReservationAvailable(
  input: ReservationAvailabilityInput,
): ReservationAvailabilityResult {
  const result = evaluateReservationAvailability(input);
  if (!result.canReserve) {
    throw new ManufacturingDomainError(
      "INSUFFICIENT_AVAILABLE_STOCK",
      `Reservation exceeds available stock by ${result.shortfallQuantity.toString()}.`,
    );
  }
  return result;
}

export function countOrdersWithMaterialShortage(input: {
  orders: Array<{
    id: string;
    issueWarehouseId: string;
    materials: Array<{
      inventoryItemId: string;
      plannedQuantity: Prisma.Decimal.Value;
      issuedQuantity: Prisma.Decimal.Value;
      returnedQuantity: Prisma.Decimal.Value;
    }>;
  }>;
  stock: Array<{
    warehouseId: string;
    inventoryItemId: string;
    onHandQuantity: Prisma.Decimal.Value;
  }>;
  reservations: Array<{
    orderId: string;
    warehouseId: string;
    inventoryItemId: string;
    quantity: Prisma.Decimal.Value;
    issuedQuantity: Prisma.Decimal.Value;
    releasedQuantity: Prisma.Decimal.Value;
  }>;
}) {
  const stockByKey = new Map(
    input.stock.map((row) => [
      `${row.warehouseId}:${row.inventoryItemId}`,
      new Prisma.Decimal(row.onHandQuantity),
    ]),
  );
  const totalReserved = new Map<string, Prisma.Decimal>();
  const ownReserved = new Map<string, Prisma.Decimal>();
  for (const row of input.reservations) {
    const outstanding = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      new Prisma.Decimal(row.quantity)
        .sub(row.issuedQuantity)
        .sub(row.releasedQuantity),
    );
    const stockKey = `${row.warehouseId}:${row.inventoryItemId}`;
    const ownKey = `${row.orderId}:${stockKey}`;
    totalReserved.set(
      stockKey,
      (totalReserved.get(stockKey) ?? new Prisma.Decimal(0)).add(outstanding),
    );
    ownReserved.set(
      ownKey,
      (ownReserved.get(ownKey) ?? new Prisma.Decimal(0)).add(outstanding),
    );
  }
  let shortageOrders = 0;
  for (const order of input.orders) {
    const requiredByItem = new Map<string, Prisma.Decimal>();
    for (const material of order.materials) {
      const outstanding = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        new Prisma.Decimal(material.plannedQuantity)
          .sub(material.issuedQuantity)
          .add(material.returnedQuantity),
      );
      requiredByItem.set(
        material.inventoryItemId,
        (
          requiredByItem.get(material.inventoryItemId) ?? new Prisma.Decimal(0)
        ).add(outstanding),
      );
    }
    const hasShortage = [...requiredByItem].some(
      ([inventoryItemId, requested]) => {
        const stockKey = `${order.issueWarehouseId}:${inventoryItemId}`;
        return !evaluateReservationAvailability({
          onHandQuantity: stockByKey.get(stockKey) ?? 0,
          totalReservedQuantity: totalReserved.get(stockKey) ?? 0,
          currentOrderReservedQuantity:
            ownReserved.get(`${order.id}:${stockKey}`) ?? 0,
          requestedOrderQuantity: requested,
        }).canReserve;
      },
    );
    if (hasShortage) shortageOrders += 1;
  }
  return shortageOrders;
}

export interface IssueCostMaterialInput {
  materialId: string;
  quantityPerOutput: DomainNumber;
  mwaUnitCost: DomainNumber;
}

export interface IssueLotInput {
  lotId: string;
  outputQuantity: DomainNumber;
}

export interface ExactMoneyAllocation {
  exactAmount: Prisma.Decimal;
  amountPaisa: bigint;
  amount: number;
  roundingAdjustmentPaisa: bigint;
}

export interface IssueMaterialCostAllocation extends ExactMoneyAllocation {
  materialId: string;
  totalIssueQuantity: Prisma.Decimal;
  mwaUnitCost: Prisma.Decimal;
}

export interface IssueLotCostAllocation extends ExactMoneyAllocation {
  lotId: string;
  outputQuantity: Prisma.Decimal;
}

export interface IssueCostPlan {
  totalOutputQuantity: Prisma.Decimal;
  exactCostPerOutput: Prisma.Decimal;
  displayCostPerOutput: number;
  exactTotalIssueCost: Prisma.Decimal;
  totalIssueCostPaisa: bigint;
  totalIssueCost: number;
  materials: IssueMaterialCostAllocation[];
  lots: IssueLotCostAllocation[];
}

export interface PaisaAllocationResult {
  exactAmount: Prisma.Decimal;
  preliminaryPaisa: bigint;
  amountPaisa: bigint;
  roundingAdjustmentPaisa: bigint;
}

/**
 * Rounds the aggregate once, then absorbs split-line residue in the last
 * positive line, matching normalizeBalancedMoneyLines in accounting.
 */
function allocateExactAmounts(
  exactAmounts: Prisma.Decimal[],
): PaisaAllocationResult[] {
  const targetPaisa = toPaisa(sumDecimals(exactAmounts));
  const preliminary = exactAmounts.map((amount) => toPaisa(amount));
  const preliminaryTotal = preliminary.reduce(
    (total, amount) => total + amount,
    0n,
  );
  const residue = targetPaisa - preliminaryTotal;
  const final = [...preliminary];
  if (residue !== 0n) {
    let residueIndex = -1;
    for (let index = exactAmounts.length - 1; index >= 0; index -= 1) {
      if (exactAmounts[index].greaterThan(0)) {
        residueIndex = index;
        break;
      }
    }
    if (residueIndex < 0) {
      throw new ManufacturingDomainError(
        "ROUNDING_RESIDUE_UNALLOCATED",
        "No positive amount can absorb rounding residue.",
      );
    }
    final[residueIndex] += residue;
    if (final[residueIndex] < 0n) {
      throw new ManufacturingDomainError(
        "NEGATIVE_MONEY_ALLOCATION",
        "Rounding produced a negative money allocation.",
      );
    }
  }
  return exactAmounts.map((exactAmount, index) => ({
    exactAmount,
    preliminaryPaisa: preliminary[index],
    amountPaisa: final[index],
    roundingAdjustmentPaisa: final[index] - preliminary[index],
  }));
}

/**
 * Converts exact source values (for example quantity x moving-average rate)
 * into persistable two-decimal money lines. The aggregate is rounded once and
 * any split residue is placed on the last positive line, so detail always
 * reconciles exactly to the voucher total.
 */
export function allocatePostedMoneyLines(
  exactAmounts: Array<Prisma.Decimal.Value>,
): Array<PaisaAllocationResult & { amount: Prisma.Decimal }> {
  if (exactAmounts.length === 0) {
    throw new ManufacturingDomainError(
      "NO_MONEY_LINES",
      "At least one exact money line is required.",
    );
  }
  const normalized = exactAmounts.map((amount, index) => {
    const value = decimal(amount, `exactAmounts[${index}]`);
    if (value.isNegative()) {
      throw new ManufacturingDomainError(
        "NEGATIVE_MONEY_ALLOCATION",
        `exactAmounts[${index}] cannot be negative.`,
      );
    }
    return value;
  });
  return allocateExactAmounts(normalized).map((row) => ({
    ...row,
    amount: new Prisma.Decimal(row.amountPaisa.toString()).div(100),
  }));
}

export interface ReservationReleaseLineInput {
  id: string;
  orderMaterialId?: string | null;
  inventoryLotId?: string | null;
  quantity: Prisma.Decimal.Value;
  issuedQuantity: Prisma.Decimal.Value;
  releasedQuantity: Prisma.Decimal.Value;
}

/** Returns only genuine outstanding reservation quantities and rejects corrupt negative balances. */
export function calculateReservationReleasePlan(
  lines: ReservationReleaseLineInput[],
) {
  return lines.flatMap((line) => {
    const quantity = decimal(line.quantity, `${line.id}.quantity`);
    const issued = decimal(line.issuedQuantity, `${line.id}.issuedQuantity`);
    const released = decimal(
      line.releasedQuantity,
      `${line.id}.releasedQuantity`,
    );
    const outstanding = quantity.sub(issued).sub(released);
    if (outstanding.isNegative()) {
      throw new ManufacturingDomainError(
        "RESERVATION_BALANCE_INVALID",
        `Reservation line ${line.id} has issued/released quantity above its reserved quantity.`,
      );
    }
    return outstanding.isZero() ? [] : [{ ...line, outstanding }];
  });
}

export interface StockRequirementInput {
  warehouseId: string;
  locationId?: string | null;
  inventoryItemId: string;
  quantity: Prisma.Decimal.Value;
}

/** Aggregates duplicate command lines before checking the single live stock balance. */
export function aggregateStockRequirements(lines: StockRequirementInput[]) {
  const grouped = new Map<
    string,
    StockRequirementInput & { quantity: Prisma.Decimal }
  >();
  for (const line of lines) {
    const quantity = decimal(line.quantity, `${line.inventoryItemId}.quantity`);
    const key = `${line.warehouseId}:${line.locationId ?? ""}:${line.inventoryItemId}`;
    const current = grouped.get(key);
    if (current) current.quantity = current.quantity.add(quantity);
    else grouped.set(key, { ...line, quantity });
  }
  return [...grouped.values()];
}

export function calculateIssueCostPlan(
  materialInputs: IssueCostMaterialInput[],
  lotInputs: IssueLotInput[],
): IssueCostPlan {
  if (materialInputs.length === 0) {
    throw new ManufacturingDomainError(
      "NO_ISSUE_MATERIALS",
      "At least one issue material is required.",
    );
  }
  if (lotInputs.length === 0) {
    throw new ManufacturingDomainError(
      "NO_PRODUCTION_LOTS",
      "At least one production lot is required.",
    );
  }

  const materialIds = new Set<string>();
  const materials = materialInputs.map((row, index) => {
    const materialId = nonBlank(
      row.materialId,
      `materials[${index}].materialId`,
    );
    if (materialIds.has(materialId)) {
      throw new ManufacturingDomainError(
        "DUPLICATE_ISSUE_MATERIAL",
        `Material ${materialId} appears more than once.`,
      );
    }
    materialIds.add(materialId);
    return {
      materialId,
      quantityPerOutput: positive(
        row.quantityPerOutput,
        `materials[${index}].quantityPerOutput`,
      ),
      mwaUnitCost: nonNegative(
        row.mwaUnitCost,
        `materials[${index}].mwaUnitCost`,
      ),
    };
  });

  const lotIds = new Set<string>();
  const lots = lotInputs.map((row, index) => {
    const lotId = nonBlank(row.lotId, `lots[${index}].lotId`);
    if (lotIds.has(lotId)) {
      throw new ManufacturingDomainError(
        "DUPLICATE_PRODUCTION_LOT",
        `Production lot ${lotId} appears more than once.`,
      );
    }
    lotIds.add(lotId);
    return {
      lotId,
      outputQuantity: positive(
        row.outputQuantity,
        `lots[${index}].outputQuantity`,
      ),
    };
  });

  const totalOutputQuantity = sumDecimals(
    lots.map((row) => row.outputQuantity),
  );
  const exactCostPerOutput = sumDecimals(
    materials.map((row) => row.quantityPerOutput.mul(row.mwaUnitCost)),
  );
  const exactTotalIssueCost = exactCostPerOutput.mul(totalOutputQuantity);
  const totalIssueCostPaisa = toPaisa(exactTotalIssueCost);

  const materialExactAmounts = materials.map((row) =>
    row.quantityPerOutput.mul(totalOutputQuantity).mul(row.mwaUnitCost),
  );
  const materialMoney = allocateExactAmounts(materialExactAmounts);
  const materialAllocations = materials.map<IssueMaterialCostAllocation>(
    (row, index) => ({
      materialId: row.materialId,
      totalIssueQuantity: row.quantityPerOutput.mul(totalOutputQuantity),
      mwaUnitCost: row.mwaUnitCost,
      exactAmount: materialMoney[index].exactAmount,
      amountPaisa: materialMoney[index].amountPaisa,
      amount: paisaToNumber(materialMoney[index].amountPaisa),
      roundingAdjustmentPaisa: materialMoney[index].roundingAdjustmentPaisa,
    }),
  );

  const lotExactAmounts = lots.map((row) =>
    exactCostPerOutput.mul(row.outputQuantity),
  );
  const lotMoney = allocateExactAmounts(lotExactAmounts);
  const lotAllocations = lots.map<IssueLotCostAllocation>((row, index) => ({
    lotId: row.lotId,
    outputQuantity: row.outputQuantity,
    exactAmount: lotMoney[index].exactAmount,
    amountPaisa: lotMoney[index].amountPaisa,
    amount: paisaToNumber(lotMoney[index].amountPaisa),
    roundingAdjustmentPaisa: lotMoney[index].roundingAdjustmentPaisa,
  }));

  const materialPaisaTotal = materialAllocations.reduce(
    (total, row) => total + row.amountPaisa,
    0n,
  );
  const lotPaisaTotal = lotAllocations.reduce(
    (total, row) => total + row.amountPaisa,
    0n,
  );
  if (
    materialPaisaTotal !== totalIssueCostPaisa ||
    lotPaisaTotal !== totalIssueCostPaisa
  ) {
    throw new ManufacturingDomainError(
      "ISSUE_COST_NOT_RECONCILED",
      "Material and lot cost allocations must equal the issue total.",
    );
  }

  return {
    totalOutputQuantity,
    exactCostPerOutput,
    displayCostPerOutput: paisaToNumber(toPaisa(exactCostPerOutput)),
    exactTotalIssueCost,
    totalIssueCostPaisa,
    totalIssueCost: paisaToNumber(totalIssueCostPaisa),
    materials: materialAllocations,
    lots: lotAllocations,
  };
}

export type ProductionState =
  | "DRAFT"
  | "APPROVED"
  | "RESERVED"
  | "ISSUED"
  | "IN_PRODUCTION"
  | "QC"
  | "QA_RELEASED"
  | "CLOSED"
  | "CANCELLED";

export interface ProductionTransitionContext {
  bomVersionApproved: boolean;
  reservationComplete: boolean;
  materialIssueComplete: boolean;
  completedQuantity: DomainNumber;
  qualityReleaseReady: boolean;
  closeReadiness?: CloseReadinessResult;
  hasPostedInventoryOrAccounting: boolean;
}

export interface ProductionTransitionResult {
  allowed: boolean;
  issues: DomainIssue[];
}

const ALLOWED_TRANSITIONS: Record<ProductionState, ProductionState[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["RESERVED", "CANCELLED"],
  RESERVED: ["ISSUED", "CANCELLED"],
  ISSUED: ["IN_PRODUCTION"],
  IN_PRODUCTION: ["QC"],
  QC: ["IN_PRODUCTION", "QA_RELEASED"],
  QA_RELEASED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export function evaluateProductionTransition(
  from: ProductionState,
  to: ProductionState,
  context: ProductionTransitionContext,
): ProductionTransitionResult {
  const issues: DomainIssue[] = [];
  const completedQuantity = nonNegative(
    context.completedQuantity,
    "completedQuantity",
  );
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    issues.push({
      code: "INVALID_PRODUCTION_TRANSITION",
      message: `Production cannot move from ${from} to ${to}.`,
      path: "state",
    });
    return { allowed: false, issues };
  }

  if (to === "APPROVED" && !context.bomVersionApproved) {
    issues.push({
      code: "BOM_VERSION_NOT_APPROVED",
      message: "An approved BOM version is required before order approval.",
    });
  }
  if (to === "RESERVED" && !context.reservationComplete) {
    issues.push({
      code: "RESERVATION_INCOMPLETE",
      message: "All required materials must be reserved.",
    });
  }
  if (
    (to === "ISSUED" || (to === "IN_PRODUCTION" && from === "ISSUED")) &&
    !context.materialIssueComplete
  ) {
    issues.push({
      code: "MATERIAL_ISSUE_INCOMPLETE",
      message:
        "Required material issue must be posted before production starts.",
    });
  }
  if (to === "ISSUED" && !context.reservationComplete) {
    issues.push({
      code: "RESERVATION_INCOMPLETE",
      message: "Materials cannot be issued without a complete reservation.",
    });
  }
  if (to === "QC" && completedQuantity.lessThanOrEqualTo(0)) {
    issues.push({
      code: "NO_COMPLETED_OUTPUT",
      message: "At least one completed output is required for QC.",
    });
  }
  if (to === "QA_RELEASED" && !context.qualityReleaseReady) {
    issues.push({
      code: "QUALITY_RELEASE_NOT_READY",
      message: "QC, serial and packaging release checks are incomplete.",
    });
  }
  if (to === "CLOSED" && !context.closeReadiness?.ready) {
    issues.push({
      code: "CLOSE_NOT_READY",
      message: "Production reconciliation is not ready to close.",
    });
  }
  if (to === "CANCELLED" && context.hasPostedInventoryOrAccounting) {
    issues.push({
      code: "POSTED_PRODUCTION_CANNOT_CANCEL",
      message:
        "Posted stock or accounting must be reversed through a controlled amendment before cancellation.",
    });
  }
  return { allowed: issues.length === 0, issues };
}

export function assertProductionTransition(
  from: ProductionState,
  to: ProductionState,
  context: ProductionTransitionContext,
): void {
  const result = evaluateProductionTransition(from, to, context);
  if (!result.allowed) {
    throw new ManufacturingDomainError(
      "PRODUCTION_TRANSITION_BLOCKED",
      result.issues.map((issue) => issue.message).join(" "),
      result.issues,
    );
  }
}

export interface PackagingActualInput {
  required: boolean;
  actualIssuePosted: boolean;
  issuedQuantity?: DomainNumber;
  usedQuantity?: DomainNumber;
  returnedQuantity?: DomainNumber;
  scrappedQuantity?: DomainNumber;
  actualCost?: DomainNumber | null;
}

export type PackagingActualStatus =
  "NOT_REQUIRED" | "PENDING" | "READY" | "INVALID";

export interface PackagingActualEvaluation {
  ready: boolean;
  status: PackagingActualStatus;
  actualCostPaisa: bigint | null;
  issues: DomainIssue[];
}

export function evaluatePackagingActuals(
  input: PackagingActualInput,
): PackagingActualEvaluation {
  const issues: DomainIssue[] = [];
  const hasActualCost =
    input.actualCost !== undefined && input.actualCost !== null;
  const hasUnpostedValues =
    [
      input.issuedQuantity,
      input.usedQuantity,
      input.returnedQuantity,
      input.scrappedQuantity,
    ].some(
      (value) =>
        value !== undefined &&
        nonNegative(value, "packagingQuantity").greaterThan(0),
    ) || hasActualCost;

  if (!input.actualIssuePosted) {
    if (hasUnpostedValues) {
      issues.push({
        code: "PACKAGING_ACTUAL_NOT_POSTED",
        message:
          "Packaging quantities or cost cannot be treated as actual until the issue document is posted.",
      });
      return { ready: false, status: "INVALID", actualCostPaisa: null, issues };
    }
    if (input.required) {
      issues.push({
        code: "PACKAGING_ACTUAL_PENDING",
        message:
          "Required packaging has no posted actual issue; do not create a zero or demo cost.",
      });
      return { ready: false, status: "PENDING", actualCostPaisa: null, issues };
    }
    return {
      ready: true,
      status: "NOT_REQUIRED",
      actualCostPaisa: null,
      issues,
    };
  }

  const issued = nonNegative(input.issuedQuantity ?? 0, "issuedQuantity");
  const used = nonNegative(input.usedQuantity ?? 0, "usedQuantity");
  const returned = nonNegative(input.returnedQuantity ?? 0, "returnedQuantity");
  const scrapped = nonNegative(input.scrappedQuantity ?? 0, "scrappedQuantity");
  if (issued.lessThanOrEqualTo(0)) {
    issues.push({
      code: "PACKAGING_ISSUE_EMPTY",
      message: "A posted packaging issue must contain an actual quantity.",
    });
  }
  if (!hasActualCost) {
    issues.push({
      code: "PACKAGING_COST_MISSING",
      message:
        "Posted packaging must carry its actual MWA cost, including an explicit zero when valid.",
    });
  }
  const actualCost = hasActualCost
    ? nonNegative(input.actualCost!, "actualCost")
    : null;
  if (!used.add(returned).add(scrapped).equals(issued)) {
    issues.push({
      code: "PACKAGING_QUANTITY_NOT_RECONCILED",
      message:
        "Packaging issued quantity must equal used, returned and scrapped quantities.",
    });
  }
  if (input.required && used.lessThanOrEqualTo(0)) {
    issues.push({
      code: "PACKAGING_NOT_USED",
      message: "Required packaging must have an actual used quantity.",
    });
  }
  return {
    ready: issues.length === 0,
    status: issues.length === 0 ? "READY" : "INVALID",
    actualCostPaisa: actualCost ? toPaisa(actualCost) : null,
    issues,
  };
}

export interface QualityReleaseInput {
  presentedQuantity: DomainNumber;
  passedQuantity: DomainNumber;
  failedQuantity: DomainNumber;
  onHoldQuantity: DomainNumber;
  releaseQuantity: DomainNumber;
  serialTrackingRequired: boolean;
  serialNumbers: string[];
  packagingReady: boolean;
  requireFullRelease?: boolean;
  requireAllPresentedPassed?: boolean;
}

export interface QualityReleaseEvaluation {
  ready: boolean;
  normalizedSerialNumbers: string[];
  issues: DomainIssue[];
}

export function evaluateQualityRelease(
  input: QualityReleaseInput,
): QualityReleaseEvaluation {
  const issues: DomainIssue[] = [];
  const presented = nonNegative(input.presentedQuantity, "presentedQuantity");
  const passed = nonNegative(input.passedQuantity, "passedQuantity");
  const failed = nonNegative(input.failedQuantity, "failedQuantity");
  const onHold = nonNegative(input.onHoldQuantity, "onHoldQuantity");
  const release = nonNegative(input.releaseQuantity, "releaseQuantity");
  const normalizedSerialNumbers = input.serialNumbers.map((serial) =>
    serial.trim(),
  );

  if (!passed.add(failed).add(onHold).equals(presented)) {
    issues.push({
      code: "QC_QUANTITY_NOT_RECONCILED",
      message:
        "QC passed, failed and on-hold quantities must equal the presented quantity.",
    });
  }
  if (release.greaterThan(passed)) {
    issues.push({
      code: "RELEASE_EXCEEDS_QC_PASS",
      message: "Released quantity cannot exceed QC-passed quantity.",
    });
  }
  if ((input.requireFullRelease ?? true) && !release.equals(passed)) {
    issues.push({
      code: "QC_PASS_NOT_FULLY_RELEASED",
      message: "All QC-passed units must be included in the final release.",
    });
  }
  if ((input.requireFullRelease ?? true) && onHold.greaterThan(0)) {
    issues.push({
      code: "QC_HOLD_REMAINS",
      message: "On-hold units must be resolved before final release.",
    });
  }
  if (
    input.requireAllPresentedPassed &&
    (!passed.equals(presented) ||
      failed.greaterThan(0) ||
      onHold.greaterThan(0))
  ) {
    issues.push({
      code: "QC_NOT_ALL_PASSED",
      message: "Every presented unit must pass QC for this release.",
    });
  }
  if (!input.packagingReady) {
    issues.push({
      code: "PACKAGING_NOT_READY_FOR_RELEASE",
      message: "Required actual packaging must be reconciled before release.",
    });
  }

  if (input.serialTrackingRequired) {
    if (!release.isInteger()) {
      issues.push({
        code: "SERIAL_QUANTITY_NOT_INTEGER",
        message: "Serialized release quantity must be a whole number.",
      });
    }
    if (normalizedSerialNumbers.some((serial) => !serial)) {
      issues.push({
        code: "BLANK_SERIAL_NUMBER",
        message: "Serial numbers cannot be blank.",
      });
    }
    const uniqueSerials = new Set(normalizedSerialNumbers);
    if (uniqueSerials.size !== normalizedSerialNumbers.length) {
      issues.push({
        code: "DUPLICATE_SERIAL_NUMBER",
        message:
          "Every released finished unit must have a unique serial number.",
      });
    }
    if (
      release.isInteger() &&
      BigInt(normalizedSerialNumbers.length) !== BigInt(release.toFixed(0))
    ) {
      issues.push({
        code: "SERIAL_COUNT_MISMATCH",
        message:
          "The number of serials must equal the released finished-goods quantity.",
      });
    }
  }

  return { ready: issues.length === 0, normalizedSerialNumbers, issues };
}

export interface CloseMaterialReconciliationInput {
  materialId: string;
  requiredQuantity: DomainNumber;
  issuedQuantity: DomainNumber;
  consumedQuantity: DomainNumber;
  returnedQuantity: DomainNumber;
  scrappedQuantity: DomainNumber;
  varianceApproved: boolean;
}

export interface CloseReadinessInput {
  plannedOutputQuantity: DomainNumber;
  producedQuantity: DomainNumber;
  acceptedQuantity: DomainNumber;
  rejectedOrScrappedOutputQuantity: DomainNumber;
  cancelledOutputQuantity: DomainNumber;
  openReworkQuantity: DomainNumber;
  releasedFinishedGoodsQuantity: DomainNumber;
  outstandingReservationQuantity: DomainNumber;
  pendingDocumentCount: number;
  materialReconciliations: CloseMaterialReconciliationInput[];
  qualityRelease: QualityReleaseEvaluation;
  packaging: PackagingActualEvaluation;
  wipQuantity: DomainNumber;
  wipValue: DomainNumber;
  finishedGoodsInventoryValue: DomainNumber;
  productionCostLedgerValue: DomainNumber;
  journalDebitTotal: DomainNumber;
  journalCreditTotal: DomainNumber;
  periodOpen: boolean;
}

export interface CloseReadinessResult {
  ready: boolean;
  issues: DomainIssue[];
}

export function evaluateCloseReadiness(
  input: CloseReadinessInput,
): CloseReadinessResult {
  const issues: DomainIssue[] = [];
  const planned = nonNegative(
    input.plannedOutputQuantity,
    "plannedOutputQuantity",
  );
  const produced = nonNegative(input.producedQuantity, "producedQuantity");
  const accepted = nonNegative(input.acceptedQuantity, "acceptedQuantity");
  const rejected = nonNegative(
    input.rejectedOrScrappedOutputQuantity,
    "rejectedOrScrappedOutputQuantity",
  );
  const cancelled = nonNegative(
    input.cancelledOutputQuantity,
    "cancelledOutputQuantity",
  );
  const openRework = nonNegative(
    input.openReworkQuantity,
    "openReworkQuantity",
  );
  const released = nonNegative(
    input.releasedFinishedGoodsQuantity,
    "releasedFinishedGoodsQuantity",
  );
  const outstandingReservation = nonNegative(
    input.outstandingReservationQuantity,
    "outstandingReservationQuantity",
  );
  const wipQuantity = nonNegative(input.wipQuantity, "wipQuantity");
  const wipValue = nonNegative(input.wipValue, "wipValue");
  const finishedGoodsValue = nonNegative(
    input.finishedGoodsInventoryValue,
    "finishedGoodsInventoryValue",
  );
  const productionCostValue = nonNegative(
    input.productionCostLedgerValue,
    "productionCostLedgerValue",
  );
  const journalDebit = nonNegative(
    input.journalDebitTotal,
    "journalDebitTotal",
  );
  const journalCredit = nonNegative(
    input.journalCreditTotal,
    "journalCreditTotal",
  );
  if (
    !Number.isSafeInteger(input.pendingDocumentCount) ||
    input.pendingDocumentCount < 0
  ) {
    throw new ManufacturingDomainError(
      "INVALID_PENDING_DOCUMENT_COUNT",
      "pendingDocumentCount must be a non-negative integer.",
    );
  }

  if (!input.periodOpen)
    issues.push({
      code: "MANUFACTURING_PERIOD_CLOSED",
      message: "The manufacturing/accounting period is closed.",
    });
  if (input.pendingDocumentCount > 0)
    issues.push({
      code: "PENDING_PRODUCTION_DOCUMENTS",
      message: "All production documents must be posted or resolved.",
    });
  if (!outstandingReservation.equals(0))
    issues.push({
      code: "OUTSTANDING_RESERVATIONS",
      message:
        "All remaining material reservations must be consumed or released.",
    });
  if (openRework.greaterThan(0))
    issues.push({
      code: "OPEN_REWORK_REMAINS",
      message: "Open rework quantity must be resolved.",
    });
  if (!accepted.add(rejected).add(cancelled).equals(planned)) {
    issues.push({
      code: "PLANNED_OUTPUT_NOT_RECONCILED",
      message:
        "Planned output must equal accepted, rejected/scrapped and cancelled output.",
    });
  }
  if (!accepted.add(rejected).add(openRework).equals(produced)) {
    issues.push({
      code: "PRODUCED_OUTPUT_NOT_RECONCILED",
      message:
        "Produced output must equal accepted, rejected/scrapped and open-rework output.",
    });
  }
  if (!released.equals(accepted)) {
    issues.push({
      code: "FINISHED_GOODS_NOT_FULLY_RELEASED",
      message:
        "Every accepted finished unit must be released from FG-Q to FG-R.",
    });
  }

  if (input.materialReconciliations.length === 0) {
    issues.push({
      code: "MATERIAL_RECONCILIATION_MISSING",
      message: "At least one material reconciliation is required.",
    });
  }
  const materialIds = new Set<string>();
  input.materialReconciliations.forEach((row, index) => {
    const materialId = nonBlank(
      row.materialId,
      `materialReconciliations[${index}].materialId`,
    );
    if (materialIds.has(materialId)) {
      throw new ManufacturingDomainError(
        "DUPLICATE_MATERIAL_RECONCILIATION",
        `Material ${materialId} appears more than once.`,
      );
    }
    materialIds.add(materialId);
    const required = nonNegative(
      row.requiredQuantity,
      `materialReconciliations[${index}].requiredQuantity`,
    );
    const issued = nonNegative(
      row.issuedQuantity,
      `materialReconciliations[${index}].issuedQuantity`,
    );
    const consumed = nonNegative(
      row.consumedQuantity,
      `materialReconciliations[${index}].consumedQuantity`,
    );
    const returned = nonNegative(
      row.returnedQuantity,
      `materialReconciliations[${index}].returnedQuantity`,
    );
    const scrapped = nonNegative(
      row.scrappedQuantity,
      `materialReconciliations[${index}].scrappedQuantity`,
    );
    if (!consumed.add(returned).add(scrapped).equals(issued)) {
      issues.push({
        code: "MATERIAL_ISSUE_NOT_RECONCILED",
        message: `Issued quantity for ${materialId} must equal consumed, returned and scrapped quantities.`,
        path: `materialReconciliations[${index}]`,
      });
    }
    const actualRequirementUse = consumed.add(scrapped);
    if (!actualRequirementUse.equals(required) && !row.varianceApproved) {
      issues.push({
        code: "MATERIAL_VARIANCE_NOT_APPROVED",
        message: `Material variance for ${materialId} requires approval.`,
        path: `materialReconciliations[${index}]`,
      });
    }
  });

  if (!input.qualityRelease.ready) {
    issues.push(...input.qualityRelease.issues);
  }
  if (!input.packaging.ready) {
    issues.push(...input.packaging.issues);
  }
  if (!wipQuantity.equals(0))
    issues.push({
      code: "WIP_QUANTITY_NOT_ZERO",
      message: "WIP quantity must be zero before close.",
    });
  // Stock valuation keeps six-decimal precision. Do not hide a sub-paisa WIP
  // residue by rounding it to the journal currency precision at close.
  if (!wipValue.equals(0))
    issues.push({
      code: "WIP_VALUE_NOT_ZERO",
      message: "WIP value must be exactly zero before close.",
    });
  if (toPaisa(finishedGoodsValue) !== toPaisa(productionCostValue)) {
    issues.push({
      code: "FINISHED_GOODS_COST_NOT_RECONCILED",
      message:
        "Finished-goods inventory value must equal the production cost ledger value.",
    });
  }
  if (toPaisa(journalDebit) !== toPaisa(journalCredit)) {
    issues.push({
      code: "MANUFACTURING_JOURNAL_UNBALANCED",
      message:
        "Manufacturing journal debit and credit totals must balance to the paisa.",
    });
  }
  return { ready: issues.length === 0, issues };
}

export function assertCloseReady(input: CloseReadinessInput): void {
  const result = evaluateCloseReadiness(input);
  if (!result.ready) {
    throw new ManufacturingDomainError(
      "PRODUCTION_CLOSE_BLOCKED",
      result.issues.map((issue) => issue.message).join(" "),
      result.issues,
    );
  }
}
