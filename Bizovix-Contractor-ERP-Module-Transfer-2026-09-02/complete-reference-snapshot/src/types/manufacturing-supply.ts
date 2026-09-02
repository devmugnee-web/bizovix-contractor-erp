import type { ManufacturingPlanningApprovalInput } from "@/types/manufacturing";

export type ManufacturingSupplySuggestionType =
  "PURCHASE_REQUISITION" | "STOCK_TRANSFER";

export type ManufacturingSupplySuggestionStatus =
  "PENDING" | "APPROVAL_PENDING" | "APPROVED" | "CONVERTED" | "REJECTED";

export type ManufacturingSupplySuggestionActor =
  string | { id: string; name: string } | null;

export interface ManufacturingSupplySuggestionRecord {
  id: string;
  suggestionNumber: string;
  type: ManufacturingSupplySuggestionType;
  status: ManufacturingSupplySuggestionStatus;
  mrpRunId: string;
  mrpRunNumber: string;
  mrpRequirementId: string;
  item: {
    id: string;
    code: string;
    name: string;
  };
  requestedQuantity: number;
  unit: string;
  requiredDate: string | null;
  sourceWarehouse: {
    id: string;
    code: string;
    name: string;
  } | null;
  destinationWarehouse: {
    id: string;
    code: string;
    name: string;
  } | null;
  shortageQuantity: number;
  note: string | null;
  externalReference: string | null;
  expectedReceiptDate: string | null;
  warehouseTransfer: {
    id: string;
    transferNo: string;
    status: string;
  } | null;
  createdBy: ManufacturingSupplySuggestionActor;
  approvedBy: ManufacturingSupplySuggestionActor;
  createdAt: string;
  updatedAt: string;
}

export interface ManufacturingSupplySuggestionListQuery {
  workspaceId: string;
  type?: ManufacturingSupplySuggestionType;
  status?: ManufacturingSupplySuggestionStatus;
  mrpRunId?: string;
}

export interface CreateManufacturingSupplySuggestionInput {
  workspaceId: string;
  mrpRequirementId: string;
  type: ManufacturingSupplySuggestionType;
  requestedQuantity: number;
  sourceWarehouseId?: string | null;
  destinationWarehouseId?: string | null;
  transactionDate: string;
  idempotencyKey: string;
  note?: string | null;
}

export type ApproveManufacturingSupplySuggestionInput =
  ManufacturingPlanningApprovalInput;

export interface ConvertManufacturingSupplySuggestionInput {
  workspaceId: string;
  transactionDate: string;
  idempotencyKey: string;
  externalReference?: string | null;
  expectedReceiptDate?: string | null;
  note?: string | null;
}

export interface CancelManufacturingSupplySuggestionInput {
  workspaceId: string;
  transactionDate: string;
  idempotencyKey: string;
  reason: string;
}

export type ManufacturingSupplySuggestionMutationResult =
  | ManufacturingSupplySuggestionRecord
  | {
      suggestion: ManufacturingSupplySuggestionRecord;
      replayed?: boolean;
      approvalProgress?: {
        totalStages: number;
        completedStages: number;
        nextStage: number | null;
        complete: boolean;
      };
    };
