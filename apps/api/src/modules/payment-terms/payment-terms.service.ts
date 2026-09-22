import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { SavePaymentTermDto } from "./dto/save-payment-term.dto";
import { desktopCaptureAvailable, lockDesktopCaptureBoundary } from "../desktop-sync/desktop-sync-capture";
import { desktopMasterVersion, lockDesktopMasterClock, recordDesktopMasterChange } from "../desktop-sync/desktop-master-sync-state";

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
    return this.prisma.$transaction(async (tx) => {
      await lockDesktopCaptureBoundary(tx, organizationId);
      if (!await desktopCaptureAvailable(tx, "paymentTerm")) return this.createInTransaction(tx, organizationId, userId, dto);
      await lockDesktopMasterClock(tx, organizationId, "paymentTerm");
      const record = await this.createInTransaction(tx, organizationId, userId, dto);
      await recordDesktopMasterChange(tx, organizationId, "paymentTerm", record, 1);
      return record;
    });
  }

  async createInTransaction(tx: Prisma.TransactionClient, organizationId: string, userId: string, dto: SavePaymentTermDto, id?: string) {
    const clash = await tx.paymentTerm.findFirst({ where: { organizationId, name: { equals: dto.name.trim(), mode: "insensitive" } } });
    if (clash) throw new BadRequestException(`A payment term named "${dto.name}" already exists`);

    const record = await tx.paymentTerm.create({
      data: { ...(id ? { id } : {}), organizationId, name: dto.name.trim(), days: dto.days ?? 0, description: dto.description, isActive: dto.isActive ?? true },
    });

    await this.auditLogService.record({ organizationId, userId, action: "PAYMENT_TERM_CREATED", entityType: "PaymentTerm", entityId: record.id, referenceNo: record.name, newValue: record }, tx);
    return record;
  }

  async update(organizationId: string, userId: string, id: string, dto: SavePaymentTermDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockDesktopCaptureBoundary(tx, organizationId);
      if (!await desktopCaptureAvailable(tx, "paymentTerm")) return this.updateInTransaction(tx, organizationId, userId, id, dto);
      await lockDesktopMasterClock(tx, organizationId, "paymentTerm");
      const version = await desktopMasterVersion(tx, organizationId, "paymentTerm", id);
      const record = await this.updateInTransaction(tx, organizationId, userId, id, dto);
      await recordDesktopMasterChange(tx, organizationId, "paymentTerm", record, version + 1);
      return record;
    });
  }

  async updateInTransaction(tx: Prisma.TransactionClient, organizationId: string, userId: string, id: string, dto: SavePaymentTermDto) {
    const existing = await tx.paymentTerm.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Payment Term not found");

    const clash = await tx.paymentTerm.findFirst({
      where: { organizationId, name: { equals: dto.name.trim(), mode: "insensitive" }, id: { not: id } },
    });
    if (clash) throw new BadRequestException(`A payment term named "${dto.name}" already exists`);

    const record = await tx.paymentTerm.update({
      where: { id, organizationId },
      data: { name: dto.name.trim(), days: dto.days ?? existing.days, description: dto.description, isActive: dto.isActive ?? existing.isActive },
    });

    await this.auditLogService.record({ organizationId, userId, action: "PAYMENT_TERM_UPDATED", entityType: "PaymentTerm", entityId: id, referenceNo: record.name, oldValue: existing, newValue: record }, tx);
    return record;
  }
}
