import { Prisma } from "@bizovix/database";
import { validate } from "class-validator";
import type { AuthUser } from "@bizovix/types";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { TenderChallanService, tenderChallanLetter } from "./tender-challan.service";
import { TenderChallanController } from "./tender-challan.controller";
import { TenderChallanPdfDto } from "./dto/tender-challan-pdf.dto";
import { PERMISSIONS_KEY } from "../../common/decorators/require-permissions.decorator";

function setup() {
  const record = {
    id: "cost-a", tenderId: "tender-a", costingDate: new Date("2026-09-05"),
    tender: { egpTenderId: "1318963", workName: "Saved Work", paName: "Saved PA", paDesignation: "Engineer", paPhone: "01712345678", paAddress: "PA office", noticeOrganization: "Notice Organization", organizationMaster: null },
    _count: { items: 2 }, items: [
      { id: "item-a", description: "Local Display", secondaryDescription: "Brand: Local\nModel: A", unit: "Nos", quantity: new Prisma.Decimal("2.500") },
      { id: "item-b", description: "Foreign Speaker", secondaryDescription: null, unit: "Pcs", quantity: new Prisma.Decimal("8") },
    ],
  };
  const db = {
    tenderCosting: { findMany: jest.fn().mockResolvedValue([record]), count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue(record) },
    projectContract: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { db, record, service: new TenderChallanService(db as unknown as PrismaService) };
}

describe("Tender-based Challan workspace", () => {
  it("lists the same completed costed tenders as Bill Submission, with no financial fields", async () => {
    const { service, db } = setup();
    const result = await service.list("org-a", { page: 1, limit: 12 });
    expect(result.items).toEqual([{ id: "cost-a", tenderId: "tender-a", tenderNumber: "1318963", workName: "Saved Work", paName: "Saved PA", itemCount: 2 }]);
    expect(db.tenderCosting.findMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-a", status: "COMPLETED", items: { some: { organizationId: "org-a", costingStatus: "COSTED" } } });
    expect(Object.keys(db.tenderCosting.findMany.mock.calls[0]![0].select)).toEqual(["id", "tenderId", "tender", "_count"]);
  });
  it("searches tender/work/PA and paginates with a safe maximum limit", async () => {
    const { service, db } = setup();
    await service.list("org-a", { page: 2, limit: 200, search: " Saved " });
    const query = db.tenderCosting.findMany.mock.calls[0]![0];
    expect(query.skip).toBe(100); expect(query.take).toBe(100);
    expect(query.where.tender.OR).toContainEqual({ paName: { contains: "Saved", mode: "insensitive" } });
    expect(db.tenderCosting.count).toHaveBeenCalledWith({ where: query.where });
  });
  it("reads all saved local and foreign products directly, without project/BOQ dependency", async () => {
    const { service, db } = setup();
    const report = await service.report("org-a", "cost-a");
    expect(report.rows).toEqual([
      { id: "item-a", productName: "Local Display", details: "Brand: Local\nModel: A", unit: "Nos", quantity: "2.500" },
      { id: "item-b", productName: "Foreign Speaker", details: null, unit: "Pcs", quantity: "8.000" },
    ]);
    expect(report.pa).toEqual({ name: "Saved PA", designation: "Engineer", phone: "01712345678", address: "PA office" });
    expect(report.organizationName).toBe("Notice Organization");
    const query = db.tenderCosting.findFirst.mock.calls[0]![0];
    expect(query.where.id).toBe("cost-a"); expect(query.where.organizationId).toBe("org-a");
    expect(query.select.items.where).toEqual({ organizationId: "org-a", costingStatus: "COSTED" });
    expect(query.select.items).not.toHaveProperty("take");
    expect(JSON.stringify(query.select)).not.toMatch(/totalCost|unitPrice|estimatedCost|profit|vat|tax/i);
  });
  it("rejects missing, non-completed and cross-tenant records before reading contracts", async () => {
    const { service, db } = setup();
    db.tenderCosting.findFirst.mockResolvedValue(null);
    await expect(service.report("org-a", "unknown")).rejects.toThrow("Completed tender costing not found");
    expect(db.projectContract.findMany).not.toHaveBeenCalled();
    expect(db.tenderCosting.findFirst.mock.calls[0]![0].where.status).toBe("COMPLETED");
  });
  it("does not guess a contract when multiple matching contracts exist", async () => {
    const { service, db } = setup();
    const contract = { contractNo: "WO-1", issueDate: new Date("2026-06-04"), contractDate: null, contractType: "WORK_ORDER" };
    db.projectContract.findMany.mockResolvedValue([contract]);
    expect((await service.report("org-a", "cost-a")).contract).toEqual({ number: "WO-1", label: "Work Order No", date: "2026-06-04T00:00:00.000Z" });
    expect(db.projectContract.findMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-a", tenderId: "tender-a", status: { in: ["ACTIVE", "COMPLETED", "CLOSED"] } });
    db.projectContract.findMany.mockResolvedValue([contract, { ...contract, contractNo: "WO-2" }]);
    expect((await service.report("org-a", "cost-a")).contract).toBeNull();
  });
  it("defaults delivery to this tender's PA address and applies export overrides without mutating the report", async () => {
    const { service } = setup();
    const report = await service.report("org-a", "cost-a");
    const before = JSON.stringify(report);
    const blank = tenderChallanLetter(report);
    expect(blank.reference).toBe(""); expect(blank.date).toBe("");
    expect(blank.rows.every((row) => row.deliveryPlace === "PA office")).toBe(true);
    expect(tenderChallanLetter(report, { deliveryPlace: "   " }).rows.every((row) => row.deliveryPlace === "PA office")).toBe(true);
    const letter = tenderChallanLetter(report, { reference: " CH/01 ", date: "2026-09-06", deliveryPlace: " Delivery site " });
    expect(letter.reference).toBe("CH/01"); expect(letter.date).toBe("2026-09-06");
    expect(letter.rows.every((row) => row.deliveryPlace === "Delivery site")).toBe(true);
    expect(letter.rows[0]?.description).toBe("Local Display\nBrand: Local\nModel: A");
    expect(JSON.stringify(report)).toBe(before);
  });
  it("uses each tender's own PA address and leaves delivery blank only when no address is available", async () => {
    const { service } = setup();
    const report = await service.report("org-a", "cost-a");
    const different = { ...report, pa: { ...report.pa, address: "  Another PA office  " } };
    expect(tenderChallanLetter(different).rows.every((row) => row.deliveryPlace === "Another PA office")).toBe(true);
    for (const address of [null, "", "   "]) {
      const missing = { ...report, pa: { ...report.pa, address } };
      expect(tenderChallanLetter(missing).rows.every((row) => row.deliveryPlace === "")).toBe(true);
      expect(tenderChallanLetter(missing, { deliveryPlace: "Manual location" }).rows.every((row) => row.deliveryPlace === "Manual location")).toBe(true);
    }
  });
  it("removes imported address labels only in delivery cells, including manual overrides", async () => {
    const { service } = setup();
    const report = await service.report("org-a", "cost-a");
    report.pa.address = "Address : Bangladesh Secretariat. Dhaka-1000";
    const before = JSON.stringify(report);
    const letter = tenderChallanLetter(report);
    expect(letter.rows.every((row) => row.deliveryPlace === "Bangladesh Secretariat. Dhaka-1000")).toBe(true);
    expect(letter.recipient.address).toBe(report.pa.address);
    expect(tenderChallanLetter(report, { deliveryPlace: " Address: Delivery site " }).rows.every((row) => row.deliveryPlace === "Delivery site")).toBe(true);
    expect(tenderChallanLetter(report, { deliveryPlace: "Address:" }).rows).toEqual(letter.rows);
    expect(JSON.stringify(report)).toBe(before);
  });
  it("serves the Challan PDF under challan and costing read permissions, not bill permissions", async () => {
    const { service } = setup();
    const controller = new TenderChallanController(service);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, TenderChallanController)).toEqual(["challan_submission.read", "tender.costing.read"]);
    const response = { setHeader: jest.fn(), send: jest.fn() };
    await controller.pdf("cost-a", {}, { organizationId: "org-a" } as AuthUser, response as unknown as Response);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="challan-1318963.pdf"');
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(response.send.mock.calls[0]![0].subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("validates PDF option lengths and real calendar dates", async () => {
    expect(await validate(Object.assign(new TenderChallanPdfDto(), { reference: "Ref/1", date: "2026-09-06", deliveryPlace: "Dhaka" }))).toEqual([]);
    expect(await validate(Object.assign(new TenderChallanPdfDto(), { deliveryPlace: "x".repeat(1000) }))).toEqual([]);
    for (const options of [{ reference: "x".repeat(121) }, { deliveryPlace: "x".repeat(1001) }, { date: "2026-02-30" }, { date: "not-a-date" }]) {
      expect((await validate(Object.assign(new TenderChallanPdfDto(), options))).length).toBeGreaterThan(0);
    }
  });
});
