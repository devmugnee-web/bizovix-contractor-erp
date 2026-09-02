export type DataMode = "mock" | "demo" | "api";

export type AccountingEntryMode = "simple" | "double-entry";

export type VoucherType =
  | "contra"
  | "payment"
  | "receipt"
  | "journal"
  | "sales"
  | "purchase"
  | "expense"
  | "revenue"
  | "credit-note"
  | "debit-note";

export type VoucherStatus = "draft" | "pending" | "approved" | "posted" | "rejected" | "cancelled" | "reversed" | "superseded_by_alteration";

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  industry: string;
  openPeriod: string;
  financialYear: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  permissions?: string[];
}

export interface SessionRecord {
  mode: DataMode;
  user: UserProfile;
  workspaceId: string;
}

export interface QuickShortcutItem {
  combo: string;
  description: string;
}

export interface SummaryMetric {
  label: string;
  value: number;
  icon: "sales" | "purchase" | "receipt" | "payment" | "cash" | "bank";
}

export interface PendingApprovalItem {
  id: string;
  label: string;
  count: number;
  amount: number;
}

export interface PartyRecord {
  id: string;
  workspaceId: string;
  /** Stable COA sub-ledger used for every posting for this party. */
  ledgerAccountId?: string | null;
  name: string;
  partyCategory?: "business" | "individual";
  type: "customer" | "supplier";
  contact: string;
  contactPerson?: string;
  whatsappNumber?: string;
  dateOfBirth?: string;
  marriageDate?: string;
  address: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  country?: string;
  creditLimit: number;
  openingBalance?: number;
  openingBalanceDate?: string | null;
  billMaturityDays?: number;
  status: "active" | "inactive";
}

export interface StockItemRecord {
  id: string;
  workspaceId: string;
  itemCode: string;
  itemName: string;
  category: string;
  unit: string;
  openingQty: number;
  openingRate: number;
  reorderLevel: number;
  expiryDate?: string | null;
  trackBatchExpiry?: boolean;
  status: "active" | "inactive";
  createdAt?: string;
}

export interface InventoryVoucherItem {
  id: string;
  sourceInventoryLineId?: string | null;
  manufacturingInventoryLotId?: string | null;
  manufacturingSerialIds?: string[];
  inventoryItemId?: string | null;
  warehouseId?: string | null;
  warehouse?: { id: string; name: string; code: string } | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  batchNumber?: string | null;
  manufacturedAt?: string | null;
  expiresAt?: string | null;
}

export type VoucherSettlementMode = "cash" | "bank" | "accounts-payable";
export type VoucherDiscountType = "fixed" | "percent";

export interface VoucherLine {
  id: string;
  accountId?: string;
  moneyAccountType?: "CASH" | "BANK" | "MFS";
  ledger: string;
  description: string;
  debit: number;
  credit: number;
  costCenter?: string;
  project?: string;
  billReference?: string;
}

export interface VoucherRecord {
  id: string;
  workspaceId: string;
  voucherType: VoucherType;
  /** Which document in the purchase/sales flow this row is. Null = legacy bill. */
  documentKind?: string | null;
  sourceVoucherId?: string | null;
  /** Immutable origin captured when the transaction was created. Company-level
   * workflow changes never reinterpret an existing voucher. */
  workflowOrigin?: "DIRECT" | "ORDER_FLOW" | null;
  /** Original voucher when this row is its audit-preserving reversal. */
  reversalOfId?: string | null;
  warehouseId?: string | null;
  warehouse?: { id: string; name: string; code: string } | null;
  voucherNumber: string;
  voucherDate: string;
  /** When this row actually landed in the system — distinct from voucherDate (the
   * transaction date the user picked, often shared by a whole day's batch of entries).
   * Used to break same-date ties so the most recently added row sorts first. */
  createdAt: string;
  partyName: string;
  /** Stable party identity; partyName is only the historical display label. */
  partyId?: string | null;
  particulars: string;
  debit: number;
  credit: number;
  amount: number;
  status: VoucherStatus;
  idempotencyKey?: string;
  /** Set only when the automatic draft -> submit -> approve/post walk (see
   * bringToRequestedStatus in voucher.service.ts) stalled partway — the real
   * reason it didn't reach the requested status, straight from the API, so the
   * caller can show it instead of a generic "not posted yet" message. */
  postingStallReason?: string;
  enteredBy: string;
  reference?: string;
  narration?: string;
  settlementMode?: VoucherSettlementMode | null;
  paidAmount?: number | null;
  supplierAddress?: string;
  condition?: string;
  buyerSignature?: string;
  sellerSignature?: string;
  attachmentImageUrl?: string;
  attachmentDocumentUrl?: string;
  attachmentDocumentName?: string;
  discountType?: VoucherDiscountType | null;
  discountAmount?: number | null;
  roundOffAmount?: number | null;
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscountAmount?: number;
  subtotal?: number | null;
  currency: string;
  lines: VoucherLine[];
  inventoryItems?: InventoryVoucherItem[];
}

export interface DashboardMetric {
  id: string;
  label: string;
  value: number;
  monthValue?: number;
  change: string;
  attention?: {
    label: string;
    value: number;
    count: number;
    entityLabel: string;
    nextDueDate?: string | null;
  };
}

