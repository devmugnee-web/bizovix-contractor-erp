"use client";

import * as React from "react";
import {
  Award,
  Calendar,
  Coins,
  Download,
  Eye,
  Filter,
  Hourglass,
  Play,
  Search,
  Send,
  SquareStack,
  X,
  XCircle,
} from "lucide-react";
import { useTenderStats } from "@bizovix/api-client";
import {
  DataTable,
  IconButton,
  ModuleStatCard,
  Pagination,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
  type StatusBadgeTone,
} from "@bizovix/ui";
import { formatBDTCompact, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { MiniDataCard } from "@/components/tender-management/MiniDataCard";
import { SearchActivityShareCard } from "@/components/tender-management/SearchActivityShareCard";
import {
  ITEM_PRICE_HISTORY_ROWS,
  SEARCH_ACTIVITY_SHARE,
  SLT_CALCULATION_ROWS,
  TENDER_COSTING_ROWS,
  TENDER_SEARCH_ACTIVITIES,
  type CostingStatus,
  type Priority,
  type SearchStatus,
} from "./mock-data";

// "Total Value" has no backing API field on TenderStats yet — every other KPI
// below reads from the real useTenderStats() hook. This one constant is the
// only mocked KPI value on the page; replace once the backend exposes it.
const MOCK_TOTAL_TENDER_VALUE = 456_800_000;

const SEARCH_STATUS_TONE: Record<SearchStatus, StatusBadgeTone> = {
  New: "info",
  "In Progress": "warning",
  Qualified: "purple",
  Closed: "neutral",
};

const PRIORITY_TONE: Record<Priority, StatusBadgeTone> = {
  High: "danger",
  Medium: "warning",
  Low: "neutral",
};

const COSTING_STATUS_TONE: Record<CostingStatus, StatusBadgeTone> = {
  Completed: "success",
  "In Progress": "warning",
  Pending: "neutral",
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

export default function TenderManagementPage() {
  useSetBreadcrumb([{ label: "Tender Management" }]);

  const stats = useTenderStats();

  const [search, setSearch] = React.useState("");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [orgFilter, setOrgFilter] = React.useState("");
  const [priorityFilter, setPriorityFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [filterPanelOpen, setFilterPanelOpen] = React.useState(false);
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);
  const [dateRange, setDateRange] = React.useState({ from: "2024-05-01", to: "2024-05-31" });
  const [viewing, setViewing] = React.useState<{ title: string; fields: Array<[string, string]> } | null>(null);

  function openView(title: string, fields: Array<[string, string]>) {
    setViewing({ title, fields });
  }

  const [costingSearch, setCostingSearch] = React.useState("");
  const [sltSearch, setSltSearch] = React.useState("");

  const organizations = React.useMemo(
    () => Array.from(new Set(TENDER_SEARCH_ACTIVITIES.map((row) => row.organization))).sort(),
    [],
  );

  const filteredActivities = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return TENDER_SEARCH_ACTIVITIES.filter((row) => {
      const matchesSearch =
        !term ||
        row.tenderSearchId.toLowerCase().includes(term) ||
        row.workName.toLowerCase().includes(term);
      const matchesOrg = !orgFilter || row.organization === orgFilter;
      const matchesPriority = !priorityFilter || row.priority === priorityFilter;
      return matchesSearch && matchesOrg && matchesPriority;
    });
  }, [search, orgFilter, priorityFilter]);

  const limit = 5;
  const total = filteredActivities.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const pagedActivities = filteredActivities.slice((safePage - 1) * limit, safePage * limit);

  function applySearch() {
    setPage(1);
  }

  function resetFilters() {
    setSearch("");
    setOrgFilter("");
    setPriorityFilter("");
    setAdvancedOpen(false);
    setPage(1);
  }

  const costingRows = React.useMemo(() => {
    const term = costingSearch.trim().toLowerCase();
    return TENDER_COSTING_ROWS.filter((row) => !term || row.tenderId.toLowerCase().includes(term));
  }, [costingSearch]);

  const sltRows = React.useMemo(() => {
    const term = sltSearch.trim().toLowerCase();
    return SLT_CALCULATION_ROWS.filter((row) => !term || row.tenderId.toLowerCase().includes(term));
  }, [sltSearch]);

  function exportSearchTeamCsv() {
    const header = [
      "Tender ID",
      "Work / Tender Name",
      "Organization",
      "Source",
      "Search Date",
      "Assigned To",
      "Next Follow Up",
      "Status",
      "Priority",
    ];
    const rows = filteredActivities.map((row) => [
      row.tenderSearchId,
      row.workName,
      row.organization,
      row.source,
      formatDate(row.searchDate),
      row.assignedTo.name,
      formatDate(row.nextFollowUp),
      row.status,
      row.priority,
    ]);
    downloadCsv("tender-search-team.csv", [header, ...rows]);
  }

  const preparingPercent = stats.data && stats.data.total > 0 ? ((stats.data.preparing / stats.data.total) * 100).toFixed(2) : "0.00";
  const submittedPercent = stats.data && stats.data.total > 0 ? ((stats.data.submitted / stats.data.total) * 100).toFixed(2) : "0.00";
  const awardedPercent = stats.data && stats.data.total > 0 ? ((stats.data.awarded / stats.data.total) * 100).toFixed(2) : "0.00";
  const unsuccessfulPercent = stats.data && stats.data.total > 0 ? ((stats.data.unsuccessful / stats.data.total) * 100).toFixed(2) : "0.00";

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-biz-border bg-biz-surface px-4 py-3 shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
        <div>
          <h1 className="text-page-title text-biz-text">Tender Management</h1>
          <p className="mt-0.5 text-[12.5px] text-biz-muted">Manage, track and analyze all tender activities in one place</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SecondaryButton onClick={() => setDateRangeOpen((v) => !v)} className="h-9">
              <Calendar className="h-4 w-4" />
              {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
            </SecondaryButton>
            {dateRangeOpen && (
              <>
                <button type="button" className="fixed inset-0 z-40" onClick={() => setDateRangeOpen(false)} aria-label="Close" />
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
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <SecondaryButton onClick={() => setFilterPanelOpen((v) => !v)} className="h-9">
              <Filter className="h-4 w-4" />
              Filter
            </SecondaryButton>
            {filterPanelOpen && (
              <>
                <button type="button" className="fixed inset-0 z-40" onClick={() => setFilterPanelOpen(false)} aria-label="Close" />
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[240px] rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card-hover">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-biz-muted">Organization</label>
                      <SelectInput
                        className="h-9 w-full"
                        placeholder="All"
                        value={orgFilter}
                        onChange={(e) => {
                          setOrgFilter(e.target.value);
                          setPage(1);
                        }}
                        options={organizations.map((org) => ({ label: org, value: org }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-biz-muted">Priority</label>
                      <SelectInput
                        className="h-9 w-full"
                        placeholder="All"
                        value={priorityFilter}
                        onChange={(e) => {
                          setPriorityFilter(e.target.value);
                          setPage(1);
                        }}
                        options={[
                          { label: "High", value: "High" },
                          { label: "Medium", value: "Medium" },
                          { label: "Low", value: "Low" },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={exportSearchTeamCsv}
            title="Export as CSV"
            className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-sm bg-biz-success px-4 text-[13px] font-medium text-white transition-colors hover:brightness-95"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
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
          icon={Hourglass}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Under Preparation"
          value={String(stats.data?.preparing ?? "—")}
          helper={`${preparingPercent}% of total`}
        />
        <ModuleStatCard
          icon={Send}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Submitted"
          value={String(stats.data?.submitted ?? "—")}
          helper={`${submittedPercent}% of total`}
        />
        <ModuleStatCard
          icon={Award}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Won / NOA"
          value={String(stats.data?.awarded ?? "—")}
          helper={`${awardedPercent}% of total`}
        />
        <ModuleStatCard
          icon={XCircle}
          iconClassName="bg-biz-danger-soft text-biz-danger"
          label="Lost"
          value={String(stats.data?.unsuccessful ?? "—")}
          helper={`${unsuccessfulPercent}% of total`}
        />
        <ModuleStatCard
          icon={Coins}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Total Value (BDT)"
          value={formatBDTCompact(MOCK_TOTAL_TENDER_VALUE)}
          helper="All Time"
        />
      </div>

      {/* Middle Row: Tender Search Team + Search Activity Share */}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[65fr_35fr] xl:grid-cols-[70fr_30fr]">
        <div className="flex flex-col overflow-hidden rounded-xl border border-biz-border bg-biz-surface shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-biz-blue text-[11px] font-bold text-white">
                1
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-[13px] font-semibold text-biz-text">Tender Search Team</h3>
                <p className="truncate text-[10.5px] text-biz-muted">Track tender search activities by team members</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                icon={Search}
                placeholder="Search by Tender ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                className="h-9 w-[220px]"
              />
              <SecondaryButton onClick={resetFilters} className="h-9">
                Reset
              </SecondaryButton>
              <SecondaryButton onClick={() => setAdvancedOpen((v) => !v)} className="h-9">
                Advanced Search
              </SecondaryButton>
            </div>
          </div>

          {advancedOpen && (
            <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-biz-border bg-biz-bg/60 px-3 py-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-biz-muted">Organization</label>
                <SelectInput
                  className="h-9 w-[160px]"
                  placeholder="All"
                  value={orgFilter}
                  onChange={(e) => {
                    setOrgFilter(e.target.value);
                    setPage(1);
                  }}
                  options={organizations.map((org) => ({ label: org, value: org }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-biz-muted">Priority</label>
                <SelectInput
                  className="h-9 w-[140px]"
                  placeholder="All"
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value);
                    setPage(1);
                  }}
                  options={[
                    { label: "High", value: "High" },
                    { label: "Medium", value: "Medium" },
                    { label: "Low", value: "Low" },
                  ]}
                />
              </div>
            </div>
          )}

          <DataTable
            data={pagedActivities}
            rowKey={(row) => row.id}
            columns={[
              { key: "id", header: "Tender ID", render: (row) => row.tenderSearchId },
              { key: "work", header: "Work / Tender Name", render: (row) => row.workName },
              { key: "org", header: "Organization", render: (row) => row.organization },
              {
                key: "source",
                header: "Source",
                render: (row) => <StatusBadge label={row.source} tone="info" />,
              },
              { key: "date", header: "Search Date", render: (row) => formatDate(row.searchDate) },
              {
                key: "assigned",
                header: "Assigned To",
                render: (row) => (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                      style={{ backgroundColor: row.assignedTo.color }}
                    >
                      {row.assignedTo.initial}
                    </span>
                    <span className="whitespace-nowrap">{row.assignedTo.name}</span>
                  </span>
                ),
              },
              { key: "followUp", header: "Next Follow Up", render: (row) => formatDate(row.nextFollowUp) },
              {
                key: "status",
                header: "Status",
                render: (row) => <StatusBadge label={row.status} tone={SEARCH_STATUS_TONE[row.status]} />,
              },
              {
                key: "priority",
                header: "Priority",
                render: (row) => <StatusBadge label={row.priority} tone={PRIORITY_TONE[row.priority]} />,
              },
              {
                key: "action",
                header: "Action",
                render: (row) => (
                  <IconButton
                    aria-label={`View ${row.tenderSearchId}`}
                    title="View"
                    onClick={() =>
                      openView(row.tenderSearchId, [
                        ["Work / Tender Name", row.workName],
                        ["Organization", row.organization],
                        ["Source", row.source],
                        ["Search Date", formatDate(row.searchDate)],
                        ["Assigned To", row.assignedTo.name],
                        ["Next Follow Up", formatDate(row.nextFollowUp)],
                        ["Status", row.status],
                        ["Priority", row.priority],
                      ])
                    }
                  >
                    <Eye className="h-4 w-4" />
                  </IconButton>
                ),
              },
            ]}
          />

          <div className="shrink-0 border-t border-biz-border">
            <Pagination
              page={safePage}
              limit={limit}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        </div>

        <SearchActivityShareCard items={SEARCH_ACTIVITY_SHARE} />
      </div>

      {/* Bottom Row: Tender Costing, SLT Calculation, Item Price History, Help + Quick Tip */}
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-[27fr_27fr_27fr_19fr]">
        <MiniDataCard
          badgeNumber={1}
          badgeClassName="bg-biz-orange-soft text-biz-orange"
          title="Tender Costing"
          subtitle="Costing summary of tenders"
          searchValue={costingSearch}
          onSearchChange={setCostingSearch}
          addLabel="Add Costing"
          data={costingRows}
          rowKey={(row) => row.id}
          footerLabel="View All Tender Costing"
          columns={[
            { key: "id", header: "Tender ID", render: (row) => row.tenderId },
            { key: "work", header: "Work Name", render: (row) => row.workName },
            { key: "est", header: "Est. Cost", render: (row) => row.estimatedCost.toLocaleString() },
            { key: "our", header: "Our Cost", render: (row) => row.ourCost.toLocaleString() },
            { key: "margin", header: "Margin (%)", render: (row) => `${row.marginPercent.toFixed(2)}%` },
            {
              key: "status",
              header: "Status",
              render: (row) => <StatusBadge label={row.status} tone={COSTING_STATUS_TONE[row.status]} />,
            },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <IconButton
                  aria-label={`View ${row.tenderId}`}
                  title="View"
                  onClick={() =>
                    openView(row.tenderId, [
                      ["Work Name", row.workName],
                      ["Estimated Cost", row.estimatedCost.toLocaleString()],
                      ["Our Cost", row.ourCost.toLocaleString()],
                      ["Margin (%)", `${row.marginPercent.toFixed(2)}%`],
                      ["Status", row.status],
                    ])
                  }
                >
                  <Eye className="h-3.5 w-3.5" />
                </IconButton>
              ),
            },
          ]}
        />

        <MiniDataCard
          id="slt-calculation-card"
          badgeNumber={2}
          badgeClassName="bg-biz-success-soft text-biz-success"
          title="SLT Calculation Details"
          subtitle="Status of SLT calculations for tenders"
          searchValue={sltSearch}
          onSearchChange={setSltSearch}
          addLabel="Add New SLT"
          data={sltRows}
          rowKey={(row) => row.id}
          footerLabel="View All SLT Calculations"
          columns={[
            { key: "id", header: "Tender ID", render: (row) => row.tenderId },
            { key: "work", header: "Work / Tender Name", render: (row) => row.workName },
            { key: "org", header: "Organization", render: (row) => row.organization },
            { key: "amount", header: "SLT Amount (BDT)", render: (row) => row.sltAmount.toLocaleString() },
            {
              key: "status",
              header: "Status",
              render: (row) => <StatusBadge label={row.status} tone={COSTING_STATUS_TONE[row.status]} />,
            },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <IconButton
                  aria-label={`View ${row.tenderId}`}
                  title="View"
                  onClick={() =>
                    openView(row.tenderId, [
                      ["Work / Tender Name", row.workName],
                      ["Organization", row.organization],
                      ["SLT Amount (BDT)", row.sltAmount.toLocaleString()],
                      ["Status", row.status],
                    ])
                  }
                >
                  <Eye className="h-3.5 w-3.5" />
                </IconButton>
              ),
            },
          ]}
        />

        <MiniDataCard
          badgeNumber={3}
          badgeClassName="bg-biz-purple-soft text-biz-purple"
          title="Item Price History"
          subtitle="Track item price & supplier history"
          data={ITEM_PRICE_HISTORY_ROWS}
          rowKey={(row) => row.id}
          footerLabel="View All Item Price History"
          columns={[
            { key: "item", header: "Item / Description", render: (row) => row.itemDescription },
            { key: "brand", header: "Brand / Model", render: (row) => row.brandModel },
            { key: "supplier", header: "Supplier", render: (row) => row.supplier },
            { key: "price", header: "Latest Price (BDT)", render: (row) => row.latestPrice.toLocaleString() },
            { key: "updated", header: "Updated On", render: (row) => formatDate(row.updatedOn) },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <IconButton
                  aria-label={`View ${row.itemDescription}`}
                  title="View"
                  onClick={() =>
                    openView(row.itemDescription, [
                      ["Brand / Model", row.brandModel],
                      ["Supplier", row.supplier],
                      ["Latest Price (BDT)", row.latestPrice.toLocaleString()],
                      ["Updated On", formatDate(row.updatedOn)],
                    ])
                  }
                >
                  <Eye className="h-3.5 w-3.5" />
                </IconButton>
              ),
            },
          ]}
        />

        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-biz-blue/20 bg-biz-blue-soft p-3">
            <h3 className="text-[13px] font-semibold text-biz-text">Need Help?</h3>
            <p className="mt-1 text-[11.5px] leading-snug text-biz-muted">Learn how Tender Management works</p>
            <button
              type="button"
              onClick={() =>
                document.getElementById("slt-calculation-card")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-biz-blue/30 bg-biz-surface px-3 py-1.5 text-[12px] font-semibold text-biz-blue transition-colors hover:bg-biz-blue-soft"
            >
              <Play className="h-3 w-3 fill-current" />
              How SLT Works?
            </button>
          </div>
          <div className="rounded-xl border border-biz-success/20 bg-biz-success-soft p-3">
            <h3 className="text-[13px] font-semibold text-biz-text">Quick Tip</h3>
            <p className="mt-1 text-[11.5px] leading-snug text-biz-muted">
              Keep your item prices updated for more accurate costing.
            </p>
          </div>
        </div>
      </div>

      {viewing && (
        <>
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setViewing(null)}
            className="fixed inset-0 z-40 bg-biz-navy/25"
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[380px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-biz-border bg-biz-surface shadow-card-hover">
            <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
              <h3 className="text-[14px] font-semibold text-biz-text">{viewing.title}</h3>
              <IconButton aria-label="Close" onClick={() => setViewing(null)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3">
              {viewing.fields.map(([label, value]) => (
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
