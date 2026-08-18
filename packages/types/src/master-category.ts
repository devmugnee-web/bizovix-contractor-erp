import type { MasterCategoryType } from "./enums";

export interface MasterCategoryRecord {
  id: string;
  type: MasterCategoryType;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveMasterCategoryInput {
  type: MasterCategoryType;
  name: string;
  description?: string;
  isActive?: boolean;
}
