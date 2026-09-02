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
  ManufacturingTransactionType,
  ManufacturingTransactionStatus,
  Prisma,
} from "../generated/prisma/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  issueManufacturingDocumentNumberTx,
  manufacturingEntityIdFromIdempotency,
} from "./manufacturing-document-number.js";
import {
  allocateMaterialLots,
  manufacturingOrderStatusAfterReservation,
  type MaterialLotAllocationMethod,
  validateIncomingInspection,
  validateMaterialHandlingIdentity,
} from "./manufacturing-materials.domain.js";
import {
  ManufacturingUnitConversionError,
  normalizeManufacturingQuantityToBase,
  type ManufacturingUnitConversionEvidence,
  type ManufacturingUnitDefinition,
} from "./manufacturing-uom.domain.js";
import type {
  CreateMaterialRequisitionDto,
  InspectIncomingMaterialLotDto,
  MaterialRequisitionTransitionDto,
  RecordMaterialHandlingEvidenceDto,
  RegisterIncomingMaterialLotDto,
} from "./manufacturing-materials.dto.js";

type Scope = { id: string; tenantId: string; companyId: string };
type Db = Prisma.TransactionClient | PrismaService;
type Query = Record<string, string | undefined>;
type MaterialHandlingReplayReview = {
  workflowCode: string;
  entityId: string | null;
  evidence: Prisma.JsonValue | null;
};
type MaterialLotMapRow = {
  id: string;
  inventoryItemId: string;
  inventoryItem?: { itemCode: string; itemName: string } | null;
  warehouseId: string;
  warehouse?: { code: string; name: string } | null;
  locationId: string | null;
  location?: { code: string; name: string } | null;
  lotNumber: string;
  receivedQuantity: Prisma.Decimal;
  availableQuantity: Prisma.Decimal;
  reservedQuantity: Prisma.Decimal;
  holdQuantity: Prisma.Decimal;
  rejectedQuantity: Prisma.Decimal;
  unit: string;
  unitCost: Prisma.Decimal;
  manufacturedAt: Date | null;
  retestDueAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

const MATERIAL_ROLES = [
  "RAW_MATERIAL",
  "PACKAGING_MATERIAL",
  "INTERMEDIATE",
  "BULK",
  "CONSUMABLE",
] as const;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function date(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new BadRequestException(`${label} is invalid.`);
  return parsed;
}

function decimal(
  value: Prisma.Decimal.Value | null | undefined,
): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}

function positiveQuantity(
  value: Prisma.Decimal.Value,
  label: string,
): Prisma.Decimal {
  const parsed = decimal(value).toDecimalPlaces(
    4,
    Prisma.Decimal.ROUND_HALF_UP,
  );
  if (!parsed.isFinite() || parsed.lessThanOrEqualTo(0))
    throw new BadRequestException(`${label} must be greater than zero.`);
  return parsed;
}

function assertLotDateValidity(
  lot: {
    lotNumber: string;
    retestDueAt: Date | null;
    expiresAt: Date | null;
  },
  transactionDate: Date,
  context: string,
) {
  if (lot.expiresAt && lot.expiresAt < transactionDate) {
    throw new BadRequestException(
      `Lot ${lot.lotNumber} is expired ${context}.`,
    );
  }
  if (lot.retestDueAt && lot.retestDueAt < transactionDate) {
    throw new BadRequestException(
      `Lot ${lot.lotNumber} has passed its retest-due date ${context}; approved QA retest evidence is required before use.`,
    );
  }
}

