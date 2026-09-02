"use client";

import { normalizeSubscriptionSnapshot } from "@/lib/subscription";
import { normalizeWorkspaceSubscriptions } from "@/lib/workspace-subscription";
import { createSeedDataset } from "@/mocks/seed-data";
import type { AppDataset, DataMode, SubscriptionSnapshot } from "@/types/domain";

const storageKeys: Record<Exclude<DataMode, "api">, string> = {
  mock: "bizovix-mock:dataset:v1",
  demo: "bizovix-demo:dataset:v1",
};

function cloneDataset() {
  return structuredClone(createSeedDataset());
}

function normalizeSubscription(subscription: SubscriptionSnapshot) {
  return normalizeSubscriptionSnapshot(subscription);
}

function normalizeDataset(raw: unknown): AppDataset {
  const seed = cloneDataset();
  const parsed = (raw ?? {}) as Partial<AppDataset>;
  const normalizedSubscription = normalizeSubscription(parsed.subscription ?? seed.subscription);

  return {
    ...seed,
    ...parsed,
    workspaces: parsed.workspaces ?? seed.workspaces,
    users: parsed.users ?? seed.users,
    parties: parsed.parties ?? seed.parties,
    stockItems: parsed.stockItems ?? seed.stockItems,
    vouchers: parsed.vouchers ?? seed.vouchers,
    dashboardMetrics: parsed.dashboardMetrics ?? seed.dashboardMetrics,
    trialBalance: parsed.trialBalance ?? seed.trialBalance,
    summary: parsed.summary ?? seed.summary,
    approvals: parsed.approvals ?? seed.approvals,
    quickShortcuts: parsed.quickShortcuts ?? seed.quickShortcuts,
    subscription: normalizedSubscription,
    workspaceSubscriptions: normalizeWorkspaceSubscriptions(
      parsed.workspaces ?? seed.workspaces,
      parsed.workspaceSubscriptions,
      normalizedSubscription,
    ),
  };
}

export function readDataset(mode: Exclude<DataMode, "api">): AppDataset {
  if (typeof window === "undefined") {
    return cloneDataset();
  }

  const storageKey = storageKeys[mode];
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    const initial = cloneDataset();
    window.localStorage.setItem(storageKey, JSON.stringify(initial));
    return initial;
  }

  try {
    const normalized = normalizeDataset(JSON.parse(raw));
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  } catch {
    const reset = cloneDataset();
    window.localStorage.setItem(storageKey, JSON.stringify(reset));
    return reset;
  }
}

export function writeDataset(mode: Exclude<DataMode, "api">, dataset: AppDataset) {
  if (typeof window === "undefined") {
    return normalizeDataset(dataset);
  }

  const normalized = normalizeDataset(dataset);
  window.localStorage.setItem(storageKeys[mode], JSON.stringify(normalized));
  return normalized;
}

export function resetDataset(mode: Exclude<DataMode, "api">) {
  const dataset = cloneDataset();
  return writeDataset(mode, dataset);
}

