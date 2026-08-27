"use client";

import * as React from "react";
import Link from "next/link";
import {
  Banknote,
  Calendar,
  Clock,
  Download,
  Eye,
  Filter,
  Folder,
  Hourglass,
  Info,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
  cn,
  type DataTableColumn,
  type StatusBadgeTone,
} from "@bizovix/ui";
import { formatBDT, formatBDTCompact, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  COSTING_ASSIGNEES,
  COSTING_ORGANIZATIONS,
  COSTING_STATUS_OPTIONS,
  type CostingAssignee,
  type CostingStatus,
  type TenderCostingRow,
} from "./mock-data";
import { useCostingRows } from "./use-costing-rows";

const STATUS_TONE: Record<CostingStatus, StatusBadgeTone> = {
  Completed: "success",
  "In Progress": "warning",
  Pending: "purple",
};

type SortKey = "estimatedValue" | "estimatedCost" | "ourCost";

interface FilterDraft {
  tenderId: string;
  workName: string;
  organization: string;
  status: string;
  assignedTo: string;
  marginMin: string;
  marginMax: string;
}

const EMPTY_DRAFT: FilterDraft = {
  tenderId: "",
  workName: "",
  organization: "",
  status: "",
  assignedTo: "",
  marginMin: "",
  marginMax: "",
};

const OPTIONAL_COLUMNS = [
  { key: "work", label: "Work / Tender Name" },
  { key: "org", label: "Organization" },
  { key: "estValue", label: "Estimated Value (BDT)" },
  { key: "estCost", label: "Estimated Cost (BDT)" },
  { key: "ourCost", label: "Our Cost (BDT)" },
  { key: "margin", label: "Margin (%)" },
  { key: "status", label: "Status" },
  { key: "assigned", label: "Assigned To" },
  { key: "updated", label: "Last Updated" },
] as const;

const CSV_HEADER = [
  "Tender ID",
  "Work / Tender Name",
  "Organization",
  "Estimated Value (BDT)",
  "Estimated Cost (BDT)",
  "Our Cost (BDT)",
  "Margin (%)",
  "Status",
  "Assigned To",
  "Last Updated",
];

function toCsvRow(row: TenderCostingRow): string[] {
  return [
    row.tenderId,
    row.workName,
    row.organization,
    String(row.estimatedValue),
    String(row.estimatedCost),
    String(row.ourCost),
    `${row.marginPercent.toFixed(2)}%`,
    row.status,
    row.assignedTo.name,
    formatDate(row.lastUpdated),
  ];
}

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

function AssigneeCell({ assignee }: { assignee: CostingAssignee }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ backgroundColor: assignee.color }}
      >
        {assignee.initial}
      </span>
      <span className="whitespace-nowrap">{assignee.name}</span>
    </span>
  );
}