function normalizedStockQuantity(
  item: ManufacturingUnitDefinition,
  value: Prisma.Decimal.Value,
  unit: string,
  label: string,
) {
  try {
    const normalized = normalizeManufacturingQuantityToBase(item, value, unit);
    if (normalized.quantity.lessThanOrEqualTo(0))
      throw new ManufacturingUnitConversionError(
        `${label} must be greater than zero.`,
      );
    const stored = normalized.quantity.toDecimalPlaces(
      4,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    if (
      normalized.evidence.direction === "BASE_TO_BASE" &&
      !stored.equals(normalized.quantity)
    ) {
      throw new ManufacturingUnitConversionError(
        `${label} cannot contain more than four decimal places.`,
      );
    }
    if (stored.isZero())
      throw new ManufacturingUnitConversionError(
        `${label} converts below the minimum 4-decimal stock precision.`,
      );
    return {
      ...normalized,
      quantity: stored,
      evidence: {
        ...normalized.evidence,
        storedQuantity: stored.toString(),
        storageDecimalPlaces: 4,
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

function isUniqueError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002",
  );
}

function evidenceObject(
  value: Prisma.JsonValue | null,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function signature(parts: Array<string | number | null | undefined>) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join(":"), "utf8")
    .digest("hex");
}

@Injectable()
export class ManufacturingMaterialsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
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
    permission: string,
  ) {
    const granted = await this.permissions.getGrantedKeys(currentUser);
    if (!granted.has(permission))
      throw new ForbiddenException(`Permission required: ${permission}`);
  }

  private async assertPeriodOpen(
    db: Db,
    workspaceId: string,
    transactionDate: Date,
    label: string,
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
    if (period && period.status !== "OPEN") {
      throw new BadRequestException(
        `${label} is blocked because manufacturing period ${period.periodYear}-${String(period.periodMonth).padStart(2, "0")} is ${period.status}.`,
      );
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    scope: Scope,
    currentUser: AuthenticatedRequestUser,
    input: {
      workflowCode: string;
      entityType: string;
      entityId: string;
      orderId?: string | null;
      transactionDate: Date;
      idempotencyKey: string;
      title: string;
      note?: string | null;
      evidence: Prisma.InputJsonValue;
    },
  ) {
    return tx.manufacturingWorkflowReview.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        orderId: input.orderId ?? null,
        workflowGroup: "MATERIALS_DISPENSING",
        workflowCode: input.workflowCode,
        entityType: input.entityType,
        entityId: input.entityId,
        transactionDate: input.transactionDate,
        idempotencyKey: input.idempotencyKey,
        title: input.title,
        outcome: "EXECUTED",
        status: "APPROVED",
        note: text(input.note),
        evidence: input.evidence,
        signatureHash: signature([
          scope.id,
          input.workflowCode,
          input.entityId,
          currentUser.id,
          input.transactionDate.toISOString(),
          input.idempotencyKey,
        ]),
        approvedByUserId: currentUser.id,
        approvedAt: input.transactionDate,
        createdByUserId: currentUser.id,
      },
    });
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
      "The material operation could not be serialized after three attempts.",
    );
  }

  private lotStatus(row: {
    availableQuantity: Prisma.Decimal;
    holdQuantity: Prisma.Decimal;
    rejectedQuantity: Prisma.Decimal;
    retestDueAt?: Date | null;
    expiresAt?: Date | null;
  }) {
    const available = decimal(row.availableQuantity);
    const hold = decimal(row.holdQuantity);
    const rejected = decimal(row.rejectedQuantity);
    if (hold.greaterThan(0)) return "QUARANTINE";
    if (available.lessThanOrEqualTo(0) && rejected.greaterThan(0))
      return "REJECTED";
    const now = new Date();
    if (available.greaterThan(0) && row.expiresAt && row.expiresAt < now)
      return "EXPIRED";
    if (available.greaterThan(0) && row.retestDueAt && row.retestDueAt < now)
      return "RETEST_DUE";
    if (available.greaterThan(0) && rejected.greaterThan(0))
      return "PARTIALLY_RELEASED";
    if (available.greaterThan(0)) return "RELEASED";
    return "DEPLETED";
  }

  private mapLot(row: MaterialLotMapRow) {
    return {
      id: row.id,
      inventoryItemId: row.inventoryItemId,
      itemCode: row.inventoryItem?.itemCode ?? null,
      itemName: row.inventoryItem?.itemName ?? null,
      warehouseId: row.warehouseId,
      warehouseCode: row.warehouse?.code ?? null,
      warehouseName: row.warehouse?.name ?? null,
      locationId: row.locationId,
      locationCode: row.location?.code ?? null,
      locationName: row.location?.name ?? null,
      lotNumber: row.lotNumber,
      receivedQuantity: decimal(row.receivedQuantity).toNumber(),
      availableQuantity: decimal(row.availableQuantity).toNumber(),
      reservedQuantity: decimal(row.reservedQuantity).toNumber(),
      allocatableQuantity: Prisma.Decimal.max(
        decimal(row.availableQuantity).sub(row.reservedQuantity),
        0,
      ).toNumber(),
      holdQuantity: decimal(row.holdQuantity).toNumber(),
      rejectedQuantity: decimal(row.rejectedQuantity).toNumber(),
      unit: row.unit,
      unitCost: decimal(row.unitCost).toFixed(2),
      manufacturedAt: row.manufacturedAt?.toISOString() ?? null,
      retestDueAt: row.retestDueAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      receivedAt: row.createdAt.toISOString(),
      status: this.lotStatus(row),
    };
  }

  async listSourceMovements(
    currentUser: AuthenticatedRequestUser,
    query: Query,
  ) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const search = text(query.search);
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        workspaceId: scope.id,
        movementType: "IN",
        voidedAt: null,
        ...(query.inventoryItemId
          ? { inventoryItemId: query.inventoryItemId }
          : {}),
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(search
          ? {
              OR: [
                { referenceNo: { contains: search, mode: "insensitive" } },
                { transactionId: { contains: search, mode: "insensitive" } },
                {
                  inventoryItem: {
                    itemName: { contains: search, mode: "insensitive" },
                  },
                },
                {
                  inventoryItem: {
                    itemCode: { contains: search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        inventoryItem: {
          select: { itemCode: true, itemName: true, unit: true },
        },
        warehouse: { select: { code: true, name: true } },
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    const registrations =
      await this.prisma.manufacturingWorkflowReview.findMany({
        where: {
          workspaceId: scope.id,
          workflowCode: "INCOMING_MATERIAL_LOT_REGISTERED",
          status: "APPROVED",
        },
        select: { evidence: true },
      });
    const registeredByMovement = new Map<string, Prisma.Decimal>();
    for (const review of registrations) {
      const evidence = evidenceObject(review.evidence);
      const movementId = text(evidence.sourceStockMovementId);
      if (!movementId) continue;
      registeredByMovement.set(
        movementId,
        (registeredByMovement.get(movementId) ?? decimal(0)).add(
          Number(evidence.registeredQuantity ?? 0),
        ),
      );
    }
    return rows.map((row) => {
      const registeredQuantity = registeredByMovement.get(row.id) ?? decimal(0);
      return {
        id: row.id,
        transactionType: row.transactionType,
        transactionId: row.transactionId,
        transactionLineId: row.transactionLineId,
        referenceNo: row.referenceNo,
        inventoryItemId: row.inventoryItemId,
        itemCode: row.inventoryItem.itemCode,
        itemName: row.inventoryItem.itemName,
        warehouseId: row.warehouseId,
        warehouseCode: row.warehouse.code,
        warehouseName: row.warehouse.name,
        quantity: decimal(row.quantity).toNumber(),
        registeredQuantity: registeredQuantity.toNumber(),
        unregisteredQuantity: Prisma.Decimal.max(
          decimal(row.quantity).sub(registeredQuantity),
          0,
        ).toNumber(),
        unit: row.unit || row.inventoryItem.unit,
        unitCost: decimal(row.unitCost).toFixed(2),
        transactionDate: row.transactionDate.toISOString(),
      };
    });
  }

  async listIncomingLots(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const search = text(query.search);
    const rows = await this.prisma.manufacturingInventoryLot.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.inventoryItemId
          ? { inventoryItemId: query.inventoryItemId }
          : {}),
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(search
          ? {
              OR: [
                { lotNumber: { contains: search, mode: "insensitive" } },
                {
                  inventoryItem: {
                    itemName: { contains: search, mode: "insensitive" },
                  },
                },
                {
                  inventoryItem: {
                    itemCode: { contains: search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        inventoryItem: { select: { itemCode: true, itemName: true } },
        warehouse: { select: { code: true, name: true } },
        location: { select: { code: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { lotNumber: "asc" }],
      take: 500,
    });
    const mapped = rows.map((row) => this.mapLot(row));
    return query.status
      ? mapped.filter((row) => row.status === query.status)
      : mapped;
  }

  async getAllocation(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    if (!query.inventoryItemId || !query.warehouseId)
      throw new BadRequestException(
        "inventoryItemId and warehouseId are required.",
      );
    const requiredQuantity = positiveQuantity(
      query.requiredQuantity ?? "0",
      "requiredQuantity",
    ).toNumber();
    const method = (
      query.method ?? "FIFO"
    ).toUpperCase() as MaterialLotAllocationMethod;
    if (!(["FIFO", "FEFO"] as string[]).includes(method))
      throw new BadRequestException("method must be FIFO or FEFO.");
    const asOf = query.asOf ? date(query.asOf, "asOf") : new Date();
    const lots = await this.prisma.manufacturingInventoryLot.findMany({
      where: {
        workspaceId: scope.id,
        inventoryItemId: query.inventoryItemId,
        warehouseId: query.warehouseId,
        availableQuantity: { gt: 0 },
        holdQuantity: 0,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gte: asOf } }] },
          { OR: [{ retestDueAt: null }, { retestDueAt: { gte: asOf } }] },
        ],
      },
      include: {
        inventoryItem: { select: { itemCode: true, itemName: true } },
        warehouse: { select: { code: true, name: true } },
        location: { select: { code: true, name: true } },
      },
    });
    const allocation = allocateMaterialLots(
      lots.map((lot) => ({
        id: lot.id,
        lotNumber: lot.lotNumber,
        availableQuantity: decimal(lot.availableQuantity).toNumber(),
        reservedQuantity: decimal(lot.reservedQuantity).toNumber(),
        receivedAt: lot.createdAt,
        retestDueAt: lot.retestDueAt,
        expiresAt: lot.expiresAt,
      })),
      requiredQuantity,
      method,
    );
    const mapped = new Map(lots.map((lot) => [lot.id, this.mapLot(lot)]));
    return {
      ...allocation,
      asOf: asOf.toISOString(),
      allocations: allocation.allocations.map((row) => ({
        ...mapped.get(row.id),
        suggestedQuantity: row.suggestedQuantity,
      })),
    };
  }

  async registerIncomingLot(
    currentUser: AuthenticatedRequestUser,
    dto: RegisterIncomingMaterialLotDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.material.issue");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const transactionDate = date(dto.transactionDate, "transactionDate");
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
        replay.workflowCode !== "INCOMING_MATERIAL_LOT_REGISTERED" ||
        !replay.entityId
      )
        throw new ConflictException(
          "Idempotency key is already used by another manufacturing operation.",
        );
      const lot = await this.prisma.manufacturingInventoryLot.findFirst({
        where: { id: replay.entityId, workspaceId: scope.id },
        include: { inventoryItem: true, warehouse: true, location: true },
      });
      if (!lot)
        throw new ConflictException(
          "The idempotent lot registration no longer resolves to its audited lot.",
        );
      const evidence = evidenceObject(replay.evidence);
      const normalized = normalizedStockQuantity(
        lot.inventoryItem,
        dto.quantity,
        dto.unit,
        "Incoming lot quantity",
      );
      const submittedQuantity = text(evidence.submittedQuantity);
      const submittedUnit = text(evidence.submittedUnit);
      if (
        lot.inventoryItemId !== dto.inventoryItemId ||
        lot.warehouseId !== dto.warehouseId ||
        lot.lotNumber !== dto.lotNumber.trim() ||
        text(evidence.sourceStockMovementId) !== dto.sourceStockMovementId ||
        !decimal(lot.receivedQuantity).equals(normalized.quantity) ||
        (submittedQuantity !== null &&
          !decimal(submittedQuantity).equals(dto.quantity)) ||
        (submittedUnit !== null &&
          submittedUnit.toLowerCase() !== dto.unit.trim().toLowerCase())
      )
        throw new ConflictException(
          "Idempotency key is already used for a different incoming-lot registration.",
        );
      return { lot: this.mapLot(lot), replayed: true };
    }
    try {
      return await this.serializable(async (tx) => {
        await this.assertPeriodOpen(
          tx,
          scope.id,
          transactionDate,
          "Incoming lot registration",
        );
        const [item, warehouse, movement] = await Promise.all([
          tx.inventoryItem.findFirst({
            where: {
              id: dto.inventoryItemId,
              workspaceId: scope.id,
              status: "ACTIVE",
            },
            include: { manufacturingProfile: true },
          }),
          tx.warehouse.findFirst({
            where: {
              id: dto.warehouseId,
              workspaceId: scope.id,
              isActive: true,
              deletedAt: null,
            },
          }),
          tx.stockMovement.findFirst({
            where: {
              id: dto.sourceStockMovementId,
              workspaceId: scope.id,
              voidedAt: null,
              movementType: "IN",
            },
          }),
        ]);
        if (!item)
          throw new NotFoundException(
            "Active inventory item not found in this workspace.",
          );
        if (
          !item.manufacturingProfile?.isActive ||
          !(MATERIAL_ROLES as readonly string[]).includes(
            item.manufacturingProfile.role,
          )
        ) {
          throw new BadRequestException(
            "The item requires an active raw, packaging, intermediate, bulk or consumable manufacturing profile.",
          );
        }
        if (!item.manufacturingProfile.lotTracked)
          throw new BadRequestException(
            "Lot tracking must be enabled on this material profile first.",
          );
        if (!warehouse)
          throw new NotFoundException(
            "Active warehouse not found in this workspace.",
          );
        if (
          !movement ||
          movement.inventoryItemId !== item.id ||
          movement.warehouseId !== warehouse.id
        ) {
          throw new BadRequestException(
            "The source stock receipt must be a real non-voided IN movement for the same item and warehouse.",
          );
        }
        if (
          movement.unit.trim().toLowerCase() !== item.unit.trim().toLowerCase()
        ) {
          throw new BadRequestException(
            `Source stock receipt ${movement.id} is not recorded in the authoritative stock/base unit (${item.unit}).`,
          );
        }
        const normalized = normalizedStockQuantity(
          item,
          dto.quantity,
          dto.unit,
          "Incoming lot quantity",
        );
        const quantity = normalized.quantity;
        if (transactionDate < movement.transactionDate)
          throw new BadRequestException(
            "Lot receipt date cannot precede its source stock movement.",
          );
        if (dto.locationId) {
          const location = await tx.manufacturingLocation.findFirst({
            where: {
              id: dto.locationId,
              workspaceId: scope.id,
              warehouseId: warehouse.id,
              isActive: true,
            },
          });
          if (!location)
            throw new BadRequestException(
              "The selected location is not active in the receipt warehouse.",
            );
        }
        const sourceReviews = await tx.manufacturingWorkflowReview.findMany({
          where: {
            workspaceId: scope.id,
            workflowCode: "INCOMING_MATERIAL_LOT_REGISTERED",
            status: "APPROVED",
          },
          select: { evidence: true },
        });
        const alreadyRegistered = sourceReviews.reduce((sum, review) => {
          const evidence = evidenceObject(review.evidence);
          if (text(evidence.sourceStockMovementId) !== movement.id) return sum;
          const registered = evidence.registeredQuantity;
          return typeof registered === "string" ||
            typeof registered === "number"
            ? sum.add(registered)
            : sum;
        }, decimal(0));
        if (alreadyRegistered.add(quantity).greaterThan(movement.quantity)) {
          throw new BadRequestException(
            `Registration exceeds the source receipt. Unregistered quantity is ${Prisma.Decimal.max(decimal(movement.quantity).sub(alreadyRegistered), 0).toString()} ${movement.unit}.`,
          );
        }
        const [latestStock, representedLots] = await Promise.all([
          tx.stockMovement.findFirst({
            where: {
              workspaceId: scope.id,
              warehouseId: warehouse.id,
              inventoryItemId: item.id,
              voidedAt: null,
            },
            orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
            select: { balanceQuantity: true },
          }),
          tx.manufacturingInventoryLot.aggregate({
            where: {
              workspaceId: scope.id,
              warehouseId: warehouse.id,
              inventoryItemId: item.id,
            },
            _sum: {
              availableQuantity: true,
              holdQuantity: true,
              rejectedQuantity: true,
            },
          }),
        ]);
        const representedQuantity = decimal(
          representedLots._sum.availableQuantity,
        )
          .add(representedLots._sum.holdQuantity ?? 0)
          .add(representedLots._sum.rejectedQuantity ?? 0);
        const untrackedOnHand = decimal(latestStock?.balanceQuantity).sub(
          representedQuantity,
        );
        if (untrackedOnHand.lessThan(quantity)) {
          throw new BadRequestException(
            `Only ${Prisma.Decimal.max(untrackedOnHand, 0).toString()} ${movement.unit} of current on-hand stock is not already represented by material lots.`,
          );
        }
        const manufacturedAt = dto.manufacturedAt
          ? date(dto.manufacturedAt, "manufacturedAt")
          : null;
        const expiresAt = dto.expiresAt
          ? date(dto.expiresAt, "expiresAt")
          : null;
        const retestDueAt = dto.retestDueAt
          ? date(dto.retestDueAt, "retestDueAt")
          : null;
        if (manufacturedAt && expiresAt && expiresAt <= manufacturedAt)
          throw new BadRequestException(
            "Expiry date must be after manufacture date.",
          );
        if (manufacturedAt && retestDueAt && retestDueAt <= manufacturedAt)
          throw new BadRequestException(
            "Retest-due date must be after manufacture date.",
          );
        if (retestDueAt && expiresAt && retestDueAt > expiresAt)
          throw new BadRequestException(
            "Retest-due date cannot be after the expiry date.",
          );
        if (item.manufacturingProfile.expiryTracked && !expiresAt)
          throw new BadRequestException(
            "This material profile requires an expiry date.",
          );
        const lot = await tx.manufacturingInventoryLot.create({
          data: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            inventoryItemId: item.id,
            warehouseId: warehouse.id,
            locationId: dto.locationId ?? null,
            lotNumber: dto.lotNumber.trim(),
            receivedQuantity: quantity,
            availableQuantity: 0,
            reservedQuantity: 0,
            holdQuantity: quantity,
            rejectedQuantity: 0,
            unit: movement.unit,
            unitCost: movement.unitCost,
            manufacturedAt,
            retestDueAt,
            expiresAt,
            createdByUserId: currentUser.id,
          },
          include: { inventoryItem: true, warehouse: true, location: true },
        });
        await this.audit(tx, scope, currentUser, {
          workflowCode: "INCOMING_MATERIAL_LOT_REGISTERED",
          entityType: "ManufacturingInventoryLot",
          entityId: lot.id,
          transactionDate,
          idempotencyKey: dto.idempotencyKey,
          title: `Incoming material lot ${lot.lotNumber} registered in quarantine`,
          note: dto.note,
          evidence: {
            sourceStockMovementId: movement.id,
            sourceTransactionType: movement.transactionType,
            sourceTransactionId: movement.transactionId,
            sourceTransactionLineId: movement.transactionLineId,
            sourceReference: dto.sourceReference.trim(),
            submittedQuantity: decimal(dto.quantity).toString(),
            submittedUnit: dto.unit.trim(),
            registeredQuantity: quantity.toString(),
            unit: lot.unit,
            unitConversion: normalized.evidence,
            warehouseId: warehouse.id,
            locationId: lot.locationId,
            retestDueAt: lot.retestDueAt?.toISOString() ?? null,
            expiresAt: lot.expiresAt?.toISOString() ?? null,
          },
        });
        return { lot: this.mapLot(lot), replayed: false };
      });
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "The lot number or idempotency key is already in use in this workspace.",
        );
      throw error;
    }
  }

  async inspectIncomingLot(
    currentUser: AuthenticatedRequestUser,
    lotId: string,
    dto: InspectIncomingMaterialLotDto,
  ) {
    await this.requirePermission(
      currentUser,
      dto.decision === "RELEASED"
        ? "manufacturing.quality.release"
        : "manufacturing.quality.inspect",
    );
    const scope = await this.scope(currentUser, dto.workspaceId);
    const transactionDate = date(dto.transactionDate, "transactionDate");
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
        replay.workflowCode !== "INCOMING_MATERIAL_INSPECTION" ||
        replay.entityId !== lotId
      )
        throw new ConflictException(
          "Idempotency key is already used by another manufacturing operation.",
        );
      const lot = await this.prisma.manufacturingInventoryLot.findFirst({
        where: { id: lotId, workspaceId: scope.id },
        include: { inventoryItem: true, warehouse: true, location: true },
      });
      if (!lot) throw new NotFoundException("Incoming material lot not found.");
      const replayDecision = evidenceObject(replay.evidence).decision;
      if (replayDecision !== dto.decision)
        throw new ConflictException(
          "Idempotency key is already used for a different inspection decision.",
        );
      return {
        lot: this.mapLot(lot),
        decision: replayDecision,
        replayed: true,
      };
    }
    return this.serializable(async (tx) => {
      await this.assertPeriodOpen(
        tx,
        scope.id,
        transactionDate,
        "Incoming material inspection",
      );
      const lot = await tx.manufacturingInventoryLot.findFirst({
        where: { id: lotId, workspaceId: scope.id },
        include: { inventoryItem: true, warehouse: true, location: true },
      });
      if (!lot) throw new NotFoundException("Incoming material lot not found.");
      const held = decimal(lot.holdQuantity);
      if (held.lessThanOrEqualTo(0))
        throw new BadRequestException(
          "This lot has no quarantined quantity awaiting inspection.",
        );
      const accepted = decimal(dto.acceptedQuantity).toDecimalPlaces(
        4,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      const rejected = decimal(dto.rejectedQuantity).toDecimalPlaces(
        4,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      const parameterCodes = dto.results.map((result) =>
        result.parameterCode.trim().toUpperCase(),
      );
      if (new Set(parameterCodes).size !== parameterCodes.length)
        throw new BadRequestException(
          "Inspection parameter codes must be unique within one decision.",
        );
      const issues = validateIncomingInspection({
        heldQuantity: held.toNumber(),
        sampleQuantity: dto.sampleQuantity,
        acceptedQuantity: accepted.toNumber(),
        rejectedQuantity: rejected.toNumber(),
        decision: dto.decision,
        results: dto.results,
        reason: dto.reason,
      });
      if (issues.length) throw new BadRequestException(issues.join(" "));
      if (dto.decision === "RELEASED") {
        assertLotDateValidity(
          lot,
          transactionDate,
          "at incoming quality release",
        );
      }
      const updated = await tx.manufacturingInventoryLot.update({
        where: { id: lot.id },
        data: {
          holdQuantity: { decrement: held },
          availableQuantity: { increment: accepted },
          rejectedQuantity: { increment: rejected },
        },
        include: { inventoryItem: true, warehouse: true, location: true },
      });
      await this.audit(tx, scope, currentUser, {
        workflowCode: "INCOMING_MATERIAL_INSPECTION",
        entityType: "ManufacturingInventoryLot",
        entityId: lot.id,
        transactionDate,
        idempotencyKey: dto.idempotencyKey,
        title: `${lot.lotNumber} ${dto.decision.toLowerCase()} after incoming inspection`,
        note: dto.note,
        evidence: {
          decision: dto.decision,
          sampleQuantity: String(dto.sampleQuantity),
          acceptedQuantity: accepted.toString(),
          rejectedQuantity: rejected.toString(),
          reason: text(dto.reason),
          results: dto.results.map((result, index) => ({
            ...result,
            sequence: index + 1,
          })),
        },
      });
      return {
        lot: this.mapLot(updated),
        decision: dto.decision,
        replayed: false,
      };
    });
  }

  private requisitionInclude() {
    return {
      order: {
        select: {
          orderNumber: true,
          status: true,
          transactions: {
            where: {
              status: "POSTED" as const,
              transactionType: {
                in: [
                  ManufacturingTransactionType.MATERIAL_ISSUE,
                  ManufacturingTransactionType.MATERIAL_RETURN,
                ],
              },
            },
            select: {
              orderLotId: true,
              transactionType: true,
              lines: {
                select: {
                  inventoryItemId: true,
                  orderMaterialId: true,
                  sourceInventoryLotId: true,
                  destinationInventoryLotId: true,
                  quantity: true,
                },
              },
            },
          },
        },
      },
      reservation: {
        include: {
          lines: {
            include: {
              inventoryItem: { select: { itemCode: true, itemName: true } },
              inventoryLot: {
                include: {
                  location: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      disposition: true,
                      isActive: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" as const },
          },
        },
      },
      lines: {
        include: {
          inventoryItem: { select: { itemCode: true, itemName: true } },
          orderMaterial: {
            select: {
              id: true,
              plannedQuantity: true,
              reservedQuantity: true,
              issuedQuantity: true,
            },
          },
          sourceInventoryLot: {
            select: {
              id: true,
              lotNumber: true,
              warehouseId: true,
              locationId: true,
              expiresAt: true,
              availableQuantity: true,
              reservedQuantity: true,
              location: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  disposition: true,
                  isActive: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" as const },
      },
    };
  }

  private mapRequisition(
    row: Prisma.ManufacturingTransactionGetPayload<{
      include: ReturnType<ManufacturingMaterialsService["requisitionInclude"]>;
    }>,
  ) {
    const lotBalances = (line: {
      inventoryItemId: string;
      orderMaterialId: string | null;
      inventoryLotId: string | null;
    }) => {
      const balances = new Map<
        string,
        { issued: Prisma.Decimal; returned: Prisma.Decimal }
      >();
      for (const transaction of row.order?.transactions ?? []) {
        if (!transaction.orderLotId) continue;
        for (const transactionLine of transaction.lines ?? []) {
          if (
            transactionLine.inventoryItemId !== line.inventoryItemId ||
            transactionLine.orderMaterialId !== line.orderMaterialId
          )
            continue;
          const exactLotMatches =
            transaction.transactionType === "MATERIAL_ISSUE"
              ? transactionLine.sourceInventoryLotId === line.inventoryLotId
              : transactionLine.destinationInventoryLotId ===
                line.inventoryLotId;
          if (!exactLotMatches) continue;
          const balance = balances.get(transaction.orderLotId) ?? {
            issued: decimal(0),
            returned: decimal(0),
          };
          if (transaction.transactionType === "MATERIAL_ISSUE")
            balance.issued = balance.issued.add(transactionLine.quantity);
          else
            balance.returned = balance.returned.add(transactionLine.quantity);
          balances.set(transaction.orderLotId, balance);
        }
      }
      return [...balances.entries()].map(([orderLotId, balance]) => ({
        orderLotId,
        issuedQuantity: balance.issued.toNumber(),
        returnedQuantity: balance.returned.toNumber(),
        returnableQuantity: Prisma.Decimal.max(
          balance.issued.sub(balance.returned),
          0,
        ).toNumber(),
      }));
    };
    const approvedLines = row.lines.map((line) => ({
      id: line.id,
      sourceDocumentLineId: line.id,
      orderMaterialId: line.orderMaterialId,
      inventoryItemId: line.inventoryItemId,
      itemCode: line.inventoryItem.itemCode,
      itemName: line.inventoryItem.itemName,
      inventoryLotId: line.sourceInventoryLotId,
      lotNumber: line.sourceInventoryLot?.lotNumber ?? null,
      lotLocationId: line.sourceInventoryLot?.locationId ?? null,
      lotLocationCode: line.sourceInventoryLot?.location?.code ?? null,
      lotLocationName: line.sourceInventoryLot?.location?.name ?? null,
      lotDisposition: line.sourceInventoryLot?.location?.disposition ?? null,
      expiresAt: line.sourceInventoryLot?.expiresAt?.toISOString() ?? null,
      quantity: decimal(line.quantity).toNumber(),
      unit: line.unit,
      lotAvailableQuantity: decimal(
        line.sourceInventoryLot?.availableQuantity,
      ).toNumber(),
      lotReservedQuantity: decimal(
        line.sourceInventoryLot?.reservedQuantity,
      ).toNumber(),
      lotBalances: lotBalances({
        inventoryItemId: line.inventoryItemId,
        orderMaterialId: line.orderMaterialId,
        inventoryLotId: line.sourceInventoryLotId,
      }),
    }));
    const allocationLines = (row.reservation?.lines ?? []).map((line) => {
      const sourceDocumentLine = row.lines.find(
        (entry) =>
          entry.orderMaterialId === line.orderMaterialId &&
          entry.inventoryItemId === line.inventoryItemId,
      );
      return {
        id: line.id,
        sourceDocumentLineId: sourceDocumentLine?.id ?? null,
        orderMaterialId: line.orderMaterialId,
        inventoryItemId: line.inventoryItemId,
        itemCode: line.inventoryItem.itemCode,
        itemName: line.inventoryItem.itemName,
        inventoryLotId: line.inventoryLotId,
        lotNumber: line.inventoryLot?.lotNumber ?? null,
        lotLocationId: line.inventoryLot?.locationId ?? null,
        lotLocationCode: line.inventoryLot?.location?.code ?? null,
        lotLocationName: line.inventoryLot?.location?.name ?? null,
        lotDisposition: line.inventoryLot?.location?.disposition ?? null,
        expiresAt: line.inventoryLot?.expiresAt?.toISOString() ?? null,
        quantity: Prisma.Decimal.max(
          decimal(line.quantity)
            .sub(line.issuedQuantity)
            .sub(line.releasedQuantity),
          0,
        ).toNumber(),
        unit: line.unit,
        lotAvailableQuantity: decimal(
          line.inventoryLot?.availableQuantity,
        ).toNumber(),
        lotReservedQuantity: decimal(
          line.inventoryLot?.reservedQuantity,
        ).toNumber(),
        lotBalances: lotBalances({
          inventoryItemId: line.inventoryItemId,
          orderMaterialId: line.orderMaterialId,
          inventoryLotId: line.inventoryLotId,
        }),
      };
    });
    return {
      id: row.id,
      requisitionNumber: row.transactionNumber,
      status: row.status,
      transactionDate: row.transactionDate.toISOString(),
      orderId: row.orderId,
      orderNumber: row.order?.orderNumber ?? null,
      orderStatus: row.order?.status ?? null,
      warehouseId: row.fromWarehouseId,
      locationId: row.fromLocationId,
      reservation: row.reservation
        ? {
            id: row.reservation.id,
            reservationNumber: row.reservation.reservationNumber,
            status: row.reservation.status,
          }
        : null,
      note: row.notes,
      createdAt: row.createdAt.toISOString(),
      approvedLines,
      lines: row.reservation ? allocationLines : approvedLines,
    };
  }

  async listRequisitions(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const rows = await this.prisma.manufacturingTransaction.findMany({
      where: {
        workspaceId: scope.id,
        transactionType: "MATERIAL_REQUISITION",
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.status
          ? { status: query.status as ManufacturingTransactionStatus }
          : {}),
      },
      include: this.requisitionInclude(),
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    return rows.map((row) => this.mapRequisition(row));
  }

  async listVerifiers(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: scope.id, userId: { not: currentUser.id } },
      select: {
        userId: true,
        user: { select: { name: true } },
        tenantMember: { select: { membershipRole: true } },
      },
      orderBy: { joinedAt: "asc" },
    });
    return members.map((member) => ({
      id: member.userId,
      name: member.user.name,
      membershipRole: member.tenantMember.membershipRole,
    }));
  }

  async getRequisition(
    currentUser: AuthenticatedRequestUser,
    requisitionId: string,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    const row = await this.prisma.manufacturingTransaction.findFirst({
      where: {
        id: requisitionId,
        workspaceId: scope.id,
        transactionType: "MATERIAL_REQUISITION",
      },
      include: this.requisitionInclude(),
    });
    if (!row) throw new NotFoundException("Material requisition not found.");
    return this.mapRequisition(row);
  }

  private async issueDocumentNumber(
    tx: Prisma.TransactionClient,
    scope: Scope,
    currentUser: AuthenticatedRequestUser,
    issuedAt: Date,
    idempotencyKey: string,
    entityId: string,
  ) {
    const issued = await issueManufacturingDocumentNumberTx(
      tx,
      scope,
      currentUser.id,
      {
        documentKind: "MATERIAL_REQUISITION",
        issuedAt,
        idempotencyKey,
        entityType: "ManufacturingTransaction",
        entityId,
        validateIssuedAtOnReplay: true,
      },
    );
    return issued.documentNumber;
  }

  async createRequisition(
    currentUser: AuthenticatedRequestUser,
    dto: CreateMaterialRequisitionDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.material.reserve");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const transactionDate = date(dto.transactionDate, "transactionDate");
    const replay = await this.prisma.manufacturingTransaction.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
      include: this.requisitionInclude(),
    });
    if (replay) {
      if (
        replay.transactionType !== "MATERIAL_REQUISITION" ||
        replay.orderId !== dto.orderId
      )
        throw new ConflictException(
          "Idempotency key is already used by another manufacturing transaction.",
        );
      return { requisition: this.mapRequisition(replay), replayed: true };
    }
    if (
      new Set(
        dto.lines.map(
          (line) => `${line.orderMaterialId}:${line.inventoryLotId}`,
        ),
      ).size !== dto.lines.length
    ) {
      throw new BadRequestException(
        "A source lot may appear only once for each order material.",
      );
    }
    try {
      return await this.serializable(async (tx) => {
        await this.assertPeriodOpen(
          tx,
          scope.id,
          transactionDate,
          "Material requisition",
        );
        const order = await tx.manufacturingOrder.findFirst({
          where: { id: dto.orderId, workspaceId: scope.id },
          include: {
            materials: {
              include: {
                inventoryItem: {
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
            },
          },
        });
        if (!order)
          throw new NotFoundException("Manufacturing order not found.");
        if (
          !["APPROVED", "RESERVED", "ISSUED", "IN_PRODUCTION"].includes(
            order.status,
          )
        ) {
          throw new BadRequestException(
            `Material requisition cannot be created while the order is ${order.status}.`,
          );
        }
        const lotIds = [
          ...new Set(dto.lines.map((line) => line.inventoryLotId)),
        ];
        const lots = await tx.manufacturingInventoryLot.findMany({
          where: { id: { in: lotIds }, workspaceId: scope.id },
        });
        const lotById = new Map(lots.map((lot) => [lot.id, lot]));
        const requestedByMaterial = new Map<string, Prisma.Decimal>();
        const unitConversions: ManufacturingUnitConversionEvidence[] = [];
        const lineData = dto.lines.map((line, index) => {
          const material = order.materials.find(
            (row) => row.id === line.orderMaterialId,
          );
          if (!material)
            throw new BadRequestException(
              `Requisition line ${index + 1} does not reference an order material.`,
            );
          const lot = lotById.get(line.inventoryLotId);
          if (
            !lot ||
            lot.inventoryItemId !== material.inventoryItemId ||
            lot.warehouseId !== order.issueWarehouseId
          ) {
            throw new BadRequestException(
              `Requisition line ${index + 1} source lot must contain the same material in the order issue warehouse.`,
            );
          }
          if (
            material.unit.trim().toLowerCase() !==
              material.inventoryItem.unit.trim().toLowerCase() ||
            lot.unit.trim().toLowerCase() !==
              material.inventoryItem.unit.trim().toLowerCase()
          ) {
            throw new BadRequestException(
              `Lot ${lot.lotNumber} or its order material is not recorded in the authoritative stock/base unit (${material.inventoryItem.unit}).`,
            );
          }
          if (
            decimal(lot.holdQuantity).greaterThan(0) ||
            decimal(lot.availableQuantity).lessThanOrEqualTo(0)
          ) {
            throw new BadRequestException(
              `Lot ${lot.lotNumber} is not released for allocation.`,
            );
          }
          assertLotDateValidity(
            lot,
            transactionDate,
            "on the requisition date",
          );
          const normalized = normalizedStockQuantity(
            material.inventoryItem,
            line.quantity,
            line.unit ?? material.unit,
            `Requisition line ${index + 1} quantity`,
          );
          const quantity = normalized.quantity;
          unitConversions.push(normalized.evidence);
          requestedByMaterial.set(
            material.id,
            (requestedByMaterial.get(material.id) ?? decimal(0)).add(quantity),
          );
          return {
            inventoryItemId: material.inventoryItemId,
            orderMaterialId: material.id,
            sourceInventoryLotId: lot.id,
            quantity,
            unit: material.unit,
          };
        });
        for (const material of order.materials) {
          const requested = requestedByMaterial.get(material.id) ?? decimal(0);
          const outstanding = decimal(material.plannedQuantity)
            .sub(material.issuedQuantity)
            .sub(material.reservedQuantity);
          if (requested.greaterThan(outstanding))
            throw new BadRequestException(
              `Requested quantity exceeds the unreserved requirement for material ${material.inventoryItemId}.`,
            );
        }
        const requisitionId = manufacturingEntityIdFromIdempotency(
          scope.id,
          "ManufacturingTransaction",
          dto.idempotencyKey,
        );
        const requisitionNumber = await this.issueDocumentNumber(
          tx,
          scope,
          currentUser,
          transactionDate,
          `MRQ:DOC:${dto.idempotencyKey}`,
          requisitionId,
        );
        const requisition = await tx.manufacturingTransaction.create({
          data: {
            id: requisitionId,
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            transactionNumber: requisitionNumber,
            transactionType: "MATERIAL_REQUISITION",
            status: "DRAFT",
            transactionDate,
            orderId: order.id,
            fromWarehouseId: order.issueWarehouseId,
            fromLocationId: order.issueLocationId,
            referenceNo: order.orderNumber,
            notes: text(dto.note),
            idempotencyKey: dto.idempotencyKey,
            createdByUserId: currentUser.id,
            lines: { create: lineData },
          },
          include: this.requisitionInclude(),
        });
        await this.audit(tx, scope, currentUser, {
          workflowCode: "MATERIAL_REQUISITION_CREATED",
          entityType: "ManufacturingTransaction",
          entityId: requisition.id,
          orderId: order.id,
          transactionDate,
          idempotencyKey: `MRQ:AUDIT:${dto.idempotencyKey}`,
          title: `${requisitionNumber} created`,
          note: dto.note,
          evidence: {
            requisitionNumber,
            status: "DRAFT",
            sourceLotIds: lotIds,
            unitConversions,
          },
        });
        return {
          requisition: this.mapRequisition(requisition),
          replayed: false,
        };
      });
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "The requisition number or idempotency key is already in use.",
        );
      throw error;
    }
  }

  async submitRequisition(
    currentUser: AuthenticatedRequestUser,
    requisitionId: string,
    dto: MaterialRequisitionTransitionDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.material.reserve");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const transactionDate = date(dto.transactionDate, "transactionDate");
    const auditKey = `MRQ:SUBMIT:${dto.idempotencyKey}`;
    const replay = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: auditKey,
        },
      },
    });
    if (replay) {
      if (
        replay.workflowCode !== "MATERIAL_REQUISITION_SUBMITTED" ||
        replay.entityId !== requisitionId
      ) {
        throw new ConflictException(
          "Idempotency key is already used for a different requisition transition.",
        );
      }
      return {
        requisition: await this.getRequisition(
          currentUser,
          requisitionId,
          scope.id,
        ),
        replayed: true,
      };
    }
    return this.serializable(async (tx) => {
      await this.assertPeriodOpen(
        tx,
        scope.id,
        transactionDate,
        "Material requisition submit",
      );
      const row = await tx.manufacturingTransaction.findFirst({
        where: {
          id: requisitionId,
          workspaceId: scope.id,
          transactionType: "MATERIAL_REQUISITION",
        },
      });
      if (!row) throw new NotFoundException("Material requisition not found.");
      if (row.status !== "DRAFT")
        throw new BadRequestException(
          `Only a DRAFT requisition can be submitted; this requisition is ${row.status}.`,
        );
      await tx.manufacturingTransaction.update({
        where: { id: row.id },
        data: {
          status: "SUBMITTED",
          submittedAt: transactionDate,
          notes: text(dto.note) ?? row.notes,
        },
      });
      await this.audit(tx, scope, currentUser, {
        workflowCode: "MATERIAL_REQUISITION_SUBMITTED",
        entityType: "ManufacturingTransaction",
        entityId: row.id,
        orderId: row.orderId,
        transactionDate,
        idempotencyKey: auditKey,
        title: `${row.transactionNumber} submitted`,
        note: dto.note,
        evidence: {
          requisitionNumber: row.transactionNumber,
          fromStatus: "DRAFT",
          toStatus: "SUBMITTED",
        },
      });
      const updated = await tx.manufacturingTransaction.findUniqueOrThrow({
        where: { id: row.id },
        include: this.requisitionInclude(),
      });
      return { requisition: this.mapRequisition(updated), replayed: false };
    });
  }

  async approveRequisition(
    currentUser: AuthenticatedRequestUser,
    requisitionId: string,
    dto: MaterialRequisitionTransitionDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.order.approve");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const transactionDate = date(dto.transactionDate, "transactionDate");
    const auditKey = `MRQ:APPROVE:${dto.idempotencyKey}`;
    const replay = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: auditKey,
        },
      },
    });
    if (replay) {
      if (
        replay.workflowCode !== "MATERIAL_REQUISITION_APPROVED" ||
        replay.entityId !== requisitionId
      ) {
        throw new ConflictException(
          "Idempotency key is already used for a different requisition transition.",
        );
      }
      return {
        requisition: await this.getRequisition(
          currentUser,
          requisitionId,
          scope.id,
        ),
        replayed: true,
      };
    }
    return this.serializable(async (tx) => {
      await this.assertPeriodOpen(
        tx,
        scope.id,
        transactionDate,
        "Material requisition approval",
      );
      const row = await tx.manufacturingTransaction.findFirst({
        where: {
          id: requisitionId,
          workspaceId: scope.id,
          transactionType: "MATERIAL_REQUISITION",
        },
        include: {
          order: { include: { materials: true } },
          lines: { include: { sourceInventoryLot: true } },
        },
      });
      if (!row) throw new NotFoundException("Material requisition not found.");
      if (row.status !== "SUBMITTED")
        throw new BadRequestException(
          `Only a SUBMITTED requisition can be approved; this requisition is ${row.status}.`,
        );
      if (!row.lines.length)
        throw new BadRequestException(
          "A material requisition requires at least one line.",
        );
      const totalsByMaterial = new Map<string, Prisma.Decimal>();
      for (const line of row.lines) {
        if (
          !line.orderMaterialId ||
          !line.sourceInventoryLotId ||
          !line.sourceInventoryLot
        )
          throw new BadRequestException(
            "Every requisition line requires an order material and released source lot.",
          );
        const lot = line.sourceInventoryLot;
        if (
          lot.workspaceId !== scope.id ||
          lot.inventoryItemId !== line.inventoryItemId ||
          lot.warehouseId !== row.fromWarehouseId
        ) {
          throw new BadRequestException(
            `Source lot ${lot.lotNumber} is outside the requisition scope.`,
          );
        }
        if (decimal(lot.holdQuantity).greaterThan(0))
          throw new BadRequestException(
            `Source lot ${lot.lotNumber} is on quality hold.`,
          );
        assertLotDateValidity(lot, transactionDate, "at requisition approval");
        const allocatable = decimal(lot.availableQuantity).sub(
          lot.reservedQuantity,
        );
        if (allocatable.lessThan(line.quantity))
          throw new BadRequestException(
            `Source lot ${lot.lotNumber} has only ${Prisma.Decimal.max(allocatable, 0).toString()} ${lot.unit} allocatable.`,
          );
        totalsByMaterial.set(
          line.orderMaterialId,
          (totalsByMaterial.get(line.orderMaterialId) ?? decimal(0)).add(
            line.quantity,
          ),
        );
      }
      for (const [materialId, requested] of totalsByMaterial) {
        const material = row.order.materials.find(
          (entry) => entry.id === materialId,
        );
        if (!material)
          throw new BadRequestException(
            "Requisition references a material outside its production order.",
          );
        const outstanding = decimal(material.plannedQuantity)
          .sub(material.issuedQuantity)
          .sub(material.reservedQuantity);
        if (requested.greaterThan(outstanding))
          throw new BadRequestException(
            `Approved quantity exceeds the remaining requirement for material ${material.inventoryItemId}.`,
          );
      }
      const reservation = await tx.manufacturingReservation.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          reservationNumber: row.transactionNumber,
          orderId: row.orderId,
          warehouseId: row.fromWarehouseId!,
          locationId: row.fromLocationId,
          reservedAt: transactionDate,
          createdByUserId: currentUser.id,
          lines: {
            create: row.lines.map((line) => ({
              orderMaterialId: line.orderMaterialId,
              inventoryItemId: line.inventoryItemId,
              inventoryLotId: line.sourceInventoryLotId,
              quantity: line.quantity,
              unit: line.unit,
            })),
          },
        },
        include: { lines: true },
      });
      for (const line of row.lines) {
        await tx.manufacturingInventoryLot.update({
          where: { id: line.sourceInventoryLotId! },
          data: { reservedQuantity: { increment: line.quantity } },
        });
      }
      for (const [materialId, requested] of totalsByMaterial) {
        const material = row.order.materials.find(
          (entry) => entry.id === materialId,
        )!;
        const resultingReserved = decimal(material.reservedQuantity).add(
          requested,
        );
        await tx.manufacturingOrderMaterial.update({
          where: { id: materialId },
          data: {
            reservedQuantity: { increment: requested },
            status: resultingReserved
              .add(material.issuedQuantity)
              .greaterThanOrEqualTo(material.plannedQuantity)
              ? "RESERVED"
              : "PARTIALLY_RESERVED",
          },
        });
      }
      const fullyReserved = row.order.materials.every((material) =>
        decimal(material.issuedQuantity)
          .add(material.reservedQuantity)
          .add(totalsByMaterial.get(material.id) ?? 0)
          .greaterThanOrEqualTo(material.plannedQuantity),
      );
      // A late packaging or top-up requisition may be approved after raw
      // materials have already moved the order to ISSUED/IN_PRODUCTION. Never
      // regress that lifecycle merely because the newly requested lines are
      // now fully reserved; only promote an otherwise APPROVED order.
      const resultingOrderStatus = manufacturingOrderStatusAfterReservation(
        row.order.status,
        fullyReserved,
      );
      await tx.manufacturingOrder.update({
        where: { id: row.orderId },
        data: { status: resultingOrderStatus },
      });
      await tx.manufacturingTransaction.update({
        where: { id: row.id },
        data: {
          status: "APPROVED",
          reservationId: reservation.id,
          approvedAt: transactionDate,
          notes: text(dto.note) ?? row.notes,
        },
      });
      await this.audit(tx, scope, currentUser, {
        workflowCode: "MATERIAL_REQUISITION_APPROVED",
        entityType: "ManufacturingTransaction",
        entityId: row.id,
        orderId: row.orderId,
        transactionDate,
        idempotencyKey: auditKey,
        title: `${row.transactionNumber} approved and source lots reserved`,
        note: dto.note,
        evidence: {
          requisitionNumber: row.transactionNumber,
          reservationId: reservation.id,
          reservationNumber: reservation.reservationNumber,
          sourceLotIds: row.lines.map((line) => line.sourceInventoryLotId),
        },
      });
      const updated = await tx.manufacturingTransaction.findUniqueOrThrow({
        where: { id: row.id },
        include: this.requisitionInclude(),
      });
      return { requisition: this.mapRequisition(updated), replayed: false };
    });
  }

  async recordHandlingEvidence(
    currentUser: AuthenticatedRequestUser,
    dto: RecordMaterialHandlingEvidenceDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.material.issue");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const transactionDate = date(dto.transactionDate, "transactionDate");
    const rawStageQuantity =
      dto.quantity == null ? null : new Prisma.Decimal(dto.quantity);
    if (dto.stage === "STAGED" && rawStageQuantity == null)
      throw new BadRequestException(
        "STAGED requires the exact reserved quantity to move.",
      );
    if (dto.stage !== "STAGED" && rawStageQuantity != null)
      throw new BadRequestException(
        "quantity is accepted only when posting a STAGED location transfer.",
      );
    if (rawStageQuantity && rawStageQuantity.decimalPlaces() > 4)
      throw new BadRequestException(
        "Staging quantity cannot contain more than four decimal places.",
      );
    const stageQuantity = rawStageQuantity
      ? positiveQuantity(rawStageQuantity, "Staging quantity")
      : null;
    const requestSignature = signature([
      scope.id,
      dto.requisitionId,
      dto.requisitionLineId,
      dto.orderLotId,
      dto.stage,
      dto.barcode.trim().toUpperCase(),
      dto.locationId,
      dto.verifierUserId,
      dto.transactionId,
      stageQuantity?.toString(),
      transactionDate.toISOString(),
    ]);

    const replayResult = async (review: MaterialHandlingReplayReview) => {
      const replayEvidence = evidenceObject(review.evidence);
      if (
        replayEvidence.requestSignature !== requestSignature ||
        replayEvidence.sourceRequisitionLineId !== dto.requisitionLineId ||
        replayEvidence.orderLotId !== dto.orderLotId ||
        replayEvidence.stage !== dto.stage
      )
        throw new ConflictException(
          "Idempotency key is already used for different material handling evidence.",
        );
      const stagingTransactionId = text(replayEvidence.stagingTransactionId);
      const transaction = stagingTransactionId
        ? await this.prisma.manufacturingTransaction.findFirst({
            where: {
              id: stagingTransactionId,
              workspaceId: scope.id,
              transactionType: "LOCATION_TRANSFER",
              status: "POSTED",
            },
            select: {
              id: true,
              transactionNumber: true,
              transactionType: true,
            },
          })
        : null;
      return {
        review,
        transaction,
        stagedInventoryLotId: text(replayEvidence.stagedInventoryLotId) ?? null,
        stagedRequisitionLineId:
          text(replayEvidence.stagedRequisitionLineId) ?? null,
        stagedLocationId: text(replayEvidence.stagedLocationId) ?? null,
        replayed: true,
      };
    };
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
        replay.workflowCode !== "MATERIAL_HANDLING_EVIDENCE" ||
        replay.entityId !== dto.requisitionId
      )
        throw new ConflictException(
          "Idempotency key is already used by another manufacturing operation.",
        );
      return replayResult(replay);
    }
    try {
      return await this.serializable(async (tx) => {
        await this.assertPeriodOpen(
          tx,
          scope.id,
          transactionDate,
          dto.stage === "STAGED"
            ? "Material staging location transfer"
            : "Material handling evidence",
        );
        const requisition = await tx.manufacturingTransaction.findFirst({
          where: {
            id: dto.requisitionId,
            workspaceId: scope.id,
            transactionType: "MATERIAL_REQUISITION",
            status: "APPROVED",
          },
          include: {
            order: { include: { lots: true } },
            reservation: {
              include: {
                lines: {
                  include: {
                    inventoryItem: true,
                    inventoryLot: {
                      include: { location: true, warehouse: true },
                    },
                  },
                },
              },
            },
            lines: {
              include: {
                inventoryItem: true,
                sourceInventoryLot: {
                  include: { location: true, warehouse: true },
                },
              },
            },
          },
        });
        if (!requisition)
          throw new BadRequestException(
            "An approved material requisition is required.",
          );
        if (
          !["APPROVED", "RESERVED", "ISSUED", "IN_PRODUCTION"].includes(
            requisition.order.status,
          )
        )
          throw new BadRequestException(
            `Material handling is blocked while the production order is ${requisition.order.status}.`,
          );
        if (!requisition.order.lots.some((lot) => lot.id === dto.orderLotId))
          throw new BadRequestException(
            "The production lot does not belong to the requisition order.",
          );
        const reservationLine = requisition.reservation?.lines.find(
          (line) => line.id === dto.requisitionLineId,
        );
        if (!reservationLine?.inventoryLotId || !reservationLine.inventoryLot)
          throw new BadRequestException(
            "Select a current allocation line with an exact reserved inventory lot.",
          );
        const sourceLot = reservationLine.inventoryLot;
        let approvedSourceLotId = sourceLot.id;
        if (sourceLot.location?.disposition === "STAGING") {
          const lineage = await tx.manufacturingGenealogy.findFirst({
            where: {
              workspaceId: scope.id,
              orderId: requisition.orderId,
              orderLotId: dto.orderLotId,
              childInventoryLotId: sourceLot.id,
              relationshipType: "LOCATION_STAGING_SPLIT",
            },
            select: { parentInventoryLotId: true },
          });
          if (!lineage?.parentInventoryLotId)
            throw new BadRequestException(
              "The staged child lot has no posted source-lot genealogy.",
            );
          approvedSourceLotId = lineage.parentInventoryLotId;
        }
        const approvedRequisitionLine = requisition.lines.find(
          (line) =>
            line.orderMaterialId === reservationLine.orderMaterialId &&
            line.inventoryItemId === reservationLine.inventoryItemId &&
            line.sourceInventoryLotId === approvedSourceLotId,
        );
        if (!approvedRequisitionLine)
          throw new BadRequestException(
            "The current reservation line does not trace back to an approved requisition line.",
          );
        if (!sourceLot.location?.isActive)
          throw new BadRequestException(
            "The selected source lot is not held at an active manufacturing location.",
          );
        const identityIssues = validateMaterialHandlingIdentity({
          requisitionLineId: dto.requisitionLineId,
          expectedRequisitionLineId: reservationLine.id,
          inventoryItemId: reservationLine.inventoryItemId,
          expectedInventoryItemId: reservationLine.inventoryItemId,
          inventoryLotId: sourceLot.id,
          expectedInventoryLotId: reservationLine.inventoryLotId,
          itemCode: reservationLine.inventoryItem.itemCode,
          lotNumber: sourceLot.lotNumber,
          scannedCode: dto.barcode,
        });
        if (identityIssues.length)
          throw new BadRequestException(identityIssues.join(" "));
        if (!dto.locationId)
          throw new BadRequestException(
            `${dto.stage} requires an explicit manufacturing location.`,
          );
        const location = await tx.manufacturingLocation.findFirst({
          where: { id: dto.locationId, workspaceId: scope.id, isActive: true },
        });
        if (!location)
          throw new BadRequestException(
            "Handling location is not active in this workspace.",
          );
        const expectedDisposition =
          dto.stage === "ISSUE_SCAN" ? "WIP" : "STAGING";
        if (location.disposition !== expectedDisposition)
          throw new BadRequestException(
            `${dto.stage} requires an active ${expectedDisposition} manufacturing location.`,
          );
        if (dto.stage === "STAGED") {
          if (sourceLot.location.disposition !== "RELEASED")
            throw new BadRequestException(
              "STAGED can move only a reserved lot from an active RELEASED location.",
            );
          if (
            !sourceLot.warehouse.isActive ||
            sourceLot.warehouse.deletedAt ||
            location.warehouseId !== sourceLot.warehouseId
          )
            throw new BadRequestException(
              "Staging must remain inside the active source warehouse.",
            );
          if (location.id === sourceLot.locationId)
            throw new BadRequestException(
              "Source and staging locations must be different.",
            );
          if (decimal(sourceLot.holdQuantity).greaterThan(0))
            throw new BadRequestException(
              `Source lot ${sourceLot.lotNumber} is on quality hold.`,
            );
          assertLotDateValidity(sourceLot, transactionDate, "during staging");
          if (
            sourceLot.unit.trim().toLowerCase() !==
            reservationLine.inventoryItem.unit.trim().toLowerCase()
          )
            throw new BadRequestException(
              `Source lot ${sourceLot.lotNumber} is not stored in the authoritative base unit (${reservationLine.inventoryItem.unit}).`,
            );
        } else if (
          ["VERIFIED", "ISSUE_SCAN", "RETURN_SCAN"].includes(dto.stage) &&
          sourceLot.location.disposition !== "STAGING"
        ) {
          throw new BadRequestException(
            `${dto.stage} must resolve the persisted staged child lot.`,
          );
        }
        if (
          ["STAGED", "VERIFIED", "RETURN_SCAN"].includes(dto.stage) &&
          location.warehouseId !== sourceLot.warehouseId
        )
          throw new BadRequestException(
            "Handling location does not belong to the source-lot warehouse.",
          );
        if (dto.stage === "VERIFIED" && !dto.verifierUserId)
          throw new BadRequestException(
            "VERIFIED requires an independent verifier user ID.",
          );
        if (dto.verifierUserId) {
          if (dto.verifierUserId === currentUser.id)
            throw new BadRequestException(
              "Operator and verifier must be different users.",
            );
          const member = await tx.workspaceMember.findFirst({
            where: { workspaceId: scope.id, userId: dto.verifierUserId },
          });
          if (!member)
            throw new BadRequestException(
              "Verifier is not a member of this workspace.",
            );
        }

        if (dto.stage === "STAGED") {
          if (!requisition.reservation || !requisition.reservationId)
            throw new BadRequestException(
              "The approved requisition has no active source-lot reservation.",
            );
          if (
            !["ACTIVE", "PARTIALLY_ISSUED"].includes(
              requisition.reservation.status,
            )
          )
            throw new BadRequestException(
              `The source-lot reservation is ${requisition.reservation.status} and cannot be staged.`,
            );
          const quantity = stageQuantity!;
          const reservationOutstanding = decimal(reservationLine.quantity)
            .sub(reservationLine.issuedQuantity)
            .sub(reservationLine.releasedQuantity);
          if (quantity.greaterThan(reservationOutstanding))
            throw new BadRequestException(
              `Staging quantity exceeds the exact reserved balance (${reservationOutstanding.toString()} ${reservationLine.unit}).`,
            );
          if (
            decimal(sourceLot.availableQuantity).lessThan(quantity) ||
            decimal(sourceLot.reservedQuantity).lessThan(quantity)
          )
            throw new ConflictException(
              "The source-lot available or reserved balance changed; reload before staging.",
            );
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
              "Staging date must be inside an open fiscal year.",
            );
          const transferId = manufacturingEntityIdFromIdempotency(
            scope.id,
            "ManufacturingTransaction",
            `MATERIAL-STAGING:${dto.idempotencyKey}`,
          );
          const transferLineId = manufacturingEntityIdFromIdempotency(
            scope.id,
            "ManufacturingTransactionLine",
            `MATERIAL-STAGING-LINE:${dto.idempotencyKey}`,
          );
          const stagedInventoryLotId = manufacturingEntityIdFromIdempotency(
            scope.id,
            "ManufacturingInventoryLot",
            `MATERIAL-STAGING-LOT:${dto.idempotencyKey}`,
          );
          const stagedLotNumber = `${sourceLot.lotNumber}-STG-${signature([
            scope.id,
            dto.idempotencyKey,
          ])
            .slice(0, 8)
            .toUpperCase()}`;
          const transactionNumber = `MLT-${transactionDate
            .toISOString()
            .slice(0, 10)
            .replaceAll("-", "")}-${signature([scope.id, dto.idempotencyKey])
            .slice(0, 10)
            .toUpperCase()}`;
          const sourceBalanceBefore = {
            availableQuantity: decimal(sourceLot.availableQuantity).toString(),
            reservedQuantity: decimal(sourceLot.reservedQuantity).toString(),
          };
          const moved = await tx.manufacturingInventoryLot.updateMany({
            where: {
              id: sourceLot.id,
              workspaceId: scope.id,
              warehouseId: sourceLot.warehouseId,
              locationId: sourceLot.locationId,
              availableQuantity: { gte: quantity },
              reservedQuantity: { gte: quantity },
            },
            data: {
              availableQuantity: { decrement: quantity },
              reservedQuantity: { decrement: quantity },
            },
          });
          if (moved.count !== 1)
            throw new ConflictException(
              "The source-lot balance changed while staging; no transfer was posted.",
            );
          const transfer = await tx.manufacturingTransaction.create({
            data: {
              id: transferId,
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              fiscalYearId: fiscalYear.id,
              transactionNumber,
              transactionType: "LOCATION_TRANSFER",
              status: "POSTED",
              transactionDate,
              orderId: requisition.orderId,
              orderLotId: dto.orderLotId,
              reservationId: requisition.reservationId,
              fromWarehouseId: sourceLot.warehouseId,
              toWarehouseId: sourceLot.warehouseId,
              fromLocationId: sourceLot.locationId,
              toLocationId: location.id,
              referenceNo: requisition.transactionNumber,
              notes: text(dto.note),
              idempotencyKey: `MATERIAL-STAGING:${dto.idempotencyKey}`,
              createdByUserId: currentUser.id,
              postedByUserId: currentUser.id,
              postedAt: transactionDate,
              lines: {
                create: {
                  id: transferLineId,
                  inventoryItemId: reservationLine.inventoryItemId,
                  orderMaterialId: reservationLine.orderMaterialId,
                  reservationLineId: reservationLine.id,
                  sourceInventoryLotId: sourceLot.id,
                  quantity,
                  unit: reservationLine.unit,
                  unitCost: sourceLot.unitCost,
                  totalCost: decimal(sourceLot.unitCost)
                    .mul(quantity)
                    .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP),
                  notes: `Same-warehouse staging from ${sourceLot.location.code} to ${location.code}`,
                },
              },
            },
            select: {
              id: true,
              transactionNumber: true,
              transactionType: true,
            },
          });
          await tx.manufacturingInventoryLot.create({
            data: {
              id: stagedInventoryLotId,
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              inventoryItemId: sourceLot.inventoryItemId,
              warehouseId: sourceLot.warehouseId,
              locationId: location.id,
              lotNumber: stagedLotNumber,
              receivedQuantity: quantity,
              availableQuantity: quantity,
              reservedQuantity: quantity,
              holdQuantity: 0,
              rejectedQuantity: 0,
              unit: sourceLot.unit,
              unitCost: sourceLot.unitCost,
              manufacturedAt: sourceLot.manufacturedAt,
              retestDueAt: sourceLot.retestDueAt,
              expiresAt: sourceLot.expiresAt,
              sourceTransactionLineId: transferLineId,
              createdByUserId: currentUser.id,
            },
          });
          await tx.manufacturingTransactionLine.update({
            where: { id: transferLineId },
            data: { destinationInventoryLotId: stagedInventoryLotId },
          });
          const canReassignExistingLines =
            quantity.equals(reservationLine.quantity) &&
            decimal(reservationLine.issuedQuantity).isZero() &&
            decimal(reservationLine.releasedQuantity).isZero();
          let stagedReservationLineId = reservationLine.id;
          if (canReassignExistingLines) {
            await tx.manufacturingReservationLine.update({
              where: { id: reservationLine.id },
              data: { inventoryLotId: stagedInventoryLotId },
            });
          } else {
            const sourceReservationBalance = decimal(
              reservationLine.quantity,
            ).sub(quantity);
            if (
              sourceReservationBalance.lessThan(
                decimal(reservationLine.issuedQuantity).add(
                  reservationLine.releasedQuantity,
                ),
              )
            )
              throw new ConflictException(
                "Staging would break the existing issued/released reservation history.",
              );
            await tx.manufacturingReservationLine.update({
              where: { id: reservationLine.id },
              data: { quantity: sourceReservationBalance },
            });
            stagedReservationLineId = manufacturingEntityIdFromIdempotency(
              scope.id,
              "ManufacturingReservationLine",
              `MATERIAL-STAGING-RESERVATION:${dto.idempotencyKey}`,
            );
            await tx.manufacturingReservationLine.create({
              data: {
                id: stagedReservationLineId,
                reservationId: requisition.reservationId,
                orderMaterialId: reservationLine.orderMaterialId,
                inventoryItemId: reservationLine.inventoryItemId,
                inventoryLotId: stagedInventoryLotId,
                quantity,
                unit: reservationLine.unit,
              },
            });
          }
          if (stagedReservationLineId !== reservationLine.id)
            await tx.manufacturingTransactionLine.update({
              where: { id: transferLineId },
              data: { reservationLineId: stagedReservationLineId },
            });
          await tx.manufacturingReservation.update({
            where: { id: requisition.reservationId },
            data: { locationId: null },
          });
          await tx.manufacturingGenealogy.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              orderId: requisition.orderId,
              orderLotId: dto.orderLotId,
              transactionLineId: transferLineId,
              parentInventoryLotId: sourceLot.id,
              childInventoryLotId: stagedInventoryLotId,
              relationshipType: "LOCATION_STAGING_SPLIT",
              quantity,
              unit: reservationLine.unit,
              createdByUserId: currentUser.id,
            },
          });
          const review = await this.audit(tx, scope, currentUser, {
            workflowCode: "MATERIAL_HANDLING_EVIDENCE",
            entityType: "ManufacturingTransaction",
            entityId: requisition.id,
            orderId: requisition.orderId,
            transactionDate,
            idempotencyKey: dto.idempotencyKey,
            title: `${requisition.transactionNumber} staged by location transfer`,
            note: dto.note,
            evidence: {
              requestSignature,
              stage: dto.stage,
              requisitionNumber: requisition.transactionNumber,
              sourceRequisitionLineId: reservationLine.id,
              stagedRequisitionLineId: stagedReservationLineId,
              approvedRequisitionLine: {
                id: approvedRequisitionLine.id,
                inventoryItemId: approvedRequisitionLine.inventoryItemId,
                orderMaterialId: approvedRequisitionLine.orderMaterialId,
                sourceInventoryLotId:
                  approvedRequisitionLine.sourceInventoryLotId,
                quantity: decimal(approvedRequisitionLine.quantity).toString(),
                unit: approvedRequisitionLine.unit,
              },
              orderLotId: dto.orderLotId,
              inventoryItemId: reservationLine.inventoryItemId,
              orderMaterialId: reservationLine.orderMaterialId,
              sourceInventoryLotId: sourceLot.id,
              sourceLotNumber: sourceLot.lotNumber,
              stagedInventoryLotId,
              stagedLotNumber,
              stagedReservationLineId,
              quantity: quantity.toString(),
              unit: reservationLine.unit,
              unitCost: decimal(sourceLot.unitCost).toString(),
              sourceLocationId: sourceLot.locationId,
              stagedLocationId: location.id,
              sourceWarehouseId: sourceLot.warehouseId,
              stagedWarehouseId: sourceLot.warehouseId,
              stagingTransactionId: transfer.id,
              stagingTransactionNumber: transfer.transactionNumber,
              transactionType: transfer.transactionType,
              stockMovementIds: [],
              voucherEntryId: null,
              sourceBalanceBefore,
              sourceBalanceAfter: {
                availableQuantity: decimal(sourceLot.availableQuantity)
                  .sub(quantity)
                  .toString(),
                reservedQuantity: decimal(sourceLot.reservedQuantity)
                  .sub(quantity)
                  .toString(),
              },
              barcode: dto.barcode.trim(),
              operatorUserId: currentUser.id,
            },
          });
          return {
            review,
            transaction: transfer,
            stagedInventoryLotId,
            stagedRequisitionLineId: stagedReservationLineId,
            stagedLocationId: location.id,
            replayed: false,
          };
        }

        const priorReviews = await tx.manufacturingWorkflowReview.findMany({
          where: {
            workspaceId: scope.id,
            workflowCode: "MATERIAL_HANDLING_EVIDENCE",
            entityId: requisition.id,
            status: "APPROVED",
          },
          select: { evidence: true },
        });
        const matchingPriorEvidence = priorReviews
          .map((review) => evidenceObject(review.evidence))
          .filter(
            (evidence) =>
              (evidence.stagedRequisitionLineId === reservationLine.id ||
                evidence.sourceRequisitionLineId === reservationLine.id) &&
              evidence.orderLotId === dto.orderLotId &&
              (evidence.stagedInventoryLotId === sourceLot.id ||
                evidence.inventoryLotId === sourceLot.id) &&
              evidence.inventoryItemId === reservationLine.inventoryItemId,
          );
        const priorStages = new Set(
          matchingPriorEvidence
            .map((evidence) => text(evidence.stage))
            .filter(Boolean),
        );
        if (dto.stage === "VERIFIED" && !priorStages.has("STAGED"))
          throw new BadRequestException(
            "Material must be staged by a posted location transfer before independent verification.",
          );
        if (
          ["ISSUE_SCAN", "RETURN_SCAN"].includes(dto.stage) &&
          !priorStages.has("VERIFIED")
        )
          throw new BadRequestException(
            "Verified staged-lot evidence is required before issue or return scan evidence.",
          );
        if (
          dto.stage === "VERIFIED" &&
          !matchingPriorEvidence.some(
            (evidence) =>
              evidence.stage === "STAGED" &&
              evidence.stagedLocationId === location.id,
          )
        )
          throw new BadRequestException(
            "Verification must occur at the exact persisted staging location.",
          );
        let linkedTransaction: {
          id: string;
          transactionType: string;
          orderId: string;
          orderLotId: string | null;
          fromLocationId: string | null;
          toLocationId: string | null;
          lines: Array<{ id: string }>;
        } | null = null;
        if (["ISSUE_SCAN", "RETURN_SCAN"].includes(dto.stage)) {
          if (!dto.transactionId)
            throw new BadRequestException(
              `${dto.stage} requires a posted transactionId.`,
            );
          linkedTransaction = await tx.manufacturingTransaction.findFirst({
            where: {
              id: dto.transactionId,
              workspaceId: scope.id,
              orderId: requisition.orderId,
              orderLotId: dto.orderLotId,
              status: "POSTED",
              transactionType:
                dto.stage === "ISSUE_SCAN"
                  ? "MATERIAL_ISSUE"
                  : "MATERIAL_RETURN",
            },
            select: {
              id: true,
              transactionType: true,
              orderId: true,
              orderLotId: true,
              fromLocationId: true,
              toLocationId: true,
              lines: {
                where: {
                  inventoryItemId: reservationLine.inventoryItemId,
                  orderMaterialId: reservationLine.orderMaterialId,
                  ...(dto.stage === "ISSUE_SCAN"
                    ? { sourceInventoryLotId: sourceLot.id }
                    : { destinationInventoryLotId: sourceLot.id }),
                },
                select: { id: true },
              },
            },
          });
          if (!linkedTransaction || !linkedTransaction.lines.length)
            throw new BadRequestException(
              `${dto.stage} must reference the matching posted staged-lot transaction.`,
            );
          if (
            dto.stage === "ISSUE_SCAN" &&
            linkedTransaction.fromLocationId !== sourceLot.locationId
          )
            throw new BadRequestException(
              "ISSUE_SCAN source location must exactly match the staged child-lot location.",
            );
          if (linkedTransaction.toLocationId !== location.id)
            throw new BadRequestException(
              `${dto.stage} location must exactly match the posted transaction destination location.`,
            );
        }
        const review = await this.audit(tx, scope, currentUser, {
          workflowCode: "MATERIAL_HANDLING_EVIDENCE",
          entityType: "ManufacturingTransaction",
          entityId: requisition.id,
          orderId: requisition.orderId,
          transactionDate,
          idempotencyKey: dto.idempotencyKey,
          title: `${requisition.transactionNumber} ${dto.stage.toLowerCase().replaceAll("_", " ")}`,
          note: dto.note,
          evidence: {
            requestSignature,
            stage: dto.stage,
            requisitionNumber: requisition.transactionNumber,
            sourceRequisitionLineId: reservationLine.id,
            stagedRequisitionLineId: reservationLine.id,
            approvedRequisitionLine: {
              id: approvedRequisitionLine.id,
              inventoryItemId: approvedRequisitionLine.inventoryItemId,
              orderMaterialId: approvedRequisitionLine.orderMaterialId,
              sourceInventoryLotId:
                approvedRequisitionLine.sourceInventoryLotId,
              quantity: decimal(approvedRequisitionLine.quantity).toString(),
              unit: approvedRequisitionLine.unit,
            },
            orderLotId: dto.orderLotId,
            inventoryItemId: reservationLine.inventoryItemId,
            orderMaterialId: reservationLine.orderMaterialId,
            stagedInventoryLotId: sourceLot.id,
            stagedLotNumber: sourceLot.lotNumber,
            barcode: dto.barcode.trim(),
            operatorUserId: currentUser.id,
            verifierUserId: dto.verifierUserId ?? null,
            stagedLocationId: sourceLot.locationId,
            locationId: dto.locationId,
            transactionId: linkedTransaction?.id ?? null,
            transactionType: linkedTransaction?.transactionType ?? null,
          },
        });
        return {
          review,
          transaction: null,
          stagedInventoryLotId: sourceLot.id,
          stagedRequisitionLineId: reservationLine.id,
          stagedLocationId: sourceLot.locationId,
          replayed: false,
        };
      });
    } catch (error) {
      if (isUniqueError(error)) {
        const concurrentReplay =
          await this.prisma.manufacturingWorkflowReview.findUnique({
            where: {
              workspaceId_idempotencyKey: {
                workspaceId: scope.id,
                idempotencyKey: dto.idempotencyKey,
              },
            },
          });
        if (
          concurrentReplay?.workflowCode === "MATERIAL_HANDLING_EVIDENCE" &&
          concurrentReplay.entityId === dto.requisitionId
        )
          return replayResult(concurrentReplay);
      }
      throw error;
    }
  }
}
