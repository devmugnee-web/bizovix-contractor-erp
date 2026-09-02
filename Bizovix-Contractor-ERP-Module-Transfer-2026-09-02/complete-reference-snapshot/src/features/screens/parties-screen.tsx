"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import {
  ArrowUpDown,
  Copy,
  Download,
  EllipsisVertical,
  Eye,
  FileText,
  Filter,
  Import,
  Landmark,
  MoreHorizontal,
  Pencil,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  Store,
  Trash2,
  UsersRound,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ExcelIcon, WhatsAppIcon } from "@/components/shared/brand-icons";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { TablePagination } from "@/components/shared/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildVoucherRoute } from "@/config/routes";
import { getPurchaseWorkspaceSection } from "@/config/purchase";
import {
  PartyFormDialog,
  cloneDefaultPartySettings,
  createDefaultPartyFormState,
  getPartySettingsStorageKey,
  normalizePartySettings,
  type PartyFormState,
  type PartySettingsState,
} from "@/features/parties/party-form-dialog";
import { buildPurchaseRows } from "@/features/screens/purchase-workspace-screen";
import { useSessionContext } from "@/hooks/use-session-context";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { buildWhatsAppChatUrl } from "@/lib/app-actions";
import { downloadCsv, openInvoicePdf, printInvoice } from "@/lib/download";
import { formatCurrency, formatDate } from "@/lib/format";
import { moneyToMinorUnits, sumMoney } from "@/lib/money";
import { getPartyLedgerDelta, getPartyLedgerMovement, voucherBelongsToParty } from "@/lib/party-ledger";
import { buildInvoiceExportPayloadFromVoucher } from "@/lib/invoice";
import { cn, isEditableElement, slugify } from "@/lib/utils";
import { readDataset, writeDataset } from "@/services/browser-dataset";
import { movePartyToRecycleBin, moveVoucherToRecycleBin } from "@/services/recycle-bin";
import { deleteVoucher, getVoucher, listDayBook } from "@/services/voucher.service";
import { ApiError, apiRequest } from "@/services/api-client";
import type { DataMode, PartyRecord, VoucherRecord, VoucherType } from "@/types/domain";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";

type PartyWorkspaceTab = "overview" | "transactions" | "ledger" | "payments" | "outstanding" | "timeline";
type PartyFilterState = {
  partyTypes: Array<PartyRecord["type"]>;
  transactionTypes: VoucherType[];
  balance: "all" | "outstanding" | "paid" | "credit" | "debit";
  statuses: Array<PartyRecord["status"] | "over-credit">;
  dateRange: "all" | "today" | "yesterday" | "this-week" | "this-month" | "last-month" | "current-fy";
  createdBy: string;
};

type PartyTransactionRow = {
  id: string;
  source: "voucher" | "opening";
  displayType: string;
  voucherType: VoucherRecord["voucherType"];
  documentKind?: string | null;
  voucherNumber: string;
  partyName: string;
  reference: string;
  voucherDate: string;
  createdAt: string;
  total: number;
  ledgerDelta: number;
  balance: number;
  status: VoucherRecord["status"];
  enteredBy: string;
  partyType: PartyRecord["type"];
  paymentStatus: "pending" | "settled";
};
type PartySummary = PartyRecord & {
  email: string;
  taxId: string;
  notes: string;
  tags: string[];
  billingAddress: string;
  shippingAddress: string;
  outstanding: number;
  creditWarning: boolean;
  lastTransaction: string | null;
  lastPayment: string | null;
  transactionCount: number;
  balanceDirection: "credit" | "debit" | "settled";
};
type PartiesScreenView = "all" | "customers" | "suppliers";
type TableColumnId = "select" | "voucherType" | "voucherNumber" | "reference" | "voucherDate" | "total" | "balance" | "status" | "actions";
type TableSortColumn = Exclude<TableColumnId, "select" | "actions">;
type TransactionSortColumn = TableSortColumn | "createdAt";
type ColumnDrawerSection = TableSortColumn | "advanced";
type TransactionFilterState = {
  transactionTypes: VoucherType[];
  dateRange: PartyFilterState["dateRange"];
  balance: PartyFilterState["balance"];
  statuses: VoucherRecord["status"][];
  createdBy: string;
  partyTypes: Array<PartyRecord["type"]>;
  amount: "all" | "0-10000" | "10000-50000" | "50000+";
  outstanding: "all" | "with-outstanding" | "settled";
  paymentStatus: "all" | "pending" | "settled";
  voucherQuery: string;
  referenceQuery: string;
};
type TableSortState = {
  columnId: TransactionSortColumn;
  direction: "asc" | "desc";
};
type TableColumnConfig = {
  id: TableColumnId;
  label: string;
  width: number;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  filterable?: boolean;
  hideable?: boolean;
};
type TableContextMenuState =
  | {
      x: number;
      y: number;
      rowId: string;
      columnId: TableColumnId;
      value: string;
    }
  | null;
type PartyContextMenuState =
  | {
      partyId: string;
      left: number;
      top: number;
    }
  | null;
type ColumnFilterPopoverState =
  | {
      section: TableSortColumn;
      left: number;
      top: number;
      width: number;
    }
  | null;
type TransactionActionMenuState =
  | {
      rowId: string | null;
      left: number;
      top: number;
    }
  | null;
type TransactionDetailDialogState =
  | {
      mode: "preview" | "history";
      row: PartyTransactionRow;
    }
  | null;
type ConfirmationDialogState =
  | {
      kind: "delete-party";
      partyId: string;
      partyName: string;
    }
  | {
      kind: "delete-transaction";
      voucherId: string;
      voucherNumber: string;
    }
  | {
      kind: "delete-selected-transactions";
      voucherIds: string[];
    }
  | null;
