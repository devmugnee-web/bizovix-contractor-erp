import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { CostedTenderBillSummary, ProjectCostingReport } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { PrismaService } from "../prisma/prisma.service";
import { readPaSnapshot, tenderPaContact, tenderPaSelect } from "../tenders/tender-pa";
import type { BillLetterContext } from "./bill-letter-pdf";

const completedCostingWhere = (organizationId: string): Prisma.TenderCostingWhereInput => ({
  organizationId, status: "COMPLETED", items: { some: { organizationId, costingStatus: "COSTED" } },
});
const rate = (item: { quantity: Prisma.Decimal; totalCost: Prisma.Decimal }) => item.quantity.gt(0) ? item.totalCost.div(item.quantity).toFixed(6) : "0.000000";

@Injectable()
export class ProjectCostingReportService {
  constructor(private readonly prisma: PrismaService) {}

  async tenderPdfContext(organizationId: string, costingId: string, tenderId: string): Promise<BillLetterContext> {
    // Called only after tenderReport has validated the tenant and completed costing.
    const [company, contracts, items] = await Promise.all([
      this.prisma.companyProfile.findUnique({ where: { organizationId }, select: { legalName: true, displayName: true } }),
      this.prisma.projectContract.findMany({
        where: { organizationId, tenderId, status: { in: ["ACTIVE", "COMPLETED", "CLOSED"] } },
        take: 2, orderBy: { id: "asc" },
        select: { contractNo: true, issueDate: true, contractDate: true, contractType: true },
      }),
      this.prisma.tenderCostingItem.findMany({
        where: { organizationId, costingId, costingStatus: "COSTED" },
        select: { id: true, secondaryDescription: true },
      }),
    ]);
    const contract = contracts.length === 1 ? contracts[0] : undefined;
    return {
      payeeName: company?.legalName || company?.displayName || null,
      // No bill has been created here: leave its reference/issue date unassigned.
      reference: null, date: null,
      contract: contract ? {
        number: contract.contractNo, date: (contract.contractDate ?? contract.issueDate).toISOString(),
        label: contract.contractType === "WORK_ORDER" ? "Work Order No" : "Contract No",
      } : null,
      productDetails: Object.fromEntries(items.filter((item) => !!item.secondaryDescription?.trim()).map((item) => [item.id, item.secondaryDescription!.trim()])),
    };
  }

