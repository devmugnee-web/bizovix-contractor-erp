import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CreateDeductionConfigDto } from "./dto/create-deduction-config.dto";
import { UpdateDeductionConfigDto } from "./dto/update-deduction-config.dto";

function toDto(row: { rate: { toFixed: (n: number) => string } } & Record<string, unknown>) {
  return { ...row, rate: row.rate.toFixed(4) };
}

@Injectable()
export class DeductionConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(organizationId: string, type?: string) {
    const rows = await this.prisma.deductionConfig.findMany({
      where: { organizationId, ...(type ? { type } : {}) },
      orderBy: [{ type: "asc" }, { effectiveFrom: "desc" }],
    });
    return rows.map(toDto);
  }

  /** The rate a business event dated `date` should snapshot — never a hardcoded universal
   * percentage. Returns null (not a fallback rate) when nothing is configured for that
   * type/date, so callers can surface "not configured" rather than silently charging 0%. */
  async effectiveConfig(organizationId: string, type: string, date: Date) {
    const row = await this.prisma.deductionConfig.findFirst({
      where: {
        organizationId,
        type,
        isActive: true,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    return row ? { id: row.id, name: row.name, rate: row.rate } : null;
  }

  async create(organizationId: string, userId: string, dto: CreateDeductionConfigDto) {
    const record = await this.prisma.deductionConfig.create({
      data: {
        organizationId,
        type: dto.type,
        name: dto.name,
        code: dto.code,
        rate: dto.rate,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        isActive: dto.isActive ?? true,
        createdById: userId,
      },
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "DEDUCTION_CONFIG_CREATED",
      entityType: "DeductionConfig",
      entityId: record.id,
      referenceNo: record.name,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateDeductionConfigDto) {
    const existing = await this.prisma.deductionConfig.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Deduction config not found");

    const record = await this.prisma.deductionConfig.update({
      where: { id, organizationId },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.rate !== undefined ? { rate: dto.rate } : {}),
        ...(dto.effectiveFrom ? { effectiveFrom: new Date(dto.effectiveFrom) } : {}),
        ...(dto.effectiveTo !== undefined ? { effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "DEDUCTION_CONFIG_UPDATED",
      entityType: "DeductionConfig",
      entityId: id,
      referenceNo: record.name,
      oldValue: toDto(existing),
      newValue: toDto(record),
    });

    return toDto(record);
  }
}
