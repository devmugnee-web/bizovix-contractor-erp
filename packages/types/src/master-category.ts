import type { MasterCategoryType } from "./enums";

export interface MasterCategoryRecord {
  id: string;
  type: MasterCategoryType;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present only for the desktop's supported offline category workflow. */
  syncStatus?: "SYNCED" | "PENDING" | "REJECTED";
  version?: number;
  operationId?: string;
  syncError?: { kind: string; message: string };
  cloudCategory?: MasterCategoryRecord;
}

export interface SaveMasterCategoryInput {
  type: MasterCategoryType;
  name: string;
  description?: string;
  isActive?: boolean;
}
