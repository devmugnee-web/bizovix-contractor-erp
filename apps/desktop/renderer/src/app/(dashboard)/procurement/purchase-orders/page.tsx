"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Eye, FileEdit, Search, ShoppingCart, Truck } from "lucide-react";
import { usePurchaseOrderStats, usePurchaseOrders } from "@bizovix/api-client";
import { DataTable, FilterBar, IconButton, ModuleStatCard, Pagination, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import type { PurchaseOrderQuery, PurchaseOrderRecord, PurchaseOrderStatus } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { PO_STATUS_META, PO_STATUS_OPTIONS } from "@/lib/procurement";

interface FilterDraft {
  search: string;
  status: string;
}

const EMPTY_DRAFT: FilterDraft = { search: "", status: "" };

function earliestDeliveryDate(record: PurchaseOrderRecord): string | null {
  const dates = record.items.map((item) => item.deliveryDate).filter((date): date is string => !!date);
  return dates.length ? dates.reduce((earliest, date) => (date < earliest ? date : earliest)) : null;
}

export default function PurchaseOrdersPage() {
  useSetBreadcrumb([{ label: "Procurement" }, { label: "Purchase Orders" }]);

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<PurchaseOrderQuery>({ page: 1, limit: 10 });

  const stats = usePurchaseOrderStats();
  const orders = usePurchaseOrders(query);

  function applyFilters(next: FilterDraft = draft) {
    setQuery({ page: 1, limit: 10, search: next.search || undefined, status: (next.status as PurchaseOrderStatus) || undefined });
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 10 });
  }

  const items = orders.data?.items ?? [];
  const meta = orders.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title text-biz-text">Purchase Orders</h1>
        <p className="mt-1 text-[13px] text-biz-muted">Raised from an Approved Comparative Statement — approve, issue and track delivery.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard icon={ShoppingCart} iconClassName="bg-biz-blue-soft text-biz-blue" label="Total" value={String(stats.data?.total ?? "—")} helper="All Time" />
        <ModuleStatCard icon={FileEdit} iconClassName="bg-gray-100 text-biz-muted" label="Draft" value={String(stats.data?.draft ?? "—")} helper="Not yet approved" />
        <ModuleStatCard icon={Truck} iconClassName="bg-biz-warning-soft text-biz-warning" label="Awaiting Delivery" value={String(stats.data?.awaitingDelivery ?? "—")} helper="Issued or partially received" />
        <ModuleStatCard icon={CheckCircle2} iconClassName="bg-biz-success-soft text-biz-success" label="Received" value={String(stats.data?.received ?? "—")} helper="Fully received" />
      </div>

      <FilterBar>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Search</label>
          <TextInput
            icon={Search}
            placeholder="PO number..."
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
            options={PO_STATUS_OPTIONS}
          />
        </div>
        <PrimaryButton onClick={() => applyFilters()}>
          <Search className="h-4 w-4" />
          Search
        </PrimaryButton>
        <SecondaryButton onClick={clearFilters}>Clear Filter</SecondaryButton>
      </FilterBar>

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <DataTable<PurchaseOrderRecord>
          isLoading={orders.isLoading}
          data={items}
          rowKey={(row) => row.id}
          emptyMessage="No purchase orders yet. Raise one from an Approved Comparative Statement."
          columns={[
            {
              key: "poNo",
              header: "PO No.",
              render: (row) => (
                <Link href={"/procurement/purchase-orders/" + row.id} className="font-medium text-biz-blue hover:underline">
                  {row.poNo}
                </Link>
              ),
            },
            { key: "supplier", header: "Supplier", render: (row) => row.supplier.name },
            { key: "project", header: "Project", render: (row) => row.cmsWork?.workName ?? "—" },
            { key: "poDate", header: "PO Date", render: (row) => formatDate(row.poDate) },
            { key: "amount", header: "Amount", render: (row) => formatBDT(row.grandTotal) },
            { key: "deliveryDate", header: "Delivery Date", render: (row) => (earliestDeliveryDate(row) ? formatDate(earliestDeliveryDate(row)!) : "—") },
            { key: "receivedPct", header: "Received %", render: (row) => row.receivedPct + "%" },
            { key: "status", header: "Status", render: (row) => <StatusBadge label={PO_STATUS_META[row.status].label} tone={PO_STATUS_META[row.status].tone} /> },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <div className="flex items-center justify-center gap-1">
                  <Link href={"/procurement/purchase-orders/" + row.id}>
                    <IconButton aria-label="View Details">
                      <Eye className="h-4 w-4" />
                    </IconButton>
                  </Link>
                  {row.status === "DRAFT" && (
                    <Link href={"/procurement/purchase-orders/" + row.id + "/edit"}>
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
