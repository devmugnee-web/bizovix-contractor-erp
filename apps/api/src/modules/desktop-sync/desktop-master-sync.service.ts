import { createHash } from "crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { AuthUser, Permission } from "@bizovix/types";
import { PrismaService } from "../prisma/prisma.service";
import { UomsService } from "../uoms/uoms.service";
import { PaymentTermsService } from "../payment-terms/payment-terms.service";
import { OrganizationsService } from "../organizations/organizations.service";
import type { CreateOrganizationMasterDto } from "../organizations/dto/create-organization-master.dto";
import type { SaveUomDto } from "../uoms/dto/save-uom.dto";
import type { SavePaymentTermDto } from "../payment-terms/dto/save-payment-term.dto";
import { DesktopSyncService } from "./desktop-sync.service";
import { canonicalJson } from "./desktop-offline-grant";
import { parseSyncCursor, requireDesktopSync, syncCursor } from "./desktop-sync-state";
import { DesktopMasterCommandDto } from "./desktop-master-sync.dto";
import { desktopMasterVersion, lockDesktopMasterClock, masterProjection, recordDesktopMasterChange } from "./desktop-master-sync-state";
import type { DesktopMasterEntityType } from "./desktop-master-sync-state";
import { DesktopOrganizationQueryPolicy } from "./desktop-organization-query-policy";

const PAGE_SIZE = 200;
type CommandResult = { operationId: string; entityType: DesktopMasterEntityType; record: ReturnType<typeof masterProjection>; cursor: string; replayed: boolean };

@Injectable()
export class DesktopMasterSyncService {
  private readonly organizationQueries = new DesktopOrganizationQueryPolicy();
  constructor(private readonly prisma: PrismaService, private readonly access: DesktopSyncService, private readonly uoms: UomsService, private readonly terms: PaymentTermsService, private readonly organizations: OrganizationsService) {}

  private entityType(value: DesktopMasterEntityType) {
    if (value !== "uom" && value !== "paymentTerm" && value !== "organizationMaster") throw new BadRequestException("Unsupported desktop master entity");
    return value;
  }

