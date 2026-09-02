"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveManufacturingBomVersion,
  approveManufacturingPlan,
  approveManufacturingRoutingVersion,
  calculateManufacturingMrp,
  createManufacturingBom,
  createManufacturingBomVersion,
  createManufacturingItemProfile,
  createManufacturingLocation,
  createManufacturingOrder,
  createManufacturingPlan,
  createManufacturingRouting,
  createManufacturingRoutingVersion,
  createManufacturingWorkflowReview,
  createManufacturingWorkflowRunStepOccurrence,
  discardEmptyManufacturingWorkflowRun,
  getManufacturingAvailability,
  getManufacturingDashboard,
  getManufacturingMrpRun,
  getManufacturingOrder,
  getManufacturingOrderQualitySpecification,
  getManufacturingReadiness,
  getManufacturingSettings,
  listManufacturingBoms,
  listManufacturingItemProfiles,
  listManufacturingLocations,
  listManufacturingMrpRuns,
  listManufacturingOrders,
  listManufacturingPlans,
  listManufacturingRoutings,
  listManufacturingRoutingAssignees,
  getManufacturingRunPreflight,
  getActiveManufacturingWorkflowDefinition,
  getManufacturingWorkflowConfiguration,
  getManufacturingWorkflowElectronicSignatureContext,
  getManufacturingWorkflowRun,
  getManufacturingWorkflowRunHistory,
  listManufacturingWorkflowRuns,
  startManufacturingWorkflowRun,
  transitionManufacturingWorkflowRunStep,
  listManufacturingWorkflowReviews,
  performManufacturingOrderAction,
  transitionManufacturingWorkflowReview,
  updateManufacturingWorkflowConfiguration,
  updateManufacturingSettings,
  updateManufacturingItemProfile,
  updateManufacturingLocation,
} from "@/services/manufacturing.service";
import { ApiError } from "@/services/api-client";
import type {
  ApproveManufacturingBomVersionInput,
  CalculateManufacturingMrpInput,
  CreateManufacturingBomInput,
  CreateManufacturingBomVersionInput,
  CreateManufacturingItemProfileInput,
  CreateManufacturingLocationInput,
  CreateManufacturingOrderInput,
  CreateManufacturingPlanInput,
  CreateManufacturingRoutingInput,
  CreateManufacturingRoutingVersionInput,
  CreateManufacturingWorkflowReviewInput,
  CreateManufacturingRunStepOccurrenceInput,
  DiscardEmptyManufacturingRunInput,
  ManufacturingAvailabilityQuery,
  ManufacturingBomListQuery,
  ManufacturingItemProfileListQuery,
  ManufacturingLocationListQuery,
  ManufacturingMrpRunListQuery,
  ManufacturingOrderActionInput,
  ManufacturingOrderListQuery,
  ManufacturingPlanListQuery,
  ManufacturingPlanningApprovalInput,
  ManufacturingRoutingListQuery,
  ManufacturingWorkflowReviewListQuery,
  StartManufacturingRunInput,
  TransitionManufacturingRunStepInput,
  TransitionManufacturingWorkflowReviewInput,
  UpdateManufacturingWorkflowConfigurationInput,
  UpdateManufacturingSettingsInput,
  UpdateManufacturingItemProfileInput,
  UpdateManufacturingLocationInput,
} from "@/types/manufacturing";

