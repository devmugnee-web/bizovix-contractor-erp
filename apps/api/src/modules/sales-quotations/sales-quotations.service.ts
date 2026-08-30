import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SalesQuotationStatus } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import {
  CreateSalesQuotationDto,
  CreateSalesQuotationFollowUpDto,
  QuerySalesQuotationDto,
  RecordSalesQuotationResultDto,
  SalesQuotationResultDto,
  SaveSalesQuotationCostingDto,
  UpdateSalesQuotationDto,
  VersionedSalesQuotationActionDto,
} from "./dto/sales-quotation.dto";
import { calculateSalesQuotationCosting } from "./sales-quotation-calculation";
import {
  neutralizeCsvCell,
  validateCalculatedCosting,
  validateCostingInput,
} from "./sales-quotation-validation";

const detailInclude = {
  customer: { select: { id: true, shortName: true, fullName: true } },
  salesPerson: { select: { id: true, name: true } },
  decisionBy: { select: { id: true, name: true } },
  items: { orderBy: { sortOrder: "asc" as const } },
  overheads: { orderBy: { sortOrder: "asc" as const } },
  followUps: {
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { followedUpAt: "desc" as const },
  },
  statusHistory: {
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { changedAt: "desc" as const },
  },
} satisfies Prisma.SalesQuotationInclude;
const listInclude = {
  customer: detailInclude.customer,
  salesPerson: detailInclude.salesPerson,
  decisionBy: detailInclude.decisionBy,
} satisfies Prisma.SalesQuotationInclude;
type DetailRecord = Prisma.SalesQuotationGetPayload<{ include: typeof detailInclude }>;
type ListRecord = Prisma.SalesQuotationGetPayload<{ include: typeof listInclude }>;

