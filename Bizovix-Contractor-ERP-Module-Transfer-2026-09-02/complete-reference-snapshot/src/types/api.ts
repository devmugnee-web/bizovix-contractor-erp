import type {
  AppDataset,
  DashboardPayload,
  DayBookFilters,
  SessionRecord,
  SubscriptionSnapshot,
  SubscriptionUpgradeRequest,
  TrialBalanceRow,
  UserProfile,
  VoucherFormInput,
  VoucherRecord,
  Workspace,
} from "@/types/domain";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignupInput {
  companyName: string;
  name: string;
  email: string;
  password: string;
}

export interface AppAuthSession {
  user: UserProfile;
  tenant: {
    id: string;
    name: string;
    onboardingStep: string;
  };
  organization: {
    id: string;
    name: string;
  };
  company: {
    id: string;
    name: string;
  };
  workspaceId: string | null;
  shouldCompleteOnboarding: boolean;
}

export interface OnboardingState {
  tenantId: string;
  companyId: string;
  onboardingStep: string;
  categories: Array<{
    code: string;
    name: string;
    description: string;
  }>;
}

export interface SubscriptionUpgradeInput {
  planCode: string;
  note?: string;
}

export type SyncSharePermissionColumn = "view" | "create" | "edit" | "share" | "delete";
export type SyncSharePermissionLevel = "allow" | "limited" | "deny";
export type SyncShareUserRole = "Manager" | "Accountant" | "Staff" | "Auditor";
export type SyncSharePermissionMatrix = Record<string, Record<SyncSharePermissionColumn, SyncSharePermissionLevel>>;

export interface SyncShareUserRecord {
  id: string;
  name: string;
  contact: string;
  role: SyncShareUserRole;
  status: "Active" | "Invite Sent";
  device: string;
  lastSync: string;
  permissions: SyncSharePermissionMatrix;
  temporaryPassword?: string | null;
}

export interface SyncShareUserInput {
  name: string;
  contact: string;
  password?: string;
  role: SyncShareUserRole;
  permissions: SyncSharePermissionMatrix;
}

export interface DataProvider {
  auth: {
    login: (credentials: AuthCredentials) => Promise<UserProfile>;
    demoLogin: () => Promise<UserProfile>;
  };
  workspaces: {
    list: () => Promise<Workspace[]>;
    listShareUsers: (workspaceId: string) => Promise<SyncShareUserRecord[]>;
    createShareUser: (workspaceId: string, input: SyncShareUserInput) => Promise<SyncShareUserRecord>;
    updateShareUser: (workspaceId: string, userId: string, input: SyncShareUserInput) => Promise<SyncShareUserRecord>;
    removeShareUser: (workspaceId: string, userId: string) => Promise<{ success: boolean; removedUserId: string }>;
    resetShareUserPassword: (
      workspaceId: string,
      userId: string,
    ) => Promise<{ id: string; name: string; contact: string; temporaryPassword: string }>;
  };
  dashboard: {
    get: (workspaceId: string) => Promise<DashboardPayload>;
  };
  vouchers: {
    listDayBook: (filters: DayBookFilters) => Promise<VoucherRecord[]>;
    getById: (voucherId: string, workspaceId: string) => Promise<VoucherRecord>;
    create: (input: VoucherFormInput) => Promise<VoucherRecord>;
    update: (voucherId: string, input: VoucherFormInput) => Promise<VoucherRecord>;
    delete: (voucherId: string, workspaceId: string) => Promise<VoucherRecord>;
  };
  reports: {
    getTrialBalance: (workspaceId: string) => Promise<TrialBalanceRow[]>;
  };
  subscription: {
    get: (workspaceId?: string | null) => Promise<SubscriptionSnapshot>;
    requestUpgrade: (input: SubscriptionUpgradeInput, workspaceId?: string | null) => Promise<SubscriptionUpgradeRequest>;
  };
  demo: {
    reset: () => Promise<AppDataset>;
  };
}

export interface PersistedSessions {
  appSession: SessionRecord | null;
  demoSession: SessionRecord | null;
}
