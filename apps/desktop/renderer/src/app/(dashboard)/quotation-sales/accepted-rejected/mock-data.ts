export interface AcceptedQuotationResult {
  id: string;
  quotationNo: string;
  customer: string;
  project: string;
  quotationDate: string;
  quotationDateLabel: string;
  value: number;
  decisionDate: string;
  decisionDateLabel: string;
  decisionBy: string;
  acceptedAmount: number;
  customerOrderNo: string;
}

export interface RejectedQuotationResult {
  id: string;
  quotationNo: string;
  customer: string;
  project: string;
  quotationDate: string;
  quotationDateLabel: string;
  value: number;
  decisionDate: string;
  decisionDateLabel: string;
  decisionBy: string;
  reason: string;
}

export interface PendingQuotationResult {
  id: string;
  quotationNo: string;
  customer: string;
  project: string;
  quotationDate: string;
  quotationDateLabel: string;
  value: number;
  lastFollowUp: string;
  nextFollowUp: string;
  salesPerson: string;
}

export type DecisionStatus = "Accepted" | "Rejected" | "Pending";

export interface RecentDecision {
  quotationNo: string;
  customer: string;
  project: string;
  status: DecisionStatus;
  date: string;
}

export const ACCEPTED_RESULTS: AcceptedQuotationResult[] = [
  { id: "accepted-1", quotationNo: "QT-2025-0003", customer: "NBR Development Ltd.", project: "Residential Building", quotationDate: "2025-05-10", quotationDateLabel: "10 May 2025", value: 3_750_000, decisionDate: "2025-05-12", decisionDateLabel: "12 May 2025", decisionBy: "Admin User", acceptedAmount: 3_720_000, customerOrderNo: "PO-2505-0012" },
  { id: "accepted-2", quotationNo: "QT-2025-0001", customer: "ABC Infrastructure Ltd.", project: "Office Building Project", quotationDate: "2025-05-15", quotationDateLabel: "15 May 2025", value: 1_850_000, decisionDate: "2025-05-16", decisionDateLabel: "16 May 2025", decisionBy: "Admin User", acceptedAmount: 1_850_000, customerOrderNo: "WO-2505-0007" },
  { id: "accepted-3", quotationNo: "QT-2025-0006", customer: "Prime Construction Ltd.", project: "Shopping Complex", quotationDate: "2025-04-25", quotationDateLabel: "25 Apr 2025", value: 4_250_000, decisionDate: "2025-04-28", decisionDateLabel: "28 Apr 2025", decisionBy: "Md. Rahman", acceptedAmount: 4_250_000, customerOrderNo: "PO-2504-0005" },
  { id: "accepted-4", quotationNo: "QT-2025-0008", customer: "ABC Infrastructure Ltd.", project: "Office Renovation", quotationDate: "2025-04-18", quotationDateLabel: "18 Apr 2025", value: 870_000, decisionDate: "2025-04-20", decisionDateLabel: "20 Apr 2025", decisionBy: "Md. Rahman", acceptedAmount: 870_000, customerOrderNo: "WO-2504-0018" },
  { id: "accepted-5", quotationNo: "QT-2025-0002", customer: "BuildTech Solutions", project: "Warehouse Construction", quotationDate: "2025-05-12", quotationDateLabel: "12 May 2025", value: 2_450_000, decisionDate: "2025-05-14", decisionDateLabel: "14 May 2025", decisionBy: "Admin User", acceptedAmount: 2_430_000, customerOrderNo: "PO-2505-0010" },
];

export const REJECTED_RESULTS: RejectedQuotationResult[] = [
  { id: "rejected-1", quotationNo: "QT-2025-0005", customer: "Metro Builders", project: "Factory Shed Construction", quotationDate: "2025-04-28", quotationDateLabel: "28 Apr 2025", value: 1_650_000, decisionDate: "2025-04-29", decisionDateLabel: "29 Apr 2025", decisionBy: "Md. Rahman", reason: "Budget Constraint" },
  { id: "rejected-2", quotationNo: "QT-2025-0009", customer: "BuildTech Solutions", project: "Warehouse Construction", quotationDate: "2025-04-15", quotationDateLabel: "15 Apr 2025", value: 3_100_000, decisionDate: "2025-04-18", decisionDateLabel: "18 Apr 2025", decisionBy: "Admin User", reason: "Price Not Competitive" },
  { id: "rejected-3", quotationNo: "QT-2025-0013", customer: "Urban Developers Ltd.", project: "Residential Complex", quotationDate: "2025-05-08", quotationDateLabel: "08 May 2025", value: 2_200_000, decisionDate: "2025-05-09", decisionDateLabel: "09 May 2025", decisionBy: "Md. Rahman", reason: "Client Preference" },
];

export const PENDING_RESULTS: PendingQuotationResult[] = [
  { id: "pending-1", quotationNo: "QT-2025-0004", customer: "Green Valley Developers", project: "Road & Drainage Work", quotationDate: "2025-05-05", quotationDateLabel: "05 May 2025", value: 980_000, lastFollowUp: "20 May 2025", nextFollowUp: "27 May 2025", salesPerson: "Admin User" },
  { id: "pending-2", quotationNo: "QT-2025-0007", customer: "Galaxy Properties", project: "Interior Work", quotationDate: "2025-04-22", quotationDateLabel: "22 Apr 2025", value: 620_000, lastFollowUp: "16 May 2025", nextFollowUp: "24 May 2025", salesPerson: "Md. Rahman" },
  { id: "pending-3", quotationNo: "QT-2025-0010", customer: "NBR Development Ltd.", project: "Residential Building", quotationDate: "2025-04-10", quotationDateLabel: "10 Apr 2025", value: 2_150_000, lastFollowUp: "21 May 2025", nextFollowUp: "28 May 2025", salesPerson: "Admin User" },
];

export const RECENT_DECISIONS: RecentDecision[] = [
  { quotationNo: "QT-2025-0003", customer: "NBR Development Ltd.", project: "Residential Building", status: "Accepted", date: "12 May 2025" },
  { quotationNo: "QT-2025-0005", customer: "Green Valley Developers", project: "Road & Drainage Work", status: "Rejected", date: "11 May 2025" },
  { quotationNo: "QT-2025-0001", customer: "ABC Infrastructure Ltd.", project: "Office Building Project", status: "Accepted", date: "16 May 2025" },
  { quotationNo: "QT-2025-0016", customer: "BuildTech Solutions", project: "Warehouse Construction", status: "Pending", date: "17 May 2025" },
];

export const DECISION_STATS = [
  { label: "Accepted", value: 28, percentage: "21.88%", color: "#32b86b" },
  { label: "Rejected", value: 23, percentage: "17.97%", color: "#ee4b55" },
  { label: "Pending", value: 77, percentage: "60.16%", color: "#f4a329" },
] as const;
