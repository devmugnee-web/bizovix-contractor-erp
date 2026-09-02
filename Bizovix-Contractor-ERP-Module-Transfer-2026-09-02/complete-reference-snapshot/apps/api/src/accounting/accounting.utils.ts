import {
  PartyType,
  DiscountType,
  SettlementMode,
  VoucherEntryStatus,
  VoucherEntryType,
  type Prisma,
} from "../generated/prisma/index.js";
import { moneyEquals, roundMoney, sumMoney } from "./money.util.js";

type VoucherEntryWithRelations = Prisma.VoucherEntryGetPayload<{
  include: {
    lines: true;
    warehouse: true;
    inventoryItems: {
      include: {
        inventoryItem: true;
        warehouse: true;
      };
    };
  };
}>;

export interface TrialBalanceRowView {
  id: string;
  accountId?: string;
  ledger: string;
  group: string;
  debit: number;
  credit: number;
}

export interface TrialBalanceAccountIdentity {
  id: string;
  code: string;
  name: string;
  nature: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "DIRECT_EXPENSE" | "INDIRECT_EXPENSE";
  parentId: string | null;
  bankDetails?: Prisma.JsonValue | null;
  accountGroup?: { code: string } | null;
}

export interface InventorySnapshotAdjustment {
  id: string;
  quantity: number;
  unitPrice: number;
  note: string | null;
  reason: string | null;
  adjustmentDate: string;
}

export interface InventorySnapshotRow {
  id: string;
  itemCode: string;
  itemName: string;
  kind: "product" | "service";
  alias: string;
  category: string;
  categoryId: string | null;
  unit: string;
  alternateUnit: string;
  alternateUnitConversion: number;
  description: string;
  languageAlias: string;
  partNumber: string;
  notes: string;
  openingQty: number;
  quantity: number;
  rate: number;
  reorderLevel: number;
  expiryDate: string | null;
  status: "active" | "inactive";
  adjustments: InventorySnapshotAdjustment[];
}

export function mapSettlementModeOutput(value: SettlementMode | null) {
  if (!value) {
    return null;
  }

  if (value === SettlementMode.CASH) return "cash";
  if (value === SettlementMode.BANK) return "bank";
  return "accounts-payable";
}

export function mapDiscountTypeOutput(value: DiscountType | null) {
  if (!value) {
    return null;
  }

  return value === DiscountType.PERCENT ? "percent" : "fixed";
}

export function mapVoucherTypeInput(value: string) {
  const map: Record<string, VoucherEntryType> = {
    contra: VoucherEntryType.CONTRA,
    payment: VoucherEntryType.PAYMENT,
    receipt: VoucherEntryType.RECEIPT,
    journal: VoucherEntryType.JOURNAL,
    sales: VoucherEntryType.SALES,
    purchase: VoucherEntryType.PURCHASE,
    expense: VoucherEntryType.EXPENSE,
    revenue: VoucherEntryType.REVENUE,
    "credit-note": VoucherEntryType.CREDIT_NOTE,
    "debit-note": VoucherEntryType.DEBIT_NOTE,
    quotation: VoucherEntryType.QUOTATION,
    "proforma-invoice": VoucherEntryType.PROFORMA_INVOICE,
    "sales-order": VoucherEntryType.SALES_ORDER,
    "delivery-note": VoucherEntryType.DELIVERY_NOTE,
    "purchase-order": VoucherEntryType.PURCHASE_ORDER,
    "receipt-note": VoucherEntryType.RECEIPT_NOTE,
  };

  return map[value];
}

export function mapVoucherTypeOutput(value: VoucherEntryType) {
  const map: Record<VoucherEntryType, string> = {
    [VoucherEntryType.CONTRA]: "contra",
    [VoucherEntryType.PAYMENT]: "payment",
    [VoucherEntryType.RECEIPT]: "receipt",
    [VoucherEntryType.JOURNAL]: "journal",
    [VoucherEntryType.SALES]: "sales",
    [VoucherEntryType.PURCHASE]: "purchase",
    [VoucherEntryType.EXPENSE]: "expense",
    [VoucherEntryType.REVENUE]: "revenue",
    [VoucherEntryType.CREDIT_NOTE]: "credit-note",
    [VoucherEntryType.DEBIT_NOTE]: "debit-note",
    [VoucherEntryType.QUOTATION]: "quotation",
    [VoucherEntryType.PROFORMA_INVOICE]: "proforma-invoice",
    [VoucherEntryType.SALES_ORDER]: "sales-order",
    [VoucherEntryType.DELIVERY_NOTE]: "delivery-note",
    [VoucherEntryType.PURCHASE_ORDER]: "purchase-order",
    [VoucherEntryType.RECEIPT_NOTE]: "receipt-note",
  };

  return map[value];
}

