export interface UomRecord {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Optional desktop metadata; business fields keep their cloud API shape. */
  syncStatus?: "SYNCED" | "PENDING" | "REJECTED";
  version?: number;
  operationId?: string;
  syncError?: { kind: string; message: string };
  cloudRecord?: UomRecord;
}

export interface SaveUomInput {
  code: string;
  name: string;
  symbol?: string;
  isActive?: boolean;
}
