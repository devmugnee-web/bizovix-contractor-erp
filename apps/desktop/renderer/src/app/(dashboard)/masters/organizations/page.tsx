"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { ApiError, useCreateOrganizationMaster, useOrganizationMasters, useReviseOrganizationDraft } from "@bizovix/api-client";
import { DataTable, FilterBar, Pagination, PageHeader, PrimaryButton, SecondaryButton, TextInput } from "@bizovix/ui";
import type { OrganizationMasterQuery, OrganizationMasterRecord } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { MasterSyncReview, MasterSyncState } from "@/components/masters/MasterSyncNotice";

export default function OrganizationsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Organizations / Clients" }]);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState<OrganizationMasterQuery>({ page: 1, limit: 10 });
  const organizations = useOrganizationMasters(query, { includeLocal: true });
  const createOrganization = useCreateOrganizationMaster();
  const reviseDraft = useReviseOrganizationDraft();
  const [form, setForm] = React.useState({ shortName: "", fullName: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [review, setReview] = React.useState<OrganizationMasterRecord | null>(null);

  const items = organizations.data?.items ?? [];
  const meta = organizations.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };
  const savedReview = review ? items.find((record) => record.id === review.id) ?? review : null;
  const saving = createOrganization.isPending || reviseDraft.isPending;
  const locked = !!savedReview && (savedReview.syncStatus !== "REJECTED" || !!savedReview.cloudRecord);

  function closeReview() {
    setReview(null);
    setForm({ shortName: "", fullName: "" });
    setError(null);
  }

  async function add() {
    if (saving || locked) return;
    setError(null);
    try {
      if (review) await reviseDraft.mutateAsync({ id: review.id, payload: form });
      else await createOrganization.mutateAsync(form);
      closeReview();
      setQuery((q) => ({ ...q, page: 1 }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The organization could not be saved. Your entered values are preserved.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Organizations / Clients" subtitle="Client / issuing-authority master used across Tenders, Contracts and Projects — the tender-side counterpart to Vendors & Suppliers." />

      <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <h3 className="mb-4 text-[15px] font-semibold text-biz-text">{review ? "Review saved organization" : "Add Organization / Client"}</h3>
        {savedReview && <MasterSyncReview error={savedReview.syncError?.message} hasCloudRecord={!!savedReview.cloudRecord} fields={[
          { label: "Short name", local: savedReview.shortName, cloud: savedReview.cloudRecord?.shortName },
          { label: "Full name", local: savedReview.fullName, cloud: savedReview.cloudRecord?.fullName },
        ]} />}
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput disabled={saving || locked} placeholder="Short name (e.g. LGED)" value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} />
          <TextInput disabled={saving || locked} placeholder="Full name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          <PrimaryButton disabled={!form.shortName || !form.fullName || saving || locked} onClick={add}>
            <Plus className="h-4 w-4" />
            {review ? "Queue reviewed organization" : "Add Organization"}
          </PrimaryButton>
        </div>
        {review && <SecondaryButton disabled={saving} onClick={closeReview}>Close review</SecondaryButton>}
        {error && <p className="text-[13px] text-biz-danger">{error}</p>}
        {organizations.isError && <p className="text-[13px] text-biz-danger">{organizations.error instanceof ApiError ? organizations.error.message : "Organizations could not be loaded."}</p>}
      </div>

      <FilterBar>
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Search</label>
          <TextInput
            icon={Search}
            placeholder="Short name / Full name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setQuery({ page: 1, limit: 10, search: search || undefined })}
          />
        </div>
        <PrimaryButton onClick={() => setQuery({ page: 1, limit: 10, search: search || undefined })}>
          <Search className="h-4 w-4" />
          Search
        </PrimaryButton>
        <SecondaryButton
          onClick={() => {
            setSearch("");
            setQuery({ page: 1, limit: 10 });
          }}
        >
          Clear Filter
        </SecondaryButton>
      </FilterBar>

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <DataTable<OrganizationMasterRecord>
          isLoading={organizations.isLoading}
          data={items}
          rowKey={(row) => row.id}
          columns={[
            { key: "sl", header: "SL", render: (row) => items.indexOf(row) + 1 + (meta.page - 1) * meta.limit },
            { key: "shortName", header: "Short Name", render: (row) => <div className="font-medium text-biz-text">{row.shortName}<MasterSyncState record={row} /></div> },
            { key: "fullName", header: "Full Name", render: (row) => row.fullName },
            { key: "review", header: "", render: (row) => row.syncStatus === "REJECTED" && !row.cloudRecord ? <SecondaryButton disabled={saving} onClick={() => { setReview(row); setForm({ shortName: row.shortName, fullName: row.fullName }); setError(null); }}>Review saved organization</SecondaryButton> : null },
          ]}
        />
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} totalPages={meta.totalPages} onPageChange={(page) => setQuery((q) => ({ ...q, page }))} />
      </div>
    </div>
  );
}
