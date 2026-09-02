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
  ManufacturingCapacityCheckStatus,
  ManufacturingControlRecordKind,
  ManufacturingDocumentKind,
  ManufacturingPeriodStatus,
  ManufacturingResourceKind,
  Prisma,
} from "../generated/prisma/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  calculateResourceCapacity,
  evaluatePeriodEvidencePack,
  manufacturingPeriodBounds,
  summarizeCapacity,
} from "./manufacturing-blueprint.domain.js";
import {
  issueManufacturingDocumentNumberTx,
  manufacturingEntityIdFromIdempotency,
} from "./manufacturing-document-number.js";
import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import type {
  ApproveManufacturingControlRecordDto,
  ArchiveManufacturingPeriodDto,
  AssignOperationResourceDto,
  ConfigureManufacturingDocumentSequenceDto,
  ControlRecordLineDto,
  CreateArtworkSpecificationDto,
  CreateDemandPlanDto,
  CreateManufacturingCalendarSlotDto,
  CreateManufacturingCampaignDto,
  CreateManufacturingReasonCodeDto,
  CreateManufacturingResourceDto,
  CreateManufacturingShiftDto,
  CreateMasterProductionScheduleDto,
  CreatePackagingConfigurationDto,
  CreateQualitySpecificationDto,
  CreateTestMethodDto,
  EnsureManufacturingPeriodDto,
  IssueManufacturingDocumentNumberDto,
  LockManufacturingPeriodDto,
  RunManufacturingCapacityCheckDto,
  UpdateManufacturingResourceDto,
  UpdateManufacturingResourceReadinessDto,
  ValidateManufacturingPeriodDto,
} from "./manufacturing-blueprint.dto.js";

type Db = Prisma.TransactionClient | PrismaService;
type Query = Record<string, string | undefined>;
type Scope = { id: string; tenantId: string; companyId: string };

