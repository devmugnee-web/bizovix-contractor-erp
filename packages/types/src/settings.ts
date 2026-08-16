export interface GeneralSettingRecord {
  id: string;
  organizationId: string;
  companyDisplayName?: string | null;
  defaultCurrency: string;
  timezone: string;
  dateFormat: string;
  numberFormat: string;
  financialYearStartMonth: number;
  defaultLanguage: string;
  country: string;
  defaultPageSize: number;
  updatedAt: string;
}
export type SaveGeneralSettingInput = Omit<
  GeneralSettingRecord,
  "id" | "organizationId" | "updatedAt"
>;

export interface CompanyProfileRecord {
  id: string;
  organizationId: string;
  legalName?: string | null;
  displayName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  tradeLicenseNo?: string | null;
  tinNumber?: string | null;
  binNumber?: string | null;
  registrationNumber?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  hasLogo: boolean;
  hasSignature: boolean;
  hasSeal: boolean;
  updatedAt: string;
}
export type SaveCompanyProfileInput = Partial<
  Omit<
    CompanyProfileRecord,
    "id" | "organizationId" | "hasLogo" | "hasSignature" | "hasSeal" | "updatedAt"
  >
>;
export type CompanyAssetKind = "logo" | "signature" | "seal";

export interface TenderBankSettingRecord {
  id: string;
  organizationId: string;
  tenderValidityDays: number;
  tenderOpeningReminderDays: number;
  tenderExpiryReminderDays: number;
  tsDefaultSecurityPct: string;
  tsDefaultMarginPct: string;
  tsDefaultValidityMonths: number;
  tsExpiryReminderDays: number;
  pgBgDefaultMarginPct: string;
  pgBgDefaultValidityMonths: number;
  pgBgDefaultInterestRate: string;
  pgBgExpiryReminderDays: number;
  pgBgMaturityReminderDays: number;
  creditCommitmentDefaultCharge: string;
  sdDefaultPct: string;
  sdDefaultValidityMonths: number;
  updatedAt: string;
}
export interface SaveTenderBankSettingInput {
  tenderValidityDays: number;
  tenderOpeningReminderDays: number;
  tenderExpiryReminderDays: number;
  tsDefaultSecurityPct: number;
  tsDefaultMarginPct: number;
  tsDefaultValidityMonths: number;
  tsExpiryReminderDays: number;
  pgBgDefaultMarginPct: number;
  pgBgDefaultValidityMonths: number;
  pgBgDefaultInterestRate: number;
  pgBgExpiryReminderDays: number;
  pgBgMaturityReminderDays: number;
  creditCommitmentDefaultCharge: number;
  sdDefaultPct: number;
  sdDefaultValidityMonths: number;
}

export interface FinanceSettingRecord {
  id: string;
  organizationId: string;
  defaultCashAccountId?: string | null;
  defaultPettyCashAccountId?: string | null;
  defaultBankChargeAccountId?: string | null;
  defaultReceivableAccountId?: string | null;
  defaultPayableAccountId?: string | null;
  defaultProjectRevenueAccountId?: string | null;
  defaultGeneralExpenseAccountId?: string | null;
  defaultTenderDocumentExpenseAccountId?: string | null;
  defaultCreditCommitmentChargeAccountId?: string | null;
  autoPostApproved: boolean;
  requireApprovalBeforePosting: boolean;
  allowBackdatedTransactions: boolean;
  allowFutureDatedTransactions: boolean;
  updatedAt: string;
}
export type SaveFinanceSettingInput = Omit<
  FinanceSettingRecord,
  "id" | "organizationId" | "updatedAt"
>;
export interface FinanceAccountOption {
  id: string;
  code: string;
  name: string;
  accountType: string;
}

export type AccountingPeriodStatus = "OPEN" | "LOCKED";
export interface AccountingPeriodRecord {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: AccountingPeriodStatus;
  lockedAt?: string | null;
  createdAt: string;
}
export interface SaveAccountingPeriodInput {
  label: string;
  startDate: string;
  endDate: string;
}

export type NumberingModuleKey =
  | "TENDER"
  | "EXPENSE"
  | "RECEIPT"
  | "JOURNAL"
  | "PAYMENT_VOUCHER"
  | "RECEIPT_VOUCHER"
  | "BANK_TRANSFER"
  | "PG_BG"
  | "TENDER_SECURITY"
  | "DOCUMENT"
  | "PROJECT"
  | "CHEQUE";
