"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addYears,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  format,
  parse,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import {
  ArrowDownUp,
  BanknoteArrowUp,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Columns3,
  Copy,
  Download,
  Eye,
  FileMinus2,
  Filter,
  FilterX,
  HandCoins,
  History,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Share2,
  ShoppingCart,
  Trash2,
  UploadCloud,
  WalletCards,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ExcelIcon, WhatsAppIcon } from "@/components/shared/brand-icons";
import { AppDateInput } from "@/components/shared/app-date-input";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { evaluateMasterDataReadiness } from "@/lib/master-data-readiness";
import { MasterDataReadinessGuard } from "@/components/shared/master-data-readiness-guard";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  DocumentStatusBadge,
  EmptyTransactionState,
  PurchaseFilterBar,
  PurchaseSummaryMetrics,
  PurchaseWorkspaceHeader,
  type SummaryMetric,
} from "@/features/purchase/purchase-workspace-parts";
import { VoucherEntryScreen } from "@/features/screens/voucher-entry-screen";
import { appConfig } from "@/config/app";
import {
  getPurchaseWorkspaceSection,
  type PurchaseWorkspaceConfig,
  type PurchaseWorkspaceSection,
} from "@/config/purchase";
import { salesWorkspaceSections } from "@/config/sales";
import { buildPurchaseStartRoute, buildPurchaseWorkspaceRoute, buildSalesWorkspaceRoute, buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { useDayBookQuery, useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import {
  useAccountTreeQuery,
  useCreateAccountMutation,
  useDeleteAccountMutation,
  useMoneyAccountsQuery,
  useReparentAccountMutation,
  useSuggestAccountCodeQuery,
  useUpdateAccountMutation,
} from "@/hooks/use-accounts-query";
import { useColumnResize } from "@/hooks/use-column-resize";
import { useSessionContext } from "@/hooks/use-session-context";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import {
  defaultWorkflowSettings,
  evaluateWorkflowRootAccess,
  type WorkflowRootKind,
  type WorkflowSettingsLoadState,
} from "@/services/workflow-settings.service";
import { buildInvoiceFile, buildInvoicePreviewDataUrl, downloadCsv, downloadInvoiceJpg, downloadInvoicePdf, openInvoicePdf, printInvoice, type InvoiceExportPayload } from "@/lib/download";
import { isEmailAddress, openMailComposer, openWhatsAppShare, shareInvoiceDocument } from "@/lib/app-actions";
import { formatAmount, formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { moneyToMinorUnits, roundMoney, sumMoney } from "@/lib/money";
import { openPrintWindow, printWindowWhenReady } from "@/lib/print";
import { cn } from "@/lib/utils";
import { getLatestPostingMonthRange } from "@/lib/posting-date-range";
import { readDataset } from "@/services/browser-dataset";
import { apiRequest } from "@/services/api-client";
import { getPartyOptions } from "@/lib/erp-data";
import { readCompanyProfile, writeCompanyProfile } from "@/services/company-profile";
import { cancelVoucher, createVoucher, deleteVoucher, getVoucher, reverseVoucher, updateVoucher } from "@/services/voucher.service";
import { useUiStore } from "@/stores/ui-store";
import type { AccountNature, AccountNode, MoneyAccountType } from "@/types/accounts";
import type { VoucherRecord, VoucherType, Workspace } from "@/types/domain";

const purchaseWorkspaceNavigationOrder: PurchaseWorkspaceSection[] = [
  "orders",
  "receipt-notes",
  "bills",
  "debit-notes",
  "payment-out",
  "expenses",
];

type PurchasePreset =
  | "last-posting-month"
  | "today"
  | "yesterday"
  | "this-week"
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "current-financial-year"
  | "previous-financial-year"
  | "custom";
type SavedFilterPreset = "all" | "due" | "paid" | "draft" | "current-financial-year";
type ColumnFilterOperator = "contains" | "equals" | "starts-with";
type ColumnId =
  | "select"
  | "date"
  | "documentNumber"
  | "partyName"
  | "reference"
  | "paymentMethod"
  | "paymentAccount"
  | "amount"
  | "paidAmount"
  | "balance"
  | "status"
  | "createdBy"
  | "expenseCategory"
  | "tax"
  | "expectedDelivery"
  | "receivedValue"
  | "receiptProgress"
  | "financialDue"
  | "remaining"
  | "category"
  | "type"
  | "actions";

type FilterableColumnId = Exclude<ColumnId, "select" | "actions">;
type PurchaseSortKey = FilterableColumnId | "createdAt";

type PurchaseWorkspaceFilters = {
  preset: PurchasePreset;
  from: string;
  to: string;
  supplier: string;
  status: string;
  paymentMethod: string;
  voucherType: string;
  createdBy: string;
  branch: string;
  costCenter: string;
  savedFilter: SavedFilterPreset;
  firm: "active" | "all";
  searchQuery: string;
};

type ColumnFilterValue = {
  operator: ColumnFilterOperator;
  value: string;
  /** Checked values from the picklist. When non-empty this takes over from the
   * operator/value text match — a row passes if its column value is one of these. */
  values: string[];
  /** ISO yyyy-mm-dd bounds for a date column; either side may be left blank for an
   * open-ended range. Takes priority over both the checklist and the text search. */
  dateFrom: string;
  dateTo: string;
};

type ColumnFilterPopoverState = {
  columnId: FilterableColumnId;
  left: number;
  top: number;
};

type PurchaseRow = {
  id: string;
  sourceId: string;
  sourceVoucherType: VoucherType;
  openVoucherType: VoucherType;
  documentNumber: string;
  documentDate: string;
  /** When the underlying record was actually created — used only to break ties when
   * several rows share the same documentDate, so the most recently added shows first. */
  createdAt: string;
  partyName: string;
  reference: string;
  /** The upstream document this one was converted from (order for a receipt note,
   * receipt note for a bill), shown as a reference so the paper trail stays visible. */
  sourceReference: string | null;
  paymentMethod: string;
  paymentAccount: string;
  amount: number;
  paidAmount: number;
  /** Money paid in advance against a purchase order. Kept separate from
   * goods-received progress, because an order can be paid before it is received. */
  advancePaidAmount: number;
  /** Supplier amount still payable after the order's linked advance payments. */
  financialDue: number;
  /** Purchase return value already netted off this bill via a Debit Note. */
  debitNoteAppliedAmount: number;
  balance: number;
  statusLabel: string;
  createdBy: string;
  expenseCategory: string;
  expenseLedgerId: string | null;
  tax: number;
  expectedDelivery: string;
  receivedValue: number;
  remaining: number;
  /** Ordered vs actually received quantity, used to flag part-received orders. */
  orderedQty: number;
  receivedQty: number;
  /** For a receipt note: how much of the source order has arrived across *every*
   * receipt note raised against it, not just this one — so a partial receipt still
   * shows the real running total instead of only its own slice. */
  cumulativeReceivedQty: number;
  /** Quantity already carried into the next workflow document. */
  convertedQty: number;
  /** Maximum quantity that may be carried into the next workflow document. */
  conversionTargetQty: number;
  category: string;
  type: string;
  /** Cash/Bank settle on the spot; credit becomes a due owed to the supplier. */
  settlement: "cash" | "bank" | "credit";
  costCenter: string;
  branch: string;
  narration: string;
  /** Product-wise breakdown (item, qty, rate, line total) shown in the detail view. */
  lineItems: Array<{
    itemName: string;
    quantity: number;
    unitPrice: number;
    total: number;
    warehouseId: string | null;
    warehouseName: string;
    warehouseCode: string;
  }>;
  paymentBreakdown: Array<{ method: string; account: string; reference: string; amount: number }>;
  billAllocations: Array<{ billReference: string; amount: number }>;
};

type RowAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: "danger" | "default";
};

type ColumnDefinition = {
  id: ColumnId;
  label: string;
  width?: string;
  align?: "left" | "right" | "center";
  sticky?: "left";
  stickyOffset?: number;
  filterable?: boolean;
};

type PaymentOutDialogState = {
  sourceId: string | null;
  partyName: string;
  receiptNumber: string;
  voucherDate: string;
  paymentMethod: "Cheque" | "Cash" | "Bank Transfer" | "Card" | "MFS";
  moneyAccountId: string;
  reference: string;
  narration: string;
  amount: string;
};

type ExpenseMasterView = "ledger" | "category";

type ExpenseAccountEditorState = {
  mode: "create" | "edit";
  kind: ExpenseMasterView;
  id: string | null;
  code: string;
  name: string;
  parentId: string;
  nature: Extract<AccountNature, "INCOME" | "DIRECT_EXPENSE" | "INDIRECT_EXPENSE">;
  requiresItemDetails: boolean;
};

type ExpenseMasterSummary = {
  id: string;
  name: string;
  code: string;
  kind: ExpenseMasterView;
  parentId: string | null;
  categoryName: string;
  nature: AccountNature;
  amount: number;
  balance: number;
  count: number;
  ledgerNames: Set<string>;
  ledgerIds: Set<string>;
  account: AccountNode;
};

type ExpenseAccountMenuState = {
  entry: ExpenseMasterSummary;
  left: number;
  top: number;
};

function flattenAccountTree(nodes: AccountNode[]) {
  const flattened: AccountNode[] = [];

  const visit = (entries: AccountNode[]) => {
    entries.forEach((entry) => {
      flattened.push(entry);
      visit(entry.children);
    });
  };

  visit(nodes);
  return flattened;
}

function isExpenseNature(nature: AccountNature) {
  return nature === "DIRECT_EXPENSE" || nature === "INDIRECT_EXPENSE";
}

function getExpenseNatureLabel(nature: AccountNature) {
  if (nature === "INCOME") return "Income";
  return nature === "DIRECT_EXPENSE" ? "Direct Expense" : "Indirect Expense";
}

/** One outstanding bill the payment can be applied against, with how much of the
 * total "Paid" amount is currently earmarked for it. */
type PaymentOutBillAllocation = {
  sourceId: string;
  documentNumber: string;
  reference: string;
  documentDate: string;
  billAmount: number;
  billBalance: number;
  applied: string;
};

type PurchaseEditorState = {
  editId?: string | null;
  duplicateId?: string | null;
  sourceVoucherId?: string | null;
  workflow?: string | null;
};

type PreviewDialogState = {
  title: string;
  subtitle: string;
  payload: InvoiceExportPayload;
  imageSrc: string;
  sourceVoucher: VoucherRecord;
};

type PreviewTheme = "default" | "letterhead";

const previewThemeSections: Array<{
  title: string;
  items: Array<{ id: PreviewTheme; label: string; hint: string }>;
}> = [
  {
    title: "Invoice Design",
    items: [
      { id: "default", label: "Default", hint: "Use the current Bizovix invoice design." },
      { id: "letterhead", label: "Company Pad / Letterhead", hint: "Use your uploaded PNG/JPG company pad." },
    ],
  },
];

const pageSizeOptions = [10, 25, 50];
const paymentOutMethodOptions = ["Cheque", "Cash", "Bank Transfer", "Card", "MFS"] as const;

function paymentOutMoneyAccountType(method: PaymentOutDialogState["paymentMethod"]): MoneyAccountType {
  if (method === "Cash") return "CASH";
  if (method === "MFS") return "MFS";
  return "BANK";
}
const purchasePresetOptions: Array<{ value: PurchasePreset; label: string }> = [
  { value: "last-posting-month", label: "Last Posting Month" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "this-quarter", label: "This Quarter" },
  { value: "current-financial-year", label: "Current Financial Year" },
  { value: "previous-financial-year", label: "Previous Financial Year" },
  { value: "custom", label: "Custom Range" },
];

const purchaseSavedFilterOptions: Array<{ value: SavedFilterPreset; label: string }> = [
  { value: "all", label: "No saved preset applied" },
  { value: "due", label: "Due suppliers" },
  { value: "paid", label: "Fully paid only" },
  { value: "draft", label: "Draft vouchers" },
  { value: "current-financial-year", label: "Financial year view" },
];

const columnDefaultVisibility: Record<ColumnId, boolean> = {
  select: false,
  date: true,
  documentNumber: true,
  partyName: true,
  reference: true,
  paymentMethod: true,
  paymentAccount: true,
  amount: true,
  paidAmount: true,
  balance: true,
  status: true,
  createdBy: false,
  expenseCategory: true,
  tax: true,
  expectedDelivery: true,
  receivedValue: true,
  receiptProgress: true,
  financialDue: true,
  remaining: true,
  category: true,
  type: true,
  actions: true,
};

const defaultColumnFilter: ColumnFilterValue = {
  operator: "contains",
  value: "",
  values: [],
  dateFrom: "",
  dateTo: "",
};

function normalizeString(value: string) {
  return value.trim().toLowerCase();
}

function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function buildNextReceiptNumber() {
  return String(Date.now()).slice(-4);
}

function buildPaymentOutDialogState(row?: PurchaseRow): PaymentOutDialogState {
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const resolvedReference = row?.reference?.trim() || buildNextReceiptNumber();
  const isCash = normalizeString(row?.paymentMethod ?? "") === "cash";

  return {
    sourceId: row?.sourceId ?? null,
    partyName: row?.partyName ?? "",
    receiptNumber: resolvedReference,
    voucherDate: row?.documentDate ?? fallbackDate,
    paymentMethod: isCash ? "Cash" : "Cheque",
    moneyAccountId: "",
    reference: resolvedReference,
    narration: row?.narration ?? "",
    amount: row ? String(row.amount) : "",
  };
}

function getVoucherPaymentBreakdown(record: VoucherRecord) {
  return record.lines
    .filter((line) =>
      Number(line.credit || 0) > 0 &&
      (Boolean(line.moneyAccountType) || (/\bpayment\b/i.test(line.description ?? "") && !/payable settlement/i.test(line.description ?? ""))),
    )
    .map((line) => {
      const match = (line.description?.trim() ?? "").match(/^(.+?)(?:\s+purchase)?\s+payment(?:\s+\((.*)\))?$/i);
      return {
        method: match?.[1]?.trim() || line.ledger || "Payment",
        account: line.ledger || "Not recorded",
        reference: match?.[2]?.trim() || "",
        amount: Number(line.credit || 0),
      };
    });
}

/** Payment vouchers can settle several bills with several money accounts. The
 * voucher does not store a direct method-to-bill edge, so each method is shared
 * across its bill allocations in the same proportion as the applied amounts. */
function buildPaymentBreakdownsByBillReference(records: VoucherRecord[]) {
  const breakdowns = new Map<string, Array<{ method: string; account: string; reference: string; amount: number }>>();
  records
    .filter((record) => record.voucherType === "payment" && record.status === "posted")
    .forEach((record) => {
      const allocations = getVoucherBillAllocations(record);
      const methods = getVoucherPaymentBreakdown(record);
      const allocationTotal = sumMoney(allocations.map((entry) => entry.amount));
      if (!allocations.length || !methods.length || allocationTotal <= 0) return;

      allocations.forEach((allocation) => {
        const key = buildReferenceKey(record.partyName, allocation.billReference);
        const entries = breakdowns.get(key) ?? [];
        methods.forEach((method) => {
          entries.push({
            ...method,
            reference: method.reference || record.reference || record.voucherNumber,
            amount: roundMoney(method.amount * allocation.amount / allocationTotal),
          });
        });
        breakdowns.set(key, entries);
      });
    });
  return breakdowns;
}

function getVoucherPaymentMethods(record: VoucherRecord) {
  const methods = getVoucherPaymentBreakdown(record).map((entry) => entry.method).filter(Boolean);
  return Array.from(new Set(methods));
}

function getVoucherBillAllocations(record: VoucherRecord) {
  return record.lines
    .filter((line) => Number(line.debit || 0) > 0 && Boolean(line.billReference?.trim()))
    .map((line) => ({ billReference: line.billReference!.trim(), amount: Number(line.debit || 0) }));
}

function getPaymentOutMethodLabel(row: PurchaseRow) {
  return row.paymentMethod;
}

function parseWorkspaceRange(rangeLabel: string | null | undefined) {
  if (!rangeLabel || !rangeLabel.includes(" - ")) {
    return null;
  }

  const [startLabel, endLabel] = rangeLabel.split(" - ");
  const start = parse(startLabel.trim(), "dd MMM yyyy", new Date());
  const end = parse(endLabel.trim(), "dd MMM yyyy", new Date());

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
  };
}

function buildDateWindow(preset: PurchasePreset, workspace: Workspace | null) {
  const today = new Date();
  const currentFy = parseWorkspaceRange(workspace?.financialYear);

  if (preset === "last-posting-month") {
    // The last-posting anchor is loaded from the workspace day book. Using
    // today's date while that request is still in flight makes the filter show
    // a false current-date range on first navigation and then jump after a
    // refresh/cache hit. Keep the range unresolved until the real anchor is
    // available; empty dates mean "unbounded" to the day-book provider.
    return { start: "", end: "" };
  }

  if (preset === "current-financial-year" && currentFy) {
    return currentFy;
  }

  if (preset === "previous-financial-year" && currentFy) {
    return {
      start: format(subYears(new Date(currentFy.start), 1), "yyyy-MM-dd"),
      end: format(subYears(new Date(currentFy.end), 1), "yyyy-MM-dd"),
    };
  }

  if (preset === "today") {
    const current = format(today, "yyyy-MM-dd");
    return { start: current, end: current };
  }

  if (preset === "yesterday") {
    const current = format(subDays(today, 1), "yyyy-MM-dd");
    return { start: current, end: current };
  }

  if (preset === "this-week") {
    return {
      start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      end: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }

  if (preset === "this-month") {
    return {
      start: format(startOfMonth(today), "yyyy-MM-dd"),
      end: format(endOfMonth(today), "yyyy-MM-dd"),
    };
  }

  if (preset === "last-month") {
    const anchor = subMonths(today, 1);
    return {
      start: format(startOfMonth(anchor), "yyyy-MM-dd"),
      end: format(endOfMonth(anchor), "yyyy-MM-dd"),
    };
  }

  if (preset === "this-quarter") {
    return {
      start: format(startOfQuarter(today), "yyyy-MM-dd"),
      end: format(endOfQuarter(today), "yyyy-MM-dd"),
    };
  }

  // Reached when "current/previous financial year" was requested but no real financial
  // year is configured for this workspace (true for every live workspace right now,
  // since getWorkspaceContext only resolves it in mock/demo mode). Falling back to
  // "month to date" silently hid every order from before the 1st of the month — on the
  // 1st itself the window collapsed to a single day and the whole list looked empty.
  // A wide, open-ended window keeps every real transaction visible until a real
  // per-workspace financial year exists to narrow it correctly.
  return {
    start: currentFy?.start ?? format(subYears(today, 3), "yyyy-MM-dd"),
    end: currentFy?.end ?? format(addYears(today, 1), "yyyy-MM-dd"),
  };
}

function buildDefaultFilters(workspace: Workspace | null, section: PurchaseWorkspaceSection): PurchaseWorkspaceFilters {
  // Purchase Bills are frequently created by converting an older-dated Receipt
  // Note. Defaulting Bills to the current calendar month made the newly created
  // bill disappear immediately whenever the source note belonged to a prior
  // month. Keep the whole purchase document chain on the financial-year window;
  // users can still explicitly choose This Month when they need it.
  // A return is commonly entered against an older-dated Purchase Bill. Keeping
  // Purchase Returns on "This Month" made a successfully saved return vanish
  // from the list immediately when its voucher date belonged to a prior month.
  // Use the same financial-year window as the rest of the purchase chain.
  const useMonthlyWindow = section === "expenses";
  const window = buildDateWindow("last-posting-month", workspace);
  return {
    preset: "last-posting-month",
    from: window.start,
    to: window.end,
    supplier: "all",
    status: "all",
    paymentMethod: "all",
    voucherType: "all",
    createdBy: "all",
    branch: "all",
    costCenter: "all",
    savedFilter: "all",
    firm: useMonthlyWindow ? "all" : "active",
    searchQuery: "",
  };
}

function isOrderLikeSection(section: PurchaseWorkspaceSection) {
  return section === "orders" || section === "receipt-notes";
}

/**
 * The purchase chain is deliberately one-to-one. As soon as any child document
 * exists, the parent is immutable until that child is deleted again.
 */
function isFullyConverted(row: PurchaseRow) {
  if (row.statusLabel === "Cancelled") return false;
  if (row.convertedQty > 0.000001) return true;
  if (row.conversionTargetQty > 0) {
    return row.convertedQty >= row.conversionTargetQty - 0.000001;
  }
  return row.amount > 0 && row.balance <= 0;
}

function getPurchaseWorkflowForSection(section: PurchaseWorkspaceSection) {
  if (section === "orders") {
    return "purchase-order";
  }

  if (section === "receipt-notes") {
    return "receipt-note";
  }

  return null;
}

function getOrderLikeDocumentLabel(section: PurchaseWorkspaceSection) {
  return section === "receipt-notes" ? "Receipt Note" : "Purchase Order";
}

function getOrderLikeCollectionLabel(section: PurchaseWorkspaceSection) {
  return section === "receipt-notes" ? "Receipt Notes" : "Orders";
}

function getWorkspaceContext(mode: "mock" | "demo" | "api", workspaceId: string | undefined) {
  if (mode === "api" || !workspaceId) {
    return null;
  }

  const dataset = readDataset(mode);
  return dataset.workspaces.find((entry) => entry.id === workspaceId) ?? null;
}

/** Which specific ledger ("Bank Accounts" vs "Mobile Financial Service Accounts") a
 * Bank-settled purchase-side voucher used — found by name, same lookup used when
 * restoring the form in voucher-entry-screen.tsx. */
function getBankSettlementLedgerName(record: VoucherRecord) {
  return record.lines.find((line) => line.ledger === "Bank Accounts" || line.ledger === "Mobile Financial Service Accounts")?.ledger;
}

function derivePaymentMethodLabel(record: VoucherRecord, cashLabel: string, bankLabel: string, mfsLabel: string, creditLabel: string) {
  if (record.settlementMode === "cash") return cashLabel;
  if (record.settlementMode === "bank") {
    return getBankSettlementLedgerName(record) === "Mobile Financial Service Accounts" ? mfsLabel : bankLabel;
  }
  return creditLabel;
}

function derivePaymentMethod(record: VoucherRecord, section: PurchaseWorkspaceSection) {
  if (section === "payment-out") {
    const methods = getVoucherPaymentMethods(record);
    return methods.length ? methods.join(" + ") : derivePaymentMethodLabel(record, "Cash", "Bank", "MFS", "Bank");
  }

  if (section === "expenses") {
    return derivePaymentMethodLabel(record, "Cash", "Bank", "MFS", "On Account");
  }

  if (section === "revenue") {
    return record.settlementMode === "cash" ? "Cash" : "Credit";
  }

  if (isOrderLikeSection(section)) {
    // The document type is already its own column here, so this one answers the
    // question that actually matters on an order: is it paid for or on credit?
    return derivePaymentMethodLabel(record, "Cash", "Bank", "MFS", "Credit");
  }

  if (section === "debit-notes") {
    const refundMethods = record.lines
      .filter(
        (line) =>
          Number(line.debit || 0) > 0 &&
          normalizeString(line.ledger) !== normalizeString(record.partyName),
      )
      .map((line) => {
        const description = normalizeString(line.description || "");
        const ledger = normalizeString(line.ledger);
        if (line.moneyAccountType === "CASH" || description.includes("cash refund") || ledger.includes("cash")) return "Cash";
        if (line.moneyAccountType === "MFS" || description.includes("mfs refund") || ledger.includes("bkash") || ledger.includes("nagad")) return "MFS";
        return "Bank";
      });
    const hasSupplierAdjustment = record.lines.some(
      (line) => Number(line.debit || 0) > 0 && !line.moneyAccountType && normalizeString(line.ledger) === normalizeString(record.partyName),
    );
    return Array.from(new Set([...refundMethods, ...(hasSupplierAdjustment ? ["Credit"] : [])])).join(" + ") || "Credit";
  }

  return derivePaymentMethodLabel(record, "Cash Purchase", "Bank Purchase", "MFS Purchase", "On Account");
}

function derivePaymentAccount(record: VoucherRecord, section: PurchaseWorkspaceSection) {
  if (section === "expenses") {
    if (record.settlementMode === "cash") return "Cash in Hand";
    if (record.settlementMode === "bank") return getBankSettlementLedgerName(record) || "Bank Accounts";
    return "Accrued Expenses";
  }

  if (section === "revenue") {
    // The debit side of a Revenue voucher's pair — Cash in Hand, Bank Accounts, or
    // the customer/debtor ledger — same idea as an expense's payment account, just
    // the receiving side instead of the paying side.
    return record.lines.find((line) => Number(line.debit || 0) > 0)?.ledger || "Cash in Hand";
  }

  if (section === "payment-out") {
    // Real credit-side ledgers (Cash in Hand / Bank Accounts / Mobile Financial Service
    // Accounts / ...), one per split method — accurate for a mixed-method payment,
    // unlike guessing off the coarse settlementMode flag.
    const creditLedgers = record.lines.filter((line) => Number(line.credit || 0) > 0).map((line) => line.ledger);
    if (creditLedgers.length) {
      return Array.from(new Set(creditLedgers)).join(" + ");
    }
    return record.settlementMode === "cash" ? "Cash in Hand" : "Bank Accounts";
  }

  if (section === "debit-notes") {
    const debitLedgers = record.lines
      .filter((line) => Number(line.debit || 0) > 0)
      .map((line) => line.ledger)
      .filter(Boolean);
    return Array.from(new Set(debitLedgers)).join(" + ") || "Accounts Payable";
  }

  if (isOrderLikeSection(section)) {
    return section === "receipt-notes" ? "Goods Received Not Billed" : "Expected Supplier";
  }

  if (record.settlementMode === "cash") return "Cash in Hand";
  if (record.settlementMode === "bank") return getBankSettlementLedgerName(record) || "Bank Accounts";
  return "Accounts Payable";
}

function deriveExpenseCategory(record: VoucherRecord, section: PurchaseWorkspaceSection) {
  if (section === "expenses") {
    return record.lines.find((line) => Number(line.debit || 0) > 0)?.ledger || "Operating Expense";
  }

  if (section === "revenue") {
    // The credit side — the picked Other-Income ledger.
    return record.lines.find((line) => Number(line.credit || 0) > 0)?.ledger || "Other Income";
  }

  if (section === "debit-notes") {
    return "Supplier Adjustment";
  }

  if (isOrderLikeSection(section)) {
    return section === "receipt-notes" ? "Stock Receipt" : "Stock Procurement";
  }

  return record.lines.find((line) => Number(line.debit || 0) > 0)?.ledger || "Purchase Account";
}

function deriveRowStatus(record: VoucherRecord, section: PurchaseWorkspaceSection, amount: number, paidAmount: number, balance: number) {
  if (record.status === "cancelled") {
    return "Cancelled";
  }

  if (isOrderLikeSection(section)) {
    if (record.status === "draft") {
      return "Draft";
    }

    // An order is settled by goods arriving; a receipt note is settled by a bill
    // being raised for it.
    if (paidAmount >= amount && amount > 0) {
      return section === "receipt-notes" ? "Fully Billed" : "Fully Received";
    }

    if (paidAmount > 0) {
      return section === "receipt-notes" ? "Partially Billed" : "Partially Received";
    }

    return section === "receipt-notes" ? "Unbilled" : "Not Received";
  }

  if (section === "payment-out") {
    return record.status === "draft" ? "Draft" : record.status === "pending" ? "Pending" : "Used";
  }

  if (section === "expenses") {
    if (record.status === "draft") {
      return "Draft";
    }
    return balance <= 0 ? "Paid" : "Unpaid";
  }

  if (section === "revenue") {
    // A Revenue voucher always posts a fully balanced pair — there's no partial
    // collection tracking, just whether it was received in cash/bank already or is
    // still owed by a customer.
    if (record.status === "draft") {
      return "Draft";
    }
    return record.settlementMode === "cash" ? "Received" : "Receivable";
  }

  if (section === "debit-notes") {
    // A purchase return isn't a payment — "Paid" implies cash changed hands, which
    // it never does here. "Applied" reflects that its value has been offset against
    // a bill instead.
    if (record.status === "draft") {
      return "Draft";
    }
    if (balance <= 0) {
      return "Applied";
    }
    return paidAmount > 0 ? "Partially Applied" : "Unapplied";
  }

  if (record.status === "draft") {
    return "Draft";
  }

  if (balance <= 0) {
    return "Paid";
  }

  if (paidAmount > 0 && balance > 0) {
    return "Partially Paid";
  }

  const dueDate = addDays(new Date(record.voucherDate), 21);
  if (dueDate.getTime() < Date.now()) {
    return "Overdue";
  }

  if (record.status === "posted") {
    return "Unpaid";
  }

  return "Posted";
}

function derivePaidAmount(record: VoucherRecord, section: PurchaseWorkspaceSection) {
  if (section === "payment-out") {
    return record.amount;
  }

  if (isOrderLikeSection(section)) {
    return 0;
  }

  if (section === "debit-notes") {
    return record.status === "posted" ? record.amount : 0;
  }

  // Bank/MFS settle immediately, same as cash — only Credit leaves a balance due.
  return record.settlementMode === "cash" || record.settlementMode === "bank" ? record.amount : 0;
}

function normalizeBillReference(value?: string | null) {
  return normalizeString(value || "");
}

function buildReferenceKey(partyName: string, reference: string) {
  return `${normalizeString(partyName)}::${normalizeBillReference(reference)}`;
}

function collectRecordReferences(record: VoucherRecord) {
  const references = new Set<string>();
  for (const value of [record.reference, record.voucherNumber]) {
    const normalized = normalizeBillReference(value);
    if (normalized) {
      references.add(normalized);
    }
  }
  return references;
}

/**
 * Every reference token a record can be found under — its own reference and
 * voucher number, plus each line's billReference — split on "+" since a
 * combined document (e.g. a bill raised from several receipt notes) joins
 * several references into one string (see applyMultiReceiptNoteSelection in
 * voucher-entry-screen.tsx). A superset of collectRecordReferences, needed
 * wherever a document past the first one combined into another has to be
 * found by text alone.
 */
function collectCombinedReferenceTokens(record: VoucherRecord) {
  const tokens = new Set<string>();
  for (const value of [record.reference, record.voucherNumber, ...record.lines.map((line) => line.billReference)]) {
    for (const part of (value ?? "").split("+")) {
      const normalized = normalizeBillReference(part);
      if (normalized) {
        tokens.add(normalized);
      }
    }
  }
  return tokens;
}

function getInventoryItemsValue(record: VoucherRecord) {
  return sumMoney(
    (record.inventoryItems ?? []).map((item) => Number(item.quantity || 0) * Number(item.unitPrice || 0)),
  );
}

/**
 * Value AND quantity received against a purchase order, keyed by reference text
 * instead of id — the fallback for a receipt note saved without a sourceVoucherId
 * link back to its order (e.g. every receipt note past the first one picked in
 * a multi-note bill; see applyMultiReceiptNoteSelection's comment). Both maps
 * are built together since they share the same reference-matching pass.
 */
function buildReceiptNoteAmountsByOrder(records: VoucherRecord[]) {
  const valueByReference = new Map<string, number>();
  const qtyByReference = new Map<string, number>();

  records
    .filter((record) => record.voucherType === "purchase" && record.documentKind === "receipt-note" && record.status === "posted")
    .forEach((record) => {
      const references = collectRecordReferences(record);
      for (const line of record.lines) {
        const normalized = normalizeBillReference(line.billReference);
        if (normalized) {
          references.add(normalized);
        }
      }

      const receiptValue = getInventoryItemsValue(record) || roundMoney(Number(record.amount || 0));
      const receiptQty = (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      for (const reference of references) {
        const key = buildReferenceKey(record.partyName, reference);
        valueByReference.set(key, sumMoney([valueByReference.get(key) ?? 0, receiptValue]));
        qtyByReference.set(key, (qtyByReference.get(key) ?? 0) + receiptQty);
      }
    });

  return { valueByReference, qtyByReference };
}

/**
 * Orders, receipt notes and bills are all stored as `purchase` vouchers, so the
 * saved documentKind decides which list a row belongs to. Rows saved before that
 * field existed have no kind and stay on the bills list, where they always were.
 */
function matchesPurchaseDocumentKind(record: VoucherRecord, slug: PurchaseWorkspaceSection) {
  if (record.voucherType !== "purchase") {
    return true;
  }

  const kind = record.documentKind ?? null;
  if (slug === "orders") {
    return kind === "purchase-order";
  }

  if (slug === "receipt-notes") {
    return kind === "receipt-note";
  }

  if (slug === "bills") {
    return kind === null || kind === "bill";
  }

  return true;
}

/**
 * Resolve "Last Posting Month" from the documents that belong to the current
 * workspace only. A later bank transfer, sale, or expense must not move the
 * Purchase Orders window forward and make valid older orders disappear.
 */
export function getPurchaseSectionPostingMonthRange(
  records: VoucherRecord[],
  section: PurchaseWorkspaceSection,
) {
  const config = getPurchaseWorkspaceSection(section);
  return getLatestPostingMonthRange(
    records
      .filter((record) => record.status !== "cancelled")
      .filter((record) => config.sourceVoucherTypes.includes(record.voucherType))
      .filter((record) => matchesPurchaseDocumentKind(record, section))
      .map((record) => record.voucherDate),
  );
}

/**
 * How much of each purchase order has actually arrived, summed from the receipt
 * notes created against it. An order of 500 with a 300 receipt note keeps 200 as
 * still pending.
 */
function buildReceivedByOrder(records: VoucherRecord[]) {
  const receivedQtyByOrder = new Map<string, number>();
  const receivedValueByOrder = new Map<string, number>();

  records
    .filter((record) => record.documentKind === "receipt-note" && record.sourceVoucherId && record.status === "posted")
    .forEach((record) => {
      const orderId = record.sourceVoucherId as string;
      const quantity = (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      receivedQtyByOrder.set(orderId, (receivedQtyByOrder.get(orderId) ?? 0) + quantity);
      receivedValueByOrder.set(
        orderId,
        sumMoney([receivedValueByOrder.get(orderId) ?? 0, Number(record.amount || 0)]),
      );
    });

  return { receivedQtyByOrder, receivedValueByOrder };
}

/**
 * How much of each receipt note has been invoiced, summed from the purchase bills
 * raised against it. Goods received but not yet billed stay pending — that is the
 * whole point of the receipt note sitting between the order and the bill.
 */
function buildBilledByReceiptNote(records: VoucherRecord[]) {
  const billedQtyByReceiptNote = new Map<string, number>();
  const billedValueByReceiptNote = new Map<string, number>();

  records
    .filter((record) => matchesPurchaseDocumentKind(record, "bills") && record.voucherType === "purchase" && record.sourceVoucherId && record.status === "posted")
    .forEach((record) => {
      const receiptNoteId = record.sourceVoucherId as string;
      const quantity = (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      billedQtyByReceiptNote.set(receiptNoteId, (billedQtyByReceiptNote.get(receiptNoteId) ?? 0) + quantity);
      billedValueByReceiptNote.set(
        receiptNoteId,
        sumMoney([billedValueByReceiptNote.get(receiptNoteId) ?? 0, Number(record.amount || 0)]),
      );
    });

  return { billedQtyByReceiptNote, billedValueByReceiptNote };
}

/**
 * Reference-string fallback for a receipt note billed as part of a *combined*
 * Purchase Bill. The voucher schema only lets a bill carry one `sourceVoucherId`
 * (see applyMultiReceiptNoteSelection's comment in voucher-entry-screen.tsx),
 * so when several receipt notes are combined into one bill, every note past the
 * earliest-dated one is only visible in the bill's " + "-joined reference /
 * line billReference text — not through the id link buildBilledByReceiptNote
 * relies on. Splitting that text back into its individual tokens lets each
 * combined receipt note be recognized as billed too, not just the first one.
 */
function buildBilledAmountsByReceiptReference(records: VoucherRecord[]) {
  const billedValueByReference = new Map<string, number>();
  const billedQtyByReference = new Map<string, number>();

  records
    .filter((record) => matchesPurchaseDocumentKind(record, "bills") && record.voucherType === "purchase" && record.status === "posted")
    .forEach((record) => {
      for (const reference of collectCombinedReferenceTokens(record)) {
        const key = buildReferenceKey(record.partyName, reference);
        billedValueByReference.set(
          key,
          sumMoney([billedValueByReference.get(key) ?? 0, Number(record.amount || 0)]),
        );
        const quantity = (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        billedQtyByReference.set(key, (billedQtyByReference.get(key) ?? 0) + quantity);
      }
    });

  return { billedValueByReference, billedQtyByReference };
}

/**
 * How much of each Purchase Bill has been offset by a Debit Note (purchase return),
 * keyed both by the bill's own id (sourceVoucherId, set when the Debit Note's
 * "Select bill" picker was used) and by its reference/voucherNumber (matched against
 * each Debit Note line's billReference) as a fallback — same two-tier matching the
 * receipt-note/bill chain already uses elsewhere in this file.
 */
function buildDebitNoteAmountsByBill(records: VoucherRecord[]) {
  const debitNoteAmountsByBillId = new Map<string, number>();
  const debitNoteAmountsByReference = new Map<string, number>();

  records
    .filter((record) => record.voucherType === "debit-note" && record.status === "posted")
    .forEach((record) => {
      // Only the supplier-ledger debit reduces an outstanding Purchase Bill.
      // Cash/Bank/MFS debit lines are refunds received directly and must update
      // those money ledgers without also reducing Accounts Payable a second time.
      const amount = sumMoney(
        record.lines
          .filter(
            (line) =>
              Number(line.debit || 0) > 0 &&
              !line.moneyAccountType &&
              normalizeString(line.ledger) === normalizeString(record.partyName),
          )
          .map((line) => Number(line.debit || 0)),
      );
      if (amount <= 0) {
        return;
      }
      if (record.sourceVoucherId) {
        debitNoteAmountsByBillId.set(
          record.sourceVoucherId,
          sumMoney([debitNoteAmountsByBillId.get(record.sourceVoucherId) ?? 0, amount]),
        );
      }

      const references = new Set(record.lines.map((line) => normalizeBillReference(line.billReference)).filter(Boolean));
      for (const reference of references) {
        const key = buildReferenceKey(record.partyName, reference);
        debitNoteAmountsByReference.set(
          key,
          sumMoney([debitNoteAmountsByReference.get(key) ?? 0, amount]),
        );
      }
    });

  return { debitNoteAmountsByBillId, debitNoteAmountsByReference };
}

export function buildPurchaseRows(records: VoucherRecord[], config: PurchaseWorkspaceConfig) {
  const { receivedQtyByOrder, receivedValueByOrder } = buildReceivedByOrder(records);
  const { billedQtyByReceiptNote, billedValueByReceiptNote } = buildBilledByReceiptNote(records);
  const { billedValueByReference: billedValueByReceiptReference, billedQtyByReference } = buildBilledAmountsByReceiptReference(records);
  const { debitNoteAmountsByBillId, debitNoteAmountsByReference } = buildDebitNoteAmountsByBill(records);
  const paymentBreakdownsByBillReference = buildPaymentBreakdownsByBillReference(records);
  const primaryRows = records
    .filter((record) => config.sourceVoucherTypes.includes(record.voucherType))
    .filter((record) => matchesPurchaseDocumentKind(record, config.slug));
  const sourceRows =
    primaryRows.length > 0 || !config.fallbackVoucherTypes?.length
      ? primaryRows
      : records
          .filter((record) => config.fallbackVoucherTypes?.includes(record.voucherType))
          // The fallback must respect the document kind too, otherwise an empty
          // receipt-note list quietly falls back to showing purchase orders.
          .filter((record) => matchesPurchaseDocumentKind(record, config.slug));
  const paymentAmountsByReference = records
    .filter((record) => record.voucherType === "payment")
    .reduce((map, record) => {
      const allocatedLines = record.lines.filter(
        (line) => Number(line.debit || 0) > 0 && Boolean(line.billReference?.trim()),
      );
      if (allocatedLines.length) {
        for (const line of allocatedLines) {
          const reference = line.billReference!.trim();
          const key = buildReferenceKey(record.partyName, reference);
          map.set(key, sumMoney([map.get(key) ?? 0, Number(line.debit || 0)]));
        }
        return map;
      }
      const references = new Set<string>();
      for (const value of [record.reference, record.voucherNumber]) {
        const normalized = normalizeBillReference(value);
        if (normalized) {
          references.add(normalized);
        }
      }
      for (const line of record.lines) {
        const normalized = normalizeBillReference(line.billReference);
        if (normalized) {
          references.add(normalized);
        }
      }

      for (const reference of references) {
        const key = buildReferenceKey(record.partyName, reference);
        map.set(key, sumMoney([map.get(key) ?? 0, Number(record.amount || 0)]));
      }
      return map;
    }, new Map<string, number>());
  const advancePaymentsByOrderId = records
    .filter((record) => record.voucherType === "payment" && Boolean(record.sourceVoucherId) && record.status === "posted")
    .reduce((map, record) => {
      const orderId = record.sourceVoucherId!;
      const creditTotal = sumMoney(record.lines.map((line) => Number(line.credit || 0)));
      const amount = creditTotal || roundMoney(Number(record.amount || 0));
      const current = map.get(orderId) ?? {
        amount: 0,
        methods: new Set<string>(),
        breakdown: [] as Array<{ method: string; account: string; reference: string; amount: number }>,
      };
      current.amount = sumMoney([current.amount, amount]);
      getVoucherPaymentBreakdown(record).forEach((entry) => {
        current.methods.add(entry.method);
        const existing = current.breakdown.find(
          (candidate) => candidate.method === entry.method && candidate.reference === entry.reference,
        );
        if (existing) {
          existing.amount = sumMoney([existing.amount, entry.amount]);
        } else {
          current.breakdown.push({ ...entry });
        }
      });
      map.set(orderId, current);
      return map;
    }, new Map<string, { amount: number; methods: Set<string>; breakdown: Array<{ method: string; account: string; reference: string; amount: number }> }>());
  const { valueByReference: receiptNoteValueByReference, qtyByReference: receiptNoteQtyByReference } = buildReceiptNoteAmountsByOrder(records);
  const recordsById = new Map(records.map((record) => [record.id, record]));
  // Reference-keyed fallback for resolving a receipt note's source order when its
  // sourceVoucherId link is missing (see the ownLineReferences comment below).
  const orderRecordsByReference = new Map<string, VoucherRecord>();
  records
    .filter((candidate) => candidate.documentKind === "purchase-order")
    .forEach((candidate) => {
      for (const reference of collectRecordReferences(candidate)) {
        orderRecordsByReference.set(buildReferenceKey(candidate.partyName, reference), candidate);
      }
    });
  // Same fallback, one document kind up: a receipt note combined into a bill past
  // the earliest-dated one only survives in the bill's " + "-joined reference /
  // line billReference text (see buildBilledAmountsByReceiptReference's comment),
  // so its tokens — not just its own reference/voucherNumber — have to be indexed.
  const receiptNoteRecordsByReference = new Map<string, VoucherRecord>();
  records
    .filter((candidate) => candidate.documentKind === "receipt-note")
    .forEach((candidate) => {
      for (const reference of collectCombinedReferenceTokens(candidate)) {
        receiptNoteRecordsByReference.set(buildReferenceKey(candidate.partyName, reference), candidate);
      }
    });
  // An order's advance is a separate Payment voucher linked only through
  // sourceVoucherId to the ORDER itself (see voucher-entry-screen.tsx's
  // isPurchaseOrderWorkflow save) — never to the Bill this order eventually
  // becomes. Walking up from a Bill — by id where the link survived, by
  // reference token where it didn't (a combined bill can descend from several
  // receipt notes, each from a different order) — is the only way to find every
  // order behind it, so each one's advance can be pulled into the bill's Paid
  // instead of silently vanishing.
  function resolveUpstreamPurchaseOrders(startRecord: VoucherRecord): VoucherRecord[] {
    const orders = new Map<string, VoucherRecord>();
    const visited = new Set<string>([startRecord.id]);
    function visit(current: VoucherRecord) {
      const parent = current.sourceVoucherId ? recordsById.get(current.sourceVoucherId) : undefined;
      if (parent && !visited.has(parent.id)) {
        if (parent.documentKind === "purchase-order") {
          orders.set(parent.id, parent);
        } else if (parent.documentKind === "receipt-note") {
          visited.add(parent.id);
          visit(parent);
        }
      }
      for (const token of collectCombinedReferenceTokens(current)) {
        const key = buildReferenceKey(current.partyName, token);
        const orderMatch = orderRecordsByReference.get(key);
        if (orderMatch) {
          orders.set(orderMatch.id, orderMatch);
          continue;
        }
        const receiptMatch = receiptNoteRecordsByReference.get(key);
        if (receiptMatch && !visited.has(receiptMatch.id)) {
          visited.add(receiptMatch.id);
          visit(receiptMatch);
        }
      }
    }
    visit(startRecord);
    return Array.from(orders.values());
  }

  return sourceRows.map((record) => {
    // Older pre-ledger purchase documents were saved without totalAmount, so
    // their persisted `amount` is 0 even though their inventory rows contain
    // the correct value. Keep those records readable while newly saved records
    // persist the total directly.
    const storedAmount = roundMoney(Number(record.amount || 0));
    const itemSubtotal = getInventoryItemsValue(record);
    const resolvedSubtotal = roundMoney(Number(record.subtotal || 0)) || itemSubtotal;
    const amount =
      storedAmount !== 0
        ? storedAmount
        : Math.max(0, roundMoney(resolvedSubtotal - roundMoney(Number(record.discountAmount || 0))));
    // A receipt note saved without a sourceVoucherId link (every note past the first
    // one picked into a combined bill — see applyMultiReceiptNoteSelection) can still
    // be traced to its order through its OWN line billReference, which was set to the
    // order's reference/voucherNumber regardless of the missing id link.
    const ownLineReferences = new Set(record.lines.map((line) => normalizeBillReference(line.billReference)).filter(Boolean));
    // The document one step upstream (an order for a receipt note, a receipt note
    // for a bill) — shown as this row's reference so the paper trail stays visible.
    const sourceRecord =
      (record.sourceVoucherId ? recordsById.get(record.sourceVoucherId) : undefined) ??
      Array.from(ownLineReferences)
        .map((reference) => orderRecordsByReference.get(buildReferenceKey(record.partyName, reference)))
        .find((candidate): candidate is VoucherRecord => Boolean(candidate));
    const sourceReference = sourceRecord ? sourceRecord.reference?.trim() || sourceRecord.voucherNumber : null;
    const sourceItemQty = sourceRecord ? (sourceRecord.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0;
    const referencedReceivedValue = sumMoney(
      Array.from(collectRecordReferences(record), (reference) =>
        receiptNoteValueByReference.get(buildReferenceKey(record.partyName, reference)) ?? 0,
      ),
    );
    const referencedReceivedQty = Array.from(collectRecordReferences(record)).reduce(
      (sum, reference) => sum + (receiptNoteQtyByReference.get(buildReferenceKey(record.partyName, reference)) ?? 0),
      0,
    );
    const cumulativeQtyViaLineReference = Array.from(ownLineReferences).reduce(
      (sum, reference) => sum + (receiptNoteQtyByReference.get(buildReferenceKey(record.partyName, reference)) ?? 0),
      0,
    );
    const receivedAgainstOrder =
      config.slug === "orders"
        ? Math.max(
            // Receipt notes linked by id are authoritative; the reference match is the
            // fallback for a receipt note saved without that link (see
            // buildReceiptNoteAmountsByOrder's comment).
            receivedValueByOrder.get(record.id) ?? 0,
            referencedReceivedValue,
          )
        : 0;
    // A receipt note is "settled" once a bill has been raised for it, the same way an
    // order is settled once the goods arrive.
    const billedAgainstReceipt =
      config.slug === "receipt-notes"
        ? Math.max(
            billedValueByReceiptNote.get(record.id) ?? 0,
            // Combined bills only link the earliest receipt note by id — the rest
            // are recognized by their own reference/voucherNumber showing up in the
            // bill's " + "-joined reference text (see buildBilledAmountsByReceiptReference).
            sumMoney(
              Array.from(collectRecordReferences(record), (reference) =>
                billedValueByReceiptReference.get(buildReferenceKey(record.partyName, reference)) ?? 0,
              ),
            ),
          )
        : 0;
    const billedQtyAgainstReceipt =
      config.slug === "receipt-notes"
        ? Math.max(
            billedQtyByReceiptNote.get(record.id) ?? 0,
            Array.from(collectRecordReferences(record)).reduce(
              (sum, reference) => sum + (billedQtyByReference.get(buildReferenceKey(record.partyName, reference)) ?? 0),
              0,
            ),
          )
        : 0;
    const linkedPaidAmount =
      config.slug === "bills"
        ? sumMoney(
            Array.from(collectRecordReferences(record), (reference) =>
              paymentAmountsByReference.get(buildReferenceKey(record.partyName, reference)) ?? 0,
            ),
          )
        : 0;
    // A purchase return lowers what's actually still owed, but it's not a payment —
    // keep it out of paidAmount (which drives the "Paid"/"Partially Paid" split) and
    // subtract it from balance directly instead.
    const debitNoteAppliedAmount =
      config.slug === "bills"
        ? Math.max(
            debitNoteAmountsByBillId.get(record.id) ?? 0,
            sumMoney(
              Array.from(collectRecordReferences(record), (reference) =>
                debitNoteAmountsByReference.get(buildReferenceKey(record.partyName, reference)) ?? 0,
              ),
            ),
          )
        : 0;
    // An advance paid against the Order this bill descends from is real money
    // already settled against it, even though it predates the bill and is
    // linked to the Order, not to this bill (see resolveUpstreamPurchaseOrders).
    const linkedAdvanceAmount =
      config.slug === "bills"
        ? sumMoney(resolveUpstreamPurchaseOrders(record).map((order) => advancePaymentsByOrderId.get(order.id)?.amount ?? 0))
        : 0;
    const billPaymentBreakdown = config.slug === "bills"
      ? [
          ...getVoucherPaymentBreakdown(record),
          ...Array.from(
            new Set([record.reference, record.voucherNumber].map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
            (reference) => paymentBreakdownsByBillReference.get(buildReferenceKey(record.partyName, reference)) ?? [],
          ).flat(),
          ...resolveUpstreamPurchaseOrders(record).flatMap((order) => advancePaymentsByOrderId.get(order.id)?.breakdown ?? []),
        ]
      : [];
    const paidAmount = roundMoney(
      Math.min(
        amount,
        sumMoney([
          Math.max(derivePaidAmount(record, config.slug), linkedPaidAmount, receivedAgainstOrder, billedAgainstReceipt),
          linkedAdvanceAmount,
        ]),
      ),
    );
    const balance = Math.max(0, roundMoney(amount - debitNoteAppliedAmount - paidAmount));
    const linkedAdvance = config.slug === "orders"
      ? advancePaymentsByOrderId.get(record.id)
      : config.slug === "receipt-notes" && sourceRecord?.documentKind === "purchase-order"
        ? advancePaymentsByOrderId.get(sourceRecord.id)
        : undefined;
    const advancePaidAmount = roundMoney(
      Math.min(amount, config.slug === "bills" ? linkedAdvanceAmount : (linkedAdvance?.amount ?? 0)),
    );
    const financialDue = Math.max(0, roundMoney(amount - advancePaidAmount));
    const orderLike = isOrderLikeSection(config.slug);
    const receivedValue = orderLike ? paidAmount : 0;
    const remaining = orderLike ? Math.max(0, roundMoney(amount - receivedValue)) : balance;
    const typeLabel = orderLike ? getOrderLikeDocumentLabel(config.slug) : config.slug === "debit-notes" ? "Purchase Return" : config.shortLabel;

    return {
      id: `${config.slug}-${record.id}`,
      sourceId: record.id,
      sourceVoucherType: record.voucherType,
      openVoucherType: config.createVoucherType,
      documentNumber:
        config.slug === "bills" || isOrderLikeSection(config.slug) || config.slug === "debit-notes"
          ? record.reference?.trim() || record.voucherNumber
          : `${config.documentPrefix}-${record.reference?.trim() || record.voucherNumber}`,
      documentDate: record.voucherDate,
      createdAt: record.createdAt,
      partyName: record.partyName,
      reference: config.slug === "payment-out" ? record.voucherNumber : record.reference?.trim() || record.voucherNumber,
      paymentMethod: config.slug === "bills" && billPaymentBreakdown.length
        ? Array.from(new Set(billPaymentBreakdown.map((entry) => entry.method))).join(" + ")
        : (config.slug === "orders" || config.slug === "receipt-notes") && linkedAdvance?.methods.size
        ? Array.from(linkedAdvance.methods).sort().join(" + ")
        : derivePaymentMethod(record, config.slug),
      paymentAccount: config.slug === "bills" && billPaymentBreakdown.length
        ? Array.from(new Set(billPaymentBreakdown.map((entry) => entry.account))).join(" + ")
        : derivePaymentAccount(record, config.slug),
      amount,
      paidAmount,
      advancePaidAmount,
      financialDue,
      debitNoteAppliedAmount,
      balance,
      statusLabel: deriveRowStatus(record, config.slug, amount, paidAmount, balance),
      createdBy: record.enteredBy,
      expenseCategory: deriveExpenseCategory(record, config.slug),
      expenseLedgerId:
        config.slug === "expenses"
          ? (record.lines.find((line) => Number(line.debit || 0) > 0)?.accountId ?? null)
          : config.slug === "revenue"
            ? (record.lines.find((line) => Number(line.credit || 0) > 0)?.accountId ?? null)
            : null,
      tax: roundMoney(amount * 0.05),
      expectedDelivery: orderLike ? record.voucherDate : format(addDays(new Date(record.voucherDate), 7), "yyyy-MM-dd"),
      receivedValue,
      remaining,
      // For an order, this is its own ordered quantity. For a receipt note, this is
      // the *source purchase order's* total quantity — the user wants to see "100 of
      // [the PO's 500]", not "100 of [this note's own 100]", which told them nothing.
      orderedQty:
        config.slug === "orders"
          ? (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
          : config.slug === "receipt-notes"
            ? sourceItemQty
            : config.slug === "bills"
              ? sourceItemQty
              : 0,
      receivedQty:
        config.slug === "orders"
          ? Math.max(receivedQtyByOrder.get(record.id) ?? 0, referencedReceivedQty)
          : config.slug === "receipt-notes"
            ? (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
            : config.slug === "bills"
              ? (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
              : 0,
      cumulativeReceivedQty:
        config.slug === "receipt-notes"
          ? Math.max(record.sourceVoucherId ? receivedQtyByOrder.get(record.sourceVoucherId) ?? 0 : 0, cumulativeQtyViaLineReference)
          : 0,
      convertedQty:
        config.slug === "orders"
          ? Math.max(receivedQtyByOrder.get(record.id) ?? 0, referencedReceivedQty)
          : config.slug === "receipt-notes"
            ? billedQtyAgainstReceipt
            : 0,
      conversionTargetQty:
        config.slug === "orders" || config.slug === "receipt-notes"
          ? (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
          : 0,
      sourceReference,
      category:
        config.slug === "debit-notes"
          ? "Purchase Return"
          : config.slug === "expenses"
            ? "Operating Cost"
            : config.slug === "revenue"
              ? "Other Income"
              : config.slug === "receipt-notes"
                ? "Received Stock"
                : "Trade Procurement",
      type: typeLabel,
      settlement: record.settlementMode === "cash" ? "cash" : record.settlementMode === "bank" ? "bank" : "credit",
      costCenter: record.lines.find((line) => line.costCenter)?.costCenter || "Head Office",
      branch: "Main Branch",
      narration: record.narration || record.particulars,
      lineItems: (record.inventoryItems ?? []).map((item) => {
        const itemWarehouse =
          item.warehouse ??
          (item.warehouseId && item.warehouseId === record.warehouseId
            ? record.warehouse
            : !item.warehouseId
              ? record.warehouse
              : null);
        return {
          itemName: item.itemName,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          total: Number(item.quantity || 0) * Number(item.unitPrice || 0),
          warehouseId: item.warehouseId ?? record.warehouseId ?? null,
          warehouseName: itemWarehouse?.name ?? (item.warehouseId ? `Warehouse ${item.warehouseId.slice(0, 8)}` : "Not assigned"),
          warehouseCode: itemWarehouse?.code ?? "",
        };
      }),
      paymentBreakdown:
        config.slug === "payment-out"
          ? getVoucherPaymentBreakdown(record)
          : config.slug === "bills"
            ? billPaymentBreakdown
          : isOrderLikeSection(config.slug)
            ? (linkedAdvance?.breakdown ?? [])
            : [],
      billAllocations: config.slug === "payment-out" ? getVoucherBillAllocations(record) : [],
    } satisfies PurchaseRow;
  });
}

function matchesSavedFilter(row: PurchaseRow, filters: PurchaseWorkspaceFilters) {
  if (filters.savedFilter === "paid") {
    return row.balance <= 0;
  }

  if (filters.savedFilter === "due") {
    return row.balance > 0;
  }

  if (filters.savedFilter === "draft") {
    return row.statusLabel === "Draft";
  }

  return true;
}

function matchesColumnFilter(value: string, filter: ColumnFilterValue) {
  const haystack = normalizeString(value);

  // ISO yyyy-mm-dd strings compare correctly with plain string comparison, so no
  // Date parsing is needed here.
  if (filter.dateFrom || filter.dateTo) {
    if (filter.dateFrom && value < filter.dateFrom) {
      return false;
    }
    if (filter.dateTo && value > filter.dateTo) {
      return false;
    }
    return true;
  }

  if (filter.values.length > 0) {
    const checked = new Set(filter.values.map((entry) => normalizeString(entry)));
    return checked.has(haystack);
  }

  const needle = normalizeString(filter.value);
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

/** True for columns that hold an ISO date, where a custom from/to range makes more
 * sense than picking exact values off a checklist. */
function isDateColumn(columnId: FilterableColumnId) {
  return columnId === "date" || columnId === "expectedDelivery";
}

/** Money columns keep both the raw number and the formatted amount in one string so
 * either spelling can be searched. That join is only useful for matching, so the
 * filter checklist shows just the formatted half instead of "40000 BDT 40,000.00". */
function getColumnFilterLabel(value: string, columnId: FilterableColumnId) {
  if (columnId !== "amount" && columnId !== "paidAmount" && columnId !== "balance" && columnId !== "financialDue") {
    return value;
  }

  const firstSpace = value.indexOf(" ");
  return firstSpace === -1 ? value : value.slice(firstSpace + 1);
}

function getColumnValue(row: PurchaseRow, columnId: FilterableColumnId) {
  switch (columnId) {
    case "date":
      // Kept as the raw ISO string (not the localized display text) so it sorts and
      // range-compares correctly against a custom from/to date filter.
      return row.documentDate;
    case "documentNumber":
      return row.documentNumber;
    case "partyName":
      return row.partyName;
    case "reference":
      return row.reference;
    case "paymentMethod":
      return row.paymentMethod;
    case "paymentAccount":
      return row.paymentAccount;
    case "amount":
      return `${row.amount} ${formatCurrency(row.amount)}`;
    case "paidAmount":
      return `${row.paidAmount} ${formatCurrency(row.paidAmount)}`;
    case "balance":
      return `${row.balance} ${formatCurrency(row.balance)}`;
    case "status":
      return row.statusLabel;
    case "createdBy":
      return row.createdBy;
    case "expenseCategory":
      return row.expenseCategory;
    case "tax":
      return `${row.tax}`;
    case "expectedDelivery":
      return row.expectedDelivery;
    case "receivedValue":
      return `${row.receivedValue}`;
    case "receiptProgress":
      return `${row.receivedQty}/${row.orderedQty} ${row.statusLabel}`;
    case "financialDue":
      return `${row.financialDue} ${formatCurrency(row.financialDue)}`;
    case "remaining":
      return `${row.remaining}`;
    case "category":
      return row.category;
    case "type":
      return row.type;
    default:
      return "";
  }
}

function sortRows(rows: PurchaseRow[], sortKey: PurchaseSortKey, direction: "asc" | "desc") {
  return [...rows].sort((left, right) => {
    if (sortKey === "createdAt") {
      // The default transaction view is an activity feed: the record entered most
      // recently stays on top even when its business/document date was backdated.
      const comparison =
        left.createdAt.localeCompare(right.createdAt) ||
        left.documentDate.localeCompare(right.documentDate) ||
        left.id.localeCompare(right.id);
      return direction === "asc" ? comparison : -comparison;
    }

    if (sortKey === "date") {
      // Same-day rows break the tie by actual creation time, not by id — a UUID's
      // lexical order has nothing to do with when the record was actually added.
      const comparison = left.documentDate.localeCompare(right.documentDate) || left.createdAt.localeCompare(right.createdAt);
      return direction === "asc" ? comparison : -comparison;
    }

    const leftValue = getColumnValue(left, sortKey);
    const rightValue = getColumnValue(right, sortKey);
    const leftNumeric = Number(leftValue.replace(/[^0-9.-]/g, ""));
    const rightNumeric = Number(rightValue.replace(/[^0-9.-]/g, ""));
    const comparison =
      Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric) && /^(amount|paidAmount|balance|tax|receivedValue|financialDue|remaining)$/.test(sortKey)
        ? leftNumeric - rightNumeric
        : leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });

    return direction === "asc" ? comparison : -comparison;
  });
}

function statusTone(label: string): "green" | "blue" | "amber" | "red" | "slate" {
  const normalized = normalizeString(label);
  // Checked before the "billed"/"received" match below, so a still-in-progress
  // "Partially Billed"/"Partially Received" reads as amber, not green.
  if (normalized.includes("overdue") || normalized.includes("cancelled") || normalized.includes("remaining") || normalized.includes("unpaid")) {
    return "red";
  }
  if (normalized.includes("partially") || normalized.includes("draft") || normalized.includes("pending") || normalized.includes("receivable") || normalized.includes("payable")) {
    return "amber";
  }
  if (
    normalized.includes("paid") ||
    normalized.includes("posted") ||
    normalized.includes("converted") ||
    normalized.includes("adjusted") ||
    normalized.includes("billed") ||
    normalized.includes("completed") ||
    normalized.includes("fully received") ||
    normalized.includes("fully billed")
  ) {
    return "green";
  }
  if (normalized.includes("sent") || normalized.includes("approved") || normalized.includes("received")) {
    return "blue";
  }
  return "slate";
}

function getColumns(section: PurchaseWorkspaceSection, showCreatedBy: boolean): ColumnDefinition[] {
  const common = [{ id: "date", label: "Date", width: "140px", sticky: "left", filterable: true }] as ColumnDefinition[];

  if (section === "bills") {
    return [
      ...common,
      { id: "documentNumber", label: "Invoice No.", width: "220px", filterable: true },
      { id: "partyName", label: "Party Name", width: "190px", filterable: true },
      { id: "paymentMethod", label: "Payment Type", width: "140px", filterable: true },
      { id: "amount", label: "Amount", width: "145px", align: "right", filterable: true },
      { id: "balance", label: "Balance Due", width: "145px", align: "right", filterable: true },
      { id: "status", label: "Status", width: "110px", align: "center", filterable: true },
      ...(showCreatedBy ? ([{ id: "createdBy", label: "Created By", width: "170px", filterable: true }] as ColumnDefinition[]) : []),
      { id: "actions", label: "Actions", width: "52px", align: "center" },
    ];
  }

  if (section === "payment-out") {
    return [
      ...common,
      { id: "documentNumber", label: "Voucher No.", width: "180px", filterable: true },
      { id: "partyName", label: "Supplier / Payee", width: "220px", filterable: true },
      { id: "paymentAccount", label: "Payment Account", width: "180px", filterable: true },
      { id: "paymentMethod", label: "Payment Method", width: "160px", filterable: true },
      { id: "reference", label: "Reference", width: "170px", filterable: true },
      { id: "amount", label: "Amount", width: "150px", align: "right", filterable: true },
      { id: "status", label: "Status", width: "140px", align: "center", filterable: true },
      ...(showCreatedBy ? ([{ id: "createdBy", label: "Created By", width: "170px", filterable: true }] as ColumnDefinition[]) : []),
      { id: "actions", label: "Actions", width: "52px", align: "center" },
    ];
  }

  if (section === "expenses") {
    return [
      ...common,
      { id: "documentNumber", label: "Voucher No.", width: "180px", filterable: true },
      { id: "expenseCategory", label: "Expense Category", width: "210px", filterable: true },
      { id: "partyName", label: "Payee", width: "190px", filterable: true },
      { id: "paymentAccount", label: "Payment Account", width: "180px", filterable: true },
      { id: "paymentMethod", label: "Payment Method", width: "160px", filterable: true },
      { id: "amount", label: "Amount", width: "150px", align: "right", filterable: true },
      { id: "tax", label: "Tax", width: "120px", align: "right", filterable: true },
      { id: "status", label: "Status", width: "140px", align: "center", filterable: true },
      ...(showCreatedBy ? ([{ id: "createdBy", label: "Created By", width: "170px", filterable: true }] as ColumnDefinition[]) : []),
      { id: "actions", label: "Actions", width: "160px", align: "right" },
    ];
  }

  if (section === "revenue") {
    return [
      ...common,
      { id: "documentNumber", label: "Voucher No.", width: "180px", filterable: true },
      { id: "expenseCategory", label: "Revenue Ledger", width: "200px", filterable: true },
      { id: "partyName", label: "Received From", width: "190px", filterable: true },
      { id: "paymentAccount", label: "Payment Account", width: "180px", filterable: true },
      { id: "paymentMethod", label: "Payment Type", width: "150px", filterable: true },
      { id: "amount", label: "Amount", width: "150px", align: "right", filterable: true },
      { id: "status", label: "Status", width: "140px", align: "center", filterable: true },
      ...(showCreatedBy ? ([{ id: "createdBy", label: "Created By", width: "170px", filterable: true }] as ColumnDefinition[]) : []),
      { id: "actions", label: "Actions", width: "160px", align: "right" },
    ];
  }

  if (isOrderLikeSection(section)) {
    return [
      {
        id: "date",
        label: section === "orders" ? "Order Date" : "Receipt Date",
        width: "140px",
        sticky: "left",
        filterable: true,
      },
      {
        id: "documentNumber",
        label: section === "receipt-notes" ? "Receipt Note No." : "PO No.",
        width: "180px",
        filterable: true,
      },
      { id: "partyName", label: "Supplier", width: "220px", filterable: true },
      {
        id: "amount",
        label: section === "receipt-notes" ? "Receipt Value" : "Order Value",
        width: "150px",
        align: "right",
        filterable: true,
      },
      { id: "receiptProgress", label: section === "orders" ? "Receipt" : "PO Receipt", width: "160px", filterable: true },
      section === "receipt-notes"
        ? { id: "remaining", label: "Pending Bill", width: "140px", align: "right", filterable: true }
        : { id: "financialDue", label: "Payable Due", width: "140px", align: "right", filterable: true },
      { id: "status", label: section === "orders" ? "Receipt Status" : "Billing Status", width: "150px", align: "center", filterable: true },
      ...(showCreatedBy ? ([{ id: "createdBy", label: "Created By", width: "170px", filterable: true }] as ColumnDefinition[]) : []),
      { id: "actions", label: "Actions", width: "160px", align: "right" },
    ];
  }

  if (section === "debit-notes") {
    return [
      ...common,
      { id: "documentNumber", label: "Purchase Return No.", width: "190px", filterable: true },
      { id: "partyName", label: "Supplier", width: "220px", filterable: true },
      { id: "category", label: "Category", width: "170px", filterable: true },
      { id: "type", label: "Type", width: "150px", filterable: true },
      { id: "amount", label: "Total", width: "140px", align: "right", filterable: true },
      { id: "paidAmount", label: "Adjusted", width: "150px", align: "right", filterable: true },
      { id: "balance", label: "Balance", width: "140px", align: "right", filterable: true },
      { id: "status", label: "Status", width: "140px", align: "center", filterable: true },
      { id: "actions", label: "Actions", width: "160px", align: "right" },
    ];
  }

  return [
    ...common,
    { id: "documentNumber", label: "Voucher No.", width: "180px", filterable: true },
    { id: "reference", label: "Reference", width: "180px", filterable: true },
    { id: "paymentAccount", label: "Transfer Account", width: "180px", filterable: true },
    { id: "paymentMethod", label: "Method", width: "150px", filterable: true },
    { id: "amount", label: "Amount", width: "150px", align: "right", filterable: true },
    { id: "status", label: "Status", width: "140px", align: "center", filterable: true },
    ...(showCreatedBy ? ([{ id: "createdBy", label: "Created By", width: "170px", filterable: true }] as ColumnDefinition[]) : []),
    { id: "actions", label: "Actions", width: "160px", align: "right" },
  ];
}

function columnFilterLabel(columnId: FilterableColumnId) {
  return {
    date: "Date",
    documentNumber: "Document number",
    partyName: "Party name",
    reference: "Reference",
    paymentMethod: "Payment method",
    paymentAccount: "Payment account",
    amount: "Amount",
    paidAmount: "Paid amount",
    balance: "Balance",
    status: "Status",
    createdBy: "Created by",
    expenseCategory: "Expense category",
    tax: "Tax",
    expectedDelivery: "Expected delivery",
    receivedValue: "Received value",
    receiptProgress: "Receipt progress",
    financialDue: "Payable due",
    remaining: "Remaining",
    category: "Category",
    type: "Type",
  }[columnId];
}

type ImportCsvRow = { party: string; item: string; quantity: string; unitPrice: string; reference: string; date: string };

/**
 * Minimal CSV reader for the bulk-import format (Party, Item, Quantity, Unit Price,
 * Reference, Date). Handles quoted fields containing commas so a party/item name with
 * a comma in it doesn't split into the wrong columns.
 */
function parseImportCsv(text: string): { rows: ImportCsvRow[] } {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [] };
  }

  function splitCsvLine(line: string) {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    cells.push(current);
    return cells.map((cell) => cell.trim());
  }

  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const columnIndex = (name: string) => header.findIndex((cell) => cell.includes(name));
  const partyIdx = columnIndex("party") >= 0 ? columnIndex("party") : columnIndex("supplier");
  const itemIdx = columnIndex("item");
  const quantityIdx = columnIndex("quantity") >= 0 ? columnIndex("quantity") : columnIndex("qty");
  const priceIdx = columnIndex("price") >= 0 ? columnIndex("price") : columnIndex("rate");
  const referenceIdx = columnIndex("reference");
  const dateIdx = columnIndex("date");

  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return {
      party: partyIdx >= 0 ? cells[partyIdx] ?? "" : "",
      item: itemIdx >= 0 ? cells[itemIdx] ?? "" : "",
      quantity: quantityIdx >= 0 ? cells[quantityIdx] ?? "" : "",
      unitPrice: priceIdx >= 0 ? cells[priceIdx] ?? "" : "",
      reference: referenceIdx >= 0 ? cells[referenceIdx] ?? "" : "",
      date: dateIdx >= 0 ? cells[dateIdx] ?? "" : "",
    };
  });

  return { rows };
}

function downloadImportSampleCsv() {
  downloadCsv("purchase-order-import-sample.csv", [
    { Party: "Karim Supplier", Item: "Hulala 32\"", Quantity: 10, "Unit Price": 40000, Reference: "", Date: format(new Date(), "yyyy-MM-dd") },
  ]);
}

function downloadExcel(fileName: string, rows: Array<Record<string, string | number>>) {
  if (typeof window === "undefined" || rows.length === 0) {
    return;
  }

  const headers = Object.keys(rows[0]);
  const html = `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${headers.map((header) => `<td>${String(row[header] ?? "")}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>
  `;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printRegister({
  title,
  workspaceName,
  periodLabel,
  rows,
  totals,
}: {
  title: string;
  workspaceName: string;
  periodLabel: string;
  rows: PurchaseRow[];
  totals: { amount: number; paid: number; balance: number };
}) {
  if (typeof window === "undefined") {
    return;
  }

  const printable = openPrintWindow("width=1280,height=900");
  if (!printable) {
    toast.error("Popup blocked while opening print layout");
    return;
  }

  printable.document.write(`
    <html>
      <head>
        <title>${workspaceName} - ${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #12284a; }
          h1 { margin: 0 0 6px; font-size: 24px; }
          p { margin: 0 0 4px; color: #52637f; }
          table { width: 100%; border-collapse: collapse; margin-top: 22px; }
          th, td { border: 1px solid #d8e1ee; padding: 8px 10px; font-size: 12px; text-align: left; }
          th { background: #f5f8fc; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; }
          td.amount { text-align: right; }
          .summary { margin-top: 16px; display: flex; gap: 16px; }
          .summary div { padding: 10px 12px; border: 1px solid #d8e1ee; border-radius: 10px; }
        </style>
      </head>
      <body>
        <h1>${workspaceName}</h1>
        <p>${title}</p>
        <p>Period: ${periodLabel}</p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Document No.</th>
              <th>Party</th>
              <th>Payment Method</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <td>${formatDate(row.documentDate)}</td>
                    <td>${row.documentNumber}</td>
                    <td>${row.partyName}</td>
                    <td>${row.paymentMethod}</td>
                    <td class="amount">${formatCurrency(row.amount)}</td>
                    <td class="amount">${formatCurrency(row.paidAmount)}</td>
                    <td class="amount">${formatCurrency(row.balance)}</td>
                    <td>${row.statusLabel}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
        <div class="summary">
          <div>Total: ${formatCurrency(totals.amount)}</div>
          <div>Paid: ${formatCurrency(totals.paid)}</div>
          <div>Balance: ${formatCurrency(totals.balance)}</div>
        </div>
      </body>
    </html>
  `);
  printWindowWhenReady(printable);
}

export function PurchaseWorkspaceScreen({ section }: { section: PurchaseWorkspaceSection }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { mode, session } = useSessionContext();
  const workflowSettingsQuery = useWorkflowSettingsQuery(
    mode,
    session?.workspaceId ?? (mode === "api" ? null : "workspace"),
  );
  const workflowSettings = workflowSettingsQuery.data ?? defaultWorkflowSettings;
  const workflowSettingsLoadState: WorkflowSettingsLoadState = workflowSettingsQuery.isError
    ? "ERROR"
    : workflowSettingsQuery.isPending
      ? "PENDING"
      : "READY";
  const setCreateMenuOpen = useUiStore((state) => state.setCreateMenuOpen);
  const tableScrollRef = useTransientScrollbar<HTMLDivElement>();
  const purchaseEditorRequestRef = useRef("");
  const consumedExpenseLedgerRequestRef = useRef("");
  const postingRangeInitializedRef = useRef("");
  const config = getPurchaseWorkspaceSection(section);
  const primaryActionLabel = section === "orders" && workflowSettings.purchaseWorkflow === "DIRECT"
    ? "Advanced Mode Required"
    : section === "receipt-notes"
    ? "Select Purchase Order"
    : section === "bills" && workflowSettings.purchaseWorkflow === "ORDER_BASED"
      ? "Add Purchase Order"
      : config.createLabel;
  const isBillsWorkspace = section === "bills";
  const isPaymentOutWorkspace = section === "payment-out";
  const isExpensesWorkspace = section === "expenses";
  const isOrderStyleWorkspace = isOrderLikeSection(section);
  const isDebitNotesWorkspace = section === "debit-notes";
  const isRevenueWorkspace = section === "revenue";
  const isLedgerRegisterWorkspace = isExpensesWorkspace || isRevenueWorkspace;
  const workspace = useMemo(() => getWorkspaceContext(mode, session?.workspaceId), [mode, session?.workspaceId]);
  const defaultFilters = useMemo(() => {
    const defaults = buildDefaultFilters(workspace, section);
    if (section !== "bills") return defaults;

    const preset = searchParams.get("preset") as PurchasePreset | null;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const firm = searchParams.get("firm") as PurchaseWorkspaceFilters["firm"] | null;
    const validPreset = preset && purchasePresetOptions.some((option) => option.value === preset) ? preset : null;
    const validFirm = firm === "active" || firm === "all" ? firm : null;
    if (!validPreset || !from || !to) return defaults;

    return { ...defaults, preset: validPreset, from, to, firm: validFirm ?? defaults.firm };
  }, [searchParams, section, workspace]);
  const readiness = useMemo(() => {
    if (mode === "api" || typeof window === "undefined") {
      return {
        isReadyForTransactions: true,
        totalChecks: 8,
        passedChecks: 8,
        criticalMissingCount: 0,
        checks: [],
      };
    }
    return evaluateMasterDataReadiness(readDataset(mode), session?.workspaceId);
  }, [mode, session?.workspaceId]);
  const settingsStorageKey = `bizovix:purchase-workspace:${section}:settings`;
  const restoredFilters = useMemo(() => {
    if (!isLedgerRegisterWorkspace || typeof window === "undefined") {
      return defaultFilters;
    }

    try {
      const raw = window.localStorage.getItem(settingsStorageKey);
      const parsed = raw
        ? (JSON.parse(raw) as { filters?: Partial<PurchaseWorkspaceFilters> })
        : null;
      const saved = parsed?.filters;
      const validPreset = saved?.preset && purchasePresetOptions.some((option) => option.value === saved.preset);

      if (!saved || !validPreset || !saved.from || !saved.to) {
        return defaultFilters;
      }

      return {
        ...defaultFilters,
        ...saved,
        preset: saved.preset as PurchasePreset,
        from: saved.from,
        to: saved.to,
      };
    } catch {
      return defaultFilters;
    }
  }, [defaultFilters, isLedgerRegisterWorkspace, settingsStorageKey]);
  const columnFilterPopoverRef = useRef<HTMLDivElement | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const paymentOutShareMenuRef = useRef<HTMLDivElement | null>(null);
  const bulkActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const bulkImportInputRef = useRef<HTMLInputElement | null>(null);
  const invoicePadInputRef = useRef<HTMLInputElement | null>(null);

  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<PurchaseWorkspaceFilters>(restoredFilters);
  const [filters, setFilters] = useState<PurchaseWorkspaceFilters>(restoredFilters);
  const [sortKey, setSortKey] = useState<PurchaseSortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnId, boolean>>(columnDefaultVisibility);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [bulkActionsMenuOpen, setBulkActionsMenuOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [deleteRowTarget, setDeleteRowTarget] = useState<PurchaseRow | null>(null);
  const [deletingRow, setDeletingRow] = useState(false);
  const [page, setPage] = useState(1);
  // Lazy-initialised straight from storage (rather than defaulting to 10 and
  // waiting for the restore effect below to correct it) so a fresh page load
  // renders with the saved page size immediately instead of flashing "10 / page"
  // for a frame before snapping to whatever was actually chosen last time.
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window === "undefined") {
      return 10;
    }

    try {
      const raw = window.localStorage.getItem(settingsStorageKey);
      const parsed = raw ? (JSON.parse(raw) as { pageSize?: number }) : null;
      return parsed?.pageSize && pageSizeOptions.includes(parsed.pageSize) ? parsed.pageSize : 10;
    } catch {
      return 10;
    }
  });
  const [denseTable, setDenseTable] = useState(true);
  const [showCreatedBy, setShowCreatedBy] = useState(false);
  const [stickyHeader, setStickyHeader] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<PurchaseRow | null>(null);
  const [auditRow, setAuditRow] = useState<PurchaseRow | null>(null);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<FilterableColumnId, ColumnFilterValue>>>({});
  const [columnFilterPopover, setColumnFilterPopover] = useState<ColumnFilterPopoverState | null>(null);
  const [columnFilterDraft, setColumnFilterDraft] = useState<ColumnFilterValue>(defaultColumnFilter);
  const [manualRefreshActive, setManualRefreshActive] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [paymentOutDialogOpen, setPaymentOutDialogOpen] = useState(false);
  const [paymentOutDialogForm, setPaymentOutDialogForm] = useState<PaymentOutDialogState>(() => buildPaymentOutDialogState());
  const [paymentOutDialogSaving, setPaymentOutDialogSaving] = useState(false);
  const [paymentOutAllocations, setPaymentOutAllocations] = useState<PaymentOutBillAllocation[]>([]);
  const [paymentOutDescriptionOpen, setPaymentOutDescriptionOpen] = useState(false);
  const [paymentOutShareMenuOpen, setPaymentOutShareMenuOpen] = useState(false);
  const [purchaseEditorState, setPurchaseEditorState] = useState<PurchaseEditorState | null>(null);
  const [previewDialog, setPreviewDialog] = useState<PreviewDialogState | null>(null);
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("default");
  const [expenseCategorySearch, setExpenseCategorySearch] = useState("");
  const [expenseItemSearch, setExpenseItemSearch] = useState("");
  const [activeExpenseAccountId, setActiveExpenseAccountId] = useState<string | null>(null);
  const expenseAccountRowRefs = useRef(new Map<string, HTMLDivElement>());
  const [expenseView, setExpenseView] = useState<ExpenseMasterView>("ledger");
  const [expenseAccountEditor, setExpenseAccountEditor] = useState<ExpenseAccountEditorState | null>(null);
  const [expenseAccountEditorError, setExpenseAccountEditorError] = useState<string | null>(null);
  const [expenseAccountMenu, setExpenseAccountMenu] = useState<ExpenseAccountMenuState | null>(null);
  const [expenseAccountDeleteTarget, setExpenseAccountDeleteTarget] = useState<ExpenseMasterSummary | null>(null);
  const [expenseAccountDeleting, setExpenseAccountDeleting] = useState(false);

  function clearPurchaseEditorQuery() {
    if (!isDebitNotesWorkspace) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    const editorKeys = ["create", "edit", "duplicate", "sourceVoucherId", "fromVoucher", "workflow", "open"];
    const hasEditorQuery = editorKeys.some((key) => nextParams.has(key));
    if (!hasEditorQuery) {
      return;
    }

    editorKeys.forEach((key) => nextParams.delete(key));
    const nextQuery = nextParams.toString();
    const targetRoute = buildPurchaseWorkspaceRoute(mode, section);
    startTransition(() => {
      router.replace(nextQuery ? `${targetRoute}?${nextQuery}` : targetRoute, { scroll: false });
    });
  }

  const query = useDayBookQuery(mode, {
    workspaceId: session?.workspaceId,
    voucherType: "all",
    status: "all",
    enteredBy: "all",
    query: "",
    from: filters.from,
    to: filters.to,
  });
  const postingAnchorQuery = useDayBookQuery(mode, {
    workspaceId: session?.workspaceId,
    voucherType: "all",
    status: "all",
    enteredBy: "all",
    query: "",
  });
  const paymentOutMoneyAccountsQuery = useMoneyAccountsQuery(paymentOutDialogOpen && mode === "api");

  useEffect(() => {
    const range = getPurchaseSectionPostingMonthRange(postingAnchorQuery.data ?? [], section);
    if (!range) return;
    const key = `${session?.workspaceId ?? "default"}:${section}:${range.from}:${range.to}`;
    if (postingRangeInitializedRef.current === key) return;
    // Resolve only the Last Posting Month placeholder. A late background
    // response must never replace a Custom/Financial Year range selected by
    // the user while the request was loading.
    setDraftFilters((current) => current.preset === "last-posting-month"
      ? { ...current, from: range.from, to: range.to }
      : current);
    setFilters((current) => current.preset === "last-posting-month"
      ? { ...current, from: range.from, to: range.to }
      : current);
    postingRangeInitializedRef.current = key;
  }, [postingAnchorQuery.data, section, session?.workspaceId]);
  const expenseAccountTreeQuery = useAccountTreeQuery(isLedgerRegisterWorkspace && mode === "api");
  const createExpenseAccountMutation = useCreateAccountMutation();
  const updateExpenseAccountMutation = useUpdateAccountMutation();
  const reparentExpenseAccountMutation = useReparentAccountMutation();
  const deleteExpenseAccountMutation = useDeleteAccountMutation();

  // Account Code is always server-generated (see AccountsService.suggestCode) —
  // this dialog only previews it, the same way chart-of-accounts-panel.tsx does.
  const [expenseAccountDebouncedName, setExpenseAccountDebouncedName] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setExpenseAccountDebouncedName(expenseAccountEditor?.name ?? ""), 400);
    return () => clearTimeout(timer);
  }, [expenseAccountEditor?.name]);

  const expenseAccountSuggestCodeQuery = useSuggestAccountCodeQuery(
    {
      level: expenseAccountEditor?.kind === "ledger" ? "LEDGER" : "CATEGORY",
      nature: expenseAccountEditor?.nature ?? "INDIRECT_EXPENSE",
      parentId: expenseAccountEditor?.parentId || null,
      name: expenseAccountDebouncedName,
    },
    Boolean(expenseAccountEditor) && expenseAccountEditor?.mode === "create",
  );

  useEffect(() => {
    const suggestedCode = expenseAccountSuggestCodeQuery.data?.code;
    if (suggestedCode && expenseAccountEditor?.mode === "create") {
      setExpenseAccountEditor((current) => (current && current.mode === "create" ? { ...current, code: suggestedCode } : current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseAccountSuggestCodeQuery.data?.code, expenseAccountEditor?.mode]);

  const previewParties = useMemo(() => {
    if (!session?.workspaceId || mode === "api") {
      return [];
    }

    const dataset = readDataset(mode);
    return dataset.parties.filter((party) => party.workspaceId === session.workspaceId);
  }, [mode, session?.workspaceId]);

  useEffect(() => {
    setDraftFilters(restoredFilters);
    setFilters(restoredFilters);
  }, [restoredFilters]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(settingsStorageKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        denseTable?: boolean;
        showCreatedBy?: boolean;
        stickyHeader?: boolean;
        columnVisibility?: Partial<Record<ColumnId, boolean>>;
        pageSize?: number;
        filters?: Partial<PurchaseWorkspaceFilters>;
      };
      setDenseTable(parsed.denseTable ?? true);
      setShowCreatedBy(parsed.showCreatedBy ?? false);
      setStickyHeader(parsed.stickyHeader ?? true);
      setPageSize(parsed.pageSize && pageSizeOptions.includes(parsed.pageSize) ? parsed.pageSize : 10);
      setColumnVisibility((current) => ({
        ...current,
        ...(parsed.columnVisibility ?? {}),
      }));
    } catch {
      window.localStorage.removeItem(settingsStorageKey);
    }
  }, [settingsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      settingsStorageKey,
      JSON.stringify({
        denseTable,
        showCreatedBy,
        stickyHeader,
        pageSize,
        filters: isLedgerRegisterWorkspace ? filters : undefined,
        columnVisibility,
      }),
    );
  }, [columnVisibility, denseTable, filters, isLedgerRegisterWorkspace, pageSize, settingsStorageKey, showCreatedBy, stickyHeader]);

  useEffect(() => {
    setColumnVisibility((current) => ({
      ...current,
      createdBy: showCreatedBy,
    }));
  }, [showCreatedBy]);

  useEffect(() => {
    if (!isDebitNotesWorkspace) {
      return;
    }

    const createValue = searchParams.get("create");
    const editId = searchParams.get("edit");
    const duplicateId = searchParams.get("duplicate");
    const sourceVoucherId = searchParams.get("sourceVoucherId") ?? searchParams.get("fromVoucher");
    const workflow = searchParams.get("workflow");
    const shouldCreate = createValue === "1" || createValue === "true";

    if (!shouldCreate && !editId && !duplicateId && !sourceVoucherId) {
      return;
    }

    const requestKey = [section, createValue ?? "", editId ?? "", duplicateId ?? "", sourceVoucherId ?? "", workflow ?? "", searchParams.get("open") ?? "initial"].join(":");
    if (purchaseEditorRequestRef.current === requestKey) {
      return;
    }

    setPurchaseEditorState({
      editId,
      duplicateId,
      sourceVoucherId,
      workflow,
    });
    setOpenRowMenuId(null);
    setDetailRow(null);
    useUiStore.getState().setCreateMenuOpen(false);
    purchaseEditorRequestRef.current = requestKey;
  }, [isDebitNotesWorkspace, searchParams, section]);

  useEffect(() => {
    const handler = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      const targetElement = event.target instanceof Element ? event.target : null;
      // The trigger owns the toggle. Treating its mousedown as an outside click
      // closes the popover just before onClick and immediately reopens it.
      if (targetElement?.closest('button[aria-label^="Filter "]')) {
        return;
      }
      if (columnFilterPopoverRef.current && !columnFilterPopoverRef.current.contains(target)) {
        setColumnFilterPopover(null);
      }
      if (
        rowMenuRef.current &&
        !rowMenuRef.current.contains(target) &&
        !targetElement?.closest("[data-row-menu-trigger]")
      ) {
        setOpenRowMenuId(null);
      }
      if (paymentOutShareMenuRef.current && !paymentOutShareMenuRef.current.contains(target)) {
        setPaymentOutShareMenuOpen(false);
      }
      if (bulkActionsMenuRef.current && !bulkActionsMenuRef.current.contains(target)) {
        setBulkActionsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setSelectedRowIds([]);
    setPage(1);
  }, [section, filters, sortDirection, sortKey, pageSize, columnFilters]);

  const rawRows = useMemo(() => buildPurchaseRows(query.data ?? [], config), [config, query.data]);
  // Independent of whichever section is currently open — Payment-Out needs to look up a
  // party's outstanding bills regardless of which list the user is looking at.
  const billsForPaymentOut = useMemo(() => buildPurchaseRows(query.data ?? [], getPurchaseWorkspaceSection("bills")), [query.data]);
  // Same idea for the Bills page: it needs to know how many Receipt Notes are
  // still sitting unbilled system-wide, not just the bills currently listed.
  const receiptNotesForPendingBill = useMemo(
    () => buildPurchaseRows(query.data ?? [], getPurchaseWorkspaceSection("receipt-notes")),
    [query.data],
  );
  const pendingPurchaseBillTotal = useMemo(
    () => receiptNotesForPendingBill.reduce((sum, row) => sum + row.remaining, 0),
    [receiptNotesForPendingBill],
  );
  const outstandingBillsForPaymentOutParty = useMemo(() => {
    const partyName = paymentOutDialogForm.partyName.trim().toLowerCase();
    if (!partyName) {
      return [];
    }

    return billsForPaymentOut
      .filter((row) => row.partyName.trim().toLowerCase() === partyName && row.balance > 0 && row.statusLabel !== "Cancelled")
      .sort((left, right) => left.documentDate.localeCompare(right.documentDate) || left.createdAt.localeCompare(right.createdAt));
  }, [billsForPaymentOut, paymentOutDialogForm.partyName]);

  // Defaults the payment to settle the party's oldest outstanding bills first — the
  // first bill is filled up to its balance, the leftover rolls into the next one, and
  // so on. Only runs for a brand-new payment; editing an existing one leaves this alone.
  // Re-running only on party/paid-amount change (not on the allocation rows themselves)
  // means a row the user has hand-edited stays put until one of those two changes again.
  useEffect(() => {
    if (paymentOutDialogForm.sourceId) {
      return;
    }

    const paidTotal = Number(paymentOutDialogForm.amount || 0);
    if (!outstandingBillsForPaymentOutParty.length) {
      setPaymentOutAllocations([]);
      return;
    }

    let remaining = Math.max(0, paidTotal);
    setPaymentOutAllocations(
      outstandingBillsForPaymentOutParty.map((bill) => {
        const applied = Math.min(bill.balance, remaining);
        remaining = Math.max(0, remaining - applied);
        return {
          sourceId: bill.sourceId,
          documentNumber: bill.documentNumber,
          reference: bill.reference,
          documentDate: bill.documentDate,
          billAmount: bill.amount,
          billBalance: bill.balance,
          applied: applied > 0 ? String(applied) : "",
        };
      }),
    );
  }, [outstandingBillsForPaymentOutParty, paymentOutDialogForm.amount, paymentOutDialogForm.sourceId]);

  function updatePaymentOutAllocation(sourceId: string, value: string) {
    setPaymentOutAllocations((current) => current.map((row) => (row.sourceId === sourceId ? { ...row, applied: value } : row)));
  }

  const paymentOutAllocatedTotal = sumMoney(paymentOutAllocations.map((row) => Number(row.applied || 0)));
  const columns = useMemo(() => getColumns(section, showCreatedBy), [section, showCreatedBy]);
  const purchaseColumnWidthDefaults = useMemo<Record<string, number>>(
    () => ({
      ...Object.fromEntries(
        columns
          .filter((column): column is ColumnDefinition & { width: string } => Boolean(column.width))
          .map((column) => [column.id, Number.parseInt(column.width, 10)]),
      ),
      reference: 150,
      no: 90,
      due: 130,
      party: 220,
      action: 180,
      menu: 48,
      serial: 72,
    }),
    [columns],
  );
  const { beginResize: beginColumnResize, columnWidths } = useColumnResize<string>(purchaseColumnWidthDefaults);

  const supplierOptions = useMemo(
    () => Array.from(new Set(rawRows.map((row) => row.partyName))).filter(Boolean).sort((left, right) => left.localeCompare(right)),
    [rawRows],
  );
  // Payment-Out's own party list also has to include suppliers who only have bills and
  // no prior payment yet — supplierOptions alone (built from the current section's rows)
  // misses them entirely when Payment-Out itself has no history for that supplier.
  const paymentOutPartyOptions = useMemo(
    () => Array.from(new Set([...supplierOptions, ...billsForPaymentOut.map((row) => row.partyName)])).filter(Boolean).sort((left, right) => left.localeCompare(right)),
    [supplierOptions, billsForPaymentOut],
  );
  const paymentOutAccountType = paymentOutMoneyAccountType(paymentOutDialogForm.paymentMethod);
  const paymentOutMoneyAccountOptions = useMemo(
    () => (paymentOutMoneyAccountsQuery.data ?? []).filter((account) => account.type === paymentOutAccountType),
    [paymentOutAccountType, paymentOutMoneyAccountsQuery.data],
  );
  useEffect(() => {
    if (!paymentOutDialogOpen || mode !== "api" || !paymentOutMoneyAccountOptions.length) return;
    const selectedIsCompatible = paymentOutMoneyAccountOptions.some(
      (account) => account.id === paymentOutDialogForm.moneyAccountId,
    );
    if (selectedIsCompatible) return;
    const preferred = paymentOutAccountType === "CASH"
      ? paymentOutMoneyAccountOptions.find((account) => normalizeString(account.name) === "cash in hand")
      : undefined;
    setPaymentOutDialogForm((current) => ({
      ...current,
      moneyAccountId: (preferred ?? paymentOutMoneyAccountOptions[0])?.id ?? "",
    }));
  }, [mode, paymentOutAccountType, paymentOutDialogForm.moneyAccountId, paymentOutDialogOpen, paymentOutMoneyAccountOptions]);
  const statusOptions = useMemo(
    () => Array.from(new Set(rawRows.map((row) => row.statusLabel))).filter(Boolean).sort((left, right) => left.localeCompare(right)),
    [rawRows],
  );
  const paymentMethodOptions = useMemo(
    () => Array.from(new Set(rawRows.map((row) => row.paymentMethod))).filter(Boolean).sort((left, right) => left.localeCompare(right)),
    [rawRows],
  );
  const createdByOptions = useMemo(
    () => Array.from(new Set(rawRows.map((row) => row.createdBy))).filter(Boolean).sort((left, right) => left.localeCompare(right)),
    [rawRows],
  );
  const costCenterOptions = useMemo(
    () => Array.from(new Set(rawRows.map((row) => row.costCenter))).filter(Boolean).sort((left, right) => left.localeCompare(right)),
    [rawRows],
  );
  const voucherTypeOptions = useMemo(
    () => Array.from(new Set(rawRows.map((row) => row.sourceVoucherType))).filter(Boolean).sort((left, right) => left.localeCompare(right)),
    [rawRows],
  );

  const filteredRows = useMemo(() => {
    const searchNeedle = normalizeString(filters.searchQuery);

    return rawRows.filter((row) => {
      const matchesSearch =
        !searchNeedle ||
        `${row.documentNumber} ${row.partyName} ${row.reference} ${row.paymentMethod} ${row.amount} ${row.narration} ${row.paymentAccount}`
          .toLowerCase()
          .includes(searchNeedle);
      const matchesSupplier = filters.supplier === "all" || row.partyName === filters.supplier;
      const matchesStatus = filters.status === "all" || row.statusLabel === filters.status;
      const matchesMethod = filters.paymentMethod === "all" || row.paymentMethod === filters.paymentMethod;
      const matchesVoucherType = filters.voucherType === "all" || row.sourceVoucherType === filters.voucherType;
      const matchesCreatedBy = filters.createdBy === "all" || row.createdBy === filters.createdBy;
      const matchesBranch = filters.branch === "all" || row.branch.toLowerCase().includes(normalizeString(filters.branch));
      const matchesCostCenter = filters.costCenter === "all" || row.costCenter === filters.costCenter;
      const matchesSaved = matchesSavedFilter(row, filters);
      const matchesColumnFilters = Object.entries(columnFilters).every(([columnId, filter]) => {
        if (!filter) {
          return true;
        }

        return matchesColumnFilter(getColumnValue(row, columnId as FilterableColumnId), filter);
      });

      return matchesSearch && matchesSupplier && matchesStatus && matchesMethod && matchesVoucherType && matchesCreatedBy && matchesBranch && matchesCostCenter && matchesSaved && matchesColumnFilters;
    });
  }, [columnFilters, filters, rawRows]);

  const rows = useMemo(() => sortRows(filteredRows, sortKey, sortDirection), [filteredRows, sortDirection, sortKey]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, rows]);
  const visibleRowCount = pagedRows.length;
  const allVisibleSelected = visibleRowCount > 0 && pagedRows.every((row) => selectedRowIds.includes(row.id));
  const selectedRows = useMemo(() => rows.filter((row) => selectedRowIds.includes(row.id)), [rows, selectedRowIds]);
  const orderLikeKpiTotals = useMemo(
    () => ({
      processed: sumMoney(rows.map((row) => row.receivedValue)),
      pending: sumMoney(rows.map((row) => row.remaining)),
      total: sumMoney(rows.map((row) => row.amount)),
    }),
    [rows],
  );

  const summaryMetrics = useMemo<SummaryMetric[]>(() => {
    if (section === "payment-out") {
      const totalPaid = sumMoney(rows.map((row) => row.amount));
      return [
        { id: "total-paid", label: "Total Paid", value: formatCurrency(totalPaid), icon: BanknoteArrowUp, tone: "emerald", note: "Filtered outgoing value" },
        { id: "count", label: "Transaction Count", value: String(rows.length), icon: ReceiptText, tone: "sky", note: "Visible payment rows" },
        {
          id: "drafts",
          label: "Pending / Draft",
          value: String(rows.filter((row) => row.statusLabel === "Draft" || row.statusLabel === "Pending").length),
          icon: CalendarDays,
          tone: "amber",
          note: "Needs posting attention",
        },
      ];
    }

    if (section === "expenses") {
      const total = sumMoney(rows.map((row) => row.amount));
      const paid = sumMoney(rows.map((row) => row.paidAmount));
      const unpaid = sumMoney(rows.map((row) => row.balance));
      return [
        { id: "total-expenses", label: "Total Expenses", value: formatCurrency(total), icon: WalletCards, tone: "amber", note: "Filtered expense value" },
        { id: "paid", label: "Paid", value: formatCurrency(paid), icon: CheckCircle2, tone: "emerald", note: "Settled operating cost" },
        { id: "unpaid", label: "Unpaid", value: formatCurrency(unpaid), icon: CircleDollarSign, tone: "sky", note: "Still outstanding" },
        { id: "count", label: "Transaction Count", value: String(rows.length), icon: ReceiptText, tone: "teal", note: "Visible expense rows" },
      ];
    }

    if (section === "revenue") {
      const total = sumMoney(rows.map((row) => row.amount));
      const received = sumMoney(rows.map((row) => row.paidAmount));
      const receivable = sumMoney(rows.map((row) => row.balance));
      return [
        { id: "total-revenue", label: "Total Revenue", value: formatCurrency(total), icon: CircleDollarSign, tone: "emerald", note: "Filtered other-income value" },
        { id: "received", label: "Received", value: formatCurrency(received), icon: CheckCircle2, tone: "sky", note: "Already in cash or bank" },
        { id: "receivable", label: "Receivable", value: formatCurrency(receivable), icon: HandCoins, tone: "amber", note: "Still owed by customers" },
        { id: "count", label: "Transaction Count", value: String(rows.length), icon: ReceiptText, tone: "teal", note: "Visible revenue rows" },
      ];
    }

    if (section === "orders") {
      return [
        { id: "draft", label: "Draft", value: String(rows.filter((row) => row.statusLabel === "Draft").length), icon: CalendarDays, tone: "amber", note: "Waiting for approval" },
        { id: "sent", label: "Not Received", value: String(rows.filter((row) => row.statusLabel === "Not Received").length), icon: Send, tone: "sky", note: "No receipt recorded yet" },
        {
          id: "partial",
          label: "Partially Received",
          value: String(rows.filter((row) => row.statusLabel === "Partially Received").length),
          icon: RotateCcw,
          tone: "indigo",
          note: "Still expecting receipt",
        },
        {
          id: "total-value",
          label: "Total Order Value",
          value: formatCurrency(sumMoney(rows.map((row) => row.amount))),
          icon: ShoppingCart,
          tone: "teal",
          note: "Visible order value",
        },
      ];
    }

    if (section === "receipt-notes") {
      return [
        { id: "draft", label: "Draft", value: String(rows.filter((row) => row.statusLabel === "Draft").length), icon: CalendarDays, tone: "amber", note: "Not posted yet" },
        { id: "received", label: "Received", value: String(rows.filter((row) => row.statusLabel === "Received").length), icon: CheckCircle2, tone: "emerald", note: "Stock receipt completed" },
        {
          id: "partial",
          label: "Partially Received",
          value: String(rows.filter((row) => row.statusLabel === "Partially Received").length),
          icon: RotateCcw,
          tone: "indigo",
          note: "Still waiting on some stock",
        },
        {
          id: "total-value",
          label: "Total Receipt Value",
          value: formatCurrency(sumMoney(rows.map((row) => row.amount))),
          icon: ReceiptText,
          tone: "teal",
          note: "Visible receipt note value",
        },
      ];
    }

    if (section === "debit-notes") {
      const total = sumMoney(rows.map((row) => row.amount));
      const adjusted = sumMoney(rows.map((row) => row.paidAmount));
      const balance = sumMoney(rows.map((row) => row.balance));
      return [
        { id: "debit-total", label: "Total Purchase Return", value: formatCurrency(total), icon: FileMinus2, tone: "red", note: "Return and adjustment value" },
        { id: "adjusted", label: "Adjusted", value: formatCurrency(adjusted), icon: CheckCircle2, tone: "emerald", note: "Applied against purchases" },
        { id: "balance", label: "Remaining Balance", value: formatCurrency(balance), icon: CircleDollarSign, tone: "sky", note: "Open adjustment left" },
        { id: "count", label: "Record Count", value: String(rows.length), icon: ReceiptText, tone: "amber", note: "Visible purchase returns" },
      ];
    }

    const total = sumMoney(rows.map((row) => row.amount));
    const paid = sumMoney(rows.map((row) => row.paidAmount));
    const unpaid = sumMoney(rows.map((row) => row.balance));
    const returnAdjusted = Math.max(0, roundMoney(total - paid - unpaid));
    return [
      { id: "paid", label: "Paid", value: formatCurrency(paid), icon: CheckCircle2, tone: "emerald", note: "Filtered settled value" },
      { id: "unpaid", label: "Unpaid", value: formatCurrency(unpaid), icon: CircleDollarSign, tone: "sky", note: "Still outstanding" },
      ...(moneyToMinorUnits(returnAdjusted) > 0
        ? [
            {
              id: "return-adjusted",
              label: "Return Adjusted",
              value: formatCurrency(returnAdjusted),
              icon: FileMinus2,
              tone: "red" as const,
              note: "Purchase returns taken off these bills",
            },
          ]
        : []),
      { id: "total", label: "Total", value: formatCurrency(total), icon: ReceiptText, tone: "amber", note: "Paid + unpaid + return = total" },
    ];
  }, [rows, section]);

  const toolbarTotals = useMemo(() => {
    const amount = sumMoney(rows.map((row) => row.amount));
    const paid = sumMoney(rows.map((row) => row.paidAmount));
    const balance = sumMoney(rows.map((row) => row.balance));
    return {
      amount,
      paid,
      balance,
      /* A purchase return lowers what is still owed without being a payment, so the
       * row builder subtracts it straight from `balance` (see the comment there).
       * That is why gross Total is larger than Paid + Unpaid. Deriving the gap as a
       * residual rather than re-summing debitNoteAppliedAmount keeps the three boxes
       * adding up even where a return exceeded what was left owing and the balance
       * clamped to zero. */
      returnAdjusted: Math.max(0, roundMoney(amount - paid - balance)),
    };
  }, [rows]);
  const filteredPurchaseReturnTotal = useMemo(() => {
    if (!isBillsWorkspace) return 0;
    return sumMoney(
      (query.data ?? [])
        .filter((voucher) => voucher.voucherType === "debit-note" && voucher.status === "posted")
        .filter((voucher) => filters.supplier === "all" || voucher.partyName === filters.supplier)
        .map((voucher) => Number(voucher.amount || 0)),
    );
  }, [filters.supplier, isBillsWorkspace, query.data]);
  const netPurchaseTotal = Math.max(0, roundMoney(toolbarTotals.amount - filteredPurchaseReturnTotal));

  const flattenedExpenseAccounts = useMemo(
    () => flattenAccountTree(expenseAccountTreeQuery.data ?? []),
    [expenseAccountTreeQuery.data],
  );
  const expenseAccountsById = useMemo(
    () => new Map(flattenedExpenseAccounts.map((account) => [account.id, account])),
    [flattenedExpenseAccounts],
  );
  const expenseRootAccount = useMemo(
    () =>
      flattenedExpenseAccounts.find(
        (account) =>
          (isRevenueWorkspace ? account.level === "CATEGORY" : account.level === "MAIN_CATEGORY") &&
          (isRevenueWorkspace ? account.nature === "INCOME" : isExpenseNature(account.nature)) &&
          account.name.toLowerCase() === (isRevenueWorkspace ? "other income" : "expenses"),
      ) ?? flattenedExpenseAccounts.find((account) => account.level === "MAIN_CATEGORY" && (isRevenueWorkspace ? account.nature === "INCOME" : isExpenseNature(account.nature))) ?? null,
    [flattenedExpenseAccounts, isRevenueWorkspace],
  );
  const isInsideExpenseRegisterRoot = (account: AccountNode) => {
    if (!expenseRootAccount) return false;
    if (account.id === expenseRootAccount.id) return true;
    let parentId = account.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      if (parentId === expenseRootAccount.id) return true;
      visited.add(parentId);
      parentId = expenseAccountsById.get(parentId)?.parentId ?? null;
    }
    return false;
  };
  const expenseCategoryAccounts = useMemo(
    () =>
      flattenedExpenseAccounts
        .filter((account) =>
          account.level !== "LEDGER" &&
          (isRevenueWorkspace ? account.nature === "INCOME" : isExpenseNature(account.nature)) &&
          (isRevenueWorkspace ? isInsideExpenseRegisterRoot(account) : account.id !== expenseRootAccount?.id),
        )
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)),
    [expenseRootAccount, flattenedExpenseAccounts, isRevenueWorkspace, expenseAccountsById],
  );
  const expenseLedgerAccounts = useMemo(
    () =>
      flattenedExpenseAccounts
        .filter((account) =>
          account.level === "LEDGER" &&
          (isRevenueWorkspace ? account.nature === "INCOME" && isInsideExpenseRegisterRoot(account) : isExpenseNature(account.nature)) &&
          Boolean(account.parentId),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [flattenedExpenseAccounts, isRevenueWorkspace, expenseRootAccount, expenseAccountsById],
  );

  const expenseMasterSummaries = useMemo<ExpenseMasterSummary[]>(() => {
    if (!isLedgerRegisterWorkspace) {
      return [];
    }

    const summarize = (account: AccountNode, ledgerNames: Set<string>, ledgerIds: Set<string>, kind: ExpenseMasterView): ExpenseMasterSummary => {
      const normalizedLedgerNames = new Set(Array.from(ledgerNames, (name) => normalizeString(name)));
      const matchingRows = rows.filter(
        (row) => (row.expenseLedgerId ? ledgerIds.has(row.expenseLedgerId) : normalizedLedgerNames.has(normalizeString(row.expenseCategory))),
      );
      const parent = account.parentId ? expenseAccountsById.get(account.parentId) : null;
      return {
        id: account.id,
        name: account.name,
        code: account.code,
        kind,
        parentId: account.parentId,
        categoryName: kind === "ledger" ? (parent?.name ?? "Unassigned") : getExpenseNatureLabel(account.nature),
        nature: account.nature,
        amount: sumMoney(matchingRows.map((row) => row.amount)),
        balance: sumMoney(matchingRows.map((row) => row.balance)),
        count: matchingRows.length,
        ledgerNames,
        ledgerIds,
        account,
      };
    };

    if (expenseView === "ledger") {
      const registeredLedgerNames = new Set(expenseLedgerAccounts.map((account) => normalizeString(account.name)));
      const summaries = expenseLedgerAccounts.map((account) => summarize(account, new Set([account.name]), new Set([account.id]), "ledger"));
      const legacyLedgers = new Map<string, AccountNode>();
      rows.forEach((row, index) => {
        const name = row.expenseCategory || "Uncategorized";
        if (!registeredLedgerNames.has(normalizeString(name)) && !legacyLedgers.has(name)) {
          legacyLedgers.set(name, {
            id: `legacy-expense-ledger-${index}-${name}`,
            code: "LEGACY",
            name,
            level: "LEDGER",
            parentId: null,
            nature: isRevenueWorkspace ? "INCOME" : "INDIRECT_EXPENSE",
            isSystem: false,
            isControlAccount: false,
            requiresItemDetails: true,
            status: "ACTIVE",
            sortOrder: index,
            createdAt: "",
            updatedAt: "",
            children: [],
          });
        }
      });
      return [
        ...summaries,
        ...Array.from(legacyLedgers.values(), (account) => summarize(account, new Set([account.name]), new Set(), "ledger")),
      ].sort((left, right) => left.name.localeCompare(right.name));
    }

    return expenseCategoryAccounts.map((category) => {
      const descendantLedgerNames = new Set<string>();
      const descendantLedgerIds = new Set<string>();
      expenseLedgerAccounts.forEach((ledger) => {
        let cursor = ledger.parentId;
        const visited = new Set<string>();
        while (cursor && !visited.has(cursor)) {
          if (cursor === category.id) {
            descendantLedgerNames.add(ledger.name);
            descendantLedgerIds.add(ledger.id);
            break;
          }
          visited.add(cursor);
          cursor = expenseAccountsById.get(cursor)?.parentId ?? null;
        }
      });
      return summarize(category, descendantLedgerNames, descendantLedgerIds, "category");
    });
  }, [expenseAccountsById, expenseCategoryAccounts, expenseLedgerAccounts, expenseView, isLedgerRegisterWorkspace, isRevenueWorkspace, rows]);

  const filteredExpenseMasterSummaries = useMemo(() => {
    const needle = normalizeString(expenseCategorySearch);
    if (!needle) {
      return expenseMasterSummaries;
    }

    return expenseMasterSummaries.filter((entry) =>
      normalizeString(`${entry.name} ${entry.code} ${entry.categoryName} ${entry.amount}`).includes(needle),
    );
  }, [expenseCategorySearch, expenseMasterSummaries]);

  const expenseListTotal = useMemo(
    () => sumMoney(filteredExpenseMasterSummaries.map((entry) => entry.amount)),
    [filteredExpenseMasterSummaries],
  );

  const selectedExpenseSummary = useMemo(
    () => expenseMasterSummaries.find((entry) => entry.id === activeExpenseAccountId) ?? null,
    [activeExpenseAccountId, expenseMasterSummaries],
  );

  const selectedExpenseRows = useMemo(() => {
    if (!isLedgerRegisterWorkspace || !selectedExpenseSummary) {
      return [];
    }

    const ledgerNames = new Set(Array.from(selectedExpenseSummary.ledgerNames, (name) => normalizeString(name)));
    const baseRows = rows.filter((row) =>
      row.expenseLedgerId
        ? selectedExpenseSummary.ledgerIds.has(row.expenseLedgerId)
        : ledgerNames.has(normalizeString(row.expenseCategory)),
    );
    const needle = normalizeString(expenseItemSearch);
    if (!needle) {
      return baseRows;
    }

    return baseRows.filter((row) =>
      normalizeString(`${row.documentDate} ${row.documentNumber} ${row.partyName} ${row.paymentMethod} ${row.statusLabel} ${row.reference} ${row.narration}`).includes(needle),
    );
  }, [expenseItemSearch, isLedgerRegisterWorkspace, rows, selectedExpenseSummary]);
  const expenseTotalPages = Math.max(1, Math.ceil(selectedExpenseRows.length / pageSize));
  const expensePagedRows = useMemo(
    () => selectedExpenseRows.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, selectedExpenseRows],
  );

  const expenseSelectionStorageKey = `bizovix:${section}:selected-account:${mode}:${session?.workspaceId ?? "unknown"}:${expenseView}`;
  const requestedExpenseLedgerId = isLedgerRegisterWorkspace ? searchParams.get("expenseLedgerId") : null;
  const requestedExpenseLedgerName = isLedgerRegisterWorkspace ? searchParams.get("expenseLedgerName") : null;

  function selectExpenseAccount(accountId: string) {
    setActiveExpenseAccountId(accountId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(expenseSelectionStorageKey, accountId);
    }
  }

  useEffect(() => {
    if (!isLedgerRegisterWorkspace) {
      return;
    }

    const available = filteredExpenseMasterSummaries.length ? filteredExpenseMasterSummaries : expenseMasterSummaries;
    if (!available.length) {
      if (activeExpenseAccountId !== null) {
        setActiveExpenseAccountId(null);
      }
      return;
    }

    const rememberedAccountId = typeof window !== "undefined" ? window.localStorage.getItem(expenseSelectionStorageKey) : null;
    const requestKey = `${requestedExpenseLedgerId ?? ""}:${requestedExpenseLedgerName ?? ""}`;
    const hasPendingRequest = Boolean(requestKey !== ":" && consumedExpenseLedgerRequestRef.current !== requestKey);
    const requestedAccount = hasPendingRequest
      ? available.find(
          (entry) =>
            (requestedExpenseLedgerId && entry.id === requestedExpenseLedgerId) ||
            (requestedExpenseLedgerName && normalizeString(entry.name) === normalizeString(requestedExpenseLedgerName)),
        )
      : null;
    const activeIsAvailable = Boolean(activeExpenseAccountId && available.some((entry) => entry.id === activeExpenseAccountId));
    const rememberedIsAvailable = Boolean(rememberedAccountId && available.some((entry) => entry.id === rememberedAccountId));
    const preferredAccountId = requestedAccount
      ? requestedAccount.id
      : activeIsAvailable
        ? activeExpenseAccountId!
        : rememberedIsAvailable
          ? rememberedAccountId!
          : available[0].id;
    if (requestedAccount) {
      consumedExpenseLedgerRequestRef.current = requestKey;
    }
    if (preferredAccountId !== activeExpenseAccountId) {
      selectExpenseAccount(preferredAccountId);
    }
  }, [
    activeExpenseAccountId,
    expenseMasterSummaries,
    expenseSelectionStorageKey,
    filteredExpenseMasterSummaries,
    isLedgerRegisterWorkspace,
    requestedExpenseLedgerId,
    requestedExpenseLedgerName,
  ]);

  useEffect(() => {
    if (!isLedgerRegisterWorkspace || !activeExpenseAccountId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      expenseAccountRowRefs.current.get(activeExpenseAccountId)?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeExpenseAccountId, expenseMasterSummaries, isLedgerRegisterWorkspace]);

  function openExpenseAccountEditor(kind: ExpenseMasterView, account?: AccountNode, draftName = "") {
    if (mode !== "api") {
      toast.info(`${isRevenueWorkspace ? "Revenue" : "Expense"} categories and ledgers are managed from the connected company account.`);
      return;
    }

    if (kind === "category" && !expenseRootAccount) {
      toast.error(`The ${isRevenueWorkspace ? "Income" : "Expenses"} account category is missing from Chart of Accounts.`);
      return;
    }

    const selectedCategoryId =
      kind === "ledger"
        ? account?.parentId ?? (expenseView === "category" ? activeExpenseAccountId : null) ?? expenseCategoryAccounts[0]?.id ?? ""
        : expenseRootAccount?.id ?? "";
    const selectedCategory = selectedCategoryId ? expenseAccountsById.get(selectedCategoryId) : null;
    setExpenseAccountEditor({
      mode: account ? "edit" : "create",
      kind,
      id: account?.id ?? null,
      code: account?.code ?? "",
      name: account?.name ?? draftName,
      parentId: selectedCategoryId,
      nature: isRevenueWorkspace
        ? "INCOME"
        : account && isExpenseNature(account.nature)
          ? account.nature
          : selectedCategory && isExpenseNature(selectedCategory.nature)
            ? selectedCategory.nature
            : "INDIRECT_EXPENSE",
      requiresItemDetails: account?.requiresItemDetails ?? true,
    });
    setExpenseAccountEditorError(null);
  }

  async function saveExpenseAccount() {
    if (!expenseAccountEditor) {
      return;
    }

    const name = expenseAccountEditor.name.trim();
    if (!name) {
      setExpenseAccountEditorError("Name is required.");
      return;
    }
    if (!expenseAccountEditor.parentId) {
      setExpenseAccountEditorError(expenseAccountEditor.kind === "ledger" ? "Select a category for this ledger." : `The ${isRevenueWorkspace ? "Income" : "Expenses"} parent category is missing.`);
      return;
    }

    setExpenseAccountEditorError(null);
    try {
      let savedId = expenseAccountEditor.id;
      if (expenseAccountEditor.mode === "create") {
        const created = await createExpenseAccountMutation.mutateAsync({
          level: expenseAccountEditor.kind === "category" ? "CATEGORY" : "LEDGER",
          parentId: expenseAccountEditor.parentId,
          name,
          nature: expenseAccountEditor.nature,
          isControlAccount: false,
          ...(expenseAccountEditor.kind === "ledger" ? { requiresItemDetails: expenseAccountEditor.requiresItemDetails } : {}),
        });
        savedId = created.id;
      } else if (expenseAccountEditor.id) {
        await updateExpenseAccountMutation.mutateAsync({
          id: expenseAccountEditor.id,
          input: {
            name,
            ...(expenseAccountEditor.kind === "ledger" ? { requiresItemDetails: expenseAccountEditor.requiresItemDetails } : {}),
          },
        });
        const original = expenseAccountsById.get(expenseAccountEditor.id);
        if (expenseAccountEditor.kind === "ledger" && original?.parentId !== expenseAccountEditor.parentId) {
          await reparentExpenseAccountMutation.mutateAsync({ id: expenseAccountEditor.id, parentId: expenseAccountEditor.parentId });
        }
      }

      toast.success(`${expenseAccountEditor.kind === "category" ? "Category" : "Ledger"} ${expenseAccountEditor.mode === "create" ? "added" : "updated"}`);
      setExpenseAccountEditor(null);
      if (savedId) {
        selectExpenseAccount(savedId);
      }
    } catch (error) {
      setExpenseAccountEditorError(error instanceof Error ? error.message : `Could not save this ${isRevenueWorkspace ? "revenue" : "expense"} account.`);
    }
  }

  function openExpenseAccountActions(entry: ExpenseMasterSummary, event: ReactMouseEvent<HTMLElement>) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = entry.code === "LEGACY" ? 52 : 96;
    const left = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, rect.right - menuWidth));
    const belowTop = rect.bottom + 6;
    const top = belowTop + menuHeight > window.innerHeight - 12 ? Math.max(12, rect.top - menuHeight - 6) : belowTop;
    setExpenseAccountMenu({ entry, left, top });
  }

  function openExpenseAccountContextMenu(entry: ExpenseMasterSummary, event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 176;
    const menuHeight = entry.code === "LEGACY" ? 52 : 96;
    const left = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, event.clientX));
    const top = Math.min(window.innerHeight - menuHeight - 12, Math.max(12, event.clientY));
    setExpenseAccountMenu({ entry, left, top });
  }

  function editExpenseAccount(entry: ExpenseMasterSummary) {
    setExpenseAccountMenu(null);
    if (entry.code === "LEGACY") {
      openExpenseAccountEditor("ledger", undefined, entry.name);
      return;
    }
    openExpenseAccountEditor(entry.kind, entry.account);
  }

  function requestDeleteExpenseAccount(entry: ExpenseMasterSummary) {
    setExpenseAccountMenu(null);
    if (entry.code === "LEGACY") {
      toast.error("Register this legacy ledger under a category before managing it.");
      return;
    }
    if (entry.account.isSystem) {
      toast.error(`The system ${entry.kind} "${entry.name}" is protected and cannot be deleted.`);
      return;
    }
    setExpenseAccountDeleteTarget(entry);
  }

  async function deleteExpenseAccount() {
    if (!expenseAccountDeleteTarget || expenseAccountDeleting) {
      return;
    }

    setExpenseAccountDeleting(true);
    try {
      await deleteExpenseAccountMutation.mutateAsync(expenseAccountDeleteTarget.id);
      toast.success(`${expenseAccountDeleteTarget.kind === "category" ? "Category" : "Ledger"} deleted`);
      if (activeExpenseAccountId === expenseAccountDeleteTarget.id) {
        setActiveExpenseAccountId(null);
      }
      setExpenseAccountDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this expense account.");
    } finally {
      setExpenseAccountDeleting(false);
    }
  }

  function syncSearch(value: string) {
    setDraftFilters((current) => ({ ...current, searchQuery: value }));
    setFilters((current) => ({ ...current, searchQuery: value }));
  }

  function toggleSort(columnId: FilterableColumnId) {
    if (sortKey === columnId) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(columnId);
    setSortDirection(columnId === "date" ? "desc" : "asc");
  }

  function getColumnWidthStyle(columnId: string, fallbackWidth: string) {
    const resolvedWidth = columnWidths[columnId] ?? Number.parseInt(fallbackWidth, 10);
    return {
      width: `${resolvedWidth}px`,
    };
  }

  function isColumnResizable(columnId: string) {
    return !["actions", "action", "menu", "select"].includes(columnId);
  }

  function renderColumnResizeHandle(columnId: string, label: string) {
    return (
      <button
        type="button"
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
        onMouseDown={(event) => {
          event.preventDefault();
          beginColumnResize(columnId, event.clientX);
        }}
        aria-label={`Resize ${label} column`}
      />
    );
  }

  function toggleRowSelection(rowId: string, checked: boolean) {
    setSelectedRowIds((current) => (checked ? [...new Set([...current, rowId])] : current.filter((entry) => entry !== rowId)));
  }

  function toggleVisibleRows(checked: boolean) {
    // The header checkbox means every transaction matching the current filters,
    // not merely the 10 rows currently rendered by pagination. Otherwise a bulk
    // delete silently leaves the later pages behind.
    setSelectedRowIds(checked ? rows.map((row) => row.id) : []);
  }

  function toggleRowsSelection(visibleRows: PurchaseRow[], checked: boolean) {
    setSelectedRowIds(checked ? visibleRows.map((row) => row.id) : []);
  }

  function renderBulkActionsButton() {
    return (
      <div className="relative flex items-center justify-end">
        <button
          type="button"
          className="relative inline-flex h-8 w-8 items-center justify-center text-[#334155] transition hover:text-primary"
          onClick={() => setBulkActionsMenuOpen((current) => !current)}
          aria-label="Actions for selected rows"
        >
          {selectedRows.length ? <span className="absolute -right-1.5 -top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] leading-none text-white">{selectedRows.length}</span> : null}
          <MoreVertical className="h-4 w-4" />
        </button>
        {bulkActionsMenuOpen ? (
          <div className="absolute right-0 top-9 z-30 min-w-[190px] rounded-xl border border-[#d7e1ee] bg-white p-2 text-left normal-case shadow-[0_18px_34px_rgba(15,23,42,0.14)]">
            <div className="border-b border-[#edf2f7] px-3 py-2 text-xs font-semibold text-[#61708a]">{selectedRows.length ? `${selectedRows.length} selected` : "Select rows first"}</div>
            <button type="button" disabled={!selectedRows.length} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#24364f] hover:bg-[#f7faff] disabled:opacity-40" onClick={() => { setBulkActionsMenuOpen(false); exportVisibleRows("excel"); }}>
              <ExcelIcon className="h-4 w-4" /> Export visible
            </button>
            <button type="button" disabled={!selectedRows.length} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#c63c3c] hover:bg-[#fff5f5] disabled:opacity-40" onClick={() => { setBulkActionsMenuOpen(false); setBulkDeleteDialogOpen(true); }}>
              <Trash2 className="h-4 w-4" /> Delete selected
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderRegisterActions() {
    const actionClass =
      "inline-flex h-10 items-center gap-2 rounded-lg border border-[#d5dfe9] bg-white px-4 text-sm font-semibold text-[#2f4f7a] shadow-sm transition hover:bg-[#f3f7fc] hover:text-[#1455a0]";

    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button type="button" className={actionClass} onClick={handleShareRegister} title="Share register">
          <Share2 className="h-4 w-4" />
          <span>Share</span>
        </button>
        <button type="button" className={actionClass} onClick={() => exportVisibleRows("excel")} title="Export Excel report">
          <ExcelIcon className="h-4 w-4" />
          <span>Excel Report</span>
        </button>
        <button type="button" className={actionClass} onClick={printCurrentRegister} title="Print register">
          <Printer className="h-4 w-4" />
          <span>Print</span>
        </button>
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#d5dfe9] bg-white text-[#2f4f7a] shadow-sm transition hover:bg-[#f3f7fc] hover:text-[#1455a0]" onClick={() => setColumnsOpen(true)} title="Choose table columns" aria-label="Choose table columns">
          <Columns3 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function renderWorkspaceTitle() {
    if (isRevenueWorkspace) {
      return (
        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-[1.6rem] font-semibold tracking-[-0.03em] text-[#1c2f4e]"
            onClick={() => setWorkflowMenuOpen((current) => !current)}
            aria-haspopup="menu"
            aria-expanded={workflowMenuOpen}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#f0dfc8] bg-[#fff7ef] text-primary">
              <config.icon className="h-[18px] w-[18px]" />
            </span>
            <span>{config.label}</span>
            <ChevronDown className={cn("h-[18px] w-[18px] text-[#54657f] transition-transform", workflowMenuOpen ? "rotate-180" : "")} />
          </button>
          {workflowMenuOpen ? (
            <div className="absolute left-0 top-full z-30 mt-2 w-[250px] rounded-xl border border-[#d5dfeb] bg-white p-1.5 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
              {salesWorkspaceSections.map((workspaceSection) => (
                <button
                  key={workspaceSection.slug}
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                  onClick={() => {
                    setWorkflowMenuOpen(false);
                    router.push(buildSalesWorkspaceRoute(mode, workspaceSection.slug));
                  }}
                >
                  <workspaceSection.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{workspaceSection.label}</span>
                </button>
              ))}
              <button type="button" className="flex w-full items-center gap-2.5 rounded-lg bg-[#eef5ff] px-3 py-2 text-left text-sm text-[#1455a0]" onClick={() => setWorkflowMenuOpen(false)}>
                <config.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">Revenue</span>
              </button>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div data-purchase-workspace-title className="relative">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-[1.6rem] font-semibold tracking-[-0.03em] text-[#1c2f4e]"
          onClick={() => setWorkflowMenuOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={workflowMenuOpen}
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#f0dfc8] bg-[#fff7ef] text-primary">
            <config.icon className="h-[18px] w-[18px]" />
          </span>
          <span>{config.label}</span>
          <ChevronDown className={cn("h-[18px] w-[18px] text-[#54657f] transition-transform", workflowMenuOpen ? "rotate-180" : "")} />
        </button>
        {workflowMenuOpen ? (
          <div className="absolute left-0 top-full z-30 mt-2 w-[250px] rounded-xl border border-[#d5dfeb] bg-white p-1.5 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
            {purchaseWorkspaceNavigationOrder
              .map((workspaceSection) => getPurchaseWorkspaceSection(workspaceSection))
              .map((workspaceSection) => (
                <button
                  key={workspaceSection.slug}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
                    workspaceSection.slug === section ? "bg-[#eef5ff] text-[#1455a0]" : "text-[#24364f] hover:bg-[#f7faff]",
                  )}
                  onClick={() => {
                    setWorkflowMenuOpen(false);
                    handleNavigateSection(workspaceSection.slug);
                  }}
                >
                  <workspaceSection.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{workspaceSection.label}</span>
                </button>
              ))}
          </div>
        ) : null}
      </div>
    );
  }

  function openPaymentOutDialog(row?: PurchaseRow) {
    setPaymentOutDialogForm(buildPaymentOutDialogState(row));
    setPaymentOutAllocations([]);
    setPaymentOutDescriptionOpen(Boolean(row?.narration));
    setPaymentOutShareMenuOpen(false);
    setPaymentOutDialogOpen(true);
  }

  function updatePaymentOutDialogField<Key extends keyof PaymentOutDialogState>(field: Key, value: PaymentOutDialogState[Key]) {
    setPaymentOutDialogForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function sharePaymentOutDraft(target: "share" | "copy" = "share") {
    const summary = [
      "Payment-Out",
      `Party: ${paymentOutDialogForm.partyName || "-"}`,
      `Receipt No: ${paymentOutDialogForm.receiptNumber || "-"}`,
      `Date: ${paymentOutDialogForm.voucherDate ? formatDate(paymentOutDialogForm.voucherDate) : "-"}`,
      `Amount: ${formatAmount(paymentOutDialogForm.amount || 0)}`,
    ].join("\n");

    setPaymentOutShareMenuOpen(false);
    if (target === "share" && typeof navigator !== "undefined" && navigator.share) {
      void navigator
        .share({
          title: "Payment-Out",
          text: summary,
        })
        .catch(() => undefined);
      return;
    }

    void navigator.clipboard.writeText(summary);
    toast.success("Payment-Out details copied to clipboard");
  }

  /** Builds the same debit/credit pair every payment-out voucher uses, just with a
   * different amount and bill reference — shared by the single-voucher path and by
   * each per-bill voucher when a payment is split across several bills. */
  /**
   * `ownReference` becomes this voucher's own number — leave it undefined to let the
   * backend auto-generate one. `billReference` only ever goes on the lines, tying this
   * payment to a specific bill for the paid-amount lookup elsewhere. The two must stay
   * separate: setting the top-level reference to a bill's own number collides with that
   * bill's voucherNumber (same unique constraint), which is exactly what happens if a
   * split payment's per-bill vouchers reuse the bill number as their own reference.
   */
  function buildPaymentOutPayload(workspaceId: string, partyName: string, amount: number, ownReference: string | undefined, billReference: string, narration: string) {
    const isCashPayment = paymentOutDialogForm.paymentMethod === "Cash";
    const moneyAccountType = paymentOutMoneyAccountType(paymentOutDialogForm.paymentMethod);
    const selectedMoneyAccount = (paymentOutMoneyAccountsQuery.data ?? []).find(
      (account) => account.id === paymentOutDialogForm.moneyAccountId && account.type === moneyAccountType,
    );
    const moneyLedger = selectedMoneyAccount?.name ?? (isCashPayment ? "Cash in Hand" : paymentOutDialogForm.paymentMethod);
    const partyId = (query.data ?? []).find(
      (voucher) => voucher.partyId && normalizeString(voucher.partyName) === normalizeString(partyName),
    )?.partyId;

    return {
      workspaceId,
      voucherType: "payment" as const,
      voucherDate: paymentOutDialogForm.voucherDate,
      partyName,
      partyId,
      reference: ownReference,
      narration,
      status: "posted" as const,
      settlementMode: isCashPayment ? ("cash" as const) : ("accounts-payable" as const),
      supplierAddress: "",
      condition: "",
      buyerSignature: "",
      sellerSignature: "",
      discountType: "fixed" as const,
      discountAmount: 0,
      subtotal: amount,
      totalAmount: amount,
      lines: [
        {
          id: "line-payment-main",
          ledger: partyName,
          description: `Payment to ${partyName}`,
          debit: amount,
          credit: 0,
          costCenter: "Head Office",
          project: "Trading",
          billReference,
        },
        {
          id: "line-payment-balance",
          accountId: selectedMoneyAccount?.id,
          moneyAccountType,
          ledger: moneyLedger,
          description: `${paymentOutDialogForm.paymentMethod} payment`,
          debit: 0,
          credit: amount,
          costCenter: "Head Office",
          project: "Trading",
          billReference,
        },
      ],
    };
  }

  async function savePaymentOutDialog() {
    if (!session?.workspaceId) {
      return;
    }

    const partyName = paymentOutDialogForm.partyName.trim();
    const amount = roundMoney(Number(paymentOutDialogForm.amount || 0));

    if (!partyName) {
      toast.error("Party is required");
      return;
    }

    if (!paymentOutDialogForm.voucherDate) {
      toast.error("Date is required");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Paid amount must be greater than zero");
      return;
    }

    if (mode === "api") {
      if (paymentOutMoneyAccountsQuery.isLoading) {
        toast.error("Payment account ledgers are still loading. Please try again.");
        return;
      }
      const expectedType = paymentOutMoneyAccountType(paymentOutDialogForm.paymentMethod);
      const selectedMoneyAccount = (paymentOutMoneyAccountsQuery.data ?? []).find(
        (account) => account.id === paymentOutDialogForm.moneyAccountId && account.type === expectedType,
      );
      if (!selectedMoneyAccount) {
        toast.error(`Select an active ${expectedType === "MFS" ? "MFS" : expectedType === "BANK" ? "Bank" : "Cash"} ledger for this payment.`);
        return;
      }
    }

    // Editing an existing payment keeps the simple single-voucher shape it already
    // has — the allocation table only drives brand-new payments (the effect above
    // never populates it once a sourceId is set).
    const allocatedRows = paymentOutDialogForm.sourceId
      ? []
      : paymentOutAllocations.filter((row) => moneyToMinorUnits(Number(row.applied || 0)) > 0);
    const allocatedTotal = sumMoney(allocatedRows.map((row) => Number(row.applied || 0)));

    if (moneyToMinorUnits(allocatedTotal) > moneyToMinorUnits(amount)) {
      toast.error("The amount applied to bills can't exceed the amount paid");
      return;
    }

    setPaymentOutDialogSaving(true);
    try {
      if (paymentOutDialogForm.sourceId) {
        await updateVoucher(
          mode,
          paymentOutDialogForm.sourceId,
          buildPaymentOutPayload(
            session.workspaceId,
            partyName,
            amount,
            paymentOutDialogForm.reference.trim() || paymentOutDialogForm.receiptNumber.trim() || undefined,
            "",
            paymentOutDialogForm.narration.trim() || `${paymentOutDialogForm.paymentMethod} payment for ${partyName}`,
          ),
        );
        // Narrower [mode, "day-book"] invalidation left Trial Balance and other reports
      // showing stale figures after a purchase posts — reports read their own cached
      // query key, so only invalidating day-book never marked them stale too.
      await queryClient.invalidateQueries({ queryKey: [mode] });
        await query.refetch();
        setPaymentOutDialogOpen(false);
        toast.success("Payment-Out updated");
        return;
      }

      if (!allocatedRows.length) {
        // No outstanding bills to apply against (or the party has none) — an
        // ordinary, unlinked payment, exactly as before.
        await createVoucher(
          mode,
          buildPaymentOutPayload(
            session.workspaceId,
            partyName,
            amount,
            paymentOutDialogForm.reference.trim() || paymentOutDialogForm.receiptNumber.trim() || undefined,
            "",
            paymentOutDialogForm.narration.trim() || `${paymentOutDialogForm.paymentMethod} payment for ${partyName}`,
          ),
        );
      } else {
        // One voucher per bill being settled, so each keeps its own real link
        // (billReference = that bill's own number) instead of one payment vaguely
        // covering several bills at once with no way to tell how much went where.
        const failures: string[] = [];
        for (const row of allocatedRows) {
          const appliedAmount = roundMoney(Number(row.applied || 0));
          try {
            await createVoucher(
              mode,
              buildPaymentOutPayload(
                session.workspaceId,
                partyName,
                appliedAmount,
                undefined,
                row.reference,
                paymentOutDialogForm.narration.trim() || `${paymentOutDialogForm.paymentMethod} payment for ${partyName} against ${row.reference}`,
              ),
            );
          } catch (error) {
            failures.push(`${row.reference}: ${error instanceof Error ? error.message : "could not be saved"}`);
          }
        }

        const leftover = Math.max(0, roundMoney(amount - allocatedTotal));
        const hasLeftover = moneyToMinorUnits(leftover) > 0;
        if (hasLeftover) {
          try {
            await createVoucher(
              mode,
              buildPaymentOutPayload(
                session.workspaceId,
                partyName,
                leftover,
                undefined,
                "",
                paymentOutDialogForm.narration.trim() || `Advance payment for ${partyName}`,
              ),
            );
          } catch (error) {
            failures.push(`Unallocated balance: ${error instanceof Error ? error.message : "could not be saved"}`);
          }
        }

        if (failures.length === allocatedRows.length + (hasLeftover ? 1 : 0)) {
          throw new Error(failures[0]);
        }

        failures.forEach((message) => toast.error(message));
      }

      // Narrower [mode, "day-book"] invalidation left Trial Balance and other reports
      // showing stale figures after a purchase posts — reports read their own cached
      // query key, so only invalidating day-book never marked them stale too.
      await queryClient.invalidateQueries({ queryKey: [mode] });
      await query.refetch();
      setPaymentOutDialogOpen(false);
      toast.success("Payment-Out saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment-Out could not be saved");
    } finally {
      setPaymentOutDialogSaving(false);
    }
  }

  function handleNavigateSection(nextSection: PurchaseWorkspaceSection) {
    startTransition(() => {
      router.push(buildPurchaseWorkspaceRoute(mode, nextSection));
    });
  }

  function buildCurrentSectionReturnRoute() {
    // Revenue is mounted at /sales/revenue (see the sidebar and app/sales/revenue/page.tsx)
    // even though it shares this Purchase-style list screen — buildPurchaseWorkspaceRoute
    // would send it to /purchase/revenue instead, a URL the generic /purchase/[section]
    // catch-all also happens to render, but which the sidebar doesn't recognize as active.
    const route = section === "revenue" ? buildWorkspaceRoute(mode, "/sales/revenue") : buildPurchaseWorkspaceRoute(mode, section);
    if (section !== "bills") return route;
    const params = new URLSearchParams({
      preset: filters.preset,
      from: filters.from,
      to: filters.to,
      firm: filters.firm,
    });
    return `${route}?${params.toString()}`;
  }

  function handlePrimaryAction() {
    if (!readiness.isReadyForTransactions) {
      toast.error("Master data setup incomplete. Complete mandatory master data setup before creating transactions.");
      return;
    }

    if (section === "orders" || section === "bills") {
      const targetRoot: WorkflowRootKind = section === "orders" || workflowSettings.purchaseWorkflow === "ORDER_BASED"
        ? "ORDER_BASED"
        : "DIRECT";
      const access = evaluateWorkflowRootAccess(
        workflowSettings.purchaseWorkflow,
        targetRoot,
        workflowSettingsLoadState,
      );
      if (!access.allowed) {
        if (access.reason === "SETTINGS_PENDING") {
          toast.info("Company transaction workflow is still loading. Please try again.");
        } else if (access.reason === "SETTINGS_ERROR") {
          toast.error("Company transaction workflow could not be loaded. Retry before creating a new purchase transaction.");
        } else {
          toast.info("Purchase workflow is in Direct Mode. Change it under Settings → Sales & Purchase Flow to create a new Purchase Order.");
        }
        return;
      }
    }

    // Receipt Notes must be raised from a real Purchase Order. Likewise, an
    // Order-Based company starts a new bill-side transaction at the order root.
    if (section === "receipt-notes") {
      startTransition(() => router.push(buildPurchaseWorkspaceRoute(mode, "orders")));
      return;
    }
    if (section === "bills" && workflowSettings.purchaseWorkflow === "ORDER_BASED") {
      const baseTarget = buildPurchaseStartRoute(mode, workflowSettings.purchaseWorkflow);
      const returnTo = buildPurchaseWorkspaceRoute(mode, "orders");
      startTransition(() => router.push(`${baseTarget}&returnTo=${encodeURIComponent(returnTo)}`));
      return;
    }

    const purchaseWorkflow = getPurchaseWorkflowForSection(section);

    const baseTarget =
      purchaseWorkflow && config.createVoucherType === "purchase"
        ? `${buildVoucherRoute(mode, "purchase")}?workflow=${purchaseWorkflow}`
        : buildVoucherRoute(mode, config.createVoucherType);
    const separator = baseTarget.includes("?") ? "&" : "?";
    const target = `${baseTarget}${separator}returnTo=${encodeURIComponent(buildCurrentSectionReturnRoute())}`;

    startTransition(() => {
      router.push(target);
    });
  }

  async function handleRefresh() {
    setManualRefreshActive(true);
    try {
      await query.refetch();
      setLastRefreshAt(new Date());
      toast.success(`${config.label} refreshed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setManualRefreshActive(false);
    }
  }

  function handleApplyFilters() {
    if (draftFilters.preset === "custom" && draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to) {
      toast.error("From date cannot be later than To date");
      return;
    }

    const next = { ...draftFilters };
    if (draftFilters.savedFilter === "current-financial-year") {
      next.preset = "current-financial-year";
      const fyWindow = buildDateWindow("current-financial-year", workspace);
      next.from = fyWindow.start;
      next.to = fyWindow.end;
    } else if (draftFilters.preset !== "custom") {
      const resolved = buildDateWindow(draftFilters.preset, workspace);
      next.from = resolved.start;
      next.to = resolved.end;
    }

    setDraftFilters(next);
    setFilters(next);
    toast.success(`${config.label} filters applied`);
  }

  function handleResetFilters() {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
    setColumnFilters({});
    setColumnFilterPopover(null);
    toast.success("Filters reset");
  }

  function handleResetRegisterView() {
    setDenseTable(true);
    setStickyHeader(true);
    setShowCreatedBy(false);
    setPageSize(25);
    setPage(1);
    setColumnVisibility(columnDefaultVisibility);
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
    setColumnFilters({});
    setColumnFilterPopover(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(settingsStorageKey);
    toast.success(`${config.label} register view reset`);
  }

  function buildExportRows(exportRows: PurchaseRow[]) {
    const visibleColumns = columns.filter((column) => columnVisibility[column.id] !== false && column.id !== "select" && column.id !== "actions");

    return exportRows.map((row) =>
      Object.fromEntries(
        visibleColumns.map((column) => [
          column.label,
          column.id === "date"
            ? formatDate(row.documentDate)
            : column.id === "amount"
              ? formatCurrency(row.amount)
              : column.id === "paidAmount"
                ? formatCurrency(row.paidAmount)
                : column.id === "balance"
                  ? formatCurrency(row.balance)
                  : column.id === "tax"
                    ? formatCurrency(row.tax)
                    : column.id === "receivedValue"
                      ? formatCurrency(row.receivedValue)
                      : column.id === "financialDue"
                        ? formatCurrency(row.financialDue)
                      : column.id === "remaining"
                        ? formatCurrency(row.remaining)
                        : getColumnValue(row, column.id as FilterableColumnId),
        ]),
      ),
    );
  }

  useEffect(() => {
    const exportHandler = () => exportVisibleRows("excel");
    window.addEventListener("erp-export-request", exportHandler);
    return () => window.removeEventListener("erp-export-request", exportHandler);
  }, [exportVisibleRows]);

  function exportVisibleRows(formatType: "csv" | "excel") {
    const exportRows = selectedRows.length ? selectedRows : rows;
    if (!exportRows.length) {
      toast.error(`No ${config.shortLabel.toLowerCase()} rows available to export`);
      return;
    }

    const payload = buildExportRows(exportRows);
    const fileStem = `${config.slug}-${filters.from}-to-${filters.to}`;
    if (formatType === "csv") {
      downloadCsv(`${fileStem}.csv`, payload);
    } else {
      downloadExcel(`${fileStem}.xls`, payload);
    }
    toast.success(`${config.label} exported`);
  }

  function printCurrentRegister() {
    const savedCompanyName = session?.workspaceId ? readCompanyProfile(mode, session.workspaceId).companyName.trim() : "";
    printRegister({
      title: config.label,
      workspaceName: savedCompanyName || workspace?.name || appConfig.companyName,
      periodLabel: `${formatDate(filters.from)} – ${formatDate(filters.to)}`,
      rows,
      totals: toolbarTotals,
    });
  }

  function handleSinglePrint(row: PurchaseRow) {
    const savedCompanyName = session?.workspaceId ? readCompanyProfile(mode, session.workspaceId).companyName.trim() : "";
    printRegister({
      title: `${config.label} Voucher`,
      workspaceName: savedCompanyName || workspace?.name || appConfig.companyName,
      periodLabel: formatDate(row.documentDate),
      rows: [row],
      totals: {
        amount: row.amount,
        paid: row.paidAmount,
        balance: row.balance,
      },
    });
  }

  function buildPreviewPayload(voucher: VoucherRecord) {
    const companyProfile = readCompanyProfile(mode, voucher.workspaceId);
    const matchedParty = previewParties.find((party) => party.name.trim().toLowerCase() === voucher.partyName.trim().toLowerCase()) ?? null;
    const exportItems =
      voucher.inventoryItems?.length
        ? voucher.inventoryItems.map((item) => ({
            description: item.itemName,
            quantity: Number(item.quantity || 0),
            price: Number(item.unitPrice || 0),
            total: Number(item.quantity || 0) * Number(item.unitPrice || 0),
          }))
        : voucher.lines
            .filter((line) => Number(line.debit || 0) > 0 || Number(line.credit || 0) > 0)
            .map((line) => ({
              description: line.description || line.ledger,
              quantity: 1,
              price: Math.max(Number(line.debit || 0), Number(line.credit || 0)),
              total: Math.max(Number(line.debit || 0), Number(line.credit || 0)),
            }));

    const subtotal = Number(voucher.subtotal ?? voucher.amount ?? 0);
    const discountAmount = Number(voucher.discountAmount ?? 0);
    const total = Number(voucher.amount ?? 0);

    return {
      invoiceNumber: voucher.reference?.trim() || voucher.voucherNumber,
      companyName: companyProfile.companyName || appConfig.companyName,
      fromLabel: companyProfile.companyName || appConfig.companyName,
      fromAddressLines: [companyProfile.businessAddress, companyProfile.phoneNumber, companyProfile.emailAddress].filter(Boolean),
      logoDataUrl: companyProfile.logoDataUrl,
      invoicePadDataUrl: companyProfile.invoicePadDataUrl,
      billToName: voucher.partyName,
      billToAddressLines: [matchedParty?.address || voucher.supplierAddress || "", matchedParty?.contact || ""].filter(Boolean),
      dateLabel: voucher.voucherDate,
      note: voucher.narration ?? voucher.particulars ?? "",
      paymentMode: derivePaymentMethodLabel(voucher, "Cash", "Bank", "MFS", "Credit"),
      paymentTarget:
        voucher.settlementMode === "cash"
          ? "Cash Purchase"
          : voucher.settlementMode === "bank"
            ? getBankSettlementLedgerName(voucher) || "Bank Accounts"
            : "Accounts Payable",
      buyerSignature: voucher.buyerSignature || "Accounts Team",
      sellerSignature: voucher.sellerSignature || companyProfile.companyName || appConfig.companyName,
      items: exportItems,
      subTotal: subtotal || total,
      discountLabel: discountAmount > 0 ? "Discount" : "No Discount",
      discountAmount,
      total,
    } satisfies InvoiceExportPayload;
  }

  function buildInvoiceShareText(payload: InvoiceExportPayload, title: string) {
    return [
      title,
      `Party: ${payload.billToName}`,
      `Invoice: ${payload.invoiceNumber}`,
      `Date: ${payload.dateLabel}`,
      `Total: ${formatCurrency(payload.total)}`,
      payload.note ? `Note: ${payload.note}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function openPreviewDialog(voucher: VoucherRecord) {
    const payload = buildPreviewPayload(voucher);
    setPreviewTheme("default");
    const imageSrc = await buildInvoicePreviewDataUrl(payload);
    setPreviewDialog({
      title: voucher.reference?.trim() || voucher.voucherNumber,
      subtitle: `${voucher.partyName} invoice preview is ready to share.`,
      imageSrc,
      payload,
      sourceVoucher: voucher,
    });
  }

  async function handlePreviewPadUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !session?.workspaceId || !previewDialog) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Company pad must be an image file");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Company pad should be under 2 MB");
      return;
    }

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      const snapshot = readCompanyProfile(mode, session.workspaceId);
      writeCompanyProfile(mode, session.workspaceId, { ...snapshot, invoicePadDataUrl: dataUrl });
      await openPreviewDialog(previewDialog.sourceVoucher);
      setPreviewTheme("letterhead");
      toast.success("Company pad uploaded");
    } catch {
      toast.error("Company pad could not be uploaded");
    }
  }

  async function handleShareRow(row: PurchaseRow) {
    if (!session?.workspaceId) {
      toast.error("Workspace session is missing");
      return;
    }

    try {
      const voucher = await getVoucher(mode, row.sourceId, session.workspaceId);
      openPreviewDialog(voucher);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invoice preview could not be opened");
    }
  }

  function handleShareRegister() {
    if (!rows.length) {
      toast.error(`No ${config.shortLabel.toLowerCase()} rows available to share`);
      return;
    }

    const summary = [
      config.label,
      `${formatDate(filters.from)} – ${formatDate(filters.to)}`,
      `Paid: ${formatCurrency(toolbarTotals.paid)}`,
      `Unpaid: ${formatCurrency(toolbarTotals.balance)}`,
      ...(moneyToMinorUnits(toolbarTotals.returnAdjusted) > 0
        ? [`Return adjusted: ${formatCurrency(toolbarTotals.returnAdjusted)}`]
        : []),
      `Total: ${formatCurrency(toolbarTotals.amount)}`,
    ].join("\n");

    if (typeof navigator !== "undefined" && navigator.share) {
      void navigator
        .share({
          title: config.label,
          text: summary,
        })
        .catch(() => undefined);
      return;
    }

    void navigator.clipboard.writeText(summary);
    toast.success("Purchase bill summary copied to clipboard");
  }

  /** The actual status change, shared by the single-row and bulk cancel actions. Throws
   * on failure so each caller can decide how to report it (a toast for one row, a tally
   * of successes/failures for a batch). */
  async function cancelVoucherRecord(row: PurchaseRow): Promise<"cancelled" | "reversed"> {
    if (!session) {
      throw new Error("Session is missing");
    }

    if (mode === "api") {
      // The dedicated transition only changes status, so nothing else on the
      // document can be altered while cancelling it.
      try {
        await cancelVoucher(row.sourceId);
        return "cancelled";
      } catch (error) {
        // A posted/approved voucher can never move straight to Cancelled — the
        // backend's status machine only allows Posted -> Reversed (it already
        // moved money/stock, so undoing it needs a mirror-image reversing
        // entry, not a silent status flip). Fall back to that instead of
        // surfacing this as a dead end.
        if (error instanceof Error && /cannot move voucher from posted/i.test(error.message)) {
          await reverseVoucher(row.sourceId, `Reversed from ${config.label} list`);
          return "reversed";
        }
        throw error;
      }
    } else {
      const source = await getVoucher(mode, row.sourceId, session.workspaceId);
      await updateVoucher(mode, row.sourceId, {
        workspaceId: session.workspaceId,
        voucherType: source.voucherType,
        voucherDate: source.voucherDate,
        partyName: source.partyName,
        partyId: source.partyId,
        reference: source.reference ?? source.voucherNumber,
        narration: source.narration ?? source.particulars,
        status: "cancelled",
        settlementMode: source.settlementMode === "cash" ? "cash" : source.settlementMode === "bank" ? "bank" : "accounts-payable",
        supplierAddress: source.supplierAddress ?? "",
        condition: source.condition ?? "",
        buyerSignature: source.buyerSignature ?? "",
        sellerSignature: source.sellerSignature ?? "",
        discountType: source.discountType ?? "fixed",
        discountAmount: source.discountAmount ?? 0,
        subtotal: source.subtotal ?? source.amount,
        totalAmount: source.amount,
        inventoryItems: source.inventoryItems,
        lines: source.lines,
      });
      return "cancelled";
    }
  }

  async function handleCancelVoucher(row: PurchaseRow) {
    try {
      const outcome = await cancelVoucherRecord(row);
      // Narrower [mode, "day-book"] invalidation left Trial Balance and other reports
      // showing stale figures after a purchase posts — reports read their own cached
      // query key, so only invalidating day-book never marked them stale too.
      await queryClient.invalidateQueries({ queryKey: [mode] });
      await query.refetch();
      toast.success(outcome === "reversed" ? `${row.documentNumber} reversed` : `${row.documentNumber} cancelled`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be cancelled");
    }
  }

  /** A posted/approved voucher's own delete guard rejects it outright ("Reverse the
   * voucher instead") — same reasoning as cancelVoucherRecord's Cancel -> Reverse
   * fallback above: undoing a posted document's stock/ledger effect needs a real
   * mirror-image reversal first, a soft-delete alone would leave that effect live
   * while hiding the document that explains it. So this reverses first when that
   * specific guard fires, then retries the delete on the now-reversed document. */
  async function deleteVoucherRecord(row: PurchaseRow, workspaceId: string) {
    await deleteVoucher(mode, row.sourceId, workspaceId);
  }

  /** The single-row counterpart to the bulk Delete All — same recycle-bin flow, same
   * server-side guard against deleting a document something else was already raised
   * against, just reachable straight from that one row's own menu. */
  async function handleDeleteRow() {
    if (!deleteRowTarget || !session?.workspaceId) {
      return;
    }

    setDeletingRow(true);
    try {
      await deleteVoucherRecord(deleteRowTarget, session.workspaceId);
      // Narrower [mode, "day-book"] invalidation left Trial Balance and other reports
      // showing stale figures after a purchase posts — reports read their own cached
      // query key, so only invalidating day-book never marked them stale too.
      await queryClient.invalidateQueries({ queryKey: [mode] });
      await query.refetch();
      toast.success(`${deleteRowTarget.documentNumber} moved to Recycle Bin`);
      setDeleteRowTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be deleted");
    } finally {
      setDeletingRow(false);
    }
  }

  /**
   * Soft-deletes every selected row one at a time — each goes through the same
   * recycle-bin flow as a single-row delete, so nothing is destroyed outright and
   * the batch can be recovered from the Recycle Bin if it was a mistake.
   */
  async function handleBulkDeleteSelected() {
    const targets = selectedRows;
    if (!targets.length || !session?.workspaceId) {
      setBulkDeleteDialogOpen(false);
      return;
    }

    setBulkDeleting(true);
    let succeeded = 0;
    const failures: string[] = [];

    for (const row of targets) {
      try {
        await deleteVoucherRecord(row, session.workspaceId);
        succeeded += 1;
      } catch (error) {
        failures.push(`${row.documentNumber}: ${error instanceof Error ? error.message : "could not be deleted"}`);
      }
    }

    await queryClient.invalidateQueries({ queryKey: [mode] });
    await query.refetch();
    setBulkDeleting(false);
    setBulkDeleteDialogOpen(false);
    setSelectedRowIds([]);

    if (succeeded) {
      toast.success(`${succeeded} of ${targets.length} document${targets.length === 1 ? "" : "s"} moved to Recycle Bin`);
    }
    failures.forEach((message) => toast.error(message));
  }

  /**
   * Reads a simple CSV (Party, Item, Quantity, Unit Price, Reference, Date) and creates
   * one document per row — an order, receipt note, or bill depending on which workspace
   * section this was triggered from — through the same createVoucher path a hand-entered
   * document uses, so imported rows are indistinguishable from manually entered ones. Rows
   * that fail (unknown party, bad numbers) are skipped and reported rather than aborting
   * the whole file.
   */
  async function handleBulkImportFile(file: File) {
    if (!session?.workspaceId) {
      return;
    }

    const text = await file.text();
    const parsed = parseImportCsv(text);
    if (!parsed.rows.length) {
      toast.error("No data rows found in that file");
      return;
    }

    setBulkImporting(true);

    // The master supplier list (not just names seen in past vouchers) so a supplier
    // with no prior orders can still be matched by name.
    const suppliers =
      mode === "api"
        ? await apiRequest<Array<{ id: string; name: string; address: string | null }>>(
            `/parties?workspaceId=${encodeURIComponent(session.workspaceId)}&type=supplier`,
          ).catch(() => [])
        : getPartyOptions(readDataset(mode), session.workspaceId, "purchase").map((party) => ({ id: party.id, name: party.name, address: party.address }));

    let succeeded = 0;
    const failures: string[] = [];

    for (const [index, csvRow] of parsed.rows.entries()) {
      const rowNumber = index + 2; // +1 for zero-index, +1 for the header row
      const partyName = csvRow.party.trim();
      const itemName = csvRow.item.trim();
      const quantity = Number(csvRow.quantity);
      const unitPrice = Number(csvRow.unitPrice);

      if (!partyName || !itemName || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        failures.push(`Row ${rowNumber}: needs a party, item, quantity > 0, and a valid price`);
        continue;
      }

      const matchedSupplier = suppliers.find((party) => party.name.toLowerCase() === partyName.toLowerCase());
      if (!matchedSupplier) {
        failures.push(`Row ${rowNumber}: no supplier named "${partyName}" — add them first`);
        continue;
      }

      const lineTotal = quantity * unitPrice;
      const voucherDate = csvRow.date.trim() || format(new Date(), "yyyy-MM-dd");

      try {
        await createVoucher(mode, {
          workspaceId: session.workspaceId,
          voucherType: "purchase",
          voucherDate,
          partyName: matchedSupplier.name,
          partyId: matchedSupplier.id,
          reference: csvRow.reference.trim() || undefined,
          narration: `Imported from ${file.name}`,
          status: "pending",
          settlementMode: "accounts-payable",
          documentKind: section === "orders" ? "purchase-order" : section === "receipt-notes" ? "receipt-note" : undefined,
          supplierAddress: matchedSupplier.address ?? "",
          condition: "",
          buyerSignature: "",
          sellerSignature: "",
          discountType: "fixed",
          discountAmount: 0,
          subtotal: lineTotal,
          totalAmount: lineTotal,
          inventoryItems: [{ id: `import-item-${rowNumber}`, itemName, quantity, unitPrice }],
          lines: [
            { id: `import-line-${rowNumber}-debit`, ledger: "Inventory Control", description: itemName, debit: lineTotal, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
            { id: `import-line-${rowNumber}-credit`, ledger: matchedSupplier.name, description: itemName, debit: 0, credit: lineTotal, costCenter: "Head Office", project: "Trading", billReference: "" },
          ],
        });
        succeeded += 1;
      } catch (error) {
        failures.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : "could not be created"}`);
      }
    }

    await queryClient.invalidateQueries({ queryKey: [mode] });
    await query.refetch();
    setBulkImporting(false);

    if (succeeded) {
      toast.success(`${succeeded} of ${parsed.rows.length} purchase order${parsed.rows.length === 1 ? "" : "s"} imported`);
    }
    failures.slice(0, 5).forEach((message) => toast.error(message));
    if (failures.length > 5) {
      toast.error(`...and ${failures.length - 5} more row${failures.length - 5 === 1 ? "" : "s"} failed`);
    }
  }

  function openVoucher(row: PurchaseRow, modeType: "edit" | "duplicate") {
    const queryParam = modeType === "edit" ? `edit=${row.sourceId}` : `duplicate=${row.sourceId}`;
    const purchaseWorkflow = row.openVoucherType === "purchase" ? getPurchaseWorkflowForSection(section) : null;
    const workflowParam = purchaseWorkflow ? `&workflow=${purchaseWorkflow}` : "";
    startTransition(() => {
      router.push(`${buildVoucherRoute(mode, row.openVoucherType)}?${queryParam}${workflowParam}&returnTo=${encodeURIComponent(buildCurrentSectionReturnRoute())}`);
    });
  }

  function recordPayment(row: PurchaseRow) {
    startTransition(() => {
      router.push(`${buildVoucherRoute(mode, "payment")}?fromVoucher=${row.sourceId}`);
    });
  }

  /**
   * A debit note is a return against a specific bill, so it opens pre-filled from
   * that bill's party and items rather than as a blank standalone document.
   */
  function convertBillToDebitNote(row: PurchaseRow) {
    setOpenRowMenuId(null);
    setDetailRow(null);
    const returnTo = encodeURIComponent(buildPurchaseWorkspaceRoute(mode, section));
    startTransition(() => {
      router.push(`${buildVoucherRoute(mode, "debit-note")}?fromVoucher=${encodeURIComponent(row.sourceId)}&returnTo=${returnTo}`);
    });
  }

  function openSupplierLedger(row: PurchaseRow) {
    startTransition(() => {
      router.push(`${buildWorkspaceRoute(mode, "/day-book")}?query=${encodeURIComponent(row.partyName)}`);
    });
  }

  function emailSupplier(row: PurchaseRow) {
    setOpenRowMenuId(null);
    const savedCompanyName = session?.workspaceId ? readCompanyProfile(mode, session.workspaceId).companyName.trim() : "";

    // Parties store one contact field, so only an email-shaped value can be used
    // as the recipient — otherwise the mail window would open with a blank To.
    const supplier = previewParties.find((party) => party.name.trim().toLowerCase() === row.partyName.trim().toLowerCase());
    const recipient = isEmailAddress(supplier?.contact) ? supplier?.contact : undefined;

    if (!recipient) {
      toast.error(`No email address saved for ${row.partyName}. Add one on the supplier's profile first.`);
      return;
    }

    openMailComposer(
      `${config.label} ${row.documentNumber}`,
      `Dear ${row.partyName},\n\nPlease find the details of ${config.label.toLowerCase()} ${row.documentNumber} below.\n\nDate: ${formatDate(row.documentDate)}\nReference: ${row.reference}\nAmount: ${formatCurrency(row.amount)}\n\nRegards,\n${savedCompanyName || workspace?.name || appConfig.companyName}`,
      recipient,
    );
  }

  /**
   * A purchase order becomes a receipt note first — that is the step that
   * records when the goods actually arrived — and the receipt note is what turns
   * into the bill afterwards.
   */
  function convertOrderToReceiptNote(row: PurchaseRow) {
    if (isFullyConverted(row)) {
      toast.info("All ordered quantities have already been received");
      return;
    }
    setOpenRowMenuId(null);
    setDetailRow(null);
    // Opens the receipt note as a full page rather than a cramped dialog, the
    // same way a purchase order is entered. `returnTo` sends the close button back
    // to the list the conversion started from instead of the receipt note list.
    const returnTo = encodeURIComponent(buildPurchaseWorkspaceRoute(mode, section));
    startTransition(() => {
      router.push(
        `${buildVoucherRoute(mode, "purchase")}?workflow=receipt-note&fromVoucher=${encodeURIComponent(row.sourceId)}&returnTo=${returnTo}`,
      );
    });
  }

  /**
   * The bill opens as a full page like every other step of the purchase workflow,
   * and closing it returns to the list the conversion started from.
   */
  function convertOrderToPurchase(row: PurchaseRow) {
    if (isFullyConverted(row)) {
      toast.info("This receipt note has already been billed in full");
      return;
    }
    setOpenRowMenuId(null);
    setDetailRow(null);
    const returnTo = encodeURIComponent(buildPurchaseWorkspaceRoute(mode, section));
    startTransition(() => {
      router.push(`${buildVoucherRoute(mode, "purchase")}?fromVoucher=${encodeURIComponent(row.sourceId)}&returnTo=${returnTo}`);
    });
  }

  function openColumnFilter(columnId: FilterableColumnId, event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    if (columnFilterPopover?.columnId === columnId) {
      setColumnFilterPopover(null);
      return;
    }

    const existing = columnFilters[columnId] ?? defaultColumnFilter;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const popoverWidth = isDateColumn(columnId) ? 360 : 280;
    const maxLeft = Math.max(16, viewportWidth - popoverWidth - 16);
    const centeredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const preferredLeft = rect.right + popoverWidth > viewportWidth - 16 ? rect.right - popoverWidth : centeredLeft;
    setColumnFilterDraft(existing);
    setColumnFilterPopover({
      columnId,
      left: Math.min(Math.max(16, preferredLeft), maxLeft),
      top: rect.bottom + 10,
    });
  }

  function updateBillsPreset(nextPreset: PurchasePreset) {
    const window = nextPreset === "custom"
      ? { start: filters.from, end: filters.to }
      : nextPreset === "last-posting-month" && postingAnchorQuery.data
        ? (() => {
            const postingRange = getPurchaseSectionPostingMonthRange(postingAnchorQuery.data, section);
            return postingRange
              ? { start: postingRange.from, end: postingRange.to }
              : buildDateWindow(nextPreset, workspace);
          })()
        : buildDateWindow(nextPreset, workspace);
    const nextFilters = {
      ...filters,
      preset: nextPreset,
      from: window.start,
      to: window.end,
    };
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
  }

  function updateBillsDates(field: "from" | "to", value: string) {
    const nextFilters = {
      ...filters,
      preset: "custom" as const,
      [field]: value,
    };
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
  }

  /* "Last Posting Month" opens with an empty range on purpose (see buildDateWindow)
   * and is filled in once the posting-anchor query answers. Two blank dd/mm/yyyy
   * boxes read as a filter that failed, so the strip says which state the range is
   * actually in. The inputs stay editable — typing a date is how you switch to
   * Custom — but they are toned down while a preset owns them. */
  function renderFilterDateRange(radiusClassName: string) {
    const presetDriven = filters.preset !== "custom";
    const unresolved = filters.preset === "last-posting-month" && !filters.from && !filters.to;
    const presetLabel = purchasePresetOptions.find((option) => option.value === filters.preset)?.label ?? "preset";
    const inputClassName = cn("h-9 border-0 px-2 pr-9 focus:ring-0", presetDriven ? "bg-[#f2f6fb] text-[#42566e]" : "");
    return (
      <div
        className={cn(
          "flex w-full min-w-0 flex-wrap items-center overflow-hidden border border-[#d5dbe4] bg-white sm:w-auto",
          radiusClassName,
        )}
        title={presetDriven ? `Range comes from the ${presetLabel} preset. Type a date to switch to Custom.` : undefined}
      >
        <div className="bg-[#315b8f] px-3 py-[9px] text-xs font-semibold uppercase tracking-[0.08em] text-white">Between</div>
        {unresolved ? (
          <div role="status" className="flex h-9 items-center gap-2 px-3 text-[13px] text-[#607089]">
            <RefreshCw className={cn("h-3.5 w-3.5", postingAnchorQuery.isLoading ? "animate-spin" : "")} />
            {postingAnchorQuery.isLoading
              ? "Resolving last posting month…"
              : "All dates — nothing posted yet"}
          </div>
        ) : (
          <>
            <AppDateInput
              value={filters.from}
              onChange={(value) => updateBillsDates("from", value)}
              aria-label="From date"
              className="w-[136px] shrink-0"
              inputClassName={inputClassName}
            />
            <div className="px-2 text-sm text-[#607089]">To</div>
            <AppDateInput
              value={filters.to}
              onChange={(value) => updateBillsDates("to", value)}
              aria-label="To date"
              className="w-[136px] shrink-0"
              inputClassName={inputClassName}
            />
          </>
        )}
      </div>
    );
  }

  function updateBillsFirm(nextFirm: PurchaseWorkspaceFilters["firm"]) {
    const nextFilters = {
      ...filters,
      firm: nextFirm,
    };
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
  }

  function updateInstantFilters(patch: Partial<PurchaseWorkspaceFilters>) {
    const nextFilters = { ...filters, ...patch };
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
  }

  function applyColumnFilter() {
    if (!columnFilterPopover) {
      return;
    }

    setColumnFilters((current) => {
      const next = { ...current };
      const isEmpty =
        !columnFilterDraft.value.trim() && columnFilterDraft.values.length === 0 && !columnFilterDraft.dateFrom && !columnFilterDraft.dateTo;
      if (isEmpty) {
        delete next[columnFilterPopover.columnId];
      } else {
        next[columnFilterPopover.columnId] = columnFilterDraft;
      }
      return next;
    });
    setColumnFilterPopover(null);
  }

  /** Toggles one value in the open column filter's checked list. */
  function toggleColumnFilterValue(value: string) {
    setColumnFilterDraft((current) => ({
      ...current,
      values: current.values.includes(value) ? current.values.filter((entry) => entry !== value) : [...current.values, value],
    }));
  }

  function openMoreAction(action: "register" | "export" | "print" | "settings" | "day-book") {
    setMoreOpen(false);
    if (action === "export") {
      exportVisibleRows("excel");
      return;
    }
    if (action === "print") {
      printCurrentRegister();
      return;
    }
    if (action === "settings") {
      setSettingsOpen(true);
      return;
    }
    if (action === "day-book") {
      startTransition(() => {
        router.push(buildWorkspaceRoute(mode, "/day-book"));
      });
      return;
    }
    setAuditRow(null);
    toast.success(`${config.label} register is ready in the current workspace`);
  }

  function getRowActions(row: PurchaseRow): RowAction[] {
    const lockedByPurchaseChild = isOrderLikeSection(section) && isFullyConverted(row);
    const baseActions: RowAction[] = [
      { label: "View", icon: Eye, onClick: () => setDetailRow(row) },
      ...(!lockedByPurchaseChild ? [{ label: "Edit", icon: Pencil, onClick: () => openVoucher(row, "edit") } satisfies RowAction] : []),
      { label: "Print", icon: Printer, onClick: () => handleSinglePrint(row) },
      { label: "Share", icon: Share2, onClick: () => void handleShareRow(row) },
      { label: "Duplicate", icon: Copy, onClick: () => openVoucher(row, "duplicate") },
      { label: "Audit Log", icon: History, onClick: () => setAuditRow(row) },
    ];

    if (section === "bills") {
      baseActions.splice(4, 0, { label: "Record Payment", icon: CircleDollarSign, onClick: () => recordPayment(row) });
      if (row.statusLabel !== "Cancelled") {
        baseActions.splice(5, 0, { label: "Create Purchase Return", icon: FileMinus2, onClick: () => convertBillToDebitNote(row) });
      }
      baseActions.splice(baseActions.length - 1, 0, { label: "View Supplier Ledger", icon: BookOpen, onClick: () => openSupplierLedger(row) });
    }

    if (isOrderLikeSection(section)) {
      baseActions.splice(4, 0, { label: "Email Supplier", icon: Mail, onClick: () => emailSupplier(row) });
      // Orders flow into a receipt note first; only a receipt note becomes a bill. Once
      // there is nothing left to carry forward, or the document itself was cancelled,
      // the action drops out rather than offering to raise a document against it.
      if (!isFullyConverted(row) && row.statusLabel !== "Cancelled") {
        baseActions.splice(
          5,
          0,
          section === "receipt-notes"
            ? { label: "Convert to Purchase Bill", icon: ReceiptText, onClick: () => convertOrderToPurchase(row) }
            : { label: "Convert to Receipt Note", icon: ReceiptText, onClick: () => convertOrderToReceiptNote(row) },
        );
      }
      // On an order, "recording goods receipt" is the receipt note itself, which
      // is already the action above — so only receipt notes get an extra entry.
      if (section === "receipt-notes" && !lockedByPurchaseChild) {
        baseActions.splice(6, 0, { label: "Edit Receipt Note", icon: RotateCcw, onClick: () => openVoucher(row, "edit") });
      }
    }

    if (section === "payment-out") {
      baseActions.splice(4, 0, { label: "View Supplier Ledger", icon: BookOpen, onClick: () => openSupplierLedger(row) });
    }

    if (!lockedByPurchaseChild) {
      baseActions.push({ label: "Cancel", icon: XCircle, onClick: () => void handleCancelVoucher(row), tone: "danger" });
      baseActions.push({ label: "Delete", icon: Trash2, onClick: () => setDeleteRowTarget(row), tone: "danger" });
    } else {
      baseActions.push({
        label: "Delete",
        icon: Trash2,
        onClick: () => toast.error("Delete the linked Receipt Note or Purchase Bill first, then delete this document."),
        tone: "danger",
      });
    }

    return baseActions;
  }

  if (query.isLoading && !query.data) {
    return <div className="rounded-[26px] border border-[#d8e1ee] bg-white p-6 text-sm text-[#61708a]">Loading purchase workspace...</div>;
  }

  if (query.error) {
    return (
      <div className="rounded-[26px] border border-[#f1d6d6] bg-white p-6 text-sm text-[#b03b3b]">
        {(query.error as Error).message || "Purchase workspace could not be loaded"}
      </div>
    );
  }

  return (
    <div data-purchase-workspace data-purchase-bills-workspace={isBillsWorkspace ? "true" : undefined} data-purchase-payment-out-workspace={isPaymentOutWorkspace ? "true" : undefined} className={cn("flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-x-hidden", section === "revenue" ? "gap-2" : isPaymentOutWorkspace ? "gap-3" : "gap-4")}>
      <MasterDataReadinessGuard readiness={readiness} compact />
      {isBillsWorkspace ? (
        <>
          <section data-purchase-bills-title-row className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {renderWorkspaceTitle()}
          </section>

          <section data-purchase-bills-summary className="min-w-0 max-w-full overflow-hidden rounded-[6px] border border-[#d7e1ec] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="relative border-b border-[#d9e4ef] bg-[#f4f9ff] px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex w-full flex-wrap items-center gap-3">
                  <label className="relative">
                    <select
                      value={filters.preset}
                      onChange={(event) => updateBillsPreset(event.target.value as PurchasePreset)}
                      className="h-9 appearance-none rounded-md border border-[#d5dbe4] bg-white pl-3 pr-8 text-[13px] font-medium text-[#173152] outline-none"
                    >
                      {purchasePresetOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54657f]" />
                  </label>

                  {renderFilterDateRange("rounded-md")}

                  <label className="relative">
                    <select
                      value={filters.firm}
                      onChange={(event) => updateBillsFirm(event.target.value as PurchaseWorkspaceFilters["firm"])}
                      className="h-9 appearance-none rounded-md border border-[#d5dbe4] bg-white pl-3 pr-8 text-[13px] font-medium text-[#173152] outline-none"
                    >
                      <option value="active">ACTIVE FIRM</option>
                      <option value="all">ALL FIRMS</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54657f]" />
                  </label>
                  <Button type="button" className="ml-auto h-10 rounded-[10px] bg-primary px-5 text-white hover:bg-[#cf670f]" onClick={handlePrimaryAction}>
                    <Plus className="h-4 w-4" /> {primaryActionLabel}
                  </Button>
                </div>

              </div>

              <div data-purchase-bills-totals className="mt-3 flex flex-wrap items-center gap-3">
                <div className="min-w-[180px] rounded-[10px] bg-[#16866f] px-4 py-3 text-white shadow-[0_7px_16px_rgba(22,134,111,0.2)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">Paid</div>
                  <div className="mt-1 text-[1.05rem] font-semibold text-white">{formatCurrency(toolbarTotals.paid)}</div>
                </div>
                <div className="text-[1.6rem] font-medium text-[#7b8799]">+</div>
                <div className="min-w-[180px] rounded-[10px] bg-[#c9682c] px-4 py-3 text-white shadow-[0_7px_16px_rgba(201,104,44,0.2)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">Unpaid</div>
                  <div className="mt-1 text-[1.05rem] font-semibold text-white">{formatCurrency(toolbarTotals.balance)}</div>
                </div>
                {/* Returns applied to these bills are the reason gross Total is bigger
                  * than Paid + Unpaid, so the equation names them instead of leaving an
                  * unexplained difference between the three boxes. */}
                {moneyToMinorUnits(toolbarTotals.returnAdjusted) > 0 ? (
                  <>
                    <div className="text-[1.6rem] font-medium text-[#7b8799]">+</div>
                    <div className="min-w-[180px] rounded-[10px] bg-[#8f3b32] px-4 py-3 text-white shadow-[0_7px_16px_rgba(143,59,50,0.2)]">
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">Return Adjusted</div>
                      <div className="mt-1 text-[1.05rem] font-semibold text-white">{formatCurrency(toolbarTotals.returnAdjusted)}</div>
                      <div className="mt-0.5 text-[11px] text-white/75">Purchase returns applied to these bills</div>
                    </div>
                  </>
                ) : null}
                <div className="text-[1.6rem] font-medium text-[#7b8799]">=</div>
                <div className="min-w-[180px] rounded-[10px] bg-[#315b8f] px-4 py-3 text-white shadow-[0_7px_16px_rgba(49,91,143,0.2)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">Total</div>
                  <div className="mt-1 text-[1.05rem] font-semibold text-white">{formatCurrency(toolbarTotals.amount)}</div>
                </div>
                {moneyToMinorUnits(pendingPurchaseBillTotal) > 0 ? (
                  <div className="min-w-[220px] rounded-[10px] bg-[#c0392b] px-4 py-3 text-white shadow-[0_7px_16px_rgba(192,57,43,0.25)]">
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">Pending Purchase Bill</div>
                    <div className="mt-1 text-[1.05rem] font-semibold text-white">{formatCurrency(pendingPurchaseBillTotal)}</div>
                    <div className="mt-0.5 text-[11px] text-white/75">Receipt notes received but not yet billed</div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section data-purchase-bills-transactions className="flex min-h-[calc(100vh-25rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d7e1ec] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-[#e4ebf4] px-3 py-2">
              <div className="flex items-center gap-2 text-[1.02rem] font-semibold uppercase text-[#1a2f4d]"><ReceiptText className="h-[18px] w-[18px] text-primary" aria-hidden="true" />Transactions</div>
              <div className="flex items-center gap-2">
                <CollapsibleSearch value={filters.searchQuery} onChange={syncSearch} label="Search transactions" placeholder="Search" />
                {renderRegisterActions()}
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
                <div className="rounded-full bg-[#eaf3ff] p-5 text-[#4d8fe0]">
                  <ReceiptText className="h-12 w-12" />
                </div>
                <p className="max-w-xl text-sm text-[#64748b]">Make purchase invoices and manage supplier bills from one place.</p>
                <Button type="button" className="h-11 rounded-md bg-primary px-8 text-white hover:bg-[#cf670f]" onClick={handlePrimaryAction}>
                  Add Your First Purchase Invoice
                </Button>
              </div>
            ) : (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <input
                  ref={bulkImportInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    if (file) {
                      void handleBulkImportFile(file);
                    }
                  }}
                />
                <div data-purchase-bills-table-scroll ref={tableScrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
                  <table data-purchase-bills-table className="w-full table-fixed border-separate border-spacing-0 text-[clamp(11px,0.8vw,14px)] [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td:last-child]:overflow-visible" aria-label={`${config.label} transaction grid`}>
                    <thead className={cn(stickyHeader ? "sticky top-0 z-10" : "")}>
                      <tr className="bg-[#fbfcfe] text-[#586b84]">
                        <th data-purchase-bills-column="select" className="w-10 border-b border-r border-[#dce5f0] px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            aria-label="Select all visible rows"
                            checked={pagedRows.length > 0 && pagedRows.every((row) => selectedRowIds.includes(row.id))}
                            onChange={(event) => toggleVisibleRows(event.target.checked)}
                          />
                        </th>
                        {columns
                          .filter((column) => ["date", "documentNumber", "partyName", "paymentMethod", "amount", "balance", "status", "actions"].includes(column.id))
                          .map((column) => (
                            <th
                              key={column.id}
                              data-purchase-bills-column={column.id}
                              className={cn(
                                "relative border-b border-r border-[#dce5f0] px-2 py-2 text-left text-[11px] font-semibold uppercase",
                                column.align === "center" ? "text-center" : "",
                              )}
                              style={{ width: `${columnWidths[column.id]}px`, minWidth: `${columnWidths[column.id]}px` }}
                            >
                              {column.id === "actions" ? (
                                <div className="relative flex items-center justify-end" ref={bulkActionsMenuRef}>
                                  <button
                                    type="button"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#61708a] transition hover:bg-[#edf4ff]"
                                    onClick={() => setBulkActionsMenuOpen((current) => !current)}
                                    aria-label="Bulk actions"
                                    title="Bulk actions"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </button>
                                  {bulkActionsMenuOpen ? (
                                    <div className="absolute right-0 top-8 z-20 min-w-[190px] rounded-2xl border border-[#d7e1ee] bg-white p-2 text-left shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                                      <button
                                        type="button"
                                        disabled={!selectedRowIds.length}
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm normal-case text-[#c63c3c] transition hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                        onClick={() => {
                                          setBulkActionsMenuOpen(false);
                                          setBulkDeleteDialogOpen(true);
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        <span>Delete All</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm normal-case text-[#24364f] transition hover:bg-[#f7faff]"
                                        onClick={() => {
                                          setBulkActionsMenuOpen(false);
                                          exportVisibleRows("excel");
                                        }}
                                      >
                                        <ExcelIcon className="h-4 w-4" />
                                        <span>Export All</span>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={bulkImporting}
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm normal-case text-[#24364f] transition hover:bg-[#f7faff] disabled:opacity-50"
                                        onClick={() => {
                                          setBulkActionsMenuOpen(false);
                                          bulkImportInputRef.current?.click();
                                        }}
                                      >
                                        <UploadCloud className="h-4 w-4" />
                                        <span>{bulkImporting ? "Importing..." : "Import All"}</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs normal-case text-[#0f6cf6] transition hover:bg-[#f7faff]"
                                        onClick={() => {
                                          setBulkActionsMenuOpen(false);
                                          downloadImportSampleCsv();
                                        }}
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                        <span>Download import sample</span>
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                        className="text-left transition hover:text-primary"
                                    onClick={() => toggleSort(column.id as FilterableColumnId)}
                                  >
                                    {column.label}
                                  </button>
                                  {column.filterable ? (
                                    <button
                                      type="button"
                                      className={cn(
                                        "rounded-md p-1 text-[#7a8799] transition hover:bg-[#fff7ef] hover:text-primary",
                                        columnFilters[column.id as FilterableColumnId] ? "bg-[#fff7ef] text-primary" : "",
                                      )}
                                      aria-label={`Filter ${column.label}`}
                                      onClick={(event) => openColumnFilter(column.id as FilterableColumnId, event)}
                                    >
                                      <Filter className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              )}
                              {column.id !== "actions" ? renderColumnResizeHandle(column.id, column.label) : null}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.map((row) => {
                        const rowActions = getRowActions(row);
                        const rowMenuOpen = openRowMenuId === row.id;
                        const rowSelected = selectedRowIds.includes(row.id);
                        return (
                          <tr key={row.id} className={cn("cursor-pointer transition hover:bg-[#f9fbff]", rowSelected ? "bg-[#eef6ff]" : "bg-white")} onClick={() => setDetailRow(row)}>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.documentNumber}`}
                                checked={rowSelected}
                                onChange={(event) => toggleRowSelection(row.id, event.target.checked)}
                              />
                            </td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-[#173152]">{formatDate(row.documentDate)}</td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 font-medium leading-4 text-[#173152]">
                              <div className="truncate whitespace-nowrap">{row.documentNumber}</div>
                              {row.sourceReference ? (
                                <div className="truncate whitespace-nowrap text-[10px] font-normal leading-4 text-[#8994a6]">
                                  Ref: {row.sourceReference}
                                  {row.orderedQty > 0 ? ` · ${formatNumber(row.receivedQty)} of ${formatNumber(row.orderedQty)} items` : ""}
                                </div>
                              ) : null}
                            </td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-[#173152]">{row.partyName}</td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-[#173152]">{row.paymentMethod}</td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-right text-[#173152]">{formatCurrency(row.amount)}</td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-right text-[#173152]">{formatCurrency(row.balance)}</td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center">
                              <span
                                className={cn(
                                  "whitespace-nowrap text-xs font-medium",
                                  row.statusLabel === "Paid"
                                    ? "text-[#1d8f4d]"
                                    : row.statusLabel === "Draft"
                                      ? "text-[#b56c12]"
                                      : row.statusLabel === "Overdue"
                                        ? "text-[#d13f3f]"
                                        : "text-[#226dff]",
                                )}
                              >
                                {row.statusLabel}
                              </span>
                            </td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                              <div className="relative flex items-center justify-center">
                                <button
                                  type="button"
                                  data-row-menu-trigger
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#61708a] transition hover:bg-[#edf4ff]"
                                  onClick={() => setOpenRowMenuId((current) => (current === row.id ? null : row.id))}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                                {rowMenuOpen ? (
                                  <div ref={rowMenuRef} className="absolute right-0 top-9 z-20 min-w-[210px] rounded-2xl border border-[#d7e1ee] bg-white p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                                    {rowActions.map((action) => (
                                      <button
                                        key={action.label}
                                        type="button"
                                        className={cn(
                                          "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[#f7faff]",
                                          action.tone === "danger" ? "text-[#c63c3c]" : "text-[#24364f]",
                                        )}
                                        onClick={action.onClick}
                                      >
                                        <action.icon className="h-4 w-4" />
                                        <span>{action.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="relative flex h-14 shrink-0 items-center justify-between border-t border-[#dfe7f1] px-3 text-xs text-[#61708a]">
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="flex items-center gap-3 rounded-md border border-[#d7e1ee] bg-[#f8fbff] px-4 py-1.5 shadow-sm">
                      <div className="text-center">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[#7b8799]">Total Purchase</div>
                        <div className="font-semibold tabular-nums text-[#173152]">{formatCurrency(toolbarTotals.amount)}</div>
                      </div>
                      <span className="text-base font-semibold text-[#8b98aa]">−</span>
                      <div className="text-center">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[#7b8799]">Purchase Return</div>
                        <div className="font-semibold tabular-nums text-[#c9682c]">{formatCurrency(filteredPurchaseReturnTotal)}</div>
                      </div>
                      <span className="text-base font-semibold text-[#8b98aa]">=</span>
                      <div className="text-center">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[#7b8799]">Net Purchase</div>
                        <div className="font-semibold tabular-nums text-[#07875f]">{formatCurrency(netPurchaseTotal)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="relative z-10 flex items-center gap-3">
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <label className="inline-flex items-center gap-1.5">
                      <span>Rows</span>
                      <select
                        value={pageSize}
                        onChange={(event) => setPageSize(Number(event.target.value))}
                        className="h-7 rounded-lg border border-[#d5dbe4] bg-white px-2 text-xs text-[#173152]"
                      >
                        {pageSizeOptions.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="relative z-10 flex items-center gap-2">
                    <Button type="button" variant="outline" className="h-7 rounded-lg border-[#d5dbe4] px-2.5 text-xs" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                      Previous
                    </Button>
                    <Button type="button" variant="outline" className="h-7 rounded-lg border-[#d5dbe4] px-2.5 text-xs" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      ) : isPaymentOutWorkspace ? (
        <>
          <section data-purchase-payment-out-title-row className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {renderWorkspaceTitle()}
          </section>

          <section data-purchase-payment-out-summary className="rounded-[6px] border border-[#d7e1ec] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="border-b border-[#d9e4ef] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2.5 text-[#1c2f4e]">
                <div className="text-[15px] font-medium">Filter by :</div>
                <label className="relative">
                  <select
                    value={filters.preset}
                    onChange={(event) => updateBillsPreset(event.target.value as PurchasePreset)}
                    className="h-9 appearance-none rounded-full border border-[#d7e5f7] bg-[#e8f2ff] pl-4 pr-9 text-sm text-[#1f3657] outline-none"
                  >
                    {purchasePresetOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54657f]" />
                </label>
                <div className="flex flex-wrap items-center gap-2 rounded-full border border-[#d7e5f7] bg-[#e8f2ff] px-3.5 py-1.5 text-sm text-[#1f3657]">
                  <AppDateInput value={filters.from} onChange={(value) => updateBillsDates("from", value)} aria-label="From date" className="w-[132px]" inputClassName="h-7 border-0 bg-transparent px-0 pr-7 focus:ring-0" />
                  <span>To</span>
                  <AppDateInput value={filters.to} onChange={(value) => updateBillsDates("to", value)} aria-label="To date" className="w-[132px]" inputClassName="h-7 border-0 bg-transparent px-0 pr-7 focus:ring-0" />
                </div>
                <label className="relative">
                  <select
                    value={filters.firm}
                    onChange={(event) => updateBillsFirm(event.target.value as PurchaseWorkspaceFilters["firm"])}
                    className="h-9 appearance-none rounded-full border border-[#d7e5f7] bg-[#e8f2ff] pl-4 pr-9 text-sm text-[#1f3657] outline-none"
                  >
                    <option value="all">All Firms</option>
                    <option value="active">Active Firm</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54657f]" />
                </label>
                <Button type="button" className="ml-auto h-10 rounded-[10px] bg-primary px-5 text-white hover:bg-[#cf670f]" onClick={handlePrimaryAction}>
                  <Plus className="h-4 w-4" /> {primaryActionLabel}
                </Button>
              </div>
            </div>

            <div className="relative border-t border-[#d9e4ef] px-4 py-3">
              <div data-purchase-payment-out-totals className="flex flex-wrap items-center gap-3">
                <div className="min-w-[180px] rounded-[10px] bg-[#315b8f] px-4 py-3 text-white shadow-[0_7px_16px_rgba(49,91,143,0.2)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">Total Payment-Out</div>
                  <div className="mt-1 text-[1.05rem] font-semibold">{formatCurrency(toolbarTotals.amount)}</div>
                </div>
                <div className="text-[1.6rem] font-medium text-[#7b8799]">=</div>
                <div className="min-w-[180px] rounded-[10px] bg-[#16866f] px-4 py-3 text-white shadow-[0_7px_16px_rgba(22,134,111,0.2)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">Applied</div>
                  <div className="mt-1 text-[1.05rem] font-semibold">{formatCurrency(toolbarTotals.paid)}</div>
                </div>
                <div className="text-[1.6rem] font-medium text-[#7b8799]">+</div>
                <div className="min-w-[180px] rounded-[10px] bg-[#c9682c] px-4 py-3 text-white shadow-[0_7px_16px_rgba(201,104,44,0.2)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">Unapplied</div>
                  <div className="mt-1 text-[1.05rem] font-semibold">{formatCurrency(toolbarTotals.balance)}</div>
                </div>
              </div>
            </div>
          </section>

          <section data-purchase-payment-out-transactions className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d7e1ec] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-[#e4ebf4] px-3 py-2">
              <div className="flex items-center gap-2 text-[1.02rem] font-semibold uppercase text-[#24364f]"><ReceiptText className="h-[18px] w-[18px] text-primary" aria-hidden="true" />Transactions</div>
              <div className="flex items-center gap-2 text-[#6c7b95]">
                <CollapsibleSearch value={filters.searchQuery} onChange={syncSearch} label="Search transactions" placeholder="Search transactions" />
                {renderRegisterActions()}
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div data-purchase-payment-out-table-scroll ref={tableScrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
                <table data-purchase-payment-out-table className="w-full table-fixed border-separate border-spacing-0 text-[clamp(11px,0.8vw,14px)] [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td:last-child]:overflow-visible" aria-label={`${config.label} transaction grid`}>
                  <thead className={cn(stickyHeader ? "sticky top-0 z-10" : "")}>
                    <tr className="bg-[#fbfcfe] text-[#586b84]">
                      <th data-purchase-payment-out-column="select" className="w-10 border-b border-r border-[#dce5f0] px-2 py-2.5 text-center">
                        <input type="checkbox" aria-label="Select all visible payments" checked={allVisibleSelected} onChange={(event) => toggleVisibleRows(event.target.checked)} />
                      </th>
                      {[
                        { id: "date", label: "Date", width: "150px", align: "left" as const, filterable: true },
                        { id: "reference", label: "Ref. no.", width: "150px", align: "left" as const, filterable: true },
                        { id: "partyName", label: "Party Name", width: "250px", align: "left" as const, filterable: true },
                        { id: "amount", label: "Total Amount", width: "170px", align: "right" as const, filterable: true },
                        { id: "paidAmount", label: "Paid", width: "170px", align: "right" as const, filterable: true },
                        { id: "paymentMethod", label: "Payment Type", width: "170px", align: "left" as const, filterable: true },
                        { id: "status", label: "Status", width: "160px", align: "center" as const, filterable: true },
                        { id: "actions", label: "Actions", width: "130px", align: "right" as const, filterable: false },
                      ].map((column) => (
                        <th
                          key={column.id}
                          data-purchase-payment-out-column={column.id}
                          className={cn(
                            "relative border-b border-r border-[#dce5f0] px-2 py-2 text-left text-[11px] font-semibold",
                            column.align === "center" ? "text-center" : "",
                          )}
                          style={getColumnWidthStyle(column.id, column.width)}
                        >
                          {column.id === "actions" ? (
                            renderBulkActionsButton()
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <button type="button" className="transition hover:text-[#1455a0]" onClick={() => toggleSort(column.id as FilterableColumnId)}>
                                {column.label}
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "rounded-md p-1 text-[#7a8799] transition hover:bg-[#edf4ff] hover:text-[#1d66b1]",
                                  columnFilters[column.id as FilterableColumnId] ? "bg-[#edf4ff] text-[#1d66b1]" : "",
                                )}
                                onClick={(event) => openColumnFilter(column.id as FilterableColumnId, event)}
                                aria-label={`Filter ${column.label}`}
                              >
                                <Filter className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          {isColumnResizable(column.id) ? renderColumnResizeHandle(column.id, column.label) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.length ? pagedRows.map((row) => {
                      const rowActions = getRowActions(row);
                      const rowMenuOpen = openRowMenuId === row.id;
                      return (
                        <tr key={row.id} className="cursor-pointer transition hover:bg-[#f9fbff]" onClick={() => setDetailRow(row)}>
                          <td className="border-b border-r border-[#edf2f7] px-2 py-2.5 text-center" onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" aria-label={`Select ${row.documentNumber}`} checked={selectedRowIds.includes(row.id)} onChange={(event) => toggleRowSelection(row.id, event.target.checked)} />
                          </td>
                          <td className="border-b border-r border-[#edf2f7] px-3 py-2.5 text-[#173152]">{formatDate(row.documentDate)}</td>
                          <td className="border-b border-r border-[#edf2f7] px-3 py-2.5 text-[#173152]">{row.reference}</td>
                          <td className="border-b border-r border-[#edf2f7] px-3 py-2.5 text-[#173152]">{row.partyName}</td>
                          <td className="border-b border-r border-[#edf2f7] px-3 py-2.5 text-right text-[#173152]">{formatCurrency(row.amount)}</td>
                          <td className="border-b border-r border-[#edf2f7] px-3 py-2.5 text-right text-[#173152]">{formatCurrency(row.paidAmount)}</td>
                          <td className="border-b border-r border-[#edf2f7] px-3 py-2.5 text-[#173152]">{getPaymentOutMethodLabel(row)}</td>
                          <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center">
                            <span className={cn("font-medium", row.statusLabel === "Used" ? "text-[#00a66a]" : "text-[#b56c12]")}>{row.statusLabel}</span>
                          </td>
                          <td className="border-b border-r border-[#edf2f7] px-3 py-2.5 text-center" onClick={(event) => event.stopPropagation()}>
                            <div className="relative flex items-center justify-center">
                              <button
                                type="button"
                                data-row-menu-trigger
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#61708a] transition hover:bg-[#edf4ff]"
                                onClick={() => setOpenRowMenuId((current) => (current === row.id ? null : row.id))}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                              {rowMenuOpen ? (
                                <div ref={rowMenuRef} className="absolute right-0 top-9 z-20 min-w-[210px] rounded-2xl border border-[#d7e1ee] bg-white p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                                  {rowActions.map((action) => (
                                    <button
                                      key={action.label}
                                      type="button"
                                      className={cn(
                                        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[#f7faff]",
                                        action.tone === "danger" ? "text-[#c63c3c]" : "text-[#24364f]",
                                      )}
                                      onClick={action.onClick}
                                    >
                                      <action.icon className="h-4 w-4" />
                                      <span>{action.label}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={9} className="px-6 py-14 text-center">
                          <div className="mx-auto flex max-w-[430px] flex-col items-center">
                            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#eef6ff] text-[#315b8f] ring-1 ring-[#d9e8f7]">
                              <div className="absolute inset-2 rounded-full border border-dashed border-[#a9c8e7]" />
                              <BanknoteArrowUp className="relative h-9 w-9" strokeWidth={1.7} />
                            </div>
                            <h3 className="mt-5 text-base font-semibold text-[#24364f]">
                              {rawRows.length ? "No payments match these filters" : "No payment-out transactions yet"}
                            </h3>
                            <p className="mt-1.5 max-w-[390px] text-sm leading-6 text-[#6b7c93]">
                              {rawRows.length
                                ? "Try a different date range or clear the current filters to see available payments."
                                : "Record a supplier payment to track its applied and unapplied amount here."}
                            </p>
                            <Button
                              type="button"
                              className="mt-5 h-9 rounded-[6px] px-4 text-sm"
                              onClick={() => {
                                if (rawRows.length) {
                                  setDraftFilters(defaultFilters);
                                  setFilters(defaultFilters);
                                  setColumnFilters({});
                                } else {
                                  handlePrimaryAction();
                                }
                              }}
                            >
                              {rawRows.length ? <FilterX className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                              {rawRows.length ? "Clear Filters" : "Add Payment-Out"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex h-10 shrink-0 items-center justify-between border-t border-[#dfe7f1] px-3 text-xs text-[#61708a]">
                <div className="flex items-center gap-3">
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <label className="inline-flex items-center gap-1.5">
                    <span>Rows</span>
                    <select
                      value={pageSize}
                      onChange={(event) => setPageSize(Number(event.target.value))}
                      className="h-7 rounded-lg border border-[#d5dbe4] bg-white px-2 text-xs text-[#173152]"
                    >
                      {pageSizeOptions.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" className="h-7 rounded-lg border-[#d5dbe4] px-2.5 text-xs" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                    Previous
                  </Button>
                  <Button type="button" variant="outline" className="h-7 rounded-lg border-[#d5dbe4] px-2.5 text-xs" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : isLedgerRegisterWorkspace ? (
        <>
          <section className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-[4px] border border-[#bfd3e2] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
            <div className="flex min-h-12 shrink-0 items-stretch border-b border-[#bfd3e2]">
              <div className="flex shrink-0 items-center px-4 py-2">
                {renderWorkspaceTitle()}
              </div>
              <div className="grid min-w-0 flex-1 grid-cols-2 text-center text-[1.05rem] font-semibold uppercase tracking-[0.02em] text-[#97a3b6]">
                <button
                  type="button"
                  className={cn("border-b-2 px-4 py-2 transition", expenseView === "ledger" ? "border-[#2793de] text-[#2b3356]" : "border-transparent hover:text-[#5c6d84]")}
                  onClick={() => setExpenseView("ledger")}
                >
                  Ledger
                </button>
                <button
                  type="button"
                  className={cn("border-b-2 px-4 py-2 transition", expenseView === "category" ? "border-[#2793de] text-[#2b3356]" : "border-transparent hover:text-[#5c6d84]")}
                  onClick={() => setExpenseView("category")}
                >
                  Category
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-[#d9e4ef] bg-white px-4 py-3">
              <span className="mr-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#61708a]">Filter by</span>
              <select value={filters.preset} onChange={(event) => updateBillsPreset(event.target.value as PurchasePreset)} className="h-9 rounded-md border border-[#cbd8e6] bg-[#f8fbff] px-3 text-sm text-[#173152] outline-none focus:border-[#3978b8]">
                {purchasePresetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <div className="flex h-9 items-center gap-2 rounded-md border border-[#cbd8e6] bg-[#f8fbff] px-3 text-sm text-[#173152]">
                <AppDateInput value={filters.from} onChange={(value) => updateBillsDates("from", value)} aria-label="From date" className="w-[132px]" inputClassName="h-8 border-0 bg-transparent px-0 pr-7 focus:ring-0" />
                <span className="text-[#7a8799]">To</span>
                <AppDateInput value={filters.to} onChange={(value) => updateBillsDates("to", value)} aria-label="To date" className="w-[132px]" inputClassName="h-8 border-0 bg-transparent px-0 pr-7 focus:ring-0" />
              </div>
              <select value={filters.supplier} onChange={(event) => updateInstantFilters({ supplier: event.target.value })} className="h-9 min-w-[150px] rounded-md border border-[#cbd8e6] bg-[#f8fbff] px-3 text-sm text-[#173152] outline-none focus:border-[#3978b8]">
                <option value="all">All Payees</option>
                {supplierOptions.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
              </select>
              <select value={filters.paymentMethod} onChange={(event) => updateInstantFilters({ paymentMethod: event.target.value })} className="h-9 min-w-[145px] rounded-md border border-[#cbd8e6] bg-[#f8fbff] px-3 text-sm text-[#173152] outline-none focus:border-[#3978b8]">
                <option value="all">All Payment Types</option>
                {paymentMethodOptions.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
              <select value={filters.firm} onChange={(event) => updateBillsFirm(event.target.value as PurchaseWorkspaceFilters["firm"])} className="h-9 rounded-md border border-[#cbd8e6] bg-[#f8fbff] px-3 text-sm text-[#173152] outline-none focus:border-[#3978b8]">
                <option value="active">Active Firm</option>
                <option value="all">All Firms</option>
              </select>
              <Button type="button" className="ml-auto h-10 rounded-[10px] bg-primary px-5 !text-white hover:bg-[#cf670f]" onClick={handlePrimaryAction}>
                <Plus className="h-4 w-4" />
                {primaryActionLabel}
              </Button>
            </div>

            <div className="grid min-h-0 min-w-0 flex-1 gap-2 overflow-x-hidden overflow-y-auto bg-[#edf4fb] p-2 lg:grid-cols-[clamp(205px,18vw,280px)_minmax(0,1fr)] lg:overflow-hidden">
              <section className="flex min-h-[320px] min-w-0 flex-col overflow-hidden border border-[#bfd3e2] bg-white shadow-[0_6px_14px_rgba(15,23,42,0.08)] lg:min-h-0">
                <div className="flex flex-wrap items-center gap-2 px-3 py-3">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1f2f46]" />
                    <input
                      type="text"
                      autoComplete="off"
                      value={expenseCategorySearch}
                      onChange={(event) => setExpenseCategorySearch(event.target.value)}
                      placeholder={`Search ${expenseView}`}
                      className="h-10 w-full border-0 bg-transparent pl-9 pr-2 text-sm text-[#12284a] outline-none"
                      aria-label={`Search ${isRevenueWorkspace ? "revenue" : "expense"} ${expenseView === "ledger" ? "ledgers" : "categories"}`}
                    />
                  </div>
                  <Button
                    type="button"
                    className="h-10 w-full rounded-[6px] bg-primary px-4 text-sm font-semibold !text-white shadow-[0_8px_16px_rgba(230,120,23,0.16)] hover:bg-[#cf670f] hover:!text-white sm:w-auto [&_svg]:!text-white"
                    onClick={() => openExpenseAccountEditor(expenseView)}
                  >
                    <Plus className="h-5 w-5" />
                    Add {expenseView === "ledger" ? "Ledger" : "Category"}
                  </Button>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_92px_28px] border-t border-b border-[#d9e4ef] px-3 py-3 text-[12px] font-semibold uppercase text-[#62748d]">
                  <div className="flex items-center gap-2">
                    <span>{expenseView === "ledger" ? "Ledger" : "Category"}</span>
                    <ArrowDownUp className="h-4 w-4 text-[#315b8b]" />
                  </div>
                  <div className="text-right">Amount</div>
                  <div />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                  {expenseAccountTreeQuery.isLoading && mode === "api" ? (
                    <div className="px-4 py-10 text-center text-sm text-[#61708a]">Loading {isRevenueWorkspace ? "revenue" : "expense"} accounts...</div>
                  ) : filteredExpenseMasterSummaries.length ? (
                    filteredExpenseMasterSummaries.map((entry) => {
                      const selected = entry.id === activeExpenseAccountId;
                      return (
                        <div
                          key={entry.id}
                          ref={(node) => {
                            if (node) {
                              expenseAccountRowRefs.current.set(entry.id, node);
                            } else {
                              expenseAccountRowRefs.current.delete(entry.id);
                            }
                          }}
                          className={cn(
                            "grid w-full grid-cols-[minmax(0,1fr)_92px_28px] items-center border-b border-[#edf2f7] px-3 py-4 text-left transition",
                            selected ? "bg-[#b9d7ed]" : "bg-white hover:bg-[#f7fbff]",
                          )}
                          onContextMenu={(event) => openExpenseAccountContextMenu(entry, event)}
                        >
                          <button type="button" className="min-w-0 text-left" onClick={() => selectExpenseAccount(entry.id)}>
                            <span className="block truncate text-[1.02rem] text-[#173152]">{entry.name}</span>
                            <span className="mt-0.5 block truncate text-xs text-[#6d7c91]">
                              {entry.kind === "ledger" ? entry.categoryName : getExpenseNatureLabel(entry.nature)}
                            </span>
                          </button>
                          <button type="button" className="truncate text-right text-[1.02rem] text-[#173152]" onClick={() => selectExpenseAccount(entry.id)}>
                            {formatAmount(entry.amount)}
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-[4px] text-[#52657e] transition hover:bg-white/80 hover:text-[#1d66b1]",
                              expenseAccountMenu?.entry.id === entry.id ? "bg-white text-[#1d66b1] shadow-sm" : "",
                            )}
                            onClick={(event) => openExpenseAccountActions(entry, event)}
                            aria-label={`Actions for ${entry.name}`}
                            aria-haspopup="menu"
                            aria-expanded={expenseAccountMenu?.entry.id === entry.id}
                            title="Actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[#61708a]">
                      {expenseView === "ledger" ? <BookOpen className="h-10 w-10 text-[#8da4c0]" /> : <WalletCards className="h-10 w-10 text-[#8da4c0]" />}
                      <div>No {isRevenueWorkspace ? "revenue" : "expense"} {expenseView} found.</div>
                    </div>
                  )}
                </div>

                <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_92px_28px] items-center border-t border-[#d9e4ef] bg-[#f7fafd] px-3 py-3 text-[12px] font-semibold uppercase text-[#62748d]">
                  <span>Total</span>
                  <span className="truncate text-right text-[1.02rem] normal-case text-[#173152]">{formatAmount(expenseListTotal)}</span>
                  <span />
                </div>
              </section>

              <section className="flex min-h-[420px] min-w-0 flex-col border border-[#bfd3e2] bg-white shadow-[0_6px_14px_rgba(15,23,42,0.08)] xl:min-h-0">
                <div className="border-b border-[#bfd3e2] px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                      <div className="text-lg font-semibold uppercase leading-6 text-[#1e4a74] sm:text-[1.35rem] sm:leading-7">
                        {(selectedExpenseSummary?.name || (expenseView === "ledger" ? `${isRevenueWorkspace ? "Revenue" : "Expense"} Ledgers` : `${isRevenueWorkspace ? "Revenue" : "Expense"} Categories`)).toUpperCase()}
                      </div>
                      <div className="mt-0.5 text-sm text-[#52657e]">
                        {selectedExpenseSummary
                          ? selectedExpenseSummary.kind === "ledger"
                            ? `${selectedExpenseSummary.categoryName} · ${getExpenseNatureLabel(selectedExpenseSummary.nature)}`
                            : getExpenseNatureLabel(selectedExpenseSummary.nature)
                          : "Select an account to view transactions"}
                      </div>
                    </div>
                    <div className="flex w-full shrink-0 items-center justify-between gap-4 sm:ml-auto sm:w-auto">
                      <div className="whitespace-nowrap text-right text-sm text-[#1b3352]">
                        <div>
                          Total : <span className="text-[#f15b5b]">{formatAmount(selectedExpenseSummary?.amount ?? 0)} Tk</span>
                        </div>
                        <div className="mt-1">
                          Balance : <span className="text-[#f15b5b]">{formatAmount(selectedExpenseSummary?.balance ?? 0)} Tk</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col border-t border-[#d9e4ef] bg-white">
                  <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <CollapsibleSearch value={expenseItemSearch} onChange={setExpenseItemSearch} label={`Search ${isRevenueWorkspace ? "revenue" : "expenses"}`} size="sm" />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {renderRegisterActions()}
                    </div>
                  </div>

                  <div ref={tableScrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
                    <table className="w-full table-fixed border-separate border-spacing-0 text-[clamp(10px,0.75vw,14px)] [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td:last-child]:overflow-visible" aria-label={`${config.label} ${expenseView} transactions grid`}>
                      <thead className={cn(stickyHeader ? "sticky top-0 z-10" : "")}>
                        <tr className="bg-[#fbfcfe] text-[#586b84]">
                          <th className="w-10 border-b border-r border-[#dce5f0] px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              aria-label={`Select all ${isRevenueWorkspace ? "revenue" : "expense"} transactions`}
                              checked={expensePagedRows.length > 0 && expensePagedRows.every((row) => selectedRowIds.includes(row.id))}
                              onChange={(event) => toggleRowsSelection(expensePagedRows, event.target.checked)}
                            />
                          </th>
                          {[
                            { id: "date", label: "Date", width: "82px", align: "left" as const },
                            { id: "documentNumber", label: isRevenueWorkspace ? "Rev No." : "Exp No.", width: "94px", align: "left" as const },
                            { id: "partyName", label: "Party", width: "118px", align: "left" as const },
                            { id: "paymentMethod", label: "Payment Type", width: "118px", align: "left" as const },
                            { id: "amount", label: "Amount", width: "98px", align: "right" as const },
                            { id: "balance", label: "Balance", width: "92px", align: "right" as const },
                            { id: "status", label: "Status", width: "76px", align: "center" as const },
                            { id: "actions", label: "", width: "52px", align: "center" as const },
                          ].map((column) => (
                            <th
                              key={column.id}
                              className={cn(
                                "relative border-b border-r border-[#dce5f0] px-2 py-2 text-left text-[11px] font-semibold uppercase",
                                column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "",
                              )}
                              style={{ width: column.width }}
                            >
                              {column.id === "actions" ? renderBulkActionsButton() : (
                                <div className="flex min-w-0 items-center justify-between gap-1.5">
                                  <button type="button" className="min-w-0 truncate transition hover:text-[#1455a0]" onClick={() => toggleSort(column.id as FilterableColumnId)}>
                                    {column.label}
                                  </button>
                                  <button
                                    type="button"
                                    className={cn(
                                      "shrink-0 rounded-md p-0.5 text-[#7a8799] transition hover:bg-[#edf4ff] hover:text-[#1d66b1]",
                                      columnFilters[column.id as FilterableColumnId] ? "bg-[#edf4ff] text-[#1d66b1]" : "",
                                    )}
                                    onClick={(event) => openColumnFilter(column.id as FilterableColumnId, event)}
                                    aria-label={`Filter ${column.label}`}
                                  >
                                    <Filter className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {expensePagedRows.length ? (
                          expensePagedRows.map((row) => {
                            const rowActions = getRowActions(row);
                            const rowMenuOpen = openRowMenuId === row.id;
                            const rowSelected = selectedRowIds.includes(row.id);
                            return (
                              <tr
                                key={row.id}
                                className={cn("cursor-pointer transition hover:bg-[#f9fbff]", rowSelected ? "bg-[#eef6ff]" : "bg-white")}
                                onClick={() => setDetailRow(row)}
                              >
                                <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                                  <input type="checkbox" aria-label={`Select ${row.documentNumber}`} checked={rowSelected} onChange={(event) => toggleRowSelection(row.id, event.target.checked)} />
                                </td>
                                <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-[#173152]">{formatDate(row.documentDate)}</td>
                                <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-[#173152]">{row.documentNumber}</td>
                                <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-[#173152]">{row.partyName}</td>
                                <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-[#173152]">{row.paymentMethod}</td>
                                <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-right text-[#173152]">{formatCurrency(row.amount)}</td>
                                <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-right text-[#173152]">{formatCurrency(row.balance)}</td>
                                <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center">
                                  <span className={cn("font-medium", row.statusLabel === "Paid" ? "text-[#00a66a]" : row.statusLabel === "Unpaid" ? "text-[#226dff]" : "text-[#b56c12]")}>
                                    {row.statusLabel}
                                  </span>
                                </td>
                                <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                                  <div className="relative flex items-center justify-center">
                                    <button
                                      type="button"
                                      data-row-menu-trigger
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#61708a] transition hover:bg-[#edf4ff]"
                                      onClick={() => setOpenRowMenuId((current) => (current === row.id ? null : row.id))}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </button>
                                    {rowMenuOpen ? (
                                      <div ref={rowMenuRef} className="absolute right-0 top-9 z-20 min-w-[210px] rounded-2xl border border-[#d7e1ee] bg-white p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                                        {rowActions.map((action) => (
                                          <button
                                            key={action.label}
                                            type="button"
                                            className={cn(
                                              "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[#f7faff]",
                                              action.tone === "danger" ? "text-[#c63c3c]" : "text-[#24364f]",
                                            )}
                                            onClick={action.onClick}
                                          >
                                            <action.icon className="h-4 w-4" />
                                            <span>{action.label}</span>
                                          </button>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={9} className="px-6 py-14 text-center">
                              <div className="mx-auto flex max-w-[430px] flex-col items-center">
                                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#eef6ff] text-[#3978b8] ring-1 ring-[#d9e8f7]">
                                  <div className="absolute inset-2 rounded-full border border-dashed border-[#a9c8e7]" />
                                  <ReceiptText className="relative h-9 w-9" strokeWidth={1.7} />
                                </div>
                                <h3 className="mt-5 text-base font-semibold text-[#24364f]">No {isRevenueWorkspace ? "revenue" : "expenses"} recorded yet</h3>
                                <p className="mt-1.5 max-w-[390px] text-sm leading-6 text-[#6b7c93]">
                                  {selectedExpenseSummary
                                    ? `There are no ${isRevenueWorkspace ? "revenue" : "expense"} transactions for ${selectedExpenseSummary.name}. Add the first ${isRevenueWorkspace ? "revenue entry" : "expense"} to start its history.`
                                    : `Select a ${isRevenueWorkspace ? "revenue" : "expense"} ${expenseView} to view its transactions.`}
                                </p>
                                {selectedExpenseSummary ? (
                                  <Button type="button" className="mt-5 h-9 rounded-[6px] px-4 text-sm" onClick={handlePrimaryAction}>
                                    <Plus className="h-4 w-4" />
                                    Add {isRevenueWorkspace ? "Revenue" : "Expense"}
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex h-10 shrink-0 items-center justify-between border-t border-[#dfe7f1] px-3 text-xs text-[#61708a]">
                    <span>{selectedExpenseRows.length ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, selectedExpenseRows.length)} of ${selectedExpenseRows.length}` : "0 entries"}</span>
                    <div className="flex items-center gap-2">
                      <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-7 rounded-lg border border-[#d5dbe4] bg-white px-2 text-xs text-[#173152]">
                        {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / page</option>)}
                      </select>
                      <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</Button>
                      <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => setPage((current) => Math.min(expenseTotalPages, current + 1))} disabled={page >= expenseTotalPages}>Next</Button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </>
      ) : isOrderStyleWorkspace ? (
        <>
          <section className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-[4px] border border-[#bfd3e2] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
            <div className="flex min-h-12 shrink-0 items-center border-b border-[#bfd3e2] px-4 py-2">
              {renderWorkspaceTitle()}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-[#d9e4ef] bg-white px-4 py-3">
              <span className="mr-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#61708a]">Filter by</span>
              <select value={filters.preset} onChange={(event) => updateBillsPreset(event.target.value as PurchasePreset)} className="h-9 rounded-md border border-[#cbd8e6] bg-[#f8fbff] px-3 text-sm text-[#173152] outline-none focus:border-[#3978b8]">
                {purchasePresetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <div className="flex h-9 items-center gap-2 rounded-md border border-[#cbd8e6] bg-[#f8fbff] px-3 text-sm text-[#173152]">
                <AppDateInput value={filters.from} onChange={(value) => updateBillsDates("from", value)} aria-label="From date" className="w-[132px]" inputClassName="h-8 border-0 bg-transparent px-0 pr-7 focus:ring-0" />
                <span className="text-[#7a8799]">To</span>
                <AppDateInput value={filters.to} onChange={(value) => updateBillsDates("to", value)} aria-label="To date" className="w-[132px]" inputClassName="h-8 border-0 bg-transparent px-0 pr-7 focus:ring-0" />
              </div>
              <select value={filters.supplier} onChange={(event) => updateInstantFilters({ supplier: event.target.value })} className="h-9 min-w-[160px] rounded-md border border-[#cbd8e6] bg-[#f8fbff] px-3 text-sm text-[#173152] outline-none focus:border-[#3978b8]">
                <option value="all">All Suppliers</option>
                {supplierOptions.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
              </select>
              <select value={filters.status} onChange={(event) => updateInstantFilters({ status: event.target.value })} className="h-9 min-w-[135px] rounded-md border border-[#cbd8e6] bg-[#f8fbff] px-3 text-sm text-[#173152] outline-none focus:border-[#3978b8]">
                <option value="all">All Statuses</option>
                {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select value={filters.firm} onChange={(event) => updateBillsFirm(event.target.value as PurchaseWorkspaceFilters["firm"])} className="h-9 rounded-md border border-[#cbd8e6] bg-[#f8fbff] px-3 text-sm text-[#173152] outline-none focus:border-[#3978b8]">
                <option value="active">Active Firm</option>
                <option value="all">All Firms</option>
              </select>
              <Button type="button" className="ml-auto h-10 rounded-[10px] bg-primary px-5 !text-white hover:bg-[#cf670f]" onClick={handlePrimaryAction}>
                <Plus className="h-4 w-4" />
                {primaryActionLabel}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-b border-[#bfd3e2] bg-white px-4 py-3">
              <div className="min-w-[180px] rounded-[10px] bg-[#16866f] px-4 py-3 text-white shadow-[0_7px_16px_rgba(22,134,111,0.2)]">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">
                  {section === "receipt-notes" ? "Billed Value" : "Received Value"}
                </div>
                <div className="mt-1 text-[1.05rem] font-semibold">{formatCurrency(orderLikeKpiTotals.processed)}</div>
              </div>
              <div className="text-[1.6rem] font-medium text-[#7b8799]">+</div>
              <div className="min-w-[180px] rounded-[10px] bg-[#c9682c] px-4 py-3 text-white shadow-[0_7px_16px_rgba(201,104,44,0.2)]">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">
                  {section === "receipt-notes" ? "Pending to Bill" : "Pending Receipt"}
                </div>
                <div className="mt-1 text-[1.05rem] font-semibold">{formatCurrency(orderLikeKpiTotals.pending)}</div>
              </div>
              <div className="text-[1.6rem] font-medium text-[#7b8799]">=</div>
              <div className="min-w-[180px] rounded-[10px] bg-[#315b8f] px-4 py-3 text-white shadow-[0_7px_16px_rgba(49,91,143,0.2)]">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-white/80">
                  {section === "receipt-notes" ? "Total Receipt Value" : "Total Order Value"}
                </div>
                <div className="mt-1 text-[1.05rem] font-semibold">{formatCurrency(orderLikeKpiTotals.total)}</div>
              </div>
            </div>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#edf4fb] p-2">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col border border-[#bfd3e2] bg-white shadow-[0_6px_14px_rgba(15,23,42,0.08)]">
                <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-[#e4ebf4] px-3 py-2">
                  <div className="flex items-center gap-2 text-[1.02rem] font-semibold uppercase text-[#1a2f4d]"><ReceiptText className="h-[18px] w-[18px] text-primary" aria-hidden="true" />Transactions</div>
                  <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
                    <CollapsibleSearch value={filters.searchQuery} onChange={syncSearch} label="Search transactions" />
                    {renderRegisterActions()}
                  </div>
                </div>

                <input
                  ref={bulkImportInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    if (file) {
                      void handleBulkImportFile(file);
                    }
                  }}
                />

                <div ref={tableScrollRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
                  <table className="w-full shrink-0 table-fixed border-separate border-spacing-0 text-[clamp(10px,0.75vw,14px)] [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td:last-child]:overflow-visible" aria-label={section === "receipt-notes" ? "Receipt note grid" : "Purchase order grid"}>
                    <thead className={cn(stickyHeader ? "sticky top-0 z-10" : "")}>
                      <tr className="bg-[#fbfcfe] text-[#586b84]">
                        <th className="w-10 border-b border-r border-[#dce5f0] px-2 py-2 text-center" style={{ width: "3%" }}>
                          <input
                            type="checkbox"
                            aria-label="Select all visible rows"
                            checked={pagedRows.length > 0 && pagedRows.every((row) => selectedRowIds.includes(row.id))}
                            onChange={(event) => toggleVisibleRows(event.target.checked)}
                          />
                        </th>
                        {[
                          { id: "party", label: "Supplier", width: section === "orders" ? "10%" : "8%" },
                          { id: "no", label: section === "receipt-notes" ? "Receipt Note No." : "PO No.", width: section === "orders" ? "14%" : "12%" },
                          { id: "date", label: section === "receipt-notes" ? "Receipt Date" : "Order Date", width: section === "orders" ? "8%" : "6%" },
                          ...(section === "receipt-notes" ? [{ id: "due", label: "Bill Due", width: "7%" }] : []),
                          { id: "amount", label: section === "receipt-notes" ? "Receipt Value" : "Total Amount", width: section === "orders" ? "10%" : "9%", align: "right" as const },
                          { id: "balance", label: section === "receipt-notes" ? "Pending Bill" : "Payable Due", width: section === "orders" ? "11%" : "10%", align: "right" as const },
                          { id: "receipt", label: section === "receipt-notes" ? "PO Receipt" : "Receipt", width: section === "orders" ? "13%" : "12%", align: "center" as const },
                          ...(section === "receipt-notes" ? [{ id: "type", label: "Workflow", width: "6%" }] : []),
                          { id: "payment", label: "Payment", width: section === "orders" ? "8%" : "6%", align: "center" as const },
                          { id: "status", label: section === "orders" ? "Receipt Status" : "Billing Status", width: section === "orders" ? "10%" : "8%", align: "center" as const },
                          { id: "action", label: "Action", width: "10%" },
                          { id: "menu", label: "", width: "3%", align: "center" as const },
                        ].map((column) => (
                          <th
                            key={column.id}
                            className={cn(
                              "relative border-b border-r border-[#dce5f0] px-2 py-2 text-left text-[11px] font-semibold uppercase",
                              column.align === "center" ? "text-center" : "",
                            )}
                            style={{ width: column.width }}
                          >
                            {column.id === "menu" ? (
                              <div className="relative flex items-center justify-end" ref={bulkActionsMenuRef}>
                                <button
                                  type="button"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#61708a] transition hover:bg-[#edf4ff]"
                                  onClick={() => setBulkActionsMenuOpen((current) => !current)}
                                  aria-label="Bulk actions"
                                  title="Bulk actions"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                                {bulkActionsMenuOpen ? (
                                  <div className="absolute right-0 top-8 z-20 min-w-[190px] rounded-2xl border border-[#d7e1ee] bg-white p-2 text-left shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                                    <button
                                      type="button"
                                      disabled={!selectedRowIds.length}
                                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm normal-case text-[#c63c3c] transition hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                      onClick={() => {
                                        setBulkActionsMenuOpen(false);
                                        setBulkDeleteDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      <span>Delete All</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm normal-case text-[#24364f] transition hover:bg-[#f7faff]"
                                      onClick={() => {
                                        setBulkActionsMenuOpen(false);
                                        exportVisibleRows("excel");
                                      }}
                                    >
                                      <ExcelIcon className="h-4 w-4" />
                                      <span>Export All</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={bulkImporting}
                                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm normal-case text-[#24364f] transition hover:bg-[#f7faff] disabled:opacity-50"
                                      onClick={() => {
                                        setBulkActionsMenuOpen(false);
                                        bulkImportInputRef.current?.click();
                                      }}
                                    >
                                      <UploadCloud className="h-4 w-4" />
                                      <span>{bulkImporting ? "Importing..." : "Import All"}</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs normal-case text-[#0f6cf6] transition hover:bg-[#f7faff]"
                                      onClick={() => {
                                        setBulkActionsMenuOpen(false);
                                        downloadImportSampleCsv();
                                      }}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                      <span>Download import sample</span>
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="min-w-0 truncate whitespace-nowrap">{column.label}</span>
                                {column.id !== "action" ? (
                                  <button
                                    type="button"
                                    className={cn(
                                      "shrink-0 rounded-md p-0.5 text-[#7a8799] transition hover:bg-[#edf4ff] hover:text-[#1d66b1]",
                                      column.id === "party" ? (columnFilters.partyName ? "bg-[#edf4ff] text-[#1d66b1]" : "") : "",
                                    )}
                                    onClick={
                                      column.id === "party"
                                        ? (event) => openColumnFilter("partyName", event)
                                        : column.id === "no"
                                          ? (event) => openColumnFilter("documentNumber", event)
                                          : column.id === "date"
                                            ? (event) => openColumnFilter("date", event)
                                            : column.id === "due"
                                              ? (event) => openColumnFilter("expectedDelivery", event)
                                              : column.id === "amount"
                                                ? (event) => openColumnFilter("amount", event)
                                                : column.id === "balance"
                                                  ? (event) => openColumnFilter(section === "orders" ? "financialDue" : "balance", event)
                                                  : column.id === "receipt"
                                                    ? (event) => openColumnFilter("receiptProgress", event)
                                                    : column.id === "type"
                                                      ? (event) => openColumnFilter("type", event)
                                                      : column.id === "payment"
                                                        ? (event) => openColumnFilter("paymentMethod", event)
                                                        : (event) => openColumnFilter("status", event)
                                    }
                                    aria-label={`Filter ${column.label}`}
                                  >
                                    <Filter className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.map((row) => {
                        const rowActions = getRowActions(row);
                        const rowMenuOpen = openRowMenuId === row.id;
                        const rowSelected = selectedRowIds.includes(row.id);
                        // The other four tables in this file (bills, debit notes, payment-out,
                        // expenses) default rows to white with a light hover tint; this one had
                        // been left permanently tinted blue, making every row look "selected" or
                        // hovered all the time. Matched to the same pattern for consistency.
                        return (
                          <tr
                            key={row.id}
                            className={cn("cursor-pointer transition hover:bg-[#f9fbff]", rowSelected ? "bg-[#eef6ff]" : "bg-white")}
                            onClick={() => setDetailRow(row)}
                          >
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.documentNumber}`}
                                checked={rowSelected}
                                onChange={(event) => toggleRowSelection(row.id, event.target.checked)}
                              />
                            </td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 font-medium text-[#173152]">{row.partyName}</td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 leading-4 text-[#173152]">
                              <div className="truncate whitespace-nowrap font-medium">{row.documentNumber}</div>
                              {section === "receipt-notes" && row.sourceReference ? (
                                <div className="truncate whitespace-nowrap text-[10px] font-normal text-[#8994a6]">Ref: {row.sourceReference}</div>
                              ) : null}
                            </td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-[#173152]">{formatDate(row.documentDate)}</td>
                            {section === "receipt-notes" ? (
                              <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-[#173152]">{formatDate(row.expectedDelivery)}</td>
                            ) : null}
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-right text-[#173152]">{formatCurrency(row.amount)}</td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-right leading-4 text-[#173152]">
                              {formatCurrency(section === "receipt-notes" ? row.balance : row.financialDue)}
                              {section !== "receipt-notes" && row.advancePaidAmount > 0 ? (
                                <div className="text-[10px] font-normal text-[#13835b]">
                                  Advance: {formatCurrency(row.advancePaidAmount)}
                                </div>
                              ) : null}
                            </td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center leading-4 text-[#173152]">
                              {row.orderedQty > 0 ? (
                                section === "receipt-notes" ? (
                                  <>
                                    <div className="font-medium text-[#173152]">
                                      {formatNumber(row.cumulativeReceivedQty)}/{formatNumber(row.orderedQty)}
                                    </div>
                                    <div className="text-[10px] font-normal text-[#7a8aa6]">
                                      {formatNumber(row.receivedQty)} in this receipt
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="font-medium text-[#173152]">
                                      {formatNumber(row.receivedQty)}/{formatNumber(row.orderedQty)}
                                    </div>
                                    <div className="text-[10px] font-normal text-[#7a8aa6]">
                                      {formatNumber(Math.max(0, row.orderedQty - row.receivedQty))} pending
                                    </div>
                                  </>
                                )
                              ) : (
                                <span className="text-[#9aa6b8]">—</span>
                              )}
                            </td>
                            {section === "receipt-notes" ? (
                              <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-[#173152]">{row.type}</td>
                            ) : null}
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em]",
                                  row.paymentMethod.includes("+")
                                    ? "bg-[#f3e8ff] text-[#6b21a8] ring-1 ring-inset ring-[#d8b4fe]"
                                    : row.paymentMethod.toLowerCase() === "cash"
                                    ? "bg-[#dcfce7] text-[#14532d] ring-1 ring-inset ring-[#86efac]"
                                    : ["bank", "bank transfer", "mfs"].includes(row.paymentMethod.toLowerCase())
                                      ? "bg-[#dbeafe] text-[#1e3a8a] ring-1 ring-inset ring-[#93c5fd]"
                                      : "bg-[#fef3c7] text-[#7c2d12] ring-1 ring-inset ring-[#fcd34d]",
                                )}
                              >
                                {row.paymentMethod}
                              </span>
                            </td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center text-xs font-medium text-[#f28a1a]">{row.statusLabel}</td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                              {/* An order becomes a receipt note; a receipt note becomes a bill.
                                  Once nothing is left to convert the action is closed off, so a
                                  second document can't be raised for the same goods. */}
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 max-w-full rounded-[2px] border-[#d0d8e5] px-3 text-[#7b73da]"
                                disabled={isFullyConverted(row) || row.statusLabel === "Cancelled"}
                                title={
                                  row.statusLabel === "Cancelled"
                                    ? "Cancelled documents cannot be converted"
                                    : isFullyConverted(row)
                                      ? section === "receipt-notes"
                                        ? "Already billed in full"
                                        : "All goods already received"
                                      : undefined
                                }
                                onClick={() => (section === "receipt-notes" ? convertOrderToPurchase(row) : convertOrderToReceiptNote(row))}
                              >
                                <span className="truncate">{section === "receipt-notes" ? "Convert to Purchase Bill" : "Convert to Receipt Note"}</span>
                              </Button>
                            </td>
                            <td className="border-b border-r border-[#edf2f7] px-3 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                              <div className="relative flex items-center justify-end">
                                <button
                                  type="button"
                                  data-row-menu-trigger
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#61708a] transition hover:bg-[#edf4ff]"
                                  onClick={() => setOpenRowMenuId((current) => (current === row.id ? null : row.id))}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                                {rowMenuOpen ? (
                                  <div ref={rowMenuRef} className="absolute right-0 top-9 z-20 min-w-[210px] rounded-2xl border border-[#d7e1ee] bg-white p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                                    {rowActions.map((action) => (
                                      <button
                                        key={action.label}
                                        type="button"
                                        className={cn(
                                          "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[#f7faff]",
                                          action.tone === "danger" ? "text-[#c63c3c]" : "text-[#24364f]",
                                        )}
                                        onClick={action.onClick}
                                      >
                                        <action.icon className="h-4 w-4" />
                                        <span>{action.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {pagedRows.length === 0 ? (
                    <div className="flex min-h-[390px] flex-1 p-4 [&>div]:w-full">
                      <EmptyTransactionState
                        icon={config.icon}
                        title={config.emptyStateTitle}
                        description={config.emptyStateDescription}
                        actionLabel={primaryActionLabel}
                        onAction={handlePrimaryAction}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="relative flex h-10 shrink-0 items-center border-t border-[#dfe7f1] px-3 text-xs text-[#61708a]">
                  <span>{rows.length ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, rows.length)} of ${rows.length}` : "0 entries"}</span>
                  <div
                    className="absolute flex justify-end pr-2"
                    style={{
                      left: section === "orders" ? "35%" : "36%",
                      width: section === "orders" ? "10%" : "9%",
                    }}
                  >
                    <div className="whitespace-nowrap rounded-md border border-[#c9d8ea] bg-[#f4f8fd] px-3 py-1 text-right text-sm font-semibold text-[#173152]">
                      Total Amount: <span className="text-[#0f6cf6]">{formatCurrency(orderLikeKpiTotals.total)}</span>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-7 rounded-lg border border-[#d5dbe4] bg-white px-2 text-xs text-[#173152]">
                      {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / page</option>)}
                    </select>
                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</Button>
                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>Next</Button>
                  </div>
                </div>
              </div>
            </section>
          </section>
        </>
      ) : isDebitNotesWorkspace ? (
        <>
          <section className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-[4px] border border-[#cfd9e5] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex min-h-10 shrink-0 items-center border-b border-[#d9e3ef] px-4 py-1.5">
              {renderWorkspaceTitle()}
            </div>
            <div className="relative shrink-0 border-b border-[#d9e3ef] px-3 py-2">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex w-full flex-wrap items-center gap-2">
                  <label className="relative">
                    <select
                      value={filters.preset}
                      onChange={(event) => updateBillsPreset(event.target.value as PurchasePreset)}
                      className="h-9 appearance-none rounded-[4px] border border-[#d5dbe4] bg-white pl-3 pr-8 text-[13px] font-semibold text-[#173152] outline-none"
                    >
                      {purchasePresetOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54657f]" />
                  </label>

                  {renderFilterDateRange("rounded-[4px]")}

                  <label className="relative">
                    <select
                      value={filters.firm}
                      onChange={(event) => updateBillsFirm(event.target.value as PurchaseWorkspaceFilters["firm"])}
                      className="h-9 min-w-[140px] appearance-none rounded-[4px] border border-[#d5dbe4] bg-white pl-3 pr-8 text-[13px] font-medium text-[#173152] outline-none"
                    >
                      <option value="all">ALL FIRMS</option>
                      <option value="active">ACTIVE FIRM</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54657f]" />
                  </label>

                  <label className="relative">
                    <select className="h-9 min-w-[140px] appearance-none rounded-[4px] border border-[#d5dbe4] bg-white pl-3 pr-8 text-[13px] text-[#173152] outline-none">
                      <option value="debit-note">Purchase Return</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54657f]" />
                  </label>

                  <label className="relative">
                    <select
                      value={filters.paymentMethod}
                      onChange={(event) => {
                        const nextFilters = {
                          ...filters,
                          paymentMethod: event.target.value,
                        };
                        setDraftFilters(nextFilters);
                        setFilters(nextFilters);
                      }}
                      className="h-9 min-w-[140px] appearance-none rounded-[4px] border border-[#d5dbe4] bg-white pl-3 pr-8 text-[13px] text-[#173152] outline-none"
                    >
                      <option value="all">All Payment</option>
                      {paymentMethodOptions.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54657f]" />
                  </label>
                  <Button type="button" className="ml-auto h-10 rounded-[10px] bg-primary px-5 !text-white hover:bg-[#cf670f]" onClick={handlePrimaryAction}>
                    <Plus className="h-4 w-4" /> {primaryActionLabel}
                  </Button>
                </div>

              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <div className="min-w-[140px] rounded-[8px] bg-[#16866f] px-3 py-1.5 text-white shadow-[0_7px_16px_rgba(22,134,111,0.2)]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80">Applied Amount</div>
                  <div className="mt-0.5 text-[0.9rem] font-semibold text-white">{formatCurrency(toolbarTotals.paid)}</div>
                </div>
                <div className="text-[1.2rem] font-medium text-[#7b8799]">+</div>
                <div className="min-w-[140px] rounded-[8px] bg-[#c9682c] px-3 py-1.5 text-white shadow-[0_7px_16px_rgba(201,104,44,0.2)]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80">Unapplied Amount</div>
                  <div className="mt-0.5 text-[0.9rem] font-semibold text-white">{formatCurrency(toolbarTotals.balance)}</div>
                </div>
                <div className="text-[1.2rem] font-medium text-[#7b8799]">=</div>
                <div className="min-w-[140px] rounded-[8px] bg-[#315b8f] px-3 py-1.5 text-white shadow-[0_7px_16px_rgba(49,91,143,0.2)]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80">Total Purchase Returns</div>
                  <div className="mt-0.5 text-[0.9rem] font-semibold text-white">{formatCurrency(toolbarTotals.amount)}</div>
                </div>
              </div>
            </div>

              <div className="flex min-h-0 flex-1 flex-col bg-white">
              <div className="flex min-h-8 flex-wrap items-center justify-end gap-2 border-b border-[#dfe7f1] px-3 py-1.5">
                <CollapsibleSearch value={filters.searchQuery} onChange={syncSearch} label="Search purchase returns" />
                {renderRegisterActions()}
              </div>

              <div ref={tableScrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
                <table className="w-full table-fixed border-separate border-spacing-0 text-[clamp(10px,0.75vw,14px)] [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td:last-child]:overflow-visible" aria-label="Purchase return grid">
                  <thead className={cn(stickyHeader ? "sticky top-0 z-10" : "")}>
                    <tr className="bg-white text-[#586b84]">
                      {[
                        { id: "serial", label: "#", width: "36px", align: "center" as const },
                        { id: "date", label: "Date", width: "86px", columnId: "date" as const },
                        { id: "documentNumber", label: "Ref No.", width: "150px", columnId: "documentNumber" as const },
                        { id: "partyName", label: "Party Name", width: "140px", columnId: "partyName" as const },
                        { id: "category", label: "Category Name", width: "120px", columnId: "category" as const },
                        { id: "type", label: "Type", width: "105px", columnId: "type" as const },
                        { id: "amount", label: "Total", width: "92px", align: "right" as const, columnId: "amount" as const },
                        { id: "paidAmount", label: "Applied Amount", width: "112px", align: "right" as const, columnId: "paidAmount" as const },
                        { id: "balance", label: "Unapplied Amount", width: "92px", align: "right" as const, columnId: "balance" as const },
                        { id: "status", label: "Status", width: "78px", align: "center" as const, columnId: "status" as const },
                        { id: "actions", label: "", width: "52px", align: "center" as const },
                      ].map((column) => (
                        <th
                          key={column.id}
                          className={cn(
                            "relative whitespace-nowrap border-b border-r border-[#dce5f0] px-2 py-1.5 text-left text-[11px] font-semibold uppercase",
                            column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "",
                          )}
                          style={{ width: column.width }}
                        >
                          {column.id === "serial" ? (
                            <input type="checkbox" aria-label="Select all purchase returns" checked={rows.length > 0 && rows.every((row) => selectedRowIds.includes(row.id))} onChange={(event) => toggleRowsSelection(rows, event.target.checked)} />
                          ) : column.id === "actions" ? (
                            renderBulkActionsButton()
                          ) : (
                            <div className="flex min-w-0 items-center justify-between gap-1.5">
                              <button type="button" className="min-w-0 truncate transition hover:text-[#1455a0]" onClick={() => toggleSort(column.columnId!)}>
                                {column.label}
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "shrink-0 rounded-md p-0.5 text-[#7a8799] transition hover:bg-[#edf4ff] hover:text-[#1d66b1]",
                                  columnFilters[column.columnId!] ? "bg-[#edf4ff] text-[#1d66b1]" : "",
                                )}
                                onClick={(event) => openColumnFilter(column.columnId!, event)}
                                aria-label={`Filter ${column.label}`}
                              >
                                <Filter className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? (
                      rows.map((row) => {
                        const rowActions = getRowActions(row);
                        const rowMenuOpen = openRowMenuId === row.id;
                        return (
                          <tr key={row.id} className="cursor-pointer transition hover:bg-[#f9fbff]" onClick={() => setDetailRow(row)}>
                            <td className="whitespace-nowrap border-b border-r border-[#edf2f7] px-2 py-1.5 text-center" onClick={(event) => event.stopPropagation()}>
                              <input type="checkbox" aria-label={`Select ${row.documentNumber}`} checked={selectedRowIds.includes(row.id)} onChange={(event) => toggleRowSelection(row.id, event.target.checked)} />
                            </td>
                            <td className="whitespace-nowrap border-b border-r border-[#edf2f7] px-2 py-1.5 text-[#173152]">{formatDate(row.documentDate)}</td>
                            <td className="whitespace-nowrap border-b border-r border-[#edf2f7] px-2 py-1.5 text-[#173152]">{row.documentNumber}</td>
                            <td className="whitespace-nowrap border-b border-r border-[#edf2f7] px-2 py-1.5 text-[#173152]">{row.partyName}</td>
                            <td className="whitespace-nowrap border-b border-r border-[#edf2f7] px-2 py-1.5 text-[#173152]">{row.category}</td>
                            <td className="whitespace-nowrap border-b border-r border-[#edf2f7] px-2 py-1.5 text-[#173152]">{row.type}</td>
                            <td className="whitespace-nowrap border-b border-r border-[#edf2f7] px-2 py-1.5 text-right text-[#173152]">{formatCurrency(row.amount)}</td>
                            <td className="whitespace-nowrap border-b border-r border-[#edf2f7] px-2 py-1.5 text-right text-[#173152]">{formatCurrency(row.paidAmount)}</td>
                            <td className="whitespace-nowrap border-b border-r border-[#edf2f7] px-2 py-1.5 text-right text-[#173152]">{formatCurrency(row.balance)}</td>
                            <td className="whitespace-nowrap border-b border-r border-[#edf2f7] px-2 py-1.5 text-center text-xs">
                              <span
                                className={cn(
                                  "font-medium",
                                  row.statusLabel === "Applied"
                                    ? "text-[#00a66a]"
                                    : row.statusLabel === "Draft"
                                      ? "text-[#b56c12]"
                                      : row.statusLabel === "Partially Applied"
                                        ? "text-[#226dff]"
                                        : "text-[#d13f3f]",
                                )}
                              >
                                {row.statusLabel}
                              </span>
                            </td>
                            <td className="border-b border-r border-[#edf2f7] px-2 py-1.5 text-center" onClick={(event) => event.stopPropagation()}>
                              <div className="relative flex items-center justify-center">
                                <button
                                  type="button"
                                  data-row-menu-trigger
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#61708a] transition hover:bg-[#edf4ff]"
                                  onClick={() => setOpenRowMenuId((current) => (current === row.id ? null : row.id))}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                                {rowMenuOpen ? (
                                  <div ref={rowMenuRef} className="absolute right-0 top-9 z-20 min-w-[210px] rounded-2xl border border-[#d7e1ee] bg-white p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                                    {rowActions.map((action) => (
                                      <button
                                        key={action.label}
                                        type="button"
                                        className={cn(
                                          "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[#f7faff]",
                                          action.tone === "danger" ? "text-[#c63c3c]" : "text-[#24364f]",
                                        )}
                                        onClick={action.onClick}
                                      >
                                        <action.icon className="h-4 w-4" />
                                        <span>{action.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={11} className="px-6 py-10">
                          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
                            <div className="rounded-full border border-[#e4eaf3] bg-white p-6 text-[#d5dce8]">
                              <ReceiptText className="h-14 w-14" />
                            </div>
                            <p className="mt-6 text-[15px] text-[#6c7690]">No data is available for Purchase Return.</p>
                            <p className="text-[15px] text-[#6c7690]">Please try again after making relevant changes.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex h-9 shrink-0 items-center justify-between border-t border-[#dfe7f1] px-3 text-xs text-[#1f2f46]">
                <div className="flex items-center gap-4">
                  Total Amount: <span className="text-[#00a7a7]">{formatCurrency(toolbarTotals.amount)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="mr-2">Total: <span className="font-semibold text-[#2f4f7a]">{formatCurrency(toolbarTotals.amount)}</span></span>
                  <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-7 rounded-lg border border-[#d5dbe4] bg-white px-2 text-xs text-[#173152]">
                    {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / page</option>)}
                  </select>
                  <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</Button>
                  <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>Next</Button>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          <PurchaseWorkspaceHeader
            config={config}
            activeSection={section}
            workflowMenuOpen={workflowMenuOpen}
            setWorkflowMenuOpen={setWorkflowMenuOpen}
            searchQuery={filters.searchQuery}
            onSearchQueryChange={syncSearch}
            onNavigateSection={handleNavigateSection}
            onPrimaryAction={handlePrimaryAction}
            onAddSale={() => router.push(buildVoucherRoute(mode, "sales"))}
            onOpenQuickCreate={() => setCreateMenuOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenMore={() => setMoreOpen(true)}
            footerContent={
              section === "revenue" ? (
                <div className="flex w-full flex-wrap items-center gap-2.5 text-[#1c2f4e]">
                  <div className="text-[13px] font-semibold">Filter by</div>
                  <label className="relative">
                    <select
                      value={filters.preset}
                      onChange={(event) => updateBillsPreset(event.target.value as PurchasePreset)}
                      className="h-8 appearance-none rounded-full border border-[#d7e5f7] bg-[#e8f2ff] pl-3.5 pr-8 text-[13px] text-[#1f3657] outline-none"
                    >
                      {purchasePresetOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#54657f]" />
                  </label>
                  <div className="flex flex-wrap items-center gap-2 rounded-full border border-[#d7e5f7] bg-[#e8f2ff] px-3 py-1 text-[13px] text-[#1f3657]">
                    <AppDateInput value={filters.from} onChange={(value) => updateBillsDates("from", value)} aria-label="From date" className="w-[132px]" inputClassName="h-7 border-0 bg-transparent px-0 pr-7 focus:ring-0" />
                    <span>To</span>
                    <AppDateInput value={filters.to} onChange={(value) => updateBillsDates("to", value)} aria-label="To date" className="w-[132px]" inputClassName="h-7 border-0 bg-transparent px-0 pr-7 focus:ring-0" />
                  </div>
                  <label className="relative">
                    <select
                      value={filters.firm}
                      onChange={(event) => updateBillsFirm(event.target.value as PurchaseWorkspaceFilters["firm"])}
                      className="h-8 appearance-none rounded-full border border-[#d7e5f7] bg-[#e8f2ff] pl-3.5 pr-8 text-[13px] text-[#1f3657] outline-none"
                    >
                      <option value="active">Active Firm</option>
                      <option value="all">All Firms</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#54657f]" />
                  </label>
                  <label className="relative">
                    <select
                      value={filters.createdBy}
                      onChange={(event) => {
                        const nextFilters = { ...filters, createdBy: event.target.value };
                        setDraftFilters(nextFilters);
                        setFilters(nextFilters);
                      }}
                      className="h-8 appearance-none rounded-full border border-[#d7e5f7] bg-[#e8f2ff] pl-3.5 pr-8 text-[13px] text-[#1f3657] outline-none"
                    >
                      <option value="all">All Users</option>
                      {createdByOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#54657f]" />
                  </label>
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-10 rounded-xl p-0"
                      onClick={() => setColumnsOpen(true)}
                      aria-label="Column visibility"
                      title="Column visibility"
                    >
                      <Columns3 className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl px-3 text-sm" onClick={() => exportVisibleRows("excel")}>
                      <ExcelIcon className="h-4 w-4" />
                      Excel
                    </Button>
                    <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl px-3 text-sm" onClick={printCurrentRegister}>
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-10 rounded-xl p-0"
                      onClick={() => setSettingsOpen(true)}
                      title="Workspace Settings"
                      aria-label="Workspace Settings"
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : undefined
            }
          />

          {section === "revenue" ? null : <PurchaseSummaryMetrics metrics={summaryMetrics} />}

          {section === "revenue" ? null : (
            <PurchaseFilterBar
              draftFilters={draftFilters}
              setDraftFilters={setDraftFilters}
              partyLabel="Supplier"
              supplierOptions={supplierOptions}
              statusOptions={statusOptions}
              paymentMethodOptions={paymentMethodOptions}
              voucherTypeOptions={voucherTypeOptions}
              createdByOptions={createdByOptions}
              costCenterOptions={costCenterOptions}
              presetOptions={purchasePresetOptions}
              savedFilterOptions={purchaseSavedFilterOptions}
              onApply={handleApplyFilters}
              onReset={handleResetFilters}
            />
          )}

          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-[#d8e1ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-3 border-b border-[#e3ebf4] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-[1.45rem] font-semibold tracking-[-0.03em] text-[#12284a]">{config.label} register</h2>
                <p className="mt-1 text-sm text-[#61708a]">
                  Showing {rows.length} filtered records from {formatDate(filters.from)} to {formatDate(filters.to)}.
                </p>
                {lastRefreshAt ? <p className="mt-1 text-xs text-[#6f7d96]">Last refreshed at {formatDateTime(lastRefreshAt)}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" className="h-10 rounded-2xl" onClick={() => exportVisibleRows("csv")} title="Export CSV">
                  <Download className="h-5 w-5" />
                  Export CSV
                </Button>
                <Button type="button" variant="outline" className="h-10 rounded-2xl" onClick={() => void handleRefresh()} disabled={manualRefreshActive} title="Refresh data">
                  <RefreshCw className={cn("h-[17px] w-[17px]", manualRefreshActive ? "animate-spin" : "")} />
                  {manualRefreshActive ? "Refreshing" : "Refresh"}
                </Button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 p-4">
                  <EmptyTransactionState icon={config.icon} title={config.emptyStateTitle} description={config.emptyStateDescription} actionLabel={primaryActionLabel} onAction={handlePrimaryAction} />
                </div>
                <div className="flex h-10 shrink-0 items-center justify-between border-t border-[#dfe7f1] px-3 text-xs text-[#61708a]">
                  <div className="flex items-center gap-4">
                    <span>Showing 0 of 0 entries</span>
                    <span>
                      Total {config.label}: <span className="font-medium text-[#00a7a7]">{formatCurrency(0)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5">
                      <span>Rows</span>
                      <select
                        value={pageSize}
                        onChange={(event) => setPageSize(Number(event.target.value))}
                        className="h-7 rounded-lg border border-[#d5dbe4] bg-white px-2 text-xs text-[#173152]"
                      >
                        {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" disabled>Previous</Button>
                    <span>Page 1 of 1</span>
                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" disabled>Next</Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div ref={tableScrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-[clamp(10px,0.75vw,14px)] [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td:last-child]:overflow-visible" aria-label={`${config.label} transaction grid`}>
                    <thead className={cn(stickyHeader ? "sticky top-0 z-10" : "")}>
                      <tr className="bg-[#f7faff] text-[#3e5576]">
                        <th className="w-11 border-b border-r border-[#dce5f0] px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            aria-label="Select all visible rows"
                            checked={allVisibleSelected}
                            onChange={(event) => toggleVisibleRows(event.target.checked)}
                          />
                        </th>
                        {columns
                          .filter((column) => columnVisibility[column.id] !== false && column.id !== "select")
                          .map((column) => (
                            <th
                              key={column.id}
                              className={cn(
                                "relative whitespace-nowrap border-b border-r border-[#dce5f0] px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.18em]",
                                column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "",
                              )}
                              style={getColumnWidthStyle(column.id, column.width ?? "140px")}
                            >
                              <div className={cn("flex flex-nowrap items-center gap-1.5 whitespace-nowrap", column.align === "right" ? "justify-end" : column.align === "center" ? "justify-center" : "")}>
                                {column.id !== "actions" && column.id !== "select" ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1 py-0.5 text-inherit transition hover:bg-[#fff7ef] hover:text-primary"
                                    onClick={() => toggleSort(column.id as FilterableColumnId)}
                                  >
                                    <span>{column.label}</span>
                                    <ArrowDownUp className="h-3.5 w-3.5" />
                                  </button>
                                ) : column.id === "actions" ? (
                                  <div className="relative flex items-center justify-end" ref={bulkActionsMenuRef}>
                                    <button
                                      type="button"
                                      className="relative inline-flex h-8 w-8 items-center justify-center text-[#334155] transition hover:text-primary"
                                      onClick={() => setBulkActionsMenuOpen((current) => !current)}
                                      aria-label="Actions for selected rows"
                                      title="Selected row actions"
                                    >
                                      {selectedRows.length ? <span className="absolute -right-1.5 -top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] leading-none text-white">{selectedRows.length}</span> : null}
                                      <MoreVertical className="h-4 w-4" />
                                    </button>
                                    {bulkActionsMenuOpen ? (
                                      <div className="absolute right-0 top-9 z-30 min-w-[210px] rounded-2xl border border-[#d7e1ee] bg-white p-2 text-left normal-case tracking-normal shadow-[0_18px_34px_rgba(15,23,42,0.14)]">
                                        <div className="border-b border-[#edf2f7] px-3 py-2 text-xs font-semibold text-[#61708a]">
                                          {selectedRows.length ? `${selectedRows.length} selected` : "No rows selected"}
                                        </div>
                                        <button
                                          type="button"
                                          className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[#24364f] transition hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:opacity-45"
                                          disabled={!selectedRows.length}
                                          onClick={() => {
                                            setBulkActionsMenuOpen(false);
                                            exportVisibleRows("excel");
                                          }}
                                        >
                                          <ExcelIcon className="h-4 w-4" />
                                          Export selected
                                        </button>
                                        <button
                                          type="button"
                                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[#24364f] transition hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:opacity-45"
                                          disabled={!selectedRows.length}
                                          onClick={() => {
                                            setSelectedRowIds([]);
                                            setBulkActionsMenuOpen(false);
                                          }}
                                        >
                                          <XCircle className="h-4 w-4" />
                                          Clear selection
                                        </button>
                                        <button
                                          type="button"
                                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[#c63c3c] transition hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-45"
                                          disabled={!selectedRows.length}
                                          onClick={() => {
                                            setBulkActionsMenuOpen(false);
                                            setBulkDeleteDialogOpen(true);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          Delete selected
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span>{column.label}</span>
                                )}
                                {column.filterable ? (
                                  <button
                                    type="button"
                                    className={cn(
                                      "rounded-md p-1 text-[#6b7c96] transition hover:bg-[#fff7ef] hover:text-primary",
                                      columnFilters[column.id as FilterableColumnId] ? "bg-[#fff7ef] text-primary" : "",
                                    )}
                                    aria-label={`Filter ${column.label}`}
                                    onClick={(event) => openColumnFilter(column.id as FilterableColumnId, event)}
                                  >
                                    <Filter className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </div>
                              {isColumnResizable(column.id) ? renderColumnResizeHandle(column.id, column.label) : null}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.map((row) => {
                        const selected = selectedRowIds.includes(row.id);
                        const rowActions = getRowActions(row);
                        return (
                          <tr
                            key={row.id}
                            className={cn(
                              "cursor-pointer transition hover:bg-[#f9fbff]",
                              selected ? "bg-[#eef6ff]" : "",
                              denseTable ? "" : "align-top",
                            )}
                            onClick={() => setDetailRow(row)}
                          >
                            <td className="border-b border-r border-[#edf2f7] px-3 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                              <input type="checkbox" aria-label={`Select ${row.documentNumber}`} checked={selected} onChange={(event) => toggleRowSelection(row.id, event.target.checked)} />
                            </td>
                            {columns
                              .filter((column) => columnVisibility[column.id] !== false && column.id !== "select")
                              .map((column) => (
                                <td
                                  key={column.id}
                                  className={cn(
                                    "border-b border-r border-[#edf2f7] px-3 py-3 text-[#173152]",
                                    denseTable ? "py-3" : "py-4",
                                    column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "",
                                  )}
                                  style={{ width: `${columnWidths[column.id]}px`, minWidth: `${columnWidths[column.id]}px` }}
                                >
                                  {renderCell({
                                    columnId: column.id,
                                    row,
                                    onOpenMenu: () => setOpenRowMenuId((current) => (current === row.id ? null : row.id)),
                                    rowMenuOpen: openRowMenuId === row.id,
                                    rowActions,
                                    rowMenuRef,
                                  })}
                                </td>
                              ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex h-10 shrink-0 items-center justify-between border-t border-[#dfe7f1] px-3 text-xs text-[#61708a]">
                  <div className="flex items-center gap-3">
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <label className="inline-flex items-center gap-1.5">
                      <span>Rows</span>
                      <select
                        value={pageSize}
                        onChange={(event) => setPageSize(Number(event.target.value))}
                        className="h-7 rounded-lg border border-[#d5dbe4] bg-white px-2 text-xs text-[#173152]"
                      >
                        {pageSizeOptions.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedRows.length ? <span>{selectedRows.length} selected</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                      Previous
                    </Button>
                    <Button type="button" variant="outline" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {columnFilterPopover
        ? createPortal(
            (() => {
              // Every distinct value this column actually has right now, so the list
              // always matches what's really in the table instead of guessing.
              const allValues = Array.from(new Set(rawRows.map((row) => getColumnValue(row, columnFilterPopover.columnId)))).sort((left, right) =>
                left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
              );
              const searchTerm = columnFilterDraft.value.trim().toLowerCase();
              const visibleValues = searchTerm ? allValues.filter((value) => value.toLowerCase().includes(searchTerm)) : allValues;
              const isDateFilter = isDateColumn(columnFilterPopover.columnId);

              return (
                <div
                  ref={columnFilterPopoverRef}
                  className={cn(
                    "fixed z-[70] rounded-[22px] border border-[#d5dfeb] bg-white p-3 shadow-[0_20px_42px_rgba(15,23,42,0.16)]",
                    isDateFilter ? "w-[360px]" : "w-[280px]",
                  )}
                  style={{ left: columnFilterPopover.left, top: columnFilterPopover.top }}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#74839b]">
                        Filter {columnFilterLabel(columnFilterPopover.columnId)}
                      </span>
                      {columnFilterDraft.values.length > 0 ? (
                        <span className="rounded-full bg-[#fff3e7] px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {columnFilterDraft.values.length} selected
                        </span>
                      ) : null}
                    </div>
                    {isDateFilter ? (
                      <div className="space-y-2 rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-2.5">
                        <div className="grid grid-cols-2 gap-3">
                          <label className="grid min-w-0 gap-1">
                            <span className="text-xs text-[#8994a6]">From</span>
                            <AppDateInput
                              value={columnFilterDraft.dateFrom}
                              onChange={(value) => setColumnFilterDraft((current) => ({ ...current, dateFrom: value }))}
                              aria-label="Filter from date"
                              className="min-w-0"
                              inputClassName="h-9 rounded-lg border-[#f0c9a4] px-2 pr-9"
                            />
                          </label>
                          <label className="grid min-w-0 gap-1">
                            <span className="text-xs text-[#8994a6]">To</span>
                            <AppDateInput
                              value={columnFilterDraft.dateTo}
                              onChange={(value) => setColumnFilterDraft((current) => ({ ...current, dateTo: value }))}
                              aria-label="Filter to date"
                              className="min-w-0"
                              inputClassName="h-9 rounded-lg border-[#f0c9a4] px-2 pr-9"
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}
                    {/* Date columns are filtered purely by the From/To range above —
                        no free-text search or exact-value checklist for them. */}
                    {!isDateFilter ? (
                      <>
                        <Input
                          value={columnFilterDraft.value}
                          onChange={(event) => setColumnFilterDraft((current) => ({ ...current, value: event.target.value }))}
                          placeholder="Search values"
                          className="h-10 rounded-xl border-[#f0c9a4]"
                        />
                        {/* Ticking a value filters by exactly that set — check several to see
                            rows matching any of them (e.g. Open Order + Partially Received). */}
                        <div className="max-h-[240px] space-y-0.5 overflow-y-auto rounded-xl border border-[#edf2f7]">
                          {visibleValues.length ? (
                            visibleValues.map((value) => (
                              <label
                                key={value}
                                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                              >
                                <input
                                  type="checkbox"
                                  checked={columnFilterDraft.values.includes(value)}
                                  onChange={() => toggleColumnFilterValue(value)}
                                />
                                <span className="min-w-0 flex-1 truncate">{getColumnFilterLabel(value, columnFilterPopover.columnId) || "(blank)"}</span>
                              </label>
                            ))
                          ) : (
                            <div className="px-2.5 py-4 text-center text-sm text-[#8994a6]">No matching values</div>
                          )}
                        </div>
                      </>
                    ) : null}
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
                        <CheckCircle2 className="h-5 w-5" />
                        Apply
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })(),
            document.body,
          )
        : null}

      {expenseAccountMenu && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[58]" onMouseDown={() => setExpenseAccountMenu(null)} aria-hidden="true" />
              <div
                role="menu"
                aria-label={`Actions for ${expenseAccountMenu.entry.name}`}
                className="fixed z-[59] w-44 overflow-hidden rounded-[6px] border border-[#d7e1ee] bg-white p-1.5 shadow-[0_14px_34px_rgba(15,23,42,0.18)]"
                style={{ left: expenseAccountMenu.left, top: expenseAccountMenu.top }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-10 w-full items-center gap-2 rounded-[4px] px-3 text-left text-sm font-medium text-[#24364f] transition hover:bg-[#eef5ff] hover:text-[#1455a0]"
                  onClick={() => editExpenseAccount(expenseAccountMenu.entry)}
                >
                  {expenseAccountMenu.entry.code === "LEGACY" ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  {expenseAccountMenu.entry.code === "LEGACY" ? "Assign Category" : "Edit"}
                </button>
                {expenseAccountMenu.entry.code === "LEGACY" ? null : (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex h-10 w-full items-center gap-2 rounded-[4px] px-3 text-left text-sm font-medium text-[#b42318] transition hover:bg-[#fff1f0]"
                    onClick={() => requestDeleteExpenseAccount(expenseAccountMenu.entry)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            </>,
            document.body,
          )
        : null}

      <Dialog open={Boolean(expenseAccountEditor)} onOpenChange={(open) => (!open ? setExpenseAccountEditor(null) : undefined)}>
        <DialogContent className="w-[min(92vw,520px)] rounded-[8px] border border-[#d7e1ee] p-0">
          {expenseAccountEditor ? (
            <form
              className="bg-white"
              onSubmit={(event) => {
                event.preventDefault();
                void saveExpenseAccount();
              }}
            >
              <div className="border-b border-[#e2e8f0] px-5 py-4 pr-14">
                <DialogTitle className="text-xl font-semibold text-[#173152]">
                  {expenseAccountEditor.mode === "create" ? "Add" : "Edit"} {isRevenueWorkspace ? "Revenue" : "Expense"} {expenseAccountEditor.kind === "ledger" ? "Ledger" : "Category"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-[#697791]">
                  {expenseAccountEditor.kind === "ledger"
                    ? `Every ${isRevenueWorkspace ? "revenue" : "expense"} ledger must belong to a category.`
                    : `Categories organize related ${isRevenueWorkspace ? "revenue" : "expense"} ledgers and their transactions.`}
                </DialogDescription>
              </div>

              <div className="grid gap-4 px-5 py-5">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Name *</span>
                  <Input
                    value={expenseAccountEditor.name}
                    onChange={(event) => setExpenseAccountEditor((current) => (current ? { ...current, name: event.target.value } : current))}
                    placeholder={expenseAccountEditor.kind === "ledger" ? (isRevenueWorkspace ? "e.g. Interest Income" : "e.g. Office Rent") : (isRevenueWorkspace ? "e.g. Other Income" : "e.g. Administrative Expenses")}
                    className="h-10 rounded-[6px]"
                    autoFocus
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-sm font-medium text-[#334155]">Code</span>
                  <div className="flex h-10 items-center rounded-[6px] border border-[#d7e1ee] bg-[#f5f7fb] px-3 font-mono text-sm text-[#173152]">
                    {expenseAccountEditor.code || "—"}
                  </div>
                  <span className="text-xs text-[#8a97ad]">Auto-generated from the chart of accounts — cannot be edited.</span>
                </label>

                {expenseAccountEditor.kind === "ledger" ? (
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-[#334155]">Category *</span>
                    <select
                      value={expenseAccountEditor.parentId}
                      onChange={(event) => {
                        const category = expenseAccountsById.get(event.target.value);
                        setExpenseAccountEditor((current) =>
                          current
                            ? {
                                ...current,
                                parentId: event.target.value,
                                nature: category && (isRevenueWorkspace ? category.nature === "INCOME" : isExpenseNature(category.nature))
                                  ? category.nature as ExpenseAccountEditorState["nature"]
                                  : current.nature,
                              }
                            : current,
                        );
                      }}
                      className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm text-[#173152] outline-none focus:border-[#7aa7dc]"
                    >
                      <option value="">Select category</option>
                      {expenseCategoryAccounts.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name} ({getExpenseNatureLabel(category.nature)})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : expenseAccountEditor.mode === "create" && !isRevenueWorkspace ? (
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-[#334155]">Expense Type *</span>
                    <select
                      value={expenseAccountEditor.nature}
                      onChange={(event) =>
                        setExpenseAccountEditor((current) =>
                          current
                            ? {
                                ...current,
                                nature: event.target.value as Extract<AccountNature, "DIRECT_EXPENSE" | "INDIRECT_EXPENSE">,
                              }
                            : current,
                        )
                      }
                      className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm text-[#173152] outline-none focus:border-[#7aa7dc]"
                    >
                      <option value="INDIRECT_EXPENSE">Indirect Expense</option>
                      <option value="DIRECT_EXPENSE">Direct Expense</option>
                    </select>
                  </label>
                ) : (
                  <div className="rounded-[6px] border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-sm text-[#52657e]">
                    {isRevenueWorkspace ? "Account nature" : "Expense type"}: {getExpenseNatureLabel(expenseAccountEditor.nature)}
                  </div>
                )}

                {expenseAccountEditor.kind === "ledger" ? (
                  <label className="flex items-center gap-2 text-sm text-[#28365b]">
                    <input
                      type="checkbox"
                      checked={expenseAccountEditor.requiresItemDetails}
                      onChange={(event) =>
                        setExpenseAccountEditor((current) => (current ? { ...current, requiresItemDetails: event.target.checked } : current))
                      }
                    />
                    Require item details on {isRevenueWorkspace ? "Revenue" : "Expense"} entries
                  </label>
                ) : null}

                {expenseAccountEditorError ? (
                  <div className="rounded-[6px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#b42318]">{expenseAccountEditorError}</div>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-[#e2e8f0] px-5 py-4">
                <Button type="button" variant="outline" className="rounded-[6px]" onClick={() => setExpenseAccountEditor(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="rounded-[6px]"
                  disabled={createExpenseAccountMutation.isPending || updateExpenseAccountMutation.isPending || reparentExpenseAccountMutation.isPending}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {expenseAccountEditor.mode === "create" ? "Add" : "Save Changes"}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentOutDialogOpen}
        onOpenChange={(open) => {
          setPaymentOutDialogOpen(open);
          if (!open) {
            setPaymentOutShareMenuOpen(false);
          }
        }}
      >
        <DialogContent className="w-[min(94vw,1000px)] rounded-[6px] border border-[#d7dce4] p-0">
          <div className="flex min-h-[550px] flex-col bg-white">
            <div className="flex items-start justify-between gap-4 px-6 py-5">
              <div>
                <DialogTitle className="text-[2rem] font-semibold text-[#14233b]">Payment-Out</DialogTitle>
                <DialogDescription className="sr-only">Create or edit a payment-out voucher.</DialogDescription>
              </div>
              <div className="mr-10 flex items-center gap-4 text-[#7a8798]">
                <button type="button" className="transition hover:text-[#1455a0]" onClick={() => exportVisibleRows("excel")} aria-label="Export draft">
                  <ExcelIcon className="h-5 w-5" />
                </button>
                <button type="button" className="relative transition hover:text-[#1455a0]" onClick={() => setSettingsOpen(true)} aria-label="Payment settings">
                  <Settings2 className="h-5 w-5" />
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#e11d48]" />
                </button>
              </div>
            </div>

            <div className="grid flex-1 gap-8 px-6 pb-8 pt-2 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-5">
                <div className="max-w-[230px]">
                  <label className="relative grid gap-1.5">
                    <span className="text-sm font-medium text-[#0f6cf6]">Party *</span>
                    <Input
                      list="payment-out-party-options"
                      value={paymentOutDialogForm.partyName}
                      onChange={(event) => updatePaymentOutDialogField("partyName", event.target.value)}
                      className="h-11 rounded-[4px] border-[#0f6cf6]"
                      placeholder="Select party"
                    />
                  </label>
                  {paymentOutPartyOptions.length ? (
                    <datalist id="payment-out-party-options">
                      {paymentOutPartyOptions.map((party) => (
                        <option key={party} value={party} />
                      ))}
                    </datalist>
                  ) : null}
                </div>

                <div className="max-w-[145px]">
                  <label className="grid gap-1.5">
                    <span className="text-sm text-[#7c8a9b]">Payment Type</span>
                    <div className="relative">
                      <select
                        value={paymentOutDialogForm.paymentMethod}
                        onChange={(event) => setPaymentOutDialogForm((current) => ({
                          ...current,
                          paymentMethod: event.target.value as PaymentOutDialogState["paymentMethod"],
                          moneyAccountId: "",
                        }))}
                        className="h-10 w-full appearance-none rounded-[4px] border border-[#cfd9e8] bg-white px-3 text-sm text-[#1f2f46] outline-none"
                      >
                        {paymentOutMethodOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7c8a9b]" />
                    </div>
                  </label>
                </div>

                {mode === "api" ? (
                  <div className="max-w-[280px]">
                    <label className="grid gap-1.5">
                      <span className="text-sm text-[#7c8a9b]">Paid From *</span>
                      <div className="relative">
                        <select
                          value={paymentOutDialogForm.moneyAccountId}
                          onChange={(event) => updatePaymentOutDialogField("moneyAccountId", event.target.value)}
                          disabled={paymentOutMoneyAccountsQuery.isLoading}
                          className="h-10 w-full appearance-none rounded-[4px] border border-[#cfd9e8] bg-white px-3 pr-9 text-sm text-[#1f2f46] outline-none disabled:bg-[#f4f7fb]"
                        >
                          <option value="">{paymentOutMoneyAccountsQuery.isLoading ? "Loading ledgers..." : "Select account ledger"}</option>
                          {paymentOutMoneyAccountOptions.map((account) => (
                            <option key={account.id} value={account.id}>{account.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7c8a9b]" />
                      </div>
                    </label>
                    {paymentOutMoneyAccountsQuery.isError ? (
                      <div className="mt-1 text-xs text-[#c63c3c]">Payment ledgers could not be loaded.</div>
                    ) : null}
                  </div>
                ) : null}

                <div className="max-w-[145px]">
                  <Input
                    value={paymentOutDialogForm.reference}
                    onChange={(event) => updatePaymentOutDialogField("reference", event.target.value)}
                    className="h-10 rounded-[4px] border-[#cfd9e8] bg-[#f9fbff] text-sm text-[#1f2f46]"
                    placeholder="Reference No."
                  />
                </div>

                <button
                  type="button"
                  className="text-sm font-medium text-[#0f6cf6]"
                  onClick={() => toast.info("Custom payment type manager can be added next.")}
                >
                  + Add Payment type
                </button>

                <div className="max-w-[170px]">
                  <button
                    type="button"
                    className="inline-flex h-11 w-full items-center justify-start gap-2 rounded-[4px] border border-[#cfd9e8] px-4 text-sm font-semibold text-[#a3a3a3]"
                    onClick={() => setPaymentOutDescriptionOpen((current) => !current)}
                  >
                    <Plus className="h-5 w-5" />
                    ADD DESCRIPTION
                  </button>
                </div>

                {paymentOutDescriptionOpen ? (
                  <textarea
                    value={paymentOutDialogForm.narration}
                    onChange={(event) => updatePaymentOutDialogField("narration", event.target.value)}
                    rows={4}
                    className="min-h-[96px] w-full max-w-[420px] rounded-[4px] border border-[#cfd9e8] px-3 py-3 text-sm text-[#1f2f46] outline-none"
                    placeholder="Add note or description"
                  />
                ) : null}
              </div>

              <div className="space-y-5">
                <div className="grid gap-5">
                  <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
                    <span className="text-sm text-[#7c8a9b]">Receipt No</span>
                    <Input
                      value={paymentOutDialogForm.receiptNumber}
                      onChange={(event) => updatePaymentOutDialogField("receiptNumber", event.target.value)}
                      className="h-10 rounded-none border-0 border-b border-[#cfd9e8] px-0 text-right shadow-none focus-visible:ring-0"
                    />
                  </label>

                  <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
                    <span className="text-sm text-[#7c8a9b]">Date</span>
                    <AppDateInput
                      value={paymentOutDialogForm.voucherDate}
                      onChange={(value) => updatePaymentOutDialogField("voucherDate", value)}
                      aria-label="Payment date"
                      inputClassName="h-10 rounded-none border-0 border-b border-[#cfd9e8] px-0 pr-9 text-right shadow-none focus:ring-0"
                    />
                  </label>
                </div>

                <div className="pt-44">
                  <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4">
                    <span className="text-sm text-[#7c8a9b]">Paid</span>
                    <Input
                      money
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentOutDialogForm.amount}
                      onChange={(event) => updatePaymentOutDialogField("amount", event.target.value)}
                      className="h-10 rounded-[4px] border-[#cfd9e8] text-right"
                    />
                  </label>
                </div>
              </div>
            </div>

            {!paymentOutDialogForm.sourceId && paymentOutDialogForm.partyName.trim() ? (
              <div className="border-t border-[#d9e1ec] px-6 py-5">
                {outstandingBillsForPaymentOutParty.length ? (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[#14233b]">Apply to outstanding bills</div>
                        <div className="text-xs text-[#7a8798]">
                          Oldest bill is settled first by default — edit any row to send the payment somewhere else instead.
                        </div>
                      </div>
                      <div
                        className={cn(
                          "text-sm font-medium",
                          moneyToMinorUnits(paymentOutAllocatedTotal) > moneyToMinorUnits(paymentOutDialogForm.amount || 0)
                            ? "text-[#c63c3c]"
                            : "text-[#61708a]",
                        )}
                      >
                        Applied {formatCurrency(paymentOutAllocatedTotal)} of {formatCurrency(Number(paymentOutDialogForm.amount || 0))}
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-[6px] border border-[#e4ebf4]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-[#fbfcfe] text-[#586b84]">
                          <tr>
                            <th className="border-b border-[#e4ebf4] px-3 py-2 text-left text-[11px] font-semibold uppercase">Bill No.</th>
                            <th className="border-b border-[#e4ebf4] px-3 py-2 text-left text-[11px] font-semibold uppercase">Date</th>
                            <th className="border-b border-[#e4ebf4] px-3 py-2 text-right text-[11px] font-semibold uppercase">Bill Total</th>
                            <th className="border-b border-[#e4ebf4] px-3 py-2 text-right text-[11px] font-semibold uppercase">Balance Due</th>
                            <th className="border-b border-[#e4ebf4] px-3 py-2 text-right text-[11px] font-semibold uppercase">Applying</th>
                          </tr>
                        </thead>
                        <tbody>
                          {outstandingBillsForPaymentOutParty.map((bill) => {
                            const allocation = paymentOutAllocations.find((row) => row.sourceId === bill.sourceId);
                            return (
                              <tr key={bill.sourceId} className="odd:bg-white even:bg-[#fbfdff]">
                                <td className="border-b border-[#edf2f7] px-3 py-2 font-medium text-[#173152]">{bill.documentNumber}</td>
                                <td className="border-b border-[#edf2f7] px-3 py-2 text-[#586b84]">{formatDate(bill.documentDate)}</td>
                                <td className="border-b border-[#edf2f7] px-3 py-2 text-right text-[#586b84]">{formatCurrency(bill.amount)}</td>
                                <td className="border-b border-[#edf2f7] px-3 py-2 text-right text-[#586b84]">{formatCurrency(bill.balance)}</td>
                                <td className="border-b border-[#edf2f7] px-2 py-1.5 text-right">
                                  <Input
                                    money
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={allocation?.applied ?? ""}
                                    onChange={(event) => updatePaymentOutAllocation(bill.sourceId, event.target.value)}
                                    placeholder="0.00"
                                    className="h-9 w-32 rounded-[4px] border-[#cfd9e8] text-right"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-[#7a8798]">{paymentOutDialogForm.partyName.trim()} has no outstanding bills — this will be recorded as an unlinked payment.</div>
                )}
              </div>
            ) : null}

            <div className="border-t border-[#d9e1ec] bg-white px-6 py-4">
              <div className="flex items-center justify-end gap-4">
                <div ref={paymentOutShareMenuRef} className="relative flex">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-r-none border-[#8ebcff] px-5 text-[#0f6cf6]"
                    onClick={() => sharePaymentOutDraft("share")}
                  >
                    <Share2 className="h-5 w-5" />
                    Share
                  </Button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-r-md border border-l-0 border-[#8ebcff] px-3 text-[#0f6cf6]"
                    onClick={() => setPaymentOutShareMenuOpen((current) => !current)}
                    aria-label="Open share options"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  {paymentOutShareMenuOpen ? (
                    <div className="absolute bottom-12 right-0 min-w-[180px] rounded-xl border border-[#d7e1ee] bg-white p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]" onClick={() => sharePaymentOutDraft("share")}>
                        <Share2 className="h-5 w-5" />
                        Share now
                      </button>
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]" onClick={() => sharePaymentOutDraft("copy")}>
                        <Copy className="h-5 w-5" />
                        Copy details
                      </button>
                    </div>
                  ) : null}
                </div>
                <Button type="button" className="min-w-[120px] rounded-md px-10" onClick={() => void savePaymentOutDialog()} disabled={paymentOutDialogSaving}>
                  <CheckCircle2 className="h-5 w-5" />
                  {paymentOutDialogSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={purchaseEditorState !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPurchaseEditorState(null);
            clearPurchaseEditorQuery();
          }
        }}
      >
        <DialogContent
          className={
            isDebitNotesWorkspace
              ? "max-h-[88vh] w-[min(94vw,1440px)] overflow-y-auto border border-[#d8e1ea] bg-white p-0"
              : "max-h-[92vh] w-[min(96vw,1500px)] overflow-y-auto border border-[#d8e1ea] bg-[#f8fbff] p-4"
          }
        >
          {purchaseEditorState ? (
            <VoucherEntryScreen
              voucherType={isExpensesWorkspace ? "expense" : isDebitNotesWorkspace ? "debit-note" : isRevenueWorkspace ? "revenue" : "purchase"}
              displayMode="dialog"
              embeddedState={{
                editId: purchaseEditorState.editId ?? null,
                duplicateId: purchaseEditorState.duplicateId ?? null,
                sourceVoucherId: purchaseEditorState.sourceVoucherId ?? null,
                workflow: purchaseEditorState.workflow ?? null,
              }}
              onClose={() => {
                setPurchaseEditorState(null);
                clearPurchaseEditorQuery();
              }}
              onSaved={async () => {
                setDetailRow(null);
                setOpenRowMenuId(null);
                await query.refetch();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewDialog)} onOpenChange={(open) => (!open ? setPreviewDialog(null) : undefined)}>
        <DialogContent className="h-[90vh] w-[min(98vw,1760px)] max-w-none rounded-[26px] border border-[#dfe5ee] p-0">
          {previewDialog ? (
            <div className="grid h-full min-h-0 grid-cols-[clamp(220px,17vw,290px)_minmax(0,1fr)_clamp(240px,19vw,320px)]">
              <div className="border-r border-[#e5eaf1] bg-[#f6f7f9]">
                <div className="border-b border-[#e5eaf1] px-5 py-5">
                  <div className="text-2xl font-semibold text-[#183153]">Preview</div>
                  <div className="mt-1 text-sm text-[#64748b]">{previewDialog.subtitle}</div>
                </div>
                <div className="px-5 py-5">
                  <div className="text-base font-semibold text-[#22324c]">Select Theme</div>
                  <div className="mt-5 space-y-5">
                    {previewThemeSections.map((sectionEntry) => (
                      <div key={sectionEntry.title}>
                        <div className="mb-2 text-sm font-semibold text-[#6a7687]">{sectionEntry.title}</div>
                        <div className="overflow-hidden rounded-2xl border border-[#dde4ee] bg-white">
                          {sectionEntry.items.map((themeOption) => (
                            <button
                              key={themeOption.id}
                              type="button"
                              className={cn(
                                "flex w-full items-start justify-between gap-3 border-b border-[#edf2f7] px-4 py-3 text-left transition last:border-b-0",
                                previewTheme === themeOption.id ? "bg-[#dcebf6]" : "hover:bg-[#f8fbff]",
                              )}
                              onClick={() => {
                                if (themeOption.id === "letterhead" && !previewDialog.payload.invoicePadDataUrl) {
                                  invoicePadInputRef.current?.click();
                                  return;
                                }
                                setPreviewTheme(themeOption.id);
                              }}
                            >
                              <span>
                                <span className="block text-sm font-semibold text-[#1f2f46]">{themeOption.label}</span>
                                <span className="mt-1 block text-xs text-[#6f7d91]">{themeOption.hint}</span>
                              </span>
                              <span
                                className={cn(
                                  "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0px] font-bold leading-none",
                                  previewTheme === themeOption.id ? "border-[#1e5aac] bg-[#1e5aac] text-white" : "border-[#c9d5e4] text-transparent",
                                )}
                              >
                                •
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-2xl border border-[#dde6f2] bg-white p-4">
                    <div className="text-sm font-semibold text-[#22324c]">Company Pad / Letterhead</div>
                    <div className="mt-1 text-xs leading-5 text-[#6f7d91]">Upload your company pad as a PNG/JPG. The same pad is used in preview, PDF, and print.</div>
                    <input ref={invoicePadInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(event) => void handlePreviewPadUpload(event)} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="rounded-full border-[#d8e3f0] bg-white text-[#1f4d8f] hover:bg-[#f7fbff]" onClick={() => invoicePadInputRef.current?.click()}>
                        <UploadCloud className="h-4 w-4" />
                        {previewDialog.payload.invoicePadDataUrl ? "Change Letterhead" : "Upload Letterhead"}
                      </Button>
                      <Button type="button" variant="outline" className="rounded-full border-[#d8e3f0] bg-white text-[#5f6f86] hover:bg-[#f7fbff]" onClick={() => router.push(buildWorkspaceRoute(mode, "/company-profile"))}>
                        Open Company Profile
                      </Button>
                    </div>
                  </div>
                  <div className="mt-6 rounded-2xl border border-[#e6e1c5] bg-[#fffceb] px-4 py-4 text-sm text-[#776433]">
                    Use the selected theme for a clean, consistent and professional document preview.
                  </div>
                </div>
              </div>

              <div className="min-h-0 overflow-auto bg-[#eef1f5]">
                <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#dfe6ef] bg-white/95 px-5 py-4 backdrop-blur">
                  <div>
                    <DialogTitle className="text-[32px] font-semibold text-[#183153]">Preview</DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-[#64748b]">
                      {isOrderLikeSection(section) ? getOrderLikeDocumentLabel(section) : "Bill"} preview for {previewDialog.payload.billToName}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-[#5f6b7a]">
                      <input type="checkbox" className="h-4 w-4 rounded border-[#c9d5e4]" />
                      Do not show invoice preview again
                    </label>
                    <Button variant="outline" className="rounded-2xl border-[#d9e3f0]" onClick={() => setPreviewDialog(null)}>
                      <CheckCircle2 className="h-5 w-5" />
                      Save & Close
                    </Button>
                  </div>
                </div>

                <div className="px-8 py-8">
                  {previewTheme === "letterhead" ? (
                    <div className="mx-auto max-w-[1050px] overflow-hidden rounded-[22px] border border-[#dbe4ef] bg-white shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
                      <img src={previewDialog.imageSrc} alt={`${previewDialog.title} preview`} className="w-full" />
                    </div>
                  ) : (
                    <div
                      className="mx-auto w-full max-w-[1050px] rounded-[10px] border border-[#b6beca] bg-white p-4 shadow-[0_28px_60px_rgba(15,23,42,0.12)]"
                      style={{ aspectRatio: "210 / 297" }}
                    >
                      <div className="pb-3 text-center text-[18px] font-bold text-[#30446b]">{isOrderLikeSection(section) ? getOrderLikeDocumentLabel(section) : "Bill"}</div>

                      <div className="grid grid-cols-[96px_minmax(0,1fr)] border border-[#5f6774]">
                        {previewDialog.payload.logoDataUrl ? (
                          <div className="flex min-h-[96px] items-center justify-center bg-white p-2">
                            <img src={previewDialog.payload.logoDataUrl} alt="Company logo" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="flex min-h-[96px] items-center justify-center bg-[#a7a1a1] text-[16px] font-bold tracking-[0.08em] text-white">LOGO</div>
                        )}
                        <div className="px-4 py-3">
                          <div className="text-[18px] font-bold text-[#30446b]">{previewDialog.payload.companyName}</div>
                          <div className="mt-2 text-[12px] text-[#111827]">
                            {previewDialog.payload.fromAddressLines.join(", ") || "Trading ERP Workspace"}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 border-x border-b border-[#5f6774] text-[12px] text-[#111827]">
                        <div className="border-r border-[#5f6774]">
                          <div className="border-b border-[#5f6774] px-3 py-1 font-semibold">{isOrderLikeSection(section) ? "Order To:" : "Bill From:"}</div>
                          <div className="space-y-1 px-3 py-2">
                            <div className="font-semibold">{previewDialog.payload.billToName}</div>
                            {previewDialog.payload.billToAddressLines.map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="border-b border-[#5f6774] px-3 py-1 font-semibold">{isOrderLikeSection(section) ? "Order Details:" : "Bill Details:"}</div>
                          <div className="grid gap-1 px-3 py-2">
                            <div>
                              <span className="font-semibold">Date: </span>
                              {previewDialog.payload.dateLabel}
                            </div>
                            <div>
                              <span className="font-semibold">{isOrderLikeSection(section) ? `${getOrderLikeDocumentLabel(section)} No: ` : "Invoice No: "}</span>
                              {previewDialog.payload.invoiceNumber}
                            </div>
                            <div>
                              <span className="font-semibold">Settlement: </span>
                              {previewDialog.payload.paymentMode}
                            </div>
                            {isOrderLikeSection(section) ? (
                              <div>
                                <span className="font-semibold">Due Date: </span>
                                {previewDialog.payload.dateLabel}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="border-x border-b border-[#5f6774] px-3 py-1 text-[12px] font-semibold text-[#111827]">Ship From:</div>
                      <div className="border-x border-b border-[#5f6774] px-3 py-2 text-[12px] text-[#111827]">
                        {previewDialog.payload.billToAddressLines.join(", ") || "N/A"}
                      </div>

                      <table className="w-full border-collapse text-[12px] text-[#111827]">
                        <thead>
                          <tr>
                            <th className="w-[48px] border border-[#5f6774] px-2 py-2 text-left font-semibold">#</th>
                            <th className="border border-[#5f6774] px-2 py-2 text-left font-semibold">Item name</th>
                            <th className="w-[96px] border border-[#5f6774] px-2 py-2 text-right font-semibold">Quantity</th>
                            <th className="w-[120px] border border-[#5f6774] px-2 py-2 text-right font-semibold">Price/ Unit(Tk)</th>
                            <th className="w-[120px] border border-[#5f6774] px-2 py-2 text-right font-semibold">Amount(Tk)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewDialog.payload.items.map((item, index) => (
                            <tr key={`${item.description}-${index}`}>
                              <td className="border border-[#5f6774] px-2 py-2 align-top">{index + 1}</td>
                              <td className="border border-[#5f6774] px-2 py-2 align-top">{item.description}</td>
                              <td className="border border-[#5f6774] px-2 py-2 text-right align-top">{item.quantity}</td>
                              <td className="border border-[#5f6774] px-2 py-2 text-right align-top">{formatCurrency(item.price || 0)}</td>
                              <td className="border border-[#5f6774] px-2 py-2 text-right align-top">{formatCurrency(item.total || 0)}</td>
                            </tr>
                          ))}
                          <tr>
                            <td className="border border-[#5f6774]" />
                            <td className="border border-[#5f6774] px-2 py-2 font-semibold">Total</td>
                            <td className="border border-[#5f6774] px-2 py-2 text-right font-semibold">
                              {previewDialog.payload.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}
                            </td>
                            <td className="border border-[#5f6774]" />
                            <td className="border border-[#5f6774] px-2 py-2 text-right font-semibold">{formatCurrency(previewDialog.payload.total)}</td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="grid grid-cols-[minmax(0,1fr)_240px] border-x border-b border-[#5f6774]">
                        <div className="min-h-[120px] border-r border-[#5f6774] px-3 py-3 text-[12px] text-[#111827]">
                          <div className="font-semibold">{isOrderLikeSection(section) ? `${getOrderLikeDocumentLabel(section)} Amount in Words:` : "Bill Amount in Words:"}</div>
                          <div className="mt-2 whitespace-pre-wrap text-[#374151]">{previewDialog.payload.note || "Invoice preview generated from purchase workspace."}</div>
                        </div>
                        <div className="px-3 py-3 text-[12px]">
                          <div className="flex items-center justify-between border-b border-[#d7dde7] py-1">
                            <span className="font-semibold">Sub Total</span>
                            <span>{formatCurrency(previewDialog.payload.subTotal)}</span>
                          </div>
                          <div className="flex items-center justify-between border-b border-[#d7dde7] py-1">
                            <span className="font-semibold">Discount</span>
                            <span>{previewDialog.payload.discountLabel}</span>
                          </div>
                          <div className="flex items-center justify-between border-b border-[#d7dde7] py-1">
                            <span className="font-semibold">Discount Amount</span>
                            <span>{formatCurrency(previewDialog.payload.discountAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between py-2 text-[15px] font-bold text-[#1d3258]">
                            <span>Total</span>
                            <span>{formatCurrency(previewDialog.payload.total)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col bg-white">
                <div className="border-b border-[#e8edf4] px-5 py-5">
                  <div className="text-[18px] font-semibold text-[#1f2937]">Share Invoice</div>
                </div>
                <div className="space-y-6 px-5 py-5">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="flex flex-col items-center rounded-2xl border border-[#e5eaf1] px-4 py-4 text-center transition hover:bg-[#f8fbff]"
                      onClick={() => {
                        const payload = previewDialog.payload;
                        const title = previewDialog.title;
                        void (async () => {
                          const file = await buildInvoiceFile(`${title}.jpg`, payload);
                          await shareInvoiceDocument({
                            file,
                            title,
                            text: buildInvoiceShareText(payload, title),
                            fallback: () => {
                              void downloadInvoiceJpg(`${title}.jpg`, payload);
                              openWhatsAppShare(buildInvoiceShareText(payload, title));
                            },
                          });
                        })();
                      }}
                    >
                      <WhatsAppIcon className="h-10 w-10" />
                      <span className="mt-3 text-sm font-medium text-[#22324c]">Whatsapp</span>
                    </button>
                    <button
                      type="button"
                      className="flex flex-col items-center rounded-2xl border border-[#e5eaf1] px-4 py-4 text-center transition hover:bg-[#f8fbff]"
                      onClick={() => {
                        const payload = previewDialog.payload;
                        const title = previewDialog.title;
                        void (async () => {
                          const file = await buildInvoiceFile(`${title}.jpg`, payload);
                          await shareInvoiceDocument({
                            file,
                            title,
                            text: buildInvoiceShareText(payload, title),
                            fallback: () => {
                              void downloadInvoiceJpg(`${title}.jpg`, payload);
                              openMailComposer(
                                `${title} for ${payload.billToName}`,
                                buildInvoiceShareText(payload, title),
                              );
                            },
                          });
                        })();
                      }}
                    >
                      <Mail className="h-10 w-10 text-[#2878c8]" />
                      <span className="mt-3 text-sm font-medium text-[#22324c]">Email</span>
                    </button>
                  </div>
                  <div className="grid gap-3">
                    <Button
                      variant="outline"
                      className="justify-start rounded-2xl border-[#e5eaf1] py-6 text-[#2563eb]"
                      onClick={() => void downloadInvoicePdf(`${previewDialog.title}.pdf`, previewDialog.payload)}
                    >
                      <Download className="h-5 w-5" />
                      Download PDF
                    </Button>
                    <Button variant="outline" className="justify-start rounded-2xl border-[#e5eaf1] py-6 text-[#2563eb]" onClick={() => openInvoicePdf(previewDialog.payload)}>
                      <ReceiptText className="h-5 w-5" />
                      Print Invoice (Thermal)
                    </Button>
                    <Button variant="outline" className="justify-start rounded-2xl border-[#e5eaf1] py-6 text-[#2563eb]" onClick={() => printInvoice(previewDialog.payload)}>
                      <Printer className="h-5 w-5" />
                      Print Invoice (Normal)
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={detailRow !== null} onOpenChange={(open) => (!open ? setDetailRow(null) : undefined)}>
        <DialogContent className="max-h-[90vh] w-[min(94vw,820px)] overflow-y-auto p-0">
          {detailRow ? (
            <div>
              {/* The status badge sits inline next to the title instead of hugging the
                  dialog's right edge, and pr-12 keeps this whole block clear of the
                  close button no matter how long the label or how narrow the dialog. */}
              <div className="border-b border-[#e3e9f1] px-6 py-5 pr-14">
                <div className="flex flex-wrap items-center gap-2.5">
                  <DialogTitle className="text-2xl font-semibold text-[#132949]">{detailRow.documentNumber}</DialogTitle>
                  <DocumentStatusBadge label={detailRow.statusLabel} tone={statusTone(detailRow.statusLabel)} />
                </div>
                <DialogDescription className="mt-2 text-sm text-[#61708a]">
                  {detailRow.partyName} · {formatDate(detailRow.documentDate)} · {detailRow.reference}
                </DialogDescription>
              </div>
              <div className="px-6 py-2">
                <div className="grid md:grid-cols-2 md:gap-x-8">
                  <DetailField label="Amount" value={formatCurrency(detailRow.amount)} emphasized />
                  <DetailField
                    label={section === "orders" ? "Advance Paid" : "Paid"}
                    value={formatCurrency(section === "orders" ? detailRow.advancePaidAmount : detailRow.paidAmount)}
                  />
                  <DetailField
                    label={section === "orders" ? "Payable Due" : "Balance"}
                    value={formatCurrency(section === "orders" ? detailRow.financialDue : detailRow.balance)}
                    emphasized
                  />
                  <DetailField label="Payment Method" value={detailRow.paymentMethod} />
                  <DetailField label="Payment Account" value={detailRow.paymentAccount} />
                  <DetailField label="Cost Center" value={detailRow.costCenter} />
                  <DetailField label="Created By" value={detailRow.createdBy} />
                  <DetailField label="Narration" value={detailRow.narration || "No narration supplied"} />
                </div>
              </div>
              {detailRow.paymentBreakdown.length > 0 || isPaymentOutWorkspace ? (
                <div className={cn("mx-6 mb-5 grid gap-4", isPaymentOutWorkspace ? "md:grid-cols-2" : "grid-cols-1")}>
                  <section className="overflow-hidden rounded-xl border border-[#dce6f2] bg-white">
                    <div className="flex items-center justify-between border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
                      <div>
                        <p className="font-semibold text-[#173152]">Payment Breakdown</p>
                        <p className="text-xs text-[#71819a]">Method, reference and paid amount</p>
                      </div>
                      <span className="rounded-full bg-[#e9f2ff] px-2.5 py-1 text-xs font-semibold text-[#2563eb]">{detailRow.paymentBreakdown.length}</span>
                    </div>
                    <div className="divide-y divide-[#edf1f6]">
                      {detailRow.paymentBreakdown.length ? detailRow.paymentBreakdown.map((entry, index) => (
                        <div key={`${entry.method}-${entry.reference}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="font-medium text-[#173152]">{entry.method}</p>
                            <p className="truncate text-xs text-[#52657e]">Account: {entry.account}</p>
                            <p className="truncate text-xs text-[#71819a]">Ref: {entry.reference || "No reference"}</p>
                          </div>
                          <p className="shrink-0 font-semibold text-[#173152]">{formatCurrency(entry.amount)}</p>
                        </div>
                      )) : <p className="px-4 py-4 text-sm text-[#71819a]">No payment breakdown recorded.</p>}
                    </div>
                  </section>
                  {isPaymentOutWorkspace ? (
                    <section className="overflow-hidden rounded-xl border border-[#dce6f2] bg-white">
                    <div className="flex items-center justify-between border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
                      <div>
                        <p className="font-semibold text-[#173152]">Bills Paid</p>
                        <p className="text-xs text-[#71819a]">Amount applied against each bill</p>
                      </div>
                      <span className="rounded-full bg-[#e8f8f1] px-2.5 py-1 text-xs font-semibold text-[#07875f]">{detailRow.billAllocations.length}</span>
                    </div>
                    <div className="divide-y divide-[#edf1f6]">
                      {detailRow.billAllocations.length ? detailRow.billAllocations.map((entry, index) => (
                        <div key={`${entry.billReference}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                          <p className="min-w-0 truncate font-medium text-[#2563eb]">{entry.billReference}</p>
                          <p className="shrink-0 font-semibold text-[#07875f]">{formatCurrency(entry.amount)}</p>
                        </div>
                      )) : <p className="px-4 py-4 text-sm text-[#71819a]">This payment was not applied to a bill.</p>}
                    </div>
                    </section>
                  ) : null}
                </div>
              ) : null}
              {detailRow.lineItems.length ? (
                <div className="mx-6 mb-4 overflow-hidden border-y border-[#e3ebf4]">
                  <div className="border-b border-[#e3ebf4] bg-[#fbfdff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#74839b]">
                    Items
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#fbfdff] text-[#74839b]">
                        <th className="border-b border-[#e3ebf4] px-4 py-2 text-left font-semibold">Item</th>
                        {section === "receipt-notes" ? (
                          <th className="border-b border-[#e3ebf4] px-4 py-2 text-left font-semibold">Warehouse</th>
                        ) : null}
                        <th className="border-b border-[#e3ebf4] px-4 py-2 text-right font-semibold">Qty</th>
                        <th className="border-b border-[#e3ebf4] px-4 py-2 text-right font-semibold">Rate</th>
                        <th className="border-b border-[#e3ebf4] px-4 py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRow.lineItems.map((item, index) => (
                        <tr key={`${item.itemName}-${index}`} className="border-b border-[#eef2f7] last:border-b-0">
                          <td className="px-4 py-2 text-[#173152]">{item.itemName || "Untitled item"}</td>
                          {section === "receipt-notes" ? (
                            <td className="px-4 py-2 text-[#173152]">
                              <div className="font-medium">{item.warehouseName}</div>
                              {item.warehouseCode ? (
                                <div className="text-[10px] font-normal text-[#7a8aa6]">{item.warehouseCode}</div>
                              ) : null}
                            </td>
                          ) : null}
                          <td className="px-4 py-2 text-right text-[#173152]">{formatNumber(item.quantity)}</td>
                          <td className="px-4 py-2 text-right text-[#173152]">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-4 py-2 text-right font-medium text-[#173152]">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 border-t border-[#e3e9f1] bg-[#fbfcfe] px-6 py-4">
                <Button type="button" className="rounded-2xl bg-primary text-white hover:bg-[#cf670f]" onClick={() => openVoucher(detailRow, "edit")}>
                  <Pencil className="h-4 w-4" />
                  Edit Voucher
                </Button>
                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => handleSinglePrint(detailRow)}>
                  <Printer className="h-5 w-5" />
                  Print
                </Button>
                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => void handleShareRow(detailRow)}>
                  <Share2 className="h-5 w-5" />
                  Share
                </Button>
                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => openVoucher(detailRow, "duplicate")}>
                  <Copy className="h-5 w-5" />
                  Duplicate
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={auditRow !== null} onOpenChange={(open) => (!open ? setAuditRow(null) : undefined)}>
        <DialogContent className="w-[min(94vw,640px)]">
          {auditRow ? (
            <div className="space-y-4">
              <DialogTitle className="text-2xl font-semibold text-[#132949]">Audit snapshot</DialogTitle>
              <DialogDescription className="text-sm text-[#61708a]">A quick trace for the selected purchase record using the currently available voucher metadata.</DialogDescription>
              <div className="grid md:grid-cols-2 md:gap-x-8">
                <DetailField label="Document" value={auditRow.documentNumber} emphasized />
                <DetailField label="Voucher Type" value={auditRow.sourceVoucherType} />
                <DetailField label="Status" value={auditRow.statusLabel} />
                <DetailField label="Created By" value={auditRow.createdBy} />
                <DetailField label="Date" value={formatDate(auditRow.documentDate)} />
                <DetailField label="Reference" value={auditRow.reference} />
              </div>
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => openSupplierLedger(auditRow)}>
                <BookOpen className="h-4 w-4" />
                Open Day Book Trail
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="left-auto right-0 top-0 h-screen w-[min(94vw,420px)] translate-x-0 translate-y-0 rounded-none border-l border-[#d8e1ee] p-0">
          <div className="flex h-full flex-col">
            <div className="border-b border-[#e3ebf4] px-5 py-5">
              <DialogTitle className="text-xl font-semibold text-[#132949]">{config.label} register settings</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-[#61708a]">Choose the information shown in this register and how many transactions appear on each page.</DialogDescription>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="rounded-2xl border border-[#e4ebf4] p-4">
                <div className="font-semibold text-[#132949]">Visible columns</div>
                <p className="mt-1 text-sm leading-5 text-[#61708a]">Show only the purchase information your team needs in the register.</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full justify-start rounded-xl"
                  onClick={() => {
                    setSettingsOpen(false);
                    setColumnsOpen(true);
                  }}
                >
                  <Columns3 className="h-4 w-4" />
                  Choose columns
                </Button>
              </div>
              <SettingToggle label="Show Created By" checked={showCreatedBy} onChange={setShowCreatedBy} description="Display who created each purchase document for review and accountability." />
              <label className="grid gap-2 text-sm text-[#4c5d78]">
                <span className="font-semibold text-[#132949]">Transactions per page</span>
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-11 rounded-2xl border border-[#f0c9a4] px-3 text-sm text-[#173152]">
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size} rows
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-2xl border border-[#e4ebf4] p-4">
                <div className="font-semibold text-[#132949]">Reset register view</div>
                <p className="mt-1 text-sm leading-5 text-[#61708a]">Clear saved filters and column choices, then restore the standard register layout.</p>
                <Button type="button" variant="outline" className="mt-4 w-full justify-start rounded-xl text-[#b03b3b]" onClick={handleResetRegisterView}>
                  <RotateCcw className="h-4 w-4" />
                  Reset filters and columns
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={columnsOpen} onOpenChange={setColumnsOpen}>
        <DialogContent className="w-[min(94vw,560px)]">
          <div className="space-y-4">
            <DialogTitle className="text-2xl font-semibold text-[#132949]">Column settings</DialogTitle>
            <DialogDescription className="text-sm text-[#61708a]">Turn columns on or off for the current purchase register view.</DialogDescription>
            <div className="grid gap-2 md:grid-cols-2">
              {columns
                .filter((column) => column.id !== "actions" && column.id !== "select")
                .map((column) => (
                  <label key={column.id} className="flex items-center justify-between rounded-2xl border border-[#e4ebf4] px-3 py-3 text-sm text-[#173152]">
                    <span>{column.label}</span>
                    <input
                      type="checkbox"
                      checked={columnVisibility[column.id]}
                      onChange={(event) =>
                        setColumnVisibility((current) => ({
                          ...current,
                          [column.id]: event.target.checked,
                        }))
                      }
                    />
                  </label>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={Boolean(expenseAccountDeleteTarget)}
        onOpenChange={(open) => (!expenseAccountDeleting && !open ? setExpenseAccountDeleteTarget(null) : undefined)}
        title={`Delete ${expenseAccountDeleteTarget?.name ?? "this expense account"}?`}
        description={
          expenseAccountDeleteTarget?.kind === "category"
            ? "This category can be deleted only when it has no ledger under it. Existing ledgers and transactions are never removed automatically."
            : "This ledger can be deleted only when it has no posting history. Posted expense transactions are never removed automatically."
        }
        confirmLabel={expenseAccountDeleting ? "Deleting..." : "Delete"}
        tone="danger"
        onConfirm={() => {
          if (!expenseAccountDeleting) {
            void deleteExpenseAccount();
          }
        }}
      />

      <ConfirmationDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={(open) => (!bulkDeleting ? setBulkDeleteDialogOpen(open) : undefined)}
        title={`Delete ${selectedRowIds.length} selected?`}
        description="Selected records will move to the Recycle Bin and can be restored later."
        confirmLabel={bulkDeleting ? "Deleting..." : "Delete"}
        onConfirm={() => {
          if (!bulkDeleting) {
            void handleBulkDeleteSelected();
          }
        }}
      />

      <ConfirmationDialog
        open={Boolean(deleteRowTarget)}
        onOpenChange={(open) => (!deletingRow && !open ? setDeleteRowTarget(null) : undefined)}
        title={`Delete ${deleteRowTarget?.documentNumber ?? "this document"}?`}
        description="This moves it to the Recycle Bin — it disappears from this list but can be restored later. If a receipt note or bill was already raised against it, delete that first."
        confirmLabel={deletingRow ? "Deleting..." : "Delete"}
        onConfirm={() => {
          if (!deletingRow) {
            void handleDeleteRow();
          }
        }}
      />

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="w-[min(94vw,520px)]">
          <div className="space-y-4">
            <DialogTitle className="text-2xl font-semibold text-[#132949]">{config.label} more menu</DialogTitle>
            <DialogDescription className="text-sm text-[#61708a]">Extra actions are kept compact here so the main toolbar stays practical.</DialogDescription>
            <div className="grid gap-2">
              <MoreActionButton icon={ReceiptText} label={`${config.label} Register`} onClick={() => openMoreAction("register")} />
              <MoreActionButton icon={ExcelIcon} label="Export Current View" onClick={() => openMoreAction("export")} />
              <MoreActionButton icon={Printer} label="Print Register" onClick={() => openMoreAction("print")} />
              <MoreActionButton icon={BookOpen} label="Open Day Book" onClick={() => openMoreAction("day-book")} />
              <MoreActionButton icon={Settings2} label="Settings" onClick={() => openMoreAction("settings")} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function renderCell({
  columnId,
  row,
  onOpenMenu,
  rowMenuOpen,
  rowActions,
  rowMenuRef,
}: {
  columnId: ColumnId;
  row: PurchaseRow;
  onOpenMenu: () => void;
  rowMenuOpen: boolean;
  rowActions: RowAction[];
  rowMenuRef: RefObject<HTMLDivElement | null>;
}) {
  if (columnId === "date") {
    return formatDate(row.documentDate);
  }

  if (columnId === "documentNumber") {
    return <span className="font-semibold text-[#1561b3]">{row.documentNumber}</span>;
  }

  if (columnId === "partyName") {
    return (
      <div>
        <div className="font-medium text-[#173152]">{row.partyName}</div>
        <div className="text-xs text-[#70809a]">{row.reference}</div>
      </div>
    );
  }

  if (columnId === "reference") {
    return row.reference;
  }

  if (columnId === "paymentMethod") {
    return row.paymentMethod;
  }

  if (columnId === "paymentAccount") {
    return row.paymentAccount;
  }

  if (columnId === "amount") {
    return <span className="font-medium">{formatCurrency(row.amount)}</span>;
  }

  if (columnId === "paidAmount") {
    return formatCurrency(row.paidAmount);
  }

  if (columnId === "balance") {
    return formatCurrency(row.balance);
  }

  if (columnId === "status") {
    return <DocumentStatusBadge label={row.statusLabel} tone={statusTone(row.statusLabel)} />;
  }

  if (columnId === "createdBy") {
    return row.createdBy;
  }

  if (columnId === "expenseCategory") {
    return row.expenseCategory;
  }

  if (columnId === "tax") {
    return formatCurrency(row.tax);
  }

  if (columnId === "expectedDelivery") {
    return formatDate(row.expectedDelivery);
  }

  if (columnId === "receivedValue") {
    return formatCurrency(row.receivedValue);
  }

  if (columnId === "remaining") {
    return formatCurrency(row.remaining);
  }

  if (columnId === "category") {
    return row.category;
  }

  if (columnId === "type") {
    return row.type;
  }

  if (columnId === "actions") {
    return (
      <div className="relative flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl border-[#d7e1ee]" title="View details" onClick={() => rowActions[0]?.onClick()}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl border-[#d7e1ee]" title="Edit voucher" onClick={() => rowActions[1]?.onClick()}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl border-[#d7e1ee]" title="Print voucher" onClick={() => rowActions[2]?.onClick()}>
          <Printer className="h-5 w-5" />
        </Button>
        <Button type="button" data-row-menu-trigger variant="outline" size="icon" className="h-9 w-9 rounded-xl border-[#d7e1ee]" title="More row actions" onClick={onOpenMenu}>
          <MoreVertical className="h-4 w-4" />
        </Button>
        {rowMenuOpen ? (
          <div ref={rowMenuRef} className="absolute right-0 top-11 z-20 min-w-[210px] rounded-2xl border border-[#d7e1ee] bg-white p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
            {rowActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[#f7faff]",
                  action.tone === "danger" ? "text-[#c63c3c]" : "text-[#24364f]",
                )}
                onClick={action.onClick}
              >
                <action.icon className="h-4 w-4" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}

function DetailField({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-5 border-b border-[#e8edf4] py-3">
      <div className="text-[12px] font-medium text-[#74839b]">{label}</div>
      <div className={cn("text-right text-sm text-[#173152]", emphasized ? "font-semibold" : "font-medium")}>{value}</div>
    </div>
  );
}

function SettingToggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-[#e4ebf4] px-4 py-4">
      <div>
        <div className="font-semibold text-[#132949]">{label}</div>
        <div className="mt-1 text-sm text-[#61708a]">{description}</div>
      </div>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function MoreActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="flex items-center gap-3 rounded-2xl border border-[#e4ebf4] px-4 py-3 text-left text-sm text-[#173152] transition hover:bg-[#f7faff]" onClick={onClick}>
      <Icon className="h-4 w-4 text-[#1f69b4]" />
      <span>{label}</span>
    </button>
  );
}
