import { randomUUID } from "crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { CashBankService } from "../src/modules/cash-bank/cash-bank.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { RemindersService } from "../src/modules/reminders/reminders.service";
import { assertIsolatedTestDatabase, createIdentityFixture } from "./fixtures";

describe("OD account EMI reminders", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cashBank: CashBankService;
  let reminders: RemindersService;
  const fixtures: Awaited<ReturnType<typeof createIdentityFixture>>[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await assertIsolatedTestDatabase(prisma);
    cashBank = app.get(CashBankService);
    reminders = app.get(RemindersService);
    for (const tenant of ["a", "b"]) {
      fixtures.push(await createIdentityFixture(prisma, `emi-${tenant}-${randomUUID()}`, ["reminders.read"]));
    }
  });

  afterAll(async () => {
    if (prisma) {
      await assertIsolatedTestDatabase(prisma);
      for (const fixture of fixtures) {
        await prisma.organization.delete({ where: { id: fixture.organization.id } });
        await prisma.user.delete({ where: { id: fixture.user.id } });
      }
    }
    await app?.close();
  });

  it("shows saved dates, deduplicates sync, follows account changes and isolates tenants", async () => {
    const [owner, other] = fixtures;
    const org = owner!.organization.id;
    const user = owner!.user;
    const farDate = new Date();
    farDate.setUTCDate(farDate.getUTCDate() + 90);
    const emiDate = farDate.toISOString().slice(0, 10);
    const create = (type: string, date: string | null) => cashBank.createBankAccount(org, user.id, {
      accountName: `EMI test ${type}`, bankName: "Test Bank", accountNumber: randomUUID(),
      branch: "Test", bankAccountType: type, emiDate: date, openingBalance: 0,
      openingBalanceDate: new Date().toISOString().slice(0, 10),
    });
    const account = await create("OD", emiDate);
    await create("OD", null);
    await create("Savings", emiDate);
    const list = () => reminders.list(org, { sourceModule: "BANK_ACCOUNT", type: "EMI", limit: 100 });
    const active = async () => (await list()).items.filter((row) => !row.isResolved);

    // Dates beyond the notification window still appear in All Reminders.
    let rows = await active();
    expect(rows).toHaveLength(1);
    const originalId = rows[0]!.id;
    expect(rows[0]).toMatchObject({ sourceId: account.id, relatedEntityName: account.accountName, status: "UPCOMING" });
    expect(rows[0]!.dueDate.toISOString().slice(0, 10)).toBe(emiDate);
    await Promise.all([list(), list()]);
    expect((await list()).items).toHaveLength(1);
    expect((await reminders.list(other!.organization.id, { sourceModule: "BANK_ACCOUNT" })).items).toHaveLength(0);
    await expect(cashBank.updateBankAccount(other!.organization.id, other!.user.id, account.id, { emiDate: null })).rejects.toThrow("Financial account not found");

    const nearDate = new Date();
    nearDate.setUTCDate(nearDate.getUTCDate() + 2);
    const nextDate = nearDate.toISOString().slice(0, 10);
    await cashBank.updateBankAccount(org, user.id, account.id, { emiDate: nextDate, accountName: "Renamed OD" });
    rows = await active();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dueDate.toISOString().slice(0, 10)).toBe(nextDate);
    expect(rows[0]!.title).toContain("Renamed OD");
    expect(await prisma.reminder.findUniqueOrThrow({ where: { id: originalId } })).toMatchObject({ status: "COMPLETED", isResolved: true });
    const nearId = rows[0]!.id;
    expect(await prisma.notification.count({ where: { organizationId: org, reminderId: nearId, isRead: false } })).toBeGreaterThan(0);

    await cashBank.updateBankAccount(org, user.id, account.id, { emiDate: null });
    expect(await active()).toHaveLength(0);
    expect(await prisma.notification.count({ where: { organizationId: org, reminderId: nearId, isRead: false } })).toBe(0);
    await cashBank.updateBankAccount(org, user.id, account.id, { emiDate });
    expect((await active())[0]!.id).toBe(originalId);
    await cashBank.updateBankAccount(org, user.id, account.id, { status: "Inactive" });
    expect(await active()).toHaveLength(0);
    await cashBank.updateBankAccount(org, user.id, account.id, { status: "Active" });
    expect(await active()).toHaveLength(1);
    await cashBank.updateBankAccount(org, user.id, account.id, { bankAccountType: "Current" });
    expect(await active()).toHaveLength(0);
    await cashBank.updateBankAccount(org, user.id, account.id, { bankAccountType: "OD", emiDate });
    expect(await active()).toHaveLength(1);

    await reminders.complete(org, user, originalId);
    expect(await active()).toHaveLength(0);
    await cashBank.updateBankAccount(org, user.id, account.id, { emiDate: nextDate });
    expect(await active()).toHaveLength(1);
    await cashBank.deleteBankAccount(org, user.id, account.id);
    expect(await active()).toHaveLength(0);
  });
});
