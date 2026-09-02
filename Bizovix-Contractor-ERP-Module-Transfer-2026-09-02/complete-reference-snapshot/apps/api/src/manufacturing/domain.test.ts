import { describe, expect, it } from "vitest";
import { Prisma } from "../generated/prisma/index.js";

import {
  ManufacturingDomainError,
  aggregateStockRequirements,
  allocatePostedMoneyLines,
  assertCloseReady,
  assertProductionTransition,
  assertReservationAvailable,
  calculateBomRequirements,
  calculateIssueCostPlan,
  calculateManufacturingWipBalance,
  calculateReservationReleasePlan,
  calculateMaxProducible,
  calculateNetMaterialLotConsumption,
  countOrdersWithMaterialShortage,
  evaluateCloseReadiness,
  evaluatePackagingActuals,
  evaluateProductionTransition,
  evaluateQualityRelease,
  evaluateReservationAvailability,
  findUnallocatedLotTrackedReservationMaterials,
  summarizeLotQualityInspections,
  type CloseReadinessInput,
  type ProductionTransitionContext,
} from "./domain.js";

const fridgeBom = [
  { materialId: "BODY", quantityPerOutput: 1, unit: "pcs" },
  { materialId: "POWER", quantityPerOutput: 1, unit: "pcs" },
  { materialId: "COMPRESSOR", quantityPerOutput: 1, unit: "pcs" },
];

// Six-decimal MWA can contain digits beyond the four decimals displayed in the
// blueprint. These exact values display as 252,976.1914 / 108,777.7773 /
// 161,777.7773 and reconcile to the blueprint's 523,531.7461 per fridge.
const fridgeMwaMaterials = [
  { materialId: "BODY", quantityPerOutput: 1, mwaUnitCost: "252976.19144" },
  { materialId: "POWER", quantityPerOutput: 1, mwaUnitCost: "108777.77734" },
  {
    materialId: "COMPRESSOR",
    quantityPerOutput: 1,
    mwaUnitCost: "161777.77732",
  },
];

const fridgeLots = [
  { lotId: "LOT-A", outputQuantity: 2 },
  { lotId: "LOT-B", outputQuantity: 3 },
  { lotId: "LOT-C", outputQuantity: 3 },
  { lotId: "LOT-D", outputQuantity: 2 },
];

function issueCodes(issues: Array<{ code: string }>): string[] {
  return issues.map((issue) => issue.code);
}

describe("manufacturing BOM requirements", () => {
  it("calculates the exact requirements for the 10-fridge BOM", () => {
    const result = calculateBomRequirements(fridgeBom, 10);

    expect(
      result.map((row) => ({
        materialId: row.materialId,
        base: row.baseQuantity.toString(),
        wastage: row.wastageQuantity.toString(),
        required: row.requiredQuantity.toString(),
        unit: row.unit,
      })),
    ).toEqual([
      {
        materialId: "BODY",
        base: "10",
        wastage: "0",
        required: "10",
        unit: "pcs",
      },
      {
        materialId: "POWER",
        base: "10",
        wastage: "0",
        required: "10",
        unit: "pcs",
      },
      {
        materialId: "COMPRESSOR",
        base: "10",
        wastage: "0",
        required: "10",
        unit: "pcs",
      },
    ]);
  });

  it("aggregates duplicate operation lines and keeps line-specific wastage exact", () => {
    const result = calculateBomRequirements(
      [
        {
          materialId: "RESIN",
          quantityPerOutput: "0.4",
          wastagePercent: "5",
          unit: "kg",
        },
        {
          materialId: "RESIN",
          quantityPerOutput: "0.6",
          wastagePercent: "10",
          unit: "KG",
        },
      ],
      10,
    );

    expect(result).toHaveLength(1);
    expect(result[0].baseQuantity.toString()).toBe("10");
    expect(result[0].wastageQuantity.toString()).toBe("0.8");
    expect(result[0].requiredQuantity.toString()).toBe("10.8");
  });

  it("rejects an empty BOM, invalid quantities and conflicting units", () => {
    expect(() => calculateBomRequirements([], 10)).toThrowError(
      ManufacturingDomainError,
    );
    expect(() => calculateBomRequirements(fridgeBom, 0)).toThrowError(
      /greater than zero/,
    );
    expect(() =>
      calculateBomRequirements([{ materialId: "A", quantityPerOutput: -1 }], 1),
    ).toThrowError(/greater than zero/);
    expect(() =>
      calculateBomRequirements(
        [
          { materialId: "A", quantityPerOutput: 1, unit: "pcs" },
          { materialId: "A", quantityPerOutput: 1, unit: "kg" },
        ],
        1,
      ),
    ).toThrowError(/conflicting BOM units/);
  });
});

