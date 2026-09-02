import { describe, expect, it } from "vitest";

import {
  qualityCaseMaterialLinkValues,
  qualityCaseOrderLinkValues,
} from "./manufacturing-quality-case-form";

describe("qualityCaseMaterialLinkValues", () => {
  it("copies authoritative material linkage into variance evidence", () => {
    expect(
      qualityCaseMaterialLinkValues({
        id: "order-material-1",
        inventoryItemId: "item-1",
        unit: "PCS",
      } as Parameters<typeof qualityCaseMaterialLinkValues>[0]),
    ).toEqual({
      orderMaterialId: "order-material-1",
      inventoryItemId: "item-1",
      approvedVarianceUnit: "PCS",
      sourceReference: "order-material-1",
    });
  });

  it("clears stale material variance linkage whenever the order changes", () => {
    expect(
      qualityCaseOrderLinkValues(
        {
          id: "order-2",
          orderNumber: "MO-002",
          finishedProductId: "finished-2",
        } as Parameters<typeof qualityCaseOrderLinkValues>[0],
        "order-2",
      ),
    ).toMatchObject({
      productionOrderId: "order-2",
      inventoryItemId: "finished-2",
      sourceReference: "MO-002",
      orderMaterialId: "",
      approvedVarianceQuantity: "",
      approvedVarianceUnit: "",
      varianceReason: "",
    });
  });
});
