import { apiRequest } from "@/services/api-client";
import type {
  ApproveManufacturingBomVersionInput,
  CalculateManufacturingMrpInput,
  CalculateManufacturingMrpResult,
  CreateManufacturingRunStepOccurrenceInput,
  DiscardEmptyManufacturingRunInput,
  CreateManufacturingBomInput,
  CreateManufacturingBomVersionInput,
  CreateManufacturingItemProfileInput,
  CreateManufacturingLocationInput,
  CreateManufacturingOrderInput,
  CreateManufacturingPlanInput,
  CreateManufacturingRoutingInput,
  CreateManufacturingRoutingVersionInput,
  CreateManufacturingWorkflowReviewInput,
  ManufacturingAvailabilityQuery,
  ManufacturingAvailabilitySnapshot,
  ManufacturingApplicableQualitySpecification,
  ManufacturingBomListQuery,
  ManufacturingBomRecord,
  ManufacturingBomVersionRecord,
  ManufacturingDashboard,
  ManufacturingItemProfileListQuery,
  ManufacturingItemProfileRecord,
  ManufacturingLocationListQuery,
  ManufacturingLocationRecord,
  ManufacturingOrderActionInput,
  ManufacturingOrderActionResult,
  ManufacturingOrderListQuery,
  ManufacturingProductionOrderRecord,
  ManufacturingMrpRunListQuery,
  ManufacturingMrpRunRecord,
  ManufacturingPlanListQuery,
  ManufacturingPlanRecord,
  ManufacturingPlanningApprovalInput,
  ManufacturingReadiness,
  ManufacturingRoutingListQuery,
  ManufacturingRoutingAssigneeRecord,
  ManufacturingRunPreflight,
  ManufacturingRoutingRecord,
  ManufacturingRoutingVersionRecord,
  ManufacturingSettingsRecord,
  ManufacturingWorkflowReviewListQuery,
  ManufacturingWorkflowReviewRecord,
  ManufacturingWorkflowConfigurationRecord,
  ManufacturingWorkflowDefinitionRecord,
  ManufacturingWorkflowElectronicSignatureContext,
  ManufacturingRunStepTransitionRecord,
  ManufacturingRunRecord,
  ManufacturingNextRequiredAction,
  StartManufacturingRunInput,
  TransitionManufacturingRunStepInput,
  TransitionManufacturingWorkflowReviewInput,
  UpdateManufacturingWorkflowConfigurationInput,
  UpdateManufacturingSettingsInput,
  UpdateManufacturingItemProfileInput,
  UpdateManufacturingLocationInput,
} from "@/types/manufacturing";

type QueryValue = string | number | boolean | null | undefined;

