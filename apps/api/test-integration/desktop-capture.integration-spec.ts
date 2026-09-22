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
import { assertIsolatedTestDatabase, createIdentityFixture } from "./fixtures";

describe("metadata capture survives endpoint pause and cross-instance enrollment", () => {
  let prisma: PrismaService;
  let actor: AuthUser;
  let audit: AuditLogService;
  let categories: MasterCategoriesService;
  let uoms: UomsService;
  let terms: PaymentTermsService;
  let organizations: OrganizationsService;
  let access: DesktopSyncService;
  let masters: DesktopMasterSyncService;
  const deviceId = randomUUID();
  const envKeys = ["DESKTOP_SYNC_ENABLED", "DESKTOP_SYNC_PRIVATE_KEY_PEM", "DESKTOP_SYNC_ISSUER"] as const;
  const previous = new Map(envKeys.map(key => [key, process.env[key]]));
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL || !process.env.BIZOVIX_ISOLATED_DATABASE_NAME) throw new Error("Exact new isolated database required");
    prisma = new PrismaService();
    await prisma.$connect();
    await assertIsolatedTestDatabase(prisma);
    const permissions: Permission[] = ["masters.read", "vendor.create", "vendor.update", "uom.manage", "payment_terms.manage"];
    const fixture = await createIdentityFixture(prisma, `CAPTURE-${randomUUID()}`, permissions);
    actor = { id: fixture.user.id, organizationId: fixture.organization.id, email: fixture.user.email, name: fixture.user.name, roleName: fixture.role.name, permissions };
    audit = new AuditLogService(prisma);
    categories = new MasterCategoriesService(prisma, audit);
    uoms = new UomsService(prisma, audit);
    terms = new PaymentTermsService(prisma, audit);
    organizations = new OrganizationsService(prisma);
    access = new DesktopSyncService(prisma, categories);
    masters = new DesktopMasterSyncService(prisma, access, uoms, terms, organizations);
    process.env.DESKTOP_SYNC_ENABLED = "true";
    process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.DESKTOP_SYNC_ISSUER = "https://isolated-capture.example.invalid";
    await access.register(actor, { deviceId });
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    for (const key of envKeys) { const value = previous.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });

  it("captures paused web writes for every supported master and rejects pre-pause stale versions", async () => {
    const category = await categories.create(actor.organizationId, actor.id, { type: "MATERIAL", name: `Before-${randomUUID()}` });
    const uom = await uoms.create(actor.organizationId, actor.id, { code: `C-${randomUUID()}`, name: "Before unit" });
    const term = await terms.create(actor.organizationId, actor.id, { name: `Before term-${randomUUID()}`, days: 5 });
    const beforeCategory = await access.snapshot(actor, deviceId);
    const beforeUom = await masters.snapshot(actor, deviceId, "uom");
    const beforeTerm = await masters.snapshot(actor, deviceId, "paymentTerm");
    const beforeOrg = await masters.snapshot(actor, deviceId, "organizationMaster");
    process.env.DESKTOP_SYNC_ENABLED = "false";
    try {
      await expect(masters.snapshot(actor, deviceId, "organizationMaster")).rejects.toThrow("not enabled");
      await categories.update(actor.organizationId, actor.id, category.id, { type: "MATERIAL", name: "Web edit while endpoints paused" });
      await uoms.update(actor.organizationId, actor.id, uom.id, { code: uom.code, name: "Paused unit edit" });
      await terms.update(actor.organizationId, actor.id, term.id, { name: "Paused term edit", days: 15 });
      await organizations.create(actor.organizationId, { shortName: `PAUSED-${randomUUID()}`, fullName: "Paused organization create" });
    } finally { process.env.DESKTOP_SYNC_ENABLED = "true"; }
    expect((await access.changes(actor, deviceId, beforeCategory.cursor)).changes).toEqual([expect.objectContaining({ category: expect.objectContaining({ id: category.id, name: "Web edit while endpoints paused", version: 2 }) })]);
    expect((await masters.changes(actor, deviceId, "uom", beforeUom.cursor)).changes).toEqual([expect.objectContaining({ record: expect.objectContaining({ id: uom.id, name: "Paused unit edit", version: 2 }) })]);
    expect((await masters.changes(actor, deviceId, "paymentTerm", beforeTerm.cursor)).changes).toEqual([expect.objectContaining({ record: expect.objectContaining({ id: term.id, days: 15, version: 2 }) })]);
    expect((await masters.changes(actor, deviceId, "organizationMaster", beforeOrg.cursor)).changes).toHaveLength(1);
    await expect(access.execute(actor, { operationId: randomUUID(), deviceId, schemaVersion: 1, commandType: "masterCategory.update", entityId: category.id, expectedVersion: 1, payload: { type: "MATERIAL", name: "Stale PC overwrite" } })).rejects.toThrow("VERSION_CONFLICT");
    await expect(masters.execute(actor, { operationId: randomUUID(), deviceId, schemaVersion: 1, entityType: "uom", commandType: "uom.update", entityId: uom.id, expectedVersion: 1, payload: { code: uom.code, name: "Stale PC overwrite" } })).rejects.toThrow("VERSION_CONFLICT");
    await expect(masters.execute(actor, { operationId: randomUUID(), deviceId, schemaVersion: 1, entityType: "paymentTerm", commandType: "paymentTerm.update", entityId: term.id, expectedVersion: 1, payload: { name: "Stale PC overwrite", days: 5 } })).rejects.toThrow("VERSION_CONFLICT");
  });

  it("makes first enrollment wait for an already-running disabled writer transaction", async () => {
    const fixture = await createIdentityFixture(prisma, `FIRST-${randomUUID()}`, ["masters.read"]);
    const firstActor: AuthUser = { ...actor, id: fixture.user.id, organizationId: fixture.organization.id, email: fixture.user.email, permissions: ["masters.read"] };
    let release!: () => void;
    let entered!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { entered = resolve; });
    class PausingAudit extends AuditLogService {
      override async record(...args: Parameters<AuditLogService["record"]>): Promise<void> { await super.record(...args); entered(); await released; }
    }
    process.env.DESKTOP_SYNC_ENABLED = "false";
    const write = new MasterCategoriesService(prisma, new PausingAudit(prisma)).create(firstActor.organizationId, firstActor.id, { type: "MATERIAL", name: "First writer before enrollment" });
    let registration: ReturnType<DesktopSyncService["register"]> | undefined;
    try {
      await ready;
      process.env.DESKTOP_SYNC_ENABLED = "true";
      const firstDevice = randomUUID();
      registration = access.register(firstActor, { deviceId: firstDevice });
      // Inspect an actual blocked PostgreSQL advisory waiter in this exact test DB.
      let waiting = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory') AS waiting`;
        if (rows[0]?.waiting) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      expect(await prisma.desktopSyncDevice.count({ where: { id: firstDevice } })).toBe(0);
      release();
      const record = await write;
      await registration;
      const snapshot = await access.snapshot(firstActor, firstDevice);
      expect(snapshot.categories).toContainEqual(expect.objectContaining({ id: record.id, version: 1 }));
      expect(snapshot.cursor.endsWith(":1")).toBe(true);
    } finally {
      release();
      process.env.DESKTOP_SYNC_ENABLED = "true";
      await Promise.allSettled([write, ...(registration ? [registration] : [])]);
    }
  });
});
