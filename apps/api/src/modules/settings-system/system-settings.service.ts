import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { UpdateSystemSettingDto } from "./dto/system-settings.dto";

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private async dbStatus(): Promise<"ONLINE" | "OFFLINE"> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "ONLINE";
    } catch {
      return "OFFLINE";
    }
  }

  async get(org: string) {
    const [row, dbStatus, generalSetting] = await Promise.all([
      this.prisma.systemSetting.upsert({
        where: { organizationId: org },
        update: {},
        create: { organizationId: org },
      }),
      this.dbStatus(),
      this.prisma.generalSetting.findUnique({ where: { organizationId: org } }),
    ]);
    return {
      ...row,
      appName: "Bizovix Contractor ERP",
      appVersion: process.env.npm_package_version ?? "1.0.0",
      environment: process.env.NODE_ENV ?? "development",
      databaseStatus: dbStatus,
      apiStatus: "ONLINE" as const,
      storageStatus: dbStatus,
      defaultPageSize: generalSetting?.defaultPageSize ?? 10,
    };
  }

  async update(org: string, userId: string, dto: UpdateSystemSettingDto) {
    const old = await this.prisma.systemSetting.findUnique({ where: { organizationId: org } });
    const row = await this.prisma.systemSetting.upsert({
      where: { organizationId: org },
      update: { maintenanceMode: dto.maintenanceMode, featureToggles: dto.featureToggles, updatedById: userId },
      create: { organizationId: org, maintenanceMode: dto.maintenanceMode, featureToggles: dto.featureToggles, updatedById: userId },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Settings",
      entityType: "SystemSetting",
      entityId: row.id,
      oldValue: old,
      newValue: row,
    });
    return this.get(org);
  }
}
