"use client";

export { ProjectCostingWorkspace as BillSubmissionWorkspace } from "./ProjectCostingWorkspace";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Eye,
  FileCheck2,
  FileText,
  Pencil,
  RotateCcw,
  Search,
  WalletCards,
} from "lucide-react";
import { useCmsWork, useProjectBillStats, useProjectBills } from "@bizovix/api-client";
import { BillSourcePicker } from "./BillSourcePicker";
import { cn } from "@bizovix/ui";
import type { BillStatus, BillType, ProjectBillRecord } from "@bizovix/types";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  BILL_STATUS_META,
  BILL_STATUS_OPTIONS,
  BILL_TYPE_META,
  BILL_TYPE_OPTIONS,
} from "@/lib/project-bills";

const PAGE_SIZE = 10;
const CONTROL_CLASS =
  "h-[38px] w-full rounded-[5px] border border-[#dbe3f0] bg-white px-3 text-[11px] font-medium text-[#0b1f4b] outline-none transition focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10";

type FilterState = {
  search: string;
  billType: BillType | "";
  status: BillStatus | "";
};

const EMPTY_FILTERS: FilterState = { search: "", billType: "", status: "" };

const STATUS_CLASS: Record<BillStatus, string> = {
  DRAFT: "bg-[#f1f4f8] text-[#53627a]",
  SUBMITTED: "bg-[#eaf3ff] text-[#1767c9]",
  UNDER_REVIEW: "bg-[#f1eafe] text-[#7047d9]",
  CERTIFIED: "bg-[#e9f8ec] text-[#249b4a]",
  PARTIALLY_RECEIVED: "bg-[#fff5dd] text-[#b56b00]",
  RECEIVED: "bg-[#e5faf6] text-[#0f8f7f]",
  REJECTED: "bg-[#fff0f1] text-[#d83b4b]",
  CANCELLED: "bg-[#f1f4f8] text-[#7a879b]",
};

function KpiCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "blue" | "orange" | "purple" | "green" | "teal";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tones = {
    blue: "bg-[#e9f2ff] text-[#1267df]",
    orange: "bg-[#fff3df] text-[#f49a19]",
    purple: "bg-[#f0e8ff] text-[#814ee8]",
    green: "bg-[#e8f8eb] text-[#28a655]",
    teal: "bg-[#e3f8f5] text-[#12a995]",
  };

  return (
    <div className="flex h-[64px] min-w-0 items-center rounded-lg border border-[#dfe6f1] bg-white px-2.5 shadow-[0_1px_2px_rgba(15,34,70,0.025)]">
      <span
        className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tones[tone])}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="ml-2.5 min-w-0">
        <span className="block text-[10px] font-medium leading-tight text-[#52627d]">{label}</span>
        <span
          className="mt-1 block break-words text-[13px] font-bold leading-tight text-[#071b49]"
          title={value}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

function billItemSummary(row: ProjectBillRecord) {
  const firstItem = row.items[0]?.description;
  if (!firstItem) return "—";
  return row.items.length > 1 ? `${firstItem} +${row.items.length - 1}` : firstItem;
}

