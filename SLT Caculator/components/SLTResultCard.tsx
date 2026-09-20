import { Trophy } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { formatNumber } from "@/utils/calculator"

interface SLTResultCardProps {
  sltPrice: number
  hasCalculation: boolean
}

export function SLTResultCard({ sltPrice, hasCalculation }: SLTResultCardProps) {
  return (
    <Card className="relative overflow-hidden rounded-[1.9rem] border-0 bg-[linear-gradient(135deg,#08276b,#0d2564_65%,#0a2156)] text-white shadow-[0_20px_60px_rgba(9,32,94,0.35)]">
      <div className="pointer-events-none absolute inset-y-0 right-6 hidden w-40 opacity-25 md:block">
        <div className="absolute right-0 top-4 h-28 w-28 border-r border-dotted border-amber-300/80" />
        <div className="absolute right-7 top-12 h-px w-20 border-t border-dotted border-amber-300/80" />
        <div className="absolute right-6 top-20 h-px w-24 border-t border-dotted border-amber-300/80" />
      </div>
      <CardContent className="flex min-h-[132px] items-center gap-3 p-3 lg:p-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-[#f4c54f] bg-[#0b2b77] text-[#f4c54f] shadow-[inset_0_0_0_10px_rgba(255,255,255,0.02)]">
          <Trophy className="size-8" />
        </div>
        <div className="space-y-1">
          <p className="text-[30px] font-semibold text-white/95">SLT Bidding Price (Cut-off)</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="metric-mono text-[24px] leading-[24px] font-black tracking-tight text-[#f7c85d]">
              {hasCalculation ? formatNumber(sltPrice) : "--"}
            </span>
            <span className="text-[24px] leading-[24px] font-bold tracking-wide text-[#f7c85d]">BDT</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