describe("direct manufacturing reservation safety", () => {
  it("rejects unallocated lot-tracked demand even when RM and WIP share a physical warehouse", () => {
    const setup = {
      rawWarehouseId: "shared",
      wipWarehouseId: "shared",
      rawLocationId: "rm-location",
      wipLocationId: "wip-location",
    };
    expect(setup.rawWarehouseId).toBe(setup.wipWarehouseId);
    expect(setup.rawLocationId).not.toBe(setup.wipLocationId);
    expect(
      findUnallocatedLotTrackedReservationMaterials([
        {
          itemName: "Fridge compressor",
          lotTracked: true,
          plannedQuantity: 10,
          issuedQuantity: 0,
          reservedQuantity: 0,
        },
      ]),
    ).toEqual(["Fridge compressor"]);
  });

  it("allows non-lot demand and does not block lot demand already allocated by requisition", () => {
    expect(
      findUnallocatedLotTrackedReservationMaterials([
        {
          itemName: "Untracked body",
          lotTracked: false,
          plannedQuantity: 10,
          issuedQuantity: 0,
          reservedQuantity: 0,
        },
        {
          itemName: "Allocated compressor",
          lotTracked: true,
          plannedQuantity: 10,
          issuedQuantity: 0,
          reservedQuantity: 10,
        },
      ]),
    ).toEqual([]);
  });
});

describe("maximum producible quantity", () => {
  it("uses real available stock and identifies the fridge body bottleneck", () => {
    const result = calculateMaxProducible(fridgeBom, [
      { materialId: "BODY", onHandQuantity: 14 },
      { materialId: "POWER", onHandQuantity: 15 },
      { materialId: "COMPRESSOR", onHandQuantity: 15 },
    ]);

    expect(result.maxProducibleQuantity.toString()).toBe("14");
    expect(result.bottleneckMaterialIds).toEqual(["BODY"]);
    expect(
      result.capacities.map((row) => row.producibleQuantity.toString()),
    ).toEqual(["14", "15", "15"]);
  });

  it("subtracts reservations made by other production demand", () => {
    const result = calculateMaxProducible(fridgeBom, [
      { materialId: "BODY", onHandQuantity: 14, reservedQuantity: 4 },
      { materialId: "POWER", onHandQuantity: 15, reservedQuantity: 2 },
      { materialId: "COMPRESSOR", onHandQuantity: 15 },
    ]);

    expect(result.maxProducibleQuantity.toString()).toBe("10");
    expect(result.bottleneckMaterialIds).toEqual(["BODY"]);
  });

  it("treats a missing or over-reserved material as zero producible", () => {
    const missing = calculateMaxProducible(fridgeBom, [
      { materialId: "BODY", onHandQuantity: 14 },
      { materialId: "POWER", onHandQuantity: 15 },
    ]);
    expect(missing.maxProducibleQuantity.toString()).toBe("0");
    expect(missing.bottleneckMaterialIds).toEqual(["COMPRESSOR"]);

    const overReserved = calculateMaxProducible(fridgeBom, [
      { materialId: "BODY", onHandQuantity: 14, reservedQuantity: 16 },
      { materialId: "POWER", onHandQuantity: 15 },
      { materialId: "COMPRESSOR", onHandQuantity: 15 },
    ]);
    expect(overReserved.maxProducibleQuantity.toString()).toBe("0");
    expect(overReserved.capacities[0].overReservedQuantity.toString()).toBe(
      "2",
    );
  });

  it("rejects duplicate stock snapshots instead of double-counting them", () => {
    expect(() =>
      calculateMaxProducible(fridgeBom, [
        { materialId: "BODY", onHandQuantity: 7 },
        { materialId: "BODY", onHandQuantity: 7 },
      ]),
    ).toThrowError(/appears more than once/);
  });
});

describe("lot-wise manufacturing genealogy quantities", () => {
  it("keeps source lots separate and subtracts returns from the matching lot", () => {
    const rows = calculateNetMaterialLotConsumption([
      {
        materialId: "BODY",
        inventoryLotId: "BODY-LOT-1",
        direction: "ISSUE",
        quantity: 2,
      },
      {
        materialId: "BODY",
        inventoryLotId: "BODY-LOT-2",
        direction: "ISSUE",
        quantity: 1,
      },
      {
        materialId: "BODY",
        inventoryLotId: "BODY-LOT-1",
        direction: "RETURN",
        quantity: 1,
      },
      {
        materialId: "POWER",
        inventoryLotId: "POWER-LOT-1",
        direction: "ISSUE",
        quantity: 2,
      },
    ]);

    expect(
      rows.map((row) => ({
        materialId: row.materialId,
        inventoryLotId: row.inventoryLotId,
        quantity: row.quantity.toString(),
      })),
    ).toEqual([
      { materialId: "BODY", inventoryLotId: "BODY-LOT-1", quantity: "1" },
      { materialId: "BODY", inventoryLotId: "BODY-LOT-2", quantity: "1" },
      { materialId: "POWER", inventoryLotId: "POWER-LOT-1", quantity: "2" },
    ]);
  });

  it("rejects a return that exceeds the issue for its exact source lot", () => {
    expect(() =>
      calculateNetMaterialLotConsumption([
        {
          materialId: "BODY",
          inventoryLotId: "BODY-LOT-1",
          direction: "ISSUE",
          quantity: 1,
        },
        {
          materialId: "BODY",
          inventoryLotId: "BODY-LOT-1",
          direction: "RETURN",
          quantity: 2,
        },
      ]),
    ).toThrowError(/exceeds issued quantity/);
  });
});

