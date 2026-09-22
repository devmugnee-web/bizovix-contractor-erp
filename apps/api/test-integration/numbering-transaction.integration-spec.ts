import { randomUUID } from "crypto";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { AuditLogService } from "../src/modules/audit-logs/audit-log.service";
import { NUMBERING_MODULE_KEYS, NumberingService } from "../src/modules/settings-numbering/numbering.service";
import { assertIsolatedTestDatabase } from "./fixtures";

/** Additive, unique fixtures only. This suite never resets any database. */
describe("numbering transaction ownership and concurrency", () => {
  let prisma: PrismaService;
  let numbering: NumberingService;
  const year = new Date().getFullYear();
  const createOrganization = () => prisma.organization.create({ data: { name: `Numbering test ${randomUUID()}`, shortName: `N-${randomUUID()}` } });
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL || !process.env.BIZOVIX_ISOLATED_DATABASE_NAME) throw new Error("Exact newly created isolated test database required");
    prisma = new PrismaService();
    await prisma.$connect();
    await assertIsolatedTestDatabase(prisma);
    numbering = new NumberingService(prisma, new AuditLogService(prisma));
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  it("can allocate within a newly created tenant transaction and rolls back the tenant, defaults and item together", async () => {
    const id = randomUUID();
    await expect(prisma.$transaction(async tx => {
      await tx.organization.create({ data: { id, name: "Uncommitted tenant", shortName: "NEW-TX" } });
      const itemCode = await numbering.next(id, "ITEM", tx);
      expect(itemCode).toBe(`ITM-${year}-0001`);
      await tx.item.create({ data: { organizationId: id, itemCode, itemName: "Must roll back" } });
      expect(await tx.numberSequence.count({ where: { organizationId: id } })).toBe(NUMBERING_MODULE_KEYS.length);
      throw new Error("Injected business failure after allocation");
    }, { timeout: 10_000 })).rejects.toThrow("Injected business failure");
    expect(await prisma.organization.count({ where: { id } })).toBe(0);
    expect(await prisma.numberSequence.count({ where: { organizationId: id } })).toBe(0);
    expect(await prisma.item.count({ where: { organizationId: id } })).toBe(0);
  });

  it("rolls back all first-use defaults for an existing tenant after a late business failure", async () => {
    const organization = await createOrganization();
    await expect(prisma.$transaction(async tx => {
      expect(await numbering.next(organization.id, "VENDOR", tx)).toBe(`VEN-${year}-0001`);
      throw new Error("Injected late failure");
    })).rejects.toThrow("Injected late failure");
    expect(await prisma.numberSequence.count({ where: { organizationId: organization.id } })).toBe(0);
    expect(await numbering.next(organization.id, "VENDOR")).toBe(`VEN-${year}-0001`);
  });

  it("restores an existing customized counter on rollback and supports repeated allocations in one transaction", async () => {
    const organization = await createOrganization();
    await numbering.ensureDefaults(organization.id);
    await prisma.numberSequence.update({ where: { organizationId_moduleKey: { organizationId: organization.id, moduleKey: "ITEM" } }, data: { prefix: "CUSTOM", includeYear: false, separator: "/", sequenceLength: 6, nextNumber: 42, lastYearUsed: year - 1 } });
    await expect(prisma.$transaction(async tx => {
      expect(await numbering.next(organization.id, "ITEM", tx)).toBe("CUSTOM/000042");
      expect(await numbering.next(organization.id, "ITEM", tx)).toBe("CUSTOM/000043");
      throw new Error("Injected counter rollback");
    })).rejects.toThrow("Injected counter rollback");
    expect(await prisma.numberSequence.findUniqueOrThrow({ where: { organizationId_moduleKey: { organizationId: organization.id, moduleKey: "ITEM" } } })).toMatchObject({ prefix: "CUSTOM", includeYear: false, separator: "/", sequenceLength: 6, nextNumber: 42, lastYearUsed: year - 1 });
    const values = await prisma.$transaction(async tx => [await numbering.next(organization.id, "ITEM", tx), await numbering.next(organization.id, "ITEM", tx)]);
    expect(values).toEqual(["CUSTOM/000042", "CUSTOM/000043"]);
  });

  it("serializes simultaneous first-use allocations without duplicate numbers or missing defaults", async () => {
    const organization = await createOrganization();
    const values = await Promise.all(Array.from({ length: 6 }, () => prisma.$transaction(tx => numbering.next(organization.id, "ITEM", tx), { maxWait: 10_000, timeout: 10_000 })));
    expect(values.sort()).toEqual(Array.from({ length: 6 }, (_, index) => `ITM-${year}-${String(index + 1).padStart(4, "0")}`));
    expect(await prisma.numberSequence.count({ where: { organizationId: organization.id } })).toBe(NUMBERING_MODULE_KEYS.length);
    expect(await prisma.numberSequence.findUniqueOrThrow({ where: { organizationId_moduleKey: { organizationId: organization.id, moduleKey: "ITEM" } } })).toMatchObject({ nextNumber: 7, lastYearUsed: year });
  });

  it("keeps tenants independent and preserves receipt width and configured year rollover", async () => {
    const first = await createOrganization(), second = await createOrganization();
    await numbering.ensureDefaults(first.id);
    await prisma.numberSequence.update({ where: { organizationId_moduleKey: { organizationId: first.id, moduleKey: "RECEIPT" } }, data: { prefix: "PAY", yearFormat: "YY", separator: "/", nextNumber: 99, lastYearUsed: year - 1 } });
    expect(await numbering.next(first.id, "RECEIPT")).toBe(`PAY/${String(year).slice(-2)}/00001`);
    expect(await numbering.next(second.id, "RECEIPT")).toBe(`RC-${year}-00001`);
    expect(await numbering.next(first.id, "RECEIPT")).toBe(`PAY/${String(year).slice(-2)}/00002`);
  });
});
