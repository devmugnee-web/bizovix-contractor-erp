import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  WorkIouExpenseFor,
  WorkIouPaymentMethod,
  WorkIouSettlementStatus,
  WorkIouStatus,
} from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import {
  CancelWorkIouDto,
  CreateWorkIouDto,
  QueryWorkIouDto,
  UpdateWorkIouDto,
  VersionedWorkIouActionDto,
  WorkIouItemInputDto,
} from "./dto/work-iou.dto";
import { calculateWorkIouTotals } from "./work-iou-calculation";
import { assertWorkIouFiles, type UploadedWorkIouFile } from "./work-iou-files";

const organizationSelect = { id: true, shortName: true, fullName: true } as const;
const listInclude = {
  paidBy: { select: { id: true, name: true } },
  tender: {
    select: {
      id: true,
      egpTenderId: true,
      workName: true,
      status: true,
      organizationMaster: { select: organizationSelect },
    },
  },
  work: {
    select: {
      id: true,
      tenderId: true,
      workName: true,
      workCategory: true,
      status: true,
      organizationMaster: { select: organizationSelect },
    },
  },
  _count: { select: { items: true, attachments: true } },
} satisfies Prisma.WorkIouInclude;
const detailInclude = {
  ...listInclude,
  submittedBy: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    include: { expenseHead: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  },
  attachments: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      uploadedById: true,
      uploadedBy: { select: { id: true, name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.WorkIouInclude;

type WorkIouListRecord = Prisma.WorkIouGetPayload<{ include: typeof listInclude }>;
type WorkIouDetailRecord = Prisma.WorkIouGetPayload<{ include: typeof detailInclude }>;
type WorkIouClient = Prisma.TransactionClient | PrismaService;

const iso = (value: Date | null) => value?.toISOString() ?? null;
const money = (value: Prisma.Decimal) => value.toFixed(2);
const nullableText = (value: string | null | undefined) => value?.trim() || null;
const organizationDto = (record: { id: string; shortName: string; fullName: string }) => ({
  id: record.id,
  name: record.fullName,
  shortName: record.shortName,
});

function headerDto(row: WorkIouListRecord) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    iouNo: row.iouNo,
    iouDate: row.iouDate.toISOString(),
    paidOn: row.paidOn.toISOString(),
    paidById: row.paidById,
    paidBy: row.paidBy,
    paidToName: row.paidToName,
    paymentMethod: row.paymentMethod,
    referenceNo: row.referenceNo,
    expenseFor: row.expenseFor,
    tenderId: row.tenderId,
    tender: row.tender
      ? {
          id: row.tender.id,
          tenderId: row.tender.egpTenderId,
          workName: row.tender.workName,
          status: row.tender.status,
          organization: row.tender.organizationMaster
            ? organizationDto(row.tender.organizationMaster)
            : null,
        }
      : null,
    workId: row.workId,
    work: row.work
      ? {
          id: row.work.id,
          tenderId: row.work.tenderId,
          workName: row.work.workName,
          workCategory: row.work.workCategory,
          status: row.work.status,
          organization: organizationDto(row.work.organizationMaster),
        }
      : null,
    purpose: row.purpose,
    remarks: row.remarks,
    otherCharges: money(row.otherCharges),
    subtotal: money(row.subtotal),
    discount: money(row.discount),
    totalAmount: money(row.totalAmount),
    settledAmount: money(row.settledAmount),
    dueAmount: money(row.totalAmount.sub(row.settledAmount)),
    settlementStatus: row.settlementStatus,
    expectedSettlementDate: iso(row.expectedSettlementDate),
    settlementRemarks: row.settlementRemarks,
    status: row.status,
    version: row.version,
    submittedAt: iso(row.submittedAt),
    submittedById: row.submittedById,
    cancelledAt: iso(row.cancelledAt),
    cancelledById: row.cancelledById,
    cancellationReason: row.cancellationReason,
    createdById: row.createdById,
    itemCount: row._count.items,
    attachmentCount: row._count.attachments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function detailDto(row: WorkIouDetailRecord) {
  return {
    ...headerDto(row),
    submittedBy: row.submittedBy,
    cancelledBy: row.cancelledBy,
    createdBy: row.createdBy,
    items: row.items.map((item) => ({
      id: item.id,
      organizationId: item.organizationId,
      workIouId: item.workIouId,
      expenseDate: item.expenseDate.toISOString(),
      description: item.description,
      expenseHeadId: item.expenseHeadId,
      expenseHead: item.expenseHead,
      categoryName: item.categoryName,
      paidToName: item.paidToName,
      referenceNo: item.referenceNo,
      amount: money(item.amount),
      sortOrder: item.sortOrder,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    attachments: row.attachments.map((attachment) => ({
      ...attachment,
      createdAt: attachment.createdAt.toISOString(),
    })),
  };
}

@Injectable()
export class WorkIousService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
  ) {}

  private endOfDay(value: string) {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private where(organizationId: string, query: QueryWorkIouDto): Prisma.WorkIouWhereInput {
    if (query.fromDate && query.toDate && new Date(query.fromDate) > this.endOfDay(query.toDate)) {
      throw new BadRequestException("From date must not be after to date");
    }
    return {
      organizationId,
      ...(query.status ? { status: query.status as WorkIouStatus } : {}),
      ...(query.settlementStatus
        ? { settlementStatus: query.settlementStatus as WorkIouSettlementStatus }
        : {}),
      ...(query.expenseFor ? { expenseFor: query.expenseFor as WorkIouExpenseFor } : {}),
      ...(query.paymentMethod
        ? { paymentMethod: query.paymentMethod as WorkIouPaymentMethod }
        : {}),
      ...(query.tenderId ? { tenderId: query.tenderId } : {}),
      ...(query.workId ? { workId: query.workId } : {}),
      ...(query.paidById ? { paidById: query.paidById } : {}),
      ...(query.fromDate || query.toDate
        ? {
            iouDate: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: this.endOfDay(query.toDate) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { iouNo: { contains: query.search, mode: "insensitive" } },
              { paidToName: { contains: query.search, mode: "insensitive" } },
              { purpose: { contains: query.search, mode: "insensitive" } },
              { referenceNo: { contains: query.search, mode: "insensitive" } },
              { paidBy: { name: { contains: query.search, mode: "insensitive" } } },
              { tender: { is: { workName: { contains: query.search, mode: "insensitive" } } } },
              { work: { is: { workName: { contains: query.search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
  }

  private async record(
    organizationId: string,
    id: string,
    client: WorkIouClient = this.prisma,
  ): Promise<WorkIouDetailRecord> {
    const row = await client.workIou.findFirst({
      where: { id, organizationId },
      include: detailInclude,
    });
    if (!row) throw new NotFoundException("Work IOU not found");
    return row;
  }

  private assertContext(
    expenseFor: WorkIouExpenseFor,
    tenderId: string | null | undefined,
    workId: string | null | undefined,
  ) {
    if (expenseFor === WorkIouExpenseFor.TENDER) {
      if (!tenderId || workId) {
        throw new BadRequestException(
          "Tender expense requires tenderId and must not include workId",
        );
      }
      return;
    }
    if (!workId || tenderId) {
      throw new BadRequestException(
        "Project expense requires workId and must not include tenderId",
      );
    }
  }

  private async assertReferences(
    client: WorkIouClient,
    organizationId: string,
    paidById: string,
    expenseFor: WorkIouExpenseFor,
    tenderId: string | null | undefined,
    workId: string | null | undefined,
    items: Array<Pick<WorkIouItemInputDto, "expenseHeadId">>,
  ) {
    this.assertContext(expenseFor, tenderId, workId);
    const headIds = [...new Set(items.map((item) => item.expenseHeadId))];
    const [membership, tender, work, heads] = await Promise.all([
      client.organizationUser.findFirst({
        where: { organizationId, userId: paidById, user: { isActive: true } },
        select: { id: true },
      }),
      tenderId
        ? client.tender.findFirst({
            where: { id: tenderId, organizationId },
            select: { id: true },
          })
        : null,
      workId
        ? client.cmsWork.findFirst({
            where: { id: workId, organizationId },
            select: { id: true },
          })
        : null,
      headIds.length
        ? client.expenseHead.findMany({
            where: { organizationId, id: { in: headIds }, isActive: true },
            select: { id: true, name: true },
          })
        : [],
    ]);
    if (!membership) throw new NotFoundException("Active paid-by user not found in this organization");
    if (tenderId && !tender) throw new NotFoundException("Tender not found in this organization");
    if (workId && !work) throw new NotFoundException("Project not found in this organization");
    if (heads.length !== headIds.length) {
      throw new NotFoundException("One or more active expense heads were not found");
    }
    return new Map(heads.map((head) => [head.id, head.name]));
  }

  private totals(
    amounts: Array<string | Prisma.Decimal>,
    otherCharges: string | Prisma.Decimal,
    discount: string | Prisma.Decimal,
  ) {
    try {
      return calculateWorkIouTotals(amounts, otherCharges, discount);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid Work IOU totals",
      );
    }
  }

  private itemData(
    organizationId: string,
    workIouId: string,
    items: WorkIouItemInputDto[],
    headNames: Map<string, string>,
  ) {
    return items.map((item, sortOrder) => ({
      organizationId,
      workIouId,
      expenseDate: new Date(item.expenseDate),
      description: item.description.trim(),
      expenseHeadId: item.expenseHeadId,
      categoryName: headNames.get(item.expenseHeadId)!,
      paidToName: item.paidToName.trim(),
      referenceNo: nullableText(item.referenceNo),
      amount: new Prisma.Decimal(item.amount),
      sortOrder,
    }));
  }

  private async cas(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    expectedVersion: number,
    statuses: WorkIouStatus[],
  ) {
    const result = await tx.workIou.updateMany({
      where: { id, organizationId, version: expectedVersion, status: { in: statuses } },
      data: { version: { increment: 1 } },
    });
    if (!result.count) {
      throw new ConflictException("Work IOU changed or is no longer in an editable state");
    }
  }

  async findAll(organizationId: string, query: QueryWorkIouDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.where(organizationId, query);
    const [rows, total] = await Promise.all([
      this.prisma.workIou.findMany({
        where,
        include: listInclude,
        orderBy: [{ iouDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.workIou.count({ where }),
    ]);
    return { items: rows.map(headerDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(organizationId: string, id: string) {
    return detailDto(await this.record(organizationId, id));
  }

  async options(organizationId: string) {
    const [memberships, expenseHeads, tenders, projects] = await Promise.all([
      this.prisma.organizationUser.findMany({
        where: { organizationId, user: { isActive: true } },
        select: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      this.prisma.expenseHead.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true, budgetCategory: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.tender.findMany({
        where: { organizationId },
        select: {
          id: true,
          egpTenderId: true,
          workName: true,
          status: true,
          organizationMaster: { select: organizationSelect },
        },
        orderBy: { workName: "asc" },
      }),
      this.prisma.cmsWork.findMany({
        where: { organizationId },
        select: {
          id: true,
          tenderId: true,
          workName: true,
          workCategory: true,
          status: true,
          organizationMaster: { select: organizationSelect },
        },
        orderBy: { workName: "asc" },
      }),
    ]);
    return {
      people: memberships.map((membership) => membership.user),
      expenseHeads,
      tenders: tenders.map((tender) => ({
        id: tender.id,
        tenderId: tender.egpTenderId,
        workName: tender.workName,
        status: tender.status,
        organization: tender.organizationMaster
          ? organizationDto(tender.organizationMaster)
          : null,
      })),
      projects: projects.map((work) => ({
        id: work.id,
        tenderId: work.tenderId,
        workName: work.workName,
        workCategory: work.workCategory,
        status: work.status,
        organization: organizationDto(work.organizationMaster),
      })),
    };
  }

  async create(organizationId: string, userId: string, dto: CreateWorkIouDto) {
    const expenseFor = dto.expenseFor as WorkIouExpenseFor;
    const items = dto.items ?? [];
    const totals = this.totals(items.map((item) => item.amount), dto.otherCharges ?? "0", dto.discount ?? "0");
    const id = await this.prisma.$transaction(async (tx) => {
      const headNames = await this.assertReferences(
        tx,
        organizationId,
        dto.paidById,
        expenseFor,
        dto.tenderId,
        dto.workId,
        items,
      );
      const iouNo = await this.numbering.next(organizationId, "WORK_IOU", tx);
      const row = await tx.workIou.create({
        data: {
          organizationId,
          iouNo,
          iouDate: new Date(dto.iouDate),
          paidOn: new Date(dto.paidOn),
          paidById: dto.paidById,
          paidToName: dto.paidToName.trim(),
          paymentMethod: dto.paymentMethod as WorkIouPaymentMethod,
          referenceNo: nullableText(dto.referenceNo),
          expenseFor,
          tenderId: dto.tenderId ?? null,
          workId: dto.workId ?? null,
          purpose: dto.purpose.trim(),
          remarks: nullableText(dto.remarks),
          otherCharges: totals.otherCharges,
          subtotal: totals.subtotal,
          discount: totals.discount,
          totalAmount: totals.totalAmount,
          settledAmount: new Prisma.Decimal(0),
          settlementStatus: "PENDING",
          expectedSettlementDate: dto.expectedSettlementDate
            ? new Date(dto.expectedSettlementDate)
            : null,
          settlementRemarks: nullableText(dto.settlementRemarks),
          status: "DRAFT",
          createdById: userId,
        },
      });
      if (items.length) {
        await tx.workIouItem.createMany({
          data: this.itemData(organizationId, row.id, items, headNames),
        });
      }
      await this.audit.record(
        {
          organizationId,
          userId,
          action: "create",
          entityType: "WorkIou",
          entityId: row.id,
          referenceNo: row.iouNo,
          newValue: { expenseFor, tenderId: row.tenderId, workId: row.workId, itemCount: items.length, totalAmount: totals.totalAmount.toFixed(2) },
        },
        tx,
      );
      return row.id;
    });
    return this.findOne(organizationId, id);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateWorkIouDto) {
    const old = await this.record(organizationId, id);
    const expenseFor = (dto.expenseFor ?? old.expenseFor) as WorkIouExpenseFor;
    const tenderId =
      dto.tenderId !== undefined
        ? dto.tenderId
        : dto.expenseFor === "PROJECT"
          ? null
          : old.tenderId;
    const workId =
      dto.workId !== undefined
        ? dto.workId
        : dto.expenseFor === "TENDER"
          ? null
          : old.workId;
    const paidById = dto.paidById ?? old.paidById;
    const inputItems = dto.items;
    const amounts = inputItems
      ? inputItems.map((item) => item.amount)
      : old.items.map((item) => item.amount);
    const totals = this.totals(
      amounts,
      dto.otherCharges ?? old.otherCharges,
      dto.discount ?? old.discount,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.cas(tx, organizationId, id, dto.expectedVersion, [WorkIouStatus.DRAFT]);
      const referenceItems = inputItems ?? old.items.map((item) => ({ expenseHeadId: item.expenseHeadId }));
      const headNames = await this.assertReferences(
        tx,
        organizationId,
        paidById,
        expenseFor,
        tenderId,
        workId,
        referenceItems,
      );
      if (inputItems) {
        await tx.workIouItem.deleteMany({ where: { organizationId, workIouId: id } });
        if (inputItems.length) {
          await tx.workIouItem.createMany({
            data: this.itemData(organizationId, id, inputItems, headNames),
          });
        }
      }
      await tx.workIou.update({
        where: { id },
        data: {
          ...(dto.iouDate !== undefined ? { iouDate: new Date(dto.iouDate) } : {}),
          ...(dto.paidOn !== undefined ? { paidOn: new Date(dto.paidOn) } : {}),
          paidById,
          ...(dto.paidToName !== undefined ? { paidToName: dto.paidToName.trim() } : {}),
          ...(dto.paymentMethod !== undefined
            ? { paymentMethod: dto.paymentMethod as WorkIouPaymentMethod }
            : {}),
          ...(dto.referenceNo !== undefined
            ? { referenceNo: nullableText(dto.referenceNo) }
            : {}),
          expenseFor,
          tenderId,
          workId,
          ...(dto.purpose !== undefined ? { purpose: dto.purpose.trim() } : {}),
          ...(dto.remarks !== undefined ? { remarks: nullableText(dto.remarks) } : {}),
          otherCharges: totals.otherCharges,
          subtotal: totals.subtotal,
          discount: totals.discount,
          totalAmount: totals.totalAmount,
          ...(dto.expectedSettlementDate !== undefined
            ? {
                expectedSettlementDate: dto.expectedSettlementDate
                  ? new Date(dto.expectedSettlementDate)
                  : null,
              }
            : {}),
          ...(dto.settlementRemarks !== undefined
            ? { settlementRemarks: nullableText(dto.settlementRemarks) }
            : {}),
        },
      });
      await this.audit.record(
        {
          organizationId,
          userId,
          action: "update",
          entityType: "WorkIou",
          entityId: id,
          referenceNo: old.iouNo,
          oldValue: detailDto(old),
          newValue: { expectedVersion: dto.expectedVersion, itemCount: inputItems?.length, totalAmount: totals.totalAmount.toFixed(2) },
        },
        tx,
      );
    });
    return this.findOne(organizationId, id);
  }

  async submit(
    organizationId: string,
    userId: string,
    id: string,
    dto: VersionedWorkIouActionDto,
  ) {
    const old = await this.record(organizationId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.cas(tx, organizationId, id, dto.expectedVersion, [WorkIouStatus.DRAFT]);
      const current = await this.record(organizationId, id, tx);
      if (!current.items.length) {
        throw new BadRequestException("At least one expense item is required before submitting");
      }
      if (!current.totalAmount.gt(0)) {
        throw new BadRequestException("Work IOU total must be greater than zero before submitting");
      }
      if (
        !current.purpose.trim() ||
        !current.paidToName.trim() ||
        current.items.some(
          (item) => !item.description.trim() || !item.paidToName.trim(),
        )
      ) {
        throw new BadRequestException(
          "Purpose, payee and expense item descriptions must contain text before submitting",
        );
      }
      await this.assertReferences(
        tx,
        organizationId,
        current.paidById,
        current.expenseFor,
        current.tenderId,
        current.workId,
        current.items,
      );
      await tx.workIou.update({
        where: { id },
        data: { status: "SUBMITTED", submittedAt: new Date(), submittedById: userId },
      });
      await this.audit.record(
        {
          organizationId,
          userId,
          action: "submit",
          entityType: "WorkIou",
          entityId: id,
          referenceNo: old.iouNo,
          oldValue: { status: old.status, version: old.version },
          newValue: { status: "SUBMITTED", version: dto.expectedVersion + 1 },
        },
        tx,
      );
    });
    return this.findOne(organizationId, id);
  }

  async cancel(organizationId: string, userId: string, id: string, dto: CancelWorkIouDto) {
    const old = await this.record(organizationId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.cas(tx, organizationId, id, dto.expectedVersion, [
        WorkIouStatus.DRAFT,
        WorkIouStatus.SUBMITTED,
      ]);
      await tx.workIou.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: userId,
          cancellationReason: dto.cancellationReason.trim(),
        },
      });
      await this.audit.record(
        {
          organizationId,
          userId,
          action: "cancel",
          entityType: "WorkIou",
          entityId: id,
          referenceNo: old.iouNo,
          oldValue: { status: old.status, version: old.version },
          newValue: { status: "CANCELLED", reason: dto.cancellationReason.trim() },
        },
        tx,
      );
    });
    return this.findOne(organizationId, id);
  }

  async addAttachments(
    organizationId: string,
    userId: string,
    id: string,
    dto: VersionedWorkIouActionDto,
    files: UploadedWorkIouFile[],
  ) {
    assertWorkIouFiles(files);
    const old = await this.record(organizationId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.cas(tx, organizationId, id, dto.expectedVersion, [WorkIouStatus.DRAFT]);
      const existingCount = await tx.workIouAttachment.count({
        where: { organizationId, workIouId: id },
      });
      if (existingCount + files.length > 10) {
        throw new BadRequestException("A Work IOU can have at most 10 attachments");
      }
      await tx.workIouAttachment.createMany({
        data: files.map((file) => ({
          organizationId,
          workIouId: id,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          data: Uint8Array.from(file.buffer),
          uploadedById: userId,
        })),
      });
      await this.audit.record(
        {
          organizationId,
          userId,
          action: "attach",
          entityType: "WorkIou",
          entityId: id,
          referenceNo: old.iouNo,
          newValue: { files: files.map((file) => file.originalname) },
        },
        tx,
      );
    });
    return this.findOne(organizationId, id);
  }

  async removeAttachment(
    organizationId: string,
    userId: string,
    id: string,
    attachmentId: string,
    dto: VersionedWorkIouActionDto,
  ) {
    const old = await this.record(organizationId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.cas(tx, organizationId, id, dto.expectedVersion, [WorkIouStatus.DRAFT]);
      const attachment = await tx.workIouAttachment.findFirst({
        where: { id: attachmentId, organizationId, workIouId: id },
        select: { id: true, fileName: true },
      });
      if (!attachment) throw new NotFoundException("Work IOU attachment not found");
      await tx.workIouAttachment.delete({ where: { id: attachment.id } });
      await this.audit.record(
        {
          organizationId,
          userId,
          action: "delete_attachment",
          entityType: "WorkIou",
          entityId: id,
          referenceNo: old.iouNo,
          oldValue: { attachmentId: attachment.id, fileName: attachment.fileName },
        },
        tx,
      );
    });
    return this.findOne(organizationId, id);
  }

  async attachmentForDownload(organizationId: string, id: string, attachmentId: string) {
    const attachment = await this.prisma.workIouAttachment.findFirst({
      where: { id: attachmentId, organizationId, workIouId: id },
      select: { fileName: true, mimeType: true, fileSize: true, data: true },
    });
    if (!attachment) throw new NotFoundException("Work IOU attachment not found");
    return {
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      buffer: Buffer.from(attachment.data),
    };
  }
}
