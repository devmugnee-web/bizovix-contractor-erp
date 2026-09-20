export interface OrganizationMasterOption {
  id: string;
  shortName: string;
  fullName: string;
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

export interface OrganizationMasterRecord {
  id: string;
  organizationId: string;
  shortName: string;
  fullName: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMasterQuery {
  page?: number;
  limit?: number;
  search?: string;
}
