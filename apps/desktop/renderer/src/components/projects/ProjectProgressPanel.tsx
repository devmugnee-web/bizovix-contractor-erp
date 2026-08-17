"use client";

import { useProjectProgress } from "@bizovix/api-client";
import { DataTable } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { ProjectProgressItem } from "@bizovix/types";

function InfoCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
      {helper && <p className="mt-0.5 text-[10px] text-biz-muted">{helper}</p>}
    </div>
  );
}

export function ProjectProgressPanel({ workId }: { workId: string }) {
  const progress = useProjectProgress(workId);

  if (progress.isLoading) return <p className="text-[13px] text-biz-muted">Loading progress...</p>;
  if (!progress.data) return <div className="p-12 text-center text-biz-muted">Progress data could not be loaded.</div>;

  const p = progress.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <InfoCard label="Physical / BOQ Progress" value={`${p.physicalProgressPct}%`} helper="Certified BOQ value / Current approved BOQ value" />
        <InfoCard label="Financial / Billing Progress" value={`${p.financialProgressPct}%`} helper="Net certified / Current contract value" />
        <InfoCard label="Collection Progress" value={`${p.collectionProgressPct}%`} helper="Received / Net certified" />
      </div>
      <div className="flex flex-wrap gap-4">
        <InfoCard label="Gross Certified" value={formatBDT(p.grossCertified)} />
        <InfoCard label="Net Certified" value={formatBDT(p.netCertified)} />
        <InfoCard label="Received" value={formatBDT(p.received)} />
        <InfoCard label="Outstanding" value={formatBDT(p.outstanding)} />
        <InfoCard label="Retention Held" value={formatBDT(p.retentionHeld)} />
      </div>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">BOQ Execution Progress</h3>
        </div>
        <DataTable<ProjectProgressItem>
          data={p.items}
          rowKey={(row) => row.id}
          emptyMessage="No BOQ items on this project yet."
          columns={[
            { key: "description", header: "BOQ Item", render: (row) => row.description },
            { key: "contractQty", header: "Contract Qty", render: (row) => `${row.contractQty} ${row.unit}` },
            { key: "executedQty", header: "Executed Qty", render: (row) => `${row.executedQty} ${row.unit}` },
            { key: "remainingQty", header: "Remaining Qty", render: (row) => `${row.remainingQty} ${row.unit}` },
            { key: "progressPct", header: "Progress %", render: (row) => `${row.progressPct}%` },
            { key: "certifiedValue", header: "Certified Value", render: (row) => formatBDT(row.certifiedValue) },
          ]}
        />
      </section>
    </div>
  );
}
