import { createHash } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { roundMoneyDecimal } from "../accounting/money.util.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PermissionsService } from "../common/services/permissions.service.js";
import { Prisma } from "../generated/prisma/index.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { rebuildMovingAverageCosts } from "../inventory/moving-average.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  issueManufacturingDocumentNumberTx,
  manufacturingEntityIdFromIdempotency,
} from "./manufacturing-document-number.js";
import type {
  CreateMaterialExceptionDto,
  DecideMaterialExceptionDto,
  MaterialExceptionKind,
  RetestManufacturingInventoryLotDto,
} from "./manufacturing-material-exceptions.dto.js";
import {
  calculateMaterialReconciliation,
  materialLotRetestDateRule,
  materialQuantityBucketForDisposition,
  materialStatusTransferRule,
  qualityCaseReferencesExactLot,
} from "./manufacturing-material-exceptions.domain.js";
import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";

type Scope = { id: string; tenantId: string; companyId: string };
type Db = Prisma.TransactionClient | PrismaService;
type Query = Record<string, string | undefined>;
type MaterialExceptionInput = {
  kind: MaterialExceptionKind;
  orderId: string;
  sourceOrderMaterialId: string | null;
  substituteInventoryItemId: string | null;
  inventoryLotId: string | null;
  destinationLocationId: string | null;
  qualityCaseId: string | null;
  quantity: string;
  unit: string | null;
  reason: string;
};

const WORKFLOW_CODES = {
  ADDITIONAL_ISSUE: "ADDITIONAL_MATERIAL_ISSUE_REQUEST",
  SUBSTITUTION: "MATERIAL_SUBSTITUTION_REQUEST",
  STATUS_TRANSFER: "MATERIAL_STATUS_TRANSFER_REQUEST",
  DESTRUCTION: "MATERIAL_DESTRUCTION_REQUEST",
} as const;

const INVENTORY_CONTROL_ACCOUNT_CODE = "1210001";

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asDate(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new BadRequestException(`${label} is invalid.`);
  return parsed;
}

function decimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

function exactQuantity(value: Prisma.Decimal.Value, label = "quantity") {
  const result = decimal(value).toDecimalPlaces(
    4,
    Prisma.Decimal.ROUND_HALF_UP,
  );
  if (!result.isFinite() || result.lessThanOrEqualTo(0))
    throw new BadRequestException(`${label} must be greater than zero.`);
  if (!result.equals(decimal(value)))
    throw new BadRequestException(
      `${label} cannot exceed four decimal places.`,
    );
  return result;
}

function exactJsonQuantity(value: unknown, label: string) {
  if (typeof value !== "string" && typeof value !== "number")
    throw new BadRequestException(`${label} is required.`);
  try {
    return exactQuantity(value, label);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(`${label} is invalid.`);
  }
}

function assertLotControlDateCurrent(
  lot: { lotNumber: string; retestDueAt: Date | null; expiresAt: Date | null },
  transactionDate: Date,
) {
  if (lot.expiresAt && lot.expiresAt < transactionDate)
    throw new BadRequestException(
      `Inventory lot ${lot.lotNumber} is expired and cannot be used by this material control.`,
    );
  if (lot.retestDueAt && lot.retestDueAt < transactionDate)
    throw new BadRequestException(
      `Inventory lot ${lot.lotNumber} is past its retest due date and is blocked until QA posts an approved retest or extension.`,
    );
}

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function qualityCaseDetails(payload: Prisma.JsonValue) {
  const root = object(payload);
  const details = root.details;
  return details && typeof details === "object" && !Array.isArray(details)
    ? object(details as Prisma.JsonValue)
    : root;
}

function hash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function requestInput(review: { evidence: Prisma.JsonValue | null }) {
  const evidence = object(review.evidence);
  const input = object(evidence.input as Prisma.JsonValue);
  return input as MaterialExceptionInput;
}

function bucketForDisposition(disposition: string) {
  const bucket = materialQuantityBucketForDisposition(disposition);
  if (bucket) return bucket;
  throw new BadRequestException(
    `Location disposition ${disposition} cannot hold a manufacturing inventory lot.`,
  );
}

