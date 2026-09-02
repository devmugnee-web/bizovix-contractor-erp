import { describe, expect, it } from "vitest";

import type { LedgerOption } from "@/types/accounts";
import type { ManufacturingMode } from "@/types/manufacturing";

import {
  MANUFACTURING_INVENTORY_CONTROL_CODE,
  manufacturingInventoryControlLedger,
  manufacturingSettingRequirement,
  manufacturingSettingsLedgerOptions,
} from "./manufacturing-control-center-workspaces";

function ledger(
  id: string,
  overrides: Partial<LedgerOption> = {},
): LedgerOption {
  return {
    id,
    code: id,
    name: id,
    path: id,
    level: "LEDGER",
    parentId: null,
    nature: "ASSET",
    isSystem: false,
    isControlAccount: false,
    requiresItemDetails: false,
    status: "ACTIVE",
    sortOrder: 10,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Manufacturing setup requirement labels", () => {
  const modes: ManufacturingMode[] = ["GENERAL", "PHARMACEUTICAL", "HYBRID"];

  it("always identifies the core readiness mappings", () => {
    for (const mode of modes) {
      expect(manufacturingSettingRequirement(mode, "CORE")).toBe(
        "Required for readiness",
      );
    }
  });

  it("requires regulated mappings only outside General mode", () => {
    expect(manufacturingSettingRequirement("GENERAL", "REGULATED")).toBe(
      "Optional in General mode",
    );
    for (const mode of ["PHARMACEUTICAL", "HYBRID"] as const) {
      expect(manufacturingSettingRequirement(mode, "REGULATED")).toBe(
        "Required in Pharmaceutical / Hybrid mode",
      );
    }
  });

  it("keeps cost and exception mappings optional until used", () => {
    for (const mode of modes) {
      expect(manufacturingSettingRequirement(mode, "OPTIONAL")).toBe(
        "Optional until the related cost or exception is used",
      );
    }
  });
});

describe("Manufacturing setup ledger ownership", () => {
  const inventoryControl = ledger("inventory-control", {
    code: MANUFACTURING_INVENTORY_CONTROL_CODE,
    name: "Inventory Control",
    isSystem: true,
    isControlAccount: true,
  });
  const wip = ledger("wip", { name: "Manufacturing WIP" });
  const expense = ledger("variance", {
    nature: "DIRECT_EXPENSE",
    name: "Manufacturing Variance",
  });
  const otherControl = ledger("receivable-control", {
    code: "1211001",
    isSystem: true,
    isControlAccount: true,
  });

  it("recognizes only the exact active protected Inventory Control ledger", () => {
    expect(
      manufacturingInventoryControlLedger([
        ledger("same-code-custom", {
          code: MANUFACTURING_INVENTORY_CONTROL_CODE,
          isControlAccount: true,
        }),
        ledger("same-name-wrong-code", {
          name: "Inventory Control",
          isSystem: true,
          isControlAccount: true,
        }),
        inventoryControl,
      ]),
    ).toBe(inventoryControl);
  });

  it("auto-offers Inventory Control for every server-owned stock mapping", () => {
    const ledgers = [inventoryControl, wip, expense, otherControl];
    for (const key of [
      "rawMaterialInventoryAccountId",
      "packagingInventoryAccountId",
      "finishedGoodsInventoryAccountId",
      "scrapRecoveryAccountId",
    ] as const) {
      expect(manufacturingSettingsLedgerOptions(key, ledgers)).toEqual([
        inventoryControl,
      ]);
    }
  });

  it("keeps WIP on a non-control ASSET and excludes controls from manual mappings", () => {
    const ledgers = [inventoryControl, wip, expense, otherControl];
    expect(
      manufacturingSettingsLedgerOptions("wipInventoryAccountId", ledgers).map(
        (entry) => entry.id,
      ),
    ).toEqual(["wip"]);
    expect(
      manufacturingSettingsLedgerOptions(
        "manufacturingVarianceAccountId",
        ledgers,
      ).map((entry) => entry.id),
    ).toEqual(["wip", "variance"]);
  });
});
