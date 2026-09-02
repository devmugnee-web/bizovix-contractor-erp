"use client";

import { startTransition, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, Copy, CreditCard, Download, FileStack, FileText, Info, Mail, MinusCircle, Package2, Pencil, Plus, Printer, RefreshCw, Search, Send, Share2, Trash2, Undo2, UploadCloud, UserRound, Wallet, X } from "lucide-react";

import { WhatsAppIcon } from "@/components/shared/brand-icons";
import { AppDateInput } from "@/components/shared/app-date-input";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { InvoiceDocument } from "@/components/shared/invoice-document";
import { MoneyAccountSelector } from "@/components/shared/money-account-selector";
import { TablePagination } from "@/components/shared/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { appConfig } from "@/config/app";
import { buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import {
  PartyFormDialog,
  cloneDefaultPartySettings,
  createDefaultPartyFormState,
  getPartySettingsStorageKey,
  readStoredPartySettings,
  type PartyFormState,
  type PartySettingsState,
} from "@/features/parties/party-form-dialog";
import { getVoucherTemplate, inferLinePostingSide, resolveLinePostingSide, roundCurrencyAmount, type PostingSide } from "@/lib/accounting";
import { getInventoryOptions, getPartyOptions, getTrialBalanceRows } from "@/lib/erp-data";
import { apiRequest } from "@/services/api-client";
import { createVoucher, deleteVoucher, getVoucher, listDayBook, reverseVoucher, updateVoucher } from "@/services/voucher.service";
import { readDataset, writeDataset } from "@/services/browser-dataset";
import { COMPANY_PROFILE_UPDATED_EVENT, readCompanyProfile, writeCompanyProfile } from "@/services/company-profile";
import {
  defaultWorkflowSettings,
  evaluateWorkflowRootAccess,
  type WorkflowSettingsLoadState,
} from "@/services/workflow-settings.service";
import { useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { useAccountTreeQuery, useCreateAccountMutation, useLedgerItemsQuery, usePostableLedgersQuery } from "@/hooks/use-accounts-query";
import { AccountFormDialog, emptyForm as emptyAccountFormState, findAccountPath, type FormState as AccountFormState } from "@/features/screens/chart-of-accounts-panel";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { buildInvoiceFile, buildInvoicePreviewDataUrl, downloadCsv, downloadInvoiceJpg, downloadInvoicePdf, openInvoicePdf, printInvoice, type InvoiceExportPayload } from "@/lib/download";
import { openMailComposer, openWhatsAppShare, shareInvoiceDocument } from "@/lib/app-actions";
import { formatAmount, formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { moneyAmountsEqual, moneyToMinorUnits, roundMoney, sumMoney } from "@/lib/money";
import { applyRoundOff, readRoundOffPreference } from "@/lib/round-off";
import { getPartyLedgerDelta } from "@/lib/party-ledger";
import { getPaymentAllocationMismatch, type PaymentAllocationMismatch } from "@/lib/payment-allocation";
import { getNextPickerIndex, isPickerNavigationKey } from "@/lib/picker-keyboard";
import { cn, slugify } from "@/lib/utils";
import { moveVoucherToRecycleBin } from "@/services/recycle-bin";
import {
  listManufacturingSaleProvenance,
  listWarehouses,
  listWarehouseStock,
  type ManufacturingSaleProvenance,
  type WarehouseRecord,
  type WarehouseStockRow,
} from "@/services/warehouse.service";
import { useAccountingPreferenceStore } from "@/stores/accounting-preference-store";
import { evaluateMasterDataReadiness } from "@/lib/master-data-readiness";
import type { AccountNature, AccountNode, LedgerOption } from "@/types/accounts";
import type { AppDataset, PartyRecord, StockItemRecord, VoucherRecord, VoucherStatus, VoucherType } from "@/types/domain";

interface InventoryOptionRecord {
  itemCode: string;
  itemName: string;
  alias?: string;
  category: string;
  unit: string;
  qty: number;
  rate: number;
  reorderLevel: number;
  expiryDate?: string | null;
  trackBatchExpiry?: boolean;
}

interface WarehousePickerOption {
  id: string;
  name: string;
  code: string;
  type?: WarehouseRecord["type"];
  address?: string | null;
  isDefault?: boolean;
  quantity: number;
  unit: string;
}

interface PartyEditorValues {
  id: string | null;
  originalName: string;
  name: string;
  contact: string;
  address: string;
  creditLimit: string;
}

interface LedgerEditorValues {
  kind: "expense" | "debtor" | "revenue";
}

interface ItemEditorValues {
  itemName: string;
  itemCode: string;
  category: string;
  unit: string;
  rate: string;
  openingQty: string;
  expiryDate: string;
}

interface VoucherFormValues {
  warehouseId: string;
  partyName: string;
  supplierAddress: string;
  voucherDate: string;
  reference: string;
  narration: string;
  settlementMode: "cash" | "bank" | "accounts-payable";
  moneyAccountId: string;
  moneyAccountName: string;
  moneyAccountType: "CASH" | "BANK" | "MFS";
  paidAmount: number;
  /** The specific Other-Income ledger picked for a Revenue voucher (e.g. "Interest Income"). */
  revenueLedger: string;
  /** Which Current-Asset ledger a Cash-settled Revenue voucher's debit side hits — "Cash in Hand" or "Bank Accounts". */
  revenueCashLedger: string;
  /** Which ledger a Bank-settled purchase-side voucher's settlement line hits — "Bank Accounts" or "Mobile Financial Service Accounts". */
  purchaseSettlementLedger: string;
  /** Who a Credit-settled Expense voucher is owed to (e.g. "City Transport").
   * This is descriptive only; the accounting credit posts to the selected payable ledger. */
  expensePayableTo: string;
  /** Active liability ledger used on the credit side of a credit expense. */
  expenseCreditLedger: string;
  discountType: "fixed" | "percent";
  discount: number;
  /** Rounds the payable total to the nearest whole taka; the remainder posts to
   * the Round Off ledger so the document still balances against its line values. */
  roundOff: boolean;
  condition: string;
  buyerSignature: string;
  sellerSignature: string;
  attachmentImageUrl: string;
  attachmentDocumentUrl: string;
  attachmentDocumentName: string;
  invoiceItems: Array<{
    id: string;
    sourceInventoryLineId?: string;
    manufacturingInventoryLotId?: string;
    manufacturingSerialIds?: string[];
    warehouseId: string;
    warehouseSnapshot?: { id: string; name: string; code: string };
    warehouseSelectionOrigin?: "source" | "user" | "inferred";
    itemName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    batchNumber?: string;
    manufacturedAt?: string;
    expiresAt?: string;
  }>;
  lines: Array<{
    id: string;
    /** Stable Chart of Accounts identity. Required by Adjustment Posting's
     * Quick Picker so renamed ledgers still post to the correct account. */
    accountId?: string;
    ledger: string;
    description: string;
    postingSide: PostingSide;
    debit: number;
    credit: number;
    costCenter: string;
    project: string;
    billReference: string;
  }>;
}

type VoucherEntryScreenProps = {
  voucherType: VoucherType;
  displayMode?: "page" | "dialog";
  embeddedState?: {
    editId?: string | null;
    duplicateId?: string | null;
    sourceVoucherId?: string | null;
    workflow?: string | null;
  };
  onClose?: () => void;
  onSaved?: (voucher: VoucherRecord) => void;
  onDeleted?: (voucherId: string) => void;
};

type PreviewDialogState = {
  title: string;
  subtitle: string;
  payload: InvoiceExportPayload;
  imageSrc: string;
};

type PreviewTheme = "tally" | "modern";

function getNormalPostingSide(nature: AccountNature | undefined): PostingSide | null {
  if (!nature) return null;
  return nature === "ASSET" || nature === "DIRECT_EXPENSE" || nature === "INDIRECT_EXPENSE" ? "debit" : "credit";
}

const paymentOutMethodOptionsForVoucher = ["Cash", "Cheque", "Bank Transfer", "Card", "MFS"] as const;
type PaymentOutMethod = (typeof paymentOutMethodOptionsForVoucher)[number];
type PaymentSplit = { id: string; method: PaymentOutMethod | ""; amount: string; ledgerId: string; ledgerName: string; reference: string };

const localDefaultWarehouse: WarehouseRecord = {
  id: "local-main-warehouse",
  name: "Main Warehouse",
  code: "WH-MAIN",
  address: null,
  description: "Local default warehouse",
  type: "GENERAL",
  allowGrn: true,
  allowSales: true,
  allowMaterialIssue: false,
  isDefault: true,
  isActive: true,
  createdAt: "1970-01-01T00:00:00.000Z",
};

const labels: Record<VoucherType, string> = {
  contra: "Contra Voucher",
  payment: "Payment Voucher",
  receipt: "Receipt Voucher",
  journal: "Journal Voucher",
  sales: "Sales Invoice",
  purchase: "Purchase Invoice",
  expense: "Expense Voucher",
  revenue: "Revenue Voucher",
  "credit-note": "Credit Note",
  "debit-note": "Purchase Return",
};

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

const previewThemeSections: Array<{
  title: string;
  items: Array<{ id: PreviewTheme; label: string; hint: string }>;
}> = [
  {
    title: "Classic Themes",
    items: [{ id: "tally", label: "Default Theme", hint: "Clean ruled paper preview like Bizovix." }],
  },
];

function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function getPurchaseWorkflowDocumentLabel(workflow: string | null | undefined) {
  if (workflow === "receipt-note") {
    return "Receipt Note";
  }

  if (workflow === "purchase-order") {
    return "Purchase Order";
  }

  return "Bill";
}

function getOrderWorkflowDocumentLabel(workflow: string | null | undefined) {
  if (workflow === "sale-order") return "Sales Order";
  if (workflow === "delivery-note") return "Delivery Note";
  return getPurchaseWorkflowDocumentLabel(workflow);
}

function getWeekdayName(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return "—";

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date);
}

function getWeekdayColorClass(isoDate: string) {
  const weekday = getWeekdayName(isoDate);
  const colors: Record<string, string> = {
    Sunday: "border-violet-200 bg-violet-50 text-violet-700",
    Monday: "border-blue-200 bg-blue-50 text-blue-700",
    Tuesday: "border-cyan-200 bg-cyan-50 text-cyan-700",
    Wednesday: "border-teal-200 bg-teal-50 text-teal-700",
    Thursday: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Friday: "border-rose-200 bg-rose-50 text-rose-700",
    Saturday: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return colors[weekday] ?? "border-slate-200 bg-slate-50 text-slate-600";
}

function buildDefaultInvoiceItem(index: number) {
  return {
    id: `invoice-item-${index + 1}`,
    warehouseId: "",
    itemName: "",
    unit: "",
    quantity: 1,
    unitPrice: 0,
  };
}

function buildAutoInvoiceNumber(voucherType: VoucherType, voucherDate: string, workflow?: string | null) {
  const compactDate = voucherDate.replaceAll("-", "");
  const serial = String(Date.now()).slice(-4);
  const prefix =
    voucherType === "purchase" && workflow === "purchase-order"
      ? "PO"
      : voucherType === "purchase" && workflow === "receipt-note"
        ? "GRN"
        : voucherType === "purchase"
          ? "PB"
          : voucherType === "sales" && workflow === "sale-order"
            ? "SO"
            : voucherType === "sales" && workflow === "delivery-note"
              ? "DC"
              : voucherType === "sales"
      ? "SINV"
      : voucherType === "credit-note"
          ? "CN"
          : voucherType === "debit-note"
            ? "PR"
            : voucherType === "payment"
              ? "PV"
            : "VCH";
  return `${prefix}-${compactDate}-${serial}`;
}

/**
 * `discountAmount` is always stored as money. A voucher saved with a percentage has to
 * convert it back to the percentage that was typed — otherwise reopening the voucher
 * reads the money value as a percentage, which wipes the total and blocks saving.
 */
function readDiscountInputValue(voucher: VoucherRecord) {
  const storedAmount = Number(voucher.discountAmount ?? 0);
  if (voucher.discountType !== "percent" || storedAmount <= 0) {
    return storedAmount;
  }

  const subtotal = Number(voucher.subtotal ?? 0);
  if (subtotal <= 0) {
    return 0;
  }

  return Math.round(((storedAmount / subtotal) * 100 + Number.EPSILON) * 10000) / 10000;
}

/* Callers pass values straight out of the form, and a row index that outlived its
 * row yields undefined — normalising that to an empty key is what every caller wants
 * anyway (it simply matches nothing). */
function normalizeLookupValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

type OutstandingBill = {
  sourceId: string;
  documentNumber: string;
  reference: string;
  documentDate: string;
  createdAt: string;
  amount: number;
  /** Purchase return value already netted off this bill via a Debit Note. */
  debitNoteApplied: number;
  balance: number;
};

/** A supplier's unpaid/partially-paid purchase bills, oldest first, with how much of
 * each is still due — a bill counts as paid down by any payment whose own reference,
 * voucher number, or a line's billReference matches the bill's number, mirroring the
 * same matching purchase-workspace-screen.tsx uses for the Bills list balance column. */
function computeOutstandingBills(vouchers: VoucherRecord[], partyName: string): OutstandingBill[] {
  const normalizedParty = normalizeLookupValue(partyName);
  if (!normalizedParty) {
    return [];
  }

  function normalizeRef(value?: string | null) {
    return normalizeLookupValue(value || "");
  }

  const bills = vouchers.filter(
    (voucher) =>
      voucher.voucherType === "purchase" &&
      (voucher.documentKind === "bill" || !voucher.documentKind) &&
      voucher.status !== "cancelled" &&
      normalizeLookupValue(voucher.partyName) === normalizedParty,
  );
  const payments = vouchers.filter(
    (voucher) => voucher.voucherType === "payment" && voucher.status !== "cancelled" && normalizeLookupValue(voucher.partyName) === normalizedParty,
  );
  const debitNotes = vouchers.filter(
    (voucher) => voucher.voucherType === "debit-note" && voucher.status !== "cancelled" && normalizeLookupValue(voucher.partyName) === normalizedParty,
  );

  const paidByReference = new Map<string, number>();
  payments.forEach((payment) => {
    const allocatedLines = payment.lines.filter((line) => Number(line.debit || 0) > 0 && Boolean(line.billReference?.trim()));
    if (allocatedLines.length) {
      allocatedLines.forEach((line) => {
        const reference = normalizeRef(line.billReference);
        if (reference) {
          paidByReference.set(reference, sumMoney([paidByReference.get(reference) ?? 0, Number(line.debit || 0)]));
        }
      });
      return;
    }
    const references = new Set<string>();
    [payment.reference, payment.voucherNumber].forEach((value) => {
      const normalized = normalizeRef(value);
      if (normalized) {
        references.add(normalized);
      }
    });
    payment.lines.forEach((line) => {
      const normalized = normalizeRef(line.billReference);
      if (normalized) {
        references.add(normalized);
      }
    });
    references.forEach((reference) => paidByReference.set(reference, sumMoney([paidByReference.get(reference) ?? 0, Number(payment.amount || 0)])));
  });

  // A purchase return (Debit Note) lowers what's actually still owed on the bill it
  // was raised against — matched first by sourceVoucherId (set when the "Select
  // bill" picker was used to create it) and by each of its lines' billReference as
  // a fallback, the same two-tier matching the receipt-note/bill chain already uses.
  const debitNoteByBillId = new Map<string, number>();
  const debitNoteByReference = new Map<string, number>();
  debitNotes.forEach((debitNote) => {
    if (debitNote.sourceVoucherId) {
      debitNoteByBillId.set(debitNote.sourceVoucherId, sumMoney([debitNoteByBillId.get(debitNote.sourceVoucherId) ?? 0, Number(debitNote.amount || 0)]));
    }
    const references = new Set<string>();
    debitNote.lines.forEach((line) => {
      const normalized = normalizeRef(line.billReference);
      if (normalized) {
        references.add(normalized);
      }
    });
    references.forEach((reference) => debitNoteByReference.set(reference, sumMoney([debitNoteByReference.get(reference) ?? 0, Number(debitNote.amount || 0)])));
  });

  return bills
    .map((bill) => {
      const references = new Set<string>();
      [bill.reference, bill.voucherNumber].forEach((value) => {
        const normalized = normalizeRef(value);
        if (normalized) {
          references.add(normalized);
        }
      });
      const paid = sumMoney(Array.from(references, (reference) => paidByReference.get(reference) ?? 0));
      const debitNoteApplied = roundMoney(Math.max(
        debitNoteByBillId.get(bill.id) ?? 0,
        sumMoney(Array.from(references, (reference) => debitNoteByReference.get(reference) ?? 0)),
      ));
      const amount = roundMoney(Number(bill.amount || 0));
      const balance = Math.max(0, roundMoney(amount - Math.min(amount, sumMoney([paid, debitNoteApplied]))));
      const documentNumber = bill.reference?.trim() || bill.voucherNumber;
      return {
        sourceId: bill.id,
        documentNumber,
        reference: documentNumber,
        documentDate: bill.voucherDate,
        createdAt: bill.createdAt,
        amount,
        debitNoteApplied,
        balance,
      };
    })
    .filter((bill) => moneyToMinorUnits(bill.balance) > 0)
    .sort((left, right) => left.documentDate.localeCompare(right.documentDate) || left.createdAt.localeCompare(right.createdAt));
}

/** Customer-side mirror of computeOutstandingBills: posted Sales Invoices are
 * reduced by allocated Customer Receipts and Sales Returns. Cash invoices also
 * carry paidAmount on the invoice itself, so they never reappear as receivable. */
function computeOutstandingInvoices(vouchers: VoucherRecord[], partyName: string): OutstandingBill[] {
  const normalizedParty = normalizeLookupValue(partyName);
  if (!normalizedParty) return [];
  const normalizeRef = (value?: string | null) => normalizeLookupValue(value || "");
  const invoices = vouchers.filter(
    (voucher) => voucher.voucherType === "sales" && (!voucher.documentKind || voucher.documentKind === "bill") &&
      voucher.status !== "cancelled" && normalizeLookupValue(voucher.partyName) === normalizedParty,
  );
  const receipts = vouchers.filter(
    (voucher) => voucher.voucherType === "receipt" && voucher.status !== "cancelled" && normalizeLookupValue(voucher.partyName) === normalizedParty,
  );
  const returns = vouchers.filter(
    (voucher) => voucher.voucherType === "credit-note" && voucher.status !== "cancelled" && normalizeLookupValue(voucher.partyName) === normalizedParty,
  );
  const receivedByReference = new Map<string, number>();
  receipts.forEach((receipt) => {
    receipt.lines.filter((line) => Number(line.credit || 0) > 0 && line.billReference?.trim()).forEach((line) => {
      const ref = normalizeRef(line.billReference);
      receivedByReference.set(ref, sumMoney([receivedByReference.get(ref) ?? 0, Number(line.credit || 0)]));
    });
  });
  const returnedByInvoiceId = new Map<string, number>();
  const returnedByReference = new Map<string, number>();
  returns.forEach((entry) => {
    if (entry.sourceVoucherId) returnedByInvoiceId.set(entry.sourceVoucherId, sumMoney([returnedByInvoiceId.get(entry.sourceVoucherId) ?? 0, Number(entry.amount || 0)]));
    entry.lines.filter((line) => line.billReference?.trim()).forEach((line) => {
      const ref = normalizeRef(line.billReference);
      returnedByReference.set(ref, sumMoney([returnedByReference.get(ref) ?? 0, Number(entry.amount || 0)]));
    });
  });
  return invoices.map((invoice) => {
    const references = [invoice.reference, invoice.voucherNumber].map(normalizeRef).filter(Boolean);
    const received = sumMoney(references.map((ref) => receivedByReference.get(ref) ?? 0));
    const returnApplied = roundMoney(Math.max(
      returnedByInvoiceId.get(invoice.id) ?? 0,
      sumMoney(references.map((ref) => returnedByReference.get(ref) ?? 0)),
    ));
    const amount = roundMoney(Number(invoice.amount || 0));
    const balance = Math.max(0, roundMoney(amount - Math.min(amount, sumMoney([Number(invoice.paidAmount || 0), received, returnApplied]))));
    const documentNumber = invoice.reference?.trim() || invoice.voucherNumber;
    return { sourceId: invoice.id, documentNumber, reference: documentNumber, documentDate: invoice.voucherDate, createdAt: invoice.createdAt, amount, debitNoteApplied: returnApplied, balance };
  }).filter((invoice) => moneyToMinorUnits(invoice.balance) > 0)
    .sort((left, right) => left.documentDate.localeCompare(right.documentDate) || left.createdAt.localeCompare(right.createdAt));
}

function mapVoucherRecordToFormValues(voucher: VoucherRecord, fallback: VoucherFormValues): VoucherFormValues {
  const primaryExpenseLine = voucher.voucherType === "expense" ? voucher.lines.find((line) => Number(line.debit || 0) > 0) : null;
  // The income ledger sits on the credit side of a Revenue voucher's pair — same idea
  // as primaryExpenseLine above, just the other side of the entry.
  const revenueBalanceLine = voucher.voucherType === "revenue" ? voucher.lines.find((line) => Number(line.credit || 0) > 0) : null;
  // The debit side holds either "Cash in Hand"/"Bank Accounts" (cash settlement) or the
  // customer's name (credit settlement, already covered by voucher.partyName below).
  const revenueDebitLine = voucher.voucherType === "revenue" ? voucher.lines.find((line) => Number(line.debit || 0) > 0) : null;
  // Which specific ledger ("Bank Accounts" vs "Mobile Financial Service Accounts") a
  // Bank-settled purchase-side voucher used — found by name since debit/credit side
  // varies by voucher type (Purchase Bill/Expense settle on credit, Debit Note on debit).
  const bankSettlementLine = voucher.lines.find(
    (line) => line.ledger === "Bank Accounts" || line.ledger === "Mobile Financial Service Accounts",
  );
  // Keep the legacy Accrued Expenses fallback so older vouchers still edit cleanly.
  const expensePayableLine = voucher.voucherType === "expense"
    ? voucher.lines.find((line) => Number(line.credit ?? 0) > 0 && /^Payable to (.+)$/i.test(line.description ?? ""))
      ?? voucher.lines.find((line) => line.ledger === "Other Payables" || line.ledger === "Accrued Expenses")
    : null;
  return {
    ...fallback,
    warehouseId: voucher.warehouseId ?? fallback.warehouseId,
    partyName: voucher.partyName || primaryExpenseLine?.ledger || "",
    revenueLedger: revenueBalanceLine?.ledger ?? fallback.revenueLedger,
    revenueCashLedger: (voucher.settlementMode === "cash" ? revenueDebitLine?.ledger : null) ?? fallback.revenueCashLedger,
    purchaseSettlementLedger: (voucher.settlementMode === "bank" ? bankSettlementLine?.ledger : null) ?? fallback.purchaseSettlementLedger,
    expensePayableTo: expensePayableLine?.description?.match(/^Payable to (.+)$/i)?.[1] ?? fallback.expensePayableTo,
    expenseCreditLedger: expensePayableLine?.ledger ?? fallback.expenseCreditLedger,
    supplierAddress: voucher.supplierAddress ?? "",
    voucherDate: voucher.voucherDate,
    reference: voucher.reference ?? voucher.voucherNumber,
    narration: voucher.narration ?? "",
    settlementMode: voucher.settlementMode ?? fallback.settlementMode,
    paidAmount: Number(voucher.paidAmount ?? 0),
    discountType: voucher.discountType ?? fallback.discountType,
    discount: readDiscountInputValue(voucher),
    roundOff: voucher.roundOffAmount != null,
    condition: voucher.condition ?? "",
    buyerSignature: voucher.buyerSignature ?? "",
    sellerSignature: voucher.sellerSignature ?? "",
    attachmentImageUrl: voucher.attachmentImageUrl ?? "",
    attachmentDocumentUrl: voucher.attachmentDocumentUrl ?? "",
    attachmentDocumentName: voucher.attachmentDocumentName ?? "",
    invoiceItems:
      voucher.inventoryItems?.length
        ? voucher.inventoryItems.map((item, index) => ({
            id: item.id || `invoice-item-${index + 1}`,
            sourceInventoryLineId: item.sourceInventoryLineId ?? undefined,
            manufacturingInventoryLotId: item.manufacturingInventoryLotId ?? undefined,
            manufacturingSerialIds: item.manufacturingSerialIds ?? [],
            batchNumber: item.batchNumber ?? undefined,
            manufacturedAt: item.manufacturedAt?.slice(0, 10) ?? undefined,
            expiresAt: item.expiresAt?.slice(0, 10) ?? undefined,
            warehouseId: item.warehouseId ?? voucher.warehouseId ?? fallback.warehouseId,
            warehouseSnapshot:
              item.warehouse ??
              (item.warehouseId && item.warehouseId === voucher.warehouseId ? voucher.warehouse ?? undefined : undefined),
            warehouseSelectionOrigin: "source" as const,
            itemName: item.itemName,
            unit: "",
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
          }))
        : voucher.voucherType === "expense"
          ? voucher.lines
              .filter((line) => Number(line.debit || 0) > 0)
              .map((line, index) => ({
                id: line.id || `invoice-item-${index + 1}`,
                warehouseId: voucher.warehouseId ?? fallback.warehouseId,
                itemName: line.description || line.ledger,
                unit: "",
                quantity: 1,
                unitPrice: Number(line.debit || line.credit || 0),
              }))
              .filter((item) => item.itemName.trim() || Number(item.unitPrice || 0) > 0)
          : revenueBalanceLine
            ? [
                {
                  id: revenueBalanceLine.id || "invoice-item-1",
                  warehouseId: voucher.warehouseId ?? fallback.warehouseId,
                  itemName: revenueBalanceLine.description || "",
                  unit: "",
                  quantity: 1,
                  unitPrice: Number(revenueBalanceLine.credit || 0),
                },
              ]
        : fallback.invoiceItems,
    lines:
      voucher.lines?.length
        ? voucher.lines.map((line, index) => ({
            id: line.id || `line-${index + 1}`,
            accountId: line.accountId ?? "",
            ledger: line.ledger,
            description: line.description ?? "",
            postingSide: Number(line.credit || 0) > 0 && Number(line.debit || 0) <= 0 ? "credit" : "debit",
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
            costCenter: line.costCenter ?? "Head Office",
            project: line.project ?? "Trading",
            billReference: line.billReference ?? "",
          }))
        : fallback.lines,
  };
}

function mapSourceVoucherToPrefill(
  voucher: VoucherRecord,
  voucherType: VoucherType,
  fallback: VoucherFormValues,
  sourceMode: "duplicate" | "fromVoucher",
  workflow?: string | null,
): VoucherFormValues {
  const voucherDate =
    sourceMode === "fromVoucher" &&
    ((voucherType === "purchase" && (workflow === "receipt-note" || voucher.documentKind === "receipt-note")) ||
      (voucherType === "sales" && (workflow === "delivery-note" || voucher.documentKind === "delivery-note")))
      ? voucher.voucherDate
      : new Date().toISOString().slice(0, 10);
  const sourceReference = voucher.reference?.trim() || voucher.voucherNumber;
  const sourceSettlementAmount = voucherType === "receipt" || voucherType === "payment" ? Number(voucher.amount || 0) : 0;

  if (sourceMode === "duplicate") {
    const duplicated = mapVoucherRecordToFormValues(voucher, fallback);
    return {
      ...duplicated,
      voucherDate,
      reference: voucherType === "payment" ? "" : buildAutoInvoiceNumber(voucherType, voucherDate, workflow),
      narration: voucher.narration ?? fallback.narration,
    };
  }

  const narration =
    voucherType === "receipt"
      ? `Receipt against ${sourceReference}`
      : voucherType === "payment"
        ? `Payment against ${sourceReference}`
        : voucherType === "credit-note" || voucherType === "debit-note"
          ? `Return against ${sourceReference}`
          : // The new document no longer carries the source's number, so the link to it
            // has to be readable on the document itself.
            `Against ${sourceReference}`;

  return {
    ...fallback,
    warehouseId:
      (workflow === "receipt-note" && voucher.documentKind === "purchase-order") ||
      (workflow === "delivery-note" && voucher.documentKind === "sale-order")
        ? ""
        : voucher.warehouseId ?? fallback.warehouseId,
    partyName: voucher.partyName ?? fallback.partyName,
    supplierAddress: voucher.supplierAddress ?? fallback.supplierAddress,
    voucherDate,
    // A converted document is a new document and needs its own number — reusing the
    // source's collides with it in the ledger. The link back to the source is kept on
    // every line as the bill reference instead.
    reference: voucherType === "payment" ? "" : buildAutoInvoiceNumber(voucherType, voucherDate, workflow),
    narration,
    // The source document's terms carry forward: goods ordered for cash are still
    // received against cash, not turned into a supplier due.
    settlementMode: voucher.settlementMode ?? fallback.settlementMode,
    paidAmount: Number(voucher.paidAmount ?? 0),
    purchaseSettlementLedger:
      voucher.lines.find((line) => line.ledger === "Bank Accounts" || line.ledger === "Mobile Financial Service Accounts")
        ?.ledger ?? fallback.purchaseSettlementLedger,
    expensePayableTo:
      voucher.lines.find((line) => line.ledger === "Other Payables" || line.ledger === "Accrued Expenses")
        ?.description?.match(/^Payable to (.+)$/i)?.[1] ?? fallback.expensePayableTo,
    expenseCreditLedger:
      voucher.lines.find((line) => Number(line.credit || 0) > 0)?.ledger ?? fallback.expenseCreditLedger,
    discountType: voucher.discountType ?? fallback.discountType,
    discount: readDiscountInputValue(voucher),
    roundOff: voucher.roundOffAmount != null,
    condition: voucher.condition ?? fallback.condition,
    buyerSignature: voucher.buyerSignature ?? fallback.buyerSignature,
    sellerSignature: voucher.sellerSignature ?? fallback.sellerSignature,
    invoiceItems:
      (voucherType === "purchase" || voucherType === "debit-note" || voucherType === "sales") && voucher.inventoryItems?.length
        ? voucher.inventoryItems.map((item, index) => ({
            id: `invoice-item-${index + 1}`,
            sourceInventoryLineId: item.id,
            manufacturingInventoryLotId: item.manufacturingInventoryLotId ?? undefined,
            manufacturingSerialIds: item.manufacturingSerialIds ?? [],
            // Purchase Orders (and Sale Orders) historically received a hidden
            // document-level default warehouse even though their UI never asked
            // the operator to choose one. That implicit value must not override
            // this product's actual warehouse history when the order is
            // converted to a Receipt Note / Delivery Note.
            warehouseId:
              (workflow === "receipt-note" && voucher.documentKind === "purchase-order") ||
              (workflow === "delivery-note" && voucher.documentKind === "sale-order")
                ? ""
                : item.warehouseId ?? voucher.warehouseId ?? fallback.warehouseId,
            warehouseSnapshot:
              (workflow === "receipt-note" && voucher.documentKind === "purchase-order") ||
              (workflow === "delivery-note" && voucher.documentKind === "sale-order")
                ? undefined
                : item.warehouse ??
                  (item.warehouseId && item.warehouseId === voucher.warehouseId ? voucher.warehouse ?? undefined : undefined),
            warehouseSelectionOrigin:
              (workflow === "receipt-note" && voucher.documentKind === "purchase-order") ||
              (workflow === "delivery-note" && voucher.documentKind === "sale-order")
                ? undefined
                : ("source" as const),
            itemName: item.itemName,
            unit: "",
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
          }))
        : fallback.invoiceItems,
    lines: fallback.lines.map((line, index) => ({
      ...line,
      description: index === 0 ? narration : line.description,
      billReference: sourceReference,
      debit: sourceSettlementAmount > 0 ? (index === 0 ? sourceSettlementAmount : 0) : line.debit,
      credit: sourceSettlementAmount > 0 ? (index === 1 ? sourceSettlementAmount : 0) : line.credit,
    })),
  };
}

function buildDefaultValues(
  voucherType: VoucherType,
  voucherTemplate: ReturnType<typeof getVoucherTemplate>,
  mode: "mock" | "demo" | "api",
  workflow?: string | null,
  isAdjustmentPosting = false,
): VoucherFormValues {
  const voucherDate = new Date().toISOString().slice(0, 10);
  const isInventoryVoucher = voucherType === "purchase" || voucherType === "sales" || voucherType === "expense" || voucherType === "debit-note" || voucherType === "revenue";
  const shouldStartBlank = mode === "api";
  return {
    warehouseId: "",
    partyName: shouldStartBlank ? "" : voucherTemplate.partyLabel,
    supplierAddress: "",
    voucherDate,
    reference: voucherType === "payment" ? "" : buildAutoInvoiceNumber(voucherType, voucherDate, workflow),
    narration: shouldStartBlank ? "" : voucherTemplate.narration,
    settlementMode: "accounts-payable",
    moneyAccountId: "",
    moneyAccountName: "",
    moneyAccountType: "CASH",
    paidAmount: 0,
    revenueLedger: "",
    revenueCashLedger: "Cash in Hand",
    purchaseSettlementLedger: "Bank Accounts",
    expensePayableTo: "",
    expenseCreditLedger: "",
    discountType: "fixed",
    discount: 0,
    roundOff: false,
    condition: "",
    buyerSignature: "",
    sellerSignature: "",
    attachmentImageUrl: "",
    attachmentDocumentUrl: "",
    attachmentDocumentName: "",
    // New item-based documents start with one clean row. Additional rows are
    // intentionally user-added; edit/duplicate/conversion flows still preserve
    // every item already present on the source document.
    invoiceItems: isInventoryVoucher ? [buildDefaultInvoiceItem(0)] : [],
    lines: voucherTemplate.lines.map((line, index) => ({
      id: `line-${index + 1}`,
      accountId: "",
      // Adjustment journals must be deliberately mapped to a real COA ledger
      // from the Quick Picker; template labels are not valid accounting choices.
      ledger: isAdjustmentPosting ? "" : line.ledger,
      description: shouldStartBlank || isAdjustmentPosting ? "" : line.description,
      postingSide: inferLinePostingSide(voucherType, index),
      debit: line.debit,
      credit: line.credit,
      costCenter: line.costCenter ?? "Head Office",
      project: line.project ?? "Trading",
      billReference: line.billReference ?? "",
    })),
  };
}

function buildFullyInvoicedDeliveryNoteIds(records: VoucherRecord[]) {
  const notes = records.filter(
    (record) => record.voucherType === "sales" && record.documentKind === "delivery-note" && record.status === "posted",
  );
  const allocatedByNoteItem = new Map<string, number>();

  records
    .filter((record) => record.voucherType === "sales" && !record.documentKind && record.status === "posted")
    .forEach((invoice) => {
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
      (invoice.inventoryItems ?? []).forEach((item) => {
        const key = item.itemName.trim().toLowerCase();
        remainingByItem.set(key, (remainingByItem.get(key) ?? 0) + Number(item.quantity || 0));
      });

      candidates.forEach((note) => {
        (note.inventoryItems ?? []).forEach((item) => {
          const key = item.itemName.trim().toLowerCase();
          const allocationKey = `${note.id}:${key}`;
          const used = allocatedByNoteItem.get(allocationKey) ?? 0;
          const quantity = Math.min(
            Math.max(0, Number(item.quantity || 0) - used),
            remainingByItem.get(key) ?? 0,
          );
          allocatedByNoteItem.set(allocationKey, used + quantity);
          remainingByItem.set(key, Math.max(0, (remainingByItem.get(key) ?? 0) - quantity));
        });
      });
    });

  return new Set(
    notes
      .filter((note) =>
        (note.inventoryItems ?? []).every((item) => {
          const key = item.itemName.trim().toLowerCase();
          return (allocatedByNoteItem.get(`${note.id}:${key}`) ?? 0) >= Number(item.quantity || 0);
        }),
      )
      .map((note) => note.id),
  );
}

/**
 * Finds receipt notes whose complete received quantity has already been carried
 * into one or more Purchase Bills. Bills can combine several receipt notes while
 * the schema stores only one sourceVoucherId, so reference text is also matched
 * and invoice quantities are allocated across the matching notes in posting order.
 */
function buildFullyBilledReceiptNoteIds(records: VoucherRecord[]) {
  const notes = records.filter(
    (record) => record.voucherType === "purchase" && record.documentKind === "receipt-note" && record.status === "posted",
  );
  const allocatedByNoteItem = new Map<string, number>();
  const allocatedValueByNote = new Map<string, number>();

  records
    .filter(
      (record) =>
        record.voucherType === "purchase" &&
        (record.documentKind === "bill" || !record.documentKind) &&
        record.status === "posted",
    )
    .forEach((bill) => {
      const billReferences = [bill.reference, ...bill.lines.map((line) => line.billReference ?? "")]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" | ")
        .toLowerCase();
      const candidates = notes
        .filter((note) => {
          if (bill.sourceVoucherId === note.id) return true;
          return [note.voucherNumber, note.reference]
            .filter((value): value is string => Boolean(value?.trim()))
            .some((value) => billReferences.includes(value.trim().toLowerCase()));
        })
        .sort((left, right) => `${left.voucherDate}|${left.createdAt}`.localeCompare(`${right.voucherDate}|${right.createdAt}`));
      const remainingByItem = new Map<string, number>();
      (bill.inventoryItems ?? []).forEach((item) => {
        const key = item.itemName.trim().toLowerCase();
        remainingByItem.set(key, (remainingByItem.get(key) ?? 0) + Number(item.quantity || 0));
      });
      let remainingBillValue = Number(bill.amount || 0);

      candidates.forEach((note) => {
        (note.inventoryItems ?? []).forEach((item) => {
          const key = item.itemName.trim().toLowerCase();
          const allocationKey = `${note.id}:${key}`;
          const used = allocatedByNoteItem.get(allocationKey) ?? 0;
          const quantity = Math.min(
            Math.max(0, Number(item.quantity || 0) - used),
            remainingByItem.get(key) ?? 0,
          );
          allocatedByNoteItem.set(allocationKey, used + quantity);
          remainingByItem.set(key, Math.max(0, (remainingByItem.get(key) ?? 0) - quantity));
        });
        const noteValue = Number(note.amount || 0);
        const usedValue = allocatedValueByNote.get(note.id) ?? 0;
        const allocatedValue = Math.min(Math.max(0, noteValue - usedValue), remainingBillValue);
        allocatedValueByNote.set(note.id, usedValue + allocatedValue);
        remainingBillValue = Math.max(0, remainingBillValue - allocatedValue);
      });
    });

  return new Set(
    notes
      .filter((note) => {
        const items = note.inventoryItems ?? [];
        if (items.length > 0) {
          return items.every((item) => {
            const key = item.itemName.trim().toLowerCase();
            return (allocatedByNoteItem.get(`${note.id}:${key}`) ?? 0) >= Number(item.quantity || 0);
          });
        }
        return Number(note.amount || 0) > 0 && (allocatedValueByNote.get(note.id) ?? 0) >= Number(note.amount || 0);
      })
      .map((note) => note.id),
  );
}

function SearchableLedgerCombobox({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: Array<{ id: string; name: string; path: string }>;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = `ledger-options-${useId()}`;

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(value);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [value]);

  const filteredOptions = useMemo(() => {
    const needle = normalizeLookupValue(query);
    return options.filter((option) => !needle || normalizeLookupValue(`${option.name} ${option.path}`).includes(needle));
  }, [options, query]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(filteredOptions.length - 1, 0)));
  }, [filteredOptions.length]);
  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const selectOption = (index: number) => {
    const option = filteredOptions[index];
    if (!option) return;
    onChange(option.name);
    setQuery(option.name);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8190a8]" />
        <Input
          value={query}
          placeholder={placeholder}
          className="h-10 rounded-[4px] border-[#cfd9e8] bg-white pl-9 pr-9 text-sm font-medium text-[#1f2f46]"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && filteredOptions[activeIndex] ? `${listboxId}-${filteredOptions[activeIndex].id}` : undefined}
          onFocus={(event) => {
            setOpen(true);
            setActiveIndex(0);
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              selectOption(activeIndex);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setQuery(value);
            }
          }}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8190a8]" />
      </div>
      {open ? (
        <div id={listboxId} role="listbox" className="absolute z-[90] mt-1 max-h-56 w-full overflow-y-auto rounded-[6px] border border-[#d8e1ee] bg-white p-1 shadow-xl">
          {filteredOptions.length ? filteredOptions.map((option, index) => (
            <button
              key={option.id}
              id={`${listboxId}-${option.id}`}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={value === option.name}
              className={cn("flex w-full items-center gap-2 rounded-[4px] px-3 py-2 text-left text-sm", index === activeIndex ? "bg-[#eaf2ff] text-[#155fc0]" : "text-[#1f2f46] hover:bg-[#f7f9fc]")}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOption(index)}
            >
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {value === option.name ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#e76412]" /> : null}
            </button>
          )) : <div className="px-3 py-4 text-center text-sm text-[#8994a6]">No matching ledger found</div>}
        </div>
      ) : null}
    </div>
  );
}

export function VoucherEntryScreen({
  voucherType,
  displayMode = "page",
  embeddedState,
  onClose,
  onSaved,
  onDeleted,
}: VoucherEntryScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingVoucherId = embeddedState?.editId ?? searchParams.get("edit");
  const duplicateVoucherId = embeddedState?.duplicateId ?? searchParams.get("duplicate");
  const sourceVoucherId = embeddedState?.sourceVoucherId ?? searchParams.get("fromVoucher");
  const workflow = embeddedState?.workflow ?? searchParams.get("workflow");
  const isAdjustmentPosting = voucherType === "journal" && searchParams.get("adjustment") === "1";
  /**
   * Where the close button should go back to. Only same-app paths are honoured so a
   * crafted link can't turn the close button into a redirect off the application.
   */
  const returnToRoute = useMemo(() => {
    const requested = searchParams.get("returnTo");
    return requested && /^\/(?!\/)/.test(requested) ? requested : null;
  }, [searchParams]);
  const templateVoucherId = editingVoucherId ? null : duplicateVoucherId ?? sourceVoucherId;
  const templateSourceMode = duplicateVoucherId ? ("duplicate" as const) : sourceVoucherId ? ("fromVoucher" as const) : null;
  const { mode, session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "workspace";
  const workflowSettingsQuery = useWorkflowSettingsQuery(
    mode,
    session?.workspaceId ?? (mode === "api" ? null : "workspace"),
  );
  const workflowSettings = workflowSettingsQuery.data ?? defaultWorkflowSettings;
  const workflowGuardRequestRef = useRef("");
  const queryClient = useQueryClient();
  const entryMode = useAccountingPreferenceStore((state) => state.entryMode);
  const setEntryMode = useAccountingPreferenceStore((state) => state.setEntryMode);
  useEffect(() => {
    if (isAdjustmentPosting) setEntryMode("double-entry");
  }, [isAdjustmentPosting, setEntryMode]);
  const tableScrollRef = useTransientScrollbar<HTMLDivElement>();
  const voucherTemplate = useMemo(() => getVoucherTemplate(voucherType), [voucherType]);
  const invoicePadInputRef = useRef<HTMLInputElement | null>(null);
  const [companyProfile, setCompanyProfile] = useState(() => readCompanyProfile(mode, workspaceId));
  const [partyOptions, setPartyOptions] = useState<PartyRecord[]>([]);
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOptionRecord[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseRecord[]>([]);
  const [warehouseStockRows, setWarehouseStockRows] = useState<WarehouseStockRow[]>([]);
  const [manufacturingSaleProvenance, setManufacturingSaleProvenance] = useState<ManufacturingSaleProvenance | null>(null);
  const [warehouseOptionsLoaded, setWarehouseOptionsLoaded] = useState(false);
  /** Past vouchers, used only to suggest the last rate for an item/party. */
  const [historyVouchers, setHistoryVouchers] = useState<VoucherRecord[]>([]);
  const [historyVouchersLoaded, setHistoryVouchersLoaded] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const form = useForm<VoucherFormValues>({
    defaultValues: buildDefaultValues(voucherType, voucherTemplate, mode, workflow, isAdjustmentPosting),
  });
  useEffect(() => {
    const receiptNote = voucherType === "purchase" && workflow === "receipt-note";
    if (mode !== "api") {
      if (receiptNote) {
        setWarehouseOptions([localDefaultWarehouse]);
      } else {
        setWarehouseOptions([]);
      }
      setWarehouseOptionsLoaded(true);
      return;
    }
    if (!session?.workspaceId) {
      setWarehouseOptions([]);
      setWarehouseOptionsLoaded(true);
      return;
    }

    let active = true;
    setWarehouseOptionsLoaded(false);
    void listWarehouses(session.workspaceId, true)
      .then((warehouses) => {
        if (!active) {
          return;
        }
        setWarehouseOptions(warehouses);

        // Other inventory documents still use their document-level selector.
        // Receipt Notes resolve warehouses product-by-product below.
        if (!receiptNote && !form.getValues("warehouseId")) {
          const defaultWarehouseId = warehouses.find((warehouse) => warehouse.isDefault)?.id || warehouses[0]?.id || "";
          if (defaultWarehouseId) {
            form.setValue("warehouseId", defaultWarehouseId, { shouldDirty: false, shouldTouch: false });
          }
        }

        // Purchase Bill resolves warehouse per item row (like Receipt Note), not
        // via the document-level field above — backfill any row still blank (the
        // initial row on a fresh bill, before this async warehouse fetch resolved)
        // with the default warehouse so the user sees a sensible pre-selected value
        // instead of an empty dropdown, while a bill converted from a receipt note
        // keeps whatever warehouse each line already carries.
        const isClassicPurchaseBill = voucherType === "purchase" && workflow !== "receipt-note" && workflow !== "purchase-order";
        if (isClassicPurchaseBill) {
          const defaultWarehouseId = warehouses.find((warehouse) => warehouse.isDefault)?.id || warehouses[0]?.id || "";
          if (defaultWarehouseId) {
            form.getValues("invoiceItems").forEach((item, index) => {
              if (!item.warehouseId) {
                form.setValue(`invoiceItems.${index}.warehouseId`, defaultWarehouseId, { shouldDirty: false, shouldTouch: false });
              }
            });
          }
        }
      })
      .catch(() => {
        if (active) {
          setWarehouseOptions([]);
        }
      })
      .finally(() => {
        if (active) {
          setWarehouseOptionsLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [form, mode, session?.workspaceId, voucherType, workflow]);

  useEffect(() => {
    // The Quick Picker shows the current balance beside every warehouse. Inbound
    // documents still need this data: a destination with zero stock remains a
    // valid choice, while the balance gives the receiver useful context.
    const needsWarehouseStock =
      (voucherType === "purchase" && workflow !== "purchase-order") ||
      voucherType === "debit-note" ||
      voucherType === "credit-note" ||
      (voucherType === "sales" && workflow !== "sale-order");
    if (mode !== "api" || !session?.workspaceId || !needsWarehouseStock) {
      setWarehouseStockRows([]);
      return;
    }
    let active = true;
    void listWarehouseStock(session.workspaceId)
      .then((rows) => {
        if (active) setWarehouseStockRows(rows);
      })
      .catch(() => {
        if (active) setWarehouseStockRows([]);
      });
    return () => {
      active = false;
    };
  }, [mode, session?.workspaceId, voucherType, workflow]);

  useEffect(() => {
    const needsManufacturingProvenance =
      (voucherType === "sales" && workflow !== "sale-order") || voucherType === "credit-note";
    if (mode !== "api" || !session?.workspaceId || !needsManufacturingProvenance) {
      setManufacturingSaleProvenance(null);
      return;
    }
    let active = true;
    void listManufacturingSaleProvenance(session.workspaceId)
      .then((provenance) => {
        if (active) setManufacturingSaleProvenance(provenance);
      })
      .catch(() => {
        if (active) setManufacturingSaleProvenance(null);
      });
    return () => {
      active = false;
    };
  }, [mode, session?.workspaceId, voucherType, workflow]);
  const lines = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const invoiceItems = useFieldArray({
    control: form.control,
    name: "invoiceItems",
  });
  const watchedLines = form.watch("lines");
  const watchedInvoiceItems = form.watch("invoiceItems");
  const watchedDiscountType = form.watch("discountType");
  const watchedDiscount = Number(form.watch("discount") || 0);
  const watchedRoundOff = form.watch("roundOff");
  // Direction and step come from Transaction Settings -> "Round Off Total", so one
  // company preference drives every document instead of each screen hardcoding
  // "nearest whole taka".
  const roundOffPreference = useMemo(() => readRoundOffPreference(mode, workspaceId), [mode, workspaceId]);
  const roundOffDefaultAppliedRef = useRef(false);

  // A brand new document starts from the company setting; an existing one keeps
  // whatever it was saved with, so this never overwrites a loaded voucher.
  useEffect(() => {
    if (roundOffDefaultAppliedRef.current || editingVoucherId || !roundOffPreference.enabled) return;
    roundOffDefaultAppliedRef.current = true;
    form.setValue("roundOff", true);
  }, [editingVoucherId, form, roundOffPreference.enabled]);

  const totals = {
    debit: sumMoney(watchedLines.map((line) => Number(line.debit || 0))),
    credit: sumMoney(watchedLines.map((line) => Number(line.credit || 0))),
  };
  const difference = roundCurrencyAmount(totals.debit - totals.credit);
  // Adjustment journals are always direct debit/credit entries even if the
  // user's global preference changes while this page is open.
  const advancedMode = isAdjustmentPosting || entryMode === "double-entry";
  const inventoryBackedVoucher = voucherType === "purchase" || voucherType === "sales";
  // Also true for expense: its item rows already mirror a purchase line (item/qty/price),
  // so the Quick Picker's Item tab needs the same catalog + rate history to be useful there.
  const inventoryAssistedVoucher = inventoryBackedVoucher || voucherType === "debit-note" || voucherType === "credit-note" || voucherType === "expense";
  // Sales and purchase are inventory documents first: operators must always get
  // the same item/quantity/rate form from their + buttons. The global accounting
  // preference is intentionally not allowed to turn these screens into the raw
  // debit/credit journal, which was surprising users after switching modes in a
  // Receipt or Payment voucher. Posting still produces the same balanced ledger
  // lines in the background.
  const simpleInvoiceMode = inventoryBackedVoucher;
  const classicPurchaseMode = voucherType === "purchase" && simpleInvoiceMode;
  // A Sales Bill can combine several Delivery Notes the same way a Purchase Bill
  // combines several Receipt Notes — same classic layout, same reference picker,
  // just the other side of the same document chain.
  const classicSalesInvoiceMode = voucherType === "sales" && simpleInvoiceMode;
  const classicPurchaseWorkflowMode =
    voucherType === "purchase" && (workflow === "purchase-order" || workflow === "receipt-note");
  const classicExpenseMode = voucherType === "expense";
  const isSalesReturnMode = voucherType === "credit-note";
  // Both returns share one protected source-document/item/warehouse layout.
  // The backend still applies their opposite accounting and stock directions.
  const classicDebitNoteMode = voucherType === "debit-note" || isSalesReturnMode;
  const classicPaymentMode = voucherType === "payment" || voucherType === "receipt";
  const isCustomerReceiptMode = voucherType === "receipt";
  const classicRevenueMode = voucherType === "revenue";
  const classicEntryMode = simpleInvoiceMode || classicExpenseMode || classicPurchaseWorkflowMode || classicDebitNoteMode || classicRevenueMode;
  const expenseLedgersQuery = usePostableLedgersQuery(classicExpenseMode && mode === "api");
  const revenueLedgersQuery = usePostableLedgersQuery(classicRevenueMode && mode === "api");
  const journalLedgersQuery = usePostableLedgersQuery(isAdjustmentPosting && mode === "api");
  // Needed beyond Revenue vouchers too — the "Add Ledger" quick-create dialog
  // (any voucher type) resolves its parent category (Trade Receivables, Indirect/
  // Direct Expenses) from this same tree.
  const accountTreeQuery = useAccountTreeQuery(mode === "api");
  const createAccountMutation = useCreateAccountMutation();
  const classicPurchaseStyleMode = classicPurchaseMode || classicSalesInvoiceMode || classicDebitNoteMode || classicPurchaseWorkflowMode;
  // Revenue is a receivable-generating transaction exactly like a Sales invoice — the
  // money is owed to us by a customer, not to a supplier — so it shares the same
  // "customer" party type, role labels, and cash-flow wording as Sales throughout
  // this file (party-create dialog, picker filtering, etc).
  const isReceivableVoucher =
    voucherType === "sales" || voucherType === "revenue" || voucherType === "receipt" || voucherType === "credit-note";
  const partyRoleLabel = isReceivableVoucher ? "Customer" : "Supplier";
  const accountRoleLabel = isReceivableVoucher ? "Accounts Receivable" : "Accounts Payable";
  const cashFlowLabel =
    voucherType === "receipt"
      ? "Cash Receipt"
      : isReceivableVoucher
        ? classicRevenueMode
          ? "Cash Revenue"
          : "Cash Sale"
        : voucherType === "payment"
          ? "Cash Payment"
          : "Cash Purchase";
  /** The list this document itself belongs to — where it shows up once saved. */
  const documentListRoute = useMemo(() => {
    if (voucherType === "sales") {
      if (workflow === "sale-order") {
        return buildWorkspaceRoute(mode, "/sales/sale-order");
      }

      if (workflow === "delivery-note") {
        return buildWorkspaceRoute(mode, "/sales/delivery-challan");
      }

      return buildWorkspaceRoute(mode, "/sales/invoices");
    }

    if (voucherType === "purchase") {
      if (workflow === "purchase-order") {
        return buildWorkspaceRoute(mode, "/purchase/orders");
      }

      if (workflow === "receipt-note") {
        return buildWorkspaceRoute(mode, "/purchase/receipt-notes");
      }

      return buildWorkspaceRoute(mode, "/purchase/bills");
    }

    if (voucherType === "debit-note") {
      return buildWorkspaceRoute(mode, "/purchase/debit-notes");
    }

    if (voucherType === "credit-note") {
      return buildWorkspaceRoute(mode, "/sales/credit-note");
    }

    if (voucherType === "payment") {
      return buildWorkspaceRoute(mode, "/purchase/payment-out");
    }

    if (voucherType === "receipt") {
      return buildWorkspaceRoute(mode, "/sales/payment-in");
    }

    if (voucherType === "expense") {
      return buildWorkspaceRoute(mode, "/purchase/expenses");
    }

    if (voucherType === "revenue") {
      return buildWorkspaceRoute(mode, "/sales/revenue");
    }

    return null;
  }, [mode, voucherType, workflow]);
  const pageCloseRoute = useMemo(() => {
    // Closing without saving goes back where the user came from, which is not the
    // same as where a saved document lands.
    if (returnToRoute) {
      return returnToRoute;
    }

    // A receipt note is only ever raised against an order, so one opened from a
    // source voucher closes back to the orders list even without an explicit returnTo.
    if (voucherType === "purchase" && workflow === "receipt-note" && sourceVoucherId) {
      return buildWorkspaceRoute(mode, "/purchase/orders");
    }

    // Mirrors the receipt note case above: a delivery note is only ever raised
    // against a sale order, so one opened from a source voucher closes back to
    // the sale orders list even without an explicit returnTo.
    if (voucherType === "sales" && workflow === "delivery-note" && sourceVoucherId) {
      return buildWorkspaceRoute(mode, "/sales/sale-order");
    }

    if (voucherType === "journal") {
      return buildWorkspaceRoute(mode, "/dashboard");
    }

    return documentListRoute;
  }, [documentListRoute, mode, returnToRoute, sourceVoucherId, voucherType, workflow]);
  const [loadedVoucher, setLoadedVoucher] = useState<VoucherRecord | null>(null);
  /**
   * The document number this one was converted from. It is stamped on every line as the
   * bill reference, so an order still ties to its receipt note (and a receipt note to
   * its bill) on paper, not only through the internal link id.
   */
  const [sourceDocumentReference, setSourceDocumentReference] = useState<string | null>(null);
  /** Which source order's item quantities have already been trimmed down to the
   * remaining-to-receive amount, so the adjustment effect doesn't reapply itself. */
  const receiptQtyAdjustedForRef = useRef<string | null>(null);
  /** Mirrors receiptQtyAdjustedForRef for the Sale Order -> Delivery Note chain. */
  const deliveryQtyAdjustedForRef = useRef<string | null>(null);
  /** Canonical product identity last committed to each Receipt Note row. This is
   * deliberately separate from the input text so temporarily typing a search does
   * not make re-selecting the same product look like a product change. */
  const receiptCommittedProductByRowRef = useRef(new Map<string, string>());
  /**
   * The bill this debit note is a return against. Starts from the `fromVoucher` link
   * when opened via "Convert to Debit Note", but a standalone "Add Debit Note" has no
   * such link yet — the bill picker below lets the user choose one directly on this
   * page instead of forcing them back to the Purchase Bills list first.
   */
  const [linkedBillId, setLinkedBillId] = useState<string | null>(sourceVoucherId ?? null);
  const [billPickerOpen, setBillPickerOpen] = useState(false);
  const [billPickerQuery, setBillPickerQuery] = useState("");
  const [billPickerHighlightIndex, setBillPickerHighlightIndex] = useState(-1);
  const billPickerRef = useRef<HTMLDivElement>(null);
  const billPickerListRef = useRef<HTMLDivElement>(null);
  /** Tab focuses the field (a keyboard interaction) without a preceding mousedown;
   * a mouse click focuses it too, but only after mousedown fires first — that's the
   * signal used below to tell the two apart, so a click doesn't reopen what onClick
   * just decided to close. */
  const billPickerFocusedByKeyboardRef = useRef(true);
  /** A Purchase Bill can be billed against several receipt notes at once (e.g. three
   * partial deliveries against one order) or just one — this holds the checked set for
   * the multi-select variant of the picker below, used only when creating a plain bill. */
  const [selectedReceiptNotes, setSelectedReceiptNotes] = useState<VoucherRecord[]>([]);
  /** Which bank/cash ledger a Payment-Out actually settles through — a separate concept
   * from settlementMode (cash vs. credit), which is about the *bill*, not the payment. */
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([
    { id: "payment-split-1", method: "Cash", amount: "", ledgerId: "", ledgerName: "", reference: "" },
  ]);
  // The rows are the canonical source of a split payment. Keeping this derived
  // value avoids a one-render lag (and edit-hydration drift) in Paid Now / Due.
  const paymentSplitTotal = sumMoney(paymentSplits.map((split) => Number(split.amount || 0)));
  const [purchaseOrderPaymentType, setPurchaseOrderPaymentType] = useState<"Credit" | "Advance">("Credit");
  const [purchaseReturnCreditAmount, setPurchaseReturnCreditAmount] = useState("");
  const paymentSplitMethodRefs = useRef(new Map<string, HTMLSelectElement>());
  const paymentSplitLedgerRefs = useRef(new Map<string, HTMLSelectElement>());
  const paymentSplitAmountRefs = useRef(new Map<string, HTMLInputElement>());
  const paymentSplitReferenceRefs = useRef(new Map<string, HTMLInputElement>());
  const paymentBreakdownRef = useRef<HTMLDivElement>(null);
  const pendingPaymentSplitFocusRef = useRef<{ id: string; field: "method" | "amount" | "reference" } | null>(null);
  const paymentOutRootRef = useRef<HTMLDivElement>(null);
  const paymentMethod = paymentSplits[0]?.method || "Cash";
  const [paymentVoucherNumber] = useState(() => buildAutoInvoiceNumber(voucherType === "receipt" ? "receipt" : "payment", new Date().toISOString().slice(0, 10)));
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAllocations, setPaymentAllocations] = useState<Array<OutstandingBill & { applied: string }>>([]);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentMismatchWarning, setPaymentMismatchWarning] = useState<(PaymentAllocationMismatch & { signature: string }) | null>(null);
  const [acknowledgedPaymentMismatch, setAcknowledgedPaymentMismatch] = useState<string | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [partyEditorOpen, setPartyEditorOpen] = useState(false);
  /* "+ Add Supplier/Customer" opens the product's real party form right here as a
   * modal, so a party created mid-voucher gets every field the Customer & Suppliers
   * screen collects and the half-filled voucher is never navigated away from. */
  const [partyCreateOpen, setPartyCreateOpen] = useState(false);
  const [partyCreateSeed, setPartyCreateSeed] = useState<PartyFormState>(() => createDefaultPartyFormState());
  const [partyFieldSettings, setPartyFieldSettings] = useState<PartySettingsState>(() => cloneDefaultPartySettings());
  const [partyEditorSaving, setPartyEditorSaving] = useState(false);
  const [partyEditorForm, setPartyEditorForm] = useState<PartyEditorValues | null>(null);
  const [ledgerEditorOpen, setLedgerEditorOpen] = useState(false);
  const [ledgerEditorForm, setLedgerEditorForm] = useState<LedgerEditorValues | null>(null);
  // Which expense category ("Direct" vs "Indirect") a new expense ledger files
  // under — chosen in a small pre-step before the full Chart-of-Accounts-style
  // form opens, since that form only shows the parent as read-only once set.
  // Set when the operator picks a different expense category in the "Add Ledger"
  // parent picker below — null means "use the Indirect Expenses default".
  const [expenseLedgerParentOverride, setExpenseLedgerParentOverride] = useState<string | null>(null);
  const [ledgerFormValues, setLedgerFormValues] = useState<AccountFormState>(emptyAccountFormState);
  const [ledgerFormError, setLedgerFormError] = useState<string | null>(null);
  const [ledgerFormSubmitting, setLedgerFormSubmitting] = useState(false);
  const [localExpenseLedgerNames, setLocalExpenseLedgerNames] = useState<string[]>([]);
  const [itemEditorOpen, setItemEditorOpen] = useState(false);
  const [itemEditorSaving, setItemEditorSaving] = useState(false);
  const [itemEditorForm, setItemEditorForm] = useState<ItemEditorValues | null>(null);
  const [itemEditorCategoryOptions, setItemEditorCategoryOptions] = useState<string[]>([]);
  const [itemEditorUnitOptions, setItemEditorUnitOptions] = useState<string[]>([]);
  const [previewDialog, setPreviewDialog] = useState<PreviewDialogState | null>(null);
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("tally");
  const [showDescriptionField, setShowDescriptionField] = useState(false);
  const [showTermsField, setShowTermsField] = useState(false);
  const [partyPickerOpen, setPartyPickerOpen] = useState(false);
  const [partyHighlightIndex, setPartyHighlightIndex] = useState(-1);
  const partyPickerRef = useRef<HTMLDivElement>(null);
  const partyPickerListRef = useRef<HTMLDivElement>(null);
  const [sidePickerTab, setSidePickerTab] = useState<"party" | "item" | "warehouse">("party");
  const [activeWarehouseRowIndex, setActiveWarehouseRowIndex] = useState<number | null>(null);
  /** Which row's warehouse field is actually focused right now — separate from
   * activeWarehouseRowIndex (which stays put after blur, e.g. while the picker
   * panel is clicked) so the field knows when to show the live typed query vs.
   * fall back to the resolved "CODE — Name" label. */
  const [warehouseFieldFocusedRow, setWarehouseFieldFocusedRow] = useState<number | null>(null);
  const [sidePickerQuery, setSidePickerQuery] = useState("");
  const [sidePickerPage, setSidePickerPage] = useState(1);
  // Shared with the Sales workspace's Quick Picker (sales-workspace-screen.tsx) via
  // the same storage key — one app-wide default, since a supplier may call an item
  // by a different name than what it's catalogued/sold under.
  const [itemPickerNameMode, setItemPickerNameMode] = useState<"name" | "alias">("name");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setItemPickerNameMode(window.localStorage.getItem("bizovix:item-picker-name-mode:v1") === "alias" ? "alias" : "name");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("bizovix:item-picker-name-mode:v1", itemPickerNameMode);
  }, [itemPickerNameMode]);
  /** Keyboard highlight inside the Quick Picker list, driven from the entry fields. */
  const [sidePickerHighlight, setSidePickerHighlight] = useState(-1);
  const [activeItemRowIndex, setActiveItemRowIndex] = useState<number | null>(null);
  const sidePickerListRef = useRef<HTMLDivElement>(null);
  /** Adjustment journals select every posting account from the COA picker.
   * This index identifies which row the next picker click should fill. */
  const [activeJournalLineIndex, setActiveJournalLineIndex] = useState(0);
  const [journalLedgerQuery, setJournalLedgerQuery] = useState("");
  const [journalLedgerFieldFocused, setJournalLedgerFieldFocused] = useState(false);
  const [journalLedgerHighlight, setJournalLedgerHighlight] = useState(0);
  const journalLedgerListRef = useRef<HTMLDivElement>(null);

  // Keep the keyboard-highlighted Quick Picker row visible, and follow it across pages.
  useEffect(() => {
    if (sidePickerHighlight < 0) {
      return;
    }

    setSidePickerPage(Math.floor(sidePickerHighlight / 8) + 1);
  }, [sidePickerHighlight]);

  useEffect(() => {
    if (sidePickerHighlight < 0) {
      return;
    }

    sidePickerListRef.current
      ?.querySelector(`[data-picker-index="${sidePickerHighlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sidePickerHighlight, sidePickerPage]);


  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node) || !partyPickerOpen) {
        return;
      }

      if (!partyPickerRef.current?.contains(target)) {
        setPartyPickerOpen(false);
        setPartyHighlightIndex(-1);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [partyPickerOpen]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node) || !billPickerOpen) {
        return;
      }

      if (!billPickerRef.current?.contains(target)) {
        setBillPickerOpen(false);
        setBillPickerHighlightIndex(-1);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [billPickerOpen]);

  const documentAttachmentInputRef = useRef<HTMLInputElement>(null);
  const watchedAttachmentDocumentUrl = form.watch("attachmentDocumentUrl");
  const watchedAttachmentDocumentName = form.watch("attachmentDocumentName");

  async function handleAttachmentDocumentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Document should be under 5 MB");
      return;
    }

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      form.setValue("attachmentDocumentUrl", dataUrl, { shouldDirty: true });
      form.setValue("attachmentDocumentName", file.name, { shouldDirty: true });
      toast.success("Document attached");
    } catch {
      toast.error("Document could not be attached");
    }
  }

  /** A single label+control pair for the party/ledger/item "dedicated window"
   * editors — plain and borderless on purpose, so the dialog reads as one cohesive
   * form instead of a grid of separately-boxed fields. */
  function renderEditorField(label: string, control: React.ReactNode, className?: string) {
    return (
      <label className={cn("block space-y-1.5", className)}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8592a8]">{label}</span>
        {control}
      </label>
    );
  }

  /** The "what happens when you save this" note shown at the bottom of those same
   * editors — a quiet inline callout instead of a heavy filled panel. */
  function renderEditorImpactNote(headline: string, detail?: string) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg bg-[#eef5ff] px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" />
        <p className="text-[13px] leading-5 text-[#3c536f]">
          <span className="font-medium text-[#173152]">{headline}</span>
          {detail ? <span className="text-[#5b6f8c]"> {detail}</span> : null}
        </p>
      </div>
    );
  }

  function renderAttachmentControls(includeFileAttachments = true) {
    const narrationValue = form.watch("narration");
    const conditionValue = form.watch("condition");

    return (
      <>
        <input ref={documentAttachmentInputRef} type="file" className="hidden" onChange={(event) => void handleAttachmentDocumentChange(event)} />

        {showTermsField || conditionValue ? (
          <label className="grid gap-1.5">
            <span className="flex items-center justify-between text-sm text-[#475569]">
              Terms & Conditions
              <button
                type="button"
                className="text-xs font-medium text-[#0f6cf6]"
                onClick={() => {
                  form.setValue("condition", "", { shouldDirty: true });
                  setShowTermsField(false);
                }}
              >
                Clear
              </button>
            </span>
            <textarea
              data-purchase-return-after-items="true"
              className="min-h-[80px] w-full rounded-[4px] border border-[#d7e1ee] bg-white p-3 text-sm text-foreground"
              placeholder="Payment terms, delivery terms, validity, warranty, or other customer-facing conditions"
              {...form.register("condition")}
            />
          </label>
        ) : (
          <Button data-purchase-return-after-items="true" type="button" variant="outline" className="h-11 w-full justify-start rounded-[4px] border-[#d7e1ee] text-[#475569]" onClick={() => setShowTermsField(true)}>
            <FileStack className="h-5 w-5" />
            Add Condition
          </Button>
        )}

        {showDescriptionField || narrationValue ? (
          <label className="grid gap-1.5">
            <span className="flex items-center justify-between text-sm text-[#475569]">
              Description
              <button type="button" className="text-xs font-medium text-[#0f6cf6]" onClick={() => setShowDescriptionField(false)}>
                Hide
              </button>
            </span>
            <textarea className="min-h-[80px] w-full rounded-[4px] border border-[#d7e1ee] bg-white p-3 text-sm text-foreground" {...form.register("narration")} />
          </label>
        ) : (
          <Button type="button" variant="outline" className="h-11 w-full justify-start rounded-[4px] border-[#d7e1ee] text-[#475569]" onClick={() => setShowDescriptionField(true)}>
            <FileStack className="h-5 w-5" />
            Add Description
          </Button>
        )}

        {includeFileAttachments ? (watchedAttachmentDocumentUrl ? (
          <div className="flex items-center gap-3 rounded-[4px] border border-[#d7e1ee] bg-white p-2">
            <FileText className="h-5 w-5 text-[#475569]" />
            {/* An attachment you cannot open again is not much of an attachment. */}
            <a
              href={watchedAttachmentDocumentUrl}
              download={watchedAttachmentDocumentName || "attachment"}
              className="flex-1 truncate text-sm text-[#0f6cf6] hover:underline"
              title={`Download ${watchedAttachmentDocumentName || "attachment"}`}
            >
              {watchedAttachmentDocumentName || "Document attached"}
            </a>
            <button
              type="button"
              className="text-[#94a3b8] hover:text-danger"
              onClick={() => {
                form.setValue("attachmentDocumentUrl", "", { shouldDirty: true });
                form.setValue("attachmentDocumentName", "", { shouldDirty: true });
              }}
              aria-label="Remove document"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="h-11 w-full justify-start rounded-[4px] border-[#d7e1ee] text-[#475569]" onClick={() => documentAttachmentInputRef.current?.click()}>
            <FileText className="h-5 w-5" />
            Add Document
          </Button>
        )) : null}
      </>
    );
  }
  const advancedHint =
    voucherType === "sales"
      ? "Customer/Cash normally debits, Sales Account normally credits."
      : voucherType === "purchase"
        ? "Purchase/Stock normally debits, Supplier normally credits."
        : voucherType === "expense"
          ? "Expense ledger normally debits, while cash, bank, or payable normally credits."
          : voucherType === "revenue"
            ? "Receivable or cash normally debits, while the revenue ledger normally credits."
        : voucherType === "receipt"
          ? ""
          : voucherType === "payment"
            ? "Expense/Supplier normally debits, Cash/Bank normally credits."
            : voucherType === "contra"
              ? "One cash/bank ledger debits while the opposite cash/bank ledger credits."
              : "Maintain balanced debit and credit totals across all active rows.";
  const simpleModeHint =
    voucherType === "sales"
      ? "Enter the customer or cash amount first, and the system keeps the sales balancing line in the background."
      : voucherType === "purchase"
        ? "Enter the purchase amount first, and the system keeps the supplier balancing line in the background."
        : voucherType === "expense"
          ? "Enter the expense amount and the system balances it against cash, bank, or payable automatically."
          : voucherType === "revenue"
            ? "Enter the revenue amount and the system balances it against receivable or cash automatically."
            : voucherType === "receipt"
              ? ""
              : voucherType === "payment"
                ? "Enter the payment amount and the system balances the bank or cash line in the background."
                : voucherType === "contra"
                  ? "Enter the transfer amount and the system keeps the opposite cash or bank line matched."
                  : "Enter plain amounts while the system maintains the balancing side internally.";
  const guidanceText = advancedMode ? advancedHint : simpleModeHint;

  useEffect(() => {
    setCompanyProfile(readCompanyProfile(mode, workspaceId));
  }, [mode, workspaceId]);

  useEffect(() => {
    const handleCompanyProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ mode: typeof mode; workspaceId: string }>).detail;
      if (!detail || detail.mode !== mode || detail.workspaceId !== workspaceId) {
        return;
      }

      setCompanyProfile(readCompanyProfile(mode, workspaceId));
    };

    window.addEventListener(COMPANY_PROFILE_UPDATED_EVENT, handleCompanyProfileUpdated as EventListener);
    return () => window.removeEventListener(COMPANY_PROFILE_UPDATED_EVENT, handleCompanyProfileUpdated as EventListener);
  }, [mode, workspaceId]);

  const invoiceSubtotal = sumMoney(
    watchedInvoiceItems.map((item) => roundMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0))),
  );
  const discountAmount = roundMoney(
    watchedDiscountType === "percent"
      ? Math.min(invoiceSubtotal, (invoiceSubtotal * watchedDiscount) / 100)
      : Math.min(invoiceSubtotal, watchedDiscount),
  );
  const invoiceUnroundedTotal = Math.max(0, roundMoney(invoiceSubtotal - discountAmount));
  /** Round Off is offered only where the panel exposes it — the classic Sales
   * Invoice / Purchase Bill totals card. `invoiceNetTotal` stays the number the
   * party actually settles, so every downstream figure (due, paid, print) follows
   * the rounding without extra plumbing. */
  const roundOffEnabled = (classicSalesInvoiceMode || classicPurchaseMode) && Boolean(watchedRoundOff);
  const invoiceRoundOffAmount = roundOffEnabled ? roundMoney(applyRoundOff(invoiceUnroundedTotal, roundOffPreference) - invoiceUnroundedTotal) : 0;
  const invoiceNetTotal = roundMoney(invoiceUnroundedTotal + invoiceRoundOffAmount);
  const previousPurchaseAdvanceAmount = useMemo(() => {
    if (!classicPurchaseMode || !historyVouchersLoaded) return 0;

    const sourceReceipts = selectedReceiptNotes.length
      ? selectedReceiptNotes
      : loadedVoucher?.documentKind === "receipt-note"
        ? [loadedVoucher]
        : [];
    const purchaseOrderIds = new Set<string>();
    for (const receipt of sourceReceipts) {
      if (receipt.sourceVoucherId) purchaseOrderIds.add(receipt.sourceVoucherId);
    }
    if (loadedVoucher?.documentKind === "purchase-order") purchaseOrderIds.add(loadedVoucher.id);
    if (!purchaseOrderIds.size) return 0;

    const active = (voucher: VoucherRecord) => !["cancelled", "reversed", "rejected"].includes(voucher.status);
    const totalAdvance = sumMoney(
      historyVouchers
        .filter((voucher) => voucher.voucherType === "payment" && Boolean(voucher.sourceVoucherId && purchaseOrderIds.has(voucher.sourceVoucherId)) && active(voucher))
        .map((voucher) => Number(voucher.amount || 0)),
    );

    const receiptIds = new Set(
      historyVouchers
        .filter((voucher) => voucher.documentKind === "receipt-note" && Boolean(voucher.sourceVoucherId && purchaseOrderIds.has(voucher.sourceVoucherId)))
        .map((voucher) => voucher.id),
    );
    sourceReceipts.forEach((receipt) => receiptIds.add(receipt.id));
    const previouslyBilled = sumMoney(
      historyVouchers
        .filter((voucher) => voucher.documentKind === "bill" && voucher.id !== editingVoucherId && Boolean(voucher.sourceVoucherId && receiptIds.has(voucher.sourceVoucherId)) && active(voucher))
        .map((voucher) => Number(voucher.amount || 0)),
    );

    return Math.max(0, roundMoney(totalAdvance - previouslyBilled));
  }, [classicPurchaseMode, editingVoucherId, historyVouchers, historyVouchersLoaded, loadedVoucher, selectedReceiptNotes]);
  const previousSalesAdvanceAmount = useMemo(() => {
    if (!classicSalesInvoiceMode || !historyVouchersLoaded) return 0;

    const sourceDeliveries = selectedReceiptNotes.length
      ? selectedReceiptNotes
      : loadedVoucher?.documentKind === "delivery-note"
        ? [loadedVoucher]
        : [];
    const saleOrderIds = new Set<string>();
    for (const delivery of sourceDeliveries) {
      if (delivery.sourceVoucherId) saleOrderIds.add(delivery.sourceVoucherId);
    }
    if (!saleOrderIds.size) return 0;

    const active = (voucher: VoucherRecord) => !["cancelled", "reversed", "rejected"].includes(voucher.status);
    const totalAdvance = sumMoney(
      historyVouchers
        .filter((voucher) => voucher.voucherType === "receipt" && Boolean(voucher.sourceVoucherId && saleOrderIds.has(voucher.sourceVoucherId)) && active(voucher))
        .map((voucher) => Number(voucher.amount || 0)),
    );

    const deliveryIds = new Set(
      historyVouchers
        .filter((voucher) => voucher.documentKind === "delivery-note" && Boolean(voucher.sourceVoucherId && saleOrderIds.has(voucher.sourceVoucherId)))
        .map((voucher) => voucher.id),
    );
    sourceDeliveries.forEach((delivery) => deliveryIds.add(delivery.id));
    const previouslyInvoiced = sumMoney(
      historyVouchers
        .filter((voucher) => voucher.voucherType === "sales" && !voucher.documentKind && voucher.id !== editingVoucherId && Boolean(voucher.sourceVoucherId && deliveryIds.has(voucher.sourceVoucherId)) && active(voucher))
        .map((voucher) => Number(voucher.amount || 0)),
    );

    return Math.max(0, roundMoney(totalAdvance - previouslyInvoiced));
  }, [classicSalesInvoiceMode, editingVoucherId, historyVouchers, historyVouchersLoaded, loadedVoucher, selectedReceiptNotes]);

  useEffect(() => {
    if (!classicDebitNoteMode || purchaseOrderPaymentType !== "Credit") return;
    setPurchaseReturnCreditAmount(invoiceNetTotal > 0 ? String(invoiceNetTotal) : "");
  }, [classicDebitNoteMode, invoiceNetTotal, purchaseOrderPaymentType]);
  const watchedPartyName = form.watch("partyName");
  const watchedSettlementMode = form.watch("settlementMode");
  const watchedMoneyAccountId = form.watch("moneyAccountId");
  const watchedMoneyAccountType = form.watch("moneyAccountType");
  const watchedPaidAmount = Number(form.watch("paidAmount") || 0);
  const watchedPurchaseSettlementLedger = form.watch("purchaseSettlementLedger");
  const watchedExpenseCreditLedger = form.watch("expenseCreditLedger");
  const watchedPurchaseSettlementLedgerLabel = watchedPurchaseSettlementLedger === "Mobile Financial Service Accounts" ? "MFS" : "Bank";
  const settlementFlowLabel =
    watchedSettlementMode === "cash" ? cashFlowLabel : watchedSettlementMode === "bank" ? watchedPurchaseSettlementLedgerLabel : accountRoleLabel;
  const settlementPostingTarget =
    watchedSettlementMode === "cash"
      ? "Cash in Hand"
      : watchedSettlementMode === "bank"
        ? watchedPurchaseSettlementLedger || "Bank Accounts"
        : `${accountRoleLabel} / ${partyRoleLabel}`;
  const matchedParty = useMemo(
    () => partyOptions.find((party) => party.name.toLowerCase() === watchedPartyName.trim().toLowerCase()) ?? null,
    [partyOptions, watchedPartyName],
  );
  function getPartyCurrentBalance(party: PartyRecord) {
    const ledgerVouchers = historyVouchers.filter(
      (voucher) =>
        (voucher.status === "posted" || voucher.status === "reversed")
        && (!/-REV(?:-REV)*$/i.test(voucher.voucherNumber.trim()) || Boolean(voucher.reversalOfId)),
    );
    const hasOpeningJournal = ledgerVouchers.some(
      (voucher) =>
        voucher.voucherType === "journal"
        && voucher.documentKind === "opening-balance"
        && voucher.partyId === party.id
        && voucher.lines.some((line) => Boolean(party.ledgerAccountId) && line.accountId === party.ledgerAccountId),
    );
    return sumMoney([
      hasOpeningJournal ? 0 : Number(party.openingBalance || 0),
      ...ledgerVouchers.map((voucher) => getPartyLedgerDelta(voucher, party)),
    ]);
  }
  const partyCurrentBalance = useMemo(() => matchedParty ? getPartyCurrentBalance(matchedParty) : 0, [historyVouchers, matchedParty]);
  function formatPartyCurrentBalance(party: PartyRecord) {
    const balance = getPartyCurrentBalance(party);
    if (moneyToMinorUnits(balance) === 0) return formatCurrency(0);
    const direction = party.type === "customer" ? (balance > 0 ? "Dr" : "Cr") : balance > 0 ? "Cr" : "Dr";
    return `${formatCurrency(Math.abs(balance))} ${direction}`;
  }
  /** Raw debit-minus-credit balance for a Chart of Accounts ledger, same sign
   * convention as chart-of-accounts-panel.tsx's AccountBalanceValue (positive
   * reads Dr, negative reads Cr) rather than a nature-flipped "natural" balance. */
  function formatLedgerCurrentBalance(value: number | undefined) {
    const balance = value ?? 0;
    if (moneyToMinorUnits(balance) === 0) return formatCurrency(0);
    return `${formatCurrency(Math.abs(balance))} ${balance > 0 ? "Dr" : "Cr"}`;
  }
  const formattedPartyBalance = useMemo(() => {
    if (!matchedParty || moneyToMinorUnits(partyCurrentBalance) === 0) {
      return formatCurrency(0);
    }

    const direction =
      matchedParty.type === "customer"
        ? partyCurrentBalance > 0
          ? "Dr"
          : "Cr"
        : partyCurrentBalance > 0
          ? "Cr"
          : "Dr";
    return `${formatCurrency(Math.abs(partyCurrentBalance))} ${direction}`;
  }, [matchedParty, partyCurrentBalance]);
  const filteredPartyOptions = useMemo(() => {
    const query = watchedPartyName.trim().toLowerCase();
    if (!query) {
      return partyOptions;
    }

    return partyOptions.filter((party) => party.name.toLowerCase().includes(query));
  }, [partyOptions, watchedPartyName]);

  /** The reference document this entry can be raised against — a debit note points at
   * a purchase bill (a return has to reference what it's returning), a plain purchase
   * bill points at a receipt note (billing has to reference what arrived). Same picker
   * UI, different source list depending on which document is being created. */
  const returnableBills = useMemo(() => {
    const query = billPickerQuery.trim().toLowerCase();

    if (classicDebitNoteMode) {
      // A return must point to a final posted bill for the selected party.
      const partyName = watchedPartyName.trim().toLowerCase();
      if (!partyName) {
        return [];
      }

      const alreadyPicked = new Set(selectedReceiptNotes.map((entry) => entry.id));
      return historyVouchers
        .filter((entry) =>
          entry.voucherType === (isSalesReturnMode ? "sales" : "purchase") &&
          (entry.documentKind === "bill" || !entry.documentKind) &&
          entry.status === "posted",
        )
        .filter((entry) => entry.partyName.trim().toLowerCase() === partyName)
        .filter((entry) => {
          if (!isSalesReturnMode) return true;
          const liveReturns = historyVouchers.filter(
            (candidate) =>
              candidate.voucherType === "credit-note" &&
              candidate.sourceVoucherId === entry.id &&
              !["cancelled", "reversed"].includes(candidate.status),
          );
          return (entry.inventoryItems ?? []).some((line) => {
            const returned = liveReturns.reduce(
              (total, salesReturn) =>
                total + (salesReturn.inventoryItems ?? [])
                  .filter((item) => item.sourceInventoryLineId === line.id)
                  .reduce((sum, item) => sum + Number(item.quantity || 0), 0),
              0,
            );
            return returned < Number(line.quantity || 0) - 0.000001;
          });
        })
        .filter((entry) => !alreadyPicked.has(entry.id))
        .filter((entry) => (query ? (entry.reference || entry.voucherNumber).toLowerCase().includes(query) : true))
        .sort((left, right) => (left.voucherDate < right.voucherDate ? 1 : -1))
        .slice(0, 30);
    }

    if (classicPurchaseMode) {
      // Only that supplier's receipt notes — picking one before a supplier is chosen
      // would mean the party field gets silently overwritten by whichever was picked.
      const supplierName = watchedPartyName.trim().toLowerCase();
      if (!supplierName) {
        return [];
      }

      const alreadyPicked = new Set(selectedReceiptNotes.map((entry) => entry.id));
      const fullyBilledReceiptNoteIds = buildFullyBilledReceiptNoteIds(historyVouchers);
      return historyVouchers
        .filter((entry) => entry.voucherType === "purchase" && entry.documentKind === "receipt-note" && entry.status === "posted")
        .filter((entry) => entry.partyName.trim().toLowerCase() === supplierName)
        .filter((entry) => !fullyBilledReceiptNoteIds.has(entry.id))
        .filter((entry) => !alreadyPicked.has(entry.id))
        .filter((entry) => (query ? (entry.reference || entry.voucherNumber).toLowerCase().includes(query) : true))
        .sort((left, right) => left.voucherDate.localeCompare(right.voucherDate) || left.createdAt.localeCompare(right.createdAt))
        .slice(0, 30);
    }

    if (classicSalesInvoiceMode) {
      // Mirrors classicPurchaseMode above exactly, one level down the same document
      // chain: a Sales Bill combines that customer's Delivery Notes the way a
      // Purchase Bill combines that supplier's Receipt Notes.
      const customerName = watchedPartyName.trim().toLowerCase();
      if (!customerName) {
        return [];
      }

      const alreadyPicked = new Set(selectedReceiptNotes.map((entry) => entry.id));
      const fullyInvoicedDeliveryNoteIds = buildFullyInvoicedDeliveryNoteIds(historyVouchers);
      return historyVouchers
        .filter((entry) => entry.voucherType === "sales" && entry.documentKind === "delivery-note" && entry.status === "posted")
        .filter((entry) => entry.partyName.trim().toLowerCase() === customerName)
        .filter((entry) => !fullyInvoicedDeliveryNoteIds.has(entry.id))
        .filter((entry) => !alreadyPicked.has(entry.id))
        .filter((entry) => (query ? (entry.reference || entry.voucherNumber).toLowerCase().includes(query) : true))
        .sort((left, right) => left.voucherDate.localeCompare(right.voucherDate) || left.createdAt.localeCompare(right.createdAt))
        .slice(0, 30);
    }

    return [];
  }, [classicDebitNoteMode, classicPurchaseMode, classicSalesInvoiceMode, historyVouchers, billPickerQuery, watchedPartyName, selectedReceiptNotes, isSalesReturnMode]);

  useEffect(() => {
    if (billPickerHighlightIndex < 0) {
      return;
    }

    billPickerListRef.current
      ?.querySelector(`[data-picker-option-index="${billPickerHighlightIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [billPickerHighlightIndex]);

  useEffect(() => {
    if (partyHighlightIndex < 0) {
      return;
    }

    partyPickerListRef.current
      ?.querySelector(`[data-picker-option-index="${partyHighlightIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [partyHighlightIndex]);

  const outstandingBillsForPayment = useMemo(
    () => (classicPaymentMode ? (isCustomerReceiptMode ? computeOutstandingInvoices(historyVouchers, watchedPartyName) : computeOutstandingBills(historyVouchers, watchedPartyName)) : []),
    [classicPaymentMode, historyVouchers, isCustomerReceiptMode, watchedPartyName],
  );

  // Defaults the payment to settle the party's oldest outstanding bills first, same as
  // the equivalent logic on the Payment-Out list's own dialog — the first bill is filled
  // up to its balance, the leftover rolls into the next one, and so on. Re-running only
  // on party/amount change means a row the user has hand-edited stays put otherwise.
  useEffect(() => {
    if (!classicPaymentMode || editingVoucherId) {
      return;
    }

    const paidTotal = Number(paymentAmount || 0);
    if (!outstandingBillsForPayment.length) {
      setPaymentAllocations([]);
      return;
    }

    let remaining = Math.max(0, paidTotal);
    setPaymentAllocations(
      outstandingBillsForPayment.map((bill) => {
        const applied = Math.min(bill.balance, remaining);
        remaining = Math.max(0, remaining - applied);
        return { ...bill, applied: applied > 0 ? String(applied) : "" };
      }),
    );
  }, [classicPaymentMode, editingVoucherId, outstandingBillsForPayment, paymentAmount]);

  function updatePaymentAllocation(sourceId: string, value: string) {
    setPaymentAllocations((current) => current.map((row) => (row.sourceId === sourceId ? { ...row, applied: value } : row)));
  }

  const paymentAllocatedTotal = sumMoney(paymentAllocations.map((row) => Number(row.applied || 0)));
  const paymentTotalDue = sumMoney(outstandingBillsForPayment.map((bill) => Number(bill.balance || 0)));
  // While editing, a bill this payment already fully settled has balance 0 and
  // drops out of outstandingBillsForPayment (computed from the live, post-save
  // state) — so the table has to fall back to paymentAllocations (hydrated from
  // the voucher's own saved lines) to still show which bill(s) it was applied to.
  const billsForPaymentTable = editingVoucherId
    ? Array.from(new Map([...outstandingBillsForPayment, ...paymentAllocations].map((bill) => [bill.sourceId, bill])).values()).sort(
        (left, right) => left.documentDate.localeCompare(right.documentDate) || left.createdAt.localeCompare(right.createdAt),
      )
    : outstandingBillsForPayment;
  const numericPaymentAmount = roundCurrencyAmount(Number(paymentAmount || 0));
  const paymentExcessAmount = Math.max(0, roundCurrencyAmount(numericPaymentAmount - paymentTotalDue));
  const paymentExceedsTotalDue = Boolean(watchedPartyName.trim()) && moneyToMinorUnits(paymentExcessAmount) > 0;

  function paymentLedger(method: PaymentOutMethod) {
    if (method === "Cash") return "Cash in Hand";
    if (method === "MFS") return "Mobile Financial Service Accounts";
    if (method === "Cheque") return "Bank Clearing";
    return "Bank Accounts";
  }

  function paymentMoneyAccountTypes(method: PaymentOutMethod | "") {
    if (method === "Cash") return ["CASH"] as const;
    if (method === "MFS") return ["MFS"] as const;
    if (method) return ["BANK"] as const;
    return [] as const;
  }

  function updateMoneySettlement(method: "cash" | "bank" | "mfs" | "accounts-payable" | "credit") {
    if (method === "accounts-payable" || method === "credit") {
      form.setValue("settlementMode", "accounts-payable", { shouldDirty: true, shouldTouch: true });
      form.setValue("moneyAccountId", "", { shouldDirty: true });
      form.setValue("moneyAccountName", "", { shouldDirty: true });
      return;
    }
    const type = method === "cash" ? "CASH" : method === "mfs" ? "MFS" : "BANK";
    form.setValue("settlementMode", method === "cash" ? "cash" : "bank", { shouldDirty: true, shouldTouch: true });
    form.setValue("moneyAccountType", type, { shouldDirty: true });
    form.setValue("moneyAccountId", "", { shouldDirty: true });
    form.setValue("moneyAccountName", "", { shouldDirty: true });
  }

  function renderMoneyAccountSelector(className = "h-10 rounded-md", allowAllMoneyAccounts = false) {
    if (watchedSettlementMode === "accounts-payable") return null;
    return (
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-[#334155]">{allowAllMoneyAccounts ? "Type of Payment / Account Ledger" : watchedMoneyAccountType === "CASH" ? "Cash Account" : watchedMoneyAccountType === "MFS" ? "MFS Account" : "Bank Account"} *</span>
        <MoneyAccountSelector
          value={watchedMoneyAccountId}
          enabled={mode === "api"}
          required={mode === "api"}
          allowedTypes={allowAllMoneyAccounts ? ["CASH", "BANK", "MFS"] : [watchedMoneyAccountType]}
          onChange={(account) => {
            if (allowAllMoneyAccounts && account) {
              form.setValue("settlementMode", account.type === "CASH" ? "cash" : "bank", { shouldDirty: true, shouldTouch: true });
              form.setValue("moneyAccountType", account.type, { shouldDirty: true });
            }
            form.setValue("moneyAccountId", account?.id ?? "", { shouldDirty: true, shouldTouch: true });
            form.setValue("moneyAccountName", account?.name ?? "", { shouldDirty: true });
          }}
          className={className}
        />
      </label>
    );
  }

  function renderSplitPaymentBreakdown(
    title: string,
    totalLabel: string,
    methodLabel = "Type",
    helperText = "Split the amount across Cash, Bank, Card, Cheque or MFS.",
  ) {
    return (
      <div ref={paymentBreakdownRef} className="overflow-hidden rounded-md border border-[#d7e1ee] bg-white">
        <div className="flex items-center justify-between border-b border-[#e5ebf3] bg-[#f8fafc] px-3 py-2">
          <div>
            <div className="text-xs font-semibold text-[#243b63]">{title}</div>
            <div className="text-[11px] text-[#718098]">{helperText}</div>
          </div>
          <div className="flex items-center gap-2">
            {mode === "api" ? (
              <button type="button" onClick={() => window.open("/app/reports/chart-of-accounts", "_blank", "noopener,noreferrer")} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#cbd5e1] bg-white px-3 text-xs font-semibold text-[#475569]">
                <Plus className="h-3.5 w-3.5" /> Add Ledger
              </button>
            ) : null}
            <button type="button" onClick={appendPaymentSplit} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#8ebcff] px-3 text-xs font-semibold text-[#0f6cf6]">
              <Plus className="h-3.5 w-3.5" /> Add Method
            </button>
          </div>
        </div>
        <div className="grid grid-cols-[104px_minmax(150px,1fr)_104px_minmax(140px,1fr)_32px] gap-2 border-b border-[#edf1f6] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#718098]">
          <div>{methodLabel}</div><div>Account Ledger *</div><div className="text-right">Amount</div><div>Reference</div><div />
        </div>
        {paymentSplits.map((split, splitIndex) => (
          <div key={split.id} className="grid grid-cols-[104px_minmax(150px,1fr)_104px_minmax(140px,1fr)_32px] items-center gap-2 border-b border-[#edf1f6] px-3 py-1.5 last:border-b-0">
            <select
              ref={(node) => {
                if (node) paymentSplitMethodRefs.current.set(split.id, node);
                else paymentSplitMethodRefs.current.delete(split.id);
              }}
              data-po-payment-method={splitIndex}
              value={split.method}
              onChange={(event) => {
                const method = event.target.value as PaymentOutMethod | "";
                updatePaymentSplit(split.id, { method, ledgerId: "", ledgerName: "", reference: method === "Cash" ? "" : split.reference });
              }}
              className="h-9 rounded-md border border-[#cfd9e8] bg-white px-2 text-sm"
            >
              <option value="">Select method</option>
              {paymentOutMethodOptionsForVoucher.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <MoneyAccountSelector
              selectRef={(node) => {
                if (node) paymentSplitLedgerRefs.current.set(split.id, node);
                else paymentSplitLedgerRefs.current.delete(split.id);
              }}
              purchaseOrderPaymentRow={splitIndex}
              value={split.ledgerId}
              enabled={mode === "api"}
              disabled={!split.method}
              required={mode === "api"}
              allowedTypes={[...paymentMoneyAccountTypes(split.method)]}
              onChange={(ledger) => updatePaymentSplit(split.id, { ledgerId: ledger?.id ?? "", ledgerName: ledger?.name ?? "" })}
              className="h-9 rounded-md"
            />
            <Input
              ref={(node) => {
                if (node) paymentSplitAmountRefs.current.set(split.id, node);
                else paymentSplitAmountRefs.current.delete(split.id);
              }}
              data-po-payment-amount={splitIndex}
              money type="number" min="0" step="0.01" value={split.amount}
              onChange={(event) => updatePaymentSplit(split.id, { amount: event.target.value })}
              placeholder="0.00" className="h-9 text-right font-semibold"
            />
            <Input
              ref={(node) => {
                if (node) paymentSplitReferenceRefs.current.set(split.id, node);
                else paymentSplitReferenceRefs.current.delete(split.id);
              }}
              data-po-payment-reference={splitIndex}
              value={split.reference}
              onChange={(event) => updatePaymentSplit(split.id, { reference: event.target.value })}
              disabled={!split.method}
              placeholder={!split.method ? "Select method first" : "Reference (optional)"}
              className="h-9"
            />
            <button type="button" disabled={paymentSplits.length === 1} onClick={() => removePaymentSplit(split.id)} className="inline-flex h-8 w-8 items-center justify-center text-[#d34b4b] disabled:opacity-30" aria-label="Remove payment method"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <div className="flex items-center justify-end gap-8 border-t border-[#d7e1ee] bg-[#f8fafc] px-3 py-2">
          <span className="text-xs font-semibold uppercase text-[#718096]">{totalLabel}</span>
          <span className="text-base font-bold text-emerald-700">{formatCurrency(paymentSplitTotal)}</span>
        </div>
      </div>
    );
  }

  function purchaseSettlementLedgerName(values: Pick<VoucherFormValues, "purchaseSettlementLedger">) {
    return values.purchaseSettlementLedger?.trim() || "Bank Accounts";
  }

  function updatePaymentSplit(id: string, patch: Partial<PaymentSplit>) {
    setPaymentSplits((current) => current.map((split) => (split.id === id ? { ...split, ...patch } : split)));
  }

  function updatePurchaseOrderPaymentType(type: "Credit" | "Advance") {
    setPurchaseOrderPaymentType(type);
    if (type === "Credit") {
      // Credit is settled entirely through the supplier/party payable ledger.
      // Clear any Cash/Bank/MFS selection inherited from the source document so
      // save validation cannot incorrectly demand a money account.
      updateMoneySettlement("credit");
      setPaymentSplits([{ id: `payment-split-credit-${Date.now()}`, method: "Cash", amount: "", ledgerId: "", ledgerName: "", reference: "" }]);
      return;
    }
    setPaymentSplits((current) => {
      const first = current[0] ?? { id: `payment-split-${Date.now()}`, method: "", amount: "", ledgerId: "", ledgerName: "", reference: "" };
      return [{ ...first, method: "", ledgerId: "", ledgerName: "", reference: "" }, ...current.slice(1)];
    });
  }

  function appendPaymentSplit() {
    const id = `payment-split-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    pendingPaymentSplitFocusRef.current = { id, field: "method" };
    setPaymentSplits((current) => [...current, { id, method: "", amount: "", ledgerId: "", ledgerName: "", reference: "" }]);
  }

  function removePaymentSplit(id: string) {
    setPaymentSplits((current) => current.length === 1 ? current : current.filter((split) => split.id !== id));
  }

  useEffect(() => {
    const pending = pendingPaymentSplitFocusRef.current;
    if (!pending) return;
    pendingPaymentSplitFocusRef.current = null;
    window.requestAnimationFrame(() => {
      const target = pending.field === "method"
        ? paymentSplitMethodRefs.current.get(pending.id)
        : pending.field === "amount"
          ? paymentSplitAmountRefs.current.get(pending.id)
          : paymentSplitReferenceRefs.current.get(pending.id);
      paymentBreakdownRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
      if (target instanceof HTMLInputElement) target.select();
    });
  }, [paymentSplits]);

  function handlePaymentOutKeyboardFlow(event: React.KeyboardEvent<HTMLDivElement>) {
    const root = paymentOutRootRef.current;
    if (!root || event.altKey || event.ctrlKey || event.metaKey) return;
    const current = event.target as HTMLElement;
    const focus = (target: HTMLElement | null | undefined) => {
      target?.focus();
      if (target instanceof HTMLInputElement && target.type !== "date") target.select();
    };
    const openSelect = (target: HTMLSelectElement | null | undefined) => {
      if (!target || target.disabled) return;
      target.focus();
      target.dataset.paymentPickerOpened = "true";
      try { target.showPicker?.(); } catch { target.click(); }
    };
    const date = root.querySelector<HTMLInputElement>('[data-payment-out-date="true"]');
    const party = root.querySelector<HTMLInputElement>('[data-payment-out-party="true"]');
    const firstBill = root.querySelector<HTMLInputElement>('[data-payment-out-bill-index="0"]');
    const narration = root.querySelector<HTMLInputElement>('[data-payment-out-narration="true"]');
    const save = root.querySelector<HTMLButtonElement>('[data-payment-out-save="true"]');

    if (event.key === "F2") {
      event.preventDefault();
      focus(date);
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && current instanceof HTMLSelectElement) {
      current.dataset.paymentPickerOpened = "true";
      return;
    }
    const forward = event.key === "Enter" || event.key === "Tab";
    const backward = event.key === "Backspace";
    if ((!forward && !backward) || event.shiftKey || current.tagName === "TEXTAREA" || current.tagName === "BUTTON") return;
    if (backward && current instanceof HTMLInputElement && current.value !== "") return;

    if (current === date && forward) {
      event.preventDefault();
      focus(party);
      return;
    }
    if (current === party) {
      if (backward && !party.value) {
        event.preventDefault();
        focus(date);
      } else if (forward && matchedParty) {
        event.preventDefault();
        focus(paymentSplitMethodRefs.current.get(paymentSplits[0]?.id ?? ""));
      }
      return;
    }

    const methodIndex = paymentSplits.findIndex((split) => paymentSplitMethodRefs.current.get(split.id) === current);
    if (methodIndex >= 0) {
      const split = paymentSplits[methodIndex]!;
      event.preventDefault();
      if (backward) {
        focus(methodIndex ? paymentSplitAmountRefs.current.get(paymentSplits[methodIndex - 1]!.id) : party);
      } else if (event.key === "Enter" && current instanceof HTMLSelectElement && current.dataset.paymentPickerOpened !== "true") {
        openSelect(current);
      } else {
        if (current instanceof HTMLSelectElement) delete current.dataset.paymentPickerOpened;
        if (!split.method) {
          if (paymentSplits.length > 1) removePaymentSplit(split.id);
          requestAnimationFrame(() => focus(firstBill ?? narration ?? save));
        } else {
          openSelect(paymentSplitLedgerRefs.current.get(split.id));
        }
      }
      return;
    }

    const ledgerIndex = paymentSplits.findIndex((split) => paymentSplitLedgerRefs.current.get(split.id) === current);
    if (ledgerIndex >= 0) {
      const split = paymentSplits[ledgerIndex]!;
      event.preventDefault();
      if (backward) {
        focus(paymentSplitMethodRefs.current.get(split.id));
      } else if (event.key === "Enter" && current instanceof HTMLSelectElement && current.dataset.paymentPickerOpened !== "true") {
        openSelect(current);
      } else {
        if (current instanceof HTMLSelectElement) delete current.dataset.paymentPickerOpened;
        if (split.ledgerId) focus(paymentSplitAmountRefs.current.get(split.id));
        else openSelect(current as HTMLSelectElement);
      }
      return;
    }

    const amountIndex = paymentSplits.findIndex((split) => paymentSplitAmountRefs.current.get(split.id) === current);
    if (amountIndex >= 0) {
      const split = paymentSplits[amountIndex]!;
      event.preventDefault();
      if (backward) {
        focus(paymentSplitLedgerRefs.current.get(split.id));
      } else if (Number(split.amount || 0) > 0) {
        focus(paymentSplitReferenceRefs.current.get(split.id));
      }
      return;
    }

    const referenceIndex = paymentSplits.findIndex((split) => paymentSplitReferenceRefs.current.get(split.id) === current);
    if (referenceIndex >= 0) {
      const split = paymentSplits[referenceIndex]!;
      if (backward && current instanceof HTMLInputElement && current.value === "") {
        event.preventDefault();
        focus(paymentSplitAmountRefs.current.get(split.id));
      } else if (forward) {
        event.preventDefault();
        const next = paymentSplits[referenceIndex + 1];
        if (next) focus(paymentSplitMethodRefs.current.get(next.id));
        else appendPaymentSplit();
      }
      return;
    }

    if (current instanceof HTMLInputElement && current.dataset.paymentOutBillIndex !== undefined) {
      const billIndex = Number(current.dataset.paymentOutBillIndex);
      event.preventDefault();
      if (backward) {
        const previous = root.querySelector<HTMLInputElement>(`[data-payment-out-bill-index="${billIndex - 1}"]`);
        if (previous) focus(previous);
        else focus(paymentSplitMethodRefs.current.get(paymentSplits[paymentSplits.length - 1]?.id ?? ""));
      } else {
        const next = root.querySelector<HTMLInputElement>(`[data-payment-out-bill-index="${billIndex + 1}"]`);
        focus(next ?? narration ?? save);
      }
      return;
    }

    if (current === narration && forward) {
      event.preventDefault();
      focus(save);
    } else if (current === narration && backward) {
      event.preventDefault();
      const billInputs = root.querySelectorAll<HTMLInputElement>('[data-payment-out-bill-index]');
      focus(billInputs.item(billInputs.length - 1) || paymentSplitMethodRefs.current.get(paymentSplits[paymentSplits.length - 1]?.id ?? ""));
    }
  }

  function restorePaymentSplitsFromVoucher(voucher: VoucherRecord, idPrefix: string) {
    return voucher.lines
      .filter((line) => Number(isCustomerReceiptMode ? line.debit : line.credit || 0) > 0 && Boolean(line.moneyAccountType || line.accountId))
      .map((line, index) => {
        const match = (line.description?.trim() ?? "").match(isCustomerReceiptMode ? /^(.+?) receipt(?:\s+\((.*)\))?$/i : /^(.+?) payment(?:\s+\((.*)\))?$/i);
        const parsedMethod = match?.[1]?.trim() ?? "";
        const method = paymentOutMethodOptionsForVoucher.includes(parsedMethod as PaymentOutMethod)
          ? (parsedMethod as PaymentOutMethod)
          : line.moneyAccountType === "MFS"
            ? "MFS"
            : line.moneyAccountType === "CASH" || line.ledger.toLowerCase().includes("cash")
              ? "Cash"
              : "Bank Transfer";
        return {
          id: `${idPrefix}-${index}`,
          method,
          amount: String(Number(isCustomerReceiptMode ? line.debit : line.credit || 0)),
          ledgerId: line.accountId || "",
          ledgerName: line.ledger,
          reference: match?.[2]?.trim() || "",
        } satisfies PaymentSplit;
      });
  }

  function restorePurchaseReturnSplitsFromVoucher(voucher: VoucherRecord, idPrefix: string) {
    return voucher.lines
      .filter((line) => Number(isSalesReturnMode ? line.credit : line.debit || 0) > 0 && Boolean(line.moneyAccountType || line.accountId))
      .map((line, index) => {
        const match = (line.description?.trim() ?? "").match(/^(.+?) refund(?:\s+\((.*)\))?$/i);
        const parsedMethod = match?.[1]?.trim() ?? "";
        const method = paymentOutMethodOptionsForVoucher.includes(parsedMethod as PaymentOutMethod)
          ? (parsedMethod as PaymentOutMethod)
          : line.moneyAccountType === "MFS"
            ? "MFS"
            : line.moneyAccountType === "CASH" || line.ledger.toLowerCase().includes("cash")
              ? "Cash"
              : "Bank Transfer";
        return {
          id: `${idPrefix}-${index}`,
          method,
          amount: String(Number(isSalesReturnMode ? line.credit : line.debit || 0)),
          ledgerId: line.accountId || "",
          ledgerName: line.ledger,
          reference: match?.[2]?.trim() || "",
        } satisfies PaymentSplit;
      });
  }

  function restoreExpensePaymentSplitsFromVoucher(voucher: VoucherRecord, idPrefix: string) {
    return voucher.lines
      .filter((line) => {
        const description = line.description?.trim() ?? "";
        return Number(line.credit || 0) > 0
          && !/^Expense payable settlement$/i.test(description)
          && Boolean(line.moneyAccountType || line.accountId || /cash|bank|mfs|bkash|nagad|rocket/i.test(line.ledger));
      })
      .map((line, index) => {
        const match = (line.description?.trim() ?? "").match(/^(.+?) expense payment(?:\s+\((.*)\))?$/i);
        const parsedMethod = match?.[1]?.trim() ?? "";
        const method = paymentOutMethodOptionsForVoucher.includes(parsedMethod as PaymentOutMethod)
          ? (parsedMethod as PaymentOutMethod)
          : line.moneyAccountType === "MFS"
            ? "MFS"
            : line.moneyAccountType === "CASH" || line.ledger.toLowerCase().includes("cash")
              ? "Cash"
              : "Bank Transfer";
        return {
          id: `${idPrefix}-${index}`,
          method,
          amount: String(Number(line.credit || 0)),
          ledgerId: line.accountId || "",
          ledgerName: line.ledger,
          reference: match?.[2]?.trim() || "",
        } satisfies PaymentSplit;
      });
  }

  function restoreRevenueReceiptSplitsFromVoucher(voucher: VoucherRecord, idPrefix: string) {
    return voucher.lines
      .filter(
        (line) =>
          Number(line.debit || 0) > 0 &&
          Boolean(line.moneyAccountType || line.accountId || /cash|bank|mfs|bkash|nagad|rocket/i.test(line.ledger)),
      )
      .map((line, index) => {
        const match = (line.description?.trim() ?? "").match(/^(.+?) revenue receipt(?:\s+\((.*)\))?$/i);
        const parsedMethod = match?.[1]?.trim() ?? "";
        const method = paymentOutMethodOptionsForVoucher.includes(parsedMethod as PaymentOutMethod)
          ? (parsedMethod as PaymentOutMethod)
          : line.moneyAccountType === "MFS"
            ? "MFS"
            : line.moneyAccountType === "CASH" || line.ledger.toLowerCase().includes("cash")
              ? "Cash"
              : "Bank Transfer";
        return {
          id: `${idPrefix}-${index}`,
          method,
          amount: String(Number(line.debit || 0)),
          ledgerId: line.accountId || "",
          ledgerName: line.ledger,
          reference: match?.[2]?.trim() || "",
        } satisfies PaymentSplit;
      });
  }

  useEffect(() => {
    // Sales Order shares the sales-invoice component, so classicSalesInvoiceMode is
    // also true here.  Its payment selector, however, is the order-level
    // Credit/Advance selector (purchaseOrderPaymentType), not settlementMode.
    // Reading settlementMode made a visible Cash advance total zero until reload.
    const orderWorkflowUsesCreditSelector =
      (voucherType === "purchase" && workflow === "purchase-order") ||
      (voucherType === "sales" && workflow === "sale-order");
    const splitPaymentIsCredit = orderWorkflowUsesCreditSelector
      ? purchaseOrderPaymentType === "Credit"
      : classicSalesInvoiceMode
        ? watchedSettlementMode === "accounts-payable"
        : purchaseOrderPaymentType === "Credit";
    const total = ((voucherType === "purchase" && (workflow === "purchase-order" || classicPurchaseMode)) || classicSalesInvoiceMode || classicDebitNoteMode || classicExpenseMode || classicRevenueMode) && splitPaymentIsCredit
      ? 0
      : paymentSplitTotal;
    setPaymentAmount(total > 0 ? String(total) : "");
    if ((voucherType === "purchase" && (workflow === "purchase-order" || classicPurchaseMode)) || (voucherType === "sales" && workflow === "sale-order")) {
      form.setValue("paidAmount", total, { shouldDirty: total > 0, shouldTouch: false });
    }
  }, [classicDebitNoteMode, classicExpenseMode, classicPurchaseMode, classicRevenueMode, classicSalesInvoiceMode, form, paymentSplitTotal, purchaseOrderPaymentType, voucherType, watchedSettlementMode, workflow]);

  // A paid expense or received revenue starts with one settlement row. Keep it
  // equal to the voucher total automatically; once the operator adds more
  // methods, individual splits remain manual and save-time equality protects it.
  useEffect(() => {
    if ((!classicExpenseMode && !classicRevenueMode) || purchaseOrderPaymentType === "Credit" || paymentSplits.length !== 1) {
      return;
    }

    const syncedAmount = invoiceNetTotal > 0 ? String(invoiceNetTotal) : "";
    setPaymentSplits((current) => {
      if (current.length !== 1 || current[0]?.amount === syncedAmount) {
        return current;
      }
      return [{ ...current[0], amount: syncedAmount }];
    });
  }, [classicExpenseMode, classicRevenueMode, invoiceNetTotal, paymentSplits.length, purchaseOrderPaymentType]);

  /** The system voucher number, the operator's manual reference, and an applied
   * bill's reference are separate values and must remain separate when posting. */
  function buildPaymentVoucherPayload(
    ownReference: string,
    billReference: string,
    amount: number,
    narrationText: string,
    voucherNumber?: string,
    billAllocations?: Array<{ reference: string; applied: string }>,
    linkedSourceVoucherId?: string,
  ) {
    const values = form.getValues();
    const partyName = values.partyName.trim();
    const selectedParty = partyOptions.find(
      (party) => normalizeLookupValue(party.name) === normalizeLookupValue(partyName),
    );
    const validSplits = paymentSplits.filter(
      (split): split is PaymentSplit & { method: PaymentOutMethod } => Boolean(split.method) && Number(split.amount || 0) > 0,
    );
    if (isCustomerReceiptMode) {
      const debitLines = validSplits.map((split, index) => ({
        id: `line-receipt-${split.id}-${index}`,
        accountId: split.ledgerId || undefined,
        moneyAccountType: split.method === "Cash" ? "CASH" as const : split.method === "MFS" ? "MFS" as const : "BANK" as const,
        ledger: split.ledgerName || paymentLedger(split.method),
        description: `${split.method} receipt${split.reference.trim() ? ` (${split.reference.trim()})` : ""}`,
        debit: Number(split.amount || 0),
        credit: 0,
        costCenter: split.method === "Cash" ? "Cash-in-Hand" : "Bank Accounts",
        project: "Trading",
        billReference,
      }));
      const allocatedCreditLines = (billAllocations ?? []).filter((allocation) => Number(allocation.applied || 0) > 0).map((allocation, index) => ({
        id: `line-receipt-invoice-${index}`,
        ledger: partyName,
        description: `Receipt from ${partyName} against ${allocation.reference}`,
        debit: 0,
        credit: roundCurrencyAmount(Number(allocation.applied || 0)),
        costCenter: "Head Office",
        project: "Trading",
        billReference: allocation.reference,
      }));
      const allocatedTotal = sumMoney(allocatedCreditLines.map((line) => line.credit));
      const advanceAmount = Math.max(0, roundCurrencyAmount(amount - allocatedTotal));
      const creditLines = allocatedCreditLines.length ? [
        ...allocatedCreditLines,
        ...(moneyToMinorUnits(advanceAmount) > 0 ? [{ id: "line-receipt-advance", ledger: partyName, description: `Advance receipt from ${partyName}`, debit: 0, credit: advanceAmount, costCenter: "Head Office", project: "Trading", billReference: "" }] : []),
      ] : [{ id: "line-receipt-main", ledger: partyName, description: `Receipt from ${partyName}`, debit: 0, credit: amount, costCenter: "Head Office", project: "Trading", billReference }];
      return {
        workspaceId: session!.workspaceId,
        voucherType: "receipt" as const,
        sourceVoucherId: linkedSourceVoucherId,
        voucherNumber,
        voucherDate: values.voucherDate,
        partyName,
        partyId: selectedParty?.id,
        reference: ownReference,
        narration: narrationText,
        status: "posted" as const,
        settlementMode: validSplits.length === 1 && validSplits[0]?.method === "Cash" ? ("cash" as const) : ("bank" as const),
        supplierAddress: "", condition: "", buyerSignature: "", sellerSignature: "",
        discountType: "fixed" as const, discountAmount: 0, subtotal: amount, totalAmount: amount,
        lines: [...debitLines, ...creditLines],
      };
    }
    const creditLines = validSplits.map((split, index) => {
      return {
        id: `line-payment-${split.id}-${index}`,
        accountId: split.ledgerId || undefined,
        moneyAccountType: split.method === "Cash" ? "CASH" as const : split.method === "MFS" ? "MFS" as const : "BANK" as const,
        ledger: split.ledgerName || paymentLedger(split.method),
        description: `${split.method} payment${split.reference.trim() ? ` (${split.reference.trim()})` : ""}`,
        debit: 0,
        credit: Number(split.amount || 0),
        // Report grouping follows the accounting nature of the selected source
        // ledger; the ledger name/accountId still identifies the exact account.
        costCenter: split.method === "Cash" ? "Cash-in-Hand" : "Bank Accounts",
        project: "Trading",
        billReference,
      };
    });
    const allocatedDebitLines = (billAllocations ?? [])
      .filter((allocation) => Number(allocation.applied || 0) > 0)
      .map((allocation, index) => ({
        id: `line-payment-bill-${index}`,
        ledger: partyName,
        description: `Payment to ${partyName} against ${allocation.reference}`,
        debit: Number(allocation.applied || 0),
        credit: 0,
        costCenter: "Head Office",
        project: "Trading",
        billReference: allocation.reference,
      }));
    const allocatedDebitTotal = sumMoney(allocatedDebitLines.map((line) => line.debit));
    const unallocatedAmount = Math.max(0, roundCurrencyAmount(amount - allocatedDebitTotal));
    const debitLines = allocatedDebitLines.length
      ? [
          ...allocatedDebitLines,
          ...(unallocatedAmount > 0 ? [{
            id: "line-payment-advance",
            ledger: partyName,
            description: `Advance payment to ${partyName}`,
            debit: unallocatedAmount,
            credit: 0,
            costCenter: "Head Office",
            project: "Trading",
            billReference: "",
          }] : []),
        ]
      : [{
          id: "line-payment-main",
          ledger: partyName,
          description: `Payment to ${partyName}`,
          debit: amount,
          credit: 0,
          costCenter: "Head Office",
          project: "Trading",
          billReference,
        }];

    return {
      workspaceId: session!.workspaceId,
      voucherType: "payment" as const,
      sourceVoucherId: linkedSourceVoucherId,
      voucherNumber,
      voucherDate: values.voucherDate,
      partyName,
      partyId: selectedParty?.id,
      reference: ownReference,
      narration: narrationText,
      status: "posted" as const,
      settlementMode: validSplits.length === 1 && validSplits[0]?.method === "Cash" ? ("cash" as const) : ("accounts-payable" as const),
      supplierAddress: "",
      condition: "",
      buyerSignature: "",
      sellerSignature: "",
      discountType: "fixed" as const,
      discountAmount: 0,
      subtotal: amount,
      totalAmount: amount,
      lines: [...debitLines, ...creditLines],
    };
  }

  async function handleSavePaymentOut() {
    if (!session?.workspaceId) {
      return;
    }

    const values = form.getValues();
    const partyName = values.partyName.trim();
    const amount = roundCurrencyAmount(Number(paymentAmount || 0));

    if (!partyName) {
      toast.error("Party is required");
      return;
    }

    if (!values.voucherDate) {
      toast.error("Date is required");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Paid amount must be greater than zero");
      return;
    }

    const allocatedRows = paymentAllocations.filter((row) => moneyToMinorUnits(Number(row.applied || 0)) > 0);
    const allocatedTotal = sumMoney(allocatedRows.map((row) => Number(row.applied || 0)));

    if (moneyToMinorUnits(allocatedTotal) > moneyToMinorUnits(amount)) {
      toast.error(`The amount applied to ${isCustomerReceiptMode ? "invoices" : "bills"} can't exceed the amount ${isCustomerReceiptMode ? "received" : "paid"}`);
      return;
    }

    const overAppliedRow = allocatedRows.find(
      (row) => moneyToMinorUnits(Number(row.applied || 0)) > moneyToMinorUnits(row.balance),
    );
    if (overAppliedRow) {
      toast.error(`The amount applied to ${overAppliedRow.reference} can't exceed its balance due`);
      return;
    }

    const enteredSplits = paymentSplits.filter((split) => Boolean(split.method || split.amount.trim() || split.reference.trim()));
    const invalidSplit = enteredSplits.find(
      (split) => !split.method || moneyToMinorUnits(Number(split.amount || 0)) <= 0,
    );
    if (invalidSplit) {
      toast.error(`Every ${isCustomerReceiptMode ? "receipt" : "payment"} row must have an amount greater than zero`);
      return;
    }
    if (mode === "api" && enteredSplits.some((split) => !split.ledgerId || !split.ledgerName)) {
      toast.error("Select an account ledger for every payment row");
      return;
    }
    const missingReference = enteredSplits.find((split) => split.method && split.method !== "Cash" && !split.reference.trim());
    if (missingReference) {
      toast.error(`${missingReference.method} reference is required`);
      return;
    }
    const mismatch = getPaymentAllocationMismatch(amount, allocatedTotal, billsForPaymentTable.length > 0);
    const mismatchSignature = mismatch
      ? [
          normalizeLookupValue(partyName),
          roundCurrencyAmount(amount).toFixed(2),
          ...allocatedRows
            .map((row) => `${row.sourceId}:${roundCurrencyAmount(row.applied || 0).toFixed(2)}`)
            .sort(),
        ].join("|")
      : null;
    if (mismatch && mismatchSignature && acknowledgedPaymentMismatch !== mismatchSignature) {
      setPaymentMismatchWarning({ ...mismatch, signature: mismatchSignature });
      return;
    }
    const ownReference = paymentSplits.map((split) => split.reference.trim()).filter(Boolean).join(" | ") || "Cash";
    const fallbackNarration = values.narration.trim() || `${paymentMethod} payment for ${partyName}`;

    setPaymentSaving(true);
    try {
      if (editingVoucherId) {
        await updateVoucher(
          mode,
          editingVoucherId,
          buildPaymentVoucherPayload(ownReference, "", amount, fallbackNarration, loadedVoucher?.voucherNumber, allocatedRows),
        );
      } else if (!allocatedRows.length) {
        // No outstanding bills to apply against (or the party has none) — an
        // ordinary, unlinked payment.
        await createVoucher(mode, buildPaymentVoucherPayload(ownReference, "", amount, fallbackNarration, paymentVoucherNumber));
      } else {
        const advanceVoucher = await createVoucher(
          mode,
          buildPaymentVoucherPayload(
            ownReference,
            "",
            amount,
            values.narration.trim() || `${paymentMethod} payment for ${partyName}`,
            paymentVoucherNumber,
            allocatedRows,
            isCustomerReceiptMode && allocatedRows.length === 1 ? allocatedRows[0]?.sourceId : undefined,
          ),
        );
        if (advanceVoucher.status !== "posted") {
          throw new Error(`Purchase Order saved, but its advance payment is still ${advanceVoucher.status}. Post it from Payments.`);
        }
      }

      await queryClient.invalidateQueries({ queryKey: [mode] });
      toast.success(editingVoucherId ? `${isCustomerReceiptMode ? "Customer Receipt" : "Payment-Out"} updated` : `${isCustomerReceiptMode ? "Customer Receipt" : "Payment-Out"} saved`);
      startTransition(() => router.push(documentListRoute ?? buildWorkspaceRoute(mode, "/purchase/payment-out")));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${isCustomerReceiptMode ? "Customer Receipt" : "Payment-Out"} could not be saved`);
    } finally {
      setPaymentSaving(false);
    }
  }

  /** Recomputes the whole bill from whatever set of receipt notes is currently
   * picked — combined reference text, combined line items, and the primary link
   * (the schema only allows one `sourceVoucherId`, so the earliest-dated receipt
   * note carries it; the rest still show up in the reference text and item list). */
  function applyMultiReceiptNoteSelection(selected: VoucherRecord[]) {
    if (!selected.length) {
      setSourceDocumentReference(null);
      setLinkedBillId(null);
      setLoadedVoucher(null);
      return;
    }

    const ordered = [...selected].sort((left, right) => (left.voucherDate < right.voucherDate ? -1 : 1));
    const combinedReference = ordered.map((entry) => entry.reference?.trim() || entry.voucherNumber).join(" + ");
    setSourceDocumentReference(combinedReference);
    setLinkedBillId(ordered[0].id);
    setLoadedVoucher(ordered[0]);
    form.setValue("partyName", ordered[0].partyName, { shouldDirty: true, shouldTouch: true });
    if (!classicDebitNoteMode) {
      form.setValue("voucherDate", ordered[0].voucherDate, { shouldDirty: true, shouldTouch: true });
      // Goods ordered for cash are still billed against cash, not silently turned
      // into a customer/supplier due — same rule mapSourceVoucherToPrefill applies
      // when the whole form is prefilled from a single source document.
      if (ordered[0].settlementMode) {
        form.setValue("settlementMode", ordered[0].settlementMode, { shouldDirty: true, shouldTouch: true });
      }
    }

    // The same item showing up on several receipt notes (e.g. three partial
    // Keep every Receipt Note line separate. The source-line link is required
    // to preserve its exact acquisition cost through billing and later returns.
    const nextItems = ordered.flatMap((entry) => (entry.inventoryItems ?? []).map((item) => ({
      sourceInventoryLineId: item.id,
      manufacturingInventoryLotId: item.manufacturingInventoryLotId ?? undefined,
      manufacturingSerialIds: item.manufacturingSerialIds ?? [],
      warehouseId: item.warehouseId ?? entry.warehouseId ?? "",
      itemName: item.itemName,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    }))).map((item, index) => ({
        id: `invoice-item-${index + 1}`,
        sourceInventoryLineId: item.sourceInventoryLineId,
        manufacturingInventoryLotId: item.manufacturingInventoryLotId,
        manufacturingSerialIds: item.manufacturingSerialIds,
        warehouseId: item.warehouseId,
        warehouseSelectionOrigin: "source" as const,
        itemName: item.itemName,
        unit: findInventoryOption(item.itemName)?.unit ?? "",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));
    invoiceItems.replace(nextItems);
    seedReceiptCommittedProducts(nextItems);
  }

  /** Tally-style reference picking: choosing one adds it and the list re-opens
   * showing what's left, so the next reference can be picked right away without
   * reopening the dropdown — repeat until "End of List" is picked to stop. */
  function addReceiptNoteSelection(bill: VoucherRecord) {
    const next = [...selectedReceiptNotes, bill];
    setSelectedReceiptNotes(next);
    applyMultiReceiptNoteSelection(next);
    setBillPickerQuery("");
    setBillPickerHighlightIndex(0);
  }

  function removeReceiptNoteSelection(bill: VoucherRecord) {
    const next = selectedReceiptNotes.filter((entry) => entry.id !== bill.id);
    setSelectedReceiptNotes(next);
    applyMultiReceiptNoteSelection(next);
  }

  function applyBillSelection(bill: VoucherRecord) {
    setLinkedBillId(bill.id);
    setSourceDocumentReference(bill.reference?.trim() || bill.voucherNumber);
    setLoadedVoucher(bill);
    form.setValue("partyName", bill.partyName, { shouldDirty: true, shouldTouch: true });
    if (bill.inventoryItems?.length) {
      const liveSalesReturns = isSalesReturnMode
        ? historyVouchers.filter(
            (entry) =>
              entry.voucherType === "credit-note" &&
              entry.sourceVoucherId === bill.id &&
              !["cancelled", "reversed"].includes(entry.status),
          )
        : [];
      const nextItems = bill.inventoryItems.map((item, index) => ({
          id: `invoice-item-${index + 1}`,
          sourceInventoryLineId: item.id,
          manufacturingInventoryLotId: item.manufacturingInventoryLotId ?? undefined,
          manufacturingSerialIds: isSalesReturnMode
            ? (item.manufacturingSerialIds ?? []).filter(
                (serialId) => !liveSalesReturns.some((salesReturn) =>
                  (salesReturn.inventoryItems ?? []).some(
                    (returnItem) =>
                      returnItem.sourceInventoryLineId === item.id &&
                      (returnItem.manufacturingSerialIds ?? []).includes(serialId),
                  ),
                ),
              )
            : item.manufacturingSerialIds ?? [],
          warehouseId: item.warehouseId ?? bill.warehouseId ?? form.getValues("warehouseId"),
          warehouseSnapshot: item.warehouse ?? undefined,
          warehouseSelectionOrigin: "source" as const,
          itemName: item.itemName,
          unit: findInventoryOption(item.itemName)?.unit ?? "",
          quantity: isSalesReturnMode
            ? Math.max(
                0,
                Number(item.quantity || 0) - liveSalesReturns.reduce(
                  (total, salesReturn) =>
                    total + (salesReturn.inventoryItems ?? [])
                      .filter((returnItem) => returnItem.sourceInventoryLineId === item.id)
                      .reduce((sum, returnItem) => sum + Number(returnItem.quantity || 0), 0),
                  0,
                ),
              )
            : Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
        }));
      invoiceItems.replace(nextItems);
      seedReceiptCommittedProducts(nextItems);
      if (classicDebitNoteMode) {
        const billGross = bill.inventoryItems.reduce(
          (total, item) => total + Number(item.quantity || 0) * Number(item.unitPrice || 0),
          0,
        );
        const discountPercent = billGross > 0
          ? Math.max(0, (1 - Number(bill.amount || 0) / billGross) * 100)
          : 0;
        form.setValue("discountType", "percent", { shouldDirty: true });
        form.setValue("discount", Number(discountPercent.toFixed(6)), { shouldDirty: true });
      }
    }
    setBillPickerOpen(false);
    setBillPickerQuery("");
    setBillPickerHighlightIndex(-1);
    if (classicDebitNoteMode) {
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-purchase-return-next-field='true']")?.focus());
    }
  }

  function renderBillReferencePicker(presentation: "line" | "field" = "line") {
    const disabled = !watchedPartyName.trim();
    const emptyMessage = disabled
      ? `Select a ${partyRoleLabel.toLowerCase()} first`
      : classicDebitNoteMode
        ? isSalesReturnMode
          ? "No posted sales invoices found for this customer"
          : "No purchase bills found for this supplier"
        : classicSalesInvoiceMode
          ? "No delivery notes found for this customer"
          : "No receipt notes found for this supplier";
    const searchPlaceholder = classicDebitNoteMode
      ? isSalesReturnMode ? "Search invoice no." : "Search bill no."
      : classicSalesInvoiceMode ? "Search delivery note no." : "Search receipt note no.";
    // A plain bill can combine several receipt notes into one posting — a Sales
    // Bill does the same with Delivery Notes. That picker follows Tally's own
    // reference-selection convention: pick one (arrow keys + Enter, or a click)
    // and the list stays open showing what's left, so the next one can be picked
    // right away; "End of List" pinned at the top stops the loop. A debit note
    // returns against exactly one bill, so that picker keeps the original
    // single-pick-and-close behaviour.
    const multiSelect = classicPurchaseMode || classicSalesInvoiceMode;
    const buttonPlaceholder = disabled
      ? `Select ${partyRoleLabel.toLowerCase()} first`
      : classicDebitNoteMode
        ? "Select bill"
        : classicSalesInvoiceMode
          ? "Select delivery note(s)"
          : "Select receipt note(s)";
    const pickerOptionCount = multiSelect ? returnableBills.length + 1 : returnableBills.length;

    return (
      <div ref={billPickerRef} className="relative">
        <button
          type="button"
          data-purchase-bill-reference={classicPurchaseMode || classicSalesInvoiceMode ? "true" : undefined}
          tabIndex={classicPurchaseMode ? 3 : classicSalesInvoiceMode ? 4 : classicDebitNoteMode ? 4 : undefined}
          data-purchase-return-bill-number={classicDebitNoteMode ? "true" : undefined}
          disabled={disabled}
          className={cn(
            "flex w-full items-center gap-1.5 bg-white text-sm outline-none disabled:cursor-not-allowed disabled:text-[#b7c1cf]",
            presentation === "field"
              ? "h-11 justify-between rounded-[6px] border border-[#cfd9e8] px-3 text-left"
              : "h-10 justify-end border-0 border-b border-[#cfd9e8] px-0 text-right",
            sourceDocumentReference ? "text-[#1f2f46]" : "text-[#0f6cf6]",
          )}
          onMouseDown={() => {
            billPickerFocusedByKeyboardRef.current = false;
          }}
          onFocus={() => {
            if (billPickerFocusedByKeyboardRef.current) {
              // Tab landed here — open straight away so Up/Down can drive the whole
              // pick immediately, no click needed.
              setBillPickerOpen(true);
              setBillPickerHighlightIndex(-1);
            }

            billPickerFocusedByKeyboardRef.current = true;
          }}
          onClick={() => {
            setBillPickerOpen((current) => !current);
            setBillPickerHighlightIndex(-1);
          }}
          onKeyDown={(event) => {
            if (!isPickerNavigationKey(event.key)) {
              return;
            }

            const navigationKey = event.key;
            event.preventDefault();
            setBillPickerOpen(true);
            setBillPickerHighlightIndex((current) => getNextPickerIndex(current, pickerOptionCount, navigationKey));
          }}
          aria-expanded={billPickerOpen}
          aria-required={requiresReceiptNoteSource || requiresDeliveryNoteSource || classicDebitNoteMode}
        >
          <span className="min-w-0 flex-1 truncate">{sourceDocumentReference ?? buttonPlaceholder}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#7c8a9b] transition-transform", billPickerOpen ? "rotate-180" : "")} />
        </button>
        {billPickerOpen ? (
          <div className={cn(
            "absolute top-[calc(100%+6px)] z-40 overflow-hidden rounded-[6px] border border-[#cfdcf0] bg-white text-left shadow-[0_16px_38px_rgba(15,23,42,0.12)]",
            presentation === "field" ? "left-0 right-0 min-w-[320px]" : "right-0 w-[320px]",
          )}>
            {multiSelect && selectedReceiptNotes.length ? (
              <div className="flex flex-wrap gap-1.5 border-b border-[#edf2f7] bg-[#f8fbff] p-2">
                {selectedReceiptNotes.map((entry) => (
                  <span key={entry.id} className="inline-flex items-center gap-1 rounded-full bg-[#eaf3ff] py-1 pl-2.5 pr-1.5 text-xs font-medium text-[#1455a0]">
                    {entry.reference?.trim() || entry.voucherNumber}
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[#1455a0] transition hover:bg-[#d3e6ff]"
                      onClick={() => removeReceiptNoteSelection(entry)}
                      aria-label={`Remove ${entry.reference?.trim() || entry.voucherNumber}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="border-b border-[#edf2f7] p-2">
              <Input
                autoFocus
                value={billPickerQuery}
                onChange={(event) => {
                  setBillPickerQuery(event.target.value);
                  setBillPickerHighlightIndex(-1);
                }}
                onKeyDown={(event) => {
                  if (isPickerNavigationKey(event.key)) {
                    const navigationKey = event.key;
                    event.preventDefault();
                    setBillPickerHighlightIndex((current) => getNextPickerIndex(current, pickerOptionCount, navigationKey));
                    return;
                  }

                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (multiSelect) {
                      const highlighted = billPickerHighlightIndex >= 0 ? billPickerHighlightIndex : 0;
                      if (highlighted === 0) {
                        setBillPickerOpen(false);
                        setBillPickerHighlightIndex(-1);
                        requestAnimationFrame(() => document.querySelector<HTMLElement>(classicDebitNoteMode ? "[data-purchase-return-next-field='true']" : "input[data-voucher-item-row='0']")?.focus());
                      } else if (returnableBills[highlighted - 1]) {
                        addReceiptNoteSelection(returnableBills[highlighted - 1]);
                      }
                    } else if (returnableBills.length) {
                      applyBillSelection(returnableBills[billPickerHighlightIndex >= 0 ? billPickerHighlightIndex : 0]);
                    }
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setBillPickerOpen(false);
                    setBillPickerHighlightIndex(-1);
                  }
                }}
                placeholder={searchPlaceholder}
                className="h-9 rounded-[4px] border-[#cfd9e8] text-sm"
              />
            </div>
            <div ref={billPickerListRef} className="max-h-64 overflow-auto py-1" role={multiSelect ? "menu" : "listbox"}>
              {multiSelect ? (
                <button
                  type="button"
                  role="menuitem"
                  data-picker-option-index={0}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-[#edf2f7] px-3 py-2 text-left text-sm font-semibold text-[#b3261e] transition hover:bg-[#fdeceb]",
                    billPickerHighlightIndex === 0 ? "bg-[#fdeceb] ring-1 ring-inset ring-[#f3b4ad]" : "",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setBillPickerHighlightIndex(0)}
                  onClick={() => {
                    setBillPickerOpen(false);
                    setBillPickerHighlightIndex(-1);
                    requestAnimationFrame(() => document.querySelector<HTMLElement>(classicDebitNoteMode ? "[data-purchase-return-next-field='true']" : "input[data-voucher-item-row='0']")?.focus());
                  }}
                >
                  End of List
                </button>
              ) : null}
              {returnableBills.length ? (
                returnableBills.map((bill, listIndex) => {
                  const optionIndex = multiSelect ? listIndex + 1 : listIndex;
                  return (
                    <button
                      key={bill.id}
                      type="button"
                      role={multiSelect ? "menuitem" : "option"}
                      aria-selected={optionIndex === billPickerHighlightIndex}
                      data-picker-option-index={optionIndex}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition hover:bg-[#f4f8ff]",
                        optionIndex === billPickerHighlightIndex ? "bg-[#eaf3ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setBillPickerHighlightIndex(optionIndex)}
                      onClick={() => (multiSelect ? addReceiptNoteSelection(bill) : applyBillSelection(bill))}
                    >
                      <span className="font-medium text-[#1f2f46]">{bill.reference?.trim() || bill.voucherNumber}</span>
                      <span className="text-xs text-[#6f7d91]">
                        {formatDate(bill.voucherDate)} · {formatCurrency(bill.amount)}
                      </span>
                      {bill.inventoryItems?.length ? (
                        <span className="text-xs text-[#4a5b78]">
                          {bill.inventoryItems
                            .slice(0, 2)
                            .map((item) => `${item.itemName} × ${formatNumber(Number(item.quantity || 0))} @ ${formatCurrency(Number(item.unitPrice || 0))}`)
                            .join(", ")}
                          {bill.inventoryItems.length > 2 ? ` +${bill.inventoryItems.length - 2} more` : ""}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              ) : !multiSelect ? (
                <div className="px-3 py-4 text-center text-sm text-[#8994a6]">{emptyMessage}</div>
              ) : selectedReceiptNotes.length ? (
                <div className="px-3 py-4 text-center text-sm text-[#8994a6]">All available {classicDebitNoteMode ? "purchase bills" : "receipt notes"} are picked.</div>
              ) : (
                <div className="px-3 py-4 text-center text-sm text-[#8994a6]">{emptyMessage}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function handleClosePageEntry() {
    if (displayMode === "dialog") {
      onClose?.();
      return;
    }

    if (pageCloseRoute) {
      router.replace(pageCloseRoute, { scroll: false });
    }
  }

  function handlePurchaseBillKeyboardFlow(event: ReactKeyboardEvent<HTMLFormElement>) {
    const isForwardKey = event.key === "Enter" || event.key === "Tab";
    if ((!classicPurchaseMode && !classicDebitNoteMode && !classicSalesInvoiceMode) || !isForwardKey || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const formElement = event.currentTarget;

    if ((classicPurchaseMode || classicSalesInvoiceMode) && target instanceof HTMLSelectElement && target.dataset.purchaseBillPaymentType === "true") {
      event.preventDefault();
      if (event.key === "Enter" && target.dataset.poPickerOpened !== "true") {
        target.dataset.poPickerOpened = "true";
        try {
          if (typeof target.showPicker === "function") target.showPicker();
          else target.click();
        } catch {
          delete target.dataset.poPickerOpened;
        }
        return;
      }
      delete target.dataset.poPickerOpened;
      if (target.value === "Advance" || target.value === "cash-bank-mfs") {
        const firstSplit = paymentSplits[0];
        requestAnimationFrame(() => paymentSplitMethodRefs.current.get(firstSplit?.id ?? "")?.focus());
      }
      return;
    }

    if (classicDebitNoteMode) {
      if (target instanceof HTMLInputElement && target.dataset.purchaseReturnDate === "true") {
        event.preventDefault();
        formElement.querySelector<HTMLInputElement>("input[name='partyName']")?.focus();
        return;
      }
      if (target instanceof HTMLInputElement && target.name === "partyName" && matchedParty) {
        event.preventDefault();
        formElement.querySelector<HTMLButtonElement>("button[data-purchase-return-bill-number='true']")?.focus();
        return;
      }
      if (target instanceof HTMLSelectElement && target.dataset.purchaseReturnPaymentType === "true") {
        event.preventDefault();
        if (event.key === "Enter" && target.dataset.purchaseReturnPickerOpened !== "true") {
          target.dataset.purchaseReturnPickerOpened = "true";
          try {
            if (typeof target.showPicker === "function") target.showPicker();
            else target.click();
          } catch {
            delete target.dataset.purchaseReturnPickerOpened;
          }
          return;
        }
        delete target.dataset.purchaseReturnPickerOpened;
        if (target.value === "Credit") {
          formElement.querySelector<HTMLInputElement>("input[data-purchase-return-credit-amount='true']")?.focus();
        } else {
          const firstSplit = paymentSplits[0];
          paymentSplitMethodRefs.current.get(firstSplit?.id ?? "")?.focus();
        }
        return;
      }
      if (
        target.dataset.poPaymentMethod !== undefined ||
        target.dataset.poPaymentLedger !== undefined ||
        target.dataset.poPaymentAmount !== undefined ||
        target.dataset.poPaymentReference !== undefined
      ) {
        handlePurchaseOrderKeyboardFlow(event);
        return;
      }
      if (target instanceof HTMLButtonElement && target.dataset.purchaseReturnBillNumber === "true") {
        event.preventDefault();
        setBillPickerOpen(true);
        setBillPickerHighlightIndex(0);
        return;
      }
      if (target instanceof HTMLInputElement && target.dataset.purchaseReturnBillDate === "true") {
        event.preventDefault();
        const firstItem = formElement.querySelector<HTMLInputElement>("input[data-voucher-item-row='0']");
        firstItem?.focus();
        firstItem?.select();
        return;
      }
      if (target.dataset.purchaseReturnNextField === "true") {
        event.preventDefault();
        formElement.querySelector<HTMLInputElement>("input[data-purchase-return-bill-date='true']")?.focus();
        return;
      }
    }

    if (target instanceof HTMLInputElement && target.dataset.purchaseBillDate === "true") {
      event.preventDefault();
      formElement.querySelector<HTMLInputElement>("input[name='partyName']")?.focus();
      return;
    }

    if (target instanceof HTMLInputElement && target.name === "partyName" && matchedParty) {
      event.preventDefault();
      formElement.querySelector<HTMLButtonElement>("button[data-purchase-bill-reference='true']")?.focus();
      return;
    }

    if (target instanceof HTMLButtonElement && target.dataset.purchaseBillReference === "true") {
      event.preventDefault();
      setBillPickerOpen(true);
      setBillPickerHighlightIndex(0);
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.voucherItemRow !== undefined && findInventoryOption(target.value)) {
      event.preventDefault();
      formElement.querySelector<HTMLInputElement>(`input[data-purchase-bill-quantity='${target.dataset.voucherItemRow}']`)?.focus();
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.purchaseBillQuantity !== undefined) {
      event.preventDefault();
      const price = formElement.querySelector<HTMLInputElement>(`input[data-purchase-bill-unit-price='${target.dataset.purchaseBillQuantity}']`);
      price?.focus();
      price?.select();
      return;
    }

    if (target.dataset.purchaseReturnUnit !== undefined) {
      event.preventDefault();
      const price = formElement.querySelector<HTMLInputElement>(`input[data-purchase-bill-unit-price='${target.dataset.purchaseReturnUnit}']`);
      price?.focus();
      price?.select();
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.purchaseBillUnitPrice !== undefined) {
      event.preventDefault();
      const rowIndex = Number(target.dataset.purchaseBillUnitPrice);
      if (classicDebitNoteMode) {
        const warehouse = formElement.querySelector<HTMLInputElement>(`input[data-purchase-return-warehouse-row='${rowIndex}']`);
        warehouse?.focus();
        return;
      }
      const nextItem = formElement.querySelector<HTMLInputElement>(`input[data-voucher-item-row='${rowIndex + 1}']`);
      if (nextItem) {
        nextItem.focus();
        nextItem.select();
        return;
      }

      const paymentType = formElement.querySelector<HTMLSelectElement>("select[data-purchase-bill-payment-type='true']");
      paymentType?.focus();
      if (paymentType) {
        try {
          if (typeof paymentType.showPicker === "function") paymentType.showPicker();
          else paymentType.click();
        } catch {
          paymentType.click();
        }
      }
    }
  }

  useEffect(() => {
    if (!classicPurchaseMode && !classicSalesInvoiceMode) return;
    const handleF2 = (event: KeyboardEvent) => {
      if (event.key !== "F2") return;
      event.preventDefault();
      const dateInput = document.querySelector<HTMLInputElement>("input[data-purchase-bill-date='true']");
      dateInput?.focus();
      dateInput?.select();
    };
    window.addEventListener("keydown", handleF2);
    return () => window.removeEventListener("keydown", handleF2);
  }, [classicPurchaseMode, classicSalesInvoiceMode]);

  useEffect(() => {
    if (!classicPaymentMode) return;
    const focusPaymentDate = (event: KeyboardEvent) => {
      if (event.key !== "F2" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      const dateInput = paymentOutRootRef.current?.querySelector<HTMLInputElement>('input[data-payment-out-date="true"]');
      dateInput?.focus();
      dateInput?.select();
    };
    window.addEventListener("keydown", focusPaymentDate);
    return () => window.removeEventListener("keydown", focusPaymentDate);
  }, [classicPaymentMode]);

  useEffect(() => {
    if (!classicDebitNoteMode) return;
    const focusDate = () => {
      const dateInput = document.querySelector<HTMLInputElement>("input[data-purchase-return-date='true']");
      dateInput?.focus();
      dateInput?.select();
    };
    const frame = requestAnimationFrame(focusDate);
    const handleF2 = (event: KeyboardEvent) => {
      if (event.key !== "F2" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      focusDate();
    };
    window.addEventListener("keydown", handleF2);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleF2);
    };
  }, [classicDebitNoteMode]);

  function handlePurchaseOrderKeyboardFlow(event: ReactKeyboardEvent<HTMLFormElement>) {
    const keyboardForm = event.currentTarget;
    const eventTarget = event.target as HTMLElement;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && eventTarget instanceof HTMLSelectElement) {
      eventTarget.dataset.poPickerOpened = "true";
      return;
    }

    const isEnter = event.key === "Enter";
    const isForward = isEnter || event.key === "Tab";
    const isBackspace = event.key === "Backspace";
    if ((!isForward && !isBackspace) || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const current = eventTarget;
    if (current.tagName === "TEXTAREA" || current.tagName === "BUTTON") {
      return;
    }

    if (isBackspace) {
      if (!((current instanceof HTMLInputElement || current instanceof HTMLSelectElement) && current.value === "")) {
        return;
      }
    }

    const focusAndSelect = (target: HTMLElement | null | undefined) => {
      target?.focus();
      if (target instanceof HTMLInputElement && target.type !== "date" && target.type !== "checkbox") target.select();
    };
    const focusAndOpenSelect = (target: HTMLSelectElement | null | undefined) => {
      if (!target || target.disabled) return false;
      target.focus();
      target.dataset.poPickerOpened = "true";
      try {
        if (typeof target.showPicker === "function") target.showPicker();
        else target.click();
        return true;
      } catch {
        // Some embedded Chromium builds only permit showPicker directly from a
        // fresh key event. The focused field's next Enter handles that fallback.
        delete target.dataset.poPickerOpened;
        return false;
      }
    };
    const firstItem = () => classicDebitNoteMode
      ? keyboardForm.querySelector<HTMLElement>('button[data-purchase-return-bill-number="true"]')
      : keyboardForm.querySelector<HTMLElement>('input[data-po-item-row="0"]');
    const dueDateField = () => keyboardForm.querySelector<HTMLInputElement>('input[data-po-due-date="true"]');
    const partyField = () => keyboardForm.querySelector<HTMLInputElement>('input[data-po-party="true"]');
    const primaryPaymentTypeField = () => keyboardForm.querySelector<HTMLSelectElement>('select[data-po-primary-payment-type="true"]');
    const deliveryNoteItemWarehouseField = (row: number) =>
      keyboardForm.querySelector<HTMLInputElement>(`input[data-delivery-note-item-warehouse="${row}"]`);

    if (isBackspace && current instanceof HTMLInputElement && current.dataset.poItemRow !== undefined) {
      event.preventDefault();
      const rowIndex = Number(current.dataset.poItemRow);
      if (rowIndex > 0) {
        focusAndSelect(
          isDeliveryNoteWorkflow
            ? deliveryNoteItemWarehouseField(rowIndex - 1)
            : keyboardForm.querySelector<HTMLInputElement>(`input[data-po-unit-price="${rowIndex - 1}"]`),
        );
      } else {
        focusAndSelect(dueDateField() ?? partyField());
      }
      return;
    }

    if (isForward && current instanceof HTMLInputElement && current.dataset.poDate === "true") {
      event.preventDefault();
      focusAndSelect(partyField());
      return;
    }

    if (isForward && current instanceof HTMLInputElement && current.dataset.poParty === "true") {
      if (!matchedParty) {
        event.preventDefault();
        current.focus();
        return;
      }
      event.preventDefault();
      focusAndSelect(dueDateField() ?? firstItem());
      return;
    }

    if (isForward && current instanceof HTMLInputElement && current.dataset.poDueDate === "true") {
      event.preventDefault();
      focusAndSelect(firstItem());
      return;
    }

    if (current instanceof HTMLSelectElement && current.dataset.poPrimaryPaymentType === "true") {
      event.preventDefault();
      if (isBackspace) {
        focusAndSelect(keyboardForm.querySelector<HTMLInputElement>(`input[data-po-item-row="${Math.max(0, invoiceItems.fields.length - 1)}"]`) ?? dueDateField() ?? partyField());
        return;
      }
      // Native selects do not consistently open from a synthetic click. The
      // first Enter explicitly opens it; the confirming Enter (after Arrow
      // Up/Down) follows the selected branch below.
      if (isEnter && current.dataset.poPickerOpened !== "true") {
        current.dataset.poPickerOpened = "true";
        if (typeof current.showPicker === "function") current.showPicker();
        else current.click();
        return;
      }
      delete current.dataset.poPickerOpened;
      const selectedType = current.value as "Credit" | "Advance";
      if (selectedType === "Credit") {
        keyboardForm.querySelector<HTMLSelectElement>("select[data-po-discount-type]")?.focus();
        return;
      }
      const firstSplit = paymentSplits[0];
      focusAndSelect(firstSplit ? paymentSplitMethodRefs.current.get(firstSplit.id) : firstItem());
      return;
    }

    if (current instanceof HTMLSelectElement && current.dataset.poPaymentMethod !== undefined) {
      const splitIndex = Number(current.dataset.poPaymentMethod);
      const split = paymentSplits[splitIndex];
      if (!split) return;
      if (isBackspace) {
        event.preventDefault();
        focusAndSelect(splitIndex > 0 ? paymentSplitAmountRefs.current.get(paymentSplits[splitIndex - 1]!.id) : primaryPaymentTypeField());
        return;
      }
      event.preventDefault();
      if (isEnter && current.dataset.poPickerOpened !== "true") {
        current.dataset.poPickerOpened = "true";
        if (typeof current.showPicker === "function") current.showPicker();
        else current.click();
        return;
      }
      delete current.dataset.poPickerOpened;
      const selectedMethod = current.value as PaymentOutMethod | "";
      if (!selectedMethod) {
        if (paymentSplits.length > 1) removePaymentSplit(split.id);
        requestAnimationFrame(() => keyboardForm.querySelector<HTMLSelectElement>("select[data-po-discount-type]")?.focus());
        return;
      }
      if (selectedMethod !== split.method) {
        updatePaymentSplit(split.id, { method: selectedMethod, ledgerId: "", ledgerName: "", reference: selectedMethod === "Cash" ? "" : split.reference });
        requestAnimationFrame(() => {
          const ledger = paymentSplitLedgerRefs.current.get(split.id);
          focusAndSelect(ledger);
        });
        return;
      }
      focusAndOpenSelect(paymentSplitLedgerRefs.current.get(split.id));
      return;
    }

    if (current instanceof HTMLSelectElement && current.dataset.poPaymentLedger !== undefined) {
      const splitIndex = Number(current.dataset.poPaymentLedger);
      const split = paymentSplits[splitIndex];
      if (!split) return;
      if (isBackspace) {
        event.preventDefault();
        focusAndSelect(splitIndex === 0 ? primaryPaymentTypeField() : paymentSplitMethodRefs.current.get(split.id));
        return;
      }
      event.preventDefault();
      if (isEnter && current.dataset.poPickerOpened !== "true") {
        focusAndOpenSelect(current);
        return;
      }
      delete current.dataset.poPickerOpened;
      if (!split.ledgerId) {
        current.focus();
        return;
      }
      focusAndSelect(paymentSplitAmountRefs.current.get(split.id));
      return;
    }

    if (current instanceof HTMLInputElement && current.dataset.poPaymentAmount !== undefined) {
      const splitIndex = Number(current.dataset.poPaymentAmount);
      const split = paymentSplits[splitIndex];
      if (!split) return;
      if (isBackspace) {
        event.preventDefault();
        focusAndSelect(paymentSplitLedgerRefs.current.get(split.id));
        return;
      }
      if (Number(split.amount || 0) <= 0) {
        event.preventDefault();
        current.focus();
        current.select();
        return;
      }
      event.preventDefault();
      focusAndSelect(paymentSplitReferenceRefs.current.get(split.id));
      return;
    }

    if (current instanceof HTMLInputElement && current.dataset.poPaymentReference !== undefined) {
      const splitIndex = Number(current.dataset.poPaymentReference);
      const split = paymentSplits[splitIndex];
      if (!split) return;
      if (isBackspace) {
        event.preventDefault();
        focusAndSelect(paymentSplitAmountRefs.current.get(split.id));
        return;
      }
      event.preventDefault();
      if (splitIndex === paymentSplits.length - 1) appendPaymentSplit();
      else focusAndSelect(paymentSplitMethodRefs.current.get(paymentSplits[splitIndex + 1]!.id));
      return;
    }

    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly]), button:not([disabled])',
      ),
    ).filter((control) => control.offsetParent !== null && control.tabIndex >= 0);

    const orderedControls = controls
      .map((control, domIndex) => ({ control, domIndex }))
      .sort((left, right) => {
        const leftOrder = left.control.tabIndex > 0 ? left.control.tabIndex : Number.MAX_SAFE_INTEGER;
        const rightOrder = right.control.tabIndex > 0 ? right.control.tabIndex : Number.MAX_SAFE_INTEGER;
        return leftOrder === rightOrder ? left.domIndex - right.domIndex : leftOrder - rightOrder;
      })
      .map(({ control }) => control);
    const currentIndex = orderedControls.indexOf(current);
    if (currentIndex < 0) {
      return;
    }

    if (
      isForward &&
      current instanceof HTMLInputElement &&
      current.dataset.poItemRow !== undefined &&
      current.value.trim() === ""
    ) {
      event.preventDefault();
      const rows = form.getValues("invoiceItems");
      const trailingEmptyRows: number[] = [];
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index]?.itemName.trim()) {
          break;
        }
        trailingEmptyRows.push(index);
      }
      if (trailingEmptyRows.length > 0) {
        invoiceItems.remove(trailingEmptyRows);
      }
      requestAnimationFrame(() => {
        primaryPaymentTypeField()?.focus();
      });
      return;
    }

    if (
      isForward &&
      current instanceof HTMLInputElement &&
      current.dataset.poItemRow !== undefined &&
      !isValidItemSelection(current.value)
    ) {
      event.preventDefault();
      current.focus();
      current.select();
      toast.error("Select an item from the Item picker before continuing.");
      return;
    }

    if (isEnter && current instanceof HTMLSelectElement && current.dataset.poPickerOpened !== "true") {
      const picker = current as HTMLSelectElement & { showPicker?: () => void };
      if (picker.showPicker) {
        event.preventDefault();
        current.dataset.poPickerOpened = "true";
        picker.showPicker();
      }
      return;
    }

    if (isBackspace) {
      const previous = orderedControls[currentIndex - 1];
      if (!previous) {
        return;
      }
      event.preventDefault();
      previous.focus();
      if (previous instanceof HTMLInputElement && previous.type !== "date" && previous.type !== "checkbox") {
        previous.select();
      }
      return;
    }


    if (isForward && current instanceof HTMLInputElement && current.dataset.poUnitPrice !== undefined) {
      const currentRow = Number(current.dataset.poUnitPrice);
      event.preventDefault();
      if (isDeliveryNoteWorkflow) {
        const warehouse = deliveryNoteItemWarehouseField(currentRow);
        warehouse?.focus();
        return;
      }
      const nextRow = currentRow + 1;
      if (currentRow >= invoiceItems.fields.length - 1) {
        appendInvoiceItem();
      }
      requestAnimationFrame(() => {
        const nextItem = keyboardForm.querySelector<HTMLInputElement>(`input[data-po-item-row="${nextRow}"]`);
        nextItem?.focus();
        nextItem?.select();
      });
      return;
    }

    event.preventDefault();
    if (current instanceof HTMLSelectElement) {
      delete current.dataset.poPickerOpened;
    }
    const next = orderedControls[currentIndex + 1];
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement && next.type !== "date" && next.type !== "checkbox") {
        next.select();
      }
      return;
    }

    event.currentTarget.requestSubmit();
  }

  function handleReceiptNoteKeyboardFlow(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (!isReceiptNoteWorkflow || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const isForward = event.key === "Enter" || event.key === "Tab";
    if (!isForward) return;

    const keyboardForm = event.currentTarget;
    const current = event.target;
    if (!(current instanceof HTMLElement) || current.tagName === "TEXTAREA" || current.tagName === "BUTTON") return;

    const focusInput = (target: HTMLInputElement | null) => {
      target?.focus();
      target?.select();
    };
    const itemField = (row: number) => keyboardForm.querySelector<HTMLInputElement>(`input[data-po-item-row="${row}"]`);
    const quantityField = (row: number) => keyboardForm.querySelector<HTMLInputElement>(`input[data-receipt-quantity-row="${row}"]`);
    const priceField = (row: number) => keyboardForm.querySelector<HTMLInputElement>(`input[data-receipt-unit-price-row="${row}"]`);
    const warehouseField = (row: number) => keyboardForm.querySelector<HTMLInputElement>(`input[data-receipt-warehouse-row="${row}"]`);

    if (current instanceof HTMLInputElement && current.dataset.receiptNoteDate === "true") {
      event.preventDefault();
      focusInput(keyboardForm.querySelector<HTMLInputElement>('input[data-receipt-note-party="true"]'));
      return;
    }

    if (current instanceof HTMLInputElement && current.dataset.receiptNoteParty === "true") {
      event.preventDefault();
      if (!matchedParty) {
        current.focus();
        return;
      }
      focusInput(itemField(0));
      return;
    }

    if (current instanceof HTMLInputElement && current.dataset.poItemRow !== undefined) {
      event.preventDefault();
      if (!findInventoryOption(current.value)) {
        current.focus();
        current.select();
        return;
      }
      focusInput(quantityField(Number(current.dataset.poItemRow)));
      return;
    }

    if (current instanceof HTMLInputElement && current.dataset.receiptQuantityRow !== undefined) {
      event.preventDefault();
      focusInput(priceField(Number(current.dataset.receiptQuantityRow)));
      return;
    }

    if (current instanceof HTMLInputElement && current.dataset.receiptUnitPriceRow !== undefined) {
      event.preventDefault();
      const row = Number(current.dataset.receiptUnitPriceRow);
      const warehouse = warehouseField(row);
      if (warehouseOptions.length <= 1) {
        const onlyWarehouseId = warehouseOptions[0]?.id || receiptWarehouseFallbackId;
        if (onlyWarehouseId) {
          form.setValue(`invoiceItems.${row}.warehouseId`, onlyWarehouseId, { shouldDirty: true, shouldTouch: true });
          form.setValue(`invoiceItems.${row}.warehouseSelectionOrigin`, "user", { shouldDirty: true });
        }
        moveToNextReceiptItem(row);
        return;
      }
      if (!warehouse) return;
      warehouse.focus();
      activateWarehousePickerForRow(row);
      return;
    }

    function moveToNextReceiptItem(row: number) {
      const nextRow = row + 1;
      if (row >= invoiceItems.fields.length - 1) appendInvoiceItem();
      requestAnimationFrame(() => focusInput(itemField(nextRow)));
    }
  }

  useEffect(() => {
    if (
      !(voucherType === "purchase" && (workflow === "purchase-order" || workflow === "receipt-note")) &&
      !(voucherType === "sales" && (workflow === "sale-order" || workflow === "delivery-note"))
    ) {
      return;
    }
    const focusPurchaseOrderDate = (event: KeyboardEvent) => {
      if (event.key !== "F2" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      const dateInput = document.querySelector<HTMLInputElement>('input[data-workflow-date="true"]');
      dateInput?.focus();
      dateInput?.select();
    };
    window.addEventListener("keydown", focusPurchaseOrderDate);
    return () => window.removeEventListener("keydown", focusPurchaseOrderDate);
  }, [voucherType, workflow]);

  function applyPartySelection(party: PartyRecord) {
    if ((classicPurchaseMode || classicDebitNoteMode || classicSalesInvoiceMode) && selectedReceiptNotes.some((note) => note.partyName.trim().toLowerCase() !== party.name.trim().toLowerCase())) {
      setSelectedReceiptNotes([]);
      setSourceDocumentReference(null);
      setLinkedBillId(null);
      setLoadedVoucher(null);
      invoiceItems.replace([buildDefaultInvoiceItem(0)]);
    }
    form.setValue("partyName", party.name, { shouldDirty: true, shouldTouch: true });
    setPartyPickerOpen(false);
    setPartyHighlightIndex(-1);
  }

  /** Mirrors renderPartyPickerField's disableSuggestions branch, but drives the
   * Quick Picker's Revenue Ledger list (revenueLedger) instead of partyName. */
  function renderRevenueLedgerField({ className, placeholder }: { className?: string; placeholder?: string } = {}) {
    const revenueLedgerField = form.register("revenueLedger");
    return (
      <Input
        {...revenueLedgerField}
        autoComplete="off"
        onChange={(event) => {
          revenueLedgerField.onChange(event);
          setSidePickerTab("party");
          setSidePickerQuery(event.target.value);
          setSidePickerPage(1);
          setSidePickerHighlight(-1);
        }}
        onFocus={(event) => {
          setActiveItemRowIndex(null);
          setSidePickerTab("party");
          setSidePickerQuery(event.target.value);
          setSidePickerPage(1);
          setSidePickerHighlight(-1);
        }}
        onKeyDown={(event) => {
          if (isPickerNavigationKey(event.key) || (event.key === "Enter" && sidePickerHighlight >= 0)) {
            event.preventDefault();
            handleSidePickerKey(event.key);
          } else if (event.key === "Escape") {
            setSidePickerHighlight(-1);
          }
        }}
        placeholder={placeholder ?? (revenueLedgersQuery.isLoading ? "Loading income ledgers..." : "Select income ledger")}
        className={className}
      />
    );
  }

  /** Revenue's debtor field drives the Quick Picker's "item" tab slot (repurposed as
   * the customer list here) instead of the generic party dropdown — the "party" tab
   * is already taken by the Other-Income ledger list on this voucher type. */
  function renderRevenueDebtorField({ className, placeholder }: { className?: string; placeholder?: string } = {}) {
    const partyNameField = form.register("partyName");
    return (
      <Input
        {...partyNameField}
        autoComplete="off"
        onChange={(event) => {
          partyNameField.onChange(event);
          setSidePickerTab("item");
          setSidePickerQuery(event.target.value);
          setSidePickerPage(1);
          setSidePickerHighlight(-1);
        }}
        onFocus={(event) => {
          setActiveItemRowIndex(null);
          setSidePickerTab("item");
          setSidePickerQuery(event.target.value);
          setSidePickerPage(1);
          setSidePickerHighlight(-1);
        }}
        onKeyDown={(event) => {
          if (isPickerNavigationKey(event.key) || (event.key === "Enter" && sidePickerHighlight >= 0)) {
            event.preventDefault();
            handleSidePickerKey(event.key);
          } else if (event.key === "Escape") {
            setSidePickerHighlight(-1);
          }
        }}
        placeholder={placeholder ?? `Search or select ${partyRoleLabel.toLowerCase()}`}
        className={className}
      />
    );
  }

  function renderPartyPickerField({
    className,
    placeholder,
    disableSuggestions = false,
    tabIndex,
    purchaseOrderFlow,
    receiptNoteFlow,
    paymentOutFlow,
  }: { className?: string; placeholder?: string; disableSuggestions?: boolean; tabIndex?: number; purchaseOrderFlow?: boolean; receiptNoteFlow?: boolean; paymentOutFlow?: boolean } = {}) {
    const partyNameField = form.register("partyName");

    if (disableSuggestions) {
      // No dropdown here on purpose: this field drives the Quick Picker list on
      // the right, and arrow keys move through it.
      return (
        <Input
          {...partyNameField}
          data-po-party={purchaseOrderFlow ? "true" : undefined}
          data-receipt-note-party={receiptNoteFlow ? "true" : undefined}
          data-payment-out-party={paymentOutFlow ? "true" : undefined}
          tabIndex={tabIndex}
          autoComplete="off"
          onChange={(event) => {
            partyNameField.onChange(event);
            setSidePickerTab("party");
            setSidePickerQuery(event.target.value);
            setSidePickerPage(1);
            setSidePickerHighlight(-1);
          }}
          onFocus={(event) => {
            setActiveItemRowIndex(null);
            setSidePickerTab("party");
            setSidePickerQuery(event.target.value);
            setSidePickerPage(1);
            setSidePickerHighlight(-1);
          }}
          onKeyDown={(event) => {
            if (isPickerNavigationKey(event.key) || (event.key === "Enter" && sidePickerHighlight >= 0)) {
              event.preventDefault();
              handleSidePickerKey(event.key);
              if (paymentOutFlow && event.key === "Enter" && sidePickerHighlight >= 0) {
                requestAnimationFrame(() => paymentSplitMethodRefs.current.get(paymentSplits[0]?.id ?? "")?.focus());
              }
            } else if (event.key === "Escape") {
              setSidePickerHighlight(-1);
            }
          }}
          placeholder={placeholder ?? `Search or select ${partyRoleLabel.toLowerCase()}`}
          className={className}
        />
      );
    }

    return (
      <div ref={partyPickerRef} className="relative">
        <div className={cn("flex min-h-10 w-full items-center overflow-hidden rounded-xl border border-border bg-white", className)}>
          <Input
            {...partyNameField}
            tabIndex={tabIndex}
            onChange={(event) => {
              partyNameField.onChange(event);
              setPartyPickerOpen(true);
              setPartyHighlightIndex(-1);
            }}
            onFocus={() => {
              setPartyPickerOpen(true);
              setPartyHighlightIndex(-1);
            }}
            onKeyDown={(event) => {
              if (isPickerNavigationKey(event.key)) {
                const navigationKey = event.key;
                event.preventDefault();
                setPartyPickerOpen(true);
                setPartyHighlightIndex((current) => getNextPickerIndex(current, filteredPartyOptions.length, navigationKey));
              } else if (event.key === "Enter") {
                const selectedParty = filteredPartyOptions[partyHighlightIndex >= 0 ? partyHighlightIndex : 0];
                if (partyPickerOpen && selectedParty) {
                  event.preventDefault();
                  applyPartySelection(selectedParty);
                }
              } else if (event.key === "Escape") {
                setPartyPickerOpen(false);
                setPartyHighlightIndex(-1);
              }
            }}
            placeholder={placeholder ?? `Search or select ${partyRoleLabel.toLowerCase()}`}
            className="h-full flex-1 rounded-none border-0 bg-transparent px-3 pr-2 shadow-none focus-visible:ring-0"
          />
          <button
            type="button"
            className="inline-flex h-full w-10 shrink-0 items-center justify-center border-l border-[#e5ecf5] text-[#0f6cf6] transition hover:bg-[#eef5ff]"
            onClick={() => {
              setPartyPickerOpen((current) => !current);
              setPartyHighlightIndex(-1);
            }}
            aria-label={`Select ${partyRoleLabel.toLowerCase()}`}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", partyPickerOpen ? "rotate-180" : "")} />
          </button>
        </div>
        {partyPickerOpen ? (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-[6px] border border-[#cfdcf0] bg-white shadow-[0_16px_38px_rgba(15,23,42,0.12)]">
            <div ref={partyPickerListRef} className="max-h-64 overflow-auto py-1" role="listbox">
              {filteredPartyOptions.length ? (
                filteredPartyOptions.map((party, optionIndex) => (
                  <button
                    key={party.id}
                    type="button"
                    role="option"
                    aria-selected={optionIndex === partyHighlightIndex}
                    data-picker-option-index={optionIndex}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 px-4 py-2 text-left transition hover:bg-[#f5f9ff]",
                      optionIndex === partyHighlightIndex ? "bg-[#eef5ff]" : "",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setPartyHighlightIndex(optionIndex)}
                    onClick={() => applyPartySelection(party)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[#1f2f46]">{party.name}</span>
                      <span className="block truncate text-xs text-[#66768e]">{[party.contact, party.address].filter(Boolean).join(" / ") || "No contact details"}</span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-[#6d7a8e]">No saved {partyRoleLabel.toLowerCase()} found.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  /**
   * Applies a stock item to a row and fills the rate from history: the last rate
   * agreed with this party wins, then the last rate used for the item anywhere,
   * and only then the item master rate.
   */
  function applyInventoryItemToRow(index: number, item: InventoryOptionRecord) {
    if (normalizeLookupValue(form.getValues(`invoiceItems.${index}.itemName`)) !== normalizeLookupValue(item.itemName)) {
      form.setValue(`invoiceItems.${index}.manufacturingInventoryLotId`, undefined, { shouldDirty: true });
      form.setValue(`invoiceItems.${index}.manufacturingSerialIds`, [], { shouldDirty: true });
    }
    form.setValue(`invoiceItems.${index}.itemName`, item.itemName, { shouldDirty: true, shouldTouch: true });
    form.setValue(`invoiceItems.${index}.unit`, item.unit || "pcs", { shouldDirty: true, shouldTouch: true });
    if (classicDebitNoteMode) {
      form.setValue(`invoiceItems.${index}.quantity`, 0, { shouldDirty: true, shouldTouch: false });
    }
    const lastRate = findLastRate(item.itemName, form.getValues("partyName") ?? "");
    form.setValue(`invoiceItems.${index}.unitPrice`, lastRate ? lastRate.rate : Number(item.rate || 0), {
      shouldDirty: true,
      shouldTouch: true,
    });
    handleInventoryItemNameChange(index, item.itemName);

    // Item and warehouse are one continuous row-entry operation. Move the right
    // panel to the selected item's warehouse balances instead of making the user
    // find and open the Warehouse tab separately.
    if (hasRowWarehousePicker()) {
      setActiveWarehouseRowIndex(index);
      setSidePickerTab("warehouse");
      setSidePickerQuery("");
      setSidePickerPage(1);
      setSidePickerHighlight(-1);
    }
  }

  /** One-click way to accept the historical rate when the user has overridden it. */
  function renderLastRateHint(index: number) {
    const hint = getLastRateHint(index);
    if (!hint) {
      return null;
    }

    const currentPrice = Number(watchedInvoiceItems[index]?.unitPrice || 0);
    if (moneyAmountsEqual(currentPrice, hint.rate)) {
      return <div className="mt-0.5 truncate text-right text-[11px] text-[#0f9f63]">{hint.label}</div>;
    }

    return (
      <button
        type="button"
        className="mt-0.5 block w-full truncate text-right text-[11px] text-[#0f6cf6] hover:underline"
        onClick={() => form.setValue(`invoiceItems.${index}.unitPrice`, hint.rate, { shouldDirty: true, shouldTouch: true })}
        title="Use this rate"
      >
        {hint.label}
      </button>
    );
  }

  function renderItemNameCell(index: number, className: string, placeholder = "", tabIndex?: number, purchaseOrderRow?: number) {
    const itemNameField = form.register(`invoiceItems.${index}.itemName`);

    return (
        <Input
          {...itemNameField}
          tabIndex={tabIndex}
          data-po-item-row={purchaseOrderRow}
          data-voucher-item-row={index}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          itemNameField.onChange(event);
          handleInventoryItemNameChange(index, event.target.value);
          // Typing drives the Quick Picker on the right instead of a dropdown.
          setActiveItemRowIndex(index);
          setSidePickerTab("item");
          setSidePickerQuery(event.target.value);
          setSidePickerPage(1);
          setSidePickerHighlight(-1);
        }}
        onFocus={(event) => {
          setActiveItemRowIndex(index);
          setSidePickerTab("item");
          setSidePickerQuery(event.target.value);
          setSidePickerPage(1);
          setSidePickerHighlight(-1);
        }}
        onBlur={(event) => {
          itemNameField.onBlur(event);
          handleInventoryItemNameChange(index, event.target.value);
        }}
        onKeyDown={(event) => {
          if (isPickerNavigationKey(event.key) || (event.key === "Enter" && sidePickerHighlight >= 0)) {
            event.preventDefault();
            handleSidePickerKey(event.key);
          } else if (event.key === "Escape") {
            setSidePickerHighlight(-1);
          } else if (
            classicDebitNoteMode &&
            (event.key === "Tab" || event.key === "Enter") &&
            !event.shiftKey &&
            !event.currentTarget.value.trim()
          ) {
            event.preventDefault();
            const rowIndex = Number(event.currentTarget.dataset.voucherItemRow);
            if (Number.isInteger(rowIndex)) {
              invoiceItems.remove(rowIndex);
            }
            setActiveItemRowIndex(null);
            setSidePickerHighlight(-1);
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>("[data-purchase-return-payment-type='true']")?.focus();
            });
          } else if ((event.key === "Tab" || event.key === "Enter") && !event.shiftKey && !findInventoryOption(event.currentTarget.value) && purchaseOrderRow === undefined) {
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.select();
            toast.error("Select an item from the Item picker before continuing.");
          }
        }}
      />
    );
  }

  function matchesItemPickerQuery(item: InventoryOptionRecord, query: string) {
    if (!query) {
      return true;
    }

    const primaryName = itemPickerNameMode === "alias" && item.alias ? item.alias : item.itemName;
    return primaryName.toLowerCase().includes(query) || item.itemCode.toLowerCase().includes(query);
  }

  /** Current Quick Picker results, shared by the panel and the keyboard handler. */
  function getSidePickerMatches() {
    const pickerQuery = sidePickerQuery.trim().toLowerCase();
    if (sidePickerTab === "party") {
      // An expense voucher has no supplier/customer — the same first tab picks an
      // expense category instead, reusing the partyName field that already holds it.
      if (classicExpenseMode) {
        return pickerQuery ? expenseLedgerOptions.filter((ledger) => ledger.toLowerCase().includes(pickerQuery)) : expenseLedgerOptions;
      }

      // A Revenue voucher's party tab picks the Other-Income credit ledger instead of a
      // customer — the customer (when the entry is on credit) has its own plain field.
      if (classicRevenueMode) {
        const names = revenueLedgerAccounts.map((ledger) => ledger.name);
        return pickerQuery ? names.filter((name) => name.toLowerCase().includes(pickerQuery)) : names;
      }

      return pickerQuery ? partyOptions.filter((party) => party.name.toLowerCase().includes(pickerQuery)) : partyOptions;
    }

    // A Revenue voucher has no item list — this tab is repurposed to pick the
    // debtor ledger instead, mirroring how the party tab above is repurposed to
    // pick the credit ledger. Never a Sales-side Customer record — the money owed
    // to us for Other Income is posted straight to a Trade Receivables ledger.
    if (classicRevenueMode) {
      const names = debtorLedgerAccounts.map((ledger) => ledger.name);
      return pickerQuery ? names.filter((name) => name.toLowerCase().includes(pickerQuery)) : names;
    }

    const itemSource = classicExpenseMode ? getExpenseItemOptions(watchedPartyName) : inventoryOptions;
    return pickerQuery ? itemSource.filter((item) => matchesItemPickerQuery(item, pickerQuery)) : itemSource;
  }

  function hasRowWarehousePicker() {
    return (
      (voucherType === "purchase" && workflow !== "purchase-order") ||
      (voucherType === "sales" && workflow !== "sale-order") ||
      voucherType === "debit-note" ||
      voucherType === "credit-note"
    );
  }

  function isInboundWarehouseDocument() {
    return voucherType === "purchase" || voucherType === "credit-note";
  }

  function getWarehousePickerOptions(rowIndexOverride?: number): WarehousePickerOption[] {
    const rowIndex = rowIndexOverride ?? activeWarehouseRowIndex ?? activeItemRowIndex;
    if (rowIndex === null) {
      return [];
    }
    const itemName = form.getValues(`invoiceItems.${rowIndex}.itemName`) ?? "";
    if (!itemName.trim()) {
      return [];
    }

    const itemKey = normalizeLookupValue(itemName);
    const item = findInventoryOption(itemName);
    const rowUnit = form.getValues(`invoiceItems.${rowIndex}.unit`);
    const stockByWarehouseId = new Map(
      warehouseStockRows
        .filter((row) => normalizeLookupValue(row.itemName) === itemKey)
        .map((row) => [row.warehouseId, row] as const),
    );
    const inbound = isInboundWarehouseDocument();

    // Active master warehouses are authoritative. Warehouse-stock only contains
    // balances that exist, so inbound flows deliberately synthesize a zero balance
    // for valid destinations that have never held this item before.
    const masterOptions = warehouseOptions
      .map((warehouse) => {
        const stock = stockByWarehouseId.get(warehouse.id);
        return {
          id: warehouse.id,
          name: warehouse.name,
          code: warehouse.code,
          type: warehouse.type,
          address: warehouse.address,
          isDefault: warehouse.isDefault,
          quantity: Number(stock?.quantity || 0),
          unit: stock?.unit || item?.unit || rowUnit || "pcs",
        } satisfies WarehousePickerOption;
      })
      .filter((warehouse) => inbound || warehouse.quantity > 0);

    if (masterOptions.length || warehouseOptions.length) {
      return masterOptions;
    }

    // Defensive fallback while the warehouse master request is still resolving.
    return warehouseStockRows
      .filter((row) => normalizeLookupValue(row.itemName) === itemKey && (inbound || row.quantity > 0))
      .map((row) => ({
        id: row.warehouseId,
        name: row.warehouseName,
        code: row.warehouseCode,
        quantity: Number(row.quantity || 0),
        unit: row.unit || item?.unit || "pcs",
      }));
  }

  function applyExpenseLedgerSelection(ledger: string) {
    form.setValue("partyName", ledger, { shouldDirty: true, shouldTouch: true });
    // Looked up directly off the ledger list rather than the memoized
    // expenseLedgerRequiresItems, which still reflects the *previous* selection
    // until this setValue's watch re-render lands.
    if (mode === "api") {
      const account = expenseLedgerAccounts.find((entry) => normalizeLookupValue(entry.name) === normalizeLookupValue(ledger));
      setSidePickerTab(account?.requiresItemDetails ?? true ? "item" : "party");
    }
  }

  function applyRevenueLedgerSelection(ledger: string) {
    form.setValue("revenueLedger", ledger, { shouldDirty: true, shouldTouch: true });
  }

  function applyDebtorLedgerSelection(ledger: string) {
    form.setValue("partyName", ledger, { shouldDirty: true, shouldTouch: true });
  }

  /** Arrow keys move through the Quick Picker; Enter applies the highlighted row. */
  function handleSidePickerKey(key: string) {
    if (sidePickerTab === "warehouse") {
      const matches = getWarehousePickerOptions();
      if (!matches.length) return;
      if (isPickerNavigationKey(key)) {
        setSidePickerHighlight((current) => getNextPickerIndex(current, matches.length, key));
        return;
      }
      if (key === "Enter" && sidePickerHighlight >= 0 && matches[sidePickerHighlight] && activeWarehouseRowIndex !== null) {
        applyWarehousePickerSelection(activeWarehouseRowIndex, matches[sidePickerHighlight]);
      }
      return;
    }
    const matches = getSidePickerMatches();
    if (!matches.length) {
      return;
    }

    if (isPickerNavigationKey(key)) {
      setSidePickerHighlight((current) => getNextPickerIndex(current, matches.length, key));
      return;
    }

    if (key !== "Enter" || sidePickerHighlight < 0) {
      return;
    }

    const selected = matches[sidePickerHighlight];
    if (!selected) {
      return;
    }

    if (sidePickerTab === "party") {
      if (classicExpenseMode) {
        applyExpenseLedgerSelection(selected as string);
      } else if (classicRevenueMode) {
        applyRevenueLedgerSelection(selected as string);
      } else {
        applyPartySelection(selected as PartyRecord);
      }
    } else if (classicRevenueMode) {
      applyDebtorLedgerSelection(selected as string);
    } else if (activeItemRowIndex !== null) {
      applyInventoryItemToRow(activeItemRowIndex, selected as InventoryOptionRecord);
    }

    setSidePickerHighlight(-1);
  }

  function applyWarehousePickerSelection(rowIndex: number, warehouse: WarehousePickerOption, focusQuantity = true) {
    if (form.getValues(`invoiceItems.${rowIndex}.warehouseId`) !== warehouse.id) {
      form.setValue(`invoiceItems.${rowIndex}.manufacturingInventoryLotId`, undefined, { shouldDirty: true });
      form.setValue(`invoiceItems.${rowIndex}.manufacturingSerialIds`, [], { shouldDirty: true });
    }
    form.setValue(`invoiceItems.${rowIndex}.warehouseId`, warehouse.id, { shouldDirty: true, shouldTouch: true });
    form.setValue(`invoiceItems.${rowIndex}.warehouseSelectionOrigin`, "user", { shouldDirty: true });
    form.setValue(`invoiceItems.${rowIndex}.warehouseSnapshot`, undefined, { shouldDirty: false });
    setSidePickerHighlight(-1);
    if (!focusQuantity) {
      return;
    }
    requestAnimationFrame(() => {
      const quantity = document.querySelector<HTMLInputElement>(`input[data-item-quantity-row='${rowIndex}']`);
      if (quantity) {
        quantity.focus();
        quantity.select();
        return;
      }
      const nextItem = document.querySelector<HTMLInputElement>(`input[data-voucher-item-row='${rowIndex + 1}']`);
      if (nextItem) {
        nextItem.focus();
        nextItem.select();
      } else {
        // Completing the last warehouse starts the next return line. It must
        // never loop back to the bill reference which belongs to the header.
        appendInvoiceItem();
        requestAnimationFrame(() => {
          const appendedItem = document.querySelector<HTMLInputElement>(`input[data-voucher-item-row='${rowIndex + 1}']`);
          appendedItem?.focus();
          appendedItem?.select();
        });
      }
    });
  }

  function applyWarehouseDropdownSelection(rowIndex: number, warehouseId: string) {
    if (!warehouseId) {
      form.setValue(`invoiceItems.${rowIndex}.warehouseId`, "", { shouldDirty: true, shouldTouch: true });
      form.setValue(`invoiceItems.${rowIndex}.warehouseSelectionOrigin`, undefined, { shouldDirty: true });
      return;
    }
    const warehouse = getWarehousePickerOptions(rowIndex).find((option) => option.id === warehouseId);
    if (!warehouse) {
      return;
    }
    applyWarehousePickerSelection(rowIndex, warehouse, false);
  }

  function activateWarehousePickerForRow(rowIndex: number) {
    setActiveItemRowIndex(rowIndex);
    setActiveWarehouseRowIndex(rowIndex);
    setSidePickerTab("warehouse");
    setSidePickerQuery("");
    setSidePickerPage(1);
    setSidePickerHighlight(-1);
  }

  function handleWarehousePickerFieldKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, rowIndex: number) {
    if (isPickerNavigationKey(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      setActiveWarehouseRowIndex(rowIndex);
      handleSidePickerKey(event.key);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      setActiveWarehouseRowIndex(rowIndex);
      if (sidePickerHighlight < 0) {
        setSidePickerHighlight(0);
      } else {
        handleSidePickerKey("Enter");
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setSidePickerHighlight(-1);
    }
  }

  function getWarehouseFieldLabel(rowIndex: number) {
    const warehouseId = watchedInvoiceItems[rowIndex]?.warehouseId;
    if (!warehouseId) {
      return "Select warehouse";
    }
    const warehouse = warehouseOptions.find((option) => option.id === warehouseId);
    if (warehouse) {
      return `${warehouse.code} — ${warehouse.name}`;
    }
    const historical = historicalReceiptWarehouses.get(warehouseId);
    return historical ? `${historical.code} — ${historical.name} (Inactive / historical)` : "Previous warehouse (Inactive / historical)";
  }

  function renderWarehousePickerField(
    rowIndex: number,
    tabIndex?: number,
    fieldKind: "receipt" | "delivery" | "purchase-return" | "sales-invoice" = "receipt",
  ) {
    const warehouseId = watchedInvoiceItems[rowIndex]?.warehouseId || "";
    const historical = warehouseId && !activeWarehouseIds.has(warehouseId) ? historicalReceiptWarehouses.get(warehouseId) : null;
    const dropdownOptions = getWarehousePickerOptions(rowIndex);
    const fieldDataAttributes =
      fieldKind === "delivery"
        ? { "data-delivery-note-item-warehouse": rowIndex }
        : fieldKind === "purchase-return"
          ? { "data-purchase-return-warehouse-row": rowIndex }
          : fieldKind === "sales-invoice"
            ? { "data-sales-invoice-item-warehouse": rowIndex }
            : { "data-receipt-warehouse-row": rowIndex };

    const isFieldFocused = warehouseFieldFocusedRow === rowIndex;

    return (
      <div className="flex h-10 w-full min-w-0 overflow-hidden rounded-[4px] border border-[#9fb1c8] bg-[#f8fbff] outline-none transition focus-within:border-[#2583ea] focus-within:ring-2 focus-within:ring-[#2583ea]/20 hover:bg-white">
        <input
          type="text"
          tabIndex={tabIndex}
          {...fieldDataAttributes}
          aria-label={`Warehouse for item row ${rowIndex + 1}`}
          aria-haspopup="listbox"
          autoComplete="off"
          className="min-w-0 flex-1 border-0 bg-transparent px-2 text-left text-xs font-medium text-[#1f2f46] outline-none"
          value={isFieldFocused ? sidePickerQuery : getWarehouseFieldLabel(rowIndex)}
          onFocus={() => {
            activateWarehousePickerForRow(rowIndex);
            setWarehouseFieldFocusedRow(rowIndex);
          }}
          onChange={(event) => {
            setActiveWarehouseRowIndex(rowIndex);
            setSidePickerTab("warehouse");
            setSidePickerQuery(event.target.value);
            setSidePickerHighlight(-1);
          }}
          onBlur={() => setWarehouseFieldFocusedRow(null)}
          onKeyDown={(event) => handleWarehousePickerFieldKeyDown(event, rowIndex)}
        />
        <div className="relative h-full w-9 shrink-0 border-l border-[#cbd7e6] bg-white/70">
          <ChevronDown className="pointer-events-none absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-[#52657e]" />
          <select
            tabIndex={-1}
            value={warehouseId}
            aria-label={`Open warehouse dropdown for item row ${rowIndex + 1}`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onFocus={() => activateWarehousePickerForRow(rowIndex)}
            onChange={(event) => applyWarehouseDropdownSelection(rowIndex, event.target.value)}
          >
            <option value="">Select warehouse</option>
            {!dropdownOptions.length && !historical ? (
              <option value="" disabled>
                {isInboundWarehouseDocument()
                  ? "No active warehouse configured"
                  : "No stock of this item in any warehouse"}
              </option>
            ) : null}
            {historical ? (
              <option value={warehouseId} disabled>
                {historical.code} — {historical.name} (Inactive / historical)
              </option>
            ) : null}
            {dropdownOptions.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} — {warehouse.name}{warehouse.isDefault ? " (Default)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  function renderSidePickerPanel() {
    const SIDE_PICKER_PAGE_SIZE = 8;
    const pickerQuery = sidePickerQuery.trim().toLowerCase();
    const pickerCategories = pickerQuery
      ? expenseLedgerOptions.filter((ledger) => ledger.toLowerCase().includes(pickerQuery))
      : expenseLedgerOptions;
    const pickerParties = pickerQuery ? partyOptions.filter((party) => party.name.toLowerCase().includes(pickerQuery)) : partyOptions;
    const pickerRevenueLedgers = pickerQuery
      ? revenueLedgerAccounts.filter((ledger) => ledger.name.toLowerCase().includes(pickerQuery))
      : revenueLedgerAccounts;
    const pickerDebtorLedgers = pickerQuery
      ? debtorLedgerAccounts.filter((ledger) => ledger.name.toLowerCase().includes(pickerQuery))
      : debtorLedgerAccounts;
    const expenseParticularOptions = classicExpenseMode ? getExpenseItemOptions(watchedPartyName) : [];
    const pickerItems = classicExpenseMode
      ? pickerQuery
        ? expenseParticularOptions.filter((item) => matchesItemPickerQuery(item, pickerQuery))
        : expenseParticularOptions
      : pickerQuery
        ? inventoryOptions.filter((item) => matchesItemPickerQuery(item, pickerQuery))
        : inventoryOptions;
    const primaryTabLabel = classicExpenseMode || classicRevenueMode ? "Ledger" : partyRoleLabel;
    const activeWarehouseItemName =
      activeWarehouseRowIndex === null ? "" : (form.getValues(`invoiceItems.${activeWarehouseRowIndex}.itemName`) ?? "");
    const allPickerWarehouses = getWarehousePickerOptions();
    const pickerWarehouses = pickerQuery
      ? allPickerWarehouses.filter(
          (warehouse) => warehouse.name.toLowerCase().includes(pickerQuery) || warehouse.code.toLowerCase().includes(pickerQuery),
        )
      : allPickerWarehouses;
    const warehousePickerEnabled = hasRowWarehousePicker();
    const totalPickerCount =
      sidePickerTab === "warehouse"
        ? pickerWarehouses.length
        : sidePickerTab === "party"
        ? classicExpenseMode
          ? pickerCategories.length
          : classicRevenueMode
            ? pickerRevenueLedgers.length
            : pickerParties.length
        : classicRevenueMode
          ? pickerDebtorLedgers.length
          : pickerItems.length;
    // Expense ledgers are a compact master list and operators repeatedly use the
    // same entries. Keep all of them in one scrollable list instead of hiding the
    // ninth ledger on a second page (searching appeared to "find" a missing ledger).
    const showAllExpenseLedgers = classicExpenseMode && sidePickerTab === "party";
    const pageStart = showAllExpenseLedgers ? 0 : (sidePickerPage - 1) * SIDE_PICKER_PAGE_SIZE;
    const pagedCategories = showAllExpenseLedgers ? pickerCategories : pickerCategories.slice(pageStart, pageStart + SIDE_PICKER_PAGE_SIZE);
    const pagedParties = pickerParties.slice(pageStart, pageStart + SIDE_PICKER_PAGE_SIZE);
    const pagedRevenueLedgers = pickerRevenueLedgers.slice(pageStart, pageStart + SIDE_PICKER_PAGE_SIZE);
    const pagedDebtorLedgers = pickerDebtorLedgers.slice(pageStart, pageStart + SIDE_PICKER_PAGE_SIZE);
    const pagedItems = pickerItems.slice(pageStart, pageStart + SIDE_PICKER_PAGE_SIZE);
    const activeWarehouseId = activeWarehouseRowIndex === null ? "" : form.getValues(`invoiceItems.${activeWarehouseRowIndex}.warehouseId`);

    return (
      <aside data-voucher-quick-picker="true" className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[8px] border border-[#d8e1ea] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div data-voucher-quick-picker-header="true" className="shrink-0 border-b border-[#e4ebf5] px-4 py-4">
          <div className="text-sm font-semibold uppercase tracking-[0.1em] text-[#6f7d91]">Quick Picker</div>
          <div className={cn("mt-3 grid gap-1 rounded-[6px] bg-[#f3f6fb] p-1", warehousePickerEnabled ? "grid-cols-3" : "grid-cols-2")}>
            <button
              type="button"
              className={cn(
                "rounded-[4px] px-3 py-1.5 text-[13px] font-medium transition",
                sidePickerTab === "party" ? "bg-white text-[#0f6cf6] shadow-sm" : "text-[#6f7d91] hover:text-[#1f2f46]",
              )}
              onClick={() => {
                setSidePickerTab("party");
                setSidePickerQuery("");
                setSidePickerPage(1);
              }}
            >
              {primaryTabLabel}
            </button>
            {classicPaymentMode ? null : (
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
                }}
              >
                {classicRevenueMode ? "Debtor" : "Item"}
              </button>
            )}
            {warehousePickerEnabled ? (
              <button
                type="button"
                className={cn(
                  "rounded-[4px] px-2 py-1.5 text-[13px] font-medium transition",
                  sidePickerTab === "warehouse" ? "bg-white text-[#0f6cf6] shadow-sm" : "text-[#6f7d91] hover:text-[#1f2f46]",
                )}
                onClick={() => {
                  setSidePickerTab("warehouse");
                  setSidePickerQuery("");
                  setSidePickerPage(1);
                  setSidePickerHighlight(-1);
                  setActiveWarehouseRowIndex((current) => {
                    if (current !== null && form.getValues(`invoiceItems.${current}.itemName`)?.trim()) {
                      return current;
                    }
                    const rowWithItem = form.getValues("invoiceItems").findIndex((item) => item.itemName.trim());
                    return rowWithItem >= 0 ? rowWithItem : current;
                  });
                }}
              >
                Warehouse
              </button>
            ) : null}
          </div>
          {sidePickerTab === "item" ? (
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a3aebd]" />
              <Input
                value={sidePickerQuery}
                onChange={(event) => {
                  setSidePickerQuery(event.target.value);
                  setSidePickerPage(1);
                }}
                placeholder={classicRevenueMode ? "Search debtor ledger" : "Search item"}
                className="h-9 rounded-[4px] border-[#d8e1ea] pl-8 text-sm"
              />
            </div>
          ) : null}
          {sidePickerTab === "item" && !classicRevenueMode ? (
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
          ) : null}
          {sidePickerTab === "party" && !classicExpenseMode && !classicRevenueMode ? (
            <button type="button" className="mt-2 text-sm font-medium text-[#0f6cf6]" onClick={handleOpenPartyCreate}>
              + Add {partyRoleLabel}
            </button>
          ) : null}
          {sidePickerTab === "party" && classicExpenseMode ? (
            <button type="button" className="mt-2 text-sm font-medium text-[#0f6cf6]" onClick={() => handleOpenLedgerEditor("expense")}>
              + Add Ledger
            </button>
          ) : null}
          {sidePickerTab === "party" && classicRevenueMode ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="shrink-0 whitespace-nowrap text-sm font-medium text-[#0f6cf6]"
                onClick={() => handleOpenLedgerEditor("revenue")}
              >
                + Add Ledger
              </button>
              <p className="text-right text-xs text-[#8994a6]">Adds under Income → Other Income.</p>
            </div>
          ) : null}
          {sidePickerTab === "item" && classicRevenueMode ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="shrink-0 whitespace-nowrap text-sm font-medium text-[#0f6cf6]"
                onClick={() => handleOpenLedgerEditor("debtor")}
              >
                + Add New
              </button>
              <p className="text-right text-xs text-[#8994a6]">Only ledgers under Advances &amp; Others Receivable show here.</p>
            </div>
          ) : null}
          {sidePickerTab === "item" && !classicExpenseMode && !classicRevenueMode ? (
            <button type="button" className="mt-2 text-sm font-medium text-[#0f6cf6]" onClick={() => void handleOpenItemEditor()}>
              + Add Product
            </button>
          ) : null}
          {sidePickerTab === "item" && classicExpenseMode ? (
            <p className="mt-2 text-xs text-[#8994a6]">Type a description in the item field — it's remembered here next time you use this ledger.</p>
          ) : null}
        </div>
        <div ref={sidePickerListRef} className="min-h-0 flex-1 overflow-y-auto">
          {sidePickerTab === "warehouse" ? (
            activeWarehouseItemName.trim() ? (
              pickerWarehouses.length ? (
                <>
                  <div className="border-b border-[#e4ebf5] bg-[#f8fbff] px-4 py-3">
                    <div className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-[#6f7d91]">Warehouse for</div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-[#1f2f46]">{activeWarehouseItemName}</div>
                    <div className="mt-1 text-xs text-[#8994a6]">
                      {isInboundWarehouseDocument() ? "Choose the destination. Current stock is shown for reference." : "Only warehouses with available stock are shown."}
                    </div>
                  </div>
                  {pickerWarehouses.map((warehouse, optionIndex) => (
                <button
                  key={warehouse.id}
                  type="button"
                  aria-pressed={warehouse.id === activeWarehouseId}
                  data-picker-index={optionIndex}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#eef2f7] px-4 py-3 text-left transition hover:bg-[#f5f9ff]",
                    optionIndex === sidePickerHighlight ? "bg-[#eef5ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                    warehouse.id === activeWarehouseId ? "bg-[#f0fdf7]" : "",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setSidePickerHighlight(optionIndex)}
                  onClick={() => activeWarehouseRowIndex !== null && applyWarehousePickerSelection(activeWarehouseRowIndex, warehouse)}
                >
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-[#1f2f46]">{warehouse.name}</span>
                      {warehouse.id === activeWarehouseId ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Selected warehouse" /> : null}
                      {warehouse.isDefault ? <span className="shrink-0 rounded-full bg-[#eef4ff] px-1.5 py-0.5 text-[9px] font-semibold text-[#315b96]">Default</span> : null}
                    </span>
                    <span className="block truncate text-xs text-[#8994a6]">
                      {warehouse.code}{warehouse.type ? ` · ${warehouse.type.replaceAll("_", " ")}` : ""}
                    </span>
                    {warehouse.address ? <span className="mt-0.5 block truncate text-[10px] text-[#a0aaba]">{warehouse.address}</span> : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-[#8994a6]">Available</span>
                    <span className={cn("block text-sm font-bold tabular-nums", warehouse.quantity > 0 ? "text-emerald-700" : "text-[#6f7d91]")}>{formatNumber(warehouse.quantity)} {warehouse.unit}</span>
                  </span>
                </button>
                  ))}
                </>
              ) : (
                <div className="px-4 py-6 text-center text-sm leading-6 text-[#8994a6]">
                  {!warehouseOptionsLoaded
                    ? "Loading warehouses…"
                    : isInboundWarehouseDocument()
                      ? "No active warehouse is available. Create one under Warehouses first."
                      : voucherType === "debit-note"
                        ? "No warehouse holds this item, so there is no stock to return. Pick the original bill above to bring its warehouse across."
                        : "No warehouse holds this item, so this outgoing line has no stock to draw from."}
                </div>
              )
            ) : (
              <div className="px-4 py-6 text-center text-sm text-[#8994a6]">Select an item to see warehouse stock.</div>
            )
          ) : sidePickerTab === "party" ? (
            classicExpenseMode ? (
              pagedCategories.length ? (
                pagedCategories.map((category, optionIndex) => (
                  <button
                    key={category}
                    type="button"
                    data-picker-index={pageStart + optionIndex}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 border-b border-[#eef2f7] px-4 py-2.5 text-left text-sm font-medium text-[#1f2f46] transition hover:bg-[#f5f9ff]",
                      pageStart + optionIndex === sidePickerHighlight ? "bg-[#eef5ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyExpenseLedgerSelection(category)}
                  >
                    <span className="min-w-0 truncate">{category}</span>
                    <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-[#52657e]">
                      {formatLedgerCurrentBalance(expenseLedgerAccounts.find((account) => account.name === category)?.currentBalance)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-sm text-[#8994a6]">No expense ledger found.</div>
              )
            ) : classicRevenueMode ? (
              pagedRevenueLedgers.length ? (
                pagedRevenueLedgers.map((ledger, optionIndex) => (
                  <button
                    key={ledger.id}
                    type="button"
                    data-picker-index={pageStart + optionIndex}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 border-b border-[#eef2f7] px-4 py-2.5 text-left text-sm font-medium text-[#1f2f46] transition hover:bg-[#f5f9ff]",
                      pageStart + optionIndex === sidePickerHighlight ? "bg-[#eef5ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyRevenueLedgerSelection(ledger.name)}
                  >
                    <span className="min-w-0 truncate">{ledger.name}</span>
                    <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-[#52657e]">{formatLedgerCurrentBalance(ledger.currentBalance)}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-sm text-[#8994a6]">No income ledger found.</div>
              )
            ) : pagedParties.length ? (
              pagedParties.map((party, optionIndex) => (
                <button
                  key={party.id}
                  type="button"
                  data-picker-index={pageStart + optionIndex}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#eef2f7] px-4 py-2.5 text-left transition hover:bg-[#f5f9ff]",
                    pageStart + optionIndex === sidePickerHighlight ? "bg-[#eef5ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyPartySelection(party)}
                >
                  <span className="min-w-0">
                    <span className="block w-full truncate text-sm font-medium text-[#1f2f46]">{party.name}</span>
                    <span className="block w-full truncate text-xs text-[#8994a6]">{party.contact || "No contact"}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-[#52657e]">{formatPartyCurrentBalance(party)}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-[#8994a6]">No {partyRoleLabel.toLowerCase()} found.</div>
            )
          ) : classicRevenueMode ? (
            pagedDebtorLedgers.length ? (
              pagedDebtorLedgers.map((ledger, optionIndex) => (
                <button
                  key={ledger.id}
                  type="button"
                  data-picker-index={pageStart + optionIndex}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 border-b border-[#eef2f7] px-4 py-2.5 text-left text-sm font-medium text-[#1f2f46] transition hover:bg-[#f5f9ff]",
                    pageStart + optionIndex === sidePickerHighlight ? "bg-[#eef5ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyDebtorLedgerSelection(ledger.name)}
                >
                  <span className="min-w-0 truncate">{ledger.name}</span>
                  <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-[#52657e]">{formatLedgerCurrentBalance(ledger.currentBalance)}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-[#8994a6]">No debtor ledger found.</div>
            )
          ) : pagedItems.length ? (
            pagedItems.map((item, optionIndex) => {
              const lastRate = findLastRate(item.itemName, form.getValues("partyName") ?? "");
              const itemKey = `${item.itemCode || "item"}-${item.itemName}-${pageStart + optionIndex}`;
              const showAlias = itemPickerNameMode === "alias" && item.alias;
              const primaryLabel = showAlias ? item.alias : item.itemName;
              const secondaryLabel = showAlias ? item.itemName : item.alias;
              return (
                <button
                  key={itemKey}
                  type="button"
                  data-picker-index={pageStart + optionIndex}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 border-b border-[#eef2f7] px-4 py-3 text-left transition hover:bg-[#f5f9ff]",
                    pageStart + optionIndex === sidePickerHighlight ? "bg-[#eef5ff] ring-1 ring-inset ring-[#9fc1f3]" : "",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (activeItemRowIndex !== null) {
                      applyInventoryItemToRow(activeItemRowIndex, item);
                      return;
                    }

                    handlePickInventoryItemFromPanel(item);
                  }}
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
                    <span className="text-xs font-medium text-[#48566b]">{formatCurrency(lastRate ? lastRate.rate : item.rate)}</span>
                    {!classicExpenseMode ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          item.qty > 0 ? "bg-[#eef4ff] text-[#315b96]" : "bg-[#fdeceb] text-[#b3261e]",
                        )}
                        title="Stock in hand"
                      >
                        {formatNumber(item.qty)} {item.unit || "pcs"}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-6 text-center text-sm text-[#8994a6]">No item found.</div>
          )}
        </div>
        {sidePickerTab !== "warehouse" && !showAllExpenseLedgers && totalPickerCount > SIDE_PICKER_PAGE_SIZE ? (
          <TablePagination
            page={sidePickerPage}
            pageSize={SIDE_PICKER_PAGE_SIZE}
            totalItems={totalPickerCount}
            pageSizeOptions={[SIDE_PICKER_PAGE_SIZE]}
            onPageChange={setSidePickerPage}
            onPageSizeChange={() => {}}
            showPageSizeSelector={false}
            showPageIndicator={false}
            iconOnlyNavigation
            summary={`${sidePickerPage} / ${Math.max(1, Math.ceil(totalPickerCount / SIDE_PICKER_PAGE_SIZE))}`}
            className="shrink-0 px-3 py-2 text-xs"
          />
        ) : null}
      </aside>
    );
  }

  const invoiceItemCount = watchedInvoiceItems.filter((item) => item.itemName.trim() || Number(item.quantity || 0) > 0).length;
  const invoiceQuantityTotal = watchedInvoiceItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const invoiceNumber =
    form.watch("reference")?.trim() || buildAutoInvoiceNumber(voucherType, form.watch("voucherDate") || new Date().toISOString().slice(0, 10), workflow);
  const sourceWorkflowReference =
    sourceDocumentReference ??
    loadedVoucher?.lines.find((line) => line.billReference?.trim())?.billReference?.trim() ??
    "";
  const effectiveTotals = classicEntryMode
    ? { debit: invoiceNetTotal, credit: invoiceNetTotal }
    : totals;
  const effectiveDifference = classicEntryMode ? 0 : difference;
  const adjustmentIsBalanced =
    effectiveTotals.debit > 0 &&
    effectiveTotals.credit > 0 &&
    moneyAmountsEqual(effectiveTotals.debit, effectiveTotals.credit);
  const inventoryLookup = useMemo(
    () => new Map(inventoryOptions.map((item) => [normalizeLookupValue(item.itemName), item])),
    [inventoryOptions],
  );

  /**
   * Rate history for the price suggestion: the last rate used for an item, plus
   * the last rate used for that item with a specific party. Buying and selling
   * rates are kept apart so a purchase never suggests a sale price.
   */
  const rateHistory = useMemo(() => {
    const byItem = new Map<string, number>();
    const byPartyItem = new Map<string, number>();
    const relevantTypes: VoucherType[] = classicExpenseMode
      ? ["expense"]
      : voucherType === "sales" || voucherType === "credit-note"
        ? ["sales", "credit-note"]
        : ["purchase", "debit-note"];

    [...historyVouchers]
      .sort((left, right) => left.voucherDate.localeCompare(right.voucherDate) || left.id.localeCompare(right.id))
      .filter((voucher) => relevantTypes.includes(voucher.voucherType))
      .forEach((voucher) => {
        (voucher.inventoryItems ?? []).forEach((line) => {
          const key = normalizeLookupValue(line.itemName);
          const price = Number(line.unitPrice || 0);
          if (!key || price <= 0) {
            return;
          }

          byItem.set(key, price);
          const partyKey = normalizeLookupValue(voucher.partyName);
          if (partyKey) {
            byPartyItem.set(`${partyKey}|${key}`, price);
          }
        });
      });

    return { byItem, byPartyItem };
  }, [classicExpenseMode, historyVouchers, voucherType]);

  function findLastRate(itemName: string, partyName: string) {
    const itemKey = normalizeLookupValue(itemName);
    if (!itemKey) {
      return null;
    }

    const partyKey = normalizeLookupValue(partyName);
    const partyRate = partyKey ? rateHistory.byPartyItem.get(`${partyKey}|${itemKey}`) : undefined;
    if (partyRate !== undefined) {
      return { rate: partyRate, source: "party" as const };
    }

    const itemRate = rateHistory.byItem.get(itemKey);
    return itemRate !== undefined ? { rate: itemRate, source: "item" as const } : null;
  }

  /**
   * An expense has no stock catalogue behind it — "China Mobile" or "Samsung LED
   * TV" have no business showing up as a suggestion when recording, say, a Fuel
   * expense. Instead this offers whatever free-text particulars (e.g. "Diesel",
   * "Toll Fee") were actually typed under this SAME expense ledger before, drawn
   * straight from this workspace's own expense voucher history — nothing new to
   * maintain, and it naturally narrows to what's actually relevant to this ledger.
   */
  function getExpenseParticularOptions(ledgerName: string): InventoryOptionRecord[] {
    const ledgerKey = normalizeLookupValue(ledgerName);
    if (!ledgerKey) {
      return [];
    }

    const lastRateByName = new Map<string, { itemName: string; rate: number; voucherDate: string }>();
    historyVouchers
      .filter((voucher) => voucher.voucherType === "expense" && normalizeLookupValue(voucher.partyName) === ledgerKey)
      .forEach((voucher) => {
        (voucher.inventoryItems ?? []).forEach((line) => {
          const key = normalizeLookupValue(line.itemName);
          if (!key) {
            return;
          }

          const existing = lastRateByName.get(key);
          if (!existing || voucher.voucherDate >= existing.voucherDate) {
            lastRateByName.set(key, { itemName: line.itemName, rate: Number(line.unitPrice || 0), voucherDate: voucher.voucherDate });
          }
        });
      });

    return Array.from(lastRateByName.values())
      .sort((left, right) => right.voucherDate.localeCompare(left.voucherDate))
      .map((entry) => ({
        itemCode: "",
        itemName: entry.itemName,
        category: "Expense",
        unit: "",
        qty: 0,
        rate: entry.rate,
        reorderLevel: 0,
      }));
  }

  /**
   * What the Quick Picker's Item tab actually offers for this expense ledger:
   * its own curated item list first (set up via Chart of Accounts -> Manage
   * Items — e.g. "Office Stationery" -> "A4 Paper", "Pen"), then whatever was
   * typed under this ledger before that isn't already in that list, so older
   * free-text particulars aren't lost once a curated list gets added later.
   */
  function getExpenseItemOptions(ledgerName: string): InventoryOptionRecord[] {
    const curated: InventoryOptionRecord[] = (expenseLedgerItemsQuery.data ?? []).map((item) => ({
      itemCode: "",
      itemName: item.name,
      category: "Expense",
      unit: item.unit,
      qty: 0,
      rate: 0,
      reorderLevel: 0,
    }));
    const curatedKeys = new Set(curated.map((item) => normalizeLookupValue(item.itemName)));
    const historical = getExpenseParticularOptions(ledgerName).filter((item) => !curatedKeys.has(normalizeLookupValue(item.itemName)));
    return [...curated, ...historical];
  }

  const documentTitle =
    isAdjustmentPosting
      ? "Journal (Adjustment Posting)"
      : voucherType === "payment"
      ? "Payment-Out Voucher"
      : voucherType === "purchase" && (workflow === "purchase-order" || workflow === "receipt-note")
        ? getPurchaseWorkflowDocumentLabel(workflow)
        : labels[voucherType];
  const isPurchaseOrderWorkflow = voucherType === "purchase" && workflow === "purchase-order";
  const isReceiptNoteWorkflow = voucherType === "purchase" && workflow === "receipt-note";
  const isPurchaseWorkflowDocument = isPurchaseOrderWorkflow || isReceiptNoteWorkflow;
  // Mirrors isPurchaseOrderWorkflow on the sales side: same card layout, same
  // pre-ledger behavior (stays "pending", no GL lines until converted).
  const isSaleOrderWorkflow = voucherType === "sales" && workflow === "sale-order";
  // Mirrors isReceiptNoteWorkflow on the sales side: goods actually leave the
  // warehouse here (real stock movement / COGS posting), so — like a receipt
  // note — this is deliberately NOT part of isPreLedgerDocument below.
  const isDeliveryNoteWorkflow = voucherType === "sales" && workflow === "delivery-note";
  const isNewRootTransaction = !editingVoucherId && templateSourceMode !== "fromVoucher";
  const editingOrderFlowVoucher = Boolean(
    editingVoucherId &&
    (loadedVoucher?.workflowOrigin === "ORDER_FLOW" || loadedVoucher?.sourceVoucherId),
  );
  const requiresReceiptNoteSource =
    classicPurchaseMode &&
    !isPurchaseOrderWorkflow &&
    !isReceiptNoteWorkflow &&
    (
      (templateSourceMode === "fromVoucher" && loadedVoucher?.documentKind === "receipt-note") ||
      editingOrderFlowVoucher ||
      (isNewRootTransaction && workflowSettings.purchaseWorkflow === "ORDER_BASED")
    );
  const requiresDeliveryNoteSource =
    classicSalesInvoiceMode &&
    !isSaleOrderWorkflow &&
    !isDeliveryNoteWorkflow &&
    (
      (templateSourceMode === "fromVoucher" && loadedVoucher?.documentKind === "delivery-note") ||
      editingOrderFlowVoucher ||
      (isNewRootTransaction && workflowSettings.salesWorkflow === "ORDER_BASED")
    );
  const workflowSettingsLoadState: WorkflowSettingsLoadState = workflowSettingsQuery.isError
    ? "ERROR"
    : workflowSettingsQuery.isPending
      ? "PENDING"
      : "READY";
  const newRootKind = !isNewRootTransaction
    ? null
    : isPurchaseOrderWorkflow || isSaleOrderWorkflow
      ? "ORDER_BASED" as const
      : isReceiptNoteWorkflow || isDeliveryNoteWorkflow
        ? null
        : classicPurchaseMode || classicSalesInvoiceMode
          ? "DIRECT" as const
          : null;
  const newRootPolicy = voucherType === "purchase"
    ? workflowSettings.purchaseWorkflow
    : voucherType === "sales"
      ? workflowSettings.salesWorkflow
      : null;
  const newRootWorkflowAccess = newRootKind && newRootPolicy
    ? evaluateWorkflowRootAccess(newRootPolicy, newRootKind, workflowSettingsLoadState)
    : null;
  const usesOrderWorkflowLayout = isPurchaseWorkflowDocument || isSaleOrderWorkflow || isDeliveryNoteWorkflow;
  const usesReceiptNoteLayout = isReceiptNoteWorkflow || isDeliveryNoteWorkflow;
  const usesOrderDocumentLayout = isPurchaseOrderWorkflow || isSaleOrderWorkflow;
  const purchaseWorkflowItemGridColumns = usesReceiptNoteLayout
    ? "grid-cols-[36px_minmax(120px,1fr)_64px_70px_96px_106px_minmax(110px,0.5fr)_40px]"
    : "grid-cols-[36px_minmax(0,1fr)_74px_82px_108px_120px_40px]";

  useEffect(() => {
    if (
      !newRootWorkflowAccess ||
      newRootWorkflowAccess.allowed ||
      newRootWorkflowAccess.reason !== "POLICY_MISMATCH" ||
      newRootKind !== "ORDER_BASED" ||
      newRootPolicy !== "DIRECT"
    ) {
      return;
    }

    const blockedRequestKey = `${voucherType}:${workflow ?? "direct"}:${duplicateVoucherId ?? "new"}`;
    if (workflowGuardRequestRef.current === blockedRequestKey) {
      return;
    }
    workflowGuardRequestRef.current = blockedRequestKey;
    toast.info(`${voucherType === "purchase" ? "Purchase" : "Sales"} workflow is in Direct Mode. Existing order history remains available, but a new order cannot be started.`);
    router.replace(
      buildWorkspaceRoute(
        mode,
        voucherType === "purchase" ? "/purchase/orders" : "/sales/sale-order",
      ),
    );
  }, [duplicateVoucherId, mode, newRootKind, newRootPolicy, newRootWorkflowAccess, router, voucherType, workflow]);
  // Purchase Bill's item grid gets an extra per-row Warehouse column, same idea as
  // the Receipt Note grid above — a bill converted from a receipt note already has
  // the right warehouse per line (see applyMultiReceiptNoteSelection), the user can
  // still change it per row, and there's no longer a single document-level
  // warehouse field for this voucher type (see the classic form section below).
  // Same column order everywhere now: #, Item, Qty, Unit, Price, Amount, Warehouse,
  // remove. Item and Warehouse share the leftover width two-to-one (the same shape
  // the Receipt Note grid above uses) instead of Item swallowing all of it and
  // leaving the warehouse select truncated to "WH-MA...".
  const classicPurchaseItemGridColumns =
    "grid-cols-[32px_minmax(160px,1fr)_92px_68px_96px_104px_minmax(150px,0.5fr)_40px]";

  function renderManufacturingSaleProvenance(index: number) {
    const line = watchedInvoiceItems[index];
    if (!line?.itemName || !manufacturingSaleProvenance) return null;
    const trackedItem = manufacturingSaleProvenance.trackedItems.find(
      (item) => normalizeLookupValue(item.itemName) === normalizeLookupValue(line.itemName),
    );
    if (!trackedItem && !line.manufacturingInventoryLotId) return null;

    const sourceLine = isSalesReturnMode
      ? loadedVoucher?.inventoryItems?.find((item) => item.id === line.sourceInventoryLineId)
      : undefined;
    const selectedSerialIds = line.manufacturingSerialIds ?? [];
    const allowedReturnSerialIds = new Set(sourceLine?.manufacturingSerialIds ?? selectedSerialIds);
    const lots = manufacturingSaleProvenance.lots.filter((lot) => {
      if (trackedItem && lot.inventoryItemId !== trackedItem.id) return false;
      if (line.manufacturingInventoryLotId === lot.id) return true;
      if (isSalesReturnMode) return false;
      // The provenance endpoint exposes only the configured FG-R warehouse.
      // Show those lots even when a new invoice row initially inherited the
      // general/default warehouse; selecting the lot atomically switches the
      // row to its authoritative FG-R warehouse below.
      return lot.warehouse.allowSales && lot.availableQuantity - lot.reservedQuantity > 0;
    });
    const selectedLot = lots.find((lot) => lot.id === line.manufacturingInventoryLotId);
    const serialOptions = (selectedLot?.serials ?? []).filter((serial) =>
      isSalesReturnMode
        ? serial.status === "CONSUMED" && allowedReturnSerialIds.has(serial.id)
        : serial.status === "RELEASED" || selectedSerialIds.includes(serial.id),
    );
    const serialRequired = Boolean(trackedItem?.serialTracked || selectedLot?.serialTracked);

    return (
      <div className="mt-1 grid gap-1 rounded-[5px] border border-[#bfdbfe] bg-[#eff6ff] p-1.5">
        <select
          data-manufacturing-lot-row={index}
          aria-label={`Released manufacturing lot for item row ${index + 1}`}
          className="h-8 min-w-0 rounded border border-[#93b4dd] bg-white px-1 text-[11px] font-medium text-[#1e3a5f] outline-none focus:border-[#2583ea]"
          value={line.manufacturingInventoryLotId ?? ""}
          onChange={(event) => {
            const lot = manufacturingSaleProvenance.lots.find((candidate) => candidate.id === event.target.value);
            form.setValue(`invoiceItems.${index}.manufacturingInventoryLotId`, lot?.id, { shouldDirty: true, shouldTouch: true });
            form.setValue(`invoiceItems.${index}.manufacturingSerialIds`, [], { shouldDirty: true, shouldTouch: true });
            if (lot) {
              form.setValue(`invoiceItems.${index}.warehouseId`, lot.warehouse.id, { shouldDirty: true, shouldTouch: true });
              form.setValue(`invoiceItems.${index}.warehouseSelectionOrigin`, "user", { shouldDirty: true });
            }
          }}
        >
          <option value="">{lots.length ? "Select FG-R lot" : "No released FG-R lot"}</option>
          {lots.map((lot) => (
            <option key={lot.id} value={lot.id}>
              {lot.lotNumber} · {formatNumber(Math.max(0, lot.availableQuantity - lot.reservedQuantity))} {lot.unit}
            </option>
          ))}
        </select>
        {serialRequired && selectedLot ? (
          <select
            multiple
            size={Math.min(3, Math.max(2, serialOptions.length))}
            aria-label={`Manufacturing serial numbers for item row ${index + 1}`}
            className="min-h-12 min-w-0 rounded border border-[#93b4dd] bg-white px-1 text-[11px] text-[#1e3a5f] outline-none focus:border-[#2583ea]"
            value={selectedSerialIds}
            onChange={(event) => {
              const serialIds = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
              form.setValue(`invoiceItems.${index}.manufacturingSerialIds`, serialIds, { shouldDirty: true, shouldTouch: true });
            }}
          >
            {serialOptions.map((serial) => (
              <option key={serial.id} value={serial.id}>{serial.serialNumber}</option>
            ))}
          </select>
        ) : null}
        <span className="text-[10px] leading-3 text-[#4d6b91]">
          {serialRequired ? `${selectedSerialIds.length}/${Number(line.quantity || 0)} serial selected` : "QA-released stock only"}
        </span>
      </div>
    );
  }
  const activeWarehouseIds = useMemo(() => new Set(warehouseOptions.map((warehouse) => warehouse.id)), [warehouseOptions]);
  const receiptWarehouseHistory = useMemo(() => {
    const byItem = new Map<string, string>();
    const byPartyItem = new Map<string, string>();
    const receiptNoteIds = new Set(
      historyVouchers
        .filter((voucher) => voucher.voucherType === "purchase" && voucher.documentKind === "receipt-note")
        .map((voucher) => voucher.id),
    );

    [...historyVouchers]
      .filter(
        (voucher) =>
          voucher.status === "posted" &&
          voucher.voucherType === "purchase" &&
          (voucher.documentKind === "receipt-note" ||
            ((voucher.documentKind === "bill" || !voucher.documentKind) &&
              (!voucher.sourceVoucherId || !receiptNoteIds.has(voucher.sourceVoucherId)))),
      )
      .sort(
        (left, right) =>
          left.voucherDate.localeCompare(right.voucherDate) ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .forEach((voucher) => {
        (voucher.inventoryItems ?? []).forEach((line) => {
          const itemKey = normalizeLookupValue(line.itemName);
          const warehouseId = line.warehouseId ?? voucher.warehouseId ?? "";
          if (itemKey && activeWarehouseIds.has(warehouseId)) {
            byItem.set(itemKey, warehouseId);
            const partyKey = normalizeLookupValue(voucher.partyName);
            if (partyKey) {
              byPartyItem.set(`${partyKey}|${itemKey}`, warehouseId);
            }
          }
        });
      });

    return { byItem, byPartyItem };
  }, [activeWarehouseIds, historyVouchers]);
  const receiptWarehouseFallbackId =
    warehouseOptions.find((warehouse) => warehouse.isDefault)?.id || warehouseOptions[0]?.id || "";
  const historicalReceiptWarehouses = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; code: string }>();
    watchedInvoiceItems.forEach((item) => {
      if (!item.warehouseId || activeWarehouseIds.has(item.warehouseId)) {
        return;
      }
      byId.set(
        item.warehouseId,
        item.warehouseSnapshot ?? {
          id: item.warehouseId,
          name: "Previous warehouse",
          code: item.warehouseId.slice(0, 8),
        },
      );
    });
    return byId;
  }, [activeWarehouseIds, watchedInvoiceItems]);

  // Editing, duplicating and conversions keep any warehouse already saved on the
  // line, including a historical/inactive one. Only genuinely unassigned rows are
  // inferred from posted inbound purchasing history and then the active default.
  useEffect(() => {
    if (
      !isReceiptNoteWorkflow ||
      editLoading ||
      !warehouseOptionsLoaded ||
      !historyVouchersLoaded ||
      warehouseOptions.length > 1
    ) {
      return;
    }

    form.getValues("invoiceItems").forEach((item, index) => {
      if (
        !item.itemName.trim() ||
        item.warehouseSelectionOrigin === "source" ||
        item.warehouseSelectionOrigin === "user"
      ) {
        return;
      }

      const itemKey = normalizeLookupValue(item.itemName);
      const partyKey = normalizeLookupValue(watchedPartyName);
      const inferredWarehouseId =
        (partyKey ? receiptWarehouseHistory.byPartyItem.get(`${partyKey}|${itemKey}`) : "") ||
        receiptWarehouseHistory.byItem.get(itemKey) ||
        receiptWarehouseFallbackId;
      if (inferredWarehouseId && item.warehouseId !== inferredWarehouseId) {
        form.setValue(`invoiceItems.${index}.warehouseId`, inferredWarehouseId, {
          shouldDirty: false,
          shouldTouch: false,
        });
        form.setValue(`invoiceItems.${index}.warehouseSelectionOrigin`, "inferred", {
          shouldDirty: false,
          shouldTouch: false,
        });
      }
      receiptCommittedProductByRowRef.current.set(getReceiptRowIdentity(index), itemKey);
    });
  }, [
    activeWarehouseIds,
    editLoading,
    form,
    historyVouchersLoaded,
    isReceiptNoteWorkflow,
    loadedVoucher?.id,
    receiptWarehouseFallbackId,
    receiptWarehouseHistory,
    watchedPartyName,
    warehouseOptionsLoaded,
    warehouseOptions.length,
  ]);
  /**
   * Full-page documents are laid out as a fixed header + scrolling body + fixed action
   * bar, so the Save/Share row stays reachable no matter how long the item list gets.
   */
  const isPageDocumentLayout = displayMode === "page";
  /**
   * Documents that record an intention rather than money movement. They never
   * touch the ledger, so they stay editable instead of being locked on save.
  */
  const isPreLedgerDocument = isPurchaseOrderWorkflow || isSaleOrderWorkflow;
  // Same figure the Trial Balance report shows for each ledger (getTrialBalanceRows,
  // the frontend calculation reports-workspace-screen.tsx actually renders — not the
  // separate backend buildTrialBalance, which can disagree with it), so a picker
  // showing a ledger's balance during posting never contradicts the report. Requires
  // historyVouchers, which the effect above now also loads for isAdjustmentPosting /
  // classicRevenueMode.
  const ledgerClosingBalanceByName = useMemo(() => {
    if (!session?.workspaceId || !historyVouchers.length) return new Map<string, number>();
    const rows = getTrialBalanceRows({ vouchers: historyVouchers } as AppDataset, session.workspaceId);
    return new Map(rows.map((row) => [row.ledger, row.closingBalance]));
  }, [historyVouchers, session?.workspaceId]);
  const journalLedgerOptions = useMemo(
    () =>
      (journalLedgersQuery.data ?? [])
        .filter((ledger) => ledger.status === "ACTIVE" && ledger.level === "LEDGER")
        .map((ledger) => ({ ...ledger, currentBalance: ledgerClosingBalanceByName.get(ledger.name) ?? 0 }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    [journalLedgersQuery.data, ledgerClosingBalanceByName],
  );
  const journalLedgerById = useMemo(
    () => new Map(journalLedgerOptions.map((ledger) => [ledger.id, ledger])),
    [journalLedgerOptions],
  );
  const filteredJournalLedgerOptions = useMemo(() => {
    const query = normalizeLookupValue(journalLedgerQuery);
    return journalLedgerOptions.filter((ledger) =>
      !query || [ledger.name, ledger.code, ledger.path].some((value) => normalizeLookupValue(value).includes(query)),
    );
  }, [journalLedgerOptions, journalLedgerQuery]);

  useEffect(() => {
    setJournalLedgerHighlight(filteredJournalLedgerOptions.length ? 0 : -1);
  }, [activeJournalLineIndex, journalLedgerQuery, filteredJournalLedgerOptions.length]);

  useEffect(() => {
    if (journalLedgerHighlight < 0) return;
    journalLedgerListRef.current
      ?.querySelector(`[data-journal-ledger-index="${journalLedgerHighlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [journalLedgerHighlight]);
  const expenseLedgerAccounts = useMemo(
    () =>
      (expenseLedgersQuery.data ?? [])
        .filter(
          (ledger) =>
            ledger.status === "ACTIVE" &&
            Boolean(ledger.parentId) &&
            (ledger.nature === "DIRECT_EXPENSE" || ledger.nature === "INDIRECT_EXPENSE"),
        )
        .map((ledger) => ({ ...ledger, currentBalance: ledgerClosingBalanceByName.get(ledger.name) ?? 0 })),
    [expenseLedgersQuery.data, ledgerClosingBalanceByName],
  );
  // "Other Income" is a real Chart of Accounts category (Income -> Other Income ->
  // Interest Income / Commission Income / ...) — matched by the immediate parent
  // segment of each ledger's own path so a custom income ledger added later shows up
  // here automatically, without ever excluding Sales Revenue's own ledgers (Product
  // Sales, Service Sales), which belong to the Sales module instead.
  const revenueLedgerAccounts = useMemo(
    () =>
      (revenueLedgersQuery.data ?? [])
        .filter((ledger) => {
          if (ledger.status !== "ACTIVE" || ledger.nature !== "INCOME") {
            return false;
          }
          const segments = ledger.path.split(" > ");
          return segments.length >= 2 && segments[segments.length - 2] === "Others Income (Non-Operating Income)";
        })
        .map((ledger) => ({ ...ledger, currentBalance: ledgerClosingBalanceByName.get(ledger.name) ?? 0 })),
    [revenueLedgersQuery.data, ledgerClosingBalanceByName],
  );
  const revenueLedgerParentId = useMemo(() => {
    function findNode(nodes: AccountNode[]): AccountNode | null {
      for (const node of nodes) {
        if (node.name === "Others Income (Non-Operating Income)") return node;
        const found = findNode(node.children);
        if (found) return found;
      }
      return null;
    }

    return findNode(accountTreeQuery.data ?? [])?.id ?? null;
  }, [accountTreeQuery.data]);
  // Revenue debtors/accrued receivables are kept under "Advances & Others
  // Receivable", matched by immediate parent so unrelated asset ledgers cannot
  // leak into this picker.
  const debtorLedgerAccounts = useMemo(
    () =>
      (revenueLedgersQuery.data ?? [])
        .filter((ledger) => {
          if (ledger.status !== "ACTIVE" || ledger.nature !== "ASSET" || ledger.isControlAccount) {
            return false;
          }
          const segments = ledger.path.split(" > ");
          return segments.length >= 2 && segments[segments.length - 2] === "Others Receivables";
        })
        .map((ledger) => ({ ...ledger, currentBalance: ledgerClosingBalanceByName.get(ledger.name) ?? 0 })),
    [revenueLedgersQuery.data, ledgerClosingBalanceByName],
  );
  // New Revenue debtor ledgers are filed directly under the same category shown
  // in the picker, keeping creation and subsequent selection consistent.
  const debtorLedgerParentId = useMemo(() => {
    function findNode(nodes: AccountNode[], names: string[]): AccountNode | null {
      for (const node of nodes) {
        if (names.includes(node.name)) {
          return node;
        }
        const found = findNode(node.children, names);
        if (found) {
          return found;
        }
      }
      return null;
    }

    const roots = accountTreeQuery.data ?? [];
    return findNode(roots, ["Others Receivables"])?.id ?? null;
  }, [accountTreeQuery.data]);
  const expensePayableLedgerAccounts = useMemo(
    () =>
      (expenseLedgersQuery.data ?? []).filter((ledger) => {
        if (ledger.status !== "ACTIVE" || ledger.level !== "LEDGER" || ledger.nature !== "LIABILITY") return false;
        const payableCategoryNames = new Set(["others payable", "other payables"]);
        const segments = ledger.path.split(" > ").map((segment) => segment.trim().toLowerCase());
        return segments.slice(0, -1).some((segment) => payableCategoryNames.has(segment));
      }),
    [expenseLedgersQuery.data],
  );
  const selectedExpensePayableLedger = useMemo(
    () => expensePayableLedgerAccounts.find((ledger) => ledger.name === watchedExpenseCreditLedger) ?? null,
    [expensePayableLedgerAccounts, watchedExpenseCreditLedger],
  );
  // Where a newly created expense ledger gets filed — left blank until the
  // operator explicitly searches and picks a Class/Category (e.g. "Indirect
  // Expenses" or a more specific one like "Administrative Expenses") in the
  // parent picker in the Add Ledger form below. No silent default, so a
  // ledger never files under the wrong category by inattention.
  const expenseLedgerParentId = expenseLedgerParentOverride;
  const selectedExpenseLedgerAccount = useMemo(
    () =>
      classicExpenseMode
        ? expenseLedgerAccounts.find((ledger) => normalizeLookupValue(ledger.name) === normalizeLookupValue(watchedPartyName)) ?? null
        : null,
    [classicExpenseMode, expenseLedgerAccounts, watchedPartyName],
  );
  // Ledgers created before this flag existed (or in demo/local mode, where there's no
  // real ledger record to check) default to showing the item grid, matching the
  // behavior every expense ledger had before this setting was introduced.
  const expenseLedgerRequiresItems = mode === "api" ? (selectedExpenseLedgerAccount?.requiresItemDetails ?? true) : true;
  // The ledger's own curated item list (Chart of Accounts -> Manage Items),
  // scoped to whichever expense ledger is currently selected.
  const expenseLedgerItemsQuery = useLedgerItemsQuery(
    selectedExpenseLedgerAccount?.id ?? null,
    classicExpenseMode && mode === "api" && expenseLedgerRequiresItems,
  );
  const expenseLedgerOptions = useMemo(() => {
    if (mode === "api") {
      const names = new Set(expenseLedgerAccounts.map((ledger) => ledger.name));
      // A just-added ledger shows up immediately from this local list, even for the
      // brief window before the invalidated `expenseLedgersQuery` refetch resolves.
      localExpenseLedgerNames.forEach((name) => names.add(name));
      return Array.from(names).sort((left, right) => left.localeCompare(right));
    }

    const seeded = new Set(["Salary", "Rent", "Tea", "Transport", "Petrol", "Office Expense", ...localExpenseLedgerNames]);
    if (session?.workspaceId) {
      const dataset = readDataset(mode);
      dataset.vouchers
        .filter((voucher) => voucher.workspaceId === session.workspaceId && voucher.voucherType === "expense")
        .forEach((voucher) => {
          voucher.lines
            .filter((line) => Number(line.debit || 0) > 0)
            .forEach((line) => {
              if (line.ledger.trim()) {
                seeded.add(line.ledger.trim());
              }
            });
        });
    }

    if (loadedVoucher?.voucherType === "expense") {
      loadedVoucher.lines
        .filter((line) => Number(line.debit || 0) > 0)
        .forEach((line) => {
          if (line.ledger.trim()) {
            seeded.add(line.ledger.trim());
          }
        });
    }

    // Deliberately not adding the live-typed value here: this list now drives a real
    // filtered Quick Picker rather than a browser <datalist>, so echoing back whatever
    // is currently typed would show it as a redundant, confusing match of itself.
    return Array.from(seeded).sort((left, right) => left.localeCompare(right));
  }, [expenseLedgerAccounts, loadedVoucher, localExpenseLedgerNames, mode, session?.workspaceId]);

  useEffect(() => {
    if (!session?.workspaceId) {
      setPartyOptions([]);
      return;
    }

    if (mode === "api") {
      const type = isReceivableVoucher ? "customer" : "supplier";
      let active = true;

      void apiRequest<Array<{ id: string; ledgerAccountId?: string | null; name: string; contact: string | null; address: string | null; creditLimit: number; openingBalance?: number; status: string }>>(
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
              openingBalance: Number(party.openingBalance || 0),
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

      return;
    }

    const dataset = readDataset(mode);
    setPartyOptions(getPartyOptions(dataset, session.workspaceId, voucherType));
  }, [mode, session?.workspaceId, voucherType]);

  useEffect(() => {
    if (!inventoryAssistedVoucher || !session?.workspaceId) {
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
  }, [inventoryAssistedVoucher, mode, session?.workspaceId]);

  // Past vouchers power the "last rate" suggestion on the price column, the
  // party's outstanding bills a payment can be applied against, and — for the
  // Journal/Expense/Revenue ledger pickers — the same closing-balance figure
  // the Trial Balance report shows (getTrialBalanceRows), so a picker never
  // disagrees with the report over a ledger's balance.
  useEffect(() => {
    if ((!inventoryAssistedVoucher && !classicPaymentMode && !isAdjustmentPosting && !classicRevenueMode) || !session?.workspaceId) {
      setHistoryVouchers([]);
      setHistoryVouchersLoaded(true);
      return;
    }

    let active = true;
    setHistoryVouchersLoaded(false);
    void listDayBook(mode, { workspaceId: session.workspaceId })
      .then((rows) => {
        if (active) {
          setHistoryVouchers(rows);
          setHistoryVouchersLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setHistoryVouchers([]);
          setHistoryVouchersLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [classicPaymentMode, classicRevenueMode, inventoryAssistedVoucher, isAdjustmentPosting, mode, session?.workspaceId]);

  useEffect(() => {
    if (!matchedParty) {
      return;
    }

    if (matchedParty.address && form.getValues("supplierAddress") !== matchedParty.address) {
      form.setValue("supplierAddress", matchedParty.address, { shouldDirty: true });
    }

    if (simpleInvoiceMode) {
      const signatureField = isReceivableVoucher ? "buyerSignature" : "sellerSignature";
      if (form.getValues(signatureField) !== matchedParty.name) {
        form.setValue(signatureField, matchedParty.name, { shouldDirty: true });
      }
    }
  }, [form, isReceivableVoucher, matchedParty, simpleInvoiceMode]);

  function findInventoryOption(itemName: string) {
    return inventoryLookup.get(normalizeLookupValue(itemName));
  }

  /** An Expense ledger with "Require item details" checked validates against
   * its OWN curated/previously-used item list (getExpenseItemOptions), not the
   * Sales/Purchase product catalog — findInventoryOption alone only knows
   * about that catalog, so a valid ledger item (e.g. "A4 Paper" under Office
   * Stationery) would otherwise be rejected even though it's right there in
   * the same Quick Picker the operator was told to pick it from. */
  function isValidItemSelection(itemName: string) {
    if (findInventoryOption(itemName)) {
      return true;
    }
    if (!classicExpenseMode) {
      return false;
    }
    const normalized = normalizeLookupValue(itemName);
    return getExpenseItemOptions(watchedPartyName).some((item) => normalizeLookupValue(item.itemName) === normalized);
  }

  function getReceiptRowIdentity(index: number) {
    return form.getValues(`invoiceItems.${index}.id`) || invoiceItems.fields[index]?.id || `receipt-row-${index}`;
  }

  function seedReceiptCommittedProducts(items: VoucherFormValues["invoiceItems"]) {
    receiptCommittedProductByRowRef.current.clear();
    items.forEach((item, index) => {
      const itemKey = normalizeLookupValue(item.itemName);
      if (itemKey) {
        receiptCommittedProductByRowRef.current.set(item.id || `receipt-row-${index}`, itemKey);
      }
    });
  }

  function findSuggestedReceiptWarehouse(itemName: string) {
    if (!warehouseOptionsLoaded || !historyVouchersLoaded) {
      return "";
    }
    const itemKey = normalizeLookupValue(itemName);
    const partyKey = normalizeLookupValue(form.getValues("partyName") ?? "");
    return (
      (partyKey && itemKey ? receiptWarehouseHistory.byPartyItem.get(`${partyKey}|${itemKey}`) : "") ||
      (itemKey ? receiptWarehouseHistory.byItem.get(itemKey) : "") ||
      receiptWarehouseFallbackId
    );
  }

  function handleInventoryItemNameChange(index: number, itemName: string) {
    const matchedItem = findInventoryOption(itemName);
    if (!matchedItem) {
      return;
    }

    const rowIdentity = getReceiptRowIdentity(index);
    const nextProductKey = normalizeLookupValue(matchedItem.itemName);
    const committedProductKey = receiptCommittedProductByRowRef.current.get(rowIdentity);

    if (form.getValues(`invoiceItems.${index}.itemName`) !== matchedItem.itemName) {
      form.setValue(`invoiceItems.${index}.itemName`, matchedItem.itemName, { shouldDirty: true, shouldTouch: true });
    }
    form.setValue(`invoiceItems.${index}.unit`, matchedItem.unit || "pcs", { shouldDirty: true, shouldTouch: true });

    // Prefer the rate last agreed with this party, then the item's last rate.
    const lastRate = findLastRate(matchedItem.itemName, form.getValues("partyName") ?? "");
    form.setValue(`invoiceItems.${index}.unitPrice`, lastRate ? lastRate.rate : Number(matchedItem.rate || 0), {
      shouldDirty: true,
      shouldTouch: true,
    });

    if (isReceiptNoteWorkflow) {
      const productChanged = Boolean(committedProductKey && committedProductKey !== nextProductKey);
      const currentWarehouseId = form.getValues(`invoiceItems.${index}.warehouseId`);
      const warehouseSelectionOrigin = form.getValues(`invoiceItems.${index}.warehouseSelectionOrigin`);
      if (productChanged || (!currentWarehouseId && warehouseSelectionOrigin !== "source")) {
        const suggestedWarehouseId = findSuggestedReceiptWarehouse(matchedItem.itemName);
        form.setValue(`invoiceItems.${index}.warehouseId`, suggestedWarehouseId, {
          shouldDirty: true,
          shouldTouch: false,
        });
        form.setValue(`invoiceItems.${index}.warehouseSnapshot`, undefined, {
          shouldDirty: productChanged,
          shouldTouch: false,
        });
        form.setValue(`invoiceItems.${index}.warehouseSelectionOrigin`, suggestedWarehouseId ? "inferred" : undefined, {
          shouldDirty: productChanged,
          shouldTouch: false,
        });
      }
    }

    receiptCommittedProductByRowRef.current.set(rowIdentity, nextProductKey);
  }

  /** Hint shown under the price cell so the user knows where the number came from. */
  function getLastRateHint(index: number) {
    const itemName = watchedInvoiceItems[index]?.itemName ?? "";
    if (!itemName.trim()) {
      return null;
    }

    const lastRate = findLastRate(itemName, form.watch("partyName") ?? "");
    if (!lastRate) {
      return null;
    }

    return {
      ...lastRate,
      label:
        lastRate.source === "party"
          ? `Last with this ${partyRoleLabel.toLowerCase()}: ${formatCurrency(lastRate.rate)}`
          : `Last rate: ${formatCurrency(lastRate.rate)}`,
    };
  }

  function getLineRoleLabel(index: number) {
    const side = resolveLinePostingSide(voucherType, index, watchedLines[index]);
    return side === "debit" ? "Main Line" : "Balance Line";
  }

  function getLineAmount(index: number) {
    const line = watchedLines[index];
    return Math.max(Number(line?.debit || 0), Number(line?.credit || 0));
  }

  function handleSimpleAmountChange(index: number, value: string) {
    const parsedAmount = Number(value);
    const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
    const side = resolveLinePostingSide(voucherType, index, form.getValues(`lines.${index}`));
    form.setValue(`lines.${index}.postingSide`, side, { shouldDirty: true, shouldTouch: true });
    form.setValue(`lines.${index}.debit`, side === "debit" ? amount : 0, { shouldDirty: true, shouldTouch: true });
    form.setValue(`lines.${index}.credit`, side === "credit" ? amount : 0, { shouldDirty: true, shouldTouch: true });

    // In the standard two-line Simple view, entering either side immediately
    // updates its opposite balancing line. Extra rows switch to manual split
    // allocation so operators can distribute an amount across several ledgers.
    if (lines.fields.length === 2) {
      const balancingIndex = index === 0 ? 1 : 0;
      const balancingSide: PostingSide = side === "debit" ? "credit" : "debit";
      form.setValue(`lines.${balancingIndex}.postingSide`, balancingSide, { shouldDirty: true, shouldTouch: true });
      form.setValue(`lines.${balancingIndex}.debit`, balancingSide === "debit" ? amount : 0, { shouldDirty: true, shouldTouch: true });
      form.setValue(`lines.${balancingIndex}.credit`, balancingSide === "credit" ? amount : 0, { shouldDirty: true, shouldTouch: true });
    }
  }

  function handlePostingSideChange(index: number, side: PostingSide) {
    const line = form.getValues(`lines.${index}`);
    const amount = Math.max(Number(line.debit || 0), Number(line.credit || 0));
    form.setValue(`lines.${index}.postingSide`, side, { shouldDirty: true, shouldTouch: true });
    form.setValue(`lines.${index}.debit`, side === "debit" ? amount : 0, { shouldDirty: true, shouldTouch: true });
    form.setValue(`lines.${index}.credit`, side === "credit" ? amount : 0, { shouldDirty: true, shouldTouch: true });
  }

  /** Opens the full party form over this voucher, pre-filled with whatever name the
   * operator had already typed in the party box. */
  function handleOpenPartyCreate() {
    const typedName = (form.getValues("partyName") ?? "").trim();
    const partyType = isReceivableVoucher ? "customer" : "supplier";
    setPartyCreateSeed({ ...createDefaultPartyFormState(partyType), name: typedName });
    if (session?.workspaceId) {
      setPartyFieldSettings(readStoredPartySettings(mode, session.workspaceId, partyType));
    }
    setPartyCreateOpen(true);
  }

  /** The field-visibility toggles inside the form write to the same per-workspace key
   * the Customer & Suppliers screen uses, so a choice made here is not a separate one. */
  function handlePartyFieldSettingsChange(updater: (current: PartySettingsState) => PartySettingsState) {
    const next = updater(partyFieldSettings);
    setPartyFieldSettings(next);
    const partyType = isReceivableVoucher ? "customer" : "supplier";
    if (typeof window !== "undefined" && session?.workspaceId) {
      window.localStorage.setItem(
        getPartySettingsStorageKey(mode, session.workspaceId, partyType),
        JSON.stringify(next),
      );
    }
  }

  /** A party saved from the voucher has to be usable immediately: seed it into the
   * picker list and select it, rather than waiting for the next list refresh. */
  function handlePartyCreated(nextParty: PartyRecord) {
    setPartyOptions((current) => [nextParty, ...current.filter((party) => party.id !== nextParty.id)]);
    form.setValue("partyName", nextParty.name, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  }

  function handleOpenPartyEditor() {
    if (matchedParty) {
      setPartyEditorForm({
        id: matchedParty.id,
        originalName: matchedParty.name,
        name: matchedParty.name,
        contact: matchedParty.contact,
        address: matchedParty.address,
        creditLimit: matchedParty.creditLimit ? String(matchedParty.creditLimit) : "",
      });
      setPartyEditorOpen(true);
      return;
    }

    setPartyEditorForm({
      id: null,
      originalName: "",
      name: form.getValues("partyName") ?? "",
      contact: "",
      address: "",
      creditLimit: "",
    });
    setPartyEditorOpen(true);
  }

  function handleOpenLedgerEditor(kind: "expense" | "debtor" | "revenue" = "expense") {
    setLedgerEditorForm({ kind });
    setLedgerFormError(null);
    if (kind === "debtor" || kind === "revenue") {
      setLedgerFormValues({
        ...emptyAccountFormState,
        name: kind === "debtor" ? form.getValues("partyName") ?? "" : form.getValues("revenueLedger") ?? "",
        nature: kind === "debtor" ? "ASSET" : "INCOME",
      });
    } else {
      setExpenseLedgerParentOverride(null);
      setLedgerFormValues({ ...emptyAccountFormState, name: form.getValues("partyName") ?? "", nature: "INDIRECT_EXPENSE" });
    }
    setLedgerEditorOpen(true);
  }

  async function handleSubmitLedgerForm() {
    if (!ledgerEditorForm) {
      return;
    }

    setLedgerFormError(null);
    const nextName = ledgerFormValues.name.trim();
    if (!nextName) {
      setLedgerFormError("Ledger name is required.");
      return;
    }

    const isDebtor = ledgerEditorForm.kind === "debtor";
    const isRevenue = ledgerEditorForm.kind === "revenue";
    if (mode !== "api") {
      setLedgerFormError(`Creating a ${isDebtor ? "debtor" : isRevenue ? "revenue" : "expense"} ledger requires an online workspace.`);
      return;
    }

    const duplicate = isDebtor
      ? debtorLedgerAccounts.some((existing) => existing.name.toLowerCase() === nextName.toLowerCase())
      : isRevenue
        ? revenueLedgerAccounts.some((existing) => existing.name.toLowerCase() === nextName.toLowerCase())
      : expenseLedgerOptions.some((existing) => existing.toLowerCase() === nextName.toLowerCase());
    if (duplicate) {
      setLedgerFormError(`A ledger named "${nextName}" already exists.`);
      return;
    }

    const parentId = isDebtor ? debtorLedgerParentId : isRevenue ? revenueLedgerParentId : expenseLedgerParentId;
    if (!parentId) {
      setLedgerFormError(
        isDebtor
          ? "Could not find the Others Receivables category in the Chart of Accounts."
          : isRevenue
            ? "Could not find the Other Income category in the Chart of Accounts."
          : "Select a Parent Class / Category first.",
      );
      return;
    }

    const openingBalanceSources = (ledgerFormValues.openingBalanceSources ?? [])
      .filter((source) => source.accountId || moneyToMinorUnits(Number(source.amount)) > 0)
      .map((source) => ({ accountId: source.accountId, amount: roundCurrencyAmount(Number(source.amount)) }));
    const allocatedTotal = sumMoney(openingBalanceSources.map((source) => source.amount));
    const openingBalance = roundCurrencyAmount(Number(ledgerFormValues.openingBalance || 0));
    if (moneyToMinorUnits(openingBalance) > 0 && openingBalanceSources.some((source) => !source.accountId || !Number.isFinite(source.amount) || moneyToMinorUnits(source.amount) <= 0)) {
      setLedgerFormError("Select a Cash/Bank ledger and enter a valid amount for every allocation.");
      return;
    }
    if (moneyToMinorUnits(openingBalance) > 0 && !moneyAmountsEqual(allocatedTotal, openingBalance)) {
      setLedgerFormError(`Cash/Bank allocation total must equal the Opening Balance (${formatCurrency(openingBalance)}).`);
      return;
    }
    if (moneyToMinorUnits(openingBalance) > 0 && !ledgerFormValues.openingBalanceDate) {
      setLedgerFormError("Opening Balance Date is required.");
      return;
    }

    setLedgerFormSubmitting(true);
    try {
      await createAccountMutation.mutateAsync({
        level: "LEDGER",
        parentId,
        name: nextName,
        nature: isDebtor ? "ASSET" : isRevenue ? "INCOME" : ledgerFormValues.nature,
        isControlAccount: ledgerFormValues.isControlAccount,
        requiresItemDetails: ledgerFormValues.requiresItemDetails,
        openingBalance,
        openingBalanceDate: ledgerFormValues.openingBalanceDate || null,
        openingBalanceSources,
        bankDetails: null,
      });

      if (!isDebtor && !isRevenue) {
        setLocalExpenseLedgerNames((current) => (current.includes(nextName) ? current : [...current, nextName]));
      }
      if (isRevenue) {
        form.setValue("revenueLedger", nextName, { shouldDirty: true, shouldTouch: true });
      } else {
        form.setValue("partyName", nextName, { shouldDirty: true, shouldTouch: true });
      }
      toast.success("Ledger added");
      setLedgerEditorOpen(false);
      setLedgerEditorForm(null);
    } catch (error) {
      setLedgerFormError(error instanceof Error ? error.message : "Ledger could not be added");
    } finally {
      setLedgerFormSubmitting(false);
    }
  }

  async function handleSavePartyEditor() {
    if (!session?.workspaceId || !partyEditorForm) {
      return;
    }

    const nextName = partyEditorForm.name.trim();
    if (!nextName) {
      toast.error(`${partyRoleLabel} name is required`);
      return;
    }

    const nextContact = partyEditorForm.contact.trim();
    const nextAddress = partyEditorForm.address.trim();
    const nextCreditLimit = Number(partyEditorForm.creditLimit || 0);
    const creditLimit = Number.isFinite(nextCreditLimit) ? nextCreditLimit : 0;

    const isCreating = !partyEditorForm.id;

    setPartyEditorSaving(true);
    try {
      let updatedParty: PartyRecord;

      if (mode === "api") {
        const response = await apiRequest<{
          id: string;
          workspaceId: string;
          name: string;
          contact: string | null;
          address: string | null;
          creditLimit: number;
          status: string;
        }>(isCreating ? "/parties" : `/parties/${partyEditorForm.id}`, {
          method: isCreating ? "POST" : "PUT",
          body: JSON.stringify(
            isCreating
              ? {
                  workspaceId: session.workspaceId,
                  name: nextName,
                  type: isReceivableVoucher ? "customer" : "supplier",
                  contact: nextContact,
                  address: nextAddress,
                  creditLimit,
                }
              : {
                  name: nextName,
                  contact: nextContact,
                  address: nextAddress,
                  creditLimit,
                },
          ),
        });

        updatedParty = {
          id: response.id,
          workspaceId: response.workspaceId,
          name: response.name,
          type: matchedParty?.type ?? (isReceivableVoucher ? "customer" : "supplier"),
          contact: response.contact ?? "",
          address: response.address ?? "",
          creditLimit: Number(response.creditLimit || 0),
          status: response.status === "ACTIVE" ? "active" : "inactive",
        };
      } else if (isCreating) {
        const dataset = readDataset(mode);
        const newParty: PartyRecord = {
          id: `party-${Date.now()}`,
          workspaceId: session.workspaceId,
          name: nextName,
          type: isReceivableVoucher ? "customer" : "supplier",
          contact: nextContact,
          address: nextAddress,
          creditLimit,
          status: "active",
        };

        writeDataset(mode, {
          ...dataset,
          parties: [...dataset.parties, newParty],
        });

        updatedParty = newParty;
      } else {
        const dataset = readDataset(mode);
        const nextParties = dataset.parties.map((party) =>
          party.id === partyEditorForm.id
            ? {
                ...party,
                name: nextName,
                contact: nextContact,
                address: nextAddress,
                creditLimit,
              }
            : party,
        );
        const nextVouchers =
          partyEditorForm.originalName.trim().toLowerCase() !== nextName.toLowerCase()
            ? dataset.vouchers.map((voucher) =>
                voucher.partyName.trim().toLowerCase() === partyEditorForm.originalName.trim().toLowerCase() ? { ...voucher, partyName: nextName } : voucher,
              )
            : dataset.vouchers;

        writeDataset(mode, {
          ...dataset,
          parties: nextParties,
          vouchers: nextVouchers,
        });

        updatedParty =
          nextParties.find((party) => party.id === partyEditorForm.id) ??
          {
            id: partyEditorForm.id ?? `party-${Date.now()}`,
            workspaceId: session.workspaceId,
            name: nextName,
            type: isReceivableVoucher ? "customer" : "supplier",
            contact: nextContact,
            address: nextAddress,
            creditLimit,
            status: "active",
          };
      }

      setPartyOptions((current) =>
        (isCreating ? [...current, updatedParty] : current.map((party) => (party.id === updatedParty.id ? updatedParty : party))).sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      form.setValue("partyName", updatedParty.name, { shouldDirty: true, shouldTouch: true });
      form.setValue("supplierAddress", updatedParty.address, { shouldDirty: true, shouldTouch: true });
      await queryClient.invalidateQueries({ queryKey: [mode] });
      toast.success(isCreating ? `${partyRoleLabel} added` : `${partyRoleLabel} updated`);
      setPartyEditorOpen(false);
      setPartyEditorForm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${partyRoleLabel} could not be ${isCreating ? "added" : "updated"}`);
    } finally {
      setPartyEditorSaving(false);
    }
  }

  async function handleOpenItemEditor() {
    setItemEditorForm({ itemName: "", itemCode: "", category: "", unit: "pcs", rate: "", openingQty: "", expiryDate: "" });
    setItemEditorOpen(true);

    // A backend item must reference a category that already exists in this
    // workspace (creating one on the fly isn't allowed), so the category field
    // has to offer real choices instead of letting the user type anything.
    if (mode === "api" && session?.workspaceId) {
      try {
        const categories = await apiRequest<Array<{ name: string }>>(`/inventory/categories?workspaceId=${encodeURIComponent(session.workspaceId)}`);
        setItemEditorCategoryOptions(categories.map((category) => category.name).sort((left, right) => left.localeCompare(right)));
        const units = await apiRequest<Array<{ name: string }>>(`/inventory/units?workspaceId=${encodeURIComponent(session.workspaceId)}`);
        setItemEditorUnitOptions(units.map((unit) => unit.name).sort((left, right) => left.localeCompare(right)));
      } catch {
        setItemEditorCategoryOptions([]);
        setItemEditorUnitOptions([]);
      }
      return;
    }

    const categories = new Set(inventoryOptions.map((item) => item.category.trim()).filter(Boolean));
    const units = new Set(inventoryOptions.map((item) => item.unit.trim()).filter(Boolean));
    setItemEditorCategoryOptions(Array.from(categories).sort((left, right) => left.localeCompare(right)));
    setItemEditorUnitOptions(Array.from(units).sort((left, right) => left.localeCompare(right)));
  }

  async function handleSaveItemEditor() {
    if (!session?.workspaceId || !itemEditorForm) {
      return;
    }

    const nextName = itemEditorForm.itemName.trim();
    const nextCode = itemEditorForm.itemCode.trim() || `ITM-${slugify(nextName).slice(0, 8).toUpperCase() || "AUTO"}`;
    const nextCategory = itemEditorForm.category.trim();
    if (!nextName) {
      toast.error("Item name is required");
      return;
    }

    if (!nextCategory) {
      toast.error(
        mode === "api" && !itemEditorCategoryOptions.length
          ? "No category exists yet — add one from Products & Services first"
          : "Category is required",
      );
      return;
    }

    const nextUnit = itemEditorForm.unit.trim() || "pcs";
    const nextRate = Number(itemEditorForm.rate || 0);
    const nextOpeningQty = Number(itemEditorForm.openingQty || 0);

    setItemEditorSaving(true);
    try {
      let created: InventoryOptionRecord;

      if (mode === "api") {
        const response = await apiRequest<{
          itemCode: string;
          itemName: string;
          category: string;
          unit: string;
          openingQty: number;
          rate: number;
          reorderLevel: number;
          expiryDate?: string | null;
        }>("/inventory/items", {
          method: "POST",
          body: JSON.stringify({
            workspaceId: session.workspaceId,
            itemCode: nextCode,
            itemName: nextName,
            category: nextCategory,
            unit: nextUnit,
            openingQty: nextOpeningQty,
            openingRate: nextRate,
            reorderLevel: 0,
            expiryDate: itemEditorForm.expiryDate.trim() || null,
            status: "active",
          }),
        });

        created = {
          itemCode: response.itemCode,
          itemName: response.itemName,
          category: response.category,
          unit: response.unit,
          qty: Number(response.openingQty || 0),
          rate: Number(response.rate ?? nextRate),
          reorderLevel: Number(response.reorderLevel || 0),
          expiryDate: response.expiryDate ?? null,
        };
      } else {
        const dataset = readDataset(mode);
        const isDuplicate = dataset.stockItems.some(
          (item) =>
            item.workspaceId === session.workspaceId &&
            (item.itemCode.trim().toLowerCase() === nextCode.toLowerCase() || item.itemName.trim().toLowerCase() === nextName.toLowerCase()),
        );

        if (isDuplicate) {
          toast.error("This item code or item name already exists");
          setItemEditorSaving(false);
          return;
        }

        const newItem: StockItemRecord = {
          id: `item-${Date.now()}`,
          workspaceId: session.workspaceId,
          itemCode: nextCode,
          itemName: nextName,
          category: nextCategory,
          unit: nextUnit,
          openingQty: nextOpeningQty,
          openingRate: nextRate,
          reorderLevel: 0,
          expiryDate: itemEditorForm.expiryDate.trim() || null,
          status: "active",
        };

        writeDataset(mode, { ...dataset, stockItems: [...dataset.stockItems, newItem] });

        created = {
          itemCode: newItem.itemCode,
          itemName: newItem.itemName,
          category: newItem.category,
          unit: newItem.unit,
          expiryDate: newItem.expiryDate,
          qty: newItem.openingQty,
          rate: newItem.openingRate,
          reorderLevel: newItem.reorderLevel,
        };
      }

      setInventoryOptions((current) => [...current, created].sort((left, right) => left.itemName.localeCompare(right.itemName)));

      if (activeItemRowIndex !== null) {
        applyInventoryItemToRow(activeItemRowIndex, created);
      } else {
        handlePickInventoryItemFromPanel(created);
      }

      await queryClient.invalidateQueries({ queryKey: [mode] });
      toast.success("Item added");
      setItemEditorOpen(false);
      setItemEditorForm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Item could not be saved");
    } finally {
      setItemEditorSaving(false);
    }
  }

  function applyJournalLedgerSelection(ledger: LedgerOption) {
    const lineCount = form.getValues("lines").length;
    if (!lineCount) return;
    const rowIndex = Math.min(activeJournalLineIndex, lineCount - 1);
    form.setValue(`lines.${rowIndex}.accountId`, ledger.id, { shouldDirty: true, shouldTouch: true });
    form.setValue(`lines.${rowIndex}.ledger`, ledger.name, { shouldDirty: true, shouldTouch: true });
    const currentLine = form.getValues(`lines.${rowIndex}`);
    const normalSide = getNormalPostingSide(ledger.nature);
    if (normalSide && Number(currentLine.debit || 0) <= 0 && Number(currentLine.credit || 0) <= 0) {
      form.setValue(`lines.${rowIndex}.postingSide`, normalSide, { shouldDirty: true, shouldTouch: true });
    }
    setJournalLedgerHighlight(-1);
  }

  function handleJournalLedgerPickerKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!isPickerNavigationKey(event.key) && event.key !== "Enter") return;
    event.preventDefault();
    if (!filteredJournalLedgerOptions.length) return;
    if (isPickerNavigationKey(event.key)) {
      const navigationKey = event.key;
      setJournalLedgerHighlight((current) => getNextPickerIndex(current, filteredJournalLedgerOptions.length, navigationKey));
      return;
    }
    const selected = filteredJournalLedgerOptions[Math.max(journalLedgerHighlight, 0)];
    if (selected) applyJournalLedgerSelection(selected);
  }

  function appendLine() {
    const nextIndex = lines.fields.length;
    lines.append({
      id: `line-${Date.now()}`,
      accountId: "",
      ledger: "",
      description: "",
      postingSide: "debit",
      debit: 0,
      credit: 0,
      costCenter: "Head Office",
      project: "Trading",
      billReference: "",
    });
    if (isAdjustmentPosting) {
      setActiveJournalLineIndex(nextIndex);
    }
  }

  function removeLine(index: number) {
    lines.remove(index);
    if (isAdjustmentPosting) {
      setActiveJournalLineIndex((current) => {
        const remainingLastIndex = Math.max(0, lines.fields.length - 2);
        if (current > index) return current - 1;
        return Math.min(current, remainingLastIndex);
      });
    }
  }

  function appendInvoiceItem() {
    const defaultItem = buildDefaultInvoiceItem(invoiceItems.fields.length);
    invoiceItems.append(
      classicPurchaseMode || classicSalesInvoiceMode ? { ...defaultItem, warehouseId: receiptWarehouseFallbackId } : defaultItem,
    );
  }

  function handlePickInventoryItemFromPanel(item: InventoryOptionRecord) {
    const currentItems = form.getValues("invoiceItems");
    const emptyIndex = currentItems.findIndex((row) => !row.itemName.trim());
    if (emptyIndex >= 0) {
      applyInventoryItemToRow(emptyIndex, item);
      return;
    }

    const nextIndex = invoiceItems.fields.length;
    const lastRate = findLastRate(item.itemName, form.getValues("partyName") ?? "");
    invoiceItems.append({
      id: `invoice-item-${nextIndex + 1}`,
      warehouseId: isReceiptNoteWorkflow
        ? findSuggestedReceiptWarehouse(item.itemName)
        : classicPurchaseMode || classicSalesInvoiceMode
          ? receiptWarehouseFallbackId
          : "",
      warehouseSelectionOrigin: isReceiptNoteWorkflow ? "inferred" : undefined,
      itemName: item.itemName,
      unit: item.unit || "pcs",
      quantity: classicDebitNoteMode ? 0 : 1,
      unitPrice: lastRate ? lastRate.rate : Number(item.rate || 0),
    });
    if (isReceiptNoteWorkflow) {
      receiptCommittedProductByRowRef.current.set(`invoice-item-${nextIndex + 1}`, normalizeLookupValue(item.itemName));
    }
  }

  function appendExpenseInvoiceItem() {
    invoiceItems.append({
      id: `invoice-item-${invoiceItems.fields.length + 1}`,
      warehouseId: "",
      itemName: "",
      unit: "",
      quantity: 0,
      unitPrice: 0,
    });
  }

  function buildInvoiceExportPayload(): InvoiceExportPayload {
    const values = form.getValues();
    const normalizedInvoiceItems = values.invoiceItems
      .map((item) => ({
        description: item.itemName,
        quantity: Number(item.quantity || 0),
        price: roundMoney(Number(item.unitPrice || 0)),
        total: roundMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0)),
      }))
      .filter((item) => item.description.trim() || item.total > 0);
    const fallbackLineItems = values.lines
      .map((line) => {
        const lineTotal = roundMoney(Math.max(Number(line.debit || 0), Number(line.credit || 0)));
        return {
          description: line.description || line.ledger || documentTitle,
          quantity: 1,
          price: lineTotal,
          total: lineTotal,
        };
      })
      .filter((item) => item.description.trim() || item.total > 0);
    const exportItems = normalizedInvoiceItems.length ? normalizedInvoiceItems : fallbackLineItems;
    const subtotal = sumMoney(exportItems.map((item) => item.total));
    const rawDiscount = Number(values.discount || 0);
    const resolvedDiscount = roundMoney(
      values.discountType === "percent"
        ? Math.min(subtotal, (subtotal * rawDiscount) / 100)
        : Math.min(subtotal, rawDiscount),
    );
    const total = Math.max(0, roundMoney(subtotal - resolvedDiscount));

    return {
      invoiceNumber: values.reference.trim() || buildAutoInvoiceNumber(voucherType, values.voucherDate, workflow),
      companyName: companyProfile.companyName || appConfig.companyName,
      fromLabel: "From:",
      fromAddressLines: [companyProfile.businessAddress, companyProfile.phoneNumber, companyProfile.emailAddress].filter(Boolean),
      logoDataUrl: companyProfile.logoDataUrl,
      invoicePadDataUrl: companyProfile.invoicePadDataUrl,
      billToName: values.partyName || partyRoleLabel,
      billToAddressLines: [values.supplierAddress || "Address not provided"],
      dateLabel: values.voucherDate,
      note: values.condition,
      paymentMode:
        values.settlementMode === "cash"
          ? cashFlowLabel
          : values.settlementMode === "bank"
            ? purchaseSettlementLedgerName(values) === "Mobile Financial Service Accounts" ? "MFS" : "Bank"
            : accountRoleLabel,
      paymentTarget:
        values.settlementMode === "cash"
          ? "Cash in Hand"
          : values.settlementMode === "bank"
            ? purchaseSettlementLedgerName(values)
            : `${accountRoleLabel} / ${partyRoleLabel}`,
      buyerSignature: values.buyerSignature,
      sellerSignature: values.sellerSignature || companyProfile.companyName,
      items: exportItems,
      subTotal: subtotal,
      discountLabel: values.discountType === "percent" ? `${rawDiscount}%` : formatCurrency(resolvedDiscount),
      discountAmount: resolvedDiscount,
      total,
      documentTitle: isPurchaseWorkflowDocument ? getPurchaseWorkflowDocumentLabel(workflow) : voucherType === "purchase" ? "Bill" : "Invoice",
      billToLabel: isPurchaseWorkflowDocument ? "Order To:" : voucherType === "purchase" ? "Bill From:" : "Bill To:",
      detailsLabel: isPurchaseWorkflowDocument ? "Order Details:" : voucherType === "purchase" ? "Bill Details:" : "Invoice Details:",
      shipToLabel: isPurchaseWorkflowDocument ? "Ship From:" : voucherType === "purchase" ? "Ship From:" : "Ship To:",
      priceColumnLabel: "Price/ Unit(Tk)",
      noteLabel: isPurchaseWorkflowDocument
        ? `${getPurchaseWorkflowDocumentLabel(workflow)} Amount in Words:`
        : voucherType === "purchase"
          ? "Bill Amount in Words:"
          : "Invoice Note:",
    };
  }

  async function refreshSharePreviewDialog(subtitle: string) {
    const payload = buildInvoiceExportPayload();
    setPreviewTheme("tally");
    setPreviewDialog({
      title: payload.invoiceNumber,
      subtitle,
      payload,
      imageSrc: await buildInvoicePreviewDataUrl(payload),
    });
  }

  // Downloads/prints should respect the theme the user picked in the preview
  // dialog: if "Default Theme" is selected, strip the pad even when one is on
  // file, rather than always silently using it whenever it happens to exist.
  function payloadForSelectedTheme(payload: InvoiceExportPayload): InvoiceExportPayload {
    return previewTheme === "modern" ? payload : { ...payload, invoicePadDataUrl: null };
  }

  async function handleOpenSharePreview() {
    try {
      await refreshSharePreviewDialog(`${buildInvoiceExportPayload().billToName} preview is ready to share.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invoice preview could not be opened");
    }
  }

  async function handlePreviewPadUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
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
      const snapshot = writeCompanyProfile(mode, workspaceId, {
        ...readCompanyProfile(mode, workspaceId),
        invoicePadDataUrl: dataUrl,
      });
      setCompanyProfile(snapshot);
      if (previewDialog) {
        // Build directly from `snapshot` rather than calling buildInvoiceExportPayload(),
        // whose closure still holds the pre-update companyProfile until this component
        // re-renders (setCompanyProfile above hasn't committed yet).
        const payload: InvoiceExportPayload = { ...buildInvoiceExportPayload(), invoicePadDataUrl: snapshot.invoicePadDataUrl };
        setPreviewDialog({
          title: payload.invoiceNumber,
          subtitle: "Company pad updated for this preview.",
          payload,
          imageSrc: await buildInvoicePreviewDataUrl(payload),
        });
      }
      toast.success("Company pad uploaded");
    } catch {
      toast.error("Company pad could not be uploaded");
    }
  }

  async function handleInvoicePrint() {
    try {
      await printInvoice(buildInvoiceExportPayload());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invoice print failed");
    }
  }

  async function handleInvoicePdfOpen() {
    try {
      await openInvoicePdf(buildInvoiceExportPayload());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF could not be opened");
    }
  }

  function handleDuplicateVoucher() {
    if (!editingVoucherId) {
      return;
    }

    router.push(`${buildVoucherRoute(mode, voucherType)}?duplicate=${encodeURIComponent(editingVoucherId)}`);
  }

  function handleConvertVoucherToReturn() {
    if (!editingVoucherId) {
      return;
    }

    const targetType = voucherType === "sales" ? "credit-note" : voucherType === "purchase" ? "debit-note" : null;
    if (!targetType) {
      toast.info("Convert to return is available for sales and purchase vouchers only");
      return;
    }

    router.push(`${buildVoucherRoute(mode, targetType)}?fromVoucher=${encodeURIComponent(editingVoucherId)}`);
  }

  function handleMakeVoucherPayment() {
    if (!editingVoucherId) {
      return;
    }

    const targetType =
      voucherType === "sales" || voucherType === "credit-note"
        ? "receipt"
        : voucherType === "purchase" || voucherType === "debit-note"
          ? "payment"
          : null;

    if (!targetType) {
      toast.info("Payment action is available for customer and supplier vouchers only");
      return;
    }

    router.push(`${buildVoucherRoute(mode, targetType)}?fromVoucher=${encodeURIComponent(editingVoucherId)}`);
  }

  async function handleDeleteCurrentVoucher() {
    if (!editingVoucherId || !session?.workspaceId) {
      return;
    }

    try {
      const deletedVoucher = await deleteVoucher(mode, editingVoucherId, session.workspaceId);
      if (deletedVoucher && mode !== "api") {
        moveVoucherToRecycleBin(mode, deletedVoucher, session.user.name ?? "Current User");
      }
      await queryClient.invalidateQueries({ queryKey: [mode] });
      toast.success(`${documentTitle} deleted`);
      setDeleteDialogOpen(false);
      onDeleted?.(editingVoucherId);
      if (displayMode === "dialog") {
        onClose?.();
        return;
      }
      startTransition(() => router.push(buildWorkspaceRoute(mode, "/day-book")));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be deleted");
    }
  }

  /**
   * Posted/approved vouchers can't be edited in place (see PostingEngineService.assertEditable
   * on the API) — this posts a mirror-image reversing entry instead, then hands off to the
   * duplicate flow so the correct version can be re-entered as a fresh voucher.
   */
  async function handleReverseCurrentVoucher() {
    if (!editingVoucherId || !session?.workspaceId) {
      return;
    }

    setReversing(true);
    try {
      await reverseVoucher(editingVoucherId, `Reversed from ${documentTitle} edit screen`);
      await queryClient.invalidateQueries({ queryKey: [mode] });
      toast.success(`${documentTitle} reversed — now create the corrected entry`);
      setReverseDialogOpen(false);
      if (displayMode === "dialog") {
        onClose?.();
        return;
      }
      startTransition(() => router.push(`${buildVoucherRoute(mode, voucherType)}?duplicate=${encodeURIComponent(editingVoucherId)}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be reversed");
    } finally {
      setReversing(false);
    }
  }

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

  async function handlePersist(requestedStatus: "draft" | "posted", redirectAfterSave = true) {
    if (!session) {
      return false;
    }

    // Orders and receipt notes are commitments, not ledger entries: nothing is
    // owed until the bill arrives. Posting them locked the document against any
    // later edit, so they are saved as pending instead.
    const status: VoucherStatus = requestedStatus === "posted" && isPreLedgerDocument ? "pending" : requestedStatus;

    if (!readiness.isReadyForTransactions && status === "posted") {
      toast.error("Master data setup incomplete. Please complete mandatory master data setup before posting vouchers.");
      return false;
    }

    try {
      if (newRootWorkflowAccess && !newRootWorkflowAccess.allowed) {
        if (newRootWorkflowAccess.reason === "SETTINGS_PENDING") {
          toast.error("Company transaction workflow is still loading. Please try again.");
        } else if (newRootWorkflowAccess.reason === "SETTINGS_ERROR") {
          toast.error("Company transaction workflow could not be loaded. Retry before creating a new transaction.");
        } else {
          const expectedRoot = newRootKind === "ORDER_BASED" ? "an Order" : voucherType === "purchase" ? "a Purchase Bill" : "a Sales Invoice";
          toast.error(`The current company workflow does not allow starting ${expectedRoot} from this route.`);
        }
        return false;
      }
      const values = form.getValues();
      if (isAdjustmentPosting && mode === "api") {
        if (journalLedgersQuery.isLoading) {
          toast.error("Chart of Accounts ledgers are still loading. Please try again.");
          return false;
        }
        if (journalLedgersQuery.isError) {
          toast.error("Chart of Accounts ledgers could not be loaded.");
          return false;
        }

        const selectableLedgerIds = new Set(journalLedgerOptions.map((ledger) => ledger.id));
        const invalidLineIndex = values.lines.findIndex((line) => {
          const accountId = line.accountId?.trim() ?? "";
          const amount = Math.max(Number(line.debit || 0), Number(line.credit || 0));
          const active = Boolean(accountId || line.ledger.trim() || amount > 0);
          return active && (!accountId || !selectableLedgerIds.has(accountId));
        });
        if (invalidLineIndex >= 0) {
          setActiveJournalLineIndex(invalidLineIndex);
          toast.error(`Select an active Chart of Accounts ledger for row ${invalidLineIndex + 1} from Quick Picker.`);
          return false;
        }
      }
      // Revenue's debtor field is a free-text "write who owes this" field, not a strict
      // party picker — a typo'd or not-yet-created customer name fails soft here, matching
      // the plan's deliberate choice not to hard-require a real Customer record for it.
      if (!isAdjustmentPosting && !classicExpenseMode && !classicRevenueMode && values.partyName.trim() && !matchedParty) {
        toast.error(`Create the ${partyRoleLabel.toLowerCase()} first from Parties master and then select it here.`);
        return false;
      }
      const selectedExpenseLedger = classicExpenseMode
        ? expenseLedgerAccounts.find((ledger) => normalizeLookupValue(ledger.name) === normalizeLookupValue(values.partyName)) ?? null
        : null;
      if (classicExpenseMode && !values.partyName.trim()) {
        toast.error("Select an expense ledger before saving.");
        return false;
      }
      if (classicExpenseMode && mode === "api" && !selectedExpenseLedger) {
        toast.error("Select a valid expense ledger from the Ledger picker. Every expense ledger must belong to a category.");
        return false;
      }
      if (classicExpenseMode && mode === "api" && purchaseOrderPaymentType === "Credit" && !selectedExpensePayableLedger) {
        toast.error("Select an active ledger under the Others Payable category.");
        return false;
      }
      if (classicRevenueMode && !values.revenueLedger.trim()) {
        toast.error("Select an income ledger before saving.");
        return false;
      }
      const selectedRevenueLedger = classicRevenueMode
        ? revenueLedgerAccounts.find((ledger) => normalizeLookupValue(ledger.name) === normalizeLookupValue(values.revenueLedger)) ?? null
        : null;
      const selectedRevenueDebtorLedger = classicRevenueMode && purchaseOrderPaymentType === "Credit"
        ? debtorLedgerAccounts.find((ledger) => normalizeLookupValue(ledger.name) === normalizeLookupValue(values.partyName)) ?? null
        : null;
      if (classicRevenueMode && mode === "api" && !selectedRevenueLedger) {
        toast.error("Select an active income ledger from the Chart of Accounts picker.");
        return false;
      }
      if (classicRevenueMode && purchaseOrderPaymentType === "Credit" && !values.partyName.trim()) {
        toast.error("Select a debtor ledger before saving a credit revenue entry.");
        return false;
      }
      if (classicRevenueMode && mode === "api" && purchaseOrderPaymentType === "Credit" && !selectedRevenueDebtorLedger) {
        toast.error("Select an active debtor ledger from the Chart of Accounts picker.");
        return false;
      }
      const loadedVoucherIsImmediateSource = Boolean(
        loadedVoucher &&
        (
          (isReceiptNoteWorkflow && loadedVoucher.documentKind === "purchase-order") ||
          (isDeliveryNoteWorkflow && loadedVoucher.documentKind === "sale-order") ||
          (!isPurchaseOrderWorkflow && !isReceiptNoteWorkflow && voucherType === "purchase" && loadedVoucher.documentKind === "receipt-note") ||
          (!isSaleOrderWorkflow && !isDeliveryNoteWorkflow && voucherType === "sales" && loadedVoucher.documentKind === "delivery-note")
        ),
      );
      const preservedSourceVoucherId = templateSourceMode === "duplicate"
        ? null
        : linkedBillId ?? (
            loadedVoucherIsImmediateSource
              ? loadedVoucher?.id
              : loadedVoucher?.sourceVoucherId
          ) ?? null;
      if (isReceiptNoteWorkflow && !preservedSourceVoucherId) {
        toast.error("Reference Purchase Order is required before generating a Receipt Note.");
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>("[data-receipt-note-source-reference='true']")?.focus();
        });
        return false;
      }
      if (isDeliveryNoteWorkflow && !preservedSourceVoucherId) {
        toast.error("Reference Sales Order is required before generating a Delivery Note.");
        return false;
      }
      if (requiresReceiptNoteSource && !preservedSourceVoucherId) {
        toast.error("Reference Receipt Note is required before generating a Purchase Bill.");
        requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>("[data-purchase-bill-reference='true']")?.focus();
        });
        return false;
      }
      if (requiresDeliveryNoteSource && !preservedSourceVoucherId) {
        toast.error("Reference Delivery Note is required before generating a Sales Invoice.");
        requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>("[data-purchase-bill-reference='true']")?.focus();
        });
        return false;
      }
      if (
        isDeliveryNoteWorkflow &&
        !editingVoucherId &&
        templateSourceMode === "fromVoucher" &&
        loadedVoucher &&
        values.voucherDate < loadedVoucher.voucherDate
      ) {
        toast.error(`Delivery Date cannot be before the Sale Order's date (${formatDate(loadedVoucher.voucherDate)}).`);
        return false;
      }
      // Purchase Bill and Sales Invoice both settle through the paymentSplits
      // breakdown now (renderMoneyAccountSelector is hidden for both — see the
      // classicPurchaseMode/classicSalesInvoiceMode check around the Payment Type
      // block below), so this legacy single-ledger field is never populated for
      // either and must not gate saving. Their split rows are validated properly
      // further down via usesSplitPayments/enteredOrderPaymentSplits.
      const normalizedInvoiceItems = values.invoiceItems.map((item) => ({
        id: item.id,
        sourceInventoryLineId: item.sourceInventoryLineId,
        manufacturingInventoryLotId: item.manufacturingInventoryLotId?.trim() || undefined,
        manufacturingSerialIds: [...new Set((item.manufacturingSerialIds ?? []).map((serialId) => serialId.trim()).filter(Boolean))],
        batchNumber: item.batchNumber?.trim() || undefined,
        manufacturedAt: item.manufacturedAt || undefined,
        expiresAt: item.expiresAt || undefined,
        warehouseId: item.warehouseId.trim() || undefined,
        itemName: item.itemName.trim(),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
      }));
      if (isReceiptNoteWorkflow || classicPurchaseMode) {
        const invalidBatchLine = normalizedInvoiceItems.find((line) => {
          const product = findInventoryOption(line.itemName);
          return product?.trackBatchExpiry && line.quantity > 0 && !line.expiresAt;
        });
        if (invalidBatchLine) {
          toast.error(`${invalidBatchLine.itemName}: Expiry Date is required.`);
          return false;
        }
        const invalidDates = normalizedInvoiceItems.find((line) => line.manufacturedAt && line.expiresAt && line.manufacturedAt > line.expiresAt);
        if (invalidDates) {
          toast.error(`${invalidDates.itemName}: Manufacturing Date cannot be after Expiry Date.`);
          return false;
        }
      }

      const requiresMasterItemSelection = simpleInvoiceMode || classicPurchaseWorkflowMode || classicDebitNoteMode || (classicExpenseMode && expenseLedgerRequiresItems);
      if (requiresMasterItemSelection) {
        const invalidItemIndex = normalizedInvoiceItems.findIndex((item) => item.itemName && !isValidItemSelection(item.itemName));
        if (invalidItemIndex >= 0) {
          const invalidItem = normalizedInvoiceItems[invalidItemIndex];
          toast.error(`"${invalidItem.itemName}" is not in the item list. Select an item from the Item picker.`);
          requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>(`input[data-voucher-item-row='${invalidItemIndex}']`)?.focus();
          });
          return false;
        }
        const hasSelectedItem = normalizedInvoiceItems.some((item) => item.itemName && isValidItemSelection(item.itemName));
        if (!hasSelectedItem) {
          toast.error("Select at least one item from the Item picker.");
          requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>("input[data-voucher-item-row='0']")?.focus();
          });
          return false;
        }
      }

      if (
        isReceiptNoteWorkflow ||
        isDeliveryNoteWorkflow ||
        (voucherType === "purchase" && workflow !== "purchase-order") ||
        (voucherType === "sales" && workflow !== "sale-order")
      ) {
        const itemWarehouseSelector = (rowIndex: number) =>
          isDeliveryNoteWorkflow
            ? `input[data-delivery-note-item-warehouse='${rowIndex}']`
            : classicSalesInvoiceMode
              ? `input[data-sales-invoice-item-warehouse='${rowIndex}']`
              : `input[data-receipt-warehouse-row='${rowIndex}']`;
        const requiresExplicitReceiptWarehouse =
          isReceiptNoteWorkflow &&
          loadedVoucher?.documentKind === "purchase-order" &&
          warehouseOptions.length > 1;
        const unconfirmedWarehouseIndex = requiresExplicitReceiptWarehouse
          ? values.invoiceItems.findIndex(
              (item) =>
                Boolean(item.itemName) &&
                Number(item.quantity || 0) > 0 &&
                item.warehouseSelectionOrigin !== "user",
            )
          : -1;
        if (unconfirmedWarehouseIndex >= 0) {
          const itemLabel = normalizedInvoiceItems[unconfirmedWarehouseIndex]?.itemName || `row ${unconfirmedWarehouseIndex + 1}`;
          toast.error(`Select a warehouse for ${itemLabel} in item row ${unconfirmedWarehouseIndex + 1}.`);
          requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>(itemWarehouseSelector(unconfirmedWarehouseIndex))?.focus();
          });
          return false;
        }

        const missingWarehouseIndex = normalizedInvoiceItems.findIndex(
          (item) => Boolean(item.itemName) && Number(item.quantity || 0) > 0 && !item.warehouseId,
        );
        if (missingWarehouseIndex >= 0) {
          const itemLabel = normalizedInvoiceItems[missingWarehouseIndex]?.itemName || `row ${missingWarehouseIndex + 1}`;
          toast.error(`Select a warehouse for ${itemLabel} in item row ${missingWarehouseIndex + 1}.`);
          requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>(itemWarehouseSelector(missingWarehouseIndex))?.focus();
          });
          return false;
        }

        const inactiveWarehouseIndex = normalizedInvoiceItems.findIndex(
          (item) =>
            Boolean(item.itemName) &&
            Number(item.quantity || 0) > 0 &&
            Boolean(item.warehouseId) &&
            !activeWarehouseIds.has(item.warehouseId ?? ""),
        );
        if (inactiveWarehouseIndex >= 0) {
          const itemLabel = normalizedInvoiceItems[inactiveWarehouseIndex]?.itemName || `row ${inactiveWarehouseIndex + 1}`;
          toast.error(`The previous warehouse for ${itemLabel} is inactive. Select an active warehouse in item row ${inactiveWarehouseIndex + 1}.`);
          requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>(itemWarehouseSelector(inactiveWarehouseIndex))?.focus();
          });
          return false;
        }
      }

      if (
        manufacturingSaleProvenance &&
        ((voucherType === "sales" && workflow !== "sale-order") || voucherType === "credit-note")
      ) {
        const trackedItemByName = new Map(
          manufacturingSaleProvenance.trackedItems.map((item) => [normalizeLookupValue(item.itemName), item]),
        );
        const invalidManufacturingIndex = normalizedInvoiceItems.findIndex((item) => {
          if (!item.itemName || Number(item.quantity || 0) <= 0) return false;
          const trackedItem = trackedItemByName.get(normalizeLookupValue(item.itemName));
          if (!trackedItem) return false;
          if (!item.manufacturingInventoryLotId) return true;
          const selectedLot = manufacturingSaleProvenance.lots.find(
            (lot) => lot.id === item.manufacturingInventoryLotId && lot.inventoryItemId === trackedItem.id,
          );
          if (!selectedLot || selectedLot.warehouse.id !== item.warehouseId) return true;
          return Boolean(
            (trackedItem.serialTracked || selectedLot.serialTracked) &&
            (!Number.isInteger(Number(item.quantity)) || item.manufacturingSerialIds.length !== Number(item.quantity)),
          );
        });
        if (invalidManufacturingIndex >= 0) {
          const item = normalizedInvoiceItems[invalidManufacturingIndex];
          toast.error(`${item.itemName}: select the exact FG-R lot${manufacturingSaleProvenance.trackedItems.find((tracked) => normalizeLookupValue(tracked.itemName) === normalizeLookupValue(item.itemName))?.serialTracked ? " and serial numbers" : ""}.`);
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(`[data-manufacturing-lot-row='${invalidManufacturingIndex}']`)?.focus();
          });
          return false;
        }
      }

      if (classicDebitNoteMode) {
        // Bill conversion can prefill extra product rows. A row with no return
        // quantity is intentionally inactive and must not block the posting.
        const activeReturnItems = normalizedInvoiceItems
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => Boolean(item.itemName) && Number(item.quantity || 0) > 0);
        const missingReturnWarehouse = activeReturnItems.find(({ item }) => !item.warehouseId);
        if (missingReturnWarehouse) {
          toast.error(`Select a warehouse for ${missingReturnWarehouse.item.itemName}.`);
          requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`input[data-purchase-return-warehouse-row='${missingReturnWarehouse.index}']`)?.focus());
          return false;
        }

        const returnQuantityByStock = new Map<string, number>();
        activeReturnItems.forEach(({ item }) => {
          const key = `${item.warehouseId}::${normalizeLookupValue(item.itemName)}`;
          returnQuantityByStock.set(key, (returnQuantityByStock.get(key) ?? 0) + Number(item.quantity || 0));
        });

        const invalidReturnStockIndex = isSalesReturnMode ? -1 : activeReturnItems.find(({ item }) => {
          const stock = warehouseStockRows.find(
            (row) => row.warehouseId === item.warehouseId && normalizeLookupValue(row.itemName) === normalizeLookupValue(item.itemName),
          );
          const requested = returnQuantityByStock.get(`${item.warehouseId}::${normalizeLookupValue(item.itemName)}`) ?? 0;
          return !stock || requested > Number(stock.quantity || 0);
        })?.index ?? -1;
        if (invalidReturnStockIndex >= 0) {
          const item = normalizedInvoiceItems[invalidReturnStockIndex]!;
          const stock = warehouseStockRows.find(
            (row) => row.warehouseId === item.warehouseId && normalizeLookupValue(row.itemName) === normalizeLookupValue(item.itemName),
          );
          const requested = returnQuantityByStock.get(`${item.warehouseId}::${normalizeLookupValue(item.itemName)}`) ?? item.quantity;
          toast.error(
            `Return quantity ${formatNumber(requested)} for ${item.itemName} cannot exceed ${formatNumber(stock?.quantity ?? 0)} available in the selected warehouse.`,
          );
          requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`input[data-purchase-return-warehouse-row='${invalidReturnStockIndex}']`)?.focus());
          return false;
        }
      }

      // A converted document settles the one it came from, so that is the number its
      // lines carry; a document raised on its own references itself.
      const lineBillReference = sourceDocumentReference ?? values.reference;
      const subtotal = sumMoney(
        normalizedInvoiceItems.map((item) => roundMoney(item.quantity * item.unitPrice)),
      );
      const discount = Number(values.discount || 0);
      const resolvedDiscount = roundMoney(
        values.discountType === "percent"
          ? Math.min(subtotal, (subtotal * discount) / 100)
          : Math.min(subtotal, discount),
      );
      // The product rates may originate from landed-cost calculations with more
      // than two decimal places. A posted voucher is denominated in BDT, so lock
      // the final accounting amount to currency precision before generating its
      // debit and credit lines.
      const unroundedTotal = roundCurrencyAmount(Math.max(0, subtotal - resolvedDiscount));
      // The party settles the rounded figure, so grandTotal (used by every payment,
      // receivable and payable line below) carries the rounding. Only the goods-value
      // line keeps unroundedTotal, and roundOffLines absorbs the difference.
      const submittedRoundOff = (classicSalesInvoiceMode || classicPurchaseMode) && Boolean(values.roundOff);
      const roundOffAmount = submittedRoundOff
        ? roundCurrencyAmount(applyRoundOff(unroundedTotal, roundOffPreference) - unroundedTotal)
        : 0;
      const grandTotal = roundCurrencyAmount(unroundedTotal + roundOffAmount);
      const roundOffLines = (side: "sales" | "purchase") => {
        if (!roundOffAmount) return [];
        const gain = side === "sales" ? roundOffAmount > 0 : roundOffAmount < 0;
        const magnitude = Math.abs(roundOffAmount);
        return [{
          id: `line-${side}-round-off`,
          ledger: "Round Off",
          description: roundOffAmount > 0 ? "Invoice rounded up" : "Invoice rounded down",
          debit: gain ? 0 : magnitude,
          credit: gain ? magnitude : 0,
          costCenter: "Head Office",
          project: "Trading",
          billReference: lineBillReference,
        }];
      };
      // Receipt/Delivery Notes move stock but do not collect or pay money. They share
      // the classic purchase/sales item form, so exclude them explicitly from the
      // split-payment validation used by Bills, Invoices, and Orders.
      const usesSplitPayments =
        isPurchaseOrderWorkflow ||
        isSaleOrderWorkflow ||
        (classicPurchaseMode && !isReceiptNoteWorkflow) ||
        (classicSalesInvoiceMode && !isDeliveryNoteWorkflow) ||
        classicDebitNoteMode ||
        classicExpenseMode ||
        classicRevenueMode;
      // Order workflows use their own Credit/Cash-Bank-MFS selector even though a
      // Sales Order is rendered by the shared sales invoice component.
      const splitPaymentIsCredit = isPurchaseOrderWorkflow || isSaleOrderWorkflow
        ? purchaseOrderPaymentType === "Credit"
        : classicSalesInvoiceMode
          ? values.settlementMode === "accounts-payable"
          : purchaseOrderPaymentType === "Credit";
      const paidAmount = roundCurrencyAmount(
        usesSplitPayments
          ? splitPaymentIsCredit ? 0 : paymentSplitTotal
          : values.settlementMode === "accounts-payable"
            ? 0
            : classicSalesInvoiceMode
              ? Math.max(0, grandTotal - Math.min(previousSalesAdvanceAmount, grandTotal))
              : Number(values.paidAmount || 0),
      );
      const enteredOrderPaymentSplits = usesSplitPayments && !splitPaymentIsCredit
        ? paymentSplits.filter((split) => Boolean(split.method || split.amount.trim() || split.reference.trim()))
        : [];
      if (usesSplitPayments && !splitPaymentIsCredit) {
        const splitLabel = classicSalesInvoiceMode ? "customer collection" : classicDebitNoteMode ? "refund" : classicExpenseMode ? "expense payment" : classicRevenueMode ? "revenue receipt" : "advance payment";
        const salesAdvanceCoversInvoice = classicSalesInvoiceMode
          && moneyToMinorUnits(previousSalesAdvanceAmount) >= moneyToMinorUnits(grandTotal);
        if (moneyToMinorUnits(paidAmount) <= 0 && !salesAdvanceCoversInvoice) {
          toast.error(`Enter at least one ${splitLabel} amount, or select Credit.`);
          return false;
        }
        const invalidSplit = enteredOrderPaymentSplits.find((split) => !split.method || moneyToMinorUnits(Number(split.amount || 0)) <= 0);
        if (invalidSplit) {
          toast.error(`Every ${splitLabel} row must have a method and an amount greater than zero.`);
          return false;
        }
        if (mode === "api" && enteredOrderPaymentSplits.some((split) => !split.ledgerId || !split.ledgerName)) {
          toast.error(`Select an account ledger for every ${splitLabel} row.`);
          return false;
        }
      }
      const maximumNewPayment = roundCurrencyAmount(classicPurchaseMode
        ? Math.max(0, grandTotal - previousPurchaseAdvanceAmount)
        : classicSalesInvoiceMode
          ? Math.max(0, grandTotal - previousSalesAdvanceAmount)
          : grandTotal);
      if (usesSplitPayments && moneyToMinorUnits(paidAmount) > moneyToMinorUnits(maximumNewPayment)) {
        toast.error(`${classicDebitNoteMode ? "Refund" : classicRevenueMode ? "Received" : "Paid"} amount cannot be greater than the ${classicDebitNoteMode ? "return" : classicRevenueMode ? "revenue" : "order"} total.`);
        return false;
      }
      if (classicDebitNoteMode && purchaseOrderPaymentType !== "Credit" && !moneyAmountsEqual(paidAmount, grandTotal)) {
        toast.error(`Total refund must equal the ${isSalesReturnMode ? "sales" : "purchase"} return total (${formatCurrency(grandTotal)}).`);
        return false;
      }
      if (classicExpenseMode && purchaseOrderPaymentType !== "Credit" && !moneyAmountsEqual(paidAmount, grandTotal)) {
        toast.error(`Total payment must equal the expense total (${formatCurrency(grandTotal)}).`);
        return false;
      }
      if (classicRevenueMode && purchaseOrderPaymentType !== "Credit" && !moneyAmountsEqual(paidAmount, grandTotal)) {
        toast.error(`Total received must equal the revenue total (${formatCurrency(grandTotal)}).`);
        return false;
      }
      if (classicDebitNoteMode && purchaseOrderPaymentType === "Credit") {
        const confirmedCreditAmount = roundCurrencyAmount(Number(purchaseReturnCreditAmount || 0));
        if (moneyToMinorUnits(confirmedCreditAmount) <= 0 || !moneyAmountsEqual(confirmedCreditAmount, grandTotal)) {
          toast.error(`${isSalesReturnMode ? "Invoice adjustment" : "Credit amount"} must equal the ${isSalesReturnMode ? "sales" : "purchase"} return total (${formatCurrency(grandTotal)}).`);
          return false;
        }
      }
      const resolvedSettlementMode = classicPurchaseMode || classicSalesInvoiceMode || classicDebitNoteMode || classicExpenseMode || classicRevenueMode || isPurchaseOrderWorkflow || isSaleOrderWorkflow
        ? splitPaymentIsCredit
          ? "accounts-payable" as const
          : enteredOrderPaymentSplits.every((split) => split.method === "Cash")
            ? "cash" as const
            : "bank" as const
        : values.settlementMode;
      const isPurchaseBillFromReceiptNote =
        voucherType === "purchase" && workflow !== "purchase-order" && workflow !== "receipt-note" && loadedVoucher?.documentKind === "receipt-note";
      const generatedLines =
        simpleInvoiceMode
          ? voucherType === "purchase"
            ? [
                {
                  id: "line-purchase-main",
                  // Goods received go to Inventory Control (an asset) under the
                  // perpetual/moving-average model — COGS is only recognized
                  // later, at the point of sale.
                  ledger: isPurchaseBillFromReceiptNote ? "Purchase Bill Pending" : "Inventory Control",
                  description: isPurchaseBillFromReceiptNote
                    ? "Receipt note converted to purchase bill"
                    : normalizedInvoiceItems.map((item) => item.itemName).filter(Boolean).join(", ") || "Purchase items",
                  debit: unroundedTotal,
                  credit: 0,
                  costCenter: "Head Office",
                  project: "Trading",
                  billReference: lineBillReference,
                },
                ...(classicPurchaseMode
                  ? [
                      ...enteredOrderPaymentSplits.map((split, index) => ({
                        id: `line-purchase-payment-${split.id}-${index}`,
                        accountId: split.ledgerId || undefined,
                        moneyAccountType: split.method === "Cash" ? "CASH" as const : split.method === "MFS" ? "MFS" as const : "BANK" as const,
                        ledger: split.ledgerName || paymentLedger(split.method as PaymentOutMethod),
                        description: `${split.method} purchase payment${split.reference.trim() ? ` (${split.reference.trim()})` : ""}`,
                        debit: 0,
                        credit: Number(split.amount || 0),
                        costCenter: "Head Office",
                        project: "Trading",
                        billReference: lineBillReference,
                      })),
                      ...(grandTotal - paidAmount > 0
                        ? [{
                            id: "line-purchase-due",
                            ledger: values.partyName || accountRoleLabel,
                            description: "Supplier payable settlement",
                            debit: 0,
                            credit: roundCurrencyAmount(grandTotal - paidAmount),
                            costCenter: "Head Office",
                            project: "Trading",
                            billReference: lineBillReference,
                          }]
                        : []),
                    ]
                  : [{
                      id: "line-purchase-balance",
                      accountId: values.settlementMode !== "accounts-payable" ? values.moneyAccountId || undefined : undefined,
                      moneyAccountType: values.settlementMode !== "accounts-payable" ? values.moneyAccountType : undefined,
                      ledger: values.settlementMode !== "accounts-payable" ? values.moneyAccountName || (values.settlementMode === "cash" ? "Cash in Hand" : purchaseSettlementLedgerName(values)) : values.partyName || accountRoleLabel,
                      description: values.settlementMode === "cash" ? "Cash purchase settlement" : values.settlementMode === "bank" ? `${purchaseSettlementLedgerName(values)} purchase settlement` : "Supplier payable settlement",
                      debit: 0,
                      credit: grandTotal,
                      costCenter: "Head Office",
                      project: "Trading",
                      billReference: lineBillReference,
                    }]),
                ...roundOffLines("purchase"),
              ]
            : isSaleOrderWorkflow || isDeliveryNoteWorkflow
              // A Sales Order is a pre-ledger document, exactly like a Purchase
              // Order — it stays "pending" and never posts to the GL, so it has
              // no accounting lines yet. A Delivery Note also has no manual
              // debit/credit lines of its own — its real inventory/COGS effect
              // is posted separately by the backend, the same way a Receipt
              // Note's is.
              ? []
              : [
                ...(paidAmount > 0
                  ? classicSalesInvoiceMode
                    ? enteredOrderPaymentSplits.map((split, index) => ({
                        id: `line-sales-payment-${split.id}-${index}`,
                        accountId: split.ledgerId || undefined,
                        moneyAccountType: split.method === "Cash" ? "CASH" as const : split.method === "MFS" ? "MFS" as const : "BANK" as const,
                        ledger: split.ledgerName || paymentLedger(split.method as PaymentOutMethod),
                        description: `${split.method} customer collection${split.reference.trim() ? ` (${split.reference.trim()})` : ""}`,
                        debit: Number(split.amount || 0),
                        credit: 0,
                        costCenter: "Head Office",
                        project: "Trading",
                        billReference: lineBillReference,
                      }))
                    : [{
                        id: "line-sales-payment",
                        accountId: values.moneyAccountId || undefined,
                        moneyAccountType: values.moneyAccountType,
                        ledger: values.moneyAccountName || "Cash in Hand",
                        description: values.settlementMode === "cash" ? "Cash sale settlement" : "Sales payment settlement",
                        debit: paidAmount,
                        credit: 0,
                        costCenter: "Head Office",
                        project: "Trading",
                        billReference: lineBillReference,
                      }]
                  : []),
                ...(grandTotal - paidAmount > 0
                  ? [{
                      id: "line-sales-receivable",
                      ledger: values.partyName || accountRoleLabel,
                      description: previousSalesAdvanceAmount > 0 ? "Customer advance applied to sales invoice" : "Customer receivable settlement",
                      debit: roundCurrencyAmount(grandTotal - paidAmount),
                      credit: 0,
                      costCenter: "Head Office",
                      project: "Trading",
                      billReference: lineBillReference,
                    }]
                  : []),
                {
                  id: "line-sales-balance",
                  ledger: "Sales Account",
                  description: normalizedInvoiceItems.map((item) => item.itemName).filter(Boolean).join(", ") || "Sales items",
                  debit: 0,
                  credit: unroundedTotal,
                  costCenter: "Head Office",
                  project: "Trading",
                  billReference: lineBillReference,
                },
                ...roundOffLines("sales"),
              ]
          : classicExpenseMode
            ? [
                {
                  id: "line-expense-main",
                  accountId: selectedExpenseLedger?.id,
                  ledger: values.partyName.trim() || "Office Expense",
                  description: normalizedInvoiceItems.map((item) => item.itemName).filter(Boolean).join(", ") || values.narration || "Expense items",
                  debit: grandTotal,
                  credit: 0,
                  costCenter: "Head Office",
                  project: "Trading",
                  billReference: lineBillReference,
                },
                ...(purchaseOrderPaymentType === "Credit"
                  ? [{
                      id: "line-expense-balance",
                      accountId: selectedExpensePayableLedger?.id,
                      ledger: selectedExpensePayableLedger?.name || values.expenseCreditLedger,
                      description: values.expensePayableTo.trim() ? `Payable to ${values.expensePayableTo.trim()}` : "Expense payable settlement",
                      debit: 0,
                      credit: grandTotal,
                      costCenter: "Head Office",
                      project: "Trading",
                      billReference: lineBillReference,
                    }]
                  : enteredOrderPaymentSplits.map((split, index) => ({
                      id: `line-expense-payment-${split.id}-${index}`,
                      accountId: split.ledgerId || undefined,
                      moneyAccountType: split.method === "Cash" ? "CASH" as const : split.method === "MFS" ? "MFS" as const : "BANK" as const,
                      ledger: split.ledgerName || paymentLedger(split.method as PaymentOutMethod),
                      description: `${split.method} expense payment${split.reference.trim() ? ` (${split.reference.trim()})` : ""}`,
                      debit: 0,
                      credit: Number(split.amount || 0),
                      costCenter: "Head Office",
                      project: "Trading",
                      billReference: lineBillReference,
                    }))),
              ]
            : classicDebitNoteMode
              ? isSalesReturnMode
                ? [
                    {
                      id: "line-credit-note-main",
                      ledger: "Sales Return",
                      description: normalizedInvoiceItems.map((item) => item.itemName).filter(Boolean).join(", ") || values.narration || "Sales return items",
                      debit: grandTotal,
                      credit: 0,
                      costCenter: "Head Office",
                      project: "Trading",
                      billReference: lineBillReference,
                    },
                    ...(purchaseOrderPaymentType === "Credit"
                      ? [{
                          id: "line-credit-note-customer-adjustment",
                          ledger: values.partyName.trim() || "Accounts Receivable",
                          description: "Customer receivable adjusted against sales return",
                          debit: 0,
                          credit: grandTotal,
                          costCenter: "Head Office",
                          project: "Trading",
                          billReference: lineBillReference,
                        }]
                      : enteredOrderPaymentSplits.map((split, index) => ({
                          id: `line-credit-note-refund-${split.id}-${index}`,
                          accountId: split.ledgerId || undefined,
                          moneyAccountType: split.method === "Cash" ? "CASH" as const : split.method === "MFS" ? "MFS" as const : "BANK" as const,
                          ledger: split.ledgerName || paymentLedger(split.method as PaymentOutMethod),
                          description: `${split.method} sales return refund${split.reference.trim() ? ` (${split.reference.trim()})` : ""}`,
                          debit: 0,
                          credit: Number(split.amount || 0),
                          costCenter: "Head Office",
                          project: "Trading",
                          billReference: lineBillReference,
                        }))),
                  ]
                : [
                  ...enteredOrderPaymentSplits.map((split, index) => ({
                    id: `line-debit-note-refund-${split.id}-${index}`,
                    accountId: split.ledgerId || undefined,
                    moneyAccountType: split.method === "Cash" ? "CASH" as const : split.method === "MFS" ? "MFS" as const : "BANK" as const,
                    ledger: split.ledgerName || paymentLedger(split.method as PaymentOutMethod),
                    description: `${split.method} refund${split.reference.trim() ? ` (${split.reference.trim()})` : ""}`,
                    debit: Number(split.amount || 0),
                    credit: 0,
                    costCenter: "Head Office",
                    project: "Trading",
                    billReference: lineBillReference,
                  })),
                  ...(grandTotal - paidAmount > 0
                    ? [{
                        id: "line-debit-note-supplier-adjustment",
                        ledger: values.partyName.trim() || "Accounts Payable",
                        description: "Supplier payable adjusted against purchase return",
                        debit: roundCurrencyAmount(grandTotal - paidAmount),
                        credit: 0,
                        costCenter: "Head Office",
                        project: "Trading",
                        billReference: lineBillReference,
                      }]
                    : []),
                  {
                    id: "line-debit-note-balance",
                    ledger: "Purchase Return",
                    description: normalizedInvoiceItems.map((item) => item.itemName).filter(Boolean).join(", ") || values.narration || "Purchase return items",
                    debit: 0,
                    credit: grandTotal,
                    costCenter: "Head Office",
                    project: "Trading",
                    billReference: lineBillReference,
                  },
                ]
            : classicPurchaseWorkflowMode
              ? isPurchaseOrderWorkflow
                ? []
                : [
                  {
                    id: "line-order-main",
                    // Goods received go to Inventory Control (an asset) under the
                    // perpetual/moving-average model — COGS is only recognized
                    // later, at the point of sale.
                    ledger: "Inventory Control",
                    description:
                      normalizedInvoiceItems.map((item) => item.itemName).filter(Boolean).join(", ") ||
                      (isReceiptNoteWorkflow ? "Receipt note items" : "Purchase order items"),
                    debit: grandTotal,
                    credit: 0,
                    costCenter: "Head Office",
                    project: "Trading",
                    billReference: lineBillReference,
                  },
                  {
                    id: "line-order-balance",
                    ledger: "Purchase Bill Pending",
                    description: "Goods received; supplier bill pending",
                    debit: 0,
                    credit: grandTotal,
                    costCenter: "Head Office",
                    project: "Trading",
                    billReference: lineBillReference,
                  },
                ]
            : classicRevenueMode
              ? [
                  ...(purchaseOrderPaymentType === "Credit"
                    ? [{
                        id: "line-revenue-receivable",
                        accountId: selectedRevenueDebtorLedger?.id,
                        ledger: values.partyName || accountRoleLabel,
                        description: "Customer receivable raised",
                        debit: grandTotal,
                        credit: 0,
                        costCenter: "Head Office",
                        project: "Trading",
                        billReference: lineBillReference,
                      }]
                    : enteredOrderPaymentSplits.map((split, index) => ({
                        id: `line-revenue-receipt-${split.id}-${index}`,
                        accountId: split.ledgerId || undefined,
                        moneyAccountType: split.method === "Cash" ? "CASH" as const : split.method === "MFS" ? "MFS" as const : "BANK" as const,
                        ledger: split.ledgerName || paymentLedger(split.method as PaymentOutMethod),
                        description: `${split.method} revenue receipt${split.reference.trim() ? ` (${split.reference.trim()})` : ""}`,
                        debit: Number(split.amount || 0),
                        credit: 0,
                        costCenter: "Head Office",
                        project: "Trading",
                        billReference: lineBillReference,
                      }))),
                  {
                    id: "line-revenue-balance",
                    accountId: selectedRevenueLedger?.id,
                    ledger: values.revenueLedger || "Other Income",
                    description: normalizedInvoiceItems.map((item) => item.itemName).filter(Boolean).join(", ") || values.narration || "Revenue recognized",
                    debit: 0,
                    credit: grandTotal,
                    costCenter: "Head Office",
                    project: "Trading",
                    billReference: lineBillReference,
                  },
                ]
          : values.lines.map((line, index) => {
              const postingSide = line.postingSide ?? resolveLinePostingSide(voucherType, index, line);
              const amount = Math.max(Number(line.debit || 0), Number(line.credit || 0));
              return {
                ...line,
                postingSide,
                debit: postingSide === "debit" ? amount : 0,
                credit: postingSide === "credit" ? amount : 0,
              };
            });
      const activeGeneratedLines = generatedLines.filter((line) => {
        const amount = Math.max(Number(line.debit || 0), Number(line.credit || 0));
        return line.ledger.trim() || amount > 0;
      });
      const emptyAmountLine = activeGeneratedLines.find((line) => Number(line.debit || 0) <= 0 && Number(line.credit || 0) <= 0);
      if (emptyAmountLine) {
        toast.error(`Enter an amount for ${emptyAmountLine.ledger || "each active row"} before submitting.`);
        return false;
      }

      const generatedTotals = {
        debit: sumMoney(activeGeneratedLines.map((line) => Number(line.debit || 0))),
        credit: sumMoney(activeGeneratedLines.map((line) => Number(line.credit || 0))),
      };
      // A Delivery Note has no manual debit/credit lines of its own (see
      // generatedLines above) — its real inventory/COGS effect is posted
      // separately by the backend — so this balance check does not apply.
      if (status === "posted" && !isDeliveryNoteWorkflow && (generatedTotals.debit <= 0 || generatedTotals.credit <= 0)) {
        toast.error("Enter debit and credit amounts before submitting the voucher.");
        return false;
      }

      if (!moneyAmountsEqual(generatedTotals.debit, generatedTotals.credit)) {
        toast.error("Debit and credit totals must be equal before submitting.");
        return false;
      }

      const payload = {
        workspaceId: session.workspaceId,
        voucherType,
        // Records which document this is so an order never shows up as a bill.
        documentKind:
          voucherType === "purchase"
            ? (workflow === "purchase-order" || workflow === "receipt-note" ? workflow : "bill")
            : voucherType === "sales" && isSaleOrderWorkflow
              ? "sale-order"
              : voucherType === "sales" && isDeliveryNoteWorkflow
                ? "delivery-note"
                : undefined,
        // Keeps the order -> receipt note -> bill chain traceable so an order
        // knows how much of it has actually been received.
        sourceVoucherId: preservedSourceVoucherId ?? undefined,
        // The API keeps a document warehouse for backward compatibility, but a
        // Receipt Note's (and a Delivery Note's) stock destination is owned by
        // each product line.
        warehouseId: isReceiptNoteWorkflow || isDeliveryNoteWorkflow || classicSalesInvoiceMode
          ? normalizedInvoiceItems.find((item) => item.itemName && item.quantity > 0 && item.warehouseId)?.warehouseId
          : values.warehouseId || loadedVoucher?.warehouseId || undefined,
        voucherDate: values.voucherDate,
        partyName: isAdjustmentPosting
          ? ""
          : values.partyName || (classicExpenseMode ? "Office Expense" : partyRoleLabel),
        partyId: !isAdjustmentPosting && !classicExpenseMode && !classicRevenueMode
          ? matchedParty?.id
          : undefined,
        reference: values.reference,
        narration: values.narration,
        status,
        settlementMode: resolvedSettlementMode,
        paidAmount,
        supplierAddress: values.supplierAddress,
        condition: values.condition,
        buyerSignature: values.buyerSignature,
        sellerSignature: values.sellerSignature,
        attachmentImageUrl: values.attachmentImageUrl,
        attachmentDocumentUrl: values.attachmentDocumentUrl,
        attachmentDocumentName: values.attachmentDocumentName,
        discountType: values.discountType,
        discountAmount: resolvedDiscount,
        roundOffAmount: submittedRoundOff ? roundOffAmount : undefined,
        subtotal,
        // Prefer the real posted debit/credit total (generatedTotals, computed
        // above from the actual lines) over the item-grid-derived grandTotal —
        // voucher types with no item grid (Journal, Credit Note, Debit Note,
        // ...) always have subtotal/grandTotal stuck at 0, which previously
        // made the Day Book / dashboard show "BDT 0.00" for those vouchers
        // even though their lines carried the real, balanced amount. Falls
        // back to grandTotal only for genuinely pre-ledger documents (Sales
        // Order / Delivery Note) whose generatedLines are empty, so list
        // screens and KPI summaries still show their item-derived total.
        totalAmount: Math.max(generatedTotals.debit, generatedTotals.credit) || grandTotal,
        inventoryItems: classicEntryMode
          ? normalizedInvoiceItems.filter((item) => item.itemName.trim() && Number(item.quantity || 0) > 0)
          : undefined,
        lines: generatedLines.map((line) => {
          if ("postingSide" in line) {
            const { postingSide, ...normalizedLine } = line;
            void postingSide;
            return {
              ...normalizedLine,
              description: classicEntryMode ? normalizedLine.description : values.narration || normalizedLine.description,
            };
          }

          return {
            ...line,
            description: classicEntryMode ? line.description : values.narration || line.description,
          };
        }),
      };
      const voucher = editingVoucherId ? await updateVoucher(mode, editingVoucherId, payload) : await createVoucher(mode, payload);
      if (isPurchaseOrderWorkflow && !editingVoucherId && paidAmount > 0) {
        const orderReference = voucher.reference?.trim() || voucher.voucherNumber;
        const paymentReference = paymentSplits.map((split) => split.reference.trim()).filter(Boolean).join(" | ") || `Advance against ${orderReference}`;
        await createVoucher(
          mode,
          buildPaymentVoucherPayload(
            paymentReference,
            orderReference,
            paidAmount,
            `Advance payment to ${values.partyName.trim()} against ${orderReference}`,
            undefined,
            undefined,
            voucher.id,
          ),
        );
      }
      if (isSaleOrderWorkflow && !editingVoucherId && paidAmount > 0) {
        const orderReference = voucher.reference?.trim() || voucher.voucherNumber;
        const receiptReference = enteredOrderPaymentSplits.map((split) => split.reference.trim()).filter(Boolean).join(" | ") || `Advance against ${orderReference}`;
        await createVoucher(mode, {
          workspaceId: session.workspaceId,
          voucherType: "receipt",
          sourceVoucherId: voucher.id,
          voucherDate: values.voucherDate,
          partyName: values.partyName.trim(),
          partyId: matchedParty?.id,
          reference: receiptReference,
          narration: `Advance receipt from ${values.partyName.trim()} against ${orderReference}`,
          status: "posted",
          settlementMode: enteredOrderPaymentSplits.length === 1 && enteredOrderPaymentSplits[0]?.method === "Cash" ? "cash" : "bank",
          discountType: "fixed",
          discountAmount: 0,
          subtotal: paidAmount,
          totalAmount: paidAmount,
          lines: [
            ...enteredOrderPaymentSplits.map((split, index) => ({
              id: `line-sale-order-receipt-${split.id}-${index}`,
              accountId: split.ledgerId || undefined,
              moneyAccountType: split.method === "Cash" ? "CASH" as const : split.method === "MFS" ? "MFS" as const : "BANK" as const,
              ledger: split.ledgerName || paymentLedger(split.method as PaymentOutMethod),
              description: `${split.method} advance receipt${split.reference.trim() ? ` (${split.reference.trim()})` : ""}`,
              debit: Number(split.amount || 0),
              credit: 0,
              costCenter: split.method === "Cash" ? "Cash-in-Hand" : "Bank Accounts",
              project: "Trading",
              billReference: orderReference,
            })),
            {
              id: "line-sale-order-receipt-party",
              ledger: values.partyName.trim(),
              description: `Advance receipt from ${values.partyName.trim()} against ${orderReference}`,
              debit: 0,
              credit: paidAmount,
              costCenter: "Head Office",
              project: "Trading",
              // This is an advance, not an invoice allocation. Keeping this
              // blank prevents the backend from treating the Sales Order
              // number as an outstanding Sales Invoice reference.
              billReference: "",
            },
          ],
        });
      }
      setLoadedVoucher(voucher);
      // Orders and receipt notes are saved, not posted — saying "posted" would claim a
      // ledger entry that deliberately does not exist yet.
      const savedLabel = isDeliveryNoteWorkflow
        ? "Delivery Note"
        : isPurchaseWorkflowDocument
          ? getPurchaseWorkflowDocumentLabel(workflow)
          : labels[voucherType];
      if (!isPreLedgerDocument && requestedStatus === "posted" && voucher.status !== "posted") {
        // API mode walks draft -> submit -> approve behind the scenes; if that walk
        // stalls partway (e.g. the approve step is rejected) the voucher still saves,
        // just below the requested status — and it won't count in any ledger report
        // (Balance Sheet, Trial Balance, P&L) until it's actually posted. Saying
        // "posted" here would hide that from the user.
        toast.error(
          voucher.postingStallReason
            ? `${savedLabel} saved as "${voucher.status}", not posted yet — ${voucher.postingStallReason}`
            : `${savedLabel} saved as "${voucher.status}", not posted yet — open it from the Day Book and post it again.`,
        );
      } else {
        toast.success(
          editingVoucherId
            ? `${savedLabel} updated`
            : (isPurchaseOrderWorkflow || isSaleOrderWorkflow) && paidAmount > 0
              ? `${savedLabel} saved and ${formatCurrency(paidAmount)} advance posted`
              : isPreLedgerDocument
                ? `${savedLabel} saved`
                : `${savedLabel} posted`,
        );
      }
      await queryClient.invalidateQueries({ queryKey: [mode] });
      onSaved?.(voucher);
      if (displayMode === "dialog") {
        if (status === "posted") {
          onClose?.();
        }
      } else if (redirectAfterSave) {
        // Saving keeps the user inside the module they were working in; only voucher
        // types without a list of their own fall back to the day book.
        let destination =
          voucherType === "purchase" && !workflow && returnToRoute
            ? returnToRoute
            : documentListRoute ?? `${buildWorkspaceRoute(mode, "/day-book")}?highlight=${voucher.id}`;
        if (classicExpenseMode && documentListRoute) {
          const expenseDestination = new URLSearchParams();
          if (selectedExpenseLedger?.id) {
            expenseDestination.set("expenseLedgerId", selectedExpenseLedger.id);
          }
          expenseDestination.set("expenseLedgerName", values.partyName.trim());
          destination = `${documentListRoute}?${expenseDestination.toString()}`;
        }
        startTransition(() => router.push(destination));
      }
      return voucher;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be saved");
      return false;
    }
  }

  useEffect(() => {
    if (editingVoucherId || templateVoucherId) {
      return;
    }

    form.reset(buildDefaultValues(voucherType, voucherTemplate, mode, workflow, isAdjustmentPosting));
    if (isAdjustmentPosting) {
      setActiveJournalLineIndex(0);
      setJournalLedgerQuery("");
    }
  }, [editingVoucherId, form, isAdjustmentPosting, mode, templateVoucherId, voucherTemplate, voucherType, workflow]);

  useEffect(() => {
    if (!classicDebitNoteMode || editingVoucherId || templateVoucherId) {
      return;
    }

    setPurchaseOrderPaymentType("Credit");
    form.setValue("settlementMode", "accounts-payable", { shouldDirty: false, shouldTouch: false });

    const focusFrame = window.requestAnimationFrame(() => {
      form.setFocus("partyName");
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [classicDebitNoteMode, editingVoucherId, form, templateVoucherId]);

  useEffect(() => {
    if (!classicExpenseMode || editingVoucherId || templateVoucherId) {
      return;
    }

    setPurchaseOrderPaymentType("Credit");
    setPaymentSplits([{ id: "expense-payment-empty", method: "Cash", amount: "", ledgerId: "", ledgerName: "", reference: "" }]);
    form.setValue("settlementMode", "accounts-payable", { shouldDirty: false, shouldTouch: false });

    const currentItems = form.getValues("invoiceItems");
    currentItems.forEach((item, index) => {
      if (!item.itemName.trim() && Number(item.unitPrice || 0) === 0 && Number(item.quantity || 0) === 1) {
        form.setValue(`invoiceItems.${index}.quantity`, 0, { shouldDirty: false, shouldTouch: false });
      }
    });
  }, [classicExpenseMode, editingVoucherId, form, templateVoucherId]);

  useEffect(() => {
    if (!classicRevenueMode || editingVoucherId || templateVoucherId) {
      return;
    }

    setPurchaseOrderPaymentType("Credit");
    setPaymentSplits([{ id: "revenue-receipt-empty", method: "Cash", amount: "", ledgerId: "", ledgerName: "", reference: "" }]);
    form.setValue("settlementMode", "accounts-payable", { shouldDirty: false, shouldTouch: false });
  }, [classicRevenueMode, editingVoucherId, form, templateVoucherId]);

  useEffect(() => {
    if ((!editingVoucherId && !templateVoucherId) || !session?.workspaceId) {
      return;
    }

    let active = true;
    setEditLoading(true);
    const voucherIdToLoad = editingVoucherId ?? templateVoucherId;
    if (!voucherIdToLoad) {
      return;
    }

    void getVoucher(mode, voucherIdToLoad, session.workspaceId)
      .then((voucher) => {
        if (!active) {
          return;
        }

        setLoadedVoucher(voucher);
        setSourceDocumentReference(
          !editingVoucherId && templateSourceMode === "fromVoucher" ? voucher.reference?.trim() || voucher.voucherNumber : null,
        );
        const fallback = buildDefaultValues(voucherType, voucherTemplate, mode, workflow, isAdjustmentPosting);
        const nextValues =
          editingVoucherId
            ? mapVoucherRecordToFormValues(voucher, fallback)
            : mapSourceVoucherToPrefill(voucher, voucherType, fallback, templateSourceMode ?? "fromVoucher", workflow);
        form.reset(nextValues);
        if (isAdjustmentPosting) {
          setActiveJournalLineIndex(0);
          setJournalLedgerQuery("");
        }
        if (workflow === "receipt-note") {
          seedReceiptCommittedProducts(nextValues.invoiceItems);
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        toast.error(error instanceof Error ? error.message : editingVoucherId ? "Voucher could not be loaded" : "Source voucher could not be loaded");
      })
      .finally(() => {
        if (active) {
          setEditLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [editingVoucherId, form, isAdjustmentPosting, mode, session?.workspaceId, templateSourceMode, templateVoucherId, voucherTemplate, voucherType, workflow]);

  // Restore a combined Payment-Out exactly as it was posted. The regular voucher
  // form only knows journal lines, so payment methods/references and bill allocations
  // must be reconstructed from those saved lines for the classic payment editor.
  useEffect(() => {
    if (!classicPaymentMode || !editingVoucherId || loadedVoucher?.voucherType !== voucherType) {
      return;
    }

    const restoredSplits = restorePaymentSplitsFromVoucher(loadedVoucher, "payment-split-edit");

    setPaymentSplits(restoredSplits.length ? restoredSplits : [{ id: "payment-split-edit-0", method: "Cash", amount: String(loadedVoucher.amount || ""), ledgerId: "", ledgerName: "Cash in Hand", reference: "" }]);
  }, [classicPaymentMode, editingVoucherId, loadedVoucher]);

  // Opening Customer Receipt from a Sales Invoice pre-fills the invoice's true
  // remaining balance (after earlier receipts/returns), not its original gross.
  useEffect(() => {
    if (!isCustomerReceiptMode || editingVoucherId || templateSourceMode !== "fromVoucher" || loadedVoucher?.voucherType !== "sales" || !historyVouchersLoaded) return;
    const source = computeOutstandingInvoices(historyVouchers, loadedVoucher.partyName).find((invoice) => invoice.sourceId === loadedVoucher.id);
    const amount = source?.balance ?? 0;
    setPaymentSplits((current) => [{ ...(current[0] ?? { id: "receipt-source", method: "Cash", ledgerId: "", ledgerName: "", reference: "" }), amount: amount > 0 ? String(amount) : "" }]);
  }, [editingVoucherId, historyVouchers, historyVouchersLoaded, isCustomerReceiptMode, loadedVoucher, templateSourceMode]);

  useEffect(() => {
    if (!classicDebitNoteMode || !editingVoucherId || !loadedVoucher) return;
    const restoredSplits = restorePurchaseReturnSplitsFromVoucher(loadedVoucher, "purchase-return-refund");
    if (restoredSplits.length) {
      setPurchaseOrderPaymentType("Advance");
      setPaymentSplits(restoredSplits);
      form.setValue("settlementMode", "cash", { shouldDirty: false, shouldTouch: false });
      return;
    }
    setPurchaseOrderPaymentType("Credit");
    setPaymentSplits([{ id: "purchase-return-credit", method: "Cash", amount: "", ledgerId: "", ledgerName: "", reference: "" }]);
    form.setValue("settlementMode", "accounts-payable", { shouldDirty: false, shouldTouch: false });
  }, [classicDebitNoteMode, editingVoucherId, form, loadedVoucher]);

  useEffect(() => {
    if (!classicExpenseMode || !editingVoucherId || !loadedVoucher) return;

    const restoredSplits = restoreExpensePaymentSplitsFromVoucher(loadedVoucher, "expense-payment-edit");
    if (restoredSplits.length) {
      setPurchaseOrderPaymentType("Advance");
      setPaymentSplits(restoredSplits);
      form.setValue(
        "settlementMode",
        restoredSplits.every((split) => split.method === "Cash") ? "cash" : "bank",
        { shouldDirty: false, shouldTouch: false },
      );
      return;
    }

    setPurchaseOrderPaymentType("Credit");
    setPaymentSplits([{ id: "expense-payment-edit-empty", method: "Cash", amount: "", ledgerId: "", ledgerName: "", reference: "" }]);
    form.setValue("settlementMode", "accounts-payable", { shouldDirty: false, shouldTouch: false });
  }, [classicExpenseMode, editingVoucherId, form, loadedVoucher]);

  useEffect(() => {
    if (!classicRevenueMode || !editingVoucherId || !loadedVoucher) return;

    const restoredSplits = restoreRevenueReceiptSplitsFromVoucher(loadedVoucher, "revenue-receipt-edit");
    if (restoredSplits.length) {
      setPurchaseOrderPaymentType("Advance");
      setPaymentSplits(restoredSplits);
      form.setValue(
        "settlementMode",
        restoredSplits.every((split) => split.method === "Cash") ? "cash" : "bank",
        { shouldDirty: false, shouldTouch: false },
      );
      return;
    }

    setPurchaseOrderPaymentType("Credit");
    setPaymentSplits([{ id: "revenue-receipt-edit-empty", method: "Cash", amount: "", ledgerId: "", ledgerName: "", reference: "" }]);
    form.setValue("settlementMode", "accounts-payable", { shouldDirty: false, shouldTouch: false });
  }, [classicRevenueMode, editingVoucherId, form, loadedVoucher]);

  useEffect(() => {
    if (!classicSalesInvoiceMode || !editingVoucherId || !loadedVoucher) return;

    const restoredSplits = restoreRevenueReceiptSplitsFromVoucher(loadedVoucher, "sales-collection-edit");
    if (restoredSplits.length) {
      setPaymentSplits(restoredSplits);
      form.setValue(
        "settlementMode",
        restoredSplits.every((split) => split.method === "Cash") ? "cash" : "bank",
        { shouldDirty: false, shouldTouch: false },
      );
      return;
    }

    setPaymentSplits([{ id: "sales-collection-edit-empty", method: "Cash", amount: "", ledgerId: "", ledgerName: "", reference: "" }]);
    form.setValue("settlementMode", "accounts-payable", { shouldDirty: false, shouldTouch: false });
  }, [classicSalesInvoiceMode, editingVoucherId, form, loadedVoucher]);

  // A Purchase Order is intentionally a non-ledger document; its advance is a
  // separate, posted Payment voucher linked through sourceVoucherId. Reopening the
  // order must hydrate the breakdown from that linked accounting voucher instead of
  // falling back to the new-form Cash/0 row.
  useEffect(() => {
    if (!isPurchaseOrderWorkflow || !editingVoucherId || !loadedVoucher || !historyVouchersLoaded) {
      return;
    }

    const linkedAdvancePayments = historyVouchers
      .filter(
        (voucher) =>
          voucher.voucherType === "payment" &&
          voucher.sourceVoucherId === loadedVoucher.id &&
          voucher.status !== "cancelled",
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const restoredSplits = linkedAdvancePayments.flatMap((voucher, paymentIndex) =>
      restorePaymentSplitsFromVoucher(voucher, `purchase-order-payment-${paymentIndex}`),
    );

    if (restoredSplits.length) {
      setPaymentSplits(restoredSplits);
      setPurchaseOrderPaymentType("Advance");
      return;
    }

    setPurchaseOrderPaymentType("Credit");
    setPaymentSplits([{ id: "purchase-order-payment-empty", method: "Cash", amount: "", ledgerId: "", ledgerName: "", reference: "" }]);
  }, [editingVoucherId, historyVouchers, historyVouchersLoaded, isPurchaseOrderWorkflow, loadedVoucher]);

  useEffect(() => {
    if (!classicPaymentMode || !editingVoucherId || loadedVoucher?.voucherType !== voucherType || !historyVouchers.length) {
      return;
    }

    const savedAllocations = loadedVoucher.lines
      .filter((line) => Number(isCustomerReceiptMode ? line.credit : line.debit || 0) > 0 && Boolean(line.billReference?.trim()) && !line.moneyAccountType)
      .map((line) => ({ reference: line.billReference!.trim(), applied: Number(isCustomerReceiptMode ? line.credit : line.debit || 0) }));
    const preEditOutstanding = (isCustomerReceiptMode ? computeOutstandingInvoices : computeOutstandingBills)(
      historyVouchers.filter((voucher) => voucher.id !== loadedVoucher.id),
      loadedVoucher.partyName,
    );
    const outstandingByReference = new Map(preEditOutstanding.map((bill) => [normalizeLookupValue(bill.reference), bill]));

    setPaymentAllocations(
      savedAllocations.map((allocation, index) => {
        const existing = outstandingByReference.get(normalizeLookupValue(allocation.reference));
        if (existing) {
          return { ...existing, applied: String(allocation.applied) };
        }
        const sourceBill = historyVouchers.find(
          (voucher) =>
            voucher.voucherType === (isCustomerReceiptMode ? "sales" : "purchase") &&
            [voucher.reference, voucher.voucherNumber].some((reference) => normalizeLookupValue(reference || "") === normalizeLookupValue(allocation.reference)),
        );
        return {
          sourceId: sourceBill?.id ?? `saved-allocation-${index}`,
          documentNumber: allocation.reference,
          reference: allocation.reference,
          documentDate: sourceBill?.voucherDate ?? loadedVoucher.voucherDate,
          createdAt: sourceBill?.createdAt ?? loadedVoucher.createdAt,
          amount: Number(sourceBill?.amount || allocation.applied),
          debitNoteApplied: 0,
          balance: Math.max(allocation.applied, Number(sourceBill?.amount || 0)),
          applied: String(allocation.applied),
        };
      }),
    );
  }, [classicPaymentMode, editingVoucherId, historyVouchers, isCustomerReceiptMode, loadedVoucher, voucherType]);

  /**
   * Converting an order into a receipt note pre-fills the order's item quantities —
   * but if part of the order already arrived on an earlier receipt note, only what's
   * still outstanding should show up here, not the original full order quantity.
   * Applied once per loaded order (tracked via the ref) so a later, unrelated
   * refresh of historyVouchers can't subtract the same received quantity twice
   * from a value the user may have already edited by hand.
   */
  useEffect(() => {
    if (editingVoucherId || templateSourceMode !== "fromVoucher" || workflow !== "receipt-note" || !loadedVoucher) {
      return;
    }
    if (receiptQtyAdjustedForRef.current === loadedVoucher.id) {
      return;
    }

    const alreadyReceivedByItem = new Map<string, number>();
    historyVouchers
      .filter((entry) => entry.documentKind === "receipt-note" && entry.sourceVoucherId === loadedVoucher.id && entry.status === "posted")
      .forEach((entry) => {
        (entry.inventoryItems ?? []).forEach((item) => {
          const key = item.itemName.trim().toLowerCase();
          alreadyReceivedByItem.set(key, (alreadyReceivedByItem.get(key) ?? 0) + Number(item.quantity || 0));
        });
      });

    if (alreadyReceivedByItem.size === 0) {
      return;
    }

    receiptQtyAdjustedForRef.current = loadedVoucher.id;
    form.getValues("invoiceItems").forEach((item, index) => {
      const already = alreadyReceivedByItem.get(item.itemName.trim().toLowerCase()) ?? 0;
      if (already <= 0) {
        return;
      }
      const remaining = Math.max(0, Number(item.quantity || 0) - already);
      form.setValue(`invoiceItems.${index}.quantity`, remaining, { shouldDirty: false, shouldTouch: false });
    });
  }, [editingVoucherId, form, historyVouchers, loadedVoucher, templateSourceMode, workflow]);

  /**
   * Mirrors the receipt note adjustment above: converting a sale order into a
   * delivery note pre-fills the order's item quantities, but if part of the
   * order already shipped on an earlier delivery note, only what's still
   * outstanding should show up here.
   */
  useEffect(() => {
    if (editingVoucherId || templateSourceMode !== "fromVoucher" || workflow !== "delivery-note" || !loadedVoucher) {
      return;
    }
    if (deliveryQtyAdjustedForRef.current === loadedVoucher.id) {
      return;
    }

    const alreadyDeliveredByItem = new Map<string, number>();
    historyVouchers
      .filter((entry) => entry.documentKind === "delivery-note" && entry.sourceVoucherId === loadedVoucher.id && entry.status === "posted")
      .forEach((entry) => {
        (entry.inventoryItems ?? []).forEach((item) => {
          const key = item.itemName.trim().toLowerCase();
          alreadyDeliveredByItem.set(key, (alreadyDeliveredByItem.get(key) ?? 0) + Number(item.quantity || 0));
        });
      });

    if (alreadyDeliveredByItem.size === 0) {
      return;
    }

    deliveryQtyAdjustedForRef.current = loadedVoucher.id;
    form.getValues("invoiceItems").forEach((item, index) => {
      const already = alreadyDeliveredByItem.get(item.itemName.trim().toLowerCase()) ?? 0;
      if (already <= 0) {
        return;
      }
      const remaining = Math.max(0, Number(item.quantity || 0) - already);
      form.setValue(`invoiceItems.${index}.quantity`, remaining, { shouldDirty: false, shouldTouch: false });
    });
  }, [editingVoucherId, form, historyVouchers, loadedVoucher, templateSourceMode, workflow]);

  useEffect(() => {
    const saveListener = () => {
      void form.handleSubmit(() => handlePersist("posted"))();
    };
    const addRowListener = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toUpperCase() === "N") {
        event.preventDefault();
        if (simpleInvoiceMode) {
          appendInvoiceItem();
          toast.message("New invoice item added");
          return;
        }

        appendLine();
        toast.message("New accounting row added");
      }
    };
    const exportListener = () => {
      const values = form.getValues();
      downloadCsv(
        `${voucherType}-voucher-draft.csv`,
        simpleInvoiceMode
          ? values.invoiceItems.map((item) => ({
              Item: item.itemName,
              Quantity: item.quantity,
              "Unit Price": item.unitPrice,
              "Total Price": Number(item.quantity || 0) * Number(item.unitPrice || 0),
              Party: values.partyName,
              Settlement: values.settlementMode,
            }))
          : values.lines.map((line) => ({
              Ledger: line.ledger,
              Description: line.description,
              Debit: line.debit,
              Credit: line.credit,
              "Cost Center": line.costCenter,
              Project: line.project,
            })),
      );
      toast.success(`${labels[voucherType]} exported`);
    };
    const printListener = (event: Event) => {
      if (!simpleInvoiceMode) {
        return;
      }

      event.preventDefault();
      handleInvoicePrint();
    };

    window.addEventListener("erp-save-request", saveListener as EventListener);
    window.addEventListener("erp-export-request", exportListener as EventListener);
    window.addEventListener("erp-print-request", printListener);
    window.addEventListener("keydown", addRowListener);
    return () => {
      window.removeEventListener("erp-save-request", saveListener as EventListener);
      window.removeEventListener("erp-export-request", exportListener as EventListener);
      window.removeEventListener("erp-print-request", printListener);
      window.removeEventListener("keydown", addRowListener);
    };
  }, [appendInvoiceItem, form, lines, simpleInvoiceMode, voucherType]);

  const headerDescription = advancedMode
    ? "Advanced posting view with direct debit and credit control."
    : simpleInvoiceMode
      ? `Create a ${documentTitle.toLowerCase()} with party, item, settlement, and totals in one workspace.`
      : undefined;
  const headerActions = (
    <>
      {editingVoucherId ? (
        <>
          <Button variant="outline" type="button" onClick={handleDuplicateVoucher}>
            <Copy className="h-5 w-5" />
            Duplicate
          </Button>
          <Button variant="outline" type="button" onClick={handleInvoicePdfOpen}>
            <FileText className="h-5 w-5" />
            Open PDF
          </Button>
          <Button variant="outline" type="button" onClick={handleInvoicePrint}>
            <Printer className="h-5 w-5" />
            Print
          </Button>
          <Button variant="outline" type="button" onClick={handleConvertVoucherToReturn}>
            <RefreshCw className="h-5 w-5" />
            Convert to Return
          </Button>
          <Button variant="outline" type="button" onClick={handleMakeVoucherPayment}>
            <Wallet className="h-5 w-5" />
            Make Payment
          </Button>
          <Button variant="outline" type="button" onClick={() => setHistoryDialogOpen(true)}>
            <Search className="h-5 w-5" />
            View History
          </Button>
          {mode === "api" && loadedVoucher?.status === "posted" ? (
            <Button
              variant="outline"
              type="button"
              disabled={reversing}
              className="border-amber-500/40 text-amber-600 hover:bg-amber-50"
              onClick={() => setReverseDialogOpen(true)}
            >
              <Undo2 className="h-5 w-5" />
              Reverse
            </Button>
          ) : (
            <Button variant="outline" type="button" className="border-danger/40 text-danger hover:bg-danger/5" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-5 w-5" />
              Delete
            </Button>
          )}
        </>
      ) : null}
      {!simpleInvoiceMode ? (
        <Button variant="outline" type="button" onClick={handleInvoicePrint}>
          <Printer className="h-5 w-5" />
          Print
        </Button>
      ) : null}
      {displayMode === "dialog" ? (
        <Button variant="ghost" type="button" onClick={onClose}>
          <X className="h-5 w-5" />
          Close
        </Button>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        displayMode === "dialog"
          ? classicDebitNoteMode
            ? "h-full"
            : "h-full space-y-4"
          : "flex h-full min-h-0 flex-col gap-3 overflow-hidden",
      )}
    >
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete transaction?"
        description={`Do you want to delete ${documentTitle.toLowerCase()}${loadedVoucher ? ` ${loadedVoucher.voucherNumber}` : ""}?`}
        confirmLabel="Delete Transaction"
        tone="danger"
        onConfirm={() => void handleDeleteCurrentVoucher()}
      />
      <ConfirmationDialog
        open={reverseDialogOpen}
        onOpenChange={setReverseDialogOpen}
        title="Reverse posted voucher?"
        description={`${documentTitle} ${loadedVoucher?.voucherNumber ?? ""} is posted and can't be edited directly. This posts a mirror-image reversing entry — the original stays in the books for audit purposes — and then opens a fresh copy for you to correct and save.`}
        confirmLabel="Reverse & Correct"
        tone="danger"
        onConfirm={() => void handleReverseCurrentVoucher()}
      />
      <Dialog
        open={Boolean(paymentMismatchWarning)}
        onOpenChange={(open) => {
          if (!open) setPaymentMismatchWarning(null);
        }}
      >
        <DialogContent className="w-[min(92vw,480px)] rounded-[18px] border border-[#f4c37d] p-0" hideClose>
          <div className="border-b border-[#f8dfb9] bg-[#fff8ec] px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff0d5] text-[#d97706]">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="text-lg font-semibold text-[#7c4308]">Amount is Mismatch</DialogTitle>
                <DialogDescription className="mt-0.5 text-sm text-[#8a5a24]">
                  Payment amount and bill-deducted amount are not equal.
                </DialogDescription>
              </div>
            </div>
          </div>
          {paymentMismatchWarning ? (
            <div className="space-y-4 px-5 py-5">
              <div className="overflow-hidden rounded-lg border border-[#e4eaf2] bg-white text-sm">
                <div className="flex items-center justify-between border-b border-[#edf1f6] px-4 py-3">
                  <span className="text-[#64748b]">Payment Amount</span>
                  <span className="font-semibold tabular-nums text-[#243b63]">{formatCurrency(paymentMismatchWarning.paymentAmount)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#edf1f6] px-4 py-3">
                  <span className="text-[#64748b]">Bill Deducted</span>
                  <span className="font-semibold tabular-nums text-[#243b63]">{formatCurrency(paymentMismatchWarning.allocatedAmount)}</span>
                </div>
                <div className="flex items-center justify-between bg-[#fffaf2] px-4 py-3">
                  <span className="font-medium text-[#9a5b0a]">Remaining Supplier Advance</span>
                  <span className="font-semibold tabular-nums text-[#c56a08]">{formatCurrency(Math.max(0, paymentMismatchWarning.difference))}</span>
                </div>
              </div>
              <p className="text-sm leading-6 text-[#5d6b80]">
                Click OK to acknowledge this difference. If you save again without making the amounts equal, the remaining amount will be posted as supplier advance, as before.
              </p>
              <div className="flex justify-end">
                <Button
                  type="button"
                  className="min-w-[100px] rounded-md bg-[#e97917] text-white hover:bg-[#d86a0c]"
                  onClick={() => {
                    setAcknowledgedPaymentMismatch(paymentMismatchWarning.signature);
                    setPaymentMismatchWarning(null);
                  }}
                >
                  OK
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent>
          <DialogTitle>Voucher History</DialogTitle>
          <DialogDescription>Quick voucher activity and status details for the current transaction.</DialogDescription>
          {loadedVoucher ? (
            <div className="space-y-4 pt-2">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Voucher No", value: loadedVoucher.voucherNumber },
                  { label: "Type", value: labels[loadedVoucher.voucherType] },
                  { label: "Status", value: loadedVoucher.status },
                  { label: "Date", value: formatDate(loadedVoucher.voucherDate) },
                  { label: "Party", value: loadedVoucher.partyName || "-" },
                  { label: "Reference", value: loadedVoucher.reference || "-" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-canvas/60 px-3 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{item.label}</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-xl border border-border bg-white px-4 py-3">
                {[
                  `${labels[loadedVoucher.voucherType]} ${loadedVoucher.voucherNumber} is currently ${loadedVoucher.status}.`,
                  `Voucher date is ${formatDate(loadedVoucher.voucherDate)} and total amount is ${formatCurrency(loadedVoucher.amount)}.`,
                  loadedVoucher.narration?.trim() ? loadedVoucher.narration : "No extra narration was saved for this voucher.",
                ].map((entry) => (
                  <div key={entry} className="rounded-lg bg-canvas/70 px-3 py-2 text-sm text-foreground">
                    {entry}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(previewDialog)} onOpenChange={(open) => (!open ? setPreviewDialog(null) : undefined)}>
        <DialogContent className="h-[90vh] w-[min(98vw,1760px)] max-w-none rounded-[26px] border border-[#dfe5ee] p-0">
          {previewDialog ? (
            <div className="grid h-full min-h-0 overflow-hidden grid-cols-[clamp(220px,17vw,290px)_minmax(0,1fr)_clamp(240px,19vw,320px)]">
              <div className="min-h-0 overflow-auto border-r border-[#e5eaf1] bg-[#f6f7f9]">
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
                              className={`flex w-full items-start justify-between gap-3 border-b border-[#edf2f7] px-4 py-3 text-left transition last:border-b-0 ${
                                previewTheme === themeOption.id ? "bg-[#dcebf6]" : "hover:bg-[#f8fbff]"
                              }`}
                              onClick={() => setPreviewTheme(themeOption.id)}
                            >
                              <span>
                                <span className="block text-sm font-semibold text-[#1f2f46]">{themeOption.label}</span>
                                <span className="mt-1 block text-xs text-[#6f7d91]">{themeOption.hint}</span>
                              </span>
                              <span
                                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0px] font-bold leading-none ${
                                  previewTheme === themeOption.id ? "border-[#1e5aac] bg-[#1e5aac] text-white" : "border-[#c9d5e4] text-transparent"
                                }`}
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
                    {previewDialog.payload.invoicePadDataUrl ? (
                      <button
                        type="button"
                        className={`mt-3 flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                          previewTheme === "modern" ? "border-[#1e5aac] bg-[#dcebf6]" : "border-[#dde4ee] hover:bg-[#f8fbff]"
                        }`}
                        onClick={() => setPreviewTheme(previewTheme === "modern" ? "tally" : "modern")}
                      >
                        <span>
                          <span className="block text-sm font-semibold text-[#1f2f46]">Use this pad</span>
                          <span className="mt-1 block text-xs text-[#6f7d91]">Show and export using your uploaded letterhead instead of the default theme.</span>
                        </span>
                        <span
                          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0px] font-bold leading-none ${
                            previewTheme === "modern" ? "border-[#1e5aac] bg-[#1e5aac] text-white" : "border-[#c9d5e4] text-transparent"
                          }`}
                        >
                          •
                        </span>
                      </button>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="rounded-full border-[#d8e3f0] bg-white text-[#1f4d8f] hover:bg-[#f7fbff]" onClick={() => invoicePadInputRef.current?.click()}>
                        <UploadCloud className="h-5 w-5" />
                        {previewDialog.payload.invoicePadDataUrl ? "Change Company Pad" : "Upload Company Pad"}
                      </Button>
                      <Button type="button" variant="outline" className="rounded-full border-[#d8e3f0] bg-white text-[#5f6f86] hover:bg-[#f7fbff]" onClick={() => router.push(buildWorkspaceRoute(mode, "/company-profile"))}>
                        <UserRound className="h-5 w-5" />
                        Open Company Profile
                      </Button>
                    </div>
                  </div>
                  <div className="mt-6 rounded-2xl border border-[#e6e1c5] bg-[#fffceb] px-4 py-4 text-sm text-[#776433]">
                    Use this theme for a clean and professional look.
                  </div>
                </div>
              </div>

              <div className="min-h-0 overflow-auto bg-[#eef1f5]">
                <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#dfe6ef] bg-white/95 px-5 py-4 backdrop-blur">
                  <div>
                    <DialogTitle className="text-[32px] font-semibold text-[#183153]">Preview</DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-[#64748b]">
                      {documentTitle} preview for {previewDialog.payload.billToName}
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
                  <div className="mx-auto w-fit shadow-[0_28px_60px_rgba(15,23,42,0.12)]">
                    <InvoiceDocument payload={previewDialog.payload} theme={previewTheme === "modern" ? "pad" : "default"} />
                  </div>
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
                        const payload = payloadForSelectedTheme(previewDialog.payload);
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
                        const payload = payloadForSelectedTheme(previewDialog.payload);
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
                      onClick={() => void downloadInvoicePdf(`${previewDialog.title}.pdf`, payloadForSelectedTheme(previewDialog.payload))}
                    >
                      <Download className="h-5 w-5" />
                      Download PDF
                    </Button>
                    <Button variant="outline" className="justify-start rounded-2xl border-[#e5eaf1] py-6 text-[#2563eb]" onClick={() => void openInvoicePdf(payloadForSelectedTheme(previewDialog.payload))}>
                      <FileText className="h-5 w-5" />
                      Print Invoice (Thermal)
                    </Button>
                    <Button variant="outline" className="justify-start rounded-2xl border-[#e5eaf1] py-6 text-[#2563eb]" onClick={() => void printInvoice(payloadForSelectedTheme(previewDialog.payload))}>
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
      <PartyFormDialog
        open={partyCreateOpen}
        onOpenChange={setPartyCreateOpen}
        mode={mode}
        workspaceId={session?.workspaceId ?? ""}
        seed={partyCreateSeed}
        editingParty={null}
        settings={partyFieldSettings}
        onSettingsChange={handlePartyFieldSettingsChange}
        onSaved={handlePartyCreated}
        lockType
        showSaveAndNew={false}
      />
      <Dialog
        open={partyEditorOpen}
        onOpenChange={(open) => {
          setPartyEditorOpen(open);
          if (!open) {
            setPartyEditorForm(null);
          }
        }}
      >
        <DialogContent hideClose overlayClassName="bg-[#0f172a]/55" className="w-[min(92vw,720px)] overflow-hidden border border-[#d8e1ea] p-0">
          <div className="bg-[linear-gradient(135deg,#0f4ea8_0%,#0f5fd1_45%,#102a67_100%)] px-6 py-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-2xl font-semibold text-white">{partyEditorForm?.id ? "Edit" : "Add"} {partyRoleLabel}</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-white/78">
                  {partyEditorForm?.id
                    ? `Update the selected ${partyRoleLabel.toLowerCase()} in a dedicated window without leaving this voucher.`
                    : `Add a new ${partyRoleLabel.toLowerCase()} in a dedicated window without leaving this voucher.`}
                </DialogDescription>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
                onClick={() => {
                  setPartyEditorOpen(false);
                  setPartyEditorForm(null);
                }}
                aria-label="Close party editor"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          {partyEditorForm ? (
            <div className="space-y-6 bg-white px-6 py-6">
              <div className="grid gap-5 md:grid-cols-2">
                {renderEditorField(
                  `${partyRoleLabel} Name`,
                  <Input
                    className="h-11 border-[#dde3ec] bg-white"
                    value={partyEditorForm.name}
                    onChange={(event) => setPartyEditorForm((current) => (current ? { ...current, name: event.target.value } : current))}
                  />,
                )}
                {renderEditorField(
                  "Phone / Contact",
                  <Input
                    className="h-11 border-[#dde3ec] bg-white"
                    value={partyEditorForm.contact}
                    onChange={(event) => setPartyEditorForm((current) => (current ? { ...current, contact: event.target.value } : current))}
                  />,
                )}
                {renderEditorField(
                  "Address",
                  <Input
                    className="h-11 border-[#dde3ec] bg-white"
                    value={partyEditorForm.address}
                    onChange={(event) => setPartyEditorForm((current) => (current ? { ...current, address: event.target.value } : current))}
                  />,
                  "md:col-span-2",
                )}
                {/* A credit limit is what we extend to a customer buying on account —
                    it has no meaning for a supplier we buy from, so suppliers don't get
                    this field at all rather than a number that means nothing to them. */}
                {isReceivableVoucher
                  ? renderEditorField(
                      "Credit Limit",
                      <Input
                        money
                        className="h-11 border-[#dde3ec] bg-white"
                        type="number"
                        min="0"
                        value={partyEditorForm.creditLimit}
                        onChange={(event) => setPartyEditorForm((current) => (current ? { ...current, creditLimit: event.target.value } : current))}
                      />,
                    )
                  : null}
              </div>
              {renderEditorImpactNote(
                partyEditorForm.id
                  ? `This window updates the selected ${partyRoleLabel.toLowerCase()} and refreshes the current voucher form instantly.`
                  : `This window adds a new ${partyRoleLabel.toLowerCase()} and selects it on the current voucher form instantly.`,
                `If you rename the ${partyRoleLabel.toLowerCase()}, future references in this workspace will follow the new name.`,
              )}
              <div className="flex flex-col-reverse gap-3 border-t border-[#e9edf3] pt-5 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setPartyEditorOpen(false);
                    setPartyEditorForm(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" className="rounded-xl !text-white" onClick={() => void handleSavePartyEditor()} disabled={partyEditorSaving}>
                  <Pencil className="h-5 w-5" />
                  {partyEditorSaving ? `Saving ${partyRoleLabel}...` : partyEditorForm.id ? `Save ${partyRoleLabel}` : `Add ${partyRoleLabel}`}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <AccountFormDialog
        open={ledgerEditorOpen}
        mode="create"
        level="LEDGER"
        parentId={
          ledgerEditorForm?.kind === "debtor"
            ? debtorLedgerParentId
            : ledgerEditorForm?.kind === "revenue"
              ? revenueLedgerParentId
              : expenseLedgerParentId
        }
        tree={accountTreeQuery.data ?? []}
        values={ledgerFormValues}
        error={ledgerFormError}
        submitting={ledgerFormSubmitting || createAccountMutation.isPending}
        onChange={setLedgerFormValues}
        allowParentPicker={ledgerEditorForm?.kind === "expense"}
        onParentChange={(nextParentId) => {
          if (ledgerEditorForm?.kind !== "expense" || !nextParentId) {
            return;
          }
          setExpenseLedgerParentOverride(nextParentId);
          const node = findAccountPath(accountTreeQuery.data ?? [], nextParentId).at(-1);
          if (node) {
            setLedgerFormValues((current) => ({ ...current, nature: node.nature }));
          }
        }}
        onCancel={() => {
          setLedgerEditorOpen(false);
          setLedgerEditorForm(null);
        }}
        onSubmit={() => void handleSubmitLedgerForm()}
      />
      <Dialog
        open={itemEditorOpen}
        onOpenChange={(open) => {
          setItemEditorOpen(open);
          if (!open) {
            setItemEditorForm(null);
          }
        }}
      >
        <DialogContent hideClose overlayClassName="bg-[#0f172a]/55" className="w-[min(92vw,720px)] overflow-hidden border border-[#d8e1ea] p-0">
          <div className="bg-[linear-gradient(135deg,#0f4ea8_0%,#0f5fd1_45%,#102a67_100%)] px-6 py-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-2xl font-semibold text-white">Add Product</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-white/78">
                  Add a new stock item in a dedicated window without leaving this voucher.
                </DialogDescription>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
                onClick={() => {
                  setItemEditorOpen(false);
                  setItemEditorForm(null);
                }}
                aria-label="Close item editor"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          {itemEditorForm ? (
            <div className="space-y-6 bg-white px-6 py-6">
              <div className="grid gap-5 md:grid-cols-2">
                {renderEditorField(
                  "Item Name",
                  <Input
                    className="h-11 border-[#dde3ec] bg-white"
                    value={itemEditorForm.itemName}
                    onChange={(event) => setItemEditorForm((current) => (current ? { ...current, itemName: event.target.value } : current))}
                  />,
                )}
                {renderEditorField(
                  "Item Code",
                  <Input
                    className="h-11 border-[#dde3ec] bg-white"
                    placeholder="Auto-generated if left blank"
                    value={itemEditorForm.itemCode}
                    onChange={(event) => setItemEditorForm((current) => (current ? { ...current, itemCode: event.target.value } : current))}
                  />,
                )}
                {renderEditorField(
                  "Category",
                  <>
                    <Input
                      className="h-11 border-[#dde3ec] bg-white"
                      list="item-editor-category-options"
                      value={itemEditorForm.category}
                      onChange={(event) => setItemEditorForm((current) => (current ? { ...current, category: event.target.value } : current))}
                    />
                    <datalist id="item-editor-category-options">
                      {itemEditorCategoryOptions.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                    {mode === "api" && !itemEditorCategoryOptions.length ? (
                      <p className="!mt-1.5 text-xs text-[#c2410c]">No category exists yet — add one from Products &amp; Services first.</p>
                    ) : null}
                  </>,
                )}
                {renderEditorField(
                  "Unit",
                  <>
                    <Input
                      className="h-11 border-[#dde3ec] bg-white"
                      list="item-editor-unit-options"
                      value={itemEditorForm.unit}
                      onChange={(event) => setItemEditorForm((current) => (current ? { ...current, unit: event.target.value } : current))}
                    />
                    <datalist id="item-editor-unit-options">
                      {itemEditorUnitOptions.map((unit) => (
                        <option key={unit} value={unit} />
                      ))}
                    </datalist>
                  </>,
                )}
                {renderEditorField(
                  "Rate",
                  <Input
                    money
                    className="h-11 border-[#dde3ec] bg-white"
                    type="number"
                    min="0"
                    value={itemEditorForm.rate}
                    onChange={(event) => setItemEditorForm((current) => (current ? { ...current, rate: event.target.value } : current))}
                  />,
                )}
                {renderEditorField(
                  "Opening Qty",
                  <Input
                    className="h-11 border-[#dde3ec] bg-white"
                    type="number"
                    min="0"
                    value={itemEditorForm.openingQty}
                    onChange={(event) => setItemEditorForm((current) => (current ? { ...current, openingQty: event.target.value } : current))}
                  />,
                )}
                <div className="block space-y-1.5">
                  <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8592a8]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[#cbd5e1] accent-primary"
                      checked={Boolean(itemEditorForm.expiryDate)}
                      onChange={(event) =>
                        setItemEditorForm((current) =>
                          current ? { ...current, expiryDate: event.target.checked ? new Date().toISOString().slice(0, 10) : "" } : current,
                        )
                      }
                    />
                    Has Expiry Date
                  </label>
                  {itemEditorForm.expiryDate ? (
                    <AppDateInput
                      aria-label="Expiry Date"
                      value={itemEditorForm.expiryDate}
                      onChange={(value) => setItemEditorForm((current) => (current ? { ...current, expiryDate: value } : current))}
                    />
                  ) : null}
                </div>
              </div>
              {renderEditorImpactNote("This window adds a new item and selects it on the current voucher form instantly.")}
              <div className="flex flex-col-reverse gap-3 border-t border-[#e9edf3] pt-5 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setItemEditorOpen(false);
                    setItemEditorForm(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" className="rounded-xl !text-white" onClick={() => void handleSaveItemEditor()} disabled={itemEditorSaving}>
                  <Pencil className="h-5 w-5" />
                  {itemEditorSaving ? "Saving Product..." : "Add Product"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {displayMode === "page"
        ? classicDebitNoteMode ||
          classicPurchaseStyleMode ||
          classicExpenseMode ||
          classicPaymentMode ||
          voucherType === "revenue"
          ? null
          : advancedMode
            ? null
          : (
              // Non-inventory-backed vouchers (Revenue, Credit Note) always render their own
              // CardTitle/CardDescription lower in this form, so this banner would duplicate
              // it — same reason Expense/Debit Note/Payment are excluded above.
              headerDescription ? <PageHeader title={documentTitle} description={headerDescription} actions={headerActions} /> : null
            )
        : null}
      {/* Only worth a banner while the voucher is still loading — once it's on screen the
          form itself shows what is being edited, and the raw record id means nothing to the user. */}
      {editingVoucherId && editLoading && displayMode === "page" ? (
        <div className="shrink-0 rounded-2xl border border-[#dfe7ff] bg-[#f6f8ff] px-4 py-3 text-sm text-info">
          Loading voucher details from Day Book...
        </div>
      ) : null}
      {classicPaymentMode ? (
        <div
          data-payment-voucher-page={displayMode === "page" ? "true" : undefined}
          ref={paymentOutRootRef}
          onKeyDown={handlePaymentOutKeyboardFlow}
          className={cn(
            "grid gap-4",
            displayMode === "page" ? "min-h-0 flex-1 items-stretch xl:grid-cols-[minmax(0,1fr)_300px]" : "items-start",
          )}
        >
          <div className={cn("space-y-0", displayMode === "page" ? "flex h-full min-h-0 flex-col" : "")}>
            <div
              className={cn(
                "rounded-[10px] border border-[#d8e1ea] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]",
                displayMode === "page" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "",
              )}
            >
              <div data-payment-voucher-header="true" className={cn("border-b border-[#e4ebf5] px-6 py-5", isPageDocumentLayout ? "shrink-0" : "")}>
                <div className="flex items-start justify-between gap-4">
                  <div className="text-[2rem] font-semibold text-[#14233b]">{isCustomerReceiptMode ? "Customer Receipt" : "Payment-Out"}</div>
                  {displayMode === "page" && pageCloseRoute ? (
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#dc2626] shadow-sm transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#991b1b]"
                      onClick={handleClosePageEntry}
                      aria-label={`Close ${isCustomerReceiptMode ? "Customer Receipt" : "Payment-Out"}`}
                      title="Close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div
                data-payment-voucher-body="true"
                className={cn(
                  "flex flex-col gap-8 px-6 py-6",
                  isPageDocumentLayout ? "min-h-0 flex-1 overflow-y-auto" : "",
                )}
              >
                <div data-payment-voucher-info="true" className="grid content-start gap-4 md:grid-cols-[260px_minmax(320px,1fr)_minmax(280px,0.8fr)]">
                  <label className="grid content-start gap-1.5">
                    <span className="text-sm font-medium text-[#0f6cf6]">Date</span>
                    <AppDateInput data-payment-out-date="true" aria-label="Voucher Date" value={form.watch("voucherDate")} onChange={(value) => form.setValue("voucherDate", value, { shouldDirty: true })} />
                  </label>
                  <div className="grid content-start gap-1.5">
                    <div className="grid content-start gap-1.5">
                      <span className="text-sm font-medium text-[#0f6cf6]">{partyRoleLabel} *</span>
                      {renderPartyPickerField({
                        className: "h-11 rounded-[6px] border-[#cfd9e8]",
                        placeholder: isCustomerReceiptMode ? "Select customer" : "Select supplier",
                        disableSuggestions: isPageDocumentLayout,
                        paymentOutFlow: true,
                      })}
                    </div>
                    <button type="button" className="w-fit text-sm font-medium text-[#0f6cf6]" onClick={handleOpenPartyCreate}>
                      + Add {partyRoleLabel}
                    </button>
                  </div>

                  <label className="grid content-start gap-1.5">
                    <span className="text-sm text-[#6f7d91]">{isCustomerReceiptMode ? "Receipt Voucher No." : "Payment Voucher No."}</span>
                    <Input
                      tabIndex={-1}
                      className="h-11 rounded-[6px] border-[#cfd9e8] bg-[#f5f8fc] font-semibold text-[#243b63]"
                      value={loadedVoucher?.voucherNumber ?? paymentVoucherNumber}
                      readOnly
                      aria-readonly="true"
                    />
                  </label>
                </div>

                <div data-payment-voucher-breakdown="true" ref={paymentBreakdownRef} className="shrink-0 overflow-hidden rounded-[8px] border border-[#d7e1ee] bg-white">
                  <div className="flex items-center justify-between border-b border-[#e5ebf3] bg-[#f8fbff] px-4 py-2">
                    <div>
                      <div className="text-sm font-semibold text-[#243b63]">{isCustomerReceiptMode ? "Receipt Breakdown" : "Payment Breakdown"}</div>
                      <div className="text-xs text-[#718098]">Enter/Tab: Method → Ledger → Amount → Reference → next method. Press Enter on an empty method to finish.</div>
                    </div>
                    <button
                      type="button"
                      onClick={appendPaymentSplit}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#e76412] bg-[#fff5eb] px-3 text-xs font-semibold text-[#c95708] transition-colors hover:bg-[#ffe8d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e76412]/30"
                      aria-label="Add another payment method"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Method
                    </button>
                  </div>
                  <div data-payment-voucher-breakdown-grid="true" className="grid grid-cols-[150px_minmax(200px,1fr)_150px_minmax(180px,1fr)_36px] gap-3 border-b border-[#edf1f6] px-4 py-1.5 text-xs font-semibold uppercase text-[#718098]">
                    <div>{isCustomerReceiptMode ? "Received Type" : "Payment Type"}</div><div>Account Ledger *</div><div>Amount</div><div>Reference</div><div />
                  </div>
                  {paymentSplits.map((split) => (
                    <div data-payment-voucher-breakdown-grid="true" key={split.id} className="grid grid-cols-[150px_minmax(200px,1fr)_150px_minmax(180px,1fr)_36px] items-center gap-3 border-b border-[#edf1f6] px-4 py-1.5 last:border-b-0">
                      <select
                        ref={(node) => {
                          if (node) paymentSplitMethodRefs.current.set(split.id, node);
                          else paymentSplitMethodRefs.current.delete(split.id);
                        }}
                        value={split.method}
                        onChange={(event) => updatePaymentSplit(split.id, { method: event.target.value as PaymentOutMethod | "", ledgerId: "", ledgerName: "", reference: event.target.value === "Cash" ? "" : split.reference })}
                        className="h-10 rounded-[5px] border border-[#cfd9e8] bg-white px-3 text-sm font-medium outline-none"
                      >
                        <option value="">Select method</option>
                        {paymentOutMethodOptionsForVoucher.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <MoneyAccountSelector
                        selectRef={(node) => {
                          if (node) paymentSplitLedgerRefs.current.set(split.id, node);
                          else paymentSplitLedgerRefs.current.delete(split.id);
                        }}
                        value={split.ledgerId}
                        enabled={mode === "api"}
                        disabled={!split.method}
                        required={mode === "api"}
                        allowedTypes={[...paymentMoneyAccountTypes(split.method)]}
                        onChange={(ledger) => updatePaymentSplit(split.id, { ledgerId: ledger?.id ?? "", ledgerName: ledger?.name ?? "" })}
                        className="h-10 rounded-[5px]"
                      />
                      <Input
                        ref={(node) => {
                          if (node) paymentSplitAmountRefs.current.set(split.id, node);
                          else paymentSplitAmountRefs.current.delete(split.id);
                        }}
                        money
                        type="number"
                        min="0"
                        step="0.01"
                        value={split.amount}
                        onChange={(event) => updatePaymentSplit(split.id, { amount: event.target.value })}
                        placeholder="0.00"
                        className="h-10 text-right font-semibold"
                      />
                      <Input
                        ref={(node) => {
                          if (node) paymentSplitReferenceRefs.current.set(split.id, node);
                          else paymentSplitReferenceRefs.current.delete(split.id);
                        }}
                        value={split.reference}
                        onChange={(event) => updatePaymentSplit(split.id, { reference: event.target.value })}
                        disabled={!split.method}
                        placeholder={!split.method ? "Select a method first" : split.method === "Cash" ? "Cash reference (optional)" : `${split.method} reference *`}
                        className="h-10"
                      />
                      <button type="button" disabled={paymentSplits.length === 1} onClick={() => removePaymentSplit(split.id)} className="inline-flex h-8 w-8 items-center justify-center text-[#d34b4b] disabled:cursor-not-allowed disabled:opacity-30" aria-label="Remove payment method"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <div className="flex justify-end border-t border-[#d7e1ee] bg-[#f8fafc] px-4 py-2">
                    <div className="text-right"><div className="text-xs font-semibold uppercase text-[#718096]">{isCustomerReceiptMode ? "Total Received Amount" : "Total Paid Amount"}</div><div className="text-xl font-bold text-[#173152]">{formatCurrency(Number(paymentAmount || 0))}</div></div>
                  </div>
                </div>

                {watchedPartyName.trim() ? (
                  <div className={cn(isPageDocumentLayout ? "flex min-h-[220px] flex-1 flex-col" : "")}>
                    {billsForPaymentTable.length ? (
                      <>
                        <div className="mb-3 flex shrink-0 items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-[#14233b]">
                              {editingVoucherId ? `${isCustomerReceiptMode ? "Sales invoices" : "Bills"} this applies to` : `Apply to outstanding ${isCustomerReceiptMode ? "sales invoices" : "bills"}`}
                            </div>
                            <div className="text-xs text-[#7a8798]">
                              {editingVoucherId
                                ? "Edit any row to move this payment to a different bill instead."
                                : "Oldest bill is settled first by default — edit any row to send the payment somewhere else instead."}
                            </div>
                          </div>
                          <div
                            className={cn(
                              "text-sm font-medium",
                              moneyToMinorUnits(paymentAllocatedTotal) > moneyToMinorUnits(paymentAmount || 0)
                                ? "text-[#c63c3c]"
                                : "text-[#61708a]",
                            )}
                          >
                            Applied {formatCurrency(paymentAllocatedTotal)} of {formatCurrency(Number(paymentAmount || 0))}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "rounded-[6px] border border-[#e4ebf4]",
                            isPageDocumentLayout ? "min-h-0 flex-1 overflow-y-auto" : "max-h-64 overflow-y-auto",
                          )}
                        >
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-[#fbfcfe] text-[#586b84]">
                              <tr>
                                <th className="border-b border-[#e4ebf4] px-3 py-2 text-left text-[11px] font-semibold uppercase">{isCustomerReceiptMode ? "Invoice No." : "Bill No."}</th>
                                <th className="border-b border-[#e4ebf4] px-3 py-2 text-left text-[11px] font-semibold uppercase">Date</th>
                                <th className="border-b border-[#e4ebf4] px-3 py-2 text-right text-[11px] font-semibold uppercase">{isCustomerReceiptMode ? "Invoice Total" : "Bill Total"}</th>
                                <th className="border-b border-[#e4ebf4] px-3 py-2 text-right text-[11px] font-semibold uppercase">{isCustomerReceiptMode ? "Sales Return" : "Purchase Return"}</th>
                                <th className="border-b border-[#e4ebf4] px-3 py-2 text-right text-[11px] font-semibold uppercase">Balance Due</th>
                                <th className="border-b border-[#e4ebf4] px-3 py-2 text-right text-[11px] font-semibold uppercase">Applying</th>
                              </tr>
                            </thead>
                            <tbody>
                              {billsForPaymentTable.map((bill, billIndex) => {
                                const allocation = paymentAllocations.find((row) => row.sourceId === bill.sourceId);
                                return (
                                  <tr key={bill.sourceId} className="odd:bg-white even:bg-[#fbfdff]">
                                    <td className="border-b border-[#edf2f7] px-3 py-2 font-medium text-[#173152]">{bill.documentNumber}</td>
                                    <td className="border-b border-[#edf2f7] px-3 py-2 text-[#586b84]">{formatDate(bill.documentDate)}</td>
                                    <td className="border-b border-[#edf2f7] px-3 py-2 text-right text-[#586b84]">{formatCurrency(bill.amount)}</td>
                                    <td className="border-b border-[#edf2f7] px-3 py-2 text-right text-[#586b84]">
                                      {bill.debitNoteApplied > 0 ? `- ${formatCurrency(bill.debitNoteApplied)}` : formatCurrency(0)}
                                    </td>
                                    <td className="border-b border-[#edf2f7] px-3 py-2 text-right text-[#586b84]">{formatCurrency(bill.balance)}</td>
                                    <td className="border-b border-[#edf2f7] px-2 py-1.5 text-right">
                                      <Input
                                        data-payment-out-bill-index={billIndex}
                                        money
                                        type="number"
                                        min="0"
                                        max={bill.balance}
                                        step="0.01"
                                        value={allocation?.applied ?? ""}
                                        onChange={(event) => updatePaymentAllocation(bill.sourceId, event.target.value)}
                                        placeholder="0"
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
                      <div className="text-sm text-[#7a8798]">{watchedPartyName.trim()} has no outstanding {isCustomerReceiptMode ? "sales invoices" : "bills"} — this will be recorded as an unlinked {isCustomerReceiptMode ? "advance receipt" : "payment"}.</div>
                    )}
                  </div>
                ) : null}

                <div data-payment-voucher-summary="true" className="mt-auto shrink-0 pt-2">
                  {paymentExceedsTotalDue ? (
                    <div
                      role="alert"
                      className="mb-2 ml-auto flex max-w-[420px] items-start gap-2 rounded-[6px] border border-[#f5b76d] bg-[#fff8ed] px-3 py-2 text-[#9a4f08]"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="text-xs leading-5">
                        <span className="font-semibold">{isCustomerReceiptMode ? "Receipt" : "Payment"} exceeds total due by {formatCurrency(paymentExcessAmount)}.</span>{" "}
                        The extra amount will be recorded as an advance {isCustomerReceiptMode ? "receipt" : "payment"}.
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-stretch justify-end gap-3">
                    <div className="min-w-[180px] rounded-[6px] border border-[#dbe4ef] bg-[#f8fafc] px-4 py-3 text-right">
                      <div className="text-xs font-semibold uppercase text-[#718096]">Total Due</div>
                      <div className="mt-1 text-lg font-semibold text-[#173152]">{formatCurrency(paymentTotalDue)}</div>
                    </div>
                    <div
                      className={cn(
                        "min-w-[180px] rounded-[6px] border px-4 py-3 text-right",
                        paymentExceedsTotalDue ? "border-[#e99a3d] bg-[#fff3df]" : "border-[#dbe4ef] bg-[#f8fafc]",
                      )}
                    >
                      <div className={cn("text-xs font-semibold uppercase", paymentExceedsTotalDue ? "text-[#9a5b13]" : "text-[#718096]")}>{isCustomerReceiptMode ? "Receipt Amount" : "Payment Amount"}</div>
                      <div className={cn("mt-1 text-lg font-semibold", paymentExceedsTotalDue ? "text-[#c96508]" : "text-[#173152]")}>{formatCurrency(numericPaymentAmount)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              data-payment-voucher-footer="true"
              className={cn(
                "border-t border-[#d9e1ec] bg-white px-6 py-5",
                displayMode === "page" ? "mt-auto shrink-0" : "",
              )}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-end">
                <label className="grid min-w-0 content-start gap-1.5">
                  <span className="text-sm font-medium text-[#6f7d91]">Narration</span>
                  <Input data-payment-out-narration="true" className="h-11 rounded-[6px] border-[#cfd9e8]" placeholder="Optional note" {...form.register("narration")} />
                </label>
                <div className="flex items-center justify-end gap-4">
                  <Button variant="outline" type="button" className="border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={() => toast.info("Share is available once this payment is saved.")}>
                    <Share2 className="h-5 w-5" />
                    Share
                  </Button>
                  <Button data-payment-out-save="true" type="button" className="min-w-[120px] rounded-[4px] px-10" disabled={paymentSaving} onClick={() => void handleSavePaymentOut()}>
                    <CheckCircle2 className="h-5 w-5" />
                    {paymentSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {displayMode === "page" ? renderSidePickerPanel() : null}
        </div>
      ) : usesOrderWorkflowLayout ? (
        <div
          data-order-workflow-page={displayMode === "page" ? "true" : undefined}
          className={cn(
            "grid gap-4",
            // Fill whatever height the shell actually gives us instead of guessing at the
            // viewport, so the document never runs past the bottom of the page.
            displayMode === "page" && usesOrderWorkflowLayout
              ? "min-h-0 flex-1 items-stretch xl:grid-cols-[minmax(0,1fr)_300px]"
              : "items-start",
          )}
        >
        <form
          data-order-workflow-form="true"
          className={cn("space-y-0", displayMode === "page" && usesOrderWorkflowLayout ? "flex h-full min-h-0 flex-col" : "")}
          onSubmit={form.handleSubmit(() => handlePersist("posted"))}
          onKeyDown={isReceiptNoteWorkflow ? handleReceiptNoteKeyboardFlow : handlePurchaseOrderKeyboardFlow}
          onBlurCapture={(event) => {
            if (event.target instanceof HTMLSelectElement) {
              delete event.target.dataset.poPickerOpened;
            }
          }}
        >
          <div
            className={cn(
              "overflow-hidden rounded-[8px] border border-[#d8e1ea] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
              displayMode === "page" && usesOrderWorkflowLayout ? "flex h-full min-h-0 flex-col" : "",
            )}
          >
            <div data-order-workflow-header="true" className={cn("border-b border-[#e4ebf5] px-5 py-3.5", isPageDocumentLayout ? "shrink-0" : "")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-2xl font-semibold leading-8 text-[#14233b]">{getOrderWorkflowDocumentLabel(workflow)}</div>
                  <p className="mt-0.5 text-xs text-[#718198]">Enter order details, items, pricing and supporting information.</p>
                </div>
                {displayMode === "page" && pageCloseRoute ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#dc2626] shadow-sm transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#991b1b]"
                    onClick={handleClosePageEntry}
                    aria-label={`Close ${getOrderWorkflowDocumentLabel(workflow)}`}
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div data-order-workflow-body="true" className={cn("space-y-4 px-5 py-3 text-sm", isPageDocumentLayout ? "flex min-h-0 flex-1 flex-col gap-3 space-y-0 overflow-y-auto py-2.5" : "")}>
              <section data-order-workflow-info="true" className="rounded-lg border border-[#dce5f0] bg-[#f8fbff] p-4">
                <div className="mb-3 text-sm font-semibold text-[#1d3a61]">
                  {getOrderWorkflowDocumentLabel(workflow)} Information
                </div>
                <div
                  className={cn(
                    "grid items-start gap-3 md:grid-cols-2",
                    usesReceiptNoteLayout
                      ? "xl:grid-cols-[minmax(0,180px)_minmax(0,210px)_minmax(150px,1fr)_minmax(0,180px)]"
                      : "xl:grid-cols-[minmax(0,160px)_minmax(0,100px)_minmax(150px,1fr)_minmax(0,160px)]",
                  )}
                >
                <div className="order-3">
                  <div className="grid gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">{voucherType === "sales" ? "Customer Name" : "Supplier Name"} *</span>
                    {renderPartyPickerField({
                      className: "h-10 rounded-md border-[#9fb4cf] bg-white text-sm",
                      placeholder: voucherType === "sales" ? "Select customer" : "Select supplier",
                      disableSuggestions: displayMode === "page" && usesOrderWorkflowLayout,
                      tabIndex: usesOrderDocumentLayout ? 2 : 3,
                      purchaseOrderFlow: usesOrderDocumentLayout,
                      receiptNoteFlow: usesReceiptNoteLayout,
                    })}
                  </div>
                  {displayMode === "page" && usesOrderWorkflowLayout ? null : (
                    <button
                      type="button"
                      className="mt-2 text-sm font-medium text-[#0f6cf6]"
                      onClick={handleOpenPartyCreate}
                    >
                      + Add {partyRoleLabel}
                    </button>
                  )}
                </div>

                <label className="hidden">
                    <span className="text-xs font-semibold text-[#3b4b63]">{getOrderWorkflowDocumentLabel(workflow)} Number</span>
                    <Input tabIndex={usesOrderDocumentLayout ? -1 : 2} className="h-10 rounded-md border-[#cfd9e8] bg-white text-sm" placeholder="Auto-generated" {...form.register("reference")} />
                  </label>
                  <label className="order-1 grid gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">{usesReceiptNoteLayout ? (isDeliveryNoteWorkflow ? "Delivery Date" : "Receipt Date") : (isSaleOrderWorkflow ? "Sales Order Date" : "Purchase Order Date")}</span>
                    <AppDateInput
                      tabIndex={1}
                      data-workflow-date="true"
                      data-po-date={isPurchaseOrderWorkflow ? "true" : undefined}
                      data-receipt-note-date={isReceiptNoteWorkflow ? "true" : undefined}
                      aria-label={usesReceiptNoteLayout ? (isDeliveryNoteWorkflow ? "Delivery Date" : "Receipt Date") : (isSaleOrderWorkflow ? "Sales Order Date" : "Purchase Order Date")}
                      value={form.watch("voucherDate")}
                      onChange={(value) => form.setValue("voucherDate", value, { shouldDirty: true, shouldValidate: true })}
                    />
                  </label>
                  {!usesReceiptNoteLayout ? (
                    <div className="order-2 grid min-w-0 gap-1.5">
                      <span className="text-xs font-semibold text-[#3b4b63]">Day</span>
                      <div
                        className={cn(
                          "flex h-10 items-center justify-center rounded-md border px-2 text-sm font-semibold transition-colors",
                          getWeekdayColorClass(form.watch("voucherDate")),
                        )}
                        aria-label="Selected weekday"
                      >
                        {getWeekdayName(form.watch("voucherDate"))}
                      </div>
                    </div>
                  ) : null}
                  {usesReceiptNoteLayout ? (
                    <label className="order-2 grid min-w-0 gap-1.5">
                      <span className="text-xs font-semibold text-[#3b4b63]">
                        {isDeliveryNoteWorkflow ? "Delivery Note Number" : "GRN Number"}
                      </span>
                      <Input
                        value={invoiceNumber}
                        readOnly
                        tabIndex={-1}
                        aria-label={isDeliveryNoteWorkflow ? "Delivery Note Number" : "GRN Number"}
                        className="h-10 rounded-md border-[#cfd9e8] bg-[#f3f6fa] text-sm text-[#35445c]"
                      />
                    </label>
                  ) : null}
                  {usesReceiptNoteLayout ? (
                    <label className="order-4 grid min-w-0 gap-1.5">
                      <span className="text-xs font-semibold text-[#3b4b63]">
                        {isDeliveryNoteWorkflow ? "Reference Sales Order Number *" : "Reference PO Number *"}
                      </span>
                      <Input
                        data-receipt-note-source-reference={isReceiptNoteWorkflow ? "true" : undefined}
                        value={sourceWorkflowReference}
                        readOnly
                        tabIndex={-1}
                        aria-required={isReceiptNoteWorkflow || isDeliveryNoteWorkflow}
                        placeholder={isDeliveryNoteWorkflow ? "No linked Sales Order" : "No linked Purchase Order"}
                        aria-label={isDeliveryNoteWorkflow ? "Reference Sales Order Number" : "Reference PO Number"}
                        className="h-10 rounded-md border-[#cfd9e8] bg-[#f3f6fa] text-sm text-[#35445c]"
                      />
                    </label>
                  ) : null}
                  {!usesReceiptNoteLayout ? (
                    <label className="order-3 grid min-w-0 gap-1.5">
                      <span className="text-xs font-semibold text-[#3b4b63]">Due Date</span>
                      <AppDateInput data-po-due-date="true" tabIndex={3} aria-label="Due Date" value={form.watch("voucherDate")} readOnly />
                    </label>
                  ) : null}
                </div>
                {false && !isReceiptNoteWorkflow && purchaseOrderPaymentType !== "Credit" ? (
                  <div ref={paymentBreakdownRef} className="mt-4 overflow-hidden rounded-md border border-[#d7e1ee] bg-white">
                    <div className="flex items-center justify-between border-b border-[#e5ebf3] bg-[#f8fafc] px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-[#243b63]">Advance Payment Breakdown</div>
                        <div className="text-[11px] text-[#718098]">Optional — split the advance across Cash, Bank, Card or MFS.</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {mode === "api" ? (
                          <button type="button" onClick={() => window.open("/app/reports/chart-of-accounts", "_blank", "noopener,noreferrer")} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#cbd5e1] bg-white px-3 text-xs font-semibold text-[#475569]">
                            <Plus className="h-3.5 w-3.5" /> Add Ledger
                          </button>
                        ) : null}
                        <button type="button" onClick={appendPaymentSplit} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#8ebcff] px-3 text-xs font-semibold text-[#0f6cf6]">
                          <Plus className="h-3.5 w-3.5" /> Add Method
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[104px_minmax(150px,1fr)_104px_minmax(140px,1fr)_32px] gap-2 border-b border-[#edf1f6] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#718098]">
                      <div>Type</div><div>Account Ledger *</div><div className="text-right">Amount</div><div>Reference</div><div />
                    </div>
                    {paymentSplits.map((split, splitIndex) => (
                      <div key={split.id} className="grid grid-cols-[104px_minmax(150px,1fr)_104px_minmax(140px,1fr)_32px] items-center gap-2 border-b border-[#edf1f6] px-3 py-1.5 last:border-b-0">
                        <select
                          ref={(node) => {
                            if (node) paymentSplitMethodRefs.current.set(split.id, node);
                            else paymentSplitMethodRefs.current.delete(split.id);
                          }}
                          data-po-payment-method={splitIndex}
                          value={split.method}
                          onChange={(event) => {
                            const method = event.target.value as PaymentOutMethod | "";
                            updatePaymentSplit(split.id, { method, ledgerId: "", ledgerName: "", reference: method === "Cash" ? "" : split.reference });
                          }}
                          className="h-9 rounded-md border border-[#cfd9e8] bg-white px-2 text-sm"
                        >
                          <option value="">Select method</option>
                          {paymentOutMethodOptionsForVoucher.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <MoneyAccountSelector
                          selectRef={(node) => {
                            if (node) paymentSplitLedgerRefs.current.set(split.id, node);
                            else paymentSplitLedgerRefs.current.delete(split.id);
                          }}
                          purchaseOrderPaymentRow={splitIndex}
                          value={split.ledgerId}
                          enabled={mode === "api"}
                          disabled={!split.method}
                          required={mode === "api"}
                          allowedTypes={[...paymentMoneyAccountTypes(split.method)]}
                          onChange={(ledger) => updatePaymentSplit(split.id, { ledgerId: ledger?.id ?? "", ledgerName: ledger?.name ?? "" })}
                          className="h-9 rounded-md"
                        />
                        <Input
                          ref={(node) => {
                            if (node) paymentSplitAmountRefs.current.set(split.id, node);
                            else paymentSplitAmountRefs.current.delete(split.id);
                          }}
                          data-po-payment-amount={splitIndex}
                          money
                          type="number"
                          min="0"
                          step="0.01"
                          value={split.amount}
                          onChange={(event) => updatePaymentSplit(split.id, { amount: event.target.value })}
                          placeholder="0.00"
                          className="h-9 text-right font-semibold"
                        />
                        <Input
                          ref={(node) => {
                            if (node) paymentSplitReferenceRefs.current.set(split.id, node);
                            else paymentSplitReferenceRefs.current.delete(split.id);
                          }}
                          data-po-payment-reference={splitIndex}
                          value={split.reference}
                          onChange={(event) => updatePaymentSplit(split.id, { reference: event.target.value })}
                          disabled={!split.method}
                          placeholder={!split.method ? "Select method first" : "Reference (optional)"}
                          className="h-9"
                        />
                        <button type="button" disabled={paymentSplits.length === 1} onClick={() => removePaymentSplit(split.id)} className="inline-flex h-8 w-8 items-center justify-center text-[#d34b4b] disabled:opacity-30" aria-label="Remove advance payment method"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <div className="flex items-center justify-end gap-8 border-t border-[#d7e1ee] bg-[#f8fafc] px-3 py-2">
                      <span className="text-xs font-semibold uppercase text-[#718096]">Total Advance</span>
                      <span className="text-base font-bold text-emerald-700">{formatCurrency(Number(paymentAmount || 0))}</span>
                    </div>
                  </div>
                ) : null}
              </section>

              <section data-order-workflow-items="true" className={cn("overflow-hidden rounded-lg border border-[#d7e1ee] bg-white", isPageDocumentLayout ? "flex min-h-[152px] flex-col" : "")}>
                <div data-order-workflow-items-title="true" className="flex shrink-0 items-center justify-between border-b border-[#d7e1ee] bg-[#f8fafc] px-3 py-2">
                  <span className="text-sm font-semibold text-[#1d3a61]">Items</span>
                  <span className="text-xs text-[#718198]">
                    {usesReceiptNoteLayout ? `Choose a warehouse for each ${isDeliveryNoteWorkflow ? "delivered" : "received"} product` : "Add products, quantity, unit and unit price"}
                  </span>
                </div>
                <div data-order-workflow-items-scroll="true" className={cn("overflow-x-auto", isPageDocumentLayout ? "min-h-0 flex-1 overflow-y-auto" : "")}>
                  <div className={cn(usesReceiptNoteLayout ? "min-w-[640px]" : "min-w-0")}>
                <div
                  data-order-workflow-items-columns="true"
                  className={cn(
                    "grid border-b border-[#d7e1ee] bg-white text-xs font-semibold uppercase tracking-[0.05em] text-[#1d3a61]",
                    purchaseWorkflowItemGridColumns,
                  )}
                >
                  <div className="order-1 px-2 py-2.5 text-center">#</div>
                  <div className="order-2 border-l border-[#e7edf5] px-3 py-2.5">Item</div>
                  <div className="order-3 border-l border-[#e7edf5] px-3 py-2.5">Qty</div>
                  <div className="order-4 border-l border-[#e7edf5] px-3 py-2.5">Unit</div>
                  <div className="order-5 border-l border-[#e7edf5] px-3 py-2.5 text-right">Unit Price</div>
                  <div className="order-6 border-l border-[#e7edf5] px-3 py-2.5 text-right">Amount</div>
                  {usesReceiptNoteLayout ? <div className="order-7 border-l border-[#e7edf5] px-3 py-2.5">Warehouse *</div> : null}
                  <div className="order-8 border-l border-[#e7edf5] px-3 py-3 text-center">
                    <button type="button" tabIndex={-1} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#0f6cf6] text-[#0f6cf6]" onClick={appendInvoiceItem}>
                      +
                    </button>
                  </div>
                </div>

                <div data-order-workflow-item-rows="true" className="divide-y divide-[#edf2f8]">
                  {invoiceItems.fields.map((field, index) => {
                    const matchedInventoryItem = findInventoryOption(watchedInvoiceItems[index]?.itemName || "");
                    const quantity = Number(watchedInvoiceItems[index]?.quantity || 0);
                    const unitPrice = Number(watchedInvoiceItems[index]?.unitPrice || 0);
                    const lineTotal = quantity * unitPrice;
                    const tracksBatchExpiry = Boolean(matchedInventoryItem?.trackBatchExpiry);
                    const rowTabIndex = 10 + index * (usesReceiptNoteLayout ? 4 : 3);

                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "grid",
                          purchaseWorkflowItemGridColumns,
                        )}
                      >
                        <div className="order-1 px-2 py-3 text-center text-xs text-[#6f7d91]">{index + 1}</div>
                        <div className="order-2 border-l border-[#edf2f8] px-2 py-1.5">
                          {renderItemNameCell(index, "h-10 rounded-[4px] border-[#9fb1c8] bg-[#f8fbff] shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20", "Select or type item", rowTabIndex, index)}
                        </div>
                        {usesReceiptNoteLayout ? (
                          <div className="order-7 border-l border-[#edf2f8] px-2 py-1.5">
                            {renderWarehousePickerField(index, rowTabIndex + 3)}
                            {isDeliveryNoteWorkflow ? renderManufacturingSaleProvenance(index) : null}
                          </div>
                        ) : null}
                        <div className="order-3 border-l border-[#edf2f8] px-2 py-1.5">
                          <Input data-item-quantity-row={index} data-receipt-quantity-row={isReceiptNoteWorkflow ? index : undefined} tabIndex={rowTabIndex + 1} className="h-10 rounded-[4px] border-[#9fb1c8] bg-[#f8fbff] text-right font-medium shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20" type="number" min="0" step="0.01" placeholder="0" {...form.register(`invoiceItems.${index}.quantity`, { valueAsNumber: true })} />
                        </div>
                        <div className="order-4 border-l border-[#edf2f8] px-3 py-3 text-xs font-medium text-[#1f2f46]">{matchedInventoryItem?.unit ?? "NONE"}</div>
                        <div className="order-5 border-l border-[#edf2f8] px-2 py-1.5">
                          <Input
                            tabIndex={rowTabIndex + 2}
                            data-receipt-unit-price-row={isReceiptNoteWorkflow ? index : undefined}
                            data-po-unit-price={index}
                            money
                            className="h-10 rounded-[4px] border-[#879db9] bg-[#f8fbff] text-right font-semibold text-[#14233b] shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={unitPrice || ""}
                            onChange={(event) => form.setValue(`invoiceItems.${index}.unitPrice`, Number(event.target.value || 0), { shouldDirty: true, shouldTouch: true })}
                          />
                          {renderLastRateHint(index)}
                        </div>
                        <div className="order-6 border-l border-[#edf2f8] px-3 py-3 text-right text-sm font-medium tabular-nums text-[#1f2f46]">{formatCurrency(lineTotal)}</div>
                        <div className="order-8 border-l border-[#edf2f8] px-1 py-1.5">
                          <Button tabIndex={-1} type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-md" onClick={() => invoiceItems.remove(index)} disabled={invoiceItems.fields.length === 1}>
                            <MinusCircle className="h-5 w-5" />
                          </Button>
                        </div>
                        {tracksBatchExpiry && (isReceiptNoteWorkflow || classicPurchaseMode) ? (
                          <div className="order-9 col-span-full grid gap-3 border-l border-t border-[#edf2f8] bg-[#fbfdff] px-3 py-3 sm:grid-cols-3">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-[#52657e]">Batch / Lot Number (Optional)</label>
                              <Input className="h-9" placeholder="Batch or lot number" {...form.register(`invoiceItems.${index}.batchNumber`)} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-[#52657e]">Manufacturing Date</label>
                              <AppDateInput value={watchedInvoiceItems[index]?.manufacturedAt ?? ""} onChange={(value) => form.setValue(`invoiceItems.${index}.manufacturedAt`, value, { shouldDirty: true })} aria-label={`Manufacturing date for row ${index + 1}`} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-[#52657e]">Expiry Date <span className="text-red-600" aria-hidden="true">*</span></label>
                              <AppDateInput value={watchedInvoiceItems[index]?.expiresAt ?? ""} onChange={(value) => form.setValue(`invoiceItems.${index}.expiresAt`, value, { shouldDirty: true })} aria-label={`Expiry date for row ${index + 1}`} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div
                  data-order-workflow-items-footer="true"
                  className={cn(
                    "grid border-t border-[#d7e1ee] bg-[#f8fafc] text-sm",
                    purchaseWorkflowItemGridColumns,
                  )}
                >
                  <div className="px-3 py-3" />
                  <div className="px-3 py-2">
                    <Button tabIndex={-1} type="button" variant="outline" className="rounded-[4px] border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={appendInvoiceItem}>
                      Add Row
                    </Button>
                  </div>
                  <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">Total</div>
                  <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">{formatNumber(invoiceQuantityTotal)}</div>
                  <div className="px-3 py-3" />
                  {usesReceiptNoteLayout ? <div className="px-3 py-3" /> : null}
                  <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">{formatCurrency(invoiceNetTotal)}</div>
                  <div className="px-3 py-3" />
                </div>
                  </div>
                </div>
              </section>

              {!usesReceiptNoteLayout ? (
                <section
                  data-order-workflow-payment="true"
                  className={cn(
                    "rounded-lg border border-[#dce5f0] bg-[#f8fbff] p-3",
                    purchaseOrderPaymentType === "Credit" ? "w-fit max-w-full" : "",
                  )}
                >
                  {/* Label and select share one row: as a stacked block this single
                    * dropdown cost a whole band of height on every order screen. */}
                  <label className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-[#3b4b63]">Payment Type *</span>
                    <select
                      data-po-primary-payment-type="true"
                      tabIndex={4}
                      value={purchaseOrderPaymentType}
                      onChange={(event) => updatePurchaseOrderPaymentType(event.target.value as "Credit" | "Advance")}
                      className="h-9 w-full max-w-[240px] rounded-md border border-[#cfd9e8] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#6b9ee8] focus:ring-2 focus:ring-[#dbeafe]"
                    >
                      <option value="Credit">Credit</option>
                      <option value="Advance">Cash/Bank/MFS</option>
                    </select>
                  </label>
                  {purchaseOrderPaymentType !== "Credit" ? (
                    <div ref={paymentBreakdownRef} className="mt-4 overflow-hidden rounded-md border border-[#d7e1ee] bg-white">
                      <div className="flex items-center justify-between border-b border-[#e5ebf3] bg-[#f8fafc] px-3 py-2">
                        <div>
                          <div className="text-xs font-semibold text-[#243b63]">Advance Payment Breakdown</div>
                          <div className="text-[11px] text-[#718098]">Optional — split the advance across Cash, Bank, Card or MFS.</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {mode === "api" ? <button type="button" onClick={() => window.open("/app/reports/chart-of-accounts", "_blank", "noopener,noreferrer")} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#cbd5e1] bg-white px-3 text-xs font-semibold text-[#475569]"><Plus className="h-3.5 w-3.5" /> Add Ledger</button> : null}
                          <button type="button" onClick={appendPaymentSplit} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#8ebcff] px-3 text-xs font-semibold text-[#0f6cf6]"><Plus className="h-3.5 w-3.5" /> Add Method</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-[104px_minmax(150px,1fr)_104px_minmax(140px,1fr)_32px] gap-2 border-b border-[#edf1f6] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#718098]">
                        <div>Type</div><div>Account Ledger *</div><div className="text-right">Amount</div><div>Reference</div><div />
                      </div>
                      {paymentSplits.map((split, splitIndex) => (
                        <div key={split.id} className="grid grid-cols-[104px_minmax(150px,1fr)_104px_minmax(140px,1fr)_32px] items-center gap-2 border-b border-[#edf1f6] px-3 py-1.5 last:border-b-0">
                          <select
                            ref={(node) => { if (node) paymentSplitMethodRefs.current.set(split.id, node); else paymentSplitMethodRefs.current.delete(split.id); }}
                            data-po-payment-method={splitIndex}
                            value={split.method}
                            onChange={(event) => {
                              const method = event.target.value as PaymentOutMethod | "";
                              updatePaymentSplit(split.id, { method, ledgerId: "", ledgerName: "", reference: method === "Cash" ? "" : split.reference });
                            }}
                            className="h-9 rounded-md border border-[#cfd9e8] bg-white px-2 text-sm"
                          >
                            <option value="">Select method</option>
                            {paymentOutMethodOptionsForVoucher.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                          <MoneyAccountSelector
                            selectRef={(node) => { if (node) paymentSplitLedgerRefs.current.set(split.id, node); else paymentSplitLedgerRefs.current.delete(split.id); }}
                            purchaseOrderPaymentRow={splitIndex}
                            value={split.ledgerId}
                            enabled={mode === "api"}
                            disabled={!split.method}
                            required={mode === "api"}
                            allowedTypes={[...paymentMoneyAccountTypes(split.method)]}
                            onChange={(ledger) => updatePaymentSplit(split.id, { ledgerId: ledger?.id ?? "", ledgerName: ledger?.name ?? "" })}
                            className="h-9 rounded-md"
                          />
                          <Input
                            ref={(node) => { if (node) paymentSplitAmountRefs.current.set(split.id, node); else paymentSplitAmountRefs.current.delete(split.id); }}
                            data-po-payment-amount={splitIndex}
                            money type="number" min="0" step="0.01"
                            value={split.amount}
                            onChange={(event) => updatePaymentSplit(split.id, { amount: event.target.value })}
                            placeholder="0.00"
                            className="h-9 text-right font-semibold"
                          />
                          <Input
                            ref={(node) => { if (node) paymentSplitReferenceRefs.current.set(split.id, node); else paymentSplitReferenceRefs.current.delete(split.id); }}
                            data-po-payment-reference={splitIndex}
                            value={split.reference}
                            onChange={(event) => updatePaymentSplit(split.id, { reference: event.target.value })}
                            disabled={!split.method}
                            placeholder={!split.method ? "Select method first" : "Reference (optional)"}
                            className="h-9"
                          />
                          <button type="button" disabled={paymentSplits.length === 1} onClick={() => removePaymentSplit(split.id)} className="inline-flex h-8 w-8 items-center justify-center text-[#d34b4b] disabled:opacity-30" aria-label="Remove advance payment method"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ))}
                      <div className="flex items-center justify-end gap-8 border-t border-[#d7e1ee] bg-[#f8fafc] px-3 py-2">
                        <span className="text-xs font-semibold uppercase text-[#718096]">Total Advance</span>
                        <span className="text-base font-bold text-emerald-700">{formatCurrency(paymentSplitTotal)}</span>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <div data-order-workflow-bottom="true" className="mt-2 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
                <section data-order-workflow-description="true" className="rounded-lg border border-[#dce5f0] bg-white p-3">
                  <div className="mb-3 text-sm font-semibold text-[#1d3a61]">Condition & Description</div>
                  <div className="grid content-start gap-2.5">{renderAttachmentControls(false)}</div>
                </section>

                <section data-order-workflow-summary="true" className={cn("grid content-start gap-4 rounded-lg border border-[#dce5f0] bg-[#f8fbff] p-4", isPageDocumentLayout ? "gap-2.5 p-3" : "")}>
                  <div className="text-sm font-semibold text-[#1d3a61]">Order Summary</div>
                  <div className="grid grid-cols-[1fr_90px_90px] items-center gap-3">
                    <span className="justify-self-end text-sm text-[#475569]">Discount</span>
                    <select data-po-discount-type tabIndex={200} className="h-10 rounded-[4px] border border-[#cfd9e8] bg-white px-2 text-sm text-[#475569]" {...form.register("discountType")}>
                      <option value="percent">(%)</option>
                      <option value="fixed">(Tk)</option>
                    </select>
                    <Input tabIndex={201} money type="number" min="0" step="0.01" className="h-10 rounded-[4px] border-[#cfd9e8] bg-white text-right" {...form.register("discount", { valueAsNumber: true })} />
                  </div>
                  <div className="grid grid-cols-[1fr_140px_40px] items-center gap-3">
                    <span className="justify-self-end text-sm text-[#475569]">TAX</span>
                    <div className="relative">
                      <select tabIndex={202} className="h-10 w-full appearance-none rounded-[4px] border border-[#cfd9e8] bg-white px-3 text-sm text-[#475569] outline-none">
                        <option>NONE</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#475569]" />
                    </div>
                    <div className="text-right font-medium tabular-nums text-[#1f2f46]">{formatAmount(0)}</div>
                  </div>
                  {classicSalesInvoiceMode || classicPurchaseMode ? (
                    <div className="grid grid-cols-[1fr_140px_40px] items-center gap-3">
                      <label className="flex items-center justify-end gap-2 text-sm text-[#475569]">
                        <input
                          tabIndex={203}
                          type="checkbox"
                          checked={Boolean(watchedRoundOff)}
                          onChange={(event) => form.setValue("roundOff", event.target.checked, { shouldDirty: true })}
                        />
                        Round Off
                      </label>
                      <div
                        className={cn(
                          "flex h-10 items-center justify-end rounded-[4px] border border-[#cfd9e8] px-3 text-sm tabular-nums",
                          roundOffEnabled ? "bg-white text-[#14233b]" : "bg-[#f6f8fb] text-[#94a3b8]",
                        )}
                        title={roundOffEnabled ? "Posted to the Round Off ledger" : "Turn on to round the total to the nearest taka"}
                      >
                        {roundOffEnabled && invoiceRoundOffAmount !== 0
                          ? `${invoiceRoundOffAmount > 0 ? "+" : "-"}${formatAmount(Math.abs(invoiceRoundOffAmount))}`
                          : formatAmount(0)}
                      </div>
                      <div />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-[1fr_190px] items-center gap-3">
                    <span className="justify-self-end text-lg font-semibold text-[#14233b]">Total Balance</span>
                    <Input tabIndex={-1} money value={invoiceNetTotal === 0 ? "" : invoiceNetTotal} readOnly className="h-11 rounded-[4px] border-[#8fa6c3] bg-[#f8fbff] text-right text-lg font-semibold" />
                  </div>
                  {!usesReceiptNoteLayout ? (
                    <>
                      <div className="grid grid-cols-[1fr_190px] items-center gap-3">
                        <span className="justify-self-end text-sm text-[#475569]">Paid Now</span>
                        <span className="text-right font-semibold text-emerald-700">{formatCurrency(Math.min(purchaseOrderPaymentType === "Credit" ? 0 : paymentSplitTotal, invoiceNetTotal))}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_190px] items-center gap-3 border-t border-[#dce5f0] pt-3">
                        <span className="justify-self-end text-sm font-semibold text-[#14233b]">Remaining Due</span>
                        <span className="text-right text-lg font-semibold text-amber-700">{formatCurrency(Math.max(0, invoiceNetTotal - (purchaseOrderPaymentType === "Credit" ? 0 : paymentSplitTotal)))}</span>
                      </div>
                    </>
                  ) : null}
                </section>
              </div>
            </div>

            <div
              data-order-workflow-footer="true"
              className={cn(
                "border-t border-[#d9e1ec] bg-white px-5 py-3",
                displayMode === "page" && usesOrderWorkflowLayout ? "mt-auto shrink-0" : "",
              )}
            >
              <div className="flex items-center justify-end gap-4">
                <Button variant="outline" type="button" className="border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={handleOpenSharePreview}>
                  <Share2 className="h-5 w-5" />
                  Share
                </Button>
                <Button type="submit" className="min-w-[120px] rounded-[4px] px-10" disabled={effectiveDifference !== 0}>
                  <CheckCircle2 className="h-5 w-5" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        </form>
        {displayMode === "page" && usesOrderWorkflowLayout ? renderSidePickerPanel() : null}
        </div>
      ) : isSaleOrderWorkflow ? (
        <div
          className={cn(
            "grid gap-4",
            displayMode === "page" && isSaleOrderWorkflow
              ? "min-h-0 flex-1 items-stretch xl:grid-cols-[minmax(0,1fr)_300px]"
              : "items-start",
          )}
        >
        <form
          className={cn("space-y-0", displayMode === "page" && isSaleOrderWorkflow ? "flex h-full min-h-0 flex-col" : "")}
          onSubmit={form.handleSubmit(() => handlePersist("posted"))}
          onKeyDown={handlePurchaseOrderKeyboardFlow}
          onBlurCapture={(event) => {
            if (event.target instanceof HTMLSelectElement) {
              delete event.target.dataset.poPickerOpened;
            }
          }}
        >
          <div
            className={cn(
              "overflow-hidden rounded-[8px] border border-[#d8e1ea] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
              displayMode === "page" && isSaleOrderWorkflow ? "flex h-full min-h-0 flex-col" : "",
            )}
          >
            <div className={cn("border-b border-[#e4ebf5] px-5 py-3.5", isPageDocumentLayout ? "shrink-0" : "")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-2xl font-semibold leading-8 text-[#14233b]">Sales Order</div>
                  <p className="mt-0.5 text-xs text-[#718198]">Enter order details, items, pricing and supporting information.</p>
                </div>
                {displayMode === "page" && pageCloseRoute ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#dc2626] shadow-sm transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#991b1b]"
                    onClick={handleClosePageEntry}
                    aria-label="Close Sales Order"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className={cn("space-y-4 px-5 py-3 text-sm", isPageDocumentLayout ? "min-h-0 flex-1 overflow-y-auto" : "")}>
              <section className="rounded-lg border border-[#dce5f0] bg-[#f8fbff] p-4">
                <div className="mb-3 text-sm font-semibold text-[#1d3a61]">Sales Order Information</div>
                <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-[160px_180px_minmax(240px,1fr)_150px_160px]">
                <div className="order-3">
                  <div className="grid gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">Customer Name *</span>
                    {renderPartyPickerField({
                      className: "h-10 rounded-md border-[#9fb4cf] bg-white text-sm",
                      placeholder: "Select customer",
                      disableSuggestions: displayMode === "page" && isSaleOrderWorkflow,
                      tabIndex: 2,
                      purchaseOrderFlow: isSaleOrderWorkflow,
                    })}
                  </div>
                  {displayMode === "page" && isSaleOrderWorkflow ? null : (
                    <button
                      type="button"
                      className="mt-2 text-sm font-medium text-[#0f6cf6]"
                      onClick={handleOpenPartyCreate}
                    >
                      + Add {partyRoleLabel}
                    </button>
                  )}
                </div>

                <label className="order-2 grid gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">Sales Order Number</span>
                    <Input tabIndex={-1} className="h-10 rounded-md border-[#cfd9e8] bg-white text-sm" placeholder="Auto-generated" {...form.register("reference")} />
                  </label>
                  <label className="order-1 grid gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">Sales Order Date</span>
                    <AppDateInput
                      tabIndex={1}
                      data-po-date="true"
                      aria-label="Sales Order Date"
                      value={form.watch("voucherDate")}
                      onChange={(value) => form.setValue("voucherDate", value, { shouldDirty: true, shouldValidate: true })}
                    />
                  </label>
                  <label className="order-5 grid min-w-0 gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">Due Date</span>
                    <AppDateInput tabIndex={-1} aria-label="Due Date" value={form.watch("voucherDate")} readOnly />
                  </label>
                  <label className="order-4 grid min-w-0 gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">Payment Type *</span>
                    <select
                      data-po-primary-payment-type="true"
                      tabIndex={3}
                      value={purchaseOrderPaymentType}
                      onChange={(event) => updatePurchaseOrderPaymentType(event.target.value as "Credit" | "Advance")}
                      className="h-10 rounded-md border border-[#cfd9e8] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#6b9ee8] focus:ring-2 focus:ring-[#dbeafe]"
                    >
                      <option value="Credit">Credit</option>
                      <option value="Advance">Cash/Bank/MFS</option>
                    </select>
                  </label>
                </div>
                {purchaseOrderPaymentType !== "Credit" ? (
                  <div ref={paymentBreakdownRef} className="mt-4 overflow-hidden rounded-md border border-[#d7e1ee] bg-white">
                    <div className="flex items-center justify-between border-b border-[#e5ebf3] bg-[#f8fafc] px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-[#243b63]">Advance Payment Breakdown</div>
                        <div className="text-[11px] text-[#718098]">Optional — split the advance across Cash, Bank, Card or MFS.</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {mode === "api" ? (
                          <button type="button" onClick={() => window.open("/app/reports/chart-of-accounts", "_blank", "noopener,noreferrer")} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#cbd5e1] bg-white px-3 text-xs font-semibold text-[#475569]">
                            <Plus className="h-3.5 w-3.5" /> Add Ledger
                          </button>
                        ) : null}
                        <button type="button" onClick={appendPaymentSplit} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#8ebcff] px-3 text-xs font-semibold text-[#0f6cf6]">
                          <Plus className="h-3.5 w-3.5" /> Add Method
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[104px_minmax(150px,1fr)_104px_minmax(140px,1fr)_32px] gap-2 border-b border-[#edf1f6] px-3 py-1.5 text-[11px] font-semibold uppercase text-[#718098]">
                      <div>Type</div><div>Account Ledger *</div><div className="text-right">Amount</div><div>Reference</div><div />
                    </div>
                    {paymentSplits.map((split, splitIndex) => (
                      <div key={split.id} className="grid grid-cols-[104px_minmax(150px,1fr)_104px_minmax(140px,1fr)_32px] items-center gap-2 border-b border-[#edf1f6] px-3 py-1.5 last:border-b-0">
                        <select
                          ref={(node) => {
                            if (node) paymentSplitMethodRefs.current.set(split.id, node);
                            else paymentSplitMethodRefs.current.delete(split.id);
                          }}
                          data-po-payment-method={splitIndex}
                          value={split.method}
                          onChange={(event) => {
                            const method = event.target.value as PaymentOutMethod | "";
                            updatePaymentSplit(split.id, { method, ledgerId: "", ledgerName: "", reference: method === "Cash" ? "" : split.reference });
                          }}
                          className="h-9 rounded-md border border-[#cfd9e8] bg-white px-2 text-sm"
                        >
                          <option value="">Select method</option>
                          {paymentOutMethodOptionsForVoucher.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <MoneyAccountSelector
                          selectRef={(node) => {
                            if (node) paymentSplitLedgerRefs.current.set(split.id, node);
                            else paymentSplitLedgerRefs.current.delete(split.id);
                          }}
                          purchaseOrderPaymentRow={splitIndex}
                          value={split.ledgerId}
                          enabled={mode === "api"}
                          disabled={!split.method}
                          required={mode === "api"}
                          allowedTypes={[...paymentMoneyAccountTypes(split.method)]}
                          onChange={(ledger) => updatePaymentSplit(split.id, { ledgerId: ledger?.id ?? "", ledgerName: ledger?.name ?? "" })}
                          className="h-9 rounded-md"
                        />
                        <Input
                          ref={(node) => {
                            if (node) paymentSplitAmountRefs.current.set(split.id, node);
                            else paymentSplitAmountRefs.current.delete(split.id);
                          }}
                          data-po-payment-amount={splitIndex}
                          money
                          type="number"
                          min="0"
                          step="0.01"
                          value={split.amount}
                          onChange={(event) => updatePaymentSplit(split.id, { amount: event.target.value })}
                          placeholder="0.00"
                          className="h-9 text-right font-semibold"
                        />
                        <Input
                          ref={(node) => {
                            if (node) paymentSplitReferenceRefs.current.set(split.id, node);
                            else paymentSplitReferenceRefs.current.delete(split.id);
                          }}
                          data-po-payment-reference={splitIndex}
                          value={split.reference}
                          onChange={(event) => updatePaymentSplit(split.id, { reference: event.target.value })}
                          disabled={!split.method}
                          placeholder={!split.method ? "Select method first" : "Reference (optional)"}
                          className="h-9"
                        />
                        <button type="button" disabled={paymentSplits.length === 1} onClick={() => removePaymentSplit(split.id)} className="inline-flex h-8 w-8 items-center justify-center text-[#d34b4b] disabled:opacity-30" aria-label="Remove advance payment method"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <div className="flex items-center justify-end gap-8 border-t border-[#d7e1ee] bg-[#f8fafc] px-3 py-2">
                      <span className="text-xs font-semibold uppercase text-[#718096]">Total Advance</span>
                      <span className="text-base font-bold text-emerald-700">{formatCurrency(paymentSplitTotal)}</span>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="overflow-hidden rounded-lg border border-[#d7e1ee] bg-white">
                <div className="flex items-center justify-between border-b border-[#d7e1ee] bg-[#f8fafc] px-3 py-2">
                  <span className="text-sm font-semibold text-[#1d3a61]">Items</span>
                  <span className="text-xs text-[#718198]">Add products, quantity, unit and unit price</span>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-0">
                <div
                  className={cn(
                    "grid border-b border-[#d7e1ee] bg-white text-xs font-semibold uppercase tracking-[0.05em] text-[#1d3a61]",
                    purchaseWorkflowItemGridColumns,
                  )}
                >
                  <div className="order-1 px-2 py-2.5 text-center">#</div>
                  <div className="order-2 border-l border-[#e7edf5] px-3 py-2.5">Item</div>
                  <div className="order-3 border-l border-[#e7edf5] px-3 py-2.5">Qty</div>
                  <div className="order-4 border-l border-[#e7edf5] px-3 py-2.5">Unit</div>
                  <div className="order-5 border-l border-[#e7edf5] px-3 py-2.5 text-right">Unit Price</div>
                  <div className="order-6 border-l border-[#e7edf5] px-3 py-2.5 text-right">Amount</div>
                  <div className="order-8 border-l border-[#e7edf5] px-3 py-3 text-center">
                    <button type="button" tabIndex={-1} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#0f6cf6] text-[#0f6cf6]" onClick={appendInvoiceItem}>
                      +
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-[#edf2f8]">
                  {invoiceItems.fields.map((field, index) => {
                    const quantity = Number(watchedInvoiceItems[index]?.quantity || 0);
                    const unitPrice = Number(watchedInvoiceItems[index]?.unitPrice || 0);
                    const lineTotal = quantity * unitPrice;
                    const rowTabIndex = 10 + index * 3;

                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "grid",
                          purchaseWorkflowItemGridColumns,
                        )}
                      >
                        <div className="order-1 px-2 py-3 text-center text-xs text-[#6f7d91]">{index + 1}</div>
                        <div className="order-2 border-l border-[#edf2f8] px-2 py-1.5">
                          {renderItemNameCell(index, "h-10 rounded-[4px] border-[#9fb1c8] bg-[#f8fbff] shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20", "Select or type item", rowTabIndex, index)}
                        </div>
                        <div className="order-3 border-l border-[#edf2f8] px-2 py-1.5">
                          <Input tabIndex={rowTabIndex + 1} className="h-10 rounded-[4px] border-[#9fb1c8] bg-[#f8fbff] text-right font-medium shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20" type="number" min="0" step="0.01" placeholder="0" {...form.register(`invoiceItems.${index}.quantity`, { valueAsNumber: true })} />
                        </div>
                        <div className="order-4 border-l border-[#edf2f8] px-3 py-3 text-xs font-medium text-[#1f2f46]">{findInventoryOption(watchedInvoiceItems[index]?.itemName || "")?.unit ?? "NONE"}</div>
                        <div className="order-5 border-l border-[#edf2f8] px-2 py-1.5">
                          <Input
                            tabIndex={rowTabIndex + 2}
                            data-po-unit-price={index}
                            money
                            className="h-10 rounded-[4px] border-[#879db9] bg-[#f8fbff] text-right font-semibold text-[#14233b] shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={unitPrice || ""}
                            onChange={(event) => form.setValue(`invoiceItems.${index}.unitPrice`, Number(event.target.value || 0), { shouldDirty: true, shouldTouch: true })}
                          />
                          {renderLastRateHint(index)}
                        </div>
                        <div className="order-6 border-l border-[#edf2f8] px-3 py-3 text-right text-sm font-medium tabular-nums text-[#1f2f46]">{formatCurrency(lineTotal)}</div>
                        <div className="order-8 border-l border-[#edf2f8] px-1 py-1.5">
                          <Button tabIndex={-1} type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-md" onClick={() => invoiceItems.remove(index)} disabled={invoiceItems.fields.length === 1}>
                            <MinusCircle className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  className={cn(
                    "grid border-t border-[#d7e1ee] bg-[#f8fafc] text-sm",
                    purchaseWorkflowItemGridColumns,
                  )}
                >
                  <div className="px-3 py-3" />
                  <div className="px-3 py-2">
                    <Button tabIndex={-1} type="button" variant="outline" className="rounded-[4px] border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={appendInvoiceItem}>
                      Add Row
                    </Button>
                  </div>
                  <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">Total</div>
                  <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">{formatNumber(invoiceQuantityTotal)}</div>
                  <div className="px-3 py-3" />
                  <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">{formatCurrency(invoiceNetTotal)}</div>
                  <div className="px-3 py-3" />
                </div>
                  </div>
                </div>
              </section>

              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
                <section className="rounded-lg border border-[#dce5f0] bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-[#1d3a61]">Notes & Attachments</div>
                  <div className="grid content-start gap-2.5">{renderAttachmentControls(!isPurchaseOrderWorkflow)}</div>
                </section>

                <section className="grid content-start gap-4 rounded-lg border border-[#dce5f0] bg-[#f8fbff] p-4">
                  <div className="text-sm font-semibold text-[#1d3a61]">Order Summary</div>
                  <div className="grid grid-cols-[1fr_90px_90px] items-center gap-3">
                    <span className="justify-self-end text-sm text-[#475569]">Discount</span>
                    <select data-po-discount-type tabIndex={200} className="h-10 rounded-[4px] border border-[#cfd9e8] bg-white px-2 text-sm text-[#475569]" {...form.register("discountType")}>
                      <option value="percent">(%)</option>
                      <option value="fixed">(Tk)</option>
                    </select>
                    <Input tabIndex={201} money type="number" min="0" step="0.01" className="h-10 rounded-[4px] border-[#cfd9e8] bg-white text-right" {...form.register("discount", { valueAsNumber: true })} />
                  </div>
                  <div className="grid grid-cols-[1fr_140px_40px] items-center gap-3">
                    <span className="justify-self-end text-sm text-[#475569]">TAX</span>
                    <div className="relative">
                      <select tabIndex={202} className="h-10 w-full appearance-none rounded-[4px] border border-[#cfd9e8] bg-white px-3 text-sm text-[#475569] outline-none">
                        <option>NONE</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#475569]" />
                    </div>
                    <div className="text-right font-medium tabular-nums text-[#1f2f46]">{formatAmount(0)}</div>
                  </div>
                  {classicSalesInvoiceMode || classicPurchaseMode ? (
                    <div className="grid grid-cols-[1fr_140px_40px] items-center gap-3">
                      <label className="flex items-center justify-end gap-2 text-sm text-[#475569]">
                        <input
                          tabIndex={203}
                          type="checkbox"
                          checked={Boolean(watchedRoundOff)}
                          onChange={(event) => form.setValue("roundOff", event.target.checked, { shouldDirty: true })}
                        />
                        Round Off
                      </label>
                      <div
                        className={cn(
                          "flex h-10 items-center justify-end rounded-[4px] border border-[#cfd9e8] px-3 text-sm tabular-nums",
                          roundOffEnabled ? "bg-white text-[#14233b]" : "bg-[#f6f8fb] text-[#94a3b8]",
                        )}
                        title={roundOffEnabled ? "Posted to the Round Off ledger" : "Turn on to round the total to the nearest taka"}
                      >
                        {roundOffEnabled && invoiceRoundOffAmount !== 0
                          ? `${invoiceRoundOffAmount > 0 ? "+" : "-"}${formatAmount(Math.abs(invoiceRoundOffAmount))}`
                          : formatAmount(0)}
                      </div>
                      <div />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-[1fr_190px] items-center gap-3">
                    <span className="justify-self-end text-lg font-semibold text-[#14233b]">Total Balance</span>
                    <Input tabIndex={-1} money value={invoiceNetTotal === 0 ? "" : invoiceNetTotal} readOnly className="h-11 rounded-[4px] border-[#8fa6c3] bg-[#f8fbff] text-right text-lg font-semibold" />
                  </div>
                  <div className="grid grid-cols-[1fr_190px] items-center gap-3">
                    <span className="justify-self-end text-sm text-[#475569]">Paid Now</span>
                    <span className="text-right font-semibold text-emerald-700">{formatCurrency(Math.min(purchaseOrderPaymentType === "Credit" ? 0 : paymentSplitTotal, invoiceNetTotal))}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_190px] items-center gap-3 border-t border-[#dce5f0] pt-3">
                    <span className="justify-self-end text-sm font-semibold text-[#14233b]">Remaining Due</span>
                    <span className="text-right text-lg font-semibold text-amber-700">{formatCurrency(Math.max(0, invoiceNetTotal - (purchaseOrderPaymentType === "Credit" ? 0 : paymentSplitTotal)))}</span>
                  </div>
                </section>
              </div>
            </div>

            <div
              className={cn(
                "border-t border-[#d9e1ec] bg-white px-5 py-3",
                displayMode === "page" && isSaleOrderWorkflow ? "mt-auto shrink-0" : "",
              )}
            >
              <div className="flex items-center justify-end gap-4">
                <Button variant="outline" type="button" className="border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={handleOpenSharePreview}>
                  <Share2 className="h-5 w-5" />
                  Share
                </Button>
                <Button type="submit" className="min-w-[120px] rounded-[4px] px-10" disabled={effectiveDifference !== 0}>
                  <CheckCircle2 className="h-5 w-5" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        </form>
        {displayMode === "page" && isSaleOrderWorkflow ? renderSidePickerPanel() : null}
        </div>
      ) : isDeliveryNoteWorkflow ? (
        <div
          className={cn(
            "grid gap-4",
            displayMode === "page" && isDeliveryNoteWorkflow
              ? "min-h-0 flex-1 items-stretch xl:grid-cols-[minmax(0,1fr)_300px]"
              : "items-start",
          )}
        >
        <form
          className={cn("space-y-0", displayMode === "page" && isDeliveryNoteWorkflow ? "flex h-full min-h-0 flex-col" : "")}
          onSubmit={form.handleSubmit(() => handlePersist("posted"))}
          onKeyDown={handlePurchaseOrderKeyboardFlow}
          onBlurCapture={(event) => {
            if (event.target instanceof HTMLSelectElement) {
              delete event.target.dataset.poPickerOpened;
            }
          }}
        >
          <div
            className={cn(
              "overflow-hidden rounded-[8px] border border-[#d8e1ea] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
              displayMode === "page" && isDeliveryNoteWorkflow ? "flex h-full min-h-0 flex-col" : "",
            )}
          >
            <div className={cn("border-b border-[#e4ebf5] px-5 py-3.5", isPageDocumentLayout ? "shrink-0" : "")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-2xl font-semibold leading-8 text-[#14233b]">Delivery Note</div>
                  <p className="mt-0.5 text-xs text-[#718198]">Enter delivery details, items, pricing and supporting information.</p>
                </div>
                {displayMode === "page" && pageCloseRoute ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#dc2626] shadow-sm transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#991b1b]"
                    onClick={handleClosePageEntry}
                    aria-label="Close Delivery Note"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className={cn("space-y-4 px-5 py-3 text-sm", isPageDocumentLayout ? "min-h-0 flex-1 overflow-y-auto" : "")}>
              <section className="rounded-lg border border-[#dce5f0] bg-[#f8fbff] p-4">
                <div className="mb-3 text-sm font-semibold text-[#1d3a61]">Delivery Note Information</div>
                <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-[160px_180px_minmax(220px,1fr)_160px]">
                <div className="order-3">
                  <div className="grid gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">Customer Name *</span>
                    {renderPartyPickerField({
                      className: "h-10 rounded-md border-[#9fb4cf] bg-white text-sm",
                      placeholder: "Select customer",
                      disableSuggestions: displayMode === "page" && isDeliveryNoteWorkflow,
                      tabIndex: 2,
                      purchaseOrderFlow: isDeliveryNoteWorkflow,
                    })}
                  </div>
                  {displayMode === "page" && isDeliveryNoteWorkflow ? null : (
                    <button
                      type="button"
                      className="mt-2 text-sm font-medium text-[#0f6cf6]"
                      onClick={handleOpenPartyCreate}
                    >
                      + Add {partyRoleLabel}
                    </button>
                  )}
                </div>

                <label className="order-2 grid gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">Delivery Note Number</span>
                    <Input tabIndex={-1} className="h-10 rounded-md border-[#cfd9e8] bg-white text-sm" placeholder="Auto-generated" {...form.register("reference")} />
                  </label>
                  <label className="order-1 grid gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">Delivery Date</span>
                    <AppDateInput
                      tabIndex={1}
                      data-po-date="true"
                      aria-label="Delivery Date"
                      value={form.watch("voucherDate")}
                      onChange={(value) => form.setValue("voucherDate", value, { shouldDirty: true, shouldValidate: true })}
                    />
                  </label>
                  <label className="order-4 grid min-w-0 gap-1.5">
                    <span className="text-xs font-semibold text-[#3b4b63]">Due Date</span>
                    <AppDateInput tabIndex={-1} aria-label="Due Date" value={form.watch("voucherDate")} readOnly />
                  </label>
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-[#d7e1ee] bg-white">
                <div className="flex items-center justify-between border-b border-[#d7e1ee] bg-[#f8fafc] px-3 py-2">
                  <span className="text-sm font-semibold text-[#1d3a61]">Items</span>
                  <span className="text-xs text-[#718198]">Choose a warehouse for each delivered product</span>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[700px]">
                <div className="grid grid-cols-[40px_minmax(140px,1fr)_70px_78px_104px_116px_minmax(120px,0.5fr)_38px] border-b border-[#d7e1ee] bg-white text-xs font-semibold uppercase tracking-[0.05em] text-[#1d3a61]">
                  <div className="order-1 px-2 py-2.5 text-center">#</div>
                  <div className="order-2 border-l border-[#e7edf5] px-3 py-2.5">Item</div>
                  <div className="order-3 border-l border-[#e7edf5] px-3 py-2.5">Qty</div>
                  <div className="order-4 border-l border-[#e7edf5] px-3 py-2.5">Unit</div>
                  <div className="order-5 border-l border-[#e7edf5] px-3 py-2.5 text-right">Unit Price</div>
                  <div className="order-6 border-l border-[#e7edf5] px-3 py-2.5 text-right">Amount</div>
                  <div className="order-7 border-l border-[#e7edf5] px-3 py-2.5">Warehouse *</div>
                  <div className="order-8 border-l border-[#e7edf5] px-3 py-3 text-center">
                    <button type="button" tabIndex={-1} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#0f6cf6] text-[#0f6cf6]" onClick={appendInvoiceItem}>
                      +
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-[#edf2f8]">
                  {invoiceItems.fields.map((field, index) => {
                    const quantity = Number(watchedInvoiceItems[index]?.quantity || 0);
                    const unitPrice = Number(watchedInvoiceItems[index]?.unitPrice || 0);
                    const lineTotal = quantity * unitPrice;
                    const rowTabIndex = 10 + index * 4;

                    return (
                      <div key={field.id} className="grid grid-cols-[40px_minmax(140px,1fr)_70px_78px_104px_116px_minmax(120px,0.5fr)_38px]">
                        <div className="order-1 px-2 py-3 text-center text-xs text-[#6f7d91]">{index + 1}</div>
                        <div className="order-2 border-l border-[#edf2f8] px-2 py-1.5">
                          {renderItemNameCell(index, "h-10 rounded-[4px] border-[#9fb1c8] bg-[#f8fbff] shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20", "Select or type item", rowTabIndex, index)}
                        </div>
                        <div className="order-3 border-l border-[#edf2f8] px-2 py-1.5">
                          <Input tabIndex={rowTabIndex + 1} className="h-10 rounded-[4px] border-[#9fb1c8] bg-[#f8fbff] text-right font-medium shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20" type="number" min="0" step="0.01" placeholder="0" {...form.register(`invoiceItems.${index}.quantity`, { valueAsNumber: true })} />
                        </div>
                        <div className="order-4 border-l border-[#edf2f8] px-3 py-3 text-xs font-medium text-[#1f2f46]">{findInventoryOption(watchedInvoiceItems[index]?.itemName || "")?.unit ?? "NONE"}</div>
                        <div className="order-5 border-l border-[#edf2f8] px-2 py-1.5">
                          <Input
                            tabIndex={rowTabIndex + 2}
                            data-po-unit-price={index}
                            money
                            className="h-10 rounded-[4px] border-[#879db9] bg-[#f8fbff] text-right font-semibold text-[#14233b] shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={unitPrice || ""}
                            onChange={(event) => form.setValue(`invoiceItems.${index}.unitPrice`, Number(event.target.value || 0), { shouldDirty: true, shouldTouch: true })}
                          />
                          {renderLastRateHint(index)}
                        </div>
                        <div className="order-6 border-l border-[#edf2f8] px-3 py-3 text-right text-sm font-medium tabular-nums text-[#1f2f46]">{formatCurrency(lineTotal)}</div>
                        <div className="order-7 border-l border-[#edf2f8] px-2 py-1.5">
                          {renderWarehousePickerField(index, rowTabIndex + 3, "delivery")}
                          {renderManufacturingSaleProvenance(index)}
                        </div>
                        <div className="order-8 border-l border-[#edf2f8] px-1 py-1.5">
                          <Button tabIndex={-1} type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-md" onClick={() => invoiceItems.remove(index)} disabled={invoiceItems.fields.length === 1}>
                            <MinusCircle className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-[40px_minmax(140px,1fr)_70px_78px_104px_116px_minmax(120px,0.5fr)_38px] border-t border-[#d7e1ee] bg-[#f8fafc] text-sm">
                  <div className="px-3 py-3" />
                  <div className="px-3 py-2">
                    <Button tabIndex={-1} type="button" variant="outline" className="rounded-[4px] border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={appendInvoiceItem}>
                      Add Row
                    </Button>
                  </div>
                  <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">Total</div>
                  <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">{formatNumber(invoiceQuantityTotal)}</div>
                  <div className="px-3 py-3" />
                  <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">{formatCurrency(invoiceNetTotal)}</div>
                  <div className="px-3 py-3" />
                </div>
                  </div>
                </div>
              </section>

              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
                <section className="rounded-lg border border-[#dce5f0] bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-[#1d3a61]">Notes & Attachments</div>
                  <div className="grid content-start gap-2.5">{renderAttachmentControls(!isPurchaseOrderWorkflow)}</div>
                </section>

                <section className="grid content-start gap-4 rounded-lg border border-[#dce5f0] bg-[#f8fbff] p-4">
                  <div className="text-sm font-semibold text-[#1d3a61]">Order Summary</div>
                  <div className="grid grid-cols-[1fr_90px_90px] items-center gap-3">
                    <span className="justify-self-end text-sm text-[#475569]">Discount</span>
                    <select data-po-discount-type tabIndex={200} className="h-10 rounded-[4px] border border-[#cfd9e8] bg-white px-2 text-sm text-[#475569]" {...form.register("discountType")}>
                      <option value="percent">(%)</option>
                      <option value="fixed">(Tk)</option>
                    </select>
                    <Input tabIndex={201} money type="number" min="0" step="0.01" className="h-10 rounded-[4px] border-[#cfd9e8] bg-white text-right" {...form.register("discount", { valueAsNumber: true })} />
                  </div>
                  <div className="grid grid-cols-[1fr_140px_40px] items-center gap-3">
                    <span className="justify-self-end text-sm text-[#475569]">TAX</span>
                    <div className="relative">
                      <select tabIndex={202} className="h-10 w-full appearance-none rounded-[4px] border border-[#cfd9e8] bg-white px-3 text-sm text-[#475569] outline-none">
                        <option>NONE</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#475569]" />
                    </div>
                    <div className="text-right font-medium tabular-nums text-[#1f2f46]">{formatAmount(0)}</div>
                  </div>
                  {classicSalesInvoiceMode || classicPurchaseMode ? (
                    <div className="grid grid-cols-[1fr_140px_40px] items-center gap-3">
                      <label className="flex items-center justify-end gap-2 text-sm text-[#475569]">
                        <input
                          tabIndex={203}
                          type="checkbox"
                          checked={Boolean(watchedRoundOff)}
                          onChange={(event) => form.setValue("roundOff", event.target.checked, { shouldDirty: true })}
                        />
                        Round Off
                      </label>
                      <div
                        className={cn(
                          "flex h-10 items-center justify-end rounded-[4px] border border-[#cfd9e8] px-3 text-sm tabular-nums",
                          roundOffEnabled ? "bg-white text-[#14233b]" : "bg-[#f6f8fb] text-[#94a3b8]",
                        )}
                        title={roundOffEnabled ? "Posted to the Round Off ledger" : "Turn on to round the total to the nearest taka"}
                      >
                        {roundOffEnabled && invoiceRoundOffAmount !== 0
                          ? `${invoiceRoundOffAmount > 0 ? "+" : "-"}${formatAmount(Math.abs(invoiceRoundOffAmount))}`
                          : formatAmount(0)}
                      </div>
                      <div />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-[1fr_190px] items-center gap-3">
                    <span className="justify-self-end text-lg font-semibold text-[#14233b]">Total Balance</span>
                    <Input tabIndex={-1} money value={invoiceNetTotal === 0 ? "" : invoiceNetTotal} readOnly className="h-11 rounded-[4px] border-[#8fa6c3] bg-[#f8fbff] text-right text-lg font-semibold" />
                  </div>
                </section>
              </div>
            </div>

            <div
              className={cn(
                "border-t border-[#d9e1ec] bg-white px-5 py-3",
                displayMode === "page" && isDeliveryNoteWorkflow ? "mt-auto shrink-0" : "",
              )}
            >
              <div className="flex items-center justify-end gap-4">
                <Button variant="outline" type="button" className="border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={handleOpenSharePreview}>
                  <Share2 className="h-5 w-5" />
                  Share
                </Button>
                <Button type="submit" className="min-w-[120px] rounded-[4px] px-10" disabled={effectiveDifference !== 0}>
                  <CheckCircle2 className="h-5 w-5" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        </form>
        {displayMode === "page" && isDeliveryNoteWorkflow ? renderSidePickerPanel() : null}
        </div>
      ) : classicExpenseMode ? (
        <div
          className={cn(
            "grid gap-4",
            isPageDocumentLayout ? "min-h-0 flex-1 items-stretch xl:grid-cols-[minmax(0,1fr)_300px]" : "items-start",
          )}
        >
        <form
          className={cn("space-y-0", displayMode === "page" ? "flex h-full min-h-0 flex-col" : "")}
          onSubmit={form.handleSubmit(() => handlePersist("posted"))}
          onKeyDown={handlePurchaseOrderKeyboardFlow}
        >
          <div
            className={cn(
              "overflow-hidden rounded-[8px] border border-[#d8e1ea] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
              displayMode === "page" ? "flex h-full min-h-0 flex-col" : "",
            )}
          >
            <div className={cn("border-b border-[#e4ebf5] px-6 py-5", isPageDocumentLayout ? "shrink-0" : "")}>
              <div className="flex items-start justify-between gap-4">
                <div className="text-[2rem] font-semibold text-[#14233b]">Expense</div>
                {displayMode === "page" && pageCloseRoute ? (
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#dc2626] shadow-sm transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#991b1b]"
                    onClick={handleClosePageEntry}
                    aria-label="Close Expense"
                    title="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className={cn("space-y-8 px-6 py-6", isPageDocumentLayout ? "min-h-0 flex-1 overflow-y-auto" : "")}>
              <div className={cn("grid gap-6", classicDebitNoteMode ? "grid-cols-1" : "xl:grid-cols-[220px_minmax(0,1fr)_280px]")}>
                <label className="grid content-start gap-1.5">
                  <span className="text-sm font-medium text-[#0f6cf6]">Date</span>
                  <AppDateInput aria-label="Voucher Date" value={form.watch("voucherDate")} onChange={(value) => form.setValue("voucherDate", value, { shouldDirty: true })} />
                </label>

                <div>
                  <label className="relative grid gap-1.5">
                    <span className="text-sm font-medium text-[#0f6cf6]">Expense Ledger*</span>
                    {renderPartyPickerField({
                      className: "h-11 rounded-[4px] border-[#0f6cf6]",
                      placeholder: expenseLedgersQuery.isLoading ? "Loading expense ledgers..." : "Select expense ledger",
                      disableSuggestions: true,
                    })}
                  </label>
                </div>

                <div className="grid content-start gap-4">
                  <label className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
                    <span className="text-sm text-[#6f7d91]">Expense No</span>
                    <Input className="h-10 rounded-none border-0 border-b border-[#cfd9e8] bg-white px-0 text-right shadow-none focus-visible:ring-0" placeholder="Expense no" {...form.register("reference")} />
                  </label>
                </div>
              </div>

              {expenseLedgerRequiresItems ? (
                <div className="overflow-hidden rounded-[2px] border border-[#d7e1ee] bg-white">
                  <div className="grid grid-cols-[44px_minmax(0,1fr)_104px_140px_140px] border-b border-[#d7e1ee] bg-white text-xs font-semibold uppercase tracking-[0.08em] text-[#1d3a61]">
                    <div className="px-3 py-3 text-center">#</div>
                    <div className="border-l border-[#e7edf5] px-3 py-3">Item</div>
                    <div className="border-l border-[#e7edf5] px-3 py-3">Qty</div>
                    <div className="border-l border-[#e7edf5] px-3 py-3 text-right">Price/Unit</div>
                    <div className="border-l border-[#e7edf5] px-3 py-3 text-right">Amount</div>
                  </div>

                  <div className="divide-y divide-[#edf2f8]">
                    {invoiceItems.fields.map((field, index) => {
                      const quantity = Number(watchedInvoiceItems[index]?.quantity || 0);
                      const unitPrice = Number(watchedInvoiceItems[index]?.unitPrice || 0);
                      const lineTotal = quantity * unitPrice;

                      return (
                        <div key={field.id} className="grid grid-cols-[44px_minmax(0,1fr)_104px_140px_140px]">
                          <div className="px-3 py-4 text-center text-[#6f7d91]">{index + 1}</div>
                          <div className="border-l border-[#edf2f8] px-2 py-1.5">
                            {renderItemNameCell(index, "h-10 rounded-[4px] border-[#9fb1c8] bg-[#f8fbff] shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20", "Select or type item", undefined, index)}
                          </div>
                          <div className="border-l border-[#edf2f8] px-2 py-1.5">
                            <Input
                              className="h-10 rounded-[4px] border-[#9fb1c8] bg-[#f8fbff] text-right font-medium shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0"
                              value={quantity === 0 ? "" : String(quantity)}
                              onChange={(event) => form.setValue(`invoiceItems.${index}.quantity`, Number(event.target.value || 0), { shouldDirty: true, shouldTouch: true })}
                            />
                          </div>
                          <div className="border-l border-[#edf2f8] px-2 py-1.5">
                            <Input
                              data-po-unit-price={index}
                              money
                              className="h-10 rounded-[4px] border-[#879db9] bg-[#f8fbff] text-right font-semibold text-[#14233b] shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={unitPrice === 0 ? "" : unitPrice}
                              onChange={(event) => form.setValue(`invoiceItems.${index}.unitPrice`, Number(event.target.value || 0), { shouldDirty: true, shouldTouch: true })}
                            />
                          </div>
                          <div className="border-l border-[#edf2f8] px-3 py-4 text-right font-medium tabular-nums text-[#1f2f46]">{formatCurrency(lineTotal)}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-[44px_minmax(0,1fr)_104px_140px_140px] border-t border-[#d7e1ee] bg-white">
                    <div className="px-3 py-3" />
                    <div className="px-3 py-2">
                      <Button type="button" variant="outline" className="rounded-[4px] border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={appendExpenseInvoiceItem}>
                        Add Row
                      </Button>
                    </div>
                    <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">Total</div>
                    <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">{formatNumber(invoiceQuantityTotal)}</div>
                    <div className="px-3 py-3 text-right font-semibold text-[#1d3a61]">{formatCurrency(invoiceNetTotal)}</div>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[2px] border border-[#d7e1ee] bg-white">
                  <div className="grid grid-cols-[minmax(0,1fr)_200px] border-b border-[#d7e1ee] bg-white text-xs font-semibold uppercase tracking-[0.08em] text-[#1d3a61]">
                    <div className="px-3 py-3">Description</div>
                    <div className="border-l border-[#e7edf5] px-3 py-3 text-right">Amount</div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_200px]">
                    <div className="border-l border-transparent px-2 py-1.5">
                      <Input
                        className="h-10 rounded-[4px] border-transparent shadow-none"
                        placeholder="Description (optional)"
                        value={watchedInvoiceItems[0]?.itemName ?? ""}
                        onChange={(event) => form.setValue("invoiceItems.0.itemName", event.target.value, { shouldDirty: true, shouldTouch: true })}
                      />
                    </div>
                    <div className="border-l border-[#edf2f8] px-2 py-1.5">
                      <Input
                        money
                        className="h-10 rounded-[4px] border-transparent text-right shadow-none"
                        type="number"
                        min="0"
                        step="0.01"
                        value={Number(watchedInvoiceItems[0]?.unitPrice || 0) === 0 ? "" : String(watchedInvoiceItems[0]?.unitPrice)}
                        onChange={(event) => {
                          form.setValue("invoiceItems.0.quantity", 1, { shouldDirty: true, shouldTouch: true });
                          form.setValue("invoiceItems.0.unitPrice", Number(event.target.value || 0), { shouldDirty: true, shouldTouch: true });
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div
                className={cn(
                  "grid gap-8",
                  purchaseOrderPaymentType === "Credit" ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1",
                )}
              >
                <div className="grid content-start gap-4">
                  <div className="w-full max-w-[240px]">
                    <label className="grid gap-1.5">
                      <span className="text-sm text-[#7c8a9b]">Payment Type</span>
                      <div className="relative">
                        <select
                          className="h-10 w-full appearance-none rounded-[4px] border border-[#cfd9e8] bg-white px-3 text-sm text-[#1f2f46] outline-none"
                          value={purchaseOrderPaymentType}
                          onChange={(event) => {
                            const next = event.target.value as "Credit" | "Advance";
                            setPurchaseOrderPaymentType(next);
                            form.setValue("settlementMode", next === "Credit" ? "accounts-payable" : "cash", { shouldDirty: true, shouldTouch: true });
                          }}
                        >
                          <option value="Credit">Credit</option>
                          <option value="Advance">Cash/Bank/MFS</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7c8a9b]" />
                      </div>
                    </label>
                  </div>

                  {purchaseOrderPaymentType === "Credit" ? (
                    <div className="grid w-full max-w-[560px] grid-cols-2 gap-3">
                      <label className="grid gap-1.5">
                        <span className="text-sm text-[#7c8a9b]">Credit Ledger</span>
                        <SearchableLedgerCombobox
                          value={watchedExpenseCreditLedger}
                          options={expensePayableLedgerAccounts.map((ledger) => ({ id: ledger.id, name: ledger.name, path: ledger.path }))}
                          placeholder={expenseLedgersQuery.isLoading ? "Loading payable ledgers..." : "Search payable ledger"}
                          onChange={(ledgerName) => form.setValue("expenseCreditLedger", ledgerName, { shouldDirty: true, shouldTouch: true })}
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-sm text-[#7c8a9b]">Payable To</span>
                        <Input
                          className="h-10 rounded-[4px] border-[#cfd9e8] bg-white text-sm"
                          placeholder="Who is this owed to? (e.g. City Transport)"
                          {...form.register("expensePayableTo")}
                        />
                      </label>
                      <p className="col-span-2 text-xs text-[#8994a6]">
                        Credit posts to the selected ledger; Payable To is saved as the payee note.
                      </p>
                    </div>
                  ) : null}

                  {purchaseOrderPaymentType !== "Credit"
                    ? renderSplitPaymentBreakdown("Expense Payment Breakdown", "Total Payment")
                    : null}

                  {renderAttachmentControls(!isPurchaseOrderWorkflow)}
                </div>

                <div className="grid w-full max-w-[360px] content-start justify-self-end gap-6">
                  <div className="grid grid-cols-[1fr_140px_40px] items-center gap-3">
                    <span className="justify-self-end text-sm text-[#475569]">Tax</span>
                    <div className="relative">
                      <select className="h-10 w-full appearance-none rounded-[4px] border border-[#cfd9e8] bg-white px-3 text-sm text-[#64748b] outline-none">
                        <option>NONE</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7c8a9b]" />
                    </div>
                    <div className="text-right font-medium tabular-nums text-[#1f2f46]">{formatAmount(0)}</div>
                  </div>

                  <div className="grid grid-cols-[1fr_190px] items-center gap-3">
                    <span className="justify-self-end text-[1.4rem] font-semibold text-[#14233b]">Total</span>
                    <Input money value={invoiceNetTotal === 0 ? "" : invoiceNetTotal} readOnly className="h-11 rounded-[4px] border-[#8fa6c3] bg-[#f8fbff] text-right text-lg font-semibold" />
                  </div>
                </div>
              </div>
            </div>

            <div className={cn("border-t border-[#d9e1ec] bg-white px-6 py-5", displayMode === "page" ? "mt-auto shrink-0" : "")}>
              <div className="flex items-center justify-end gap-4">
                <Button variant="outline" type="button" className="border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={handleOpenSharePreview}>
                  <Share2 className="h-5 w-5" />
                  Share
                </Button>
                <Button type="submit" className="min-w-[120px] rounded-[4px] px-10" disabled={effectiveDifference !== 0}>
                  <CheckCircle2 className="h-5 w-5" />
                  {editingVoucherId ? "Save" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </form>
        {isPageDocumentLayout ? renderSidePickerPanel() : null}
        </div>
      ) : classicRevenueMode ? (
        <div
          data-revenue-voucher-page={isPageDocumentLayout ? "true" : undefined}
          className={cn(
            "grid gap-4",
            isPageDocumentLayout ? "min-h-0 flex-1 items-stretch xl:grid-cols-[minmax(0,1fr)_300px]" : "items-start",
          )}
        >
        <form
          className={cn("space-y-0", displayMode === "page" ? "flex h-full min-h-0 flex-col" : "")}
          onSubmit={form.handleSubmit(() => handlePersist("posted"))}
          onKeyDown={handlePurchaseOrderKeyboardFlow}
        >
          <div
            className={cn(
              "overflow-hidden rounded-[8px] border border-[#d8e1ea] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
              displayMode === "page" ? "flex h-full min-h-0 flex-col" : "",
            )}
          >
            <div data-revenue-voucher-header="true" className={cn("border-b border-[#e4ebf5] px-6 py-5", isPageDocumentLayout ? "shrink-0" : "")}>
              <div className="flex items-start justify-between gap-4">
                <div className="text-[2rem] font-semibold text-[#14233b]">Revenue Voucher</div>
                {displayMode === "page" && pageCloseRoute ? (
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#dc2626] shadow-sm transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#991b1b]"
                    onClick={handleClosePageEntry}
                    aria-label="Close Revenue Voucher"
                    title="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
            </div>

            <div data-revenue-voucher-body="true" className={cn("space-y-8 px-6 py-6", isPageDocumentLayout ? "min-h-0 flex-1 overflow-y-auto" : "")}>
              <div data-revenue-voucher-info="true" className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
                <label className="grid content-start gap-1.5">
                  <span className="text-sm font-medium text-[#0f6cf6]">Date</span>
                  <AppDateInput aria-label="Voucher Date" value={form.watch("voucherDate")} onChange={(value) => form.setValue("voucherDate", value, { shouldDirty: true })} />
                </label>

                <div>
                  <label className="relative grid gap-1.5">
                    <span className="text-sm font-medium text-[#0f6cf6]">Revenue Ledger*</span>
                    {renderRevenueLedgerField({ className: "h-11 rounded-[4px] border-[#0f6cf6]" })}
                  </label>
                </div>

                <div className="grid content-start gap-4">
                  <label className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
                    <span className="text-sm text-[#6f7d91]">Reference</span>
                    <Input
                      className="h-10 rounded-none border-0 border-b border-[#cfd9e8] bg-white px-0 text-right shadow-none focus-visible:ring-0"
                      placeholder="Reference"
                      {...form.register("reference")}
                    />
                  </label>
                </div>
              </div>

              <div data-revenue-voucher-line="true" className="overflow-hidden rounded-[2px] border border-[#d7e1ee] bg-white">
                <div className="grid grid-cols-[minmax(0,1fr)_200px] border-b border-[#d7e1ee] bg-white text-xs font-semibold uppercase tracking-[0.08em] text-[#1d3a61]">
                  <div className="px-3 py-3">Description</div>
                  <div className="border-l border-[#e7edf5] px-3 py-3 text-right">Amount</div>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_200px]">
                  <div className="border-l border-transparent px-2 py-1.5">
                    <Input
                      className="h-10 rounded-[4px] border-transparent shadow-none"
                      placeholder="Description (optional)"
                      value={watchedInvoiceItems[0]?.itemName ?? ""}
                      onChange={(event) => form.setValue("invoiceItems.0.itemName", event.target.value, { shouldDirty: true, shouldTouch: true })}
                    />
                  </div>
                  <div className="border-l border-[#edf2f8] px-2 py-1.5">
                    <Input
                      money
                      className="h-10 rounded-[4px] border-[#8fa6c3] bg-[#f8fbff] text-right font-semibold text-[#14233b] shadow-[inset_0_0_0_1px_rgba(143,166,195,0.08)] transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20"
                      type="number"
                      min="0"
                      step="0.01"
                      value={Number(watchedInvoiceItems[0]?.unitPrice || 0) === 0 ? "" : String(watchedInvoiceItems[0]?.unitPrice)}
                      onChange={(event) => {
                        form.setValue("invoiceItems.0.quantity", 1, { shouldDirty: true, shouldTouch: true });
                        form.setValue("invoiceItems.0.unitPrice", Number(event.target.value || 0), { shouldDirty: true, shouldTouch: true });
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                data-revenue-voucher-bottom="true"
                className={cn(
                  "grid gap-8",
                  purchaseOrderPaymentType === "Credit" ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1",
                )}
              >
                <div data-revenue-voucher-fields="true" className="grid content-start gap-4">
                  <div className="w-full max-w-[240px]">
                    <label className="grid gap-1.5">
                      <span className="text-sm text-[#7c8a9b]">Received Type</span>
                      <div className="relative">
                        <select
                          className="h-10 w-full appearance-none rounded-[4px] border border-[#cfd9e8] bg-white px-3 text-sm text-[#1f2f46] outline-none"
                          value={purchaseOrderPaymentType}
                          onChange={(event) => {
                            const next = event.target.value as "Credit" | "Advance";
                            setPurchaseOrderPaymentType(next);
                            form.setValue("settlementMode", next === "Credit" ? "accounts-payable" : "cash", {
                              shouldDirty: true,
                              shouldTouch: true,
                            });
                          }}
                        >
                          <option value="Credit">Credit</option>
                          <option value="Advance">Cash/Bank/MFS</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7c8a9b]" />
                      </div>
                    </label>
                  </div>

                  {purchaseOrderPaymentType === "Credit" ? (
                    <div className="grid w-full max-w-[560px] grid-cols-1 gap-3">
                      <label className="grid gap-1.5">
                        <span className="text-sm text-[#7c8a9b]">Received From / To Be Received From (Debtor)*</span>
                        {renderRevenueDebtorField({
                          className: "h-11 rounded-[4px] border-[#cfd9e8]",
                          placeholder: "Search or select a debtor ledger",
                        })}
                      </label>
                    </div>
                  ) : null}

                  {purchaseOrderPaymentType !== "Credit"
                    ? renderSplitPaymentBreakdown(
                        "Revenue Received Breakdown",
                        "Total Received",
                        "Received Method",
                        "Split the received amount across Cash, Bank, Card, Cheque or MFS.",
                      )
                    : null}

                  <div data-revenue-voucher-attachments="true" className="grid gap-2.5">
                    {renderAttachmentControls(!isPurchaseOrderWorkflow)}
                  </div>
                </div>

                <div data-revenue-voucher-totals="true" className="grid w-full max-w-[360px] content-start justify-self-end gap-6">
                  <div className="grid grid-cols-[1fr_140px_40px] items-center gap-3">
                    <span className="justify-self-end text-sm text-[#475569]">Tax</span>
                    <div className="relative">
                      <select className="h-10 w-full appearance-none rounded-[4px] border border-[#cfd9e8] bg-white px-3 text-sm text-[#64748b] outline-none">
                        <option>NONE</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7c8a9b]" />
                    </div>
                    <div className="text-right font-medium tabular-nums text-[#1f2f46]">{formatAmount(0)}</div>
                  </div>

                  <div className="grid grid-cols-[1fr_190px] items-center gap-3">
                    <span className="justify-self-end text-[1.4rem] font-semibold text-[#14233b]">Total</span>
                    <Input money value={invoiceNetTotal === 0 ? "" : invoiceNetTotal} readOnly className="h-11 rounded-[4px] border-[#8fa6c3] bg-[#f8fbff] text-right text-lg font-semibold text-[#14233b] shadow-[inset_0_0_0_1px_rgba(143,166,195,0.08)]" />
                  </div>
                </div>
              </div>
            </div>

            <div data-revenue-voucher-footer="true" className={cn("border-t border-[#d9e1ec] bg-white px-6 py-5", displayMode === "page" ? "mt-auto shrink-0" : "")}>
              <div className="flex items-center justify-end gap-4">
                <Button variant="outline" type="button" className="border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={handleOpenSharePreview}>
                  <Share2 className="h-5 w-5" />
                  Share
                </Button>
                <Button type="submit" className="min-w-[120px] rounded-[4px] px-10" disabled={effectiveDifference !== 0}>
                  <CheckCircle2 className="h-5 w-5" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        </form>
        {isPageDocumentLayout ? renderSidePickerPanel() : null}
        </div>
      ) : classicPurchaseStyleMode ? (
        <div
          data-classic-voucher-page={isPageDocumentLayout ? "true" : undefined}
          data-classic-voucher-kind={classicDebitNoteMode ? (isSalesReturnMode ? "sales-return" : "purchase-return") : undefined}
          className={cn(
            "grid gap-4",
            isPageDocumentLayout ? "min-h-0 flex-1 items-stretch xl:grid-cols-[minmax(0,1fr)_300px]" : "items-start",
          )}
        >
        <form
          className={cn(
            displayMode === "dialog" && classicDebitNoteMode ? "h-full" : "space-y-5",
            displayMode === "page" ? "flex h-full min-h-0 flex-col" : "",
          )}
          onSubmit={form.handleSubmit(() => handlePersist("posted"))}
          onKeyDownCapture={handlePurchaseBillKeyboardFlow}
        >
          <div
            className={cn(
              "rounded-[10px] border border-[#d8e1ea] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]",
              displayMode === "page" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "",
            )}
          >
            <div data-classic-voucher-header="true" className={cn("border-b border-[#e4ebf5] px-6 py-5", isPageDocumentLayout ? "shrink-0 py-3.5" : "")}>
              <div className="flex items-start justify-between gap-4">
                <div className={cn("text-[2rem] font-semibold text-[#14233b]", isPageDocumentLayout ? "text-2xl leading-8" : "")}>{classicDebitNoteMode ? isSalesReturnMode ? "Sales Return" : "Purchase Return" : classicSalesInvoiceMode ? "Sales" : "Purchase"}</div>
                {displayMode === "page" && pageCloseRoute ? (
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#dc2626] shadow-sm transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#991b1b]"
                    onClick={handleClosePageEntry}
                    aria-label={`Close ${classicDebitNoteMode ? isSalesReturnMode ? "Sales Return" : "Purchase Return" : classicSalesInvoiceMode ? "Sales" : "Purchase"}`}
                    title="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
            </div>

            <div data-classic-voucher-body="true" className={cn("space-y-8 px-6 py-6", isPageDocumentLayout ? "flex min-h-0 flex-1 flex-col gap-3 space-y-0 overflow-y-auto py-2.5" : "")}>
              <div data-classic-voucher-info="true" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div
                  className={cn(
                    "grid content-start gap-4",
                    isPageDocumentLayout ? "gap-3" : "",
                    classicDebitNoteMode
                      ? "md:grid-cols-6 xl:grid-cols-12"
                      : "md:grid-cols-[190px_230px_minmax(0,1fr)] xl:grid-cols-2 min-[1560px]:grid-cols-[190px_230px_minmax(0,1fr)]",
                  )}
                >
                  {classicDebitNoteMode ? (
                    <label className="order-1 grid content-start gap-1.5 md:col-span-2 xl:col-span-3">
                      <span className="text-sm font-medium text-[#0f6cf6]">Date</span>
                      <AppDateInput data-purchase-return-date="true" tabIndex={1} aria-label="Voucher Date" value={form.watch("voucherDate")} onChange={(value) => form.setValue("voucherDate", value, { shouldDirty: true })} />
                    </label>
                  ) : null}
                  {!classicDebitNoteMode ? (
                    <label className="grid content-start gap-1.5">
                      <span className="text-sm font-medium text-[#0f6cf6]">Bill Date</span>
                      <AppDateInput
                        tabIndex={1}
                        aria-label="Bill Date"
                        data-purchase-bill-date={classicPurchaseMode || classicSalesInvoiceMode ? "true" : undefined}
                        value={form.watch("voucherDate")}
                        onChange={(value) => form.setValue("voucherDate", value, { shouldDirty: true })}
                      />
                    </label>
                  ) : null}
                  <div className={cn("grid content-start gap-1.5", classicDebitNoteMode ? "order-2 md:col-span-4 xl:col-span-6" : "")}>
                    <div className="grid content-start gap-1.5">
                      <span className="text-sm font-medium text-[#0f6cf6]">{partyRoleLabel} *</span>
                      {renderPartyPickerField({
                        className: "h-11 rounded-[6px] border-[#cfd9e8]",
                        placeholder: isReceivableVoucher ? "Select customer" : "Select supplier",
                        tabIndex: classicPurchaseMode || classicDebitNoteMode || classicSalesInvoiceMode ? 2 : undefined,
                        // On the full page the Quick Picker on the right is the list, so no
                        // dropdown here; the dialog has no side panel and keeps its own.
                        disableSuggestions: isPageDocumentLayout,
                      })}
                    </div>
                    <button
                      type="button"
                      tabIndex={classicPurchaseMode || classicDebitNoteMode || classicSalesInvoiceMode ? -1 : undefined}
                      className="w-fit text-sm font-medium text-[#0f6cf6]"
                      onClick={handleOpenPartyCreate}
                    >
                      + Add {partyRoleLabel}
                    </button>
                  </div>

                  {!classicDebitNoteMode ? (
                    <label className="grid content-start gap-1.5">
                      <span className="text-sm font-medium text-[#7c8a9b]">Phone No.</span>
                      <Input tabIndex={classicPurchaseMode || classicSalesInvoiceMode ? -1 : undefined} value={matchedParty?.contact ?? ""} readOnly className="h-11 rounded-[6px] border-[#cfd9e8] bg-[#fbfcfe]" />
                    </label>
                  ) : null}

                  {!classicDebitNoteMode ? (
                    <div className="grid content-start gap-1.5">
                      <span className="text-sm font-medium text-[#7c8a9b]">{partyRoleLabel} Balance</span>
                      <div className="h-11 rounded-[6px] border border-[#cfd9e8] bg-[#fbfcfe] px-3 py-3 text-right text-[15px] font-semibold text-[#1f2f46]">
                        {matchedParty ? formattedPartyBalance : formatCurrency(0)}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={cn("grid content-start gap-4", classicDebitNoteMode ? "hidden" : "")}>
                  {classicDebitNoteMode ? (
                    null
                  ) : (
                    <>
                      <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
                        <span className="text-sm text-[#6f7d91]">
                          {requiresReceiptNoteSource || requiresDeliveryNoteSource || classicDebitNoteMode ? "Reference *" : "Reference"}
                        </span>
                        {renderBillReferencePicker()}
                      </div>
                      <label className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
                        <span className="text-sm text-[#6f7d91]">Bill Number</span>
                        <Input tabIndex={-1} className="h-10 rounded-[6px] border-[#cfd9e8] bg-white text-right" placeholder="Bill no" {...form.register("reference")} />
                      </label>
                    </>
                  )}
                </div>
              </div>

              {classicDebitNoteMode ? (
                <div data-classic-voucher-source="true" className="grid gap-3 rounded-[8px] border border-[#d7e1ee] bg-[#fbfdff] p-3 md:grid-cols-[minmax(180px,1fr)_minmax(140px,220px)_minmax(140px,220px)]">
                  <div className="grid content-start gap-1.5">
                    <span className="text-sm font-medium text-[#334155]">{isSalesReturnMode ? "Sales Invoice" : "Bill Number"}</span>
                    {renderBillReferencePicker("field")}
                  </div>
                  <label className="grid content-start gap-1.5">
                    <span className="text-sm text-[#6f7d91]">Return No.</span>
                    <Input data-purchase-return-next-field="true" tabIndex={5} className="h-11 rounded-[6px] border-[#cfd9e8] bg-white" {...form.register("reference")} />
                  </label>
                  <label className="grid content-start gap-1.5">
                    <span className="text-sm text-[#6f7d91]">{isSalesReturnMode ? "Invoice Date" : "Bill Date"}</span>
                    <Input
                      data-purchase-return-bill-date="true"
                      tabIndex={6}
                      value={sourceDocumentReference && loadedVoucher ? formatDate(loadedVoucher.voucherDate) : ""}
                      readOnly
                      placeholder="DD/MM/YYYY"
                      className="h-11 rounded-[6px] border-[#cfd9e8] bg-white"
                    />
                  </label>
                </div>
              ) : null}

              <div
                data-classic-voucher-items="true"
                className={cn(
                  "overflow-hidden rounded-[8px] border border-[#d7e1ee] bg-white",
                  isPageDocumentLayout ? "flex min-h-[200px] flex-1 flex-col" : "",
                )}
              >
                <div className={cn("overflow-x-auto", isPageDocumentLayout ? "min-h-0 flex-1 overflow-y-auto" : "")}>
                  <div className="min-w-[760px]">
                    <div className={cn("grid border-b border-[#d7e1ee] bg-[#fbfdff] text-xs font-semibold uppercase tracking-[0.08em] text-[#1d3a61]", classicPurchaseItemGridColumns)}>
                      <div className="px-3 py-2">#</div>
                      <div className="border-l border-[#e7edf5] px-3 py-2">Item</div>
                      <div className="border-l border-[#e7edf5] px-3 py-2">Qty</div>
                      <div className="border-l border-[#e7edf5] px-3 py-2">Unit</div>
                      <div className="border-l border-[#e7edf5] px-3 py-2 text-right">Price/Unit</div>
                      <div className="border-l border-[#e7edf5] px-3 py-2 text-right">Amount</div>
                      {classicDebitNoteMode || classicSalesInvoiceMode || voucherType === "purchase" ? <div className="border-l border-[#e7edf5] px-3 py-2">Warehouse *</div> : null}
                      <div className="border-l border-[#e7edf5] px-3 py-2 text-center">
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#0f6cf6] text-[#0f6cf6]"
                          onClick={appendInvoiceItem}
                          aria-label="Add row"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-[#edf2f8]">
                      {invoiceItems.fields.map((field, index) => {
                        const lineTotal = Number(watchedInvoiceItems[index]?.quantity || 0) * Number(watchedInvoiceItems[index]?.unitPrice || 0);
                        return (
                          <div key={field.id} className={cn("grid", classicPurchaseItemGridColumns)}>
                            <div className="px-3 py-3 text-[#6f7d91]">{index + 1}</div>
                            <div className="border-l border-[#edf2f8] px-1.5 py-1.5">
                              {renderItemNameCell(index, "h-10 rounded-[6px] border-[#9fb1c8] bg-[#f8fbff] shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20", "Select or type stock item", classicDebitNoteMode ? 7 + index * 4 : 4 + index * 3)}
                            </div>

                            <div className="border-l border-[#edf2f8] px-1.5 py-1.5">
                              {classicDebitNoteMode ? (
                                <Input
                                  data-item-quantity-row={index}
                                  data-purchase-bill-quantity={index}
                                  tabIndex={8 + index * 4}
                                  className="h-10 rounded-[6px] border-[#9fb1c8] bg-[#f8fbff] text-right font-medium shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder=""
                                  value={watchedInvoiceItems[index]?.itemName ? Number(watchedInvoiceItems[index]?.quantity || 0) || "" : ""}
                                  onChange={(event) => form.setValue(`invoiceItems.${index}.quantity`, Number(event.target.value || 0), { shouldDirty: true, shouldTouch: true })}
                                />
                              ) : (
                                <Input data-item-quantity-row={index} data-purchase-bill-quantity={index} tabIndex={5 + index * 3} className="h-10 rounded-[6px] border-[#9fb1c8] bg-[#f8fbff] text-right font-medium shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20" type="number" min="0" step="any" placeholder="0" {...form.register(`invoiceItems.${index}.quantity`, { valueAsNumber: true })} />
                              )}
                            </div>
                            <div className="border-l border-[#edf2f8] px-1.5 py-1.5">
                              {classicDebitNoteMode ? (
                                <div
                                  data-purchase-return-unit={index}
                                  tabIndex={-1}
                                  className="flex h-10 items-center justify-center rounded-[6px] border border-[#d6dfeb] bg-[#f4f7fb] px-2 text-center text-sm font-medium text-[#52657e] outline-none focus:border-[#2583ea] focus:ring-2 focus:ring-[#2583ea]/20"
                                >
                                  {watchedInvoiceItems[index]?.unit || findInventoryOption(watchedInvoiceItems[index]?.itemName || "")?.unit || ""}
                                </div>
                              ) : (
                                <div className="px-1.5 py-2.5 text-sm text-[#1f2f46]">{findInventoryOption(watchedInvoiceItems[index]?.itemName || "")?.unit ?? "NONE"}</div>
                              )}
                            </div>
                            <div className="border-l border-[#edf2f8] px-1.5 py-1.5">
                              <Input
                                money
                                data-purchase-bill-unit-price={index}
                                tabIndex={(classicDebitNoteMode ? 9 + index * 4 : 6 + index * 3)}
                                className="h-10 rounded-[6px] border-[#879db9] bg-[#f8fbff] text-right font-semibold text-[#14233b] shadow-sm transition focus-visible:border-[#2583ea] focus-visible:ring-2 focus-visible:ring-[#2583ea]/20"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={Number(watchedInvoiceItems[index]?.unitPrice || 0) || ""}
                                onChange={(event) => form.setValue(`invoiceItems.${index}.unitPrice`, Number(event.target.value || 0), { shouldDirty: true, shouldTouch: true })}
                              />
                            </div>
                            <div className="border-l border-[#edf2f8] px-3 py-3 text-right font-medium tabular-nums">{lineTotal ? formatCurrency(lineTotal) : formatCurrency(0)}</div>
                            {classicDebitNoteMode ? (
                              <div className="border-l border-[#edf2f8] px-2 py-1.5">
                                {renderWarehousePickerField(index, 10 + index * 4, "purchase-return")}
                                {isSalesReturnMode ? renderManufacturingSaleProvenance(index) : null}
                              </div>
                            ) : classicSalesInvoiceMode ? (
                              <div className="border-l border-[#edf2f8] px-2 py-1.5">
                                {renderWarehousePickerField(index, undefined, "sales-invoice")}
                                {renderManufacturingSaleProvenance(index)}
                              </div>
                            ) : voucherType === "purchase" ? (
                              <div className="border-l border-[#edf2f8] px-2 py-1.5">
                                {renderWarehousePickerField(index)}
                              </div>
                            ) : null}
                            <div className="border-l border-[#edf2f8] px-1 py-1.5">
                              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-md" onClick={() => invoiceItems.remove(index)} disabled={invoiceItems.fields.length === 1}>
                                <MinusCircle className="h-5 w-5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className={cn("grid border-t border-[#d7e1ee] bg-[#fbfdff]", classicPurchaseItemGridColumns)}>
                      <div className="px-3 py-2" />
                      <div className="px-3 py-2">
                        <Button type="button" variant="outline" className="rounded-md border-[#8ebcff] text-[#0f6cf6]" onClick={appendInvoiceItem}>
                          <Plus className="h-5 w-5" />
                          Add Row
                        </Button>
                      </div>
                      {classicDebitNoteMode ? (
                        <>
                          <div className="px-3 py-2 text-right font-medium text-[#1d3a61]">Total</div>
                          <div className="px-3 py-2 text-right font-medium text-[#1d3a61]">{formatNumber(invoiceQuantityTotal)}</div>
                          <div className="px-3 py-2" />
                          <div className="px-3 py-2" />
                          <div className="px-3 py-2 text-right font-semibold tabular-nums text-[#14233b]">{formatCurrency(invoiceNetTotal)}</div>
                          <div className="px-3 py-2" />
                        </>
                      ) : (
                        <>
                          <div className="px-3 py-2 text-right font-medium text-[#1d3a61]">Total</div>
                          <div className="px-3 py-2 text-right font-medium text-[#1d3a61]">{formatNumber(invoiceQuantityTotal)}</div>
                          <div className="px-3 py-2" />
                          <div className="px-3 py-2 text-right font-semibold tabular-nums text-[#14233b]">{formatCurrency(invoiceNetTotal)}</div>
                          {classicSalesInvoiceMode || voucherType === "purchase" ? <div className="px-3 py-2" /> : null}
                          <div className="px-3 py-2" />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Only the split-payment breakdown still needs a full-width band. The
                * Payment Type select itself sits above the attachment buttons below. */}
              {classicDebitNoteMode && purchaseOrderPaymentType !== "Credit" ? (
                <section className="space-y-3 rounded-[8px] border border-[#d7e1ee] bg-[#fbfdff] p-3">
                  {renderSplitPaymentBreakdown("Refund Payment Breakdown", "Total Refund")}
                </section>
              ) : null}

              {classicDebitNoteMode && purchaseOrderPaymentType === "Credit" ? (
                <div data-classic-voucher-adjustment="true" className="flex justify-end">
                  <label className="grid w-full max-w-[360px] gap-1.5 rounded-[8px] border border-[#d7e1ee] bg-[#fbfdff] p-3">
                    <span className="text-sm font-medium text-[#334155]">{isSalesReturnMode ? "Invoice Adjustment" : "Credit Amount"}</span>
                    <Input
                      data-purchase-return-credit-amount="true"
                      money
                      type="number"
                      min="0"
                      step="0.01"
                      value={purchaseReturnCreditAmount}
                      onChange={(event) => setPurchaseReturnCreditAmount(event.target.value)}
                      className="h-11 rounded-[6px] border-[#8fa6c3] bg-white text-right text-base font-semibold text-[#14233b]"
                      placeholder="0.00"
                    />
                    <span className="text-xs text-[#6f7d91]">Must match the {isSalesReturnMode ? "sales" : "purchase"} return total before saving.</span>
                  </label>
                </div>
              ) : null}

              <div data-classic-voucher-bottom="true" className={cn("grid gap-4", classicPurchaseMode || classicSalesInvoiceMode ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "xl:grid-cols-[minmax(0,1fr)_220px_360px]")}>
                <div className={cn("space-y-4", classicPurchaseMode || classicSalesInvoiceMode ? "flex h-full flex-col gap-3 space-y-0" : "")}>
                  {classicPurchaseMode || classicSalesInvoiceMode ? (
                    <div className="space-y-3">
                      <label className="grid max-w-[300px] grid-cols-[88px_180px] items-center gap-3">
                        <span className="text-sm font-medium text-[#334155]">Payment Type</span>
                        <select
                          data-purchase-bill-payment-type="true"
                          className="h-9 w-[180px] rounded-md border border-[#d7e1ee] bg-white px-3 text-sm text-foreground"
                          value={classicPurchaseMode ? purchaseOrderPaymentType : watchedSettlementMode === "accounts-payable" ? "accounts-payable" : "cash-bank-mfs"}
                          onChange={(event) => classicPurchaseMode
                            ? updatePurchaseOrderPaymentType(event.target.value as "Credit" | "Advance")
                            : updateMoneySettlement(event.target.value === "accounts-payable" ? "accounts-payable" : "cash")}
                        >
                          {classicPurchaseMode ? (
                            <><option value="Credit">Credit</option><option value="Advance">Cash/Bank/MFS</option></>
                          ) : (
                            <><option value="accounts-payable">Credit</option><option value="cash-bank-mfs">Cash/Bank/MFS</option></>
                          )}
                        </select>
                      </label>
                      {classicPurchaseMode
                        ? purchaseOrderPaymentType !== "Credit" ? renderSplitPaymentBreakdown("Payment Breakdown", "Total Paid Now") : null
                        : watchedSettlementMode !== "accounts-payable" ? renderSplitPaymentBreakdown("Collection Breakdown", "Total Received Now", "Type", "Split the collection across Cash, Bank, Card, Cheque or MFS.") : null}
                    </div>
                  ) : null}
                  {classicDebitNoteMode ? (
                    <label className="grid max-w-[260px] content-start gap-1.5">
                      <span className="text-sm font-medium text-[#334155]">{isSalesReturnMode ? "Adjustment Type" : "Payment Type"}</span>
                      <div className="relative">
                        <select
                          data-purchase-return-payment-type="true"
                          tabIndex={0}
                          className="h-10 w-full appearance-none rounded-md border border-[#d7e1ee] bg-white px-3 pr-9 text-sm text-foreground outline-none focus:border-[#2583ea] focus:ring-2 focus:ring-[#2583ea]/20"
                          value={purchaseOrderPaymentType}
                          onChange={(event) => {
                            const next = event.target.value as "Credit" | "Advance";
                            updatePurchaseOrderPaymentType(next);
                            form.setValue("settlementMode", next === "Credit" ? "accounts-payable" : "cash", { shouldDirty: true, shouldTouch: true });
                          }}
                        >
                          <option value="Credit">Credit</option>
                          <option value="Advance">Cash/Bank/MFS</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52657e]" />
                      </div>
                    </label>
                  ) : null}
                  {classicPurchaseMode || classicSalesInvoiceMode ? (
                    <div className="mt-auto space-y-3">
                      {renderAttachmentControls(false)}
                    </div>
                  ) : (
                    renderAttachmentControls(!(classicDebitNoteMode || isPurchaseOrderWorkflow))
                  )}
                </div>

                {!classicPurchaseMode && !classicSalesInvoiceMode ? <div className="space-y-4">
                  {classicDebitNoteMode ? null : (
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium text-[#334155]">Payment Type</span>
                      <select
                        data-purchase-bill-payment-type={classicPurchaseMode || classicSalesInvoiceMode ? "true" : undefined}
                        className="h-10 rounded-md border border-[#d7e1ee] bg-white px-3 text-sm text-foreground"
                        value={classicPurchaseMode ? purchaseOrderPaymentType : watchedSettlementMode === "bank" ? (watchedPurchaseSettlementLedger === "Mobile Financial Service Accounts" ? "mfs" : "bank") : watchedSettlementMode}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (classicPurchaseMode) updatePurchaseOrderPaymentType(next as "Credit" | "Advance");
                          else updateMoneySettlement(next as "cash" | "bank" | "mfs" | "accounts-payable");
                        }}
                      >
                        {classicPurchaseMode ? (
                          <>
                            <option value="Credit">Credit</option>
                            <option value="Advance">Cash/Bank/MFS</option>
                          </>
                        ) : (
                          <>
                            <option value="cash">Cash</option>
                            {classicSalesInvoiceMode ? null : <><option value="bank">Bank</option><option value="mfs">MFS</option></>}
                            <option value="accounts-payable">Credit</option>
                          </>
                        )}
                      </select>
                    </label>
                  )}
                  {classicDebitNoteMode || classicPurchaseMode ? null : renderMoneyAccountSelector()}
                </div> : null}

                <div className={cn("space-y-4 rounded-[12px] border border-[#d7e1ee] bg-[#fbfdff] p-4", isPageDocumentLayout ? "space-y-2.5 p-2" : "")}>
                  <div className={cn("grid gap-3", isPageDocumentLayout ? "gap-1.5" : "")}>
                    <div className="grid grid-cols-[1fr_90px_90px] items-center gap-2">
                      <span className="text-sm text-[#475569]">Discount</span>
                      <select className="h-10 rounded-md border border-[#d7e1ee] bg-white px-2 text-sm text-[#475569]" {...form.register("discountType")}>
                        <option value="percent">(%)</option>
                        <option value="fixed">(Tk)</option>
                      </select>
                      <Input money type="number" min="0" step="0.01" className="h-10 rounded-md border-[#d7e1ee] bg-white text-right" {...form.register("discount", { valueAsNumber: true })} />
                    </div>
                    <div className="grid grid-cols-[1fr_130px_50px] items-center gap-2">
                      <span className="text-sm text-[#475569]">Tax</span>
                      <div className="flex h-10 items-center rounded-md border border-[#d7e1ee] bg-white px-3 text-sm text-[#475569]">NONE</div>
                      <div className="text-right font-medium tabular-nums">{formatAmount(0)}</div>
                    </div>
                    {classicSalesInvoiceMode || classicPurchaseMode ? (
                    <div className="grid grid-cols-[1fr_130px_50px] items-center gap-2">
                      <label className="flex items-center gap-2 text-sm text-[#475569]">
                        <input
                          type="checkbox"
                          checked={Boolean(watchedRoundOff)}
                          onChange={(event) => form.setValue("roundOff", event.target.checked, { shouldDirty: true })}
                        />
                        Round Off
                      </label>
                      <div
                        className={cn(
                          "flex h-10 items-center justify-end rounded-md border border-[#d7e1ee] px-3 text-sm tabular-nums",
                          roundOffEnabled ? "bg-white text-[#14233b]" : "bg-[#f6f8fb] text-[#94a3b8]",
                        )}
                        title={roundOffEnabled ? "Posted to the Round Off ledger" : "Turn on to round the total to the nearest taka"}
                      >
                        {roundOffEnabled && invoiceRoundOffAmount !== 0
                          ? `${invoiceRoundOffAmount > 0 ? "+" : "-"}${formatAmount(Math.abs(invoiceRoundOffAmount))}`
                          : formatAmount(0)}
                      </div>
                      <div />
                    </div>
                    ) : null}
                    <div className="grid grid-cols-[1fr_1fr] items-center gap-3">
                      <span className="text-right text-lg font-semibold text-[#14233b]">Total</span>
                      <Input money value={invoiceNetTotal} readOnly className="h-11 rounded-md border-[#8fa6c3] bg-[#f8fbff] text-right text-lg font-semibold text-[#14233b]" />
                    </div>
                    {classicPurchaseMode ? (
                      <>
                        <div className="grid grid-cols-[1fr_1fr] items-center gap-3">
                          <span className="text-right text-sm text-[#475569]">Previous Advance</span>
                          <span className="text-right font-semibold text-blue-700">{formatCurrency(Math.min(previousPurchaseAdvanceAmount, invoiceNetTotal))}</span>
                        </div>
                        <div className="grid grid-cols-[1fr_1fr] items-center gap-3">
                          <span className="text-right text-sm text-[#475569]">Paid Now</span>
                          <span className="text-right font-semibold text-emerald-700">{formatCurrency(Math.min(Number(paymentAmount || 0), Math.max(0, invoiceNetTotal - previousPurchaseAdvanceAmount)))}</span>
                        </div>
                        <div className="grid grid-cols-[1fr_1fr] items-center gap-3 border-t border-[#dce5f0] pt-3">
                          <span className="text-right text-sm font-semibold text-[#14233b]">Due</span>
                          <span className="text-right text-lg font-semibold text-amber-700">{formatCurrency(Math.max(0, invoiceNetTotal - previousPurchaseAdvanceAmount - Number(paymentAmount || 0)))}</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div data-classic-voucher-footer="true" className={cn("border-t border-[#d9e1ec] bg-white px-6 py-4", isPageDocumentLayout ? "py-3" : "", displayMode === "page" ? "mt-auto shrink-0" : "")}>
              <div className="flex items-center justify-end gap-3">
                {mode === "api" && editingVoucherId && loadedVoucher?.status === "posted" ? (
                  <Button
                    variant="outline"
                    type="button"
                    disabled={reversing}
                    className="rounded-md border-amber-500/40 px-5 text-amber-600 hover:bg-amber-50"
                    onClick={() => setReverseDialogOpen(true)}
                  >
                    <Undo2 className="h-5 w-5" />
                    Reverse
                  </Button>
                ) : null}
                <Button variant="outline" type="button" className="rounded-md border-[#8ebcff] px-5 text-[#0f6cf6]" onClick={handleOpenSharePreview}>
                  <Share2 className="h-5 w-5" />
                  Share
                </Button>
                <Button type="submit" className="rounded-md px-10" disabled={effectiveDifference !== 0}>
                  <CheckCircle2 className="h-5 w-5" />
                  {editingVoucherId ? "Update" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </form>
        {isPageDocumentLayout ? renderSidePickerPanel() : null}
        </div>
      ) : (
      <form
        className={cn(
          "grid h-full min-h-0 flex-1 items-stretch gap-3",
          isAdjustmentPosting
            ? "xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_380px]"
            : "2xl:grid-cols-[minmax(0,1fr)_320px]",
        )}
        onSubmit={form.handleSubmit(() => handlePersist("posted"))}
      >
        <Card
          className={cn(
            "flex min-h-0 h-full flex-col self-stretch overflow-hidden",
            isAdjustmentPosting ? "border-[#d4dfec] bg-[#fbfdff] shadow-[0_10px_30px_rgba(35,57,85,0.07)] 2xl:h-auto 2xl:self-start" : "",
          )}
        >
          <CardHeader
            className={cn(
              simpleInvoiceMode ? "border-b border-[#edf2f7] px-5 py-3" : "flex-row items-start justify-between gap-4",
              isAdjustmentPosting ? "border-b border-[#e1e9f2] bg-[#f8fbff] px-4 py-3 2xl:px-5 2xl:py-4" : "",
            )}
          >
            {!simpleInvoiceMode ? (
              <div className="min-w-0">
                <CardTitle className={cn("leading-tight text-[#17263c]", isAdjustmentPosting ? "text-[24px] 2xl:text-[28px]" : "text-[28px]")}>
                  {documentTitle}
                </CardTitle>
                {headerDescription && !isAdjustmentPosting ? <CardDescription className="mt-1">{headerDescription}</CardDescription> : null}
              </div>
            ) : null}
            <div className="ml-auto flex w-full flex-col items-end gap-3 sm:w-auto">
              {!simpleInvoiceMode && !isAdjustmentPosting ? (
                <Badge tone={difference === 0 ? "green" : "amber"}>
                  Difference {formatCurrency(Math.abs(difference))}
                </Badge>
              ) : null}
              <div className="flex items-center gap-3">
                {!isAdjustmentPosting ? <div className="flex items-center gap-2">
                  <div
                    role="group"
                    aria-label="Accounting entry view"
                    className="relative grid h-9 w-[220px] grid-cols-2 rounded-full border border-[#b9d2f5] bg-[#edf4ff] p-1 shadow-[inset_0_1px_2px_rgba(37,99,235,0.08)]"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute bottom-1 left-0 top-1 w-[calc(50%-4px)] rounded-full bg-[#2563eb] shadow-[0_3px_10px_rgba(37,99,235,0.28)] transition-transform duration-200 ease-out",
                        advancedMode ? "translate-x-[calc(100%+4px)]" : "translate-x-1",
                      )}
                    />
                    <button
                      type="button"
                      className={cn("relative z-10 rounded-full px-3 text-xs font-semibold transition-colors", !advancedMode ? "text-white" : "text-[#456284] hover:text-[#1d4f91]")}
                      aria-pressed={!advancedMode}
                      onClick={() => {
                        if (!advancedMode) return;
                        setEntryMode("simple");
                        toast.success("Simple entry view enabled");
                      }}
                    >
                      Simple
                    </button>
                    <button
                      type="button"
                      className={cn("relative z-10 rounded-full px-3 text-xs font-semibold transition-colors", advancedMode ? "text-white" : "text-[#456284] hover:text-[#1d4f91]")}
                      aria-pressed={advancedMode}
                      onClick={() => {
                        if (advancedMode) return;
                        setEntryMode("double-entry");
                        toast.success("Debit and credit view enabled");
                      }}
                    >
                      Debit / Credit
                    </button>
                  </div>
                  <kbd className="rounded-md border border-[#c9daf3] bg-[#f5f9ff] px-2 py-1 text-[10px] font-semibold text-[#35649c] shadow-sm">Alt + D</kbd>
                </div> : null}
                {displayMode === "page" && pageCloseRoute ? (
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#dc2626] shadow-sm transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#991b1b]"
                    onClick={handleClosePageEntry}
                    aria-label={`Close ${documentTitle}`}
                    title="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent
            className={cn(
              "flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden",
              simpleInvoiceMode ? "px-5 py-4" : "",
              isAdjustmentPosting ? "2xl:flex-none" : "",
            )}
          >
            <div
              className={cn(
                "grid gap-3",
                simpleInvoiceMode
                  ? "md:grid-cols-[190px_minmax(0,1fr)_260px]"
                  : isAdjustmentPosting
                    ? "md:grid-cols-2"
                    : "md:grid-cols-2 xl:grid-cols-3",
              )}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">Voucher date</label>
                <AppDateInput aria-label="Voucher Date" value={form.watch("voucherDate")} onChange={(value) => form.setValue("voucherDate", value, { shouldDirty: true })} />
              </div>
              {!isAdjustmentPosting ? <div className="space-y-2">
                <label className="text-sm font-medium">Party / Particulars</label>
                {renderPartyPickerField({ placeholder: `${partyRoleLabel} search or select` })}
                {matchedParty ? (
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition hover:text-[#cf670f]" onClick={handleOpenPartyEditor}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit saved {partyRoleLabel.toLowerCase()}
                  </button>
                ) : null}
              </div> : null}
              <div className="space-y-2">
                <label className="text-sm font-medium">Reference</label>
                <Input placeholder={isAdjustmentPosting ? "Adjustment reference" : "Customer PO or ref."} {...form.register("reference")} />
              </div>
            </div>
            {guidanceText && !simpleInvoiceMode ? (
              <div
                className={cn(
                  "rounded-xl border px-4 py-2.5 text-sm",
                  isAdjustmentPosting
                    ? "flex items-center gap-2 border-[#c9dced] bg-[#f1f7fd] text-[#315b82]"
                    : "border-[#d8eadf] bg-[#f1fbf4] text-primary",
                )}
              >
                {isAdjustmentPosting ? <Info className="h-4 w-4 shrink-0 text-[#3973a8]" /> : null}
                <span>{guidanceText}</span>
              </div>
            ) : null}
            {simpleInvoiceMode ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-[#d8e1ea] bg-white">
                  <div className="hidden">
                    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-2xl font-semibold text-[#17263c]">{documentTitle}</div>
                        <div className="mt-1 max-w-xl text-sm text-[#61708a]">
                          Enter customer, items, settlement, and discount in one operational entry screen.
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <div className="rounded-full border border-[#d5dfed] bg-white px-3 py-1.5 text-xs font-semibold text-[#43536d]">
                            {partyRoleLabel} entry
                          </div>
                          <div className="rounded-full border border-[#d5dfed] bg-white px-3 py-1.5 text-xs font-semibold text-[#43536d]">
                            {invoiceItemCount} item{invoiceItemCount === 1 ? "" : "s"}
                          </div>
                          <div className="rounded-full border border-[#d5dfed] bg-white px-3 py-1.5 text-xs font-semibold text-[#43536d]">
                            Qty {formatNumber(invoiceQuantityTotal)}
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:min-w-[250px]">
                        <div className="rounded-xl border border-[#d8e1ea] bg-white px-4 py-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6a7b95]">Invoice Number</div>
                          <Input
                            className="mt-2 h-10 border-[#d8e1ea] bg-white/90 font-semibold text-[#0f2c64] placeholder:text-[#6b7d9d]"
                            placeholder="INV-12345-1"
                            {...form.register("reference")}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-[#d8e1ea] bg-white px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6a7b95]">Date</div>
                            <div className="mt-1 text-sm font-semibold text-[#17315c]">{formatDate(form.watch("voucherDate"))}</div>
                          </div>
                          <div className="rounded-xl border border-[#d8e1ea] bg-white px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6a7b95]">Amount</div>
                            <div className="mt-1 text-sm font-semibold text-[#17315c]">{formatCurrency(invoiceNetTotal)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col space-y-4 px-4 py-4">
                    <div className="hidden">
                      <div className="rounded-[26px] border border-[#dce3eb] bg-[#fbfcfe] p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-primary">
                            <UserRound className="h-5 w-5" />
                            Bill To
                          </div>
                          {matchedParty ? (
                            <Button type="button" variant="outline" className="rounded-xl" onClick={handleOpenPartyEditor}>
                              <Pencil className="h-5 w-5" />
                              Edit {partyRoleLabel}
                            </Button>
                          ) : null}
                        </div>
                        <div className="mt-4 grid gap-3">
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{partyRoleLabel} / Party Name</label>
                            <div className="mt-2">{renderPartyPickerField({ className: "h-11 border-[#d8e1ea] bg-white", placeholder: `${partyRoleLabel} name` })}</div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Phone / Contact</label>
                              <Input
                                className="mt-2 h-11 border-[#d8e1ea] bg-white"
                                value={matchedParty?.contact ?? ""}
                                readOnly
                                placeholder={`${partyRoleLabel} phone`}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Credit Limit</label>
                              <Input
                                className="mt-2 h-11 border-[#d8e1ea] bg-white"
                                value={matchedParty ? formatCurrency(matchedParty.creditLimit) : ""}
                                readOnly
                                placeholder="Credit limit"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Address</label>
                            <Input className="mt-2 h-11 border-[#d8e1ea] bg-white" placeholder={`${partyRoleLabel} address`} {...form.register("supplierAddress")} />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[26px] border border-[#dce3eb] bg-white p-5">
                        <div className="grid gap-5">
                          <div className="min-w-0 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-[#44556f]">
                              <FileStack className="h-4 w-4 text-primary" />
                              Document Details
                            </div>
                            <div className="max-w-[260px] break-words text-2xl font-semibold leading-tight text-[#17263c]">{companyProfile.companyName || appConfig.companyName}</div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="min-w-0 rounded-2xl border border-[#d8e1ea] bg-[#fbfcff] px-4 py-3">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#60779a]">
                                <CalendarDays className="h-3.5 w-3.5" />
                                Bill Date
                              </div>
                              <AppDateInput className="mt-2" aria-label="Bill Date" value={form.watch("voucherDate")} onChange={(value) => form.setValue("voucherDate", value, { shouldDirty: true })} />
                            </div>
                            <div className="min-w-0 rounded-2xl border border-[#f0c9a4] bg-[#fff7ef] px-4 py-3">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#60779a]">
                                <CreditCard className="h-3.5 w-3.5" />
                                Settlement
                              </div>
                              <select
                                className="mt-2 h-11 w-full rounded-xl border border-[#f0c9a4] bg-white px-3 text-sm font-semibold text-primary"
                                value={watchedSettlementMode === "bank" ? (watchedPurchaseSettlementLedger === "Mobile Financial Service Accounts" ? "mfs" : "bank") : watchedSettlementMode}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  if (next === "bank" || next === "mfs") {
                                    form.setValue("settlementMode", "bank", { shouldDirty: true, shouldTouch: true });
                                    form.setValue("purchaseSettlementLedger", next === "mfs" ? "Mobile Financial Service Accounts" : "Bank Accounts", { shouldDirty: true, shouldTouch: true });
                                  } else {
                                    form.setValue("settlementMode", next as "cash" | "accounts-payable", { shouldDirty: true, shouldTouch: true });
                                  }
                                }}
                              >
                                <option value="cash">{cashFlowLabel}</option>
                                {classicSalesInvoiceMode ? null : (
                                  <>
                                    <option value="bank">Bank</option>
                                    <option value="mfs">MFS</option>
                                  </>
                                )}
                                <option value="accounts-payable">{accountRoleLabel}</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[#e7edf6] bg-[#fbfcfe] px-4 py-3">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#70819d]">Posting Target</div>
                              <div className="mt-1 text-sm font-semibold text-[#17263c]">
                                {settlementPostingTarget}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-[#e7edf6] bg-[#fbfcfe] px-4 py-3">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#70819d]">Status</div>
                              <div className="mt-1 text-sm font-semibold text-[#17263c]">
                                {editingVoucherId ? "Editing existing voucher" : "Ready for new entry"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 rounded-[10px] border border-[#d8e1ea] bg-[#f8fbff] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-[#17315c]">
                            <Package2 className="h-5 w-5" />
                            Invoice Items
                          </div>
                          <div className="mt-0.5 text-xs text-muted">Add products or item lines for this invoice.</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#52627b] shadow-[inset_0_0_0_1px_rgba(216,225,234,0.9)]">
                            {invoiceItemCount} rows
                          </div>
                          <Button type="button" variant="outline" onClick={appendInvoiceItem} className="sm:self-start">
                            <Plus className="h-5 w-5" />
                            Add Item
                          </Button>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-[10px] border border-[#d8e1ea]">
                        <div ref={tableScrollRef} className="transient-scrollbar overflow-x-auto">
                          <table className="data-table min-w-[920px] bg-white text-sm xl:min-w-full">
                            <thead className="bg-[#f7f9fd] text-[#61708a]">
                              <tr>
                                <th className="text-left">Description</th>
                                <th className="text-left">Qty</th>
                                <th className="text-left">Price</th>
                                <th className="text-left">Total</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {invoiceItems.fields.map((field, index) => {
                                const lineTotal = Number(watchedInvoiceItems[index]?.quantity || 0) * Number(watchedInvoiceItems[index]?.unitPrice || 0);
                                const matchedInventoryItem = findInventoryOption(watchedInvoiceItems[index]?.itemName || "");
                                return (
                                  <tr key={field.id}>
                                    <td>
                                      {renderItemNameCell(index, "h-10 border-[#d8e1ea] bg-white", "Type stock item name")}
                                      {matchedInventoryItem ? (
                                        <div className="mt-1 text-xs text-muted">
                                          Last purchase: {formatCurrency(matchedInventoryItem.rate)} / {matchedInventoryItem.unit}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td>
                                      <Input className="h-10 border-[#d8e1ea] bg-white" type="number" min="0" step="0.01" {...form.register(`invoiceItems.${index}.quantity`, { valueAsNumber: true })} />
                                    </td>
                                    <td>
                                      <Input money className="h-10 border-[#d8e1ea] bg-white" type="number" min="0" step="0.01" {...form.register(`invoiceItems.${index}.unitPrice`, { valueAsNumber: true })} />
                                    </td>
                                    <td className="tabular-nums font-semibold text-[#17263c]">{formatCurrency(lineTotal)}</td>
                                    <td>
                                      <Button type="button" variant="ghost" onClick={() => invoiceItems.remove(index)} disabled={invoiceItems.fields.length === 1}>
                                        <MinusCircle className="h-5 w-5" />
                                        Remove
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="grid min-h-0 flex-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                      <div className="flex min-h-0 flex-col gap-4">
                        <div className="flex min-h-0 flex-1 flex-col rounded-[10px] border border-[#dce3eb] bg-white p-4">
                          <div className="text-sm font-bold text-[#3f4f65]">Terms / Note</div>
                          <textarea
                            rows={3}
                            className="mt-3 min-h-[96px] w-full flex-1 resize-none border-0 bg-transparent px-0 py-0 text-sm leading-6 text-foreground placeholder:text-muted/90 focus-visible:shadow-none xl:min-h-[120px]"
                            placeholder="Write invoice note / condition"
                            {...form.register("condition")}
                          />
                        </div>

                        <div className="hidden">
                          <div className="flex items-center gap-2 text-lg font-semibold text-[#23344d]">
                            <CreditCard className="h-5 w-5 text-primary" />
                            Payment Information
                          </div>
                          <div className="mt-4 grid gap-3 text-sm">
                            <div className="flex items-center justify-between gap-4 border-b border-[#edf2f7] pb-2">
                              <span className="font-medium text-[#516072]">Mode</span>
                              <span className="font-semibold text-[#17263c]">
                                {settlementFlowLabel}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4 border-b border-[#edf2f7] pb-2">
                              <span className="font-medium text-[#516072]">Posting Target</span>
                              <span className="font-semibold text-[#17263c]">
                                {settlementPostingTarget}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-4">
                        <div className="rounded-[10px] border border-[#dce3eb] bg-white p-4">
                          <div className="flex items-center justify-between rounded-t-xl bg-[#f7f9fd] px-4 py-3 text-sm font-semibold text-[#17263c]">
                            <span>Sub Total</span>
                            <span className="tabular-nums">{formatCurrency(invoiceSubtotal)}</span>
                          </div>
                          <div className="space-y-3 px-1 pb-1 pt-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium text-[#516072]">Discount</span>
                              <div className="flex items-center gap-2">
                                <select
                                  className="h-10 rounded-xl border border-[#d8e1ea] bg-white px-3 text-sm font-medium text-[#23344d]"
                                  {...form.register("discountType")}
                                >
                                  <option value="fixed">Fixed</option>
                                  <option value="percent">Percent</option>
                                </select>
                                <Input
                                  money
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="h-10 w-[140px] border-[#d8e1ea] bg-white text-right"
                                  {...form.register("discount", { valueAsNumber: true })}
                                />
                              </div>
                            </div>
                            <div className="border-t border-[#edf2f7] pt-4">
                              <div className="flex items-center justify-between text-lg font-semibold text-primary">
                                <span>Total Price</span>
                                <span className="tabular-nums">{formatCurrency(invoiceNetTotal)}</span>
                              </div>
                              <div className="mt-2 text-xs text-muted">
                                Discount applied: {watchedDiscountType === "percent" ? `${watchedDiscount}% (${formatCurrency(discountAmount)})` : formatCurrency(discountAmount)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="hidden">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Buyer Signature</label>
                              <Input className="mt-2 h-11 border-[#d8e1ea] bg-white" placeholder="Buyer signature name" {...form.register("buyerSignature")} />
                            </div>
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Seller Signature</label>
                              <Input className="mt-2 h-11 border-[#d8e1ea] bg-white" placeholder="Seller signature name" {...form.register("sellerSignature")} />
                            </div>
                          </div>
                          <div className="rounded-[22px] border border-dashed border-[#d6deea] bg-white px-4 py-5 text-right">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8da4]">Final Total</div>
                            <div className="mt-2 text-4xl font-light tracking-tight text-[#1e2d4d]">{formatCurrency(invoiceNetTotal)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={cn("flex flex-1 flex-col justify-between gap-4", isAdjustmentPosting ? "2xl:flex-none 2xl:justify-start" : "")}>
                <div
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-white",
                    isAdjustmentPosting ? "border-[#cbd9e8] shadow-[0_4px_14px_rgba(38,66,98,0.05)]" : "border-border",
                  )}
                >
                  <div ref={tableScrollRef} className="transient-scrollbar overflow-x-auto">
                    <table className={cn("data-table min-w-[840px] bg-white text-sm xl:min-w-full", isAdjustmentPosting ? "max-2xl:w-full max-2xl:table-fixed" : "")}>
                      {isAdjustmentPosting ? (
                        <colgroup>
                          <col className="max-2xl:w-[72px]" />
                          <col className="max-2xl:w-[30%]" />
                          <col className="max-2xl:w-[13%]" />
                          <col className="max-2xl:w-[13%]" />
                          <col className="max-2xl:w-[17%]" />
                          <col className="max-2xl:w-[112px]" />
                        </colgroup>
                      ) : null}
                      <thead className={isAdjustmentPosting ? "bg-[#f3f7fb]" : "bg-canvas"}>
                        <tr>
                          <th className={cn("text-left", isAdjustmentPosting ? "max-2xl:w-[72px] max-2xl:whitespace-nowrap max-2xl:!px-2" : "")}>Dr / Cr</th>
                          <th className="text-left">Ledger</th>
                          {advancedMode ? (
                            <>
                              <th className="text-left">Debit</th>
                              <th className="text-left">Credit</th>
                            </>
                          ) : (
                            <th className="text-left">Amount</th>
                          )}
                          <th className="text-left" title="Optional: use this to track income or expenses by branch, department, project or business unit. It does not change Debit/Credit totals.">
                            Cost Center <span className="normal-case text-muted">(Optional)</span>
                          </th>
                          <th className={cn("text-right", isAdjustmentPosting ? "w-[160px] max-2xl:w-[112px]" : "w-[160px]")}>
                            <Button
                              type="button"
                              variant="outline"
                              className={isAdjustmentPosting ? "border-[#bfd0e3] bg-white text-[#285b88] shadow-sm hover:bg-[#eef5fc] hover:text-[#1f4e78] max-2xl:h-9 max-2xl:px-3" : ""}
                              onClick={appendLine}
                            >
                              <Plus className="h-5 w-5" />
                              Add Row
                            </Button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.fields.map((field, index) => (
                          <tr
                            key={field.id}
                            className={cn(
                              isAdjustmentPosting && activeJournalLineIndex === index
                                ? "bg-[#edf4ff] shadow-[inset_3px_0_0_#4a86d4] ring-1 ring-inset ring-[#91b6e7]"
                                : isAdjustmentPosting
                                  ? "transition-colors hover:bg-[#f8fbff]"
                                  : "",
                            )}
                            onClick={() => {
                              if (isAdjustmentPosting) setActiveJournalLineIndex(index);
                            }}
                          >
                            <td className={cn("text-xs text-muted", isAdjustmentPosting ? "max-2xl:w-[72px] max-2xl:min-w-[72px] max-2xl:!px-2" : "")}>
                              {advancedMode ? (
                                <div className="space-y-1">
                                  <select
                                    className={cn(
                                      "h-10 w-full rounded-xl border bg-white px-3 text-sm font-medium text-foreground outline-none max-2xl:min-w-[56px] max-2xl:px-2",
                                      isAdjustmentPosting ? "border-[#b8c9dc] focus:border-[#3973b7] focus:ring-2 focus:ring-[#dceafe]" : "border-border",
                                    )}
                                    value={watchedLines[index]?.postingSide ?? resolveLinePostingSide(voucherType, index, watchedLines[index])}
                                    onChange={(event) => handlePostingSideChange(index, event.target.value as PostingSide)}
                                  >
                                    <option value="debit">Dr</option>
                                    <option value="credit">Cr</option>
                                  </select>
                                  {(() => {
                                    const line = watchedLines[index];
                                    const ledger = journalLedgerById.get(line?.accountId ?? "")
                                      ?? journalLedgerOptions.find((option) => normalizeLookupValue(option.name) === normalizeLookupValue(line?.ledger ?? ""));
                                    const normalSide = getNormalPostingSide(ledger?.nature);
                                    return normalSide ? <div>Usually {normalSide === "debit" ? "debit" : "credit"}</div> : <div>Select a ledger</div>;
                                  })()}
                                </div>
                              ) : (
                                getLineRoleLabel(index)
                              )}
                            </td>
                            <td>
                              {isAdjustmentPosting ? (
                                <div className="min-w-[210px]">
                                  <input type="hidden" {...form.register(`lines.${index}.accountId`)} />
                                  <Input
                                    value={
                                      activeJournalLineIndex === index && journalLedgerFieldFocused
                                        ? journalLedgerQuery
                                        : (watchedLines[index]?.ledger ?? "")
                                    }
                                    onChange={(event) => {
                                      setActiveJournalLineIndex(index);
                                      setJournalLedgerQuery(event.target.value);
                                    }}
                                    onFocus={() => {
                                      setActiveJournalLineIndex(index);
                                      setJournalLedgerFieldFocused(true);
                                      setJournalLedgerQuery("");
                                    }}
                                    onBlur={() => setJournalLedgerFieldFocused(false)}
                                    onKeyDown={handleJournalLedgerPickerKey}
                                    placeholder="Type to search ledger..."
                                    autoComplete="off"
                                    className="h-10 rounded-xl border-[#b9c9dc] px-3 text-sm focus:border-[#3973e8] focus:ring-2 focus:ring-[#dceafe]"
                                    aria-label={`Ledger for row ${index + 1}`}
                                  />
                                </div>
                              ) : (
                                <Input placeholder="Ledger" {...form.register(`lines.${index}.ledger`)} />
                              )}
                            </td>
                            {advancedMode ? (
                              <>
                                <td>
                                  <Input
                                    money
                                    type="number"
                                    step="0.01"
                                    placeholder="Debit amount"
                                    className="disabled:cursor-not-allowed disabled:bg-[#f1f5f9] disabled:text-[#94a3b8]"
                                    disabled={(watchedLines[index]?.postingSide ?? resolveLinePostingSide(voucherType, index, watchedLines[index])) !== "debit"}
                                    {...form.register(`lines.${index}.debit`, { valueAsNumber: true })}
                                  />
                                </td>
                                <td>
                                  <Input
                                    money
                                    type="number"
                                    step="0.01"
                                    placeholder="Credit amount"
                                    className="disabled:cursor-not-allowed disabled:bg-[#f1f5f9] disabled:text-[#94a3b8]"
                                    disabled={(watchedLines[index]?.postingSide ?? resolveLinePostingSide(voucherType, index, watchedLines[index])) !== "credit"}
                                    {...form.register(`lines.${index}.credit`, { valueAsNumber: true })}
                                  />
                                </td>
                              </>
                            ) : (
                              <td>
                                <Input
                                  money
                                  type="number"
                                  step="0.01"
                                  value={String(getLineAmount(index))}
                                  onChange={(event) => handleSimpleAmountChange(index, event.target.value)}
                                />
                              </td>
                            )}
                            <td>
                              <Input title="Optional reporting tag; it does not affect Debit/Credit." placeholder="e.g. Head Office" {...form.register(`lines.${index}.costCenter`)} />
                            </td>
                            <td>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9 rounded-lg border-[#fecaca] bg-[#fff5f5] px-3 text-xs font-semibold text-[#dc2626] shadow-sm hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#b91c1c] disabled:border-[#fecaca] disabled:bg-[#fff5f5] disabled:text-[#dc2626] disabled:opacity-60"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeLine(index);
                                }}
                                disabled={lines.fields.length <= 2}
                                title={lines.fields.length <= 2 ? "A balanced voucher needs at least two rows" : "Remove row"}
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {isAdjustmentPosting ? (
                  <div className="flex items-start gap-2 rounded-xl border border-[#dbe7f5] bg-[#f7fbff] px-3 py-2 text-xs text-[#5f7088]">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#3973e8]" />
                    <span><strong>Cost Center is optional.</strong> Use it only to analyze income or expenses by branch, department, project or business unit. It does not affect Debit/Credit or the account balance.</span>
                  </div>
                ) : null}

              </div>
            )}
            {!simpleInvoiceMode ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Narration</label>
                <Input placeholder="Shared narration for all ledger lines" {...form.register("narration")} />
                <div className="text-xs text-muted">This narration will apply to all active ledger rows.</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card
          className={cn(
            simpleInvoiceMode
              ? "flex min-h-0 h-full self-stretch flex-col overflow-hidden border-[#d8e1ea] bg-white 2xl:sticky 2xl:top-4"
              : "flex min-h-0 h-full self-stretch flex-col overflow-hidden",
            isAdjustmentPosting ? "border-[#cddbea] bg-[#fbfdff] shadow-[0_10px_30px_rgba(35,57,85,0.08)]" : "",
          )}
        >
          <CardHeader
            className={cn(
              simpleInvoiceMode ? "border-b border-[#edf2f7] px-4 py-3" : "",
              "gap-3",
              isAdjustmentPosting ? "border-b border-[#dce6f0] bg-[#f8fbff] px-4 py-3 2xl:px-5 2xl:py-4" : "",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className={isAdjustmentPosting ? "text-[#18324f]" : ""}>{isAdjustmentPosting ? "Quick Picker" : simpleInvoiceMode ? `${documentTitle} Summary` : "Voucher Summary"}</CardTitle>
                <CardDescription className={isAdjustmentPosting ? "text-[#60758d]" : ""}>
                  {isAdjustmentPosting
                    ? `Select a Chart of Accounts ledger for active row ${activeJournalLineIndex + 1}.`
                    : advancedMode
                    ? "Advanced totals stay visible for accounting operators."
                    : simpleInvoiceMode
                      ? "Everything important stays visible here so the operator can review before saving."
                      : "Operators see simple totals while balancing continues in the background."}
                </CardDescription>
              </div>
              {!simpleInvoiceMode && !isAdjustmentPosting ? (
                <Button variant="outline" type="button" className="shrink-0 rounded-xl border-[#efc59d]" onClick={handleInvoicePrint}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent
            className={cn(
              "flex min-h-0 flex-1 flex-col space-y-4",
              simpleInvoiceMode ? "px-4 py-4" : "",
              isAdjustmentPosting ? "overflow-hidden px-4 pb-4 2xl:px-5 2xl:pb-5" : "",
            )}
          >
            {isAdjustmentPosting ? (
              <div className="flex min-h-[260px] flex-1 flex-col overflow-hidden rounded-xl border border-[#cfddeb] bg-white shadow-[0_3px_12px_rgba(38,66,98,0.04)]">
                <div className="shrink-0 space-y-2 border-b border-[#dce6f0] bg-[#f4f8fc] p-3 2xl:space-y-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold uppercase tracking-[0.1em] text-[#5f738b]">Filtered Ledgers</span>
                    <span className="rounded-full border border-[#d5e3f5] bg-[#eaf3ff] px-2 py-1 font-semibold text-[#2868b2]">
                      {journalLedgerOptions.length}
                    </span>
                  </div>
                  <div className="grid gap-2 xl:grid-cols-[minmax(105px,0.95fr)_minmax(0,1.05fr)] 2xl:grid-cols-1 2xl:gap-3">
                    <div className="flex min-w-0 items-center overflow-hidden whitespace-nowrap rounded-lg border border-[#cfdeed] bg-white px-3 py-2 text-xs text-[#5a7089] shadow-[0_1px_2px_rgba(38,66,98,0.03)] xl:max-2xl:px-2">
                      <span className="shrink-0">Row {activeJournalLineIndex + 1}:&nbsp;</span>
                      <strong className="min-w-0 truncate text-[#334155]">All Ledger Types</strong>
                    </div>
                    <div className="relative min-w-0">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa7b8] xl:max-2xl:left-2" />
                      <Input
                        value={journalLedgerQuery}
                        onChange={(event) => setJournalLedgerQuery(event.target.value)}
                        onKeyDown={handleJournalLedgerPickerKey}
                        placeholder="Search ledger, code or path"
                        className="h-9 min-w-0 border-[#c8d7e7] bg-white pl-9 focus:border-[#3973b7] focus:ring-2 focus:ring-[#dceafe] xl:max-2xl:pl-7 2xl:h-10"
                        aria-label="Search Chart of Accounts ledgers"
                        aria-describedby="journal-ledger-keyboard-help"
                      />
                    </div>
                  </div>
                  <div id="journal-ledger-keyboard-help" className="text-xs text-[#718096]">
                    Use ↑/↓ to move and Enter to select for row {activeJournalLineIndex + 1}.
                  </div>
                </div>
                <div ref={journalLedgerListRef} className="min-h-0 flex-1 overflow-y-auto">
                  {mode !== "api" ? (
                    <div className="px-4 py-8 text-center text-sm text-[#7c899c]">
                      Chart of Accounts ledgers are available in the live company workspace.
                    </div>
                  ) : journalLedgersQuery.isLoading ? (
                    <div className="px-4 py-8 text-center text-sm text-[#7c899c]">Loading Chart of Accounts...</div>
                  ) : journalLedgersQuery.isError ? (
                    <div className="space-y-3 px-4 py-8 text-center text-sm text-[#b42318]">
                      <p>Chart of Accounts ledgers could not be loaded.</p>
                      <Button type="button" variant="outline" onClick={() => void journalLedgersQuery.refetch()}>
                        <RefreshCw className="h-4 w-4" />
                        Retry
                      </Button>
                    </div>
                  ) : filteredJournalLedgerOptions.length ? (
                    filteredJournalLedgerOptions.map((ledger, ledgerIndex) => {
                      const selected = watchedLines[activeJournalLineIndex]?.accountId === ledger.id;
                      const highlighted = journalLedgerHighlight === ledgerIndex;
                      return (
                        <button
                          key={ledger.id}
                          data-journal-ledger-index={ledgerIndex}
                          type="button"
                          className={cn(
                            "flex w-full items-start gap-2 border-b border-[#eef2f7] px-3 py-2.5 text-left transition hover:bg-[#f5f9ff] 2xl:gap-3 2xl:px-4 2xl:py-3",
                            selected ? "bg-[#e9f2ff] shadow-[inset_3px_0_0_#3f7fc9] ring-1 ring-inset ring-[#91b7e7]" : "",
                            highlighted ? "bg-[#f1f6fd] ring-1 ring-inset ring-[#79a7df]" : "",
                          )}
                          onMouseEnter={() => setJournalLedgerHighlight(ledgerIndex)}
                          onClick={() => applyJournalLedgerSelection(ledger)}
                        >
                          <span className="min-w-0 flex-1">
                            <span title={ledger.name} className="block truncate text-sm font-semibold text-[#1f2f46]">{ledger.name}</span>
                            <span title={ledger.path} className="mt-0.5 block truncate text-xs text-[#8994a6]">{ledger.path}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-xs font-medium text-[#65758b]">{ledger.code}</span>
                            <span className="mt-0.5 block text-xs font-semibold tabular-nums text-[#52657e]">{formatLedgerCurrentBalance(ledger.currentBalance)}</span>
                          </span>
                          {selected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2563eb]" /> : null}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-[#7c899c]">No matching ledger found.</div>
                  )}
                </div>
              </div>
            ) : null}
            {simpleInvoiceMode ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3 border-b border-[#edf2f7] pb-2">
                  <span className="text-[#61708a]">Invoice No.</span>
                  <span className="text-right font-semibold text-[#17263c]">{invoiceNumber}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-[#edf2f7] py-2">
                  <span className="text-[#61708a]">{partyRoleLabel}</span>
                  <span className="text-right font-semibold text-[#17263c]">{watchedPartyName || "Not selected"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-[#edf2f7] py-2">
                  <span className="text-[#61708a]">Settlement</span>
                  <span className="text-right font-semibold text-[#17263c]">{settlementFlowLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-[#edf2f7] py-2">
                  <span className="text-[#61708a]">Discount</span>
                  <span className="font-semibold text-[#17263c]">{formatCurrency(discountAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 pt-3">
                  <span className="font-semibold text-[#17263c]">Net Total</span>
                  <span className="text-2xl font-semibold text-primary">{formatCurrency(invoiceNetTotal)}</span>
                </div>
              </div>
            ) : null}
            {simpleInvoiceMode ? (
              <div className="hidden">
                <div className="rounded-[22px] border border-[#dbe5f6] bg-[#eef4ff] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60779a]">Bill Number</div>
                  <div className="mt-2 text-base font-semibold text-[#17315c]">{invoiceNumber}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                  <div className="rounded-[22px] border border-[#dbe8df] bg-[#ecfbf0] p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#5b7a63]">
                      <CircleDollarSign className="h-5 w-5" />
                      Net Total
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-[#173621]">{formatCurrency(invoiceNetTotal)}</div>
                  </div>
                  <div className="rounded-[22px] border border-[#f1dfc3] bg-[#fff4df] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94724a]">Discount</div>
                    <div className="mt-2 text-2xl font-semibold text-[#6c4718]">{formatCurrency(discountAmount)}</div>
                  </div>
                </div>
                <div className="rounded-[22px] border border-[#e5ebf5] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8da4]">Party Snapshot</div>
                    {matchedParty ? (
                      <button type="button" className="text-xs font-semibold text-primary transition hover:text-[#cf670f]" onClick={handleOpenPartyEditor}>
                        Edit
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#17263c]">{watchedPartyName || `${partyRoleLabel} not selected`}</div>
                  <div className="mt-2 text-xs text-[#6f7f96]">
                    {matchedParty?.contact
                      ? `${matchedParty.contact}${matchedParty.address ? ` • ${matchedParty.address}` : ""}`
                      : "Choose a saved party to auto-fill address and contact."}
                  </div>
                </div>
                <div className="rounded-[22px] border border-[#e5ebf5] bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8da4]">Settlement Flow</div>
                  <div className="mt-2 text-sm font-semibold text-[#17263c]">
                    {settlementFlowLabel}
                  </div>
                  <div className="mt-2 text-xs text-[#6f7f96]">
                    {watchedSettlementMode === "cash"
                      ? "Cash will settle this voucher immediately."
                      : watchedSettlementMode === "bank"
                        ? `${watchedPurchaseSettlementLedger || "Bank Accounts"} will settle this voucher immediately.`
                        : `This voucher will remain linked to the ${partyRoleLabel.toLowerCase()} ledger.`}
                  </div>
                </div>
              </div>
            ) : null}
            <div
              className={cn(
                "rounded-xl border p-3",
                isAdjustmentPosting ? "border-[#d2dfeb] bg-[#f6f9fc] text-[#29445f] shadow-[0_2px_8px_rgba(38,66,98,0.04)]" : "border-border bg-canvas",
              )}
            >
              <div className="flex items-center justify-between py-1 text-sm">
                <span>{advancedMode ? "Total Debit" : "Main Total"}</span>
                <span className="tabular-nums font-semibold">{formatCurrency(effectiveTotals.debit)}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span>{advancedMode ? "Total Credit" : "Balance Total"}</span>
                <span className="tabular-nums font-semibold">{formatCurrency(effectiveTotals.credit)}</span>
              </div>
              <div className={cn("flex items-center justify-between py-1 text-sm", isAdjustmentPosting ? "border-t border-[#dce5ee] pt-2" : "")}>
                <span>Difference</span>
                <span
                  className={cn(
                    "tabular-nums font-semibold",
                    isAdjustmentPosting ? (adjustmentIsBalanced ? "text-[#267047]" : "text-[#956316]") : "",
                  )}
                >
                  {formatCurrency(Math.abs(effectiveDifference))}
                </span>
              </div>
            </div>
            {simpleInvoiceMode ? null : null}
            <div className="mt-auto grid gap-3">
              <Button type="submit" disabled={isAdjustmentPosting ? !adjustmentIsBalanced : effectiveDifference !== 0}>
                <Send className="h-5 w-5" />
                {editingVoucherId ? "Update Voucher" : "Submit Voucher"}
              </Button>
              {!editingVoucherId ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isAdjustmentPosting ? !adjustmentIsBalanced : false}
                  onClick={async () => {
                    const saved = await handlePersist("posted", false);
                    if (!saved) {
                      return;
                    }

                    form.reset(buildDefaultValues(voucherType, voucherTemplate, mode, workflow, isAdjustmentPosting));
                    if (isAdjustmentPosting) {
                      setActiveJournalLineIndex(0);
                      setJournalLedgerQuery("");
                    }
                    toast.success("Voucher submitted and form reset");
                  }}
                >
                  Submit and New
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </form>
      )}
    </div>
  );
}
