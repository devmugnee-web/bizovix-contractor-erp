import { Prisma } from "@bizovix/database";
import type { AuthUser } from "@bizovix/types";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectCostingReportService } from "./project-costing-report.service";
import { TenderBillCostingController } from "./project-costing-report.controller";
import { PERMISSIONS_KEY } from "../../common/decorators/require-permissions.decorator";

const D = (value: string | number) => new Prisma.Decimal(value);
function setup() {
  const tender = { id: "tender-a", egpTenderId: "1318965", workName: "Equipment Supply", paName: "Notice PA", paDesignation: "Engineer", paPhone: "01712345678", paAddress: "Dhaka", noticeOrganization: "Notice Organization", organizationMaster: { fullName: "Master Organization", shortName: "Master" } };
  const items = [
    { id: "local-a", description: "Display", unit: "Nos", quantity: D(2), totalCost: D(100) },
    { id: "foreign-b", description: "Accessories", unit: "Set", quantity: D(3), totalCost: D(90) },
  ];
  const record = { id: "cost-a", tenderId: tender.id, tender, costingDate: new Date("2026-09-05"), estimatedCost: D(242), freightCost: D(10), installationCost: D(20), otherCost: D(0), contingencyAmount: D(22), items, _count: { items: 2 } };
  const db = {
    tenderCosting: { findFirst: jest.fn().mockResolvedValue(record), findMany: jest.fn().mockResolvedValue([record]), count: jest.fn().mockResolvedValue(1) },
    cmsWork: { findFirst: jest.fn() }, boqItem: { findMany: jest.fn() }, organizationContact: { findFirst: jest.fn() },
    companyProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    projectContract: { findMany: jest.fn().mockResolvedValue([]) },
    tenderCostingItem: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new ProjectCostingReportService(db as unknown as PrismaService), db, record };
}

