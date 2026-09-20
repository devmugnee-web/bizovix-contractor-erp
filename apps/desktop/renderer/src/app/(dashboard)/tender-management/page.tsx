"use client";

import * as React from "react";
import {
  Award,
  BriefcaseBusiness,
  Calendar,
  Calculator,
  Coins,
  Download,
  Filter,
  FunctionSquare,
  History,
  Hourglass,
  Search,
  Send,
  SquareStack,
  UsersRound,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  useItemPriceHistory,
  useTenderCostings,
  useTenders,
  useTenderStats,
} from "@bizovix/api-client";
import {
  DataTable,
  IconButton,
  Pagination,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
  cn,
  type StatusBadgeTone,
} from "@bizovix/ui";
import { formatBDTCompact, formatDate } from "@bizovix/utils";
import type { TenderCostingStatus, TenderStatus } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  SearchActivityShareCard,
  type SearchActivityShareItem,
} from "@/components/tender-management/SearchActivityShareCard";

type Priority = "High" | "Medium" | "Low";
type SearchStatus = "New" | "In Progress" | "Qualified" | "Closed";
type CostingStatus = "Completed" | "In Progress" | "Pending" | "Cancelled";

interface TeamMember {
  id: string;
  name: string;
  initial: string;
  color: string;
}

interface TenderSearchActivity {
  id: string;
  tenderSearchId: string;
  workName: string;
  organization: string;
  source: string;
  searchDate: string;
  assignedTo: TeamMember;
  nextFollowUp: string;
  status: SearchStatus;
  priority: Priority;
}

interface TenderCostingRow {
  id: string;
  tenderId: string;
  workName: string;
  estimatedCost: number;
  ourCost: number;
  marginPercent: number;
  status: CostingStatus;
}

interface SltCalculationRow {
  id: string;
  tenderId: string;
  workName: string;
  organization: string;
  sltAmount: number;
  status: CostingStatus;
}

interface ItemPriceHistoryRow {
  id: string;
  itemDescription: string;
  brandModel: string;
  supplier: string;
  latestPrice: number;
  updatedOn: string;
}

const EMPTY_SLT_ROWS: SltCalculationRow[] = [];
const TEAM_COLORS = ["#2563EB", "#F97316", "#64748B", "#DB2777", "#DC2626", "#059669"];

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
  Cancelled: "danger",
};

function toTeamMember(
  id: string | null | undefined,
  name: string | null | undefined,
): TeamMember {
  const memberName = name?.trim() || "Unassigned";
  const memberId = id || memberName.toLowerCase().replace(/\s+/g, "-");
  const colorIndex = Array.from(memberId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    id: memberId,
    name: memberName,
    initial: memberName.charAt(0).toUpperCase() || "U",
    color: TEAM_COLORS[colorIndex % TEAM_COLORS.length]!,
  };
}

function toSearchStatus(status: TenderStatus): SearchStatus {
  if (status === "DRAFT" || status === "PUBLISHED") return "New";
  if (["NOA", "AWARDED", "ONGOING", "COMPLETED"].includes(status)) return "Qualified";
  if (status === "REJECTED" || status === "CANCELLED") return "Closed";
  return "In Progress";
}

function toCostingStatus(status: TenderCostingStatus): CostingStatus {
  if (status === "COMPLETED") return "Completed";
  if (status === "IN_PROGRESS") return "In Progress";
  if (status === "CANCELLED") return "Cancelled";
  return "Pending";
}

