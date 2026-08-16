"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { PrimaryButton, SecondaryButton, cn } from "@bizovix/ui";
import type { BillingCycle, PlanRecord } from "@bizovix/types";
import { money } from "./shared";

function limitLabel(value: number | null, unit = "") {
  return value == null ? "Unlimited" : `${value}${unit}`;
}

function storageLabel(mb: number | null) {
  if (mb == null) return "Unlimited";
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)}GB` : `${mb}MB`;
}

export function PlansPricing({
  plans,
  billingCycle,
  onBillingCycleChange,
  onSelectPlan,
}: {
  plans: PlanRecord[];
  billingCycle: BillingCycle;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  onSelectPlan: (plan: PlanRecord) => void;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-biz-text">Plans & Pricing</h2>
        <div className="flex gap-1 rounded-full border border-biz-border bg-white p-1">
          {(["MONTHLY", "YEARLY"] as const).map((cycle) => (
            <button
              key={cycle}
              onClick={() => onBillingCycleChange(cycle)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[11px] font-semibold capitalize",
                billingCycle === cycle ? "bg-biz-blue text-white" : "text-biz-muted hover:bg-biz-bg",
              )}
            >
              {cycle.toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const recommended = plan.code === "PROFESSIONAL";
          const price = billingCycle === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice;
          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-lg border bg-white p-5 shadow-card",
                recommended ? "border-biz-blue ring-1 ring-biz-blue/30" : "border-biz-border",
              )}
            >
              {recommended && (
                <span className="mb-2 inline-flex w-fit items-center rounded-full bg-biz-blue px-2.5 py-0.5 text-[10px] font-bold text-white">
                  RECOMMENDED
                </span>
              )}
              <h3 className="text-[15px] font-bold text-biz-text">{plan.name}</h3>
              <p className="mt-1 text-[11px] text-biz-muted">{plan.description}</p>
              <p className="mt-3 text-[24px] font-bold text-biz-text">
                {money(plan.currency, price)}
                <span className="text-[12px] font-medium text-biz-muted"> / {billingCycle === "YEARLY" ? "year" : "month"}</span>
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded border border-biz-border bg-biz-bg p-2.5 text-center text-[10px]">
                <div>
                  <p className="font-bold text-biz-text">{limitLabel(plan.userLimit)}</p>
                  <p className="text-biz-muted">Users</p>
                </div>
                <div>
                  <p className="font-bold text-biz-text">{storageLabel(plan.storageLimitMb)}</p>
                  <p className="text-biz-muted">Storage</p>
                </div>
                <div>
                  <p className="font-bold text-biz-text">{limitLabel(plan.projectLimit)}</p>
                  <p className="text-biz-muted">Projects</p>
                </div>
              </div>
              <ul className="mt-4 flex-1 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5 text-[11px] text-biz-text">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-biz-success" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                {plan.isCurrent ? (
                  <SecondaryButton disabled className="w-full justify-center">
                    Current Plan
                  </SecondaryButton>
                ) : (
                  <PrimaryButton onClick={() => onSelectPlan(plan)} className="w-full justify-center">
                    {plan.code === "ENTERPRISE" ? "Contact Sales" : "Upgrade / Select Plan"}
                  </PrimaryButton>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
