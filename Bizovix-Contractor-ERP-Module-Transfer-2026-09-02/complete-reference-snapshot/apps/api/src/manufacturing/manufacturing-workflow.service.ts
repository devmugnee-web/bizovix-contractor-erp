import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  PreconditionFailedException,
  ServiceUnavailableException,
} from "@nestjs/common";

import { moneyEquals } from "../accounting/money.util.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PermissionsService } from "../common/services/permissions.service.js";
import {
  ManufacturingOrderType,
  ManufacturingTransactionType,
  Prisma,
} from "../generated/prisma/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { parseManufacturingElectronicSignaturePolicy } from "./manufacturing-electronic-signature.domain.js";
import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import { ManufacturingService } from "./manufacturing.service.js";
import { totalActivePlannedMaterialQuantity } from "./manufacturing-material-exceptions.domain.js";
import { calculateOrderLevelPackagingLotRequirement } from "./manufacturing-packaging.domain.js";
import {
  MANUFACTURING_WORKFLOW_DEFINITION_VERSION,
  manufacturingStepDependencies,
  manufacturingWorkflowGroups,
  manufacturingWorkflowSteps,
} from "./manufacturing-workflow.catalog.js";
import { canManufacturingStepBeMarkedNotApplicable } from "./manufacturing-workflow.domain.js";
import type {
  CreateManufacturingRunStepOccurrenceDto,
  DiscardEmptyManufacturingRunDto,
  ListManufacturingRunsQueryDto,
  StartManufacturingRunDto,
  TransitionManufacturingRunStepDto,
  UpdateManufacturingWorkflowConfigurationDto,
} from "./manufacturing-workflow.dto.js";

type Db = Prisma.TransactionClient | PrismaService;

type RunRow = {
  id: string;
  tenantId: string;
  companyId: string;
  workspaceId: string;
  workflowDefinitionId: string;
  workflowDefinitionVersion: number;
  productionPlanId: string | null;
  productionOrderId: string | null;
  productId: string | null;
  manufacturingMode: "GENERAL" | "PHARMACEUTICAL" | "HYBRID";
  status: string;
  currentGroup: string | null;
  currentStepSerial: number | null;
  version: number;
  startedAt: Date;
  completedAt: Date | null;
  closedAt: Date | null;
};

type RunStepRow = {
  id: string;
  runId: string;
  stepDefinitionId: string;
  occurrenceKey: string;
  status: string;
  applicable: boolean;
  blockerReason: string | null;
  naReason: string | null;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
  approvedBy: string | null;
  signatureReference: string | null;
  version: number;
  flowSerial: number;
  legacyStepCode: string;
  flowGroupCode: string;
  flowGroupName: string;
  flowGroupOrder: number;
  title: string;
  route: string;
  postingEffect: string;
  permissionKey: string;
  completionRule: unknown;
  applicabilityType: string;
  stepType: string;
  repeatable: boolean;
  isBlocking: boolean;
};

type DependencyRow = {
  stepFlowSerial: number;
  prerequisiteFlowSerial: number;
  requiredStatus: string;
  dependencyType: string;
  conditionExpression: unknown;
};

type PostingLinkEvidence = {
  sourceDocumentType: string;
  sourceDocumentId: string;
  stockMovementId: string | null;
  journalId: string | null;
};

type PersistedSourceLink = {
  stockMovementId: string | null;
  journalId: string | null;
  postingLinks?: PostingLinkEvidence[];
};

const POSTING_VOUCHER_SELECT = Prisma.validator<Prisma.VoucherEntrySelect>()({
  id: true,
  workspaceId: true,
  companyId: true,
  voucherType: true,
  documentKind: true,
  status: true,
  sourceType: true,
  sourceId: true,
  totalAmount: true,
  debit: true,
  credit: true,
  lines: {
    select: { accountId: true, debit: true, credit: true },
  },
});

type PostingVoucher = Prisma.VoucherEntryGetPayload<{
  select: typeof POSTING_VOUCHER_SELECT;
}>;

const AGGREGATE_TRANSACTION_SELECT =
  Prisma.validator<Prisma.ManufacturingTransactionSelect>()({
    id: true,
    companyId: true,
    workspaceId: true,
    transactionType: true,
    status: true,
    orderId: true,
    orderLotId: true,
    fromWarehouseId: true,
    toWarehouseId: true,
    fromLocationId: true,
    toLocationId: true,
    voucherEntryId: true,
    transactionDate: true,
    createdAt: true,
    lines: {
      select: {
        id: true,
        inventoryItemId: true,
        orderMaterialId: true,
        sourceInventoryLotId: true,
        destinationInventoryLotId: true,
        quantity: true,
        totalCost: true,
        stockMovements: {
          where: { voidedAt: null },
          select: {
            id: true,
            warehouseId: true,
            inventoryItemId: true,
            transactionType: true,
            transactionId: true,
            transactionLineId: true,
            movementType: true,
            quantity: true,
            movementValue: true,
          },
        },
        serialMovements: {
          select: { serialId: true, role: true },
        },
        sourceInventoryLot: {
          select: {
            id: true,
            warehouseId: true,
            locationId: true,
            receivedQuantity: true,
            serials: {
              select: { id: true, status: true, serialRuleId: true },
            },
          },
        },
        destinationInventoryLot: {
          select: {
            id: true,
            warehouseId: true,
            locationId: true,
            receivedQuantity: true,
            serials: {
              select: { id: true, status: true, serialRuleId: true },
            },
          },
        },
      },
    },
    voucherEntry: {
      select: POSTING_VOUCHER_SELECT,
    },
  });

type AggregateTransaction = Prisma.ManufacturingTransactionGetPayload<{
  select: typeof AGGREGATE_TRANSACTION_SELECT;
}>;
type AggregateTransactionLine = AggregateTransaction["lines"][number];

const POSTING_TRANSACTION_TYPE_BY_STEP = new Map<
  number,
  readonly ManufacturingTransactionType[]
>([
  [67, [ManufacturingTransactionType.LOCATION_TRANSFER]],
  [70, [ManufacturingTransactionType.MATERIAL_ISSUE]],
  [72, [ManufacturingTransactionType.MATERIAL_ISSUE]],
  [74, [ManufacturingTransactionType.MATERIAL_RETURN]],
  [76, [ManufacturingTransactionType.LOCATION_TRANSFER]],
  [86, [ManufacturingTransactionType.LOCATION_TRANSFER]],
  [89, [ManufacturingTransactionType.LOCATION_TRANSFER]],
  [91, [ManufacturingTransactionType.SCRAP_RECEIPT]],
  [113, [ManufacturingTransactionType.PACKAGING_ISSUE]],
  [121, [ManufacturingTransactionType.PRODUCTION_RECEIPT]],
  [126, [ManufacturingTransactionType.QA_RELEASE]],
]);

const AGGREGATE_ORDER_POSTING_STEPS = new Set([70, 113, 121, 126]);
const POSTING_SOURCE_TYPES_BY_STEP = new Map<number, readonly string[]>([
  [67, ["MANUFACTURING_TRANSACTION"]],
  [70, ["MANUFACTURING_TRANSACTION"]],
  [72, ["MANUFACTURING_TRANSACTION"]],
  [74, ["MANUFACTURING_TRANSACTION"]],
  [76, ["MANUFACTURING_WORKFLOW_REVIEW"]],
  [77, ["MANUFACTURING_WORKFLOW_REVIEW"]],
  [86, ["MANUFACTURING_TRANSACTION"]],
  [89, ["MANUFACTURING_TRANSACTION"]],
  [91, ["MANUFACTURING_TRANSACTION"]],
  [113, ["MANUFACTURING_TRANSACTION"]],
  [121, ["MANUFACTURING_TRANSACTION"]],
  [126, ["MANUFACTURING_TRANSACTION"]],
  [139, ["MANUFACTURING_ACTUAL_COST_POSTING", "MANUFACTURING_COST_SNAPSHOT"]],
]);
const PRIMARY_ORDER_TYPE_BY_STEP = new Map<number, ManufacturingOrderType>([
  [50, ManufacturingOrderType.ASSEMBLY],
  [51, ManufacturingOrderType.PHARMACEUTICAL],
  [52, ManufacturingOrderType.SUBCONTRACT],
]);

const WORKFLOW_REVIEW_GROUP_BY_FLOW_GROUP: Readonly<Record<string, string>> = {
  A: "DASHBOARD_CONTROL_CENTER",
  B: "SETUP_WORKFLOW_AUDIT",
  C: "MASTERS_FORMULA",
  D: "PLANNING_MRP",
  E: "PRODUCTION_BATCH_ORDERS",
  F: "MATERIALS_DISPENSING",
  G: "PRODUCTION_EXECUTION",
  H: "QUALITY_COMPLIANCE",
  I: "PACKAGING_RELEASE",
  J: "COSTING_ACCOUNTS",
  K: "REPORTS_ANALYTICS",
};

const APPROVED_OR_LATER_ORDER_STATUSES = new Set([
  "APPROVED",
  "RESERVED",
  "ISSUED",
  "IN_PRODUCTION",
  "QC_HOLD",
  "QA_RELEASED",
  "COMPLETED",
  "CLOSED",
]);

const ACTIVE_WORKFLOW_ORDER_STATUSES = new Set([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "RESERVED",
  "ISSUED",
  "IN_PRODUCTION",
  "QC_HOLD",
  "QA_RELEASED",
]);

const ACTIVE_WORKFLOW_PLAN_STATUSES = new Set([
  "APPROVED",
  "RELEASED",
  "IN_PROGRESS",
]);

const MANUFACTURABLE_PRODUCT_ROLES = new Set([
  "INTERMEDIATE",
  "BULK",
  "FINISHED_GOOD",
]);

const MANUFACTURING_WORKFLOW_VISIBILITY_NAMESPACE =
  "manufacturing-workflow-visibility-v1";
const CURRENT_WORKFLOW_DEFINITION_VERSION = String(
  MANUFACTURING_WORKFLOW_DEFINITION_VERSION,
);
const WORKFLOW_STEP_BY_SERIAL = new Map(
  manufacturingWorkflowSteps.map((step) => [step.flowSerial, step]),
);
const WORKFLOW_SERIAL_BY_LEGACY_CODE = new Map(
  manufacturingWorkflowSteps.map((step) => [
    step.legacyStepCode,
    step.flowSerial,
  ]),
);
const ALL_WORKFLOW_STEP_SERIALS = manufacturingWorkflowSteps
  .map((step) => step.flowSerial)
  .sort((left, right) => left - right);

type WorkflowVisibilitySettings = {
  schemaVersion: 1;
  workflowDefinitionVersion: string;
  hiddenStepCodes: string[];
  revision: number;
  updatedByUserId: string;
};

type WorkflowVisibilityRow = {
  id: string;
  tenantId: string;
  companyId: string;
  workspaceId: string;
  settings: Prisma.JsonValue;
  updatedAt: Date;
};