function BillActions({ row }: { row: ProjectBillRecord }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/cms/bills/${row.id}`}
        aria-label={`View ${row.billNo}`}
        title="View bill"
        className="flex h-[28px] w-[28px] items-center justify-center rounded-[5px] border border-[#dce4ef] hover:border-[#0b63e5] hover:text-[#0b63e5]"
      >
        <Eye className="h-3.5 w-3.5" />
      </Link>
      {row.status === "DRAFT" && (
        <Link
          href={`/cms/bills/${row.id}/edit`}
          aria-label={`Edit ${row.billNo}`}
          title="Edit draft bill"
          className="flex h-[28px] w-[28px] items-center justify-center rounded-[5px] border border-[#dce4ef] hover:border-[#0b63e5] hover:text-[#0b63e5]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export function SavedBillHistoryWorkspace({ initialWorkId }: { initialWorkId?: string }) {
  useSetBreadcrumb([
    { label: "Projects", href: "/cms/ongoing-works" },
    { label: "Project Documentation", href: "/cms/documentation" },
    { label: "Bill Submission" },
  ]);

  const [selectedWorkId, setSelectedWorkId] = React.useState(initialWorkId ?? "");
  const [hasSelection, setHasSelection] = React.useState(Boolean(initialWorkId));
  const [showPicker, setShowPicker] = React.useState(!initialWorkId);
  const selectedWork = useCmsWork(selectedWorkId || undefined);
  const [filterDraft, setFilterDraft] = React.useState<FilterState>(EMPTY_FILTERS);
  const [filters, setFilters] = React.useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = React.useState(1);
  const historyEnabled = !hasSelection || !!selectedWorkId;

  const projectBills = useProjectBills(
    {
      page,
      limit: PAGE_SIZE,
      search: filters.search.trim() || undefined,
      cmsWorkId: selectedWorkId || undefined,
      billType: filters.billType || undefined,
      status: filters.status || undefined,
    },
    historyEnabled,
  );
  const billStats = useProjectBillStats(selectedWorkId || undefined, historyEnabled);

  const rows = projectBills.data?.items ?? [];
  const meta = projectBills.data?.meta;
  const totalRows = meta?.total ?? 0;
  const pageCount = meta?.totalPages ?? 1;
  const startEntry = totalRows ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endEntry = Math.min(page * PAGE_SIZE, totalRows);
  const historyEmpty =
    !billStats.isLoading &&
    !billStats.isError &&
    !projectBills.isLoading &&
    !projectBills.isError &&
    (billStats.data?.totalBills ?? 0) === 0 &&
    totalRows === 0;

  function applyFilters() {
    setFilters({ ...filterDraft, search: filterDraft.search.trim() });
    setPage(1);
  }

  function resetFilters() {
    setFilterDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  const statsUnavailable = billStats.isError;
  const moneyStat = (value: string | undefined) => {
    if (billStats.isLoading) return "—";
    if (statsUnavailable) return "Unavailable";
    return formatBDT(value ?? "0");
  };

  return (
    <div className="flex min-h-full flex-col bg-[#f8faff] px-4 pb-4 pt-3 text-[#0b1f4b] sm:px-5 xl:h-full xl:min-h-0 xl:overflow-hidden xl:pl-5 xl:pr-6">
      <div className="flex shrink-0 flex-col items-start justify-between gap-1 pb-3 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <h1 className="text-[21px] font-bold leading-tight tracking-[-0.02em] text-[#071b49]">
            Bill Submission
          </h1>
          <p className="mt-0.5 text-[11.5px] text-[#40577f]">
            Select a source to create a bill, or review saved bills below.
          </p>
        </div>
      </div>
      {showPicker ? (
        <BillSourcePicker
          onSelect={(id, selected) => {
            setSelectedWorkId(id);
            setHasSelection(selected);
            resetFilters();
          }}
        />
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-biz-border bg-white px-4 py-3 text-xs">
          <span>
            Project:{" "}
            <strong>
              {selectedWork.data?.workName ??
                (selectedWork.isLoading ? "Loading..." : "Unavailable")}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="font-semibold text-biz-blue"
          >
            Change project
          </button>
        </div>
      )}
      {historyEnabled && (
        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-2 shrink-0 text-[13px] font-semibold">
            {hasSelection ? "Project Bill History" : "All Bill History"}
          </h2>
          {historyEmpty ? (
            <section className="flex items-center gap-3 rounded-lg border border-[#dfe6f1] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e9f2ff] text-[#1267df]">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#071b49]">
                  {hasSelection ? "No bills for this project yet" : "No saved bills yet"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-[#52627d]">
                  {hasSelection
                    ? "Check the selected project's Contract & BOQ readiness above to create its first bill."
                    : "Select a costed tender or project above to check billing readiness and create the first bill."}
                </p>
              </div>
            </section>
          ) : (
            <>
              <section className="shrink-0 rounded-lg border border-[#dfe6f1] bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
                <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-2 xl:grid-cols-[1.3fr_0.9fr_1fr_auto_auto]">
                  <label className="block min-w-0">
                    <span className="mb-[7px] block text-[10px] font-medium text-[#33496f]">
                      Search Bill / Tender ID
                    </span>
                    <span className="relative block">
                      <input
                        value={filterDraft.search}
                        onChange={(event) =>
                          setFilterDraft((current) => ({ ...current, search: event.target.value }))
                        }
                        onKeyDown={(event) => event.key === "Enter" && applyFilters()}
                        placeholder="Bill no, Tender ID or project"
                        className={cn(CONTROL_CLASS, "pr-10 placeholder:text-[#7c8ca6]")}
                      />
                      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#31476d]" />
                    </span>
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-[7px] block text-[10px] font-medium text-[#33496f]">
                      Bill Type
                    </span>
                    <select
                      value={filterDraft.billType}
                      onChange={(event) =>
                        setFilterDraft((current) => ({
                          ...current,
                          billType: event.target.value as BillType | "",
                        }))
                      }
                      className={CONTROL_CLASS}
                    >
                      <option value="">All Bill Types</option>
                      {BILL_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-[7px] block text-[10px] font-medium text-[#33496f]">
                      Bill Status
                    </span>
                    <select
                      value={filterDraft.status}
                      onChange={(event) =>
                        setFilterDraft((current) => ({
                          ...current,
                          status: event.target.value as BillStatus | "",
                        }))
                      }
                      className={CONTROL_CLASS}
                    >
                      <option value="">All Statuses</option>
                      {BILL_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={applyFilters}
                    className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[5px] bg-[#0765e9] px-5 text-[11px] font-semibold text-white shadow-[0_3px_9px_rgba(7,101,233,0.2)] hover:bg-[#0458ce]"
                  >
                    <Search className="h-4 w-4" /> Search
                  </button>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[5px] border border-[#d9e1ed] bg-white px-5 text-[11px] font-semibold text-[#33496f] hover:bg-[#f7f9fc]"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-[#e2b519]" /> Reset
                  </button>
                </div>
              </section>

              <section className="mt-2 grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                <KpiCard
                  label="Total Bills"
                  value={
                    billStats.isLoading
                      ? "—"
                      : statsUnavailable
                        ? "Unavailable"
                        : String(billStats.data?.totalBills ?? 0)
                  }
                  tone="blue"
                  icon={FileText}
                />
                <KpiCard
                  label="Gross Certified"
                  value={moneyStat(billStats.data?.grossCertified)}
                  tone="orange"
                  icon={FileCheck2}
                />
                <KpiCard
                  label="Net Certified"
                  value={moneyStat(billStats.data?.netCertified)}
                  tone="purple"
                  icon={CircleDollarSign}
                />
                <KpiCard
                  label="Received"
                  value={moneyStat(billStats.data?.received)}
                  tone="green"
                  icon={WalletCards}
                />
                <KpiCard
                  label="Outstanding"
                  value={moneyStat(billStats.data?.outstanding)}
                  tone="blue"
                  icon={CircleDollarSign}
                />
                <KpiCard
                  label="Retention Held"
                  value={moneyStat(billStats.data?.retentionHeld)}
                  tone="teal"
                  icon={WalletCards}
                />
              </section>

              <section className="mt-2 flex min-h-[150px] flex-col overflow-hidden rounded-lg border border-[#dfe6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)] xl:min-h-0 xl:flex-1">
                <div className="hidden min-h-0 lg:block lg:flex-1 lg:overflow-auto">
                  <table className="w-full table-fixed text-left text-[10px] text-[#10244c]">
                    <colgroup>
                      <col className="w-[3%]" />
                      <col className="w-[9%]" />
                      <col className="w-[13%]" />
                      <col className="w-[15%]" />
                      <col className="w-[10%]" />
                      <col className="w-[8%]" />
                      <col className="w-[11%]" />
                      <col className="w-[10%]" />
                      <col className="w-[9%]" />
                      <col className="w-[8%]" />
                      <col className="w-[4%]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr className="h-[42px] border-b border-[#e2e8f1] bg-[#fbfcfe] text-[10px] font-semibold text-[#172c53]">
                        {[
                          "SL",
                          "Tender ID",
                          "Project",
                          "Work Description",
                          "Bill No",
                          "Bill Date",
                          "Bill Amount (BDT)",
                          "Organization",
                          "Bill Status",
                          "Last Updated",
                          "Action",
                        ].map((header) => (
                          <th
                            key={header}
                            className={cn(
                              "px-2 py-2 leading-tight",
                              header === "Action" && "text-right",
                            )}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projectBills.isLoading && (
                        <tr>
                          <td
                            colSpan={11}
                            className="h-[110px] text-center text-[11px] text-[#6d7e99]"
                          >
                            Loading bill submissions...
                          </td>
                        </tr>
                      )}
                      {projectBills.isError && (
                        <tr>
                          <td
                            colSpan={11}
                            className="h-[110px] text-center text-[11px] text-[#d83b4b]"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <span>Bill submissions could not be loaded.</span>
                              <button
                                type="button"
                                onClick={() => projectBills.refetch()}
                                className="font-semibold text-[#075ed7] hover:underline"
                              >
                                Try again
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {!projectBills.isLoading && !projectBills.isError && rows.length === 0 && (
                        <tr>
                          <td
                            colSpan={11}
                            className="h-[110px] text-center text-[11px] text-[#6d7e99]"
                          >
                            No bill submissions found.
                          </td>
                        </tr>
                      )}
                      {!projectBills.isLoading &&
                        !projectBills.isError &&
                        rows.map((row, index) => {
                          const workDescription = billItemSummary(row);
                          return (
                            <tr
                              key={row.id}
                              className="min-h-[48px] border-b border-[#e6ebf2] last:border-0 hover:bg-[#fbfdff]"
                            >
                              <td className="px-2 py-2.5">{(page - 1) * PAGE_SIZE + index + 1}</td>
                              <td className="break-words px-2 py-2.5 font-semibold">
                                {row.cmsWork.tender?.egpTenderId || "—"}
                              </td>
                              <td className="px-2 py-2.5" title={row.cmsWork.workName}>
                                <span className="line-clamp-2">{row.cmsWork.workName}</span>
                              </td>
                              <td className="px-2 py-2.5" title={workDescription}>
                                <span className="line-clamp-2">{workDescription}</span>
                              </td>
                              <td className="break-words px-2 py-2.5 font-semibold">
                                {row.billNo}
                              </td>
                              <td className="px-2 py-2.5">{formatDate(row.billDate)}</td>
                              <td className="break-words px-2 py-2.5 font-medium">
                                {formatBDT(row.grossBillAmount)}
                              </td>
                              <td
                                className="px-2 py-2.5"
                                title={row.cmsWork.organizationMaster.shortName}
                              >
                                <span className="line-clamp-2">
                                  {row.cmsWork.organizationMaster.shortName}
                                </span>
                              </td>
                              <td className="px-2 py-2.5">
                                <span
                                  className={cn(
                                    "inline-flex max-w-full rounded-[5px] px-2 py-[5px] text-center text-[9px] font-semibold leading-tight",
                                    STATUS_CLASS[row.status],
                                  )}
                                >
                                  {BILL_STATUS_META[row.status].label}
                                </span>
                              </td>
                              <td className="px-2 py-2.5">{formatDate(row.updatedAt)}</td>
                              <td className="px-2 py-2.5">
                                <BillActions row={row} />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-[#e6ebf2] lg:hidden">
                  {projectBills.isLoading && (
                    <div className="px-4 py-10 text-center text-[12px] text-[#6d7e99]">
                      Loading bill submissions...
                    </div>
                  )}
                  {projectBills.isError && (
                    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[12px] text-[#d83b4b]">
                      <span>Bill submissions could not be loaded.</span>
                      <button
                        type="button"
                        onClick={() => projectBills.refetch()}
                        className="font-semibold text-[#075ed7] hover:underline"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                  {!projectBills.isLoading && !projectBills.isError && rows.length === 0 && (
                    <div className="px-4 py-10 text-center text-[12px] text-[#6d7e99]">
                      No bill submissions found.
                    </div>
                  )}
                  {!projectBills.isLoading &&
                    !projectBills.isError &&
                    rows.map((row) => (
                      <article key={row.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              href={`/cms/bills/${row.id}`}
                              className="text-[13px] font-bold text-[#075ed7] hover:underline"
                            >
                              {row.billNo}
                            </Link>
                            <p className="mt-1 line-clamp-2 text-[12px] font-semibold text-[#10244c]">
                              {row.cmsWork.workName}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-[5px] px-2 py-[5px] text-[9px] font-semibold",
                              STATUS_CLASS[row.status],
                            )}
                          >
                            {BILL_STATUS_META[row.status].label}
                          </span>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                          <div>
                            <dt className="text-[#71819b]">Tender ID</dt>
                            <dd className="mt-0.5 font-medium">
                              {row.cmsWork.tender?.egpTenderId || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#71819b]">Bill Type</dt>
                            <dd className="mt-0.5 font-medium">{BILL_TYPE_META[row.billType]}</dd>
                          </div>
                          <div>
                            <dt className="text-[#71819b]">Bill Date</dt>
                            <dd className="mt-0.5 font-medium">{formatDate(row.billDate)}</dd>
                          </div>
                          <div>
                            <dt className="text-[#71819b]">Bill Amount</dt>
                            <dd className="mt-0.5 font-semibold">
                              {formatBDT(row.grossBillAmount)}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-3 flex justify-end">
                          <BillActions row={row} />
                        </div>
                      </article>
                    ))}
                </div>

                {totalRows > 0 && (
                  <div className="flex min-h-[42px] flex-col items-center justify-between gap-1 border-t border-[#e2e8f1] px-3 py-2 text-[10px] text-[#40577f] sm:flex-row">
                    <span>
                      Showing {startEntry} to {endEntry} of {totalRows} entries
                    </span>
                    {pageCount > 1 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={page <= 1 || projectBills.isLoading}
                          onClick={() => setPage((value) => Math.max(1, value - 1))}
                          aria-label="Previous page"
                          className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border border-[#dce4ef] disabled:text-[#bcc6d5]"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="min-w-[80px] text-center font-semibold text-[#10244c]">
                          Page {page} of {pageCount}
                        </span>
                        <button
                          type="button"
                          disabled={page >= pageCount || projectBills.isLoading}
                          onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                          aria-label="Next page"
                          className="flex h-[30px] w-[30px] items-center justify-center rounded-[5px] border border-[#dce4ef] disabled:text-[#bcc6d5]"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
