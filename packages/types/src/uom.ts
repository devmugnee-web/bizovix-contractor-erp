export interface UomRecord {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveUomInput {
  code: string;
  name: string;
  symbol?: string;
  isActive?: boolean;
}
