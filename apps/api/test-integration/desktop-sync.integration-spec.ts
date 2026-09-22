import { generateKeyPairSync, randomUUID } from "crypto";
import type { AuthUser } from "@bizovix/types";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { AuditLogService } from "../src/modules/audit-logs/audit-log.service";
import { MasterCategoriesService } from "../src/modules/master-categories/master-categories.service";
import { DesktopSyncService } from "../src/modules/desktop-sync/desktop-sync.service";
import type { DesktopCategoryCommandDto } from "../src/modules/desktop-sync/desktop-sync.dto";
import { lockDesktopSyncClock, recordCategorySyncChange } from "../src/modules/desktop-sync/desktop-sync-state";
import { assertIsolatedTestDatabase, createIdentityFixture } from "./fixtures";

/** Uses TEST_DATABASE_URL via fail-closed setup-env.ts. Never resets or seeds a database. */
describe("desktop category sync against isolated PostgreSQL", () => {
  let prisma: PrismaService;
  let categories: MasterCategoriesService;
  let service: DesktopSyncService;
  let actor: AuthUser;
  let other: AuthUser;
  let roleId: string;
  const deviceId = randomUUID();
  let baselineCursor: string;
  const envKeys = ["DESKTOP_SYNC_ENABLED", "DESKTOP_SYNC_PRIVATE_KEY_PEM", "DESKTOP_SYNC_ISSUER"] as const;
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("Isolated TEST_DATABASE_URL required");
    prisma = new PrismaService();
    await prisma.$connect();
    await assertIsolatedTestDatabase(prisma);
    const key = generateKeyPairSync("ed25519").privateKey;
    process.env.DESKTOP_SYNC_ENABLED = "true";
    process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM = key.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.DESKTOP_SYNC_ISSUER = "https://isolated-sync.example.invalid";
    const audit = new AuditLogService(prisma);
    categories = new MasterCategoriesService(prisma, audit);
    service = new DesktopSyncService(prisma, categories);
    const suffix = randomUUID().slice(0, 8);
    const one = await createIdentityFixture(prisma, `SYNC-A-${suffix}`, ["masters.read", "vendor.create", "vendor.update"]);
    const two = await createIdentityFixture(prisma, `SYNC-B-${suffix}`, ["masters.read", "vendor.create", "vendor.update"]);
    roleId = one.role.id;
    actor = { id: one.user.id, organizationId: one.organization.id, name: one.user.name, email: one.user.email, roleName: one.role.name, permissions: ["masters.read", "vendor.create", "vendor.update"] };
    other = { ...actor, id: two.user.id, organizationId: two.organization.id, name: two.user.name, email: two.user.email };
    await service.register(actor, { deviceId });
    baselineCursor = (await service.snapshot(actor, deviceId)).cursor;
  });

  afterAll(async () => {
    // The owning test runner disposes this isolated database; no broad data cleanup here.
    await prisma?.$disconnect();
    for (const key of envKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  function create(name: string): DesktopCategoryCommandDto {
    return { operationId: randomUUID(), deviceId, schemaVersion: 1, commandType: "masterCategory.create", entityId: randomUUID(), expectedVersion: null, payload: { type: "MATERIAL", name } };
  }

  it("commits domain, audit, receipt and feed once under concurrent identical retries", async () => {
    const command = create("Pilot materials");
    const replies = await Promise.all([service.execute(actor, command), service.execute(actor, command)]);
    expect(replies.map((reply) => reply.replayed).sort()).toEqual([false, true]);
    expect(await prisma.masterCategory.count({ where: { id: command.entityId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId: actor.organizationId, entityId: command.entityId } })).toBe(1);
    expect(await prisma.desktopSyncReceipt.count({ where: { organizationId: actor.organizationId, operationId: command.operationId } })).toBe(1);
    expect(await prisma.desktopSyncChange.count({ where: { organizationId: actor.organizationId, operationId: command.operationId } })).toBe(1);
    await expect(service.execute(actor, { ...command, payload: { ...command.payload, name: "Changed request" } })).rejects.toThrow("OPERATION_ID_REUSED");
    const snapshot = await service.snapshot(actor, deviceId);
    expect(snapshot.categories.find((row) => row.id === command.entityId)?.version).toBe(1);
  });

  it("retains business duplicate checks and rolls back receipt/feed on failure", async () => {
    const command = create("  PILOT MATERIALS  ");
    const before = await prisma.desktopSyncClock.findUniqueOrThrow({ where: { organizationId: actor.organizationId } });
    await expect(service.execute(actor, command)).rejects.toThrow("already exists");
    expect(await prisma.masterCategory.count({ where: { id: command.entityId } })).toBe(0);
    expect(await prisma.desktopSyncReceipt.count({ where: { operationId: command.operationId } })).toBe(0);
    expect((await prisma.desktopSyncClock.findUniqueOrThrow({ where: { organizationId: actor.organizationId } })).sequence).toBe(before.sequence);
  });

  it("rolls back a domain write when a failure occurs after audit insertion", async () => {
    class FailingAuditService extends AuditLogService {
      override async record(...args: Parameters<AuditLogService["record"]>): Promise<void> {
        await super.record(...args);
        throw new Error("Injected failure before command commit");
      }
    }
    const failingAudit = new FailingAuditService(prisma);
    const failing = new DesktopSyncService(prisma, new MasterCategoriesService(prisma, failingAudit));
    const command = create("Rolled back category");
    await expect(failing.execute(actor, command)).rejects.toThrow("Injected failure");
    expect(await prisma.masterCategory.count({ where: { id: command.entityId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { organizationId: actor.organizationId, entityId: command.entityId } })).toBe(0);
    expect(await prisma.desktopSyncReceipt.count({ where: { operationId: command.operationId } })).toBe(0);
    expect(await prisma.desktopSyncChange.count({ where: { operationId: command.operationId } })).toBe(0);
  });

  it("keeps a later writer behind the earlier transaction's commit", async () => {
    let release!: () => void;
    let locked!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const first = prisma.$transaction(async (tx) => {
      await lockDesktopSyncClock(tx, actor.organizationId);
      const category = await categories.createInTransaction(tx, actor.organizationId, actor.id, { type: "MATERIAL", name: "First committed category" });
      await recordCategorySyncChange(tx, actor.organizationId, category, 1);
      locked();
      await hold;
      return category;
    }, { timeout: 15_000 });
    await ready;
    let secondFinished = false;
    const second = categories.create(actor.organizationId, actor.id, { type: "MATERIAL", name: "Second committed category" })
      .then((result) => { secondFinished = true; return result; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(secondFinished).toBe(false);
    } finally {
      release();
    }
    const [earlier, later] = await Promise.all([first, second]);
    const changes = await prisma.desktopSyncChange.findMany({ where: { organizationId: actor.organizationId, categoryId: { in: [earlier.id, later.id] } }, orderBy: { sequence: "asc" } });
    expect(changes.map((row) => row.categoryId)).toEqual([earlier.id, later.id]);
    expect(changes[1]!.sequence).toBe(changes[0]!.sequence + 1n);
  });

  it("rejects a second stale edit and includes ordinary REST service writes in the feed", async () => {
    const command = create("Versioned category");
    await service.execute(actor, command);
    const update: DesktopCategoryCommandDto = { ...command, operationId: randomUUID(), commandType: "masterCategory.update", expectedVersion: 1, payload: { type: "MATERIAL", name: "Updated category" } };
    await service.execute(actor, update);
    await expect(service.execute(actor, { ...update, operationId: randomUUID(), payload: { ...update.payload, name: "Stale edit" } })).rejects.toThrow("VERSION_CONFLICT");
    const rest = await categories.create(actor.organizationId, actor.id, { type: "VENDOR", name: "REST category" });
    await categories.update(actor.organizationId, actor.id, rest.id, { type: "VENDOR", name: "REST category updated" });
    const changes = await service.changes(actor, deviceId, baselineCursor);
    expect(changes.hasMore).toBe(false);
    expect(changes.changes.filter((row) => (row.category as { id: string }).id === rest.id)).toHaveLength(2);
    expect((await service.snapshot(actor, deviceId)).categories.find((row) => row.id === rest.id)?.version).toBe(2);
  });

  it("rejects cross-tenant device reuse and rechecks permissions despite a stale AuthUser", async () => {
    await expect(service.register(other, { deviceId })).rejects.toThrow("another account");
    await expect(service.snapshot(other, deviceId)).rejects.toThrow("not registered");
    await expect(service.execute(other, create("Cross tenant"))).rejects.toThrow("not registered");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "vendor.create" } });
    await prisma.rolePermission.deleteMany({ where: { roleId, permissionId: permission.id } });
    try {
      await expect(service.execute(actor, create("Forbidden"))).rejects.toThrow("permission");
    } finally {
      await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
    }
  });

  it("rejects foreign epochs and reports a deliberately missing feed event", async () => {
    await expect(service.changes(actor, deviceId, `${randomUUID()}:0`)).rejects.toThrow("RESNAPSHOT_REQUIRED");
    // Corrupt only the isolated test organization's new sync metadata to prove fail-closed recovery.
    const latest = await prisma.desktopSyncChange.findFirstOrThrow({ where: { organizationId: actor.organizationId }, orderBy: { sequence: "desc" } });
    await prisma.desktopSyncChange.delete({ where: { organizationId_sequence: { organizationId: actor.organizationId, sequence: latest.sequence } } });
    await expect(service.changes(actor, deviceId, baselineCursor)).rejects.toThrow("RESNAPSHOT_REQUIRED");
  });
});