function withQuery(
  path: string,
  entries: ReadonlyArray<readonly [string, QueryValue]>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function workspaceEndpoint(path: string, workspaceId: string) {
  return withQuery(path, [["workspaceId", workspaceId]]);
}

export function getManufacturingReadiness(workspaceId: string) {
  return apiRequest<ManufacturingReadiness>(
    workspaceEndpoint("/manufacturing/readiness", workspaceId),
  );
}

export function getManufacturingDashboard(workspaceId: string) {
  return apiRequest<ManufacturingDashboard>(
    workspaceEndpoint("/manufacturing/dashboard", workspaceId),
  );
}

export function getManufacturingSettings(workspaceId: string) {
  return apiRequest<ManufacturingSettingsRecord | null>(
    workspaceEndpoint("/manufacturing/settings", workspaceId),
  );
}

export function updateManufacturingSettings(
  input: UpdateManufacturingSettingsInput,
) {
  return apiRequest<ManufacturingSettingsRecord>("/manufacturing/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getManufacturingAvailability(
  query: ManufacturingAvailabilityQuery,
) {
  return apiRequest<ManufacturingAvailabilitySnapshot>(
    withQuery("/manufacturing/availability", [
      ["workspaceId", query.workspaceId],
      ["warehouseId", query.warehouseId],
      ["inventoryItemId", query.inventoryItemId],
      ["itemRole", query.itemRole],
      ["search", query.search],
      ["asOf", query.asOf],
      ["includeZeroStock", query.includeZeroStock],
    ]),
  );
}

export function listManufacturingBoms(query: ManufacturingBomListQuery) {
  return apiRequest<ManufacturingBomRecord[]>(
    withQuery("/manufacturing/boms", [
      ["workspaceId", query.workspaceId],
      ["search", query.search],
      ["finishedProductId", query.finishedProductId],
      ["status", query.status],
      ["activeOnly", query.activeOnly],
    ]),
  );
}

export function createManufacturingBom(input: CreateManufacturingBomInput) {
  return apiRequest<ManufacturingBomRecord>("/manufacturing/boms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createManufacturingBomVersion(
  bomId: string,
  input: CreateManufacturingBomVersionInput,
) {
  return apiRequest<ManufacturingBomVersionRecord>(
    `/manufacturing/boms/${encodeURIComponent(bomId)}/versions`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function approveManufacturingBomVersion(
  versionId: string,
  input: ApproveManufacturingBomVersionInput,
) {
  return apiRequest<ManufacturingBomVersionRecord>(
    `/manufacturing/bom-versions/${encodeURIComponent(versionId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function listManufacturingItemProfiles(
  query: ManufacturingItemProfileListQuery,
) {
  return apiRequest<ManufacturingItemProfileRecord[]>(
    withQuery("/manufacturing/item-profiles", [
      ["workspaceId", query.workspaceId],
      ["role", query.role],
      ["makeBuy", query.makeBuy],
      ["active", query.active],
      ["search", query.search],
    ]),
  );
}

export function createManufacturingItemProfile(
  input: CreateManufacturingItemProfileInput,
) {
  return apiRequest<ManufacturingItemProfileRecord>(
    "/manufacturing/item-profiles",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateManufacturingItemProfile(
  profileId: string,
  input: UpdateManufacturingItemProfileInput,
) {
  return apiRequest<ManufacturingItemProfileRecord>(
    `/manufacturing/item-profiles/${encodeURIComponent(profileId)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function listManufacturingLocations(
  query: ManufacturingLocationListQuery,
) {
  return apiRequest<ManufacturingLocationRecord[]>(
    withQuery("/manufacturing/locations", [
      ["workspaceId", query.workspaceId],
      ["warehouseId", query.warehouseId],
      ["disposition", query.disposition],
      ["active", query.active],
      ["search", query.search],
    ]),
  );
}

export function createManufacturingLocation(
  input: CreateManufacturingLocationInput,
) {
  return apiRequest<ManufacturingLocationRecord>("/manufacturing/locations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateManufacturingLocation(
  locationId: string,
  input: UpdateManufacturingLocationInput,
) {
  return apiRequest<ManufacturingLocationRecord>(
    `/manufacturing/locations/${encodeURIComponent(locationId)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function listManufacturingRoutings(
  query: ManufacturingRoutingListQuery,
) {
  return apiRequest<ManufacturingRoutingRecord[]>(
    withQuery("/manufacturing/routings", [
      ["workspaceId", query.workspaceId],
      ["finishedProductId", query.finishedProductId],
      ["active", query.active],
      ["search", query.search],
    ]),
  );
}

export function listManufacturingRoutingAssignees(workspaceId: string) {
  return apiRequest<ManufacturingRoutingAssigneeRecord[]>(
    workspaceEndpoint("/manufacturing/routing-assignees", workspaceId),
  );
}

export function getManufacturingRunPreflight(query: {
  workspaceId: string;
  finishedProductId?: string;
  quantity: number;
  sourceWarehouseId?: string;
  asOf: string;
}) {
  return apiRequest<ManufacturingRunPreflight>(
    withQuery("/manufacturing/run-preflight", [
      ["workspaceId", query.workspaceId],
      ["finishedProductId", query.finishedProductId],
      ["quantity", query.quantity],
      ["sourceWarehouseId", query.sourceWarehouseId],
      ["asOf", query.asOf],
    ]),
  );
}

export function createManufacturingRouting(
  input: CreateManufacturingRoutingInput,
) {
  return apiRequest<ManufacturingRoutingRecord>("/manufacturing/routings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createManufacturingRoutingVersion(
  routingId: string,
  input: CreateManufacturingRoutingVersionInput,
) {
  return apiRequest<ManufacturingRoutingVersionRecord>(
    `/manufacturing/routings/${encodeURIComponent(routingId)}/versions`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function approveManufacturingRoutingVersion(
  versionId: string,
  input: ManufacturingPlanningApprovalInput,
) {
  return apiRequest<{
    version: ManufacturingRoutingVersionRecord;
    approvalProgress?: ManufacturingRoutingVersionRecord["approvalProgress"];
    replayed: boolean;
  }>(
    `/manufacturing/routing-versions/${encodeURIComponent(versionId)}/approve`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function listManufacturingPlans(query: ManufacturingPlanListQuery) {
  return apiRequest<ManufacturingPlanRecord[]>(
    withQuery("/manufacturing/plans", [
      ["workspaceId", query.workspaceId],
      ["status", query.status],
      ["finishedProductId", query.finishedProductId],
      ["from", query.from],
      ["to", query.to],
      ["search", query.search],
    ]),
  );
}

export function createManufacturingPlan(input: CreateManufacturingPlanInput) {
  return apiRequest<ManufacturingPlanRecord>("/manufacturing/plans", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function approveManufacturingPlan(
  planId: string,
  input: ManufacturingPlanningApprovalInput,
) {
  return apiRequest<{
    plan: ManufacturingPlanRecord;
    approvalProgress?: ManufacturingPlanRecord["approvalProgress"];
    replayed: boolean;
  }>(`/manufacturing/plans/${encodeURIComponent(planId)}/approve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listManufacturingMrpRuns(query: ManufacturingMrpRunListQuery) {
  return apiRequest<ManufacturingMrpRunRecord[]>(
    withQuery("/manufacturing/mrp-runs", [
      ["workspaceId", query.workspaceId],
      ["planId", query.planId],
      ["status", query.status],
    ]),
  );
}

export function getManufacturingMrpRun(runId: string) {
  return apiRequest<ManufacturingMrpRunRecord>(
    `/manufacturing/mrp-runs/${encodeURIComponent(runId)}`,
  );
}

export function calculateManufacturingMrp(
  input: CalculateManufacturingMrpInput,
) {
  return apiRequest<CalculateManufacturingMrpResult>(
    "/manufacturing/mrp-runs/calculate",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function listManufacturingOrders(query: ManufacturingOrderListQuery) {
  return apiRequest<ManufacturingProductionOrderRecord[]>(
    withQuery("/manufacturing/orders", [
      ["workspaceId", query.workspaceId],
      ["search", query.search],
      ["status", query.status],
      ["orderType", query.orderType],
      ["warehouseId", query.warehouseId],
      ["from", query.from],
      ["to", query.to],
    ]),
  );
}

export function createManufacturingOrder(input: CreateManufacturingOrderInput) {
  return apiRequest<ManufacturingProductionOrderRecord>(
    "/manufacturing/orders",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function getManufacturingOrder(orderId: string) {
  return apiRequest<ManufacturingProductionOrderRecord>(
    `/manufacturing/orders/${encodeURIComponent(orderId)}`,
  );
}

export function getManufacturingOrderQualitySpecification(
  orderId: string,
  transactionDate: string,
) {
  return apiRequest<ManufacturingApplicableQualitySpecification>(
    withQuery(
      `/manufacturing/orders/${encodeURIComponent(orderId)}/quality-specification`,
      [["transactionDate", transactionDate]],
    ),
  );
}

export function performManufacturingOrderAction(
  orderId: string,
  input: ManufacturingOrderActionInput,
) {
  return apiRequest<ManufacturingOrderActionResult>(
    `/manufacturing/orders/${encodeURIComponent(orderId)}/actions`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function listManufacturingWorkflowReviews(
  query: ManufacturingWorkflowReviewListQuery,
) {
  return apiRequest<ManufacturingWorkflowReviewRecord[]>(
    withQuery("/manufacturing/workflow-reviews", [
      ["workspaceId", query.workspaceId],
      ["group", query.group],
      ["workflowKey", query.workflowKey],
      ["entityType", query.entityType],
      ["entityId", query.entityId],
      ["outcome", query.outcome],
      ["status", query.status],
      ["from", query.from],
      ["to", query.to],
    ]),
  );
}

export function createManufacturingWorkflowReview(
  input: CreateManufacturingWorkflowReviewInput,
) {
  return apiRequest<ManufacturingWorkflowReviewRecord>(
    "/manufacturing/workflow-reviews",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function transitionManufacturingWorkflowReview(
  reviewId: string,
  input: TransitionManufacturingWorkflowReviewInput,
) {
  return apiRequest<ManufacturingWorkflowReviewRecord>(
    `/manufacturing/workflow-reviews/${encodeURIComponent(reviewId)}/transitions`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function getActiveManufacturingWorkflowDefinition() {
  return apiRequest<ManufacturingWorkflowDefinitionRecord>(
    "/manufacturing/workflow/definitions/active",
  );
}

export function getManufacturingWorkflowConfiguration(workspaceId: string) {
  return apiRequest<ManufacturingWorkflowConfigurationRecord>(
    workspaceEndpoint("/manufacturing/workflow/configuration", workspaceId),
  );
}

export function updateManufacturingWorkflowConfiguration(
  input: UpdateManufacturingWorkflowConfigurationInput,
) {
  return apiRequest<ManufacturingWorkflowConfigurationRecord>(
    "/manufacturing/workflow/configuration",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export function getManufacturingWorkflowElectronicSignatureContext(
  workspaceId: string,
) {
  return apiRequest<ManufacturingWorkflowElectronicSignatureContext>(
    withQuery("/manufacturing/workflow/electronic-signature-context", [
      ["workspaceId", workspaceId],
    ]),
  );
}

export function listManufacturingWorkflowRuns(query: {
  workspaceId: string;
  status?: string;
  productionOrderId?: string;
  productId?: string;
}) {
  return apiRequest<ManufacturingRunRecord[]>(
    withQuery("/manufacturing/workflow/runs", [
      ["workspaceId", query.workspaceId],
      ["status", query.status],
      ["productionOrderId", query.productionOrderId],
      ["productId", query.productId],
    ]),
  );
}

export function startManufacturingWorkflowRun(
  input: StartManufacturingRunInput,
) {
  return apiRequest<ManufacturingRunRecord>("/manufacturing/workflow/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function discardEmptyManufacturingWorkflowRun(
  runId: string,
  input: DiscardEmptyManufacturingRunInput,
) {
  return apiRequest<ManufacturingRunRecord>(
    `/manufacturing/workflow/runs/${encodeURIComponent(runId)}/discard-empty`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function getManufacturingWorkflowRun(
  runId: string,
  workspaceId: string,
) {
  return apiRequest<ManufacturingRunRecord>(
    withQuery(`/manufacturing/workflow/runs/${encodeURIComponent(runId)}`, [
      ["workspaceId", workspaceId],
    ]),
  );
}

export function getManufacturingWorkflowNextAction(
  runId: string,
  workspaceId: string,
) {
  return apiRequest<ManufacturingNextRequiredAction>(
    withQuery(
      `/manufacturing/workflow/runs/${encodeURIComponent(runId)}/next-action`,
      [["workspaceId", workspaceId]],
    ),
  );
}

export function getManufacturingWorkflowRunHistory(
  runId: string,
  workspaceId: string,
) {
  return apiRequest<ManufacturingRunStepTransitionRecord[]>(
    withQuery(
      `/manufacturing/workflow/runs/${encodeURIComponent(runId)}/history`,
      [["workspaceId", workspaceId]],
    ),
  );
}

export function createManufacturingWorkflowRunStepOccurrence(
  runId: string,
  stepId: string,
  input: CreateManufacturingRunStepOccurrenceInput,
) {
  return apiRequest<ManufacturingRunRecord>(
    `/manufacturing/workflow/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/occurrences`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function transitionManufacturingWorkflowRunStep(
  runId: string,
  stepId: string,
  input: TransitionManufacturingRunStepInput,
) {
  return apiRequest<ManufacturingRunRecord>(
    `/manufacturing/workflow/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/transitions`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