/** The Users & Roles permission matrix only covers the sales-side/general
 * voucher types below — it has no row for Purchase, Purchase Order, Receipt
 * Note, Debit Note, Contra, or Journal. For those, callers must fall back to
 * the coarse accounting.voucher.create/post/delete keys instead of this
 * mapping, exactly as before this fine-grained matrix existed. */
export function mapVoucherTypeToPermissionResource(value: VoucherEntryType): string | null {
  const map: Partial<Record<VoucherEntryType, string>> = {
    [VoucherEntryType.SALES]: "sale",
    [VoucherEntryType.RECEIPT]: "payment_in",
    [VoucherEntryType.SALES_ORDER]: "sale_order",
    [VoucherEntryType.CREDIT_NOTE]: "credit_note",
    [VoucherEntryType.DELIVERY_NOTE]: "delivery_challan",
    [VoucherEntryType.QUOTATION]: "estimate",
    [VoucherEntryType.EXPENSE]: "expense",
    [VoucherEntryType.PROFORMA_INVOICE]: "proforma",
  };

  return map[value] ?? null;
}

export function mapVoucherStatusInput(value: string) {
  const map: Record<string, VoucherEntryStatus> = {
    draft: VoucherEntryStatus.DRAFT,
    pending: VoucherEntryStatus.PENDING,
    approved: VoucherEntryStatus.APPROVED,
    posted: VoucherEntryStatus.POSTED,
    rejected: VoucherEntryStatus.REJECTED,
    cancelled: VoucherEntryStatus.CANCELLED,
    reversed: VoucherEntryStatus.REVERSED,
    "superseded-by-alteration": VoucherEntryStatus.SUPERSEDED_BY_ALTERATION,
  };

  return map[value];
}

export function mapVoucherStatusOutput(value: VoucherEntryStatus) {
  const map: Record<VoucherEntryStatus, string> = {
    [VoucherEntryStatus.DRAFT]: "draft",
    [VoucherEntryStatus.PENDING]: "pending",
    [VoucherEntryStatus.APPROVED]: "approved",
    [VoucherEntryStatus.POSTED]: "posted",
    [VoucherEntryStatus.REJECTED]: "rejected",
    [VoucherEntryStatus.CANCELLED]: "cancelled",
    [VoucherEntryStatus.REVERSED]: "reversed",
    [VoucherEntryStatus.SUPERSEDED_BY_ALTERATION]: "superseded-by-alteration",
  };

  return map[value];
}

export function mapSettlementModeInput(value?: string | null) {
  if (!value) {
    return null;
  }

  if (value === "cash") return SettlementMode.CASH;
  if (value === "bank") return SettlementMode.BANK;
  return SettlementMode.ACCOUNTS_PAYABLE;
}

export function mapDiscountTypeInput(value?: string | null) {
  if (!value) {
    return null;
  }

  return value === "percent" ? DiscountType.PERCENT : DiscountType.FIXED;
}

export function mapPartyTypeFromVoucherType(voucherType: VoucherEntryType): PartyType | null {
  if (
    voucherType === VoucherEntryType.PURCHASE ||
    voucherType === VoucherEntryType.PAYMENT ||
    voucherType === VoucherEntryType.DEBIT_NOTE
  ) {
    return PartyType.SUPPLIER;
  }

  if (
    voucherType === VoucherEntryType.SALES ||
    voucherType === VoucherEntryType.RECEIPT ||
    voucherType === VoucherEntryType.CREDIT_NOTE
  ) {
    return PartyType.CUSTOMER;
  }

  return null;
}

