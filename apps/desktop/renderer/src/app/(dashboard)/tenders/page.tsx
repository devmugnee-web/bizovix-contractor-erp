"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Award, ClipboardList, Eye, FileEdit, Search, SquareStack, XCircle } from "lucide-react";
import { useAllOrganizations, useTenderCategories, useTenderStats, useTenders } from "@bizovix/api-client";
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
import type { TenderQuery, TenderRecord, TenderStatus } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { TENDER_STATUS_META, TENDER_STATUS_OPTIONS } from "@/lib/tenders";

interface FilterDraft {
  search: string;
  organizationMasterId: string;
  category: string;
  status: string;
  assignedToName: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_DRAFT: FilterDraft = {
  search: "",
  organizationMasterId: "",
  category: "",
  status: "",
  assignedToName: "",
  fromDate: "",
  toDate: "",
};

export default function TendersListPage() {
  useSetBreadcrumb([{ label: "Tenders" }]);

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<TenderQuery>({ page: 1, limit: 8 });

  const stats = useTenderStats();
  const organizations = useAllOrganizations();
  const categories = useTenderCategories();
  const tenders = useTenders(query);

  function applyFilters(next: FilterDraft = draft) {
    setQuery({
      page: 1,
      limit: 8,
      search: next.search || undefined,
      organizationMasterId: next.organizationMasterId || undefined,
      category: next.category || undefined,
      status: (next.status as TenderStatus) || undefined,
      assignedToName: next.assignedToName || undefined,
      fromDate: next.fromDate || undefined,
      toDate: next.toDate || undefined,
    });
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 8 });
  }

  const items = tenders.data?.items ?? [];
  const meta = tenders.data?.meta ?? { page: 1, limit: 8, total: 0, totalPages: 1 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-biz-text">Tenders</h1>
          <p className="mt-1 text-[13px] text-biz-muted">
            Manage tender opportunities, submission status and award lifecycle.
          </p>
        </div>
        <Link href="/tenders/create">
          <PrimaryButton>
            <FileEdit className="h-4 w-4" />
            Add Tender
          </PrimaryButton>
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <ModuleStatCard
          icon={SquareStack}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Tenders"
          value={String(stats.data?.total ?? "—")}
          helper="All Time"
        />
        <ModuleStatCard
          icon={ClipboardList}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Preparing"
          value={String(stats.data?.preparing ?? "—")}
          helper="Draft / Published / Preparing"
        />
        <ModuleStatCard
          icon={ArrowRight}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Submitted"
          value={String(stats.data?.submitted ?? "—")}
          helper="Awaiting Opening"
        />
        <ModuleStatCard
          icon={Search}
          iconClassName="bg-biz-warning-soft text-biz-warning"
          label="Under Evaluation"
          value={String(stats.data?.underEvaluation ?? "—")}
          helper="Opened / NOA Pending"
        />
        <ModuleStatCard
          icon={Award}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Awarded"
          value={String(stats.data?.awarded ?? "—")}
          helper="Awarded / Ongoing"
        />
        <ModuleStatCard
          icon={XCircle}
          iconClassName="bg-biz-danger-soft text-biz-danger"
          label="Unsuccessful"
          value={String(stats.data?.unsuccessful ?? "—")}
          helper="Rejected / Cancelled"
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
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            options={(categories.data ?? []).map((category) => ({ label: category, value: category }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Status</label>
          <SelectInput
            className="w-[160px]"
            placeholder="All"
            value={draft.status}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            options={TENDER_STATUS_OPTIONS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Assigned To</label>
          <TextInput
            className="w-[140px]"
            placeholder="Anyone"
            value={draft.assignedToName}
            onChange={(e) => setDraft((d) => ({ ...d, assignedToName: e.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-medium text-biz-muted">Submission Deadline</label>
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
          <label className="text-[12px] font-medium text-biz-muted">Search Tender ID / Work Name</label>
          <TextInput
            icon={Search}
            placeholder="Search..."
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
          <h3 className="text-[15px] font-semibold text-biz-text">Tender List</h3>
        </div>

        <DataTable<TenderRecord>
          isLoading={tenders.isLoading}
          data={items}
          rowKey={(row) => row.id}
          columns={[
            { key: "sl", header: "SL", render: (row) => items.indexOf(row) + 1 + (meta.page - 1) * meta.limit },
            { key: "tenderId", header: "Tender ID / e-GP ID", render: (row) => row.egpTenderId ?? "N/A" },
            {
              key: "work",
              header: "Tender / Work Name",
              render: (row) => (
                <Link href={`/tenders/${row.id}`} className="font-medium text-biz-blue hover:underline">
                  {row.workName}
                </Link>
              ),
            },
            { key: "org", header: "Organization", render: (row) => row.organizationMaster.shortName },
            { key: "category", header: "Work Category", render: (row) => row.category },
            { key: "value", header: "Estimated Value", render: (row) => formatBDT(row.contractValue) },
            {
              key: "deadline",
              header: "Submission Deadline",
              render: (row) => (row.submissionDeadline ? formatDate(row.submissionDeadline) : "—"),
            },
            {
              key: "opening",
              header: "Opening Date",
              render: (row) => (row.openingDate ? formatDate(row.openingDate) : "—"),
            },
            { key: "assigned", header: "Assigned To", render: (row) => row.assignedToName ?? "Unassigned" },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <StatusBadge label={TENDER_STATUS_META[row.status].label} tone={TENDER_STATUS_META[row.status].tone} />
              ),
            },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <div className="flex items-center justify-center gap-1">
                  <Link href={`/tenders/${row.id}`}>
                    <IconButton aria-label="View Details">
                      <Eye className="h-4 w-4" />
                    </IconButton>
                  </Link>
                  <Link href={`/tenders/${row.id}/edit`}>
                    <IconButton aria-label="Edit">
                      <FileEdit className="h-4 w-4" />
                    </IconButton>
                  </Link>
                  <Link href={`/tenders/${row.id}`}>
                    <IconButton aria-label="Continue Workflow">
                      <ArrowRight className="h-4 w-4" />
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
