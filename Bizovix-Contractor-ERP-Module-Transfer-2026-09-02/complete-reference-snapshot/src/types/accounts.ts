export type AccountLevel = "MAIN_CATEGORY" | "CATEGORY" | "LEDGER";

export type AccountNature = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "DIRECT_EXPENSE" | "INDIRECT_EXPENSE";

export type AccountStatus = "ACTIVE" | "INACTIVE";

export interface BankAccountDetails {
  bankName: string;
  accountNumber: string;
  branchName: string;
  routingNumber: string;
  swiftCode: string;
  country: string;
  rmName: string;
  rmNumber: string;
  note: string;
  accountHolderName?: string;
  /** Which money-account bucket this ledger belongs to — set by the Bank Accounts
   * vs. MFS Accounts screen at creation time, since both create LEDGER siblings
   * under the same "Bank & MFS Accounts" category and the name alone can't tell
   * them apart. */
  accountKind?: "BANK" | "MFS";
}

export interface OpeningBalanceSourceAllocation {
  accountId: string;
  amount: number;
}

export interface AccountNode {
  id: string;
  code: string;
  name: string;
  level: AccountLevel;
  parentId: string | null;
  nature: AccountNature;
  isSystem: boolean;
  isControlAccount: boolean;
  requiresItemDetails: boolean;
  openingBalance?: number;
  openingBalanceDate?: string | null;
  openingBalanceSourceAccountId?: string | null;
  openingBalanceSources?: OpeningBalanceSourceAllocation[];
  bankDetails?: BankAccountDetails | null;
  printOnInvoices?: boolean;
  status: AccountStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  children: AccountNode[];
}

export interface AccountSearchResult extends Omit<AccountNode, "children"> {
  path: string;
}

export interface AccountDetail extends Omit<AccountNode, "children"> {
  path: string;
  parentName: string | null;
  childCount: number;
  hasPostingHistory: boolean;
}

export interface LedgerOption extends Omit<AccountNode, "children"> {
  path: string;
  /** Raw debit-minus-credit across all APPROVED/POSTED voucher lines. Positive
   * reads as a debit balance, negative as credit — same convention as
   * chart-of-accounts-panel.tsx's AccountBalanceValue, not a nature-flipped
   * "natural balance". Optional because callers that build a LedgerOption from
   * other data (e.g. the account tree) may not carry it. */
  currentBalance?: number;
}

export type MoneyAccountType = "CASH" | "BANK" | "MFS";

export interface MoneyAccountOption extends LedgerOption {
  type: MoneyAccountType;
  currentBalance: number;
}

export interface CreateAccountInput {
  level: AccountLevel;
  parentId?: string | null;
  name: string;
  nature: AccountNature;
  isControlAccount?: boolean;
  requiresItemDetails?: boolean;
  openingBalance?: number;
  openingBalanceDate?: string | null;
  openingBalanceSourceAccountId?: string | null;
  openingBalanceSources?: OpeningBalanceSourceAllocation[];
  bankDetails?: BankAccountDetails | null;
}

export interface UpdateAccountInput {
  name?: string;
  isControlAccount?: boolean;
  requiresItemDetails?: boolean;
  openingBalance?: number;
  openingBalanceDate?: string | null;
  openingBalanceSourceAccountId?: string | null;
  openingBalanceSources?: OpeningBalanceSourceAllocation[];
  bankDetails?: BankAccountDetails | null;
  printOnInvoices?: boolean;
}

export interface CreateExpenseLedgerInput {
  name: string;
  nature: "DIRECT_EXPENSE" | "INDIRECT_EXPENSE";
  requiresItemDetails?: boolean;
}

export interface LedgerItem {
  id: string;
  accountId: string;
  name: string;
  unit: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLedgerItemInput {
  name: string;
  unit?: string;
}

export interface UpdateLedgerItemInput {
  name?: string;
  unit?: string;
}
