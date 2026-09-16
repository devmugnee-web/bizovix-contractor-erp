"use client";

import * as React from "react";
import {
  ArrowUp,
  Download,
  Equal,
  Eye,
  History,
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
  Pagination,
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
        "inline-flex max-w-full items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-semibold xl:gap-1 xl:text-[9px] 2xl:px-2 2xl:text-[10px]",
        toneClass,
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0 2xl:h-3 2xl:w-3" />
      <span className="truncate">{changeType}</span>
    </span>
  );
}

interface PriceHistoryStatCardProps {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
  helper: string;
  active?: boolean;
  onClick?: () => void;
  actionLabel?: string;
}

function PriceHistoryStatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  helper,
  active = false,
  onClick,
  actionLabel,
}: PriceHistoryStatCardProps) {
  const content = (
    <>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg xl:h-9 xl:w-9 2xl:h-10 2xl:w-10",
          iconClassName,
        )}
      >
        <Icon className="h-3.5 w-3.5 xl:h-4 xl:w-4 2xl:h-[18px] 2xl:w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          title={label}
          className="truncate text-[10px] font-semibold leading-tight text-slate-600 xl:text-[11px] 2xl:text-[13px]"
        >
          {label}
        </p>
        <p
          title={value}
          className="mt-0.5 truncate text-[15px] font-bold leading-none text-biz-text xl:text-[17px] 2xl:text-[20px]"
        >
          {value}
        </p>
        <p
          title={helper}
          className="mt-1 hidden truncate text-[9px] font-medium leading-tight text-slate-500 xl:block 2xl:text-[11px]"
        >
          {helper}
        </p>
      </div>
    </>
  );

  const className = cn(
    "flex min-w-0 items-center gap-2 rounded-lg border bg-white px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow,transform] xl:gap-2.5 xl:px-3 xl:py-2.5 2xl:min-h-[72px] 2xl:gap-3 2xl:px-4 2xl:py-3",
    active
      ? "border-biz-blue bg-biz-blue-soft/35 shadow-[0_0_0_2px_rgba(37,99,235,0.10)]"
      : "border-biz-border",
    onClick &&
      "cursor-pointer hover:-translate-y-px hover:border-biz-blue/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue/30",
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-pressed={active}
        title={actionLabel ?? `Filter records by ${label}`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export default function ItemPriceHistoryPage() {
  useSetBreadcrumb([
    { label: "Tender Management", href: "/tender-management" },
    { label: "Item Price History" },
  ]);
  const priceHistory = useItemPriceHistory();
  const priceHistoryRows = React.useMemo(() => priceHistory.data ?? [], [priceHistory.data]);

  const [draft, setDraft] = React.useState<FilterDraft>(INITIAL_DRAFT);
  const [query, setQuery] = React.useState<FilterDraft>(EMPTY_QUERY);
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [viewMode, setViewMode] = React.useState<"list" | "grid">("list");
  const [moreFiltersOpen, setMoreFiltersOpen] = React.useState(false);
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

  const summaryRows = React.useMemo(() => {
    const term = query.search.trim().toLowerCase();
    return computedRows.filter((row) => {
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
      if (query.source && row.source !== query.source) return false;
      if (query.updatedBy && row.updatedBy.name !== query.updatedBy) return false;
      return true;
    });
  }, [computedRows, query]);

  const filtered = React.useMemo(() => {
    let list = query.changeType
      ? summaryRows.filter((row) => row.changeType === query.changeType)
      : summaryRows;

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
  }, [query.changeType, sort, summaryRows]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * limit, safePage * limit);

  const totalItems = summaryRows.length;
  const increasedCount = summaryRows.filter((r) => r.changeType === "Increased").length;
  const decreasedCount = summaryRows.filter((r) => r.changeType === "Decreased").length;
  const noChangeCount = summaryRows.filter((r) => r.changeType === "No Change").length;
  const avgChangePercent =
    summaryRows.reduce((sum, r) => sum + r.changePercent, 0) / (summaryRows.length || 1);
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
          <p className="line-clamp-2 font-semibold leading-tight text-biz-text">
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
        <span
          title={row.previousPrice.toLocaleString()}
          className="block truncate font-medium text-slate-500"
        >
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
        <span
          title={row.currentPrice.toLocaleString()}
          className="block truncate font-semibold text-biz-blue"
        >
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
                : "text-slate-500",
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
                : "text-slate-500",
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
        <span
          title={formatDate(row.priceDate)}
          className="block truncate whitespace-nowrap font-medium"
        >
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
          className="max-w-full truncate px-1.5 py-0.5 text-[8px] font-semibold xl:text-[9px] 2xl:px-2 2xl:text-[10px]"
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
    <div className="scrollbar-hidden flex min-h-full flex-col gap-2 overflow-y-auto subpixel-antialiased lg:h-full lg:min-h-0 lg:overflow-hidden 2xl:gap-3">
      {/* Summary workspace */}
      <section className="shrink-0 overflow-visible rounded-xl border border-biz-border bg-white shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 xl:px-4 2xl:px-5 2xl:py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue 2xl:h-10 2xl:w-10">
              <History className="h-[18px] w-[18px] 2xl:h-5 2xl:w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[20px] font-bold leading-tight text-biz-text xl:text-[22px] 2xl:text-[26px]">
                Item Price History
              </h1>
            </div>
          </div>

          <div className="[&_button]:h-9 [&_button]:text-[11px] 2xl:[&_button]:h-10 2xl:[&_button]:text-[13px]">
            <SecondaryButton data-shortcut-action="export" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </SecondaryButton>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2 border-t border-biz-border bg-slate-50/50 p-2 sm:grid-cols-3 xl:grid-cols-5 2xl:gap-3 2xl:p-3">
          <PriceHistoryStatCard
            icon={Package}
            iconClassName="bg-biz-blue-soft text-biz-blue"
            label="Total Items"
            value={totalItems.toLocaleString()}
            helper="Matches current filters"
            active={!query.changeType}
            onClick={() => updateFilters({ changeType: "" })}
            actionLabel="Show all price change types"
          />
          <PriceHistoryStatCard
            icon={Tag}
            iconClassName="bg-biz-success-soft text-biz-success"
            label="Price Increased"
            value={increasedCount.toLocaleString()}
            helper={`${pct(increasedCount)}% of filtered items`}
            active={query.changeType === "Increased"}
            onClick={() =>
              updateFilters({ changeType: query.changeType === "Increased" ? "" : "Increased" })
            }
            actionLabel="Filter records with increased prices"
          />
          <PriceHistoryStatCard
            icon={TrendingDown}
            iconClassName="bg-biz-danger-soft text-biz-danger"
            label="Price Decreased"
            value={decreasedCount.toLocaleString()}
            helper={`${pct(decreasedCount)}% of filtered items`}
            active={query.changeType === "Decreased"}
            onClick={() =>
              updateFilters({ changeType: query.changeType === "Decreased" ? "" : "Decreased" })
            }
            actionLabel="Filter records with decreased prices"
          />
          <PriceHistoryStatCard
            icon={Equal}
            iconClassName="bg-biz-orange-soft text-biz-orange"
            label="No Change"
            value={noChangeCount.toLocaleString()}
            helper={`${pct(noChangeCount)}% of filtered items`}
            active={query.changeType === "No Change"}
            onClick={() =>
              updateFilters({ changeType: query.changeType === "No Change" ? "" : "No Change" })
            }
            actionLabel="Filter records with unchanged prices"
          />
          <PriceHistoryStatCard
            icon={Settings2}
            iconClassName="bg-biz-purple-soft text-biz-purple"
            label="Avg. Price Change"
            value={`${avgChangePercent > 0 ? "+" : ""}${avgChangePercent.toFixed(2)}%`}
            helper="Click to sort filtered items"
            active={sort?.key === "changePercent"}
            onClick={() => toggleSort("changePercent")}
            actionLabel="Sort records by price change percentage"
          />
        </div>
      </section>

      {priceHistory.isLoading && (
        <div className="shrink-0 rounded-lg border border-biz-border bg-biz-surface px-4 py-3 text-[12px] text-biz-muted">
          Loading saved tender costing prices...
        </div>
      )}
      {priceHistory.isError && (
        <div className="shrink-0 rounded-lg border border-biz-danger/20 bg-biz-danger-soft px-4 py-3 text-[12px] text-biz-danger">
          Unable to load saved tender costing prices.
        </div>
      )}

      {/* Filter Panel */}
      <section className="relative shrink-0 rounded-lg border border-biz-border bg-white px-3 py-2.5 shadow-card 2xl:p-3">
        <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-4 xl:grid-cols-[minmax(180px,1.55fr)_minmax(110px,.85fr)_minmax(110px,.8fr)_minmax(220px,1.35fr)_minmax(110px,.7fr)_auto] 2xl:gap-3">
          <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
            <label className="truncate text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              Search by Item / Description
            </label>
            <TextInput
              data-shortcut-action="filters"
              icon={Search}
              className="h-9 min-w-0 text-[11px] xl:text-[12px] 2xl:h-10 2xl:text-[14px]"
              placeholder="Search item or description..."
              value={draft.search}
              onChange={(e) => updateFilters({ search: e.target.value })}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label className="truncate text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              Brand / Model
            </label>
            <SelectInput
              className="h-9 min-w-0 w-full text-[11px] xl:text-[12px] 2xl:h-10 2xl:text-[14px]"
              placeholder="Select Brand / Model"
              value={draft.brandModel}
              onChange={(e) => updateFilters({ brandModel: e.target.value })}
              options={brandModelOptions.map((b) => ({ label: b, value: b }))}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label className="truncate text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              Supplier
            </label>
            <SelectInput
              className="h-9 min-w-0 w-full text-[11px] xl:text-[12px] 2xl:h-10 2xl:text-[14px]"
              placeholder="Select Supplier"
              value={draft.supplier}
              onChange={(e) => updateFilters({ supplier: e.target.value })}
              options={supplierOptions.map((s) => ({ label: s, value: s }))}
            />
          </div>

          <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
            <label className="truncate text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              Date Range
            </label>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
              <input
                type="date"
                value={draft.fromDate}
                onChange={(e) => updateFilters({ fromDate: e.target.value })}
                className="h-9 min-w-0 w-full rounded-md border border-biz-border bg-white px-1 text-[9px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30 xl:px-2 xl:text-[10px] 2xl:h-10 2xl:text-[12px]"
              />
              <span className="text-biz-muted">-</span>
              <input
                type="date"
                value={draft.toDate}
                onChange={(e) => updateFilters({ toDate: e.target.value })}
                className="h-9 min-w-0 w-full rounded-md border border-biz-border bg-white px-1 text-[9px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30 xl:px-2 xl:text-[10px] 2xl:h-10 2xl:text-[12px]"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <label className="truncate text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              Price Change
            </label>
            <SelectInput
              className="h-9 min-w-0 w-full text-[11px] xl:text-[12px] 2xl:h-10 2xl:text-[14px]"
              placeholder="All"
              value={draft.changeType}
              onChange={(e) => updateFilters({ changeType: e.target.value })}
              options={CHANGE_TYPE_OPTIONS.map((c) => ({ label: c, value: c }))}
            />
          </div>

          <div className="col-span-2 grid min-w-0 grid-cols-2 gap-1.5 md:col-span-1 xl:col-span-1">
            <SecondaryButton
              onClick={() => setMoreFiltersOpen((v) => !v)}
              className={cn(
                "h-9 min-w-0 gap-1 px-2 text-[10px] 2xl:h-10 2xl:text-[12px]",
                moreFiltersOpen && "border-biz-blue bg-biz-blue-soft text-biz-blue",
              )}
              title="More Filters"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate xl:hidden">More</span>
              <span className="hidden whitespace-nowrap xl:inline">More Filters</span>
            </SecondaryButton>

            <SecondaryButton
              onClick={resetFilters}
              className="h-9 min-w-0 px-2 text-[10px] 2xl:h-10 2xl:text-[12px]"
            >
              Reset
            </SecondaryButton>
          </div>
        </div>

        {moreFiltersOpen && (
          <div className="absolute right-3 top-[calc(100%+6px)] z-50 grid w-[min(380px,calc(100vw-2rem))] grid-cols-2 gap-3 rounded-lg border border-biz-border bg-white p-3 shadow-card-hover">
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
      </section>

      {/* Item Price History List */}
      <section className="flex min-h-[440px] flex-1 flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card lg:min-h-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border bg-slate-50/55 px-3 py-2 2xl:px-4 2xl:py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue">
              <History className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="whitespace-nowrap text-[14px] font-bold text-biz-text xl:text-[15px] 2xl:text-[18px]">
                  Price History Records
                </h2>
                <span className="rounded-full bg-biz-blue-soft px-2 py-0.5 text-[9px] font-semibold text-biz-blue xl:text-[10px] 2xl:text-[12px]">
                  {total.toLocaleString()} results
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <SecondaryButton
                onClick={() => setColumnSettingOpen((v) => !v)}
                className={cn(
                  "h-8 gap-1.5 px-2.5 text-[10px] xl:text-[11px] 2xl:h-9 2xl:text-[12px]",
                  columnSettingOpen && "border-biz-blue bg-biz-blue-soft text-biz-blue",
                )}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Column Settings
              </SecondaryButton>
              {columnSettingOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40"
                    onClick={() => setColumnSettingOpen(false)}
                    aria-label="Close"
                  />
                  <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[230px] rounded-lg border border-biz-border bg-white p-2 shadow-card-hover">
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

            <div className="flex items-center gap-1 rounded-md border border-biz-border bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="List view"
                title="List view"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded 2xl:h-8 2xl:w-8",
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
                  "flex h-7 w-7 items-center justify-center rounded 2xl:h-8 2xl:w-8",
                  viewMode === "grid" ? "bg-biz-blue text-white" : "text-biz-muted hover:bg-biz-bg",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {viewMode === "grid" ? (
          <div className="scrollbar-hidden grid min-h-0 flex-1 auto-rows-max grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:gap-3">
            {pageRows.length === 0 ? (
              <p className="col-span-full px-4 py-8 text-center text-biz-muted">No records found</p>
            ) : (
              pageRows.map((row) => (
                <div
                  key={row.id}
                  className="flex cursor-pointer flex-col gap-2 rounded-lg border border-biz-border bg-white p-3 shadow-[0_1px_4px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] hover:border-biz-blue/30 hover:shadow-card-hover"
                  onClick={() => setViewing(row)}
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
                      onClick={(event) => {
                        event.stopPropagation();
                        setViewing(row);
                      }}
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
            stickyHeader
            onRowClick={setViewing}
            containerClassName="scrollbar-hidden min-h-0 flex-1 overflow-auto"
            tableClassName="min-w-[980px] table-fixed text-[10px] [&_thead_th]:bg-biz-bg [&_thead_th]:font-semibold [&_thead_th]:text-slate-600 [&_tbody_tr:nth-child(even)]:bg-slate-50/35 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-biz-blue-soft/35 [&_td]:overflow-hidden [&_th]:leading-tight [&_th>button]:max-w-full [&_th>button]:min-w-0 [&_th>button]:gap-0.5 [&_th>button]:whitespace-normal [&_th>button]:leading-tight xl:min-w-0 xl:text-[11px] 2xl:text-[13px]"
          />
        )}

        <div className="shrink-0 border-t border-biz-border bg-slate-50/60 [&>div]:!gap-1 [&>div]:!px-3 [&>div]:!py-1.5 [&>div>div]:!gap-1 [&>div>span]:!text-[10px] [&>div>span]:font-medium [&>div>span]:text-slate-600 [&_button]:!h-7 [&_button]:!w-7 [&_button]:!rounded-md [&_button]:!text-[11px] [&_svg]:!h-3.5 [&_svg]:!w-3.5 2xl:[&>div>span]:!text-[11px]">
          <Pagination
            page={safePage}
            limit={limit}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            showJumpButtons
          />
        </div>
      </section>

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
