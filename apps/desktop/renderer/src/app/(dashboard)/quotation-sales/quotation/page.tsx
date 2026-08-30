"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Coins,
  Eye,
  FileText,
  List,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  TrendingUp,
} from "lucide-react";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  QUOTATION_REFERENCE_TOTAL,
  QUOTATION_REFERENCE_VALUE,
  QUOTATION_STATS,
  SALES_QUOTATIONS,
  type SalesQuotationRow,
  type SalesQuotationStatus,
} from "./mock-data";

const CONTROL_CLASS =
  "h-[34px] w-full rounded-[5px] border border-[#dbe3ef] bg-white px-3 text-[9px] font-medium text-[#10244c] outline-none transition focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10";

const STATUS_CLASS: Record<SalesQuotationStatus, string> = {
  Draft: "bg-[#eef1f6] text-[#53627b]",
  Sent: "bg-[#e7f1ff] text-[#1169e8]",
  Accepted: "bg-[#e7f7ec] text-[#249950]",
  Rejected: "bg-[#ffedef] text-[#dc394a]",
};

interface FilterState {
  search: string;
  dateFrom: string;
  dateTo: string;
  status: "" | SalesQuotationStatus;
  salesPerson: string;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  dateFrom: "2024-05-01",
  dateTo: "2025-05-31",
  status: "",
  salesPerson: "",
};

const RECENT_QUOTATIONS = [
  { id: "qt-128", badge: "1,850,000.00 BDT", badgeTone: "amount" as const },
  { id: "qt-127", badge: "2,450,000.00 BDT", badgeTone: "amount" as const },
  { id: "qt-126", badge: "Accepted", badgeTone: "status" as const },
  { id: "qt-125", badge: "Rejected", badgeTone: "status" as const },
  { id: "qt-124", badge: "Sent", badgeTone: "status" as const },
];

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatFilterDate(value: string) {
  if (!value) return "Select date";
  const [year, month, day] = value.split("-");
  const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1];
  return `${day} ${monthName} ${year}`;
}

function StatusBadge({ status }: { status: SalesQuotationStatus }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-[4px] px-2 py-[4px] text-[8px] font-semibold leading-none", STATUS_CLASS[status])}>
      {status}
    </span>
  );
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  helper: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "orange" | "green" | "red" | "purple";
}) {
  const tones = {
    blue: "bg-[#e8f2ff] text-[#1169e8]",
    orange: "bg-[#fff2de] text-[#e99a18]",
    green: "bg-[#e7f7ed] text-[#27a95a]",
    red: "bg-[#ffedef] text-[#e43f4f]",
    purple: "bg-[#f2eaff] text-[#8949db]",
  };

  return (
    <div className="flex h-[96px] min-w-0 items-center rounded-[7px] border border-[#dfe6f1] bg-white px-3.5 shadow-[0_1px_2px_rgba(15,34,70,0.025)] [@media(min-width:1280px)_and_(max-height:800px)]:h-[78px]">
      <span className={cn("flex h-[43px] w-[43px] shrink-0 items-center justify-center rounded-full [@media(min-width:1280px)_and_(max-height:800px)]:h-[40px] [@media(min-width:1280px)_and_(max-height:800px)]:w-[40px]", tones[tone])}>
        <Icon className="h-[20px] w-[20px]" />
      </span>
      <span className="ml-3 min-w-0">
        <span className="block whitespace-nowrap text-[9px] font-semibold text-[#38547f]" title={label}>{label}</span>
        <span className={cn("mt-1.5 block whitespace-nowrap text-[18px] font-bold leading-none text-[#071b49]", value.length > 10 && "text-[16px]")}>{value}</span>
        <span className="mt-1.5 flex items-center gap-1 whitespace-nowrap text-[8px] text-[#62728d]">{helper}</span>
      </span>
    </div>
  );
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      aria-label={label}
      title={label}
      className="inline-flex h-[25px] w-[25px] cursor-default items-center justify-center rounded-[4px] border border-[#dce4ef] bg-white text-[#345079] disabled:opacity-100"
    >
      {children}
    </button>
  );
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-3.5 w-3.5 cursor-pointer rounded-[3px] border-[#aebed5] accent-[#0867e8]"
    />
  );
}

function SectionHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-[44px] items-center justify-between border-b border-[#dfe6f1] px-3.5", className)}>
      <h2 className="text-[11px] font-bold text-[#10244c]">{title}</h2>
      {action}
    </div>
  );
}

