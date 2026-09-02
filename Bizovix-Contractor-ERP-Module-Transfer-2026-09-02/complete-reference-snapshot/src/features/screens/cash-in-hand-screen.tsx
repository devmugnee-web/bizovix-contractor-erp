"use client";

import { m } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  CheckCircle2,
  Download,
  Eye,
  Filter,
  ListRestart,
  Search,
  type LucideIcon,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AppDateInput } from "@/components/shared/app-date-input";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { TablePagination } from "@/components/shared/table-pagination";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildWorkspaceRoute } from "@/config/routes";
import { useSessionContext } from "@/hooks/use-session-context";
import { usePostableLedgersQuery } from "@/hooks/use-accounts-query";
import { downloadCsv } from "@/lib/download";
import { getLatestPostingMonthRange } from "@/lib/posting-date-range";
import { formatDate, formatDateTime } from "@/lib/format";
import { roundMoney, sumMoney } from "@/lib/money";
import { openPrintWindow, printWindowWhenReady } from "@/lib/print";
import { cn } from "@/lib/utils";
import { createVoucher, deleteVoucher, listDayBook, updateVoucher } from "@/services/voucher.service";
import type { VoucherFormInput, VoucherLine, VoucherRecord, VoucherType } from "@/types/domain";

type CashAdjustmentMode = "add" | "reduce";
type CashAccountView = "main" | "petty";
type FilterableColumnId = "date" | "narration" | "debitLedger" | "creditLedger" | "cashIn" | "cashOut";
type ColumnFilterOperator = "contains" | "equals" | "starts-with";

type CashTransactionRecord = {
  id: string;
  mode: CashAdjustmentMode;
  title: string;
  note: string;
  amount: number;
  date: string;
  createdAt: string;
  cashLedger?: string;
  voucher?: VoucherRecord;
};

type CashAdjustmentDraft = {
  mode: CashAdjustmentMode;
  amount: string;
  date: string;
  note: string;
  counterLedgerId: string;
  counterLedgerName: string;
};

type ColumnFilterValue = {
  operator: ColumnFilterOperator;
  value: string;
};

type ColumnFilterPopoverState = {
  columnId: FilterableColumnId;
  left: number;
  top: number;
};

type CashAccountConfig = {
  title: string;
  badge: string;
  accentText: string;
  accentSurface: string;
  accentBorder: string;
  headerBackground: string;
  buttonShadow: string;
};

const currencySymbol = "\u09F3";
const cashLedgerByAccount: Record<CashAccountView, string> = {
  main: "Cash in Hand",
  petty: "Petty Cash",
};

const initialTransactionsByAccount: Record<CashAccountView, CashTransactionRecord[]> = {
  main: [
    {
      id: "cash-main-1",
      mode: "add",
      title: "Opening Float",
      note: "Opening balance moved into the main cash drawer",
      amount: 180000,
      date: "2026-07-22",
      createdAt: "2026-07-22T08:00:00.000Z",
    },
    {
      id: "cash-main-2",
      mode: "add",
      title: "Sales Collection",
      note: "Cash sales collected from the showroom counter",
      amount: 48250,
      date: "2026-07-22",
      createdAt: "2026-07-22T11:20:00.000Z",
    },
    {
      id: "cash-main-3",
      mode: "reduce",
      title: "Cash (Supplier Payment)",
      note: "Supplier settlement from main cash",
      amount: 12600,
      date: "2026-07-21",
      createdAt: "2026-07-21T15:10:00.000Z",
    },
  ],
  petty: [
    {
      id: "cash-petty-1",
      mode: "add",
      title: "Petty Cash Top-up",
      note: "Transferred from main cash for daily office spending",
      amount: 8000,
      date: "2026-07-22",
      createdAt: "2026-07-22T09:10:00.000Z",
    },
    {
      id: "cash-petty-2",
      mode: "reduce",
      title: "Cash (Tea & Snacks)",
      note: "Office refreshments",
      amount: 650,
      date: "2026-07-22",
      createdAt: "2026-07-22T12:00:00.000Z",
    },
    {
      id: "cash-petty-3",
      mode: "reduce",
      title: "Cash (Stationery)",
      note: "Printer paper and pens",
      amount: 1350,
      date: "2026-07-21",
      createdAt: "2026-07-21T16:40:00.000Z",
    },
  ],
};

const defaultColumnFilter: ColumnFilterValue = {
  operator: "contains",
  value: "",
};

function getInitialTransactions(mode: "mock" | "demo" | "api", view: CashAccountView) {
  return mode === "demo" || mode === "mock" ? initialTransactionsByAccount[view] : [];
}

function isSeedTransactionSet(mode: "mock" | "demo" | "api", view: CashAccountView, transactions: CashTransactionRecord[]) {
  if (mode !== "api" || transactions.length !== initialTransactionsByAccount[view].length) {
    return false;
  }

  const seedIds = new Set(initialTransactionsByAccount[view].map((transaction) => transaction.id));
  return transactions.every((transaction) => seedIds.has(transaction.id));
}

function buildDefaultDraft(): CashAdjustmentDraft {
  return {
    mode: "add",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    note: "",
    counterLedgerId: "",
    counterLedgerName: "",
  };
}

function buildVoucherLine(ledger: string, description: string, debit: number, credit: number, accountId?: string): VoucherLine {
  return {
    id: crypto.randomUUID(),
    accountId,
    ledger,
    description,
    debit,
    credit,
    costCenter: "Head Office",
    project: "Trading",
    billReference: "",
  };
}

function buildCashVoucherInput({
  workspaceId,
  accountView,
  mode,
  amount,
  date,
  note,
  counterLedgerId,
  counterLedgerName,
}: {
  workspaceId: string;
  accountView: CashAccountView;
  mode: CashAdjustmentMode;
  amount: number;
  date: string;
  note: string;
  counterLedgerId: string;
  counterLedgerName: string;
}): VoucherFormInput {
  const cashLedger = cashLedgerByAccount[accountView];
  const trimmedNote = note.trim();
  // A manual cash adjustment is a ledger-to-ledger journal entry, not a customer
  // receipt or supplier expense. Using receipt/expense here incorrectly triggers
  // party-master validation even though the counter side is an account ledger.
  const voucherType: VoucherType = "journal";
  const counterLedger = counterLedgerName.trim();
  const narration =
    trimmedNote || (mode === "add" ? `${cashLedger} cash received` : `${cashLedger} cash paid`);

  return {
    workspaceId,
    voucherType,
    voucherDate: date,
    partyName: "",
    narration,
    reference: "",
    status: "posted",
    settlementMode: "cash",
    totalAmount: amount,
    lines:
      mode === "add"
        ? [
            buildVoucherLine(cashLedger, narration, amount, 0),
            buildVoucherLine(counterLedger, narration, 0, amount, counterLedgerId),
          ]
        : [
            buildVoucherLine(counterLedger, narration, amount, 0, counterLedgerId),
            buildVoucherLine(cashLedger, narration, 0, amount),
          ],
  };
}

