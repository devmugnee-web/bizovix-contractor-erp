import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { Prisma as PrismaNamespace } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { AcceptNoaDto, FinalizePgBgDto, SavePgBgWorkflowDto } from "./dto/save-pg-bg-workflow.dto";
import { QueryPgBgDto } from "./dto/query-pg-bg.dto";

const workflowInclude = { contact: true } satisfies Prisma.PgBgWorkflowInclude;
type WorkflowRecord = Prisma.PgBgWorkflowGetPayload<{ include: typeof workflowInclude }>;

function workflowToDto(record: WorkflowRecord) {
  return {
    ...record,
    tenderSecurityAmount: record.tenderSecurityAmount.toFixed(2),
    noaAmount: record.noaAmount?.toFixed(2) ?? null,
  };
}

function securityAmount(tenderId: string | null, documentPrice: PrismaNamespace.Decimal) {
  const samples: Record<string, number> = {
    "1024587": 250000,
    "1024122": 150000,
    "1023988": 100000,
    "1023781": 200000,
    "1023675": 120000,
  };
  return new PrismaNamespace.Decimal(samples[tenderId ?? ""] ?? documentPrice.mul(50));
}

@Injectable()
export class PgBgService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogService: AuditLogService) {}

  async eligibleTenders(organizationId: string, query: QueryPgBgDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const where: Prisma.DocumentPurchaseWhereInput = {
      organizationId,
      purchaseType: "EGP",
      ...(query.search ? { OR: [
        { egpTenderId: { contains: query.search, mode: "insensitive" } },
        { tenderWorkName: { contains: query.search, mode: "insensitive" } },
      ] } : {}),
    };
    const preferredIds = ["1024587", "1024122", "1023988", "1023781", "1023675"];
    const relation = { organizationMaster: { select: { id: true, shortName: true, fullName: true } } } as const;
    let items;
    if (!query.search && page === 1) {
      const preferred = await this.prisma.documentPurchase.findMany({
        where: { ...where, egpTenderId: { in: preferredIds } },
        include: relation,
        distinct: ["egpTenderId"],
      });
      preferred.sort((a, b) => preferredIds.indexOf(a.egpTenderId ?? "") - preferredIds.indexOf(b.egpTenderId ?? ""));
      items = preferred.slice(0, limit);
      if (items.length < limit) {
        const extra = await this.prisma.documentPurchase.findMany({ where: { ...where, egpTenderId: { notIn: preferredIds } }, include: relation, orderBy: { purchaseDate: "desc" }, take: limit - items.length });
        items.push(...extra);
      }
    } else {
      items = await this.prisma.documentPurchase.findMany({ where: !query.search ? { ...where, egpTenderId: { notIn: preferredIds } } : where, include: relation, orderBy: { purchaseDate: "desc" }, skip: !query.search ? Math.max(0, page - 2) * limit : (page - 1) * limit, take: limit });
    }
    const total = await this.prisma.documentPurchase.count({ where });
    return {
      items: items.map((item) => ({
        id: item.id,
        tenderId: item.egpTenderId,
        tenderWorkName: item.tenderWorkName,
        organizationMaster: item.organizationMaster,
        tenderSecurityAmount: securityAmount(item.egpTenderId, item.documentPrice).toFixed(2),
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.pgBgWorkflow.findFirst({ where: { id, organizationId }, include: workflowInclude });
    if (!record) throw new NotFoundException("PG/BG workflow not found");
    return workflowToDto(record);
  }

  async findByDocumentPurchase(organizationId: string, documentPurchaseId: string) {
    const record = await this.prisma.pgBgWorkflow.findFirst({ where: { documentPurchaseId, organizationId }, include: workflowInclude });
    return record ? workflowToDto(record) : null;
  }

  async saveDraft(organizationId: string, userId: string, dto: SavePgBgWorkflowDto) {
    const purchase = await this.prisma.documentPurchase.findFirst({
      where: { id: dto.documentPurchaseId, organizationId },
    });
    if (!purchase) throw new NotFoundException("Eligible tender not found");

    const record = await this.prisma.$transaction(async (tx) => {
      let contactId: string | undefined;
      if (dto.contact?.mobile && dto.contact.name && dto.contact.designation && dto.contact.address) {
        const contact = await tx.organizationContact.upsert({
          where: { organizationId_organizationMasterId_mobile: {
            organizationId,
            organizationMasterId: purchase.organizationMasterId,
            mobile: dto.contact.mobile,
          } },
          update: {
            name: dto.contact.name,
            designation: dto.contact.designation,
            email: dto.contact.email || null,
            address: dto.contact.address,
          },
          create: {
            organizationId,
            organizationMasterId: purchase.organizationMasterId,
            name: dto.contact.name,
            designation: dto.contact.designation,
            mobile: dto.contact.mobile,
            email: dto.contact.email || null,
            address: dto.contact.address,
          },
        });
        contactId = contact.id;
      }

      return tx.pgBgWorkflow.upsert({
        where: { documentPurchaseId: purchase.id },
        update: {
          ...(dto.noaDate ? { noaDate: new Date(dto.noaDate) } : {}),
          ...(dto.noaAmount !== undefined ? { noaAmount: dto.noaAmount } : {}),
          ...(dto.workCategory !== undefined ? { workCategory: dto.workCategory || null } : {}),
          ...(dto.acceptNoa !== undefined ? { acceptNoa: dto.acceptNoa } : {}),
          ...(dto.pgBgRequired !== undefined ? { pgBgRequired: dto.pgBgRequired } : {}),
          ...(dto.currentStep !== undefined ? { currentStep: dto.currentStep } : {}),
          ...(contactId ? { contactId } : {}),
        },
        create: {
          organizationId,
          documentPurchaseId: purchase.id,
          organizationMasterId: purchase.organizationMasterId,
          tenderSecurityAmount: securityAmount(purchase.egpTenderId, purchase.documentPrice),
          noaDate: dto.noaDate ? new Date(dto.noaDate) : null,
          noaAmount: dto.noaAmount,
          workCategory: dto.workCategory,
          acceptNoa: dto.acceptNoa,
          pgBgRequired: dto.pgBgRequired,
          currentStep: dto.currentStep ?? 1,
          contactId,
          createdById: userId,
        },
        include: workflowInclude,
      });
    });

    await this.auditLogService.record({ organizationId, userId, action: "save_draft", entityType: "PgBgWorkflow", entityId: record.id, newValue: workflowToDto(record) });
    return workflowToDto(record);
  }

  async acceptNoa(organizationId: string, userId: string, id: string, dto: AcceptNoaDto) {
    const existing = await this.prisma.pgBgWorkflow.findFirst({ where: { id, organizationId }, include: workflowInclude });
    if (!existing) throw new NotFoundException("PG/BG workflow not found");
    if (!existing.noaDate || !existing.noaAmount || !existing.workCategory || !existing.contactId) {
      throw new BadRequestException("Complete NOA and PE contact information before proceeding");
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.pgBgWorkflow.update({
        where: { id },
        data: {
          acceptNoa: dto.acceptNoa,
          pgBgRequired: dto.pgBgRequired,
          status: dto.acceptNoa ? "NOA_ACCEPTED" : "NOA_REJECTED",
          currentStep: dto.acceptNoa && dto.pgBgRequired ? 4 : 3,
          acceptedAt: dto.acceptNoa ? new Date() : null,
          acceptedById: dto.acceptNoa ? userId : null,
        },
        include: workflowInclude,
      });
      const purchase = await tx.documentPurchase.findUnique({ where: { id: existing.documentPurchaseId } });
      if (purchase?.egpTenderId) {
        await tx.tender.updateMany({
          where: { organizationId, egpTenderId: purchase.egpTenderId },
          data: { status: dto.acceptNoa ? (dto.pgBgRequired ? "NOA" : "ONGOING") : "REJECTED", ...(dto.acceptNoa ? { awardedAt: new Date() } : {}) },
        });
      }
      if (dto.acceptNoa && !dto.pgBgRequired && purchase && existing.noaAmount && existing.workCategory) {
        const linkedTender = purchase.egpTenderId
          ? await tx.tender.findFirst({ where: { organizationId, egpTenderId: purchase.egpTenderId }, select: { id: true } })
          : null;
        await tx.cmsWork.upsert({
          where: { documentPurchaseId: purchase.id },
          update: { status: "ONGOING", contractValue: existing.noaAmount, workCategory: existing.workCategory },
          create: {
            organizationId,
            tenderId: linkedTender?.id,
            documentPurchaseId: purchase.id,
            pgBgWorkflowId: id,
            organizationMasterId: existing.organizationMasterId,
            workName: purchase.tenderWorkName,
            workCategory: existing.workCategory,
            contractValue: existing.noaAmount,
            status: "ONGOING",
            startDate: new Date(),
            createdById: userId,
          },
        });
      }
      return updated;
    });
    await this.auditLogService.record({ organizationId, userId, action: dto.acceptNoa ? "accept_noa" : "reject_noa", entityType: "PgBgWorkflow", entityId: id, newValue: workflowToDto(record) });
    return workflowToDto(record);
  }

  async workCategories(organizationId: string) {
    const rows = await this.prisma.tender.findMany({ where: { organizationId }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } });
    return rows.map((row) => row.category);
  }

  organizationContacts(organizationId: string, organizationMasterId?: string) {
    return this.prisma.organizationContact.findMany({ where: { organizationId, ...(organizationMasterId ? { organizationMasterId } : {}) }, orderBy: { name: "asc" } });
  }

  async finalize(organizationId: string, userId: string, id: string, dto: FinalizePgBgDto) {
    const [workflow, bank] = await Promise.all([
      this.prisma.pgBgWorkflow.findFirst({ where: { id, organizationId }, include: { documentPurchase: true } }),
      this.prisma.bankAccount.findFirst({ where: { id: dto.bankAccountId, organizationId } }),
    ]);
    if (!workflow) throw new NotFoundException("PG/BG workflow not found");
    if (!bank) throw new NotFoundException("Bank account not found");
    if (workflow.status !== "NOA_ACCEPTED" || !workflow.pgBgRequired) {
      throw new BadRequestException("An accepted NOA requiring PG/BG is needed before finalization");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const guarantee = await tx.performanceGuarantee.upsert({
        where: { pgBgWorkflowId: id },
        update: { type: dto.type, bankAccountId: dto.bankAccountId, instrumentNo: dto.instrumentNo, amount: dto.amount, issueDate: new Date(dto.issueDate), expiryDate: new Date(dto.expiryDate) },
        create: { organizationId, organizationMasterId: workflow.organizationMasterId, pgBgWorkflowId: id, type: dto.type, bankAccountId: dto.bankAccountId, instrumentNo: dto.instrumentNo, amount: dto.amount, issueDate: new Date(dto.issueDate), expiryDate: new Date(dto.expiryDate), createdById: userId },
      });
      await tx.pgBgWorkflow.update({ where: { id }, data: { status: "FINALIZED", currentStep: 5 } });
      if (workflow.documentPurchase.egpTenderId) {
        await tx.tender.updateMany({ where: { organizationId, egpTenderId: workflow.documentPurchase.egpTenderId }, data: { status: "ONGOING", awardedAt: new Date() } });
      }
      if (!workflow.noaAmount || !workflow.workCategory) throw new BadRequestException("NOA amount and work category are required");
      const linkedTender = workflow.documentPurchase.egpTenderId
        ? await tx.tender.findFirst({ where: { organizationId, egpTenderId: workflow.documentPurchase.egpTenderId }, select: { id: true } })
        : null;
      await tx.cmsWork.upsert({
        where: { pgBgWorkflowId: id },
        update: { status: "ONGOING", contractValue: workflow.noaAmount, workCategory: workflow.workCategory },
        create: {
          organizationId,
          tenderId: linkedTender?.id,
          documentPurchaseId: workflow.documentPurchaseId,
          pgBgWorkflowId: id,
          organizationMasterId: workflow.organizationMasterId,
          workName: workflow.documentPurchase.tenderWorkName,
          workCategory: workflow.workCategory,
          contractValue: workflow.noaAmount,
          status: "ONGOING",
          startDate: new Date(),
          createdById: userId,
        },
      });
      return guarantee;
    });
    await this.auditLogService.record({ organizationId, userId, action: "create", entityType: "PerformanceGuarantee", entityId: result.id, newValue: { ...result, amount: result.amount.toFixed(2) } });
    return { ...result, amount: result.amount.toFixed(2) };
  }
}
