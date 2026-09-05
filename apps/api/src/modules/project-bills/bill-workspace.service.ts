import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { BillSource, BillPreparation } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { tenderPaContact, tenderPaSelect } from "../tenders/tender-pa";
import { QueryBillSourceDto } from "./dto/query-bill-source.dto";
import { billQuantities, COMMITTED_BILL_STATUSES } from "./bill-availability";

const projectSelect = { id: true, workName: true, status: true } as const;
const tenderSelect = {
  ...tenderPaSelect, egpTenderId: true, workName: true, noticeOrganization: true,
  organizationMaster: { select: { shortName: true } },
  costing: { select: { id: true, _count: { select: { items: { where: { costingStatus: "COSTED" } } } } } },
} as const;

@Injectable()
export class BillWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async sources(organizationId: string, query: QueryBillSourceDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 5, 50);
    const search = query.search?.trim();
    if (query.kind === "projects") {
      const where: Prisma.CmsWorkWhereInput = { organizationId, ...(search ? { OR: [
        { workName: { contains: search, mode: "insensitive" } },
        { tender: { egpTenderId: { contains: search, mode: "insensitive" } } },
      ] } : {}) };
      const [rows, total] = await Promise.all([
        this.prisma.cmsWork.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          select: { ...projectSelect, tender: { select: tenderSelect }, organizationMaster: { select: { shortName: true } } } }),
        this.prisma.cmsWork.count({ where }),
      ]);
      const items: BillSource[] = rows.map((work) => ({
        id: work.id, kind: "projects", name: work.workName,
        tenderId: work.tender?.id ?? null, tenderNumber: work.tender?.egpTenderId ?? null,
        organization: work.organizationMaster.shortName,
        pa: tenderPaContact(work.tender), costingId: work.tender?.costing?.id ?? null,
        costedItemCount: work.tender?.costing?._count.items ?? 0, projects: [{ id: work.id, workName: work.workName, status: work.status }],
      }));
      return { items, meta: buildPaginationMeta(total, page, limit) };
    }
    const where: Prisma.TenderWhereInput = { organizationId, costing: { items: { some: { costingStatus: "COSTED" } } }, ...(search ? { OR: [
      { workName: { contains: search, mode: "insensitive" } }, { egpTenderId: { contains: search, mode: "insensitive" } },
    ] } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.tender.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { ...tenderSelect, cmsWorks: { where: { organizationId }, select: projectSelect, orderBy: { createdAt: "desc" } } } }),
      this.prisma.tender.count({ where }),
    ]);
    const items: BillSource[] = rows.map((tender) => ({
      id: tender.id, kind: "tenders", name: tender.workName, tenderId: tender.id, tenderNumber: tender.egpTenderId,
      organization: tender.noticeOrganization || tender.organizationMaster?.shortName || "Not set",
      pa: tenderPaContact(tender), costingId: tender.costing?.id ?? null,
      costedItemCount: tender.costing?._count.items ?? 0, projects: tender.cmsWorks,
    }));
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  async costingItems(organizationId: string, tenderId: string) {
    const costing = await this.prisma.tenderCosting.findFirst({ where: { organizationId, tenderId }, select: {
      items: { where: { organizationId, costingStatus: "COSTED" }, orderBy: { sortOrder: "asc" },
        select: { id: true, description: true, unit: true, quantity: true } },
    } });
    if (!costing) throw new NotFoundException("Tender costing not found");
    return costing.items.map((item) => ({ ...item, quantity: item.quantity.toFixed(3) }));
  }

  async preparation(organizationId: string, cmsWorkId: string, excludeBillId?: string): Promise<BillPreparation> {
    const work = await this.prisma.cmsWork.findFirst({ where: { organizationId, id: cmsWorkId }, select: projectSelect });
    if (!work) throw new NotFoundException("Project not found");
    if (excludeBillId && !await this.prisma.projectBill.findFirst({ where: { id: excludeBillId, organizationId, cmsWorkId, status: "DRAFT" }, select: { id: true } })) {
      throw new NotFoundException("Draft bill not found on this project");
    }
    const [contracts, boq, history] = await Promise.all([
      this.prisma.projectContract.findMany({ where: { organizationId, cmsWorkId }, orderBy: [{ issueDate: "desc" }, { id: "asc" }],
        select: { id: true, contractNo: true, status: true, currency: true, currentContractValue: true, retentionPct: true } }),
      this.prisma.boqItem.findMany({ where: { organizationId, cmsWorkId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, itemCode: true, description: true, unit: true, contractQty: true, unitRate: true } }),
      this.prisma.projectBillItem.findMany({ where: { bill: { organizationId, cmsWorkId, status: { in: COMMITTED_BILL_STATUSES }, ...(excludeBillId ? { id: { not: excludeBillId } } : {}) } },
        select: { boqItemId: true, currentQty: true, bill: { select: { status: true } } } }),
    ]);
    const items = boq.map((item) => {
      const qty = billQuantities(item.contractQty, history.filter((row) => row.boqItemId === item.id));
      return { ...item, contractQty: item.contractQty.toFixed(3), unitRate: item.unitRate.toFixed(2),
        previousQty: qty.previous.toFixed(3), pendingQty: qty.pending.toFixed(3), remainingQty: qty.remaining.toFixed(3) };
    });
    const reason = ["COMPLETED", "ARCHIVED", "CANCELLED"].includes(work.status) ? "This project is closed. Reopen it before creating a bill."
      : !contracts.some((contract) => contract.status === "ACTIVE" && contract.currency === "BDT") ? "An active BDT contract is required."
      : !items.length ? "Add the agreed quantities and billing rates to the Contract BOQ first."
      : !items.some((item) => Number(item.remainingQty) > 0) ? "No billable quantity remains. Check the existing bills."
      : null;
    return { work, contracts: contracts.map((c) => ({ ...c, currentContractValue: c.currentContractValue.toFixed(2), retentionPct: c.retentionPct?.toFixed(2) ?? null })), items, ready: !reason, reason };
  }
}