function mapVoucherToCashTransaction(voucher: VoucherRecord, accountView: CashAccountView): CashTransactionRecord | null {
  const cashLedger = cashLedgerByAccount[accountView].toLowerCase();
  const cashLine = voucher.lines.find((line) => line.ledger.trim().toLowerCase() === cashLedger);
  if (!cashLine) {
    return null;
  }

  const debit = Number(cashLine.debit || 0);
  const credit = Number(cashLine.credit || 0);
  // A voucher can contain several settlement lines.  The cash ledger must only
  // reflect its own posting, never the voucher's full amount.
  const amount = Math.max(debit, credit);
  if (amount <= 0) {
    return null;
  }

  const mode: CashAdjustmentMode = debit >= credit ? "add" : "reduce";
  return {
    id: voucher.id,
    mode,
    title: voucher.partyName || buildTransactionTitle(mode, voucher.narration || voucher.particulars),
    note: voucher.narration || voucher.particulars || "",
    amount,
    date: voucher.voucherDate,
    createdAt: voucher.createdAt || voucher.voucherDate,
    cashLedger: cashLedgerByAccount[accountView],
    voucher,
  };
}

function normalizeAmount(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim() || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCashAmount(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value));
}

function formatCashTableAmount(value: number) {
  return `${new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value))} ${currencySymbol}`;
}

function getTransactionTypeLabel(mode: CashAdjustmentMode) {
  return mode === "add" ? "Cash Increase" : "Expense";
}

function buildTransactionTitle(mode: CashAdjustmentMode, note: string) {
  const trimmedNote = note.trim();
  if (trimmedNote) {
    return mode === "add" ? trimmedNote : `Cash (${trimmedNote})`;
  }

  return mode === "add" ? "" : "Cash Adjustment";
}

function getSignedTransactionAmount(transaction: CashTransactionRecord) {
  return transaction.mode === "add" ? transaction.amount : -transaction.amount;
}

function getTransactionDisplayName(transaction: CashTransactionRecord) {
  return transaction.mode === "add" && !transaction.note ? "" : transaction.title;
}

function getPostingLedgers(transaction: CashTransactionRecord, side: "debit" | "credit") {
  const lines = transaction.voucher?.lines ?? [];
  const names = lines
    .filter((line) => Number(side === "debit" ? line.debit : line.credit) > 0)
    .map((line) => line.ledger.trim())
    .filter(Boolean);

  if (names.length) {
    return Array.from(new Set(names)).join(", ");
  }

  if (side === "debit") {
    return transaction.mode === "add" ? (transaction.cashLedger || "Cash Account") : "Unassigned Ledger";
  }
  return transaction.mode === "reduce" ? (transaction.cashLedger || "Cash Account") : "Owner's Capital";
}

function getTransactionNarration(transaction: CashTransactionRecord) {
  return transaction.voucher?.narration
    || transaction.voucher?.particulars
    || transaction.note
    || getTransactionDisplayName(transaction)
    || "-";
}

function getColumnValue(transaction: CashTransactionRecord, columnId: FilterableColumnId) {
  switch (columnId) {
    case "date":
      return `${transaction.date} ${formatDate(transaction.date)}`;
    case "narration":
      return getTransactionNarration(transaction);
    case "debitLedger":
      return getPostingLedgers(transaction, "debit");
    case "creditLedger":
      return getPostingLedgers(transaction, "credit");
    case "cashIn":
      return transaction.mode === "add" ? `${transaction.amount} ${formatCashTableAmount(transaction.amount)}` : "";
    case "cashOut":
      return transaction.mode === "reduce" ? `${transaction.amount} ${formatCashTableAmount(transaction.amount)}` : "";
    default:
      return `${transaction.amount} ${formatCashTableAmount(transaction.amount)}`;
  }
}

function matchesColumnFilter(value: string, filter: ColumnFilterValue) {
  const haystack = value.trim().toLowerCase();
  const needle = filter.value.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  if (filter.operator === "equals") {
    return haystack === needle;
  }

  if (filter.operator === "starts-with") {
    return haystack.startsWith(needle);
  }

  return haystack.includes(needle);
}

function columnFilterLabel(columnId: FilterableColumnId) {
  const labels: Record<FilterableColumnId, string> = {
    date: "Date",
    narration: "Narration",
    debitLedger: "Debit Ledger",
    creditLedger: "Credit Ledger",
    cashIn: "Cash In",
    cashOut: "Cash Out",
  };
  return labels[columnId];
}

function resolveCashAccountView(value: string | null): CashAccountView {
  return value === "petty" ? "petty" : "main";
}

function getCashAccountConfig(view: CashAccountView): CashAccountConfig {
  if (view === "petty") {
    return {
      title: "Petty Cash",
      badge: "Daily Expense Float",
      accentText: "#cf670f",
      accentSurface: "#fff7ef",
      accentBorder: "#f0c9a4",
      headerBackground: "linear-gradient(135deg, rgba(255,247,239,0.96), rgba(255,255,255,0.94))",
      buttonShadow: "0 14px 30px rgba(230, 120, 23, 0.22)",
    };
  }

  return {
    title: "Main Cash",
    badge: "Primary Cash Ledger",
    accentText: "#cf670f",
    accentSurface: "#fff7ef",
    accentBorder: "#f0c9a4",
    headerBackground: "linear-gradient(135deg, rgba(255,247,239,0.96), rgba(255,255,255,0.94))",
    buttonShadow: "0 14px 30px rgba(230, 120, 23, 0.22)",
  };
}

