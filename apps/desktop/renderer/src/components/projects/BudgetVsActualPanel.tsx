"use client";

import { useBudgetVsActual } from "@bizovix/api-client";
import { DataTable, StatusBadge, type StatusBadgeTone } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { BudgetVsActualRow } from "@bizovix/types";

const STATUS_TONE: Record<BudgetVsActualRow["status"], StatusBadgeTone> = {
  "Within Budget": "success",
  "Near Limit": "warning",
  "Over Budget": "danger",
};

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

export function BudgetVsActualPanel({ workId }: { workId: string }) {
  const data = useBudgetVsActual(workId);

  if (data.isLoading) return <p className="text-[13px] text-biz-muted">Loading budget vs actual...</p>;

  if (!data.data?.hasApprovedBudget) {
    return (
      <div className="rounded-lg border border-biz-border bg-biz-surface p-6 text-center text-[13px] text-biz-muted">
        No approved budget yet. Approve a budget version to see Budget vs Actual comparison.
      </div>
    );
  }

  const { rows, totals } = data.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <InfoCard label="Total Budget" value={formatBDT(totals.budget)} />
        <InfoCard label="Total Actual" value={formatBDT(totals.actual)} />
        <InfoCard label="Total Variance" value={formatBDT(totals.variance)} />
      </div>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Budget vs Actual</h3>
        </div>
        <DataTable<BudgetVsActualRow>
          data={rows}
          rowKey={(row) => row.category}
          emptyMessage="No budget categories to compare yet."
          columns={[
            { key: "category", header: "Category", render: (row) => row.category },
            { key: "budget", header: "Budget", render: (row) => formatBDT(row.budget) },
            { key: "actual", header: "Actual", render: (row) => formatBDT(row.actual) },
            { key: "variance", header: "Variance", render: (row) => formatBDT(row.variance) },
            { key: "variancePct", header: "Variance %", render: (row) => `${row.variancePct}%` },
            {
              key: "status",
              header: "Status",
              render: (row) => <StatusBadge label={row.status} tone={STATUS_TONE[row.status]} />,
            },
          ]}
        />
      </section>
    </div>
  );
}
