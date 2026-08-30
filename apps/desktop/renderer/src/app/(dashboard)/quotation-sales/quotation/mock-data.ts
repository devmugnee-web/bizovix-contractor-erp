export type SalesQuotationStatus = "Draft" | "Sent" | "Accepted" | "Rejected";

export interface SalesQuotationRow {
  id: string;
  quotationNo: string;
  customer: string;
  project: string;
  quotationDate: string;
  quotationDateLabel: string;
  validUntil: string;
  validUntilLabel: string;
  value: number;
  status: SalesQuotationStatus;
}

export const SALES_QUOTATIONS: SalesQuotationRow[] = [
  { id: "qt-128", quotationNo: "QT-2024-0128", customer: "ABC Infrastructure Ltd.", project: "Office Building Project", quotationDate: "2025-05-28", quotationDateLabel: "28 May 2025", validUntil: "2025-06-27", validUntilLabel: "27 Jun 2025", value: 1_850_000, status: "Draft" },
  { id: "qt-127", quotationNo: "QT-2024-0127", customer: "BuildTech Solutions", project: "Warehouse Construction", quotationDate: "2025-05-27", quotationDateLabel: "27 May 2025", validUntil: "2025-06-26", validUntilLabel: "26 Jun 2025", value: 2_450_000, status: "Sent" },
  { id: "qt-126", quotationNo: "QT-2024-0126", customer: "NBR Development Ltd.", project: "Residential Building", quotationDate: "2025-05-26", quotationDateLabel: "26 May 2025", validUntil: "2025-06-25", validUntilLabel: "25 Jun 2025", value: 3_750_000, status: "Accepted" },
  { id: "qt-125", quotationNo: "QT-2024-0125", customer: "Green Valley Developers", project: "Road & Drainage Work", quotationDate: "2025-05-25", quotationDateLabel: "25 May 2025", validUntil: "2025-06-24", validUntilLabel: "24 Jun 2025", value: 980_000, status: "Rejected" },
  { id: "qt-124", quotationNo: "QT-2024-0124", customer: "Metro Builders", project: "Factory Shed Construction", quotationDate: "2025-05-24", quotationDateLabel: "24 May 2025", validUntil: "2025-06-23", validUntilLabel: "23 Jun 2025", value: 1_650_000, status: "Sent" },
  { id: "qt-123", quotationNo: "QT-2024-0123", customer: "Prime Construction Ltd.", project: "Shopping Complex", quotationDate: "2025-05-23", quotationDateLabel: "23 May 2025", validUntil: "2025-06-22", validUntilLabel: "22 Jun 2025", value: 4_250_000, status: "Draft" },
  { id: "qt-122", quotationNo: "QT-2024-0122", customer: "Galaxy Properties", project: "Interior Work", quotationDate: "2025-05-22", quotationDateLabel: "22 May 2025", validUntil: "2025-06-21", validUntilLabel: "21 Jun 2025", value: 620_000, status: "Sent" },
  { id: "qt-121", quotationNo: "QT-2024-0121", customer: "ABC Infrastructure Ltd.", project: "Office Renovation", quotationDate: "2025-05-21", quotationDateLabel: "21 May 2025", validUntil: "2025-06-20", validUntilLabel: "20 Jun 2025", value: 870_000, status: "Accepted" },
  { id: "qt-120", quotationNo: "QT-2024-0120", customer: "BuildTech Solutions", project: "Warehouse Construction", quotationDate: "2025-05-20", quotationDateLabel: "20 May 2025", validUntil: "2025-06-19", validUntilLabel: "19 Jun 2025", value: 3_100_000, status: "Rejected" },
  { id: "qt-119", quotationNo: "QT-2024-0119", customer: "NBR Development Ltd.", project: "Residential Building", quotationDate: "2025-05-19", quotationDateLabel: "19 May 2025", validUntil: "2025-06-18", validUntilLabel: "18 Jun 2025", value: 2_150_000, status: "Draft" },
];

export const QUOTATION_STATS = [
  { label: "Draft", value: 32, percentage: "25.00%", color: "#8490a6" },
  { label: "Sent", value: 45, percentage: "35.16%", color: "#1169e8" },
  { label: "Accepted", value: 28, percentage: "21.88%", color: "#2daf65" },
  { label: "Rejected", value: 23, percentage: "17.97%", color: "#e43f4f" },
] as const;

export const QUOTATION_REFERENCE_TOTAL = 128;
export const QUOTATION_REFERENCE_VALUE = 18_540_000;
