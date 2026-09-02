import { createHash } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PermissionsService } from "../common/services/permissions.service.js";
import {
  ManufacturingControlRecordKind,
  Prisma,
} from "../generated/prisma/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  CreateManufacturingGovernanceRecordDto,
  ManufacturingGovernanceKind,
  RecordManufacturingControlledPrintDto,
  ReviseManufacturingGovernanceRecordDto,
  TransitionManufacturingGovernanceRecordDto,
} from "./manufacturing-governance.dto.js";
import { MANUFACTURING_APPROVAL_WORKFLOW_SCOPES } from "./manufacturing-approval-workflow.domain.js";
import { MANUFACTURING_GOVERNANCE_KINDS } from "./manufacturing-governance.dto.js";
import { parseManufacturingElectronicSignaturePolicy } from "./manufacturing-electronic-signature.domain.js";
import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import { normalizeManufacturingEvidenceAttachments } from "./manufacturing-evidence-attachment.domain.js";

type Db = Prisma.TransactionClient | PrismaService;
type Scope = { id: string; tenantId: string; companyId: string };
type Query = Record<string, string | undefined>;
type JsonObject = Record<string, Prisma.InputJsonValue | null>;

const QUALITY_KINDS = new Set<ManufacturingGovernanceKind>([
  "ENVIRONMENT_UTILITY_CHECK",
  "QUALITY_CASE",
  "COMPLIANCE_RECORD",
  "RECALL_DRILL",
]);

const AUDIT_KINDS = new Set<ManufacturingGovernanceKind>([
  "USER_ACCESS_REVIEW",
  "AUDIT_EVIDENCE_PACK",
  "VALIDATION_DOCUMENT",
]);

const QUALITY_CASE_TYPES = [
  "OOS",
  "OOT",
  "DEVIATION",
  "CAPA",
  "CHANGE_CONTROL",
  "COMPLAINT",
  "DESTRUCTION",
] as const;

const VALIDATION_DOCUMENT_TYPES = [
  "URS",
  "FS",
  "DS",
  "RISK_ASSESSMENT",
  "DATA_FLOW_ARCHITECTURE",
  "ROLE_ACCESS_MATRIX",
  "TRACEABILITY_MATRIX",
  "IQ",
  "OQ",
  "PQ_UAT",
  "BACKUP_RESTORE_TEST",
  "DISASTER_RECOVERY_TEST",
  "SECURITY_TEST",
  "AUDIT_TRAIL_TEST",
  "ELECTRONIC_SIGNATURE_TEST",
  "DATA_MIGRATION_VALIDATION",
  "INTEGRATION_VALIDATION",
  "SOP",
  "TRAINING_RECORD",
  "CHANGE_CONTROL",
  "PERIODIC_REVIEW",
  "INCIDENT_PROBLEM_MANAGEMENT",
  "DECOMMISSION_ARCHIVE_PLAN",
] as const;

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(
  details: Record<string, unknown>,
  key: string,
  label = key,
): string {
  const value = cleanText(details[key]);
  if (!value) throw new BadRequestException(`${label} is required.`);
  if (value.length > 2000)
    throw new BadRequestException(`${label} cannot exceed 2000 characters.`);
  return value;
}

function requiredArray(
  details: Record<string, unknown>,
  key: string,
  label = key,
): unknown[] {
  const value = details[key];
  if (!Array.isArray(value) || value.length === 0)
    throw new BadRequestException(`${label} requires at least one entry.`);
  return value;
}

function requiredBoolean(
  details: Record<string, unknown>,
  key: string,
  label = key,
): boolean {
  if (typeof details[key] !== "boolean")
    throw new BadRequestException(`${label} must be true or false.`);
  return details[key] as boolean;
}

function requiredPositiveNumber(
  details: Record<string, unknown>,
  key: string,
  label = key,
): number {
  const value = details[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${label} must be greater than zero.`);
  }
  return value;
}

function asDate(value: string, label = "date"): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException(`${label} is invalid.`);
  return date;
}

function optionalDate(
  value: string | null | undefined,
  label: string,
): Date | null {
  return value ? asDate(value, label) : null;
}

function normalizeCode(value: string): string {
  const code = value.trim().toUpperCase().replace(/\s+/g, "-");
  if (!code || code.length > 80 || !/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
    throw new BadRequestException(
      "Code may contain up to 80 letters, numbers, dot, underscore, slash and hyphen characters.",
    );
  }
  return code;
}

export function sanitizeManufacturingGovernanceJson(
  value: unknown,
  path = "details",
): Prisma.InputJsonValue | null {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new BadRequestException(`${path} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value))
    return value.map((entry, index) =>
      sanitizeManufacturingGovernanceJson(entry, `${path}[${index}]`),
    );
  if (typeof value !== "object")
    throw new BadRequestException(`${path} contains an unsupported value.`);
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/^(password|secret|token|api[-_]?key|private[-_]?key)$/i.test(key)) {
      throw new BadRequestException(
        `Store ${key} in the secret manager and submit only secretReference.`,
      );
    }
    if (entry !== undefined)
      result[key] = sanitizeManufacturingGovernanceJson(
        entry,
        `${path}.${key}`,
      );
  }
  return result;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function manufacturingGovernanceEvidenceHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function signatureHash(
  parts: Array<string | number | null | undefined>,
): string {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join(":"), "utf8")
    .digest("hex");
}

function isUniqueError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002",
  );
}

function isGovernanceKind(
  value: string | undefined,
): value is ManufacturingGovernanceKind {
  return Boolean(
    value &&
    (MANUFACTURING_GOVERNANCE_KINDS as readonly string[]).includes(value),
  );
}

