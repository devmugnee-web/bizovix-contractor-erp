"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Eye, FilePlus2, PackageX, Search, Truck } from "lucide-react";
import { useGoodsReceiptStats, useGoodsReceipts } from "@bizovix/api-client";
import { DataTable, FilterBar, IconButton, ModuleStatCard, Pagination, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import type { GrnInspectionStatus, GrnQuery, GrnRecord } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { GRN_INSPECTION_META, GRN_INSPECTION_OPTIONS } from "@/lib/procurement";

interface FilterDraft {
  search: string;
  inspectionStatus: string;
}

const EMPTY_DRAFT: FilterDraft = { search: "", inspectionStatus: "" };

export default function GrnsPage() {
  useSetBreadcrumb([{ label: "Procurement" }, { label: "Goods Receipts" }]);

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<GrnQuery>({ page: 1, limit: 10 });

  const stats = useGoodsReceiptStats();
  const grns = useGoodsReceipts(query);

  function applyFilters(next: FilterDraft = draft) {
    setQuery({ page: 1, limit: 10, search: next.search || undefined, inspectionStatus: (next.inspectionStatus as GrnInspectionStatus) || undefined });
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 10 });
  }

  const items = grns.data?.items ?? [];
  const meta = grns.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-biz-text">Goods Receipts</h1>
          <p className="mt-1 text-[13px] text-biz-muted">Record full or partial deliveries against an issued purchase order.</p>
        </div>
        <Link href="/procurement/grns/create">
          <PrimaryButton>
            <FilePlus2 className="h-4 w-4" />
            New Goods Receipt
          </PrimaryButton>
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard icon={Truck} iconClassName="bg-biz-blue-soft text-biz-blue" label="Total" value={String(stats.data?.total ?? "—")} helper="All Time" />
        <ModuleStatCard icon={CheckCircle2} iconClassName="bg-biz-success-soft text-biz-success" label="Accepted" value={String(stats.data?.accepted ?? "—")} helper="Fully accepted" />
        <ModuleStatCard icon={Search} iconClassName="bg-biz-warning-soft text-biz-warning" label="Partial" value={String(stats.data?.partial ?? "—")} helper="Partially accepted" />
        <ModuleStatCard icon={PackageX} iconClassName="bg-biz-danger-soft text-biz-danger" label="Rejected" value={String(stats.data?.rejected ?? "—")} helper="Fully rejected" />
      </div>

      <FilterBar>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Search</label>
          <TextInput
            icon={Search}
            placeholder="GRN number..."
            value={draft.search}
            onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
            onKeyDown={(event) => event.key === "Enter" && applyFilters()}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Inspection</label>
          <SelectInput
            className="w-[190px]"
            placeholder="All"
            value={draft.inspectionStatus}
            onChange={(event) => setDraft((current) => ({ ...current, inspectionStatus: event.target.value }))}
            options={GRN_INSPECTION_OPTIONS}
          />
        </div>
        <PrimaryButton onClick={() => applyFilters()}>
          <Search className="h-4 w-4" />
          Search
        </PrimaryButton>
        <SecondaryButton onClick={clearFilters}>Clear Filter</SecondaryButton>
      </FilterBar>

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <DataTable<GrnRecord>
          isLoading={grns.isLoading}
          data={items}
          rowKey={(row) => row.id}
          emptyMessage="No goods receipts yet."
          columns={[
            {
              key: "grnNo",
              header: "GRN No.",
              render: (row) => (
                <Link href={"/procurement/grns/" + row.id} className="font-medium text-biz-blue hover:underline">
                  {row.grnNo}
                </Link>
              ),
            },
            { key: "po", header: "PO No.", render: (row) => row.purchaseOrder.poNo },
            { key: "supplier", header: "Supplier", render: (row) => row.supplier.name },
            { key: "receiptDate", header: "Receipt Date", render: (row) => formatDate(row.receiptDate) },
            { key: "warehouse", header: "Warehouse", render: (row) => row.warehouseLocation ?? "—" },
            { key: "inspection", header: "Inspection", render: (row) => <StatusBadge label={GRN_INSPECTION_META[row.inspectionStatus].label} tone={GRN_INSPECTION_META[row.inspectionStatus].tone} /> },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <Link href={"/procurement/grns/" + row.id}>
                  <IconButton aria-label="View Details">
                    <Eye className="h-4 w-4" />
                  </IconButton>
                </Link>
              ),
            },
          ]}
        />
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} totalPages={meta.totalPages} onPageChange={(page) => setQuery((current) => ({ ...current, page }))} />
      </div>
    </div>
  );
}