const iso = (value: Date | null) => value?.toISOString() ?? null;
const decimal = (value: Prisma.Decimal | null) => value?.toFixed(2) ?? null;
function listDto(row: ListRecord) {
  return {
    ...row,
    customer: {
      id: row.customer.id,
      name: row.customer.fullName,
      shortName: row.customer.shortName,
    },
    quotationDate: row.quotationDate.toISOString(),
    validUntil: row.validUntil.toISOString(),
    totalCost: decimal(row.totalCost)!,
    itemTaxTotal: decimal(row.itemTaxTotal)!,
    totalSelling: decimal(row.totalSelling)!,
    overheadTotal: decimal(row.overheadTotal)!,
    subtotalBeforeVat: decimal(row.subtotalBeforeVat)!,
    vatRate: decimal(row.vatRate)!,
    vatAmount: decimal(row.vatAmount)!,
    grandTotal: decimal(row.grandTotal)!,
    acceptedAmount: decimal(row.acceptedAmount),
    sentAt: iso(row.sentAt),
    decisionDate: iso(row.decisionDate),
    lastFollowUpAt: iso(row.lastFollowUpAt),
    nextFollowUpAt: iso(row.nextFollowUpAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    decision: row.status === "ACCEPTED" || row.status === "REJECTED" ? row.status : "PENDING",
  };
}
function detailDto(row: DetailRecord) {
  return {
    ...listDto(row),
    items: row.items.map((item) => ({
      ...item,
      quantity: item.quantity.toFixed(3),
      unitCost: decimal(item.unitCost)!,
      totalCost: decimal(item.totalCost)!,
      taxPct: decimal(item.taxPct)!,
      taxAmount: decimal(item.taxAmount)!,
      unitPrice: decimal(item.unitPrice)!,
      totalPrice: decimal(item.totalPrice)!,
      profit: decimal(item.profit)!,
      marginPct: item.marginPct.toFixed(4),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    overheads: row.overheads.map((item) => ({
      ...item,
      amount: decimal(item.amount)!,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    followUps: row.followUps.map((item) => ({
      ...item,
      followedUpAt: item.followedUpAt.toISOString(),
      nextFollowUpAt: iso(item.nextFollowUpAt),
      createdAt: item.createdAt.toISOString(),
    })),
    statusHistory: row.statusHistory.map((item) => ({
      ...item,
      changedAt: item.changedAt.toISOString(),
    })),
  };
}

@Injectable()
export class SalesQuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
  ) {}

  private where(org: string, query: QuerySalesQuotationDto): Prisma.SalesQuotationWhereInput {
    if (query.status && query.decision)
      throw new BadRequestException("Status and decision filters cannot be combined");
    const workName = query.workName ?? query.projectName;
    return {
      organizationId: org,
      ...(query.status ? { status: query.status } : {}),
      ...(query.decision === "PENDING"
        ? { status: { in: ["DRAFT", "SENT"] } }
        : query.decision
          ? { status: query.decision }
          : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.salesPersonId ? { salesPersonId: query.salesPersonId } : {}),
      ...(workName ? { workName } : {}),
      ...(query.fromDate || query.toDate
        ? {
            quotationDate: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { quotationNo: { contains: query.search, mode: "insensitive" } },
              { workName: { contains: query.search, mode: "insensitive" } },
              {
                customer: {
                  OR: [
                    { shortName: { contains: query.search, mode: "insensitive" } },
                    { fullName: { contains: query.search, mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : {}),
    };
  }

  private async customer(
    org: string,
    id: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const row = await client.organizationMaster.findFirst({ where: { id, organizationId: org } });
    if (!row) throw new NotFoundException("Customer organization not found");
  }
  private async salesperson(
    org: string,
    id?: string | null,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!id) return;
    const row = await client.organizationUser.findFirst({
      where: { organizationId: org, userId: id, user: { isActive: true } },
    });
    if (!row) throw new NotFoundException("Active salesperson not found in this organization");
  }
  private dates(quotationDate: string, validUntil: string) {
    if (new Date(validUntil) < new Date(quotationDate))
      throw new BadRequestException("Valid until must not be before quotation date");
  }
  private async record(org: string, id: string) {
    const row = await this.prisma.salesQuotation.findFirst({
      where: { id, organizationId: org },
      include: detailInclude,
    });
    if (!row) throw new NotFoundException("Sales quotation not found");
    return row;
  }
  private async cas(
    tx: Prisma.TransactionClient,
    org: string,
    id: string,
    expectedVersion: number,
    statuses: SalesQuotationStatus[],
  ) {
    const changed = await tx.salesQuotation.updateMany({
      where: { id, organizationId: org, version: expectedVersion, status: { in: statuses } },
      data: { version: { increment: 1 } },
    });
    if (!changed.count)
      throw new ConflictException("Sales quotation changed or is no longer in an editable state");
  }

  async findAll(org: string, query: QuerySalesQuotationDto) {
    const page = query.page ?? 1,
      limit = query.limit ?? 20,
      where = this.where(org, query);
    const [rows, total] = await Promise.all([
      this.prisma.salesQuotation.findMany({
        where,
        include: listInclude,
        orderBy: { quotationDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.salesQuotation.count({ where }),
    ]);
    return { items: rows.map(listDto), meta: buildPaginationMeta(total, page, limit) };
  }
  async findOne(org: string, id: string) {
    return detailDto(await this.record(org, id));
  }
  async options(org: string) {
    const [customers, memberships, works] = await Promise.all([
      this.prisma.organizationMaster.findMany({
        where: { organizationId: org },
        select: { id: true, shortName: true, fullName: true },
        orderBy: { shortName: "asc" },
      }),
      this.prisma.organizationUser.findMany({
        where: { organizationId: org, user: { isActive: true } },
        select: { user: { select: { id: true, name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      this.prisma.salesQuotation.findMany({
        where: { organizationId: org },
        distinct: ["workName"],
        select: { workName: true },
        orderBy: { workName: "asc" },
      }),
    ]);
    const workNames = works.map((row) => row.workName);
    return {
      customers: customers.map((row) => ({
        id: row.id,
        name: row.fullName,
        shortName: row.shortName,
      })),
      salesPeople: memberships.map((row) => row.user),
      workNames,
      projectNames: workNames,
    };
  }
  async summary(org: string, query: QuerySalesQuotationDto) {
    const rows = await this.prisma.salesQuotation.findMany({
      where: this.where(org, query),
      select: { status: true, grandTotal: true, acceptedAmount: true },
    });
    const sum = (values: Prisma.Decimal[]) =>
      values.reduce((a, b) => a.add(b), new Prisma.Decimal(0)).toFixed(2);
    return {
      total: rows.length,
      draft: rows.filter((r) => r.status === "DRAFT").length,
      sent: rows.filter((r) => r.status === "SENT").length,
      accepted: rows.filter((r) => r.status === "ACCEPTED").length,
      rejected: rows.filter((r) => r.status === "REJECTED").length,
      pending: rows.filter((r) => r.status === "DRAFT" || r.status === "SENT").length,
      totalQuotationValue: sum(rows.map((r) => r.grandTotal)),
      acceptedValue: sum(
        rows.filter((r) => r.status === "ACCEPTED").map((r) => r.acceptedAmount ?? r.grandTotal),
      ),
      rejectedValue: sum(rows.filter((r) => r.status === "REJECTED").map((r) => r.grandTotal)),
    };
  }
  async recent(org: string, query: QuerySalesQuotationDto) {
    const rows = await this.prisma.salesQuotation.findMany({
      where: this.where(org, query),
      include: listInclude,
      orderBy: { updatedAt: "desc" },
      take: Math.min(query.limit ?? 10, 50),
    });
    return rows.map((row) => ({
      ...listDto(row),
      activityAt: row.updatedAt.toISOString(),
    }));
  }

  async costingSummary(org: string, query: QuerySalesQuotationDto) {
    const quotationWhere = this.where(org, query);
    const where: Prisma.SalesQuotationItemWhereInput = {
      organizationId: org,
      quotation: { is: quotationWhere },
    };
    const limit = Math.min(query.limit ?? 5, 50);
    const [groups, totals] = await Promise.all([
      this.prisma.salesQuotationItem.groupBy({
        by: ["description", "unit"],
        where,
        _sum: { quantity: true, totalCost: true, totalPrice: true, profit: true },
        orderBy: { _sum: { totalPrice: "desc" } },
        take: limit,
      }),
      this.prisma.salesQuotationItem.aggregate({
        where,
        _sum: { totalCost: true, totalPrice: true, profit: true },
      }),
    ]);
    const zero = new Prisma.Decimal(0);
    return {
      items: groups.map((group) => {
        const quantity = group._sum.quantity ?? zero;
        const totalCost = group._sum.totalCost ?? zero;
        const totalSelling = group._sum.totalPrice ?? zero;
        const profit = group._sum.profit ?? zero;
        return {
          description: group.description,
          unit: group.unit,
          quantity: quantity.toFixed(3),
          weightedUnitCost: quantity.isZero() ? "0.00" : totalCost.div(quantity).toFixed(2),
          weightedUnitPrice: quantity.isZero() ? "0.00" : totalSelling.div(quantity).toFixed(2),
          marginPct: totalSelling.isZero() ? "0.0000" : profit.div(totalSelling).mul(100).toFixed(4),
          totalCost: totalCost.toFixed(2),
          totalSelling: totalSelling.toFixed(2),
          profit: profit.toFixed(2),
        };
      }),
      totalCost: (totals._sum.totalCost ?? zero).toFixed(2),
      totalSelling: (totals._sum.totalPrice ?? zero).toFixed(2),
      profit: (totals._sum.profit ?? zero).toFixed(2),
    };
  }

  async recentDecisions(org: string, query: QuerySalesQuotationDto) {
    if (query.status || query.decision) {
      throw new BadRequestException("Recent decisions does not accept status or decision filters");
    }
    const rows = await this.prisma.salesQuotation.findMany({
      where: { ...this.where(org, query), status: { in: ["ACCEPTED", "REJECTED"] } },
      include: listInclude,
      orderBy: [{ decisionDate: "desc" }, { updatedAt: "desc" }],
      take: Math.min(query.limit ?? 5, 20),
    });
    return rows.map(listDto);
  }

  async create(org: string, userId: string, dto: CreateSalesQuotationDto) {
    this.dates(dto.quotationDate, dto.validUntil);
    const id = await this.prisma.$transaction(async (tx) => {
      await Promise.all([
        this.customer(org, dto.customerId, tx),
        this.salesperson(org, dto.salesPersonId, tx),
      ]);
      const quotationNo = await this.numbering.next(org, "SALES_QUOTATION", tx);
      const row = await tx.salesQuotation.create({
        data: {
          organizationId: org,
          quotationNo,
          customerId: dto.customerId,
          workName: dto.workName,
          quotationDate: new Date(dto.quotationDate),
          validUntil: new Date(dto.validUntil),
          currency: dto.currency?.toUpperCase() ?? "BDT",
          salesPersonId: dto.salesPersonId,
          remarks: dto.remarks,
          createdById: userId,
        },
      });
      await tx.salesQuotationStatusHistory.create({
        data: { organizationId: org, quotationId: row.id, toStatus: "DRAFT", changedById: userId },
      });
      await this.audit.record(
        {
          organizationId: org,
          userId,
          action: "create",
          entityType: "SalesQuotation",
          entityId: row.id,
          referenceNo: quotationNo,
          newValue: dto,
        },
        tx,
      );
      return row.id;
    });
    return this.findOne(org, id);
  }
  async update(org: string, userId: string, id: string, dto: UpdateSalesQuotationDto) {
    const old = await this.record(org, id);
    const quotationDate = dto.quotationDate ?? old.quotationDate.toISOString();
    const validUntil = dto.validUntil ?? old.validUntil.toISOString();
    this.dates(quotationDate, validUntil);

    await this.prisma.$transaction(async (tx) => {
      await Promise.all([
        dto.customerId ? this.customer(org, dto.customerId, tx) : undefined,
        this.salesperson(org, dto.salesPersonId, tx),
      ]);
      await this.cas(tx, org, id, dto.expectedVersion, [SalesQuotationStatus.DRAFT]);
      await tx.salesQuotation.update({
        where: { id },
        data: {
          ...(dto.customerId !== undefined ? { customerId: dto.customerId } : {}),
          ...(dto.workName !== undefined ? { workName: dto.workName } : {}),
          ...(dto.quotationDate !== undefined
            ? { quotationDate: new Date(dto.quotationDate) }
            : {}),
          ...(dto.validUntil !== undefined ? { validUntil: new Date(dto.validUntil) } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency.toUpperCase() } : {}),
          ...(dto.salesPersonId !== undefined ? { salesPersonId: dto.salesPersonId } : {}),
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
        },
      });
      await this.audit.record(
        {
          organizationId: org,
          userId,
          action: "update",
          entityType: "SalesQuotation",
          entityId: id,
          referenceNo: old.quotationNo,
          newValue: dto,
        },
        tx,
      );
    });
    return this.findOne(org, id);
  }
  async saveCosting(org: string, userId: string, id: string, dto: SaveSalesQuotationCostingDto) {
    let result: ReturnType<typeof calculateSalesQuotationCosting>;
    try {
      validateCostingInput(dto);
      result = calculateSalesQuotationCosting(dto);
      validateCalculatedCosting(result);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid costing values",
      );
    }
    const old = await this.record(org, id);
    await this.prisma.$transaction(async (tx) => {
      await this.cas(tx, org, id, dto.expectedVersion, [SalesQuotationStatus.DRAFT]);
      await tx.salesQuotationItem.deleteMany({ where: { organizationId: org, quotationId: id } });
      await tx.salesQuotationOverhead.deleteMany({
        where: { organizationId: org, quotationId: id },
      });
      if (result.items.length)
        await tx.salesQuotationItem.createMany({
          data: result.items.map((i) => ({
            organizationId: org,
            quotationId: id,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unitCost: i.unitCost,
            totalCost: i.totalCost,
            taxPct: i.taxPct,
            taxAmount: i.taxAmount,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
            profit: i.profit,
            marginPct: i.marginPct,
            sortOrder: i.sortOrder,
          })),
        });
      if (result.overheads.length)
        await tx.salesQuotationOverhead.createMany({
          data: result.overheads.map((o) => ({
            organizationId: org,
            quotationId: id,
            description: o.description,
            amount: o.amount,
            sortOrder: o.sortOrder,
          })),
        });
      await tx.salesQuotation.update({
        where: { id },
        data: {
          totalCost: result.totalCost,
          itemTaxTotal: result.itemTaxTotal,
          totalSelling: result.totalSelling,
          overheadTotal: result.overheadTotal,
          subtotalBeforeVat: result.subtotalBeforeVat,
          vatApplicable: result.vatApplicable,
          vatRate: result.vatRate,
          vatAmount: result.vatAmount,
          grandTotal: result.grandTotal,
        },
      });
      await this.audit.record(
        {
          organizationId: org,
          userId,
          action: "save_costing",
          entityType: "SalesQuotation",
          entityId: id,
          referenceNo: old.quotationNo,
        },
        tx,
      );
    });
    return this.findOne(org, id);
  }
  async send(org: string, userId: string, id: string, dto: VersionedSalesQuotationActionDto) {
    const old = await this.record(org, id);
    this.dates(old.quotationDate.toISOString(), old.validUntil.toISOString());
    if (old.validUntil.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10))
      throw new BadRequestException("Expired sales quotation cannot be sent");
    if (!old.items.length)
      throw new BadRequestException("At least one costing item is required before sending");
    if (!old.grandTotal.gt(0))
      throw new BadRequestException(
        "Quotation grand total must be greater than zero before sending",
      );
    await this.prisma.$transaction(async (tx) => {
      await this.cas(tx, org, id, dto.expectedVersion, [SalesQuotationStatus.DRAFT]);
      await tx.salesQuotation.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date(), sentById: userId },
      });
      await tx.salesQuotationStatusHistory.create({
        data: {
          organizationId: org,
          quotationId: id,
          fromStatus: "DRAFT",
          toStatus: "SENT",
          changedById: userId,
        },
      });
      await this.audit.record(
        {
          organizationId: org,
          userId,
          action: "send",
          entityType: "SalesQuotation",
          entityId: id,
          referenceNo: old.quotationNo,
        },
        tx,
      );
    });
    return this.findOne(org, id);
  }
  async result(org: string, userId: string, id: string, dto: RecordSalesQuotationResultDto) {
    const old = await this.record(org, id);
    if (
      old.sentAt &&
      new Date(dto.decisionDate).toISOString().slice(0, 10) < old.sentAt.toISOString().slice(0, 10)
    )
      throw new BadRequestException("Decision date must not be before the quotation was sent");
    let acceptedAmount: Prisma.Decimal | null = null;
    if (dto.decision === SalesQuotationResultDto.ACCEPTED) {
      if (!dto.acceptedAmount) throw new BadRequestException("Accepted amount is required");
      try {
        acceptedAmount = new Prisma.Decimal(dto.acceptedAmount);
      } catch {
        throw new BadRequestException("Accepted amount must be a valid decimal number");
      }
      if (!acceptedAmount.gt(0) || acceptedAmount.gt(old.grandTotal))
        throw new BadRequestException(
          "Accepted amount must be greater than zero and must not exceed quotation grand total",
        );
      if (!dto.customerPoWoNo?.trim())
        throw new BadRequestException("Customer PO/WO number is required for accepted quotations");
    }
    if (dto.decision === SalesQuotationResultDto.REJECTED && !dto.rejectionReason?.trim())
      throw new BadRequestException("Rejection reason is required");
    await this.prisma.$transaction(async (tx) => {
      await this.cas(tx, org, id, dto.expectedVersion, [SalesQuotationStatus.SENT]);
      const status = dto.decision as "ACCEPTED" | "REJECTED";
      await tx.salesQuotation.update({
        where: { id },
        data: {
          status,
          decisionDate: new Date(dto.decisionDate),
          decisionById: userId,
          acceptedAmount: status === "ACCEPTED" ? acceptedAmount : null,
          customerPoWoNo: status === "ACCEPTED" ? dto.customerPoWoNo!.trim() : null,
          rejectionReason: status === "REJECTED" ? dto.rejectionReason!.trim() : null,
        },
      });
      await tx.salesQuotationStatusHistory.create({
        data: {
          organizationId: org,
          quotationId: id,
          fromStatus: "SENT",
          toStatus: status,
          changedById: userId,
          reason: status === "REJECTED" ? dto.rejectionReason!.trim() : null,
        },
      });
      await this.audit.record(
        {
          organizationId: org,
          userId,
          action: status.toLowerCase(),
          entityType: "SalesQuotation",
          entityId: id,
          referenceNo: old.quotationNo,
          newValue: dto,
        },
        tx,
      );
    });
    return this.findOne(org, id);
  }
  async followUps(org: string, id: string) {
    return (await this.record(org, id)).followUps.map((row) => ({
      ...row,
      followedUpAt: row.followedUpAt.toISOString(),
      nextFollowUpAt: iso(row.nextFollowUpAt),
      createdAt: row.createdAt.toISOString(),
    }));
  }
  async addFollowUp(org: string, userId: string, id: string, dto: CreateSalesQuotationFollowUpDto) {
    const old = await this.record(org, id);
    if (old.sentAt && new Date(dto.followedUpAt) < old.sentAt)
      throw new BadRequestException("Follow-up time must not be before the quotation was sent");
    if (dto.nextFollowUpAt && new Date(dto.nextFollowUpAt) < new Date(dto.followedUpAt))
      throw new BadRequestException("Next follow-up must not be before followed-up time");
    const created = await this.prisma.$transaction(async (tx) => {
      await this.cas(tx, org, id, dto.expectedVersion, [SalesQuotationStatus.SENT]);
      const row = await tx.salesQuotationFollowUp.create({
        data: {
          organizationId: org,
          quotationId: id,
          followedUpAt: new Date(dto.followedUpAt),
          nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null,
          notes: dto.notes,
          createdById: userId,
        },
        include: { createdBy: { select: { id: true, name: true } } },
      });
      await tx.salesQuotation.update({
        where: { id },
        data: {
          lastFollowUpAt: new Date(dto.followedUpAt),
          nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null,
        },
      });
      await this.audit.record(
        {
          organizationId: org,
          userId,
          action: "add_follow_up",
          entityType: "SalesQuotation",
          entityId: id,
          referenceNo: old.quotationNo,
        },
        tx,
      );
      return row;
    });
    return {
      ...created,
      followedUpAt: created.followedUpAt.toISOString(),
      nextFollowUpAt: iso(created.nextFollowUpAt),
      createdAt: created.createdAt.toISOString(),
    };
  }
  async export(org: string, userId: string, query: QuerySalesQuotationDto) {
    const rows = await this.prisma.salesQuotation.findMany({
      where: this.where(org, query),
      include: listInclude,
      orderBy: { quotationDate: "desc" },
    });
    const quote = (v: unknown) => `"${neutralizeCsvCell(v).replaceAll('"', '""')}"`;
    const content = [
      [
        "Quotation No",
        "Customer",
        "Work Name",
        "Quotation Date",
        "Valid Until",
        "Status",
        "Value (BDT)",
        "Decision Date",
        "Decision By",
        "Accepted Amount",
        "Customer PO/WO No",
        "Rejection Reason",
        "Last Follow-up",
        "Next Follow-up",
      ]
        .map(quote)
        .join(","),
      ...rows.map((r) =>
        [
          r.quotationNo,
          r.customer.fullName,
          r.workName,
          r.quotationDate.toISOString().slice(0, 10),
          r.validUntil.toISOString().slice(0, 10),
          r.status,
          r.grandTotal.toFixed(2),
          iso(r.decisionDate),
          r.decisionBy?.name,
          decimal(r.acceptedAmount),
          r.customerPoWoNo,
          r.rejectionReason,
          iso(r.lastFollowUpAt),
          iso(r.nextFollowUpAt),
        ]
          .map(quote)
          .join(","),
      ),
    ].join("\n");
    await this.audit.record({
      organizationId: org,
      userId,
      action: "export",
      entityType: "SalesQuotation",
    });
    return { filename: `sales-quotations-${new Date().toISOString().slice(0, 10)}.csv`, content };
  }
}
