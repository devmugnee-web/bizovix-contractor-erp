"use client";

import * as React from "react";
import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  Info,
  ListChecks,
  MoreVertical,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  ACCEPTED_RESULTS,
  DECISION_STATS,
  PENDING_RESULTS,
  RECENT_DECISIONS,
  REJECTED_RESULTS,
  type DecisionStatus,
} from "./mock-data";

const CONTROL = "h-[32px] w-full rounded-[4px] border border-[#dbe3ef] bg-white px-2.5 text-[8px] font-medium text-[#10244c] outline-none focus:border-[#1769e8] focus:ring-1 focus:ring-[#1769e8]/10";
const BORDER = "border-[#dfe6f1]";

type ResultSection = "Accepted" | "Rejected" | "Pending";

interface FilterState {
  search: string;
  dateFrom: string;
  dateTo: string;
  status: "" | ResultSection;
  decision: "" | ResultSection;
  salesPerson: string;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  dateFrom: "2024-05-01",
  dateTo: "2025-05-31",
  status: "",
  decision: "",
  salesPerson: "",
};

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFilterDate(value: string) {
  if (!value) return "Select date";
  const [year, month, day] = value.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[Number(month) - 1] ?? ""} ${year}`;
}

function KpiCard({
  label,
  value,
  trend,
  helper,
  tone,
  trendTone = "green",
  icon: Icon,
}: {
  label: string;
  value: string;
  trend: string;
  helper: string;
  tone: "blue" | "green" | "red" | "orange" | "purple";
  trendTone?: "green" | "red";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tones = {
    blue: "bg-[#e8f2ff] text-[#1169e8]",
    green: "bg-[#e5f8ee] text-[#2caf67]",
    red: "bg-[#ffeded] text-[#e94750]",
    orange: "bg-[#fff2df] text-[#e99b25]",
    purple: "bg-[#f1e9ff] text-[#8b4cdb]",
  };

  return (
    <section className={cn("flex h-[99px] min-w-0 items-center rounded-[7px] border bg-white px-3 shadow-[0_1px_2px_rgba(15,34,70,0.025)]", BORDER)}>
      <span className={cn("flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full", tones[tone])}><Icon className="h-[19px] w-[19px]" /></span>
      <span className="ml-2.5 min-w-0">
        <span className="block truncate text-[7.4px] font-semibold text-[#3b5278]" title={label}>{label}</span>
        <strong className={cn("mt-1.5 block whitespace-nowrap text-[18px] leading-none text-[#071b49]", value.length > 9 && "text-[15px]")}>{value}</strong>
        <span className={cn("mt-1.5 flex items-center gap-1 text-[7px] font-semibold", trendTone === "green" ? "text-[#31a967]" : "text-[#e14d57]")}><TrendingUp className="h-2.5 w-2.5" />{trend}</span>
        <span className="mt-0.5 block whitespace-nowrap text-[6.5px] text-[#6d7d95]">{helper}</span>
      </span>
    </section>
  );
}

function TinyButton({ label, tone = "blue" }: { label: string; tone?: "blue" | "green" }) {
  return <button type="button" disabled className={cn("inline-flex h-[21px] cursor-default items-center justify-center whitespace-nowrap rounded-[3px] border px-1.5 text-[6.6px] font-semibold disabled:opacity-100", tone === "green" ? "border-[#c9ecd7] bg-[#39b96d] text-white" : "border-[#cfe0f7] bg-white text-[#1169e8]")}>{label}</button>;
}

function ExportButton() {
  return <button type="button" disabled className="inline-flex h-[26px] cursor-default items-center justify-center gap-1.5 rounded-[4px] border border-[#dbe3ef] bg-white px-3 text-[7.5px] font-semibold text-[#173058] disabled:opacity-100"><Download className="h-3 w-3" /> Export</button>;
}

function Pagination({ pages }: { pages: Array<number | "ellipsis"> }) {
  const button = "inline-flex h-[24px] min-w-[24px] items-center justify-center rounded-[4px] border text-[7px] font-semibold";
  return (
    <div className="flex items-center gap-1">
      <button type="button" disabled className={cn(button, "cursor-default border-[#e0e6ef] bg-white text-[#6c7e98] disabled:opacity-100")}><ChevronLeft className="h-3 w-3" /></button>
      {pages.map((page, index) => page === "ellipsis" ? <span key={`ellipsis-${index}`} className={cn(button, "border-[#e0e6ef] bg-white text-[#6c7e98]")}>...</span> : <button key={page} type="button" disabled className={cn(button, "cursor-default disabled:opacity-100", page === 1 ? "border-[#0867e8] bg-[#0867e8] text-white" : "border-[#e0e6ef] bg-white text-[#52627d]")}>{page}</button>)}
      <button type="button" disabled className={cn(button, "cursor-default border-[#e0e6ef] bg-white text-[#6c7e98] disabled:opacity-100")}><ChevronRight className="h-3 w-3" /></button>
    </div>
  );
}

function DecisionOverview() {
  const gradient = DECISION_STATS.map((segment, index) => {
    const prior = DECISION_STATS.slice(0, index).reduce((sum, item) => sum + item.value, 0);
    return `${segment.color} ${(prior / 128) * 100}% ${((prior + segment.value) / 128) * 100}%`;
  }).join(", ");

  return (
    <section className={cn("overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)] xl:h-[158px]", BORDER)}>
      <div className="flex h-[36px] items-center justify-between px-3"><h2 className="text-[9px] font-bold text-[#10244c]">Decision Overview</h2><button type="button" disabled className="cursor-default text-[7px] font-semibold text-[#0867e8] disabled:opacity-100">View Report</button></div>
      <div className="flex min-h-[120px] items-center gap-4 px-4 pb-3">
        <div className="relative h-[104px] w-[104px] shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="128 total quotation decisions">
          <span className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(219,227,239,0.65)]"><strong className="text-[17px] leading-none text-[#071b49]">128</strong><span className="mt-1 text-[8px] font-semibold text-[#52627d]">Total</span></span>
        </div>
        <ul className="min-w-0 flex-1 space-y-3">
          {DECISION_STATS.map((item) => <li key={item.label} className="grid grid-cols-[8px_minmax(0,1fr)_22px_46px] items-center gap-2 text-[7.5px]"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} /><span className="font-medium text-[#263e65]">{item.label}</span><strong className="text-right text-[#10244c]">{item.value}</strong><span className="text-right text-[#63738d]">({item.percentage})</span></li>)}
        </ul>
      </div>
    </section>
  );
}

const STATUS_TONE: Record<DecisionStatus, string> = {
  Accepted: "bg-[#e6f8ed] text-[#269d58]",
  Rejected: "bg-[#ffebed] text-[#db3e49]",
  Pending: "bg-[#f5eaff] text-[#8a45d1]",
};

function RecentDecisions() {
  return (
    <section className={cn("overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)] xl:h-[174px]", BORDER)}>
      <div className="flex h-[34px] items-center justify-between border-b border-[#edf1f6] px-3"><h2 className="text-[9px] font-bold text-[#10244c]">Recent Decisions</h2><button type="button" disabled className="cursor-default text-[7px] font-semibold text-[#0867e8] disabled:opacity-100">View All</button></div>
      <div className="divide-y divide-[#edf1f6] px-3">
        {RECENT_DECISIONS.map((item) => {
          const tone = item.status === "Accepted" ? "bg-[#e7f8ee] text-[#28a760]" : item.status === "Rejected" ? "bg-[#ffebed] text-[#df4651]" : "bg-[#f2e8ff] text-[#8b4bd5]";
          return <div key={`${item.quotationNo}-${item.date}`} className="grid h-[34px] grid-cols-[24px_minmax(0,1fr)_auto_58px] items-center gap-2"><span className={cn("flex h-[20px] w-[20px] items-center justify-center rounded-full", tone)}><FileCheck2 className="h-3 w-3" /></span><span className="min-w-0"><strong className="block truncate text-[7px] text-[#10244c]">{item.quotationNo}</strong><span className="mt-0.5 block truncate text-[6.2px] text-[#52627d]">{item.customer} &nbsp;•&nbsp; {item.project}</span></span><span className={cn("rounded-[3px] px-1.5 py-1 text-[6px] font-semibold", STATUS_TONE[item.status])}>{item.status}</span><span className="whitespace-nowrap text-right text-[6.3px] text-[#52627d]">{item.date}</span></div>;
        })}
      </div>
    </section>
  );
}

function QuickActions() {
  const tile = "flex h-[54px] flex-col items-center justify-center gap-1.5 rounded-[5px] border border-[#dce4ef] bg-white text-center text-[6.8px] font-semibold text-[#20385e]";
  return (
    <section className={cn("overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)] xl:h-[161px]", BORDER)}>
      <div className="flex h-[34px] items-center border-b border-[#edf1f6] px-3"><h2 className="text-[9px] font-bold text-[#10244c]">Quick Actions</h2></div>
      <div className="grid grid-cols-2 gap-2 p-2.5">
        <Link href="/quotation-sales/quotation" className={tile}><ListChecks className="h-4.5 w-4.5 text-[#0867e8]" /> View All Quotations</Link>
        <button type="button" disabled className={cn(tile, "cursor-default disabled:opacity-100")}><Plus className="h-4.5 w-4.5 text-[#0867e8]" /> Create Quotation</button>
        <button type="button" disabled className={cn(tile, "cursor-default disabled:opacity-100")}><Download className="h-4.5 w-4.5 text-[#0867e8]" /> Export Accepted List</button>
        <button type="button" disabled className={cn(tile, "cursor-default disabled:opacity-100")}><Download className="h-4.5 w-4.5 text-[#0867e8]" /> Export Rejected List</button>
      </div>
    </section>
  );
}

export default function QuotationResultsPage() {
  useSetBreadcrumb([
    { label: "Home", href: "/dashboard" },
    { label: "Quotation / Sales" },
    { label: "Quotation Results" },
  ]);

  const [draftFilters, setDraftFilters] = React.useState<FilterState>(DEFAULT_FILTERS);
  const [filters, setFilters] = React.useState<FilterState>(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = React.useState<"All" | ResultSection>("Accepted");
  const acceptedRef = React.useRef<HTMLElement>(null);
  const rejectedRef = React.useRef<HTMLElement>(null);
  const pendingRef = React.useRef<HTMLElement>(null);

  function matches(row: { quotationNo: string; customer: string; project: string; quotationDate: string }, section: ResultSection, person: string) {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch = !search || [row.quotationNo, row.customer, row.project].some((value) => value.toLowerCase().includes(search));
    const matchesDate = (!filters.dateFrom || row.quotationDate >= filters.dateFrom) && (!filters.dateTo || row.quotationDate <= filters.dateTo);
    const matchesStatus = !filters.status || filters.status === section;
    const matchesDecision = !filters.decision || filters.decision === section;
    const matchesPerson = !filters.salesPerson || filters.salesPerson === person;
    return matchesSearch && matchesDate && matchesStatus && matchesDecision && matchesPerson;
  }

  const acceptedRows = ACCEPTED_RESULTS.filter((row) => matches(row, "Accepted", row.decisionBy));
  const rejectedRows = REJECTED_RESULTS.filter((row) => matches(row, "Rejected", row.decisionBy));
  const pendingRows = PENDING_RESULTS.filter((row) => matches(row, "Pending", row.salesPerson));

  function resetFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  }

  function selectTab(tab: "All" | ResultSection) {
    setActiveTab(tab);
    const target = tab === "Rejected" ? rejectedRef.current : tab === "Pending" ? pendingRef.current : acceptedRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="min-h-full bg-[#f8faff] text-[#0b1f4b]">
      <header className="flex min-h-[57px] flex-col justify-between gap-2 pb-2 sm:flex-row sm:items-start">
        <div className="pt-1"><h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-[#071b49]">Quotation Results</h1><p className="mt-1 text-[9.5px] text-[#40577f]">Track and manage quotation results, follow-ups and conversion to projects or sales orders.</p></div>
        <label className="relative block h-[44px] w-full rounded-[6px] border border-[#dce4ef] bg-white px-3 pt-[5px] sm:w-[220px]"><span className="block text-[7.5px] font-medium text-[#60718e]">Select Project</span><select aria-label="Select Project" defaultValue="nbr" className="absolute inset-0 h-full w-full appearance-none bg-transparent px-3 pb-1 pt-[16px] text-[10px] font-bold text-[#10244c] outline-none"><option value="nbr">NBR Building Construction</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#071b49]" /></label>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Total Quotations" value="128" trend="12%" helper="vs. last month" tone="blue" icon={ClipboardCheck} />
        <KpiCard label="Accepted" value="28" trend="21.88%" helper="vs. last month" tone="green" icon={CheckCircle2} />
        <KpiCard label="Rejected" value="23" trend="17.97%" helper="vs. last month" tone="red" trendTone="red" icon={CircleX} />
        <KpiCard label="Pending" value="77" trend="60.16%" helper="vs. last month" tone="orange" icon={Clock3} />
        <KpiCard label="Accepted Value (BDT)" value="18,960,000.00" trend="52.41%" helper="vs. last month" tone="purple" icon={Banknote} />
        <KpiCard label="Rejected Value (BDT)" value="7,320,000.00" trend="20.24%" helper="vs. last month" tone="red" trendTone="red" icon={Banknote} />
        <KpiCard label="Conversion to Project" value="16" trend="57.14%" helper="of accepted quotations" tone="blue" icon={FileCheck2} />
      </div>

      <form onSubmit={(event) => { event.preventDefault(); setFilters(draftFilters); }} className={cn("mt-2.5 flex min-h-[72px] items-center rounded-[7px] border bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,34,70,0.02)]", BORDER)}>
        <div className="grid w-full grid-cols-1 items-end gap-2 sm:grid-cols-2 xl:grid-cols-[1.45fr_1.75fr_.7fr_.75fr_.92fr_80px_72px]">
          <label className="relative block min-w-0"><span className="mb-1.5 block text-[7.5px] font-semibold text-[#33496f]">Search</span><input value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search by Quotation No, Customer, Project..." className={cn(CONTROL, "pr-8")} /><Search className="pointer-events-none absolute bottom-[9px] right-2.5 h-3.5 w-3.5 text-[#4a6386]" /></label>
          <label className="block min-w-0"><span className="mb-1.5 block text-[7.5px] font-semibold text-[#33496f]">Date Range</span><span className="grid h-[32px] grid-cols-[1fr_auto_1fr] items-center overflow-hidden rounded-[4px] border border-[#dbe3ef] bg-white"><span className="relative flex h-full items-center pl-7 pr-1 text-[7.5px] font-semibold text-[#10244c]"><CalendarDays className="absolute left-2 h-3.5 w-3.5 text-[#3f5a80]" /><span className="truncate">{formatFilterDate(draftFilters.dateFrom)}</span><input type="date" aria-label="Date from" value={draftFilters.dateFrom} onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))} className="absolute inset-0 cursor-pointer opacity-0" /></span><span className="text-[11px] text-[#52627d]">→</span><span className="relative flex h-full items-center pl-2 pr-7 text-[7.5px] font-semibold text-[#10244c]"><span className="truncate">{formatFilterDate(draftFilters.dateTo)}</span><CalendarDays className="absolute right-2 h-3.5 w-3.5 text-[#3f5a80]" /><input type="date" aria-label="Date to" min={draftFilters.dateFrom} value={draftFilters.dateTo} onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))} className="absolute inset-0 cursor-pointer opacity-0" /></span></span></label>
          <label className="relative block min-w-0"><span className="mb-1.5 block text-[7.5px] font-semibold text-[#33496f]">Status</span><select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as FilterState["status"] }))} className={cn(CONTROL, "appearance-none pr-7")}><option value="">All Status</option><option>Accepted</option><option>Rejected</option><option>Pending</option></select><ChevronDown className="pointer-events-none absolute bottom-[10px] right-2 h-3 w-3 text-[#4b6385]" /></label>
          <label className="relative block min-w-0"><span className="mb-1.5 block text-[7.5px] font-semibold text-[#33496f]">Decision</span><select value={draftFilters.decision} onChange={(event) => setDraftFilters((current) => ({ ...current, decision: event.target.value as FilterState["decision"] }))} className={cn(CONTROL, "appearance-none pr-7")}><option value="">All</option><option>Accepted</option><option>Rejected</option><option>Pending</option></select><ChevronDown className="pointer-events-none absolute bottom-[10px] right-2 h-3 w-3 text-[#4b6385]" /></label>
          <label className="relative block min-w-0"><span className="mb-1.5 block text-[7.5px] font-semibold text-[#33496f]">Sales Person</span><select value={draftFilters.salesPerson} onChange={(event) => setDraftFilters((current) => ({ ...current, salesPerson: event.target.value }))} className={cn(CONTROL, "appearance-none pr-7")}><option value="">All Sales Person</option><option>Admin User</option><option>Md. Rahman</option></select><ChevronDown className="pointer-events-none absolute bottom-[10px] right-2 h-3 w-3 text-[#4b6385]" /></label>
          <button type="submit" className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[4px] bg-[#0867e8] px-3 text-[8px] font-semibold text-white"><Search className="h-3.5 w-3.5" /> Search</button>
          <button type="button" onClick={resetFilters} className="inline-flex h-[32px] items-center justify-center gap-1.5 rounded-[4px] border border-[#dbe3ef] bg-white px-2.5 text-[8px] font-semibold text-[#173058]"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
        </div>
      </form>

      <div className="mt-2.5 grid grid-cols-1 items-start gap-2.5 xl:grid-cols-[minmax(0,3.15fr)_minmax(290px,1fr)]">
        <div className="min-w-0 space-y-2.5">
          <section ref={acceptedRef} className={cn("overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]", BORDER)}>
            <div className="flex h-[37px] items-end justify-between border-b border-[#dfe6f1] px-3">
              <div className="flex h-full items-end gap-6 overflow-x-auto">
                {(["All", "Accepted", "Rejected", "Pending"] as const).map((tab) => <button key={tab} type="button" onClick={() => selectTab(tab)} className={cn("relative h-full shrink-0 whitespace-nowrap px-1 text-[7.5px] font-semibold", activeTab === tab ? "text-[#0867e8] after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#0867e8]" : "text-[#334b70]")}>{tab} ({tab === "All" ? 128 : tab === "Accepted" ? 28 : tab === "Rejected" ? 23 : 77})</button>)}
              </div>
              <span className="mb-1 shrink-0"><ExportButton /></span>
            </div>
            <div className="flex h-[34px] items-center border-b border-[#edf1f6] px-3"><h2 className="text-[8.5px] font-bold text-[#10244c]">Accepted Quotations</h2></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[920px] table-fixed border-collapse text-[6.7px] text-[#173058]"><colgroup><col className="w-[28px]" /><col className="w-[83px]" /><col className="w-[110px]" /><col className="w-[120px]" /><col className="w-[82px]" /><col className="w-[82px]" /><col className="w-[86px]" /><col className="w-[75px]" /><col className="w-[100px]" /><col className="w-[92px]" /><col className="w-[115px]" /></colgroup><thead className="bg-[#f7f9fc] text-[6.5px] font-semibold text-[#21385e]"><tr className="h-[25px] border-b border-[#e3e9f2]">{["SL","Quotation No","Customer","Project / Work Name","Quotation Date","Value (BDT)","Decision Date","Decision By","Accepted Amount (BDT)","Customer PO / WO No.","Action"].map((label) => <th key={label} className={cn("px-1.5 text-left", label.includes("BDT") && "text-right", label === "Action" && "text-center")}>{label}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1f6]">{acceptedRows.map((row, index) => <tr key={row.id} className="h-[28px]"><td className="px-1.5">{index + 1}</td><td className="px-1.5 font-semibold">{row.quotationNo}</td><td className="truncate px-1.5" title={row.customer}>{row.customer}</td><td className="truncate px-1.5" title={row.project}>{row.project}</td><td className="px-1.5">{row.quotationDateLabel}</td><td className="px-1.5 text-right">{formatMoney(row.value)}</td><td className="px-1.5">{row.decisionDateLabel}</td><td className="px-1.5">{row.decisionBy}</td><td className="px-1.5 text-right">{formatMoney(row.acceptedAmount)}</td><td className="px-1.5">{row.customerOrderNo}</td><td className="px-1.5"><span className="flex items-center justify-center gap-1"><TinyButton label="View" /><TinyButton label="Create Project" tone="green" /><button type="button" disabled aria-label="More actions" className="cursor-default text-[#173058] disabled:opacity-100"><MoreVertical className="h-3 w-3" /></button></span></td></tr>)}{acceptedRows.length === 0 && <tr><td colSpan={11} className="h-[70px] text-center text-[8px] text-[#687893]">No accepted quotations match the filters.</td></tr>}</tbody></table></div>
            <div className="flex min-h-[36px] items-center justify-between gap-3 border-t border-[#edf1f6] px-3 text-[6.8px] text-[#52627d]"><span>Showing {acceptedRows.length > 0 ? 1 : 0} to {acceptedRows.length} of 28 entries</span><Pagination pages={[1,2,3,"ellipsis",6]} /></div>
          </section>

          <section ref={rejectedRef} className={cn("overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]", BORDER)}>
            <div className="flex h-[34px] items-center justify-between border-b border-[#edf1f6] px-3"><h2 className="text-[8.5px] font-bold text-[#10244c]">Rejected Quotations</h2><ExportButton /></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[860px] table-fixed border-collapse text-[6.7px] text-[#173058]"><colgroup><col className="w-[28px]" /><col className="w-[90px]" /><col className="w-[115px]" /><col className="w-[130px]" /><col className="w-[85px]" /><col className="w-[90px]" /><col className="w-[88px]" /><col className="w-[78px]" /><col className="w-[145px]" /><col className="w-[65px]" /></colgroup><thead className="bg-[#f7f9fc] text-[6.5px] font-semibold text-[#21385e]"><tr className="h-[25px] border-b border-[#e3e9f2]">{["SL","Quotation No","Customer","Project / Work Name","Quotation Date","Value (BDT)","Decision Date","Decision By","Reason","Action"].map((label) => <th key={label} className={cn("px-1.5 text-left", label === "Value (BDT)" && "text-right", label === "Action" && "text-center")}>{label}</th>)}</tr></thead><tbody className="divide-y divide-[#edf1f6]">{rejectedRows.map((row, index) => <tr key={row.id} className="h-[26px]"><td className="px-1.5">{index + 1}</td><td className="px-1.5 font-semibold">{row.quotationNo}</td><td className="truncate px-1.5">{row.customer}</td><td className="truncate px-1.5">{row.project}</td><td className="px-1.5">{row.quotationDateLabel}</td><td className="px-1.5 text-right">{formatMoney(row.value)}</td><td className="px-1.5">{row.decisionDateLabel}</td><td className="px-1.5">{row.decisionBy}</td><td className="truncate px-1.5">{row.reason}</td><td className="px-1.5"><span className="flex items-center justify-center gap-1.5"><TinyButton label="View" /><button type="button" disabled aria-label="Rejected document action" className="cursor-default text-[#e64a55] disabled:opacity-100"><Trash2 className="h-3 w-3" /></button></span></td></tr>)}{rejectedRows.length === 0 && <tr><td colSpan={10} className="h-[60px] text-center text-[8px] text-[#687893]">No rejected quotations match the filters.</td></tr>}</tbody></table></div>
            <div className="flex min-h-[35px] items-center justify-between gap-3 border-t border-[#edf1f6] px-3 text-[6.8px] text-[#52627d]"><span>Showing {rejectedRows.length > 0 ? 1 : 0} to {rejectedRows.length} of 23 entries</span><Pagination pages={[1,2,3,4]} /></div>
          </section>

          <section ref={pendingRef} className={cn("overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]", BORDER)}>
            <div className="flex h-[34px] items-center border-b border-[#f2dfd5] bg-[#fff8f5] px-3"><h2 className="text-[8.5px] font-bold text-[#10244c]">Pending Quotations (Follow-up Required)</h2></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[850px] table-fixed border-collapse text-[6.7px] text-[#173058]"><colgroup><col className="w-[28px]" /><col className="w-[95px]" /><col className="w-[120px]" /><col className="w-[135px]" /><col className="w-[86px]" /><col className="w-[92px]" /><col className="w-[90px]" /><col className="w-[92px]" /><col className="w-[82px]" /><col className="w-[80px]" /></colgroup><thead className="bg-[#fffaf7] text-[6.5px] font-semibold text-[#21385e]"><tr className="h-[25px] border-b border-[#f0e2d9]">{["SL","Quotation No","Customer","Project / Work Name","Quotation Date","Value (BDT)","Last Follow-up","Next Follow-up","Sales Person","Action"].map((label) => <th key={label} className={cn("px-1.5 text-left", label === "Value (BDT)" && "text-right", label === "Action" && "text-center")}>{label}</th>)}</tr></thead><tbody className="divide-y divide-[#f0ece8]">{pendingRows.map((row, index) => <tr key={row.id} className="h-[26px]"><td className="px-1.5">{index + 1}</td><td className="px-1.5 font-semibold">{row.quotationNo}</td><td className="truncate px-1.5">{row.customer}</td><td className="truncate px-1.5">{row.project}</td><td className="px-1.5">{row.quotationDateLabel}</td><td className="px-1.5 text-right">{formatMoney(row.value)}</td><td className="px-1.5">{row.lastFollowUp}</td><td className="px-1.5 font-semibold text-[#ed8c21]"><span className="inline-flex items-center gap-1"><Clock3 className="h-2.5 w-2.5" />{row.nextFollowUp}</span></td><td className="px-1.5">{row.salesPerson}</td><td className="px-1.5"><span className="flex items-center justify-center gap-2"><TinyButton label="View" /><button type="button" disabled aria-label="Schedule follow-up" className="cursor-default text-[#0867e8] disabled:opacity-100"><CalendarDays className="h-3 w-3" /></button><button type="button" disabled aria-label="More actions" className="cursor-default text-[#173058] disabled:opacity-100"><MoreVertical className="h-3 w-3" /></button></span></td></tr>)}{pendingRows.length === 0 && <tr><td colSpan={10} className="h-[60px] text-center text-[8px] text-[#687893]">No pending quotations match the filters.</td></tr>}</tbody></table></div>
            <div className="flex min-h-[35px] items-center justify-between gap-3 border-t border-[#edf1f6] px-3 text-[6.8px] text-[#52627d]"><span>Showing {pendingRows.length > 0 ? 1 : 0} to {pendingRows.length} of 77 entries</span><Pagination pages={[1,2,3,"ellipsis",26]} /></div>
          </section>
        </div>

        <aside className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
          <DecisionOverview />
          <section className={cn("overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)] xl:h-[126px]", BORDER)}><div className="flex h-[34px] items-center border-b border-[#edf1f6] px-3"><h2 className="text-[9px] font-bold text-[#10244c]">Conversion Summary</h2></div><div className="px-3">{[
            { label: "Total Accepted", value: "28", icon: CheckCircle2, tone: "bg-[#e8f2ff] text-[#3977c9]" },
            { label: "Converted to Project", value: "16", icon: FileCheck2, tone: "bg-[#e7f8ed] text-[#2aaa61]" },
            { label: "Conversion Rate", value: "57.14%", icon: ClipboardCheck, tone: "bg-[#eef1f7] text-[#5d6f8c]", green: true },
            { label: "Pending Conversion", value: "12", icon: Clock3, tone: "bg-[#fff1df] text-[#e99a24]" },
          ].map(({ label, value, icon: Icon, tone, green }) => <div key={label} className="flex h-[22px] items-center gap-2 border-b border-[#f0f3f7] text-[7px] last:border-0"><span className={cn("flex h-[14px] w-[14px] items-center justify-center rounded-full", tone)}><Icon className="h-2.5 w-2.5" /></span><span className="text-[#31496f]">{label}</span><strong className={cn("ml-auto", green ? "text-[#27aa60]" : "text-[#10244c]")}>{value}</strong></div>)}</div></section>
          <RecentDecisions />
          <QuickActions />
        </aside>
      </div>

      <div className="mt-2.5 flex min-h-[44px] items-center gap-3 rounded-[5px] border border-[#dce8f8] bg-[#eef5ff] px-4 py-2 text-[8px] text-[#29456e]"><Info className="h-4 w-4 shrink-0 text-[#0867e8]" /><span>Update quotation result from the quotation detail page under Result tab.</span><button type="button" disabled className="ml-auto inline-flex h-[27px] cursor-default items-center gap-1.5 rounded-[4px] border border-[#d4e2f5] bg-white px-3 text-[7.5px] font-semibold text-[#173058] disabled:opacity-100"><PlayCircle className="h-3.5 w-3.5 text-[#0867e8]" /> How It Works</button></div>
    </div>
  );
}
