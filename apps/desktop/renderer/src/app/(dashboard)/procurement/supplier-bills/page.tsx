"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, FileEdit, FilePlus2, Receipt, Search, Wallet } from "lucide-react";
import { useSupplierBillStats, useSupplierBills } from "@bizovix/api-client";
import { DataTable, FilterBar, IconButton, ModuleStatCard, Pagination, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import type { BillMatchStatus, SupplierBillQuery, SupplierBillRecord, SupplierBillStatus } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { BILL_MATCH_STATUS_META, BILL_MATCH_STATUS_OPTIONS, SUPPLIER_BILL_STATUS_META, SUPPLIER_BILL_STATUS_OPTIONS } from "@/lib/supplier-bills";

interface FilterDraft {
  search: string;
  status: string;
  matchStatus: string;
}

const EMPTY_DRAFT: FilterDraft = { search: "", status: "", matchStatus: "" };

function deductionTotal(record: SupplierBillRecord): number {
  return Number(record.vatAmount) + Number(record.aitAmount) + Number(record.otherDeductionAmount);
}

function paidAmount(record: SupplierBillRecord): number {
  return Number(record.payable?.paidAmount ?? 0);
}

export default function SupplierBillsPage() {
  useSetBreadcrumb([{ label: "Procurement" }, { label: "Supplier Bills" }]);

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<SupplierBillQuery>({ page: 1, limit: 10 });

  const stats = useSupplierBillStats();
  const bills = useSupplierBills(query);

  function applyFilters(next: FilterDraft = draft) {
    setQuery({
      page: 1,
      limit: 10,
      search: next.search || undefined,
      status: (next.status as SupplierBillStatus) || undefined,
      matchStatus: (next.matchStatus as BillMatchStatus) || undefined,
    });
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 10 });
  }

  const items = bills.data?.items ?? [];
  const meta = bills.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-biz-text">Supplier Bills</h1>
          <p className="mt-1 text-[13px] text-biz-muted">
            Supplier invoices matched against the purchase order and accepted receipts before they become payable.
          </p>
        </div>
        <Link href="/procurement/supplier-bills/create">
          <PrimaryButton>
            <FilePlus2 className="h-4 w-4" />
            New Supplier Bill
          </PrimaryButton>
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard icon={Receipt} iconClassName="bg-biz-blue-soft text-biz-blue" label="Total Bills" value={String(stats.data?.total ?? "—")} helper="All Time" />
        <ModuleStatCard icon={Search} iconClassName="bg-biz-warning-soft text-biz-warning" label="Pending Approval" value={String(stats.data?.approvalPending ?? "—")} helper="Awaiting decision" />
        <ModuleStatCard icon={AlertTriangle} iconClassName="bg-biz-danger-soft text-biz-danger" label="Match Blocked" value={String(stats.data?.blocked ?? "—")} helper="Receipt/quantity issue" />
        <ModuleStatCard icon={Wallet} iconClassName="bg-biz-purple-soft text-biz-purple" label="Outstanding Payable" value={formatBDT(stats.data?.outstanding ?? "0")} helper="Approved, not yet paid" />
      </div>

      <FilterBar>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Search</label>
          <TextInput
            icon={Search}
            placeholder="Bill No. / Supplier Invoice No...."
            value={draft.search}
            onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
            onKeyDown={(event) => event.key === "Enter" && applyFilters()}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Bill Status</label>
          <SelectInput
            className="w-[170px]"
            placeholder="All"
            value={draft.status}
            onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
            options={SUPPLIER_BILL_STATUS_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Match Status</label>
          <SelectInput
            className="w-[180px]"
            placeholder="All"
            value={draft.matchStatus}
            onChange={(event) => setDraft((current) => ({ ...current, matchStatus: event.target.value }))}
            options={BILL_MATCH_STATUS_OPTIONS}
          />
        </div>
        <PrimaryButton onClick={() => applyFilters()}>
          <Search className="h-4 w-4" />
          Search
        </PrimaryButton>
        <SecondaryButton onClick={clearFilters}>Clear Filter</SecondaryButton>
      </FilterBar>

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <DataTable<SupplierBillRecord>
          isLoading={bills.isLoading}
          data={items}
          rowKey={(row) => row.id}
          emptyMessage="No supplier bills yet."
          columns={[
            {
              key: "billNo",
              header: "Bill No.",
              render: (row) => (
                <Link href={"/procurement/supplier-bills/" + row.id} className="font-medium text-biz-blue hover:underline">
                  {row.billNo}
                </Link>
              ),
            },
            { key: "invoiceNo", header: "Supplier Invoice", render: (row) => row.supplierInvoiceNo },
            { key: "supplier", header: "Supplier", render: (row) => row.supplier.name },
            {
              key: "po",
              header: "PO",
              render: (row) => (
                <Link href={"/procurement/purchase-orders/" + row.purchaseOrderId} className="text-biz-blue hover:underline">
                  {row.purchaseOrder.poNo}
                </Link>
              ),
            },
            { key: "project", header: "Project", render: (row) => row.cmsWork?.workName ?? "—" },
            { key: "invoiceDate", header: "Invoice Date", render: (row) => formatDate(row.supplierInvoiceDate) },
            { key: "dueDate", header: "Due Date", render: (row) => (row.dueDate ? formatDate(row.dueDate) : "—") },
            { key: "gross", header: "Gross", render: (row) => formatBDT(row.taxableBase) },
            { key: "deductions", header: "Deductions", render: (row) => formatBDT(deductionTotal(row)) },
            { key: "net", header: "Net Payable", render: (row) => <span className="font-medium">{formatBDT(row.netPayable)}</span> },
            { key: "paid", header: "Paid", render: (row) => formatBDT(paidAmount(row)) },
            {
              key: "outstanding",
              header: "Outstanding",
              render: (row) => (row.payable ? formatBDT(Number(row.netPayable) - paidAmount(row)) : "—"),
            },
            {
              key: "match",
              header: "Match",
              render: (row) => <StatusBadge label={BILL_MATCH_STATUS_META[row.matchStatus].label} tone={BILL_MATCH_STATUS_META[row.matchStatus].tone} />,
            },
            {
              key: "status",
              header: "Status",
              render: (row) => <StatusBadge label={SUPPLIER_BILL_STATUS_META[row.status].label} tone={SUPPLIER_BILL_STATUS_META[row.status].tone} />,
            },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <div className="flex items-center justify-center gap-1">
                  <Link href={"/procurement/supplier-bills/" + row.id}>
                    <IconButton aria-label="View Details">
                      <Eye className="h-4 w-4" />
                    </IconButton>
                  </Link>
                  {row.status === "DRAFT" && (
                    <Link href={"/procurement/supplier-bills/" + row.id + "/edit"}>
                      <IconButton aria-label="Edit Draft">
                        <FileEdit className="h-4 w-4" />
                      </IconButton>
                    </Link>
                  )}
                  {row.status === "PAID" && <CheckCircle2 className="h-4 w-4 text-biz-success" aria-label="Fully paid" />}
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
