"use client";

import * as React from "react";
import Link from "next/link";
import { Award, CheckCircle2, Eye, FileEdit, FileSearch, FilePlus2, Search } from "lucide-react";
import { useRfqStats, useRfqs } from "@bizovix/api-client";
import { DataTable, FilterBar, IconButton, ModuleStatCard, Pagination, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import type { RfqQuery, RfqRecord, RfqStatus } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { RFQ_STATUS_META, RFQ_STATUS_OPTIONS, formatQty } from "@/lib/procurement";

interface FilterDraft {
  search: string;
  status: string;
}

const EMPTY_DRAFT: FilterDraft = { search: "", status: "" };

export default function RfqsPage() {
  useSetBreadcrumb([{ label: "Procurement" }, { label: "RFQs" }]);

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<RfqQuery>({ page: 1, limit: 10 });

  const stats = useRfqStats();
  const rfqs = useRfqs(query);

  function applyFilters(next: FilterDraft = draft) {
    setQuery({ page: 1, limit: 10, search: next.search || undefined, status: (next.status as RfqStatus) || undefined });
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 10 });
  }

  const items = rfqs.data?.items ?? [];
  const meta = rfqs.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-biz-text">RFQs</h1>
          <p className="mt-1 text-[13px] text-biz-muted">Invite suppliers to quote against an approved requisition and record their offers.</p>
        </div>
        <Link href="/procurement/rfqs/create">
          <PrimaryButton>
            <FilePlus2 className="h-4 w-4" />
            New RFQ
          </PrimaryButton>
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard icon={FileSearch} iconClassName="bg-biz-blue-soft text-biz-blue" label="Total RFQs" value={String(stats.data?.total ?? "—")} helper="All Time" />
        <ModuleStatCard icon={Search} iconClassName="bg-biz-warning-soft text-biz-warning" label="Open" value={String(stats.data?.open ?? "—")} helper="Issued, awaiting offers" />
        <ModuleStatCard icon={FileEdit} iconClassName="bg-gray-100 text-biz-muted" label="Closed" value={String(stats.data?.closed ?? "—")} helper="No longer accepting offers" />
        <ModuleStatCard icon={Award} iconClassName="bg-biz-success-soft text-biz-success" label="Awarded" value={String(stats.data?.awarded ?? "—")} helper="Supplier selected & approved" />
      </div>

      <FilterBar>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Search</label>
          <TextInput
            icon={Search}
            placeholder="RFQ number..."
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
            options={RFQ_STATUS_OPTIONS}
          />
        </div>
        <PrimaryButton onClick={() => applyFilters()}>
          <Search className="h-4 w-4" />
          Search
        </PrimaryButton>
        <SecondaryButton onClick={clearFilters}>Clear Filter</SecondaryButton>
      </FilterBar>

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <DataTable<RfqRecord>
          isLoading={rfqs.isLoading}
          data={items}
          rowKey={(row) => row.id}
          emptyMessage="No RFQs yet."
          columns={[
            {
              key: "rfqNo",
              header: "RFQ No.",
              render: (row) => (
                <Link href={"/procurement/rfqs/" + row.id} className="font-medium text-biz-blue hover:underline">
                  {row.rfqNo}
                </Link>
              ),
            },
            { key: "sourcePr", header: "Source PR", render: (row) => row.purchaseRequisition?.prNo ?? "—" },
            { key: "issueDate", header: "Issue Date", render: (row) => formatDate(row.issueDate) },
            { key: "deadline", header: "Deadline", render: (row) => formatDate(row.submissionDeadline) },
            { key: "suppliers", header: "Invited Suppliers", render: (row) => formatQty(row.suppliers.length) },
            { key: "items", header: "Items", render: (row) => formatQty(row.items.length) },
            { key: "status", header: "Status", render: (row) => <StatusBadge label={RFQ_STATUS_META[row.status].label} tone={RFQ_STATUS_META[row.status].tone} /> },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <div className="flex items-center justify-center gap-1">
                  <Link href={"/procurement/rfqs/" + row.id}>
                    <IconButton aria-label="View Details">
                      <Eye className="h-4 w-4" />
                    </IconButton>
                  </Link>
                  {row.status === "DRAFT" && (
                    <Link href={"/procurement/rfqs/" + row.id + "/edit"}>
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
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} totalPages={meta.totalPages} onPageChange={(page) => setQuery((current) => ({ ...current, page }))} />
      </div>
    </div>
  );
}
