import { apiRequest } from "@/services/api-client";
import type {
  ApproveManufacturingControlRecordInput,
  AssignManufacturingOperationResourceInput,
  ConfigureManufacturingDocumentSequenceInput,
  CreateArtworkSpecificationInput,
  CreateDemandPlanInput,
  CreateManufacturingCalendarSlotInput,
  CreateManufacturingCampaignInput,
  CreateManufacturingReasonCodeInput,
  CreateManufacturingResourceInput,
  CreateManufacturingShiftInput,
  CreateMasterProductionScheduleInput,
  CreatePackagingConfigurationInput,
  CreateQualitySpecificationInput,
  CreateTestMethodInput,
  ManufacturingCalendarSlotRecord,
  ManufacturingCapacityCheckRecord,
  ManufacturingControlRecord,
  ManufacturingControlRecordKind,
  ManufacturingDocumentSequenceRecord,
  ManufacturingPeriodKeyInput,
  ManufacturingPeriodRecord,
  ManufacturingPeriodValidation,
  ManufacturingResourceKind,
  ManufacturingResourceRecord,
  ManufacturingShiftRecord,
  RunManufacturingCapacityCheckInput,
  UpdateManufacturingResourceReadinessInput,
} from "@/types/manufacturing-blueprint";
import type { ManufacturingOperationResourceRequirementRecord } from "@/types/manufacturing";

type QueryValue = string | number | boolean | null | undefined;

