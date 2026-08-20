import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReceiptQuery, ReceiptRecord, ReceiptSummary, SaveReceiptInput } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

export function useReceipts(query: ReceiptQuery) { return useQuery({ queryKey: queryKeys.receipts(query), queryFn: () => apiRequestPaginated<ReceiptRecord>("/receipts", { params: { ...query } }), placeholderData: (previous) => previous }); }
export function useReceiptSummary() { return useQuery({ queryKey: queryKeys.receiptSummary, queryFn: () => apiRequest<ReceiptSummary>("/receipts/summary") }); }
export function useReceipt(id?: string) { return useQuery({ queryKey: ["receipts", id], queryFn: () => apiRequest<ReceiptRecord>(`/receipts/${id}`), enabled: !!id }); }
export function useEligibleBills(workId?: string) { return useQuery({ queryKey: ["eligible-bills", workId], queryFn: () => apiRequest<Array<{ id: string; billNo: string; netCertified: string; alreadyReceived: string; outstanding: string }>>(`/receipts/eligible-bills/${workId}`), enabled: !!workId }); }
function invalidator() { const client = useQueryClient(); return () => client.invalidateQueries({ queryKey: ["receipts"] }); }
export function useCreateReceipt() { const invalidate = invalidator(); return useMutation({ mutationFn: (body: SaveReceiptInput) => apiRequest<ReceiptRecord>("/receipts", { method: "POST", body }), onSuccess: invalidate }); }
export function useUpdateReceipt() { const invalidate = invalidator(); return useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<SaveReceiptInput> }) => apiRequest<ReceiptRecord>(`/receipts/${id}`, { method: "PATCH", body }), onSuccess: invalidate }); }
export function useCancelReceipt() { const invalidate = invalidator(); return useMutation({ mutationFn: (id: string) => apiRequest<ReceiptRecord>(`/receipts/${id}`, { method: "DELETE" }), onSuccess: invalidate }); }