export const manufacturingKeys = {
  all: ["manufacturing"] as const,
  workspace: (workspaceId: string | undefined) =>
    ["manufacturing", workspaceId] as const,
  readiness: (workspaceId: string | undefined) =>
    ["manufacturing", workspaceId, "readiness"] as const,
  dashboard: (workspaceId: string | undefined) =>
    ["manufacturing", workspaceId, "dashboard"] as const,
  settings: (workspaceId: string | undefined) =>
    ["manufacturing", workspaceId, "settings"] as const,
  availability: (query: ManufacturingAvailabilityQuery | null) =>
    ["manufacturing", query?.workspaceId, "availability", query] as const,
  boms: (query: ManufacturingBomListQuery | null) =>
    ["manufacturing", query?.workspaceId, "boms", query] as const,
  itemProfiles: (query: ManufacturingItemProfileListQuery | null) =>
    ["manufacturing", query?.workspaceId, "item-profiles", query] as const,
  locations: (query: ManufacturingLocationListQuery | null) =>
    ["manufacturing", query?.workspaceId, "locations", query] as const,
  routings: (query: ManufacturingRoutingListQuery | null) =>
    ["manufacturing", query?.workspaceId, "routings", query] as const,
  routingAssignees: (workspaceId: string | undefined) =>
    ["manufacturing", workspaceId, "routing-assignees"] as const,
  runPreflight: (
    query: {
      workspaceId: string;
      finishedProductId?: string;
      quantity: number;
      sourceWarehouseId?: string;
      asOf: string;
    } | null,
  ) => ["manufacturing", query?.workspaceId, "run-preflight", query] as const,
  plans: (query: ManufacturingPlanListQuery | null) =>
    ["manufacturing", query?.workspaceId, "plans", query] as const,
  mrpRuns: (query: ManufacturingMrpRunListQuery | null) =>
    ["manufacturing", query?.workspaceId, "mrp-runs", query] as const,
  mrpRun: (workspaceId: string | undefined, runId: string | undefined) =>
    ["manufacturing", workspaceId, "mrp-run", runId] as const,
  orders: (query: ManufacturingOrderListQuery | null) =>
    ["manufacturing", query?.workspaceId, "orders", query] as const,
  order: (workspaceId: string | undefined, orderId: string | undefined) =>
    ["manufacturing", workspaceId, "order", orderId] as const,
  orderQualitySpecification: (
    workspaceId: string | undefined,
    orderId: string | undefined,
    transactionDate: string | undefined,
  ) =>
    [
      "manufacturing",
      workspaceId,
      "order-quality-specification",
      orderId,
      transactionDate,
    ] as const,
  workflowReviews: (query: ManufacturingWorkflowReviewListQuery | null) =>
    ["manufacturing", query?.workspaceId, "workflow-reviews", query] as const,
  workflowDefinition: () =>
    ["manufacturing", "workflow", "active-definition"] as const,
  workflowConfiguration: (workspaceId: string | undefined) =>
    ["manufacturing", workspaceId, "workflow", "configuration"] as const,
  workflowElectronicSignature: (workspaceId: string | undefined) =>
    ["manufacturing", workspaceId, "workflow", "electronic-signature"] as const,
  workflowRuns: (workspaceId: string | undefined) =>
    ["manufacturing", workspaceId, "workflow", "runs"] as const,
  workflowRun: (workspaceId: string | undefined, runId: string | undefined) =>
    ["manufacturing", workspaceId, "workflow", "run", runId] as const,
  workflowRunHistory: (
    workspaceId: string | undefined,
    runId: string | undefined,
  ) =>
    [
      "manufacturing",
      workspaceId,
      "workflow",
      "run",
      runId,
      "history",
    ] as const,
};

function shouldRetry(failureCount: number, error: unknown) {
  if (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  ) {
    return false;
  }
  return failureCount < 2;
}