export interface NumberSequenceRecord {
  id: string;
  moduleKey: NumberingModuleKey | string;
  prefix: string;
  includeYear: boolean;
  yearFormat: string;
  separator: string;
  sequenceLength: number;
  nextNumber: number;
  updatedAt: string;
}
export type SaveNumberSequenceInput = Omit<
  NumberSequenceRecord,
  "id" | "moduleKey" | "nextNumber" | "updatedAt"
> & { nextNumber: number };

export type ReminderRuleType =
  | "TENDER_OPENING"
  | "TENDER_CLOSING"
  | "TENDER_SECURITY_EXPIRY"
  | "PG_EXPIRY"
  | "BG_EXPIRY"
  | "SECURITY_DEPOSIT_EXPIRY"
  | "BILL_MATURITY"
  | "CHEQUE_MATURITY"
  | "LOAN_EMI_DUE"
  | "DOCUMENT_EXPIRY"
  | "RECEIVABLE_DUE"
  | "PAYABLE_DUE"
  | "CONTRACT_EXPIRY";
export interface ReminderRuleRecord {
  id: string;
  reminderType: ReminderRuleType | string;
  isEnabled: boolean;
  defaultPriority: string;
  offsetDays: number[];
  inAppEnabled: boolean;
  emailEnabled: boolean;
  updatedAt: string;
}
export type SaveReminderRuleInput = Omit<
  ReminderRuleRecord,
  "id" | "reminderType" | "updatedAt"
>;

export interface DocumentSettingRecord {
  id: string;
  organizationId: string;
  allowedFileTypes: string[];
  maxFileSizeMb: number;
  defaultExpiryReminderDays: number;
  enableVersionControl: boolean;
  enableExpiryTracking: boolean;
  autoArchiveExpired: boolean;
  updatedAt: string;
}
export type SaveDocumentSettingInput = Omit<
  DocumentSettingRecord,
  "id" | "organizationId" | "updatedAt"
>;

export interface ApprovalRuleRecord {
  id: string;
  module: string;
  transactionType?: string | null;
  minAmount?: string | null;
  maxAmount?: string | null;
  approvalRequired: boolean;
  approverRole: string;
  approvalLevel: number;
  isActive: boolean;
  createdAt: string;
}
export interface SaveApprovalRuleInput {
  module: string;
  transactionType?: string;
  minAmount?: number;
  maxAmount?: number;
  approvalRequired: boolean;
  approverRole: string;
  approvalLevel: number;
  isActive?: boolean;
}

export interface SecuritySettingRecord {
  id: string;
  organizationId: string;
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
  sessionTimeoutMinutes: number;
  maxFailedLoginAttempts: number;
  accountLockDurationMinutes: number;
  forcePasswordChangeDays?: number | null;
  twoFactorEnabled: boolean;
  updatedAt: string;
}
export type SaveSecuritySettingInput = Omit<
  SecuritySettingRecord,
  "id" | "organizationId" | "updatedAt"
>;
export interface ActiveSessionRecord {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface SystemSettingRecord {
  id: string;
  maintenanceMode: boolean;
  featureToggles?: Record<string, boolean> | null;
  appName: string;
  appVersion: string;
  environment: string;
  databaseStatus: "ONLINE" | "OFFLINE";
  apiStatus: "ONLINE" | "OFFLINE";
  storageStatus: "ONLINE" | "OFFLINE";
  defaultPageSize: number;
}
export type SaveSystemSettingInput = {
  maintenanceMode: boolean;
  featureToggles?: Record<string, boolean>;
};

export interface SettingsUserRecord {
  id: string;
  membershipId: string;
  name: string;
  email: string;
  phone?: string | null;
  isActive: boolean;
  role: { id: string; name: string };
  createdAt: string;
  lastLoginAt?: string | null;
  temporaryPassword?: string;
}
export interface SettingsUserQuery {
  page?: number;
  limit?: number;
  search?: string;
  roleId?: string;
  isActive?: boolean;
}
export interface SaveSettingsUserInput {
  name: string;
  email: string;
  phone?: string;
  roleId: string;
  password?: string;
}
export interface UpdateSettingsUserInput {
  name?: string;
  phone?: string;
  roleId?: string;
}

export interface RoleRecord {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  userCount: number;
  permissionCount: number;
  createdAt: string;
}
export interface RoleDetailRecord extends RoleRecord {
  permissionKeys: string[];
}
export interface SaveRoleInput {
  name: string;
  description?: string;
  permissionKeys?: string[];
}
export interface PermissionCatalogEntry {
  id: string;
  key: string;
  group: string;
  description?: string | null;
}
