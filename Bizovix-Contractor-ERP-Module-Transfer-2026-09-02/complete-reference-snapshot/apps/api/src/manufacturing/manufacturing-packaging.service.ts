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
import { PrismaService } from "../prisma/prisma.service.js";
import { ManufacturingApprovalWorkflowService } from "./manufacturing-approval-workflow.service.js";
import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import {
  issueManufacturingDocumentNumberTx,
  manufacturingEntityIdFromIdempotency,
} from "./manufacturing-document-number.js";
import {
  allocateSerialRange,
  calculatePackagingMaterialRequirements,
  evaluatePackagingHierarchy,
  evaluatePackagingReconciliation,
  ManufacturingPackagingDomainError,
  packagingCoverageOverlaps,
} from "./manufacturing-packaging.domain.js";
import { satisfiesPassedQualityInspectionIndependence } from "./manufacturing-order-controls.domain.js";
import type {
  AllocateManufacturingSerialsDto,
  ConfirmPackagingReleaseReadinessDto,
  CreateManufacturingPackagingOrderDto,
  CreateManufacturingSerialRuleDto,
  ManufacturingSignedActionDto,
  RecordPackagingLineClearanceDto,
  RecordSerialQualityDto,
  ReconcileManufacturingPackagingDto,
  RegisterManufacturingPackageUnitsDto,
  RegisterManufacturingPackagingLabelsDto,
  RetryPackagingMaterialReservationDto,
} from "./manufacturing-packaging.dto.js";

type Db = Prisma.TransactionClient | PrismaService;
type Scope = { id: string; tenantId: string; companyId: string };
type Query = Record<string, string | undefined>;

const ACTIVE_PACKAGING_RESERVATIONS = ["ACTIVE", "PARTIALLY_ISSUED"] as const;

type PackagingMaterialShortageLine = {
  orderMaterialId: string;
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  lotTracked: boolean;
  requiredQuantity: string;
  availableQuantity: string;
  shortageQuantity: string;
  unit: string;
  warehouseId: string;
};

type PackagingMaterialReservation = {
  reservationId: string;
  reservationNumber: string;
  warehouseId: string;
  sourceLotIds: string[];
  lines: Array<{
    orderMaterialId: string | null;
    inventoryItemId: string;
    inventoryLotId: string | null;
    quantity: string;
    unit: string;
  }>;
};

type PackagingMaterialReservationOutcome =
  | {
      ready: true;
      reservation: PackagingMaterialReservation | null;
      shortages: [];
    }
  | {
      ready: false;
      reservation: null;
      shortages: PackagingMaterialShortageLine[];
    };

const PACKAGING_INCLUDE = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      finishedProductId: true,
      plannedQuantity: true,
      completedQuantity: true,
      unit: true,
      finishedProduct: {
        select: { itemCode: true, itemName: true, unit: true },
      },
    },
  },
  orderLot: {
    select: {
      id: true,
      lotNumber: true,
      plannedQuantity: true,
      completedQuantity: true,
      status: true,
    },
  },
  packagingConfiguration: {
    include: {
      lines: {
        orderBy: { sequence: "asc" as const },
        include: {
          inventoryItem: {
            select: { itemCode: true, itemName: true, unit: true },
          },
        },
      },
    },
  },
  reconciliations: { orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { sequence: "asc" as const } },
  labels: {
    orderBy: { labelCode: "asc" as const },
    include: { serial: { select: { serialNumber: true, status: true } } },
  },
  packageUnits: {
    orderBy: [{ level: "asc" as const }, { code: "asc" as const }],
    include: { serial: { select: { serialNumber: true, status: true } } },
  },
} satisfies Prisma.ManufacturingPackagingOrderInclude;

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asDate(value: string, label = "transactionDate") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException(`${label} is invalid.`);
  return date;
}

function decimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

function normalizeCode(value: string, label: string) {
  const code = value.trim().toUpperCase().replace(/\s+/g, "-");
  if (!code || !/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
    throw new BadRequestException(
      `${label} may contain letters, numbers, dot, underscore, slash and hyphen only.`,
    );
  }
  return code;
}