function voucherNumberPrefix(voucherType: VoucherEntryType, documentKind?: string | null) {
  const prefixMap: Record<VoucherEntryType, string> = {
    [VoucherEntryType.CONTRA]: "CN",
    [VoucherEntryType.PAYMENT]: "PV",
    [VoucherEntryType.RECEIPT]: "RV",
    [VoucherEntryType.JOURNAL]: "JV",
    [VoucherEntryType.SALES]: "SI",
    [VoucherEntryType.PURCHASE]: "PI",
    [VoucherEntryType.EXPENSE]: "EX",
    [VoucherEntryType.REVENUE]: "RE",
    [VoucherEntryType.CREDIT_NOTE]: "SR",
    [VoucherEntryType.DEBIT_NOTE]: "PR",
    [VoucherEntryType.QUOTATION]: "QT",
    [VoucherEntryType.PROFORMA_INVOICE]: "PF",
    [VoucherEntryType.SALES_ORDER]: "SO",
    [VoucherEntryType.DELIVERY_NOTE]: "DN",
    [VoucherEntryType.PURCHASE_ORDER]: "PO",
    [VoucherEntryType.RECEIPT_NOTE]: "GRN",
  };

  const purchasePrefix = documentKind === "purchase-order" ? "PO" : documentKind === "receipt-note" ? "GRN" : "PB";
  const salesPrefix =
    documentKind === "quotation"
      ? "QT"
      : documentKind === "proforma"
        ? "PF"
        : documentKind === "sale-order"
          ? "SO"
          : documentKind === "delivery-note"
            ? "DN"
            : "SI";
  const prefix =
    voucherType === VoucherEntryType.PURCHASE
      ? purchasePrefix
      : voucherType === VoucherEntryType.SALES
        ? salesPrefix
        : prefixMap[voucherType];
  return prefix;
}

export function voucherNumberStem(voucherType: VoucherEntryType, voucherDate: Date, documentKind?: string | null) {
  const period = `${voucherDate.getUTCFullYear().toString().slice(-2)}${String(voucherDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${voucherNumberPrefix(voucherType, documentKind)}-${period}-`;
}

export function nextVoucherNumber(
  previousNumbers: string | string[] | null,
  voucherType: VoucherEntryType,
  voucherDate: Date,
  documentKind?: string | null,
) {
  const stem = voucherNumberStem(voucherType, voucherDate, documentKind);
  const numbers = Array.isArray(previousNumbers) ? previousNumbers : previousNumbers ? [previousNumbers] : [];
  const highestSequence = numbers.reduce((highest, voucherNumber) => {
    if (!voucherNumber.startsWith(stem)) return highest;
    const suffix = voucherNumber.slice(stem.length);
    if (!/^\d+$/.test(suffix)) return highest;
    const sequence = Number(suffix);
    return Number.isSafeInteger(sequence) ? Math.max(highest, sequence) : highest;
  }, 100);

  return `${stem}${String(highestSequence + 1).padStart(5, "0")}`;
}

export function getLedgerGroup(ledger: string) {
  const key = ledger.toLowerCase();
  if (key.includes("purchase bill pending") || key.includes("goods received not invoiced") || key.includes("grni")) {
    return "Sundry Creditors";
  }
  if (key.includes("inventory delivered pending invoice")) {
    return "Current Assets";
  }
  if (key.includes("inventory control") || key.includes("stock in hand") || key.includes("closing stock")) {
    return "Current Assets";
  }
  if (key.includes("cost of goods sold") || key.includes("cost of sales")) {
    return "Direct Expenses";
  }
  if (key.includes("cash")) {
    return "Cash-in-Hand";
  }
  if (key.includes("bank") || key.includes("mobile financial")) {
    return "Bank Accounts";
  }
  if (key.includes("sales")) {
    return "Revenue";
  }
  if (key.includes("purchase") || key.includes("stock")) {
    return "Direct Expenses";
  }
  if (key.includes("receivable") || key.includes("customer")) {
    return "Sundry Debtors";
  }
  if (key.includes("payable") || key.includes("supplier")) {
    return "Sundry Creditors";
  }
  return "General Ledger";
}

