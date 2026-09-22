import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { SaveUomDto } from "./dto/save-uom.dto";
import { desktopCaptureAvailable, lockDesktopCaptureBoundary } from "../desktop-sync/desktop-sync-capture";
import { desktopMasterVersion, lockDesktopMasterClock, recordDesktopMasterChange } from "../desktop-sync/desktop-master-sync-state";

@Injectable()
export class UomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  findAll(organizationId: string) {
    return this.prisma.unitOfMeasurement.findMany({ where: { organizationId }, orderBy: { code: "asc" } });
  }

  async create(organizationId: string, userId: string, dto: SaveUomDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockDesktopCaptureBoundary(tx, organizationId);
      if (!await desktopCaptureAvailable(tx, "uom")) return this.createInTransaction(tx, organizationId, userId, dto);
      await lockDesktopMasterClock(tx, organizationId, "uom");
      const record = await this.createInTransaction(tx, organizationId, userId, dto);
      await recordDesktopMasterChange(tx, organizationId, "uom", record, 1);
      return record;
    });
  }

  async createInTransaction(tx: Prisma.TransactionClient, organizationId: string, userId: string, dto: SaveUomDto, id?: string) {
    const clash = await tx.unitOfMeasurement.findFirst({ where: { organizationId, code: dto.code.trim().toUpperCase() } });
    if (clash) throw new BadRequestException(`Unit code "${dto.code}" already exists`);

    const record = await tx.unitOfMeasurement.create({
      data: { ...(id ? { id } : {}), organizationId, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), symbol: dto.symbol, isActive: dto.isActive ?? true },
    });

    await this.auditLogService.record({ organizationId, userId, action: "UOM_CREATED", entityType: "UnitOfMeasurement", entityId: record.id, referenceNo: record.code, newValue: record }, tx);
    return record;
  }

  async update(organizationId: string, userId: string, id: string, dto: SaveUomDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockDesktopCaptureBoundary(tx, organizationId);
      if (!await desktopCaptureAvailable(tx, "uom")) return this.updateInTransaction(tx, organizationId, userId, id, dto);
      await lockDesktopMasterClock(tx, organizationId, "uom");
      const version = await desktopMasterVersion(tx, organizationId, "uom", id);
      const record = await this.updateInTransaction(tx, organizationId, userId, id, dto);
      await recordDesktopMasterChange(tx, organizationId, "uom", record, version + 1);
      return record;
    });
  }

  async updateInTransaction(tx: Prisma.TransactionClient, organizationId: string, userId: string, id: string, dto: SaveUomDto) {
    const existing = await tx.unitOfMeasurement.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Unit of Measurement not found");

    const record = await tx.unitOfMeasurement.update({
      where: { id, organizationId },
      data: { name: dto.name.trim(), symbol: dto.symbol, isActive: dto.isActive ?? existing.isActive },
    });

    await this.auditLogService.record({ organizationId, userId, action: "UOM_UPDATED", entityType: "UnitOfMeasurement", entityId: id, referenceNo: record.code, oldValue: existing, newValue: record }, tx);
    return record;
  }
}
