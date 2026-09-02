"use client";

import { normalizeSubscriptionSnapshot } from "@/lib/subscription";
import type { AppDataset, SubscriptionPlanSummary, SubscriptionSnapshot } from "@/types/domain";

const DEFAULT_TRIAL_DAYS = 30;

function clonePlan(plan: SubscriptionPlanSummary): SubscriptionPlanSummary {
  return {
    ...plan,
    features: [...plan.features],
    limits: plan.limits.map((limit) => ({ ...limit })),
  };
}

function cloneSnapshot(snapshot: SubscriptionSnapshot): SubscriptionSnapshot {
  return {
    ...snapshot,
    currentPlan: { ...snapshot.currentPlan },
    usages: snapshot.usages.map((usage) => ({ ...usage })),
    plans: snapshot.plans.map(clonePlan),
    upgradeRequest: snapshot.upgradeRequest ? { ...snapshot.upgradeRequest } : null,
  };
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function findFreeTrialPlan(base: SubscriptionSnapshot) {
  return base.plans.find((plan) => plan.code.startsWith("FREE")) ?? base.plans[0];
}

function applyPlanLimits(snapshot: SubscriptionSnapshot, plan: SubscriptionPlanSummary) {
  const limitMap = new Map(plan.limits.map((limit) => [limit.key, limit.value]));

  snapshot.usages = snapshot.usages.map((usage) => ({
    ...usage,
    limit: limitMap.get(usage.id) ?? usage.limit,
  }));
}

export function createTrialWorkspaceSubscription(base: SubscriptionSnapshot, now = new Date()) {
  const freePlan = findFreeTrialPlan(base);
  const trialSnapshot = cloneSnapshot(base);

  trialSnapshot.plans = trialSnapshot.plans.map((plan) => ({
    ...plan,
    isCurrent: plan.code === freePlan.code,
  }));
  trialSnapshot.currentPlan = {
    code: freePlan.code,
    name: freePlan.name,
    description: freePlan.description,
    priceLabel: freePlan.priceLabel,
    billingLabel: freePlan.billingLabel,
  };
  trialSnapshot.status = "free-active";
  trialSnapshot.renewalDate = addDays(now, DEFAULT_TRIAL_DAYS).toISOString().slice(0, 10);
  trialSnapshot.daysRemaining = DEFAULT_TRIAL_DAYS;
  trialSnapshot.upgradeRequest = null;
  applyPlanLimits(trialSnapshot, freePlan);

  return normalizeSubscriptionSnapshot(trialSnapshot, now);
}

export function normalizeWorkspaceSubscriptions(
  workspaces: AppDataset["workspaces"],
  workspaceSubscriptions: Record<string, SubscriptionSnapshot> | undefined,
  fallbackSubscription: SubscriptionSnapshot,
) {
  const normalizedEntries = workspaces.map((workspace) => {
    const existing = workspaceSubscriptions?.[workspace.id];
    const snapshot = existing
      ? normalizeSubscriptionSnapshot(cloneSnapshot(existing))
      : createTrialWorkspaceSubscription(fallbackSubscription);
    return [workspace.id, snapshot] as const;
  });

  return Object.fromEntries(normalizedEntries);
}

export function getWorkspaceSubscriptionSnapshot(dataset: AppDataset, workspaceId: string | null | undefined) {
  const fallbackWorkspaceId = workspaceId ?? dataset.workspaces[0]?.id ?? null;
  if (!fallbackWorkspaceId) {
    return normalizeSubscriptionSnapshot(cloneSnapshot(dataset.subscription));
  }

  const existing = dataset.workspaceSubscriptions?.[fallbackWorkspaceId];
  if (existing) {
    return normalizeSubscriptionSnapshot(cloneSnapshot(existing));
  }

  return createTrialWorkspaceSubscription(dataset.subscription);
}

export function setWorkspaceSubscriptionSnapshot(
  dataset: AppDataset,
  workspaceId: string,
  snapshot: SubscriptionSnapshot,
) {
  const normalized = normalizeSubscriptionSnapshot(cloneSnapshot(snapshot));
  dataset.workspaceSubscriptions = {
    ...dataset.workspaceSubscriptions,
    [workspaceId]: normalized,
  };
  return normalized;
}

export function isWorkspaceTrialExpired(snapshot: SubscriptionSnapshot) {
  return snapshot.currentPlan.code.startsWith("FREE") && snapshot.daysRemaining <= 0;
}

export function isWorkspaceBlocked(snapshot: SubscriptionSnapshot) {
  return snapshot.status === "suspended" || isWorkspaceTrialExpired(snapshot);
}