function objectEntry(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

export function validateManufacturingGovernanceDetails(
  kind: ManufacturingGovernanceKind,
  details: Record<string, unknown>,
) {
  requiredText(details, "description", "Description");
  if (Object.prototype.hasOwnProperty.call(details, "attachments")) {
    normalizeManufacturingEvidenceAttachments(details.attachments);
  }
  switch (kind) {
    case "TOOLS_DIES_MOULDS":
      requiredText(details, "resourceType", "Resource type");
      requiredText(details, "resourceCode", "Resource code");
      requiredText(details, "readinessState", "Readiness state");
      requiredText(
        details,
        "evidenceReference",
        "Readiness evidence reference",
      );
      break;
    case "APPROVAL_WORKFLOW": {
      const workflowScope = requiredText(
        details,
        "workflowScope",
        "Workflow scope",
      ).toUpperCase();
      if (
        !(MANUFACTURING_APPROVAL_WORKFLOW_SCOPES as readonly string[]).includes(
          workflowScope,
        )
      ) {
        throw new BadRequestException(
          `Workflow scope must be one of: ${MANUFACTURING_APPROVAL_WORKFLOW_SCOPES.join(", ")}.`,
        );
      }
      const stages = requiredArray(details, "stages", "Approval stages").map(
        (stage, index) => objectEntry(stage, `Approval stage ${index + 1}`),
      );
      const sequences = new Set<number>();
      for (const [index, stage] of stages.entries()) {
        const sequence = stage.sequence;
        if (!Number.isInteger(sequence) || Number(sequence) < 1)
          throw new BadRequestException(
            `Approval stage ${index + 1} requires a positive sequence.`,
          );
        if (sequences.has(Number(sequence)))
          throw new BadRequestException(
            "Approval stage sequences must be unique.",
          );
        sequences.add(Number(sequence));
        requiredText(
          stage,
          "permissionKey",
          `Approval stage ${index + 1} permission`,
        );
        requiredText(
          stage,
          "signatureMeaning",
          `Approval stage ${index + 1} signature meaning`,
        );
      }
      const orderedSequences = [...sequences].sort(
        (left, right) => left - right,
      );
      if (orderedSequences.some((sequence, index) => sequence !== index + 1)) {
        throw new BadRequestException(
          "Approval stage sequences must be consecutive and start at 1.",
        );
      }
      break;
    }
    case "USER_ACCESS_REVIEW":
      requiredText(details, "reviewPeriod", "Review period");
      requiredText(details, "reviewerReference", "Reviewer reference");
      requiredText(details, "evidenceReference", "Evidence reference");
      break;
    case "ELECTRONIC_SIGNATURE_POLICY":
      requiredArray(details, "signatureMeanings", "Signature meanings");
      requiredBoolean(
        details,
        "reauthenticationRequired",
        "Reauthentication required",
      );
      requiredPositiveNumber(
        details,
        "sessionTimeoutMinutes",
        "Session timeout minutes",
      );
      requiredBoolean(details, "mfaRequired", "MFA required");
      break;
    case "STATUS_CONFIGURATION": {
      requiredText(details, "workflowScope", "Workflow scope");
      const transitions = requiredArray(
        details,
        "transitions",
        "Status transitions",
      ).map((entry, index) => objectEntry(entry, `Transition ${index + 1}`));
      const transitionKeys = new Set<string>();
      for (const [index, transition] of transitions.entries()) {
        const from = requiredText(
          transition,
          "from",
          `Transition ${index + 1} from status`,
        );
        const to = requiredText(
          transition,
          "to",
          `Transition ${index + 1} to status`,
        );
        if (from === to)
          throw new BadRequestException(
            `Transition ${index + 1} cannot start and end at the same status.`,
          );
        const transitionKey = `${from}->${to}`;
        if (transitionKeys.has(transitionKey))
          throw new BadRequestException(
            `Transition ${index + 1} duplicates ${transitionKey}.`,
          );
        transitionKeys.add(transitionKey);
        const permissionKey = requiredText(
          transition,
          "permissionKey",
          `Transition ${index + 1} permission`,
        );
        if (!permissionKey.startsWith("manufacturing."))
          throw new BadRequestException(
            `Transition ${index + 1} permission must be a manufacturing permission key.`,
          );
      }
      break;
    }
    case "ALERT_NOTIFICATION_RULE":
      requiredText(details, "eventCode", "Event code");
      requiredArray(details, "channels", "Notification channels");
      requiredArray(details, "recipientRoles", "Recipient roles");
      break;
    case "PRINT_TEMPLATE":
      requiredText(details, "documentType", "Document type");
      requiredText(details, "templateReference", "Template reference");
      requiredBoolean(details, "controlledCopy", "Controlled copy");
      break;
    case "INTEGRATION_SETTING":
      requiredText(details, "systemName", "System name");
      requiredText(details, "direction", "Integration direction");
      requiredText(details, "endpointReference", "Endpoint reference");
      requiredText(details, "secretReference", "Secret-manager reference");
      break;
    case "ENVIRONMENT_UTILITY_CHECK":
      requiredText(details, "monitoringType", "Monitoring type");
      requiredText(details, "parameter", "Parameter");
      requiredText(details, "result", "Result");
      requiredText(details, "acceptanceCriteria", "Acceptance criteria");
      requiredText(details, "outcome", "Outcome");
      requiredText(details, "evidenceReference", "Evidence reference");
      break;
    case "QUALITY_CASE": {
      const caseType = requiredText(details, "caseType", "Quality case type");
      if (!(QUALITY_CASE_TYPES as readonly string[]).includes(caseType))
        throw new BadRequestException("Quality case type is invalid.");
      requiredText(details, "sourceReference", "Source reference");
      requiredText(details, "severity", "Severity");
      requiredText(details, "ownerReference", "Owner reference");
      requiredText(details, "state", "Case state");
      const orderId =
        cleanText(details.orderId) ?? cleanText(details.productionOrderId);
      const productionOrderId = cleanText(details.productionOrderId);
      if (
        cleanText(details.orderId) &&
        productionOrderId &&
        cleanText(details.orderId) !== productionOrderId
      ) {
        throw new BadRequestException(
          "Quality case orderId and productionOrderId must reference the same production order.",
        );
      }
      if (!orderId && !cleanText(details.inventoryItemId)) {
        throw new BadRequestException(
          "Quality case must link an existing production order or inventory item.",
        );
      }
      const hasVarianceEvidence =
        Boolean(cleanText(details.orderMaterialId)) ||
        Boolean(cleanText(details.approvedVarianceUnit)) ||
        Boolean(cleanText(details.varianceReason)) ||
        (Number.isFinite(Number(details.approvedVarianceQuantity)) &&
          Number(details.approvedVarianceQuantity) !== 0);
      if (hasVarianceEvidence) {
        if (!(["DEVIATION", "CHANGE_CONTROL"] as string[]).includes(caseType))
          throw new BadRequestException(
            "Material variance evidence requires a DEVIATION or CHANGE_CONTROL case.",
          );
        requiredText(details, "productionOrderId", "Production order");
        requiredText(details, "inventoryItemId", "Inventory item");
        const orderMaterialId = requiredText(
          details,
          "orderMaterialId",
          "Production-order material",
        );
        if (requiredText(details, "sourceReference", "Source reference") !== orderMaterialId)
          throw new BadRequestException(
            "Material variance sourceReference must exactly equal the production-order material ID.",
          );
        requiredText(details, "approvedVarianceUnit", "Approved variance unit");
        requiredText(details, "varianceReason", "Investigated variance reason");
        const approvedVarianceQuantity = Number(details.approvedVarianceQuantity);
        if (!Number.isFinite(approvedVarianceQuantity) || approvedVarianceQuantity === 0)
          throw new BadRequestException(
            "Approved signed variance quantity must be a finite non-zero number.",
          );
      }
      break;
    }
    case "COMPLIANCE_RECORD":
      requiredText(details, "recordType", "Compliance record type");
      requiredText(details, "sourceReference", "Source reference");
      requiredText(details, "evidenceReference", "Evidence reference");
      break;
    case "RECALL_DRILL":
      requiredText(details, "scope", "Recall scope");
      requiredText(details, "traceCriteria", "Trace criteria");
      requiredText(details, "outcome", "Recall outcome");
      requiredText(details, "evidenceReference", "Evidence reference");
      break;
    case "DATA_RETENTION_POLICY":
      requiredText(details, "recordType", "Record type");
      requiredPositiveNumber(details, "retentionYears", "Retention years");
      requiredText(details, "archiveMethod", "Archive method");
      break;
    case "VALIDATION_DOCUMENT": {
      const documentType = requiredText(
        details,
        "documentType",
        "Validation document type",
      );
      if (
        !(VALIDATION_DOCUMENT_TYPES as readonly string[]).includes(documentType)
      ) {
        throw new BadRequestException("Validation document type is invalid.");
      }
      requiredText(details, "documentNumber", "Document number");
      requiredText(details, "documentVersion", "Document version");
      requiredText(details, "ownerReference", "Owner reference");
      requiredText(details, "evidenceReference", "Evidence reference");
      if (documentType === "TRAINING_RECORD") {
        requiredText(details, "subjectUserId", "Qualified workspace user");
        requiredText(details, "qualificationScope", "Qualification scope");
        const outcome = requiredText(
          details,
          "qualificationOutcome",
          "Qualification outcome",
        );
        if (!["QUALIFIED", "NOT_QUALIFIED", "EXPIRED"].includes(outcome)) {
          throw new BadRequestException(
            "Qualification outcome must be QUALIFIED, NOT_QUALIFIED or EXPIRED.",
          );
        }
      }
      break;
    }
    case "AUDIT_EVIDENCE_PACK":
      requiredText(details, "scope", "Evidence-pack scope");
      requiredText(details, "periodFrom", "Period from");
      requiredText(details, "periodTo", "Period to");
      requiredText(details, "evidenceReference", "Evidence reference");
      requiredArray(details, "attachments", "Evidence attachments");
      break;
    case "EXECUTION_EVIDENCE":
      requiredText(details, "orderId", "Production order");
      requiredText(details, "recordType", "Execution record type");
      requiredArray(details, "entries", "Execution entries");
      requiredText(details, "evidenceReference", "Evidence reference");
      break;
  }
}

@Injectable()
export class ManufacturingGovernanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ManufacturingElectronicSignatureService)
    private readonly electronicSignature: ManufacturingElectronicSignatureService,
  ) {}

  private async scope(
    currentUser: AuthenticatedRequestUser,
    requestedWorkspaceId?: string,
  ): Promise<Scope> {
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

  private async requirePermission(
    currentUser: AuthenticatedRequestUser,
    key: string,
  ) {
    const granted = await this.permissions.getGrantedKeys(currentUser);
    if (!granted.has(key))
      throw new ForbiddenException(`Permission required: ${key}`);
  }

  private permissionForKind(kind: ManufacturingGovernanceKind): string {
    if (QUALITY_KINDS.has(kind)) return "manufacturing.quality.manage";
    if (AUDIT_KINDS.has(kind)) return "manufacturing.audit.review";
    if (kind === "EXECUTION_EVIDENCE")
      return "manufacturing.production.execute";
    if (kind === "TOOLS_DIES_MOULDS") return "manufacturing.master.manage";
    return "manufacturing.configure";
  }

  private async assertPeriodOpen(db: Db, workspaceId: string, when: Date) {
    const period = await db.manufacturingPeriod.findUnique({
      where: {
        workspaceId_periodYear_periodMonth: {
          workspaceId,
          periodYear: when.getUTCFullYear(),
          periodMonth: when.getUTCMonth() + 1,
        },
      },
      select: { periodYear: true, periodMonth: true, status: true },
    });
    if (period && period.status !== "OPEN") {
      throw new BadRequestException(
        `Manufacturing period ${period.periodYear}-${String(period.periodMonth).padStart(2, "0")} is ${period.status}.`,
      );
    }
  }

  private async assertExecutionEvidenceOrder(
    db: Db,
    workspaceId: string,
    kind: ManufacturingGovernanceKind,
    details: Record<string, unknown>,
  ) {
    if (kind !== "EXECUTION_EVIDENCE") return;
    const orderId = requiredText(details, "orderId", "Production order");
    const order = await db.manufacturingOrder.findFirst({
      where: { id: orderId, workspaceId },
      select: { id: true },
    });
    if (!order) {
      throw new BadRequestException(
        "Execution evidence must reference an existing production order in the active workspace.",
      );
    }
  }

  private async assertTrainingRecordSubject(
    db: Db,
    workspaceId: string,
    kind: ManufacturingGovernanceKind,
    details: Record<string, unknown>,
  ) {
    if (
      kind !== "VALIDATION_DOCUMENT" ||
      cleanText(details.documentType) !== "TRAINING_RECORD"
    ) {
      return;
    }
    const subjectUserId = requiredText(
      details,
      "subjectUserId",
      "Qualified workspace user",
    );
    const member = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: subjectUserId },
      },
      select: { id: true },
    });
    if (!member) {
      throw new BadRequestException(
        "The qualified user must be a current member of this workspace.",
      );
    }
  }

  private recordDetails(payload: Prisma.JsonValue): Record<string, unknown> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new BadRequestException("Controlled-record payload is invalid.");
    }
    const details = (payload as Record<string, unknown>).details;
    if (!details || typeof details !== "object" || Array.isArray(details)) {
      throw new BadRequestException("Controlled-record details are invalid.");
    }
    return details as Record<string, unknown>;
  }

  private async resolveQualityCaseLinks(
    db: Db,
    workspaceId: string,
    kind: ManufacturingGovernanceKind,
    details: Record<string, unknown>,
  ): Promise<{
    details: Record<string, unknown>;
    inventoryItemId: string | null;
  }> {
    if (kind !== "QUALITY_CASE") {
      return { details, inventoryItemId: null };
    }
    const orderId = cleanText(details.orderId);
    const productionOrderId = cleanText(details.productionOrderId);
    if (orderId && productionOrderId && orderId !== productionOrderId) {
      throw new BadRequestException(
        "Quality case orderId and productionOrderId must reference the same production order.",
      );
    }
    const linkedOrderId = orderId ?? productionOrderId;
    const requestedInventoryItemId = cleanText(details.inventoryItemId);
    let order: { id: string; finishedProductId: string } | null = null;
    if (linkedOrderId) {
      order = await db.manufacturingOrder.findFirst({
        where: { id: linkedOrderId, workspaceId },
        select: { id: true, finishedProductId: true },
      });
      if (!order) {
        throw new BadRequestException(
          "Quality case must reference an existing production order in the active workspace.",
        );
      }
    }
    if (requestedInventoryItemId) {
      const item = await db.inventoryItem.findFirst({
        where: { id: requestedInventoryItemId, workspaceId },
        select: { id: true },
      });
      if (!item) {
        throw new BadRequestException(
          "Quality case must reference an existing inventory item in the active workspace.",
        );
      }
    }
    const orderMaterialId = cleanText(details.orderMaterialId);
    if (orderMaterialId) {
      if (!linkedOrderId || !requestedInventoryItemId) {
        throw new BadRequestException(
          "Material variance evidence must link its production order and inventory item.",
        );
      }
      const material = await db.manufacturingOrderMaterial.findFirst({
        where: {
          id: orderMaterialId,
          orderId: linkedOrderId,
          inventoryItemId: requestedInventoryItemId,
          order: { workspaceId },
        },
        select: { id: true, unit: true },
      });
      if (!material)
        throw new BadRequestException(
          "Material variance evidence must reference an exact material row on the linked production order.",
        );
      if (cleanText(details.approvedVarianceUnit) !== material.unit)
        throw new BadRequestException(
          "Approved variance unit must exactly match the production-order material unit.",
        );
    }
    const inventoryItemId =
      requestedInventoryItemId ?? order?.finishedProductId ?? null;
    if (!linkedOrderId && !inventoryItemId) {
      throw new BadRequestException(
        "Quality case must link an existing production order or inventory item.",
      );
    }
    return {
      inventoryItemId,
      details: {
        ...details,
        ...(linkedOrderId
          ? { orderId: linkedOrderId, productionOrderId: linkedOrderId }
          : {}),
        ...(inventoryItemId ? { inventoryItemId } : {}),
      },
    };
  }

  private async createAudit(
    tx: Prisma.TransactionClient,
    scope: Scope,
    user: AuthenticatedRequestUser,
    input: {
      action: string;
      entityId: string;
      kind: ManufacturingGovernanceKind;
      when: Date;
      idempotencyKey: string;
      title: string;
      reason?: string | null;
      signatureMeaning?: string | null;
      oldValues?: Prisma.InputJsonValue;
      newValues?: Prisma.InputJsonValue;
    },
  ) {
    const signature = cleanText(input.signatureMeaning);
    await tx.manufacturingWorkflowReview.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        workflowGroup: "GOVERNANCE_COMPLIANCE",
        workflowCode: input.action,
        entityType: `MANUFACTURING_${input.kind}`,
        entityId: input.entityId,
        transactionDate: input.when,
        idempotencyKey: input.idempotencyKey,
        title: input.title,
        outcome: "EXECUTED",
        status: signature ? "APPROVED" : "REVIEWED",
        reason: cleanText(input.reason),
        evidence: {
          kind: input.kind,
          oldValues: input.oldValues ?? null,
          newValues: input.newValues ?? null,
          signatureMeaning: signature,
        },
        signatureHash: signature
          ? signatureHash([
              scope.id,
              input.action,
              input.entityId,
              user.id,
              input.when.toISOString(),
              input.idempotencyKey,
              signature,
            ])
          : null,
        reviewedByUserId: signature ? null : user.id,
        reviewedAt: signature ? null : input.when,
        approvedByUserId: signature ? user.id : null,
        approvedAt: signature ? input.when : null,
        createdByUserId: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        organizationId: user.organizationId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        userId: user.id,
        action: input.action,
        entityType: `MANUFACTURING_${input.kind}`,
        entityId: input.entityId,
        oldValues: input.oldValues,
        newValues: input.newValues,
      },
    });
  }

  private payload(
    details: Record<string, unknown>,
    revisionReason?: string | null,
  ): Prisma.InputJsonObject {
    const normalizedDetails: Record<string, unknown> = { ...details };
    if (
      Object.prototype.hasOwnProperty.call(normalizedDetails, "attachments")
    ) {
      normalizedDetails.attachments = normalizeManufacturingEvidenceAttachments(
        normalizedDetails.attachments,
      );
    }
    const safeDetails = sanitizeManufacturingGovernanceJson(
      normalizedDetails,
    ) as Prisma.InputJsonObject;
    return {
      schemaVersion: 1,
      details: safeDetails,
      evidenceHash: manufacturingGovernanceEvidenceHash(safeDetails),
      revisionReason: cleanText(revisionReason),
    };
  }

  async listRecords(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const kind = query.kind;
    if (kind && !isGovernanceKind(kind))
      throw new BadRequestException("Invalid governance record kind.");
    const statuses = ["DRAFT", "APPROVED", "RETIRED", "CANCELLED"] as const;
    if (query.status && !(statuses as readonly string[]).includes(query.status))
      throw new BadRequestException("Invalid record status.");
    return this.prisma.manufacturingControlRecord.findMany({
      where: {
        workspaceId: scope.id,
        kind: kind
          ? (kind as ManufacturingControlRecordKind)
          : {
              in: [
                ...MANUFACTURING_GOVERNANCE_KINDS,
              ] as ManufacturingControlRecordKind[],
            },
        ...(query.status
          ? { status: query.status as (typeof statuses)[number] }
          : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" } },
                { name: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ kind: "asc" }, { code: "asc" }, { versionNumber: "desc" }],
    });
  }

  async getRecord(
    currentUser: AuthenticatedRequestUser,
    recordId: string,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    const record = await this.prisma.manufacturingControlRecord.findFirst({
      where: {
        id: recordId,
        workspaceId: scope.id,
        kind: {
          in: [
            ...MANUFACTURING_GOVERNANCE_KINDS,
          ] as ManufacturingControlRecordKind[],
        },
      },
    });
    if (!record) throw new NotFoundException("Governance record not found.");
    const source = record.sourceRecordId
      ? await this.prisma.manufacturingControlRecord.findFirst({
          where: { id: record.sourceRecordId, workspaceId: scope.id },
        })
      : null;
    return {
      ...record,
      source,
      diff: source ? this.diff(source.payload, record.payload) : [],
    };
  }

  async createRecord(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingGovernanceRecordDto,
  ) {
    await this.requirePermission(currentUser, this.permissionForKind(dto.kind));
    const scope = await this.scope(currentUser, dto.workspaceId);
    validateManufacturingGovernanceDetails(dto.kind, dto.details);
    await this.assertTrainingRecordSubject(
      this.prisma,
      scope.id,
      dto.kind,
      dto.details,
    );
    await this.assertExecutionEvidenceOrder(
      this.prisma,
      scope.id,
      dto.kind,
      dto.details,
    );
    const qualityCaseLinks = await this.resolveQualityCaseLinks(
      this.prisma,
      scope.id,
      dto.kind,
      dto.details,
    );
    const when = asDate(dto.transactionDate, "transactionDate");
    const effectiveFrom = optionalDate(dto.effectiveFrom, "effectiveFrom");
    const effectiveTo = optionalDate(dto.effectiveTo, "effectiveTo");
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom)
      throw new BadRequestException(
        "Effective-to cannot be before effective-from.",
      );
    await this.assertPeriodOpen(this.prisma, scope.id, when);
    const replay = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (replay) {
      if (
        replay.workflowCode !== "GOVERNANCE_RECORD_CREATE" ||
        replay.entityType !== `MANUFACTURING_${dto.kind}`
      ) {
        throw new ConflictException(
          "Idempotency key is already used for another manufacturing action.",
        );
      }
      return {
        record: await this.getRecord(currentUser, replay.entityId!, scope.id),
        replayed: true,
      };
    }
    const code = normalizeCode(dto.code);
    const payload = this.payload(qualityCaseLinks.details);
    try {
      const record = await this.prisma.$transaction(
        async (tx) => {
          await this.assertPeriodOpen(tx, scope.id, when);
          const latest = await tx.manufacturingControlRecord.findFirst({
            where: {
              workspaceId: scope.id,
              kind: dto.kind as ManufacturingControlRecordKind,
              code,
            },
            orderBy: { versionNumber: "desc" },
          });
          if (latest?.status === "DRAFT")
            throw new ConflictException(
              "A draft version already exists for this code.",
            );
          if (latest)
            throw new ConflictException(
              "Use Create revision for an existing controlled-record code.",
            );
          const created = await tx.manufacturingControlRecord.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              kind: dto.kind as ManufacturingControlRecordKind,
              code,
              name: dto.name.trim(),
              effectiveFrom,
              effectiveTo,
              inventoryItemId: qualityCaseLinks.inventoryItemId,
              payload,
              createdByUserId: currentUser.id,
            },
          });
          await this.createAudit(tx, scope, currentUser, {
            action: "GOVERNANCE_RECORD_CREATE",
            entityId: created.id,
            kind: dto.kind,
            when,
            idempotencyKey: dto.idempotencyKey,
            title: `Create ${dto.kind.toLowerCase().replaceAll("_", " ")} ${created.code} v1`,
            reason: dto.note,
            newValues: payload,
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { record, replayed: false };
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "The record code, version or idempotency key already exists.",
        );
      throw error;
    }
  }

  async reviseRecord(
    currentUser: AuthenticatedRequestUser,
    recordId: string,
    dto: ReviseManufacturingGovernanceRecordDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const source = await this.prisma.manufacturingControlRecord.findFirst({
      where: { id: recordId, workspaceId: scope.id },
    });
    const sourceKind = source?.kind;
    if (!source || !isGovernanceKind(sourceKind))
      throw new NotFoundException("Governance record not found.");
    await this.requirePermission(
      currentUser,
      this.permissionForKind(sourceKind),
    );
    const replay = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (replay) {
      if (
        replay.workflowCode !== "GOVERNANCE_RECORD_REVISE" ||
        replay.entityType !== `MANUFACTURING_${sourceKind}` ||
        !replay.entityId
      ) {
        throw new ConflictException(
          "Idempotency key is already used for another manufacturing action.",
        );
      }
      return {
        record: await this.getRecord(currentUser, replay.entityId, scope.id),
        replayed: true,
      };
    }
    if (!["APPROVED", "RETIRED", "CANCELLED"].includes(source.status)) {
      throw new BadRequestException(
        "Only an approved, retired or cancelled record can start a new revision.",
      );
    }
    validateManufacturingGovernanceDetails(sourceKind, dto.details);
    await this.assertTrainingRecordSubject(
      this.prisma,
      scope.id,
      sourceKind,
      dto.details,
    );
    await this.assertExecutionEvidenceOrder(
      this.prisma,
      scope.id,
      sourceKind,
      dto.details,
    );
    const qualityCaseLinks = await this.resolveQualityCaseLinks(
      this.prisma,
      scope.id,
      sourceKind,
      dto.details,
    );
    const when = asDate(dto.transactionDate, "transactionDate");
    await this.assertPeriodOpen(this.prisma, scope.id, when);
    const effectiveFrom = optionalDate(dto.effectiveFrom, "effectiveFrom");
    const effectiveTo = optionalDate(dto.effectiveTo, "effectiveTo");
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom)
      throw new BadRequestException(
        "Effective-to cannot be before effective-from.",
      );
    const payload = this.payload(qualityCaseLinks.details, dto.reason);
    try {
      const record = await this.prisma.$transaction(
        async (tx) => {
          await this.assertPeriodOpen(tx, scope.id, when);
          const latest = await tx.manufacturingControlRecord.findFirst({
            where: {
              workspaceId: scope.id,
              kind: sourceKind,
              code: source.code,
            },
            orderBy: { versionNumber: "desc" },
          });
          if (!latest || latest.id !== source.id)
            throw new ConflictException(
              "A newer version already exists. Refresh before revising.",
            );
          const created = await tx.manufacturingControlRecord.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              kind: sourceKind,
              code: source.code,
              name: dto.name.trim(),
              versionNumber: source.versionNumber + 1,
              sourceRecordId: source.id,
              effectiveFrom,
              effectiveTo,
              inventoryItemId: qualityCaseLinks.inventoryItemId,
              payload,
              createdByUserId: currentUser.id,
            },
          });
          await this.createAudit(tx, scope, currentUser, {
            action: "GOVERNANCE_RECORD_REVISE",
            entityId: created.id,
            kind: sourceKind,
            when,
            idempotencyKey: dto.idempotencyKey,
            title: `Revise ${sourceKind.toLowerCase().replaceAll("_", " ")} ${source.code} to v${created.versionNumber}`,
            reason: dto.reason,
            oldValues: sanitizeManufacturingGovernanceJson(
              source.payload,
            ) as Prisma.InputJsonValue,
            newValues: payload,
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { record, replayed: false };
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "The revision or idempotency key already exists.",
        );
      throw error;
    }
  }

  async transitionRecord(
    currentUser: AuthenticatedRequestUser,
    recordId: string,
    dto: TransitionManufacturingGovernanceRecordDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const current = await this.prisma.manufacturingControlRecord.findFirst({
      where: { id: recordId, workspaceId: scope.id },
    });
    const currentKind = current?.kind;
    if (!current || !isGovernanceKind(currentKind))
      throw new NotFoundException("Governance record not found.");
    await this.requirePermission(
      currentUser,
      this.permissionForKind(currentKind),
    );
    await this.requirePermission(currentUser, "manufacturing.audit.review");
    const expected =
      dto.action === "APPROVE"
        ? "DRAFT"
        : dto.action === "RETIRE"
          ? "APPROVED"
          : "DRAFT";
    const target =
      dto.action === "APPROVE"
        ? "APPROVED"
        : dto.action === "RETIRE"
          ? "RETIRED"
          : "CANCELLED";
    if (current.status !== expected)
      throw new BadRequestException(
        `${dto.action} requires a ${expected.toLowerCase()} record.`,
      );
    const when = asDate(dto.transactionDate, "transactionDate");
    await this.assertPeriodOpen(this.prisma, scope.id, when);
    const replay = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (replay) {
      if (
        replay.entityId !== recordId ||
        replay.workflowCode !== `GOVERNANCE_RECORD_${dto.action}`
      ) {
        throw new ConflictException(
          "Idempotency key is already used for another manufacturing action.",
        );
      }
      return {
        record: await this.getRecord(currentUser, recordId, scope.id),
        replayed: true,
      };
    }
    const record = await this.prisma.$transaction(
      async (tx) => {
        await this.assertPeriodOpen(tx, scope.id, when);
        const locked = await tx.manufacturingControlRecord.findFirst({
          where: { id: recordId, workspaceId: scope.id },
        });
        if (!locked || locked.status !== expected)
          throw new ConflictException(
            "Record state changed. Refresh and try again.",
          );
        if (dto.action === "APPROVE") {
          const lockedKind = locked.kind;
          if (!isGovernanceKind(lockedKind)) {
            throw new BadRequestException(
              "Controlled-record kind is not supported.",
            );
          }
          await this.assertTrainingRecordSubject(
            tx,
            scope.id,
            lockedKind,
            this.recordDetails(locked.payload),
          );
        }
        const settings = await tx.manufacturingSettings.findUnique({
          where: { workspaceId: scope.id },
          select: { approvalRequired: true, electronicSignatureRequired: true },
        });
        if (
          dto.action === "APPROVE" &&
          settings?.approvalRequired &&
          locked.createdByUserId === currentUser.id
        ) {
          throw new ForbiddenException(
            "Maker-checker is enabled; the creator cannot approve this record.",
          );
        }
        if (
          settings?.electronicSignatureRequired &&
          !dto.signatureMeaning.trim()
        ) {
          throw new BadRequestException(
            "Electronic-signature meaning is required.",
          );
        }
        if (
          dto.action === "APPROVE" &&
          locked.kind === "ELECTRONIC_SIGNATURE_POLICY"
        ) {
          const candidatePolicy = parseManufacturingElectronicSignaturePolicy(
            locked.payload,
          );
          if (candidatePolicy?.mfaRequired) {
            throw new BadRequestException(
              "This electronic-signature policy cannot be approved because it requires MFA and manufacturing MFA verification is not configured.",
            );
          }
        }
        const electronicSignatureEvidence =
          await this.electronicSignature.enforce(tx, {
            scope,
            user: currentUser,
            actionLabel: `${dto.action.toLowerCase()} governance record ${locked.code}`,
            signatureMeaning: dto.signatureMeaning,
            reauthenticationPassword: dto.reauthenticationPassword,
            required: Boolean(settings?.electronicSignatureRequired),
          });
        if (dto.action === "APPROVE") {
          await tx.manufacturingControlRecord.updateMany({
            where: {
              workspaceId: scope.id,
              kind: locked.kind,
              code: locked.code,
              status: "APPROVED",
              id: { not: locked.id },
            },
            data: { status: "RETIRED", retiredAt: when },
          });
        }
        const updated = await tx.manufacturingControlRecord.update({
          where: { id: locked.id },
          data: {
            status: target,
            ...(dto.action === "APPROVE"
              ? { approvedByUserId: currentUser.id, approvedAt: when }
              : {}),
            ...(dto.action === "RETIRE" ? { retiredAt: when } : {}),
          },
        });
        await this.createAudit(tx, scope, currentUser, {
          action: `GOVERNANCE_RECORD_${dto.action}`,
          entityId: updated.id,
          kind: currentKind,
          when,
          idempotencyKey: dto.idempotencyKey,
          title: `${dto.action[0]}${dto.action.slice(1).toLowerCase()} ${current.kind.toLowerCase().replaceAll("_", " ")} ${current.code} v${current.versionNumber}`,
          reason: dto.reason,
          signatureMeaning: dto.signatureMeaning,
          oldValues: { status: locked.status },
          newValues: {
            status: target,
            electronicSignaturePolicy: electronicSignatureEvidence,
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { record, replayed: false };
  }

  async recordControlledPrint(
    currentUser: AuthenticatedRequestUser,
    dto: RecordManufacturingControlledPrintDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.requirePermission(currentUser, "manufacturing.audit.review");
    const record = await this.prisma.manufacturingControlRecord.findFirst({
      where: { id: dto.recordId, workspaceId: scope.id },
    });
    const recordKind = record?.kind;
    if (!record || !isGovernanceKind(recordKind))
      throw new NotFoundException("Governance record not found.");
    const replay = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (replay) {
      if (
        replay.workflowCode !== "GOVERNANCE_CONTROLLED_PRINT" ||
        replay.entityId !== record.id
      ) {
        throw new ConflictException(
          "Idempotency key is already used for another manufacturing action.",
        );
      }
      const watermark =
        dto.copyType === "CONTROLLED" ? "CONTROLLED COPY" : "UNCONTROLLED COPY";
      return {
        documentNumber: record.code,
        version: record.versionNumber,
        printedBy: currentUser.name,
        printedAt: replay.createdAt.toISOString(),
        copyNumber: dto.copyNumber,
        watermark,
        recordId: record.id,
        replayed: true,
      };
    }
    if (record.status !== "APPROVED")
      throw new BadRequestException(
        "Only an approved governance record can be printed as a controlled copy.",
      );
    const when = asDate(dto.transactionDate, "transactionDate");
    await this.assertPeriodOpen(this.prisma, scope.id, when);
    const watermark =
      dto.copyType === "CONTROLLED" ? "CONTROLLED COPY" : "UNCONTROLLED COPY";
    await this.prisma.$transaction(async (tx) => {
      const settings = await tx.manufacturingSettings.findUnique({
        where: { workspaceId: scope.id },
        select: { electronicSignatureRequired: true },
      });
      const electronicSignatureEvidence =
        await this.electronicSignature.enforce(tx, {
          scope,
          user: currentUser,
          actionLabel: `controlled print ${record.code}`,
          signatureMeaning: dto.signatureMeaning,
          reauthenticationPassword: dto.reauthenticationPassword,
          required: Boolean(settings?.electronicSignatureRequired),
        });
      await this.createAudit(tx, scope, currentUser, {
        action: "GOVERNANCE_CONTROLLED_PRINT",
        entityId: record.id,
        kind: recordKind,
        when,
        idempotencyKey: dto.idempotencyKey,
        title: `Print ${watermark.toLowerCase()} ${record.code} v${record.versionNumber}`,
        reason: dto.reason,
        signatureMeaning: dto.signatureMeaning,
        newValues: {
          copyNumber: dto.copyNumber,
          copyType: dto.copyType,
          watermark,
          electronicSignaturePolicy: electronicSignatureEvidence,
        },
      });
    });
    return {
      documentNumber: record.code,
      version: record.versionNumber,
      printedBy: currentUser.name,
      printedAt: when.toISOString(),
      copyNumber: dto.copyNumber,
      watermark,
      recordId: record.id,
      replayed: false,
    };
  }

  async listAuditTrail(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    await this.requirePermission(currentUser, "manufacturing.audit.review");
    const take = Math.min(Math.max(Number(query.take) || 100, 1), 500);
    const [auditLogs, reviews] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          workspaceId: scope.id,
          entityType: { startsWith: "MANUFACTURING_" },
          ...(query.entityId ? { entityId: query.entityId } : {}),
          ...(query.action ? { action: query.action } : {}),
        },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take,
      }),
      this.prisma.manufacturingWorkflowReview.findMany({
        where: {
          workspaceId: scope.id,
          ...(query.entityId ? { entityId: query.entityId } : {}),
          ...(query.action ? { workflowCode: query.action } : {}),
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take,
      }),
    ]);
    const events = [
      ...auditLogs.map((row) => ({
        id: `audit:${row.id}`,
        source: "AUDIT_LOG" as const,
        occurredAt: row.createdAt.toISOString(),
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actor: row.user,
        oldValues: row.oldValues,
        newValues: row.newValues,
        signatureHash: null,
      })),
      ...reviews.map((row) => ({
        id: `review:${row.id}`,
        source: "WORKFLOW_REVIEW" as const,
        occurredAt: row.createdAt.toISOString(),
        action: row.workflowCode,
        entityType: row.entityType,
        entityId: row.entityId,
        actor: row.createdBy,
        oldValues: null,
        newValues: row.evidence,
        signatureHash: row.signatureHash,
        reviewedBy: row.reviewedBy,
        approvedBy: row.approvedBy,
      })),
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return {
      events: events.slice(0, take),
      returned: Math.min(events.length, take),
      limit: take,
    };
  }

  async validationReadiness(
    currentUser: AuthenticatedRequestUser,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    const [
      settings,
      approvedBoms,
      approvedRoutings,
      resources,
      sequences,
      openPeriods,
      grouped,
    ] = await Promise.all([
      this.prisma.manufacturingSettings.findUnique({
        where: { workspaceId: scope.id },
      }),
      this.prisma.manufacturingBomVersion.count({
        where: {
          status: "APPROVED",
          bom: { workspaceId: scope.id, isActive: true },
        },
      }),
      this.prisma.manufacturingRoutingVersion.count({
        where: {
          status: "APPROVED",
          routing: { workspaceId: scope.id, isActive: true },
        },
      }),
      this.prisma.manufacturingResource.count({
        where: { workspaceId: scope.id, isActive: true },
      }),
      this.prisma.manufacturingDocumentSequence.count({
        where: { workspaceId: scope.id, isActive: true },
      }),
      this.prisma.manufacturingPeriod.count({
        where: { workspaceId: scope.id, status: "OPEN" },
      }),
      this.prisma.manufacturingControlRecord.groupBy({
        by: ["kind"],
        where: { workspaceId: scope.id, status: "APPROVED" },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map(grouped.map((row) => [row.kind, row._count._all]));
    const pharma =
      settings?.mode === "PHARMACEUTICAL" || settings?.mode === "HYBRID";
    const checks = [
      {
        key: "SETTINGS",
        label: "Manufacturing settings",
        required: true,
        count: settings ? 1 : 0,
      },
      {
        key: "BOM",
        label: "Approved BOM / Master Formula",
        required: true,
        count: approvedBoms,
      },
      {
        key: "ROUTING",
        label: "Approved production routing",
        required: true,
        count: approvedRoutings,
      },
      {
        key: "RESOURCES",
        label: "Work centers, lines or equipment",
        required: true,
        count: resources,
      },
      {
        key: "DOCUMENT_NUMBERING",
        label: "Document numbering",
        required: true,
        count: sequences,
      },
      {
        key: "OPEN_PERIOD",
        label: "Open manufacturing period",
        required: true,
        count: openPeriods,
      },
      {
        key: "APPROVAL_WORKFLOW",
        label: "Approval workflow",
        required: true,
        count: counts.get("APPROVAL_WORKFLOW") ?? 0,
      },
      {
        key: "ELECTRONIC_SIGNATURE_POLICY",
        label: "Electronic signature policy",
        required: pharma,
        count: counts.get("ELECTRONIC_SIGNATURE_POLICY") ?? 0,
      },
      {
        key: "QUALITY_SPECIFICATION",
        label: "Approved quality specifications",
        required: pharma,
        count: counts.get("QUALITY_SPECIFICATION") ?? 0,
      },
      {
        key: "PRINT_TEMPLATE",
        label: "Controlled print templates",
        required: pharma,
        count: counts.get("PRINT_TEMPLATE") ?? 0,
      },
      {
        key: "VALIDATION_DOCUMENT",
        label: "Computer-system validation documents",
        required: pharma,
        count: counts.get("VALIDATION_DOCUMENT") ?? 0,
      },
      {
        key: "DATA_RETENTION_POLICY",
        label: "Data retention and archive policy",
        required: pharma,
        count: counts.get("DATA_RETENTION_POLICY") ?? 0,
      },
    ].map((check) => ({
      ...check,
      state: !check.required
        ? "NOT_REQUIRED"
        : check.count > 0
          ? "READY"
          : "BLOCKED",
    }));
    const required = checks.filter((check) => check.required);
    return {
      workspaceId: scope.id,
      mode: settings?.mode ?? null,
      ready: required.every((check) => check.count > 0),
      readyCount: required.filter((check) => check.count > 0).length,
      requiredCount: required.length,
      checks,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private diff(before: Prisma.JsonValue, after: Prisma.JsonValue) {
    const left =
      before && typeof before === "object" && !Array.isArray(before)
        ? (before as Record<string, unknown>)
        : { value: before };
    const right =
      after && typeof after === "object" && !Array.isArray(after)
        ? (after as Record<string, unknown>)
        : { value: after };
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .filter((key) => canonicalJson(left[key]) !== canonicalJson(right[key]))
      .map((key) => ({
        field: key,
        before: left[key] ?? null,
        after: right[key] ?? null,
      }));
  }
}
