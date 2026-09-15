"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Award,
  Calendar,
  ClipboardList,
  Download,
  Eye,
  FileEdit,
  LoaderCircle,
  MoreVertical,
  Search,
  ShieldCheck,
  SquareStack,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  ApiError,
  apiRequestPaginated,
  useApproveTenderForCosting,
  useDeleteTender,
  useTenderStats,
  useTenders,
} from "@bizovix/api-client";
import {
  DataTable,
  IconButton,
  Pagination,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
  cn,
} from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import {
  TENDER_PROCUREMENT_METHODS,
  type TenderProcurementMethod,
  type TenderQuery,
  type TenderRecord,
  type TenderStatus,
} from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Modal } from "@/components/layout/Modal";
import { SuccessPopup } from "@/components/layout/SuccessPopup";
import { TenderForm } from "@/components/tenders/TenderForm";
import { TENDER_STATUS_META, TENDER_STATUS_OPTIONS } from "@/lib/tenders";

interface FilterDraft {
  search: string;
  tenderType: string;
  procurementMethod: string;
  status: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_DRAFT: FilterDraft = {
  search: "",
  tenderType: "",
  procurementMethod: "",
  status: "",
  fromDate: "",
  toDate: "",
};

const TENDER_TYPE_OPTIONS = ["Works", "Goods", "Services", "Physical Service"].map((value) => ({
  value,
  label: value,
}));

const COSTING_APPROVAL_META = {
  DRAFT: { label: "Not Submitted", tone: "neutral" as const },
  PENDING_APPROVAL: { label: "Pending", tone: "warning" as const },
  APPROVED: { label: "Approved", tone: "success" as const },
  REJECTED: { label: "Rejected", tone: "danger" as const },
};

interface TenderSummaryCardProps {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
  helper: string;
}

function TenderSummaryCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  helper,
}: TenderSummaryCardProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-biz-border bg-white px-3 py-2.5 shadow-card transition-shadow hover:shadow-card-hover 2xl:min-h-[76px] 2xl:gap-3 2xl:px-4 2xl:py-3">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg 2xl:h-10 2xl:w-10",
          iconClassName,
        )}
      >
        <Icon className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          title={label}
          className="truncate text-[11px] font-semibold leading-tight text-slate-600 xl:text-[12px] 2xl:text-[13px]"
        >
          {label}
        </p>
        <p className="mt-0.5 truncate text-[17px] font-bold leading-none text-biz-text xl:text-[18px] 2xl:text-[22px]">
          {value}
        </p>
        <p
          title={helper}
          className="mt-1 hidden truncate text-[9.5px] font-medium leading-tight text-slate-500 xl:block 2xl:text-[11px]"
        >
          {helper}
        </p>
      </div>
    </div>
  );
}

const SHORT_VIEWPORT_QUERY = "(max-height: 700px)";
const TALL_VIEWPORT_QUERY = "(min-height: 900px)";
const NARROW_VIEWPORT_QUERY = "(max-width: 1279px)";
const TRACKED_DEADLINE_STATUSES = new Set<TenderStatus>([
  "DRAFT",
  "PUBLISHED",
  "DOCUMENT_PURCHASED",
  "PREPARING",
]);

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

