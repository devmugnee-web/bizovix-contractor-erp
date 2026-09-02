"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Columns3,
  Copy,
  Download,
  Eye,
  Filter,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Settings2,
  Share2,
  Trash2,
  Truck,
  Undo2,
  UploadCloud,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ExcelIcon, WhatsAppIcon } from "@/components/shared/brand-icons";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { TablePagination } from "@/components/shared/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { evaluateMasterDataReadiness } from "@/lib/master-data-readiness";
import { AppDateInput } from "@/components/shared/app-date-input";
import { MasterDataReadinessGuard } from "@/components/shared/master-data-readiness-guard";
import { MoneyAccountSelector } from "@/components/shared/money-account-selector";
import { Input } from "@/components/ui/input";
import { appConfig } from "@/config/app";
import { buildSalesInvoiceRoute, buildSalesOrderEditRoute, buildSalesStartRoute, buildSalesWorkspaceRoute, buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { getSalesWorkspaceSection, salesWorkspaceSections, type SalesWorkspaceSection } from "@/config/sales";
import { useDayBookQuery, useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useColumnResize } from "@/hooks/use-column-resize";
import { useSessionContext } from "@/hooks/use-session-context";
import { useUiStore } from "@/stores/ui-store";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { getVoucherTemplate } from "@/lib/accounting";
import { openMailComposer, openWhatsAppShare, shareInvoiceDocument, shareText } from "@/lib/app-actions";
import { buildInvoiceFile, buildInvoicePreviewDataUrl, downloadCsv, downloadInvoiceJpg, downloadInvoicePdf, openInvoicePdf, printInvoice, type InvoiceExportPayload } from "@/lib/download";
import { getInventoryOptions, getPartyOptions } from "@/lib/erp-data";
import { formatAmount, formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { moneyToMinorUnits, roundMoney, sumMoney } from "@/lib/money";
import { applyRoundOff, readRoundOffPreference } from "@/lib/round-off";
import { getNextPickerIndex, isPickerNavigationKey } from "@/lib/picker-keyboard";
import { openPrintWindow, printWindowWhenReady } from "@/lib/print";
import { cn } from "@/lib/utils";
import { getLatestPostingMonthRange } from "@/lib/posting-date-range";
import {
  buildAssignedItemCode,
  createApiInventoryItem,
  listApiInventoryCategories,
  type InventoryTaxonomyEntry,
} from "@/features/screens/inventory-screen";
import { apiRequest } from "@/services/api-client";
import { listWarehouses, listWarehouseStock, type WarehouseRecord } from "@/services/warehouse.service";
import { readDataset, writeDataset } from "@/services/browser-dataset";
import { readCompanyProfile, writeCompanyProfile } from "@/services/company-profile";
import { moveVoucherToRecycleBin } from "@/services/recycle-bin";
import {
  defaultWorkflowSettings,
  evaluateWorkflowRootAccess,
  type WorkflowRootKind,
  type WorkflowSettingsLoadState,
} from "@/services/workflow-settings.service";
import { createVoucher, deleteVoucher, getVoucher, reverseVoucher, updateVoucher } from "@/services/voucher.service";
import { getLoyaltyBalance, getLoyaltySettings, type LoyaltySettings } from "@/services/loyalty.service";
import type { PartyRecord, VoucherFormInput, VoucherRecord, VoucherStatus, VoucherType } from "@/types/domain";

type SalesFilterRange = "last-posting-month" | "today" | "this-month" | "last-30" | "this-year" | "all" | "custom";

const salesFilterRangeLabels: Record<SalesFilterRange, string> = {
  "last-posting-month": "Last Posting Month",
  today: "Today",
  "this-month": "This Month",
  "last-30": "Last 30 Days",
  "this-year": "This Year",
  all: "All Time",
  custom: "Custom",
};
type PaymentState = "paid" | "due" | "partial";
type PaymentStateFilter = "all" | PaymentState;
type SavedFilterPreset = "all" | "today" | "due" | "posted" | "collections";
type SortKey =
  | "createdAt"
  | "documentDate"
  | "documentNumber"
  | "partyName"
  | "transactionLabel"
  | "paymentMethod"
  | "amount"
  | "balance"
  | "status"
  | "createdBy";
type ColumnId =
  | "select"
  | "documentDate"
  | "documentNumber"
  | "partyName"
  | "transactionLabel"
  | "paymentMethod"
  | "amount"
  | "balance"
  | "status"
  | "createdBy"
  | "actions";

type FilterableColumnId = Exclude<ColumnId, "select" | "actions">;
type ColumnFilterOperator = "contains" | "equals" | "starts-with";

type SalesWorkspaceFilters = {
  searchQuery: string;
  status: "all" | VoucherStatus;
  range: SalesFilterRange;
  customStartDate: string;
  customEndDate: string;
  customerQuery: string;
  paymentStatus: PaymentStateFilter;
  createdByQuery: string;
  workflow: "all" | string;
  savedFilter: SavedFilterPreset;
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

type InlineEditFormState = {
  voucherId: string;
  voucherType: VoucherType;
  voucherDate: string;
  reference: string;
  partyName: string;
  narration: string;
  settlementMode: "cash" | "bank" | "accounts-payable";
  status: VoucherStatus;
  sourceVoucher: VoucherRecord;
};

type SalesCreateLineItem = {
  id: string;
  /** Exact upstream document line used by partial conversion validation. */
  sourceInventoryLineId?: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  /** Unit of measure carried over from the inventory master for POS display. */
  unit?: string;
  /** Per-line POS discount. Stored as a percent and folded into the saved unit price. */
  discountPercent?: string;
};

type SalesCreateFormState = {
  warehouseId: string;
  partyName: string;
  phoneNo: string;
  billingAddress: string;
  shippingAddress: string;
  voucherDate: string;
  reference: string;
  settlementMode: "cash" | "bank" | "accounts-payable";
  moneyAccountId: string;
  moneyAccountName: string;
  moneyAccountType: "CASH" | "BANK" | "MFS";
  condition: string;
  narration: string;
  status: VoucherStatus;
  discount: string;
  loyaltyPoints: string;
  receivedAmount: string;
  items: SalesCreateLineItem[];
  amount: string;
  /** Payment-In only: which Sales Invoice this Receipt is collecting against —
   * becomes the saved voucher's sourceVoucherId, the real link real Due/Paid
   * tracking is computed from (see computeInvoiceDue). */
  appliedInvoiceId: string | null;
  /** POS-only bill extras: delivery/packing charges and rounding. */
  additionalCharges?: string;
  roundOff?: boolean;
};

type PreviewDialogState = {
  title: string;
  subtitle: string;
  payload: InvoiceExportPayload;
  imageSrc: string;
  sourceVoucher: VoucherRecord;
};

type PreviewTheme = "tally" | "modern";

type InventoryOptionRecord = {
  itemCode: string;
  itemName: string;
  alias?: string;
  category: string;
  unit: string;
  qty: number;
  rate: number;
  reorderLevel: number;
  alternateUnit?: string;
  alternateUnitConversion?: number;
  expiryDate?: string | null;
};

type SalesDocumentRow = {
  id: string;
  sourceId: string;
  sourceVoucherType: VoucherType;
  openVoucherType: VoucherType;
  openMode: "edit" | "duplicate";
  documentNumber: string;
  partyName: string;
  documentDate: string;
  /** When the underlying record was actually created — used only to break ties when
   * several rows share the same documentDate, so the most recently added shows first. */
  createdAt: string;
  amount: number;
  balance: number;
  status: VoucherStatus;
  workflow: string;
  transactionLabel: string;
  paymentMethod: string;
  paymentStatus: PaymentState;
  /** Quotation/Proforma/Sale Order have no financial effect at all, and a Delivery
   * Note has a stock effect but no invoice yet — none of those have a real "paid"
   * concept, so the Status column shows this honest workflow label for them instead
   * of a fabricated Paid/Partial/Unpaid derived from a fake balance. Null for
   * sections (Invoices, Payment-In, Credit Note) that keep the existing rendering. */
  workflowStatusLabel: string | null;
  createdBy: string;
  /** Product-wise breakdown (item, qty, rate, line total) shown in the row-actions dialog. */
  lineItems: Array<{ itemName: string; quantity: number; unitPrice: number; total: number }>;
  /** Sale Order tracking: this order's own total quantity. Delivery Note rows carry
   * their source order's total instead, so "X of Y" always reads against the order. */
  orderedQty: number;
  /** Sale Order rows: total delivered so far across every delivery note raised against
   * it. Delivery Note rows: this note's own quantity. */
  deliveredQty: number;
  /** Delivery Note rows only: the running total delivered across every delivery note
   * raised against the same source order, so a partial delivery still shows the
   * overall picture, not just this one slice. */
  cumulativeDeliveredQty: number;
  /** Quantity from this Delivery Note already included in Sales Invoices. */
  invoicedQty: number;
};

type SalesWorkspaceSummary = {
  title: string;
  documentCount: number;
  totalAmount: number;
  primaryLabel: string;
  primaryValue: number;
  secondaryLabel: string;
  secondaryValue: number;
};

const defaultFilters: SalesWorkspaceFilters = {
  searchQuery: "",
  status: "all",
  range: "last-posting-month",
  customStartDate: "",
  customEndDate: "",
  customerQuery: "",
  paymentStatus: "all",
  createdByQuery: "",
  workflow: "all",
  savedFilter: "all",
};

function columnVisibilityStorageKey(section: SalesWorkspaceSection) {
  return `sales-workspace:${section}:column-visibility`;
}

function filtersStorageKey(section: SalesWorkspaceSection) {
  return `sales-workspace:${section}:filters`;
}

function loadFilters(section: SalesWorkspaceSection): SalesWorkspaceFilters {
  if (typeof window === "undefined") {
    return defaultFilters;
  }

  try {
    const raw = window.localStorage.getItem(filtersStorageKey(section));
    if (!raw) {
      return defaultFilters;
    }

    const parsed = JSON.parse(raw) as Partial<SalesWorkspaceFilters>;
    return { ...defaultFilters, ...parsed };
  } catch {
    return defaultFilters;
  }
}

// Shared with the Purchase Order item picker (voucher-entry-screen.tsx) so the
// preference is one app-wide default, not per-screen — suppliers often call an
// item by a different name than what it's sold under, so staff need to search
// by whichever name matches how they're thinking about it in the moment.
const ITEM_PICKER_NAME_MODE_KEY = "bizovix:item-picker-name-mode:v1";

function loadItemPickerNameMode(): "name" | "alias" {
  if (typeof window === "undefined") {
    return "name";
  }

  return window.localStorage.getItem(ITEM_PICKER_NAME_MODE_KEY) === "alias" ? "alias" : "name";
}

function loadColumnVisibility(section: SalesWorkspaceSection): Record<ColumnId, boolean> {
  if (typeof window === "undefined") {
    return defaultColumnVisibility;
  }

  try {
    const raw = window.localStorage.getItem(columnVisibilityStorageKey(section));
    if (!raw) {
      return defaultColumnVisibility;
    }

    const parsed = JSON.parse(raw) as Partial<Record<ColumnId, boolean>>;
    return { ...defaultColumnVisibility, ...parsed };
  } catch {
    return defaultColumnVisibility;
  }
}

const defaultColumnVisibility: Record<ColumnId, boolean> = {
  select: false,
  documentDate: true,
  documentNumber: true,
  partyName: true,
  transactionLabel: true,
  paymentMethod: true,
  amount: true,
  balance: true,
  status: true,
  createdBy: false,
  actions: true,
};

const defaultSalesColumnWidths: Record<ColumnId, number> = {
  select: 44,
  documentDate: 84,
  documentNumber: 120,
  partyName: 150,
  transactionLabel: 120,
  paymentMethod: 140,
  amount: 96,
  balance: 96,
  status: 84,
  createdBy: 140,
  actions: 64,
};

const accentStyles = {
  rose: {
    soft: "bg-[#fff1f2]",
    softBorder: "border-[#f3d7df]",
    text: "text-[#be3558]",
    strong: "bg-[#be3558] text-white",
  },
  amber: {
    soft: "bg-[#fff8e7]",
    softBorder: "border-[#f0dfb4]",
    text: "text-[#b66a10]",
    strong: "bg-[#d68410] text-white",
  },
  sky: {
    soft: "bg-[#eef7ff]",
    softBorder: "border-[#d2e8fb]",
    text: "text-[#236db6]",
    strong: "bg-[#236db6] text-white",
  },
  emerald: {
    soft: "bg-[#edfdf4]",
    softBorder: "border-[#cfead8]",
    text: "text-[#177a48]",
    strong: "bg-[#177a48] text-white",
  },
  indigo: {
    soft: "bg-[#eef2ff]",
    softBorder: "border-[#d8defe]",
    text: "text-[#4d61d6]",
    strong: "bg-[#4d61d6] text-white",
  },
  orange: {
    soft: "bg-[#fff4eb]",
    softBorder: "border-[#f4d8c3]",
    text: "text-[#c76925]",
    strong: "bg-[#c76925] text-white",
  },
  red: {
    soft: "bg-[#fff1f1]",
    softBorder: "border-[#f4d4d4]",
    text: "text-[#c43f3f]",
    strong: "bg-[#c43f3f] text-white",
  },
  teal: {
    soft: "bg-[#ecfffc]",
    softBorder: "border-[#cceae4]",
    text: "text-[#167e6b]",
    strong: "bg-[#167e6b] text-white",
  },
} as const;
const salesPageSizeOptions = [10, 25, 50, 100];
const createPageCloseAnimationMs = 200;
const previewThemeSections: Array<{
  title: string;
  items: Array<{ id: PreviewTheme; label: string; hint: string }>;
}> = [
  {
    title: "Classic Themes",
    items: [{ id: "tally", label: "Default Theme", hint: "Clean ruled paper preview like Bizovix." }],
  },
];

const workflowStates: Record<SalesWorkspaceSection, string[]> = {
  invoices: ["Raised", "Waiting", "Collected", "Archived"],
  quotation: ["Drafted", "Shared", "Negotiating", "Won"],
  proforma: ["Prepared", "Sent", "Approved", "Converted"],
  "payment-in": ["Received", "Posted", "Matched", "Closed"],
  "sale-order": ["Confirmed", "Packed", "Ready", "Converted"],
  "delivery-challan": ["Prepared", "Dispatched", "Delivered", "Billed"],
  "credit-note": ["Requested", "Reviewed", "Approved", "Issued"],
  pos: ["Counter", "Printed", "Settled", "Closed"],
};

function buildQueryWindow(range: SalesFilterRange, customStartDate?: string, customEndDate?: string) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startDate = new Date(today);

  if (range === "today") {
    return { from: end, to: end };
  }

  if (range === "custom" || range === "last-posting-month") {
    const from = customStartDate || end;
    const to = customEndDate || end;
    // A user can type the two fields in either order while filling them in —
    // querying with a start after the end would just come back empty, so swap
    // rather than surprise them with a silently blank table.
    return from <= to ? { from, to } : { from: to, to: from };
  }

  if (range === "this-month") {
    startDate.setDate(1);
  } else if (range === "last-30") {
    startDate.setDate(today.getDate() - 29);
  } else if (range === "this-year") {
    startDate.setMonth(0, 1);
  } else {
    startDate.setFullYear(today.getFullYear() - 2);
  }

  return {
    from: startDate.toISOString().slice(0, 10),
    to: end,
  };
}

/**
 * A Sales Invoice's real outstanding balance: its own amount minus every real
 * Receipt posted against it (linked via sourceVoucherId — the same field the
 * Order->Delivery Note->Invoice chain already uses). Cancelled receipts don't
 * count. Not an invoice (or the invoice not found) means nothing to collect.
 */
export function computeInvoiceDue(invoice: VoucherRecord, allRecords: VoucherRecord[], excludeReceiptId?: string | null) {
  if (invoice.voucherType !== "sales" || invoice.documentKind) {
    return 0;
  }

  const recordedPaidAmount = Math.max(0, roundMoney(Number(invoice.paidAmount || 0)));
  // Older cash/bank invoices were posted to the correct money ledger but saved
  // paidAmount as zero during Delivery Note -> Invoice conversion. Preserve the
  // accounting truth for those rows: a non-credit invoice with a settlement
  // debit was collected at creation even when that legacy summary field is zero.
  const hasPostedMoneySettlement =
    invoice.settlementMode !== "accounts-payable" &&
    (invoice.lines ?? []).some(
      (line) =>
        Number(line.debit || 0) > 0 &&
        /cash|bank|mfs|mobile financial|cheque|card|settlement/i.test(`${line.ledger} ${line.description ?? ""}`),
    );
  const collectedAtCreation = recordedPaidAmount > 0
    ? recordedPaidAmount
    : hasPostedMoneySettlement
      ? Number(invoice.amount || 0)
      : 0;

  const directSource = invoice.sourceVoucherId
    ? allRecords.find((record) => record.id === invoice.sourceVoucherId)
    : undefined;
  const sourceOrder = directSource?.documentKind === "sale-order"
    ? directSource
    : directSource?.documentKind === "delivery-note" && directSource.sourceVoucherId
      ? allRecords.find((record) => record.id === directSource.sourceVoucherId && record.documentKind === "sale-order")
      : undefined;
  const sourceOrderId = sourceOrder?.id ?? null;
  const linkedAdvanceReceipts = sumMoney(allRecords
    .filter(
      (record) =>
        record.voucherType === "receipt" &&
        (record.sourceVoucherId === invoice.id || Boolean(sourceOrderId && record.sourceVoucherId === sourceOrderId)) &&
        record.status === "posted" &&
        record.id !== excludeReceiptId,
    )
    .map((record) => Number(record.amount || 0)));
  // Some older/local records kept the advance summary on the Sales Order but
  // did not persist the companion Receipt link. Use it only as a fallback so a
  // real linked receipt is never counted twice.
  const orderAdvanceFallback = moneyToMinorUnits(linkedAdvanceReceipts) <= 0
    ? Math.max(0, roundMoney(Number(sourceOrder?.paidAmount || 0)))
    : 0;
  const collected = sumMoney([collectedAtCreation, linkedAdvanceReceipts, orderAdvanceFallback]);

  const returned = sumMoney(allRecords
    .filter(
      (record) =>
        record.voucherType === "credit-note" &&
        record.sourceVoucherId === invoice.id &&
        record.status === "posted" &&
        record.id !== excludeReceiptId,
    )
    .map((record) => Number(record.amount || 0)));

  return Math.max(0, roundMoney(Number(invoice.amount || 0) - returned - collected));
}

function deriveBalance(record: VoucherRecord, section: SalesWorkspaceSection, allRecords: VoucherRecord[]) {
  if (section === "payment-in") {
    return 0;
  }

  if (section === "credit-note") {
    return 0;
  }

  if (section === "invoices") {
    return computeInvoiceDue(record, allRecords);
  }

  if (section === "sale-order") {
    return Math.max(0, roundMoney(record.amount - Number(record.paidAmount || 0)));
  }

  if (record.status === "posted") {
    return 0;
  }

  if (record.status === "approved") {
    return roundMoney(record.amount * 0.12);
  }

  return roundMoney(record.amount * 0.38);
}

export function derivePaymentMethod(record: VoucherRecord, section: SalesWorkspaceSection, allRecords: VoucherRecord[] = []) {
  if (section === "payment-in") {
    return record.settlementMode === "cash" ? "Cash Receipt" : "Bank Receipt";
  }

  if (section === "delivery-challan") {
    // New Delivery Notes inherit this from their Sale Order. Older rows may not
    // have stored it, so follow sourceVoucherId back to the order instead of
    // showing the unhelpful hardcoded "Dispatch" label.
    const sourceOrder = record.sourceVoucherId
      ? allRecords.find((entry) => entry.id === record.sourceVoucherId && entry.documentKind === "sale-order")
      : undefined;
    const paymentOwner = sourceOrder ?? record;
    const linkedReceipts = allRecords.filter(
      (entry) => entry.voucherType === "receipt" && entry.sourceVoucherId === paymentOwner.id && entry.status === "posted",
    );
    const actualLedgers = Array.from(new Set(linkedReceipts.flatMap((receipt) =>
      (receipt.lines ?? [])
        .filter((line) => Number(line.debit || 0) > 0 && line.ledger.trim().toLowerCase() !== paymentOwner.partyName.trim().toLowerCase())
        .map((line) => line.ledger.trim())
        .filter(Boolean),
    )));
    if (actualLedgers.length) return actualLedgers.join(" + ");
    // A legacy order can carry a stale settlement flag even though no advance
    // was received. This column reports the actual payment result: without a
    // linked receipt or a positive paid amount, both the order and its Delivery
    // Note are still due.
    if (Number(paymentOwner.paidAmount || 0) <= 0) return "Due";
    const settlementMode = paymentOwner.settlementMode ?? record.settlementMode;
    return settlementMode === "accounts-payable" ? "Credit" : settlementMode === "bank" ? "Bank/MFS" : "Cash";
  }

  if (section === "invoices") {
    const sourceDelivery = record.sourceVoucherId
      ? allRecords.find((entry) => entry.id === record.sourceVoucherId && entry.documentKind === "delivery-note")
      : undefined;
    const sourceOrder = sourceDelivery?.sourceVoucherId
      ? allRecords.find((entry) => entry.id === sourceDelivery.sourceVoucherId && entry.documentKind === "sale-order")
      : undefined;
    const paymentSourceIds = new Set([record.id, sourceOrder?.id].filter((id): id is string => Boolean(id)));
    const linkedReceipts = allRecords.filter(
      (entry) => entry.voucherType === "receipt" && Boolean(entry.sourceVoucherId && paymentSourceIds.has(entry.sourceVoucherId)) && entry.status === "posted",
    );
    const actualLedgers = Array.from(new Set(linkedReceipts.flatMap((receipt) =>
      (receipt.lines ?? [])
        .filter((line) => Number(line.debit || 0) > 0 && line.ledger.trim().toLowerCase() !== record.partyName.trim().toLowerCase())
        .map((line) => line.ledger.trim())
        .filter(Boolean),
    )));
    if (actualLedgers.length) return actualLedgers.join(" + ");

    const invoiceMoneyLedgers = Array.from(new Set((record.lines ?? [])
      .filter((line) => Number(line.debit || 0) > 0 && line.ledger.trim().toLowerCase() !== record.partyName.trim().toLowerCase())
      .map((line) => line.ledger.trim())
      .filter(Boolean)));
    if (invoiceMoneyLedgers.length) return invoiceMoneyLedgers.join(" + ");
    return computeInvoiceDue(record, allRecords) > 0 ? "Due" : "Paid";
  }

  if (section === "quotation") {
    return "Follow-up";
  }

  if (section === "proforma") {
    return "Advance";
  }

  if (section === "sale-order") {
    // Payment Type on this document is a binary choice — Credit, or an Advance
    // paid via Cash/Bank/MFS — so anything other than "accounts-payable" is a
    // paid advance, not just a literal cash settlement.
    const linkedReceipts = allRecords.filter(
      (entry) => entry.voucherType === "receipt" && entry.sourceVoucherId === record.id && entry.status === "posted",
    );
    const actualLedgers = Array.from(new Set(linkedReceipts.flatMap((receipt) =>
      (receipt.lines ?? [])
        .filter((line) => Number(line.debit || 0) > 0 && line.ledger.trim().toLowerCase() !== record.partyName.trim().toLowerCase())
        .map((line) => line.ledger.trim())
        .filter(Boolean),
    )));
    if (actualLedgers.length) return actualLedgers.join(" + ");
    if (Number(record.paidAmount || 0) <= 0) return "Due";
    return record.settlementMode === "accounts-payable" ? "Credit" : record.settlementMode === "bank" ? "Bank/MFS" : "Cash";
  }

  if (section === "credit-note") {
    return record.settlementMode === "accounts-payable" ? "Credit" : "Cash";
  }

  if (section === "pos") {
    return record.settlementMode === "cash" ? "Counter Cash" : "Counter Card";
  }

  return record.settlementMode === "cash" ? "Cash" : "On Account";
}

function deriveTransactionLabel(section: SalesWorkspaceSection) {
  if (section === "payment-in") {
    return "Payment-In";
  }

  if (section === "quotation") {
    return "Estimate";
  }

  if (section === "proforma") {
    return "Proforma";
  }

  if (section === "sale-order") {
    return "Sale Order";
  }

  if (section === "delivery-challan") {
    return "Delivery";
  }

  if (section === "credit-note") {
    return "Credit Note";
  }

  if (section === "pos") {
    return "POS";
  }

  return "Sale";
}

function PosStatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "teal" | "blue" | "green" | "amber" | "slate";
}) {
  const toneClasses =
    tone === "teal"
      ? "border-[#bfe4e2] bg-[#effaf9]"
      : tone === "blue"
        ? "border-[#cfe0f7] bg-[#f2f7ff]"
        : tone === "green"
          ? "border-[#c6e9d4] bg-[#f1fbf5]"
          : tone === "amber"
            ? "border-[#f3dcb4] bg-[#fff8ec]"
            : "border-[#dbe3ee] bg-[#f7f9fc]";

  return (
    <div className={cn("min-w-0 rounded-2xl border px-4 py-3", toneClasses)}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f7d95]">{label}</div>
      <div className="mt-1 truncate text-[1.5rem] font-semibold leading-tight text-[#203252]">{value}</div>
      <div className="mt-0.5 truncate text-[12px] text-[#7a85a0]">{note}</div>
    </div>
  );
}

function buildSalesSummary(rows: SalesDocumentRow[], section: SalesWorkspaceSection): SalesWorkspaceSummary {
  const totalAmount = sumMoney(rows.map((row) => row.amount));
  const outstandingAmount = sumMoney(rows.map((row) => row.balance));
  const settledAmount = sumMoney(rows.map((row) => Math.max(0, roundMoney(row.amount - row.balance))));
  const sumByWorkflow = (workflows: string[]) =>
    sumMoney(rows.filter((row) => workflows.includes(row.workflow)).map((row) => row.amount));
  const sumByPaymentMethod = (needle: string) =>
    sumMoney(rows.filter((row) => row.paymentMethod.toLowerCase().includes(needle)).map((row) => row.amount));

  if (section === "quotation") {
    const convertedAmount = sumByWorkflow(["Won"]);
    return {
      title: "Total Quotations",
      documentCount: rows.length,
      totalAmount,
      primaryLabel: "Converted",
      primaryValue: convertedAmount,
      secondaryLabel: "Open",
      secondaryValue: Math.max(0, roundMoney(totalAmount - convertedAmount)),
    };
  }

  if (section === "proforma") {
    const approvedAmount = sumByWorkflow(["Approved", "Converted"]);
    return {
      title: "Total Proforma",
      documentCount: rows.length,
      totalAmount,
      primaryLabel: "Approved",
      primaryValue: approvedAmount,
      secondaryLabel: "Open",
      secondaryValue: Math.max(0, roundMoney(totalAmount - approvedAmount)),
    };
  }

  if (section === "payment-in") {
    const cashAmount = sumByPaymentMethod("cash");
    return {
      title: "Total Collections",
      documentCount: rows.length,
      totalAmount,
      primaryLabel: "Cash",
      primaryValue: cashAmount,
      secondaryLabel: "Bank",
      secondaryValue: Math.max(0, roundMoney(totalAmount - cashAmount)),
    };
  }

  if (section === "sale-order") {
    const readyAmount = sumByWorkflow(["Ready", "Converted"]);
    return {
      title: "Total Orders",
      documentCount: rows.length,
      totalAmount,
      primaryLabel: "Ready",
      primaryValue: readyAmount,
      secondaryLabel: "Open",
      secondaryValue: Math.max(0, roundMoney(totalAmount - readyAmount)),
    };
  }

  if (section === "delivery-challan") {
    const deliveredAmount = sumByWorkflow(["Delivered", "Billed"]);
    return {
      title: "Total Challans",
      documentCount: rows.length,
      totalAmount,
      primaryLabel: "Delivered",
      primaryValue: deliveredAmount,
      secondaryLabel: "Pending",
      secondaryValue: Math.max(0, roundMoney(totalAmount - deliveredAmount)),
    };
  }

  if (section === "credit-note") {
    const issuedAmount = sumByWorkflow(["Approved", "Issued"]);
    return {
      title: "Total Credit Notes",
      documentCount: rows.length,
      totalAmount,
      primaryLabel: "Issued",
      primaryValue: issuedAmount,
      secondaryLabel: "Open",
      secondaryValue: Math.max(0, roundMoney(totalAmount - issuedAmount)),
    };
  }

  if (section === "pos") {
    const settledPosAmount = sumByWorkflow(["Settled", "Closed"]);
    return {
      title: "Total POS Sales",
      documentCount: rows.length,
      totalAmount,
      primaryLabel: "Settled",
      primaryValue: settledPosAmount,
      secondaryLabel: "Open",
      secondaryValue: Math.max(0, roundMoney(totalAmount - settledPosAmount)),
    };
  }

  return {
    title: "Total Invoices",
    documentCount: rows.length,
    totalAmount,
    primaryLabel: "Received",
    primaryValue: settledAmount,
    secondaryLabel: "Due",
    secondaryValue: outstandingAmount,
  };
}

function derivePaymentState(amount: number, balance: number): PaymentState {
  if (balance <= 0) {
    return "paid";
  }

  if (balance < amount) {
    return "partial";
  }

  return "due";
}

function buildDocumentNumber(record: VoucherRecord, section: SalesWorkspaceSection, prefix: string) {
  if (section === "credit-note") {
    return record.voucherNumber;
  }
  const base = (record.reference?.trim() || record.voucherNumber).replaceAll("/", "-");
  // Sales Orders and Delivery Notes (like Invoices) are created with a fully-formed,
  // correctly prefixed voucher number already (see buildAutoInvoiceNumber) —
  // prepending the section prefix again here would double it up (e.g. "SO-SO-...",
  // "DC-DC-...").
  if (
    section === "invoices" ||
    ((section === "sale-order" || section === "delivery-challan") && base.toUpperCase().startsWith(`${prefix.toUpperCase()}-`))
  ) {
    return base;
  }
  return `${prefix}-${base}`;
}

/** Quotation/Proforma/Sale Order are pure planning documents with no financial
 * posting, and a Delivery Note has moved stock but hasn't been billed yet — none
 * of those have a real "paid" balance, so this returns an honest workflow label
 * for them (or null, to keep the existing Paid/Partial/Unpaid rendering for
 * Invoices/Payment-In/Credit Note). "Converted"/"Invoiced" is real: it's true only
 * when some other record in this workspace's day-book actually points back at this
 * one via sourceVoucherId. */
function deriveWorkflowStatusLabel(
  record: VoucherRecord,
  section: SalesWorkspaceSection,
  hasDownstreamRecord: boolean,
  deliveredQty = 0,
  orderedQty = 0,
  invoicedQty = 0,
) {
  if (section === "credit-note") {
    if (record.status === "cancelled") return "Cancelled";
    if (record.status === "draft") return "Draft";
    if (record.status === "pending") return "Pending Approval";
    return "Applied";
  }

  // A Receipt settles cash on the spot — it never carries its own outstanding
  // balance, so the generic Paid/Partial/Unpaid derivation below always reads
  // "Paid" and tells the operator nothing. Its lifecycle status is what
  // actually varies from row to row.
  if (section === "payment-in") {
    if (record.status === "cancelled") return "Cancelled";
    if (record.status === "reversed") return "Reversed";
    if (record.status === "draft") return "Draft";
    if (record.status === "pending") return "Pending Approval";
    return "Received";
  }

  if (section !== "quotation" && section !== "proforma" && section !== "sale-order" && section !== "delivery-challan") {
    return null;
  }

  if (record.status === "cancelled") {
    return "Cancelled";
  }

  if (section === "delivery-challan") {
    if (orderedQty <= 0) return hasDownstreamRecord ? "Invoiced" : "Sales Pending";
    if (orderedQty > 0 && invoicedQty >= orderedQty) return "Invoiced";
    return invoicedQty > 0 || hasDownstreamRecord ? "Partially Invoiced" : "Sales Pending";
  }

  if (section === "sale-order") {
    // A single downstream delivery note used to mean "fully delivered" regardless of
    // how much it actually covered — a 50-of-150 partial delivery incorrectly showed
    // "Delivered" and closed off further conversion. Compare the real quantities instead.
    if (orderedQty <= 0) {
      return hasDownstreamRecord ? "Delivered" : "Pending to Delivery";
    }

    if (deliveredQty <= 0) {
      return "Pending to Delivery";
    }

    return deliveredQty >= orderedQty ? "Delivered" : "Partially Delivered";
  }

  return hasDownstreamRecord ? "Converted" : "Open";
}

/** Mirrors matchesPurchaseDocumentKind on the Purchase side: Quotation, Proforma,
 * Sale Order, and Delivery Challan are each their own document stage and must only
 * list records actually created as that stage, not every "sales" voucher. A record
 * with no documentKind (legacy data, or a plain Invoice/POS sale) is treated as
 * belonging to Invoices, matching Purchase's "null defaults to the final stage"
 * convention for Bills. */
function matchesSalesDocumentKind(record: VoucherRecord, section: SalesWorkspaceSection) {
  if (record.voucherType !== "sales") {
    return true;
  }

  const kind = record.documentKind ?? null;
  if (section === "quotation") {
    return kind === "quotation";
  }

  if (section === "proforma") {
    return kind === "proforma";
  }

  if (section === "sale-order") {
    return kind === "sale-order";
  }

  if (section === "delivery-challan") {
    return kind === "delivery-note";
  }

  if (section === "invoices") {
    return kind === null;
  }

  return true;
}

/**
 * How much of each Sale Order has actually gone out, summed from the delivery
 * notes created against it. An order of 500 with a 300 delivery note keeps 200
 * as still pending — same idea as Purchase's order-to-receipt-note tracking.
 */