const workspaceTabs: Array<{ value: PartyWorkspaceTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "transactions", label: "Transactions" },
  { value: "ledger", label: "Ledger" },
  { value: "payments", label: "Payments" },
  { value: "outstanding", label: "Outstanding" },
  { value: "timeline", label: "Timeline" },
];
const voucherToneMap: Record<VoucherType, "green" | "blue" | "amber" | "red" | "slate"> = {
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
const defaultFilters: PartyFilterState = {
  partyTypes: [],
  transactionTypes: [],
  balance: "all",
  statuses: [],
  dateRange: "all",
  createdBy: "all",
};
const defaultTransactionFilters: TransactionFilterState = {
  transactionTypes: [],
  dateRange: "all",
  balance: "all",
  statuses: [],
  createdBy: "all",
  partyTypes: [],
  amount: "all",
  outstanding: "all",
  paymentStatus: "all",
  voucherQuery: "",
  referenceQuery: "",
};

function buildPartyFiltersForView(view: PartiesScreenView): PartyFilterState {
  if (view === "customers") {
    return { ...defaultFilters, partyTypes: ["customer"] };
  }

  if (view === "suppliers") {
    return { ...defaultFilters, partyTypes: ["supplier"] };
  }

  return defaultFilters;
}

function buildTransactionFiltersForView(view: PartiesScreenView): TransactionFilterState {
  if (view === "customers") {
    return { ...defaultTransactionFilters, partyTypes: ["customer"] };
  }

  if (view === "suppliers") {
    return { ...defaultTransactionFilters, partyTypes: ["supplier"] };
  }

  return defaultTransactionFilters;
}
const defaultColumnVisibility: Record<TableColumnId, boolean> = {
  select: true,
  voucherType: true,
  voucherNumber: true,
  reference: true,
  voucherDate: true,
  total: true,
  balance: true,
  status: true,
  actions: true,
};
const defaultColumnWidths: Record<TableColumnId, number> = {
  select: 36,
  voucherType: 96,
  voucherNumber: 112,
  reference: 100,
  voucherDate: 88,
  total: 96,
  balance: 108,
  status: 86,
  actions: 40,
};
const tableColumns: TableColumnConfig[] = [
  { id: "select", label: "", width: 36, align: "center" },
  { id: "voucherType", label: "Type", width: 96, sortable: true, filterable: true, hideable: true },
  { id: "voucherNumber", label: "Number", width: 112, sortable: true, filterable: true, hideable: true },
  { id: "reference", label: "Reference", width: 100, sortable: true, filterable: true, hideable: true },
  { id: "voucherDate", label: "Date", width: 88, sortable: true, filterable: true, hideable: true },
  { id: "total", label: "Total", width: 96, align: "right", sortable: true, filterable: true, hideable: true },
  { id: "balance", label: "Balance", width: 108, align: "right", sortable: true, filterable: true, hideable: true },
  { id: "status", label: "Status", width: 86, align: "center", sortable: true, filterable: true, hideable: true },
  { id: "actions", label: "", width: 40, align: "right" },
];
const pageSizeOptions = [25, 50, 100, 250];
const partyRowHeight = 48;

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function toggleValue<T>(items: T[], value: T) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

/** Prisma returns @db.Date columns as full ISO timestamps; <input type="date"> only
 * accepts YYYY-MM-DD, so trim the value on the way into the form. */
function toDateInputValue(value: unknown) {
  if (value == null || value === "") return "";
  const raw = String(value);
  return raw.length >= 10 ? raw.slice(0, 10) : "";
}

function normalizePartyRecord(party: Record<string, unknown>, workspaceId: string): PartyRecord {
  const rawType = String(party.type ?? "customer").toLowerCase();
  const rawStatus = String(party.status ?? "active").toLowerCase();

  return {
    id: String(party.id ?? `party-${Date.now()}`),
    workspaceId: String(party.workspaceId ?? workspaceId),
    ledgerAccountId: party.ledgerAccountId == null ? null : String(party.ledgerAccountId),
    name: String(party.name ?? "Unnamed Party"),
    partyCategory: String(party.partyCategory ?? "business").toLowerCase() === "individual" ? "individual" : "business",
    type: rawType === "supplier" ? "supplier" : "customer",
    contact: String(party.contact ?? ""),
    contactPerson: String(party.contactPerson ?? ""),
    whatsappNumber: String(party.whatsappNumber ?? ""),
    dateOfBirth: toDateInputValue(party.dateOfBirth),
    marriageDate: toDateInputValue(party.marriageDate),
    address: String(party.address ?? ""),
    addressLine1: String(party.addressLine1 ?? ""),
    addressLine2: String(party.addressLine2 ?? ""),
    city: String(party.city ?? ""),
    district: String(party.district ?? ""),
    postalCode: String(party.postalCode ?? ""),
    country: String(party.country ?? ""),
    creditLimit: Number(party.creditLimit ?? 0),
    openingBalance: Number(party.openingBalance ?? 0) || 0,
    openingBalanceDate: party.openingBalanceDate == null ? null : toDateInputValue(party.openingBalanceDate),
    billMaturityDays: Number.isInteger(Number(party.billMaturityDays)) ? Number(party.billMaturityDays) : 30,
    status: rawStatus === "inactive" ? "inactive" : "active",
  };
}

function isEffectiveLedgerVoucher(voucher: VoucherRecord) {
  if (voucher.status !== "posted" && voucher.status !== "reversed") return false;
  return !/-REV(?:-REV)*$/i.test(voucher.voucherNumber.trim()) || Boolean(voucher.reversalOfId);
}

function hasPartyOpeningJournal(vouchers: VoucherRecord[], party: PartyRecord) {
  return vouchers.some(
    (voucher) =>
      isEffectiveLedgerVoucher(voucher)
      && voucher.voucherType === "journal"
      && voucher.documentKind === "opening-balance"
      && voucher.partyId === party.id
      && voucher.lines.some((line) => Boolean(party.ledgerAccountId) && line.accountId === party.ledgerAccountId),
  );
}

export async function loadParties(mode: DataMode, workspaceId: string) {
  if (mode === "api") {
    const response = (await apiRequest(`/parties?workspaceId=${encodeURIComponent(workspaceId)}`)) as Array<Record<string, unknown>>;
    return response.map((party) => normalizePartyRecord(party, workspaceId));
  }

  return readDataset(mode).parties.filter((party) => party.workspaceId === workspaceId);
}

/** voucher.debit/voucher.credit are the whole-voucher totals — always equal to each
 * other on any balanced entry, so subtracting them nets to zero regardless of the
 * real transaction. The party's actual dr/cr sits on the specific ledger line named
 * after them (voucher-entry-screen.tsx writes `ledger: partyName` for the
 * receivable/payable side); pull the delta from that line instead. */
function formatVoucherLabel(voucherType: VoucherType, documentKind?: string | null) {
  if (voucherType === "purchase") {
    if (documentKind === "purchase-order") return "Purchase Order";
    if (documentKind === "receipt-note") return "Receipt Note";
    return "Purchase Bill";
  }
  if (voucherType === "payment") {
    return "Payment";
  }
  if (voucherType === "debit-note") {
    return "Purchase Return";
  }
  return voucherType
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function matchesAmountRange(amount: number, range: TransactionFilterState["amount"]) {
  const amountMinorUnits = moneyToMinorUnits(amount);
  if (range === "all") {
    return true;
  }
  if (range === "0-10000") {
    return amountMinorUnits >= 0 && amountMinorUnits < moneyToMinorUnits(10000);
  }
  if (range === "10000-50000") {
    return amountMinorUnits >= moneyToMinorUnits(10000) && amountMinorUnits < moneyToMinorUnits(50000);
  }
  return amountMinorUnits >= moneyToMinorUnits(50000);
}

function clearTransactionFilterSection(filters: TransactionFilterState, section: TableSortColumn): TransactionFilterState {
  if (section === "voucherType") {
    return { ...filters, transactionTypes: [] };
  }
  if (section === "voucherNumber") {
    return { ...filters, voucherQuery: "" };
  }
  if (section === "reference") {
    return { ...filters, referenceQuery: "" };
  }
  if (section === "voucherDate") {
    return { ...filters, dateRange: "all" };
  }
  if (section === "total") {
    return { ...filters, amount: "all" };
  }
  if (section === "balance") {
    return { ...filters, balance: "all", outstanding: "all", paymentStatus: "all" };
  }
  if (section === "status") {
    return { ...filters, statuses: [] };
  }

  return filters;
}

function isColumnFilterActive(filters: TransactionFilterState, section: TableSortColumn) {
  if (section === "voucherType") {
    return filters.transactionTypes.length > 0;
  }
  if (section === "voucherNumber") {
    return filters.voucherQuery.trim().length > 0;
  }
  if (section === "reference") {
    return filters.referenceQuery.trim().length > 0;
  }
  if (section === "voucherDate") {
    return filters.dateRange !== "all";
  }
  if (section === "total") {
    return filters.amount !== "all";
  }
  if (section === "balance") {
    return filters.balance !== "all" || filters.outstanding !== "all" || filters.paymentStatus !== "all";
  }
  if (section === "status") {
    return filters.statuses.length > 0;
  }

  return false;
}

function useVirtualSlice<T>(items: T[], containerRef: RefObject<HTMLDivElement | null>, rowHeight: number, overscan = 8) {
  const [metrics, setMetrics] = useState({ scrollTop: 0, viewportHeight: rowHeight * 8 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const update = () =>
      setMetrics({
        scrollTop: element.scrollTop,
        viewportHeight: Math.max(element.clientHeight, rowHeight),
      });

    update();
    element.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, [containerRef, rowHeight, items.length]);

  const visibleCount = Math.max(1, Math.ceil(metrics.viewportHeight / rowHeight));
  const start = Math.max(0, Math.floor(metrics.scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, start + visibleCount + overscan * 2);

  return {
    start,
    items: items.slice(start, end),
    paddingTop: start * rowHeight,
    paddingBottom: Math.max(0, (items.length - end) * rowHeight),
    totalHeight: items.length * rowHeight,
  };
}

function isDateInRange(dateValue: string, range: PartyFilterState["dateRange"]) {
  if (range === "all") {
    return true;
  }

  const target = new Date(dateValue);
  // Real current date — pinning this froze "today"/"this week"/"this month" to a
  // date in the past, so those ranges stopped matching anything.
  const now = new Date();
  const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const compareDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.floor((currentDate.getTime() - compareDate.getTime()) / 86400000);

  if (range === "today") {
    return diffDays === 0;
  }
  if (range === "yesterday") {
    return diffDays === 1;
  }
  if (range === "this-week") {
    return diffDays >= 0 && diffDays < 7;
  }
  if (range === "this-month") {
    return currentDate.getMonth() === compareDate.getMonth() && currentDate.getFullYear() === compareDate.getFullYear();
  }
  if (range === "last-month") {
    const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    return lastMonth.getMonth() === compareDate.getMonth() && lastMonth.getFullYear() === compareDate.getFullYear();
  }
  if (range === "current-fy") {
    return compareDate >= new Date("2026-07-01T00:00:00") && compareDate <= new Date("2027-06-30T23:59:59");
  }

  return true;
}

export function PartiesScreen({ view = "all" }: { view?: PartiesScreenView }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, session } = useSessionContext();
  const listScrollRef = useTransientScrollbar<HTMLDivElement>();
  const tableScrollRef = useTransientScrollbar<HTMLDivElement>();
  const selectedListRef = useRef<HTMLDivElement>(null);
  const createRequestRef = useRef("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const columnFilterPopoverRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{ columnId: TableColumnId; startX: number; startWidth: number } | null>(null);
  const transactionActionMenuRef = useRef<HTMLDivElement>(null);
  const partyContextMenuRef = useRef<HTMLDivElement>(null);
  const [localParties, setLocalParties] = useState<PartyRecord[]>([]);
  const [localVouchers, setLocalVouchers] = useState<VoucherRecord[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PartyWorkspaceTab>("transactions");
  const [partySearch, setPartySearch] = useState(searchParams.get("focusValue") ?? "");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [filterDrawerSection] = useState<ColumnDrawerSection>("advanced");
  const [columnFilterPopover, setColumnFilterPopover] = useState<ColumnFilterPopoverState>(null);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [listSettingsOpen, setListSettingsOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const initialPartyFilters = useMemo(() => buildPartyFiltersForView(view), [view]);
  const initialTransactionFilters = useMemo(() => buildTransactionFiltersForView(view), [view]);
  const [draftFilters, setDraftFilters] = useState<PartyFilterState>(initialPartyFilters);
  const [appliedFilters, setAppliedFilters] = useState<PartyFilterState>(initialPartyFilters);
  const [draftTransactionFilters, setDraftTransactionFilters] = useState<TransactionFilterState>(initialTransactionFilters);
  const [appliedTransactionFilters, setAppliedTransactionFilters] = useState<TransactionFilterState>(initialTransactionFilters);
  const [transactionSort, setTransactionSort] = useState<TableSortState>({ columnId: "createdAt", direction: "desc" });
  const [columnVisibility, setColumnVisibility] = useState<Record<TableColumnId, boolean>>(defaultColumnVisibility);
  const [columnWidths, setColumnWidths] = useState<Record<TableColumnId, number>>(defaultColumnWidths);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [focusedTransactionId, setFocusedTransactionId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<TableContextMenuState>(null);
  const [partyContextMenu, setPartyContextMenu] = useState<PartyContextMenuState>(null);
  const [transactionActionMenu, setTransactionActionMenu] = useState<TransactionActionMenuState>(null);
  const [transactionDetailDialog, setTransactionDetailDialog] = useState<TransactionDetailDialogState>(null);
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialogState>(null);
  const [, setSavedFilterCount] = useState(0);
  const [settingsState, setSettingsState] = useState<PartySettingsState>(() => cloneDefaultPartySettings());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [resumeAddDialogAfterSettings, setResumeAddDialogAfterSettings] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  /* The party entry form itself lives in PartyFormDialog (vouchers open the same one).
   * This screen only decides what it opens with and what happens to its list after a save. */
  const [partyDialogSeed, setPartyDialogSeed] = useState<PartyFormState>(() => createDefaultPartyFormState());
  const [dialogPartyType, setDialogPartyType] = useState<PartyRecord["type"]>("customer");

  const title = view === "customers" ? "Customers" : view === "suppliers" ? "Suppliers" : "Customer & Suppliers";
  const primaryCreateType: PartyRecord["type"] = view === "suppliers" ? "supplier" : "customer";
  const primaryActionLabel = view === "customers" ? "Add Customer" : view === "suppliers" ? "Add Supplier" : "Add Party";
  const emptyListTitle = view === "customers" ? "No customers found" : view === "suppliers" ? "No suppliers found" : "No parties found";
  const emptyListDescription =
    view === "customers"
      ? "Adjust the filters or create a new customer."
      : view === "suppliers"
        ? "Adjust the filters or create a new supplier."
        : "Adjust the filters or create a new customer or supplier.";
  const emptySelectionDescription =
    view === "customers"
      ? "Choose a customer from the left workspace list to inspect details and transactions."
      : view === "suppliers"
        ? "Choose a supplier from the left workspace list to inspect details and transactions."
        : "Choose a customer or supplier from the left workspace list to inspect details and transactions.";
  const workspaceId = session?.workspaceId ?? "";
  const settingsPartyType: PartyRecord["type"] = view === "all" ? dialogPartyType : primaryCreateType;
  const settingsEntityLabel = settingsPartyType === "supplier" ? "Supplier" : "Customer";

  const partiesQuery = useQuery({
    queryKey: [mode, "parties", workspaceId],
    queryFn: () => loadParties(mode, workspaceId),
    enabled: Boolean(workspaceId),
  });
  const vouchersQuery = useQuery({
    queryKey: [mode, "party-vouchers", workspaceId],
    queryFn: () => listDayBook(mode, { workspaceId }),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    if (partiesQuery.data) {
      setLocalParties(partiesQuery.data);
    }
  }, [partiesQuery.data]);

  useEffect(() => {
    if (vouchersQuery.data) {
      setLocalVouchers(vouchersQuery.data);
    }
  }, [vouchersQuery.data]);

  useEffect(() => {
    const requestedPartyId = searchParams.get("partyId");
    const requestedTab = searchParams.get("tab") as PartyWorkspaceTab | null;
    if (requestedPartyId && localParties.some((party) => party.id === requestedPartyId)) {
      setPartySearch("");
      setSelectedPartyId(requestedPartyId);
    }
    if (requestedTab && workspaceTabs.some((tab) => tab.value === requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [localParties, searchParams]);

  useEffect(() => {
    setDraftFilters(initialPartyFilters);
    setAppliedFilters(initialPartyFilters);
    setDraftTransactionFilters(initialTransactionFilters);
    setAppliedTransactionFilters(initialTransactionFilters);
  }, [initialPartyFilters, initialTransactionFilters]);

  useEffect(() => {
    const createType = searchParams.get("create");
    if (!createType) {
      return;
    }

    const requestKey = `${createType}:${searchParams.get("open") ?? "initial"}`;
    if (createRequestRef.current === requestKey) {
      return;
    }

    // A ?name= on the link is the name the operator already typed wherever they came
    // from, so it arrives pre-filled instead of being retyped here.
    const requestedName = searchParams.get("name")?.trim() ?? "";
    const requestedType: PartyRecord["type"] = createType === "supplier" ? "supplier" : "customer";
    setEditingPartyId(null);
    setPartyDialogSeed({ ...createDefaultPartyFormState(requestedType), name: requestedName });
    setDialogPartyType(requestedType);
    setAddDialogOpen(true);
    createRequestRef.current = requestKey;
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedValue = window.localStorage.getItem(getPartySettingsStorageKey(mode, workspaceId, settingsPartyType));
    if (!savedValue) {
      setSettingsState(cloneDefaultPartySettings());
      return;
    }

    try {
      setSettingsState(normalizePartySettings(JSON.parse(savedValue)));
    } catch {
      setSettingsState(cloneDefaultPartySettings());
    }
  }, [mode, settingsPartyType, workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined" || !workspaceId) {
      return;
    }

    window.localStorage.setItem(getPartySettingsStorageKey(mode, workspaceId, settingsPartyType), JSON.stringify(settingsState));
  }, [mode, settingsPartyType, settingsState, workspaceId]);

  const partySummaries = useMemo<PartySummary[]>(() => {
    return localParties.map((party) => {
      const transactions = localVouchers
        .filter((voucher) => voucherBelongsToParty(voucher, party))
        .sort((left, right) => right.voucherDate.localeCompare(left.voucherDate));
      const ledgerVouchers = localVouchers.filter(isEffectiveLedgerVoucher);
      const openingBalance = hasPartyOpeningJournal(ledgerVouchers, party) ? 0 : party.openingBalance ?? 0;
      const outstandingRaw = sumMoney([
        openingBalance,
        ...ledgerVouchers.map((voucher) => getPartyLedgerDelta(voucher, party)),
      ]);
      const lastPayment = transactions.find((voucher) => voucher.voucherType === "receipt" || voucher.voucherType === "payment");
      const normalizedOutstanding = Math.abs(outstandingRaw);

      return {
        ...party,
        email: `${slugify(party.name)}@bizovix.app`,
        taxId: party.type === "customer" ? "VAT Pending" : "BIN Pending",
        notes: transactions.length ? `Last activity captured on ${formatDate(transactions[0].voucherDate)}.` : "No internal notes yet.",
        tags: [party.type === "customer" ? "Customer" : "Supplier", party.status === "active" ? "Active" : "Inactive"],
        billingAddress: party.address,
        shippingAddress: party.address,
        outstanding: normalizedOutstanding,
        creditWarning: moneyToMinorUnits(normalizedOutstanding) > moneyToMinorUnits(party.creditLimit) && moneyToMinorUnits(party.creditLimit) > 0,
        lastTransaction: transactions[0]?.voucherDate ?? null,
        lastPayment: lastPayment?.voucherDate ?? null,
        transactionCount: transactions.length,
        balanceDirection: moneyToMinorUnits(outstandingRaw) === 0 ? "settled" : moneyToMinorUnits(outstandingRaw) > 0 ? "credit" : "debit",
      };
    });
  }, [localParties, localVouchers]);

  const filteredParties = useMemo(() => {
    const listQuery = partySearch.trim().toLowerCase();
    const workspaceQuery = workspaceSearch.trim().toLowerCase();

    const nextRows = partySummaries.filter((party) => {
      if ((view === "customers" && party.type !== "customer") || (view === "suppliers" && party.type !== "supplier")) {
        return false;
      }

      if (appliedFilters.partyTypes.length && !appliedFilters.partyTypes.includes(party.type)) {
        return false;
      }

      if (appliedFilters.statuses.includes("over-credit") && !party.creditWarning) {
        return false;
      }

      const partyStatusFilters = appliedFilters.statuses.filter((status) => status !== "over-credit") as PartyRecord["status"][];
      if (partyStatusFilters.length && !partyStatusFilters.includes(party.status)) {
        return false;
      }

      if (appliedFilters.balance === "outstanding" && moneyToMinorUnits(party.outstanding) <= 0) {
        return false;
      }
      if (appliedFilters.balance === "paid" && moneyToMinorUnits(party.outstanding) !== 0) {
        return false;
      }
      if (appliedFilters.balance === "credit" && party.balanceDirection !== "credit") {
        return false;
      }
      if (appliedFilters.balance === "debit" && party.balanceDirection !== "debit") {
        return false;
      }

      const relatedTransactions = localVouchers
        .filter((voucher) => voucherBelongsToParty(voucher, party));
      if (appliedFilters.transactionTypes.length && !relatedTransactions.some((voucher) => appliedFilters.transactionTypes.includes(voucher.voucherType))) {
        return false;
      }
      if (appliedFilters.createdBy !== "all" && !relatedTransactions.some((voucher) => voucher.enteredBy === appliedFilters.createdBy)) {
        return false;
      }
      if (appliedFilters.dateRange !== "all") {
        const matchesDate = relatedTransactions.some((voucher) => isDateInRange(voucher.voucherDate, appliedFilters.dateRange));
        if (!matchesDate) {
          return false;
        }
      }

      if (listQuery) {
        const listHaystack = [party.name, party.contact, party.address, party.tags.join(" "), formatCurrency(party.outstanding)].join(" ").toLowerCase();
        if (!listHaystack.includes(listQuery)) {
          return false;
        }
      }

      if (!workspaceQuery) {
        return true;
      }

      const transactionHaystack = relatedTransactions
        .map((voucher) => [voucher.voucherNumber, voucher.reference ?? "", voucher.particulars, voucher.partyName, voucher.enteredBy, formatCurrency(voucher.amount)].join(" "))
        .join(" ");
      return [party.name, party.contact, party.address, party.tags.join(" "), transactionHaystack].join(" ").toLowerCase().includes(workspaceQuery);
    });

    nextRows.sort((left, right) => left.name.localeCompare(right.name));

    return nextRows;
  }, [appliedFilters, localVouchers, partySearch, partySummaries, view, workspaceSearch]);

  const filteredPartyTotalBalance = useMemo(() => {
    const signedBalance = sumMoney(filteredParties.map((party) => (
      party.balanceDirection === "settled"
        ? 0
        : party.balanceDirection === "debit"
          ? -party.outstanding
          : party.outstanding
    )));

    return {
      amount: Math.abs(signedBalance),
      direction: moneyToMinorUnits(signedBalance) === 0 ? "settled" as const : moneyToMinorUnits(signedBalance) > 0 ? "credit" as const : "debit" as const,
    };
  }, [filteredParties]);

  useEffect(() => {
    if (selectedPartyId && partySummaries.some((party) => party.id === selectedPartyId)) {
      return;
    }

    if (filteredParties.length) {
      setSelectedPartyId(filteredParties[0].id);
      return;
    }

    if (!partySummaries.length) {
      setSelectedPartyId(null);
    }
  }, [filteredParties, partySummaries, selectedPartyId]);

  useEffect(() => {
    if (!selectedPartyId) {
      return;
    }

    const selectedRow = selectedListRef.current?.querySelector<HTMLElement>(`[data-party-id="${selectedPartyId}"]`);
    selectedRow?.scrollIntoView({ block: "nearest" });
  }, [selectedPartyId]);

  useEffect(() => {
    function handleGlobalSearchHotkey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g" && !isEditableElement(event.target)) {
        event.preventDefault();
        const field = document.getElementById("party-list-search") as HTMLInputElement | null;
        field?.focus();
        field?.select();
      }
    }

    window.addEventListener("keydown", handleGlobalSearchHotkey);
    return () => window.removeEventListener("keydown", handleGlobalSearchHotkey);
  }, []);

  useEffect(() => {
    setAppliedFilters(draftFilters);
  }, [draftFilters]);

  const selectedParty = partySummaries.find((party) => party.id === selectedPartyId) ?? null;
  const editingPartySummary = editingPartyId ? partySummaries.find((party) => party.id === editingPartyId) ?? null : null;
  const editingParty = editingPartyId ? localParties.find((party) => party.id === editingPartyId) ?? null : null;
  // Receipt Notes whose goods already arrived from this supplier but haven't
  // been rolled into a Purchase Bill yet — same pending-to-bill math the
  // Receipt Notes list uses, just grouped per supplier instead of per row.
  const pendingPurchaseBillBySupplier = useMemo(() => {
    const rows = buildPurchaseRows(localVouchers, getPurchaseWorkspaceSection("receipt-notes"));
    const totals = new Map<string, number>();
    rows.forEach((row) => {
      if (moneyToMinorUnits(row.remaining) <= 0) return;
      const key = row.partyName.trim().toLowerCase();
      totals.set(key, sumMoney([totals.get(key) ?? 0, row.remaining]));
    });
    return totals;
  }, [localVouchers]);
  const selectedPartyPendingPurchaseBill =
    selectedParty?.type === "supplier" ? pendingPurchaseBillBySupplier.get(selectedParty.name.trim().toLowerCase()) ?? 0 : 0;
  const selectedPartyTransactions = useMemo<PartyTransactionRow[]>(() => {
    if (!selectedParty) {
      return [];
    }

    const accountingVouchers = localVouchers.filter(isEffectiveLedgerVoucher);
    const openingBalance = hasPartyOpeningJournal(accountingVouchers, selectedParty) ? 0 : selectedParty.openingBalance ?? 0;
    const ordered = localVouchers
      .filter(isEffectiveLedgerVoucher)
      .filter((voucher) => voucherBelongsToParty(voucher, selectedParty))
      .filter((voucher) => getPartyLedgerMovement(voucher, selectedParty).hasPosting)
      .sort((left, right) => {
        if (left.voucherDate === right.voucherDate) {
          return left.id.localeCompare(right.id);
        }
        return left.voucherDate.localeCompare(right.voucherDate);
      });

    let runningBalance = openingBalance;
    const openingRows: PartyTransactionRow[] =
      moneyToMinorUnits(openingBalance) === 0
        ? []
        : [
            {
              id: `opening-${selectedParty.id}`,
              source: "opening",
              displayType: "Opening Balance",
              voucherType: "journal",
              documentKind: null,
              voucherNumber: `OPEN-${selectedParty.id.slice(-4).toUpperCase()}`,
              partyName: selectedParty.name,
              reference: selectedParty.name,
              voucherDate: selectedParty.openingBalanceDate || "2026-07-01",
              createdAt: `${selectedParty.openingBalanceDate || "2026-07-01"}T00:00:00.000Z`,
              total: Math.abs(openingBalance),
              ledgerDelta: openingBalance,
              balance: openingBalance,
              status: "posted",
              enteredBy: "System",
              partyType: selectedParty.type,
              paymentStatus: moneyToMinorUnits(openingBalance) === 0 ? ("settled" as const) : ("pending" as const),
            },
          ];

    const voucherRows = ordered
      .map((voucher) => {
        const ledgerDelta = getPartyLedgerDelta(voucher, selectedParty);
        runningBalance = sumMoney([runningBalance, ledgerDelta]);
        return {
          id: voucher.id,
          source: "voucher" as const,
          displayType: formatVoucherLabel(voucher.voucherType, voucher.documentKind),
          voucherType: voucher.voucherType,
          documentKind: voucher.documentKind,
          voucherNumber: voucher.voucherNumber,
          partyName: voucher.partyName,
          reference: voucher.reference?.trim() || voucher.particulars || selectedParty.name,
          voucherDate: voucher.voucherDate,
          createdAt: voucher.createdAt,
          total: voucher.amount,
          ledgerDelta,
          balance: runningBalance,
          status: voucher.status,
          enteredBy: voucher.enteredBy,
          partyType: selectedParty.type,
          paymentStatus: moneyToMinorUnits(runningBalance) === 0 ? ("settled" as const) : ("pending" as const),
        };
      })
      .reverse();

    return [...openingRows, ...voucherRows];
  }, [localVouchers, selectedParty]);
  const filteredTransactions = useMemo(() => {
    const lookup = workspaceSearch.trim().toLowerCase();

    return selectedPartyTransactions.filter((row) => {
      const balanceMinorUnits = moneyToMinorUnits(row.balance);
      if (activeTab === "payments" && row.voucherType !== "receipt" && row.voucherType !== "payment") {
        return false;
      }
      if (activeTab === "outstanding" && balanceMinorUnits === 0) {
        return false;
      }

      if (appliedTransactionFilters.transactionTypes.length && !appliedTransactionFilters.transactionTypes.includes(row.voucherType)) {
        return false;
      }
      if (appliedTransactionFilters.statuses.length && !appliedTransactionFilters.statuses.includes(row.status)) {
        return false;
      }
      if (appliedTransactionFilters.createdBy !== "all" && row.enteredBy !== appliedTransactionFilters.createdBy) {
        return false;
      }
      if (appliedTransactionFilters.partyTypes.length && !appliedTransactionFilters.partyTypes.includes(row.partyType)) {
        return false;
      }
      if (appliedTransactionFilters.dateRange !== "all" && !isDateInRange(row.voucherDate, appliedTransactionFilters.dateRange)) {
        return false;
      }
      if (appliedTransactionFilters.balance === "outstanding" && balanceMinorUnits === 0) {
        return false;
      }
      if (appliedTransactionFilters.balance === "paid" && balanceMinorUnits !== 0) {
        return false;
      }
      if (appliedTransactionFilters.balance === "credit" && balanceMinorUnits < 0) {
        return false;
      }
      if (appliedTransactionFilters.balance === "debit" && balanceMinorUnits > 0) {
        return false;
      }
      if (appliedTransactionFilters.outstanding === "with-outstanding" && balanceMinorUnits === 0) {
        return false;
      }
      if (appliedTransactionFilters.outstanding === "settled" && balanceMinorUnits !== 0) {
        return false;
      }
      if (appliedTransactionFilters.paymentStatus !== "all" && row.paymentStatus !== appliedTransactionFilters.paymentStatus) {
        return false;
      }
      if (!matchesAmountRange(row.total, appliedTransactionFilters.amount)) {
        return false;
      }
      if (appliedTransactionFilters.voucherQuery && !row.voucherNumber.toLowerCase().includes(appliedTransactionFilters.voucherQuery.toLowerCase())) {
        return false;
      }
      if (appliedTransactionFilters.referenceQuery && !row.reference.toLowerCase().includes(appliedTransactionFilters.referenceQuery.toLowerCase())) {
        return false;
      }

      if (!lookup) {
        return true;
      }

      return [
        selectedParty?.name ?? "",
        selectedParty?.contact ?? "",
        row.voucherNumber,
        row.reference,
        row.displayType,
        row.enteredBy,
        formatCurrency(row.total),
        formatCurrency(Math.abs(row.balance)),
      ]
        .join(" ")
        .toLowerCase()
        .includes(lookup);
    });
  }, [activeTab, appliedTransactionFilters, selectedParty, selectedPartyTransactions, workspaceSearch]);

  const sortedTransactions = useMemo(() => {
    const rows = [...filteredTransactions];
    rows.sort((left, right) => {
      let comparison = 0;
      if (transactionSort.columnId === "createdAt") {
        comparison = left.createdAt.localeCompare(right.createdAt) || left.voucherDate.localeCompare(right.voucherDate);
      } else if (transactionSort.columnId === "voucherType") {
        comparison = left.displayType.localeCompare(right.displayType);
      } else if (transactionSort.columnId === "voucherNumber") {
        comparison = left.voucherNumber.localeCompare(right.voucherNumber);
      } else if (transactionSort.columnId === "reference") {
        comparison = left.reference.localeCompare(right.reference);
      } else if (transactionSort.columnId === "voucherDate") {
        comparison = left.voucherDate.localeCompare(right.voucherDate);
      } else if (transactionSort.columnId === "total") {
        comparison = left.total - right.total;
      } else if (transactionSort.columnId === "balance") {
        comparison = left.balance - right.balance;
      } else if (transactionSort.columnId === "status") {
        comparison = left.status.localeCompare(right.status);
      }

      return transactionSort.direction === "asc" ? comparison : comparison * -1;
    });
    return rows;
  }, [filteredTransactions, transactionSort]);

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / pageSize));
  const currentPageRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedTransactions.slice(startIndex, startIndex + pageSize);
  }, [currentPage, pageSize, sortedTransactions]);
  const visibleTableColumns = useMemo(() => tableColumns.filter((column) => columnVisibility[column.id]), [columnVisibility]);
  const tableMinWidth = useMemo(() => visibleTableColumns.reduce((total, column) => total + columnWidths[column.id], 0), [columnWidths, visibleTableColumns]);
  const selectedTransactionRows = useMemo(
    () => sortedTransactions.filter((row) => selectedTransactionIds.includes(row.id)),
    [selectedTransactionIds, sortedTransactions],
  );
  const activeTransactionActionRow = useMemo(
    () => (transactionActionMenu ? sortedTransactions.find((row) => row.id === transactionActionMenu.rowId) ?? null : null),
    [sortedTransactions, transactionActionMenu],
  );
  const virtualPartyRows = useVirtualSlice(filteredParties, listScrollRef, partyRowHeight, 8);
  const pageSelectionActive = currentPageRows.length > 0 && currentPageRows.every((row) => selectedTransactionIds.includes(row.id));
  const pageSelectionPartial = currentPageRows.some((row) => selectedTransactionIds.includes(row.id)) && !pageSelectionActive;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, appliedTransactionFilters, selectedPartyId, pageSize, workspaceSearch]);

  useEffect(() => {
    setSelectedTransactionIds((current) => current.filter((id) => sortedTransactions.some((row) => row.id === id)));
  }, [sortedTransactions]);

  useEffect(() => {
    if (!currentPageRows.length) {
      setFocusedTransactionId(null);
      return;
    }

    if (!focusedTransactionId || !currentPageRows.some((row) => row.id === focusedTransactionId)) {
      setFocusedTransactionId(currentPageRows[0].id);
    }
  }, [currentPageRows, focusedTransactionId]);

  useEffect(() => {
    function handlePointerMove(event: MouseEvent) {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      setColumnWidths((current) => ({
        ...current,
        [resizeState.columnId]: Math.max(70, resizeState.startWidth + delta),
      }));
    }

    function handlePointerUp() {
      resizeStateRef.current = null;
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    if (!columnFilterPopover) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const targetElement = event.target instanceof Element ? event.target : null;
      if (targetElement?.closest('button[aria-label^="Filter "]')) {
        return;
      }
      if (columnFilterPopoverRef.current?.contains(target)) {
        return;
      }
      setColumnFilterPopover(null);
    }

    function handleDismiss(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setColumnFilterPopover(null);
      }
    }

    function handleViewportResize() {
      setColumnFilterPopover(null);
    }

    function handleViewportScroll(event: Event) {
      const target = event.target as Node | null;
      if (target && columnFilterPopoverRef.current?.contains(target)) {
        return;
      }

      setColumnFilterPopover(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleDismiss);
    window.addEventListener("resize", handleViewportResize);
    window.addEventListener("scroll", handleViewportScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleDismiss);
      window.removeEventListener("resize", handleViewportResize);
      window.removeEventListener("scroll", handleViewportScroll, true);
    };
  }, [columnFilterPopover]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (actionsMenuOpen && actionsMenuRef.current && !actionsMenuRef.current.contains(target)) {
        setActionsMenuOpen(false);
      }

      if (columnMenuOpen && columnMenuRef.current && !columnMenuRef.current.contains(target)) {
        setColumnMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [actionsMenuOpen, columnMenuOpen]);

  useEffect(() => {
    if (!transactionActionMenu) {
      return;
    }

    function handleDismiss(event: MouseEvent) {
      const target = event.target as Node;
      if (transactionActionMenuRef.current && !transactionActionMenuRef.current.contains(target)) {
        setTransactionActionMenu(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setTransactionActionMenu(null);
      }
    }

    function handleViewportChange() {
      setTransactionActionMenu(null);
    }

    window.addEventListener("mousedown", handleDismiss);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("mousedown", handleDismiss);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [transactionActionMenu]);

  useEffect(() => {
    if (!partyContextMenu) {
      return;
    }

    function handleDismiss(event: MouseEvent) {
      const target = event.target as Node;
      if (partyContextMenuRef.current && !partyContextMenuRef.current.contains(target)) {
        setPartyContextMenu(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPartyContextMenu(null);
      }
    }

    function handleViewportChange() {
      setPartyContextMenu(null);
    }

    window.addEventListener("mousedown", handleDismiss);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("mousedown", handleDismiss);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [partyContextMenu]);

  function persistWorkspaceData(nextParties: PartyRecord[], nextVouchers: VoucherRecord[] = localVouchers) {
    setLocalParties(nextParties);
    setLocalVouchers(nextVouchers);

    if (mode !== "api") {
      const dataset = readDataset(mode);
      writeDataset(mode, {
        ...dataset,
        parties: nextParties,
        vouchers: nextVouchers,
      });
    }
  }

  function partyFormSeedFromSummary(party: PartySummary): PartyFormState {
    const hasStructuredAddress = Boolean(
      party.addressLine1 || party.addressLine2 || party.city || party.district || party.postalCode || party.country,
    );
    return {
      name: party.name,
      partyCategory: party.partyCategory ?? "business",
      type: party.type,
      contactPerson: party.contactPerson ?? "",
      contact: party.contact,
      whatsappNumber: party.whatsappNumber ?? "",
      dateOfBirth: party.dateOfBirth ?? "",
      marriageDate: party.marriageDate ?? "",
      email: party.email,
      billingAddress: party.address,
      addressLine1: party.addressLine1 || (!hasStructuredAddress ? party.address : ""),
      addressLine2: party.addressLine2 ?? "",
      city: party.city ?? "",
      district: party.district ?? "",
      postalCode: party.postalCode ?? "",
      country: party.country ?? "",
      shippingAddress: party.address,
      creditLimit: party.creditLimit ? String(party.creditLimit) : "",
      openingBalance: party.openingBalance ? String(party.openingBalance) : "",
      billMaturityDays: String(party.billMaturityDays ?? 30),
      taxId: party.taxId === "VAT Pending" || party.taxId === "BIN Pending" ? "" : party.taxId,
      notes: party.notes === "No internal notes yet." ? "" : party.notes,
      tags: party.tags.join(", "),
    };
  }

  function parseCsvLine(line: string) {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      const nextCharacter = line[index + 1];

      if (character === '"' && inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
        continue;
      }

      if (character === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (character === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += character;
    }

    cells.push(current.trim());
    return cells;
  }

  function handleOpenEditParty(party: PartySummary) {
    setEditingPartyId(party.id);
    setPartyDialogSeed(partyFormSeedFromSummary(party));
    setDialogPartyType(party.type);
    setAddDialogOpen(true);
  }

  function handleDeleteParty(targetPartyId = selectedPartyId) {
    setPartyContextMenu(null);

    if (!targetPartyId) {
      toast.error("Select a party first");
      return;
    }

    const targetParty = partySummaries.find((party) => party.id === targetPartyId);
    if (!targetParty) {
      toast.error("Party not found");
      return;
    }

    const hasTransactions = localVouchers.some((voucher) => voucher.partyName.trim().toLowerCase() === targetParty.name.trim().toLowerCase());
    if (hasTransactions) {
      toast.error("This party has transactions. Edit it instead of deleting.");
      setActiveTab("transactions");
      return;
    }

    setConfirmationDialog({
      kind: "delete-party",
      partyId: targetPartyId,
      partyName: targetParty.name,
    });
  }

  function handleOpenPartyContextMenu(event: React.MouseEvent<HTMLDivElement>, party: PartySummary) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedPartyId(party.id);
    const menuWidth = 200;
    const menuHeight = 104;
    const maxLeft = Math.max(12, window.innerWidth - menuWidth - 12);
    const maxTop = Math.max(12, window.innerHeight - menuHeight - 12);

    setPartyContextMenu({
      partyId: party.id,
      left: Math.min(event.clientX, maxLeft),
      top: Math.min(event.clientY, maxTop),
    });
  }

  async function handleImportPartiesFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !session?.workspaceId) {
      return;
    }

    try {
      const text = await file.text();
      const trimmed = text.trim();
      let importedRows: Array<Record<string, string>> = [];

      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(trimmed) as Array<Record<string, unknown>>;
        importedRows = parsed.map((entry) =>
          Object.fromEntries(Object.entries(entry).map(([key, value]) => [key.toLowerCase(), String(value ?? "").trim()])),
        );
      } else {
        const lines = trimmed.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) {
          toast.error("Import file needs a header row and at least one party row");
          return;
        }

        const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
        importedRows = lines.slice(1).map((line) => {
          const cells = parseCsvLine(line);
          return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
        });
      }

      const knownPartyNames = new Set(localParties.map((party) => party.name.trim().toLowerCase()));
      const importedParties: PartyRecord[] = [];

      for (const row of importedRows) {
        const name = (row.name ?? row.party ?? row.partyname ?? "").trim();
        if (!name) {
          continue;
        }

        const normalizedName = name.toLowerCase();
        if (knownPartyNames.has(normalizedName)) {
          continue;
        }

        const rawType = (row.type ?? row.partytype ?? "customer").trim().toLowerCase();
        importedParties.push({
          id: `party-${Date.now()}-${importedParties.length + 1}`,
          workspaceId: session.workspaceId,
          name,
          type: rawType === "supplier" ? "supplier" : "customer",
          contact: (row.contact ?? row.phone ?? row.mobile ?? "").trim(),
          address: (row.address ?? row.billingaddress ?? "").trim(),
          creditLimit: Number(row.creditlimit ?? row.credit_limit ?? 0) || 0,
          openingBalance: Number(row.openingbalance ?? row.opening_balance ?? row.balance ?? 0) || 0,
          billMaturityDays: (() => {
            const rawDays = row.billmaturitydays ?? row.bill_maturity_days ?? row.maturitydays ?? "";
            if (rawDays.trim() === "") return 30;
            const days = Number(rawDays);
            return Number.isInteger(days) && days >= 0 && days <= 3650 ? days : 30;
          })(),
          status: (row.status ?? "active").trim().toLowerCase() === "inactive" ? "inactive" : "active",
        });
        knownPartyNames.add(normalizedName);
      }

      if (!importedParties.length) {
        toast.error("No new parties were imported");
        return;
      }

      const nextParties = [...importedParties, ...localParties];
      persistWorkspaceData(nextParties);
      setSelectedPartyId(importedParties[0].id);
      toast.success(`${importedParties.length} parties imported`);
    } catch {
      toast.error("Unable to import this file. Use CSV or JSON.");
    } finally {
      event.target.value = "";
    }
  }

  function handleOpenAddParty(type: PartyRecord["type"] = "customer") {
    setEditingPartyId(null);
    setPartyDialogSeed(createDefaultPartyFormState(type));
    setDialogPartyType(type);
    setAddDialogOpen(true);
  }

  /* PartyFormDialog owns validation and the write. What is left here is the list
   * bookkeeping only this screen can do: refresh its own rows, carry a rename across
   * historical vouchers, and select what was just saved. */
  function handlePartySaved(nextParty: PartyRecord, context: { previous: PartyRecord | null; keepOpen: boolean }) {
    const previous = context.previous;
    const nextParties = previous
      ? localParties.map((party) => (party.id === previous.id ? nextParty : party))
      : [nextParty, ...localParties];
    const nextVouchers =
      previous && previous.name.trim().toLowerCase() !== nextParty.name.trim().toLowerCase()
        ? localVouchers.map((voucher) =>
            voucher.partyName.trim().toLowerCase() === previous.name.trim().toLowerCase()
              ? { ...voucher, partyName: nextParty.name }
              : voucher,
          )
        : localVouchers;

    persistWorkspaceData(nextParties, nextVouchers);
    setSelectedPartyId(nextParty.id);
    setEditingPartyId(null);
    setPartyDialogSeed(createDefaultPartyFormState(nextParty.type));
    setDialogPartyType(nextParty.type);
  }
  async function handleRefresh() {
    setActionsMenuOpen(false);
    setColumnMenuOpen(false);
    setContextMenu(null);
    setPartyContextMenu(null);
    setColumnFilterPopover(null);
    setTransactionActionMenu(null);
    setPartySearch("");
    setWorkspaceSearch("");
    setDraftFilters(initialPartyFilters);
    setAppliedFilters(initialPartyFilters);
    setDraftTransactionFilters(initialTransactionFilters);
    setAppliedTransactionFilters(initialTransactionFilters);
    setSelectedTransactionIds([]);
    setCurrentPage(1);

    if (mode !== "api") {
      const dataset = readDataset(mode);
      setLocalParties(dataset.parties.filter((party) => party.workspaceId === workspaceId));
      setLocalVouchers(dataset.vouchers.filter((voucher) => voucher.workspaceId === workspaceId));
      toast.success("Parties workspace refreshed");
      return;
    }

    try {
      const [partiesResult, vouchersResult] = await Promise.all([partiesQuery.refetch(), vouchersQuery.refetch()]);
      if (partiesResult.error || vouchersResult.error) {
        throw partiesResult.error ?? vouchersResult.error ?? new Error("Refresh failed");
      }
      toast.success("Parties workspace refreshed");
    } catch {
      toast.error("Unable to refresh parties workspace");
    }
  }

  function handleHeaderAction(action: () => void) {
    setActionsMenuOpen(false);
    action();
  }

  function handleExportTransactions(rows: PartyTransactionRow[] = sortedTransactions) {
    if (!selectedParty || !rows.length) {
      toast.error("No transactions available to export");
      return;
    }

    downloadCsv(
      `${slugify(selectedParty.name)}-transactions.csv`,
      rows.map((entry) => ({
        Type: entry.displayType,
        "Voucher No": entry.voucherNumber,
        Reference: entry.reference,
        Date: formatDate(entry.voucherDate),
        Total: entry.total,
        Balance: entry.balance,
        Status: entry.status,
        "Created By": entry.enteredBy,
      })),
    );
    toast.success("Transactions exported");
  }

  function handleToggleTransactionSort(columnId: TableSortColumn) {
    setTransactionSort((current) =>
      current.columnId === columnId
        ? { columnId, direction: current.direction === "asc" ? "desc" : "asc" }
        : { columnId, direction: columnId === "voucherDate" ? "desc" : "asc" },
    );
  }

  function handleOpenColumnFilterPopover(section: TableSortColumn, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setDraftTransactionFilters(appliedTransactionFilters);
    const trigger = event.currentTarget;
    const rect = trigger.getBoundingClientRect();
    const popoverWidth = section === "balance" ? 320 : 280;
    const popoverHeight = section === "balance" ? 340 : 300;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const maxLeft = Math.max(12, viewportWidth - popoverWidth - 12);
    const maxTop = Math.max(16, viewportHeight - popoverHeight - 12);
    const centeredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const preferredLeft = rect.right + popoverWidth > viewportWidth - 12 ? rect.right - popoverWidth : centeredLeft;

    setColumnFilterPopover((current) => {
      if (current?.section === section) {
        return null;
      }

      return {
        section,
        width: popoverWidth,
        left: Math.min(Math.max(12, preferredLeft), maxLeft),
        top: Math.min(rect.bottom + 8, maxTop),
      };
    });
  }

  function handleConfirmDialogOpenChange(open: boolean) {
    if (!open) {
      setConfirmationDialog(null);
    }
  }

  function handleConfirmDialogAction() {
    if (!confirmationDialog) {
      return;
    }

    if (confirmationDialog.kind === "delete-party") {
      const targetPartyId = confirmationDialog.partyId;
      const targetPartyName = confirmationDialog.partyName;
      const deletedParty = localParties.find((party) => party.id === targetPartyId) ?? null;

      void (async () => {
        try {
          if (mode === "api") {
            await apiRequest(`/parties/${encodeURIComponent(targetPartyId)}`, { method: "DELETE" });
          } else if (deletedParty) {
            movePartyToRecycleBin(mode, deletedParty, session?.user.name ?? "Current User");
          }

          const nextParties = localParties.filter((party) => party.id !== targetPartyId);
          persistWorkspaceData(nextParties);
          if (selectedPartyId === targetPartyId) {
            setSelectedPartyId(nextParties[0]?.id ?? null);
          }
          toast.success(`${targetPartyName} deleted`);
        } catch (error) {
          toast.error(errorMessage(error, "This party could not be deleted."));
        } finally {
          setConfirmationDialog(null);
        }
      })();
      return;
    }

    if (confirmationDialog.kind === "delete-selected-transactions") {
      const { voucherIds } = confirmationDialog;
      void (async () => {
        if (!session?.workspaceId) {
          toast.error("Workspace not found");
          setConfirmationDialog(null);
          return;
        }

        let deletedCount = 0;
        const deletedIds: string[] = [];
        let pendingIds = Array.from(new Set(voucherIds));

        // Related vouchers can depend on one another. Retry the remaining rows after
        // every successful pass so selecting all only needs one Delete action.
        while (pendingIds.length) {
          const failedIds: string[] = [];
          let passDeletedCount = 0;

          for (const voucherId of pendingIds) {
            try {
              const deletedVoucher = await deleteVoucher(mode, voucherId, session.workspaceId);
              if (deletedVoucher && mode !== "api") {
                moveVoucherToRecycleBin(mode, deletedVoucher, session.user.name ?? "Current User");
              }
              deletedCount += 1;
              passDeletedCount += 1;
              deletedIds.push(voucherId);
            } catch {
              failedIds.push(voucherId);
            }
          }

          pendingIds = failedIds;
          if (!passDeletedCount) {
            break;
          }
        }

        const failedCount = pendingIds.length;

        const nextVouchers = localVouchers.filter((voucher) => !deletedIds.includes(voucher.id));
        persistWorkspaceData(localParties, nextVouchers);
        setSelectedTransactionIds((current) => current.filter((id) => !deletedIds.includes(id)));

        const summary = [
          deletedCount ? `${deletedCount} deleted` : null,
          failedCount ? `${failedCount} failed` : null,
        ]
          .filter(Boolean)
          .join(", ");
        toast[failedCount ? "error" : "success"](summary || "No transactions changed");

        setConfirmationDialog(null);
      })();
      return;
    }

    void (async () => {
      try {
        if (!session?.workspaceId) {
          throw new Error("Workspace not found");
        }

        const deletedVoucher = await deleteVoucher(mode, confirmationDialog.voucherId, session.workspaceId);
        if (deletedVoucher && mode !== "api") {
          moveVoucherToRecycleBin(mode, deletedVoucher, session.user.name ?? "Current User");
        }
        const nextVouchers = localVouchers.filter((voucher) => voucher.id !== confirmationDialog.voucherId);
        persistWorkspaceData(localParties, nextVouchers);
        toast.success("Transaction deleted");

        setSelectedTransactionIds((current) => current.filter((id) => id !== confirmationDialog.voucherId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Transaction could not be changed");
      } finally {
        setConfirmationDialog(null);
      }
    })();
  }

  function handleClearColumnFilterPopover(section: TableSortColumn) {
    const nextFilters = clearTransactionFilterSection(draftTransactionFilters, section);
    setDraftTransactionFilters(nextFilters);
    setAppliedTransactionFilters(nextFilters);
    setColumnFilterPopover(null);
  }

  function handleApplyColumnFilterPopover() {
    setAppliedTransactionFilters(draftTransactionFilters);
    setColumnFilterPopover(null);
  }

  /** The transaction grid is the working surface of this screen, so its layout is what
   * the header gear controls — hiding every column would leave an unusable table, so the
   * last visible one is kept. */
  function handleToggleColumnVisibility(columnId: TableColumnId) {
    setColumnVisibility((current) => {
      if (!current[columnId]) {
        return { ...current, [columnId]: true };
      }

      const stillVisible = tableColumns.filter((column) => column.hideable && current[column.id] && column.id !== columnId);
      if (!stillVisible.length) {
        toast.error("At least one column has to stay visible");
        return current;
      }

      return { ...current, [columnId]: false };
    });
  }

  function handleResetTableLayout() {
    setColumnVisibility(defaultColumnVisibility);
    setColumnWidths(defaultColumnWidths);
    toast.success("Table layout reset");
  }

  function handleTogglePageSelection() {
    if (!currentPageRows.length) {
      return;
    }

    setSelectedTransactionIds((current) => {
      if (pageSelectionActive) {
        return current.filter((id) => !currentPageRows.some((row) => row.id === id));
      }

      return Array.from(new Set([...current, ...currentPageRows.map((row) => row.id)]));
    });
  }

  function handleToggleRowSelection(rowId: string) {
    setSelectedTransactionIds((current) => (current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]));
  }

  function handleOpenVoucher(row: PartyTransactionRow) {
    setTransactionActionMenu(null);
    setTransactionDetailDialog(null);

    if (row.source === "opening") {
      const targetParty = partySummaries.find((party) => party.name.trim().toLowerCase() === row.partyName.trim().toLowerCase()) ?? selectedParty;
      if (targetParty) {
        handleOpenEditParty(targetParty);
      }
      return;
    }

    router.push(`${buildVoucherRoute(mode, row.voucherType)}?edit=${encodeURIComponent(row.id)}`);
  }

  function handlePreviewTransaction(row: PartyTransactionRow) {
    setTransactionActionMenu(null);
    setTransactionDetailDialog({ mode: "preview", row });
  }

  function handlePrimaryTransactionOpen(row: PartyTransactionRow) {
    handlePreviewTransaction(row);
  }

  function handleOpenTransactionActionMenu(event: React.MouseEvent<HTMLButtonElement>, row: PartyTransactionRow) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 232;
    const maxLeft = Math.max(12, window.innerWidth - menuWidth - 12);

    setTransactionActionMenu((current) =>
      current?.rowId === row.id
        ? null
        : {
            rowId: row.id,
            left: Math.min(Math.max(12, rect.right - menuWidth), maxLeft),
            top: Math.min(rect.bottom + 8, window.innerHeight - 360),
          },
    );
  }

  function handleDeleteTransaction(row: PartyTransactionRow) {
    setTransactionActionMenu(null);

    setConfirmationDialog({
      kind: "delete-transaction",
      voucherId: row.id,
      voucherNumber: row.voucherNumber,
    });
  }

  function handleDeleteSelectedTransactions() {
    const selectedRows = sortedTransactions.filter((row) => selectedTransactionIds.includes(row.id) && row.source === "voucher");
    if (!selectedRows.length) {
      toast.error("Select at least one transaction row to delete");
      return;
    }

    setConfirmationDialog({
      kind: "delete-selected-transactions",
      voucherIds: selectedRows.map((row) => row.id),
    });
    setColumnMenuOpen(false);
  }

  function handleDuplicateTransaction(row: PartyTransactionRow) {
    setTransactionActionMenu(null);
    if (row.source === "opening") {
      toast.info("Duplicate is available for voucher transactions only");
      return;
    }
    router.push(`${buildVoucherRoute(mode, row.voucherType)}?duplicate=${encodeURIComponent(row.id)}`);
  }

  async function handleOpenTransactionPdf(row: PartyTransactionRow) {
    setTransactionActionMenu(null);
    if (row.source === "opening") {
      toast.info("PDF is not available for opening balance rows");
      return;
    }
    try {
      if (!session?.workspaceId) {
        throw new Error("Workspace not found");
      }

      const voucher = await getVoucher(mode, row.id, session.workspaceId);
      await openInvoicePdf(buildInvoiceExportPayloadFromVoucher(mode, voucher));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF could not be opened");
    }
  }

  async function handlePrintTransaction(row: PartyTransactionRow) {
    setTransactionActionMenu(null);
    if (row.source === "opening") {
      toast.info("Print is not available for opening balance rows");
      return;
    }
    try {
      if (!session?.workspaceId) {
        throw new Error("Workspace not found");
      }

      const voucher = await getVoucher(mode, row.id, session.workspaceId);
      await printInvoice(buildInvoiceExportPayloadFromVoucher(mode, voucher));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invoice print failed");
    }
  }

  function handleConvertTransactionToReturn(row: PartyTransactionRow) {
    setTransactionActionMenu(null);
    if (row.source === "opening") {
      toast.info("Convert to return is not available for opening balance rows");
      return;
    }
    const targetType = row.voucherType === "sales" ? "credit-note" : row.voucherType === "purchase" ? "debit-note" : null;

    if (!targetType) {
      toast.info("Convert to return is available for sales and purchase vouchers only");
      return;
    }

    router.push(`${buildVoucherRoute(mode, targetType)}?fromVoucher=${encodeURIComponent(row.id)}`);
  }

  function handleMakeTransactionPayment(row: PartyTransactionRow) {
    setTransactionActionMenu(null);
    if (row.source === "opening") {
      toast.info("Create a receipt or payment from the party workspace after editing the opening balance");
      return;
    }
    const targetType = row.partyType === "customer" ? "receipt" : "payment";
    router.push(`${buildVoucherRoute(mode, targetType)}?fromVoucher=${encodeURIComponent(row.id)}`);
  }

  function handleOpenTransactionHistory(row: PartyTransactionRow) {
    setTransactionActionMenu(null);
    setTransactionDetailDialog({ mode: "history", row });
  }

  function handleTableKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!currentPageRows.length || isEditableElement(event.target)) {
      return;
    }

    const currentIndex = currentPageRows.findIndex((row) => row.id === focusedTransactionId);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = Math.min(currentIndex + 1, currentPageRows.length - 1);
      setFocusedTransactionId(currentPageRows[nextIndex]?.id ?? currentPageRows[0].id);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = Math.max(currentIndex - 1, 0);
      setFocusedTransactionId(currentPageRows[nextIndex]?.id ?? currentPageRows[0].id);
    }
    if (event.key === "Enter" && focusedTransactionId) {
      event.preventDefault();
      const row = currentPageRows.find((entry) => entry.id === focusedTransactionId);
      if (row) {
        handlePrimaryTransactionOpen(row);
      }
    }
    if (event.key === " " && focusedTransactionId) {
      event.preventDefault();
      handleToggleRowSelection(focusedTransactionId);
    }
  }

  function handleCellContextMenu(event: React.MouseEvent, row: PartyTransactionRow, columnId: TableColumnId, value: string) {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      rowId: row.id,
      columnId,
      value,
    });
  }

  async function handleCopyCell(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("Cell value copied");
    setContextMenu(null);
  }

  async function handleCopySummary() {
    if (!selectedParty) {
      toast.error("Select a party first");
      return;
    }

    const payload = [
      `Party: ${selectedParty.name}`,
      `Type: ${selectedParty.type}`,
      `Contact: ${selectedParty.contact || "-"}`,
      `Outstanding: ${formatCurrency(selectedParty.outstanding)}`,
      `Credit Limit: ${formatCurrency(selectedParty.creditLimit)}`,
    ].join("\n");

    await navigator.clipboard.writeText(payload);
    toast.success("Party summary copied");
  }

  function handleExportPartyStatement() {
    if (!selectedParty) {
      toast.error("Select a party first");
      return;
    }

    downloadCsv(`${slugify(selectedParty.name)}-statement.csv`, [
      {
        Party: selectedParty.name,
        Type: selectedParty.type,
        Contact: selectedParty.contact || "-",
        Address: selectedParty.address || "-",
        Outstanding: formatCurrency(selectedParty.outstanding),
        "Credit Limit": formatCurrency(selectedParty.creditLimit),
        "Last Transaction": selectedParty.lastTransaction ? formatDate(selectedParty.lastTransaction) : "No activity",
        "Last Payment": selectedParty.lastPayment ? formatDate(selectedParty.lastPayment) : "No payment",
      },
    ]);
    toast.success("Party statement exported");
  }

  function handleOpenImportPicker() {
    importInputRef.current?.click();
  }

  function handleOpenPartySettings() {
    if (addDialogOpen) {
      setResumeAddDialogAfterSettings(true);
      setAddDialogOpen(false);
    }

    setSettingsDrawerOpen(true);
  }

  function handleClosePartySettings() {
    setSettingsDrawerOpen(false);

    if (resumeAddDialogAfterSettings) {
      setAddDialogOpen(true);
      setResumeAddDialogAfterSettings(false);
    }
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!filteredParties.length || isEditableElement(event.target)) {
      return;
    }

    const selectedIndex = filteredParties.findIndex((party) => party.id === selectedPartyId);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = Math.min(selectedIndex + 1, filteredParties.length - 1);
      setSelectedPartyId(filteredParties[nextIndex]?.id ?? filteredParties[0].id);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = Math.max(selectedIndex - 1, 0);
      setSelectedPartyId(filteredParties[nextIndex]?.id ?? filteredParties[0].id);
    }
  }

  const transactionSectionTitle =
    activeTab === "payments"
      ? "Payment History"
      : activeTab === "outstanding"
        ? "Outstanding Transactions"
        : activeTab === "ledger"
          ? "Ledger View"
          : "Transactions";

  function getCellValue(row: PartyTransactionRow, columnId: TableColumnId) {
    if (columnId === "voucherType") {
      return row.displayType;
    }
    if (columnId === "voucherNumber") {
      return row.voucherNumber;
    }
    if (columnId === "reference") {
      return row.reference;
    }
    if (columnId === "voucherDate") {
      return formatDate(row.voucherDate);
    }
    if (columnId === "total") {
      return formatCurrency(row.total);
    }
    if (columnId === "balance") {
      return formatCurrency(Math.abs(row.balance));
    }
    if (columnId === "status") {
      return row.status;
    }
    return "";
  }

  function renderTransactionCell(row: PartyTransactionRow, columnId: TableColumnId) {
    if (columnId === "select") {
      return (
        <input
          type="checkbox"
          checked={selectedTransactionIds.includes(row.id)}
          onChange={() => handleToggleRowSelection(row.id)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${row.voucherNumber}`}
        />
      );
    }

    if (columnId === "voucherType") {
      return <Badge tone={row.source === "opening" ? "amber" : voucherToneMap[row.voucherType]}>{row.displayType}</Badge>;
    }

    if (columnId === "voucherNumber") {
      return <span className="line-clamp-2 break-words font-medium text-foreground">{row.voucherNumber || "-"}</span>;
    }

    if (columnId === "reference") {
      return <span className="line-clamp-2 break-words text-muted">{row.reference || "-"}</span>;
    }

    if (columnId === "voucherDate") {
      return <span className="text-foreground">{formatDate(row.voucherDate)}</span>;
    }

    if (columnId === "total") {
      const hasNoPartyBalanceImpact = row.source === "voucher" && moneyToMinorUnits(row.ledgerDelta) === 0 && moneyToMinorUnits(row.total) > 0;
      return (
        <span className="block text-right">
          <span className="block tabular-nums font-medium text-foreground">{formatCurrency(row.total)}</span>
          {hasNoPartyBalanceImpact ? (
            <span className="mt-0.5 block text-[10px] font-medium text-[#168356]">No {row.partyType} balance impact</span>
          ) : null}
        </span>
      );
    }

    if (columnId === "balance") {
      return (
        <span className={cn("tabular-nums font-semibold", moneyToMinorUnits(row.balance) === 0 ? "text-muted" : moneyToMinorUnits(row.balance) > 0 ? "text-primary" : "text-danger")}>
          {formatCurrency(Math.abs(row.balance))}
        </span>
      );
    }

    if (columnId === "status") {
      return <Badge tone={statusToneMap[row.status]}>{row.status}</Badge>;
    }

    return (
      <button
        type="button"
        className="inline-flex rounded-md p-1.5 text-muted transition hover:bg-white hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          handleOpenTransactionActionMenu(event, row);
        }}
        aria-label="Open transaction actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    );
  }

  function getTransactionActionItems(row: PartyTransactionRow) {
    if (row.source === "opening") {
      return [
        { label: "View / Edit", icon: Pencil, action: () => handleOpenVoucher(row) },
        { label: "Preview", icon: Eye, action: () => handlePreviewTransaction(row) },
        { label: "View History", icon: Search, action: () => handleOpenTransactionHistory(row) },
      ];
    }

    return [
      { label: "View / Edit", icon: Pencil, action: () => handleOpenVoucher(row) },
      { label: "Delete", icon: Trash2, action: () => handleDeleteTransaction(row) },
      { label: "Duplicate", icon: Copy, action: () => handleDuplicateTransaction(row) },
      { label: "Open PDF", icon: FileText, action: () => void handleOpenTransactionPdf(row) },
      { label: "Preview", icon: Eye, action: () => handlePreviewTransaction(row) },
      { label: "Print", icon: Printer, action: () => void handlePrintTransaction(row) },
      { label: "Convert to Return", icon: RefreshCw, action: () => handleConvertTransactionToReturn(row) },
      { label: "Make Payment", icon: Wallet, action: () => handleMakeTransactionPayment(row) },
      { label: "View History", icon: Search, action: () => handleOpenTransactionHistory(row) },
    ];
  }

  const enteredByOptions = Array.from(new Set(localVouchers.map((voucher) => voucher.enteredBy)));

  if (!session || partiesQuery.isLoading || vouchersQuery.isLoading) {
    return <LoadingPanel lines={10} />;
  }

  if (partiesQuery.error || vouchersQuery.error) {
    return (
      <ErrorPanel
        title={`${title} workspace unavailable`}
        description={`The ${title.toLowerCase()} list or transaction history could not be loaded from the current data source.`}
        onRetry={handleRefresh}
      />
    );
  }

  return (
    <>
      <input ref={importInputRef} type="file" accept=".csv,.json" className="hidden" onChange={handleImportPartiesFile} />
      <Dialog open={Boolean(transactionDetailDialog)} onOpenChange={(open) => (!open ? setTransactionDetailDialog(null) : undefined)}>
        <DialogContent>
          <DialogTitle>{transactionDetailDialog?.mode === "history" ? "Transaction History" : "Transaction Preview"}</DialogTitle>
          <DialogDescription>
                  {transactionDetailDialog?.mode === "history"
                      ? "Quick activity details for the selected party transaction."
                      : "Review the selected party transaction before opening or printing it."}
          </DialogDescription>
          {transactionDetailDialog ? (
            <div className="space-y-4 pt-2">
              <div className="grid sm:grid-cols-2 sm:gap-x-8">
                {[
                  { label: "Type", value: transactionDetailDialog.row.displayType },
                  { label: "Voucher No", value: transactionDetailDialog.row.voucherNumber },
                  { label: "Reference", value: transactionDetailDialog.row.reference || "-" },
                  { label: "Date", value: formatDate(transactionDetailDialog.row.voucherDate) },
                  { label: "Total", value: formatCurrency(transactionDetailDialog.row.total) },
                  { label: "Party Balance Impact", value: moneyToMinorUnits(transactionDetailDialog.row.ledgerDelta) === 0 ? "No impact" : formatCurrency(Math.abs(transactionDetailDialog.row.ledgerDelta)) },
                  { label: "Balance", value: formatCurrency(Math.abs(transactionDetailDialog.row.balance)) },
                  { label: "Status", value: transactionDetailDialog.row.status },
                  { label: "Party Type", value: transactionDetailDialog.row.partyType },
                ].map((item) => (
                  <div key={item.label} className="flex min-h-14 items-center justify-between gap-5 border-b border-border py-3">
                    <div className="text-xs font-medium text-muted">{item.label}</div>
                    <div className="text-right text-sm font-semibold text-foreground">{item.value}</div>
                  </div>
                ))}
              </div>

              {transactionDetailDialog.mode === "history" ? (
                <div className="divide-y divide-border border-y border-border">
                  {[
                    `${transactionDetailDialog.row.displayType} ${transactionDetailDialog.row.voucherNumber} was posted on ${formatDate(transactionDetailDialog.row.voucherDate)}.`,
                    `Running balance for this party is ${formatCurrency(Math.abs(transactionDetailDialog.row.balance))}.`,
                    `${transactionDetailDialog.row.paymentStatus === "settled" ? "This transaction is settled." : "This transaction still has an outstanding balance."}`,
                  ].map((entry) => (
                    <div key={entry} className="py-2.5 text-sm text-foreground">
                      {entry}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-y border-border py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Created By</div>
                  <div className="mt-1 text-base font-semibold text-foreground">{transactionDetailDialog.row.enteredBy}</div>
                  <div className="mt-1 text-sm text-muted">
                    {transactionDetailDialog.row.paymentStatus === "settled" ? "Payment settled" : "Payment pending"}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => handleOpenVoucher(transactionDetailDialog.row)}>
                  <Pencil className="h-4 w-4" />
                  View / Edit
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="sticky top-0 z-30 border-b border-[#d8e2f0] bg-white px-0 pb-0 pt-0">
          <div data-party-page-header className="bg-white px-4 py-2.5">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2.5">
              <span
                data-party-header-badge
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                  view === "suppliers"
                    ? "border-[#f0dfc8] bg-[#fff7ef] text-primary"
                    : "border-[#d7e6fb] bg-[#eff6ff] text-[#2563eb]",
                )}
                aria-hidden="true"
              >
                {view === "suppliers" ? <Store className="h-[18px] w-[18px]" /> : <UsersRound className="h-[18px] w-[18px]" />}
              </span>
              <h1 data-party-header-title className="text-[22px] font-semibold tracking-tight text-foreground">{title}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:justify-end">
              <Button data-party-header-primary-btn className="h-11 rounded-full bg-[#eb6b20] px-6 text-[14px] font-semibold text-white hover:bg-[#d85d15]" onClick={() => handleOpenAddParty(primaryCreateType)}>
                <UserPlus className="h-4.5 w-4.5" />
                {primaryActionLabel}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                data-party-header-icon-btn
                className="h-11 w-11 rounded-full text-[#64748b] hover:bg-[#f5f8fc]"
                onClick={() => setListSettingsOpen(true)}
                aria-label="List settings"
                title="List settings"
              >
                <Settings2 className="h-5.5 w-5.5" />
              </Button>
              <div ref={actionsMenuRef} className="relative">
                <Button variant="ghost" size="icon" data-party-header-icon-btn className="h-11 w-11 rounded-full text-[#64748b] hover:bg-[#f5f8fc]" onClick={() => setActionsMenuOpen((current) => !current)} aria-label="More actions">
                  <EllipsisVertical className="h-5.5 w-5.5" />
                </Button>
                {actionsMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 rounded-xl border border-border bg-white p-2 shadow-lg">
                    {[
                      ...(view === "all" ? [{ icon: UserPlus, label: "Create Supplier", action: () => handleOpenAddParty("supplier") }] : []),
                      { icon: Wallet, label: "Receive Payment", action: () => router.push(buildVoucherRoute(mode, "receipt")) },
                      { icon: Wallet, label: "Record Payment", action: () => router.push(buildVoucherRoute(mode, "payment")) },
                      { icon: FileText, label: "Party Statement", action: () => handleExportPartyStatement() },
                      { icon: Copy, label: "Copy Summary", action: () => void handleCopySummary() },
                      { icon: Landmark, label: "Ledger", action: () => setActiveTab("ledger") },
                      { icon: Import, label: "Import", action: () => handleOpenImportPicker() },
                      { icon: Trash2, label: "Delete", action: () => handleDeleteParty() },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-canvas"
                        onClick={() => handleHeaderAction(item.action)}
                      >
                        <item.icon className="h-4 w-4 text-muted" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-px overflow-hidden bg-[#d8e2f0] xl:grid-cols-[clamp(216px,17vw,300px)_minmax(0,1fr)]">
          <section
            className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-white"
            onKeyDown={handleListKeyDown}
            tabIndex={0}
            ref={selectedListRef}
          >
            <div className="space-y-2 border-b border-[#dbe5f1] px-4 py-3">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4.5 w-4.5 -translate-y-1/2 text-[#51647f]" />
                <Input
                  id="party-list-search"
                  placeholder="Search Party Name"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-full border-[#cfd9e8] bg-white pl-10 pr-10 text-[15px] shadow-none transition focus-visible:border-[#8fb4e4] focus-visible:ring-2 focus-visible:ring-[#2563eb]/15"
                  value={partySearch}
                  onChange={(event) => setPartySearch(event.target.value)}
                />
                {partySearch ? (
                  <div className="absolute right-2.5 top-1/2 z-10 -translate-y-1/2">
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#51647f] transition hover:bg-[#eef5ff] hover:text-foreground"
                      onClick={() => setPartySearch("")}
                      aria-label="Clear party search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-3 border-t border-[#edf2f7] pt-2 text-[14px] font-semibold text-[#54657d]">
                <div>Party Name</div>
                <div className="text-right">Amount</div>
              </div>
            </div>

            <div ref={listScrollRef} className="transient-scrollbar min-h-0 max-h-full flex-1 overflow-y-auto">
              {filteredParties.length ? (
                <div style={{ height: `${virtualPartyRows.totalHeight}px` }}>
                  <div style={{ paddingTop: `${virtualPartyRows.paddingTop}px`, paddingBottom: `${virtualPartyRows.paddingBottom}px` }}>
                    {virtualPartyRows.items.map((party) => {
                      const active = party.id === selectedPartyId;
                      return (
                        <div
                          key={party.id}
                          role="button"
                          tabIndex={0}
                          data-party-id={party.id}
                          className={cn(
                            "group grid h-[48px] w-full grid-cols-[minmax(0,1fr)_84px] gap-3 border-b border-[#edf2f7] px-3 text-left transition-colors",
                            active ? "bg-[#cfe7f7]" : "bg-white hover:bg-[#f8fbff]",
                          )}
                          onClick={() => {
                            setPartyContextMenu(null);
                            setSelectedPartyId(party.id);
                          }}
                          onContextMenu={(event) => handleOpenPartyContextMenu(event, party)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setPartyContextMenu(null);
                              setSelectedPartyId(party.id);
                            }
                          }}
                        >
                          <div className="flex min-w-0 flex-col justify-center">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[14px] font-semibold text-foreground">{party.name}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end justify-center text-right">
                            <div
                              className={cn(
                                "tabular-nums text-[15px] font-semibold",
                                party.balanceDirection === "debit" ? "text-[#ff4d5a]" : "text-[#00b37a]",
                              )}
                            >
                              {formatCurrency(party.outstanding)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <EmptyState title={emptyListTitle} description={emptyListDescription} actionLabel={primaryActionLabel} onAction={() => handleOpenAddParty(primaryCreateType)} />
                </div>
              )}
            </div>

            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[#cfdbea] bg-[#f7faff] px-3 py-3">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#64748b]">Total Balance</div>
                <div className="mt-0.5 text-[11px] text-[#8a99ad]">{filteredParties.length} {filteredParties.length === 1 ? "party" : "parties"}</div>
              </div>
              <div
                className={cn(
                  "whitespace-nowrap text-right text-[16px] font-bold tabular-nums",
                  filteredPartyTotalBalance.direction === "debit" ? "text-[#ff4d5a]" : "text-[#00a875]",
                )}
              >
                {formatCurrency(filteredPartyTotalBalance.amount)}
                {filteredPartyTotalBalance.direction === "settled" ? "" : filteredPartyTotalBalance.direction === "debit" ? " Dr" : " Cr"}
              </div>
            </div>

          </section>

          <section className="flex min-h-0 h-full min-w-0 flex-col overflow-hidden rounded-none border-0 bg-white">
            {selectedParty ? (
              <>
                <div className="sticky top-0 z-20 overflow-hidden border-b border-[#d8e2f0] bg-white">
                  <div data-party-detail-header className="border-b border-[#d8e2f0] bg-white px-4 py-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-7 gap-y-2">
                        <div className="flex min-w-0 items-center gap-1">
                          <h2 data-party-detail-name className="truncate text-[20px] font-semibold text-foreground">{selectedParty.name}</h2>
                          <button
                            type="button"
                            data-party-detail-edit-btn
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-info transition hover:bg-[#f5f8fc]"
                            onClick={() => handleOpenEditParty(selectedParty)}
                            aria-label={`Edit ${selectedParty.name}`}
                          >
                            <Pencil className="h-5 w-5" />
                          </button>
                        </div>
                        <div className="min-w-[110px] text-[13px] leading-tight">
                          <div className="text-[#8a9ab2]">Phone Number</div>
                          <div className="mt-0.5 truncate font-medium text-foreground">{selectedParty.contact || "N/A"}</div>
                        </div>
                        <div className="min-w-[130px] max-w-[360px] text-[13px] leading-tight">
                          <div className="text-[#8a9ab2]">Billing Address</div>
                          <div className="mt-0.5 truncate font-medium text-foreground">{selectedParty.billingAddress || "N/A"}</div>
                        </div>
                        {moneyToMinorUnits(selectedPartyPendingPurchaseBill) > 0 ? (
                          <div className="min-w-[150px] text-[13px] leading-tight">
                            <div className="text-[#8a9ab2]">Pending Purchase Bill</div>
                            <div className="mt-0.5 truncate font-semibold text-[#c0392b]">{formatCurrency(selectedPartyPendingPurchaseBill)}</div>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {buildWhatsAppChatUrl(selectedParty.whatsappNumber || selectedParty.contact) ? (
                          <a
                            href={buildWhatsAppChatUrl(selectedParty.whatsappNumber || selectedParty.contact) ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-party-detail-action-btn
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#25D366] transition hover:bg-[#f4fff7]"
                            aria-label={`Open WhatsApp chat with ${selectedParty.name}`}
                            title={`Open WhatsApp chat with ${selectedParty.name}`}
                          >
                            <WhatsAppIcon className="h-5.5 w-5.5" />
                          </a>
                        ) : (
                          <button type="button" disabled data-party-detail-action-btn className="inline-flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full text-[#aeb9c8]" aria-label="No WhatsApp number available" title="No WhatsApp number available">
                            <WhatsAppIcon className="h-5.5 w-5.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          data-party-detail-action-btn
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#f59e0b] transition hover:bg-[#fffaf1]"
                          aria-label="Open payment actions"
                          onClick={() => setActiveTab("payments")}
                        >
                          <Wallet className="h-5.5 w-5.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto border-b border-border px-4">
                    <div className="flex min-w-max gap-1 py-1.5">
                      {workspaceTabs.map((tab) => (
                        <button
                          key={tab.value}
                          type="button"
                          className={cn(
                            "whitespace-nowrap rounded-xl px-3 py-1.5 text-[13px] font-medium transition-colors",
                            activeTab === tab.value ? "bg-[#ebf2ff] text-info" : "text-muted hover:bg-canvas hover:text-foreground",
                          )}
                          onClick={() => setActiveTab(tab.value)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {activeTab === "overview" ? (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <div className="w-full overflow-hidden border-b border-[#dce5ef] bg-white">
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e7edf4] px-5 py-4">
                        <div><div className="text-[15px] font-semibold text-foreground">Account summary</div><div className="mt-1 text-[13px] text-muted">Current position and essential party information.</div></div>
                        <div className={cn("text-right", selectedParty.creditWarning ? "text-danger" : "text-foreground")}><div className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">Outstanding</div><div className="mt-0.5 text-xl font-semibold">{formatCurrency(selectedParty.outstanding)}</div></div>
                      </div>
                      <dl className="grid md:grid-cols-2">
                        {[
                          ["Account status", selectedParty.creditWarning ? "Credit review required" : selectedParty.outstanding ? "Balance outstanding" : "Account settled"],
                          ["Transactions", `${selectedParty.transactionCount} ${selectedParty.transactionCount === 1 ? "entry" : "entries"}`],
                          ["Last transaction", selectedParty.lastTransaction ? formatDate(selectedParty.lastTransaction) : "No activity yet"],
                          ["Last payment", selectedParty.lastPayment ? formatDate(selectedParty.lastPayment) : "No payment recorded"],
                          ["Tax ID / BIN / VAT", selectedParty.taxId || "Not provided"],
                          ["Tags", selectedParty.tags.length ? selectedParty.tags.join(", ") : "No tags"],
                          ["Email", selectedParty.email || "Not provided"],
                          ["Shipping address", selectedParty.shippingAddress || "Not provided"],
                        ].map(([label, value], index) => (
                          <div key={label} className={cn("flex items-start justify-between gap-4 border-b border-[#edf2f7] px-5 py-3", index % 2 === 0 ? "md:border-r" : "")}><dt className="text-[13px] text-muted">{label}</dt><dd className="max-w-[62%] text-right text-[14px] font-medium text-foreground">{value}</dd></div>
                        ))}
                      </dl>
                      {selectedParty.notes ? <div className="border-b border-[#edf2f7] px-5 py-3 text-[14px]"><span className="mr-3 text-muted">Notes</span>{selectedParty.notes}</div> : null}
                      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
                        <Button size="sm" onClick={() => setActiveTab("outstanding")}>View outstanding</Button>
                        <Button size="sm" variant="outline" onClick={() => setActiveTab("payments")}>Payment history</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleOpenEditParty(selectedParty)}><Pencil className="mr-1.5 h-4 w-4" />Edit details</Button>
                      </div>
                    </div>
                  </div>
                ) : activeTab === "ledger" ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                    <div className="border-b border-[#e5edf7] px-4 py-3"><div className="text-[18px] font-semibold text-foreground">Ledger</div><div className="text-[13px] text-muted">Debit, credit and running balance in posting order.</div></div>
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="bg-[#f8fafc] text-[12px] uppercase tracking-[0.06em] text-[#586b84]"><tr><th className="border-b px-4 py-2.5 text-left">Date</th><th className="border-b px-4 py-2.5 text-left">Particulars</th><th className="border-b px-4 py-2.5 text-left">Voucher</th><th className="border-b px-4 py-2.5 text-right">Debit</th><th className="border-b px-4 py-2.5 text-right">Credit</th><th className="border-b px-4 py-2.5 text-right">Running balance</th></tr></thead>
                      <tbody>{filteredTransactions.length ? filteredTransactions.slice().reverse().map((entry) => {
                        const ledgerDeltaMinorUnits = moneyToMinorUnits(entry.ledgerDelta);
                        const balanceMinorUnits = moneyToMinorUnits(entry.balance);
                        const debit = ledgerDeltaMinorUnits > 0 ? entry.ledgerDelta : 0;
                        const credit = ledgerDeltaMinorUnits < 0 ? Math.abs(entry.ledgerDelta) : 0;
                        return <tr key={entry.id} className="cursor-pointer hover:bg-[#f8fbff]" onClick={() => entry.source === "voucher" && handlePreviewTransaction(entry)}><td className="border-b px-4 py-3">{formatDate(entry.voucherDate)}</td><td className="border-b px-4 py-3"><div className="font-medium">{entry.displayType}</div><div className="text-[12px] text-muted">{entry.reference}</div></td><td className="border-b px-4 py-3 font-medium text-info">{entry.voucherNumber}</td><td className="border-b px-4 py-3 text-right">{moneyToMinorUnits(debit) > 0 ? formatCurrency(debit) : "—"}</td><td className="border-b px-4 py-3 text-right">{moneyToMinorUnits(credit) > 0 ? formatCurrency(credit) : "—"}</td><td className="border-b px-4 py-3 text-right font-semibold">{formatCurrency(Math.abs(entry.balance))} {balanceMinorUnits < 0 ? "Cr" : balanceMinorUnits > 0 ? "Dr" : ""}</td></tr>;
                      }) : <tr><td colSpan={6} className="p-5"><EmptyState title="No ledger entries" description="Posted party transactions will build this ledger automatically." /></td></tr>}</tbody>
                    </table>
                  </div>
                ) : activeTab === "timeline" ? (
                  <div className="min-h-0 flex-1 overflow-auto p-4">
                    {selectedPartyTransactions.length ? (
                      <div className="relative mx-auto max-w-4xl before:absolute before:bottom-3 before:left-[5px] before:top-3 before:w-px before:bg-[#dbe5f0]">
                        {selectedPartyTransactions.slice(0, 8).map((entry) => (
                          <button type="button" key={entry.id} className="relative flex w-full items-start gap-4 py-3 text-left" onClick={() => entry.source === "voucher" && handlePreviewTransaction(entry)}>
                            <div className="z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white bg-info shadow-[0_0_0_1px_#9fc5ef]" />
                            <div className="min-w-0 flex-1 border-b border-[#edf2f7] pb-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-foreground">{entry.displayType}</span>
                                <span className="text-[15px] text-muted">{entry.voucherNumber}</span>
                                <span className="ml-auto text-right font-medium text-foreground">
                                  <span className="block">{formatCurrency(entry.total)}</span>
                                  {entry.source === "voucher" && moneyToMinorUnits(entry.ledgerDelta) === 0 && moneyToMinorUnits(entry.total) > 0 ? (
                                    <span className="mt-0.5 block text-[10px] text-[#168356]">No {entry.partyType} balance impact</span>
                                  ) : null}
                                </span>
                              </div>
                              <div className="mt-1 text-[15px] text-muted">
                                {formatDate(entry.voucherDate)} • {entry.enteredBy} • Balance {formatCurrency(Math.abs(entry.balance))}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="No timeline yet" description="Transactions and payment events for this party will appear here." />
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="flex flex-col gap-3 border-b border-[#e5edf7] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-[18px] font-semibold text-foreground">
                            <ReceiptText className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
                            {transactionSectionTitle}
                          </div>
                        </div>
                        <div className="ml-auto flex min-w-0 items-center justify-end gap-1">
                          <CollapsibleSearch
                            value={workspaceSearch}
                            onChange={setWorkspaceSearch}
                            label="Search transactions"
                            placeholder="Search party, voucher, phone, reference, invoice, amount"
                            expandedWidth="w-[280px] max-w-full"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 rounded-full bg-transparent text-[#64748b] hover:bg-[#f5f8fc] hover:text-foreground"
                            onClick={() => window.print()}
                            aria-label="Print"
                          >
                            <Printer className="h-5.5 w-5.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 rounded-full text-[#16a34a] hover:bg-[#f3fbf6] hover:text-[#15803d]"
                            onClick={() => handleExportTransactions(selectedTransactionRows.length ? selectedTransactionRows : sortedTransactions)}
                            aria-label="Export"
                          >
                            <ExcelIcon className="h-5.5 w-5.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div ref={tableScrollRef} className="transient-scrollbar min-h-0 min-w-0 flex-1 overflow-auto" onKeyDown={handleTableKeyDown} tabIndex={0}>
                      <table data-transactions-table className="min-w-full border-separate border-spacing-0 text-sm" style={{ width: `${tableMinWidth}px` }}>
                        <thead className="sticky top-0 z-10 bg-[#fbfcfe] text-[#586b84]">
                          <tr>
                            {visibleTableColumns.map((column) => {
                              const isSorted = column.id === transactionSort.columnId;
                              const isColumnFilterApplied =
                                column.filterable && column.id !== "select" && column.id !== "actions"
                                  ? isColumnFilterActive(appliedTransactionFilters, column.id as TableSortColumn)
                                  : false;
                              return (
                                <th
                                  key={`header-${column.id}`}
                                  data-table-column={column.id}
                                  className={cn(
                                    "relative border-b border-r border-[#d9e3ef] bg-[#fbfcfe] px-3 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.08em]",
                                    column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "",
                                  )}
                                  style={{ width: `${columnWidths[column.id]}px`, minWidth: `${columnWidths[column.id]}px` }}
                                >
                                  {column.id === "select" ? (
                                    <input
                                      type="checkbox"
                                      checked={pageSelectionActive}
                                      ref={(node) => {
                                        if (node) {
                                          node.indeterminate = pageSelectionPartial;
                                        }
                                      }}
                                      onChange={handleTogglePageSelection}
                                      aria-label="Select page"
                                    />
                                  ) : column.id === "actions" ? (
                                    <div ref={columnMenuRef} className="relative flex items-center justify-end">
                                      <button
                                        type="button"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#61708a] transition hover:bg-[#edf4ff] hover:text-[#1d66b1]"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setColumnMenuOpen((current) => !current);
                                        }}
                                        aria-label="Open transaction table actions"
                                        aria-expanded={columnMenuOpen}
                                      >
                                        <MoreHorizontal className="h-4.5 w-4.5" />
                                      </button>
                                      {columnMenuOpen ? (
                                        <div className="absolute right-0 top-9 z-50 w-56 rounded-2xl border border-[#d7e1ee] bg-white p-2 text-left normal-case tracking-normal shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                                          {selectedTransactionRows.length ? (
                                            <>
                                              <div className="mb-1 px-3 pb-1 pt-1 text-[12px] font-semibold text-[#64748b]">
                                                {selectedTransactionRows.length} row{selectedTransactionRows.length > 1 ? "s" : ""} selected
                                              </div>
                                              <button
                                                type="button"
                                                className="flex w-full items-center gap-2 rounded-xl bg-[#fff1f0] px-3 py-2 text-sm font-semibold text-[#b42318] transition hover:bg-[#ffe5e2]"
                                                onClick={handleDeleteSelectedTransactions}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                                Delete Selected
                                              </button>
                                              <div className="my-1 border-t border-[#e8eef5]" />
                                            </>
                                          ) : null}
                                          <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                            onClick={() => {
                                              setFilterDrawerOpen(true);
                                              setColumnMenuOpen(false);
                                            }}
                                          >
                                            <Filter className="h-4 w-4 text-muted" />
                                            Open Filters
                                          </button>
                                          <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                            onClick={() => {
                                              handleExportTransactions(selectedTransactionRows.length ? selectedTransactionRows : sortedTransactions);
                                              setColumnMenuOpen(false);
                                            }}
                                          >
                                            <Download className="h-4 w-4 text-muted" />
                                            {selectedTransactionRows.length ? "Export Selected" : "Export Visible"}
                                          </button>
                                          {selectedTransactionRows.length ? (
                                            <>
                                              <button
                                                type="button"
                                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                                onClick={() => {
                                                  setSelectedTransactionIds([]);
                                                  setColumnMenuOpen(false);
                                                }}
                                              >
                                                <X className="h-4 w-4 text-muted" />
                                                Clear Selection
                                              </button>
                                            </>
                                          ) : null}
                                          <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                            onClick={() => {
                                              window.print();
                                              setColumnMenuOpen(false);
                                            }}
                                          >
                                            <Printer className="h-4 w-4 text-muted" />
                                            Print
                                          </button>
                                          <button
                                            type="button"
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#24364f] transition hover:bg-[#f7faff]"
                                            onClick={() => {
                                              setAppliedTransactionFilters(initialTransactionFilters);
                                              setDraftTransactionFilters(initialTransactionFilters);
                                              setWorkspaceSearch("");
                                              setColumnMenuOpen(false);
                                              toast.success("Transaction filters cleared");
                                            }}
                                          >
                                            <RefreshCw className="h-4 w-4 text-muted" />
                                            Clear Filters
                                          </button>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className={cn("flex items-center gap-2", column.align === "right" ? "justify-end" : "justify-between")}>
                                      <button
                                        type="button"
                                        className="transition hover:text-[#1455a0]"
                                        onClick={() => (column.sortable ? handleToggleTransactionSort(column.id as TableSortColumn) : undefined)}
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          <span>{column.label}</span>
                                          {column.sortable ? <ArrowUpDown className={cn("h-3.5 w-3.5", isSorted ? "text-[#1455a0]" : "text-[#7a8799]")} /> : null}
                                        </span>
                                      </button>
                                      {column.filterable ? (
                                        <button
                                          type="button"
                                          className={cn(
                                            "rounded-md p-1 transition",
                                            isColumnFilterApplied ? "bg-[#edf4ff] text-[#1d66b1]" : "text-[#7a8799] hover:bg-[#edf4ff] hover:text-[#1d66b1]",
                                          )}
                                          onMouseDown={(event) => event.stopPropagation()}
                                          onClick={(event) => handleOpenColumnFilterPopover(column.id as TableSortColumn, event)}
                                          aria-label={`Filter ${column.label}`}
                                        >
                                          <Filter className="h-3.5 w-3.5" />
                                        </button>
                                      ) : null}
                                    </div>
                                  )}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {currentPageRows.length ? (
                            currentPageRows.map((row) => {
                              const isFocused = focusedTransactionId === row.id;
                              return (
                                <tr
                                  key={row.id}
                                  className={cn("cursor-pointer transition hover:bg-[#f9fbff]", isFocused ? "bg-[#eef6ff]" : "bg-white")}
                                  onClick={() => {
                                    setFocusedTransactionId(row.id);
                                    handlePreviewTransaction(row);
                                  }}
                                >
                                  {visibleTableColumns.map((column) => {
                                    const value = getCellValue(row, column.id);
                                    return (
                                      <td
                                        key={`${row.id}-${column.id}`}
                                        data-table-column={column.id}
                                        className={cn(
                                          "border-b border-r border-[#edf2f7] px-3 py-3 text-[14px] text-[#173152]",
                                          column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "",
                                        )}
                                        style={{ width: `${columnWidths[column.id]}px`, minWidth: `${columnWidths[column.id]}px` }}
                                        onContextMenu={(event) => handleCellContextMenu(event, row, column.id, value)}
                                      >
                                        {renderTransactionCell(row, column.id)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={visibleTableColumns.length} className="p-5">
                                <div className="flex min-h-[230px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[#d8e2ef] bg-white px-6 py-12 text-center">
                                  <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#fff4e8] text-[#ea7600] ring-8 ring-[#fffaf4]">
                                    <ReceiptText className="h-7 w-7" aria-hidden="true" />
                                    <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#eaf2ff] text-[#2563eb]">
                                      <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
                                    </span>
                                  </div>
                                  <p className="text-[16px] font-semibold text-[#17233d]">
                                    {selectedParty ? `No transactions found for ${selectedParty.name}` : "No transactions to show"}
                                  </p>
                                  <p className="mt-1.5 max-w-md text-[13px] leading-5 text-[#71809a]">
                                    {selectedParty
                                      ? `${selectedParty.type === "supplier" ? "Supplier" : "Customer"} transactions will appear here automatically once a voucher is recorded.`
                                      : "Select a customer or supplier to review their transaction history."}
                                  </p>
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
                      totalItems={sortedTransactions.length}
                      pageSizeOptions={pageSizeOptions}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={setPageSize}
                      summary={selectedTransactionIds.length ? `${selectedTransactionIds.length} row${selectedTransactionIds.length > 1 ? "s" : ""} selected` : undefined}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-0 flex-1 p-4">
                <EmptyState title={`Select ${view === "suppliers" ? "a supplier" : view === "customers" ? "a customer" : "a party"}`} description={emptySelectionDescription} />
              </div>
            )}
          </section>

        </div>
      </div>

      {columnFilterPopover
        ? createPortal(
            <div
              ref={columnFilterPopoverRef}
              className="fixed z-[70] w-[280px] rounded-2xl border border-[#d8e5f8] bg-white p-3 shadow-[0_20px_45px_-24px_rgba(15,23,42,0.5)]"
              style={{
                left: `${columnFilterPopover.left}px`,
                top: `${columnFilterPopover.top}px`,
                width: `${columnFilterPopover.width}px`,
                maxWidth: "calc(100vw - 24px)",
              }}
            >
            <div className="mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                {tableColumns.find((column) => column.id === columnFilterPopover.section)?.label ?? "Column"} Filter
              </div>
              <div className="mt-1 text-xs text-muted">Quick filter for this column without leaving the table.</div>
            </div>

            {columnFilterPopover.section === "voucherType" ? (
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {(["sales", "purchase", "receipt", "payment", "contra", "journal", "credit-note", "debit-note"] as VoucherType[]).map((type) => (
                  <label key={type} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-canvas/80">
                    <input
                      type="checkbox"
                      checked={draftTransactionFilters.transactionTypes.includes(type)}
                      onChange={() =>
                        setDraftTransactionFilters((current) => ({
                          ...current,
                          transactionTypes: toggleValue(current.transactionTypes, type),
                        }))
                      }
                    />
                    <span>{formatVoucherLabel(type)}</span>
                  </label>
                ))}
              </div>
            ) : null}

            {columnFilterPopover.section === "voucherNumber" ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted">Voucher number</label>
                <Input
                  value={draftTransactionFilters.voucherQuery}
                  onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, voucherQuery: event.target.value }))}
                  placeholder="Type voucher no"
                  className="h-10"
                />
              </div>
            ) : null}

            {columnFilterPopover.section === "reference" ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted">Reference</label>
                <Input
                  value={draftTransactionFilters.referenceQuery}
                  onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, referenceQuery: event.target.value }))}
                  placeholder="Type reference"
                  className="h-10"
                />
              </div>
            ) : null}

            {columnFilterPopover.section === "voucherDate" ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted">Date range</label>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                  value={draftTransactionFilters.dateRange}
                  onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, dateRange: event.target.value as PartyFilterState["dateRange"] }))}
                >
                  <option value="all">All Dates</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="this-week">This Week</option>
                  <option value="this-month">This Month</option>
                  <option value="last-month">Last Month</option>
                  <option value="current-fy">Current FY</option>
                </select>
              </div>
            ) : null}

            {columnFilterPopover.section === "total" ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted">Amount range</label>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                  value={draftTransactionFilters.amount}
                  onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, amount: event.target.value as TransactionFilterState["amount"] }))}
                >
                  <option value="all">All Amounts</option>
                  <option value="0-10000">0 - 10,000</option>
                  <option value="10000-50000">10,000 - 50,000</option>
                  <option value="50000+">50,000+</option>
                </select>
              </div>
            ) : null}

            {columnFilterPopover.section === "balance" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted">Balance type</label>
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                    value={draftTransactionFilters.balance}
                    onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, balance: event.target.value as PartyFilterState["balance"] }))}
                  >
                    <option value="all">All Balances</option>
                    <option value="outstanding">Outstanding</option>
                    <option value="paid">Paid / Settled</option>
                    <option value="credit">Credit</option>
                    <option value="debit">Debit</option>
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted">Outstanding</label>
                    <select
                      className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                      value={draftTransactionFilters.outstanding}
                      onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, outstanding: event.target.value as TransactionFilterState["outstanding"] }))}
                    >
                      <option value="all">All Rows</option>
                      <option value="with-outstanding">With Outstanding</option>
                      <option value="settled">Settled Only</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted">Payment status</label>
                    <select
                      className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                      value={draftTransactionFilters.paymentStatus}
                      onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, paymentStatus: event.target.value as TransactionFilterState["paymentStatus"] }))}
                    >
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="settled">Settled</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : null}

            {columnFilterPopover.section === "status" ? (
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {(["draft", "pending", "approved", "posted", "cancelled"] as VoucherRecord["status"][]).map((status) => (
                  <label key={status} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-canvas/80">
                    <input
                      type="checkbox"
                      checked={draftTransactionFilters.statuses.includes(status)}
                      onChange={() =>
                        setDraftTransactionFilters((current) => ({
                          ...current,
                          statuses: toggleValue(current.statuses, status),
                        }))
                      }
                    />
                    <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                  </label>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => handleClearColumnFilterPopover(columnFilterPopover.section)}>
                Clear
              </Button>
              <Button size="sm" className="bg-primary text-white hover:bg-[#cf670f]" onClick={handleApplyColumnFilterPopover}>
                Apply
              </Button>
            </div>
            </div>,
            document.body,
          )
        : null}

      <ConfirmationDialog
        open={Boolean(confirmationDialog)}
        onOpenChange={handleConfirmDialogOpenChange}
        title={
          confirmationDialog?.kind === "delete-party"
            ? "Delete party?"
            : confirmationDialog?.kind === "delete-transaction"
              ? "Delete transaction?"
              : confirmationDialog?.kind === "delete-selected-transactions"
                ? "Delete selected transactions?"
                : "Confirm action"
        }
        description={
          confirmationDialog?.kind === "delete-party"
            ? `${confirmationDialog.partyName} will be removed from the current list.`
            : confirmationDialog?.kind === "delete-transaction"
              ? `Voucher ${confirmationDialog.voucherNumber} will be removed from the transaction list.`
              : confirmationDialog?.kind === "delete-selected-transactions"
                ? `${confirmationDialog.voucherIds.length} selected transaction${confirmationDialog.voucherIds.length > 1 ? "s" : ""} will be removed.`
                : "Please confirm this action."
        }
        confirmLabel={
          confirmationDialog?.kind === "delete-party"
            ? "Delete Party"
            : confirmationDialog?.kind === "delete-selected-transactions"
              ? "Delete Selected"
              : "Delete Transaction"
        }
        tone="danger"
        onConfirm={handleConfirmDialogAction}
      />

      {partyContextMenu
        ? createPortal(
            <div
              ref={partyContextMenuRef}
              className="fixed z-[70] w-48 rounded-xl border border-border bg-white p-2 shadow-xl"
              style={{ left: `${partyContextMenu.left}px`, top: `${partyContextMenu.top}px` }}
            >
              {(() => {
                const targetParty = partySummaries.find((party) => party.id === partyContextMenu.partyId) ?? null;

                if (!targetParty) {
                  return <div className="px-3 py-2 text-sm text-muted">Party not found</div>;
                }

                return (
                  <>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-canvas"
                      onClick={() => {
                        setPartyContextMenu(null);
                        handleOpenEditParty(targetParty);
                      }}
                    >
                      <Pencil className="h-4 w-4 text-muted" />
                      Edit Party
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-danger transition hover:bg-red-50"
                      onClick={() => handleDeleteParty(targetParty.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Party
                    </button>
                  </>
                );
              })()}
            </div>,
            document.body,
          )
        : null}

      {transactionActionMenu && activeTransactionActionRow
        ? createPortal(
            <div
              ref={transactionActionMenuRef}
              className="fixed z-[70] w-56 rounded-xl border border-border bg-white p-2 shadow-xl"
              style={{ left: `${transactionActionMenu.left}px`, top: `${transactionActionMenu.top}px` }}
            >
          {getTransactionActionItems(activeTransactionActionRow).map((item) => (
            <button
              key={item.label}
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-canvas"
              onClick={item.action}
            >
              <item.icon className="h-4 w-4 text-muted" />
              {item.label}
            </button>
          ))}
            </div>,
            document.body,
          )
        : null}

      {contextMenu ? (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default bg-transparent" onClick={() => setContextMenu(null)} aria-label="Close menu" />
          <div className="fixed z-50 min-w-[200px] rounded-xl border border-border bg-white p-2 shadow-xl" style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}>
            <button type="button" className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-canvas" onClick={() => void handleCopyCell(contextMenu.value)}>
              Copy Cell
            </button>
            <button
              type="button"
              className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-canvas"
              onClick={() => handleExportTransactions(selectedTransactionRows.length ? selectedTransactionRows : sortedTransactions)}
            >
              Export Visible
            </button>
            {tableColumns.some((column) => column.id === contextMenu.columnId && column.hideable) ? (
              <button
                type="button"
                className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-canvas"
                onClick={() => {
                  handleToggleColumnVisibility(contextMenu.columnId);
                  setContextMenu(null);
                }}
              >
                Hide Column
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <PartyFormDialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) {
            setResumeAddDialogAfterSettings(false);
            setEditingPartyId(null);
            setPartyDialogSeed(createDefaultPartyFormState(dialogPartyType));
          }
        }}
        mode={mode}
        workspaceId={workspaceId}
        seed={partyDialogSeed}
        editingParty={editingParty}
        summary={
          editingPartySummary
            ? {
                outstanding: editingPartySummary.outstanding,
                transactionCount: editingPartySummary.transactionCount,
                status: editingPartySummary.status,
              }
            : null
        }
        settings={settingsState}
        onSettingsChange={setSettingsState}
        onOpenSettings={handleOpenPartySettings}
        onSaved={handlePartySaved}
        onTypeChange={setDialogPartyType}
      />

      <div className={cn("fixed inset-0 z-40 bg-[#0f172a]/28 transition-opacity", filterDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0")} onClick={() => setFilterDrawerOpen(false)}>
        <aside
          className={cn(
            "absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col border-l border-border bg-white shadow-xl transition-transform",
            filterDrawerOpen ? "translate-x-0" : "translate-x-full",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground">
                {filterDrawerSection === "advanced" ? "Transaction Filters" : `${tableColumns.find((column) => column.id === filterDrawerSection)?.label ?? "Filter"} Filter`}
              </h3>
              <p className="mt-1 text-sm text-muted">Compact accounting filters for party lists, vouchers, balances, and ownership.</p>
            </div>
            <button type="button" className="rounded-full p-2 text-muted hover:bg-canvas" onClick={() => setFilterDrawerOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="transient-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {view === "all" ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Party Type</div>
                {(["customer", "supplier"] as const).map((type) => (
                  <label key={type} className="flex items-center gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={draftFilters.partyTypes.includes(type)}
                      onChange={(event) =>
                        setDraftFilters((current) => ({
                          ...current,
                          partyTypes: event.target.checked ? [...current.partyTypes, type] : current.partyTypes.filter((entry) => entry !== type),
                        }))
                      }
                    />
                    {type === "customer" ? "Customer" : "Supplier"}
                  </label>
                ))}
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Transaction Type</div>
              {(["sales", "purchase", "receipt", "payment", "contra", "journal", "credit-note", "debit-note"] as VoucherType[]).map((type) => (
                <label key={type} className="flex items-center gap-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={draftTransactionFilters.transactionTypes.includes(type)}
                    onChange={(event) =>
                      setDraftTransactionFilters((current) => ({
                        ...current,
                        transactionTypes: event.target.checked
                          ? [...current.transactionTypes, type]
                          : current.transactionTypes.filter((entry) => entry !== type),
                      }))
                    }
                  />
                  {formatVoucherLabel(type)}
                </label>
              ))}
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Balance</div>
              <select
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
                value={draftTransactionFilters.balance}
                onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, balance: event.target.value as PartyFilterState["balance"] }))}
              >
                <option value="all">All Balances</option>
                <option value="outstanding">Outstanding</option>
                <option value="paid">Paid / Settled</option>
                <option value="credit">Credit</option>
                <option value="debit">Debit</option>
              </select>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Party Review</div>
              {(["active", "inactive", "over-credit"] as const).map((status) => (
                <label key={status} className="flex items-center gap-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={draftFilters.statuses.includes(status)}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        statuses: event.target.checked ? [...current.statuses, status] : current.statuses.filter((entry) => entry !== status),
                      }))
                    }
                  />
                  {status === "over-credit" ? "Over Credit Limit" : status.charAt(0).toUpperCase() + status.slice(1)}
                </label>
              ))}
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Date</div>
              <select
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
                value={draftTransactionFilters.dateRange}
                onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, dateRange: event.target.value as PartyFilterState["dateRange"] }))}
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="this-week">This Week</option>
                <option value="this-month">This Month</option>
                <option value="last-month">Last Month</option>
                <option value="current-fy">Current FY</option>
              </select>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Created By</div>
              <select
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
                value={draftTransactionFilters.createdBy}
                onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, createdBy: event.target.value }))}
              >
                <option value="all">All Users</option>
                {enteredByOptions.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Amount</div>
              <select
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
                value={draftTransactionFilters.amount}
                onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, amount: event.target.value as TransactionFilterState["amount"] }))}
              >
                <option value="all">All Amounts</option>
                <option value="0-10000">0 - 10,000</option>
                <option value="10000-50000">10,000 - 50,000</option>
                <option value="50000+">50,000+</option>
              </select>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Voucher Status</div>
              {(["draft", "pending", "approved", "posted", "cancelled"] as VoucherRecord["status"][]).map((status) => (
                <label key={status} className="flex items-center gap-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={draftTransactionFilters.statuses.includes(status)}
                    onChange={() =>
                      setDraftTransactionFilters((current) => ({
                        ...current,
                        statuses: toggleValue(current.statuses, status),
                      }))
                    }
                  />
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </label>
              ))}
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Outstanding</div>
              <select
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
                value={draftTransactionFilters.outstanding}
                onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, outstanding: event.target.value as TransactionFilterState["outstanding"] }))}
              >
                <option value="all">All Rows</option>
                <option value="with-outstanding">With Outstanding</option>
                <option value="settled">Settled Only</option>
              </select>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Payment Status</div>
              <select
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
                value={draftTransactionFilters.paymentStatus}
                onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, paymentStatus: event.target.value as TransactionFilterState["paymentStatus"] }))}
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="settled">Settled</option>
              </select>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Voucher No</div>
              <Input
                value={draftTransactionFilters.voucherQuery}
                onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, voucherQuery: event.target.value }))}
                placeholder="Filter by voucher number"
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Reference</div>
              <Input
                value={draftTransactionFilters.referenceQuery}
                onChange={(event) => setDraftTransactionFilters((current) => ({ ...current, referenceQuery: event.target.value }))}
                placeholder="Filter by reference"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
            <Button
              variant="outline"
              onClick={() => {
                setDraftFilters(initialPartyFilters);
                setAppliedFilters(initialPartyFilters);
                setDraftTransactionFilters(initialTransactionFilters);
                setAppliedTransactionFilters(initialTransactionFilters);
                toast.success("Filters reset");
              }}
            >
              Reset
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSavedFilterCount((current) => current + 1);
                toast.success("Filter preset saved for this session");
              }}
            >
              Save Filter
            </Button>
          </div>
        </aside>
      </div>

      <div
        className={cn("fixed inset-0 z-40 bg-[#0f172a]/28 transition-opacity", listSettingsOpen ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={() => setListSettingsOpen(false)}
      >
        <aside
          className={cn(
            "absolute inset-y-0 right-0 flex w-full max-w-[380px] flex-col border-l border-border bg-white shadow-xl transition-transform",
            listSettingsOpen ? "translate-x-0" : "translate-x-full",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground">List Settings</h3>
              <p className="text-xs text-muted">How this screen shows data — nothing here changes a party record.</p>
            </div>
            <button type="button" className="rounded-full p-2 text-muted hover:bg-canvas" onClick={() => setListSettingsOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="transient-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Transaction Columns</div>
              {tableColumns
                .filter((column) => column.hideable)
                .map((column) => (
                  <label
                    key={`list-column-${column.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-2.5 text-sm font-medium text-foreground"
                  >
                    <span className="min-w-0 truncate">{column.label}</span>
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={columnVisibility[column.id]}
                      onChange={() => handleToggleColumnVisibility(column.id)}
                    />
                  </label>
                ))}
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Rows Per Page</div>
              <select
                className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} per page
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-border px-5 py-4">
            <Button variant="outline" className="w-full" onClick={handleResetTableLayout}>
              Reset Table Layout
            </Button>
          </div>
        </aside>
      </div>

      <div className={cn("fixed inset-0 z-40 bg-[#0f172a]/28 transition-opacity", settingsDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0")} onClick={handleClosePartySettings}>
        <aside
          className={cn(
            "absolute inset-y-0 right-0 flex w-full max-w-[380px] flex-col border-l border-border bg-white shadow-xl transition-transform",
            settingsDrawerOpen ? "translate-x-0" : "translate-x-full",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-xl font-semibold text-foreground">{settingsEntityLabel} Settings</h3>
            <button type="button" className="rounded-full p-2 text-muted hover:bg-canvas" onClick={handleClosePartySettings}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="transient-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <div className="space-y-4">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">General</div>
              {[
                { key: "grouping", label: `${settingsEntityLabel} Grouping` },
                { key: "shippingAddress", label: "Shipping Address" },
                { key: "manageStatus", label: `Manage ${settingsEntityLabel} Status` },
                { key: "paymentReminder", label: "Enable Payment Reminder" },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={settingsState[item.key as keyof PartySettingsState] as boolean}
                    onChange={(event) =>
                      setSettingsState((current) => ({
                        ...current,
                        [item.key]: event.target.checked,
                      }))
                    }
                  />
                  {item.label}
                </label>
              ))}
              {settingsState.paymentReminder ? (
                <div className="space-y-2 pl-7">
                  <label className="text-sm text-muted">Remind me for payment due in</label>
                  <div className="flex items-center gap-3">
                    <Input
                      value={settingsState.reminderDays}
                      onChange={(event) => setSettingsState((current) => ({ ...current, reminderDays: event.target.value }))}
                    />
                    <span className="text-sm text-muted">(Days)</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-foreground">Additional {settingsEntityLabel} Fields</div>
              {settingsState.additionalFields.map((field, index) => (
                <div key={`settings-field-${index}`} className="space-y-3 rounded-2xl border border-border p-4">
                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={field.enabled}
                      onChange={(event) =>
                        setSettingsState((current) => ({
                          ...current,
                          additionalFields: current.additionalFields.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, enabled: event.target.checked } : entry,
                          ),
                        }))
                      }
                    />
                    {field.label.trim() || `${settingsEntityLabel} Field ${index + 1}`}
                  </label>
                  <Input
                    placeholder="Enter field name"
                    value={field.label}
                    onChange={(event) =>
                      setSettingsState((current) => ({
                        ...current,
                        additionalFields: current.additionalFields.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, label: event.target.value } : entry,
                        ),
                      }))
                    }
                  />
                  <div className="flex items-center justify-between text-sm text-muted">
                    <span>Show in Print</span>
                    <button
                      type="button"
                      className={cn(
                        "relative h-6 w-11 rounded-full transition-colors",
                        field.print ? "bg-info" : "bg-[#dfe5ec]",
                      )}
                      onClick={() =>
                        setSettingsState((current) => ({
                          ...current,
                          additionalFields: current.additionalFields.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, print: !entry.print } : entry,
                          ),
                        }))
                      }
                    >
                      <span
                        className={cn(
                          "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform",
                          field.print ? "left-6" : "left-1",
                        )}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
