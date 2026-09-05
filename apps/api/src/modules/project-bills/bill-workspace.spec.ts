import { Prisma } from "@bizovix/database";
import { BillWorkspaceService } from "./bill-workspace.service";
import { ProjectBillsService } from "./project-bills.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { AccountingService } from "../accounting/accounting.service";
import { DeductionConfigsService } from "../deduction-configs/deduction-configs.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";

const D = (n: number) => new Prisma.Decimal(n);
function setup() {
  const work = { id: "work", workName: "School equipment", status: "ONGOING" };
  const contract = { id: "contract", cmsWorkId: "work", status: "ACTIVE", currency: "BDT", contractNo: "C1", currentContractValue: D(1000), retentionPct: D(10) };
  const item = { id: "boq", itemCode: null, description: "Display", unit: "Nos", contractQty: D(10), unitRate: D(100) };
  const db = {
    cmsWork: { findFirst: jest.fn().mockResolvedValue(work), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    projectContract: { findFirst: jest.fn().mockResolvedValue(contract), findMany: jest.fn().mockResolvedValue([contract]) },
    boqItem: { findMany: jest.fn().mockResolvedValue([item]) },
    projectBill: { findFirst: jest.fn().mockResolvedValue(null) },
    projectBillItem: { findMany: jest.fn().mockResolvedValue([]) },
    tender: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    tenderCosting: { findFirst: jest.fn().mockResolvedValue({ items: [{ id: "cost-item", description: "Display", quantity: D(10), unit: "Nos" }] }) },
  };
  const prisma = db as unknown as PrismaService;
  const workspace = new BillWorkspaceService(prisma);
  const bills = new ProjectBillsService(prisma, {} as AuditLogService, {} as AccountingService, {} as DeductionConfigsService, {} as NumberingService, {} as ProjectLifecycleGuardService);
  return { db, workspace, bills, contract, item };
}

describe("Bill workspace", () => {
  it("lists only saved costed tenders within the tenant with bounded pagination", async () => {
    const { workspace, db } = setup();
    await workspace.sources("org-a", { page: 2, limit: 999, search: "Display" });
    const where = db.tender.findMany.mock.calls[0]![0];
    expect(where.where.organizationId).toBe("org-a");
    expect(where.where.costing.items.some.costingStatus).toBe("COSTED");
    expect(where.skip).toBe(50);
    expect(where.take).toBe(50);
  });
  it("keeps existing projects without costing available", async () => {
    const { workspace, db } = setup();
    await workspace.sources("org-a", { kind: "projects" });
    expect(db.cmsWork.findMany.mock.calls[0]![0].where.organizationId).toBe("org-a");
    expect(db.tender.findMany).not.toHaveBeenCalled();
  });
  it("returns approved BOQ rate and availability, never internal cost fields", async () => {
    const { workspace, db } = setup();
    db.projectBillItem.findMany.mockResolvedValue([{ boqItemId: "boq", currentQty: D(2), bill: { status: "CERTIFIED" } }, { boqItemId: "boq", currentQty: D(3), bill: { status: "DRAFT" } }]);
    const result = await workspace.preparation("org-a", "work");
    expect(result.ready).toBe(true);
    expect(result.items[0]).toMatchObject({ unitRate: "100.00", previousQty: "2.000", pendingQty: "3.000", remainingQty: "5.000" });
    expect(JSON.stringify(result)).not.toMatch(/unitCost|ourCost|marginPercent|foreignUnitPrice/);
  });
  it("does not exclude another project's bill or an inaccessible tenant's project", async () => {
    const { workspace, db } = setup();
    await expect(workspace.preparation("org-a", "work", "other-bill")).rejects.toThrow("Draft bill not found");
    expect(db.projectBill.findFirst.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-a", cmsWorkId: "work", status: "DRAFT" });
    db.cmsWork.findFirst.mockResolvedValue(null);
    await expect(workspace.preparation("org-b", "work")).rejects.toThrow("Project not found");
  });
  it.each(["COMPLETED", "CANCELLED", "ARCHIVED"])("blocks billing for %s projects", async (status) => {
    const { workspace, db } = setup();
    db.cmsWork.findFirst.mockResolvedValue({ id: "work", workName: "Closed", status });
    expect((await workspace.preparation("org-a", "work")).ready).toBe(false);
  });
  it("requires an active BDT contract, BOQ and remaining quantity", async () => {
    const { workspace, db, contract, item } = setup();
    for (const contracts of [[], [{ ...contract, status: "DRAFT" }], [{ ...contract, currency: "USD" }]]) {
      db.projectContract.findMany.mockResolvedValue(contracts);
      expect((await workspace.preparation("org-a", "work")).ready).toBe(false);
    }
    db.projectContract.findMany.mockResolvedValue([contract]);
    db.boqItem.findMany.mockResolvedValue([]);
    expect((await workspace.preparation("org-a", "work")).ready).toBe(false);
    db.boqItem.findMany.mockResolvedValue([item]);
    db.projectBillItem.findMany.mockResolvedValue([{ boqItemId: "boq", currentQty: D(10), bill: { status: "DRAFT" } }]);
    expect((await workspace.preparation("org-a", "work")).ready).toBe(false);
  });
  it("selects only non-sensitive fields for costing references", async () => {
    const { workspace, db } = setup();
    expect(await workspace.costingItems("org-a", "tender")).toEqual([{ id: "cost-item", description: "Display", quantity: "10.000", unit: "Nos" }]);
    const query = db.tenderCosting.findFirst.mock.calls[0]![0];
    expect(query.where).toEqual({ organizationId: "org-a", tenderId: "tender" });
    expect(Object.keys(query.select.items.select).sort()).toEqual(["description", "id", "quantity", "unit"]);
  });
  it("enforces pending reservations on the authoritative save/submit calculation", async () => {
    const { bills, db } = setup();
    db.projectBillItem.findMany.mockResolvedValue([{ boqItemId: "boq", currentQty: D(7), bill: { status: "DRAFT" } }]);
    const tx = db as unknown as Prisma.TransactionClient;
    await expect(bills["calculateItems"](tx, "org-a", "work", [{ boqItemId: "boq", currentQty: 4 }], null)).rejects.toThrow("available quantity");
    const valid = await bills["calculateItems"](tx, "org-a", "work", [{ boqItemId: "boq", currentQty: 3 }], "own-draft");
    expect(valid[0]!.currentValue.toString()).toBe("300");
    expect(valid[0]!.previousQty.toString()).toBe("0");
    expect(db.projectBillItem.findMany.mock.calls[1]![0].where.bill).toMatchObject({ organizationId: "org-a", id: { not: "own-draft" } });
  });
  it("rejects duplicate BOQ rows and inactive contracts at the service boundary", async () => {
    const { bills, db, contract } = setup();
    await expect(bills["calculateItems"](db as unknown as Prisma.TransactionClient, "org-a", "work", [{ boqItemId: "boq", currentQty: 2 }, { boqItemId: "boq", currentQty: 2 }], null)).rejects.toThrow("only once");
    db.projectContract.findFirst.mockResolvedValue({ ...contract, status: "DRAFT" });
    await expect(bills["assertContract"]("org-a", "contract")).rejects.toThrow("active contract");
  });
  it("preserves agreed zero-rate BOQ items instead of guessing a price from costing", async () => {
    const { workspace, bills, db, item } = setup();
    db.boqItem.findMany.mockResolvedValue([{ ...item, unitRate: D(0) }]);
    expect((await workspace.preparation("org-a", "work")).ready).toBe(true);
    const result = await bills["calculateItems"](db as unknown as Prisma.TransactionClient, "org-a", "work", [{ boqItemId: "boq", currentQty: 1 }], null);
    expect(result[0]?.approvedRate.toString()).toBe("0");
  });
});
