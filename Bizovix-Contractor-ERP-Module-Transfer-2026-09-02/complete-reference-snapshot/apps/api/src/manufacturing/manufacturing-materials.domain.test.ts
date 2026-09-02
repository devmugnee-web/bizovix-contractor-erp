import { describe, expect, it } from "vitest";

import {
  allocateMaterialLots,
  manufacturingOrderStatusAfterReservation,
  validateIncomingInspection,
  validateMaterialHandlingIdentity,
} from "./manufacturing-materials.domain.js";

describe("manufacturing material lot allocation", () => {
  const lots = [
    {
      id: "old",
      lotNumber: "RM-001",
      availableQuantity: 7,
      reservedQuantity: 2,
      receivedAt: new Date("2026-09-01"),
      expiresAt: new Date("2027-12-01"),
    },
    {
      id: "new",
      lotNumber: "RM-002",
      availableQuantity: 8,
      reservedQuantity: 0,
      receivedAt: new Date("2026-09-02"),
      expiresAt: new Date("2027-01-01"),
    },
  ];

  it("uses unreserved stock in FIFO receipt order", () => {
    const result = allocateMaterialLots(lots, 10, "FIFO");
    expect(
      result.allocations.map((row) => [row.id, row.suggestedQuantity]),
    ).toEqual([
      ["old", 5],
      ["new", 5],
    ]);
    expect(result.shortageQuantity).toBe(0);
  });

  it("uses the earliest expiry first for FEFO", () => {
    const result = allocateMaterialLots(lots, 10, "FEFO");
    expect(
      result.allocations.map((row) => [row.id, row.suggestedQuantity]),
    ).toEqual([
      ["new", 8],
      ["old", 2],
    ]);
  });

  it("treats an earlier retest-due date as the FEFO use-by boundary", () => {
    const result = allocateMaterialLots(
      [
        ...lots,
        {
          id: "retest-first",
          lotNumber: "RM-003",
          availableQuantity: 2,
          reservedQuantity: 0,
          receivedAt: new Date("2026-09-03"),
          retestDueAt: new Date("2026-12-01"),
          expiresAt: new Date("2028-01-01"),
        },
      ],
      3,
      "FEFO",
    );
    expect(result.allocations[0]?.id).toBe("retest-first");
    expect(result.allocations[0]?.suggestedQuantity).toBe(2);
  });

  it("reports shortage without inventing stock", () => {
    const result = allocateMaterialLots(lots, 20, "FIFO");
    expect(result.allocatedQuantity).toBe(13);
    expect(result.shortageQuantity).toBe(7);
  });
});

describe("incoming material inspection", () => {
  it("accepts a fully reconciled released lot", () => {
    expect(
      validateIncomingInspection({
        heldQuantity: 15,
        sampleQuantity: 2,
        acceptedQuantity: 15,
        rejectedQuantity: 0,
        decision: "RELEASED",
        results: [{ actualText: "Conforms", passed: true }],
      }),
    ).toEqual([]);
  });

  it("rejects an unreconciled decision", () => {
    const issues = validateIncomingInspection({
      heldQuantity: 15,
      sampleQuantity: 2,
      acceptedQuantity: 14,
      rejectedQuantity: 0,
      decision: "RELEASED",
      results: [{ actualText: "Conforms", passed: true }],
    });
    expect(issues.some((issue) => issue.includes("reconcile"))).toBe(true);
  });

  it("requires a failed result and reason for rejection", () => {
    const issues = validateIncomingInspection({
      heldQuantity: 1,
      sampleQuantity: 1,
      acceptedQuantity: 0,
      rejectedQuantity: 1,
      decision: "REJECTED",
      results: [{ actualText: "Conforms", passed: true }],
    });
    expect(issues).toContain(
      "A REJECTED decision requires at least one failed result.",
    );
    expect(issues).toContain("A rejection reason is required.");
  });

  it("requires a persisted actual observation", () => {
    const issues = validateIncomingInspection({
      heldQuantity: 1,
      sampleQuantity: 1,
      acceptedQuantity: 1,
      rejectedQuantity: 0,
      decision: "RELEASED",
      results: [{ passed: true }],
    });
    expect(issues).toContain(
      "Every inspection result requires an actual numeric or text result.",
    );
  });
});

describe("manufacturing order reservation lifecycle", () => {
  it("promotes a fully covered approved order to reserved", () => {
    expect(manufacturingOrderStatusAfterReservation("APPROVED", true)).toBe(
      "RESERVED",
    );
  });

  it.each(["RESERVED", "ISSUED", "IN_PRODUCTION", "COMPLETED"])(
    "does not regress a progressed %s order after a late top-up reservation",
    (status) => {
      expect(manufacturingOrderStatusAfterReservation(status, true)).toBe(
        status,
      );
    },
  );

  it("does not promote an approved order until every material is covered", () => {
    expect(manufacturingOrderStatusAfterReservation("APPROVED", false)).toBe(
      "APPROVED",
    );
  });
});

describe("material handling evidence identity", () => {
  const exact = {
    requisitionLineId: "line-a",
    expectedRequisitionLineId: "line-a",
    inventoryItemId: "item-a",
    expectedInventoryItemId: "item-a",
    inventoryLotId: "lot-a",
    expectedInventoryLotId: "lot-a",
    itemCode: "RM-001",
    lotNumber: "REL-LOT-01",
    scannedCode: "RM-001:REL-LOT-01",
  };

  it("accepts the exact requisition line, material, source lot and persisted scan code", () => {
    expect(validateMaterialHandlingIdentity(exact)).toEqual([]);
  });

  it("rejects cross-material and cross-lot evidence", () => {
    expect(
      validateMaterialHandlingIdentity({
        ...exact,
        inventoryItemId: "item-b",
        inventoryLotId: "lot-b",
        scannedCode: "REL-LOT-02",
      }),
    ).toEqual(
      expect.arrayContaining([
        "Handling evidence references a different material.",
        "Handling evidence references a different source inventory lot.",
        "Scanned code does not match the persisted material source lot.",
      ]),
    );
  });
});
