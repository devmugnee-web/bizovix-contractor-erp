import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApAgingQuery,
  ApAgingResult,
  ApReconciliationResult,
  SaveSupplierPaymentInput,
  SupplierLedgerQuery,
  SupplierLedgerResult,
  SupplierPaymentQuery,
  SupplierPaymentRecord,
  SupplierPaymentStats,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useSupplierPayments(query: SupplierPaymentQuery) {
  return useQuery({
    queryKey: queryKeys.supplierPayments(query),
    queryFn: () => apiRequestPaginated<SupplierPaymentRecord>("/supplier-payments", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useSupplierPayment(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.supplierPayment(id ?? ""),
    queryFn: () => apiRequest<SupplierPaymentRecord>(`/supplier-payments/${id}`),
    enabled: !!id,
  });
}

export function useSupplierPaymentStats() {
  return useQuery({
    queryKey: queryKeys.supplierPaymentStats,
    queryFn: () => apiRequest<SupplierPaymentStats>("/supplier-payments/stats"),
  });
}

/** A payment moves the Payable, the bill's own status, the bank balance and the GL — every one
 * of those caches has to go, or the UI shows a stale outstanding figure. */
function useInvalidateSupplierPayments() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["supplier-payments"] });
    void queryClient.invalidateQueries({ queryKey: ["supplier-bills"] });
    void queryClient.invalidateQueries({ queryKey: ["supplier-ledger"] });
    void queryClient.invalidateQueries({ queryKey: ["accounting"] });
    void queryClient.invalidateQueries({ queryKey: ["cash-bank"] });
    void queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
  };
}

export function useCreateSupplierPayment() {
  const invalidate = useInvalidateSupplierPayments();
  return useMutation({
    mutationFn: (payload: SaveSupplierPaymentInput) => apiRequest<SupplierPaymentRecord>("/supplier-payments", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

/** Posted payments are never edited in place — cancelling reverses the GL entry, posts the cash
 * back IN and restores the Payable/Bill running totals. */
export function useCancelSupplierPayment() {
  const invalidate = useInvalidateSupplierPayments();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest<SupplierPaymentRecord>(`/supplier-payments/${id}/cancel`, { method: "POST", body: { reason } }),
    onSuccess: invalidate,
  });
}

export function useSupplierLedger(query: SupplierLedgerQuery | undefined) {
  return useQuery({
    queryKey: queryKeys.supplierLedger(query),
    queryFn: () => apiRequest<SupplierLedgerResult>("/supplier-ledger", { params: { ...query } }),
    enabled: !!query?.supplierId,
  });
}

export function useApAging(query: ApAgingQuery = {}) {
  return useQuery({
    queryKey: queryKeys.apAging(query),
    queryFn: () => apiRequest<ApAgingResult>("/supplier-ledger/aging", { params: { ...query } }),
  });
}

export function useApReconciliation() {
  return useQuery({
    queryKey: queryKeys.apReconciliation,
    queryFn: () => apiRequest<ApReconciliationResult>("/supplier-ledger/reconciliation"),
  });
}