export function manufacturingPeriodOrderActivityScope(
  workspaceId: string,
  start: Date,
  end: Date,
  next: Date,
): Prisma.ManufacturingOrderWhereInput {
  const withinPeriod = { gte: start, lt: next };
  return {
    workspaceId,
    OR: [
      {
        plannedStartDate: { lte: end },
        plannedEndDate: { gte: start },
      },
      { plannedStartDate: withinPeriod },
      { plannedEndDate: withinPeriod },
      {
        AND: [
          { actualStartAt: { lt: next } },
          { OR: [{ actualEndAt: null }, { actualEndAt: { gte: start } }] },
        ],
      },
      { actualEndAt: withinPeriod },
      { createdAt: withinPeriod },
      { submittedAt: withinPeriod },
      { approvedAt: withinPeriod },
      { closedAt: withinPeriod },
      { reopenedAt: withinPeriod },
      { transactions: { some: { transactionDate: withinPeriod } } },
      { actualCostPostings: { some: { transactionDate: withinPeriod } } },
      {
        costSnapshots: {
          some: {
            OR: [
              { createdAt: withinPeriod },
              { updatedAt: withinPeriod },
              { finalizedAt: withinPeriod },
            ],
          },
        },
      },
      {
        reservations: {
          some: {
            AND: [
              { reservedAt: { lt: next } },
              { OR: [{ releasedAt: null }, { releasedAt: { gte: start } }] },
            ],
          },
        },
      },
      {
        operationExecutions: {
          some: {
            OR: [
              { createdAt: withinPeriod },
              { updatedAt: withinPeriod },
              { startedAt: withinPeriod },
              { completedAt: withinPeriod },
              {
                AND: [
                  { startedAt: { lt: next } },
                  {
                    OR: [
                      { completedAt: null },
                      { completedAt: { gte: start } },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        qualityInspections: {
          some: {
            OR: [
              { createdAt: withinPeriod },
              { updatedAt: withinPeriod },
              { inspectedAt: withinPeriod },
              { approvedAt: withinPeriod },
            ],
          },
        },
      },
      { workflowReviews: { some: { transactionDate: withinPeriod } } },
      {
        lots: {
          some: {
            OR: [
              { createdAt: withinPeriod },
              { updatedAt: withinPeriod },
              { startedAt: withinPeriod },
              { completedAt: withinPeriod },
            ],
          },
        },
      },
      {
        packagingOrders: {
          some: {
            OR: [
              { createdAt: withinPeriod },
              { updatedAt: withinPeriod },
              { lineClearedAt: withinPeriod },
              { executedAt: withinPeriod },
              { reconciledAt: withinPeriod },
              { releaseReadyAt: withinPeriod },
              { closedAt: withinPeriod },
              { events: { some: { transactionDate: withinPeriod } } },
            ],
          },
        },
      },
      {
        serials: {
          some: {
            OR: [{ createdAt: withinPeriod }, { updatedAt: withinPeriod }],
          },
        },
      },
      {
        downtimeEvents: {
          some: {
            AND: [
              { startedAt: { lt: next } },
              { OR: [{ endedAt: null }, { endedAt: { gte: start } }] },
            ],
          },
        },
      },
    ],
  };
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asDate(value: string, label = "date"): Date {
  const result = new Date(value);
  if (Number.isNaN(result.getTime()))
    throw new BadRequestException(`${label} is invalid.`);
  return result;
}

function dateOnly(value: string, label = "date"): Date {
  const result = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : asDate(value, label);
  if (Number.isNaN(result.getTime()))
    throw new BadRequestException(`${label} is invalid.`);
  return result;
}

function normalizeCode(value: string, label: string): string {
  const code = value.trim().toUpperCase().replace(/\s+/g, "-");
  if (!code) throw new BadRequestException(`${label} is required.`);
  if (code.length > 80)
    throw new BadRequestException(`${label} cannot exceed 80 characters.`);
  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
    throw new BadRequestException(
      `${label} may contain letters, numbers, dot, underscore, slash and hyphen only.`,
    );
  }
  return code;
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

function isSerializationConflict(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "P2034",
  );
}

function decimalNumber(value: Prisma.Decimal.Value | null | undefined): number {
  return new Prisma.Decimal(value ?? 0).toNumber();
}

function uniqueSequences(lines: Array<{ sequence: number }>, label: string) {
  const values = new Set(lines.map((line) => line.sequence));
  if (values.size !== lines.length)
    throw new BadRequestException(`${label} line sequences must be unique.`);
}

@Injectable()
export class ManufacturingBlueprintService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ManufacturingElectronicSignatureService)
    private readonly electronicSignature: ManufacturingElectronicSignatureService,
  ) {}

  private async serializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!isSerializationConflict(error) || attempt === 2) throw error;
      }
    }
    throw new ConflictException(
      "The manufacturing transaction could not be serialized.",
    );
  }

  private async scope(
    currentUser: AuthenticatedRequestUser,
    requestedWorkspaceId?: string,
  ): Promise<Scope> {
    const workspaceId = requestedWorkspaceId || currentUser.workspaceId;
    if (!workspaceId || !currentUser.workspaceId)
      throw new BadRequestException("An active workspace is required.");
    if (workspaceId !== currentUser.workspaceId) {
      throw new ForbiddenException(
        "Cross-workspace manufacturing access is not allowed.",
      );
    }
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

  private async assertManufacturingPeriodOpen(
    db: Db,
    workspaceId: string,
    transactionDate: Date,
    actionLabel: string,
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
        `${actionLabel} is blocked because manufacturing period ${period.periodYear}-${String(period.periodMonth).padStart(2, "0")} is ${period.status}.`,
      );
    }
  }

  private async createAudit(
    db: Prisma.TransactionClient,
    scope: Scope,
    user: AuthenticatedRequestUser,
    input: {
      workflowGroup: string;
      workflowCode: string;
      entityType: string;
      entityId: string;
      transactionDate: Date;
      idempotencyKey: string;
      title: string;
      note?: string | null;
      evidence: Prisma.InputJsonValue;
      signatureMeaning?: string | null;
      planId?: string | null;
      approved?: boolean;
    },
  ) {
    const approved = input.approved ?? true;
    return db.manufacturingWorkflowReview.create({
      data: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        planId: input.planId ?? null,
        workflowGroup: input.workflowGroup,
        workflowCode: input.workflowCode,
        entityType: input.entityType,
        entityId: input.entityId,
        transactionDate: input.transactionDate,
        idempotencyKey: input.idempotencyKey,
        title: input.title,
        outcome: "EXECUTED",
        status: approved ? "APPROVED" : "REVIEWED",
        note: cleanText(input.note),
        evidence: input.evidence,
        signatureHash: input.signatureMeaning
          ? signatureHash([
              scope.id,
              input.workflowCode,
              input.entityId,
              user.id,
              input.transactionDate.toISOString(),
              input.idempotencyKey,
              input.signatureMeaning.trim(),
            ])
          : null,
        reviewedByUserId: approved ? null : user.id,
        reviewedAt: approved ? null : input.transactionDate,
        approvedByUserId: approved ? user.id : null,
        approvedAt: approved ? input.transactionDate : null,
        createdByUserId: user.id,
      },
    });
  }

  private async validateResourceReferences(
    db: Db,
    workspaceId: string,
    input: {
      parentResourceId?: string | null;
      warehouseId?: string | null;
      locationId?: string | null;
    },
    currentId?: string,
  ) {
    if (input.parentResourceId) {
      if (input.parentResourceId === currentId)
        throw new BadRequestException("A resource cannot be its own parent.");
      const parent = await db.manufacturingResource.findFirst({
        where: { id: input.parentResourceId, workspaceId, isActive: true },
        select: { id: true },
      });
      if (!parent)
        throw new BadRequestException(
          "Parent resource must be active in this workspace.",
        );
    }
    if (input.warehouseId) {
      const warehouse = await db.warehouse.findFirst({
        where: {
          id: input.warehouseId,
          workspaceId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!warehouse)
        throw new BadRequestException(
          "Warehouse must be active in this workspace.",
        );
    }
    if (input.locationId) {
      const location = await db.manufacturingLocation.findFirst({
        where: { id: input.locationId, workspaceId, isActive: true },
        select: { id: true, warehouseId: true },
      });
      if (!location)
        throw new BadRequestException(
          "Manufacturing location must be active in this workspace.",
        );
      if (input.warehouseId && location.warehouseId !== input.warehouseId) {
        throw new BadRequestException(
          "Manufacturing location does not belong to the selected warehouse.",
        );
      }
    }
  }

  async listResources(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const kind =
      query.kind &&
      Object.values(ManufacturingResourceKind).includes(
        query.kind as ManufacturingResourceKind,
      )
        ? (query.kind as ManufacturingResourceKind)
        : undefined;
    if (query.kind && !kind)
      throw new BadRequestException("Invalid resource kind.");
    return this.prisma.manufacturingResource.findMany({
      where: {
        workspaceId: scope.id,
        ...(kind ? { kind } : {}),
        ...(query.active === "true"
          ? { isActive: true }
          : query.active === "false"
            ? { isActive: false }
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
      include: {
        parentResource: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
  }

  async createResource(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingResourceDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.validateResourceReferences(this.prisma, scope.id, dto);
    if (
      dto.kind === "EQUIPMENT" &&
      !cleanText(dto.readinessEvidenceReference)
    ) {
      throw new BadRequestException(
        "Equipment requires an initial readiness evidence reference.",
      );
    }
    try {
      return await this.prisma.manufacturingResource.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          kind: dto.kind,
          code: normalizeCode(dto.code, "Resource code"),
          name: dto.name.trim(),
          parentResourceId: dto.parentResourceId ?? null,
          warehouseId: dto.warehouseId ?? null,
          locationId: dto.locationId ?? null,
          capacityMinutesPerDay: dto.capacityMinutesPerDay ?? 0,
          qualificationState: dto.qualificationState ?? "NOT_REQUIRED",
          qualificationValidUntil: dto.qualificationValidUntil
            ? dateOnly(dto.qualificationValidUntil)
            : null,
          calibrationState: dto.calibrationState ?? "NOT_REQUIRED",
          calibrationDueAt: dto.calibrationDueAt
            ? dateOnly(dto.calibrationDueAt)
            : null,
          maintenanceState: dto.maintenanceState ?? "NOT_REQUIRED",
          maintenanceDueAt: dto.maintenanceDueAt
            ? dateOnly(dto.maintenanceDueAt)
            : null,
          cleaningState: dto.cleaningState ?? "NOT_REQUIRED",
          lastCleanedAt: dto.lastCleanedAt ? asDate(dto.lastCleanedAt) : null,
          readinessEvidenceReference: cleanText(dto.readinessEvidenceReference),
          readinessNote: cleanText(dto.readinessNote),
          isActive: dto.isActive ?? true,
          createdByUserId: currentUser.id,
          updatedByUserId: currentUser.id,
        },
      });
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "A resource with this code or kind/name already exists.",
        );
      throw error;
    }
  }

  async updateResource(
    currentUser: AuthenticatedRequestUser,
    resourceId: string,
    dto: UpdateManufacturingResourceDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const current = await this.prisma.manufacturingResource.findFirst({
      where: { id: resourceId, workspaceId: scope.id },
    });
    if (!current)
      throw new NotFoundException("Manufacturing resource not found.");
    await this.validateResourceReferences(
      this.prisma,
      scope.id,
      dto,
      resourceId,
    );
    try {
      return await this.prisma.manufacturingResource.update({
        where: { id: current.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.parentResourceId !== undefined
            ? { parentResourceId: dto.parentResourceId }
            : {}),
          ...(dto.warehouseId !== undefined
            ? { warehouseId: dto.warehouseId }
            : {}),
          ...(dto.locationId !== undefined
            ? { locationId: dto.locationId }
            : {}),
          ...(dto.capacityMinutesPerDay !== undefined
            ? { capacityMinutesPerDay: dto.capacityMinutesPerDay }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedByUserId: currentUser.id,
        },
      });
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "A resource with this kind/name already exists.",
        );
      throw error;
    }
  }

  async updateResourceReadiness(
    currentUser: AuthenticatedRequestUser,
    resourceId: string,
    dto: UpdateManufacturingResourceReadinessDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const existingReview =
      await this.prisma.manufacturingWorkflowReview.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: scope.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
    if (existingReview) {
      if (
        existingReview.workflowCode !== "RESOURCE_READINESS" ||
        existingReview.entityId !== resourceId
      ) {
        throw new ConflictException(
          "Idempotency key is already used for a different manufacturing action.",
        );
      }
      const replay = await this.prisma.manufacturingResource.findFirst({
        where: { id: resourceId, workspaceId: scope.id },
      });
      if (!replay)
        throw new NotFoundException("Manufacturing resource not found.");
      return { resource: replay, replayed: true };
    }
    const when = asDate(dto.transactionDate, "transactionDate");
    await this.assertManufacturingPeriodOpen(
      this.prisma,
      scope.id,
      when,
      "Resource-readiness update",
    );
    const resource = await this.prisma.$transaction(
      async (tx) => {
        await this.assertManufacturingPeriodOpen(
          tx,
          scope.id,
          when,
          "Resource-readiness update",
        );
        const current = await tx.manufacturingResource.findFirst({
          where: { id: resourceId, workspaceId: scope.id },
        });
        if (!current)
          throw new NotFoundException("Manufacturing resource not found.");
        const updated = await tx.manufacturingResource.update({
          where: { id: current.id },
          data: {
            qualificationState: dto.qualificationState,
            qualificationValidUntil: dto.qualificationValidUntil
              ? dateOnly(dto.qualificationValidUntil)
              : null,
            calibrationState: dto.calibrationState,
            calibrationDueAt: dto.calibrationDueAt
              ? dateOnly(dto.calibrationDueAt)
              : null,
            maintenanceState: dto.maintenanceState,
            maintenanceDueAt: dto.maintenanceDueAt
              ? dateOnly(dto.maintenanceDueAt)
              : null,
            cleaningState: dto.cleaningState,
            lastCleanedAt: dto.lastCleanedAt ? asDate(dto.lastCleanedAt) : null,
            readinessEvidenceReference: dto.evidenceReference.trim(),
            readinessNote: cleanText(dto.note),
            updatedByUserId: currentUser.id,
          },
        });
        await this.createAudit(tx, scope, currentUser, {
          workflowGroup: "MASTERS_RESOURCES",
          workflowCode: "RESOURCE_READINESS",
          entityType: "MANUFACTURING_RESOURCE",
          entityId: current.id,
          transactionDate: when,
          idempotencyKey: dto.idempotencyKey,
          title: `Update readiness for ${current.code}`,
          note: dto.note,
          evidence: {
            evidenceReference: dto.evidenceReference,
            qualificationState: dto.qualificationState,
            qualificationValidUntil: dto.qualificationValidUntil ?? null,
            calibrationState: dto.calibrationState,
            calibrationDueAt: dto.calibrationDueAt ?? null,
            maintenanceState: dto.maintenanceState,
            maintenanceDueAt: dto.maintenanceDueAt ?? null,
            cleaningState: dto.cleaningState,
            lastCleanedAt: dto.lastCleanedAt ?? null,
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { resource, replayed: false };
  }

  async listShifts(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    return this.prisma.manufacturingShift.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.active === "true"
          ? { isActive: true }
          : query.active === "false"
            ? { isActive: false }
            : {}),
      },
      orderBy: [{ startMinute: "asc" }, { code: "asc" }],
    });
  }

  async createShift(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingShiftDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const gross =
      dto.endMinute > dto.startMinute
        ? dto.endMinute - dto.startMinute
        : 1440 - dto.startMinute + dto.endMinute;
    if ((dto.breakMinutes ?? 0) >= gross)
      throw new BadRequestException(
        "Shift break must be shorter than the shift.",
      );
    try {
      return await this.prisma.manufacturingShift.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          code: normalizeCode(dto.code, "Shift code"),
          name: dto.name.trim(),
          startMinute: dto.startMinute,
          endMinute: dto.endMinute,
          breakMinutes: dto.breakMinutes ?? 0,
          isActive: dto.isActive ?? true,
          createdByUserId: currentUser.id,
          updatedByUserId: currentUser.id,
        },
      });
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "A shift with this code or name already exists.",
        );
      throw error;
    }
  }

  async listCalendarSlots(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const from = query.from ? dateOnly(query.from, "from") : undefined;
    const to = query.to ? dateOnly(query.to, "to") : undefined;
    if (from && to && to < from)
      throw new BadRequestException(
        "Calendar to date cannot be before from date.",
      );
    return this.prisma.manufacturingCalendarSlot.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.shiftId ? { shiftId: query.shiftId } : {}),
        ...(from || to
          ? {
              workDate: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        resource: { select: { id: true, code: true, name: true, kind: true } },
        shift: { select: { id: true, code: true, name: true } },
      },
      orderBy: [
        { workDate: "asc" },
        { resource: { code: "asc" } },
        { shift: { startMinute: "asc" } },
      ],
    });
  }

  async upsertCalendarSlot(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingCalendarSlotDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const [resource, shift] = await Promise.all([
      this.prisma.manufacturingResource.findFirst({
        where: { id: dto.resourceId, workspaceId: scope.id, isActive: true },
      }),
      this.prisma.manufacturingShift.findFirst({
        where: { id: dto.shiftId, workspaceId: scope.id, isActive: true },
      }),
    ]);
    if (!resource)
      throw new BadRequestException(
        "Calendar resource must be active in this workspace.",
      );
    if (!shift)
      throw new BadRequestException(
        "Calendar shift must be active in this workspace.",
      );
    const gross =
      shift.endMinute > shift.startMinute
        ? shift.endMinute - shift.startMinute
        : 1440 - shift.startMinute + shift.endMinute;
    const netShiftMinutes = gross - shift.breakMinutes;
    if (dto.availableMinutes > netShiftMinutes) {
      throw new BadRequestException(
        `Available minutes cannot exceed the shift's ${netShiftMinutes} net minutes.`,
      );
    }
    const status = dto.status ?? "AVAILABLE";
    if (status !== "AVAILABLE" && dto.availableMinutes !== 0) {
      throw new BadRequestException(
        "Non-working or blocked calendar slots must have zero available minutes.",
      );
    }
    return this.prisma.manufacturingCalendarSlot.upsert({
      where: {
        resourceId_shiftId_workDate: {
          resourceId: resource.id,
          shiftId: shift.id,
          workDate: dateOnly(dto.workDate, "workDate"),
        },
      },
      create: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        resourceId: resource.id,
        shiftId: shift.id,
        workDate: dateOnly(dto.workDate, "workDate"),
        availableMinutes: dto.availableMinutes,
        status,
        note: cleanText(dto.note),
        createdByUserId: currentUser.id,
      },
      update: {
        availableMinutes: dto.availableMinutes,
        status,
        note: cleanText(dto.note),
      },
      include: {
        resource: { select: { id: true, code: true, name: true } },
        shift: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async assignOperationResource(
    currentUser: AuthenticatedRequestUser,
    operationId: string,
    dto: AssignOperationResourceDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const [operation, resource] = await Promise.all([
      this.prisma.manufacturingRoutingOperation.findFirst({
        where: {
          id: operationId,
          routingVersion: { routing: { workspaceId: scope.id } },
        },
        include: { routingVersion: { select: { status: true } } },
      }),
      this.prisma.manufacturingResource.findFirst({
        where: { id: dto.resourceId, workspaceId: scope.id, isActive: true },
      }),
    ]);
    if (!operation) throw new NotFoundException("Routing operation not found.");
    if (operation.routingVersion.status !== "DRAFT") {
      throw new BadRequestException(
        "Approved routing versions are immutable; create a new routing version first.",
      );
    }
    if (!resource)
      throw new BadRequestException(
        "Assigned resource must be active in this workspace.",
      );
    return this.prisma.manufacturingOperationResourceRequirement.upsert({
      where: {
        routingOperationId_resourceId: {
          routingOperationId: operation.id,
          resourceId: resource.id,
        },
      },
      create: {
        routingOperationId: operation.id,
        resourceId: resource.id,
        requiredUnits: dto.requiredUnits ?? 1,
        capacityMultiplier: dto.capacityMultiplier ?? 1,
        isMandatory: dto.isMandatory ?? true,
        note: cleanText(dto.note),
        createdByUserId: currentUser.id,
      },
      update: {
        requiredUnits: dto.requiredUnits ?? 1,
        capacityMultiplier: dto.capacityMultiplier ?? 1,
        isMandatory: dto.isMandatory ?? true,
        note: cleanText(dto.note),
      },
      include: { resource: true },
    });
  }

  private async activeProfile(
    db: Db,
    workspaceId: string,
    inventoryItemId: string,
    label: string,
    allowedRoles?: string[],
  ) {
    const profile = await db.manufacturingItemProfile.findFirst({
      where: {
        workspaceId,
        inventoryItemId,
        isActive: true,
        inventoryItem: { status: "ACTIVE", kind: "PRODUCT" },
      },
      include: {
        inventoryItem: {
          select: { id: true, itemCode: true, itemName: true, unit: true },
        },
      },
    });
    if (!profile)
      throw new BadRequestException(
        `${label} must have an active manufacturing item profile.`,
      );
    if (allowedRoles && !allowedRoles.includes(profile.role)) {
      throw new BadRequestException(
        `${label} must have one of these manufacturing roles: ${allowedRoles.join(", ")}.`,
      );
    }
    return profile;
  }

  private async validateControlLines(
    db: Db,
    workspaceId: string,
    lines: ControlRecordLineDto[],
    allowedRoles: string[],
    label: string,
  ) {
    uniqueSequences(lines, label);
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.inventoryItemId))
        throw new BadRequestException(`${label} cannot repeat the same item.`);
      seen.add(line.inventoryItemId);
      const profile = await this.activeProfile(
        db,
        workspaceId,
        line.inventoryItemId,
        `${label} item`,
        allowedRoles,
      );
      if (
        profile.inventoryItem.unit.trim().toLowerCase() !==
        line.unit.trim().toLowerCase()
      ) {
        throw new BadRequestException(
          `${label} item ${profile.inventoryItem.itemCode} unit must be ${profile.inventoryItem.unit}.`,
        );
      }
    }
  }

  private async createControlRecord(
    currentUser: AuthenticatedRequestUser,
    scope: Scope,
    input: {
      kind: ManufacturingControlRecordKind;
      code: string;
      name: string;
      sourceRecordId?: string | null;
      planId?: string | null;
      inventoryItemId?: string | null;
      effectiveFrom?: Date | null;
      effectiveTo?: Date | null;
      payload: Prisma.InputJsonValue;
      lines?: Array<{
        inventoryItemId: string;
        sequence: number;
        quantity: number;
        unit: string;
        requiredDate?: Date | null;
        plannedStartDate?: Date | null;
        plannedEndDate?: Date | null;
        metadata?: Prisma.InputJsonValue;
      }>;
    },
  ) {
    const code = normalizeCode(input.code, `${input.kind} code`);
    if (
      input.effectiveFrom &&
      input.effectiveTo &&
      input.effectiveTo < input.effectiveFrom
    ) {
      throw new BadRequestException(
        "Effective-to date cannot be before effective-from date.",
      );
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const latest = await tx.manufacturingControlRecord.findFirst({
            where: { workspaceId: scope.id, kind: input.kind, code },
            orderBy: { versionNumber: "desc" },
          });
          if (latest?.status === "DRAFT") {
            throw new ConflictException(
              `A draft ${input.kind.toLowerCase().replaceAll("_", " ")} version already exists.`,
            );
          }
          const row = await tx.manufacturingControlRecord.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              kind: input.kind,
              code,
              name: input.name.trim(),
              versionNumber: (latest?.versionNumber ?? 0) + 1,
              sourceRecordId: input.sourceRecordId ?? latest?.id ?? null,
              planId: input.planId ?? null,
              inventoryItemId: input.inventoryItemId ?? null,
              effectiveFrom: input.effectiveFrom ?? null,
              effectiveTo: input.effectiveTo ?? null,
              payload: input.payload,
              createdByUserId: currentUser.id,
              ...(input.lines?.length
                ? {
                    lines: {
                      create: input.lines.map((line) => ({
                        inventoryItemId: line.inventoryItemId,
                        sequence: line.sequence,
                        quantity: line.quantity,
                        unit: line.unit.trim(),
                        requiredDate: line.requiredDate ?? null,
                        plannedStartDate: line.plannedStartDate ?? null,
                        plannedEndDate: line.plannedEndDate ?? null,
                        ...(line.metadata !== undefined
                          ? { metadata: line.metadata }
                          : {}),
                      })),
                    },
                  }
                : {}),
            },
            include: {
              lines: {
                orderBy: { sequence: "asc" },
                include: {
                  inventoryItem: { select: { itemCode: true, itemName: true } },
                },
              },
            },
          });
          return row;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "This controlled-record version already exists.",
        );
      throw error;
    }
  }

  async listControlRecords(
    currentUser: AuthenticatedRequestUser,
    query: Query,
  ) {
    const scope = await this.scope(currentUser, query.workspaceId);
    const kind =
      query.kind &&
      Object.values(ManufacturingControlRecordKind).includes(
        query.kind as ManufacturingControlRecordKind,
      )
        ? (query.kind as ManufacturingControlRecordKind)
        : undefined;
    if (query.kind && !kind)
      throw new BadRequestException("Invalid controlled-record kind.");
    const allowedStatuses = ["DRAFT", "APPROVED", "RETIRED", "CANCELLED"];
    if (query.status && !allowedStatuses.includes(query.status))
      throw new BadRequestException("Invalid controlled-record status.");
    return this.prisma.manufacturingControlRecord.findMany({
      where: {
        workspaceId: scope.id,
        ...(kind ? { kind } : {}),
        ...(query.status
          ? {
              status: query.status as
                "DRAFT" | "APPROVED" | "RETIRED" | "CANCELLED",
            }
          : {}),
        ...(query.code ? { code: normalizeCode(query.code, "code") } : {}),
        ...(query.sourceRecordId
          ? { sourceRecordId: query.sourceRecordId }
          : {}),
        ...(query.inventoryItemId
          ? { inventoryItemId: query.inventoryItemId }
          : {}),
        ...(query.planId ? { planId: query.planId } : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" } },
                { name: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        lines: {
          orderBy: { sequence: "asc" },
          include: {
            inventoryItem: { select: { itemCode: true, itemName: true } },
          },
        },
      },
      orderBy: [{ kind: "asc" }, { code: "asc" }, { versionNumber: "desc" }],
    });
  }

  async createDemandPlan(
    currentUser: AuthenticatedRequestUser,
    dto: CreateDemandPlanDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.plan.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const from = dateOnly(dto.demandFrom, "demandFrom");
    const to = dateOnly(dto.demandTo, "demandTo");
    if (to < from)
      throw new BadRequestException(
        "Demand-to date cannot be before demand-from date.",
      );
    await this.validateControlLines(
      this.prisma,
      scope.id,
      dto.lines,
      ["FINISHED_GOOD"],
      "Demand plan",
    );
    for (const line of dto.lines) {
      const required = line.requiredDate
        ? dateOnly(line.requiredDate, "requiredDate")
        : null;
      if (!required || required < from || required > to) {
        throw new BadRequestException(
          "Every demand line requires a date inside the demand-plan window.",
        );
      }
    }
    return this.createControlRecord(currentUser, scope, {
      kind: "DEMAND_PLAN",
      code: dto.code,
      name: dto.name,
      effectiveFrom: from,
      effectiveTo: to,
      payload: {
        demandFrom: dto.demandFrom,
        demandTo: dto.demandTo,
        customerReference: cleanText(dto.customerReference),
        forecastReference: cleanText(dto.forecastReference),
      },
      lines: dto.lines.map((line) => ({
        ...line,
        requiredDate: dateOnly(line.requiredDate!, "requiredDate"),
      })),
    });
  }

  async createMasterProductionSchedule(
    currentUser: AuthenticatedRequestUser,
    dto: CreateMasterProductionScheduleDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.plan.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    uniqueSequences(dto.lines, "Master production schedule");
    const demand = await this.prisma.manufacturingControlRecord.findFirst({
      where: {
        id: dto.demandPlanId,
        workspaceId: scope.id,
        kind: "DEMAND_PLAN",
        status: "APPROVED",
      },
      include: { lines: true },
    });
    if (!demand)
      throw new BadRequestException(
        "Master production schedule requires an approved demand plan.",
      );
    await this.validateControlLines(
      this.prisma,
      scope.id,
      dto.lines,
      ["FINISHED_GOOD"],
      "Master production schedule",
    );
    const demandByItem = new Map(
      demand.lines.map((line) => [line.inventoryItemId, line]),
    );
    for (const line of dto.lines) {
      const source = demandByItem.get(line.inventoryItemId);
      if (!source)
        throw new BadRequestException(
          "Schedule item is not present in the approved demand plan.",
        );
      if (new Prisma.Decimal(line.quantity).greaterThan(source.quantity)) {
        throw new BadRequestException(
          "Scheduled quantity cannot exceed the approved demand quantity.",
        );
      }
      const start = dateOnly(line.plannedStartDate, "plannedStartDate");
      const end = dateOnly(line.plannedEndDate, "plannedEndDate");
      if (end < start)
        throw new BadRequestException(
          "Schedule line end date cannot be before its start date.",
        );
      if (
        (demand.effectiveFrom && start < demand.effectiveFrom) ||
        (demand.effectiveTo && end > demand.effectiveTo)
      ) {
        throw new BadRequestException(
          "Schedule dates must remain inside the approved demand-plan window.",
        );
      }
    }
    const starts = dto.lines.map((line) => dateOnly(line.plannedStartDate));
    const ends = dto.lines.map((line) => dateOnly(line.plannedEndDate));
    return this.createControlRecord(currentUser, scope, {
      kind: "MASTER_PRODUCTION_SCHEDULE",
      code: dto.code,
      name: dto.name,
      sourceRecordId: demand.id,
      effectiveFrom: new Date(
        Math.min(...starts.map((value) => value.getTime())),
      ),
      effectiveTo: new Date(Math.max(...ends.map((value) => value.getTime()))),
      payload: {
        demandPlanId: demand.id,
        demandPlanCode: demand.code,
        demandPlanVersion: demand.versionNumber,
      },
      lines: dto.lines.map((line) => ({
        ...line,
        requiredDate: line.requiredDate ? dateOnly(line.requiredDate) : null,
        plannedStartDate: dateOnly(line.plannedStartDate),
        plannedEndDate: dateOnly(line.plannedEndDate),
      })),
    });
  }

  async createCampaign(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingCampaignDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.plan.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const schedule = await this.prisma.manufacturingControlRecord.findFirst({
      where: {
        id: dto.masterProductionScheduleId,
        workspaceId: scope.id,
        kind: "MASTER_PRODUCTION_SCHEDULE",
        status: "APPROVED",
      },
      include: { lines: true },
    });
    if (!schedule)
      throw new BadRequestException(
        "Campaign requires an approved master production schedule.",
      );
    await this.activeProfile(
      this.prisma,
      scope.id,
      dto.finishedProductId,
      "Campaign finished product",
      ["FINISHED_GOOD"],
    );
    const scheduledLine = schedule.lines.find(
      (line) => line.inventoryItemId === dto.finishedProductId,
    );
    if (
      !scheduledLine ||
      new Prisma.Decimal(dto.plannedQuantity).greaterThan(
        scheduledLine.quantity,
      )
    ) {
      throw new BadRequestException(
        "Campaign product and quantity must be covered by the approved schedule.",
      );
    }
    if (
      scheduledLine.unit.trim().toLowerCase() !== dto.unit.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        `Campaign unit must match the approved schedule unit (${scheduledLine.unit}).`,
      );
    }
    const start = dateOnly(dto.plannedStartDate, "plannedStartDate");
    const end = dateOnly(dto.plannedEndDate, "plannedEndDate");
    if (end < start)
      throw new BadRequestException(
        "Campaign end date cannot be before start date.",
      );
    if (
      (scheduledLine.plannedStartDate &&
        start < scheduledLine.plannedStartDate) ||
      (scheduledLine.plannedEndDate && end > scheduledLine.plannedEndDate)
    ) {
      throw new BadRequestException(
        "Campaign dates must remain inside the approved schedule line.",
      );
    }
    if (dto.manufacturingPlanId) {
      const plan = await this.prisma.manufacturingPlan.findFirst({
        where: {
          id: dto.manufacturingPlanId,
          workspaceId: scope.id,
          finishedProductId: dto.finishedProductId,
          status: { in: ["APPROVED", "RELEASED", "IN_PROGRESS"] },
        },
      });
      if (!plan)
        throw new BadRequestException(
          "Campaign plan must be an approved active plan for the same product.",
        );
      if (
        !plan.plannedQuantity.equals(dto.plannedQuantity) ||
        plan.plannedStartDate > start ||
        plan.plannedEndDate < end
      ) {
        throw new BadRequestException(
          "Campaign quantity/dates must reconcile to the linked production plan.",
        );
      }
    }
    return this.createControlRecord(currentUser, scope, {
      kind: "CAMPAIGN",
      code: dto.code,
      name: dto.name,
      sourceRecordId: schedule.id,
      planId: dto.manufacturingPlanId ?? null,
      inventoryItemId: dto.finishedProductId,
      effectiveFrom: start,
      effectiveTo: end,
      payload: {
        masterProductionScheduleId: schedule.id,
        plannedQuantity: dto.plannedQuantity,
        unit: dto.unit.trim(),
        campaignStrategy: cleanText(dto.campaignStrategy),
      },
      lines: [
        {
          inventoryItemId: dto.finishedProductId,
          sequence: 1,
          quantity: dto.plannedQuantity,
          unit: dto.unit,
          plannedStartDate: start,
          plannedEndDate: end,
        },
      ],
    });
  }

  async createTestMethod(
    currentUser: AuthenticatedRequestUser,
    dto: CreateTestMethodDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.quality.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    return this.createControlRecord(currentUser, scope, {
      kind: "TEST_METHOD",
      code: dto.code,
      name: dto.name,
      effectiveFrom: dto.effectiveFrom
        ? dateOnly(dto.effectiveFrom, "effectiveFrom")
        : null,
      payload: {
        procedureReference: dto.procedureReference.trim(),
        instrumentRequirement: cleanText(dto.instrumentRequirement),
        samplingInstruction: cleanText(dto.samplingInstruction),
      },
    });
  }

  async createQualitySpecification(
    currentUser: AuthenticatedRequestUser,
    dto: CreateQualitySpecificationDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.quality.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.activeProfile(
      this.prisma,
      scope.id,
      dto.inventoryItemId,
      "Quality-specification item",
    );
    uniqueSequences(dto.parameters, "Quality specification");
    const methodIds = [
      ...new Set(
        dto.parameters.map((parameter) => parameter.testMethodRecordId),
      ),
    ];
    const methods = await this.prisma.manufacturingControlRecord.findMany({
      where: {
        id: { in: methodIds },
        workspaceId: scope.id,
        kind: "TEST_METHOD",
        status: "APPROVED",
      },
      select: { id: true, code: true, versionNumber: true },
    });
    if (methods.length !== methodIds.length) {
      throw new BadRequestException(
        "Every quality parameter requires an approved test method.",
      );
    }
    for (const parameter of dto.parameters) {
      if (parameter.resultType === "NUMERIC") {
        if (parameter.lowerLimit == null && parameter.upperLimit == null) {
          throw new BadRequestException(
            `Numeric parameter ${parameter.name} requires a lower or upper limit.`,
          );
        }
        if (
          parameter.lowerLimit != null &&
          parameter.upperLimit != null &&
          parameter.lowerLimit > parameter.upperLimit
        ) {
          throw new BadRequestException(
            `Numeric parameter ${parameter.name} has an invalid limit range.`,
          );
        }
      }
      if (
        parameter.resultType === "TEXT" &&
        !cleanText(parameter.expectedText)
      ) {
        throw new BadRequestException(
          `Text parameter ${parameter.name} requires expectedText.`,
        );
      }
      if (
        parameter.resultType === "BOOLEAN" &&
        parameter.expectedBoolean == null
      ) {
        throw new BadRequestException(
          `Boolean parameter ${parameter.name} requires expectedBoolean.`,
        );
      }
    }
    return this.createControlRecord(currentUser, scope, {
      kind: "QUALITY_SPECIFICATION",
      code: dto.code,
      name: dto.name,
      inventoryItemId: dto.inventoryItemId,
      effectiveFrom: dto.effectiveFrom
        ? dateOnly(dto.effectiveFrom, "effectiveFrom")
        : null,
      payload: {
        inventoryItemId: dto.inventoryItemId,
        parameters: dto.parameters.map((parameter) => ({
          sequence: parameter.sequence,
          name: parameter.name.trim(),
          testMethodRecordId: parameter.testMethodRecordId,
          resultType: parameter.resultType,
          unit: cleanText(parameter.unit),
          lowerLimit: parameter.lowerLimit ?? null,
          upperLimit: parameter.upperLimit ?? null,
          expectedText: cleanText(parameter.expectedText),
          expectedBoolean: parameter.expectedBoolean ?? null,
          critical: parameter.critical ?? false,
        })),
      },
    });
  }

  async createArtworkSpecification(
    currentUser: AuthenticatedRequestUser,
    dto: CreateArtworkSpecificationDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.activeProfile(
      this.prisma,
      scope.id,
      dto.finishedProductId,
      "Artwork finished product",
      ["FINISHED_GOOD"],
    );
    return this.createControlRecord(currentUser, scope, {
      kind: "ARTWORK_SPECIFICATION",
      code: dto.code,
      name: dto.name,
      inventoryItemId: dto.finishedProductId,
      payload: {
        finishedProductId: dto.finishedProductId,
        assetReference: dto.assetReference.trim(),
        approvalReference: dto.approvalReference.trim(),
        market: cleanText(dto.market),
        language: cleanText(dto.language),
        labelCopyReference: cleanText(dto.labelCopyReference),
      },
    });
  }

  async createPackagingConfiguration(
    currentUser: AuthenticatedRequestUser,
    dto: CreatePackagingConfigurationDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.master.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.activeProfile(
      this.prisma,
      scope.id,
      dto.finishedProductId,
      "Packaging finished product",
      ["FINISHED_GOOD"],
    );
    uniqueSequences(dto.components, "Packaging configuration");
    const seen = new Set<string>();
    for (const component of dto.components) {
      if (seen.has(component.inventoryItemId)) {
        throw new BadRequestException(
          "Packaging configuration cannot repeat the same component item.",
        );
      }
      seen.add(component.inventoryItemId);
      const profile = await this.activeProfile(
        this.prisma,
        scope.id,
        component.inventoryItemId,
        "Packaging component",
        ["PACKAGING_MATERIAL"],
      );
      if (
        profile.inventoryItem.unit.trim().toLowerCase() !==
        component.unit.trim().toLowerCase()
      ) {
        throw new BadRequestException(
          `Packaging component ${profile.inventoryItem.itemCode} unit must be ${profile.inventoryItem.unit}.`,
        );
      }
    }
    let artwork: {
      id: string;
      inventoryItemId: string | null;
      code: string;
      versionNumber: number;
    } | null = null;
    if (dto.artworkSpecificationId) {
      artwork = await this.prisma.manufacturingControlRecord.findFirst({
        where: {
          id: dto.artworkSpecificationId,
          workspaceId: scope.id,
          kind: "ARTWORK_SPECIFICATION",
          status: "APPROVED",
        },
        select: {
          id: true,
          inventoryItemId: true,
          code: true,
          versionNumber: true,
        },
      });
      if (!artwork || artwork.inventoryItemId !== dto.finishedProductId) {
        throw new BadRequestException(
          "Artwork must be approved for the selected finished product.",
        );
      }
    }
    return this.createControlRecord(currentUser, scope, {
      kind: "PACKAGING_CONFIGURATION",
      code: dto.code,
      name: dto.name,
      sourceRecordId: artwork?.id ?? null,
      inventoryItemId: dto.finishedProductId,
      payload: {
        finishedProductId: dto.finishedProductId,
        artworkSpecificationId: artwork?.id ?? null,
        artworkCode: artwork?.code ?? null,
        artworkVersion: artwork?.versionNumber ?? null,
        packSize: dto.packSize,
        packUnit: dto.packUnit.trim(),
      },
      lines: dto.components.map((component) => ({
        inventoryItemId: component.inventoryItemId,
        sequence: component.sequence,
        quantity: component.quantityPerFinishedUnit,
        unit: component.unit,
        metadata: {
          componentType: component.componentType,
          basis: "PER_FINISHED_UNIT",
        },
      })),
    });
  }

  async createReasonCode(
    currentUser: AuthenticatedRequestUser,
    dto: CreateManufacturingReasonCodeDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.configure");
    const scope = await this.scope(currentUser, dto.workspaceId);
    return this.createControlRecord(currentUser, scope, {
      kind: "REASON_CODE",
      code: dto.code,
      name: dto.name,
      payload: {
        processes: [...new Set(dto.processes)],
        evidenceRequired: dto.evidenceRequired ?? true,
        approvalRequired: dto.approvalRequired ?? false,
        description: cleanText(dto.description),
      },
    });
  }

  private async validateApprovalDependencies(
    db: Db,
    workspaceId: string,
    record: {
      id: string;
      kind: ManufacturingControlRecordKind;
      sourceRecordId: string | null;
      inventoryItemId: string | null;
      payload: Prisma.JsonValue;
    },
  ) {
    if (["MASTER_PRODUCTION_SCHEDULE", "CAMPAIGN"].includes(record.kind)) {
      const expectedKind =
        record.kind === "MASTER_PRODUCTION_SCHEDULE"
          ? "DEMAND_PLAN"
          : "MASTER_PRODUCTION_SCHEDULE";
      const source = record.sourceRecordId
        ? await db.manufacturingControlRecord.findFirst({
            where: {
              id: record.sourceRecordId,
              workspaceId,
              kind: expectedKind,
              status: "APPROVED",
            },
          })
        : null;
      if (!source)
        throw new BadRequestException(
          `${record.kind} source record is no longer approved.`,
        );
    }
    if (record.kind === "QUALITY_SPECIFICATION") {
      const payload = record.payload as {
        parameters?: Array<{ testMethodRecordId?: string }>;
      };
      const ids = [
        ...new Set(
          (payload.parameters ?? [])
            .map((row) => row.testMethodRecordId)
            .filter(Boolean),
        ),
      ] as string[];
      const approved = await db.manufacturingControlRecord.count({
        where: {
          id: { in: ids },
          workspaceId,
          kind: "TEST_METHOD",
          status: "APPROVED",
        },
      });
      if (!ids.length || approved !== ids.length) {
        throw new BadRequestException(
          "Quality specification references a test method that is no longer approved.",
        );
      }
    }
    if (record.kind === "PACKAGING_CONFIGURATION" && record.sourceRecordId) {
      const artwork = await db.manufacturingControlRecord.findFirst({
        where: {
          id: record.sourceRecordId,
          workspaceId,
          kind: "ARTWORK_SPECIFICATION",
          status: "APPROVED",
          inventoryItemId: record.inventoryItemId,
        },
      });
      if (!artwork)
        throw new BadRequestException(
          "Packaging artwork is no longer approved for this product.",
        );
    }
  }

  async approveControlRecord(
    currentUser: AuthenticatedRequestUser,
    recordId: string,
    dto: ApproveManufacturingControlRecordDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    const recordKind = await this.prisma.manufacturingControlRecord.findFirst({
      where: { id: recordId, workspaceId: scope.id },
      select: { kind: true },
    });
    if (!recordKind)
      throw new NotFoundException("Controlled record not found.");
    const approvalPermission = [
      "DEMAND_PLAN",
      "MASTER_PRODUCTION_SCHEDULE",
      "CAMPAIGN",
    ].includes(recordKind.kind)
      ? "manufacturing.plan.manage"
      : ["TEST_METHOD", "QUALITY_SPECIFICATION"].includes(recordKind.kind)
        ? "manufacturing.quality.manage"
        : "manufacturing.master.manage";
    await this.requirePermission(currentUser, approvalPermission);
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
        replay.workflowCode !== "CONTROL_RECORD_APPROVE" ||
        replay.entityId !== recordId
      ) {
        throw new ConflictException(
          "Idempotency key is already used for a different manufacturing action.",
        );
      }
      const record = await this.prisma.manufacturingControlRecord.findFirst({
        where: { id: recordId, workspaceId: scope.id },
        include: { lines: true },
      });
      if (!record) throw new NotFoundException("Controlled record not found.");
      return { record, replayed: true };
    }
    const when = asDate(dto.transactionDate, "transactionDate");
    await this.assertManufacturingPeriodOpen(
      this.prisma,
      scope.id,
      when,
      "Controlled-record approval",
    );
    const record = await this.prisma.$transaction(
      async (tx) => {
        await this.assertManufacturingPeriodOpen(
          tx,
          scope.id,
          when,
          "Controlled-record approval",
        );
        const current = await tx.manufacturingControlRecord.findFirst({
          where: { id: recordId, workspaceId: scope.id },
          include: { lines: true },
        });
        if (!current)
          throw new NotFoundException("Controlled record not found.");
        if (current.status !== "DRAFT")
          throw new BadRequestException(
            "Only a draft controlled record can be approved.",
          );
        const settings = await tx.manufacturingSettings.findUnique({
          where: { workspaceId: scope.id },
          select: { approvalRequired: true, electronicSignatureRequired: true },
        });
        if (
          settings?.approvalRequired &&
          current.createdByUserId === currentUser.id
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
        const electronicSignatureEvidence =
          await this.electronicSignature.enforce(tx, {
            scope,
            user: currentUser,
            actionLabel: `approve controlled record ${current.code}`,
            signatureMeaning: dto.signatureMeaning,
            reauthenticationPassword: dto.reauthenticationPassword,
            required: Boolean(settings?.electronicSignatureRequired),
          });
        await this.validateApprovalDependencies(tx, scope.id, current);
        const approved = await tx.manufacturingControlRecord.update({
          where: { id: current.id },
          data: {
            status: "APPROVED",
            approvedByUserId: currentUser.id,
            approvedAt: when,
          },
          include: { lines: true },
        });
        await this.createAudit(tx, scope, currentUser, {
          workflowGroup: "CONTROLLED_RECORDS",
          workflowCode: "CONTROL_RECORD_APPROVE",
          entityType: `MANUFACTURING_${current.kind}`,
          entityId: current.id,
          transactionDate: when,
          idempotencyKey: dto.idempotencyKey,
          title: `Approve ${current.kind.toLowerCase().replaceAll("_", " ")} ${current.code} v${current.versionNumber}`,
          note: dto.note,
          evidence: {
            kind: current.kind,
            code: current.code,
            versionNumber: current.versionNumber,
            signatureMeaning: dto.signatureMeaning.trim(),
            electronicSignaturePolicy: electronicSignatureEvidence,
            lineCount: current.lines.length,
            sourceRecordId: current.sourceRecordId,
          },
          signatureMeaning: dto.signatureMeaning,
          planId: current.planId,
        });
        return approved;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { record, replayed: false };
  }

  async listDocumentSequences(
    currentUser: AuthenticatedRequestUser,
    query: Query,
  ) {
    const scope = await this.scope(currentUser, query.workspaceId);
    return this.prisma.manufacturingDocumentSequence.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.active === "true"
          ? { isActive: true }
          : query.active === "false"
            ? { isActive: false }
            : {}),
      },
      orderBy: { documentKind: "asc" },
    });
  }

  async configureDocumentSequence(
    currentUser: AuthenticatedRequestUser,
    dto: ConfigureManufacturingDocumentSequenceDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.configure");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const prefix = normalizeCode(dto.prefix, "Document prefix");
    if (
      dto.resetPeriod !== undefined &&
      dto.resetAnnually !== undefined &&
      (dto.resetPeriod === "ANNUAL") !== dto.resetAnnually
    ) {
      throw new BadRequestException(
        "resetPeriod and resetAnnually describe conflicting reset policies.",
      );
    }
    try {
      return await this.serializable(async (tx) => {
        const candidate = await tx.manufacturingDocumentSequence.findUnique({
          where: {
            workspaceId_documentKind: {
              workspaceId: scope.id,
              documentKind: dto.documentKind,
            },
          },
          select: { id: true },
        });
        if (candidate) {
          await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`SELECT "id" FROM "ManufacturingDocumentSequence" WHERE "id" = ${candidate.id} FOR UPDATE`,
          );
        }
        const existing = await tx.manufacturingDocumentSequence.findUnique({
          where: {
            workspaceId_documentKind: {
              workspaceId: scope.id,
              documentKind: dto.documentKind,
            },
          },
        });
        const requestedResetPeriod =
          dto.resetPeriod ??
          (dto.resetAnnually === undefined
            ? (existing?.resetPeriod ?? "ANNUAL")
            : dto.resetAnnually
              ? "ANNUAL"
              : "NEVER");
        const requestedPadding = dto.padding ?? existing?.padding ?? 6;

        if (
          existing &&
          dto.nextNumber !== undefined &&
          dto.nextNumber < existing.nextNumber
        ) {
          throw new BadRequestException(
            `Document next number cannot move backwards below the current value (${existing.nextNumber}).`,
          );
        }
        if (existing) {
          const issuedCount = await tx.manufacturingDocumentNumber.count({
            where: { sequenceId: existing.id },
          });
          if (
            issuedCount > 0 &&
            (prefix !== existing.prefix ||
              requestedPadding !== existing.padding ||
              requestedResetPeriod !== existing.resetPeriod)
          ) {
            throw new BadRequestException(
              "Prefix, padding and reset policy cannot be changed after numbers have been issued. Deactivate this sequence and use a new document kind/series instead.",
            );
          }
        }

        return tx.manufacturingDocumentSequence.upsert({
          where: {
            workspaceId_documentKind: {
              workspaceId: scope.id,
              documentKind: dto.documentKind,
            },
          },
          create: {
            tenantId: scope.tenantId,
            companyId: scope.companyId,
            workspaceId: scope.id,
            documentKind: dto.documentKind,
            prefix,
            nextNumber: dto.nextNumber ?? 1,
            padding: requestedPadding,
            resetAnnually: requestedResetPeriod === "ANNUAL",
            resetPeriod: requestedResetPeriod,
            isActive: dto.isActive ?? true,
            createdByUserId: currentUser.id,
            updatedByUserId: currentUser.id,
          },
          update: {
            prefix,
            ...(dto.nextNumber !== undefined
              ? { nextNumber: dto.nextNumber }
              : {}),
            padding: requestedPadding,
            resetAnnually: requestedResetPeriod === "ANNUAL",
            resetPeriod: requestedResetPeriod,
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            updatedByUserId: currentUser.id,
          },
        });
      });
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          "This document prefix is already used in the workspace.",
        );
      throw error;
    }
  }

  private async issueDocumentNumberTx(
    tx: Prisma.TransactionClient,
    scope: Scope,
    currentUser: AuthenticatedRequestUser,
    input: {
      documentKind: ManufacturingDocumentKind;
      issuedAt: Date;
      idempotencyKey: string;
      entityType?: string | null;
      entityId?: string | null;
    },
  ) {
    const replay = await tx.manufacturingDocumentNumber.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    const row = await issueManufacturingDocumentNumberTx(
      tx,
      scope,
      currentUser.id,
      {
        ...input,
        validateIssuedAtOnReplay: true,
      },
    );
    return { row, replayed: Boolean(replay) };
  }

  async issueDocumentNumber(
    currentUser: AuthenticatedRequestUser,
    dto: IssueManufacturingDocumentNumberDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.configure");
    const scope = await this.scope(currentUser, dto.workspaceId);
    if (
      Boolean(cleanText(dto.entityType)) !== Boolean(cleanText(dto.entityId))
    ) {
      throw new BadRequestException(
        "entityType and entityId must either both be supplied or both be omitted.",
      );
    }
    const issuedAt = asDate(dto.issuedAt, "issuedAt");
    await this.assertManufacturingPeriodOpen(
      this.prisma,
      scope.id,
      issuedAt,
      "Document-number issue",
    );
    try {
      return await this.serializable(async (tx) => {
        await this.assertManufacturingPeriodOpen(
          tx,
          scope.id,
          issuedAt,
          "Document-number issue",
        );
        return this.issueDocumentNumberTx(tx, scope, currentUser, {
          documentKind: dto.documentKind,
          issuedAt,
          idempotencyKey: dto.idempotencyKey,
          entityType: dto.entityType,
          entityId: dto.entityId,
        });
      });
    } catch (error) {
      if (isUniqueError(error)) {
        const replay = await this.prisma.manufacturingDocumentNumber.findUnique(
          {
            where: {
              workspaceId_idempotencyKey: {
                workspaceId: scope.id,
                idempotencyKey: dto.idempotencyKey,
              },
            },
          },
        );
        if (
          replay &&
          replay.documentKind === dto.documentKind &&
          replay.entityType === cleanText(dto.entityType) &&
          replay.entityId === cleanText(dto.entityId) &&
          replay.issuedAt.getTime() === issuedAt.getTime()
        ) {
          return { row: replay, replayed: true };
        }
      }
      throw error;
    }
  }

  async listCapacityChecks(
    currentUser: AuthenticatedRequestUser,
    query: Query,
  ) {
    const scope = await this.scope(currentUser, query.workspaceId);
    return this.prisma.manufacturingCapacityCheck.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.planId ? { planId: query.planId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async runCapacityCheck(
    currentUser: AuthenticatedRequestUser,
    dto: RunManufacturingCapacityCheckDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.plan.manage");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const asOf = dateOnly(dto.asOfDate, "asOfDate");
    const replay = await this.prisma.manufacturingCapacityCheck.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (replay) {
      if (
        replay.planId !== dto.planId ||
        replay.asOfDate.getTime() !== asOf.getTime()
      ) {
        throw new ConflictException(
          "Idempotency key is used for another capacity check.",
        );
      }
      return { check: replay, replayed: true };
    }
    await this.assertManufacturingPeriodOpen(
      this.prisma,
      scope.id,
      asOf,
      "Capacity/readiness check",
    );
    const plan = await this.prisma.manufacturingPlan.findFirst({
      where: {
        id: dto.planId,
        workspaceId: scope.id,
        status: { in: ["APPROVED", "RELEASED", "IN_PROGRESS"] },
      },
      include: {
        lots: true,
        routingVersion: {
          include: {
            operations: {
              orderBy: { sequence: "asc" },
              include: {
                resourceRequirements: { include: { resource: true } },
              },
            },
          },
        },
      },
    });
    if (!plan)
      throw new BadRequestException(
        "Capacity check requires an approved active manufacturing plan.",
      );
    if (!plan.routingVersion || plan.routingVersion.status !== "APPROVED") {
      throw new BadRequestException(
        "Capacity check requires an approved routing version.",
      );
    }
    const readinessDate = plan.plannedEndDate;
    const planBlockers = plan.lots.length
      ? []
      : [
          {
            operationId: "PLAN",
            operationCode: "LOT_PLAN",
            resourceId: "PLAN",
            resourceCode: plan.planNumber,
            message:
              "No production lot/batch split is configured for the approved plan.",
          },
        ];
    const missingOperations = plan.routingVersion.operations
      .filter((operation) => !operation.resourceRequirements.length)
      .map((operation) => ({
        operationId: operation.id,
        operationCode: operation.code,
        message: "No explicit resource requirement is configured.",
      }));
    const requirements = plan.routingVersion.operations.flatMap((operation) =>
      operation.resourceRequirements.map((requirement) => ({
        operation,
        requirement,
      })),
    );
    const rows = await Promise.all(
      requirements.map(async ({ operation, requirement }) => {
        const calendar = await this.prisma.manufacturingCalendarSlot.aggregate({
          where: {
            workspaceId: scope.id,
            resourceId: requirement.resourceId,
            workDate: { gte: plan.plannedStartDate, lte: plan.plannedEndDate },
            status: "AVAILABLE",
          },
          _sum: { availableMinutes: true },
        });
        return calculateResourceCapacity(
          {
            operationId: operation.id,
            operationCode: operation.code,
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
            setupMinutes: decimalNumber(operation.setupMinutes),
            runMinutesPerUnit: decimalNumber(operation.runMinutesPerUnit),
            queueMinutes: decimalNumber(operation.queueMinutes),
            plannedQuantity: decimalNumber(plan.plannedQuantity),
            lotCount: Math.max(1, plan.lots.length),
            requiredUnits: requirement.requiredUnits,
            capacityMultiplier: decimalNumber(requirement.capacityMultiplier),
            mandatory: requirement.isMandatory,
            availableMinutes: calendar._sum.availableMinutes ?? 0,
          },
          readinessDate,
        );
      }),
    );
    const summary = summarizeCapacity(rows);
    const blockers = [
      ...planBlockers,
      ...missingOperations,
      ...summary.blockers,
    ];
    const status: ManufacturingCapacityCheckStatus = blockers.length
      ? "BLOCKED"
      : "READY";
    const checkId = manufacturingEntityIdFromIdempotency(
      scope.id,
      "ManufacturingCapacityCheck",
      dto.idempotencyKey,
    );
    const check = await this.serializable(async (tx) => {
      await this.assertManufacturingPeriodOpen(
        tx,
        scope.id,
        asOf,
        "Capacity/readiness check",
      );
      const number = await this.issueDocumentNumberTx(tx, scope, currentUser, {
        documentKind: "CAPACITY_CHECK",
        issuedAt: asOf,
        idempotencyKey: `${dto.idempotencyKey}:NUMBER`,
        entityType: "ManufacturingCapacityCheck",
        entityId: checkId,
      });
      const created = await tx.manufacturingCapacityCheck.create({
        data: {
          id: checkId,
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          workspaceId: scope.id,
          planId: plan.id,
          checkNumber: number.row.documentNumber,
          status,
          asOfDate: asOf,
          requiredMinutes: summary.requiredMinutes,
          availableMinutes: summary.availableMinutes,
          result: {
            planNumber: plan.planNumber,
            planWindow: {
              start: plan.plannedStartDate.toISOString().slice(0, 10),
              end: plan.plannedEndDate.toISOString().slice(0, 10),
            },
            readinessEvaluatedThrough: readinessDate.toISOString().slice(0, 10),
            lotCount: Math.max(1, plan.lots.length),
            resources: summary.resources,
            resourceTotals: summary.resourceTotals,
          },
          blockers,
          idempotencyKey: dto.idempotencyKey,
          createdByUserId: currentUser.id,
        },
      });
      await this.createAudit(tx, scope, currentUser, {
        workflowGroup: "PLANNING_MRP",
        workflowCode: "CAPACITY_READINESS_CHECK",
        entityType: "MANUFACTURING_CAPACITY_CHECK",
        entityId: created.id,
        planId: plan.id,
        transactionDate: asOf,
        idempotencyKey: `${dto.idempotencyKey}:AUDIT`,
        title: `Capacity/readiness check ${created.checkNumber}`,
        note: dto.note,
        evidence: {
          status,
          requiredMinutes: summary.requiredMinutes,
          availableMinutes: summary.availableMinutes,
          blockerCount: blockers.length,
          blockers,
        },
        approved: false,
      });
      return created;
    });
    return { check, replayed: false };
  }

  private periodWindow(year: number, month: number) {
    let bounds: { start: Date; end: Date };
    try {
      bounds = manufacturingPeriodBounds(year, month);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : "Invalid manufacturing period.",
      );
    }
    const next = new Date(Date.UTC(year, month, 1));
    return { ...bounds, next };
  }

  async listPeriods(currentUser: AuthenticatedRequestUser, query: Query) {
    const scope = await this.scope(currentUser, query.workspaceId);
    if (
      query.status &&
      !Object.values(ManufacturingPeriodStatus).includes(
        query.status as ManufacturingPeriodStatus,
      )
    ) {
      throw new BadRequestException("Invalid manufacturing period status.");
    }
    const year = query.year === undefined ? undefined : Number(query.year);
    if (
      year !== undefined &&
      (!Number.isInteger(year) || year < 2000 || year > 2200)
    ) {
      throw new BadRequestException("Invalid manufacturing period year.");
    }
    return this.prisma.manufacturingPeriod.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.status
          ? { status: query.status as ManufacturingPeriodStatus }
          : {}),
        ...(year !== undefined ? { periodYear: year } : {}),
      },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    });
  }

  async ensurePeriod(
    currentUser: AuthenticatedRequestUser,
    dto: EnsureManufacturingPeriodDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.configure");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const { start, end } = this.periodWindow(dto.periodYear, dto.periodMonth);
    return this.prisma.manufacturingPeriod.upsert({
      where: {
        workspaceId_periodYear_periodMonth: {
          workspaceId: scope.id,
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
        },
      },
      create: {
        tenantId: scope.tenantId,
        companyId: scope.companyId,
        workspaceId: scope.id,
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        periodStart: start,
        periodEnd: end,
        createdByUserId: currentUser.id,
      },
      update: {},
    });
  }

  private async periodValidationSnapshot(
    db: Db,
    scope: Scope,
    year: number,
    month: number,
    validationReference?: string | null,
  ) {
    const { start, end, next } = this.periodWindow(year, month);
    const orderOverlap = manufacturingPeriodOrderActivityScope(
      scope.id,
      start,
      end,
      next,
    );
    const [
      transactions,
      orders,
      mrpRuns,
      costs,
      reservations,
      operations,
      inspections,
      reviews,
      evidencePacks,
    ] = await Promise.all([
      db.manufacturingTransaction.findMany({
        where: {
          workspaceId: scope.id,
          transactionDate: { gte: start, lt: next },
          status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] },
        },
        select: {
          id: true,
          transactionNumber: true,
          status: true,
          transactionDate: true,
        },
        take: 100,
      }),
      db.manufacturingOrder.findMany({
        where: { ...orderOverlap, status: { notIn: ["CLOSED", "CANCELLED"] } },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          plannedStartDate: true,
          plannedEndDate: true,
        },
        take: 100,
      }),
      db.manufacturingMrpRun.findMany({
        where: {
          workspaceId: scope.id,
          status: { in: ["PENDING", "RUNNING"] },
          plan: {
            OR: [
              {
                plannedStartDate: { lte: end },
                plannedEndDate: { gte: start },
              },
              { plannedStartDate: { gte: start, lt: next } },
              { plannedEndDate: { gte: start, lt: next } },
            ],
          },
        },
        select: { id: true, runNumber: true, status: true, planId: true },
        take: 100,
      }),
      db.manufacturingCostSnapshot.findMany({
        where: {
          workspaceId: scope.id,
          status: { in: ["DRAFT", "PROVISIONAL"] },
          order: orderOverlap,
        },
        select: { id: true, orderId: true, versionNumber: true, status: true },
        take: 100,
      }),
      db.manufacturingReservation.findMany({
        where: {
          workspaceId: scope.id,
          status: { in: ["ACTIVE", "PARTIALLY_ISSUED"] },
          order: orderOverlap,
        },
        select: {
          id: true,
          reservationNumber: true,
          status: true,
          orderId: true,
        },
        take: 100,
      }),
      db.manufacturingOperationExecution.findMany({
        where: {
          status: { in: ["PENDING", "READY", "IN_PROGRESS", "PAUSED"] },
          order: orderOverlap,
        },
        select: {
          id: true,
          orderId: true,
          status: true,
          routingOperationId: true,
        },
        take: 100,
      }),
      db.manufacturingQualityInspection.findMany({
        where: {
          workspaceId: scope.id,
          status: { in: ["PENDING", "IN_PROGRESS", "HOLD"] },
          order: orderOverlap,
        },
        select: {
          id: true,
          inspectionNumber: true,
          status: true,
          orderId: true,
        },
        take: 100,
      }),
      db.manufacturingWorkflowReview.findMany({
        where: {
          workspaceId: scope.id,
          transactionDate: { gte: start, lt: next },
          status: "PENDING",
        },
        select: {
          id: true,
          workflowCode: true,
          entityType: true,
          entityId: true,
        },
        take: 100,
      }),
      db.manufacturingControlRecord.findMany({
        where: {
          workspaceId: scope.id,
          kind: "AUDIT_EVIDENCE_PACK",
          status: "APPROVED",
        },
        select: { id: true, code: true, payload: true },
      }),
    ]);
    const evidence = evaluatePeriodEvidencePack({
      periodStart: start,
      periodEnd: end,
      validationReference,
      packs: evidencePacks,
    });
    const groups = {
      unpostedTransactions: transactions,
      openOrders: orders,
      runningMrp: mrpRuns,
      unfinalizedCosts: costs,
      activeReservations: reservations,
      openOperations: operations,
      unresolvedQuality: inspections,
      pendingApprovals: reviews,
      auditEvidencePack: evidence.ready
        ? []
        : evidence.blockers.map((message, index) => ({
            id: `AUDIT_EVIDENCE_PACK:${index + 1}`,
            message,
          })),
    };
    const counts = Object.fromEntries(
      Object.entries(groups).map(([key, rows]) => [key, rows.length]),
    );
    const blockerCount = Object.values(counts).reduce(
      (sum, count) => sum + count,
      0,
    );
    return {
      period: {
        year,
        month,
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      validationReference: cleanText(validationReference),
      evidencePack: {
        ready: evidence.ready,
        eligible: evidence.eligible,
        blockers: evidence.blockers,
      },
      validatedAt: new Date().toISOString(),
      lockable: blockerCount === 0,
      blockerCount,
      counts,
      references: groups,
      truncation:
        "Each blocker category returns at most 100 references; any category at 100 must be cleared and revalidated.",
    };
  }

  async validatePeriod(
    currentUser: AuthenticatedRequestUser,
    dto: ValidateManufacturingPeriodDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.audit.review");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const period = await this.prisma.manufacturingPeriod.findUnique({
      where: {
        workspaceId_periodYear_periodMonth: {
          workspaceId: scope.id,
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
        },
      },
    });
    if (!period)
      throw new NotFoundException(
        "Manufacturing period has not been opened/configured.",
      );
    const snapshot = await this.periodValidationSnapshot(
      this.prisma,
      scope,
      dto.periodYear,
      dto.periodMonth,
      dto.validationReference,
    );
    await this.prisma.manufacturingPeriod.update({
      where: { id: period.id },
      data: {
        lastValidation: snapshot as Prisma.InputJsonValue,
        lastValidatedAt: new Date(),
      },
    });
    return snapshot;
  }

  async lockPeriod(
    currentUser: AuthenticatedRequestUser,
    dto: LockManufacturingPeriodDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.audit.review");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const replay = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (replay) {
      if (replay.workflowCode !== "MANUFACTURING_PERIOD_LOCK") {
        throw new ConflictException(
          "Idempotency key is already used for another manufacturing action.",
        );
      }
      const period = await this.prisma.manufacturingPeriod.findUnique({
        where: {
          workspaceId_periodYear_periodMonth: {
            workspaceId: scope.id,
            periodYear: dto.periodYear,
            periodMonth: dto.periodMonth,
          },
        },
      });
      if (!period)
        throw new NotFoundException("Manufacturing period not found.");
      if (replay.entityId !== period.id) {
        throw new ConflictException(
          "Idempotency key is already used to lock a different manufacturing period.",
        );
      }
      return { period, replayed: true };
    }
    const when = asDate(dto.transactionDate, "transactionDate");
    const result = await this.prisma.$transaction(
      async (tx) => {
        const period = await tx.manufacturingPeriod.findUnique({
          where: {
            workspaceId_periodYear_periodMonth: {
              workspaceId: scope.id,
              periodYear: dto.periodYear,
              periodMonth: dto.periodMonth,
            },
          },
        });
        if (!period)
          throw new NotFoundException(
            "Manufacturing period has not been opened/configured.",
          );
        if (period.status !== "OPEN")
          throw new BadRequestException(
            "Only an OPEN manufacturing period can be locked.",
          );
        const snapshot = await this.periodValidationSnapshot(
          tx,
          scope,
          dto.periodYear,
          dto.periodMonth,
          dto.validationReference,
        );
        if (snapshot.blockerCount) {
          throw new BadRequestException({
            message:
              "Manufacturing period has unresolved workflow blockers and cannot be locked.",
            validation: snapshot,
          });
        }
        const updated = await tx.manufacturingPeriod.update({
          where: { id: period.id },
          data: {
            status: "LOCKED",
            lastValidation: snapshot as Prisma.InputJsonValue,
            lastValidatedAt: when,
            lockedByUserId: currentUser.id,
            lockedAt: when,
            lockReason: dto.reason.trim(),
          },
        });
        const electronicSignatureEvidence =
          await this.electronicSignature.enforce(tx, {
            scope,
            user: currentUser,
            actionLabel: `lock manufacturing period ${dto.periodYear}-${String(dto.periodMonth).padStart(2, "0")}`,
            signatureMeaning: dto.signatureMeaning,
            reauthenticationPassword: dto.reauthenticationPassword,
            required: true,
          });
        await this.createAudit(tx, scope, currentUser, {
          workflowGroup: "PERIOD_CONTROL",
          workflowCode: "MANUFACTURING_PERIOD_LOCK",
          entityType: "MANUFACTURING_PERIOD",
          entityId: updated.id,
          transactionDate: when,
          idempotencyKey: dto.idempotencyKey,
          title: `Lock manufacturing period ${dto.periodYear}-${String(dto.periodMonth).padStart(2, "0")}`,
          note: dto.reason,
          evidence: {
            signatureMeaning: dto.signatureMeaning.trim(),
            validationReference: cleanText(dto.validationReference),
            validation: snapshot,
            electronicSignaturePolicy: electronicSignatureEvidence,
          },
          signatureMeaning: dto.signatureMeaning,
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { period: result, replayed: false };
  }

  private async mutationsAfterLock(
    db: Db,
    scope: Scope,
    period: { periodStart: Date; periodEnd: Date; lockedAt: Date | null },
  ) {
    if (!period.lockedAt)
      throw new BadRequestException("Locked period has no lock timestamp.");
    const next = new Date(
      Date.UTC(
        period.periodEnd.getUTCFullYear(),
        period.periodEnd.getUTCMonth() + 1,
        1,
      ),
    );
    const overlap = manufacturingPeriodOrderActivityScope(
      scope.id,
      period.periodStart,
      period.periodEnd,
      next,
    );
    const [transactions, orders, costs, operations, inspections, reviews] =
      await Promise.all([
        db.manufacturingTransaction.count({
          where: {
            workspaceId: scope.id,
            transactionDate: { gte: period.periodStart, lt: next },
            updatedAt: { gt: period.lockedAt },
          },
        }),
        db.manufacturingOrder.count({
          where: { ...overlap, updatedAt: { gt: period.lockedAt } },
        }),
        db.manufacturingCostSnapshot.count({
          where: {
            workspaceId: scope.id,
            order: overlap,
            updatedAt: { gt: period.lockedAt },
          },
        }),
        db.manufacturingOperationExecution.count({
          where: { order: overlap, updatedAt: { gt: period.lockedAt } },
        }),
        db.manufacturingQualityInspection.count({
          where: {
            workspaceId: scope.id,
            order: overlap,
            updatedAt: { gt: period.lockedAt },
          },
        }),
        db.manufacturingWorkflowReview.count({
          where: {
            workspaceId: scope.id,
            transactionDate: { gte: period.periodStart, lt: next },
            updatedAt: { gt: period.lockedAt },
            workflowCode: { not: "MANUFACTURING_PERIOD_LOCK" },
          },
        }),
      ]);
    const counts = {
      transactions,
      orders,
      costs,
      operations,
      inspections,
      reviews,
    };
    return {
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    };
  }

  async archivePeriod(
    currentUser: AuthenticatedRequestUser,
    dto: ArchiveManufacturingPeriodDto,
  ) {
    await this.requirePermission(currentUser, "manufacturing.audit.review");
    const scope = await this.scope(currentUser, dto.workspaceId);
    const replay = await this.prisma.manufacturingWorkflowReview.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: scope.id,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (replay) {
      if (replay.workflowCode !== "MANUFACTURING_PERIOD_ARCHIVE") {
        throw new ConflictException(
          "Idempotency key is already used for another manufacturing action.",
        );
      }
      const period = await this.prisma.manufacturingPeriod.findUnique({
        where: {
          workspaceId_periodYear_periodMonth: {
            workspaceId: scope.id,
            periodYear: dto.periodYear,
            periodMonth: dto.periodMonth,
          },
        },
      });
      if (!period)
        throw new NotFoundException("Manufacturing period not found.");
      if (replay.entityId !== period.id) {
        throw new ConflictException(
          "Idempotency key is already used to archive a different manufacturing period.",
        );
      }
      return { period, replayed: true };
    }
    const when = asDate(dto.transactionDate, "transactionDate");
    const result = await this.prisma.$transaction(
      async (tx) => {
        const period = await tx.manufacturingPeriod.findUnique({
          where: {
            workspaceId_periodYear_periodMonth: {
              workspaceId: scope.id,
              periodYear: dto.periodYear,
              periodMonth: dto.periodMonth,
            },
          },
        });
        if (!period)
          throw new NotFoundException("Manufacturing period not found.");
        if (period.status !== "LOCKED")
          throw new BadRequestException(
            "Only a LOCKED period can be archived.",
          );
        const mutations = await this.mutationsAfterLock(tx, scope, period);
        if (mutations.total) {
          throw new BadRequestException({
            message:
              "Manufacturing records changed after period lock; revalidation is required.",
            changesAfterLock: mutations,
          });
        }
        const lastValidation =
          period.lastValidation &&
          typeof period.lastValidation === "object" &&
          !Array.isArray(period.lastValidation)
            ? (period.lastValidation as Record<string, unknown>)
            : {};
        const validationReference =
          typeof lastValidation.validationReference === "string"
            ? lastValidation.validationReference
            : null;
        const snapshot = await this.periodValidationSnapshot(
          tx,
          scope,
          dto.periodYear,
          dto.periodMonth,
          validationReference,
        );
        if (snapshot.blockerCount) {
          throw new BadRequestException({
            message:
              "Manufacturing period no longer satisfies operational or audit-evidence readiness and cannot be archived.",
            validation: snapshot,
          });
        }
        const updated = await tx.manufacturingPeriod.update({
          where: { id: period.id },
          data: {
            status: "ARCHIVED",
            archivedByUserId: currentUser.id,
            archivedAt: when,
            archiveReason: dto.reason.trim(),
          },
        });
        const electronicSignatureEvidence =
          await this.electronicSignature.enforce(tx, {
            scope,
            user: currentUser,
            actionLabel: `archive manufacturing period ${dto.periodYear}-${String(dto.periodMonth).padStart(2, "0")}`,
            signatureMeaning: dto.signatureMeaning,
            reauthenticationPassword: dto.reauthenticationPassword,
            required: true,
          });
        await this.createAudit(tx, scope, currentUser, {
          workflowGroup: "PERIOD_CONTROL",
          workflowCode: "MANUFACTURING_PERIOD_ARCHIVE",
          entityType: "MANUFACTURING_PERIOD",
          entityId: updated.id,
          transactionDate: when,
          idempotencyKey: dto.idempotencyKey,
          title: `Archive manufacturing period ${dto.periodYear}-${String(dto.periodMonth).padStart(2, "0")}`,
          note: dto.reason,
          evidence: {
            signatureMeaning: dto.signatureMeaning.trim(),
            changesAfterLock: mutations,
            electronicSignaturePolicy: electronicSignatureEvidence,
          },
          signatureMeaning: dto.signatureMeaning,
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { period: result, replayed: false };
  }
}