describe("reservation availability", () => {
  it("reserves ten bodies without moving on-hand stock", () => {
    const result = evaluateReservationAvailability({
      onHandQuantity: 14,
      totalReservedQuantity: 0,
      requestedOrderQuantity: 10,
    });

    expect(result.canReserve).toBe(true);
    expect(result.availableForOrder.toString()).toBe("14");
    expect(result.additionalQuantityRequired.toString()).toBe("10");
    expect(result.projectedAvailableQuantity.toString()).toBe("4");
    expect(result.shortfallQuantity.toString()).toBe("0");
  });

  it("evaluates edits as a desired total while preserving this order's existing reservation", () => {
    const result = evaluateReservationAvailability({
      onHandQuantity: 14,
      totalReservedQuantity: 10,
      currentOrderReservedQuantity: 10,
      requestedOrderQuantity: 12,
    });

    expect(result.canReserve).toBe(true);
    expect(result.reservedByOtherOrders.toString()).toBe("0");
    expect(result.additionalQuantityRequired.toString()).toBe("2");
    expect(result.projectedAvailableQuantity.toString()).toBe("2");
  });

  it("reports exact shortfall when another order owns part of stock", () => {
    const result = evaluateReservationAvailability({
      onHandQuantity: 14,
      totalReservedQuantity: 10,
      currentOrderReservedQuantity: 5,
      requestedOrderQuantity: 10,
    });

    expect(result.canReserve).toBe(false);
    expect(result.reservedByOtherOrders.toString()).toBe("5");
    expect(result.availableForOrder.toString()).toBe("9");
    expect(result.shortfallQuantity.toString()).toBe("1");
    expect(result.projectedOverReservationQuantity.toString()).toBe("1");
    expect(() =>
      assertReservationAvailable({
        onHandQuantity: 14,
        totalReservedQuantity: 10,
        currentOrderReservedQuantity: 5,
        requestedOrderQuantity: 10,
      }),
    ).toThrowError(/exceeds available stock by 1/);
  });

  it("detects corrupt current reservation totals", () => {
    expect(() =>
      evaluateReservationAvailability({
        onHandQuantity: 10,
        totalReservedQuantity: 4,
        currentOrderReservedQuantity: 5,
        requestedOrderQuantity: 5,
      }),
    ).toThrowError(/cannot exceed the total active reservation/);
  });
});

describe("dashboard material shortage", () => {
  it("counts distinct orders using live stock and own-versus-other reservations", () => {
    const material = (plannedQuantity: string) => ({
      inventoryItemId: "BODY",
      plannedQuantity,
      issuedQuantity: "0",
      returnedQuantity: "0",
    });
    expect(
      countOrdersWithMaterialShortage({
        orders: [
          {
            id: "order-a",
            issueWarehouseId: "rm",
            materials: [material("10")],
          },
          { id: "order-b", issueWarehouseId: "rm", materials: [material("5")] },
        ],
        stock: [
          { warehouseId: "rm", inventoryItemId: "BODY", onHandQuantity: "14" },
        ],
        reservations: [
          {
            orderId: "order-a",
            warehouseId: "rm",
            inventoryItemId: "BODY",
            quantity: "5",
            issuedQuantity: "0",
            releasedQuantity: "0",
          },
          {
            orderId: "order-b",
            warehouseId: "rm",
            inventoryItemId: "BODY",
            quantity: "5",
            issuedQuantity: "0",
            releasedQuantity: "0",
          },
        ],
      }),
    ).toBe(1);
  });

  it("aggregates duplicate component rows and restores returned quantities to need", () => {
    expect(
      countOrdersWithMaterialShortage({
        orders: [
          {
            id: "order-a",
            issueWarehouseId: "rm",
            materials: [
              {
                inventoryItemId: "BODY",
                plannedQuantity: "6",
                issuedQuantity: "2",
                returnedQuantity: "1",
              },
              {
                inventoryItemId: "BODY",
                plannedQuantity: "6",
                issuedQuantity: "0",
                returnedQuantity: "0",
              },
            ],
          },
        ],
        stock: [
          { warehouseId: "rm", inventoryItemId: "BODY", onHandQuantity: "10" },
        ],
        reservations: [],
      }),
    ).toBe(1);
  });
});

