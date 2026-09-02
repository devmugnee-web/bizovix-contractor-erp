import { describe, expect, it } from "vitest";

import { toPaisa } from "../accounting/money.util.js";
import {
  allocatePaisaByWeight,
  calculateCostDriverAmount,
  calculateFinalSnapshot,
} from "./manufacturing-cost-report.domain.js";

describe("manufacturing actual-cost money rules", () => {
  it("calculates driver evidence at six decimals and posts exact paisa", () => {
    const labour = calculateCostDriverAmount({
      basis: "LABOUR_HOURS",
      rate: "137.345678",
      basisQuantity: "7.3333",
    });
    expect(labour.exactAmount.toFixed(6)).toBe("1007.197060");
    expect(labour.amountPaisa).toBe(100720n);
    expect(labour.postingAmount.toFixed(2)).toBe("1007.20");
  });

  it("allocates every paisa deterministically across receipt quantities", () => {
    const rows = allocatePaisaByWeight(10001n, [
      { id: "LOT-A", weight: 2 },
      { id: "LOT-B", weight: 3 },
      { id: "LOT-C", weight: 3 },
      { id: "LOT-D", weight: 2 },
    ]);
    expect(rows).toEqual([
      { id: "LOT-A", amountPaisa: 2000n },
      { id: "LOT-B", amountPaisa: 3001n },
      { id: "LOT-C", amountPaisa: 3000n },
      { id: "LOT-D", amountPaisa: 2000n },
    ]);
    expect(rows.reduce((sum, row) => sum + row.amountPaisa, 0n)).toBe(10001n);
  });

  it("keeps actual components, allocation residue and standard variance explicit", () => {
    const result = calculateFinalSnapshot(
      {
        materialCost: "5235317.461",
        packagingCost: "80000",
        labourCost: "100000",
        machineCost: "50000",
        overheadCost: "25000",
        subcontractCost: 0,
        otherCost: 0,
        allocationVariance: "-0.001",
      },
      "5400000",
    );
    expect(result.totalCost.toFixed(6)).toBe("5490317.460000");
    expect(result.varianceAmount.toFixed(6)).toBe("90317.460000");
    expect(toPaisa(result.totalCost)).toBe(549031746n);
  });
});
