import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { AcceptNoaDto, FinalizePgBgDto, SavePgBgWorkflowDto } from "./dto/save-pg-bg-workflow.dto";
import { QueryPgBgDto } from "./dto/query-pg-bg.dto";
import type { CompletePgBgReleaseDto, RequestPgBgReleaseDto } from "./dto/release-pg-bg.dto";
import { readPaSnapshot, tenderPaContact, tenderPaSelect } from "../tenders/tender-pa";

const workflowInclude = { contact: true } satisfies Prisma.PgBgWorkflowInclude;
type WorkflowRecord = Prisma.PgBgWorkflowGetPayload<{ include: typeof workflowInclude }>;

function workflowToDto(record: WorkflowRecord) {
  return {
    ...record,
    contact: readPaSnapshot(record.contactSnapshot) ?? record.contact,
    // Retained in the response for older clients; the current NOA/PG-BG flow does not use it.
    tenderSecurityAmount: record.tenderSecurityAmount.toFixed(2),
    noaAmount: record.noaAmount?.toFixed(2) ?? null,
  };
}

@Injectable()
export class PgBgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async eligibleTenders(organizationId: string, query: QueryPgBgDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const workflowStatus = query.workflowStatus ?? "READY";
    const statusWhere: Prisma.DocumentPurchaseWhereInput =
      workflowStatus === "READY"
        ? { cmsWork: { is: null }, pgBgWorkflow: { is: null } }
        : { pgBgWorkflow: { is: { status: workflowStatus } } };
    const where: Prisma.DocumentPurchaseWhereInput = {
      organizationId,
      purchaseType: "EGP",
      AND: [
        statusWhere,
        ...(query.search
          ? [
              {
                OR: [
                  { egpTenderId: { contains: query.search, mode: "insensitive" as const } },
                  { tenderWorkName: { contains: query.search, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
      ],
    };
    const relation = {
      linkedTender: { select: tenderPaSelect },
      organizationMaster: { select: { id: true, shortName: true, fullName: true } },
      pgBgWorkflow: { select: { status: true } },
      cmsWork: { select: { id: true } },
    } as const;
    const [items, total] = await Promise.all([
      this.prisma.documentPurchase.findMany({
        where,
        include: relation,
        orderBy: { purchaseDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.documentPurchase.count({ where }),
    ]);
    const eligibleItems = items.map((item) => ({
      id: item.id,
      tenderRecordId: item.linkedTenderId,
      tenderId: item.egpTenderId,
      tenderWorkName: item.tenderWorkName,
      category: item.category,
      workflowStatus: item.pgBgWorkflow?.status ?? "READY",
      cmsWorkId: item.cmsWork?.id ?? null,
      paContact: tenderPaContact(item.linkedTender),
      organizationMaster: item.organizationMaster,
    }));
    return {
      items: eligibleItems,
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
      include: { cmsWork: { select: { id: true } }, linkedTender: { select: tenderPaSelect } },
    });
    if (!purchase) throw new NotFoundException("Eligible tender not found");
    if (purchase.purchaseType !== "EGP") {
      throw new BadRequestException("Only e-GP document purchases can use the PG/BG workflow");
    }
    if (purchase.cmsWork) {
      throw new BadRequestException("This tender has already been moved to Ongoing Works");
    }
    const existingWorkflow = await this.prisma.pgBgWorkflow.findFirst({
      where: { documentPurchaseId: purchase.id, organizationId },
      select: { status: true, contact: true, contactSnapshot: true },
    });
    if (
      existingWorkflow?.status === "FINALIZED" ||
      existingWorkflow?.status === "NOA_REJECTED"
    ) {
      throw new BadRequestException("This PG/BG workflow is already completed and cannot be edited");
    }
    const workCategory = purchase.category?.trim();
    if (!workCategory) {
      throw new BadRequestException(
        "Add a category to the Document Purchase before continuing PG/BG",
      );
    }
    const record = await this.prisma.$transaction(async (tx) => {
      const baseContact = readPaSnapshot(existingWorkflow?.contactSnapshot)
        ?? existingWorkflow?.contact ?? tenderPaContact(purchase.linkedTender);
      const pa = dto.contact ? { ...baseContact, ...dto.contact } : baseContact;
      const snapshot = pa ? {
        id: baseContact?.id ?? purchase.id,
        name: pa.name ?? "", designation: pa.designation ?? "", mobile: pa.mobile ?? "",
        address: pa.address ?? "", email: pa.email || null,
      } : undefined;
      let contactId: string | undefined;
      if (
        snapshot?.mobile &&
        snapshot.name &&
        snapshot.designation &&
        snapshot.address
      ) {
        const contact = await tx.organizationContact.upsert({
          where: {
            organizationId_organizationMasterId_mobile: {
              organizationId,
              organizationMasterId: purchase.organizationMasterId,
              mobile: snapshot.mobile,
            },
          },
          update: {},
          create: {
            organizationId,
            organizationMasterId: purchase.organizationMasterId,
            name: snapshot.name,
            designation: snapshot.designation,
            mobile: snapshot.mobile,
            email: snapshot.email,
            address: snapshot.address,
          },
        });
        contactId = contact.id;
        snapshot.id = contact.id;
      }

      return tx.pgBgWorkflow.upsert({
        where: { documentPurchaseId: purchase.id },
        update: {
          ...(dto.noaDate ? { noaDate: new Date(dto.noaDate) } : {}),
          ...(dto.noaAmount !== undefined ? { noaAmount: dto.noaAmount } : {}),
          workCategory,
          ...(dto.acceptNoa !== undefined ? { acceptNoa: dto.acceptNoa } : {}),
          ...(dto.pgBgRequired !== undefined ? { pgBgRequired: dto.pgBgRequired } : {}),
          ...(dto.currentStep !== undefined ? { currentStep: dto.currentStep } : {}),
          ...(contactId ? { contactId } : {}),
          ...(snapshot ? { contactSnapshot: snapshot } : {}),
        },
        create: {
          organizationId,
          documentPurchaseId: purchase.id,
          organizationMasterId: purchase.organizationMasterId,
          noaDate: dto.noaDate ? new Date(dto.noaDate) : null,
          noaAmount: dto.noaAmount,
          workCategory,
          acceptNoa: dto.acceptNoa,
          pgBgRequired: dto.pgBgRequired,
          currentStep: dto.currentStep ?? 1,
          contactId,
          contactSnapshot: snapshot,
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
      include: { contact: true, cmsWork: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundException("PG/BG workflow not found");
    const pa = readPaSnapshot(existing.contactSnapshot) ?? existing.contact;
    if (!pa || ![pa.name, pa.designation, pa.mobile, pa.address].every((value) => value?.trim())) {
      throw new BadRequestException("Complete PE contact information before proceeding");
    }
    if (!existing.noaDate || !existing.noaAmount || !existing.workCategory || !existing.contactId) {
      throw new BadRequestException("Complete NOA and PE contact information before proceeding");
    }
    if (existing.status === "FINALIZED") {
      throw new BadRequestException("This PG/BG workflow has already been finalized");
    }
    if (existing.status === "NOA_REJECTED") {
      if (!dto.acceptNoa) {
        return { ...workflowToDto(existing), cmsWorkId: null };
      }
      throw new BadRequestException("A rejected NOA decision cannot be changed");
    }
    if (existing.status === "NOA_ACCEPTED") {
      if (dto.acceptNoa && existing.pgBgRequired === dto.pgBgRequired) {
        return { ...workflowToDto(existing), cmsWorkId: existing.cmsWork?.id ?? null };
      }
      throw new BadRequestException("An accepted NOA decision cannot be changed");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let cmsWorkId: string | null = null;
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
      const purchase = await tx.documentPurchase.findFirst({
        where: { id: existing.documentPurchaseId, organizationId },
      });
      if (purchase?.linkedTenderId) {
        await tx.tender.update({
          where: { id: purchase.linkedTenderId, organizationId },
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
        const work = await tx.cmsWork.upsert({
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
        cmsWorkId = work.id;
      }
      return { record: updated, cmsWorkId };
    });
    await this.auditLogService.record({
      organizationId,
      userId,
      action: dto.acceptNoa ? "accept_noa" : "reject_noa",
      entityType: "PgBgWorkflow",
      entityId: id,
      newValue: workflowToDto(result.record),
    });
    return { ...workflowToDto(result.record), cmsWorkId: result.cmsWorkId };
  }

  async workCategories(organizationId: string) {
    const rows = await this.prisma.tender.findMany({
      where: { organizationId, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    });
    return rows.flatMap((row) => (row.category ? [row.category] : []));
  }

  organizationContacts(organizationId: string, organizationMasterId?: string) {
    return this.prisma.organizationContact.findMany({
      where: { organizationId, ...(organizationMasterId ? { organizationMasterId } : {}) },
      orderBy: { name: "asc" },
    });
  }

  async finalize(organizationId: string, userId: string, id: string, dto: FinalizePgBgDto) {
    const workflow = await this.prisma.pgBgWorkflow.findFirst({
      where: { id, organizationId },
      include: { documentPurchase: true, performanceGuarantee: true, cmsWork: true },
    });
    if (!workflow) throw new NotFoundException("PG/BG workflow not found");
    if (workflow.status === "FINALIZED") {
      if (!workflow.performanceGuarantee || !workflow.cmsWork) {
        throw new BadRequestException("The finalized PG/BG workflow is incomplete");
      }
      return {
        ...workflow.performanceGuarantee,
        amount: workflow.performanceGuarantee.amount.toFixed(2),
        cmsWorkId: workflow.cmsWork.id,
      };
    }
    if (workflow.status !== "NOA_ACCEPTED" || !workflow.pgBgRequired) {
      throw new BadRequestException(
        "An accepted NOA requiring PG/BG is needed before finalization",
      );
    }
    const bank = await this.prisma.bankAccount.findFirst({
      where: {
        id: dto.bankAccountId,
        organizationId,
        accountType: "BANK",
        isActive: true,
      },
    });
    if (!bank) throw new NotFoundException("Active bank account not found");
    const issueDate = new Date(dto.issueDate);
    const expiryDate = new Date(dto.expiryDate);
    if (expiryDate <= issueDate) {
      throw new BadRequestException("PG/BG expiry date must be after the issue date");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const guarantee = await tx.performanceGuarantee.upsert({
        where: { pgBgWorkflowId: id },
        update: {
          tenderId: workflow.documentPurchase.linkedTenderId,
          type: dto.type,
          bankAccountId: dto.bankAccountId,
          instrumentNo: dto.instrumentNo,
          amount: dto.amount,
          issueDate,
          expiryDate,
        },
        create: {
          organizationId,
          tenderId: workflow.documentPurchase.linkedTenderId,
          organizationMasterId: workflow.organizationMasterId,
          pgBgWorkflowId: id,
          type: dto.type,
          bankAccountId: dto.bankAccountId,
          instrumentNo: dto.instrumentNo,
          amount: dto.amount,
          issueDate,
          expiryDate,
          createdById: userId,
        },
      });
      await tx.pgBgWorkflow.update({
        where: { id, organizationId },
        data: { status: "FINALIZED", currentStep: 5 },
      });
      if (workflow.documentPurchase.linkedTenderId) {
        await tx.tender.update({
          where: { id: workflow.documentPurchase.linkedTenderId, organizationId },
          data: { status: "ONGOING", awardedAt: new Date() },
        });
      }
      if (!workflow.noaAmount || !workflow.workCategory)
        throw new BadRequestException("NOA amount and work category are required");
      const work = await tx.cmsWork.upsert({
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
      return { guarantee, cmsWorkId: work.id };
    });
    await this.auditLogService.record({
      organizationId,
      userId,
      action: "create",
      entityType: "PerformanceGuarantee",
      entityId: result.guarantee.id,
      newValue: {
        ...result.guarantee,
        amount: result.guarantee.amount.toFixed(2),
        cmsWorkId: result.cmsWorkId,
      },
    });
    return {
      ...result.guarantee,
      amount: result.guarantee.amount.toFixed(2),
      cmsWorkId: result.cmsWorkId,
    };
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
