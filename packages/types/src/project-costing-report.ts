export interface ProjectCostingReportRow {
  id: string;
  productName: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
}

export interface ProjectCostingReport {
  project: { id: string; workName: string; organizationName: string };
  tenderNumber: string | null;
  source: "PROJECT_BOQ" | "TENDER_COSTING";
  costingDate?: string;
  itemsTotalPrice?: string;
  adjustments?: { label: string; amount: string }[];
  pa: {
    name: string | null;
    designation: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  rows: ProjectCostingReportRow[];
  totalPrice: string;
  emptyReason: "NO_BOQ_ITEMS" | "NO_COSTED_ITEMS" | null;
}

export interface CostedTenderBillSummary {
  id: string;
  tenderId: string;
  tenderNumber: string | null;
  workName: string;
  paName: string | null;
  itemCount: number;
  unitRate: string | null;
  grandTotal: string;
}
