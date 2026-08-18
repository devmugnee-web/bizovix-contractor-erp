import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { SaveItemDto } from "./dto/save-item.dto";
import { QueryItemDto } from "./dto/query-item.dto";

const includeRelations = {
  category: { select: { id: true, name: true } },
  uom: { select: { id: true, code: true, name: true, symbol: true } },
  preferredVendor: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ItemInclude;

type ItemRecord = Prisma.ItemGetPayload<{ include: typeof includeRelations }>;

function toDto(record: ItemRecord) {
  return { ...record, defaultPurchaseRate: record.defaultPurchaseRate?.toFixed(2) ?? null };
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly numbering: NumberingService,
  ) {}

  private where(organizationId: string, query: QueryItemDto): Prisma.ItemWhereInput {
    return {
      organizationId,
      ...(query.itemType ? { itemType: query.itemType } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.uomId ? { uomId: query.uomId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { itemCode: { contains: query.search, mode: "insensitive" } },
              { itemName: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { brandModel: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }

  async findAll(organizationId: string, query: QueryItemDto): Promise<{ items: ReturnType<typeof toDto>[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.where(organizationId, query);

    const [items, total] = await Promise.all([
      this.prisma.item.findMany({ where, include: includeRelations, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.item.count({ where }),
    ]);

    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string) {
    const [total, materials, services, inactive] = await Promise.all([
      this.prisma.item.count({ where: { organizationId } }),
      this.prisma.item.count({ where: { organizationId, itemType: "MATERIAL" } }),
      this.prisma.item.count({ where: { organizationId, itemType: "SERVICE" } }),
      this.prisma.item.count({ where: { organizationId, status: "INACTIVE" } }),
    ]);
    return { total, materials, services, inactive };
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.item.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!record) throw new NotFoundException("Item not found");
    return toDto(record);
  }

  private async assertReferences(organizationId: string, dto: { categoryId?: string; uomId?: string; preferredVendorId?: string }) {
    if (dto.categoryId) {
      const category = await this.prisma.masterCategory.findFirst({ where: { id: dto.categoryId, organizationId, type: "MATERIAL" } });
      if (!category) throw new NotFoundException("Material category not found");
    }
    if (dto.uomId) {
      const uom = await this.prisma.unitOfMeasurement.findFirst({ where: { id: dto.uomId, organizationId } });
      if (!uom) throw new NotFoundException("Unit of Measurement not found");
    }
    if (dto.preferredVendorId) {
      const vendor = await this.prisma.party.findFirst({ where: { id: dto.preferredVendorId, organizationId } });
      if (!vendor) throw new NotFoundException("Preferred vendor not found");
    }
  }

  async create(organizationId: string, userId: string, dto: SaveItemDto) {
    await this.assertReferences(organizationId, dto);

    let itemCode = dto.itemCode?.trim();
    if (itemCode) {
      const clash = await this.prisma.item.findFirst({ where: { organizationId, itemCode } });
      if (clash) throw new BadRequestException(`Item code "${itemCode}" is already in use`);
    } else {
      itemCode = await this.numbering.next(organizationId, "ITEM");
    }

    const record = await this.prisma.item.create({
      data: {
        organizationId,
        itemCode,
        itemName: dto.itemName,
        description: dto.description,
        itemType: dto.itemType ?? "MATERIAL",
        categoryId: dto.categoryId,
        uomId: dto.uomId,
        defaultPurchaseRate: dto.defaultPurchaseRate,
        preferredVendorId: dto.preferredVendorId,
        specification: dto.specification,
        brandModel: dto.brandModel,
        status: dto.status ?? "ACTIVE",
        createdById: userId,
      },
      include: includeRelations,
    });

    await this.auditLogService.record({ organizationId, userId, action: "ITEM_CREATED", entityType: "Item", entityId: record.id, referenceNo: record.itemCode, newValue: toDto(record) });
    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: SaveItemDto) {
    const existing = await this.prisma.item.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!existing) throw new NotFoundException("Item not found");
    await this.assertReferences(organizationId, dto);

    const record = await this.prisma.item.update({
      where: { id, organizationId },
      data: {
        ...(dto.itemName !== undefined ? { itemName: dto.itemName } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.itemType !== undefined ? { itemType: dto.itemType } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.uomId !== undefined ? { uomId: dto.uomId } : {}),
        ...(dto.defaultPurchaseRate !== undefined ? { defaultPurchaseRate: dto.defaultPurchaseRate } : {}),
        ...(dto.preferredVendorId !== undefined ? { preferredVendorId: dto.preferredVendorId } : {}),
        ...(dto.specification !== undefined ? { specification: dto.specification } : {}),
        ...(dto.brandModel !== undefined ? { brandModel: dto.brandModel } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: includeRelations,
    });

    const action = dto.status && dto.status !== existing.status && dto.status === "INACTIVE" ? "ITEM_ARCHIVED" : "ITEM_UPDATED";
    await this.auditLogService.record({ organizationId, userId, action, entityType: "Item", entityId: id, referenceNo: record.itemCode, oldValue: toDto(existing), newValue: toDto(record) });
    return toDto(record);
  }
}
