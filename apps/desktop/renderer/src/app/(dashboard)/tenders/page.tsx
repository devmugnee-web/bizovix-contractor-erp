"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  Calendar,
  ClipboardList,
  Download,
  Eye,
  FileEdit,
  Info,
  MoreVertical,
  Search,
  SlidersHorizontal,
  SquareStack,
  XCircle,
} from "lucide-react";
import { useAllOrganizations, useTenderCategories, useTenderStats, useTenders } from "@bizovix/api-client";
import {
  DataTable,
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
import {
  PRIORITY_TONE,
  SOURCE_OPTIONS,
  avatarForAssignee,
  tenderNextFollowUp,
  tenderPriority,
  tenderSource,
} from "./list-helpers";

interface FilterDraft {
  search: string;
  assignedToName: string;
  organizationMasterId: string;
  source: string;
  status: string;
  category: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_DRAFT: FilterDraft = {
  search: "",
  assignedToName: "",
  organizationMasterId: "",
  source: "",
  status: "",
  category: "",
  fromDate: "",
  toDate: "",
};

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function TendersListPage() {
  useSetBreadcrumb([{ label: "Tender Management", href: "/tender-management" }, { label: "Tender List" }]);

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [appliedSource, setAppliedSource] = React.useState("");
  const [query, setQuery] = React.useState<TenderQuery>({ page: 1, limit: 10 });
  const [moreFiltersOpen, setMoreFiltersOpen] = React.useState(false);
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<{ id: string; top: number; right: number } | null>(null);

  const stats = useTenderStats();
  const organizations = useAllOrganizations();
  const categories = useTenderCategories();
  const tenders = useTenders(query);

  function applyFilters(next: FilterDraft = draft) {
    setQuery({
      page: 1,
      limit: 10,
      search: next.search || undefined,
      organizationMasterId: next.organizationMasterId || undefined,
      category: next.category || undefined,
      status: (next.status as TenderStatus) || undefined,
      assignedToName: next.assignedToName || undefined,
      fromDate: next.fromDate || undefined,
      toDate: next.toDate || undefined,
    });
    setAppliedSource(next.source);
    setDateRangeOpen(false);
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 10 });
    setAppliedSource("");
    setMoreFiltersOpen(false);
  }

  function toggleMenu(id: string, e: React.MouseEvent<HTMLButtonElement>) {
    if (menuAnchor?.id === id) {
      setMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuAnchor({ id, top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  const meta = tenders.data?.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 };

  const visibleItems = React.useMemo(() => {
    const list = tenders.data?.items ?? [];
    return appliedSource ? list.filter((row) => tenderSource(row.id) === appliedSource) : list;
  }, [tenders.data, appliedSource]);

  function exportCsv() {
    const header = [
      "Tender ID",
      "Work / Tender Name",
      "Organization",
      "Source",
      "Search Date",
      "Assigned To",
      "Opening Date",
      "Next Follow Up",
      "Status",
      "Priority",
      "Tender Value (BDT)",
    ];
    const rows = visibleItems.map((row) => {
      const followUp = tenderNextFollowUp(row);
      return [
        row.egpTenderId ?? "N/A",
        row.workName,
        row.organizationMaster.shortName,
        tenderSource(row.id),
        formatDate(row.createdAt),
        row.assignedToName ?? "Unassigned",
        row.openingDate ? formatDate(row.openingDate) : "—",
        followUp ? formatDate(followUp) : "—",
        TENDER_STATUS_META[row.status].label,
        tenderPriority(row.id),
        formatBDT(row.contractValue),
      ];
    });
    downloadCsv("tender-list.csv", [header, ...rows]);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-biz-border bg-biz-surface px-4 py-3 shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
        <div>
          <h1 className="text-page-title text-biz-text">Tender List</h1>
          <p className="mt-0.5 text-[12.5px] text-biz-muted">
            Manage tender opportunities, submission status and award lifecycle.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SecondaryButton onClick={() => setDateRangeOpen((v) => !v)} className="h-9">
              <Calendar className="h-4 w-4" />
              {draft.fromDate ? formatDate(draft.fromDate) : "From"} – {draft.toDate ? formatDate(draft.toDate) : "To"}
            </SecondaryButton>
            {dateRangeOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40"
                  onClick={() => setDateRangeOpen(false)}
                  aria-label="Close"
                />
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card-hover">
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-medium text-biz-muted">
                      Submission Deadline From
                      <input
                        type="date"
                        value={draft.fromDate}
                        onChange={(e) => setDraft((d) => ({ ...d, fromDate: e.target.value }))}
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                    <label className="text-[11px] font-medium text-biz-muted">
                      To
                      <input
                        type="date"
                        value={draft.toDate}
                        onChange={(e) => setDraft((d) => ({ ...d, toDate: e.target.value }))}
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                    <PrimaryButton className="mt-1 h-9" onClick={() => applyFilters()}>
                      Apply
                    </PrimaryButton>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={exportCsv}
            title="Export as CSV"
            className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-sm bg-biz-success px-4 text-[13px] font-medium text-white transition-colors hover:brightness-95"
          >
            <Download className="h-4 w-4" />
            Export
          </button>

          <Link href="/tenders/create">
            <PrimaryButton className="h-9">
              <FileEdit className="h-4 w-4" />
              Add New Tender
            </PrimaryButton>
          </Link>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
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

      {/* Filter Panel */}
      <div className="rounded-lg border border-biz-border bg-biz-surface p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 min-w-[180px] flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Search Tender ID / Work Name</label>
            <TextInput
              icon={Search}
              placeholder="Search..."
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>

          <div className="flex flex-1 min-w-[160px] flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Search Assigned To</label>
            <TextInput
              icon={Search}
              placeholder="Anyone"
              value={draft.assignedToName}
              onChange={(e) => setDraft((d) => ({ ...d, assignedToName: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>

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
            <label className="text-[12px] font-medium text-biz-muted">Source</label>
            <SelectInput
              className="w-[150px]"
              placeholder="All"
              value={draft.source}
              onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
              options={SOURCE_OPTIONS}
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

          <SecondaryButton onClick={() => setMoreFiltersOpen((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" />
            More Filters
          </SecondaryButton>

          <PrimaryButton onClick={() => applyFilters()}>
            <Search className="h-4 w-4" />
            Search
          </PrimaryButton>
          <SecondaryButton onClick={clearFilters}>Reset</SecondaryButton>
        </div>

        {moreFiltersOpen && (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-biz-border pt-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Work Category</label>
              <SelectInput
                className="w-[180px]"
                placeholder="All"
                value={draft.category}
                onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                options={(categories.data ?? []).map((category) => ({ label: category, value: category }))}
              />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Tender List</h3>
        </div>

        <DataTable<TenderRecord>
          isLoading={tenders.isLoading}
          data={visibleItems}
          rowKey={(row) => row.id}
          columns={[
            { key: "tenderId", header: "Tender ID", render: (row) => row.egpTenderId ?? "N/A" },
            {
              key: "work",
              header: "Work / Tender Name",
              render: (row) => (
                <Link href={`/tenders/${row.id}`} className="font-medium text-biz-blue hover:underline">
                  {row.workName}
                </Link>
              ),
            },
            { key: "org", header: "Organization", render: (row) => row.organizationMaster.shortName },
            {
              key: "source",
              header: "Source",
              render: (row) => <StatusBadge label={tenderSource(row.id)} tone="info" />,
            },
            { key: "searchDate", header: "Search Date", render: (row) => formatDate(row.createdAt) },
            {
              key: "assigned",
              header: "Assigned To",
              render: (row) => {
                const avatar = avatarForAssignee(row.assignedToName);
                return (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                      style={{ backgroundColor: avatar.color }}
                    >
                      {avatar.initial}
                    </span>
                    <span className="whitespace-nowrap">{avatar.name}</span>
                  </span>
                );
              },
            },
            {
              key: "opening",
              header: "Opening Date",
              render: (row) => (row.openingDate ? formatDate(row.openingDate) : "—"),
            },
            {
              key: "followUp",
              header: "Next Follow Up",
              render: (row) => {
                const followUp = tenderNextFollowUp(row);
                return followUp ? formatDate(followUp) : "—";
              },
            },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <StatusBadge label={TENDER_STATUS_META[row.status].label} tone={TENDER_STATUS_META[row.status].tone} />
              ),
            },
            {
              key: "priority",
              header: "Priority",
              render: (row) => {
                const priority = tenderPriority(row.id);
                return <StatusBadge label={priority} tone={PRIORITY_TONE[priority]} />;
              },
            },
            { key: "value", header: "Tender Value (BDT)", render: (row) => formatBDT(row.contractValue) },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <div className="flex items-center justify-center gap-1">
                  <Link href={`/tenders/${row.id}`}>
                    <IconButton aria-label="View Details" title="View">
                      <Eye className="h-4 w-4" />
                    </IconButton>
                  </Link>
                  <IconButton
                    aria-label="More actions"
                    title="More actions"
                    onClick={(e) => toggleMenu(row.id, e)}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </IconButton>
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
          showJumpButtons
        />
      </div>

      {/* Bottom info bar */}
      <div className="flex items-center gap-2 rounded-lg border border-biz-blue/20 bg-biz-blue-soft px-4 py-2.5 text-[12.5px] text-biz-text">
        <Info className="h-4 w-4 shrink-0 text-biz-blue" />
        <span>
          Click the <span className="font-semibold">tender name</span> or <span className="font-semibold">View</span>{" "}
          to open full tender details and continue the workflow.
        </span>
      </div>

      {menuAnchor && (
        <>
          <button type="button" className="fixed inset-0 z-40" aria-label="Close" onClick={() => setMenuAnchor(null)} />
          <div
            className="fixed z-50 w-[180px] overflow-hidden rounded-md border border-biz-border bg-biz-surface py-1 shadow-card-hover"
            style={{ top: menuAnchor.top, right: menuAnchor.right }}
          >
            <Link
              href={`/tenders/${menuAnchor.id}/edit`}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-biz-text hover:bg-biz-bg"
              onClick={() => setMenuAnchor(null)}
            >
              <FileEdit className="h-3.5 w-3.5" />
              Edit
            </Link>
            <Link
              href={`/tenders/${menuAnchor.id}`}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-biz-text hover:bg-biz-bg"
              onClick={() => setMenuAnchor(null)}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Continue Workflow
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
