import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { UpdateGeneralSettingDto } from "./dto/general-settings.dto";

@Injectable()
export class GeneralSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  get(org: string) {
    return this.prisma.generalSetting.upsert({
      where: { organizationId: org },
      update: {},
      create: { organizationId: org },
    });
  }

  async update(org: string, userId: string, dto: UpdateGeneralSettingDto) {
    const old = await this.get(org);
    const row = await this.prisma.generalSetting.update({
      where: { organizationId: org },
      data: { ...dto, updatedById: userId },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Settings",
      entityType: "GeneralSetting",
      entityId: row.id,
      oldValue: old,
      newValue: row,
    });
    return row;
  }
}