export function CashInHandScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, session } = useSessionContext();
  const ledgerQuery = usePostableLedgersQuery(mode === "api");
  const activeLedgerNames = useMemo(
    () => new Set((ledgerQuery.data ?? []).filter((ledger) => ledger.status === "ACTIVE").map((ledger) => ledger.name.trim().toLowerCase())),
    [ledgerQuery.data],
  );
  const counterLedgerOptions = useMemo(
    () => (ledgerQuery.data ?? []).filter((ledger) => ledger.status === "ACTIVE" && ledger.name !== cashLedgerByAccount[resolveCashAccountView(searchParams.get("account"))]),
    [ledgerQuery.data, searchParams],
  );
  const createRequestRef = useRef("");
  const dateRangeInitializedRef = useRef("");
  const columnFilterPopoverRef = useRef<HTMLDivElement | null>(null);
  const cashAccountView = resolveCashAccountView(searchParams.get("account"));
  const cashAccountConfig = getCashAccountConfig(cashAccountView);
  const cashAccountTitle = cashAccountConfig.title;
  const [transactions, setTransactions] = useState<CashTransactionRecord[]>([]);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashSaving, setCashSaving] = useState(false);
  const [deleteTransactionId, setDeleteTransactionId] = useState<string | null>(null);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [clearLedgerDialogOpen, setClearLedgerDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustDialogScope, setAdjustDialogScope] = useState<"full" | "add-only">("full");
  const [draft, setDraft] = useState<CashAdjustmentDraft>(() => buildDefaultDraft());
  const [dateSortDirection, setDateSortDirection] = useState<"desc" | "asc">("asc");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<FilterableColumnId, ColumnFilterValue>>>({});
  const [columnFilterPopover, setColumnFilterPopover] = useState<ColumnFilterPopoverState | null>(null);
  const [columnFilterDraft, setColumnFilterDraft] = useState<ColumnFilterValue>(defaultColumnFilter);
  const [headerActionMenuOpen, setHeaderActionMenuOpen] = useState(false);
  const [tableActionMenuOpen, setTableActionMenuOpen] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [historyTransactionId, setHistoryTransactionId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setSelectedTransactionIds([]);
    setBulkDeleteDialogOpen(false);
    setTableActionMenuOpen(false);
  }, [cashAccountView]);

  useEffect(() => {
    const workspaceId = session?.workspaceId;
    if (!workspaceId) {
      setTransactions([]);
      return;
    }

    let cancelled = false;
    setCashLoading(true);

    listDayBook(mode, { workspaceId })
      .then((vouchers) => {
        if (cancelled) {
          return;
        }

        const nextTransactions = vouchers
          .filter((voucher) => mode !== "api" || !voucher.lines.some(
            (line) => line.ledger === "Office Expense" && !activeLedgerNames.has("office expense"),
          ))
          .map((voucher) => mapVoucherToCashTransaction(voucher, cashAccountView))
          .filter((transaction): transaction is CashTransactionRecord => Boolean(transaction));

        setTransactions(nextTransactions.length ? nextTransactions : getInitialTransactions(mode, cashAccountView));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setTransactions(getInitialTransactions(mode, cashAccountView));
        toast.error(error instanceof Error ? error.message : "Cash ledger could not be loaded");
      })
      .finally(() => {
        if (!cancelled) {
          setCashLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeLedgerNames, cashAccountView, mode, session?.workspaceId]);

  useEffect(() => {
    const range = getLatestPostingMonthRange(transactions.map((transaction) => transaction.date));
    if (!range) return;
    const initializationKey = `${cashAccountView}:${range.to}`;
    if (dateRangeInitializedRef.current === initializationKey) return;
    setDateFrom(range.from);
    setDateTo(range.to);
    dateRangeInitializedRef.current = initializationKey;
  }, [cashAccountView, transactions]);

  useEffect(() => {
    if (typeof window === "undefined" || mode !== "api") {
      return;
    }

    const legacyStorageKey = `bizovix:cash-in-hand:${mode}:${session?.workspaceId ?? "default"}:${cashAccountView}`;
    const raw = window.localStorage.getItem(legacyStorageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as CashTransactionRecord[];
      if (Array.isArray(parsed) && isSeedTransactionSet(mode, cashAccountView, parsed)) {
        window.localStorage.removeItem(legacyStorageKey);
        return;
      }
    } catch {
      window.localStorage.removeItem(legacyStorageKey);
    }
  }, [cashAccountView, mode, session?.workspaceId]);

  useEffect(() => {
    const createValue = searchParams.get("create");
    if (createValue !== "1" && createValue !== "true") {
      return;
    }

    const requestKey = `cash-in-hand:${searchParams.get("open") ?? "initial"}`;
    if (createRequestRef.current === requestKey) {
      return;
    }

    openAdjustDialog("add");
    createRequestRef.current = requestKey;
  }, [searchParams]);

  useEffect(() => {
    if (!openActionMenuId && !headerActionMenuOpen && !tableActionMenuOpen) {
      return;
    }

    function handleMenuPointerDown(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-cash-row-menu]") || target?.closest("[data-cash-header-menu]") || target?.closest("[data-cash-table-menu]")) {
        return;
      }

      setOpenActionMenuId(null);
      setHeaderActionMenuOpen(false);
      setTableActionMenuOpen(false);
    }

    document.addEventListener("mousedown", handleMenuPointerDown);
    return () => document.removeEventListener("mousedown", handleMenuPointerDown);
  }, [headerActionMenuOpen, openActionMenuId, tableActionMenuOpen]);

  useEffect(() => {
    function closePopover() {
      setColumnFilterPopover(null);
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-cash-column-filter]")) {
        return;
      }

      setColumnFilterPopover(null);
    }

    window.addEventListener("scroll", closePopover, true);
    window.addEventListener("resize", closePopover);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("scroll", closePopover, true);
      window.removeEventListener("resize", closePopover);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    dateRangeInitializedRef.current = "";
    setQuery("");
    setDateFrom("");
    setDateTo("");
    setColumnFilters({});
    setColumnFilterPopover(null);
    setOpenActionMenuId(null);
    setEditingTransactionId(null);
    setHistoryTransactionId(null);
    setAdjustDialogOpen(false);
    setDraft(buildDefaultDraft());
  }, [cashAccountView]);

  const filteredTransactions = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return [...transactions]
      .filter((entry) => {
        if (dateFrom && entry.date < dateFrom) {
          return false;
        }
        if (dateTo && entry.date > dateTo) {
          return false;
        }
        if (needle) {
          const matchesQuery = [
            getTransactionNarration(entry),
            getPostingLedgers(entry, "debit"),
            getPostingLedgers(entry, "credit"),
            formatDate(entry.date),
          ].some((value) =>
            value.toLowerCase().includes(needle),
          );
          if (!matchesQuery) {
            return false;
          }
        }

        return Object.entries(columnFilters).every(([columnId, filter]) => {
          if (!filter) {
            return true;
          }

          return matchesColumnFilter(getColumnValue(entry, columnId as FilterableColumnId), filter);
        });
      })
      .sort((left, right) => {
        const dateDiff = new Date(left.date).getTime() - new Date(right.date).getTime();
        const createdDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        const diff = dateDiff === 0 ? createdDiff : dateDiff;
        return dateSortDirection === "asc" ? diff : -diff;
      });
  }, [columnFilters, dateFrom, dateSortDirection, dateTo, query, transactions]);

  const paginatedTransactions = useMemo(
    () => filteredTransactions.slice((page - 1) * pageSize, page * pageSize),
    [filteredTransactions, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [cashAccountView, columnFilters, dateFrom, dateTo, query, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [filteredTransactions.length, page, pageSize]);

  const currentBalance = useMemo(
    () => sumMoney(transactions.map((entry) => getSignedTransactionAmount(entry))),
    [transactions],
  );
  const runningBalanceByTransactionId = useMemo(() => {
    let balance = 0;
    const balances = new Map<string, number>();
    [...transactions]
      .sort((left, right) => {
        const dateDiff = new Date(left.date).getTime() - new Date(right.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      })
      .forEach((entry) => {
        balance = sumMoney([balance, getSignedTransactionAmount(entry)]);
        balances.set(entry.id, balance);
      });
    return balances;
  }, [transactions]);
  const filtersActive = Boolean(dateFrom || dateTo || query.trim()) || Object.values(columnFilters).some((filter) => filter?.value.trim());

  const editingTransaction = useMemo(
    () => transactions.find((entry) => entry.id === editingTransactionId) ?? null,
    [editingTransactionId, transactions],
  );

  const historyTransaction = useMemo(
    () => transactions.find((entry) => entry.id === historyTransactionId) ?? null,
    [historyTransactionId, transactions],
  );

  const previewBaseBalance = useMemo(() => {
    if (!editingTransaction) {
      return currentBalance;
    }

    return sumMoney([currentBalance, -getSignedTransactionAmount(editingTransaction)]);
  }, [currentBalance, editingTransaction]);

  const adjustedBalancePreview = useMemo(() => {
    const amount = roundMoney(normalizeAmount(draft.amount));
    return sumMoney([previewBaseBalance, draft.mode === "add" ? amount : -amount]);
  }, [draft.amount, draft.mode, previewBaseBalance]);

  function clearCreateQuery() {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (!nextParams.has("create") && !nextParams.has("open")) {
      return;
    }

    nextParams.delete("create");
    nextParams.delete("open");
    const nextQuery = nextParams.toString();
    const target = buildWorkspaceRoute(mode, "/utilities/cash-in-hand");
    router.replace(nextQuery ? `${target}?${nextQuery}` : `${target}?account=${cashAccountView}`, { scroll: false });
  }

  function openAdjustDialog(nextMode: CashAdjustmentMode, transaction?: CashTransactionRecord, scope: "full" | "add-only" = "full") {
    const cashLedgerName = cashLedgerByAccount[cashAccountView].toLowerCase();
    const existingCounterLine = transaction?.voucher?.lines.find((line) => line.ledger.trim().toLowerCase() !== cashLedgerName);
    const existingCounterLedger = counterLedgerOptions.find(
      (ledger) => ledger.id === existingCounterLine?.accountId || ledger.name.trim().toLowerCase() === existingCounterLine?.ledger.trim().toLowerCase(),
    );
    setEditingTransactionId(transaction?.id ?? null);
    setAdjustDialogScope(transaction ? "full" : scope);
    setDraft(
      transaction
        ? {
            mode: transaction.mode,
            amount: String(transaction.amount),
            date: transaction.date,
            note: transaction.note,
            counterLedgerId: existingCounterLedger?.id ?? "",
            counterLedgerName: existingCounterLedger?.name ?? "",
          }
        : {
            mode: nextMode,
            amount: "",
            date: new Date().toISOString().slice(0, 10),
            note: "",
            counterLedgerId: "",
            counterLedgerName: "",
          },
    );
    setAdjustDialogOpen(true);
    setOpenActionMenuId(null);
  }

  function closeAdjustDialog(nextOpen = false) {
    setAdjustDialogOpen(nextOpen);
    if (!nextOpen) {
      setDraft(buildDefaultDraft());
      setEditingTransactionId(null);
      setAdjustDialogScope("full");
      clearCreateQuery();
    }
  }

  async function refreshCashTransactions() {
    if (!session?.workspaceId) {
      setTransactions([]);
      return;
    }

    const vouchers = await listDayBook(mode, { workspaceId: session.workspaceId });
    setTransactions(
      vouchers
        .filter((voucher) => mode !== "api" || !voucher.lines.some(
          (line) => line.ledger === "Office Expense" && !activeLedgerNames.has("office expense"),
        ))
        .map((voucher) => mapVoucherToCashTransaction(voucher, cashAccountView))
        .filter((transaction): transaction is CashTransactionRecord => Boolean(transaction)),
    );
  }

  async function handleSaveAdjustment() {
    const amount = normalizeAmount(draft.amount);
    if (amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    if (!session?.workspaceId) {
      toast.error("Active workspace not found");
      return;
    }

    const selectedCounterLedger = counterLedgerOptions.find(
      (ledger) => ledger.id === draft.counterLedgerId && ledger.name === draft.counterLedgerName,
    );
    if (mode === "api" && !selectedCounterLedger) {
      toast.error("Select an active counter ledger from the Chart of Accounts");
      return;
    }

    if (draft.mode === "reduce" && amount > previewBaseBalance) {
      toast.error("Reduce amount cannot exceed current cash balance");
      return;
    }

    const input = buildCashVoucherInput({
      workspaceId: session.workspaceId,
      accountView: cashAccountView,
      mode: draft.mode,
      amount,
      date: draft.date,
      note: draft.note,
      counterLedgerId: selectedCounterLedger?.id ?? draft.counterLedgerId,
      counterLedgerName: selectedCounterLedger?.name ?? draft.counterLedgerName,
    });

    setCashSaving(true);
    try {
      if (editingTransactionId) {
        await updateVoucher(mode, editingTransactionId, input);
      } else {
        await createVoucher(mode, input);
      }

      await refreshCashTransactions();
      toast.success(
        editingTransactionId
          ? "Cash voucher updated"
          : draft.mode === "add"
            ? "Cash voucher posted"
            : "Cash payment voucher posted",
      );
      closeAdjustDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cash voucher could not be saved");
    } finally {
      setCashSaving(false);
    }
  }

  function handleDeleteTransaction(transactionId: string) {
    setDeleteTransactionId(transactionId);
    setOpenActionMenuId(null);
  }

  async function confirmDeleteTransaction() {
    const transactionId = deleteTransactionId;
    if (!transactionId) {
      return;
    }

    if (!session?.workspaceId) {
      toast.error("Active workspace not found");
      setDeleteTransactionId(null);
      return;
    }

    setDeleteTransactionId(null);
    setCashSaving(true);
    try {
      await deleteVoucher(mode, transactionId, session.workspaceId);

      await refreshCashTransactions();
      setOpenActionMenuId(null);
      toast.success("Cash voucher removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cash voucher could not be removed");
    } finally {
      setCashSaving(false);
    }
  }

  async function confirmBulkDeleteTransactions() {
    if (!session?.workspaceId || !selectedTransactionIds.length) return;
    const ids = [...selectedTransactionIds];
    setBulkDeleteDialogOpen(false);
    setCashSaving(true);
    try {
      for (const transactionId of ids) {
        await deleteVoucher(mode, transactionId, session.workspaceId);
      }
      setSelectedTransactionIds([]);
      await refreshCashTransactions();
      toast.success(`${ids.length} cash transactions removed`);
    } catch (error) {
      await refreshCashTransactions();
      toast.error(error instanceof Error ? error.message : "Selected cash transactions could not be removed");
    } finally {
      setCashSaving(false);
    }
  }

  function handlePrintTransaction(transaction: CashTransactionRecord) {
    const printWindow = openPrintWindow("width=720,height=680");
    if (!printWindow) {
      toast.error("Allow popups to print transaction details");
      return;
    }

    const displayName = getTransactionDisplayName(transaction) || "Cash Increase";
    printWindow.document.write(`
      <html>
        <head>
          <title>Cash Transaction Print</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #1f3253; }
            h1 { margin: 0 0 24px; font-size: 28px; }
            .grid { display: grid; grid-template-columns: 180px 1fr; gap: 12px 18px; }
            .label { color: #6d7b94; font-weight: 600; }
            .value { font-weight: 600; }
          </style>
        </head>
        <body>
          <h1>Cash In Hand Transaction</h1>
          <div class="grid">
            <div class="label">Type</div><div class="value">${getTransactionTypeLabel(transaction.mode)}</div>
            <div class="label">Name</div><div class="value">${displayName}</div>
            <div class="label">Amount</div><div class="value">${formatCashTableAmount(transaction.amount)}</div>
            <div class="label">Date</div><div class="value">${formatDate(transaction.date)}</div>
            <div class="label">Description</div><div class="value">${transaction.note || "-"}</div>
            <div class="label">Created At</div><div class="value">${formatDateTime(transaction.createdAt)}</div>
          </div>
        </body>
      </html>
    `);
    printWindowWhenReady(printWindow);
    setOpenActionMenuId(null);
  }

  function handlePrintLedger() {
    const printWindow = openPrintWindow("width=920,height=720");
    if (!printWindow) {
      toast.error("Allow popups to print the cash ledger");
      return;
    }

    const rows = filteredTransactions
      .map((entry, index) => {
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${formatDate(entry.date)}</td>
            <td>${getTransactionNarration(entry)}</td>
            <td>${getPostingLedgers(entry, "debit")}</td>
            <td>${getPostingLedgers(entry, "credit")}</td>
            <td class="amount-positive">${entry.mode === "add" ? formatCashTableAmount(entry.amount) : "-"}</td>
            <td class="amount-negative">${entry.mode === "reduce" ? formatCashTableAmount(entry.amount) : "-"}</td>
            <td>${formatCashTableAmount(runningBalanceByTransactionId.get(entry.id) ?? 0)}</td>
          </tr>
        `;
      })
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>${cashAccountTitle} Ledger</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 32px; color: #17233c; font-family: Arial, sans-serif; }
            .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #17233c; padding-bottom: 16px; }
            .company { font-size: 22px; font-weight: 700; }
            .subtitle { margin-top: 4px; color: #5d6c86; font-size: 13px; }
            .meta { text-align: right; color: #34445f; font-size: 13px; line-height: 1.7; }
            .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 22px 0; }
            .box { border: 1px solid #d7dfeb; border-radius: 10px; padding: 12px; }
            .label { color: #6d7b94; font-size: 12px; }
            .value { margin-top: 6px; font-size: 18px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d7dfeb; padding: 9px 10px; text-align: left; vertical-align: top; }
            th { background: #f3f6fb; color: #24365a; font-weight: 700; }
            td:last-child, th:last-child { text-align: right; }
            .amount-positive { color: #047857; font-weight: 700; }
            .amount-negative { color: #dc2626; font-weight: 700; }
            .empty { border: 1px dashed #cbd5e1; border-radius: 10px; padding: 24px; text-align: center; color: #64748b; }
            .footer { display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px; margin-top: 56px; font-size: 12px; color: #34445f; }
            .signature { border-top: 1px solid #17233c; padding-top: 8px; text-align: center; }
            @media print { body { padding: 18mm; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="company">Bizovix ERP</div>
              <div class="subtitle">${cashAccountTitle} ledger statement</div>
            </div>
            <div class="meta">
              <div>Printed: ${formatDateTime(new Date())}</div>
              <div>Account: ${cashAccountTitle}</div>
              <div>Rows: ${filteredTransactions.length}</div>
            </div>
          </div>
          <div class="summary">
            <div class="box"><div class="label">Current Balance</div><div class="value">${formatCashAmount(currentBalance)}</div></div>
            <div class="box"><div class="label">Total In</div><div class="value">${formatCashAmount(sumMoney(transactions.filter((entry) => entry.mode === "add").map((entry) => entry.amount)))}</div></div>
            <div class="box"><div class="label">Total Out</div><div class="value">${formatCashAmount(sumMoney(transactions.filter((entry) => entry.mode === "reduce").map((entry) => entry.amount)))}</div></div>
          </div>
          ${
            filteredTransactions.length
              ? `<table>
                  <thead><tr><th>#</th><th>Date</th><th>Narration</th><th>Debit Ledger</th><th>Credit Ledger</th><th>Cash In</th><th>Cash Out</th><th>Current Balance</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>`
              : `<div class="empty">No ${cashAccountTitle.toLowerCase()} transactions to print.</div>`
          }
          <div class="footer">
            <div class="signature">Prepared By</div>
            <div class="signature">Checked By</div>
            <div class="signature">Authorized By</div>
          </div>
        </body>
      </html>
    `);
    printWindowWhenReady(printWindow);
    setHeaderActionMenuOpen(false);
  }

  function handleViewHistory(transactionId: string) {
    setHistoryTransactionId(transactionId);
    setOpenActionMenuId(null);
  }

  function handleExportTransactions() {
    if (!filteredTransactions.length) {
      toast.message(`No ${cashAccountTitle.toLowerCase()} transactions to export`);
      setHeaderActionMenuOpen(false);
      return;
    }

    downloadCsv(
      `${cashAccountView}-cash-transactions.csv`,
      filteredTransactions.map((entry) => ({
        Date: formatDate(entry.date),
        Narration: getTransactionNarration(entry),
        "Debit Ledger": getPostingLedgers(entry, "debit"),
        "Credit Ledger": getPostingLedgers(entry, "credit"),
        "Cash In": entry.mode === "add" ? entry.amount : 0,
        "Cash Out": entry.mode === "reduce" ? entry.amount : 0,
        "Current Balance": runningBalanceByTransactionId.get(entry.id) ?? 0,
      })),
    );
    setHeaderActionMenuOpen(false);
    toast.success(`${cashAccountTitle} transactions exported`);
  }

  useEffect(() => {
    const exportHandler = () => handleExportTransactions();
    window.addEventListener("erp-export-request", exportHandler);
    return () => window.removeEventListener("erp-export-request", exportHandler);
  }, [filteredTransactions, cashAccountTitle, cashAccountView]);

  function handleClearFilters() {
    setQuery("");
    setDateFrom("");
    setDateTo("");
    setColumnFilters({});
    setColumnFilterPopover(null);
    setHeaderActionMenuOpen(false);
    toast.success("Cash filters cleared");
  }

  function handleClearLedger() {
    if (!transactions.length) {
      toast.message(`${cashAccountTitle} is already empty`);
      setHeaderActionMenuOpen(false);
      return;
    }

    setClearLedgerDialogOpen(true);
  }

  async function confirmClearLedger() {
    setClearLedgerDialogOpen(false);

    if (!session?.workspaceId) {
      toast.error("Active workspace not found");
      return;
    }

    setCashSaving(true);
    try {
      for (const transaction of transactions) {
        await deleteVoucher(mode, transaction.id, session.workspaceId);
      }

      await refreshCashTransactions();
      setHeaderActionMenuOpen(false);
      toast.success(`${cashAccountTitle} ledger cleared`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${cashAccountTitle} ledger could not be cleared`);
    } finally {
      setCashSaving(false);
    }
  }

  function openColumnFilter(columnId: FilterableColumnId, event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    if (columnFilterPopover?.columnId === columnId) {
      setColumnFilterPopover(null);
      return;
    }

    const current = columnFilters[columnId] ?? defaultColumnFilter;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const popoverWidth = 260;
    const maxLeft = Math.max(16, viewportWidth - popoverWidth - 16);
    const centeredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const preferredLeft = rect.right + popoverWidth > viewportWidth - 16 ? rect.right - popoverWidth : centeredLeft;
    setColumnFilterDraft(current);
    setColumnFilterPopover({
      columnId,
      left: Math.min(Math.max(16, preferredLeft), maxLeft),
      top: rect.bottom + 8,
    });
  }

  function applyColumnFilter() {
    if (!columnFilterPopover) {
      return;
    }

    setColumnFilters((current) => {
      const next = { ...current };
      if (!columnFilterDraft.value.trim()) {
        delete next[columnFilterPopover.columnId];
      } else {
        next[columnFilterPopover.columnId] = { ...columnFilterDraft };
      }
      return next;
    });
    setColumnFilterPopover(null);
  }

  const deleteTargetTransaction = transactions.find((item) => item.id === deleteTransactionId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConfirmationDialog
        open={Boolean(deleteTransactionId)}
        onOpenChange={(open) => setDeleteTransactionId(open ? deleteTransactionId : null)}
        title="Remove this transaction?"
        description={`${deleteTargetTransaction?.title || "This cash transaction"} will be removed from the ${cashAccountTitle} ledger. This cannot be undone.`}
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => void confirmDeleteTransaction()}
      />
      <ConfirmationDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        title={`Remove ${selectedTransactionIds.length} selected transactions?`}
        description={`The selected ${cashAccountTitle.toLowerCase()} ledger entries will be removed or reversed. This cannot be undone.`}
        confirmLabel="Remove selected"
        tone="danger"
        onConfirm={() => void confirmBulkDeleteTransactions()}
      />
      <ConfirmationDialog
        open={clearLedgerDialogOpen}
        onOpenChange={setClearLedgerDialogOpen}
        title="Clear the entire ledger?"
        description={`All ${cashAccountTitle.toLowerCase()} transactions will be removed. This cannot be undone.`}
        confirmLabel="Clear Ledger"
        tone="danger"
        onConfirm={() => void confirmClearLedger()}
      />
      <m.div
        key={cashAccountView}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="flex min-h-0 flex-1 flex-col rounded-[6px] border border-[#d7dfeb] bg-white"
      >
        <div
          className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[#d7dfeb] px-3 py-1.5"
          style={{ background: cashAccountConfig.headerBackground }}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-semibold text-[#24365a]">{cashAccountTitle}</h1>
              <span
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
                style={{
                  color: cashAccountConfig.accentText,
                  backgroundColor: cashAccountConfig.accentSurface,
                  borderColor: cashAccountConfig.accentBorder,
                }}
              >
                {cashAccountConfig.badge}
              </span>
              <span className="text-[15px] font-semibold" style={{ color: cashAccountConfig.accentText }}>
                {formatCashAmount(currentBalance)}
              </span>
            </div>
          </div>

          <div className="absolute right-3 top-[calc(100%+5px)] z-20 flex items-center justify-end gap-2">
            <div className="inline-flex items-center rounded-full border border-[#d7dfeb] bg-white p-1 shadow-[0_10px_22px_rgba(15,23,42,0.06)]">
              {([
                { value: "main", label: "Main Cash" },
                { value: "petty", label: "Petty Cash" },
              ] as const).map((option) => {
                const active = cashAccountView === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-semibold transition",
                      active ? "bg-primary text-white shadow-[0_10px_24px_rgba(230,120,23,0.18)]" : "text-[#6f7f98] hover:bg-[#fff7ef] hover:text-primary",
                    )}
                    onClick={() =>
                      router.push(`${buildWorkspaceRoute(mode, "/utilities/cash-in-hand")}?account=${option.value}`, { scroll: false })
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d6dfeb] bg-white text-[#334155] hover:border-[#c3cfdd] hover:bg-[#f4f7fb]"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
            </button>
            <div className="relative inline-flex" data-cash-header-menu>
              <button
                type="button"
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d6dfeb] bg-white text-[#334155] hover:border-[#c3cfdd] hover:bg-[#f4f7fb]",
                  headerActionMenuOpen ? "bg-[#eef3f8] ring-2 ring-[#94a3b8]/20" : "",
                )}
                aria-label={`${cashAccountTitle} actions`}
                aria-expanded={headerActionMenuOpen}
                onClick={() => {
                  setHeaderActionMenuOpen((current) => !current);
                  setOpenActionMenuId(null);
                }}
                disabled={cashSaving}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {headerActionMenuOpen ? (
                <div className="absolute right-0 top-10 z-30 min-w-[220px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_18px_42px_rgba(15,23,42,0.14)]">
                  <RowActionButton icon={Plus} label={`Adjust ${cashAccountTitle}`} onClick={() => openAdjustDialog("add", undefined, "full")} disabled={cashSaving} />
                  <RowActionButton icon={Printer} label="Print Ledger" onClick={handlePrintLedger} />
                  <RowActionButton icon={Download} label="Export Transactions" onClick={handleExportTransactions} disabled={cashLoading} />
                  <RowActionButton icon={Filter} label="Clear Filters" onClick={handleClearFilters} />
                  <RowActionButton icon={ListRestart} label="Clear Ledger" danger onClick={handleClearLedger} disabled={cashSaving} />
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(230,120,23,0.18)] hover:bg-[#cf670f]"
              onClick={() => openAdjustDialog("add")}
            >
              <Wallet className="h-3.5 w-3.5" />
              Adjust {cashAccountTitle}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-0 py-0">
          <div className="flex min-h-[46px] items-center justify-between border-b border-[#d7dfeb] px-3 py-1.5">
            <div className="flex items-center gap-1.5 text-[15px] font-semibold text-[#24365a]"><ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />Transactions</div>
          </div>

          <div className="flex flex-wrap items-end gap-2 border-b border-[#d7dfeb] bg-[#f8fafc] px-3 py-1.5">
            <label className="w-full sm:w-[340px]">
              <span className="sr-only">Search cash transactions</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7b8aa2]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search narration or ledger..."
                  className="h-8 rounded-[7px] border-[#ced8e6] bg-white pl-9 text-[12px]"
                />
              </div>
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#718096]">From Date</span>
              <AppDateInput
                value={dateFrom}
                max={dateTo || undefined}
                onChange={setDateFrom}
                className="w-[150px]"
                inputClassName="h-8 rounded-[7px] border-[#ced8e6] bg-white text-[11px]"
                aria-label="Cash transactions from date"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#718096]">To Date</span>
              <AppDateInput
                value={dateTo}
                min={dateFrom || undefined}
                onChange={setDateTo}
                className="w-[150px]"
                inputClassName="h-8 rounded-[7px] border-[#ced8e6] bg-white text-[11px]"
                aria-label="Cash transactions to date"
              />
            </label>
            {filtersActive ? (
              <Button type="button" variant="outline" className="h-8 rounded-[7px] px-3 text-[11px]" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white text-[#5d6c86]">
                <tr>
                  <th className="w-[42px] border-b border-[#d7dfeb] px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all transactions on this page"
                      checked={paginatedTransactions.length > 0 && paginatedTransactions.every((entry) => selectedTransactionIds.includes(entry.id))}
                      onChange={(event) => {
                        const pageIds = paginatedTransactions.map((entry) => entry.id);
                        setSelectedTransactionIds((current) => event.target.checked
                          ? Array.from(new Set([...current, ...pageIds]))
                          : current.filter((id) => !pageIds.includes(id)));
                      }}
                    />
                  </th>
                  <TableHeader
                    label="Date"
                    sortDirection={dateSortDirection}
                    onSort={() => setDateSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                    filterActive={Boolean(columnFilters.date?.value.trim())}
                    onFilter={(event) => openColumnFilter("date", event)}
                  />
                  <TableHeader
                    label="Narration"
                    filterActive={Boolean(columnFilters.narration?.value.trim())}
                    onFilter={(event) => openColumnFilter("narration", event)}
                  />
                  <TableHeader
                    label="Debit Ledger"
                    filterActive={Boolean(columnFilters.debitLedger?.value.trim())}
                    onFilter={(event) => openColumnFilter("debitLedger", event)}
                  />
                  <TableHeader
                    label="Credit Ledger"
                    filterActive={Boolean(columnFilters.creditLedger?.value.trim())}
                    onFilter={(event) => openColumnFilter("creditLedger", event)}
                  />
                  <TableHeader
                    label="Cash In"
                    filterActive={Boolean(columnFilters.cashIn?.value.trim())}
                    onFilter={(event) => openColumnFilter("cashIn", event)}
                  />
                  <TableHeader
                    label="Cash Out"
                    filterActive={Boolean(columnFilters.cashOut?.value.trim())}
                    onFilter={(event) => openColumnFilter("cashOut", event)}
                  />
                  <th className="whitespace-nowrap border-b border-[#d7dfeb] px-2 py-2 text-right text-[12px] font-semibold">Current Balance</th>
                  <th className="relative w-[56px] border-b border-[#d7dfeb] px-2 py-2 text-right font-semibold">
                    <div className="relative ml-auto inline-flex" data-cash-table-menu>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center text-[#334155] transition hover:text-primary"
                        aria-label="More actions"
                        title="More actions"
                        onClick={() => setTableActionMenuOpen((current) => !current)}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {tableActionMenuOpen ? (
                        <div className="absolute right-0 top-9 z-30 min-w-[210px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left normal-case shadow-[0_18px_42px_rgba(15,23,42,0.14)]">
                          <RowActionButton icon={Plus} label={`Adjust ${cashAccountTitle}`} onClick={() => { setTableActionMenuOpen(false); openAdjustDialog("add", undefined, "full"); }} disabled={cashSaving} />
                          <RowActionButton icon={Printer} label="Print Ledger" onClick={() => { setTableActionMenuOpen(false); handlePrintLedger(); }} />
                          <RowActionButton icon={Download} label="Export Transactions" onClick={() => { setTableActionMenuOpen(false); handleExportTransactions(); }} disabled={cashLoading} />
                          <RowActionButton icon={Filter} label="Clear Filters" onClick={() => { setTableActionMenuOpen(false); handleClearFilters(); }} />
                          <RowActionButton icon={Trash2} label={`Delete selected${selectedTransactionIds.length ? ` (${selectedTransactionIds.length})` : ""}`} danger onClick={() => { setTableActionMenuOpen(false); setBulkDeleteDialogOpen(true); }} disabled={!selectedTransactionIds.length || cashSaving} />
                        </div>
                      ) : null}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cashLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-14 text-center text-sm text-[#6f7f98]">
                      Loading {cashAccountTitle.toLowerCase()} ledger...
                    </td>
                  </tr>
                ) : filteredTransactions.length ? (
                  paginatedTransactions.map((entry) => {
                    const displayName = getTransactionDisplayName(entry);

                    return (
                      <tr
                        key={entry.id}
                        className="cursor-pointer border-b border-[#edf1f7] bg-white transition last:border-b-0 hover:bg-[#f7fbff]"
                        tabIndex={0}
                        onClick={() => handleViewHistory(entry.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleViewHistory(entry.id);
                          }
                        }}
                      >
                        <td className="w-[42px] border-r border-[#edf1f7] px-2 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${displayName || "cash transaction"}`}
                            checked={selectedTransactionIds.includes(entry.id)}
                            onChange={(event) => setSelectedTransactionIds((current) => event.target.checked
                              ? [...current, entry.id]
                              : current.filter((id) => id !== entry.id))}
                          />
                        </td>
                        <td className="border-r border-[#edf1f7] px-2 py-2 text-[13px] font-medium text-[#10284b]">
                          {formatDate(entry.date)}
                        </td>
                        <td className="min-w-[230px] border-r border-[#edf1f7] px-2 py-2 text-[12px] leading-4 text-[#10284b]">{getTransactionNarration(entry)}</td>
                        <td className="min-w-[150px] border-r border-[#edf1f7] px-2 py-2 text-[12px] leading-4 text-[#10284b]">{getPostingLedgers(entry, "debit")}</td>
                        <td className="min-w-[150px] border-r border-[#edf1f7] px-2 py-2 text-[12px] leading-4 text-[#10284b]">{getPostingLedgers(entry, "credit")}</td>
                        <td className="whitespace-nowrap border-r border-[#edf1f7] px-2 py-2 text-right text-[13px] font-medium text-[#0f9f63]">
                          {entry.mode === "add" ? formatCashTableAmount(entry.amount) : "-"}
                        </td>
                        <td className="whitespace-nowrap border-r border-[#edf1f7] px-2 py-2 text-right text-[13px] font-medium text-[#ff5a5f]">
                          {entry.mode === "reduce" ? formatCashTableAmount(entry.amount) : "-"}
                        </td>
                        <td className="whitespace-nowrap border-r border-[#edf1f7] px-2 py-2 text-right text-[13px] font-semibold text-[#10284b]">
                          {formatCashTableAmount(runningBalanceByTransactionId.get(entry.id) ?? 0)}
                        </td>
                        <td className="px-2 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                          <div className="relative inline-flex" data-cash-row-menu>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6f7f98] hover:bg-white"
                              onClick={() => setOpenActionMenuId((current) => (current === entry.id ? null : entry.id))}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openActionMenuId === entry.id ? (
                              <div className="absolute right-0 top-10 z-20 min-w-[180px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                                <RowActionButton icon={Pencil} label="Edit" onClick={() => openAdjustDialog(entry.mode, entry)} disabled={cashSaving} />
                                <RowActionButton icon={Trash2} label="Delete" danger onClick={() => handleDeleteTransaction(entry.id)} disabled={cashSaving} />
                                <RowActionButton icon={Printer} label="Print" onClick={() => handlePrintTransaction(entry)} />
                                <RowActionButton icon={Eye} label="View Details" onClick={() => handleViewHistory(entry.id)} />
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-16">
                      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center px-6 py-8 text-center">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#fff7ef] text-primary">
                          <Filter className="h-5 w-5" />
                        </span>
                        <div className="mt-3 text-[15px] font-semibold text-[#24365a]">
                          {filtersActive ? "No matching transactions found" : `No ${cashAccountTitle.toLowerCase()} transactions yet`}
                        </div>
                        <div className="mt-1 text-sm leading-5 text-[#6f7f98]">
                          {filtersActive
                            ? "Try changing the search or clearing the active column filters."
                            : "Post a cash adjustment and it will appear in this ledger."}
                        </div>
                        {filtersActive ? (
                          <button
                            type="button"
                            className="mt-4 rounded-full border border-[#d6dfeb] bg-white px-4 py-2 text-sm font-semibold text-[#334155] hover:border-[#c3cfdd] hover:bg-[#f4f7fb]"
                            onClick={handleClearFilters}
                          >
                            Clear Filters
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalItems={filteredTransactions.length}
            pageSizeOptions={[10, 25, 50]}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            summary={
              filtersActive
                ? `${filteredTransactions.length} matching ${filteredTransactions.length === 1 ? "entry" : "entries"}`
                : `${filteredTransactions.length} ${filteredTransactions.length === 1 ? "entry" : "entries"}`
            }
            dense
            iconOnlyNavigation
          />
        </div>
      </m.div>

      <Dialog open={adjustDialogOpen} onOpenChange={closeAdjustDialog}>
        <DialogContent submitOnEnter className="w-[min(92vw,420px)] rounded-[14px] border border-[#d7dfeb] p-0">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveAdjustment();
            }}
          >
            <div className="border-b border-[#d7dfeb] px-4 py-4">
              <DialogTitle className="text-[20px] font-semibold text-[#3c4963]">
                {editingTransactionId ? "Edit Cash Entry" : "Adjust Cash"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Add or reduce your current cash balance and save the adjustment into the transaction register.
              </DialogDescription>
            </div>

            <div className="space-y-5 px-4 py-4">
              <div className="flex flex-wrap gap-6 text-[15px] text-[#4f5e79]">
                {(editingTransactionId || adjustDialogScope === "full"
                  ? [
                      { value: "add", label: "Add Cash" },
                      { value: "reduce", label: "Reduce Cash" },
                    ]
                  : [{ value: "add", label: `Add ${cashAccountTitle}` }]
                ).map((option) => (
                  <label key={option.value} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="cash-adjustment-mode"
                      checked={draft.mode === option.value}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          mode: option.value as CashAdjustmentMode,
                        }))
                      }
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>

              <label className="grid gap-2">
                <span className="text-sm text-[#6d7b94]">
                  Enter Amount<span className="text-[#ef4444]">*</span>
                </span>
                <Input
                  money
                  value={draft.amount}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  placeholder="0"
                  className="h-11 rounded-[10px] border-[#d8e0ee] text-[16px] text-[#24365a]"
                />
              </label>

              <div className="text-sm text-[#6d7b94]">
                Updated Cash:{" "}
                <span className={cn("font-medium", adjustedBalancePreview >= 0 ? "text-[#24365a]" : "text-[#dc2626]")}>
                  {formatCashAmount(adjustedBalancePreview)}
                </span>
              </div>

              <label className="grid gap-2">
                <span className="text-sm text-[#6d7b94]">
                  Counter Ledger<span className="text-[#ef4444]">*</span>
                </span>
                <select
                  value={draft.counterLedgerId}
                  onChange={(event) => {
                    const ledger = counterLedgerOptions.find((option) => option.id === event.target.value);
                    setDraft((current) => ({
                      ...current,
                      counterLedgerId: ledger?.id ?? "",
                      counterLedgerName: ledger?.name ?? "",
                    }));
                  }}
                  className="h-11 rounded-[10px] border border-[#d8e0ee] bg-white px-3 text-[15px] text-[#24365a] outline-none"
                >
                  <option value="">Select from Chart of Accounts</option>
                  {counterLedgerOptions.map((ledger) => (
                    <option key={ledger.id} value={ledger.id}>{ledger.name}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-[#6d7b94]">Adjustment Date</span>
                <AppDateInput
                  aria-label="Adjustment Date"
                  value={draft.date}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      date: value,
                    }))
                  }
                  inputClassName="h-11 rounded-[10px] border-[#d8e0ee] pr-10 text-[16px] text-[#24365a]"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-[#6d7b94]">Description</span>
                <Input
                  value={draft.note}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="Enter Description"
                  className="h-11 rounded-[10px] border-[#d8e0ee] text-[16px] text-[#24365a]"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 px-4 pb-4">
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-[#eef1f6] bg-[#f8fafc] px-5 py-2.5 text-sm font-semibold text-[#66748f] hover:bg-[#eef2f7]"
                onClick={() => closeAdjustDialog(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                data-enter-submit
                className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]"
                disabled={cashSaving}
              >
                <CheckCircle2 className="h-5 w-5" />
                {cashSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyTransaction)} onOpenChange={(open) => (!open ? setHistoryTransactionId(null) : null)}>
        <DialogContent className="w-[min(92vw,520px)] rounded-[16px] border border-[#d7dfeb] p-0">
          <div className="border-b border-[#e3e9f1] px-5 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2 text-[20px] font-semibold text-[#24365a]">
              <Eye className="h-5 w-5 text-primary" />
              Transaction Details
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#6d7b94]">
              Saved details for the selected cash movement.
            </DialogDescription>
          </div>

          {historyTransaction ? (
            <dl className="max-h-[62vh] overflow-y-auto px-5 py-2">
              <HistoryRow label="Type" value={getTransactionTypeLabel(historyTransaction.mode)} />
              <HistoryRow label="Name" value={getTransactionDisplayName(historyTransaction) || "Cash Increase"} />
              <HistoryRow label="Amount" value={formatCashTableAmount(historyTransaction.amount)} />
              <HistoryRow label="Date" value={formatDate(historyTransaction.date)} />
              <HistoryRow label="Description" value={historyTransaction.note || "-"} />
              <HistoryRow label="Created At" value={formatDateTime(historyTransaction.createdAt)} />
              <HistoryRow label="Record ID" value={historyTransaction.id} />
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      {columnFilterPopover
        ? createPortal(
            <div
              ref={columnFilterPopoverRef}
              data-cash-column-filter
              className="fixed z-[70] w-[260px] rounded-[22px] border border-[#d5dfeb] bg-white p-3 shadow-[0_20px_42px_rgba(15,23,42,0.16)]"
              style={{ left: columnFilterPopover.left, top: columnFilterPopover.top }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#74839b]">Select category</div>
                  <select
                    value={columnFilterDraft.operator}
                    onChange={(event) => {
                      const operator = event.target.value as ColumnFilterOperator;
                      const next = { ...columnFilterDraft, operator };
                      setColumnFilterDraft(next);
                      if (next.value.trim()) {
                        setColumnFilters((filters) => ({ ...filters, [columnFilterPopover.columnId]: next }));
                      }
                    }}
                    className="mt-2 h-10 w-full rounded-xl border border-[#f0c9a4] px-3 text-sm text-[#173152]"
                  >
                    <option value="contains">Contains</option>
                    <option value="equals">Equals</option>
                    <option value="starts-with">Starts With</option>
                  </select>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-sm text-[#61708a]">{columnFilterLabel(columnFilterPopover.columnId)}</span>
                  <Input
                    value={columnFilterDraft.value}
                    onChange={(event) => {
                      const value = event.target.value;
                      const next = { ...columnFilterDraft, value };
                      setColumnFilterDraft(next);
                      setColumnFilters((filters) => {
                        const updated = { ...filters };
                        if (value.trim()) {
                          updated[columnFilterPopover.columnId] = next;
                        } else {
                          delete updated[columnFilterPopover.columnId];
                        }
                        return updated;
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applyColumnFilter();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setColumnFilterPopover(null);
                      }
                    }}
                    placeholder="Enter filter value"
                    className="h-10 rounded-xl border-[#f0c9a4]"
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1 rounded-xl"
                    onClick={() => {
                      setColumnFilterDraft(defaultColumnFilter);
                      setColumnFilters((current) => {
                        const next = { ...current };
                        delete next[columnFilterPopover.columnId];
                        return next;
                      });
                      setColumnFilterPopover(null);
                    }}
                  >
                    Clear
                  </Button>
                  <Button type="button" className="h-10 flex-1 rounded-xl bg-primary text-white hover:bg-[#cf670f]" onClick={applyColumnFilter}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function RowActionButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-[#f7f9fd] disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "text-[#dc2626]" : "text-[#24365a]",
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function HistoryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-12 grid-cols-[112px_minmax(0,1fr)] items-start gap-5 border-b border-[#e8edf4] py-3 last:border-b-0">
      <dt className="text-[12px] font-medium text-[#74839b]">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right text-sm font-medium leading-5 text-[#173152]",
          label === "Record ID" ? "break-all font-mono text-[11px] font-normal text-[#61708a]" : "",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function TableHeader({
  label,
  sortDirection,
  onSort,
  onFilter,
  filterActive = false,
}: {
  label: string;
  sortDirection?: "desc" | "asc";
  onSort?: () => void;
  onFilter: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  filterActive?: boolean;
}) {
  return (
    <th className="border-b border-r border-[#d7dfeb] px-3 py-3 text-left text-[14px] font-semibold last:border-r-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>{label}</span>
          {onSort ? (
            <button type="button" className="inline-flex text-[#6c7c95] transition hover:text-[#1455a0]" onClick={onSort}>
              <ArrowUpDown className={cn("h-4 w-4", sortDirection === "asc" ? "rotate-180" : "")} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={`Filter ${label}`}
          onMouseDown={(event) => event.stopPropagation()}
          className={cn(
            "rounded p-0.5 transition",
            filterActive ? "bg-[#edf4ff] text-[#1d66b1]" : "text-[#73839a] hover:bg-[#f4f7fb] hover:text-foreground",
          )}
          onClick={onFilter}
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      </div>
    </th>
  );
}

