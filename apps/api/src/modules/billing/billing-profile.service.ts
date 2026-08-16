import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { UpdateBillingProfileDto } from "./dto/billing-profile.dto";

@Injectable()
export class BillingProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async get(org: string) {
    const existing = await this.prisma.billingProfile.findUnique({ where: { organizationId: org } });
    if (existing) return existing;
    const companyProfile = await this.prisma.companyProfile.findUnique({ where: { organizationId: org } });
    return this.prisma.billingProfile.create({
      data: {
        organizationId: org,
        billingName: companyProfile?.legalName ?? companyProfile?.displayName ?? null,
        billingEmail: companyProfile?.email ?? null,
        phone: companyProfile?.phone ?? null,
        billingAddress: companyProfile?.address ?? null,
        tinNumber: companyProfile?.tinNumber ?? null,
        binNumber: companyProfile?.binNumber ?? null,
      },
    });
  }

  async update(org: string, userId: string, dto: UpdateBillingProfileDto) {
    const old = await this.get(org);
    const row = await this.prisma.billingProfile.update({
      where: { organizationId: org },
      data: { ...dto, updatedById: userId },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Plan & Billing",
      entityType: "BillingProfile",
      entityId: row.id,
      oldValue: old,
      newValue: row,
    });
    return row;
  }
}
