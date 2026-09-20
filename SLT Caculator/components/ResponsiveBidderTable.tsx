import type { ClassifiedBidder } from "@/types"

import { BidderStatusTable } from "@/components/BidderStatusTable"

interface ResponsiveBidderTableProps {
  bidders: ClassifiedBidder[]
}

export function ResponsiveBidderTable({ bidders }: ResponsiveBidderTableProps) {
  return (
    <BidderStatusTable
      title="Responsive Bidders"
      bidders={bidders}
      tone="success"
    />
  )
}
