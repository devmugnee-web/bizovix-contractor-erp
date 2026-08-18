import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenderBankSettingsService } from "../settings-tender-bank/tender-bank-settings.service";
import { AcceptNoaDto, FinalizePgBgDto, SavePgBgWorkflowDto } from "./dto/save-pg-bg-workflow.dto";
import { QueryPgBgDto } from "./dto/query-pg-bg.dto";
import type { CompletePgBgReleaseDto, RequestPgBgReleaseDto } from "./dto/release-pg-bg.dto";

const workflowInclude = { contact: true } satisfies Prisma.PgBgWorkflowInclude;
type WorkflowRecord = Prisma.PgBgWorkflowGetPayload<{ include: typeof workflowInclude }>;

function workflowToDto(record: WorkflowRecord) {
  return {
    ...record,
    tenderSecurityAmount: record.tenderSecurityAmount.toFixed(2),
    noaAmount: record.noaAmount?.toFixed(2) ?? null,
  };
}

@Injectable()
export class PgBgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly tenderBankSettings: TenderBankSettingsService,
  ) {}

  /**
   * Real business rule: reuse the actual Tender Security amount already recorded for this
   * document purchase (TenderSecurityItem.securityAmount) when one exists — that figure is
   * authoritative since the tender security step runs before PG/BG. If no Tender Security
   * was ever created for this purchase, fall back to the same configured
   * percentage-of-estimate rule used on the Tender Security pending list — never a
   * per-tender hardcoded amount.
   */
  private async securityAmountFor(
    documentPurchaseId: string,
    estimatedTenderAmount: Prisma.Decimal,
    tsDefaultSecurityPct: Prisma.Decimal,
  ) {
    const item = await this.prisma.tenderSecurityItem.findUnique({ where: { documentPurchaseId } });
    if (item) return item.securityAmount;
    return estimatedTenderAmount.mul(tsDefaultSecurityPct).div(100);
  }

  async eligibleTenders(organizationId: string, query: QueryPgBgDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const where: Prisma.DocumentPurchaseWhereInput = {
      organizationId,
      purchaseType: "EGP",
      ...(query.search
        ? {
            OR: [
              { egpTenderId: { contains: query.search, mode: "insensitive" } },
              { tenderWorkName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const relation = {
      organizationMaster: { select: { id: true, shortName: true, fullName: true } },
    } as const;
    const [items, total, settings] = await Promise.all([
      this.prisma.documentPurchase.findMany({
        where,
        include: relation,
        orderBy: { purchaseDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.documentPurchase.count({ where }),
      this.tenderBankSettings.get(organizationId),
    ]);
    const withAmounts = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        tenderId: item.egpTenderId,
        tenderWorkName: item.tenderWorkName,
        organizationMaster: item.organizationMaster,
        tenderSecurityAmount: (
          await this.securityAmountFor(
            item.id,
            item.estimatedTenderAmount,
            settings.tsDefaultSecurityPct,
          )
        ).toFixed(2),
      })),
    );
    return {
      items: withAmounts,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.pgBgWorkflow.findFirst({
      where: { id, organizationId },
      include: workflowInclude,
    });
    if (!record) throw new NotFoundException("PG/BG workflow not found");
    return workflowToDto(record);
  }

  async findByDocumentPurchase(organizationId: string, documentPurchaseId: string) {
    const record = await this.prisma.pgBgWorkflow.findFirst({
      where: { documentPurchaseId, organizationId },
      include: workflowInclude,
    });
    return record ? workflowToDto(record) : null;
  }

  async saveDraft(organizationId: string, userId: string, dto: SavePgBgWorkflowDto) {
    const purchase = await this.prisma.documentPurchase.findFirst({
      where: { id: dto.documentPurchaseId, organizationId },
    });
    if (!purchase) throw new NotFoundException("Eligible tender not found");
    const settings = await this.tenderBankSettings.get(organizationId);
    const tenderSecurityAmount = await this.securityAmountFor(
      purchase.id,
      purchase.estimatedTenderAmount,
      settings.tsDefaultSecurityPct,
    );

    const record = await this.prisma.$transaction(async (tx) => {
      let contactId: string | undefined;
      if (
        dto.contact?.mobile &&
        dto.contact.name &&
        dto.contact.designation &&
        dto.contact.address
      ) {
        const contact = await tx.organizationContact.upsert({
          where: {
            organizationId_organizationMasterId_mobile: {
              organizationId,
              organizationMasterId: purchase.organizationMasterId,
              mobile: dto.contact.mobile,
            },
          },
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
          tenderSecurityAmount,
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

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "save_draft",
      entityType: "PgBgWorkflow",
      entityId: record.id,
      newValue: workflowToDto(record),
    });
    return workflowToDto(record);
  }

  async acceptNoa(organizationId: string, userId: string, id: string, dto: AcceptNoaDto) {
    const existing = await this.prisma.pgBgWorkflow.findFirst({
      where: { id, organizationId },
      include: workflowInclude,
    });
    if (!existing) throw new NotFoundException("PG/BG workflow not found");
    if (!existing.noaDate || !existing.noaAmount || !existing.workCategory || !existing.contactId) {
      throw new BadRequestException("Complete NOA and PE contact information before proceeding");
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.pgBgWorkflow.update({
        where: { id, organizationId },
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
      const purchase = await tx.documentPurchase.findUnique({
        where: { id: existing.documentPurchaseId },
      });
      if (purchase?.linkedTenderId) {
        await tx.tender.update({
          where: { id: purchase.linkedTenderId },
          data: {
            status: dto.acceptNoa ? (dto.pgBgRequired ? "NOA" : "ONGOING") : "REJECTED",
            ...(dto.acceptNoa ? { awardedAt: new Date() } : {}),
          },
        });
      }
      if (
        dto.acceptNoa &&
        !dto.pgBgRequired &&
        purchase &&
        existing.noaAmount &&
        existing.workCategory
      ) {
        await tx.cmsWork.upsert({
          where: { documentPurchaseId: purchase.id },
          update: {
            status: "ONGOING",
            contractValue: existing.noaAmount,
            workCategory: existing.workCategory,
          },
          create: {
            organizationId,
            tenderId: purchase.linkedTenderId,
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
    await this.auditLogService.record({
      organizationId,
      userId,
      action: dto.acceptNoa ? "accept_noa" : "reject_noa",
      entityType: "PgBgWorkflow",
      entityId: id,
      newValue: workflowToDto(record),
    });
    return workflowToDto(record);
  }

  async workCategories(organizationId: string) {
    const rows = await this.prisma.tender.findMany({
      where: { organizationId },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    });
    return rows.map((row) => row.category);
  }

  organizationContacts(organizationId: string, organizationMasterId?: string) {
    return this.prisma.organizationContact.findMany({
      where: { organizationId, ...(organizationMasterId ? { organizationMasterId } : {}) },
      orderBy: { name: "asc" },
    });
  }

  async finalize(organizationId: string, userId: string, id: string, dto: FinalizePgBgDto) {
    const [workflow, bank] = await Promise.all([
      this.prisma.pgBgWorkflow.findFirst({
        where: { id, organizationId },
        include: { documentPurchase: true },
      }),
      this.prisma.bankAccount.findFirst({ where: { id: dto.bankAccountId, organizationId } }),
    ]);
    if (!workflow) throw new NotFoundException("PG/BG workflow not found");
    if (!bank) throw new NotFoundException("Bank account not found");
    if (workflow.status !== "NOA_ACCEPTED" || !workflow.pgBgRequired) {
      throw new BadRequestException(
        "An accepted NOA requiring PG/BG is needed before finalization",
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const guarantee = await tx.performanceGuarantee.upsert({
        where: { pgBgWorkflowId: id },
        update: {
          type: dto.type,
          bankAccountId: dto.bankAccountId,
          instrumentNo: dto.instrumentNo,
          amount: dto.amount,
          issueDate: new Date(dto.issueDate),
          expiryDate: new Date(dto.expiryDate),
        },
        create: {
          organizationId,
          organizationMasterId: workflow.organizationMasterId,
          pgBgWorkflowId: id,
          type: dto.type,
          bankAccountId: dto.bankAccountId,
          instrumentNo: dto.instrumentNo,
          amount: dto.amount,
          issueDate: new Date(dto.issueDate),
          expiryDate: new Date(dto.expiryDate),
          createdById: userId,
        },
      });
      await tx.pgBgWorkflow.update({
        where: { id, organizationId },
        data: { status: "FINALIZED", currentStep: 5 },
      });
      if (workflow.documentPurchase.linkedTenderId) {
        await tx.tender.update({
          where: { id: workflow.documentPurchase.linkedTenderId },
          data: { status: "ONGOING", awardedAt: new Date() },
        });
      }
      if (!workflow.noaAmount || !workflow.workCategory)
        throw new BadRequestException("NOA amount and work category are required");
      await tx.cmsWork.upsert({
        where: { pgBgWorkflowId: id },
        update: {
          status: "ONGOING",
          contractValue: workflow.noaAmount,
          workCategory: workflow.workCategory,
        },
        create: {
          organizationId,
          tenderId: workflow.documentPurchase.linkedTenderId,
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
    await this.auditLogService.record({
      organizationId,
      userId,
      action: "create",
      entityType: "PerformanceGuarantee",
      entityId: result.id,
      newValue: { ...result, amount: result.amount.toFixed(2) },
    });
    return { ...result, amount: result.amount.toFixed(2) };
  }

  async requestRelease(
    organizationId: string,
    userId: string,
    id: string,
    dto: RequestPgBgReleaseDto,
  ) {
    const existing = await this.prisma.performanceGuarantee.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException("Performance Guarantee not found");
    if (existing.status !== "ACTIVE")
      throw new BadRequestException("Only an active guarantee can be requested for release");
    const row = await this.prisma.performanceGuarantee.update({
      where: { id, organizationId },
      data: {
        status: "RELEASE_REQUESTED",
        releaseRequestDate: new Date(dto.releaseRequestDate),
        releaseRemarks: dto.remarks,
        releaseRequestedById: userId,
      },
    });
    await this.auditLogService.record({
      organizationId,
      userId,
      action: "PG_BG_RELEASE_REQUESTED",
      entityType: "PerformanceGuarantee",
      entityId: id,
    });
    return { ...row, amount: row.amount.toFixed(2) };
  }

  async release(organizationId: string, userId: string, id: string, dto: CompletePgBgReleaseDto) {
    const existing = await this.prisma.performanceGuarantee.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException("Performance Guarantee not found");
    if (!["ACTIVE", "RELEASE_REQUESTED", "EXPIRED"].includes(existing.status))
      throw new BadRequestException("Guarantee is not eligible for release");
    const row = await this.prisma.performanceGuarantee.update({
      where: { id, organizationId },
      data: {
        status: "RELEASED",
        releaseDate: new Date(dto.releaseDate),
        releaseReference: dto.releaseReference,
        bankConfirmation: dto.bankConfirmation,
        releaseRemarks: dto.remarks ?? existing.releaseRemarks,
        releasedById: userId,
      },
    });
    await this.auditLogService.record({
      organizationId,
      userId,
      action: "PG_BG_RELEASED",
      entityType: "PerformanceGuarantee",
      entityId: id,
      referenceNo: dto.releaseReference,
      oldValue: { status: existing.status },
      newValue: { status: row.status },
    });
    return { ...row, amount: row.amount.toFixed(2) };
  }
}
