"use client";
import * as React from "react";
import { PrimaryButton, SecondaryButton } from "@bizovix/ui";
import { useUpgradePlan } from "@bizovix/api-client";
import type { BillingCycle, PlanRecord, SubscriptionRecord } from "@bizovix/types";
import { Overlay, money } from "./shared";

export function UpgradeModal({
  currentSubscription,
  plan,
  billingCycle,
  onClose,
  onConfirmed,
}: {
  currentSubscription: SubscriptionRecord;
  plan: PlanRecord;
  billingCycle: BillingCycle;
  onClose: () => void;
  onConfirmed: (invoiceId: string) => void;
}) {
  const upgrade = useUpgradePlan();
  const [error, setError] = React.useState("");
  const price = billingCycle === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice;
  const periodDays = billingCycle === "YEARLY" ? 365 : 30;
  const effectiveDate = new Date();
  const nextBilling = new Date(effectiveDate.getTime() + periodDays * 86_400_000);

  async function confirm() {
    setError("");
    try {
      const result = await upgrade.mutateAsync({ planId: plan.id, billingCycle });
      onConfirmed(result.invoiceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit plan change.");
    }
  }

  return (
    <Overlay title="Confirm Plan Change" onClose={onClose}>
      <dl className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <dt className="text-biz-muted">Current Plan</dt>
          <dd className="mt-0.5 font-semibold">{currentSubscription.plan?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-biz-muted">New Plan</dt>
          <dd className="mt-0.5 font-semibold text-biz-blue">{plan.name}</dd>
        </div>
        <div>
          <dt className="text-biz-muted">Billing Cycle</dt>
          <dd className="mt-0.5 font-semibold capitalize">{billingCycle.toLowerCase()}</dd>
        </div>
        <div>
          <dt className="text-biz-muted">Plan Price</dt>
          <dd className="mt-0.5 font-semibold">{money(plan.currency, price)}</dd>
        </div>
        <div>
          <dt className="text-biz-muted">Effective Date</dt>
          <dd className="mt-0.5 font-semibold">{effectiveDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</dd>
        </div>
        <div>
          <dt className="text-biz-muted">Next Billing Date</dt>
          <dd className="mt-0.5 font-semibold">{nextBilling.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</dd>
        </div>
      </dl>
      <div className="mt-4 flex justify-between rounded border border-biz-border bg-biz-bg p-3 text-[13px] font-bold">
        <span>Total Due</span>
        <span>{money(plan.currency, price)}</span>
      </div>
      <p className="mt-3 text-[11px] text-biz-muted">
        An invoice will be generated for this plan change. Since no online payment gateway is configured, please
        complete payment via your selected payment method and it will be verified by an administrator.
      </p>
      {error && <p className="mt-3 text-xs text-biz-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={upgrade.isPending} onClick={confirm}>
          {upgrade.isPending ? "Submitting..." : "Confirm Plan Change"}
        </PrimaryButton>
      </div>
    </Overlay>
  );
}
