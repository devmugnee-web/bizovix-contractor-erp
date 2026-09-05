"use client";

import * as React from "react";
import {
  ArrowUp,
  Calendar,
  Download,
  Equal,
  Eye,
  Filter,
  LayoutGrid,
  List,
  Package,
  Search,
  Settings2,
  SlidersHorizontal,
  Tag,
  TrendingDown,
  X,
  type LucideIcon,
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
import { useItemPriceHistory } from "@bizovix/api-client";
import { formatDate } from "@bizovix/utils";
import type {
  ItemPriceHistoryChangeType as ChangeType,
  ItemPriceHistoryPerson as PriceHistoryPerson,
  ItemPriceHistoryRecord as PriceHistoryRow,
  ItemPriceHistorySource as PriceSource,
} from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const CHANGE_TYPE_OPTIONS: ChangeType[] = ["Increased", "Decreased", "No Change"];
const SOURCE_OPTIONS: PriceSource[] = ["Tender Costing"];

const CHANGE_TYPE_STYLE: Record<ChangeType, { tone: StatusBadgeTone; icon: LucideIcon }> = {
  Increased: { tone: "success", icon: ArrowUp },
  Decreased: { tone: "danger", icon: TrendingDown },
  "No Change": { tone: "warning", icon: Equal },
};

const SOURCE_TONE: Record<PriceSource, StatusBadgeTone> = {
  "Tender Costing": "info",
};

type SortKey =
  | "itemDescription"
  | "uom"
  | "previousPrice"
  | "currentPrice"
  | "changeBdt"
  | "changePercent"
  | "priceDate"
  | "updatedBy";

interface ComputedRow extends PriceHistoryRow {
  changeBdt: number;
  changePercent: number;
}

function sortValue(row: ComputedRow, key: SortKey): string | number {
  if (key === "updatedBy") return row.updatedBy.name;
  return row[key];
}

interface FilterDraft {
  search: string;
  brandModel: string;
  supplier: string;
  fromDate: string;
  toDate: string;
  changeType: string;
  source: string;
  updatedBy: string;
}

const INITIAL_DRAFT: FilterDraft = {
  search: "",
  brandModel: "",
  supplier: "",
  fromDate: "",
  toDate: "",
  changeType: "",
  source: "",
  updatedBy: "",
};

const EMPTY_QUERY: FilterDraft = {
  search: "",
  brandModel: "",
  supplier: "",
  fromDate: "",
  toDate: "",
  changeType: "",
  source: "",
  updatedBy: "",
};

const OPTIONAL_COLUMNS = [
  { key: "supplier", label: "Supplier" },
  { key: "uom", label: "UOM" },
  { key: "previousPrice", label: "Previous Price (BDT)" },
  { key: "currentPrice", label: "Current Price (BDT)" },
  { key: "changeBdt", label: "Change (BDT)" },
  { key: "changePercent", label: "Change (%)" },
  { key: "changeType", label: "Change Type" },
  { key: "priceDate", label: "Price Date" },
  { key: "updatedBy", label: "Updated By" },
  { key: "source", label: "Source" },
] as const;

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

function PersonCell({
  person,
  compact = false,
}: {
  person: PriceHistoryPerson;
  compact?: boolean;
}) {
  return (
    <span
      className={cn("flex min-w-0 items-center", compact ? "gap-1" : "gap-1.5")}
      title={person.name}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white",
          compact && "hidden 2xl:flex",
        )}
        style={{ backgroundColor: person.color }}
      >
        {person.initial}
      </span>
      <span className="truncate whitespace-nowrap">{person.name}</span>
    </span>
  );
}

function ChangeTypeBadge({ changeType }: { changeType: ChangeType }) {
  const { tone, icon: Icon } = CHANGE_TYPE_STYLE[changeType];
  const toneClass =
    tone === "success"
      ? "bg-biz-success-soft text-biz-success"
      : tone === "danger"
        ? "bg-biz-danger-soft text-biz-danger"
        : "bg-biz-warning-soft text-biz-warning";
  return (
    <span
      title={changeType}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 rounded-full px-1 py-0.5 text-[6px] font-medium sm:text-[7px] lg:text-[8px] 2xl:gap-1 2xl:px-2 2xl:text-[10px]",
        toneClass,
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0 2xl:h-3 2xl:w-3" />
      <span className="truncate">{changeType}</span>
    </span>
  );
}

