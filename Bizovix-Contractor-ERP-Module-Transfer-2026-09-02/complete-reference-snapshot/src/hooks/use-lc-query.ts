"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiRequest } from "@/services/api-client";
import type { WarehouseRecord } from "@/services/warehouse.service";
import {
  addLcShipment,
  createLc,
  createLcCostEntry,
  createLcCostHead,
  createLcGrn,
  deleteLc,
  deleteLcCostEntry,
  deleteLcCostHead,
  deleteLcShipment,
  finalizeLcLandedCost,
  postLcInventory,
  updateLcInventoryPosting,
  getLcAllocationReport,
  getLcById,
  getLcCategoryReport,
  getLcCostHeads,
  getLcCostSheetReport,
  getLcDashboard,
  getLcList,
  getLcRegisterReport,
  previewLcAllocation,
  previewLcLandedCost,
  reopenLcLandedCost,
  saveLcAllocation,
  setLcStatus,
  updateLc,
  updateLcCostEntry,
  updateLcCostHead,
  updateLcGrn,
  updateLcLandedCostProfit,
} from "@/services/lc.service";
import type {
  CreateLcCostEntryInput,
  CreateLcCostHeadInput,
  CreateLcGrnInput,
  CreateLcInput,
  CreateLcShipmentInput,
  LcAllocationBasis,
  LcProfitRowInput,
  SaveAllocationInput,
  UpdateLcCostEntryInput,
  UpdateLcCostHeadInput,
  UpdateLcInput,
} from "@/types/lc";

function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 400 || error.status === 403)) {
    return false;
  }
  return failureCount < 2;
}

export function useLcDashboardQuery(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "dashboard", workspaceId],
    queryFn: () => getLcDashboard(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useLcListQuery(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "list", workspaceId],
    queryFn: () => getLcList(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useLcDetailQuery(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "detail", id],
    queryFn: () => getLcById(id!),
    enabled: Boolean(id) && enabled,
    retry: shouldRetry,
  });
}

export function useLcSuppliersQuery(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "suppliers", workspaceId],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>(`/parties?workspaceId=${encodeURIComponent(workspaceId!)}&type=supplier`),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useLcInventoryItemsQuery(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "inventory-items", workspaceId],
    queryFn: () => apiRequest<Array<{ id: string; itemCode: string; itemName: string; unit: string }>>(`/inventory/items?workspaceId=${encodeURIComponent(workspaceId!)}`),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useLcWarehousesQuery(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "warehouses", workspaceId],
    queryFn: () => apiRequest<WarehouseRecord[]>(`/inventory/warehouses?workspaceId=${encodeURIComponent(workspaceId!)}&activeOnly=true`),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useLcCostHeadsQuery(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "cost-heads", workspaceId],
    queryFn: () => getLcCostHeads(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useLcAllocationPreviewQuery(id: string | null, costEntryId: string | null, allocationBasis: LcAllocationBasis, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "allocation-preview", id, costEntryId, allocationBasis],
    queryFn: () => previewLcAllocation(id!, costEntryId!, allocationBasis),
    enabled: Boolean(id) && Boolean(costEntryId) && enabled,
    retry: shouldRetry,
  });
}

export function useLcLandedCostPreviewQuery(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "landed-cost-preview", id],
    queryFn: () => previewLcLandedCost(id!),
    enabled: Boolean(id) && enabled,
    retry: shouldRetry,
  });
}

export function useLcRegisterReportQuery(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "report", "register", workspaceId],
    queryFn: () => getLcRegisterReport(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
  });
}

export function useLcCategoryReportQuery(workspaceId: string | undefined, category: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "report", "category", workspaceId, category],
    queryFn: () => getLcCategoryReport(workspaceId!, category!),
    enabled: Boolean(workspaceId) && Boolean(category) && enabled,
    retry: shouldRetry,
  });
}

export function useLcAllocationReportQuery(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "report", "allocation", id],
    queryFn: () => getLcAllocationReport(id!),
    enabled: Boolean(id) && enabled,
    retry: shouldRetry,
  });
}

export function useLcCostSheetReportQuery(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["lc", "report", "cost-sheet", id],
    queryFn: () => getLcCostSheetReport(id!),
    enabled: Boolean(id) && enabled,
    retry: shouldRetry,
  });
}

function useInvalidateLc() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ["lc"] });
}

export function useCreateLcMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({ mutationFn: (input: CreateLcInput) => createLc(input), onSuccess: invalidate });
}

export function useUpdateLcMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateLcInput }) => updateLc(id, input), onSuccess: invalidate });
}

export function useDeleteLcMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({ mutationFn: (id: string) => deleteLc(id), onSuccess: invalidate });
}

export function useSetLcStatusMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) => setLcStatus(id, status, reason),
    onSuccess: invalidate,
  });
}

export function useAddLcShipmentMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateLcShipmentInput }) => addLcShipment(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteLcShipmentMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, shipmentId }: { id: string; shipmentId: string }) => deleteLcShipment(id, shipmentId),
    onSuccess: invalidate,
  });
}

export function useCreateLcCostEntryMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateLcCostEntryInput }) => createLcCostEntry(id, input),
    onSuccess: invalidate,
  });
}

export function useUpdateLcCostEntryMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, costEntryId, input }: { id: string; costEntryId: string; input: UpdateLcCostEntryInput }) => updateLcCostEntry(id, costEntryId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteLcCostEntryMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, costEntryId }: { id: string; costEntryId: string }) => deleteLcCostEntry(id, costEntryId),
    onSuccess: invalidate,
  });
}

export function useSaveLcAllocationMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, costEntryId, input }: { id: string; costEntryId: string; input: SaveAllocationInput }) => saveLcAllocation(id, costEntryId, input),
    onSuccess: invalidate,
  });
}

export function useCreateLcGrnMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateLcGrnInput }) => createLcGrn(id, input),
    onSuccess: invalidate,
  });
}

export function useFinalizeLcLandedCostMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({ mutationFn: (id: string) => finalizeLcLandedCost(id), onSuccess: invalidate });
}

export function useUpdateLcGrnMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, grnId, input }: { id: string; grnId: string; input: CreateLcGrnInput }) => updateLcGrn(id, grnId, input),
    onSuccess: invalidate,
  });
}

export function usePostLcInventoryMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: Array<{ lcItemId: string; warehouseId: string; inventoryItemId?: string; postingType: "EXISTING" | "NEW" | "ONE_TIME" }> }) => postLcInventory(id, { items }),
    onSuccess: invalidate,
  });
}

export function useUpdateLcInventoryPostingMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: Array<{ lcItemId: string; warehouseId: string; inventoryItemId: string }> }) => updateLcInventoryPosting(id, { items }),
    onSuccess: invalidate,
  });
}

export function useReopenLcLandedCostMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reopenLcLandedCost(id, reason),
    onSuccess: invalidate,
  });
}

export function useUpdateLcLandedCostProfitMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: LcProfitRowInput[] }) => updateLcLandedCostProfit(id, items),
    onSuccess: invalidate,
  });
}

export function useCreateLcCostHeadMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({ mutationFn: (input: CreateLcCostHeadInput) => createLcCostHead(input), onSuccess: invalidate });
}

export function useUpdateLcCostHeadMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLcCostHeadInput }) => updateLcCostHead(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteLcCostHeadMutation() {
  const invalidate = useInvalidateLc();
  return useMutation({ mutationFn: (id: string) => deleteLcCostHead(id), onSuccess: invalidate });
}
