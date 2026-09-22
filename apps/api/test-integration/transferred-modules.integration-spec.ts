import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@bizovix/database";
import { AppModule } from "../src/app.module";
import { validationExceptionFactory } from "../src/common/utils/validation-exception-factory";
import { FixedAssetsService } from "../src/modules/fixed-assets/fixed-assets.service";
import { GeneralExpensesService } from "../src/modules/general-expenses/general-expenses.service";
import { HrService } from "../src/modules/hr/hr.service";
import { LcService } from "../src/modules/lc/lc.service";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { createIdentityFixture, mapExpenseHeadToPostingLedger, resetTestDatabase } from "./fixtures";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

describe("transferred production modules", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let assets: FixedAssetsService;
  let expenses: GeneralExpensesService;
  let hr: HrService;
  let lc: LcService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }));
    await app.init();
    prisma = app.get(PrismaService);
    assets = app.get(FixedAssetsService);
    expenses = app.get(GeneralExpensesService);
    hr = app.get(HrService);
    lc = app.get(LcService);
  });

  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => {
    if (prisma) await resetTestDatabase(prisma);
    if (app) await app.close();
  });

  it("posts balanced and isolated General Expense, Asset, HR and LC workflows", async () => {
    const fixture = await createIdentityFixture(prisma, "PORT");
    const vendor = await prisma.party.create({ data: { organizationId: fixture.organization.id, code: "VEN-PORT", name: "Port Vendor", roles: ["VENDOR", "SUPPLIER"] } });
    const expenseHead = await prisma.expenseHead.create({ data: { organizationId: fixture.organization.id, name: "Office Services" } });
    await mapExpenseHeadToPostingLedger(app, fixture.organization.id, fixture.user.id, expenseHead.id, "GENERAL_EXPENSE");

    const payableExpense = await expenses.create(fixture.organization.id, fixture.user.id, { expenseDate: "2026-09-01", expenseHeadId: expenseHead.id, amount: 2500, expenseById: fixture.user.id, paymentMode: "PAYABLE", payablePartyId: vendor.id, expenseNature: "INDIRECT", description: "Office service" });
    expect(payableExpense.payable?.status).toBe("UNPAID");
    const expenseJournal = await prisma.journalEntry.findFirstOrThrow({ where: { sourceModule: "GENERAL_EXPENSE", sourceId: payableExpense.id }, include: { lines: true } });
    expect(expenseJournal.lines.reduce((sum, line) => sum.add(line.debit).sub(line.credit), D(0)).isZero()).toBe(true);

    const category = await assets.createCategory(fixture.organization.id, fixture.user.id, { name: "Office Equipment", code: "OFF-EQ", defaultUsefulLifeMonths: 36 });
    const asset = await assets.create(fixture.organization.id, fixture.user.id, { name: "Production Printer", categoryId: category.id, fundingMode: "CASH_BANK", fundingBankAccountId: fixture.bank.id, purchaseDate: "2026-09-01", purchaseCost: 120000, transportationCost: 3000, installationCost: 2000, discountAmount: 5000, salvageValue: 12000, usefulLifeMonths: 36 });
    expect(asset.capitalizedCost.toFixed(4)).toBe("120000.0000");
    await assets.postDepreciation(fixture.organization.id, fixture.user.id, asset.id, { periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    await assets.postDepreciation(fixture.organization.id, fixture.user.id, asset.id, { periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(await prisma.fixedAssetDepreciationEntry.count({ where: { fixedAssetId: asset.id } })).toBe(1);

    const department = await hr.createDepartment(fixture.organization.id, fixture.user.id, { name: "Operations" });
    const employee = await hr.createEmployee(fixture.organization.id, fixture.user.id, { name: "Module Employee", departmentId: department.id, joiningDate: "2026-09-01", employmentType: "PERMANENT", grossSalary: 52000, salaryComponents: [{ name: "Basic", percent: 50 }, { name: "Allowances", percent: 50 }], pfRate: 10, paymentMethod: "BANK" });
    const imported = await hr.importAttendance(fixture.organization.id, fixture.user.id, { rows: [{ employeeCode: employee.employeeCode, date: "2026-09-01", status: "PRESENT", checkIn: "09:00", checkOut: "18:00" }] });
    expect(imported.imported).toBe(1);
    const payroll = await hr.calculatePayroll(fixture.organization.id, fixture.user.id, { periodYear: 2026, periodMonth: 9, totalWorkingDays: 26, entries: [{ employeeId: employee.id, presentDays: 26, loanDeduction: 1000 }] });
    expect(payroll.totalNetPayable.toFixed(4)).toBe("48400.0000");
    const leaveType = await hr.createLeaveType(fixture.organization.id, fixture.user.id, { name: "Annual Leave", daysPerYear: 14 });
    const leave = await hr.createLeaveRequest(fixture.organization.id, fixture.user.id, { employeeId: employee.id, leaveTypeId: leaveType.id, startDate: "2026-09-10", endDate: "2026-09-11", reason: "Family" });
    expect((await hr.approveLeaveRequest(fixture.organization.id, fixture.user.id, leave.id)).status).toBe("APPROVED");

    const inventoryItem = await prisma.item.create({ data: { organizationId: fixture.organization.id, itemCode: "IMP-PORT", itemName: "Imported Component", itemType: "MATERIAL", createdById: fixture.user.id } });
    const warehouse = await lc.createWarehouse(fixture.organization.id, fixture.user.id, { code: "MAIN", name: "Main Warehouse" });
    const opened = await lc.create(fixture.organization.id, fixture.user.id, { lcDate: "2026-09-01", supplierId: vendor.id, supplierName: vendor.name, currency: "USD", exchangeRate: 100, purchasePaymentStatus: "PAID", purchasePaidAmount: 10000, paymentAllocations: [{ accountId: fixture.bank.id, amount: 10000, reference: "PAY-PORT" }], destinationWarehouseId: warehouse.id, items: [{ itemId: inventoryItem.id, productName: inventoryItem.itemName, unit: "pcs", quantity: 10, foreignUnitPrice: 10 }] });
    await lc.createGrn(fixture.organization.id, fixture.user.id, opened.id, { receivedDate: "2026-09-02", warehouseId: warehouse.id, items: opened.items.map((item) => ({ lcItemId: item.id, receivedQuantity: 10 })) });
    const finalized = await lc.finalize(fixture.organization.id, fixture.user.id, opened.id);
    await lc.finalize(fixture.organization.id, fixture.user.id, opened.id);
    expect(finalized.landedCost?.landedCostTotal.toFixed(4)).toBe("10000.0000");
    await lc.postInventory(fixture.organization.id, fixture.user.id, opened.id, { items: opened.items.map((item) => ({ lcItemId: item.id, warehouseId: warehouse.id, itemId: inventoryItem.id, postingType: "EXISTING" })) });
    await lc.postInventory(fixture.organization.id, fixture.user.id, opened.id, { items: opened.items.map((item) => ({ lcItemId: item.id, warehouseId: warehouse.id, itemId: inventoryItem.id, postingType: "EXISTING" })) });
    expect(await prisma.lcInventoryPosting.count({ where: { lcId: opened.id } })).toBe(1);
    const lcJournals = await prisma.journalEntry.findMany({ where: { organizationId: fixture.organization.id, sourceModule: { in: ["LC_PURCHASE", "LC_LANDED_COST"] } }, include: { lines: true } });
    expect(lcJournals).toHaveLength(2);
    for (const journal of lcJournals) expect(journal.lines.reduce((sum, line) => sum.add(line.debit).sub(line.credit), D(0)).isZero()).toBe(true);

    await expect(lc.findOne("another-organization", opened.id)).rejects.toThrow("LC not found");
    expect(await prisma.ledgerAccount.count({ where: { organizationId: fixture.organization.id, isSystem: true, isActive: false } })).toBe(0);
  });
});