function subscribeToNarrowViewport(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(NARROW_VIEWPORT_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getNarrowViewportSnapshot() {
  return window.matchMedia(NARROW_VIEWPORT_QUERY).matches;
}

function getResponsiveLimit(isNarrow: boolean, isShort: boolean, isTall: boolean) {
  if (isNarrow) {
    if (isShort) return 4;
    return isTall ? 8 : 6;
  }
  if (isShort) return 6;
  return isTall ? 10 : 8;
}

function getDeadlineMeta(value: string | null, status: TenderStatus) {
  if (!value || !TRACKED_DEADLINE_STATUSES.has(status)) return null;
  const due = new Date(value);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) {
    return { label: `${Math.abs(days)}d overdue`, className: "text-biz-danger" };
  }
  if (days === 0) return { label: "Due today", className: "text-biz-danger" };
  if (days <= 7) return { label: `Due in ${days}d`, className: "text-biz-orange" };
  return null;
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

export default function TendersListPage() {
  useSetBreadcrumb([
    { label: "Tender Management", href: "/tender-management" },
    { label: "Tender List" },
  ]);
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const isNarrowViewport = React.useSyncExternalStore(
    subscribeToNarrowViewport,
    getNarrowViewportSnapshot,
    () => false,
  );
  const responsiveLimit = getResponsiveLimit(isNarrowViewport, isShortViewport, isTallViewport);

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<TenderQuery>({ page: 1 });
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<{
    tender: TenderRecord;
    top: number;
    right: number;
  } | null>(null);
  const [approvalTender, setApprovalTender] = React.useState<TenderRecord | null>(null);
  const [approvalError, setApprovalError] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const [successTitle, setSuccessTitle] = React.useState("Tender Saved");
  const [createTenderOpen, setCreateTenderOpen] = React.useState(false);
  const [deleteTender, setDeleteTender] = React.useState<TenderRecord | null>(null);
  const [deleteError, setDeleteError] = React.useState("");
  const [isExporting, setIsExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState("");
  const searchTimerRef = React.useRef<number | null>(null);

  const stats = useTenderStats();
  const effectiveQuery = React.useMemo(
    () => ({ ...query, limit: responsiveLimit }),
    [query, responsiveLimit],
  );
  const tenders = useTenders(effectiveQuery);
  const approveForCosting = useApproveTenderForCosting();
  const deleteTenderMutation = useDeleteTender();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("notice")) return;
    params.delete("notice");
    const queryString = params.toString();
    window.history.replaceState(null, "", `/tenders${queryString ? `?${queryString}` : ""}`);
  }, []);

  React.useEffect(() => {
    if (searchParams.get("addTender") !== "1") return;
    const timer = window.setTimeout(() => {
      setCreateTenderOpen(true);
      const params = new URLSearchParams(window.location.search);
      params.delete("addTender");
      const queryString = params.toString();
      window.history.replaceState(null, "", `/tenders${queryString ? `?${queryString}` : ""}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  React.useEffect(
    () => () => {
      if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    },
    [],
  );

  function closeSuccess() {
    setSuccessMessage("");
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  async function approveSelectedTender(tender: TenderRecord) {
    setApprovalTender(tender);
    setApprovalError("");
    try {
      const result = await approveForCosting.mutateAsync({
        id: tender.id,
        payload: { version: tender.version },
      });
      setApprovalTender(null);
      router.push(`/tender-management/tender-costing?costingId=${result.costing.id}`);
    } catch (error) {
      setApprovalError(
        error instanceof ApiError ? error.message : "Could not approve this tender for costing.",
      );
    }
  }

  async function deleteSelectedTender() {
    if (!deleteTender) return;
    setDeleteError("");
    try {
      await deleteTenderMutation.mutateAsync(deleteTender.id);
      setDeleteTender(null);
      setSuccessTitle("Tender Deleted");
      setSuccessMessage("Tender deleted successfully.");
      setQuery((current) => ({
        ...current,
        page:
          visibleItems.length === 1 && (current.page ?? 1) > 1
            ? (current.page ?? 1) - 1
            : current.page,
      }));
    } catch (error) {
      setDeleteError(error instanceof ApiError ? error.message : "Could not delete this tender.");
    }
  }

  function applyFilters(next: FilterDraft = draft) {
    setQuery({
      page: 1,
      search: next.search || undefined,
      tenderType: next.tenderType || undefined,
      procurementMethod: (next.procurementMethod as TenderProcurementMethod) || undefined,
      status: (next.status as TenderStatus) || undefined,
      fromDate: next.fromDate || undefined,
      toDate: next.toDate || undefined,
    });
  }

  function clearFilters() {
    if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1 });
    setExportError("");
  }

  function updateSearch(value: string) {
    const next = { ...draft, search: value };
    setDraft(next);
    if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      applyFilters(next);
      searchTimerRef.current = null;
    }, 300);
  }

  function updateFilter(
    key: "tenderType" | "procurementMethod" | "status" | "fromDate" | "toDate",
    value: string,
  ) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    applyFilters(next);
  }

  function toggleMenu(tender: TenderRecord, e: React.MouseEvent<HTMLButtonElement>) {
    if (menuAnchor?.tender.id === tender.id) {
      setMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = tender.costingApprovalStatus === "APPROVED" ? 82 : 118;
    const belowTop = rect.bottom + 4;
    const top = belowTop + menuHeight <= window.innerHeight ? belowTop : rect.top - menuHeight - 4;
    setMenuAnchor({ tender, top: Math.max(8, top), right: window.innerWidth - rect.right });
  }

  const meta = tenders.data?.meta ?? {
    page: 1,
    limit: responsiveLimit,
    total: 0,
    totalPages: 1,
  };

  const visibleItems = tenders.data?.items ?? [];

  const activeFilterCount = Object.values(draft).filter(Boolean).length;

  async function exportCsv() {
    setIsExporting(true);
    setExportError("");
    let exportItems: TenderRecord[] = [];
    try {
      const result = await apiRequestPaginated<TenderRecord>("/tenders", {
        params: {
          ...effectiveQuery,
          page: 1,
          limit: Math.max(meta.total, 1),
        },
      });
      exportItems = result.items;
    } catch (error) {
      setExportError(error instanceof ApiError ? error.message : "Could not export tender data.");
      setIsExporting(false);
      return;
    }

    const header = [
      "Tender ID",
      "Product / Work Name",
      "Tender Type",
      "Procurement Method",
      "Closing Date",
      "Found By",
      "Finding Date",
      "Status",
      "Costing Approval",
    ];
    const rows = exportItems.map((row) => [
      row.egpTenderId ?? "N/A",
      row.workName,
      row.tenderType ?? "Not set",
      row.procurementMethod,
      row.submissionDeadline ? formatDate(row.submissionDeadline) : "—",
      row.foundBy?.name ?? row.foundByName ?? "—",
      row.findingDate ? formatDate(row.findingDate) : "—",
      TENDER_STATUS_META[row.status].label,
      COSTING_APPROVAL_META[row.costingApprovalStatus].label,
    ]);
    downloadCsv("tender-list.csv", [header, ...rows]);
    setIsExporting(false);
  }

  return (
    <div className="scrollbar-hidden flex min-h-full flex-col gap-2 overflow-y-auto subpixel-antialiased lg:h-full lg:min-h-0 lg:overflow-hidden 2xl:gap-3">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-biz-border bg-white px-3 py-2 shadow-card 2xl:px-4 2xl:py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-biz-blue-soft text-biz-blue 2xl:h-9 2xl:w-9">
            <ClipboardList className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" />
          </span>
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="shrink-0 text-page-title text-biz-text [@media(max-height:700px)]:text-[20px] 2xl:text-[28px]">
              Tender List
            </h1>
            <p className="hidden truncate border-l border-biz-border pl-2.5 text-[11px] font-medium text-slate-500 md:block xl:text-[12px] 2xl:text-[14px]">
              Opportunities, submissions and award lifecycle
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 2xl:gap-2">
          {exportError && (
            <span
              role="alert"
              className="max-w-[220px] truncate text-[11px] font-medium text-biz-danger 2xl:text-[12px]"
            >
              {exportError}
            </span>
          )}
          <div className="relative">
            <SecondaryButton
              size="sm"
              onClick={() => setDateRangeOpen((v) => !v)}
              className="h-8 whitespace-nowrap px-2.5 text-[11px] font-semibold xl:h-9 xl:text-[12px] 2xl:h-10 2xl:px-3.5 2xl:text-[14px]"
            >
              <Calendar className="h-4 w-4" />
              {draft.fromDate || draft.toDate ? (
                <>
                  {draft.fromDate ? formatDate(draft.fromDate) : "Any"} –{" "}
                  {draft.toDate ? formatDate(draft.toDate) : "Any"}
                </>
              ) : (
                "Closing Date"
              )}
            </SecondaryButton>
            {dateRangeOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40"
                  onClick={() => setDateRangeOpen(false)}
                  aria-label="Close"
                />
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[280px] rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card-hover">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-semibold text-biz-text">Closing Date</p>
                      <p className="text-[9px] text-biz-muted">Changes apply automatically</p>
                    </div>
                    {(draft.fromDate || draft.toDate) && (
                      <button
                        type="button"
                        className="shrink-0 text-[10px] font-semibold text-biz-blue hover:underline"
                        onClick={() => {
                          const next = { ...draft, fromDate: "", toDate: "" };
                          setDraft(next);
                          applyFilters(next);
                        }}
                      >
                        Clear dates
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-medium text-biz-muted">
                      From
                      <input
                        type="date"
                        value={draft.fromDate}
                        onChange={(e) => updateFilter("fromDate", e.target.value)}
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                    <label className="text-[11px] font-medium text-biz-muted">
                      To
                      <input
                        type="date"
                        value={draft.toDate}
                        onChange={(e) => updateFilter("toDate", e.target.value)}
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
            onClick={() => void exportCsv()}
            disabled={isExporting || tenders.isFetching || meta.total === 0}
            title="Export all filtered tenders as CSV"
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-biz-success px-3 text-[11px] font-semibold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55 xl:h-9 xl:text-[12px] 2xl:h-10 2xl:px-4 2xl:text-[14px]"
          >
            {isExporting ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {isExporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </header>

      {/* KPI Row */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6 2xl:gap-3">
        <TenderSummaryCard
          icon={SquareStack}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Tenders"
          value={String(stats.data?.total ?? "—")}
          helper="All Time"
        />
        <TenderSummaryCard
          icon={ClipboardList}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Preparing"
          value={String(stats.data?.preparing ?? "—")}
          helper="Before submission"
        />
        <TenderSummaryCard
          icon={ArrowRight}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Submitted"
          value={String(stats.data?.submitted ?? "—")}
          helper="Awaiting Opening"
        />
        <TenderSummaryCard
          icon={Search}
          iconClassName="bg-biz-warning-soft text-biz-warning"
          label="Under Evaluation"
          value={String(stats.data?.underEvaluation ?? "—")}
          helper="NOA pending"
        />
        <TenderSummaryCard
          icon={Award}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Awarded"
          value={String(stats.data?.awarded ?? "—")}
          helper="Awarded / Ongoing"
        />
        <TenderSummaryCard
          icon={XCircle}
          iconClassName="bg-biz-danger-soft text-biz-danger"
          label="Unsuccessful"
          value={String(stats.data?.unsuccessful ?? "—")}
          helper="Rejected / Cancelled"
        />
      </div>

      {/* Table workspace */}
      <section className="flex min-h-[440px] flex-1 flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card lg:min-h-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border bg-slate-50/55 px-3 py-2.5 2xl:px-4 2xl:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="whitespace-nowrap text-[14px] font-bold text-biz-text xl:text-[15px] 2xl:text-[18px]">
              All Tenders
            </h2>
            <span className="rounded-full bg-biz-blue-soft px-2 py-0.5 text-[10px] font-semibold text-biz-blue xl:text-[11px] 2xl:px-2.5 2xl:text-[12px]">
              {meta.total} results
            </span>
            {tenders.isFetching && (
              <LoaderCircle
                className="h-3.5 w-3.5 animate-spin text-biz-blue"
                aria-label="Updating"
              />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
            <label className="min-w-[190px] flex-1 sm:max-w-[300px] 2xl:max-w-[380px]">
              <span className="sr-only">Search tender ID, work name or organization</span>
              <TextInput
                icon={Search}
                placeholder="Search ID, work or org..."
                value={draft.search}
                onChange={(event) => updateSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
                  searchTimerRef.current = null;
                  applyFilters();
                }}
                className="h-8 text-[11px] xl:h-9 xl:text-[12px] 2xl:h-10 2xl:text-[14px]"
              />
            </label>

            <label>
              <span className="sr-only">Tender type</span>
              <SelectInput
                className="h-8 w-[120px] text-[11px] xl:h-9 xl:w-[130px] xl:text-[12px] 2xl:h-10 2xl:w-[145px] 2xl:text-[14px]"
                placeholder="All types"
                value={draft.tenderType}
                onChange={(event) => updateFilter("tenderType", event.target.value)}
                options={TENDER_TYPE_OPTIONS}
              />
            </label>

            <label>
              <span className="sr-only">Procurement method</span>
              <SelectInput
                className="h-8 w-[120px] text-[11px] xl:h-9 xl:w-[130px] xl:text-[12px] 2xl:h-10 2xl:w-[145px] 2xl:text-[14px]"
                placeholder="All methods"
                value={draft.procurementMethod}
                onChange={(event) => updateFilter("procurementMethod", event.target.value)}
                options={TENDER_PROCUREMENT_METHODS.map((method) => ({
                  value: method,
                  label: method,
                }))}
              />
            </label>

            <label>
              <span className="sr-only">Tender status</span>
              <SelectInput
                className="h-8 w-[120px] text-[11px] xl:h-9 xl:w-[130px] xl:text-[12px] 2xl:h-10 2xl:w-[145px] 2xl:text-[14px]"
                placeholder="All statuses"
                value={draft.status}
                onChange={(event) => updateFilter("status", event.target.value)}
                options={TENDER_STATUS_OPTIONS}
              />
            </label>

            {activeFilterCount > 0 && (
              <SecondaryButton
                size="sm"
                onClick={clearFilters}
                className="h-8 gap-1 px-2 text-[11px] font-semibold xl:h-9 xl:text-[12px] 2xl:h-10 2xl:text-[14px]"
              >
                <X className="h-3.5 w-3.5" />
                Clear
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] leading-none text-slate-600">
                  {activeFilterCount}
                </span>
              </SecondaryButton>
            )}
          </div>
        </div>

        <DataTable<TenderRecord>
          containerClassName="scrollbar-hidden min-h-0 flex-1 overflow-auto"
          tableClassName="table-fixed min-w-[720px] text-[11px] [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-biz-bg [&_thead_th]:font-semibold [&_thead_th]:tracking-[0.01em] [&_thead_th]:text-slate-600 [&_tbody_tr:nth-child(even)]:bg-slate-50/35 xl:min-w-0 xl:text-[12px] 2xl:text-[14px]"
          isLoading={tenders.isLoading}
          emptyMessage="No tenders match the selected filters."
          data={visibleItems}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/tenders/${row.id}`)}
          columns={[
            {
              key: "tender",
              header: "Tender",
              className:
                "w-[30%] overflow-hidden px-2.5 py-2 [@media(max-height:700px)]:py-2 xl:px-3 xl:py-2.5 2xl:px-4 2xl:py-3",
              render: (row) => (
                <div className="min-w-0">
                  <Link
                    href={`/tenders/${row.id}`}
                    title={row.workName}
                    className="block truncate font-semibold text-biz-text hover:text-biz-blue hover:underline"
                  >
                    {row.workName}
                  </Link>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-slate-500 xl:text-[11px] 2xl:text-[12px]">
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                      {row.egpTenderId ?? "No ID"}
                    </span>
                    {row.organizationMaster && (
                      <span className="truncate" title={row.organizationMaster.fullName}>
                        {row.organizationMaster.shortName}
                      </span>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: "typeMethod",
              header: "Type / Method",
              className:
                "w-[12%] overflow-hidden px-2 py-2 [@media(max-height:700px)]:py-2 xl:px-3 xl:py-2.5 2xl:px-4 2xl:py-3",
              render: (row) => (
                <div className="min-w-0 leading-tight">
                  <p className="truncate font-medium" title={row.tenderType ?? "Not recorded"}>
                    {row.tenderType ?? "Not recorded"}
                  </p>
                  <p className="mt-1 truncate text-[10px] font-medium text-slate-500 xl:text-[11px] 2xl:text-[12px]">
                    {row.procurementMethod}
                  </p>
                </div>
              ),
            },
            {
              key: "dates",
              header: "Dates",
              className:
                "w-[18%] overflow-hidden px-2 py-2 [@media(max-height:700px)]:py-2 xl:px-3 xl:py-2.5 2xl:px-4 2xl:py-3",
              render: (row) => {
                const deadline = getDeadlineMeta(row.submissionDeadline, row.status);
                return (
                  <div className="min-w-0 leading-tight">
                    <p className="truncate">
                      <span className="text-biz-muted">Closing </span>
                      <span className={cn("font-medium", deadline?.className)}>
                        {row.submissionDeadline
                          ? formatDate(row.submissionDeadline)
                          : "Not recorded"}
                      </span>
                      {deadline && (
                        <span
                          className={cn(
                            "ml-1 text-[10px] font-semibold xl:text-[11px] 2xl:text-[12px]",
                            deadline.className,
                          )}
                        >
                          · {deadline.label}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 truncate text-[10px] font-medium text-slate-500 xl:text-[11px] 2xl:text-[12px]">
                      Found {row.findingDate ? formatDate(row.findingDate) : "Not recorded"}
                    </p>
                  </div>
                );
              },
            },
            {
              key: "foundBy",
              header: "Found By",
              className:
                "w-[13%] overflow-hidden px-2 py-2 [@media(max-height:700px)]:py-2 xl:px-3 xl:py-2.5 2xl:px-4 2xl:py-3",
              render: (row) => {
                const foundBy = row.foundBy?.name ?? row.foundByName;
                return (
                  <span
                    className={cn("block truncate", !foundBy && "font-medium text-slate-500")}
                    title={foundBy ?? "Not assigned"}
                  >
                    {foundBy ?? "Not assigned"}
                  </span>
                );
              },
            },
            {
              key: "status",
              header: "Status",
              className:
                "w-[10%] overflow-hidden px-2 py-2 [@media(max-height:700px)]:py-2 xl:px-3 xl:py-2.5 2xl:px-4 2xl:py-3",
              render: (row) => (
                <StatusBadge
                  label={TENDER_STATUS_META[row.status].label}
                  tone={TENDER_STATUS_META[row.status].tone}
                  className="whitespace-nowrap px-2.5 py-1 text-[10px] font-semibold xl:text-[11px] 2xl:px-3 2xl:text-[12px]"
                />
              ),
            },
            {
              key: "costingApproval",
              header: "Costing",
              className:
                "w-[12%] overflow-hidden px-2 py-2 [@media(max-height:700px)]:py-2 xl:px-3 xl:py-2.5 2xl:px-4 2xl:py-3",
              render: (row) => {
                if (row.costingApprovalStatus === "PENDING_APPROVAL") {
                  return (
                    <div>
                      <PrimaryButton
                        className="h-7 max-w-full gap-1 px-1.5 text-[10px] font-semibold xl:h-8 xl:px-2 xl:text-[11px] 2xl:text-[12px]"
                        disabled={approveForCosting.isPending}
                        onClick={() => void approveSelectedTender(row)}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {approveForCosting.isPending && approvalTender?.id === row.id
                          ? "Approving..."
                          : "Approve"}
                      </PrimaryButton>
                      {approvalTender?.id === row.id && approvalError && (
                        <p className="mt-1 max-w-40 text-[10px] leading-4 text-biz-danger">
                          {approvalError}
                        </p>
                      )}
                    </div>
                  );
                }
                const approvalMeta = COSTING_APPROVAL_META[row.costingApprovalStatus];
                return (
                  <span
                    title={
                      row.costingApprovalStatus === "APPROVED"
                        ? "Approved for costing"
                        : approvalMeta.label
                    }
                  >
                    <StatusBadge
                      label={approvalMeta.label}
                      tone={approvalMeta.tone}
                      className="whitespace-nowrap px-2.5 py-1 text-[10px] font-semibold xl:text-[11px] 2xl:px-3 2xl:text-[12px]"
                    />
                  </span>
                );
              },
            },
            {
              key: "action",
              header: "",
              className:
                "w-[5%] overflow-hidden bg-white px-1 py-2 text-center [@media(max-height:700px)]:py-2 xl:py-2.5 2xl:py-3",
              render: (row) => (
                <div className="flex items-center justify-center">
                  <IconButton
                    aria-label={`More actions for ${row.workName}`}
                    title="More actions"
                    onClick={(event) => toggleMenu(row, event)}
                  >
                    <MoreVertical className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" />
                  </IconButton>
                </div>
              ),
            },
          ]}
        />

        <div className="shrink-0 border-t border-biz-border bg-slate-50/60 [&>div>span]:font-medium [&>div>span]:text-slate-600 2xl:[&>div>span]:text-[13px]">
          <Pagination
            page={meta.page}
            limit={meta.limit}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
          />
        </div>
      </section>

      {menuAnchor && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Close"
            onClick={() => setMenuAnchor(null)}
          />
          <div
            className="fixed z-50 w-[180px] overflow-hidden rounded-md border border-biz-border bg-biz-surface py-1 shadow-card-hover"
            style={{ top: menuAnchor.top, right: menuAnchor.right }}
          >
            <Link
              href={`/tenders/${menuAnchor.tender.id}`}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-biz-text hover:bg-biz-bg"
              onClick={() => setMenuAnchor(null)}
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </Link>
            <Link
              href={`/tenders/${menuAnchor.tender.id}/edit`}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-biz-text hover:bg-biz-bg"
              onClick={() => setMenuAnchor(null)}
            >
              <FileEdit className="h-3.5 w-3.5" />
              Edit
            </Link>
            {menuAnchor.tender.costingApprovalStatus !== "APPROVED" && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-biz-danger hover:bg-biz-danger/5"
                onClick={() => {
                  setDeleteError("");
                  setDeleteTender(menuAnchor.tender);
                  setMenuAnchor(null);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
          </div>
        </>
      )}

      <Modal
        open={!!deleteTender}
        onClose={() => !deleteTenderMutation.isPending && setDeleteTender(null)}
        title="Delete Tender?"
      >
        {deleteTender && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-biz-border bg-biz-bg p-3 text-[13px] text-biz-text">
              <p className="font-semibold">
                {deleteTender.egpTenderId} · {deleteTender.workName}
              </p>
              <p className="mt-1 text-biz-muted">
                This tender has not been approved for costing. It can be deleted if no workflow
                records are linked. This action cannot be undone.
              </p>
            </div>
            {deleteTender.costingApprovalStatus === "APPROVED" && (
              <p className="text-[12px] font-medium text-biz-danger">
                This tender is already approved for costing and cannot be deleted.
              </p>
            )}
            {deleteError && <p className="text-[12px] text-biz-danger">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <SecondaryButton
                disabled={deleteTenderMutation.isPending}
                onClick={() => setDeleteTender(null)}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton
                className="bg-biz-danger hover:bg-biz-danger/90"
                disabled={
                  deleteTenderMutation.isPending ||
                  deleteTender.costingApprovalStatus === "APPROVED"
                }
                onClick={deleteSelectedTender}
              >
                <Trash2 className="h-4 w-4" />
                {deleteTenderMutation.isPending ? "Deleting..." : "Delete Tender"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={createTenderOpen}
        onClose={() => setCreateTenderOpen(false)}
        title="Add New Tender"
        wide
        contentClassName="max-h-[calc(100vh-2rem)] overflow-y-auto"
      >
        <TenderForm
          mode="create"
          embedded
          onCancel={() => setCreateTenderOpen(false)}
          onCompleted={() => {
            setCreateTenderOpen(false);
          }}
        />
      </Modal>

      <SuccessPopup
        open={!!successMessage}
        title={successTitle}
        message={successMessage}
        onClose={closeSuccess}
        onPrimary={closeSuccess}
      />
    </div>
  );
}