@Injectable()
export class ManufacturingMaterialExceptionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ManufacturingElectronicSignatureService)
    private readonly electronicSignature: ManufacturingElectronicSignatureService,
    @Inject(InventoryService)
    private readonly inventoryService?: InventoryService,
  ) {}

  private requireInventoryService() {
    if (!this.inventoryService) {
      throw new Error(
        "InventoryService is required for manufacturing exception valuation reconciliation",
      );
    }
    return this.inventoryService;
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
        status: "ACTIVE",
        level: "LEDGER",
        nature: "ASSET",
        isSystem: true,
        isControlAccount: true,
      },
    });
    if (!account)
      throw new BadRequestException(
        `${label} must reference this company's active protected Inventory Control ledger (${INVENTORY_CONTROL_ACCOUNT_CODE}).`,
      );
    return account;
  }

  private async scope(
    user: AuthenticatedRequestUser,
    requestedWorkspaceId?: string,
  ): Promise<Scope> {
    const workspaceId = requestedWorkspaceId || user.workspaceId;
    if (!workspaceId || !user.workspaceId)
      throw new BadRequestException("An active workspace is required.");
    if (workspaceId !== user.workspaceId)
      throw new ForbiddenException(
        "Cross-workspace manufacturing access is not allowed.",
      );
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        tenantId: user.tenantId,
        companyId: user.companyId,
      },
      select: { id: true, tenantId: true, companyId: true },
    });
    if (!workspace) throw new NotFoundException("Workspace not found.");
    return workspace;
  }

  private async requirePermission(
    user: AuthenticatedRequestUser,
    permission: string,
  ) {
    const granted = await this.permissions.getGrantedKeys(user);
    if (!granted.has(permission))
      throw new ForbiddenException(`Permission required: ${permission}`);
  }

  private async assertPeriodOpen(
    db: Db,
    workspaceId: string,
    transactionDate: Date,
  ) {
    const period = await db.manufacturingPeriod.findUnique({
      where: {
        workspaceId_periodYear_periodMonth: {
          workspaceId,
          periodYear: transactionDate.getUTCFullYear(),
          periodMonth: transactionDate.getUTCMonth() + 1,
        },
      },
      select: { status: true, periodYear: true, periodMonth: true },
    });
    if (period && period.status !== "OPEN")
      throw new BadRequestException(
        `Manufacturing period ${period.periodYear}-${String(period.periodMonth).padStart(2, "0")} is ${period.status}.`,
      );
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
      "The material control could not be serialized after three attempts.",
    );
  }

  async getControlView(user: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(user, query.workspaceId);
    const orderWhere = query.orderId ? { id: query.orderId } : {};
    const [
      orders,
      items,
      lots,
      locations,
      qualityCases,
      requests,
      retestActions,
    ] = await Promise.all([
      this.prisma.manufacturingOrder.findMany({
        where: { workspaceId: scope.id, ...orderWhere },
        include: {
          finishedProduct: { select: { itemCode: true, itemName: true } },
          materials: {
            include: {
              inventoryItem: {
                select: { itemCode: true, itemName: true, unit: true },
              },
              bomComponent: {
                select: { allowSubstitute: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 200,
      }),
      this.prisma.inventoryItem.findMany({
        where: {
          workspaceId: scope.id,
          status: "ACTIVE",
          manufacturingProfile: {
            is: {
              isActive: true,
              role: {
                in: [
                  "RAW_MATERIAL",
                  "PACKAGING_MATERIAL",
                  "INTERMEDIATE",
                  "BULK",
                  "CONSUMABLE",
                ],
              },
            },
          },
        },
        select: { id: true, itemCode: true, itemName: true, unit: true },
        orderBy: [{ itemName: "asc" }],
      }),
      this.prisma.manufacturingInventoryLot.findMany({
        where: {
          workspaceId: scope.id,
          OR: [
            { availableQuantity: { gt: 0 } },
            { holdQuantity: { gt: 0 } },
            { rejectedQuantity: { gt: 0 } },
          ],
        },
        include: {
          inventoryItem: { select: { itemCode: true, itemName: true } },
          warehouse: { select: { code: true, name: true, type: true } },
          location: {
            select: { code: true, name: true, disposition: true },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 300,
      }),
      this.prisma.manufacturingLocation.findMany({
        where: { workspaceId: scope.id, isActive: true },
        include: { warehouse: { select: { code: true, name: true } } },
        orderBy: [{ warehouse: { name: "asc" } }, { name: "asc" }],
      }),
      this.prisma.manufacturingControlRecord.findMany({
        where: {
          workspaceId: scope.id,
          kind: "QUALITY_CASE",
          status: "APPROVED",
        },
        orderBy: [{ approvedAt: "desc" }],
        take: 100,
      }),
      this.prisma.manufacturingWorkflowReview.findMany({
        where: {
          workspaceId: scope.id,
          workflowCode: { in: Object.values(WORKFLOW_CODES) },
        },
        include: {
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 200,
      }),
      this.prisma.manufacturingWorkflowReview.findMany({
        where: {
          workspaceId: scope.id,
          workflowCode: "MATERIAL_LOT_RETEST_EXTENSION",
        },
        include: {
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 200,
      }),
    ]);

    return {
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        bomVersionId: order.bomVersionId,
        finishedProduct: `${order.finishedProduct.itemCode} - ${order.finishedProduct.itemName}`,
        materials: order.materials
          .filter((material) => material.status !== "CANCELLED")
          .map((material) => {
            const balance = calculateMaterialReconciliation({
              expectedQuantity: material.plannedQuantity,
              issuedQuantity: material.issuedQuantity,
              returnedQuantity: material.returnedQuantity,
              consumedQuantity: material.consumedQuantity,
              scrappedQuantity: material.scrappedQuantity,
            });
            return {
              id: material.id,
              bomComponentId: material.bomComponentId,
              inventoryItemId: material.inventoryItemId,
              itemCode: material.inventoryItem.itemCode,
              itemName: material.inventoryItem.itemName,
              unit: material.unit,
              status: material.status,
              expectedQuantity: balance.expectedQuantity.toNumber(),
              reservedQuantity: decimal(material.reservedQuantity).toNumber(),
              issuedQuantity: balance.issuedQuantity.toNumber(),
              returnedQuantity: balance.returnedQuantity.toNumber(),
              consumedQuantity: balance.consumedQuantity.toNumber(),
              scrappedQuantity: balance.scrappedQuantity.toNumber(),
              unaccountedQuantity: balance.unaccountedQuantity.toNumber(),
              requirementVariance: balance.requirementVariance.toNumber(),
              reconciled: balance.reconciled,
              substitutionAllowed: Boolean(
                material.bomComponent?.allowSubstitute,
              ),
              substituteGroup: material.bomComponent?.allowSubstitute
                ? "CONTROLLED_SUBSTITUTE"
                : null,
            };
          }),
      })),
      items,
      lots: lots.map((lot) => ({
        id: lot.id,
        inventoryItemId: lot.inventoryItemId,
        itemCode: lot.inventoryItem.itemCode,
        itemName: lot.inventoryItem.itemName,
        warehouseId: lot.warehouseId,
        warehouse: `${lot.warehouse.code} - ${lot.warehouse.name}`,
        warehouseType: lot.warehouse.type,
        locationId: lot.locationId,
        location: lot.location
          ? `${lot.location.code} - ${lot.location.name}`
          : null,
        disposition: lot.location?.disposition ?? null,
        lotNumber: lot.lotNumber,
        availableQuantity: decimal(lot.availableQuantity).toNumber(),
        holdQuantity: decimal(lot.holdQuantity).toNumber(),
        rejectedQuantity: decimal(lot.rejectedQuantity).toNumber(),
        reservedQuantity: decimal(lot.reservedQuantity).toNumber(),
        unit: lot.unit,
        unitCost: decimal(lot.unitCost).toFixed(6),
        manufacturedAt: lot.manufacturedAt?.toISOString() ?? null,
        retestDueAt: lot.retestDueAt?.toISOString() ?? null,
        expiresAt: lot.expiresAt?.toISOString() ?? null,
      })),
      locations: locations.map((location) => ({
        id: location.id,
        warehouseId: location.warehouseId,
        warehouse: `${location.warehouse.code} - ${location.warehouse.name}`,
        code: location.code,
        name: location.name,
        disposition: location.disposition,
      })),
      qualityCases: qualityCases.map((record) => ({
        id: record.id,
        code: record.code,
        name: record.name,
        details: qualityCaseDetails(record.payload),
      })),
      requests: requests.map((review) => ({
        id: review.id,
        kind: Object.entries(WORKFLOW_CODES).find(
          ([, code]) => code === review.workflowCode,
        )?.[0] as MaterialExceptionKind,
        status: review.status,
        transactionDate: review.transactionDate.toISOString(),
        title: review.title,
        reason: review.reason,
        note: review.note,
        input: requestInput(review),
        createdBy: review.createdBy,
        approvedBy: review.approvedBy,
        approvedAt: review.approvedAt?.toISOString() ?? null,
      })),
      retestActions: retestActions.map((review) => {
        const evidence = object(review.evidence);
        return {
          id: review.id,
          inventoryLotId: review.entityId,
          transactionDate: review.transactionDate.toISOString(),
          reason: review.reason,
          previousRetestDueAt: clean(evidence.previousRetestDueAt) ?? null,
          retestDueAt: clean(evidence.retestDueAt) ?? null,
          qualityCaseId: clean(evidence.qualityCaseId) ?? null,
          qualityCaseCode: clean(evidence.qualityCaseCode) ?? null,
          createdBy: review.createdBy,
          approvedBy: review.approvedBy,
          approvedAt: review.approvedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async retestInventoryLot(
    user: AuthenticatedRequestUser,
    rawLotId: string,
    dto: RetestManufacturingInventoryLotDto,
  ) {
    await this.requirePermission(user, "manufacturing.quality.manage");
    const scope = await this.scope(user, dto.workspaceId);
    const lotId = clean(rawLotId);
    const qualityCaseId = clean(dto.qualityCaseId);
    const reason = clean(dto.reason);
    if (!lotId || !qualityCaseId || !reason)
      throw new BadRequestException(
        "Inventory lot, approved quality case and reason are required.",
      );
    const when = asDate(dto.transactionDate, "transactionDate");
    const nextRetestDueAt = asDate(dto.retestDueAt, "retestDueAt");
    const fingerprint = hash({
      lotId,
      qualityCaseId,
      reason,
      transactionDate: when.toISOString(),
      retestDueAt: nextRetestDueAt.toISOString(),
    });
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
      const evidence = object(replay.evidence);
      if (
        replay.workflowCode !== "MATERIAL_LOT_RETEST_EXTENSION" ||
        replay.entityId !== lotId ||
        evidence.fingerprint !== fingerprint
      )
        throw new ConflictException(
          "Idempotency key is already used for a different manufacturing action.",
        );
      return {
        action: replay,
        lot: {
          id: lotId,
          retestDueAt: clean(evidence.retestDueAt),
        },
        replayed: true,
      };
    }

    const result = await this.serializable(async (tx) => {
      await this.assertPeriodOpen(tx, scope.id, when);
      const lot = await tx.manufacturingInventoryLot.findFirst({
        where: { id: lotId, workspaceId: scope.id },
        select: {
          id: true,
          lotNumber: true,
          inventoryItemId: true,
          manufacturedAt: true,
          retestDueAt: true,
          expiresAt: true,
          availableQuantity: true,
          holdQuantity: true,
          rejectedQuantity: true,
          updatedAt: true,
        },
      });
      if (!lot)
        throw new NotFoundException("Manufacturing inventory lot not found.");
      if (
        decimal(lot.availableQuantity)
          .add(lot.holdQuantity)
          .add(lot.rejectedQuantity)
          .lessThanOrEqualTo(0)
      )
        throw new BadRequestException(
          "A zero-balance inventory lot cannot receive a retest or extension action.",
        );
      const dateRule = materialLotRetestDateRule({
        actionDate: when,
        nextRetestDueAt,
        currentRetestDueAt: lot.retestDueAt,
        manufacturedAt: lot.manufacturedAt,
        expiresAt: lot.expiresAt,
      });
      if (!dateRule.allowed)
        throw new BadRequestException(dateRule.reason ?? "Retest date denied.");

      const qualityCase = await tx.manufacturingControlRecord.findFirst({
        where: {
          id: qualityCaseId,
          workspaceId: scope.id,
          kind: "QUALITY_CASE",
          status: "APPROVED",
          inventoryItemId: lot.inventoryItemId,
        },
        select: {
          id: true,
          code: true,
          payload: true,
          inventoryItemId: true,
          createdByUserId: true,
          approvedByUserId: true,
          approvedAt: true,
        },
      });
      if (!qualityCase)
        throw new BadRequestException(
          "An approved CHANGE_CONTROL quality case for this exact inventory item is required.",
        );
      const details = qualityCaseDetails(qualityCase.payload);
      if (
        clean(details.caseType)?.toUpperCase() !== "CHANGE_CONTROL" ||
        !["APPROVED", "CLOSED", "RESOLVED"].includes(
          clean(details.state)?.toUpperCase() ?? "",
        )
      )
        throw new BadRequestException(
          "Lot retest or extension requires an approved/resolved CHANGE_CONTROL case.",
        );
      if (
        clean(details.inventoryItemId) !== lot.inventoryItemId ||
        qualityCase.inventoryItemId !== lot.inventoryItemId
      )
        throw new BadRequestException(
          "The CHANGE_CONTROL case must be linked to this exact inventory item.",
        );
      if (
        !qualityCaseReferencesExactLot(
          details.sourceReference,
          lot.id,
          lot.lotNumber,
        )
      )
        throw new BadRequestException(
          "The CHANGE_CONTROL source reference must exactly equal this inventory-lot ID or lot number.",
        );
      if (
        !qualityCase.approvedByUserId ||
        !qualityCase.approvedAt ||
        qualityCase.createdByUserId === qualityCase.approvedByUserId
      )
        throw new BadRequestException(
          "The CHANGE_CONTROL case must contain completed maker-checker approval evidence.",
        );
      if (qualityCase.approvedAt > when)
        throw new BadRequestException(
          "The retest action date cannot precede quality-case approval.",
        );
      const caseApproval = await tx.manufacturingWorkflowReview.findFirst({
        where: {
          workspaceId: scope.id,
          workflowCode: "GOVERNANCE_RECORD_APPROVE",
          entityId: qualityCase.id,
          status: "APPROVED",
          approvedByUserId: qualityCase.approvedByUserId,
          signatureHash: { not: null },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!caseApproval)
        throw new BadRequestException(
          "The approved CHANGE_CONTROL case has no immutable electronic-signature approval evidence.",
        );
      const caseUsage = await tx.manufacturingWorkflowReview.findFirst({
        where: {
          workspaceId: scope.id,
          workflowCode: "MATERIAL_LOT_RETEST_EXTENSION",
          entityType: `MATERIAL_LOT_RETEST_CASE:${qualityCase.id}`,
        },
        select: { id: true },
      });
      if (caseUsage)
        throw new ConflictException(
          "This CHANGE_CONTROL case has already been consumed by a retest/extension action.",
        );

      const updated = await tx.manufacturingInventoryLot.updateMany({
        where: { id: lot.id, updatedAt: lot.updatedAt },
        data: { retestDueAt: nextRetestDueAt },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          "Inventory-lot control dates changed concurrently. Refresh and try again.",
        );
      const action = await tx.manufacturingWorkflowReview.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          workflowGroup: "MATERIALS_DISPENSING",
          workflowCode: "MATERIAL_LOT_RETEST_EXTENSION",
          entityType: `MATERIAL_LOT_RETEST_CASE:${qualityCase.id}`,
          entityId: lot.id,
          transactionDate: when,
          idempotencyKey: dto.idempotencyKey,
          title: `Retest/extension ${lot.lotNumber}`,
          outcome: "EXECUTED",
          status: "APPROVED",
          reason,
          evidence: {
            schemaVersion: 1,
            fingerprint,
            inventoryLotId: lot.id,
            lotNumber: lot.lotNumber,
            inventoryItemId: lot.inventoryItemId,
            previousRetestDueAt: lot.retestDueAt?.toISOString() ?? null,
            retestDueAt: nextRetestDueAt.toISOString(),
            expiresAt: lot.expiresAt?.toISOString() ?? null,
            qualityCaseId: qualityCase.id,
            qualityCaseCode: qualityCase.code,
            qualityCaseApprovalReviewId: caseApproval.id,
            qualityCaseSignatureHash: caseApproval.signatureHash,
          } as Prisma.InputJsonValue,
          signatureHash: hash({
            lotId: lot.id,
            qualityCaseId: qualityCase.id,
            qualityCaseSignatureHash: caseApproval.signatureHash,
            retestDueAt: nextRetestDueAt.toISOString(),
            userId: user.id,
          }),
          reviewedByUserId: user.id,
          reviewedAt: when,
          approvedByUserId: user.id,
          approvedAt: when,
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
          action: "MANUFACTURING_MATERIAL_LOT_RETEST_EXTENSION",
          entityType: "ManufacturingInventoryLot",
          entityId: lot.id,
          oldValues: {
            retestDueAt: lot.retestDueAt?.toISOString() ?? null,
          } as Prisma.InputJsonValue,
          newValues: {
            retestDueAt: nextRetestDueAt.toISOString(),
            qualityCaseId: qualityCase.id,
            workflowReviewId: action.id,
          } as Prisma.InputJsonValue,
        },
      });
      return {
        action,
        lot: { id: lot.id, retestDueAt: nextRetestDueAt.toISOString() },
      };
    });
    return { ...result, replayed: false };
  }

  private normalizeCreate(dto: CreateMaterialExceptionDto) {
    const quantity = exactQuantity(dto.quantity);
    const reason = clean(dto.reason);
    if (!reason) throw new BadRequestException("A control reason is required.");
    const input: MaterialExceptionInput = {
      kind: dto.kind,
      orderId: dto.orderId.trim(),
      sourceOrderMaterialId: clean(dto.sourceOrderMaterialId),
      substituteInventoryItemId: clean(dto.substituteInventoryItemId),
      inventoryLotId: clean(dto.inventoryLotId),
      destinationLocationId: clean(dto.destinationLocationId),
      qualityCaseId: clean(dto.qualityCaseId),
      quantity: quantity.toFixed(4),
      unit: clean(dto.unit),
      reason,
    };
    if (
      dto.kind === "ADDITIONAL_ISSUE" &&
      (!input.sourceOrderMaterialId || !input.inventoryLotId || !input.unit)
    )
      throw new BadRequestException(
        "Additional issue requires the source BOM material, an exact released inventory lot and stock unit.",
      );
    if (
      dto.kind === "SUBSTITUTION" &&
      (!input.sourceOrderMaterialId ||
        !input.substituteInventoryItemId ||
        !input.unit ||
        !input.qualityCaseId)
    )
      throw new BadRequestException(
        "Substitution requires source material, substitute item, unit and an approved CHANGE_CONTROL alternate-material mapping.",
      );
    if (
      dto.kind === "STATUS_TRANSFER" &&
      (!input.inventoryLotId || !input.destinationLocationId)
    )
      throw new BadRequestException(
        "Stock-status transfer requires source lot and destination location.",
      );
    if (
      dto.kind === "DESTRUCTION" &&
      (!input.inventoryLotId || !input.qualityCaseId)
    )
      throw new BadRequestException(
        "Destruction requires a rejected lot and approved destruction quality case.",
      );
    return input;
  }

  private async approvedQualityCase(
    tx: Prisma.TransactionClient,
    scope: Scope,
    input: MaterialExceptionInput,
    acceptedTypes: string[],
    inventoryItemId: string,
  ) {
    if (!input.qualityCaseId)
      throw new BadRequestException(
        `An approved ${acceptedTypes.join("/")} quality case is required.`,
      );
    const qualityCase = await tx.manufacturingControlRecord.findFirst({
      where: {
        id: input.qualityCaseId,
        workspaceId: scope.id,
        kind: "QUALITY_CASE",
        status: "APPROVED",
      },
    });
    if (!qualityCase)
      throw new BadRequestException("Approved quality case not found.");
    const details = qualityCaseDetails(qualityCase.payload);
    const caseType = clean(details.caseType)?.toUpperCase();
    const state = clean(details.state)?.toUpperCase();
    if (
      !acceptedTypes.includes(caseType ?? "") ||
      !["APPROVED", "CLOSED", "RESOLVED"].includes(state ?? "")
    )
      throw new BadRequestException(
        `Quality case must be an approved/resolved ${acceptedTypes.join(" or ")} case.`,
      );
    const linkedOrderId =
      clean(details.orderId) ?? clean(details.productionOrderId);
    if (linkedOrderId !== input.orderId)
      throw new BadRequestException(
        "Quality case must be linked to this exact production order.",
      );
    if (clean(details.inventoryItemId) !== inventoryItemId)
      throw new BadRequestException(
        "Quality case must be linked to this exact inventory item.",
      );
    return { qualityCase, details };
  }

  async createRequest(
    user: AuthenticatedRequestUser,
    dto: CreateMaterialExceptionDto,
  ) {
    await this.requirePermission(user, "manufacturing.material.issue");
    const scope = await this.scope(user, dto.workspaceId);
    const when = asDate(dto.transactionDate, "transactionDate");
    const input = this.normalizeCreate(dto);
    const fingerprint = hash(input);
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
      const evidence = object(replay.evidence);
      if (
        replay.workflowCode !== WORKFLOW_CODES[dto.kind] ||
        evidence.fingerprint !== fingerprint
      )
        throw new ConflictException(
          "Idempotency key is already used for a different material control.",
        );
      return { request: replay, replayed: true };
    }

    const order = await this.prisma.manufacturingOrder.findFirst({
      where: { id: input.orderId, workspaceId: scope.id },
      select: { id: true, orderNumber: true },
    });
    if (!order) throw new NotFoundException("Production order not found.");
    const request = await this.serializable(async (tx) => {
      await this.assertPeriodOpen(tx, scope.id, when);
      return tx.manufacturingWorkflowReview.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          orderId: order.id,
          workflowGroup: "MATERIALS_DISPENSING",
          workflowCode: WORKFLOW_CODES[dto.kind],
          entityType: `MATERIAL_${dto.kind}`,
          entityId:
            input.sourceOrderMaterialId ?? input.inventoryLotId ?? order.id,
          transactionDate: when,
          idempotencyKey: dto.idempotencyKey,
          title: `${dto.kind.replaceAll("_", " ")} for ${order.orderNumber}`,
          status: "PENDING",
          reason: input.reason,
          evidence: {
            schemaVersion: 1,
            fingerprint,
            input,
          } as Prisma.InputJsonValue,
          createdByUserId: user.id,
        },
      });
    });
    return { request, replayed: false };
  }

  private async executeAdditionalIssue(
    tx: Prisma.TransactionClient,
    scope: Scope,
    approver: AuthenticatedRequestUser,
    requesterUserId: string,
    reviewId: string,
    input: MaterialExceptionInput,
    when: Date,
  ) {
    const order = await tx.manufacturingOrder.findFirst({
      where: { id: input.orderId, workspaceId: scope.id },
      include: {
        materials: {
          include: {
            inventoryItem: { include: { manufacturingProfile: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException("Production order not found.");
    if (
      !["APPROVED", "RESERVED", "ISSUED", "IN_PRODUCTION"].includes(
        order.status,
      )
    )
      throw new BadRequestException(
        `Additional material cannot be authorized while the order is ${order.status}.`,
      );
    const source = order.materials.find(
      (material) => material.id === input.sourceOrderMaterialId,
    );
    if (!source || source.status === "CANCELLED")
      throw new NotFoundException("Active source order material not found.");
    const role = source.inventoryItem.manufacturingProfile?.role;
    if (
      !["RAW_MATERIAL", "INTERMEDIATE", "BULK", "CONSUMABLE"].includes(
        role ?? "",
      )
    )
      throw new BadRequestException(
        "Additional issue supports raw, intermediate, bulk and consumable materials only; packaging uses its dedicated issue workflow.",
      );
    const quantity = exactQuantity(input.quantity);
    const lot = await tx.manufacturingInventoryLot.findFirst({
      where: {
        id: input.inventoryLotId!,
        workspaceId: scope.id,
        inventoryItemId: source.inventoryItemId,
        warehouseId: order.issueWarehouseId,
      },
      include: { location: true },
    });
    if (
      !lot ||
      !lot.location?.isActive ||
      lot.location.disposition !== "RELEASED"
    )
      throw new BadRequestException(
        "Additional issue requires an active RELEASED source lot in the order issue warehouse.",
      );
    const authoritativeUnit = source.inventoryItem.unit.trim();
    if (
      source.unit.trim().toLowerCase() !== authoritativeUnit.toLowerCase() ||
      lot.unit.trim().toLowerCase() !== authoritativeUnit.toLowerCase() ||
      input.unit?.trim().toLowerCase() !== authoritativeUnit.toLowerCase()
    )
      throw new BadRequestException(
        `Additional issue must use the authoritative stock unit (${authoritativeUnit}).`,
      );
    if (
      decimal(lot.holdQuantity).greaterThan(0) ||
      decimal(lot.rejectedQuantity).greaterThan(0)
    )
      throw new BadRequestException(
        "Held or rejected lot balances cannot be authorized for additional issue.",
      );
    assertLotControlDateCurrent(lot, when);
    const allocatable = decimal(lot.availableQuantity).sub(
      lot.reservedQuantity,
    );
    if (allocatable.lessThan(quantity))
      throw new BadRequestException(
        `Inventory lot ${lot.lotNumber} has only ${Prisma.Decimal.max(allocatable, 0).toFixed(4)} ${lot.unit} allocatable.`,
      );

    const additionalMaterialId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingOrderMaterial:AdditionalIssue",
      reviewId,
    );
    const requisitionId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingTransaction:AdditionalIssueRequisition",
      reviewId,
    );
    const reservationId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingReservation:AdditionalIssue",
      reviewId,
    );
    const reservationLineId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingReservationLine:AdditionalIssue",
      reviewId,
    );
    const transactionLineId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingTransactionLine:AdditionalIssue",
      reviewId,
    );
    const issuedNumber = await issueManufacturingDocumentNumberTx(
      tx,
      scope,
      approver.id,
      {
        documentKind: "MATERIAL_REQUISITION",
        issuedAt: when,
        idempotencyKey: `MFG:${reviewId}:ADDITIONAL_ISSUE:MRQ:NUMBER`,
        entityType: "ManufacturingTransaction",
        entityId: requisitionId,
        validateIssuedAtOnReplay: true,
      },
    );
    const additionalMaterial = await tx.manufacturingOrderMaterial.create({
      data: {
        id: additionalMaterialId,
        orderId: order.id,
        inventoryItemId: source.inventoryItemId,
        status: "RESERVED",
        unit: authoritativeUnit,
        plannedQuantity: quantity,
        reservedQuantity: quantity,
        requiredDate: source.requiredDate,
        notes: `Approved additional issue ${reviewId}; original BOM/order material ${source.id} remains unchanged. ${input.reason}`,
      },
    });
    const reservation = await tx.manufacturingReservation.create({
      data: {
        id: reservationId,
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        reservationNumber: issuedNumber.documentNumber,
        orderId: order.id,
        warehouseId: order.issueWarehouseId,
        locationId: lot.locationId,
        reservedAt: when,
        createdByUserId: requesterUserId,
        lines: {
          create: {
            id: reservationLineId,
            orderMaterialId: additionalMaterial.id,
            inventoryItemId: source.inventoryItemId,
            inventoryLotId: lot.id,
            quantity,
            unit: authoritativeUnit,
          },
        },
      },
    });
    const requisition = await tx.manufacturingTransaction.create({
      data: {
        id: requisitionId,
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        transactionNumber: issuedNumber.documentNumber,
        transactionType: "MATERIAL_REQUISITION",
        status: "APPROVED",
        transactionDate: when,
        orderId: order.id,
        reservationId: reservation.id,
        fromWarehouseId: order.issueWarehouseId,
        fromLocationId: lot.locationId,
        referenceNo: order.orderNumber,
        notes: `Approved additional-material request ${reviewId}. ${input.reason}`,
        idempotencyKey: `MFG:${reviewId}:ADDITIONAL_ISSUE:MRQ`,
        createdByUserId: requesterUserId,
        submittedAt: when,
        approvedAt: when,
        lines: {
          create: {
            id: transactionLineId,
            inventoryItemId: source.inventoryItemId,
            orderMaterialId: additionalMaterial.id,
            sourceInventoryLotId: lot.id,
            quantity,
            unit: authoritativeUnit,
            notes: `Exact lot authorized by additional issue ${reviewId}`,
          },
        },
      },
    });
    const lotReservation = await tx.manufacturingInventoryLot.updateMany({
      where: {
        id: lot.id,
        availableQuantity: { gte: quantity },
        reservedQuantity: {
          lte: decimal(lot.availableQuantity).sub(quantity),
        },
        holdQuantity: 0,
        rejectedQuantity: 0,
      },
      data: { reservedQuantity: { increment: quantity } },
    });
    if (lotReservation.count !== 1)
      throw new ConflictException(
        "Source-lot allocatable balance changed. Refresh and request approval again.",
      );
    const allExistingMaterialsCovered = order.materials
      .filter((material) => material.status !== "CANCELLED")
      .every((material) =>
        decimal(material.issuedQuantity)
          .add(material.reservedQuantity)
          .greaterThanOrEqualTo(material.plannedQuantity),
      );
    if (order.status === "APPROVED" && allExistingMaterialsCovered)
      await tx.manufacturingOrder.update({
        where: { id: order.id },
        data: { status: "RESERVED" },
      });
    return {
      originalOrderMaterialId: source.id,
      additionalOrderMaterialId: additionalMaterial.id,
      inventoryLotId: lot.id,
      lotNumber: lot.lotNumber,
      quantity: quantity.toFixed(4),
      unit: authoritativeUnit,
      requisitionId: requisition.id,
      requisitionNumber: requisition.transactionNumber,
      reservationId: reservation.id,
      bomSnapshotPreserved: true,
      stockMovementPosted: false,
      journalPosted: false,
      nextStep: "STAGE_AND_POST_STANDARD_MATERIAL_ISSUE",
    };
  }

  private async executeSubstitution(
    tx: Prisma.TransactionClient,
    scope: Scope,
    user: AuthenticatedRequestUser,
    reviewId: string,
    input: MaterialExceptionInput,
  ) {
    const order = await tx.manufacturingOrder.findFirst({
      where: { id: input.orderId, workspaceId: scope.id },
      include: {
        materials: {
          include: { bomComponent: true },
        },
      },
    });
    if (!order) throw new NotFoundException("Production order not found.");
    if (!["DRAFT", "SUBMITTED", "APPROVED"].includes(order.status))
      throw new BadRequestException(
        "Material substitution is allowed only before reservation and issue.",
      );
    const source = order.materials.find(
      (material) => material.id === input.sourceOrderMaterialId,
    );
    if (!source)
      throw new NotFoundException("Source order material not found.");
    if (!source.bomComponent?.allowSubstitute)
      throw new BadRequestException(
        "The approved BOM snapshot does not allow substitution for this component.",
      );
    if (
      [
        source.reservedQuantity,
        source.issuedQuantity,
        source.returnedQuantity,
        source.consumedQuantity,
        source.scrappedQuantity,
      ].some((value) => decimal(value).greaterThan(0))
    )
      throw new BadRequestException(
        "A reserved, issued, consumed, returned or scrapped material cannot be substituted. Amend or reverse the posted control first.",
      );
    if (source.inventoryItemId === input.substituteInventoryItemId)
      throw new BadRequestException(
        "Substitute item must be different from the source item.",
      );
    const substitute = await tx.inventoryItem.findFirst({
      where: {
        id: input.substituteInventoryItemId!,
        workspaceId: scope.id,
        status: "ACTIVE",
        manufacturingProfile: {
          is: {
            isActive: true,
            role: {
              in: [
                "RAW_MATERIAL",
                "PACKAGING_MATERIAL",
                "INTERMEDIATE",
                "BULK",
                "CONSUMABLE",
              ],
            },
          },
        },
      },
      select: { id: true, itemCode: true, itemName: true, unit: true },
    });
    if (!substitute)
      throw new BadRequestException(
        "Substitute must be an active manufacturing material.",
      );
    const authorization = await this.approvedQualityCase(
      tx,
      scope,
      input,
      ["CHANGE_CONTROL"],
      source.inventoryItemId,
    );
    if (
      clean(authorization.details.bomVersionId) !== order.bomVersionId ||
      clean(authorization.details.bomComponentId) !== source.bomComponentId ||
      clean(authorization.details.approvedSubstituteInventoryItemId) !==
        substitute.id
    )
      throw new BadRequestException(
        "The approved CHANGE_CONTROL case must explicitly map this BOM version/component to the selected substitute item.",
      );
    const quantity = exactQuantity(input.quantity);
    const approvedQuantity = exactJsonQuantity(
      authorization.details.approvedSubstituteQuantity,
      "Approved substitute quantity",
    );
    const approvedUnit = clean(authorization.details.approvedSubstituteUnit);
    if (
      !approvedQuantity.equals(quantity) ||
      !approvedUnit ||
      approvedUnit.toLowerCase() !== substitute.unit.trim().toLowerCase() ||
      input.unit?.trim().toLowerCase() !== substitute.unit.trim().toLowerCase()
    )
      throw new BadRequestException(
        `The CHANGE_CONTROL case must authorize exactly ${quantity.toFixed(4)} ${substitute.unit}, and the request must use that authoritative stock unit.`,
      );
    const existing = order.materials.find(
      (material) =>
        material.inventoryItemId === substitute.id &&
        material.status !== "CANCELLED",
    );
    if (existing)
      throw new ConflictException(
        "The substitute item already exists in this production-order snapshot.",
      );
    const created = await tx.manufacturingOrderMaterial.create({
      data: {
        orderId: order.id,
        bomComponentId: source.bomComponentId,
        inventoryItemId: substitute.id,
        status: "PLANNED",
        unit: input.unit!,
        plannedQuantity: quantity,
        requiredDate: source.requiredDate,
        notes: `Controlled substitution ${reviewId}; replaces ${source.id}. ${input.reason}`,
      },
    });
    await tx.manufacturingOrderMaterial.update({
      where: { id: source.id },
      data: {
        status: "CANCELLED",
        notes: `${clean(source.notes) ? `${source.notes}\n` : ""}Replaced by ${created.id} under controlled substitution ${reviewId}.`,
      },
    });
    return {
      sourceOrderMaterialId: source.id,
      substituteOrderMaterialId: created.id,
      substituteInventoryItemId: substitute.id,
      substituteItem: `${substitute.itemCode} - ${substitute.itemName}`,
      quantity: quantity.toFixed(4),
      unit: input.unit!,
      bomSnapshotPreserved: true,
      authorizationQualityCaseId: authorization.qualityCase.id,
      authorizationQualityCaseCode: authorization.qualityCase.code,
    };
  }

  private async executeStatusTransfer(
    tx: Prisma.TransactionClient,
    scope: Scope,
    user: AuthenticatedRequestUser,
    reviewId: string,
    input: MaterialExceptionInput,
    when: Date,
  ) {
    const lot = await tx.manufacturingInventoryLot.findFirst({
      where: {
        id: input.inventoryLotId!,
        workspaceId: scope.id,
        companyId: scope.companyId,
      },
      include: { location: true, warehouse: true },
    });
    if (
      !lot ||
      !lot.location?.isActive ||
      lot.location.companyId !== scope.companyId ||
      lot.location.workspaceId !== scope.id ||
      lot.location.warehouseId !== lot.warehouseId ||
      !lot.warehouse.isActive ||
      lot.warehouse.deletedAt ||
      lot.warehouse.companyId !== scope.companyId ||
      lot.warehouse.workspaceId !== scope.id ||
      ![
        "GENERAL",
        "RAW_MATERIAL",
        "WIP",
        "FINISHED_GOODS",
        "REJECTED",
        "SCRAP",
      ].includes(lot.warehouse.type)
    )
      throw new NotFoundException(
        "Source lot requires an active same-company manufacturing warehouse and controlled location.",
      );
    assertLotControlDateCurrent(lot, when);
    const linkedMaterial = await tx.manufacturingOrderMaterial.findFirst({
      where: {
        orderId: input.orderId,
        inventoryItemId: lot.inventoryItemId,
        order: { workspaceId: scope.id },
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    });
    if (!linkedMaterial)
      throw new BadRequestException(
        "Source lot item is not part of the selected production-order material snapshot.",
      );
    const destination = await tx.manufacturingLocation.findFirst({
      where: {
        id: input.destinationLocationId!,
        workspaceId: scope.id,
        companyId: scope.companyId,
        warehouseId: lot.warehouseId,
        isActive: true,
      },
    });
    if (!destination)
      throw new BadRequestException(
        "Destination must be an active controlled location in the same warehouse.",
      );
    if (destination.id === lot.locationId)
      throw new BadRequestException(
        "Source and destination locations must be different.",
      );
    const sourceDisposition = lot.location.disposition;
    const destinationDisposition = destination.disposition;
    const transition = materialStatusTransferRule(
      sourceDisposition,
      destinationDisposition,
    );
    if (!transition.allowed)
      throw new BadRequestException(
        transition.reason ?? "Status transfer denied.",
      );
    let statusAuthorization: {
      qualityCase: { id: string; code: string };
      details: Record<string, unknown>;
    } | null = null;
    if (transition.requiresQualityCase)
      statusAuthorization = await this.approvedQualityCase(
        tx,
        scope,
        input,
        ["OOS", "OOT", "DEVIATION", "CAPA"],
        lot.inventoryItemId,
      );
    if (statusAuthorization) {
      const authorizedDisposition =
        clean(statusAuthorization.details.targetDisposition) ??
        clean(statusAuthorization.details.disposition);
      if (authorizedDisposition?.toUpperCase() !== destinationDisposition)
        throw new BadRequestException(
          `The quality case must explicitly authorize disposition ${destinationDisposition}.`,
        );
    }
    const sourceBucket = bucketForDisposition(lot.location.disposition);
    const destinationBucket = bucketForDisposition(destination.disposition);
    const quantity = exactQuantity(input.quantity);
    if (decimal(lot[sourceBucket]).lessThan(quantity))
      throw new BadRequestException(
        `Lot has insufficient ${lot.location.disposition.toLowerCase().replaceAll("_", " ")} quantity.`,
      );
    if (
      sourceBucket === "availableQuantity" &&
      decimal(lot.availableQuantity)
        .sub(lot.reservedQuantity)
        .lessThan(quantity)
    )
      throw new BadRequestException(
        "Reserved stock cannot be moved by a stock-status transfer.",
      );
    const suffix = reviewId.replaceAll("-", "").slice(0, 8).toUpperCase();
    const childLotNumber = `${lot.lotNumber}-STS-${suffix}`.slice(0, 120);
    const child = await tx.manufacturingInventoryLot.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        inventoryItemId: lot.inventoryItemId,
        warehouseId: lot.warehouseId,
        locationId: destination.id,
        lotNumber: childLotNumber,
        receivedQuantity: quantity,
        availableQuantity:
          destinationBucket === "availableQuantity" ? quantity : 0,
        holdQuantity: destinationBucket === "holdQuantity" ? quantity : 0,
        rejectedQuantity:
          destinationBucket === "rejectedQuantity" ? quantity : 0,
        unit: lot.unit,
        unitCost: lot.unitCost,
        manufacturedAt: lot.manufacturedAt,
        retestDueAt: lot.retestDueAt,
        expiresAt: lot.expiresAt,
        createdByUserId: user.id,
      },
    });
    const updated = await tx.manufacturingInventoryLot.updateMany({
      where: { id: lot.id, [sourceBucket]: { gte: quantity } },
      data: { [sourceBucket]: { decrement: quantity } },
    });
    if (updated.count !== 1)
      throw new ConflictException(
        "Source-lot status balance changed. Refresh and try again.",
      );
    await tx.manufacturingGenealogy.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        orderId: input.orderId,
        parentInventoryLotId: lot.id,
        childInventoryLotId: child.id,
        relationshipType: `STATUS_${lot.location.disposition}_TO_${destination.disposition}`,
        quantity,
        unit: lot.unit,
        createdByUserId: user.id,
      },
    });
    return {
      sourceInventoryLotId: lot.id,
      destinationInventoryLotId: child.id,
      destinationLotNumber: child.lotNumber,
      fromLocationId: lot.locationId,
      toLocationId: destination.id,
      fromDisposition: lot.location.disposition,
      toDisposition: destination.disposition,
      quantity: quantity.toFixed(4),
      unit: lot.unit,
      stockMovementPosted: false,
      journalPosted: false,
      authorizationQualityCaseId: statusAuthorization?.qualityCase.id ?? null,
      authorizationQualityCaseCode:
        statusAuthorization?.qualityCase.code ?? null,
    };
  }

  private async executeDestruction(
    tx: Prisma.TransactionClient,
    scope: Scope,
    user: AuthenticatedRequestUser,
    reviewId: string,
    input: MaterialExceptionInput,
    when: Date,
  ) {
    const lot = await tx.manufacturingInventoryLot.findFirst({
      where: {
        id: input.inventoryLotId!,
        workspaceId: scope.id,
        companyId: scope.companyId,
      },
      include: {
        location: true,
        warehouse: true,
        inventoryItem: { include: { manufacturingProfile: true } },
      },
    });
    if (
      !lot ||
      !lot.location?.isActive ||
      lot.location.companyId !== scope.companyId ||
      lot.location.workspaceId !== scope.id ||
      lot.location.warehouseId !== lot.warehouseId ||
      lot.location.disposition !== "REJECTED" ||
      !lot.warehouse.isActive ||
      lot.warehouse.deletedAt ||
      lot.warehouse.companyId !== scope.companyId ||
      lot.warehouse.workspaceId !== scope.id ||
      !["REJECTED", "GENERAL"].includes(lot.warehouse.type)
    )
      throw new BadRequestException(
        "Only stock in an active same-company REJECTED manufacturing location and eligible warehouse can be destroyed.",
      );
    assertLotControlDateCurrent(lot, when);
    const linkedMaterial = await tx.manufacturingOrderMaterial.findFirst({
      where: {
        orderId: input.orderId,
        inventoryItemId: lot.inventoryItemId,
        order: { workspaceId: scope.id },
      },
      select: { id: true },
    });
    if (!linkedMaterial)
      throw new BadRequestException(
        "Rejected lot item is not part of the selected production-order material snapshot.",
      );
    const quantity = exactQuantity(input.quantity);
    if (decimal(lot.rejectedQuantity).lessThan(quantity))
      throw new BadRequestException(
        "Destruction quantity exceeds the rejected lot balance.",
      );
    if (decimal(lot.reservedQuantity).greaterThan(0))
      throw new BadRequestException(
        "Reserved stock cannot be destroyed until the reservation is released.",
      );
    const authorization = await this.approvedQualityCase(
      tx,
      scope,
      input,
      ["DESTRUCTION"],
      lot.inventoryItemId,
    );
    const qualityCase = authorization.qualityCase;
    const details = authorization.details;
    if (clean(details.inventoryLotId) !== lot.id)
      throw new BadRequestException(
        "Destruction quality case must be linked to this exact rejected inventory lot.",
      );
    const settings = await tx.manufacturingSettings.findUnique({
      where: { workspaceId: scope.id },
    });
    const inventoryAccountId =
      lot.inventoryItem.manufacturingProfile?.role === "PACKAGING_MATERIAL"
        ? settings?.packagingInventoryAccountId
        : settings?.rawMaterialInventoryAccountId;
    if (!settings?.manufacturingVarianceAccountId || !inventoryAccountId)
      throw new BadRequestException(
        "Manufacturing variance/write-off and material inventory LEDGER mappings are required before destruction.",
      );
    const [writeOffAccount, inventoryAccount, fiscalYear] = await Promise.all([
      tx.account.findFirst({
        where: {
          id: settings.manufacturingVarianceAccountId,
          companyId: scope.companyId,
          status: "ACTIVE",
          level: "LEDGER",
          isControlAccount: false,
        },
      }),
      this.protectedInventoryControlLedger(
        tx,
        scope.companyId,
        inventoryAccountId,
        "Material inventory account",
      ),
      tx.fiscalYear.findFirst({
        where: {
          companyId: scope.companyId,
          status: "OPEN",
          startDate: { lte: when },
          endDate: { gte: when },
        },
        orderBy: { startDate: "desc" },
      }),
    ]);
    if (!writeOffAccount || !inventoryAccount)
      throw new BadRequestException(
        "Destruction mappings must reference a same-company active non-control write-off LEDGER and the protected Inventory Control ledger.",
      );
    if (writeOffAccount.id === inventoryAccount.id)
      throw new BadRequestException(
        "Write-off and inventory accounts must be different.",
      );
    if (!fiscalYear)
      throw new BadRequestException(
        "Destruction date must be inside an open fiscal year.",
      );
    const movement = await tx.stockMovement.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        warehouseId: lot.warehouseId,
        inventoryItemId: lot.inventoryItemId,
        transactionType: "MANUFACTURING_MATERIAL_DESTRUCTION",
        transactionId: reviewId,
        transactionLineId: lot.id,
        referenceNo: qualityCase.code,
        movementType: "OUT",
        quantity,
        unit: lot.unit,
        transactionDate: when,
        postedByUserId: user.id,
        idempotencyKey: `MFG:${reviewId}:DESTRUCTION:OUT`,
      },
    });
    const costing = await rebuildMovingAverageCosts(tx, scope.id, [
      lot.inventoryItemId,
    ]);
    const costed = costing.movements.find((row) => row.id === movement.id);
    if (!costed)
      throw new BadRequestException(
        "Unable to derive the exact moving-average destruction cost.",
      );
    await this.requireInventoryService().reconcileMovingAverageLedger(
      tx,
      scope.id,
      costing.movements,
      user.id,
    );
    const amount = roundMoneyDecimal(costed.movementValue);
    if (amount.isNegative())
      throw new BadRequestException("Destruction write-off amount is invalid.");
    const voucherNumber = `JV-MD-${reviewId.replaceAll("-", "").slice(0, 20).toUpperCase()}`;
    const voucher = await tx.voucherEntry.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        createdByUserId: user.id,
        voucherType: "JOURNAL",
        documentKind: "MANUFACTURING_MATERIAL_DESTRUCTION",
        voucherNumber,
        voucherDate: when,
        partyName: "Manufacturing",
        reference: qualityCase.code,
        narration: `Controlled destruction of rejected lot ${lot.lotNumber}: ${input.reason}`,
        status: "POSTED",
        totalAmount: amount,
        debit: amount,
        credit: amount,
        currency: settings.currency,
        fiscalYearId: fiscalYear.id,
        sourceType: "MANUFACTURING_MATERIAL_DESTRUCTION",
        sourceId: reviewId,
        approvedByUserId: user.id,
        approvedAt: when,
        postedAt: when,
        idempotencyKey: `MFG:${reviewId}:DESTRUCTION:GL`,
        lines: {
          create: [
            {
              accountId: writeOffAccount.id,
              ledger: writeOffAccount.name,
              description: `Rejected material write-off ${lot.lotNumber}`,
              debit: amount,
              credit: 0,
            },
            {
              accountId: inventoryAccount.id,
              ledger: inventoryAccount.name,
              description: `Rejected inventory removed ${lot.lotNumber}`,
              debit: 0,
              credit: amount,
            },
          ],
        },
      },
    });
    const updated = await tx.manufacturingInventoryLot.updateMany({
      where: { id: lot.id, rejectedQuantity: { gte: quantity } },
      data: { rejectedQuantity: { decrement: quantity } },
    });
    if (updated.count !== 1)
      throw new ConflictException(
        "Rejected-lot balance changed. Refresh and try again.",
      );
    return {
      inventoryLotId: lot.id,
      lotNumber: lot.lotNumber,
      qualityCaseId: qualityCase.id,
      qualityCaseCode: qualityCase.code,
      quantity: quantity.toFixed(4),
      unit: lot.unit,
      stockMovementId: movement.id,
      voucherEntryId: voucher.id,
      writeOffAmount: amount.toFixed(2),
      hardDeleted: false,
    };
  }

  async decideRequest(
    user: AuthenticatedRequestUser,
    requestId: string,
    dto: DecideMaterialExceptionDto,
  ) {
    const scope = await this.scope(user, dto.workspaceId);
    const when = asDate(dto.transactionDate, "transactionDate");
    await this.assertPeriodOpen(this.prisma, scope.id, when);
    const current = await this.prisma.manufacturingWorkflowReview.findFirst({
      where: {
        id: requestId,
        workspaceId: scope.id,
        workflowCode: { in: Object.values(WORKFLOW_CODES) },
      },
    });
    if (!current)
      throw new NotFoundException("Material control request not found.");
    const input = requestInput(current);
    const permission =
      input.kind === "SUBSTITUTION" ||
      input.kind === "STATUS_TRANSFER" ||
      input.kind === "DESTRUCTION"
        ? "manufacturing.quality.release"
        : "manufacturing.order.approve";
    await this.requirePermission(user, permission);
    const replay = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (replay) {
      const replayEvidence = object(replay.evidence);
      if (
        replay.workflowCode !== `MATERIAL_CONTROL_${dto.action}` ||
        replayEvidence.requestId !== requestId ||
        replayEvidence.action !== dto.action
      )
        throw new ConflictException(
          "Idempotency key is already used for a different material decision.",
        );
      return { decision: replay, replayed: true };
    }

    const decision = await this.serializable(async (tx) => {
      await this.assertPeriodOpen(tx, scope.id, when);
      const locked = await tx.manufacturingWorkflowReview.findFirst({
        where: { id: requestId, workspaceId: scope.id },
      });
      if (!locked || locked.status !== "PENDING")
        throw new ConflictException(
          "Material control request state changed. Refresh and try again.",
        );
      const settings = await tx.manufacturingSettings.findUnique({
        where: { workspaceId: scope.id },
        select: { electronicSignatureRequired: true },
      });
      if (locked.createdByUserId === user.id)
        throw new ForbiddenException(
          "Maker-checker is mandatory; the requester cannot decide this material control.",
        );
      const electronicSignature = await this.electronicSignature.enforce(tx, {
        scope,
        user,
        actionLabel: `${dto.action.toLowerCase()} ${input.kind.toLowerCase().replaceAll("_", " ")}`,
        signatureMeaning: dto.signatureMeaning,
        reauthenticationPassword: dto.reauthenticationPassword,
        required: Boolean(settings?.electronicSignatureRequired),
      });
      let result: Record<string, unknown> | null = null;
      if (dto.action === "APPROVE") {
        if (input.kind === "ADDITIONAL_ISSUE")
          result = await this.executeAdditionalIssue(
            tx,
            scope,
            user,
            locked.createdByUserId,
            requestId,
            input,
            when,
          );
        else if (input.kind === "SUBSTITUTION")
          result = await this.executeSubstitution(
            tx,
            scope,
            user,
            requestId,
            input,
          );
        else if (input.kind === "STATUS_TRANSFER")
          result = await this.executeStatusTransfer(
            tx,
            scope,
            user,
            requestId,
            input,
            when,
          );
        else
          result = await this.executeDestruction(
            tx,
            scope,
            user,
            requestId,
            input,
            when,
          );
      }
      await tx.manufacturingWorkflowReview.update({
        where: { id: locked.id },
        data: {
          status: dto.action === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedByUserId: user.id,
          reviewedAt: when,
          approvedByUserId: dto.action === "APPROVE" ? user.id : null,
          approvedAt: dto.action === "APPROVE" ? when : null,
          note: dto.reason.trim(),
          signatureHash: hash({
            requestId,
            action: dto.action,
            signatureMeaning: dto.signatureMeaning.trim(),
            userId: user.id,
            transactionDate: when.toISOString(),
          }),
        },
      });
      const approval = await tx.manufacturingWorkflowReview.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          orderId: input.orderId,
          workflowGroup: "MATERIALS_DISPENSING",
          workflowCode: `MATERIAL_CONTROL_${dto.action}`,
          entityType: "MATERIAL_CONTROL_REQUEST",
          entityId: requestId,
          transactionDate: when,
          idempotencyKey: dto.idempotencyKey,
          title: `${dto.action} ${locked.title}`,
          outcome: "EXECUTED",
          status: "APPROVED",
          reason: dto.reason.trim(),
          evidence: {
            schemaVersion: 1,
            requestId,
            action: dto.action,
            input,
            result,
            electronicSignature,
          } as Prisma.InputJsonValue,
          signatureHash: hash({
            requestId,
            action: dto.action,
            userId: user.id,
            result,
          }),
          reviewedByUserId: user.id,
          reviewedAt: when,
          approvedByUserId: user.id,
          approvedAt: when,
          createdByUserId: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          userId: user.id,
          action: `MANUFACTURING_MATERIAL_${input.kind}_${dto.action}`,
          entityType: "ManufacturingWorkflowReview",
          entityId: requestId,
          oldValues: { status: locked.status } as Prisma.InputJsonValue,
          newValues: {
            status: dto.action === "APPROVE" ? "APPROVED" : "REJECTED",
            result,
            decisionReviewId: approval.id,
          } as Prisma.InputJsonValue,
        },
      });
      return approval;
    });
    return { decision, replayed: false };
  }
}
