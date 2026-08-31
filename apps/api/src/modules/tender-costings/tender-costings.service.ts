import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TenderCostingStatus } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  QueryTenderCostingDto,
  SaveTenderCostingDto,
  SetTenderCostingBudgetDto,
} from "./dto/tender-costing.dto";
import { calculateTenderCostingTotals } from "./tender-costing-calculations";

const listInclude = {
  tender: {
    include: {
      organizationMaster: { select: { id: true, shortName: true, fullName: true } },
    },
  },
  preparedBy: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  approvedForCostingBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TenderCostingInclude;

const detailInclude = {
  ...listInclude,
  items: { orderBy: { sortOrder: "asc" as const } },
  paymentTerm: { select: { id: true, name: true, days: true } },
} satisfies Prisma.TenderCostingInclude;

type ListRecord = Prisma.TenderCostingGetPayload<{ include: typeof listInclude }>;
type DetailRecord = Prisma.TenderCostingGetPayload<{ include: typeof detailInclude }>;

function decimal(value: Prisma.Decimal) {
  return value.toFixed(2);
}

function toListDto(record: ListRecord) {
  return {
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    status: record.status,
    costingDate: record.costingDate.toISOString(),
    source: record.source,
    currency: record.currency,
    exchangeRate: record.exchangeRate.toFixed(6),
    costingVersion: record.costingVersion,
    remarks: record.remarks,
    preparedByUserId: record.preparedByUserId,
    preparedByName: record.preparedBy?.name ?? record.preparedByName,
    costingBudget: record.costingBudget ? decimal(record.costingBudget) : null,
    estimatedValue: decimal(record.estimatedValue),
    estimatedCost: decimal(record.estimatedCost),
    ourCost: decimal(record.ourCost),
    marginPercent: record.marginPercent.toFixed(4),
    freightCost: decimal(record.freightCost),
    installationCost: decimal(record.installationCost),
    otherCost: decimal(record.otherCost),
    contingencyPercent: record.contingencyPercent.toFixed(4),
    contingencyAmount: decimal(record.contingencyAmount),
    validityDays: record.validityDays,
    paymentTermId: record.paymentTermId,
    deliveryTime: record.deliveryTime,
    warranty: record.warranty,
    assignedToUserId: record.assignedToUserId,
    assignedToName: record.assignedTo?.name ?? record.assignedToName,
    approvedForCostingById: record.approvedForCostingById,
    tender: {
      id: record.tender.id,
      egpTenderId: record.tender.egpTenderId,
      workName: record.tender.workName,
      category: record.tender.category,
      contractValue: record.tender.contractValue.toFixed(2),
      organizationMaster: record.tender.organizationMaster,
    },
    preparedBy: record.preparedBy,
    assignedTo: record.assignedTo,
    approvedForCostingAt: record.approvedForCostingAt.toISOString(),
    approvedForCostingBy: record.approvedForCostingBy,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toDetailDto(record: DetailRecord) {
  return {
    ...toListDto(record),
    items: record.items.map((item) => ({
      id: item.id,
      organizationId: item.organizationId,
      costingId: item.costingId,
      description: item.description,
      secondaryDescription: item.secondaryDescription,
      unit: item.unit,
      quantity: item.quantity.toFixed(3),
      unitCost: decimal(item.unitCost),
      marginPercent: item.marginPercent.toFixed(4),
      totalCost: decimal(item.totalCost),
      ourCost: decimal(item.ourCost),
      remarks: item.remarks,
      sortOrder: item.sortOrder,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    paymentTerm: record.paymentTerm,
  };
}

@Injectable()
export class TenderCostingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(
    organizationId: string,
    query: QueryTenderCostingDto,
  ): Promise<{ items: ReturnType<typeof toListDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.TenderCostingWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
      ...(query.organizationMasterId
        ? { tender: { organizationMasterId: query.organizationMasterId } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { tender: { egpTenderId: { contains: query.search, mode: "insensitive" } } },
              { tender: { workName: { contains: query.search, mode: "insensitive" } } },
              { tender: { organizationMaster: { shortName: { contains: query.search, mode: "insensitive" } } } },
              { preparedByName: { contains: query.search, mode: "insensitive" } },
              { assignedToName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.fromDate || query.toDate
        ? {
            costingDate: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.tenderCosting.findMany({
        where,
        include: listInclude,
        orderBy: [{ approvedForCostingAt: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.tenderCosting.count({ where }),
    ]);

    return { items: records.map(toListDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string) {
    const [total, ready, inProgress, completed, cancelled, values] = await Promise.all([
      this.prisma.tenderCosting.count({ where: { organizationId } }),
      this.prisma.tenderCosting.count({ where: { organizationId, status: "READY" } }),
      this.prisma.tenderCosting.count({ where: { organizationId, status: "IN_PROGRESS" } }),
      this.prisma.tenderCosting.count({ where: { organizationId, status: "COMPLETED" } }),
      this.prisma.tenderCosting.count({ where: { organizationId, status: "CANCELLED" } }),
      this.prisma.tenderCosting.aggregate({
        where: { organizationId, status: { not: "CANCELLED" } },
        _sum: { costingBudget: true, estimatedValue: true, estimatedCost: true, ourCost: true },
      }),
    ]);
    return {
      total,
      ready,
      inProgress,
      completed,
      cancelled,
      totalEstimatedValue: values._sum.estimatedValue?.toFixed(2) ?? "0.00",
      totalCostingBudget: values._sum.costingBudget?.toFixed(2) ?? "0.00",
      totalEstimatedCost: values._sum.estimatedCost?.toFixed(2) ?? "0.00",
      totalOurCost: values._sum.ourCost?.toFixed(2) ?? "0.00",
    };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.tenderCosting.findFirst({
      where: { id, organizationId },
      include: detailInclude,
    });
    if (!record) throw new NotFoundException("Tender costing not found");
    return toDetailDto(record);
  }

  private async tenantUser(organizationId: string, userId: string | null | undefined) {
    if (!userId) return null;
    const membership = await this.prisma.organizationUser.findFirst({
      where: { organizationId, userId, user: { isActive: true } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!membership) throw new BadRequestException("Selected user is not an active organization member");
    return membership.user;
  }

  async setBudget(
    organizationId: string,
    userId: string,
    id: string,
    dto: SetTenderCostingBudgetDto,
  ) {
    const existing = await this.prisma.tenderCosting.findFirst({
      where: { id, organizationId },
      include: { tender: true },
    });
    if (!existing) throw new NotFoundException("Tender costing not found");
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new BadRequestException(`A ${existing.status.toLowerCase()} costing budget cannot be edited`);
    }

    const costingBudget = new Prisma.Decimal(dto.costingBudget).toDecimalPlaces(2);
    const updated = await this.prisma.tenderCosting.updateMany({
      where: { id, organizationId, version: dto.version },
      data: { costingBudget, version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new ConflictException("Tender costing changed in another session. Reload and try again.");
    }

    const saved = await this.prisma.tenderCosting.findFirstOrThrow({
      where: { id, organizationId },
      include: detailInclude,
    });
    await this.auditLog.record({
      organizationId,
      userId,
      action: "TENDER_COSTING_BUDGET_SET",
      entityType: "TenderCosting",
      entityId: id,
      referenceNo: existing.tender.egpTenderId,
      oldValue: {
        costingBudget: existing.costingBudget?.toFixed(2) ?? null,
        version: existing.version,
      },
      newValue: { costingBudget: costingBudget.toFixed(2), version: saved.version },
    });
    return toDetailDto(saved);
  }

  async save(organizationId: string, userId: string, id: string, dto: SaveTenderCostingDto) {
    const existing = await this.prisma.tenderCosting.findFirst({
      where: { id, organizationId },
      include: { tender: true },
    });
    if (!existing) throw new NotFoundException("Tender costing not found");
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new BadRequestException(`A ${existing.status.toLowerCase()} costing cannot be edited`);
    }
    if (!existing.costingBudget || existing.costingBudget.lte(0)) {
      throw new BadRequestException(
        "Enter and save the Tender Costing Budget before preparing the costing",
      );
    }
    if (
      dto.status !== TenderCostingStatus.READY &&
      dto.status !== TenderCostingStatus.IN_PROGRESS &&
      dto.status !== TenderCostingStatus.COMPLETED
    ) {
      throw new BadRequestException("Costing can only be saved as Ready, In Progress, or Completed");
    }
    if (dto.status !== TenderCostingStatus.READY && dto.items.length === 0) {
      throw new BadRequestException("At least one costing item is required before submission");
    }

    const [preparedBy, assignedTo] = await Promise.all([
      this.tenantUser(organizationId, dto.preparedByUserId),
      this.tenantUser(organizationId, dto.assignedToUserId),
    ]);
    if (dto.paymentTermId) {
      const paymentTerm = await this.prisma.paymentTerm.findFirst({
        where: { id: dto.paymentTermId, organizationId, isActive: true },
        select: { id: true },
      });
      if (!paymentTerm) throw new BadRequestException("Selected payment term is unavailable");
    }

    const totals = calculateTenderCostingTotals(dto);
    const saved = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenderCosting.updateMany({
        where: { id, organizationId, version: dto.version },
        data: {
          status: dto.status,
          costingDate: new Date(dto.costingDate),
          source: dto.source?.trim() || null,
          currency: dto.currency.trim().toUpperCase(),
          exchangeRate: new Prisma.Decimal(dto.exchangeRate),
          costingVersion: dto.costingVersion,
          remarks: dto.remarks?.trim() || null,
          preparedByUserId: preparedBy?.id ?? null,
          preparedByName: preparedBy?.name ?? dto.preparedByName?.trim() ?? null,
          estimatedValue: existing.tender.contractValue,
          estimatedCost: totals.estimatedCost,
          ourCost: totals.ourCost,
          marginPercent: totals.marginPercent,
          freightCost: totals.freightCost,
          installationCost: totals.installationCost,
          otherCost: totals.otherCost,
          contingencyPercent: totals.contingencyPercent,
          contingencyAmount: totals.contingencyAmount,
          validityDays: dto.validityDays ?? null,
          paymentTermId: dto.paymentTermId || null,
          deliveryTime: dto.deliveryTime?.trim() || null,
          warranty: dto.warranty?.trim() || null,
          assignedToUserId: assignedTo?.id ?? null,
          assignedToName: assignedTo?.name ?? dto.assignedToName?.trim() ?? null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException("Tender costing changed in another session. Reload and try again.");
      }

      await tx.tenderCostingItem.deleteMany({ where: { organizationId, costingId: id } });
      if (dto.items.length > 0) {
        await tx.tenderCostingItem.createMany({
          data: dto.items.map((item, index) => {
            const calculated = totals.calculatedItems[index]!;
            return {
              organizationId,
              costingId: id,
              description: item.description.trim(),
              secondaryDescription: item.secondaryDescription?.trim() || null,
              unit: item.unit.trim(),
              quantity: calculated.quantity,
              unitCost: calculated.unitCost,
              marginPercent: calculated.marginPercent,
              totalCost: calculated.totalCost,
              ourCost: calculated.ourCost,
              remarks: item.remarks?.trim() || null,
              sortOrder: item.sortOrder ?? index,
            };
          }),
        });
      }

      return tx.tenderCosting.findFirstOrThrow({
        where: { id, organizationId },
        include: detailInclude,
      });
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action:
        dto.status === TenderCostingStatus.COMPLETED
          ? "TENDER_COSTING_COMPLETED"
          : dto.status === TenderCostingStatus.IN_PROGRESS
            ? "TENDER_COSTING_SUBMITTED"
            : "TENDER_COSTING_SAVED",
      entityType: "TenderCosting",
      entityId: id,
      referenceNo: existing.tender.egpTenderId,
      oldValue: { status: existing.status, version: existing.version },
      newValue: {
        status: saved.status,
        version: saved.version,
        estimatedCost: saved.estimatedCost.toFixed(2),
        ourCost: saved.ourCost.toFixed(2),
      },
    });

    return toDetailDto(saved);
  }
}
