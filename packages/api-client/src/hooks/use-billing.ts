import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiClientConfig } from "../config";
import { tokenStorage } from "../token-storage";
import type {
  BillingProfileRecord,
  InvoiceQuery,
  InvoiceRecord,
  PlanRecord,
  RecordPaymentInput,
  SaveBillingProfileInput,
  SubscriptionRecord,
  UpgradePlanInput,
  UpgradePlanResult,
  UsageSummary,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";

const root = ["billing"] as const;

export const useSubscription = () =>
  useQuery({ queryKey: [...root, "subscription"], queryFn: () => apiRequest<SubscriptionRecord>("/billing/subscription") });

export const usePlans = () =>
  useQuery({ queryKey: [...root, "plans"], queryFn: () => apiRequest<PlanRecord[]>("/billing/plans") });

export const useUsage = () =>
  useQuery({ queryKey: [...root, "usage"], queryFn: () => apiRequest<UsageSummary>("/billing/usage") });

export const useUpgradePlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpgradePlanInput) => apiRequest<UpgradePlanResult>("/billing/upgrade", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

export const useCancelSubscription = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => apiRequest<SubscriptionRecord>("/billing/cancel", { method: "POST", body: { reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "subscription"] }),
  });
};

export const useResumeSubscription = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<SubscriptionRecord>("/billing/resume", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "subscription"] }),
  });
};

export const useBillingProfile = () =>
  useQuery({ queryKey: [...root, "profile"], queryFn: () => apiRequest<BillingProfileRecord>("/billing/profile") });

export const useUpdateBillingProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveBillingProfileInput) => apiRequest<BillingProfileRecord>("/billing/profile", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "profile"] }),
  });
};

export const useInvoices = (q: InvoiceQuery) =>
  useQuery({
    queryKey: [...root, "invoices", "list", q],
    queryFn: () => apiRequestPaginated<InvoiceRecord>("/billing/invoices", { params: { page: q.page, limit: q.limit, status: q.status } }),
    placeholderData: (p) => p,
  });

export const useInvoice = (id?: string | null) =>
  useQuery({
    queryKey: [...root, "invoices", "one", id],
    queryFn: () => apiRequest<InvoiceRecord>(`/billing/invoices/${id}`),
    enabled: !!id,
  });

export const useRecordPayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, body }: { invoiceId: string; body: RecordPaymentInput }) =>
      apiRequest<InvoiceRecord>(`/billing/invoices/${invoiceId}/payments`, { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "invoices"] }),
  });
};

export async function downloadInvoicePdf(invoiceId: string, invoiceNumber: string) {
  const token = tokenStorage.getAccessToken();
  const { baseUrl } = getApiClientConfig();
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/billing/invoices/${invoiceId}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error("Failed to download invoice PDF");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${invoiceNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const useVerifyPayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, paymentId, status }: { invoiceId: string; paymentId: string; status: "VERIFIED" | "REJECTED" }) =>
      apiRequest<InvoiceRecord>(`/billing/invoices/${invoiceId}/payments/${paymentId}/verify`, { method: "POST", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "invoices"] }),
  });
};
