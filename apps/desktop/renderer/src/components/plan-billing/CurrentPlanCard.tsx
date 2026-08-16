"use client";
import { AlertTriangle, Crown } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
import type { SubscriptionRecord } from "@bizovix/types";
import { Card, ProgressBar, STATUS_LABEL, STATUS_TONE, formatDate, money } from "./shared";

export function CurrentPlanCard({
  subscription,
  onUpgradeClick,
  onManageClick,
}: {
  subscription: SubscriptionRecord;
  onUpgradeClick: () => void;
  onManageClick: () => void;
}) {
  const isTrial = subscription.status === "TRIALING";
  const isExpired = subscription.status === "EXPIRED";
  const plan = subscription.plan;

  if (isTrial || isExpired) {
    const total = subscription.trialDaysTotal ?? 30;
    const remaining = subscription.trialDaysRemaining ?? 0;
    const elapsed = Math.max(0, total - remaining);
    const percent = total > 0 ? (elapsed / total) * 100 : 100;
    return (
      <Card className="border-biz-blue/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusBadge label={isExpired ? "TRIAL EXPIRED" : "FREE TRIAL"} tone={isExpired ? "danger" : "info"} />
              {plan && <span className="text-[11px] text-biz-muted">Trialing {plan.name}</span>}
            </div>
            <p className="mt-2 text-[22px] font-bold text-biz-text">
              {isExpired ? "Your trial has expired" : `${remaining} Day${remaining === 1 ? "" : "s"} Remaining`}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4 text-[12px] sm:max-w-sm">
              <div>
                <p className="text-biz-muted">Trial Started</p>
                <p className="font-semibold text-biz-text">{formatDate(subscription.trialStartedAt)}</p>
              </div>
              <div>
                <p className="text-biz-muted">Trial Ends</p>
                <p className="font-semibold text-biz-text">{formatDate(subscription.trialEndsAt)}</p>
              </div>
            </div>
            <div className="mt-3 max-w-sm">
              <ProgressBar percent={percent} tone={isExpired ? "red" : remaining <= 5 ? "orange" : "blue"} />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-biz-text">
              {isExpired && <AlertTriangle className="h-4 w-4 text-biz-danger" />}
              {isExpired
                ? "Your trial has expired. Upgrade your plan to continue using all ERP features."
                : "Upgrade now to continue using all ERP features without interruption."}
            </p>
          </div>
          <PrimaryButton onClick={onUpgradeClick} className="shrink-0">
            <Crown className="h-4 w-4" />
            Upgrade to Premium
          </PrimaryButton>
        </div>
      </Card>
    );
  }

  const price = plan ? (subscription.billingCycle === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice) : "0";
  return (
    <Card className="border-biz-blue/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-biz-muted">Current Plan</span>
            <StatusBadge label={STATUS_LABEL[subscription.status] ?? subscription.status} tone={STATUS_TONE[subscription.status] ?? "neutral"} />
          </div>
          <p className="mt-2 text-[22px] font-bold text-biz-text">{plan?.name ?? "—"}</p>
          {plan && (
            <p className="mt-1 text-[13px] text-biz-muted">
              {money(plan.currency, price)} / {subscription.billingCycle === "YEARLY" ? "year" : "month"}
            </p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-4 text-[12px] sm:max-w-md">
            <div>
              <p className="text-biz-muted">Billing Cycle</p>
              <p className="font-semibold capitalize text-biz-text">{subscription.billingCycle.toLowerCase()}</p>
            </div>
            <div>
              <p className="text-biz-muted">Started</p>
              <p className="font-semibold text-biz-text">{formatDate(subscription.startedAt)}</p>
            </div>
            <div>
              <p className="text-biz-muted">Next Billing</p>
              <p className="font-semibold text-biz-text">{formatDate(subscription.currentPeriodEnd)}</p>
            </div>
          </div>
          {subscription.cancelAtPeriodEnd && (
            <p className="mt-3 text-[12px] font-medium text-biz-orange">
              Your subscription will end on {formatDate(subscription.currentPeriodEnd)}.
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <SecondaryButton onClick={onUpgradeClick}>Change Plan</SecondaryButton>
          <SecondaryButton onClick={onManageClick}>Manage Subscription</SecondaryButton>
        </div>
      </div>
    </Card>
  );
}
