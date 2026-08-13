import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface RecordAuditLogInput {
  organizationId: string;
  userId?: string | null;
  action: "login" | "create" | "update" | "delete" | "approve" | "mark_not_required";
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        oldValue: input.oldValue as never,
        newValue: input.newValue as never,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }
}
