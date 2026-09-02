import { describe, expect, it } from "vitest";

import type { ManufacturingProductionOrderRecord } from "@/types/manufacturing";

import {
  isLegacyUnboundDraftManufacturingRun,
  isManufacturingRunVisiblyUntouched,
  manufacturingWorkflowStartOrderIneligibility,
  summarizeManufacturingWorkflowOrderIneligibility,
  type ManufacturingWorkflowStartOrderCandidate,
} from "./manufacturing-workflow-order-eligibility";

function order(
  overrides: Partial<ManufacturingWorkflowStartOrderCandidate> = {},
): ManufacturingWorkflowStartOrderCandidate {
  return {
    id: "order-1",
    orderType: "ASSEMBLY",
    status: "APPROVED",
    routingVersionId: "routing-v1",
    operationExecutions: [
      { id: "operation-1" },
    ] as ManufacturingProductionOrderRecord["operationExecutions"],
    ...overrides,
  };
}

const noActiveRuns = new Set<string>();

describe("manufacturing workflow order eligibility", () => {
  it("accepts a routed order with a materialized operation", () => {
    expect(
      manufacturingWorkflowStartOrderIneligibility(order(), {
        manufacturingMode: "GENERAL",
        activeRunOrderIds: noActiveRuns,
      }),
    ).toBeNull();
  });

  it("requires a routing reference and at least one operation execution", () => {
    expect(
      manufacturingWorkflowStartOrderIneligibility(
        order({ routingVersionId: null }),
        { manufacturingMode: "GENERAL", activeRunOrderIds: noActiveRuns },
      ),
    ).toBe("ROUTING_REQUIRED");
    expect(
      manufacturingWorkflowStartOrderIneligibility(
        order({ operationExecutions: [] }),
        { manufacturingMode: "GENERAL", activeRunOrderIds: noActiveRuns },
      ),
    ).toBe("ROUTING_OPERATIONS_REQUIRED");
  });

  it("excludes orders with an active run, terminal orders and mode mismatches", () => {
    expect(
      manufacturingWorkflowStartOrderIneligibility(order(), {
        manufacturingMode: "GENERAL",
        activeRunOrderIds: new Set(["order-1"]),
      }),
    ).toBe("ACTIVE_RUN_EXISTS");
    expect(
      manufacturingWorkflowStartOrderIneligibility(
        order({ status: "COMPLETED" }),
        { manufacturingMode: "GENERAL", activeRunOrderIds: noActiveRuns },
      ),
    ).toBe("TERMINAL_ORDER");
    expect(
      manufacturingWorkflowStartOrderIneligibility(
        order({ orderType: "PHARMACEUTICAL" }),
        { manufacturingMode: "GENERAL", activeRunOrderIds: noActiveRuns },
      ),
    ).toBe("MODE_MISMATCH");
  });

  it("summarizes every hidden-order reason without hiding context", () => {
    expect(
      summarizeManufacturingWorkflowOrderIneligibility([
        "ROUTING_REQUIRED",
        "ROUTING_REQUIRED",
        "ACTIVE_RUN_EXISTS",
      ]),
    ).toBe("2 need an approved routing; 1 already have an active run");
  });

  it("recognizes only an unbound draft as a legacy discard candidate", () => {
    const candidate = {
      status: "DRAFT" as const,
      productionOrderId: null,
      productionPlanId: null,
      productId: null,
    };
    expect(isLegacyUnboundDraftManufacturingRun(candidate)).toBe(true);
    expect(
      isLegacyUnboundDraftManufacturingRun({
        ...candidate,
        productionOrderId: "order-1",
      }),
    ).toBe(false);
    expect(
      isLegacyUnboundDraftManufacturingRun({
        ...candidate,
        status: "CANCELLED",
      }),
    ).toBe(false);
  });

  it("does not treat a run step with visible workflow activity as empty", () => {
    const untouchedStep = {
      occurrenceKey: "PRIMARY",
      status: "READY" as const,
      sourceRecordType: null,
      sourceRecordId: null,
      startedAt: null,
      completedAt: null,
      completedBy: null,
      approvedBy: null,
      signatureReference: null,
      version: 1,
    };
    expect(isManufacturingRunVisiblyUntouched({ steps: [untouchedStep] })).toBe(
      true,
    );
    expect(
      isManufacturingRunVisiblyUntouched({
        steps: [{ ...untouchedStep, sourceRecordId: "evidence-1" }],
      }),
    ).toBe(false);
    expect(
      isManufacturingRunVisiblyUntouched({
        steps: [{ ...untouchedStep, occurrenceKey: "LOT-2" }],
      }),
    ).toBe(false);
  });
});
