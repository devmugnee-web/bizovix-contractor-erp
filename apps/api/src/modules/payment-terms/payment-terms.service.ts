import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { SavePaymentTermDto } from "./dto/save-payment-term.dto";

@Injectable()
export class PaymentTermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  findAll(organizationId: string) {
    return this.prisma.paymentTerm.findMany({ where: { organizationId }, orderBy: { days: "asc" } });
  }

  async create(organizationId: string, userId: string, dto: SavePaymentTermDto) {
    const clash = await this.prisma.paymentTerm.findFirst({ where: { organizationId, name: { equals: dto.name.trim(), mode: "insensitive" } } });
    if (clash) throw new BadRequestException(`A payment term named "${dto.name}" already exists`);

    const record = await this.prisma.paymentTerm.create({
      data: { organizationId, name: dto.name.trim(), days: dto.days ?? 0, description: dto.description, isActive: dto.isActive ?? true },
    });

    await this.auditLogService.record({ organizationId, userId, action: "PAYMENT_TERM_CREATED", entityType: "PaymentTerm", entityId: record.id, referenceNo: record.name, newValue: record });
    return record;
  }

  async update(organizationId: string, userId: string, id: string, dto: SavePaymentTermDto) {
    const existing = await this.prisma.paymentTerm.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Payment Term not found");

    const clash = await this.prisma.paymentTerm.findFirst({
      where: { organizationId, name: { equals: dto.name.trim(), mode: "insensitive" }, id: { not: id } },
    });
    if (clash) throw new BadRequestException(`A payment term named "${dto.name}" already exists`);

    const record = await this.prisma.paymentTerm.update({
      where: { id, organizationId },
      data: { name: dto.name.trim(), days: dto.days ?? existing.days, description: dto.description, isActive: dto.isActive ?? existing.isActive },
    });

    await this.auditLogService.record({ organizationId, userId, action: "PAYMENT_TERM_UPDATED", entityType: "PaymentTerm", entityId: id, referenceNo: record.name, oldValue: existing, newValue: record });
    return record;
  }
}
