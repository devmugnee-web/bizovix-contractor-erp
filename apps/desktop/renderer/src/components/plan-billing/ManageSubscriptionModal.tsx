"use client";
import * as React from "react";
import { PrimaryButton, SecondaryButton } from "@bizovix/ui";
import { useCancelSubscription, useResumeSubscription } from "@bizovix/api-client";
import type { SubscriptionRecord } from "@bizovix/types";
import { Overlay, formatDate, money } from "./shared";

export function ManageSubscriptionModal({
  subscription,
  onClose,
  notify,
}: {
  subscription: SubscriptionRecord;
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const cancel = useCancelSubscription();
  const resume = useResumeSubscription();
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const plan = subscription.plan;

  async function confirmCancel() {
    await cancel.mutateAsync(undefined);
    notify("Your subscription will remain active until the end of the current billing period.");
    onClose();
  }

  async function confirmResume() {
    await resume.mutateAsync();
    notify("Subscription cancellation reversed.");
    onClose();
  }

  if (confirmingCancel) {
    return (
      <Overlay title="Cancel Subscription" onClose={() => setConfirmingCancel(false)}>
        <p className="text-[13px] text-biz-text">
          Your subscription will remain active until the end of the current billing period
          {subscription.currentPeriodEnd ? ` (${formatDate(subscription.currentPeriodEnd)})` : ""}. You will not be
          charged again unless you resume before then.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setConfirmingCancel(false)}>Go Back</SecondaryButton>
          <PrimaryButton disabled={cancel.isPending} onClick={confirmCancel}>
            {cancel.isPending ? "Cancelling..." : "Confirm Cancellation"}
          </PrimaryButton>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay title="Manage Subscription" onClose={onClose}>
      <dl className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <dt className="text-biz-muted">Plan</dt>
          <dd className="mt-0.5 font-semibold">{plan?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-biz-muted">Price</dt>
          <dd className="mt-0.5 font-semibold">
            {plan ? money(plan.currency, subscription.billingCycle === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-biz-muted">Billing Cycle</dt>
          <dd className="mt-0.5 font-semibold capitalize">{subscription.billingCycle.toLowerCase()}</dd>
        </div>
        <div>
          <dt className="text-biz-muted">Next Billing Date</dt>
          <dd className="mt-0.5 font-semibold">{formatDate(subscription.currentPeriodEnd)}</dd>
        </div>
      </dl>

      {subscription.cancelAtPeriodEnd ? (
        <div className="mt-5 rounded border border-biz-orange/30 bg-biz-orange/5 p-3">
          <p className="text-[12px] text-biz-text">
            This subscription is scheduled to cancel on {formatDate(subscription.currentPeriodEnd)}.
          </p>
          <div className="mt-3 flex justify-end">
            <PrimaryButton disabled={resume.isPending} onClick={confirmResume}>
              {resume.isPending ? "Resuming..." : "Resume Subscription"}
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex items-center justify-between border-t border-biz-border pt-4">
          <p className="text-[11px] text-biz-muted">Need to stop your subscription?</p>
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className="text-[11px] font-semibold text-biz-danger underline-offset-2 hover:underline"
          >
            Cancel Subscription
          </button>
        </div>
      )}
    </Overlay>
  );
}
