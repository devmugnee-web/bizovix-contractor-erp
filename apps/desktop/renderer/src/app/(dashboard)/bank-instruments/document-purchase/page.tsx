"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, FileText, Landmark, Layers, Plus, RotateCcw, Search } from "lucide-react";
import {
  useAllOrganizations,
  useBankAccounts,
  useDocumentPurchaseStats,
  useDocumentPurchases,
} from "@bizovix/api-client";
import {
  DataTable,
  DateInput,
  FilterBar,
  IconButton,
  ModuleStatCard,
  Pagination,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
} from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import type { DocumentPurchase, DocumentPurchaseQuery, PurchaseType } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

interface FilterDraft {
  purchaseType: string;
  organizationMasterId: string;
  paymentFromAccountId: string;
  search: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_DRAFT: FilterDraft = {
  purchaseType: "",
  organizationMasterId: "",
  paymentFromAccountId: "",
  search: "",
  fromDate: "",
  toDate: "",
};

const DEFAULT_LIMIT = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

export default function DocumentPurchaseListPage() {
  useSetBreadcrumb([{ label: "Bank Instruments" }, { label: "Document Purchase" }]);
  const router = useRouter();

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<DocumentPurchaseQuery>({ page: 1, limit: DEFAULT_LIMIT });

  const stats = useDocumentPurchaseStats();
  const organizations = useAllOrganizations();
  const bankAccounts = useBankAccounts();
  const documentPurchases = useDocumentPurchases(query);

  React.useEffect(() => {
    setQuery((q) => ({
      ...q,
      page: 1,
      purchaseType: (draft.purchaseType as PurchaseType) || undefined,
      organizationMasterId: draft.organizationMasterId || undefined,
      paymentFromAccountId: draft.paymentFromAccountId || undefined,
      fromDate: draft.fromDate || undefined,
      toDate: draft.toDate || undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.purchaseType, draft.organizationMasterId, draft.paymentFromAccountId, draft.fromDate, draft.toDate]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      setQuery((q) => ({ ...q, page: 1, search: draft.search || undefined }));
    }, 400);
    return () => clearTimeout(handle);
  }, [draft.search]);

  function handleLimitChange(limit: number) {
    setQuery((q) => ({ ...q, limit, page: 1 }));
  }

  function handleResetFilters() {
    setDraft(EMPTY_DRAFT);
  }

  const items = documentPurchases.data?.items ?? [];
  const meta = documentPurchases.data?.meta ?? { page: 1, limit: DEFAULT_LIMIT, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col gap-2 md:h-full md:min-h-0 md:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5">
        <div>
          <h1 className="text-page-title text-biz-text">Document Purchase</h1>
        </div>
        <Link href="/bank-instruments/document-purchase/create" className="w-full sm:w-auto">
          <PrimaryButton className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Add Document Purchase
          </PrimaryButton>
        </Link>
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ModuleStatCard
          icon={Layers}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Purchases"
          value={String(stats.data?.totalPurchases ?? "—")}
          helper="All Time"
        />
        <ModuleStatCard
          icon={FileText}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="e-GP Purchases"
          value={String(stats.data?.egpPurchases ?? "—")}
          helper="All Time"
        />
        <ModuleStatCard
          icon={FileText}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Manual Purchases"
          value={String(stats.data?.manualPurchases ?? "—")}
          helper="All Time"
        />
        <ModuleStatCard
          icon={Landmark}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Total Amount"
          value={stats.data ? formatBDT(stats.data.totalAmount) : "—"}
          helper="All Time"
        />
      </div>

      <FilterBar className="shrink-0 p-2.5">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-[12px] font-medium text-biz-muted">Date Range</label>
          <div className="flex items-center gap-2">
            <DateInput
              value={draft.fromDate}
              onChange={(e) => setDraft((d) => ({ ...d, fromDate: e.target.value }))}
              className="h-10 w-full sm:w-[130px]"
            />
            <span className="shrink-0 text-biz-muted">–</span>
            <DateInput
              value={draft.toDate}
              onChange={(e) => setDraft((d) => ({ ...d, toDate: e.target.value }))}
              className="h-10 w-full sm:w-[130px]"
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-[135px]">
          <label className="text-[12px] font-medium text-biz-muted">Purchase Type</label>
          <SelectInput
            className="h-10 w-full"
            placeholder="All"
            value={draft.purchaseType}
            onChange={(e) => setDraft((d) => ({ ...d, purchaseType: e.target.value }))}
            options={[
              { label: "e-GP", value: "EGP" },
              { label: "Manual", value: "MANUAL" },
            ]}
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-[150px]">
          <label className="text-[12px] font-medium text-biz-muted">Organization</label>
          <SelectInput
            className="h-10 w-full"
            placeholder="All"
            value={draft.organizationMasterId}
            onChange={(e) => setDraft((d) => ({ ...d, organizationMasterId: e.target.value }))}
            options={(organizations.data ?? []).map((org) => ({ label: org.shortName, value: org.id }))}
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-[145px]">
          <label className="text-[12px] font-medium text-biz-muted">Payment From</label>
          <SelectInput
            className="h-10 w-full"
            placeholder="All"
            value={draft.paymentFromAccountId}
            onChange={(e) => setDraft((d) => ({ ...d, paymentFromAccountId: e.target.value }))}
            options={(bankAccounts.data ?? []).map((acc) => ({ label: acc.accountName, value: acc.id }))}
          />
        </div>

        <div className="flex w-full min-w-0 flex-1 flex-col gap-1 sm:min-w-[180px]">
          <label className="text-[12px] font-medium text-biz-muted">Search Tender ID / Work Name</label>
          <TextInput
            icon={Search}
            placeholder="Search..."
            value={draft.search}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            className="h-10"
          />
        </div>

        <IconButton
          type="button"
          onClick={handleResetFilters}
          aria-label="Reset filters"
          title="Reset filters"
          className="h-10 w-10 shrink-0"
        >
          <RotateCcw className="h-4 w-4" />
        </IconButton>
      </FilterBar>

      <div className="flex flex-col rounded-lg border border-biz-border bg-biz-surface shadow-card md:min-h-0 md:flex-1 md:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-biz-border px-4 py-2.5">
          <h3 className="text-[15px] font-semibold text-biz-text">Purchase List</h3>
          <SecondaryButton>
            <Download className="h-4 w-4" />
            Export
          </SecondaryButton>
        </div>

        <DataTable<DocumentPurchase>
          isLoading={documentPurchases.isLoading}
          data={items}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/bank-instruments/document-purchase/${row.id}`)}
          containerClassName="md:min-h-0 md:flex-1 md:overflow-y-auto"
          stickyHeader
          columns={[
            {
              key: "sl",
              header: "SL",
              render: (_row) => items.indexOf(_row) + 1 + (meta.page - 1) * meta.limit,
            },
            {
              key: "type",
              header: "Purchase Type",
              render: (row) => (
                <StatusBadge
                  label={row.purchaseType === "EGP" ? "e-GP" : "Manual"}
                  tone={row.purchaseType === "EGP" ? "success" : "warning"}
                />
              ),
            },
            { key: "tenderId", header: "Tender ID", render: (row) => row.tenderId ?? "N/A" },
            { key: "org", header: "Organization", render: (row) => row.organizationMaster.shortName },
            { key: "work", header: "Tender / Work Name", render: (row) => row.tenderWorkName },
            { key: "date", header: "Purchase Date", render: (row) => formatDate(row.purchaseDate) },
            { key: "price", header: "Document Price", render: (row) => formatBDT(row.documentPrice) },
            { key: "payment", header: "Payment From", render: (row) => row.paymentFromAccount.accountName },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <Link href={`/bank-instruments/document-purchase/${row.id}`}>
                  <IconButton aria-label="View">
                    <Eye className="h-4 w-4" />
                  </IconButton>
                </Link>
              ),
            },
          ]}
        />

        <div className="shrink-0 border-t border-biz-border">
          <Pagination
            page={meta.page}
            limit={meta.limit}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={(page) => setQuery((q) => ({ ...q, page }))}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onLimitChange={handleLimitChange}
          />
        </div>
      </div>
    </div>
  );
}
