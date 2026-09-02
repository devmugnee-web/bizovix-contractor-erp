import { getDataProvider } from "@/services/data-provider";
import { readDataset, writeDataset } from "@/services/browser-dataset";
import { normalizeSubscriptionSnapshot } from "@/lib/subscription";
import {
  getWorkspaceSubscriptionSnapshot,
  setWorkspaceSubscriptionSnapshot,
} from "@/lib/workspace-subscription";
import type { SubscriptionUpgradeInput } from "@/types/api";
import type { DataMode } from "@/types/domain";

export interface SubscriptionPurchaseInput {
  planCode: string;
  desktopQuantity: number;
  desktopBillingTerm: "yearly" | "three-year";
  mobileQuantity: number;
  mobileBillingTerm: "yearly" | "three-year";
  workspaceId: string;
  workspaceName: string;
  businessType: string;
  businessCategory: string;
  note?: string;
}

export function getSubscription(mode: DataMode, workspaceId?: string | null) {
  return getDataProvider(mode).subscription.get(workspaceId).then((snapshot) => normalizeSubscriptionSnapshot(snapshot));
}

export function requestSubscriptionUpgrade(mode: DataMode, input: SubscriptionUpgradeInput, workspaceId?: string | null) {
  return getDataProvider(mode).subscription.requestUpgrade(input, workspaceId);
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function getUsageStatus(used: number, limit: number) {
  if (used >= limit) {
    return "critical";
  }

  if (used >= limit * 0.8) {
    return "warning";
  }

  return "ok";
}

export async function purchaseSubscription(mode: DataMode, input: SubscriptionPurchaseInput) {
  if (mode === "api") {
    return requestSubscriptionUpgrade(mode, {
      planCode: input.planCode,
      note: `Checkout request | Workspace: ${input.workspaceName} (${input.workspaceId}); Business: ${input.businessType}; Category: ${input.businessCategory}; Desktop: ${input.desktopQuantity} (${input.desktopBillingTerm}); Mobile: ${input.mobileQuantity} (${input.mobileBillingTerm}); Note: ${input.note || "N/A"}`,
    });
  }

  const dataset = readDataset(mode);
  const currentSnapshot = getWorkspaceSubscriptionSnapshot(dataset, input.workspaceId);
  const purchasedPlan = currentSnapshot.plans.find((plan) => plan.code === input.planCode);

  if (!purchasedPlan) {
    throw new Error("Selected plan is not available");
  }

  const now = new Date();
  const renewalDays =
    input.desktopBillingTerm === "three-year" || input.mobileBillingTerm === "three-year" ? 365 * 3 : 365;
  const limitMap = new Map(purchasedPlan.limits.map((limit) => [limit.key, limit.value]));
  const renewalDate = addDays(now, renewalDays);

  const nextSnapshot = normalizeSubscriptionSnapshot({
    ...currentSnapshot,
    plans: currentSnapshot.plans.map((plan) => ({
      ...plan,
      isCurrent: plan.code === purchasedPlan.code,
    })),
    currentPlan: {
      code: purchasedPlan.code,
      name: purchasedPlan.name,
      description: purchasedPlan.description,
      priceLabel: purchasedPlan.priceLabel,
      billingLabel: renewalDays > 365 ? "device terms up to 36 months" : "every 12 months",
    },
    status: purchasedPlan.code.startsWith("FREE") ? "free-active" : "paid-active",
    renewalDate: renewalDate.toISOString().slice(0, 10),
    daysRemaining: renewalDays,
    upgradeRequest: null,
    usages: currentSnapshot.usages.map((usage) => {
      const nextLimit = limitMap.get(usage.id) ?? usage.limit;
      return {
        ...usage,
        limit: nextLimit,
        status: getUsageStatus(usage.used, nextLimit),
      };
    }),
  });

  setWorkspaceSubscriptionSnapshot(dataset, input.workspaceId, nextSnapshot);
  dataset.subscription = nextSnapshot;
  writeDataset(mode, dataset);
  return nextSnapshot;
}
