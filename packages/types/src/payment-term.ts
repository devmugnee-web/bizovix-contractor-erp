export interface PaymentTermRecord {
  id: string;
  name: string;
  days: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavePaymentTermInput {
  name: string;
  days?: number;
  description?: string;
  isActive?: boolean;
}