function ViewAllButton() {
  return (
    <button type="button" disabled className="cursor-default text-[8.5px] font-semibold text-[#1169e8] disabled:opacity-100">
      View All
    </button>
  );
}

function QuotationsOverview() {
  const gradient = QUOTATION_STATS.map((segment, index) => {
    const usedBefore = QUOTATION_STATS.slice(0, index).reduce((total, item) => total + item.value, 0);
    const start = (usedBefore / QUOTATION_REFERENCE_TOTAL) * 100;
    const end = ((usedBefore + segment.value) / QUOTATION_REFERENCE_TOTAL) * 100;
    return `${segment.color} ${start}% ${end}%`;
  }).join(", ");

  return (
    <section className="overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)] xl:h-[204px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[154px]">
      <SectionHeader title="Quotations Overview" action={<ViewAllButton />} className="[@media(min-width:1280px)_and_(max-height:800px)]:h-[34px]" />
      <div className="flex min-h-[159px] items-center gap-4 px-4 py-3 xl:py-0 [@media(min-width:1280px)_and_(max-height:800px)]:min-h-[120px] [@media(min-width:1280px)_and_(max-height:800px)]:gap-3">
        <div className="relative h-[126px] w-[126px] shrink-0 rounded-full [@media(min-width:1280px)_and_(max-height:800px)]:h-[110px] [@media(min-width:1280px)_and_(max-height:800px)]:w-[110px]" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="128 total quotations">
          <span className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-white text-center shadow-[inset_0_0_0_1px_rgba(219,227,239,0.7)] [@media(min-width:1280px)_and_(max-height:800px)]:inset-[19px]">
            <strong className="text-[20px] leading-none text-[#071b49]">128</strong>
            <span className="mt-1 text-[9px] font-semibold text-[#52627d]">Total</span>
          </span>
        </div>
        <ul className="min-w-0 flex-1 space-y-3 [@media(min-width:1280px)_and_(max-height:800px)]:space-y-2">
          {QUOTATION_STATS.map((segment) => (
            <li key={segment.label} className="grid grid-cols-[8px_minmax(0,1fr)_24px_52px] items-center gap-2 text-[8.5px]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="truncate font-medium text-[#253b62]">{segment.label}</span>
              <span className="text-right font-semibold text-[#10244c]">{segment.value}</span>
              <span className="text-right font-medium text-[#62728d]">({segment.percentage})</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RecentQuotations() {
  const entries = RECENT_QUOTATIONS.map((recent) => ({
    ...recent,
    quotation: SALES_QUOTATIONS.find((item) => item.id === recent.id),
  })).filter((entry): entry is typeof entry & { quotation: SalesQuotationRow } => Boolean(entry.quotation));

  return (
    <section className="overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)] xl:h-[289px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[194px]">
      <SectionHeader title="Recent Quotations" action={<ViewAllButton />} className="[@media(min-width:1280px)_and_(max-height:800px)]:h-[34px]" />
      <div className="divide-y divide-[#edf1f6] px-3">
        {entries.map(({ quotation, badge, badgeTone }) => (
          <div key={quotation.id} className="grid min-h-[48px] grid-cols-[25px_minmax(0,1fr)_auto_70px] items-center gap-2 xl:h-[48px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[32px] [@media(min-width:1280px)_and_(max-height:800px)]:min-h-[32px]">
            <span className="flex h-6 w-6 items-center justify-center text-[#1169e8]"><FileText className="h-4 w-4" /></span>
            <span className="min-w-0">
              <strong className="block truncate text-[8.5px] text-[#10244c]">{quotation.quotationNo}</strong>
              <span className="mt-0.5 block truncate text-[7.5px] text-[#52627d]">{quotation.customer}</span>
            </span>
            {badgeTone === "amount" ? (
              <span className="whitespace-nowrap rounded-[4px] bg-[#f1f4f8] px-2 py-1 text-[7px] font-semibold text-[#425b80]">{badge}</span>
            ) : (
              <StatusBadge status={badge as SalesQuotationStatus} />
            )}
            <span className="whitespace-nowrap text-right text-[7.5px] text-[#52627d]">{quotation.quotationDateLabel}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickActions() {
  const tileClass = "flex h-[62px] flex-col items-center justify-center gap-1.5 rounded-[6px] border border-[#dce4ef] bg-white text-center text-[7.5px] font-semibold text-[#21385f] [@media(min-width:1280px)_and_(max-height:800px)]:h-[56px]";
  const iconClass = "flex h-7 w-7 items-center justify-center rounded-full text-[#0867e8]";

  return (
    <section className="overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)] xl:h-[110px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[104px]">
      <SectionHeader title="Quick Actions" className="h-[34px]" />
      <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-4 [@media(min-width:1280px)_and_(max-height:800px)]:p-[7px]">
        <button type="button" disabled className={cn(tileClass, "cursor-default disabled:opacity-100")}>
          <span className={iconClass}><Plus className="h-5 w-5" /></span>
          <span>New Quotation</span>
        </button>
        <Link href="/quotation-sales/quotation" className={tileClass}>
          <span className={iconClass}><List className="h-5 w-5" /></span>
          <span>Quotation List</span>
        </Link>
        <button type="button" disabled className={cn(tileClass, "cursor-default disabled:opacity-100")}>
          <span className={iconClass}><FileText className="h-5 w-5" /></span>
          <span>Quotation Template</span>
        </button>
        <button type="button" disabled className={cn(tileClass, "cursor-default disabled:opacity-100")}>
          <span className={iconClass}><Search className="h-5 w-5" /></span>
          <span>Search by TID</span>
        </button>
      </div>
    </section>
  );
}

export default function QuotationPage() {
  useSetBreadcrumb([
    { label: "Quotation / Sales" },
    { label: "Quotation" },
  ]);

  const [draftFilters, setDraftFilters] = React.useState<FilterState>(DEFAULT_FILTERS);
  const [filters, setFilters] = React.useState<FilterState>(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());

  const filteredRows = React.useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return SALES_QUOTATIONS.filter((row) => {
      const matchesSearch = !search || [row.quotationNo, row.customer, row.project].some((value) => value.toLowerCase().includes(search));
      const matchesStatus = !filters.status || row.status === filters.status;
      const matchesFrom = !filters.dateFrom || row.quotationDate >= filters.dateFrom;
      const matchesTo = !filters.dateTo || row.quotationDate <= filters.dateTo;
      return matchesSearch && matchesStatus && matchesFrom && matchesTo;
    });
  }, [filters]);

  const selectedVisibleCount = filteredRows.filter((row) => selectedIds.has(row.id)).length;
  const allVisibleSelected = filteredRows.length > 0 && selectedVisibleCount === filteredRows.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  function applyFilters() {
    setFilters(draftFilters);
    setSelectedIds(new Set());
  }

  function resetFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setSelectedIds(new Set());
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredRows.forEach((row) => next.delete(row.id));
      else filteredRows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-full bg-[#f8faff] text-[#0b1f4b]">
      <div className="flex min-h-[132px] flex-col items-start justify-between gap-3 sm:h-[82px] sm:min-h-0 sm:flex-row sm:items-start [@media(min-width:1280px)_and_(max-height:800px)]:h-[61px]">
        <div className="pt-[17px] [@media(min-width:1280px)_and_(max-height:800px)]:pt-1">
          <h1 className="text-[23px] font-bold leading-tight tracking-[-0.02em] text-[#071b49]">Quotation</h1>
          <p className="mt-1 text-[10px] text-[#40577f]">Create, manage and track quotations. Convert to sales orders seamlessly.</p>
        </div>
        <label className="relative mt-1 block h-[43px] w-full rounded-[6px] border border-[#dce4ef] bg-white px-4 pt-[6px] shadow-[0_1px_3px_rgba(20,39,74,0.03)] sm:w-[230px]">
          <span className="block text-[8px] font-medium text-[#60718e]">Select Project</span>
          <select aria-label="Select Project" defaultValue="nbr-building" className="absolute inset-0 h-full w-full appearance-none bg-transparent px-4 pb-1 pt-[16px] text-[11px] font-bold text-[#10244c] outline-none">
            <option value="nbr-building">NBR Building Construction</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#071b49]" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.25fr)] [@media(min-width:1280px)_and_(max-height:800px)]:gap-[10px]">
        <KpiCard label="Total Quotations" value="128" icon={FileText} tone="blue" helper={<><TrendingUp className="h-3 w-3 text-[#25a95a]" /><span className="font-semibold text-[#25a95a]">12%</span><span>vs last month</span></>} />
        <KpiCard label="Draft" value="32" icon={FileText} tone="orange" helper="25.00%" />
        <KpiCard label="Sent" value="45" icon={Send} tone="blue" helper="35.16%" />
        <KpiCard label="Accepted" value="28" icon={CheckCircle2} tone="green" helper="21.88%" />
        <KpiCard label="Rejected" value="23" icon={CircleX} tone="red" helper="17.97%" />
        <KpiCard label="Total Quotation Value (BDT)" value={formatMoney(QUOTATION_REFERENCE_VALUE)} icon={Coins} tone="purple" helper={<><TrendingUp className="h-3 w-3 text-[#25a95a]" /><span className="font-semibold text-[#25a95a]">15%</span><span>vs last month</span></>} />
      </div>

      <form
        className="mt-3 flex min-h-[80px] items-center rounded-[7px] border border-[#dfe6f1] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,34,70,0.02)] [@media(min-width:1280px)_and_(max-height:800px)]:mt-[10px] [@media(min-width:1280px)_and_(max-height:800px)]:min-h-[67px] [@media(min-width:1280px)_and_(max-height:800px)]:py-2"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="grid w-full grid-cols-1 items-end gap-3 md:grid-cols-2 xl:grid-cols-[1.45fr_1.45fr_.82fr_1.05fr_100px_100px]">
          <label className="relative block min-w-0">
            <span className="mb-1.5 block text-[8.5px] font-semibold text-[#33496f]">Search</span>
            <input value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search by Quotation No, Customer, Project..." className={cn(CONTROL_CLASS, "pr-9")} />
            <Search className="pointer-events-none absolute bottom-[10px] right-3 h-3.5 w-3.5 text-[#506583]" />
          </label>

          <label className="block min-w-0">
            <span className="mb-1.5 block text-[8.5px] font-semibold text-[#33496f]">Date Range</span>
            <span className="grid h-[34px] grid-cols-[1fr_auto_1fr] items-center overflow-hidden rounded-[5px] border border-[#dbe3ef] bg-white">
              <span className="relative flex h-[32px] min-w-0 items-center pl-8 pr-1 text-[8.5px] font-medium text-[#10244c]"><CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#3c5a83]" /><span className="truncate">{formatFilterDate(draftFilters.dateFrom)}</span><input type="date" aria-label="Date from" value={draftFilters.dateFrom} onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></span>
              <span className="px-1 text-[12px] text-[#506583]" aria-hidden="true">&rarr;</span>
              <span className="relative flex h-[32px] min-w-0 items-center pl-2 pr-8 text-[8.5px] font-medium text-[#10244c]"><span className="truncate">{formatFilterDate(draftFilters.dateTo)}</span><CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#3c5a83]" /><input type="date" aria-label="Date to" min={draftFilters.dateFrom} value={draftFilters.dateTo} onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></span>
            </span>
          </label>

          <label className="block min-w-0"><span className="mb-1.5 block text-[8.5px] font-semibold text-[#33496f]">Status</span><select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as FilterState["status"] }))} className={CONTROL_CLASS}><option value="">All Status</option><option>Draft</option><option>Sent</option><option>Accepted</option><option>Rejected</option></select></label>
          <label className="block min-w-0"><span className="mb-1.5 block text-[8.5px] font-semibold text-[#33496f]">Sales Person</span><select value={draftFilters.salesPerson} onChange={(event) => setDraftFilters((current) => ({ ...current, salesPerson: event.target.value }))} className={CONTROL_CLASS}><option value="">All Sales Person</option></select></label>
          <button type="submit" className="inline-flex h-[34px] w-full items-center justify-center gap-1.5 rounded-[5px] bg-[#0867e8] px-5 text-[9px] font-semibold text-white"><Search className="h-3.5 w-3.5" /> Search</button>
          <button type="button" onClick={resetFilters} className="inline-flex h-[34px] w-full items-center justify-center gap-1.5 rounded-[5px] border border-[#dbe3ef] bg-white px-4 text-[9px] font-semibold text-[#1169e8]"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
        </div>
      </form>

      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,2.65fr)_minmax(300px,1fr)] [@media(min-width:1280px)_and_(max-height:800px)]:mt-[10px] [@media(min-width:1280px)_and_(max-height:800px)]:gap-[10px]">
        <section className="min-w-0 overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)] xl:h-[565px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[474px]">
          <SectionHeader
            title="Quotation List"
            className="h-[50px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[40px]"
            action={
              <button type="button" disabled className="inline-flex h-[31px] cursor-default items-center justify-center gap-1.5 rounded-[5px] bg-[#0867e8] px-4 text-[9px] font-semibold text-white disabled:opacity-100">
                <Plus className="h-3.5 w-3.5" /> New Quotation
              </button>
            }
          />

          <div className="overflow-auto xl:h-[450px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[391px]">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#f7f9fc] text-[8px] font-semibold text-[#263c63]">
                <tr className="h-[40px] border-b border-[#dfe6f1] [@media(min-width:1280px)_and_(max-height:800px)]:h-[31px]">
                  <th className="w-10 px-3 text-center"><SelectionCheckbox checked={allVisibleSelected} indeterminate={someVisibleSelected} label="Select all visible quotations" onChange={toggleAllVisible} /></th>
                  <th className="w-9 px-1">SL</th>
                  <th className="w-[105px] px-2">Quotation No</th>
                  <th className="w-[135px] px-2">Customer</th>
                  <th className="px-2">Project / Work Name</th>
                  <th className="w-[94px] px-2">Quotation Date</th>
                  <th className="w-[86px] px-2">Valid Until</th>
                  <th className="w-[102px] px-2 text-right">Value (BDT)</th>
                  <th className="w-[70px] px-2">Status</th>
                  <th className="w-[90px] px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="text-[8.5px] text-[#20375f]">
                {filteredRows.length ? filteredRows.map((row, index) => (
                  <tr key={row.id} className="h-[41px] border-b border-[#edf1f6] last:border-0 hover:bg-[#f8faff] [@media(min-width:1280px)_and_(max-height:800px)]:h-[34px]">
                    <td className="px-3 text-center"><SelectionCheckbox checked={selectedIds.has(row.id)} label={`Select ${row.quotationNo}`} onChange={() => toggleRow(row.id)} /></td>
                    <td className="px-1 text-[#52627d]">{index + 1}</td>
                    <td className="px-2 font-semibold text-[#174a9b]">{row.quotationNo}</td>
                    <td className="px-2 font-medium">{row.customer}</td>
                    <td className="px-2">{row.project}</td>
                    <td className="whitespace-nowrap px-2">{row.quotationDateLabel}</td>
                    <td className="whitespace-nowrap px-2">{row.validUntilLabel}</td>
                    <td className="px-2 text-right tabular-nums">{formatMoney(row.value)}</td>
                    <td className="px-2"><StatusBadge status={row.status} /></td>
                    <td className="px-2"><div className="flex justify-center gap-1"><IconButton label={`View ${row.quotationNo}`}><Eye className="h-3 w-3" /></IconButton><IconButton label={`Edit ${row.quotationNo}`}><Pencil className="h-3 w-3" /></IconButton><IconButton label={`More actions for ${row.quotationNo}`}><MoreVertical className="h-3 w-3" /></IconButton></div></td>
                  </tr>
                )) : (
                  <tr><td colSpan={10} className="h-[150px] text-center text-[10px] text-[#62728d]">No quotations match the selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex min-h-[58px] items-center justify-between border-t border-[#dfe6f1] px-3 text-[8px] text-[#52627d] xl:h-[65px] [@media(min-width:1280px)_and_(max-height:800px)]:h-[43px] [@media(min-width:1280px)_and_(max-height:800px)]:min-h-[43px]">
            <span>Showing {filteredRows.length ? 1 : 0} to {filteredRows.length} of {!filters.search && !filters.status && filters.dateFrom === DEFAULT_FILTERS.dateFrom && filters.dateTo === DEFAULT_FILTERS.dateTo ? 128 : filteredRows.length} entries</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-[#e0e6ef] text-[#9aa5b6]"><ChevronLeft className="h-3.5 w-3.5" /></button>
              {[1, 2, 3, 4, 5].map((number) => <button key={number} type="button" disabled className={cn("h-7 min-w-7 rounded-[4px] border px-1.5 text-[9px] font-semibold disabled:opacity-100", number === 1 ? "border-[#0867e8] bg-[#0867e8] text-white" : "border-[#e0e6ef] bg-white text-[#33496f]")}>{number}</button>)}
              <button type="button" disabled className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-[#e0e6ef] text-[#33496f]"><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </section>

        <aside className="grid gap-3 [@media(min-width:1280px)_and_(max-height:800px)]:gap-[10px]">
          <QuotationsOverview />
          <RecentQuotations />
          <QuickActions />
        </aside>
      </div>
    </div>
  );
}
