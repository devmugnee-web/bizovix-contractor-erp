export interface PaymentTermRecord {
  id: string;
  name: string;
  days: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Optional desktop metadata; business fields keep their cloud API shape. */
  syncStatus?: "SYNCED" | "PENDING" | "REJECTED";
  version?: number;
  operationId?: string;
  syncError?: { kind: string; message: string };
  cloudRecord?: PaymentTermRecord;
}

export interface SavePaymentTermInput {
  name: string;
  days?: number;
  description?: string;
  isActive?: boolean;
}
