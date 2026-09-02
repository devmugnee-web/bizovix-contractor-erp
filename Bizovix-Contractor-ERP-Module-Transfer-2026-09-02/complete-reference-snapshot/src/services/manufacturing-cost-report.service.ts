import { apiRequest } from "@/services/api-client";
import type {
  ManufacturingActualCostPostingRecord,
  ManufacturingCostConfiguration,
  ManufacturingCostDriverBasis,
  ManufacturingCostDriverRecord,
  ManufacturingOrderCostingRecord,
  ManufacturingReportQuery,
  ManufacturingReportResult,
  ManufacturingStandardCostLineInput,
  ManufacturingStandardCostVersionRecord,
} from "@/types/manufacturing-cost-report";

type QueryValue = string | number | boolean | null | undefined;

function withQuery(path: string, entries: Array<[string, QueryValue]>) {
  const params = new URLSearchParams();
  for (const [key, value] of entries)
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function getManufacturingCostConfiguration(workspaceId: string) {
  return apiRequest<ManufacturingCostConfiguration>(
    withQuery("/manufacturing/cost-reports/configuration", [
      ["workspaceId", workspaceId],
    ]),
  );
}

export function listManufacturingCostDrivers(
  workspaceId: string,
  options?: { active?: boolean; costType?: string; search?: string },
) {
  return apiRequest<ManufacturingCostDriverRecord[]>(
    withQuery("/manufacturing/cost-reports/drivers", [
      ["workspaceId", workspaceId],
      ["active", options?.active],
      ["costType", options?.costType],
      ["search", options?.search],
    ]),
  );
}

export function createManufacturingCostDriver(input: {
  workspaceId: string;
  code: string;
  name: string;
  costType: string;
  basis: ManufacturingCostDriverBasis;
  unit?: string | null;
  rate: number;
  clearingAccountId: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive?: boolean;
}) {
  return apiRequest<ManufacturingCostDriverRecord>(
    "/manufacturing/cost-reports/drivers",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateManufacturingCostDriver(
  driverId: string,
  input: Partial<{
    code: string;
    name: string;
    costType: string;
    basis: ManufacturingCostDriverBasis;
    unit: string | null;
    rate: number;
    clearingAccountId: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    isActive: boolean;
  }> & { workspaceId: string },
) {
  return apiRequest<ManufacturingCostDriverRecord>(
    `/manufacturing/cost-reports/drivers/${encodeURIComponent(driverId)}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function listManufacturingStandardCosts(
  workspaceId: string,
  options?: { inventoryItemId?: string; status?: string },
) {
  return apiRequest<ManufacturingStandardCostVersionRecord[]>(
    withQuery("/manufacturing/cost-reports/standard-costs", [
      ["workspaceId", workspaceId],
      ["inventoryItemId", options?.inventoryItemId],
      ["status", options?.status],
    ]),
  );
}

export function createManufacturingStandardCost(input: {
  workspaceId: string;
  inventoryItemId: string;
  currency?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  notes?: string | null;
  lines: ManufacturingStandardCostLineInput[];
}) {
  return apiRequest<ManufacturingStandardCostVersionRecord>(
    "/manufacturing/cost-reports/standard-costs",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function approveManufacturingStandardCost(
  versionId: string,
  input: {
    workspaceId: string;
    transactionDate: string;
    idempotencyKey: string;
    note?: string | null;
  },
) {
  return apiRequest<ManufacturingStandardCostVersionRecord>(
    `/manufacturing/cost-reports/standard-costs/${encodeURIComponent(versionId)}/approve`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function getManufacturingOrderCosting(
  workspaceId: string,
  orderId: string,
) {
  return apiRequest<ManufacturingOrderCostingRecord>(
    withQuery(
      `/manufacturing/cost-reports/orders/${encodeURIComponent(orderId)}`,
      [["workspaceId", workspaceId]],
    ),
  );
}

export function postManufacturingActualCost(
  orderId: string,
  input: {
    workspaceId: string;
    costDriverId: string;
    transactionDate: string;
    idempotencyKey: string;
    basisQuantity?: number;
    description?: string;
    referenceNo?: string | null;
    note?: string | null;
  },
) {
  return apiRequest<ManufacturingActualCostPostingRecord>(
    `/manufacturing/cost-reports/orders/${encodeURIComponent(orderId)}/actuals`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function finalizeManufacturingActualCost(
  orderId: string,
  input: {
    workspaceId: string;
    transactionDate: string;
    idempotencyKey: string;
    standardCostVersionId?: string | null;
    note?: string | null;
  },
) {
  return apiRequest<{
    snapshot: ManufacturingOrderCostingRecord["snapshots"][number] | null;
    order: ManufacturingOrderCostingRecord["order"];
  }>(
    `/manufacturing/cost-reports/orders/${encodeURIComponent(orderId)}/finalize`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function getManufacturingReport(
  report: string,
  query: ManufacturingReportQuery,
) {
  return apiRequest<ManufacturingReportResult>(
    withQuery(
      `/manufacturing/cost-reports/reports/${encodeURIComponent(report)}`,
      [
        ["workspaceId", query.workspaceId],
        ["from", query.from],
        ["to", query.to],
        ["orderId", query.orderId],
        ["inventoryItemId", query.inventoryItemId],
        ["warehouseId", query.warehouseId],
        ["status", query.status],
        ["lotNumber", query.lotNumber],
        ["serialNumber", query.serialNumber],
        ["search", query.search],
        ["limit", query.limit],
      ],
    ),
  );
}
