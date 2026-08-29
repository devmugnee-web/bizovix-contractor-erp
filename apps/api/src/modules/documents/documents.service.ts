import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { DocumentStorageService } from "./document-storage.service";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { QueryDocumentDto } from "./dto/query-document.dto";

export type UploadedDocumentFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const CHALLAN_DOCUMENT_TYPES = new Set([
  "DELIVERY_CHALLAN",
  "SUPPLIER_INVOICE",
  "WORK_ORDER_BOQ",
  "MATERIAL_SPECIFICATION",
  "SITE_RECEIVING_NOTE",
  "OTHER_SUPPORTING_DOCUMENTS",
]);
const CHALLAN_FILE_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const CHALLAN_FILE_MAX_SIZE = 10 * 1024 * 1024;
const MUTABLE_CHALLAN_STATUSES = new Set(["DRAFT", "REJECTED"]);

export function hasValidChallanFileSignature(mimeType: string, buffer: Buffer) {
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).equals(Buffer.from("%PDF-"));
  if (mimeType === "image/jpeg")
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png")
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}

type DocumentLinkInput = Omit<
  Partial<CreateDocumentDto>,
  "challanSubmissionId" | "workId" | "contractId"
> & {
  challanSubmissionId?: string | null;
  workId?: string | null;
  contractId?: string | null;
};

