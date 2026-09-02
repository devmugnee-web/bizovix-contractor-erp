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
import type {
  EndManufacturingDowntimeDto,
  ListManufacturingDowntimesDto,
  StartManufacturingDowntimeDto,
} from "./manufacturing-downtime.dto.js";
import type { ManufacturingElectronicSignatureEvidence } from "./manufacturing-electronic-signature.service.js";
import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";

type Db = Prisma.TransactionClient | PrismaService;
type Scope = { id: string; tenantId: string; companyId: string };

const DOWNTIME_RESOURCE_KINDS = ["EQUIPMENT", "PRODUCTION_LINE"] as const;

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label} is invalid.`);
  }
  return date;
}

function utcDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function signatureHash(parts: readonly unknown[]): string {
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

export function calculateDowntimeDurationMinutes(
  startedAt: Date,
  endedAt: Date,
): string {
  const milliseconds = endedAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new BadRequestException(
      "Downtime end date cannot be earlier than its start date.",
    );
  }
  return (milliseconds / 60_000).toFixed(4);
}

const downtimeInclude =
  Prisma.validator<Prisma.ManufacturingDowntimeEventInclude>()({
    order: {
      select: {
        id: true,
        orderNumber: true,
        status: true,
        finishedProduct: {
          select: { id: true, itemCode: true, itemName: true, unit: true },
        },
      },
    },
    operationExecution: {
      select: {
        id: true,
        status: true,
        routingOperation: { select: { id: true, code: true, name: true } },
      },
    },
    resource: { select: { id: true, code: true, name: true, kind: true } },
    startedBy: { select: { id: true, name: true } },
    endedBy: { select: { id: true, name: true } },
  });

type DowntimeRow = Prisma.ManufacturingDowntimeEventGetPayload<{
  include: typeof downtimeInclude;
}>;

@Injectable()
export class ManufacturingDowntimeService {
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
    if (!workspaceId || !currentUser.workspaceId) {
      throw new BadRequestException("An active workspace is required.");
    }
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
    if (!granted.has(key)) {
      throw new ForbiddenException(`Permission required: ${key}`);
    }
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

  private mapEvent(row: DowntimeRow) {
    return {
      ...row,
      durationMinutes: row.durationMinutes?.toString() ?? null,
    };
  }

  private async findStartReplay(
    db: Db,
    workspaceId: string,
    dto: StartManufacturingDowntimeDto,
  ) {
    const row = await db.manufacturingDowntimeEvent.findUnique({
      where: {
        workspaceId_startIdempotencyKey: {
          workspaceId,
          startIdempotencyKey: dto.idempotencyKey.trim(),
        },
      },
      include: downtimeInclude,
    });
    if (!row) return null;
    if (
      row.orderId !== dto.orderId ||
      row.operationExecutionId !== dto.operationExecutionId ||
      row.resourceId !== dto.resourceId ||
      row.reason !== dto.reason.trim() ||
      row.reasonCode !== cleanText(dto.reasonCode) ||
      row.startSignatureMeaning !== cleanText(dto.signatureMeaning) ||
      row.startedAt.getTime() !==
        asDate(dto.transactionDate, "transactionDate").getTime()
    ) {
      throw new ConflictException(
        "This downtime start idempotency key was already used with different details.",
      );
    }
    return row;
  }

  private async findEndReplay(
    db: Db,
    workspaceId: string,
    eventId: string,
    dto: EndManufacturingDowntimeDto,
  ) {
    const row = await db.manufacturingDowntimeEvent.findUnique({
      where: {
        workspaceId_endIdempotencyKey: {
          workspaceId,
          endIdempotencyKey: dto.idempotencyKey.trim(),
        },
      },
      include: downtimeInclude,
    });
    if (!row) return null;
    if (
      row.id !== eventId ||
      row.endNote !== cleanText(dto.endNote) ||
      row.endSignatureMeaning !== cleanText(dto.signatureMeaning) ||
      row.endedAt?.getTime() !==
        asDate(dto.transactionDate, "transactionDate").getTime()
    ) {
      throw new ConflictException(
        "This downtime end idempotency key was already used with different details.",
      );
    }
    return row;
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    input: {
      scope: Scope;
      user: AuthenticatedRequestUser;
      eventId: string;
      orderId: string;
      action: "START" | "END";
      when: Date;
      idempotencyKey: string;
      reason?: string | null;
      signatureMeaning?: string | null;
      signatureEvidence: ManufacturingElectronicSignatureEvidence | null;
      oldValues: Prisma.InputJsonValue;
      newValues: Prisma.InputJsonValue;
    },
  ) {
    const signatureMeaning = cleanText(input.signatureMeaning);
    const hash = signatureMeaning
      ? signatureHash([
          input.scope.id,
          input.eventId,
          input.action,
          input.user.id,
          input.when.toISOString(),
          input.idempotencyKey,
          signatureMeaning,
        ])
      : null;
    await tx.manufacturingWorkflowReview.create({
      data: {
        tenantId: input.scope.tenantId,
        companyId: input.scope.companyId,
        workspaceId: input.scope.id,
        orderId: input.orderId,
        workflowGroup: "PRODUCTION_EXECUTION",
        workflowCode: `DOWNTIME_${input.action}`,
        entityType: "MANUFACTURING_DOWNTIME_EVENT",
        entityId: input.eventId,
        transactionDate: input.when,
        idempotencyKey: `DOWNTIME-${input.action}:${input.idempotencyKey}`,
        title:
          input.action === "START"
            ? "Machine / line downtime started"
            : "Machine / line downtime ended",
        outcome: "EXECUTED",
        status: signatureMeaning ? "APPROVED" : "REVIEWED",
        reason: cleanText(input.reason),
        evidence: {
          oldValues: input.oldValues,
          newValues: input.newValues,
          signatureMeaning,
          electronicSignaturePolicy: input.signatureEvidence,
        } as Prisma.InputJsonValue,
        signatureHash: hash,
        reviewedByUserId: signatureMeaning ? null : input.user.id,
        reviewedAt: signatureMeaning ? null : input.when,
        approvedByUserId: signatureMeaning ? input.user.id : null,
        approvedAt: signatureMeaning ? input.when : null,
        createdByUserId: input.user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: input.scope.tenantId,
        organizationId: input.user.organizationId,
        companyId: input.scope.companyId,
        workspaceId: input.scope.id,
        userId: input.user.id,
        action: `MANUFACTURING_DOWNTIME_${input.action}`,
        entityType: "MANUFACTURING_DOWNTIME_EVENT",
        entityId: input.eventId,
        oldValues: input.oldValues,
        newValues: input.newValues,
      },
    });
    return hash;
  }

  async listCandidates(
    currentUser: AuthenticatedRequestUser,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    await this.requirePermission(currentUser, "manufacturing.view");
    const rows = await this.prisma.manufacturingOperationExecution.findMany({
      where: {
        status: { in: ["IN_PROGRESS", "PAUSED"] },
        order: { workspaceId: scope.id, status: "IN_PRODUCTION" },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            finishedProduct: {
              select: { id: true, itemCode: true, itemName: true, unit: true },
            },
          },
        },
        routingOperation: {
          select: {
            id: true,
            code: true,
            name: true,
            sequence: true,
            resourceRequirements: {
              where: {
                resource: {
                  workspaceId: scope.id,
                  isActive: true,
                  kind: { in: [...DOWNTIME_RESOURCE_KINDS] },
                },
              },
              select: {
                resource: {
                  select: { id: true, code: true, name: true, kind: true },
                },
              },
            },
          },
        },
        downtimeEvents: {
          where: { status: "OPEN" },
          select: { id: true, resourceId: true, startedAt: true },
        },
      },
      orderBy: [
        { order: { orderNumber: "asc" } },
        { routingOperation: { sequence: "asc" } },
      ],
    });
    return rows.flatMap((row) =>
      row.routingOperation.resourceRequirements.map((requirement) => ({
        orderId: row.order.id,
        orderNumber: row.order.orderNumber,
        finishedProduct: row.order.finishedProduct,
        operationExecutionId: row.id,
        operationStatus: row.status,
        operation: {
          id: row.routingOperation.id,
          code: row.routingOperation.code,
          name: row.routingOperation.name,
          sequence: row.routingOperation.sequence,
        },
        resource: requirement.resource,
        openDowntimeEvent:
          row.downtimeEvents.find(
            (event) => event.resourceId === requirement.resource.id,
          ) ?? null,
      })),
    );
  }

  async listReasonCodes(
    currentUser: AuthenticatedRequestUser,
    workspaceId?: string,
  ) {
    const scope = await this.scope(currentUser, workspaceId);
    await this.requirePermission(currentUser, "manufacturing.view");
    const now = utcDateOnly(new Date());
    const records = await this.prisma.manufacturingControlRecord.findMany({
      where: {
        workspaceId: scope.id,
        kind: "REASON_CODE",
        status: "APPROVED",
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        payload: true,
        versionNumber: true,
      },
      orderBy: [
        { code: "asc" },
        { versionNumber: "desc" },
        { createdAt: "desc" },
      ],
    });
    const latest = new Map<string, (typeof records)[number]>();
    for (const record of records) {
      if (!latest.has(record.code)) latest.set(record.code, record);
    }
    return [...latest.values()];
  }

  async listEvents(
    currentUser: AuthenticatedRequestUser,
    query: ListManufacturingDowntimesDto,
  ) {
    const scope = await this.scope(currentUser, query.workspaceId);
    await this.requirePermission(currentUser, "manufacturing.view");
    const rows = await this.prisma.manufacturingDowntimeEvent.findMany({
      where: {
        workspaceId: scope.id,
        ...(query.status ? { status: query.status } : {}),
        ...(cleanText(query.orderId) ? { orderId: query.orderId!.trim() } : {}),
        ...(cleanText(query.resourceId)
          ? { resourceId: query.resourceId!.trim() }
          : {}),
      },
      include: downtimeInclude,
      orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    });
    return rows.map((row) => this.mapEvent(row));
  }

  async start(
    currentUser: AuthenticatedRequestUser,
    dto: StartManufacturingDowntimeDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.requirePermission(
      currentUser,
      "manufacturing.production.execute",
    );
    const when = asDate(dto.transactionDate, "transactionDate");
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException("Downtime reason is required.");
    const replay = await this.findStartReplay(this.prisma, scope.id, dto);
    if (replay) return this.mapEvent(replay);

    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          const retry = await this.findStartReplay(tx, scope.id, dto);
          if (retry) return retry;
          await this.assertPeriodOpen(tx, scope.id, when);

          const execution = await tx.manufacturingOperationExecution.findFirst({
            where: {
              id: dto.operationExecutionId,
              orderId: dto.orderId,
              order: { workspaceId: scope.id, status: "IN_PRODUCTION" },
            },
            select: {
              id: true,
              status: true,
              routingOperationId: true,
              order: { select: { id: true, orderNumber: true } },
              routingOperation: { select: { code: true, name: true } },
            },
          });
          if (!execution) {
            throw new BadRequestException(
              "Downtime must reference an active production order operation in this workspace.",
            );
          }
          if (execution.status !== "IN_PROGRESS") {
            throw new ConflictException(
              "Only an IN_PROGRESS operation can start a downtime event.",
            );
          }

          const requirement =
            await tx.manufacturingOperationResourceRequirement.findFirst({
              where: {
                routingOperationId: execution.routingOperationId,
                resourceId: dto.resourceId,
                resource: {
                  workspaceId: scope.id,
                  isActive: true,
                  kind: { in: [...DOWNTIME_RESOURCE_KINDS] },
                },
              },
              select: {
                resource: {
                  select: { id: true, code: true, name: true, kind: true },
                },
              },
            });
          if (!requirement) {
            throw new BadRequestException(
              "Select an active machine or production line assigned to this operation.",
            );
          }
          const alreadyOpen = await tx.manufacturingDowntimeEvent.findFirst({
            where: {
              status: "OPEN",
              OR: [
                { operationExecutionId: execution.id },
                { resourceId: requirement.resource.id },
              ],
            },
            select: { id: true },
          });
          if (alreadyOpen) {
            throw new ConflictException(
              "This operation or resource already has an open downtime event.",
            );
          }
          const reasonCode = cleanText(dto.reasonCode);
          if (reasonCode) {
            const effectiveOn = utcDateOnly(when);
            const approvedReason =
              await tx.manufacturingControlRecord.findFirst({
                where: {
                  workspaceId: scope.id,
                  kind: "REASON_CODE",
                  status: "APPROVED",
                  code: reasonCode,
                  AND: [
                    {
                      OR: [
                        { effectiveFrom: null },
                        { effectiveFrom: { lte: effectiveOn } },
                      ],
                    },
                    {
                      OR: [
                        { effectiveTo: null },
                        { effectiveTo: { gte: effectiveOn } },
                      ],
                    },
                  ],
                },
                select: { id: true },
                orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
              });
            if (!approvedReason) {
              throw new BadRequestException(
                "Downtime reason code must be an approved manufacturing reason code.",
              );
            }
          }
          const settings = await tx.manufacturingSettings.findUnique({
            where: { workspaceId: scope.id },
            select: { electronicSignatureRequired: true },
          });
          const signatureMeaning = cleanText(dto.signatureMeaning);
          const signatureEvidence = await this.electronicSignature.enforce(tx, {
            scope,
            user: currentUser,
            actionLabel: "downtime start",
            signatureMeaning,
            reauthenticationPassword: dto.reauthenticationPassword,
            required: Boolean(settings?.electronicSignatureRequired),
          });
          const hash = signatureMeaning
            ? signatureHash([
                scope.id,
                "START",
                execution.id,
                requirement.resource.id,
                currentUser.id,
                when.toISOString(),
                dto.idempotencyKey,
                signatureMeaning,
              ])
            : null;
          const paused = await tx.manufacturingOperationExecution.updateMany({
            where: { id: execution.id, status: "IN_PROGRESS" },
            data: { status: "PAUSED", pauseReason: reason },
          });
          if (paused.count !== 1) {
            throw new ConflictException(
              "The operation state changed before downtime could be started.",
            );
          }
          const created = await tx.manufacturingDowntimeEvent.create({
            data: {
              tenantId: scope.tenantId,
              companyId: scope.companyId,
              workspaceId: scope.id,
              orderId: execution.order.id,
              operationExecutionId: execution.id,
              resourceId: requirement.resource.id,
              reasonCode,
              reason,
              startedAt: when,
              startIdempotencyKey: dto.idempotencyKey.trim(),
              startedByUserId: currentUser.id,
              startSignatureMeaning: signatureMeaning,
              startSignatureHash: hash,
              startSignatureEvidence: signatureEvidence
                ? (signatureEvidence as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            },
            include: downtimeInclude,
          });
          await this.writeAudit(tx, {
            scope,
            user: currentUser,
            eventId: created.id,
            orderId: created.orderId,
            action: "START",
            when,
            idempotencyKey: dto.idempotencyKey.trim(),
            reason,
            signatureMeaning,
            signatureEvidence,
            oldValues: {
              operationStatus: "IN_PROGRESS",
              downtimeStatus: null,
            },
            newValues: {
              operationStatus: "PAUSED",
              downtimeStatus: "OPEN",
              operationExecutionId: execution.id,
              resourceId: requirement.resource.id,
              reasonCode,
              reason,
              startedAt: when.toISOString(),
            },
          });
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.mapEvent(row);
    } catch (error) {
      if (isUniqueError(error)) {
        const retry = await this.findStartReplay(this.prisma, scope.id, dto);
        if (retry) return this.mapEvent(retry);
        throw new ConflictException(
          "This operation or resource already has an open downtime event.",
        );
      }
      throw error;
    }
  }

  async end(
    currentUser: AuthenticatedRequestUser,
    eventId: string,
    dto: EndManufacturingDowntimeDto,
  ) {
    const scope = await this.scope(currentUser, dto.workspaceId);
    await this.requirePermission(
      currentUser,
      "manufacturing.production.execute",
    );
    const when = asDate(dto.transactionDate, "transactionDate");
    const replay = await this.findEndReplay(
      this.prisma,
      scope.id,
      eventId,
      dto,
    );
    if (replay) return this.mapEvent(replay);

    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          const retry = await this.findEndReplay(tx, scope.id, eventId, dto);
          if (retry) return retry;
          await this.assertPeriodOpen(tx, scope.id, when);
          const current = await tx.manufacturingDowntimeEvent.findFirst({
            where: { id: eventId, workspaceId: scope.id },
            include: downtimeInclude,
          });
          if (!current)
            throw new NotFoundException("Downtime event not found.");
          if (current.status !== "OPEN") {
            throw new ConflictException(
              "Only an OPEN downtime event can be ended.",
            );
          }
          if (current.operationExecution.status !== "PAUSED") {
            throw new ConflictException(
              "The linked operation must remain PAUSED until downtime is ended.",
            );
          }
          if (current.order.status !== "IN_PRODUCTION") {
            throw new ConflictException(
              "The linked production order must remain IN_PRODUCTION until downtime is ended.",
            );
          }
          const durationMinutes = calculateDowntimeDurationMinutes(
            current.startedAt,
            when,
          );
          const settings = await tx.manufacturingSettings.findUnique({
            where: { workspaceId: scope.id },
            select: { electronicSignatureRequired: true },
          });
          const signatureMeaning = cleanText(dto.signatureMeaning);
          const signatureEvidence = await this.electronicSignature.enforce(tx, {
            scope,
            user: currentUser,
            actionLabel: "downtime end",
            signatureMeaning,
            reauthenticationPassword: dto.reauthenticationPassword,
            required: Boolean(settings?.electronicSignatureRequired),
          });
          const hash = signatureMeaning
            ? signatureHash([
                scope.id,
                "END",
                current.id,
                currentUser.id,
                when.toISOString(),
                dto.idempotencyKey,
                durationMinutes,
                signatureMeaning,
              ])
            : null;
          const ended = await tx.manufacturingDowntimeEvent.updateMany({
            where: { id: current.id, workspaceId: scope.id, status: "OPEN" },
            data: {
              status: "ENDED",
              endedAt: when,
              durationMinutes: new Prisma.Decimal(durationMinutes),
              endIdempotencyKey: dto.idempotencyKey.trim(),
              endedByUserId: currentUser.id,
              endSignatureMeaning: signatureMeaning,
              endSignatureHash: hash,
              endSignatureEvidence: signatureEvidence
                ? (signatureEvidence as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              endNote: cleanText(dto.endNote),
            },
          });
          if (ended.count !== 1) {
            throw new ConflictException(
              "The downtime event state changed before it could be ended.",
            );
          }
          const resumed = await tx.manufacturingOperationExecution.updateMany({
            where: {
              id: current.operationExecutionId,
              orderId: current.orderId,
              status: "PAUSED",
            },
            data: { status: "IN_PROGRESS", pauseReason: null },
          });
          if (resumed.count !== 1) {
            throw new ConflictException(
              "The linked operation state changed before it could be resumed.",
            );
          }
          await this.writeAudit(tx, {
            scope,
            user: currentUser,
            eventId: current.id,
            orderId: current.orderId,
            action: "END",
            when,
            idempotencyKey: dto.idempotencyKey.trim(),
            reason: cleanText(dto.endNote),
            signatureMeaning,
            signatureEvidence,
            oldValues: {
              operationStatus: "PAUSED",
              downtimeStatus: "OPEN",
              endedAt: null,
              durationMinutes: null,
            },
            newValues: {
              operationStatus: "IN_PROGRESS",
              downtimeStatus: "ENDED",
              endedAt: when.toISOString(),
              durationMinutes,
              endNote: cleanText(dto.endNote),
            },
          });
          const updated = await tx.manufacturingDowntimeEvent.findUniqueOrThrow(
            {
              where: { id: current.id },
              include: downtimeInclude,
            },
          );
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.mapEvent(row);
    } catch (error) {
      if (isUniqueError(error)) {
        const retry = await this.findEndReplay(
          this.prisma,
          scope.id,
          eventId,
          dto,
        );
        if (retry) return this.mapEvent(retry);
        throw new ConflictException(
          "This downtime end idempotency key is already in use.",
        );
      }
      throw error;
    }
  }
}
