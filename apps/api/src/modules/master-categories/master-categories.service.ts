import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { MasterCategoryType, Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { SaveMasterCategoryDto } from "./dto/save-master-category.dto";
import { categorySyncVersion, lockDesktopSyncClock, recordCategorySyncChange } from "../desktop-sync/desktop-sync-state";
import { desktopCaptureAvailable, lockDesktopCaptureBoundary } from "../desktop-sync/desktop-sync-capture";

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
    return this.prisma.$transaction(async (tx) => {
      await lockDesktopCaptureBoundary(tx, organizationId);
      if (!await desktopCaptureAvailable(tx, "category")) return this.createInTransaction(tx, organizationId, userId, dto);
      await lockDesktopSyncClock(tx, organizationId);
      const record = await this.createInTransaction(tx, organizationId, userId, dto);
      await recordCategorySyncChange(tx, organizationId, record, 1);
      return record;
    });
  }

  /** Existing category rules reused by REST and explicit sync commands. Caller owns transaction. */
  async createInTransaction(tx: Prisma.TransactionClient, organizationId: string, userId: string, dto: SaveMasterCategoryDto, id?: string) {
    const clash = await tx.masterCategory.findFirst({ where: { organizationId, type: dto.type, name: { equals: dto.name.trim(), mode: "insensitive" } } });
    if (clash) throw new BadRequestException(`A ${dto.type.toLowerCase()} category named "${dto.name}" already exists`);

    const record = await tx.masterCategory.create({
      data: { ...(id ? { id } : {}), organizationId, type: dto.type, name: dto.name.trim(), description: dto.description, isActive: dto.isActive ?? true },
    });

    await this.auditLogService.record({ organizationId, userId, action: "MASTER_CATEGORY_CREATED", entityType: "MasterCategory", entityId: record.id, referenceNo: record.name, newValue: record }, tx);
    return record;
  }

  async update(organizationId: string, userId: string, id: string, dto: SaveMasterCategoryDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockDesktopCaptureBoundary(tx, organizationId);
      if (!await desktopCaptureAvailable(tx, "category")) return this.updateInTransaction(tx, organizationId, userId, id, dto);
      await lockDesktopSyncClock(tx, organizationId);
      const version = await categorySyncVersion(tx, organizationId, id);
      const record = await this.updateInTransaction(tx, organizationId, userId, id, dto);
      await recordCategorySyncChange(tx, organizationId, record, version + 1);
      return record;
    });
  }

  async updateInTransaction(tx: Prisma.TransactionClient, organizationId: string, userId: string, id: string, dto: SaveMasterCategoryDto) {
    const existing = await tx.masterCategory.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Category not found");

    const clash = await tx.masterCategory.findFirst({
      where: { organizationId, type: existing.type, name: { equals: dto.name.trim(), mode: "insensitive" }, id: { not: id } },
    });
    if (clash) throw new BadRequestException(`A ${existing.type.toLowerCase()} category named "${dto.name}" already exists`);

    const record = await tx.masterCategory.update({
      where: { id, organizationId },
      data: { name: dto.name.trim(), description: dto.description, isActive: dto.isActive ?? existing.isActive },
    });

    await this.auditLogService.record({ organizationId, userId, action: "MASTER_CATEGORY_UPDATED", entityType: "MasterCategory", entityId: id, referenceNo: record.name, oldValue: existing, newValue: record }, tx);
    return record;
  }
}
