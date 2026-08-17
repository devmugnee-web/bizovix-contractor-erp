"use client";

import * as React from "react";
import Link from "next/link";
import { CircleDollarSign, Clock, Eye, FileEdit, FolderKanban, Search } from "lucide-react";
import { useAllOrganizations, useContractCategories, useContractStats, useContracts } from "@bizovix/api-client";
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
import type { ContractQuery, ContractRecord, ContractStatus } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { CONTRACT_STATUS_META, CONTRACT_STATUS_OPTIONS } from "@/lib/contracts";

interface FilterDraft {
  search: string;
  organizationMasterId: string;
  workCategory: string;
  status: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_DRAFT: FilterDraft = {
  search: "",
  organizationMasterId: "",
  workCategory: "",
  status: "",
  fromDate: "",
  toDate: "",
};

export default function ContractsListPage() {
  useSetBreadcrumb([{ label: "CMS" }, { label: "Contracts / Work Orders" }]);

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<ContractQuery>({ page: 1, limit: 10 });

  const stats = useContractStats();
  const organizations = useAllOrganizations();
  const categories = useContractCategories();
  const contracts = useContracts(query);

  function applyFilters(next: FilterDraft = draft) {
    setQuery({
      page: 1,
      limit: 10,
      search: next.search || undefined,
      organizationMasterId: next.organizationMasterId || undefined,
      workCategory: next.workCategory || undefined,
      status: (next.status as ContractStatus) || undefined,
      fromDate: next.fromDate || undefined,
      toDate: next.toDate || undefined,
    });
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 10 });
  }

  const items = contracts.data?.items ?? [];
  const meta = contracts.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-biz-text">Contracts & Work Orders</h1>
          <p className="mt-1 text-[13px] text-biz-muted">
            Manage awarded contracts, work orders and project execution details.
          </p>
        </div>
        <Link href="/cms/contracts/create">
          <PrimaryButton>
            <FileEdit className="h-4 w-4" />
            Add Contract / Work Order
          </PrimaryButton>
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard
          icon={FolderKanban}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Contracts"
          value={String(stats.data?.total ?? "—")}
          helper="All Time"
        />
        <ModuleStatCard
          icon={CircleDollarSign}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Active Contracts"
          value={String(stats.data?.active ?? "—")}
          helper="Currently Active"
        />
        <ModuleStatCard
          icon={CircleDollarSign}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Contract Value"
          value={formatBDT(stats.data?.contractValue ?? "0")}
          helper="Sum of Active Contracts"
        />
        <ModuleStatCard
          icon={Clock}
          iconClassName="bg-biz-warning-soft text-biz-warning"
          label="Completing Soon"
          value={String(stats.data?.completingSoon ?? "—")}
          helper="Within 30 Days"
        />
      </div>

      <FilterBar>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Organization</label>
          <SelectInput
            className="w-[160px]"
            placeholder="All"
            value={draft.organizationMasterId}
            onChange={(e) => setDraft((d) => ({ ...d, organizationMasterId: e.target.value }))}
            options={(organizations.data ?? []).map((org) => ({ label: org.shortName, value: org.id }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Work Category</label>
          <SelectInput
            className="w-[150px]"
            placeholder="All"
            value={draft.workCategory}
            onChange={(e) => setDraft((d) => ({ ...d, workCategory: e.target.value }))}
            options={(categories.data ?? []).map((category) => ({ label: category, value: category }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Status</label>
          <SelectInput
            className="w-[150px]"
            placeholder="All"
            value={draft.status}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            options={CONTRACT_STATUS_OPTIONS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Completion Date</label>
          <div className="flex items-center gap-2">
            <DateInput
              className="w-[140px]"
              value={draft.fromDate}
              onChange={(e) => setDraft((d) => ({ ...d, fromDate: e.target.value }))}
            />
            <span className="text-biz-muted">–</span>
            <DateInput
              className="w-[140px]"
              value={draft.toDate}
              onChange={(e) => setDraft((d) => ({ ...d, toDate: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Search</label>
          <TextInput
            icon={Search}
            placeholder="Contract No. / Project name..."
            value={draft.search}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
        </div>

        <PrimaryButton onClick={() => applyFilters()}>
          <Search className="h-4 w-4" />
          Search
        </PrimaryButton>
        <SecondaryButton onClick={clearFilters}>Clear Filter</SecondaryButton>
      </FilterBar>

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Contract List</h3>
        </div>

        <DataTable<ContractRecord>
          isLoading={contracts.isLoading}
          data={items}
          rowKey={(row) => row.id}
          columns={[
            { key: "sl", header: "SL", render: (row) => items.indexOf(row) + 1 + (meta.page - 1) * meta.limit },
            {
              key: "no",
              header: "Contract / WO No.",
              render: (row) => (
                <Link href={`/cms/contracts/${row.id}`} className="font-medium text-biz-blue hover:underline">
                  {row.contractNo}
                </Link>
              ),
            },
            { key: "work", header: "Project / Work", render: (row) => row.cmsWork.workName },
            { key: "org", header: "Organization", render: (row) => row.organizationMaster.shortName },
            { key: "value", header: "Contract Value", render: (row) => formatBDT(row.currentContractValue) },
            { key: "start", header: "Start Date", render: (row) => formatDate(row.commencementDate) },
            { key: "completion", header: "Completion Date", render: (row) => formatDate(row.currentCompletionDate) },
            { key: "duration", header: "Duration", render: (row) => (row.durationDays ? `${row.durationDays} days` : "—") },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <StatusBadge label={CONTRACT_STATUS_META[row.status].label} tone={CONTRACT_STATUS_META[row.status].tone} />
              ),
            },
            { key: "progress", header: "Progress", render: (row) => `${row.scheduleProgressPct}%` },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <div className="flex items-center justify-center gap-1">
                  <Link href={`/cms/contracts/${row.id}`}>
                    <IconButton aria-label="View Details">
                      <Eye className="h-4 w-4" />
                    </IconButton>
                  </Link>
                  <Link href={`/cms/contracts/${row.id}/edit`}>
                    <IconButton aria-label="Edit">
                      <FileEdit className="h-4 w-4" />
                    </IconButton>
                  </Link>
                  <Link href={`/cms/ongoing-works/${row.cmsWorkId}`}>
                    <IconButton aria-label="Open Project">
                      <FolderKanban className="h-4 w-4" />
                    </IconButton>
                  </Link>
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
          onPageChange={(page) => setQuery((q) => ({ ...q, page }))}
        />
      </div>
    </div>
  );
}
