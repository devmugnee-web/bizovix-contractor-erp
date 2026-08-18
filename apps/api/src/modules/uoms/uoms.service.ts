import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { SaveUomDto } from "./dto/save-uom.dto";

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
    const clash = await this.prisma.unitOfMeasurement.findFirst({ where: { organizationId, code: dto.code.trim().toUpperCase() } });
    if (clash) throw new BadRequestException(`Unit code "${dto.code}" already exists`);

    const record = await this.prisma.unitOfMeasurement.create({
      data: { organizationId, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), symbol: dto.symbol, isActive: dto.isActive ?? true },
    });

    await this.auditLogService.record({ organizationId, userId, action: "UOM_CREATED", entityType: "UnitOfMeasurement", entityId: record.id, referenceNo: record.code, newValue: record });
    return record;
  }

  async update(organizationId: string, userId: string, id: string, dto: SaveUomDto) {
    const existing = await this.prisma.unitOfMeasurement.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Unit of Measurement not found");

    const record = await this.prisma.unitOfMeasurement.update({
      where: { id, organizationId },
      data: { name: dto.name.trim(), symbol: dto.symbol, isActive: dto.isActive ?? existing.isActive },
    });

    await this.auditLogService.record({ organizationId, userId, action: "UOM_UPDATED", entityType: "UnitOfMeasurement", entityId: id, referenceNo: record.code, oldValue: existing, newValue: record });
    return record;
  }
}
