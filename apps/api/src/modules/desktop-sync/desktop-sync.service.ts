import { createHash } from "crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { AuthUser, Permission } from "@bizovix/types";
import { PrismaService } from "../prisma/prisma.service";
import { MasterCategoriesService } from "../master-categories/master-categories.service";
import { canonicalJson, createDesktopOfflineGrant } from "./desktop-offline-grant";
import { DesktopCategoryCommandDto, RegisterDesktopDto } from "./desktop-sync.dto";
import { categoryProjection, categorySyncVersion, lockDesktopSyncClock, parseSyncCursor, recordCategorySyncChange, requireDesktopSync, syncCursor } from "./desktop-sync-state";

const PAGE_SIZE = 200;

@Injectable()
export class DesktopSyncService {
  constructor(private readonly prisma: PrismaService, private readonly categories: MasterCategoriesService) {}

  /** Shared internal authorization for category and independently versioned master streams. */
  async authorize(tx: Prisma.TransactionClient, actor: AuthUser, permissions: Permission[], lock = false): Promise<AuthUser> {
    if (lock) {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM organization_users WHERE "organizationId" = ${actor.organizationId} AND "userId" = ${actor.id} FOR SHARE`;
    }
    const membership = await tx.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: actor.organizationId, userId: actor.id } },
      include: { user: true, role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!membership?.user.isActive || membership.role.organizationId !== actor.organizationId) {
      throw new ForbiddenException("Active organization membership is required");
    }
    if (lock) {
      // Revoking existing role-permission rows waits for accepted commands to commit.
      await tx.$queryRaw`SELECT id FROM role_permissions WHERE "roleId" = ${membership.roleId} FOR SHARE`;
    }
    // Reload after obtaining permission locks; a concurrent deletion may have completed while waiting.
    const assigned = await tx.rolePermission.findMany({ where: { roleId: membership.roleId }, include: { permission: true } });
    const current = assigned.map((row) => row.permission.key as Permission);
    if (!permissions.every((permission) => current.includes(permission))) {
      throw new ForbiddenException("You do not have permission to synchronize these categories");
    }
    return {
      id: membership.user.id, organizationId: actor.organizationId, email: membership.user.email,
      name: membership.user.name, avatarUrl: membership.user.avatarUrl,
      roleName: membership.role.name, permissions: current,
    };
  }

  async device(tx: Prisma.TransactionClient, actor: AuthUser, deviceId: string, lock = false) {
    if (lock) await tx.$queryRaw`SELECT id FROM desktop_sync_devices WHERE id = ${deviceId} FOR SHARE`;
    const device = await tx.desktopSyncDevice.findUnique({ where: { id: deviceId } });
    if (!device || device.organizationId !== actor.organizationId || device.userId !== actor.id || device.revokedAt) {
      throw new ForbiddenException("This desktop device is not registered for the current account");
    }
    return device;
  }

  async register(actor: AuthUser, dto: RegisterDesktopDto) {
    requireDesktopSync();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockDesktopSyncClock(tx, actor.organizationId);
        const user = await this.authorize(tx, actor, [], true);
        const existing = await tx.desktopSyncDevice.findUnique({ where: { id: dto.deviceId } });
        if (existing && (existing.organizationId !== actor.organizationId || existing.userId !== actor.id || existing.revokedAt)) {
          throw new ForbiddenException("This desktop device is already bound to another account or revoked");
        }
        const grant = createDesktopOfflineGrant(user, dto.deviceId);
        await tx.desktopSyncDevice.upsert({
          where: { id: dto.deviceId },
          create: { id: dto.deviceId, organizationId: actor.organizationId, userId: actor.id, deviceName: dto.deviceName },
          update: { deviceName: dto.deviceName, lastSeenAt: new Date() },
        });
        return { deviceId: dto.deviceId, organizationId: actor.organizationId, userId: actor.id, schemaVersion: 1, grant };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ForbiddenException("This desktop device is already registered");
      }
      throw error;
    }
  }

  async execute(actor: AuthUser, command: DesktopCategoryCommandDto) {
    requireDesktopSync();
    if (!command.payload || command.schemaVersion !== 1 || !["masterCategory.create", "masterCategory.update"].includes(command.commandType)) {
      throw new BadRequestException("Unsupported desktop command");
    }
    const creating = command.commandType === "masterCategory.create";
    if ((creating && command.expectedVersion != null) || (!creating && (!Number.isInteger(command.expectedVersion) || command.expectedVersion! < 1))) {
      throw new BadRequestException("Create requires no expectedVersion; update requires a positive expectedVersion");
    }
    const hash = createHash("sha256").update(canonicalJson(command)).digest("hex");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockDesktopSyncClock(tx, actor.organizationId);
        await this.authorize(tx, actor, ["masters.read", creating ? "vendor.create" : "vendor.update"], true);
        await this.device(tx, actor, command.deviceId, true);
        const key = { organizationId: actor.organizationId, deviceId: command.deviceId, operationId: command.operationId };
        const receipt = await tx.desktopSyncReceipt.findUnique({ where: { organizationId_deviceId_operationId: key } });
        if (receipt) {
          if (receipt.userId !== actor.id || receipt.requestHash !== hash) {
            throw new ConflictException("OPERATION_ID_REUSED: operation identity does not match its original request");
          }
          return { ...(receipt.result as Prisma.JsonObject), replayed: true };
        }
        let version = 1;
        if (creating) {
          if (await tx.masterCategory.findUnique({ where: { id: command.entityId }, select: { id: true } })) {
            throw new ConflictException("ENTITY_ID_EXISTS: category identity is already used");
          }
        } else {
          const current = await tx.masterCategory.findFirst({ where: { id: command.entityId, organizationId: actor.organizationId } });
          if (!current) throw new ConflictException("CATEGORY_NOT_FOUND: category no longer exists in this organization");
          version = await categorySyncVersion(tx, actor.organizationId, command.entityId);
          if (version !== command.expectedVersion) throw new ConflictException("VERSION_CONFLICT: category changed; refresh and review the pending edit");
          if (command.payload.type !== current.type) throw new BadRequestException("Category type cannot be changed");
          version += 1;
        }
        const category = creating
          ? await this.categories.createInTransaction(tx, actor.organizationId, actor.id, command.payload, command.entityId)
          : await this.categories.updateInTransaction(tx, actor.organizationId, actor.id, command.entityId, command.payload);
        const recorded = await recordCategorySyncChange(tx, actor.organizationId, category, version, command.operationId);
        const result = { operationId: command.operationId, ...recorded };
        await tx.desktopSyncReceipt.create({ data: { ...key, userId: actor.id, requestHash: hash, result: result as unknown as Prisma.InputJsonValue } });
        return { ...result, replayed: false };
      }, { timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("CATEGORY_CONFLICT: category identity or name is already used");
      }
      throw error;
    }
  }

  async snapshot(actor: AuthUser, deviceId: string) {
    requireDesktopSync();
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, actor, ["masters.read"]);
      await this.device(tx, actor, deviceId);
      const clock = await tx.desktopSyncClock.findUniqueOrThrow({ where: { organizationId: actor.organizationId } });
      const [rows, versions] = await Promise.all([
        tx.masterCategory.findMany({ where: { organizationId: actor.organizationId }, orderBy: { id: "asc" } }),
        tx.desktopSyncCategoryVersion.findMany({ where: { organizationId: actor.organizationId } }),
      ]);
      const byId = new Map(versions.map((row) => [row.categoryId, row.version]));
      return { categories: rows.map((row) => categoryProjection(row, byId.get(row.id) ?? 1)), cursor: syncCursor(clock.epoch, clock.sequence), epoch: clock.epoch, schemaVersion: 1 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
  }

  async changes(actor: AuthUser, deviceId: string, cursor: string) {
    requireDesktopSync();
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, actor, ["masters.read"]);
      await this.device(tx, actor, deviceId);
      const clock = await tx.desktopSyncClock.findUniqueOrThrow({ where: { organizationId: actor.organizationId } });
      const after = parseSyncCursor(cursor, clock.epoch, clock.sequence);
      const rows = await tx.desktopSyncChange.findMany({
        where: { organizationId: actor.organizationId, sequence: { gt: after, lte: clock.sequence } },
        orderBy: { sequence: "asc" }, take: PAGE_SIZE + 1,
      });
      const page = rows.slice(0, PAGE_SIZE);
      // No retention/pruning in this pilot. Any hole is an explicit integrity/resnapshot error.
      if (page.some((row, index) => row.sequence !== after + BigInt(index + 1)) || (!page.length && after < clock.sequence)) {
        throw new ConflictException("RESNAPSHOT_REQUIRED: desktop change history is incomplete");
      }
      const next = page.at(-1)?.sequence ?? after;
      if (rows.length <= PAGE_SIZE && next < clock.sequence) {
        throw new ConflictException("RESNAPSHOT_REQUIRED: desktop change history is incomplete");
      }
      return {
        changes: page.map((row) => ({ kind: "upsert" as const, category: row.category, operationId: row.operationId, cursor: syncCursor(clock.epoch, row.sequence) })),
        cursor: syncCursor(clock.epoch, next), hasMore: rows.length > PAGE_SIZE,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
  }
}