describe("exact MWA issue allocation", () => {
  it("posts the actual 2/3/3/2 lot movements with aggregate-once paisa totals", () => {
    const postedLots = fridgeLots.map((lot) => {
      const exactLot = calculateIssueCostPlan(fridgeMwaMaterials, [lot]);
      const postingLines = allocatePostedMoneyLines(
        exactLot.materials.map((row) => row.exactAmount),
      );
      return postingLines.reduce((total, row) => total + row.amountPaisa, 0n);
    });

    expect(postedLots).toEqual([
      104706349n,
      157059524n,
      157059524n,
      104706349n,
    ]);
    const postedTotal = postedLots.reduce(
      (total, amount) => total + amount,
      0n,
    );
    expect(postedTotal).toBe(523531746n);
    // Each service posting uses this same allocated amount for both voucher
    // sides, so the four lot journals remain balanced to the paisa.
    expect(postedTotal).toBe(
      postedLots.reduce((total, credit) => total + credit, 0n),
    );
  });

  it("reproduces the attached 10-fridge 2/3/3/2 lot plan exactly", () => {
    const result = calculateIssueCostPlan(fridgeMwaMaterials, fridgeLots);

    expect(result.totalOutputQuantity.toString()).toBe("10");
    expect(result.exactCostPerOutput.toFixed(4)).toBe("523531.7461");
    expect(result.displayCostPerOutput).toBe(523531.75);
    expect(result.exactTotalIssueCost.toFixed(4)).toBe("5235317.4610");
    expect(result.totalIssueCostPaisa).toBe(523531746n);
    expect(result.totalIssueCost).toBe(5235317.46);
    expect(
      result.lots.map((lot) => ({
        lotId: lot.lotId,
        quantity: lot.outputQuantity.toString(),
        paisa: lot.amountPaisa,
      })),
    ).toEqual([
      { lotId: "LOT-A", quantity: "2", paisa: 104706349n },
      { lotId: "LOT-B", quantity: "3", paisa: 157059524n },
      { lotId: "LOT-C", quantity: "3", paisa: 157059524n },
      { lotId: "LOT-D", quantity: "2", paisa: 104706349n },
    ]);
    expect(
      result.lots.reduce((total, lot) => total + lot.amountPaisa, 0n),
    ).toBe(523531746n);
  });

  it("reconciles material detail and records the single-paisa split residue", () => {
    const result = calculateIssueCostPlan(fridgeMwaMaterials, fridgeLots);

    expect(
      result.materials.map((row) => ({
        materialId: row.materialId,
        quantity: row.totalIssueQuantity.toString(),
        paisa: row.amountPaisa,
        adjustment: row.roundingAdjustmentPaisa,
      })),
    ).toEqual([
      { materialId: "BODY", quantity: "10", paisa: 252976191n, adjustment: 0n },
      {
        materialId: "POWER",
        quantity: "10",
        paisa: 108777777n,
        adjustment: 0n,
      },
      {
        materialId: "COMPRESSOR",
        quantity: "10",
        paisa: 161777778n,
        adjustment: 1n,
      },
    ]);
    expect(
      result.materials.reduce((total, row) => total + row.amountPaisa, 0n),
    ).toBe(result.totalIssueCostPaisa);
    // Never use the rounded UI unit cost as the posting source.
    expect(result.displayCostPerOutput * 10).toBe(5235317.5);
    expect(result.totalIssueCost).toBe(5235317.46);
  });

  it("absorbs a general split residue deterministically in the last positive lot", () => {
    const result = calculateIssueCostPlan(
      [{ materialId: "M", quantityPerOutput: 1, mwaUnitCost: "33.3333333333" }],
      [
        { lotId: "A", outputQuantity: 1 },
        { lotId: "B", outputQuantity: 1 },
        { lotId: "C", outputQuantity: 1 },
      ],
    );

    expect(result.totalIssueCostPaisa).toBe(10000n);
    expect(result.lots.map((row) => row.amountPaisa)).toEqual([
      3333n,
      3333n,
      3334n,
    ]);
    expect(result.lots.map((row) => row.roundingAdjustmentPaisa)).toEqual([
      0n,
      0n,
      1n,
    ]);
  });

  it("rejects ambiguous duplicates and invalid cost inputs", () => {
    expect(() =>
      calculateIssueCostPlan(
        [
          { materialId: "M", quantityPerOutput: 1, mwaUnitCost: 10 },
          { materialId: "M", quantityPerOutput: 1, mwaUnitCost: 10 },
        ],
        fridgeLots,
      ),
    ).toThrowError(/appears more than once/);
    expect(() =>
      calculateIssueCostPlan(fridgeMwaMaterials, [
        { lotId: "A", outputQuantity: 1 },
        { lotId: "A", outputQuantity: 1 },
      ]),
    ).toThrowError(/appears more than once/);
    expect(() =>
      calculateIssueCostPlan(
        [{ materialId: "M", quantityPerOutput: 1, mwaUnitCost: -1 }],
        [{ lotId: "A", outputQuantity: 1 }],
      ),
    ).toThrowError(/cannot be negative/);
  });
});

describe("reservation release and stock command aggregation", () => {
  it("releases only genuine outstanding reservation quantity", () => {
    const plan = calculateReservationReleasePlan([
      {
        id: "partial",
        orderMaterialId: "body",
        inventoryLotId: "lot-1",
        quantity: 10,
        issuedQuantity: 6,
        releasedQuantity: 1,
      },
      {
        id: "done",
        orderMaterialId: "power",
        inventoryLotId: "lot-2",
        quantity: 10,
        issuedQuantity: 10,
        releasedQuantity: 0,
      },
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0].id).toBe("partial");
    expect(plan[0].outstanding.toString()).toBe("3");
  });

  it("rejects an over-issued or over-released reservation balance", () => {
    expect(() =>
      calculateReservationReleasePlan([
        { id: "bad", quantity: 10, issuedQuantity: 8, releasedQuantity: 3 },
      ]),
    ).toThrowError(ManufacturingDomainError);
  });

  it("groups duplicate non-lot stock lines by warehouse, location and item", () => {
    const grouped = aggregateStockRequirements([
      {
        warehouseId: "rm",
        locationId: "released",
        inventoryItemId: "body",
        quantity: 6,
      },
      {
        warehouseId: "rm",
        locationId: "released",
        inventoryItemId: "body",
        quantity: 5,
      },
      {
        warehouseId: "rm",
        locationId: "other",
        inventoryItemId: "body",
        quantity: 2,
      },
    ]);
    expect(
      grouped.map((row) => [row.locationId, row.quantity.toString()]),
    ).toEqual([
      ["released", "11"],
      ["other", "2"],
    ]);
  });
});

