import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type CmsWorkStatus } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { PlanLimitsService } from "../billing/plan-limits.service";
import { CreateCmsWorkDto } from "./dto/create-cms-work.dto";
import { QueryCmsWorkDto } from "./dto/query-cms-work.dto";
import { CreateWorkContactDto } from "./dto/create-work-contact.dto";

const includeRelations = { organizationMaster: { select: { id: true, shortName: true, fullName: true } } } satisfies Prisma.CmsWorkInclude;
type WorkRecord = Prisma.CmsWorkGetPayload<{ include: typeof includeRelations }>;

function toDto(record: WorkRecord) {
  return { ...record, contractValue: record.contractValue.toFixed(2) };
}

@Injectable()
export class CmsWorksService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogService: AuditLogService, private readonly planLimits: PlanLimitsService) {}

  private where(organizationId: string, query: QueryCmsWorkDto): Prisma.CmsWorkWhereInput {
    return {
      organizationId,
      status: query.status ?? (query.includeClosed ? { not: "CANCELLED" } : "ONGOING"),
      ...(query.organizationMasterId ? { organizationMasterId: query.organizationMasterId } : {}),
      ...(query.workCategory ? { workCategory: query.workCategory } : {}),
      ...(query.completionDateFrom || query.completionDateTo ? { completionDate: {
        ...(query.completionDateFrom ? { gte: new Date(query.completionDateFrom) } : {}),
        ...(query.completionDateTo ? { lte: new Date(`${query.completionDateTo}T23:59:59.999Z`) } : {}),
      } } : {}),
      ...(query.search ? { OR: [
        { workName: { contains: query.search, mode: "insensitive" } },
        { organizationMaster: { shortName: { contains: query.search, mode: "insensitive" } } },
        { organizationMaster: { fullName: { contains: query.search, mode: "insensitive" } } },
      ] } : {}),
    };
  }

  async findAll(organizationId: string, query: QueryCmsWorkDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const where = this.where(organizationId, query);
    const [items, total] = await Promise.all([
      this.prisma.cmsWork.findMany({
        where,
        include: includeRelations,
        orderBy: query.status === "ARCHIVED" ? [{ completionDate: "desc" }, { id: "asc" }] : { id: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cmsWork.count({ where }),
    ]);
    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string, status: CmsWorkStatus = "ONGOING") {
    const [workCount, aggregate] = await Promise.all([
      this.prisma.cmsWork.count({ where: { organizationId, status } }),
      this.prisma.cmsWork.aggregate({ where: { organizationId, status }, _sum: { contractValue: true } }),
    ]);
    return {
      ongoingWorks: status === "ONGOING" ? workCount : 0,
      archivedWorks: status === "ARCHIVED" ? workCount : 0,
      totalWorkValue: (aggregate._sum.contractValue ?? 0).toString(),
    };
  }

  async findOne(organizationId: string, id: string) {
    const work = await this.prisma.cmsWork.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!work) throw new NotFoundException("Work not found");
    return toDto(work);
  }

  async overview(organizationId: string, id: string) {
    const work = await this.prisma.cmsWork.findFirst({
      where: { id, organizationId },
      include: {
        organizationMaster: { select: { id: true, shortName: true, fullName: true } },
        pgBgWorkflow: { include: { contact: true } },
        contracts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!work) throw new NotFoundException("Work not found");

    const [contacts, expenses, receipts] = await Promise.all([
      this.prisma.organizationContact.findMany({
        where: { organizationId, organizationMasterId: work.organizationMasterId },
        orderBy: [{ createdAt: "asc" }, { name: "asc" }],
      }),
      this.prisma.expense.findMany({
        where: { organizationId, workId: id, status: { in: ["PENDING", "APPROVED"] } },
        include: { expenseHead: true, expenseBy: true },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.receipt.findMany({
        where: { organizationId, workId: id, status: { in: ["PENDING", "RECEIVED"] } },
        orderBy: [{ receiptDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const primaryContact = work.pgBgWorkflow?.contact ?? contacts[0] ?? null;
    const otherContacts = contacts.filter((contact) => contact.id !== primaryContact?.id);
    const contract = work.contracts[0] ?? null;
    const securityRate = contract?.securityDepositPct ?? null;
    const vatRate = contract?.vatPct ?? null;
    const taxRate = contract?.taxPct ?? null;
    const contractValue = contract?.currentContractValue ?? work.contractValue;
    const valueExcludingVat = vatRate ? contractValue.div(new Prisma.Decimal(1).plus(vatRate.div(100))) : null;
    const vatAmount = valueExcludingVat ? contractValue.minus(valueExcludingVat) : null;
    const taxAmount = valueExcludingVat && taxRate ? valueExcludingVat.mul(taxRate).div(100) : null;
    const valueAfterVatTax = valueExcludingVat && taxAmount ? valueExcludingVat.minus(taxAmount) : null;
    const sdConfigured = Boolean(securityRate?.gt(0) && contract?.securityDepositMethod && valueAfterVatTax);
    const securityState = securityRate?.gt(0) ? (sdConfigured ? "CONFIGURED" : "NOT_CONFIGURED") : "NOT_APPLICABLE";
    const securityAmount = sdConfigured ? valueAfterVatTax!.mul(securityRate!).div(100) : null;
    const releasedAmount = contract?.securityDepositReleasedAmount ?? new Prisma.Decimal(0);
    const heldAmount = securityAmount ? (contract?.securityDepositStatus === "RELEASED" ? new Prisma.Decimal(0) : Prisma.Decimal.max(0, securityAmount.minus(releasedAmount))) : null;
    const netReceivableAfterSd = valueAfterVatTax && heldAmount ? valueAfterVatTax.minus(heldAmount) : valueAfterVatTax;
    const totalExpense = expenses.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
    const receivedRows = receipts.filter((row) => row.status === "RECEIVED");
    const totalReceipt = receivedRows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
    const balanceReceivable = netReceivableAfterSd ? netReceivableAfterSd.minus(totalReceipt) : null;
    const currentMarginPct = valueAfterVatTax?.gt(0) ? totalReceipt.minus(totalExpense).div(valueAfterVatTax).mul(100) : null;
    const transactions = [
      ...expenses.map((row) => ({ id: row.id, date: row.expenseDate.toISOString(), type: "EXPENSE" as const, item: row.expenseHead?.name ?? row.category ?? "Project Expense", amount: row.amount.toFixed(2), party: row.expenseBy?.name ?? "-", referenceNo: row.referenceNo, remarks: row.description })),
      ...receipts.map((row) => ({ id: row.id, date: row.receiptDate.toISOString(), type: "RECEIPT" as const, item: row.description ?? row.receiptType.replaceAll("_", " "), amount: row.amount.toFixed(2), party: row.receivedFrom, referenceNo: row.referenceNo ?? row.receiptNo, remarks: row.description })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      project: {
        id: work.id,
        workName: work.workName,
        workCategory: work.workCategory,
        contractValue: work.contractValue.toFixed(2),
        status: work.status,
        startDate: work.startDate,
        expectedCompletionDate: work.expectedCompletionDate,
        completionDate: work.completionDate,
        organizationMaster: work.organizationMaster,
        contractId: contract?.id ?? null,
      },
      primaryContact,
      otherContacts,
      financial: {
        contractValue: contractValue.toFixed(2),
        vatRate: vatRate?.toFixed(2) ?? null,
        vatAmount: vatAmount?.toFixed(2) ?? null,
        taxRate: taxRate?.toFixed(2) ?? null,
        taxAmount: taxAmount?.toFixed(2) ?? null,
        valueAfterVatTax: valueAfterVatTax?.toFixed(2) ?? null,
        securityDeposit: { state: securityState, rate: securityRate?.toFixed(2) ?? null, amount: securityAmount?.toFixed(2) ?? null, heldAmount: heldAmount?.toFixed(2) ?? null, method: contract?.securityDepositMethod ?? null, status: contract?.securityDepositStatus ?? null, releasedDate: contract?.securityDepositReleasedDate?.toISOString() ?? null },
        netReceivableAfterSd: netReceivableAfterSd?.toFixed(2) ?? null,
      },
      transactions,
      summary: { totalExpense: totalExpense.toFixed(2), totalReceipt: totalReceipt.toFixed(2), securityDepositHeld: heldAmount?.toFixed(2) ?? null, balanceReceivable: balanceReceivable?.toFixed(2) ?? null, currentMarginPct: currentMarginPct?.toFixed(2) ?? null },
    };
  }

  async addContact(organizationId: string, workId: string, dto: CreateWorkContactDto) {
    const work = await this.prisma.cmsWork.findFirst({ where: { id: workId, organizationId }, select: { organizationMasterId: true } });
    if (!work) throw new NotFoundException("Work not found");
    const duplicate = await this.prisma.organizationContact.findFirst({
      where: { organizationId, organizationMasterId: work.organizationMasterId, mobile: dto.mobile.trim() },
    });
    if (duplicate) throw new BadRequestException("A contact with this mobile number already exists");
    return this.prisma.organizationContact.create({
      data: {
        organizationId,
        organizationMasterId: work.organizationMasterId,
        name: dto.name.trim(),
        designation: dto.designation.trim(),
        mobile: dto.mobile.trim(),
        email: dto.email?.trim() || null,
        address: dto.address?.trim() || "Not provided",
      },
    });
  }

  async create(organizationId: string, userId: string, dto: CreateCmsWorkDto) {
    await this.planLimits.assertCanCreateProject(organizationId);
    const master = await this.prisma.organizationMaster.findFirst({ where: { id: dto.organizationMasterId, organizationId } });
    if (!master) throw new NotFoundException("Organization not found");

    let documentPurchaseId: string | null = null;
    let tender: { status: string; awardedAt: Date | null } | null = null;
    if (dto.tenderId) {
      tender = await this.prisma.tender.findFirst({ where: { id: dto.tenderId, organizationId } });
      if (!tender) throw new NotFoundException("Tender not found");

      const duplicate = await this.prisma.cmsWork.findFirst({
        where: { organizationId, tenderId: dto.tenderId, status: { not: "CANCELLED" } },
      });
      if (duplicate) throw new BadRequestException("An ongoing or archived work already exists for this tender");

      const purchase = await this.prisma.documentPurchase.findFirst({
        where: { organizationId, linkedTenderId: dto.tenderId, cmsWork: null },
      });
      documentPurchaseId = purchase?.id ?? null;
    }

    const work = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cmsWork.create({
        data: {
          organizationId,
          organizationMasterId: dto.organizationMasterId,
          workName: dto.workName,
          workCategory: dto.workCategory,
          contractValue: dto.contractValue,
          status: "ONGOING",
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          expectedCompletionDate: dto.expectedCompletionDate ? new Date(dto.expectedCompletionDate) : null,
          tenderId: dto.tenderId ?? null,
          documentPurchaseId,
          createdById: userId,
        },
        include: includeRelations,
      });

      if (dto.tenderId && tender && !["ONGOING", "COMPLETED", "CANCELLED"].includes(tender.status)) {
        await tx.tender.update({
          where: { id: dto.tenderId, organizationId },
          data: { status: "ONGOING", awardedAt: tender.awardedAt ?? new Date() },
        });
      }

      return created;
    });

    await this.auditLogService.record({ organizationId, userId, action: "create", entityType: "CmsWork", entityId: work.id, newValue: toDto(work) });
    return toDto(work);
  }

  async archive(organizationId: string, userId: string, id: string) {
    await this.findOne(organizationId, id);
    const work = await this.prisma.cmsWork.update({ where: { id, organizationId }, data: { status: "ARCHIVED", completionDate: new Date() }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "update", entityType: "CmsWork", entityId: id, newValue: toDto(work) });
    return toDto(work);
  }

  async restore(organizationId: string, userId: string, id: string) {
    const existing = await this.findOne(organizationId, id);
    const work = await this.prisma.cmsWork.update({ where: { id, organizationId }, data: { status: "ONGOING", completionDate: null }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "update", entityType: "CmsWork", entityId: id, oldValue: existing, newValue: toDto(work) });
    return toDto(work);
  }

  async exportCsv(organizationId: string, query: QueryCmsWorkDto) {
    const where = this.where(organizationId, query);
    const rows = await this.prisma.cmsWork.findMany({
      where,
      include: includeRelations,
      orderBy: [{ completionDate: "desc" }, { id: "asc" }],
    });
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const lines = [
      ["SL", "Work / Project Name", "Organization", "Work Category", "Work Value (BDT)", "Completion Date"].map(escape).join(","),
      ...rows.map((row, index) => [
        String(index + 1),
        row.workName,
        row.organizationMaster.shortName,
        row.workCategory,
        row.contractValue.toFixed(2),
        row.completionDate?.toISOString().slice(0, 10) ?? "",
      ].map(escape).join(",")),
    ];
    return { filename: `archived-works-${new Date().toISOString().slice(0, 10)}.csv`, content: `\uFEFF${lines.join("\r\n")}` };
  }

  async categories(organizationId: string) {
    const rows = await this.prisma.cmsWork.findMany({ where: { organizationId }, distinct: ["workCategory"], select: { workCategory: true }, orderBy: { workCategory: "asc" } });
    return rows.map((row) => row.workCategory);
  }
}
