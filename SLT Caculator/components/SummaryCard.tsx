import type { ReactNode } from "react"
import { BarChart3, CheckCircle2, Users, XCircle } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface SummaryCardProps {
  totalBidders: number
  responsiveBidders: number
  nonResponsiveBidders: number
}

export function SummaryCard({
  totalBidders,
  responsiveBidders,
  nonResponsiveBidders
}: SummaryCardProps) {
  return (
    <Card className="h-full rounded-[1.75rem] border border-slate-200 bg-white shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row items-center gap-4 p-5">
        <div className="flex size-16 items-center justify-center rounded-full bg-[#0b2c79] text-white">
          <BarChart3 className="size-6" />
        </div>
        <CardTitle className="text-[1.9rem] font-bold text-[#132b72]">Evaluation Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <SummaryMetric
          icon={<Users className="size-6 text-[#2563eb]" />}
          label="Total Bidders"
          value={totalBidders}
        />
        <SummaryMetric
          icon={<CheckCircle2 className="size-6 text-[#16a34a]" />}
          label="Responsive Bidders"
          value={responsiveBidders}
          tone="success"
        />
        <SummaryMetric
          icon={<XCircle className="size-6 text-[#ef4444]" />}
          label="Non Responsive Bidders"
          value={nonResponsiveBidders}
          tone="danger"
        />
      </CardContent>
    </Card>
  )
}

interface SummaryMetricProps {
  icon: ReactNode
  label: string
  value: number
  tone?: "default" | "success" | "danger"
}

function SummaryMetric({ icon, label, value, tone = "default" }: SummaryMetricProps) {
  const toneClasses =
    tone === "success"
      ? "border-[#d7f5df] bg-[linear-gradient(90deg,#ffffff,#f3fbf5)]"
      : tone === "danger"
        ? "border-[#fbd4d4] bg-[linear-gradient(90deg,#ffffff,#fff5f5)]"
        : "border-slate-200 bg-white"

  const valueClasses =
    tone === "success" ? "text-[#16a34a]" : tone === "danger" ? "text-[#ef4444]" : "text-[#132b72]"

  return (
    <div className={`flex items-center justify-between rounded-[1.35rem] border px-5 py-5 ${toneClasses}`}>
      <div className="flex items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-white shadow-sm">{icon}</div>
        <span className="text-[1.15rem] font-semibold text-[#17306b]">{label}</span>
      </div>
      <span className={`metric-mono text-[2rem] font-black ${valueClasses}`}>{value}</span>
    </div>
  )
}
