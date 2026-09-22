export interface OrganizationMasterOption {
  id: string;
  shortName: string;
  fullName: string;
  version?: number;
  syncStatus?: "SYNCED" | "PENDING" | "REJECTED";
  operationId?: string;
  syncError?: { kind: string; message: string };
  cloudRecord?: OrganizationMasterOption;
}

export interface BankAccountOption {
  id: string;
  accountName: string;
  accountType: "BANK" | "CASH";
  bankName?: string | null;
  accountNumber?: string | null;
  isActive: boolean;
  ledgerAccountId?: string | null;
  cashRole?: "MAIN_CASH" | "PETTY_CASH" | null;
}

export interface OrganizationMasterRecord extends OrganizationMasterOption {
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMasterQuery {
  page?: number;
  limit?: number;
  search?: string;
}
