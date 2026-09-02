"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardList,
  Download,
  FileBarChart,
  FileCheck2,
  FileEdit,
  Flag,
  Package,
  PackageSearch,
  PlayCircle,
  Plus,
  Settings2,
  Search,
  ShieldAlert,
  ShipWheel,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { AppDateInput } from "@/components/shared/app-date-input";
import { LcEmptyState } from "@/components/shared/lc-empty-state";
import { EditCostEntryDialog } from "@/features/screens/lc-detail-dialog";
import {
  useDeleteLcMutation,
  useDeleteLcCostEntryMutation,
  useLcCategoryReportQuery,
  useLcDashboardQuery,
  useLcListQuery,
  useLcRegisterReportQuery,
  useSetLcStatusMutation,
} from "@/hooks/use-lc-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { downloadCsv } from "@/lib/download";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LcStatus } from "@/types/lc";
import type { LcCostPostingReportRow } from "@/services/lc.service";

type Section = "dashboard" | "all-lc" | "cost-posting" | "reports" | "configuration";

const RECENT_PAGE_SIZE = 5;
const ALL_LC_PAGE_SIZE = 10;

const sections: Array<{ id: Section; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", icon: ClipboardList },
  { id: "all-lc", label: "All LC", icon: Package },
  { id: "cost-posting", label: "Cost Posting", icon: Wallet },
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "configuration", label: "Configuration", icon: Settings2 },
];

function getSection(value: string | null): Section {
  return sections.some((entry) => entry.id === value) ? (value as Section) : "dashboard";
}

const STATUS_TONE: Record<LcStatus, { label: string; tone: "green" | "blue" | "amber" | "slate" | "red"; icon: LucideIcon; hint: string }> = {
  DRAFT: { label: "Draft", tone: "slate", icon: FileEdit, hint: "Being prepared — not active yet" },
  ACTIVE: { label: "Active", tone: "green", icon: PlayCircle, hint: "LC is open and in progress" },
  COSTING_PENDING: { label: "Costing Pending", tone: "amber", icon: Clock3, hint: "Waiting for import costs to be posted" },
  ALLOCATION_PENDING: { label: "Allocation Pending", tone: "amber", icon: Clock3, hint: "Costs posted — item-wise allocation needed" },
  READY_TO_FINALIZE: { label: "Ready to Finalize", tone: "blue", icon: Flag, hint: "All checks passed — ready to lock in" },
  FINALIZED: { label: "Finalized", tone: "green", icon: CheckCircle2, hint: "Landed cost locked and posted" },
  CLOSED: { label: "Closed", tone: "slate", icon: Archive, hint: "Fully wrapped up" },
  CANCELLED: { label: "Cancelled", tone: "red", icon: XCircle, hint: "This LC was cancelled" },
};

function LcStatusBadge({ status }: { status: LcStatus }) {
  const meta = STATUS_TONE[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} title={meta.hint} className="inline-flex items-center gap-1">
      <Icon className="h-3.5 w-3.5" /> {meta.label}
    </Badge>
  );
}

const REPORTS: Array<{ id: string; label: string }> = [
  { id: "register", label: "LC Register" },
  { id: "ALL", label: "All Cost Postings" },
  { id: "LC_BANKING", label: "LC Cost Report" },
  { id: "ORIGIN", label: "Origin Cost Report" },
  { id: "CUSTOMS", label: "Customs Report" },
  { id: "TAX", label: "Tax Report" },
  { id: "CNF", label: "CNF Report" },
  { id: "DESTINATION_TRANSPORT", label: "Transportation Report" },
  { id: "LOCAL", label: "Local Cost Report" },
];

function DashboardValueCard({ label, value, caption, icon: Icon, tone }: { label: string; value: string; caption: string; icon: LucideIcon; tone: "blue" | "green" | "amber" }) {
  const toneClasses = {
    blue: "from-[#f3f7ff] to-white text-[#2563eb] ring-[#d8e5ff]",
    green: "from-[#f1fbf6] to-white text-[#15925f] ring-[#d1eadc]",
    amber: "from-[#fff8ed] to-white text-[#d6800d] ring-[#f2dfbd]",
  } as const;
  return (
    <div data-lc-dashboard-value-card className={cn("relative overflow-hidden rounded-[16px] bg-gradient-to-br p-5 shadow-[0_8px_24px_rgba(15,35,65,0.05)] ring-1", toneClasses[tone])}>
      <div className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-current opacity-[0.05]" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] opacity-80">{label}</div>
          <div className="mt-3 text-[1.45rem] font-semibold tracking-[-0.02em] text-[#14233b]">{value}</div>
          <div className="mt-1 text-xs text-[#7b889b]">{caption}</div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-current/10"><Icon className="h-5 w-5" /></div>
      </div>
    </div>
  );
}

