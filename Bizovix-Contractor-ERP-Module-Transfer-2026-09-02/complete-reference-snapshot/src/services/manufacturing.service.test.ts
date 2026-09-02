import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/services/api-client";
import {
  approveManufacturingPlan,
  approveManufacturingRoutingVersion,
  approveManufacturingBomVersion,
  calculateManufacturingMrp,
  createManufacturingWorkflowRunStepOccurrence,
  discardEmptyManufacturingWorkflowRun,
  createManufacturingBom,
  createManufacturingBomVersion,
  createManufacturingItemProfile,
  createManufacturingLocation,
  createManufacturingOrder,
  createManufacturingPlan,
  createManufacturingRouting,
  createManufacturingRoutingVersion,
  createManufacturingWorkflowReview,
  getManufacturingAvailability,
  getManufacturingDashboard,
  getManufacturingOrder,
  getManufacturingOrderQualitySpecification,
  getManufacturingReadiness,
  getManufacturingRunPreflight,
  getManufacturingSettings,
  getActiveManufacturingWorkflowDefinition,
  getManufacturingWorkflowConfiguration,
  getManufacturingWorkflowElectronicSignatureContext,
  getManufacturingWorkflowNextAction,
  getManufacturingWorkflowRun,
  getManufacturingWorkflowRunHistory,
  listManufacturingBoms,
  listManufacturingItemProfiles,
  listManufacturingLocations,
  listManufacturingMrpRuns,
  listManufacturingOrders,
  listManufacturingPlans,
  listManufacturingRoutings,
  listManufacturingWorkflowReviews,
  listManufacturingWorkflowRuns,
  performManufacturingOrderAction,
  startManufacturingWorkflowRun,
  transitionManufacturingWorkflowRunStep,
  updateManufacturingWorkflowConfiguration,
  updateManufacturingSettings,
} from "@/services/manufacturing.service";

