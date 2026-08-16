"use client";
import * as React from "react";
import { usePlans, useSubscription, useUsage } from "@bizovix/api-client";
import type { BillingCycle, PlanRecord } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { useBillingNotice } from "./shared";
import { CurrentPlanCard } from "./CurrentPlanCard";
import { UsageCards } from "./UsageCards";
import { PlansPricing } from "./PlansPricing";
import { BillingInfoCards } from "./BillingInfoCards";
import { BillingHistory } from "./BillingHistory";
import { UpgradeModal } from "./UpgradeModal";
import { ManageSubscriptionModal } from "./ManageSubscriptionModal";
import { InvoiceDetailModal } from "./InvoiceDetailModal";

export function PlanBillingPanel() {
  useSetBreadcrumb([{ label: "Plan & Billing" }]);
  const subscription = useSubscription();
  const plans = usePlans();
  const usage = useUsage();
  const { notify, Notice } = useBillingNotice();

  const pricingRef = React.useRef<HTMLDivElement>(null);
  const [billingCycle, setBillingCycle] = React.useState<BillingCycle>("MONTHLY");
  const [billingCycleInitialized, setBillingCycleInitialized] = React.useState(false);
  const [upgradeTarget, setUpgradeTarget] = React.useState<PlanRecord | null>(null);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [newInvoiceId, setNewInvoiceId] = React.useState<string | null>(null);

  if (subscription.data && !billingCycleInitialized) {
    setBillingCycleInitialized(true);
    setBillingCycle((subscription.data.billingCycle as BillingCycle) || "MONTHLY");
  }

  function scrollToPricing() {
    pricingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (subscription.isLoading || plans.isLoading || usage.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (subscription.isError || !subscription.data) {
    return <p className="p-12 text-center text-biz-muted">Unable to load billing information.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <div>
        <h1 className="text-page-title text-biz-text">Plan & Billing</h1>
        <p className="mt-1 text-[13px] text-biz-muted">Manage your subscription, usage, billing and invoices.</p>
      </div>

      <CurrentPlanCard subscription={subscription.data} onUpgradeClick={scrollToPricing} onManageClick={() => setManageOpen(true)} />

      {usage.data && <UsageCards usage={usage.data} />}

      <div ref={pricingRef}>
        <PlansPricing
          plans={plans.data ?? []}
          billingCycle={billingCycle}
          onBillingCycleChange={setBillingCycle}
          onSelectPlan={setUpgradeTarget}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BillingInfoCards notify={notify} />
      </div>

      <BillingHistory />

      {upgradeTarget && (
        <UpgradeModal
          currentSubscription={subscription.data}
          plan={upgradeTarget}
          billingCycle={billingCycle}
          onClose={() => setUpgradeTarget(null)}
          onConfirmed={(invoiceId) => {
            setUpgradeTarget(null);
            notify("Plan change submitted successfully.");
            setNewInvoiceId(invoiceId);
          }}
        />
      )}
      {manageOpen && subscription.data && (
        <ManageSubscriptionModal subscription={subscription.data} onClose={() => setManageOpen(false)} notify={notify} />
      )}
      {newInvoiceId && <InvoiceDetailModal invoiceId={newInvoiceId} onClose={() => setNewInvoiceId(null)} />}
    </div>
  );
}
