import { generateKeyPairSync, randomUUID, verify } from "crypto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { AuthUser } from "@bizovix/types";
import { canonicalJson, createDesktopOfflineGrant } from "./desktop-offline-grant";
import { parseSyncCursor } from "./desktop-sync-state";
import { DesktopSyncService } from "./desktop-sync.service";
import { DesktopCategoryCommandDto } from "./desktop-sync.dto";
import { MasterCategoriesService } from "../master-categories/master-categories.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditLogService } from "../audit-logs/audit-log.service";

const user: AuthUser = {
  id: "user-a", organizationId: "org-a", email: "test@example.invalid", name: "Test",
  roleName: "Test role", permissions: ["masters.read", "vendor.create", "vendor.update"],
};

describe("desktop sync safety boundaries", () => {
  const keys = generateKeyPairSync("ed25519");
  const previous = {
    enabled: process.env.DESKTOP_SYNC_ENABLED, pem: process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM,
    issuer: process.env.DESKTOP_SYNC_ISSUER, hours: process.env.DESKTOP_SYNC_OFFLINE_HOURS,
  };
  beforeEach(() => {
    process.env.DESKTOP_SYNC_ENABLED = "true";
    process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.DESKTOP_SYNC_ISSUER = "https://pilot.example.invalid";
    process.env.DESKTOP_SYNC_OFFLINE_HOURS = "24";
  });
  afterAll(() => {
    for (const [name, value] of Object.entries({ DESKTOP_SYNC_ENABLED: previous.enabled, DESKTOP_SYNC_PRIVATE_KEY_PEM: previous.pem, DESKTOP_SYNC_ISSUER: previous.issuer, DESKTOP_SYNC_OFFLINE_HOURS: previous.hours })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });

  it("signs a scoped, expiring Ed25519 grant and detects changed identity", () => {
    const now = new Date("2026-09-21T00:00:00.000Z");
    const grant = createDesktopOfflineGrant(user, randomUUID(), now);
    expect(verify(null, Buffer.from(canonicalJson(grant.payload)), keys.publicKey, Buffer.from(grant.signature, "base64url"))).toBe(true);
    expect(grant.payload.expiresAt).toBe("2026-09-22T00:00:00.000Z");
    expect(grant.payload.capabilities).toEqual(["organizationMaster.read", "organizationMaster.create", "organizationMaster.list", "masterCategory.create", "masterCategory.update", "uom.read", "paymentTerm.read"]);
    expect(verify(null, Buffer.from(canonicalJson({ ...grant.payload, organizationId: "other-org" })), keys.publicKey, Buffer.from(grant.signature, "base64url"))).toBe(false);
  });

  it("issues no category capabilities without read permission", () => {
    expect(createDesktopOfflineGrant({ ...user, permissions: ["vendor.create"] }, randomUUID()).payload.capabilities).toEqual(["organizationMaster.read", "organizationMaster.create"]);
  });

  it("fails closed without a signing key or with an excessive offline window", () => {
    delete process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM;
    expect(() => createDesktopOfflineGrant(user, randomUUID())).toThrow("not configured");
    process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.DESKTOP_SYNC_OFFLINE_HOURS = "9999";
    expect(() => createDesktopOfflineGrant(user, randomUUID())).toThrow("not configured");
  });

  it("canonicalizes reordered payload keys without changing array order", () => {
    expect(canonicalJson({ z: [2, 1], a: { y: null, x: true } })).toBe('{"a":{"x":true,"y":null},"z":[2,1]}');
  });

  it("rejects an injected tenant field and an array instead of a command payload", async () => {
    const input = { operationId: randomUUID(), deviceId: randomUUID(), schemaVersion: 1, commandType: "masterCategory.create", entityId: randomUUID(), expectedVersion: null, payload: { type: "MATERIAL", name: "Valid" } };
    const validateCommand = (value: unknown) => validate(plainToInstance(DesktopCategoryCommandDto, value), { whitelist: true, forbidNonWhitelisted: true });
    expect(await validateCommand(input)).toEqual([]);
    expect((await validateCommand({ ...input, organizationId: "other-org" })).some((error) => error.property === "organizationId")).toBe(true);
    expect((await validateCommand({ ...input, payload: [] })).some((error) => error.property === "payload")).toBe(true);
  });

  it("rejects a cursor from another epoch, ahead cursor and malformed sequence", () => {
    const epoch = randomUUID();
    expect(parseSyncCursor(`${epoch}:2`, epoch, 3n)).toBe(2n);
    expect(() => parseSyncCursor(`${randomUUID()}:0`, epoch, 3n)).toThrow("RESNAPSHOT_REQUIRED");
    expect(() => parseSyncCursor(`${epoch}:4`, epoch, 3n)).toThrow("RESNAPSHOT_REQUIRED");
    expect(() => parseSyncCursor(`${epoch}:-1`, epoch, 3n)).toThrow("RESNAPSHOT_REQUIRED");
  });

  it("touches no sync tables when the endpoint feature is disabled", async () => {
    delete process.env.DESKTOP_SYNC_ENABLED;
    const prisma = { $transaction: jest.fn() };
    const service = new DesktopSyncService(prisma as unknown as PrismaService, {} as MasterCategoriesService);
    await expect(service.register(user, { deviceId: randomUUID() })).rejects.toThrow("not enabled");
    await expect(service.register(user, { deviceId: randomUUID() })).rejects.toMatchObject({ status: 503 });
    await expect(service.snapshot(user, randomUUID())).rejects.toThrow("not enabled");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("preserves normal category creation on an unmigrated database without querying missing sync tables", async () => {
    delete process.env.DESKTOP_SYNC_ENABLED;
    const category = { id: "existing-id", name: "Materials" };
    const prisma = { masterCategory: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(category) }, $transaction: jest.fn(), $executeRaw: jest.fn(), $queryRaw: jest.fn().mockResolvedValue([]) };
    prisma.$transaction.mockImplementation(async (body: (tx: unknown) => Promise<unknown>) => body(prisma));
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new MasterCategoriesService(prisma as unknown as PrismaService, audit as unknown as AuditLogService);
    await expect(service.create("org-a", "user-a", { type: "MATERIAL", name: "  Materials  " })).resolves.toBe(category);
    expect(prisma.masterCategory.create).toHaveBeenCalledWith({ data: { organizationId: "org-a", type: "MATERIAL", name: "Materials", description: undefined, isActive: true } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.calls[0]![0].join("")).toContain("FROM pg_class");
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
