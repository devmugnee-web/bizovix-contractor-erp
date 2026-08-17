import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CreateBoqItemDto } from "./dto/create-boq-item.dto";
import { UpdateBoqItemDto } from "./dto/update-boq-item.dto";

const includeRelations = {
  section: { select: { id: true, name: true } },
} satisfies Prisma.BoqItemInclude;

type BoqItemRecord = Prisma.BoqItemGetPayload<{ include: typeof includeRelations }>;

function toDto(record: BoqItemRecord) {
  const remainingQty = record.contractQty.minus(record.executedQty);
  const remainingValue = record.contractAmount.minus(record.executedValue);
  const progressPct = record.contractAmount.gt(0)
    ? record.executedValue.div(record.contractAmount).mul(100).toFixed(2)
    : "0.00";
  return {
    ...record,
    contractQty: record.contractQty.toFixed(3),
    unitRate: record.unitRate.toFixed(2),
    contractAmount: record.contractAmount.toFixed(2),
    executedQty: record.executedQty.toFixed(3),
    executedValue: record.executedValue.toFixed(2),
    remainingQty: remainingQty.toFixed(3),
    remainingValue: remainingValue.toFixed(2),
    progressPct,
  };
}

const VALUE_DIFF_TOLERANCE = 0.01;

@Injectable()
export class BoqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async assertWork(organizationId: string, cmsWorkId: string) {
    const work = await this.prisma.cmsWork.findFirst({ where: { id: cmsWorkId, organizationId } });
    if (!work) throw new NotFoundException("Project / Work not found");
    return work;
  }

  private async resolveSection(organizationId: string, cmsWorkId: string, name: string) {
    return this.prisma.boqSection.upsert({
      where: { cmsWorkId_name: { cmsWorkId, name } },
      update: {},
      create: { organizationId, cmsWorkId, name },
    });
  }

  async list(organizationId: string, cmsWorkId: string) {
    await this.assertWork(organizationId, cmsWorkId);
    const items = await this.prisma.boqItem.findMany({
      where: { organizationId, cmsWorkId },
      include: includeRelations,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return items.map(toDto);
  }

  async summary(organizationId: string, cmsWorkId: string) {
    const work = await this.assertWork(organizationId, cmsWorkId);
    const [items, contract] = await Promise.all([
      this.prisma.boqItem.findMany({ where: { organizationId, cmsWorkId } }),
      this.prisma.projectContract.findFirst({
        where: { organizationId, cmsWorkId, status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
        select: { currentContractValue: true },
      }),
    ]);

    const contractValue = contract?.currentContractValue ?? work.contractValue;
    const totalBoqValue = items.reduce((sum, item) => sum.add(item.contractAmount), new Prisma.Decimal(0));
    const executedValue = items.reduce((sum, item) => sum.add(item.executedValue), new Prisma.Decimal(0));
    const remainingValue = totalBoqValue.minus(executedValue);
    const overallProgressPct = totalBoqValue.gt(0) ? executedValue.div(totalBoqValue).mul(100).toFixed(2) : "0.00";
    const diff = contractValue.minus(totalBoqValue);

    return {
      totalItems: items.length,
      totalBoqValue: totalBoqValue.toFixed(2),
      executedValue: executedValue.toFixed(2),
      remainingValue: remainingValue.toFixed(2),
      overallProgressPct,
      contractValue: contractValue.toFixed(2),
      differenceFromContract: diff.toFixed(2),
      hasDifferenceWarning: diff.abs().gt(VALUE_DIFF_TOLERANCE),
    };
  }

  async create(organizationId: string, userId: string, cmsWorkId: string, dto: CreateBoqItemDto) {
    await this.assertWork(organizationId, cmsWorkId);
    const section = dto.section ? await this.resolveSection(organizationId, cmsWorkId, dto.section) : null;
    const contractAmount = new Prisma.Decimal(dto.contractQty).mul(dto.unitRate);

    const record = await this.prisma.boqItem.create({
      data: {
        organizationId,
        cmsWorkId,
        sectionId: section?.id,
        itemCode: dto.itemCode,
        description: dto.description,
        unit: dto.unit,
        contractQty: dto.contractQty,
        unitRate: dto.unitRate,
        contractAmount,
        originalQty: dto.contractQty,
        originalRate: dto.unitRate,
        originalAmount: contractAmount,
        specification: dto.specification,
        remarks: dto.remarks,
        createdById: userId,
      },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "BOQ_ITEM_CREATED",
      entityType: "BoqItem",
      entityId: record.id,
      referenceNo: record.itemCode,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async update(organizationId: string, userId: string, cmsWorkId: string, itemId: string, dto: UpdateBoqItemDto) {
    const existing = await this.prisma.boqItem.findFirst({
      where: { id: itemId, organizationId, cmsWorkId },
      include: includeRelations,
    });
    if (!existing) throw new NotFoundException("BOQ item not found");

    const section = dto.section !== undefined && dto.section !== null && dto.section !== ""
      ? await this.resolveSection(organizationId, cmsWorkId, dto.section)
      : undefined;
    const nextQty = dto.contractQty ?? existing.contractQty;
    const nextRate = dto.unitRate ?? existing.unitRate;
    const contractAmount = new Prisma.Decimal(nextQty).mul(nextRate);

    const record = await this.prisma.boqItem.update({
      where: { id: itemId },
      data: {
        ...(section ? { sectionId: section.id } : {}),
        ...(dto.itemCode !== undefined ? { itemCode: dto.itemCode } : {}),
        ...(dto.description ? { description: dto.description } : {}),
        ...(dto.unit ? { unit: dto.unit } : {}),
        ...(dto.contractQty !== undefined ? { contractQty: dto.contractQty } : {}),
        ...(dto.unitRate !== undefined ? { unitRate: dto.unitRate } : {}),
        contractAmount,
        ...(dto.specification !== undefined ? { specification: dto.specification } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
      },
      include: includeRelations,
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "BOQ_ITEM_UPDATED",
      entityType: "BoqItem",
      entityId: itemId,
      referenceNo: record.itemCode,
      oldValue: toDto(existing),
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async remove(organizationId: string, userId: string, cmsWorkId: string, itemId: string) {
    const existing = await this.prisma.boqItem.findFirst({ where: { id: itemId, organizationId, cmsWorkId } });
    if (!existing) throw new NotFoundException("BOQ item not found");

    await this.prisma.boqItem.delete({ where: { id: itemId } });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "BOQ_ITEM_DELETED",
      entityType: "BoqItem",
      entityId: itemId,
      referenceNo: existing.itemCode,
      oldValue: { description: existing.description, contractAmount: existing.contractAmount.toFixed(2) },
    });

    return { success: true };
  }
}
