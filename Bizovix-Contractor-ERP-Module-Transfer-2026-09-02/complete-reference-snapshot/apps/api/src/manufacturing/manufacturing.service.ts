import { createHash } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  moneyEquals,
  roundMoneyDecimal,
  toPaisa,
} from "../accounting/money.util.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PermissionsService } from "../common/services/permissions.service.js";
import { Prisma } from "../generated/prisma/index.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { rebuildMovingAverageCosts } from "../inventory/moving-average.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ManufacturingApprovalWorkflowService } from "./manufacturing-approval-workflow.service.js";
import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import { parseManufacturingElectronicSignaturePolicy } from "./manufacturing-electronic-signature.domain.js";
import { calculateResourceCapacity } from "./manufacturing-blueprint.domain.js";
import type { ManufacturingApprovalWorkflowScope } from "./manufacturing-approval-workflow.domain.js";
import { totalActivePlannedMaterialQuantity } from "./manufacturing-material-exceptions.domain.js";
import { resolveApprovedMaterialVariances } from "./manufacturing-material-variance.service.js";
import {
  issueManufacturingDocumentNumberTx,
  manufacturingEntityIdFromIdempotency,
} from "./manufacturing-document-number.js";
import { calculateOrderLevelPackagingLotRequirement } from "./manufacturing-packaging.domain.js";
import {
  evaluateManufacturingPackagingReleasePolicy,
  type ManufacturingPackagingReleasePolicyDecision,
} from "./manufacturing-packaging-release-policy.domain.js";
import {
  allocatePostedMoneyLines,
  aggregateStockRequirements,
  calculateReservationReleasePlan,
  evaluateCloseReadiness,
  evaluatePackagingActuals,
  calculateBomRequirements,
  calculateNetMaterialLotConsumption,
  calculateManufacturingWipBalance,
  countOrdersWithMaterialShortage,
  evaluateQualityRelease,
  evaluateReservationAvailability,
  findUnallocatedLotTrackedReservationMaterials,
  summarizeLotQualityInspections,
} from "./domain.js";
import {
  compileApplicableQualitySpecification,
  evaluateQualitySpecificationResults,
  QualitySpecificationValidationError,
  type ApplicableQualitySpecification,
} from "./quality-specification.js";
import type {
  ApproveManufacturingVersionDto,
  CreateManufacturingBomDto,
  CreateManufacturingBomVersionDto,
  CreateManufacturingOrderDto,
  CreateManufacturingWorkflowReviewDto,
  ManufacturingOrderActionDto,
  TransitionManufacturingWorkflowReviewDto,
  UpdateManufacturingSettingsDto,
} from "./manufacturing.dto.js";
import {
  evaluateOrderActionApprovalControls,
  isApprovalSensitiveOrderAction,
  isOpenQualityCaseLinkedToOrder,
  satisfiesPassedQualityInspectionIndependence,
} from "./manufacturing-order-controls.domain.js";
import {
  ManufacturingUnitConversionError,
  normalizeManufacturingQuantityToBase,
  type ManufacturingUnitConversionEvidence,
  type ManufacturingUnitDefinition,
} from "./manufacturing-uom.domain.js";
import { resolveManufacturingStatusPolicy } from "./manufacturing-status-configuration.domain.js";
import { evaluateOpenReworkDispositions } from "./manufacturing-rework-close.domain.js";

type Db = Prisma.TransactionClient | PrismaService;
type Query = Record<string, string | undefined>;
type ActionKind = ManufacturingOrderActionDto["kind"];

const INVENTORY_CONTROL_ACCOUNT_CODE = "1210001";

const ACTION_PERMISSIONS: Record<ActionKind, string> = {
  SUBMIT: "manufacturing.order.create",
  APPROVE: "manufacturing.order.approve",
  AMEND: "manufacturing.order.create",
  CANCEL: "manufacturing.order.create",
  RESERVE_MATERIALS: "manufacturing.material.reserve",
  RELEASE_RESERVATION: "manufacturing.material.reserve",
  ISSUE_MATERIALS: "manufacturing.material.issue",
  RETURN_MATERIALS: "manufacturing.material.issue",
  PACKAGING_ISSUE: "manufacturing.material.issue",
  PACKAGING_RETURN: "manufacturing.material.issue",
  START_PRODUCTION: "manufacturing.production.execute",
  START_OPERATION: "manufacturing.production.execute",
  PAUSE_PRODUCTION: "manufacturing.production.execute",
  RESUME_PRODUCTION: "manufacturing.production.execute",
  COMPLETE_OPERATION: "manufacturing.production.execute",
  POST_SCRAP_DISPOSITION: "manufacturing.production.execute",
  CREATE_REWORK_DISPOSITION: "manufacturing.order.create",
  COMPLETE_PRODUCTION: "manufacturing.production.execute",
  PLACE_QC_HOLD: "manufacturing.quality.inspect",
  RECORD_IN_PROCESS_RESULT: "manufacturing.quality.inspect",
  RECORD_QUALITY_RESULT: "manufacturing.quality.inspect",
  QA_RELEASE: "manufacturing.quality.release",
  POST_PRODUCTION_RECEIPT: "manufacturing.cost.post",
  CLOSE: "manufacturing.close",
};

const STAGED_ACTION_SCOPES: Partial<
  Record<ActionKind, ManufacturingApprovalWorkflowScope>
> = {
  ISSUE_MATERIALS: "MATERIAL_ISSUE",
  COMPLETE_PRODUCTION: "PRODUCTION_COMPLETION",
  RECORD_IN_PROCESS_RESULT: "QUALITY_RESULT",
  RECORD_QUALITY_RESULT: "QUALITY_RESULT",
  QA_RELEASE: "FINAL_RELEASE",
};

const ACTIVE_RESERVATIONS = ["ACTIVE", "PARTIALLY_ISSUED"] as const;
const ACTIVE_ORDER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "RESERVED",
  "ISSUED",
  "IN_PRODUCTION",
  "QC_HOLD",
  "QA_RELEASED",
  "COMPLETED",
] as const;

function decimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

function number(value: Prisma.Decimal.Value | null | undefined) {
  return decimal(value).toNumber();
}

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function dateOnly(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function asDate(value: string, label = "date") {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new BadRequestException(`${label} is invalid.`);
  return parsed;
}

function assertWithinBomEffectiveWindow(
  value: Date,
  version: { effectiveFrom?: Date | null; effectiveTo?: Date | null },
  label: string,
  effectiveSubject = "BOM",
) {
  const day = value.toISOString().slice(0, 10);
  const effectiveFrom = dateOnly(version.effectiveFrom);
  const effectiveTo = dateOnly(version.effectiveTo);
  if (effectiveFrom && day < effectiveFrom)
    throw new BadRequestException(
      `${label} cannot be before the ${effectiveSubject} effective-from date (${effectiveFrom}).`,
    );
  if (effectiveTo && day > effectiveTo)
    throw new BadRequestException(
      `${label} cannot be after the ${effectiveSubject} effective-to date (${effectiveTo}).`,
    );
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function quantityDecimal(
  value: unknown,
  label: string,
  options?: { allowZero?: boolean },
) {
  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(value as Prisma.Decimal.Value);
  } catch {
    throw new BadRequestException(`${label} must be a valid quantity.`);
  }
  if (
    !parsed.isFinite() ||
    parsed.isNegative() ||
    (!options?.allowZero && parsed.isZero())
  ) {
    throw new BadRequestException(
      `${label} must be ${options?.allowZero ? "zero or greater" : "greater than zero"}.`,
    );
  }
  const normalized = parsed.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  if (!parsed.equals(normalized))
    throw new BadRequestException(
      `${label} cannot contain more than four decimal places.`,
    );
  return normalized;
}

function manufacturingBaseQuantity(
  item: ManufacturingUnitDefinition,
  value: Prisma.Decimal.Value,
  unit: string,
  label: string,
  maximumDecimalPlaces: number,
  allowZero = false,
) {
  try {
    const normalized = normalizeManufacturingQuantityToBase(item, value, unit);
    if (
      normalized.quantity.isNegative() ||
      (!allowZero && normalized.quantity.isZero())
    )
      throw new ManufacturingUnitConversionError(
        `${label} must be ${allowZero ? "zero or greater" : "greater than zero"}.`,
      );
    const stored = normalized.quantity.toDecimalPlaces(
      maximumDecimalPlaces,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    if (
      normalized.evidence.direction === "BASE_TO_BASE" &&
      !stored.equals(normalized.quantity)
    ) {
      throw new ManufacturingUnitConversionError(
        `${label} cannot contain more than ${maximumDecimalPlaces} decimal places.`,
      );
    }
    if (!allowZero && stored.isZero())
      throw new ManufacturingUnitConversionError(
        `${label} converts below the minimum ${maximumDecimalPlaces}-decimal stock precision.`,
      );
    return {
      ...normalized,
      quantity: stored,
      evidence: {
        ...normalized.evidence,
        storedQuantity: stored.toString(),
        storageDecimalPlaces: maximumDecimalPlaces,
        storageRoundingMode: "ROUND_HALF_UP" as const,
        storageRoundingApplied: !stored.equals(normalized.quantity),
      },
    };
  } catch (error) {
    if (error instanceof ManufacturingUnitConversionError)
      throw new BadRequestException(error.message);
    throw error;
  }
}

function stringArray(value: unknown, label: string) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new BadRequestException(`${label} must be an array of strings.`);
  }
  return value.map((entry) => entry.trim());
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function actionEvidence(value: unknown) {
  const evidence = jsonObject(value);
  const statusConfigurationPolicy = jsonObject(
    evidence.statusConfigurationPolicy,
  );
  return {
    kind: typeof evidence.kind === "string" ? evidence.kind : null,
    fromStatus:
      typeof evidence.fromStatus === "string" ? evidence.fromStatus : null,
    toStatus: typeof evidence.toStatus === "string" ? evidence.toStatus : null,
    transactionIds: Array.isArray(evidence.transactionIds)
      ? evidence.transactionIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    stockMovementIds: Array.isArray(evidence.stockMovementIds)
      ? evidence.stockMovementIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    signatureMeaning:
      typeof evidence.signatureMeaning === "string"
        ? evidence.signatureMeaning
        : null,
    signatureHash:
      typeof evidence.signatureHash === "string"
        ? evidence.signatureHash
        : null,
    actionApprovalEntityId:
      typeof evidence.actionApprovalEntityId === "string"
        ? evidence.actionApprovalEntityId
        : null,
    stagePermission:
      typeof evidence.stagePermission === "string"
        ? evidence.stagePermission
        : null,
    statusConfigurationPermission:
      typeof statusConfigurationPolicy.permissionKey === "string"
        ? statusConfigurationPolicy.permissionKey
        : null,
    approvalProgress:
      typeof evidence.totalStages === "number"
        ? {
            totalStages: evidence.totalStages,
            completedStages:
              typeof evidence.completedStages === "number"
                ? evidence.completedStages
                : 0,
            nextStage:
              typeof evidence.nextStage === "number"
                ? evidence.nextStage
                : null,
            complete: evidence.complete === true,
            workflowCode:
              typeof evidence.workflowCode === "string"
                ? evidence.workflowCode
                : null,
          }
        : null,
  };
}

const ORDER_AMENDMENT_FIELDS = new Set([
  "plannedQuantity",
  "plannedStartDate",
  "plannedEndDate",
  "priority",
  "notes",
]);

type OrderAmendment = {
  plannedQuantity: Prisma.Decimal;
  plannedStartDate: Date;
  plannedEndDate: Date;
  priority: number;
  notes: string | null;
};

function parseOrderAmendment(
  payload: Record<string, unknown>,
  order: {
    plannedQuantity: Prisma.Decimal.Value;
    plannedStartDate: Date | null;
    plannedEndDate: Date | null;
    priority: number;
    notes: string | null;
  },
): OrderAmendment {
  const keys = Object.keys(payload);
  if (!keys.length)
    throw new BadRequestException(
      "AMEND requires at least one payload field: plannedQuantity, plannedStartDate, plannedEndDate, priority or notes.",
    );
  const unsupported = keys.filter((key) => !ORDER_AMENDMENT_FIELDS.has(key));
  if (unsupported.length)
    throw new BadRequestException(
      `Unsupported AMEND payload field(s): ${unsupported.join(", ")}.`,
    );

  const has = (key: string) => Object.hasOwn(payload, key);
  let plannedQuantity = decimal(order.plannedQuantity);
  if (has("plannedQuantity")) {
    if (typeof payload.plannedQuantity !== "number")
      throw new BadRequestException(
        "AMEND payload.plannedQuantity must be a number greater than zero.",
      );
    plannedQuantity = quantityDecimal(
      payload.plannedQuantity,
      "AMEND payload.plannedQuantity",
    );
  }

  const currentStart = order.plannedStartDate;
  const currentEnd = order.plannedEndDate;
  if (!currentStart || !currentEnd)
    throw new BadRequestException(
      "The production order is missing its planned dates and cannot be amended safely.",
    );
  let plannedStartDate = currentStart;
  let plannedEndDate = currentEnd;
  if (has("plannedStartDate")) {
    if (typeof payload.plannedStartDate !== "string")
      throw new BadRequestException(
        "AMEND payload.plannedStartDate must be a valid ISO date string.",
      );
    plannedStartDate = asDate(
      payload.plannedStartDate,
      "AMEND payload.plannedStartDate",
    );
  }
  if (has("plannedEndDate")) {
    if (typeof payload.plannedEndDate !== "string")
      throw new BadRequestException(
        "AMEND payload.plannedEndDate must be a valid ISO date string.",
      );
    plannedEndDate = asDate(
      payload.plannedEndDate,
      "AMEND payload.plannedEndDate",
    );
  }
  if (plannedEndDate.getTime() < plannedStartDate.getTime())
    throw new BadRequestException(
      "AMEND plannedEndDate cannot be earlier than plannedStartDate.",
    );

  let priority = order.priority;
  if (has("priority")) {
    if (
      typeof payload.priority !== "number" ||
      !Number.isInteger(payload.priority) ||
      payload.priority < 0 ||
      payload.priority > 9999
    ) {
      throw new BadRequestException(
        "AMEND payload.priority must be an integer from 0 to 9999.",
      );
    }
    priority = payload.priority;
  }

  let notes = order.notes;
  if (has("notes")) {
    if (payload.notes !== null && typeof payload.notes !== "string")
      throw new BadRequestException(
        "AMEND payload.notes must be a string or null.",
      );
    if (typeof payload.notes === "string" && payload.notes.length > 5000)
      throw new BadRequestException(
        "AMEND payload.notes cannot exceed 5000 characters.",
      );
    notes = text(payload.notes);
  }

  const changed =
    !plannedQuantity.equals(order.plannedQuantity) ||
    plannedStartDate.getTime() !== currentStart.getTime() ||
    plannedEndDate.getTime() !== currentEnd.getTime() ||
    priority !== order.priority ||
    notes !== order.notes;
  if (!changed)
    throw new BadRequestException(
      "AMEND payload does not change any production-order field.",
    );

  return {
    plannedQuantity,
    plannedStartDate,
    plannedEndDate,
    priority,
    notes,
  };
}

function scaleOrderLotQuantities(
  lots: Array<{ id: string; plannedQuantity: Prisma.Decimal.Value }>,
  newTotal: Prisma.Decimal,
) {
  if (!lots.length)
    throw new BadRequestException(
      "The production order has no planned lots to recalculate.",
    );
  const oldTotal = lots.reduce(
    (sum, lot) => sum.add(lot.plannedQuantity),
    decimal(0),
  );
  if (oldTotal.lessThanOrEqualTo(0))
    throw new BadRequestException(
      "Existing production-lot quantities are invalid and cannot be amended.",
    );
  let allocated = decimal(0);
  return lots.map((lot, index) => {
    const quantity =
      index === lots.length - 1
        ? newTotal.sub(allocated)
        : decimal(lot.plannedQuantity)
            .mul(newTotal)
            .div(oldTotal)
            .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    if (quantity.lessThanOrEqualTo(0))
      throw new BadRequestException(
        "The amended quantity is too small to preserve every existing production lot. Create a new order with the required lot structure instead.",
      );
    allocated = allocated.add(quantity);
    return { id: lot.id, plannedQuantity: quantity };
  });
}

function lifecycleOrderSnapshot(order: any) {
  return {
    status: order.status,
    plannedQuantity: decimal(order.plannedQuantity).toString(),
    plannedStartDate: iso(order.plannedStartDate),
    plannedEndDate: iso(order.plannedEndDate),
    priority: order.priority,
    notes: order.notes ?? null,
    materials: (order.materials ?? []).map((material: any) => ({
      id: material.id,
      inventoryItemId: material.inventoryItemId,
      plannedQuantity: decimal(material.plannedQuantity).toString(),
      reservedQuantity: decimal(material.reservedQuantity).toString(),
      status: material.status,
    })),
    lots: (order.lots ?? []).map((lot: any) => ({
      id: lot.id,
      lotNumber: lot.lotNumber,
      plannedQuantity: decimal(lot.plannedQuantity).toString(),
      status: lot.status,
    })),
  };
}

function compactReference(prefix: string, seed: string) {
  return `${prefix}-${createHash("sha256").update(seed).digest("hex").slice(0, 16).toUpperCase()}`;
}

function canonicalApprovalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalApprovalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalApprovalValue(entry)]),
    );
  }
  return value;
}

export function manufacturingActionApprovalEntityId(input: {
  orderId: string;
  action: string;
  transactionDate: Date;
  lines?: unknown[];
  payload?: Record<string, unknown>;
}) {
  const lines = (input.lines ?? [])
    .map((line) => canonicalApprovalValue(line))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  const fingerprint = JSON.stringify(
    canonicalApprovalValue({
      orderId: input.orderId,
      action: input.action,
      transactionDate: input.transactionDate.toISOString(),
      lines,
      payload: input.payload ?? null,
    }),
  );
  return `MFG-ACTION-${createHash("sha256").update(fingerprint).digest("hex")}`;
}

@Injectable()
export class ManufacturingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ManufacturingApprovalWorkflowService)
    private readonly approvalWorkflow: ManufacturingApprovalWorkflowService,
    @Inject(ManufacturingElectronicSignatureService)
    private readonly electronicSignature: ManufacturingElectronicSignatureService,
    @Inject(InventoryService) private readonly inventoryService?: InventoryService,
  ) {}

  private requireInventoryService() {
    if (!this.inventoryService) {
      throw new Error(
        "InventoryService is required for manufacturing inventory valuation reconciliation",
      );
    }
    return this.inventoryService;
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

  private async requireDynamicPermission(
    currentUser: AuthenticatedRequestUser,
    key: string,
  ) {
    const granted = await this.permissions.getGrantedKeys(currentUser);
    if (!granted.has(key))
      throw new ForbiddenException(`Permission required: ${key}`);
  }

  private async requireOrderActionReplayPermission(
    currentUser: AuthenticatedRequestUser,
    kind: ActionKind,
    evidence: ReturnType<typeof actionEvidence>,
  ) {
    await this.requireDynamicPermission(
      currentUser,
      evidence.stagePermission ?? ACTION_PERMISSIONS[kind],
    );
    if (evidence.statusConfigurationPermission) {
      await this.requireDynamicPermission(
        currentUser,
        evidence.statusConfigurationPermission,
      );
    }
  }

  private assertPrePostingOrderLifecycleSafe(order: any, action: ActionKind) {
    const postedTransactions = (order.transactions ?? []).filter(
      (transaction: any) =>
        ["POSTED", "REVERSED"].includes(transaction.status) ||
        Boolean(transaction.voucherEntryId ?? transaction.voucherEntry) ||
        (transaction.lines ?? []).some(
          (line: any) => (line.stockMovements ?? []).length > 0,
        ),
    );
    const materialEffects = (order.materials ?? []).filter((material: any) =>
      [
        material.issuedQuantity,
        material.returnedQuantity,
        material.consumedQuantity,
        material.scrappedQuantity,
      ].some((value) => decimal(value).greaterThan(0)),
    );
    const reservationEffects = (order.reservations ?? []).filter(
      (reservation: any) =>
        ["PARTIALLY_ISSUED", "ISSUED"].includes(reservation.status) ||
        (reservation.lines ?? []).some((line: any) =>
          decimal(line.issuedQuantity).greaterThan(0),
        ),
    );
    const operationEffects = (order.operationExecutions ?? []).filter(
      (execution: any) => !["PENDING", "READY"].includes(execution.status),
    );
    const progressedLots = (order.lots ?? []).filter(
      (lot: any) =>
        !["PLANNED", "RELEASED"].includes(lot.status) ||
        decimal(lot.completedQuantity).greaterThan(0) ||
        decimal(lot.rejectedQuantity).greaterThan(0),
    );
    const progressedPackaging = (order.packagingOrders ?? []).filter(
      (packaging: any) =>
        !["DRAFT", "MATERIAL_SHORT", "CANCELLED"].includes(packaging.status),
    );
    const finalizedCosts = (order.costSnapshots ?? []).filter(
      (snapshot: any) =>
        !["DRAFT", "PROVISIONAL", "VOIDED"].includes(snapshot.status) ||
        Boolean(snapshot.voucherEntryId ?? snapshot.voucherEntry),
    );
    const blockers = [
      postedTransactions.length
        ? `${postedTransactions.length} posted/reversed stock or accounting transaction(s)`
        : null,
      materialEffects.length
        ? `${materialEffects.length} material line(s) with issued/returned/consumed/scrapped quantity`
        : null,
      reservationEffects.length
        ? `${reservationEffects.length} issued reservation(s)`
        : null,
      operationEffects.length
        ? `${operationEffects.length} started/completed operation execution(s)`
        : null,
      progressedLots.length
        ? `${progressedLots.length} progressed production lot(s)`
        : null,
      (order.qualityInspections ?? []).length
        ? `${order.qualityInspections.length} quality inspection(s)`
        : null,
      (order.serials ?? []).length
        ? `${order.serials.length} allocated serial(s)`
        : null,
      progressedPackaging.length
        ? `${progressedPackaging.length} progressed packaging order(s)`
        : null,
      finalizedCosts.length
        ? `${finalizedCosts.length} finalized/posted cost snapshot(s)`
        : null,
      decimal(order.completedQuantity).greaterThan(0) ||
      decimal(order.rejectedQuantity).greaterThan(0)
        ? "completed or rejected production quantity"
        : null,
    ].filter((entry): entry is string => Boolean(entry));
    if (blockers.length)
      throw new BadRequestException(
        `${action} requires a controlled stock/accounting reversal and is blocked. Found: ${blockers.join("; ")}.`,
      );
  }

  private async releaseOrderReservationsForLifecycle(
    tx: Prisma.TransactionClient,
    scope: { id: string },
    user: AuthenticatedRequestUser,
    order: any,
    when: Date,
    reason: string,
  ) {
    const reservations = (order.reservations ?? []).filter((reservation: any) =>
      (ACTIVE_RESERVATIONS as readonly string[]).includes(reservation.status),
    );
    const releasePlan = calculateReservationReleasePlan(
      reservations.flatMap((reservation: any) => reservation.lines ?? []),
    );
    const releaseByLineId = new Map(
      releasePlan.map((line) => [line.id, line.outstanding]),
    );
    const releaseByMaterialId = new Map<string, Prisma.Decimal>();
    for (const line of releasePlan) {
      if (!line.orderMaterialId) continue;
      releaseByMaterialId.set(
        line.orderMaterialId,
        (releaseByMaterialId.get(line.orderMaterialId) ?? decimal(0)).add(
          line.outstanding,
        ),
      );
    }
    for (const material of order.materials ?? []) {
      const expected = decimal(material.reservedQuantity);
      const releasable = releaseByMaterialId.get(material.id) ?? decimal(0);
      if (!expected.equals(releasable))
        throw new BadRequestException(
          `Reservation balance for material ${material.inventoryItemId} is not reconciled; ${reason.toLowerCase()} is blocked.`,
        );
    }

    const releasedLines: Array<{
      reservationId: string;
      reservationLineId: string;
      inventoryItemId: string;
      inventoryLotId: string | null;
      quantity: string;
    }> = [];
    for (const reservation of reservations) {
      for (const line of reservation.lines ?? []) {
        const outstanding = releaseByLineId.get(line.id) ?? decimal(0);
        if (outstanding.isZero()) continue;
        await tx.manufacturingReservationLine.update({
          where: { id: line.id },
          data: { releasedQuantity: { increment: outstanding } },
        });
        if (line.inventoryLotId) {
          const inventoryLot = await tx.manufacturingInventoryLot.findFirst({
            where: {
              id: line.inventoryLotId,
              workspaceId: scope.id,
              inventoryItemId: line.inventoryItemId,
            },
          });
          if (
            !inventoryLot ||
            decimal(inventoryLot.reservedQuantity).lessThan(outstanding)
          )
            throw new BadRequestException(
              "Source-lot reservation is no longer reconciled and cannot be released safely.",
            );
          await tx.manufacturingInventoryLot.update({
            where: { id: inventoryLot.id },
            data: { reservedQuantity: { decrement: outstanding } },
          });
        }
        releasedLines.push({
          reservationId: reservation.id,
          reservationLineId: line.id,
          inventoryItemId: line.inventoryItemId,
          inventoryLotId: line.inventoryLotId ?? null,
          quantity: outstanding.toString(),
        });
      }
      await tx.manufacturingReservation.update({
        where: { id: reservation.id },
        data: {
          status: "RELEASED",
          releasedAt: when,
          releasedByUserId: user.id,
          releaseReason: reason,
        },
      });
    }
    return {
      reservationIds: reservations.map((reservation: any) => reservation.id),
      lines: releasedLines,
    };
  }

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw new ConflictException(
      "The manufacturing operation could not be serialized after three attempts.",
    );
  }

  private async activeWarehouse(
    db: Db,
    workspaceId: string,
    warehouseId: string,
    label: string,
    options?: {
      companyId?: string;
      role?: "RAW_MATERIAL" | "WIP" | "FINISHED_GOODS" | "REJECTED" | "SCRAP";
    },
  ) {
    const warehouse = await db.warehouse.findFirst({
      where: {
        id: warehouseId,
        workspaceId,
        ...(options?.companyId ? { companyId: options.companyId } : {}),
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        allowMaterialIssue: true,
      },
    });
    if (!warehouse)
      throw new BadRequestException(
        `${label} must be an active warehouse in this workspace.`,
      );
    const roleIssue = options?.role
      ? this.manufacturingWarehouseRoleIssue(warehouse, options.role)
      : null;
    if (roleIssue) throw new BadRequestException(`${label} ${roleIssue}`);
    return warehouse;
  }

  private manufacturingWarehouseRoleIssue(
    warehouse: { type: string; allowMaterialIssue: boolean },
    role: "RAW_MATERIAL" | "WIP" | "FINISHED_GOODS" | "REJECTED" | "SCRAP",
  ) {
    const eligibleTypes = {
      RAW_MATERIAL: ["RAW_MATERIAL", "GENERAL"],
      WIP: ["WIP", "GENERAL"],
      FINISHED_GOODS: ["FINISHED_GOODS", "GENERAL"],
      REJECTED: ["REJECTED", "GENERAL"],
      SCRAP: ["SCRAP", "GENERAL"],
    } as const;
    if (!(eligibleTypes[role] as readonly string[]).includes(warehouse.type))
      return `must be a ${role.replaceAll("_", " ")} or GENERAL warehouse.`;
    if (
      (role === "RAW_MATERIAL" || role === "WIP") &&
      !warehouse.allowMaterialIssue
    )
      return "must allow controlled material issue.";
    return null;
  }

  private async activeLocation(
    db: Db,
    workspaceId: string,
    warehouseId: string,
    locationId: string | null | undefined,
    label: string,
    options?: { companyId?: string; dispositions?: readonly string[] },
  ) {
    if (!locationId) return null;
    const location = await db.manufacturingLocation.findFirst({
      where: {
        id: locationId,
        workspaceId,
        warehouseId,
        ...(options?.companyId ? { companyId: options.companyId } : {}),
        isActive: true,
      },
      select: { id: true, name: true, disposition: true, warehouseId: true },
    });
    if (!location)
      throw new BadRequestException(
        `${label} must be an active location in the selected warehouse.`,
      );
    if (
      options?.dispositions?.length &&
      !options.dispositions.includes(location.disposition)
    )
      throw new BadRequestException(
        `${label} must use the ${options.dispositions.join(" or ")} disposition.`,
      );
    return location;
  }

  private async activeLedger(
    db: Db,
    companyId: string,
    accountId: string,
    label: string,
    expectedNature?: string,
  ) {
    const account = await db.account.findFirst({
      where: { id: accountId, companyId, level: "LEDGER", status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        code: true,
        nature: true,
        isControlAccount: true,
      },
    });
    if (!account || account.isControlAccount)
      throw new BadRequestException(
        `${label} must reference an active, non-control LEDGER account in this company.`,
      );
    if (expectedNature && account.nature !== expectedNature)
      throw new BadRequestException(
        `${label} must reference an active ${expectedNature} LEDGER account in this company.`,
      );
    return account;
  }

  private async protectedInventoryControlLedger(
    db: Db,
    companyId: string,
    accountId: string,
    label: string,
  ) {
    const account = await db.account.findFirst({
      where: {
        id: accountId,
        companyId,
        code: INVENTORY_CONTROL_ACCOUNT_CODE,
        level: "LEDGER",
        status: "ACTIVE",
        nature: "ASSET",
        isSystem: true,
        isControlAccount: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        nature: true,
        isSystem: true,
        isControlAccount: true,
      },
    });
    if (!account)
      throw new BadRequestException(
        `${label} must reference this company's active protected Inventory Control (${INVENTORY_CONTROL_ACCOUNT_CODE}) ASSET LEDGER account.`,
      );
    return account;
  }

  private mapSettings(row: any) {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      mode: row.mode,
      rawMaterialWarehouseId: row.defaultRawMaterialWarehouseId,
      wipWarehouseId: row.defaultWipWarehouseId,
      finishedGoodsQualityWarehouseId: row.defaultFinishedGoodsWarehouseId,
      finishedGoodsReleasedWarehouseId:
        row.defaultFinishedGoodsReleasedWarehouseId,
      rejectedWarehouseId: row.defaultRejectedWarehouseId,
      scrapWarehouseId: row.defaultScrapWarehouseId,
      rawMaterialInventoryAccountId: row.rawMaterialInventoryAccountId,
      packagingInventoryAccountId: row.packagingInventoryAccountId,
      wipInventoryAccountId: row.wipInventoryAccountId,
      finishedGoodsInventoryAccountId: row.finishedGoodsInventoryAccountId,
      manufacturingVarianceAccountId: row.manufacturingVarianceAccountId,
      labourClearingAccountId: row.labourClearingAccountId,
      overheadAbsorptionAccountId: row.overheadAbsorptionAccountId,
      scrapRecoveryAccountId: row.scrapRecoveryAccountId,
      reservationRequired: row.reservationRequired,
      issueBeforeProduction: row.issueBeforeOperationStart,
      negativeStockAllowed: !row.blockNegativeStock,
      serialTrackingRequired: row.requireSerialBeforeRelease,
      qualityReleaseRequired: row.requireQcBeforeRelease,
      partialProductionAllowed: row.allowPartialCompletion,
      electronicSignatureRequired: row.electronicSignatureRequired,
      approvalRequired: row.approvalRequired,
      settings: {
        currency: row.currency,
        quantityScale: row.quantityScale,
        costScale: row.costScale,
        allowProvisionalCost: row.allowProvisionalCost,
        defaultRawMaterialLocationId: row.defaultRawMaterialLocationId,
        defaultWipLocationId: row.defaultWipLocationId,
        defaultFinishedGoodsHoldLocationId:
          row.defaultFinishedGoodsHoldLocationId,
        defaultFinishedGoodsReleaseLocationId:
          row.defaultFinishedGoodsReleaseLocationId,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getSettings(
    currentUser: AuthenticatedRequestUser,
    requestedWorkspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, requestedWorkspaceId);
    const row = await this.prisma.manufacturingSettings.findUnique({
      where: { workspaceId: scope.id },
    });
    return row ? this.mapSettings(row) : null;
  }

  async updateSettings(
    currentUser: AuthenticatedRequestUser,
    dto: UpdateManufacturingSettingsDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const extra = jsonObject(dto.settings);
    const requestedSettingsValues = {
      mode: dto.mode,
      currency: text(extra.currency) ?? "BDT",
      quantityScale: Math.min(
        6,
        Math.max(0, Math.trunc(numeric(extra.quantityScale, 4))),
      ),
      costScale: Math.min(
        8,
        Math.max(2, Math.trunc(numeric(extra.costScale, 6))),
      ),
      blockNegativeStock: !dto.negativeStockAllowed,
      reservationRequired: dto.reservationRequired,
      issueBeforeOperationStart: dto.issueBeforeProduction,
      allowPartialCompletion: dto.partialProductionAllowed,
      allowProvisionalCost:
        typeof extra.allowProvisionalCost === "boolean"
          ? extra.allowProvisionalCost
          : true,
      requireQcBeforeRelease: dto.qualityReleaseRequired,
      requireSerialBeforeRelease: dto.serialTrackingRequired,
      electronicSignatureRequired: dto.electronicSignatureRequired,
      approvalRequired: dto.approvalRequired,
      defaultRawMaterialWarehouseId: dto.rawMaterialWarehouseId ?? null,
      defaultWipWarehouseId: dto.wipWarehouseId ?? null,
      defaultFinishedGoodsWarehouseId:
        dto.finishedGoodsQualityWarehouseId ?? null,
      defaultFinishedGoodsReleasedWarehouseId:
        dto.finishedGoodsReleasedWarehouseId ?? null,
      defaultRejectedWarehouseId: dto.rejectedWarehouseId ?? null,
      defaultScrapWarehouseId: dto.scrapWarehouseId ?? null,
      defaultRawMaterialLocationId: text(extra.defaultRawMaterialLocationId),
      defaultWipLocationId: text(extra.defaultWipLocationId),
      defaultFinishedGoodsHoldLocationId: text(
        extra.defaultFinishedGoodsHoldLocationId,
      ),
      defaultFinishedGoodsReleaseLocationId: text(
        extra.defaultFinishedGoodsReleaseLocationId,
      ),
      rawMaterialInventoryAccountId: dto.rawMaterialInventoryAccountId ?? null,
      packagingInventoryAccountId: dto.packagingInventoryAccountId ?? null,
      wipInventoryAccountId: dto.wipInventoryAccountId ?? null,
      finishedGoodsInventoryAccountId:
        dto.finishedGoodsInventoryAccountId ?? null,
      manufacturingVarianceAccountId:
        dto.manufacturingVarianceAccountId ?? null,
      labourClearingAccountId: dto.labourClearingAccountId ?? null,
      overheadAbsorptionAccountId: dto.overheadAbsorptionAccountId ?? null,
      scrapRecoveryAccountId: dto.scrapRecoveryAccountId ?? null,
    } as const;
    const existingSettings = await this.prisma.manufacturingSettings.findUnique(
      { where: { workspaceId: scope.id } },
    );
    const existingValues = existingSettings as unknown as Record<
      string,
      unknown
    > | null;
    const materiallyChanged =
      !existingValues ||
      Object.entries(requestedSettingsValues).some(
        ([key, value]) => existingValues[key] !== value,
      );
    if (materiallyChanged) {
      const [activeOrder, activeRun] = await Promise.all([
        this.prisma.manufacturingOrder.findFirst({
          where: {
            workspaceId: scope.id,
            status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
          },
          select: { id: true, orderNumber: true, status: true },
        }),
        this.prisma.manufacturingRun.findFirst({
          where: {
            workspaceId: scope.id,
            status: { notIn: ["CLOSED", "CANCELLED", "PERIOD_LOCKED"] },
          },
          select: { id: true, status: true },
        }),
      ]);
      if (activeOrder || activeRun)
        throw new ConflictException(
          "Manufacturing settings cannot be changed while active manufacturing orders or workflow runs exist. Close or cancel the active work first, then retry the settings change.",
        );
    }
    if (
      (dto.mode === "PHARMACEUTICAL" || dto.mode === "HYBRID") &&
      !dto.qualityReleaseRequired
    )
      throw new BadRequestException(
        "Pharmaceutical and hybrid manufacturing require quality release controls.",
      );
    const warehouses = [
      {
        id: dto.rawMaterialWarehouseId,
        label: "Raw-material warehouse",
        role: "RAW_MATERIAL" as const,
      },
      {
        id: dto.wipWarehouseId,
        label: "WIP warehouse",
        role: "WIP" as const,
      },
      {
        id: dto.finishedGoodsQualityWarehouseId,
        label: "Finished-goods quality warehouse",
        role: "FINISHED_GOODS" as const,
      },
      {
        id: dto.finishedGoodsReleasedWarehouseId,
        label: "Finished-goods released warehouse",
        role: "FINISHED_GOODS" as const,
      },
      {
        id: dto.rejectedWarehouseId,
        label: "Rejected warehouse",
        role: "REJECTED" as const,
      },
      {
        id: dto.scrapWarehouseId,
        label: "Scrap warehouse",
        role: "SCRAP" as const,
      },
    ] as const;
    for (const warehouse of warehouses)
      if (warehouse.id)
        await this.activeWarehouse(
          this.prisma,
          scope.id,
          warehouse.id,
          warehouse.label,
          { companyId: scope.companyId, role: warehouse.role },
        );

    if (
      !dto.rawMaterialInventoryAccountId ||
      !dto.wipInventoryAccountId ||
      !dto.finishedGoodsInventoryAccountId
    )
      throw new BadRequestException(
        "Raw-material, WIP and finished-goods inventory account mappings are required.",
      );
    const packagingRequired =
      dto.mode === "PHARMACEUTICAL" || dto.mode === "HYBRID";
    if (packagingRequired && !dto.packagingInventoryAccountId)
      throw new BadRequestException(
        "Packaging inventory account mapping is required for pharmaceutical and hybrid manufacturing.",
      );
    if (
      dto.wipInventoryAccountId === dto.rawMaterialInventoryAccountId ||
      dto.wipInventoryAccountId === dto.finishedGoodsInventoryAccountId ||
      (dto.packagingInventoryAccountId &&
        dto.wipInventoryAccountId === dto.packagingInventoryAccountId) ||
      (dto.scrapRecoveryAccountId &&
        dto.wipInventoryAccountId === dto.scrapRecoveryAccountId)
    )
      throw new BadRequestException(
        "WIP inventory must use a distinct active non-control ASSET LEDGER account; it cannot use protected Inventory Control.",
      );

    await this.protectedInventoryControlLedger(
      this.prisma,
      scope.companyId,
      dto.rawMaterialInventoryAccountId,
      "Raw-material inventory account",
    );
    await this.activeLedger(
      this.prisma,
      scope.companyId,
      dto.wipInventoryAccountId,
      "WIP inventory account",
      "ASSET",
    );
    await this.protectedInventoryControlLedger(
      this.prisma,
      scope.companyId,
      dto.finishedGoodsInventoryAccountId,
      "Finished-goods inventory account",
    );
    if (dto.packagingInventoryAccountId)
      await this.protectedInventoryControlLedger(
        this.prisma,
        scope.companyId,
        dto.packagingInventoryAccountId,
        "Packaging inventory account",
      );
    if (dto.scrapRecoveryAccountId)
      await this.protectedInventoryControlLedger(
        this.prisma,
        scope.companyId,
        dto.scrapRecoveryAccountId,
        "Scrap inventory/recovery asset account",
      );

    const nonInventoryAccounts = [
      {
        id: dto.manufacturingVarianceAccountId,
        label: "Manufacturing variance account",
      },
      {
        id: dto.labourClearingAccountId,
        label: "Labour clearing account",
      },
      {
        id: dto.overheadAbsorptionAccountId,
        label: "Overhead absorption account",
      },
    ] as const;
    for (const account of nonInventoryAccounts)
      if (account.id)
        await this.activeLedger(
          this.prisma,
          scope.companyId,
          account.id,
          account.label,
        );

    const locations = [
      {
        id: text(extra.defaultRawMaterialLocationId),
        warehouseId: dto.rawMaterialWarehouseId,
        label: "Raw-material default location",
        dispositions: ["RELEASED"] as const,
      },
      {
        id: text(extra.defaultWipLocationId),
        warehouseId: dto.wipWarehouseId,
        label: "WIP default location",
        dispositions: ["WIP"] as const,
      },
      {
        id: text(extra.defaultFinishedGoodsHoldLocationId),
        warehouseId: dto.finishedGoodsQualityWarehouseId,
        label: "Finished-goods quality default location",
        dispositions: ["QC_HOLD"] as const,
      },
      {
        id: text(extra.defaultFinishedGoodsReleaseLocationId),
        warehouseId: dto.finishedGoodsReleasedWarehouseId,
        label: "Finished-goods released default location",
        dispositions: ["RELEASED"] as const,
      },
    ] as const;
    const usedLocationRoles = new Map<string, string>();
    for (const location of locations) {
      if (!location.id) continue;
      if (!location.warehouseId)
        throw new BadRequestException(
          `${location.label} requires its corresponding warehouse mapping.`,
        );
      await this.activeLocation(
        this.prisma,
        scope.id,
        location.warehouseId,
        location.id,
        location.label,
        {
          companyId: scope.companyId,
          dispositions: location.dispositions,
        },
      );
      const identity = `${location.warehouseId}:${location.id}`;
      const priorRole = usedLocationRoles.get(identity);
      if (priorRole)
        throw new BadRequestException(
          `${location.label} must be distinct from ${priorRole}; one logical location cannot serve multiple manufacturing stock roles.`,
        );
      usedLocationRoles.set(identity, location.label);
    }

    const data = {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      workspaceId: scope.id,
      ...requestedSettingsValues,
      updatedByUserId: currentUser.id,
    } as const;
    const row = await this.prisma.manufacturingSettings.upsert({
      where: { workspaceId: scope.id },
      create: data,
      update: data,
    });
    return this.mapSettings(row);
  }

  private async latestStock(
    db: Db,
    workspaceId: string,
    filters?: { warehouseId?: string; inventoryItemId?: string; asOf?: Date },
  ) {
    const movements = await db.stockMovement.findMany({
      where: {
        workspaceId,
        voidedAt: null,
        ...(filters?.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters?.inventoryItemId
          ? { inventoryItemId: filters.inventoryItemId }
          : {}),
        ...(filters?.asOf ? { transactionDate: { lte: filters.asOf } } : {}),
      },
      orderBy: [
        { transactionDate: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        warehouseId: true,
        inventoryItemId: true,
        balanceQuantity: true,
        balanceValue: true,
        averageCost: true,
      },
    });
    const latest = new Map<string, (typeof movements)[number]>();
    for (const movement of movements)
      latest.set(
        `${movement.warehouseId}:${movement.inventoryItemId}`,
        movement,
      );
    return latest;
  }

  async getAvailability(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const asOf = query.asOf ? asDate(query.asOf, "asOf") : new Date();
    const stock = await this.latestStock(this.prisma, scope.id, {
      warehouseId: query.warehouseId,
      inventoryItemId: query.inventoryItemId,
      asOf,
    });
    const itemIds = [
      ...new Set(
        [...stock.values()].map((movement) => movement.inventoryItemId),
      ),
    ];
    const profiles = await this.prisma.manufacturingItemProfile.findMany({
      where: {
        workspaceId: scope.id,
        isActive: true,
        ...(query.inventoryItemId
          ? { inventoryItemId: query.inventoryItemId }
          : {}),
        ...(query.itemRole ? { role: query.itemRole as any } : {}),
        inventoryItem: {
          status: "ACTIVE",
          ...(query.search
            ? {
                OR: [
                  { itemName: { contains: query.search, mode: "insensitive" } },
                  { itemCode: { contains: query.search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
      },
      include: { inventoryItem: true },
    });
    if (query.includeZeroStock === "true")
      for (const profile of profiles) itemIds.push(profile.inventoryItemId);

    const reservations = itemIds.length
      ? await this.prisma.manufacturingReservationLine.findMany({
          where: {
            inventoryItemId: { in: [...new Set(itemIds)] },
            reservation: {
              workspaceId: scope.id,
              status: { in: [...ACTIVE_RESERVATIONS] },
              ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
            },
          },
          select: {
            inventoryItemId: true,
            quantity: true,
            issuedQuantity: true,
            releasedQuantity: true,
            reservation: { select: { warehouseId: true } },
          },
        })
      : [];
    const reservedByWarehouseItem = new Map<string, number>();
    for (const entry of reservations) {
      const key = `${entry.reservation.warehouseId}:${entry.inventoryItemId}`;
      const remaining = decimal(entry.quantity)
        .sub(entry.issuedQuantity)
        .sub(entry.releasedQuantity)
        .toNumber();
      reservedByWarehouseItem.set(
        key,
        (reservedByWarehouseItem.get(key) ?? 0) + remaining,
      );
    }
    const holdByWarehouseItem = new Map<string, number>();
    if (itemIds.length) {
      const holds = await this.prisma.manufacturingInventoryLot.groupBy({
        by: ["warehouseId", "inventoryItemId"],
        where: {
          workspaceId: scope.id,
          inventoryItemId: { in: [...new Set(itemIds)] },
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        },
        _sum: { holdQuantity: true },
      });
      for (const entry of holds)
        holdByWarehouseItem.set(
          `${entry.warehouseId}:${entry.inventoryItemId}`,
          number(entry._sum.holdQuantity),
        );
    }
    const warehouseIds = [
      ...new Set([...stock.values()].map((movement) => movement.warehouseId)),
    ];
    if (query.warehouseId) warehouseIds.push(query.warehouseId);
    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        workspaceId: scope.id,
        id: { in: [...new Set(warehouseIds)] },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, code: true, name: true },
    });
    const warehouseById = new Map(
      warehouses.map((warehouse) => [warehouse.id, warehouse]),
    );
    const profileByItem = new Map(
      profiles.map((profile) => [profile.inventoryItemId, profile]),
    );
    const rows = [...stock.values()].flatMap((movement) => {
      const profile = profileByItem.get(movement.inventoryItemId);
      const warehouse = warehouseById.get(movement.warehouseId);
      if (!profile || !warehouse) return [];
      const onHand = number(movement.balanceQuantity);
      const stockKey = `${movement.warehouseId}:${movement.inventoryItemId}`;
      const reserved = reservedByWarehouseItem.get(stockKey) ?? 0;
      const qualityHold = holdByWarehouseItem.get(stockKey) ?? 0;
      if (query.includeZeroStock !== "true" && onHand === 0) return [];
      return [
        {
          inventoryItemId: profile.inventoryItemId,
          itemCode: profile.inventoryItem.itemCode,
          itemName: profile.inventoryItem.itemName,
          itemRole: profile.role,
          category: profile.inventoryItem.category || null,
          unit: profile.inventoryItem.unit,
          warehouseId: warehouse.id,
          warehouseCode: warehouse.code,
          warehouseName: warehouse.name,
          onHandQuantity: onHand,
          reservedQuantity: reserved,
          qualityHoldQuantity: qualityHold,
          availableQuantity: Math.max(0, onHand - reserved - qualityHold),
          unitCost: number(movement.averageCost),
          stockValue: number(movement.balanceValue),
          lotNumber: null,
          expiryDate: null,
        },
      ];
    });
    return {
      workspaceId: scope.id,
      asOf: asOf.toISOString(),
      totalItems: rows.length,
      totalAvailableQuantity: rows.reduce(
        (total, row) => total + row.availableQuantity,
        0,
      ),
      totalStockValue: rows.reduce((total, row) => total + row.stockValue, 0),
      rows,
    };
  }

  private mapBomVersion(row: any) {
    return {
      id: row.id,
      bomId: row.bomId,
      versionNumber: row.versionNumber,
      status: row.status,
      outputQuantity: number(row.outputQuantity),
      outputUnit: row.outputUnit,
      effectiveFrom: dateOnly(row.effectiveFrom),
      effectiveTo: dateOnly(row.effectiveTo),
      changeReason: row.changeReason,
      approvedAt: iso(row.approvedAt),
      approvedBy: row.approvedBy?.name ?? null,
      components: (row.components ?? []).map((component: any) => ({
        id: component.id,
        inventoryItemId: component.inventoryItemId,
        itemCode: component.inventoryItem.itemCode,
        itemName: component.inventoryItem.itemName,
        itemRole:
          component.inventoryItem.manufacturingProfile?.role ?? "RAW_MATERIAL",
        unit: component.unit,
        quantity: number(component.quantityPerOutput),
        scrapPercentage: number(component.scrapPercent),
        isOptional: component.isOptional,
        substituteGroup: component.allowSubstitute ? "SUBSTITUTE" : null,
        notes: component.notes,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapBom(row: any) {
    const versions = (row.versions ?? []).map((version: any) =>
      this.mapBomVersion(version),
    );
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      bomNumber: row.code,
      name: row.name,
      finishedProductId: row.finishedProductId,
      finishedProductCode: row.finishedProduct.itemCode,
      finishedProductName: row.finishedProduct.itemName,
      makeBuy: row.finishedProduct.manufacturingProfile?.makeBuy ?? "MAKE",
      isActive: row.isActive,
      approvedVersion:
        versions.find((version: any) => version.status === "APPROVED") ?? null,
      versions,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private bomInclude() {
    return {
      finishedProduct: { include: { manufacturingProfile: true } },
      versions: {
        orderBy: { versionNumber: "desc" as const },
        include: {
          approvedBy: { select: { name: true } },
          components: {
            orderBy: { sortOrder: "asc" as const },
            include: {
              inventoryItem: { include: { manufacturingProfile: true } },
              issueLocation: true,
            },
          },
        },
      },
    };
  }

  async listBoms(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const rows = await this.prisma.manufacturingBom.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.activeOnly === "true" ? { isActive: true } : {}),
        ...(query.finishedProductId
          ? { finishedProductId: query.finishedProductId }
          : {}),
        ...(query.status
          ? { versions: { some: { status: query.status as any } } }
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
      orderBy: { updatedAt: "desc" },
      include: this.bomInclude(),
    });
    return rows.map((row) => this.mapBom(row));
  }

  async createBom(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingBomDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const entityId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingBom",
      dto.idempotencyKey,
    );
    const numberingKey = `MFG:${dto.idempotencyKey}:BOM`;
    const replay = await this.prisma.manufacturingBom.findFirst({
      where: { id: entityId, workspaceId: scope.id },
      include: this.bomInclude(),
    });
    if (replay) return this.mapBom(replay);
    const item = await this.prisma.inventoryItem.findFirst({
      where: {
        id: dto.finishedProductId,
        workspaceId: scope.id,
        status: "ACTIVE",
        kind: "PRODUCT",
      },
      include: { manufacturingProfile: true },
    });
    if (!item)
      throw new BadRequestException(
        "Finished product must be an active inventory product in this workspace.",
      );
    if (
      item.manufacturingProfile &&
      !["INTERMEDIATE", "BULK", "FINISHED_GOOD"].includes(
        item.manufacturingProfile.role,
      )
    ) {
      throw new BadRequestException(
        "A production BOM output profile must use the INTERMEDIATE, BULK or FINISHED GOOD role.",
      );
    }
    const makeBuy = dto.makeBuy ?? "MAKE";
    if (makeBuy === "BUY")
      throw new BadRequestException(
        "A production BOM output must use the MAKE or BOTH make/buy policy.",
      );
    if (text(dto.bomNumber))
      throw new BadRequestException(
        "BOM number is generated from the configured BOM sequence; leave it blank.",
      );
    const row = await this.serializable(async (tx) => {
      const replayInTransaction = await tx.manufacturingBom.findFirst({
        where: { id: entityId, workspaceId: scope.id },
        include: this.bomInclude(),
      });
      if (replayInTransaction) return replayInTransaction;
      const issued = await issueManufacturingDocumentNumberTx(
        tx,
        scope,
        currentUser.id,
        {
          documentKind: "BOM",
          issuedAt: new Date(),
          idempotencyKey: numberingKey,
          entityType: "ManufacturingBom",
          entityId,
        },
      );
      await tx.manufacturingItemProfile.upsert({
        where: { inventoryItemId: item.id },
        create: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          inventoryItemId: item.id,
          role: "FINISHED_GOOD",
          makeBuy,
          createdByUserId: currentUser.id,
        },
        update: { makeBuy, isActive: true },
      });
      return tx.manufacturingBom.create({
        data: {
          id: entityId,
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          code: issued.documentNumber,
          name: dto.name.trim(),
          finishedProductId: item.id,
          description: text(dto.notes),
          createdByUserId: currentUser.id,
        },
        include: this.bomInclude(),
      });
    });
    return this.mapBom(row);
  }

  async createBomVersion(
    currentUser: AuthenticatedRequestUser,
    bomId: string,
    dto: CreateManufacturingBomVersionDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const bom = await this.prisma.manufacturingBom.findFirst({
      where: { id: bomId, workspaceId: scope.id, isActive: true },
      include: {
        finishedProduct: {
          select: {
            id: true,
            itemCode: true,
            itemName: true,
            unit: true,
            alternateUnit: true,
            alternateUnitConversion: true,
          },
        },
      },
    });
    if (!bom) throw new NotFoundException("BOM not found.");
    if (!dto.components.some((component) => !component.isOptional))
      throw new BadRequestException(
        "A BOM version requires at least one non-optional component.",
      );
    const effectiveFrom = dto.effectiveFrom
      ? asDate(dto.effectiveFrom, "effectiveFrom")
      : null;
    const effectiveTo = dto.effectiveTo
      ? asDate(dto.effectiveTo, "effectiveTo")
      : null;
    if (
      effectiveFrom &&
      effectiveTo &&
      effectiveTo.getTime() < effectiveFrom.getTime()
    )
      throw new BadRequestException(
        "effectiveTo cannot be before effectiveFrom.",
      );
    const componentIds = [
      ...new Set(dto.components.map((component) => component.inventoryItemId)),
    ];
    if (componentIds.length !== dto.components.length)
      throw new BadRequestException(
        "A BOM version cannot contain duplicate component items; combine each material into one controlled line.",
      );
    if (componentIds.includes(bom.finishedProductId))
      throw new BadRequestException(
        "A BOM cannot consume its own finished product.",
      );
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        id: { in: componentIds },
        workspaceId: scope.id,
        status: "ACTIVE",
        kind: "PRODUCT",
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        unit: true,
        alternateUnit: true,
        alternateUnitConversion: true,
      },
    });
    if (items.length !== componentIds.length)
      throw new BadRequestException(
        "Every BOM component must be an active inventory product in this workspace.",
      );
    const normalizedOutput = manufacturingBaseQuantity(
      bom.finishedProduct,
      dto.outputQuantity,
      dto.outputUnit,
      "BOM output quantity",
      4,
    );
    const itemById = new Map(items.map((item) => [item.id, item]));
    const normalizedComponents = dto.components.map((component, index) => {
      const item = itemById.get(component.inventoryItemId)!;
      return manufacturingBaseQuantity(
        item,
        component.quantity,
        component.unit,
        `BOM component ${index + 1} (${item.itemName}) quantity`,
        6,
      );
    });
    const latest = await this.prisma.manufacturingBomVersion.aggregate({
      where: { bomId },
      _max: { versionNumber: true },
    });
    const versionNumber =
      dto.versionNumber ?? (latest._max.versionNumber ?? 0) + 1;
    const row = await this.prisma.$transaction(async (tx) => {
      for (const itemId of componentIds) {
        await tx.manufacturingItemProfile.upsert({
          where: { inventoryItemId: itemId },
          create: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            inventoryItemId: itemId,
            role: "RAW_MATERIAL",
            makeBuy: "BUY",
            createdByUserId: currentUser.id,
          },
          update: { isActive: true },
        });
      }
      const version = await tx.manufacturingBomVersion.create({
        data: {
          bomId,
          versionNumber,
          outputQuantity: normalizedOutput.quantity,
          outputUnit: normalizedOutput.unit,
          effectiveFrom,
          effectiveTo,
          changeReason: text(dto.changeReason),
          components: {
            create: dto.components.map((component, index) => ({
              inventoryItemId: component.inventoryItemId,
              issueLocationId: null,
              quantityPerOutput: normalizedComponents[index]!.quantity,
              scrapPercent: component.scrapPercentage ?? 0,
              unit: normalizedComponents[index]!.unit,
              isOptional: component.isOptional ?? false,
              allowSubstitute: Boolean(component.substituteGroup),
              sortOrder: index + 1,
              notes: text(component.notes),
            })),
          },
        },
        include: {
          approvedBy: { select: { name: true } },
          components: {
            orderBy: { sortOrder: "asc" },
            include: {
              inventoryItem: { include: { manufacturingProfile: true } },
              issueLocation: true,
            },
          },
        },
      });
      const transactionDate = effectiveFrom ?? new Date();
      const evidence = {
        stockBaseUnitAuthoritative: true,
        output: normalizedOutput.evidence,
        components: normalizedComponents.map((entry, index) => ({
          sequence: index + 1,
          ...entry.evidence,
        })),
      };
      await tx.manufacturingWorkflowReview.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          workflowGroup: "MASTERS_FORMULA",
          workflowCode: "BOM_VERSION_UOM_NORMALIZED",
          entityType: "BOM_VERSION",
          entityId: version.id,
          transactionDate,
          idempotencyKey: `BOM_VERSION:UOM:${version.id}`,
          title: `BOM version ${version.versionNumber} quantities normalized to stock/base units`,
          outcome: "EXECUTED",
          status: "APPROVED",
          evidence: evidence as Prisma.InputJsonValue,
          signatureHash: createHash("sha256")
            .update(JSON.stringify(evidence))
            .digest("hex"),
          approvedByUserId: currentUser.id,
          approvedAt: transactionDate,
          createdByUserId: currentUser.id,
        },
      });
      return version;
    });
    return this.mapBomVersion(row);
  }

  async approveBomVersion(
    currentUser: AuthenticatedRequestUser,
    versionId: string,
    dto: ApproveManufacturingVersionDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const transactionDate = asDate(dto.transactionDate, "transactionDate");
    if (dateOnly(transactionDate)! > dateOnly(new Date())!)
      throw new BadRequestException(
        "BOM approval transaction date cannot be in the future; scheduled BOM activation is not supported.",
      );
    const result = await this.prisma.$transaction(
      async (tx) => {
        const version = await tx.manufacturingBomVersion.findFirst({
          where: { id: versionId, bom: { workspaceId: scope.id } },
          include: {
            bom: {
              select: {
                createdByUserId: true,
                finishedProduct: {
                  select: {
                    kind: true,
                    status: true,
                    manufacturingProfile: {
                      select: {
                        isActive: true,
                        role: true,
                        makeBuy: true,
                      },
                    },
                  },
                },
              },
            },
            components: {
              include: {
                inventoryItem: {
                  select: {
                    itemName: true,
                    kind: true,
                    status: true,
                    manufacturingProfile: { select: { isActive: true } },
                  },
                },
                issueLocation: {
                  select: {
                    isActive: true,
                    disposition: true,
                    workspaceId: true,
                    warehouse: {
                      select: { isActive: true, deletedAt: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (!version) throw new NotFoundException("BOM version not found.");
        if (version.status !== "DRAFT")
          throw new BadRequestException(
            "Only a draft BOM version can be approved.",
          );
        assertWithinBomEffectiveWindow(
          transactionDate,
          version,
          "BOM approval transaction date",
        );
        assertWithinBomEffectiveWindow(
          new Date(),
          version,
          "BOM approval current date",
        );
        const outputProfile =
          version.bom.finishedProduct.manufacturingProfile;
        if (
          version.bom.finishedProduct.kind !== "PRODUCT" ||
          version.bom.finishedProduct.status !== "ACTIVE" ||
          !outputProfile?.isActive ||
          !["INTERMEDIATE", "BULK", "FINISHED_GOOD"].includes(
            outputProfile.role,
          ) ||
          !["MAKE", "BOTH"].includes(outputProfile.makeBuy)
        )
          throw new BadRequestException(
            "BOM approval requires an active manufacturable output product with a MAKE or BOTH profile.",
          );
        const requiredComponents = version.components.filter(
          (component) => !component.isOptional,
        );
        if (!requiredComponents.length)
          throw new BadRequestException(
            "BOM approval requires at least one non-optional component.",
          );
        if (
          new Set(
            version.components.map(
              (component) => component.inventoryItemId,
            ),
          ).size !== version.components.length
        )
          throw new BadRequestException(
            "BOM approval cannot accept duplicate component items; create a corrected version with one controlled line per material.",
          );
        const staleComponent = version.components.find(
          (component) =>
            component.inventoryItem.kind !== "PRODUCT" ||
            component.inventoryItem.status !== "ACTIVE" ||
            !component.inventoryItem.manufacturingProfile?.isActive,
        );
        if (staleComponent)
          throw new BadRequestException(
            `BOM component ${staleComponent.inventoryItem.itemName} must be an active inventory product with an active manufacturing profile before approval.`,
          );
        const invalidIssueLocation = version.components.find(
          (component) =>
            component.issueLocationId &&
            (!component.issueLocation ||
              !component.issueLocation.isActive ||
              component.issueLocation.disposition !== "RELEASED" ||
              component.issueLocation.workspaceId !== scope.id ||
              !component.issueLocation.warehouse.isActive ||
              component.issueLocation.warehouse.deletedAt),
        );
        if (invalidIssueLocation)
          throw new BadRequestException(
            `BOM component ${invalidIssueLocation.inventoryItem.itemName} must use an active RELEASED issue location in an active warehouse before approval.`,
          );
        const progress = await this.approvalWorkflow.advance(tx, {
          scope,
          user: currentUser,
          workflowScope: "BOM_VERSION",
          workflowGroup: "MASTERS_FORMULA",
          workflowCode: "BOM_VERSION_APPROVE",
          entityType: "BOM_VERSION",
          entityId: version.id,
          entityLabel: `BOM version ${version.versionNumber}`,
          makerUserId: version.bom.createdByUserId,
          transactionDate,
          idempotencyKey: dto.idempotencyKey,
          signatureMeaning: dto.signatureMeaning,
          note: dto.note,
          reauthenticationPassword: dto.reauthenticationPassword,
          fallbackPermissionKey: "manufacturing.master.manage",
        });
        if (!progress.complete) {
          const pending = await tx.manufacturingBomVersion.findUnique({
            where: { id: version.id },
            include: {
              approvedBy: { select: { name: true } },
              components: {
                orderBy: { sortOrder: "asc" },
                include: {
                  inventoryItem: { include: { manufacturingProfile: true } },
                  issueLocation: true,
                },
              },
            },
          });
          return { row: pending!, progress };
        }
        await tx.manufacturingBomVersion.updateMany({
          where: {
            bomId: version.bomId,
            status: "APPROVED",
            id: { not: version.id },
          },
          data: { status: "RETIRED", retiredAt: transactionDate },
        });
        const approved = await tx.manufacturingBomVersion.update({
          where: { id: version.id },
          data: {
            status: "APPROVED",
            approvedAt: transactionDate,
            approvedByUserId: currentUser.id,
          },
          include: {
            approvedBy: { select: { name: true } },
            components: {
              orderBy: { sortOrder: "asc" },
              include: {
                inventoryItem: { include: { manufacturingProfile: true } },
                issueLocation: true,
              },
            },
          },
        });
        return { row: approved, progress };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      ...this.mapBomVersion(result.row),
      approvalProgress: result.progress,
    };
  }

  private orderInclude() {
    return {
      finishedProduct: { include: { manufacturingProfile: true } },
      bomVersion: { include: { bom: true } },
      issueWarehouse: true,
      receiptWarehouse: true,
      issueLocation: true,
      receiptLocation: true,
      materials: {
        orderBy: { createdAt: "asc" as const },
        include: { inventoryItem: { include: { manufacturingProfile: true } } },
      },
      lots: { orderBy: { sequence: "asc" as const } },
      workflowReviews: {
        orderBy: { createdAt: "asc" as const },
        include: { createdBy: { select: { name: true } } },
      },
      _count: { select: { operationExecutions: true } },
    };
  }

  private orderDetailInclude() {
    return {
      ...this.orderInclude(),
      reservations: {
        orderBy: { createdAt: "asc" as const },
        include: { lines: true },
      },
      transactions: {
        orderBy: [
          { transactionDate: "asc" as const },
          { createdAt: "asc" as const },
        ],
        include: {
          lines: {
            include: {
              stockMovements: {
                where: { voidedAt: null },
                orderBy: { createdAt: "asc" as const },
              },
              destinationInventoryLot: true,
              sourceInventoryLot: true,
              serialMovements: { include: { serial: true } },
            },
          },
          voucherEntry: { include: { lines: true } },
        },
      },
      qualityInspections: {
        orderBy: [
          { inspectedAt: "asc" as const },
          { createdAt: "asc" as const },
          { id: "asc" as const },
        ],
        include: { results: { orderBy: { sortOrder: "asc" as const } } },
      },
      serials: { orderBy: { serialNumber: "asc" as const } },
      packagingOrders: {
        where: { status: { notIn: ["CANCELLED" as const, "CLOSED" as const] } },
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
      costSnapshots: {
        orderBy: { versionNumber: "asc" as const },
        include: { lines: true, voucherEntry: { include: { lines: true } } },
      },
      operationExecutions: { include: { routingOperation: true } },
    };
  }

  private async mapOrder(db: Db, row: any) {
    const stock = await this.latestStock(db, row.workspaceId, {
      warehouseId: row.issueWarehouseId,
    });
    const reservations = await db.manufacturingReservationLine.groupBy({
      by: ["inventoryItemId"],
      where: {
        reservation: {
          workspaceId: row.workspaceId,
          status: { in: [...ACTIVE_RESERVATIONS] },
        },
      },
      _sum: { quantity: true, issuedQuantity: true, releasedQuantity: true },
    });
    const reserved = new Map(
      reservations.map((entry: any) => [
        entry.inventoryItemId,
        decimal(entry._sum.quantity)
          .sub(entry._sum.issuedQuantity ?? 0)
          .sub(entry._sum.releasedQuantity ?? 0)
          .toNumber(),
      ]),
    );
    const materialStatus = row.materials.some(
      (material: any) =>
        number(material.issuedQuantity) > 0 &&
        number(material.issuedQuantity) < number(material.plannedQuantity),
    )
      ? "PARTIALLY_ISSUED"
      : row.materials.every(
            (material: any) =>
              number(material.issuedQuantity) >=
              number(material.plannedQuantity),
          )
        ? "ISSUED"
        : row.materials.some(
              (material: any) => number(material.reservedQuantity) > 0,
            )
          ? "PARTIALLY_RESERVED"
          : "PLANNED";
    const summary = {
      id: row.id,
      workspaceId: row.workspaceId,
      orderNumber: row.orderNumber,
      orderType: row.type,
      status: row.status,
      finishedProductId: row.finishedProductId,
      finishedProductCode: row.finishedProduct.itemCode,
      finishedProductName: row.finishedProduct.itemName,
      bomVersionId: row.bomVersionId,
      bomNumber: row.bomVersion.bom.code,
      bomVersionNumber: row.bomVersion.versionNumber,
      routingVersionId: row.routingVersionId,
      operationExecutionCount:
        row._count?.operationExecutions ?? row.operationExecutions?.length ?? 0,
      plannedQuantity: number(row.plannedQuantity),
      completedQuantity: number(row.completedQuantity),
      unit: row.unit,
      priority: row.priority,
      sourceWarehouseId: row.issueWarehouseId,
      sourceWarehouseName: row.issueWarehouse.name,
      sourceLocationId: row.issueLocationId,
      sourceLocationCode: row.issueLocation?.code ?? null,
      sourceLocationName: row.issueLocation?.name ?? null,
      destinationWarehouseId: row.receiptWarehouseId,
      destinationWarehouseName: row.receiptWarehouse.name,
      destinationLocationId: row.receiptLocationId,
      destinationLocationCode: row.receiptLocation?.code ?? null,
      destinationLocationName: row.receiptLocation?.name ?? null,
      plannedStartDate: dateOnly(row.plannedStartDate) ?? "",
      plannedEndDate: dateOnly(row.plannedEndDate) ?? "",
      materialStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    return {
      ...summary,
      notes: row.notes,
      routingVersionId: row.routingVersionId,
      planId: row.planId,
      planLotId: row.lots.find((lot: any) => lot.planLotId)?.planLotId ?? null,
      materials: row.materials.map((material: any) => {
        const movement = stock.get(
          `${row.issueWarehouseId}:${material.inventoryItemId}`,
        );
        const onHand = movement ? number(movement.balanceQuantity) : 0;
        const packagingLotRequirements = (row.packagingOrders ?? []).reduce(
          (
            requirements: Record<string, Prisma.Decimal>,
            packagingOrder: any,
          ) => {
            const configurationLine =
              packagingOrder.packagingConfiguration.lines.find(
                (candidate: any) =>
                  candidate.inventoryItemId === material.inventoryItemId,
              );
            if (!configurationLine) return requirements;
            const coveredLots = packagingOrder.orderLotId
              ? row.lots.filter(
                  (lot: any) => lot.id === packagingOrder.orderLotId,
                )
              : row.lots;
            for (const lot of coveredLots) {
              const lotRequirement = packagingOrder.orderLotId
                ? decimal(configurationLine.quantity).mul(
                    packagingOrder.plannedQuantity,
                  )
                : calculateOrderLevelPackagingLotRequirement({
                    componentQuantityPerFinishedUnit:
                      configurationLine.quantity,
                    packagingPlannedQuantity: packagingOrder.plannedQuantity,
                    orderPlannedQuantity: row.plannedQuantity,
                    lots: row.lots.map((candidate: any) => ({
                      id: candidate.id,
                      plannedQuantity: candidate.plannedQuantity,
                    })),
                    orderLotId: lot.id,
                  });
              requirements[lot.id] = decimal(requirements[lot.id] ?? 0).add(
                lotRequirement,
              );
            }
            return requirements;
          },
          {},
        );
        return {
          id: material.id,
          inventoryItemId: material.inventoryItemId,
          itemCode: material.inventoryItem.itemCode,
          itemName: material.inventoryItem.itemName,
          itemRole: material.inventoryItem.manufacturingProfile?.role ?? null,
          unit: material.unit,
          plannedQuantity: number(material.plannedQuantity),
          reservedQuantity: number(material.reservedQuantity),
          issuedQuantity: number(material.issuedQuantity),
          returnedQuantity: number(material.returnedQuantity),
          consumedQuantity: number(material.consumedQuantity),
          scrappedQuantity: number(material.scrappedQuantity),
          availableQuantity: Math.max(
            0,
            onHand - (reserved.get(material.inventoryItemId) ?? 0),
          ),
          packagingLotRequirements: Object.fromEntries(
            Object.entries(
              packagingLotRequirements as Record<string, Prisma.Decimal>,
            ).map(([lotId, quantity]) => [
              lotId,
              quantity
                .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
                .toNumber(),
            ]),
          ),
          status: material.status,
          sourceWarehouseId: row.issueWarehouseId,
          sourceWarehouseName: row.issueWarehouse.name,
        };
      }),
      lots: row.lots.map((lot: any) => ({
        id: lot.id,
        lotNumber: lot.lotNumber,
        plannedQuantity: number(lot.plannedQuantity),
        completedQuantity: number(lot.completedQuantity),
        rejectedQuantity: number(lot.rejectedQuantity),
        status: lot.status,
        actualStartDate: iso(lot.startedAt),
        actualEndDate: iso(lot.completedAt),
      })),
      actionHistory: row.workflowReviews
        .filter((review: any) => review.workflowCode === "ORDER_ACTION")
        .map((review: any) => {
          const evidence = actionEvidence(review.evidence);
          return {
            id: review.id,
            kind: evidence.kind,
            fromStatus: evidence.fromStatus,
            toStatus: evidence.toStatus ?? row.status,
            transactionDate: review.transactionDate.toISOString(),
            note: review.note,
            performedBy: review.createdBy?.name ?? null,
            createdAt: review.createdAt.toISOString(),
          };
        }),
      reservations: (row.reservations ?? []).map((reservation: any) => ({
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        warehouseId: reservation.warehouseId,
        locationId: reservation.locationId,
        status: reservation.status,
        reservedAt: iso(reservation.reservedAt),
        releasedAt: iso(reservation.releasedAt),
        lines: (reservation.lines ?? []).map((line: any) => ({
          id: line.id,
          orderMaterialId: line.orderMaterialId,
          inventoryItemId: line.inventoryItemId,
          inventoryLotId: line.inventoryLotId,
          quantity: number(line.quantity),
          issuedQuantity: number(line.issuedQuantity),
          releasedQuantity: number(line.releasedQuantity),
          outstandingQuantity: decimal(line.quantity)
            .sub(line.issuedQuantity)
            .sub(line.releasedQuantity)
            .toNumber(),
          unit: line.unit,
        })),
      })),
      transactions: (row.transactions ?? []).map((transaction: any) => ({
        id: transaction.id,
        transactionNumber: transaction.transactionNumber,
        transactionType: transaction.transactionType,
        status: transaction.status,
        transactionDate: transaction.transactionDate.toISOString(),
        orderLotId: transaction.orderLotId,
        operationExecutionId: transaction.operationExecutionId,
        fromWarehouseId: transaction.fromWarehouseId,
        toWarehouseId: transaction.toWarehouseId,
        fromLocationId: transaction.fromLocationId,
        toLocationId: transaction.toLocationId,
        voucherEntryId: transaction.voucherEntryId,
        lines: (transaction.lines ?? []).map((line: any) => ({
          id: line.id,
          inventoryItemId: line.inventoryItemId,
          orderMaterialId: line.orderMaterialId,
          reservationLineId: line.reservationLineId,
          sourceInventoryLotId: line.sourceInventoryLotId,
          destinationInventoryLotId: line.destinationInventoryLotId,
          quantity: number(line.quantity),
          unit: line.unit,
          unitCost: number(line.unitCost),
          totalCost: number(line.totalCost),
          stockMovements: (line.stockMovements ?? []).map((movement: any) => ({
            id: movement.id,
            warehouseId: movement.warehouseId,
            movementType: movement.movementType,
            quantity: number(movement.quantity),
            unitCost: number(movement.unitCost),
            movementValue: number(movement.movementValue),
          })),
          sourceInventoryLot: line.sourceInventoryLot
            ? {
                id: line.sourceInventoryLot.id,
                lotNumber: line.sourceInventoryLot.lotNumber,
                warehouseId: line.sourceInventoryLot.warehouseId,
                availableQuantity: number(
                  line.sourceInventoryLot.availableQuantity,
                ),
                holdQuantity: number(line.sourceInventoryLot.holdQuantity),
                unitCost: number(line.sourceInventoryLot.unitCost),
              }
            : null,
          destinationInventoryLot: line.destinationInventoryLot
            ? {
                id: line.destinationInventoryLot.id,
                lotNumber: line.destinationInventoryLot.lotNumber,
                warehouseId: line.destinationInventoryLot.warehouseId,
                availableQuantity: number(
                  line.destinationInventoryLot.availableQuantity,
                ),
                holdQuantity: number(line.destinationInventoryLot.holdQuantity),
                unitCost: number(line.destinationInventoryLot.unitCost),
              }
            : null,
          serialNumbers: (line.serialMovements ?? []).map(
            (movement: any) => movement.serial.serialNumber,
          ),
        })),
        journal: transaction.voucherEntry
          ? {
              id: transaction.voucherEntry.id,
              status: transaction.voucherEntry.status,
              debit: number(transaction.voucherEntry.debit),
              credit: number(transaction.voucherEntry.credit),
            }
          : null,
      })),
      qualityInspections: (row.qualityInspections ?? []).map(
        (inspection: any) => ({
          id: inspection.id,
          inspectionNumber: inspection.inspectionNumber,
          inspectionType: inspection.inspectionType,
          status: inspection.status,
          orderLotId: inspection.orderLotId,
          operationExecutionId: inspection.operationExecutionId,
          sourceTransactionId: inspection.sourceTransactionId,
          sampleQuantity: number(inspection.sampleQuantity),
          acceptedQuantity: number(inspection.acceptedQuantity),
          rejectedQuantity: number(inspection.rejectedQuantity),
          holdQuantity: decimal(inspection.sampleQuantity)
            .sub(inspection.acceptedQuantity)
            .sub(inspection.rejectedQuantity)
            .toNumber(),
          holdReason: inspection.holdReason,
          inspectedAt: iso(inspection.inspectedAt),
          results: (inspection.results ?? []).map((result: any) => ({
            id: result.id,
            parameterCode: result.parameterCode,
            parameterName: result.parameterName,
            testMethod: result.testMethod,
            unit: result.unit,
            specificationMin:
              result.specificationMin == null
                ? null
                : number(result.specificationMin),
            specificationMax:
              result.specificationMax == null
                ? null
                : number(result.specificationMax),
            specificationText: result.specificationText,
            actualValue:
              result.actualValue == null ? null : number(result.actualValue),
            actualText: result.actualText,
            passed: result.passed,
            remarks: result.remarks,
          })),
        }),
      ),
      serials: (row.serials ?? []).map((serial: any) => ({
        id: serial.id,
        serialNumber: serial.serialNumber,
        orderLotId: serial.orderLotId,
        inventoryLotId: serial.inventoryLotId,
        warehouseId: serial.warehouseId,
        locationId: serial.locationId,
        status: serial.status,
        releasedAt: iso(serial.releasedAt),
      })),
      costSnapshots: (row.costSnapshots ?? []).map((snapshot: any) => ({
        id: snapshot.id,
        versionNumber: snapshot.versionNumber,
        status: snapshot.status,
        currency: snapshot.currency,
        materialCost: number(snapshot.materialCost),
        packagingCost: number(snapshot.packagingCost),
        labourCost: number(snapshot.labourCost),
        machineCost: number(snapshot.machineCost),
        overheadCost: number(snapshot.overheadCost),
        subcontractCost: number(snapshot.subcontractCost),
        otherCost: number(snapshot.otherCost),
        scrapRecovery: number(snapshot.scrapRecovery),
        varianceAmount: number(snapshot.varianceAmount),
        totalCost: number(snapshot.totalCost),
        completedQuantity: number(snapshot.completedQuantity),
        unitCost: number(snapshot.unitCost),
        voucherEntryId: snapshot.voucherEntryId,
        finalizedAt: iso(snapshot.finalizedAt),
      })),
      operationExecutions: [...(row.operationExecutions ?? [])]
        .sort(
          (left: any, right: any) =>
            (left.routingOperation?.sequence ?? 0) -
            (right.routingOperation?.sequence ?? 0),
        )
        .map((execution: any) => ({
          id: execution.id,
          orderLotId: execution.orderLotId,
          routingOperationId: execution.routingOperationId,
          operationSequence: execution.routingOperation?.sequence ?? null,
          operationCode: execution.routingOperation?.code ?? null,
          operationName: execution.routingOperation?.name ?? null,
          qcRequired: execution.routingOperation?.qcRequired ?? false,
          status: execution.status,
          plannedQuantity: number(execution.plannedQuantity),
          inputQuantity: number(execution.inputQuantity),
          goodQuantity: number(execution.goodQuantity),
          rejectedQuantity: number(execution.rejectedQuantity),
          scrapQuantity: number(execution.scrapQuantity),
          reworkQuantity: number(execution.reworkQuantity),
          startedAt: iso(execution.startedAt),
          completedAt: iso(execution.completedAt),
          pauseReason: execution.pauseReason,
        })),
      workflowReviews: (row.workflowReviews ?? [])
        .filter((review: any) => review.workflowCode !== "ORDER_ACTION")
        .map((review: any) => ({
          id: review.id,
          group: review.workflowGroup,
          workflowKey: review.workflowCode,
          outcome: review.outcome,
          status: review.status,
          reason: review.reason,
          transactionDate: iso(review.transactionDate),
        })),
    };
  }

  async listOrders(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const rows = await this.prisma.manufacturingOrder.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.status ? { status: query.status as any } : {}),
        ...(query.orderType ? { type: query.orderType as any } : {}),
        ...(query.warehouseId
          ? {
              OR: [
                { issueWarehouseId: query.warehouseId },
                { receiptWarehouseId: query.warehouseId },
              ],
            }
          : {}),
        ...(query.from || query.to
          ? {
              plannedStartDate: {
                ...(query.from ? { gte: asDate(query.from) } : {}),
                ...(query.to ? { lte: asDate(query.to) } : {}),
              },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                {
                  orderNumber: { contains: query.search, mode: "insensitive" },
                },
                {
                  finishedProduct: {
                    itemName: { contains: query.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: this.orderInclude(),
    });
    return Promise.all(rows.map((row) => this.mapOrder(this.prisma, row)));
  }

  async getOrder(currentUser: AuthenticatedRequestUser, orderId: string) {
    const scope = await this.scope(currentUser);
    const row = await this.prisma.manufacturingOrder.findFirst({
      where: { id: orderId, workspaceId: scope.id },
      include: this.orderDetailInclude(),
    });
    if (!row) throw new NotFoundException("Manufacturing order not found.");
    return this.mapOrder(this.prisma, row);
  }

  private async resolveApplicableQualitySpecification(
    db: Db,
    workspaceId: string,
    finishedProductId: string,
    when: Date,
  ): Promise<ApplicableQualitySpecification> {
    const candidates = await db.manufacturingControlRecord.findMany({
      where: {
        workspaceId,
        kind: "QUALITY_SPECIFICATION",
        status: "APPROVED",
        inventoryItemId: finishedProductId,
        approvedAt: { lte: when },
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: when } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: when } }] },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        versionNumber: true,
        effectiveFrom: true,
        effectiveTo: true,
        approvedAt: true,
        createdAt: true,
        payload: true,
      },
    });
    candidates.sort((left, right) => {
      const effectiveDifference =
        (right.effectiveFrom?.getTime() ?? Number.NEGATIVE_INFINITY) -
        (left.effectiveFrom?.getTime() ?? Number.NEGATIVE_INFINITY);
      if (effectiveDifference !== 0) return effectiveDifference;
      if (right.versionNumber !== left.versionNumber)
        return right.versionNumber - left.versionNumber;
      const approvalDifference =
        (right.approvedAt?.getTime() ?? 0) - (left.approvedAt?.getTime() ?? 0);
      if (approvalDifference !== 0) return approvalDifference;
      return right.createdAt.getTime() - left.createdAt.getTime();
    });
    const source = candidates[0];
    if (!source) {
      throw new BadRequestException(
        "No approved finished-good quality specification is effective for this product and transaction date. Create its Quality Specification, link approved Test Methods, and approve it before recording QC results.",
      );
    }
    const rawPayload =
      source.payload !== null &&
      typeof source.payload === "object" &&
      !Array.isArray(source.payload)
        ? (source.payload as Record<string, unknown>)
        : {};
    const rawParameters = Array.isArray(rawPayload.parameters)
      ? rawPayload.parameters
      : [];
    const methodIds = [
      ...new Set(
        rawParameters.flatMap((entry) => {
          if (
            entry === null ||
            typeof entry !== "object" ||
            Array.isArray(entry)
          )
            return [];
          const methodId = (entry as Record<string, unknown>)
            .testMethodRecordId;
          return typeof methodId === "string" && methodId.trim()
            ? [methodId.trim()]
            : [];
        }),
      ),
    ];
    const methods = methodIds.length
      ? await db.manufacturingControlRecord.findMany({
          where: { id: { in: methodIds }, workspaceId, kind: "TEST_METHOD" },
          select: {
            id: true,
            code: true,
            name: true,
            versionNumber: true,
            status: true,
          },
        })
      : [];
    try {
      return compileApplicableQualitySpecification(source, methods);
    } catch (error) {
      if (error instanceof QualitySpecificationValidationError) {
        throw new BadRequestException(
          `Approved quality specification ${source.code} v${source.versionNumber} is not executable: ${error.message}`,
        );
      }
      throw error;
    }
  }

  async getOrderQualitySpecification(
    currentUser: AuthenticatedRequestUser,
    orderId: string,
    transactionDate?: string,
  ) {
    const scope = await this.scope(currentUser);
    const order = await this.prisma.manufacturingOrder.findFirst({
      where: { id: orderId, workspaceId: scope.id },
      select: { finishedProductId: true },
    });
    if (!order) throw new NotFoundException("Manufacturing order not found.");
    const when = transactionDate
      ? asDate(transactionDate, "transactionDate")
      : new Date();
    return this.resolveApplicableQualitySpecification(
      this.prisma,
      scope.id,
      order.finishedProductId,
      when,
    );
  }

  async createOrder(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingOrderDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const entityId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingOrder",
      dto.idempotencyKey,
    );
    const numberingKey = `MFG:${dto.idempotencyKey}:PRODUCTION_ORDER`;
    const replay = await this.prisma.manufacturingOrder.findFirst({
      where: { id: entityId, workspaceId: scope.id },
      include: this.orderInclude(),
    });
    if (replay) return this.mapOrder(this.prisma, replay);
    const plannedStartDate = asDate(dto.plannedStartDate, "plannedStartDate");
    const plannedEndDate = asDate(dto.plannedEndDate, "plannedEndDate");
    if (plannedEndDate.getTime() < plannedStartDate.getTime())
      throw new BadRequestException(
        "plannedEndDate cannot be earlier than plannedStartDate.",
      );
    if (dto.planLotId && !dto.planId)
      throw new BadRequestException(
        "planLotId requires its parent production plan (planId).",
      );
    const source = await this.activeWarehouse(
      this.prisma,
      scope.id,
      dto.sourceWarehouseId,
      "Source warehouse",
      { companyId: scope.companyId, role: "RAW_MATERIAL" },
    );
    const destination = await this.activeWarehouse(
      this.prisma,
      scope.id,
      dto.destinationWarehouseId,
      "Destination warehouse",
      { companyId: scope.companyId, role: "FINISHED_GOODS" },
    );
    const settings = await this.prisma.manufacturingSettings.findUnique({
      where: { workspaceId: scope.id },
    });
    if (!settings)
      throw new BadRequestException(
        "Configure manufacturing settings before creating a production order.",
      );
    if (!settings.defaultRawMaterialWarehouseId)
      throw new BadRequestException(
        "Configure the default raw-material warehouse before creating a production order.",
      );
    if (!settings.defaultFinishedGoodsWarehouseId)
      throw new BadRequestException(
        "Configure the default finished-goods quality warehouse before creating a production order.",
      );
    if (source.id !== settings.defaultRawMaterialWarehouseId)
      throw new BadRequestException(
        "Production-order source warehouse must match the configured default raw-material warehouse.",
      );
    if (destination.id !== settings.defaultFinishedGoodsWarehouseId)
      throw new BadRequestException(
        "Production-order destination warehouse must match the configured default finished-goods quality warehouse.",
      );
    const sourceLocationId =
      dto.sourceLocationId ?? settings.defaultRawMaterialLocationId;
    const destinationLocationId =
      dto.destinationLocationId ?? settings.defaultFinishedGoodsHoldLocationId;
    const sourceLocation = await this.activeLocation(
      this.prisma,
      scope.id,
      source.id,
      sourceLocationId,
      "Source material location",
    );
    const destinationLocation = await this.activeLocation(
      this.prisma,
      scope.id,
      destination.id,
      destinationLocationId,
      "FG-Q receipt location",
    );
    if (!sourceLocation || !destinationLocation)
      throw new BadRequestException(
        "Source RM and destination FG-Q logical locations are required.",
      );
    if (sourceLocation.disposition !== "RELEASED")
      throw new BadRequestException(
        "Source material location must have RELEASED disposition.",
      );
    if (destinationLocation.disposition !== "QC_HOLD")
      throw new BadRequestException(
        "Production receipt location must have QC_HOLD disposition.",
      );
    if (
      source.id === destination.id &&
      sourceLocation.id === destinationLocation.id
    ) {
      throw new BadRequestException(
        "A shared physical warehouse requires distinct RM source and FG-Q receipt locations.",
      );
    }
    const version = await this.prisma.manufacturingBomVersion.findFirst({
      where: {
        id: dto.bomVersionId,
        status: "APPROVED",
        bom: {
          workspaceId: scope.id,
          finishedProductId: dto.finishedProductId,
          isActive: true,
        },
      },
      include: {
        bom: {
          include: {
            finishedProduct: {
              select: {
                id: true,
                itemCode: true,
                itemName: true,
                kind: true,
                status: true,
                unit: true,
                alternateUnit: true,
                alternateUnitConversion: true,
                manufacturingProfile: {
                  select: {
                    isActive: true,
                    role: true,
                    makeBuy: true,
                  },
                },
              },
            },
          },
        },
        components: {
          include: {
            inventoryItem: {
              select: {
                id: true,
                itemCode: true,
                itemName: true,
                kind: true,
                status: true,
                unit: true,
                alternateUnit: true,
                alternateUnitConversion: true,
                manufacturingProfile: {
                  select: { isActive: true, role: true },
                },
              },
            },
            issueLocation: { select: { warehouseId: true } },
          },
        },
      },
    });
    if (!version)
      throw new BadRequestException(
        "Production orders require an approved BOM version for the selected product.",
      );
    assertWithinBomEffectiveWindow(
      plannedStartDate,
      version,
      "Production order planned start date",
    );
    const outputProfile = version.bom.finishedProduct.manufacturingProfile;
    if (
      version.bom.finishedProduct.kind !== "PRODUCT" ||
      version.bom.finishedProduct.status !== "ACTIVE" ||
      !outputProfile?.isActive ||
      !["INTERMEDIATE", "BULK", "FINISHED_GOOD"].includes(
        outputProfile.role,
      ) ||
      !["MAKE", "BOTH"].includes(outputProfile.makeBuy)
    )
      throw new BadRequestException(
        "Production-order output must remain an active manufacturable product with a MAKE or BOTH profile.",
      );
    const requiredComponents = version.components.filter(
      (component) => !component.isOptional,
    );
    if (!requiredComponents.length)
      throw new BadRequestException(
        "Production orders require at least one non-optional BOM component.",
      );
    if (
      new Set(
        requiredComponents.map((component) => component.inventoryItemId),
      ).size !== requiredComponents.length
    )
      throw new BadRequestException(
        "The approved BOM contains duplicate required component items and cannot preserve controlled material-line identity; create and approve a corrected BOM version.",
      );
    const staleRequiredComponent = requiredComponents.find(
      (component) =>
        component.inventoryItem.kind !== "PRODUCT" ||
        component.inventoryItem.status !== "ACTIVE" ||
        !component.inventoryItem.manufacturingProfile?.isActive,
    );
    if (staleRequiredComponent)
      throw new BadRequestException(
        `Required BOM component ${staleRequiredComponent.inventoryItem.itemName} must remain an active inventory product with an active manufacturing profile.`,
      );
    const incompatibleLegacyIssueLocation = requiredComponents.find(
      (component) =>
        component.issueLocationId &&
        component.issueLocation?.warehouseId !== source.id,
    );
    if (incompatibleLegacyIssueLocation)
      throw new BadRequestException(
        `Required BOM component ${incompatibleLegacyIssueLocation.inventoryItem.itemName} has a legacy issue location outside the configured raw-material warehouse; create a new BOM version without a component warehouse override.`,
      );
    if (!text(dto.routingVersionId))
      throw new BadRequestException(
        "Production orders require an approved routing version with at least one operation.",
      );
    const routing = await this.prisma.manufacturingRoutingVersion.findFirst({
      where: {
        id: dto.routingVersionId,
        status: "APPROVED",
        routing: {
          workspaceId: scope.id,
          finishedProductId: dto.finishedProductId,
          isActive: true,
        },
      },
      select: {
        id: true,
        effectiveFrom: true,
        effectiveTo: true,
        operations: { select: { id: true }, take: 1 },
      },
    });
    if (!routing)
      throw new BadRequestException(
        "Routing version must be approved for the selected product.",
      );
    if (!routing.operations.length)
      throw new BadRequestException(
        "Production orders require an approved routing with at least one operation.",
      );
    assertWithinBomEffectiveWindow(
      plannedStartDate,
      routing,
      "Production order planned start date",
      "routing",
    );
    if (dto.planId) {
      const plan = await this.prisma.manufacturingPlan.findFirst({
        where: {
          id: dto.planId,
          workspaceId: scope.id,
          finishedProductId: dto.finishedProductId,
          status: { in: ["APPROVED", "RELEASED", "IN_PROGRESS"] },
        },
        select: { id: true, bomVersionId: true, routingVersionId: true },
      });
      if (!plan)
        throw new BadRequestException(
          "Plan must be approved and belong to the selected product.",
        );
      if (plan.bomVersionId !== version.id)
        throw new BadRequestException(
          "Production-order BOM version must match the selected production plan's pinned BOM version.",
        );
      if (
        plan.routingVersionId &&
        plan.routingVersionId !== routing.id
      )
        throw new BadRequestException(
          "Production-order routing version must match the selected production plan's pinned routing version.",
        );
    }
    if (text(dto.orderNumber))
      throw new BadRequestException(
        "Production order number is generated from the configured PRODUCTION_ORDER sequence; leave it blank.",
      );
    const submittedLots = dto.lots?.length
      ? dto.lots
      : [{ lotNumber: "", plannedQuantity: dto.plannedQuantity }];
    const normalizedOrder = manufacturingBaseQuantity(
      version.bom.finishedProduct,
      dto.plannedQuantity,
      dto.unit,
      "Production order quantity",
      4,
    );
    const normalizedBomOutput = manufacturingBaseQuantity(
      version.bom.finishedProduct,
      version.outputQuantity,
      version.outputUnit,
      "Approved BOM output quantity",
      4,
    );
    const normalizedComponents = requiredComponents.map((component) =>
      manufacturingBaseQuantity(
        component.inventoryItem,
        component.quantityPerOutput,
        component.unit,
        `BOM component ${component.inventoryItem.itemName} quantity`,
        6,
      ),
    );
    const lotConversions = submittedLots.map((lot, index) =>
      manufacturingBaseQuantity(
        version.bom.finishedProduct,
        lot.plannedQuantity,
        dto.unit,
        `Production lot ${index + 1} quantity`,
        4,
      ),
    );
    const lots = submittedLots.map((lot, index) => ({
      ...lot,
      plannedQuantity: lotConversions[index]!.quantity,
    }));
    const lotTotal = lots.reduce(
      (sum, lot) => sum.add(lot.plannedQuantity),
      decimal(0),
    );
    if (!lotTotal.equals(normalizedOrder.quantity))
      throw new BadRequestException(
        "Lot quantities must equal the production order quantity.",
      );
    const calculatedRequirements = calculateBomRequirements(
      requiredComponents.map((component, index) => ({
        materialId: component.inventoryItemId,
        unit: normalizedComponents[index]!.unit,
        quantityPerOutput: normalizedComponents[index]!.quantity.div(
          normalizedBomOutput.quantity,
        ).toString(),
        wastagePercent: component.scrapPercent,
      })),
      normalizedOrder.quantity,
    );
    const requirements = calculatedRequirements.map((requirement) => {
      const stored = requirement.requiredQuantity.toDecimalPlaces(
        4,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      if (stored.lessThanOrEqualTo(0))
        throw new BadRequestException(
          `Required stock quantity for material ${requirement.materialId} is below the minimum 4-decimal stock precision.`,
        );
      return { ...requirement, requiredQuantity: stored };
    });
    const requirementQuantityEvidence = calculatedRequirements.map(
      (requirement) => {
        const stored = requirements.find(
          (entry) => entry.materialId === requirement.materialId,
        )!.requiredQuantity;
        return {
          inventoryItemId: requirement.materialId,
          calculatedBaseQuantity: requirement.requiredQuantity.toString(),
          storedBaseQuantity: stored.toString(),
          unit: requirement.unit,
          storageDecimalPlaces: 4,
          storageRoundingMode: "ROUND_HALF_UP",
          storageRoundingApplied: !stored.equals(requirement.requiredQuantity),
        };
      },
    );
    const row = await this.serializable(async (tx) => {
      const replayInTransaction = await tx.manufacturingOrder.findFirst({
        where: { id: entityId, workspaceId: scope.id },
        include: this.orderInclude(),
      });
      if (replayInTransaction) return replayInTransaction;
      let planAllocationEvidence: Record<string, string | null> | null = null;
      if (dto.planId) {
        // A plan-level lock makes the read-check-insert allocation sequence
        // deterministic even when multiple order requests arrive together.
        // SERIALIZABLE remains the outer safety net for concurrent plan edits.
        await tx.$queryRaw<Array<{ locked: unknown }>>(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`manufacturing-plan-allocation:${scope.id}:${dto.planId}`}, 0)) AS locked`,
        );
        const plan = await tx.manufacturingPlan.findFirst({
          where: { id: dto.planId, workspaceId: scope.id },
          select: {
            id: true,
            status: true,
            finishedProductId: true,
            bomVersionId: true,
            routingVersionId: true,
            plannedQuantity: true,
            unit: true,
            plannedStartDate: true,
            plannedEndDate: true,
          },
        });
        if (
          !plan ||
          plan.finishedProductId !== dto.finishedProductId ||
          !["APPROVED", "RELEASED", "IN_PROGRESS"].includes(plan.status)
        )
          throw new BadRequestException(
            "Plan must be approved and belong to the selected product.",
          );
        if (plan.bomVersionId !== version.id)
          throw new BadRequestException(
            "Production-order BOM version must match the selected production plan's pinned BOM version.",
          );
        if (plan.routingVersionId && plan.routingVersionId !== routing.id)
          throw new BadRequestException(
            "Production-order routing version must match the selected production plan's pinned routing version.",
          );

        const planStartDay = dateOnly(plan.plannedStartDate)!;
        const planEndDay = dateOnly(plan.plannedEndDate)!;
        const orderStartDay = dateOnly(plannedStartDate)!;
        const orderEndDay = dateOnly(plannedEndDate)!;
        if (orderStartDay < planStartDay || orderEndDay > planEndDay)
          throw new BadRequestException(
            `Production-order dates must stay within the selected production plan (${planStartDay} to ${planEndDay}).`,
          );

        const normalizedPlan = manufacturingBaseQuantity(
          version.bom.finishedProduct,
          plan.plannedQuantity,
          plan.unit,
          "Production plan quantity",
          4,
        );
        if (
          normalizedPlan.unit.toLocaleLowerCase("en-US") !==
          normalizedOrder.unit.toLocaleLowerCase("en-US")
        )
          throw new BadRequestException(
            `Production-order unit must be compatible with the selected production plan unit (${plan.unit}).`,
          );

        const existingAllocations = await tx.manufacturingOrder.findMany({
          where: {
            workspaceId: scope.id,
            planId: plan.id,
            status: { not: "CANCELLED" },
          },
          select: { id: true, plannedQuantity: true, unit: true },
        });
        const allocatedQuantity = existingAllocations.reduce(
          (total, allocation) =>
            total.add(
              manufacturingBaseQuantity(
                version.bom.finishedProduct,
                allocation.plannedQuantity,
                allocation.unit,
                `Existing production order ${allocation.id} quantity`,
                4,
              ).quantity,
            ),
          decimal(0),
        );
        const totalAllocatedQuantity = allocatedQuantity.add(
          normalizedOrder.quantity,
        );
        if (totalAllocatedQuantity.greaterThan(normalizedPlan.quantity))
          throw new BadRequestException(
            `Production-order quantity exceeds the production plan's remaining quantity (${normalizedPlan.quantity.sub(allocatedQuantity).toString()} ${normalizedPlan.unit}).`,
          );

        if (dto.planLotId) {
          if (lots.length !== 1)
            throw new BadRequestException(
              "A production order linked to one plan lot must contain exactly one production lot.",
            );
          const planLot = await tx.manufacturingPlanLot.findFirst({
            where: { id: dto.planLotId, planId: plan.id },
            select: {
              id: true,
              status: true,
              plannedQuantity: true,
              plannedStartDate: true,
              plannedEndDate: true,
            },
          });
          if (!planLot)
            throw new BadRequestException(
              "Selected plan lot does not belong to the selected production plan.",
            );
          if (!["PLANNED", "RELEASED"].includes(planLot.status))
            throw new BadRequestException(
              "Selected plan lot must still be planned or released.",
            );
          const normalizedPlanLot = manufacturingBaseQuantity(
            version.bom.finishedProduct,
            planLot.plannedQuantity,
            plan.unit,
            "Production plan lot quantity",
            4,
          );
          if (!normalizedOrder.quantity.equals(normalizedPlanLot.quantity))
            throw new BadRequestException(
              `A plan-lot-linked production order must exactly allocate that lot's planned quantity (${normalizedPlanLot.quantity.toString()} ${normalizedPlanLot.unit}).`,
            );
          const lotStartDay =
            dateOnly(planLot.plannedStartDate) ?? planStartDay;
          const lotEndDay = dateOnly(planLot.plannedEndDate) ?? planEndDay;
          if (orderStartDay < lotStartDay || orderEndDay > lotEndDay)
            throw new BadRequestException(
              `Production-order dates must stay within the selected plan lot (${lotStartDay} to ${lotEndDay}).`,
            );
        }

        planAllocationEvidence = {
          planId: plan.id,
          planLotId: dto.planLotId ?? null,
          planQuantity: normalizedPlan.quantity.toString(),
          previouslyAllocatedQuantity: allocatedQuantity.toString(),
          orderAllocatedQuantity: normalizedOrder.quantity.toString(),
          totalAllocatedQuantity: totalAllocatedQuantity.toString(),
          unit: normalizedPlan.unit,
        };
      }
      const issued = await issueManufacturingDocumentNumberTx(
        tx,
        scope,
        currentUser.id,
        {
          documentKind: "PRODUCTION_ORDER",
          issuedAt: plannedStartDate,
          idempotencyKey: numberingKey,
          entityType: "ManufacturingOrder",
          entityId,
          validateIssuedAtOnReplay: true,
        },
      );
      const orderNumber = issued.documentNumber;
      const order = await tx.manufacturingOrder.create({
        data: {
          id: entityId,
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          orderNumber,
          type: dto.orderType,
          planId: dto.planId ?? null,
          finishedProductId: dto.finishedProductId,
          bomVersionId: version.id,
          routingVersionId: dto.routingVersionId,
          issueWarehouseId: source.id,
          receiptWarehouseId: destination.id,
          issueLocationId: sourceLocation.id,
          receiptLocationId: destinationLocation.id,
          plannedQuantity: normalizedOrder.quantity,
          unit: normalizedOrder.unit,
          plannedStartDate,
          plannedEndDate,
          notes: text(dto.notes),
          createdByUserId: currentUser.id,
          materials: {
            create: requirements.map((requirement) => {
              const component = requiredComponents.find(
                (entry) => entry.inventoryItemId === requirement.materialId,
              )!;
              return {
                bomComponentId: component.id,
                inventoryItemId: requirement.materialId,
                unit: requirement.unit ?? component.unit,
                plannedQuantity: requirement.requiredQuantity,
                requiredDate: plannedStartDate,
              };
            }),
          },
          lots: {
            create: lots.map((lot, index) => ({
              planLotId: index === 0 ? (dto.planLotId ?? null) : null,
              lotNumber:
                text(lot.lotNumber) ??
                `${orderNumber}-LOT-${String(index + 1).padStart(2, "0")}`,
              sequence: index + 1,
              plannedQuantity: lot.plannedQuantity,
            })),
          },
        },
        include: this.orderInclude(),
      });
      const operations = await tx.manufacturingRoutingOperation.findMany({
        where: { routingVersionId: dto.routingVersionId },
        orderBy: { sequence: "asc" },
      });
      if (!operations.length)
        throw new BadRequestException("Approved routing has no operations.");
      // Execution evidence is lot-specific. This lets a 2/3/3/2 production
      // plan progress independently without treating a later lot as already
      // executed merely because an earlier lot completed the same route.
      await tx.manufacturingOperationExecution.createMany({
        data: order.lots.flatMap((lot: any) =>
          operations.map((operation) => ({
            orderId: order.id,
            orderLotId: lot.id,
            routingOperationId: operation.id,
            plannedQuantity: lot.plannedQuantity,
          })),
        ),
      });
      const conversionEvidence = {
        stockBaseUnitAuthoritative: true,
        productionPlanAllocation: planAllocationEvidence,
        orderQuantity: normalizedOrder.evidence,
        bomOutput: normalizedBomOutput.evidence,
        lots: lotConversions.map((entry, index) => ({
          sequence: index + 1,
          lotNumber: order.lots[index]?.lotNumber ?? null,
          ...entry.evidence,
        })),
        components: normalizedComponents.map((entry, index) => ({
          sequence: index + 1,
          ...entry.evidence,
        })),
        calculatedMaterialRequirements: requirementQuantityEvidence,
      };
      await tx.manufacturingWorkflowReview.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          orderId: order.id,
          workflowGroup: "PRODUCTION_BATCH_ORDERS",
          workflowCode: "PRODUCTION_ORDER_UOM_NORMALIZED",
          entityType: "MANUFACTURING_ORDER",
          entityId: order.id,
          transactionDate: plannedStartDate,
          idempotencyKey: `ORDER:UOM:${dto.idempotencyKey}`,
          title: `${orderNumber} quantities normalized to stock/base units`,
          outcome: "EXECUTED",
          status: "APPROVED",
          evidence: conversionEvidence as Prisma.InputJsonValue,
          signatureHash: createHash("sha256")
            .update(JSON.stringify(conversionEvidence))
            .digest("hex"),
          approvedByUserId: currentUser.id,
          approvedAt: plannedStartDate,
          createdByUserId: currentUser.id,
        },
      });
      return tx.manufacturingOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: this.orderInclude(),
      });
    });
    return this.mapOrder(this.prisma, row);
  }

  async getReadiness(
    currentUser: AuthenticatedRequestUser,
    requestedWorkspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, requestedWorkspaceId);
    const currentUtcDay = new Date();
    currentUtcDay.setUTCHours(0, 0, 0, 0);
    const supportedDocumentKinds = [
      "BOM",
      "PRODUCTION_ORDER",
      "MATERIAL_REQUISITION",
      "MATERIAL_ISSUE",
      "MATERIAL_RETURN",
      "QC_INSPECTION",
      "PACKAGING_ORDER",
      "FINISHED_GOODS_RECEIPT",
      "QA_RELEASE",
    ] as const;
    const [
      settings,
      itemCount,
      approvedBomCount,
      approvedRoutingCount,
      documentSequences,
      electronicSignaturePolicyRecord,
    ] = await Promise.all([
      this.prisma.manufacturingSettings.findUnique({
        where: { workspaceId: scope.id },
      }),
      this.prisma.manufacturingItemProfile.count({
        where: { workspaceId: scope.id, isActive: true },
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
          operations: { some: {} },
        },
      }),
      this.prisma.manufacturingDocumentSequence.findMany({
        where: {
          workspaceId: scope.id,
          isActive: true,
          documentKind: { in: [...supportedDocumentKinds] },
        },
        select: { documentKind: true },
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
                { effectiveFrom: { lte: currentUtcDay } },
              ],
            },
            {
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: currentUtcDay } },
              ],
            },
          ],
        },
        orderBy: [{ approvedAt: "desc" }, { versionNumber: "desc" }],
        select: { id: true, code: true, versionNumber: true, payload: true },
      }),
    ]);
    const settingsScopeValid = Boolean(
      settings &&
      settings.tenantId === scope.tenantId &&
      settings.companyId === scope.companyId &&
      settings.workspaceId === scope.id,
    );
    const controlledQualityMode = Boolean(
      settings &&
      (settings.mode === "PHARMACEUTICAL" ||
        settings.mode === "HYBRID" ||
        settings.requireQcBeforeRelease),
    );
    const modePolicyValid = Boolean(
      settings &&
      (!["PHARMACEUTICAL", "HYBRID"].includes(settings.mode) ||
        settings.requireQcBeforeRelease),
    );

    const warehouseMappings = settings
      ? [
          {
            id: settings.defaultRawMaterialWarehouseId,
            label: "Raw-material warehouse",
            role: "RAW_MATERIAL" as const,
            required: true,
          },
          {
            id: settings.defaultWipWarehouseId,
            label: "WIP warehouse",
            role: "WIP" as const,
            required: true,
          },
          {
            id: settings.defaultFinishedGoodsWarehouseId,
            label: "Finished-goods quality warehouse",
            role: "FINISHED_GOODS" as const,
            required: true,
          },
          {
            id: settings.defaultFinishedGoodsReleasedWarehouseId,
            label: "Finished-goods released warehouse",
            role: "FINISHED_GOODS" as const,
            required: true,
          },
          {
            id: settings.defaultRejectedWarehouseId,
            label: "Rejected warehouse",
            role: "REJECTED" as const,
            required: false,
          },
          {
            id: settings.defaultScrapWarehouseId,
            label: "Scrap warehouse",
            role: "SCRAP" as const,
            required: false,
          },
        ]
      : [];
    const locationMappings = settings
      ? [
          {
            id: settings.defaultRawMaterialLocationId,
            warehouseId: settings.defaultRawMaterialWarehouseId,
            label: "RM-REL",
            dispositions: ["RELEASED"] as const,
          },
          {
            id: settings.defaultWipLocationId,
            warehouseId: settings.defaultWipWarehouseId,
            label: "WIP",
            dispositions: ["WIP"] as const,
          },
          {
            id: settings.defaultFinishedGoodsHoldLocationId,
            warehouseId: settings.defaultFinishedGoodsWarehouseId,
            label: "FG-Q",
            dispositions: ["QC_HOLD"] as const,
          },
          {
            id: settings.defaultFinishedGoodsReleaseLocationId,
            warehouseId: settings.defaultFinishedGoodsReleasedWarehouseId,
            label: "FG-R",
            dispositions: ["RELEASED"] as const,
          },
        ]
      : [];
    const ledgerMappings = settings
      ? [
          {
            id: settings.rawMaterialInventoryAccountId,
            label: "Raw-material inventory",
            expectedNature: "ASSET",
            required: true,
            policy: "INVENTORY_CONTROL" as const,
          },
          {
            id: settings.packagingInventoryAccountId,
            label: "Packaging inventory",
            expectedNature: "ASSET",
            required:
              settings.mode === "PHARMACEUTICAL" || settings.mode === "HYBRID",
            policy: "INVENTORY_CONTROL" as const,
          },
          {
            id: settings.wipInventoryAccountId,
            label: "WIP inventory",
            expectedNature: "ASSET",
            required: true,
            policy: "NON_CONTROL" as const,
          },
          {
            id: settings.finishedGoodsInventoryAccountId,
            label: "Finished-goods inventory",
            expectedNature: "ASSET",
            required: true,
            policy: "INVENTORY_CONTROL" as const,
          },
          {
            id: settings.manufacturingVarianceAccountId,
            label: "Manufacturing variance",
            expectedNature: null,
            required: false,
            policy: "NON_CONTROL" as const,
          },
          {
            id: settings.labourClearingAccountId,
            label: "Labour clearing",
            expectedNature: null,
            required: false,
            policy: "NON_CONTROL" as const,
          },
          {
            id: settings.overheadAbsorptionAccountId,
            label: "Overhead absorption",
            expectedNature: null,
            required: false,
            policy: "NON_CONTROL" as const,
          },
          {
            id: settings.scrapRecoveryAccountId,
            label: "Scrap inventory/recovery asset",
            expectedNature: "ASSET",
            required: false,
            policy: "INVENTORY_CONTROL" as const,
          },
        ]
      : [];
    const warehouseIds = [
      ...new Set(
        warehouseMappings
          .map((mapping) => mapping.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const locationIds = [
      ...new Set(
        locationMappings
          .map((mapping) => mapping.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const ledgerIds = [
      ...new Set(
        ledgerMappings
          .map((mapping) => mapping.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [warehouses, locations, ledgers] = await Promise.all([
      warehouseIds.length
        ? this.prisma.warehouse.findMany({
            where: {
              id: { in: warehouseIds },
              workspaceId: scope.id,
              companyId: scope.companyId,
              isActive: true,
              deletedAt: null,
            },
            select: {
              id: true,
              type: true,
              allowMaterialIssue: true,
            },
          })
        : Promise.resolve([]),
      locationIds.length
        ? this.prisma.manufacturingLocation.findMany({
            where: {
              id: { in: locationIds },
              workspaceId: scope.id,
              companyId: scope.companyId,
              isActive: true,
            },
            select: {
              id: true,
              warehouseId: true,
              disposition: true,
            },
          })
        : Promise.resolve([]),
      ledgerIds.length
        ? this.prisma.account.findMany({
            where: {
              id: { in: ledgerIds },
              companyId: scope.companyId,
              level: "LEDGER",
              status: "ACTIVE",
            },
            select: {
              id: true,
              code: true,
              nature: true,
              isSystem: true,
              isControlAccount: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const warehouseById = new Map(
      warehouses.map((warehouse) => [warehouse.id, warehouse]),
    );
    const warehouseMappingIsValid = (
      mapping: (typeof warehouseMappings)[number],
    ) => {
      const warehouse = mapping.id ? warehouseById.get(mapping.id) : null;
      return Boolean(
        warehouse &&
        !this.manufacturingWarehouseRoleIssue(warehouse, mapping.role),
      );
    };
    const requiredWarehouseMappings = warehouseMappings.filter(
      (mapping) => mapping.required,
    );
    const invalidConfiguredWarehouses = warehouseMappings.filter(
      (mapping) => mapping.id && !warehouseMappingIsValid(mapping),
    );
    const validRequiredWarehouseCount = requiredWarehouseMappings.filter(
      warehouseMappingIsValid,
    ).length;
    const warehouseReady = Boolean(
      settingsScopeValid &&
      requiredWarehouseMappings.length === 4 &&
      validRequiredWarehouseCount === requiredWarehouseMappings.length &&
      invalidConfiguredWarehouses.length === 0,
    );

    const locationById = new Map(
      locations.map((location) => [location.id, location]),
    );
    const locationMappingIsValid = (
      mapping: (typeof locationMappings)[number],
    ) => {
      const location = mapping.id ? locationById.get(mapping.id) : null;
      return Boolean(
        location &&
        mapping.warehouseId &&
        location.warehouseId === mapping.warehouseId &&
        (mapping.dispositions as readonly string[]).includes(
          location.disposition,
        ),
      );
    };
    const validLocationCount = locationMappings.filter(
      locationMappingIsValid,
    ).length;
    const mappedLocationIdentities = locationMappings
      .filter(locationMappingIsValid)
      .map((mapping) => `${mapping.warehouseId}:${mapping.id}`);
    const logicalLocationsAreDistinct =
      new Set(mappedLocationIdentities).size ===
      mappedLocationIdentities.length;
    const locationReady = Boolean(
      settingsScopeValid &&
      locationMappings.length === 4 &&
      validLocationCount === locationMappings.length &&
      logicalLocationsAreDistinct,
    );

    const ledgerById = new Map(ledgers.map((ledger) => [ledger.id, ledger]));
    const ledgerMappingIsValid = (mapping: (typeof ledgerMappings)[number]) => {
      const ledger = mapping.id ? ledgerById.get(mapping.id) : null;
      if (!ledger) return false;
      if (mapping.policy === "INVENTORY_CONTROL")
        return (
          ledger.code === INVENTORY_CONTROL_ACCOUNT_CODE &&
          ledger.nature === "ASSET" &&
          ledger.isSystem === true &&
          ledger.isControlAccount === true
        );
      return Boolean(
        !ledger.isControlAccount &&
          (!mapping.expectedNature || ledger.nature === mapping.expectedNature),
      );
    };
    const requiredLedgerMappings = ledgerMappings.filter(
      (mapping) => mapping.required,
    );
    const invalidConfiguredLedgers = ledgerMappings.filter(
      (mapping) => mapping.id && !ledgerMappingIsValid(mapping),
    );
    const configuredInventoryControlIds = ledgerMappings
      .filter(
        (mapping) => mapping.policy === "INVENTORY_CONTROL" && mapping.id,
      )
      .map((mapping) => mapping.id as string);
    const wipIsDistinctFromInventoryControl = Boolean(
      settings?.wipInventoryAccountId &&
        !configuredInventoryControlIds.includes(
          settings.wipInventoryAccountId,
        ),
    );
    const validRequiredLedgerCount =
      requiredLedgerMappings.filter(ledgerMappingIsValid).length;
    const ledgerReady = Boolean(
      settingsScopeValid &&
      validRequiredLedgerCount === requiredLedgerMappings.length &&
      invalidConfiguredLedgers.length === 0 &&
      wipIsDistinctFromInventoryControl,
    );

    const checks: any[] = [];
    checks.push({
      code: "SETTINGS",
      label: "Manufacturing settings",
      state: settingsScopeValid && modePolicyValid ? "READY" : "BLOCKED",
      count: settingsScopeValid && modePolicyValid ? 1 : 0,
      message: !settings
        ? "Configure manufacturing warehouses and ledgers."
        : !settingsScopeValid
          ? "Manufacturing settings do not belong to the active company and workspace."
          : !modePolicyValid
            ? "Pharmaceutical and hybrid manufacturing require quality release controls."
            : null,
      actionGroup: "SETUP_WORKFLOW_AUDIT",
      actionView: "manufacturing-settings",
    });
    const electronicSignaturePolicy = electronicSignaturePolicyRecord
      ? parseManufacturingElectronicSignaturePolicy(
          electronicSignaturePolicyRecord.payload,
        )
      : null;
    const electronicSignatureRequired = Boolean(
      settings?.electronicSignatureRequired,
    );
    const electronicSignatureReady = Boolean(
      !electronicSignatureRequired ||
      (electronicSignaturePolicy && !electronicSignaturePolicy.mfaRequired),
    );
    checks.push({
      code: "ELECTRONIC_SIGNATURE_POLICY",
      label: "Electronic-signature policy",
      state: electronicSignatureReady ? "READY" : "BLOCKED",
      count:
        electronicSignaturePolicyRecord && electronicSignaturePolicy ? 1 : 0,
      message: electronicSignatureReady
        ? null
        : electronicSignaturePolicy?.mfaRequired
          ? "The approved electronic-signature policy requires MFA, but manufacturing MFA verification is not configured."
          : "Configure an approved, valid manufacturing electronic-signature policy.",
      actionGroup: "SETUP_WORKFLOW_AUDIT",
      actionView: "electronic-signature-settings",
    });
    checks.push({
      code: "WAREHOUSES",
      label: "Manufacturing warehouses",
      state: warehouseReady ? "READY" : "BLOCKED",
      count: validRequiredWarehouseCount,
      message: warehouseReady
        ? null
        : invalidConfiguredWarehouses.length
          ? `Invalid or ineligible mappings: ${invalidConfiguredWarehouses.map((mapping) => mapping.label).join(", ")}.`
          : "Active, eligible RM, WIP, FG-Q and FG-R warehouses are required in this workspace.",
      actionGroup: "SETUP_WORKFLOW_AUDIT",
      actionView: "manufacturing-settings",
    });
    checks.push({
      code: "LOGICAL_LOCATIONS",
      label: "RM / WIP / FG-Q / FG-R locations",
      state: locationReady ? "READY" : "BLOCKED",
      count: validLocationCount,
      message: locationReady
        ? null
        : "Map four distinct active logical locations to their selected warehouses with RELEASED, WIP, QC_HOLD and RELEASED dispositions respectively.",
      actionGroup: "SETUP_WORKFLOW_AUDIT",
      actionView: "status-configuration",
    });
    checks.push({
      code: "LEDGERS",
      label: "Inventory ledgers",
      state: ledgerReady ? "READY" : "BLOCKED",
      count: validRequiredLedgerCount,
      message: ledgerReady
        ? null
        : invalidConfiguredLedgers.length
          ? `Invalid account mappings: ${invalidConfiguredLedgers.map((mapping) => mapping.label).join(", ")}.`
          : `${settings?.mode === "GENERAL" ? "Raw material and finished goods" : "Raw material, packaging and finished goods"} must use this company's protected Inventory Control (${INVENTORY_CONTROL_ACCOUNT_CODE}) account; WIP must use a distinct active non-control ASSET LEDGER account.`,
      actionGroup: "SETUP_WORKFLOW_AUDIT",
      actionView: "manufacturing-settings",
    });
    checks.push({
      code: "ITEMS",
      label: "Manufacturing item profiles",
      state: itemCount ? "READY" : "BLOCKED",
      count: itemCount,
      message: itemCount
        ? null
        : "Configure real inventory items for manufacturing.",
      actionGroup: "MASTERS_FORMULA",
      actionView: "manufactured-products",
    });
    checks.push({
      code: "BOM",
      label: "Approved BOM / Master Formula",
      state: approvedBomCount ? "READY" : "BLOCKED",
      count: approvedBomCount,
      message: approvedBomCount
        ? null
        : "At least one approved BOM is required.",
      actionGroup: "MASTERS_FORMULA",
      actionView: "bom-master-formula",
    });
    checks.push({
      code: "ROUTING",
      label: "Approved routing",
      state: approvedRoutingCount ? "READY" : "BLOCKED",
      count: approvedRoutingCount,
      message: approvedRoutingCount
        ? null
        : "Routing is required before operation execution can be audited.",
      actionGroup: "MASTERS_FORMULA",
      actionView: "production-routing",
    });
    const configuredKinds = new Set(
      documentSequences.map((sequence) => sequence.documentKind),
    );
    const requiredDocumentKinds = supportedDocumentKinds.filter(
      (kind) =>
        kind !== "PACKAGING_ORDER" &&
        (kind !== "QC_INSPECTION" || controlledQualityMode),
    );
    if (settings?.mode === "PHARMACEUTICAL" || settings?.mode === "HYBRID")
      requiredDocumentKinds.push("PACKAGING_ORDER");
    const missingDocumentKinds = requiredDocumentKinds.filter(
      (kind) => !configuredKinds.has(kind),
    );
    checks.push({
      code: "DOCUMENT_NUMBERING",
      label: "Controlled document numbering",
      state: missingDocumentKinds.length ? "BLOCKED" : "READY",
      count: documentSequences.length,
      message: missingDocumentKinds.length
        ? `Configure active sequences for: ${missingDocumentKinds.join(", ")}.`
        : null,
      actionGroup: "SETUP_WORKFLOW_AUDIT",
      actionView: "document-numbering",
    });
    return {
      workspaceId: scope.id,
      ready: checks.every((check) => check.state !== "BLOCKED"),
      evaluatedAt: new Date().toISOString(),
      checks,
      blockerCount: checks.filter((check) => check.state === "BLOCKED").length,
      warningCount: checks.filter((check) => check.state === "WARNING").length,
    };
  }

  async getDashboard(
    currentUser: AuthenticatedRequestUser,
    requestedWorkspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, requestedWorkspaceId);
    const rows = await this.prisma.manufacturingOrder.findMany({
      where: { workspaceId: scope.id },
      include: this.orderInclude(),
      orderBy: { updatedAt: "desc" },
    });
    const activeRows = rows.filter((row) =>
      (ACTIVE_ORDER_STATUSES as readonly string[]).includes(row.status),
    );
    const [stock, activeReservations, settings, wipTransactions] =
      await Promise.all([
        this.latestStock(this.prisma, scope.id),
        this.prisma.manufacturingReservation.findMany({
          where: {
            workspaceId: scope.id,
            status: { in: [...ACTIVE_RESERVATIONS] },
          },
          select: {
            orderId: true,
            warehouseId: true,
            lines: {
              select: {
                inventoryItemId: true,
                quantity: true,
                issuedQuantity: true,
                releasedQuantity: true,
              },
            },
          },
        }),
        this.prisma.manufacturingSettings.findUnique({
          where: { workspaceId: scope.id },
          select: { defaultWipWarehouseId: true },
        }),
        activeRows.length
          ? this.prisma.manufacturingTransaction.findMany({
              where: {
                workspaceId: scope.id,
                orderId: { in: activeRows.map((row) => row.id) },
                status: "POSTED",
                transactionType: {
                  in: [
                    "MATERIAL_ISSUE",
                    "MATERIAL_RETURN",
                    "PACKAGING_ISSUE",
                    "PACKAGING_RETURN",
                    "PRODUCTION_RECEIPT",
                  ],
                },
              },
              select: {
                status: true,
                transactionType: true,
                lines: {
                  select: {
                    inventoryItemId: true,
                    orderMaterialId: true,
                    stockMovements: {
                      where: { voidedAt: null },
                      select: {
                        warehouseId: true,
                        movementType: true,
                        quantity: true,
                        movementValue: true,
                        voidedAt: true,
                      },
                    },
                  },
                },
              },
            })
          : Promise.resolve([]),
      ]);
    const materialShortage = countOrdersWithMaterialShortage({
      orders: activeRows.map((order) => ({
        id: order.id,
        issueWarehouseId: order.issueWarehouseId,
        materials: order.materials.map((material) => ({
          inventoryItemId: material.inventoryItemId,
          plannedQuantity: material.plannedQuantity,
          issuedQuantity: material.issuedQuantity,
          returnedQuantity: material.returnedQuantity,
        })),
      })),
      stock: [...stock.values()].map((movement) => ({
        warehouseId: movement.warehouseId,
        inventoryItemId: movement.inventoryItemId,
        onHandQuantity: movement.balanceQuantity,
      })),
      reservations: activeReservations.flatMap((reservation) =>
        reservation.lines.map((line) => ({
          orderId: reservation.orderId,
          warehouseId: reservation.warehouseId,
          inventoryItemId: line.inventoryItemId,
          quantity: line.quantity,
          issuedQuantity: line.issuedQuantity,
          releasedQuantity: line.releasedQuantity,
        })),
      ),
    });
    const mapped = await Promise.all(
      rows.slice(0, 10).map((row) => this.mapOrder(this.prisma, row)),
    );
    const counts = new Map<string, number>();
    for (const row of rows)
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
    const completedToday = rows.filter(
      (row) =>
        row.actualEndAt &&
        row.actualEndAt >= todayStart &&
        row.actualEndAt < tomorrowStart,
    ).length;
    const wipValue = settings?.defaultWipWarehouseId
      ? calculateManufacturingWipBalance(
          wipTransactions,
          settings.defaultWipWarehouseId,
        ).value.toFixed(2)
      : "0.00";
    const recentReviews =
      await this.prisma.manufacturingWorkflowReview.findMany({
        where: { workspaceId: scope.id },
        include: { createdBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    return {
      workspaceId: scope.id,
      asOf: new Date().toISOString(),
      plannedOrders:
        (counts.get("DRAFT") ?? 0) + (counts.get("SUBMITTED") ?? 0),
      readyToStart:
        (counts.get("APPROVED") ?? 0) +
        (counts.get("RESERVED") ?? 0) +
        (counts.get("ISSUED") ?? 0),
      materialShortage,
      inProduction: counts.get("IN_PRODUCTION") ?? 0,
      qualityHold: counts.get("QC_HOLD") ?? 0,
      releasePending: counts.get("COMPLETED") ?? 0,
      completedToday,
      wipValue,
      activeOrders: activeRows.length,
      orderPipeline: [...counts].map(([status, count]) => ({ status, count })),
      recentOrders: mapped,
      recentActivity: recentReviews.map((review) => ({
        id: review.id,
        occurredAt: review.createdAt.toISOString(),
        eventType: review.workflowCode,
        referenceId: review.entityId,
        referenceNumber: null,
        description: review.title,
        performedBy: review.createdBy?.name ?? null,
      })),
    };
  }

  private mapReview(row: any) {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      group: row.workflowGroup,
      workflowKey: row.workflowCode,
      entityType: row.entityType,
      entityId: row.entityId,
      outcome: row.outcome,
      status: row.status,
      reason: row.reason,
      note: row.note,
      reviewedBy: row.reviewedBy?.name ?? null,
      reviewedAt: iso(row.reviewedAt),
      approvedBy: row.approvedBy?.name ?? null,
      approvedAt: iso(row.approvedAt),
      transactionDate: row.transactionDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listWorkflowReviews(
    currentUser: AuthenticatedRequestUser,
    query: Query,
  ) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const rows = await this.prisma.manufacturingWorkflowReview.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.group ? { workflowGroup: query.group } : {}),
        ...(query.workflowKey ? { workflowCode: query.workflowKey } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.outcome ? { outcome: query.outcome as any } : {}),
        ...(query.status ? { status: query.status as any } : {}),
        ...(query.from || query.to
          ? {
              transactionDate: {
                ...(query.from ? { gte: asDate(query.from) } : {}),
                ...(query.to ? { lte: asDate(query.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        reviewedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
      orderBy: { transactionDate: "desc" },
    });
    return rows.map((row) => this.mapReview(row));
  }

  async createWorkflowReview(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingWorkflowReviewDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.requireDynamicPermission(
      currentUser,
      "manufacturing.audit.review",
    );
    if (dto.workflowKey === "ORDER_ACTION") {
      throw new ForbiddenException(
        "Executed or approved workflow evidence can only be created by its controlled manufacturing action.",
      );
    }
    const reason = text(dto.reason);
    if (!reason) {
      throw new BadRequestException(
        `${dto.outcome} requires a non-empty reason.`,
      );
    }
    const row = await this.prisma.manufacturingWorkflowReview.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        workflowGroup: dto.group,
        workflowCode: dto.workflowKey,
        entityType: dto.entityType ?? null,
        entityId: dto.entityId ?? null,
        transactionDate: asDate(dto.transactionDate),
        idempotencyKey: dto.idempotencyKey,
        title: dto.workflowKey,
        outcome: dto.outcome,
        status: "PENDING",
        reason,
        note: text(dto.note),
        evidence: dto.payload as Prisma.InputJsonValue | undefined,
        createdByUserId: currentUser.id,
      },
      include: {
        reviewedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    });
    return this.mapReview(row);
  }

  async transitionWorkflowReview(
    currentUser: AuthenticatedRequestUser,
    reviewId: string,
    dto: TransitionManufacturingWorkflowReviewDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.requireDynamicPermission(
      currentUser,
      "manufacturing.audit.review",
    );
    const transitionDate = asDate(dto.transactionDate, "transitionDate");
    const reason = text(dto.reason);
    const signatureMeaning = text(dto.signatureMeaning);
    const targetStatus =
      dto.action === "REVIEW"
        ? "REVIEWED"
        : dto.action === "APPROVE"
          ? "APPROVED"
          : "REJECTED";

    const row = await this.prisma.$transaction(
      async (tx) => {
        const current = await tx.manufacturingWorkflowReview.findFirst({
          where: { id: reviewId, workspaceId: scope.id },
        });
        if (!current || !current.outcome)
          throw new NotFoundException("Workflow review not found.");
        const allowed =
          dto.action === "REVIEW"
            ? current.status === "PENDING"
            : dto.action === "APPROVE"
              ? current.status === "REVIEWED"
              : current.status === "PENDING" || current.status === "REVIEWED";
        if (!allowed)
          throw new BadRequestException(
            `${dto.action} is not allowed from ${current.status}.`,
          );
        if (dto.action === "REJECT" && !reason)
          throw new BadRequestException("A rejection reason is required.");

        const settings = await tx.manufacturingSettings.findUnique({
          where: { workspaceId: scope.id },
          select: { approvalRequired: true, electronicSignatureRequired: true },
        });
        if (
          dto.action === "APPROVE" &&
          settings?.approvalRequired &&
          current.createdByUserId === currentUser.id
        ) {
          throw new ForbiddenException(
            "Maker-checker is enabled; the review creator cannot approve this decision.",
          );
        }
        if (settings?.electronicSignatureRequired && !signatureMeaning) {
          throw new BadRequestException(
            "Electronic-signature meaning is required for this review transition.",
          );
        }
        const electronicSignatureEvidence =
          await this.electronicSignature.enforce(tx, {
            scope,
            user: currentUser,
            actionLabel: `workflow review ${dto.action.toLowerCase()}`,
            signatureMeaning,
            reauthenticationPassword: dto.reauthenticationPassword,
            required: Boolean(settings?.electronicSignatureRequired),
          });
        const period = await tx.manufacturingPeriod.findFirst({
          where: {
            workspaceId: scope.id,
            periodStart: { lte: transitionDate },
            periodEnd: { gte: transitionDate },
          },
          select: { status: true },
        });
        if (period && period.status !== "OPEN") {
          throw new BadRequestException(
            `The manufacturing period is ${period.status.toLowerCase()}; workflow review changes are blocked.`,
          );
        }

        const signature = signatureMeaning
          ? createHash("sha256")
              .update(
                [
                  scope.id,
                  reviewId,
                  dto.action,
                  currentUser.id,
                  transitionDate.toISOString(),
                  signatureMeaning,
                ].join("|"),
              )
              .digest("hex")
          : current.signatureHash;
        const updated = await tx.manufacturingWorkflowReview.update({
          where: { id: current.id },
          data: {
            status: targetStatus,
            ...(reason ? { reason } : {}),
            signatureHash: signature,
            ...(dto.action === "REVIEW"
              ? { reviewedByUserId: currentUser.id, reviewedAt: transitionDate }
              : {}),
            ...(dto.action === "APPROVE"
              ? { approvedByUserId: currentUser.id, approvedAt: transitionDate }
              : {}),
          },
          include: {
            reviewedBy: { select: { name: true } },
            approvedBy: { select: { name: true } },
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            userId: currentUser.id,
            action: `MANUFACTURING_WORKFLOW_REVIEW_${dto.action}`,
            entityType: "MANUFACTURING_WORKFLOW_REVIEW",
            entityId: current.id,
            oldValues: { status: current.status } as Prisma.InputJsonValue,
            newValues: {
              status: targetStatus,
              reason,
              signatureMeaning: signatureMeaning ?? null,
              electronicSignaturePolicy: electronicSignatureEvidence,
            } as Prisma.InputJsonValue,
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.mapReview(row);
  }

  async performOrderAction(
    currentUser: AuthenticatedRequestUser,
    orderId: string,
    dto: ManufacturingOrderActionDto,
  ) {
    const scope = await this.scope(currentUser);
    const stagedActionScope = STAGED_ACTION_SCOPES[dto.kind];
    // Configured approval stages own their permissions. The approval service
    // enforces the existing static action permission when no staged workflow
    // is configured for this exact action scope.
    if (dto.kind !== "APPROVE" && !stagedActionScope) {
      await this.requireDynamicPermission(
        currentUser,
        ACTION_PERMISSIONS[dto.kind],
      );
    }
    const existing = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
      include: { createdBy: { select: { name: true } } },
    });
    if (existing) {
      const evidence = actionEvidence(existing.evidence);
      const expectedActionApprovalEntityId = stagedActionScope
        ? manufacturingActionApprovalEntityId({
            orderId,
            action: dto.kind,
            transactionDate: asDate(dto.transactionDate, "transactionDate"),
            lines: dto.lines,
            payload: jsonObject(dto.payload),
          })
        : null;
      if (
        existing.orderId !== orderId ||
        existing.workflowCode !== "ORDER_ACTION" ||
        evidence.kind !== dto.kind ||
        (expectedActionApprovalEntityId &&
          evidence.actionApprovalEntityId !== expectedActionApprovalEntityId)
      ) {
        throw new ConflictException(
          "Idempotency key was already used for another operation.",
        );
      }
      await this.requireOrderActionReplayPermission(
        currentUser,
        dto.kind,
        evidence,
      );
      const order = await this.getOrder(currentUser, orderId);
      return {
        order,
        action: this.mapAction(existing, evidence),
        transactionIds: evidence.transactionIds,
        stockMovementIds: evidence.stockMovementIds,
        replayed: true,
      };
    }
    try {
      let result: Awaited<
        ReturnType<ManufacturingService["executeAction"]>
      > | null = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          result = await this.prisma.$transaction(
            async (tx) =>
              this.executeAction(tx, scope, currentUser, orderId, dto),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
          break;
        } catch (error) {
          const retryable =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2034";
          if (!retryable || attempt === 3) throw error;
        }
      }
      if (!result)
        throw new ConflictException(
          "Manufacturing action could not be serialized after three attempts.",
        );
      const row = await this.prisma.manufacturingOrder.findFirst({
        where: { id: orderId, workspaceId: scope.id },
        include: this.orderInclude(),
      });
      if (!row) throw new NotFoundException("Manufacturing order not found.");
      return {
        order: await this.mapOrder(this.prisma, row),
        action: this.mapAction(
          result.review,
          actionEvidence(result.review.evidence),
        ),
        transactionIds: result.transactionIds,
        stockMovementIds: result.stockMovementIds,
        replayed: false,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const replay = await this.prisma.manufacturingWorkflowReview.findUnique(
          {
            where: {
              workspaceId_idempotencyKey: {
                workspaceId: scope.id,
                idempotencyKey: dto.idempotencyKey,
              },
            },
            include: { createdBy: { select: { name: true } } },
          },
        );
        if (replay?.orderId === orderId) {
          const evidence = actionEvidence(replay.evidence);
          const expectedActionApprovalEntityId = stagedActionScope
            ? manufacturingActionApprovalEntityId({
                orderId,
                action: dto.kind,
                transactionDate: asDate(dto.transactionDate, "transactionDate"),
                lines: dto.lines,
                payload: jsonObject(dto.payload),
              })
            : null;
          if (
            replay.workflowCode !== "ORDER_ACTION" ||
            evidence.kind !== dto.kind ||
            (expectedActionApprovalEntityId &&
              evidence.actionApprovalEntityId !==
                expectedActionApprovalEntityId)
          ) {
            throw new ConflictException(
              "Idempotency key was already used for another operation.",
            );
          }
          await this.requireOrderActionReplayPermission(
            currentUser,
            dto.kind,
            evidence,
          );
          return {
            order: await this.getOrder(currentUser, orderId),
            action: this.mapAction(replay, evidence),
            transactionIds: evidence.transactionIds,
            stockMovementIds: evidence.stockMovementIds,
            replayed: true,
          };
        }
      }
      throw error;
    }
  }

  private mapAction(review: any, evidence: ReturnType<typeof actionEvidence>) {
    return {
      id: review.id,
      kind: evidence.kind,
      fromStatus: evidence.fromStatus,
      toStatus: evidence.toStatus,
      transactionDate: review.transactionDate.toISOString(),
      note: review.note,
      signatureMeaning: evidence.signatureMeaning,
      approvalProgress: evidence.approvalProgress,
      performedBy: review.createdBy?.name ?? null,
      createdAt: review.createdAt.toISOString(),
    };
  }

  private async assertOperationIpcPassed(
    tx: Prisma.TransactionClient,
    scope: { id: string },
    order: any,
    execution: any,
    goodQuantity: Prisma.Decimal,
    when: Date,
  ) {
    if (!execution.routingOperation.qcRequired) {
      return {
        required: false,
        inspectionId: null,
        qualitySpecificationId: null,
      };
    }
    if (!execution.orderLotId)
      throw new BadRequestException(
        "A QC-required operation must be linked to a production lot before it can be completed.",
      );

    const specification = await this.resolveApplicableQualitySpecification(
      tx,
      scope.id,
      order.finishedProductId,
      when,
    );
    const latestInspection = [...order.qualityInspections]
      .filter(
        (inspection: any) =>
          inspection.inspectionType === "IN_PROCESS" &&
          inspection.orderId === order.id &&
          inspection.orderLotId === execution.orderLotId &&
          inspection.operationExecutionId === execution.id,
      )
      .at(-1);
    if (!latestInspection)
      throw new BadRequestException(
        `Operation ${execution.routingOperation.code} requires a posted in-process quality result before completion.`,
      );

    const matchingReview = [...order.workflowReviews]
      .reverse()
      .find((review: any) => {
        if (
          review.workflowCode !== "ORDER_ACTION" ||
          review.status !== "APPROVED"
        )
          return false;
        const evidence = jsonObject(review.evidence);
        const inspection = jsonObject(evidence.inProcessInspection);
        return (
          evidence.kind === "RECORD_IN_PROCESS_RESULT" &&
          inspection.inspectionId === latestInspection.id &&
          inspection.inspectionStatus === "PASSED" &&
          inspection.operationExecutionId === execution.id &&
          inspection.orderLotId === execution.orderLotId &&
          inspection.qualitySpecificationId === specification.id
        );
      });
    if (!matchingReview)
      throw new ConflictException(
        `The latest in-process result for operation ${execution.routingOperation.code} is not an approved PASS under the currently effective quality specification ${specification.code} v${specification.versionNumber}.`,
      );
    if (latestInspection.status !== "PASSED")
      throw new BadRequestException(
        `Operation ${execution.routingOperation.code} cannot complete while its latest in-process result is ${latestInspection.status}.`,
      );
    if (
      !decimal(latestInspection.sampleQuantity).equals(goodQuantity) ||
      !decimal(latestInspection.acceptedQuantity).equals(goodQuantity) ||
      !decimal(latestInspection.rejectedQuantity).isZero()
    )
      throw new BadRequestException(
        `Operation ${execution.routingOperation.code} in-process quantities must exactly match ${goodQuantity.toString()} good output with no rejected or held sample quantity. Record a corrected in-process result before completion.`,
      );
    if (
      !latestInspection.results?.length ||
      latestInspection.results.some((result: any) => result.passed !== true)
    )
      throw new BadRequestException(
        `Operation ${execution.routingOperation.code} cannot complete until every required in-process result is a PASS.`,
      );

    return {
      required: true,
      inspectionId: latestInspection.id,
      qualitySpecificationId: specification.id,
      qualitySpecificationCode: specification.code,
      qualitySpecificationVersion: specification.versionNumber,
      sampleQuantity: decimal(latestInspection.sampleQuantity).toString(),
      acceptedQuantity: decimal(latestInspection.acceptedQuantity).toString(),
      reviewedActionId: matchingReview.id,
    };
  }

  private async assertResponsibleOperationQualification(
    tx: Prisma.TransactionClient,
    scope: { id: string },
    settings: { mode?: string | null },
    execution: any,
    responsibleUserId: string,
    when: Date,
  ) {
    if (!["PHARMACEUTICAL", "HYBRID"].includes(settings.mode ?? "GENERAL"))
      return { required: false, trainingRecordId: null };

    const records = await tx.manufacturingControlRecord.findMany({
      where: {
        workspaceId: scope.id,
        kind: "VALIDATION_DOCUMENT",
        status: "APPROVED",
        approvedAt: { lte: when },
      },
      orderBy: [
        { approvedAt: "desc" },
        { versionNumber: "desc" },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        code: true,
        versionNumber: true,
        effectiveFrom: true,
        effectiveTo: true,
        payload: true,
      },
    });
    const transactionDay = when.toISOString().slice(0, 10);
    const applicable = records.find((record) => {
      const payload = jsonObject(record.payload);
      const details = jsonObject(payload.details);
      const scopeValue = text(details.qualificationScope);
      return (
        details.documentType === "TRAINING_RECORD" &&
        details.subjectUserId === responsibleUserId &&
        (scopeValue === "ALL" ||
          scopeValue === execution.routingOperation.id ||
          scopeValue === execution.routingOperation.code)
      );
    });
    if (!applicable)
      throw new ForbiddenException(
        `Operation ${execution.routingOperation.code} requires an approved, effective TRAINING_RECORD that qualifies its responsible operator.`,
      );
    const applicableDetails = jsonObject(
      jsonObject(applicable.payload).details,
    );
    if (
      (applicable.effectiveFrom &&
        applicable.effectiveFrom.toISOString().slice(0, 10) > transactionDay) ||
      (applicable.effectiveTo &&
        applicable.effectiveTo.toISOString().slice(0, 10) < transactionDay)
    )
      throw new ForbiddenException(
        `The current TRAINING_RECORD is not effective on the operation start date for ${execution.routingOperation.code}.`,
      );
    if (applicableDetails.qualificationOutcome !== "QUALIFIED")
      throw new ForbiddenException(
        `The current TRAINING_RECORD does not qualify the responsible operator for operation ${execution.routingOperation.code}.`,
      );
    return {
      required: true,
      trainingRecordId: applicable.id,
      trainingRecordCode: applicable.code,
      trainingRecordVersion: applicable.versionNumber,
      qualificationScope: text(applicableDetails.qualificationScope),
      qualificationOutcome: "QUALIFIED",
    };
  }

  private async materializeOperationWipOutput(
    tx: Prisma.TransactionClient,
    scope: { id: string; tenantId: string; companyId: string },
    user: AuthenticatedRequestUser,
    order: any,
    settings: any,
    execution: any,
    inputQuantity: Prisma.Decimal,
    goodQuantity: Prisma.Decimal,
    hasNextOperation: boolean,
    when: Date,
  ) {
    const orderLot = order.lots.find(
      (lot: any) => lot.id === execution.orderLotId,
    );
    if (!orderLot)
      throw new BadRequestException(
        "Completed operation must be linked to a production lot before WIP output can be controlled.",
      );
    const idempotencyKey = `MFG:OPERATION-WIP:${execution.id}`;
    const replay = await tx.manufacturingTransaction.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey,
        },
      },
      select: {
        id: true,
        status: true,
        orderId: true,
        orderLotId: true,
        operationExecutionId: true,
        lines: {
          select: {
            id: true,
            quantity: true,
            totalCost: true,
            destinationInventoryLotId: true,
          },
        },
      },
    });
    if (replay) {
      if (
        replay.status !== "POSTED" ||
        replay.orderId !== order.id ||
        replay.orderLotId !== orderLot.id ||
        replay.operationExecutionId !== execution.id
      )
        throw new ConflictException(
          "The operation WIP idempotency record does not match this order, lot and operation.",
        );
      const outputLine = replay.lines.find(
        (line) => line.destinationInventoryLotId,
      );
      const outputLot = outputLine?.destinationInventoryLotId
        ? await tx.manufacturingInventoryLot.findFirst({
            where: {
              id: outputLine.destinationInventoryLotId,
              workspaceId: scope.id,
              sourceTransactionLineId: outputLine.id,
            },
            select: {
              id: true,
              lotNumber: true,
              receivedQuantity: true,
            },
          })
        : null;
      const outputRequired = hasNextOperation && goodQuantity.greaterThan(0);
      if (
        outputRequired !== Boolean(outputLot) ||
        (outputLot && !decimal(outputLot.receivedQuantity).equals(goodQuantity))
      )
        throw new ConflictException(
          "The posted operation WIP output does not match the operation good quantity; use the controlled correction workflow.",
        );
      return {
        transactionId: replay.id,
        inventoryLotId: outputLot?.id ?? null,
        lotNumber: outputLot?.lotNumber ?? null,
        quantity: outputLot ? goodQuantity.toString() : "0",
        postedWipCost: outputLine
          ? decimal(outputLine.totalCost).toFixed(6)
          : "0.000000",
        finalOperationExcluded: !hasNextOperation,
        priorWipLotsConsumed: [],
        replayed: true,
        noStockMovement: true,
        noGeneralLedgerEntry: true,
      };
    }
    if (!settings.defaultWipWarehouseId || !settings.defaultWipLocationId)
      throw new BadRequestException(
        "A default WIP warehouse and WIP location are required before an operation can be completed.",
      );
    await this.activeWarehouse(
      tx,
      scope.id,
      settings.defaultWipWarehouseId,
      "WIP warehouse",
    );
    const outputLocation = await this.activeLocation(
      tx,
      scope.id,
      settings.defaultWipWarehouseId,
      settings.defaultWipLocationId,
      "WIP location",
    );
    if (
      !outputLocation ||
      !["WIP", "STAGING"].includes(outputLocation.disposition)
    )
      throw new BadRequestException(
        "The default WIP location must use the WIP or STAGING disposition.",
      );

    const sameLotExecutions = order.operationExecutions
      .filter(
        (entry: any) =>
          (entry.orderLotId ?? null) === (execution.orderLotId ?? null),
      )
      .sort(
        (left: any, right: any) =>
          left.routingOperation.sequence - right.routingOperation.sequence,
      );
    const executionIndex = sameLotExecutions.findIndex(
      (entry: any) => entry.id === execution.id,
    );
    const priorExecution =
      executionIndex > 0 ? sameLotExecutions[executionIndex - 1] : null;
    const priorOutputKey = priorExecution
      ? `MFG:OPERATION-WIP:${priorExecution.id}`
      : null;
    const priorOutputTransaction = priorOutputKey
      ? await tx.manufacturingTransaction.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: scope.id,
              idempotencyKey: priorOutputKey,
            },
          },
          select: { id: true },
        })
      : null;
    const priorLots = priorExecution
      ? await tx.manufacturingInventoryLot.findMany({
          where: {
            workspaceId: scope.id,
            inventoryItemId: order.finishedProductId,
            warehouseId: settings.defaultWipWarehouseId,
            availableQuantity: { gt: 0 },
            location: {
              isActive: true,
              disposition: { in: ["WIP", "STAGING"] },
            },
            sourceTransactionLine: {
              transaction: {
                orderId: order.id,
                orderLotId: orderLot.id,
                operationExecutionId: priorExecution.id,
                status: "POSTED",
              },
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : [];
    let remainingInput = inputQuantity;
    const parentPlans: Array<{
      lot: (typeof priorLots)[number];
      quantity: Prisma.Decimal;
    }> = [];
    for (const lot of priorLots) {
      if (remainingInput.lessThanOrEqualTo(0)) break;
      if (lot.expiresAt && lot.expiresAt < when)
        throw new BadRequestException(
          `Prior-operation WIP lot ${lot.lotNumber} is expired and cannot be consumed by ${execution.routingOperation.code}.`,
        );
      if (lot.retestDueAt && lot.retestDueAt < when)
        throw new BadRequestException(
          `Prior-operation WIP lot ${lot.lotNumber} has passed its retest-due date; approved QA retest evidence is required before ${execution.routingOperation.code}.`,
        );
      const transferable = Prisma.Decimal.max(
        decimal(0),
        decimal(lot.availableQuantity).sub(lot.reservedQuantity),
      );
      const quantity = Prisma.Decimal.min(transferable, remainingInput);
      if (quantity.greaterThan(0)) {
        parentPlans.push({ lot, quantity });
        remainingInput = remainingInput.sub(quantity);
      }
    }
    if (priorOutputTransaction && remainingInput.greaterThan(0))
      throw new BadRequestException(
        `Operation ${execution.routingOperation.code} requires ${inputQuantity.toString()} ${order.unit} of prior-operation WIP, but ${remainingInput.toString()} ${order.unit} is unavailable, reserved, on hold or outside the configured WIP warehouse.`,
      );

    const createOutput = hasNextOperation && goodQuantity.greaterThan(0);
    if (!createOutput && parentPlans.length === 0) {
      return {
        transactionId: null,
        inventoryLotId: null,
        lotNumber: null,
        quantity: "0",
        postedWipCost: "0.000000",
        finalOperationExcluded: true,
        noStockMovement: true,
        noGeneralLedgerEntry: true,
      };
    }

    const postedWipCost = order.transactions
      .filter(
        (transaction: any) =>
          transaction.status === "POSTED" &&
          (transaction.orderLotId === orderLot.id ||
            (order.lots.length === 1 && !transaction.orderLotId)) &&
          [
            "MATERIAL_ISSUE",
            "PACKAGING_ISSUE",
            "MATERIAL_RETURN",
            "PACKAGING_RETURN",
          ].includes(transaction.transactionType),
      )
      .reduce((total: Prisma.Decimal, transaction: any) => {
        const transactionCost = transaction.lines.reduce(
          (lineTotal: Prisma.Decimal, line: any) =>
            lineTotal.add(line.totalCost),
          decimal(0),
        );
        return transaction.transactionType.endsWith("RETURN")
          ? total.sub(transactionCost)
          : total.add(transactionCost);
      }, decimal(0))
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    if (postedWipCost.isNegative())
      throw new ConflictException(
        "Posted lot-level material returns exceed issues; operation WIP cost cannot be derived.",
      );
    const outputUnitCost = createOutput
      ? postedWipCost
          .div(goodQuantity)
          .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP)
      : decimal(0);
    const transactionId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingTransaction",
      idempotencyKey,
    );
    const outputLineId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingTransactionLine",
      `${idempotencyKey}:OUTPUT`,
    );
    const outputLotId = createOutput
      ? manufacturingEntityIdFromIdempotency(
          scope.id,
          "ManufacturingInventoryLot",
          `${idempotencyKey}:LOT`,
        )
      : null;
    const outputLotNumber = createOutput
      ? `${orderLot.lotNumber}-${execution.routingOperation.code}-WIP-${createHash(
          "sha256",
        )
          .update(execution.id)
          .digest("hex")
          .slice(0, 8)
          .toUpperCase()}`
      : null;
    const inputLines = parentPlans.map(({ lot, quantity }, index) => ({
      id: manufacturingEntityIdFromIdempotency(
        scope.id,
        "ManufacturingTransactionLine",
        `${idempotencyKey}:INPUT:${lot.id}:${index}`,
      ),
      inventoryItemId: lot.inventoryItemId,
      sourceInventoryLotId: lot.id,
      quantity,
      unit: lot.unit,
      unitCost: lot.unitCost,
      totalCost: decimal(lot.unitCost)
        .mul(quantity)
        .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP),
      notes: `Prior-operation WIP consumed by ${execution.routingOperation.code}`,
    }));
    await tx.manufacturingTransaction.create({
      data: {
        id: transactionId,
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        fiscalYearId: order.fiscalYearId,
        transactionNumber: compactReference("WIP-OP", execution.id),
        transactionType: "LOCATION_TRANSFER",
        status: "POSTED",
        transactionDate: when,
        orderId: order.id,
        orderLotId: orderLot.id,
        operationExecutionId: execution.id,
        fromWarehouseId: settings.defaultWipWarehouseId,
        toWarehouseId: settings.defaultWipWarehouseId,
        fromLocationId:
          parentPlans.length === 1 ? parentPlans[0].lot.locationId : null,
        toLocationId: createOutput ? outputLocation.id : null,
        referenceNo: order.orderNumber,
        notes: createOutput
          ? `Controlled WIP output for ${execution.routingOperation.code}`
          : `Final-operation WIP consumption for ${execution.routingOperation.code}`,
        idempotencyKey,
        createdByUserId: user.id,
        postedByUserId: user.id,
        postedAt: when,
        lines: {
          create: [
            ...inputLines,
            ...(createOutput
              ? [
                  {
                    id: outputLineId,
                    inventoryItemId: order.finishedProductId,
                    quantity: goodQuantity,
                    unit: order.unit,
                    unitCost: outputUnitCost,
                    totalCost: postedWipCost,
                    notes: `Operation WIP output for ${execution.routingOperation.code}`,
                  },
                ]
              : []),
          ],
        },
      },
    });
    for (const { lot, quantity } of parentPlans) {
      const consumed = await tx.manufacturingInventoryLot.updateMany({
        where: {
          id: lot.id,
          workspaceId: scope.id,
          warehouseId: lot.warehouseId,
          locationId: lot.locationId,
          availableQuantity: lot.availableQuantity,
          reservedQuantity: lot.reservedQuantity,
          holdQuantity: lot.holdQuantity,
          rejectedQuantity: lot.rejectedQuantity,
        },
        data: { availableQuantity: { decrement: quantity } },
      });
      if (consumed.count !== 1)
        throw new ConflictException(
          "Prior-operation WIP changed while completing the operation; retry with refreshed balances.",
        );
    }
    if (createOutput && outputLotId && outputLotNumber) {
      const profile = order.finishedProduct.manufacturingProfile;
      if (
        !profile?.isActive ||
        !["INTERMEDIATE", "BULK", "FINISHED_GOOD"].includes(profile.role)
      )
        throw new BadRequestException(
          "The manufactured product requires an active INTERMEDIATE, BULK or FINISHED_GOOD profile before WIP output can be created.",
        );
      const expiresAt = profile.shelfLifeDays
        ? new Date(when.getTime() + profile.shelfLifeDays * 86_400_000)
        : null;
      const retestDueAt =
        parentPlans
          .map(({ lot }) => lot.retestDueAt)
          .filter((value): value is Date => Boolean(value))
          .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
      await tx.manufacturingInventoryLot.create({
        data: {
          id: outputLotId,
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          inventoryItemId: order.finishedProductId,
          warehouseId: settings.defaultWipWarehouseId,
          locationId: outputLocation.id,
          lotNumber: outputLotNumber,
          receivedQuantity: goodQuantity,
          availableQuantity: goodQuantity,
          reservedQuantity: 0,
          holdQuantity: 0,
          rejectedQuantity: 0,
          unit: order.unit,
          unitCost: outputUnitCost,
          manufacturedAt: when,
          expiresAt,
          retestDueAt,
          sourceTransactionLineId: outputLineId,
          createdByUserId: user.id,
        },
      });
      await tx.manufacturingTransactionLine.update({
        where: { id: outputLineId },
        data: { destinationInventoryLotId: outputLotId },
      });
      let allocated = decimal(0);
      for (let index = 0; index < parentPlans.length; index += 1) {
        const parent = parentPlans[index];
        const quantity =
          index === parentPlans.length - 1
            ? goodQuantity.sub(allocated)
            : goodQuantity
                .mul(parent.quantity)
                .div(inputQuantity)
                .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        allocated = allocated.add(quantity);
        if (quantity.lessThanOrEqualTo(0)) continue;
        await tx.manufacturingGenealogy.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            orderId: order.id,
            orderLotId: orderLot.id,
            transactionLineId: outputLineId,
            parentInventoryLotId: parent.lot.id,
            childInventoryLotId: outputLotId,
            relationshipType: "OPERATION_WIP_OUTPUT",
            quantity,
            unit: order.unit,
            createdByUserId: user.id,
          },
        });
      }
    }
    return {
      transactionId,
      inventoryLotId: outputLotId,
      lotNumber: outputLotNumber,
      quantity: createOutput ? goodQuantity.toString() : "0",
      postedWipCost: createOutput ? postedWipCost.toFixed(6) : "0.000000",
      finalOperationExcluded: !hasNextOperation,
      priorWipLotsConsumed: parentPlans.map(({ lot, quantity }) => ({
        inventoryLotId: lot.id,
        quantity: quantity.toString(),
      })),
      noStockMovement: true,
      noGeneralLedgerEntry: true,
    };
  }

  private async executeAction(
    tx: Prisma.TransactionClient,
    scope: { id: string; tenantId: string; companyId: string },
    user: AuthenticatedRequestUser,
    orderId: string,
    dto: ManufacturingOrderActionDto,
  ) {
    const order = await tx.manufacturingOrder.findFirst({
      where: { id: orderId, workspaceId: scope.id },
      include: {
        finishedProduct: { include: { manufacturingProfile: true } },
        materials: {
          include: {
            inventoryItem: { include: { manufacturingProfile: true } },
          },
        },
        lots: true,
        reservations: { include: { lines: true } },
        transactions: {
          orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
          include: {
            lines: {
              include: { stockMovements: { where: { voidedAt: null } } },
            },
            voucherEntry: { include: { lines: true } },
          },
        },
        qualityInspections: {
          orderBy: [
            { inspectedAt: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
          ],
          include: { results: true },
        },
        serials: true,
        packagingOrders: {
          where: { status: { notIn: ["CANCELLED", "CLOSED"] } },
          include: {
            packagingConfiguration: {
              select: {
                lines: { select: { inventoryItemId: true, quantity: true } },
              },
            },
          },
        },
        costSnapshots: {
          orderBy: { versionNumber: "asc" },
          include: { lines: true, voucherEntry: { include: { lines: true } } },
        },
        operationExecutions: { include: { routingOperation: true } },
        workflowReviews: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new NotFoundException("Manufacturing order not found.");
    const settings = await tx.manufacturingSettings.findUnique({
      where: { workspaceId: scope.id },
    });
    if (!settings)
      throw new BadRequestException(
        "Manufacturing settings are not configured.",
      );
    const fromStatus = order.status;
    let toStatus = fromStatus;
    let stagedApprovalReview: any = null;
    let lifecycleEvidence: Record<string, unknown> = {};
    let statusConfigurationPolicy: Record<string, unknown> | null = null;
    const transactionIds: string[] = [];
    const stockMovementIds: string[] = [];
    const unitConversions: ManufacturingUnitConversionEvidence[] = [];
    const when = asDate(dto.transactionDate, "transactionDate");
    const payload = jsonObject(dto.payload);
    const signatureMeaning = text(dto.signatureMeaning);
    const stagedActionScope = STAGED_ACTION_SCOPES[dto.kind];
    const independentQualityApprovalRequired =
      dto.kind === "RECORD_QUALITY_RESULT" &&
      (settings.mode === "PHARMACEUTICAL" || settings.mode === "HYBRID");
    let qualityInspectorUserId = user.id;
    let qualityInspectedAt = when;
    const approvalIssues = stagedActionScope
      ? []
      : evaluateOrderActionApprovalControls({
          action: dto.kind,
          approvalRequired: settings.approvalRequired,
          electronicSignatureRequired: settings.electronicSignatureRequired,
          orderCreatorUserId: order.createdByUserId,
          actingUserId: user.id,
          signatureMeaning,
        });
    if (approvalIssues.includes("SIGNATURE_MEANING_REQUIRED")) {
      throw new BadRequestException(
        `Electronic-signature meaning is required for ${dto.kind}.`,
      );
    }
    if (approvalIssues.includes("MAKER_CHECKER_REQUIRED")) {
      throw new ForbiddenException(
        "Maker-checker is enabled; the production-order creator cannot approve the same order.",
      );
    }
    if (
      settings.approvalRequired &&
      ["AMEND", "CANCEL"].includes(dto.kind) &&
      ["APPROVED", "RESERVED"].includes(order.status) &&
      order.createdByUserId === user.id
    ) {
      throw new ForbiddenException(
        `Maker-checker is enabled; the production-order creator cannot ${dto.kind.toLowerCase()} an approved or reserved order.`,
      );
    }
    let directActionElectronicSignatureEvidence = null;
    if (
      !stagedActionScope &&
      dto.kind !== "APPROVE" &&
      isApprovalSensitiveOrderAction(dto.kind)
    ) {
      directActionElectronicSignatureEvidence =
        await this.electronicSignature.enforce(tx, {
          scope,
          user,
          actionLabel: `${dto.kind.replaceAll("_", " ").toLowerCase()} for ${order.orderNumber}`,
          signatureMeaning,
          reauthenticationPassword: dto.reauthenticationPassword,
          required: settings.electronicSignatureRequired,
        });
    }
    const actionSignatureHash = signatureMeaning
      ? createHash("sha256")
          .update(
            [
              scope.id,
              order.id,
              dto.kind,
              user.id,
              when.toISOString(),
              dto.idempotencyKey,
              signatureMeaning,
            ].join("|"),
          )
          .digest("hex")
      : null;
    await this.assertManufacturingPeriodOpen(tx, scope.id, when);

    let actionApprovalEntityId: string | null = null;
    if (stagedActionScope) {
      // Reject an action that cannot execute in the order's current state before
      // recording any configured approval stage. The switch below repeats these
      // guards at final execution so a status change between stages still fails
      // atomically without stock or GL mutation.
      if (dto.kind === "ISSUE_MATERIALS") {
        this.assertStatus(
          order.status,
          settings.reservationRequired
            ? ["RESERVED", "ISSUED", "IN_PRODUCTION"]
            : ["APPROVED", "RESERVED", "ISSUED", "IN_PRODUCTION"],
          dto.kind,
        );
      } else if (dto.kind === "COMPLETE_PRODUCTION") {
        this.assertStatus(order.status, ["IN_PRODUCTION"], dto.kind);
      } else if (dto.kind === "RECORD_IN_PROCESS_RESULT") {
        this.assertStatus(order.status, ["IN_PRODUCTION", "QC_HOLD"], dto.kind);
      } else if (dto.kind === "RECORD_QUALITY_RESULT") {
        this.assertStatus(order.status, ["COMPLETED", "QC_HOLD"], dto.kind);
      } else if (dto.kind === "QA_RELEASE") {
        this.assertStatus(
          order.status,
          ["COMPLETED", "QC_HOLD", "QA_RELEASED"],
          dto.kind,
        );
      }

      actionApprovalEntityId = manufacturingActionApprovalEntityId({
        orderId: order.id,
        action: dto.kind,
        transactionDate: when,
        lines: dto.lines,
        payload,
      });
      const progress = await this.approvalWorkflow.advance(tx, {
        scope,
        user,
        workflowScope: stagedActionScope,
        workflowGroup: this.actionGroup(dto.kind),
        workflowCode: "ORDER_ACTION",
        entityType: "MANUFACTURING_ORDER_ACTION",
        entityId: actionApprovalEntityId,
        orderId: order.id,
        entityLabel: `${dto.kind.replaceAll("_", " ").toLowerCase()} for ${order.orderNumber}`,
        makerUserId: order.createdByUserId,
        transactionDate: when,
        idempotencyKey: dto.idempotencyKey,
        signatureMeaning: dto.signatureMeaning,
        reauthenticationPassword: dto.reauthenticationPassword,
        note: dto.note,
        evidence: {
          kind: dto.kind,
          orderId: order.id,
          actionApprovalEntityId,
          fromStatus,
          toStatus: fromStatus,
          transactionIds,
          stockMovementIds,
          ...(["RECORD_IN_PROCESS_RESULT", "RECORD_QUALITY_RESULT"].includes(
            dto.kind,
          )
            ? { qcSubmission: payload }
            : {}),
        },
        fallbackPermissionKey: ACTION_PERMISSIONS[dto.kind],
        fallbackMakerCheckerRequired: independentQualityApprovalRequired,
        fallbackElectronicSignatureRequired:
          dto.kind === "QA_RELEASE" ||
          dto.kind === "RECORD_IN_PROCESS_RESULT" ||
          independentQualityApprovalRequired,
        ...(independentQualityApprovalRequired
          ? {
              fallbackStages: [
                { permissionKey: "manufacturing.quality.inspect" },
                { permissionKey: "manufacturing.quality.release" },
              ],
              minimumStages: 2,
            }
          : {}),
      });
      stagedApprovalReview = progress.review;
      if (independentQualityApprovalRequired && progress.complete) {
        const inspectorApproval = progress.stageApprovers[0];
        if (
          !inspectorApproval ||
          !inspectorApproval.userId ||
          inspectorApproval.userId === user.id
        ) {
          throw new ForbiddenException(
            "A pharmaceutical or hybrid lot QC result requires an independent approver distinct from the inspector.",
          );
        }
        qualityInspectorUserId = inspectorApproval.userId;
        qualityInspectedAt = inspectorApproval.transactionDate;
      }
      if (!progress.complete) {
        const interimEvidence = {
          ...jsonObject(progress.review.evidence),
          kind: dto.kind,
          orderId: order.id,
          actionApprovalEntityId,
          fromStatus,
          toStatus: fromStatus,
          transactionIds,
          stockMovementIds,
        };
        const review = await tx.manufacturingWorkflowReview.update({
          where: { id: progress.review.id },
          data: { evidence: interimEvidence as Prisma.InputJsonValue },
          include: { createdBy: { select: { name: true } } },
        });
        return { review, transactionIds, stockMovementIds };
      }
    }

    switch (dto.kind) {
      case "SUBMIT":
        this.assertStatus(order.status, ["DRAFT"], dto.kind);
        toStatus = "SUBMITTED";
        await tx.manufacturingOrder.update({
          where: { id: order.id },
          data: { status: toStatus, submittedAt: when },
        });
        break;
      case "APPROVE":
        this.assertStatus(order.status, ["SUBMITTED"], dto.kind);
        {
          const progress = await this.approvalWorkflow.advance(tx, {
            scope,
            user,
            workflowScope: "PRODUCTION_ORDER",
            workflowGroup: "PRODUCTION_BATCH_ORDERS",
            workflowCode: "ORDER_ACTION",
            entityType: "MANUFACTURING_ORDER",
            entityId: order.id,
            orderId: order.id,
            entityLabel: `production order ${order.orderNumber}`,
            makerUserId: order.createdByUserId,
            transactionDate: when,
            idempotencyKey: dto.idempotencyKey,
            signatureMeaning: dto.signatureMeaning,
            note: dto.note,
            reauthenticationPassword: dto.reauthenticationPassword,
            evidence: {
              kind: dto.kind,
              fromStatus,
              toStatus: "SUBMITTED",
              transactionIds,
              stockMovementIds,
            },
            fallbackPermissionKey: "manufacturing.order.approve",
          });
          toStatus = progress.complete ? "APPROVED" : "SUBMITTED";
          const stagedEvidence = {
            ...jsonObject(progress.review.evidence),
            kind: dto.kind,
            fromStatus,
            toStatus,
            transactionIds,
            stockMovementIds,
          };
          stagedApprovalReview = await tx.manufacturingWorkflowReview.update({
            where: { id: progress.review.id },
            data: { evidence: stagedEvidence as Prisma.InputJsonValue },
            include: { createdBy: { select: { name: true } } },
          });
          if (progress.complete) {
            await tx.manufacturingOrder.update({
              where: { id: order.id },
              data: {
                status: toStatus,
                approvedAt: when,
                approvedByUserId: user.id,
              },
            });
          }
        }
        break;
      case "RESERVE_MATERIALS": {
        this.assertStatus(order.status, ["APPROVED", "RESERVED"], dto.kind);
        for (const material of order.materials) {
          if (
            material.unit.trim().toLowerCase() !==
            material.inventoryItem.unit.trim().toLowerCase()
          ) {
            throw new BadRequestException(
              `Order material ${material.inventoryItem.itemName} is not stored in its authoritative stock/base unit (${material.inventoryItem.unit}). Recreate or normalize the draft order before reserving stock.`,
            );
          }
        }
        const reservationRequirements = order.materials
          .map((material: any) => ({
            material,
            quantity: decimal(material.plannedQuantity)
              .sub(material.issuedQuantity)
              .sub(material.reservedQuantity),
          }))
          .filter((entry: any) => entry.quantity.greaterThan(0));
        if (!reservationRequirements.length)
          throw new BadRequestException(
            "No remaining material quantity is available to reserve.",
          );
        const lotTrackedBlockers =
          findUnallocatedLotTrackedReservationMaterials(
            order.materials.map((material: any) => ({
              itemName: material.inventoryItem.itemName,
              lotTracked: Boolean(
                material.inventoryItem.manufacturingProfile?.lotTracked,
              ),
              plannedQuantity: material.plannedQuantity,
              issuedQuantity: material.issuedQuantity,
              reservedQuantity: material.reservedQuantity,
            })),
          );
        if (lotTrackedBlockers.length) {
          throw new BadRequestException(
            `Direct reservation cannot safely allocate source lots for lot-tracked material(s): ${lotTrackedBlockers.join(", ")}. Create and approve a lot-specific Material Requisition instead.`,
          );
        }
        const stock = await this.latestStock(tx, scope.id, {
          warehouseId: order.issueWarehouseId,
        });
        const active = await tx.manufacturingReservationLine.groupBy({
          by: ["inventoryItemId"],
          where: {
            reservation: {
              workspaceId: scope.id,
              warehouseId: order.issueWarehouseId,
              status: { in: [...ACTIVE_RESERVATIONS] },
              orderId: { not: order.id },
            },
          },
          _sum: {
            quantity: true,
            issuedQuantity: true,
            releasedQuantity: true,
          },
        });
        const activeByItem = new Map(
          active.map((entry) => [
            entry.inventoryItemId,
            decimal(entry._sum.quantity)
              .sub(entry._sum.issuedQuantity ?? 0)
              .sub(entry._sum.releasedQuantity ?? 0)
              .toNumber(),
          ]),
        );
        for (const {
          material,
          quantity: requiredQuantity,
        } of reservationRequirements) {
          const required = requiredQuantity.toNumber();
          const movement = stock.get(
            `${order.issueWarehouseId}:${material.inventoryItemId}`,
          );
          const reservedByOtherOrders =
            activeByItem.get(material.inventoryItemId) ?? 0;
          const check = evaluateReservationAvailability({
            onHandQuantity: movement?.balanceQuantity ?? 0,
            totalReservedQuantity: reservedByOtherOrders,
            currentOrderReservedQuantity: 0,
            requestedOrderQuantity: Math.max(0, required),
          });
          if (!check.canReserve)
            throw new BadRequestException(
              `Insufficient available stock for ${material.inventoryItem.itemName}; shortage ${check.shortfallQuantity.toString()}.`,
            );
        }
        const reservation = await tx.manufacturingReservation.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            reservationNumber: compactReference("MR", dto.idempotencyKey),
            orderId: order.id,
            warehouseId: order.issueWarehouseId,
            locationId: order.issueLocationId ?? undefined,
            createdByUserId: user.id,
            lines: {
              create: reservationRequirements.map(
                ({ material, quantity }: any) => ({
                  orderMaterialId: material.id,
                  inventoryItemId: material.inventoryItemId,
                  quantity,
                  unit: material.unit,
                }),
              ),
            },
          },
          include: { lines: true },
        });
        for (const line of reservation.lines) {
          if (!line.orderMaterialId)
            throw new BadRequestException(
              "Reservation line is missing its order material reference.",
            );
          await tx.manufacturingOrderMaterial.update({
            where: { id: line.orderMaterialId },
            data: {
              reservedQuantity: { increment: line.quantity },
              status: "RESERVED",
            },
          });
        }
        toStatus = "RESERVED";
        await tx.manufacturingOrder.update({
          where: { id: order.id },
          data: { status: toStatus },
        });
        break;
      }
      case "RELEASE_RESERVATION": {
        this.assertStatus(
          order.status,
          [
            "APPROVED",
            "RESERVED",
            "ISSUED",
            "IN_PRODUCTION",
            "COMPLETED",
            "QC_HOLD",
            "QA_RELEASED",
          ],
          dto.kind,
        );
        const reservations = order.reservations.filter((reservation) =>
          (ACTIVE_RESERVATIONS as readonly string[]).includes(
            reservation.status,
          ),
        );
        const releasePlan = calculateReservationReleasePlan(
          reservations.flatMap((reservation: any) => reservation.lines),
        );
        const releaseByLineId = new Map(
          releasePlan.map((line) => [line.id, line.outstanding]),
        );
        const releaseByMaterialId = new Map<string, Prisma.Decimal>();
        for (const line of releasePlan) {
          if (line.orderMaterialId)
            releaseByMaterialId.set(
              line.orderMaterialId,
              (releaseByMaterialId.get(line.orderMaterialId) ?? decimal(0)).add(
                line.outstanding,
              ),
            );
        }
        for (const [materialId, quantity] of releaseByMaterialId) {
          const material = order.materials.find(
            (entry: any) => entry.id === materialId,
          );
          if (
            !material ||
            decimal(material.reservedQuantity).lessThan(quantity)
          ) {
            throw new BadRequestException(
              "Order-material reservation balance is no longer reconciled and cannot be released safely.",
            );
          }
        }
        for (const reservation of reservations) {
          let reservationReleased = false;
          for (const line of reservation.lines) {
            const remaining = releaseByLineId.get(line.id) ?? decimal(0);
            if (remaining.isZero()) continue;
            reservationReleased = true;
            await tx.manufacturingReservationLine.update({
              where: { id: line.id },
              data: { releasedQuantity: { increment: remaining } },
            });
            if (line.inventoryLotId && remaining.greaterThan(0)) {
              const inventoryLot = await tx.manufacturingInventoryLot.findFirst(
                {
                  where: {
                    id: line.inventoryLotId,
                    workspaceId: scope.id,
                    inventoryItemId: line.inventoryItemId,
                  },
                },
              );
              if (
                !inventoryLot ||
                decimal(inventoryLot.reservedQuantity).lessThan(remaining)
              ) {
                throw new BadRequestException(
                  "Source-lot reservation is no longer reconciled and cannot be released safely.",
                );
              }
              await tx.manufacturingInventoryLot.update({
                where: { id: inventoryLot.id },
                data: { reservedQuantity: { decrement: remaining } },
              });
            }
          }
          if (reservationReleased) {
            await tx.manufacturingReservation.update({
              where: { id: reservation.id },
              data: {
                status: "RELEASED",
                releasedAt: when,
                releasedByUserId: user.id,
                releaseReason: text(dto.note),
              },
            });
          }
        }
        for (const [materialId, quantity] of releaseByMaterialId) {
          const material = order.materials.find(
            (entry: any) => entry.id === materialId,
          )!;
          const newReserved = decimal(material.reservedQuantity).sub(quantity);
          const status = decimal(material.consumedQuantity).greaterThan(0)
            ? material.status
            : decimal(material.issuedQuantity).greaterThanOrEqualTo(
                  material.plannedQuantity,
                )
              ? "ISSUED"
              : decimal(material.issuedQuantity).greaterThan(0)
                ? "PARTIALLY_ISSUED"
                : newReserved.greaterThan(0)
                  ? "RESERVED"
                  : "PLANNED";
          await tx.manufacturingOrderMaterial.update({
            where: { id: materialId },
            data: { reservedQuantity: { decrement: quantity }, status },
          });
        }
        // Reservation cleanup must never move a progressed production order backwards.
        toStatus = order.status;
        break;
      }
      case "ISSUE_MATERIALS": {
        this.assertStatus(
          order.status,
          settings.reservationRequired
            ? ["RESERVED", "ISSUED", "IN_PRODUCTION"]
            : ["APPROVED", "RESERVED", "ISSUED", "IN_PRODUCTION"],
          dto.kind,
        );
        if (
          !settings.defaultWipWarehouseId ||
          !settings.rawMaterialInventoryAccountId ||
          !settings.wipInventoryAccountId
        )
          throw new BadRequestException(
            "WIP warehouse and RM/WIP LEDGER mappings are required before material issue.",
          );
        const orderLot = this.resolveActionOrderLot(order, dto, true);
        const lines = this.resolveMaterialLines(
          order,
          dto,
          "ISSUE",
          ["RAW_MATERIAL", "INTERMEDIATE", "BULK", "CONSUMABLE"],
          false,
          unitConversions,
        );
        this.assertLotIssueLimits(order, orderLot, lines, "MATERIAL_ISSUE");
        const allocatedLines = this.allocateReservationLines(
          order,
          lines,
          settings.reservationRequired,
        );
        const posted = await this.postTransferAndJournal(
          tx,
          scope,
          user,
          order,
          settings,
          dto,
          allocatedLines,
          order.issueWarehouseId,
          settings.defaultWipWarehouseId,
          "MATERIAL_ISSUE",
          settings.wipInventoryAccountId,
          settings.rawMaterialInventoryAccountId,
          when,
          orderLot.id,
        );
        transactionIds.push(posted.transactionId);
        stockMovementIds.push(...posted.stockMovementIds);
        await this.applyReservationIssue(tx, order, allocatedLines);
        for (const line of lines) {
          const reservedReduction = Prisma.Decimal.min(
            line.quantity,
            line.reservedQuantity,
          );
          const newIssued = decimal(line.issuedQuantity).add(line.quantity);
          await tx.manufacturingOrderMaterial.update({
            where: { id: line.orderMaterialId },
            data: {
              issuedQuantity: { increment: line.quantity },
              reservedQuantity: { decrement: reservedReduction },
              status: newIssued.greaterThanOrEqualTo(line.plannedQuantity)
                ? "ISSUED"
                : "PARTIALLY_ISSUED",
            },
          });
        }
        const allNonPackagingIssued = order.materials
          .filter(
            (material: any) =>
              material.inventoryItem.manufacturingProfile?.role !==
              "PACKAGING_MATERIAL",
          )
          .every((material: any) => {
            const postedLine = lines.find(
              (line: any) => line.orderMaterialId === material.id,
            );
            return decimal(material.issuedQuantity)
              .add(postedLine?.quantity ?? 0)
              .greaterThanOrEqualTo(material.plannedQuantity);
          });
        toStatus =
          order.status === "IN_PRODUCTION"
            ? "IN_PRODUCTION"
            : allNonPackagingIssued
              ? "ISSUED"
              : order.status;
        await tx.manufacturingOrder.update({
          where: { id: order.id },
          data: { status: toStatus },
        });
        break;
      }
      case "RETURN_MATERIALS": {
        this.assertStatus(
          order.status,
          ["ISSUED", "IN_PRODUCTION", "QC_HOLD", "COMPLETED"],
          dto.kind,
        );
        if (
          !settings.defaultWipWarehouseId ||
          !settings.rawMaterialInventoryAccountId ||
          !settings.wipInventoryAccountId
        )
          throw new BadRequestException(
            "WIP warehouse and RM/WIP LEDGER mappings are required before material return.",
          );
        const orderLot = this.resolveActionOrderLot(order, dto, true);
        const lines = this.resolveMaterialLines(
          order,
          dto,
          "RETURN",
          ["RAW_MATERIAL", "INTERMEDIATE", "BULK", "CONSUMABLE"],
          false,
          unitConversions,
        );
        this.assertLotReturnLimits(order, orderLot, lines, "MATERIAL_RETURN");
        const posted = await this.postTransferAndJournal(
          tx,
          scope,
          user,
          order,
          settings,
          dto,
          lines,
          settings.defaultWipWarehouseId,
          order.issueWarehouseId,
          "MATERIAL_RETURN",
          settings.rawMaterialInventoryAccountId,
          settings.wipInventoryAccountId,
          when,
          orderLot.id,
        );
        transactionIds.push(posted.transactionId);
        stockMovementIds.push(...posted.stockMovementIds);
        for (const line of lines)
          await tx.manufacturingOrderMaterial.update({
            where: { id: line.orderMaterialId },
            data: {
              returnedQuantity: { increment: line.quantity },
              status: "PARTIALLY_RETURNED",
            },
          });
        break;
      }
      case "PACKAGING_ISSUE": {
        this.assertStatus(
          order.status,
          ["RESERVED", "ISSUED", "IN_PRODUCTION", "COMPLETED", "QC_HOLD"],
          dto.kind,
        );
        if (
          !settings.defaultWipWarehouseId ||
          !settings.packagingInventoryAccountId ||
          !settings.wipInventoryAccountId
        )
          throw new BadRequestException(
            "WIP warehouse and Packaging/WIP LEDGER mappings are required before packaging issue.",
          );
        const orderLot = this.resolveActionOrderLot(order, dto, true);
        const lines = this.resolveMaterialLines(
          order,
          dto,
          "ISSUE",
          ["PACKAGING_MATERIAL"],
          true,
          unitConversions,
        );
        this.assertLotIssueLimits(order, orderLot, lines, "PACKAGING_ISSUE");
        const allocatedLines = this.allocateReservationLines(
          order,
          lines,
          settings.reservationRequired,
        );
        const posted = await this.postTransferAndJournal(
          tx,
          scope,
          user,
          order,
          settings,
          dto,
          allocatedLines,
          order.issueWarehouseId,
          settings.defaultWipWarehouseId,
          "PACKAGING_ISSUE",
          settings.wipInventoryAccountId,
          settings.packagingInventoryAccountId,
          when,
          orderLot.id,
        );
        transactionIds.push(posted.transactionId);
        stockMovementIds.push(...posted.stockMovementIds);
        await this.applyReservationIssue(tx, order, allocatedLines);
        for (const line of lines) {
          const reservedReduction = Prisma.Decimal.min(
            line.quantity,
            line.reservedQuantity,
          );
          const newIssued = decimal(line.issuedQuantity).add(line.quantity);
          await tx.manufacturingOrderMaterial.update({
            where: { id: line.orderMaterialId },
            data: {
              issuedQuantity: { increment: line.quantity },
              reservedQuantity: { decrement: reservedReduction },
              status: newIssued.greaterThanOrEqualTo(line.plannedQuantity)
                ? "ISSUED"
                : "PARTIALLY_ISSUED",
            },
          });
        }
        break;
      }
      case "PACKAGING_RETURN": {
        this.assertStatus(
          order.status,
          ["ISSUED", "IN_PRODUCTION", "COMPLETED", "QC_HOLD"],
          dto.kind,
        );
        if (
          !settings.defaultWipWarehouseId ||
          !settings.packagingInventoryAccountId ||
          !settings.wipInventoryAccountId
        )
          throw new BadRequestException(
            "WIP warehouse and Packaging/WIP LEDGER mappings are required before packaging return.",
          );
        const orderLot = this.resolveActionOrderLot(order, dto, true);
        const lines = this.resolveMaterialLines(
          order,
          dto,
          "RETURN",
          ["PACKAGING_MATERIAL"],
          true,
          unitConversions,
        );
        this.assertLotReturnLimits(order, orderLot, lines, "PACKAGING_RETURN");
        const posted = await this.postTransferAndJournal(
          tx,
          scope,
          user,
          order,
          settings,
          dto,
          lines,
          settings.defaultWipWarehouseId,
          order.issueWarehouseId,
          "PACKAGING_RETURN",
          settings.packagingInventoryAccountId,
          settings.wipInventoryAccountId,
          when,
          orderLot.id,
        );
        transactionIds.push(posted.transactionId);
        stockMovementIds.push(...posted.stockMovementIds);
        for (const line of lines)
          await tx.manufacturingOrderMaterial.update({
            where: { id: line.orderMaterialId },
            data: {
              returnedQuantity: { increment: line.quantity },
              status: "PARTIALLY_RETURNED",
            },
          });
        break;
      }
      case "START_PRODUCTION": {
        this.assertStatus(
          order.status,
          settings.issueBeforeOperationStart
            ? ["RESERVED", "ISSUED", "IN_PRODUCTION"]
            : ["APPROVED", "RESERVED", "ISSUED", "IN_PRODUCTION"],
          dto.kind,
        );
        const orderLot = this.resolveActionOrderLot(
          order,
          dto,
          order.lots.length > 1,
        );
        if (settings.issueBeforeOperationStart)
          this.assertLotMaterialReady(order, orderLot);
        const executions = order.operationExecutions
          .filter(
            (execution: any) =>
              execution.orderLotId === orderLot.id ||
              (order.lots.length === 1 && !execution.orderLotId),
          )
          .sort(
            (left: any, right: any) =>
              left.routingOperation.sequence - right.routingOperation.sequence,
          );
        if (!executions.length)
          throw new BadRequestException(
            `Lot ${orderLot.lotNumber} has no routing operation executions; configure an approved routing before production.`,
          );
        if (
          executions.every((execution: any) => execution.status === "PENDING")
        ) {
          await tx.manufacturingOperationExecution.update({
            where: { id: executions[0].id },
            data: { status: "READY" },
          });
        }
        if (orderLot.status === "PLANNED" || orderLot.status === "RELEASED") {
          await tx.manufacturingOrderLot.update({
            where: { id: orderLot.id },
            data: {
              status: "IN_PRODUCTION",
              startedAt: orderLot.startedAt ?? when,
            },
          });
        }
        toStatus = "IN_PRODUCTION";
        await tx.manufacturingOrder.update({
          where: { id: order.id },
          data: {
            status: toStatus,
            actualStartAt: order.actualStartAt ?? when,
          },
        });
        break;
      }
      case "START_OPERATION": {
        this.assertStatus(order.status, ["IN_PRODUCTION"], dto.kind);
        const operationExecutionId = text(payload.operationExecutionId);
        if (!operationExecutionId)
          throw new BadRequestException(
            "START_OPERATION requires payload.operationExecutionId.",
          );
        const execution = order.operationExecutions.find(
          (entry: any) => entry.id === operationExecutionId,
        );
        if (!execution)
          throw new BadRequestException(
            "Operation execution not found for this order.",
          );
        if (execution.status !== "READY")
          throw new BadRequestException(
            `Operation ${execution.routingOperation.code} must be READY before it can start.`,
          );
        const responsibleUserId = text(
          execution.routingOperation.responsibleUserId,
        );
        if (!responsibleUserId)
          throw new BadRequestException(
            `Operation ${execution.routingOperation.code} has no responsible workspace member assigned in its approved routing.`,
          );
        const responsibleMember = await tx.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: scope.id,
              userId: responsibleUserId,
            },
          },
          select: { id: true },
        });
        if (!responsibleMember)
          throw new BadRequestException(
            `The responsible person assigned to operation ${execution.routingOperation.code} is no longer a member of this workspace.`,
          );
        if (user.id !== responsibleUserId)
          throw new ForbiddenException(
            `Only the responsible person assigned to operation ${execution.routingOperation.code} can start it.`,
          );
        const responsibleQualification =
          await this.assertResponsibleOperationQualification(
            tx,
            scope,
            settings,
            execution,
            responsibleUserId,
            when,
          );
        const priorIncomplete = order.operationExecutions.some(
          (entry: any) =>
            (entry.orderLotId ?? null) === (execution.orderLotId ?? null) &&
            entry.routingOperation.sequence <
              execution.routingOperation.sequence &&
            !["COMPLETED", "SKIPPED"].includes(entry.status),
        );
        if (priorIncomplete)
          throw new BadRequestException(
            `Earlier operations for ${execution.routingOperation.code} must be completed or explicitly skipped first.`,
          );
        const mandatoryRequirements =
          await tx.manufacturingOperationResourceRequirement.findMany({
            where: {
              routingOperationId: execution.routingOperation.id,
              isMandatory: true,
            },
            include: { resource: true },
          });
        const operationLot = order.lots.find(
          (lot: any) => lot.id === execution.orderLotId,
        );
        const plannedOperationQuantity = number(
          operationLot?.plannedQuantity ?? order.plannedQuantity,
        );
        const workDateStart = new Date(
          Date.UTC(
            when.getUTCFullYear(),
            when.getUTCMonth(),
            when.getUTCDate(),
          ),
        );
        const workDateEnd = new Date(workDateStart);
        workDateEnd.setUTCDate(workDateEnd.getUTCDate() + 1);
        const readinessBlockers: string[] = [];
        for (const requirement of mandatoryRequirements) {
          const calendar = await tx.manufacturingCalendarSlot.aggregate({
            where: {
              workspaceId: scope.id,
              resourceId: requirement.resourceId,
              workDate: { gte: workDateStart, lt: workDateEnd },
              status: "AVAILABLE",
              shift: { isActive: true },
            },
            _sum: { availableMinutes: true },
          });
          const result = calculateResourceCapacity(
            {
              operationId: execution.routingOperation.id,
              operationCode: execution.routingOperation.code,
              resource: {
                resourceId: requirement.resource.id,
                code: requirement.resource.code,
                name: requirement.resource.name,
                active: requirement.resource.isActive,
                qualificationState: requirement.resource.qualificationState,
                qualificationValidUntil:
                  requirement.resource.qualificationValidUntil,
                calibrationState: requirement.resource.calibrationState,
                calibrationDueAt: requirement.resource.calibrationDueAt,
                maintenanceState: requirement.resource.maintenanceState,
                maintenanceDueAt: requirement.resource.maintenanceDueAt,
                cleaningState: requirement.resource.cleaningState,
                readinessEvidenceReference:
                  requirement.resource.readinessEvidenceReference,
              },
              setupMinutes: number(execution.routingOperation.setupMinutes),
              runMinutesPerUnit: number(
                execution.routingOperation.runMinutesPerUnit,
              ),
              queueMinutes: number(execution.routingOperation.queueMinutes),
              plannedQuantity: plannedOperationQuantity,
              lotCount: 1,
              requiredUnits: requirement.requiredUnits,
              capacityMultiplier: number(requirement.capacityMultiplier),
              mandatory: true,
              availableMinutes: calendar._sum.availableMinutes ?? 0,
            },
            when,
          );
          readinessBlockers.push(
            ...result.blockers.map(
              (message) => `${requirement.resource.code}: ${message}`,
            ),
          );
        }
        if (readinessBlockers.length)
          throw new BadRequestException(
            `Operation resource readiness failed: ${readinessBlockers.join(" ")}`,
          );
        await tx.manufacturingOperationExecution.update({
          where: { id: execution.id },
          data: {
            status: "IN_PROGRESS",
            startedByUserId: user.id,
            startedAt: when,
            pauseReason: null,
          },
        });
        lifecycleEvidence = {
          responsibleOperator: {
            userId: responsibleUserId,
            workspaceMemberId: responsibleMember.id,
            qualification: responsibleQualification,
          },
        };
        break;
      }
      case "PAUSE_PRODUCTION": {
        throw new BadRequestException(
          "Operations can only be paused by starting a persisted downtime event from Production Execution > Downtime Entry.",
        );
      }
      case "RESUME_PRODUCTION": {
        throw new BadRequestException(
          "Operations can only be resumed by ending their persisted downtime event from Production Execution > Downtime Entry.",
        );
      }
      case "COMPLETE_OPERATION": {
        this.assertStatus(order.status, ["IN_PRODUCTION"], dto.kind);
        const operationExecutionId = text(payload.operationExecutionId);
        if (!operationExecutionId)
          throw new BadRequestException(
            "COMPLETE_OPERATION requires payload.operationExecutionId.",
          );
        const execution = await tx.manufacturingOperationExecution.findFirst({
          where: { id: operationExecutionId, orderId: order.id },
          include: { routingOperation: true },
        });
        if (!execution)
          throw new BadRequestException(
            "Operation execution not found for this order.",
          );
        if (execution.status !== "IN_PROGRESS")
          throw new BadRequestException(
            `Operation ${execution.routingOperation.code} must be IN_PROGRESS before completion.`,
          );
        const inputQuantity = quantityDecimal(
          payload.inputQuantity,
          "inputQuantity",
        );
        const goodQuantity = quantityDecimal(
          payload.goodQuantity,
          "goodQuantity",
          { allowZero: true },
        );
        const rejectedQuantity = quantityDecimal(
          payload.rejectedQuantity,
          "rejectedQuantity",
          { allowZero: true },
        );
        const scrapQuantity = quantityDecimal(
          payload.scrapQuantity,
          "scrapQuantity",
          { allowZero: true },
        );
        const reworkQuantity = quantityDecimal(
          payload.reworkQuantity,
          "reworkQuantity",
          { allowZero: true },
        );
        if (
          !goodQuantity
            .add(rejectedQuantity)
            .add(scrapQuantity)
            .add(reworkQuantity)
            .equals(inputQuantity)
        ) {
          throw new BadRequestException(
            "goodQuantity + rejectedQuantity + scrapQuantity + reworkQuantity must exactly equal inputQuantity.",
          );
        }
        if (inputQuantity.greaterThan(execution.plannedQuantity))
          throw new BadRequestException(
            "Operation actual input cannot exceed its lot planned quantity.",
          );
        const priorIncomplete = order.operationExecutions.some(
          (entry: any) =>
            (entry.orderLotId ?? null) === (execution.orderLotId ?? null) &&
            entry.routingOperation.sequence <
              execution.routingOperation.sequence &&
            !["COMPLETED", "SKIPPED"].includes(entry.status),
        );
        if (priorIncomplete)
          throw new BadRequestException(
            `Earlier operations for ${execution.routingOperation.code} are not complete.`,
          );
        const operationIpcGate = await this.assertOperationIpcPassed(
          tx,
          scope,
          order,
          execution,
          goodQuantity,
          when,
        );
        await tx.manufacturingOperationExecution.update({
          where: { id: execution.id },
          data: {
            status: "COMPLETED",
            inputQuantity,
            goodQuantity,
            rejectedQuantity,
            scrapQuantity,
            reworkQuantity,
            completedByUserId: user.id,
            completedAt: when,
          },
        });
        const nextExecution = order.operationExecutions
          .filter(
            (entry: any) =>
              (entry.orderLotId ?? null) === (execution.orderLotId ?? null) &&
              entry.routingOperation.sequence >
                execution.routingOperation.sequence,
          )
          .sort(
            (left: any, right: any) =>
              left.routingOperation.sequence - right.routingOperation.sequence,
          )[0];
        const operationWipOutput = await this.materializeOperationWipOutput(
          tx,
          scope,
          user,
          order,
          settings,
          execution,
          inputQuantity,
          goodQuantity,
          Boolean(nextExecution),
          when,
        );
        if (operationWipOutput.transactionId)
          transactionIds.push(operationWipOutput.transactionId);
        lifecycleEvidence = { operationIpcGate, operationWipOutput };
        if (nextExecution?.status === "PENDING")
          await tx.manufacturingOperationExecution.update({
            where: { id: nextExecution.id },
            data: { status: "READY" },
          });
        break;
      }
      case "POST_SCRAP_DISPOSITION": {
        this.assertStatus(order.status, ["IN_PRODUCTION"], dto.kind);
        const posted = await this.postOperationScrapDisposition(
          tx,
          scope,
          user,
          order,
          settings,
          dto,
          when,
        );
        transactionIds.push(posted.transactionId);
        stockMovementIds.push(posted.stockMovementId);
        lifecycleEvidence = posted.evidence;
        break;
      }
      case "CREATE_REWORK_DISPOSITION": {
        this.assertStatus(order.status, ["IN_PRODUCTION"], dto.kind);
        const posted = await this.createOperationReworkDisposition(
          tx,
          scope,
          user,
          order,
          settings,
          dto,
          when,
        );
        transactionIds.push(posted.transactionId);
        lifecycleEvidence = posted.evidence;
        break;
      }
      case "COMPLETE_PRODUCTION": {
        this.assertStatus(order.status, ["IN_PRODUCTION"], dto.kind);
        const requestedLotLines =
          dto.lines?.filter(
            (line) => line.orderLotId || line.lotId || line.lotNumber,
          ) ?? [];
        if (requestedLotLines.length === 0)
          throw new BadRequestException(
            "COMPLETE_PRODUCTION requires at least one lot completion line.",
          );
        const seen = new Set<string>();
        for (const input of requestedLotLines) {
          const lot = order.lots.find(
            (entry) =>
              entry.id === input.orderLotId ||
              entry.id === input.lotId ||
              entry.lotNumber === input.lotNumber,
          );
          if (!lot || seen.has(lot.id))
            throw new BadRequestException(
              "Every completion line must reference one unique lot in this order.",
            );
          seen.add(lot.id);
          if (
            !decimal(lot.completedQuantity).add(lot.rejectedQuantity).equals(0)
          ) {
            throw new ConflictException(
              `Lot ${lot.lotNumber} already has posted production completion; use an auditable amendment workflow rather than posting it twice.`,
            );
          }
          const executions = order.operationExecutions
            .filter(
              (execution: any) =>
                execution.orderLotId === lot.id ||
                (order.lots.length === 1 && !execution.orderLotId),
            )
            .sort(
              (left: any, right: any) =>
                left.routingOperation.sequence -
                right.routingOperation.sequence,
            );
          if (!executions.length)
            throw new BadRequestException(
              `Lot ${lot.lotNumber} has no routing operation executions.`,
            );
          const incomplete = executions.filter(
            (execution: any) => execution.status !== "COMPLETED",
          );
          if (incomplete.length) {
            throw new BadRequestException(
              `Lot ${lot.lotNumber} cannot complete until every required routing operation is COMPLETED: ${incomplete.map((execution: any) => execution.routingOperation.code).join(", ")}.`,
            );
          }
          const openDispositions = executions.flatMap((execution: any) => {
            const postedScrap = this.postedQuantity(order, "SCRAP_RECEIPT", {
              operationExecutionId: execution.id,
            });
            const postedRework = this.postedQuantity(order, "REWORK_RECEIPT", {
              operationExecutionId: execution.id,
            });
            const scrapRemaining = decimal(execution.scrapQuantity).sub(
              postedScrap,
            );
            const reworkRemaining = decimal(execution.reworkQuantity).sub(
              postedRework,
            );
            if (scrapRemaining.isNegative() || reworkRemaining.isNegative())
              throw new ConflictException(
                `Disposition transactions exceed recorded quantities for operation ${execution.routingOperation.code}.`,
              );
            return [
              ...(scrapRemaining.greaterThan(0)
                ? [
                    `${execution.routingOperation.code}: ${scrapRemaining.toString()} scrap`,
                  ]
                : []),
              ...(reworkRemaining.greaterThan(0)
                ? [
                    `${execution.routingOperation.code}: ${reworkRemaining.toString()} rework`,
                  ]
                : []),
            ];
          });
          if (openDispositions.length)
            throw new BadRequestException(
              `Lot ${lot.lotNumber} has unresolved operation dispositions: ${openDispositions.join(", ")}.`,
            );
          const finalExecution = executions.at(-1)!;
          const finalInput = decimal(finalExecution.inputQuantity);
          const finalGood = decimal(finalExecution.goodQuantity);
          const finalRejected = decimal(finalExecution.rejectedQuantity)
            .add(finalExecution.scrapQuantity)
            .add(finalExecution.reworkQuantity);
          if (!finalInput.equals(lot.plannedQuantity)) {
            throw new BadRequestException(
              `Final operation input for lot ${lot.lotNumber} must equal its planned quantity ${decimal(lot.plannedQuantity).toString()}.`,
            );
          }
          if (!finalGood.add(finalRejected).equals(finalInput)) {
            throw new BadRequestException(
              `Final operation quantities for lot ${lot.lotNumber} do not reconcile to its input.`,
            );
          }
          const completedQuantity = quantityDecimal(
            input.quantity,
            `${lot.lotNumber} completed quantity`,
            { allowZero: true },
          );
          const rejectedQuantity = quantityDecimal(
            input.payload?.rejectedQuantity ?? 0,
            `${lot.lotNumber} rejected quantity`,
            { allowZero: true },
          );
          if (completedQuantity.add(rejectedQuantity).isZero())
            throw new BadRequestException(
              `A positive completed or rejected quantity is required for lot ${lot.lotNumber}.`,
            );
          if (
            !completedQuantity.equals(finalGood) ||
            !rejectedQuantity.equals(finalRejected)
          ) {
            throw new BadRequestException(
              `Lot ${lot.lotNumber} completion must exactly match the final operation actuals: ${finalGood.toString()} good and ${finalRejected.toString()} rejected/scrapped/transferred to rework.`,
            );
          }
          if (
            !completedQuantity.add(rejectedQuantity).equals(lot.plannedQuantity)
          ) {
            throw new BadRequestException(
              `Lot ${lot.lotNumber} completion must reconcile exactly to planned quantity ${decimal(lot.plannedQuantity).toString()}.`,
            );
          }
          await tx.manufacturingOrderLot.update({
            where: { id: lot.id },
            data: {
              completedQuantity,
              rejectedQuantity,
              status: "COMPLETED",
              startedAt: lot.startedAt ?? when,
              completedAt: when,
            },
          });
        }
        const updatedLots = await tx.manufacturingOrderLot.findMany({
          where: { orderId: order.id },
        });
        const completed = updatedLots.reduce(
          (total, lot) => total.add(lot.completedQuantity),
          decimal(0),
        );
        const rejected = updatedLots.reduce(
          (total, lot) => total.add(lot.rejectedQuantity),
          decimal(0),
        );
        const fullyReconciled = completed
          .add(rejected)
          .equals(order.plannedQuantity);
        if (!settings.allowPartialCompletion && !fullyReconciled)
          throw new BadRequestException(
            "Partial production completion is disabled.",
          );
        toStatus = fullyReconciled ? "COMPLETED" : "IN_PRODUCTION";
        await tx.manufacturingOrder.update({
          where: { id: order.id },
          data: {
            status: toStatus,
            completedQuantity: completed,
            rejectedQuantity: rejected,
            actualEndAt: fullyReconciled ? when : null,
          },
        });
        break;
      }
      case "RECORD_IN_PROCESS_RESULT": {
        this.assertStatus(order.status, ["IN_PRODUCTION", "QC_HOLD"], dto.kind);
        const operationExecutionId = text(payload.operationExecutionId);
        if (!operationExecutionId) {
          throw new BadRequestException(
            "RECORD_IN_PROCESS_RESULT requires payload.operationExecutionId.",
          );
        }
        const execution = order.operationExecutions.find(
          (entry: any) => entry.id === operationExecutionId,
        );
        if (!execution) {
          throw new BadRequestException(
            "Operation execution not found for this production order.",
          );
        }
        if (!["IN_PROGRESS", "PAUSED"].includes(execution.status)) {
          throw new BadRequestException(
            `Operation ${execution.routingOperation.code} must be IN_PROGRESS or PAUSED before recording an in-process inspection.`,
          );
        }
        const orderLot = order.lots.find(
          (lot: any) => lot.id === execution.orderLotId,
        );
        if (!orderLot) {
          throw new BadRequestException(
            "The operation execution is not linked to a production lot on this order.",
          );
        }
        const requestedLotKeys = [
          text(payload.orderLotId),
          text(payload.lotNumber),
          ...(dto.lines ?? []).flatMap((line) => [
            text(line.orderLotId),
            text(line.lotId),
            text(line.lotNumber),
          ]),
        ].filter((value): value is string => Boolean(value));
        if (
          requestedLotKeys.some(
            (key) => key !== orderLot.id && key !== orderLot.lotNumber,
          )
        ) {
          throw new BadRequestException(
            "RECORD_IN_PROCESS_RESULT references a production lot different from its operation execution.",
          );
        }

        const specification = await this.resolveApplicableQualitySpecification(
          tx,
          scope.id,
          order.finishedProductId,
          when,
        );
        const requestedSpecificationId = text(payload.qualitySpecificationId);
        if (!requestedSpecificationId) {
          throw new BadRequestException(
            "RECORD_IN_PROCESS_RESULT requires the approved qualitySpecificationId shown to the inspector.",
          );
        }
        if (requestedSpecificationId !== specification.id) {
          throw new ConflictException(
            `The applicable quality specification changed to ${specification.code} v${specification.versionNumber}. Reload the in-process inspection before posting results.`,
          );
        }
        const resultRows = Array.isArray(payload.results)
          ? payload.results.map((entry) => jsonObject(entry))
          : [];
        if (!resultRows.length) {
          throw new BadRequestException(
            "RECORD_IN_PROCESS_RESULT requires at least one actual result row.",
          );
        }
        let normalizedResults: ReturnType<
          typeof evaluateQualitySpecificationResults
        >;
        try {
          normalizedResults = evaluateQualitySpecificationResults(
            specification,
            resultRows,
          );
        } catch (error) {
          if (error instanceof QualitySpecificationValidationError) {
            throw new BadRequestException(error.message);
          }
          throw error;
        }

        const quantityKeys = [
          "sampleQuantity",
          "acceptedQuantity",
          "rejectedQuantity",
          "holdQuantity",
        ] as const;
        const quantitiesSupplied = quantityKeys.some((key) =>
          Object.prototype.hasOwnProperty.call(payload, key),
        );
        let sampleQuantity = decimal(0);
        let acceptedQuantity = decimal(0);
        let rejectedQuantity = decimal(0);
        let holdQuantity = decimal(0);
        if (quantitiesSupplied) {
          if (
            !Object.prototype.hasOwnProperty.call(payload, "sampleQuantity")
          ) {
            throw new BadRequestException(
              "sampleQuantity is required when in-process inspection quantities are supplied.",
            );
          }
          sampleQuantity = quantityDecimal(
            payload.sampleQuantity,
            "sampleQuantity",
          );
          acceptedQuantity = quantityDecimal(
            payload.acceptedQuantity ?? 0,
            "acceptedQuantity",
            { allowZero: true },
          );
          rejectedQuantity = quantityDecimal(
            payload.rejectedQuantity ?? 0,
            "rejectedQuantity",
            { allowZero: true },
          );
          holdQuantity = quantityDecimal(
            payload.holdQuantity ?? 0,
            "holdQuantity",
            { allowZero: true },
          );
          if (
            !acceptedQuantity
              .add(rejectedQuantity)
              .add(holdQuantity)
              .equals(sampleQuantity)
          ) {
            throw new BadRequestException(
              "acceptedQuantity + rejectedQuantity + holdQuantity must exactly equal sampleQuantity.",
            );
          }
          if (sampleQuantity.greaterThan(execution.plannedQuantity)) {
            throw new BadRequestException(
              `In-process sampleQuantity cannot exceed operation planned quantity ${decimal(execution.plannedQuantity).toString()}.`,
            );
          }
        }

        const failedResults = normalizedResults.filter(
          (result) => !result.passed,
        );
        const criticalParameterCodes = new Set(
          specification.parameters
            .filter((parameter) => parameter.critical)
            .map((parameter) => parameter.parameterCode),
        );
        const criticalFailures = failedResults.filter((result) =>
          criticalParameterCodes.has(result.parameterCode),
        );
        const inspectionStatus = holdQuantity.greaterThan(0)
          ? "HOLD"
          : rejectedQuantity.greaterThan(0) || failedResults.length
            ? "FAILED"
            : "PASSED";
        const failureSummary = [
          ...(failedResults.length
            ? [
                `Out-of-specification result(s): ${failedResults
                  .map((result) => result.parameterName)
                  .join(", ")}`,
              ]
            : []),
          ...(rejectedQuantity.greaterThan(0)
            ? [`Rejected sample quantity: ${rejectedQuantity.toString()}`]
            : []),
          ...(holdQuantity.greaterThan(0)
            ? [`Sample quantity on hold: ${holdQuantity.toString()}`]
            : []),
        ].join("; ");
        const holdReason =
          inspectionStatus === "PASSED"
            ? null
            : (text(payload.holdReason) ??
              text(dto.note) ??
              (failureSummary || "In-process inspection failed"));
        const priorInspectionsForRelease =
          inspectionStatus === "PASSED" && order.status === "QC_HOLD"
            ? await tx.manufacturingQualityInspection.findMany({
                where: {
                  workspaceId: scope.id,
                  orderId: order.id,
                },
                orderBy: [
                  { inspectedAt: "asc" },
                  { createdAt: "asc" },
                  { id: "asc" },
                ],
                select: {
                  id: true,
                  inspectionType: true,
                  status: true,
                  operationExecutionId: true,
                },
              })
            : [];
        const qcNumber = await issueManufacturingDocumentNumberTx(
          tx,
          scope,
          user.id,
          {
            documentKind: "QC_INSPECTION",
            issuedAt: when,
            idempotencyKey: `MFG:${dto.idempotencyKey}:IPQC_RESULT:${execution.id}`,
          },
        );
        const inspection = await tx.manufacturingQualityInspection.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            inspectionNumber: qcNumber.documentNumber,
            inspectionType: "IN_PROCESS",
            status: inspectionStatus,
            orderId: order.id,
            orderLotId: orderLot.id,
            operationExecutionId: execution.id,
            inventoryItemId: order.finishedProductId,
            sampleQuantity,
            acceptedQuantity,
            rejectedQuantity,
            holdReason,
            notes: [
              text(dto.note),
              `Operation: ${execution.routingOperation.code} - ${execution.routingOperation.name}`,
              `Quality specification: ${specification.code} v${specification.versionNumber} (${specification.id})`,
            ]
              .filter(Boolean)
              .join("\n"),
            createdByUserId: user.id,
            inspectedByUserId: user.id,
            inspectedAt: when,
            results: { create: normalizedResults },
          },
        });

        let releasedFromInProcessHold = false;
        if (inspectionStatus !== "PASSED") {
          toStatus = "QC_HOLD";
        } else if (order.status === "QC_HOLD") {
          const latestInProcessByExecution = new Map<string, any>();
          for (const existingInspection of priorInspectionsForRelease) {
            if (
              existingInspection.inspectionType === "IN_PROCESS" &&
              existingInspection.operationExecutionId
            ) {
              latestInProcessByExecution.set(
                existingInspection.operationExecutionId,
                existingInspection,
              );
            }
          }
          const priorTargetInspection = latestInProcessByExecution.get(
            execution.id,
          );
          latestInProcessByExecution.set(execution.id, {
            operationExecutionId: execution.id,
            status: "PASSED",
          });
          const unresolvedInProcessHold = [
            ...latestInProcessByExecution.values(),
          ].some((entry) => entry.status !== "PASSED");
          const unrelatedInspectionHold = priorInspectionsForRelease.some(
            (entry: any) =>
              entry.inspectionType !== "IN_PROCESS" &&
              ["PENDING", "HOLD", "FAILED"].includes(entry.status),
          );
          const qualityCases = await tx.manufacturingControlRecord.findMany({
            where: {
              workspaceId: scope.id,
              kind: "QUALITY_CASE",
              status: { notIn: ["CANCELLED", "RETIRED"] },
            },
            select: {
              status: true,
              inventoryItemId: true,
              payload: true,
            },
          });
          const openQualityCase = qualityCases.some((record) =>
            isOpenQualityCaseLinkedToOrder(record, order),
          );
          releasedFromInProcessHold = Boolean(
            priorTargetInspection &&
            ["HOLD", "FAILED"].includes(priorTargetInspection.status) &&
            !unresolvedInProcessHold &&
            !unrelatedInspectionHold &&
            !openQualityCase,
          );
          toStatus = releasedFromInProcessHold ? "IN_PRODUCTION" : "QC_HOLD";
        } else {
          toStatus = "IN_PRODUCTION";
        }
        if (toStatus !== order.status) {
          await tx.manufacturingOrder.update({
            where: { id: order.id },
            data: { status: toStatus },
          });
        }
        lifecycleEvidence = {
          inProcessInspection: {
            inspectionId: inspection.id,
            inspectionNumber: qcNumber.documentNumber,
            inspectionStatus,
            operationExecutionId: execution.id,
            operationCode: execution.routingOperation.code,
            orderLotId: orderLot.id,
            qualitySpecificationId: specification.id,
            qualitySpecificationCode: specification.code,
            qualitySpecificationVersion: specification.versionNumber,
            failedParameterCodes: failedResults.map(
              (result) => result.parameterCode,
            ),
            criticalFailedParameterCodes: criticalFailures.map(
              (result) => result.parameterCode,
            ),
            quantitiesSupplied,
            sampleQuantity: sampleQuantity.toString(),
            acceptedQuantity: acceptedQuantity.toString(),
            rejectedQuantity: rejectedQuantity.toString(),
            holdQuantity: holdQuantity.toString(),
            holdReason,
            releasedFromInProcessHold,
          },
        };
        break;
      }
      case "PLACE_QC_HOLD":
        this.assertStatus(
          order.status,
          ["IN_PRODUCTION", "COMPLETED"],
          dto.kind,
        );
        toStatus = "QC_HOLD";
        {
          const orderLot = this.resolveActionOrderLot(
            order,
            dto,
            order.lots.length > 1,
          );
          const sampleQuantity = quantityDecimal(
            payload.sampleQuantity ?? orderLot.completedQuantity,
            "sampleQuantity",
          );
          const sourceTransactionId = text(payload.sourceTransactionId);
          if (sourceTransactionId)
            this.assertSourceReceipt(order, sourceTransactionId, orderLot.id);
          const qcNumber = await issueManufacturingDocumentNumberTx(
            tx,
            scope,
            user.id,
            {
              documentKind: "QC_INSPECTION",
              issuedAt: when,
              idempotencyKey: `MFG:${dto.idempotencyKey}:QC_HOLD`,
            },
          );
          await tx.manufacturingQualityInspection.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              inspectionNumber: qcNumber.documentNumber,
              inspectionType: "FINISHED_GOOD",
              status: "HOLD",
              orderId: order.id,
              orderLotId: orderLot.id,
              inventoryItemId: order.finishedProductId,
              sourceTransactionId,
              sampleQuantity,
              acceptedQuantity: 0,
              rejectedQuantity: 0,
              holdReason:
                text(dto.note) ??
                text(payload.holdReason) ??
                "Quality inspection pending",
              createdByUserId: user.id,
            },
          });
        }
        await tx.manufacturingOrder.update({
          where: { id: order.id },
          data: { status: toStatus },
        });
        break;
      case "RECORD_QUALITY_RESULT": {
        this.assertStatus(order.status, ["COMPLETED", "QC_HOLD"], dto.kind);
        const orderLot = this.resolveActionOrderLot(
          order,
          dto,
          order.lots.length > 1,
        );
        const sourceTransactionId = text(payload.sourceTransactionId);
        if (sourceTransactionId)
          this.assertSourceReceipt(order, sourceTransactionId, orderLot.id);
        const targetQuantity = sourceTransactionId
          ? this.receiptOutputQuantity(order, sourceTransactionId, orderLot.id)
          : decimal(orderLot.completedQuantity);
        const sampleQuantity = quantityDecimal(
          payload.sampleQuantity ?? targetQuantity,
          "sampleQuantity",
        );
        if (!sampleQuantity.equals(targetQuantity))
          throw new BadRequestException(
            "QC sampleQuantity must exactly equal the selected completed lot or source receipt quantity.",
          );
        const acceptedQuantity = quantityDecimal(
          payload.acceptedQuantity,
          "acceptedQuantity",
          { allowZero: true },
        );
        const rejectedQuantity = quantityDecimal(
          payload.rejectedQuantity,
          "rejectedQuantity",
          { allowZero: true },
        );
        const holdQuantity = quantityDecimal(
          payload.holdQuantity,
          "holdQuantity",
          { allowZero: true },
        );
        if (
          !acceptedQuantity
            .add(rejectedQuantity)
            .add(holdQuantity)
            .equals(sampleQuantity)
        ) {
          throw new BadRequestException(
            "acceptedQuantity + rejectedQuantity + holdQuantity must exactly equal sampleQuantity.",
          );
        }
        const specification = await this.resolveApplicableQualitySpecification(
          tx,
          scope.id,
          order.finishedProductId,
          when,
        );
        const requestedSpecificationId = text(payload.qualitySpecificationId);
        if (!requestedSpecificationId) {
          throw new BadRequestException(
            "RECORD_QUALITY_RESULT requires the approved qualitySpecificationId shown to the inspector.",
          );
        }
        if (requestedSpecificationId !== specification.id) {
          throw new ConflictException(
            `The applicable quality specification changed to ${specification.code} v${specification.versionNumber}. Reload the QC form before posting results.`,
          );
        }
        const resultRows = Array.isArray(payload.results)
          ? payload.results.map((entry) => jsonObject(entry))
          : [];
        if (!resultRows.length)
          throw new BadRequestException(
            "RECORD_QUALITY_RESULT requires at least one actual QC result row.",
          );
        let normalizedResults: ReturnType<
          typeof evaluateQualitySpecificationResults
        >;
        try {
          normalizedResults = evaluateQualitySpecificationResults(
            specification,
            resultRows,
          );
        } catch (error) {
          if (error instanceof QualitySpecificationValidationError) {
            throw new BadRequestException(error.message);
          }
          throw error;
        }
        const status = holdQuantity.greaterThan(0)
          ? "HOLD"
          : rejectedQuantity.greaterThan(0) ||
              normalizedResults.some((result) => !result.passed)
            ? "FAILED"
            : "PASSED";
        const qcNumber = await issueManufacturingDocumentNumberTx(
          tx,
          scope,
          user.id,
          {
            documentKind: "QC_INSPECTION",
            issuedAt: when,
            idempotencyKey: `MFG:${dto.idempotencyKey}:QC_RESULT`,
          },
        );
        await tx.manufacturingQualityInspection.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            inspectionNumber: qcNumber.documentNumber,
            inspectionType: "FINISHED_GOOD",
            status,
            orderId: order.id,
            orderLotId: orderLot.id,
            inventoryItemId: order.finishedProductId,
            sourceTransactionId,
            sampleQuantity,
            acceptedQuantity,
            rejectedQuantity,
            holdReason: holdQuantity.greaterThan(0)
              ? (text(payload.holdReason) ??
                text(dto.note) ??
                "QC quantity remains on hold")
              : null,
            notes: [
              text(dto.note),
              `Quality specification: ${specification.code} v${specification.versionNumber} (${specification.id})`,
            ]
              .filter(Boolean)
              .join("\n"),
            createdByUserId: qualityInspectorUserId,
            inspectedByUserId: qualityInspectorUserId,
            inspectedAt: qualityInspectedAt,
            approvedByUserId:
              status === "PASSED" || independentQualityApprovalRequired
                ? user.id
                : null,
            approvedAt:
              status === "PASSED" || independentQualityApprovalRequired
                ? when
                : null,
            results: { create: normalizedResults },
          },
        });
        toStatus = status === "PASSED" ? "COMPLETED" : "QC_HOLD";
        await tx.manufacturingOrder.update({
          where: { id: order.id },
          data: { status: toStatus },
        });
        break;
      }
      case "POST_PRODUCTION_RECEIPT": {
        this.assertStatus(order.status, ["COMPLETED", "QC_HOLD"], dto.kind);
        const posted = await this.postProductionReceipt(
          tx,
          scope,
          user,
          order,
          settings,
          dto,
          when,
        );
        transactionIds.push(...posted.transactionIds);
        stockMovementIds.push(...posted.stockMovementIds);
        break;
      }
      case "QA_RELEASE": {
        this.assertStatus(
          order.status,
          ["COMPLETED", "QC_HOLD", "QA_RELEASED"],
          dto.kind,
        );
        const qualityCases = await tx.manufacturingControlRecord.findMany({
          where: {
            workspaceId: scope.id,
            kind: "QUALITY_CASE",
            status: { notIn: ["CANCELLED", "RETIRED"] },
          },
          select: {
            code: true,
            name: true,
            status: true,
            inventoryItemId: true,
            payload: true,
          },
        });
        const openCases = qualityCases.filter((record) =>
          isOpenQualityCaseLinkedToOrder(record, order),
        );
        if (openCases.length) {
          throw new BadRequestException(
            `QA_RELEASE is blocked by open quality case(s): ${openCases.map((record) => `${record.code} (${record.name})`).join(", ")}. Close or resolve the linked OOS/deviation/CAPA record first.`,
          );
        }
        const posted = await this.postQaRelease(
          tx,
          scope,
          user,
          order,
          settings,
          dto,
          when,
        );
        transactionIds.push(...posted.transactionIds);
        stockMovementIds.push(...posted.stockMovementIds);
        lifecycleEvidence = {
          packagingReleasePolicy: posted.packagingReleasePolicy,
        };
        toStatus = posted.allReleased ? "QA_RELEASED" : order.status;
        if (posted.allReleased) {
          await tx.manufacturingOrder.update({
            where: { id: order.id },
            data: { status: toStatus },
          });
          await tx.manufacturingPackagingOrder.updateMany({
            where: {
              workspaceId: scope.id,
              orderId: order.id,
              status: "RELEASE_READY",
            },
            data: { status: "CLOSED", closedAt: when },
          });
        }
        break;
      }
      case "CLOSE": {
        this.assertStatus(order.status, ["QA_RELEASED"], dto.kind);
        lifecycleEvidence = await this.closeProductionOrder(
          tx,
          scope,
          user,
          order,
          settings,
          dto,
          when,
        );
        toStatus = "CLOSED";
        break;
      }
      case "AMEND": {
        this.assertStatus(
          order.status,
          ["DRAFT", "SUBMITTED", "APPROVED", "RESERVED"],
          dto.kind,
        );
        const reason = text(dto.note);
        if (!reason)
          throw new BadRequestException(
            "AMEND requires a non-empty action note explaining the controlled change.",
          );
        this.assertPrePostingOrderLifecycleSafe(order, dto.kind);
        const amendment = parseOrderAmendment(payload, order);
        const before = lifecycleOrderSnapshot(order);
        const bomVersion = await tx.manufacturingBomVersion.findFirst({
          where: {
            id: order.bomVersionId,
            bom: { workspaceId: scope.id },
          },
          include: { components: true },
        });
        if (!bomVersion || !bomVersion.components.length)
          throw new BadRequestException(
            "The order BOM version is unavailable; dependent material quantities cannot be amended safely.",
          );
        assertWithinBomEffectiveWindow(
          amendment.plannedStartDate,
          bomVersion,
          "Production order planned start date",
        );
        const requiredComponents = bomVersion.components.filter(
          (component) => !component.isOptional,
        );
        if (!requiredComponents.length)
          throw new BadRequestException(
            "Production orders require at least one non-optional BOM component.",
          );
        const requirements = calculateBomRequirements(
          requiredComponents.map((component) => ({
            materialId: component.inventoryItemId,
            unit: component.unit,
            quantityPerOutput: decimal(component.quantityPerOutput)
              .div(bomVersion.outputQuantity)
              .toString(),
            wastagePercent: component.scrapPercent,
          })),
          amendment.plannedQuantity,
        );
        const requirementByItem = new Map(
          requirements.map((requirement) => [
            requirement.materialId,
            decimal(requirement.requiredQuantity).toDecimalPlaces(
              4,
              Prisma.Decimal.ROUND_HALF_UP,
            ),
          ]),
        );
        const materialPlans = order.materials.map((material: any) => {
          const plannedQuantity = requirementByItem.get(
            material.inventoryItemId,
          );
          if (!plannedQuantity)
            throw new BadRequestException(
              `Order material ${material.inventoryItemId} is no longer present in the immutable BOM snapshot.`,
            );
          return { id: material.id, plannedQuantity };
        });
        if (materialPlans.length !== requirementByItem.size)
          throw new BadRequestException(
            "The order material snapshot no longer reconciles to its BOM version.",
          );
        const lotPlans = scaleOrderLotQuantities(
          order.lots,
          amendment.plannedQuantity,
        );
        const lotPlanById = new Map(
          lotPlans.map((lot) => [lot.id, lot.plannedQuantity]),
        );
        const serialRules = await tx.manufacturingSerialRule.findMany({
          where: { orderId: order.id, status: { not: "RETIRED" } },
          select: { id: true, status: true },
        });
        if (serialRules.some((rule) => rule.status !== "DRAFT"))
          throw new BadRequestException(
            "AMEND is blocked because an active serial rule already exists for this order.",
          );
        const releasedReservations =
          await this.releaseOrderReservationsForLifecycle(
            tx,
            scope,
            user,
            order,
            when,
            `Order amendment: ${reason}`,
          );
        const cancelledTransactions = order.transactions
          .filter((transaction: any) =>
            ["DRAFT", "SUBMITTED", "APPROVED"].includes(transaction.status),
          )
          .map((transaction: any) => transaction.id);
        const cancelledPackagingOrders = order.packagingOrders
          .filter((packaging: any) =>
            ["DRAFT", "MATERIAL_SHORT"].includes(packaging.status),
          )
          .map((packaging: any) => packaging.id);
        const voidedCostSnapshots = order.costSnapshots
          .filter((snapshot: any) =>
            ["DRAFT", "PROVISIONAL"].includes(snapshot.status),
          )
          .map((snapshot: any) => snapshot.id);
        if (cancelledTransactions.length)
          await tx.manufacturingTransaction.updateMany({
            where: {
              id: { in: cancelledTransactions },
              orderId: order.id,
              status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] },
            },
            data: {
              status: "CANCELLED",
              cancelledAt: when,
              cancelReason: `Invalidated by order amendment: ${reason}`,
            },
          });
        if (cancelledPackagingOrders.length)
          await tx.manufacturingPackagingOrder.updateMany({
            where: {
              id: { in: cancelledPackagingOrders },
              orderId: order.id,
              status: { in: ["DRAFT", "MATERIAL_SHORT"] },
            },
            data: { status: "CANCELLED" },
          });
        if (voidedCostSnapshots.length)
          await tx.manufacturingCostSnapshot.updateMany({
            where: {
              id: { in: voidedCostSnapshots },
              orderId: order.id,
              status: { in: ["DRAFT", "PROVISIONAL"] },
              voucherEntryId: null,
            },
            data: {
              status: "VOIDED",
              voidReason: `Invalidated by order amendment: ${reason}`,
            },
          });
        if (serialRules.length)
          await tx.manufacturingSerialRule.updateMany({
            where: {
              id: { in: serialRules.map((rule) => rule.id) },
              orderId: order.id,
              status: "DRAFT",
            },
            data: { status: "RETIRED", retiredAt: when },
          });
        for (const material of materialPlans)
          await tx.manufacturingOrderMaterial.update({
            where: { id: material.id },
            data: {
              plannedQuantity: material.plannedQuantity,
              reservedQuantity: 0,
              requiredDate: amendment.plannedStartDate,
              status: "PLANNED",
            },
          });
        for (const lot of lotPlans)
          await tx.manufacturingOrderLot.update({
            where: { id: lot.id },
            data: {
              plannedQuantity: lot.plannedQuantity,
              status: "PLANNED",
              startedAt: null,
              completedAt: null,
            },
          });
        for (const execution of order.operationExecutions) {
          const plannedQuantity = execution.orderLotId
            ? lotPlanById.get(execution.orderLotId)
            : amendment.plannedQuantity;
          if (!plannedQuantity)
            throw new BadRequestException(
              "An operation execution is not linked to an amended production lot.",
            );
          await tx.manufacturingOperationExecution.update({
            where: { id: execution.id },
            data: {
              status: "PENDING",
              plannedQuantity,
              inputQuantity: 0,
              goodQuantity: 0,
              rejectedQuantity: 0,
              scrapQuantity: 0,
              reworkQuantity: 0,
              startedByUserId: null,
              startedAt: null,
              completedByUserId: null,
              completedAt: null,
              pauseReason: null,
            },
          });
        }
        toStatus = "DRAFT";
        await tx.manufacturingOrder.update({
          where: { id: order.id },
          data: {
            status: toStatus,
            plannedQuantity: amendment.plannedQuantity,
            plannedStartDate: amendment.plannedStartDate,
            plannedEndDate: amendment.plannedEndDate,
            priority: amendment.priority,
            notes: amendment.notes,
            submittedAt: null,
            approvedByUserId: null,
            approvedAt: null,
          },
        });
        lifecycleEvidence = {
          lifecycle: "CONTROLLED_AMENDMENT",
          reason,
          before,
          after: {
            status: toStatus,
            plannedQuantity: amendment.plannedQuantity.toString(),
            plannedStartDate: amendment.plannedStartDate.toISOString(),
            plannedEndDate: amendment.plannedEndDate.toISOString(),
            priority: amendment.priority,
            notes: amendment.notes,
            materials: materialPlans.map((material) => ({
              id: material.id,
              plannedQuantity: material.plannedQuantity.toString(),
              reservedQuantity: "0",
              status: "PLANNED",
            })),
            lots: lotPlans.map((lot) => ({
              id: lot.id,
              plannedQuantity: lot.plannedQuantity.toString(),
              status: "PLANNED",
            })),
          },
          invalidated: {
            reservationRelease: releasedReservations,
            transactionIds: cancelledTransactions,
            packagingOrderIds: cancelledPackagingOrders,
            costSnapshotIds: voidedCostSnapshots,
            serialRuleIds: serialRules.map((rule) => rule.id),
          },
          requiresResubmissionAndApproval: order.status !== "DRAFT",
        };
        break;
      }
      case "CANCEL": {
        this.assertStatus(
          order.status,
          ["DRAFT", "SUBMITTED", "APPROVED", "RESERVED"],
          dto.kind,
        );
        const reason = text(dto.note);
        if (!reason)
          throw new BadRequestException(
            "CANCEL requires a non-empty action note explaining the controlled cancellation.",
          );
        this.assertPrePostingOrderLifecycleSafe(order, dto.kind);
        const before = lifecycleOrderSnapshot(order);
        const serialRules = await tx.manufacturingSerialRule.findMany({
          where: { orderId: order.id, status: { not: "RETIRED" } },
          select: { id: true, status: true },
        });
        if (serialRules.some((rule) => rule.status !== "DRAFT"))
          throw new BadRequestException(
            "CANCEL is blocked because an active serial rule already exists for this order.",
          );
        const releasedReservations =
          await this.releaseOrderReservationsForLifecycle(
            tx,
            scope,
            user,
            order,
            when,
            `Order cancellation: ${reason}`,
          );
        const cancelledTransactions = order.transactions
          .filter((transaction: any) =>
            ["DRAFT", "SUBMITTED", "APPROVED"].includes(transaction.status),
          )
          .map((transaction: any) => transaction.id);
        const cancelledPackagingOrders = order.packagingOrders
          .filter((packaging: any) =>
            ["DRAFT", "MATERIAL_SHORT"].includes(packaging.status),
          )
          .map((packaging: any) => packaging.id);
        const voidedCostSnapshots = order.costSnapshots
          .filter((snapshot: any) =>
            ["DRAFT", "PROVISIONAL"].includes(snapshot.status),
          )
          .map((snapshot: any) => snapshot.id);
        if (cancelledTransactions.length)
          await tx.manufacturingTransaction.updateMany({
            where: {
              id: { in: cancelledTransactions },
              orderId: order.id,
              status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] },
            },
            data: {
              status: "CANCELLED",
              cancelledAt: when,
              cancelReason: reason,
            },
          });
        if (cancelledPackagingOrders.length)
          await tx.manufacturingPackagingOrder.updateMany({
            where: {
              id: { in: cancelledPackagingOrders },
              orderId: order.id,
              status: { in: ["DRAFT", "MATERIAL_SHORT"] },
            },
            data: { status: "CANCELLED" },
          });
        if (voidedCostSnapshots.length)
          await tx.manufacturingCostSnapshot.updateMany({
            where: {
              id: { in: voidedCostSnapshots },
              orderId: order.id,
              status: { in: ["DRAFT", "PROVISIONAL"] },
              voucherEntryId: null,
            },
            data: { status: "VOIDED", voidReason: reason },
          });
        if (serialRules.length)
          await tx.manufacturingSerialRule.updateMany({
            where: {
              id: { in: serialRules.map((rule) => rule.id) },
              orderId: order.id,
              status: "DRAFT",
            },
            data: { status: "RETIRED", retiredAt: when },
          });
        await tx.manufacturingOperationExecution.updateMany({
          where: {
            orderId: order.id,
            status: { in: ["PENDING", "READY"] },
          },
          data: { status: "CANCELLED" },
        });
        await tx.manufacturingOrderLot.updateMany({
          where: {
            orderId: order.id,
            status: { in: ["PLANNED", "RELEASED"] },
          },
          data: { status: "CANCELLED" },
        });
        await tx.manufacturingOrderMaterial.updateMany({
          where: { orderId: order.id },
          data: { status: "CANCELLED", reservedQuantity: 0 },
        });
        toStatus = "CANCELLED";
        await tx.manufacturingOrder.update({
          where: { id: order.id },
          data: { status: toStatus },
        });
        lifecycleEvidence = {
          lifecycle: "CONTROLLED_CANCELLATION",
          reason,
          before,
          after: {
            ...before,
            status: toStatus,
            materials: before.materials.map(
              (material: Record<string, unknown>) => ({
                ...material,
                reservedQuantity: "0",
                status: "CANCELLED",
              }),
            ),
            lots: before.lots.map((lot: Record<string, unknown>) => ({
              ...lot,
              status: "CANCELLED",
            })),
          },
          invalidated: {
            reservationRelease: releasedReservations,
            transactionIds: cancelledTransactions,
            packagingOrderIds: cancelledPackagingOrders,
            costSnapshotIds: voidedCostSnapshots,
            serialRuleIds: serialRules.map((rule) => rule.id),
            operationExecutionIds: order.operationExecutions.map(
              (execution: any) => execution.id,
            ),
          },
          reversalRequired: false,
        };
        break;
      }
      default:
        throw new BadRequestException("Unsupported manufacturing action.");
    }

    // STATUS_CONFIGURATION is an additional fail-closed policy for actual
    // production-order status changes. It never replaces the fixed action
    // permissions or the lifecycle guards enforced by the switch above.
    if (fromStatus !== toStatus) {
      const statusConfigurations = await tx.manufacturingControlRecord.findMany(
        {
          where: {
            workspaceId: scope.id,
            kind: "STATUS_CONFIGURATION",
            status: "APPROVED",
            approvedAt: { lte: when },
          },
          orderBy: [
            { approvedAt: "desc" },
            { versionNumber: "desc" },
            { createdAt: "desc" },
          ],
          select: {
            id: true,
            effectiveFrom: true,
            effectiveTo: true,
            payload: true,
          },
        },
      );
      const decision = resolveManufacturingStatusPolicy(statusConfigurations, {
        workflowScope: "PRODUCTION_ORDER",
        fromStatus,
        toStatus,
        at: when,
      });
      if (decision.configured && !decision.allowed) {
        throw new BadRequestException(
          `The active production-order status configuration does not allow ${fromStatus} -> ${toStatus}.`,
        );
      }
      if (decision.configured) {
        if (decision.permissionKey) {
          await this.requireDynamicPermission(user, decision.permissionKey);
        }
        statusConfigurationPolicy = {
          recordId: decision.recordId,
          workflowScope: "PRODUCTION_ORDER",
          fromStatus,
          toStatus,
          permissionKey: decision.permissionKey,
        };
      }
    }

    const evidence = {
      ...(stagedApprovalReview
        ? jsonObject(stagedApprovalReview.evidence)
        : {}),
      kind: dto.kind,
      orderId: order.id,
      ...(actionApprovalEntityId ? { actionApprovalEntityId } : {}),
      fromStatus,
      toStatus,
      transactionIds,
      stockMovementIds,
      ...(unitConversions.length ? { unitConversions } : {}),
      signatureMeaning,
      ...(statusConfigurationPolicy ? { statusConfigurationPolicy } : {}),
      ...lifecycleEvidence,
      ...(directActionElectronicSignatureEvidence
        ? { electronicSignaturePolicy: directActionElectronicSignatureEvidence }
        : {}),
      signatureHash: actionSignatureHash,
    };
    const review = stagedApprovalReview
      ? await tx.manufacturingWorkflowReview.update({
          where: { id: stagedApprovalReview.id },
          data: { evidence: evidence as Prisma.InputJsonValue },
          include: { createdBy: { select: { name: true } } },
        })
      : await tx.manufacturingWorkflowReview.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            orderId: order.id,
            workflowGroup: this.actionGroup(dto.kind),
            workflowCode: "ORDER_ACTION",
            entityType: "MANUFACTURING_ORDER",
            entityId: order.id,
            transactionDate: when,
            idempotencyKey: dto.idempotencyKey,
            title: `${dto.kind.replaceAll("_", " ")} ${order.orderNumber}`,
            outcome: "EXECUTED",
            status: "APPROVED",
            note: text(dto.note),
            evidence: evidence as Prisma.InputJsonValue,
            signatureHash: actionSignatureHash,
            approvedByUserId: user.id,
            approvedAt: when,
            createdByUserId: user.id,
          },
          include: { createdBy: { select: { name: true } } },
        });
    return { review, transactionIds, stockMovementIds };
  }

  private assertStatus(actual: string, allowed: string[], action: string) {
    if (!allowed.includes(actual))
      throw new BadRequestException(
        `${action} cannot run while the order is ${actual}. Expected: ${allowed.join(", ")}.`,
      );
  }

  private actionGroup(kind: ActionKind) {
    if (
      [
        "RESERVE_MATERIALS",
        "RELEASE_RESERVATION",
        "ISSUE_MATERIALS",
        "RETURN_MATERIALS",
        "PACKAGING_ISSUE",
        "PACKAGING_RETURN",
      ].includes(kind)
    )
      return "MATERIALS_DISPENSING";
    if (
      [
        "PLACE_QC_HOLD",
        "RECORD_IN_PROCESS_RESULT",
        "RECORD_QUALITY_RESULT",
        "QA_RELEASE",
      ].includes(kind)
    )
      return "QUALITY_COMPLIANCE";
    if (["POST_SCRAP_DISPOSITION", "CREATE_REWORK_DISPOSITION"].includes(kind))
      return "PRODUCTION_EXECUTION";
    if (["POST_PRODUCTION_RECEIPT", "CLOSE"].includes(kind))
      return "COSTING_ACCOUNTS";
    return "PRODUCTION_BATCH_ORDERS";
  }

  private resolveActionOrderLot(
    order: any,
    dto: ManufacturingOrderActionDto,
    required: boolean,
  ) {
    const payload = jsonObject(dto.payload);
    const lineKeys = (dto.lines ?? [])
      .map((line) => line.orderLotId ?? line.lotId ?? line.lotNumber)
      .filter((value): value is string => Boolean(value));
    const requestedKey =
      text(payload.orderLotId) ??
      text(payload.lotNumber) ??
      lineKeys[0] ??
      null;
    if (lineKeys.some((key) => key !== requestedKey))
      throw new BadRequestException(
        `${dto.kind} can post only one production lot per action.`,
      );
    if (!requestedKey && order.lots.length === 1) return order.lots[0];
    if (!requestedKey && required)
      throw new BadRequestException(
        `${dto.kind} requires orderLotId (or lotNumber) so lot-wise actuals remain auditable.`,
      );
    const lot = order.lots.find(
      (entry: any) =>
        entry.id === requestedKey || entry.lotNumber === requestedKey,
    );
    if (!lot)
      throw new BadRequestException(
        `${dto.kind} references a lot that does not belong to this order.`,
      );
    return lot;
  }

  private materialRole(material: any) {
    return material.inventoryItem?.manufacturingProfile?.role ?? "RAW_MATERIAL";
  }

  private resolveMaterialLines(
    order: any,
    dto: ManufacturingOrderActionDto,
    mode: "ISSUE" | "RETURN",
    allowedRoles: string[],
    explicit = false,
    unitConversions?: ManufacturingUnitConversionEvidence[],
  ) {
    const eligible = order.materials.filter((material: any) =>
      allowedRoles.includes(this.materialRole(material)),
    );
    if (!eligible.length)
      throw new BadRequestException(
        `${dto.kind} has no eligible order materials.`,
      );
    if (explicit && !dto.lines?.length)
      throw new BadRequestException(
        `${dto.kind} requires explicit actual material lines.`,
      );
    const requested = dto.lines?.length
      ? dto.lines
      : eligible.map((material: any) => ({
          orderMaterialId: material.id,
          quantity:
            mode === "ISSUE"
              ? decimal(material.plannedQuantity)
                  .sub(material.issuedQuantity)
                  .toNumber()
              : decimal(material.issuedQuantity)
                  .sub(material.returnedQuantity)
                  .sub(material.consumedQuantity)
                  .sub(material.scrappedQuantity)
                  .toNumber(),
        }));
    return requested.map(
      (input: NonNullable<ManufacturingOrderActionDto["lines"]>[number]) => {
        const material = input.orderMaterialId
          ? order.materials.find(
              (entry: any) => entry.id === input.orderMaterialId,
            )
          : order.materials.find(
              (entry: any) => entry.inventoryItemId === input.inventoryItemId,
            );
        if (!material)
          throw new BadRequestException(
            "Every action line must reference an order material.",
          );
        if (!allowedRoles.includes(this.materialRole(material)))
          throw new BadRequestException(
            `${material.inventoryItem.itemName} is not eligible for ${dto.kind}.`,
          );
        if (
          material.unit.trim().toLowerCase() !==
          material.inventoryItem.unit.trim().toLowerCase()
        ) {
          throw new BadRequestException(
            `Order material ${material.inventoryItem.itemName} is not stored in its authoritative stock/base unit (${material.inventoryItem.unit}). Recreate or normalize the draft order before posting stock.`,
          );
        }
        const remainingQuantity =
          mode === "ISSUE"
            ? decimal(material.plannedQuantity).sub(material.issuedQuantity)
            : decimal(material.issuedQuantity)
                .sub(material.returnedQuantity)
                .sub(material.consumedQuantity)
                .sub(material.scrappedQuantity);
        const normalized = manufacturingBaseQuantity(
          material.inventoryItem,
          input.quantity == null ? remainingQuantity : input.quantity,
          input.quantity == null
            ? material.inventoryItem.unit
            : (input.unit ?? material.unit),
          `${material.inventoryItem.itemName} quantity`,
          4,
          input.quantity == null,
        );
        const quantity = normalized.quantity;
        unitConversions?.push(normalized.evidence);
        if (quantity.greaterThan(remainingQuantity))
          throw new BadRequestException(
            `Invalid ${mode.toLowerCase()} quantity for ${material.inventoryItem.itemName}.`,
          );
        const inventoryLotId = input.inventoryLotId ?? input.lotId ?? null;
        const lotTracked = Boolean(
          material.inventoryItem?.manufacturingProfile?.lotTracked,
        );
        if (mode === "RETURN" && lotTracked && !inventoryLotId) {
          throw new BadRequestException(
            `Lot-tracked material ${material.inventoryItem.itemName} requires inventoryLotId for return.`,
          );
        }
        return {
          orderMaterialId: material.id,
          inventoryItemId: material.inventoryItemId,
          quantity,
          unit: normalized.unit,
          remainingQuantity,
          reservedQuantity: decimal(material.reservedQuantity),
          issuedQuantity: decimal(material.issuedQuantity),
          plannedQuantity: decimal(material.plannedQuantity),
          reservationLineId: null as string | null,
          inventoryLotId,
          lotTracked,
        };
      },
    );
  }

  private transactionQuantity(
    order: any,
    orderLotId: string,
    inventoryItemId: string,
    types: string[],
    inventoryLotId?: string | null,
    lotRole: "SOURCE" | "DESTINATION" = "SOURCE",
  ) {
    return (order.transactions ?? [])
      .filter(
        (transaction: any) =>
          transaction.status === "POSTED" &&
          transaction.orderLotId === orderLotId &&
          types.includes(transaction.transactionType),
      )
      .flatMap((transaction: any) => transaction.lines)
      .filter(
        (line: any) =>
          line.inventoryItemId === inventoryItemId &&
          (!inventoryLotId ||
            (lotRole === "SOURCE"
              ? line.sourceInventoryLotId
              : line.destinationInventoryLotId) === inventoryLotId),
      )
      .reduce(
        (total: Prisma.Decimal, line: any) => total.add(line.quantity),
        decimal(0),
      );
  }

  private assertLotIssueLimits(
    order: any,
    orderLot: any,
    lines: Array<any>,
    issueType: "MATERIAL_ISSUE" | "PACKAGING_ISSUE",
  ) {
    const returnType =
      issueType === "PACKAGING_ISSUE" ? "PACKAGING_RETURN" : "MATERIAL_RETURN";
    for (const line of lines) {
      const material = order.materials.find(
        (entry: any) => entry.id === line.orderMaterialId,
      )!;
      const lotRequirement =
        issueType === "PACKAGING_ISSUE"
          ? (order.packagingOrders ?? [])
              .filter(
                (packagingOrder: any) =>
                  packagingOrder.orderLotId === orderLot.id ||
                  !packagingOrder.orderLotId,
              )
              .reduce((total: Prisma.Decimal, packagingOrder: any) => {
                const configurationLine =
                  packagingOrder.packagingConfiguration.lines.find(
                    (candidate: any) =>
                      candidate.inventoryItemId === line.inventoryItemId,
                  );
                return configurationLine
                  ? total.add(
                      packagingOrder.orderLotId
                        ? decimal(configurationLine.quantity).mul(
                            packagingOrder.plannedQuantity,
                          )
                        : calculateOrderLevelPackagingLotRequirement({
                            componentQuantityPerFinishedUnit:
                              configurationLine.quantity,
                            packagingPlannedQuantity:
                              packagingOrder.plannedQuantity,
                            orderPlannedQuantity: order.plannedQuantity,
                            lots: order.lots.map((candidate: any) => ({
                              id: candidate.id,
                              plannedQuantity: candidate.plannedQuantity,
                            })),
                            orderLotId: orderLot.id,
                          }),
                    )
                  : total;
              }, decimal(0))
              .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
          : totalActivePlannedMaterialQuantity(
              order.materials,
              line.inventoryItemId,
            )
              .mul(orderLot.plannedQuantity)
              .div(order.plannedQuantity)
              .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      if (
        issueType === "PACKAGING_ISSUE" &&
        lotRequirement.lessThanOrEqualTo(0)
      ) {
        throw new BadRequestException(
          `No active packaging order/configuration requires ${material.inventoryItem.itemName} for ${orderLot.lotNumber}.`,
        );
      }
      const alreadyIssued = this.transactionQuantity(
        order,
        orderLot.id,
        line.inventoryItemId,
        [issueType],
      );
      const alreadyReturned = this.transactionQuantity(
        order,
        orderLot.id,
        line.inventoryItemId,
        [returnType],
      );
      if (
        alreadyIssued
          .sub(alreadyReturned)
          .add(line.quantity)
          .greaterThan(lotRequirement)
      ) {
        throw new BadRequestException(
          `${issueType} exceeds the lot-wise requirement for ${material.inventoryItem.itemName} in ${orderLot.lotNumber}.`,
        );
      }
    }
  }

  private assertLotReturnLimits(
    order: any,
    orderLot: any,
    lines: Array<any>,
    returnType: "MATERIAL_RETURN" | "PACKAGING_RETURN",
  ) {
    const issueType =
      returnType === "PACKAGING_RETURN" ? "PACKAGING_ISSUE" : "MATERIAL_ISSUE";
    for (const line of lines) {
      const issued = this.transactionQuantity(
        order,
        orderLot.id,
        line.inventoryItemId,
        [issueType],
        line.inventoryLotId,
        "SOURCE",
      );
      const returned = this.transactionQuantity(
        order,
        orderLot.id,
        line.inventoryItemId,
        [returnType],
        line.inventoryLotId,
        "DESTINATION",
      );
      if (line.quantity.greaterThan(issued.sub(returned)))
        throw new BadRequestException(
          `${returnType} exceeds the net quantity issued to this lot.`,
        );
    }
  }

  private assertLotMaterialReady(order: any, orderLot: any) {
    const rawMaterials = order.materials.filter(
      (material: any) => this.materialRole(material) !== "PACKAGING_MATERIAL",
    );
    for (const material of rawMaterials) {
      const required = decimal(material.plannedQuantity)
        .mul(orderLot.plannedQuantity)
        .div(order.plannedQuantity)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      const issued = this.transactionQuantity(
        order,
        orderLot.id,
        material.inventoryItemId,
        ["MATERIAL_ISSUE"],
      );
      const returned = this.transactionQuantity(
        order,
        orderLot.id,
        material.inventoryItemId,
        ["MATERIAL_RETURN"],
      );
      if (issued.sub(returned).lessThan(required))
        throw new BadRequestException(
          `Lot ${orderLot.lotNumber} cannot start: ${material.inventoryItem.itemName} is not fully issued for this lot.`,
        );
    }
  }

  private allocateReservationLines(
    order: any,
    lines: Array<any>,
    required: boolean,
  ) {
    const allocated: Array<any> = [];
    for (const line of lines) {
      let remaining = decimal(line.quantity);
      const candidates = (order.reservations ?? [])
        .filter((reservation: any) =>
          (ACTIVE_RESERVATIONS as readonly string[]).includes(
            reservation.status,
          ),
        )
        .flatMap((reservation: any) => reservation.lines)
        .filter(
          (reservationLine: any) =>
            (line.orderMaterialId
              ? reservationLine.orderMaterialId === line.orderMaterialId
              : reservationLine.inventoryItemId === line.inventoryItemId) &&
            (!line.inventoryLotId ||
              reservationLine.inventoryLotId === line.inventoryLotId) &&
            (!line.lotTracked ||
              Boolean(reservationLine.inventoryLotId ?? line.inventoryLotId)),
        );
      for (const reservationLine of candidates) {
        const available = decimal(reservationLine.quantity)
          .sub(reservationLine.issuedQuantity)
          .sub(reservationLine.releasedQuantity);
        if (available.lessThanOrEqualTo(0) || remaining.lessThanOrEqualTo(0))
          continue;
        const quantity = Prisma.Decimal.min(available, remaining);
        allocated.push({
          ...line,
          quantity,
          reservationLineId: reservationLine.id,
          inventoryLotId:
            reservationLine.inventoryLotId ?? line.inventoryLotId ?? null,
        });
        remaining = remaining.sub(quantity);
      }
      if (remaining.greaterThan(0)) {
        if (required)
          throw new BadRequestException(
            `Material issue exceeds active reservation for ${line.inventoryItemId}.`,
          );
        if (line.lotTracked && !line.inventoryLotId) {
          throw new BadRequestException(
            `Lot-tracked material ${line.inventoryItemId} requires inventoryLotId for issue or return.`,
          );
        }
        allocated.push({
          ...line,
          quantity: remaining,
          reservationLineId: null,
        });
      }
    }
    return allocated;
  }

  private async applyReservationIssue(
    tx: Prisma.TransactionClient,
    order: any,
    lines: Array<any>,
  ) {
    const increments = new Map<string, Prisma.Decimal>();
    for (const line of lines)
      if (line.reservationLineId)
        increments.set(
          line.reservationLineId,
          (increments.get(line.reservationLineId) ?? decimal(0)).add(
            line.quantity,
          ),
        );
    for (const [id, quantity] of increments)
      await tx.manufacturingReservationLine.update({
        where: { id },
        data: { issuedQuantity: { increment: quantity } },
      });
    const reservationIds = [
      ...new Set(
        (order.reservations ?? []).map((reservation: any) => reservation.id),
      ),
    ] as string[];
    for (const reservationId of reservationIds) {
      const reservationLines = await tx.manufacturingReservationLine.findMany({
        where: { reservationId },
      });
      const outstanding = reservationLines.reduce(
        (total, line) =>
          total.add(
            decimal(line.quantity)
              .sub(line.issuedQuantity)
              .sub(line.releasedQuantity),
          ),
        decimal(0),
      );
      const issued = reservationLines.reduce(
        (total, line) => total.add(line.issuedQuantity),
        decimal(0),
      );
      await tx.manufacturingReservation.update({
        where: { id: reservationId },
        data: {
          status: outstanding.equals(0)
            ? "ISSUED"
            : issued.greaterThan(0)
              ? "PARTIALLY_ISSUED"
              : "ACTIVE",
        },
      });
    }
  }

  private assertSourceReceipt(
    order: any,
    sourceTransactionId: string,
    orderLotId: string,
  ) {
    const receipt = (order.transactions ?? []).find(
      (transaction: any) =>
        transaction.id === sourceTransactionId &&
        transaction.status === "POSTED" &&
        transaction.transactionType === "PRODUCTION_RECEIPT" &&
        transaction.orderLotId === orderLotId,
    );
    if (!receipt)
      throw new BadRequestException(
        "sourceTransactionId must reference a posted production receipt for the selected order lot.",
      );
    return receipt;
  }

  private receiptOutputQuantity(
    order: any,
    sourceTransactionId: string,
    orderLotId: string,
  ) {
    const receipt = this.assertSourceReceipt(
      order,
      sourceTransactionId,
      orderLotId,
    );
    return (receipt.lines ?? [])
      .filter(
        (line: any) =>
          line.inventoryItemId === order.finishedProductId &&
          !line.orderMaterialId,
      )
      .reduce(
        (total: Prisma.Decimal, line: any) => total.add(line.quantity),
        decimal(0),
      );
  }

  private postedQuantity(
    order: any,
    transactionType: string,
    options: {
      orderLotId?: string;
      operationExecutionId?: string;
      inventoryItemId?: string;
      orderMaterialId?: string;
      outputOnly?: boolean;
    } = {},
  ) {
    return (order.transactions ?? [])
      .filter(
        (transaction: any) =>
          transaction.status === "POSTED" &&
          transaction.transactionType === transactionType &&
          (!options.orderLotId ||
            transaction.orderLotId === options.orderLotId) &&
          (!options.operationExecutionId ||
            transaction.operationExecutionId === options.operationExecutionId),
      )
      .flatMap((transaction: any) => transaction.lines ?? [])
      .filter(
        (line: any) =>
          (!options.inventoryItemId ||
            line.inventoryItemId === options.inventoryItemId) &&
          (!options.orderMaterialId ||
            line.orderMaterialId === options.orderMaterialId) &&
          (!options.outputOnly ||
            (line.inventoryItemId === order.finishedProductId &&
              !line.orderMaterialId)),
      )
      .reduce(
        (total: Prisma.Decimal, line: any) => total.add(line.quantity),
        decimal(0),
      );
  }

  private latestLotInspection(order: any, orderLotId: string) {
    return summarizeLotQualityInspections(
      order.qualityInspections ?? [],
      orderLotId,
    );
  }

  private lotPackagingActuals(
    order: any,
    orderLotId?: string,
    required = true,
  ) {
    const packagingIds = new Set(
      order.materials
        .filter(
          (material: any) =>
            this.materialRole(material) === "PACKAGING_MATERIAL",
        )
        .map((material: any) => material.id),
    );
    if (!packagingIds.size)
      return evaluatePackagingActuals({
        required,
        actualIssuePosted: false,
      });
    const transactions = (order.transactions ?? []).filter(
      (transaction: any) =>
        transaction.status === "POSTED" &&
        (!orderLotId || transaction.orderLotId === orderLotId),
    );
    const packagingLines = (type: string) =>
      transactions
        .filter((transaction: any) => transaction.transactionType === type)
        .flatMap((transaction: any) => transaction.lines ?? [])
        .filter(
          (line: any) =>
            line.orderMaterialId && packagingIds.has(line.orderMaterialId),
        );
    const issueLines = packagingLines("PACKAGING_ISSUE");
    const returnLines = packagingLines("PACKAGING_RETURN");
    const usedLines = packagingLines("PRODUCTION_RECEIPT");
    const sumQuantity = (lines: any[]) =>
      lines.reduce(
        (total: Prisma.Decimal, line: any) => total.add(line.quantity),
        decimal(0),
      );
    const actualCost = usedLines.reduce(
      (total: Prisma.Decimal, line: any) => total.add(line.totalCost),
      decimal(0),
    );
    return evaluatePackagingActuals({
      required: true,
      actualIssuePosted: issueLines.length > 0,
      issuedQuantity: sumQuantity(issueLines),
      usedQuantity: sumQuantity(usedLines),
      returnedQuantity: sumQuantity(returnLines),
      scrappedQuantity: order.materials
        .filter((material: any) => packagingIds.has(material.id))
        .reduce(
          (total: Prisma.Decimal, material: any) =>
            total.add(material.scrappedQuantity),
          decimal(0),
        ),
      actualCost: usedLines.length ? actualCost : null,
    });
  }

  private async packagingReleasePolicy(
    tx: Prisma.TransactionClient,
    scope: { id: string },
    order: any,
    when: Date,
  ) {
    const configurations = await tx.manufacturingControlRecord.findMany({
      where: {
        workspaceId: scope.id,
        kind: "PACKAGING_CONFIGURATION",
        inventoryItemId: order.finishedProductId,
        status: "APPROVED",
        approvedAt: { lte: when },
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: when } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: when } }] },
        ],
      },
      select: {
        id: true,
        inventoryItemId: true,
        status: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });
    const packagingOrders = await tx.manufacturingPackagingOrder.findMany({
      where: { workspaceId: scope.id, orderId: order.id },
      select: {
        id: true,
        orderId: true,
        orderLotId: true,
        packagingConfigurationId: true,
        status: true,
        plannedQuantity: true,
        releaseReadyAt: true,
      },
    });
    const finishedGoodsReceipts = (order.transactions ?? [])
      .filter(
        (transaction: any) =>
          transaction.transactionType === "PRODUCTION_RECEIPT",
      )
      .map((transaction: any) => ({
        id: transaction.id,
        orderId: transaction.orderId ?? order.id,
        status: transaction.status,
        transactionDate: transaction.transactionDate,
        quantity: (transaction.lines ?? [])
          .filter(
            (line: any) =>
              line.inventoryItemId === order.finishedProductId &&
              !line.orderMaterialId,
          )
          .reduce(
            (total: Prisma.Decimal, line: any) => total.add(line.quantity),
            decimal(0),
          ),
      }));
    return evaluateManufacturingPackagingReleasePolicy({
      orderId: order.id,
      finishedProductId: order.finishedProductId,
      requiredQuantity: order.completedQuantity,
      at: when,
      configurations,
      naEvidence: (order.workflowReviews ?? []).map((review: any) => ({
        workflowGroup: review.workflowGroup,
        workflowCode: review.workflowCode,
        entityType: review.entityType,
        entityId: review.entityId,
        outcome: review.outcome,
        status: review.status,
        transactionDate: review.transactionDate,
        createdByUserId: review.createdByUserId,
        approvedByUserId: review.approvedByUserId,
        approvedAt: review.approvedAt,
        signatureHash: review.signatureHash,
      })),
      packagingOrders,
      finishedGoodsReceipts,
    });
  }

  private async openFiscalYear(
    tx: Prisma.TransactionClient,
    companyId: string,
    when: Date,
  ) {
    const fiscalYear = await tx.fiscalYear.findFirst({
      where: {
        companyId,
        status: "OPEN",
        startDate: { lte: when },
        endDate: { gte: when },
      },
      orderBy: { startDate: "desc" },
    });
    if (!fiscalYear)
      throw new BadRequestException(
        "Transaction date must be inside an open fiscal year.",
      );
    return fiscalYear;
  }

  private async assertManufacturingPeriodOpen(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    when: Date,
  ) {
    // Manufacturing periods are stored as date-only boundaries. Normalising the
    // action timestamp prevents a period ending on (for example) 30 September
    // from appearing open merely because the action was posted later that day.
    const postingDay = new Date(
      Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()),
    );
    const blockedPeriod = await tx.manufacturingPeriod.findFirst({
      where: {
        workspaceId,
        periodStart: { lte: postingDay },
        periodEnd: { gte: postingDay },
        status: { in: ["LOCKED", "ARCHIVED"] },
      },
      select: { periodYear: true, periodMonth: true, status: true },
    });
    if (blockedPeriod) {
      throw new BadRequestException(
        `Manufacturing period ${blockedPeriod.periodYear}-${String(blockedPeriod.periodMonth).padStart(2, "0")} is ${blockedPeriod.status}; backdated manufacturing actions are not permitted.`,
      );
    }
  }

  private operationDispositionContext(
    order: any,
    dto: ManufacturingOrderActionDto,
    transactionType: "SCRAP_RECEIPT" | "REWORK_RECEIPT",
  ) {
    const payload = jsonObject(dto.payload);
    const operationExecutionId = text(payload.operationExecutionId);
    if (!operationExecutionId)
      throw new BadRequestException(
        `${dto.kind} requires payload.operationExecutionId.`,
      );
    const execution = order.operationExecutions.find(
      (entry: any) => entry.id === operationExecutionId,
    );
    if (!execution || execution.status !== "COMPLETED")
      throw new BadRequestException(
        `${dto.kind} requires a COMPLETED operation execution on this order.`,
      );
    if (dto.lines?.length !== 1)
      throw new BadRequestException(
        `${dto.kind} requires exactly one disposition line.`,
      );
    const recorded = decimal(
      transactionType === "SCRAP_RECEIPT"
        ? execution.scrapQuantity
        : execution.reworkQuantity,
    );
    const alreadyPosted = this.postedQuantity(order, transactionType, {
      operationExecutionId: execution.id,
    });
    const remaining = recorded.sub(alreadyPosted);
    if (remaining.isNegative())
      throw new ConflictException(
        `Posted ${transactionType.toLowerCase().replaceAll("_", " ")} quantity exceeds the recorded operation quantity.`,
      );
    if (remaining.isZero())
      throw new ConflictException(
        `The recorded ${transactionType === "SCRAP_RECEIPT" ? "scrap" : "rework"} quantity for this operation is already fully disposed.`,
      );
    const line = dto.lines[0]!;
    const quantity = quantityDecimal(line.quantity, "disposition quantity");
    if (!quantity.equals(remaining))
      throw new BadRequestException(
        `${dto.kind} must dispose the exact remaining recorded quantity ${remaining.toString()}; partial or excess disposition is not permitted.`,
      );
    const reasonCode = text(line.reasonCode) ?? text(payload.reasonCode);
    const note = text(dto.note);
    if (!reasonCode)
      throw new BadRequestException(
        `${dto.kind} requires a controlled reasonCode.`,
      );
    if (!note)
      throw new BadRequestException(`${dto.kind} requires a disposition note.`);
    const orderLot = order.lots.find(
      (lot: any) => lot.id === execution.orderLotId,
    );
    if (!orderLot)
      throw new BadRequestException(
        "The operation execution is not linked to a valid production lot.",
      );
    return {
      payload,
      execution,
      orderLot,
      line,
      quantity,
      reasonCode,
      note,
      recorded,
      alreadyPosted,
    };
  }

  private async postOperationScrapDisposition(
    tx: Prisma.TransactionClient,
    scope: { id: string; tenantId: string; companyId: string },
    user: AuthenticatedRequestUser,
    order: any,
    settings: any,
    dto: ManufacturingOrderActionDto,
    when: Date,
  ) {
    const context = this.operationDispositionContext(
      order,
      dto,
      "SCRAP_RECEIPT",
    );
    if (
      !settings.defaultScrapWarehouseId ||
      !settings.defaultWipWarehouseId ||
      !settings.defaultWipLocationId ||
      !settings.scrapRecoveryAccountId ||
      !settings.wipInventoryAccountId
    ) {
      throw new BadRequestException(
        "Scrap warehouse and Scrap-recovery/WIP LEDGER mappings are required before scrap disposition.",
      );
    }
    const scrapWarehouse = await this.activeWarehouse(
      tx,
      scope.id,
      settings.defaultScrapWarehouseId,
      "Scrap warehouse",
      { companyId: scope.companyId, role: "SCRAP" },
    );
    await this.activeWarehouse(
      tx,
      scope.id,
      settings.defaultWipWarehouseId,
      "WIP warehouse",
      { companyId: scope.companyId, role: "WIP" },
    );
    const wipLocation = await this.activeLocation(
      tx,
      scope.id,
      settings.defaultWipWarehouseId,
      settings.defaultWipLocationId,
      "WIP location",
      { companyId: scope.companyId, dispositions: ["WIP"] },
    );
    if (!wipLocation)
      throw new BadRequestException(
        "An active WIP-disposition location is required before scrap disposition.",
      );
    const destinationLocationId =
      context.line.destinationLocationId ??
      text(context.payload.destinationLocationId);
    const scrapLocation = await this.activeLocation(
      tx,
      scope.id,
      scrapWarehouse.id,
      destinationLocationId,
      "Scrap destination location",
      { companyId: scope.companyId, dispositions: ["SCRAP"] },
    );
    if (!scrapLocation || scrapLocation.disposition !== "SCRAP")
      throw new BadRequestException(
        "An active SCRAP-disposition location in the configured scrap warehouse is required.",
      );
    const scrapItemId =
      text(context.line.inventoryItemId) ??
      text(context.payload.scrapInventoryItemId);
    if (!scrapItemId)
      throw new BadRequestException(
        "POST_SCRAP_DISPOSITION requires a dedicated BY_PRODUCT inventoryItemId.",
      );
    const scrapItem = await tx.inventoryItem.findFirst({
      where: {
        id: scrapItemId,
        workspaceId: scope.id,
        status: "ACTIVE",
        manufacturingProfile: { role: "BY_PRODUCT", isActive: true },
      },
      include: { manufacturingProfile: true },
    });
    if (!scrapItem)
      throw new BadRequestException(
        "Scrap inventoryItemId must be an active BY_PRODUCT manufacturing item in this workspace.",
      );
    const unit = text(context.line.unit) ?? scrapItem.unit;
    if (unit !== scrapItem.unit || unit !== order.unit)
      throw new BadRequestException(
        "The scrap by-product base unit must match the recorded production-order unit.",
      );
    const recoveryInput =
      context.line.unitCost ?? context.payload.recoveryUnitCost;
    if (recoveryInput === null || recoveryInput === undefined)
      throw new BadRequestException(
        "POST_SCRAP_DISPOSITION requires an explicit recoveryUnitCost, including zero when scrap has no recoverable value.",
      );
    let recoveryUnitCost: Prisma.Decimal;
    try {
      recoveryUnitCost = new Prisma.Decimal(
        recoveryInput as Prisma.Decimal.Value,
      );
    } catch {
      throw new BadRequestException(
        "recoveryUnitCost must be a valid non-negative cost.",
      );
    }
    if (!recoveryUnitCost.isFinite() || recoveryUnitCost.isNegative())
      throw new BadRequestException(
        "recoveryUnitCost must be a valid non-negative cost.",
      );
    const normalizedUnitCost = recoveryUnitCost.toDecimalPlaces(
      6,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    if (!normalizedUnitCost.equals(recoveryUnitCost))
      throw new BadRequestException(
        "recoveryUnitCost cannot contain more than six decimal places.",
      );
    recoveryUnitCost = normalizedUnitCost;
    const recoveryValue = recoveryUnitCost
      .mul(context.quantity)
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    const scrapLotNumber =
      text(context.line.lotNumber) ?? text(context.payload.scrapLotNumber);
    if (!scrapLotNumber)
      throw new BadRequestException(
        "POST_SCRAP_DISPOSITION requires a unique scrap lotNumber.",
      );
    const existingLot = await tx.manufacturingInventoryLot.findUnique({
      where: {
        workspaceId_inventoryItemId_lotNumber: {
          workspaceId: scope.id,
          inventoryItemId: scrapItem.id,
          lotNumber: scrapLotNumber,
        },
      },
    });
    if (existingLot)
      throw new ConflictException(
        `Scrap lot ${scrapLotNumber} already exists.`,
      );
    const scrapAccount = await this.protectedInventoryControlLedger(
      tx,
      scope.companyId,
      settings.scrapRecoveryAccountId,
      "Scrap inventory/recovery asset account",
    );
    const wipAccount = await this.activeLedger(
      tx,
      scope.companyId,
      settings.wipInventoryAccountId,
      "WIP inventory account",
      "ASSET",
    );
    if (scrapAccount.id === wipAccount.id)
      throw new BadRequestException(
        "Scrap-recovery and WIP accounts must be different LEDGER accounts.",
      );
    const fiscalYear = await this.openFiscalYear(tx, scope.companyId, when);
    const transaction = await tx.manufacturingTransaction.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        fiscalYearId: fiscalYear.id,
        transactionNumber: compactReference("MSD", dto.idempotencyKey),
        transactionType: "SCRAP_RECEIPT",
        status: "POSTED",
        transactionDate: when,
        orderId: order.id,
        orderLotId: context.orderLot.id,
        operationExecutionId: context.execution.id,
        fromWarehouseId: settings.defaultWipWarehouseId,
        toWarehouseId: scrapWarehouse.id,
        fromLocationId: settings.defaultWipLocationId ?? null,
        toLocationId: scrapLocation.id,
        referenceNo: order.orderNumber,
        notes: `${context.reasonCode}: ${context.note}`,
        idempotencyKey: `MFG:${dto.idempotencyKey}:SCRAP_RECEIPT`,
        createdByUserId: user.id,
        postedByUserId: user.id,
        postedAt: when,
        lines: {
          create: [
            {
              inventoryItemId: scrapItem.id,
              quantity: context.quantity,
              unit,
              unitCost: recoveryUnitCost,
              totalCost: recoveryValue,
              notes: context.reasonCode,
            },
          ],
        },
      },
      include: { lines: true },
    });
    const transactionLine = transaction.lines[0];
    if (!transactionLine)
      throw new BadRequestException(
        "Scrap disposition transaction line was not created.",
      );
    const inventoryLot = await tx.manufacturingInventoryLot.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        inventoryItemId: scrapItem.id,
        warehouseId: scrapWarehouse.id,
        locationId: scrapLocation.id,
        lotNumber: scrapLotNumber,
        receivedQuantity: context.quantity,
        availableQuantity: context.quantity,
        unit,
        unitCost: recoveryUnitCost,
        manufacturedAt: when,
        sourceTransactionLineId: transactionLine.id,
        createdByUserId: user.id,
      },
    });
    await tx.manufacturingTransactionLine.update({
      where: { id: transactionLine.id },
      data: { destinationInventoryLotId: inventoryLot.id },
    });
    const movement = await tx.stockMovement.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        warehouseId: scrapWarehouse.id,
        inventoryItemId: scrapItem.id,
        transactionType: "SCRAP_RECEIPT",
        transactionId: transaction.id,
        transactionLineId: transactionLine.id,
        referenceNo: order.orderNumber,
        movementType: "IN",
        quantity: context.quantity,
        unit,
        inputUnitCost: recoveryUnitCost,
        transactionDate: when,
        postedByUserId: user.id,
        idempotencyKey: `MFG:${dto.idempotencyKey}:SCRAP_RECEIPT:IN`,
        manufacturingTransactionLineId: transactionLine.id,
      },
    });
    const costed = await rebuildMovingAverageCosts(tx, scope.id, [
      scrapItem.id,
    ]);
    const costedMovement = costed.movements.find(
      (entry) => entry.id === movement.id,
    );
    if (
      !costedMovement ||
      !decimal(costedMovement.movementValue).equals(recoveryValue)
    )
      throw new BadRequestException(
        "Scrap stock value does not reconcile to the explicit recovery value.",
      );
    await this.requireInventoryService().reconcileMovingAverageLedger(
      tx,
      scope.id,
      costed.movements,
      user.id,
    );
    await tx.manufacturingTransactionLine.update({
      where: { id: transactionLine.id },
      data: {
        unitCost: costedMovement.unitCost,
        totalCost: costedMovement.movementValue,
      },
    });
    const journalAmount = roundMoneyDecimal(recoveryValue);
    const voucher = await tx.voucherEntry.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        createdByUserId: user.id,
        voucherType: "JOURNAL",
        documentKind: "SCRAP_RECEIPT",
        voucherNumber: compactReference("JV-SCRAP", dto.idempotencyKey),
        voucherDate: when,
        partyName: "Manufacturing",
        reference: order.orderNumber,
        narration: `Scrap disposition ${scrapLotNumber} for ${order.orderNumber}`,
        status: "POSTED",
        totalAmount: journalAmount,
        debit: journalAmount,
        credit: journalAmount,
        currency: settings.currency,
        fiscalYearId: fiscalYear.id,
        sourceType: "MANUFACTURING_SCRAP_RECEIPT",
        sourceId: transaction.id,
        approvedByUserId: user.id,
        approvedAt: when,
        postedAt: when,
        idempotencyKey: `MFG:${dto.idempotencyKey}:SCRAP_RECEIPT:GL`,
        lines: {
          create: [
            {
              accountId: scrapAccount.id,
              ledger: scrapAccount.name,
              description: `Scrap recovery ${scrapLotNumber}`,
              debit: journalAmount,
              credit: 0,
            },
            {
              accountId: wipAccount.id,
              ledger: wipAccount.name,
              description: `WIP scrap recovery ${context.orderLot.lotNumber}`,
              debit: 0,
              credit: journalAmount,
            },
          ],
        },
      },
    });
    await tx.manufacturingTransaction.update({
      where: { id: transaction.id },
      data: { voucherEntryId: voucher.id },
    });
    return {
      transactionId: transaction.id,
      stockMovementId: movement.id,
      evidence: {
        disposition: "SCRAP",
        operationExecutionId: context.execution.id,
        operationCode: context.execution.routingOperation.code,
        orderLotId: context.orderLot.id,
        recordedQuantity: context.recorded.toString(),
        disposedQuantity: context.quantity.toString(),
        reasonCode: context.reasonCode,
        destinationWarehouseId: scrapWarehouse.id,
        destinationLocationId: scrapLocation.id,
        scrapInventoryItemId: scrapItem.id,
        scrapInventoryLotId: inventoryLot.id,
        recoveryUnitCost: recoveryUnitCost.toString(),
        recoveryValue: recoveryValue.toString(),
      },
    };
  }

  private async createOperationReworkDisposition(
    tx: Prisma.TransactionClient,
    scope: { id: string; tenantId: string; companyId: string },
    user: AuthenticatedRequestUser,
    order: any,
    settings: any,
    dto: ManufacturingOrderActionDto,
    when: Date,
  ) {
    const context = this.operationDispositionContext(
      order,
      dto,
      "REWORK_RECEIPT",
    );
    const reworkType = text(context.payload.reworkType)?.toUpperCase();
    if (reworkType !== "REWORK" && reworkType !== "REPROCESSING")
      throw new BadRequestException(
        "CREATE_REWORK_DISPOSITION requires payload.reworkType REWORK or REPROCESSING.",
      );
    const bomVersionId = text(context.payload.bomVersionId);
    const routingVersionId = text(context.payload.routingVersionId);
    if (!bomVersionId || !routingVersionId)
      throw new BadRequestException(
        "CREATE_REWORK_DISPOSITION requires approved bomVersionId and routingVersionId values.",
      );
    const plannedStartDate = context.payload.plannedStartDate
      ? asDate(String(context.payload.plannedStartDate), "plannedStartDate")
      : when;
    const plannedEndDate = context.payload.plannedEndDate
      ? asDate(String(context.payload.plannedEndDate), "plannedEndDate")
      : plannedStartDate;
    if (plannedEndDate.getTime() < plannedStartDate.getTime())
      throw new BadRequestException(
        "Rework plannedEndDate cannot be earlier than plannedStartDate.",
      );
    const bomVersion = await tx.manufacturingBomVersion.findFirst({
      where: {
        id: bomVersionId,
        status: "APPROVED",
        bom: {
          workspaceId: scope.id,
          finishedProductId: order.finishedProductId,
          isActive: true,
        },
      },
      include: {
        bom: {
          include: {
            finishedProduct: {
              select: {
                itemName: true,
                unit: true,
                alternateUnit: true,
                alternateUnitConversion: true,
              },
            },
          },
        },
        components: {
          include: {
            inventoryItem: {
              select: {
                itemName: true,
                unit: true,
                alternateUnit: true,
                alternateUnitConversion: true,
              },
            },
          },
        },
      },
    });
    if (!bomVersion)
      throw new BadRequestException(
        "The rework disposition requires an approved BOM for the same finished product.",
      );
    assertWithinBomEffectiveWindow(
      plannedStartDate,
      bomVersion,
      "Rework production order planned start date",
    );
    const routingVersion = await tx.manufacturingRoutingVersion.findFirst({
      where: {
        id: routingVersionId,
        status: "APPROVED",
        routing: {
          workspaceId: scope.id,
          finishedProductId: order.finishedProductId,
          isActive: true,
        },
      },
      include: { operations: { orderBy: { sequence: "asc" } } },
    });
    if (!routingVersion?.operations.length)
      throw new BadRequestException(
        "The rework disposition requires an approved routing with operations for the same finished product.",
      );
    const normalizedOutput = manufacturingBaseQuantity(
      bomVersion.bom.finishedProduct,
      context.quantity,
      order.unit,
      "Rework disposition quantity",
      4,
    );
    const normalizedBomOutput = manufacturingBaseQuantity(
      bomVersion.bom.finishedProduct,
      bomVersion.outputQuantity,
      bomVersion.outputUnit,
      "Rework BOM output quantity",
      4,
    );
    const requiredComponents = bomVersion.components.filter(
      (component: any) => !component.isOptional,
    );
    if (!requiredComponents.length)
      throw new BadRequestException(
        "Rework production orders require at least one non-optional BOM component.",
      );
    const normalizedComponents = requiredComponents.map((component: any) =>
      manufacturingBaseQuantity(
        component.inventoryItem,
        component.quantityPerOutput,
        component.unit,
        `Rework BOM component ${component.inventoryItem.itemName} quantity`,
        6,
      ),
    );
    const calculatedRequirements = calculateBomRequirements(
      requiredComponents.map((component: any, index: number) => ({
        materialId: component.inventoryItemId,
        unit: normalizedComponents[index]!.unit,
        quantityPerOutput: normalizedComponents[index]!.quantity.div(
          normalizedBomOutput.quantity,
        ).toString(),
        wastagePercent: component.scrapPercent,
      })),
      normalizedOutput.quantity,
    );
    const requirements = calculatedRequirements.map((requirement) => {
      const stored = requirement.requiredQuantity.toDecimalPlaces(
        4,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      if (stored.lessThanOrEqualTo(0))
        throw new BadRequestException(
          `Required rework stock quantity for material ${requirement.materialId} is below the minimum 4-decimal stock precision.`,
        );
      return { ...requirement, requiredQuantity: stored };
    });
    const requirementQuantityEvidence = calculatedRequirements.map(
      (requirement, index) => {
        const stored = requirements[index]!.requiredQuantity;
        return {
          inventoryItemId: requirement.materialId,
          calculatedBaseQuantity: requirement.requiredQuantity.toString(),
          storedBaseQuantity: stored.toString(),
          unit: requirement.unit,
          storageDecimalPlaces: 4,
          storageRoundingMode: "ROUND_HALF_UP",
          storageRoundingApplied: !stored.equals(requirement.requiredQuantity),
        };
      },
    );
    const reworkOrderId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingOrder",
      `REWORK:${dto.idempotencyKey}`,
    );
    const issued = await issueManufacturingDocumentNumberTx(
      tx,
      scope,
      user.id,
      {
        documentKind: "PRODUCTION_ORDER",
        issuedAt: plannedStartDate,
        idempotencyKey: `MFG:${dto.idempotencyKey}:REWORK_ORDER_NUMBER`,
        entityType: "ManufacturingOrder",
        entityId: reworkOrderId,
        validateIssuedAtOnReplay: true,
      },
    );
    const reworkOrder = await tx.manufacturingOrder.create({
      data: {
        id: reworkOrderId,
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        orderNumber: issued.documentNumber,
        type: reworkType,
        status: "DRAFT",
        finishedProductId: order.finishedProductId,
        bomVersionId: bomVersion.id,
        routingVersionId: routingVersion.id,
        issueWarehouseId: order.issueWarehouseId,
        receiptWarehouseId: order.receiptWarehouseId,
        issueLocationId: order.issueLocationId,
        receiptLocationId: order.receiptLocationId,
        plannedQuantity: normalizedOutput.quantity,
        unit: normalizedOutput.unit,
        plannedStartDate,
        plannedEndDate,
        notes: `${reworkType} from ${order.orderNumber}/${context.orderLot.lotNumber}/${context.execution.routingOperation.code}; ${context.reasonCode}: ${context.note}`,
        createdByUserId: user.id,
        materials: {
          create: requirements.map((requirement) => {
            const component = requiredComponents.find(
              (entry: any) => entry.inventoryItemId === requirement.materialId,
            )!;
            return {
              bomComponentId: component.id,
              inventoryItemId: requirement.materialId,
              unit: requirement.unit ?? component.unit,
              plannedQuantity: requirement.requiredQuantity,
              requiredDate: plannedStartDate,
            };
          }),
        },
        lots: {
          create: [
            {
              lotNumber: `${issued.documentNumber}-LOT-01`,
              sequence: 1,
              plannedQuantity: normalizedOutput.quantity,
              notes: `Linked to source lot ${context.orderLot.lotNumber}`,
            },
          ],
        },
      },
      include: { lots: true },
    });
    const reworkLot = reworkOrder.lots[0];
    if (!reworkLot)
      throw new BadRequestException("Rework production lot was not created.");
    await tx.manufacturingOperationExecution.createMany({
      data: routingVersion.operations.map((operation) => ({
        orderId: reworkOrder.id,
        orderLotId: reworkLot.id,
        routingOperationId: operation.id,
        plannedQuantity: normalizedOutput.quantity,
      })),
    });
    const fiscalYear = await this.openFiscalYear(tx, scope.companyId, when);
    const transaction = await tx.manufacturingTransaction.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        fiscalYearId: fiscalYear.id,
        transactionNumber: compactReference("MRD", dto.idempotencyKey),
        transactionType: "REWORK_RECEIPT",
        status: "POSTED",
        transactionDate: when,
        orderId: order.id,
        orderLotId: context.orderLot.id,
        operationExecutionId: context.execution.id,
        fromWarehouseId: settings.defaultWipWarehouseId ?? null,
        toWarehouseId: settings.defaultWipWarehouseId ?? null,
        fromLocationId: settings.defaultWipLocationId ?? null,
        toLocationId: settings.defaultWipLocationId ?? null,
        referenceNo: reworkOrder.orderNumber,
        notes: `${context.reasonCode}: ${context.note}; linked ${reworkType} order ${reworkOrder.orderNumber}`,
        idempotencyKey: `MFG:${dto.idempotencyKey}:REWORK_RECEIPT`,
        createdByUserId: user.id,
        postedByUserId: user.id,
        postedAt: when,
        lines: {
          create: [
            {
              inventoryItemId: order.finishedProductId,
              quantity: context.quantity,
              unit: order.unit,
              unitCost: 0,
              totalCost: 0,
              notes: `Transferred to ${reworkOrder.orderNumber}`,
            },
          ],
        },
      },
    });
    return {
      transactionId: transaction.id,
      evidence: {
        disposition: reworkType,
        operationExecutionId: context.execution.id,
        operationCode: context.execution.routingOperation.code,
        orderLotId: context.orderLot.id,
        recordedQuantity: context.recorded.toString(),
        disposedQuantity: context.quantity.toString(),
        reasonCode: context.reasonCode,
        linkedOrderId: reworkOrder.id,
        linkedOrderNumber: reworkOrder.orderNumber,
        linkedBomVersionId: bomVersion.id,
        linkedRoutingVersionId: routingVersion.id,
        quantityNormalization: {
          stockBaseUnitAuthoritative: true,
          output: normalizedOutput.evidence,
          bomOutput: normalizedBomOutput.evidence,
          components: normalizedComponents.map((entry, index) => ({
            sequence: index + 1,
            ...entry.evidence,
          })),
          calculatedMaterialRequirements: requirementQuantityEvidence,
        },
      },
    };
  }

  private async postProductionReceipt(
    tx: Prisma.TransactionClient,
    scope: { id: string; tenantId: string; companyId: string },
    user: AuthenticatedRequestUser,
    order: any,
    settings: any,
    dto: ManufacturingOrderActionDto,
    when: Date,
  ) {
    if (
      !settings.defaultWipWarehouseId ||
      !settings.defaultFinishedGoodsWarehouseId ||
      !settings.wipInventoryAccountId ||
      !settings.finishedGoodsInventoryAccountId
    ) {
      throw new BadRequestException(
        "WIP/FG-Q warehouses and WIP/finished-goods LEDGER mappings are required before production receipt.",
      );
    }
    if (order.receiptWarehouseId !== settings.defaultFinishedGoodsWarehouseId) {
      throw new BadRequestException(
        "The order receipt warehouse must match the configured FG-Q warehouse before production receipt.",
      );
    }
    const payload = jsonObject(dto.payload);
    const forbiddenCostFields = [
      "labourCost",
      "machineCost",
      "overheadCost",
      "subcontractCost",
      "otherCost",
    ].filter((field) => payload[field] !== undefined);
    if (forbiddenCostFields.length) {
      throw new BadRequestException(
        `POST_PRODUCTION_RECEIPT accepts posted material and packaging actuals only; ${forbiddenCostFields.join(", ")} require an auditable actual-cost posting workflow.`,
      );
    }
    if (!dto.lines?.length)
      throw new BadRequestException(
        "POST_PRODUCTION_RECEIPT requires explicit completed-lot receipt lines.",
      );
    const fullyReconciled = order.lots.every((lot: any) =>
      decimal(lot.completedQuantity)
        .add(lot.rejectedQuantity)
        .equals(lot.plannedQuantity),
    );
    if (
      !fullyReconciled ||
      !decimal(order.completedQuantity)
        .add(order.rejectedQuantity)
        .equals(order.plannedQuantity)
    ) {
      throw new BadRequestException(
        "Production receipt requires cumulative production completion to reconcile exactly to the planned order and lots.",
      );
    }
    await this.activeWarehouse(
      tx,
      scope.id,
      settings.defaultWipWarehouseId,
      "WIP warehouse",
      { companyId: scope.companyId, role: "WIP" },
    );
    await this.activeWarehouse(
      tx,
      scope.id,
      settings.defaultFinishedGoodsWarehouseId,
      "FG-Q warehouse",
      { companyId: scope.companyId, role: "FINISHED_GOODS" },
    );
    const wipLocation = await this.activeLocation(
      tx,
      scope.id,
      settings.defaultWipWarehouseId,
      settings.defaultWipLocationId,
      "WIP location",
      { companyId: scope.companyId, dispositions: ["WIP"] },
    );
    if (!wipLocation)
      throw new BadRequestException(
        "An active WIP-disposition location is required before production receipt.",
      );
    const fgAccount = await this.protectedInventoryControlLedger(
      tx,
      scope.companyId,
      settings.finishedGoodsInventoryAccountId,
      "Finished-goods inventory account",
    );
    const wipAccount = await this.activeLedger(
      tx,
      scope.companyId,
      settings.wipInventoryAccountId,
      "WIP inventory account",
      "ASSET",
    );
    if (fgAccount.id === wipAccount.id)
      throw new BadRequestException(
        "Finished-goods and WIP accounts must be different LEDGER accounts.",
      );
    const fiscalYear = await this.openFiscalYear(tx, scope.companyId, when);
    const serialTrackingRequired = Boolean(
      settings.requireSerialBeforeRelease ||
      order.finishedProduct.manufacturingProfile?.serialTracked,
    );
    const transactionIds: string[] = [];
    const stockMovementIds: string[] = [];
    const consumedByMaterial = new Map<string, Prisma.Decimal>();
    const seenLots = new Set<string>();

    for (let lineIndex = 0; lineIndex < dto.lines.length; lineIndex += 1) {
      const input = dto.lines[lineIndex];
      const lotKey = input.orderLotId ?? input.lotId ?? input.lotNumber;
      const orderLot = order.lots.find(
        (lot: any) => lot.id === lotKey || lot.lotNumber === lotKey,
      );
      if (!orderLot || seenLots.has(orderLot.id))
        throw new BadRequestException(
          "Every receipt line must reference one unique completed order lot.",
        );
      seenLots.add(orderLot.id);
      if (
        !decimal(orderLot.completedQuantity)
          .add(orderLot.rejectedQuantity)
          .equals(orderLot.plannedQuantity)
      )
        throw new BadRequestException(
          `Lot ${orderLot.lotNumber} is not fully completed.`,
        );
      const alreadyReceived = this.postedQuantity(order, "PRODUCTION_RECEIPT", {
        orderLotId: orderLot.id,
        outputOnly: true,
      });
      const remaining = decimal(orderLot.completedQuantity).sub(
        alreadyReceived,
      );
      if (remaining.lessThanOrEqualTo(0))
        throw new BadRequestException(
          `Lot ${orderLot.lotNumber} has already been fully received.`,
        );
      const quantity = quantityDecimal(
        input.quantity,
        `${orderLot.lotNumber} receipt quantity`,
      );
      if (!quantity.equals(remaining))
        throw new BadRequestException(
          `Receipt quantity for ${orderLot.lotNumber} must equal the exact remaining completed quantity ${remaining.toString()}; partial or over receipts are not permitted.`,
        );
      const outputLotNumber =
        text(input.payload?.outputLotNumber) ?? text(input.lotNumber);
      if (!outputLotNumber)
        throw new BadRequestException(
          `Receipt line ${lineIndex + 1} requires lotNumber or payload.outputLotNumber.`,
        );
      const destinationWarehouseId = input.destinationWarehouseId;
      if (
        !destinationWarehouseId ||
        destinationWarehouseId !== settings.defaultFinishedGoodsWarehouseId
      )
        throw new BadRequestException(
          "Every production receipt line must explicitly select the configured FG-Q warehouse.",
        );
      const destinationLocationId =
        input.destinationLocationId ??
        settings.defaultFinishedGoodsHoldLocationId ??
        order.receiptLocationId;
      const receiptLocation = await this.activeLocation(
        tx,
        scope.id,
        destinationWarehouseId,
        destinationLocationId,
        "FG-Q receipt location",
        { companyId: scope.companyId, dispositions: ["QC_HOLD"] },
      );
      if (!receiptLocation)
        throw new BadRequestException(
          "An active QC_HOLD-disposition FG-Q location is required before production receipt.",
        );
      const existingLot = await tx.manufacturingInventoryLot.findUnique({
        where: {
          workspaceId_inventoryItemId_lotNumber: {
            workspaceId: scope.id,
            inventoryItemId: order.finishedProductId,
            lotNumber: outputLotNumber,
          },
        },
      });
      if (existingLot)
        throw new ConflictException(
          `Finished-goods lot ${outputLotNumber} already exists; duplicate receipt is not allowed.`,
        );

      const latestInspection = this.latestLotInspection(order, orderLot.id);
      if (settings.requireQcBeforeRelease) {
        if (!latestInspection || latestInspection.status !== "PASSED")
          throw new BadRequestException(
            `Lot ${orderLot.lotNumber} requires a PASSED finished-goods QC result before receipt.`,
          );
        const hold = decimal(latestInspection.sampleQuantity)
          .sub(latestInspection.acceptedQuantity)
          .sub(latestInspection.rejectedQuantity);
        if (
          !decimal(latestInspection.acceptedQuantity).equals(
            orderLot.completedQuantity,
          ) ||
          !decimal(latestInspection.rejectedQuantity).equals(0) ||
          !hold.equals(0)
        ) {
          throw new BadRequestException(
            `Lot ${orderLot.lotNumber} QC quantities must accept the exact completed quantity with no rejection or hold before receipt.`,
          );
        }
      }

      const serialNumbers = stringArray(
        input.serialNumbers ?? input.payload?.serialNumbers,
        `${orderLot.lotNumber} serialNumbers`,
      );
      if (
        serialNumbers.some((serial) => !serial.trim()) ||
        new Set(serialNumbers).size !== serialNumbers.length
      )
        throw new BadRequestException(
          `Serial numbers for ${orderLot.lotNumber} must be non-empty and unique.`,
        );
      if (
        (serialTrackingRequired || serialNumbers.length > 0) &&
        (!quantity.isInteger() ||
          BigInt(serialNumbers.length) !== BigInt(quantity.toFixed(0)))
      ) {
        throw new BadRequestException(
          `Serial count for ${orderLot.lotNumber} must equal the whole-number receipt quantity.`,
        );
      }
      if (serialTrackingRequired && !serialNumbers.length)
        throw new BadRequestException(
          `Serial numbers are required for ${orderLot.lotNumber}.`,
        );
      const allocatedSerials = serialNumbers.length
        ? await tx.manufacturingSerial.findMany({
            where: {
              workspaceId: scope.id,
              serialNumber: { in: serialNumbers },
            },
          })
        : [];
      const allocatedSerialByNumber = new Map(
        allocatedSerials.map((serial) => [serial.serialNumber, serial]),
      );
      for (const serial of allocatedSerials) {
        const belongsToReceipt =
          serial.orderId === order.id &&
          serial.inventoryItemId === order.finishedProductId &&
          (!serial.orderLotId || serial.orderLotId === orderLot.id);
        if (
          !belongsToReceipt ||
          serial.inventoryLotId ||
          serial.status !== "CREATED"
        ) {
          throw new ConflictException(
            `Serial ${serial.serialNumber} already exists and is not an unused allocation for ${orderLot.lotNumber}.`,
          );
        }
      }

      const inputLines = order.materials.flatMap((material: any) => {
        const issueType =
          this.materialRole(material) === "PACKAGING_MATERIAL"
            ? "PACKAGING_ISSUE"
            : "MATERIAL_ISSUE";
        const returnType =
          this.materialRole(material) === "PACKAGING_MATERIAL"
            ? "PACKAGING_RETURN"
            : "MATERIAL_RETURN";
        const flows = (order.transactions ?? [])
          .filter(
            (transaction: any) =>
              transaction.status === "POSTED" &&
              transaction.orderLotId === orderLot.id &&
              [issueType, returnType].includes(transaction.transactionType),
          )
          .flatMap((transaction: any) =>
            (transaction.lines ?? [])
              .filter(
                (line: any) =>
                  line.orderMaterialId === material.id ||
                  line.inventoryItemId === material.inventoryItemId,
              )
              .map((line: any) => ({
                materialId: material.id,
                inventoryLotId:
                  transaction.transactionType === issueType
                    ? line.sourceInventoryLotId
                    : line.destinationInventoryLotId,
                direction:
                  transaction.transactionType === issueType
                    ? ("ISSUE" as const)
                    : ("RETURN" as const),
                quantity: line.quantity,
              })),
          );
        const netLots = calculateNetMaterialLotConsumption(flows);
        const netIssued = netLots.reduce(
          (total, row) => total.add(row.quantity),
          decimal(0),
        );
        if (netIssued.lessThanOrEqualTo(0))
          throw new BadRequestException(
            `No net posted ${this.materialRole(material) === "PACKAGING_MATERIAL" ? "packaging" : "raw-material"} issue exists for ${material.inventoryItem.itemName} in ${orderLot.lotNumber}.`,
          );
        return netLots.map((row) => ({
          material,
          quantity: row.quantity,
          sourceInventoryLotId: row.inventoryLotId,
        }));
      });
      const receiptNumber = await issueManufacturingDocumentNumberTx(
        tx,
        scope,
        user.id,
        {
          documentKind: "FINISHED_GOODS_RECEIPT",
          issuedAt: when,
          idempotencyKey: `MFG:${dto.idempotencyKey}:FGR:${orderLot.id}`,
        },
      );
      const transaction = await tx.manufacturingTransaction.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          fiscalYearId: fiscalYear.id,
          transactionNumber: receiptNumber.documentNumber,
          transactionType: "PRODUCTION_RECEIPT",
          status: "POSTED",
          transactionDate: when,
          orderId: order.id,
          orderLotId: orderLot.id,
          fromWarehouseId: settings.defaultWipWarehouseId,
          toWarehouseId: destinationWarehouseId,
          fromLocationId: settings.defaultWipLocationId ?? null,
          toLocationId: destinationLocationId ?? null,
          idempotencyKey: `MFG:${dto.idempotencyKey}:PRODUCTION_RECEIPT:${orderLot.id}`,
          notes: text(dto.note),
          createdByUserId: user.id,
          postedByUserId: user.id,
          postedAt: when,
          lines: {
            create: [
              ...inputLines.map(
                ({
                  material,
                  quantity: inputQuantity,
                  sourceInventoryLotId,
                }: any) => ({
                  inventoryItemId: material.inventoryItemId,
                  orderMaterialId: material.id,
                  sourceInventoryLotId,
                  quantity: inputQuantity,
                  unit: material.unit,
                  notes: `Actual WIP consumption for ${orderLot.lotNumber}`,
                }),
              ),
              {
                inventoryItemId: order.finishedProductId,
                quantity,
                unit: input.unit ?? order.unit,
                notes: `Finished-goods receipt for ${orderLot.lotNumber}`,
              },
            ],
          },
        },
        include: { lines: true },
      });
      const receiptInputLines = transaction.lines.filter(
        (entry: any) => entry.orderMaterialId,
      );
      const outputLine = transaction.lines.find(
        (entry: any) =>
          !entry.orderMaterialId &&
          entry.inventoryItemId === order.finishedProductId,
      );
      if (!outputLine)
        throw new BadRequestException(
          "Production receipt output line was not created.",
        );
      for (const transactionLine of receiptInputLines) {
        const movement = await tx.stockMovement.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            warehouseId: settings.defaultWipWarehouseId,
            inventoryItemId: transactionLine.inventoryItemId,
            transactionType: "PRODUCTION_RECEIPT_INPUT",
            transactionId: transaction.id,
            transactionLineId: transactionLine.id,
            referenceNo: order.orderNumber,
            movementType: "OUT",
            quantity: transactionLine.quantity,
            unit: transactionLine.unit,
            transactionDate: when,
            postedByUserId: user.id,
            idempotencyKey: `MFG:${dto.idempotencyKey}:${orderLot.id}:${transactionLine.id}:WIP-OUT`,
            manufacturingTransactionLineId: transactionLine.id,
          },
        });
        stockMovementIds.push(movement.id);
      }
      const inputCosting = await rebuildMovingAverageCosts(
        tx,
        scope.id,
        receiptInputLines.map((entry: any) => entry.inventoryItemId),
      );
      let aggregateCost = decimal(0);
      for (const transactionLine of receiptInputLines) {
        const exactMovement = inputCosting.movements.find(
          (entry) =>
            entry.transactionId === transaction.id &&
            entry.transactionLineId === transactionLine.id &&
            entry.movementType === "OUT",
        );
        if (!exactMovement)
          throw new BadRequestException(
            "Unable to derive exact WIP consumption cost.",
          );
        const exactCost = decimal(exactMovement.movementValue);
        aggregateCost = aggregateCost.add(exactCost);
        await tx.manufacturingTransactionLine.update({
          where: { id: transactionLine.id },
          data: { unitCost: exactMovement.unitCost, totalCost: exactCost },
        });
        if (transactionLine.orderMaterialId)
          consumedByMaterial.set(
            transactionLine.orderMaterialId,
            (
              consumedByMaterial.get(transactionLine.orderMaterialId) ??
              decimal(0)
            ).add(transactionLine.quantity),
          );
      }
      await this.requireInventoryService().reconcileMovingAverageLedger(
        tx,
        scope.id,
        inputCosting.movements,
        user.id,
      );
      aggregateCost = aggregateCost.toDecimalPlaces(
        6,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      const lotScrapRecovery = (order.transactions ?? [])
        .filter(
          (entry: any) =>
            entry.status === "POSTED" &&
            entry.transactionType === "SCRAP_RECEIPT" &&
            entry.orderLotId === orderLot.id,
        )
        .flatMap((entry: any) => entry.lines ?? [])
        .reduce(
          (total: Prisma.Decimal, entry: any) => total.add(entry.totalCost),
          decimal(0),
        );
      aggregateCost = aggregateCost
        .sub(lotScrapRecovery)
        .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
      if (aggregateCost.lessThan(0))
        throw new BadRequestException(
          "Recoverable scrap value cannot exceed this lot's actual WIP input cost.",
        );
      const unitCost = aggregateCost
        .div(quantity)
        .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
      const inventoryLot = await tx.manufacturingInventoryLot.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          inventoryItemId: order.finishedProductId,
          warehouseId: destinationWarehouseId,
          locationId: destinationLocationId ?? null,
          lotNumber: outputLotNumber,
          receivedQuantity: quantity,
          availableQuantity: 0,
          holdQuantity: quantity,
          unit: input.unit ?? order.unit,
          unitCost,
          manufacturedAt: when,
          sourceTransactionLineId: outputLine.id,
          createdByUserId: user.id,
        },
      });
      await tx.manufacturingTransactionLine.update({
        where: { id: outputLine.id },
        data: {
          destinationInventoryLotId: inventoryLot.id,
          unitCost,
          totalCost: aggregateCost,
        },
      });
      const fgMovement = await tx.stockMovement.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          warehouseId: destinationWarehouseId,
          inventoryItemId: order.finishedProductId,
          transactionType: "PRODUCTION_RECEIPT",
          transactionId: transaction.id,
          transactionLineId: outputLine.id,
          referenceNo: order.orderNumber,
          movementType: "IN",
          quantity,
          unit: input.unit ?? order.unit,
          inputUnitCost: unitCost,
          transactionDate: when,
          postedByUserId: user.id,
          idempotencyKey: `MFG:${dto.idempotencyKey}:${orderLot.id}:${outputLine.id}:FGQ-IN`,
          manufacturingTransactionLineId: outputLine.id,
        },
      });
      stockMovementIds.push(fgMovement.id);
      const fgCosting = await rebuildMovingAverageCosts(tx, scope.id, [
        order.finishedProductId,
      ]);
      const costedFg = fgCosting.movements.find(
        (entry) => entry.id === fgMovement.id,
      );
      if (
        !costedFg ||
        toPaisa(costedFg.movementValue) !== toPaisa(aggregateCost)
      )
        throw new BadRequestException(
          "FG-Q receipt value does not reconcile to exact WIP consumption cost.",
        );
      await this.requireInventoryService().reconcileMovingAverageLedger(
        tx,
        scope.id,
        fgCosting.movements,
        user.id,
      );
      const journalAmount = roundMoneyDecimal(aggregateCost);
      const voucher = await tx.voucherEntry.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          createdByUserId: user.id,
          voucherType: "JOURNAL",
          documentKind: "PRODUCTION_RECEIPT",
          voucherNumber: compactReference(
            "JV-FGR",
            `${dto.idempotencyKey}:${orderLot.id}`,
          ),
          voucherDate: when,
          partyName: "Manufacturing",
          reference: order.orderNumber,
          narration: `Production receipt ${orderLot.lotNumber} for ${order.orderNumber}`,
          status: "POSTED",
          totalAmount: journalAmount,
          debit: journalAmount,
          credit: journalAmount,
          currency: settings.currency,
          fiscalYearId: fiscalYear.id,
          sourceType: "MANUFACTURING_PRODUCTION_RECEIPT",
          sourceId: transaction.id,
          approvedByUserId: user.id,
          approvedAt: when,
          postedAt: when,
          idempotencyKey: `MFG:${dto.idempotencyKey}:PRODUCTION_RECEIPT:${orderLot.id}:GL`,
          lines: {
            create: [
              {
                accountId: fgAccount.id,
                ledger: fgAccount.name,
                description: `FG receipt ${orderLot.lotNumber}`,
                debit: journalAmount,
                credit: 0,
              },
              {
                accountId: wipAccount.id,
                ledger: wipAccount.name,
                description: `WIP consumed ${orderLot.lotNumber}`,
                debit: 0,
                credit: journalAmount,
              },
            ],
          },
        },
      });
      await tx.manufacturingTransaction.update({
        where: { id: transaction.id },
        data: { voucherEntryId: voucher.id },
      });
      for (const transactionLine of receiptInputLines)
        await tx.manufacturingGenealogy.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            orderId: order.id,
            orderLotId: orderLot.id,
            transactionLineId: transactionLine.id,
            parentInventoryLotId: transactionLine.sourceInventoryLotId,
            childInventoryLotId: inventoryLot.id,
            relationshipType: "CONSUMED_INTO_OUTPUT",
            quantity: transactionLine.quantity,
            unit: transactionLine.unit,
            createdByUserId: user.id,
          },
        });
      for (const serialNumber of serialNumbers) {
        const allocatedSerial = allocatedSerialByNumber.get(serialNumber);
        const serial = allocatedSerial
          ? await tx.manufacturingSerial.update({
              where: { id: allocatedSerial.id },
              data: {
                orderLotId: orderLot.id,
                inventoryLotId: inventoryLot.id,
                warehouseId: destinationWarehouseId,
                locationId: destinationLocationId ?? null,
                status: "QC_HOLD",
                manufacturedAt: when,
              },
            })
          : await tx.manufacturingSerial.create({
              data: {
                tenantId: scope.tenantId,
                companyId: scope.companyId,
                workspaceId: scope.id,
                serialNumber,
                inventoryItemId: order.finishedProductId,
                orderId: order.id,
                orderLotId: orderLot.id,
                inventoryLotId: inventoryLot.id,
                warehouseId: destinationWarehouseId,
                locationId: destinationLocationId ?? null,
                status: "QC_HOLD",
                manufacturedAt: when,
                createdByUserId: user.id,
              },
            });
        await tx.manufacturingSerialMovement.create({
          data: {
            transactionLineId: outputLine.id,
            serialId: serial.id,
            role: "OUTPUT",
          },
        });
      }
      transactionIds.push(transaction.id);
    }

    for (const [materialId, consumedQuantity] of consumedByMaterial) {
      const material = await tx.manufacturingOrderMaterial.findUnique({
        where: { id: materialId },
      });
      if (!material)
        throw new BadRequestException("Receipt material no longer exists.");
      const newConsumed = decimal(material.consumedQuantity).add(
        consumedQuantity,
      );
      if (
        newConsumed
          .add(material.returnedQuantity)
          .add(material.scrappedQuantity)
          .greaterThan(material.issuedQuantity)
      )
        throw new BadRequestException(
          "Receipt consumption exceeds the posted net material issue.",
        );
      const reconciled = newConsumed
        .add(material.returnedQuantity)
        .add(material.scrappedQuantity)
        .equals(material.issuedQuantity);
      await tx.manufacturingOrderMaterial.update({
        where: { id: materialId },
        data: {
          consumedQuantity: { increment: consumedQuantity },
          status: reconciled ? "CONSUMED" : material.status,
        },
      });
    }

    const allReceiptTransactions = await tx.manufacturingTransaction.findMany({
      where: {
        orderId: order.id,
        transactionType: "PRODUCTION_RECEIPT",
        status: "POSTED",
      },
      include: { lines: true },
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    });
    const allScrapTransactions = await tx.manufacturingTransaction.findMany({
      where: {
        orderId: order.id,
        transactionType: "SCRAP_RECEIPT",
        status: "POSTED",
      },
      include: { lines: true },
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    });
    const actualInputLines = allReceiptTransactions
      .flatMap((transaction) => transaction.lines)
      .filter((line) => line.orderMaterialId);
    const materialById = new Map(
      order.materials.map((material: any) => [material.id, material]),
    );
    const materialCost = actualInputLines
      .filter(
        (line) =>
          this.materialRole(materialById.get(line.orderMaterialId!)) !==
          "PACKAGING_MATERIAL",
      )
      .reduce((total, line) => total.add(line.totalCost), decimal(0));
    const packagingCost = actualInputLines
      .filter(
        (line) =>
          this.materialRole(materialById.get(line.orderMaterialId!)) ===
          "PACKAGING_MATERIAL",
      )
      .reduce((total, line) => total.add(line.totalCost), decimal(0));
    const scrapRecoveryLines = allScrapTransactions.flatMap(
      (transaction) => transaction.lines,
    );
    const scrapRecovery = scrapRecoveryLines.reduce(
      (total, line) => total.add(line.totalCost),
      decimal(0),
    );
    const totalCost = materialCost
      .add(packagingCost)
      .sub(scrapRecovery)
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    if (totalCost.isNegative())
      throw new BadRequestException(
        "Recoverable scrap value cannot exceed posted manufacturing input cost.",
      );
    const completedQuantity = allReceiptTransactions
      .flatMap((transaction) => transaction.lines)
      .filter(
        (line) =>
          !line.orderMaterialId &&
          line.inventoryItemId === order.finishedProductId,
      )
      .reduce((total, line) => total.add(line.quantity), decimal(0));
    const versionNumber = (order.costSnapshots.at(-1)?.versionNumber ?? 0) + 1;
    await tx.manufacturingCostSnapshot.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        orderId: order.id,
        versionNumber,
        status: "PROVISIONAL",
        currency: settings.currency,
        materialCost,
        packagingCost,
        scrapRecovery,
        totalCost,
        completedQuantity,
        unitCost: completedQuantity.greaterThan(0)
          ? totalCost
              .div(completedQuantity)
              .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP)
          : 0,
        voucherEntryId: allReceiptTransactions.at(-1)?.voucherEntryId ?? null,
        createdByUserId: user.id,
        lines: {
          create: [
            ...actualInputLines.map((line) => {
              const material: any = materialById.get(line.orderMaterialId!);
              return {
                costType:
                  this.materialRole(material) === "PACKAGING_MATERIAL"
                    ? ("PACKAGING" as const)
                    : ("MATERIAL" as const),
                description: `${material.inventoryItem.itemName} actual WIP consumption`,
                inventoryItemId: line.inventoryItemId,
                transactionLineId: line.id,
                quantity: line.quantity,
                rate: line.unitCost,
                amount: line.totalCost,
                metadata: {
                  source: "POSTED_MWA",
                  provisionalReason:
                    "Labour, machine, overhead, subcontract and other actuals are not posted by production receipt.",
                },
              };
            }),
            ...scrapRecoveryLines.map((line) => ({
              costType: "SCRAP_RECOVERY" as const,
              description: "Recoverable scrap credit",
              inventoryItemId: line.inventoryItemId,
              transactionLineId: line.id,
              quantity: line.quantity,
              rate: line.unitCost,
              amount: decimal(line.totalCost).negated(),
              metadata: { source: "POSTED_SCRAP_RECEIPT" },
            })),
          ],
        },
      },
    });
    return { transactionIds, stockMovementIds };
  }

  private async postQaRelease(
    tx: Prisma.TransactionClient,
    scope: { id: string; tenantId: string; companyId: string },
    user: AuthenticatedRequestUser,
    order: any,
    settings: any,
    dto: ManufacturingOrderActionDto,
    when: Date,
  ) {
    if (
      !settings.defaultFinishedGoodsWarehouseId ||
      !settings.defaultFinishedGoodsReleasedWarehouseId ||
      !settings.finishedGoodsInventoryAccountId
    ) {
      throw new BadRequestException(
        "FG-Q/FG-R warehouses and the finished-goods inventory LEDGER mapping are required before QA release.",
      );
    }
    if (!dto.lines?.length)
      throw new BadRequestException(
        "QA_RELEASE requires explicit full-lot release lines.",
      );
    await this.activeWarehouse(
      tx,
      scope.id,
      settings.defaultFinishedGoodsWarehouseId,
      "FG-Q warehouse",
      { companyId: scope.companyId, role: "FINISHED_GOODS" },
    );
    await this.activeWarehouse(
      tx,
      scope.id,
      settings.defaultFinishedGoodsReleasedWarehouseId,
      "FG-R warehouse",
      { companyId: scope.companyId, role: "FINISHED_GOODS" },
    );
    await this.protectedInventoryControlLedger(
      tx,
      scope.companyId,
      settings.finishedGoodsInventoryAccountId,
      "Finished-goods inventory account",
    );
    const fiscalYear = await this.openFiscalYear(tx, scope.companyId, when);
    const serialTrackingRequired = Boolean(
      settings.requireSerialBeforeRelease ||
      order.finishedProduct.manufacturingProfile?.serialTracked,
    );
    const transactionIds: string[] = [];
    const stockMovementIds: string[] = [];
    const seenInventoryLots = new Set<string>();
    let packagingReleasePolicy: ManufacturingPackagingReleasePolicyDecision | null =
      null;

    for (let lineIndex = 0; lineIndex < dto.lines.length; lineIndex += 1) {
      const input = dto.lines[lineIndex];
      if (!input.inventoryLotId)
        throw new BadRequestException(
          `QA release line ${lineIndex + 1} requires inventoryLotId.`,
        );
      if (seenInventoryLots.has(input.inventoryLotId))
        throw new BadRequestException(
          "Every QA release line must reference one unique finished-goods lot.",
        );
      seenInventoryLots.add(input.inventoryLotId);
      const inventoryLot = await tx.manufacturingInventoryLot.findFirst({
        where: {
          id: input.inventoryLotId,
          workspaceId: scope.id,
          inventoryItemId: order.finishedProductId,
        },
        include: {
          sourceTransactionLine: { include: { transaction: true } },
          serials: { orderBy: { serialNumber: "asc" } },
        },
      });
      const sourceTransaction =
        inventoryLot?.sourceTransactionLine?.transaction;
      if (
        !inventoryLot ||
        !sourceTransaction ||
        sourceTransaction.orderId !== order.id ||
        sourceTransaction.transactionType !== "PRODUCTION_RECEIPT" ||
        sourceTransaction.status !== "POSTED" ||
        !sourceTransaction.orderLotId
      ) {
        throw new BadRequestException(
          "inventoryLotId must reference a posted FG-Q production receipt for this order.",
        );
      }
      if (
        inventoryLot.warehouseId !== settings.defaultFinishedGoodsWarehouseId
      ) {
        throw new BadRequestException(
          `Finished-goods lot ${inventoryLot.lotNumber} is not in the configured FG-Q warehouse.`,
        );
      }
      const sourceLocation = await this.activeLocation(
        tx,
        scope.id,
        settings.defaultFinishedGoodsWarehouseId,
        inventoryLot.locationId,
        "FG-Q source location",
        { companyId: scope.companyId, dispositions: ["QC_HOLD"] },
      );
      if (!sourceLocation)
        throw new BadRequestException(
          `Finished-goods lot ${inventoryLot.lotNumber} requires an active QC_HOLD-disposition FG-Q location.`,
        );
      const priorRelease = (order.transactions ?? []).some(
        (transaction: any) =>
          transaction.status === "POSTED" &&
          transaction.transactionType === "QA_RELEASE" &&
          transaction.lines.some(
            (line: any) =>
              line.sourceInventoryLotId === inventoryLot.id ||
              line.destinationInventoryLotId === inventoryLot.id,
          ),
      );
      if (priorRelease)
        throw new ConflictException(
          `Finished-goods lot ${inventoryLot.lotNumber} has already been released.`,
        );
      const orderLot = order.lots.find(
        (lot: any) => lot.id === sourceTransaction.orderLotId,
      );
      if (!orderLot)
        throw new BadRequestException(
          "The source production receipt is missing its order-lot link.",
        );
      const quantity = quantityDecimal(
        input.quantity,
        `${inventoryLot.lotNumber} release quantity`,
      );
      if (
        !quantity.equals(inventoryLot.receivedQuantity) ||
        !decimal(inventoryLot.holdQuantity).equals(
          inventoryLot.receivedQuantity,
        ) ||
        !decimal(inventoryLot.availableQuantity).equals(0)
      ) {
        throw new BadRequestException(
          `Lot ${inventoryLot.lotNumber} must be released in full from its unreleased FG-Q balance; partial release is unsafe with the current one-warehouse-per-lot model.`,
        );
      }
      const destinationWarehouseId = input.destinationWarehouseId;
      if (
        !destinationWarehouseId ||
        destinationWarehouseId !==
          settings.defaultFinishedGoodsReleasedWarehouseId
      ) {
        throw new BadRequestException(
          "Every QA release line must explicitly select the configured FG-R warehouse.",
        );
      }
      const destinationLocationId =
        input.destinationLocationId ??
        settings.defaultFinishedGoodsReleaseLocationId;
      const releaseLocation = await this.activeLocation(
        tx,
        scope.id,
        destinationWarehouseId,
        destinationLocationId,
        "FG-R release location",
        { companyId: scope.companyId, dispositions: ["RELEASED"] },
      );
      if (!releaseLocation)
        throw new BadRequestException(
          "An active RELEASED-disposition FG-R location is required before QA release.",
        );
      if (settings.defaultFinishedGoodsWarehouseId === destinationWarehouseId) {
        if (
          !inventoryLot.locationId ||
          !destinationLocationId ||
          inventoryLot.locationId === destinationLocationId
        ) {
          throw new BadRequestException(
            "When FG-Q and FG-R use the same physical warehouse, distinct configured FG-Q and FG-R locations are required for an auditable release.",
          );
        }
      }

      const latestInspection = this.latestLotInspection(order, orderLot.id);
      const qualityMode =
        settings.mode === "PHARMACEUTICAL" || settings.mode === "HYBRID"
          ? settings.mode
          : "GENERAL";
      const qualityReleaseRequired = Boolean(
        settings.requireQcBeforeRelease || qualityMode !== "GENERAL",
      );
      const presentedQuantity = qualityReleaseRequired
        ? decimal(latestInspection?.sampleQuantity)
        : quantity;
      const passedQuantity = qualityReleaseRequired
        ? decimal(latestInspection?.acceptedQuantity)
        : quantity;
      const failedQuantity = qualityReleaseRequired
        ? decimal(latestInspection?.rejectedQuantity)
        : decimal(0);
      const holdQuantity = qualityReleaseRequired
        ? presentedQuantity.sub(passedQuantity).sub(failedQuantity)
        : decimal(0);
      if (
        qualityReleaseRequired &&
        (!latestInspection || latestInspection.status !== "PASSED")
      ) {
        throw new BadRequestException(
          `Lot ${orderLot.lotNumber} requires the latest finished-goods inspection to be PASSED.`,
        );
      }
      if (
        qualityMode !== "GENERAL" &&
        latestInspection &&
        !satisfiesPassedQualityInspectionIndependence({
          mode: qualityMode,
          status: latestInspection.status,
          inspectedByUserId: latestInspection.inspectedByUserId,
          approvedByUserId: latestInspection.approvedByUserId,
        })
      ) {
        throw new BadRequestException(
          `Lot ${orderLot.lotNumber} requires a latest PASSED QC inspection independently approved by a different authorized user.`,
        );
      }
      if (!packagingReleasePolicy) {
        packagingReleasePolicy = await this.packagingReleasePolicy(
          tx,
          scope,
          order,
          when,
        );
        if (!packagingReleasePolicy.ready) {
          throw new BadRequestException(
            packagingReleasePolicy.issues.join(" "),
          );
        }
      }
      const packaging = this.lotPackagingActuals(
        order,
        orderLot.id,
        packagingReleasePolicy.required,
      );
      const requestedSerials = stringArray(
        input.serialNumbers ?? input.payload?.serialNumbers,
        "serialNumbers",
      );
      const persistedSerials = inventoryLot.serials.map(
        (serial: any) => serial.serialNumber,
      );
      if (serialTrackingRequired) {
        if (
          requestedSerials.length !== persistedSerials.length ||
          requestedSerials.some((serial) => !persistedSerials.includes(serial))
        ) {
          throw new BadRequestException(
            `QA release serialNumbers must exactly match every persisted QC-held serial for ${inventoryLot.lotNumber}.`,
          );
        }
        if (
          inventoryLot.serials.some(
            (serial: any) => serial.status !== "QC_HOLD",
          )
        )
          throw new BadRequestException(
            "Every serialized unit must be on QC hold before release.",
          );
      } else if (requestedSerials.length) {
        throw new BadRequestException(
          "serialNumbers are not allowed because the finished product is not serial tracked.",
        );
      }
      if (serialTrackingRequired) {
        const serialQuality = await tx.manufacturingSerial.findMany({
          where: {
            id: { in: inventoryLot.serials.map((serial: any) => serial.id) },
          },
          select: {
            serialNumber: true,
            qualityInspections: {
              where: { orderId: order.id, orderLotId: orderLot.id },
              orderBy: [{ inspectedAt: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: {
                status: true,
                inspectedByUserId: true,
                approvedByUserId: true,
              },
            },
          },
        });
        const missingPassedQc = serialQuality.find(
          (serial) => serial.qualityInspections[0]?.status !== "PASSED",
        );
        if (missingPassedQc) {
          throw new BadRequestException(
            `Serial ${missingPassedQc.serialNumber} requires a latest PASSED serial-wise QC inspection before QA release.`,
          );
        }
        if (qualityMode !== "GENERAL") {
          const missingIndependentQc = serialQuality.find((serial) => {
            const inspection = serial.qualityInspections[0];
            return (
              !inspection ||
              !satisfiesPassedQualityInspectionIndependence({
                mode: qualityMode,
                status: inspection.status,
                inspectedByUserId: inspection.inspectedByUserId,
                approvedByUserId: inspection.approvedByUserId,
              })
            );
          });
          if (missingIndependentQc) {
            throw new BadRequestException(
              `Serial ${missingIndependentQc.serialNumber} requires a latest PASSED QC inspection independently approved by a different authorized user.`,
            );
          }
        }
      }
      const releaseEvaluation = evaluateQualityRelease({
        presentedQuantity,
        passedQuantity,
        failedQuantity,
        onHoldQuantity: holdQuantity,
        releaseQuantity: quantity,
        serialTrackingRequired,
        serialNumbers: requestedSerials,
        packagingReady: packaging.ready,
        requireFullRelease: true,
        requireAllPresentedPassed: true,
      });
      if (!releaseEvaluation.ready)
        throw new BadRequestException(
          releaseEvaluation.issues.map((issue) => issue.message).join(" "),
        );

      const releaseNumber = await issueManufacturingDocumentNumberTx(
        tx,
        scope,
        user.id,
        {
          documentKind: "QA_RELEASE",
          issuedAt: when,
          idempotencyKey: `MFG:${dto.idempotencyKey}:QAR:${inventoryLot.id}`,
        },
      );
      const transaction = await tx.manufacturingTransaction.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          fiscalYearId: fiscalYear.id,
          transactionNumber: releaseNumber.documentNumber,
          transactionType: "QA_RELEASE",
          status: "POSTED",
          transactionDate: when,
          orderId: order.id,
          orderLotId: orderLot.id,
          fromWarehouseId: settings.defaultFinishedGoodsWarehouseId,
          toWarehouseId: destinationWarehouseId,
          fromLocationId: inventoryLot.locationId,
          toLocationId: destinationLocationId ?? null,
          idempotencyKey: `MFG:${dto.idempotencyKey}:QA_RELEASE:${inventoryLot.id}`,
          notes: text(dto.note),
          createdByUserId: user.id,
          postedByUserId: user.id,
          postedAt: when,
          lines: {
            create: [
              {
                inventoryItemId: order.finishedProductId,
                sourceInventoryLotId: inventoryLot.id,
                destinationInventoryLotId: inventoryLot.id,
                quantity,
                unit: inventoryLot.unit,
                unitCost: inventoryLot.unitCost,
                totalCost: decimal(inventoryLot.unitCost)
                  .mul(quantity)
                  .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP),
                notes: `Full-lot FG-Q to FG-R release for ${inventoryLot.lotNumber}`,
              },
            ],
          },
        },
        include: { lines: true },
      });
      const transactionLine = transaction.lines[0];
      const common = {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        inventoryItemId: order.finishedProductId,
        transactionId: transaction.id,
        transactionLineId: transactionLine.id,
        referenceNo: order.orderNumber,
        quantity,
        unit: inventoryLot.unit,
        transactionDate: when,
        postedByUserId: user.id,
        manufacturingTransactionLineId: transactionLine.id,
      };
      const out = await tx.stockMovement.create({
        data: {
          ...common,
          warehouseId: settings.defaultFinishedGoodsWarehouseId,
          transactionType: "STOCK_TRANSFER_OUT",
          movementType: "OUT",
          idempotencyKey: `MFG:${dto.idempotencyKey}:${inventoryLot.id}:FGQ-OUT`,
        },
      });
      const incoming = await tx.stockMovement.create({
        data: {
          ...common,
          warehouseId: destinationWarehouseId,
          transactionType: "STOCK_TRANSFER_IN",
          movementType: "IN",
          idempotencyKey: `MFG:${dto.idempotencyKey}:${inventoryLot.id}:FGR-IN`,
        },
      });
      const costed = await rebuildMovingAverageCosts(tx, scope.id, [
        order.finishedProductId,
      ]);
      const costedOut = costed.movements.find(
        (movement) => movement.id === out.id,
      );
      const costedIn = costed.movements.find(
        (movement) => movement.id === incoming.id,
      );
      if (
        !costedOut ||
        !costedIn ||
        toPaisa(costedOut.movementValue) !== toPaisa(costedIn.movementValue)
      ) {
        throw new BadRequestException(
          "FG-Q to FG-R transfer value did not reconcile at the exact carried MWA cost.",
        );
      }
      await this.requireInventoryService().reconcileMovingAverageLedger(
        tx,
        scope.id,
        costed.movements,
        user.id,
      );
      await tx.manufacturingTransactionLine.update({
        where: { id: transactionLine.id },
        data: {
          unitCost: costedOut.unitCost,
          totalCost: decimal(costedOut.movementValue).toDecimalPlaces(
            6,
            Prisma.Decimal.ROUND_HALF_UP,
          ),
        },
      });
      await tx.manufacturingInventoryLot.update({
        where: { id: inventoryLot.id },
        data: {
          warehouseId: destinationWarehouseId,
          locationId: destinationLocationId ?? null,
          availableQuantity: inventoryLot.receivedQuantity,
          holdQuantity: 0,
        },
      });
      if (serialTrackingRequired) {
        for (const serial of inventoryLot.serials) {
          await tx.manufacturingSerial.update({
            where: { id: serial.id },
            data: {
              warehouseId: destinationWarehouseId,
              locationId: destinationLocationId ?? null,
              status: "RELEASED",
              releasedAt: when,
            },
          });
          await tx.manufacturingSerialMovement.create({
            data: {
              transactionLineId: transactionLine.id,
              serialId: serial.id,
              role: "OUTPUT",
            },
          });
        }
      }
      await tx.manufacturingOrderLot.update({
        where: { id: orderLot.id },
        data: { status: "COMPLETED" },
      });
      transactionIds.push(transaction.id);
      stockMovementIds.push(out.id, incoming.id);
    }

    const releasedBefore = this.postedQuantity(order, "QA_RELEASE", {
      inventoryItemId: order.finishedProductId,
    });
    const releasedNow = dto.lines.reduce(
      (total, line) =>
        total.add(quantityDecimal(line.quantity, "QA release quantity")),
      decimal(0),
    );
    const receiptTotal = this.postedQuantity(order, "PRODUCTION_RECEIPT", {
      outputOnly: true,
    });
    // Aggregate posted quantities are authoritative here. Every requested line
    // was already tied to one posted source receipt and validated as a full-lot
    // release, so there is no unsafe partial-lot inference in this result.
    const allReleased =
      releasedBefore.add(releasedNow).equals(receiptTotal) &&
      receiptTotal.equals(order.completedQuantity);
    return {
      transactionIds,
      stockMovementIds,
      allReleased,
      packagingReleasePolicy,
    };
  }

  private async assertNoOpenQualityCasesAtClose(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    order: { id: string; finishedProductId: string },
  ) {
    // QA release validates the same gate, but a deviation/OOS/CAPA can be
    // opened afterwards. Close must therefore re-read the current controlled
    // records inside its own serializable transaction instead of trusting the
    // earlier release evidence.
    const qualityCases = await tx.manufacturingControlRecord.findMany({
      where: {
        workspaceId,
        kind: "QUALITY_CASE",
        status: { notIn: ["CANCELLED", "RETIRED"] },
      },
      select: {
        code: true,
        name: true,
        status: true,
        inventoryItemId: true,
        payload: true,
      },
    });
    const openCases = qualityCases.filter((record) =>
      isOpenQualityCaseLinkedToOrder(record, order),
    );
    if (openCases.length) {
      throw new BadRequestException(
        `CLOSE is blocked by open quality case(s): ${openCases
          .map((record) => `${record.code} (${record.name})`)
          .join(
            ", ",
          )}. Close or resolve the linked OOS/deviation/CAPA record first.`,
      );
    }
  }

  private async assertActualCostPostingsReadyForClose(
    tx: Prisma.TransactionClient,
    scope: { id: string; companyId: string },
    orderId: string,
  ) {
    const postings = await tx.manufacturingActualCostPosting.findMany({
      where: { workspaceId: scope.id, orderId },
      include: {
        voucherEntry: {
          include: {
            lines: true,
            reversedBy: { include: { lines: true } },
          },
        },
      },
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    });

    const assertBalancedVoucher = (
      voucher: Prisma.VoucherEntryGetPayload<{ include: { lines: true } }>,
      label: string,
      expectedAmount: Prisma.Decimal.Value,
    ) => {
      const debit = voucher.lines.reduce(
        (total, line) => total.add(line.debit),
        decimal(0),
      );
      const credit = voucher.lines.reduce(
        (total, line) => total.add(line.credit),
        decimal(0),
      );
      if (
        voucher.workspaceId !== scope.id ||
        voucher.companyId !== scope.companyId ||
        voucher.sourceType !== "MANUFACTURING_ACTUAL_COST" ||
        voucher.sourceId !== orderId ||
        !moneyEquals(debit, credit) ||
        !moneyEquals(debit, voucher.debit) ||
        !moneyEquals(credit, voucher.credit) ||
        !moneyEquals(voucher.totalAmount, expectedAmount) ||
        !moneyEquals(voucher.debit, expectedAmount) ||
        !moneyEquals(voucher.credit, expectedAmount)
      ) {
        throw new BadRequestException(
          `${label} is missing its exact workspace-scoped, source-linked, balanced voucher.`,
        );
      }
    };

    for (const posting of postings) {
      const voucher = posting.voucherEntry;
      if (
        posting.workspaceId !== scope.id ||
        posting.companyId !== scope.companyId ||
        posting.orderId !== orderId ||
        posting.voucherEntryId !== voucher.id ||
        posting.wipAccountId === posting.clearingAccountId
      ) {
        throw new BadRequestException(
          `Actual-cost posting ${posting.id} has invalid workspace, order, or ledger linkage; close is blocked.`,
        );
      }
      assertBalancedVoucher(
        voucher,
        `Actual-cost posting ${posting.id}`,
        posting.amount,
      );
      const hasExactLine = (
        accountId: string,
        debit: Prisma.Decimal.Value,
        credit: Prisma.Decimal.Value,
      ) =>
        voucher.lines.some(
          (line) =>
            line.accountId === accountId &&
            moneyEquals(line.debit, debit) &&
            moneyEquals(line.credit, credit),
        );
      if (
        voucher.voucherType !== "JOURNAL" ||
        voucher.documentKind !== "MANUFACTURING_ACTUAL_COST" ||
        voucher.reversalOfId !== null ||
        voucher.lines.length !== 2 ||
        !hasExactLine(posting.wipAccountId, posting.amount, 0) ||
        !hasExactLine(posting.clearingAccountId, 0, posting.amount)
      ) {
        throw new BadRequestException(
          `Actual-cost posting ${posting.id} does not have the exact Dr WIP / Cr clearing voucher; close is blocked.`,
        );
      }

      if (posting.finalizedSnapshotId) {
        if (voucher.status !== "POSTED") {
          throw new BadRequestException(
            `Actual-cost posting ${posting.id} was included in finalized costing, but its voucher is ${voucher.status}; close is blocked.`,
          );
        }
        continue;
      }

      if (voucher.status !== "REVERSED") {
        throw new BadRequestException(
          `Actual-cost posting ${posting.id} must be finalized into finished goods or validly reversed before close.`,
        );
      }

      const postedReversals = voucher.reversedBy.filter(
        (reversal) => reversal.status === "POSTED",
      );
      if (voucher.reversedBy.length !== 1 || postedReversals.length !== 1) {
        throw new BadRequestException(
          `Actual-cost posting ${posting.id} is marked reversed without one posted reversal voucher; close is blocked.`,
        );
      }
      const reversal = postedReversals[0];
      if (
        reversal.reversalOfId !== voucher.id ||
        reversal.workspaceId !== voucher.workspaceId ||
        reversal.companyId !== voucher.companyId
      ) {
        throw new BadRequestException(
          `Actual-cost posting ${posting.id} has an invalid reversal link; close is blocked.`,
        );
      }
      assertBalancedVoucher(
        reversal,
        `Actual-cost reversal ${reversal.id}`,
        posting.amount,
      );
      const remainingReversalLines = [...reversal.lines];
      const mirrorsEveryOriginalLine = voucher.lines.every((originalLine) => {
        const matchIndex = remainingReversalLines.findIndex(
          (reversalLine) =>
            reversalLine.accountId === originalLine.accountId &&
            reversalLine.ledger === originalLine.ledger &&
            reversalLine.costCenter === originalLine.costCenter &&
            reversalLine.project === originalLine.project &&
            reversalLine.billReference === originalLine.billReference &&
            moneyEquals(reversalLine.debit, originalLine.credit) &&
            moneyEquals(reversalLine.credit, originalLine.debit),
        );
        if (matchIndex < 0) return false;
        remainingReversalLines.splice(matchIndex, 1);
        return true;
      });
      if (
        reversal.voucherType !== voucher.voucherType ||
        reversal.documentKind !== voucher.documentKind ||
        reversal.currency !== voucher.currency ||
        reversal.fiscalYearId !== voucher.fiscalYearId ||
        !mirrorsEveryOriginalLine ||
        remainingReversalLines.length
      ) {
        throw new BadRequestException(
          `Actual-cost posting ${posting.id} has a reversal voucher that does not exactly mirror the original; close is blocked.`,
        );
      }
    }
  }

  private async closeProductionOrder(
    tx: Prisma.TransactionClient,
    scope: { id: string; tenantId: string; companyId: string },
    user: AuthenticatedRequestUser,
    order: any,
    settings: any,
    dto: ManufacturingOrderActionDto,
    when: Date,
  ) {
    const persisted = await tx.manufacturingOrder.findFirst({
      where: { id: order.id, workspaceId: scope.id },
      include: this.orderDetailInclude(),
    });
    if (!persisted)
      throw new NotFoundException("Manufacturing order not found.");
    await this.assertNoOpenQualityCasesAtClose(tx, scope.id, persisted);
    await this.assertActualCostPostingsReadyForClose(tx, scope, persisted.id);
    const fiscalYear = await this.openFiscalYear(tx, scope.companyId, when);
    const glRequiredTypes = new Set([
      "MATERIAL_ISSUE",
      "MATERIAL_RETURN",
      "PACKAGING_ISSUE",
      "PACKAGING_RETURN",
      "SCRAP_RECEIPT",
      "PRODUCTION_RECEIPT",
    ]);
    let pendingDocumentCount = persisted.transactions.filter(
      (transaction: any) => transaction.status !== "POSTED",
    ).length;
    let journalDebitTotal = decimal(0);
    let journalCreditTotal = decimal(0);
    let productionCostLedgerValue = decimal(0);
    for (const transaction of persisted.transactions) {
      if (
        transaction.status !== "POSTED" ||
        !glRequiredTypes.has(transaction.transactionType)
      )
        continue;
      const voucher = transaction.voucherEntry;
      if (!voucher || voucher.status !== "POSTED") {
        pendingDocumentCount += 1;
        continue;
      }
      const debit = voucher.lines.reduce(
        (total: Prisma.Decimal, line: any) => total.add(line.debit),
        decimal(0),
      );
      const credit = voucher.lines.reduce(
        (total: Prisma.Decimal, line: any) => total.add(line.credit),
        decimal(0),
      );
      if (
        !moneyEquals(debit, credit) ||
        !moneyEquals(debit, voucher.debit) ||
        !moneyEquals(credit, voucher.credit)
      )
        pendingDocumentCount += 1;
      journalDebitTotal = journalDebitTotal.add(debit);
      journalCreditTotal = journalCreditTotal.add(credit);
      if (transaction.transactionType === "PRODUCTION_RECEIPT") {
        productionCostLedgerValue = productionCostLedgerValue.add(
          voucher.lines
            .filter(
              (line: any) =>
                line.accountId === settings.finishedGoodsInventoryAccountId,
            )
            .reduce(
              (total: Prisma.Decimal, line: any) =>
                total.add(line.debit).sub(line.credit),
              decimal(0),
            ),
        );
      }
    }
    const openOperations = await tx.manufacturingOperationExecution.count({
      where: {
        orderId: persisted.id,
        status: { notIn: ["COMPLETED", "SKIPPED", "CANCELLED"] },
      },
    });
    pendingDocumentCount += openOperations;
    const reservationLines = persisted.reservations.flatMap(
      (reservation: any) =>
        (ACTIVE_RESERVATIONS as readonly string[]).includes(reservation.status)
          ? reservation.lines
          : [],
    );
    const outstandingReservationQuantity = reservationLines.reduce(
      (total: Prisma.Decimal, line: any) =>
        total.add(
          decimal(line.quantity)
            .sub(line.issuedQuantity)
            .sub(line.releasedQuantity),
        ),
      decimal(0),
    );

    const wipBalance = calculateManufacturingWipBalance(
      persisted.transactions,
      settings.defaultWipWarehouseId,
    );
    const wipQuantity = wipBalance.quantity;
    const wipValue = wipBalance.value;
    const receiptOutputMovements = persisted.transactions
      .filter(
        (transaction: any) =>
          transaction.status === "POSTED" &&
          transaction.transactionType === "PRODUCTION_RECEIPT",
      )
      .flatMap((transaction: any) => transaction.lines)
      .filter(
        (line: any) =>
          !line.orderMaterialId &&
          line.inventoryItemId === persisted.finishedProductId,
      )
      .flatMap((line: any) => line.stockMovements)
      .filter(
        (movement: any) => movement.movementType === "IN" && !movement.voidedAt,
      );
    const finishedGoodsInventoryValue = receiptOutputMovements.reduce(
      (total: Prisma.Decimal, movement: any) =>
        total.add(movement.movementValue),
      decimal(0),
    );
    const receiptQuantity = this.postedQuantity(
      persisted,
      "PRODUCTION_RECEIPT",
      { outputOnly: true },
    );
    const releaseQuantity = this.postedQuantity(persisted, "QA_RELEASE", {
      inventoryItemId: persisted.finishedProductId,
    });

    const inspections = persisted.lots.map((lot: any) => ({
      lot,
      inspection: this.latestLotInspection(persisted, lot.id),
    }));
    const qcPassed = settings.requireQcBeforeRelease
      ? inspections.reduce(
          (total: Prisma.Decimal, entry: any) =>
            total.add(entry.inspection?.acceptedQuantity ?? 0),
          decimal(0),
        )
      : decimal(persisted.completedQuantity);
    const qcFailed = settings.requireQcBeforeRelease
      ? inspections.reduce(
          (total: Prisma.Decimal, entry: any) =>
            total.add(entry.inspection?.rejectedQuantity ?? 0),
          decimal(0),
        )
      : decimal(0);
    const qcPresented = settings.requireQcBeforeRelease
      ? inspections.reduce(
          (total: Prisma.Decimal, entry: any) =>
            total.add(entry.inspection?.sampleQuantity ?? 0),
          decimal(0),
        )
      : decimal(persisted.completedQuantity);
    const qcHold = qcPresented.sub(qcPassed).sub(qcFailed);
    const serialTrackingRequired = Boolean(
      settings.requireSerialBeforeRelease ||
      persisted.finishedProduct.manufacturingProfile?.serialTracked,
    );
    const releasedSerials = persisted.serials
      .filter((serial: any) => serial.status === "RELEASED")
      .map((serial: any) => serial.serialNumber);
    const qaPackagingPolicy = [...persisted.workflowReviews]
      .reverse()
      .map((review: any) => ({
        review,
        evidence: jsonObject(review.evidence),
      }))
      .find(
        ({ review, evidence }) =>
          review.workflowCode === "ORDER_ACTION" &&
          review.status === "APPROVED" &&
          evidence.kind === "QA_RELEASE" &&
          jsonObject(evidence.packagingReleasePolicy).ready === true,
      );
    if (!qaPackagingPolicy) {
      throw new BadRequestException(
        "Close requires approved QA-release packaging policy evidence.",
      );
    }
    const packaging = this.lotPackagingActuals(
      persisted,
      undefined,
      jsonObject(qaPackagingPolicy.evidence.packagingReleasePolicy).required ===
        true,
    );
    const qualityRelease = evaluateQualityRelease({
      presentedQuantity: qcPresented,
      passedQuantity: qcPassed,
      failedQuantity: qcFailed,
      onHoldQuantity: qcHold,
      releaseQuantity,
      serialTrackingRequired,
      serialNumbers: releasedSerials,
      packagingReady: packaging.ready,
      requireFullRelease: true,
      requireAllPresentedPassed: true,
    });
    const materialBalances = persisted.materials.map((material: any) => ({
      materialId: material.id,
      inventoryItemId: material.inventoryItemId,
      unit: material.unit,
      requiredQuantity: material.plannedQuantity,
      issuedQuantity: this.postedQuantity(
        persisted,
        this.materialRole(material) === "PACKAGING_MATERIAL"
          ? "PACKAGING_ISSUE"
          : "MATERIAL_ISSUE",
        { orderMaterialId: material.id },
      ),
      consumedQuantity: this.postedQuantity(persisted, "PRODUCTION_RECEIPT", {
        orderMaterialId: material.id,
      }),
      returnedQuantity: this.postedQuantity(
        persisted,
        this.materialRole(material) === "PACKAGING_MATERIAL"
          ? "PACKAGING_RETURN"
          : "MATERIAL_RETURN",
        { orderMaterialId: material.id },
      ),
      scrappedQuantity: material.scrappedQuantity,
    }));
    const approvedMaterialVariances = await resolveApprovedMaterialVariances(
      tx,
      {
        workspaceId: scope.id,
        orderId: persisted.id,
        actionDate: when,
        materials: materialBalances.map((material) => ({
          id: material.materialId,
          inventoryItemId: material.inventoryItemId,
          unit: material.unit,
          requiredQuantity: material.requiredQuantity,
          consumedQuantity: material.consumedQuantity,
          scrappedQuantity: material.scrappedQuantity,
        })),
      },
    );
    const materialReconciliations = materialBalances.map((material) => ({
      ...material,
      varianceApproved: approvedMaterialVariances.has(material.materialId),
    }));

    const latestSnapshot = persisted.costSnapshots.at(-1);
    if (!latestSnapshot)
      throw new BadRequestException(
        "A posted manufacturing cost snapshot is required before close.",
      );
    // A FINALIZED snapshot may include labour, machine, overhead, subcontract
    // and other actuals capitalized after the physical FG receipt. Its own
    // balanced voucher completes the receipt journal's material-only value and
    // must participate in close reconciliation exactly once. PROVISIONAL
    // snapshots point at a receipt voucher already counted above.
    if (latestSnapshot.status === "FINALIZED") {
      const finalizationVoucher = latestSnapshot.voucherEntry;
      if (!finalizationVoucher || finalizationVoucher.status !== "POSTED") {
        pendingDocumentCount += 1;
      } else {
        const debit = finalizationVoucher.lines.reduce(
          (total: Prisma.Decimal, line: any) => total.add(line.debit),
          decimal(0),
        );
        const credit = finalizationVoucher.lines.reduce(
          (total: Prisma.Decimal, line: any) => total.add(line.credit),
          decimal(0),
        );
        if (
          !moneyEquals(debit, credit) ||
          !moneyEquals(debit, finalizationVoucher.debit) ||
          !moneyEquals(credit, finalizationVoucher.credit)
        ) {
          pendingDocumentCount += 1;
        }
        journalDebitTotal = journalDebitTotal.add(debit);
        journalCreditTotal = journalCreditTotal.add(credit);
        productionCostLedgerValue = productionCostLedgerValue.add(
          finalizationVoucher.lines
            .filter(
              (line: any) =>
                line.accountId === settings.finishedGoodsInventoryAccountId,
            )
            .reduce(
              (total: Prisma.Decimal, line: any) =>
                total.add(line.debit).sub(line.credit),
              decimal(0),
            ),
        );
      }
    }
    if (!moneyEquals(latestSnapshot.totalCost, finishedGoodsInventoryValue)) {
      throw new BadRequestException(
        "The latest cost snapshot does not reconcile to the posted finished-goods receipt value.",
      );
    }
    if (latestSnapshot.status === "PROVISIONAL") {
      if (!settings.allowProvisionalCost)
        throw new BadRequestException(
          "Provisional manufacturing cost is disabled; finalize actual costing before close.",
        );
      const payload = jsonObject(dto.payload);
      const reason = text(payload.extraCostsNotApplicableReason);
      const existingAttestation = persisted.workflowReviews.find(
        (review: any) =>
          review.workflowCode === "EXTRA_COSTS" &&
          review.entityType === "MANUFACTURING_ORDER" &&
          review.entityId === persisted.id &&
          review.outcome === "NOT_APPLICABLE" &&
          review.status === "REVIEWED" &&
          text(review.reason),
      );
      if (!existingAttestation && !reason) {
        throw new BadRequestException(
          "Closing a material-only provisional cost requires payload.extraCostsNotApplicableReason as explicit evidence that labour, machine, overhead, subcontract and other costs are not applicable.",
        );
      }
      if (!existingAttestation)
        await tx.manufacturingWorkflowReview.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            orderId: persisted.id,
            workflowGroup: "COSTING_ACCOUNTS",
            workflowCode: "EXTRA_COSTS",
            entityType: "MANUFACTURING_ORDER",
            entityId: persisted.id,
            transactionDate: when,
            idempotencyKey: `${dto.idempotencyKey}:EXTRA_COSTS`,
            title: `Extra costs not applicable for ${persisted.orderNumber}`,
            outcome: "NOT_APPLICABLE",
            status: "REVIEWED",
            reason,
            createdByUserId: user.id,
            reviewedByUserId: user.id,
            reviewedAt: when,
          },
        });
    } else if (latestSnapshot.status !== "FINALIZED") {
      throw new BadRequestException(
        "The latest manufacturing cost snapshot must be PROVISIONAL or FINALIZED before close.",
      );
    }

    const reworkDispositionReviews = persisted.workflowReviews.filter(
      (review: any) => {
        const evidence = jsonObject(review.evidence);
        return (
          review.workflowCode === "ORDER_ACTION" &&
          review.status === "APPROVED" &&
          evidence.kind === "CREATE_REWORK_DISPOSITION"
        );
      },
    );
    const reworkDispositions = reworkDispositionReviews.map((review: any) => {
      const evidence = jsonObject(review.evidence);
      return {
        reviewId: review.id,
        linkedOrderId: text(evidence.linkedOrderId),
        quantity: quantityDecimal(
          evidence.disposedQuantity,
          `Rework disposition ${review.id} disposedQuantity`,
        ),
      };
    });
    const linkedOrderIds = [
      ...new Set(
        reworkDispositions
          .map((disposition) => disposition.linkedOrderId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const linkedReworkOrders = linkedOrderIds.length
      ? await tx.manufacturingOrder.findMany({
          where: { workspaceId: scope.id, id: { in: linkedOrderIds } },
          select: {
            id: true,
            type: true,
            status: true,
            plannedQuantity: true,
          },
        })
      : [];
    const reworkReconciliation = evaluateOpenReworkDispositions({
      dispositions: reworkDispositions,
      linkedOrders: linkedReworkOrders,
    });

    const readiness = evaluateCloseReadiness({
      plannedOutputQuantity: persisted.plannedQuantity,
      producedQuantity: decimal(persisted.completedQuantity).add(
        persisted.rejectedQuantity,
      ),
      acceptedQuantity: persisted.completedQuantity,
      rejectedOrScrappedOutputQuantity: persisted.rejectedQuantity,
      cancelledOutputQuantity: 0,
      openReworkQuantity: reworkReconciliation.openQuantity,
      releasedFinishedGoodsQuantity: releaseQuantity,
      outstandingReservationQuantity,
      pendingDocumentCount,
      materialReconciliations,
      qualityRelease,
      packaging,
      wipQuantity,
      wipValue,
      finishedGoodsInventoryValue,
      productionCostLedgerValue,
      journalDebitTotal,
      journalCreditTotal,
      periodOpen: fiscalYear.status === "OPEN",
    });
    if (!receiptQuantity.equals(persisted.completedQuantity)) {
      readiness.issues.push({
        code: "PRODUCTION_RECEIPT_NOT_RECONCILED",
        message:
          "Posted production receipt quantity must equal the completed accepted output quantity.",
      });
    }
    if (
      serialTrackingRequired &&
      releasedSerials.length !== Number(releaseQuantity.toFixed(0))
    ) {
      readiness.issues.push({
        code: "SERIAL_RELEASE_NOT_RECONCILED",
        message:
          "Every released serialized unit must have one persisted RELEASED serial.",
      });
    }
    if (
      settings.requireQcBeforeRelease &&
      inspections.some(
        (entry: any) =>
          !entry.inspection || entry.inspection.status !== "PASSED",
      )
    ) {
      readiness.issues.push({
        code: "LATEST_QC_NOT_PASSED",
        message:
          "Every production lot requires a latest PASSED finished-goods QC result.",
      });
    }
    if (readiness.issues.length)
      throw new BadRequestException(
        readiness.issues
          .map((issue) => `[${issue.code}] ${issue.message}`)
          .join(" "),
      );
    await tx.manufacturingOrder.update({
      where: { id: persisted.id },
      data: {
        status: "CLOSED",
        closedByUserId: user.id,
        closedAt: when,
        closeReason: text(dto.note),
        fiscalYearId: fiscalYear.id,
      },
    });
    await tx.manufacturingOrderLot.updateMany({
      where: { orderId: persisted.id },
      data: { status: "CLOSED" },
    });
    return {
      approvedMaterialVariances: materialBalances
        .filter((material) =>
          approvedMaterialVariances.has(material.materialId),
        )
        .map((material) => ({
          orderMaterialId: material.materialId,
          qualityCaseId: approvedMaterialVariances.get(material.materialId),
          signedVarianceQuantity: decimal(material.consumedQuantity)
            .add(material.scrappedQuantity)
            .sub(material.requiredQuantity)
            .toString(),
          unit: material.unit,
        })),
      reworkReconciliation: {
        dispositionCount: reworkDispositions.length,
        linkedOrderIds,
        openQuantity: reworkReconciliation.openQuantity.toString(),
        unresolved: reworkReconciliation.unresolved,
      },
    };
  }

  private async applyInventoryLotTransfer(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    lines: Array<{
      inventoryItemId: string;
      inventoryLotId?: string | null;
      quantity: Prisma.Decimal;
      unit: string;
      reservationLineId?: string | null;
    }>,
    fromWarehouseId: string,
    toWarehouseId: string,
    transactionType:
      | "MATERIAL_ISSUE"
      | "MATERIAL_RETURN"
      | "PACKAGING_ISSUE"
      | "PACKAGING_RETURN",
    transactionDate: Date,
  ) {
    const lotLines = lines.filter((line) => Boolean(line.inventoryLotId));
    const grouped = new Map<
      string,
      {
        inventoryItemId: string;
        total: Prisma.Decimal;
        reserved: Prisma.Decimal;
        unreserved: Prisma.Decimal;
      }
    >();
    for (const line of lotLines) {
      const lotId = line.inventoryLotId!;
      const current = grouped.get(lotId) ?? {
        inventoryItemId: line.inventoryItemId,
        total: decimal(0),
        reserved: decimal(0),
        unreserved: decimal(0),
      };
      if (current.inventoryItemId !== line.inventoryItemId) {
        throw new BadRequestException(
          "A source lot cannot be used for different materials in one transaction.",
        );
      }
      current.total = current.total.add(line.quantity);
      if (line.reservationLineId)
        current.reserved = current.reserved.add(line.quantity);
      else current.unreserved = current.unreserved.add(line.quantity);
      grouped.set(lotId, current);
    }

    for (const [lotId, quantities] of grouped) {
      const lot = await tx.manufacturingInventoryLot.findFirst({
        where: {
          id: lotId,
          workspaceId,
          inventoryItemId: quantities.inventoryItemId,
        },
        include: { inventoryItem: { select: { unit: true } } },
      });
      if (!lot)
        throw new BadRequestException(
          `Inventory lot ${lotId} was not found in this workspace.`,
        );
      const units = new Set(
        lotLines
          .filter((line) => line.inventoryLotId === lotId)
          .map((line) => line.unit.trim().toLowerCase()),
      );
      const baseUnit = lot.inventoryItem.unit.trim().toLowerCase();
      if (
        lot.unit.trim().toLowerCase() !== baseUnit ||
        units.size !== 1 ||
        !units.has(baseUnit)
      ) {
        throw new BadRequestException(
          `Inventory lot ${lot.lotNumber} and its posting lines must use the authoritative stock/base unit (${lot.inventoryItem.unit}).`,
        );
      }
      const isIssue = transactionType.endsWith("ISSUE");
      const expectedWarehouseId = isIssue ? fromWarehouseId : toWarehouseId;
      if (lot.warehouseId !== expectedWarehouseId) {
        throw new BadRequestException(
          `Inventory lot ${lot.lotNumber} is not in the expected ${isIssue ? "source" : "return"} warehouse.`,
        );
      }
      if (isIssue) {
        if (decimal(lot.holdQuantity).greaterThan(0))
          throw new BadRequestException(
            `Inventory lot ${lot.lotNumber} is on quality hold.`,
          );
        if (lot.expiresAt && lot.expiresAt < transactionDate)
          throw new BadRequestException(
            `Inventory lot ${lot.lotNumber} is expired.`,
          );
        if (lot.retestDueAt && lot.retestDueAt < transactionDate)
          throw new BadRequestException(
            `Inventory lot ${lot.lotNumber} has passed its retest-due date; approved QA retest evidence is required before issue.`,
          );
        if (decimal(lot.availableQuantity).lessThan(quantities.total)) {
          throw new BadRequestException(
            `Inventory lot ${lot.lotNumber} does not contain enough released stock.`,
          );
        }
        if (decimal(lot.reservedQuantity).lessThan(quantities.reserved)) {
          throw new BadRequestException(
            `Inventory lot ${lot.lotNumber} does not contain the referenced reserved quantity.`,
          );
        }
        const allocatable = decimal(lot.availableQuantity).sub(
          lot.reservedQuantity,
        );
        if (allocatable.lessThan(quantities.unreserved)) {
          throw new BadRequestException(
            `Inventory lot ${lot.lotNumber} does not contain enough unreserved stock.`,
          );
        }
        await tx.manufacturingInventoryLot.update({
          where: { id: lot.id },
          data: {
            availableQuantity: { decrement: quantities.total },
            ...(quantities.reserved.greaterThan(0)
              ? { reservedQuantity: { decrement: quantities.reserved } }
              : {}),
          },
        });
      } else {
        await tx.manufacturingInventoryLot.update({
          where: { id: lot.id },
          data: { availableQuantity: { increment: quantities.total } },
        });
      }
    }
  }

  private async postTransferAndJournal(
    tx: Prisma.TransactionClient,
    scope: { id: string; tenantId: string; companyId: string },
    user: AuthenticatedRequestUser,
    order: any,
    settings: any,
    dto: ManufacturingOrderActionDto,
    lines: Array<{
      orderMaterialId: string;
      inventoryItemId: string;
      quantity: Prisma.Decimal;
      unit: string;
      reservationLineId?: string | null;
      inventoryLotId?: string | null;
    }>,
    fromWarehouseId: string,
    toWarehouseId: string,
    transactionType:
      | "MATERIAL_ISSUE"
      | "MATERIAL_RETURN"
      | "PACKAGING_ISSUE"
      | "PACKAGING_RETURN",
    debitAccountId: string,
    creditAccountId: string,
    when: Date,
    orderLotId?: string,
  ) {
    const isIssue = transactionType.endsWith("ISSUE");
    const isPackaging = transactionType.startsWith("PACKAGING");
    const rawMaterialWarehouseId = isIssue
      ? fromWarehouseId
      : toWarehouseId;
    const wipWarehouseId = isIssue ? toWarehouseId : fromWarehouseId;
    if (
      !settings.defaultRawMaterialWarehouseId ||
      rawMaterialWarehouseId !== settings.defaultRawMaterialWarehouseId ||
      !settings.defaultWipWarehouseId ||
      wipWarehouseId !== settings.defaultWipWarehouseId
    ) {
      throw new BadRequestException(
        `${transactionType} must use the currently configured raw-material and WIP warehouses.`,
      );
    }
    const configuredInventoryAccountId = isPackaging
      ? settings.packagingInventoryAccountId
      : settings.rawMaterialInventoryAccountId;
    const inventoryAccountId = isIssue ? creditAccountId : debitAccountId;
    const wipAccountId = isIssue ? debitAccountId : creditAccountId;
    if (
      !configuredInventoryAccountId ||
      inventoryAccountId !== configuredInventoryAccountId ||
      !settings.wipInventoryAccountId ||
      wipAccountId !== settings.wipInventoryAccountId
    )
      throw new BadRequestException(
        `${transactionType} must use the currently configured ${isPackaging ? "packaging" : "raw-material"} Inventory Control and WIP account mappings.`,
      );
    await this.activeWarehouse(
      tx,
      scope.id,
      fromWarehouseId,
      "Source warehouse",
      {
        companyId: scope.companyId,
        role: isIssue ? "RAW_MATERIAL" : "WIP",
      },
    );
    await this.activeWarehouse(
      tx,
      scope.id,
      toWarehouseId,
      "Destination warehouse",
      {
        companyId: scope.companyId,
        role: isIssue ? "WIP" : "RAW_MATERIAL",
      },
    );
    const wipAccount = await this.activeLedger(
      tx,
      scope.companyId,
      wipAccountId,
      "WIP inventory account",
      "ASSET",
    );
    const inventoryAccount = await this.protectedInventoryControlLedger(
      tx,
      scope.companyId,
      inventoryAccountId,
      `${isPackaging ? "Packaging" : "Raw-material"} inventory account`,
    );
    if (inventoryAccount.id === wipAccount.id)
      throw new BadRequestException(
        "Manufacturing debit and credit accounts must be different LEDGER accounts.",
      );
    const debitAccount = isIssue ? wipAccount : inventoryAccount;
    const creditAccount = isIssue ? inventoryAccount : wipAccount;
    const transferLocations = await this.resolveTransferLocations(
      tx,
      scope.id,
      lines,
      fromWarehouseId,
      toWarehouseId,
      transactionType,
      transactionType.endsWith("ISSUE")
        ? (order.issueLocationId ??
            settings.defaultRawMaterialLocationId ??
            null)
        : (settings.defaultWipLocationId ?? null),
      transactionType.endsWith("ISSUE")
        ? (settings.defaultWipLocationId ?? null)
        : (order.issueLocationId ??
            settings.defaultRawMaterialLocationId ??
            null),
    );
    const fromLocation = await this.activeLocation(
      tx,
      scope.id,
      fromWarehouseId,
      transferLocations.fromLocationId,
      "Source manufacturing location",
      {
        companyId: scope.companyId,
        dispositions: [isIssue ? "RELEASED" : "WIP"],
      },
    );
    const toLocation = await this.activeLocation(
      tx,
      scope.id,
      toWarehouseId,
      transferLocations.toLocationId,
      "Destination manufacturing location",
      {
        companyId: scope.companyId,
        dispositions: [isIssue ? "WIP" : "RELEASED"],
      },
    );
    if (!fromLocation || !toLocation)
      throw new BadRequestException(
        `${transactionType} requires active raw-material RELEASED and WIP locations.`,
      );
    if (settings.blockNegativeStock) {
      const stock = await this.latestStock(tx, scope.id, {
        warehouseId: fromWarehouseId,
      });
      const requirements = aggregateStockRequirements(
        lines.map((line) => ({
          warehouseId: fromWarehouseId,
          locationId: transferLocations.fromLocationId,
          inventoryItemId: line.inventoryItemId,
          quantity: line.quantity,
        })),
      );
      for (const requirement of requirements) {
        const movement = stock.get(
          `${requirement.warehouseId}:${requirement.inventoryItemId}`,
        );
        if (decimal(movement?.balanceQuantity).lessThan(requirement.quantity))
          throw new BadRequestException(
            `Insufficient stock to post ${transactionType} for item ${requirement.inventoryItemId}.`,
          );
      }
    }
    const fiscalYear = await tx.fiscalYear.findFirst({
      where: {
        companyId: scope.companyId,
        status: "OPEN",
        startDate: { lte: when },
        endDate: { gte: when },
      },
      orderBy: { startDate: "desc" },
    });
    if (!fiscalYear)
      throw new BadRequestException(
        "Transaction date must be inside an open fiscal year.",
      );
    const reservationIds = [
      ...new Set(
        lines
          .map(
            (line) =>
              order.reservations?.find((reservation: any) =>
                reservation.lines?.some(
                  (entry: any) => entry.id === line.reservationLineId,
                ),
              )?.id,
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const documentKind = transactionType.endsWith("ISSUE")
      ? "MATERIAL_ISSUE"
      : "MATERIAL_RETURN";
    const movementNumber = await issueManufacturingDocumentNumberTx(
      tx,
      scope,
      user.id,
      {
        documentKind,
        issuedAt: when,
        idempotencyKey: `MFG:${dto.idempotencyKey}:${transactionType}:NUMBER`,
      },
    );
    const transaction = await tx.manufacturingTransaction.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        fiscalYearId: fiscalYear.id,
        transactionNumber: movementNumber.documentNumber,
        transactionType,
        status: "POSTED",
        transactionDate: when,
        orderId: order.id,
        orderLotId: orderLotId ?? null,
        reservationId: reservationIds.length === 1 ? reservationIds[0] : null,
        fromWarehouseId,
        toWarehouseId,
        fromLocationId: transferLocations.fromLocationId,
        toLocationId: transferLocations.toLocationId,
        idempotencyKey: `MFG:${dto.idempotencyKey}:${transactionType}`,
        notes: text(dto.note),
        createdByUserId: user.id,
        postedByUserId: user.id,
        postedAt: when,
        lines: {
          create: lines.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            orderMaterialId: line.orderMaterialId,
            reservationLineId: line.reservationLineId ?? null,
            sourceInventoryLotId: transactionType.endsWith("ISSUE")
              ? (line.inventoryLotId ?? null)
              : null,
            destinationInventoryLotId: transactionType.endsWith("RETURN")
              ? (line.inventoryLotId ?? null)
              : null,
            quantity: line.quantity,
            unit: line.unit,
          })),
        },
      },
      include: { lines: true },
    });
    await this.applyInventoryLotTransfer(
      tx,
      scope.id,
      lines,
      fromWarehouseId,
      toWarehouseId,
      transactionType,
      when,
    );
    const stockMovementIds: string[] = [];
    for (const line of transaction.lines) {
      const common = {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        inventoryItemId: line.inventoryItemId,
        transactionId: transaction.id,
        transactionLineId: line.id,
        referenceNo: order.orderNumber,
        quantity: line.quantity,
        unit: line.unit,
        transactionDate: when,
        postedByUserId: user.id,
        manufacturingTransactionLineId: line.id,
      };
      const out = await tx.stockMovement.create({
        data: {
          ...common,
          warehouseId: fromWarehouseId,
          transactionType: "STOCK_TRANSFER_OUT",
          movementType: "OUT",
          idempotencyKey: `MFG:${dto.idempotencyKey}:${line.id}:OUT`,
        },
      });
      const incoming = await tx.stockMovement.create({
        data: {
          ...common,
          warehouseId: toWarehouseId,
          transactionType: "STOCK_TRANSFER_IN",
          movementType: "IN",
          idempotencyKey: `MFG:${dto.idempotencyKey}:${line.id}:IN`,
        },
      });
      stockMovementIds.push(out.id, incoming.id);
    }
    const costed = await rebuildMovingAverageCosts(
      tx,
      scope.id,
      lines.map((line) => line.inventoryItemId),
    );
    const costedLines = transaction.lines.map((line) => {
      const movement = costed.movements.find(
        (entry) =>
          entry.transactionType === "STOCK_TRANSFER_OUT" &&
          entry.transactionId === transaction.id &&
          entry.transactionLineId === line.id,
      );
      if (!movement)
        throw new BadRequestException("Unable to derive exact MWA issue cost.");
      return { line, movement };
    });
    await this.requireInventoryService().reconcileMovingAverageLedger(
      tx,
      scope.id,
      costed.movements,
      user.id,
    );
    const allocations = allocatePostedMoneyLines(
      costedLines.map(({ movement }) => movement.movementValue),
    );
    for (let index = 0; index < costedLines.length; index += 1) {
      const { line, movement } = costedLines[index];
      await tx.manufacturingTransactionLine.update({
        where: { id: line.id },
        data: {
          unitCost: movement.unitCost,
          totalCost: allocations[index].amount,
        },
      });
    }
    const totalPaisa = allocations.reduce(
      (sum, row) => sum + row.amountPaisa,
      0n,
    );
    const total = new Prisma.Decimal(totalPaisa.toString()).div(100);
    if (toPaisa(total) < 0n || !moneyEquals(total, total))
      throw new BadRequestException("Manufacturing journal amount is invalid.");
    const voucher = await tx.voucherEntry.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        createdByUserId: user.id,
        voucherType: "JOURNAL",
        documentKind: transactionType,
        voucherNumber: compactReference(
          "JV-MFG",
          `${dto.idempotencyKey}:${transactionType}`,
        ),
        voucherDate: when,
        partyName: "Manufacturing",
        reference: order.orderNumber,
        narration: `${transactionType.replaceAll("_", " ")} for ${order.orderNumber}`,
        status: "POSTED",
        totalAmount: total,
        debit: total,
        credit: total,
        currency: settings.currency,
        fiscalYearId: fiscalYear.id,
        sourceType: `MANUFACTURING_${transactionType}`,
        sourceId: transaction.id,
        approvedByUserId: user.id,
        approvedAt: when,
        postedAt: when,
        idempotencyKey: `MFG:${dto.idempotencyKey}:${transactionType}:GL`,
        lines: {
          create: [
            {
              accountId: debitAccount.id,
              ledger: debitAccount.name,
              description: transactionType,
              debit: total,
              credit: 0,
            },
            {
              accountId: creditAccount.id,
              ledger: creditAccount.name,
              description: transactionType,
              debit: 0,
              credit: total,
            },
          ],
        },
      },
    });
    await tx.manufacturingTransaction.update({
      where: { id: transaction.id },
      data: { voucherEntryId: voucher.id },
    });
    return { transactionId: transaction.id, stockMovementIds };
  }

  private async resolveTransferLocations(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    lines: Array<{
      inventoryItemId: string;
      inventoryLotId?: string | null;
    }>,
    fromWarehouseId: string,
    toWarehouseId: string,
    transactionType:
      | "MATERIAL_ISSUE"
      | "MATERIAL_RETURN"
      | "PACKAGING_ISSUE"
      | "PACKAGING_RETURN",
    defaultFromLocationId: string | null,
    defaultToLocationId: string | null,
  ) {
    const lotIds = [
      ...new Set(
        lines
          .map((line) => line.inventoryLotId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    if (!lotIds.length) {
      return {
        fromLocationId: defaultFromLocationId,
        toLocationId: defaultToLocationId,
      };
    }

    const lots = await tx.manufacturingInventoryLot.findMany({
      where: { workspaceId, id: { in: lotIds } },
      select: {
        id: true,
        inventoryItemId: true,
        warehouseId: true,
        locationId: true,
        lotNumber: true,
      },
    });
    if (lots.length !== lotIds.length) {
      throw new BadRequestException(
        "One or more selected inventory lots do not exist in this workspace.",
      );
    }
    const lotById = new Map(lots.map((lot) => [lot.id, lot]));
    const isIssue = transactionType.endsWith("ISSUE");
    const expectedLotWarehouseId = isIssue ? fromWarehouseId : toWarehouseId;
    const lotLocationIds = new Set<string>();
    for (const line of lines) {
      if (!line.inventoryLotId) continue;
      const lot = lotById.get(line.inventoryLotId);
      if (!lot || lot.inventoryItemId !== line.inventoryItemId) {
        throw new BadRequestException(
          "A selected inventory lot does not match its material line.",
        );
      }
      if (lot.warehouseId !== expectedLotWarehouseId) {
        throw new BadRequestException(
          `Inventory lot ${lot.lotNumber} is not in the expected ${
            isIssue ? "source" : "return-destination"
          } warehouse.`,
        );
      }
      if (lot.locationId) lotLocationIds.add(lot.locationId);
    }

    const untrackedDefault = isIssue
      ? defaultFromLocationId
      : defaultToLocationId;
    if (lines.some((line) => !line.inventoryLotId) && untrackedDefault) {
      lotLocationIds.add(untrackedDefault);
    }
    if (lotLocationIds.size > 1) {
      throw new BadRequestException(
        `A single ${transactionType} cannot mix inventory lots from different locations. Post one location per transaction.`,
      );
    }
    const selectedLocationId = [...lotLocationIds][0] ?? untrackedDefault;
    return isIssue
      ? {
          fromLocationId: selectedLocationId ?? null,
          toLocationId: defaultToLocationId,
        }
      : {
          fromLocationId: defaultFromLocationId,
          toLocationId: selectedLocationId ?? null,
        };
  }
}
