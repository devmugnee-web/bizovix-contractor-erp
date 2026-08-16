import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import type { CancelSubscriptionDto, UpgradePlanDto } from "./dto/billing.dto";

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{ include: { planRef: true } }>;

function planDto(plan: SubscriptionWithPlan["planRef"]) {
  if (!plan) return null;
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice.toFixed(2),
    yearlyPrice: plan.yearlyPrice.toFixed(2),
    currency: plan.currency,
    userLimit: plan.userLimit,
    projectLimit: plan.projectLimit,
    storageLimitMb: plan.storageLimitMb,
    companyLimit: plan.companyLimit,
    features: plan.features as string[],
    isActive: plan.isActive,
  };
}

const MS_PER_DAY = 86_400_000;
const dayCount = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
  ) {}

  private async ensureSubscription(org: string): Promise<SubscriptionWithPlan> {
    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId: org },
      include: { planRef: true },
    });
    if (existing) return existing;
    const trialPlan = await this.prisma.plan.findUnique({ where: { code: "PROFESSIONAL" } });
    return this.prisma.subscription.create({
      data: {
        organizationId: org,
        status: "TRIALING",
        planId: trialPlan?.id,
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 30 * MS_PER_DAY),
      },
      include: { planRef: true },
    });
  }

  /** Lazily recomputes subscription status (trial expiry, cancel-at-period-end)
   * on every read — mirrors RemindersService's refreshStatuses() pattern used
   * elsewhere in this codebase, rather than relying on a separate cron job. */
  private async refreshStatus(org: string): Promise<SubscriptionWithPlan> {
    const sub = await this.ensureSubscription(org);
    const now = new Date();
    let nextStatus = sub.status;
    if (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt < now) nextStatus = "EXPIRED";
    if (sub.status === "ACTIVE" && sub.cancelAtPeriodEnd && sub.currentPeriodEnd && sub.currentPeriodEnd < now)
      nextStatus = "CANCELED";
    if (sub.status === "ACTIVE" && sub.currentPeriodEnd && !sub.cancelAtPeriodEnd && sub.currentPeriodEnd < now)
      nextStatus = "PAST_DUE";
    if (nextStatus === sub.status) return sub;
    return this.prisma.subscription.update({
      where: { organizationId: org },
      data: { status: nextStatus },
      include: { planRef: true },
    });
  }

  private toDto(sub: SubscriptionWithPlan) {
    const now = new Date();
    const trialDaysTotal =
      sub.trialStartedAt && sub.trialEndsAt ? dayCount(sub.trialStartedAt, sub.trialEndsAt) : null;
    const trialDaysRemaining =
      sub.status === "TRIALING" && sub.trialEndsAt ? Math.max(0, dayCount(now, sub.trialEndsAt)) : null;
    return {
      id: sub.id,
      status: sub.status,
      billingCycle: sub.billingCycle,
      trialStartedAt: sub.trialStartedAt,
      trialEndsAt: sub.trialEndsAt,
      trialDaysTotal,
      trialDaysRemaining,
      startedAt: sub.startedAt,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      cancelRequestedAt: sub.cancelRequestedAt,
      plan: planDto(sub.planRef),
    };
  }

  async getSubscription(org: string) {
    return this.toDto(await this.refreshStatus(org));
  }

  /** Raw row for internal callers (e.g. PlanLimitsService) that need the plan
   * relation without re-serializing Decimal fields to strings. */
  async getSubscriptionRow(org: string) {
    return this.refreshStatus(org);
  }

  async listPlans(org: string) {
    const [plans, sub] = await Promise.all([
      this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      this.refreshStatus(org),
    ]);
    return plans.map((plan) => ({ ...planDto(plan), isCurrent: plan.id === sub.planId }));
  }

  async getUsage(org: string) {
    const sub = await this.refreshStatus(org);
    const plan = sub.planRef;
    const [userCount, projectCount, storageAgg] = await Promise.all([
      this.prisma.organizationUser.count({ where: { organizationId: org, user: { isActive: true } } }),
      this.prisma.cmsWork.count({ where: { organizationId: org } }),
      this.prisma.expenseAttachment.aggregate({ where: { organizationId: org }, _sum: { fileSize: true } }),
    ]);
    const storageUsedMb = Math.round(((storageAgg._sum.fileSize ?? 0) / (1024 * 1024)) * 100) / 100;
    return {
      users: { used: userCount, limit: plan?.userLimit ?? null },
      projects: { used: projectCount, limit: plan?.projectLimit ?? null },
      storage: { usedMb: storageUsedMb, limitMb: plan?.storageLimitMb ?? null },
      companies: { used: 1, limit: plan?.companyLimit ?? null },
    };
  }

  async upgradePlan(org: string, userId: string, dto: UpgradePlanDto) {
    const [old, plan] = await Promise.all([
      this.refreshStatus(org),
      this.prisma.plan.findFirst({ where: { id: dto.planId, isActive: true } }),
    ]);
    if (!plan) throw new NotFoundException("Selected plan was not found");

    const now = new Date();
    const periodDays = dto.billingCycle === "YEARLY" ? 365 : 30;
    const currentPeriodEnd = new Date(now.getTime() + periodDays * MS_PER_DAY);
    const price = dto.billingCycle === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice;

    const updated = await this.prisma.subscription.update({
      where: { organizationId: org },
      data: {
        planId: plan.id,
        billingCycle: dto.billingCycle,
        status: "ACTIVE",
        startedAt: old.startedAt ?? now,
        currentPeriodStart: now,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        cancelRequestedAt: null,
      },
      include: { planRef: true },
    });

    const invoiceNumber = await this.numbering.next(org, "INVOICE");
    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId: org,
        subscriptionId: updated.id,
        planId: plan.id,
        invoiceNumber,
        planNameSnapshot: plan.name,
        billingCycle: dto.billingCycle,
        billingPeriodStart: now,
        billingPeriodEnd: currentPeriodEnd,
        subtotal: price,
        total: price,
        currency: plan.currency,
        status: "PENDING",
        dueAt: new Date(now.getTime() + 7 * MS_PER_DAY),
        items: { create: [{ description: `${plan.name} plan — ${dto.billingCycle.toLowerCase()} subscription`, amount: price }] },
      },
    });

    await this.audit.record({
      organizationId: org,
      userId,
      action: old.planId === plan.id ? "renew" : "plan_changed",
      module: "Plan & Billing",
      entityType: "Subscription",
      entityId: updated.id,
      referenceNo: invoice.invoiceNumber,
      oldValue: { planId: old.planId, status: old.status },
      newValue: { planId: plan.id, status: "ACTIVE", billingCycle: dto.billingCycle },
    });

    return { subscription: this.toDto(updated), invoiceId: invoice.id };
  }

  async cancelSubscription(org: string, userId: string, dto: CancelSubscriptionDto) {
    const old = await this.refreshStatus(org);
    if (old.status !== "ACTIVE" && old.status !== "PAST_DUE")
      throw new BadRequestException("Only an active subscription can be cancelled");
    const updated = await this.prisma.subscription.update({
      where: { organizationId: org },
      data: { cancelAtPeriodEnd: true, cancelRequestedAt: new Date() },
      include: { planRef: true },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "cancel_requested",
      module: "Plan & Billing",
      entityType: "Subscription",
      entityId: updated.id,
      description: dto.reason ? `Cancellation requested: ${dto.reason}` : "Cancellation requested",
    });
    return this.toDto(updated);
  }

  async resumeSubscription(org: string, userId: string) {
    const old = await this.refreshStatus(org);
    if (!old.cancelAtPeriodEnd) throw new BadRequestException("This subscription is not scheduled for cancellation");
    const updated = await this.prisma.subscription.update({
      where: { organizationId: org },
      data: { cancelAtPeriodEnd: false, cancelRequestedAt: null },
      include: { planRef: true },
    });
    await this.audit.record({
      organizationId: org,
      userId,
      action: "cancel_reversed",
      module: "Plan & Billing",
      entityType: "Subscription",
      entityId: updated.id,
    });
    return this.toDto(updated);
  }
}
