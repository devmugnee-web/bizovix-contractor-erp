export type CmsWorkStatus =
  | "ONGOING"
  | "COMPLETION_PENDING"
  | "DLP"
  | "CLOSEOUT_PENDING"
  | "COMPLETED"
  | "ARCHIVED"
  | "CANCELLED";

export interface CmsWork {
  id: string;
  tenderId: string | null;
  tenderNumber: string | null;
  workName: string;
  workCategory: string;
  contractValue: string;
  status: CmsWorkStatus;
  startDate: string | null;
  expectedCompletionDate: string | null;
  completionDate: string | null;
  organizationMaster: { id: string; shortName: string; fullName: string };
}

export interface CmsWorkQuery {
  page?: number;
  limit?: number;
  status?: CmsWorkStatus;
  /** Include every non-cancelled project lifecycle state instead of defaulting to ongoing only. */
  includeClosed?: boolean;
  search?: string;
  organizationMasterId?: string;
  workCategory?: string;
  completionDateFrom?: string;
  completionDateTo?: string;
}

export interface CmsWorkStats {
  ongoingWorks: number;
  archivedWorks: number;
  totalWorkValue: string;
}

export interface CmsWorkExport {
  filename: string;
  content: string;
}

export interface CreateCmsWorkInput {
  organizationMasterId: string;
  workName: string;
  workCategory: string;
  contractValue: number;
  startDate?: string;
  expectedCompletionDate?: string;
  /** Real FK to the awarded Tender — the Award → CMS handoff link. */
  tenderId?: string;
}

export interface CmsWorkOverviewTransaction {
  id: string;
  date: string;
  type: "EXPENSE" | "RECEIPT";
  item: string;
  amount: string;
  party: string;
  referenceNo: string | null;
  remarks: string | null;
}

export interface CmsWorkOverview {
  project: CmsWork & { contractId: string | null };
  primaryContact: { id: string; name: string; designation: string; mobile: string; email: string | null; address: string } | null;
  otherContacts: Array<{ id: string; name: string; designation: string; mobile: string; email: string | null; address: string }>;
  financial: {
    noaAmount: string | null;
    contractValue: string;
    vatRate: string | null;
    vatAmount: string | null;
    taxRate: string | null;
    taxAmount: string | null;
    valueAfterVatTax: string | null;
    securityDeposit: { state: "NOT_APPLICABLE" | "NOT_CONFIGURED" | "CONFIGURED"; rate: string | null; amount: string | null; heldAmount: string | null; method: string | null; status: string | null; releasedDate: string | null };
    netReceivableAfterSd: string | null;
  };
  transactions: CmsWorkOverviewTransaction[];
  summary: {
    totalExpense: string;
    totalReceipt: string;
    totalVatDeducted: string;
    totalTaxDeducted: string;
    totalSecurityDepositDeducted: string;
    totalRetentionReceived: string;
    totalOtherDeduction: string;
    netContractAfterVatTax: string;
    regularPaymentReceivable: string;
    securityDepositReceivable: string;
    totalOutstandingReceivable: string;
    currentCashProfit: string;
    projectedFinalProfit: string;
    currentCashMarginPct: string | null;
    projectedMarginPct: string | null;
    securityDepositHeld: string | null;
    balanceReceivable: string | null;
    currentMarginPct: string | null;
  };
}
