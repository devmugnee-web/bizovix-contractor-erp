import { apiRequest } from "@/services/api-client";
import type {
  AllocationPreview,
  CreateLcCostEntryInput,
  CreateLcCostHeadInput,
  CreateLcGrnInput,
  CreateLcInput,
  CreateLcShipmentInput,
  LcCostEntryRecord,
  LcCostHeadRecord,
  LcAllocationBasis,
  LcDashboard,
  LcDetail,
  LcLandedCostPreview,
  LcListItem,
  LcProfitRowInput,
  PostLcInventoryInput,
  SaveAllocationInput,
  UpdateLcCostEntryInput,
  UpdateLcCostHeadInput,
  UpdateLcInventoryPostingInput,
  UpdateLcInput,
} from "@/types/lc";

export interface LcCostPostingReportRow {
  id: string; lcId: string; lcNumber: string; supplierName: string; costHeadName: string;
  vendorName: string | null; invoiceNumber: string | null; invoiceDate: string | null;
  currency: string; foreignAmount: number | null; exchangeRate: number | null; bdtAmount: number;
  allocatedTotal: number; remainingAmount: number; isFullyAllocated: boolean; isLocked: boolean;
  remarks: string | null; paymentMethod: "CREDIT" | "CASH_BANK_MFS" | null; creditPayeeName: string | null; paymentAllocations: Array<{ accountId: string; ledger?: string; amount: number; reference?: string }>; createdAt: string;
}

export function getLcDashboard(workspaceId: string) {
  return apiRequest<LcDashboard>(`/lc/dashboard?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function getLcList(workspaceId: string) {
  return apiRequest<LcListItem[]>(`/lc?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function getLcById(id: string) {
  return apiRequest<LcDetail>(`/lc/${id}`);
}

export function createLc(input: CreateLcInput) {
  return apiRequest<LcDetail>("/lc", { method: "POST", body: JSON.stringify(input) });
}

export function updateLc(id: string, input: UpdateLcInput) {
  return apiRequest<LcDetail>(`/lc/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function setLcStatus(id: string, status: string, reason?: string) {
  return apiRequest<LcDetail>(`/lc/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}

export function deleteLc(id: string) {
  return apiRequest<{ success: boolean; id: string }>(`/lc/${id}`, { method: "DELETE" });
}

export function addLcShipment(id: string, input: CreateLcShipmentInput) {
  return apiRequest<LcDetail>(`/lc/${id}/shipments`, { method: "POST", body: JSON.stringify(input) });
}

export function deleteLcShipment(id: string, shipmentId: string) {
  return apiRequest<LcDetail>(`/lc/${id}/shipments/${shipmentId}`, { method: "DELETE" });
}

export function createLcCostEntry(id: string, input: CreateLcCostEntryInput) {
  return apiRequest<LcDetail>(`/lc/${id}/cost-entries`, { method: "POST", body: JSON.stringify(input) });
}

export function updateLcCostEntry(id: string, costEntryId: string, input: UpdateLcCostEntryInput) {
  return apiRequest<LcDetail>(`/lc/${id}/cost-entries/${costEntryId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteLcCostEntry(id: string, costEntryId: string) {
  return apiRequest<LcDetail>(`/lc/${id}/cost-entries/${costEntryId}`, { method: "DELETE" });
}

export function previewLcAllocation(id: string, costEntryId: string, allocationBasis?: LcAllocationBasis) {
  const query = allocationBasis ? `?allocationBasis=${encodeURIComponent(allocationBasis)}` : "";
  return apiRequest<AllocationPreview>(`/lc/${id}/cost-entries/${costEntryId}/allocation${query}`);
}

export function saveLcAllocation(id: string, costEntryId: string, input: SaveAllocationInput) {
  return apiRequest<LcDetail>(`/lc/${id}/cost-entries/${costEntryId}/allocation`, { method: "POST", body: JSON.stringify(input) });
}

export function createLcGrn(id: string, input: CreateLcGrnInput) {
  return apiRequest<LcDetail>(`/lc/${id}/grns`, { method: "POST", body: JSON.stringify(input) });
}

export function updateLcGrn(id: string, grnId: string, input: CreateLcGrnInput) {
  return apiRequest<LcDetail>(`/lc/${id}/grns/${grnId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function previewLcLandedCost(id: string) {
  return apiRequest<LcLandedCostPreview>(`/lc/${id}/landed-cost`);
}

export function finalizeLcLandedCost(id: string) {
  return apiRequest<LcDetail>(`/lc/${id}/landed-cost/finalize`, { method: "POST" });
}

export function postLcInventory(id: string, input: PostLcInventoryInput) {
  return apiRequest<LcDetail>(`/lc/${id}/landed-cost/post-inventory`, { method: "POST", body: JSON.stringify(input) });
}

export function updateLcInventoryPosting(id: string, input: UpdateLcInventoryPostingInput) {
  return apiRequest<LcDetail>(`/lc/${id}/landed-cost/inventory-posting`, { method: "PATCH", body: JSON.stringify(input) });
}

export function reopenLcLandedCost(id: string, reason: string) {
  return apiRequest<LcDetail>(`/lc/${id}/landed-cost/reopen`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function updateLcLandedCostProfit(id: string, items: LcProfitRowInput[]) {
  return apiRequest<LcDetail>(`/lc/${id}/landed-cost/profit`, { method: "PATCH", body: JSON.stringify({ items }) });
}

export function getLcCostHeads(workspaceId: string) {
  return apiRequest<LcCostHeadRecord[]>(`/lc/cost-heads?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function createLcCostHead(input: CreateLcCostHeadInput) {
  return apiRequest<LcCostHeadRecord>("/lc/cost-heads", { method: "POST", body: JSON.stringify(input) });
}

export function updateLcCostHead(id: string, input: UpdateLcCostHeadInput) {
  return apiRequest<LcCostHeadRecord>(`/lc/cost-heads/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteLcCostHead(id: string) {
  return apiRequest<{ success: boolean; id: string }>(`/lc/cost-heads/${id}`, { method: "DELETE" });
}

export function getLcRegisterReport(workspaceId: string) {
  return apiRequest<LcListItem[]>(`/lc/reports/register?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function getLcCategoryReport(workspaceId: string, category: string) {
  return apiRequest<LcCostPostingReportRow[]>(
    `/lc/reports/by-category?workspaceId=${encodeURIComponent(workspaceId)}&category=${encodeURIComponent(category)}`,
  );
}

export function getLcAllocationReport(id: string) {
  return apiRequest<LcCostEntryRecord[]>(`/lc/${id}/reports/allocation`);
}

export function getLcCostSheetReport(id: string) {
  return apiRequest<{ lc: LcDetail; landedCost: LcLandedCostPreview }>(`/lc/${id}/reports/cost-sheet`);
}