export function useManufacturingReadinessQuery(
  workspaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.readiness(workspaceId),
    queryFn: () => getManufacturingReadiness(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingDashboardQuery(
  workspaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.dashboard(workspaceId),
    queryFn: () => getManufacturingDashboard(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingSettingsQuery(
  workspaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.settings(workspaceId),
    queryFn: () => getManufacturingSettings(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingAvailabilityQuery(
  query: ManufacturingAvailabilityQuery | null,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.availability(query),
    queryFn: () => getManufacturingAvailability(query!),
    enabled: Boolean(query?.workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingBomsQuery(
  query: ManufacturingBomListQuery | null,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.boms(query),
    queryFn: () => listManufacturingBoms(query!),
    enabled: Boolean(query?.workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingItemProfilesQuery(
  query: ManufacturingItemProfileListQuery | null,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.itemProfiles(query),
    queryFn: () => listManufacturingItemProfiles(query!),
    enabled: Boolean(query?.workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingLocationsQuery(
  query: ManufacturingLocationListQuery | null,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.locations(query),
    queryFn: () => listManufacturingLocations(query!),
    enabled: Boolean(query?.workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingRoutingsQuery(
  query: ManufacturingRoutingListQuery | null,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.routings(query),
    queryFn: () => listManufacturingRoutings(query!),
    enabled: Boolean(query?.workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingRoutingAssigneesQuery(
  workspaceId: string | undefined,
) {
  return useQuery({
    queryKey: manufacturingKeys.routingAssignees(workspaceId),
    queryFn: () => listManufacturingRoutingAssignees(workspaceId!),
    enabled: Boolean(workspaceId),
    retry: shouldRetry,
  });
}

export function useManufacturingRunPreflightQuery(
  query: {
    workspaceId: string;
    finishedProductId?: string;
    quantity: number;
    sourceWarehouseId?: string;
    asOf: string;
  } | null,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.runPreflight(query),
    queryFn: () => getManufacturingRunPreflight(query!),
    enabled: Boolean(query?.workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingPlansQuery(
  query: ManufacturingPlanListQuery | null,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.plans(query),
    queryFn: () => listManufacturingPlans(query!),
    enabled: Boolean(query?.workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingMrpRunsQuery(
  query: ManufacturingMrpRunListQuery | null,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.mrpRuns(query),
    queryFn: () => listManufacturingMrpRuns(query!),
    enabled: Boolean(query?.workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingMrpRunQuery(
  workspaceId: string | undefined,
  runId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.mrpRun(workspaceId, runId),
    queryFn: () => getManufacturingMrpRun(runId!),
    enabled: Boolean(workspaceId) && Boolean(runId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingOrdersQuery(
  query: ManufacturingOrderListQuery | null,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.orders(query),
    queryFn: () => listManufacturingOrders(query!),
    enabled: Boolean(query?.workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingOrderQuery(
  workspaceId: string | undefined,
  orderId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.order(workspaceId, orderId),
    queryFn: () => getManufacturingOrder(orderId!),
    enabled: Boolean(workspaceId) && Boolean(orderId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingOrderQualitySpecificationQuery(
  workspaceId: string | undefined,
  orderId: string | undefined,
  transactionDate: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.orderQualitySpecification(
      workspaceId,
      orderId,
      transactionDate,
    ),
    queryFn: () =>
      getManufacturingOrderQualitySpecification(orderId!, transactionDate!),
    enabled:
      Boolean(workspaceId) &&
      Boolean(orderId) &&
      Boolean(transactionDate) &&
      enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingWorkflowReviewsQuery(
  query: ManufacturingWorkflowReviewListQuery | null,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.workflowReviews(query),
    queryFn: () => listManufacturingWorkflowReviews(query!),
    enabled: Boolean(query?.workspaceId) && enabled,
    retry: shouldRetry,
  });
}

function useInvalidateManufacturing() {
  const queryClient = useQueryClient();
  return (workspaceId: string) =>
    void queryClient.invalidateQueries({
      queryKey: manufacturingKeys.workspace(workspaceId),
    });
}

export function useUpdateManufacturingSettingsMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (input: UpdateManufacturingSettingsInput) =>
      updateManufacturingSettings(input),
    onSuccess: (_record, input) => invalidate(input.workspaceId),
  });
}

export function useCreateManufacturingBomMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (input: CreateManufacturingBomInput) =>
      createManufacturingBom(input),
    onSuccess: (_record, input) => invalidate(input.workspaceId),
  });
}

export function useCreateManufacturingBomVersionMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: ({
      bomId,
      input,
    }: {
      bomId: string;
      input: CreateManufacturingBomVersionInput;
    }) => createManufacturingBomVersion(bomId, input),
    onSuccess: (_record, variables) => invalidate(variables.input.workspaceId),
  });
}

export function useApproveManufacturingBomVersionMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: ({
      versionId,
      input,
    }: {
      versionId: string;
      input: ApproveManufacturingBomVersionInput;
    }) => approveManufacturingBomVersion(versionId, input),
    onSuccess: (_record, variables) => invalidate(variables.input.workspaceId),
  });
}

export function useCreateManufacturingItemProfileMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (input: CreateManufacturingItemProfileInput) =>
      createManufacturingItemProfile(input),
    onSuccess: (_record, input) => invalidate(input.workspaceId),
  });
}

export function useUpdateManufacturingItemProfileMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: ({
      profileId,
      input,
    }: {
      profileId: string;
      input: UpdateManufacturingItemProfileInput;
    }) => updateManufacturingItemProfile(profileId, input),
    onSuccess: (_record, variables) => invalidate(variables.input.workspaceId),
  });
}

export function useCreateManufacturingLocationMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (input: CreateManufacturingLocationInput) =>
      createManufacturingLocation(input),
    onSuccess: (_record, input) => invalidate(input.workspaceId),
  });
}

export function useUpdateManufacturingLocationMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: ({
      locationId,
      input,
    }: {
      locationId: string;
      input: UpdateManufacturingLocationInput;
    }) => updateManufacturingLocation(locationId, input),
    onSuccess: (_record, variables) => invalidate(variables.input.workspaceId),
  });
}

export function useCreateManufacturingRoutingMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (input: CreateManufacturingRoutingInput) =>
      createManufacturingRouting(input),
    onSuccess: (_record, input) => invalidate(input.workspaceId),
  });
}

export function useCreateManufacturingRoutingVersionMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: ({
      routingId,
      input,
    }: {
      routingId: string;
      input: CreateManufacturingRoutingVersionInput;
    }) => createManufacturingRoutingVersion(routingId, input),
    onSuccess: (_record, variables) => invalidate(variables.input.workspaceId),
  });
}

export function useApproveManufacturingRoutingVersionMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: ({
      versionId,
      input,
    }: {
      versionId: string;
      input: ManufacturingPlanningApprovalInput;
    }) => approveManufacturingRoutingVersion(versionId, input),
    onSuccess: (_record, variables) => invalidate(variables.input.workspaceId),
  });
}

export function useCreateManufacturingPlanMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (input: CreateManufacturingPlanInput) =>
      createManufacturingPlan(input),
    onSuccess: (_record, input) => invalidate(input.workspaceId),
  });
}

export function useApproveManufacturingPlanMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: ({
      planId,
      input,
    }: {
      planId: string;
      input: ManufacturingPlanningApprovalInput;
    }) => approveManufacturingPlan(planId, input),
    onSuccess: (_record, variables) => invalidate(variables.input.workspaceId),
  });
}

export function useCalculateManufacturingMrpMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (input: CalculateManufacturingMrpInput) =>
      calculateManufacturingMrp(input),
    onSuccess: (_record, input) => invalidate(input.workspaceId),
  });
}

export function useCreateManufacturingOrderMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (input: CreateManufacturingOrderInput) =>
      createManufacturingOrder(input),
    onSuccess: (_record, input) => invalidate(input.workspaceId),
  });
}

export function useManufacturingOrderActionMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: ({
      orderId,
      input,
    }: {
      workspaceId: string;
      orderId: string;
      input: ManufacturingOrderActionInput;
    }) => performManufacturingOrderAction(orderId, input),
    onSuccess: (_record, variables) => invalidate(variables.workspaceId),
  });
}

export function useCreateManufacturingWorkflowReviewMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (input: CreateManufacturingWorkflowReviewInput) =>
      createManufacturingWorkflowReview(input),
    onSuccess: (_record, input) => invalidate(input.workspaceId),
  });
}

export function useTransitionManufacturingWorkflowReviewMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: ({
      reviewId,
      input,
    }: {
      reviewId: string;
      input: TransitionManufacturingWorkflowReviewInput;
    }) => transitionManufacturingWorkflowReview(reviewId, input),
    onSuccess: (_record, variables) => invalidate(variables.input.workspaceId),
  });
}

export function useManufacturingWorkflowDefinitionQuery(enabled = true) {
  return useQuery({
    queryKey: manufacturingKeys.workflowDefinition(),
    queryFn: getActiveManufacturingWorkflowDefinition,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });
}

export function useManufacturingWorkflowConfigurationQuery(
  workspaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.workflowConfiguration(workspaceId),
    queryFn: () => getManufacturingWorkflowConfiguration(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useUpdateManufacturingWorkflowConfigurationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateManufacturingWorkflowConfigurationInput) =>
      updateManufacturingWorkflowConfiguration(input),
    onSuccess: (record, input) => {
      queryClient.setQueryData(
        manufacturingKeys.workflowConfiguration(input.workspaceId),
        record,
      );
    },
  });
}

export function useManufacturingWorkflowElectronicSignatureQuery(
  workspaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.workflowElectronicSignature(workspaceId),
    queryFn: () =>
      getManufacturingWorkflowElectronicSignatureContext(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
    staleTime: 60 * 1000,
    retry: shouldRetry,
  });
}

export function useManufacturingWorkflowRunsQuery(
  workspaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.workflowRuns(workspaceId),
    queryFn: () => listManufacturingWorkflowRuns({ workspaceId: workspaceId! }),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingWorkflowRunQuery(
  workspaceId: string | undefined,
  runId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.workflowRun(workspaceId, runId),
    queryFn: () => getManufacturingWorkflowRun(runId!, workspaceId!),
    enabled: Boolean(workspaceId && runId) && enabled,
    retry: shouldRetry,
  });
}

export function useManufacturingWorkflowRunHistoryQuery(
  workspaceId: string | undefined,
  runId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: manufacturingKeys.workflowRunHistory(workspaceId, runId),
    queryFn: () => getManufacturingWorkflowRunHistory(runId!, workspaceId!),
    enabled: Boolean(workspaceId && runId) && enabled,
    retry: shouldRetry,
  });
}

export function useStartManufacturingWorkflowRunMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (input: StartManufacturingRunInput) =>
      startManufacturingWorkflowRun(input),
    onSuccess: (_record, input) => invalidate(input.workspaceId),
  });
}

export function useDiscardEmptyManufacturingWorkflowRunMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: ({
      runId,
      input,
    }: {
      runId: string;
      input: DiscardEmptyManufacturingRunInput;
    }) => discardEmptyManufacturingWorkflowRun(runId, input),
    onSuccess: (_record, variables) => invalidate(variables.input.workspaceId),
  });
}

export function useTransitionManufacturingWorkflowRunStepMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (variables: {
      workspaceId: string;
      runId: string;
      stepId: string;
      input: TransitionManufacturingRunStepInput;
    }) =>
      transitionManufacturingWorkflowRunStep(
        variables.runId,
        variables.stepId,
        variables.input,
      ),
    onSuccess: (_record, variables) => invalidate(variables.workspaceId),
  });
}

export function useCreateManufacturingWorkflowRunStepOccurrenceMutation() {
  const invalidate = useInvalidateManufacturing();
  return useMutation({
    mutationFn: (variables: {
      workspaceId: string;
      runId: string;
      stepId: string;
      input: CreateManufacturingRunStepOccurrenceInput;
    }) =>
      createManufacturingWorkflowRunStepOccurrence(
        variables.runId,
        variables.stepId,
        variables.input,
      ),
    onSuccess: (_record, variables) => invalidate(variables.workspaceId),
  });
}
