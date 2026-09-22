import { randomUUID } from "crypto";
import type { OrganizationMaster, PaymentTerm, Prisma, UnitOfMeasurement } from "@bizovix/database";
import { syncCursor } from "./desktop-sync-state";
import { lockDesktopCaptureBoundary } from "./desktop-sync-capture";

export type DesktopMasterEntityType = "uom" | "paymentTerm" | "organizationMaster";
export type DesktopMasterRecord = UnitOfMeasurement | PaymentTerm | OrganizationMaster;

export function masterProjection(entityType: DesktopMasterEntityType, record: DesktopMasterRecord, version: number) {
  const identity = { id: record.id, version, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
  if (entityType === "organizationMaster") {
    const organization = record as OrganizationMaster;
    return { ...identity, shortName: organization.shortName, fullName: organization.fullName };
  }
  const named = record as UnitOfMeasurement | PaymentTerm;
  const common = { ...identity, name: named.name, isActive: named.isActive };
  if (entityType === "uom") {
    const uom = record as UnitOfMeasurement;
    return { ...common, code: uom.code, symbol: uom.symbol };
  }
  const term = record as PaymentTerm;
  return { ...common, days: term.days, description: term.description };
}

/** Every participating writer locks this stream before reading or writing its records. */
export async function lockDesktopMasterClock(tx: Prisma.TransactionClient, organizationId: string, entityType: DesktopMasterEntityType) {
  await lockDesktopCaptureBoundary(tx, organizationId);
  const epoch = randomUUID();
  await tx.$executeRaw`INSERT INTO desktop_master_sync_clocks ("organizationId", "entityType", epoch, sequence) VALUES (${organizationId}, ${entityType}, ${epoch}, 0) ON CONFLICT ("organizationId", "entityType") DO NOTHING`;
  await tx.$queryRaw`SELECT "organizationId" FROM desktop_master_sync_clocks WHERE "organizationId" = ${organizationId} AND "entityType" = ${entityType} FOR UPDATE`;
  return tx.desktopMasterSyncClock.findUniqueOrThrow({ where: { organizationId_entityType: { organizationId, entityType } } });
}

export async function desktopMasterVersion(tx: Prisma.TransactionClient, organizationId: string, entityType: DesktopMasterEntityType, entityId: string) {
  const row = await tx.desktopMasterSyncVersion.findUnique({ where: { organizationId_entityType_entityId: { organizationId, entityType, entityId } } });
  return row?.version ?? 1;
}

/** Domain write, audit, version, feed and receipt must share the caller's transaction. */
export async function recordDesktopMasterChange(tx: Prisma.TransactionClient, organizationId: string, entityType: DesktopMasterEntityType, record: DesktopMasterRecord, version: number, operationId?: string) {
  const key = { organizationId, entityType, entityId: record.id };
  await tx.desktopMasterSyncVersion.upsert({ where: { organizationId_entityType_entityId: key }, create: { ...key, version }, update: { version } });
  const clock = await tx.desktopMasterSyncClock.update({ where: { organizationId_entityType: { organizationId, entityType } }, data: { sequence: { increment: 1 } } });
  const projection = masterProjection(entityType, record, version);
  await tx.desktopMasterSyncChange.create({ data: { ...key, sequence: clock.sequence, operationId, record: projection as Prisma.InputJsonValue } });
  return { record: projection, cursor: syncCursor(clock.epoch, clock.sequence) };
}
