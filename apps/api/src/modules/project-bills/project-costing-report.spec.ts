import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectCostingReportService } from "./project-costing-report.service";
import { ProjectCostingReportController } from "./project-costing-report.controller";
import { generateProjectCostingPdf } from "./project-costing-pdf";
import { PERMISSIONS_KEY } from "../../common/decorators/require-permissions.decorator";
import type { AuthUser, ProjectCostingReport } from "@bizovix/types";
import type { Response } from "express";

const D = (value: number | string) => new Prisma.Decimal(value);
function setup() {
  const work = { id: "work-a", workName: "Equipment Supply", tenderId: "tender-a", organizationMasterId: "client-a", organizationMaster: { fullName: "Client Organization", shortName: "Client" }, documentPurchase: null, pgBgWorkflow: null };
  const tender = { id: "tender-a", egpTenderId: "123456", paName: "Tender PA", paDesignation: "Engineer", paPhone: "01712345678", paAddress: "Dhaka" };
  const items = [
    { id: "item-a", description: "Display", unit: "Nos", contractQty: D(2), unitRate: D("123.45"), contractAmount: D("246.90") },
    { id: "item-b", description: "Installation", unit: "Lot", contractQty: D(3), unitRate: D("33.33"), contractAmount: D("99.99") },
  ];
  const db = {
    cmsWork: { findFirst: jest.fn().mockResolvedValue(work) },
    boqItem: { findMany: jest.fn().mockResolvedValue(items) },
    tender: { findFirst: jest.fn().mockResolvedValue(tender) },
    organizationContact: { findFirst: jest.fn().mockResolvedValue(null) },
    tenderCosting: { findFirst: jest.fn() },
  };
  return { service: new ProjectCostingReportService(db as unknown as PrismaService), db, work, tender, items };
}

