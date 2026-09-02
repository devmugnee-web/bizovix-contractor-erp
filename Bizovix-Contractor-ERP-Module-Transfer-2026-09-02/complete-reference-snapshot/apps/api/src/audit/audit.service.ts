import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";

interface AuditInput {
  tenantId?: string | null;
  organizationId?: string | null;
  companyId?: string | null;
  workspaceId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async log(input: AuditInput) {
    const actor = input.userId
      ? await this.resolveActorSnapshot(input.userId, input.tenantId, input.companyId, input.workspaceId)
      : null;
    const suppliedNewValues = input.newValues && typeof input.newValues === "object" && !Array.isArray(input.newValues)
      ? input.newValues as Record<string, unknown>
      : input.newValues === undefined
        ? {}
        : { value: input.newValues };

    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId ?? null,
        organizationId: input.organizationId ?? null,
        companyId: input.companyId ?? null,
        workspaceId: input.workspaceId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        oldValues: input.oldValues as never,
        newValues: { ...suppliedNewValues, ...(actor ? { _actor: actor } : {}) } as never,
      },
    });
  }

  private async resolveActorSnapshot(userId: string, tenantId?: string | null, companyId?: string | null, workspaceId?: string | null) {
    const [user, assignedRole, tenantMember] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
      this.prisma.userRole.findFirst({
        where: {
          userId,
          ...(tenantId ? { tenantId } : {}),
          OR: [
            ...(workspaceId ? [{ workspaceId }] : []),
            { workspaceId: null, ...(companyId ? { companyId } : {}) },
          ],
        },
        include: { role: { select: { name: true, code: true } } },
        orderBy: { assignedAt: "desc" },
      }),
      tenantId
        ? this.prisma.tenantMember.findFirst({ where: { tenantId, userId }, select: { membershipRole: true } })
        : null,
    ]);

    if (!user) return null;
    const fallbackRole = tenantMember?.membershipRole
      ? tenantMember.membershipRole.charAt(0) + tenantMember.membershipRole.slice(1).toLowerCase()
      : "Member";
    return {
      userName: user.name,
      email: user.email,
      role: assignedRole?.role.name ?? fallbackRole,
      roleCode: assignedRole?.role.code ?? tenantMember?.membershipRole ?? "MEMBER",
    };
  }
}
