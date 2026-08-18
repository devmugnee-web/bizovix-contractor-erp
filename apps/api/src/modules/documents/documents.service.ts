import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { DocumentStorageService } from "./document-storage.service";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { QueryDocumentDto } from "./dto/query-document.dto";

export type UploadedDocumentFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

const includeRelations = {
  versions: { orderBy: { version: "desc" } },
} satisfies Prisma.DocumentInclude;

function toDto<T extends { amount: Prisma.Decimal | null }>(record: T) {
  return { ...record, amount: record.amount?.toFixed(2) ?? null };
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly storage: DocumentStorageService,
  ) {}

  async findAll(organizationId: string, query: QueryDocumentDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.DocumentWhereInput = {
      organizationId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.relatedModule ? { relatedModule: query.relatedModule } : {}),
      ...(query.tenderId ? { tenderId: query.tenderId } : {}),
      ...(query.workId ? { workId: query.workId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.projectBillId ? { projectBillId: query.projectBillId } : {}),
      ...(query.variationOrderId ? { variationOrderId: query.variationOrderId } : {}),
      ...(query.timeExtensionId ? { timeExtensionId: query.timeExtensionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.expiringWithinDays
        ? {
            expiryDate: {
              gte: new Date(),
              lte: new Date(Date.now() + Number(query.expiringWithinDays) * 24 * 60 * 60 * 1000),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { referenceNumber: { contains: query.search, mode: "insensitive" } },
              { certificateNumber: { contains: query.search, mode: "insensitive" } },
              { relatedEntityName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) satisfies PaginationMeta };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.document.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Document not found");
    return toDto(record);
  }

  async categories(organizationId: string) {
    const rows = await this.prisma.document.findMany({
      where: { organizationId, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    });
    return rows.map((row) => row.category!);
  }

  private tagsArray(tags?: string) {
    return tags
      ? tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
  }

  private async assertLinkedEntities(organizationId: string, dto: Partial<CreateDocumentDto>) {
    const [tender, work, contract, bill, variation, eot, master, certificate, dlp, defect, retention, handover] = await Promise.all([
      dto.tenderId ? this.prisma.tender.findFirst({ where: { id: dto.tenderId, organizationId }, select: { id: true } }) : null,
      dto.workId ? this.prisma.cmsWork.findFirst({ where: { id: dto.workId, organizationId }, select: { id: true } }) : null,
      dto.contractId ? this.prisma.projectContract.findFirst({ where: { id: dto.contractId, organizationId }, select: { id: true, cmsWorkId: true } }) : null,
      dto.projectBillId ? this.prisma.projectBill.findFirst({ where: { id: dto.projectBillId, organizationId }, select: { id: true, cmsWorkId: true, contractId: true } }) : null,
      dto.variationOrderId ? this.prisma.variationOrder.findFirst({ where: { id: dto.variationOrderId, organizationId }, select: { id: true, cmsWorkId: true, contractId: true } }) : null,
      dto.timeExtensionId ? this.prisma.timeExtension.findFirst({ where: { id: dto.timeExtensionId, organizationId }, select: { id: true, cmsWorkId: true, contractId: true } }) : null,
      dto.organizationMasterId ? this.prisma.organizationMaster.findFirst({ where: { id: dto.organizationMasterId, organizationId }, select: { id: true } }) : null,
      dto.completionCertificateId ? this.prisma.completionCertificate.findFirst({ where: { id: dto.completionCertificateId, organizationId }, select: { id: true, workId: true, contractId: true } }) : null,
      dto.dlpId ? this.prisma.defectLiabilityPeriod.findFirst({ where: { id: dto.dlpId, organizationId }, select: { id: true, workId: true, contractId: true } }) : null,
      dto.defectId ? this.prisma.dlpDefect.findFirst({ where: { id: dto.defectId, organizationId }, select: { id: true, dlp: { select: { workId: true } } } }) : null,
      dto.retentionReleaseId ? this.prisma.retentionRelease.findFirst({ where: { id: dto.retentionReleaseId, organizationId }, select: { id: true, workId: true, contractId: true } }) : null,
      dto.projectHandoverId ? this.prisma.projectHandover.findFirst({ where: { id: dto.projectHandoverId, organizationId }, select: { id: true, workId: true, contractId: true } }) : null,
    ]);
    const checks: Array<[unknown, string | undefined, string]> = [[tender, dto.tenderId, "Tender"], [work, dto.workId, "Project"], [contract, dto.contractId, "Contract"], [bill, dto.projectBillId, "Project bill"], [variation, dto.variationOrderId, "Variation"], [eot, dto.timeExtensionId, "Time extension"], [master, dto.organizationMasterId, "Organization master"], [certificate, dto.completionCertificateId, "Completion certificate"], [dlp, dto.dlpId, "DLP"], [defect, dto.defectId, "Defect"], [retention, dto.retentionReleaseId, "Retention release"], [handover, dto.projectHandoverId, "Handover"]];
    for (const [record, supplied, label] of checks) if (supplied && !record) throw new NotFoundException(`${label} not found in this organization`);
    const expectedWorkId = dto.workId;
    for (const linked of [contract, bill, variation, eot, certificate, dlp, retention, handover]) {
      if (expectedWorkId && linked && ("cmsWorkId" in linked ? linked.cmsWorkId : linked.workId) !== expectedWorkId) throw new BadRequestException("Linked records must belong to the selected project");
    }
    if (expectedWorkId && defect && defect.dlp.workId !== expectedWorkId) throw new BadRequestException("Defect does not belong to the selected project");
    if (dto.contractId) for (const linked of [bill, variation, eot, certificate, dlp, retention, handover]) if (linked && linked.contractId !== dto.contractId) throw new BadRequestException("Linked records must belong to the selected contract");
  }

  async create(
    organizationId: string,
    userId: string,
    userName: string,
    dto: CreateDocumentDto,
    file?: UploadedDocumentFile,
  ) {
    await this.assertLinkedEntities(organizationId, dto);
    let fileMeta: { fileName?: string; fileType?: string; fileSize?: number; storageKey?: string } = {};
    if (file) {
      const storageKey = await this.storage.save(organizationId, file.buffer, file.originalname);
      fileMeta = { fileName: file.originalname, fileType: file.mimetype, fileSize: file.size, storageKey };
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          organizationId,
          name: dto.name,
          category: dto.category,
          documentType: dto.documentType,
          relatedModule: dto.relatedModule,
          relatedEntityId: dto.relatedEntityId,
          relatedEntityName: dto.relatedEntityName,
          tenderId: dto.tenderId,
          workId: dto.workId,
          contractId: dto.contractId,
          projectBillId: dto.projectBillId,
          variationOrderId: dto.variationOrderId,
          timeExtensionId: dto.timeExtensionId,
          completionCertificateId: dto.completionCertificateId,
          dlpId: dto.dlpId,
          defectId: dto.defectId,
          retentionReleaseId: dto.retentionReleaseId,
          projectHandoverId: dto.projectHandoverId,
          organizationMasterId: dto.organizationMasterId,
          referenceNumber: dto.referenceNumber,
          certificateNumber: dto.certificateNumber,
          issuingAuthority: dto.issuingAuthority,
          account: dto.account,
          amount: dto.amount,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          reminderDays: dto.reminderDays,
          responsiblePerson: dto.responsiblePerson,
          description: dto.description,
          tags: this.tagsArray(dto.tags),
          status: "ACTIVE",
          currentVersion: file ? 1 : 0,
          uploadedById: userId,
          uploadedByName: userName,
          createdById: userId,
          ...fileMeta,
        },
      });
      if (file && fileMeta.storageKey) {
        await tx.documentVersion.create({
          data: {
            documentId: doc.id,
            version: 1,
            fileName: fileMeta.fileName!,
            fileType: fileMeta.fileType!,
            fileSize: fileMeta.fileSize!,
            storageKey: fileMeta.storageKey,
            uploadedById: userId,
            uploadedByName: userName,
            changeNote: "Initial upload",
          },
        });
      }
      return doc;
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "DOCUMENT_UPLOADED",
      entityType: "Document",
      entityId: record.id,
      referenceNo: record.referenceNumber,
      newValue: toDto(record),
    });
    return this.findOne(organizationId, record.id);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateDocumentDto) {
    const existing = await this.prisma.document.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Document not found");
    await this.assertLinkedEntities(organizationId, {
      tenderId: dto.tenderId === undefined ? existing.tenderId ?? undefined : dto.tenderId ?? undefined,
      workId: dto.workId === undefined ? existing.workId ?? undefined : dto.workId ?? undefined,
      contractId: dto.contractId === undefined ? existing.contractId ?? undefined : dto.contractId ?? undefined,
      projectBillId: dto.projectBillId === undefined ? existing.projectBillId ?? undefined : dto.projectBillId ?? undefined,
      variationOrderId: dto.variationOrderId === undefined ? existing.variationOrderId ?? undefined : dto.variationOrderId ?? undefined,
      timeExtensionId: dto.timeExtensionId === undefined ? existing.timeExtensionId ?? undefined : dto.timeExtensionId ?? undefined,
      completionCertificateId: dto.completionCertificateId === undefined ? existing.completionCertificateId ?? undefined : dto.completionCertificateId ?? undefined,
      dlpId: dto.dlpId === undefined ? existing.dlpId ?? undefined : dto.dlpId ?? undefined,
      defectId: dto.defectId === undefined ? existing.defectId ?? undefined : dto.defectId ?? undefined,
      retentionReleaseId: dto.retentionReleaseId === undefined ? existing.retentionReleaseId ?? undefined : dto.retentionReleaseId ?? undefined,
      projectHandoverId: dto.projectHandoverId === undefined ? existing.projectHandoverId ?? undefined : dto.projectHandoverId ?? undefined,
      organizationMasterId: dto.organizationMasterId === undefined ? existing.organizationMasterId ?? undefined : dto.organizationMasterId ?? undefined,
    });

    const record = await this.prisma.document.update({
      where: { id, organizationId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.documentType !== undefined ? { documentType: dto.documentType } : {}),
        ...(dto.relatedModule !== undefined ? { relatedModule: dto.relatedModule } : {}),
        ...(dto.relatedEntityId !== undefined ? { relatedEntityId: dto.relatedEntityId } : {}),
        ...(dto.relatedEntityName !== undefined ? { relatedEntityName: dto.relatedEntityName } : {}),
        ...(dto.tenderId !== undefined ? { tenderId: dto.tenderId } : {}),
        ...(dto.workId !== undefined ? { workId: dto.workId } : {}),
        ...(dto.contractId !== undefined ? { contractId: dto.contractId } : {}),
        ...(dto.projectBillId !== undefined ? { projectBillId: dto.projectBillId } : {}),
        ...(dto.variationOrderId !== undefined ? { variationOrderId: dto.variationOrderId } : {}),
        ...(dto.timeExtensionId !== undefined ? { timeExtensionId: dto.timeExtensionId } : {}),
        ...(dto.completionCertificateId !== undefined ? { completionCertificateId: dto.completionCertificateId } : {}),
        ...(dto.dlpId !== undefined ? { dlpId: dto.dlpId } : {}),
        ...(dto.defectId !== undefined ? { defectId: dto.defectId } : {}),
        ...(dto.retentionReleaseId !== undefined ? { retentionReleaseId: dto.retentionReleaseId } : {}),
        ...(dto.projectHandoverId !== undefined ? { projectHandoverId: dto.projectHandoverId } : {}),
        ...(dto.organizationMasterId !== undefined ? { organizationMasterId: dto.organizationMasterId } : {}),
        ...(dto.referenceNumber !== undefined ? { referenceNumber: dto.referenceNumber } : {}),
        ...(dto.certificateNumber !== undefined ? { certificateNumber: dto.certificateNumber } : {}),
        ...(dto.issuingAuthority !== undefined ? { issuingAuthority: dto.issuingAuthority } : {}),
        ...(dto.account !== undefined ? { account: dto.account } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.issueDate !== undefined ? { issueDate: dto.issueDate ? new Date(dto.issueDate) : null } : {}),
        ...(dto.expiryDate !== undefined ? { expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null } : {}),
        ...(dto.reminderDays !== undefined ? { reminderDays: dto.reminderDays } : {}),
        ...(dto.responsiblePerson !== undefined ? { responsiblePerson: dto.responsiblePerson } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.tags !== undefined ? { tags: this.tagsArray(dto.tags) } : {}),
      },
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "update",
      entityType: "Document",
      entityId: id,
      oldValue: toDto(existing),
      newValue: toDto(record),
    });
    return this.findOne(organizationId, id);
  }

  async addVersion(
    organizationId: string,
    userId: string,
    userName: string,
    id: string,
    file: UploadedDocumentFile | undefined,
    changeNote?: string,
  ) {
    const existing = await this.prisma.document.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Document not found");
    if (!file) throw new BadRequestException("A file is required to add a new version");

    const storageKey = await this.storage.save(organizationId, file.buffer, file.originalname);
    const nextVersion = existing.currentVersion + 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.documentVersion.create({
        data: {
          documentId: id,
          version: nextVersion,
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          storageKey,
          uploadedById: userId,
          uploadedByName: userName,
          changeNote: changeNote?.trim() || "Renewed document",
        },
      });
      await tx.document.update({
        where: { id, organizationId },
        data: {
          currentVersion: nextVersion,
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          storageKey,
          status: existing.status === "ARCHIVED" ? existing.status : "RENEWED",
        },
      });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "DOCUMENT_VERSION_ADDED",
      entityType: "Document",
      entityId: id,
      referenceNo: existing.referenceNumber,
      newValue: { version: nextVersion, fileName: file.originalname },
    });
    return this.findOne(organizationId, id);
  }

  async archive(organizationId: string, userId: string, userName: string, id: string, reason?: string) {
    const existing = await this.prisma.document.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Document not found");

    const record = await this.prisma.document.update({
      where: { id, organizationId },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedById: userId,
        archivedByName: userName,
        archiveReason: reason,
      },
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "DOCUMENT_ARCHIVED",
      entityType: "Document",
      entityId: id,
      referenceNo: existing.referenceNumber,
      newValue: toDto(record),
    });
    return this.findOne(organizationId, id);
  }

  async restore(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.document.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Document not found");

    const record = await this.prisma.document.update({
      where: { id, organizationId },
      data: { status: "ACTIVE", archivedAt: null, archivedById: null, archivedByName: null, archiveReason: null },
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "DOCUMENT_RESTORED",
      entityType: "Document",
      entityId: id,
      referenceNo: existing.referenceNumber,
      newValue: toDto(record),
    });
    return this.findOne(organizationId, id);
  }

  async getFileForDownload(organizationId: string, id: string, version?: number) {
    const record = await this.prisma.document.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Document not found");

    if (version) {
      const versionRow = record.versions.find((v) => v.version === version);
      if (!versionRow) throw new NotFoundException("Document version not found");
      const buffer = await this.storage.read(versionRow.storageKey);
      return { buffer, fileName: versionRow.fileName, fileType: versionRow.fileType };
    }
    if (!record.storageKey) throw new NotFoundException("No file has been uploaded for this document");
    const buffer = await this.storage.read(record.storageKey);
    return { buffer, fileName: record.fileName ?? "document", fileType: record.fileType ?? "application/octet-stream" };
  }
}
