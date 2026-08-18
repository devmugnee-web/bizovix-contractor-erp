import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "@bizovix/database";

export interface RecordAuditLogInput {
  organizationId: string;
  userId?: string | null;
  action: string;
  module?: string;
  description?: string;
  referenceNo?: string | null;
  status?: "SUCCESS" | "WARNING" | "FAILED";
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditLogInput, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma).auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        action: input.action,
        module: input.module ?? input.entityType.replace(/([a-z])([A-Z])/g, "$1 $2"),
        description: input.description ?? `${input.action.replaceAll("_", " ")} ${input.entityType}`,
        referenceNo: input.referenceNo ?? null,
        status: input.status ?? (input.action === "delete" || input.action === "reject_noa" ? "WARNING" : "SUCCESS"),
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        oldValue: input.oldValue as never,
        newValue: input.newValue as never,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }
}
