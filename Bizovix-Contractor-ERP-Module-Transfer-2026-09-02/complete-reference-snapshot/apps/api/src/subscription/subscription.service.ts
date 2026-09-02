import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { SubscriptionStatus, SubscriptionUpgradeRequestStatus } from "../generated/prisma/index.js";

import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { subscriptionPlanSeeds } from "../platform/bootstrap/defaults.js";
import { PrismaService } from "../prisma/prisma.service.js";

const usageDefinitions = [
  { id: "users", label: "Users", limitField: "maxUsers", unit: null },
  { id: "stock-items", label: "Stock Items", limitField: "maxStockItems", unit: null },
  { id: "monthly-vouchers", label: "Monthly Vouchers", limitField: "maxMonthlyVouchers", unit: null },
  { id: "storage-mb", label: "Storage", limitField: "maxStorageMb", unit: "GB" },
] as const;

const planLimitLabels: Record<string, { label: string; unit?: string }> = {
  organizations: { label: "Organizations" },
  companies: { label: "Companies" },
  workspaces: { label: "Workspaces" },
  branches: { label: "Branches" },
  users: { label: "Users" },
  godowns: { label: "Godowns" },
  "stock-items": { label: "Stock Items" },
  customers: { label: "Customers" },
  suppliers: { label: "Suppliers" },
  "monthly-vouchers": { label: "Monthly Vouchers" },
  "monthly-invoices": { label: "Monthly Invoices" },
  "storage-mb": { label: "Storage", unit: "GB" },
};

function toGigabytes(valueInMb: number) {
  return Math.round((valueInMb / 1024) * 10) / 10;
}

function mapStatus(status: SubscriptionStatus, endsAt: Date, graceEndsAt: Date | null, now: Date) {
  if (
    status === SubscriptionStatus.SUSPENDED ||
    status === SubscriptionStatus.CANCELLED ||
    status === SubscriptionStatus.ARCHIVED ||
    status === SubscriptionStatus.OVERDUE ||
    status === SubscriptionStatus.FREE_EXPIRED
  ) {
    return "suspended";
  }

  if (graceEndsAt && graceEndsAt >= now && endsAt < now) {
    return "grace-period";
  }

  if (status === SubscriptionStatus.PAID_ACTIVE || status === SubscriptionStatus.PAYMENT_DUE) {
    return "paid-active";
  }

  const daysRemaining = Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysRemaining <= 30) {
    return "free-expiring";
  }

  return "free-active";
}

function formatBillingLabel(durationMonths: number) {
  return durationMonths === 1 ? "per month" : `every ${durationMonths} months`;
}

function formatPriceLabel(priceInMinor: number, currencyCode: string) {
  if (priceInMinor <= 0) {
    return "Free";
  }

  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(priceInMinor / 100);
}

function mapUpgradeRequestStatus(status: SubscriptionUpgradeRequestStatus) {
  switch (status) {
    case SubscriptionUpgradeRequestStatus.IN_REVIEW:
      return "in-review";
    case SubscriptionUpgradeRequestStatus.APPROVED:
      return "approved";
    case SubscriptionUpgradeRequestStatus.REJECTED:
      return "rejected";
    case SubscriptionUpgradeRequestStatus.CANCELLED:
      return "cancelled";
    default:
      return "open";
  }
}

