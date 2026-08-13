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
}
