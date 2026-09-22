import { randomUUID } from "crypto";
import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import type { MasterCategory, Prisma } from "@bizovix/database";
import { lockDesktopCaptureBoundary } from "./desktop-sync-capture";

export function desktopSyncEnabled(): boolean {
  return process.env.DESKTOP_SYNC_ENABLED === "true";
}

export function requireDesktopSync(): void {
  if (!desktopSyncEnabled()) throw new ServiceUnavailableException("Desktop sync is not enabled");
}

export interface SyncedCategory {
  id: string;
  type: MasterCategory["type"];
  name: string;
  description: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function categoryProjection(category: MasterCategory, version: number): SyncedCategory {
  return {
    id: category.id, type: category.type, name: category.name,
    description: category.description, isActive: category.isActive,
    version, createdAt: category.createdAt.toISOString(), updatedAt: category.updatedAt.toISOString(),
  };
}

export function syncCursor(epoch: string, sequence: bigint): string {
  return `${epoch}:${sequence}`;
}

export function parseSyncCursor(cursor: string, epoch: string, current: bigint): bigint {
  const match = /^([0-9a-f-]{36}):(0|[1-9][0-9]{0,18})$/i.exec(cursor);
  if (!match || match[1] !== epoch) {
    throw new ConflictException("RESNAPSHOT_REQUIRED: sync cursor is invalid or belongs to another dataset epoch");
  }
  const sequence = BigInt(match[2]!);
  if (sequence > current) {
    throw new ConflictException("RESNAPSHOT_REQUIRED: sync cursor is ahead of the cloud dataset");
  }
  return sequence;
}

/** All participating category writers acquire this lock before domain reads/writes. */
export async function lockDesktopSyncClock(tx: Prisma.TransactionClient, organizationId: string) {
  await lockDesktopCaptureBoundary(tx, organizationId);
  const epoch = randomUUID();
  await tx.$executeRaw`INSERT INTO desktop_sync_clocks ("organizationId", epoch, sequence) VALUES (${organizationId}, ${epoch}, 0) ON CONFLICT ("organizationId") DO NOTHING`;
  await tx.$queryRaw`SELECT "organizationId" FROM desktop_sync_clocks WHERE "organizationId" = ${organizationId} FOR UPDATE`;
  return tx.desktopSyncClock.findUniqueOrThrow({ where: { organizationId } });
}

export async function categorySyncVersion(tx: Prisma.TransactionClient, organizationId: string, categoryId: string): Promise<number> {
  const metadata = await tx.desktopSyncCategoryVersion.findUnique({
    where: { organizationId_categoryId: { organizationId, categoryId } },
  });
  return metadata?.version ?? 1;
}

/** Caller owns the clock lock and the transaction encompassing domain+audit+receipt. */
export async function recordCategorySyncChange(
  tx: Prisma.TransactionClient, organizationId: string, category: MasterCategory,
  version: number, operationId?: string,
) {
  await tx.desktopSyncCategoryVersion.upsert({
    where: { organizationId_categoryId: { organizationId, categoryId: category.id } },
    create: { organizationId, categoryId: category.id, version }, update: { version },
  });
  const clock = await tx.desktopSyncClock.update({ where: { organizationId }, data: { sequence: { increment: 1 } } });
  const projection = categoryProjection(category, version);
  await tx.desktopSyncChange.create({ data: {
    organizationId, sequence: clock.sequence, categoryId: category.id,
    operationId, category: projection as unknown as Prisma.InputJsonValue,
  } });
  return { category: projection, cursor: syncCursor(clock.epoch, clock.sequence) };
}
