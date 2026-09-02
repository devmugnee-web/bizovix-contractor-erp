"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { ArrowDown, ChevronDown, Eye, Filter, Loader2, MoreVertical, Printer, ReceiptText, Search, Share2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { AppDateInput } from "@/components/shared/app-date-input";
import { useEscapeDismiss } from "@/hooks/use-escape-dismiss";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { roundMoney } from "@/lib/money";
import { getLatestPostingMonthRange } from "@/lib/posting-date-range";
import { openPrintWindow, printWindowWhenReady } from "@/lib/print";
import { deleteVoucher, listDayBook } from "@/services/voucher.service";
import type { VoucherRecord } from "@/types/domain";

type PreviewRow = {
  id: string;
  createdAt: string;
  date: string;
  refNo: string;
  name: string;
  type: string;
  total: number;
  receivedPaid: number;
  balance: number;
};

const settledVoucherTypes = new Set<VoucherRecord["voucherType"]>(["expense", "payment", "receipt", "revenue", "contra", "journal"]);

function formatPrintAmount(value: number) {
  return formatCurrency(value);
}

function getMonthRangeFallback() {
  // Must be the real current date: a fixed one leaves "This Month" pointing at a
  // month that has passed, so the preview lists nothing and prints an empty sheet.
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const toYmd = (value: Date) => {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, "0");
    const day = `${value.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return {
    from: toYmd(monthStart),
    to: toYmd(today),
  };
}

function toVoucherLabel(value: VoucherRecord["voucherType"]) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toPreviewRow(voucher: VoucherRecord): PreviewRow {
  const receivedPaid = settledVoucherTypes.has(voucher.voucherType) ? voucher.amount : 0;
  const balance = Math.max(0, roundMoney(voucher.amount - receivedPaid));
  const rawRefNo = voucher.reference?.trim() || voucher.voucherNumber.trim();

  return {
    id: voucher.id,
    createdAt: voucher.createdAt,
    date: formatDate(voucher.voucherDate),
    refNo: rawRefNo.replace(/^[A-Z]+-/i, ""),
    name: voucher.partyName?.trim() || voucher.particulars?.trim() || "-",
    type: toVoucherLabel(voucher.voucherType),
    total: voucher.amount,
    receivedPaid,
    balance,
  };
}

function buildPrintDocument(rows: PreviewRow[], fromDate: string, toDate: string) {
  const bodyRows = rows
    .map(
      (row) => `
        <tr>
          <td>${row.date}</td>
          <td>${row.refNo || "&nbsp;"}</td>
          <td>${row.name}</td>
          <td>${row.type}</td>
          <td class="amount">${formatPrintAmount(row.total)}</td>
          <td class="amount">${formatPrintAmount(row.receivedPaid)}</td>
          <td class="amount">${formatPrintAmount(row.balance)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Bulk Actions Print</title>
      <style>
        body { font-family: Arial, sans-serif; color: #173152; margin: 24px; }
        .header { margin-bottom: 20px; }
        .title { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
        .meta { font-size: 13px; color: #5f6f89; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border: 1px solid #dce5f0; padding: 10px 12px; text-align: left; }
        th { background: #f8fbff; color: #60728d; text-transform: uppercase; font-size: 12px; }
        .amount { text-align: right; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">Bulk Actions</div>
        <div class="meta">Transactions from ${formatDate(fromDate)} to ${formatDate(toDate)}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Ref. No.</th>
            <th>Name</th>
            <th>Type</th>
            <th>Total</th>
            <th>Received/Paid</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </body>
  </html>`;
}

export function GlobalPrintPreview({
  contentRootRef,
  pathname,
}: {
  contentRootRef: RefObject<HTMLElement | null>;
  pathname: string;
}) {
  const queryClient = useQueryClient();
  const { mode, session } = useSessionContext();
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  const postingRangeInitializedRef = useRef("");
  const monthRange = useMemo(() => getMonthRangeFallback(), []);

  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(monthRange.from);
  const [toDate, setToDate] = useState(monthRange.to);
  const [searchValue, setSearchValue] = useState("");
  const [transactionFilter, setTransactionFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<PreviewRow | null>(null);

  const dayBookQuery = useQuery({
    queryKey: [mode, "global-print-preview", session?.workspaceId, fromDate, toDate],
    queryFn: () =>
      listDayBook(mode, {
        from: fromDate,
        to: toDate,
        voucherType: "all",
        enteredBy: "all",
        status: "all",
        workspaceId: session?.workspaceId,
      }),
    enabled: open && Boolean(session?.workspaceId),
  });
  const postingAnchorQuery = useQuery({
    queryKey: [mode, "global-print-preview-posting-anchor", session?.workspaceId],
    queryFn: () =>
      listDayBook(mode, {
        voucherType: "all",
        enteredBy: "all",
        status: "all",
        workspaceId: session?.workspaceId,
      }),
    enabled: open && Boolean(session?.workspaceId),
  });

  useEffect(() => {
    if (!open) {
      postingRangeInitializedRef.current = "";
      return;
    }
    const range = getLatestPostingMonthRange(
      (postingAnchorQuery.data ?? [])
        .filter((voucher) => voucher.status !== "cancelled")
        .map((voucher) => voucher.voucherDate),
    );
    if (!range) return;
    const key = `${session?.workspaceId ?? "default"}:${range.to}`;
    if (postingRangeInitializedRef.current === key) return;
    setFromDate(range.from);
    setToDate(range.to);
    postingRangeInitializedRef.current = key;
  }, [open, postingAnchorQuery.data, session?.workspaceId]);

  const rows = useMemo(() => (dayBookQuery.data ?? []).map(toPreviewRow), [dayBookQuery.data]);
  const transactionOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.type))).sort((a, b) => a.localeCompare(b)), [rows]);
  const partyOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.name))).sort((a, b) => a.localeCompare(b)), [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    const nextRows = rows.filter((row) => {
      const matchesTransaction = transactionFilter === "all" || row.type === transactionFilter;
      const matchesParty = partyFilter === "all" || row.name === partyFilter;
      const matchesSearch =
        !normalizedSearch ||
        row.date.toLowerCase().includes(normalizedSearch) ||
        row.refNo.toLowerCase().includes(normalizedSearch) ||
        row.name.toLowerCase().includes(normalizedSearch) ||
        row.type.toLowerCase().includes(normalizedSearch);

      return matchesTransaction && matchesParty && matchesSearch;
    });

    return nextRows.sort((left, right) => {
      const comparison = left.createdAt.localeCompare(right.createdAt);
      return sortDirection === "desc" ? -comparison : comparison;
    });
  }, [partyFilter, rows, searchValue, sortDirection, transactionFilter]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedRows = useMemo(() => filteredRows.filter((row) => selectedIdSet.has(row.id)), [filteredRows, selectedIdSet]);
  const filteredIds = useMemo(() => filteredRows.map((row) => row.id), [filteredRows]);
  const allVisibleSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIdSet.has(id));
  const someVisibleSelected = filteredIds.some((id) => selectedIdSet.has(id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    const visibleIdSet = new Set(filteredIds);
    setSelectedIds((current) => current.filter((id) => visibleIdSet.has(id)));
  }, [filteredIds]);

  useEffect(() => {
    const handleTogglePreview = () => {
      setOpen((current) => !current);
    };

    window.addEventListener("erp-open-print-preview", handleTogglePreview as EventListener);
    return () => window.removeEventListener("erp-open-print-preview", handleTogglePreview as EventListener);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("print-preview-open", open);
    return () => document.body.classList.remove("print-preview-open");
  }, [open]);

  useEscapeDismiss(open, () => setOpen(false));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function toggleRowSelection(rowId: string) {
    setSelectedIds((current) => (current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]));
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !filteredIds.includes(id));
      }

      const next = new Set(current);
      filteredIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }

  function resetMonthRange() {
    setFromDate(monthRange.from);
    setToDate(monthRange.to);
  }

  async function handleShareSelected() {
    if (!selectedRows.length) {
      toast.error("Select at least one transaction first");
      return;
    }

    const shareText = selectedRows
      .map((row) => `${row.date} | ${row.refNo || "-"} | ${row.name} | ${row.type} | ${formatPrintAmount(row.total)} | Balance ${formatPrintAmount(row.balance)}`)
      .join("\n");

    try {
      await navigator.clipboard.writeText(shareText);
      toast.success(`${selectedRows.length} transaction${selectedRows.length > 1 ? "s" : ""} copied for sharing`);
    } catch {
      toast.info("Share summary is ready, but clipboard access is blocked");
    }
  }

  function handlePrintSelected() {
    if (!selectedRows.length) {
      toast.error("Select at least one transaction first");
      return;
    }

    const printWindow = openPrintWindow("width=1100,height=900");
    if (!printWindow) {
      toast.error("Allow popups to print selected transactions");
      return;
    }

    printWindow.document.write(buildPrintDocument(selectedRows, fromDate, toDate));
    printWindowWhenReady(printWindow);
  }

  function handlePrintRows(rowsToPrint: PreviewRow[]) {
    const printWindow = openPrintWindow("width=1100,height=900");
    if (!printWindow) {
      toast.error("Allow popups to print this transaction");
      return;
    }

    printWindow.document.write(buildPrintDocument(rowsToPrint, fromDate, toDate));
    printWindowWhenReady(printWindow);
  }

  async function handleDeleteSelected() {
    if (!session?.workspaceId || !selectedRows.length) {
      toast.error("Select at least one transaction first");
      return;
    }

    try {
      setDeleteSubmitting(true);
      for (const row of selectedRows) {
        await deleteVoucher(mode, row.id, session.workspaceId);
      }
      setSelectedIds([]);
      setDeleteDialogOpen(false);
      await Promise.all([
        dayBookQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: [mode, "day-book"] }),
        queryClient.invalidateQueries({ queryKey: [mode, "dashboard"] }),
      ]);
      toast.success(`${selectedRows.length} transaction${selectedRows.length > 1 ? "s" : ""} deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Selected transactions could not be deleted");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  if (!open || !contentRootRef.current) {
    return null;
  }

  return (
    <>
      {createPortal(
        <section className="print-preview-shell print-preview-sheet absolute inset-0 z-30 overflow-hidden rounded-[18px] border border-[#cfdaea] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.10)]">
        <div className="print-preview-chrome border-b border-[#ccdae9] px-3 py-4 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[15px] font-semibold text-[#213452]">Bulk Actions</div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-[#61708a]">{selectedRows.length ? `${selectedRows.length} selected` : `${filteredRows.length} records`}</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#fff1ed] text-[#d84f2a] transition hover:bg-[#ffe2d8]"
                aria-label="Close bulk actions"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="print-preview-chrome border-y border-[#ccdae9] bg-white px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-3 text-[14px] text-[#1e3658]">
            <span className="font-medium">Filter By :</span>

            <button type="button" className="print-preview-filter-chip" onClick={resetMonthRange}>
              <span>This Month</span>
              <ChevronDown className="h-4 w-4 text-[#5e7394]" />
            </button>

            <div className="print-preview-filter-chip gap-2.5">
              <AppDateInput value={fromDate} onChange={setFromDate} className="w-[132px]" inputClassName="h-7 border-0 bg-transparent px-0 pr-7 text-sm text-[#243b5a] focus:ring-0" aria-label="Print preview from date" />
              <span>To</span>
              <AppDateInput value={toDate} onChange={setToDate} className="w-[132px]" inputClassName="h-7 border-0 bg-transparent px-0 pr-7 text-sm text-[#243b5a] focus:ring-0" aria-label="Print preview to date" />
            </div>

            <div className="print-preview-filter-chip">
              <select value="all-firms" onChange={() => undefined} className="appearance-none bg-transparent pr-5 text-sm text-[#243b5a] outline-none">
                <option value="all-firms">All Firms</option>
              </select>
              <ChevronDown className="pointer-events-none h-4 w-4 shrink-0 text-[#5e7394]" />
            </div>

            <div className="print-preview-filter-chip">
              <select value={transactionFilter} onChange={(event) => setTransactionFilter(event.target.value)} className="appearance-none bg-transparent pr-5 text-sm text-[#243b5a] outline-none">
                <option value="all">All Transactions</option>
                {transactionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none h-4 w-4 shrink-0 text-[#5e7394]" />
            </div>

            <div className="print-preview-filter-chip min-w-[220px] justify-between">
              <select value={partyFilter} onChange={(event) => setPartyFilter(event.target.value)} className="min-w-[170px] appearance-none bg-transparent pr-5 text-sm text-[#243b5a] outline-none">
                <option value="all">Select Party</option>
                {partyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none h-4 w-4 shrink-0 text-[#5e7394]" />
            </div>
          </div>
        </div>

        <div className="flex h-full min-h-0 flex-col bg-white">
          <div className="print-preview-chrome flex flex-wrap items-center justify-between gap-4 px-3 py-8 sm:px-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#0f2644]">
              <ReceiptText className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
              Transactions
            </div>
            <label className="print-preview-search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ba8ba]" />
              <input
                type="text"
                autoComplete="off"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                aria-label="Search transactions"
                placeholder=""
              />
            </label>
          </div>

          <div className="print-preview-table-wrap min-h-0 flex-1 overflow-auto border-t border-[#edf2f8]">
            <table className="min-w-full border-separate border-spacing-0 bg-white text-sm">
              <thead>
                <tr className="bg-[#fbfcfe] text-[#6f7f98]">
                  <th className="w-[44px] border-b border-r border-[#dce5f0] px-3 py-3 text-left">
                    <input ref={headerCheckboxRef} type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all" />
                  </th>
                  <th className="min-w-[150px] border-b border-r border-[#dce5f0] px-3 py-3 text-left text-[12px] font-semibold uppercase">
                    <button type="button" className="flex w-full items-center justify-between gap-2" onClick={() => setSortDirection((current) => (current === "desc" ? "asc" : "desc"))}>
                      <span className="inline-flex items-center gap-2">
                        Date
                        <ArrowDown className={`h-4 w-4 text-[#315b92] ${sortDirection === "asc" ? "rotate-180" : ""}`} />
                      </span>
                      <Filter className="h-3.5 w-3.5 text-[#6f7f98]" />
                    </button>
                  </th>
                  {[
                    { key: "refNo", label: "Ref. No.", width: "180px" },
                    { key: "name", label: "Name", width: "260px" },
                    { key: "type", label: "Type", width: "180px" },
                    { key: "total", label: "Total", width: "150px", align: "right" },
                    { key: "receivedPaid", label: "Received/Paid", width: "170px", align: "right" },
                    { key: "balance", label: "Balance", width: "150px", align: "right" },
                  ].map((column) => (
                    <th
                      key={column.key}
                      className="border-b border-r border-[#dce5f0] px-3 py-3 text-left text-[12px] font-semibold uppercase"
                      style={{ minWidth: column.width }}
                    >
                      <div className={`flex items-center gap-2 ${column.align === "right" ? "justify-end" : "justify-between"}`}>
                        <span>{column.label}</span>
                        <Filter className="h-3.5 w-3.5 text-[#6f7f98]" />
                      </div>
                    </th>
                  ))}
                  <th className="relative min-w-[118px] border-b border-[#dce5f0] px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setBulkMenuOpen((current) => !current)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#c9d6e8] bg-white px-3 text-[12px] font-semibold normal-case text-[#213452] hover:bg-[#f5f8fc]"
                      aria-expanded={bulkMenuOpen}
                    >
                      Actions <MoreVertical className="h-4 w-4" />
                    </button>
                    {bulkMenuOpen ? (
                      <div className="absolute right-2 top-[46px] z-40 w-48 rounded-xl border border-[#d7e0ec] bg-white p-1.5 text-left shadow-[0_14px_35px_rgba(15,23,42,0.16)]">
                        <div className="px-3 py-2 text-[11px] font-semibold normal-case text-[#7a879b]">
                          {selectedRows.length ? `${selectedRows.length} selected` : "Select transactions first"}
                        </div>
                        <button type="button" disabled={!selectedRows.length} onClick={() => { setBulkMenuOpen(false); handlePrintSelected(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium normal-case text-[#243b5a] hover:bg-[#f2f6fb] disabled:cursor-not-allowed disabled:opacity-40">
                          <Printer className="h-4 w-4" /> Print selected
                        </button>
                        <button type="button" disabled={!selectedRows.length} onClick={() => { setBulkMenuOpen(false); void handleShareSelected(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium normal-case text-[#243b5a] hover:bg-[#f2f6fb] disabled:cursor-not-allowed disabled:opacity-40">
                          <Share2 className="h-4 w-4" /> Share selected
                        </button>
                        <button type="button" disabled={!selectedRows.length} onClick={() => { setBulkMenuOpen(false); setDeleteDialogOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium normal-case text-[#c43d34] hover:bg-[#fff2f0] disabled:cursor-not-allowed disabled:opacity-40">
                          <Trash2 className="h-4 w-4" /> Delete selected
                        </button>
                      </div>
                    ) : null}
                  </th>
                </tr>
              </thead>
              <tbody>
                {dayBookQuery.isLoading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <tr key={`loading-${index}`} className="animate-pulse">
                      <td className="border-b border-r border-[#edf2f7] px-3 py-4">
                        <div className="h-4 w-4 rounded border border-[#d8e1ed] bg-[#f8fafc]" />
                      </td>
                      <td className="border-b border-r border-[#edf2f7] px-3 py-4" colSpan={7}>
                        <div className="h-4 w-full rounded bg-[#f2f5f9]" />
                      </td>
                      <td className="border-b border-[#edf2f7] px-3 py-4">
                        <div className="ml-auto h-4 w-4 rounded bg-[#f2f5f9]" />
                      </td>
                    </tr>
                  ))
                ) : dayBookQuery.error ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-sm text-[#c43d34]">
                      Transactions could not be loaded right now.
                    </td>
                  </tr>
                ) : filteredRows.length ? (
                  filteredRows.map((row) => {
                    const selected = selectedIdSet.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={`${selected ? "bg-[#eaf2ff]" : "bg-white hover:bg-[#f9fbff]"} cursor-pointer`}
                        onClick={() => setDetailRow(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") setDetailRow(row);
                        }}
                        tabIndex={0}
                        aria-label={`View details for ${row.refNo || row.name}`}
                      >
                        <td className="border-b border-r border-[#edf2f7] px-3 py-3" onClick={(event) => event.stopPropagation()}>
                          <input type="checkbox" checked={selected} onChange={() => toggleRowSelection(row.id)} aria-label={`Select ${row.name}`} />
                        </td>
                        <td className="border-b border-r border-[#edf2f7] px-3 py-3 text-[13px] text-[#173152]">{row.date}</td>
                        <td className="border-b border-r border-[#edf2f7] px-3 py-3 text-[13px] text-[#173152]">{row.refNo}</td>
                        <td className="border-b border-r border-[#edf2f7] px-3 py-3 text-[13px] text-[#173152]">{row.name}</td>
                        <td className="border-b border-r border-[#edf2f7] px-3 py-3 text-[13px] text-[#173152]">{row.type}</td>
                        <td className="border-b border-r border-[#edf2f7] px-3 py-3 text-right text-[13px] text-[#173152]">{formatPrintAmount(row.total)}</td>
                        <td className="border-b border-r border-[#edf2f7] px-3 py-3 text-right text-[13px] text-[#173152]">{formatPrintAmount(row.receivedPaid)}</td>
                        <td className="border-b border-r border-[#edf2f7] px-3 py-3 text-right text-[13px] text-[#173152]">{formatPrintAmount(row.balance)}</td>
                        <td className="border-b border-[#edf2f7] px-3 py-3 text-center text-[#61708a]">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[#edf4ff]"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDetailRow(row);
                            }}
                            aria-label={`View details for ${row.name}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-sm text-[#6e7d94]">
                      No transactions match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="print-preview-chrome print-preview-controls sticky bottom-0 flex items-center justify-between border-t border-[#dfe7f1] bg-white px-4 py-3">
            <div className="text-sm text-[#61708a]">{selectedRows.length ? `${selectedRows.length} transaction selected` : "Select one or more transactions"}</div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[#d7dff1] bg-white px-4 text-sm font-medium text-[#c1cce0] disabled:cursor-not-allowed disabled:opacity-100"
                disabled={!selectedRows.length || deleteSubmitting}
                onClick={() => setDeleteDialogOpen(true)}
              >
                {deleteSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                Delete
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[#cfd9eb] bg-white px-4 text-sm font-medium text-[#8ca0c0] disabled:cursor-not-allowed"
                disabled={!selectedRows.length}
                onClick={() => void handleShareSelected()}
              >
                <Share2 className="h-5 w-5" />
                Share
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e56812] bg-[#ed720f] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d96008] disabled:cursor-not-allowed disabled:border-[#efb283] disabled:bg-[#efb283] disabled:text-white"
                disabled={!selectedRows.length}
                onClick={handlePrintSelected}
              >
                <Printer className="h-5 w-5" />
                Print
              </button>
            </div>
          </div>
        </div>
        </section>,
        contentRootRef.current,
      )}
      {detailRow ? createPortal(
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#14233c]/35 p-4" onMouseDown={() => setDetailRow(null)}>
          <section className="w-full max-w-[620px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between border-b border-[#e2e8f0] px-6 py-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#718096]">Transaction details</div>
                <h2 className="mt-1 text-xl font-bold text-[#1d304f]">{detailRow.refNo || detailRow.type}</h2>
                <p className="mt-1 text-sm text-[#6b7a90]">{detailRow.name} · {detailRow.date}</p>
              </div>
              <button type="button" onClick={() => setDetailRow(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f6fa] text-[#3b4b63] hover:bg-[#e8eef6]" aria-label="Close transaction details">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="divide-y divide-[#e8edf4] px-6">
              {[
                ["Transaction type", detailRow.type],
                ["Total", formatPrintAmount(detailRow.total)],
                ["Received / Paid", formatPrintAmount(detailRow.receivedPaid)],
                ["Balance", formatPrintAmount(detailRow.balance)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-6 py-3.5">
                  <span className="text-sm text-[#6b7a90]">{label}</span>
                  <span className="text-right text-sm font-semibold text-[#1d304f]">{value}</span>
                </div>
              ))}
            </div>
            <footer className="flex items-center justify-end gap-3 border-t border-[#e2e8f0] bg-[#fbfcfe] px-6 py-4">
              <button type="button" onClick={() => setDetailRow(null)} className="inline-flex h-9 items-center rounded-full border border-[#ced8e6] bg-white px-4 text-sm font-medium text-[#30445f] hover:bg-[#f3f6fa]">Close</button>
              <button type="button" onClick={() => handlePrintRows([detailRow])} className="inline-flex h-9 items-center gap-2 rounded-full bg-[#ed720f] px-5 text-sm font-semibold text-white hover:bg-[#d96008]">
                <Printer className="h-4 w-4" /> Print transaction
              </button>
            </footer>
          </section>
        </div>,
        contentRootRef.current,
      ) : null}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete selected transactions?"
        description={`This will delete ${selectedRows.length} selected transaction${selectedRows.length === 1 ? "" : "s"} from the current workspace.`}
        confirmLabel={deleteSubmitting ? "Deleting..." : "Delete Transactions"}
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => void handleDeleteSelected()}
      />
    </>
  );
}