type LockedChallan = {
  id: string;
  cmsWorkId: string;
  contractId: string | null;
  status: string;
  cmsWorkStatus: string;
};

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
      ...(query.challanSubmissionId ? { challanSubmissionId: query.challanSubmissionId } : {}),
      ...(query.variationOrderId ? { variationOrderId: query.variationOrderId } : {}),
      ...(query.timeExtensionId ? { timeExtensionId: query.timeExtensionId } : {}),
      ...(query.partyId ? { partyId: query.partyId } : {}),
      ...(query.purchaseRequisitionId
        ? { purchaseRequisitionId: query.purchaseRequisitionId }
        : {}),
      ...(query.rfqId ? { rfqId: query.rfqId } : {}),
      ...(query.supplierQuotationId ? { supplierQuotationId: query.supplierQuotationId } : {}),
      ...(query.comparativeStatementId
        ? { comparativeStatementId: query.comparativeStatementId }
        : {}),
      ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
      ...(query.goodsReceiptNoteId ? { goodsReceiptNoteId: query.goodsReceiptNoteId } : {}),
      ...(query.supplierBillId ? { supplierBillId: query.supplierBillId } : {}),
      ...(query.supplierPaymentId ? { supplierPaymentId: query.supplierPaymentId } : {}),
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

    return {
      items: items.map(toDto),
      meta: buildPaginationMeta(total, page, limit) satisfies PaginationMeta,
    };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.document.findFirst({
      where: { id, organizationId },
      include: includeRelations,
    });
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

  /** Blocks picking an archived party for a document link. Only meaningful when the caller is
   * actually assigning a NEW partyId — never re-checked for unrelated edits to a document whose
   * party link was set before that party was archived (historical linkage stays intact). */
  private async assertPartyNotArchived(organizationId: string, partyId: string) {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, organizationId },
      select: { status: true },
    });
    if (party?.status === "ARCHIVED")
      throw new BadRequestException("Cannot link an archived vendor/party to a document");
  }

  private assertChallanDocumentType(documentType?: string | null) {
    if (!documentType || !CHALLAN_DOCUMENT_TYPES.has(documentType)) {
      throw new BadRequestException(
        "Challan documents must use one of these document types: " +
          Array.from(CHALLAN_DOCUMENT_TYPES).join(", "),
      );
    }
  }

  private assertChallanFile(
    fileType: string | null | undefined,
    fileSize: number | null | undefined,
  ) {
    if (!fileType || !CHALLAN_FILE_MIME_TYPES.has(fileType)) {
      throw new BadRequestException("Challan documents must be PDF, JPEG, or PNG files");
    }
    if (fileSize === null || fileSize === undefined || fileSize > CHALLAN_FILE_MAX_SIZE) {
      throw new BadRequestException("Challan document files cannot exceed 10 MB");
    }
  }

  private assertUploadedChallanFile(file: UploadedDocumentFile) {
    this.assertChallanFile(file.mimetype, file.size);
    this.assertChallanFile(file.mimetype, file.buffer.byteLength);
    if (!hasValidChallanFileSignature(file.mimetype, file.buffer)) {
      throw new BadRequestException(
        "Challan document content does not match its declared PDF, JPEG, or PNG file type",
      );
    }
  }

  private assertExistingChallanFiles(record: {
    fileUrl: string | null;
    fileName: string | null;
    fileType: string | null;
    fileSize: number | null;
    storageKey: string | null;
    versions: Array<{ fileType: string; fileSize: number }>;
  }) {
    if (record.fileUrl || record.fileName || record.storageKey)
      this.assertChallanFile(record.fileType, record.fileSize);
    for (const version of record.versions)
      this.assertChallanFile(version.fileType, version.fileSize);
  }

  private assertChallanMutableState(challan: Pick<LockedChallan, "status" | "cmsWorkStatus">) {
    if (challan.cmsWorkStatus === "CANCELLED") {
      throw new BadRequestException("Documents cannot be changed for a cancelled Challan project");
    }
    if (!MUTABLE_CHALLAN_STATUSES.has(challan.status)) {
      throw new BadRequestException(
        "Challan documents can only be changed while the Challan is Draft or Rejected",
      );
    }
  }

  private assertChallanLinks(
    challan: Pick<LockedChallan, "cmsWorkId" | "contractId">,
    workId: string | null | undefined,
    contractId: string | null | undefined,
  ) {
    if (workId !== challan.cmsWorkId) {
      throw new BadRequestException("Linked challan must belong to the selected project");
    }
    if (contractId !== challan.contractId) {
      throw new BadRequestException("Linked challan must belong to the selected contract");
    }
  }

  private async lockMutableChallan(
    tx: Prisma.TransactionClient,
    organizationId: string,
    challanSubmissionId: string,
  ) {
    const rows = await tx.$queryRaw<LockedChallan[]>`
      SELECT
        c."id",
        c."cmsWorkId",
        c."contractId",
        c."status"::text AS "status",
        w."status"::text AS "cmsWorkStatus"
      FROM "challan_submissions" c
      INNER JOIN "cms_works" w
        ON w."id" = c."cmsWorkId" AND w."organizationId" = c."organizationId"
      WHERE c."id" = ${challanSubmissionId} AND c."organizationId" = ${organizationId}
      FOR UPDATE OF c
    `;
    const challan = rows[0];
    if (!challan) throw new NotFoundException("Challan Submission not found in this organization");
    this.assertChallanMutableState(challan);
    return challan;
  }

  private async lockMutableChallans(
    tx: Prisma.TransactionClient,
    organizationId: string,
    challanSubmissionIds: Array<string | null | undefined>,
  ) {
    const locked = new Map<string, LockedChallan>();
    const ids = [...new Set(challanSubmissionIds.filter((id): id is string => Boolean(id)))].sort();
    for (const id of ids) locked.set(id, await this.lockMutableChallan(tx, organizationId, id));
    return locked;
  }

  private async lockDocument(tx: Prisma.TransactionClient, organizationId: string, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "documents"
      WHERE "id" = ${id} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (!rows[0]) throw new NotFoundException("Document not found");
    return tx.document.findFirstOrThrow({ where: { id, organizationId } });
  }

  private rethrowPrismaConflict(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException(message);
    }
    throw error;
  }

  private async assertLinkedEntities(organizationId: string, dto: DocumentLinkInput) {
    if (
      dto.challanSubmissionId !== null &&
      dto.challanSubmissionId !== undefined &&
      !dto.challanSubmissionId.trim()
    ) {
      throw new BadRequestException(
        "Challan Submission is required when linking a challan document",
      );
    }

    const [
      tender,
      work,
      contract,
      bill,
      challan,
      variation,
      eot,
      master,
      party,
      certificate,
      dlp,
      defect,
      retention,
      handover,
      pr,
      rfq,
      quotation,
      cs,
      po,
      grn,
      supplierBill,
      supplierPayment,
    ] = await Promise.all([
      dto.tenderId
        ? this.prisma.tender.findFirst({
            where: { id: dto.tenderId, organizationId },
            select: { id: true },
          })
        : null,
      dto.workId
        ? this.prisma.cmsWork.findFirst({
            where: { id: dto.workId, organizationId },
            select: { id: true },
          })
        : null,
      dto.contractId
        ? this.prisma.projectContract.findFirst({
            where: { id: dto.contractId, organizationId },
            select: { id: true, cmsWorkId: true },
          })
        : null,
      dto.projectBillId
        ? this.prisma.projectBill.findFirst({
            where: { id: dto.projectBillId, organizationId },
            select: { id: true, cmsWorkId: true, contractId: true },
          })
        : null,
      dto.challanSubmissionId
        ? this.prisma.challanSubmission.findFirst({
            where: { id: dto.challanSubmissionId, organizationId },
            select: {
              id: true,
              cmsWorkId: true,
              contractId: true,
              status: true,
              cmsWork: { select: { status: true } },
            },
          })
        : null,
      dto.variationOrderId
        ? this.prisma.variationOrder.findFirst({
            where: { id: dto.variationOrderId, organizationId },
            select: { id: true, cmsWorkId: true, contractId: true },
          })
        : null,
      dto.timeExtensionId
        ? this.prisma.timeExtension.findFirst({
            where: { id: dto.timeExtensionId, organizationId },
            select: { id: true, cmsWorkId: true, contractId: true },
          })
        : null,
      dto.organizationMasterId
        ? this.prisma.organizationMaster.findFirst({
            where: { id: dto.organizationMasterId, organizationId },
            select: { id: true },
          })
        : null,
      dto.partyId
        ? this.prisma.party.findFirst({
            where: { id: dto.partyId, organizationId },
            select: { id: true },
          })
        : null,
      dto.completionCertificateId
        ? this.prisma.completionCertificate.findFirst({
            where: { id: dto.completionCertificateId, organizationId },
            select: { id: true, workId: true, contractId: true },
          })
        : null,
      dto.dlpId
        ? this.prisma.defectLiabilityPeriod.findFirst({
            where: { id: dto.dlpId, organizationId },
            select: { id: true, workId: true, contractId: true },
          })
        : null,
      dto.defectId
        ? this.prisma.dlpDefect.findFirst({
            where: { id: dto.defectId, organizationId },
            select: { id: true, dlp: { select: { workId: true } } },
          })
        : null,
      dto.retentionReleaseId
        ? this.prisma.retentionRelease.findFirst({
            where: { id: dto.retentionReleaseId, organizationId },
            select: { id: true, workId: true, contractId: true },
          })
        : null,
      dto.projectHandoverId
        ? this.prisma.projectHandover.findFirst({
            where: { id: dto.projectHandoverId, organizationId },
            select: { id: true, workId: true, contractId: true },
          })
        : null,
      dto.purchaseRequisitionId
        ? this.prisma.purchaseRequisition.findFirst({
            where: { id: dto.purchaseRequisitionId, organizationId },
            select: { id: true, cmsWorkId: true },
          })
        : null,
      dto.rfqId
        ? this.prisma.requestForQuotation.findFirst({
            where: { id: dto.rfqId, organizationId },
            select: { id: true, cmsWorkId: true },
          })
        : null,
      dto.supplierQuotationId
        ? this.prisma.supplierQuotation.findFirst({
            where: { id: dto.supplierQuotationId, organizationId },
            select: { id: true },
          })
        : null,
      dto.comparativeStatementId
        ? this.prisma.comparativeStatement.findFirst({
            where: { id: dto.comparativeStatementId, organizationId },
            select: { id: true, cmsWorkId: true },
          })
        : null,
      dto.purchaseOrderId
        ? this.prisma.purchaseOrder.findFirst({
            where: { id: dto.purchaseOrderId, organizationId },
            select: { id: true, cmsWorkId: true },
          })
        : null,
      dto.goodsReceiptNoteId
        ? this.prisma.goodsReceiptNote.findFirst({
            where: { id: dto.goodsReceiptNoteId, organizationId },
            select: { id: true, cmsWorkId: true },
          })
        : null,
      dto.supplierBillId
        ? this.prisma.supplierBill.findFirst({
            where: { id: dto.supplierBillId, organizationId },
            select: { id: true, cmsWorkId: true },
          })
        : null,
      dto.supplierPaymentId
        ? this.prisma.supplierPayment.findFirst({
            where: { id: dto.supplierPaymentId, organizationId },
            select: { id: true },
          })
        : null,
    ]);
    const checks: Array<[unknown, string | null | undefined, string]> = [
      [tender, dto.tenderId, "Tender"],
      [work, dto.workId, "Project"],
      [contract, dto.contractId, "Contract"],
      [bill, dto.projectBillId, "Project bill"],
      [challan, dto.challanSubmissionId, "Challan Submission"],
      [variation, dto.variationOrderId, "Variation"],
      [eot, dto.timeExtensionId, "Time extension"],
      [master, dto.organizationMasterId, "Organization master"],
      [party, dto.partyId, "Vendor/Party"],
      [certificate, dto.completionCertificateId, "Completion certificate"],
      [dlp, dto.dlpId, "DLP"],
      [defect, dto.defectId, "Defect"],
      [retention, dto.retentionReleaseId, "Retention release"],
      [handover, dto.projectHandoverId, "Handover"],
      [pr, dto.purchaseRequisitionId, "Purchase Requisition"],
      [rfq, dto.rfqId, "RFQ"],
      [quotation, dto.supplierQuotationId, "Supplier Quotation"],
      [cs, dto.comparativeStatementId, "Comparative Statement"],
      [po, dto.purchaseOrderId, "Purchase Order"],
      [grn, dto.goodsReceiptNoteId, "GRN"],
      [supplierBill, dto.supplierBillId, "Supplier Bill"],
      [supplierPayment, dto.supplierPaymentId, "Supplier Payment"],
    ];
    for (const [record, supplied, label] of checks)
      if (supplied && !record)
        throw new NotFoundException(`${label} not found in this organization`);
    if (challan) {
      this.assertChallanMutableState({
        status: challan.status,
        cmsWorkStatus: challan.cmsWork.status,
      });
    }
    const expectedWorkId = challan && dto.workId === undefined ? challan.cmsWorkId : dto.workId;
    const expectedContractId =
      challan && dto.contractId === undefined ? challan.contractId : dto.contractId;
    if (challan && expectedWorkId !== challan.cmsWorkId)
      throw new BadRequestException("Linked challan must belong to the selected project");
    if (challan && expectedContractId !== challan.contractId)
      throw new BadRequestException("Linked challan must belong to the selected contract");
    for (const linked of [
      contract,
      bill,
      variation,
      eot,
      certificate,
      dlp,
      retention,
      handover,
      pr,
      rfq,
      cs,
      po,
      grn,
      supplierBill,
    ]) {
      if (
        expectedWorkId &&
        linked &&
        ("cmsWorkId" in linked ? linked.cmsWorkId : linked.workId) !== expectedWorkId
      )
        throw new BadRequestException("Linked records must belong to the selected project");
    }
    if (expectedWorkId && defect && defect.dlp.workId !== expectedWorkId)
      throw new BadRequestException("Defect does not belong to the selected project");
    if (expectedContractId)
      for (const linked of [bill, variation, eot, certificate, dlp, retention, handover])
        if (linked && linked.contractId !== expectedContractId)
          throw new BadRequestException("Linked records must belong to the selected contract");

    return {
      challanSubmissionId: dto.challanSubmissionId,
      workId: expectedWorkId,
      contractId: expectedContractId,
    };
  }

  async create(
    organizationId: string,
    userId: string,
    userName: string,
    dto: CreateDocumentDto,
    file?: UploadedDocumentFile,
  ) {
    const links = await this.assertLinkedEntities(organizationId, dto);
    if (dto.partyId) await this.assertPartyNotArchived(organizationId, dto.partyId);
    if (links.challanSubmissionId) {
      this.assertChallanDocumentType(dto.documentType);
      if (file) this.assertUploadedChallanFile(file);
      const duplicate = await this.prisma.document.findFirst({
        where: {
          organizationId,
          challanSubmissionId: links.challanSubmissionId,
          documentType: dto.documentType,
          status: { not: "ARCHIVED" },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          "An active document already exists for this challan document type; add a new version instead",
        );
      }
    }
    let fileMeta: { fileName?: string; fileType?: string; fileSize?: number; storageKey?: string } =
      {};
    if (file) {
      const storageKey = await this.storage.save(organizationId, file.buffer, file.originalname);
      fileMeta = {
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        storageKey,
      };
    }

    const record = await this.prisma
      .$transaction(async (tx) => {
        if (links.challanSubmissionId) {
          const challan = await this.lockMutableChallan(
            tx,
            organizationId,
            links.challanSubmissionId,
          );
          this.assertChallanLinks(challan, links.workId, links.contractId);
          const duplicate = await tx.document.findFirst({
            where: {
              organizationId,
              challanSubmissionId: links.challanSubmissionId,
              documentType: dto.documentType,
              status: { not: "ARCHIVED" },
            },
            select: { id: true },
          });
          if (duplicate) {
            throw new ConflictException(
              "An active document already exists for this challan document type; add a new version instead",
            );
          }
        }
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
            workId: links.workId,
            contractId: links.contractId,
            projectBillId: dto.projectBillId,
            challanSubmissionId: links.challanSubmissionId,
            variationOrderId: dto.variationOrderId,
            timeExtensionId: dto.timeExtensionId,
            completionCertificateId: dto.completionCertificateId,
            dlpId: dto.dlpId,
            defectId: dto.defectId,
            retentionReleaseId: dto.retentionReleaseId,
            projectHandoverId: dto.projectHandoverId,
            organizationMasterId: dto.organizationMasterId,
            partyId: dto.partyId,
            purchaseRequisitionId: dto.purchaseRequisitionId,
            rfqId: dto.rfqId,
            supplierQuotationId: dto.supplierQuotationId,
            comparativeStatementId: dto.comparativeStatementId,
            purchaseOrderId: dto.purchaseOrderId,
            goodsReceiptNoteId: dto.goodsReceiptNoteId,
            supplierBillId: dto.supplierBillId,
            supplierPaymentId: dto.supplierPaymentId,
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
      })
      .catch(async (error: unknown) => {
        if (fileMeta.storageKey)
          await this.storage.delete(fileMeta.storageKey).catch(() => undefined);
        this.rethrowPrismaConflict(
          error,
          "An active document already exists for this challan document type; add a new version instead",
        );
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
    const nextChallanSubmissionId =
      dto.challanSubmissionId === undefined
        ? existing.challanSubmissionId
        : dto.challanSubmissionId;
    const hasChallanLink =
      nextChallanSubmissionId !== null && nextChallanSubmissionId !== undefined;
    const links = await this.assertLinkedEntities(organizationId, {
      tenderId:
        dto.tenderId === undefined ? (existing.tenderId ?? undefined) : (dto.tenderId ?? undefined),
      workId:
        hasChallanLink && dto.workId === undefined
          ? undefined
          : dto.workId === undefined
            ? (existing.workId ?? undefined)
            : (dto.workId ?? undefined),
      contractId:
        hasChallanLink && dto.contractId === undefined
          ? undefined
          : dto.contractId === undefined
            ? (existing.contractId ?? undefined)
            : (dto.contractId ?? undefined),
      projectBillId:
        dto.projectBillId === undefined
          ? (existing.projectBillId ?? undefined)
          : (dto.projectBillId ?? undefined),
      challanSubmissionId: nextChallanSubmissionId,
      variationOrderId:
        dto.variationOrderId === undefined
          ? (existing.variationOrderId ?? undefined)
          : (dto.variationOrderId ?? undefined),
      timeExtensionId:
        dto.timeExtensionId === undefined
          ? (existing.timeExtensionId ?? undefined)
          : (dto.timeExtensionId ?? undefined),
      completionCertificateId:
        dto.completionCertificateId === undefined
          ? (existing.completionCertificateId ?? undefined)
          : (dto.completionCertificateId ?? undefined),
      dlpId: dto.dlpId === undefined ? (existing.dlpId ?? undefined) : (dto.dlpId ?? undefined),
      defectId:
        dto.defectId === undefined ? (existing.defectId ?? undefined) : (dto.defectId ?? undefined),
      retentionReleaseId:
        dto.retentionReleaseId === undefined
          ? (existing.retentionReleaseId ?? undefined)
          : (dto.retentionReleaseId ?? undefined),
      projectHandoverId:
        dto.projectHandoverId === undefined
          ? (existing.projectHandoverId ?? undefined)
          : (dto.projectHandoverId ?? undefined),
      organizationMasterId:
        dto.organizationMasterId === undefined
          ? (existing.organizationMasterId ?? undefined)
          : (dto.organizationMasterId ?? undefined),
      partyId:
        dto.partyId === undefined ? (existing.partyId ?? undefined) : (dto.partyId ?? undefined),
      purchaseRequisitionId:
        dto.purchaseRequisitionId === undefined
          ? (existing.purchaseRequisitionId ?? undefined)
          : (dto.purchaseRequisitionId ?? undefined),
      rfqId: dto.rfqId === undefined ? (existing.rfqId ?? undefined) : (dto.rfqId ?? undefined),
      supplierQuotationId:
        dto.supplierQuotationId === undefined
          ? (existing.supplierQuotationId ?? undefined)
          : (dto.supplierQuotationId ?? undefined),
      comparativeStatementId:
        dto.comparativeStatementId === undefined
          ? (existing.comparativeStatementId ?? undefined)
          : (dto.comparativeStatementId ?? undefined),
      purchaseOrderId:
        dto.purchaseOrderId === undefined
          ? (existing.purchaseOrderId ?? undefined)
          : (dto.purchaseOrderId ?? undefined),
      goodsReceiptNoteId:
        dto.goodsReceiptNoteId === undefined
          ? (existing.goodsReceiptNoteId ?? undefined)
          : (dto.goodsReceiptNoteId ?? undefined),
      supplierBillId:
        dto.supplierBillId === undefined
          ? (existing.supplierBillId ?? undefined)
          : (dto.supplierBillId ?? undefined),
      supplierPaymentId:
        dto.supplierPaymentId === undefined
          ? (existing.supplierPaymentId ?? undefined)
          : (dto.supplierPaymentId ?? undefined),
    });
    if (dto.partyId !== undefined && dto.partyId !== existing.partyId && dto.partyId)
      await this.assertPartyNotArchived(organizationId, dto.partyId);
    if (links.challanSubmissionId) {
      this.assertChallanDocumentType(
        dto.documentType === undefined ? existing.documentType : dto.documentType,
      );
      const versions = await this.prisma.documentVersion.findMany({
        where: { documentId: id },
        select: { fileType: true, fileSize: true },
      });
      this.assertExistingChallanFiles({ ...existing, versions });
    }

    const mutation = await this.prisma
      .$transaction(async (tx) => {
        const current = await this.lockDocument(tx, organizationId, id);
        const currentChallanSubmissionId =
          dto.challanSubmissionId === undefined
            ? current.challanSubmissionId
            : dto.challanSubmissionId;
        const locked = await this.lockMutableChallans(tx, organizationId, [
          current.challanSubmissionId,
          currentChallanSubmissionId,
        ]);
        let currentWorkId = dto.workId === undefined ? current.workId : dto.workId;
        let currentContractId = dto.contractId === undefined ? current.contractId : dto.contractId;
        if (currentChallanSubmissionId) {
          const challan = locked.get(currentChallanSubmissionId)!;
          if (dto.workId === undefined) currentWorkId = challan.cmsWorkId;
          if (dto.contractId === undefined) currentContractId = challan.contractId;
          this.assertChallanLinks(challan, currentWorkId, currentContractId);
          this.assertChallanDocumentType(
            dto.documentType === undefined ? current.documentType : dto.documentType,
          );
          const versions = await tx.documentVersion.findMany({
            where: { documentId: id },
            select: { fileType: true, fileSize: true },
          });
          this.assertExistingChallanFiles({ ...current, versions });
          if (current.status !== "ARCHIVED") {
            const duplicate = await tx.document.findFirst({
              where: {
                id: { not: id },
                organizationId,
                challanSubmissionId: currentChallanSubmissionId,
                documentType:
                  dto.documentType === undefined ? current.documentType : dto.documentType,
                status: { not: "ARCHIVED" },
              },
              select: { id: true },
            });
            if (duplicate) {
              throw new ConflictException(
                "An active document already exists for this challan document type; add a new version instead",
              );
            }
          }
        }
        const record = await tx.document.update({
          where: { id, organizationId },
          data: {
            ...(dto.name ? { name: dto.name } : {}),
            ...(dto.category !== undefined ? { category: dto.category } : {}),
            ...(dto.documentType !== undefined ? { documentType: dto.documentType } : {}),
            ...(dto.relatedModule !== undefined ? { relatedModule: dto.relatedModule } : {}),
            ...(dto.relatedEntityId !== undefined ? { relatedEntityId: dto.relatedEntityId } : {}),
            ...(dto.relatedEntityName !== undefined
              ? { relatedEntityName: dto.relatedEntityName }
              : {}),
            ...(dto.tenderId !== undefined ? { tenderId: dto.tenderId } : {}),
            ...(currentChallanSubmissionId
              ? { workId: currentWorkId, contractId: currentContractId }
              : {
                  ...(dto.workId !== undefined ? { workId: dto.workId } : {}),
                  ...(dto.contractId !== undefined ? { contractId: dto.contractId } : {}),
                }),
            ...(dto.projectBillId !== undefined ? { projectBillId: dto.projectBillId } : {}),
            ...(dto.challanSubmissionId !== undefined
              ? { challanSubmissionId: dto.challanSubmissionId }
              : {}),
            ...(dto.variationOrderId !== undefined
              ? { variationOrderId: dto.variationOrderId }
              : {}),
            ...(dto.timeExtensionId !== undefined ? { timeExtensionId: dto.timeExtensionId } : {}),
            ...(dto.completionCertificateId !== undefined
              ? { completionCertificateId: dto.completionCertificateId }
              : {}),
            ...(dto.dlpId !== undefined ? { dlpId: dto.dlpId } : {}),
            ...(dto.defectId !== undefined ? { defectId: dto.defectId } : {}),
            ...(dto.retentionReleaseId !== undefined
              ? { retentionReleaseId: dto.retentionReleaseId }
              : {}),
            ...(dto.projectHandoverId !== undefined
              ? { projectHandoverId: dto.projectHandoverId }
              : {}),
            ...(dto.organizationMasterId !== undefined
              ? { organizationMasterId: dto.organizationMasterId }
              : {}),
            ...(dto.partyId !== undefined ? { partyId: dto.partyId } : {}),
            ...(dto.purchaseRequisitionId !== undefined
              ? { purchaseRequisitionId: dto.purchaseRequisitionId }
              : {}),
            ...(dto.rfqId !== undefined ? { rfqId: dto.rfqId } : {}),
            ...(dto.supplierQuotationId !== undefined
              ? { supplierQuotationId: dto.supplierQuotationId }
              : {}),
            ...(dto.comparativeStatementId !== undefined
              ? { comparativeStatementId: dto.comparativeStatementId }
              : {}),
            ...(dto.purchaseOrderId !== undefined ? { purchaseOrderId: dto.purchaseOrderId } : {}),
            ...(dto.goodsReceiptNoteId !== undefined
              ? { goodsReceiptNoteId: dto.goodsReceiptNoteId }
              : {}),
            ...(dto.supplierBillId !== undefined ? { supplierBillId: dto.supplierBillId } : {}),
            ...(dto.supplierPaymentId !== undefined
              ? { supplierPaymentId: dto.supplierPaymentId }
              : {}),
            ...(dto.referenceNumber !== undefined ? { referenceNumber: dto.referenceNumber } : {}),
            ...(dto.certificateNumber !== undefined
              ? { certificateNumber: dto.certificateNumber }
              : {}),
            ...(dto.issuingAuthority !== undefined
              ? { issuingAuthority: dto.issuingAuthority }
              : {}),
            ...(dto.account !== undefined ? { account: dto.account } : {}),
            ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
            ...(dto.issueDate !== undefined
              ? { issueDate: dto.issueDate ? new Date(dto.issueDate) : null }
              : {}),
            ...(dto.expiryDate !== undefined
              ? { expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null }
              : {}),
            ...(dto.reminderDays !== undefined ? { reminderDays: dto.reminderDays } : {}),
            ...(dto.responsiblePerson !== undefined
              ? { responsiblePerson: dto.responsiblePerson }
              : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.tags !== undefined ? { tags: this.tagsArray(dto.tags) } : {}),
          },
        });
        return { previous: current, record };
      })
      .catch((error: unknown) =>
        this.rethrowPrismaConflict(
          error,
          "An active document already exists for this challan document type; add a new version instead",
        ),
      );
    const record = mutation.record;

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "update",
      entityType: "Document",
      entityId: id,
      oldValue: toDto(mutation.previous),
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
    if (existing.challanSubmissionId) {
      await this.assertLinkedEntities(organizationId, {
        challanSubmissionId: existing.challanSubmissionId,
        workId: existing.workId,
        contractId: existing.contractId,
      });
      this.assertChallanDocumentType(existing.documentType);
      this.assertUploadedChallanFile(file);
    }

    const storageKey = await this.storage.save(organizationId, file.buffer, file.originalname);
    const versionResult = await this.prisma
      .$transaction(async (tx) => {
        const current = await this.lockDocument(tx, organizationId, id);
        if (current.challanSubmissionId) {
          const challan = await this.lockMutableChallan(
            tx,
            organizationId,
            current.challanSubmissionId,
          );
          this.assertChallanLinks(challan, current.workId, current.contractId);
          this.assertChallanDocumentType(current.documentType);
          this.assertUploadedChallanFile(file);
        }
        const updated = await tx.document.update({
          where: { id, organizationId },
          data: {
            currentVersion: { increment: 1 },
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
            storageKey,
            status: current.status === "ARCHIVED" ? current.status : "RENEWED",
          },
          select: { currentVersion: true },
        });
        await tx.documentVersion.create({
          data: {
            documentId: id,
            version: updated.currentVersion,
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
            storageKey,
            uploadedById: userId,
            uploadedByName: userName,
            changeNote: changeNote?.trim() || "Renewed document",
          },
        });
        return { nextVersion: updated.currentVersion, referenceNumber: current.referenceNumber };
      })
      .catch(async (error: unknown) => {
        await this.storage.delete(storageKey).catch(() => undefined);
        this.rethrowPrismaConflict(
          error,
          "A document version was added at the same moment; refresh and retry",
        );
      });
    const nextVersion = versionResult.nextVersion;

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "DOCUMENT_VERSION_ADDED",
      entityType: "Document",
      entityId: id,
      referenceNo: versionResult.referenceNumber,
      newValue: { version: nextVersion, fileName: file.originalname },
    });
    return this.findOne(organizationId, id);
  }

  async archive(
    organizationId: string,
    userId: string,
    userName: string,
    id: string,
    reason?: string,
  ) {
    const existing = await this.prisma.document.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Document not found");

    const mutation = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockDocument(tx, organizationId, id);
      if (current.challanSubmissionId) {
        const challan = await this.lockMutableChallan(
          tx,
          organizationId,
          current.challanSubmissionId,
        );
        this.assertChallanLinks(challan, current.workId, current.contractId);
      }
      const record = await tx.document.update({
        where: { id, organizationId },
        data: {
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedById: userId,
          archivedByName: userName,
          archiveReason: reason,
        },
      });
      return { previous: current, record };
    });
    const record = mutation.record;

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "DOCUMENT_ARCHIVED",
      entityType: "Document",
      entityId: id,
      referenceNo: mutation.previous.referenceNumber,
      newValue: toDto(record),
    });
    return this.findOne(organizationId, id);
  }

  async restore(organizationId: string, userId: string, id: string) {
    const existing = await this.prisma.document.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Document not found");

    const mutation = await this.prisma
      .$transaction(async (tx) => {
        const current = await this.lockDocument(tx, organizationId, id);
        if (current.challanSubmissionId) {
          const challan = await this.lockMutableChallan(
            tx,
            organizationId,
            current.challanSubmissionId,
          );
          this.assertChallanLinks(challan, current.workId, current.contractId);
          this.assertChallanDocumentType(current.documentType);
          const versions = await tx.documentVersion.findMany({
            where: { documentId: id },
            select: { fileType: true, fileSize: true },
          });
          this.assertExistingChallanFiles({ ...current, versions });
          const duplicate = await tx.document.findFirst({
            where: {
              id: { not: id },
              organizationId,
              challanSubmissionId: current.challanSubmissionId,
              documentType: current.documentType,
              status: { not: "ARCHIVED" },
            },
            select: { id: true },
          });
          if (duplicate) {
            throw new ConflictException(
              "An active document already exists for this challan document type; add a new version instead",
            );
          }
        }
        const record = await tx.document.update({
          where: { id, organizationId },
          data: {
            status: "ACTIVE",
            archivedAt: null,
            archivedById: null,
            archivedByName: null,
            archiveReason: null,
          },
        });
        return { previous: current, record };
      })
      .catch((error: unknown) =>
        this.rethrowPrismaConflict(
          error,
          "An active document already exists for this challan document type; add a new version instead",
        ),
      );
    const record = mutation.record;

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "DOCUMENT_RESTORED",
      entityType: "Document",
      entityId: id,
      referenceNo: mutation.previous.referenceNumber,
      newValue: toDto(record),
    });
    return this.findOne(organizationId, id);
  }

  async getFileForDownload(organizationId: string, id: string, version?: number) {
    const record = await this.prisma.document.findFirst({
      where: { id, organizationId },
      include: includeRelations,
    });
    if (!record) throw new NotFoundException("Document not found");

    if (version) {
      const versionRow = record.versions.find((v) => v.version === version);
      if (!versionRow) throw new NotFoundException("Document version not found");
      const buffer = await this.storage.read(versionRow.storageKey);
      return { buffer, fileName: versionRow.fileName, fileType: versionRow.fileType };
    }
    if (!record.storageKey)
      throw new NotFoundException("No file has been uploaded for this document");
    const buffer = await this.storage.read(record.storageKey);
    return {
      buffer,
      fileName: record.fileName ?? "document",
      fileType: record.fileType ?? "application/octet-stream",
    };
  }
}
