"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, FileEdit, Search, Users, Wallet } from "lucide-react";
import { useMasterCategories, useParties, usePartyStats } from "@bizovix/api-client";
import { DataTable, FilterBar, IconButton, ModuleStatCard, Pagination, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { PartyQuery, PartyRecord, PartyStatus } from "@bizovix/types";
import { PARTY_STATUS_META, PARTY_STATUS_OPTIONS, partyRolesLabel } from "@/lib/parties";

interface PartyListPageProps {
  variant: "vendor" | "subcontractor";
  roles: string;
  title: string;
  subtitle: string;
  createHref: string;
  detailBasePath: string;
}

interface FilterDraft {
  search: string;
  status: string;
  categoryId: string;
  district: string;
}

const EMPTY_DRAFT: FilterDraft = { search: "", status: "", categoryId: "", district: "" };

export function PartyListPage({ variant, roles, title, subtitle, createHref, detailBasePath }: PartyListPageProps) {
  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<PartyQuery>({ page: 1, limit: 10, roles });

  const stats = usePartyStats(roles);
  const categories = useMasterCategories(variant === "vendor" ? "VENDOR" : "SUBCONTRACTOR_TRADE");
  const parties = useParties(query);

  function applyFilters(next: FilterDraft = draft) {
    setQuery({
      page: 1,
      limit: 10,
      roles,
      search: next.search || undefined,
      status: (next.status as PartyStatus) || undefined,
      categoryId: next.categoryId || undefined,
      district: next.district || undefined,
    });
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 10, roles });
  }

  const items = parties.data?.items ?? [];
  const meta = parties.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-biz-text">{title}</h1>
          <p className="mt-1 text-[13px] text-biz-muted">{subtitle}</p>
        </div>
        <Link href={createHref}>
          <PrimaryButton>
            <FileEdit className="h-4 w-4" />
            Add {variant === "vendor" ? "Vendor" : "Subcontractor"}
          </PrimaryButton>
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard icon={Users} iconClassName="bg-biz-blue-soft text-biz-blue" label={`Total ${variant === "vendor" ? "Vendors" : "Subcontractors"}`} value={String(stats.data?.total ?? "—")} helper="All Time" />
        <ModuleStatCard icon={CheckCircle2} iconClassName="bg-biz-success-soft text-biz-success" label="Active" value={String(stats.data?.active ?? "—")} helper="Currently Active" />
        <ModuleStatCard icon={Wallet} iconClassName="bg-biz-purple-soft text-biz-purple" label="Outstanding Payables" value={formatBDT(stats.data?.outstandingPayable ?? "0")} helper="Across all payables" />
        <ModuleStatCard icon={AlertTriangle} iconClassName="bg-biz-warning-soft text-biz-warning" label="Suspended / Inactive" value={String(stats.data?.suspendedOrInactive ?? "—")} helper="Needs review" />
      </div>

      <FilterBar>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Search</label>
          <TextInput icon={Search} placeholder="Code / Name / Phone / Email / Tax ID..." value={draft.search} onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && applyFilters()} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Category</label>
          <SelectInput className="w-[160px]" placeholder="All" value={draft.categoryId} onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))} options={(categories.data ?? []).map((c) => ({ label: c.name, value: c.id }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Status</label>
          <SelectInput className="w-[150px]" placeholder="All" value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} options={PARTY_STATUS_OPTIONS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">District</label>
          <TextInput className="w-[140px]" value={draft.district} onChange={(e) => setDraft((d) => ({ ...d, district: e.target.value }))} />
        </div>
        <PrimaryButton onClick={() => applyFilters()}>
          <Search className="h-4 w-4" />
          Search
        </PrimaryButton>
        <SecondaryButton onClick={clearFilters}>Clear Filter</SecondaryButton>
      </FilterBar>

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <DataTable<PartyRecord>
          isLoading={parties.isLoading}
          data={items}
          rowKey={(row) => row.id}
          columns={[
            { key: "sl", header: "SL", render: (row) => items.indexOf(row) + 1 + (meta.page - 1) * meta.limit },
            {
              key: "code",
              header: variant === "vendor" ? "Vendor Code" : "Code",
              render: (row) => (
                <Link href={`${detailBasePath}/${row.id}`} className="font-medium text-biz-blue hover:underline">
                  {row.code}
                </Link>
              ),
            },
            { key: "name", header: "Name", render: (row) => row.displayName || row.name },
            { key: "type", header: "Type", render: (row) => partyRolesLabel(row.roles) },
            { key: "category", header: "Category", render: (row) => row.category?.name ?? "—" },
            { key: "contact", header: "Contact", render: (row) => row.phone || row.email || "—" },
            { key: "terms", header: "Payment Terms", render: (row) => row.paymentTerm?.name ?? "—" },
            { key: "outstanding", header: "Outstanding", render: (row) => formatBDT(row.outstandingPayable ?? "0") },
            { key: "status", header: "Status", render: (row) => <StatusBadge label={PARTY_STATUS_META[row.status].label} tone={PARTY_STATUS_META[row.status].tone} /> },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <div className="flex items-center justify-center gap-1">
                  <Link href={`${detailBasePath}/${row.id}`}>
                    <IconButton aria-label="View Details">
                      <Eye className="h-4 w-4" />
                    </IconButton>
                  </Link>
                  <Link href={`${detailBasePath}/${row.id}/edit`}>
                    <IconButton aria-label="Edit">
                      <FileEdit className="h-4 w-4" />
                    </IconButton>
                  </Link>
                </div>
              ),
            },
          ]}
        />
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} totalPages={meta.totalPages} onPageChange={(page) => setQuery((q) => ({ ...q, page }))} />
      </div>
    </div>
  );
}
