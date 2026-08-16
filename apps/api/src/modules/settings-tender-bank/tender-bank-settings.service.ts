import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { UpdateTenderBankSettingDto } from "./dto/tender-bank-settings.dto";

@Injectable()
export class TenderBankSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  get(org: string) {
    return this.prisma.tenderBankSetting.upsert({
      where: { organizationId: org },
      update: {},
      create: { organizationId: org },
    });
  }

  async update(org: string, userId: string, dto: UpdateTenderBankSettingDto) {
    const old = await this.get(org);
    const row = await this.prisma.tenderBankSetting.update({
      where: { organizationId: org },
      data: { ...dto, updatedById: userId },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Settings",
      entityType: "TenderBankSetting",
      entityId: row.id,
      oldValue: old,
      newValue: row,
    });
    return row;
  }
}
