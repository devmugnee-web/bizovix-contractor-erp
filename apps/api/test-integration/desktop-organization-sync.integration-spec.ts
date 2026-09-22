import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { generateKeyPairSync, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import request from "supertest";
import type { AuthUser } from "@bizovix/types";
import { AppModule } from "../src/app.module";
import { validationExceptionFactory } from "../src/common/utils/validation-exception-factory";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { AuditLogService } from "../src/modules/audit-logs/audit-log.service";
import { OrganizationsService } from "../src/modules/organizations/organizations.service";
import { TendersService } from "../src/modules/tenders/tenders.service";
import { UomsService } from "../src/modules/uoms/uoms.service";
import { PaymentTermsService } from "../src/modules/payment-terms/payment-terms.service";
import { DesktopSyncService } from "../src/modules/desktop-sync/desktop-sync.service";
import { DesktopMasterSyncService } from "../src/modules/desktop-sync/desktop-master-sync.service";
import type { DesktopMasterCommandDto } from "../src/modules/desktop-sync/desktop-master-sync.dto";
import { assertIsolatedTestDatabase, createIdentityFixture } from "./fixtures";

/** Additive fixtures in the runner's exact new database; no resets or demo seeding. */
describe("desktop Organizations/Clients create-only sync", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let organizations: OrganizationsService;
  let tenders: TendersService;
  let access: DesktopSyncService;
  let sync: DesktopMasterSyncService;
  let actor: AuthUser;
  let other: AuthUser;
  let roleId: string;
  let token: string;
  const deviceId = randomUUID();
  const envKeys = ["DESKTOP_SYNC_ENABLED", "DESKTOP_SYNC_PRIVATE_KEY_PEM", "DESKTOP_SYNC_ISSUER"] as const;
  const previous = new Map(envKeys.map(key => [key, process.env[key]]));
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const command = (shortName = `ORG-${randomUUID()}`): DesktopMasterCommandDto => ({ operationId: randomUUID(), deviceId, schemaVersion: 1, entityType: "organizationMaster", commandType: "organizationMaster.create", entityId: randomUUID(), expectedVersion: null, payload: { shortName, fullName: `Full ${shortName}` } });

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL || !process.env.BIZOVIX_ISOLATED_DATABASE_NAME) throw new Error("Exact new isolated database required");
    process.env.DESKTOP_SYNC_ENABLED = "true";
    process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.DESKTOP_SYNC_ISSUER = "https://isolated-organization-sync.example.invalid";
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }));
    await app.init();
    prisma = app.get(PrismaService);
    await assertIsolatedTestDatabase(prisma);
    organizations = app.get(OrganizationsService);
    tenders = app.get(TendersService);
    access = app.get(DesktopSyncService);
    sync = app.get(DesktopMasterSyncService);
    const identity = await createIdentityFixture(prisma, `ORG-SYNC-${randomUUID()}`, []);
    const second = await createIdentityFixture(prisma, `ORG-OTHER-${randomUUID()}`, []);
    roleId = identity.role.id;
    actor = { id: identity.user.id, organizationId: identity.organization.id, email: identity.user.email, name: identity.user.name, roleName: identity.role.name, permissions: [] };
    other = { ...actor, id: second.user.id, organizationId: second.organization.id };
    // Existing catalog fixture before first enrollment, for exact typeahead caps.
    await prisma.organizationMaster.createMany({ data: Array.from({ length: 105 }, (_, index) => ({ organizationId: actor.organizationId, shortName: `LOOK-${String(index).padStart(3, "0")}`, fullName: `Lookup ${index}` })) });
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email: identity.user.email, password: identity.password }).expect(201);
    token = login.body.data.accessToken as string;
    await access.register(actor, { deviceId });
  });

  afterAll(async () => {
    await app?.close();
    for (const key of envKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it("preserves JWT-only organization read/create while keeping other master and paginated permissions", async () => {
    const grant = (await access.register(actor, { deviceId })).grant.payload;
    expect(grant.capabilities).toEqual(["organizationMaster.read", "organizationMaster.create"]);
    const body = command();
    const created = await request(app.getHttpServer()).post("/api/v1/desktop-sync/masters/commands").set(auth()).send(body).expect(201);
    expect(created.body.data.record).toMatchObject({ id: body.entityId, ...body.payload, version: 1 });
    expect(Object.keys(created.body.data.record).sort()).toEqual(["createdAt", "fullName", "id", "shortName", "updatedAt", "version"]);
    const coldStart = performance.now();
    const snapshot = await request(app.getHttpServer()).get(`/api/v1/desktop-sync/masters/snapshot?deviceId=${deviceId}&entityType=organizationMaster`).set(auth()).expect(200);
    const queryIndex = snapshot.body.data.queryIndex as { formatVersion: number; orderedIds: string[]; caseMappings: Array<[string, string]> };
    const elapsedMs = Math.round(performance.now() - coldStart);
    const metricDirectory = path.resolve(__dirname, "../../../.temp");
    await mkdir(metricDirectory, { recursive: true });
    await writeFile(path.join(metricDirectory, `${process.env.BIZOVIX_ISOLATED_DATABASE_NAME}-organization-query-policy-metric.json`), JSON.stringify({ database: process.env.BIZOVIX_ISOLATED_DATABASE_NAME, firstSnapshotHttpMs: elapsedMs, caseMappings: queryIndex.caseMappings.length, orderedIds: queryIndex.orderedIds.length, context: "First organization snapshot in a new Nest service instance, including complete scalar map generation; not a production performance benchmark." }, null, 2));
    expect(queryIndex.formatVersion).toBe(1);
    expect(queryIndex.orderedIds.slice(0, 100)).toEqual((await organizations.search(actor.organizationId)).map(row => row.id));
    const mappings = new Map(queryIndex.caseMappings);
    for (const value of ["İstanbul", "STRAẞE", "Σίσυφος", "বাংলা", "A😀B", "\u{10400}"]) {
      const result = await prisma.$queryRaw<Array<{ lower: string }>>`SELECT lower(${value}) AS lower`;
      expect([...value].map(character => mappings.get(character) ?? character).join("")).toBe(result[0]!.lower);
    }
    await request(app.getHttpServer()).get(`/api/v1/desktop-sync/masters/snapshot?deviceId=${deviceId}&entityType=uom`).set(auth()).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/desktop-sync/masters/snapshot?deviceId=${deviceId}&entityType=paymentTerm`).set(auth()).expect(403);
    await request(app.getHttpServer()).get("/api/v1/organizations/all").set(auth()).expect(403);
    await request(app.getHttpServer()).post("/api/v1/organizations").set(auth()).send({ shortName: `REST-${randomUUID()}`, fullName: "JWT-only creation" }).expect(201);
  });

  it("retains typeahead array/minimum/caps and the separate paginated HTTP default", async () => {
    const server = app.getHttpServer();
    expect((await request(server).get("/api/v1/organizations?search=L").set(auth()).expect(200)).body.data).toEqual([]);
    expect((await request(server).get("/api/v1/organizations?search=%20look%20").set(auth()).expect(200)).body.data).toHaveLength(20);
    expect((await request(server).get("/api/v1/organizations").set(auth()).expect(200)).body.data).toHaveLength(100);
    const permission = await prisma.permission.upsert({ where: { key: "masters.read" }, update: {}, create: { key: "masters.read", group: "masters" } });
    await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
    try {
      const paginated = await request(server).get("/api/v1/organizations/all?search=LOOK").set(auth()).expect(200);
      expect(paginated.body.data).toHaveLength(8);
      expect(paginated.body.meta).toMatchObject({ page: 1, limit: 8, total: 105 });
      expect((await access.register(actor, { deviceId })).grant.payload.capabilities).toContain("organizationMaster.list");
    } finally { await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId, permissionId: permission.id } } }); }
  });

  it("commits a stable create once, preserves exact names, and never merges a duplicate identity", async () => {
    const body = command(` Mixed-${randomUUID()} `);
    const results = await Promise.all([sync.execute(actor, body), sync.execute(actor, body)]);
    expect(results.map(row => row.replayed).sort()).toEqual([false, true]);
    expect(results[0]!.record).toMatchObject({ id: body.entityId, ...body.payload, version: 1 });
    expect(await prisma.desktopSyncReceipt.count({ where: { operationId: body.operationId } })).toBe(1);
    expect(await prisma.desktopMasterSyncChange.count({ where: { operationId: body.operationId } })).toBe(1);
    await expect(sync.execute(actor, { ...body, payload: { shortName: "changed", fullName: "changed" } })).rejects.toThrow("OPERATION_ID_REUSED");
    const duplicate = { ...body, operationId: randomUUID(), entityId: randomUUID() };
    await expect(sync.execute(actor, duplicate)).rejects.toThrow("MASTER_CONFLICT");
    expect(await prisma.organizationMaster.count({ where: { id: duplicate.entityId } })).toBe(0);
    expect(await prisma.desktopSyncReceipt.count({ where: { operationId: duplicate.operationId } })).toBe(0);
    await expect(sync.execute(actor, { ...body, operationId: randomUUID() })).rejects.toThrow("ENTITY_ID_EXISTS");
  });

  it("preserves case-sensitive short-name uniqueness and original whitespace acceptance", async () => {
    const name = `Case-${randomUUID()}`;
    const upper = await sync.execute(actor, command(name.toUpperCase()));
    const lower = await sync.execute(actor, command(name.toLowerCase()));
    expect(upper.record.id).not.toBe(lower.record.id);
    const spaces = { ...command(), payload: { shortName: "  ", fullName: "   " } };
    const accepted = await request(app.getHttpServer()).post("/api/v1/desktop-sync/masters/commands").set(auth()).send(spaces).expect(201);
    expect(accepted.body.data.record).toMatchObject(spaces.payload);
    await request(app.getHttpServer()).post("/api/v1/desktop-sync/masters/commands").set(auth()).send({ ...command(), commandType: "organizationMaster.update", expectedVersion: 1 }).expect(400);
  });

  it("publishes ordinary organization creates without advancing the category stream", async () => {
    const before = await sync.snapshot(actor, deviceId, "organizationMaster");
    const categoryClock = await prisma.desktopSyncClock.findUniqueOrThrow({ where: { organizationId: actor.organizationId } });
    const record = await organizations.create(actor.organizationId, { shortName: `WEB-${randomUUID()}`, fullName: "Original web writer" });
    const changes = await sync.changes(actor, deviceId, "organizationMaster", before.cursor);
    expect(changes.changes).toHaveLength(1);
    expect(changes.changes[0]).toMatchObject({ operationId: null, record: { id: record.id, shortName: record.shortName, version: 1 } });
    expect(await prisma.desktopSyncClock.findUniqueOrThrow({ where: { organizationId: actor.organizationId } })).toEqual(categoryClock);
  });

  it("captures tender implicit creates and preserves reuse and ambiguity rules", async () => {
    const name = `TenderOrg-${randomUUID()}`;
    const before = await sync.snapshot(actor, deviceId, "organizationMaster");
    const tender = await tenders.create(actor.organizationId, actor.id, { egpTenderId: `ORG-${randomUUID()}`, workName: "Implicit organization", noticeOrganization: ` ${name} ` });
    expect(tender.organizationMaster).toMatchObject({ shortName: name, fullName: name });
    let changes = await sync.changes(actor, deviceId, "organizationMaster", before.cursor);
    expect(changes.changes).toHaveLength(1);
    const afterCreate = changes.cursor;
    await tenders.update(actor.organizationId, actor.id, tender.id, { noticeOrganization: name.toLowerCase() });
    expect((await sync.changes(actor, deviceId, "organizationMaster", afterCreate)).changes).toHaveLength(0);
    await tenders.update(actor.organizationId, actor.id, tender.id, { noticeOrganization: `New-${name}` });
    changes = await sync.changes(actor, deviceId, "organizationMaster", afterCreate);
    expect(changes.changes).toHaveLength(1);
    expect(changes.changes[0]!.record).toMatchObject({ shortName: `New-${name}`, version: 1 });
    const ambiguous = `Ambiguous-${randomUUID()}`;
    await organizations.create(actor.organizationId, { shortName: ambiguous.toUpperCase(), fullName: "Upper" });
    await organizations.create(actor.organizationId, { shortName: ambiguous.toLowerCase(), fullName: "Lower" });
    await expect(tenders.update(actor.organizationId, actor.id, tender.id, { noticeOrganization: ambiguous })).rejects.toThrow("Multiple organizations match");
  });

  it("rolls back an indirect organization and event when the parent tender transaction fails", async () => {
    class FailingAudit extends AuditLogService {
      override async record(...args: Parameters<AuditLogService["record"]>): Promise<void> { await super.record(...args); throw new Error("Injected tender audit failure"); }
    }
    const failing = new TendersService(prisma, new FailingAudit(prisma));
    const before = await sync.snapshot(actor, deviceId, "organizationMaster");
    const name = `Rollback-${randomUUID()}`;
    const tenderId = `FAIL-${randomUUID()}`;
    await expect(failing.create(actor.organizationId, actor.id, { egpTenderId: tenderId, workName: "Rollback", noticeOrganization: name })).rejects.toThrow("Injected tender audit failure");
    expect(await prisma.organizationMaster.count({ where: { organizationId: actor.organizationId, shortName: name } })).toBe(0);
    expect(await prisma.tender.count({ where: { organizationId: actor.organizationId, egpTenderId: tenderId } })).toBe(0);
    expect((await sync.snapshot(actor, deviceId, "organizationMaster")).cursor).toBe(before.cursor);
  });

  it("rolls back organization, version and event after a late receipt uniqueness failure", async () => {
    const body = command();
    class CollidingOrganizations extends OrganizationsService {
      override async createInTransaction(...args: Parameters<OrganizationsService["createInTransaction"]>) {
        const row = await super.createInTransaction(...args);
        await args[0].desktopSyncReceipt.create({ data: { organizationId: actor.organizationId, deviceId, operationId: body.operationId, userId: actor.id, requestHash: "test-collision", result: {} } });
        return row;
      }
    }
    const failing = new DesktopMasterSyncService(prisma, access, app.get(UomsService), app.get(PaymentTermsService), new CollidingOrganizations(prisma));
    const before = await sync.snapshot(actor, deviceId, "organizationMaster");
    await expect(failing.execute(actor, body)).rejects.toThrow("MASTER_CONFLICT");
    expect(await prisma.organizationMaster.count({ where: { id: body.entityId } })).toBe(0);
    expect(await prisma.desktopMasterSyncVersion.count({ where: { entityId: body.entityId } })).toBe(0);
    expect(await prisma.desktopMasterSyncChange.count({ where: { entityId: body.entityId } })).toBe(0);
    expect(await prisma.desktopSyncReceipt.count({ where: { operationId: body.operationId } })).toBe(0);
    expect((await sync.snapshot(actor, deviceId, "organizationMaster")).cursor).toBe(before.cursor);
  });

  it("rechecks device ownership and active membership despite JWT-scoped organization capability", async () => {
    await expect(sync.snapshot(other, deviceId, "organizationMaster")).rejects.toThrow("not registered");
    await expect(sync.execute(other, command())).rejects.toThrow("not registered");
    await prisma.user.update({ where: { id: actor.id }, data: { isActive: false } });
    try { await expect(sync.execute(actor, command())).rejects.toThrow("Active organization membership"); }
    finally { await prisma.user.update({ where: { id: actor.id }, data: { isActive: true } }); }
  });
});
