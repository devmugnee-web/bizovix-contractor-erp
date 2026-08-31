import type { TenderCostingStatus } from "./enums";

export interface TenderCostingUser {
  id: string;
  name: string;
  email: string;
}

export interface TenderCostingItemRecord {
  id: string;
  organizationId: string;
  costingId: string;
  description: string;
  secondaryDescription: string | null;
  unit: string;
  quantity: string;
  unitCost: string;
  marginPercent: string;
  totalCost: string;
  ourCost: string;
  remarks: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TenderCostingRecord {
  id: string;
  organizationId: string;
  tenderId: string;
  status: TenderCostingStatus;
  costingDate: string;
  source: string | null;
  currency: string;
  exchangeRate: string;
  costingVersion: number;
  remarks: string | null;
  preparedByUserId: string | null;
  preparedByName: string | null;
  costingBudget: string | null;
  estimatedValue: string;
  estimatedCost: string;
  ourCost: string;
  marginPercent: string;
  freightCost: string;
  installationCost: string;
  otherCost: string;
  contingencyPercent: string;
  contingencyAmount: string;
  validityDays: number | null;
  paymentTermId: string | null;
  deliveryTime: string | null;
  warranty: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  approvedForCostingAt: string;
  approvedForCostingById: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  tender: {
    id: string;
    egpTenderId: string | null;
    workName: string;
    category: string | null;
    contractValue: string;
    organizationMaster: { id: string; shortName: string; fullName: string } | null;
  };
  preparedBy: TenderCostingUser | null;
  assignedTo: TenderCostingUser | null;
  approvedForCostingBy: TenderCostingUser | null;
}

export interface TenderCostingDetail extends TenderCostingRecord {
  items: TenderCostingItemRecord[];
  paymentTerm: { id: string; name: string; days: number } | null;
}

export interface SaveTenderCostingItemInput {
  description: string;
  secondaryDescription?: string;
  unit: string;
  quantity: number;
  unitCost: number;
  marginPercent: number;
  remarks?: string;
  sortOrder?: number;
}

export interface SaveTenderCostingInput {
  version: number;
  status: TenderCostingStatus;
  costingDate: string;
  source?: string;
  currency: string;
  exchangeRate: number;
  costingVersion: number;
  remarks?: string;
  preparedByUserId?: string;
  preparedByName?: string;
  freightCost: number;
  installationCost: number;
  otherCost: number;
  contingencyPercent: number;
  validityDays?: number;
  paymentTermId?: string;
  deliveryTime?: string;
  warranty?: string;
  assignedToUserId?: string;
  assignedToName?: string;
  items: SaveTenderCostingItemInput[];
}

export interface SetTenderCostingBudgetInput {
  version: number;
  costingBudget: number;
}

export interface TenderCostingQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: TenderCostingStatus;
  organizationMasterId?: string;
  assignedToUserId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface TenderCostingStats {
  total: number;
  ready: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  totalEstimatedValue: string;
  totalCostingBudget: string;
  totalEstimatedCost: string;
  totalOurCost: string;
}