function toPriority(deadline: string | null): Priority {
  if (!deadline) return "Low";
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (days <= 3) return "High";
  if (days <= 7) return "Medium";
  return "Low";
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialDateRange() {
  const now = new Date();
  return {
    from: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

type InsightTab = "costing" | "slt" | "price";

const INSIGHT_TABS: Array<{
  key: InsightTab;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "costing", label: "Tender Costing", icon: Calculator },
  { key: "slt", label: "SLT Calculation", icon: FunctionSquare },
  { key: "price", label: "Item Price History", icon: History },
];

const SHORT_VIEWPORT_QUERY = "(max-height: 700px)";
const TALL_VIEWPORT_QUERY = "(min-height: 900px)";

function subscribeToShortViewport(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(SHORT_VIEWPORT_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getShortViewportSnapshot() {
  return window.matchMedia(SHORT_VIEWPORT_QUERY).matches;
}

function subscribeToTallViewport(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(TALL_VIEWPORT_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getTallViewportSnapshot() {
  return window.matchMedia(TALL_VIEWPORT_QUERY).matches;
}

function TenderKpiCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
  helper: string;
}) {
  const hasLongValue = value.length > 10;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-biz-border bg-gradient-to-b from-white to-slate-50/60 px-2.5 py-2 shadow-card transition-[border-color,box-shadow] duration-150 hover:border-slate-300 hover:shadow-card-hover [@media(max-height:700px)]:py-1.5 xl:px-3 2xl:gap-3 2xl:px-3.5 2xl:py-2.5">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md [@media(max-height:700px)]:h-7 [@media(max-height:700px)]:w-7 2xl:h-9 2xl:w-9",
          iconClassName,
        )}
      >
        <Icon className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold text-biz-muted xl:text-[11px] 2xl:text-[12px]">
          {label}
        </p>
        <div className="mt-0.5 min-w-0">
          <strong
            className={cn(
              "block whitespace-nowrap font-bold leading-none tracking-[-0.01em] text-biz-text",
              hasLongValue
                ? "text-[13px] xl:text-[14px] 2xl:text-[18px]"
                : "text-[16px] xl:text-[18px] 2xl:text-[20px]",
            )}
          >
            {value}
          </strong>
          <span className="mt-0.5 hidden truncate text-[9px] leading-none text-biz-muted 2xl:block">
            {helper}
          </span>
        </div>
      </div>
    </div>
  );
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

export default function TenderManagementPage() {
  useSetBreadcrumb([{ label: "Tender Management" }]);

  const stats = useTenderStats();
  const tenders = useTenders({ page: 1, limit: 500 });
  const tenderCostings = useTenderCostings({ page: 1, limit: 500 });
  const itemPriceHistory = useItemPriceHistory();
  const isShortViewport = React.useSyncExternalStore(
    subscribeToShortViewport,
    getShortViewportSnapshot,
    () => false,
  );
  const isTallViewport = React.useSyncExternalStore(
    subscribeToTallViewport,
    getTallViewportSnapshot,
    () => false,
  );

  const [search, setSearch] = React.useState("");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [orgFilter, setOrgFilter] = React.useState("");
  const [priorityFilter, setPriorityFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);
  const [dateRange, setDateRange] = React.useState(initialDateRange);
  const [viewing, setViewing] = React.useState<{
    title: string;
    fields: Array<[string, string]>;
  } | null>(null);

  function openView(title: string, fields: Array<[string, string]>) {
    setViewing({ title, fields });
  }

  const [costingSearch, setCostingSearch] = React.useState("");
  const [sltSearch, setSltSearch] = React.useState("");
  const [priceSearch, setPriceSearch] = React.useState("");
  const [activeInsight, setActiveInsight] = React.useState<InsightTab>("costing");

  const activities = React.useMemo<TenderSearchActivity[]>(
    () =>
      (tenders.data?.items ?? []).map((tender) => {
        const assignedTo = toTeamMember(
          tender.assignedToUserId ?? tender.foundByUserId ?? tender.createdById,
          tender.assignedToName ?? tender.foundBy?.name ?? tender.foundByName ?? tender.createdBy?.name,
        );
        const nextFollowUp =
          tender.submissionDeadline ?? tender.documentPurchaseDeadline ?? tender.openingDate ?? tender.updatedAt;
        return {
          id: tender.id,
          tenderSearchId: tender.egpTenderId ?? tender.id,
          workName: tender.workName,
          organization:
            tender.organizationMaster?.shortName ?? tender.noticeOrganization ?? "Not set",
          source: tender.egpTenderId ? "e-GP" : tender.procurementMethod,
          searchDate: tender.findingDate ?? tender.createdAt,
          assignedTo,
          nextFollowUp,
          status: toSearchStatus(tender.status),
          priority: toPriority(nextFollowUp),
        };
      }),
    [tenders.data?.items],
  );

  const organizations = React.useMemo(
    () => Array.from(new Set(activities.map((row) => row.organization))).sort(),
    [activities],
  );

  const activityShare = React.useMemo<SearchActivityShareItem[]>(() => {
    const byMember = new Map<string, SearchActivityShareItem>();
    for (const activity of activities) {
      const current = byMember.get(activity.assignedTo.id);
      if (current) current.count += 1;
      else byMember.set(activity.assignedTo.id, { member: activity.assignedTo, count: 1 });
    }
    return Array.from(byMember.values()).sort((left, right) => right.count - left.count);
  }, [activities]);

  const filteredActivities = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return activities.filter((row) => {
      const matchesSearch =
        !term ||
        row.tenderSearchId.toLowerCase().includes(term) ||
        row.workName.toLowerCase().includes(term);
      const matchesOrg = !orgFilter || row.organization === orgFilter;
      const matchesPriority = !priorityFilter || row.priority === priorityFilter;
      return matchesSearch && matchesOrg && matchesPriority;
    });
  }, [activities, search, orgFilter, priorityFilter]);

  const limit = isShortViewport ? 4 : isTallViewport ? 6 : 5;
  const total = filteredActivities.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const pagedActivities = filteredActivities.slice((safePage - 1) * limit, safePage * limit);

  function resetFilters() {
    setSearch("");
    setOrgFilter("");
    setPriorityFilter("");
    setAdvancedOpen(false);
    setPage(1);
  }

  const costingSourceRows = React.useMemo<TenderCostingRow[]>(
    () =>
      (tenderCostings.data?.items ?? []).map((costing) => ({
        id: costing.id,
        tenderId: costing.tender.egpTenderId ?? costing.tender.id,
        workName: costing.tender.workName,
        estimatedCost: Number(costing.estimatedCost),
        ourCost: Number(costing.ourCost),
        marginPercent: Number(costing.marginPercent),
        status: toCostingStatus(costing.status),
      })),
    [tenderCostings.data?.items],
  );

  const costingRows = React.useMemo(() => {
    const term = costingSearch.trim().toLowerCase();
    return costingSourceRows.filter(
      (row) =>
        !term ||
        row.tenderId.toLowerCase().includes(term) ||
        row.workName.toLowerCase().includes(term),
    );
  }, [costingSearch, costingSourceRows]);

  const sltRows = React.useMemo(() => {
    const term = sltSearch.trim().toLowerCase();
    return EMPTY_SLT_ROWS.filter(
      (row) =>
        !term ||
        row.tenderId.toLowerCase().includes(term) ||
        row.workName.toLowerCase().includes(term) ||
        row.organization.toLowerCase().includes(term),
    );
  }, [sltSearch]);

  const priceSourceRows = React.useMemo<ItemPriceHistoryRow[]>(
    () =>
      (itemPriceHistory.data ?? []).map((row) => ({
        id: row.id,
        itemDescription: row.itemDescription,
        brandModel: row.brandModel,
        supplier: row.supplier,
        latestPrice: row.currentPrice,
        updatedOn: row.priceDate,
      })),
    [itemPriceHistory.data],
  );

  const priceRows = React.useMemo(() => {
    const term = priceSearch.trim().toLowerCase();
    return priceSourceRows.filter(
      (row) =>
        !term ||
        row.itemDescription.toLowerCase().includes(term) ||
        row.brandModel.toLowerCase().includes(term) ||
        row.supplier.toLowerCase().includes(term),
    );
  }, [priceSearch, priceSourceRows]);

  const totalTenderValue = React.useMemo(
    () =>
      (tenders.data?.items ?? []).reduce(
        (sum, tender) => sum + (Number(tender.contractValue) || 0),
        0,
      ),
    [tenders.data?.items],
  );

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

  const activeInsightSearch =
    activeInsight === "costing" ? costingSearch : activeInsight === "slt" ? sltSearch : priceSearch;
  const activeInsightCount =
    activeInsight === "costing"
      ? costingRows.length
      : activeInsight === "slt"
        ? sltRows.length
        : priceRows.length;

  function updateInsightSearch(value: string) {
    if (activeInsight === "costing") setCostingSearch(value);
    else if (activeInsight === "slt") setSltSearch(value);
    else setPriceSearch(value);
  }

  const preparingPercent =
    stats.data && stats.data.total > 0
      ? ((stats.data.preparing / stats.data.total) * 100).toFixed(2)
      : "0.00";
  const submittedPercent =
    stats.data && stats.data.total > 0
      ? ((stats.data.submitted / stats.data.total) * 100).toFixed(2)
      : "0.00";
  const awardedPercent =
    stats.data && stats.data.total > 0
      ? ((stats.data.awarded / stats.data.total) * 100).toFixed(2)
      : "0.00";
  const unsuccessfulPercent =
    stats.data && stats.data.total > 0
      ? ((stats.data.unsuccessful / stats.data.total) * 100).toFixed(2)
      : "0.00";

  return (
    <div className="scrollbar-hidden flex min-h-full flex-col gap-2 overflow-y-auto [@media(max-height:700px)]:gap-1.5 xl:h-full xl:min-h-0 xl:overflow-hidden 2xl:gap-3">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-biz-border bg-white px-3 py-2 shadow-card [@media(max-height:700px)]:py-1.5 2xl:px-4 2xl:py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-biz-blue-soft text-biz-blue 2xl:h-9 2xl:w-9">
            <BriefcaseBusiness className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" />
          </span>
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="shrink-0 text-page-title text-biz-text [@media(max-height:700px)]:text-[20px]">
              Tender Management
            </h1>
            <p className="hidden truncate border-l border-biz-border pl-2.5 text-[10px] text-biz-muted md:block xl:text-[11px] 2xl:text-[12px]">
              Pipeline, team activity and costing insights
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 2xl:gap-2">
          <div className="relative">
            <SecondaryButton
              size="sm"
              onClick={() => setDateRangeOpen((value) => !value)}
              className="h-8 whitespace-nowrap px-2.5 text-[10px] xl:h-9 xl:text-[11px] 2xl:text-[12px]"
            >
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
            </SecondaryButton>
            {dateRangeOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40"
                  onClick={() => setDateRangeOpen(false)}
                  aria-label="Close date range"
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
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={exportSearchTeamCsv}
            title="Export as CSV"
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-biz-success px-3 text-[10px] font-semibold text-white transition-colors hover:brightness-95 xl:h-9 xl:text-[11px] 2xl:text-[12px]"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6 2xl:gap-3">
        <TenderKpiCard
          icon={SquareStack}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Tenders"
          value={String(stats.data?.total ?? "—")}
          helper="All Time"
        />
        <TenderKpiCard
          icon={Hourglass}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Under Preparation"
          value={String(stats.data?.preparing ?? "—")}
          helper={`${preparingPercent}% of total`}
        />
        <TenderKpiCard
          icon={Send}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Submitted"
          value={String(stats.data?.submitted ?? "—")}
          helper={`${submittedPercent}% of total`}
        />
        <TenderKpiCard
          icon={Award}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Won / NOA"
          value={String(stats.data?.awarded ?? "—")}
          helper={`${awardedPercent}% of total`}
        />
        <TenderKpiCard
          icon={XCircle}
          iconClassName="bg-biz-danger-soft text-biz-danger"
          label="Lost"
          value={String(stats.data?.unsuccessful ?? "—")}
          helper={`${unsuccessfulPercent}% of total`}
        />
        <TenderKpiCard
          icon={Coins}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Total Value (BDT)"
          value={formatBDTCompact(totalTenderValue)}
          helper="All Time"
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-2 xl:grid-rows-[minmax(0,1.15fr)_minmax(0,0.85fr)] 2xl:gap-3">
        <div className="grid min-h-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:gap-3">
          <section className="flex min-h-[320px] flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card xl:min-h-0">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border bg-slate-50/45 px-3 py-2 [@media(max-height:700px)]:py-1.5 2xl:px-4 2xl:py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-biz-blue">
                  <UsersRound className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[13px] font-bold text-biz-text xl:text-[14px] 2xl:text-[16px]">
                      Tender Work Queue
                    </h2>
                    <span className="rounded-full bg-biz-blue-soft px-2 py-0.5 text-[9px] font-semibold text-biz-blue 2xl:text-[11px]">
                      {total} tenders
                    </span>
                  </div>
                  <p className="truncate text-[9px] text-biz-muted [@media(max-height:700px)]:hidden xl:text-[10px] 2xl:text-[12px]">
                    Search activity and upcoming follow-ups
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:flex-none">
                <div className="min-w-0 flex-1 sm:w-[220px] 2xl:w-[280px]">
                  <TextInput
                    icon={Search}
                    placeholder="Search tender ID or work..."
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    className="h-8 text-[10px] xl:h-9 xl:text-[11px] 2xl:text-[12px]"
                  />
                </div>

                <div className="relative shrink-0">
                  <SecondaryButton
                    size="sm"
                    onClick={() => setAdvancedOpen((value) => !value)}
                    className={cn(
                      "h-8 px-2.5 text-[10px] xl:h-9 xl:text-[11px] 2xl:text-[12px]",
                      advancedOpen && "border-biz-blue text-biz-blue",
                    )}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    Filters
                    {(orgFilter || priorityFilter) && (
                      <span className="rounded-full bg-biz-blue px-1.5 py-0.5 text-[8px] leading-none text-white">
                        {Number(Boolean(orgFilter)) + Number(Boolean(priorityFilter))}
                      </span>
                    )}
                  </SecondaryButton>
                  {advancedOpen && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-40"
                        onClick={() => setAdvancedOpen(false)}
                        aria-label="Close filters"
                      />
                      <div className="absolute right-0 top-[calc(100%+6px)] z-50 grid w-[280px] gap-2 rounded-lg border border-biz-border bg-white p-3 shadow-card-hover sm:w-[420px] sm:grid-cols-2">
                        <label className="text-[10px] font-semibold text-biz-muted 2xl:text-[11px]">
                          Organization
                          <SelectInput
                            className="mt-1 h-9 w-full"
                            placeholder="All organizations"
                            value={orgFilter}
                            onChange={(event) => {
                              setOrgFilter(event.target.value);
                              setPage(1);
                            }}
                            options={organizations.map((organization) => ({
                              label: organization,
                              value: organization,
                            }))}
                          />
                        </label>
                        <label className="text-[10px] font-semibold text-biz-muted 2xl:text-[11px]">
                          Priority
                          <SelectInput
                            className="mt-1 h-9 w-full"
                            placeholder="All priorities"
                            value={priorityFilter}
                            onChange={(event) => {
                              setPriorityFilter(event.target.value);
                              setPage(1);
                            }}
                            options={[
                              { label: "High", value: "High" },
                              { label: "Medium", value: "Medium" },
                              { label: "Low", value: "Low" },
                            ]}
                          />
                        </label>
                      </div>
                    </>
                  )}
                </div>

                {(search || orgFilter || priorityFilter) && (
                  <SecondaryButton
                    size="sm"
                    onClick={resetFilters}
                    className="h-8 px-2 text-[10px] xl:h-9 xl:text-[11px]"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </SecondaryButton>
                )}
              </div>
            </div>

            <DataTable
              data={pagedActivities}
              rowKey={(row) => row.id}
              stickyHeader
              containerClassName="scrollbar-hidden min-h-0 flex-1 overflow-auto"
              tableClassName="table-fixed min-w-[680px] text-[10px] xl:min-w-[720px] xl:text-[11px] 2xl:min-w-[820px] 2xl:text-[13px]"
              onRowClick={(row) =>
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
              columns={[
                {
                  key: "tender",
                  header: "Tender",
                  className:
                    "w-[34%] overflow-hidden px-2.5 py-1.5 [@media(max-height:700px)]:py-1",
                  render: (row) => (
                    <div className="flex min-w-0 items-center gap-1.5 [@media(min-height:701px)]:block">
                      <p className="truncate font-semibold text-biz-text" title={row.workName}>
                        {row.workName}
                      </p>
                      <span className="hidden shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[8px] font-medium text-biz-muted [@media(max-height:700px)]:inline">
                        {row.tenderSearchId}
                      </span>
                      <p
                        className="mt-0.5 truncate text-[9px] text-biz-muted [@media(max-height:700px)]:hidden xl:text-[10px] 2xl:text-[11px]"
                        title={`${row.tenderSearchId} · ${row.source} · ${formatDate(row.searchDate)}`}
                      >
                        {row.tenderSearchId} · {row.source} · {formatDate(row.searchDate)}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "organization",
                  header: "Organization",
                  className: "w-[13%] overflow-hidden px-2 py-1.5 [@media(max-height:700px)]:py-1",
                  render: (row) => (
                    <span className="block truncate" title={row.organization}>
                      {row.organization}
                    </span>
                  ),
                },
                {
                  key: "assigned",
                  header: "Assigned To",
                  className: "w-[19%] overflow-hidden px-2 py-1.5 [@media(max-height:700px)]:py-1",
                  render: (row) => (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ backgroundColor: row.assignedTo.color }}
                      >
                        {row.assignedTo.initial}
                      </span>
                      <span className="truncate" title={row.assignedTo.name}>
                        {row.assignedTo.name}
                      </span>
                    </span>
                  ),
                },
                {
                  key: "followUp",
                  header: "Next Follow Up",
                  className: "w-[14%] px-2 py-1.5 [@media(max-height:700px)]:py-1",
                  render: (row) => (
                    <span className="whitespace-nowrap">{formatDate(row.nextFollowUp)}</span>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  className: "w-[12%] overflow-hidden px-2 py-1.5 [@media(max-height:700px)]:py-1",
                  render: (row) => (
                    <StatusBadge label={row.status} tone={SEARCH_STATUS_TONE[row.status]} />
                  ),
                },
                {
                  key: "priority",
                  header: "Priority",
                  className: "w-[8%] overflow-hidden px-2 py-1.5 [@media(max-height:700px)]:py-1",
                  render: (row) => (
                    <StatusBadge label={row.priority} tone={PRIORITY_TONE[row.priority]} />
                  ),
                },
              ]}
            />

            <div className="shrink-0 border-t border-biz-border bg-slate-50/50">
              <Pagination
                page={safePage}
                limit={limit}
                total={total}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          </section>

          <SearchActivityShareCard
            items={activityShare}
            className="h-full min-h-[300px] xl:min-h-0"
          />
        </div>

        <section className="flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card xl:min-h-0">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border bg-slate-50/45 px-2.5 py-2 [@media(max-height:700px)]:py-1.5 2xl:px-3 2xl:py-2.5">
            <div className="scrollbar-hidden flex min-w-0 items-center gap-1 overflow-x-auto rounded-md bg-slate-100 p-0.5">
              {INSIGHT_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const count =
                  tab.key === "costing"
                    ? costingSourceRows.length
                    : tab.key === "slt"
                      ? EMPTY_SLT_ROWS.length
                      : priceSourceRows.length;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveInsight(tab.key)}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded px-2.5 text-[10px] font-semibold transition-colors xl:text-[11px] 2xl:h-9 2xl:px-3 2xl:text-[13px]",
                      activeInsight === tab.key
                        ? "bg-white text-biz-blue shadow-sm"
                        : "text-slate-600 hover:text-biz-text",
                    )}
                  >
                    <TabIcon className="h-3.5 w-3.5" />
                    {tab.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[8px] leading-none 2xl:text-[10px]",
                        activeInsight === tab.key
                          ? "bg-blue-50 text-biz-blue"
                          : "bg-white/80 text-slate-500",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex min-w-0 items-center gap-2 sm:w-[280px] 2xl:w-[340px]">
              <div className="min-w-0 flex-1">
                <TextInput
                  icon={Search}
                  value={activeInsightSearch}
                  onChange={(event) => updateInsightSearch(event.target.value)}
                  placeholder={
                    activeInsight === "costing"
                      ? "Search costing..."
                      : activeInsight === "slt"
                        ? "Search SLT..."
                        : "Search item, brand or supplier..."
                  }
                  className="h-8 text-[10px] xl:text-[11px] 2xl:h-9 2xl:text-[12px]"
                />
              </div>
              <span className="shrink-0 whitespace-nowrap text-[9px] font-medium text-biz-muted 2xl:text-[11px]">
                {activeInsightCount} records
              </span>
            </div>
          </div>

          {activeInsight === "costing" && (
            <DataTable
              data={costingRows}
              rowKey={(row) => row.id}
              stickyHeader
              containerClassName="scrollbar-hidden min-h-0 flex-1 overflow-auto"
              tableClassName="table-fixed min-w-[640px] text-[10px] xl:min-w-[760px] xl:text-[11px] 2xl:text-[13px]"
              onRowClick={(row) =>
                openView(row.tenderId, [
                  ["Work Name", row.workName],
                  ["Estimated Cost", formatBDTCompact(row.estimatedCost)],
                  ["Our Cost", formatBDTCompact(row.ourCost)],
                  ["Margin (%)", `${row.marginPercent.toFixed(2)}%`],
                  ["Status", row.status],
                ])
              }
              columns={[
                {
                  key: "tender",
                  header: "Tender",
                  className: "w-[38%] overflow-hidden px-3 py-2",
                  render: (row) => (
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={row.workName}>
                        {row.workName}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] text-biz-muted 2xl:text-[11px]">
                        {row.tenderId}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "estimated",
                  header: "Estimated Cost",
                  className: "w-[17%] px-3 py-2 text-right tabular-nums",
                  render: (row) => formatBDTCompact(row.estimatedCost),
                },
                {
                  key: "ourCost",
                  header: "Our Cost",
                  className: "w-[17%] px-3 py-2 text-right tabular-nums",
                  render: (row) => formatBDTCompact(row.ourCost),
                },
                {
                  key: "margin",
                  header: "Margin",
                  className: "w-[12%] px-3 py-2 text-right tabular-nums",
                  render: (row) => `${row.marginPercent.toFixed(2)}%`,
                },
                {
                  key: "status",
                  header: "Status",
                  className: "w-[16%] px-3 py-2",
                  render: (row) => (
                    <StatusBadge label={row.status} tone={COSTING_STATUS_TONE[row.status]} />
                  ),
                },
              ]}
            />
          )}

          {activeInsight === "slt" && (
            <DataTable
              data={sltRows}
              rowKey={(row) => row.id}
              stickyHeader
              containerClassName="scrollbar-hidden min-h-0 flex-1 overflow-auto"
              tableClassName="table-fixed min-w-[640px] text-[10px] xl:min-w-[760px] xl:text-[11px] 2xl:text-[13px]"
              onRowClick={(row) =>
                openView(row.tenderId, [
                  ["Work / Tender Name", row.workName],
                  ["Organization", row.organization],
                  ["SLT Amount", formatBDTCompact(row.sltAmount)],
                  ["Status", row.status],
                ])
              }
              columns={[
                {
                  key: "tender",
                  header: "Tender",
                  className: "w-[42%] overflow-hidden px-3 py-2",
                  render: (row) => (
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={row.workName}>
                        {row.workName}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] text-biz-muted 2xl:text-[11px]">
                        {row.tenderId}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "organization",
                  header: "Organization",
                  className: "w-[18%] px-3 py-2",
                  render: (row) => row.organization,
                },
                {
                  key: "amount",
                  header: "SLT Amount",
                  className: "w-[22%] px-3 py-2 text-right tabular-nums",
                  render: (row) => formatBDTCompact(row.sltAmount),
                },
                {
                  key: "status",
                  header: "Status",
                  className: "w-[18%] px-3 py-2",
                  render: (row) => (
                    <StatusBadge label={row.status} tone={COSTING_STATUS_TONE[row.status]} />
                  ),
                },
              ]}
            />
          )}

          {activeInsight === "price" && (
            <DataTable
              data={priceRows}
              rowKey={(row) => row.id}
              stickyHeader
              containerClassName="scrollbar-hidden min-h-0 flex-1 overflow-auto"
              tableClassName="table-fixed min-w-[640px] text-[10px] xl:min-w-[760px] xl:text-[11px] 2xl:text-[13px]"
              onRowClick={(row) =>
                openView(row.itemDescription, [
                  ["Brand / Model", row.brandModel],
                  ["Supplier", row.supplier],
                  ["Latest Price", formatBDTCompact(row.latestPrice)],
                  ["Updated On", formatDate(row.updatedOn)],
                ])
              }
              columns={[
                {
                  key: "item",
                  header: "Item / Description",
                  className: "w-[28%] overflow-hidden px-3 py-2",
                  render: (row) => (
                    <span className="block truncate font-semibold" title={row.itemDescription}>
                      {row.itemDescription}
                    </span>
                  ),
                },
                {
                  key: "brand",
                  header: "Brand / Model",
                  className: "w-[22%] overflow-hidden px-3 py-2",
                  render: (row) => (
                    <span className="block truncate" title={row.brandModel}>
                      {row.brandModel}
                    </span>
                  ),
                },
                {
                  key: "supplier",
                  header: "Supplier",
                  className: "w-[20%] overflow-hidden px-3 py-2",
                  render: (row) => (
                    <span className="block truncate" title={row.supplier}>
                      {row.supplier}
                    </span>
                  ),
                },
                {
                  key: "price",
                  header: "Latest Price",
                  className: "w-[18%] px-3 py-2 text-right tabular-nums",
                  render: (row) => formatBDTCompact(row.latestPrice),
                },
                {
                  key: "updated",
                  header: "Updated On",
                  className: "w-[12%] px-3 py-2",
                  render: (row) => formatDate(row.updatedOn),
                },
              ]}
            />
          )}
        </section>
      </div>

      {viewing && (
        <>
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setViewing(null)}
            className="fixed inset-0 z-40 bg-biz-navy/25"
          />
          <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[440px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-biz-border bg-biz-surface shadow-card-hover">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-biz-border bg-slate-50/70 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-biz-blue-soft text-biz-blue">
                  <BriefcaseBusiness className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-biz-muted">
                    Tender details
                  </p>
                  <h3
                    className="truncate text-[14px] font-semibold text-biz-text"
                    title={viewing.title}
                  >
                    {viewing.title}
                  </h3>
                </div>
              </div>
              <IconButton aria-label="Close" onClick={() => setViewing(null)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="scrollbar-hidden min-h-0 overflow-y-auto px-4 py-2">
              {viewing.fields.map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-biz-border/70 py-2.5 text-[12px] last:border-b-0 2xl:text-[13px]"
                >
                  <span className="font-medium text-biz-muted">{label}</span>
                  <span className="break-words text-right font-semibold text-biz-text">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
