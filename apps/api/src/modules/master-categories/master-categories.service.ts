import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { MasterCategoryType } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { SaveMasterCategoryDto } from "./dto/save-master-category.dto";

@Injectable()
export class MasterCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  findAll(organizationId: string, type?: MasterCategoryType) {
    return this.prisma.masterCategory.findMany({
      where: { organizationId, ...(type ? { type } : {}) },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  }

  async create(organizationId: string, userId: string, dto: SaveMasterCategoryDto) {
    const clash = await this.prisma.masterCategory.findFirst({ where: { organizationId, type: dto.type, name: { equals: dto.name.trim(), mode: "insensitive" } } });
    if (clash) throw new BadRequestException(`A ${dto.type.toLowerCase()} category named "${dto.name}" already exists`);

    const record = await this.prisma.masterCategory.create({
      data: { organizationId, type: dto.type, name: dto.name.trim(), description: dto.description, isActive: dto.isActive ?? true },
    });

    await this.auditLogService.record({ organizationId, userId, action: "MASTER_CATEGORY_CREATED", entityType: "MasterCategory", entityId: record.id, referenceNo: record.name, newValue: record });
    return record;
  }

  async update(organizationId: string, userId: string, id: string, dto: SaveMasterCategoryDto) {
    const existing = await this.prisma.masterCategory.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Category not found");

    const clash = await this.prisma.masterCategory.findFirst({
      where: { organizationId, type: existing.type, name: { equals: dto.name.trim(), mode: "insensitive" }, id: { not: id } },
    });
    if (clash) throw new BadRequestException(`A ${existing.type.toLowerCase()} category named "${dto.name}" already exists`);

    const record = await this.prisma.masterCategory.update({
      where: { id, organizationId },
      data: { name: dto.name.trim(), description: dto.description, isActive: dto.isActive ?? existing.isActive },
    });

    await this.auditLogService.record({ organizationId, userId, action: "MASTER_CATEGORY_UPDATED", entityType: "MasterCategory", entityId: id, referenceNo: record.name, oldValue: existing, newValue: record });
    return record;
  }
}
