import "reflect-metadata";
import { generateKeyPairSync, randomUUID } from "crypto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { AuthUser } from "@bizovix/types";
import { DesktopMasterCommandDto } from "./desktop-master-sync.dto";
import { createDesktopOfflineGrant } from "./desktop-offline-grant";
import { DesktopMasterSyncService } from "./desktop-master-sync.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { DesktopSyncService } from "./desktop-sync.service";
import type { UomsService } from "../uoms/uoms.service";
import type { PaymentTermsService } from "../payment-terms/payment-terms.service";
import type { OrganizationsService } from "../organizations/organizations.service";

describe("desktop master protocol boundaries", () => {
  const envKeys = ["DESKTOP_SYNC_ENABLED", "DESKTOP_SYNC_PRIVATE_KEY_PEM", "DESKTOP_SYNC_ISSUER", "DESKTOP_SYNC_OFFLINE_HOURS"] as const;
  const previous = new Map(envKeys.map(key => [key, process.env[key]]));
  const user: AuthUser = { id: "user", organizationId: "org", name: "Test", email: "test@example.invalid", roleName: "Test", permissions: ["masters.read", "uom.manage"] };
  beforeEach(() => {
    process.env.DESKTOP_SYNC_ENABLED = "true";
    process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.DESKTOP_SYNC_ISSUER = "https://master-sync.example.invalid";
    process.env.DESKTOP_SYNC_OFFLINE_HOURS = "24";
  });
  afterAll(() => {
    for (const key of envKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const validateCommand = (value: unknown) => validate(plainToInstance(DesktopMasterCommandDto, value), { whitelist: true, forbidNonWhitelisted: true });
  const command = { operationId: randomUUID(), deviceId: randomUUID(), schemaVersion: 1, entityType: "uom", commandType: "uom.create", entityId: randomUUID(), expectedVersion: null, payload: { code: "KG", name: "Kilogram" } };

  it("retains signed grant format1 and applies each master permission independently", () => {
    const organization = ["organizationMaster.read", "organizationMaster.create"];
    expect(createDesktopOfflineGrant(user, randomUUID()).payload).toMatchObject({ formatVersion: 1, capabilities: [...organization, "organizationMaster.list", "uom.read", "paymentTerm.read", "uom.create", "uom.update"] });
    expect(createDesktopOfflineGrant({ ...user, permissions: ["masters.read", "payment_terms.manage"] }, randomUUID()).payload.capabilities).toEqual([...organization, "organizationMaster.list", "uom.read", "paymentTerm.read", "paymentTerm.create", "paymentTerm.update"]);
    expect(createDesktopOfflineGrant({ ...user, permissions: ["uom.manage", "payment_terms.manage"] }, randomUUID()).payload.capabilities).toEqual(organization);
  });

  it("uses the original nested DTO for each entity and rejects injected fields", async () => {
    expect(await validateCommand(command)).toEqual([]);
    const term = { ...command, entityType: "paymentTerm", commandType: "paymentTerm.create", payload: { name: "Net30", days: 30 } };
    expect(await validateCommand(term)).toEqual([]);
    expect(await validateCommand({ ...command, payload: { name: "Missing code" } })).not.toEqual([]);
    expect(await validateCommand({ ...term, payload: { name: "Invalid", days: -1 } })).not.toEqual([]);
    expect(await validateCommand({ ...command, organizationId: "another" })).not.toEqual([]);
    expect(await validateCommand({ ...command, payload: { ...command.payload, organizationId: "another" } })).not.toEqual([]);
    expect(await validateCommand({ ...term, payload: { ...term.payload, code: "UOMONLY" } })).not.toEqual([]);
    expect(await validateCommand({ ...command, payload: [] })).not.toEqual([]);
  });

  it("rejects mismatched command/entity and unsupported schema before querying a database", async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new DesktopMasterSyncService(prisma as unknown as PrismaService, {} as DesktopSyncService, {} as UomsService, {} as PaymentTermsService, {} as OrganizationsService);
    await expect(service.execute(user, { ...command, commandType: "paymentTerm.create" } as DesktopMasterCommandDto)).rejects.toThrow("Unsupported");
    await expect(service.execute(user, { ...command, schemaVersion: 2 } as unknown as DesktopMasterCommandDto)).rejects.toThrow("Unsupported");
    await expect(service.execute(user, { ...command, payload: { code: "KG", name: "   " } } as DesktopMasterCommandDto)).rejects.toThrow("non-whitespace");
    await expect(service.execute(user, { ...command, entityType: "paymentTerm", commandType: "paymentTerm.create", payload: { name: "Overflow", days: 2_147_483_648 } } as DesktopMasterCommandDto)).rejects.toThrow("database integer");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    delete process.env.DESKTOP_SYNC_ENABLED;
    await expect(service.snapshot(user, command.deviceId, "uom")).rejects.toThrow("not enabled");
    await expect(service.changes(user, command.deviceId, "paymentTerm", "invalid")).rejects.toThrow("not enabled");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("preserves exact organization strings and supports only the existing create contract", async () => {
    const organization = { ...command, entityType: "organizationMaster", commandType: "organizationMaster.create", payload: { shortName: " Mixed Case ", fullName: " Full Name " } };
    expect(await validateCommand(organization)).toEqual([]);
    expect(await validateCommand({ ...organization, payload: { shortName: " ", fullName: " " } })).toEqual([]);
    expect(await validateCommand({ ...organization, payload: { shortName: "☑️".repeat(50), fullName: "☑️".repeat(200) } })).toEqual([]);
    expect(await validateCommand({ ...organization, payload: { shortName: "☑️".repeat(51), fullName: "Valid" } })).not.toEqual([]);
    expect(await validateCommand({ ...organization, commandType: "organizationMaster.update" })).not.toEqual([]);
    expect(await validateCommand({ ...organization, payload: { shortName: "x".repeat(51), fullName: "Valid" } })).not.toEqual([]);
    expect(await validateCommand({ ...organization, payload: { shortName: "Valid", fullName: "x".repeat(201) } })).not.toEqual([]);
    expect(await validateCommand({ ...organization, payload: { ...organization.payload, name: "Injected" } })).not.toEqual([]);
    expect(await validateCommand({ ...organization, payload: { shortName: "", fullName: "Valid" } })).not.toEqual([]);
  });
});
