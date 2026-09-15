"use client";

import { useState, type FormEvent } from "react";
import { useDashboard, useMe, useSetDashboardTarget } from "@bizovix/api-client";
import { PrimaryButton, SecondaryButton, cn } from "@bizovix/ui";
import { Modal } from "@/components/layout/Modal";
import { DashboardKpiRow } from "@/components/dashboard/DashboardKpiRow";
import { TargetVsAchievementCard } from "@/components/dashboard/TargetVsAchievementCard";
import { TenderPerformanceCard } from "@/components/dashboard/TenderPerformanceCard";
import { BusinessByCategoryCard } from "@/components/dashboard/BusinessByCategoryCard";
import { UpcomingRemindersCard } from "@/components/dashboard/UpcomingRemindersCard";
import { RecentTransactionsCard } from "@/components/dashboard/RecentTransactionsCard";
import { TopProjectsCard } from "@/components/dashboard/TopProjectsCard";

type PeriodPreset = "THIS_MONTH" | "LAST_MONTH" | "THIS_YEAR" | "LAST_YEAR" | "CUSTOM";
type PeriodState = { preset: PeriodPreset; customFrom: string; customTo: string };

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  THIS_MONTH: "This Month",
  LAST_MONTH: "Last Month",
  THIS_YEAR: "This Year",
  LAST_YEAR: "Last Year",
  CUSTOM: "Custom Range",
};

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function presetRange(preset: PeriodPreset) {
  const today = new Date();
  if (preset === "LAST_MONTH") {
    return {
      from: localDateValue(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: localDateValue(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  if (preset === "THIS_YEAR") {
    return {
      from: localDateValue(new Date(today.getFullYear(), 0, 1)),
      to: localDateValue(new Date(today.getFullYear(), 11, 31)),
    };
  }
  if (preset === "LAST_YEAR") {
    return {
      from: localDateValue(new Date(today.getFullYear() - 1, 0, 1)),
      to: localDateValue(new Date(today.getFullYear() - 1, 11, 31)),
    };
  }
  return {
    from: localDateValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: localDateValue(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

function initialPeriod(preset: PeriodPreset): PeriodState {
  const range = presetRange(preset);
  return { preset, customFrom: range.from, customTo: range.to };
}

function selectedRange(period: PeriodState) {
  return period.preset === "CUSTOM"
    ? { from: period.customFrom, to: period.customTo }
    : presetRange(period.preset);
}

function monthEndValue(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  return localDateValue(new Date(year!, month!, 0));
}

function targetPeriodDraft(period: PeriodState): PeriodState {
  if (period.preset !== "CUSTOM") return period;
  const fromMonth = period.customFrom.slice(0, 7);
  const toMonth = period.customTo.slice(0, 7);
  return {
    ...period,
    customFrom: `${fromMonth}-01`,
    customTo: monthEndValue(toMonth),
  };
}

function PeriodSelect({
  period,
  onChange,
  label,
}: {
  period: PeriodState;
  onChange: (period: PeriodState) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={period.preset}
      onChange={(event) => onChange({ ...period, preset: event.target.value as PeriodPreset })}
      className="h-7 max-w-[112px] rounded-md border border-slate-300 bg-white px-1.5 text-[10px] font-semibold text-biz-text outline-none focus:border-biz-blue sm:max-w-[124px] lg:text-[11px] 2xl:h-8 2xl:max-w-[142px] 2xl:px-2.5 2xl:text-[12px]"
    >
      <option value="THIS_MONTH">This Month</option>
      <option value="LAST_MONTH">Last Month</option>
      <option value="THIS_YEAR">This Year</option>
      <option value="LAST_YEAR">Last Year</option>
      <option value="CUSTOM">Custom Range</option>
    </select>
  );
}

function CustomDateRange({
  period,
  onChange,
}: {
  period: PeriodState;
  onChange: (period: PeriodState) => void;
}) {
  if (period.preset !== "CUSTOM") return null;
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-50 p-1 ring-1 ring-inset ring-slate-100 2xl:gap-2 2xl:p-1.5">
      <label className="flex min-w-0 items-center gap-1 text-[9px] font-medium text-slate-600 sm:text-[10px] 2xl:text-[11px]">
        From
        <input
          type="date"
          value={period.customFrom}
          max={period.customTo}
          onChange={(event) =>
            event.target.value && onChange({ ...period, customFrom: event.target.value })
          }
          className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 text-[9px] font-medium text-biz-text outline-none focus:border-biz-blue sm:text-[10px] 2xl:h-7 2xl:px-2 2xl:text-[11px]"
        />
      </label>
      <label className="flex min-w-0 items-center gap-1 text-[9px] font-medium text-slate-600 sm:text-[10px] 2xl:text-[11px]">
        To
        <input
          type="date"
          value={period.customTo}
          min={period.customFrom}
          onChange={(event) =>
            event.target.value && onChange({ ...period, customTo: event.target.value })
          }
          className="h-6 min-w-0 flex-1 rounded border border-slate-300 bg-white px-1 text-[9px] font-medium text-biz-text outline-none focus:border-biz-blue sm:text-[10px] 2xl:h-7 2xl:px-2 2xl:text-[11px]"
        />
      </label>
    </div>
  );
}

function SetTargetModal({
  initialPeriod,
  initialAmount,
  onClose,
  onSaved,
}: {
  initialPeriod: PeriodState;
  initialAmount: string;
  onClose: () => void;
  onSaved: (period: PeriodState) => void;
}) {
  const [period, setPeriod] = useState<PeriodState>(() => targetPeriodDraft(initialPeriod));
  const [amount, setAmount] = useState(initialAmount);
  const setTarget = useSetDashboardTarget();
  const range = selectedRange(period);
  const numericAmount = Number(amount);
  const canSave = Number.isFinite(numericAmount) && numericAmount > 0;

  function changePreset(preset: PeriodPreset) {
    setPeriod((current) => ({ ...current, preset }));
    setAmount("");
  }

  function changeFromMonth(monthValue: string) {
    if (!monthValue) return;
    setPeriod((current) => {
      const nextFrom = `${monthValue}-01`;
      const currentToMonth = current.customTo.slice(0, 7);
      return {
        ...current,
        customFrom: nextFrom,
        customTo: currentToMonth < monthValue ? monthEndValue(monthValue) : current.customTo,
      };
    });
  }

  function changeToMonth(monthValue: string) {
    if (!monthValue) return;
    setPeriod((current) => ({ ...current, customTo: monthEndValue(monthValue) }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    await setTarget.mutateAsync({
      dateFrom: range.from,
      dateTo: range.to,
      targetAmount: numericAmount,
    });
    onSaved(period);
  }

  return (
    <Modal
      open
      onClose={() => !setTarget.isPending && onClose()}
      title="Set Target"
      contentClassName="max-h-[90dvh] overflow-y-auto"
    >
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <p className="text-[12px] leading-relaxed text-slate-600">
          Select a period and set its total achievement target. The Target card filter will match
          this period after saving.
        </p>
        <label className="block space-y-1.5">
          <span className="text-[12px] font-semibold text-biz-text">
            Target Period <span className="text-biz-danger">*</span>
          </span>
          <select
            value={period.preset}
            onChange={(event) => changePreset(event.target.value as PeriodPreset)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-biz-text outline-none focus:border-biz-blue focus:ring-2 focus:ring-blue-100"
          >
            <option value="THIS_MONTH">This Month</option>
            <option value="THIS_YEAR">This Year</option>
            <option value="CUSTOM">Custom Range</option>
          </select>
        </label>
        {period.preset === "CUSTOM" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0 space-y-1.5">
              <span className="text-[12px] font-semibold text-biz-text">
                From Month <span className="text-biz-danger">*</span>
              </span>
              <input
                type="month"
                required
                min="2000-01"
                max={period.customTo.slice(0, 7)}
                value={period.customFrom.slice(0, 7)}
                onChange={(event) => changeFromMonth(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-[12px] text-biz-text outline-none focus:border-biz-blue focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block min-w-0 space-y-1.5">
              <span className="text-[12px] font-semibold text-biz-text">
                To Month <span className="text-biz-danger">*</span>
              </span>
              <input
                type="month"
                required
                min={period.customFrom.slice(0, 7)}
                max="2100-12"
                value={period.customTo.slice(0, 7)}
                onChange={(event) => changeToMonth(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-[12px] text-biz-text outline-none focus:border-biz-blue focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
        )}
        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-biz-blue">
            Selected Period
          </p>
          <p className="mt-1 text-[14px] font-bold text-biz-text">{PERIOD_LABELS[period.preset]}</p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {range.from} to {range.to}
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-[12px] font-semibold text-biz-text">
            Target Amount (BDT) <span className="text-biz-danger">*</span>
          </span>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            inputMode="decimal"
            autoFocus
            placeholder="Enter target amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-[13px] text-biz-text outline-none focus:border-biz-blue focus:ring-2 focus:ring-blue-100"
          />
        </label>
        {range.from.slice(0, 7) !== range.to.slice(0, 7) && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            The total target will be distributed evenly across the included months. Existing targets
            for those months will be updated.
          </p>
        )}
        {setTarget.isError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[11px] text-biz-danger">
            {setTarget.error instanceof Error ? setTarget.error.message : "Could not save target."}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <SecondaryButton type="button" onClick={onClose} disabled={setTarget.isPending}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={!canSave || setTarget.isPending}>
            {setTarget.isPending ? "Saving..." : "Save Target"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

export default function DashboardPage() {
  const me = useMe();
  const [targetPeriod, setTargetPeriod] = useState<PeriodState>(() => initialPeriod("THIS_YEAR"));
  const [tenderPeriod, setTenderPeriod] = useState<PeriodState>(() => initialPeriod("THIS_YEAR"));
  const [businessPeriod, setBusinessPeriod] = useState<PeriodState>(() =>
    initialPeriod("THIS_YEAR"),
  );
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const targetRange = selectedRange(targetPeriod);
  const tenderRange = selectedRange(tenderPeriod);
  const businessRange = selectedRange(businessPeriod);
  const hasCustomPeriod =
    targetPeriod.preset === "CUSTOM" ||
    tenderPeriod.preset === "CUSTOM" ||
    businessPeriod.preset === "CUSTOM";
  const dashboard = useDashboard({
    targetDateFrom: targetRange.from,
    targetDateTo: targetRange.to,
    tenderDateFrom: tenderRange.from,
    tenderDateTo: tenderRange.to,
    businessDateFrom: businessRange.from,
    businessDateTo: businessRange.to,
  });
  const canManageTarget = me.data?.permissions.includes("settings.manage") ?? false;

  return (
    <div
      className={cn(
        "dashboard-workspace mx-auto grid h-full min-h-0 w-full max-w-[1680px] gap-2 overflow-hidden 2xl:max-w-[1760px] 2xl:gap-3",
        hasCustomPeriod
          ? "grid-rows-[auto_minmax(0,1.08fr)_minmax(0,0.92fr)]"
          : "grid-rows-[auto_minmax(0,0.9fr)_minmax(0,1.1fr)]",
      )}
    >
      {dashboard.isLoading && <p className="text-[13px] text-biz-muted">Loading dashboard...</p>}
      {dashboard.isError && (
        <p className="text-[13px] text-biz-danger">Failed to load dashboard data.</p>
      )}

      {dashboard.data && (
        <>
          <DashboardKpiRow kpis={dashboard.data.kpis} />

          <div className="grid min-h-0 grid-cols-3 gap-2 xl:grid-cols-[0.92fr_0.92fr_1.35fr] 2xl:gap-3">
            <TargetVsAchievementCard
              data={dashboard.data.targetVsAchievement}
              periodControl={
                <PeriodSelect
                  period={targetPeriod}
                  onChange={setTargetPeriod}
                  label="Target analytics period"
                />
              }
              customDateRange={
                targetPeriod.preset === "CUSTOM" ? (
                  <CustomDateRange period={targetPeriod} onChange={setTargetPeriod} />
                ) : undefined
              }
              onSetTarget={canManageTarget ? () => setTargetModalOpen(true) : undefined}
            />
            <TenderPerformanceCard
              data={dashboard.data.tenderPerformance}
              periodControl={
                <PeriodSelect
                  period={tenderPeriod}
                  onChange={setTenderPeriod}
                  label="Tender analytics period"
                />
              }
              customDateRange={
                tenderPeriod.preset === "CUSTOM" ? (
                  <CustomDateRange period={tenderPeriod} onChange={setTenderPeriod} />
                ) : undefined
              }
            />
            <BusinessByCategoryCard
              data={dashboard.data.businessByCategory}
              periodControl={
                <PeriodSelect
                  period={businessPeriod}
                  onChange={setBusinessPeriod}
                  label="Business category analytics period"
                />
              }
              customDateRange={
                businessPeriod.preset === "CUSTOM" ? (
                  <CustomDateRange period={businessPeriod} onChange={setBusinessPeriod} />
                ) : undefined
              }
            />
          </div>

          <div className="grid min-h-0 grid-cols-3 gap-2 2xl:gap-3">
            <UpcomingRemindersCard items={dashboard.data.upcomingReminders} />
            <RecentTransactionsCard items={dashboard.data.recentTransactions} />
            <TopProjectsCard items={dashboard.data.topProjects} />
          </div>

          {targetModalOpen && (
            <SetTargetModal
              initialPeriod={targetPeriod}
              initialAmount={
                Number(dashboard.data.targetVsAchievement.target) > 0
                  ? dashboard.data.targetVsAchievement.target
                  : ""
              }
              onClose={() => setTargetModalOpen(false)}
              onSaved={(period) => {
                setTargetPeriod(period);
                setTargetModalOpen(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