export function toDayBookRecord(entry: VoucherEntryWithRelations) {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    voucherType: mapVoucherTypeOutput(entry.voucherType),
    documentKind: entry.documentKind ?? null,
    sourceVoucherId: entry.sourceVoucherId ?? null,
    workflowOrigin: entry.workflowOrigin,
    reversalOfId: entry.reversalOfId ?? null,
    warehouseId: entry.warehouseId ?? null,
    warehouse: entry.warehouse ? { id: entry.warehouse.id, name: entry.warehouse.name, code: entry.warehouse.code } : null,
    voucherNumber: entry.voucherNumber,
    voucherDate: entry.voucherDate.toISOString().slice(0, 10),
    // Distinct from voucherDate (the transaction date the user picked, often the same
    // day for a batch of entries) — this is when the row actually landed in the system,
    // used to break same-date ties so the most recently added row shows first.
    createdAt: entry.createdAt.toISOString(),
    partyName: entry.partyName,
    partyId: entry.partyId ?? null,
    particulars: entry.narration ?? `${mapVoucherTypeOutput(entry.voucherType)} voucher`,
    debit: roundMoney(entry.debit),
    credit: roundMoney(entry.credit),
    amount: roundMoney(entry.totalAmount),
    status: mapVoucherStatusOutput(entry.status),
    enteredBy: "Accounts Officer",
    reference: entry.reference ?? undefined,
    narration: entry.narration ?? undefined,
    settlementMode: mapSettlementModeOutput(entry.settlementMode),
    paidAmount: entry.paidAmount === null ? null : roundMoney(entry.paidAmount),
    supplierAddress: entry.supplierAddress ?? "",
    condition: entry.condition ?? "",
    buyerSignature: entry.buyerSignature ?? "",
    sellerSignature: entry.sellerSignature ?? "",
    attachmentImageUrl: entry.attachmentImageUrl ?? "",
    attachmentDocumentUrl: entry.attachmentDocumentUrl ?? "",
    attachmentDocumentName: entry.attachmentDocumentName ?? "",
    discountType: mapDiscountTypeOutput(entry.discountType),
    discountAmount: entry.discountAmount === null ? null : roundMoney(entry.discountAmount),
    loyaltyPointsEarned: entry.loyaltyPointsEarned ?? 0,
    loyaltyPointsRedeemed: entry.loyaltyPointsRedeemed ?? 0,
    loyaltyDiscountAmount: roundMoney(entry.loyaltyDiscountAmount),
    subtotal: entry.subtotal === null ? null : roundMoney(entry.subtotal),
    currency: entry.currency,
    inventoryItems: entry.inventoryItems.map((item) => ({
      id: item.id,
      sourceInventoryLineId: item.sourceInventoryLineId ?? null,
      manufacturingInventoryLotId: item.manufacturingInventoryLotId ?? null,
      manufacturingSerialIds: item.manufacturingSerialIds,
      inventoryItemId: item.inventoryItemId,
      warehouseId: item.warehouseId ?? null,
      warehouse: item.warehouse ? { id: item.warehouse.id, name: item.warehouse.name, code: item.warehouse.code } : null,
      itemName: item.itemName,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    })),
    lines: entry.lines.map((line) => ({
      id: line.id,
      accountId: line.accountId ?? undefined,
      ledger: line.ledger,
      description: line.description ?? "",
      debit: roundMoney(line.debit),
      credit: roundMoney(line.credit),
      costCenter: line.costCenter ?? undefined,
      project: line.project ?? undefined,
      billReference: line.billReference ?? undefined,
    })),
  };
}

