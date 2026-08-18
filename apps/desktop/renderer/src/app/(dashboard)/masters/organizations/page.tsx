"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { useCreateOrganizationMaster, useOrganizationMasters } from "@bizovix/api-client";
import { DataTable, FilterBar, Pagination, PageHeader, PrimaryButton, SecondaryButton, TextInput } from "@bizovix/ui";
import type { OrganizationMasterQuery, OrganizationMasterRecord } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function OrganizationsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Organizations / Clients" }]);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState<OrganizationMasterQuery>({ page: 1, limit: 10 });
  const organizations = useOrganizationMasters(query);
  const createOrganization = useCreateOrganizationMaster();
  const [form, setForm] = React.useState({ shortName: "", fullName: "" });
  const [error, setError] = React.useState<string | null>(null);

  const items = organizations.data?.items ?? [];
  const meta = organizations.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  async function add() {
    setError(null);
    try {
      await createOrganization.mutateAsync(form);
      setForm({ shortName: "", fullName: "" });
      setQuery((q) => ({ ...q, page: 1 }));
    } catch {
      setError("Failed to create organization.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Organizations / Clients" subtitle="Client / issuing-authority master used across Tenders, Contracts and Projects — the tender-side counterpart to Vendors & Suppliers." />

      <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <h3 className="mb-4 text-[15px] font-semibold text-biz-text">Add Organization / Client</h3>
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput placeholder="Short name (e.g. LGED)" value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} />
          <TextInput placeholder="Full name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          <PrimaryButton disabled={!form.shortName || !form.fullName || createOrganization.isPending} onClick={add}>
            <Plus className="h-4 w-4" />
            Add Organization
          </PrimaryButton>
        </div>
        {error && <p className="text-[13px] text-biz-danger">{error}</p>}
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
            { key: "shortName", header: "Short Name", render: (row) => <span className="font-medium text-biz-text">{row.shortName}</span> },
            { key: "fullName", header: "Full Name", render: (row) => row.fullName },
          ]}
        />
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} totalPages={meta.totalPages} onPageChange={(page) => setQuery((q) => ({ ...q, page }))} />
      </div>
    </div>
  );
}