describe("Project costing view and PDF", () => {
  it("uses all of this project's saved BOQ quantities, rates and amounts before tender costing", async () => {
    const { service, db } = setup();
    const report = await service.report("org-a", "work-a");
    expect(db.cmsWork.findFirst.mock.calls[0]![0].where).toEqual({ id: "work-a", organizationId: "org-a" });
    expect(db.boqItem.findMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-a", cmsWorkId: "work-a" });
    expect(report.rows[0]).toEqual({ id: "item-a", productName: "Display", unit: "Nos", quantity: "2.000", unitPrice: "123.45", totalPrice: "246.90" });
    expect(report.rows[1]?.unitPrice).toBe("33.33");
    expect(report.totalPrice).toBe("346.89");
    expect(report.source).toBe("PROJECT_BOQ");
    expect(db.boqItem.findMany.mock.calls[0]![0]).not.toHaveProperty("take");
    expect(db.tenderCosting.findFirst).not.toHaveBeenCalled();
    expect(report.pa).toEqual({ name: "Tender PA", designation: "Engineer", phone: "01712345678", address: "Dhaka", email: null });
  });
  it("falls back to the linked completed tender costing when the project has no BOQ", async () => {
    const { service, db } = setup();
    db.boqItem.findMany.mockResolvedValue([]);
    db.tenderCosting.findFirst.mockResolvedValue({
      costingDate: new Date("2026-09-09T00:00:00.000Z"), estimatedCost: D("275.00"),
      freightCost: D("25.00"), installationCost: D(0), otherCost: D(0), contingencyAmount: D(0),
      items: [{ id: "cost-item-a", description: "Tender Display", unit: "Nos", quantity: D(2), totalCost: D("250.00") }],
    });

    const report = await service.report("org-a", "work-a");

    expect(db.tenderCosting.findFirst.mock.calls[0]![0].where).toEqual(expect.objectContaining({ organizationId: "org-a", status: "COMPLETED", tenderId: "tender-a" }));
    expect(report.source).toBe("TENDER_COSTING");
    expect(report.rows).toEqual([{ id: "cost-item-a", productName: "Tender Display", unit: "Nos", quantity: "2.000", unitPrice: "125.000000", totalPrice: "250.00" }]);
    expect(report.itemsTotalPrice).toBe("250.00");
    expect(report.totalPrice).toBe("275.00");
    expect(report.adjustments).toEqual([{ label: "Freight Cost", amount: "25.00" }]);
  });
  it("shows BOQ even without a tender and does not invent missing PA information", async () => {
    const { service, db, work } = setup();
    db.cmsWork.findFirst.mockResolvedValue({ ...work, tenderId: null });
    const report = await service.report("org-a", "work-a");
    expect(report.rows).toHaveLength(2);
    expect(report.tenderNumber).toBeNull();
    expect(report.pa).toEqual({ name: null, designation: null, phone: null, address: null, email: null });
    expect(db.tender.findFirst).not.toHaveBeenCalled();
    expect(db.tenderCosting.findFirst).not.toHaveBeenCalled();
  });
  it("supports the real document-purchase handoff link but never crosses tenants", async () => {
    const { service, db, work } = setup();
    db.cmsWork.findFirst.mockResolvedValue({ ...work, tenderId: null, documentPurchase: { organizationId: "org-a", linkedTenderId: "doc-tender" } });
    await service.report("org-a", "work-a");
    expect(db.tender.findFirst.mock.calls[0]![0].where).toEqual({ id: "doc-tender", organizationId: "org-a" });
    db.cmsWork.findFirst.mockResolvedValue({ ...work, tenderId: null, documentPurchase: { organizationId: "org-b", linkedTenderId: "other-tender" } });
    expect((await service.report("org-a", "work-a")).tenderNumber).toBeNull();
    expect(db.tender.findFirst).toHaveBeenCalledTimes(1);
  });
  it("preserves PA details even when the project has no BOQ yet", async () => {
    const { service, db } = setup();
    db.boqItem.findMany.mockResolvedValue([]);
    const report = await service.report("org-a", "work-a");
    expect(report.emptyReason).toBe("NO_COSTED_ITEMS");
    expect(report.totalPrice).toBe("0.00");
    expect(report.pa.name).toBe("Tender PA");
  });
  it("prefers the saved project PA snapshot without mixing in another person's fields", async () => {
    const { service, db, work } = setup();
    const snapshot = { id: "pa-a", name: "Project PA", designation: "Executive Engineer", mobile: "", address: "Khulna", email: "pa@example.test" };
    db.cmsWork.findFirst.mockResolvedValue({ ...work, pgBgWorkflow: { organizationId: "org-a", organizationMasterId: "client-a", contactSnapshot: snapshot, contact: null } });
    const report = await service.report("org-a", "work-a");
    expect(report.pa).toEqual({ name: "Project PA", designation: "Executive Engineer", phone: null, address: "Khulna", email: "pa@example.test" });
    expect(db.organizationContact.findFirst).not.toHaveBeenCalled();
  });
  it("uses the selected project contact, then tenant-scoped client contact as in Project Overview", async () => {
    const { service, db, work } = setup();
    const contact = { organizationId: "org-a", organizationMasterId: "client-a", name: "Selected PA", designation: "Engineer", mobile: "01900000000", address: "Khulna", email: null };
    db.cmsWork.findFirst.mockResolvedValue({ ...work, pgBgWorkflow: { organizationId: "org-a", organizationMasterId: "client-a", contactSnapshot: null, contact } });
    expect((await service.report("org-a", "work-a")).pa.name).toBe("Selected PA");
    db.cmsWork.findFirst.mockResolvedValue(work);
    db.tender.findFirst.mockResolvedValue(null);
    db.organizationContact.findFirst.mockResolvedValue(contact);
    expect((await service.report("org-a", "work-a")).pa.name).toBe("Selected PA");
    expect(db.organizationContact.findFirst.mock.calls[0]![0].where).toEqual({ organizationId: "org-a", organizationMasterId: "client-a" });
  });
  it("rejects another tenant's workflow/contact and keeps the linked tender PA", async () => {
    const { service, db, work } = setup();
    const snapshot = { id: "foreign", name: "Other Tenant PA", designation: "Other", mobile: "0123", address: "Other" };
    db.cmsWork.findFirst.mockResolvedValue({ ...work, pgBgWorkflow: { organizationId: "org-b", organizationMasterId: "client-a", contactSnapshot: snapshot } });
    expect((await service.report("org-a", "work-a")).pa.name).toBe("Tender PA");
  });
  it("rejects a missing or inaccessible project and protects costing routes", async () => {
    const { service, db } = setup();
    db.cmsWork.findFirst.mockResolvedValue(null);
    await expect(service.report("org-b", "work-a")).rejects.toThrow("Project not found");
    expect(db.tenderCosting.findFirst).not.toHaveBeenCalled();
    expect(db.boqItem.findMany).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ProjectCostingReportController)).toEqual(["cms.work.read", "project_bill.read", "boq.read"]);
  });
  it("generates a complete PDF document from the report", async () => {
    const report = await setup().service.report("org-a", "work-a");
    const buffer = await generateProjectCostingPdf(report);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.toString("latin1")).toContain("%%EOF");
  });
  it("downloads the same report as a private PDF attachment with an exposed filename", async () => {
    const { service } = setup();
    const controller = new ProjectCostingReportController(service);
    const response = { setHeader: jest.fn(), send: jest.fn() };
    await controller.pdf("work-a", { organizationId: "org-a" } as AuthUser, response as unknown as Response);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="project-costing-123456.pdf"');
    expect(response.setHeader).toHaveBeenCalledWith("Access-Control-Expose-Headers", "Content-Disposition");
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(response.send.mock.calls[0]![0].subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("does not download a blank PDF when no saved BOQ exists", async () => {
    const { service, db } = setup();
    db.boqItem.findMany.mockResolvedValue([]);
    const response = { setHeader: jest.fn(), send: jest.fn() };
    await expect(new ProjectCostingReportController(service).pdf("work-a", { organizationId: "org-a" } as AuthUser, response as unknown as Response)).rejects.toThrow("No saved BOQ items");
    expect(response.send).not.toHaveBeenCalled();
  });
  it("paginates large reports", async () => {
    const base = await setup().service.report("org-a", "work-a");
    const report: ProjectCostingReport = { ...base, rows: Array.from({ length: 80 }, (_, i) => ({ ...base.rows[0]!, id: `row-${i}`, productName: `Product ${i + 1} with complete specifications and required installation accessories`, totalPrice: "100.00" })), totalPrice: "8000.00" };
    const buffer = await generateProjectCostingPdf(report);
    expect(buffer.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length).toBeGreaterThan(1);
  });
});
