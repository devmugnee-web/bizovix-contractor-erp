import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BillableLinesResult, SaveSupplierBillInput, SupplierBillQuery, SupplierBillRecord, SupplierBillStats } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useSupplierBills(query: SupplierBillQuery) {
  return useQuery({
    queryKey: queryKeys.supplierBills(query),
    queryFn: () => apiRequestPaginated<SupplierBillRecord>("/supplier-bills", { params: { ...query } }),
    placeholderData: (previous) => previous,
  });
}

export function useSupplierBill(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.supplierBill(id ?? ""),
    queryFn: () => apiRequest<SupplierBillRecord>(`/supplier-bills/${id}`),
    enabled: !!id,
  });
}

export function useSupplierBillStats() {
  return useQuery({
    queryKey: queryKeys.supplierBillStats,
    queryFn: () => apiRequest<SupplierBillStats>("/supplier-bills/stats"),
  });
}

/** Backend-authoritative billable ceilings for a PO — ordered vs accepted vs already billed. */
export function useBillableLines(purchaseOrderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.billableLines(purchaseOrderId ?? ""),
    queryFn: () => apiRequest<BillableLinesResult>(`/supplier-bills/billable-lines/${purchaseOrderId}`),
    enabled: !!purchaseOrderId,
  });
}

/** Approving a bill produces a Payable and a journal entry, so the AP-wide caches (payables,
 * accounting, ledger, aging) are invalidated alongside the bill itself. */
function useInvalidateSupplierBills() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["supplier-bills"] });
    void queryClient.invalidateQueries({ queryKey: ["supplier-ledger"] });
    void queryClient.invalidateQueries({ queryKey: ["accounting"] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
  };
}

export function useCreateSupplierBill() {
  const invalidate = useInvalidateSupplierBills();
  return useMutation({
    mutationFn: (payload: SaveSupplierBillInput) => apiRequest<SupplierBillRecord>("/supplier-bills", { method: "POST", body: payload }),
    onSuccess: invalidate,
  });
}

export function useUpdateSupplierBill() {
  const invalidate = useInvalidateSupplierBills();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SaveSupplierBillInput }) =>
      apiRequest<SupplierBillRecord>(`/supplier-bills/${id}`, { method: "PATCH", body: payload }),
    onSuccess: invalidate,
  });
}

export function useSubmitSupplierBill() {
  const invalidate = useInvalidateSupplierBills();
  return useMutation({
    mutationFn: (id: string) => apiRequest<SupplierBillRecord>(`/supplier-bills/${id}/submit`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useApproveSupplierBill() {
  const invalidate = useInvalidateSupplierBills();
  return useMutation({
    mutationFn: (id: string) => apiRequest<SupplierBillRecord>(`/supplier-bills/${id}/approve`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useRejectSupplierBill() {
  const invalidate = useInvalidateSupplierBills();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest<SupplierBillRecord>(`/supplier-bills/${id}/reject`, { method: "POST", body: { reason } }),
    onSuccess: invalidate,
  });
}

export function useCancelSupplierBill() {
  const invalidate = useInvalidateSupplierBills();
  return useMutation({
    mutationFn: (id: string) => apiRequest<SupplierBillRecord>(`/supplier-bills/${id}/cancel`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