  async costedTenders(organizationId: string, query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 12, 100);
    const search = query.search?.trim();
    const where: Prisma.TenderCostingWhereInput = { ...completedCostingWhere(organizationId), ...(search ? { tender: { OR: [
      { egpTenderId: { contains: search, mode: "insensitive" } },
      { workName: { contains: search, mode: "insensitive" } },
      { paName: { contains: search, mode: "insensitive" } },
    ] } } : {}) };
    const [records, total] = await Promise.all([
      this.prisma.tenderCosting.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: {
        id: true, tenderId: true, estimatedCost: true,
        tender: { select: { egpTenderId: true, workName: true, paName: true } },
        _count: { select: { items: { where: { organizationId, costingStatus: "COSTED" } } } },
        items: { where: { organizationId, costingStatus: "COSTED" }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1, select: { quantity: true, totalCost: true } },
      } }),
      this.prisma.tenderCosting.count({ where }),
    ]);
    const items: CostedTenderBillSummary[] = records.map((record) => ({
      id: record.id, tenderId: record.tenderId, tenderNumber: record.tender.egpTenderId, workName: record.tender.workName,
      paName: record.tender.paName || null, itemCount: record._count.items,
      unitRate: record._count.items === 1 && record.items[0] ? rate(record.items[0]) : null,
      grandTotal: record.estimatedCost.toFixed(2),
    }));
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  async tenderReport(organizationId: string, costingId: string): Promise<ProjectCostingReport> {
    const costing = await this.prisma.tenderCosting.findFirst({ where: { ...completedCostingWhere(organizationId), id: costingId }, select: {
      id: true, costingDate: true, estimatedCost: true, freightCost: true, installationCost: true, otherCost: true, contingencyAmount: true,
      tender: { select: { ...tenderPaSelect, egpTenderId: true, workName: true, noticeOrganization: true, organizationMaster: { select: { fullName: true, shortName: true } } } },
      items: { where: { organizationId, costingStatus: "COSTED" }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, description: true, unit: true, quantity: true, totalCost: true } },
    } });
    if (!costing) throw new NotFoundException("Completed tender costing not found");
    const tender = costing.tender;
    const adjustments = [
      { label: "Freight Cost", value: costing.freightCost }, { label: "Installation Cost", value: costing.installationCost },
      { label: "Other Cost", value: costing.otherCost }, { label: "Contingency", value: costing.contingencyAmount },
    ].filter((entry) => !entry.value.isZero()).map((entry) => ({ label: entry.label, amount: entry.value.toFixed(2) }));
    return {
      // This is a tender report, not a new CmsWork/project or a submitted bill.
      source: "TENDER_COSTING", project: { id: tender.id, workName: tender.workName, organizationName: tender.noticeOrganization || tender.organizationMaster?.fullName || tender.organizationMaster?.shortName || "" },
      tenderNumber: tender.egpTenderId, costingDate: costing.costingDate.toISOString(),
      // Add New Tender is the sole PA source here. No unrelated project/client contact fallback.
      pa: { name: tender.paName || null, designation: tender.paDesignation || null, phone: tender.paPhone || null, address: tender.paAddress || null, email: null },
      rows: costing.items.map((item) => ({ id: item.id, productName: item.description, unit: item.unit, quantity: item.quantity.toFixed(3), unitPrice: rate(item), totalPrice: item.totalCost.toFixed(2) })),
      itemsTotalPrice: costing.items.reduce((sum, item) => sum.plus(item.totalCost), new Prisma.Decimal(0)).toFixed(2),
      adjustments, totalPrice: costing.estimatedCost.toFixed(2), emptyReason: costing.items.length ? null : "NO_COSTED_ITEMS",
    };
  }

  async report(organizationId: string, workId: string): Promise<ProjectCostingReport> {
    const work = await this.prisma.cmsWork.findFirst({
      where: { id: workId, organizationId },
      select: {
        id: true, workName: true, tenderId: true, organizationMasterId: true,
        organizationMaster: { select: { fullName: true, shortName: true } },
        documentPurchase: { select: { linkedTenderId: true, organizationId: true } },
        pgBgWorkflow: { select: {
          organizationId: true, organizationMasterId: true, contactSnapshot: true,
          contact: { select: { organizationId: true, organizationMasterId: true, name: true, designation: true, mobile: true, email: true, address: true } },
        } },
      },
    });
    if (!work) throw new NotFoundException("Project not found");
    // BOQ belongs directly to this project. A tender costing is neither required nor substituted.
    const tenderId = work.tenderId ?? (work.documentPurchase?.organizationId === organizationId ? work.documentPurchase.linkedTenderId : null);
    const project = { id: work.id, workName: work.workName, organizationName: work.organizationMaster.fullName || work.organizationMaster.shortName };
    const [items, tender] = await Promise.all([
      this.prisma.boqItem.findMany({
        where: { organizationId, cmsWorkId: workId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, description: true, unit: true, contractQty: true, unitRate: true, contractAmount: true },
      }),
      tenderId ? this.prisma.tender.findFirst({ where: { id: tenderId, organizationId }, select: { ...tenderPaSelect, egpTenderId: true } }) : null,
    ]);
    // Match Project Overview: saved project contact, linked tender PA, then the client's contact.
    // Never combine fields from different people or read a different tenant's contact.
    const workflow = work.pgBgWorkflow?.organizationId === organizationId && work.pgBgWorkflow.organizationMasterId === work.organizationMasterId ? work.pgBgWorkflow : null;
    const contact = workflow?.contact?.organizationId === organizationId && workflow.contact.organizationMasterId === work.organizationMasterId ? workflow.contact : null;
    const pa = readPaSnapshot(workflow?.contactSnapshot) ?? contact ?? tenderPaContact(tender)
      ?? await this.prisma.organizationContact.findFirst({
        where: { organizationId, organizationMasterId: work.organizationMasterId },
        orderBy: [{ createdAt: "asc" }, { name: "asc" }],
        select: { name: true, designation: true, mobile: true, email: true, address: true },
      });
    const rows = items.map((item) => ({
      id: item.id, productName: item.description, unit: item.unit, quantity: item.contractQty.toFixed(3),
      unitPrice: item.unitRate.toFixed(2), totalPrice: item.contractAmount.toFixed(2),
    }));
    return {
      project, tenderNumber: tender?.egpTenderId ?? null, source: "PROJECT_BOQ",
      pa: { name: pa?.name || null, designation: pa?.designation || null, phone: pa?.mobile || null, email: pa?.email || null, address: pa?.address || null },
      rows, totalPrice: items.reduce((sum, item) => sum.plus(item.contractAmount), new Prisma.Decimal(0)).toFixed(2),
      emptyReason: rows.length ? null : "NO_BOQ_ITEMS",
    };
  }
}