function transitionContext(
  overrides: Partial<ProductionTransitionContext> = {},
): ProductionTransitionContext {
  return {
    bomVersionApproved: true,
    reservationComplete: true,
    materialIssueComplete: true,
    completedQuantity: 10,
    qualityReleaseReady: true,
    closeReadiness: { ready: true, issues: [] },
    hasPostedInventoryOrAccounting: false,
    ...overrides,
  };
}

describe("production state transition guards", () => {
  it("allows only the controlled forward flow plus QC rework", () => {
    const validTransitions = [
      ["DRAFT", "APPROVED"],
      ["APPROVED", "RESERVED"],
      ["RESERVED", "ISSUED"],
      ["ISSUED", "IN_PRODUCTION"],
      ["IN_PRODUCTION", "QC"],
      ["QC", "IN_PRODUCTION"],
      ["QC", "QA_RELEASED"],
      ["QA_RELEASED", "CLOSED"],
    ] as const;
    for (const [from, to] of validTransitions) {
      expect(
        evaluateProductionTransition(from, to, transitionContext()).allowed,
        `${from} -> ${to}`,
      ).toBe(true);
    }
  });

  it("blocks skipped, backward, noop and terminal-state transitions", () => {
    expect(
      issueCodes(
        evaluateProductionTransition("DRAFT", "ISSUED", transitionContext())
          .issues,
      ),
    ).toContain("INVALID_PRODUCTION_TRANSITION");
    expect(
      issueCodes(
        evaluateProductionTransition("QC", "RESERVED", transitionContext())
          .issues,
      ),
    ).toContain("INVALID_PRODUCTION_TRANSITION");
    expect(
      issueCodes(
        evaluateProductionTransition(
          "APPROVED",
          "APPROVED",
          transitionContext(),
        ).issues,
      ),
    ).toContain("INVALID_PRODUCTION_TRANSITION");
    expect(
      issueCodes(
        evaluateProductionTransition(
          "CLOSED",
          "IN_PRODUCTION",
          transitionContext(),
        ).issues,
      ),
    ).toContain("INVALID_PRODUCTION_TRANSITION");
  });

  it("enforces BOM, reservation, issue, completion, quality and close prerequisites", () => {
    expect(
      issueCodes(
        evaluateProductionTransition(
          "DRAFT",
          "APPROVED",
          transitionContext({ bomVersionApproved: false }),
        ).issues,
      ),
    ).toContain("BOM_VERSION_NOT_APPROVED");
    expect(
      issueCodes(
        evaluateProductionTransition(
          "APPROVED",
          "RESERVED",
          transitionContext({ reservationComplete: false }),
        ).issues,
      ),
    ).toContain("RESERVATION_INCOMPLETE");
    expect(
      issueCodes(
        evaluateProductionTransition(
          "RESERVED",
          "ISSUED",
          transitionContext({ materialIssueComplete: false }),
        ).issues,
      ),
    ).toContain("MATERIAL_ISSUE_INCOMPLETE");
    expect(
      issueCodes(
        evaluateProductionTransition(
          "IN_PRODUCTION",
          "QC",
          transitionContext({ completedQuantity: 0 }),
        ).issues,
      ),
    ).toContain("NO_COMPLETED_OUTPUT");
    expect(
      issueCodes(
        evaluateProductionTransition(
          "QC",
          "QA_RELEASED",
          transitionContext({ qualityReleaseReady: false }),
        ).issues,
      ),
    ).toContain("QUALITY_RELEASE_NOT_READY");
    expect(
      issueCodes(
        evaluateProductionTransition(
          "QA_RELEASED",
          "CLOSED",
          transitionContext({ closeReadiness: { ready: false, issues: [] } }),
        ).issues,
      ),
    ).toContain("CLOSE_NOT_READY");
  });

  it("does not cancel an order with posted stock or accounting", () => {
    const result = evaluateProductionTransition(
      "RESERVED",
      "CANCELLED",
      transitionContext({ hasPostedInventoryOrAccounting: true }),
    );
    expect(result.allowed).toBe(false);
    expect(issueCodes(result.issues)).toContain(
      "POSTED_PRODUCTION_CANNOT_CANCEL",
    );
    expect(() =>
      assertProductionTransition(
        "RESERVED",
        "CANCELLED",
        transitionContext({ hasPostedInventoryOrAccounting: true }),
      ),
    ).toThrowError(ManufacturingDomainError);
  });
});

