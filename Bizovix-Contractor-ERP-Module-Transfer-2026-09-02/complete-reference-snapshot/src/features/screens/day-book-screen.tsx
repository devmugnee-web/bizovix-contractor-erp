"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from "@tanstack/react-table";
import { CheckCircle2, FileSpreadsheet, Filter, Inbox, Pencil, Printer, Search, Share2, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { AppDateInput } from "@/components/shared/app-date-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { TablePagination } from "@/components/shared/table-pagination";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { useDayBookQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { downloadCsv, printInvoice } from "@/lib/download";
import { formatCurrency, formatDate } from "@/lib/format";
import { roundMoney, sumMoney } from "@/lib/money";
import { buildInvoiceExportPayloadFromVoucher } from "@/lib/invoice";
import { approveVoucherPosting, deleteVoucher, rejectVoucherPosting } from "@/services/voucher.service";
import type { DayBookFilters, VoucherRecord, VoucherType } from "@/types/domain";

const columnHelper = createColumnHelper<VoucherRecord>();

const toneMap: Record<VoucherRecord["voucherType"], "green" | "blue" | "amber" | "red" | "slate"> = {
  sales: "green",
  receipt: "blue",
  purchase: "red",
  expense: "amber",
  revenue: "green",
  payment: "slate",
  journal: "amber",
  contra: "blue",
  "credit-note": "amber",
  "debit-note": "red",
};

const statusToneMap: Record<VoucherRecord["status"], "green" | "blue" | "amber" | "red" | "slate"> = {
  draft: "amber",
  pending: "blue",
  approved: "slate",
  posted: "green",
  rejected: "red",
  cancelled: "red",
  reversed: "slate",
  superseded_by_alteration: "slate",
};

const supportedVoucherTypes = new Set<VoucherType>([
  "sales",
  "purchase",
  "receipt",
  "payment",
  "journal",
  "contra",
  "expense",
  "revenue",
  "credit-note",
  "debit-note",
]);

function displayVoucherType(voucherType: VoucherType) {
  return voucherType === "debit-note" ? "Purchase Return" : voucherType.replace("-", " ");
}

function currentDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDayBookTotal(value: number) {
  return formatCurrency(value);
}

type DayBookColumnId = "partyName" | "voucherNumber" | "voucherType" | "settlementMode" | "amount" | "moneyIn" | "moneyOut";
type DayBookFilterOperator = "contains" | "equals" | "greater" | "less";
type DayBookColumnFilter = { operator: DayBookFilterOperator; value: string; values: string[] };

const emptyDayBookFilter: DayBookColumnFilter = { operator: "contains", value: "", values: [] };

function dayBookColumnValue(voucher: VoucherRecord, columnId: DayBookColumnId) {
  if (columnId === "moneyIn") {
    return ["receipt", "revenue"].includes(voucher.voucherType) ||
      (voucher.voucherType === "sales" && (voucher.settlementMode === "cash" || voucher.settlementMode === "bank"))
      ? String(voucher.amount)
      : "";
  }
  if (columnId === "moneyOut") {
    return ["payment", "expense"].includes(voucher.voucherType) ||
      (voucher.voucherType === "purchase" && (voucher.settlementMode === "cash" || voucher.settlementMode === "bank"))
      ? String(voucher.amount)
      : "";
  }
  return String(voucher[columnId] ?? "");
}

export function DayBookScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, session } = useSessionContext();
  const tableScrollRef = useTransientScrollbar<HTMLDivElement>();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openColumnFilter, setOpenColumnFilter] = useState<DayBookColumnId | null>(null);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<DayBookColumnId, DayBookColumnFilter>>>({});
  const [columnFilterDraft, setColumnFilterDraft] = useState<DayBookColumnFilter>(emptyDayBookFilter);
  const [detailVoucher, setDetailVoucher] = useState<VoucherRecord | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<"approve" | "reject" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VoucherRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const canPostVoucher = mode !== "api" || session?.user.role === "Owner" || session?.user.permissions?.includes("accounting.voucher.post") === true;
  const canEditVoucher = mode !== "api" || session?.user.role === "Owner" || session?.user.permissions?.includes("accounting.voucher.create") === true;
  const canDeleteVoucher = mode !== "api" || session?.user.role === "Owner" || session?.user.permissions?.includes("accounting.voucher.delete") === true;
  const requestedVoucherType = searchParams.get("voucherType");
  const requestedQuery = searchParams.get("query") ?? "";
  const initialVoucherType =
    requestedVoucherType && supportedVoucherTypes.has(requestedVoucherType as VoucherType)
      ? (requestedVoucherType as DayBookFilters["voucherType"])
      : "all";
  const [filters, setFilters] = useState<DayBookFilters>({
    from: currentDateInputValue(),
    to: currentDateInputValue(),
    voucherType: initialVoucherType,
    enteredBy: "all",
    status: "all",
    query: requestedQuery,
    workspaceId: session?.workspaceId,
  });

  const query = useDayBookQuery(mode, { ...filters, workspaceId: session?.workspaceId });
  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(columnFilters).filter(([, filter]) => filter && (filter.value.trim() || filter.values.length));
    if (!activeFilters.length) return query.data ?? [];
    return (query.data ?? []).filter((voucher) => activeFilters.every(([columnId, filter]) => {
      const source = dayBookColumnValue(voucher, columnId as DayBookColumnId).toLowerCase();
      if (filter!.values.length) return filter!.values.some((value) => source === value.toLowerCase());
      const target = filter!.value.trim().toLowerCase();
      if (filter!.operator === "equals") return source === target || Number(source) === Number(target);
      if (filter!.operator === "greater") return Number(source) > Number(target);
      if (filter!.operator === "less") return Number(source) < Number(target);
      return source.includes(target);
    }));
  }, [columnFilters, query.data]);
  const pagedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRows.slice(startIndex, startIndex + pageSize);
  }, [currentPage, filteredRows, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const cashFlowTotals = useMemo(() => {
    const moneyIn = sumMoney(filteredRows.map((voucher) => Number(dayBookColumnValue(voucher, "moneyIn") || 0)));
    const moneyOut = sumMoney(filteredRows.map((voucher) => Number(dayBookColumnValue(voucher, "moneyOut") || 0)));
    return { moneyIn, moneyOut, net: roundMoney(moneyIn - moneyOut) };
  }, [filteredRows]);

  async function handlePrintVoucher(voucher: VoucherRecord) {
    try {
      await printInvoice(buildInvoiceExportPayloadFromVoucher(mode, voucher));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be printed");
    }
  }

  async function handleShareVoucher(voucher: VoucherRecord) {
    const url = `${window.location.origin}${buildVoucherRoute(mode, voucher.voucherType)}?edit=${encodeURIComponent(voucher.id)}`;
    const text = `${displayVoucherType(voucher.voucherType)} ${voucher.voucherNumber}\n${voucher.partyName}\n${formatCurrency(voucher.amount)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: voucher.voucherNumber, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success("Voucher details copied to clipboard");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Voucher could not be shared");
    }
  }

  async function handleApprovalAction(action: "approve" | "reject") {
    if (!detailVoucher) return;
    setApprovalBusy(action);
    try {
      const updated = action === "approve"
        ? await approveVoucherPosting(detailVoucher.id)
        : await rejectVoucherPosting(detailVoucher.id);
      setDetailVoucher(updated);
      await query.refetch();
      toast.success(action === "approve" ? "Voucher approved and posted" : "Voucher rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval action failed");
    } finally {
      setApprovalBusy(null);
    }
  }

  async function handleDeleteVoucher() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteVoucher(mode, deleteTarget.id, deleteTarget.workspaceId);
      setDeleteTarget(null);
      setDetailVoucher(null);
      await query.refetch();
      toast.success("Voucher moved to Recycle Bin");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be deleted");
    } finally {
      setDeleteBusy(false);
    }
  }

  const columns = [
    columnHelper.accessor("partyName", {
      header: "Name",
      cell: ({ row }) => <span className="font-medium text-[#24365a]">{row.original.partyName || row.original.particulars || "—"}</span>,
    }),
    columnHelper.accessor("voucherType", {
      header: "Type",
      cell: ({ row }) => <Badge tone={toneMap[row.original.voucherType]}>{displayVoucherType(row.original.voucherType)}</Badge>,
    }),
    columnHelper.accessor("voucherNumber", {
      header: "Ref No.",
      cell: ({ row }) => <span className="font-medium text-info">{row.original.voucherNumber}</span>,
    }),
    columnHelper.accessor("settlementMode", {
      header: "Payment Type",
      cell: ({ getValue }) => <span className="capitalize">{getValue()?.replace(/-/g, " ") ?? "—"}</span>,
    }),
    columnHelper.display({
      id: "moneyIn",
      header: "Money In",
      cell: ({ row }) => {
        const matches = ["receipt", "revenue"].includes(row.original.voucherType)
          || (row.original.voucherType === "sales" && (row.original.settlementMode === "cash" || row.original.settlementMode === "bank"));
        return <span className="tabular-nums font-medium text-[#16805a]">{matches ? formatCurrency(row.original.amount) : "—"}</span>;
      },
    }),
    columnHelper.display({
      id: "moneyOut",
      header: "Money Out",
      cell: ({ row }) => {
        const matches = ["payment", "expense"].includes(row.original.voucherType)
          || (row.original.voucherType === "purchase" && (row.original.settlementMode === "cash" || row.original.settlementMode === "bank"));
        return <span className="tabular-nums font-medium text-[#c44f4f]">{matches ? formatCurrency(row.original.amount) : "—"}</span>;
      },
    }),
    columnHelper.accessor("amount", {
      header: "Total",
      cell: ({ getValue }) => <span className="tabular-nums font-semibold">{formatCurrency(getValue())}</span>,
    }),
    columnHelper.display({
      id: "actions",
      header: "Print / Share",
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#61708a] hover:bg-[#edf4ff] hover:text-[#1d66b1]" aria-label={`Print ${row.original.voucherNumber}`} onClick={() => void handlePrintVoucher(row.original)}>
            <Printer className="h-4 w-4" />
          </button>
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#61708a] hover:bg-[#edf4ff] hover:text-[#1d66b1]" aria-label={`Share ${row.original.voucherNumber}`} onClick={() => void handleShareVoucher(row.original)}>
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      ),
    }),
  ];
  const orderedColumns = [columns[0], columns[2], columns[1], columns[3], columns[6], columns[4], columns[5], columns[7]];

  const table = useReactTable({
    data: pagedRows,
    columns: orderedColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [columnFilters, filters, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      voucherType:
        requestedVoucherType && supportedVoucherTypes.has(requestedVoucherType as VoucherType)
          ? (requestedVoucherType as DayBookFilters["voucherType"])
          : "all",
      query: requestedQuery,
    }));
  }, [requestedQuery, requestedVoucherType]);

  useEffect(() => {
    const exportHandler = () => {
      if (!filteredRows.length) {
        toast.error("No vouchers available to export");
        return;
      }

      downloadCsv(
        "day-book.csv",
        filteredRows.map((voucher) => ({
          Date: formatDate(voucher.voucherDate),
          Name: voucher.partyName,
          "Ref No.": voucher.voucherNumber,
          Type: displayVoucherType(voucher.voucherType),
          "Payment Type": voucher.settlementMode?.replace(/-/g, " ") ?? "",
          Total: voucher.amount,
          "Money In": dayBookColumnValue(voucher, "moneyIn"),
          "Money Out": dayBookColumnValue(voucher, "moneyOut"),
          Status: voucher.status,
        })),
      );
      toast.success("Day Book exported");
    };

    window.addEventListener("erp-export-request", exportHandler as EventListener);
    return () => window.removeEventListener("erp-export-request", exportHandler as EventListener);
  }, [filteredRows]);

  if (!session || query.isLoading) {
    return <LoadingPanel lines={9} />;
  }

  if (query.error) {
    return (
      <ErrorPanel
        title="Day Book unavailable"
        description="The voucher timeline could not be loaded from the current data provider."
        onRetry={() => query.refetch()}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] hover:translate-y-0">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="shrink-0 border-b border-[#dce4ef] px-5 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#6b7b92]">
              <button type="button" className="transition hover:text-[#1d66b1]" onClick={() => router.push(buildWorkspaceRoute(mode, "/reports"))}>Reports</button>
              <span>/</span>
              <span className="font-semibold text-[#e77716]">Day Book</span>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-wrap items-center gap-8">
              <label className="inline-flex h-10 overflow-hidden rounded-[4px] border border-[#ccd7e6] bg-white">
                <span className="inline-flex items-center bg-[#e77716] px-3 text-xs font-semibold text-white">Date</span>
                <AppDateInput
                  className="h-full w-[155px]"
                  inputClassName="h-full rounded-none border-0 pr-9 focus:ring-0"
                  value={filters.from ?? ""}
                  onChange={(value) => setFilters((current) => ({ ...current, from: value, to: value }))}
                  aria-label="Day Book date"
                />
              </label>
              <select className="h-10 min-w-[200px] rounded-[4px] border border-[#ccd7e6] bg-white px-4 text-sm font-medium text-[#24365a]">
                <option>ALL FIRMS</option>
              </select>
            <select
              className="h-10 min-w-[150px] rounded-[4px] border border-[#ccd7e6] bg-white px-3 text-sm capitalize text-[#24365a]"
              value={filters.voucherType}
              onChange={(event) => setFilters((current) => ({ ...current, voucherType: event.target.value as DayBookFilters["voucherType"] }))}
            >
              <option value="all">All Vouchers</option>
              <option value="sales">Sales</option>
              <option value="purchase">Purchase</option>
              <option value="expense">Expense</option>
              <option value="revenue">Revenue</option>
              <option value="receipt">Receipt</option>
              <option value="payment">Payment</option>
              <option value="journal">Journal</option>
              <option value="contra">Contra</option>
            </select>
              </div>
              <div className="flex items-start gap-7">
              <button type="button" className="text-center text-[11px] font-medium text-[#1d3b63]" onClick={() => window.dispatchEvent(new CustomEvent("erp-export-request"))}>
                <FileSpreadsheet className="mx-auto mb-1 h-5 w-5" />
                Excel Report
              </button>
              <button type="button" className="text-center text-[11px] font-medium text-[#1d3b63]" onClick={() => window.print()}>
                <Printer className="mx-auto mb-1 h-5 w-5" />
                Print
              </button>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center border-b border-[#dce4ef] px-5 py-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7c8797]" />
              <Input id="page-filter-query" aria-label="Search day book" className="h-9 w-[230px] rounded-[3px] border-[#ccd7e6] pl-8" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} />
            </label>
          </div>
          <div className="hidden min-h-0 flex-1 overflow-hidden lg:flex lg:flex-col">
                <div ref={tableScrollRef} className="transient-scrollbar min-h-0 flex-1 overflow-auto">
                  <table className={`data-table min-w-[1100px] bg-white text-sm xl:min-w-full ${pagedRows.length ? "" : "h-full"}`}>
                    <thead className="sticky top-0 z-10 bg-[#f7f7f8]">
                      {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <th key={header.id} className="relative border-b border-r border-[#dce4ef] px-3 py-3 text-left text-[11px] font-semibold uppercase text-[#687386] last:border-r-0">
                              <div className="flex items-center justify-between gap-2">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {header.id !== "actions" ? (
                                  <button
                                    type="button"
                                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition hover:border-[#f4c89f] hover:bg-[#fff3e8] hover:!text-[#e77716] ${(columnFilters[header.id as DayBookColumnId]?.value.trim() || columnFilters[header.id as DayBookColumnId]?.values.length) ? "border-[#f4c89f] bg-[#fff3e8] !text-[#e77716]" : "border-transparent !text-[#46556b]"}`}
                                    aria-label={`Filter ${String(header.column.columnDef.header)}`}
                                    aria-expanded={openColumnFilter === header.id}
                                    onClick={() => {
                                      const columnId = header.id as DayBookColumnId;
                                      if (openColumnFilter === columnId) {
                                        setOpenColumnFilter(null);
                                        return;
                                      }
                                      setColumnFilterDraft(columnFilters[columnId] ?? emptyDayBookFilter);
                                      setOpenColumnFilter(columnId);
                                    }}
                                  >
                                    <Filter className="h-4 w-4 text-current opacity-100" strokeWidth={2} />
                                  </button>
                                ) : null}
                              </div>
                              {header.id !== "actions" && openColumnFilter === header.id ? (
                                <div className="absolute left-1 top-full z-30 mt-1 w-[220px] rounded-[10px] border border-[#d3ddea] bg-white p-3 normal-case shadow-[0_14px_32px_rgba(15,23,42,0.16)]">
                                  {header.id === "voucherType" || header.id === "settlementMode" ? (
                                    <div className="max-h-[210px] space-y-2 overflow-y-auto py-1 text-sm font-normal text-[#26374f]">
                                      {(header.id === "voucherType"
                                        ? Array.from(supportedVoucherTypes)
                                        : ["cash", "accounts-payable"]
                                      ).map((option) => (
                                        <label key={option} className="flex cursor-pointer items-center gap-2.5">
                                          <input
                                            type="checkbox"
                                            className="h-4 w-4 accent-primary"
                                            checked={columnFilterDraft.values.includes(option)}
                                            onChange={(event) => setColumnFilterDraft((current) => ({
                                              ...current,
                                              values: event.target.checked ? [...current.values, option] : current.values.filter((value) => value !== option),
                                            }))}
                                          />
                                          <span className="capitalize">{option.replace(/-/g, " ")}</span>
                                        </label>
                                      ))}
                                    </div>
                                  ) : (
                                    <>
                                      <div className="mb-1.5 text-xs font-medium text-[#738199]">Select Condition</div>
                                      <select
                                        className="h-9 w-full rounded-[7px] border border-[#d3ddea] bg-white px-2 text-sm font-normal text-[#26374f] outline-none focus:border-primary"
                                        value={columnFilterDraft.operator}
                                        onChange={(event) => setColumnFilterDraft((current) => ({ ...current, operator: event.target.value as DayBookFilterOperator }))}
                                      >
                                        {header.id === "amount" || header.id === "moneyIn" || header.id === "moneyOut" ? (
                                          <>
                                            <option value="equals">Equal to</option>
                                            <option value="greater">Greater than</option>
                                            <option value="less">Less than</option>
                                          </>
                                        ) : (
                                          <>
                                            <option value="contains">Contains</option>
                                            <option value="equals">Equal to</option>
                                          </>
                                        )}
                                      </select>
                                      <div className="mb-1.5 mt-3 text-xs font-medium uppercase text-[#738199]">{String(header.column.columnDef.header)}</div>
                                      <Input
                                        autoFocus
                                        type={header.id === "amount" || header.id === "moneyIn" || header.id === "moneyOut" ? "number" : "text"}
                                        className="h-9 rounded-[7px] text-sm font-normal"
                                        value={columnFilterDraft.value}
                                        onChange={(event) => setColumnFilterDraft((current) => ({ ...current, value: event.target.value }))}
                                      />
                                    </>
                                  )}
                                  <div className="mt-3 flex items-center justify-end gap-2">
                                    <button type="button" className="h-9 rounded-full bg-[#f1f2f4] px-4 text-xs font-semibold text-[#737d90] hover:bg-[#e7e9ed]" onClick={() => {
                                      setColumnFilters((current) => {
                                        const next = { ...current };
                                        delete next[header.id as DayBookColumnId];
                                        return next;
                                      });
                                      setColumnFilterDraft(emptyDayBookFilter);
                                      setOpenColumnFilter(null);
                                    }}>
                                      Clear
                                    </button>
                                    <button type="button" className="h-9 rounded-full bg-primary px-4 text-xs font-semibold text-white hover:bg-[#cf670f]" onClick={() => {
                                      const hasValue = columnFilterDraft.value.trim() || columnFilterDraft.values.length;
                                      setColumnFilters((current) => {
                                        const next = { ...current };
                                        if (hasValue) next[header.id as DayBookColumnId] = { ...columnFilterDraft };
                                        else delete next[header.id as DayBookColumnId];
                                        return next;
                                      });
                                      setOpenColumnFilter(null);
                                    }}>
                                      Apply
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
                        <tr
                          key={row.id}
                          className="cursor-pointer hover:bg-canvas/60"
                          onClick={() => setDetailVoucher(row.original)}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                          ))}
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={orderedColumns.length} className="h-full p-8 text-center">
                            <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-muted">
                              <div className="rounded-full bg-primary-soft p-3 text-primary">
                                <Inbox className="h-6 w-6" />
                              </div>
                              <div>
                                <div className="text-base font-semibold text-foreground">No vouchers found</div>
                                <div className="mt-1 text-sm">Try widening the date range or create a new voucher.</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-3 lg:hidden">
                {pagedRows.length ? pagedRows.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-border bg-white p-4"
                    onClick={() => setDetailVoucher(entry)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{entry.partyName}</div>
                        <div className="text-sm text-muted">{entry.voucherNumber}</div>
                      </div>
                      <Badge tone={statusToneMap[entry.status]}>{entry.status}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <Badge tone={toneMap[entry.voucherType]}>{displayVoucherType(entry.voucherType)}</Badge>
                      <div className="tabular-nums font-semibold">{formatCurrency(entry.amount)}</div>
                    </div>
                  </div>
                )) : (
                  <EmptyState title="No vouchers found" description="Try widening the date range or create a new voucher." />
                )}
              </div>
              <TablePagination
                className="shrink-0 px-0 pb-0"
                page={currentPage}
                pageSize={pageSize}
                totalItems={filteredRows.length}
                pageSizeOptions={[10, 25, 50, 100]}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                summary={(
                  <div className="flex items-center gap-5 text-[11px] font-semibold">
                    <span className="font-normal text-muted">Showing {filteredRows.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length} entries</span>
                    <span className="text-[#16805a]">Total Money-In: {formatDayBookTotal(cashFlowTotals.moneyIn)}</span>
                    <span className="text-[#c44f4f]">Total Money-Out: {formatDayBookTotal(cashFlowTotals.moneyOut)}</span>
                    <span className={cashFlowTotals.net < 0 ? "text-[#c44f4f]" : "text-[#1d66b1]"}>Total Money In - Total Money Out: {formatDayBookTotal(cashFlowTotals.net)}</span>
                  </div>
                )}
              />
        </CardContent>
      </Card>
      <Dialog open={Boolean(detailVoucher)} onOpenChange={(open) => !open && setDetailVoucher(null)}>
        <DialogContent className="w-[min(94vw,760px)] overflow-hidden rounded-[18px] border-[#d9e2ee] p-0">
          {detailVoucher ? (
            <>
              <div className="border-b border-[#e3e9f1] px-6 py-5 pr-14">
                <div className="flex flex-wrap items-center gap-2.5">
                  <DialogTitle className="text-2xl font-semibold text-[#132949]">{detailVoucher.voucherNumber}</DialogTitle>
                  <Badge tone={statusToneMap[detailVoucher.status]}>{detailVoucher.status}</Badge>
                </div>
                <DialogDescription className="mt-2 text-sm text-[#61708a]">
                  {detailVoucher.partyName || "Unnamed party"} · {formatDate(detailVoucher.voucherDate)} · {displayVoucherType(detailVoucher.voucherType)}
                </DialogDescription>
              </div>

              <div className="max-h-[62vh] overflow-y-auto">
                <div className="grid px-6 py-2 md:grid-cols-2 md:gap-x-8">
                  {[
                    ["Payment Type", detailVoucher.settlementMode?.replace(/-/g, " ") || "—"],
                    ["Total", formatCurrency(detailVoucher.amount)],
                    ["Money In", dayBookColumnValue(detailVoucher, "moneyIn") ? formatCurrency(detailVoucher.amount) : "—"],
                    ["Money Out", dayBookColumnValue(detailVoucher, "moneyOut") ? formatCurrency(detailVoucher.amount) : "—"],
                    ["Entered By", detailVoucher.enteredBy || "—"],
                    ["Reference", detailVoucher.reference || detailVoucher.voucherNumber],
                  ].map(([label, value]) => (
                    <DayBookDetailField key={label} label={label} value={value} emphasized={label === "Total"} />
                  ))}
                </div>

                <div className="mx-6 border-b border-[#e8edf4] py-3">
                  <div className="text-[12px] font-medium text-[#74839b]">Narration / Particulars</div>
                  <div className="mt-1 text-sm leading-6 text-[#173152]">{detailVoucher.narration || detailVoucher.particulars || "No narration provided."}</div>
                </div>

                {detailVoucher.inventoryItems?.length ? (
                  <div className="mx-6 my-4 overflow-hidden border-y border-[#e3ebf4]">
                    <div className="grid grid-cols-[1fr_90px_130px_140px] border-b border-[#e3ebf4] bg-[#fbfdff] px-3 py-2 text-[11px] font-semibold uppercase text-[#74839b]">
                      <span>Item</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Amount</span>
                    </div>
                    {detailVoucher.inventoryItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-[1fr_90px_130px_140px] border-t border-[#edf1f6] px-3 py-2 text-sm text-[#31445e]">
                        <span>{item.itemName}</span><span className="text-right">{item.quantity}</span><span className="text-right">{formatCurrency(item.unitPrice)}</span><span className="text-right font-medium">{formatCurrency(item.quantity * item.unitPrice)}</span>
                      </div>
                    ))}
                  </div>
                ) : detailVoucher.lines?.length ? (
                  <div className="mx-6 my-4 overflow-hidden border-y border-[#e3ebf4]">
                    <div className="grid grid-cols-[1fr_1fr_130px] border-b border-[#e3ebf4] bg-[#fbfdff] px-3 py-2 text-[11px] font-semibold uppercase text-[#74839b]">
                      <span>Ledger</span><span>Description</span><span className="text-right">Amount</span>
                    </div>
                    {detailVoucher.lines.map((line) => (
                      <div key={line.id} className="grid grid-cols-[1fr_1fr_130px] border-t border-[#edf1f6] px-3 py-2 text-sm text-[#31445e]">
                        <span>{line.ledger}</span><span>{line.description || "—"}</span><span className="text-right font-medium">{formatCurrency(Math.max(line.debit, line.credit))}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-[#e3e9f1] bg-[#fbfcfe] px-6 py-4">
                {detailVoucher.status === "pending" && canPostVoucher ? (
                  <>
                    <Button type="button" disabled={approvalBusy !== null} className="rounded-2xl bg-[#16805a] hover:bg-[#116a4a]" onClick={() => void handleApprovalAction("approve")}>
                      <CheckCircle2 className="h-4 w-4" /> {approvalBusy === "approve" ? "Posting..." : "Approve & Post"}
                    </Button>
                    <Button type="button" disabled={approvalBusy !== null} variant="outline" className="rounded-2xl border-[#efb9bf] text-[#c43d4d] hover:bg-[#fff3f4]" onClick={() => void handleApprovalAction("reject")}>
                      <XCircle className="h-4 w-4" /> {approvalBusy === "reject" ? "Rejecting..." : "Reject"}
                    </Button>
                  </>
                ) : null}
                {canEditVoucher && !["posted", "approved", "cancelled", "reversed"].includes(detailVoucher.status) ? (
                  <Button type="button" className="rounded-2xl" onClick={() => router.push(`${buildVoucherRoute(mode, detailVoucher.voucherType)}?edit=${encodeURIComponent(detailVoucher.id)}`)}>
                    <Pencil className="h-4 w-4" /> Edit Voucher
                  </Button>
                ) : null}
                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => void handlePrintVoucher(detailVoucher)}>
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => void handleShareVoucher(detailVoucher)}>
                  <Share2 className="h-4 w-4" /> Share
                </Button>
                {canDeleteVoucher ? (
                  <Button type="button" variant="outline" className="ml-auto rounded-2xl border-[#efb9bf] text-[#c43d4d] hover:bg-[#fff3f4]" onClick={() => setDeleteTarget(detailVoucher)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null);
        }}
        title="Delete voucher?"
        description="This voucher will be moved to Recycle Bin. You can restore it later as a Draft and edit it before posting again."
        confirmLabel={deleteBusy ? "Deleting..." : "Delete"}
        tone="danger"
        onConfirm={() => {
          if (!deleteBusy) void handleDeleteVoucher();
        }}
      />
    </div>
  );
}

function DayBookDetailField({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-5 border-b border-[#e8edf4] py-3">
      <div className="text-[12px] font-medium text-[#74839b]">{label}</div>
      <div className={`text-right text-sm capitalize text-[#173152] ${emphasized ? "font-semibold" : "font-medium"}`}>{value}</div>
    </div>
  );
}
