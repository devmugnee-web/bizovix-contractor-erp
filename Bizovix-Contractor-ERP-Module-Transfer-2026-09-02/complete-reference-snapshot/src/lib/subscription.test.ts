import { describe, expect, it } from "vitest";

import { getDaysRemainingFromRenewalDate, normalizeSubscriptionSnapshot } from "@/lib/subscription";
import type { SubscriptionSnapshot } from "@/types/domain";

function createSnapshot(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    currentPlan: {
      code: "FREE_TRIAL_MONTHLY",
      name: "1 Month Free Trial",
      description: "Trial plan",
      priceLabel: "Free",
      billingLabel: "30 days free access",
    },
    status: "free-active",
    renewalDate: "2026-08-20",
    daysRemaining: 30,
    usages: [],
    plans: [],
    upgradeRequest: null,
    ...overrides,
  };
}

describe("subscription helpers", () => {
  it("derives remaining days from the renewal date", () => {
    const now = new Date(2026, 6, 21, 12, 0, 0, 0);

    expect(getDaysRemainingFromRenewalDate("2026-08-20", 99, now)).toBe(30);
  });

  it("updates stale snapshot days remaining from the renewal date", () => {
    const now = new Date(2026, 6, 25, 12, 0, 0, 0);

    expect(normalizeSubscriptionSnapshot(createSnapshot(), now).daysRemaining).toBe(26);
  });

  it("keeps suspended snapshots at zero days remaining", () => {
    const now = new Date(2026, 6, 21, 12, 0, 0, 0);
    const snapshot = createSnapshot({
      currentPlan: {
        code: "NO_PLAN",
        name: "No Active Plan",
        description: "No plan",
        priceLabel: "Free",
        billingLabel: "not active",
      },
      status: "suspended",
      renewalDate: "2026-07-21",
      daysRemaining: 0,
    });

    expect(normalizeSubscriptionSnapshot(snapshot, now).daysRemaining).toBe(0);
  });
});