describe("actual-only packaging rules", () => {
  it("keeps absent optional packaging as null rather than inventing a zero transaction", () => {
    const result = evaluatePackagingActuals({
      required: false,
      actualIssuePosted: false,
    });
    expect(result).toEqual({
      ready: true,
      status: "NOT_REQUIRED",
      actualCostPaisa: null,
      issues: [],
    });
  });

  it("marks required packaging with no real issue as pending and costless", () => {
    const result = evaluatePackagingActuals({
      required: true,
      actualIssuePosted: false,
    });
    expect(result.ready).toBe(false);
    expect(result.status).toBe("PENDING");
    expect(result.actualCostPaisa).toBeNull();
    expect(issueCodes(result.issues)).toContain("PACKAGING_ACTUAL_PENDING");
  });

  it("rejects quantities or cost presented as actual without a posted issue", () => {
    const result = evaluatePackagingActuals({
      required: true,
      actualIssuePosted: false,
      issuedQuantity: 10,
      actualCost: 100,
    });
    expect(result.status).toBe("INVALID");
    expect(result.actualCostPaisa).toBeNull();
    expect(issueCodes(result.issues)).toContain("PACKAGING_ACTUAL_NOT_POSTED");
  });

  it("accepts reconciled actual packaging and preserves explicit valid zero cost", () => {
    const result = evaluatePackagingActuals({
      required: true,
      actualIssuePosted: true,
      issuedQuantity: 12,
      usedQuantity: 10,
      returnedQuantity: 1,
      scrappedQuantity: 1,
      actualCost: 0,
    });
    expect(result.ready).toBe(true);
    expect(result.status).toBe("READY");
    expect(result.actualCostPaisa).toBe(0n);
  });

  it("blocks missing MWA cost and unreconciled quantities", () => {
    const result = evaluatePackagingActuals({
      required: true,
      actualIssuePosted: true,
      issuedQuantity: 12,
      usedQuantity: 10,
      returnedQuantity: 1,
      scrappedQuantity: 0,
    });
    expect(result.ready).toBe(false);
    expect(issueCodes(result.issues)).toEqual(
      expect.arrayContaining([
        "PACKAGING_COST_MISSING",
        "PACKAGING_QUANTITY_NOT_RECONCILED",
      ]),
    );
  });
});

function readyQuality() {
  return evaluateQualityRelease({
    presentedQuantity: 10,
    passedQuantity: 10,
    failedQuantity: 0,
    onHoldQuantity: 0,
    releaseQuantity: 10,
    serialTrackingRequired: true,
    serialNumbers: Array.from(
      { length: 10 },
      (_, index) => `FR-2026-${String(index + 1).padStart(3, "0")}`,
    ),
    packagingReady: true,
    requireAllPresentedPassed: true,
  });
}

describe("QC, serial and finished-goods release constraints", () => {
  it("releases all ten QC-passed fridges with ten unique serials", () => {
    const result = readyQuality();
    expect(result.ready).toBe(true);
    expect(result.normalizedSerialNumbers).toHaveLength(10);
  });

  it("supports an explicitly partial release without weakening quantity or serial checks", () => {
    const result = evaluateQualityRelease({
      presentedQuantity: 10,
      passedQuantity: 8,
      failedQuantity: 1,
      onHoldQuantity: 1,
      releaseQuantity: 3,
      serialTrackingRequired: true,
      serialNumbers: ["A", "B", "C"],
      packagingReady: true,
      requireFullRelease: false,
    });
    expect(result.ready).toBe(true);
  });

  it("blocks unreconciled QC, over-release, hold, failure and packaging pending", () => {
    const result = evaluateQualityRelease({
      presentedQuantity: 10,
      passedQuantity: 9,
      failedQuantity: 2,
      onHoldQuantity: 1,
      releaseQuantity: 10,
      serialTrackingRequired: false,
      serialNumbers: [],
      packagingReady: false,
      requireAllPresentedPassed: true,
    });
    expect(issueCodes(result.issues)).toEqual(
      expect.arrayContaining([
        "QC_QUANTITY_NOT_RECONCILED",
        "RELEASE_EXCEEDS_QC_PASS",
        "QC_PASS_NOT_FULLY_RELEASED",
        "QC_HOLD_REMAINS",
        "QC_NOT_ALL_PASSED",
        "PACKAGING_NOT_READY_FOR_RELEASE",
      ]),
    );
  });

  it("blocks blank, duplicate, missing and fractional serialized output", () => {
    const result = evaluateQualityRelease({
      presentedQuantity: "2.5",
      passedQuantity: "2.5",
      failedQuantity: 0,
      onHoldQuantity: 0,
      releaseQuantity: "2.5",
      serialTrackingRequired: true,
      serialNumbers: ["SER-1", " SER-1 ", ""],
      packagingReady: true,
    });
    expect(issueCodes(result.issues)).toEqual(
      expect.arrayContaining([
        "SERIAL_QUANTITY_NOT_INTEGER",
        "BLANK_SERIAL_NUMBER",
        "DUPLICATE_SERIAL_NUMBER",
      ]),
    );

    const missing = evaluateQualityRelease({
      presentedQuantity: 2,
      passedQuantity: 2,
      failedQuantity: 0,
      onHoldQuantity: 0,
      releaseQuantity: 2,
      serialTrackingRequired: true,
      serialNumbers: ["ONLY-ONE"],
      packagingReady: true,
    });
    expect(issueCodes(missing.issues)).toContain("SERIAL_COUNT_MISMATCH");
  });
});