@Injectable()
export class SubscriptionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getCurrent(currentUser: AuthenticatedRequestUser) {
    const now = new Date();
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: currentUser.workspaceId ?? undefined,
      },
      include: {
        plan: {
          include: {
            features: {
              where: { enabled: true },
              include: { feature: true },
            },
            usageLimits: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const targetWorkspaceId = subscription?.workspaceId ?? currentUser.workspaceId ?? null;
    const currentPeriod = this.getCurrentPeriod(now);

    const [tenantUserCount, usageCounters, plans, upgradeRequest] = await Promise.all([
      this.prisma.tenantMember.count({
        where: {
          tenantId: currentUser.tenantId,
        },
      }),
      targetWorkspaceId
        ? this.prisma.usageCounter.findMany({
            where: {
              tenantId: currentUser.tenantId,
              workspaceId: targetWorkspaceId,
              periodStart: { lte: currentPeriod.periodEnd },
              periodEnd: { gte: currentPeriod.periodStart },
              key: {
                in: usageDefinitions.map((item) => item.id),
              },
            },
          })
        : Promise.resolve([]),
      this.prisma.plan.findMany({
        include: {
          features: {
            where: { enabled: true },
            include: { feature: true },
          },
          usageLimits: true,
        },
        orderBy: [{ priceInMinor: "asc" }, { durationMonths: "asc" }, { name: "asc" }],
      }),
      targetWorkspaceId
        ? this.prisma.subscriptionUpgradeRequest.findFirst({
            where: {
              tenantId: currentUser.tenantId,
              workspaceId: targetWorkspaceId,
              status: {
                in: [SubscriptionUpgradeRequestStatus.OPEN, SubscriptionUpgradeRequestStatus.IN_REVIEW],
              },
            },
            include: {
              requestedPlan: true,
            },
            orderBy: [{ updatedAt: "desc" }],
          })
        : Promise.resolve(null),
    ]);

    const usageByKey = new Map(usageCounters.map((counter) => [counter.key, counter.value]));

    return {
      currentPlan: subscription
        ? {
            code: subscription.plan.code,
            name: subscription.plan.name,
            description: subscription.plan.description,
            priceLabel: formatPriceLabel(subscription.plan.priceInMinor, subscription.plan.currencyCode),
            billingLabel: formatBillingLabel(subscription.plan.durationMonths),
          }
        : {
            code: "NO_PLAN",
            name: "No Active Plan",
            description: "Complete onboarding to activate a workspace subscription.",
            priceLabel: "Free",
            billingLabel: "not active",
          },
      status: subscription ? mapStatus(subscription.status, subscription.endsAt, subscription.graceEndsAt, now) : "suspended",
      renewalDate: subscription ? subscription.endsAt.toISOString().slice(0, 10) : now.toISOString().slice(0, 10),
      daysRemaining: subscription ? Math.max(0, Math.ceil((subscription.endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0,
      usages: subscription
        ? usageDefinitions.map((definition) => {
            const rawUsed =
              definition.id === "users"
                ? tenantUserCount
                : usageByKey.get(definition.id) ?? 0;
            const rawLimit = subscription.plan[definition.limitField];
            const used = definition.unit === "GB" ? toGigabytes(rawUsed) : rawUsed;
            const limit = definition.unit === "GB" ? toGigabytes(rawLimit) : rawLimit;
            const percentage = limit > 0 ? used / limit : 0;

            return {
              id: definition.id,
              label: definition.unit ? `${definition.label} (${definition.unit})` : definition.label,
              used,
              limit,
              unit: definition.unit,
              status: percentage >= 1 ? "critical" : percentage >= 0.8 ? "warning" : "ok",
            };
          })
        : [],
      plans: plans.map((plan) => {
        const seed = subscriptionPlanSeeds.find((entry) => entry.code === plan.code);

        return {
          code: plan.code,
          name: plan.name,
          description: plan.description,
          priceLabel: formatPriceLabel(plan.priceInMinor, plan.currencyCode),
          billingLabel: formatBillingLabel(plan.durationMonths),
          isCurrent: subscription?.planId === plan.id,
          isRecommended: seed?.recommended ?? false,
          features: plan.features.map(({ feature }) => feature.label),
          limits: plan.usageLimits
            .filter((limit) =>
              ["users", "workspaces", "stock-items", "monthly-vouchers", "storage-mb"].includes(limit.key),
            )
            .sort((left, right) => left.key.localeCompare(right.key))
            .map((limit) => {
              const metadata = planLimitLabels[limit.key] ?? { label: limit.key };
              const value = metadata.unit === "GB" ? toGigabytes(limit.limit) : limit.limit;
              return {
                key: limit.key,
                label: metadata.unit ? `${metadata.label} (${metadata.unit})` : metadata.label,
                value,
                unit: metadata.unit ?? null,
              };
            }),
        };
      }),
      upgradeRequest: upgradeRequest
        ? {
            id: upgradeRequest.id,
            requestedPlanCode: upgradeRequest.requestedPlan.code,
            requestedPlanName: upgradeRequest.requestedPlan.name,
            status: mapUpgradeRequestStatus(upgradeRequest.status),
            note: upgradeRequest.note,
            submittedAt: upgradeRequest.createdAt.toISOString(),
          }
        : null,
    };
  }

  async requestUpgrade(currentUser: AuthenticatedRequestUser, planCode: string, note?: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: currentUser.workspaceId ?? undefined,
      },
      include: {
        plan: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });

    if (!subscription) {
      throw new BadRequestException("No active subscription found for this workspace");
    }

    const requestedPlan = await this.prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!requestedPlan) {
      throw new BadRequestException("Requested plan is not available");
    }

    if (requestedPlan.id === subscription.planId) {
      throw new BadRequestException("Current plan is already active");
    }

    const existingOpenRequest = await this.prisma.subscriptionUpgradeRequest.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        workspaceId: subscription.workspaceId,
        status: {
          in: [SubscriptionUpgradeRequestStatus.OPEN, SubscriptionUpgradeRequestStatus.IN_REVIEW],
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    const upgradeRequest = existingOpenRequest
      ? await this.prisma.subscriptionUpgradeRequest.update({
          where: { id: existingOpenRequest.id },
          data: {
            requestedPlanId: requestedPlan.id,
            note: note?.trim() || null,
            status: SubscriptionUpgradeRequestStatus.OPEN,
          },
          include: {
            requestedPlan: true,
          },
        })
      : await this.prisma.subscriptionUpgradeRequest.create({
          data: {
            tenantId: currentUser.tenantId,
            companyId: currentUser.companyId,
            workspaceId: subscription.workspaceId,
            subscriptionId: subscription.id,
            requestedPlanId: requestedPlan.id,
            createdByUserId: currentUser.id,
            note: note?.trim() || null,
          },
          include: {
            requestedPlan: true,
          },
        });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      organizationId: currentUser.organizationId,
      companyId: currentUser.companyId,
      workspaceId: subscription.workspaceId,
      userId: currentUser.id,
      action: existingOpenRequest ? "SUBSCRIPTION_UPGRADE_REQUEST_UPDATED" : "SUBSCRIPTION_UPGRADE_REQUEST_CREATED",
      entityType: "SubscriptionUpgradeRequest",
      entityId: upgradeRequest.id,
      newValues: {
        currentPlanCode: subscription.plan.code,
        requestedPlanCode: requestedPlan.code,
        note: upgradeRequest.note,
      },
    });

    // TODO(payment-gateway): there's no live payment gateway wired in yet, so a
    // checkout is treated as paid immediately and the plan activates in the
    // same call. Once a real gateway lands, replace this inline fulfillment
    // with a webhook-driven call to `fulfillUpgradeRequest` after the charge
    // actually clears, and let this method go back to only creating the
    // pending request.
    const activated = await this.fulfillUpgradeRequest(currentUser, subscription, requestedPlan, upgradeRequest.id);

    return {
      id: upgradeRequest.id,
      requestedPlanCode: upgradeRequest.requestedPlan.code,
      requestedPlanName: upgradeRequest.requestedPlan.name,
      status: mapUpgradeRequestStatus(activated.upgradeRequestStatus),
      note: upgradeRequest.note,
      submittedAt: upgradeRequest.createdAt.toISOString(),
    };
  }

  /**
   * Activates `requestedPlan` for real: flips the Subscription over to it,
   * re-derives every Entitlement from the new plan's feature list (enabling
   * what it grants, disabling whatever the old plan granted that this one
   * doesn't), and marks the upgrade request APPROVED. This is the one place
   * that should ever be called once a payment has actually been confirmed.
   */
  private async fulfillUpgradeRequest(
    currentUser: AuthenticatedRequestUser,
    subscription: { id: string; workspaceId: string; plan: { code: string } },
    requestedPlan: { id: string; code: string; durationMonths: number; priceInMinor: number },
    upgradeRequestId: string,
  ) {
    const now = new Date();
    const endsAt = new Date(now.getTime() + requestedPlan.durationMonths * 30 * 24 * 60 * 60 * 1000);
    const status = requestedPlan.priceInMinor > 0 ? SubscriptionStatus.PAID_ACTIVE : SubscriptionStatus.FREE_ACTIVE;

    const updatedSubscription = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: requestedPlan.id,
        status,
        startsAt: now,
        endsAt,
        graceEndsAt: null,
        autoRenews: true,
      },
    });

    const planFeatures = await this.prisma.planFeature.findMany({
      where: { planId: requestedPlan.id, enabled: true },
      include: { feature: { select: { key: true } } },
    });
    const grantedFeatureKeys = new Set(planFeatures.map((planFeature) => planFeature.feature.key));

    const existingEntitlements = await this.prisma.entitlement.findMany({
      where: { tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId: subscription.workspaceId },
    });
    const existingByFeatureKey = new Map(existingEntitlements.map((entitlement) => [entitlement.featureKey, entitlement]));

    for (const featureKey of grantedFeatureKeys) {
      const scopeKey = `${currentUser.tenantId}:${currentUser.companyId}:${subscription.workspaceId}:${featureKey}`;
      await this.prisma.entitlement.upsert({
        where: { scopeKey },
        update: { enabled: true, subscriptionId: updatedSubscription.id },
        create: {
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          workspaceId: subscription.workspaceId,
          subscriptionId: updatedSubscription.id,
          featureKey,
          enabled: true,
          scopeKey,
        },
      });
    }

    for (const [featureKey, entitlement] of existingByFeatureKey) {
      if (!grantedFeatureKeys.has(featureKey) && entitlement.enabled) {
        await this.prisma.entitlement.update({ where: { id: entitlement.id }, data: { enabled: false } });
      }
    }

    const approvedRequest = await this.prisma.subscriptionUpgradeRequest.update({
      where: { id: upgradeRequestId },
      data: { status: SubscriptionUpgradeRequestStatus.APPROVED },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      organizationId: currentUser.organizationId,
      companyId: currentUser.companyId,
      workspaceId: subscription.workspaceId,
      userId: currentUser.id,
      action: "SUBSCRIPTION_ACTIVATED",
      entityType: "Subscription",
      entityId: updatedSubscription.id,
      oldValues: { planCode: subscription.plan.code },
      newValues: { planCode: requestedPlan.code, status, endsAt: endsAt.toISOString() },
    });

    return { subscription: updatedSubscription, upgradeRequestStatus: approvedRequest.status };
  }

  private getCurrentPeriod(now: Date) {
    return {
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
}
