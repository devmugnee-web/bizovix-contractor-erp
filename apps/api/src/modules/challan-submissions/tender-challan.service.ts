import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import type { CostedTenderChallanSummary, TenderChallanReport, TenderChallanPdfOptions } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { PrismaService } from "../prisma/prisma.service";
import { challanDeliveryAddress, generateChallanLetterPdf, type ChallanLetter } from "./challan-letter-pdf";
import { generateChallanLetterWord } from "./challan-letter-word";

// Same eligibility as Bill Submission. No project/BOQ/submission is required.
const completedWhere = (organizationId: string): Prisma.TenderCostingWhereInput => ({
  organizationId, status: "COMPLETED", items: { some: { organizationId, costingStatus: "COSTED" } },
});

export function tenderChallanLetter(report: TenderChallanReport, options: TenderChallanPdfOptions = {}): ChallanLetter {
  return {
    reference: options.reference?.trim() ?? "", date: options.date ?? "", tenderNumber: report.tenderNumber,
    recipient: { name: report.pa.name, designation: report.pa.designation, address: report.pa.address, organization: report.organizationName || null },
    contract: report.contract,
    rows: report.rows.map((row) => ({
      description: row.productName + (row.details && !row.productName.includes(row.details) ? `\n${row.details}` : ""),
      unit: row.unit, quantity: row.quantity, deliveryPlace: challanDeliveryAddress(options.deliveryPlace) || challanDeliveryAddress(report.pa.address),
    })),
  };
}

@Injectable()
export class TenderChallanService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 12, 100);
    const search = query.search?.trim();
    const where: Prisma.TenderCostingWhereInput = { ...completedWhere(organizationId), ...(search ? { tender: { OR: [
      { egpTenderId: { contains: search, mode: "insensitive" } }, { workName: { contains: search, mode: "insensitive" } }, { paName: { contains: search, mode: "insensitive" } },
    ] } } : {}) };
    const [records, total] = await Promise.all([
      this.prisma.tenderCosting.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: {
        id: true, tenderId: true, tender: { select: { egpTenderId: true, workName: true, paName: true } },
        _count: { select: { items: { where: { organizationId, costingStatus: "COSTED" } } } },
      } }),
      this.prisma.tenderCosting.count({ where }),
    ]);
    const items: CostedTenderChallanSummary[] = records.map((record) => ({
      id: record.id, tenderId: record.tenderId, tenderNumber: record.tender.egpTenderId, workName: record.tender.workName,
      paName: record.tender.paName || null, itemCount: record._count.items,
    }));
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  async report(organizationId: string, costingId: string): Promise<TenderChallanReport> {
    const costing = await this.prisma.tenderCosting.findFirst({ where: { ...completedWhere(organizationId), id: costingId }, select: {
      tenderId: true, costingDate: true,
      tender: { select: { egpTenderId: true, workName: true, paName: true, paDesignation: true, paPhone: true, paAddress: true, noticeOrganization: true, organizationMaster: { select: { fullName: true, shortName: true } } } },
      items: { where: { organizationId, costingStatus: "COSTED" }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, description: true, secondaryDescription: true, unit: true, quantity: true } },
    } });
    if (!costing) throw new NotFoundException("Completed tender costing not found");
    const contracts = await this.prisma.projectContract.findMany({
      where: { organizationId, tenderId: costing.tenderId, status: { in: ["ACTIVE", "COMPLETED", "CLOSED"] } },
      take: 2, orderBy: { id: "asc" }, select: { contractNo: true, contractDate: true, issueDate: true, contractType: true },
    });
    // Never choose arbitrarily between different contracts. Delivery defaults to this tender's PA address.
    const contract = contracts.length === 1 ? contracts[0] : undefined;
    const tender = costing.tender;
    return {
      tenderId: costing.tenderId, tenderNumber: tender.egpTenderId, workName: tender.workName, costingDate: costing.costingDate.toISOString(),
      organizationName: tender.noticeOrganization || tender.organizationMaster?.fullName || tender.organizationMaster?.shortName || "",
      pa: { name: tender.paName || null, designation: tender.paDesignation || null, phone: tender.paPhone || null, address: tender.paAddress || null },
      contract: contract ? { number: contract.contractNo, date: (contract.contractDate ?? contract.issueDate).toISOString(), label: contract.contractType === "WORK_ORDER" ? "Work Order No" : "Contract No" } : null,
      rows: costing.items.map((item) => ({ id: item.id, productName: item.description, details: item.secondaryDescription?.trim() || null, unit: item.unit, quantity: item.quantity.toFixed(3) })),
    };
  }

  async pdf(organizationId: string, costingId: string, options: TenderChallanPdfOptions) {
    const report = await this.report(organizationId, costingId);
    return { buffer: await generateChallanLetterPdf(tenderChallanLetter(report, options)), tenderNumber: report.tenderNumber };
  }

  async word(organizationId: string, costingId: string, options: TenderChallanPdfOptions) {
    const report = await this.report(organizationId, costingId);
    return { buffer: await generateChallanLetterWord(tenderChallanLetter(report, options)), tenderNumber: report.tenderNumber };
  }
}
