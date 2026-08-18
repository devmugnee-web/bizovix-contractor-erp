"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Eye, FileEdit, FilePlus2, Search } from "lucide-react";
import { usePurchaseRequisitionStats, usePurchaseRequisitions } from "@bizovix/api-client";
import { DataTable, FilterBar, IconButton, ModuleStatCard, Pagination, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import type { PrPriority, PrStatus, PurchaseRequisitionQuery, PurchaseRequisitionRecord } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { PR_PRIORITY_META, PR_PRIORITY_OPTIONS, PR_STATUS_META, PR_STATUS_OPTIONS, formatQty } from "@/lib/procurement";

interface FilterDraft {
  search: string;
  status: string;
  priority: string;
}

const EMPTY_DRAFT: FilterDraft = { search: "", status: "", priority: "" };

function estimatedTotal(record: PurchaseRequisitionRecord): number {
  return record.items.reduce((sum, item) => sum + Number(item.estimatedAmount ?? 0), 0);
}

export default function PurchaseRequisitionsPage() {
  useSetBreadcrumb([{ label: "Procurement" }, { label: "Purchase Requisitions" }]);

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<PurchaseRequisitionQuery>({ page: 1, limit: 10 });

  const stats = usePurchaseRequisitionStats();
  const requisitions = usePurchaseRequisitions(query);

  function applyFilters(next: FilterDraft = draft) {
    setQuery({
      page: 1,
      limit: 10,
      search: next.search || undefined,
      status: (next.status as PrStatus) || undefined,
      priority: (next.priority as PrPriority) || undefined,
    });
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 10 });
  }

  const items = requisitions.data?.items ?? [];
  const meta = requisitions.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-biz-text">Purchase Requisitions</h1>
          <p className="mt-1 text-[13px] text-biz-muted">Internal requests for materials and services, approved before they reach the market.</p>
        </div>
        <Link href="/procurement/requisitions/create">
          <PrimaryButton>
            <FilePlus2 className="h-4 w-4" />
            New Requisition
          </PrimaryButton>
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard icon={ClipboardList} iconClassName="bg-biz-blue-soft text-biz-blue" label="Total Requisitions" value={String(stats.data?.total ?? "—")} helper="All Time" />
        <ModuleStatCard icon={FileEdit} iconClassName="bg-gray-100 text-biz-muted" label="Draft" value={String(stats.data?.draft ?? "—")} helper="Not yet submitted" />
        <ModuleStatCard icon={Search} iconClassName="bg-biz-warning-soft text-biz-warning" label="Pending Approval" value={String(stats.data?.pendingApproval ?? "—")} helper="Awaiting decision" />
        <ModuleStatCard icon={CheckCircle2} iconClassName="bg-biz-success-soft text-biz-success" label="Approved" value={String(stats.data?.approved ?? "—")} helper="Ready for RFQ" />
      </div>

      <FilterBar>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Search</label>
          <TextInput
            icon={Search}
            placeholder="PR number..."
            value={draft.search}
            onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
            onKeyDown={(event) => event.key === "Enter" && applyFilters()}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Status</label>
          <SelectInput
            className="w-[170px]"
            placeholder="All"
            value={draft.status}
            onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
            options={PR_STATUS_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Priority</label>
          <SelectInput
            className="w-[140px]"
            placeholder="All"
            value={draft.priority}
            onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}
            options={PR_PRIORITY_OPTIONS}
          />
        </div>
        <PrimaryButton onClick={() => applyFilters()}>
          <Search className="h-4 w-4" />
          Search
        </PrimaryButton>
        <SecondaryButton onClick={clearFilters}>Clear Filter</SecondaryButton>
      </FilterBar>

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <DataTable<PurchaseRequisitionRecord>
          isLoading={requisitions.isLoading}
          data={items}
          rowKey={(row) => row.id}
          emptyMessage="No purchase requisitions yet."
          columns={[
            {
              key: "prNo",
              header: "PR No.",
              render: (row) => (
                <Link href={"/procurement/requisitions/" + row.id} className="font-medium text-biz-blue hover:underline">
                  {row.prNo}
                </Link>
              ),
            },
            { key: "date", header: "Date", render: (row) => formatDate(row.requestDate) },
            { key: "project", header: "Project", render: (row) => row.cmsWork?.workName ?? "—" },
            { key: "requestedBy", header: "Requested By", render: (row) => row.department ?? "—" },
            { key: "items", header: "Items", render: (row) => formatQty(row.items.length) },
            { key: "amount", header: "Estimated Amount", render: (row) => formatBDT(estimatedTotal(row)) },
            { key: "requiredBy", header: "Required By", render: (row) => (row.requiredByDate ? formatDate(row.requiredByDate) : "—") },
            {
              key: "priority",
              header: "Priority",
              render: (row) => <StatusBadge label={PR_PRIORITY_META[row.priority].label} tone={PR_PRIORITY_META[row.priority].tone} />,
            },
            { key: "status", header: "Status", render: (row) => <StatusBadge label={PR_STATUS_META[row.status].label} tone={PR_STATUS_META[row.status].tone} /> },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <div className="flex items-center justify-center gap-1">
                  <Link href={"/procurement/requisitions/" + row.id}>
                    <IconButton aria-label="View Details">
                      <Eye className="h-4 w-4" />
                    </IconButton>
                  </Link>
                  {row.status === "DRAFT" && (
                    <Link href={"/procurement/requisitions/" + row.id + "/edit"}>
                      <IconButton aria-label="Edit Draft">
                        <FileEdit className="h-4 w-4" />
                      </IconButton>
                    </Link>
                  )}
                </div>
              ),
            },
          ]}
        />
        <Pagination
          page={meta.page}
          limit={meta.limit}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
        />
      </div>
    </div>
  );
}