function normalizedSourceType(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

function workflowCodeFromRoute(route: string) {
  try {
    return new URL(route, "http://manufacturing.local").searchParams.get(
      "view",
    );
  } catch {
    return null;
  }
}

function decimalValue(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

const TRANSITION_TARGET: Record<string, string> = {
  TRIGGER: "READY",
  START: "IN_PROGRESS",
  SAVE_DRAFT: "IN_PROGRESS",
  SUBMIT: "PENDING_APPROVAL",
  APPROVE: "APPROVED",
  BEGIN_POSTING: "POSTING",
  CONFIRM_POSTED: "POSTED",
  COMPLETE: "COMPLETED",
  MARK_N_A: "PENDING_APPROVAL",
  HOLD: "ON_HOLD",
  RESUME: "READY",
  REJECT: "REJECTED",
  FAIL: "FAILED",
};

const ALLOWED_ACTIONS: Record<string, readonly string[]> = {
  // LOCKED/BLOCKED are retained only for backward compatibility with a
  // version-1 store. They behave as advisory READY states; irreversible
  // transitions still validate their exact prerequisites below.
  LOCKED: ["START", "SAVE_DRAFT", "SUBMIT", "COMPLETE", "MARK_N_A", "HOLD"],
  BLOCKED: [
    "START",
    "SAVE_DRAFT",
    "SUBMIT",
    "COMPLETE",
    "MARK_N_A",
    "HOLD",
    "RESUME",
  ],
  READY: ["START", "SAVE_DRAFT", "SUBMIT", "COMPLETE", "MARK_N_A", "HOLD"],
  IN_PROGRESS: [
    "SAVE_DRAFT",
    "SUBMIT",
    "BEGIN_POSTING",
    "COMPLETE",
    "MARK_N_A",
    "HOLD",
    "FAIL",
  ],
  PENDING_APPROVAL: ["APPROVE", "REJECT"],
  APPROVED: ["BEGIN_POSTING", "COMPLETE", "HOLD"],
  POSTING: ["CONFIRM_POSTED", "FAIL"],
  POSTED: ["COMPLETE"],
  ON_HOLD: ["RESUME"],
  REJECTED: ["RESUME"],
  FAILED: ["RESUME"],
  COMPLETED: [],
  N_A: ["TRIGGER"],
  CANCELLED: [],
  CLOSED: [],
};

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseWorkflowVisibilitySettings(value: unknown) {
  const settings = jsonRecord(value);
  const hiddenStepCodes = Array.isArray(settings.hiddenStepCodes)
    ? [
        ...new Set(
          settings.hiddenStepCodes.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0,
          ),
        ),
      ]
    : [];
  const revision =
    typeof settings.revision === "number" &&
    Number.isInteger(settings.revision) &&
    settings.revision >= 0
      ? settings.revision
      : 0;
  return {
    workflowDefinitionVersion:
      typeof settings.workflowDefinitionVersion === "string"
        ? settings.workflowDefinitionVersion
        : null,
    hiddenStepCodes,
    revision,
    updatedByUserId:
      typeof settings.updatedByUserId === "string"
        ? settings.updatedByUserId
        : null,
  };
}

function sameNumberArray(left: readonly number[], right: readonly number[]) {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

function dateOnlyUtc(value: Date | string) {
  const raw = typeof value === "string" ? value : value.toISOString();
  const datePart = /^\d{4}-\d{2}-\d{2}/.exec(raw)?.[0];
  if (!datePart) return new Date(Number.NaN);
  return new Date(`${datePart}T00:00:00.000Z`);
}

function bomVersionHasRequiredPackagingComponents(
  version:
    | {
        components?: readonly {
          inventoryItem?: {
            manufacturingProfile?: {
              isActive: boolean;
              role: string;
            } | null;
          } | null;
        }[];
      }
    | null
    | undefined,
) {
  return Boolean(
    version?.components?.some(
      (component) =>
        component.inventoryItem?.manufacturingProfile?.isActive === true &&
        component.inventoryItem?.manufacturingProfile?.role ===
          "PACKAGING_MATERIAL",
    ),
  );
}

function workflowStepReference(step: {
  flowSerial: number;
  title: string;
  occurrenceKey?: string;
}) {
  const occurrence =
    step.occurrenceKey && step.occurrenceKey !== "PRIMARY"
      ? ` [${step.occurrenceKey}]`
      : "";
  return `${step.flowSerial}. ${step.title}${occurrence}`;
}

function completionStatus(step: RunStepRow) {
  const rule =
    step.completionRule && typeof step.completionRule === "object"
      ? (step.completionRule as Record<string, unknown>)
      : {};
  return typeof rule.requiredStatus === "string"
    ? rule.requiredStatus
    : step.postingEffect !== "NONE"
      ? "POSTED"
      : "COMPLETED";
}

function satisfiesStatus(actual: string, required: string) {
  if (actual === "N_A") return true;
  if (required === "APPROVED")
    return ["APPROVED", "POSTING", "POSTED", "COMPLETED", "CLOSED"].includes(
      actual,
    );
  if (required === "POSTED")
    return ["POSTED", "COMPLETED", "CLOSED"].includes(actual);
  if (required === "COMPLETED") return ["COMPLETED", "CLOSED"].includes(actual);
  return actual === required;
}

function isStepComplete(step: RunStepRow) {
  return satisfiesStatus(step.status, completionStatus(step));
}

function isWorkflowStoreMissing(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2021", "P2022"].includes(error.code)) ||
    (error instanceof Error &&
      /ManufacturingWorkflow|ManufacturingRun|does not exist/i.test(
        error.message,
      ))
  );
}

function runStatusForSteps(
  serial: number,
  steps: RunStepRow[],
  allComplete: boolean,
) {
  const complete = (flowSerial: number) => {
    const occurrences = steps.filter(
      (candidate) =>
        candidate.flowSerial === flowSerial && candidate.applicable,
    );
    return occurrences.length > 0 && occurrences.every(isStepComplete);
  };
  if (allComplete) return "CLOSED";
  if (complete(158)) return "PERIOD_LOCKED";
  if (complete(157)) return "CLOSED";
  if (complete(143)) return "COST_FINALIZED";
  if (complete(127) || complete(126)) return "FG_R";
  if (complete(124)) return "RELEASE_READY";
  if (complete(121)) return "FG_Q";
  if (complete(120)) return "PACKAGING_RECONCILED";
  if (serial >= 108) return "PACKAGING";
  if (complete(98)) return "QC_PASSED";
  if (serial >= 97) return "QC_PENDING";
  if (complete(96)) return "PRODUCTION_COMPLETE";
  if (serial >= 79) return "IN_PRODUCTION";
  if (complete(70)) return "ISSUED";
  if (complete(67)) return "STAGED";
  if (complete(66)) return "RESERVED";
  if (complete(62)) return "MATERIAL_READY";
  if (serial >= 59) return "MATERIAL_QC_PENDING";
  if (complete(53)) return "APPROVED";
  if (serial >= 49) return "PENDING_APPROVAL";
  if (serial >= 37) return "PLANNED";
  return "DRAFT";
}

@Injectable()
export class ManufacturingWorkflowService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ManufacturingElectronicSignatureService)
    private readonly electronicSignature: ManufacturingElectronicSignatureService,
    @Optional()
    @Inject(ManufacturingService)
    private readonly manufacturing?: ManufacturingService,
  ) {}

  private primaryOrderStepSerial(
    orderType: ManufacturingOrderType | null | undefined,
    manufacturingMode: RunRow["manufacturingMode"],
  ) {
    if (orderType === ManufacturingOrderType.ASSEMBLY) return 50;
    if (orderType === ManufacturingOrderType.PHARMACEUTICAL) return 51;
    if (orderType === ManufacturingOrderType.SUBCONTRACT) return 52;
    return manufacturingMode === "GENERAL" ? 50 : 51;
  }

  private runStepSelector(stepId: string) {
    if (/^\d{1,3}$/.test(stepId))
      return Prisma.sql`sd."flowSerial" = ${Number(stepId)} AND rs."occurrenceKey" = 'PRIMARY'`;
    if (/^\d{2}\.\d{2}$/.test(stepId))
      return Prisma.sql`sd."legacyStepCode" = ${stepId} AND rs."occurrenceKey" = 'PRIMARY'`;
    return Prisma.sql`rs."id" = ${stepId}`;
  }

  private assertRunAllowsWorkflowChanges(run: RunRow) {
    if (run.status === "CANCELLED")
      throw new ConflictException(
        "A cancelled manufacturing run is read-only.",
      );
  }

  private async scope(
    currentUser: AuthenticatedRequestUser,
    requestedWorkspaceId?: string,
  ) {
    const workspaceId = requestedWorkspaceId || currentUser.workspaceId;
    if (!workspaceId || !currentUser.workspaceId)
      throw new BadRequestException("An active workspace is required.");
    if (workspaceId !== currentUser.workspaceId)
      throw new ForbiddenException(
        "Cross-workspace manufacturing access is not allowed.",
      );
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
      },
      select: { id: true, tenantId: true, companyId: true },
    });
    if (!workspace) throw new NotFoundException("Workspace not found.");
    return workspace;
  }

  private workflowUnavailable(error: unknown): never {
    if (isWorkflowStoreMissing(error))
      throw new ServiceUnavailableException(
        "The reviewed manufacturing workflow migration has not been applied.",
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ConflictException(
        "This workflow run, transition, or posting source was already recorded. Refresh and retry with the original result.",
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    )
      throw new ConflictException(
        "The manufacturing workflow changed concurrently. Refresh and retry with the same idempotency key.",
      );
    throw error;
  }

  getActiveDefinition() {
    const groups = manufacturingWorkflowGroups.map((group) => ({
      id: `mwfg-a-k-v${MANUFACTURING_WORKFLOW_DEFINITION_VERSION}-${group.flowGroupCode}`,
      ...group,
      steps: manufacturingWorkflowSteps
        .filter((step) => step.flowGroupCode === group.flowGroupCode)
        .map((step) => ({
          id: `mwfs-a-k-v${MANUFACTURING_WORKFLOW_DEFINITION_VERSION}-${String(step.flowSerial).padStart(3, "0")}`,
          legacyGroupCode: group.legacyGroupCode,
          flowGroupName: group.name,
          flowGroupOrder: group.flowGroupOrder,
          ...step,
          dependencies: manufacturingStepDependencies
            .filter((dependency) => dependency.stepSerial === step.flowSerial)
            .map((dependency) => ({
              prerequisiteFlowSerial: dependency.prerequisiteStepSerial,
              requiredStatus: dependency.requiredStatus,
              dependencyType: dependency.dependencyType,
              conditionExpression: dependency.conditionExpression,
            })),
        })),
    }));
    return {
      id: `mwf-a-k-v${MANUFACTURING_WORKFLOW_DEFINITION_VERSION}`,
      version: String(MANUFACTURING_WORKFLOW_DEFINITION_VERSION),
      isActive: true,
      effectiveFrom: "2026-09-01",
      totalGroups: 11 as const,
      totalSteps: 159 as const,
      groups,
    };
  }

  private mapConfiguration(
    workspaceId: string,
    row: WorkflowVisibilityRow | null,
  ) {
    const stored = parseWorkflowVisibilitySettings(row?.settings);
    const hiddenStepSerials = [
      ...new Set(
        stored.hiddenStepCodes.flatMap((code) => {
          const serial = WORKFLOW_SERIAL_BY_LEGACY_CODE.get(code);
          return serial === undefined ? [] : [serial];
        }),
      ),
    ].sort((left, right) => left - right);
    const hidden = new Set(hiddenStepSerials);
    return {
      workspaceId,
      workflowDefinitionVersion: CURRENT_WORKFLOW_DEFINITION_VERSION,
      totalSteps: 159 as const,
      hiddenStepSerials,
      enabledStepSerials: ALL_WORKFLOW_STEP_SERIALS.filter(
        (serial) => !hidden.has(serial),
      ),
      revision: stored.revision,
      updatedAt: iso(row?.updatedAt),
      updatedByUserId: stored.updatedByUserId,
    };
  }

  private assertConfigurationScope(
    row: WorkflowVisibilityRow,
    scope: { id: string; tenantId: string; companyId: string },
  ) {
    if (
      row.workspaceId !== scope.id ||
      row.tenantId !== scope.tenantId ||
      row.companyId !== scope.companyId
    )
      throw new ConflictException(
        "The saved manufacturing workflow configuration does not belong to the active company and workspace.",
      );
  }

  async getConfiguration(
    currentUser: AuthenticatedRequestUser,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    const row = await this.prisma.workspaceAppSettings.findUnique({
      where: {
        workspaceId_namespace: {
          workspaceId: scope.id,
          namespace: MANUFACTURING_WORKFLOW_VISIBILITY_NAMESPACE,
        },
      },
      select: {
        id: true,
        tenantId: true,
        companyId: true,
        workspaceId: true,
        settings: true,
        updatedAt: true,
      },
    });
    if (row) this.assertConfigurationScope(row, scope);
    return this.mapConfiguration(scope.id, row);
  }

  async updateConfiguration(
    currentUser: AuthenticatedRequestUser,
    dto: UpdateManufacturingWorkflowConfigurationDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    if (dto.workflowDefinitionVersion !== CURRENT_WORKFLOW_DEFINITION_VERSION)
      throw new ConflictException(
        `Manufacturing workflow definition changed from ${dto.workflowDefinitionVersion} to ${CURRENT_WORKFLOW_DEFINITION_VERSION}. Refresh the configuration before saving.`,
      );
    if (new Set(dto.hiddenStepSerials).size !== dto.hiddenStepSerials.length)
      throw new BadRequestException(
        "Manufacturing workflow configuration contains duplicate step serials.",
      );
    const hiddenStepSerials = [...dto.hiddenStepSerials].sort(
      (left, right) => left - right,
    );
    const unknownStepSerial = hiddenStepSerials.find(
      (serial) => !WORKFLOW_STEP_BY_SERIAL.has(serial),
    );
    if (unknownStepSerial !== undefined)
      throw new BadRequestException(
        `Manufacturing workflow step ${unknownStepSerial} does not exist in definition ${CURRENT_WORKFLOW_DEFINITION_VERSION}.`,
      );
    if (hiddenStepSerials.length >= ALL_WORKFLOW_STEP_SERIALS.length)
      throw new BadRequestException(
        "At least one manufacturing workflow step must remain visible.",
      );
    const hiddenStepCodes = hiddenStepSerials.map(
      (serial) => WORKFLOW_STEP_BY_SERIAL.get(serial)!.legacyStepCode,
    );

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.workspaceAppSettings.findUnique({
            where: {
              workspaceId_namespace: {
                workspaceId: scope.id,
                namespace: MANUFACTURING_WORKFLOW_VISIBILITY_NAMESPACE,
              },
            },
            select: {
              id: true,
              tenantId: true,
              companyId: true,
              workspaceId: true,
              settings: true,
              updatedAt: true,
            },
          });
          if (existing) this.assertConfigurationScope(existing, scope);
          const current = this.mapConfiguration(scope.id, existing);
          const stored = parseWorkflowVisibilitySettings(existing?.settings);
          const samePayload = sameNumberArray(
            current.hiddenStepSerials,
            hiddenStepSerials,
          );
          const storedOnCurrentDefinition =
            stored.workflowDefinitionVersion ===
            CURRENT_WORKFLOW_DEFINITION_VERSION;

          if (dto.expectedRevision !== current.revision) {
            if (existing && samePayload && storedOnCurrentDefinition)
              return current;
            throw new ConflictException(
              `Manufacturing workflow configuration revision changed from ${dto.expectedRevision} to ${current.revision}. Refresh and retry.`,
            );
          }
          if (samePayload && (!existing || storedOnCurrentDefinition))
            return current;

          const nextRevision = current.revision + 1;
          const settings: WorkflowVisibilitySettings = {
            schemaVersion: 1,
            workflowDefinitionVersion: CURRENT_WORKFLOW_DEFINITION_VERSION,
            hiddenStepCodes,
            revision: nextRevision,
            updatedByUserId: currentUser.id,
          };
          const saved = await tx.workspaceAppSettings.upsert({
            where: {
              workspaceId_namespace: {
                workspaceId: scope.id,
                namespace: MANUFACTURING_WORKFLOW_VISIBILITY_NAMESPACE,
              },
            },
            create: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              namespace: MANUFACTURING_WORKFLOW_VISIBILITY_NAMESPACE,
              settings: settings as Prisma.InputJsonValue,
              backupHistory: [],
              taxRates: [],
              taxGroups: [],
              currencies: [],
            },
            update: { settings: settings as Prisma.InputJsonValue },
            select: {
              id: true,
              tenantId: true,
              companyId: true,
              workspaceId: true,
              settings: true,
              updatedAt: true,
            },
          });
          this.assertConfigurationScope(saved, scope);
          await tx.auditLog.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              userId: currentUser.id,
              action: "MANUFACTURING_WORKFLOW_CONFIGURATION_CHANGED",
              entityType: "WORKSPACE_APP_SETTINGS",
              entityId: saved.id,
              oldValues: existing
                ? ({
                    workflowDefinitionVersion: stored.workflowDefinitionVersion,
                    hiddenStepCodes: stored.hiddenStepCodes,
                    hiddenStepSerials: current.hiddenStepSerials,
                    revision: current.revision,
                  } as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              newValues: {
                workflowDefinitionVersion: CURRENT_WORKFLOW_DEFINITION_VERSION,
                hiddenStepCodes,
                hiddenStepSerials,
                revision: nextRevision,
                presentationOnly: true,
              } as Prisma.InputJsonValue,
            },
          });
          return this.mapConfiguration(scope.id, saved);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code)
      )
        throw new ConflictException(
          "The manufacturing workflow configuration changed concurrently. Refresh and retry.",
        );
      throw error;
    }
  }

  async getElectronicSignatureContext(
    currentUser: AuthenticatedRequestUser,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    const policyDate = dateOnlyUtc(new Date());
    const [settings, policyRecord] = await Promise.all([
      this.prisma.manufacturingSettings.findUnique({
        where: { workspaceId: scope.id },
        select: { electronicSignatureRequired: true },
      }),
      this.prisma.manufacturingControlRecord.findFirst({
        where: {
          workspaceId: scope.id,
          kind: "ELECTRONIC_SIGNATURE_POLICY",
          status: "APPROVED",
          AND: [
            {
              OR: [
                { effectiveFrom: null },
                { effectiveFrom: { lte: policyDate } },
              ],
            },
            {
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: policyDate } }],
            },
          ],
        },
        orderBy: [{ approvedAt: "desc" }, { versionNumber: "desc" }],
        select: { id: true, code: true, versionNumber: true, payload: true },
      }),
    ]);
    const policy = policyRecord
      ? parseManufacturingElectronicSignaturePolicy(policyRecord.payload)
      : null;
    const required = Boolean(settings?.electronicSignatureRequired);
    const blockedReason = !required
      ? null
      : !policyRecord || !policy
        ? "An approved, valid manufacturing electronic-signature policy is required."
        : policy.mfaRequired
          ? "The approved policy requires MFA, but manufacturing MFA verification is not configured. Signed actions are blocked."
          : null;
    return {
      required,
      policyReady: Boolean(policyRecord && policy),
      policyRecordId: policyRecord?.id ?? null,
      policyCode: policyRecord?.code ?? null,
      policyVersion: policyRecord?.versionNumber ?? null,
      allowedMeanings: policy?.signatureMeanings ?? [],
      reauthenticationRequired: policy?.reauthenticationRequired ?? false,
      mfaRequired: policy?.mfaRequired ?? false,
      mfaAvailable: false,
      blockedReason,
    };
  }

  async listRuns(
    currentUser: AuthenticatedRequestUser,
    query: ListManufacturingRunsQueryDto,
  ) {
    const scope = await this.scope(currentUser, query.workspaceId);
    try {
      const filters: Prisma.Sql[] = [Prisma.sql`r."workspaceId" = ${scope.id}`];
      if (query.status)
        filters.push(Prisma.sql`r."status"::text = ${query.status}`);
      if (query.productionOrderId)
        filters.push(
          Prisma.sql`r."productionOrderId" = ${query.productionOrderId}`,
        );
      if (query.productId)
        filters.push(Prisma.sql`r."productId" = ${query.productId}`);
      const rows = await this.prisma.$queryRaw<RunRow[]>(Prisma.sql`
        SELECT r.*, d."version" AS "workflowDefinitionVersion"
        FROM "ManufacturingRun" r
        JOIN "ManufacturingWorkflowDefinition" d ON d."id" = r."workflowDefinitionId"
        WHERE ${Prisma.join(filters, " AND ")}
        ORDER BY r."updatedAt" DESC
        LIMIT 50
      `);
      return Promise.all(rows.map((row) => this.hydrateRun(this.prisma, row)));
    } catch (error) {
      return this.workflowUnavailable(error);
    }
  }

  async startRun(
    currentUser: AuthenticatedRequestUser,
    dto: StartManufacturingRunDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const requestedPlanId = dto.productionPlanId?.trim() || null;
    const requestedOrderId = dto.productionOrderId?.trim() || null;
    const requestedProductId = dto.productId?.trim() || null;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const replay = await tx.$queryRaw<RunRow[]>(Prisma.sql`
            SELECT r.*, d."version" AS "workflowDefinitionVersion"
            FROM "ManufacturingRun" r
            JOIN "ManufacturingWorkflowDefinition" d ON d."id" = r."workflowDefinitionId"
            WHERE r."workspaceId" = ${scope.id}
              AND r."idempotencyKey" = ${dto.idempotencyKey}
            LIMIT 1
          `);
          if (replay[0]) return this.hydrateRun(tx, replay[0]);

          if (!requestedPlanId && !requestedOrderId && !requestedProductId)
            throw new BadRequestException(
              "A manufacturing run must be linked to a valid production order, approved production plan, or configured manufactured product.",
            );
          const startedAt = dto.startedAt
            ? new Date(dto.startedAt)
            : new Date();
          if (Number.isNaN(startedAt.getTime()))
            throw new BadRequestException("startedAt is invalid.");
          // BOM effective fields are DATE values. Compare them with the UTC
          // calendar day of the run so effective-to remains inclusive for the
          // entire final day instead of expiring immediately after midnight.
          const startedOn = dateOnlyUtc(dto.startedAt ?? startedAt);

          const suppliedPlan = requestedPlanId
            ? await tx.manufacturingPlan.findFirst({
                where: { id: requestedPlanId, workspaceId: scope.id },
                select: {
                  id: true,
                  finishedProductId: true,
                  status: true,
                  bomVersion: {
                    select: {
                      status: true,
                      components: {
                        where: { isOptional: false },
                        select: {
                          inventoryItem: {
                            select: {
                              manufacturingProfile: {
                                select: { isActive: true, role: true },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              })
            : null;
          if (requestedPlanId && !suppliedPlan)
            throw new BadRequestException(
              "Production plan is outside the active workspace.",
            );
          if (
            suppliedPlan &&
            (!ACTIVE_WORKFLOW_PLAN_STATUSES.has(suppliedPlan.status) ||
              suppliedPlan.bomVersion.status === "DRAFT")
          )
            throw new BadRequestException(
              "A plan-bound manufacturing run requires an approved, released, or in-progress plan with an approved or retired BOM version.",
            );
          const order = requestedOrderId
            ? await tx.manufacturingOrder.findFirst({
                where: { id: requestedOrderId, workspaceId: scope.id },
                select: {
                  id: true,
                  finishedProductId: true,
                  planId: true,
                  type: true,
                  status: true,
                  bomVersion: {
                    select: {
                      status: true,
                      components: {
                        where: { isOptional: false },
                        select: {
                          inventoryItem: {
                            select: {
                              manufacturingProfile: {
                                select: { isActive: true, role: true },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  routingVersion: {
                    select: {
                      status: true,
                      operations: { select: { id: true } },
                    },
                  },
                  lots: { select: { id: true } },
                  operationExecutions: {
                    select: {
                      id: true,
                      orderLotId: true,
                      routingOperationId: true,
                    },
                  },
                },
              })
            : null;
          if (requestedOrderId && !order)
            throw new BadRequestException(
              "Production order is outside the active workspace.",
            );
          if (
            order &&
            (!ACTIVE_WORKFLOW_ORDER_STATUSES.has(order.status) ||
              order.bomVersion.status === "DRAFT")
          )
            throw new BadRequestException(
              "A production-order run requires an active order with an approved or retired BOM version; completed, closed, and cancelled orders cannot start a new run.",
            );
          if (
            order &&
            !new Set<ManufacturingOrderType>([
              ManufacturingOrderType.ASSEMBLY,
              ManufacturingOrderType.PHARMACEUTICAL,
              ManufacturingOrderType.SUBCONTRACT,
            ]).has(order.type)
          )
            throw new BadRequestException(
              `Production order type ${order.type} cannot be the primary order of an A-to-K manufacturing run.`,
            );
          if (
            order &&
            !["APPROVED", "RETIRED"].includes(
              order.routingVersion?.status ?? "",
            )
          )
            throw new BadRequestException(
              "A production-order run requires its pinned approved or retired routing version.",
            );
          if (order && !order.routingVersion?.operations.length)
            throw new BadRequestException(
              "The production order's controlled routing has no operations.",
            );
          if (order && !order.lots.length)
            throw new BadRequestException(
              "A production-order run requires at least one production lot.",
            );
          if (order) {
            const expectedExecutions = order.lots.flatMap((lot) =>
              order.routingVersion!.operations.map(
                (operation) => `${lot.id}:${operation.id}`,
              ),
            );
            const availableExecutions = new Set(
              order.operationExecutions
                .filter((execution) => execution.orderLotId)
                .map(
                  (execution) =>
                    `${execution.orderLotId}:${execution.routingOperationId}`,
                ),
            );
            if (
              expectedExecutions.some(
                (executionKey) => !availableExecutions.has(executionKey),
              )
            )
              throw new BadRequestException(
                "The production order is missing one or more lot-specific routing operation executions.",
              );
          }
          if (order && requestedPlanId && order.planId !== requestedPlanId)
            throw new BadRequestException(
              "The supplied production plan does not match the production order's plan.",
            );
          const productionPlanId = order?.planId ?? suppliedPlan?.id ?? null;
          const plan =
            suppliedPlan ??
            (productionPlanId
              ? await tx.manufacturingPlan.findFirst({
                  where: { id: productionPlanId, workspaceId: scope.id },
                  select: { id: true, finishedProductId: true },
                })
              : null);
          if (productionPlanId && !plan)
            throw new BadRequestException(
              "The production order's plan is outside the active workspace.",
            );
          if (
            order &&
            plan &&
            order.finishedProductId !== plan.finishedProductId
          )
            throw new BadRequestException(
              "The production order and production plan reference different finished products.",
            );
          if (
            requestedProductId &&
            order &&
            requestedProductId !== order.finishedProductId
          )
            throw new BadRequestException(
              "The supplied manufactured product does not match the production order.",
            );
          if (
            requestedProductId &&
            plan &&
            requestedProductId !== plan.finishedProductId
          )
            throw new BadRequestException(
              "The supplied manufactured product does not match the production plan.",
            );
          const productId =
            order?.finishedProductId ??
            plan?.finishedProductId ??
            requestedProductId ??
            null;
          let productApprovedBomHasPackaging = false;
          if (productId) {
            const product = await tx.inventoryItem.findFirst({
              where: { id: productId, workspaceId: scope.id },
              select: {
                id: true,
                kind: true,
                status: true,
                manufacturingProfile: {
                  select: { isActive: true, role: true, makeBuy: true },
                },
                manufacturingBoms: {
                  where: { isActive: true },
                  select: {
                    versions: {
                      where: {
                        status: "APPROVED",
                        AND: [
                          {
                            OR: [
                              { effectiveFrom: null },
                              { effectiveFrom: { lte: startedOn } },
                            ],
                          },
                          {
                            OR: [
                              { effectiveTo: null },
                              { effectiveTo: { gte: startedOn } },
                            ],
                          },
                        ],
                      },
                      select: {
                        id: true,
                        components: {
                          where: { isOptional: false },
                          select: {
                            inventoryItem: {
                              select: {
                                manufacturingProfile: {
                                  select: { isActive: true, role: true },
                                },
                              },
                            },
                          },
                        },
                      },
                      take: 1,
                    },
                  },
                },
              },
            });
            if (!product)
              throw new BadRequestException(
                "Manufactured product is outside the active workspace.",
              );
            if (product.kind !== "PRODUCT" || product.status !== "ACTIVE")
              throw new BadRequestException(
                "A manufacturing run requires an active inventory product.",
              );
            if (
              !product.manufacturingProfile?.isActive ||
              !MANUFACTURABLE_PRODUCT_ROLES.has(
                product.manufacturingProfile.role,
              ) ||
              !["MAKE", "BOTH"].includes(product.manufacturingProfile.makeBuy)
            )
              throw new BadRequestException(
                "The selected product needs an active manufacturable item profile.",
              );
            const hasApprovedBom = product.manufacturingBoms.some(
              (bom) => bom.versions.length > 0,
            );
            productApprovedBomHasPackaging = product.manufacturingBoms.some(
              (bom) =>
                bom.versions.some((version) =>
                  bomVersionHasRequiredPackagingComponents(version),
                ),
            );
            if (!order && !plan && !hasApprovedBom)
              throw new BadRequestException(
                "A product-bound manufacturing run requires an active approved BOM version effective on the run start date.",
              );
          }
          const settings = await tx.manufacturingSettings.findUnique({
            where: { workspaceId: scope.id },
            select: {
              mode: true,
              electronicSignatureRequired: true,
              packagingInventoryAccountId: true,
            },
          });
          if (
            dto.manufacturingMode &&
            settings?.mode &&
            dto.manufacturingMode !== settings.mode
          )
            throw new BadRequestException(
              `The requested ${dto.manufacturingMode} mode does not match the company's saved ${settings.mode} manufacturing mode.`,
            );
          const manufacturingMode =
            settings?.mode ?? dto.manufacturingMode ?? "GENERAL";
          if (!order && manufacturingMode === "HYBRID")
            throw new BadRequestException(
              "A HYBRID manufacturing run must be linked to a production order so its assembly, pharmaceutical, or subcontract branch is unambiguous.",
            );
          if (
            (order?.type === "ASSEMBLY" &&
              manufacturingMode === "PHARMACEUTICAL") ||
            (order?.type === "PHARMACEUTICAL" &&
              manufacturingMode === "GENERAL")
          )
            throw new BadRequestException(
              `Production order type ${order.type} is incompatible with ${manufacturingMode} manufacturing mode.`,
            );
          if (order) {
            if (!this.manufacturing)
              throw new ServiceUnavailableException(
                "Manufacturing readiness validation is unavailable; no production-order workflow run was created.",
              );
            const readiness = await this.manufacturing.getReadiness(
              currentUser,
              scope.id,
            );
            if (!readiness.ready) {
              const blockers = readiness.checks
                .filter((check) => check.state === "BLOCKED")
                .map(
                  (check) => check.message || `${check.label} is not ready.`,
                );
              throw new PreconditionFailedException(
                `Manufacturing readiness is incomplete. ${blockers.join(" ")}`,
              );
            }
          }

          const electronicSignatureRequired = Boolean(
            settings?.electronicSignatureRequired,
          );
          if (electronicSignatureRequired) {
            const policyRecord = await tx.manufacturingControlRecord.findFirst({
              where: {
                workspaceId: scope.id,
                kind: "ELECTRONIC_SIGNATURE_POLICY",
                status: "APPROVED",
                AND: [
                  {
                    OR: [
                      { effectiveFrom: null },
                      { effectiveFrom: { lte: startedOn } },
                    ],
                  },
                  {
                    OR: [
                      { effectiveTo: null },
                      { effectiveTo: { gte: startedOn } },
                    ],
                  },
                ],
              },
              orderBy: [{ approvedAt: "desc" }, { versionNumber: "desc" }],
              select: { payload: true },
            });
            const policy = policyRecord
              ? parseManufacturingElectronicSignaturePolicy(
                  policyRecord.payload,
                )
              : null;
            if (!policy)
              throw new PreconditionFailedException(
                "An approved electronic-signature policy effective on the run start date is required.",
              );
            if (policy.mfaRequired)
              throw new PreconditionFailedException(
                "The approved electronic-signature policy requires MFA, but manufacturing MFA verification is not configured.",
              );
          }

          const boundBomHasPackaging = order
            ? bomVersionHasRequiredPackagingComponents(order.bomVersion)
            : suppliedPlan
              ? bomVersionHasRequiredPackagingComponents(
                  suppliedPlan.bomVersion,
                )
              : productApprovedBomHasPackaging;
          const packagingBranchRequired = boundBomHasPackaging;
          if (packagingBranchRequired) {
            if (!settings?.packagingInventoryAccountId)
              throw new PreconditionFailedException(
                "A packaging-material BOM branch requires a packaging inventory ASSET ledger.",
              );
            const packagingLedger = await tx.account.findFirst({
              where: {
                id: settings.packagingInventoryAccountId,
                companyId: scope.companyId,
                level: "LEDGER",
                status: "ACTIVE",
                nature: "ASSET",
              },
              select: { id: true },
            });
            if (!packagingLedger)
              throw new PreconditionFailedException(
                "The configured packaging inventory account must be an active ASSET LEDGER account in this company.",
              );
            const packagingSequence =
              await tx.manufacturingDocumentSequence.findFirst({
                where: {
                  workspaceId: scope.id,
                  documentKind: "PACKAGING_ORDER",
                  isActive: true,
                },
                select: { id: true },
              });
            if (!packagingSequence)
              throw new PreconditionFailedException(
                "An active PACKAGING_ORDER document sequence is required for the packaging workflow branch.",
              );
          }
          const primaryOrderStepSerial = this.primaryOrderStepSerial(
            order?.type,
            manufacturingMode,
          );
          const modeApplicableStepSerials = manufacturingWorkflowSteps
            .filter((step) => step.allowedModes.includes(manufacturingMode))
            .map((step) => step.flowSerial);
          if (order) {
            const activeRuns = await tx.$queryRaw<
              Array<{ id: string; status: string }>
            >(Prisma.sql`
              SELECT r."id", r."status"::text AS "status"
              FROM "ManufacturingRun" r
              WHERE r."workspaceId" = ${scope.id}
                AND r."productionOrderId" = ${order.id}
                AND r."status"::text NOT IN ('CLOSED', 'CANCELLED', 'PERIOD_LOCKED')
              ORDER BY r."createdAt" ASC, r."id" ASC
              LIMIT 1
              FOR UPDATE
            `);
            if (activeRuns[0])
              throw new ConflictException(
                `Production order ${order.id} already has active manufacturing workflow run ${activeRuns[0].id}. Continue or close that run before starting another one.`,
              );
          }
          const definitions = await tx.$queryRaw<
            Array<{ id: string; version: number }>
          >(Prisma.sql`
            SELECT "id", "version"
            FROM "ManufacturingWorkflowDefinition"
            WHERE "id" = ${`mwf-a-k-v${MANUFACTURING_WORKFLOW_DEFINITION_VERSION}`}
              AND "version" = ${MANUFACTURING_WORKFLOW_DEFINITION_VERSION}
              AND "isActive" = true
              AND "effectiveFrom" <= CURRENT_DATE
            LIMIT 1
            FOR SHARE
          `);
          const definition = definitions[0];
          if (!definition)
            throw new ConflictException(
              "No active manufacturing workflow definition is installed.",
            );
          const runId = randomUUID();
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "ManufacturingRun" (
              "id", "tenantId", "companyId", "workspaceId",
              "workflowDefinitionId", "productionPlanId", "productionOrderId",
              "productId", "manufacturingMode", "status", "currentGroup",
              "currentStepSerial", "version", "idempotencyKey", "startedAt",
              "createdAt", "updatedAt"
            ) VALUES (
              ${runId}, ${scope.tenantId}, ${scope.companyId}, ${scope.id},
              ${definition.id}, ${productionPlanId},
              ${requestedOrderId}, ${productId},
              ${manufacturingMode}::"ManufacturingMode", 'DRAFT'::"ManufacturingRunStatus",
              'B', 8, 1, ${dto.idempotencyKey}, ${startedAt}, CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
          `);
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "ManufacturingRunStep" (
              "id", "runId", "stepDefinitionId", "occurrenceKey", "status",
              "applicable", "blockerReason", "naReason", "version",
              "createdAt", "updatedAt"
            )
            SELECT
              gen_random_uuid()::text,
              ${runId},
              sd."id",
              'PRIMARY',
              CASE
                WHEN sd."flowSerial" = ${primaryOrderStepSerial}
                  THEN 'READY'::"ManufacturingWorkflowStepStatus"
                WHEN sd."flowSerial" IN (50, 51, 52)
                  AND sd."flowSerial" <> ${primaryOrderStepSerial}
                  THEN 'N_A'::"ManufacturingWorkflowStepStatus"
                WHEN sd."flowSerial" = 11
                  THEN CASE WHEN ${electronicSignatureRequired}
                    THEN 'READY'::"ManufacturingWorkflowStepStatus"
                    ELSE 'N_A'::"ManufacturingWorkflowStepStatus" END
                WHEN sd."flowSerial" BETWEEN 108 AND 120
                  AND NOT ${packagingBranchRequired}
                  THEN 'N_A'::"ManufacturingWorkflowStepStatus"
                WHEN sd."flowSerial" BETWEEN 108 AND 120
                  AND ${packagingBranchRequired}
                  AND sd."flowSerial" IN (${Prisma.join(modeApplicableStepSerials)})
                  THEN 'READY'::"ManufacturingWorkflowStepStatus"
                WHEN NOT (sd."flowSerial" IN (${Prisma.join(modeApplicableStepSerials)}))
                  OR sd."applicabilityType"::text IN ('CONDITIONAL', 'PERIODIC', 'NOT_APPLICABLE')
                  THEN 'N_A'::"ManufacturingWorkflowStepStatus"
                ELSE 'READY'::"ManufacturingWorkflowStepStatus"
              END,
              CASE
                WHEN sd."flowSerial" = ${primaryOrderStepSerial}
                  THEN true
                WHEN sd."flowSerial" IN (50, 51, 52)
                  AND sd."flowSerial" <> ${primaryOrderStepSerial}
                  THEN false
                WHEN sd."flowSerial" = 11
                  THEN ${electronicSignatureRequired}
                WHEN sd."flowSerial" BETWEEN 108 AND 120
                  AND NOT ${packagingBranchRequired}
                  THEN false
                WHEN sd."flowSerial" BETWEEN 108 AND 120
                  AND ${packagingBranchRequired}
                  AND sd."flowSerial" IN (${Prisma.join(modeApplicableStepSerials)})
                  THEN true
                WHEN NOT (sd."flowSerial" IN (${Prisma.join(modeApplicableStepSerials)}))
                  OR sd."applicabilityType"::text IN ('CONDITIONAL', 'PERIODIC', 'NOT_APPLICABLE')
                  THEN false ELSE true
              END,
              CASE
                WHEN sd."flowSerial" = ${primaryOrderStepSerial} THEN NULL
                WHEN sd."flowSerial" IN (50, 51, 52)
                  AND sd."flowSerial" <> ${primaryOrderStepSerial} THEN NULL
                WHEN sd."flowSerial" = 11 THEN NULL
                WHEN sd."flowSerial" BETWEEN 108 AND 120 THEN NULL
                WHEN NOT (sd."flowSerial" IN (${Prisma.join(modeApplicableStepSerials)}))
                  OR sd."applicabilityType"::text IN ('CONDITIONAL', 'PERIODIC', 'NOT_APPLICABLE')
                  THEN NULL
                ELSE NULL
              END,
              CASE
                WHEN sd."flowSerial" = ${primaryOrderStepSerial} THEN NULL
                WHEN sd."flowSerial" IN (50, 51, 52)
                  AND sd."flowSerial" <> ${primaryOrderStepSerial}
                  THEN 'Another primary production-order type applies to this run.'
                WHEN sd."flowSerial" = 11
                  AND NOT ${electronicSignatureRequired}
                  THEN 'Electronic signatures are disabled in manufacturing settings.'
                WHEN sd."flowSerial" = 11 THEN NULL
                WHEN sd."flowSerial" BETWEEN 108 AND 120
                  AND NOT ${packagingBranchRequired}
                  THEN 'The bound BOM has no required packaging-material component.'
                WHEN sd."flowSerial" BETWEEN 108 AND 120
                  AND ${packagingBranchRequired}
                  AND sd."flowSerial" IN (${Prisma.join(modeApplicableStepSerials)})
                  THEN NULL
                WHEN NOT (sd."flowSerial" IN (${Prisma.join(modeApplicableStepSerials)}))
                  THEN 'Not applicable to the selected manufacturing mode.'
                WHEN sd."applicabilityType"::text IN ('CONDITIONAL', 'PERIODIC', 'NOT_APPLICABLE')
                  THEN 'Not currently triggered for this manufacturing run.'
                ELSE NULL
              END,
              1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            FROM "ManufacturingWorkflowStepDefinition" sd
            WHERE sd."workflowDefinitionId" = ${definition.id}
              AND sd."isActive" = true
            ORDER BY sd."flowSerial"
          `);
          await tx.auditLog.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              userId: currentUser.id,
              action: "MANUFACTURING_RUN_STARTED",
              entityType: "MANUFACTURING_RUN",
              entityId: runId,
              newValues: {
                workflowDefinitionVersion: definition.version,
                manufacturingMode,
                productionPlanId,
                productionOrderId: requestedOrderId,
                productId,
                electronicSignatureRequired,
                packagingBranchRequired,
              } as Prisma.InputJsonValue,
            },
          });
          const rows = await tx.$queryRaw<RunRow[]>(Prisma.sql`
            SELECT r.*, d."version" AS "workflowDefinitionVersion"
            FROM "ManufacturingRun" r
            JOIN "ManufacturingWorkflowDefinition" d ON d."id" = r."workflowDefinitionId"
            WHERE r."id" = ${runId}
          `);
          return this.hydrateRun(tx, rows[0]!);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.workflowUnavailable(error);
    }
  }

  async discardEmptyRun(
    currentUser: AuthenticatedRequestUser,
    runId: string,
    dto: DiscardEmptyManufacturingRunDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const reason = dto.reason.trim();
    if (!reason)
      throw new BadRequestException(
        "Discarding an empty manufacturing run requires a reason.",
      );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const run = await this.assertRunInScope(tx, runId, scope.id, true);
          if (run.status === "CANCELLED") return this.hydrateRun(tx, run);
          if (
            dto.expectedVersion !== undefined &&
            dto.expectedVersion !== run.version
          )
            throw new ConflictException(
              "The manufacturing run changed after it was loaded. Refresh and retry.",
            );
          if (run.productionOrderId || run.productionPlanId || run.productId)
            throw new ConflictException(
              "Only an unbound manufacturing run can be discarded here. Cancel a bound production document through its controlled domain workflow.",
            );
          if (run.status !== "DRAFT")
            throw new ConflictException(
              "Only an untouched draft manufacturing run can be discarded.",
            );

          const activity = await tx.$queryRaw<Array<{ hasActivity: boolean }>>(
            Prisma.sql`
              SELECT (
                EXISTS (
                  SELECT 1
                  FROM "ManufacturingRunStepTransition" transition_row
                  JOIN "ManufacturingRunStep" step ON step."id" = transition_row."runStepId"
                  WHERE step."runId" = ${run.id}
                )
                OR EXISTS (
                  SELECT 1 FROM "ManufacturingPostingLink"
                  WHERE "runId" = ${run.id}
                )
                OR EXISTS (
                  SELECT 1 FROM "ManufacturingEvidence"
                  WHERE "runId" = ${run.id}
                )
                OR EXISTS (
                  SELECT 1 FROM "ManufacturingRunStep"
                  WHERE "runId" = ${run.id}
                    AND (
                      "occurrenceKey" <> 'PRIMARY'
                      OR "status"::text NOT IN ('READY', 'N_A', 'LOCKED', 'BLOCKED')
                      OR "sourceRecordType" IS NOT NULL
                      OR "sourceRecordId" IS NOT NULL
                      OR "startedAt" IS NOT NULL
                      OR "completedAt" IS NOT NULL
                      OR "completedBy" IS NOT NULL
                      OR "approvedBy" IS NOT NULL
                      OR "signatureReference" IS NOT NULL
                      OR "version" <> 1
                    )
                )
              ) AS "hasActivity"
            `,
          );
          if (activity[0]?.hasActivity !== false)
            throw new ConflictException(
              "This manufacturing run has workflow activity or posting evidence and cannot be discarded.",
            );

          const updated = await tx.$executeRaw(Prisma.sql`
            UPDATE "ManufacturingRun"
            SET "status" = 'CANCELLED'::"ManufacturingRunStatus",
              "currentGroup" = NULL,
              "currentStepSerial" = NULL,
              "version" = "version" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${run.id}
              AND "workspaceId" = ${run.workspaceId}
              AND "version" = ${run.version}
              AND "status" = 'DRAFT'::"ManufacturingRunStatus"
          `);
          if (updated !== 1)
            throw new ConflictException(
              "The manufacturing run changed concurrently. Refresh and retry.",
            );
          await tx.auditLog.create({
            data: {
              tenantId: run.tenantId,
              companyId: run.companyId,
              workspaceId: run.workspaceId,
              userId: currentUser.id,
              action: "MANUFACTURING_EMPTY_RUN_DISCARDED",
              entityType: "MANUFACTURING_RUN",
              entityId: run.id,
              oldValues: {
                status: run.status,
                currentGroup: run.currentGroup,
                currentStepSerial: run.currentStepSerial,
              } as Prisma.InputJsonValue,
              newValues: {
                status: "CANCELLED",
                reason,
                emptyRun: true,
              } as Prisma.InputJsonValue,
            },
          });
          run.status = "CANCELLED";
          run.currentGroup = null;
          run.currentStepSerial = null;
          run.version += 1;
          return this.hydrateRun(tx, run);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.workflowUnavailable(error);
    }
  }

  async createStepOccurrence(
    currentUser: AuthenticatedRequestUser,
    runId: string,
    stepId: string,
    dto: CreateManufacturingRunStepOccurrenceDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const occurrenceKey = dto.occurrenceKey.trim();
    if (!occurrenceKey)
      throw new BadRequestException("A non-empty occurrence key is required.");
    if (occurrenceKey.toUpperCase() === "PRIMARY")
      throw new BadRequestException(
        "PRIMARY is reserved for the run's original workflow step.",
      );

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const run = await this.assertRunInScope(tx, runId, scope.id, true);
          this.assertRunAllowsWorkflowChanges(run);
          const selector = this.runStepSelector(stepId);
          const rows = await tx.$queryRaw<RunStepRow[]>(Prisma.sql`
            SELECT rs.*, sd."flowSerial", sd."legacyStepCode",
              g."flowGroupCode", g."name" AS "flowGroupName",
              g."flowGroupOrder", sd."title",
              sd."route", sd."postingEffect"::text AS "postingEffect",
              sd."permissionKey", sd."completionRule",
              sd."applicabilityType"::text AS "applicabilityType",
              sd."stepType"::text AS "stepType", sd."repeatable",
              sd."isBlocking"
            FROM "ManufacturingRunStep" rs
            JOIN "ManufacturingWorkflowStepDefinition" sd ON sd."id" = rs."stepDefinitionId"
            JOIN "ManufacturingWorkflowGroup" g ON g."id" = sd."workflowGroupId"
            WHERE rs."runId" = ${run.id}
              AND sd."workflowDefinitionId" = ${run.workflowDefinitionId}
              AND ${selector}
            LIMIT 1
            FOR UPDATE OF rs
          `);
          const step = rows[0];
          if (!step)
            throw new NotFoundException("Manufacturing run step not found.");

          const granted = await this.permissions.getGrantedKeys(currentUser);
          if (!granted.has(step.permissionKey))
            throw new ForbiddenException(
              `Permission required: ${step.permissionKey}`,
            );
          if (!step.repeatable)
            throw new BadRequestException(
              `Step ${step.flowSerial} is not repeatable and cannot have another occurrence.`,
            );

          const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id"
            FROM "ManufacturingRunStep"
            WHERE "runId" = ${run.id}
              AND "stepDefinitionId" = ${step.stepDefinitionId}
              AND "occurrenceKey" = ${occurrenceKey}
            LIMIT 1
          `);
          if (existing[0]) return this.hydrateRun(tx, run);

          if (
            ["CANCELLED", "CLOSED", "PERIOD_LOCKED", "ON_HOLD"].includes(
              run.status,
            )
          )
            throw new ConflictException(
              `A new occurrence cannot be added while the manufacturing run is ${run.status}.`,
            );
          if (!step.applicable || ["CANCELLED", "CLOSED"].includes(step.status))
            throw new ConflictException(
              `Step ${step.flowSerial} must be applicable and active before another occurrence can be added.`,
            );

          const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            INSERT INTO "ManufacturingRunStep" (
              "id", "runId", "stepDefinitionId", "occurrenceKey", "status",
              "applicable", "version", "createdAt", "updatedAt"
            ) VALUES (
              ${randomUUID()}, ${run.id}, ${step.stepDefinitionId},
              ${occurrenceKey}, 'READY'::"ManufacturingWorkflowStepStatus",
              true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            ON CONFLICT ("runId", "stepDefinitionId", "occurrenceKey")
            DO NOTHING
            RETURNING "id"
          `);
          if (!inserted[0]) {
            const concurrentReplay = await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT "id"
                FROM "ManufacturingRunStep"
                WHERE "runId" = ${run.id}
                  AND "stepDefinitionId" = ${step.stepDefinitionId}
                  AND "occurrenceKey" = ${occurrenceKey}
                LIMIT 1
              `,
            );
            if (concurrentReplay[0]) return this.hydrateRun(tx, run);
            throw new ConflictException(
              "The repeatable workflow occurrence could not be created.",
            );
          }

          await tx.auditLog.create({
            data: {
              tenantId: run.tenantId,
              companyId: run.companyId,
              workspaceId: run.workspaceId,
              userId: currentUser.id,
              action: "MANUFACTURING_RUN_STEP_OCCURRENCE_CREATED",
              entityType: "MANUFACTURING_RUN_STEP",
              entityId: inserted[0].id,
              newValues: {
                runId: run.id,
                stepDefinitionId: step.stepDefinitionId,
                flowSerial: step.flowSerial,
                occurrenceKey,
                status: "READY",
              } as Prisma.InputJsonValue,
            },
          });
          await this.refreshRun(tx, run, currentUser.id);
          const refreshed = await this.assertRunInScope(
            tx,
            run.id,
            run.workspaceId,
          );
          return this.hydrateRun(tx, refreshed);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.workflowUnavailable(error);
    }
  }

  async getRun(
    currentUser: AuthenticatedRequestUser,
    runId: string,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    try {
      const rows = await this.prisma.$queryRaw<RunRow[]>(Prisma.sql`
        SELECT r.*, d."version" AS "workflowDefinitionVersion"
        FROM "ManufacturingRun" r
        JOIN "ManufacturingWorkflowDefinition" d ON d."id" = r."workflowDefinitionId"
        WHERE r."id" = ${runId} AND r."workspaceId" = ${scope.id}
        LIMIT 1
      `);
      if (!rows[0]) throw new NotFoundException("Manufacturing run not found.");
      return this.hydrateRun(this.prisma, rows[0]);
    } catch (error) {
      return this.workflowUnavailable(error);
    }
  }

  async getNextAction(
    currentUser: AuthenticatedRequestUser,
    runId: string,
    workspaceId?: string,
  ) {
    const run = await this.getRun(currentUser, runId, workspaceId);
    return run.nextAction;
  }

  async getHistory(
    currentUser: AuthenticatedRequestUser,
    runId: string,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    try {
      await this.assertRunInScope(this.prisma, runId, scope.id);
      return await this.prisma.$queryRaw(Prisma.sql`
        SELECT
          t."id", t."fromStatus", t."toStatus", t."sourceAction",
          t."reason", t."performedByUserId", t."sourceRecordType",
          t."sourceRecordId", t."signatureReference", t."createdAt",
          sd."flowSerial", sd."title", sd."route", rs."occurrenceKey"
        FROM "ManufacturingRunStepTransition" t
        JOIN "ManufacturingRunStep" rs ON rs."id" = t."runStepId"
        JOIN "ManufacturingWorkflowStepDefinition" sd ON sd."id" = rs."stepDefinitionId"
        WHERE rs."runId" = ${runId}
        ORDER BY t."createdAt" DESC, t."id" DESC
      `);
    } catch (error) {
      return this.workflowUnavailable(error);
    }
  }

  async transitionStep(
    currentUser: AuthenticatedRequestUser,
    runId: string,
    stepId: string,
    dto: TransitionManufacturingRunStepDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const run = await this.assertRunInScope(tx, runId, scope.id, true);
          this.assertRunAllowsWorkflowChanges(run);
          const selector = this.runStepSelector(stepId);
          const rows = await tx.$queryRaw<RunStepRow[]>(Prisma.sql`
            SELECT rs.*, sd."flowSerial", sd."legacyStepCode",
              g."flowGroupCode", g."name" AS "flowGroupName",
              g."flowGroupOrder", sd."title",
              sd."route", sd."postingEffect"::text AS "postingEffect",
              sd."permissionKey", sd."completionRule",
              sd."applicabilityType"::text AS "applicabilityType",
              sd."stepType"::text AS "stepType", sd."repeatable",
              sd."isBlocking"
            FROM "ManufacturingRunStep" rs
            JOIN "ManufacturingWorkflowStepDefinition" sd ON sd."id" = rs."stepDefinitionId"
            JOIN "ManufacturingWorkflowGroup" g ON g."id" = sd."workflowGroupId"
            WHERE rs."runId" = ${runId}
              AND sd."workflowDefinitionId" = ${run.workflowDefinitionId}
              AND ${selector}
            LIMIT 1
            FOR UPDATE OF rs
          `);
          const step = rows[0];
          if (!step)
            throw new NotFoundException("Manufacturing run step not found.");
          const replay = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "ManufacturingRunStepTransition"
            WHERE "runStepId" = ${step.id} AND "idempotencyKey" = ${dto.idempotencyKey}
            LIMIT 1
          `);
          if (replay[0]) return this.hydrateRun(tx, run);

          const granted = await this.permissions.getGrantedKeys(currentUser);
          if (!granted.has(step.permissionKey))
            throw new ForbiddenException(
              `Permission required: ${step.permissionKey}`,
            );
          if (
            dto.expectedVersion !== undefined &&
            dto.expectedVersion !== step.version
          )
            throw new ConflictException(
              "The workflow step changed after it was loaded. Refresh and retry.",
            );
          if ((dto.action as string) === "CANCEL")
            throw new ConflictException(
              "Cancel the underlying source document or production order through its controlled domain workflow; an individual A-to-K run step cannot be cancelled.",
            );
          if (!(ALLOWED_ACTIONS[step.status] ?? []).includes(dto.action))
            throw new ConflictException(
              `${dto.action} is not valid while step ${step.flowSerial} is ${step.status}.`,
            );
          const dependencies = await this.dependencies(tx, run);
          const allSteps = await this.runSteps(tx, run);
          const missing = this.missingDependencies(
            step,
            allSteps,
            dependencies,
          );
          if (
            missing.length &&
            ["APPROVE", "BEGIN_POSTING", "CONFIRM_POSTED", "COMPLETE"].includes(
              dto.action,
            )
          )
            throw new ConflictException(
              `Step ${step.flowSerial} needs: ${missing.map(workflowStepReference).join(", ")}.`,
            );

          const rule =
            step.completionRule && typeof step.completionRule === "object"
              ? (step.completionRule as Record<string, unknown>)
              : {};
          const ruleKind = String(rule.kind ?? "DOMAIN_COMPLETION");
          if (
            ["BEGIN_POSTING", "CONFIRM_POSTED"].includes(dto.action) &&
            ruleKind !== "DOMAIN_POSTING"
          )
            throw new ConflictException(
              `Step ${step.flowSerial} is not a posting step.`,
            );
          if (
            dto.action === "COMPLETE" &&
            ruleKind === "DOMAIN_POSTING" &&
            step.status !== "POSTED"
          )
            throw new ConflictException(
              `Step ${step.flowSerial} must be confirmed through its idempotent posting action.`,
            );
          if (dto.action === "COMPLETE" && ruleKind === "APPROVAL")
            throw new ConflictException(
              `Step ${step.flowSerial} is an approval step and must go through SUBMIT then APPROVE.`,
            );
          if (
            step.sourceRecordType &&
            dto.sourceRecordType &&
            normalizedSourceType(step.sourceRecordType) !==
              normalizedSourceType(dto.sourceRecordType)
          )
            throw new ConflictException(
              "The persisted source type is already pinned to this workflow occurrence. Create a controlled amendment/new occurrence instead of replacing it.",
            );
          if (
            step.sourceRecordId &&
            dto.sourceRecordId?.trim() &&
            step.sourceRecordId !== dto.sourceRecordId.trim()
          )
            throw new ConflictException(
              "The persisted source record is already pinned to this workflow occurrence. Create a controlled amendment/new occurrence instead of replacing it.",
            );
          const sourceRecordType =
            dto.sourceRecordType?.trim() || step.sourceRecordType;
          const sourceRecordId =
            dto.sourceRecordId?.trim() || step.sourceRecordId;
          const approvingNotApplicable = Boolean(
            dto.action === "APPROVE" && step.naReason?.trim(),
          );
          const sourceRequired =
            dto.action === "SAVE_DRAFT" ||
            (["DOMAIN_COMPLETION", "DOMAIN_POSTING"].includes(ruleKind) &&
              ["BEGIN_POSTING", "CONFIRM_POSTED", "COMPLETE"].includes(
                dto.action,
              )) ||
            (ruleKind === "APPROVAL" &&
              ["SUBMIT", "APPROVE"].includes(dto.action) &&
              !approvingNotApplicable);
          if (sourceRequired && (!sourceRecordType || !sourceRecordId))
            throw new BadRequestException(
              "A persisted source record is required for this controlled workflow transition.",
            );
          const persistedSource = sourceRequired
            ? await this.assertPersistedSource(
                tx,
                run,
                step,
                sourceRecordType!,
                sourceRecordId!,
                dto.action === "CONFIRM_POSTED",
                dto.action,
              )
            : null;
          const normalizedLinkedSourceType = sourceRecordType
            ?.toUpperCase()
            .replace(/[^A-Z0-9]+/g, "_");
          if (
            normalizedLinkedSourceType === "MANUFACTURING_ORDER" &&
            sourceRecordId &&
            !run.productionOrderId
          ) {
            const linkedOrder = await tx.manufacturingOrder.findFirstOrThrow({
              where: { id: sourceRecordId, workspaceId: run.workspaceId },
              select: { id: true, planId: true, finishedProductId: true },
            });
            await tx.$executeRaw(Prisma.sql`
              UPDATE "ManufacturingRun"
              SET "productionOrderId" = ${linkedOrder.id},
                "productionPlanId" = COALESCE("productionPlanId", ${linkedOrder.planId}),
                "productId" = COALESCE("productId", ${linkedOrder.finishedProductId}),
                "updatedAt" = CURRENT_TIMESTAMP
              WHERE "id" = ${run.id} AND "workspaceId" = ${run.workspaceId}
            `);
            run.productionOrderId = linkedOrder.id;
            run.productionPlanId = run.productionPlanId ?? linkedOrder.planId;
            run.productId = run.productId ?? linkedOrder.finishedProductId;
          } else if (
            normalizedLinkedSourceType === "MANUFACTURING_PLAN" &&
            sourceRecordId &&
            !run.productionPlanId
          ) {
            await tx.$executeRaw(Prisma.sql`
              UPDATE "ManufacturingRun"
              SET "productionPlanId" = ${sourceRecordId},
                "updatedAt" = CURRENT_TIMESTAMP
              WHERE "id" = ${run.id} AND "workspaceId" = ${run.workspaceId}
            `);
            run.productionPlanId = sourceRecordId;
          }
          const settings = ["MARK_N_A", "APPROVE"].includes(dto.action)
            ? await tx.manufacturingSettings.findUnique({
                where: { workspaceId: scope.id },
                select: {
                  approvalRequired: true,
                  electronicSignatureRequired: true,
                },
              })
            : null;
          if (["MARK_N_A", "APPROVE"].includes(dto.action) && !settings)
            throw new PreconditionFailedException(
              "Manufacturing settings are required before this controlled approval action can continue.",
            );
          const naReason = dto.reason?.trim() || dto.reasonCode?.trim() || null;
          if (["HOLD", "REJECT", "FAIL"].includes(dto.action) && !naReason)
            throw new BadRequestException(
              `${dto.action} requires a reason or controlled reason code.`,
            );
          if (dto.action === "MARK_N_A") {
            if (!canManufacturingStepBeMarkedNotApplicable(step))
              throw new BadRequestException(
                "A step that can post inventory or ledger entries cannot be marked Not Applicable.",
              );
            if (!naReason)
              throw new BadRequestException(
                "A real reason is required before requesting Not Applicable approval.",
              );
          }
          if (
            approvingNotApplicable &&
            !canManufacturingStepBeMarkedNotApplicable(step)
          )
            throw new BadRequestException(
              "A step that can post inventory or ledger entries cannot be approved as Not Applicable.",
            );
          if (dto.action === "TRIGGER") {
            if (
              !["CONDITIONAL", "PERIODIC"].includes(step.applicabilityType) ||
              step.approvedBy
            )
              throw new BadRequestException(
                "Only an untriggered conditional or periodic step can be activated.",
              );
            if (!naReason)
              throw new BadRequestException(
                "A trigger reason or source-event reason code is required.",
              );
          }
          if (dto.action === "APPROVE") {
            const submitters = await tx.$queryRaw<
              Array<{ performedByUserId: string }>
            >(Prisma.sql`
              SELECT "performedByUserId" FROM "ManufacturingRunStepTransition"
              WHERE "runStepId" = ${step.id}
                AND "sourceAction" IN ('SUBMIT', 'MARK_N_A')
              ORDER BY "createdAt" DESC LIMIT 1
            `);
            if (
              settings?.approvalRequired &&
              submitters[0]?.performedByUserId === currentUser.id
            )
              throw new ForbiddenException(
                "Maker-checker control prevents approving your own workflow submission.",
              );
          }

          let target = TRANSITION_TARGET[dto.action];
          if (dto.action === "MARK_N_A" && !settings?.approvalRequired)
            target = "N_A";
          if (dto.action === "APPROVE" && step.naReason) target = "N_A";
          if (!target)
            throw new BadRequestException("Unknown workflow transition.");
          const now = new Date();
          const signedAction =
            dto.action === "APPROVE" ||
            (dto.action === "MARK_N_A" && !settings?.approvalRequired);
          const electronicSignatureEvidence = signedAction
            ? await this.electronicSignature.enforce(tx, {
                scope,
                user: currentUser,
                actionLabel: `${dto.action} step ${step.flowSerial}. ${step.title}`,
                signatureMeaning: dto.signatureMeaning,
                reauthenticationPassword: dto.reauthenticationPassword,
                required: Boolean(settings?.electronicSignatureRequired),
              })
            : null;
          const signatureReference = electronicSignatureEvidence
            ? createHash("sha256")
                .update(
                  [
                    scope.id,
                    run.workflowDefinitionId,
                    run.id,
                    step.id,
                    step.version,
                    sourceRecordType ?? "",
                    sourceRecordId ?? "",
                    currentUser.id,
                    dto.action,
                    target,
                    now.toISOString(),
                    dto.idempotencyKey,
                    dto.signatureMeaning?.trim() ?? "",
                    electronicSignatureEvidence.policyRecordId,
                    electronicSignatureEvidence.policyVersion,
                  ].join("|"),
                )
                .digest("hex")
            : null;
          if (dto.action === "CONFIRM_POSTED" && persistedSource) {
            await this.persistPostingLinks(
              tx,
              run,
              step,
              dto.idempotencyKey,
              sourceRecordType!,
              sourceRecordId!,
              persistedSource,
            );
          }
          const updateCount = await tx.$executeRaw(Prisma.sql`
            UPDATE "ManufacturingRunStep"
            SET
              "status" = ${target}::"ManufacturingWorkflowStepStatus",
              "applicable" = CASE
                WHEN ${target} = 'N_A' THEN false
                WHEN ${dto.action} = 'TRIGGER' THEN true
                ELSE "applicable" END,
              "blockerReason" = CASE
                WHEN ${dto.action} IN ('HOLD', 'REJECT', 'FAIL') THEN ${naReason}
                ELSE NULL END,
              "naReason" = CASE WHEN ${dto.action} = 'MARK_N_A'
                THEN ${naReason}
                WHEN ${dto.action} = 'TRIGGER' THEN NULL
                ELSE "naReason" END,
              "sourceRecordType" = COALESCE(${sourceRecordType ?? null}, "sourceRecordType"),
              "sourceRecordId" = COALESCE(${sourceRecordId ?? null}, "sourceRecordId"),
              "startedAt" = CASE WHEN ${target} = 'IN_PROGRESS' THEN COALESCE("startedAt", ${now}) ELSE "startedAt" END,
              "completedAt" = CASE WHEN ${target} IN ('COMPLETED', 'POSTED', 'N_A', 'CLOSED') THEN ${now} ELSE "completedAt" END,
              "completedBy" = CASE WHEN ${target} IN ('COMPLETED', 'POSTED', 'N_A', 'CLOSED') THEN ${currentUser.id} ELSE "completedBy" END,
              "approvedBy" = CASE WHEN ${dto.action} = 'APPROVE' THEN ${currentUser.id} ELSE "approvedBy" END,
              "signatureReference" = COALESCE(${signatureReference}, "signatureReference"),
              "version" = "version" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${step.id} AND "version" = ${step.version}
          `);
          if (updateCount !== 1)
            throw new ConflictException(
              "The workflow step changed concurrently. Refresh and retry.",
            );
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "ManufacturingRunStepTransition" (
              "id", "runStepId", "fromStatus", "toStatus", "sourceAction",
              "reason", "performedByUserId", "sourceRecordType",
              "sourceRecordId", "signatureReference", "idempotencyKey", "createdAt"
            ) VALUES (
              ${randomUUID()}, ${step.id},
              ${step.status}::"ManufacturingWorkflowStepStatus",
              ${target}::"ManufacturingWorkflowStepStatus", ${dto.action},
              ${naReason}, ${currentUser.id},
              ${sourceRecordType ?? null}, ${sourceRecordId ?? null},
              ${signatureReference}, ${dto.idempotencyKey}, CURRENT_TIMESTAMP
            )
          `);
          await tx.auditLog.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              userId: currentUser.id,
              action: `MANUFACTURING_RUN_STEP_${dto.action}`,
              entityType: "MANUFACTURING_RUN_STEP",
              entityId: step.id,
              oldValues: { status: step.status } as Prisma.InputJsonValue,
              newValues: {
                status: target,
                flowSerial: step.flowSerial,
                reason: naReason,
                reasonCode: dto.reasonCode ?? null,
                sourceRecordType: sourceRecordType ?? null,
                sourceRecordId: sourceRecordId ?? null,
                signatureReference,
                signatureMeaning: dto.signatureMeaning?.trim() ?? null,
                electronicSignaturePolicy: electronicSignatureEvidence,
                transitionEvidence: dto.evidence ?? null,
              } as Prisma.InputJsonValue,
            },
          });
          await this.refreshRun(tx, run, currentUser.id);
          const refreshed = await this.assertRunInScope(tx, runId, scope.id);
          return this.hydrateRun(tx, refreshed);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.workflowUnavailable(error);
    }
  }

  private async persistPostingLinks(
    db: Db,
    run: RunRow,
    step: RunStepRow,
    idempotencyKey: string,
    sourceRecordType: string,
    sourceRecordId: string,
    persistedSource: PersistedSourceLink,
  ) {
    const postingLinks = persistedSource.postingLinks ?? [
      {
        sourceDocumentType: sourceRecordType,
        sourceDocumentId: sourceRecordId,
        stockMovementId: persistedSource.stockMovementId,
        journalId: persistedSource.journalId,
      },
    ];
    for (const postingLink of postingLinks) {
      const postingIdempotencyKey =
        postingLinks.length === 1 && !persistedSource.postingLinks
          ? idempotencyKey
          : `${idempotencyKey}:${postingLink.sourceDocumentId}`;
      const linked = await db.$executeRaw(Prisma.sql`
        INSERT INTO "ManufacturingPostingLink" (
          "id", "tenantId", "companyId", "workspaceId", "runId",
          "sourceDocumentType", "sourceDocumentId", "postingType",
          "idempotencyKey", "stockMovementId", "journalId", "postedAt",
          "createdAt"
        ) VALUES (
          ${randomUUID()}, ${run.tenantId}, ${run.companyId}, ${run.workspaceId},
          ${run.id}, ${postingLink.sourceDocumentType},
          ${postingLink.sourceDocumentId},
          ${`WORKFLOW_STEP_${step.flowSerial}`}, ${postingIdempotencyKey},
          ${postingLink.stockMovementId}, ${postingLink.journalId},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (
          "workspaceId", "sourceDocumentType", "sourceDocumentId", "postingType"
        ) DO UPDATE SET "id" = "ManufacturingPostingLink"."id"
        WHERE "ManufacturingPostingLink"."tenantId" = EXCLUDED."tenantId"
          AND "ManufacturingPostingLink"."companyId" = EXCLUDED."companyId"
          AND "ManufacturingPostingLink"."runId" IS NOT DISTINCT FROM EXCLUDED."runId"
          AND "ManufacturingPostingLink"."stockMovementId" IS NOT DISTINCT FROM EXCLUDED."stockMovementId"
          AND "ManufacturingPostingLink"."journalId" IS NOT DISTINCT FROM EXCLUDED."journalId"
          AND "ManufacturingPostingLink"."reversedById" IS NULL
      `);
      if (linked !== 1)
        throw new ConflictException(
          `Step ${step.flowSerial} source ${postingLink.sourceDocumentId} is already linked to different or reversed posting evidence.`,
        );
    }
  }

  private assertExactPostingVoucher(
    run: RunRow,
    step: RunStepRow,
    transaction: AggregateTransaction,
    debitAccountId: string | null | undefined,
    creditAccountId: string | null | undefined,
    expectedAmount: Prisma.Decimal.Value,
  ) {
    this.assertSourceVoucher(
      run,
      step,
      transaction.voucherEntry,
      transaction.voucherEntryId,
      transaction.transactionType,
      `MANUFACTURING_${transaction.transactionType}`,
      transaction.id,
      expectedAmount,
      debitAccountId,
      creditAccountId,
      2,
    );
  }

  private assertSourceVoucher(
    run: RunRow,
    step: RunStepRow,
    voucher: PostingVoucher | null,
    voucherEntryId: string | null,
    documentKind: string,
    sourceType: string,
    sourceId: string,
    expectedAmount: Prisma.Decimal.Value | null,
    debitAccountId?: string | null,
    creditAccountId?: string | null,
    exactLineCount?: number,
  ) {
    if (
      (debitAccountId && !creditAccountId) ||
      (!debitAccountId && creditAccountId) ||
      (debitAccountId && debitAccountId === creditAccountId)
    )
      throw new ConflictException(
        `Step ${step.flowSerial} cannot reconcile because its manufacturing ledger mapping is incomplete or invalid.`,
      );
    const debit = (voucher?.lines ?? []).reduce(
      (total, line) => total.add(line.debit),
      decimalValue(0),
    );
    const credit = (voucher?.lines ?? []).reduce(
      (total, line) => total.add(line.credit),
      decimalValue(0),
    );
    const exactDebit =
      !debitAccountId ||
      voucher?.lines?.some(
        (line) =>
          line.accountId === debitAccountId &&
          expectedAmount !== null &&
          moneyEquals(line.debit, expectedAmount) &&
          moneyEquals(line.credit, 0),
      );
    const exactCredit =
      !creditAccountId ||
      voucher?.lines?.some(
        (line) =>
          line.accountId === creditAccountId &&
          expectedAmount !== null &&
          moneyEquals(line.debit, 0) &&
          moneyEquals(line.credit, expectedAmount),
      );
    if (
      !voucher ||
      voucherEntryId !== voucher.id ||
      voucher.workspaceId !== run.workspaceId ||
      voucher.companyId !== run.companyId ||
      voucher.voucherType !== "JOURNAL" ||
      voucher.documentKind !== documentKind ||
      voucher.sourceType !== sourceType ||
      voucher.sourceId !== sourceId ||
      voucher.status !== "POSTED" ||
      voucher.lines.length < 2 ||
      (exactLineCount !== undefined &&
        voucher.lines.length !== exactLineCount) ||
      !moneyEquals(debit, credit) ||
      !moneyEquals(debit, voucher.debit) ||
      !moneyEquals(credit, voucher.credit) ||
      !moneyEquals(voucher.totalAmount, voucher.debit) ||
      (expectedAmount !== null &&
        (!moneyEquals(voucher.totalAmount, expectedAmount) ||
          !moneyEquals(voucher.debit, expectedAmount) ||
          !moneyEquals(voucher.credit, expectedAmount))) ||
      !exactDebit ||
      !exactCredit
    ) {
      throw new ConflictException(
        `Step ${step.flowSerial} source ${sourceId} is missing its exact workspace-scoped, source-linked and balanced posting voucher.`,
      );
    }
  }

  private exactTransferPair(
    step: RunStepRow,
    transaction: AggregateTransaction,
    line: AggregateTransactionLine,
  ) {
    const movements = line.stockMovements ?? [];
    const outgoing = movements.filter(
      (movement) =>
        movement.movementType === "OUT" &&
        movement.warehouseId === transaction.fromWarehouseId &&
        movement.inventoryItemId === line.inventoryItemId &&
        movement.transactionType === "STOCK_TRANSFER_OUT" &&
        movement.transactionId === transaction.id &&
        movement.transactionLineId === line.id &&
        decimalValue(movement.quantity).equals(line.quantity),
    );
    const incoming = movements.filter(
      (movement) =>
        movement.movementType === "IN" &&
        movement.warehouseId === transaction.toWarehouseId &&
        movement.inventoryItemId === line.inventoryItemId &&
        movement.transactionType === "STOCK_TRANSFER_IN" &&
        movement.transactionId === transaction.id &&
        movement.transactionLineId === line.id &&
        decimalValue(movement.quantity).equals(line.quantity),
    );
    if (
      movements.length !== 2 ||
      outgoing.length !== 1 ||
      incoming.length !== 1 ||
      !moneyEquals(outgoing[0].movementValue, incoming[0].movementValue)
    ) {
      throw new ConflictException(
        `Step ${step.flowSerial} transaction ${transaction.id} does not have one exact, non-void source OUT and destination IN stock pair.`,
      );
    }
    return { outgoing: outgoing[0], incoming: incoming[0] };
  }

  private async assertSingleTransactionPosting(
    db: Db,
    run: RunRow,
    step: RunStepRow,
    transaction: AggregateTransaction,
  ): Promise<PersistedSourceLink> {
    if (
      transaction.workspaceId !== run.workspaceId ||
      transaction.companyId !== run.companyId ||
      transaction.orderId !== run.productionOrderId ||
      transaction.status !== "POSTED"
    )
      throw new ConflictException(
        `Step ${step.flowSerial} transaction is not an authoritative posted source for the bound order.`,
      );

    if ([67, 86, 89].includes(step.flowSerial)) {
      if (transaction.voucherEntryId || transaction.voucherEntry)
        throw new ConflictException(
          `Step ${step.flowSerial} location transfer must not create a general-ledger voucher.`,
        );
      if (
        !transaction.lines.length ||
        !transaction.fromWarehouseId ||
        !transaction.toWarehouseId ||
        !transaction.fromLocationId ||
        !transaction.toLocationId ||
        transaction.fromLocationId === transaction.toLocationId
      )
        throw new ConflictException(
          `Step ${step.flowSerial} requires a real source-to-destination location transfer.`,
        );
      let canonicalMovementId: string | null = null;
      for (const line of transaction.lines) {
        if (
          !line.sourceInventoryLotId ||
          !line.destinationInventoryLotId ||
          decimalValue(line.quantity).lessThanOrEqualTo(0)
        )
          throw new ConflictException(
            `Step ${step.flowSerial} transfer line is missing its lot genealogy or quantity.`,
          );
        if (transaction.fromWarehouseId === transaction.toWarehouseId) {
          if (line.stockMovements.length)
            throw new ConflictException(
              `Step ${step.flowSerial} same-warehouse location transfer must not invent stock-ledger movement.`,
            );
        } else {
          const pair = this.exactTransferPair(step, transaction, line);
          canonicalMovementId ??= pair.incoming.id;
        }
      }
      if (step.flowSerial === 67) {
        const order = await db.manufacturingOrder.findFirst({
          where: { id: run.productionOrderId!, workspaceId: run.workspaceId },
          select: {
            issueWarehouseId: true,
            materials: {
              where: { status: { not: "CANCELLED" } },
              select: { id: true, inventoryItemId: true },
            },
          },
        });
        const materials = new Map(
          order?.materials.map((material) => [material.id, material]) ?? [],
        );
        if (
          !order ||
          transaction.fromWarehouseId !== order.issueWarehouseId ||
          transaction.toWarehouseId !== order.issueWarehouseId ||
          transaction.lines.some((line) => {
            const material = line.orderMaterialId
              ? materials.get(line.orderMaterialId)
              : null;
            return (
              !material || material.inventoryItemId !== line.inventoryItemId
            );
          })
        )
          throw new ConflictException(
            "Step 67 staging must remain inside the bound order's issue warehouse and use its exact material lines.",
          );
      } else {
        const workflowCode =
          step.flowSerial === 86 ? "WIP_TRANSFER" : "BULK_PRODUCT_TRANSFER";
        const review = await db.manufacturingWorkflowReview.findFirst({
          where: {
            workspaceId: run.workspaceId,
            orderId: run.productionOrderId,
            workflowGroup: "PRODUCTION_EXECUTION",
            workflowCode,
            entityType: "ManufacturingTransaction",
            entityId: transaction.id,
            status: "APPROVED",
            outcome: "EXECUTED",
          },
          select: { id: true },
        });
        if (!review)
          throw new ConflictException(
            `Step ${step.flowSerial} transaction is missing its approved ${workflowCode} route evidence.`,
          );
      }
      return { stockMovementId: canonicalMovementId, journalId: null };
    }

    if (step.flowSerial === 72 || step.flowSerial === 74) {
      const isReturn = step.flowSerial === 74;
      const [order, settings] = await Promise.all([
        db.manufacturingOrder.findFirst({
          where: { id: run.productionOrderId!, workspaceId: run.workspaceId },
          select: {
            issueWarehouseId: true,
            issueLocationId: true,
            materials: {
              where: { status: { not: "CANCELLED" } },
              select: {
                id: true,
                inventoryItemId: true,
                inventoryItem: {
                  select: {
                    manufacturingProfile: { select: { lotTracked: true } },
                  },
                },
              },
            },
          },
        }),
        db.manufacturingSettings.findUnique({
          where: { workspaceId: run.workspaceId },
          select: {
            defaultWipWarehouseId: true,
            defaultWipLocationId: true,
            rawMaterialInventoryAccountId: true,
            wipInventoryAccountId: true,
          },
        }),
      ]);
      if (!order || !settings)
        throw new PreconditionFailedException(
          `Step ${step.flowSerial} requires its bound order and manufacturing settings.`,
        );
      if (
        !transaction.lines.length ||
        transaction.fromWarehouseId !==
          (isReturn
            ? settings.defaultWipWarehouseId
            : order.issueWarehouseId) ||
        transaction.toWarehouseId !==
          (isReturn
            ? order.issueWarehouseId
            : settings.defaultWipWarehouseId) ||
        (order.issueLocationId &&
          (isReturn
            ? transaction.toLocationId !== order.issueLocationId
            : transaction.fromLocationId !== order.issueLocationId)) ||
        (settings.defaultWipLocationId &&
          (isReturn
            ? transaction.fromLocationId !== settings.defaultWipLocationId
            : transaction.toLocationId !== settings.defaultWipLocationId))
      )
        throw new ConflictException(
          `Step ${step.flowSerial} is not the configured ${isReturn ? "WIP-to-issue" : "issue-to-WIP"} transfer.`,
        );
      const materialById = new Map(
        order.materials.map((material) => [material.id, material]),
      );
      let voucherAmount = decimalValue(0);
      let canonicalMovementId: string | null = null;
      for (const line of transaction.lines) {
        const material = line.orderMaterialId
          ? materialById.get(line.orderMaterialId)
          : null;
        if (
          !material ||
          material.inventoryItemId !== line.inventoryItemId ||
          (material.inventoryItem.manufacturingProfile?.lotTracked &&
            !(isReturn
              ? line.destinationInventoryLotId
              : line.sourceInventoryLotId))
        )
          throw new ConflictException(
            `Step ${step.flowSerial} line is not bound to an eligible order material/lot.`,
          );
        const pair = this.exactTransferPair(step, transaction, line);
        voucherAmount = voucherAmount.add(pair.outgoing.movementValue);
        canonicalMovementId ??= pair.incoming.id;
      }
      this.assertExactPostingVoucher(
        run,
        step,
        transaction,
        isReturn
          ? settings.rawMaterialInventoryAccountId
          : settings.wipInventoryAccountId,
        isReturn
          ? settings.wipInventoryAccountId
          : settings.rawMaterialInventoryAccountId,
        voucherAmount,
      );
      return {
        stockMovementId: canonicalMovementId,
        journalId: transaction.voucherEntryId,
      };
    }

    if (step.flowSerial === 91) {
      const settings = await db.manufacturingSettings.findUnique({
        where: { workspaceId: run.workspaceId },
        select: {
          defaultWipWarehouseId: true,
          defaultWipLocationId: true,
          defaultScrapWarehouseId: true,
          scrapRecoveryAccountId: true,
          wipInventoryAccountId: true,
        },
      });
      const line = transaction.lines[0];
      const movement = line?.stockMovements[0];
      if (
        !settings ||
        transaction.lines.length !== 1 ||
        !line ||
        line.stockMovements.length !== 1 ||
        !movement ||
        transaction.fromWarehouseId !== settings.defaultWipWarehouseId ||
        transaction.toWarehouseId !== settings.defaultScrapWarehouseId ||
        (settings.defaultWipLocationId &&
          transaction.fromLocationId !== settings.defaultWipLocationId) ||
        movement.movementType !== "IN" ||
        movement.transactionType !== "SCRAP_RECEIPT" ||
        movement.transactionId !== transaction.id ||
        movement.transactionLineId !== line.id ||
        movement.warehouseId !== transaction.toWarehouseId ||
        movement.inventoryItemId !== line.inventoryItemId ||
        !decimalValue(movement.quantity).equals(line.quantity) ||
        !line.destinationInventoryLotId
      )
        throw new ConflictException(
          "Step 91 requires one exact posted scrap-lot receipt into the configured scrap warehouse.",
        );
      this.assertExactPostingVoucher(
        run,
        step,
        transaction,
        settings.scrapRecoveryAccountId,
        settings.wipInventoryAccountId,
        movement.movementValue,
      );
      return {
        stockMovementId: movement.id,
        journalId: transaction.voucherEntryId,
      };
    }

    throw new ConflictException(
      `Step ${step.flowSerial} does not have a fail-closed transaction posting validator.`,
    );
  }

  private async assertAggregateOrderPosting(
    db: Db,
    run: RunRow,
    step: RunStepRow,
    sourceId: string,
  ): Promise<PersistedSourceLink> {
    if (!run.productionOrderId)
      throw new ConflictException(
        `Step ${step.flowSerial} requires the manufacturing run to be bound to one production order before posting reconciliation.`,
      );
    const expectedTypes = POSTING_TRANSACTION_TYPE_BY_STEP.get(step.flowSerial);
    const expectedType = expectedTypes?.[0];
    if (!expectedType)
      throw new BadRequestException(
        `Step ${step.flowSerial} has no controlled manufacturing transaction mapping.`,
      );
    const relatedTypes: ManufacturingTransactionType[] =
      step.flowSerial === 70
        ? [
            ManufacturingTransactionType.MATERIAL_ISSUE,
            ManufacturingTransactionType.MATERIAL_RETURN,
          ]
        : step.flowSerial === 113
          ? [
              ManufacturingTransactionType.PACKAGING_ISSUE,
              ManufacturingTransactionType.PACKAGING_RETURN,
            ]
          : step.flowSerial === 126
            ? [
                ManufacturingTransactionType.PRODUCTION_RECEIPT,
                ManufacturingTransactionType.QA_RELEASE,
              ]
            : [expectedType];
    const order = await db.manufacturingOrder.findFirst({
      where: {
        id: run.productionOrderId,
        workspaceId: run.workspaceId,
      },
      select: {
        id: true,
        issueWarehouseId: true,
        issueLocationId: true,
        plannedQuantity: true,
        completedQuantity: true,
        finishedProductId: true,
        finishedProduct: {
          select: {
            manufacturingProfile: { select: { serialTracked: true } },
          },
        },
        lots: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            lotNumber: true,
            plannedQuantity: true,
            completedQuantity: true,
          },
        },
        materials: {
          select: {
            id: true,
            inventoryItemId: true,
            status: true,
            plannedQuantity: true,
            inventoryItem: {
              select: {
                manufacturingProfile: {
                  select: { role: true, lotTracked: true },
                },
              },
            },
          },
        },
        packagingOrders: {
          where: { status: { not: "CANCELLED" } },
          select: {
            orderLotId: true,
            plannedQuantity: true,
            packagingConfiguration: {
              select: {
                lines: { select: { inventoryItemId: true, quantity: true } },
              },
            },
          },
        },
      },
    });
    if (!order)
      throw new BadRequestException(
        "The manufacturing run's production order is no longer available in its workspace.",
      );
    const settings = await db.manufacturingSettings.findUnique({
      where: { workspaceId: run.workspaceId },
      select: {
        defaultWipWarehouseId: true,
        defaultWipLocationId: true,
        defaultFinishedGoodsWarehouseId: true,
        defaultFinishedGoodsReleasedWarehouseId: true,
        defaultFinishedGoodsHoldLocationId: true,
        defaultFinishedGoodsReleaseLocationId: true,
        rawMaterialInventoryAccountId: true,
        packagingInventoryAccountId: true,
        wipInventoryAccountId: true,
        finishedGoodsInventoryAccountId: true,
        requireSerialBeforeRelease: true,
      },
    });
    if (!settings)
      throw new PreconditionFailedException(
        "Manufacturing settings are required for posting reconciliation.",
      );
    const transactions = await db.manufacturingTransaction.findMany({
      where: {
        workspaceId: run.workspaceId,
        orderId: run.productionOrderId,
        status: "POSTED",
        reversalOfId: null,
        transactionType: { in: relatedTypes },
      },
      select: AGGREGATE_TRANSACTION_SELECT,
      orderBy: [
        { transactionDate: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
    });
    const authoritative = transactions.filter(
      (transaction) => transaction.transactionType === expectedType,
    );
    const source = authoritative.find(
      (transaction) => transaction.id === sourceId,
    );
    if (!source)
      throw new BadRequestException(
        `Step ${step.flowSerial} source must be a POSTED ${expectedType} transaction belonging to this run's bound production order.`,
      );
    if (!authoritative.length)
      throw new ConflictException(
        `Step ${step.flowSerial} has no authoritative posted transactions to reconcile.`,
      );

    const materialRole = (material: (typeof order.materials)[number]) =>
      material.inventoryItem.manufacturingProfile?.role ?? "RAW_MATERIAL";
    const quantityFor = (
      transactionType: ManufacturingTransactionType,
      orderLotId: string,
      inventoryItemId: string,
    ) =>
      transactions
        .filter(
          (transaction) =>
            transaction.transactionType === transactionType &&
            transaction.orderLotId === orderLotId,
        )
        .flatMap((transaction) => transaction.lines)
        .filter((line) => line.inventoryItemId === inventoryItemId)
        .reduce((total, line) => total.add(line.quantity), decimalValue(0));
    const postingLinks = (
      rows: AggregateTransaction[],
      movement: (row: AggregateTransaction) => string | null,
    ) =>
      rows.map((transaction) => ({
        sourceDocumentType: "MANUFACTURING_TRANSACTION",
        sourceDocumentId: transaction.id,
        stockMovementId: movement(transaction),
        journalId: transaction.voucherEntryId,
      }));

    if (step.flowSerial === 70 || step.flowSerial === 113) {
      const issueType = expectedType;
      const returnType =
        step.flowSerial === 70
          ? ManufacturingTransactionType.MATERIAL_RETURN
          : ManufacturingTransactionType.PACKAGING_RETURN;
      const eligibleMaterials = order.materials.filter(
        (material) =>
          material.status !== "CANCELLED" &&
          (step.flowSerial === 70
            ? materialRole(material) !== "PACKAGING_MATERIAL"
            : materialRole(material) === "PACKAGING_MATERIAL"),
      );
      const eligibleMaterialById = new Map(
        eligibleMaterials.map((material) => [material.id, material]),
      );
      const expected = new Map<string, Prisma.Decimal>();
      for (const lot of order.lots) {
        if (step.flowSerial === 70) {
          for (const inventoryItemId of new Set(
            eligibleMaterials.map((material) => material.inventoryItemId),
          )) {
            expected.set(
              `${lot.id}:${inventoryItemId}`,
              totalActivePlannedMaterialQuantity(
                eligibleMaterials,
                inventoryItemId,
              )
                .mul(lot.plannedQuantity)
                .div(order.plannedQuantity)
                .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
            );
          }
        } else {
          for (const packagingOrder of order.packagingOrders) {
            if (
              packagingOrder.orderLotId &&
              packagingOrder.orderLotId !== lot.id
            )
              continue;
            for (const line of packagingOrder.packagingConfiguration.lines) {
              const key = `${lot.id}:${line.inventoryItemId}`;
              const requirement = packagingOrder.orderLotId
                ? decimalValue(line.quantity)
                    .mul(packagingOrder.plannedQuantity)
                    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
                : calculateOrderLevelPackagingLotRequirement({
                    componentQuantityPerFinishedUnit: line.quantity,
                    packagingPlannedQuantity: packagingOrder.plannedQuantity,
                    orderPlannedQuantity: order.plannedQuantity,
                    lots: order.lots,
                    orderLotId: lot.id,
                  });
              expected.set(
                key,
                (expected.get(key) ?? decimalValue(0)).add(requirement),
              );
            }
          }
        }
      }
      if (!expected.size)
        throw new ConflictException(
          `Step ${step.flowSerial} has no real order/lot material requirement to reconcile.`,
        );
      const returnTransactions = transactions.filter(
        (transaction) => transaction.transactionType === returnType,
      );
      for (const transaction of [...authoritative, ...returnTransactions]) {
        const isReturn = transaction.transactionType === returnType;
        if (
          !transaction.orderLotId ||
          !order.lots.some((lot) => lot.id === transaction.orderLotId)
        )
          throw new ConflictException(
            `Step ${step.flowSerial} transaction ${transaction.id} is not linked to a production lot on the bound order.`,
          );
        if (
          !transaction.lines.length ||
          transaction.fromWarehouseId !==
            (isReturn
              ? settings.defaultWipWarehouseId
              : order.issueWarehouseId) ||
          transaction.toWarehouseId !==
            (isReturn
              ? order.issueWarehouseId
              : settings.defaultWipWarehouseId) ||
          (order.issueLocationId &&
            (isReturn
              ? transaction.toLocationId !== order.issueLocationId
              : transaction.fromLocationId !== order.issueLocationId)) ||
          (settings.defaultWipLocationId &&
            (isReturn
              ? transaction.fromLocationId !== settings.defaultWipLocationId
              : transaction.toLocationId !== settings.defaultWipLocationId))
        )
          throw new ConflictException(
            `Step ${step.flowSerial} transaction ${transaction.id} is not the configured ${isReturn ? "WIP-to-issue" : "issue-to-WIP"} warehouse/location transfer for the bound order.`,
          );
        let voucherAmount = decimalValue(0);
        for (const line of transaction.lines) {
          const key = `${transaction.orderLotId}:${line.inventoryItemId}`;
          const material = line.orderMaterialId
            ? eligibleMaterialById.get(line.orderMaterialId)
            : null;
          if (
            !expected.has(key) ||
            !material ||
            material.inventoryItemId !== line.inventoryItemId
          )
            throw new ConflictException(
              `Step ${step.flowSerial} transaction ${transaction.id} contains an item or order-material link outside the bound order/lot requirement.`,
            );
          if (
            material.inventoryItem.manufacturingProfile?.lotTracked &&
            !(isReturn
              ? line.destinationInventoryLotId
              : line.sourceInventoryLotId)
          )
            throw new ConflictException(
              `Step ${step.flowSerial} transaction ${transaction.id} is missing its required ${isReturn ? "destination" : "source"}-lot link.`,
            );
          const pair = this.exactTransferPair(step, transaction, line);
          voucherAmount = voucherAmount.add(pair.outgoing.movementValue);
        }
        this.assertExactPostingVoucher(
          run,
          step,
          transaction,
          isReturn
            ? step.flowSerial === 70
              ? settings.rawMaterialInventoryAccountId
              : settings.packagingInventoryAccountId
            : settings.wipInventoryAccountId,
          isReturn
            ? settings.wipInventoryAccountId
            : step.flowSerial === 70
              ? settings.rawMaterialInventoryAccountId
              : settings.packagingInventoryAccountId,
          voucherAmount,
        );
      }
      for (const [key, required] of expected) {
        const [orderLotId, inventoryItemId] = key.split(":");
        const net = quantityFor(issueType, orderLotId, inventoryItemId).sub(
          quantityFor(returnType, orderLotId, inventoryItemId),
        );
        if (!net.equals(required))
          throw new ConflictException(
            `Step ${step.flowSerial} cannot complete until every bound order lot is exactly issued; ${key} requires ${required.toString()} and has ${net.toString()}.`,
          );
      }
      const links = postingLinks(authoritative, (transaction) => {
        const movements = transaction.lines.flatMap(
          (line) => line.stockMovements,
        );
        return (
          movements.find(
            (movement) =>
              movement.movementType === "IN" &&
              movement.warehouseId === transaction.toWarehouseId,
          )?.id ?? null
        );
      });
      const primary = links.find((link) => link.sourceDocumentId === sourceId)!;
      return { ...primary, postingLinks: links };
    }

    const receiptTransactions = transactions.filter(
      (transaction) =>
        transaction.transactionType ===
        ManufacturingTransactionType.PRODUCTION_RECEIPT,
    );
    const expectedReceiptLots = order.lots.filter((lot) =>
      decimalValue(lot.completedQuantity).greaterThan(0),
    );
    type ReceiptEvidence = {
      transaction: AggregateTransaction;
      output: AggregateTransactionLine;
      lot: (typeof order.lots)[number];
    };
    const receiptByLot = new Map<string, ReceiptEvidence>();
    const orderMaterialById = new Map(
      order.materials
        .filter((material) => material.status !== "CANCELLED")
        .map((material) => [material.id, material]),
    );
    let receiptTotal = decimalValue(0);
    const receiptCanonicalMovement = new Map<string, string>();
    for (const transaction of receiptTransactions) {
      if (!transaction.orderLotId || receiptByLot.has(transaction.orderLotId))
        throw new ConflictException(
          "Finished-goods reconciliation requires exactly one posted receipt per completed production lot.",
        );
      const lot = expectedReceiptLots.find(
        (candidate) => candidate.id === transaction.orderLotId,
      );
      const outputLines = transaction.lines.filter(
        (line) =>
          !line.orderMaterialId &&
          line.inventoryItemId === order.finishedProductId,
      );
      if (!lot || outputLines.length !== 1)
        throw new ConflictException(
          `Production receipt ${transaction.id} is not an exact output for one completed lot on the bound order.`,
        );
      const output = outputLines[0];
      if (
        !decimalValue(output.quantity).equals(lot.completedQuantity) ||
        transaction.fromWarehouseId !== settings.defaultWipWarehouseId ||
        transaction.toWarehouseId !==
          settings.defaultFinishedGoodsWarehouseId ||
        (settings.defaultWipLocationId &&
          transaction.fromLocationId !== settings.defaultWipLocationId) ||
        (settings.defaultFinishedGoodsHoldLocationId &&
          transaction.toLocationId !==
            settings.defaultFinishedGoodsHoldLocationId) ||
        !output.destinationInventoryLotId ||
        output.destinationInventoryLot?.id !== output.destinationInventoryLotId
      )
        throw new ConflictException(
          `Production receipt ${transaction.id} does not represent the full lot receipt into configured FG-Q.`,
        );
      const outputMovements = output.stockMovements.filter(
        (movement) =>
          movement.movementType === "IN" &&
          movement.warehouseId === settings.defaultFinishedGoodsWarehouseId &&
          movement.inventoryItemId === order.finishedProductId &&
          movement.transactionType === "PRODUCTION_RECEIPT" &&
          movement.transactionId === transaction.id &&
          movement.transactionLineId === output.id &&
          decimalValue(movement.quantity).equals(output.quantity),
      );
      if (output.stockMovements.length !== 1 || outputMovements.length !== 1)
        throw new ConflictException(
          `Production receipt ${transaction.id} is missing its exact, non-void FG-Q receipt movement.`,
        );
      const inputMovements = transaction.lines
        .filter((line) => line.orderMaterialId)
        .flatMap((line) =>
          line.stockMovements.filter(
            (movement) =>
              movement.movementType === "OUT" &&
              movement.warehouseId === settings.defaultWipWarehouseId &&
              movement.inventoryItemId === line.inventoryItemId &&
              movement.transactionType === "PRODUCTION_RECEIPT_INPUT" &&
              movement.transactionId === transaction.id &&
              movement.transactionLineId === line.id &&
              decimalValue(movement.quantity).equals(line.quantity),
          ),
        );
      const expectedInputLines = transaction.lines.filter(
        (line) => line.orderMaterialId,
      );
      if (
        !expectedInputLines.length ||
        inputMovements.length !== expectedInputLines.length ||
        expectedInputLines.some((line) => {
          const material = line.orderMaterialId
            ? orderMaterialById.get(line.orderMaterialId)
            : null;
          return (
            !material ||
            material.inventoryItemId !== line.inventoryItemId ||
            line.stockMovements.length !== 1
          );
        })
      )
        throw new ConflictException(
          `Production receipt ${transaction.id} does not have exact, non-void WIP consumption movements.`,
        );
      const inputValue = inputMovements.reduce(
        (total, movement) => total.add(movement.movementValue),
        decimalValue(0),
      );
      if (!moneyEquals(inputValue, outputMovements[0].movementValue))
        throw new ConflictException(
          `Production receipt ${transaction.id} does not reconcile WIP value to FG-Q.`,
        );
      this.assertExactPostingVoucher(
        run,
        step,
        transaction,
        settings.finishedGoodsInventoryAccountId,
        settings.wipInventoryAccountId,
        outputMovements[0].movementValue,
      );
      receiptByLot.set(transaction.orderLotId, { transaction, output, lot });
      receiptCanonicalMovement.set(transaction.id, outputMovements[0].id);
      receiptTotal = receiptTotal.add(output.quantity);
    }
    if (
      receiptByLot.size !== expectedReceiptLots.length ||
      !receiptTotal.equals(order.completedQuantity)
    )
      throw new ConflictException(
        "Step 121 cannot complete until every completed production lot has one exact posted FG-Q receipt and the aggregate equals the order completed quantity.",
      );

    if (step.flowSerial === 121) {
      const links = postingLinks(
        receiptTransactions,
        (transaction) => receiptCanonicalMovement.get(transaction.id) ?? null,
      );
      const primary = links.find((link) => link.sourceDocumentId === sourceId)!;
      return { ...primary, postingLinks: links };
    }

    const releaseTransactions = authoritative;
    const releaseByLot = new Map<string, AggregateTransaction>();
    let releaseTotal = decimalValue(0);
    const releaseCanonicalMovement = new Map<string, string>();
    const serialTrackingRequired = Boolean(
      settings.requireSerialBeforeRelease ||
      order.finishedProduct.manufacturingProfile?.serialTracked,
    );
    for (const transaction of releaseTransactions) {
      const orderLotId = transaction.orderLotId;
      const receipt = orderLotId ? receiptByLot.get(orderLotId) : null;
      if (!orderLotId || !receipt || releaseByLot.has(orderLotId))
        throw new ConflictException(
          "QA release reconciliation requires exactly one posted full-lot release per received production lot.",
        );
      if (
        transaction.voucherEntryId ||
        transaction.voucherEntry ||
        transaction.fromWarehouseId !==
          settings.defaultFinishedGoodsWarehouseId ||
        transaction.toWarehouseId !==
          settings.defaultFinishedGoodsReleasedWarehouseId ||
        (settings.defaultFinishedGoodsReleaseLocationId &&
          transaction.toLocationId !==
            settings.defaultFinishedGoodsReleaseLocationId) ||
        transaction.lines.length !== 1
      )
        throw new ConflictException(
          `QA release ${transaction.id} is not the configured no-GL FG-Q to FG-R transfer.`,
        );
      const line = transaction.lines[0];
      if (
        line.inventoryItemId !== order.finishedProductId ||
        line.sourceInventoryLotId !==
          receipt.output.destinationInventoryLotId ||
        line.destinationInventoryLotId !== line.sourceInventoryLotId ||
        !decimalValue(line.quantity).equals(receipt.output.quantity)
      )
        throw new ConflictException(
          `QA release ${transaction.id} is not linked to the exact received finished-goods lot and quantity.`,
        );
      const pair = this.exactTransferPair(step, transaction, line);
      if (
        line.sourceInventoryLot?.warehouseId !==
          settings.defaultFinishedGoodsReleasedWarehouseId ||
        (settings.defaultFinishedGoodsReleaseLocationId &&
          line.sourceInventoryLot.locationId !==
            settings.defaultFinishedGoodsReleaseLocationId)
      )
        throw new ConflictException(
          `QA release ${transaction.id} finished-goods lot is not currently in configured FG-R.`,
        );
      if (serialTrackingRequired) {
        const serials = line.sourceInventoryLot.serials ?? [];
        const wholeQuantity = decimalValue(line.quantity);
        if (
          !wholeQuantity.isInteger() ||
          serials.length !== Number(wholeQuantity.toFixed(0)) ||
          serials.some((serial) => serial.status !== "RELEASED") ||
          line.serialMovements.length !== serials.length ||
          line.serialMovements.some(
            (movement) =>
              movement.role !== "OUTPUT" ||
              !serials.some((serial) => serial.id === movement.serialId),
          )
        )
          throw new ConflictException(
            `QA release ${transaction.id} does not reconcile every required serial to RELEASED FG-R state.`,
          );
      }
      releaseByLot.set(orderLotId, transaction);
      releaseCanonicalMovement.set(transaction.id, pair.incoming.id);
      releaseTotal = releaseTotal.add(line.quantity);
    }
    if (
      releaseByLot.size !== receiptByLot.size ||
      !releaseTotal.equals(receiptTotal) ||
      !releaseTotal.equals(order.completedQuantity)
    )
      throw new ConflictException(
        "Step 126 cannot complete until every FG-Q receipt lot has one full no-GL release to FG-R and the aggregate equals the order completed quantity.",
      );
    const links = postingLinks(
      releaseTransactions,
      (transaction) => releaseCanonicalMovement.get(transaction.id) ?? null,
    ).map((link) => ({ ...link, journalId: null }));
    const primary = links.find((link) => link.sourceDocumentId === sourceId)!;
    return { ...primary, postingLinks: links };
  }

  private assertOrderWorkflowCompatibility(
    run: Pick<RunRow, "manufacturingMode">,
    step: Pick<RunStepRow, "flowSerial">,
    orderType: ManufacturingOrderType,
  ) {
    const expectedOrderType = PRIMARY_ORDER_TYPE_BY_STEP.get(step.flowSerial);
    if (expectedOrderType && orderType !== expectedOrderType)
      throw new BadRequestException(
        `Step ${step.flowSerial} requires a ${expectedOrderType} production order; received ${orderType}.`,
      );
    if (
      (orderType === ManufacturingOrderType.ASSEMBLY &&
        run.manufacturingMode === "PHARMACEUTICAL") ||
      (orderType === ManufacturingOrderType.PHARMACEUTICAL &&
        run.manufacturingMode === "GENERAL")
    )
      throw new BadRequestException(
        `Production order type ${orderType} is incompatible with ${run.manufacturingMode} manufacturing mode.`,
      );
  }

  private async assertMaterialControlPosting(
    db: Db,
    run: RunRow,
    step: RunStepRow,
    sourceId: string,
  ): Promise<PersistedSourceLink> {
    const review = await db.manufacturingWorkflowReview.findFirst({
      where: {
        id: sourceId,
        workspaceId: run.workspaceId,
        orderId: run.productionOrderId,
        workflowGroup: "MATERIALS_DISPENSING",
        workflowCode: "MATERIAL_CONTROL_APPROVE",
        entityType: "MATERIAL_CONTROL_REQUEST",
        status: "APPROVED",
        outcome: "EXECUTED",
      },
      select: {
        id: true,
        companyId: true,
        entityId: true,
        evidence: true,
        approvedByUserId: true,
        approvedAt: true,
        signatureHash: true,
      },
    });
    const evidence =
      review?.evidence &&
      typeof review.evidence === "object" &&
      !Array.isArray(review.evidence)
        ? (review.evidence as Record<string, unknown>)
        : null;
    const input =
      evidence?.input &&
      typeof evidence.input === "object" &&
      !Array.isArray(evidence.input)
        ? (evidence.input as Record<string, unknown>)
        : null;
    const result =
      evidence?.result &&
      typeof evidence.result === "object" &&
      !Array.isArray(evidence.result)
        ? (evidence.result as Record<string, unknown>)
        : null;
    const expectedKind =
      step.flowSerial === 76 ? "STATUS_TRANSFER" : "DESTRUCTION";
    if (
      !review ||
      review.companyId !== run.companyId ||
      !review.entityId ||
      !review.approvedByUserId ||
      !review.approvedAt ||
      !review.signatureHash ||
      evidence?.action !== "APPROVE" ||
      input?.kind !== expectedKind ||
      input.orderId !== run.productionOrderId ||
      !result
    )
      throw new ConflictException(
        `Step ${step.flowSerial} requires an exact approved ${expectedKind} decision with signed result evidence.`,
      );

    if (step.flowSerial === 76) {
      const sourceInventoryLotId = String(result.sourceInventoryLotId ?? "");
      const destinationInventoryLotId = String(
        result.destinationInventoryLotId ?? "",
      );
      const quantity = decimalValue(
        typeof result.quantity === "string" ? result.quantity : 0,
      );
      if (
        !sourceInventoryLotId ||
        !destinationInventoryLotId ||
        sourceInventoryLotId === destinationInventoryLotId ||
        quantity.lessThanOrEqualTo(0) ||
        result.stockMovementPosted !== false ||
        result.journalPosted !== false
      )
        throw new ConflictException(
          "Step 76 status transfer evidence is incomplete or falsely claims stock/GL posting.",
        );
      const genealogy = await db.manufacturingGenealogy.findFirst({
        where: {
          workspaceId: run.workspaceId,
          orderId: run.productionOrderId!,
          parentInventoryLotId: sourceInventoryLotId,
          childInventoryLotId: destinationInventoryLotId,
          relationshipType: { startsWith: "STATUS_" },
          quantity,
        },
        select: { id: true },
      });
      if (!genealogy)
        throw new ConflictException(
          "Step 76 status transfer is missing its exact persisted lot genealogy.",
        );
      return { stockMovementId: null, journalId: null };
    }

    const stockMovementId = String(result.stockMovementId ?? "");
    const voucherEntryId = String(result.voucherEntryId ?? "");
    const inventoryLotId = String(result.inventoryLotId ?? "");
    const quantity = decimalValue(
      typeof result.quantity === "string" ? result.quantity : 0,
    );
    if (
      !stockMovementId ||
      !voucherEntryId ||
      !inventoryLotId ||
      quantity.lessThanOrEqualTo(0)
    )
      throw new ConflictException(
        "Step 77 destruction evidence is missing its stock or voucher source.",
      );
    const [movement, settings, voucher] = await Promise.all([
      db.stockMovement.findFirst({
        where: {
          id: stockMovementId,
          workspaceId: run.workspaceId,
          transactionType: "MANUFACTURING_MATERIAL_DESTRUCTION",
          transactionId: review.entityId,
          transactionLineId: inventoryLotId,
          movementType: "OUT",
          voidedAt: null,
          reversals: { none: {} },
        },
        select: {
          id: true,
          companyId: true,
          quantity: true,
          movementValue: true,
          inventoryItem: {
            select: {
              manufacturingProfile: { select: { role: true } },
            },
          },
        },
      }),
      db.manufacturingSettings.findUnique({
        where: { workspaceId: run.workspaceId },
        select: {
          manufacturingVarianceAccountId: true,
          rawMaterialInventoryAccountId: true,
          packagingInventoryAccountId: true,
        },
      }),
      db.voucherEntry.findFirst({
        where: { id: voucherEntryId, workspaceId: run.workspaceId },
        select: POSTING_VOUCHER_SELECT,
      }),
    ]);
    const inventoryAccountId =
      movement?.inventoryItem.manufacturingProfile?.role ===
      "PACKAGING_MATERIAL"
        ? settings?.packagingInventoryAccountId
        : settings?.rawMaterialInventoryAccountId;
    const writeOffAmount =
      typeof result.writeOffAmount === "string" ? result.writeOffAmount : null;
    if (
      !movement ||
      movement.companyId !== run.companyId ||
      !decimalValue(movement.quantity).equals(quantity) ||
      !writeOffAmount ||
      !moneyEquals(movement.movementValue, writeOffAmount)
    )
      throw new ConflictException(
        "Step 77 destruction movement does not match its approved result evidence.",
      );
    this.assertSourceVoucher(
      run,
      step,
      voucher,
      voucherEntryId,
      "MANUFACTURING_MATERIAL_DESTRUCTION",
      "MANUFACTURING_MATERIAL_DESTRUCTION",
      review.entityId,
      movement.movementValue,
      settings?.manufacturingVarianceAccountId,
      inventoryAccountId,
      2,
    );
    return { stockMovementId: movement.id, journalId: voucherEntryId };
  }

  private async assertPersistedSource(
    db: Db,
    run: RunRow,
    step: RunStepRow,
    sourceRecordType: string,
    sourceRecordId: string,
    requirePosted: boolean,
    action = requirePosted ? "CONFIRM_POSTED" : "SAVE_DRAFT",
  ): Promise<PersistedSourceLink> {
    const sourceType = normalizedSourceType(sourceRecordType);
    const sourceId = sourceRecordId.trim();
    const authoritativeStateRequired = ["APPROVE", "COMPLETE"].includes(action);
    const controlledStateRequired =
      authoritativeStateRequired || action === "SUBMIT";
    if (!sourceType || !sourceId)
      throw new BadRequestException(
        "A persisted source record type and ID are required.",
      );
    const allowedPostingSourceTypes = POSTING_SOURCE_TYPES_BY_STEP.get(
      step.flowSerial,
    );
    if (
      allowedPostingSourceTypes &&
      !allowedPostingSourceTypes.includes(sourceType)
    )
      throw new BadRequestException(
        `Step ${step.flowSerial} requires posting source ${allowedPostingSourceTypes.join(" or ")}; received ${sourceType}.`,
      );
    if (requirePosted && !allowedPostingSourceTypes)
      throw new ConflictException(
        `Step ${step.flowSerial} has no fail-closed posting-source allowlist.`,
      );
    if (
      sourceType === "MANUFACTURING_ORDER" &&
      run.productionOrderId &&
      run.productionOrderId !== sourceId
    )
      throw new BadRequestException(
        "The related production order does not match this manufacturing run.",
      );
    if (
      sourceType === "MANUFACTURING_PLAN" &&
      run.productionPlanId &&
      run.productionPlanId !== sourceId
    )
      throw new BadRequestException(
        "The related production plan does not match this manufacturing run.",
      );

    if (sourceType === "MANUFACTURING_ORDER") {
      const order = await db.manufacturingOrder.findFirst({
        where: { id: sourceId, workspaceId: run.workspaceId },
        select: {
          id: true,
          type: true,
          status: true,
          planId: true,
          finishedProductId: true,
        },
      });
      if (!order)
        throw new BadRequestException(
          "The production order does not exist in this run's workspace.",
        );
      this.assertOrderWorkflowCompatibility(run, step, order.type);
      if (run.productionPlanId && order.planId !== run.productionPlanId)
        throw new BadRequestException(
          "The production order's plan does not match this manufacturing run.",
        );
      if (run.productId && order.finishedProductId !== run.productId)
        throw new BadRequestException(
          "The production order's finished product does not match this manufacturing run.",
        );
      if (action === "SUBMIT" && step.flowSerial !== 53)
        throw new ConflictException(
          `A production order cannot be submitted as approval evidence for Step ${step.flowSerial}.`,
        );
      if (action === "SUBMIT" && step.flowSerial === 53) {
        if (order.status === "DRAFT" || order.status === "CANCELLED")
          throw new ConflictException(
            "Step 53 submission requires a submitted, non-cancelled production order.",
          );
      } else if (authoritativeStateRequired) {
        const validState = [50, 51, 52].includes(step.flowSerial)
          ? order.status !== "CANCELLED"
          : step.flowSerial === 53
            ? APPROVED_OR_LATER_ORDER_STATUSES.has(order.status)
            : step.flowSerial === 96
              ? ["COMPLETED", "QA_RELEASED", "CLOSED"].includes(order.status)
              : step.flowSerial === 157
                ? ["CANCELLED", "CLOSED"].includes(order.status)
                : false;
        if (!validState)
          throw new ConflictException(
            `A ${order.status} production order is not authoritative completion evidence for Step ${step.flowSerial}. Use the step's exact domain record or an aligned approved workflow review.`,
          );
      }
      return { stockMovementId: null, journalId: null };
    }

    if (sourceType === "MANUFACTURING_TRANSACTION") {
      if (authoritativeStateRequired && !allowedPostingSourceTypes)
        throw new BadRequestException(
          `A manufacturing transaction is not authoritative completion evidence for Step ${step.flowSerial}.`,
        );
      if (
        AGGREGATE_ORDER_POSTING_STEPS.has(step.flowSerial) &&
        !run.productionOrderId
      )
        throw new ConflictException(
          `Step ${step.flowSerial} requires this manufacturing run to be bound to one production order.`,
        );
      if (requirePosted && AGGREGATE_ORDER_POSTING_STEPS.has(step.flowSerial))
        return this.assertAggregateOrderPosting(db, run, step, sourceId);
      const transaction = await db.manufacturingTransaction.findFirst({
        where: {
          id: sourceId,
          workspaceId: run.workspaceId,
          ...(run.productionOrderId ? { orderId: run.productionOrderId } : {}),
        },
        select: AGGREGATE_TRANSACTION_SELECT,
      });
      if (!transaction)
        throw new BadRequestException(
          "The manufacturing transaction does not exist in this run's workspace/order scope.",
        );
      const expectedTypes = POSTING_TRANSACTION_TYPE_BY_STEP.get(
        step.flowSerial,
      );
      if (
        expectedTypes?.length &&
        !expectedTypes.includes(transaction.transactionType)
      )
        throw new BadRequestException(
          `Step ${step.flowSerial} requires ${expectedTypes.join(" or ")}; received ${transaction.transactionType}.`,
        );
      if (requirePosted && transaction.status !== "POSTED")
        throw new ConflictException(
          "The linked manufacturing transaction has not been posted.",
        );
      if (requirePosted)
        return this.assertSingleTransactionPosting(db, run, step, transaction);
      return {
        stockMovementId: transaction.lines[0]?.stockMovements[0]?.id ?? null,
        journalId: transaction.voucherEntryId,
      };
    }

    if (
      sourceType === "MANUFACTURING_WORKFLOW_REVIEW" &&
      [76, 77].includes(step.flowSerial)
    )
      return this.assertMaterialControlPosting(db, run, step, sourceId);

    if (sourceType === "MANUFACTURING_ACTUAL_COST_POSTING") {
      const posting = await db.manufacturingActualCostPosting.findFirst({
        where: {
          id: sourceId,
          workspaceId: run.workspaceId,
          ...(run.productionOrderId ? { orderId: run.productionOrderId } : {}),
          voucherEntry: {
            is: {
              status: "POSTED",
              reversedBy: { none: { status: "POSTED" } },
            },
          },
        },
        select: {
          id: true,
          companyId: true,
          orderId: true,
          amount: true,
          wipAccountId: true,
          clearingAccountId: true,
          voucherEntryId: true,
          voucherEntry: { select: POSTING_VOUCHER_SELECT },
        },
      });
      if (!posting)
        throw new BadRequestException(
          "The actual-cost posting does not exist in this run's workspace/order scope.",
        );
      if (step.flowSerial !== 139 || posting.companyId !== run.companyId)
        throw new BadRequestException(
          "Only Step 139 can reconcile an authoritative actual-cost posting.",
        );
      this.assertSourceVoucher(
        run,
        step,
        posting.voucherEntry,
        posting.voucherEntryId,
        "MANUFACTURING_ACTUAL_COST",
        "MANUFACTURING_ACTUAL_COST",
        posting.orderId,
        posting.amount,
        posting.wipAccountId,
        posting.clearingAccountId,
        2,
      );
      return { stockMovementId: null, journalId: posting.voucherEntryId };
    }

    if (sourceType === "MANUFACTURING_COST_SNAPSHOT") {
      const snapshot = await db.manufacturingCostSnapshot.findFirst({
        where: {
          id: sourceId,
          workspaceId: run.workspaceId,
          ...(run.productionOrderId ? { orderId: run.productionOrderId } : {}),
          voucherEntry: {
            is: {
              status: "POSTED",
              reversedBy: { none: { status: "POSTED" } },
            },
          },
        },
        select: {
          id: true,
          companyId: true,
          orderId: true,
          status: true,
          finalizedByUserId: true,
          finalizedAt: true,
          voucherEntryId: true,
          voucherEntry: { select: POSTING_VOUCHER_SELECT },
        },
      });
      if (!snapshot)
        throw new BadRequestException(
          "The manufacturing cost snapshot does not exist in this run's workspace/order scope.",
        );
      if (
        step.flowSerial !== 139 ||
        snapshot.companyId !== run.companyId ||
        snapshot.status !== "FINALIZED" ||
        !snapshot.finalizedByUserId ||
        !snapshot.finalizedAt ||
        !snapshot.voucherEntryId
      )
        throw new ConflictException(
          "Step 139 requires an authoritative finalized manufacturing cost snapshot.",
        );
      this.assertSourceVoucher(
        run,
        step,
        snapshot.voucherEntry,
        snapshot.voucherEntryId,
        "MANUFACTURING_COST_FINALIZATION",
        "MANUFACTURING_COST_FINALIZATION",
        snapshot.orderId,
        null,
      );
      return { stockMovementId: null, journalId: snapshot.voucherEntryId };
    }

    if (requirePosted)
      throw new BadRequestException(
        "Posted workflow reconciliation requires a posted Manufacturing Transaction, finalized Manufacturing Cost Snapshot, or immutable Actual Cost Posting source.",
      );

    if (sourceType === "MANUFACTURING_PLAN") {
      const plan = await db.manufacturingPlan.findFirst({
        where: { id: sourceId, workspaceId: run.workspaceId },
        select: { id: true, status: true, finishedProductId: true },
      });
      if (!plan)
        throw new BadRequestException(
          "The production plan does not exist in this run's workspace.",
        );
      if (run.productId && plan.finishedProductId !== run.productId)
        throw new BadRequestException(
          "The production plan's finished product does not match this manufacturing run.",
        );
      if (controlledStateRequired && step.flowSerial !== 46)
        throw new ConflictException(
          `A production plan is not controlled evidence for Step ${step.flowSerial}.`,
        );
      if (
        authoritativeStateRequired &&
        ![
          "APPROVED",
          "RELEASED",
          "IN_PROGRESS",
          "COMPLETED",
          "CLOSED",
        ].includes(plan.status)
      )
        throw new ConflictException(
          `A ${plan.status} production plan is not authoritative completion evidence for Step ${step.flowSerial}.`,
        );
      return { stockMovementId: null, journalId: null };
    }

    if (sourceType === "MANUFACTURING_BOM_VERSION") {
      const version = await db.manufacturingBomVersion.findFirst({
        where: {
          id: sourceId,
          bom: { workspaceId: run.workspaceId },
        },
        select: {
          id: true,
          status: true,
          bom: { select: { finishedProductId: true } },
        },
      });
      if (!version)
        throw new BadRequestException(
          "The BOM version does not exist in this run's workspace.",
        );
      if (run.productId && version.bom.finishedProductId !== run.productId)
        throw new BadRequestException(
          "The BOM version's finished product does not match this manufacturing run.",
        );
      if (controlledStateRequired && ![28, 29].includes(step.flowSerial))
        throw new ConflictException(
          `A BOM version is not controlled evidence for Step ${step.flowSerial}.`,
        );
      if (authoritativeStateRequired && version.status !== "APPROVED")
        throw new ConflictException(
          `Step ${step.flowSerial} requires an approved, product-matched BOM version or aligned approved workflow review.`,
        );
      return { stockMovementId: null, journalId: null };
    }

    if (sourceType === "MANUFACTURING_ROUTING_VERSION") {
      const version = await db.manufacturingRoutingVersion.findFirst({
        where: {
          id: sourceId,
          routing: { workspaceId: run.workspaceId },
        },
        select: {
          id: true,
          status: true,
          routing: { select: { finishedProductId: true } },
        },
      });
      if (!version)
        throw new BadRequestException(
          "The routing version does not exist in this run's workspace.",
        );
      if (run.productId && version.routing.finishedProductId !== run.productId)
        throw new BadRequestException(
          "The routing version's finished product does not match this manufacturing run.",
        );
      if (controlledStateRequired && step.flowSerial !== 27)
        throw new ConflictException(
          `A routing version is not controlled evidence for Step ${step.flowSerial}.`,
        );
      if (authoritativeStateRequired && version.status !== "APPROVED")
        throw new ConflictException(
          `Step ${step.flowSerial} requires an approved, product-matched routing version or aligned approved workflow review.`,
        );
      return { stockMovementId: null, journalId: null };
    }

    if (sourceType === "MANUFACTURING_SETTINGS") {
      const settings = await db.manufacturingSettings.findFirst({
        where: { id: sourceId, workspaceId: run.workspaceId },
        select: { id: true },
      });
      if (!settings)
        throw new BadRequestException(
          "Manufacturing settings do not exist in this run's workspace.",
        );
      if (authoritativeStateRequired)
        throw new ConflictException(
          "Manufacturing settings have no approved version state. Complete Step 8 with its exact aligned APPROVED workflow review after readiness passes.",
        );
      return { stockMovementId: null, journalId: null };
    }

    if (sourceType === "MANUFACTURING_WORKFLOW_REVIEW") {
      const review = await db.manufacturingWorkflowReview.findFirst({
        where: { id: sourceId, workspaceId: run.workspaceId },
        select: {
          id: true,
          companyId: true,
          workflowGroup: true,
          workflowCode: true,
          entityType: true,
          entityId: true,
          status: true,
        },
      });
      if (!review || review.companyId !== run.companyId)
        throw new BadRequestException(
          "The workflow review does not exist in this run's workspace/company scope.",
        );
      const expectedGroup =
        WORKFLOW_REVIEW_GROUP_BY_FLOW_GROUP[step.flowGroupCode];
      const expectedCode = workflowCodeFromRoute(step.route);
      if (
        !expectedGroup ||
        !expectedCode ||
        review.workflowGroup !== expectedGroup ||
        review.workflowCode !== expectedCode
      )
        throw new BadRequestException(
          `The workflow review is not aligned to Step ${step.flowSerial}. ${step.title}.`,
        );
      const entityType = normalizedSourceType(review.entityType ?? "");
      const entityId = review.entityId?.trim() ?? "";
      const exactRunLink =
        (entityType === "MANUFACTURING_RUN" && entityId === run.id) ||
        ([
          "MANUFACTURING_ORDER",
          "PRODUCTION_ORDER",
          "MANUFACTURINGORDER",
          "PRODUCTIONORDER",
        ].includes(entityType) &&
          Boolean(run.productionOrderId) &&
          entityId === run.productionOrderId) ||
        (["MANUFACTURING_PLAN", "PRODUCTION_PLAN"].includes(entityType) &&
          Boolean(run.productionPlanId) &&
          entityId === run.productionPlanId) ||
        (["INVENTORY_ITEM", "MANUFACTURED_PRODUCT"].includes(entityType) &&
          Boolean(run.productId) &&
          entityId === run.productId);
      if (!exactRunLink)
        throw new BadRequestException(
          "The workflow review must link this exact manufacturing run, production order, plan, or manufactured product.",
        );
      if (
        ["SUBMIT", "APPROVE", "COMPLETE"].includes(action) &&
        !["PENDING", "REVIEWED", "APPROVED"].includes(review.status)
      )
        throw new ConflictException(
          `A ${review.status} workflow review cannot advance this controlled step.`,
        );
      if (authoritativeStateRequired && review.status !== "APPROVED")
        throw new ConflictException(
          `Step ${step.flowSerial} requires its exact workflow review to be APPROVED.`,
        );
      return { stockMovementId: null, journalId: null };
    }

    if (controlledStateRequired)
      throw new BadRequestException(
        `Source type ${sourceType} is not authoritative controlled evidence for Step ${step.flowSerial}.`,
      );

    const auditReference = await db.auditLog.findFirst({
      where: {
        workspaceId: run.workspaceId,
        entityId: sourceId,
        entityType: { in: [sourceRecordType.trim(), sourceType] },
      },
      select: { id: true },
    });
    if (!auditReference)
      throw new BadRequestException(
        "The related record could not be verified through a workspace-scoped domain record or audit reference.",
      );
    return { stockMovementId: null, journalId: null };
  }

  private async assertRunInScope(
    db: Db,
    runId: string,
    workspaceId: string,
    lock = false,
  ) {
    const suffix = lock ? Prisma.sql` FOR UPDATE OF r` : Prisma.empty;
    const rows = await db.$queryRaw<RunRow[]>(Prisma.sql`
      SELECT r.*, d."version" AS "workflowDefinitionVersion"
      FROM "ManufacturingRun" r
      JOIN "ManufacturingWorkflowDefinition" d ON d."id" = r."workflowDefinitionId"
      WHERE r."id" = ${runId} AND r."workspaceId" = ${workspaceId}
      LIMIT 1${suffix}
    `);
    if (!rows[0]) throw new NotFoundException("Manufacturing run not found.");
    return rows[0];
  }

  private async runSteps(db: Db, run: RunRow) {
    const steps = await db.$queryRaw<RunStepRow[]>(Prisma.sql`
      SELECT rs.*, sd."flowSerial", sd."legacyStepCode",
        g."flowGroupCode", g."name" AS "flowGroupName",
        g."flowGroupOrder", sd."title",
        sd."route", sd."postingEffect"::text AS "postingEffect",
        sd."permissionKey", sd."completionRule",
        sd."applicabilityType"::text AS "applicabilityType",
        sd."stepType"::text AS "stepType", sd."repeatable",
        sd."isBlocking"
      FROM "ManufacturingRunStep" rs
      JOIN "ManufacturingWorkflowStepDefinition" sd ON sd."id" = rs."stepDefinitionId"
      JOIN "ManufacturingWorkflowGroup" g ON g."id" = sd."workflowGroupId"
      WHERE rs."runId" = ${run.id}
      ORDER BY sd."flowSerial",
        CASE WHEN rs."occurrenceKey" = 'PRIMARY' THEN 0 ELSE 1 END,
        rs."occurrenceKey"
    `);
    // Version 1 stored generated reports as blocking REQUIRED steps. Preserve
    // its rows while interpreting those read-only report surfaces safely at
    // runtime so historical runs cannot deadlock at the archive controls.
    if (run.workflowDefinitionVersion !== 1) return steps;
    return steps.map((step) =>
      step.flowSerial >= 144 && step.flowSerial <= 154
        ? { ...step, applicabilityType: "MONITORING", isBlocking: false }
        : step,
    );
  }

  private async dependencies(db: Db, run: RunRow) {
    const dependencies = await db.$queryRaw<DependencyRow[]>(Prisma.sql`
      SELECT step."flowSerial" AS "stepFlowSerial",
        prerequisite."flowSerial" AS "prerequisiteFlowSerial",
        dependency."requiredStatus"::text AS "requiredStatus",
        dependency."dependencyType"::text AS "dependencyType",
        dependency."conditionExpression"
      FROM "ManufacturingStepDependency" dependency
      JOIN "ManufacturingWorkflowStepDefinition" step ON step."id" = dependency."stepId"
      JOIN "ManufacturingWorkflowStepDefinition" prerequisite ON prerequisite."id" = dependency."prerequisiteStepId"
      WHERE step."workflowDefinitionId" = ${run.workflowDefinitionId}
      ORDER BY step."flowSerial", prerequisite."flowSerial"
    `);
    if (run.workflowDefinitionVersion !== 1) return dependencies;
    const compatible = dependencies.filter(
      (dependency) =>
        !(
          dependency.stepFlowSerial === 155 &&
          dependency.prerequisiteFlowSerial >= 144 &&
          dependency.prerequisiteFlowSerial <= 154
        ) &&
        !(
          dependency.stepFlowSerial === 156 &&
          dependency.prerequisiteFlowSerial === 154
        ),
    );
    if (
      !compatible.some(
        (dependency) =>
          dependency.stepFlowSerial === 155 &&
          dependency.prerequisiteFlowSerial === 143,
      )
    )
      compatible.push({
        stepFlowSerial: 155,
        prerequisiteFlowSerial: 143,
        requiredStatus: "COMPLETED",
        dependencyType: "HARD",
        conditionExpression: null,
      });
    return compatible;
  }

  private missingDependencies(
    step: RunStepRow,
    steps: RunStepRow[],
    dependencies: DependencyRow[],
  ) {
    return dependencies
      .filter((dependency) => dependency.stepFlowSerial === step.flowSerial)
      .flatMap((dependency) => {
        const prerequisites = steps.filter(
          (candidate) =>
            candidate.flowSerial === dependency.prerequisiteFlowSerial,
        );
        return prerequisites
          .filter((prerequisite) => {
            if (!prerequisite.applicable)
              return !(
                prerequisite.status === "N_A" &&
                Boolean(prerequisite.naReason?.trim())
              );
            return !satisfiesStatus(
              prerequisite.status,
              dependency.requiredStatus,
            );
          })
          .map((prerequisite) => ({
            flowSerial: prerequisite.flowSerial,
            occurrenceKey: prerequisite.occurrenceKey,
            title: prerequisite.title,
            requiredStatus: dependency.requiredStatus,
            actualStatus: prerequisite.status,
            route: prerequisite.route,
          }));
      });
  }

  private prerequisiteDetails(
    step: RunStepRow,
    steps: RunStepRow[],
    dependencies: DependencyRow[],
  ) {
    return dependencies
      .filter((dependency) => dependency.stepFlowSerial === step.flowSerial)
      .flatMap((dependency) =>
        steps
          .filter(
            (candidate) =>
              candidate.flowSerial === dependency.prerequisiteFlowSerial,
          )
          .map((prerequisite) => ({
            flowSerial: prerequisite.flowSerial,
            occurrenceKey: prerequisite.occurrenceKey,
            title: prerequisite.title,
            requiredStatus: dependency.requiredStatus,
            actualStatus: prerequisite.status,
            route: prerequisite.route,
            dependencyType: dependency.dependencyType,
            conditionExpression: dependency.conditionExpression,
          })),
      );
  }

  private async refreshRun(db: Db, run: RunRow, performedByUserId: string) {
    const steps = await this.runSteps(db, run);
    const dependencies = await this.dependencies(db, run);
    for (const step of steps) {
      if (
        step.flowGroupCode === "A" ||
        !step.applicable ||
        !["LOCKED", "BLOCKED", "READY"].includes(step.status)
      )
        continue;
      const missing = this.missingDependencies(step, steps, dependencies);
      // Dependencies are advisory while users navigate and prepare drafts.
      // The transition guard still rejects approval, completion and posting
      // until every prerequisite listed here is satisfied.
      const status = "READY";
      const blockerReason = missing.length
        ? `Before approval, completion or posting, finish ${missing.map(workflowStepReference).join(", ")}.`
        : null;
      if (step.status !== status || step.blockerReason !== blockerReason) {
        const previousStatus = step.status;
        const previousBlockerReason = step.blockerReason;
        const updateCount = await db.$executeRaw(Prisma.sql`
            UPDATE "ManufacturingRunStep"
            SET "status" = ${status}::"ManufacturingWorkflowStepStatus",
              "blockerReason" = ${blockerReason}, "version" = "version" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${step.id} AND "version" = ${step.version}
          `);
        if (updateCount !== 1)
          throw new ConflictException(
            "A workflow dependency state changed concurrently. Refresh and retry.",
          );
        const systemTransitionKey = [
          run.id,
          step.id,
          "SYSTEM_DEPENDENCY_REFRESH",
          step.version,
          status,
        ].join(":");
        await db.$executeRaw(Prisma.sql`
            INSERT INTO "ManufacturingRunStepTransition" (
              "id", "runStepId", "fromStatus", "toStatus", "sourceAction",
              "reason", "performedByUserId", "sourceRecordType",
              "sourceRecordId", "idempotencyKey", "createdAt"
            ) VALUES (
              ${randomUUID()}, ${step.id},
              ${previousStatus}::"ManufacturingWorkflowStepStatus",
              ${status}::"ManufacturingWorkflowStepStatus",
              'SYSTEM_DEPENDENCY_REFRESH',
              ${blockerReason ?? "Prerequisite notification cleared."},
              ${performedByUserId}, 'MANUFACTURING_RUN', ${run.id},
              ${systemTransitionKey}, CURRENT_TIMESTAMP
            )
          `);
        await db.auditLog.create({
          data: {
            tenantId: run.tenantId,
            companyId: run.companyId,
            workspaceId: run.workspaceId,
            userId: performedByUserId,
            action: "MANUFACTURING_RUN_STEP_SYSTEM_DEPENDENCY_REFRESH",
            entityType: "MANUFACTURING_RUN_STEP",
            entityId: step.id,
            oldValues: {
              status: previousStatus,
              blockerReason: previousBlockerReason,
            } as Prisma.InputJsonValue,
            newValues: {
              status,
              blockerReason,
              flowSerial: step.flowSerial,
            } as Prisma.InputJsonValue,
          },
        });
        step.status = status;
        step.blockerReason = blockerReason;
        step.version += 1;
      }
    }
    const refreshed = await this.runSteps(db, run);
    const next = this.nextAction(run.id, refreshed, dependencies);
    const allRequiredComplete = refreshed
      .filter(
        (step) =>
          step.flowGroupCode !== "A" &&
          step.applicable &&
          (step.isBlocking || step.applicabilityType === "PERIODIC"),
      )
      .every(isStepComplete);
    const currentSerial = next.step?.flowSerial ?? 159;
    const currentGroup = next.step?.flowGroupCode ?? "K";
    const nextRunStatus = runStatusForSteps(
      currentSerial,
      refreshed,
      allRequiredComplete,
    );
    await db.$executeRaw(Prisma.sql`
      UPDATE "ManufacturingRun"
      SET "currentGroup" = ${currentGroup}, "currentStepSerial" = ${currentSerial},
        "status" = ${nextRunStatus}::"ManufacturingRunStatus",
        "completedAt" = CASE WHEN ${allRequiredComplete} THEN COALESCE("completedAt", CURRENT_TIMESTAMP) ELSE "completedAt" END,
        "closedAt" = CASE WHEN ${refreshed.some((step) => step.flowSerial === 157 && isStepComplete(step))}
          THEN COALESCE("closedAt", CURRENT_TIMESTAMP) ELSE "closedAt" END,
        "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${run.id}
    `);
    if (run.status !== nextRunStatus)
      await db.auditLog.create({
        data: {
          tenantId: run.tenantId,
          companyId: run.companyId,
          workspaceId: run.workspaceId,
          userId: performedByUserId,
          action: "MANUFACTURING_RUN_STATUS_CHANGED",
          entityType: "MANUFACTURING_RUN",
          entityId: run.id,
          oldValues: {
            status: run.status,
            currentGroup: run.currentGroup,
            currentStepSerial: run.currentStepSerial,
          } as Prisma.InputJsonValue,
          newValues: {
            status: nextRunStatus,
            currentGroup,
            currentStepSerial: currentSerial,
          } as Prisma.InputJsonValue,
        },
      });
  }

  private nextAction(
    runId: string,
    steps: RunStepRow[],
    dependencies: DependencyRow[],
  ) {
    const unresolved = steps.filter(
      (step) =>
        step.applicable &&
        step.flowGroupCode !== "A" &&
        (step.isBlocking || step.applicabilityType === "PERIODIC") &&
        !isStepComplete(step),
    );
    const candidate = unresolved[0];
    if (!candidate)
      return {
        state: "COMPLETE" as const,
        runId,
        step: null,
        blockerReason: null,
        fixingRoute: null,
      };
    const missing = this.missingDependencies(candidate, steps, dependencies);
    if (
      missing.length === 0 &&
      [
        "LOCKED",
        "BLOCKED",
        "READY",
        "IN_PROGRESS",
        "PENDING_APPROVAL",
        "APPROVED",
        "POSTING",
      ].includes(candidate.status)
    )
      return {
        state: "READY" as const,
        runId,
        step: this.mapStep(
          candidate,
          missing,
          this.prerequisiteDetails(candidate, steps, dependencies),
        ),
        blockerReason: null,
        fixingRoute: candidate.route,
      };
    const fixing = missing[0];
    const fixingStep = fixing
      ? (steps.find(
          (step) =>
            step.flowSerial === fixing.flowSerial &&
            step.occurrenceKey === fixing.occurrenceKey,
        ) ?? candidate)
      : candidate;
    return {
      state: "BLOCKED" as const,
      runId,
      step: this.mapStep(
        fixingStep,
        this.missingDependencies(fixingStep, steps, dependencies),
        this.prerequisiteDetails(fixingStep, steps, dependencies),
      ),
      blockerReason:
        candidate.blockerReason ??
        (fixing
          ? `Complete ${workflowStepReference(fixing)} first.`
          : `Step ${candidate.flowSerial} is ${candidate.status.toLowerCase().replaceAll("_", " ")}.`),
      fixingRoute: fixingStep.route,
    };
  }

  private mapStep(
    step: RunStepRow,
    missingPrerequisites: ReturnType<
      ManufacturingWorkflowService["missingDependencies"]
    >,
    prerequisites: ReturnType<
      ManufacturingWorkflowService["prerequisiteDetails"]
    >,
  ) {
    const status = ["LOCKED", "BLOCKED"].includes(step.status)
      ? "READY"
      : step.status;
    return {
      id: step.id,
      occurrenceKey: step.occurrenceKey,
      flowSerial: step.flowSerial,
      legacyStepCode: step.legacyStepCode,
      flowGroupCode: step.flowGroupCode,
      title: step.title,
      route: step.route,
      status,
      applicable: step.applicable,
      blockerReason: step.blockerReason,
      naReason: step.naReason,
      postingEffect: step.postingEffect,
      permissionKey: step.permissionKey,
      completionRule: step.completionRule,
      applicabilityType: step.applicabilityType,
      stepType: step.stepType,
      repeatable: step.repeatable,
      sourceRecordType: step.sourceRecordType,
      sourceRecordId: step.sourceRecordId,
      startedAt: iso(step.startedAt),
      completedAt: iso(step.completedAt),
      completedBy: step.completedBy,
      approvedBy: step.approvedBy,
      signatureReference: step.signatureReference,
      version: step.version,
      prerequisites,
      missingPrerequisites,
    };
  }

  private async hydrateRun(db: Db, run: RunRow) {
    const steps = await this.runSteps(db, run);
    const dependencies = await this.dependencies(db, run);
    const mappedSteps = steps.map((step) =>
      this.mapStep(
        step,
        this.missingDependencies(step, steps, dependencies),
        this.prerequisiteDetails(step, steps, dependencies),
      ),
    );
    const pinnedGroups = Array.from(
      new Map(
        steps.map((step) => [
          step.flowGroupCode,
          {
            flowGroupCode: step.flowGroupCode,
            name: step.flowGroupName,
            flowGroupOrder: step.flowGroupOrder,
          },
        ]),
      ).values(),
    ).sort((left, right) => left.flowGroupOrder - right.flowGroupOrder);
    const groups = pinnedGroups.map((group) => {
      const groupSteps = steps.filter(
        (step) => step.flowGroupCode === group.flowGroupCode,
      );
      const applicable = groupSteps.filter((step) => step.applicable);
      const blocking = applicable.filter((step) => step.isBlocking);
      const completed = applicable.filter(isStepComplete).length;
      const notApplicable = groupSteps.filter(
        (step) => step.status === "N_A",
      ).length;
      const blocked = applicable.filter((step) =>
        ["FAILED", "REJECTED"].includes(step.status),
      ).length;
      const pendingApproval = applicable.filter(
        (step) => step.status === "PENDING_APPROVAL",
      ).length;
      const allComplete = blocking.every(isStepComplete);
      const anyStarted = blocking.some(
        (step) => !["LOCKED", "BLOCKED", "READY"].includes(step.status),
      );
      const state =
        group.flowGroupCode === "A"
          ? "READY"
          : blocked
            ? "BLOCKED"
            : allComplete
              ? notApplicable
                ? "COMPLETED_WITH_NA"
                : "COMPLETED"
              : anyStarted
                ? "IN_PROGRESS"
                : "READY";
      return {
        flowGroupCode: group.flowGroupCode,
        name: group.name,
        state,
        applicable: applicable.length,
        completed,
        notApplicable,
        blocked,
        pendingApproval,
      };
    });
    return {
      id: run.id,
      workspaceId: run.workspaceId,
      workflowDefinitionId: run.workflowDefinitionId,
      workflowDefinitionVersion: String(run.workflowDefinitionVersion),
      productionPlanId: run.productionPlanId,
      productionOrderId: run.productionOrderId,
      productId: run.productId,
      manufacturingMode: run.manufacturingMode,
      status: run.status,
      currentGroup: run.currentGroup ?? "B",
      currentStepSerial: run.currentStepSerial ?? 8,
      version: run.version,
      startedAt: iso(run.startedAt),
      completedAt: iso(run.completedAt),
      closedAt: iso(run.closedAt),
      groups,
      steps: mappedSteps,
      nextAction:
        run.status === "CANCELLED"
          ? {
              state: "COMPLETE" as const,
              runId: run.id,
              step: null,
              blockerReason: "This empty manufacturing run was discarded.",
              fixingRoute: null,
            }
          : this.nextAction(run.id, steps, dependencies),
    };
  }
}
