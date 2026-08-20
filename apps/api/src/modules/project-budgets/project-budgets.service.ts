import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectLifecycleGuardService } from "../prisma/project-lifecycle-guard.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { CreateProjectBudgetDto } from "./dto/create-project-budget.dto";

const includeRelations = {
  lines: { include: { expenseHead: { select: { id: true, name: true } } } },
} satisfies Prisma.ProjectBudgetInclude;

type BudgetRecord = Prisma.ProjectBudgetGetPayload<{ include: typeof includeRelations }>;

function toDto(record: BudgetRecord) {
  return {
    ...record,
    totalBudget: record.totalBudget.toFixed(2),
    lines: record.lines.map((line) => ({ ...line, amount: line.amount.toFixed(2) })),
  };
}

const ACTIVE_APPROVED_STATUSES = ["APPROVED", "REVISED"] as const;

@Injectable()
export class ProjectBudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly lifecycle: ProjectLifecycleGuardService,
  ) {}

  private async assertWork(organizationId: string, cmsWorkId: string) {
    const work = await this.prisma.cmsWork.findFirst({ where: { id: cmsWorkId, organizationId } });
    if (!work) throw new NotFoundException("Project / Work not found");
    return work;
  }

  private async resolveExpenseHead(organizationId: string, name: string) {
    return this.prisma.expenseHead.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name },
    });
  }

  async list(organizationId: string, cmsWorkId: string) {
    await this.assertWork(organizationId, cmsWorkId);
    const versions = await this.prisma.projectBudget.findMany({
      where: { organizationId, cmsWorkId },
      include: includeRelations,
      orderBy: { version: "desc" },
    });
    return versions.map(toDto);
  }

  async saveDraft(organizationId: string, userId: string, cmsWorkId: string, dto: CreateProjectBudgetDto) {
    await this.lifecycle.assertOperationalMutationAllowed(organizationId, cmsWorkId, "changing the project budget");
    await this.assertWork(organizationId, cmsWorkId);

    const heads = await Promise.all(dto.lines.map((line) => this.resolveExpenseHead(organizationId, line.category)));
    const totalBudget = dto.lines.reduce((sum, line) => sum + Number(line.amount), 0);

    const existingDraft = await this.prisma.projectBudget.findFirst({
      where: { organizationId, cmsWorkId, status: "DRAFT" },
    });

    const record = await this.prisma.$transaction(async (tx) => {
      if (existingDraft) {
        await tx.projectBudgetLine.deleteMany({ where: { budgetId: existingDraft.id } });
        return tx.projectBudget.update({
          where: { id: existingDraft.id },
          data: {
            totalBudget,
            revisionNote: dto.revisionNote,
            lines: {
              create: dto.lines.map((line, index) => ({
                category: line.category,
                description: line.description,
                amount: line.amount,
                remarks: line.remarks,
                expenseHeadId: heads[index]!.id,
              })),
            },
          },
          include: includeRelations,
        });
      }

      const latest = await tx.projectBudget.findFirst({
        where: { organizationId, cmsWorkId },
        orderBy: { version: "desc" },
      });
      return tx.projectBudget.create({
        data: {
          organizationId,
          cmsWorkId,
          version: (latest?.version ?? 0) + 1,
          status: "DRAFT",
          totalBudget,
          revisionNote: dto.revisionNote,
          createdById: userId,
          lines: {
            create: dto.lines.map((line, index) => ({
              category: line.category,
              description: line.description,
              amount: line.amount,
              remarks: line.remarks,
              expenseHeadId: heads[index]!.id,
            })),
          },
        },
        include: includeRelations,
      });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: "PROJECT_BUDGET_CREATED",
      entityType: "ProjectBudget",
      entityId: record.id,
      description: `Budget draft saved (v${record.version}) for project ${cmsWorkId}`,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async approve(organizationId: string, userId: string, cmsWorkId: string, budgetId: string) {
    await this.lifecycle.assertOperationalMutationAllowed(organizationId, cmsWorkId, "approving the project budget");
    await this.assertWork(organizationId, cmsWorkId);
    const budget = await this.prisma.projectBudget.findFirst({ where: { id: budgetId, organizationId, cmsWorkId } });
    if (!budget) throw new NotFoundException("Budget version not found");
    if (budget.status !== "DRAFT") throw new BadRequestException("Only a Draft budget version can be approved");

    const priorApproved = await this.prisma.projectBudget.findFirst({
      where: { organizationId, cmsWorkId, status: { in: [...ACTIVE_APPROVED_STATUSES] } },
    });

    const record = await this.prisma.$transaction(async (tx) => {
      if (priorApproved) {
        await tx.projectBudget.update({ where: { id: priorApproved.id }, data: { status: "ARCHIVED" } });
      }
      return tx.projectBudget.update({
        where: { id: budgetId },
        data: {
          status: priorApproved ? "REVISED" : "APPROVED",
          approvedById: userId,
          approvedAt: new Date(),
        },
        include: includeRelations,
      });
    });

    await this.auditLogService.record({
      organizationId,
      userId,
      action: priorApproved ? "PROJECT_BUDGET_REVISED" : "PROJECT_BUDGET_APPROVED",
      entityType: "ProjectBudget",
      entityId: record.id,
      description: `Budget v${record.version} ${record.status.toLowerCase()} for project ${cmsWorkId}`,
      newValue: toDto(record),
    });

    return toDto(record);
  }

  async summary(organizationId: string, cmsWorkId: string) {
    const work = await this.assertWork(organizationId, cmsWorkId);
    const [active, contract] = await Promise.all([
      this.prisma.projectBudget.findFirst({
        where: { organizationId, cmsWorkId, status: { in: [...ACTIVE_APPROVED_STATUSES] } },
        include: includeRelations,
      }),
      this.prisma.projectContract.findFirst({
        where: { organizationId, cmsWorkId, status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
        select: { currentContractValue: true },
      }),
    ]);

    const contractValue = contract?.currentContractValue ?? work.contractValue;
    const totalBudget = new Prisma.Decimal(active?.totalBudget ?? 0);
    const contingency = (active?.lines ?? [])
      .filter((line) => line.category === "Contingency")
      .reduce((sum, line) => sum.add(line.amount), new Prisma.Decimal(0));
    const unallocated = contractValue.minus(totalBudget);
    const expectedGrossMargin = contractValue.minus(totalBudget);
    const expectedMarginPct = contractValue.gt(0) ? expectedGrossMargin.div(contractValue).mul(100).toFixed(2) : "0.00";

    return {
      hasApprovedBudget: !!active,
      activeBudgetId: active?.id ?? null,
      activeVersion: active?.version ?? null,
      contractValue: contractValue.toFixed(2),
      totalBudget: totalBudget.toFixed(2),
      contingency: contingency.toFixed(2),
      unallocated: unallocated.toFixed(2),
      expectedGrossMargin: expectedGrossMargin.toFixed(2),
      expectedMarginPct,
    };
  }

  async budgetVsActual(organizationId: string, cmsWorkId: string) {
    await this.assertWork(organizationId, cmsWorkId);

    const [active, expenses] = await Promise.all([
      this.prisma.projectBudget.findFirst({
        where: { organizationId, cmsWorkId, status: { in: [...ACTIVE_APPROVED_STATUSES] } },
        include: includeRelations,
      }),
      this.prisma.expense.findMany({
        where: { organizationId, workId: cmsWorkId, status: { notIn: ["REJECTED", "CANCELLED", "AMENDED"] }, expenseHeadId: { not: null } },
        include: { expenseHead: { select: { id: true, name: true, budgetCategory: true } } },
      }),
    ]);

    const actualByCategory = new Map<string, Prisma.Decimal>();
    for (const expense of expenses) {
      const category = expense.expenseHead?.budgetCategory ?? "Unmapped / Unbudgeted";
      actualByCategory.set(category, (actualByCategory.get(category) ?? new Prisma.Decimal(0)).add(expense.amount));
    }

    const status = (budget: Prisma.Decimal, actual: Prisma.Decimal): string => {
      if (budget.lte(0)) return actual.gt(0) ? "Over Budget" : "Within Budget";
      const usedPct = actual.div(budget).mul(100);
      if (usedPct.gt(100)) return "Over Budget";
      if (usedPct.gte(80)) return "Near Limit";
      return "Within Budget";
    };

    const rows = (active?.lines ?? []).map((line) => {
      const actual = actualByCategory.get(line.category) ?? new Prisma.Decimal(0);
      actualByCategory.delete(line.category);
      const variance = line.amount.minus(actual);
      const variancePct = line.amount.gt(0) ? variance.div(line.amount).mul(100).toFixed(2) : "0.00";
      return {
        category: line.category,
        budget: line.amount.toFixed(2),
        actual: actual.toFixed(2),
        variance: variance.toFixed(2),
        variancePct,
        status: status(line.amount, actual),
      };
    });

    for (const [category, actual] of actualByCategory) {
      rows.push({
        category,
        budget: "0.00",
        actual: actual.toFixed(2),
        variance: new Prisma.Decimal(0).minus(actual).toFixed(2),
        variancePct: "0.00",
        status: category === "Unmapped / Unbudgeted" ? "Unbudgeted" : "Over Budget",
      });
    }

    const totals = rows.reduce(
      (acc, row) => ({
        budget: acc.budget.add(row.budget),
        actual: acc.actual.add(row.actual),
      }),
      { budget: new Prisma.Decimal(0), actual: new Prisma.Decimal(0) },
    );

    return {
      hasApprovedBudget: !!active,
      rows,
      totals: {
        budget: totals.budget.toFixed(2),
        actual: totals.actual.toFixed(2),
        variance: totals.budget.minus(totals.actual).toFixed(2),
      },
    };
  }
}
