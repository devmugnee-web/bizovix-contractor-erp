"use client";

import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { useProjectBillStats, useProjectBills } from "@bizovix/api-client";
import { DataTable, IconButton, PrimaryButton, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import type { ProjectBillRecord } from "@bizovix/types";
import { BILL_STATUS_META, BILL_TYPE_META } from "@/lib/project-bills";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[140px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

export function RunningBillsPanel({ workId }: { workId: string }) {
  const stats = useProjectBillStats(workId);
  const bills = useProjectBills({ cmsWorkId: workId, limit: 50 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <InfoCard label="Total Bills" value={String(stats.data?.totalBills ?? "—")} />
        <InfoCard label="Gross Certified" value={formatBDT(stats.data?.grossCertified ?? "0")} />
        <InfoCard label="Net Certified" value={formatBDT(stats.data?.netCertified ?? "0")} />
        <InfoCard label="Received" value={formatBDT(stats.data?.received ?? "0")} />
        <InfoCard label="Outstanding" value={formatBDT(stats.data?.outstanding ?? "0")} />
        <InfoCard label="Retention Held" value={formatBDT(stats.data?.retentionHeld ?? "0")} />
      </div>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Running Bills / IPC</h3>
          <Link href={`/cms/bills/create?cmsWorkId=${workId}`}>
            <PrimaryButton>
              <Plus className="h-4 w-4" />
              Add Running Bill
            </PrimaryButton>
          </Link>
        </div>
        <DataTable<ProjectBillRecord>
          isLoading={bills.isLoading}
          data={bills.data?.items ?? []}
          rowKey={(row) => row.id}
          emptyMessage="No running bills created yet."
          columns={[
            {
              key: "billNo",
              header: "Bill No.",
              render: (row) => (
                <Link href={`/cms/bills/${row.id}`} className="font-medium text-biz-blue hover:underline">
                  {row.billNo}
                </Link>
              ),
            },
            { key: "type", header: "Bill Type", render: (row) => BILL_TYPE_META[row.billType] },
            { key: "date", header: "Bill Date", render: (row) => formatDate(row.billDate) },
            { key: "gross", header: "Gross Amount", render: (row) => formatBDT(row.grossBillAmount) },
            { key: "retention", header: "Retention", render: (row) => formatBDT(row.retentionAmount) },
            { key: "net", header: "Net Certified", render: (row) => formatBDT(row.netCertifiedAmount) },
            { key: "received", header: "Received", render: (row) => formatBDT(row.receivedAmount) },
            {
              key: "status",
              header: "Status",
              render: (row) => <StatusBadge label={BILL_STATUS_META[row.status].label} tone={BILL_STATUS_META[row.status].tone} />,
            },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <Link href={`/cms/bills/${row.id}`}>
                  <IconButton aria-label="View Details">
                    <Eye className="h-4 w-4" />
                  </IconButton>
                </Link>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