function closeInput(
  overrides: Partial<CloseReadinessInput> = {},
): CloseReadinessInput {
  return {
    plannedOutputQuantity: 10,
    producedQuantity: 10,
    acceptedQuantity: 10,
    rejectedOrScrappedOutputQuantity: 0,
    cancelledOutputQuantity: 0,
    openReworkQuantity: 0,
    releasedFinishedGoodsQuantity: 10,
    outstandingReservationQuantity: 0,
    pendingDocumentCount: 0,
    materialReconciliations: ["BODY", "POWER", "COMPRESSOR"].map(
      (materialId) => ({
        materialId,
        requiredQuantity: 10,
        issuedQuantity: 10,
        consumedQuantity: 10,
        returnedQuantity: 0,
        scrappedQuantity: 0,
        varianceApproved: false,
      }),
    ),
    qualityRelease: readyQuality(),
    packaging: evaluatePackagingActuals({
      required: false,
      actualIssuePosted: false,
    }),
    wipQuantity: 0,
    wipValue: 0,
    finishedGoodsInventoryValue: "5235317.46",
    productionCostLedgerValue: "5235317.4610",
    journalDebitTotal: "10470634.92",
    journalCreditTotal: "10470634.92",
    periodOpen: true,
    ...overrides,
  };
}