export function buildTrialBalance(
  entries: Array<VoucherEntryWithRelations>,
  accounts: Array<TrialBalanceAccountIdentity> = [],
) {
  const rows = new Map<string, TrialBalanceRowView>();
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const accountGroup = (accountId: string): string | null => {
    const account = accountsById.get(accountId);
    if (!account) return null;
    const groupCode = account.accountGroup?.code;
    const groupByCode: Record<string, string> = {
      CASH: "Cash-in-Hand",
      BANK: "Bank Accounts",
      AR: "Sundry Debtors",
      AP: "Sundry Creditors",
      INVENTORY: "Current Assets",
      CURRENT_ASSET: "Current Assets",
      FIXED_ASSET: "Fixed Assets",
      SALES_REVENUE: "Revenue",
      INCOME: "Revenue",
      PURCHASE_COST: "Direct Expenses",
      DIRECT_EXPENSE: "Direct Expenses",
      INDIRECT_EXPENSE: "Indirect Expenses",
      CAPITAL: "Equity",
      EQUITY: "Equity",
      LIABILITY: "Current Liabilities",
    };
    if (groupCode && groupByCode[groupCode]) return groupByCode[groupCode];

    const ancestryCodes: string[] = [];
    let current: TrialBalanceAccountIdentity | undefined = account;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      ancestryCodes.push(current.code);
      current = current.parentId ? accountsById.get(current.parentId) : undefined;
    }
    const details = account.bankDetails;
    const accountKind = details && typeof details === "object" && !Array.isArray(details)
      ? String((details as Record<string, unknown>).accountKind ?? "")
      : "";
    if (accountKind === "MFS" || ancestryCodes.includes("1222200")) return "Bank Accounts";
    if (accountKind === "BANK" || ancestryCodes.includes("1222100")) return "Bank Accounts";
    if (ancestryCodes.includes("1221000")) return "Cash-in-Hand";
    if (ancestryCodes.includes("1231000")) return "Sundry Debtors";
    if (ancestryCodes.includes("2211000") || ancestryCodes.includes("2212000")) return "Sundry Creditors";
    if (ancestryCodes.includes("1100000")) return "Fixed Assets";
    if (account.nature === "ASSET") return "Current Assets";
    if (account.nature === "LIABILITY") return "Current Liabilities";
    if (account.nature === "EQUITY") return "Equity";
    if (account.nature === "INCOME") return "Revenue";
    if (account.nature === "DIRECT_EXPENSE") return "Direct Expenses";
    if (account.nature === "INDIRECT_EXPENSE") return "Indirect Expenses";
    return null;
  };
  const isReceiptNote = (entry: VoucherEntryWithRelations) =>
    entry.voucherType === VoucherEntryType.RECEIPT_NOTE ||
    (entry.voucherType === VoucherEntryType.PURCHASE && entry.documentKind === "receipt-note");
  const isPurchaseOrder = (entry: VoucherEntryWithRelations) =>
    entry.voucherType === VoucherEntryType.PURCHASE_ORDER ||
    (entry.voucherType === VoucherEntryType.PURCHASE && entry.documentKind === "purchase-order");
  const receiptNoteIds = new Set(entries.filter(isReceiptNote).map((entry) => entry.id));
  const reversedOriginalIds = new Set(
    entries
      .map((entry) => entry.reversalOfId)
      .filter((entryId): entryId is string => Boolean(entryId)),
  );

  // Group by the stable accountId when a line has one — the same account can
  // pick up a different `ledger` name snapshot across vouchers (a rename, or
  // simply a different label chosen from the ledger dropdown on entry), which
  // would otherwise split one real account into multiple rows here. Falls
  // back to the name string only for legacy/free-text lines with no
  // accountId. Mirrors src/lib/erp-data.ts's getTrialBalanceRows, which the
  // frontend's own Trial Balance / Balance Sheet reports already rely on.
  const addLine = (ledger: string, debit: number, credit: number, group?: string | null, accountId?: string | null) => {
    // A party that both buys from us and sells to us posts under a single name.
    // On legacy lines that carry no accountId the name alone would fold that
    // party's receivable into its payable row (whichever voucher was seen
    // first wins the group), so the control group joins the key. Only the two
    // party control groups split - every other ledger keeps one row per name.
    const stableAccountId = accountId?.trim() || undefined;
    const partyGroupKey = group === "Sundry Creditors" || group === "Sundry Debtors" ? `${group}:` : "";
    const key = stableAccountId ? `account:${stableAccountId}` : `ledger:${partyGroupKey}${ledger}`;
    const current = rows.get(key) ?? {
      id: stableAccountId
        ? `tb-account-${stableAccountId}`
        : `tb-${`${partyGroupKey}${ledger}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      accountId: stableAccountId,
      ledger,
      group: group || getLedgerGroup(ledger),
      debit: 0,
      credit: 0,
    };
    current.debit = sumMoney([current.debit, debit]);
    current.credit = sumMoney([current.credit, credit]);
    rows.set(key, current);
  };

  const addPersistedLines = (entry: VoucherEntryWithRelations) => {
    entry.lines.forEach((line) => {
      const stableAccountId = line.accountId?.trim() || null;
      const currentAccount = stableAccountId ? accountsById.get(stableAccountId) : undefined;
      const displayLedger = currentAccount?.name ?? line.ledger;
      const isLegacyPartyLedger = !stableAccountId && line.ledger.trim().toLowerCase() === entry.partyName?.trim().toLowerCase();
      const partyGroup =
        entry.voucherType === VoucherEntryType.PURCHASE ||
        entry.voucherType === VoucherEntryType.PURCHASE_ORDER ||
        entry.voucherType === VoucherEntryType.RECEIPT_NOTE ||
        entry.voucherType === VoucherEntryType.PAYMENT ||
        entry.voucherType === VoucherEntryType.DEBIT_NOTE
          ? "Sundry Creditors"
          : entry.voucherType === VoucherEntryType.SALES ||
              entry.voucherType === VoucherEntryType.SALES_ORDER ||
              entry.voucherType === VoucherEntryType.DELIVERY_NOTE ||
              entry.voucherType === VoucherEntryType.RECEIPT ||
              entry.voucherType === VoucherEntryType.CREDIT_NOTE
            ? "Sundry Debtors"
            : null;
      const explicitMoneyGroup = line.costCenter === "Cash-in-Hand" || line.costCenter === "Bank Accounts" ? line.costCenter : null;
      const authoritativeGroup = stableAccountId ? (accountGroup(stableAccountId) ?? "General Ledger") : null;
      addLine(
        displayLedger,
        Number(line.debit || 0),
        Number(line.credit || 0),
        authoritativeGroup ?? (isLegacyPartyLedger ? partyGroup : explicitMoneyGroup),
        stableAccountId,
      );
    });
  };

  const normalizedLedger = (ledger: string) => ledger.trim().toLowerCase();
  const hasBalancedPersistedLines = (entry: VoucherEntryWithRelations) => {
    const debit = sumMoney(entry.lines.map((line) => line.debit));
    const credit = sumMoney(entry.lines.map((line) => line.credit));
    return debit > 0 && moneyEquals(debit, credit);
  };
  const matchesAccountCodeOrLegacyCaption = (
    line: VoucherEntryWithRelations["lines"][number],
    code: string,
    legacyCaptionMatches: (ledger: string) => boolean,
  ) => line.accountId
    ? accountsById.get(line.accountId)?.code === code
    : legacyCaptionMatches(normalizedLedger(line.ledger));
  const hasReceiptControlPair = (entry: VoucherEntryWithRelations) =>
    hasBalancedPersistedLines(entry) &&
    entry.lines.some((line) => matchesAccountCodeOrLegacyCaption(line, "1210001", (ledger) => ledger === "inventory control") && Number(line.debit) > 0) &&
    entry.lines.some((line) => matchesAccountCodeOrLegacyCaption(
      line,
      "2212001",
      (ledger) => ledger === "purchase bill pending" || ledger.includes("goods received not invoiced") || ledger === "grni",
    ) && Number(line.credit) > 0);
  const hasBillPendingDebit = (entry: VoucherEntryWithRelations) =>
    hasBalancedPersistedLines(entry) &&
    entry.lines.some((line) => matchesAccountCodeOrLegacyCaption(
      line,
      "2212001",
      (ledger) => ledger === "purchase bill pending" || ledger.includes("goods received not invoiced") || ledger === "grni",
    ) && Number(line.debit) > 0);
  const canUseLegacySyntheticFallback = (entry: VoucherEntryWithRelations) =>
    entry.lines.every((line) => {
      const hasValue = Number(line.debit || 0) !== 0 || Number(line.credit || 0) !== 0;
      return !hasValue || !line.accountId?.trim();
    });
  const belongsToReversalPair = (entry: VoucherEntryWithRelations) =>
    Boolean(entry.reversalOfId) || reversedOriginalIds.has(entry.id);

  entries.forEach((entry) => {
    if (isPurchaseOrder(entry)) return;
    if (isReceiptNote(entry)) {
      // Modern Receipt Notes persist their authoritative Inventory/GRNI pair.
      // Reading those lines keeps stable account ids, reversals, and any future
      // control-ledger changes in the same GL used by every other report. Only
      // genuinely old rows that predate the pair retain the synthetic fallback.
      if (hasReceiptControlPair(entry) || belongsToReversalPair(entry) || !canUseLegacySyntheticFallback(entry)) {
        addPersistedLines(entry);
        return;
      }
      addLine("Inventory Control", Number(entry.totalAmount), 0, "Current Assets");
      addLine("Purchase Bill Pending", 0, Number(entry.totalAmount));
      return;
    }
    if (entry.voucherType === VoucherEntryType.PURCHASE && entry.sourceVoucherId && receiptNoteIds.has(entry.sourceVoucherId)) {
      // A current Receipt-Note-backed bill contains a GRNI debit plus the exact
      // Cash/Bank/MFS/payable credits selected by the user. Never collapse that
      // persisted split to one guessed settlement ledger. As above, keep a
      // narrow fallback for malformed historical rows only.
      if (hasBillPendingDebit(entry) || belongsToReversalPair(entry) || !canUseLegacySyntheticFallback(entry)) {
        addPersistedLines(entry);
        return;
      }
      addLine("Purchase Bill Pending", Number(entry.totalAmount), 0);
      const persistedCredits = entry.lines.filter((line) => Number(line.credit || 0) > 0);
      const persistedCreditTotal = sumMoney(persistedCredits.map((line) => line.credit));
      if (persistedCredits.length && moneyEquals(persistedCreditTotal, entry.totalAmount)) {
        persistedCredits.forEach((line) => {
          const isPartyLedger = !line.accountId && normalizedLedger(line.ledger) === entry.partyName.trim().toLowerCase();
          const explicitMoneyGroup = line.costCenter === "Cash-in-Hand" || line.costCenter === "Bank Accounts" ? line.costCenter : null;
          const stableAccountId = line.accountId?.trim() || null;
          const displayLedger = stableAccountId ? (accountsById.get(stableAccountId)?.name ?? line.ledger) : line.ledger;
          addLine(
            displayLedger,
            0,
            Number(line.credit),
            stableAccountId ? (accountGroup(stableAccountId) ?? "General Ledger") : isPartyLedger ? "Sundry Creditors" : explicitMoneyGroup,
            stableAccountId,
          );
        });
      } else {
        addLine(
          entry.settlementMode === "CASH" ? "Cash in Hand" : entry.partyName,
          0,
          Number(entry.totalAmount),
          entry.settlementMode === "CASH" ? "Cash-in-Hand" : "Sundry Creditors",
        );
      }
      return;
    }
    // Generic cost centres (for example "Head Office") are not account
    // groups. Payment-source lines deliberately carry one of the two guarded
    // money groups above so custom-named Bank/MFS ledgers remain classifiable.
    addPersistedLines(entry);
  });

  return Array.from(rows.values()).sort((left, right) => left.ledger.localeCompare(right.ledger));
}