export default function TenderCostingPage() {
  useSetBreadcrumb([{ label: "Tender Management", href: "/tender-management" }, { label: "Tender Costing" }]);

  const rows = useCostingRows();
  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [viewMode, setViewMode] = React.useState<"list" | "grid">("list");
  const [filterPanelOpen, setFilterPanelOpen] = React.useState(true);
  const [moreFiltersOpen, setMoreFiltersOpen] = React.useState(false);
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);
  const [dateRange, setDateRange] = React.useState({ from: "2024-05-01", to: "2024-05-31" });
  const [exportOpen, setExportOpen] = React.useState(false);
  const [columnSettingOpen, setColumnSettingOpen] = React.useState(false);
  const [hiddenColumns, setHiddenColumns] = React.useState<Set<string>>(new Set());
  const [menuAnchor, setMenuAnchor] = React.useState<{ id: string; top: number; right: number } | null>(null);
  const [viewing, setViewing] = React.useState<TenderCostingRow | null>(null);

  const limit = 10;

  function applyFilters(next: FilterDraft = draft) {
    setQuery(next);
    setPage(1);
  }

  function resetFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery(EMPTY_DRAFT);
    setPage(1);
    setMoreFiltersOpen(false);
  }

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current?.key !== key) return { key, dir: "asc" };
      if (current.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  const filtered = React.useMemo(() => {
    const tenderIdTerm = query.tenderId.trim().toLowerCase();
    const workNameTerm = query.workName.trim().toLowerCase();
    const marginMin = query.marginMin ? Number(query.marginMin) : null;
    const marginMax = query.marginMax ? Number(query.marginMax) : null;

    let list = rows.filter((row) => {
      if (tenderIdTerm && !row.tenderId.toLowerCase().includes(tenderIdTerm)) return false;
      if (workNameTerm && !row.workName.toLowerCase().includes(workNameTerm)) return false;
      if (query.organization && row.organization !== query.organization) return false;
      if (query.status && row.status !== query.status) return false;
      if (query.assignedTo && row.assignedTo.name !== query.assignedTo) return false;
      if (marginMin !== null && row.marginPercent < marginMin) return false;
      if (marginMax !== null && row.marginPercent > marginMax) return false;
      return true;
    });

    if (sort) {
      const { key, dir } = sort;
      list = [...list].sort((a, b) => (a[key] - b[key]) * (dir === "asc" ? 1 : -1));
    }

    return list;
  }, [rows, query, sort]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * limit, safePage * limit);

  const completedCount = rows.filter((row) => row.status === "Completed").length;
  const inProgressCount = rows.filter((row) => row.status === "In Progress").length;
  const pendingCount = rows.filter((row) => row.status === "Pending").length;
  const totalEstimatedValue = rows.reduce((sum, row) => sum + row.estimatedValue, 0);
  const pct = (count: number) => (rows.length > 0 ? ((count / rows.length) * 100).toFixed(2) : "0.00");

  function toggleMenu(id: string, e: React.MouseEvent<HTMLButtonElement>) {
    if (menuAnchor?.id === id) {
      setMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuAnchor({ id, top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  function exportRowCsv(row: TenderCostingRow) {
    downloadCsv(`${row.tenderId}.csv`, [CSV_HEADER, toCsvRow(row)]);
    setMenuAnchor(null);
  }

  function exportListCsv() {
    downloadCsv("tender-costing.csv", [CSV_HEADER, ...filtered.map(toCsvRow)]);
    setExportOpen(false);
  }

  function toggleColumn(key: string) {
    setHiddenColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allColumns: DataTableColumn<TenderCostingRow>[] = [
    {
      key: "tenderId",
      header: "Tender ID",
      render: (row) => (
        <button
          type="button"
          onClick={() => setViewing(row)}
          className="font-medium text-biz-blue hover:underline"
        >
          {row.tenderId}
        </button>
      ),
    },
    { key: "work", header: "Work / Tender Name", render: (row) => row.workName },
    { key: "org", header: "Organization", render: (row) => row.organization },
    {
      key: "estValue",
      header: "Estimated Value (BDT)",
      sortable: true,
      sortDirection: sort?.key === "estimatedValue" ? sort.dir : null,
      onSort: () => toggleSort("estimatedValue"),
      render: (row) => row.estimatedValue.toLocaleString(),
      className: "text-right",
    },
    {
      key: "estCost",
      header: "Estimated Cost (BDT)",
      sortable: true,
      sortDirection: sort?.key === "estimatedCost" ? sort.dir : null,
      onSort: () => toggleSort("estimatedCost"),
      render: (row) => row.estimatedCost.toLocaleString(),
      className: "text-right",
    },
    {
      key: "ourCost",
      header: "Our Cost (BDT)",
      sortable: true,
      sortDirection: sort?.key === "ourCost" ? sort.dir : null,
      onSort: () => toggleSort("ourCost"),
      render: (row) => row.ourCost.toLocaleString(),
      className: "text-right",
    },
    {
      key: "margin",
      header: "Margin (%)",
      render: (row) => <span className="font-medium text-biz-success">{row.marginPercent.toFixed(2)}%</span>,
      className: "text-right",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge label={row.status} tone={STATUS_TONE[row.status]} />,
    },
    { key: "assigned", header: "Assigned To", render: (row) => <AssigneeCell assignee={row.assignedTo} /> },
    { key: "updated", header: "Last Updated", render: (row) => formatDate(row.lastUpdated) },
    {
      key: "action",
      header: "Action",
      render: (row) => (
        <div className="flex items-center justify-center gap-1.5">
          <SecondaryButton onClick={() => setViewing(row)} className="h-8 gap-1.5 px-2.5 text-[12px]">
            <Eye className="h-3.5 w-3.5" />
            View
          </SecondaryButton>
          <IconButton aria-label="More actions" title="More actions" onClick={(e) => toggleMenu(row.id, e)}>
            <MoreVertical className="h-4 w-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  const visibleColumns = allColumns.filter(
    (col) => col.key === "tenderId" || col.key === "action" || !hiddenColumns.has(col.key),
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title text-biz-text">Tender Costing</h1>
          <p className="mt-0.5 text-[12.5px] text-biz-muted">Tender Management &gt; Tender Costing</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SecondaryButton onClick={() => setDateRangeOpen((v) => !v)} className="h-9">
              <Calendar className="h-4 w-4" />
              {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
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
                      From
                      <input
                        type="date"
                        value={dateRange.from}
                        onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                    <label className="text-[11px] font-medium text-biz-muted">
                      To
                      <input
                        type="date"
                        value={dateRange.to}
                        onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                    <PrimaryButton className="mt-1 h-9" onClick={() => setDateRangeOpen(false)}>
                      Apply
                    </PrimaryButton>
                  </div>
                </div>
              </>
            )}
          </div>

          <SecondaryButton onClick={() => setFilterPanelOpen((v) => !v)} className="h-9">
            <Filter className="h-4 w-4" />
            Filter
          </SecondaryButton>

          <div className="relative">
            <SecondaryButton onClick={() => setExportOpen((v) => !v)} className="h-9">
              <Download className="h-4 w-4" />
              Export
            </SecondaryButton>
            {exportOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40"
                  onClick={() => setExportOpen(false)}
                  aria-label="Close"
                />
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[180px] overflow-hidden rounded-md border border-biz-border bg-biz-surface py-1 shadow-card-hover">
                  <button
                    type="button"
                    onClick={exportListCsv}
                    className="flex w-full items-center px-3 py-2 text-left text-[12.5px] text-biz-text hover:bg-biz-bg"
                  >
                    Export as CSV
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Export as PDF (not yet available)"
                    className="flex w-full cursor-not-allowed items-center px-3 py-2 text-left text-[12.5px] text-biz-muted"
                  >
                    Export as PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Link href="/tender-management/tender-costing/add">
          <PrimaryButton className="h-9">
            <Plus className="h-4 w-4" />
            Add New Costing
          </PrimaryButton>
        </Link>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
        <ModuleStatCard
          icon={Folder}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Costing"
          value={String(rows.length)}
          helper="In selected period"
        />
        <ModuleStatCard
          icon={Hourglass}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Completed"
          value={String(completedCount)}
          helper={`${pct(completedCount)}% of total`}
        />
        <ModuleStatCard
          icon={Loader2}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="In Progress"
          value={String(inProgressCount)}
          helper={`${pct(inProgressCount)}% of total`}
        />
        <ModuleStatCard
          icon={Clock}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Pending"
          value={String(pendingCount)}
          helper={`${pct(pendingCount)}% of total`}
        />
        <ModuleStatCard
          icon={Banknote}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Total Estimated Value (BDT)"
          value={formatBDTCompact(totalEstimatedValue)}
          helper="In selected period"
        />
      </div>

      {/* Filter Panel */}
      {filterPanelOpen && (
        <div className="rounded-lg border border-biz-border bg-biz-surface p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-1 min-w-[160px] flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Search by Tender ID</label>
              <TextInput
                icon={Search}
                placeholder="Enter Tender ID..."
                value={draft.tenderId}
                onChange={(e) => setDraft((d) => ({ ...d, tenderId: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              />
            </div>

            <div className="flex flex-1 min-w-[180px] flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Search by Work / Tender Name</label>
              <TextInput
                icon={Search}
                placeholder="Enter Work / Tender Name..."
                value={draft.workName}
                onChange={(e) => setDraft((d) => ({ ...d, workName: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Organization</label>
              <SelectInput
                className="w-[160px]"
                placeholder="All Organization"
                value={draft.organization}
                onChange={(e) => setDraft((d) => ({ ...d, organization: e.target.value }))}
                options={COSTING_ORGANIZATIONS.map((org) => ({ label: org, value: org }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Status</label>
              <SelectInput
                className="w-[150px]"
                placeholder="All Status"
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                options={COSTING_STATUS_OPTIONS.map((s) => ({ label: s, value: s }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Assigned To</label>
              <SelectInput
                className="w-[160px]"
                placeholder="All User"
                value={draft.assignedTo}
                onChange={(e) => setDraft((d) => ({ ...d, assignedTo: e.target.value }))}
                options={COSTING_ASSIGNEES.map((a) => ({ label: a.name, value: a.name }))}
              />
            </div>

            <SecondaryButton onClick={() => setMoreFiltersOpen((v) => !v)}>
              <SlidersHorizontal className="h-4 w-4" />
              More Filters
            </SecondaryButton>

            <PrimaryButton onClick={() => applyFilters()}>Search</PrimaryButton>
            <SecondaryButton onClick={resetFilters}>Reset</SecondaryButton>
          </div>

          {moreFiltersOpen && (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-biz-border pt-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-biz-muted">Min Margin (%)</label>
                <TextInput
                  type="number"
                  className="w-[120px]"
                  placeholder="0"
                  value={draft.marginMin}
                  onChange={(e) => setDraft((d) => ({ ...d, marginMin: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-biz-muted">Max Margin (%)</label>
                <TextInput
                  type="number"
                  className="w-[120px]"
                  placeholder="100"
                  value={draft.marginMax}
                  onChange={(e) => setDraft((d) => ({ ...d, marginMax: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tender Costing List */}
      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Tender Costing List ({total})</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <SecondaryButton onClick={() => setColumnSettingOpen((v) => !v)} className="h-8 gap-1.5 px-2.5 text-[12px]">
                <Settings2 className="h-3.5 w-3.5" />
                Column Setting
              </SecondaryButton>
              {columnSettingOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40"
                    onClick={() => setColumnSettingOpen(false)}
                    aria-label="Close"
                  />
                  <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[220px] rounded-lg border border-biz-border bg-biz-surface p-2 shadow-card-hover">
                    {OPTIONAL_COLUMNS.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-biz-text hover:bg-biz-bg"
                      >
                        <input
                          type="checkbox"
                          checked={!hiddenColumns.has(col.key)}
                          onChange={() => toggleColumn(col.key)}
                          className="h-3.5 w-3.5 rounded border-biz-border text-biz-blue focus:ring-biz-blue/30"
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 rounded-md border border-biz-border p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="List view"
                title="List view"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded",
                  viewMode === "list" ? "bg-biz-blue text-white" : "text-biz-muted hover:bg-biz-bg",
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                title="Grid view"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded",
                  viewMode === "grid" ? "bg-biz-blue text-white" : "text-biz-muted hover:bg-biz-bg",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pageRows.length === 0 ? (
              <p className="col-span-full px-4 py-8 text-center text-biz-muted">No records found</p>
            ) : (
              pageRows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-2 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-[0_1px_4px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setViewing(row)}
                      className="text-left text-[13px] font-semibold text-biz-blue hover:underline"
                    >
                      {row.tenderId}
                    </button>
                    <StatusBadge label={row.status} tone={STATUS_TONE[row.status]} />
                  </div>
                  <p className="text-[12.5px] font-medium leading-snug text-biz-text">{row.workName}</p>
                  <p className="text-[11.5px] text-biz-muted">{row.organization}</p>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                    <span className="text-biz-muted">Est. Value</span>
                    <span className="text-right font-medium text-biz-text">{formatBDT(row.estimatedValue)}</span>
                    <span className="text-biz-muted">Our Cost</span>
                    <span className="text-right font-medium text-biz-text">{formatBDT(row.ourCost)}</span>
                    <span className="text-biz-muted">Margin</span>
                    <span className="text-right font-semibold text-biz-success">{row.marginPercent.toFixed(2)}%</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-biz-border pt-2">
                    <AssigneeCell assignee={row.assignedTo} />
                    <div className="flex items-center gap-1">
                      <SecondaryButton onClick={() => setViewing(row)} className="h-7 gap-1 px-2 text-[11px]">
                        <Eye className="h-3 w-3" />
                        View
                      </SecondaryButton>
                      <IconButton
                        aria-label="More actions"
                        title="More actions"
                        onClick={(e) => toggleMenu(row.id, e)}
                        className="h-7 w-7"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <DataTable<TenderCostingRow> data={pageRows} rowKey={(row) => row.id} columns={visibleColumns} />
        )}

        <Pagination
          page={safePage}
          limit={limit}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          showJumpButtons
        />
      </div>

      {/* Bottom info bar */}
      <div className="flex items-center gap-2 rounded-lg border border-biz-blue/20 bg-biz-blue-soft px-4 py-2.5 text-[12.5px] text-biz-text">
        <Info className="h-4 w-4 shrink-0 text-biz-blue" />
        <span>Click on any tender to view costing details including item wise cost, margin analysis and history.</span>
      </div>

      {/* Row action menu */}
      {menuAnchor && (
        <>
          <button type="button" className="fixed inset-0 z-40" aria-label="Close" onClick={() => setMenuAnchor(null)} />
          <div
            className="fixed z-50 w-[160px] overflow-hidden rounded-md border border-biz-border bg-biz-surface py-1 shadow-card-hover"
            style={{ top: menuAnchor.top, right: menuAnchor.right }}
          >
            <button
              type="button"
              onClick={() => {
                const row = rows.find((r) => r.id === menuAnchor.id);
                if (row) exportRowCsv(row);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-biz-text hover:bg-biz-bg"
            >
              <Download className="h-3.5 w-3.5" />
              Export Row
            </button>
          </div>
        </>
      )}

      {/* View details modal */}
      {viewing && (
        <>
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setViewing(null)}
            className="fixed inset-0 z-40 bg-biz-navy/25"
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-biz-border bg-biz-surface shadow-card-hover">
            <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
              <h3 className="text-[14px] font-semibold text-biz-text">{viewing.tenderId}</h3>
              <IconButton aria-label="Close" onClick={() => setViewing(null)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3">
              {(
                [
                  ["Work / Tender Name", viewing.workName],
                  ["Organization", viewing.organization],
                  ["Estimated Value (BDT)", formatBDT(viewing.estimatedValue)],
                  ["Estimated Cost (BDT)", formatBDT(viewing.estimatedCost)],
                  ["Our Cost (BDT)", formatBDT(viewing.ourCost)],
                  ["Margin (%)", `${viewing.marginPercent.toFixed(2)}%`],
                  ["Status", viewing.status],
                  ["Assigned To", viewing.assignedTo.name],
                  ["Last Updated", formatDate(viewing.lastUpdated)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-biz-muted">{label}</span>
                  <span className="text-right font-medium text-biz-text">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
