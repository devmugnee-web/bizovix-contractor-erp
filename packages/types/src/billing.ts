export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELED" | "SUSPENDED";
export type BillingCycle = "MONTHLY" | "YEARLY";

export interface PlanRecord {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  monthlyPrice: string;
  yearlyPrice: string;
  currency: string;
  userLimit: number | null;
  projectLimit: number | null;
  storageLimitMb: number | null;
  companyLimit: number | null;
  features: string[];
  isActive: boolean;
  isCurrent?: boolean;
}

export interface SubscriptionRecord {
  id: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle | string;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  trialDaysTotal: number | null;
  trialDaysRemaining: number | null;
  startedAt?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  cancelRequestedAt?: string | null;
  plan: PlanRecord | null;
}

export interface UsageMetric {
  used: number;
  limit: number | null;
}
export interface StorageUsageMetric {
  usedMb: number;
  limitMb: number | null;
}
export interface UsageSummary {
  users: UsageMetric;
  projects: UsageMetric;
  storage: StorageUsageMetric;
  companies: UsageMetric;
}

export interface BillingProfileRecord {
  id: string;
  billingName?: string | null;
  billingEmail?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  tinNumber?: string | null;
  binNumber?: string | null;
  paymentMethodType: string;
  paymentMethodLabel?: string | null;
  paymentVerified: boolean;
  updatedAt: string;
}
export interface SaveBillingProfileInput {
  billingName?: string;
  billingEmail?: string;
  phone?: string;
  billingAddress?: string;
  tinNumber?: string;
  binNumber?: string;
  paymentMethodType: string;
  paymentMethodLabel?: string;
}

export interface UpgradePlanInput {
  planId: string;
  billingCycle: BillingCycle;
}
export interface UpgradePlanResult {
  subscription: SubscriptionRecord;
  invoiceId: string;
}

export interface InvoiceItemRecord {
  id: string;
  description: string;
  amount: string;
}
export interface PaymentRecordEntry {
  id: string;
  amount: string;
  method: string;
  reference?: string | null;
  status: string;
  paidAt?: string | null;
  createdAt: string;
}
export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  planNameSnapshot: string;
  billingCycle: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  currency: string;
  status: string;
  issuedAt: string;
  dueAt?: string | null;
  paidAt?: string | null;
  items: InvoiceItemRecord[];
  payments: PaymentRecordEntry[];
}
export interface InvoiceQuery {
  page?: number;
  limit?: number;
  status?: string;
}
export interface RecordPaymentInput {
  amount: number;
  method: string;
  reference?: string;
}