function shortReference(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 14).toUpperCase()}`;
}

function signatureHash(
  scope: Scope,
  userId: string,
  workflowCode: string,
  entityId: string,
  dto: ManufacturingSignedActionDto,
) {
  return createHash("sha256")
    .update(
      [
        scope.id,
        userId,
        workflowCode,
        entityId,
        dto.transactionDate,
        dto.idempotencyKey,
        dto.signatureMeaning.trim(),
      ].join("|"),
    )
    .digest("hex");
}

function serialQcSubmission(dto: RecordSerialQualityDto) {
  return dto.inspections
    .map((inspection) => ({
      serialId: inspection.serialId,
      passed: inspection.passed,
      holdReason: cleanText(inspection.holdReason),
      results: inspection.results
        .map((result) => ({
          parameterCode: normalizeCode(
            result.parameterCode,
            "QC parameter code",
          ),
          parameterName: result.parameterName.trim(),
          testMethod: cleanText(result.testMethod),
          unit: cleanText(result.unit),
          specificationMin: result.specificationMin ?? null,
          specificationMax: result.specificationMax ?? null,
          specificationText: cleanText(result.specificationText),
          actualValue: result.actualValue ?? null,
          actualText: cleanText(result.actualText),
          passed: result.passed,
          remarks: cleanText(result.remarks),
        }))
        .sort((left, right) =>
          left.parameterCode.localeCompare(right.parameterCode),
        ),
    }))
    .sort((left, right) => left.serialId.localeCompare(right.serialId));
}

export function manufacturingSerialQcApprovalEntityId(
  scope: Scope,
  dto: RecordSerialQualityDto,
) {
  const inspections = serialQcSubmission(dto);
  const fingerprint = JSON.stringify({
    workspaceId: scope.id,
    orderId: dto.orderId,
    orderLotId: cleanText(dto.orderLotId),
    transactionDate: asDate(dto.transactionDate).toISOString(),
    inspections,
  });
  return `MFG-SERIAL-QC-${createHash("sha256").update(fingerprint).digest("hex")}`;
}

function uniqueError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2002",
  );
}

@Injectable()
export class ManufacturingPackagingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ManufacturingElectronicSignatureService)
    private readonly electronicSignature: ManufacturingElectronicSignatureService,
    @Inject(ManufacturingApprovalWorkflowService)
    private readonly approvalWorkflow: ManufacturingApprovalWorkflowService,
  ) {}

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

  private async requirePermission(user: AuthenticatedRequestUser, key: string) {
    const granted = await this.permissions.getGrantedKeys(user);
    if (!granted.has(key))
      throw new ForbiddenException(`Permission required: ${key}`);
  }

  private async assertPeriodOpen(
    db: Db,
    workspaceId: string,
    when: Date,
    label: string,
  ) {
    const period = await db.manufacturingPeriod.findUnique({
      where: {
        workspaceId_periodYear_periodMonth: {
          workspaceId,
          periodYear: when.getUTCFullYear(),
          periodMonth: when.getUTCMonth() + 1,
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
      "The packaging operation could not be serialized after three attempts.",
    );
  }

  private async audit(
    db: Prisma.TransactionClient,
    scope: Scope,
    user: AuthenticatedRequestUser,
    input: {
      orderId?: string | null;
      workflowCode: string;
      entityType: string;
      entityId: string;
      title: string;
      evidence: Prisma.InputJsonValue;
      dto: ManufacturingSignedActionDto;
    },
  ) {
    const electronicSignatureEvidence = await this.electronicSignature.enforce(
      db,
      {
        scope,
        user,
        actionLabel: input.title,
        signatureMeaning: input.dto.signatureMeaning,
        reauthenticationPassword: input.dto.reauthenticationPassword,
        required: true,
      },
    );
    const evidence =
      input.evidence &&
      typeof input.evidence === "object" &&
      !Array.isArray(input.evidence)
        ? {
            ...(input.evidence as Prisma.InputJsonObject),
            electronicSignaturePolicy: electronicSignatureEvidence,
          }
        : {
            actionEvidence: input.evidence,
            electronicSignaturePolicy: electronicSignatureEvidence,
          };
    return db.manufacturingWorkflowReview.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        orderId: input.orderId ?? null,
        workflowGroup: "PACKAGING_RELEASE",
        workflowCode: input.workflowCode,
        entityType: input.entityType,
        entityId: input.entityId,
        transactionDate: asDate(input.dto.transactionDate),
        idempotencyKey: input.dto.idempotencyKey,
        title: input.title,
        outcome: "EXECUTED",
        status: "APPROVED",
        note: cleanText(input.dto.note),
        evidence,
        signatureHash: signatureHash(
          scope,
          user.id,
          input.workflowCode,
          input.entityId,
          input.dto,
        ),
        approvedByUserId: user.id,
        approvedAt: asDate(input.dto.transactionDate),
        createdByUserId: user.id,
      },
    });
  }

  private async auditReplay(
    scope: Scope,
    idempotencyKey: string,
    workflowCode: string,
    entityId: string,
  ) {
    const review = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: { workspaceId: scope.id, idempotencyKey },
      },
    });
    if (!review) return null;
    if (review.workflowCode !== workflowCode || review.entityId !== entityId) {
      throw new ConflictException(
        "Idempotency key is already used for a different manufacturing action.",
      );
    }
    return review;
  }

  private async order(db: Db, workspaceId: string, orderId: string) {
    const order = await db.manufacturingOrder.findFirst({
      where: { id: orderId, workspaceId },
      include: {
        finishedProduct: {
          select: { id: true, itemCode: true, itemName: true, unit: true },
        },
        lots: { orderBy: { sequence: "asc" } },
      },
    });
    if (!order) throw new NotFoundException("Production order not found.");
    return order;
  }

  private resolveOrderLot(
    order: Awaited<ReturnType<ManufacturingPackagingService["order"]>>,
    orderLotId?: string | null,
  ) {
    if (!orderLotId) {
      if (order.lots.length === 1) return order.lots[0];
      return null;
    }
    const lot = order.lots.find(
      (candidate) =>
        candidate.id === orderLotId || candidate.lotNumber === orderLotId,
    );
    if (!lot)
      throw new BadRequestException(
        "The selected production lot does not belong to this order.",
      );
    return lot;
  }

  private async packagingOrder(
    db: Db,
    workspaceId: string,
    packagingOrderId: string,
  ) {
    const order = await db.manufacturingPackagingOrder.findFirst({
      where: { id: packagingOrderId, workspaceId },
      include: PACKAGING_INCLUDE,
    });
    if (!order) throw new NotFoundException("Packaging order not found.");
    return order;
  }

  private assertPackagingOrderReplay(
    packagingOrder: Awaited<
      ReturnType<ManufacturingPackagingService["packagingOrder"]>
    >,
    dto: CreateManufacturingPackagingOrderDto,
  ) {
    const requestedLot = dto.orderLotId?.trim() || null;
    const lotMatches = requestedLot
      ? packagingOrder.orderLotId === requestedLot ||
        packagingOrder.orderLot?.lotNumber === requestedLot
      : packagingOrder.orderLotId === null;
    const requestedNumber = dto.packagingOrderNumber
      ? normalizeCode(dto.packagingOrderNumber, "Packaging order number")
      : null;
    if (
      packagingOrder.orderId !== dto.orderId ||
      packagingOrder.packagingConfigurationId !==
        dto.packagingConfigurationId ||
      !decimal(packagingOrder.plannedQuantity).equals(dto.plannedQuantity) ||
      packagingOrder.unit.trim().toLowerCase() !==
        dto.unit.trim().toLowerCase() ||
      !lotMatches ||
      (requestedNumber &&
        requestedNumber !== packagingOrder.packagingOrderNumber)
    ) {
      throw new ConflictException(
        "Idempotency key is already used with different packaging-order data.",
      );
    }
  }

  /**
   * Synchronises the shared order-material register from every non-cancelled
   * packaging order. One material row is retained per component item even when
   * a production order is split into several lots. Existing BOM-backed rows are
   * reused and never reduced; configuration-derived rows track the exact active
   * aggregate while respecting quantities that have already been reserved or
   * posted.
   */
  private async syncPackagingOrderMaterials(
    tx: Prisma.TransactionClient,
    orderId: string,
  ) {
    const packagingOrders = await tx.manufacturingPackagingOrder.findMany({
      where: { orderId, status: { notIn: ["CANCELLED", "CLOSED"] } },
      select: {
        id: true,
        plannedQuantity: true,
        packagingConfiguration: {
          select: {
            lines: {
              orderBy: { sequence: "asc" },
              select: { inventoryItemId: true, quantity: true, unit: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    let requirements: ReturnType<typeof calculatePackagingMaterialRequirements>;
    try {
      requirements = calculatePackagingMaterialRequirements(
        packagingOrders.map((packagingOrder) => ({
          sourceId: packagingOrder.id,
          plannedQuantity: packagingOrder.plannedQuantity,
          components: packagingOrder.packagingConfiguration.lines.map(
            (line) => ({
              inventoryItemId: line.inventoryItemId,
              quantityPerFinishedUnit: line.quantity,
              unit: line.unit,
            }),
          ),
        })),
      );
    } catch (error) {
      if (error instanceof ManufacturingPackagingDomainError)
        throw new BadRequestException(error.message);
      throw error;
    }
    if (!requirements.length)
      throw new BadRequestException(
        "Packaging configuration produced no material requirements.",
      );

    const existingRows = await tx.manufacturingOrderMaterial.findMany({
      where: {
        orderId,
        inventoryItemId: {
          in: requirements.map((requirement) => requirement.inventoryItemId),
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const synced: Array<{
      orderMaterialId: string;
      inventoryItemId: string;
      unit: string;
      configurationRequiredQuantity: string;
      plannedQuantity: string;
      sourcePackagingOrderIds: string[];
      created: boolean;
    }> = [];

    for (const requirement of requirements) {
      const candidates = existingRows.filter(
        (row) => row.inventoryItemId === requirement.inventoryItemId,
      );
      if (candidates.length > 1) {
        throw new ConflictException(
          `Production order has duplicate material rows for packaging component ${requirement.inventoryItemId}; merge them before packaging execution.`,
        );
      }
      const existing = candidates[0] ?? null;
      if (
        existing &&
        existing.unit.trim().toLowerCase() !== requirement.unit.toLowerCase()
      ) {
        throw new BadRequestException(
          `Packaging component ${requirement.inventoryItemId} unit ${requirement.unit} does not match order material unit ${existing.unit}.`,
        );
      }
      if (!existing) {
        const created = await tx.manufacturingOrderMaterial.create({
          data: {
            orderId,
            inventoryItemId: requirement.inventoryItemId,
            bomComponentId: null,
            unit: requirement.unit,
            plannedQuantity: requirement.requiredQuantity,
            notes: "Derived from approved packaging configuration(s).",
          },
        });
        synced.push({
          orderMaterialId: created.id,
          inventoryItemId: requirement.inventoryItemId,
          unit: created.unit,
          configurationRequiredQuantity:
            requirement.requiredQuantity.toFixed(4),
          plannedQuantity: decimal(created.plannedQuantity).toFixed(4),
          sourcePackagingOrderIds: requirement.sourceIds,
          created: true,
        });
        continue;
      }

      const protectedQuantity = Prisma.Decimal.max(
        decimal(existing.reservedQuantity),
        decimal(existing.issuedQuantity),
        decimal(existing.consumedQuantity).add(existing.scrappedQuantity),
      );
      const bomBaseline = existing.bomComponentId
        ? decimal(existing.plannedQuantity)
        : decimal(0);
      const plannedQuantity = Prisma.Decimal.max(
        requirement.requiredQuantity,
        protectedQuantity,
        bomBaseline,
      ).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      const issuedQuantity = decimal(existing.issuedQuantity);
      const reservedQuantity = decimal(existing.reservedQuantity);
      const returnedQuantity = decimal(existing.returnedQuantity);
      const consumedQuantity = decimal(existing.consumedQuantity).add(
        existing.scrappedQuantity,
      );
      const status = consumedQuantity.greaterThanOrEqualTo(plannedQuantity)
        ? ("CONSUMED" as const)
        : returnedQuantity.greaterThan(0)
          ? ("PARTIALLY_RETURNED" as const)
          : issuedQuantity.greaterThanOrEqualTo(plannedQuantity)
            ? ("ISSUED" as const)
            : issuedQuantity.greaterThan(0)
              ? ("PARTIALLY_ISSUED" as const)
              : reservedQuantity.greaterThanOrEqualTo(plannedQuantity)
                ? ("RESERVED" as const)
                : reservedQuantity.greaterThan(0)
                  ? ("PARTIALLY_RESERVED" as const)
                  : ("PLANNED" as const);
      const updated = await tx.manufacturingOrderMaterial.update({
        where: { id: existing.id },
        data: { plannedQuantity, status },
      });
      synced.push({
        orderMaterialId: updated.id,
        inventoryItemId: requirement.inventoryItemId,
        unit: updated.unit,
        configurationRequiredQuantity: requirement.requiredQuantity.toFixed(4),
        plannedQuantity: decimal(updated.plannedQuantity).toFixed(4),
        sourcePackagingOrderIds: requirement.sourceIds,
        created: false,
      });
    }
    return synced;
  }

  private async reservePackagingMaterialTopUp(
    tx: Prisma.TransactionClient,
    scope: Scope,
    user: AuthenticatedRequestUser,
    order: Awaited<ReturnType<ManufacturingPackagingService["order"]>>,
    materialRequirements: Awaited<
      ReturnType<ManufacturingPackagingService["syncPackagingOrderMaterials"]>
    >,
    when: Date,
    idempotencyKey: string,
  ): Promise<PackagingMaterialReservationOutcome> {
    const materialIds = materialRequirements.map(
      (requirement) => requirement.orderMaterialId,
    );
    const materials = await tx.manufacturingOrderMaterial.findMany({
      where: { orderId: order.id, id: { in: materialIds } },
      include: {
        inventoryItem: {
          include: { manufacturingProfile: true },
        },
      },
    });
    const requirementByMaterialId = new Map(
      materialRequirements.map((requirement) => [
        requirement.orderMaterialId,
        requirement,
      ]),
    );
    const requested = materials
      .map((material) => {
        const requirement = requirementByMaterialId.get(material.id)!;
        if (
          !material.inventoryItem.manufacturingProfile?.isActive ||
          material.inventoryItem.manufacturingProfile.role !==
            "PACKAGING_MATERIAL"
        ) {
          throw new BadRequestException(
            `${material.inventoryItem.itemName} is not an active packaging material.`,
          );
        }
        const target = decimal(requirement.configurationRequiredQuantity);
        const outstanding = target
          .sub(material.issuedQuantity)
          .sub(material.reservedQuantity)
          .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        return {
          material,
          requirement,
          outstanding: Prisma.Decimal.max(outstanding, 0),
        };
      })
      .filter((entry) => entry.outstanding.greaterThan(0));
    if (!requested.length)
      return { ready: true, reservation: null, shortages: [] };

    const nonLotItemIds = requested
      .filter(
        ({ material }) =>
          !material.inventoryItem.manufacturingProfile?.lotTracked,
      )
      .map(({ material }) => material.inventoryItemId);
    const lotItemIds = requested
      .filter(
        ({ material }) =>
          material.inventoryItem.manufacturingProfile?.lotTracked,
      )
      .map(({ material }) => material.inventoryItemId);
    const [stockMovements, activeReservations, inventoryLots] =
      await Promise.all([
        nonLotItemIds.length
          ? tx.stockMovement.findMany({
              where: {
                workspaceId: scope.id,
                warehouseId: order.issueWarehouseId,
                inventoryItemId: { in: nonLotItemIds },
                voidedAt: null,
                transactionDate: { lte: when },
              },
              orderBy: [
                { transactionDate: "asc" },
                { createdAt: "asc" },
                { id: "asc" },
              ],
              select: { inventoryItemId: true, balanceQuantity: true },
            })
          : Promise.resolve([]),
        nonLotItemIds.length
          ? tx.manufacturingReservationLine.groupBy({
              by: ["inventoryItemId"],
              where: {
                inventoryItemId: { in: nonLotItemIds },
                reservation: {
                  workspaceId: scope.id,
                  warehouseId: order.issueWarehouseId,
                  status: { in: [...ACTIVE_PACKAGING_RESERVATIONS] },
                },
              },
              _sum: {
                quantity: true,
                issuedQuantity: true,
                releasedQuantity: true,
              },
            })
          : Promise.resolve([]),
        lotItemIds.length
          ? tx.manufacturingInventoryLot.findMany({
              where: {
                workspaceId: scope.id,
                warehouseId: order.issueWarehouseId,
                inventoryItemId: { in: lotItemIds },
                availableQuantity: { gt: 0 },
                holdQuantity: 0,
                AND: [
                  {
                    OR: [{ expiresAt: null }, { expiresAt: { gte: when } }],
                  },
                  {
                    OR: [{ retestDueAt: null }, { retestDueAt: { gte: when } }],
                  },
                ],
              },
            })
          : Promise.resolve([]),
      ]);
    const balanceByItem = new Map<string, Prisma.Decimal>();
    for (const movement of stockMovements)
      balanceByItem.set(
        movement.inventoryItemId,
        decimal(movement.balanceQuantity),
      );
    const reservedByItem = new Map(
      activeReservations.map((entry) => [
        entry.inventoryItemId,
        decimal(entry._sum.quantity)
          .sub(entry._sum.issuedQuantity ?? 0)
          .sub(entry._sum.releasedQuantity ?? 0),
      ]),
    );
    const reservationLines: Array<{
      orderMaterialId: string;
      inventoryItemId: string;
      inventoryLotId: string | null;
      quantity: Prisma.Decimal;
      unit: string;
    }> = [];
    const lotReservationIncrements = new Map<string, Prisma.Decimal>();
    const shortages: PackagingMaterialShortageLine[] = [];

    for (const { material, outstanding } of requested) {
      if (!material.inventoryItem.manufacturingProfile?.lotTracked) {
        const available = Prisma.Decimal.max(
          decimal(balanceByItem.get(material.inventoryItemId) ?? 0).sub(
            reservedByItem.get(material.inventoryItemId) ?? 0,
          ),
          0,
        ).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        if (available.lessThan(outstanding)) {
          shortages.push({
            orderMaterialId: material.id,
            inventoryItemId: material.inventoryItemId,
            itemCode: material.inventoryItem.itemCode,
            itemName: material.inventoryItem.itemName,
            lotTracked: false,
            requiredQuantity: outstanding.toFixed(4),
            availableQuantity: available.toFixed(4),
            shortageQuantity: outstanding.sub(available).toFixed(4),
            unit: material.unit,
            warehouseId: order.issueWarehouseId,
          });
          continue;
        }
        reservationLines.push({
          orderMaterialId: material.id,
          inventoryItemId: material.inventoryItemId,
          inventoryLotId: null,
          quantity: outstanding,
          unit: material.unit,
        });
        continue;
      }

      let remaining = outstanding;
      const candidates = inventoryLots
        .filter((lot) => lot.inventoryItemId === material.inventoryItemId)
        .sort((left, right) => {
          const leftUseBy = Math.min(
            left.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
            left.retestDueAt?.getTime() ?? Number.POSITIVE_INFINITY,
          );
          const rightUseBy = Math.min(
            right.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
            right.retestDueAt?.getTime() ?? Number.POSITIVE_INFINITY,
          );
          const expiry = leftUseBy - rightUseBy;
          return (
            expiry ||
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.lotNumber.localeCompare(right.lotNumber) ||
            left.id.localeCompare(right.id)
          );
        });
      for (const lot of candidates) {
        if (remaining.lessThanOrEqualTo(0)) break;
        if (
          lot.unit.trim().toLowerCase() !== material.unit.trim().toLowerCase()
        ) {
          throw new BadRequestException(
            `Packaging lot ${lot.lotNumber} uses ${lot.unit}; unit conversion to ${material.unit} is not configured.`,
          );
        }
        const allocatable = Prisma.Decimal.max(
          decimal(lot.availableQuantity).sub(lot.reservedQuantity),
          0,
        );
        if (allocatable.lessThanOrEqualTo(0)) continue;
        const allocated = Prisma.Decimal.min(
          allocatable,
          remaining,
        ).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        reservationLines.push({
          orderMaterialId: material.id,
          inventoryItemId: material.inventoryItemId,
          inventoryLotId: lot.id,
          quantity: allocated,
          unit: material.unit,
        });
        lotReservationIncrements.set(
          lot.id,
          (lotReservationIncrements.get(lot.id) ?? decimal(0)).add(allocated),
        );
        remaining = remaining.sub(allocated);
      }
      if (remaining.greaterThan(0)) {
        shortages.push({
          orderMaterialId: material.id,
          inventoryItemId: material.inventoryItemId,
          itemCode: material.inventoryItem.itemCode,
          itemName: material.inventoryItem.itemName,
          lotTracked: true,
          requiredQuantity: outstanding.toFixed(4),
          availableQuantity: outstanding.sub(remaining).toFixed(4),
          shortageQuantity: remaining.toFixed(4),
          unit: material.unit,
          warehouseId: order.issueWarehouseId,
        });
      }
    }

    // The allocation above is only a plan. Do not create a partial reservation
    // or mutate lot/order balances unless every packaging component is fully
    // available in real stock.
    if (shortages.length) return { ready: false, reservation: null, shortages };

    const reservationNumber = shortReference("PKR", idempotencyKey);
    const reservation = await tx.manufacturingReservation.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        reservationNumber,
        orderId: order.id,
        warehouseId: order.issueWarehouseId,
        locationId: order.issueLocationId ?? null,
        reservedAt: when,
        createdByUserId: user.id,
        lines: { create: reservationLines },
      },
      include: { lines: true },
    });
    for (const [inventoryLotId, quantity] of lotReservationIncrements) {
      await tx.manufacturingInventoryLot.update({
        where: { id: inventoryLotId },
        data: { reservedQuantity: { increment: quantity } },
      });
    }
    const reservedByMaterial = new Map<string, Prisma.Decimal>();
    for (const line of reservationLines) {
      reservedByMaterial.set(
        line.orderMaterialId,
        (reservedByMaterial.get(line.orderMaterialId) ?? decimal(0)).add(
          line.quantity,
        ),
      );
    }
    for (const material of materials) {
      const increment = reservedByMaterial.get(material.id);
      if (!increment) continue;
      const resultingReserved = decimal(material.reservedQuantity).add(
        increment,
      );
      await tx.manufacturingOrderMaterial.update({
        where: { id: material.id },
        data: {
          reservedQuantity: { increment },
          status: resultingReserved
            .add(material.issuedQuantity)
            .greaterThanOrEqualTo(material.plannedQuantity)
            ? "RESERVED"
            : "PARTIALLY_RESERVED",
        },
      });
    }
    if (order.status === "APPROVED") {
      const allMaterials = await tx.manufacturingOrderMaterial.findMany({
        where: { orderId: order.id },
      });
      const fullyReserved = allMaterials.every((material) =>
        decimal(material.issuedQuantity)
          .add(material.reservedQuantity)
          .add(reservedByMaterial.get(material.id) ?? 0)
          .greaterThanOrEqualTo(material.plannedQuantity),
      );
      if (fullyReserved) {
        await tx.manufacturingOrder.update({
          where: { id: order.id },
          data: { status: "RESERVED" },
        });
      }
    }
    return {
      ready: true,
      shortages: [],
      reservation: {
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber,
        warehouseId: order.issueWarehouseId,
        sourceLotIds: reservation.lines
          .map((line) => line.inventoryLotId)
          .filter((inventoryLotId): inventoryLotId is string =>
            Boolean(inventoryLotId),
          ),
        lines: reservation.lines.map((line) => ({
          orderMaterialId: line.orderMaterialId,
          inventoryItemId: line.inventoryItemId,
          inventoryLotId: line.inventoryLotId,
          quantity: decimal(line.quantity).toFixed(4),
          unit: line.unit,
        })),
      },
    };
  }

  private async appendEvent(
    tx: Prisma.TransactionClient,
    scope: Scope,
    user: AuthenticatedRequestUser,
    packagingOrderId: string,
    eventType:
      | "LINE_CLEARANCE"
      | "EXECUTION"
      | "RECONCILIATION"
      | "LABEL_CONTROL"
      | "AGGREGATION"
      | "RELEASE_READINESS",
    dto: ManufacturingSignedActionDto,
    payload: Prisma.InputJsonValue,
    evidenceReference?: string | null,
    idempotencySuffix = "",
  ) {
    const existing = await tx.manufacturingPackagingEvent.findUnique({
      where: {
        packagingOrderId_idempotencyKey: {
          packagingOrderId,
          idempotencyKey: `${dto.idempotencyKey}${idempotencySuffix}`,
        },
      },
    });
    if (existing) return { event: existing, replayed: true };
    const electronicSignatureEvidence = await this.electronicSignature.enforce(
      tx,
      {
        scope,
        user,
        actionLabel: `${eventType.replaceAll("_", " ").toLowerCase()} for packaging order ${packagingOrderId}`,
        signatureMeaning: dto.signatureMeaning,
        reauthenticationPassword: dto.reauthenticationPassword,
        required: true,
      },
    );
    const eventPayload =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? {
            ...(payload as Prisma.InputJsonObject),
            electronicSignaturePolicy: electronicSignatureEvidence,
          }
        : {
            actionPayload: payload,
            electronicSignaturePolicy: electronicSignatureEvidence,
          };
    const latest = await tx.manufacturingPackagingEvent.aggregate({
      where: { packagingOrderId },
      _max: { sequence: true },
    });
    const event = await tx.manufacturingPackagingEvent.create({
      data: {
        packagingOrderId,
        sequence: (latest._max.sequence ?? 0) + 1,
        eventType,
        transactionDate: asDate(dto.transactionDate),
        evidenceReference: cleanText(evidenceReference),
        note: cleanText(dto.note),
        payload: eventPayload,
        idempotencyKey: `${dto.idempotencyKey}${idempotencySuffix}`,
        signatureHash: signatureHash(
          scope,
          user.id,
          eventType,
          packagingOrderId,
          dto,
        ),
        createdByUserId: user.id,
      },
    });
    return { event, replayed: false };
  }

  async getWorkspace(user: AuthenticatedRequestUser, query: Query) {
    await this.requirePermission(user, "manufacturing.view");
    const scope = await this.scope(user, query.workspaceId);
    const [
      orders,
      serialRules,
      packagingConfigurations,
      packagingOrders,
      serials,
      serialTrackedProfiles,
      serialQcReviews,
    ] = await Promise.all([
      this.prisma.manufacturingOrder.findMany({
        where: { workspaceId: scope.id },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          finishedProductId: true,
          plannedQuantity: true,
          completedQuantity: true,
          unit: true,
          finishedProduct: {
            select: { itemCode: true, itemName: true, unit: true },
          },
          lots: {
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              lotNumber: true,
              plannedQuantity: true,
              completedQuantity: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.manufacturingSerialRule.findMany({
        where: {
          workspaceId: scope.id,
          ...(query.orderId
            ? { OR: [{ orderId: query.orderId }, { orderId: null }] }
            : {}),
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      }),
      this.prisma.manufacturingControlRecord.findMany({
        where: {
          workspaceId: scope.id,
          kind: "PACKAGING_CONFIGURATION",
          status: "APPROVED",
          ...(query.inventoryItemId
            ? { inventoryItemId: query.inventoryItemId }
            : {}),
        },
        include: {
          lines: {
            orderBy: { sequence: "asc" },
            include: {
              inventoryItem: {
                select: { itemCode: true, itemName: true, unit: true },
              },
            },
          },
        },
        orderBy: [{ code: "asc" }, { versionNumber: "desc" }],
      }),
      this.prisma.manufacturingPackagingOrder.findMany({
        where: {
          workspaceId: scope.id,
          ...(query.orderId ? { orderId: query.orderId } : {}),
        },
        include: PACKAGING_INCLUDE,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.manufacturingSerial.findMany({
        where: {
          workspaceId: scope.id,
          ...(query.orderId ? { orderId: query.orderId } : {}),
        },
        include: {
          qualityInspections: {
            orderBy: [{ inspectedAt: "desc" }, { createdAt: "desc" }],
            include: { results: { orderBy: { sortOrder: "asc" } } },
          },
          packagingLabels: { orderBy: { updatedAt: "desc" } },
          packageUnits: { orderBy: { updatedAt: "desc" } },
        },
        orderBy: { serialNumber: "asc" },
      }),
      this.prisma.manufacturingItemProfile.findMany({
        where: {
          workspaceId: scope.id,
          role: "FINISHED_GOOD",
          serialTracked: true,
          isActive: true,
        },
        include: {
          inventoryItem: {
            select: { id: true, itemCode: true, itemName: true, unit: true },
          },
        },
        orderBy: { inventoryItem: { itemName: "asc" } },
      }),
      this.prisma.manufacturingWorkflowReview.findMany({
        where: {
          workspaceId: scope.id,
          workflowCode: "SERIAL_QC",
          entityType: "MANUFACTURING_SERIAL_QC",
          ...(query.orderId ? { orderId: query.orderId } : {}),
        },
        include: { createdBy: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const itemIds = [
      ...new Set(serialRules.map((rule) => rule.inventoryItemId)),
    ];
    const items = itemIds.length
      ? await this.prisma.inventoryItem.findMany({
          where: { workspaceId: scope.id, id: { in: itemIds } },
          select: { id: true, itemCode: true, itemName: true, unit: true },
        })
      : [];
    const itemById = new Map(items.map((item) => [item.id, item]));
    const latestSerialQcReviewByEntity = new Map<
      string,
      (typeof serialQcReviews)[number]
    >();
    for (const review of serialQcReviews) {
      if (review.entityId)
        latestSerialQcReviewByEntity.set(review.entityId, review);
    }
    const pendingSerialQcApprovals = [
      ...latestSerialQcReviewByEntity.values(),
    ].flatMap((review) => {
      const evidence =
        review.evidence &&
        typeof review.evidence === "object" &&
        !Array.isArray(review.evidence)
          ? (review.evidence as Record<string, unknown>)
          : {};
      if (
        evidence.complete === true ||
        !review.orderId ||
        !Array.isArray(evidence.serialQcSubmission)
      )
        return [];
      return [
        {
          entityId: review.entityId,
          orderId: review.orderId,
          orderLotId:
            typeof evidence.orderLotId === "string"
              ? evidence.orderLotId
              : null,
          transactionDate: review.transactionDate,
          inspectorName: review.createdBy?.name ?? null,
          approvalProgress: {
            totalStages:
              typeof evidence.totalStages === "number"
                ? evidence.totalStages
                : 2,
            completedStages:
              typeof evidence.completedStages === "number"
                ? evidence.completedStages
                : 1,
            nextStage:
              typeof evidence.nextStage === "number" ? evidence.nextStage : 2,
            complete: false,
          },
          submission: evidence.serialQcSubmission,
        },
      ];
    });
    return {
      orders,
      serialRules: serialRules.map((rule) => ({
        ...rule,
        inventoryItem: itemById.get(rule.inventoryItemId) ?? null,
      })),
      packagingConfigurations,
      packagingOrders,
      serials,
      pendingSerialQcApprovals,
      serialTrackedProducts: serialTrackedProfiles.map(
        (profile) => profile.inventoryItem,
      ),
    };
  }

  async createSerialRule(
    user: AuthenticatedRequestUser,
    dto: CreateManufacturingSerialRuleDto,
  ) {
    await this.requirePermission(user, "manufacturing.master.manage");
    const scope = await this.scope(user, dto.workspaceId);
    if (dto.endNumber < dto.startNumber)
      throw new BadRequestException("endNumber cannot be before startNumber.");
    const profile = await this.prisma.manufacturingItemProfile.findFirst({
      where: {
        workspaceId: scope.id,
        inventoryItemId: dto.inventoryItemId,
        isActive: true,
        role: "FINISHED_GOOD",
        serialTracked: true,
      },
      include: {
        inventoryItem: { select: { id: true, itemCode: true, itemName: true } },
      },
    });
    if (!profile)
      throw new BadRequestException(
        "Serial rules require an active serial-tracked FINISHED_GOOD profile.",
      );
    if (dto.orderId) {
      const order = await this.order(this.prisma, scope.id, dto.orderId);
      if (order.finishedProductId !== dto.inventoryItemId)
        throw new BadRequestException(
          "Serial rule finished product must match its linked order.",
        );
    }
    try {
      return await this.prisma.manufacturingSerialRule.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          orderId: cleanText(dto.orderId),
          code: normalizeCode(dto.code, "Serial rule code"),
          name: dto.name.trim(),
          inventoryItemId: dto.inventoryItemId,
          prefix: dto.prefix.trim(),
          suffix: cleanText(dto.suffix),
          startNumber: dto.startNumber,
          endNumber: dto.endNumber,
          nextNumber: dto.startNumber,
          padding: dto.padding ?? 6,
          createdByUserId: user.id,
        },
      });
    } catch (error) {
      if (uniqueError(error))
        throw new ConflictException(
          "Serial rule code is already used in this workspace.",
        );
      throw error;
    }
  }

  async activateSerialRule(
    user: AuthenticatedRequestUser,
    ruleId: string,
    dto: ManufacturingSignedActionDto,
  ) {
    await this.requirePermission(user, "manufacturing.master.manage");
    const scope = await this.scope(user, dto.workspaceId);
    const replay = await this.auditReplay(
      scope,
      dto.idempotencyKey,
      "SERIAL_RULE_ACTIVATE",
      ruleId,
    );
    if (replay)
      return {
        rule: await this.prisma.manufacturingSerialRule.findFirst({
          where: { id: ruleId, workspaceId: scope.id },
        }),
        replayed: true,
      };
    const when = asDate(dto.transactionDate);
    await this.assertPeriodOpen(
      this.prisma,
      scope.id,
      when,
      "Serial-rule activation",
    );
    const rule = await this.prisma.$transaction(
      async (tx) => {
        await this.assertPeriodOpen(
          tx,
          scope.id,
          when,
          "Serial-rule activation",
        );
        const current = await tx.manufacturingSerialRule.findFirst({
          where: { id: ruleId, workspaceId: scope.id },
        });
        if (!current) throw new NotFoundException("Serial rule not found.");
        if (current.status === "RETIRED")
          throw new BadRequestException(
            "A retired serial rule cannot be reactivated.",
          );
        await tx.manufacturingSerialRule.updateMany({
          where: {
            workspaceId: scope.id,
            inventoryItemId: current.inventoryItemId,
            status: "ACTIVE",
            id: { not: current.id },
            ...(current.orderId
              ? { orderId: current.orderId }
              : { orderId: null }),
          },
          data: { status: "RETIRED", retiredAt: when },
        });
        const activated = await tx.manufacturingSerialRule.update({
          where: { id: current.id },
          data: {
            status: "ACTIVE",
            activatedAt: when,
            activatedByUserId: user.id,
          },
        });
        await this.audit(tx, scope, user, {
          workflowCode: "SERIAL_RULE_ACTIVATE",
          entityType: "MANUFACTURING_SERIAL_RULE",
          entityId: current.id,
          orderId: current.orderId,
          title: `Activate serial rule ${current.code}`,
          evidence: {
            code: current.code,
            startNumber: current.startNumber,
            endNumber: current.endNumber,
            prefix: current.prefix,
            suffix: current.suffix,
          },
          dto,
        });
        return activated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { rule, replayed: false };
  }

  async allocateSerials(
    user: AuthenticatedRequestUser,
    ruleId: string,
    dto: AllocateManufacturingSerialsDto,
  ) {
    await this.requirePermission(user, "manufacturing.production.execute");
    const scope = await this.scope(user, dto.workspaceId);
    const replay = await this.auditReplay(
      scope,
      dto.idempotencyKey,
      "SERIAL_ALLOCATE",
      ruleId,
    );
    if (replay) {
      return {
        serials: await this.prisma.manufacturingSerial.findMany({
          where: {
            workspaceId: scope.id,
            serialRuleId: ruleId,
            orderId: dto.orderId,
          },
          orderBy: { createdAt: "desc" },
          take: dto.quantity,
        }),
        replayed: true,
      };
    }
    const when = asDate(dto.transactionDate);
    await this.assertPeriodOpen(
      this.prisma,
      scope.id,
      when,
      "Serial allocation",
    );
    try {
      const serials = await this.prisma.$transaction(
        async (tx) => {
          const rule = await tx.manufacturingSerialRule.findFirst({
            where: { id: ruleId, workspaceId: scope.id, status: "ACTIVE" },
          });
          if (!rule)
            throw new BadRequestException("An active serial rule is required.");
          const order = await this.order(tx, scope.id, dto.orderId);
          if (["CANCELLED", "CLOSED"].includes(order.status))
            throw new BadRequestException(
              "Serials cannot be allocated to a cancelled or closed order.",
            );
          if (rule.inventoryItemId !== order.finishedProductId)
            throw new BadRequestException(
              "Serial rule product does not match the production order.",
            );
          if (rule.orderId && rule.orderId !== order.id)
            throw new BadRequestException(
              "This serial rule is linked to a different production order.",
            );
          const lot = this.resolveOrderLot(order, dto.orderLotId);
          if (order.lots.length > 1 && !lot)
            throw new BadRequestException(
              "orderLotId is required when allocating serials for a production order with multiple lots.",
            );
          const planned = decimal(
            lot?.plannedQuantity ?? order.plannedQuantity,
          );
          if (!planned.isInteger())
            throw new BadRequestException(
              "Serialized production quantity must be a whole number.",
            );
          const alreadyAllocated = await tx.manufacturingSerial.count({
            where: {
              workspaceId: scope.id,
              orderId: order.id,
              orderLotId: lot?.id ?? null,
            },
          });
          if (
            new Prisma.Decimal(alreadyAllocated + dto.quantity).greaterThan(
              planned,
            )
          ) {
            throw new BadRequestException(
              "Serial allocation cannot exceed the production order or lot planned quantity.",
            );
          }
          let numbers: string[];
          try {
            numbers = allocateSerialRange({
              prefix: rule.prefix,
              suffix: rule.suffix,
              nextNumber: rule.nextNumber,
              endNumber: rule.endNumber,
              padding: rule.padding,
              quantity: dto.quantity,
            });
          } catch (error) {
            if (error instanceof ManufacturingPackagingDomainError)
              throw new BadRequestException(error.message);
            throw error;
          }
          const existing = await tx.manufacturingSerial.findFirst({
            where: { workspaceId: scope.id, serialNumber: { in: numbers } },
            select: { serialNumber: true },
          });
          if (existing)
            throw new ConflictException(
              `Generated serial ${existing.serialNumber} already exists in this workspace.`,
            );
          await tx.manufacturingSerial.createMany({
            data: numbers.map((serialNumber) => ({
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              serialNumber,
              inventoryItemId: order.finishedProductId,
              orderId: order.id,
              orderLotId: lot?.id ?? null,
              serialRuleId: rule.id,
              status: "CREATED" as const,
              createdByUserId: user.id,
            })),
          });
          await tx.manufacturingSerialRule.update({
            where: { id: rule.id },
            data: { nextNumber: { increment: dto.quantity } },
          });
          await this.audit(tx, scope, user, {
            workflowCode: "SERIAL_ALLOCATE",
            entityType: "MANUFACTURING_SERIAL_RULE",
            entityId: rule.id,
            orderId: order.id,
            title: `Allocate ${dto.quantity} serials to ${order.orderNumber}`,
            evidence: {
              ruleId: rule.id,
              orderLotId: lot?.id ?? null,
              serialNumbers: numbers,
            },
            dto,
          });
          return tx.manufacturingSerial.findMany({
            where: { workspaceId: scope.id, serialNumber: { in: numbers } },
            orderBy: { serialNumber: "asc" },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { serials, replayed: false };
    } catch (error) {
      if (uniqueError(error))
        throw new ConflictException(
          "A generated serial or idempotency key is already in use.",
        );
      throw error;
    }
  }

  async recordSerialQuality(
    user: AuthenticatedRequestUser,
    dto: RecordSerialQualityDto,
  ) {
    const scope = await this.scope(user, dto.workspaceId);
    const [order, settings] = await Promise.all([
      this.order(this.prisma, scope.id, dto.orderId),
      this.prisma.manufacturingSettings.findUnique({
        where: { workspaceId: scope.id },
        select: { mode: true },
      }),
    ]);
    const independentApprovalRequired =
      settings?.mode === "PHARMACEUTICAL" || settings?.mode === "HYBRID";
    if (!independentApprovalRequired)
      await this.requirePermission(user, "manufacturing.quality.inspect");
    const approvalEntityId = independentApprovalRequired
      ? manufacturingSerialQcApprovalEntityId(scope, dto)
      : order.id;
    const replay = await this.auditReplay(
      scope,
      dto.idempotencyKey,
      "SERIAL_QC",
      approvalEntityId,
    );
    if (replay) {
      const evidence =
        replay.evidence &&
        typeof replay.evidence === "object" &&
        !Array.isArray(replay.evidence)
          ? (replay.evidence as Record<string, unknown>)
          : {};
      return {
        inspections: [],
        replayed: true,
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
              }
            : null,
      };
    }
    const when = asDate(dto.transactionDate);
    await this.assertPeriodOpen(this.prisma, scope.id, when, "Serial QC");
    if (
      new Set(dto.inspections.map((row) => row.serialId)).size !==
      dto.inspections.length
    ) {
      throw new BadRequestException(
        "Each serial may appear only once in a QC posting.",
      );
    }
    const lot = this.resolveOrderLot(order, dto.orderLotId);
    const serials = await this.prisma.manufacturingSerial.findMany({
      where: {
        workspaceId: scope.id,
        id: { in: dto.inspections.map((row) => row.serialId) },
        orderId: order.id,
      },
    });
    if (
      serials.length !== dto.inspections.length ||
      serials.some((serial) => lot && serial.orderLotId !== lot.id)
    ) {
      throw new BadRequestException(
        "Every QC serial must belong to the selected production order and lot.",
      );
    }
    if (
      serials.some(
        (serial) => !["CREATED", "QC_HOLD", "REWORK"].includes(serial.status),
      )
    ) {
      throw new BadRequestException(
        "QC cannot be posted against a released, scrapped or consumed serial.",
      );
    }
    for (const input of dto.inspections) {
      if (input.passed !== input.results.every((result) => result.passed)) {
        throw new BadRequestException(
          "Serial inspection outcome must match all of its parameter results.",
        );
      }
      if (!input.passed && !cleanText(input.holdReason))
        throw new BadRequestException(
          "A failed serial inspection requires holdReason.",
        );
      if (
        new Set(
          input.results.map((result) =>
            normalizeCode(result.parameterCode, "QC parameter code"),
          ),
        ).size !== input.results.length
      ) {
        throw new BadRequestException(
          "A serial inspection cannot repeat a QC parameter.",
        );
      }
    }
    const result = await this.serializable(async (tx) => {
      let approvalProgress: {
        totalStages: number;
        completedStages: number;
        nextStage: number | null;
        complete: boolean;
      } | null = null;
      let approvalReview: { id: string; evidence: unknown } | null = null;
      let inspectorUserId = user.id;
      let inspectedAt = when;
      if (independentApprovalRequired) {
        const progress = await this.approvalWorkflow.advance(tx, {
          scope,
          user,
          workflowScope: "QUALITY_RESULT",
          workflowGroup: "QUALITY_COMPLIANCE",
          workflowCode: "SERIAL_QC",
          entityType: "MANUFACTURING_SERIAL_QC",
          entityId: approvalEntityId,
          orderId: order.id,
          entityLabel: `serial QC for ${order.orderNumber}`,
          makerUserId: order.createdByUserId,
          transactionDate: when,
          idempotencyKey: dto.idempotencyKey,
          signatureMeaning: dto.signatureMeaning,
          reauthenticationPassword: dto.reauthenticationPassword,
          note: dto.note,
          evidence: {
            orderId: order.id,
            orderLotId: lot?.id ?? null,
            serialQcSubmission: serialQcSubmission(dto),
          },
          fallbackMakerCheckerRequired: true,
          fallbackElectronicSignatureRequired: true,
          fallbackStages: [
            { permissionKey: "manufacturing.quality.inspect" },
            { permissionKey: "manufacturing.quality.release" },
          ],
          minimumStages: 2,
        });
        approvalProgress = {
          totalStages: progress.totalStages,
          completedStages: progress.completedStages,
          nextStage: progress.nextStage,
          complete: progress.complete,
        };
        approvalReview = progress.review;
        if (!progress.complete) return { inspections: [], approvalProgress };
        const inspectorApproval = progress.stageApprovers[0];
        if (
          !inspectorApproval ||
          !inspectorApproval.userId ||
          inspectorApproval.userId === user.id
        ) {
          throw new ForbiddenException(
            "A pharmaceutical or hybrid serial QC result requires an independent approver distinct from the inspector.",
          );
        }
        inspectorUserId = inspectorApproval.userId;
        inspectedAt = inspectorApproval.transactionDate;
      }
      const created = [];
      for (const input of dto.inspections) {
        const serial = serials.find(
          (candidate) => candidate.id === input.serialId,
        )!;
        const inspectionId = manufacturingEntityIdFromIdempotency(
          scope.id,
          "ManufacturingQualityInspection",
          `${dto.idempotencyKey}:${serial.id}`,
        );
        const issuedNumber = await issueManufacturingDocumentNumberTx(
          tx,
          scope,
          user.id,
          {
            documentKind: "QC_INSPECTION",
            issuedAt: when,
            idempotencyKey: `MFG:${dto.idempotencyKey}:SERIAL_QC:${serial.id}`,
            entityType: "ManufacturingQualityInspection",
            entityId: inspectionId,
            validateIssuedAtOnReplay: true,
          },
        );
        const inspection = await tx.manufacturingQualityInspection.create({
          data: {
            id: inspectionId,
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            inspectionNumber: issuedNumber.documentNumber,
            inspectionType: "FINISHED_GOOD",
            status: input.passed ? "PASSED" : "FAILED",
            orderId: order.id,
            orderLotId: lot?.id ?? serial.orderLotId,
            inventoryItemId: order.finishedProductId,
            serialId: serial.id,
            sampleQuantity: 1,
            acceptedQuantity: input.passed ? 1 : 0,
            rejectedQuantity: input.passed ? 0 : 1,
            holdReason: input.passed ? null : input.holdReason!.trim(),
            notes: cleanText(dto.note),
            createdByUserId: inspectorUserId,
            inspectedByUserId: inspectorUserId,
            inspectedAt,
            approvedByUserId:
              input.passed || independentApprovalRequired ? user.id : null,
            approvedAt:
              input.passed || independentApprovalRequired ? when : null,
            results: {
              create: input.results.map((result, sortOrder) => ({
                parameterCode: normalizeCode(
                  result.parameterCode,
                  "QC parameter code",
                ),
                parameterName: result.parameterName.trim(),
                testMethod: cleanText(result.testMethod),
                unit: cleanText(result.unit),
                specificationMin: result.specificationMin ?? null,
                specificationMax: result.specificationMax ?? null,
                specificationText: cleanText(result.specificationText),
                actualValue: result.actualValue ?? null,
                actualText: cleanText(result.actualText),
                passed: result.passed,
                remarks: cleanText(result.remarks),
                sortOrder,
              })),
            },
          },
          include: {
            results: { orderBy: { sortOrder: "asc" } },
            serial: { select: { serialNumber: true } },
          },
        });
        await tx.manufacturingSerial.update({
          where: { id: serial.id },
          data: {
            status: input.passed
              ? serial.inventoryLotId
                ? "QC_HOLD"
                : "CREATED"
              : "REWORK",
          },
        });
        created.push(inspection);
      }
      const resultEvidence = {
        orderLotId: lot?.id ?? null,
        inspectionIds: created.map((inspection) => inspection.id),
        results: dto.inspections.map((input) => ({
          serialId: input.serialId,
          passed: input.passed,
          parameterCount: input.results.length,
        })),
      };
      if (approvalReview) {
        await tx.manufacturingWorkflowReview.update({
          where: { id: approvalReview.id },
          data: {
            evidence: {
              ...(approvalReview.evidence &&
              typeof approvalReview.evidence === "object" &&
              !Array.isArray(approvalReview.evidence)
                ? (approvalReview.evidence as Record<string, unknown>)
                : {}),
              ...resultEvidence,
            } as Prisma.InputJsonValue,
          },
        });
      } else {
        await this.audit(tx, scope, user, {
          workflowCode: "SERIAL_QC",
          entityType: "MANUFACTURING_ORDER",
          entityId: order.id,
          orderId: order.id,
          title: `Record serial QC for ${order.orderNumber}`,
          evidence: resultEvidence,
          dto,
        });
      }
      return { inspections: created, approvalProgress };
    });
    return { ...result, replayed: false };
  }

  async createPackagingOrder(
    user: AuthenticatedRequestUser,
    dto: CreateManufacturingPackagingOrderDto,
  ) {
    await this.requirePermission(user, "manufacturing.packaging.execute");
    const canReservePackagingMaterials = (
      await this.permissions.getGrantedKeys(user)
    ).has("manufacturing.material.reserve");
    const scope = await this.scope(user, dto.workspaceId);
    const replay = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (replay) {
      if (replay.workflowCode !== "PACKAGING_ORDER_CREATE" || !replay.entityId)
        throw new ConflictException(
          "Idempotency key is already used for another action.",
        );
      const packagingOrder = await this.packagingOrder(
        this.prisma,
        scope.id,
        replay.entityId,
      );
      this.assertPackagingOrderReplay(packagingOrder, dto);
      return { packagingOrder, replayed: true };
    }
    const when = asDate(dto.transactionDate);
    try {
      const result = await this.serializable(async (tx) => {
        const replayInTransaction =
          await tx.manufacturingWorkflowReview.findUnique({
            where: {
              workspaceId_idempotencyKey: {
                workspaceId: scope.id,
                idempotencyKey: dto.idempotencyKey,
              },
            },
          });
        if (replayInTransaction) {
          if (
            replayInTransaction.workflowCode !== "PACKAGING_ORDER_CREATE" ||
            !replayInTransaction.entityId
          ) {
            throw new ConflictException(
              "Idempotency key is already used for another action.",
            );
          }
          const packagingOrder = await this.packagingOrder(
            tx,
            scope.id,
            replayInTransaction.entityId,
          );
          this.assertPackagingOrderReplay(packagingOrder, dto);
          return { packagingOrderId: packagingOrder.id, replayed: true };
        }
        await this.assertPeriodOpen(
          tx,
          scope.id,
          when,
          "Packaging-order creation",
        );
        const order = await this.order(tx, scope.id, dto.orderId);
        const settings = await tx.manufacturingSettings.findUnique({
          where: { workspaceId: scope.id },
        });
        if (settings?.reservationRequired && !canReservePackagingMaterials) {
          throw new ForbiddenException(
            "manufacturing.material.reserve permission is required because packaging materials must be reserved atomically.",
          );
        }
        if (
          ["DRAFT", "SUBMITTED", "CANCELLED", "CLOSED"].includes(order.status)
        ) {
          throw new BadRequestException(
            "Packaging order requires an approved, running production order.",
          );
        }
        // An omitted lot is an explicit order-level packaging order, including
        // for multi-lot production. Serial allocation keeps its separate
        // single-lot convenience behaviour through resolveOrderLot().
        const lot = dto.orderLotId
          ? this.resolveOrderLot(order, dto.orderLotId)
          : null;
        const planned = decimal(lot?.plannedQuantity ?? order.plannedQuantity);
        if (!decimal(dto.plannedQuantity).equals(planned))
          throw new BadRequestException(
            "Packaging planned quantity must exactly match the selected production order or lot.",
          );
        if (dto.unit.trim().toLowerCase() !== order.unit.trim().toLowerCase())
          throw new BadRequestException(
            `Packaging order unit must be ${order.unit}.`,
          );
        const configuration = await tx.manufacturingControlRecord.findFirst({
          where: {
            id: dto.packagingConfigurationId,
            workspaceId: scope.id,
            kind: "PACKAGING_CONFIGURATION",
            status: "APPROVED",
            inventoryItemId: order.finishedProductId,
            OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: when } }],
            AND: [
              { OR: [{ effectiveTo: null }, { effectiveTo: { gte: when } }] },
            ],
          },
          include: { lines: true },
        });
        if (!configuration || !configuration.lines.length)
          throw new BadRequestException(
            "An approved, effective packaging configuration with components is required.",
          );
        const activeCoverage = await tx.manufacturingPackagingOrder.findMany({
          where: {
            workspaceId: scope.id,
            orderId: order.id,
            status: { notIn: ["CANCELLED", "CLOSED"] },
          },
          select: { packagingOrderNumber: true, orderLotId: true },
        });
        const duplicate = activeCoverage.find((candidate) =>
          packagingCoverageOverlaps(candidate.orderLotId, lot?.id ?? null),
        );
        if (duplicate) {
          throw new ConflictException(
            `Packaging order ${duplicate.packagingOrderNumber} already overlaps this ${lot ? "production lot" : "production order"}.`,
          );
        }
        if (dto.packagingOrderNumber?.trim())
          throw new BadRequestException(
            "Packaging order number is generated from the configured PACKAGING_ORDER sequence; leave it blank.",
          );
        const packagingOrderId = manufacturingEntityIdFromIdempotency(
          scope.id,
          "MANUFACTURING_PACKAGING_ORDER",
          dto.idempotencyKey,
        );
        const issuedNumber = await issueManufacturingDocumentNumberTx(
          tx,
          scope,
          user.id,
          {
            documentKind: "PACKAGING_ORDER",
            issuedAt: when,
            idempotencyKey: `MFG:${dto.idempotencyKey}:PACKAGING_ORDER`,
            entityType: "MANUFACTURING_PACKAGING_ORDER",
            entityId: packagingOrderId,
            validateIssuedAtOnReplay: true,
          },
        );
        const packagingOrder = await tx.manufacturingPackagingOrder.create({
          data: {
            id: packagingOrderId,
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            orderId: order.id,
            orderLotId: lot?.id ?? null,
            packagingConfigurationId: configuration.id,
            packagingOrderNumber: issuedNumber.documentNumber,
            plannedQuantity: dto.plannedQuantity,
            unit: dto.unit.trim(),
            createdByUserId: user.id,
          },
        });
        const materialRequirements = await this.syncPackagingOrderMaterials(
          tx,
          order.id,
        );
        const reservationOutcome = settings?.reservationRequired
          ? await this.reservePackagingMaterialTopUp(
              tx,
              scope,
              user,
              order,
              materialRequirements,
              when,
              `${dto.idempotencyKey}:PACKAGING-RESERVATION`,
            )
          : null;
        const materialShortage =
          reservationOutcome && !reservationOutcome.ready
            ? {
                checkedAt: when.toISOString(),
                warehouseId: order.issueWarehouseId,
                lines: reservationOutcome.shortages,
              }
            : null;
        if (materialShortage) {
          await tx.manufacturingPackagingOrder.update({
            where: { id: packagingOrder.id },
            data: {
              status: "MATERIAL_SHORT",
              materialShortage: materialShortage as Prisma.InputJsonValue,
            },
          });
        }
        await this.audit(tx, scope, user, {
          workflowCode: "PACKAGING_ORDER_CREATE",
          entityType: "MANUFACTURING_PACKAGING_ORDER",
          entityId: packagingOrder.id,
          orderId: order.id,
          title: `Create packaging order ${packagingOrder.packagingOrderNumber}`,
          evidence: {
            orderLotId: lot?.id ?? null,
            packagingConfigurationId: configuration.id,
            plannedQuantity: planned.toFixed(4),
            unit: dto.unit,
            materialRequirements,
            reservationRequired: settings?.reservationRequired ?? false,
            packagingReservation: reservationOutcome?.reservation ?? null,
            materialShortage,
            resultingStatus: materialShortage ? "MATERIAL_SHORT" : "DRAFT",
          },
          dto,
        });
        return { packagingOrderId: packagingOrder.id, replayed: false };
      });
      return {
        packagingOrder: await this.packagingOrder(
          this.prisma,
          scope.id,
          result.packagingOrderId,
        ),
        replayed: result.replayed,
      };
    } catch (error) {
      if (uniqueError(error)) {
        const replayAfterConflict =
          await this.prisma.manufacturingWorkflowReview.findUnique({
            where: {
              workspaceId_idempotencyKey: {
                workspaceId: scope.id,
                idempotencyKey: dto.idempotencyKey,
              },
            },
          });
        if (
          replayAfterConflict?.workflowCode === "PACKAGING_ORDER_CREATE" &&
          replayAfterConflict.entityId
        ) {
          const packagingOrder = await this.packagingOrder(
            this.prisma,
            scope.id,
            replayAfterConflict.entityId,
          );
          this.assertPackagingOrderReplay(packagingOrder, dto);
          return { packagingOrder, replayed: true };
        }
        throw new ConflictException(
          "Packaging order number or idempotency key is already in use.",
        );
      }
      throw error;
    }
  }

  async retryPackagingMaterialReservation(
    user: AuthenticatedRequestUser,
    packagingOrderId: string,
    dto: RetryPackagingMaterialReservationDto,
  ) {
    await this.requirePermission(user, "manufacturing.packaging.execute");
    await this.requirePermission(user, "manufacturing.material.reserve");
    const scope = await this.scope(user, dto.workspaceId);
    const replay = await this.auditReplay(
      scope,
      dto.idempotencyKey,
      "PACKAGING_MATERIAL_RESERVE",
      packagingOrderId,
    );
    if (replay) {
      return {
        packagingOrder: await this.packagingOrder(
          this.prisma,
          scope.id,
          packagingOrderId,
        ),
        replayed: true,
      };
    }
    const when = asDate(dto.transactionDate);
    const result = await this.serializable(async (tx) => {
      const replayInTransaction =
        await tx.manufacturingWorkflowReview.findUnique({
          where: {
            workspaceId_idempotencyKey: {
              workspaceId: scope.id,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
      if (replayInTransaction) {
        if (
          replayInTransaction.workflowCode !== "PACKAGING_MATERIAL_RESERVE" ||
          replayInTransaction.entityId !== packagingOrderId
        ) {
          throw new ConflictException(
            "Idempotency key is already used for a different manufacturing action.",
          );
        }
        return { replayed: true };
      }

      await this.assertPeriodOpen(
        tx,
        scope.id,
        when,
        "Packaging-material reservation retry",
      );
      const current = await this.packagingOrder(tx, scope.id, packagingOrderId);
      if (current.status !== "MATERIAL_SHORT") {
        throw new BadRequestException(
          "Packaging materials can be retried only while the packaging order is MATERIAL SHORT.",
        );
      }
      const settings = await tx.manufacturingSettings.findUnique({
        where: { workspaceId: scope.id },
        select: { reservationRequired: true },
      });
      if (!settings?.reservationRequired) {
        throw new BadRequestException(
          "Packaging-material reservation is not enabled for this workspace.",
        );
      }
      const order = await this.order(tx, scope.id, current.orderId);
      if (["CANCELLED", "CLOSED"].includes(order.status)) {
        throw new BadRequestException(
          "Packaging materials cannot be reserved for a cancelled or closed production order.",
        );
      }
      const materialRequirements = await this.syncPackagingOrderMaterials(
        tx,
        order.id,
      );
      const outcome = await this.reservePackagingMaterialTopUp(
        tx,
        scope,
        user,
        order,
        materialRequirements,
        when,
        `${dto.idempotencyKey}:PACKAGING-RESERVATION`,
      );
      const previousShortage = current.materialShortage;
      const materialShortage = outcome.ready
        ? null
        : {
            checkedAt: when.toISOString(),
            warehouseId: order.issueWarehouseId,
            lines: outcome.shortages,
          };
      await tx.manufacturingPackagingOrder.update({
        where: { id: current.id },
        data: outcome.ready
          ? { status: "DRAFT", materialShortage: Prisma.DbNull }
          : {
              status: "MATERIAL_SHORT",
              materialShortage: materialShortage as Prisma.InputJsonValue,
            },
      });
      await this.audit(tx, scope, user, {
        workflowCode: "PACKAGING_MATERIAL_RESERVE",
        entityType: "MANUFACTURING_PACKAGING_ORDER",
        entityId: current.id,
        orderId: current.orderId,
        title: `${outcome.ready ? "Reserve" : "Retry"} packaging materials for ${current.packagingOrderNumber}`,
        evidence: {
          previousShortage: previousShortage ?? null,
          materialRequirements,
          packagingReservation: outcome.reservation,
          materialShortage,
          resultingStatus: outcome.ready ? "DRAFT" : "MATERIAL_SHORT",
        } as Prisma.InputJsonValue,
        dto,
      });
      return { replayed: false };
    });
    return {
      packagingOrder: await this.packagingOrder(
        this.prisma,
        scope.id,
        packagingOrderId,
      ),
      replayed: result.replayed,
    };
  }

  async recordLineClearance(
    user: AuthenticatedRequestUser,
    packagingOrderId: string,
    dto: RecordPackagingLineClearanceDto,
  ) {
    await this.requirePermission(user, "manufacturing.packaging.execute");
    const scope = await this.scope(user, dto.workspaceId);
    const when = asDate(dto.transactionDate);
    await this.assertPeriodOpen(
      this.prisma,
      scope.id,
      when,
      "Packaging line clearance",
    );
    const result = await this.prisma.$transaction(
      async (tx) => {
        const current = await this.packagingOrder(
          tx,
          scope.id,
          packagingOrderId,
        );
        if (!["DRAFT", "LINE_CLEARED"].includes(current.status))
          throw new BadRequestException(
            "Line clearance must be recorded before packaging execution.",
          );
        const appended = await this.appendEvent(
          tx,
          scope,
          user,
          current.id,
          "LINE_CLEARANCE",
          dto,
          {
            evidenceReference: dto.evidenceReference.trim(),
            packagingConfigurationId: current.packagingConfigurationId,
          },
          dto.evidenceReference,
        );
        if (!appended.replayed) {
          await tx.manufacturingPackagingOrder.update({
            where: { id: current.id },
            data: {
              status: "LINE_CLEARED",
              lineClearanceReference: dto.evidenceReference.trim(),
              lineClearanceNote: cleanText(dto.note),
              lineClearedByUserId: user.id,
              lineClearedAt: when,
            },
          });
        }
        return appended.replayed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      packagingOrder: await this.packagingOrder(
        this.prisma,
        scope.id,
        packagingOrderId,
      ),
      replayed: result,
    };
  }

  async reconcilePackaging(
    user: AuthenticatedRequestUser,
    packagingOrderId: string,
    dto: ReconcileManufacturingPackagingDto,
  ) {
    await this.requirePermission(user, "manufacturing.packaging.execute");
    const scope = await this.scope(user, dto.workspaceId);
    const when = asDate(dto.transactionDate);
    await this.assertPeriodOpen(
      this.prisma,
      scope.id,
      when,
      "Packaging reconciliation",
    );
    const current = await this.packagingOrder(
      this.prisma,
      scope.id,
      packagingOrderId,
    );
    if (
      !current.lineClearedAt ||
      !["LINE_CLEARED", "IN_PROGRESS", "EXECUTED", "RECONCILED"].includes(
        current.status,
      )
    ) {
      throw new BadRequestException(
        "Approved line-clearance evidence is required before packaging reconciliation.",
      );
    }
    const componentIds = current.packagingConfiguration.lines.map(
      (line) => line.inventoryItemId,
    );
    if (
      new Set(dto.lines.map((line) => line.inventoryItemId)).size !==
      dto.lines.length
    )
      throw new BadRequestException(
        "Packaging reconciliation cannot repeat a component.",
      );
    if (
      dto.lines.length !== componentIds.length ||
      dto.lines.some((line) => !componentIds.includes(line.inventoryItemId))
    ) {
      throw new BadRequestException(
        "Packaging reconciliation must include every configured packaging component exactly once.",
      );
    }
    const transactions = await this.prisma.manufacturingTransaction.findMany({
      where: {
        workspaceId: scope.id,
        orderId: current.orderId,
        // A lot-specific PKO reconciles that lot only; an order-level PKO
        // reconciles the aggregate of every lot posting on its parent order.
        ...(current.orderLotId ? { orderLotId: current.orderLotId } : {}),
        status: "POSTED",
        transactionType: { in: ["PACKAGING_ISSUE", "PACKAGING_RETURN"] },
      },
      include: { lines: true },
      orderBy: { transactionDate: "asc" },
    });
    const actuals = new Map<
      string,
      {
        issued: Prisma.Decimal;
        returned: Prisma.Decimal;
        issueIds: string[];
        returnIds: string[];
      }
    >();
    for (const componentId of componentIds)
      actuals.set(componentId, {
        issued: decimal(0),
        returned: decimal(0),
        issueIds: [],
        returnIds: [],
      });
    for (const transaction of transactions) {
      for (const line of transaction.lines.filter((candidate) =>
        componentIds.includes(candidate.inventoryItemId),
      )) {
        const actual = actuals.get(line.inventoryItemId)!;
        if (transaction.transactionType === "PACKAGING_ISSUE") {
          actual.issued = actual.issued.add(line.quantity);
          if (!actual.issueIds.includes(transaction.id))
            actual.issueIds.push(transaction.id);
        } else {
          actual.returned = actual.returned.add(line.quantity);
          if (!actual.returnIds.includes(transaction.id))
            actual.returnIds.push(transaction.id);
        }
      }
    }
    for (const input of dto.lines) {
      const config = current.packagingConfiguration.lines.find(
        (line) => line.inventoryItemId === input.inventoryItemId,
      )!;
      const actual = actuals.get(input.inventoryItemId)!;
      if (!actual.issued.greaterThan(0))
        throw new BadRequestException(
          `${config.inventoryItem.itemName} has no posted PACKAGING_ISSUE transaction.`,
        );
      const required = decimal(config.quantity)
        .mul(current.plannedQuantity)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      if (!actual.issued.equals(required)) {
        throw new BadRequestException(
          `${config.inventoryItem.itemName} issued quantity must equal the exact packaging requirement ${required.toFixed(4)} ${config.unit}; posted ${actual.issued.toFixed(4)}.`,
        );
      }
      if (!actual.returned.equals(input.returnedQuantity)) {
        throw new BadRequestException(
          `${config.inventoryItem.itemName} returned quantity must equal posted PACKAGING_RETURN quantity ${actual.returned.toFixed(4)}.`,
        );
      }
      if (config.unit.trim().toLowerCase() !== input.unit.trim().toLowerCase())
        throw new BadRequestException(
          `${config.inventoryItem.itemName} reconciliation unit must be ${config.unit}.`,
        );
      const evaluation = evaluatePackagingReconciliation({
        issuedQuantity: actual.issued.toFixed(4),
        usedQuantity: input.usedQuantity,
        returnedQuantity: input.returnedQuantity,
        rejectedQuantity: input.rejectedQuantity,
        destroyedQuantity: input.destroyedQuantity,
      });
      if (!evaluation.ready)
        throw new BadRequestException(
          `${config.inventoryItem.itemName}: ${evaluation.issue}`,
        );
    }
    const replayed = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.manufacturingPackagingEvent.findUnique({
          where: {
            packagingOrderId_idempotencyKey: {
              packagingOrderId,
              idempotencyKey: `${dto.idempotencyKey}:RECONCILE`,
            },
          },
        });
        if (existing) return true;
        for (const input of dto.lines) {
          const actual = actuals.get(input.inventoryItemId)!;
          await tx.manufacturingPackagingReconciliation.upsert({
            where: {
              packagingOrderId_inventoryItemId: {
                packagingOrderId,
                inventoryItemId: input.inventoryItemId,
              },
            },
            create: {
              packagingOrderId,
              inventoryItemId: input.inventoryItemId,
              issuedQuantity: actual.issued,
              usedQuantity: input.usedQuantity,
              returnedQuantity: input.returnedQuantity,
              rejectedQuantity: input.rejectedQuantity,
              destroyedQuantity: input.destroyedQuantity,
              unit: input.unit.trim(),
              issueTransactionIds: actual.issueIds,
              returnTransactionIds: actual.returnIds,
              note: cleanText(input.note),
            },
            update: {
              issuedQuantity: actual.issued,
              usedQuantity: input.usedQuantity,
              returnedQuantity: input.returnedQuantity,
              rejectedQuantity: input.rejectedQuantity,
              destroyedQuantity: input.destroyedQuantity,
              unit: input.unit.trim(),
              issueTransactionIds: actual.issueIds,
              returnTransactionIds: actual.returnIds,
              note: cleanText(input.note),
            },
          });
        }
        await this.appendEvent(
          tx,
          scope,
          user,
          packagingOrderId,
          "EXECUTION",
          dto,
          { componentCount: dto.lines.length },
          null,
          ":EXECUTE",
        );
        await this.appendEvent(
          tx,
          scope,
          user,
          packagingOrderId,
          "RECONCILIATION",
          dto,
          {
            lines: dto.lines.map((line) => ({
              ...line,
              issuedQuantity: actuals
                .get(line.inventoryItemId)!
                .issued.toString(),
            })),
          },
          null,
          ":RECONCILE",
        );
        await tx.manufacturingPackagingOrder.update({
          where: { id: packagingOrderId },
          data: { status: "RECONCILED", executedAt: when, reconciledAt: when },
        });
        return false;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      packagingOrder: await this.packagingOrder(
        this.prisma,
        scope.id,
        packagingOrderId,
      ),
      replayed,
    };
  }

  async registerLabels(
    user: AuthenticatedRequestUser,
    packagingOrderId: string,
    dto: RegisterManufacturingPackagingLabelsDto,
  ) {
    await this.requirePermission(user, "manufacturing.packaging.execute");
    const scope = await this.scope(user, dto.workspaceId);
    const current = await this.packagingOrder(
      this.prisma,
      scope.id,
      packagingOrderId,
    );
    if (!current.lineClearedAt)
      throw new BadRequestException(
        "Line clearance is required before label control.",
      );
    if (["RELEASE_READY", "CLOSED", "CANCELLED"].includes(current.status))
      throw new BadRequestException(
        "Label control is locked after packaging release readiness or closure.",
      );
    if (
      new Set(dto.labels.map((label) => label.labelCode.trim().toUpperCase()))
        .size !== dto.labels.length
    )
      throw new BadRequestException(
        "Label codes must be unique within a posting.",
      );
    const serialIds = dto.labels
      .map((label) => label.serialId)
      .filter((value): value is string => Boolean(value));
    const serials = serialIds.length
      ? await this.prisma.manufacturingSerial.findMany({
          where: {
            workspaceId: scope.id,
            id: { in: serialIds },
            orderId: current.orderId,
          },
        })
      : [];
    if (
      serials.length !== new Set(serialIds).size ||
      serials.some(
        (serial) =>
          current.orderLotId && serial.orderLotId !== current.orderLotId,
      )
    ) {
      throw new BadRequestException(
        "Every label serial must belong to this packaging order's production order and lot.",
      );
    }
    for (const label of dto.labels) {
      if (label.status === "USED" && !label.serialId)
        throw new BadRequestException(
          "A used label must be linked to one finished-product serial.",
        );
      if (
        ["RETURNED", "VOIDED", "DESTROYED"].includes(label.status) &&
        !cleanText(label.dispositionReason)
      ) {
        throw new BadRequestException(
          `${label.status} label requires dispositionReason.`,
        );
      }
    }
    const proposedLabels = new Map(
      current.labels.map((label) => [
        label.labelCode,
        { serialId: label.serialId, status: label.status },
      ]),
    );
    for (const label of dto.labels) {
      proposedLabels.set(label.labelCode.trim().toUpperCase(), {
        serialId: cleanText(label.serialId),
        status: label.status,
      });
    }
    const usedCountBySerial = new Map<string, number>();
    for (const label of proposedLabels.values()) {
      if (label.status !== "USED" || !label.serialId) continue;
      usedCountBySerial.set(
        label.serialId,
        (usedCountBySerial.get(label.serialId) ?? 0) + 1,
      );
    }
    const duplicateUsedSerial = [...usedCountBySerial.entries()].find(
      ([, count]) => count > 1,
    )?.[0];
    if (duplicateUsedSerial)
      throw new BadRequestException(
        "A finished-product serial may have exactly one used label; void or return the prior label before using its replacement.",
      );
    const when = asDate(dto.transactionDate);
    await this.assertPeriodOpen(
      this.prisma,
      scope.id,
      when,
      "Packaging label control",
    );
    const replayed = await this.prisma.$transaction(
      async (tx) => {
        const event = await tx.manufacturingPackagingEvent.findUnique({
          where: {
            packagingOrderId_idempotencyKey: {
              packagingOrderId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (event) return true;
        for (const label of dto.labels) {
          const labelCode = label.labelCode.trim().toUpperCase();
          const existing = await tx.manufacturingPackagingLabel.findUnique({
            where: {
              workspaceId_labelCode: { workspaceId: scope.id, labelCode },
            },
          });
          if (existing && existing.packagingOrderId !== packagingOrderId)
            throw new ConflictException(
              `Label ${labelCode} belongs to another packaging order.`,
            );
          await tx.manufacturingPackagingLabel.upsert({
            where: {
              workspaceId_labelCode: { workspaceId: scope.id, labelCode },
            },
            create: {
              workspaceId: scope.id,
              packagingOrderId,
              serialId: cleanText(label.serialId),
              labelCode,
              status: label.status,
              issuedAt: when,
              usedAt: label.status === "USED" ? when : null,
              dispositionReason: cleanText(label.dispositionReason),
              createdByUserId: user.id,
              updatedByUserId: user.id,
            },
            update: {
              serialId: cleanText(label.serialId),
              status: label.status,
              usedAt: label.status === "USED" ? when : null,
              dispositionReason: cleanText(label.dispositionReason),
              updatedByUserId: user.id,
            },
          });
        }
        await this.appendEvent(
          tx,
          scope,
          user,
          packagingOrderId,
          "LABEL_CONTROL",
          dto,
          {
            labels: dto.labels.map(({ labelCode, serialId, status }) => ({
              labelCode,
              serialId: serialId ?? null,
              status,
            })),
          },
        );
        if (["LINE_CLEARED", "DRAFT"].includes(current.status))
          await tx.manufacturingPackagingOrder.update({
            where: { id: packagingOrderId },
            data: { status: "IN_PROGRESS" },
          });
        return false;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      packagingOrder: await this.packagingOrder(
        this.prisma,
        scope.id,
        packagingOrderId,
      ),
      replayed,
    };
  }

  async registerPackageUnits(
    user: AuthenticatedRequestUser,
    packagingOrderId: string,
    dto: RegisterManufacturingPackageUnitsDto,
  ) {
    await this.requirePermission(user, "manufacturing.packaging.execute");
    const scope = await this.scope(user, dto.workspaceId);
    const current = await this.packagingOrder(
      this.prisma,
      scope.id,
      packagingOrderId,
    );
    if (!current.lineClearedAt)
      throw new BadRequestException(
        "Line clearance is required before package aggregation.",
      );
    if (["RELEASE_READY", "CLOSED", "CANCELLED"].includes(current.status))
      throw new BadRequestException(
        "Package aggregation is locked after packaging release readiness or closure.",
      );
    const when = asDate(dto.transactionDate);
    await this.assertPeriodOpen(
      this.prisma,
      scope.id,
      when,
      "Package aggregation",
    );
    const normalizedCodes = dto.units.map((unit) =>
      normalizeCode(unit.code, "Package code"),
    );
    if (new Set(normalizedCodes).size !== normalizedCodes.length)
      throw new BadRequestException(
        "Package codes must be unique within a posting.",
      );
    const serialIds = dto.units
      .map((unit) => unit.serialId)
      .filter((value): value is string => Boolean(value));
    const serials = serialIds.length
      ? await this.prisma.manufacturingSerial.findMany({
          where: {
            workspaceId: scope.id,
            id: { in: serialIds },
            orderId: current.orderId,
          },
        })
      : [];
    if (
      serials.length !== new Set(serialIds).size ||
      serials.some(
        (serial) =>
          current.orderLotId && serial.orderLotId !== current.orderLotId,
      )
    )
      throw new BadRequestException(
        "Every package-unit serial must belong to this production order and lot.",
      );
    for (const unit of dto.units) {
      if (unit.level === "UNIT" && !unit.serialId)
        throw new BadRequestException(
          "Every UNIT package requires a serialId.",
        );
      if (unit.level !== "UNIT" && unit.serialId)
        throw new BadRequestException(
          "Only UNIT packages may link directly to serials.",
        );
    }
    const replayed = await this.prisma.$transaction(
      async (tx) => {
        const event = await tx.manufacturingPackagingEvent.findUnique({
          where: {
            packagingOrderId_idempotencyKey: {
              packagingOrderId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
        });
        if (event) return true;
        for (const [index, input] of dto.units.entries()) {
          const code = normalizedCodes[index];
          const existing = await tx.manufacturingPackageUnit.findUnique({
            where: { workspaceId_code: { workspaceId: scope.id, code } },
          });
          if (existing && existing.packagingOrderId !== packagingOrderId)
            throw new ConflictException(
              `Package code ${code} belongs to another packaging order.`,
            );
          await tx.manufacturingPackageUnit.upsert({
            where: { workspaceId_code: { workspaceId: scope.id, code } },
            create: {
              workspaceId: scope.id,
              packagingOrderId,
              level: input.level,
              code,
              serialId: cleanText(input.serialId),
              quantity: input.quantity ?? 1,
              note: cleanText(input.note),
              createdByUserId: user.id,
            },
            update: {
              level: input.level,
              serialId: cleanText(input.serialId),
              quantity: input.quantity ?? 1,
              note: cleanText(input.note),
              parentId: null,
            },
          });
        }
        const allRows = await tx.manufacturingPackageUnit.findMany({
          where: { packagingOrderId },
        });
        const byCode = new Map(allRows.map((row) => [row.code, row]));
        for (const [index, input] of dto.units.entries()) {
          const child = byCode.get(normalizedCodes[index])!;
          const parentCode = cleanText(input.parentCode)
            ? normalizeCode(input.parentCode!, "Parent package code")
            : null;
          const parent = parentCode ? byCode.get(parentCode) : null;
          if (parentCode && !parent)
            throw new BadRequestException(
              `Parent package ${parentCode} does not exist in this packaging order.`,
            );
          await tx.manufacturingPackageUnit.update({
            where: { id: child.id },
            data: { parentId: parent?.id ?? null },
          });
        }
        const hierarchyRows = await tx.manufacturingPackageUnit.findMany({
          where: { packagingOrderId },
        });
        const hierarchy = evaluatePackagingHierarchy({
          serialIds: [],
          usedLabelSerialIds: [],
          units: hierarchyRows.map((row) => ({
            id: row.id,
            level: row.level,
            parentId: row.parentId,
            serialId: row.serialId,
          })),
        });
        if (
          hierarchy.issues.some(
            (issue) =>
              issue.includes("invalid") ||
              issue.includes("unknown") ||
              issue.includes("cannot directly"),
          )
        ) {
          throw new BadRequestException(hierarchy.issues.join(" "));
        }
        await this.appendEvent(
          tx,
          scope,
          user,
          packagingOrderId,
          "AGGREGATION",
          dto,
          { packageCodes: normalizedCodes },
        );
        return false;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      packagingOrder: await this.packagingOrder(
        this.prisma,
        scope.id,
        packagingOrderId,
      ),
      replayed,
    };
  }

  async confirmReleaseReadiness(
    user: AuthenticatedRequestUser,
    packagingOrderId: string,
    dto: ConfirmPackagingReleaseReadinessDto,
  ) {
    await this.requirePermission(user, "manufacturing.quality.release");
    const scope = await this.scope(user, dto.workspaceId);
    const when = asDate(dto.transactionDate);
    await this.assertPeriodOpen(
      this.prisma,
      scope.id,
      when,
      "Packaging release readiness",
    );
    const current = await this.packagingOrder(
      this.prisma,
      scope.id,
      packagingOrderId,
    );
    const qualitySettings = await this.prisma.manufacturingSettings.findUnique({
      where: { workspaceId: scope.id },
      select: { mode: true },
    });
    const qualityMode =
      qualitySettings?.mode === "PHARMACEUTICAL" ||
      qualitySettings?.mode === "HYBRID"
        ? qualitySettings.mode
        : "GENERAL";
    const issues: string[] = [];
    if (!current.lineClearedAt || !current.lineClearanceReference)
      issues.push("Line-clearance evidence is missing.");
    if (current.packagingConfiguration.status !== "APPROVED")
      issues.push("Packaging configuration is no longer approved.");
    if (
      current.packagingConfiguration.inventoryItemId !==
      current.order.finishedProductId
    )
      issues.push(
        "Packaging configuration does not belong to the production-order finished product.",
      );
    if (
      current.packagingConfiguration.approvedAt &&
      current.packagingConfiguration.approvedAt > when
    )
      issues.push(
        "Packaging configuration was not approved on the action date.",
      );
    if (
      current.packagingConfiguration.effectiveFrom &&
      current.packagingConfiguration.effectiveFrom > when
    )
      issues.push("Packaging configuration is not yet effective.");
    if (
      current.packagingConfiguration.effectiveTo &&
      current.packagingConfiguration.effectiveTo < when
    )
      issues.push("Packaging configuration is no longer effective.");
    if (current.orderLotId)
      issues.push(
        "Release readiness requires one exact order-level packaging order; lot-level coverage is not sufficient.",
      );
    if (
      !decimal(current.plannedQuantity).equals(current.order.completedQuantity)
    )
      issues.push(
        "Packaging planned quantity must exactly equal the accepted production-order quantity.",
      );
    const finishedGoodsReceipts =
      await this.prisma.manufacturingTransaction.findMany({
        where: {
          workspaceId: scope.id,
          orderId: current.orderId,
          transactionType: "PRODUCTION_RECEIPT",
          status: "POSTED",
          transactionDate: { lte: when },
        },
        select: {
          id: true,
          transactionDate: true,
          lines: {
            where: {
              inventoryItemId: current.order.finishedProductId,
              orderMaterialId: null,
            },
            select: { quantity: true },
          },
        },
      });
    const finishedGoodsReceiptQuantity = finishedGoodsReceipts.reduce(
      (total, receipt) =>
        receipt.lines.reduce(
          (receiptTotal, line) => receiptTotal.add(line.quantity),
          total,
        ),
      decimal(0),
    );
    if (
      !finishedGoodsReceiptQuantity.equals(current.order.completedQuantity) ||
      finishedGoodsReceipts.length === 0
    )
      issues.push(
        "Exact posted finished-goods receipt quantity is required before packaging can become RELEASE_READY.",
      );
    if (current.status !== "RECONCILED" && current.status !== "RELEASE_READY")
      issues.push("Packaging material execution has not been reconciled.");
    const configIds = current.packagingConfiguration.lines.map(
      (line) => line.inventoryItemId,
    );
    if (
      current.reconciliations.length !== configIds.length ||
      current.reconciliations.some(
        (line) => !configIds.includes(line.inventoryItemId),
      )
    ) {
      issues.push(
        "Every approved packaging component must have one reconciliation line.",
      );
    }
    for (const line of current.reconciliations) {
      const evaluation = evaluatePackagingReconciliation({
        issuedQuantity: line.issuedQuantity.toFixed(4),
        usedQuantity: line.usedQuantity.toFixed(4),
        returnedQuantity: line.returnedQuantity.toFixed(4),
        rejectedQuantity: line.rejectedQuantity.toFixed(4),
        destroyedQuantity: line.destroyedQuantity.toFixed(4),
      });
      if (!evaluation.ready)
        issues.push(
          `Packaging component ${line.inventoryItemId} is not fully reconciled.`,
        );
    }
    const serials = await this.prisma.manufacturingSerial.findMany({
      where: {
        workspaceId: scope.id,
        orderId: current.orderId,
        ...(current.orderLotId ? { orderLotId: current.orderLotId } : {}),
      },
      include: {
        qualityInspections: {
          orderBy: [{ inspectedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
      orderBy: { serialNumber: "asc" },
    });
    if (!decimal(current.plannedQuantity).isInteger())
      issues.push("Serialized packaging quantity must be a whole number.");
    if (serials.length !== Number(decimal(current.plannedQuantity).toFixed(0)))
      issues.push(
        "One allocated serial is required for every planned finished unit.",
      );
    for (const serial of serials) {
      if (!serial.inventoryLotId || serial.status !== "QC_HOLD")
        issues.push(
          `Serial ${serial.serialNumber} is not received and held in finished-goods quarantine.`,
        );
      const latestInspection = serial.qualityInspections[0];
      if (latestInspection?.status !== "PASSED")
        issues.push(
          `Serial ${serial.serialNumber} does not have a latest PASSED QC inspection.`,
        );
      else if (
        qualityMode !== "GENERAL" &&
        !satisfiesPassedQualityInspectionIndependence({
          mode: qualityMode,
          status: latestInspection.status,
          inspectedByUserId: latestInspection.inspectedByUserId,
          approvedByUserId: latestInspection.approvedByUserId,
        })
      ) {
        issues.push(
          `Serial ${serial.serialNumber} does not have a latest PASSED QC inspection independently approved by a different authorized user.`,
        );
      }
    }
    const hierarchy = evaluatePackagingHierarchy({
      serialIds: serials.map((serial) => serial.id),
      usedLabelSerialIds: current.labels
        .filter((label) => label.status === "USED" && label.serialId)
        .map((label) => label.serialId!),
      units: current.packageUnits.map((unit) => ({
        id: unit.id,
        level: unit.level,
        parentId: unit.parentId,
        serialId: unit.serialId,
      })),
    });
    issues.push(...hierarchy.issues);
    const eventTypes = new Set(current.events.map((event) => event.eventType));
    for (const required of [
      "LINE_CLEARANCE",
      "EXECUTION",
      "RECONCILIATION",
      "LABEL_CONTROL",
      "AGGREGATION",
    ] as const) {
      if (!eventTypes.has(required))
        issues.push(
          `${required.replaceAll("_", " ")} eBPR evidence is missing.`,
        );
    }
    if (issues.length) throw new BadRequestException(issues.join(" "));
    const appended = await this.prisma.$transaction(
      async (tx) => {
        const event = await this.appendEvent(
          tx,
          scope,
          user,
          packagingOrderId,
          "RELEASE_READINESS",
          dto,
          {
            serialCount: serials.length,
            qcPassedCount: serials.length,
            usedLabelCount: current.labels.filter(
              (label) => label.status === "USED",
            ).length,
            unitPackageCount: current.packageUnits.filter(
              (unit) => unit.level === "UNIT",
            ).length,
            reconciliationCount: current.reconciliations.length,
          },
        );
        if (!event.replayed)
          await tx.manufacturingPackagingOrder.update({
            where: { id: packagingOrderId },
            data: { status: "RELEASE_READY", releaseReadyAt: when },
          });
        return event.replayed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      packagingOrder: await this.packagingOrder(
        this.prisma,
        scope.id,
        packagingOrderId,
      ),
      replayed: appended,
    };
  }
}