export interface TrendPoint {
  name: string;
  sales: number;
  purchase: number;
}

export interface TrialBalanceRow {
  id: string;
  /** Stable Chart of Accounts identity. Ledger text can become stale after a
   * rename, so financial reports must prefer this id when it is available. */
  accountId?: string;
  ledger: string;
  group: string;
  debit: number;
  credit: number;
  /** Signed debit-minus-credit balance immediately before the report period. */
  openingBalance?: number;
  /** Cumulative debit minus credit up to the report's closing date. */
  closingBalance?: number;
}

export interface InventoryCostedMovementRecord {
  id: string;
  workspaceId: string;
  warehouseId: string;
  inventoryItemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  transactionType: string;
  transactionId: string;
  transactionLineId: string;
  referenceNo: string;
  movementType: "IN" | "OUT";
  quantity: number;
  unitCost: number;
  movementValue: number;
  balanceQuantity: number;
  balanceValue: number;
  averageCost: number;
  transactionDate: string;
  createdAt: string;
}

export interface SubscriptionUsage {
  id: string;
  label: string;
  used: number;
  limit: number;
  unit?: string | null;
  status: "ok" | "warning" | "critical";
}

export interface SubscriptionPlanSummary {
  code: string;
  name: string;
  description: string;
  priceLabel: string;
  billingLabel: string;
  isCurrent: boolean;
  isRecommended: boolean;
  features: string[];
  limits: Array<{
    key: string;
    label: string;
    value: number;
    unit?: string | null;
  }>;
}

export interface SubscriptionUpgradeRequest {
  id: string;
  requestedPlanCode: string;
  requestedPlanName: string;
  status: "open" | "in-review" | "approved" | "rejected" | "cancelled";
  note?: string | null;
  submittedAt: string;
}

export interface SubscriptionSnapshot {
  currentPlan: {
    code: string;
    name: string;
    description: string;
    priceLabel: string;
    billingLabel: string;
  };
  status: "free-active" | "free-expiring" | "paid-active" | "grace-period" | "suspended";
  renewalDate: string;
  daysRemaining: number;
  usages: SubscriptionUsage[];
  plans: SubscriptionPlanSummary[];
  upgradeRequest: SubscriptionUpgradeRequest | null;
}

export interface DayBookFilters {
  from?: string;
  to?: string;
  voucherType?: VoucherType | "all";
  enteredBy?: string | "all";
  status?: VoucherStatus | "all";
  query?: string;
  workspaceId?: string;
}

export interface DashboardPayload {
  metrics: DashboardMetric[];
  trend: TrendPoint[];
  recentTransactions: VoucherRecord[];
  quickShortcuts: QuickShortcutItem[];
  summary: SummaryMetric[];
  approvals: PendingApprovalItem[];
}

export interface VoucherFormInput {
  id?: string;
  workspaceId: string;
  voucherType: VoucherType;
  /** Optional system document number supplied by entry screens. */
  voucherNumber?: string;
  documentKind?: string | null;
  sourceVoucherId?: string | null;
  warehouseId?: string | null;
  voucherDate: string;
  partyName: string;
  partyId?: string | null;
  reference?: string;
  narration?: string;
  status: VoucherStatus;
  idempotencyKey?: string;
  settlementMode?: VoucherSettlementMode;
  paidAmount?: number;
  supplierAddress?: string;
  condition?: string;
  buyerSignature?: string;
  sellerSignature?: string;
  attachmentImageUrl?: string;
  attachmentDocumentUrl?: string;
  attachmentDocumentName?: string;
  discountType?: VoucherDiscountType;
  discountAmount?: number;
  roundOffAmount?: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscountAmount?: number;
  subtotal?: number;
  totalAmount?: number;
  lines: VoucherLine[];
  inventoryItems?: InventoryVoucherItem[];
}

export interface AppDataset {
  workspaces: Workspace[];
  users: UserProfile[];
  parties: PartyRecord[];
  stockItems: StockItemRecord[];
  inventoryMovements?: InventoryCostedMovementRecord[];
  vouchers: VoucherRecord[];
  dashboardMetrics: DashboardMetric[];
  trialBalance: TrialBalanceRow[];
  summary: SummaryMetric[];
  approvals: PendingApprovalItem[];
  quickShortcuts: QuickShortcutItem[];
  subscription: SubscriptionSnapshot;
  workspaceSubscriptions: Record<string, SubscriptionSnapshot>;
}

export type MasterDataCategory =
  | "accounting_masters"
  | "inventory_masters"
  | "party_masters"
  | "employee_masters"
  | "bank_accounts"
  | "tax_settings"
  | "financial_year"
  | "opening_balances";

export interface MasterDataCheckItem {
  id: MasterDataCategory;
  title: string;
  description: string;
  category: MasterDataCategory;
  isReady: boolean;
  requiredForPosting: boolean;
  actionRoute?: string;
  actionLabel?: string;
  details?: string;
}

export interface MasterDataReadinessResult {
  isReadyForTransactions: boolean;
  totalChecks: number;
  passedChecks: number;
  criticalMissingCount: number;
  checks: MasterDataCheckItem[];
}
