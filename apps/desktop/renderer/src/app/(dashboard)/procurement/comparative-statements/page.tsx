"use client";

import Link from "next/link";
import { CheckCircle2, Eye, ScrollText, Search } from "lucide-react";
import { useComparativeStatementStats, useComparativeStatements } from "@bizovix/api-client";
import { DataTable, IconButton, ModuleStatCard, StatusBadge } from "@bizovix/ui";
import type { ComparativeStatementRecord } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { CS_STATUS_META } from "@/lib/procurement";

export default function ComparativeStatementsPage() {
  useSetBreadcrumb([{ label: "Procurement" }, { label: "Comparative Statements" }]);

  const stats = useComparativeStatementStats();
  const list = useComparativeStatements();
  const items = list.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title text-biz-text">Comparative Statements</h1>
        <p className="mt-1 text-[13px] text-biz-muted">Compare supplier offers side by side, then select and approve a supplier on the record.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard icon={ScrollText} iconClassName="bg-biz-blue-soft text-biz-blue" label="Total" value={String(stats.data?.total ?? "—")} helper="All Time" />
        <ModuleStatCard icon={Search} iconClassName="bg-biz-warning-soft text-biz-warning" label="Pending Evaluation" value={String(stats.data?.pendingEvaluation ?? "—")} helper="Draft or Evaluated" />
        <ModuleStatCard icon={CheckCircle2} iconClassName="bg-biz-success-soft text-biz-success" label="Approved" value={String(stats.data?.approved ?? "—")} helper="Supplier selected & approved" />
      </div>

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <DataTable<ComparativeStatementRecord>
          isLoading={list.isLoading}
          data={items}
          rowKey={(row) => row.id}
          emptyMessage="No Comparative Statements yet. Build one from an Issued RFQ once quotations are recorded."
          columns={[
            {
              key: "csNo",
              header: "CS No.",
              render: (row) => (
                <Link href={"/procurement/comparative-statements/" + row.id} className="font-medium text-biz-blue hover:underline">
                  {row.csNo}
                </Link>
              ),
            },
            { key: "rfq", header: "RFQ", render: (row) => row.rfq.rfqNo },
            { key: "project", header: "Project", render: (row) => row.cmsWork?.workName ?? "—" },
            { key: "suppliers", header: "Suppliers Compared", render: (row) => String(row.suppliers.length) },
            {
              key: "selected",
              header: "Selected Supplier",
              render: (row) => row.suppliers.find((supplier) => supplier.isSelected)?.supplier.name ?? "—",
            },
            { key: "status", header: "Status", render: (row) => <StatusBadge label={CS_STATUS_META[row.status].label} tone={CS_STATUS_META[row.status].tone} /> },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <Link href={"/procurement/comparative-statements/" + row.id}>
                  <IconButton aria-label="View Details">
                    <Eye className="h-4 w-4" />
                  </IconButton>
                </Link>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
