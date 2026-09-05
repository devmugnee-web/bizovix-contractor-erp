import "reflect-metadata";
import { Prisma } from "@bizovix/database";
import { PgBgService } from "./pg-bg.service";
import { tenderPaContact, readPaSnapshot } from "../tenders/tender-pa";

const tender = { id: "tender-1", paName: "Engineer Karim", paDesignation: "Executive Engineer", paPhone: "01700123456", paAddress: "Port Road" };
const savedContact = { id: "contact-1", name: "Previously saved officer", designation: "Engineer", mobile: "01800123456", address: "Old Office", email: null };

function setup(snapshot: typeof savedContact | null = null) {
  const tx = {
    organizationContact: { upsert: jest.fn().mockResolvedValue({ id: "contact-1" }) },
    pgBgWorkflow: { upsert: jest.fn(async (args) => ({
      id: "workflow-1", ...args.create, contactSnapshot: args.update.contactSnapshot,
      contact: savedContact, tenderSecurityAmount: new Prisma.Decimal(0), noaAmount: null,
    })) },
  };
  const prisma = {
    documentPurchase: { findFirst: jest.fn().mockResolvedValue({ id: "purchase-1", purchaseType: "EGP", category: "Supply", organizationMasterId: "master-1", linkedTender: tender, cmsWork: null }) },
    pgBgWorkflow: { findFirst: jest.fn().mockResolvedValue(snapshot ? { status: "DRAFT", contactSnapshot: snapshot, contact: savedContact } : null) },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
  return { tx, prisma, service: new PgBgService(prisma as never, { record: jest.fn() } as never) };
}

describe("Tender-specific PA propagation", () => {
  it("keeps phone numbers as text and leaves missing contacts empty", () => {
    expect(tenderPaContact(tender)?.mobile).toBe("01700123456");
    expect(tenderPaContact(null)).toBeNull();
    expect(readPaSnapshot({ name: "incomplete" })).toBeNull();
  });

  it("defaults a new workflow from its linked tender without changing shared contacts", async () => {
    const { service, tx, prisma } = setup();
    const result = await service.saveDraft("org-1", "user-1", { documentPurchaseId: "purchase-1" });
    expect(prisma.documentPurchase.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "purchase-1", organizationId: "org-1" } }));
    expect(result.contact).toMatchObject({ name: tender.paName, mobile: tender.paPhone });
    expect(tx.organizationContact.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });

  it("preserves a workflow snapshot when the tender contact later changes", async () => {
    const { service } = setup(savedContact);
    const result = await service.saveDraft("org-1", "user-1", { documentPurchaseId: "purchase-1" });
    expect(result.contact).toEqual(savedContact);
  });

  it("allows a workflow-specific contact edit without updating another document's contact", async () => {
    const { service, tx } = setup(savedContact);
    const result = await service.saveDraft("org-1", "user-1", { documentPurchaseId: "purchase-1", contact: { name: "Replacement Officer" } });
    expect(result.contact).toMatchObject({ name: "Replacement Officer", mobile: savedContact.mobile });
    expect(tx.organizationContact.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });
});