describe("production close readiness", () => {
  it("clears WIP for the 10-fridge lifecycle when RM, WIP and FG share one physical warehouse", () => {
    const warehouseId = "shared-warehouse";
    const transactions = fridgeMwaMaterials.flatMap((material) => {
      const value = new Prisma.Decimal(material.mwaUnitCost).mul(10);
      return [
        {
          status: "POSTED",
          transactionType: "MATERIAL_ISSUE",
          lines: [
            {
              inventoryItemId: material.materialId,
              orderMaterialId: material.materialId,
              stockMovements: [
                {
                  warehouseId,
                  movementType: "OUT",
                  quantity: 10,
                  movementValue: value,
                },
                {
                  warehouseId,
                  movementType: "IN",
                  quantity: 10,
                  movementValue: value,
                },
              ],
            },
          ],
        },
        {
          status: "POSTED",
          transactionType: "PRODUCTION_RECEIPT",
          lines: [
            {
              inventoryItemId: material.materialId,
              orderMaterialId: material.materialId,
              stockMovements: [
                {
                  warehouseId,
                  movementType: "OUT",
                  quantity: 10,
                  movementValue: value,
                },
              ],
            },
            {
              inventoryItemId: "FRIDGE",
              orderMaterialId: null,
              stockMovements: [
                {
                  warehouseId,
                  movementType: "IN",
                  quantity: 10,
                  movementValue: value,
                },
              ],
            },
          ],
        },
      ];
    });
    const result = calculateManufacturingWipBalance(transactions, warehouseId);
    expect(result.quantity.toString()).toBe("0");
    expect(result.value.toString()).toBe("0");
  });

  it("counts only semantic WIP legs when production warehouses are separate", () => {
    const result = calculateManufacturingWipBalance(
      [
        {
          status: "POSTED",
          transactionType: "MATERIAL_ISSUE",
          lines: [
            {
              inventoryItemId: "BODY",
              orderMaterialId: "BODY",
              stockMovements: [
                {
                  warehouseId: "rm",
                  movementType: "OUT",
                  quantity: 10,
                  movementValue: 100,
                },
                {
                  warehouseId: "wip",
                  movementType: "IN",
                  quantity: 10,
                  movementValue: 100,
                },
              ],
            },
          ],
        },
      ],
      "wip",
    );
    expect(result.quantity.toString()).toBe("10");
    expect(result.value.toString()).toBe("100");
  });

  it("aggregates the latest serial QC per lot and prefers an explicit aggregate lot inspection", () => {
    const serialInspections = Array.from({ length: 10 }, (_, index) => ({
      id: `qc-${index}`,
      orderLotId:
        index < 2
          ? "LOT-A"
          : index < 5
            ? "LOT-B"
            : index < 8
              ? "LOT-C"
              : "LOT-D",
      inspectionType: "FINISHED_GOOD",
      serialId: `serial-${index}`,
      status: "PASSED",
      sampleQuantity: 1,
      acceptedQuantity: 1,
      rejectedQuantity: 0,
      inspectedAt: `2026-09-18T00:00:${String(index).padStart(2, "0")}Z`,
      createdAt: `2026-09-18T00:00:${String(index).padStart(2, "0")}Z`,
    }));
    for (const lot of fridgeLots) {
      const summary = summarizeLotQualityInspections(
        serialInspections,
        lot.lotId,
      )!;
      expect(summary.status).toBe("PASSED");
      expect(summary.sampleQuantity.toString()).toBe(
        String(lot.outputQuantity),
      );
      expect(summary.acceptedQuantity.toString()).toBe(
        String(lot.outputQuantity),
      );
      expect(summary.rejectedQuantity.toString()).toBe("0");
    }

    const aggregate = {
      ...serialInspections[0],
      id: "aggregate",
      serialId: null,
      sampleQuantity: 2,
      acceptedQuantity: 1,
      rejectedQuantity: 1,
      status: "FAILED",
      inspectedAt: "2026-09-18T01:00:00Z",
    };
    expect(
      summarizeLotQualityInspections([...serialInspections, aggregate], "LOT-A")
        ?.id,
    ).toBe("aggregate");
  });

  it("closes the fully reconciled 10-fridge material-only plan", () => {
    const result = evaluateCloseReadiness(closeInput());
    expect(result).toEqual({ ready: true, issues: [] });
    expect(() => assertCloseReady(closeInput())).not.toThrow();
  });

  it.each([
    ["closed period", { periodOpen: false }, "MANUFACTURING_PERIOD_CLOSED"],
    [
      "pending document",
      { pendingDocumentCount: 1 },
      "PENDING_PRODUCTION_DOCUMENTS",
    ],
    [
      "reservation",
      { outstandingReservationQuantity: 1 },
      "OUTSTANDING_RESERVATIONS",
    ],
    [
      "open rework",
      { openReworkQuantity: 1, producedQuantity: 11 },
      "OPEN_REWORK_REMAINS",
    ],
    [
      "planned quantity",
      { acceptedQuantity: 9 },
      "PLANNED_OUTPUT_NOT_RECONCILED",
    ],
    [
      "produced quantity",
      { producedQuantity: 9 },
      "PRODUCED_OUTPUT_NOT_RECONCILED",
    ],
    [
      "unreleased FG",
      { releasedFinishedGoodsQuantity: 9 },
      "FINISHED_GOODS_NOT_FULLY_RELEASED",
    ],
    ["WIP quantity", { wipQuantity: 1 }, "WIP_QUANTITY_NOT_ZERO"],
    ["WIP value", { wipValue: "0.000001" }, "WIP_VALUE_NOT_ZERO"],
    [
      "FG cost mismatch",
      { finishedGoodsInventoryValue: "5235317.45" },
      "FINISHED_GOODS_COST_NOT_RECONCILED",
    ],
    [
      "journal imbalance",
      { journalCreditTotal: "10470634.91" },
      "MANUFACTURING_JOURNAL_UNBALANCED",
    ],
  ] as const)("blocks close for %s", (_name, overrides, expectedCode) => {
    const result = evaluateCloseReadiness(closeInput(overrides));
    expect(result.ready).toBe(false);
    expect(issueCodes(result.issues)).toContain(expectedCode);
  });

  it("requires issue/return/consume/scrap reconciliation and explicit variance approval", () => {
    const unreconciled = closeInput();
    unreconciled.materialReconciliations[0] = {
      ...unreconciled.materialReconciliations[0],
      issuedQuantity: 10,
      consumedQuantity: 8,
      returnedQuantity: 1,
      scrappedQuantity: 0,
    };
    expect(issueCodes(evaluateCloseReadiness(unreconciled).issues)).toContain(
      "MATERIAL_ISSUE_NOT_RECONCILED",
    );

    const unapprovedVariance = closeInput();
    unapprovedVariance.materialReconciliations[0] = {
      ...unapprovedVariance.materialReconciliations[0],
      issuedQuantity: 11,
      consumedQuantity: 10,
      returnedQuantity: 0,
      scrappedQuantity: 1,
    };
    expect(
      issueCodes(evaluateCloseReadiness(unapprovedVariance).issues),
    ).toContain("MATERIAL_VARIANCE_NOT_APPROVED");

    unapprovedVariance.materialReconciliations[0].varianceApproved = true;
    expect(evaluateCloseReadiness(unapprovedVariance).ready).toBe(true);
  });

  it("propagates required packaging and QC/serial blockers into close", () => {
    const packagingPending = evaluateCloseReadiness(
      closeInput({
        packaging: evaluatePackagingActuals({
          required: true,
          actualIssuePosted: false,
        }),
      }),
    );
    expect(issueCodes(packagingPending.issues)).toContain(
      "PACKAGING_ACTUAL_PENDING",
    );

    const qualityBlocked = evaluateCloseReadiness(
      closeInput({
        qualityRelease: evaluateQualityRelease({
          presentedQuantity: 10,
          passedQuantity: 10,
          failedQuantity: 0,
          onHoldQuantity: 0,
          releaseQuantity: 10,
          serialTrackingRequired: true,
          serialNumbers: ["ONE"],
          packagingReady: true,
        }),
      }),
    );
    expect(issueCodes(qualityBlocked.issues)).toContain(
      "SERIAL_COUNT_MISMATCH",
    );
  });

  it("requires material reconciliation rows and rejects duplicate rows", () => {
    const missing = evaluateCloseReadiness(
      closeInput({ materialReconciliations: [] }),
    );
    expect(issueCodes(missing.issues)).toContain(
      "MATERIAL_RECONCILIATION_MISSING",
    );

    const duplicate = closeInput();
    duplicate.materialReconciliations.push({
      ...duplicate.materialReconciliations[0],
    });
    expect(() => evaluateCloseReadiness(duplicate)).toThrowError(
      /appears more than once/,
    );
  });

  it("throws a reusable domain error containing every close blocker", () => {
    try {
      assertCloseReady(
        closeInput({ periodOpen: false, wipValue: 1, journalCreditTotal: 0 }),
      );
      expect.fail("close should have been blocked");
    } catch (error) {
      expect(error).toBeInstanceOf(ManufacturingDomainError);
      const domainError = error as ManufacturingDomainError;
      expect(domainError.code).toBe("PRODUCTION_CLOSE_BLOCKED");
      expect(issueCodes(domainError.issues)).toEqual(
        expect.arrayContaining([
          "MANUFACTURING_PERIOD_CLOSED",
          "WIP_VALUE_NOT_ZERO",
          "MANUFACTURING_JOURNAL_UNBALANCED",
        ]),
      );
    }
  });
});
