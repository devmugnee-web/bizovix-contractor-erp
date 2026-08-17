import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { SaveApprovalRuleDto, UpdateApprovalRuleDto } from "./dto/approval-rule.dto";

@Injectable()
export class ApprovalRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  list(org: string) {
    return this.prisma.approvalRule.findMany({
      where: { organizationId: org },
      orderBy: [{ module: "asc" }, { approvalLevel: "asc" }],
    });
  }

  async one(org: string, id: string) {
    const row = await this.prisma.approvalRule.findFirst({ where: { id, organizationId: org } });
    if (!row) throw new NotFoundException("Approval rule not found");
    return row;
  }

  async create(org: string, userId: string, dto: SaveApprovalRuleDto) {
    const row = await this.prisma.approvalRule.create({
      data: {
        organizationId: org,
        module: dto.module,
        transactionType: dto.transactionType?.trim() || null,
        minAmount: dto.minAmount,
        maxAmount: dto.maxAmount,
        approvalRequired: dto.approvalRequired,
        approverRole: dto.approverRole.trim(),
        approvalLevel: dto.approvalLevel,
        isActive: dto.isActive ?? true,
        createdById: userId,
      },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "create",
      module: "Settings",
      entityType: "ApprovalRule",
      entityId: row.id,
      referenceNo: row.module,
      newValue: row,
    });
    return row;
  }

  async update(org: string, userId: string, id: string, dto: UpdateApprovalRuleDto) {
    const old = await this.one(org, id);
    const row = await this.prisma.approvalRule.update({
      where: { id, organizationId: org },
      data: {
        module: dto.module,
        transactionType: dto.transactionType?.trim() || null,
        minAmount: dto.minAmount,
        maxAmount: dto.maxAmount,
        approvalRequired: dto.approvalRequired,
        approverRole: dto.approverRole.trim(),
        approvalLevel: dto.approvalLevel,
        isActive: dto.isActive ?? old.isActive,
      },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "update",
      module: "Settings",
      entityType: "ApprovalRule",
      entityId: row.id,
      referenceNo: row.module,
      oldValue: old,
      newValue: row,
    });
    return row;
  }

  async remove(org: string, userId: string, id: string) {
    const old = await this.one(org, id);
    await this.prisma.approvalRule.delete({ where: { id, organizationId: org } });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "delete",
      module: "Settings",
      entityType: "ApprovalRule",
      entityId: id,
      referenceNo: old.module,
      oldValue: old,
    });
    return null;
  }

  /** Resolves the active, best-matching approval rule (if any) for a proposed
   * transaction amount — the piece other modules would consult before posting. */
  async resolve(org: string, moduleKey: string, amount: number) {
    const rules = await this.prisma.approvalRule.findMany({
      where: { organizationId: org, module: moduleKey, isActive: true, approvalRequired: true },
      orderBy: { approvalLevel: "asc" },
    });
    return rules.find((rule) => {
      const min = rule.minAmount ? Number(rule.minAmount) : 0;
      const max = rule.maxAmount ? Number(rule.maxAmount) : Infinity;
      return amount >= min && amount <= max;
    });
  }
}
