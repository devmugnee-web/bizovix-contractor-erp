export type BidderStatus = "Responsive" | "Non Responsive"
export type ImportedBidderStatus = "Ready" | "Needs Review"
export type ScreenshotImportMode = "replace" | "append"

export interface BidderRow {
  id: string
  name: string
  amount: string
  checked: boolean
}

export interface ImportedBidderRow {
  id: string
  name: string
  amount: string
  status: ImportedBidderStatus
  notes: string[]
  confidence: number | null
}

export interface ClassifiedBidder {
  id: string
  serial: number
  name: string
  amount: number
  status: BidderStatus
  vsApp: number | null
}

export interface CalculationMetrics {
  appAmount: number
  nppiPercent: number
  averageBid: number
  nppiAmount: number
  weightedAverage: number
  standardDeviation: number
  sltPrice: number
  totalValidBidders: number
}
