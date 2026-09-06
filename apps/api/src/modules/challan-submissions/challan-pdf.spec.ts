import { Prisma } from "@bizovix/database";
import type { AuthUser } from "@bizovix/types";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { ChallanPdfService } from "./challan-pdf.service";
import { ChallanSubmissionsController } from "./challan-submissions.controller";
import { ChallanSubmissionsService } from "./challan-submissions.service";
import { challanDeliveryAddress, challanQuantity, CHALLAN_HEADINGS, generateChallanLetterPdf } from "./challan-letter-pdf";
import { PERMISSIONS_KEY } from "../../common/decorators/require-permissions.decorator";

function setup() {
  const record = {
    challanNo: "CH-001", challanDate: new Date("2026-09-05"), receivedAt: "Saved delivery site", cmsWorkId: "work-a",
    cmsWork: { organizationId: "org-a", tenderId: "tender-a", documentPurchase: null },
    contract: { organizationId: "org-a", cmsWorkId: "work-a", tenderId: "tender-a", contractNo: "WO-42", contractDate: null, issueDate: new Date("2026-06-04"), contractType: "WORK_ORDER" },
    items: [{ description: "Display\nBrand: Brand A\nModel: A1", unit: "Pcs", quantity: new Prisma.Decimal("2.500") }],
  };
  const tender = { egpTenderId: "1318963", paName: "Saved PA", paDesignation: "Deputy Secretary", paAddress: "Saved PA office", noticeOrganization: "Notice Organization", organizationMaster: null };
  const db = { challanSubmission: { findFirst: jest.fn().mockResolvedValue(record) }, tender: { findFirst: jest.fn().mockResolvedValue(tender) } };
  return { service: new ChallanPdfService(db as unknown as PrismaService), db, record, tender };
}

describe("Non-financial Challan PDF", () => {
  it("removes only leading address labels, preserving the full address and line breaks", () => {
    for (const prefix of ["Address:", " Address : ", "ADDRESS:\n", "Address : Address:\n", "Address："]) {
      expect(challanDeliveryAddress(`${prefix}House 7\nDhaka-1000`)).toBe("House 7\nDhaka-1000");
    }
    for (const address of ["Address Road, Dhaka", "The Address: Building A", "Dhaka-1000"]) expect(challanDeliveryAddress(address)).toBe(address);
    for (const address of [null, undefined, "", "Address : "]) expect(challanDeliveryAddress(address)).toBe("");
  });
  it("uses only the selected tenant's saved goods, delivery place and linked tender PA", async () => {
    const { service, db } = setup();
    const letter = await service.letter("org-a", "challan-a");
    expect(db.challanSubmission.findFirst.mock.calls[0]![0].where).toEqual({ id: "challan-a", organizationId: "org-a" });
    expect(db.tender.findFirst.mock.calls[0]![0].where).toEqual({ id: "tender-a", organizationId: "org-a" });
    expect(letter.reference).toBe("CH-001");
    expect(letter.recipient).toEqual({ name: "Saved PA", designation: "Deputy Secretary", address: "Saved PA office", organization: "Notice Organization" });
    expect(letter.rows).toEqual([{ description: "Display\nBrand: Brand A\nModel: A1", unit: "Pcs", quantity: "2.500", deliveryPlace: "Saved delivery site" }]);
    expect(letter.contract).toEqual({ number: "WO-42", label: "Work Order No", date: "2026-06-04T00:00:00.000Z" });
    const select = db.challanSubmission.findFirst.mock.calls[0]![0].select;
    expect(select.items.select).toEqual({ description: true, unit: true, quantity: true });
    expect(JSON.stringify(letter)).not.toMatch(/unitPrice|rate|amount|total|discount|BDT/i);
  });
  it("rejects missing or cross-tenant challans before looking up any tender", async () => {
    const { service, db, record } = setup();
    db.challanSubmission.findFirst.mockResolvedValue(null);
    await expect(service.letter("org-a", "missing")).rejects.toThrow("Challan not found");
    db.challanSubmission.findFirst.mockResolvedValue({ ...record, cmsWork: { ...record.cmsWork, organizationId: "other" } });
    await expect(service.letter("org-a", "bad-link")).rejects.toThrow("Challan not found");
    expect(db.tender.findFirst).not.toHaveBeenCalled();
  });
  it("rejects an empty challan and never fabricates sample products", async () => {
    const { service, db, record } = setup();
    db.challanSubmission.findFirst.mockResolvedValue({ ...record, items: [] });
    await expect(service.pdf("org-a", "empty")).rejects.toThrow("Add goods and save");
  });
  it("does not substitute another contact when linked PA data is absent", async () => {
    const { service, db, record } = setup();
    db.challanSubmission.findFirst.mockResolvedValue({ ...record, contract: null });
    db.tender.findFirst.mockResolvedValue(null);
    const letter = await service.letter("org-a", "challan-a");
    expect(letter.recipient).toEqual({ name: null, designation: null, address: null, organization: null });
    expect(letter.contract).toBeNull();
    expect(letter.tenderNumber).toBeNull();
  });
  it("ignores contracts outside this tenant/project and uses the explicitly linked project tender", async () => {
    const { service, db, record } = setup();
    db.challanSubmission.findFirst.mockResolvedValue({ ...record, contract: { ...record.contract, cmsWorkId: "other-work", tenderId: "other-tender" } });
    expect((await service.letter("org-a", "challan-a")).contract).toBeNull();
    expect(db.tender.findFirst.mock.calls[0]![0].where.id).toBe("tender-a");
  });
  it("supports the same-tenant document-purchase tender link without guessing by work name", async () => {
    const { service, db, record } = setup();
    db.challanSubmission.findFirst.mockResolvedValue({ ...record, contract: null, cmsWork: { ...record.cmsWork, tenderId: null, documentPurchase: { organizationId: "org-a", linkedTenderId: "purchase-tender" } } });
    await service.letter("org-a", "challan-a");
    expect(db.tender.findFirst.mock.calls[0]![0].where.id).toBe("purchase-tender");
  });
  it("generates a real PDF, with no save/submit/payment calls", async () => {
    const { service } = setup();
    const result = await service.pdf("org-a", "challan-a");
    expect(result.reference).toBe("CH-001");
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    await expect(generateChallanLetterPdf({ ...(await service.letter("org-a", "challan-a")), rows: [] })).rejects.toThrow("Add goods");
  });
  it("requires challan read permission and serves a private PDF attachment", async () => {
    const { service } = setup();
    const controller = new ChallanSubmissionsController({} as ChallanSubmissionsService, service);
    const response = { setHeader: jest.fn(), send: jest.fn() };
    await controller.pdf("challan-a", { organizationId: "org-a" } as AuthUser, response as unknown as Response);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, controller.pdf)).toEqual(["challan_submission.read"]);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="challan-CH-001.pdf"');
    expect(response.send).toHaveBeenCalledWith(expect.any(Buffer));
  });
  it("has precisely the five reference columns and preserves fractional quantities", () => {
    expect(CHALLAN_HEADINGS).toEqual(["Sl. No.", "Name of Goods", "Unit", "Qty", "Place of Delivery"]);
    expect(challanQuantity("1.000")).toBe("01");
    expect(challanQuantity("35.000")).toBe("35");
    expect(challanQuantity("24.500")).toBe("24.5");
    expect(challanQuantity("100.000")).toBe("100");
  });
});