function buildDeliveredBySaleOrder(records: VoucherRecord[]) {
  const deliveredQtyByOrder = new Map<string, number>();

  records
    .filter((record) => record.documentKind === "delivery-note" && record.sourceVoucherId && record.status === "posted")
    .forEach((record) => {
      const orderId = record.sourceVoucherId as string;
      const quantity = (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      deliveredQtyByOrder.set(orderId, (deliveredQtyByOrder.get(orderId) ?? 0) + quantity);
    });

  return deliveredQtyByOrder;
}

export function buildInvoicedByDeliveryNote(records: VoucherRecord[]) {
  const notes = records.filter(
    (record) => record.voucherType === "sales" && record.documentKind === "delivery-note" && record.status === "posted",
  );
  const result = new Map<string, number>();
  const noteByInventoryLineId = new Map<string, VoucherRecord>();
  const allocatedByNoteLine = new Map<string, number>();
  notes.forEach((note) => {
    (note.inventoryItems ?? []).forEach((item) => noteByInventoryLineId.set(item.id, note));
  });

  records
    .filter((record) => record.voucherType === "sales" && !record.documentKind && record.status === "posted")
    .forEach((invoice) => {
      const legacyItems: NonNullable<VoucherRecord["inventoryItems"]> = [];
      (invoice.inventoryItems ?? []).forEach((item) => {
        const note = item.sourceInventoryLineId ? noteByInventoryLineId.get(item.sourceInventoryLineId) : undefined;
        if (!note) {
          legacyItems.push(item);
          return;
        }

        const quantity = Number(item.quantity || 0);
        result.set(note.id, (result.get(note.id) ?? 0) + quantity);
        allocatedByNoteLine.set(
          item.sourceInventoryLineId as string,
          (allocatedByNoteLine.get(item.sourceInventoryLineId as string) ?? 0) + quantity,
        );
      });

      if (!legacyItems.length) return;

      const billReferences = (invoice.lines ?? []).map((line) => line.billReference ?? "").join(" | ").toLowerCase();
      const candidates = notes
        .filter((note) => {
          if (invoice.sourceVoucherId === note.id) return true;
          return [note.voucherNumber, note.reference]
            .filter((value): value is string => Boolean(value?.trim()))
            .some((value) => billReferences.includes(value.trim().toLowerCase()));
        })
        .sort((left, right) => `${left.voucherDate}|${left.createdAt}`.localeCompare(`${right.voucherDate}|${right.createdAt}`));
      const remainingByItem = new Map<string, number>();
      legacyItems.forEach((item) => {
        const key = item.itemName.trim().toLowerCase();
        remainingByItem.set(key, (remainingByItem.get(key) ?? 0) + Number(item.quantity || 0));
      });

      candidates.forEach((note) => {
        let allocated = 0;
        (note.inventoryItems ?? []).forEach((item) => {
          const key = item.itemName.trim().toLowerCase();
          const used = allocatedByNoteLine.get(item.id) ?? 0;
          const available = Math.max(0, Number(item.quantity || 0) - used);
          const quantity = Math.min(available, remainingByItem.get(key) ?? 0);
          allocated += quantity;
          allocatedByNoteLine.set(item.id, used + quantity);
          remainingByItem.set(key, Math.max(0, (remainingByItem.get(key) ?? 0) - quantity));
        });
        if (allocated > 0) result.set(note.id, (result.get(note.id) ?? 0) + allocated);
      });
    });

  return result;
}

function buildSalesRows(records: VoucherRecord[], section: SalesWorkspaceSection) {
  const config = getSalesWorkspaceSection(section);
  const deliveredQtyByOrder = buildDeliveredBySaleOrder(records);
  const invoicedQtyByDelivery = buildInvoicedByDeliveryNote(records);
  const sourceRows = records
    .filter((record) => config.sourceVoucherTypes.includes(record.voucherType))
    .filter((record) => matchesSalesDocumentKind(record, section));
  const sourceVoucherIds = new Set(records.map((record) => record.sourceVoucherId).filter((id): id is string => Boolean(id)));
  const returnedQtyByInvoice = new Map<string, number>();
  records
    .filter((record) => record.voucherType === "credit-note" && record.sourceVoucherId && record.status === "posted")
    .forEach((record) => {
      const returnedQty = (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      returnedQtyByInvoice.set(record.sourceVoucherId!, (returnedQtyByInvoice.get(record.sourceVoucherId!) ?? 0) + returnedQty);
    });

  return sourceRows.map((record, index) => {
    const amount = record.amount;
    const balance = deriveBalance(record, section, records);
    const paymentMethod = derivePaymentMethod(record, section, records);
    const ownQty = (record.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const sourceOrder = record.sourceVoucherId ? records.find((entry) => entry.id === record.sourceVoucherId) : undefined;
    const sourceOrderQty = sourceOrder ? (sourceOrder.inventoryItems ?? []).reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0;
    const returnedQty = returnedQtyByInvoice.get(record.id) ?? 0;
    const returnStatus = section === "invoices" && returnedQty > 0
      ? (ownQty > 0 && returnedQty >= ownQty ? "Returned" : "Partially Returned")
      : null;

    return {
      id: `${section}-${record.id}`,
      sourceId: record.id,
      sourceVoucherType: record.voucherType,
      openVoucherType: config.createVoucherType,
      openMode: (section === "invoices" || section === "payment-in" || section === "credit-note" ? "edit" : "duplicate") as "edit" | "duplicate",
      documentNumber: buildDocumentNumber(record, section, config.documentPrefix),
      partyName: record.partyName,
      documentDate: record.voucherDate,
      createdAt: record.createdAt,
      amount,
      balance,
      status: record.status,
      workflow: workflowStates[section][index % workflowStates[section].length],
      transactionLabel: deriveTransactionLabel(section),
      paymentMethod,
      paymentStatus: derivePaymentState(amount, balance),
      workflowStatusLabel: returnStatus ?? deriveWorkflowStatusLabel(record, section, sourceVoucherIds.has(record.id), deliveredQtyByOrder.get(record.id) ?? 0, ownQty, invoicedQtyByDelivery.get(record.id) ?? 0),
      createdBy: record.enteredBy,
      orderedQty: section === "sale-order" ? ownQty : section === "delivery-challan" ? sourceOrderQty : 0,
      deliveredQty: section === "sale-order" ? deliveredQtyByOrder.get(record.id) ?? 0 : section === "delivery-challan" ? ownQty : 0,
      cumulativeDeliveredQty: section === "delivery-challan" && record.sourceVoucherId ? deliveredQtyByOrder.get(record.sourceVoucherId) ?? 0 : 0,
      invoicedQty: section === "delivery-challan" ? invoicedQtyByDelivery.get(record.id) ?? 0 : 0,
      lineItems: (record.inventoryItems ?? []).map((item) => ({
        itemName: item.itemName,
        quantity: toSafeNumber(item.quantity),
        unitPrice: toSafeNumber(item.unitPrice),
        total: toSafeNumber(item.quantity) * toSafeNumber(item.unitPrice),
      })),
    };
  });
}

function sortRows(rows: SalesDocumentRow[], sortKey: SortKey, direction: "asc" | "desc") {
  return [...rows].sort((left, right) => {
    if (sortKey === "documentDate") {
      const dateComparison = left.documentDate.localeCompare(right.documentDate);
      if (dateComparison !== 0) {
        return direction === "asc" ? dateComparison : -dateComparison;
      }

      // Keep same-day documents deterministic: the most recently created row
      // appears first without changing the requested document-date direction.
      return right.createdAt.localeCompare(left.createdAt);
    }

    const leftValue = left[sortKey];
    const rightValue = right[sortKey];

    let comparison: number;
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      comparison = leftValue - rightValue;
    } else {
      comparison = String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
    }

    return direction === "asc" ? comparison : -comparison;
  });
}

function buildCreateItem(index: number): SalesCreateLineItem {
  return {
    id: `create-item-${index + 1}`,
    itemName: "",
    quantity: "1",
    unitPrice: "",
  };
}

function buildCreateFormState(): SalesCreateFormState {
  return {
    warehouseId: "",
    partyName: "",
    phoneNo: "",
    billingAddress: "",
    shippingAddress: "",
    voucherDate: new Date().toISOString().slice(0, 10),
    reference: "",
    settlementMode: "accounts-payable",
    moneyAccountId: "",
    moneyAccountName: "",
    moneyAccountType: "CASH",
    condition: "",
    narration: "",
    status: "posted",
    discount: "0",
    loyaltyPoints: "0",
    receivedAmount: "",
    items: [buildCreateItem(0)],
    amount: "",
    appliedInvoiceId: null,
  };
}

function buildCreateFormFromVoucher(voucher: VoucherRecord, phoneNo: string): SalesCreateFormState {
  return {
    warehouseId: voucher.warehouseId ?? "",
    partyName: voucher.partyName,
    phoneNo,
    billingAddress: voucher.supplierAddress ?? "",
    shippingAddress: voucher.supplierAddress ?? "",
    voucherDate: voucher.voucherDate,
    reference: voucher.reference ?? voucher.voucherNumber,
    settlementMode: voucher.settlementMode === "cash" ? "cash" : "accounts-payable",
    moneyAccountId: "",
    moneyAccountName: "",
    moneyAccountType: "CASH",
    condition: voucher.condition ?? "",
    narration: voucher.narration ?? "",
    status: voucher.status,
    discount: String(Math.max(0, toSafeNumber(voucher.discountAmount) - toSafeNumber(voucher.loyaltyDiscountAmount))),
    loyaltyPoints: String(toSafeNumber(voucher.loyaltyPointsRedeemed)),
    receivedAmount: "",
    items:
      voucher.inventoryItems?.length
        ? voucher.inventoryItems.map((item, index) => ({
            id: item.inventoryItemId || item.id || `create-item-${index + 1}`,
            sourceInventoryLineId: item.id,
            itemName: item.itemName,
            quantity: String(toSafeNumber(item.quantity) || 1),
            unitPrice: String(toSafeNumber(item.unitPrice) || ""),
          }))
        : [buildCreateItem(0)],
    amount: String(voucher.amount || ""),
    appliedInvoiceId: voucher.sourceVoucherId ?? null,
  };
}

function buildSalesFormDraftState(draft: Partial<SalesCreateFormState> | null | undefined): SalesCreateFormState {
  const fallback = buildCreateFormState();
  if (!draft) {
    return fallback;
  }

  const items =
    Array.isArray(draft.items) && draft.items.length > 0
      ? draft.items.map((item, index) => ({
          ...buildCreateItem(index),
          ...item,
          id: item?.id || `create-item-${index + 1}`,
        }))
      : fallback.items;

  return {
    ...fallback,
    ...draft,
    items,
  };
}

function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase();
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

/** A freeform quantity/price field can hold anything the user typed (e.g. "abc") —
 * `Number(...)` turns that into NaN, which then poisons any total built from it and
 * renders as a literal NaN. This keeps a bad entry from counting as anything but 0. */
function toSafeNumber(value: string | number | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getColumnValue(row: SalesDocumentRow, columnId: FilterableColumnId) {
  switch (columnId) {
    case "documentDate":
      return `${row.documentDate} ${formatDate(row.documentDate)}`;
    case "documentNumber":
      return row.documentNumber;
    case "partyName":
      return row.partyName;
    case "transactionLabel":
      return row.transactionLabel;
    case "paymentMethod":
      return row.paymentMethod;
    case "amount":
      return `${row.amount} ${formatCurrency(row.amount)}`;
    case "balance":
      return `${row.balance} ${formatCurrency(row.balance)}`;
    case "status":
      return row.workflowStatusLabel ?? row.status;
    case "createdBy":
      return row.createdBy;
    default:
      return "";
  }
}

function matchesColumnFilter(value: string, filter: ColumnFilterValue) {
  const haystack = value.trim().toLowerCase();
  const needle = filter.value.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  if (filter.operator === "contains") {
    return haystack.includes(needle);
  }

  // Amount, balance and date columns carry two spellings of the same value joined
  // together ("10000 bdt 10,000.00"), so "Equals"/"Starts with" have to be tested
  // against each spelling — against the joined string they could never match.
  const firstSpace = haystack.indexOf(" ");
  const candidates = firstSpace === -1 ? [haystack] : [haystack, haystack.slice(0, firstSpace), haystack.slice(firstSpace + 1)];

  if (filter.operator === "equals") {
    return candidates.some((candidate) => candidate === needle);
  }

  return candidates.some((candidate) => candidate.startsWith(needle));
}

export function SalesWorkspaceScreen({ section }: { section: SalesWorkspaceSection }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  // Shared with the voucher screens: Transaction Settings -> "Round Off Total" decides
  // the direction and step used whenever a Round Off box is ticked.
  const roundOffPreference = useMemo(() => readRoundOffPreference(mode, session?.workspaceId ?? ""), [mode, session?.workspaceId]);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const queryClient = useQueryClient();
  const tableScrollRef = useTransientScrollbar<HTMLDivElement>();
  const columnFilterPopoverRef = useRef<HTMLDivElement | null>(null);
  const rowActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const workflowMenuRef = useRef<HTMLDivElement | null>(null);
  const workflowMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const workflowMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const customerPickerRef = useRef<HTMLDivElement | null>(null);
  const invoicePickerRef = useRef<HTMLDivElement | null>(null);
  const customerPickerListRef = useRef<HTMLDivElement | null>(null);
  const inventoryPickerRef = useRef<HTMLDivElement | null>(null);
  const inventoryPickerPanelRef = useRef<HTMLDivElement | null>(null);
  const inventoryPickerListRef = useRef<HTMLDivElement | null>(null);
  const posQuickItemPickerRef = useRef<HTMLDivElement | null>(null);
  const posQuickPickerListRef = useRef<HTMLDivElement | null>(null);
  const salesSidePickerListRef = useRef<HTMLDivElement | null>(null);
  const invoicePadInputRef = useRef<HTMLInputElement | null>(null);
  const createRequestRef = useRef("");
  const workflowCreateGuardRef = useRef("");
  const formActionRequestRef = useRef("");
  const postingRangeInitializedRef = useRef("");
  const deliveryQtyAdjustedForRef = useRef("");
  const createPageCloseTimerRef = useRef<number | null>(null);
  const config = getSalesWorkspaceSection(section);
  const primaryActionLabel = section === "sale-order" && workflowSettings.salesWorkflow === "DIRECT"
    ? "Advanced Mode Required"
    : section === "delivery-challan"
      ? "Select Sales Order"
      : section === "invoices" && workflowSettings.salesWorkflow === "ORDER_BASED"
        ? "Add Sales Order"
        : config.createLabel;
  const theme = accentStyles[config.accent];
  const [createPageRequested, setCreatePageRequested] = useState(false);
  const createRouteRequested = searchParams.get("create") === "1" || searchParams.get("create") === "true";
  const [createPageClosing, setCreatePageClosing] = useState(false);
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
  const [filters, setFilters] = useState<SalesWorkspaceFilters>(() => loadFilters(section));
  const [sortKey, setSortKey] = useState<SortKey>("documentDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnId, boolean>>(() => loadColumnVisibility(section));
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteSaving, setBulkDeleteSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [workflowMenuPosition, setWorkflowMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [activeRow, setActiveRow] = useState<SalesDocumentRow | null>(null);
  // The detail card (date/status/amount/items) is its own dialog, separate from the
  // Row Actions button list — "View" in that list opens it, and double-clicking a
  // transaction row opens it directly without the button list in between.
  const [viewRow, setViewRow] = useState<SalesDocumentRow | null>(null);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<SalesDocumentRow | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [editForm, setEditForm] = useState<InlineEditFormState | null>(null);
  // Set when this create form was opened by converting another sales document (e.g.
  // Sale Order -> Delivery Note) via ?fromVoucher=; carried into the save payload as
  // sourceVoucherId so the two documents stay linked, same as the purchase side.
  const [conversionSourceVoucherId, setConversionSourceVoucherId] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<FilterableColumnId, ColumnFilterValue>>>({});
  const [columnFilterPopover, setColumnFilterPopover] = useState<ColumnFilterPopoverState | null>(null);
  const [columnFilterDraft, setColumnFilterDraft] = useState<ColumnFilterValue>({ operator: "contains", value: "" });
  const [createOpen, setCreateOpen] = useState(false);
  // createPageClosing only ever becomes true from inside the page-mode branch of
  // closeSalesFormDialog() below, so folding it in here can't misclassify a real
  // modal-mode form as page-mode — it only keeps an already-page-mode form
  // rendered as a page for the rest of its own closing animation. Without it,
  // router.replace() stripping ?create=1 flips this to false a render before
  // createOpen itself goes false, and the form spends that ~200ms window
  // switching to a small centered Dialog (with its own overlay + close button)
  // whose content is simultaneously fading via the page-mode close animation
  // below — i.e. a blank modal flashing on screen right as the page closes.
  const shouldRenderCreateAsPage =
    section !== "pos" &&
    createOpen &&
    (createPageRequested || createRouteRequested || createPageClosing || (section === "invoices" && Boolean(searchParams.get("edit") || searchParams.get("duplicate"))));
  const isSalesInvoiceForm = section === "invoices" && config.createVoucherType === "sales";
  // Radix's Dialog treats a `modal` prop change as a distinct instance and can
  // re-fire its own open state as a side effect — if `modal` flips in the very
  // same render where `open` goes false (exactly what happens when a page-mode
  // save closes this form: createOpen -> false also flips shouldRenderCreateAsPage,
  // and therefore `modal`, false -> true in one tick), Radix can leave the dialog
  // visibly reopened on top of whatever opens next (the post-save preview).
  // Freezing `modal` to its last value from while the dialog was actually open
  // keeps `open` and `modal` from ever changing together.
  const createDialogModalRef = useRef(!shouldRenderCreateAsPage);
  if (createOpen) {
    createDialogModalRef.current = !shouldRenderCreateAsPage;
  }
  // A save's own close -> reopen effects (the general create=1 effect and the
  // fromVoucher-conversion effect below) can still act on a not-yet-settled URL
  // for a short window right after a save resolves — that's what was reopening
  // a fresh, blank create form on top of the just-opened success preview. Every
  // save stamps this with a few seconds' cooldown, and both of those effects
  // check it first and no-op while it's active, regardless of what the URL or
  // any request-tracking ref still says during that window.
  const suppressReopenUntilRef = useRef(0);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState<SalesCreateFormState>(buildCreateFormState);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  useEffect(() => {
    if (!session?.workspaceId) return;
    void getLoyaltySettings(mode, session.workspaceId).then(setLoyaltySettings).catch(() => setLoyaltySettings(null));
  }, [mode, session?.workspaceId]);
  useEffect(() => {
    if (mode !== "api" || !session?.workspaceId || !createForm.partyName.trim() || !isSalesInvoiceForm) {
      setLoyaltyBalance(0);
      return;
    }
    let active = true;
    void getLoyaltyBalance(session.workspaceId, createForm.partyName).then((result) => { if (active) setLoyaltyBalance(result.balance); }).catch(() => { if (active) setLoyaltyBalance(0); });
    return () => { active = false; };
  }, [createForm.partyName, isSalesInvoiceForm, mode, session?.workspaceId]);
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseRecord[]>([]);
  useEffect(() => {
    if (mode !== "api" || !session?.workspaceId) return;
    void listWarehouses(session.workspaceId, true).then((warehouses) => {
      setWarehouseOptions(warehouses);
      setCreateForm((current) => current.warehouseId ? current : { ...current, warehouseId: warehouses.find((warehouse) => warehouse.isDefault)?.id ?? "" });
    }).catch(() => setWarehouseOptions([]));
  }, [mode, session?.workspaceId]);
  const [showCreateTermsField, setShowCreateTermsField] = useState(false);
  const [previewDialog, setPreviewDialog] = useState<PreviewDialogState | null>(null);
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("tally");
  const [skipPreviewAfterSave, setSkipPreviewAfterSave] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerPickerHighlightIndex, setCustomerPickerHighlightIndex] = useState(-1);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const [activeInventoryPickerItemId, setActiveInventoryPickerItemId] = useState<string | null>(null);
  const [inventoryPickerHighlightIndex, setInventoryPickerHighlightIndex] = useState(-1);
  const [inventoryPickerPosition, setInventoryPickerPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [sidePickerTab, setSidePickerTab] = useState<"party" | "item">("party");
  const [sidePickerQuery, setSidePickerQuery] = useState("");
  const [sidePickerPage, setSidePickerPage] = useState(1);
  const [salesSidePickerHighlightIndex, setSalesSidePickerHighlightIndex] = useState(-1);
  const [posQuickItemQuery, setPosQuickItemQuery] = useState("");
  const [posQuickPickerOpen, setPosQuickPickerOpen] = useState(false);
  const [posQuickPickerHighlightIndex, setPosQuickPickerHighlightIndex] = useState(-1);
  const [selectedPosRowId, setSelectedPosRowId] = useState<string | null>(null);
  const posQuickSearchInputRef = useRef<HTMLInputElement | null>(null);
  const posQuantityInputRef = useRef<HTMLInputElement | null>(null);
  const posDiscountInputRef = useRef<HTMLInputElement | null>(null);
  const posChargesInputRef = useRef<HTMLInputElement | null>(null);
  const posRemarksInputRef = useRef<HTMLInputElement | null>(null);
  const [posLineDiscountTarget, setPosLineDiscountTarget] = useState<string | null>(null);
  const [posLineDiscountDraft, setPosLineDiscountDraft] = useState("0");
  const [partyOptions, setPartyOptions] = useState<PartyRecord[]>([]);
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOptionRecord[]>([]);
  const [quickAddCustomerOpen, setQuickAddCustomerOpen] = useState(false);
  const [quickAddCustomerName, setQuickAddCustomerName] = useState("");
  const [quickAddCustomerPhone, setQuickAddCustomerPhone] = useState("");
  const [quickAddCustomerSaving, setQuickAddCustomerSaving] = useState(false);
  const [quickAddItemOpen, setQuickAddItemOpen] = useState(false);
  const [quickAddItemName, setQuickAddItemName] = useState("");
  const [quickAddItemCategory, setQuickAddItemCategory] = useState("");
  const [quickAddItemUnit, setQuickAddItemUnit] = useState("pcs");
  const [quickAddItemSaving, setQuickAddItemSaving] = useState(false);
  const [quickAddItemCategories, setQuickAddItemCategories] = useState<InventoryTaxonomyEntry[]>([]);
  const [itemPickerNameMode, setItemPickerNameMode] = useState<"name" | "alias">("name");

  useEffect(() => {
    setItemPickerNameMode(loadItemPickerNameMode());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ITEM_PICKER_NAME_MODE_KEY, itemPickerNameMode);
  }, [itemPickerNameMode]);
  const [denseTable, setDenseTable] = useState(true);
  const [showTabCounts, setShowTabCounts] = useState(true);
  const [stickyHeader, setStickyHeader] = useState(true);
  const [showCreatedBy, setShowCreatedBy] = useState(false);
  const { beginResize: beginColumnResize, columnWidths } = useColumnResize(defaultSalesColumnWidths);
  const [responsiveWidth, setResponsiveWidth] = useState(1280);

  useEffect(() => {
    const updateResponsiveWidth = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const tableWidth = tableScrollRef.current?.clientWidth ?? viewportWidth;
      setResponsiveWidth(Math.min(viewportWidth, tableWidth));
    };

    updateResponsiveWidth();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateResponsiveWidth);
    if (tableScrollRef.current) {
      observer?.observe(tableScrollRef.current);
    }

    window.addEventListener("resize", updateResponsiveWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateResponsiveWidth);
    };
  }, [tableScrollRef]);

  const tableColumnVisibility = useMemo<Record<ColumnId, boolean>>(() => {
    if (responsiveWidth >= 900) {
      return columnVisibility;
    }

    if (responsiveWidth >= 700) {
      return {
        ...columnVisibility,
        transactionLabel: false,
        paymentMethod: false,
        actions: false,
        createdBy: false,
      };
    }

    if (responsiveWidth >= 520) {
      return {
        ...columnVisibility,
        documentDate: false,
        transactionLabel: false,
        paymentMethod: false,
        actions: false,
        createdBy: false,
      };
    }

    return {
      ...columnVisibility,
      documentDate: false,
      transactionLabel: false,
      paymentMethod: false,
      amount: false,
      balance: false,
      actions: false,
      createdBy: false,
    };
  }, [columnVisibility, responsiveWidth]);

  const queryWindow = useMemo(
    () => buildQueryWindow(filters.range, filters.customStartDate, filters.customEndDate),
    [filters.range, filters.customStartDate, filters.customEndDate],
  );
  const query = useDayBookQuery(mode, {
    workspaceId: session?.workspaceId,
    voucherType: "all",
    status: "all",
    enteredBy: "all",
    query: "",
    ...queryWindow,
  });
  const postingAnchorQuery = useDayBookQuery(mode, {
    workspaceId: session?.workspaceId,
    voucherType: "all",
    status: "all",
    enteredBy: "all",
    query: "",
  });

  useEffect(() => {
    // "Last Posting Month" belongs to the active sales register, not to the
    // entire Day Book. An unrelated later posting (for example an August LC
    // journal) must not move July Delivery Notes to an empty August window.
    const sectionPostingRows = buildSalesRows(postingAnchorQuery.data ?? [], section);
    const range = getLatestPostingMonthRange(
      sectionPostingRows.map((row) => row.documentDate),
    );
    if (!range) return;
    const key = `${session?.workspaceId ?? "default"}:${section}:${range.to}`;
    if (postingRangeInitializedRef.current === key) return;
    setFilters((current) => ({
      ...current,
      range: "last-posting-month",
      customStartDate: range.from,
      customEndDate: range.to,
    }));
    postingRangeInitializedRef.current = key;
  }, [postingAnchorQuery.data, section, session?.workspaceId]);

  useEffect(() => {
    setSelectedRowIds([]);
    setCurrentPage(1);
  }, [section, filters, sortDirection, sortKey, columnFilters, pageSize, workspaceSearch]);

  useEffect(() => {
    setColumnVisibility((current) => ({
      ...current,
      createdBy: showCreatedBy,
    }));
  }, [showCreatedBy]);

  useEffect(() => {
    setColumnVisibility(loadColumnVisibility(section));
  }, [section]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(columnVisibilityStorageKey(section), JSON.stringify(columnVisibility));
  }, [columnVisibility, section]);

  useEffect(() => {
    setFilters(loadFilters(section));
  }, [section]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(filtersStorageKey(section), JSON.stringify(filters));
  }, [filters, section]);

  const rawRows = useMemo(() => buildSalesRows(query.data ?? [], section), [query.data, section]);
  const sourceRows = rawRows;
  const localOptions = useMemo(() => {
    if (!session?.workspaceId) {
      return {
        parties: [] as PartyRecord[],
        inventory: [] as InventoryOptionRecord[],
      };
    }

    if (mode === "api") {
      return {
        parties: partyOptions,
        inventory: inventoryOptions,
      };
    }

    const dataset = readDataset(mode);
    return {
      parties: getPartyOptions(dataset, session.workspaceId, config.createVoucherType),
      inventory: getInventoryOptions(dataset, session.workspaceId).map((item) => ({ ...item, alias: undefined })) as InventoryOptionRecord[],
    };
  }, [config.createVoucherType, inventoryOptions, mode, partyOptions, session?.workspaceId]);
  const salesFormDraftKey = useMemo(
    () => `bizovix:sales-form-draft:${mode}:${session?.workspaceId ?? "default"}:${section}`,
    [mode, section, session?.workspaceId],
  );
  const salesPreviewPreferenceKey = useMemo(
    () => `bizovix:sales-preview-after-save:${mode}:${session?.workspaceId ?? "default"}:${section}`,
    [mode, section, session?.workspaceId],
  );

  const tabCounts = useMemo(() => {
    const entries = salesWorkspaceSections.map((entry) => [entry.slug, buildSalesRows(query.data ?? [], entry.slug).length] as const);
    return Object.fromEntries(entries) as Record<SalesWorkspaceSection, number>;
  }, [query.data]);

  const firmOptions = useMemo(() => Array.from(new Set(sourceRows.map((row) => row.partyName))).sort((left, right) => left.localeCompare(right)), [sourceRows]);
  const userOptions = useMemo(() => Array.from(new Set(sourceRows.map((row) => row.createdBy))).sort((left, right) => left.localeCompare(right)), [sourceRows]);
  const filteredCustomerOptions = useMemo(() => {
    const needle = normalizeLookupValue(createForm.partyName);
    const ranked = localOptions.parties.filter((party) => {
      if (!needle) {
        return true;
      }

      const partyKey = normalizeLookupValue(party.name);
      const contactKey = normalizeLookupValue(party.contact);
      return partyKey.includes(needle) || contactKey.includes(needle);
    });

    return ranked
      .sort((left, right) => {
        const leftStarts = normalizeLookupValue(left.name).startsWith(needle);
        const rightStarts = normalizeLookupValue(right.name).startsWith(needle);
        if (leftStarts !== rightStarts) {
          return leftStarts ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, 12);
  }, [createForm.partyName, localOptions.parties]);
  // This customer's Sales Invoices that still have a real due balance — the
  // list a Receipt gets applied against (see computeInvoiceDue). Excludes the
  // invoice this exact Receipt is already linked to on edit so its own amount
  // doesn't look "already covered" against itself.
  const outstandingInvoiceOptions = useMemo(() => {
    const partyKey = normalizeLookupValue(createForm.partyName);
    if (!partyKey) {
      return [];
    }
    const allVouchers = query.data ?? [];
    return allVouchers
      .filter(
        (record) =>
          record.voucherType === "sales" &&
          !record.documentKind &&
          record.status === "posted" &&
          normalizeLookupValue(record.partyName) === partyKey,
      )
      .map((invoice) => ({
        invoice,
        due: computeInvoiceDue(invoice, allVouchers, editForm?.sourceVoucher.id),
      }))
      .filter((entry) => entry.due > 0 || entry.invoice.id === createForm.appliedInvoiceId)
      .sort((left, right) => left.invoice.voucherDate.localeCompare(right.invoice.voucherDate));
  }, [createForm.appliedInvoiceId, createForm.partyName, editForm?.sourceVoucher.id, query.data]);
  const returnInvoiceOptions = useMemo(() => {
    const partyKey = normalizeLookupValue(createForm.partyName);
    if (!partyKey) return [];
    const allVouchers = query.data ?? [];
    return allVouchers
      .filter(
        (record) =>
          record.voucherType === "sales" &&
          !record.documentKind &&
          (record.status === "approved" || record.status === "posted") &&
          normalizeLookupValue(record.partyName) === partyKey,
      )
      .map((invoice) => {
        const priorReturns = allVouchers.filter(
          (record) =>
            record.voucherType === "credit-note" &&
            record.sourceVoucherId === invoice.id &&
            record.status === "posted" &&
            record.id !== editForm?.sourceVoucher.id,
        );
        const returnableItems = (invoice.inventoryItems ?? [])
          .map((item) => {
            const alreadyReturned = priorReturns
              .flatMap((record) => record.inventoryItems ?? [])
              .filter((returnedItem) => normalizeLookupValue(returnedItem.itemName) === normalizeLookupValue(item.itemName))
              .reduce((sum, returnedItem) => sum + Number(returnedItem.quantity || 0), 0);
            return { ...item, returnableQuantity: Math.max(0, Number(item.quantity || 0) - alreadyReturned) };
          })
          .filter((item) => item.returnableQuantity > 0);
        return { invoice, returnableItems };
      })
      .filter((entry) => entry.returnableItems.length > 0 || entry.invoice.id === createForm.appliedInvoiceId)
      .sort((left, right) => right.invoice.voucherDate.localeCompare(left.invoice.voucherDate));
  }, [createForm.appliedInvoiceId, createForm.partyName, editForm?.sourceVoucher.id, query.data]);
  const filteredInventoryOptions = useMemo(() => {
    return createForm.items.reduce<Record<string, InventoryOptionRecord[]>>((accumulator, item) => {
      const needle = normalizeLookupValue(item.itemName);
      accumulator[item.id] = localOptions.inventory
        .filter((entry) => {
          if (!needle) {
            return true;
          }

          return normalizeLookupValue(entry.itemName).includes(needle) || normalizeLookupValue(entry.itemCode).includes(needle);
        })
        .sort((left, right) => {
          const leftStarts = normalizeLookupValue(left.itemName).startsWith(needle);
          const rightStarts = normalizeLookupValue(right.itemName).startsWith(needle);
          if (leftStarts !== rightStarts) {
            return leftStarts ? -1 : 1;
          }

          return left.itemName.localeCompare(right.itemName);
        })
        .slice(0, 12);
      return accumulator;
    }, {});
  }, [createForm.items, localOptions.inventory]);
  const activeInventoryOptions = useMemo(
    () => (activeInventoryPickerItemId ? filteredInventoryOptions[activeInventoryPickerItemId] ?? [] : []),
    [activeInventoryPickerItemId, filteredInventoryOptions],
  );
  const filteredPosQuickOptions = useMemo(() => {
    const needle = normalizeLookupValue(posQuickItemQuery);
    return localOptions.inventory
      .filter((entry) => {
        if (!needle) {
          return true;
        }

        return normalizeLookupValue(entry.itemName).includes(needle) || normalizeLookupValue(entry.itemCode).includes(needle);
      })
      .sort((left, right) => {
        const leftStarts = normalizeLookupValue(left.itemName).startsWith(needle) || normalizeLookupValue(left.itemCode).startsWith(needle);
        const rightStarts = normalizeLookupValue(right.itemName).startsWith(needle) || normalizeLookupValue(right.itemCode).startsWith(needle);
        if (leftStarts !== rightStarts) {
          return leftStarts ? -1 : 1;
        }

        return left.itemName.localeCompare(right.itemName);
      })
      .slice(0, 12);
  }, [localOptions.inventory, posQuickItemQuery]);
  const salesSidePickerOptions = useMemo(() => {
    const needle = normalizeLookupValue(sidePickerQuery);
    const parties = localOptions.parties
      .filter((party) => {
        if (!needle) {
          return true;
        }

        return normalizeLookupValue(party.name).includes(needle) || normalizeLookupValue(party.contact).includes(needle);
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    const inventory = localOptions.inventory
      .filter((item) => {
        if (!needle) {
          return true;
        }

        const primaryName = itemPickerNameMode === "alias" && item.alias ? item.alias : item.itemName;
        return normalizeLookupValue(primaryName).includes(needle) || normalizeLookupValue(item.itemCode).includes(needle);
      })
      .sort((left, right) => left.itemName.localeCompare(right.itemName));

    return { parties, inventory };
  }, [itemPickerNameMode, localOptions.inventory, localOptions.parties, sidePickerQuery]);

  useEffect(() => {
    if (customerPickerHighlightIndex >= 0) {
      customerPickerListRef.current
        ?.querySelector(`[data-picker-option-index="${customerPickerHighlightIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [customerPickerHighlightIndex]);

  useEffect(() => {
    if (inventoryPickerHighlightIndex >= 0) {
      inventoryPickerListRef.current
        ?.querySelector(`[data-picker-option-index="${inventoryPickerHighlightIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [inventoryPickerHighlightIndex]);

  useEffect(() => {
    if (posQuickPickerHighlightIndex >= 0) {
      posQuickPickerListRef.current
        ?.querySelector(`[data-picker-option-index="${posQuickPickerHighlightIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [posQuickPickerHighlightIndex]);

  useEffect(() => {
    if (salesSidePickerHighlightIndex < 0) {
      return;
    }

    setSidePickerPage(Math.floor(salesSidePickerHighlightIndex / 8) + 1);
  }, [salesSidePickerHighlightIndex]);

  useEffect(() => {
    if (salesSidePickerHighlightIndex >= 0) {
      salesSidePickerListRef.current
        ?.querySelector(`[data-picker-option-index="${salesSidePickerHighlightIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [salesSidePickerHighlightIndex, sidePickerPage]);

  const filteredRows = useMemo(() => {
    const searchNeedle = workspaceSearch.trim().toLowerCase();
    const customerNeedle = filters.customerQuery.trim().toLowerCase();
    const createdByNeedle = filters.createdByQuery.trim().toLowerCase();

    return sourceRows.filter((row) => {
      const matchesSearch =
        !searchNeedle ||
        `${row.documentNumber} ${row.partyName} ${row.transactionLabel} ${row.paymentMethod} ${row.workflow}`.toLowerCase().includes(searchNeedle);
      const matchesStatus = filters.status === "all" || row.status === filters.status;
      const matchesCustomer = !customerNeedle || row.partyName.toLowerCase().includes(customerNeedle);
      const matchesPaymentStatus = filters.paymentStatus === "all" || row.paymentStatus === filters.paymentStatus;
      const matchesCreatedBy = !createdByNeedle || row.createdBy.toLowerCase().includes(createdByNeedle);
      const matchesWorkflow = filters.workflow === "all" || row.workflow === filters.workflow;
      const matchesColumnFilters = Object.entries(columnFilters).every(([columnId, filter]) => {
        if (!filter) {
          return true;
        }

        return matchesColumnFilter(getColumnValue(row, columnId as FilterableColumnId), filter);
      });

      return matchesSearch && matchesStatus && matchesCustomer && matchesPaymentStatus && matchesCreatedBy && matchesWorkflow && matchesColumnFilters;
    });
  }, [columnFilters, filters, sourceRows, workspaceSearch]);
  const workspaceSummary = useMemo(() => buildSalesSummary(filteredRows, section), [filteredRows, section]);

  // A counter needs today's numbers, not lifetime totals, so POS gets its own
  // day-scoped snapshot instead of the generic document summary card.
  const posCounterSnapshot = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayRows = filteredRows.filter((row) => row.documentDate.slice(0, 10) === todayKey);
    const todayTotal = sumMoney(todayRows.map((row) => row.amount));
    const cashTotal = sumMoney(
      todayRows
        .filter((row) => row.paymentMethod.toLowerCase().includes("cash"))
        .map((row) => row.amount),
    );
    const dueTotal = sumMoney(todayRows.map((row) => Math.max(0, roundMoney(row.balance))));

    return {
      todayTotal,
      billCount: todayRows.length,
      averageBill: todayRows.length ? roundMoney(todayTotal / todayRows.length) : 0,
      cashTotal,
      digitalTotal: Math.max(0, roundMoney(todayTotal - cashTotal)),
      cashShare: todayTotal ? Math.round((cashTotal / todayTotal) * 100) : 0,
      dueTotal,
      allTimeTotal: sumMoney(filteredRows.map((row) => row.amount)),
      allTimeCount: filteredRows.length,
    };
  }, [filteredRows]);

  const rows = useMemo(() => sortRows(filteredRows, sortKey, sortDirection), [filteredRows, sortDirection, sortKey]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [currentPage, pageSize, rows]);
  // Sum of every filtered row's Amount, not just the current page — matches
  // what the removed summary card used to show, now surfaced next to the
  // pagination controls instead.
  const filteredAmountTotal = useMemo(() => sumMoney(rows.map((row) => toSafeNumber(row.amount))), [rows]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const visibleRowCount = pagedRows.length;
  const selectedRows = useMemo(() => rows.filter((row) => selectedRowIds.includes(row.id)), [rows, selectedRowIds]);
  const showSelectionColumn = section !== "pos" || tableColumnVisibility.select;
  const visibleColumnCount = Object.values(tableColumnVisibility).filter(Boolean).length;
  const renderedColumnCount = visibleColumnCount + (showSelectionColumn && !tableColumnVisibility.select ? 1 : 0) + (section === "sale-order" || section === "delivery-challan" ? 1 : 0);
  const allVisibleSelected = visibleRowCount > 0 && pagedRows.every((row) => selectedRowIds.includes(row.id));
  const createSubtotal = useMemo(
    () =>
      createForm.items.reduce((sum, item) => {
        const quantity = toSafeNumber(item.quantity);
        const unitPrice = toSafeNumber(item.unitPrice);
        // A per-line POS discount lowers that line's value before the bill total.
        const lineDiscount = Math.min(Math.max(toSafeNumber(item.discountPercent), 0), 100);
        return sum + quantity * unitPrice * (1 - lineDiscount / 100);
      }, 0),
    [createForm.items],
  );
  const createDiscount = toSafeNumber(createForm.discount);
  const requestedLoyaltyPoints = Math.max(0, Math.floor(toSafeNumber(createForm.loyaltyPoints)));
  const loyaltyPointsPerRedemption = Math.max(0, Math.floor(loyaltySettings?.redeemPoints ?? 0));
  const loyaltyRedeemAmount = Math.max(0, loyaltySettings?.redeemAmount ?? 0);
  const affordableLoyaltyPoints = loyaltyRedeemAmount > 0 ? Math.floor(Math.max(0, createSubtotal - createDiscount) / loyaltyRedeemAmount) * loyaltyPointsPerRedemption : 0;
  const maximumRedeemablePoints = Math.min(loyaltyBalance, affordableLoyaltyPoints);
  const validLoyaltyPoints = loyaltyPointsPerRedemption > 0 ? Math.min(maximumRedeemablePoints, Math.floor(requestedLoyaltyPoints / loyaltyPointsPerRedemption) * loyaltyPointsPerRedemption) : 0;
  const loyaltyDiscount = loyaltyPointsPerRedemption > 0 ? (validLoyaltyPoints / loyaltyPointsPerRedemption) * (loyaltySettings?.redeemAmount ?? 0) : 0;
  const createAdditionalCharges = toSafeNumber(createForm.additionalCharges);
  const createNetBeforeRounding = Math.max(0, createSubtotal - createDiscount - loyaltyDiscount + createAdditionalCharges);
  // undefined = the operator never touched the box, so fall back to the company
  // setting; once they click it their explicit true/false wins.
  const createRoundOffEnabled = createForm.roundOff ?? roundOffPreference.enabled;
  const createTotal = createRoundOffEnabled
    ? applyRoundOff(createNetBeforeRounding, roundOffPreference)
    : roundMoney(createNetBeforeRounding);
  const createRoundOffDelta = roundMoney(createTotal - createNetBeforeRounding);
  const receivedAmountValue = toSafeNumber(createForm.receivedAmount);
  const balanceAmountValue = Math.max(0, roundMoney(createTotal - receivedAmountValue));
  const changeToReturnValue = Math.max(0, roundMoney(receivedAmountValue - createTotal));
  const posItemCount = createForm.items.filter((item) => item.itemName.trim()).length;
  const posQuantityTotal = createForm.items.reduce((sum, item) => sum + toSafeNumber(item.quantity), 0);
  const isPosSection = section === "pos";
  const posBillLabel = createForm.reference.trim() || `#${Math.max(sourceRows.length + (editForm ? 0 : 1), 1)}`;
  const stickySelectWidth = showSelectionColumn ? columnWidths.select : 0;
  const stickyDateWidth = tableColumnVisibility.documentDate ? columnWidths.documentDate : 0;
  const stickyDateLeft = stickySelectWidth;
  const stickyInvoiceLeft = stickySelectWidth + stickyDateWidth;
  const salesTableMinWidth = (Object.keys(tableColumnVisibility) as ColumnId[]).reduce(
    (sum, columnId) => (tableColumnVisibility[columnId] ? sum + columnWidths[columnId] : sum),
    0,
  );

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "documentDate" ? "desc" : "asc");
  }

  function renderColumnResizeHandle(columnId: ColumnId, label: string) {
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
    setSelectedRowIds((current) => (checked ? [...current, rowId] : current.filter((entry) => entry !== rowId)));
  }

  function toggleAllVisibleRows(checked: boolean) {
    setSelectedRowIds((current) => {
      if (!checked) {
        return current.filter((id) => !pagedRows.some((row) => row.id === id));
      }

      return Array.from(new Set([...current, ...pagedRows.map((row) => row.id)]));
    });
  }

  async function handleBulkDeleteRows() {
    if (!selectedRows.length || !session?.workspaceId) {
      setBulkDeleteOpen(false);
      return;
    }

    setBulkDeleteSaving(true);
    const deletedRowIds: string[] = [];
    const failures: { row: SalesDocumentRow; reason: string }[] = [];
    try {
      for (const row of selectedRows) {
        try {
          const deletedVoucher = await deleteVoucherRecord(row, session.workspaceId);
          if (deletedVoucher && mode !== "api") {
            moveVoucherToRecycleBin(mode, deletedVoucher, session.user.name ?? "Current User");
          }
          deletedRowIds.push(row.id);
        } catch (error) {
          failures.push({ row, reason: error instanceof Error ? error.message : "Could not be deleted" });
        }
      }

      if (deletedRowIds.length) {
        setSelectedRowIds((current) => current.filter((id) => !deletedRowIds.includes(id)));
        await queryClient.invalidateQueries({ queryKey: [mode] });
        await query.refetch();
      }

      if (failures.length) {
        toast.error(
          `${deletedRowIds.length} deleted, ${failures.length} skipped — ${failures
            .map(({ row, reason }) => `${row.documentNumber}: ${reason}`)
            .join("; ")}`,
        );
      } else {
        setBulkDeleteOpen(false);
        toast.success(`${deletedRowIds.length} document${deletedRowIds.length === 1 ? "" : "s"} moved to Recycle Bin`);
      }
    } finally {
      setBulkDeleteSaving(false);
    }
  }

  function exportRows(exportableRows: SalesDocumentRow[], fileName: string) {
    if (!exportableRows.length) {
      toast.error(`No ${config.shortLabel.toLowerCase()} rows available to export`);
      return;
    }

    downloadCsv(
      fileName,
      exportableRows.map((row) => ({
        Date: formatDate(row.documentDate),
        "Document No.": row.documentNumber,
        Customer: row.partyName,
        Transaction: row.transactionLabel,
        "Payment Method": row.paymentMethod,
        Amount: row.amount,
        Balance: row.balance,
        Status: row.status,
        "Created By": row.createdBy,
      })),
    );
    toast.success(`${config.label} exported`);
  }

  function printRowsReport(reportRows = rows, titleSuffix?: string) {
    const printWindow = openPrintWindow("width=1120,height=900");

    if (!printWindow) {
      toast.error("Allow pop-ups to print this report.");
      return;
    }

    const companyProfile = session?.workspaceId ? readCompanyProfile(mode, session.workspaceId) : null;
    const companyName = companyProfile?.companyName || appConfig.companyName;
    const companyLines = [companyProfile?.businessAddress, companyProfile?.phoneNumber, companyProfile?.emailAddress].filter(Boolean);
    const printedAt = new Date();
    const filtersApplied = [
      filters.range === "custom" && filters.customStartDate && filters.customEndDate
        ? `Range: ${formatDate(filters.customStartDate)} - ${formatDate(filters.customEndDate)}`
        : `Range: ${salesFilterRangeLabels[filters.range]}`,
      workspaceSearch.trim() ? `Search: ${workspaceSearch.trim()}` : "",
      filters.status !== "all" ? `Voucher status: ${filters.status}` : "",
      filters.paymentStatus !== "all" ? `Payment: ${filters.paymentStatus}` : "",
      filters.workflow !== "all" ? `Workflow: ${filters.workflow}` : "",
      filters.customerQuery.trim() ? `Customer: ${filters.customerQuery.trim()}` : "",
      filters.createdByQuery.trim() ? `User: ${filters.createdByQuery.trim()}` : "",
    ].filter(Boolean);

    const paymentStatusLabel = (row: SalesDocumentRow) => {
      if (row.paymentStatus === "paid") {
        return "Paid";
      }
      if (row.paymentStatus === "partial") {
        return "Partial";
      }
      return "Unpaid";
    };

    const tableMarkup = reportRows.length
      ? `
          <table>
            <thead>
              <tr>
                <th class="serial">#</th>
                <th class="date">Date</th>
                <th class="document">Document No.</th>
                <th>Party Name</th>
                <th class="payment">Payment</th>
                <th class="amount">Amount</th>
                <th class="amount">Balance</th>
                <th class="status">Status</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows
                .map(
                  (row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(formatDate(row.documentDate))}</td>
                <td>${escapeHtml(row.documentNumber)}</td>
                <td>${escapeHtml(row.partyName)}</td>
                <td>${escapeHtml(row.paymentMethod)}</td>
                <td class="amount">${escapeHtml(formatCurrency(row.amount))}</td>
                <td class="amount">${escapeHtml(formatCurrency(row.balance))}</td>
                <td>${escapeHtml(paymentStatusLabel(row))}</td>
              </tr>
            `,
                )
                .join("")}
            </tbody>
          </table>
        `
      : `
          <div class="empty-state">
            <strong>No ${escapeHtml(config.shortLabel.toLowerCase())} found</strong>
            <span>There are no transactions in the selected filters.</span>
          </div>
        `;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(config.label)} Transactions</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #172033;
              font-family: Inter, Arial, sans-serif;
              font-size: 12px;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .report { width: 100%; }
            .header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 24px;
              border-bottom: 2px solid #13243d;
              padding-bottom: 14px;
            }
            .company { font-size: 11px; line-height: 1.55; color: #52627a; }
            .company strong { display: block; color: #13243d; font-size: 20px; line-height: 1.2; margin-bottom: 5px; }
            .meta { text-align: right; color: #52627a; line-height: 1.55; }
            .meta strong { display: block; color: #13243d; font-size: 16px; margin-bottom: 4px; }
            .summary {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin: 18px 0 12px;
            }
            .tile {
              border: 1px solid #d7e1ee;
              border-radius: 8px;
              padding: 10px 12px;
              background: #f8fbff;
            }
            .tile span {
              display: block;
              color: #64748b;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0;
            }
            .tile strong { display: block; margin-top: 5px; font-size: 14px; color: #14233b; }
            .filters { margin: 0 0 14px; color: #52627a; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td {
              border: 1px solid #d7e1ee;
              padding: 8px 7px;
              text-align: left;
              vertical-align: top;
            }
            th {
              background: #eef4fb;
              color: #26364f;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0;
              white-space: nowrap;
              word-break: normal;
            }
            td { overflow-wrap: anywhere; }
            tbody tr:nth-child(even) td { background: #fbfdff; }
            .serial { width: 32px; text-align: center; }
            .date { width: 76px; }
            .document { width: 124px; }
            .payment { width: 92px; }
            .amount { text-align: right; white-space: nowrap; }
            .status { width: 70px; }
            .empty-state {
              border: 1px dashed #cbd7e6;
              border-radius: 10px;
              margin-top: 8px;
              padding: 34px 16px;
              text-align: center;
              color: #64748b;
              background: #fbfdff;
            }
            .empty-state strong { display: block; color: #14233b; font-size: 14px; margin-bottom: 5px; }
            .empty-state span { font-size: 11px; }
            .footer {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              margin-top: 18px;
              border-top: 1px solid #d7e1ee;
              padding-top: 10px;
              color: #64748b;
              font-size: 10px;
            }
            .print-actions { margin: 18px 0; text-align: right; }
            .print-actions button {
              border: 1px solid #1d4ed8;
              border-radius: 8px;
              background: #1d4ed8;
              color: white;
              padding: 8px 14px;
              font: inherit;
              cursor: pointer;
            }
            @media print {
              .print-actions { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-actions"><button type="button" onclick="window.print()">Print</button></div>
          <main class="report">
            <section class="header">
              <div class="company">
                <strong>${escapeHtml(companyName)}</strong>
                ${companyLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
              </div>
              <div class="meta">
                <strong>${escapeHtml(titleSuffix || `${config.label} Transactions`)}</strong>
                <div>Printed: ${escapeHtml(formatDate(printedAt))}</div>
                <div>Total rows: ${reportRows.length}</div>
              </div>
            </section>
            <section class="summary">
              <div class="tile"><span>Documents</span><strong>${workspaceSummary.documentCount}</strong></div>
              <div class="tile"><span>Total Amount</span><strong>${escapeHtml(formatCurrency(workspaceSummary.totalAmount))}</strong></div>
              <div class="tile"><span>${escapeHtml(workspaceSummary.primaryLabel)}</span><strong>${escapeHtml(formatCurrency(workspaceSummary.primaryValue))}</strong></div>
              <div class="tile"><span>${escapeHtml(workspaceSummary.secondaryLabel)}</span><strong>${escapeHtml(formatCurrency(workspaceSummary.secondaryValue))}</strong></div>
            </section>
            ${filtersApplied.length ? `<div class="filters">Filters: ${filtersApplied.map(escapeHtml).join(" | ")}</div>` : ""}
            ${tableMarkup}
            <section class="footer">
              <span>${escapeHtml(config.label)} report</span>
              <span>Generated by ${escapeHtml(appConfig.appName)}</span>
            </section>
          </main>
        </body>
      </html>
    `);

    printWindowWhenReady(printWindow);
  }

  function readSalesFormDraft() {
    if (typeof window === "undefined") {
      return null;
    }

    const rawDraft = window.localStorage.getItem(salesFormDraftKey);
    if (!rawDraft) {
      return null;
    }

    try {
      return buildSalesFormDraftState(JSON.parse(rawDraft) as Partial<SalesCreateFormState>);
    } catch {
      window.localStorage.removeItem(salesFormDraftKey);
      return null;
    }
  }

  function clearSalesFormDraft() {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(salesFormDraftKey);
  }

  function updateSkipPreviewAfterSave(checked: boolean) {
    setSkipPreviewAfterSave(checked);
    if (typeof window === "undefined") {
      return;
    }

    if (checked) {
      window.localStorage.setItem(salesPreviewPreferenceKey, "1");
      return;
    }

    window.localStorage.removeItem(salesPreviewPreferenceKey);
  }

  function resetSalesForm(options?: { clearDraft?: boolean }) {
    if (options?.clearDraft) {
      clearSalesFormDraft();
    }

    setCreateForm(buildCreateFormState());
    setShowCreateTermsField(false);
    setEditForm(null);
    setCustomerPickerOpen(false);
    setCustomerPickerHighlightIndex(-1);
    setActiveInventoryPickerItemId(null);
    setInventoryPickerHighlightIndex(-1);
    setSidePickerTab("party");
    setSidePickerQuery("");
    setSidePickerPage(1);
    setSalesSidePickerHighlightIndex(-1);
    setPosQuickItemQuery("");
    setPosQuickPickerOpen(false);
    setPosQuickPickerHighlightIndex(-1);
    setSelectedPosRowId(null);
  }

  function openCreateSalesForm(options?: { forceFresh?: boolean }) {
    if (!readiness.isReadyForTransactions) {
      toast.error("Master data setup incomplete. Complete mandatory master data setup before creating transactions.");
      return;
    }

    if (options?.forceFresh) {
      clearSalesFormDraft();
    }

    const nextForm = options?.forceFresh ? buildCreateFormState() : (readSalesFormDraft() ?? buildCreateFormState());
    setCreateForm(nextForm);
    setShowCreateTermsField(Boolean(nextForm.condition.trim()));
    setEditForm(null);
    setCustomerPickerOpen(false);
    setCustomerPickerHighlightIndex(-1);
    setActiveInventoryPickerItemId(null);
    setInventoryPickerHighlightIndex(-1);
    setSidePickerTab("party");
    setSidePickerQuery("");
    setSidePickerPage(1);
    setSalesSidePickerHighlightIndex(-1);
    setPosQuickItemQuery("");
    setPosQuickPickerOpen(false);
    setPosQuickPickerHighlightIndex(-1);
    setSelectedPosRowId(null);
    setCreateOpen(true);
    setActiveRow(null);
  }

  function openCreateAction() {
    if (section === "invoices" || section === "sale-order") {
      if (workflowSettingsLoadState === "PENDING") {
        toast.info("Company transaction workflow is still loading. Please try again.");
        return;
      }
      if (workflowSettingsLoadState === "ERROR") {
        toast.error("Company transaction workflow could not be loaded. Retry before creating a new sales transaction.");
        return;
      }
    }

    if (section === "invoices") {
      router.push(buildSalesStartRoute(mode, workflowSettings.salesWorkflow));
      return;
    }

    if (section === "sale-order") {
      if (workflowSettings.salesWorkflow === "DIRECT") {
        toast.info("Sales workflow is in Direct Mode. Change it under Settings → Sales & Purchase Flow to create a new Sales Order.");
        return;
      }
      router.push(`${buildVoucherRoute(mode, "sales")}?workflow=sale-order&returnTo=${encodeURIComponent(buildSalesWorkspaceRoute(mode, "sale-order"))}`);
      return;
    }

    if (section === "delivery-challan") {
      router.push(buildSalesWorkspaceRoute(mode, "sale-order"));
      return;
    }

    if (section === "credit-note") {
      router.push(
        `${buildVoucherRoute(mode, "credit-note")}?returnTo=${encodeURIComponent(buildSalesWorkspaceRoute(mode, "credit-note"))}`,
      );
      return;
    }

    if (section === "payment-in") {
      router.push(
        `${buildVoucherRoute(mode, "receipt")}?returnTo=${encodeURIComponent(buildSalesWorkspaceRoute(mode, "payment-in"))}`,
      );
      return;
    }

    if (section !== "pos") {
      const requestKey = `${section}:initial`;
      createRequestRef.current = requestKey;
      setCreatePageRequested(true);
      openCreateSalesForm();
      return;
    }

    openCreateSalesForm();
  }

  function closeSalesFormDialog() {
    if (createSaving) {
      return;
    }

    if (shouldRenderCreateAsPage && (searchParams.get("create") || searchParams.get("duplicate") || searchParams.get("edit"))) {
      if (createPageClosing) {
        return;
      }

      setCreatePageClosing(true);
      setCreatePageRequested(false);
      createRequestRef.current = "";
      formActionRequestRef.current = "";
      router.replace(pathname, { scroll: false });
      if (createPageCloseTimerRef.current !== null) {
        window.clearTimeout(createPageCloseTimerRef.current);
      }
      createPageCloseTimerRef.current = window.setTimeout(() => {
        setCreateOpen(false);
        setCreatePageClosing(false);
        setCustomerPickerOpen(false);
        setActiveInventoryPickerItemId(null);
        setPosQuickItemQuery("");
        setPosQuickPickerOpen(false);
        setSelectedPosRowId(null);
        setActiveRow(null);
        setShowCreateTermsField(false);
        createPageCloseTimerRef.current = null;
      }, createPageCloseAnimationMs);
      return;
    }

    setCreateOpen(false);
    setCustomerPickerOpen(false);
    setActiveInventoryPickerItemId(null);
    setPosQuickItemQuery("");
    setPosQuickPickerOpen(false);
    setSelectedPosRowId(null);
    setActiveRow(null);
    setShowCreateTermsField(false);
    setCreatePageRequested(false);

    if (searchParams.get("create") || searchParams.get("duplicate") || searchParams.get("edit")) {
      createRequestRef.current = "";
      formActionRequestRef.current = "";
      router.replace(pathname, { scroll: false });
    }
  }

  function hydrateSalesFormFromVoucher(voucher: VoucherRecord, duplicate = false) {
    const matchedParty = localOptions.parties.find((party) => party.name.trim().toLowerCase() === voucher.partyName.trim().toLowerCase()) ?? null;

    const nextForm = {
      ...buildCreateFormFromVoucher(voucher, matchedParty?.contact ?? ""),
      billingAddress: matchedParty?.address ?? voucher.supplierAddress ?? "",
      shippingAddress: matchedParty?.address ?? voucher.supplierAddress ?? "",
      receivedAmount: String(Math.max(0, toSafeNumber(voucher.amount) - deriveBalance(voucher, section, query.data ?? []))),
    };
    if (duplicate) {
      // A duplicated or converted document is a new document — reusing the source's
      // invoice number collides with it (the backend uses this field as the actual
      // voucher number when set), so it starts blank and gets a fresh auto-generated
      // number instead, same as any brand-new document.
      nextForm.reference = "";
    }
    setCreateForm(nextForm);
    setShowCreateTermsField(Boolean(nextForm.condition.trim()));
    setEditForm(
      duplicate
        ? null
        : {
            voucherId: voucher.id,
            voucherType: voucher.voucherType,
            voucherDate: voucher.voucherDate,
            reference: voucher.reference ?? voucher.voucherNumber,
            partyName: voucher.partyName,
            narration: voucher.narration ?? "",
            settlementMode: voucher.settlementMode === "cash" ? "cash" : "accounts-payable",
            status: voucher.status,
            sourceVoucher: voucher,
          },
    );
    setCreateOpen(true);
    setActiveRow(null);
  }

  function applyPartySelection(party: PartyRecord) {
    setCreateForm((current) => ({
      ...current,
      partyName: party.name,
      phoneNo: party.contact ?? "",
      billingAddress: party.address ?? "",
      shippingAddress: party.address ?? "",
      loyaltyPoints: current.partyName === party.name ? current.loyaltyPoints : "0",
    }));
    setCustomerPickerOpen(false);
    setCustomerPickerHighlightIndex(-1);
    setSalesSidePickerHighlightIndex(-1);
    setSidePickerQuery(party.name);
    setSidePickerTab("party");
  }

  function handleCustomerInputChange(value: string) {
    const matched = localOptions.parties.find((party) => normalizeLookupValue(party.name) === normalizeLookupValue(value));
    setCreateForm((current) => ({
      ...current,
      partyName: value,
      phoneNo: matched?.contact ?? current.phoneNo,
      billingAddress: matched?.address ?? current.billingAddress,
      shippingAddress: matched?.address ?? current.shippingAddress,
      loyaltyPoints: current.partyName === value ? current.loyaltyPoints : "0",
    }));
    setCustomerPickerOpen(!shouldRenderCreateAsPage);
    setCustomerPickerHighlightIndex(-1);
    setSalesSidePickerHighlightIndex(-1);
    setSidePickerTab("party");
    setSidePickerQuery(value);
    setSidePickerPage(1);
  }

  function handleCustomerPickerKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const options = shouldRenderCreateAsPage ? salesSidePickerOptions.parties : filteredCustomerOptions;
    const highlightedIndex = shouldRenderCreateAsPage ? salesSidePickerHighlightIndex : customerPickerHighlightIndex;

    if (isPickerNavigationKey(event.key)) {
      const navigationKey = event.key;
      event.preventDefault();
      if (shouldRenderCreateAsPage) {
        setSidePickerTab("party");
        setSalesSidePickerHighlightIndex((current) => getNextPickerIndex(current, options.length, navigationKey));
      } else {
        setCustomerPickerOpen(true);
        setCustomerPickerHighlightIndex((current) => getNextPickerIndex(current, options.length, navigationKey));
      }
      return;
    }

    if (event.key === "Enter" && options.length) {
      event.preventDefault();
      applyPartySelection(options[highlightedIndex >= 0 ? highlightedIndex : 0]);
    } else if (event.key === "Escape") {
      setCustomerPickerOpen(false);
      setCustomerPickerHighlightIndex(-1);
      setSalesSidePickerHighlightIndex(-1);
    }
  }

  function applyInventorySelection(itemId: string, selected: InventoryOptionRecord) {
    setCreateForm((current) => ({
      ...current,
      items: current.items.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              itemName: selected.itemName,
              unitPrice: entry.unitPrice || String(toSafeNumber(selected.rate) || ""),
            }
          : entry,
      ),
    }));
    setActiveInventoryPickerItemId(null);
    setInventoryPickerHighlightIndex(-1);
    setSalesSidePickerHighlightIndex(-1);
    setSidePickerTab("item");
    setSidePickerQuery(selected.itemName);
  }

  function handleInventoryPickerKeyDown(event: React.KeyboardEvent<HTMLInputElement>, itemId: string) {
    const options = shouldRenderCreateAsPage ? salesSidePickerOptions.inventory : filteredInventoryOptions[itemId] ?? [];
    const highlightedIndex = shouldRenderCreateAsPage ? salesSidePickerHighlightIndex : inventoryPickerHighlightIndex;

    if (isPickerNavigationKey(event.key)) {
      const navigationKey = event.key;
      event.preventDefault();
      setActiveInventoryPickerItemId(itemId);
      if (shouldRenderCreateAsPage) {
        setSidePickerTab("item");
        setSalesSidePickerHighlightIndex((current) => getNextPickerIndex(current, options.length, navigationKey));
      } else {
        setInventoryPickerHighlightIndex((current) => getNextPickerIndex(current, options.length, navigationKey));
      }
      return;
    }

    if (event.key === "Enter" && options.length) {
      event.preventDefault();
      applyInventorySelection(itemId, options[highlightedIndex >= 0 ? highlightedIndex : 0]);
    } else if (event.key === "Escape") {
      setActiveInventoryPickerItemId(null);
      setInventoryPickerHighlightIndex(-1);
      setSalesSidePickerHighlightIndex(-1);
    } else if ((event.key === "Tab" || event.key === "Enter") && !event.shiftKey && !localOptions.inventory.some(
      (option) => normalizeLookupValue(option.itemName) === normalizeLookupValue(event.currentTarget.value),
    )) {
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.select();
      toast.error("Select an item from the Item picker before continuing.");
    }
  }

  function applySidePickerInventorySelection(selected: InventoryOptionRecord) {
    const targetItem = createForm.items.find((item) => item.id === activeInventoryPickerItemId) ?? createForm.items.find((item) => !item.itemName.trim()) ?? createForm.items[0];
    if (!targetItem) {
      return;
    }

    applyInventorySelection(targetItem.id, selected);
  }

  function removeCreateItem(itemId: string) {
    setCreateForm((current) => ({
      ...current,
      items: current.items.length === 1 ? current.items : current.items.filter((entry) => entry.id !== itemId),
    }));
  }

  function appendQuickInventoryItem(selected: InventoryOptionRecord) {
    setCreateForm((current) => {
      const emptyItem = current.items.find((entry) => !entry.itemName.trim());
      if (emptyItem) {
        return {
          ...current,
          items: current.items.map((entry) =>
            entry.id === emptyItem.id
              ? {
                  ...entry,
                  itemName: selected.itemName,
                  unitPrice: entry.unitPrice || String(toSafeNumber(selected.rate) || ""),
                  quantity: entry.quantity || "1",
                  unit: selected.unit || entry.unit,
                }
              : entry,
          ),
        };
      }

      const nextItem = buildCreateItem(current.items.length + 1);
      return {
        ...current,
        items: [
          ...current.items,
          {
            ...nextItem,
            itemName: selected.itemName,
            unitPrice: String(toSafeNumber(selected.rate) || ""),
            quantity: "1",
            unit: selected.unit,
          },
        ],
      };
    });
    setSelectedPosRowId((current) => current ?? createForm.items[0]?.id ?? null);
    setPosQuickItemQuery("");
    setPosQuickPickerOpen(false);
    setPosQuickPickerHighlightIndex(-1);
  }

  // POS is keyboard-first at a counter, so the labelled function keys have to
  // actually fire while the terminal is open.
  useEffect(() => {
    if (!isPosSection || !createOpen) {
      return;
    }

    function handlePosShortcut(event: KeyboardEvent) {
      const actions: Record<string, (() => void) | undefined> = {
        F1: () => {
          setPosQuickPickerOpen(true);
          posQuickSearchInputRef.current?.focus();
        },
        F2: focusPosQuantity,
        F3: openPosLineDiscount,
        F4: removePosSelectedRow,
        F6: togglePosLineUnit,
        F8: () => focusPosField(posChargesInputRef, "Additional charges field is unavailable"),
        F9: () => focusPosField(posDiscountInputRef, "Bill discount field is unavailable"),
        F12: () => focusPosField(posRemarksInputRef, "Remarks field is unavailable"),
      };

      if (event.ctrlKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        resetSalesForm({ clearDraft: true });
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        void handleCreateSave();
        return;
      }

      const action = actions[event.key];
      if (!action) {
        return;
      }

      event.preventDefault();
      action();
    }

    window.addEventListener("keydown", handlePosShortcut);
    return () => window.removeEventListener("keydown", handlePosShortcut);
  });

  function resolvePosTargetRow() {
    const targetId = selectedPosRowId ?? createForm.items[createForm.items.length - 1]?.id ?? null;
    if (!targetId) {
      return null;
    }

    return createForm.items.find((item) => item.id === targetId) ?? null;
  }

  function focusPosQuantity() {
    const target = resolvePosTargetRow();
    if (!target) {
      toast.error("Add an item to the bill first");
      return;
    }

    setSelectedPosRowId(target.id);
    window.setTimeout(() => {
      posQuantityInputRef.current?.focus();
      posQuantityInputRef.current?.select();
    }, 0);
  }

  function openPosLineDiscount() {
    const target = resolvePosTargetRow();
    if (!target || !target.itemName.trim()) {
      toast.error("Select an item row first");
      return;
    }

    setSelectedPosRowId(target.id);
    setPosLineDiscountDraft(target.discountPercent ?? "0");
    setPosLineDiscountTarget(target.id);
  }

  function applyPosLineDiscount() {
    if (!posLineDiscountTarget) {
      return;
    }

    const value = Number(posLineDiscountDraft || 0);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      toast.error("Discount must be between 0 and 100 percent");
      return;
    }

    updateCreateItem(posLineDiscountTarget, { discountPercent: value ? String(value) : "" });
    setPosLineDiscountTarget(null);
    toast.success(value ? `${value}% discount applied to this item` : "Item discount removed");
  }

  function removePosSelectedRow() {
    const target = resolvePosTargetRow();
    if (!target) {
      toast.error("There is no item row to remove");
      return;
    }

    removeCreateItem(target.id);
    toast.success("Item removed from the bill");
  }

  /**
   * Inventory items can carry an alternate unit plus its conversion factor, so
   * switching units on a POS line also rescales the price actually charged.
   */
  function togglePosLineUnit() {
    const target = resolvePosTargetRow();
    if (!target || !target.itemName.trim()) {
      toast.error("Select an item row first");
      return;
    }

    const matched = localOptions.inventory.find(
      (entry) => normalizeLookupValue(entry.itemName) === normalizeLookupValue(target.itemName),
    );
    // Demo/mock inventory rows do not carry alternate-unit fields, so read them
    // defensively instead of widening the shared option type.
    const matchedExtras = (matched ?? {}) as { alternateUnit?: string; alternateUnitConversion?: number };
    const baseUnit = matched?.unit ?? target.unit ?? "";
    const alternateUnit = matchedExtras.alternateUnit ?? "";
    const conversion = toSafeNumber(matchedExtras.alternateUnitConversion);

    if (!alternateUnit || conversion <= 0) {
      toast.error(`${target.itemName.trim()} has no alternate unit set in the item master`);
      return;
    }

    const currentUnit = target.unit || baseUnit;
    const switchingToAlternate = currentUnit !== alternateUnit;
    const price = toSafeNumber(target.unitPrice);
    const nextPrice = switchingToAlternate ? price / conversion : price * conversion;

    updateCreateItem(target.id, {
      unit: switchingToAlternate ? alternateUnit : baseUnit,
      unitPrice: nextPrice ? String(roundMoney(nextPrice)) : target.unitPrice,
    });
    toast.success(`Unit changed to ${switchingToAlternate ? alternateUnit : baseUnit}`);
  }

  function focusPosField(ref: React.RefObject<HTMLInputElement | null>, message: string) {
    const element = ref.current;
    if (!element) {
      toast.error(message);
      return;
    }

    element.focus();
    element.select();
  }

  function updateCreateItem(itemId: string, patch: Partial<SalesCreateLineItem>) {
    setCreateForm((current) => ({
      ...current,
      items: current.items.map((entry) => {
        if (entry.id !== itemId) {
          return entry;
        }

        const next = { ...entry, ...patch };
        if (patch.itemName !== undefined) {
          const nextItemName = patch.itemName;
          setSidePickerTab("item");
          setSidePickerQuery(nextItemName);
          setSidePickerPage(1);
          setSalesSidePickerHighlightIndex(-1);
          const matchedInventory = localOptions.inventory.find((option) => normalizeLookupValue(option.itemName) === normalizeLookupValue(nextItemName));
          if (matchedInventory && !next.unitPrice) {
            next.unitPrice = String(toSafeNumber(matchedInventory.rate) || "");
          }
          if (matchedInventory?.unit) {
            next.unit = matchedInventory.unit;
          }
        }

        return next;
      }),
    }));
  }

  function openQuickAddCustomer() {
    setQuickAddCustomerName(sidePickerQuery.trim());
    setQuickAddCustomerPhone("");
    setQuickAddCustomerOpen(true);
  }

  async function submitQuickAddCustomer() {
    const name = quickAddCustomerName.trim();
    if (!name) {
      toast.error("Customer name is required");
      return;
    }

    if (!session?.workspaceId) {
      toast.error("Active workspace not found");
      return;
    }

    setQuickAddCustomerSaving(true);
    try {
      let created: PartyRecord;
      if (mode === "api") {
        const response = (await apiRequest(`/parties`, {
          method: "POST",
          body: JSON.stringify({
            workspaceId: session.workspaceId,
            name,
            type: "customer",
            contact: quickAddCustomerPhone.trim(),
          }),
        })) as { id: string };
        created = {
          id: response.id,
          workspaceId: session.workspaceId,
          name,
          type: "customer",
          contact: quickAddCustomerPhone.trim(),
          address: "",
          creditLimit: 0,
          openingBalance: 0,
          status: "active",
        };
      } else {
        const dataset = readDataset(mode);
        created = {
          id: `party-${Date.now()}`,
          workspaceId: session.workspaceId,
          name,
          type: "customer",
          contact: quickAddCustomerPhone.trim(),
          address: "",
          creditLimit: 0,
          openingBalance: 0,
          status: "active",
        };
        writeDataset(mode, { ...dataset, parties: [created, ...dataset.parties] });
      }

      setPartyOptions((current) => [...current, created]);
      applyPartySelection(created);
      setQuickAddCustomerOpen(false);
      toast.success(`${name} added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "This customer could not be added.");
    } finally {
      setQuickAddCustomerSaving(false);
    }
  }

  function openQuickAddItem() {
    setQuickAddItemName(sidePickerQuery.trim());
    setQuickAddItemCategory(quickAddItemCategories[0]?.name ?? "");
    setQuickAddItemUnit("pcs");
    setQuickAddItemOpen(true);

    if (mode === "api" && session?.workspaceId) {
      void listApiInventoryCategories(session.workspaceId)
        .then((categories) => {
          setQuickAddItemCategories(categories);
          setQuickAddItemCategory((current) => current || categories[0]?.name || "");
        })
        .catch(() => {
          setQuickAddItemCategories([]);
        });
    }
  }

  async function submitQuickAddItem() {
    const itemName = quickAddItemName.trim();
    if (!itemName) {
      toast.error("Item name is required");
      return;
    }

    if (!session?.workspaceId) {
      toast.error("Active workspace not found");
      return;
    }

    const unit = quickAddItemUnit.trim() || "pcs";

    setQuickAddItemSaving(true);
    try {
      let created: InventoryOptionRecord;
      if (mode === "api") {
        const category = quickAddItemCategory.trim();
        if (!category) {
          toast.error("Category is required");
          setQuickAddItemSaving(false);
          return;
        }

        const response = await createApiInventoryItem(session.workspaceId, {
          itemCode: buildAssignedItemCode(itemName),
          itemName,
          category,
          unit,
          openingQty: 0,
          openingRate: 0,
          reorderLevel: 0,
          status: "active",
        });
        created = {
          itemCode: response.itemCode,
          itemName: response.itemName,
          category: response.category,
          unit: response.unit,
          qty: response.quantity,
          rate: response.rate,
          reorderLevel: response.reorderLevel,
        };
      } else {
        const dataset = readDataset(mode);
        const itemCode = buildAssignedItemCode(itemName);
        const stockItem = {
          id: `item-${Date.now()}`,
          workspaceId: session.workspaceId,
          itemCode,
          itemName,
          category: quickAddItemCategory.trim() || "General",
          unit,
          openingQty: 0,
          openingRate: 0,
          reorderLevel: 0,
          status: "active" as const,
        };
        writeDataset(mode, { ...dataset, stockItems: [stockItem, ...dataset.stockItems] });
        created = {
          itemCode,
          itemName,
          category: stockItem.category,
          unit,
          qty: 0,
          rate: 0,
          reorderLevel: 0,
        };
      }

      setInventoryOptions((current) => [...current, created]);
      applySidePickerInventorySelection(created);
      setQuickAddItemOpen(false);
      toast.success(`${itemName} added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "This item could not be added.");
    } finally {
      setQuickAddItemSaving(false);
    }
  }

  function handleSalesSidePickerKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const options = sidePickerTab === "party" ? salesSidePickerOptions.parties : salesSidePickerOptions.inventory;
    // +1 makes the trailing "+ Add Customer"/"+ Add Item" row reachable by keyboard,
    // same as any other option — it always sits one slot past the last real result.
    const navigableCount = options.length + 1;

    if (isPickerNavigationKey(event.key)) {
      const navigationKey = event.key;
      event.preventDefault();
      setSalesSidePickerHighlightIndex((current) => getNextPickerIndex(current, navigableCount, navigationKey));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const highlighted = salesSidePickerHighlightIndex >= 0 ? salesSidePickerHighlightIndex : 0;
      if (highlighted >= options.length) {
        if (sidePickerTab === "party") {
          openQuickAddCustomer();
        } else {
          openQuickAddItem();
        }
        return;
      }

      const selected = options[highlighted];
      if (sidePickerTab === "party") {
        applyPartySelection(selected as PartyRecord);
      } else {
        applySidePickerInventorySelection(selected as InventoryOptionRecord);
      }
    } else if (event.key === "Escape") {
      setSalesSidePickerHighlightIndex(-1);
    }
  }

  function renderSalesSidePickerPanel() {
    const sidePickerPageSize = 8;
    const totalItems = sidePickerTab === "party" ? salesSidePickerOptions.parties.length : salesSidePickerOptions.inventory.length;
    const pageStart = (sidePickerPage - 1) * sidePickerPageSize;
    const pagedParties = salesSidePickerOptions.parties.slice(pageStart, pageStart + sidePickerPageSize);
    const pagedInventory = salesSidePickerOptions.inventory.slice(pageStart, pageStart + sidePickerPageSize);

    return (
      <aside data-sales-quick-picker className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[8px] border border-[#d8e1ea] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div data-sales-quick-picker-header className="shrink-0 border-b border-[#e4ebf5] px-4 py-4">
          <div className="text-sm font-semibold uppercase tracking-[0.1em] text-[#6f7d91]">Quick Picker</div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-[6px] bg-[#f3f6fb] p-1">
            <button
              type="button"
              className={cn(
                "rounded-[4px] px-3 py-1.5 text-[13px] font-medium transition",
                sidePickerTab === "party" ? "bg-white text-[#0f6cf6] shadow-sm" : "text-[#6f7d91] hover:text-[#1f2f46]",
              )}
              onClick={() => {
                setSidePickerTab("party");
                setSidePickerQuery(createForm.partyName);
                setSidePickerPage(1);
                setSalesSidePickerHighlightIndex(-1);
              }}
            >
              Customer
            </button>
            <button
              type="button"
              className={cn(
                "rounded-[4px] px-3 py-1.5 text-[13px] font-medium transition",
                sidePickerTab === "item" ? "bg-white text-[#0f6cf6] shadow-sm" : "text-[#6f7d91] hover:text-[#1f2f46]",
              )}
              onClick={() => {
                setSidePickerTab("item");
                setSidePickerQuery("");
                setSidePickerPage(1);
                setSalesSidePickerHighlightIndex(-1);
              }}
            >
              Item
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a3aebd]" />
            <Input
              value={sidePickerQuery}
              onChange={(event) => {
                setSidePickerQuery(event.target.value);
                setSidePickerPage(1);
                setSalesSidePickerHighlightIndex(-1);
              }}
              onKeyDown={handleSalesSidePickerKeyDown}
              placeholder={sidePickerTab === "party" ? "Search customer" : "Search item"}
              className="h-9 rounded-[4px] border-[#d8e1ea] pl-8 text-sm"
            />
          </div>
          {sidePickerTab === "party" ? (
            <button
              type="button"
              aria-selected={salesSidePickerHighlightIndex === salesSidePickerOptions.parties.length}
              className={cn(
                "mt-2 w-full rounded-[4px] px-2 py-1 text-left text-sm font-medium text-[#0f6cf6] transition",
                salesSidePickerHighlightIndex === salesSidePickerOptions.parties.length ? "bg-[#eaf3ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
              )}
              onClick={openQuickAddCustomer}
            >
              + Add Customer
            </button>
          ) : (
            <>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-[6px] bg-[#f3f6fb] p-1 text-xs">
                <button
                  type="button"
                  className={cn(
                    "rounded-[4px] px-2 py-1 font-medium transition",
                    itemPickerNameMode === "name" ? "bg-white text-[#0f6cf6] shadow-sm" : "text-[#6f7d91] hover:text-[#1f2f46]",
                  )}
                  onClick={() => setItemPickerNameMode("name")}
                >
                  Item Name
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-[4px] px-2 py-1 font-medium transition",
                    itemPickerNameMode === "alias" ? "bg-white text-[#0f6cf6] shadow-sm" : "text-[#6f7d91] hover:text-[#1f2f46]",
                  )}
                  onClick={() => setItemPickerNameMode("alias")}
                >
                  Alias
                </button>
              </div>
              <button
                type="button"
                aria-selected={salesSidePickerHighlightIndex === salesSidePickerOptions.inventory.length}
                className={cn(
                  "mt-2 w-full rounded-[4px] px-2 py-1 text-left text-sm font-medium text-[#0f6cf6] transition",
                  salesSidePickerHighlightIndex === salesSidePickerOptions.inventory.length ? "bg-[#eaf3ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                )}
                onClick={openQuickAddItem}
              >
                + Add Product
              </button>
            </>
          )}
        </div>
        <div ref={salesSidePickerListRef} className="min-h-0 flex-1 overflow-y-auto" role="listbox">
          {sidePickerTab === "party" ? (
            pagedParties.length ? (
              pagedParties.map((party, optionIndex) => {
                const pickerIndex = pageStart + optionIndex;
                return (
                <button
                  key={party.id}
                  type="button"
                  role="option"
                  aria-selected={pickerIndex === salesSidePickerHighlightIndex}
                  data-picker-option-index={pickerIndex}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 border-b border-[#eef2f7] px-4 py-2.5 text-left transition hover:bg-[#f5f9ff]",
                    pickerIndex === salesSidePickerHighlightIndex ? "bg-[#eaf3ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                  )}
                  onMouseEnter={() => setSalesSidePickerHighlightIndex(pickerIndex)}
                  onClick={() => applyPartySelection(party)}
                >
                  <span className="w-full truncate text-sm font-medium text-[#1f2f46]">{party.name}</span>
                  <span className="w-full truncate text-xs text-[#8994a6]">{party.contact || "No contact"}</span>
                </button>
                );
              })
            ) : (
              <div className="px-4 py-6 text-center text-sm text-[#8994a6]">No customer found.</div>
            )
          ) : pagedInventory.length ? (
            pagedInventory.map((item, optionIndex) => {
              const pickerIndex = pageStart + optionIndex;
              const showAlias = itemPickerNameMode === "alias" && item.alias;
              const primaryLabel = showAlias ? item.alias : item.itemName;
              const secondaryLabel = showAlias ? item.itemName : item.alias;
              return (
              <button
                key={`${item.itemCode}-${item.itemName}-${optionIndex}`}
                type="button"
                role="option"
                aria-selected={pickerIndex === salesSidePickerHighlightIndex}
                data-picker-option-index={pickerIndex}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-b border-[#eef2f7] px-4 py-3 text-left transition hover:bg-[#f5f9ff]",
                  pickerIndex === salesSidePickerHighlightIndex ? "bg-[#eaf3ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                )}
                onMouseEnter={() => setSalesSidePickerHighlightIndex(pickerIndex)}
                onClick={() => applySidePickerInventorySelection(item)}
              >
                <span className="flex min-w-0 flex-col items-start">
                  <span className="w-full truncate text-sm font-medium text-[#1f2f46]">{primaryLabel}</span>
                  {secondaryLabel ? <span className="w-full truncate text-xs text-[#8994a6]">{secondaryLabel}</span> : null}
                  {item.expiryDate ? (
                    <span className={cn("w-full truncate text-[10px] font-medium", new Date(item.expiryDate) < new Date() ? "text-[#b3261e]" : "text-[#8994a6]")}>
                      Exp: {formatDate(item.expiryDate)}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs font-medium text-[#48566b]">{formatCurrency(toSafeNumber(item.rate))}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      toSafeNumber(item.qty) > 0 ? "bg-[#eef4ff] text-[#315b96]" : "bg-[#fdeceb] text-[#b3261e]",
                    )}
                    title="Stock in hand"
                  >
                    {formatNumber(toSafeNumber(item.qty))} {item.unit || "pcs"}
                  </span>
                </span>
              </button>
              );
            })
          ) : (
            <div className="px-4 py-6 text-center text-sm text-[#8994a6]">No item found.</div>
          )}
        </div>
        {totalItems > sidePickerPageSize ? (
          <TablePagination
            page={sidePickerPage}
            pageSize={sidePickerPageSize}
            totalItems={totalItems}
            pageSizeOptions={[sidePickerPageSize]}
            onPageChange={setSidePickerPage}
            onPageSizeChange={() => {}}
            showPageSizeSelector={false}
            showPageIndicator={false}
            iconOnlyNavigation
            summary={`${sidePickerPage} / ${Math.max(1, Math.ceil(totalItems / sidePickerPageSize))}`}
            className="shrink-0 px-3 py-2 text-xs"
          />
        ) : null}
      </aside>
    );
  }

  function buildPreviewPayload(voucher: VoucherRecord): InvoiceExportPayload {
    const companyProfile = readCompanyProfile(mode, voucher.workspaceId);
    const matchedParty = localOptions.parties.find((party) => party.name.trim().toLowerCase() === voucher.partyName.trim().toLowerCase()) ?? null;
    const exportItems =
      voucher.inventoryItems?.length
        ? voucher.inventoryItems.map((item) => ({
            description: item.itemName,
            quantity: toSafeNumber(item.quantity),
            price: toSafeNumber(item.unitPrice),
            total: toSafeNumber(item.quantity) * toSafeNumber(item.unitPrice),
          }))
        : voucher.lines
            .filter((line) => toSafeNumber(line.debit) > 0 || toSafeNumber(line.credit) > 0)
            .map((line) => ({
              description: line.description || line.ledger,
              quantity: 1,
              price: Math.max(toSafeNumber(line.debit), toSafeNumber(line.credit)),
              total: Math.max(toSafeNumber(line.debit), toSafeNumber(line.credit)),
            }));

    const subtotal = toSafeNumber(voucher.subtotal ?? voucher.amount);
    const discountAmount = toSafeNumber(voucher.discountAmount);
    const total = toSafeNumber(voucher.amount);

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
      note: voucher.condition || voucher.narration || "",
      paymentMode: voucher.settlementMode === "cash" ? "Cash" : "Credit",
      paymentTarget: voucher.settlementMode === "cash" ? "Cash Sale" : "Accounts Receivable",
      buyerSignature: voucher.buyerSignature || "Accounts Team",
      sellerSignature: voucher.sellerSignature || companyProfile.companyName || appConfig.companyName,
      items: exportItems,
      subTotal: subtotal || total,
      discountLabel: discountAmount > 0 ? "Discount" : "No Discount",
      discountAmount,
      total,
    };
  }

  async function refreshPreviewDialog(voucher: VoucherRecord, subtitle: string) {
    const payload = buildPreviewPayload(voucher);
    setPreviewTheme("tally");
    setPreviewDialog({
      title: voucher.reference?.trim() || voucher.voucherNumber,
      subtitle,
      imageSrc: await buildInvoicePreviewDataUrl(payload),
      payload,
      sourceVoucher: voucher,
    });
  }

  async function openPreviewDialog(voucher: VoucherRecord, modeLabel: "created" | "updated") {
    await refreshPreviewDialog(voucher, `${voucher.partyName} ${modeLabel} successfully.`);
  }

  function buildRowShareText(row: SalesDocumentRow) {
    return [
      `${config.label} ${row.documentNumber}`,
      `Party: ${row.partyName}`,
      `Date: ${formatDate(row.documentDate)}`,
      `Amount: ${formatCurrency(row.amount)}`,
      `Balance: ${formatCurrency(row.balance)}`,
      `Status: ${row.status}`,
    ].join("\n");
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

  async function handleShareRow(row: SalesDocumentRow) {
    await shareText({
      title: `${config.label} ${row.documentNumber}`,
      text: buildRowShareText(row),
      copySuccessMessage: `${row.documentNumber} copied for sharing`,
    });
  }

  function handleEmailRow(row: SalesDocumentRow) {
    openMailComposer(`${config.label} ${row.documentNumber}`, buildRowShareText(row));
  }

  function handleWhatsAppRow(row: SalesDocumentRow) {
    openWhatsAppShare(buildRowShareText(row));
  }

  function handleRequestDeleteRow(row: SalesDocumentRow) {
    setActiveRow(null);
    setDeleteConfirmRow(row);
  }

  /**
   * A posted, stock/ledger-affecting document (Sales Invoice, Delivery Note,
   * Sales Return) can't be edited in place once posted — the backend rejects
   * that outright ("Reverse it and create the corrected voucher instead"), the
   * same rule a Receipt Note follows on the purchase side. This posts the
   * mirror-image reversing entry, then opens a duplicate of the ORIGINAL so
   * the corrected version can be re-entered as a fresh document.
   */
  async function handleReverseRow(row: SalesDocumentRow) {
    if (!session?.workspaceId) {
      return;
    }

    setActiveRow(null);
    try {
      await reverseVoucher(row.sourceId, `Reversed from ${config.label} list`);
      await queryClient.invalidateQueries({ queryKey: [mode] });
      await query.refetch();
      toast.success(`${row.documentNumber} reversed — now create the corrected entry`);
      const workflowSuffix = section === "delivery-challan" ? "&workflow=delivery-note" : "";
      router.push(`${buildVoucherRoute(mode, row.openVoucherType)}?duplicate=${row.sourceId}${workflowSuffix}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be reversed");
    }
  }

  /** A posted stock/ledger-affecting document's own delete guard rejects it
   * outright ("Reverse the voucher instead") — same reasoning as
   * handleReverseRow above: undoing a posted document's stock/ledger effect
   * needs a real mirror-image reversal first, a soft-delete alone would leave
   * that effect live while hiding the document that explains it. So this
   * reverses first when that specific guard fires, then retries the delete
   * on the now-reversed document. */
  async function deleteVoucherRecord(row: SalesDocumentRow, workspaceId: string) {
    return deleteVoucher(mode, row.sourceId, workspaceId);
  }

  async function handleConfirmDeleteRow() {
    if (!deleteConfirmRow || !session?.workspaceId) {
      return;
    }

    setDeleteSaving(true);
    try {
      const deletedVoucher = await deleteVoucherRecord(deleteConfirmRow, session.workspaceId);
      if (deletedVoucher && mode !== "api") {
        moveVoucherToRecycleBin(mode, deletedVoucher, session.user.name ?? "Current User");
      }
      toast.success(`${deleteConfirmRow.documentNumber} deleted`);
      // Narrower [mode, "day-book"] invalidation left Trial Balance and other reports
      // showing stale figures after a sale posts — reports read their own cached
      // query key, so only invalidating day-book never marked them stale too.
      await queryClient.invalidateQueries({ queryKey: [mode] });
      await query.refetch();
      setDeleteConfirmRow(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "This document could not be deleted.");
    } finally {
      setDeleteSaving(false);
    }
  }

  async function handlePreviewPadUpload(event: React.ChangeEvent<HTMLInputElement>) {
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
      writeCompanyProfile(mode, session.workspaceId, {
        ...snapshot,
        invoicePadDataUrl: dataUrl,
      });
      await refreshPreviewDialog(previewDialog.sourceVoucher, "Company pad updated for this preview.");
      toast.success("Company pad uploaded");
    } catch {
      toast.error("Company pad could not be uploaded");
    }
  }

  function openVoucherRow(row: SalesDocumentRow, modeType: "view" | "edit" | "duplicate") {
    const queryParam =
      modeType === "duplicate"
        ? `duplicate=${row.sourceId}`
        : modeType === "edit"
          ? `edit=${row.sourceId}`
          : `${row.openMode}=${row.sourceId}`;

    if (row.openVoucherType === "sales") {
      router.push(`${buildSalesInvoiceRoute(mode)}?${queryParam}`);
      return;
    }

    router.push(`${buildVoucherRoute(mode, row.openVoucherType)}?${queryParam}`);
  }

  /**
   * Every non-invoice section (Quotation, Sale Order, Proforma, Delivery Note) opens
   * its full-page form in place — no navigation, just `createPageRequested` flipped on
   * — the same way the "+New" button on those sections already works. Only Sales
   * Invoices has a real full-page voucher route of its own to navigate to; routing
   * every section's edit through that one page (as `openVoucherRow` does) is what
   * silently dropped a Quotation/Sale Order edit onto the Sales Invoices list instead
   * of opening the document being edited.
   */
  async function openEditForRow(row: SalesDocumentRow) {
    if (section === "sale-order") {
      router.push(buildSalesOrderEditRoute(mode, row.sourceId));
      return;
    }

    if (section === "invoices" || section === "payment-in") {
      openVoucherRow(row, "edit");
      return;
    }

    if (!session) {
      return;
    }

    try {
      const voucher = await getVoucher(mode, row.sourceId, session.workspaceId);
      createRequestRef.current = `${section}:edit:${row.sourceId}`;
      setCreatePageRequested(true);
      hydrateSalesFormFromVoucher(voucher);
      setCreateOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be opened for editing");
    }
  }

  async function handleCreateSave() {
    if (!session) {
      return;
    }

    if (!editForm && (section === "sale-order" || section === "invoices")) {
      const rootKind: WorkflowRootKind = section === "sale-order" ? "ORDER_BASED" : "DIRECT";
      const access = evaluateWorkflowRootAccess(
        workflowSettings.salesWorkflow,
        rootKind,
        workflowSettingsLoadState,
      );
      if (!access.allowed) {
        if (access.reason === "SETTINGS_PENDING") {
          toast.error("Company transaction workflow is still loading. Please try again.");
        } else if (access.reason === "SETTINGS_ERROR") {
          toast.error("Company transaction workflow could not be loaded. Retry before creating a new sale.");
        } else {
          toast.error(section === "sale-order"
            ? "Direct Sales Mode does not allow a new Sales Order."
            : "Order Based Sales Mode requires starting from a Sales Order.");
        }
        return;
      }
    }

    if (!editForm && section === "delivery-challan" && !conversionSourceVoucherId) {
      toast.error("Select a Sales Order before creating a Delivery Note.");
      return;
    }

    const currentVoucherType = editForm?.sourceVoucher.voucherType ?? config.createVoucherType;
    const voucherType = currentVoucherType;
    const usesInventory = voucherType === "sales" || voucherType === "credit-note";
    const effectiveAmount = usesInventory ? createTotal : toSafeNumber(createForm.amount);
    if (!createForm.partyName.trim()) {
      toast.error("Customer / party name is required");
      return;
    }

    if (usesInventory) {
      const invalidItemIndex = createForm.items.findIndex(
        (item) => item.itemName.trim() && !localOptions.inventory.some(
          (option) => normalizeLookupValue(option.itemName) === normalizeLookupValue(item.itemName),
        ),
      );
      if (invalidItemIndex >= 0) {
        const invalidItem = createForm.items[invalidItemIndex];
        toast.error(`"${invalidItem.itemName.trim()}" is not in the item list. Select an item from the Item picker.`);
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>(`input[data-sales-item-id='${invalidItem.id}']`)?.focus();
        });
        return;
      }
    }

    if (effectiveAmount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    if (voucherType === "credit-note" && !createForm.appliedInvoiceId) {
      toast.error("Select the original Sales Invoice first");
      return;
    }

    // A Receipt linked to a specific Sales Invoice can never collect more than
    // that invoice still has due, and never against one already fully paid —
    // this is the guard against a duplicate/over collection the workflow spec
    // calls for.
    if (voucherType === "receipt" && createForm.appliedInvoiceId) {
      const allVouchers = query.data ?? [];
      const targetInvoice = allVouchers.find((record) => record.id === createForm.appliedInvoiceId);
      if (!targetInvoice) {
        toast.error("Selected invoice could not be found");
        return;
      }
      const dueForTarget = computeInvoiceDue(targetInvoice, allVouchers, editForm?.sourceVoucher.id);
      if (moneyToMinorUnits(dueForTarget) <= 0) {
        toast.error("This invoice is already fully paid — a duplicate collection can't be recorded against it.");
        return;
      }
      if (moneyToMinorUnits(effectiveAmount) > moneyToMinorUnits(dueForTarget)) {
        toast.error(`This invoice only has ${formatCurrency(dueForTarget)} due.`);
        return;
      }
    }

    const template = getVoucherTemplate(voucherType);
    // The receivable/control line must be named after the actual customer (matching
    // the convention voucher-entry-screen.tsx already uses) — parties-screen.tsx's
    // outstanding-balance lookup finds a party's dr/cr by matching a line's ledger
    // name to the party's own name, so a generic "Accounts Receivable" label here
    // makes every customer's balance silently read as zero.
    const partyLedgerName = createForm.partyName.trim();
    const debitLedger = voucherType === "sales"
      ? partyLedgerName || (template.lines[0]?.ledger ?? "Accounts Receivable")
      : voucherType === "receipt" && createForm.moneyAccountName
        ? createForm.moneyAccountName
        : (template.lines[0]?.ledger ?? "Accounts Receivable");
    const creditLedger = voucherType === "sales" ? (template.lines[1]?.ledger ?? "Sales Account") : partyLedgerName || (template.lines[1]?.ledger ?? "Accounts Receivable");
    const inventoryItems =
      usesInventory
        ? createForm.items
            .filter((item) => item.itemName.trim() && toSafeNumber(item.quantity) > 0)
            .map((item) => {
              // The voucher schema has no per-line discount column, so a POS line
              // discount is saved as the net price actually charged.
              const lineDiscount = Math.min(Math.max(toSafeNumber(item.discountPercent), 0), 100);
              return {
                id: item.id,
                sourceInventoryLineId: item.sourceInventoryLineId,
                itemName: item.itemName.trim(),
                quantity: toSafeNumber(item.quantity),
                unitPrice: toSafeNumber(item.unitPrice) * (1 - lineDiscount / 100),
              };
            })
        : undefined;

    if (usesInventory && !inventoryItems?.length) {
      toast.error("Add at least one item");
      return;
    }

    // The party settles the rounded figure while the revenue/return line keeps the
    // real goods value; the difference goes to the Round Off ledger so the voucher
    // still balances. A zero delta reproduces the previous single-amount behaviour.
    const postedRoundOff = usesInventory ? createRoundOffDelta : 0;
    const goodsAmount = roundMoney(effectiveAmount - postedRoundOff);
    const partyOnDebitSide = voucherType === "sales";
    const roundOffOnCreditSide = partyOnDebitSide ? postedRoundOff > 0 : postedRoundOff < 0;
    const roundOffLines = postedRoundOff === 0
      ? []
      : [{
          id: "line-round-off",
          ledger: "Round Off",
          description: postedRoundOff > 0 ? "Invoice rounded up" : "Invoice rounded down",
          debit: roundOffOnCreditSide ? 0 : Math.abs(postedRoundOff),
          credit: roundOffOnCreditSide ? Math.abs(postedRoundOff) : 0,
          costCenter: "Head Office",
          project: "Trading",
          billReference: createForm.reference.trim(),
        }];

    const receivesMoneyNow = voucherType === "receipt" || (voucherType === "sales" && createForm.settlementMode !== "accounts-payable");
    if (mode === "api" && receivesMoneyNow && (!createForm.moneyAccountId || !createForm.moneyAccountName)) {
      toast.error("Select the actual Cash, Bank, or MFS ledger before saving.");
      return;
    }

    // Which stage of the sales flow this record actually is — read back by
    // buildSalesRows to give Quotation/Proforma/Sale Order/Delivery Note their
    // real (non-financial) status label, and by the inventory snapshot to decide
    // whether this row should move stock at all. A plain Invoice/Payment-In/
    // Credit Note keeps no documentKind, matching the existing Purchase Bill
    // convention (undefined here, not the string "invoice").
    const documentKind =
      section === "quotation"
        ? "quotation"
        : section === "proforma"
          ? "proforma"
          : section === "sale-order"
            ? "sale-order"
            : section === "delivery-challan"
              ? "delivery-note"
              : undefined;
    // A Quotation, Proforma, Sale Order, or Delivery Note is only a record of
    // intent/handover — it must never touch the books (Section 1-2 of the sales
    // workflow spec). Only a real Sales Invoice (documentKind undefined),
    // Credit Note, or Receipt posts an actual debit/credit pair.
    const isNonFinancialSalesStage = voucherType === "sales" && documentKind !== undefined;
    const selectedParty = localOptions.parties.find(
      (party) => normalizeLookupValue(party.name) === normalizeLookupValue(createForm.partyName),
    );

    const payload: VoucherFormInput = {
      workspaceId: session.workspaceId,
      voucherType,
      documentKind,
      warehouseId: createForm.warehouseId || editForm?.sourceVoucher.warehouseId || undefined,
      sourceVoucherId:
        voucherType === "receipt" || voucherType === "credit-note"
          ? (createForm.appliedInvoiceId ?? undefined)
          : editForm
            ? (editForm.sourceVoucher.sourceVoucherId ?? undefined)
            : (conversionSourceVoucherId ?? undefined),
      voucherDate: createForm.voucherDate,
      partyName: createForm.partyName.trim(),
      partyId: selectedParty?.id,
      reference: createForm.reference.trim() || undefined,
      narration: createForm.narration.trim() || `${config.label} created from popup`,
      status: createForm.status,
      settlementMode: createForm.settlementMode,
      discountType: "fixed",
      discountAmount: createDiscount + loyaltyDiscount,
      roundOffAmount: usesInventory && createRoundOffEnabled ? postedRoundOff : undefined,
      loyaltyPointsRedeemed: validLoyaltyPoints,
      loyaltyDiscountAmount: loyaltyDiscount,
      subtotal: usesInventory ? createSubtotal : effectiveAmount,
      totalAmount: effectiveAmount,
      supplierAddress:
        localOptions.parties.find((party) => party.name.trim().toLowerCase() === createForm.partyName.trim().toLowerCase())?.address ??
        editForm?.sourceVoucher.supplierAddress ??
        "",
      buyerSignature: editForm?.sourceVoucher.buyerSignature ?? "Accounts Team",
      sellerSignature: editForm?.sourceVoucher.sellerSignature ?? appConfig.companyName,
      condition: createForm.condition.trim(),
      inventoryItems,
      lines: isNonFinancialSalesStage
        ? []
        : [
            {
              id: "line-1",
              accountId: voucherType === "receipt" ? createForm.moneyAccountId || undefined : undefined,
              moneyAccountType: voucherType === "receipt" ? createForm.moneyAccountType : undefined,
              ledger: debitLedger,
              description: template.lines[0]?.description ?? "Primary entry",
              debit: partyOnDebitSide ? effectiveAmount : goodsAmount,
              credit: 0,
              costCenter: template.lines[0]?.costCenter ?? "Head Office",
              project: template.lines[0]?.project ?? "Trading",
              billReference: createForm.reference.trim(),
            },
            {
              id: "line-2",
              ledger: creditLedger,
              description: template.lines[1]?.description ?? "Balancing entry",
              debit: 0,
              credit: partyOnDebitSide ? goodsAmount : effectiveAmount,
              costCenter: template.lines[1]?.costCenter ?? "Head Office",
              project: template.lines[1]?.project ?? "Trading",
              billReference: createForm.reference.trim(),
            },
            ...roundOffLines,
          ],
    };

    if (mode === "api" && documentKind === "delivery-note" && createForm.warehouseId) {
      try {
        const stockRows = await listWarehouseStock(session.workspaceId, createForm.warehouseId);
        const shortages = (inventoryItems ?? []).flatMap((item) => {
          const stock = stockRows.find((row) =>
            row.inventoryItemId === item.id || normalizeLookupValue(row.itemName) === normalizeLookupValue(item.itemName),
          );
          const available = stock?.quantity ?? 0;
          return available + 0.000001 < item.quantity
            ? [`${item.itemName}: available ${formatNumber(available)}, required ${formatNumber(item.quantity)}, after posting ${formatNumber(available - item.quantity)}`]
            : [];
        });
        if (shortages.length > 0) {
          const confirmed = window.confirm(
            `Stock will become negative. The latest valid moving-average cost will remain unchanged.\n\n${shortages.join("\n")}\n\nDo you want to post the Delivery Challan?`,
          );
          if (!confirmed) return;
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Current warehouse stock could not be checked");
        return;
      }
    }

    setCreateSaving(true);
    // Stamped before anything else so it covers the entire close -> preview ->
    // reset sequence below, including the async gap while the preview image
    // renders — see suppressReopenUntilRef's declaration for why this exists.
    suppressReopenUntilRef.current = Date.now() + 4000;
    try {
      const savedVoucher = editForm ? await updateVoucher(mode, editForm.voucherId, payload) : await createVoucher(mode, payload);

      // A brand-new Cash Sales Invoice is money received on the spot — post the
      // matching real Receipt automatically (linked via sourceVoucherId) so it
      // shows Paid right away instead of leaving an uncollected receivable.
      // Only on first creation, not on every edit-save of an existing invoice.
      if (!editForm && voucherType === "sales" && documentKind === undefined && createForm.settlementMode === "cash") {
        await createVoucher(mode, {
          ...payload,
          voucherType: "receipt",
          documentKind: undefined,
          sourceVoucherId: savedVoucher.id,
          reference: undefined,
          narration: `Cash collection for ${savedVoucher.voucherNumber}`,
          lines: [
            {
              id: "line-1",
              accountId: createForm.moneyAccountId || undefined,
              moneyAccountType: createForm.moneyAccountType,
              ledger: createForm.moneyAccountName,
              description: "Cash sale settlement",
              debit: effectiveAmount,
              credit: 0,
              costCenter: "Head Office",
              project: "Trading",
              billReference: savedVoucher.voucherNumber,
            },
            {
              id: "line-2",
              ledger: partyLedgerName,
              description: "Cash sale settlement",
              debit: 0,
              credit: effectiveAmount,
              costCenter: "Head Office",
              project: "Trading",
              billReference: savedVoucher.voucherNumber,
            },
          ],
        });
      }

      // Narrower [mode, "day-book"] invalidation left Trial Balance and other reports
      // showing stale figures after a sale posts — reports read their own cached
      // query key, so only invalidating day-book never marked them stale too.
      await queryClient.invalidateQueries({ queryKey: [mode] });
      await query.refetch();
      setCreateOpen(false);
      setCreatePageRequested(false);
      createRequestRef.current = "";
      formActionRequestRef.current = "";
      if (searchParams.get("create") || searchParams.get("duplicate") || searchParams.get("edit") || searchParams.get("fromVoucher")) {
        router.replace(pathname, { scroll: false });
      }
      if (!skipPreviewAfterSave) {
        await openPreviewDialog(savedVoucher, editForm ? "updated" : "created");
      }
      resetSalesForm({ clearDraft: true });
      if (savedVoucher.status === "pending") {
        toast.success(`${editForm ? "Sale updated" : `${config.createLabel} saved`} — pending approval before it posts.`);
      } else {
        toast.success(editForm ? "Sale updated successfully" : `${config.createLabel} completed from popup`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : editForm ? "Update failed" : "Create failed");
    } finally {
      setCreateSaving(false);
    }
  }

  useEffect(() => {
    return () => {
      if (createPageCloseTimerRef.current !== null) {
        window.clearTimeout(createPageCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const createValue = searchParams.get("create");
    if (createPageClosing) {
      return;
    }

    // A just-completed save clears createRequestRef so the *next* genuine "+ Add"
    // click can reopen a fresh form — but router.replace() stripping ?create=1 from
    // the URL isn't synchronous with that ref clear, so this effect could still see
    // the stale "create=1" URL for a render or two right as the save's own preview
    // dialog is opening, misread it as an unhandled request, and reopen a blank form
    // on top of it. createSaving covers most of that window, but the URL can take
    // noticeably longer than createSaving does to settle after router.replace() —
    // suppressReopenUntilRef is the hard backstop for the remainder of it.
    if (createSaving || Date.now() < suppressReopenUntilRef.current) {
      return;
    }

    if (createValue !== "1" && createValue !== "true") {
      if (createPageRequested && createOpen && createRequestRef.current) {
        return;
      }

      setCreatePageClosing(false);
      setCreatePageRequested(false);
      if (createOpen && !editForm && createRequestRef.current) {
        setCreateOpen(false);
        setCustomerPickerOpen(false);
        setActiveInventoryPickerItemId(null);
        setPosQuickItemQuery("");
        setPosQuickPickerOpen(false);
        setSelectedPosRowId(null);
        setActiveRow(null);
        createRequestRef.current = "";
      }
      return;
    }

    // A Delivery Note is never a root document. A bare ?create=1 URL has no
    // Sales Order to lock as its source, so send the operator to the order list.
    if (section === "delivery-challan") {
      const requestKey = "blocked:delivery-note-without-order";
      if (workflowCreateGuardRef.current !== requestKey) {
        workflowCreateGuardRef.current = requestKey;
        toast.info("Select a Sales Order and use Convert to Delivery Note.");
      }
      router.replace(buildSalesWorkspaceRoute(mode, "sale-order"));
      return;
    }

    if (section === "sale-order") {
      const access = evaluateWorkflowRootAccess(
        workflowSettings.salesWorkflow,
        "ORDER_BASED",
        workflowSettingsLoadState,
      );
      if (!access.allowed) {
        // Wait without opening the form; once the query settles this same effect
        // re-runs and either opens the allowed order or rejects the deep link.
        if (access.reason === "SETTINGS_PENDING") {
          return;
        }
        const requestKey = `blocked:sale-order:${access.reason}`;
        if (workflowCreateGuardRef.current !== requestKey) {
          workflowCreateGuardRef.current = requestKey;
          if (access.reason === "SETTINGS_ERROR") {
            toast.error("Company transaction workflow could not be loaded. Retry before creating a new Sales Order.");
          } else {
            toast.info("Sales workflow is in Direct Mode. Existing Sales Order history remains available, but a new order cannot be started.");
          }
        }
        router.replace(buildSalesWorkspaceRoute(mode, "sale-order"));
        return;
      }
    }

    if (section === "invoices") {
      const openKey = searchParams.get("open");
      router.replace(openKey ? `${buildVoucherRoute(mode, "sales")}?open=${encodeURIComponent(openKey)}` : buildVoucherRoute(mode, "sales"));
      return;
    }

    if (section === "payment-in") {
      router.replace(buildVoucherRoute(mode, "receipt"));
      return;
    }

    setCreatePageRequested(true);
    const requestKey = `${section}:${searchParams.get("open") ?? "initial"}`;
    if (createRequestRef.current === requestKey) {
      return;
    }

    openCreateSalesForm();
    createRequestRef.current = requestKey;
  }, [createOpen, createPageClosing, createPageRequested, createSaving, editForm, mode, router, searchParams, section, workflowSettings.salesWorkflow, workflowSettingsLoadState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSkipPreviewAfterSave(window.localStorage.getItem(salesPreviewPreferenceKey) === "1");
  }, [salesPreviewPreferenceKey]);

  useEffect(() => {
    if (!createOpen || editForm) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(salesFormDraftKey, JSON.stringify(createForm));
  }, [createForm, createOpen, editForm, salesFormDraftKey]);

  useEffect(() => {
    if (section !== "invoices" || !session) {
      return;
    }

    const duplicateId = searchParams.get("duplicate");
    const editId = searchParams.get("edit");
    const sourceId = duplicateId ?? editId;
    if (!sourceId) {
      if (formActionRequestRef.current) {
        formActionRequestRef.current = "";
        setCreateOpen(false);
        setEditForm(null);
        setCustomerPickerOpen(false);
        setActiveInventoryPickerItemId(null);
        setActiveRow(null);
      }
      return;
    }

    const actionKey = `${section}:${duplicateId ? "duplicate" : "edit"}:${sourceId}`;
    if (formActionRequestRef.current === actionKey) {
      return;
    }

    formActionRequestRef.current = actionKey;
    let cancelled = false;

    void (async () => {
      try {
        const voucher = await getVoucher(mode, sourceId, session.workspaceId);
        if (cancelled) {
          return;
        }

        hydrateSalesFormFromVoucher(voucher, Boolean(duplicateId));
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Sales invoice could not be opened");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, searchParams, section, session]);

  // Start a Sales Return directly from its original Sales Invoice. The source
  // customer, invoice number, items and original rates are locked in; only the
  // quantities being returned are entered on the new return document.
  useEffect(() => {
    if (section !== "credit-note" || !session) return;
    const sourceId = searchParams.get("fromVoucher");
    if (!sourceId || createSaving || Date.now() < suppressReopenUntilRef.current) return;
    const actionKey = `credit-note:fromVoucher:${sourceId}`;
    if (formActionRequestRef.current === actionKey) return;
    formActionRequestRef.current = actionKey;

    void (async () => {
      try {
        const invoice = await getVoucher(mode, sourceId, session.workspaceId);
        if (formActionRequestRef.current !== actionKey) return;
        if (invoice.voucherType !== "sales" || invoice.documentKind) {
          throw new Error("Sales Return must start from a Sales Invoice");
        }
        const matchedParty = localOptions.parties.find((party) => normalizeLookupValue(party.name) === normalizeLookupValue(invoice.partyName));
        setCreateForm({
          ...buildCreateFormFromVoucher(invoice, matchedParty?.contact ?? ""),
          voucherDate: new Date().toISOString().slice(0, 10),
          reference: invoice.voucherNumber,
          narration: `Sales return against ${invoice.voucherNumber}`,
          status: "pending",
          settlementMode: "accounts-payable",
          discount: "0",
          amount: "",
          appliedInvoiceId: invoice.id,
          items: (invoice.inventoryItems ?? []).map((item, index) => ({
            id: item.inventoryItemId ?? item.id ?? `return-item-${index}`,
            itemName: item.itemName,
            quantity: "0",
            unitPrice: String(item.unitPrice),
            unit: localOptions.inventory.find((option) => normalizeLookupValue(option.itemName) === normalizeLookupValue(item.itemName))?.unit,
          })),
        });
        setConversionSourceVoucherId(null);
        setEditForm(null);
        setCreatePageRequested(true);
        setCreateOpen(true);
      } catch (error) {
        if (formActionRequestRef.current === actionKey) {
          toast.error(error instanceof Error ? error.message : "Sales Invoice could not be opened for return");
        }
      }
    })();
  }, [createSaving, localOptions.inventory, localOptions.parties, mode, searchParams, section, session]);

  // A Sale Order converts into a Delivery Note the same way a Purchase Order
  // converts into a Receipt Note: the row action links here with ?fromVoucher=,
  // and the source document's party/items get pulled in as a fresh draft — a new
  // document, not an edit of the order, linked back via sourceVoucherId on save.
  useEffect(() => {
    if (section !== "delivery-challan" || !session) {
      return;
    }

    // Same reasoning as the createSaving/suppressReopenUntilRef check in the
    // create=1 effect above: right after a save, this can still see a not-yet-
    // cleared ?fromVoucher= for a beat and re-hydrate a fresh draft from it on
    // top of the save's own success preview.
    if (createSaving || Date.now() < suppressReopenUntilRef.current) {
      return;
    }

    const sourceId = searchParams.get("fromVoucher");
    if (!sourceId) {
      if (formActionRequestRef.current === `delivery-challan:fromVoucher`) {
        formActionRequestRef.current = "";
        setConversionSourceVoucherId(null);
      }
      return;
    }

    const actionKey = `delivery-challan:fromVoucher:${sourceId}`;
    if (formActionRequestRef.current === actionKey) {
      return;
    }

    formActionRequestRef.current = actionKey;

    // No cleanup-driven cancellation here on purpose: session/searchParams are new
    // object references on every render during the initial load burst, which would
    // re-run this effect and cancel the in-flight fetch via a plain closure flag
    // before it ever resolved. formActionRequestRef is stable across those renders,
    // so comparing against it at resolve-time correctly only cancels when a genuinely
    // different fromVoucher supersedes this one.
    void (async () => {
      try {
        const voucher = await getVoucher(mode, sourceId, session.workspaceId);
        if (formActionRequestRef.current !== actionKey) {
          return;
        }

        hydrateSalesFormFromVoucher(voucher, true);
        setConversionSourceVoucherId(sourceId);
      } catch (error) {
        if (formActionRequestRef.current === actionKey) {
          toast.error(error instanceof Error ? error.message : "Sale order could not be opened");
        }
      }
    })();
  }, [mode, searchParams, section, session]);

  /**
   * A Sale Order can spawn more than one Delivery Note over time (partial
   * shipments) — the freshly hydrated draft above starts from the order's full
   * item quantities, so once the day-book data is loaded this subtracts what's
   * already gone out on earlier delivery notes against this same order, the
   * same way the day-book table's own "X of Y delivered" figures are computed
   * (buildDeliveredBySaleOrder). Mirrors the Purchase Order -> Receipt Note
   * quantity adjustment. Applied once per loaded order (tracked via the ref)
   * so a later, unrelated refresh of query.data can't subtract the same
   * delivered quantity twice from a value the user may have already edited.
   */
  useEffect(() => {
    if (section !== "delivery-challan" || !conversionSourceVoucherId) {
      return;
    }
    if (deliveryQtyAdjustedForRef.current === conversionSourceVoucherId) {
      return;
    }

    const alreadyDeliveredByLine = new Map<string, number>();
    (query.data ?? [])
      .filter(
        (entry) =>
          entry.documentKind === "delivery-note" &&
          entry.sourceVoucherId === conversionSourceVoucherId &&
          entry.status === "posted",
      )
      .forEach((entry) => {
        (entry.inventoryItems ?? []).forEach((item) => {
          const key = item.sourceInventoryLineId ?? `name:${item.itemName.trim().toLowerCase()}`;
          alreadyDeliveredByLine.set(key, (alreadyDeliveredByLine.get(key) ?? 0) + Number(item.quantity || 0));
        });
      });

    if (alreadyDeliveredByLine.size === 0) {
      return;
    }

    deliveryQtyAdjustedForRef.current = conversionSourceVoucherId;
    setCreateForm((current) => ({
      ...current,
      items: current.items.map((item) => {
        const exactKey = item.sourceInventoryLineId;
        const already = (exactKey ? alreadyDeliveredByLine.get(exactKey) : undefined) ??
          alreadyDeliveredByLine.get(`name:${item.itemName.trim().toLowerCase()}`) ?? 0;
        if (already <= 0) {
          return item;
        }
        const remaining = Math.max(0, toSafeNumber(item.quantity) - already);
        return { ...item, quantity: String(remaining) };
      }),
    }));
  }, [conversionSourceVoucherId, query.data, section]);

  function openColumnFilter(columnId: FilterableColumnId, event: React.MouseEvent<HTMLButtonElement>) {
    if (columnFilterPopover?.columnId === columnId) {
      setColumnFilterPopover(null);
      return;
    }

    const current = columnFilters[columnId] ?? { operator: "contains" as const, value: "" };
    const bounds = event.currentTarget.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const popoverWidth = 260;
    const maxLeft = Math.max(16, viewportWidth - popoverWidth - 16);
    const centeredLeft = bounds.left + bounds.width / 2 - popoverWidth / 2;
    const preferredLeft = bounds.right + popoverWidth > viewportWidth - 16 ? bounds.right - popoverWidth : centeredLeft;
    setColumnFilterDraft(current);
    setColumnFilterPopover({
      columnId,
      left: Math.min(Math.max(16, preferredLeft), maxLeft),
      top: bounds.bottom + 8,
    });
  }

  function renderHeaderFilterButton(columnId: FilterableColumnId) {
    const active = Boolean(columnFilters[columnId]?.value.trim());
    return (
      <button
        type="button"
        aria-label={`Filter ${columnId}`}
        onMouseDown={(event) => event.stopPropagation()}
        className={cn("rounded p-0.5 transition", active ? "bg-primary-soft text-primary" : "text-[#73839a] hover:bg-canvas hover:text-foreground")}
        onClick={(event) => {
          event.stopPropagation();
          openColumnFilter(columnId, event);
        }}
      >
        <Filter className="h-3.5 w-3.5" />
      </button>
    );
  }

  useEffect(() => {
    const exportHandler = () => exportRows(rows, `${config.slug}.csv`);
    window.addEventListener("erp-export-request", exportHandler as EventListener);
    return () => window.removeEventListener("erp-export-request", exportHandler as EventListener);
  }, [config.label, config.slug, rows]);

  useEffect(() => {
    function closePopover() {
      setColumnFilterPopover(null);
    }

    window.addEventListener("scroll", closePopover, true);
    window.addEventListener("resize", closePopover);
    return () => {
      window.removeEventListener("scroll", closePopover, true);
      window.removeEventListener("resize", closePopover);
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;

      if (event.target instanceof Element && event.target.closest('button[aria-label^="Filter "]')) {
        return;
      }

      if (columnFilterPopover && !columnFilterPopoverRef.current?.contains(target as Node)) {
        setColumnFilterPopover(null);
      }

      if (
        workflowMenuOpen &&
        !workflowMenuRef.current?.contains(target as Node) &&
        !workflowMenuPanelRef.current?.contains(target as Node)
      ) {
        setWorkflowMenuOpen(false);
      }

      if (posQuickPickerOpen && !posQuickItemPickerRef.current?.contains(target as Node)) {
        setPosQuickPickerOpen(false);
        setPosQuickPickerHighlightIndex(-1);
      }

      if (activeRow && !rowActionsMenuRef.current?.contains(target as Node)) {
        setActiveRow(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [activeRow, columnFilterPopover, posQuickPickerOpen, workflowMenuOpen]);

  useEffect(() => {
    if (!createForm.items.length) {
      setSelectedPosRowId(null);
      return;
    }

    if (!selectedPosRowId || !createForm.items.some((item) => item.id === selectedPosRowId)) {
      setSelectedPosRowId(createForm.items[0]?.id ?? null);
    }
  }, [createForm.items, selectedPosRowId]);

  useEffect(() => {
    setWorkflowMenuOpen(false);
  }, [section]);

  useLayoutEffect(() => {
    if (!workflowMenuOpen) {
      setWorkflowMenuPosition(null);
      return;
    }

    const updateWorkflowMenuPosition = () => {
      const trigger = workflowMenuButtonRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const viewportPadding = 12;
      const desktopWidth = 280;
      const mobileWidth = Math.min(320, viewportWidth - viewportPadding * 2);
      const width = viewportWidth < 640 ? mobileWidth : desktopWidth;
      const estimatedHeight = 360;

      const preferredLeft =
        viewportWidth < 640 || rect.right + 12 + width > viewportWidth - viewportPadding
          ? Math.min(Math.max(viewportPadding, rect.left), viewportWidth - width - viewportPadding)
          : rect.right + 12;
      const preferredTop =
        viewportWidth < 640
          ? rect.bottom + 8
          : Math.min(Math.max(viewportPadding, rect.top), viewportHeight - estimatedHeight - viewportPadding);

      setWorkflowMenuPosition({
        left: preferredLeft,
        top: preferredTop,
        width,
      });
    };

    updateWorkflowMenuPosition();
    window.addEventListener("resize", updateWorkflowMenuPosition);
    window.addEventListener("scroll", updateWorkflowMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateWorkflowMenuPosition);
      window.removeEventListener("scroll", updateWorkflowMenuPosition, true);
    };
  }, [workflowMenuOpen]);

  useEffect(() => {
    if (!session?.workspaceId) {
      setPartyOptions([]);
      return;
    }

    if (mode === "api") {
      const type = config.createVoucherType === "sales" || config.createVoucherType === "receipt" || config.createVoucherType === "credit-note" ? "customer" : "supplier";
      let active = true;

      void apiRequest<Array<{ id: string; ledgerAccountId?: string | null; name: string; contact: string | null; address: string | null; creditLimit: number; status: string }>>(
        `/parties?workspaceId=${encodeURIComponent(session.workspaceId)}&type=${type}`,
      )
        .then((rows) => {
          if (!active) {
            return;
          }

          setPartyOptions(
            rows.map((party) => ({
              id: party.id,
              workspaceId: session.workspaceId,
              ledgerAccountId: party.ledgerAccountId ?? null,
              name: party.name,
              type: type === "customer" ? "customer" : "supplier",
              contact: party.contact ?? "",
              address: party.address ?? "",
              creditLimit: party.creditLimit,
              status: party.status === "ACTIVE" ? "active" : "inactive",
            })),
          );
        })
        .catch((error) => {
          if (!active) {
            return;
          }

          setPartyOptions([]);
          toast.error(error instanceof Error ? error.message : "Could not load party list");
        });

      return () => {
        active = false;
      };
    }

    const dataset = readDataset(mode);
    setPartyOptions(getPartyOptions(dataset, session.workspaceId, config.createVoucherType));
  }, [config.createVoucherType, mode, session?.workspaceId]);

  useEffect(() => {
    if (!session?.workspaceId) {
      setInventoryOptions([]);
      return;
    }

    if (mode === "api") {
      let active = true;

      void apiRequest<
        Array<{
          itemCode: string;
          itemName: string;
          alias?: string;
          category: string;
          unit: string;
          quantity: number;
          rate: number;
          reorderLevel: number;
          alternateUnit?: string;
          alternateUnitConversion?: number;
          expiryDate?: string | null;
        }>
      >(`/inventory/items?workspaceId=${encodeURIComponent(session.workspaceId)}`)
        .then((rows) => {
          if (!active) {
            return;
          }

          setInventoryOptions(rows.map((item) => ({ ...item, qty: item.quantity })));
        })
        .catch((error) => {
          if (!active) {
            return;
          }

          setInventoryOptions([]);
          toast.error(error instanceof Error ? error.message : "Could not load stock item list");
        });

      return () => {
        active = false;
      };
    }

    const dataset = readDataset(mode);
    setInventoryOptions(getInventoryOptions(dataset, session.workspaceId));
  }, [mode, session?.workspaceId]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (customerPickerOpen && !customerPickerRef.current?.contains(target)) {
        setCustomerPickerOpen(false);
        setCustomerPickerHighlightIndex(-1);
      }

      if (invoicePickerOpen && !invoicePickerRef.current?.contains(target)) {
        setInvoicePickerOpen(false);
      }

      if (
        activeInventoryPickerItemId &&
        !inventoryPickerRef.current?.contains(target) &&
        !inventoryPickerPanelRef.current?.contains(target)
      ) {
        setActiveInventoryPickerItemId(null);
        setInventoryPickerHighlightIndex(-1);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [activeInventoryPickerItemId, customerPickerOpen, invoicePickerOpen]);

  useEffect(() => {
    if (!activeInventoryPickerItemId) {
      setInventoryPickerPosition(null);
      return;
    }

    const updateInventoryPickerPosition = () => {
      const trigger = inventoryPickerRef.current;
      if (!trigger) {
        setInventoryPickerPosition(null);
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const viewportPadding = 12;
      const width = Math.min(Math.max(rect.width, 280), viewportWidth - viewportPadding * 2);
      const left = Math.min(Math.max(viewportPadding, rect.left), viewportWidth - width - viewportPadding);
      const spaceBelow = viewportHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const desiredHeight = Math.min(320, Math.max(120, activeInventoryOptions.length * 58 + 16));
      const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(320, (openUpward ? spaceAbove : spaceBelow) - 8));
      const panelHeight = Math.min(desiredHeight, maxHeight);
      const top = openUpward
        ? Math.max(viewportPadding, rect.top - panelHeight - 8)
        : Math.min(viewportHeight - panelHeight - viewportPadding, rect.bottom + 8);

      setInventoryPickerPosition({
        top,
        left,
        width,
        maxHeight,
      });
    };

    updateInventoryPickerPosition();
    window.addEventListener("resize", updateInventoryPickerPosition);
    window.addEventListener("scroll", updateInventoryPickerPosition, true);
    return () => {
      window.removeEventListener("resize", updateInventoryPickerPosition);
      window.removeEventListener("scroll", updateInventoryPickerPosition, true);
    };
  }, [activeInventoryOptions.length, activeInventoryPickerItemId]);

  if (!session || query.isLoading) {
    return <LoadingPanel lines={10} />;
  }

  if (query.error) {
    return (
      <ErrorPanel
        title={`${config.label} unavailable`}
        description="The sales workspace could not load its transaction feed from the current data provider."
        onRetry={() => query.refetch()}
      />
    );
  }

  return (
    <div data-sales-register-workspace data-sales-register-section={section} className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col gap-2">
      <Card data-sales-register-header className={cn("shrink-0 border bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]", theme.softBorder)}>
        <CardContent data-sales-register-header-content className="space-y-3 p-3.5">
          <MasterDataReadinessGuard readiness={readiness} compact />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {/* POS lives under Retail on its own — it is not one of the sales
                document types, so it gets a plain title instead of the
                workflow switcher the other sales pages share. */}
            {isPosSection ? (
              <div className="flex min-w-0 items-center gap-2.5 px-1 py-1">
                <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", theme.soft, theme.softBorder)}>
                  <config.icon className={cn("h-[18px] w-[18px]", theme.text)} />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-[18px] font-semibold tracking-tight text-foreground">{config.label}</h1>
                  <p className="mt-0.5 truncate text-[13px] text-muted">Counter billing for walk-in customers.</p>
                </div>
              </div>
            ) : (
              <div ref={workflowMenuRef} className="relative flex min-w-0 items-center gap-2.5">
                <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", theme.soft, theme.softBorder)}>
                  <config.icon className={cn("h-[18px] w-[18px]", theme.text)} />
                </span>
                <button
                  ref={workflowMenuButtonRef}
                  type="button"
                  className="inline-flex max-w-full items-center gap-2 rounded-xl px-1 py-1 text-left transition hover:bg-canvas"
                  aria-haspopup="menu"
                  aria-expanded={workflowMenuOpen}
                  onClick={() => setWorkflowMenuOpen((current) => !current)}
                >
                  <h1 className="truncate text-[18px] font-semibold tracking-tight text-foreground">{config.label}</h1>
                  <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", workflowMenuOpen ? "rotate-180" : "")} />
                </button>
              </div>
            )}

          </div>
        </CardContent>
      </Card>

      <Card data-sales-register-filters className={cn("min-w-0 border bg-white shadow-none", theme.softBorder)}>
        <CardContent data-sales-register-filters-content className="px-4 py-2.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="shrink-0 text-sm font-semibold text-foreground">Filter by :</div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-auto">
                <select
                  className="h-10 w-full rounded-full border border-[#d7e1ee] bg-[#eef6ff] px-4 pr-10 text-sm text-[#1d3557] sm:min-w-[170px]"
                  value={`${filters.status}:${filters.paymentStatus}`}
                  onChange={(event) => {
                    const [nextStatus, nextPayment] = event.target.value.split(":") as [SalesWorkspaceFilters["status"], PaymentStateFilter];
                    setFilters((current) => ({
                      ...current,
                      status: nextStatus,
                      paymentStatus: nextPayment,
                    }));
                  }}
                >
                  <option value="all:all">{isPosSection ? "All Counter Sales" : `All ${config.label}`}</option>
                  <option value="all:paid">{isPosSection ? "Fully Settled" : "Paid Invoices"}</option>
                  <option value="all:due">{isPosSection ? "Payment Pending" : "Unpaid Invoices"}</option>
                  <option value="all:partial">{isPosSection ? "Partly Settled" : "Partial Invoices"}</option>
                  <option value="posted:all">{isPosSection ? "Posted Bills" : "Posted Invoices"}</option>
                </select>
              </div>

              <div className="relative w-full sm:w-auto">
                <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1d3557]" />
                <select
                  className="h-10 w-full appearance-none rounded-full border border-[#d7e1ee] bg-[#eef6ff] pl-10 pr-4 text-sm text-[#1d3557] sm:min-w-[170px]"
                  value={filters.range}
                  onChange={(event) => {
                    const range = event.target.value as SalesFilterRange;
                    setFilters((current) => range === "last-posting-month"
                      ? {
                          ...current,
                          range,
                          customStartDate: getLatestPostingMonthRange(
                            (postingAnchorQuery.data ?? [])
                              .filter((voucher) => voucher.status !== "cancelled")
                              .map((voucher) => voucher.voucherDate),
                          )?.from ?? current.customStartDate,
                          customEndDate: getLatestPostingMonthRange(
                            (postingAnchorQuery.data ?? [])
                              .filter((voucher) => voucher.status !== "cancelled")
                              .map((voucher) => voucher.voucherDate),
                          )?.to ?? current.customEndDate,
                        }
                      : { ...current, range });
                  }}
                >
                  {(Object.keys(salesFilterRangeLabels) as SalesFilterRange[]).map((rangeValue) => (
                    <option key={rangeValue} value={rangeValue}>
                      {salesFilterRangeLabels[rangeValue]}
                    </option>
                  ))}
                </select>
              </div>

              {filters.range === "custom" ? (
                <div className="flex items-center gap-1.5">
                  <AppDateInput
                    aria-label="Custom range start date"
                    className="w-[150px]"
                    inputClassName="h-10 rounded-full border-[#d7e1ee] bg-[#eef6ff] px-3 pr-9 text-sm text-[#1d3557]"
                    value={filters.customStartDate}
                    max={filters.customEndDate || undefined}
                    onChange={(value) => setFilters((current) => ({ ...current, customStartDate: value }))}
                  />
                  <span className="text-[#7c8a9b]">to</span>
                  <AppDateInput
                    aria-label="Custom range end date"
                    className="w-[150px]"
                    inputClassName="h-10 rounded-full border-[#d7e1ee] bg-[#eef6ff] px-3 pr-9 text-sm text-[#1d3557]"
                    value={filters.customEndDate}
                    min={filters.customStartDate || undefined}
                    onChange={(value) => setFilters((current) => ({ ...current, customEndDate: value }))}
                  />
                </div>
              ) : null}

              {/* Counter sales are mostly walk-ins, so the firm picker only
                  clutters POS — the operator filter still matters there. */}
              {isPosSection ? null : (
                <div className="relative w-full sm:w-auto">
                  <select
                    className="h-10 w-full rounded-full border border-[#d7e1ee] bg-[#eef6ff] px-4 pr-10 text-sm text-[#1d3557] sm:min-w-[170px]"
                    value={filters.customerQuery}
                    onChange={(event) => setFilters((current) => ({ ...current, customerQuery: event.target.value }))}
                  >
                    <option value="">All Firms</option>
                    {firmOptions.map((partyName) => (
                      <option key={partyName} value={partyName}>
                        {partyName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="relative w-full sm:w-auto">
                <select
                  className="h-10 w-full rounded-full border border-[#d7e1ee] bg-[#eef6ff] px-4 pr-10 text-sm text-[#1d3557] sm:min-w-[150px]"
                  value={filters.createdByQuery}
                  onChange={(event) => setFilters((current) => ({ ...current, createdByQuery: event.target.value }))}
                >
                  <option value="">{isPosSection ? "All Counters" : "All Users"}</option>
                  {userOptions.map((userName) => (
                    <option key={userName} value={userName}>
                      {userName}
                    </option>
                  ))}
                </select>
              </div>

              {(filters.customerQuery ||
                filters.createdByQuery ||
                filters.range !== "this-month" ||
                filters.paymentStatus !== "all" ||
                filters.status !== "all") ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full border-[#d7e1ee] bg-[#eef6ff] px-4 text-[#1d3557] hover:bg-[#e0eeff]"
                  onClick={() => setFilters(defaultFilters)}
                >
                  Reset
                </Button>
              ) : null}
            </div>

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
              <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl px-3 text-sm" onClick={() => exportRows(rows, `${config.slug}.csv`)}>
                <ExcelIcon className="h-4 w-4" />
                Excel
              </Button>
              <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl px-3 text-sm" onClick={() => printRowsReport()}>
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
        </CardContent>
      </Card>

      {isPosSection ? (
        <Card className={cn("shrink-0 border bg-white shadow-none", theme.softBorder)}>
          <CardContent className="px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <PosStatTile
                label="Today's Counter Sales"
                value={formatCurrency(posCounterSnapshot.todayTotal)}
                note={`${posCounterSnapshot.billCount} bill${posCounterSnapshot.billCount === 1 ? "" : "s"} today`}
                tone="teal"
              />
              <PosStatTile
                label="Average Bill"
                value={formatCurrency(posCounterSnapshot.averageBill)}
                note={posCounterSnapshot.billCount ? "Per counter bill today" : "No bill yet today"}
                tone="blue"
              />
              <PosStatTile
                label="Cash Collected"
                value={formatCurrency(posCounterSnapshot.cashTotal)}
                note={`${posCounterSnapshot.cashShare}% cash · ${formatCurrency(posCounterSnapshot.digitalTotal)} other`}
                tone="green"
              />
              <PosStatTile
                label={posCounterSnapshot.dueTotal > 0 ? "Unsettled Today" : "All Settled"}
                value={formatCurrency(posCounterSnapshot.dueTotal)}
                note={`Lifetime: ${formatCurrency(posCounterSnapshot.allTimeTotal)} · ${posCounterSnapshot.allTimeCount} bill${posCounterSnapshot.allTimeCount === 1 ? "" : "s"}`}
                tone={posCounterSnapshot.dueTotal > 0 ? "amber" : "slate"}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card data-sales-register-transactions className={cn("flex min-h-0 flex-1 flex-col overflow-hidden border bg-white shadow-none", theme.softBorder)}>
        <div data-sales-register-transactions-header className="border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
              <div className="text-base font-semibold text-foreground">Transactions</div>
            </div>
            <div className="ml-auto flex w-full min-w-0 flex-nowrap items-center justify-end gap-2 sm:w-auto">
              <CollapsibleSearch
                value={workspaceSearch}
                onChange={setWorkspaceSearch}
                label="Search transactions"
                placeholder="Search invoice, customer, amount"
                expandedWidth="w-full sm:w-[320px]"
                size="lg"
              />
              <Button className="h-10 shrink-0 gap-2 rounded-xl px-4" onClick={openCreateAction}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {primaryActionLabel}
              </Button>
            </div>
          </div>
        </div>

        <div data-sales-register-table-scroll ref={tableScrollRef} className="transient-scrollbar min-h-[260px] w-full flex-1 overflow-auto">
          <table data-sales-register-table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: `${salesTableMinWidth}px` }}>
            <thead className={cn(stickyHeader ? "sticky top-0 z-30" : "", "bg-[#f8fafc] text-[#5b6b7f]")}>
              <tr className="border-b border-border text-[12px] font-semibold [&>th]:whitespace-nowrap [&>th]:font-semibold">
                {showSelectionColumn ? (
                  <th
                    data-sales-column="select"
                    className={cn("relative border-b border-r border-[#d9e3ef] bg-[#f8fafc] px-3 py-2 text-center", stickyHeader ? "sticky left-0 z-40" : "")}
                    style={{ width: `${columnWidths.select}px`, minWidth: `${columnWidths.select}px` }}
                  >
                    <input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleAllVisibleRows(event.target.checked)} />
                  </th>
                ) : null}
                {tableColumnVisibility.documentDate ? (
                  <th
                    data-sales-column="documentDate"
                    className={cn("relative border-b border-r border-[#d9e3ef] bg-[#f8fafc] px-3 py-2 text-left", stickyHeader ? "sticky z-40" : "")}
                    style={{ width: `${columnWidths.documentDate}px`, minWidth: `${columnWidths.documentDate}px`, ...(stickyHeader ? { left: `${stickyDateLeft}px` } : {}) }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="flex items-center gap-2 font-semibold" onClick={() => toggleSort("documentDate")}>
                        Date
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                      {renderHeaderFilterButton("documentDate")}
                    </div>
                    {renderColumnResizeHandle("documentDate", "Date")}
                  </th>
                ) : null}
                {tableColumnVisibility.documentNumber ? (
                  <th
                    data-sales-column="documentNumber"
                    className={cn("relative border-b border-r border-[#d9e3ef] bg-[#f8fafc] px-3 py-2 text-left", stickyHeader ? "sticky z-40" : "")}
                    style={{ width: `${columnWidths.documentNumber}px`, minWidth: `${columnWidths.documentNumber}px`, ...(stickyHeader ? { left: `${stickyInvoiceLeft}px` } : {}) }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="flex items-center gap-2 font-semibold" onClick={() => toggleSort("documentNumber")}>
                        {section === "credit-note" ? "Return No." : "Invoice no"}
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                      {renderHeaderFilterButton("documentNumber")}
                    </div>
                    {renderColumnResizeHandle("documentNumber", "Invoice number")}
                  </th>
                ) : null}
                {tableColumnVisibility.partyName ? (
                  <th data-sales-column="partyName" className="relative border-b border-r border-[#d9e3ef] px-3 py-2 text-left" style={{ width: `${columnWidths.partyName}px`, minWidth: `${columnWidths.partyName}px` }}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="flex items-center gap-2 font-semibold" onClick={() => toggleSort("partyName")}>
                        Party Name
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                      {renderHeaderFilterButton("partyName")}
                    </div>
                    {renderColumnResizeHandle("partyName", "Party Name")}
                  </th>
                ) : null}
                {tableColumnVisibility.transactionLabel ? (
                  <th data-sales-column="transactionLabel" className="relative border-b border-r border-[#d9e3ef] px-3 py-2 text-left" style={{ width: `${columnWidths.transactionLabel}px`, minWidth: `${columnWidths.transactionLabel}px` }}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="flex items-center gap-2 font-semibold" onClick={() => toggleSort("transactionLabel")}>
                        Transaction
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                      {renderHeaderFilterButton("transactionLabel")}
                    </div>
                    {renderColumnResizeHandle("transactionLabel", "Transaction")}
                  </th>
                ) : null}
                {tableColumnVisibility.paymentMethod ? (
                  <th data-sales-column="paymentMethod" className="relative border-b border-r border-[#d9e3ef] px-3 py-2 text-left" style={{ width: `${columnWidths.paymentMethod}px`, minWidth: `${columnWidths.paymentMethod}px` }}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="flex items-center gap-2 whitespace-nowrap font-semibold" onClick={() => toggleSort("paymentMethod")}>
                        {section === "sale-order" || section === "credit-note" ? "Collection Status" : "Collection Type"}
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                      {renderHeaderFilterButton("paymentMethod")}
                    </div>
                    {renderColumnResizeHandle("paymentMethod", section === "sale-order" || section === "credit-note" ? "Collection Status" : "Collection Type")}
                  </th>
                ) : null}
                {tableColumnVisibility.amount ? (
                  <th data-sales-column="amount" className="relative border-b border-r border-[#d9e3ef] px-3 py-2 text-left" style={{ width: `${columnWidths.amount}px`, minWidth: `${columnWidths.amount}px` }}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="flex min-w-0 items-center gap-2 text-left font-semibold" onClick={() => toggleSort("amount")}>
                        Amount
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                      {renderHeaderFilterButton("amount")}
                    </div>
                    {renderColumnResizeHandle("amount", "Amount")}
                  </th>
                ) : null}
                {tableColumnVisibility.balance ? (
                  <th data-sales-column="balance" className="relative border-b border-r border-[#d9e3ef] px-3 py-2 text-left" style={{ width: `${columnWidths.balance}px`, minWidth: `${columnWidths.balance}px` }}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="flex min-w-0 items-center gap-2 text-left font-semibold" onClick={() => toggleSort("balance")}>
                        Balance
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                      {renderHeaderFilterButton("balance")}
                    </div>
                    {renderColumnResizeHandle("balance", "Balance")}
                  </th>
                ) : null}
                {tableColumnVisibility.status ? (
                  <th data-sales-column="status" className="relative border-b border-r border-[#d9e3ef] px-3 py-2 text-left" style={{ width: `${columnWidths.status}px`, minWidth: `${columnWidths.status}px` }}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="flex min-w-0 items-center gap-2 text-left font-semibold" onClick={() => toggleSort("status")}>
                        Status
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                      {renderHeaderFilterButton("status")}
                    </div>
                    {renderColumnResizeHandle("status", "Status")}
                  </th>
                ) : null}
                {tableColumnVisibility.createdBy ? (
                  <th data-sales-column="createdBy" className="relative border-b border-r border-[#d9e3ef] px-3 py-2 text-left" style={{ width: `${columnWidths.createdBy}px`, minWidth: `${columnWidths.createdBy}px` }}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="flex items-center gap-2 font-semibold" onClick={() => toggleSort("createdBy")}>
                        Created By
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                      {renderHeaderFilterButton("createdBy")}
                    </div>
                    {renderColumnResizeHandle("createdBy", "Created By")}
                  </th>
                ) : null}
                {section === "sale-order" ? (
                  <th data-sales-column="workflowAction" data-sales-workflow-action-column className="border-b border-r border-[#d9e3ef] px-3 py-2 text-left font-semibold" style={{ width: "190px", minWidth: "190px" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-[#536b86]" />
                        <span>Delivery</span>
                      </div>
                      {renderHeaderFilterButton("status")}
                    </div>
                  </th>
                ) : null}
                {section === "delivery-challan" ? (
                  <th data-sales-column="workflowAction" data-sales-workflow-action-column className="border-b border-r border-[#d9e3ef] px-3 py-2 text-left font-semibold" style={{ width: "190px", minWidth: "190px" }}>
                    Invoice
                  </th>
                ) : null}
                {tableColumnVisibility.actions ? (
                  <th data-sales-column="actions" className="relative border-b border-[#d9e3ef] px-1.5 py-2 text-center font-semibold" style={{ width: `${columnWidths.actions}px`, minWidth: `${columnWidths.actions}px` }}>
                    <button type="button" aria-label="More actions" title="More actions" className="relative mx-auto inline-flex h-8 w-8 items-center justify-center text-[#334155] transition hover:text-primary" onClick={() => setBulkActionsOpen((current) => !current)}>
                      {selectedRows.length ? <span className="absolute -right-1.5 -top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] leading-none text-white">{selectedRows.length}</span> : null}
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {bulkActionsOpen ? (
                      <div className="absolute right-2 top-12 z-50 min-w-[190px] rounded-xl border border-[#d7e1ee] bg-white p-2 text-left normal-case shadow-[0_18px_34px_rgba(15,23,42,0.14)]">
                        <div className="border-b border-[#edf2f7] px-3 py-2 text-xs text-[#61708a]">{selectedRows.length ? `${selectedRows.length} selected` : "Select rows first"}</div>
                        <button type="button" disabled={!selectedRows.length} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#24364f] hover:bg-[#f7faff] disabled:opacity-40" onClick={() => { setBulkActionsOpen(false); exportRows(selectedRows, `${config.slug}-selected.csv`); }}><ExcelIcon className="h-4 w-4" />Export selected</button>
                        <button type="button" disabled={!selectedRows.length} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#c63c3c] hover:bg-[#fff5f5] disabled:opacity-40" onClick={() => { setBulkActionsOpen(false); setBulkDeleteOpen(true); }}><Trash2 className="h-4 w-4" />Delete selected</button>
                      </div>
                    ) : null}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {pagedRows.length ? (
                pagedRows.map((row) => {
                  const rowSelected = selectedRowIds.includes(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={cn("cursor-pointer border-b border-border/80 transition hover:bg-[#f7fbff]", rowSelected ? "bg-[#dceefb]" : "bg-white")}
                      tabIndex={0}
                      onClick={() => setViewRow(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setViewRow(row);
                        }
                      }}
                    >
                      {showSelectionColumn ? (
                        <td data-sales-column="select" className="sticky left-0 z-20 border-b border-r border-[#e1e8f2] bg-inherit px-3 py-2.5 text-center" style={{ width: `${columnWidths.select}px`, minWidth: `${columnWidths.select}px` }} onClick={(event) => event.stopPropagation()}>
                          <input checked={rowSelected} type="checkbox" onChange={(event) => toggleRowSelection(row.id, event.target.checked)} />
                        </td>
                      ) : null}
                      {tableColumnVisibility.documentDate ? (
                        <td
                          data-sales-column="documentDate"
                          className="sticky z-20 border-b border-r border-[#e1e8f2] bg-inherit px-3 py-2.5 tabular-nums"
                          style={{ left: `${stickyDateLeft}px`, width: `${columnWidths.documentDate}px`, minWidth: `${columnWidths.documentDate}px` }}
                        >
                          {formatDate(row.documentDate)}
                        </td>
                      ) : null}
                      {tableColumnVisibility.documentNumber ? (
                        <td
                          data-sales-column="documentNumber"
                          className="sticky z-20 border-b border-r border-[#e1e8f2] bg-inherit px-3 py-2.5"
                          style={{ left: `${stickyInvoiceLeft}px`, width: `${columnWidths.documentNumber}px`, minWidth: `${columnWidths.documentNumber}px` }}
                        >
                          <button
                            type="button"
                            className="font-medium text-[#1f3b57] hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setViewRow(row);
                            }}
                          >
                            {row.documentNumber}
                          </button>
                        </td>
                      ) : null}
                      {tableColumnVisibility.partyName ? <td data-sales-column="partyName" className={cn("border-b border-r border-[#e1e8f2] px-3 text-center font-medium text-foreground", denseTable ? "py-2.5" : "py-4")} style={{ width: `${columnWidths.partyName}px`, minWidth: `${columnWidths.partyName}px` }}>{row.partyName}</td> : null}
                      {tableColumnVisibility.transactionLabel ? <td data-sales-column="transactionLabel" className="border-b border-r border-[#e1e8f2] px-3 py-2.5 text-center" style={{ width: `${columnWidths.transactionLabel}px`, minWidth: `${columnWidths.transactionLabel}px` }}>{row.transactionLabel}</td> : null}
                      {tableColumnVisibility.paymentMethod ? (
                        <td data-sales-column="paymentMethod" className="border-b border-r border-[#e1e8f2] px-3 py-2.5 text-center" style={{ width: `${columnWidths.paymentMethod}px`, minWidth: `${columnWidths.paymentMethod}px` }}>
                          {section === "sale-order" || section === "credit-note" || section === "delivery-challan" ? (
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase",
                                row.paymentMethod === "Due" || row.paymentMethod === "Credit"
                                  ? "border-[#f6c453] bg-[#fff7d6] text-[#a15c00]"
                                  : "border-[#86efac] bg-[#dcfce7] text-[#15803d]",
                              )}
                            >
                              {row.paymentMethod}
                            </span>
                          ) : row.paymentMethod}
                        </td>
                      ) : null}
                      {tableColumnVisibility.amount ? (
                        <td data-sales-column="amount" className="border-b border-r border-[#e1e8f2] px-3 py-2.5 text-right tabular-nums font-medium" style={{ width: `${columnWidths.amount}px`, minWidth: `${columnWidths.amount}px` }}>
                          {formatCurrency(row.amount)}
                          {row.lineItems.length ? (
                            <div className="text-[11px] font-normal text-[#7a8aa6]">
                              {row.lineItems.length} item{row.lineItems.length === 1 ? "" : "s"} ·{" "}
                              {formatNumber(row.lineItems.reduce((total, item) => total + item.quantity, 0))} qty
                            </div>
                          ) : null}
                        </td>
                      ) : null}
                      {tableColumnVisibility.balance ? (
                        <td data-sales-column="balance" className="border-b border-r border-[#e1e8f2] px-3 py-2.5 text-right tabular-nums" style={{ width: `${columnWidths.balance}px`, minWidth: `${columnWidths.balance}px` }}>
                          {formatCurrency(row.balance)}
                          {row.orderedQty > 0 ? (
                            section === "delivery-challan" ? (
                              <>
                                {/* This note's own quantity against the source order's total. */}
                                <div className="text-[11px] font-normal text-[#0f6cf6]">
                                  {formatNumber(row.deliveredQty)} of {formatNumber(row.orderedQty)} delivered (SO)
                                </div>
                                {/* The running total across every delivery note raised against
                                    that same order, so a partial delivery still shows how much
                                    has actually gone out overall, not just this one slice. */}
                                <div className="text-[11px] font-normal text-[#7a8aa6]">
                                  Total so far: {formatNumber(row.cumulativeDeliveredQty)} of {formatNumber(row.orderedQty)} ·{" "}
                                  {formatNumber(Math.max(0, row.orderedQty - row.cumulativeDeliveredQty))} pending
                                </div>
                              </>
                            ) : (
                              <div className="text-[11px] font-normal text-[#0f6cf6]">
                                {formatNumber(row.deliveredQty)} of {formatNumber(row.orderedQty)} delivered ·{" "}
                                {formatNumber(Math.max(0, row.orderedQty - row.deliveredQty))} pending
                              </div>
                            )
                          ) : null}
                        </td>
                      ) : null}
                      {tableColumnVisibility.status ? (
                        <td data-sales-column="status" className="border-b border-r border-[#e1e8f2] px-3 py-2.5 text-center" style={{ width: `${columnWidths.status}px`, minWidth: `${columnWidths.status}px` }}>
                          <SalesStatusBadge
                            label={
                              row.workflowStatusLabel ??
                              (row.paymentStatus === "paid" ? "Paid" : row.paymentStatus === "partial" ? "Partial" : "Unpaid")
                            }
                          />
                        </td>
                      ) : null}
                      {tableColumnVisibility.createdBy ? <td data-sales-column="createdBy" className="border-b border-r border-[#e1e8f2] px-3 py-2.5" style={{ width: `${columnWidths.createdBy}px`, minWidth: `${columnWidths.createdBy}px` }}>{row.createdBy}</td> : null}
                      {section === "sale-order" ? (
                        <td data-sales-column="workflowAction" data-sales-workflow-action-column className="border-b border-r border-[#e1e8f2] px-3 py-2" style={{ width: "190px", minWidth: "190px" }} onClick={(event) => event.stopPropagation()}>
                          {/* An order becomes a delivery note the same way a Purchase Order
                              becomes a Receipt Note — once one exists for this order, the
                              action is closed off so a second delivery can't be raised
                              for the same goods. */}
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 max-w-full rounded-[2px] border-[#d0d8e5] px-3 text-[#7b73da]"
                            disabled={row.workflowStatusLabel === "Delivered" || row.workflowStatusLabel === "Cancelled"}
                            title={
                              row.workflowStatusLabel === "Cancelled"
                                ? "Cancelled orders cannot be converted"
                                : row.workflowStatusLabel === "Delivered"
                                  ? "Already delivered"
                                  : undefined
                            }
                            onClick={() => {
                              router.push(
                                `${buildVoucherRoute(mode, "sales")}?workflow=delivery-note&fromVoucher=${row.sourceId}&returnTo=${encodeURIComponent(buildSalesWorkspaceRoute(mode, "delivery-challan"))}`,
                              );
                            }}
                          >
                            <span className="truncate">Convert to Delivery Note</span>
                          </Button>
                        </td>
                      ) : null}
                      {section === "delivery-challan" ? (
                        <td data-sales-column="workflowAction" data-sales-workflow-action-column className="border-b border-r border-[#e1e8f2] px-3 py-2" style={{ width: "190px", minWidth: "190px" }} onClick={(event) => event.stopPropagation()}>
                          {/* A delivery note becomes the Sales Invoice, closing the loop that
                              started at the Sale Order — same conversion pattern, just the
                              final stage instead of the middle one. */}
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 max-w-full rounded-[2px] border-[#d0d8e5] px-3 text-[#7b73da]"
                            disabled={row.workflowStatusLabel === "Invoiced" || row.workflowStatusLabel === "Cancelled"}
                            title={
                              row.workflowStatusLabel === "Cancelled"
                                ? "Cancelled documents cannot be converted"
                                : row.workflowStatusLabel === "Invoiced"
                                  ? "Already invoiced"
                                  : undefined
                            }
                            onClick={() => {
                              router.push(`${buildVoucherRoute(mode, "sales")}?fromVoucher=${row.sourceId}`);
                            }}
                          >
                            <span className="truncate">Convert to Sales Invoice</span>
                          </Button>
                        </td>
                      ) : null}
                      {tableColumnVisibility.actions ? (
                        <td data-sales-column="actions" className="border-b border-[#e1e8f2] px-1.5 py-2" style={{ width: `${columnWidths.actions}px`, minWidth: `${columnWidths.actions}px` }} onClick={(event) => event.stopPropagation()}>
                          <div className="relative flex justify-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="More"
                              aria-label="More"
                              onClick={() => setActiveRow((current) => (current?.id === row.id ? null : row))}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                            {activeRow?.id === row.id ? (
                              <div
                                ref={rowActionsMenuRef}
                                className="absolute right-0 top-9 z-20 min-w-[210px] rounded-2xl border border-[#d7e1ee] bg-white p-2 text-left shadow-[0_18px_34px_rgba(15,23,42,0.12)]"
                              >
                                <button
                                  type="button"
                                  disabled={section === "sale-order" && row.deliveredQty > 0}
                                  title={section === "sale-order" && row.deliveredQty > 0 ? "Reverse or delete this order's Delivery Note before editing the order" : undefined}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                  onClick={() => {
                                    if (section === "sale-order" && row.deliveredQty > 0) {
                                      toast.error("Reverse or delete this order's Delivery Note before editing the order.");
                                      return;
                                    }
                                    void openEditForRow(row);
                                    setActiveRow(null);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                  onClick={() => {
                                    setViewRow(row);
                                    setActiveRow(null);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                  <span>View</span>
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                  onClick={() => {
                                    printRowsReport([row], row.documentNumber);
                                    setActiveRow(null);
                                  }}
                                >
                                  <Printer className="h-4 w-4" />
                                  <span>Print</span>
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                  onClick={() => {
                                    openVoucherRow(row, "duplicate");
                                    setActiveRow(null);
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                  <span>Duplicate</span>
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                  onClick={() => {
                                    void handleShareRow(row);
                                    setActiveRow(null);
                                  }}
                                >
                                  <Share2 className="h-4 w-4" />
                                  <span>Share</span>
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                  onClick={() => {
                                    router.push(`${buildVoucherRoute(mode, "receipt")}?fromVoucher=${row.sourceId}`);
                                    setActiveRow(null);
                                  }}
                                >
                                  <Wallet className="h-4 w-4" />
                                  <span>Receive Payment</span>
                                </button>
                                {section === "invoices" ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#fff7ef]"
                                    onClick={() => {
                                      router.push(
                                        `${buildVoucherRoute(mode, "credit-note")}?fromVoucher=${row.sourceId}&returnTo=${encodeURIComponent(buildSalesWorkspaceRoute(mode, "credit-note"))}`,
                                      );
                                      setActiveRow(null);
                                    }}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                    <span>Create Sales Return</span>
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                  onClick={() => {
                                    router.push(buildWorkspaceRoute(mode, `/day-book?voucherType=sales&query=${encodeURIComponent(row.partyName)}`));
                                    setActiveRow(null);
                                  }}
                                >
                                  <BookOpenText className="h-4 w-4" />
                                  <span>Ledger</span>
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                  onClick={() => {
                                    handleEmailRow(row);
                                    setActiveRow(null);
                                  }}
                                >
                                  <Mail className="h-4 w-4" />
                                  <span>Email</span>
                                </button>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                  onClick={() => {
                                    handleWhatsAppRow(row);
                                    setActiveRow(null);
                                  }}
                                >
                                  <WhatsAppIcon className="h-4 w-4" />
                                  <span>WhatsApp</span>
                                </button>
                                {section === "invoices" || section === "delivery-challan" || section === "credit-note" ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#c9682c] transition hover:bg-[#fff7ef]"
                                    onClick={() => void handleReverseRow(row)}
                                  >
                                    <Undo2 className="h-4 w-4" />
                                    <span>Reverse</span>
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#c63c3c] transition hover:bg-[#f7faff]"
                                  onClick={() => {
                                    handleRequestDeleteRow(row);
                                    setActiveRow(null);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={renderedColumnCount} className="p-5">
                    <div data-sales-register-empty className="rounded-[28px] border border-dashed border-[#e3e7ef] bg-white px-6 py-16">
                      <EmptyState
                        title={`No ${config.shortLabel.toLowerCase()} found`}
                        description="Try widening the time range, resetting the filters, or creating a new document."
                      />
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={currentPage}
          pageSize={pageSize}
          totalItems={rows.length}
          pageSizeOptions={salesPageSizeOptions}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          summary={
            selectedRowIds.length
              ? `${selectedRowIds.length} row${selectedRowIds.length > 1 ? "s" : ""} selected`
              : `Showing ${rows.length ? (currentPage - 1) * pageSize + 1 : 0}-${Math.min(currentPage * pageSize, rows.length)} of ${rows.length} entries`
          }
          centerContent={
            <div className="flex min-w-[310px] items-center justify-between gap-5 px-3">
              <div className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.05em] text-[#7b8799]">Total {isPosSection ? "" : `${config.label} `}Amount</div>
              <div className="whitespace-nowrap text-[0.95rem] font-semibold tabular-nums text-[#173152]">{formatCurrency(filteredAmountTotal)}</div>
            </div>
          }
        />
      </Card>

      <Dialog open={quickAddCustomerOpen} onOpenChange={setQuickAddCustomerOpen}>
        {/* z-[80]/[75]: opened from the side picker inside the page-mode create form,
            whose own DialogContent sits at z-[70] — without this override this dialog
            mounts correctly but renders (and its backdrop) behind that page, invisible
            and unclickable. */}
        <DialogContent className="z-[80]" overlayClassName="z-[75]">
          <DialogTitle className="text-lg font-semibold">Add Customer</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted">Create a customer without leaving this order.</DialogDescription>
          <div className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Customer Name *</label>
              <Input
                value={quickAddCustomerName}
                onChange={(event) => setQuickAddCustomerName(event.target.value)}
                placeholder="Enter customer name"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Phone Number</label>
              <Input
                value={quickAddCustomerPhone}
                onChange={(event) => setQuickAddCustomerPhone(event.target.value)}
                placeholder="Enter phone number"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setQuickAddCustomerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitQuickAddCustomer} disabled={quickAddCustomerSaving}>
              <CheckCircle2 className="h-5 w-5" />
              {quickAddCustomerSaving ? "Saving..." : "Add Customer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={quickAddItemOpen} onOpenChange={setQuickAddItemOpen}>
        {/* Same page-mode z-index fix as the Add Customer dialog above. */}
        <DialogContent className="z-[80]" overlayClassName="z-[75]">
          <DialogTitle className="text-lg font-semibold">Add Product</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted">Create a stock item without leaving this order.</DialogDescription>
          <div className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Item Name *</label>
              <Input
                value={quickAddItemName}
                onChange={(event) => setQuickAddItemName(event.target.value)}
                placeholder="Enter item name"
                autoFocus
              />
            </div>
            {mode === "api" ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Category *</label>
                {quickAddItemCategories.length ? (
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                    value={quickAddItemCategory}
                    onChange={(event) => setQuickAddItemCategory(event.target.value)}
                  >
                    {quickAddItemCategories.map((category) => (
                      <option key={category.id} value={category.name}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={quickAddItemCategory}
                    onChange={(event) => setQuickAddItemCategory(event.target.value)}
                    placeholder="No categories yet — add one from Products & Services first"
                    disabled
                  />
                )}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Unit</label>
              <Input value={quickAddItemUnit} onChange={(event) => setQuickAddItemUnit(event.target.value)} placeholder="pcs" />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setQuickAddItemOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitQuickAddItem} disabled={quickAddItemSaving || (mode === "api" && !quickAddItemCategories.length)}>
              <CheckCircle2 className="h-5 w-5" />
              {quickAddItemSaving ? "Saving..." : "Add Product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">Workspace Settings</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted">Adjust density and visibility without leaving the sales desk.</DialogDescription>
          <div className="mt-5 space-y-3">
            <label className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
              <span className="text-sm font-medium text-foreground">Dense table rows</span>
              <input type="checkbox" checked={denseTable} onChange={(event) => setDenseTable(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
              <span className="text-sm font-medium text-foreground">Show workflow tab counts</span>
              <input type="checkbox" checked={showTabCounts} onChange={(event) => setShowTabCounts(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
              <span className="text-sm font-medium text-foreground">Sticky grid header</span>
              <input type="checkbox" checked={stickyHeader} onChange={(event) => setStickyHeader(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
              <span className="text-sm font-medium text-foreground">Show created by column</span>
              <input type="checkbox" checked={showCreatedBy} onChange={(event) => setShowCreatedBy(event.target.checked)} />
            </label>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(posLineDiscountTarget)} onOpenChange={(open) => (open ? null : setPosLineDiscountTarget(null))}>
        <DialogContent className="w-[min(92vw,420px)]" submitOnEnter>
          <DialogTitle className="text-lg font-semibold text-[#1f2f46]">Item Discount</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-[#6d7a8e]">
            {createForm.items.find((item) => item.id === posLineDiscountTarget)?.itemName || "Selected item"}
          </DialogDescription>
          <label className="mt-4 grid gap-1.5">
            <span className="text-sm text-[#55657d]">Discount percent</span>
            <div className="relative">
              <Input
                autoFocus
                value={posLineDiscountDraft}
                onChange={(event) => setPosLineDiscountDraft(event.target.value)}
                inputMode="decimal"
                className="h-11 rounded-[6px] border-[#c9d7eb] pr-8 text-right"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#5b6a80]">%</span>
            </div>
          </label>
          <div className="mt-5 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-full border-[#c9d7eb] px-6 text-[#66748f]" onClick={() => setPosLineDiscountTarget(null)}>
              Cancel
            </Button>
            <Button type="button" data-enter-submit className="rounded-full bg-primary px-6" onClick={applyPosLineDiscount}>
              Apply Discount
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={columnsOpen} onOpenChange={setColumnsOpen}>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">Column Visibility</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted">Hide or show columns for the transactions grid.</DialogDescription>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(Object.keys(columnVisibility) as ColumnId[]).map((columnId) => (
              <label key={columnId} className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
                <span className="text-sm font-medium capitalize text-foreground">{columnId.replace(/([A-Z])/g, " $1")}</span>
                <input
                  type="checkbox"
                  checked={columnVisibility[columnId]}
                  onChange={(event) =>
                    setColumnVisibility((current) => ({
                      ...current,
                      [columnId]: event.target.checked,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewRow)} onOpenChange={(open) => !open && setViewRow(null)}>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">View</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted">
            {viewRow ? `${viewRow.documentNumber} for ${viewRow.partyName}` : "Open a row to view its details."}
          </DialogDescription>
          {viewRow ? (
            <div className="mt-5 space-y-4">
              <div className="grid md:grid-cols-2 md:gap-x-8">
                <InfoTile label="Date" value={formatDate(viewRow.documentDate)} />
                <InfoTile
                  label="Status"
                  value={
                    viewRow.workflowStatusLabel ??
                    (viewRow.paymentStatus === "paid" ? "Paid" : viewRow.paymentStatus === "partial" ? "Partial" : "Unpaid")
                  }
                  tone={
                    viewRow.workflowStatusLabel
                      ? viewRow.workflowStatusLabel === "Cancelled"
                        ? "danger"
                        : viewRow.workflowStatusLabel === "Converted" ||
                            viewRow.workflowStatusLabel === "Invoiced" ||
                            viewRow.workflowStatusLabel === "Delivered"
                          ? "success"
                          : viewRow.workflowStatusLabel === "Sales Pending" || viewRow.workflowStatusLabel === "Pending to Delivery"
                            ? "warning"
                            : undefined
                      : viewRow.paymentStatus === "paid"
                        ? "success"
                        : viewRow.paymentStatus === "partial"
                          ? "warning"
                          : "danger"
                  }
                />
                <InfoTile label="Payment Method" value={viewRow.paymentMethod} />
                <InfoTile label="Amount" value={formatCurrency(viewRow.amount)} />
                <InfoTile label="Balance" value={formatCurrency(viewRow.balance)} />
                <InfoTile label="Created By" value={viewRow.createdBy} />
              </div>
              {viewRow.lineItems.length ? (
                <div className="overflow-hidden border-y border-[#e3ebf4] bg-white">
                  <div className="border-b border-[#e3ebf4] bg-[#fbfdff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#74839b]">Items</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#fbfdff] text-[#74839b]">
                        <th className="border-b border-[#e3ebf4] px-4 py-2 text-left font-semibold">Item</th>
                        <th className="border-b border-[#e3ebf4] px-4 py-2 text-right font-semibold">Qty</th>
                        <th className="border-b border-[#e3ebf4] px-4 py-2 text-right font-semibold">Rate</th>
                        <th className="border-b border-[#e3ebf4] px-4 py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewRow.lineItems.map((item, index) => (
                        <tr key={`${item.itemName}-${index}`} className="border-b border-[#eef2f7] last:border-b-0">
                          <td className="px-4 py-2 text-[#173152]">{item.itemName || "Untitled item"}</td>
                          <td className="px-4 py-2 text-right text-[#173152]">{formatNumber(item.quantity)}</td>
                          <td className="px-4 py-2 text-right text-[#173152]">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-4 py-2 text-right font-medium text-[#173152]">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {section === "invoices" ? (
                <div className="flex justify-end border-t border-[#e3ebf4] pt-4">
                  <Button
                    type="button"
                    className="gap-2 bg-primary text-white hover:bg-[#cf670f]"
                    onClick={() => {
                      const sourceId = viewRow.sourceId;
                      setViewRow(null);
                      router.push(
                        `${buildVoucherRoute(mode, "credit-note")}?fromVoucher=${sourceId}&returnTo=${encodeURIComponent(buildSalesWorkspaceRoute(mode, "credit-note"))}`,
                      );
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Create Sales Return
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => !bulkDeleteSaving && setBulkDeleteOpen(open)}
        title={`Delete ${selectedRows.length} selected?`}
        description={section === "invoices"
          ? "Selected Sales Invoices and their linked Sales Returns/Customer Receipts will move to the Recycle Bin. Stock and ledger effects will be safely rebuilt."
          : "Selected documents will move to the Recycle Bin and can be restored later."}
        confirmLabel={bulkDeleteSaving ? "Working..." : "Delete"}
        onConfirm={() => void handleBulkDeleteRows()}
      />

      <ConfirmationDialog
        open={Boolean(deleteConfirmRow)}
        onOpenChange={(open) => !open && setDeleteConfirmRow(null)}
        title="Delete this document?"
        description={
          deleteConfirmRow
            ? section === "invoices"
              ? `${deleteConfirmRow.documentNumber} and any linked Sales Return/Customer Receipt will move to the Recycle Bin. Stock and ledger effects will be safely rebuilt.`
              : `${deleteConfirmRow.documentNumber} for ${deleteConfirmRow.partyName} will move to the Recycle Bin.`
            : "Please confirm this action."
        }
        confirmLabel={deleteSaving ? "Working..." : "Delete"}
        tone="danger"
        onConfirm={handleConfirmDeleteRow}
      />

      <Dialog
        modal={createDialogModalRef.current}
        open={createOpen}
        onOpenChange={(open) => {
          // Opening is always driven explicitly by our own code (openCreateSalesForm,
          // hydrateSalesFormFromVoucher, the create=1 URL effect) — never by Radix
          // itself, since this Dialog has no trigger element. Radix does still call
          // this with `open: true` on its own when the `modal` prop changes mid-flight
          // (exactly what happens right after a page-mode save flips shouldRenderCreateAsPage,
          // and therefore `modal`, from false back to true) — acting on that reopened the
          // create form on top of the just-opened preview dialog. Only the close case is real.
          if (open) {
            return;
          }

          if (shouldRenderCreateAsPage) {
            return;
          }

          closeSalesFormDialog();
        }}
      >
        <DialogContent
          hideClose={shouldRenderCreateAsPage}
          overlayClassName={shouldRenderCreateAsPage ? "hidden" : undefined}
          data-page-form-panel={shouldRenderCreateAsPage ? "true" : undefined}
          data-sidebar-state={shouldRenderCreateAsPage ? (sidebarCollapsed ? "collapsed" : "expanded") : undefined}
          className={cn(
            "max-w-none overflow-hidden border border-[#dfe5ee] p-0",
            shouldRenderCreateAsPage
              ? cn(
                  "fixed bottom-0 left-0 right-0 top-[60px] z-[70] h-auto w-auto translate-x-0 translate-y-0 rounded-none border-0 bg-white p-0 shadow-none lg:top-[92px]",
                  sidebarCollapsed ? "xl:left-[68px]" : "xl:left-[252px]",
                )
              : "shadow-[0_28px_70px_rgba(15,23,42,0.18)]",
            isPosSection ? "h-[96vh] w-[min(99.4vw,1920px)] rounded-[10px]" : shouldRenderCreateAsPage ? "" : "max-h-[92vh] w-[min(99vw,1720px)] rounded-[18px]",
          )}
        >
          {/* Belt-and-suspenders against the Radix/Presence stuck-dialog class of bug
              documented on the Dialog above: even if its `open` state ever gets
              confused, nothing renders inside this shell unless createOpen is
              genuinely true, so a stuck dialog can only ever show an empty shell,
              never a live "New Challan" form sitting on top of something else. */}
          {createOpen && (isPosSection ? (
            <div className="flex h-full flex-col overflow-hidden bg-[#f4f7fb]">
              <div className="border-b border-[#cfdcf0] bg-white px-4 py-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-end gap-2">
                    <div className="flex min-h-[46px] items-center gap-3 rounded-t-[10px] border border-b-0 border-[#c8d6ee] bg-white px-4 py-2 text-[#1f2f46]">
                      <span className="text-[28px] font-medium leading-none">{posBillLabel}</span>
                      <button type="button" className="text-[#8a97ab] transition hover:text-[#1f2f46]" onClick={closeSalesFormDialog} aria-label="Close POS">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="flex min-h-[42px] items-center gap-2 rounded-t-[10px] border border-b-0 border-[#c8d6ee] bg-[#fbfcff] px-4 py-2 text-[28px] leading-none text-[#5a6780] transition hover:bg-white"
                      onClick={() => resetSalesForm({ clearDraft: true })}
                    >
                      <span className="text-[28px] leading-none">+</span>
                      <span className="text-[14px] font-medium text-[#5a6780]">New Bill [Ctrl+T]</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-4 pr-2 text-[#6d7a8e]">
                    <button type="button" className="transition hover:text-[#1f2f46]" aria-label="POS settings" onClick={() => setSettingsOpen(true)}>
                      <Settings2 className="h-5 w-5" />
                    </button>
                    <button type="button" className="transition hover:text-[#1f2f46]" onClick={closeSalesFormDialog} aria-label="Close">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_448px]">
                <div className="flex min-h-0 flex-col border-r border-[#cfdcf0] bg-white">
                  <div className="border-b border-[#cfdcf0] px-3 py-3">
                    <div ref={posQuickItemPickerRef} className="relative">
                      <Input
                        ref={posQuickSearchInputRef}
                        value={posQuickItemQuery}
                        onChange={(event) => {
                          setPosQuickItemQuery(event.target.value);
                          setPosQuickPickerOpen(true);
                          setPosQuickPickerHighlightIndex(-1);
                        }}
                        onFocus={() => {
                          setPosQuickPickerOpen(true);
                          setPosQuickPickerHighlightIndex(-1);
                        }}
                        onKeyDown={(event) => {
                          if (isPickerNavigationKey(event.key)) {
                            const navigationKey = event.key;
                            event.preventDefault();
                            setPosQuickPickerOpen(true);
                            setPosQuickPickerHighlightIndex((current) => getNextPickerIndex(current, filteredPosQuickOptions.length, navigationKey));
                          } else if (event.key === "Enter" && filteredPosQuickOptions.length) {
                            event.preventDefault();
                            appendQuickInventoryItem(filteredPosQuickOptions[posQuickPickerHighlightIndex >= 0 ? posQuickPickerHighlightIndex : 0]);
                          } else if (event.key === "Escape") {
                            setPosQuickPickerOpen(false);
                            setPosQuickPickerHighlightIndex(-1);
                          }
                        }}
                        placeholder="Scan or search by item code, model no or item name"
                        className="h-10 rounded-[4px] border-[#0f6cf6] pr-12 text-[14px] placeholder:text-[#a9b4c7]"
                      />
                      {/* The positioning lives on a wrapper div: a global rule forces
                          `position: relative` on every button, which would otherwise
                          drop this icon out of the input. */}
                      <div className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#0f6cf6] text-[#0f6cf6] transition hover:bg-[#eef5ff]"
                          onClick={() => {
                            setPosQuickPickerOpen((current) => !current);
                            setPosQuickPickerHighlightIndex(-1);
                            posQuickSearchInputRef.current?.focus();
                          }}
                          aria-label="Search items"
                        >
                          <Search className="h-4 w-4" />
                        </button>
                      </div>
                      {posQuickPickerOpen ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-[6px] border border-[#cfdcf0] bg-white shadow-[0_16px_38px_rgba(15,23,42,0.12)]">
                          <div ref={posQuickPickerListRef} className="max-h-72 overflow-auto py-1" role="listbox">
                            {filteredPosQuickOptions.length ? (
                              filteredPosQuickOptions.map((inventoryItem, optionIndex) => (
                                <button
                                  key={`${inventoryItem.itemCode}-${inventoryItem.itemName}-${optionIndex}`}
                                  type="button"
                                  role="option"
                                  aria-selected={optionIndex === posQuickPickerHighlightIndex}
                                  data-picker-option-index={optionIndex}
                                  className={cn(
                                    "grid w-full grid-cols-[140px_minmax(0,1fr)_110px] items-center gap-3 px-4 py-2 text-left transition hover:bg-[#f5f9ff]",
                                    optionIndex === posQuickPickerHighlightIndex ? "bg-[#eaf3ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                                  )}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onMouseEnter={() => setPosQuickPickerHighlightIndex(optionIndex)}
                                  onClick={() => appendQuickInventoryItem(inventoryItem)}
                                >
                                  <span className="truncate text-sm font-medium text-[#41516b]">{inventoryItem.itemCode}</span>
                                  <span className="truncate text-sm text-[#1f2f46]">{inventoryItem.itemName}</span>
                                  <span className="text-right text-sm text-[#41516b]">{formatCurrency(inventoryItem.rate)}</span>
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-3 text-sm text-[#6d7a8e]">No stock item found from Inventory master.</div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                    <div className="min-w-0">
                      <div className="grid grid-cols-[44px_245px_minmax(360px,1fr)_180px_180px_220px_210px] border-b border-[#d3deef] bg-[#f8fafc] text-[13px] font-semibold uppercase tracking-[0.02em] text-[#62728a]">
                        <div className="px-3 py-4">#</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Item Code</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Item Name</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Qty</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Unit</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Price/Unit(Tk)</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Total(Tk)</div>
                      </div>
                      <div className="hidden grid-cols-[44px_245px_minmax(360px,1fr)_180px_180px_220px_210px] border-b border-[#d3deef] bg-[#f8fafc] text-[13px] font-semibold uppercase tracking-[0.02em] text-[#62728a]">
                        <div className="px-3 py-4">#</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Item Code</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Item Name</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Qty</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Unit</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Price/Unit({formatCurrency(0).replace("0.00", "").trim() || "৳"})</div>
                        <div className="border-l border-[#dbe5f2] px-3 py-4">Total({formatCurrency(0).replace("0.00", "").trim() || "৳"})</div>
                      </div>

                      <div className="divide-y divide-[#edf2f8]">
                        {createForm.items.map((item, index) => {
                          const matchedItem = localOptions.inventory.find((entry) => normalizeLookupValue(entry.itemName) === normalizeLookupValue(item.itemName));
                          const rowDiscount = Math.min(Math.max(toSafeNumber(item.discountPercent), 0), 100);
                          const rowGross = toSafeNumber(item.quantity) * toSafeNumber(item.unitPrice);
                          const rowAmount = rowGross * (1 - rowDiscount / 100);
                          const selected = selectedPosRowId === item.id;
                          return (
                            <div
                              key={item.id}
                              className={cn(
                                "grid grid-cols-[44px_245px_minmax(360px,1fr)_180px_180px_220px_210px] text-[14px]",
                                selected ? "bg-[#f7fbff]" : "bg-white",
                              )}
                              onClick={() => setSelectedPosRowId(item.id)}
                            >
                              <div className="px-3 py-3 text-[#54657f]">{index + 1}</div>
                              <div className="border-l border-[#edf2f8] px-3 py-3 text-[#54657f]">{matchedItem?.itemCode ?? ""}</div>
                              <div className="border-l border-[#edf2f8] px-2 py-1.5">
                                <Input
                                  data-sales-item-id={item.id}
                                  value={item.itemName}
                                  onChange={(event) => updateCreateItem(item.id, { itemName: event.target.value })}
                                  onFocus={() => setSelectedPosRowId(item.id)}
                                  onKeyDown={(event) => handleInventoryPickerKeyDown(event, item.id)}
                                  placeholder=""
                                  className="h-10 rounded-[4px] border-transparent bg-transparent px-2 shadow-none focus-visible:border-[#cfdcf0]"
                                />
                              </div>
                              <div className="border-l border-[#edf2f8] px-2 py-1.5">
                                <Input
                                  ref={selected ? posQuantityInputRef : undefined}
                                  value={item.quantity}
                                  onChange={(event) => updateCreateItem(item.id, { quantity: event.target.value })}
                                  onFocus={() => setSelectedPosRowId(item.id)}
                                  className="h-10 rounded-[4px] border-transparent bg-transparent px-2 text-right shadow-none focus-visible:border-[#cfdcf0]"
                                />
                              </div>
                              <div className="border-l border-[#edf2f8] px-3 py-3 text-[#54657f]">{item.unit || matchedItem?.unit || ""}</div>
                              <div className="border-l border-[#edf2f8] px-2 py-1.5">
                                <Input
                                  money
                                  value={item.unitPrice}
                                  onChange={(event) => updateCreateItem(item.id, { unitPrice: event.target.value })}
                                  onFocus={() => setSelectedPosRowId(item.id)}
                                  clearZeroOnFocus
                                  className="h-10 rounded-[4px] border-transparent bg-transparent px-2 text-right shadow-none focus-visible:border-[#cfdcf0]"
                                />
                              </div>
                              <div className="border-l border-[#edf2f8] px-3 py-3 text-right font-medium tabular-nums text-[#1f2f46]">
                                {rowAmount ? formatCurrency(rowAmount) : ""}
                                {rowDiscount > 0 ? (
                                  <div className="text-[11px] font-normal text-[#0f9f63]">-{rowDiscount}% off {formatCurrency(rowGross)}</div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                        {Array.from({ length: Math.max(0, 12 - createForm.items.length) }).map((_, index) => (
                          <div key={`pos-blank-${index}`} className="grid h-[48px] grid-cols-[44px_245px_minmax(360px,1fr)_180px_180px_220px_210px] bg-white text-[14px]">
                            <div className="border-b border-[#edf2f8]" />
                            <div className="border-b border-l border-[#edf2f8]" />
                            <div className="border-b border-l border-[#edf2f8]" />
                            <div className="border-b border-l border-[#edf2f8]" />
                            <div className="border-b border-l border-[#edf2f8]" />
                            <div className="border-b border-l border-[#edf2f8]" />
                            <div className="border-b border-l border-[#edf2f8]" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#cfdcf0] bg-[#f8fafc] px-3 py-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                      <Button type="button" variant="outline" className="h-10 rounded-[6px] border-[#9ec8ff] bg-[#b9d7f6] text-[#324660]" onClick={focusPosQuantity}>
                        Change Quantity [F2]
                      </Button>
                      <Button type="button" variant="outline" className="h-10 rounded-[6px] border-[#9ec8ff] bg-[#b9d7f6] text-[#324660]" onClick={openPosLineDiscount}>
                        Item Discount [F3]
                      </Button>
                      <Button type="button" variant="outline" className="h-10 rounded-[6px] border-[#9ec8ff] bg-[#b9d7f6] text-[#324660]" onClick={removePosSelectedRow}>
                        Remove Item [F4]
                      </Button>
                      <Button type="button" variant="outline" className="h-10 rounded-[6px] border-[#9ec8ff] bg-[#b9d7f6] text-[#324660]" onClick={togglePosLineUnit}>
                        Change Unit [F6]
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-[6px] border-[#9ec8ff] bg-white text-[#324660]"
                        onClick={() => focusPosField(posChargesInputRef, "Additional charges field is unavailable")}
                      >
                        Additional Charges [F8]
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-[6px] border-[#9ec8ff] bg-white text-[#324660]"
                        onClick={() => focusPosField(posDiscountInputRef, "Bill discount field is unavailable")}
                      >
                        Bill Discount [F9]
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-[6px] border-[#9ec8ff] bg-white text-[#324660]"
                        onClick={() => focusPosField(posRemarksInputRef, "Remarks field is unavailable")}
                      >
                        Remarks [F12]
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-[6px] border-[#9ec8ff] bg-white text-[#324660]"
                        onClick={() => {
                          setPosQuickPickerOpen(true);
                          posQuickSearchInputRef.current?.focus();
                        }}
                      >
                        Add Item [F1]
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-0 flex-col bg-[#fbfcff]">
                  <div className="space-y-3 border-b border-[#d4dff0] p-4">
                    <AppDateInput
                      data-workflow-date="true"
                      aria-label="Invoice Date"
                      value={createForm.voucherDate}
                      onChange={(value) => setCreateForm((current) => ({ ...current, voucherDate: value }))}
                      inputClassName="h-11 rounded-[6px] border-[#c9d7eb] bg-white text-[15px]"
                    />

                    <div ref={customerPickerRef} className="relative">
                      <Input
                        value={createForm.partyName}
                        onChange={(event) => handleCustomerInputChange(event.target.value)}
                        onFocus={() => {
                          setCustomerPickerOpen(true);
                          setCustomerPickerHighlightIndex(-1);
                        }}
                        onKeyDown={handleCustomerPickerKeyDown}
                        placeholder="Search for a customer by name, phone number [F11]"
                        className="h-11 rounded-[6px] border-[#c9d7eb] bg-white pr-11 text-[15px] placeholder:text-[#97a4b8]"
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-[6px] text-[#0f6cf6] transition hover:bg-[#eef5ff]"
                        onClick={() => {
                          setCustomerPickerOpen((current) => !current);
                          setCustomerPickerHighlightIndex(-1);
                        }}
                        aria-label="Select customer"
                      >
                        <ChevronDown className={cn("h-4 w-4 transition-transform", customerPickerOpen ? "rotate-180" : "")} />
                      </button>
                      {customerPickerOpen ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-[6px] border border-[#cfdcf0] bg-white shadow-[0_16px_38px_rgba(15,23,42,0.12)]">
                          <div ref={customerPickerListRef} className="max-h-64 overflow-auto py-1" role="listbox">
                            {filteredCustomerOptions.length ? (
                              filteredCustomerOptions.map((party, optionIndex) => (
                                <button
                                  key={party.id}
                                  type="button"
                                  role="option"
                                  aria-selected={optionIndex === customerPickerHighlightIndex}
                                  data-picker-option-index={optionIndex}
                                  className={cn(
                                    "flex w-full items-start justify-between gap-3 px-4 py-2 text-left transition hover:bg-[#f5f9ff]",
                                    optionIndex === customerPickerHighlightIndex ? "bg-[#eaf3ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                                  )}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onMouseEnter={() => setCustomerPickerHighlightIndex(optionIndex)}
                                  onClick={() => applyPartySelection(party)}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-[#1f2f46]">{party.name}</span>
                                    <span className="block truncate text-xs text-[#66768e]">{[party.contact, party.address].filter(Boolean).join(" / ") || "No contact details"}</span>
                                  </span>
                                  <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#315b96]">{party.type}</span>
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-3 text-sm text-[#6d7a8e]">No saved customer found from Parties master.</div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-4 border-b border-[#d4dff0] p-4">
                    <div className="flex items-center justify-between rounded-[6px] border border-[#d7e3f3] bg-white px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#e9f2ff] text-[#0f6cf6]">
                          <BookOpenText className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-[15px] font-semibold text-[#475569]">Total {formatCurrency(createTotal)}</div>
                          <div className="text-sm text-[#5c6b82]">Items: {posItemCount}, Quantity: {posQuantityTotal}</div>
                        </div>
                      </div>
                      <button type="button" className="text-right text-[13px] font-semibold text-[#0f6cf6]" onClick={() => toast.info("Full breakup panel can expand from this action.")}>
                        Full Breakup
                        <br />
                        [Ctrl+F]
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium text-[#55657d]">Payment Mode</span>
                        <select
                          className="h-11 rounded-[6px] border border-[#c9d7eb] bg-white px-3 text-[15px] text-[#1f2f46]"
                          value={createForm.settlementMode === "bank" ? (createForm.moneyAccountType === "MFS" ? "mfs" : "bank") : createForm.settlementMode}
                          onChange={(event) => {
                            const next = event.target.value as "cash" | "bank" | "mfs" | "accounts-payable";
                            setCreateForm((current) => ({
                              ...current,
                              settlementMode: next === "cash" ? "cash" : next === "accounts-payable" ? "accounts-payable" : "bank",
                              moneyAccountType: next === "cash" ? "CASH" : next === "mfs" ? "MFS" : "BANK",
                              moneyAccountId: "",
                              moneyAccountName: "",
                            }));
                          }}
                        >
                          <option value="cash">Cash</option>
                          <option value="bank">Bank</option>
                          <option value="mfs">MFS</option>
                          <option value="accounts-payable">Credit</option>
                        </select>
                      </label>
                      {createForm.settlementMode !== "accounts-payable" ? (
                        <label className="grid gap-1.5">
                          <span className="text-sm font-medium text-[#55657d]">Account Ledger *</span>
                          <MoneyAccountSelector
                            value={createForm.moneyAccountId}
                            enabled={mode === "api"}
                            required={mode === "api"}
                            allowedTypes={[createForm.moneyAccountType]}
                            onChange={(account) => setCreateForm((current) => ({ ...current, moneyAccountId: account?.id ?? "", moneyAccountName: account?.name ?? "" }))}
                            className="h-11 rounded-[6px]"
                          />
                        </label>
                      ) : null}
                      <label className="grid gap-1.5">
                        <span className="text-sm font-medium text-[#55657d]">Amount Received</span>
                        <div className="relative">
                          <Input
                            money
                            value={createForm.receivedAmount}
                            onChange={(event) => setCreateForm((current) => ({ ...current, receivedAmount: event.target.value }))}
                            clearZeroOnFocus
                            className="h-11 rounded-[6px] border-[#c9d7eb] bg-white pr-10 text-right text-[15px]"
                            placeholder="0.00"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2 bg-white pl-1 text-[#5b6a80]">Tk</span>
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#5b6a80]">৳</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_92px_92px]">
                      <span className="text-sm text-[#55657d]">Discount</span>
                      <div className="flex h-10 items-center justify-center rounded-[6px] border border-[#c9d7eb] bg-white text-sm text-[#5b6a80]">(Tk)</div>
                      <Input
                        money
                        ref={posDiscountInputRef}
                        value={createForm.discount}
                        onChange={(event) => setCreateForm((current) => ({ ...current, discount: event.target.value }))}
                        clearZeroOnFocus
                        className="h-10 rounded-[6px] border-[#c9d7eb] bg-white text-right"
                      />
                    </div>
                    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_92px_92px]">
                      <span className="text-sm text-[#55657d]">Additional Charges</span>
                      <div className="flex h-10 items-center justify-center rounded-[6px] border border-[#c9d7eb] bg-white text-sm text-[#5b6a80]">(Tk)</div>
                      <Input
                        money
                        ref={posChargesInputRef}
                        value={createForm.additionalCharges ?? ""}
                        onChange={(event) => setCreateForm((current) => ({ ...current, additionalCharges: event.target.value }))}
                        clearZeroOnFocus
                        className="h-10 rounded-[6px] border-[#c9d7eb] bg-white text-right"
                      />
                    </div>
                    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <label className="flex items-center gap-2 text-sm text-[#5b6a80]">
                        <input
                          type="checkbox"
                          checked={createRoundOffEnabled}
                          onChange={(event) => setCreateForm((current) => ({ ...current, roundOff: event.target.checked }))}
                        />
                        Round Off
                      </label>
                      <Input money value={createRoundOffDelta} readOnly className="h-10 rounded-[6px] border-[#c9d7eb] bg-white text-right" />
                    </div>
                    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <span className="text-sm text-[#55657d]">Remarks</span>
                      <Input
                        ref={posRemarksInputRef}
                        value={createForm.narration}
                        onChange={(event) => setCreateForm((current) => ({ ...current, narration: event.target.value }))}
                        placeholder="Bill remarks"
                        className="h-10 rounded-[6px] border-[#c9d7eb] bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <span className="text-right text-[16px] font-semibold text-[#1f2f46]">Total</span>
                      <Input money value={createTotal} readOnly className="h-11 rounded-[6px] border-[#c9d7eb] bg-white text-right text-[16px] font-semibold" />
                    </div>
                    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <span className="text-right text-[16px] font-medium text-[#55657d]">Balance</span>
                      <div className="text-right text-[18px] font-semibold text-[#1f2f46]">{formatCurrency(balanceAmountValue)}</div>
                    </div>
                  </div>

                  <div className="mt-auto border-t border-[#d4dff0]">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-[18px] font-semibold text-[#1f2f46]">Change to Return:</span>
                      <span className="text-[18px] font-semibold text-[#1f2f46]">{formatCurrency(changeToReturnValue)}</span>
                    </div>
                    <div className="space-y-3 border-t border-[#d4dff0] p-4">
                      <Button className="h-10 w-full rounded-[6px]" onClick={() => void handleCreateSave()} disabled={createSaving}>
                        <CheckCircle2 className="h-5 w-5" />
                        {createSaving ? "Saving..." : "Save & Print Bill [Ctrl+P]"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full rounded-[6px] border-[#c9d7eb] bg-white text-[#324660]"
                        onClick={() => setCreateForm((current) => ({ ...current, settlementMode: "accounts-payable" }))}
                      >
                        Other/Credit Payments [Ctrl+M]
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
          <div
            data-sales-create-page-layout={shouldRenderCreateAsPage ? "true" : undefined}
            className={cn(
              shouldRenderCreateAsPage ? "grid h-full min-h-0 gap-0 bg-white p-0 transition-[opacity,transform] duration-200 ease-out xl:grid-cols-[minmax(0,1fr)_300px]" : "",
              createPageClosing ? "translate-y-1 scale-[0.995] opacity-0" : "translate-y-0 scale-100 opacity-100",
            )}
          >
          <div data-sales-create-form className={cn("flex flex-col overflow-hidden bg-[#f8fafc]", shouldRenderCreateAsPage ? "h-full rounded-none border-0 border-r border-[#d8e1ea] shadow-none" : "max-h-[92vh]")}>
            <div data-sales-create-header className={cn("border-b border-[#d9e1ec] bg-white py-4 pl-6", shouldRenderCreateAsPage ? "pr-6" : "pr-16")}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <DialogTitle className="text-3xl font-semibold text-[#14233b]">{isSalesInvoiceForm ? "Sales" : editForm ? "Sale" : config.createLabel}</DialogTitle>
                  {!isSalesInvoiceForm ? <DialogDescription className="mt-1 text-sm text-[#334155]">
                    {createForm.partyName || "Select customer"} · {editForm ? "Edit mode" : "Create mode"}
                  </DialogDescription> : null}
                </div>
                <div className="flex items-center gap-3">
                  {/* Shown at every stage (Order/Delivery Note/Invoice) so a Cash-vs-Credit
                      intent can be tracked from the start — it only gets a real accounting
                      effect once posted as the actual Sales Invoice (see isNonFinancialSalesStage
                      in handleCreateSave, which keeps Order/Delivery Note's GL lines empty
                      regardless of this choice). */}
                  {!isSalesInvoiceForm ? <div className="inline-flex rounded-full border border-[#b9c9df] bg-[#e8eef6] p-1 shadow-sm">
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-semibold transition",
                        createForm.settlementMode === "accounts-payable"
                          ? "bg-[#1463b8] text-white shadow-[0_4px_12px_rgba(20,99,184,0.28)]"
                          : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]",
                      )}
                      onClick={() => setCreateForm((current) => ({ ...current, settlementMode: "accounts-payable" }))}
                    >
                      Credit
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-semibold transition",
                        createForm.settlementMode === "cash"
                          ? "bg-[#1463b8] text-white shadow-[0_4px_12px_rgba(20,99,184,0.28)]"
                          : "text-[#334155] hover:bg-white/70 hover:text-[#0f172a]",
                      )}
                      onClick={() => setCreateForm((current) => ({ ...current, settlementMode: "cash" }))}
                    >
                      Cash
                    </button>
                  </div> : null}
                  {shouldRenderCreateAsPage ? (
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#dc2626] shadow-sm transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#991b1b]"
                      onClick={closeSalesFormDialog}
                      disabled={createPageClosing}
                      aria-label={`Close ${config.createLabel}`}
                      title="Close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div data-sales-create-body className="min-h-0 flex-1 overflow-auto bg-white">
              <div data-sales-create-content className="grid gap-6 px-5 py-5">
                <div data-sales-create-details className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="grid items-start gap-4 sm:max-w-[320px]">
                    <label className="grid gap-1.5">
                      <span className="text-sm font-semibold text-[#0f6cf6]">Customer *</span>
                      <div ref={customerPickerRef} className="relative">
                        <div className="flex h-11 overflow-hidden rounded-md border border-[#cfd9e8] bg-white focus-within:border-[#9fc1f3] focus-within:ring-2 focus-within:ring-[#e8f1ff]">
                          <Input
                            value={createForm.partyName}
                            onChange={(event) => handleCustomerInputChange(event.target.value)}
                            onFocus={() => {
                              setSidePickerTab("party");
                              setSidePickerQuery(createForm.partyName);
                              setSidePickerPage(1);
                              setSalesSidePickerHighlightIndex(-1);
                              setCustomerPickerHighlightIndex(-1);
                              setCustomerPickerOpen(!shouldRenderCreateAsPage);
                            }}
                            onKeyDown={handleCustomerPickerKeyDown}
                            placeholder="Type customer name"
                            className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent pr-2 text-sm shadow-none focus-visible:ring-0"
                          />
                          <button
                            type="button"
                            className="inline-flex h-full w-10 shrink-0 items-center justify-center border-l border-[#d7e1ee] bg-[#f8fbff] text-[#1d3557] transition hover:bg-[#eef4ff] hover:text-[#0f6cf6]"
                            onClick={() => {
                              setSidePickerTab("party");
                              setSidePickerQuery(createForm.partyName);
                              setSidePickerPage(1);
                              setSalesSidePickerHighlightIndex(-1);
                              setCustomerPickerHighlightIndex(-1);
                              setCustomerPickerOpen((current) => (shouldRenderCreateAsPage ? false : !current));
                            }}
                            aria-label="Select customer"
                            aria-expanded={customerPickerOpen}
                          >
                            <ChevronDown className={cn("h-5 w-5 transition-transform", customerPickerOpen ? "rotate-180" : "")} />
                          </button>
                        </div>
                        {customerPickerOpen && !shouldRenderCreateAsPage ? (
                          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-[#d7e1ee] bg-white shadow-[0_18px_36px_rgba(15,23,42,0.12)]">
                            <div ref={customerPickerListRef} className="max-h-64 overflow-auto py-1.5" role="listbox">
                              {filteredCustomerOptions.length ? (
                                filteredCustomerOptions.map((party, optionIndex) => (
                                  <button
                                    key={party.id}
                                    type="button"
                                    role="option"
                                    aria-selected={optionIndex === customerPickerHighlightIndex}
                                    data-picker-option-index={optionIndex}
                                    className={cn(
                                      "flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition hover:bg-[#f8fbff]",
                                      optionIndex === customerPickerHighlightIndex ? "bg-[#eaf3ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                                    )}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onMouseEnter={() => setCustomerPickerHighlightIndex(optionIndex)}
                                    onClick={() => applyPartySelection(party)}
                                  >
                                    <span className="min-w-0">
                                      <span className="block truncate text-sm font-medium text-[#1f2937]">{party.name}</span>
                                      <span className="block truncate text-xs text-[#475569]">
                                        {[party.contact, party.address].filter(Boolean).join(" / ") || "No contact details"}
                                      </span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#315b96]">
                                      {party.type}
                                    </span>
                                  </button>
                                ))
                              ) : (
                                <div className="px-3 py-3 text-sm text-[#475569]">No saved customer found from Parties master.</div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <span className="mt-1 text-sm font-semibold text-[#25b882]">BAL: {formatCurrency(balanceAmountValue)}</span>
                    </label>
                    {/* Phone and the billing/shipping addresses are not entered here:
                        the saved voucher and every print/export already read them
                        straight off the selected customer in the Parties master. */}
                  </div>

                  <div data-sales-create-document-meta className="grid content-start gap-4">
                    <div className="grid gap-4 xl:border-l xl:border-[#e4ebf5] xl:pl-6">
                      <label className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-3">
                        <span className="text-sm text-[#374151]">Invoice Number</span>
                        <Input
                          value={createForm.reference}
                          onChange={(event) => setCreateForm((current) => ({ ...current, reference: event.target.value }))}
                          className="h-10 rounded-md border-[#cfd9e8] bg-white text-right"
                          placeholder="Invoice no"
                        />
                      </label>
                      <label className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-3">
                        <span className="text-sm text-[#374151]">Invoice Date</span>
                        <AppDateInput
                          data-workflow-date="true"
                          aria-label="Invoice Date"
                          value={createForm.voucherDate}
                          onChange={(value) => setCreateForm((current) => ({ ...current, voucherDate: value }))}
                          inputClassName="h-10 rounded-md border-[#cfd9e8] bg-white text-right"
                        />
                      </label>
                      {(config.createVoucherType === "sales" || config.createVoucherType === "credit-note") && !isSalesInvoiceForm ? (
                        <label className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-3">
                          <span className="text-sm text-[#374151]">Warehouse *</span>
                          <select
                            value={createForm.warehouseId}
                            onChange={(event) => setCreateForm((current) => ({ ...current, warehouseId: event.target.value }))}
                            className="h-10 rounded-md border border-[#cfd9e8] bg-white px-3 text-sm"
                            disabled={Boolean(editForm?.sourceVoucher.sourceVoucherId && editForm.sourceVoucher.warehouseId)}
                          >
                            <option value="">Select warehouse</option>
                            {warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}{warehouse.isDefault ? " (Default)" : ""}</option>)}
                          </select>
                        </label>
                      ) : null}
                      {config.createVoucherType === "receipt" || config.createVoucherType === "credit-note" ? (
                        <>
                          <label className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-3">
                            <span className="text-sm text-[#374151]">Original Invoice *</span>
                            <div className="relative" ref={invoicePickerRef}>
                              <button
                                type="button"
                                className="flex h-10 w-full items-center justify-between rounded-md border border-[#cfd9e8] bg-white px-3 text-left text-sm text-[#1f2937]"
                                onClick={() => setInvoicePickerOpen((current) => !current)}
                              >
                                <span className="truncate">
                                  {createForm.appliedInvoiceId
                                    ? ((config.createVoucherType === "credit-note" ? returnInvoiceOptions : outstandingInvoiceOptions)
                                        .find((entry) => entry.invoice.id === createForm.appliedInvoiceId)?.invoice.voucherNumber ?? "Selected invoice")
                                    : "Select invoice"}
                                </span>
                                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", invoicePickerOpen ? "rotate-180" : "")} />
                              </button>
                              {invoicePickerOpen ? (
                                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-64 overflow-auto rounded-xl border border-[#d7e1ee] bg-white py-1.5 shadow-[0_18px_36px_rgba(15,23,42,0.12)]">
                                  {config.createVoucherType === "receipt" ? <button
                                    type="button"
                                    className="flex w-full items-center px-3 py-2 text-left text-sm text-[#475569] hover:bg-[#f8fbff]"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      setCreateForm((current) => ({ ...current, appliedInvoiceId: null }));
                                      setInvoicePickerOpen(false);
                                    }}
                                  >
                                    No specific invoice
                                  </button> : null}
                                  {(config.createVoucherType === "credit-note" ? returnInvoiceOptions : outstandingInvoiceOptions).length ? (
                                    (config.createVoucherType === "credit-note" ? returnInvoiceOptions : outstandingInvoiceOptions).map((entry) => {
                                      const invoice = entry.invoice;
                                      const due = "due" in entry ? entry.due : 0;
                                      return (
                                      <button
                                        key={invoice.id}
                                        type="button"
                                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-[#f8fbff]"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => {
                                          setCreateForm((current) => ({
                                            ...current,
                                            appliedInvoiceId: invoice.id,
                                            reference: invoice.voucherNumber,
                                            amount: config.createVoucherType === "receipt" ? String(due) : current.amount,
                                            items: config.createVoucherType === "credit-note" && "returnableItems" in entry
                                              ? entry.returnableItems.map((item, index) => ({
                                                  id: item.inventoryItemId ?? item.id ?? `return-${index}`,
                                                  itemName: item.itemName,
                                                  quantity: "0",
                                                  unitPrice: String(item.unitPrice),
                                                  unit: localOptions.inventory.find((option) => normalizeLookupValue(option.itemName) === normalizeLookupValue(item.itemName))?.unit,
                                                }))
                                              : current.items,
                                          }));
                                          setInvoicePickerOpen(false);
                                        }}
                                      >
                                        <span className="truncate font-medium text-[#1f2937]">{invoice.voucherNumber}</span>
                                        <span className="shrink-0 text-xs text-[#475569]">
                                          {config.createVoucherType === "credit-note" && "returnableItems" in entry
                                            ? `${entry.returnableItems.length} returnable item(s)`
                                            : `Due ${formatCurrency(due)}`}
                                        </span>
                                      </button>
                                      );
                                    })
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-[#475569]">No eligible invoice for this customer.</div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </label>
                          {config.createVoucherType === "receipt" ? <label className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center sm:gap-3">
                            <span className="text-sm text-[#374151]">Amount *</span>
                            <Input
                              money
                              value={createForm.amount}
                              onChange={(event) => setCreateForm((current) => ({ ...current, amount: event.target.value }))}
                              clearZeroOnFocus
                              className="h-10 rounded-md border-[#cfd9e8] bg-white text-right"
                              placeholder="0.00"
                            />
                          </label> : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div data-sales-create-items className="rounded-[12px] border border-[#d7e1ee] bg-white">
                  <div className="overflow-x-auto overflow-y-visible">
                    <div className="relative min-w-[762px]">
                      <div data-sales-create-items-header className={cn("grid border-b border-[#d7e1ee] bg-[#fbfdff] text-xs font-semibold uppercase tracking-[0.08em] text-[#1d3a61]", isSalesInvoiceForm ? "grid-cols-[54px_minmax(0,1fr)_170px_90px_100px_150px_150px_48px]" : "grid-cols-[54px_minmax(0,1fr)_120px_150px_170px_170px_48px]")}>
                        <div className="px-3 py-3">#</div>
                        <div className="border-l border-[#e7edf5] px-3 py-3">Item</div>
                        {isSalesInvoiceForm ? <div className="border-l border-[#e7edf5] px-3 py-3">Warehouse *</div> : null}
                        <div className="border-l border-[#e7edf5] px-3 py-3">Qty</div>
                        <div className="border-l border-[#e7edf5] px-3 py-3">Unit</div>
                        <div className="border-l border-[#e7edf5] px-3 py-3 text-right">Price/Unit</div>
                        <div className="border-l border-[#e7edf5] px-3 py-3 text-right">Amount</div>
                        <div className="border-l border-[#e7edf5] px-3 py-3 text-center">
                          <button
                            type="button"
                            className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0f6cf6] text-[#0f6cf6] transition hover:bg-[#eef4ff]", config.createVoucherType === "credit-note" && "invisible")}
                            onClick={() =>
                              setCreateForm((current) => ({
                                ...current,
                                items: [...current.items, buildCreateItem(current.items.length)],
                              }))
                            }
                            aria-label="Add row"
                          >
                            <Plus className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      <div data-sales-create-item-rows className="divide-y divide-[#edf2f8]">
                        {createForm.items.map((item, index) => {
                          const rowAmount = toSafeNumber(item.quantity) * toSafeNumber(item.unitPrice);
                          const matchedItem = localOptions.inventory.find((entry) => normalizeLookupValue(entry.itemName) === normalizeLookupValue(item.itemName));
                          return (
                            <div key={item.id} className={cn("grid", isSalesInvoiceForm ? "grid-cols-[54px_minmax(0,1fr)_170px_90px_100px_150px_150px_48px]" : "grid-cols-[54px_minmax(0,1fr)_120px_150px_170px_170px_48px]")}>
                              <div className="px-3 py-3 text-[#6f7d91]">{index + 1}</div>
                              <div className="border-l border-[#edf2f8] px-1.5 py-1.5">
                                <div
                                  ref={activeInventoryPickerItemId === item.id ? inventoryPickerRef : undefined}
                                  className="relative flex h-10 items-center rounded-md border border-[#d7e1ee] bg-white pr-1.5 shadow-[0_1px_0_rgba(15,23,42,0.02)] focus-within:border-[#9fc1f3] focus-within:ring-2 focus-within:ring-[#e8f1ff]"
                                >
                                  <Input
                                    data-sales-item-id={item.id}
                                    value={item.itemName}
                                    readOnly={config.createVoucherType === "credit-note"}
                                    onChange={(event) => {
                                      updateCreateItem(item.id, { itemName: event.target.value });
                                      setActiveInventoryPickerItemId(item.id);
                                      setInventoryPickerHighlightIndex(-1);
                                      // On the full page the Quick Picker is the item list, so
                                      // typing here filters that panel instead of opening a
                                      // second dropdown over the row.
                                      if (shouldRenderCreateAsPage) {
                                        setSidePickerTab("item");
                                        setSidePickerQuery(event.target.value);
                                        setSidePickerPage(1);
                                        setSalesSidePickerHighlightIndex(-1);
                                      }
                                    }}
                                    onFocus={() => {
                                      setActiveInventoryPickerItemId(item.id);
                                      setInventoryPickerHighlightIndex(-1);
                                      setSalesSidePickerHighlightIndex(-1);
                                      if (shouldRenderCreateAsPage) {
                                        setSidePickerTab("item");
                                        setSidePickerQuery(item.itemName);
                                        setSidePickerPage(1);
                                      }
                                    }}
                                    onKeyDown={(event) => handleInventoryPickerKeyDown(event, item.id)}
                                    placeholder="Item"
                                    className="h-full rounded-none border-0 bg-transparent pr-2 shadow-none focus-visible:ring-0"
                                  />
                                  <button
                                    type="button"
                                    className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#334155] transition hover:bg-[#eef4ff] hover:text-[#1f3b57]", config.createVoucherType === "credit-note" && "hidden")}
                                    onClick={() => {
                                      setActiveInventoryPickerItemId((current) => (current === item.id ? null : item.id));
                                      setInventoryPickerHighlightIndex(-1);
                                    }}
                                    aria-label="Select item"
                                    aria-expanded={activeInventoryPickerItemId === item.id}
                                  >
                                    <ChevronDown className={cn("h-5 w-5 transition-transform", activeInventoryPickerItemId === item.id ? "rotate-180" : "")} />
                                  </button>
                                </div>
                              </div>
                              {isSalesInvoiceForm ? (
                                <div className="border-l border-[#edf2f8] px-1.5 py-1.5">
                                  <select
                                    value={createForm.warehouseId}
                                    onChange={(event) => setCreateForm((current) => ({ ...current, warehouseId: event.target.value }))}
                                    className="h-10 w-full rounded-md border border-[#d7e1ee] bg-white px-2 text-sm"
                                    disabled={Boolean(editForm?.sourceVoucher.sourceVoucherId && editForm.sourceVoucher.warehouseId)}
                                  >
                                    <option value="">Select warehouse</option>
                                    {warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}
                                  </select>
                                </div>
                              ) : null}
                              <div className="border-l border-[#edf2f8] px-1.5 py-1.5">
                                <Input
                                  value={item.quantity}
                                  onChange={(event) => updateCreateItem(item.id, { quantity: event.target.value })}
                                  placeholder="1"
                                  className="h-10 rounded-md border-[#d7e1ee] bg-white text-right shadow-none"
                                />
                              </div>
                              <div className="border-l border-[#edf2f8] px-1.5 py-1.5">
                                <div className="flex h-10 items-center rounded-md border border-[#d7e1ee] bg-[#fbfdff] px-3 text-sm text-foreground">
                                  {matchedItem?.unit ?? "NONE"}
                                </div>
                              </div>
                              <div className="border-l border-[#edf2f8] px-1.5 py-1.5">
                                <Input
                                  money
                                  value={item.unitPrice}
                                  readOnly={config.createVoucherType === "credit-note" || Boolean(section === "delivery-challan" && conversionSourceVoucherId)}
                                  onChange={(event) => updateCreateItem(item.id, { unitPrice: event.target.value })}
                                  placeholder="0"
                                  clearZeroOnFocus
                                  className="h-10 rounded-md border-[#d7e1ee] bg-white text-right shadow-none"
                                />
                              </div>
                              <div className="border-l border-[#edf2f8] px-3 py-3 text-right font-medium tabular-nums">{rowAmount ? formatCurrency(rowAmount) : formatCurrency(0)}</div>
                              <div className="border-l border-[#edf2f8] px-1 py-1.5">
                                {config.createVoucherType !== "credit-note" ? <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-10 w-10 rounded-md text-[#334155] hover:text-[#c43d34]"
                                  disabled={createForm.items.length === 1}
                                  onClick={() =>
                                    setCreateForm((current) => ({
                                      ...current,
                                      items: current.items.filter((entry) => entry.id !== item.id),
                                    }))
                                  }
                                >
                                  <Trash2 className="h-5 w-5" />
                                </Button> : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div data-sales-create-items-footer className={cn("grid border-t border-[#d7e1ee] bg-[#fbfdff]", isSalesInvoiceForm ? "grid-cols-[54px_minmax(0,1fr)_170px_90px_100px_150px_150px_48px]" : "grid-cols-[54px_minmax(0,1fr)_120px_150px_170px_170px_48px]")}>
                        <div className="px-3 py-3" />
                        <div className="px-3 py-3">
                          {config.createVoucherType !== "credit-note" ? <Button
                            type="button"
                            variant="outline"
                            className="rounded-md border-[#8ebcff] text-[#0f6cf6]"
                            onClick={() =>
                              setCreateForm((current) => ({
                                ...current,
                                items: [...current.items, buildCreateItem(current.items.length)],
                              }))
                            }
                          >
                            Add Row
                          </Button> : <span className="text-sm font-medium text-[#64748b]">Items are loaded from the original invoice</span>}
                        </div>
                        {isSalesInvoiceForm ? <div className="px-3 py-3" /> : null}
                        <div className="px-3 py-3 text-right font-medium text-[#1d3a61]">Total</div>
                        <div className="px-3 py-3 text-right font-medium text-[#1d3a61]">
                          {formatNumber(createForm.items.reduce((sum, item) => sum + toSafeNumber(item.quantity), 0))}
                        </div>
                        <div className="px-3 py-3" />
                        <div className="px-3 py-3 text-right font-semibold tabular-nums text-[#14233b]">{formatCurrency(createTotal)}</div>
                        <div className="px-3 py-3" />
                      </div>
                    </div>
                  </div>
                </div>

                {isSalesInvoiceForm ? (
                  <div data-sales-create-payment className="rounded-[12px] border border-[#d7e1ee] bg-[#f8fbff] p-3">
                    <label className="grid max-w-[360px] gap-1.5">
                      <span className="text-sm font-medium text-[#334155]">Payment Type</span>
                      <select
                        className="h-10 rounded-md border border-[#cfd9e8] bg-white px-3 text-sm text-[#1f2937]"
                        value={createForm.settlementMode === "accounts-payable" ? "accounts-payable" : "cash-bank-mfs"}
                        onChange={(event) => {
                          const next = event.target.value as "cash-bank-mfs" | "accounts-payable";
                          setCreateForm((current) => ({
                            ...current,
                            settlementMode: next === "accounts-payable" ? "accounts-payable" : "cash",
                            moneyAccountType: next === "accounts-payable" ? current.moneyAccountType : "CASH",
                            moneyAccountId: "",
                            moneyAccountName: "",
                          }));
                        }}
                      >
                        <option value="accounts-payable">Credit</option>
                        <option value="cash-bank-mfs">Cash/Bank/MFS</option>
                      </select>
                    </label>
                    {createForm.settlementMode !== "accounts-payable" ? (
                      <label className="mt-3 grid max-w-[720px] gap-1.5">
                        <span className="text-sm font-medium text-[#334155]">Type of Payment / Account Ledger *</span>
                        <MoneyAccountSelector
                          value={createForm.moneyAccountId}
                          enabled={mode === "api"}
                          required={mode === "api"}
                          allowedTypes={["CASH", "BANK", "MFS"]}
                          onChange={(account) => setCreateForm((current) => ({
                            ...current,
                            settlementMode: account?.type === "BANK" || account?.type === "MFS" ? "bank" : "cash",
                            moneyAccountType: account?.type ?? "CASH",
                            moneyAccountId: account?.id ?? "",
                            moneyAccountName: account?.name ?? "",
                          }))}
                          className="h-10 rounded-md"
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}

                <div data-sales-create-bottom className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-4">
                      {showCreateTermsField || createForm.condition.trim() ? (
                        <label className="grid gap-2">
                          <span className="flex items-center justify-between text-sm font-medium text-[#334155]">
                            Terms & Conditions
                            <button
                              type="button"
                              className="text-xs font-medium text-[#0f6cf6]"
                              onClick={() => {
                                setCreateForm((current) => ({ ...current, condition: "" }));
                                setShowCreateTermsField(false);
                              }}
                            >
                              Clear
                            </button>
                          </span>
                          <textarea
                            className="min-h-[96px] rounded-md border border-[#d7e1ee] bg-white px-3 py-3 text-sm text-foreground"
                            value={createForm.condition}
                            onChange={(event) => setCreateForm((current) => ({ ...current, condition: event.target.value }))}
                            placeholder="Payment terms, validity, delivery terms, warranty, or other customer-facing conditions"
                          />
                        </label>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-full justify-start rounded-md border-[#d7e1ee] text-[#1e293b]"
                          onClick={() => setShowCreateTermsField(true)}
                        >
                          Add Terms & Conditions
                        </Button>
                      )}
                      <label className="grid gap-2">
                        <span className="text-sm font-medium text-[#334155]">Narration</span>
                        <textarea
                          className="min-h-[108px] rounded-md border border-[#d7e1ee] bg-white px-3 py-3 text-sm text-foreground"
                          value={createForm.narration}
                          onChange={(event) => setCreateForm((current) => ({ ...current, narration: event.target.value }))}
                          placeholder="Add description or internal note"
                        />
                      </label>
                    </div>

                    <div className="space-y-4">
                      {/* Payment type is the Credit/Cash toggle in the header — both
                          drove the same `settlementMode`, so this was a duplicate. */}
                      <Button type="button" variant="outline" className="h-11 w-full justify-start rounded-md border-[#d7e1ee] text-[#1e293b]">
                        Add Description
                      </Button>
                    </div>
                  </div>

                  <div data-sales-create-totals className="space-y-4 rounded-[14px] border border-[#d7e1ee] bg-[#fbfdff] p-4">
                    <div className="grid gap-3">
                      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_90px_90px]">
                        <span className="text-sm font-medium text-[#1e293b]">Discount</span>
                        <div className="flex h-10 items-center justify-center rounded-md border border-[#d7e1ee] bg-white text-sm text-[#1e293b]">(%)</div>
                        <Input
                          value={createForm.discount}
                          onChange={(event) => setCreateForm((current) => ({ ...current, discount: event.target.value }))}
                          clearZeroOnFocus
                          className="h-10 rounded-md border-[#d7e1ee] bg-white text-right"
                        />
                      </div>
                      {isSalesInvoiceForm && loyaltySettings?.enabled ? (
                        <div className="rounded-lg border border-[#f6d7ad] bg-[#fffaf2] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-[#7c4614]">Redeem loyalty points</div>
                              <div className="mt-0.5 text-xs text-[#8a6a49]">Available: {loyaltyBalance} points · {loyaltyPointsPerRedemption} points = {formatCurrency(loyaltyRedeemAmount)}</div>
                            </div>
                            <button type="button" className="text-xs font-semibold text-primary hover:underline disabled:opacity-40" disabled={maximumRedeemablePoints <= 0} onClick={() => setCreateForm((current) => ({ ...current, loyaltyPoints: String(maximumRedeemablePoints) }))}>Use maximum</button>
                          </div>
                          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                            <Input type="number" min={0} step={loyaltyPointsPerRedemption || 1} value={createForm.loyaltyPoints} onChange={(event) => setCreateForm((current) => ({ ...current, loyaltyPoints: event.target.value }))} className="h-10 rounded-md border-[#e7c99d] bg-white" />
                            <div className="min-w-[110px] text-right text-sm font-semibold text-[#16803d]">− {formatCurrency(loyaltyDiscount)}</div>
                          </div>
                          {requestedLoyaltyPoints !== validLoyaltyPoints ? <div className="mt-2 text-xs text-[#b45309]">Points are applied in valid conversion blocks, up to the invoice value.</div> : null}
                        </div>
                      ) : null}
                      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_130px_50px]">
                        <span className="text-sm font-medium text-[#1e293b]">Tax</span>
                        <div className="flex h-10 items-center rounded-md border border-[#d7e1ee] bg-white px-3 text-sm text-[#1e293b]">NONE</div>
                        <div className="text-right font-medium tabular-nums">{formatAmount(0)}</div>
                      </div>
                      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_50px_minmax(0,1fr)]">
                        <label className="flex items-center gap-2 text-sm font-medium text-[#1e293b]">
                          <input
                            type="checkbox"
                            checked={createRoundOffEnabled}
                            onChange={(event) => setCreateForm((current) => ({ ...current, roundOff: event.target.checked }))}
                          />
                          Round Off
                        </label>
                        <div />
                        <Input money value={createRoundOffDelta} readOnly className="h-10 rounded-md border-[#d7e1ee] bg-white text-right" />
                      </div>
                      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <span className="text-right text-lg font-semibold text-[#14233b]">Total</span>
                        <Input money value={createTotal} readOnly className="h-11 rounded-md border-[#d7e1ee] bg-white text-right text-lg font-semibold" />
                      </div>
                      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <span className="text-right text-base font-medium text-[#334155]">Received</span>
                        <Input
                          money
                          value={createForm.receivedAmount}
                          onChange={(event) => setCreateForm((current) => ({ ...current, receivedAmount: event.target.value }))}
                          clearZeroOnFocus
                          className="h-11 rounded-md border-[#d7e1ee] bg-white text-right"
                          placeholder="0"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_1fr] items-center gap-3">
                        <span className="text-right text-base font-semibold text-[#14233b]">Balance</span>
                        <div className="text-right text-2xl font-semibold tabular-nums text-[#14233b]">{formatCurrency(balanceAmountValue)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <datalist id={`sales-create-customer-options-${section}`}>
                  {localOptions.parties.map((party) => (
                    <option key={party.id} value={party.name} />
                  ))}
                </datalist>
                <datalist id={`sales-create-item-options-${section}`}>
                  {localOptions.inventory.map((item, optionIndex) => (
                    <option key={`${item.itemCode}-${item.itemName}-${optionIndex}`} value={item.itemName} />
                  ))}
                </datalist>
              </div>
            </div>

            <div data-sales-create-footer className="border-t border-[#d9e1ec] bg-white px-6 py-4">
              <div className="flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  className="rounded-md border-[#8ebcff] px-5 text-[#0f6cf6]"
                  onClick={() => {
                    if (editForm) {
                      void refreshPreviewDialog(editForm.sourceVoucher, `${editForm.sourceVoucher.partyName} invoice preview is ready to share.`);
                      return;
                    }

                    void handleCreateSave();
                  }}
                  disabled={createSaving}
                >
                  <Share2 className="h-5 w-5" />
                  Share
                </Button>
                <Button className="rounded-md px-10" onClick={() => void handleCreateSave()} disabled={createSaving}>
                  <CheckCircle2 className="h-5 w-5" />
                  {createSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
          {shouldRenderCreateAsPage ? renderSalesSidePickerPanel() : null}
          </div>
          ))}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewDialog)} onOpenChange={(open) => (!open ? setPreviewDialog(null) : undefined)}>
        <DialogContent className="h-[90vh] w-[min(98vw,1760px)] max-w-none overflow-hidden rounded-[26px] border border-[#dfe5ee] p-0">
          {previewDialog ? (
            <div className="grid h-full min-h-0 overflow-hidden grid-cols-1 xl:grid-cols-[clamp(220px,17vw,290px)_minmax(0,1fr)_clamp(240px,19vw,320px)]">
              <div className="min-h-0 overflow-auto border-b border-[#e5eaf1] bg-[#f6f7f9] xl:border-b-0 xl:border-r">
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
                              onClick={() => setPreviewTheme(themeOption.id)}
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
                    <div className="mt-1 text-xs leading-5 text-[#6f7d91]">Upload your company pad as a PNG or JPG. The same pad will be used for previews, PDFs, and printing.</div>
                    <input ref={invoicePadInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handlePreviewPadUpload(event)} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="rounded-full border-[#d8e3f0] bg-white text-[#1f4d8f] hover:bg-[#f7fbff]" onClick={() => invoicePadInputRef.current?.click()}>
                        <UploadCloud className="h-4 w-4" />
                        {previewDialog.payload.invoicePadDataUrl ? "Change Company Pad" : "Upload Company Pad"}
                      </Button>
                      <Button type="button" variant="outline" className="rounded-full border-[#d8e3f0] bg-white text-[#5f6f86] hover:bg-[#f7fbff]" onClick={() => router.push(buildWorkspaceRoute(mode, "/company-profile"))}>
                        Open Company Profile
                      </Button>
                    </div>
                  </div>
                  <div className="mt-6 rounded-2xl border border-[#e6e1c5] bg-[#fffceb] px-4 py-4 text-sm text-[#776433]">
                    Use this theme for a clean and professional preview like Bizovix.
                  </div>
                </div>
              </div>

              <div className="min-h-0 overflow-auto bg-[#eef1f5]">
                <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#dfe6ef] bg-white/95 px-5 py-4 backdrop-blur">
                  <div>
                    <DialogTitle className="text-[32px] font-semibold text-[#183153]">Preview</DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-[#64748b]">
                      {config.label} preview for {previewDialog.payload.billToName}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-[#5f6b7a]">
                      <input
                        type="checkbox"
                        checked={skipPreviewAfterSave}
                        onChange={(event) => updateSkipPreviewAfterSave(event.target.checked)}
                        className="h-4 w-4 rounded border-[#c9d5e4]"
                      />
                      Do not show preview again
                    </label>
                    <Button variant="outline" className="rounded-2xl border-[#d9e3f0]" onClick={() => setPreviewDialog(null)}>
                      <CheckCircle2 className="h-5 w-5" />
                      Save & Close
                    </Button>
                  </div>
                </div>

                <div className="px-8 py-8">
                  {previewTheme === "modern" ? (
                    <div className="mx-auto max-w-[1050px] overflow-hidden rounded-[22px] border border-[#dbe4ef] bg-white shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
                      <img src={previewDialog.imageSrc} alt={`${previewDialog.title} preview`} className="w-full" />
                    </div>
                  ) : (
                    <div
                      className="mx-auto w-full max-w-[1050px] rounded-[10px] border border-[#b6beca] bg-white p-4 shadow-[0_28px_60px_rgba(15,23,42,0.12)]"
                      style={{ aspectRatio: "210 / 297" }}
                    >
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] border border-[#5f6774]">
                        {previewDialog.payload.logoDataUrl ? (
                          <div className="flex min-h-[84px] items-center justify-center bg-white p-2">
                            <img src={previewDialog.payload.logoDataUrl} alt="Company logo" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="flex min-h-[84px] items-center justify-center bg-[#a7a1a1] text-[16px] font-bold tracking-[0.08em] text-white">LOGO</div>
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
                          <div className="border-b border-[#5f6774] px-3 py-1 font-semibold">{config.label} For:</div>
                          <div className="space-y-1 px-3 py-2">
                            <div className="font-semibold">{previewDialog.payload.billToName}</div>
                            {previewDialog.payload.billToAddressLines.map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="border-b border-[#5f6774] px-3 py-1 font-semibold">Document Details:</div>
                          <div className="grid gap-1 px-3 py-2">
                            <div>
                              <span className="font-semibold">No: </span>
                              {previewDialog.payload.invoiceNumber}
                            </div>
                            <div>
                              <span className="font-semibold">Date: </span>
                              {previewDialog.payload.dateLabel}
                            </div>
                            <div>
                              <span className="font-semibold">Settlement: </span>
                              {previewDialog.payload.paymentMode}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border-x border-b border-[#5f6774] px-3 py-1 text-[12px] font-semibold text-[#111827]">Ship To:</div>
                      <div className="border-x border-b border-[#5f6774] px-3 py-2 text-[12px] text-[#111827]">
                        {previewDialog.payload.billToAddressLines.join(", ") || "N/A"}
                      </div>

                      <table className="w-full border-collapse text-[12px] text-[#111827]">
                        <thead>
                          <tr>
                            <th className="w-[48px] border border-[#5f6774] px-2 py-2 text-left font-semibold">#</th>
                            <th className="border border-[#5f6774] px-2 py-2 text-left font-semibold">Item name</th>
                            <th className="w-[96px] border border-[#5f6774] px-2 py-2 text-right font-semibold">Quantity</th>
                            <th className="w-[120px] border border-[#5f6774] px-2 py-2 text-right font-semibold">Rate</th>
                            <th className="w-[120px] border border-[#5f6774] px-2 py-2 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewDialog.payload.items.map((item, index) => (
                            <tr key={`${item.description}-${index}`}>
                              <td className="border border-[#5f6774] px-2 py-2 align-top">{index + 1}</td>
                              <td className="border border-[#5f6774] px-2 py-2 align-top">{item.description}</td>
                              <td className="border border-[#5f6774] px-2 py-2 text-right align-top">{formatNumber(toSafeNumber(item.quantity))}</td>
                              <td className="border border-[#5f6774] px-2 py-2 text-right align-top">{formatCurrency(item.price || 0)}</td>
                              <td className="border border-[#5f6774] px-2 py-2 text-right align-top">{formatCurrency(item.total || 0)}</td>
                            </tr>
                          ))}
                          <tr>
                            <td className="border border-[#5f6774]" />
                            <td className="border border-[#5f6774] px-2 py-2 font-semibold">Total</td>
                            <td className="border border-[#5f6774] px-2 py-2 text-right font-semibold">
                              {formatNumber(previewDialog.payload.items.reduce((sum, item) => sum + toSafeNumber(item.quantity), 0))}
                            </td>
                            <td className="border border-[#5f6774]" />
                            <td className="border border-[#5f6774] px-2 py-2 text-right font-semibold">{formatCurrency(previewDialog.payload.total)}</td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="grid grid-cols-[minmax(0,1fr)_240px] border-x border-b border-[#5f6774]">
                        <div className="min-h-[120px] border-r border-[#5f6774] px-3 py-3 text-[12px] text-[#111827]">
                          <div className="font-semibold">Note:</div>
                          <div className="mt-2 whitespace-pre-wrap text-[#374151]">{previewDialog.payload.note || `${config.label} created from popup.`}</div>
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

                      <div className="grid grid-cols-3 border-x border-b border-[#5f6774] text-[12px] font-semibold text-[#1f2937]">
                        <div className="border-r border-[#5f6774] px-3 py-3">Received By:</div>
                        <div className="border-r border-[#5f6774] px-3 py-3">Delivered By:</div>
                        <div className="px-3 py-3">For {previewDialog.payload.companyName}:</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-col overflow-auto border-t border-[#e5eaf1] bg-white xl:border-l xl:border-t-0">
                <div className="border-b border-[#e8edf4] px-5 py-5">
                  <div className="text-[18px] font-semibold text-[#1f2937]">Share {config.label}</div>
                  <div className="mt-1 text-sm text-[#64748b]">After saving, you can download the PDF, print, or share it from here.</div>
                </div>
                <div className="space-y-6 px-5 py-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      className="justify-start rounded-2xl border-[#e5eaf1] py-6 text-[#f47b20]"
                      onClick={() => void downloadInvoicePdf(`${previewDialog.title}.pdf`, previewDialog.payload)}
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                    </Button>
                    <Button variant="outline" className="justify-start rounded-2xl border-[#e5eaf1] py-6 text-[#f47b20]" onClick={() => void openInvoicePdf(previewDialog.payload)}>
                      <Eye className="h-4 w-4" />
                      Open PDF
                    </Button>
                    <Button variant="outline" className="justify-start rounded-2xl border-[#e5eaf1] py-6 text-[#f47b20]" onClick={() => void printInvoice(previewDialog.payload)}>
                      <Printer className="h-5 w-5" />
                      Print {config.label}
                    </Button>
                  </div>
                </div>
                <div className="mt-auto border-t border-[#e8edf4] px-5 py-4">
                  <Button className="w-full rounded-2xl" onClick={() => setPreviewDialog(null)}>
                    <CheckCircle2 className="h-5 w-5" />
                    Save & Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Full-page mode shows the Quick Picker beside the form, so the row-level
          dropdown would be a second copy of the same list stacked on top of it. */}
      {activeInventoryPickerItemId && inventoryPickerPosition && !shouldRenderCreateAsPage
        ? createPortal(
            <div
              ref={inventoryPickerPanelRef}
              className="fixed z-[120] overflow-hidden rounded-xl border border-[#d7e1ee] bg-white shadow-[0_18px_36px_rgba(15,23,42,0.12)]"
              style={{
                left: inventoryPickerPosition.left,
                top: inventoryPickerPosition.top,
                width: inventoryPickerPosition.width,
              }}
            >
              <div ref={inventoryPickerListRef} className="overflow-auto py-1.5" style={{ maxHeight: inventoryPickerPosition.maxHeight }} role="listbox">
                {activeInventoryOptions.length ? (
                  activeInventoryOptions.map((inventoryItem, optionIndex) => (
                    <button
                      key={`${activeInventoryPickerItemId}-${inventoryItem.itemCode}-${inventoryItem.itemName}-${optionIndex}`}
                      type="button"
                      role="option"
                      aria-selected={optionIndex === inventoryPickerHighlightIndex}
                      data-picker-option-index={optionIndex}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition hover:bg-[#f8fbff]",
                        optionIndex === inventoryPickerHighlightIndex ? "bg-[#eaf3ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setInventoryPickerHighlightIndex(optionIndex)}
                      onClick={() => applyInventorySelection(activeInventoryPickerItemId, inventoryItem)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[#1f2937]">{inventoryItem.itemName}</span>
                        <span className="block truncate text-xs text-[#64748b]">
                          {[inventoryItem.itemCode, inventoryItem.unit, `Rate ${formatCurrency(inventoryItem.rate)}`].filter(Boolean).join(" / ")}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#315b96]">
                        {inventoryItem.qty}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-3 text-sm text-[#64748b]">No stock item found from Inventory master.</div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {columnFilterPopover
        ? createPortal(
            <div
              ref={columnFilterPopoverRef}
              className="fixed z-[70] w-[260px] rounded-2xl border border-border bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.18)]"
              style={{ left: columnFilterPopover.left, top: columnFilterPopover.top }}
            >
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Select Category</div>
          <div className="mt-3 space-y-3">
            <select
              className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground"
              value={columnFilterDraft.operator}
              onChange={(event) => setColumnFilterDraft((current) => ({ ...current, operator: event.target.value as ColumnFilterOperator }))}
            >
              <option value="contains">Contains</option>
              <option value="equals">Equals</option>
              <option value="starts-with">Starts with</option>
            </select>
            <div className="space-y-1">
              <div className="text-xs text-muted">{columnFilterPopover.columnId.replace(/([A-Z])/g, " $1")}</div>
              <Input
                value={columnFilterDraft.value}
                onChange={(event) => setColumnFilterDraft((current) => ({ ...current, value: event.target.value }))}
                placeholder="Enter filter value"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setColumnFilters((current) => {
                    const next = { ...current };
                    delete next[columnFilterPopover.columnId];
                    return next;
                  });
                  setColumnFilterPopover(null);
                  toast.success("Column filter cleared");
                }}
              >
                Clear
              </Button>
              <Button
                onClick={() => {
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
                  toast.success(columnFilterDraft.value.trim() ? "Column filter applied" : "Column filter cleared");
                }}
              >
                Apply
              </Button>
            </div>
          </div>
            </div>,
            document.body,
          )
        : null}

      {workflowMenuOpen && workflowMenuPosition
        ? createPortal(
            <div
              ref={workflowMenuPanelRef}
              className="fixed z-[95] max-h-[70vh] overflow-y-auto rounded-2xl border border-[#d5dfeb] bg-white p-2 shadow-[0_18px_34px_rgba(15,23,42,0.18)]"
              style={{
                left: workflowMenuPosition.left,
                top: workflowMenuPosition.top,
                width: workflowMenuPosition.width,
              }}
            >
              {["quotation", "proforma", "sale-order", "delivery-challan", "invoices", "credit-note", "payment-in"]
                .map((slug) => salesWorkspaceSections.find((entry) => entry.slug === slug))
                .filter((entry): entry is (typeof salesWorkspaceSections)[number] => Boolean(entry))
                .map((entry) => (
                <button
                  key={entry.slug}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                    entry.slug === section ? cn(theme.soft, theme.text) : "text-[#24364f] hover:bg-[#f7faff]",
                  )}
                  onClick={() => {
                    setWorkflowMenuOpen(false);
                    router.push(buildSalesWorkspaceRoute(mode, entry.slug));
                  }}
                >
                  <entry.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{entry.label}</span>
                  {showTabCounts ? <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-[11px]">{tabCounts[entry.slug]}</span> : null}
                </button>
              ))}
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                onClick={() => {
                  setWorkflowMenuOpen(false);
                  router.push(buildWorkspaceRoute(mode, "/sales/revenue"));
                }}
              >
                <CircleDollarSign className="h-4 w-4 shrink-0" />
                <span className="flex-1">Revenue</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function SalesStatusBadge({ label }: { label: string }) {
  const status = label.trim().toLowerCase();
  const isAny = (values: string[]) => values.some((value) => status === value || status.includes(value));
  const tone = isAny(["cancelled", "unpaid", "overdue", "rejected", "failed", "void"])
    ? "danger"
    : isAny(["partially", "partial"])
      ? "info"
      : isAny(["converted", "invoiced", "delivered", "paid", "posted", "completed", "applied", "used", "received"])
        ? "success"
        : isAny(["open", "pending", "draft", "prepared", "dispatched", "receivable"])
          ? "warning"
          : "neutral";
  const styles = {
    success: { badge: "border-[#8fd2ad] bg-[#e7f7ee] text-[#08783d]", dot: "bg-[#0b9b50]" },
    warning: { badge: "border-[#edc16e] bg-[#fff5df] text-[#995300]", dot: "bg-[#e58a00]" },
    info: { badge: "border-[#9fc3ed] bg-[#eaf4ff] text-[#155fa9]", dot: "bg-[#287fc8]" },
    danger: { badge: "border-[#efa0a8] bg-[#fff0f1] text-[#b82432]", dot: "bg-[#d83a48]" },
    neutral: { badge: "border-[#c7d1df] bg-[#f1f4f8] text-[#4d6078]", dot: "bg-[#718096]" },
  }[tone];

  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold leading-none", styles.badge)}>
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", styles.dot)} />
      {label}
    </span>
  );
}

function InfoTile({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "text-[#00a63e]" : tone === "warning" ? "text-[#d9822b]" : tone === "danger" ? "text-[#ff4d5e]" : "text-[#173152]";

  return (
    <div className="flex min-h-14 items-center justify-between gap-5 border-b border-[#e8edf4] py-3">
      <div className="text-[12px] font-medium text-[#74839b]">{label}</div>
      <div className={cn("text-right text-sm font-semibold", toneClass)}>{value}</div>
    </div>
  );
}