describe("Completed tender costing in Bill Submission", () => {
  it("lists completed costings without an ongoing-work or BOQ requirement", async () => {
    const { service, db } = setup();
    const result = await service.costedTenders("org-a", { page: 1, limit: 12 });
    expect(db.tenderCosting.findMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-a", status: "COMPLETED", items: { some: { organizationId: "org-a", costingStatus: "COSTED" } } });
    expect(result.items[0]).toEqual({ id: "cost-a", tenderId: "tender-a", tenderNumber: "1318965", workName: "Equipment Supply", paName: "Notice PA", itemCount: 2, unitRate: null, grandTotal: "242.00" });
    expect(db.cmsWork.findFirst).not.toHaveBeenCalled();
    expect(db.boqItem.findMany).not.toHaveBeenCalled();
  });
  it("only shows a single unit rate for one product, never a project-wide average", async () => {
    const { service, db, record } = setup();
    db.tenderCosting.findMany.mockResolvedValue([{ ...record, _count: { items: 1 }, items: [{ quantity: D(3), totalCost: D(100) }] }]);
    expect((await service.costedTenders("org-a", {})).items[0]?.unitRate).toBe("33.333333");
  });
  it("searches tender ID, work and PA name while retaining tenant/status filters and pagination", async () => {
    const { service, db } = setup();
    await service.costedTenders("org-a", { page: 2, limit: 4, search: "  Notice  " });
    const query = db.tenderCosting.findMany.mock.calls[0]![0];
    expect(query.skip).toBe(4);
    expect(query.take).toBe(4);
    expect(query.where.organizationId).toBe("org-a");
    expect(query.where.status).toBe("COMPLETED");
    expect(query.where.tender.OR).toContainEqual({ paName: { contains: "Notice", mode: "insensitive" } });
    expect(db.tenderCosting.count).toHaveBeenCalledWith({ where: query.where });
  });
  it("uses saved local/foreign costing rows, final unit sales and the exact saved grand total", async () => {
    const { service, db } = setup();
    const report = await service.tenderReport("org-a", "cost-a");
    expect(report.source).toBe("TENDER_COSTING");
    expect(report.rows).toEqual([
      { id: "local-a", productName: "Display", unit: "Nos", quantity: "2.000", unitPrice: "50.000000", totalPrice: "100.00" },
      { id: "foreign-b", productName: "Accessories", unit: "Set", quantity: "3.000", unitPrice: "30.000000", totalPrice: "90.00" },
    ]);
    expect(report.itemsTotalPrice).toBe("190.00");
    expect(report.totalPrice).toBe("242.00");
    expect(report.adjustments).toEqual([{ label: "Freight Cost", amount: "10.00" }, { label: "Installation Cost", amount: "20.00" }, { label: "Contingency", amount: "22.00" }]);
    const query = db.tenderCosting.findFirst.mock.calls[0]![0];
    expect(query.where.id).toBe("cost-a");
    expect(query.where.organizationId).toBe("org-a");
    expect(query.select.items.where).toEqual({ organizationId: "org-a", costingStatus: "COSTED" });
    expect(query.select.items).not.toHaveProperty("take");
  });
  it("takes PA and organization from Add New Tender, never project/client contact", async () => {
    const { service, db } = setup();
    const report = await service.tenderReport("org-a", "cost-a");
    expect(report.pa).toEqual({ name: "Notice PA", designation: "Engineer", phone: "01712345678", address: "Dhaka", email: null });
    expect(report.project.organizationName).toBe("Notice Organization");
    expect(db.organizationContact.findFirst).not.toHaveBeenCalled();
    expect(db.cmsWork.findFirst).not.toHaveBeenCalled();
  });
  it("does not fill missing tender PA fields with an unrelated contact", async () => {
    const { service, db, record } = setup();
    db.tenderCosting.findFirst.mockResolvedValue({ ...record, tender: { ...record.tender, paName: null, paPhone: null, paAddress: null, paDesignation: null } });
    expect((await service.tenderReport("org-a", "cost-a")).pa).toEqual({ name: null, designation: null, phone: null, address: null, email: null });
    expect(db.organizationContact.findFirst).not.toHaveBeenCalled();
  });
  it("rejects missing, other-tenant, Ready and In Progress costings", async () => {
    const { service, db } = setup();
    db.tenderCosting.findFirst.mockResolvedValue(null);
    await expect(service.tenderReport("org-b", "cost-a")).rejects.toThrow("Completed tender costing not found");
    expect(db.tenderCosting.findFirst.mock.calls[0]![0].where).toMatchObject({ id: "cost-a", organizationId: "org-b", status: "COMPLETED" });
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TenderBillCostingController)).toEqual(["project_bill.read", "tender.costing.read"]);
  });
  it("downloads a private PDF attachment without creating or submitting a bill", async () => {
    const { service } = setup();
    const response = { setHeader: jest.fn(), send: jest.fn() };
    await new TenderBillCostingController(service).pdf("cost-a", { organizationId: "org-a" } as AuthUser, response as unknown as Response);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="tender-costing-1318965.pdf"');
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(response.setHeader).toHaveBeenCalledWith("Access-Control-Expose-Headers", "Content-Disposition");
    expect(response.send.mock.calls[0]![0].subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("gets letter metadata only from saved tenant-scoped company, contract and item data", async () => {
    const { service, db } = setup();
    db.companyProfile.findUnique.mockResolvedValue({ legalName: "Saved Company", displayName: "Display Company" });
    db.projectContract.findMany.mockResolvedValue([{ contractNo: "WO/123", issueDate: new Date("2026-08-01"), contractDate: null, contractType: "WORK_ORDER" }]);
    db.tenderCostingItem.findMany.mockResolvedValue([{ id: "local-a", secondaryDescription: "Brand: Example\nModel: Display-1" }]);
    const context = await service.tenderPdfContext("org-a", "cost-a", "tender-a");
    expect(context).toMatchObject({ payeeName: "Saved Company", reference: null, date: null, contract: { number: "WO/123", date: "2026-08-01T00:00:00.000Z", label: "Work Order No" }, productDetails: { "local-a": "Brand: Example\nModel: Display-1" } });
    expect(db.companyProfile.findUnique).toHaveBeenCalledWith({ where: { organizationId: "org-a" }, select: { legalName: true, displayName: true } });
    expect(db.projectContract.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-a", tenderId: "tender-a", status: { in: ["ACTIVE", "COMPLETED", "CLOSED"] } });
    expect(db.tenderCostingItem.findMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-a", costingId: "cost-a", costingStatus: "COSTED" });
  });
  it("does not guess a contract when several are linked or copy sample letter identifiers", async () => {
    const { service, db } = setup();
    db.projectContract.findMany.mockResolvedValue([{ contractNo: "ONE" }, { contractNo: "TWO" }]);
    expect(await service.tenderPdfContext("org-a", "cost-a", "tender-a")).toEqual({ payeeName: null, reference: null, date: null, contract: null, productDetails: {} });
  });
});