export function buildInventorySnapshot(
  items: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    kind?: "PRODUCT" | "SERVICE";
    alias?: string | null;
    category: string;
    categoryId?: string | null;
    unit: string;
    alternateUnit?: string | null;
    alternateUnitConversion?: Prisma.Decimal | number | null;
    description?: string | null;
    languageAlias?: string | null;
    partNumber?: string | null;
    notes?: string | null;
    openingQty: Prisma.Decimal | number;
    openingRate: Prisma.Decimal | number;
    reorderLevel: Prisma.Decimal | number;
    expiryDate?: Date | null;
  }>,
  entries: Array<VoucherEntryWithRelations>,
  adjustments: Array<{
    id: string;
    inventoryItemId: string;
    quantity: Prisma.Decimal | number;
    unitPrice: Prisma.Decimal | number;
    note: string | null;
    reason: string | null;
    adjustmentDate: Date;
  }> = [],
) {
  const rows = new Map<string, InventorySnapshotRow>();

  items.forEach((item) => {
    rows.set(item.id, {
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      kind: item.kind === "SERVICE" ? "service" : "product",
      alias: item.alias ?? "",
      category: item.category,
      categoryId: item.categoryId ?? null,
      unit: item.unit,
      alternateUnit: item.alternateUnit ?? "",
      alternateUnitConversion: item.alternateUnitConversion == null ? 0 : Number(item.alternateUnitConversion),
      description: item.description ?? "",
      languageAlias: item.languageAlias ?? "",
      partNumber: item.partNumber ?? "",
      notes: item.notes ?? "",
      openingQty: Number(item.openingQty),
      quantity: Number(item.openingQty),
      rate: Number(item.openingRate),
      reorderLevel: Number(item.reorderLevel),
      expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null,
      status: "active",
      adjustments: [],
    });
  });

  // A Quotation/Sale Order/Proforma is a planning document with no stock movement
  // at all, and an Invoice raised against a Delivery Note must not move stock a
  // second time — the Delivery Note itself already did when the goods physically
  // left. Both cases are skipped below so the same units aren't counted twice (or
  // subtracted before anything has actually shipped).
  const deliveryNoteVoucherIds = new Set(
    entries.filter((entry) => entry.voucherType === VoucherEntryType.SALES && entry.documentKind === "delivery-note").map((entry) => entry.id),
  );
  const receiptNoteVoucherIds = new Set(
    entries.filter((entry) => entry.voucherType === VoucherEntryType.PURCHASE && entry.documentKind === "receipt-note").map((entry) => entry.id),
  );
  const noStockEffectDocumentKinds = new Set(["quotation", "sale-order", "proforma"]);
  const stockVoucherTypes = new Set<VoucherEntryType>([
    VoucherEntryType.PURCHASE,
    VoucherEntryType.SALES,
    VoucherEntryType.CREDIT_NOTE,
    VoucherEntryType.DEBIT_NOTE,
  ]);

  entries.forEach((entry) => {
    // Expense vouchers can carry item details (freight, labour, stationery,
    // etc.) for description and costing. Those are not inventory movements.
    if (!stockVoucherTypes.has(entry.voucherType)) {
      return;
    }

    if (entry.voucherType === VoucherEntryType.SALES && entry.documentKind && noStockEffectDocumentKinds.has(entry.documentKind)) {
      return;
    }

    if (entry.voucherType === VoucherEntryType.SALES && entry.sourceVoucherId && deliveryNoteVoucherIds.has(entry.sourceVoucherId)) {
      return;
    }

    if (entry.voucherType === VoucherEntryType.PURCHASE && entry.documentKind === "purchase-order") {
      return;
    }

    // The receipt note already brought the goods into stock. Converting it into a
    // bill only moves GRNI/Purchase Bill Pending to the supplier payable account.
    if (entry.voucherType === VoucherEntryType.PURCHASE && entry.sourceVoucherId && receiptNoteVoucherIds.has(entry.sourceVoucherId)) {
      return;
    }

    entry.inventoryItems.forEach((item) => {
      const key = item.inventoryItemId ?? item.id;
      const itemQuantity = Number(item.quantity);
      const itemUnitPrice = Number(item.unitPrice);
      const current = rows.get(key) ?? {
        id: item.inventoryItemId ?? item.id,
        itemCode: `ITM-${item.itemName.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8) || "AUTO"}`,
        itemName: item.itemName,
        kind: item.inventoryItem?.kind === "SERVICE" ? "service" : "product",
        alias: item.inventoryItem?.alias ?? "",
        category: item.inventoryItem?.category ?? "General Items",
        categoryId: item.inventoryItem?.categoryId ?? null,
        unit: item.inventoryItem?.unit ?? "pcs",
        alternateUnit: item.inventoryItem?.alternateUnit ?? "",
        alternateUnitConversion: item.inventoryItem?.alternateUnitConversion == null ? 0 : Number(item.inventoryItem.alternateUnitConversion),
        description: item.inventoryItem?.description ?? "",
        languageAlias: item.inventoryItem?.languageAlias ?? "",
        partNumber: item.inventoryItem?.partNumber ?? "",
        notes: item.inventoryItem?.notes ?? "",
        openingQty: 0,
        quantity: 0,
        rate: itemUnitPrice,
        reorderLevel: item.inventoryItem ? Number(item.inventoryItem.reorderLevel) : 0,
        expiryDate: item.inventoryItem?.expiryDate ? item.inventoryItem.expiryDate.toISOString().slice(0, 10) : null,
        status: item.inventoryItem?.status === "INACTIVE" ? "inactive" : "active",
        adjustments: [],
      };

      // Services are returnable for their financial value, but they never move
      // physical stock. A sales return (credit note) brings a product back into
      // stock, whereas an ordinary sale takes it out.
      if (current.kind === "service") {
        rows.set(key, current);
        return;
      }

      const increasesStock = entry.voucherType === VoucherEntryType.PURCHASE || entry.voucherType === VoucherEntryType.CREDIT_NOTE;
      current.quantity += increasesStock ? itemQuantity : -itemQuantity;
      // A return carries the original selling rate for commercial calculations;
      // it must not replace the item's cost basis with that selling rate.
      if (itemUnitPrice > 0 && entry.voucherType === VoucherEntryType.PURCHASE) {
        current.rate = itemUnitPrice;
      }
      rows.set(key, current);
    });
  });

  adjustments.forEach((adjustment) => {
    const row = rows.get(adjustment.inventoryItemId);
    if (!row) {
      return;
    }

    const quantity = Number(adjustment.quantity);
    row.quantity += quantity;
    row.adjustments.push({
      id: adjustment.id,
      quantity,
      unitPrice: Number(adjustment.unitPrice),
      note: adjustment.note,
      reason: adjustment.reason,
      adjustmentDate: adjustment.adjustmentDate.toISOString(),
    });
  });

  return Array.from(rows.values()).sort((left, right) => left.itemName.localeCompare(right.itemName));
}
