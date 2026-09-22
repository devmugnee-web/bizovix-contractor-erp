import { generateKeyPairSync, randomUUID } from "crypto";
import type { AuthUser, Permission } from "@bizovix/types";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { AuditLogService } from "../src/modules/audit-logs/audit-log.service";
import { MasterCategoriesService } from "../src/modules/master-categories/master-categories.service";
import { UomsService } from "../src/modules/uoms/uoms.service";
import { PaymentTermsService } from "../src/modules/payment-terms/payment-terms.service";
import { OrganizationsService } from "../src/modules/organizations/organizations.service";
import { DesktopSyncService } from "../src/modules/desktop-sync/desktop-sync.service";
import { DesktopMasterSyncService } from "../src/modules/desktop-sync/desktop-master-sync.service";
import type { DesktopMasterCommandDto } from "../src/modules/desktop-sync/desktop-master-sync.dto";
import { assertIsolatedTestDatabase, createIdentityFixture } from "./fixtures";

/** Exact-target fixtures only; original business records and migrations are never reset. */
describe("desktop UOM/payment-term sync against isolated PostgreSQL", () => {
  let prisma: PrismaService;
  let uoms: UomsService;
  let terms: PaymentTermsService;
  let categories: DesktopSyncService;
  let service: DesktopMasterSyncService;
  let actor: AuthUser;
  let other: AuthUser;
  let roleId: string;
  let originalCategoryCursor: string;
  let legacyUomId: string;
  let legacyTermId: string;
  const deviceId = randomUUID();
  const entityTypes: Array<"uom" | "paymentTerm"> = ["uom", "paymentTerm"];
  const envKeys = ["DESKTOP_SYNC_ENABLED", "DESKTOP_SYNC_PRIVATE_KEY_PEM", "DESKTOP_SYNC_ISSUER"] as const;
  const previous = new Map(envKeys.map(key => [key, process.env[key]]));

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("Isolated TEST_DATABASE_URL required");
    prisma = new PrismaService();
    await prisma.$connect();
    await assertIsolatedTestDatabase(prisma);
    process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.DESKTOP_SYNC_ISSUER = "https://isolated-masters.example.invalid";
    const permissions: Permission[] = ["masters.read", "vendor.create", "vendor.update", "uom.manage", "payment_terms.manage"];
    const identity = await createIdentityFixture(prisma, `MASTER-SYNC-${randomUUID()}`, permissions);
    const second = await createIdentityFixture(prisma, `MASTER-OTHER-${randomUUID()}`, permissions);
    roleId = identity.role.id;
    actor = { id: identity.user.id, organizationId: identity.organization.id, name: identity.user.name, email: identity.user.email, roleName: identity.role.name, permissions };
    other = { ...actor, id: second.user.id, organizationId: second.organization.id, email: second.user.email };
    const audit = new AuditLogService(prisma);
    uoms = new UomsService(prisma, audit);
    terms = new PaymentTermsService(prisma, audit);
    categories = new DesktopSyncService(prisma, new MasterCategoriesService(prisma, audit));
    service = new DesktopMasterSyncService(prisma, categories, uoms, terms, new OrganizationsService(prisma));
    // Raw isolated fixtures represent records predating metadata installation.
    // Current web writers capture whenever migrations exist, even before enrollment.
    legacyUomId = (await prisma.unitOfMeasurement.create({ data: { organizationId: actor.organizationId, code: "LEGACY", name: "Existing unit", symbol: "L" } })).id;
    legacyTermId = (await prisma.paymentTerm.create({ data: { organizationId: actor.organizationId, name: "Existing term", days: 7, description: "Existing description" } })).id;
    expect(await prisma.desktopMasterSyncClock.count({ where: { organizationId: actor.organizationId } })).toBe(0);
    process.env.DESKTOP_SYNC_ENABLED = "true";
    await categories.register(actor, { deviceId });
    originalCategoryCursor = (await categories.snapshot(actor, deviceId)).cursor;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    for (const key of envKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  function create(entityType: "uom" | "paymentTerm"): DesktopMasterCommandDto {
    const suffix = randomUUID();
    return { operationId: randomUUID(), deviceId, schemaVersion: 1, entityType, commandType: `${entityType}.create`, entityId: randomUUID(), expectedVersion: null,
      payload: entityType === "uom" ? { code: `u-${suffix}`, name: `Unit ${suffix}`, symbol: "U" } : { name: `Term ${suffix}`, days: 30, description: "Keep this description" } };
  }

  it("initializes independent snapshots without changing old category cursors or legacy records", async () => {
    const unit = await service.snapshot(actor, deviceId, "uom");
    const term = await service.snapshot(actor, deviceId, "paymentTerm");
    expect(unit.records.find(row => row.id === legacyUomId)).toMatchObject({ code: "LEGACY", name: "Existing unit", symbol: "L", version: 1 });
    expect(term.records.find(row => row.id === legacyTermId)).toMatchObject({ days: 7, description: "Existing description", version: 1 });
    expect(unit.records.every(row => !("organizationId" in row))).toBe(true);
    expect(term.records.every(row => !("organizationId" in row))).toBe(true);
    expect(new Set([unit.epoch, term.epoch, originalCategoryCursor.split(":")[0]]).size).toBe(3);
    expect((await categories.snapshot(actor, deviceId)).cursor).toBe(originalCategoryCursor);
    expect(await prisma.desktopMasterSyncVersion.count({ where: { organizationId: actor.organizationId } })).toBe(0);
  });

  it.each(entityTypes)("commits %s mutation/audit/feed/receipt once and replays the original acknowledged result", async (entityType) => {
    const command = create(entityType);
    const results = await Promise.all([service.execute(actor, command), service.execute(actor, command)]);
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
    expect(results[0]!.record).toMatchObject({ id: command.entityId, version: 1 });
    expect(await prisma.auditLog.count({ where: { organizationId: actor.organizationId, entityId: command.entityId } })).toBe(1);
    expect(await prisma.desktopSyncReceipt.count({ where: { organizationId: actor.organizationId, operationId: command.operationId } })).toBe(1);
    expect(await prisma.desktopMasterSyncChange.count({ where: { organizationId: actor.organizationId, entityType, operationId: command.operationId } })).toBe(1);
    await expect(service.execute(actor, { ...command, payload: { ...command.payload, name: "Changed original operation" } })).rejects.toThrow("OPERATION_ID_REUSED");
    await service.execute(actor, { ...command, operationId: randomUUID(), commandType: `${entityType}.update`, expectedVersion: 1, payload: { ...command.payload, name: "Later accepted name" } });
    const replay = await service.execute(actor, command);
    expect(replay).toMatchObject({ replayed: true, record: { id: command.entityId, name: "name" in command.payload ? command.payload.name : undefined, version: 1 }, cursor: results[0]!.cursor });
    expect((await service.snapshot(actor, deviceId, entityType)).records.find(row => row.id === command.entityId)?.version).toBe(2);
  });

  it.each(entityTypes)("includes ordinary %s web writes, keeps immutable fields/defaults, and rejects a stale PC", async (entityType) => {
    const baseline = await service.snapshot(actor, deviceId, entityType);
    const command = create(entityType);
    await service.execute(actor, command);
    if (entityType === "uom") await uoms.update(actor.organizationId, actor.id, command.entityId, { code: "IGNORED-NEW-CODE", name: "Web unit edit" });
    else await terms.update(actor.organizationId, actor.id, command.entityId, { name: "Web term edit" });
    await expect(service.execute(actor, { ...command, operationId: randomUUID(), commandType: `${entityType}.update`, expectedVersion: 1 })).rejects.toThrow("VERSION_CONFLICT");
    const changes = await service.changes(actor, deviceId, entityType, baseline.cursor);
    expect(changes.changes).toHaveLength(2);
    expect(changes.hasMore).toBe(false);
    expect(changes.changes[1]!.operationId).toBeNull();
    expect(changes.changes[1]!.record).toMatchObject({ id: command.entityId, version: 2, ...(entityType === "uom" ? { code: "code" in command.payload ? command.payload.code.trim().toUpperCase() : "", symbol: "U" } : { days: 30, description: "Keep this description" }) });
    const accepted = await service.execute(actor, { ...command, operationId: randomUUID(), commandType: `${entityType}.update`, expectedVersion: 2, payload: { ...command.payload, name: "Reviewed replacement" } });
    expect(accepted.record.version).toBe(3);
  });

  it.each(entityTypes)("rolls back %s domain/audit/feed/version/receipt after an injected transactional failure", async (entityType) => {
    class FailingAudit extends AuditLogService {
      override async record(...args: Parameters<AuditLogService["record"]>): Promise<void> { await super.record(...args); throw new Error("Injected after audit"); }
    }
    const audit = new FailingAudit(prisma);
    const failing = new DesktopMasterSyncService(prisma, categories, new UomsService(prisma, audit), new PaymentTermsService(prisma, audit), new OrganizationsService(prisma));
    const command = create(entityType);
    const before = await service.snapshot(actor, deviceId, entityType);
    await expect(failing.execute(actor, command)).rejects.toThrow("Injected after audit");
    expect(await prisma.unitOfMeasurement.count({ where: { id: command.entityId } })).toBe(0);
    expect(await prisma.paymentTerm.count({ where: { id: command.entityId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: command.entityId } })).toBe(0);
    expect(await prisma.desktopSyncReceipt.count({ where: { operationId: command.operationId } })).toBe(0);
    expect(await prisma.desktopMasterSyncVersion.count({ where: { entityId: command.entityId } })).toBe(0);
    expect((await service.snapshot(actor, deviceId, entityType)).cursor).toBe(before.cursor);
  });

  it("retains original duplicates and category v1 receipts/feed independently of master writes", async () => {
    await expect(service.execute(actor, { ...create("uom"), payload: { code: " legacy ", name: "Duplicate unit" } })).rejects.toThrow("already exists");
    await expect(service.execute(actor, { ...create("paymentTerm"), payload: { name: " EXISTING TERM " } })).rejects.toThrow("already exists");
    expect((await categories.snapshot(actor, deviceId)).cursor).toBe(originalCategoryCursor);
    const command = { operationId: randomUUID(), deviceId, schemaVersion: 1 as const, commandType: "masterCategory.create" as const, entityId: randomUUID(), expectedVersion: null, payload: { type: "MATERIAL" as const, name: "Still category v1" } };
    await categories.execute(actor, command);
    expect((await categories.execute(actor, command)).replayed).toBe(true);
    const changes = await categories.changes(actor, deviceId, originalCategoryCursor);
    expect(changes.changes).toHaveLength(1);
    expect(changes.changes[0]!.category).toMatchObject({ id: command.entityId, version: 1 });
    await expect(service.execute(actor, { ...create("uom"), operationId: command.operationId })).rejects.toThrow("OPERATION_ID_REUSED");
  });

  it("rolls back the already-written feed and version when the final receipt insert fails", async () => {
    const command = create("uom");
    const before = await service.snapshot(actor, deviceId, "uom");
    class ReceiptCollisionUoms extends UomsService {
      override async createInTransaction(...args: Parameters<UomsService["createInTransaction"]>) {
        const record = await super.createInTransaction(...args);
        // Same transaction: force a real unique violation at the final receipt
        // write, after the command service has inserted its version and feed.
        await args[0].desktopSyncReceipt.create({ data: { organizationId: actor.organizationId, deviceId, operationId: command.operationId, userId: actor.id, requestHash: "injected-test-collision", result: {} } });
        return record;
      }
    }
    const failing = new DesktopMasterSyncService(prisma, categories, new ReceiptCollisionUoms(prisma, new AuditLogService(prisma)), terms, new OrganizationsService(prisma));
    await expect(failing.execute(actor, command)).rejects.toThrow("MASTER_CONFLICT");
    expect(await prisma.unitOfMeasurement.count({ where: { id: command.entityId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: command.entityId } })).toBe(0);
    expect(await prisma.desktopMasterSyncVersion.count({ where: { entityId: command.entityId } })).toBe(0);
    expect(await prisma.desktopMasterSyncChange.count({ where: { entityId: command.entityId } })).toBe(0);
    expect(await prisma.desktopSyncReceipt.count({ where: { operationId: command.operationId } })).toBe(0);
    expect((await service.snapshot(actor, deviceId, "uom")).cursor).toBe(before.cursor);
  });

  it("rechecks live permissions and device tenant while granting reads independently", async () => {
    await expect(service.snapshot(other, deviceId, "uom")).rejects.toThrow("not registered");
    await expect(service.execute(other, create("paymentTerm"))).rejects.toThrow("not registered");
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "uom.manage" } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId, permissionId: permission.id } } });
    try {
      await expect(service.execute(actor, create("uom"))).rejects.toThrow("permission");
      expect((await service.snapshot(actor, deviceId, "uom")).entityType).toBe("uom");
      const grant = (await categories.register(actor, { deviceId })).grant.payload;
      expect(grant.formatVersion).toBe(1);
      expect(grant.capabilities).toEqual(expect.arrayContaining(["uom.read", "paymentTerm.read", "paymentTerm.create", "paymentTerm.update"]));
      expect(grant.capabilities).not.toContain("uom.create");
    } finally { await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } }); }
  });

  it("rejects cross-stream/ahead cursors and a deliberately missing event without hiding a gap", async () => {
    const uom = await service.snapshot(actor, deviceId, "uom");
    const term = await service.snapshot(actor, deviceId, "paymentTerm");
    await expect(service.changes(actor, deviceId, "uom", term.cursor)).rejects.toThrow("RESNAPSHOT_REQUIRED");
    await expect(service.changes(actor, deviceId, "uom", `${uom.epoch}:999999`)).rejects.toThrow("RESNAPSHOT_REQUIRED");
    const command = create("paymentTerm");
    await service.execute(actor, command);
    await prisma.desktopMasterSyncChange.deleteMany({ where: { organizationId: actor.organizationId, entityType: "paymentTerm", operationId: command.operationId } });
    await expect(service.changes(actor, deviceId, "paymentTerm", term.cursor)).rejects.toThrow("RESNAPSHOT_REQUIRED");
  });
});
