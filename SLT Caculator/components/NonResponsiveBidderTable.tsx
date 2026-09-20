import type { ClassifiedBidder } from "@/types"

import { BidderStatusTable } from "@/components/BidderStatusTable"

interface NonResponsiveBidderTableProps {
  bidders: ClassifiedBidder[]
}

export function NonResponsiveBidderTable({ bidders }: NonResponsiveBidderTableProps) {
  return (
    <BidderStatusTable
      title="Non Responsive Bidders"
      bidders={bidders}
      tone="danger"
    />
  )
}
