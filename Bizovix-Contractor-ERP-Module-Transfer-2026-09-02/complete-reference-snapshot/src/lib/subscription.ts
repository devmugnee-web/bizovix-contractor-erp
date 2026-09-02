import type { SubscriptionSnapshot } from "@/types/domain";

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

export function getDaysRemainingFromRenewalDate(renewalDate: string, fallbackDaysRemaining: number, now = new Date()) {
  const parsedRenewalDate = parseLocalDate(renewalDate);

  if (!parsedRenewalDate) {
    return Math.max(0, fallbackDaysRemaining);
  }

  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const renewalUtc = Date.UTC(
    parsedRenewalDate.getFullYear(),
    parsedRenewalDate.getMonth(),
    parsedRenewalDate.getDate(),
  );

  return Math.max(0, Math.round((renewalUtc - todayUtc) / MILLISECONDS_PER_DAY));
}

export function normalizeSubscriptionSnapshot(snapshot: SubscriptionSnapshot, now = new Date()): SubscriptionSnapshot {
  const shouldDeriveDaysRemaining = snapshot.status !== "suspended" || snapshot.daysRemaining > 0;

  if (!shouldDeriveDaysRemaining) {
    return snapshot;
  }

  const daysRemaining = getDaysRemainingFromRenewalDate(snapshot.renewalDate, snapshot.daysRemaining, now);

  if (daysRemaining === snapshot.daysRemaining) {
    return snapshot;
  }

  return {
    ...snapshot,
    daysRemaining,
  };
}
