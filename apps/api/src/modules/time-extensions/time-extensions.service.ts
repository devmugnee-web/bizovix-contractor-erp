import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { ApproveTimeExtensionDto, SaveTimeExtensionDto } from "./dto/save-time-extension.dto";
import { calculateRevisedCompletionDate } from "./time-extension-calculations";

const includeRelations = {
  cmsWork: { select: { id: true, workName: true } },
  contract: { select: { id: true, contractNo: true, originalCompletionDate: true, currentCompletionDate: true } },
} satisfies Prisma.TimeExtensionInclude;

type TimeExtensionRecord = Prisma.TimeExtensionGetPayload<{ include: typeof includeRelations }>;

function toDto(record: TimeExtensionRecord) {
  return record;
}

const EDITABLE_STATUSES = new Set(["DRAFT"]);

@Injectable()
export class TimeExtensionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
  ) {}

  private async assertContract(organizationId: string, contractId: string) {
    const contract = await this.prisma.projectContract.findFirst({ where: { id: contractId, organizationId } });
    if (!contract) throw new NotFoundException("Contract not found");
    return contract;
  }

  async findAll(organizationId: string, cmsWorkId?: string) {
    const rows = await this.prisma.timeExtension.findMany({
      where: { organizationId, ...(cmsWorkId ? { cmsWorkId } : {}) },
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDto);
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.timeExtension.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Time Extension not found");
    return toDto(record);
  }

  async saveDraft(organizationId: string, userId: string, id: string | null, dto: SaveTimeExtensionDto) {
    const contract = await this.assertContract(organizationId, dto.contractId);
    const existing = id ? await this.prisma.timeExtension.findFirst({ where: { id, organizationId } }) : null;
    if (id && !existing) throw new NotFoundException("Time Extension not found");
    if (existing && !EDITABLE_STATUSES.has(existing.status)) throw new BadRequestException("Only a Draft time extension can be edited");

    const baseData = {
      contractId: contract.id,
      requestDate: new Date(dto.requestDate),
      requestedDays: dto.requestedDays,
      reason: dto.reason,
      description: dto.description,
    };

    let record: TimeExtensionRecord;
    if (existing) {
      record = await this.prisma.timeExtension.update({ where: { id: existing.id }, data: baseData, include: includeRelations });
    } else {
      const eotNo = await this.numbering.next(organizationId, "TIME_EXTENSION");
      record = await this.prisma.timeExtension.create({
        data: {
          organizationId,
          cmsWorkId: contract.cmsWorkId,
          eotNo,
          status: "DRAFT",
          createdById: userId,
          // Immutable snapshots of the contract's dates at the moment this EOT was requested —
          // never re-derived later, so a chain of multiple EOTs stays individually auditable.
          originalCompletionDate: contract.originalCompletionDate,
          previousCompletionDate: contract.currentCompletionDate,
          ...baseData,
        },
        include: includeRelations,
      });
    }

    await this.auditLogService.record({
      organizationId,
      userId,
      action: existing ? "EOT_UPDATED" : "EOT_CREATED",
      entityType: "TimeExtension",
      entityId: record.id,
      referenceNo: record.eotNo,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async submit(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.timeExtension.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Time Extension not found");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only a Draft time extension can be submitted");
    const record = await this.prisma.timeExtension.update({ where: { id }, data: { status: "SUBMITTED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "EOT_SUBMITTED", entityType: "TimeExtension", entityId: id, referenceNo: record.eotNo });
    return toDto(record);
  }

  async reject(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.timeExtension.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Time Extension not found");
    if (existing.status !== "SUBMITTED") throw new BadRequestException("Only a Submitted time extension can be rejected");
    const record = await this.prisma.timeExtension.update({ where: { id }, data: { status: "REJECTED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "EOT_REJECTED", entityType: "TimeExtension", entityId: id, referenceNo: record.eotNo });
    return toDto(record);
  }

  async cancel(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.timeExtension.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Time Extension not found");
    if (existing.status === "APPROVED") throw new BadRequestException("An approved time extension cannot be cancelled — its completion-date impact is permanent");
    const record = await this.prisma.timeExtension.update({ where: { id }, data: { status: "CANCELLED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "EOT_UPDATED", entityType: "TimeExtension", entityId: id, referenceNo: record.eotNo, description: "Time extension cancelled" });
    return toDto(record);
  }

  /** Atomically computes the revised completion date from the snapshot taken at request time
   * (never re-derived from the contract's possibly-already-moved-by-another-EOT current date)
   * and pushes it onto the contract — the contract's originalCompletionDate is never touched. */
  async approve(organizationId: string, userId: string, id: string, dto: ApproveTimeExtensionDto) {
    const existing = await this.prisma.timeExtension.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Time Extension not found");
    if (existing.status !== "SUBMITTED") throw new BadRequestException("Only a Submitted time extension can be approved");

    const approvedDays = dto.approvedDays ?? existing.requestedDays;
    const revisedCompletionDate = calculateRevisedCompletionDate(existing.previousCompletionDate, approvedDays);

    const record = await this.prisma.$transaction(async (tx) => {
      await tx.timeExtension.update({
        where: { id },
        data: { status: "APPROVED", approvalDate: new Date(), approvedById: userId, approvedDays, revisedCompletionDate },
      });
      await tx.projectContract.update({
        where: { id: existing.contractId },
        data: { currentCompletionDate: revisedCompletionDate },
      });
      return tx.timeExtension.findFirst({ where: { id }, include: includeRelations });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "EOT_APPROVED",
      entityType: "TimeExtension",
      entityId: id,
      referenceNo: record!.eotNo,
      newValue: toDto(record!),
    });

    return toDto(record!);
  }
}
