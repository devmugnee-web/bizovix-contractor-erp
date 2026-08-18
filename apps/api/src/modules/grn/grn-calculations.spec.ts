import { BadRequestException } from "@nestjs/common";
import { GrnInspectionStatus } from "@bizovix/database";
import { assertQtyBreakdownBalanced, calculateGrnItemLine, computeInspectionStatus } from "./grn-calculations";

const ceiling = (orderedQty: number) => ({ itemName: "LED Display Panel", unit: "PCS", orderedQty });

describe("calculateGrnItemLine (master task test case M/N — partial receipt lineage)", () => {
  it("matches the master task's own worked example: PO 100, GRN1 60, GRN2 40 -> fully received", () => {
    const first = calculateGrnItemLine(ceiling(100), 0, 60);
    expect(first.cumulativeReceivedQty.toNumber()).toBe(60);
    expect(first.remainingQty.toNumber()).toBe(40);

    const second = calculateGrnItemLine(ceiling(100), 60, 40);
    expect(second.cumulativeReceivedQty.toNumber()).toBe(100);
    expect(second.remainingQty.toNumber()).toBe(0);
  });

  it("rejects a GRN that would push cumulative received past the ordered quantity", () => {
    expect(() => calculateGrnItemLine(ceiling(100), 90, 20)).toThrow(BadRequestException);
  });

  it("allows receiving exactly up to the ceiling", () => {
    const result = calculateGrnItemLine(ceiling(100), 90, 10);
    expect(result.cumulativeReceivedQty.toNumber()).toBe(100);
    expect(result.remainingQty.toNumber()).toBe(0);
  });

  it("rejects a negative current received quantity", () => {
    expect(() => calculateGrnItemLine(ceiling(100), 0, -5)).toThrow(BadRequestException);
  });
});

describe("assertQtyBreakdownBalanced", () => {
  it("passes when accepted + rejected + damaged equals current received", () => {
    expect(() => assertQtyBreakdownBalanced("Item", { currentReceivedQty: 60, acceptedQty: 55, rejectedQty: 3, damagedQty: 2 })).not.toThrow();
  });

  it("throws when the breakdown does not sum to the received quantity", () => {
    expect(() => assertQtyBreakdownBalanced("Item", { currentReceivedQty: 60, acceptedQty: 55, rejectedQty: 3, damagedQty: 0 })).toThrow(BadRequestException);
  });
});

describe("computeInspectionStatus (master task test case — simple inspection outcomes)", () => {
  it("computes ACCEPTED when every item is fully accepted with no rejects/damage", () => {
    expect(computeInspectionStatus([{ currentReceivedQty: 60, acceptedQty: 60, rejectedQty: 0, damagedQty: 0 }])).toBe(GrnInspectionStatus.ACCEPTED);
  });

  it("computes REJECTED when every item has zero accepted quantity", () => {
    expect(computeInspectionStatus([{ currentReceivedQty: 10, acceptedQty: 0, rejectedQty: 10, damagedQty: 0 }])).toBe(GrnInspectionStatus.REJECTED);
  });

  it("computes PARTIAL for a mixed accept/reject/damage outcome", () => {
    expect(computeInspectionStatus([{ currentReceivedQty: 60, acceptedQty: 55, rejectedQty: 3, damagedQty: 2 }])).toBe(GrnInspectionStatus.PARTIAL);
  });

  it("computes PARTIAL across multiple items when only some are fully accepted", () => {
    expect(
      computeInspectionStatus([
        { currentReceivedQty: 60, acceptedQty: 60, rejectedQty: 0, damagedQty: 0 },
        { currentReceivedQty: 10, acceptedQty: 0, rejectedQty: 10, damagedQty: 0 },
      ]),
    ).toBe(GrnInspectionStatus.PARTIAL);
  });
});