export default function ItemPriceHistoryPage() {
  useSetBreadcrumb([
    { label: "Tender Management", href: "/tender-management" },
    { label: "Item Price History" },
  ]);
  const priceHistory = useItemPriceHistory();
  const priceHistoryRows = priceHistory.data ?? [];

  const [draft, setDraft] = React.useState<FilterDraft>(INITIAL_DRAFT);
  const [query, setQuery] = React.useState<FilterDraft>(EMPTY_QUERY);
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [viewMode, setViewMode] = React.useState<"list" | "grid">("list");
  const [moreFiltersOpen, setMoreFiltersOpen] = React.useState(false);
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);
  const [headerDateRange, setHeaderDateRange] = React.useState({ from: "", to: "" });
  const [exportOpen, setExportOpen] = React.useState(false);
  const [columnSettingOpen, setColumnSettingOpen] = React.useState(false);
  const [hiddenColumns, setHiddenColumns] = React.useState<Set<string>>(new Set());
  const [viewing, setViewing] = React.useState<ComputedRow | null>(null);

  const limit = 10;

  function updateFilters(patch: Partial<FilterDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setQuery((current) => ({ ...current, ...patch }));
    setPage(1);
  }

  function resetFilters() {
    setDraft(INITIAL_DRAFT);
    setQuery(EMPTY_QUERY);
    setHeaderDateRange({ from: "", to: "" });
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

  const computedRows: ComputedRow[] = React.useMemo(
    () =>
      priceHistoryRows.map((row) => ({
        ...row,
        changeBdt: row.currentPrice - row.previousPrice,
        changePercent:
          row.previousPrice > 0
            ? ((row.currentPrice - row.previousPrice) / row.previousPrice) * 100
            : 0,
      })),
    [priceHistoryRows],
  );

  const brandModelOptions = React.useMemo(
    () => Array.from(new Set(priceHistoryRows.map((r) => r.brandModel).filter(Boolean))).sort(),
    [priceHistoryRows],
  );
  const supplierOptions = React.useMemo(
    () => Array.from(new Set(priceHistoryRows.map((r) => r.supplier))).sort(),
    [priceHistoryRows],
  );
  const priceHistoryPeople = React.useMemo(
    () =>
      Array.from(
        new Map(priceHistoryRows.map((row) => [row.updatedBy.name, row.updatedBy])).values(),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [priceHistoryRows],
  );

  const filtered = React.useMemo(() => {
    const term = query.search.trim().toLowerCase();
    let list = computedRows.filter((row) => {
      if (
        term &&
        !row.itemDescription.toLowerCase().includes(term) &&
        !row.brandModel.toLowerCase().includes(term)
      ) {
        return false;
      }
      if (query.brandModel && row.brandModel !== query.brandModel) return false;
      if (query.supplier && row.supplier !== query.supplier) return false;
      if (query.fromDate && row.priceDate < query.fromDate) return false;
      if (query.toDate && row.priceDate > query.toDate) return false;
      if (query.changeType && row.changeType !== query.changeType) return false;
      if (query.source && row.source !== query.source) return false;
      if (query.updatedBy && row.updatedBy.name !== query.updatedBy) return false;
      return true;
    });

    if (sort) {
      const { key, dir } = sort;
      list = [...list].sort((a, b) => {
        const av = sortValue(a, key);
        const bv = sortValue(b, key);
        const cmp =
          typeof av === "string" && typeof bv === "string"
            ? av.localeCompare(bv)
            : (av as number) - (bv as number);
        return dir === "asc" ? cmp : -cmp;
      });
    }

    return list;
  }, [computedRows, query, sort]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * limit, safePage * limit);

  const totalItems = computedRows.length;
  const increasedCount = computedRows.filter((r) => r.changeType === "Increased").length;
  const decreasedCount = computedRows.filter((r) => r.changeType === "Decreased").length;
  const noChangeCount = computedRows.filter((r) => r.changeType === "No Change").length;
  const avgChangePercent =
    computedRows.reduce((sum, r) => sum + r.changePercent, 0) / (computedRows.length || 1);
  const pct = (count: number) =>
    totalItems > 0 ? ((count / totalItems) * 100).toFixed(2) : "0.00";

  function toggleColumn(key: string) {
    setHiddenColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toCsvRow(row: ComputedRow): string[] {
    return [
      row.itemDescription,
      row.brandModel,
      row.supplier,
      row.uom,
      String(row.previousPrice),
      String(row.currentPrice),
      String(row.changeBdt),
      `${row.changePercent.toFixed(2)}%`,
      row.changeType,
      formatDate(row.priceDate),
      row.updatedBy.name,
      row.source,
    ];
  }

  function exportCsv() {
    const header = [
      "Item / Description",
      "Brand / Model",
      "Supplier",
      "UOM",
      "Previous Price (BDT)",
      "Current Price (BDT)",
      "Change (BDT)",
      "Change (%)",
      "Change Type",
      "Price Date",
      "Updated By",
      "Source",
    ];
    downloadCsv("item-price-history.csv", [header, ...filtered.map(toCsvRow)]);
    setExportOpen(false);
  }

  const allColumns: DataTableColumn<ComputedRow>[] = [
    {
      key: "sl",
      header: "SL",
      render: (row) => {
        const index = pageRows.indexOf(row);
        return (safePage - 1) * limit + index + 1;
      },
      className: "w-[3%] px-0.5 py-2 text-center",
    },
    {
      key: "item",
      header: "Item / Description",
      sortable: true,
      sortDirection: sort?.key === "itemDescription" ? sort.dir : null,
      onSort: () => toggleSort("itemDescription"),
      render: (row) => (
        <div
          className="min-w-0"
          title={[row.itemDescription, row.brandModel].filter(Boolean).join(" - ")}
        >
          <p className="line-clamp-2 font-medium leading-tight text-biz-text">
            {row.itemDescription}
          </p>
          {row.brandModel && (
            <p className="mt-0.5 truncate text-[0.9em] text-biz-muted">{row.brandModel}</p>
          )}
        </div>
      ),
      className: "w-[17%] whitespace-normal px-1 py-2",
    },
    {
      key: "supplier",
      header: "Supplier",
      render: (row) => (
        <span title={row.supplier} className="block truncate">
          {row.supplier}
        </span>
      ),
      className: "w-[8%] px-1 py-2",
    },
    {
      key: "uom",
      header: "UOM",
      sortable: true,
      sortDirection: sort?.key === "uom" ? sort.dir : null,
      onSort: () => toggleSort("uom"),
      render: (row) => row.uom,
      className: "w-[4%] px-0.5 py-2 text-center",
    },
    {
      key: "previousPrice",
      header: "Previous Price (BDT)",
      sortable: true,
      sortDirection: sort?.key === "previousPrice" ? sort.dir : null,
      onSort: () => toggleSort("previousPrice"),
      render: (row) => (
        <span title={row.previousPrice.toLocaleString()} className="block truncate">
          {row.previousPrice.toLocaleString()}
        </span>
      ),
      className: "w-[8%] whitespace-normal px-0.5 py-2 text-right tabular-nums",
    },
    {
      key: "currentPrice",
      header: "Current Price (BDT)",
      sortable: true,
      sortDirection: sort?.key === "currentPrice" ? sort.dir : null,
      onSort: () => toggleSort("currentPrice"),
      render: (row) => (
        <span title={row.currentPrice.toLocaleString()} className="block truncate">
          {row.currentPrice.toLocaleString()}
        </span>
      ),
      className: "w-[8%] whitespace-normal px-0.5 py-2 text-right tabular-nums",
    },
    {
      key: "changeBdt",
      header: "Change (BDT)",
      sortable: true,
      sortDirection: sort?.key === "changeBdt" ? sort.dir : null,
      onSort: () => toggleSort("changeBdt"),
      render: (row) => (
        <span
          title={`${row.changeBdt > 0 ? "+" : ""}${row.changeBdt.toLocaleString()}`}
          className={cn(
            "block truncate font-medium",
            row.changeBdt > 0
              ? "text-biz-success"
              : row.changeBdt < 0
                ? "text-biz-danger"
                : "text-biz-text",
          )}
        >
          {row.changeBdt > 0 ? "+" : ""}
          {row.changeBdt.toLocaleString()}
        </span>
      ),
      className: "w-[8%] whitespace-normal px-0.5 py-2 text-right tabular-nums",
    },
    {
      key: "changePercent",
      header: "Change (%)",
      sortable: true,
      sortDirection: sort?.key === "changePercent" ? sort.dir : null,
      onSort: () => toggleSort("changePercent"),
      render: (row) => (
        <span
          title={`${row.changePercent > 0 ? "+" : ""}${row.changePercent.toFixed(2)}%`}
          className={cn(
            "block truncate font-medium",
            row.changePercent > 0
              ? "text-biz-success"
              : row.changePercent < 0
                ? "text-biz-danger"
                : "text-biz-text",
          )}
        >
          {row.changePercent > 0 ? "+" : ""}
          {row.changePercent.toFixed(2)}%
        </span>
      ),
      className: "w-[6%] whitespace-normal px-0.5 py-2 text-right tabular-nums",
    },
    {
      key: "changeType",
      header: "Change Type",
      render: (row) => <ChangeTypeBadge changeType={row.changeType} />,
      className: "w-[8%] whitespace-normal px-0.5 py-2 text-center",
    },
    {
      key: "priceDate",
      header: "Price Date",
      sortable: true,
      sortDirection: sort?.key === "priceDate" ? sort.dir : null,
      onSort: () => toggleSort("priceDate"),
      render: (row) => (
        <span title={formatDate(row.priceDate)} className="block truncate whitespace-nowrap">
          {formatDate(row.priceDate)}
        </span>
      ),
      className: "w-[8%] whitespace-normal px-0.5 py-2 text-center",
    },
    {
      key: "updatedBy",
      header: "Updated By",
      sortable: true,
      sortDirection: sort?.key === "updatedBy" ? sort.dir : null,
      onSort: () => toggleSort("updatedBy"),
      render: (row) => <PersonCell person={row.updatedBy} compact />,
      className: "w-[9%] whitespace-normal px-0.5 py-2",
    },
    {
      key: "source",
      header: "Source",
      render: (row) => (
        <StatusBadge
          label={row.source}
          tone={SOURCE_TONE[row.source]}
          className="max-w-full truncate px-1 py-0.5 text-[6px] sm:text-[7px] lg:text-[8px] 2xl:px-2 2xl:text-[10px]"
        />
      ),
      className: "w-[7%] whitespace-normal px-0.5 py-2 text-center",
    },
    {
      key: "action",
      header: "Action",
      render: (row) => (
        <SecondaryButton
          onClick={() => setViewing(row)}
          title="View details"
          className="h-6 w-full min-w-0 gap-0.5 px-0.5 text-[7px] sm:text-[8px] lg:text-[9px] 2xl:h-7 2xl:px-1"
        >
          <Eye className="h-3 w-3 shrink-0" />
          <span className="hidden xl:inline">View</span>
        </SecondaryButton>
      ),
      className: "w-[6%] px-0.5 py-2 text-center",
    },
  ];

  const visibleColumns = allColumns.filter(
    (col) =>
      col.key === "sl" || col.key === "item" || col.key === "action" || !hiddenColumns.has(col.key),
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title text-biz-text">Item Price History</h1>
          <p className="mt-0.5 text-[12.5px] text-biz-muted">
            Tender Management &gt; Item Price History
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SecondaryButton onClick={() => setDateRangeOpen((v) => !v)} className="h-9">
              <Calendar className="h-4 w-4" />
              {headerDateRange.from || headerDateRange.to
                ? `${headerDateRange.from ? formatDate(headerDateRange.from) : "Any date"} - ${
                    headerDateRange.to ? formatDate(headerDateRange.to) : "Any date"
                  }`
                : "All Dates"}
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
                        value={headerDateRange.from}
                        onChange={(e) =>
                          setHeaderDateRange((r) => ({ ...r, from: e.target.value }))
                        }
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                    <label className="text-[11px] font-medium text-biz-muted">
                      To
                      <input
                        type="date"
                        value={headerDateRange.to}
                        onChange={(e) => setHeaderDateRange((r) => ({ ...r, to: e.target.value }))}
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                    <PrimaryButton
                      className="mt-1 h-9"
                      onClick={() => {
                        setDraft((d) => ({
                          ...d,
                          fromDate: headerDateRange.from,
                          toDate: headerDateRange.to,
                        }));
                        setQuery((q) => ({
                          ...q,
                          fromDate: headerDateRange.from,
                          toDate: headerDateRange.to,
                        }));
                        setPage(1);
                        setDateRangeOpen(false);
                      }}
                    >
                      Apply
                    </PrimaryButton>
                  </div>
                </div>
              </>
            )}
          </div>

          <SecondaryButton className="h-9" title="Filter (see the filter panel below)">
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
                    onClick={exportCsv}
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

      {priceHistory.isLoading && (
        <div className="rounded-lg border border-biz-border bg-biz-surface px-4 py-3 text-[12px] text-biz-muted">
          Loading saved tender costing prices...
        </div>
      )}
      {priceHistory.isError && (
        <div className="rounded-lg border border-biz-danger/20 bg-biz-danger-soft px-4 py-3 text-[12px] text-biz-danger">
          Unable to load saved tender costing prices.
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-1 sm:gap-2">
        <ModuleStatCard
          compact
          icon={Package}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Items"
          value={totalItems.toLocaleString()}
          helper="In selected period"
        />
        <ModuleStatCard
          compact
          icon={Tag}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Price Increased"
          value={increasedCount.toLocaleString()}
          helper={`${pct(increasedCount)}% of total`}
        />
        <ModuleStatCard
          compact
          icon={TrendingDown}
          iconClassName="bg-biz-danger-soft text-biz-danger"
          label="Price Decreased"
          value={decreasedCount.toLocaleString()}
          helper={`${pct(decreasedCount)}% of total`}
        />
        <ModuleStatCard
          compact
          icon={Equal}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="No Change"
          value={noChangeCount.toLocaleString()}
          helper={`${pct(noChangeCount)}% of total`}
        />
        <ModuleStatCard
          compact
          icon={Settings2}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Avg. Price Change"
          value={`${avgChangePercent > 0 ? "+" : ""}${avgChangePercent.toFixed(2)}%`}
          helper="In selected period"
        />
      </div>

      {/* Filter Panel */}
      <div className="relative rounded-lg border border-biz-border bg-biz-surface p-2">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,.85fr)_minmax(0,.8fr)_minmax(0,1.4fr)_minmax(0,.65fr)_auto_auto] items-end gap-1.5">
          <div className="flex min-w-0 flex-col gap-1">
            <label className="truncate text-[8px] font-medium text-biz-muted sm:text-[10px] xl:text-[12px]">
              Search by Item / Description
            </label>
            <TextInput
              icon={Search}
              className="min-w-0"
              placeholder="Enter Item / Description..."
              value={draft.search}
              onChange={(e) => updateFilters({ search: e.target.value })}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label className="truncate text-[8px] font-medium text-biz-muted sm:text-[10px] xl:text-[12px]">
              Brand / Model
            </label>
            <SelectInput
              className="min-w-0 w-full"
              placeholder="Select Brand / Model"
              value={draft.brandModel}
              onChange={(e) => updateFilters({ brandModel: e.target.value })}
              options={brandModelOptions.map((b) => ({ label: b, value: b }))}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label className="truncate text-[8px] font-medium text-biz-muted sm:text-[10px] xl:text-[12px]">
              Supplier
            </label>
            <SelectInput
              className="min-w-0 w-full"
              placeholder="Select Supplier"
              value={draft.supplier}
              onChange={(e) => updateFilters({ supplier: e.target.value })}
              options={supplierOptions.map((s) => ({ label: s, value: s }))}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label className="truncate text-[8px] font-medium text-biz-muted sm:text-[10px] xl:text-[12px]">
              Date Range
            </label>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
              <input
                type="date"
                value={draft.fromDate}
                onChange={(e) => updateFilters({ fromDate: e.target.value })}
                className="h-11 min-w-0 w-full rounded-sm border border-biz-border bg-biz-surface px-1 text-[7px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30 sm:text-[9px] xl:px-2 xl:text-[11px]"
              />
              <span className="text-biz-muted">-</span>
              <input
                type="date"
                value={draft.toDate}
                onChange={(e) => updateFilters({ toDate: e.target.value })}
                className="h-11 min-w-0 w-full rounded-sm border border-biz-border bg-biz-surface px-1 text-[7px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30 sm:text-[9px] xl:px-2 xl:text-[11px]"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label className="truncate text-[8px] font-medium text-biz-muted sm:text-[10px] xl:text-[12px]">
              Price Change
            </label>
            <SelectInput
              className="min-w-0 w-full"
              placeholder="All"
              value={draft.changeType}
              onChange={(e) => updateFilters({ changeType: e.target.value })}
              options={CHANGE_TYPE_OPTIONS.map((c) => ({ label: c, value: c }))}
            />
          </div>

          <SecondaryButton
            onClick={() => setMoreFiltersOpen((v) => !v)}
            className="h-11 min-w-0 gap-1 px-2"
            title="More Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden lg:inline">More Filters</span>
          </SecondaryButton>

          <SecondaryButton onClick={resetFilters} className="h-11 min-w-0 px-2">
            Reset
          </SecondaryButton>
        </div>

        {moreFiltersOpen && (
          <div className="absolute right-2 top-[calc(100%+6px)] z-50 grid w-[min(360px,calc(100vw-2rem))] grid-cols-2 gap-2 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card-hover">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Source</label>
              <SelectInput
                className="min-w-0 w-full"
                placeholder="All"
                value={draft.source}
                onChange={(e) => updateFilters({ source: e.target.value })}
                options={SOURCE_OPTIONS.map((s) => ({ label: s, value: s }))}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Updated By</label>
              <SelectInput
                className="min-w-0 w-full"
                placeholder="All"
                value={draft.updatedBy}
                onChange={(e) => updateFilters({ updatedBy: e.target.value })}
                options={priceHistoryPeople.map((p) => ({ label: p.name, value: p.name }))}
              />
            </div>
          </div>
        )}
      </div>

      {/* Item Price History List */}
      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">
            Item Price History List ({total.toLocaleString()})
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <SecondaryButton
                onClick={() => setColumnSettingOpen((v) => !v)}
                className="h-8 gap-1.5 px-2.5 text-[12px]"
              >
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
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-biz-text">
                        {row.itemDescription}
                      </p>
                      <p className="truncate text-[11px] text-biz-muted">{row.brandModel}</p>
                    </div>
                    <ChangeTypeBadge changeType={row.changeType} />
                  </div>
                  <p className="text-[11.5px] text-biz-muted">
                    {row.supplier} &middot; {row.uom}
                  </p>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                    <span className="text-biz-muted">Previous</span>
                    <span className="text-right font-medium text-biz-text">
                      {row.previousPrice.toLocaleString()}
                    </span>
                    <span className="text-biz-muted">Current</span>
                    <span className="text-right font-medium text-biz-text">
                      {row.currentPrice.toLocaleString()}
                    </span>
                    <span className="text-biz-muted">Change</span>
                    <span
                      className={cn(
                        "text-right font-semibold",
                        row.changeBdt > 0
                          ? "text-biz-success"
                          : row.changeBdt < 0
                            ? "text-biz-danger"
                            : "text-biz-text",
                      )}
                    >
                      {row.changePercent > 0 ? "+" : ""}
                      {row.changePercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-biz-border pt-2">
                    <PersonCell person={row.updatedBy} />
                    <SecondaryButton
                      onClick={() => setViewing(row)}
                      className="h-7 gap-1 px-2 text-[11px]"
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </SecondaryButton>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <DataTable<ComputedRow>
            data={pageRows}
            rowKey={(row) => row.id}
            columns={visibleColumns}
            containerClassName="overflow-x-hidden"
            tableClassName="table-fixed min-w-0 text-[6px] sm:text-[7px] lg:text-[8px] xl:text-[9px] 2xl:text-[11px] [&_td]:overflow-hidden [&_th]:leading-tight [&_th>button]:max-w-full [&_th>button]:min-w-0 [&_th>button]:gap-0.5 [&_th>button]:whitespace-normal [&_th>button]:leading-tight"
          />
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
              <h3 className="text-[14px] font-semibold text-biz-text">{viewing.itemDescription}</h3>
              <IconButton aria-label="Close" onClick={() => setViewing(null)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3">
              {(
                [
                  ["Brand / Model", viewing.brandModel],
                  ["Supplier", viewing.supplier],
                  ["UOM", viewing.uom],
                  ["Previous Price (BDT)", viewing.previousPrice.toLocaleString()],
                  ["Current Price (BDT)", viewing.currentPrice.toLocaleString()],
                  [
                    "Change (BDT)",
                    `${viewing.changeBdt > 0 ? "+" : ""}${viewing.changeBdt.toLocaleString()}`,
                  ],
                  [
                    "Change (%)",
                    `${viewing.changePercent > 0 ? "+" : ""}${viewing.changePercent.toFixed(2)}%`,
                  ],
                  ["Change Type", viewing.changeType],
                  ["Price Date", formatDate(viewing.priceDate)],
                  ["Updated By", viewing.updatedBy.name],
                  ["Source", viewing.source],
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
