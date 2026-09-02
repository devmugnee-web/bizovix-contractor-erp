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
import { Prisma } from "../generated/prisma/index.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { rebuildMovingAverageCosts } from "../inventory/moving-average.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { manufacturingEntityIdFromIdempotency } from "./manufacturing-document-number.js";
import { parseManufacturingElectronicSignaturePolicy } from "./manufacturing-electronic-signature.domain.js";
import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import {
  executionTransferLotNumber,
  isExecutionTransferDestinationAllowed,
  isExecutionTransferItemRoleAllowed,
  isExecutionTransferOrderStateAllowed,
  isExecutionTransferSourceDispositionAllowed,
  resolveExecutionTransferQuantity,
  shouldMoveWholeExecutionLot,
  type ManufacturingExecutionTransferKind,
} from "./manufacturing-execution-transfer.domain.js";
import type { PostManufacturingExecutionTransferDto } from "./manufacturing-execution-transfer.dto.js";

type Scope = { id: string; tenantId: string; companyId: string };
type Db = Prisma.TransactionClient | PrismaService;

const EXECUTION_TRANSFER_INCLUDE = {
  order: { select: { orderNumber: true } },
  orderLot: { select: { lotNumber: true } },
  operationExecution: {
    include: { routingOperation: { select: { code: true } } },
  },
  fromWarehouse: { select: { name: true } },
  toWarehouse: { select: { name: true } },
  fromLocation: { select: { name: true } },
  toLocation: { select: { name: true } },
  postedBy: { select: { name: true } },
  lines: {
    include: {
      inventoryItem: { select: { itemCode: true, itemName: true } },
      sourceInventoryLot: { select: { lotNumber: true } },
      destinationInventoryLot: { select: { lotNumber: true } },
    },
  },
} satisfies Prisma.ManufacturingTransactionInclude;

type ExecutionTransferRecord = Prisma.ManufacturingTransactionGetPayload<{
  include: typeof EXECUTION_TRANSFER_INCLUDE;
}> & {
  workflowReview?: {
    workflowCode: string;
    evidence: Prisma.JsonValue | null;
  } | null;
};

function decimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function date(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new BadRequestException(`${label} is invalid.`);
  return parsed;
}

function hash(parts: unknown[]) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"), "utf8")
    .digest("hex");
}

function evidenceRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function sourceClassification(
  transaction: {
    transactionType: string;
    idempotencyKey: string;
    operationExecutionId: string | null;
  },
  transferEvidence?: Prisma.JsonValue | null,
) {
  if (transaction.transactionType === "PRODUCTION_RECEIPT") {
    return {
      stockBacked: true,
      classification: "STOCK_BACKED_PRODUCTION_RECEIPT",
      sourceOperationExecutionId: transaction.operationExecutionId,
    } as const;
  }
  if (transaction.idempotencyKey.startsWith("MFG:OPERATION-WIP:")) {
    return {
      stockBacked: false,
      classification: "OPERATION_OUTPUT_CONTROL_LOT",
      sourceOperationExecutionId: transaction.operationExecutionId,
    } as const;
  }
  const evidence = evidenceRecord(transferEvidence);
  const inheritedOperationExecutionId =
    typeof evidence.sourceOperationExecutionId === "string"
      ? evidence.sourceOperationExecutionId
      : transaction.operationExecutionId;
  if (evidence.stockBacked === true) {
    return {
      stockBacked: true,
      classification: "STOCK_BACKED_TRANSFER_CHILD",
      sourceOperationExecutionId: inheritedOperationExecutionId,
    } as const;
  }
  return {
    stockBacked: false,
    classification: "CONTROL_LOT_TRANSFER_CHILD",
    sourceOperationExecutionId: inheritedOperationExecutionId,
  } as const;
}

function transferKind(
  value: string | undefined,
): ManufacturingExecutionTransferKind {
  if (value === "WIP_TRANSFER" || value === "BULK_PRODUCT_TRANSFER")
    return value;
  throw new BadRequestException(
    "kind must be WIP_TRANSFER or BULK_PRODUCT_TRANSFER.",
  );
}

