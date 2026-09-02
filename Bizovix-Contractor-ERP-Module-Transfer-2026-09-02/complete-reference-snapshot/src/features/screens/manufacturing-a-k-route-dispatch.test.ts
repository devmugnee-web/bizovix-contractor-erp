import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { ManufacturingRunStepTransitionRecord } from "@/types/manufacturing";

import {
  manufacturingSpecializedWorkspaceOwner,
  previousManufacturingOperationalStep,
  resolveManufacturingRunStepRoute,
} from "./manufacturing-control-center";
import {
  isManufacturingSerialPackagingView,
  manufacturingSerialPackagingWorkspaceKind,
} from "./manufacturing-serial-packaging-workspace";

describe("Manufacturing A-K serial and packaging route dispatch", () => {
  it("routes Step 97 serial preallocation to the real serial-allocation workspace", () => {
    expect(
      manufacturingSerialPackagingWorkspaceKind(
        "quality",
        "serialisation-preallocation",
      ),
    ).toBe("SERIAL_ALLOCATION");
    expect(
      isManufacturingSerialPackagingView(
        "quality",
        "serialisation-preallocation",
      ),
    ).toBe(true);
  });

  it("routes Step 110 Packaging Order and Step 111 eBPR to packaging", () => {
    expect(
      manufacturingSerialPackagingWorkspaceKind("packaging", "packaging-order"),
    ).toBe("PACKAGING");
    expect(
      manufacturingSerialPackagingWorkspaceKind(
        "packaging",
        "batch-packaging-record-ebpr",
      ),
    ).toBe("PACKAGING");
  });

  it("keeps the former eBPR section recognizable during compatibility routing", () => {
    expect(
      manufacturingSerialPackagingWorkspaceKind(
        "execution",
        "batch-packaging-record-ebpr",
      ),
    ).toBe("PACKAGING");
  });

  it("does not claim unrelated Manufacturing routes", () => {
    expect(
      manufacturingSerialPackagingWorkspaceKind("materials", "material-issue"),
    ).toBeNull();
  });
});

describe("Manufacturing A-K specialized workspace ownership", () => {
  it.each([
    [78, "materials", "destruction-approval", "GOVERNANCE"],
    [154, "reports", "audit-trail", "GOVERNANCE"],
    [155, "reports", "validation-documents", "GOVERNANCE"],
    [156, "reports", "audit-trail-review", "GOVERNANCE"],
    [158, "reports", "period-lock", "BLUEPRINT"],
    [159, "reports", "data-retention-and-archive", "BLUEPRINT"],
  ] as const)(
    "routes Step %i %s/%s to %s instead of a broad section workspace",
    (_serial, section, view, owner) => {
      expect(manufacturingSpecializedWorkspaceOwner(section, view)).toBe(owner);
    },
  );

  it.each([
    "production-reports",
    "material-reports",
    "wip-reports",
    "batch-and-lot-reports",
    "costing-reports",
    "quality-reports",
    "compliance-reports",
    "packaging-reports",
    "traceability-reports",
    "executive-analytics",
  ])("keeps the real report %s on the cost/report workspace", (view) => {
    expect(manufacturingSpecializedWorkspaceOwner("reports", view)).toBe(
      "COST_REPORT",
    );
  });

  it.each([
    ["quality/destruction-approval", "materials", "destruction-approval"],
    ["setup/audit-trail", "reports", "audit-trail"],
    ["setup/validation-documents", "reports", "validation-documents"],
    ["setup/audit-trail-review", "reports", "audit-trail-review"],
    ["setup/period-lock", "reports", "period-lock"],
    [
      "setup/data-retention-and-archive",
      "reports",
      "data-retention-and-archive",
    ],
  ] as const)(
    "normalizes the historical %s run-step route",
    (legacyRoute, section, view) => {
      expect(resolveManufacturingRunStepRoute(legacyRoute)).toEqual({
        section,
        view,
      });
      expect(
        resolveManufacturingRunStepRoute(
          `/app/manufacturing/dashboard?section=${legacyRoute.split("/")[0]}&view=${legacyRoute.split("/")[1]}`,
        ),
      ).toEqual({ section, view });
    },
  );
});

function transition(
  id: string,
  flowSerial: number,
  createdAt: string,
): ManufacturingRunStepTransitionRecord {
  return {
    id,
    occurrenceKey: "PRIMARY",
    fromStatus: "READY",
    toStatus: "IN_PROGRESS",
    sourceAction: "START",
    reason: null,
    performedByUserId: "operator-1",
    sourceRecordType: null,
    sourceRecordId: null,
    signatureReference: null,
    createdAt,
    flowSerial,
    title: `Step ${flowSerial}`,
    route: `/app/manufacturing/dashboard?section=dashboard&view=manufacturing-dashboard`,
  };
}

describe("Manufacturing operational Previous navigation", () => {
  it("uses the latest transition on another step, not completedAt snapshots", () => {
    const previous = previousManufacturingOperationalStep(
      [
        transition("older", 12, "2026-08-30T08:00:00.000Z"),
        transition("current", 78, "2026-08-30T11:00:00.000Z"),
        transition("latest-other", 42, "2026-08-30T10:00:00.000Z"),
      ],
      78,
    );

    expect(previous?.id).toBe("latest-other");
    expect(previous?.flowSerial).toBe(42);
  });

  it("can return the prior occurrence of the same repeatable step", () => {
    const earlierOccurrence = {
      ...transition("lot-a", 70, "2026-08-30T10:00:00.000Z"),
      occurrenceKey: "LOT-A",
    };
    const currentOccurrence = {
      ...transition("lot-b", 70, "2026-08-30T11:00:00.000Z"),
      occurrenceKey: "LOT-B",
    };

    expect(
      previousManufacturingOperationalStep(
        [earlierOccurrence, currentOccurrence],
        70,
        "LOT-B",
      )?.id,
    ).toBe("lot-a");
  });
});

describe("Manufacturing dashboard preflight defaults", () => {
  it("uses a neutral one-unit default instead of the canonical UAT quantity", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/features/screens/manufacturing-control-center-workspaces.tsx",
      ),
      "utf8",
    );

    expect(source).toContain(
      'const [preflightQuantity, setPreflightQuantity] = useState("1");',
    );
    expect(source).not.toContain(
      'const [preflightQuantity, setPreflightQuantity] = useState("10");',
    );
  });
});