function WorkflowMetric({ label, value, icon: Icon, tone = "amber" }: { label: string; value: number; icon: LucideIcon; tone?: "amber" | "blue" }) {
  const colors = { amber: "bg-[#fff6e8] text-[#d6800d]", blue: "bg-[#eef5ff] text-[#2563eb]" } as const;
  return (
    <div data-lc-workflow-metric className="flex items-center gap-3 rounded-xl border border-[#e8edf4] bg-white px-3.5 py-3 transition-colors hover:border-[#cfdaea] hover:bg-[#fbfdff]">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", colors[tone])}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1 text-sm font-medium text-[#526178]">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-[#14233b]">{value}</div>
    </div>
  );
}

function PaginationFooter({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#e7edf5] bg-[#fbfcfe] px-4 py-3">
      <div className="text-xs text-[#6f7d91]">Showing <span className="font-semibold text-[#334155]">{firstItem}–{lastItem}</span> of <span className="font-semibold text-[#334155]">{total}</span></div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="flex h-8 items-center gap-1 rounded-lg border border-[#d8e2ef] bg-white px-2.5 text-xs font-medium text-[#334155] transition-colors hover:bg-[#f2f7ff] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
        <span className="min-w-[74px] text-center text-xs font-medium text-[#526178]">Page {page} of {totalPages}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="flex h-8 items-center gap-1 rounded-lg border border-[#d8e2ef] bg-white px-2.5 text-xs font-medium text-[#334155] transition-colors hover:bg-[#f2f7ff] disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

export function LcManagementScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const lcRootPath = "/app/lc-management";
  const searchParams = useSearchParams();
  const { session } = useSessionContext();
  const workspaceId = session?.workspaceId;

  const [section, setSection] = useState<Section>(() => getSection(searchParams.get("section")));
  useEffect(() => {
    setSection((current) => {
      const next = getSection(searchParams.get("section"));
      return current === next ? current : next;
    });
  }, [searchParams]);

  function selectSection(next: Section) {
    setSection(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "dashboard") params.delete("section");
    else params.set("section", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const dashboardQuery = useLcDashboardQuery(workspaceId, section === "dashboard");
  const listQuery = useLcListQuery(workspaceId, section === "all-lc" || section === "dashboard" || section === "cost-posting");
  const registerReportQuery = useLcRegisterReportQuery(workspaceId, section === "reports");

  const [selectedCostLcId, setSelectedCostLcId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reportKey, setReportKey] = useState("register");
  const [reportSearch, setReportSearch] = useState("");
  const [reportStatusFilter, setReportStatusFilter] = useState<string>("all");
  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [recentPage, setRecentPage] = useState(1);
  const [allLcPage, setAllLcPage] = useState(1);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const [editCostPosting, setEditCostPosting] = useState<LcCostPostingReportRow | null>(null);
  const [deleteCostPosting, setDeleteCostPosting] = useState<LcCostPostingReportRow | null>(null);
  const deleteMutation = useDeleteLcMutation();
  const setStatusMutation = useSetLcStatusMutation();
  const deleteCostPostingMutation = useDeleteLcCostEntryMutation();

  const categoryReportQuery = useLcCategoryReportQuery(workspaceId, reportKey !== "register" ? reportKey : null, section === "reports" && reportKey !== "register");

  const lcs = listQuery.data ?? [];
  const runningLcs = useMemo(
    () => lcs.filter((lc) => lc.status !== "CLOSED" && lc.status !== "CANCELLED"),
    [lcs],
  );
  const dashboard = dashboardQuery.data;
  const costPostingLcs = lcs.filter((lc) => lc.status !== "FINALIZED" && lc.status !== "CLOSED" && lc.status !== "CANCELLED");
  const selectedCostLc = costPostingLcs.find((lc) => lc.id === selectedCostLcId);
  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(Object.keys(STATUS_TONE).map((status) => [status, 0])) as Record<string, number>;
    for (const lc of lcs) counts[lc.status] = (counts[lc.status] ?? 0) + 1;
    return counts;
  }, [lcs]);

  useEffect(() => {
    if (statusFilter !== "all" && listQuery.isSuccess && (statusCounts[statusFilter] ?? 0) === 0) {
      setStatusFilter("all");
    }
  }, [listQuery.isSuccess, statusCounts, statusFilter]);

  const filteredLcs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return lcs
      .filter((lc) => {
        if (statusFilter !== "all" && lc.status !== statusFilter) return false;
        if (!term) return true;
        return lc.lcNumber.toLowerCase().includes(term) || lc.supplierName.toLowerCase().includes(term);
      })
      .sort((left, right) => new Date(right.lcDate).getTime() - new Date(left.lcDate).getTime());
  }, [lcs, searchTerm, statusFilter]);
  const recentTotalPages = Math.max(1, Math.ceil(runningLcs.length / RECENT_PAGE_SIZE));
  const allLcTotalPages = Math.max(1, Math.ceil(filteredLcs.length / ALL_LC_PAGE_SIZE));
  const paginatedRecentLcs = runningLcs.slice((recentPage - 1) * RECENT_PAGE_SIZE, recentPage * RECENT_PAGE_SIZE);
  const paginatedLcs = filteredLcs.slice((allLcPage - 1) * ALL_LC_PAGE_SIZE, allLcPage * ALL_LC_PAGE_SIZE);

  useEffect(() => {
    setRecentPage((current) => Math.min(current, recentTotalPages));
  }, [recentTotalPages]);

  useEffect(() => {
    setAllLcPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    setAllLcPage((current) => Math.min(current, allLcTotalPages));
  }, [allLcTotalPages]);

  const filteredRegisterReport = useMemo(() => {
    const term = reportSearch.trim().toLowerCase();
    return (registerReportQuery.data ?? []).filter((lc) => {
      if (reportStatusFilter !== "all" && lc.status !== reportStatusFilter) return false;
      const lcDay = lc.lcDate.slice(0, 10);
      if (reportFromDate && lcDay < reportFromDate) return false;
      if (reportToDate && lcDay > reportToDate) return false;
      if (!term) return true;
      return [lc.lcNumber, lc.supplierName, lc.supplierCountry, lc.status, lc.currency, lc.purchaseCost, lc.importCost, lc.landedCost].some((value) => String(value ?? "").toLowerCase().includes(term));
    });
  }, [registerReportQuery.data, reportSearch, reportStatusFilter, reportFromDate, reportToDate]);

  const filteredCategoryReport = useMemo(() => {
    const term = reportSearch.trim().toLowerCase();
    const rows = categoryReportQuery.data ?? [];
    if (!term) return rows;
    return rows.filter((entry) => [entry.lcNumber, entry.supplierName, entry.costHeadName, entry.vendorName, entry.invoiceNumber, entry.currency, entry.bdtAmount, entry.isFullyAllocated ? "fully allocated" : "pending"].some((value) => String(value ?? "").toLowerCase().includes(term)));
  }, [categoryReportQuery.data, reportSearch]);

  function lcDetailHref(lcId: string, detailParams?: Record<string, string>) {
    const params = new URLSearchParams(detailParams);
    const currentQuery = searchParams.toString();
    params.set("returnTo", currentQuery ? `${pathname}?${currentQuery}` : pathname);
    return `${lcRootPath}/${lcId}?${params.toString()}`;
  }

  function openLc(lcId: string) {
    router.push(lcDetailHref(lcId));
  }

  function editLc(lcId: string) {
    router.push(`${lcRootPath}/${lcId}/edit`);
  }

  const deleteTarget = lcs.find((lc) => lc.id === deleteTargetId) ?? (registerReportQuery.data ?? []).find((lc) => lc.id === deleteTargetId);
  const closeTarget = lcs.find((lc) => lc.id === closeTargetId) ?? null;

  async function handleCloseLc() {
    if (!closeTargetId) return;
    try {
      await setStatusMutation.mutateAsync({ id: closeTargetId, status: "CLOSED", reason: "LC closed from dashboard" });
      toast.success(`LC "${closeTarget?.lcNumber ?? ""}" closed`);
      setCloseTargetId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "LC could not be closed");
    }
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    try {
      await deleteMutation.mutateAsync(deleteTargetId);
      toast.success(`LC "${deleteTarget?.lcNumber ?? ""}" deleted`);
      setDeleteTargetId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "LC could not be deleted");
    }
  }

  async function handleDeleteCostPosting() {
    if (!deleteCostPosting) return;
    try {
      await deleteCostPostingMutation.mutateAsync({ id: deleteCostPosting.lcId, costEntryId: deleteCostPosting.id });
      toast.success("Cost posting deleted");
      setDeleteCostPosting(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cost posting could not be deleted");
    }
  }

  function exportRegister() {
    const rows = filteredRegisterReport.map((lc) => ({
      "LC No": lc.lcNumber,
      Supplier: lc.supplierName,
      Status: lc.status,
      "Purchase Cost": lc.purchaseCost,
      "Import Cost": lc.importCost,
      "Landed Cost": lc.landedCost,
    }));
    downloadCsv("lc-register.csv", rows);
  }

  function exportCategoryReport() {
    const rows = filteredCategoryReport.map((entry) => ({
      "LC No": entry.lcNumber,
      Supplier: entry.supplierName,
      "Cost Head": entry.costHeadName,
      Vendor: entry.vendorName ?? "",
      Invoice: entry.invoiceNumber ?? "",
      Currency: entry.currency,
      "BDT Amount": entry.bdtAmount,
      "Allocation Status": entry.isFullyAllocated ? "Fully Allocated" : "Pending",
      "Posting Date": entry.createdAt,
    }));
    downloadCsv(`lc-${reportKey.toLowerCase()}-report.csv`, rows);
  }

  return (
    <div data-lc-management className="relative z-20 -m-3 flex h-[calc(100%+1.5rem)] min-h-[720px] flex-col gap-4 bg-[#f8fafc] p-3">
      <div data-lc-page-header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#2f67e8_0%,#0ea5e9_100%)] shadow-[0_10px_20px_rgba(15,108,246,0.28)]">
            <FileCheck2 className="h-6 w-6 text-white" strokeWidth={1.9} />
          </div>
          <div>
            <div className="text-[1.6rem] font-semibold text-[#14233b]">Import & LC Management</div>
          </div>
        </div>
        <Button type="button" onClick={() => router.push("/app/lc-management/create")}>
          <Plus className="mr-1.5 h-4 w-4" /> Create LC
        </Button>
      </div>

      <nav data-lc-section-nav className="flex gap-1 overflow-x-auto border-b border-[#e2e8f1]" aria-label="Import & LC sections">
        {sections.map((entry) => {
          const Icon = entry.icon;
          const active = entry.id === section;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => selectSection(entry.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-[#0f6cf6] bg-[#eef5ff] text-[#0f6cf6]"
                  : "border-transparent text-[#6f7d91] hover:border-[#d7e1ee] hover:bg-[#f7faff] hover:text-[#334155]",
              )}
            >
              <Icon className="h-4 w-4" /> {entry.label}
            </button>
          );
        })}
      </nav>

      {section === "dashboard" ? (
        <div data-lc-dashboard className="flex min-h-0 flex-1 flex-col gap-4">
          <div data-lc-dashboard-values className="grid gap-3 md:grid-cols-3">
            <DashboardValueCard label="Total LC Cost" value={formatCurrency(dashboard?.totalLcValue ?? 0)} caption="Purchase and import costs across running LCs" icon={BriefcaseBusiness} tone="blue" />
            <DashboardValueCard label="Total Import Cost" value={formatCurrency(dashboard?.totalImportCost ?? 0)} caption="Freight, duty and additional costs" icon={ShipWheel} tone="green" />
            <DashboardValueCard label="Outstanding Payment" value={formatCurrency(dashboard?.totalPaymentDue ?? 0)} caption={`${dashboard?.paymentDueLc ?? 0} LC${(dashboard?.paymentDueLc ?? 0) === 1 ? "" : "s"} with payment due`} icon={Wallet} tone="amber" />
          </div>

          <div data-lc-dashboard-overview className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]">
            <section data-lc-workflow className="rounded-[16px] border border-[#e3eaf3] bg-[#f8fafc] p-4 shadow-[0_8px_24px_rgba(15,35,65,0.035)]">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-[#14233b]">Operational workflow</h2>
                <Clock3 className="h-5 w-5 text-[#9aa7b8]" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <WorkflowMetric label="Goods in transit" value={dashboard?.goodsInTransit ?? 0} icon={ShipWheel} />
                <WorkflowMetric label="Pending customs" value={dashboard?.pendingCustoms ?? 0} icon={ShieldAlert} />
                <WorkflowMetric label="Pending GRN" value={dashboard?.pendingGrn ?? 0} icon={PackageSearch} />
                <WorkflowMetric label="Pending costing" value={dashboard?.pendingCosting ?? 0} icon={ClipboardList} />
                <WorkflowMetric label="Pending allocation" value={dashboard?.pendingAllocation ?? 0} icon={FileBarChart} />
                <WorkflowMetric label="Ready to finalize" value={dashboard?.readyToFinalize ?? 0} icon={BadgeCheck} tone="blue" />
              </div>
            </section>

            <section data-lc-lifecycle className="rounded-[16px] border border-[#dce6f2] bg-white p-4 shadow-[0_8px_24px_rgba(15,35,65,0.045)]">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-[#14233b]">LC lifecycle</h2>
                <Package className="h-5 w-5 text-[#6f8fbd]" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[#f2f6ff] p-3"><div className="text-2xl font-semibold text-[#2563eb]">{dashboard?.activeLc ?? 0}</div><div className="mt-1 text-xs font-medium text-[#64748b]">Active LC</div></div>
                <div className="rounded-xl bg-[#eff9f4] p-3"><div className="text-2xl font-semibold text-[#15925f]">{dashboard?.finalizedLc ?? 0}</div><div className="mt-1 text-xs font-medium text-[#64748b]">Finalized</div></div>
              </div>
              <button type="button" onClick={() => selectSection("all-lc")} className="mt-3 flex w-full items-center justify-center rounded-lg border border-[#d9e3ef] px-3 py-2 text-sm font-medium text-[#315b91] transition-colors hover:bg-[#f5f8fc]">View all LCs</button>
            </section>
          </div>

          <div data-lc-recent className="flex min-h-[260px] flex-1 flex-col overflow-hidden rounded-[16px] border border-[#e3eaf3] bg-white shadow-[0_8px_24px_rgba(15,35,65,0.035)]">
            <div className="flex items-center justify-between border-b border-[#e7edf5] px-4 py-3">
              <div className="text-sm font-semibold text-[#14233b]">Recent LCs</div>
              <button type="button" onClick={() => selectSection("all-lc")} className="text-xs font-semibold text-[#2563eb] hover:text-[#174bad]">View all</button>
            </div>
            {runningLcs.length === 0 ? (
              <div data-lc-recent-empty className="flex min-h-0 flex-1 p-4"><LcEmptyState icon={ShipWheel} title="No running LCs" description="New and active LCs will appear here. Closed LCs remain available under All LC." actionLabel="Create LC" onAction={() => router.push("/app/lc-management/create")} compact className="h-full w-full" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                  <thead className="bg-[#f8fafc] text-xs font-semibold uppercase tracking-wide text-[#6f7d91]">
                    <tr>
                      <th className="px-4 py-3">LC No.</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">LC Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Landed Cost</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f7]">
                    {paginatedRecentLcs.map((lc) => (
                      <tr
                        key={lc.id}
                        role="link"
                        tabIndex={0}
                        aria-label={`View ${lc.lcNumber}`}
                        onClick={() => openLc(lc.id)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openLc(lc.id); } }}
                        className="cursor-pointer transition-colors hover:bg-[#f7faff] focus-visible:bg-[#f2f7ff] focus-visible:outline-none"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-[#14233b]">{lc.lcNumber}</td>
                        <td className="max-w-[360px] px-4 py-3 text-[#334155]">
                          <div className="truncate" title={lc.supplierName}>{lc.supplierName}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[#6f7d91]">{formatDate(lc.lcDate)}</td>
                        <td className="whitespace-nowrap px-4 py-3"><LcStatusBadge status={lc.status} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[#14233b]">{formatCurrency(lc.landedCost)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); openLc(lc.id); }}>View</Button>
                            {lc.status === "FINALIZED" ? (
                              <Button type="button" size="sm" onClick={(event) => { event.stopPropagation(); setCloseTargetId(lc.id); }}>Close LC</Button>
                            ) : null}
                            {lc.status !== "FINALIZED" && lc.status !== "CLOSED" && lc.status !== "CANCELLED" ? (
                              <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); editLc(lc.id); }}>Edit</Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(event) => { event.stopPropagation(); setDeleteTargetId(lc.id); }}
                              className="text-[#dc2626] hover:border-[#fecaca] hover:bg-[#fef2f2] hover:text-[#b91c1c]"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {runningLcs.length > 0 ? <PaginationFooter page={recentPage} pageSize={RECENT_PAGE_SIZE} total={runningLcs.length} onPageChange={setRecentPage} /> : null}
          </div>
        </div>
      ) : null}

      {section === "all-lc" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search LC number or supplier..."
              className="h-10 min-w-[240px] flex-1 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter LCs by workflow status"
              className={cn(
                "h-10 min-w-[190px] rounded-[6px] border bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[#bfd5fa]",
                statusFilter === "all" ? "border-[#d7e1ee] text-[#334155]" :
                STATUS_TONE[statusFilter as LcStatus]?.tone === "green" ? "border-[#86d5aa] bg-[#f0fbf5] text-[#08783d]" :
                STATUS_TONE[statusFilter as LcStatus]?.tone === "blue" ? "border-[#9fc1f7] bg-[#f2f7ff] text-[#1559b7]" :
                STATUS_TONE[statusFilter as LcStatus]?.tone === "amber" ? "border-[#f2c987] bg-[#fff9ed] text-[#a85b00]" :
                STATUS_TONE[statusFilter as LcStatus]?.tone === "red" ? "border-[#f3aaaa] bg-[#fff4f4] text-[#b42323]" :
                "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
              )}
            >
              <option value="all">All statuses ({lcs.length})</option>
              {Object.entries(STATUS_TONE).map(([value, meta]) => {
                const count = statusCounts[value] ?? 0;
                return <option key={value} value={value} disabled={count === 0}>{meta.label} ({count})</option>;
              })}
            </select>
          </div>
          <div className="overflow-hidden rounded-[12px] border border-[#e7edf5] bg-white">
            <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full text-sm">
              <thead className="bg-[#f7faff] text-xs uppercase text-[#8994a6]">
                <tr>
                  <th className="px-3 py-2.5 text-left">LC No</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-left">LC Date</th>
                  <th className="px-3 py-2.5 text-left">Supplier</th>
                  <th className="px-3 py-2.5 text-left">Country</th>
                  <th className="px-3 py-2.5 text-right">LC Value</th>
                  <th className="px-3 py-2.5 text-right">Purchase Cost</th>
                  <th className="px-3 py-2.5 text-right">Import Cost</th>
                  <th className="px-3 py-2.5 text-right">Landed Cost</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {paginatedLcs.map((lc) => (
                  <tr
                    key={lc.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`View ${lc.lcNumber}`}
                    onClick={() => openLc(lc.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openLc(lc.id); } }}
                    className="cursor-pointer border-t border-[#eef2f7] transition-colors hover:bg-[#f2f7ff] focus-visible:bg-[#f2f7ff] focus-visible:outline-none"
                  >
                    <td className="px-3 py-2.5 font-medium text-[#14233b]">{lc.lcNumber}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#52647d]">{formatDate(lc.lcDate)}</td>
                    <td className="px-3 py-2.5">{lc.supplierName}</td>
                    <td className="px-3 py-2.5 text-[#6f7d91]">{lc.supplierCountry ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right">{lc.currency} {lc.exchangeRate}</td>
                    <td className="px-3 py-2.5 text-right">{formatCurrency(lc.purchaseCost)}</td>
                    <td className="px-3 py-2.5 text-right">{formatCurrency(lc.importCost)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[#14233b]">{formatCurrency(lc.landedCost)}</td>
                    <td className="px-3 py-2.5"><LcStatusBadge status={lc.status} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); openLc(lc.id); }}>View</Button>
                        {lc.status !== "FINALIZED" && lc.status !== "CLOSED" && lc.status !== "CANCELLED" ? (
                          <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); editLc(lc.id); }}>Edit</Button>
                        ) : null}
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); setDeleteTargetId(lc.id); }}
                          disabled={lc.costPostingCount > 0}
                          title={lc.costPostingCount > 0 ? `Delete ${lc.costPostingCount} cost posting${lc.costPostingCount === 1 ? "" : "s"} first` : "Delete LC"}
                          aria-label={`Delete ${lc.lcNumber}`}
                          className="rounded-md p-2 text-[#8994a6] hover:bg-[#fee2e2] hover:text-[#dc2626] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredLcs.length === 0 ? (
                  <tr><td colSpan={10} className="p-4"><LcEmptyState icon={PackageSearch} title={searchTerm || statusFilter !== "all" ? "No matching LCs" : "No LCs yet"} description={searchTerm || statusFilter !== "all" ? "Try changing the search text or status filter." : "Create your first LC to begin the import workflow."} actionLabel={!searchTerm && statusFilter === "all" ? "Create LC" : undefined} onAction={!searchTerm && statusFilter === "all" ? () => router.push("/app/lc-management/create") : undefined} compact /></td></tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
          {filteredLcs.length > 0 ? <PaginationFooter page={allLcPage} pageSize={ALL_LC_PAGE_SIZE} total={filteredLcs.length} onPageChange={setAllLcPage} /> : null}
        </div>
      ) : null}

      {section === "cost-posting" ? (
        <div className="w-full rounded-[14px] border border-[#dfe7f2] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#fff3e4] text-[#d97706]"><Wallet className="h-5 w-5" /></div>
            <div><h2 className="text-lg font-semibold text-[#14233b]">Post Import Cost</h2><p className="mt-0.5 text-sm text-[#6f7d91]">Select an LC, then enter and allocate its banking, origin, customs, CNF, transport, local, or other costs.</p></div>
          </div>

          <div className="mt-5 grid gap-2">
            <label htmlFor="cost-posting-lc" className="text-sm font-medium text-[#334155]">Select LC *</label>
            <select id="cost-posting-lc" value={selectedCostLcId} onChange={(event) => setSelectedCostLcId(event.target.value)} className="h-11 w-full rounded-[7px] border border-[#d7e1ee] bg-white px-3 text-sm text-[#22324a] outline-none focus:border-[#8fb3ed]">
              <option value="">Choose an LC for cost posting</option>
              {costPostingLcs.map((lc) => <option key={lc.id} value={lc.id}>{lc.lcNumber} — {lc.supplierName} — {STATUS_TONE[lc.status].label}</option>)}
            </select>
          </div>

          {selectedCostLc ? (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-[10px] border border-[#e7edf5] bg-[#f8fbff] p-4 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-[#8994a6]">Supplier</div><div className="mt-1 truncate font-medium text-[#14233b]">{selectedCostLc.supplierName}</div></div>
              <div><div className="text-xs text-[#8994a6]">Purchase Cost</div><div className="mt-1 font-medium text-[#14233b]">{formatCurrency(selectedCostLc.purchaseCost)}</div></div>
              <div><div className="text-xs text-[#8994a6]">Posted Import Cost</div><div className="mt-1 font-medium text-[#14233b]">{formatCurrency(selectedCostLc.importCost)}</div></div>
              <div><div className="text-xs text-[#8994a6]">Status</div><div className="mt-1"><LcStatusBadge status={selectedCostLc.status} /></div></div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setReportKey("ALL"); selectSection("reports"); }}><FileBarChart className="mr-1.5 h-4 w-4" /> View All Cost Postings</Button>
            <Button type="button" disabled={!selectedCostLcId} onClick={() => selectedCostLcId && router.push(`${lcRootPath}/cost-posting/${selectedCostLcId}`)}>Continue to Cost Posting <ChevronRight className="ml-1.5 h-4 w-4" /></Button>
          </div>
          {costPostingLcs.length === 0 ? <p className="mt-4 text-sm text-[#8994a6]">No editable LC is available for cost posting.</p> : null}
        </div>
      ) : null}

      {section === "reports" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={reportKey} onChange={(event) => setReportKey(event.target.value)} className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm">
              {REPORTS.map((report) => <option key={report.id} value={report.id}>{report.label}</option>)}
            </select>
            <label className="relative min-w-[260px] flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8994a6]" />
              <input value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="Search LC, supplier, cost head, vendor, invoice..." className="h-10 w-full rounded-[6px] border border-[#d7e1ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#8fb3ed]" />
            </label>
            {reportKey === "register" ? (
              <>
                <select value={reportStatusFilter} onChange={(event) => setReportStatusFilter(event.target.value)} className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm">
                  <option value="all">All statuses</option>
                  {Object.entries(STATUS_TONE).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-[#6f7d91]">
                  From
                  <AppDateInput value={reportFromDate} onChange={setReportFromDate} className="w-[148px]" inputClassName="h-10 rounded-[6px] border-[#d7e1ee] bg-white px-2 pr-9 text-sm" aria-label="LC report from date" />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[#6f7d91]">
                  To
                  <AppDateInput value={reportToDate} onChange={setReportToDate} className="w-[148px]" inputClassName="h-10 rounded-[6px] border-[#d7e1ee] bg-white px-2 pr-9 text-sm" aria-label="LC report to date" />
                </label>
                {reportStatusFilter !== "all" || reportFromDate || reportToDate ? (
                  <button type="button" onClick={() => { setReportStatusFilter("all"); setReportFromDate(""); setReportToDate(""); }} className="text-xs font-medium text-[#0f6cf6] hover:underline">
                    Clear filters
                  </button>
                ) : null}
              </>
            ) : null}
            <Button type="button" variant="outline" onClick={reportKey === "register" ? exportRegister : exportCategoryReport}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
          </div>

          {reportKey === "register" ? (
            <div className="overflow-x-auto rounded-[12px] border border-[#e7edf5]">
              <table className="min-w-[1050px] w-full text-sm">
                <thead className="bg-[#f7faff] text-xs uppercase text-[#8994a6]">
                  <tr><th className="px-3 py-2.5 text-left">LC No</th><th className="px-3 py-2.5 text-left">Supplier</th><th className="px-3 py-2.5 text-right">Purchase Cost</th><th className="px-3 py-2.5 text-right">Import Cost</th><th className="px-3 py-2.5 text-right">Landed Cost</th><th className="px-3 py-2.5 text-left">Status</th><th className="px-3 py-2.5 text-right">Action</th></tr>
                </thead>
                <tbody>
                  {filteredRegisterReport.map((lc) => (
                    <tr key={lc.id} role="link" tabIndex={0} aria-label={`View ${lc.lcNumber}`} onClick={() => openLc(lc.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openLc(lc.id); } }} className="cursor-pointer border-t border-[#eef2f7] transition-colors hover:bg-[#f2f7ff] focus-visible:bg-[#f2f7ff] focus-visible:outline-none">
                      <td className="px-3 py-2.5 font-medium">{lc.lcNumber}</td>
                      <td className="px-3 py-2.5">{lc.supplierName}</td>
                      <td className="px-3 py-2.5 text-right">{formatCurrency(lc.purchaseCost)}</td>
                      <td className="px-3 py-2.5 text-right">{formatCurrency(lc.importCost)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{formatCurrency(lc.landedCost)}</td>
                      <td className="px-3 py-2.5"><LcStatusBadge status={lc.status} /></td>
                      <td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-1.5"><Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); openLc(lc.id); }}>View</Button><Button type="button" variant="outline" size="sm" disabled={lc.status === "FINALIZED" || lc.status === "CLOSED" || lc.status === "CANCELLED"} onClick={(event) => { event.stopPropagation(); editLc(lc.id); }}>Edit</Button><Button type="button" variant="outline" size="sm" className="text-[#c63c3c]" disabled={lc.costPostingCount > 0} title={lc.costPostingCount > 0 ? `Delete ${lc.costPostingCount} cost posting${lc.costPostingCount === 1 ? "" : "s"} first` : "Delete LC"} onClick={(event) => { event.stopPropagation(); setDeleteTargetId(lc.id); }}>Delete</Button></div></td>
                    </tr>
                  ))}
                  {filteredRegisterReport.length === 0 ? <tr><td colSpan={7} className="p-4"><LcEmptyState icon={FileBarChart} title="No LC report data" description="No LC records match the active report filters." compact /></td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[12px] border border-[#e7edf5]">
              <table className="min-w-[1200px] w-full text-sm">
                <thead className="bg-[#f7faff] text-xs uppercase text-[#8994a6]">
                  <tr><th className="px-3 py-2.5 text-left">Date</th><th className="px-3 py-2.5 text-left">LC No</th><th className="px-3 py-2.5 text-left">Supplier</th><th className="px-3 py-2.5 text-left">Cost Head</th><th className="px-3 py-2.5 text-left">Vendor</th><th className="px-3 py-2.5 text-left">Invoice</th><th className="px-3 py-2.5 text-right">BDT Amount</th><th className="px-3 py-2.5 text-left">Allocation</th><th className="px-3 py-2.5 text-right">Action</th></tr>
                </thead>
                <tbody>
                  {filteredCategoryReport.map((entry, index) => (
                    <tr key={index} role="link" tabIndex={0} aria-label={`View ${entry.lcNumber} cost posting`} onClick={() => router.push(lcDetailHref(entry.lcId, { tab: "costs", costEntryId: entry.id }))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(lcDetailHref(entry.lcId, { tab: "costs", costEntryId: entry.id })); } }} className="cursor-pointer border-t border-[#eef2f7] transition-colors hover:bg-[#f2f7ff] focus-visible:bg-[#f2f7ff] focus-visible:outline-none">
                      <td className="whitespace-nowrap px-3 py-2.5">{formatDate(entry.createdAt)}</td>
                      <td className="px-3 py-2.5 font-medium">{entry.lcNumber}</td>
                      <td className="px-3 py-2.5">{entry.supplierName}</td>
                      <td className="px-3 py-2.5">{entry.costHeadName}</td>
                      <td className="px-3 py-2.5">{entry.vendorName ?? "—"}</td>
                      <td className="px-3 py-2.5">{entry.invoiceNumber ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{formatCurrency(entry.bdtAmount)}</td>
                      <td className="px-3 py-2.5"><Badge tone={entry.isFullyAllocated ? "green" : "amber"}>{entry.isFullyAllocated ? "Fully Allocated" : `Pending ${formatCurrency(entry.remainingAmount)}`}</Badge></td>
                      <td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-1.5"><Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); router.push(lcDetailHref(entry.lcId, { tab: "costs", costEntryId: entry.id })); }}>View</Button><Button type="button" variant="outline" size="sm" disabled={entry.isLocked} onClick={(event) => { event.stopPropagation(); setEditCostPosting(entry); }}>Edit</Button><Button type="button" variant="outline" size="sm" disabled={entry.isLocked} className="text-[#c63c3c]" onClick={(event) => { event.stopPropagation(); setDeleteCostPosting(entry); }}>Delete</Button></div></td>
                    </tr>
                  ))}
                  {filteredCategoryReport.length === 0 ? (
                    <tr><td colSpan={9} className="p-4"><LcEmptyState icon={FileBarChart} title={reportSearch.trim() ? "No matching cost postings" : "No report entries yet"} description={reportSearch.trim() ? "Try a different LC, supplier, vendor or invoice search." : "Cost postings will appear here once import expenses are recorded."} compact /></td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {section === "configuration" ? (
        <div className="w-full overflow-hidden rounded-[16px] border border-[#dfe7f1] bg-white shadow-[0_10px_30px_rgba(15,35,65,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e7edf5] bg-white px-5 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#2563eb] text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)]"><Settings2 className="h-5 w-5" /></div>
              <div><h2 className="text-lg font-semibold text-[#14233b]">LC Configuration</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[#6f7d91]">Manage the rules and master settings used when import costs are posted and allocated to products.</p></div>
            </div>
            <Badge tone="blue" className="mt-1">Workspace settings</Badge>
          </div>

          <div className="p-5">
            <button type="button" onClick={() => router.push("/app/lc-management/cost-heads")} className="group flex w-full items-center gap-4 rounded-[14px] border border-[#dfe7f1] bg-white p-4 text-left transition-all hover:border-[#9fbee9] hover:bg-[#f8fbff] hover:shadow-[0_8px_22px_rgba(37,99,235,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a8c7f5]">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[#eef5ff] text-[#2563eb] transition-colors group-hover:bg-[#2563eb] group-hover:text-white"><BriefcaseBusiness className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[#14233b]">Cost Heads</h3><span className="rounded-full bg-[#eef5ff] px-2 py-0.5 text-[11px] font-semibold text-[#2563eb]">Configurable</span></div>
                <p className="mt-1 text-sm text-[#6f7d91]">Add, edit or deactivate import cost heads and define their default allocation basis.</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-[#7b889b]"><span>Cost categories</span><span>Allocation methods</span><span>GL account mapping</span></div>
              </div>
              <div className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[#d7e2ef] bg-white px-3 text-xs font-semibold text-[#315b91] transition-colors group-hover:border-[#9fbee9]">Manage <ChevronRight className="h-4 w-4" /></div>
            </button>

            <div className="mt-4 rounded-[12px] border border-dashed border-[#d8e2ed] bg-[#fbfcfe] px-4 py-3 text-xs leading-5 text-[#6f7d91]"><span className="font-semibold text-[#42526a]">Tip:</span> Default allocation settings apply automatically to new cost postings, while permitted entries can still be adjusted during allocation.</div>
          </div>
        </div>
      ) : null}

      <EditCostEntryDialog lcId={editCostPosting?.lcId ?? ""} entry={editCostPosting} onOpenChange={(open) => { if (!open) setEditCostPosting(null); }} />
      <ConfirmationDialog
        open={Boolean(closeTargetId)}
        onOpenChange={(open) => { if (!open) setCloseTargetId(null); }}
        title="Close LC"
        description={`Close "${closeTarget?.lcNumber ?? "this LC"}"? All items must already be posted to inventory and the allocation difference must be zero. After closing, the LC will be read-only.`}
        confirmLabel={setStatusMutation.isPending ? "Closing..." : "Close LC"}
        onConfirm={() => void handleCloseLc()}
      />
      <ConfirmationDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="Delete LC"
        description={`Delete "${deleteTarget?.lcNumber ?? ""}"${deleteTarget?.status === "FINALIZED" ? " — its finalized landed-cost GL entry will be reversed" : ""}? This cannot be undone.`}
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        tone="danger"
        onConfirm={() => void handleDelete()}
      />
      <ConfirmationDialog
        open={Boolean(deleteCostPosting)}
        onOpenChange={(open) => { if (!open) setDeleteCostPosting(null); }}
        title="Delete Cost Posting"
        description={`Delete "${deleteCostPosting?.costHeadName ?? "this cost posting"}" for ${formatCurrency(deleteCostPosting?.bdtAmount ?? 0)}? Its item-wise allocations will also be deleted. This cannot be undone.`}
        confirmLabel={deleteCostPostingMutation.isPending ? "Deleting..." : "Delete"}
        tone="danger"
        onConfirm={() => void handleDeleteCostPosting()}
      />
    </div>
  );
}