vi.mock("@/services/api-client", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

describe("manufacturing service API contract", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({} as never);
  });

  it("scopes readiness, dashboard and settings reads to the workspace", async () => {
    await getManufacturingReadiness("workspace / one");
    await getManufacturingDashboard("workspace / one");
    await getManufacturingSettings("workspace / one");

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/readiness?workspaceId=workspace+%2F+one",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/dashboard?workspaceId=workspace+%2F+one",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      "/manufacturing/settings?workspaceId=workspace+%2F+one",
    );
  });

  it("runs manufacturing preflight as a read-only encoded query", async () => {
    await getManufacturingRunPreflight({
      workspaceId: "ws / 1",
      finishedProductId: "fg / 1",
      quantity: 10,
      sourceWarehouseId: "rm / 1",
      asOf: "2026-09-01",
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/manufacturing/run-preflight?workspaceId=ws+%2F+1&finishedProductId=fg+%2F+1&quantity=10&sourceWarehouseId=rm+%2F+1&asOf=2026-09-01",
    );
  });

  it("uses PUT for settings without introducing a browser fallback", async () => {
    const input = {
      workspaceId: "ws-1",
      mode: "GENERAL" as const,
      reservationRequired: true,
      issueBeforeProduction: true,
      negativeStockAllowed: false,
      serialTrackingRequired: true,
      qualityReleaseRequired: true,
      partialProductionAllowed: true,
      electronicSignatureRequired: false,
      approvalRequired: true,
    };

    await updateManufacturingSettings(input);

    expect(apiRequestMock).toHaveBeenCalledWith("/manufacturing/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  });

  it("reads and saves workspace-scoped workflow presentation configuration", async () => {
    const input = {
      workspaceId: "ws / 1",
      workflowDefinitionVersion: "2.0 / active",
      hiddenStepSerials: [9, 17, 144],
      expectedRevision: 4,
    };

    await getManufacturingWorkflowConfiguration("ws / 1");
    await updateManufacturingWorkflowConfiguration(input);

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/workflow/configuration?workspaceId=ws+%2F+1",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/workflow/configuration",
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    );
  });

  it("serializes availability and BOM filters while retaining false values", async () => {
    await getManufacturingAvailability({
      workspaceId: "ws-1",
      warehouseId: "raw materials",
      search: "fridge body",
      includeZeroStock: false,
    });
    await listManufacturingBoms({
      workspaceId: "ws-1",
      status: "APPROVED",
      activeOnly: false,
    });

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/availability?workspaceId=ws-1&warehouseId=raw+materials&search=fridge+body&includeZeroStock=false",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/boms?workspaceId=ws-1&status=APPROVED&activeOnly=false",
    );
  });

  it("posts BOM headers, versions and approvals to their dedicated resources", async () => {
    const bom = {
      workspaceId: "ws-1",
      idempotencyKey: "create-bom-1",
      name: "Fridge",
      finishedProductId: "finished-1",
    };
    const version = {
      workspaceId: "ws-1",
      outputQuantity: 10,
      outputUnit: "pcs",
      components: [{ inventoryItemId: "raw-1", quantity: 10, unit: "pcs" }],
    };
    const approval = {
      workspaceId: "ws-1",
      idempotencyKey: "bom-v1-approve",
      transactionDate: "2026-09-01",
    };

    await createManufacturingBom(bom);
    await createManufacturingBomVersion("bom / 1", version);
    await approveManufacturingBomVersion("version / 1", approval);

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/manufacturing/boms", {
      method: "POST",
      body: JSON.stringify(bom),
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/boms/bom%20%2F%201/versions",
      {
        method: "POST",
        body: JSON.stringify(version),
      },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      "/manufacturing/bom-versions/version%20%2F%201/approve",
      {
        method: "POST",
        body: JSON.stringify(approval),
      },
    );
  });

  it("uses real item-profile and logical-location resources", async () => {
    const profile = {
      workspaceId: "ws-1",
      inventoryItemId: "raw / body",
      role: "RAW_MATERIAL" as const,
      makeBuy: "BUY" as const,
      lotTracked: true,
    };
    const location = {
      workspaceId: "ws-1",
      warehouseId: "warehouse / raw",
      code: "RM-RELEASED",
      name: "Released raw materials",
      disposition: "RELEASED" as const,
    };

    await listManufacturingItemProfiles({
      workspaceId: "ws-1",
      role: "RAW_MATERIAL",
      active: false,
      search: "fridge body",
    });
    await createManufacturingItemProfile(profile);
    await listManufacturingLocations({
      workspaceId: "ws-1",
      warehouseId: "warehouse / raw",
      disposition: "RELEASED",
      active: true,
    });
    await createManufacturingLocation(location);

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/item-profiles?workspaceId=ws-1&role=RAW_MATERIAL&active=false&search=fridge+body",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/item-profiles",
      { method: "POST", body: JSON.stringify(profile) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      "/manufacturing/locations?workspaceId=ws-1&warehouseId=warehouse+%2F+raw&disposition=RELEASED&active=true",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      4,
      "/manufacturing/locations",
      { method: "POST", body: JSON.stringify(location) },
    );
  });

  it("posts versioned routing and persisted approval to dedicated endpoints", async () => {
    const routing = {
      workspaceId: "ws-1",
      name: "Fridge assembly route",
      finishedProductId: "fg-1",
    };
    const version = {
      workspaceId: "ws-1",
      operations: [
        {
          sequence: 10,
          code: "BODY",
          name: "Body assembly",
          setupMinutes: 30,
          runMinutesPerUnit: 12,
          responsibleUserId: "user-1",
        },
        {
          sequence: 20,
          code: "QC",
          name: "Final quality check",
          qcRequired: true,
          responsibleUserId: "user-2",
        },
      ],
    };
    const approval = {
      workspaceId: "ws-1",
      idempotencyKey: "routing-v1-approve",
      transactionDate: "2026-09-01",
    };

    await listManufacturingRoutings({ workspaceId: "ws-1", active: "all" });
    await createManufacturingRouting(routing);
    await createManufacturingRoutingVersion("routing / 1", version);
    await approveManufacturingRoutingVersion("routing-version / 1", approval);

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/routings?workspaceId=ws-1&active=all",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/routings",
      { method: "POST", body: JSON.stringify(routing) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      "/manufacturing/routings/routing%20%2F%201/versions",
      { method: "POST", body: JSON.stringify(version) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      4,
      "/manufacturing/routing-versions/routing-version%20%2F%201/approve",
      { method: "POST", body: JSON.stringify(approval) },
    );
  });

  it("preserves arbitrary day-wise lots and calculates MRP through the server", async () => {
    const plan = {
      workspaceId: "ws-1",
      idempotencyKey: "create-plan-1",
      finishedProductId: "fg-fridge",
      bomVersionId: "bom-v1",
      routingVersionId: "route-v1",
      plannedQuantity: 10,
      unit: "pcs",
      plannedStartDate: "2026-09-01",
      plannedEndDate: "2026-09-30",
      lots: [
        {
          lotNumber: "LOT-01",
          sequence: 1,
          plannedQuantity: 2,
          plannedStartDate: "2026-09-01",
          plannedEndDate: "2026-09-05",
        },
        {
          lotNumber: "LOT-02",
          sequence: 2,
          plannedQuantity: 3,
          plannedStartDate: "2026-09-06",
          plannedEndDate: "2026-09-12",
        },
        {
          lotNumber: "LOT-03",
          sequence: 3,
          plannedQuantity: 3,
          plannedStartDate: "2026-09-13",
          plannedEndDate: "2026-09-20",
        },
        {
          lotNumber: "LOT-04",
          sequence: 4,
          plannedQuantity: 2,
          plannedStartDate: "2026-09-21",
          plannedEndDate: "2026-09-30",
        },
      ],
    };
    const approval = {
      workspaceId: "ws-1",
      idempotencyKey: "plan-approve-1",
      transactionDate: "2026-09-01",
    };
    const mrp = {
      workspaceId: "ws-1",
      planId: "plan / 1",
      warehouseId: "raw-1",
      asOfDate: "2026-09-01",
      horizonEndDate: "2026-09-30",
      idempotencyKey: "mrp-1",
    };

    await listManufacturingPlans({
      workspaceId: "ws-1",
      status: "APPROVED",
      from: "2026-09-01",
      to: "2026-09-30",
    });
    await createManufacturingPlan(plan);
    await approveManufacturingPlan("plan / 1", approval);
    await listManufacturingMrpRuns({
      workspaceId: "ws-1",
      planId: "plan / 1",
      status: "COMPLETED",
    });
    await calculateManufacturingMrp(mrp);

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/plans?workspaceId=ws-1&status=APPROVED&from=2026-09-01&to=2026-09-30",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/manufacturing/plans", {
      method: "POST",
      body: JSON.stringify(plan),
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      "/manufacturing/plans/plan%20%2F%201/approve",
      { method: "POST", body: JSON.stringify(approval) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      4,
      "/manufacturing/mrp-runs?workspaceId=ws-1&planId=plan+%2F+1&status=COMPLETED",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      5,
      "/manufacturing/mrp-runs/calculate",
      { method: "POST", body: JSON.stringify(mrp) },
    );
  });

  it("lists, creates, reads and transitions production orders", async () => {
    const createInput = {
      workspaceId: "ws-1",
      idempotencyKey: "create-order-1",
      orderType: "ASSEMBLY" as const,
      finishedProductId: "finished-1",
      bomVersionId: "bom-version-1",
      routingVersionId: "routing-version-1",
      plannedQuantity: 10,
      unit: "pcs",
      sourceWarehouseId: "raw-warehouse",
      destinationWarehouseId: "fg-quality",
      plannedStartDate: "2026-09-01",
      plannedEndDate: "2026-09-30",
    };
    const action = {
      kind: "SUBMIT" as const,
      idempotencyKey: "order-1-submit",
      transactionDate: "2026-09-01",
      note: "Ready for approval",
    };

    await listManufacturingOrders({
      workspaceId: "ws-1",
      orderType: "ASSEMBLY",
      status: "DRAFT",
      from: "2026-09-01",
      to: "2026-09-30",
    });
    await createManufacturingOrder(createInput);
    await getManufacturingOrder("order / 1");
    await getManufacturingOrderQualitySpecification("order / 1", "2026-09-25");
    await performManufacturingOrderAction("order / 1", action);

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/orders?workspaceId=ws-1&status=DRAFT&orderType=ASSEMBLY&from=2026-09-01&to=2026-09-30",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/manufacturing/orders", {
      method: "POST",
      body: JSON.stringify(createInput),
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      "/manufacturing/orders/order%20%2F%201",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      4,
      "/manufacturing/orders/order%20%2F%201/quality-specification?transactionDate=2026-09-25",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      5,
      "/manufacturing/orders/order%20%2F%201/actions",
      {
        method: "POST",
        body: JSON.stringify(action),
      },
    );
  });

  it("lists and creates auditable workflow review records", async () => {
    const input = {
      workspaceId: "ws-1",
      group: "QUALITY_COMPLIANCE" as const,
      workflowKey: "stability-study",
      outcome: "NOT_APPLICABLE" as const,
      reason: "General manufacturing order",
      transactionDate: "2026-09-20",
      idempotencyKey: "review-stability-order-1",
    };

    await listManufacturingWorkflowReviews({
      workspaceId: "ws-1",
      group: "QUALITY_COMPLIANCE",
      outcome: "NOT_APPLICABLE",
      status: "APPROVED",
    });
    await createManufacturingWorkflowReview(input);

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/workflow-reviews?workspaceId=ws-1&group=QUALITY_COMPLIANCE&outcome=NOT_APPLICABLE&status=APPROVED",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/workflow-reviews",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  });

  it("uses the versioned workflow run, occurrence, next-action, history and transition endpoints", async () => {
    const startInput = {
      workspaceId: "ws / 1",
      idempotencyKey: "workflow-start-1",
      manufacturingMode: "GENERAL" as const,
      productionOrderId: "order / 1",
    };
    const transitionInput = {
      workspaceId: "ws / 1",
      idempotencyKey: "workflow-step-8-start",
      action: "START" as const,
      expectedVersion: 3,
    };
    const occurrenceInput = {
      workspaceId: "ws / 1",
      occurrenceKey: "lot / 2",
    };
    const discardInput = {
      workspaceId: "ws / 1",
      reason: "Legacy setup run has no activity",
      expectedVersion: 1,
    };

    await getActiveManufacturingWorkflowDefinition();
    await getManufacturingWorkflowElectronicSignatureContext("ws / 1");
    await listManufacturingWorkflowRuns({
      workspaceId: "ws / 1",
      status: "DRAFT",
      productionOrderId: "order / 1",
    });
    await startManufacturingWorkflowRun(startInput);
    await getManufacturingWorkflowRun("run / 1", "ws / 1");
    await getManufacturingWorkflowNextAction("run / 1", "ws / 1");
    await getManufacturingWorkflowRunHistory("run / 1", "ws / 1");
    await createManufacturingWorkflowRunStepOccurrence(
      "run / 1",
      "11.01",
      occurrenceInput,
    );
    await transitionManufacturingWorkflowRunStep(
      "run / 1",
      "11.01",
      transitionInput,
    );
    await discardEmptyManufacturingWorkflowRun("legacy / 1", discardInput);

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/workflow/definitions/active",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/workflow/electronic-signature-context?workspaceId=ws+%2F+1",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      "/manufacturing/workflow/runs?workspaceId=ws+%2F+1&status=DRAFT&productionOrderId=order+%2F+1",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      4,
      "/manufacturing/workflow/runs",
      { method: "POST", body: JSON.stringify(startInput) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      5,
      "/manufacturing/workflow/runs/run%20%2F%201?workspaceId=ws+%2F+1",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      6,
      "/manufacturing/workflow/runs/run%20%2F%201/next-action?workspaceId=ws+%2F+1",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      7,
      "/manufacturing/workflow/runs/run%20%2F%201/history?workspaceId=ws+%2F+1",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      8,
      "/manufacturing/workflow/runs/run%20%2F%201/steps/11.01/occurrences",
      { method: "POST", body: JSON.stringify(occurrenceInput) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      9,
      "/manufacturing/workflow/runs/run%20%2F%201/steps/11.01/transitions",
      { method: "POST", body: JSON.stringify(transitionInput) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      10,
      "/manufacturing/workflow/runs/legacy%20%2F%201/discard-empty",
      { method: "POST", body: JSON.stringify(discardInput) },
    );
  });
});
