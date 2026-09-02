import { describe, expect, it } from "vitest";

import {
  buildMaterialPostingLines,
  materialHandlingStageForView,
} from "./manufacturing-materials-workspace";
import { isMaterialExceptionView } from "./manufacturing-material-exceptions-workspace";

describe("manufacturing material handling route presets", () => {
  it.each([
    ["material-staging", "STAGED"],
    ["dispensing-verification", "VERIFIED"],
    ["material-issue", "ISSUE_SCAN"],
    ["weighing-and-dispensing", "ISSUE_SCAN"],
    ["unused-material-return", "RETURN_SCAN"],
  ] as const)("opens %s at the controlled %s step", (view, stage) => {
    expect(materialHandlingStageForView(view)).toBe(stage);
  });

  it.each([
    "additional-material-issue",
    "material-consumption",
    "material-substitution",
    "material-reconciliation",
    "stock-status-transfer",
    "rejected-material-and-destruction",
  ])("routes %s to a dedicated persisted material control", (view) => {
    expect(isMaterialExceptionView(view)).toBe(true);
    expect(() => materialHandlingStageForView(view)).toThrow(
      "Unsupported material-handling route",
    );
  });

  it("sends only the persisted staged child-lot ID into material issue", () => {
    const common = {
      sourceDocumentLineId: "approved-line-1",
      orderMaterialId: "order-material-1",
      inventoryItemId: "raw-item-1",
      itemCode: "RM-001",
      itemName: "Steel sheet",
      lotLocationName: "Location",
      expiresAt: null,
      unit: "pcs",
      lotAvailableQuantity: 10,
      lotReservedQuantity: 10,
      lotBalances: [],
    };
    const lines = [
      {
        ...common,
        id: "released-line",
        inventoryLotId: "released-parent-lot",
        lotNumber: "RM-LOT-001",
        lotLocationId: "rm-rel",
        lotLocationCode: "RM-REL",
        lotDisposition: "RELEASED",
        quantity: 6,
      },
      {
        ...common,
        id: "staged-line",
        inventoryLotId: "staged-child-lot",
        lotNumber: "RM-LOT-001-STG",
        lotLocationId: "rm-stg",
        lotLocationCode: "RM-STG",
        lotDisposition: "STAGING",
        quantity: 4,
      },
    ];

    expect(
      buildMaterialPostingLines(
        lines,
        { "released-line": "6", "staged-line": "4" },
        "production-lot-1",
        "ISSUE_MATERIALS",
      ),
    ).toEqual([
      expect.objectContaining({
        inventoryLotId: "staged-child-lot",
        orderLotId: "production-lot-1",
        quantity: 4,
      }),
    ]);
  });

  it("returns only the posted issued-but-not-returned balance of a staged child lot", () => {
    const line = {
      id: "staged-line",
      sourceDocumentLineId: "approved-line-1",
      orderMaterialId: "order-material-1",
      inventoryItemId: "raw-item-1",
      itemCode: "RM-001",
      itemName: "Steel sheet",
      inventoryLotId: "staged-child-lot",
      lotNumber: "RM-LOT-001-STG",
      lotLocationId: "rm-stg",
      lotLocationCode: "RM-STG",
      lotLocationName: "Staging",
      lotDisposition: "STAGING",
      expiresAt: null,
      quantity: 0,
      unit: "pcs",
      lotAvailableQuantity: 2,
      lotReservedQuantity: 0,
      lotBalances: [
        {
          orderLotId: "production-lot-1",
          issuedQuantity: 4,
          returnedQuantity: 2,
          returnableQuantity: 2,
        },
      ],
    };

    expect(
      buildMaterialPostingLines(
        [line],
        { "staged-line": "2" },
        "production-lot-1",
        "RETURN_MATERIALS",
      ),
    ).toEqual([
      expect.objectContaining({
        inventoryLotId: "staged-child-lot",
        quantity: 2,
      }),
    ]);
    expect(() =>
      buildMaterialPostingLines(
        [line],
        { "staged-line": "3" },
        "production-lot-1",
        "RETURN_MATERIALS",
      ),
    ).toThrow("issued-but-not-returned balance (2 pcs)");
  });
});