function query(path: string, values: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

function post<T>(path: string, body: unknown) {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function listManufacturingResources(input: {
  workspaceId: string;
  kind?: ManufacturingResourceKind;
  active?: boolean;
  search?: string;
}) {
  return apiRequest<ManufacturingResourceRecord[]>(
    query("/manufacturing/blueprint/resources", input),
  );
}

export function createManufacturingResource(
  input: CreateManufacturingResourceInput,
) {
  return post<ManufacturingResourceRecord>(
    "/manufacturing/blueprint/resources",
    input,
  );
}

export function updateManufacturingResourceReadiness(
  resourceId: string,
  input: UpdateManufacturingResourceReadinessInput,
) {
  return post<{ resource: ManufacturingResourceRecord; replayed: boolean }>(
    `/manufacturing/blueprint/resources/${encodeURIComponent(resourceId)}/readiness`,
    input,
  );
}

export function listManufacturingShifts(workspaceId: string) {
  return apiRequest<ManufacturingShiftRecord[]>(
    query("/manufacturing/blueprint/shifts", { workspaceId, active: true }),
  );
}

export function createManufacturingShift(input: CreateManufacturingShiftInput) {
  return post<ManufacturingShiftRecord>(
    "/manufacturing/blueprint/shifts",
    input,
  );
}

export function listManufacturingCalendarSlots(input: {
  workspaceId: string;
  resourceId?: string;
  shiftId?: string;
  from?: string;
  to?: string;
}) {
  return apiRequest<ManufacturingCalendarSlotRecord[]>(
    query("/manufacturing/blueprint/calendar-slots", input),
  );
}

export function upsertManufacturingCalendarSlot(
  input: CreateManufacturingCalendarSlotInput,
) {
  return post<ManufacturingCalendarSlotRecord>(
    "/manufacturing/blueprint/calendar-slots",
    input,
  );
}

export function assignManufacturingOperationResource(
  operationId: string,
  input: AssignManufacturingOperationResourceInput,
) {
  return post<ManufacturingOperationResourceRequirementRecord>(
    `/manufacturing/blueprint/routing-operations/${encodeURIComponent(operationId)}/resources`,
    input,
  );
}

export function listManufacturingControlRecords(input: {
  workspaceId: string;
  kind?: ManufacturingControlRecordKind;
  status?: string;
  search?: string;
}) {
  return apiRequest<ManufacturingControlRecord[]>(
    query("/manufacturing/blueprint/control-records", input),
  );
}

export function createDemandPlan(input: CreateDemandPlanInput) {
  return post<ManufacturingControlRecord>(
    "/manufacturing/blueprint/demand-plans",
    input,
  );
}

export function createMasterProductionSchedule(
  input: CreateMasterProductionScheduleInput,
) {
  return post<ManufacturingControlRecord>(
    "/manufacturing/blueprint/master-production-schedules",
    input,
  );
}

export function createManufacturingCampaign(
  input: CreateManufacturingCampaignInput,
) {
  return post<ManufacturingControlRecord>(
    "/manufacturing/blueprint/campaigns",
    input,
  );
}

export function createTestMethod(input: CreateTestMethodInput) {
  return post<ManufacturingControlRecord>(
    "/manufacturing/blueprint/test-methods",
    input,
  );
}

export function createQualitySpecification(
  input: CreateQualitySpecificationInput,
) {
  return post<ManufacturingControlRecord>(
    "/manufacturing/blueprint/quality-specifications",
    input,
  );
}

export function createArtworkSpecification(
  input: CreateArtworkSpecificationInput,
) {
  return post<ManufacturingControlRecord>(
    "/manufacturing/blueprint/artwork-specifications",
    input,
  );
}

export function createPackagingConfiguration(
  input: CreatePackagingConfigurationInput,
) {
  return post<ManufacturingControlRecord>(
    "/manufacturing/blueprint/packaging-configurations",
    input,
  );
}

export function createManufacturingReasonCode(
  input: CreateManufacturingReasonCodeInput,
) {
  return post<ManufacturingControlRecord>(
    "/manufacturing/blueprint/reason-codes",
    input,
  );
}

export function approveManufacturingControlRecord(
  recordId: string,
  input: ApproveManufacturingControlRecordInput,
) {
  return post<{ record: ManufacturingControlRecord; replayed: boolean }>(
    `/manufacturing/blueprint/control-records/${encodeURIComponent(recordId)}/approve`,
    input,
  );
}

export function listManufacturingDocumentSequences(workspaceId: string) {
  return apiRequest<ManufacturingDocumentSequenceRecord[]>(
    query("/manufacturing/blueprint/document-sequences", { workspaceId }),
  );
}

export function configureManufacturingDocumentSequence(
  input: ConfigureManufacturingDocumentSequenceInput,
) {
  return apiRequest<ManufacturingDocumentSequenceRecord>(
    "/manufacturing/blueprint/document-sequences",
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function listManufacturingCapacityChecks(
  workspaceId: string,
  planId?: string,
) {
  return apiRequest<ManufacturingCapacityCheckRecord[]>(
    query("/manufacturing/blueprint/capacity-checks", { workspaceId, planId }),
  );
}

export function runManufacturingCapacityCheck(
  input: RunManufacturingCapacityCheckInput,
) {
  return post<{ check: ManufacturingCapacityCheckRecord; replayed: boolean }>(
    "/manufacturing/blueprint/capacity-checks/run",
    input,
  );
}

export function listManufacturingPeriods(workspaceId: string) {
  return apiRequest<ManufacturingPeriodRecord[]>(
    query("/manufacturing/blueprint/periods", { workspaceId }),
  );
}

export function ensureManufacturingPeriod(input: ManufacturingPeriodKeyInput) {
  return post<ManufacturingPeriodRecord>(
    "/manufacturing/blueprint/periods/ensure",
    input,
  );
}

export function validateManufacturingPeriod(
  input: ManufacturingPeriodKeyInput & { validationReference?: string | null },
) {
  return post<ManufacturingPeriodValidation>(
    "/manufacturing/blueprint/periods/validate",
    input,
  );
}

export function lockManufacturingPeriod(
  input: ManufacturingPeriodKeyInput & {
    idempotencyKey: string;
    transactionDate: string;
    signatureMeaning: string;
    reauthenticationPassword?: string | null;
    reason: string;
    validationReference?: string | null;
  },
) {
  return post<{ period: ManufacturingPeriodRecord; replayed: boolean }>(
    "/manufacturing/blueprint/periods/lock",
    input,
  );
}

export function archiveManufacturingPeriod(
  input: ManufacturingPeriodKeyInput & {
    idempotencyKey: string;
    transactionDate: string;
    signatureMeaning: string;
    reauthenticationPassword?: string | null;
    reason: string;
  },
) {
  return post<{ period: ManufacturingPeriodRecord; replayed: boolean }>(
    "/manufacturing/blueprint/periods/archive",
    input,
  );
}
