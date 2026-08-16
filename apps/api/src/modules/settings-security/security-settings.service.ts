import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { UpdateSecuritySettingDto } from "./dto/security-settings.dto";

@Injectable()
export class SecuritySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  get(org: string) {
    return this.prisma.securitySetting.upsert({
      where: { organizationId: org },
      update: {},
      create: { organizationId: org },
    });
  }

  async update(org: string, userId: string, dto: UpdateSecuritySettingDto) {
    const old = await this.get(org);
    const row = await this.prisma.securitySetting.update({
      where: { organizationId: org },
      data: { ...dto, updatedById: userId },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Settings",
      entityType: "SecuritySetting",
      entityId: row.id,
      oldValue: old,
      newValue: row,
    });
    return row;
  }

  async activeSessions(userId: string) {
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
    });
    return rows;
  }

  async revokeSession(org: string, userId: string, sessionId: string) {
    const row = await this.prisma.refreshToken.findFirst({ where: { id: sessionId, userId } });
    if (!row) throw new NotFoundException("Session not found");
    await this.prisma.refreshToken.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "revoke_session",
      module: "Settings",
      entityType: "RefreshToken",
      entityId: sessionId,
    });
    return { success: true };
  }
}