@Injectable()
export class ManufacturingExecutionTransferService {
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
        "InventoryService is required for manufacturing transfer valuation reconciliation",
      );
    }
    return this.inventoryService;
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
        `Execution transfer is blocked because manufacturing period ${period.periodYear}-${String(period.periodMonth).padStart(2, "0")} is ${period.status}.`,
      );
  }

  private mapTransfer(row: ExecutionTransferRecord) {
    const review = row.workflowReview ?? null;
    const evidence =
      review?.evidence &&
      typeof review.evidence === "object" &&
      !Array.isArray(review.evidence)
        ? review.evidence
        : {};
    const line = row.lines?.[0] ?? null;
    return {
      id: row.id,
      transactionNumber: row.transactionNumber,
      kind:
        review?.workflowCode === "BULK_PRODUCT_TRANSFER"
          ? "BULK_PRODUCT_TRANSFER"
          : "WIP_TRANSFER",
      transactionDate: row.transactionDate,
      orderId: row.orderId,
      orderNumber: row.order?.orderNumber ?? null,
      orderLotId: row.orderLotId,
      orderLotNumber: row.orderLot?.lotNumber ?? null,
      operationExecutionId: row.operationExecutionId,
      operationCode: row.operationExecution?.routingOperation?.code ?? null,
      sourceInventoryLotId: line?.sourceInventoryLotId ?? null,
      sourceLotNumber: line?.sourceInventoryLot?.lotNumber ?? null,
      destinationInventoryLotId: line?.destinationInventoryLotId ?? null,
      destinationLotNumber: line?.destinationInventoryLot?.lotNumber ?? null,
      inventoryItemId: line?.inventoryItemId ?? null,
      itemCode: line?.inventoryItem?.itemCode ?? null,
      itemName: line?.inventoryItem?.itemName ?? null,
      fromWarehouseId: row.fromWarehouseId,
      fromWarehouseName: row.fromWarehouse?.name ?? null,
      toWarehouseId: row.toWarehouseId,
      toWarehouseName: row.toWarehouse?.name ?? null,
      fromLocationId: row.fromLocationId,
      fromLocationName: row.fromLocation?.name ?? null,
      toLocationId: row.toLocationId,
      toLocationName: row.toLocation?.name ?? null,
      quantity: line ? Number(line.quantity) : 0,
      unit: line?.unit ?? null,
      unitCost: line ? decimal(line.unitCost).toFixed(6) : "0.000000",
      totalCost: line ? decimal(line.totalCost).toFixed(6) : "0.000000",
      interWarehouse: row.fromWarehouseId !== row.toWarehouseId,
      note: row.notes,
      postedAt: row.postedAt,
      postedByUserId: row.postedByUserId,
      postedByName: row.postedBy?.name ?? null,
      stockMovementIds: Array.isArray(evidence.stockMovementIds)
        ? evidence.stockMovementIds
        : [],
    };
  }

  async getContext(
    user: AuthenticatedRequestUser,
    workspaceId?: string,
    requestedKind?: string,
  ) {
    const scope = await this.scope(user, workspaceId);
    const kind = transferKind(requestedKind);
    const [
      orders,
      locations,
      inventoryLots,
      settings,
      signatureRecord,
      reviews,
    ] = await Promise.all([
      this.prisma.manufacturingOrder.findMany({
        where: { workspaceId: scope.id },
        orderBy: [{ plannedStartDate: "desc" }, { createdAt: "desc" }],
        include: {
          finishedProduct: {
            select: { id: true, itemCode: true, itemName: true },
          },
          lots: { orderBy: { sequence: "asc" } },
          operationExecutions: {
            orderBy: { routingOperation: { sequence: "asc" } },
            include: {
              routingOperation: {
                select: { id: true, code: true, name: true, sequence: true },
              },
            },
          },
        },
      }),
      this.prisma.manufacturingLocation.findMany({
        where: {
          workspaceId: scope.id,
          isActive: true,
          warehouse: { isActive: true, deletedAt: null },
        },
        orderBy: [{ warehouse: { name: "asc" } }, { code: "asc" }],
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.manufacturingInventoryLot.findMany({
        where: {
          workspaceId: scope.id,
          OR: [{ availableQuantity: { gt: 0 } }, { holdQuantity: { gt: 0 } }],
        },
        orderBy: [{ createdAt: "desc" }, { lotNumber: "asc" }],
        include: {
          inventoryItem: {
            include: { manufacturingProfile: true },
          },
          warehouse: true,
          location: true,
          sourceTransactionLine: {
            include: {
              transaction: {
                include: {
                  order: {
                    select: { id: true, orderNumber: true, status: true },
                  },
                  orderLot: { select: { id: true, lotNumber: true } },
                },
              },
            },
          },
          serials: {
            where: { status: { notIn: ["CONSUMED", "SCRAPPED"] } },
            orderBy: { serialNumber: "asc" },
            select: { id: true, serialNumber: true, status: true },
          },
        },
      }),
      this.prisma.manufacturingSettings.findUnique({
        where: { workspaceId: scope.id },
        select: { electronicSignatureRequired: true },
      }),
      this.prisma.manufacturingControlRecord.findFirst({
        where: {
          workspaceId: scope.id,
          kind: "ELECTRONIC_SIGNATURE_POLICY",
          status: "APPROVED",
        },
        orderBy: [{ approvedAt: "desc" }, { versionNumber: "desc" }],
        select: { id: true, payload: true },
      }),
      this.prisma.manufacturingWorkflowReview.findMany({
        where: {
          workspaceId: scope.id,
          workflowCode: { in: ["WIP_TRANSFER", "BULK_PRODUCT_TRANSFER"] },
          entityType: "ManufacturingTransaction",
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { entityId: true, workflowCode: true, evidence: true },
      }),
    ]);

    const sourceTransactionIds = inventoryLots
      .map((lot) => lot.sourceTransactionLine?.transaction.id)
      .filter((id): id is string => Boolean(id));
    const sourceLineageReviews = sourceTransactionIds.length
      ? await this.prisma.manufacturingWorkflowReview.findMany({
          where: {
            workspaceId: scope.id,
            entityType: "ManufacturingTransaction",
            entityId: { in: sourceTransactionIds },
            workflowCode: { in: ["WIP_TRANSFER", "BULK_PRODUCT_TRANSFER"] },
          },
          select: { entityId: true, evidence: true },
        })
      : [];
    const sourceReviewEvidence = new Map(
      sourceLineageReviews
        .filter((review): review is typeof review & { entityId: string } =>
          Boolean(review.entityId),
        )
        .map((review) => [review.entityId, review.evidence]),
    );

    const eligibleOrders = orders.filter((order) =>
      isExecutionTransferOrderStateAllowed(kind, order.status),
    );
    const eligibleOrderIds = new Set(eligibleOrders.map((order) => order.id));
    const sourceLots = inventoryLots.flatMap((lot) => {
      const sourceTransaction = lot.sourceTransactionLine?.transaction;
      const role = lot.inventoryItem.manufacturingProfile?.role ?? null;
      const resolved = resolveExecutionTransferQuantity(lot);
      if (
        !sourceTransaction ||
        !sourceTransaction.orderLotId ||
        !eligibleOrderIds.has(sourceTransaction.orderId) ||
        !lot.location?.isActive ||
        !lot.warehouse.isActive ||
        lot.warehouse.deletedAt ||
        !isExecutionTransferItemRoleAllowed(kind, role) ||
        !isExecutionTransferSourceDispositionAllowed(
          kind,
          lot.location.disposition,
        ) ||
        resolved.quantity.lessThanOrEqualTo(0)
      )
        return [];
      const classification = sourceClassification(
        sourceTransaction,
        sourceReviewEvidence.get(sourceTransaction.id),
      );
      return [
        {
          id: lot.id,
          lotNumber: lot.lotNumber,
          inventoryItemId: lot.inventoryItemId,
          itemCode: lot.inventoryItem.itemCode,
          itemName: lot.inventoryItem.itemName,
          itemRole: role,
          orderId: sourceTransaction.orderId,
          orderNumber: sourceTransaction.order.orderNumber,
          orderLotId: sourceTransaction.orderLotId,
          orderLotNumber: sourceTransaction.orderLot?.lotNumber ?? null,
          sourceOperationExecutionId: classification.sourceOperationExecutionId,
          stockBacked: classification.stockBacked,
          sourceClassification: classification.classification,
          warehouseId: lot.warehouseId,
          warehouseCode: lot.warehouse.code,
          warehouseName: lot.warehouse.name,
          locationId: lot.locationId,
          locationCode: lot.location.code,
          locationName: lot.location.name,
          disposition: lot.location.disposition,
          quantityBucket: resolved.bucket,
          transferableQuantity: Number(resolved.quantity),
          unit: lot.unit,
          unitCost: decimal(lot.unitCost).toFixed(6),
          manufacturedAt: lot.manufacturedAt,
          expiresAt: lot.expiresAt,
          retestDueAt: lot.retestDueAt,
          serials: lot.serials,
        },
      ];
    });

    const matchingReviews = reviews.filter(
      (review): review is typeof review & { entityId: string } =>
        Boolean(review.entityId) &&
        (kind === "WIP_TRANSFER"
          ? review.workflowCode === "WIP_TRANSFER"
          : review.workflowCode === "BULK_PRODUCT_TRANSFER"),
    );
    const reviewByTransactionId = new Map(
      matchingReviews.map((review) => [review.entityId, review]),
    );
    const recentRows = matchingReviews.length
      ? await this.prisma.manufacturingTransaction.findMany({
          where: {
            id: { in: matchingReviews.map((review) => review.entityId) },
          },
          orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
          include: EXECUTION_TRANSFER_INCLUDE,
        })
      : [];
    const signaturePolicy = signatureRecord
      ? parseManufacturingElectronicSignaturePolicy(signatureRecord.payload)
      : null;
    return {
      kind,
      orders: eligibleOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        type: order.type,
        finishedProductId: order.finishedProductId,
        finishedProductCode: order.finishedProduct.itemCode,
        finishedProductName: order.finishedProduct.itemName,
        lots: order.lots.map((lot) => ({
          id: lot.id,
          lotNumber: lot.lotNumber,
          status: lot.status,
          plannedQuantity: Number(lot.plannedQuantity),
          completedQuantity: Number(lot.completedQuantity),
        })),
        operationExecutions: order.operationExecutions
          .filter((execution) => execution.status === "COMPLETED")
          .map((execution) => ({
            id: execution.id,
            orderLotId: execution.orderLotId,
            status: execution.status,
            operationId: execution.routingOperationId,
            operationCode: execution.routingOperation.code,
            operationName: execution.routingOperation.name,
            sequence: execution.routingOperation.sequence,
            goodQuantity: Number(execution.goodQuantity),
            completedAt: execution.completedAt,
          })),
      })),
      sourceLots,
      locations: locations.map((location) => ({
        id: location.id,
        code: location.code,
        name: location.name,
        disposition: location.disposition,
        warehouseId: location.warehouseId,
        warehouseCode: location.warehouse.code,
        warehouseName: location.warehouse.name,
      })),
      electronicSignature: {
        required: Boolean(settings?.electronicSignatureRequired),
        policyReady: Boolean(signaturePolicy),
        allowedMeanings: signaturePolicy?.signatureMeanings ?? [],
        reauthenticationRequired:
          signaturePolicy?.reauthenticationRequired ?? false,
      },
      recentTransfers: recentRows.map((row) =>
        this.mapTransfer({
          ...row,
          workflowReview: reviewByTransactionId.get(row.id) ?? null,
        }),
      ),
    };
  }

  async post(
    user: AuthenticatedRequestUser,
    dto: PostManufacturingExecutionTransferDto,
  ) {
    const scope = await this.scope(user, dto.workspaceId);
    await this.requirePermission(user, "manufacturing.production.execute");
    const kind = transferKind(dto.kind);
    const transactionDate = date(dto.transactionDate, "Transaction date");
    const rawQuantity = decimal(dto.quantity);
    const quantity = rawQuantity.toDecimalPlaces(
      4,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    if (!quantity.isFinite() || quantity.lessThanOrEqualTo(0))
      throw new BadRequestException(
        "Transfer quantity must be greater than zero.",
      );
    if (!quantity.equals(rawQuantity))
      throw new BadRequestException(
        "Transfer quantity cannot contain more than four decimal places.",
      );
    const serialIds = [...new Set(dto.serialIds ?? [])].sort();
    const requestSignature = hash([
      scope.id,
      kind,
      dto.orderId,
      dto.orderLotId,
      dto.operationExecutionId,
      dto.sourceInventoryLotId,
      dto.destinationLocationId,
      quantity.toString(),
      serialIds.join(","),
      transactionDate.toISOString(),
      text(dto.note),
      text(dto.signatureMeaning),
    ]);
    const transactionId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingTransaction",
      `EXECUTION-TRANSFER:${dto.idempotencyKey}`,
    );
    const transactionLineId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingTransactionLine",
      `EXECUTION-TRANSFER-LINE:${dto.idempotencyKey}`,
    );

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`manufacturing-execution-transfer:${scope.id}:${dto.idempotencyKey}`}, 0))`,
        );
        const replay = await tx.manufacturingTransaction.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: scope.id,
              idempotencyKey: `EXECUTION-TRANSFER:${dto.idempotencyKey}`,
            },
          },
          include: EXECUTION_TRANSFER_INCLUDE,
        });
        if (replay) {
          const review = await tx.manufacturingWorkflowReview.findUnique({
            where: {
              workspaceId_idempotencyKey: {
                workspaceId: scope.id,
                idempotencyKey: `EXECUTION-TRANSFER:${dto.idempotencyKey}:AUDIT`,
              },
            },
          });
          const evidence =
            review?.evidence &&
            typeof review.evidence === "object" &&
            !Array.isArray(review.evidence)
              ? (review.evidence as Record<string, unknown>)
              : {};
          if (evidence.requestSignature !== requestSignature)
            throw new ConflictException(
              "Transfer idempotency key is already used for a different request.",
            );
          return {
            transfer: this.mapTransfer({ ...replay, workflowReview: review }),
            replayed: true,
          };
        }

        await this.assertPeriodOpen(tx, scope.id, transactionDate);
        const fiscalYear = await tx.fiscalYear.findFirst({
          where: {
            companyId: scope.companyId,
            status: "OPEN",
            startDate: { lte: transactionDate },
            endDate: { gte: transactionDate },
          },
          orderBy: { startDate: "desc" },
        });
        if (!fiscalYear)
          throw new BadRequestException(
            "Transfer date must be inside an open fiscal year.",
          );
        const settings = await tx.manufacturingSettings.findUnique({
          where: { workspaceId: scope.id },
          select: { electronicSignatureRequired: true },
        });
        if (!settings)
          throw new BadRequestException(
            "Configure manufacturing settings before posting an execution transfer.",
          );
        const electronicSignatureEvidence =
          await this.electronicSignature.enforce(tx, {
            scope,
            user,
            actionLabel:
              kind === "WIP_TRANSFER"
                ? "WIP transfer"
                : "bulk product transfer",
            signatureMeaning: dto.signatureMeaning,
            reauthenticationPassword: dto.reauthenticationPassword,
            required: settings.electronicSignatureRequired,
          });

        const order = await tx.manufacturingOrder.findFirst({
          where: { id: dto.orderId, workspaceId: scope.id },
          select: { id: true, orderNumber: true, status: true },
        });
        if (!order) throw new NotFoundException("Production order not found.");
        if (!isExecutionTransferOrderStateAllowed(kind, order.status))
          throw new BadRequestException(
            `${kind.replaceAll("_", " ")} cannot be posted while order ${order.orderNumber} is ${order.status}.`,
          );
        const orderLot = await tx.manufacturingOrderLot.findFirst({
          where: { id: dto.orderLotId, orderId: order.id },
          select: { id: true, lotNumber: true, status: true },
        });
        if (!orderLot)
          throw new BadRequestException(
            "Selected production lot does not belong to this order.",
          );
        const operationExecution =
          await tx.manufacturingOperationExecution.findFirst({
            where: {
              id: dto.operationExecutionId,
              orderId: order.id,
              orderLotId: orderLot.id,
            },
            include: {
              routingOperation: {
                select: { code: true, name: true, sequence: true },
              },
            },
          });
        if (!operationExecution || operationExecution.status !== "COMPLETED")
          throw new BadRequestException(
            "Select a completed operation execution for this production lot.",
          );
        const sourceLot = await tx.manufacturingInventoryLot.findFirst({
          where: { id: dto.sourceInventoryLotId, workspaceId: scope.id },
          include: {
            inventoryItem: { include: { manufacturingProfile: true } },
            warehouse: true,
            location: true,
            sourceTransactionLine: {
              include: { transaction: true },
            },
            serials: {
              where: { status: { notIn: ["CONSUMED", "SCRAPPED"] } },
              select: { id: true, serialNumber: true, status: true },
            },
          },
        });
        if (!sourceLot || !sourceLot.location)
          throw new BadRequestException(
            "Source inventory lot and its active manufacturing location are required.",
          );
        if (
          !sourceLot.location.isActive ||
          !sourceLot.warehouse.isActive ||
          sourceLot.warehouse.deletedAt
        )
          throw new BadRequestException(
            "Source lot warehouse and location must both be active.",
          );
        const sourceTransaction = sourceLot.sourceTransactionLine?.transaction;
        if (
          !sourceTransaction ||
          sourceTransaction.orderId !== order.id ||
          sourceTransaction.orderLotId !== orderLot.id
        )
          throw new BadRequestException(
            "Source inventory lot is not traceably linked to the selected order and production lot.",
          );
        const sourceTransferReview =
          sourceTransaction.transactionType === "LOCATION_TRANSFER"
            ? await tx.manufacturingWorkflowReview.findFirst({
                where: {
                  workspaceId: scope.id,
                  entityType: "ManufacturingTransaction",
                  entityId: sourceTransaction.id,
                  workflowCode: {
                    in: ["WIP_TRANSFER", "BULK_PRODUCT_TRANSFER"],
                  },
                },
                orderBy: { createdAt: "desc" },
                select: { evidence: true },
              })
            : null;
        const classification = sourceClassification(
          sourceTransaction,
          sourceTransferReview?.evidence,
        );
        if (
          classification.sourceOperationExecutionId &&
          classification.sourceOperationExecutionId !== operationExecution.id
        )
          throw new BadRequestException(
            "Selected operation is not the exact source operation for this WIP or bulk lot.",
          );
        if (
          !classification.stockBacked &&
          !classification.sourceOperationExecutionId
        )
          throw new BadRequestException(
            "Control WIP requires an explicit source operation before it can be transferred.",
          );
        const itemRole = sourceLot.inventoryItem.manufacturingProfile?.role;
        if (!isExecutionTransferItemRoleAllowed(kind, itemRole))
          throw new BadRequestException(
            kind === "WIP_TRANSFER"
              ? "WIP transfer requires an intermediate, bulk or finished-product manufacturing lot."
              : "Bulk product transfer requires an inventory item configured with the BULK manufacturing role.",
          );
        if (
          !isExecutionTransferSourceDispositionAllowed(
            kind,
            sourceLot.location.disposition,
          )
        )
          throw new BadRequestException(
            `A ${kind.replaceAll("_", " ").toLowerCase()} cannot move a lot from ${sourceLot.location.disposition}.`,
          );
        if (sourceLot.expiresAt && sourceLot.expiresAt < transactionDate)
          throw new BadRequestException(
            `Source lot ${sourceLot.lotNumber} is expired on the selected transfer date.`,
          );
        if (sourceLot.retestDueAt && sourceLot.retestDueAt < transactionDate)
          throw new BadRequestException(
            `Source lot ${sourceLot.lotNumber} has passed its retest-due date; approved QA retest evidence is required before transfer.`,
          );
        const resolved = resolveExecutionTransferQuantity(sourceLot);
        if (quantity.greaterThan(resolved.quantity))
          throw new BadRequestException(
            `Transfer quantity exceeds the uncommitted ${resolved.bucket.toLowerCase()} balance (${resolved.quantity.toString()} ${sourceLot.unit}).`,
          );
        const destination = await tx.manufacturingLocation.findFirst({
          where: {
            id: dto.destinationLocationId,
            workspaceId: scope.id,
            isActive: true,
            warehouse: { isActive: true, deletedAt: null },
          },
          include: { warehouse: true },
        });
        if (!destination)
          throw new BadRequestException(
            "Destination warehouse and manufacturing location must be active.",
          );
        if (destination.id === sourceLot.locationId)
          throw new BadRequestException(
            "Source and destination manufacturing locations must be different.",
          );
        if (
          !isExecutionTransferDestinationAllowed(
            kind,
            resolved.bucket,
            destination.disposition,
          )
        )
          throw new BadRequestException(
            `${resolved.bucket} ${kind.replaceAll("_", " ").toLowerCase()} quantity cannot move to a ${destination.disposition} location.`,
          );

        if (sourceLot.serials.length) {
          if (!quantity.isInteger())
            throw new BadRequestException(
              "Serialized transfer quantity must be a whole number.",
            );
          if (serialIds.length !== quantity.toNumber())
            throw new BadRequestException(
              `Select exactly ${quantity.toFixed(0)} serial number(s) for this transfer.`,
            );
          const availableSerialIds = new Set(
            sourceLot.serials.map((serial) => serial.id),
          );
          if (serialIds.some((serialId) => !availableSerialIds.has(serialId)))
            throw new BadRequestException(
              "Every selected serial must belong to the source inventory lot.",
            );
        } else if (serialIds.length) {
          throw new BadRequestException(
            "Serial numbers were supplied for a non-serialized inventory lot.",
          );
        }

        const interWarehouse =
          destination.warehouseId !== sourceLot.warehouseId;
        if (interWarehouse && !classification.stockBacked)
          throw new BadRequestException(
            "Operation-output WIP control lots can move only between locations in the same WIP warehouse. Inter-warehouse transfer requires a stock-backed production receipt lot.",
          );
        const moveWholeLot =
          !interWarehouse &&
          shouldMoveWholeExecutionLot(sourceLot, resolved.bucket, quantity);
        const transferLineCost = decimal(sourceLot.unitCost)
          .mul(quantity)
          .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
        const transactionNumber = `${kind === "WIP_TRANSFER" ? "WLT" : "BLT"}-${transactionDate
          .toISOString()
          .slice(0, 10)
          .replaceAll("-", "")}-${requestSignature.slice(0, 10).toUpperCase()}`;
        await tx.manufacturingTransaction.create({
          data: {
            id: transactionId,
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            fiscalYearId: fiscalYear.id,
            transactionNumber,
            transactionType: "LOCATION_TRANSFER",
            status: "POSTED",
            transactionDate,
            orderId: order.id,
            orderLotId: orderLot.id,
            operationExecutionId: operationExecution.id,
            fromWarehouseId: sourceLot.warehouseId,
            toWarehouseId: destination.warehouseId,
            fromLocationId: sourceLot.locationId,
            toLocationId: destination.id,
            referenceNo: order.orderNumber,
            notes: text(dto.note),
            idempotencyKey: `EXECUTION-TRANSFER:${dto.idempotencyKey}`,
            createdByUserId: user.id,
            postedByUserId: user.id,
            postedAt: transactionDate,
            lines: {
              create: {
                id: transactionLineId,
                inventoryItemId: sourceLot.inventoryItemId,
                sourceInventoryLotId: sourceLot.id,
                quantity,
                unit: sourceLot.unit,
                unitCost: sourceLot.unitCost,
                totalCost: transferLineCost,
                notes: `${kind.replaceAll("_", " ")} from ${sourceLot.location.code} to ${destination.code}`,
              },
            },
          },
        });

        let destinationLotId = sourceLot.id;
        let destinationLotNumber = sourceLot.lotNumber;
        if (moveWholeLot) {
          const moved = await tx.manufacturingInventoryLot.updateMany({
            where: {
              id: sourceLot.id,
              workspaceId: scope.id,
              warehouseId: sourceLot.warehouseId,
              locationId: sourceLot.locationId,
              availableQuantity: sourceLot.availableQuantity,
              reservedQuantity: sourceLot.reservedQuantity,
              holdQuantity: sourceLot.holdQuantity,
              rejectedQuantity: sourceLot.rejectedQuantity,
            },
            data: {
              warehouseId: destination.warehouseId,
              locationId: destination.id,
            },
          });
          if (moved.count !== 1)
            throw new ConflictException(
              "Source-lot balance or location changed while transferring; no transfer was posted.",
            );
        } else {
          const sourceUpdate =
            resolved.bucket === "HOLD"
              ? { holdQuantity: { decrement: quantity } }
              : { availableQuantity: { decrement: quantity } };
          const moved = await tx.manufacturingInventoryLot.updateMany({
            where: {
              id: sourceLot.id,
              workspaceId: scope.id,
              warehouseId: sourceLot.warehouseId,
              locationId: sourceLot.locationId,
              availableQuantity: sourceLot.availableQuantity,
              reservedQuantity: sourceLot.reservedQuantity,
              holdQuantity: sourceLot.holdQuantity,
              rejectedQuantity: sourceLot.rejectedQuantity,
            },
            data: sourceUpdate,
          });
          if (moved.count !== 1)
            throw new ConflictException(
              "Source-lot balance changed while transferring; no transfer was posted.",
            );
          destinationLotId = manufacturingEntityIdFromIdempotency(
            scope.id,
            "ManufacturingInventoryLot",
            `EXECUTION-TRANSFER-LOT:${dto.idempotencyKey}`,
          );
          destinationLotNumber = executionTransferLotNumber(
            sourceLot.lotNumber,
            kind,
            requestSignature,
          );
          await tx.manufacturingInventoryLot.create({
            data: {
              id: destinationLotId,
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              inventoryItemId: sourceLot.inventoryItemId,
              warehouseId: destination.warehouseId,
              locationId: destination.id,
              lotNumber: destinationLotNumber,
              receivedQuantity: quantity,
              availableQuantity:
                resolved.bucket === "AVAILABLE" ? quantity : decimal(0),
              reservedQuantity: 0,
              holdQuantity: resolved.bucket === "HOLD" ? quantity : decimal(0),
              rejectedQuantity: 0,
              unit: sourceLot.unit,
              unitCost: sourceLot.unitCost,
              manufacturedAt: sourceLot.manufacturedAt,
              expiresAt: sourceLot.expiresAt,
              retestDueAt: sourceLot.retestDueAt,
              sourceTransactionLineId: transactionLineId,
              createdByUserId: user.id,
            },
          });
          await tx.manufacturingGenealogy.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              orderId: order.id,
              orderLotId: orderLot.id,
              transactionLineId,
              parentInventoryLotId: sourceLot.id,
              childInventoryLotId: destinationLotId,
              relationshipType:
                kind === "WIP_TRANSFER"
                  ? "WIP_LOCATION_TRANSFER"
                  : "BULK_PRODUCT_TRANSFER",
              quantity,
              unit: sourceLot.unit,
              createdByUserId: user.id,
            },
          });
        }
        await tx.manufacturingTransactionLine.update({
          where: { id: transactionLineId },
          data: { destinationInventoryLotId: destinationLotId },
        });

        if (serialIds.length) {
          const serialsMoved = await tx.manufacturingSerial.updateMany({
            where: {
              id: { in: serialIds },
              workspaceId: scope.id,
              inventoryLotId: sourceLot.id,
            },
            data: {
              warehouseId: destination.warehouseId,
              locationId: destination.id,
              inventoryLotId: destinationLotId,
            },
          });
          if (serialsMoved.count !== serialIds.length)
            throw new ConflictException(
              "A selected serial changed while transferring; no transfer was posted.",
            );
          await tx.manufacturingSerialMovement.createMany({
            data: serialIds.map((serialId) => ({
              transactionLineId,
              serialId,
              role: "OUTPUT" as const,
            })),
          });
        }

        const stockMovementIds: string[] = [];
        let inventoryLedgerTransferValue: string | null = null;
        if (interWarehouse) {
          for (const [warehouseId, movementType, suffix] of [
            [sourceLot.warehouseId, "OUT", "OUT"],
            [destination.warehouseId, "IN", "IN"],
          ] as const) {
            const movement = await tx.stockMovement.create({
              data: {
                tenantId: scope.tenantId,
                companyId: scope.companyId,
                workspaceId: scope.id,
                warehouseId,
                inventoryItemId: sourceLot.inventoryItemId,
                transactionType: `STOCK_TRANSFER_${suffix}`,
                transactionId,
                transactionLineId,
                referenceNo: transactionNumber,
                movementType,
                quantity,
                unit: sourceLot.unit,
                transactionDate,
                postedByUserId: user.id,
                idempotencyKey: `EXECUTION-TRANSFER:${dto.idempotencyKey}:${suffix}`,
                manufacturingTransactionLineId: transactionLineId,
              },
            });
            stockMovementIds.push(movement.id);
          }
          const valuation = await rebuildMovingAverageCosts(tx, scope.id, [
            sourceLot.inventoryItemId,
          ]);
          const outgoing = valuation.movements.find(
            (movement) =>
              movement.transactionId === transactionId &&
              movement.transactionLineId === transactionLineId &&
              movement.transactionType === "STOCK_TRANSFER_OUT",
          );
          const incoming = valuation.movements.find(
            (movement) =>
              movement.transactionId === transactionId &&
              movement.transactionLineId === transactionLineId &&
              movement.transactionType === "STOCK_TRANSFER_IN",
          );
          if (
            !outgoing ||
            !incoming ||
            !decimal(outgoing.movementValue).equals(incoming.movementValue)
          )
            throw new ConflictException(
              "Inter-warehouse transfer valuation did not balance; no transfer was posted.",
            );
          await this.requireInventoryService().reconcileMovingAverageLedger(
            tx,
            scope.id,
            valuation.movements,
            user.id,
          );
          inventoryLedgerTransferValue = decimal(
            outgoing.movementValue,
          ).toFixed(6);
        }

        const review = await tx.manufacturingWorkflowReview.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            orderId: order.id,
            workflowGroup: "PRODUCTION_EXECUTION",
            workflowCode: kind,
            entityType: "ManufacturingTransaction",
            entityId: transactionId,
            transactionDate,
            idempotencyKey: `EXECUTION-TRANSFER:${dto.idempotencyKey}:AUDIT`,
            title: `${transactionNumber} posted`,
            outcome: "EXECUTED",
            status: "APPROVED",
            note: text(dto.note),
            evidence: {
              requestSignature,
              kind,
              orderId: order.id,
              orderNumber: order.orderNumber,
              orderLotId: orderLot.id,
              orderLotNumber: orderLot.lotNumber,
              operationExecutionId: operationExecution.id,
              operationCode: operationExecution.routingOperation.code,
              sourceInventoryLotId: sourceLot.id,
              sourceLotNumber: sourceLot.lotNumber,
              destinationInventoryLotId: destinationLotId,
              destinationLotNumber,
              inventoryItemId: sourceLot.inventoryItemId,
              itemRole,
              stockBacked: classification.stockBacked,
              sourceClassification: classification.classification,
              sourceOperationExecutionId:
                classification.sourceOperationExecutionId,
              quantity: quantity.toString(),
              quantityBucket: resolved.bucket,
              unit: sourceLot.unit,
              lotUnitCost: decimal(sourceLot.unitCost).toFixed(6),
              lotTransferValue: transferLineCost.toFixed(6),
              fromWarehouseId: sourceLot.warehouseId,
              toWarehouseId: destination.warehouseId,
              fromLocationId: sourceLot.locationId,
              toLocationId: destination.id,
              interWarehouse,
              sameWarehouseNoStockMovement: !interWarehouse,
              noGeneralLedgerEntry: true,
              stockMovementIds,
              inventoryLedgerTransferValue,
              serialIds,
              electronicSignaturePolicy: electronicSignatureEvidence,
            },
            signatureHash: hash([
              scope.id,
              kind,
              transactionId,
              user.id,
              transactionDate.toISOString(),
              requestSignature,
            ]),
            createdByUserId: user.id,
            approvedByUserId: user.id,
            approvedAt: transactionDate,
          },
        });

        const persisted = await tx.manufacturingTransaction.findUniqueOrThrow({
          where: { id: transactionId },
          include: EXECUTION_TRANSFER_INCLUDE,
        });
        return {
          transfer: this.mapTransfer({ ...persisted, workflowReview: review }),
          replayed: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