  async execute(actor: AuthUser, command: DesktopMasterCommandDto): Promise<CommandResult> {
    requireDesktopSync();
    const entityType = this.entityType(command.entityType);
    const allowed = entityType === "organizationMaster" ? ["organizationMaster.create"] : [`${entityType}.create`, `${entityType}.update`];
    if (!command.payload || command.schemaVersion !== 1 || !allowed.includes(command.commandType)) throw new BadRequestException("Unsupported desktop master command");
    // New offline commands reject whitespace-only inputs before enqueue/commit.
    // Existing REST rules and previously stored records remain untouched.
    const named = command.payload as SaveUomDto | SavePaymentTermDto;
    if (entityType !== "organizationMaster" && (typeof named.name !== "string" || !named.name.trim() || (entityType === "uom" && (typeof (command.payload as SaveUomDto).code !== "string" || !(command.payload as SaveUomDto).code.trim())))) throw new BadRequestException("Master name and unit code must contain non-whitespace text");
    const days = (command.payload as SavePaymentTermDto).days;
    if (entityType === "paymentTerm" && days != null && (!Number.isInteger(days) || days < 0 || days > 2_147_483_647)) throw new BadRequestException("Payment term days must fit a non-negative database integer");
    const creating = command.commandType.endsWith(".create");
    if ((creating && command.expectedVersion != null) || (!creating && (!Number.isInteger(command.expectedVersion) || command.expectedVersion! < 1))) throw new BadRequestException("Create requires no expectedVersion; update requires a positive expectedVersion");
    const requestHash = createHash("sha256").update(canonicalJson(command)).digest("hex");
    const permissions: Permission[] = entityType === "organizationMaster" ? [] : ["masters.read", entityType === "uom" ? "uom.manage" : "payment_terms.manage"];
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockDesktopMasterClock(tx, actor.organizationId, entityType);
        await this.access.authorize(tx, actor, permissions, true);
        await this.access.device(tx, actor, command.deviceId, true);
        const key = { organizationId: actor.organizationId, deviceId: command.deviceId, operationId: command.operationId };
        const receipt = await tx.desktopSyncReceipt.findUnique({ where: { organizationId_deviceId_operationId: key } });
        if (receipt) {
          if (receipt.userId !== actor.id || receipt.requestHash !== requestHash) throw new ConflictException("OPERATION_ID_REUSED: operation identity does not match its original request");
          return { ...(receipt.result as unknown as Omit<CommandResult, "replayed">), replayed: true };
        }
        const current = entityType === "organizationMaster"
          ? await tx.organizationMaster.findUnique({ where: { id: command.entityId } })
          : entityType === "uom"
          ? await tx.unitOfMeasurement.findUnique({ where: { id: command.entityId } })
          : await tx.paymentTerm.findUnique({ where: { id: command.entityId } });
        let version = 1;
        if (creating) {
          if (current) throw new ConflictException("ENTITY_ID_EXISTS: master identity is already used");
        } else {
          if (!current || current.organizationId !== actor.organizationId) throw new ConflictException("MASTER_NOT_FOUND: master no longer exists in this organization");
          version = await desktopMasterVersion(tx, actor.organizationId, entityType, command.entityId);
          if (version !== command.expectedVersion) throw new ConflictException("VERSION_CONFLICT: master changed; refresh and review the pending edit");
          version += 1;
        }
        const record = entityType === "organizationMaster"
          ? await this.organizations.createInTransaction(tx, actor.organizationId, command.payload as CreateOrganizationMasterDto, command.entityId)
          : entityType === "uom"
          ? creating
            ? await this.uoms.createInTransaction(tx, actor.organizationId, actor.id, command.payload as SaveUomDto, command.entityId)
            : await this.uoms.updateInTransaction(tx, actor.organizationId, actor.id, command.entityId, command.payload as SaveUomDto)
          : creating
            ? await this.terms.createInTransaction(tx, actor.organizationId, actor.id, command.payload as SavePaymentTermDto, command.entityId)
            : await this.terms.updateInTransaction(tx, actor.organizationId, actor.id, command.entityId, command.payload as SavePaymentTermDto);
        const recorded = await recordDesktopMasterChange(tx, actor.organizationId, entityType, record, version, command.operationId);
        const result = { operationId: command.operationId, entityType, ...recorded };
        await tx.desktopSyncReceipt.create({ data: { ...key, userId: actor.id, requestHash, result: result as Prisma.InputJsonValue } });
        return { ...result, replayed: false };
      }, { timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("MASTER_CONFLICT: master identity, code or name is already used");
      throw error;
    }
  }

  async snapshot(actor: AuthUser, deviceId: string, value: DesktopMasterEntityType) {
    requireDesktopSync();
    const entityType = this.entityType(value);
    const permissions: Permission[] = entityType === "organizationMaster" ? [] : ["masters.read"];
    // Initialize independently of category registration. A separate read-committed
    // transaction avoids first-use insertion races within a repeatable-read snapshot.
    await this.prisma.$transaction(async (tx) => {
      await this.access.authorize(tx, actor, permissions);
      await this.access.device(tx, actor, deviceId);
      await lockDesktopMasterClock(tx, actor.organizationId, entityType);
    });
    return this.prisma.$transaction(async (tx) => {
      await this.access.authorize(tx, actor, permissions);
      await this.access.device(tx, actor, deviceId);
      const clock = await tx.desktopMasterSyncClock.findUniqueOrThrow({ where: { organizationId_entityType: { organizationId: actor.organizationId, entityType } } });
      const rows = entityType === "organizationMaster"
        ? await tx.organizationMaster.findMany({ where: { organizationId: actor.organizationId }, orderBy: { id: "asc" } })
        : entityType === "uom"
        ? await tx.unitOfMeasurement.findMany({ where: { organizationId: actor.organizationId }, orderBy: { id: "asc" } })
        : await tx.paymentTerm.findMany({ where: { organizationId: actor.organizationId }, orderBy: { id: "asc" } });
      const versions = await tx.desktopMasterSyncVersion.findMany({ where: { organizationId: actor.organizationId, entityType } });
      const byId = new Map(versions.map((row) => [row.entityId, row.version]));
      const queryIndex = entityType === "organizationMaster" ? await this.organizationQueries.index(tx, actor.organizationId) : undefined;
      return { records: rows.map((row) => masterProjection(entityType, row, byId.get(row.id) ?? 1)), cursor: syncCursor(clock.epoch, clock.sequence), epoch: clock.epoch, schemaVersion: 1 as const, entityType, ...(queryIndex ? { queryIndex } : {}) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
  }

  async changes(actor: AuthUser, deviceId: string, value: DesktopMasterEntityType, cursor: string) {
    requireDesktopSync();
    const entityType = this.entityType(value);
    const permissions: Permission[] = entityType === "organizationMaster" ? [] : ["masters.read"];
    return this.prisma.$transaction(async (tx) => {
      await this.access.authorize(tx, actor, permissions);
      await this.access.device(tx, actor, deviceId);
      const clock = await tx.desktopMasterSyncClock.findUnique({ where: { organizationId_entityType: { organizationId: actor.organizationId, entityType } } });
      if (!clock) throw new ConflictException("RESNAPSHOT_REQUIRED: desktop master stream is not initialized");
      const after = parseSyncCursor(cursor, clock.epoch, clock.sequence);
      const rows = await tx.desktopMasterSyncChange.findMany({ where: { organizationId: actor.organizationId, entityType, sequence: { gt: after, lte: clock.sequence } }, orderBy: { sequence: "asc" }, take: PAGE_SIZE + 1 });
      const page = rows.slice(0, PAGE_SIZE);
      if (page.some((row, index) => row.sequence !== after + BigInt(index + 1)) || (!page.length && after < clock.sequence)) throw new ConflictException("RESNAPSHOT_REQUIRED: desktop master history is incomplete");
      const next = page.at(-1)?.sequence ?? after;
      if (rows.length <= PAGE_SIZE && next < clock.sequence) throw new ConflictException("RESNAPSHOT_REQUIRED: desktop master history is incomplete");
      const queryIndex = entityType === "organizationMaster" ? await this.organizationQueries.index(tx, actor.organizationId) : undefined;
      return { entityType, changes: page.map((row) => ({ kind: "upsert" as const, record: row.record, operationId: row.operationId, cursor: syncCursor(clock.epoch, row.sequence) })), cursor: syncCursor(clock.epoch, next), hasMore: rows.length > PAGE_SIZE, ...(queryIndex ? { queryIndex } : {}) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
  }
}
