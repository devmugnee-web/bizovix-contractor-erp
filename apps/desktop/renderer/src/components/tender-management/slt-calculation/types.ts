export type BidderStatus = "Responsive" | "Non Responsive";
export type ImportMode = "replace" | "append";

export interface BidderRow {
  id: string;
  name: string;
  amount: string;
  included: boolean;
}

export interface ClassifiedBidder {
  id: string;
  serial: number;
  name: string;
  amount: number;
  status: BidderStatus;
  vsApp: number | null;
}

export interface CalculationMetrics {
  appAmount: number;
  nppiPercent: number;
  averageBid: number;
  nppiAmount: number;
  weightedAverage: number;
  standardDeviation: number;
  sltPrice: number;
  totalValidBidders: number;
}

export interface PdfImportedBidderRow {
  id: string;
  serial: string;
  name: string;
  amount: string;
  status: "Ready" | "Needs Review";
  notes: string[];
  confidence: number | null;
}
