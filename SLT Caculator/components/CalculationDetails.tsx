import { Sigma, TrendingUp } from "lucide-react"

import type { CalculationMetrics } from "@/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatNumber, formatPercent } from "@/utils/calculator"

interface CalculationDetailsProps {
  metrics: CalculationMetrics
  visible: boolean
  hasCalculation: boolean
}

export function CalculationDetails({
  metrics,
  visible,
  hasCalculation
}: CalculationDetailsProps) {
  if (!visible) {
    return null
  }

  return (
    <Card className="border border-[#e7edf8]">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-[#eef3ff] text-[var(--color-primary)]">
            <TrendingUp className="size-5" />
          </div>
          <div>
            <CardTitle className="text-xl text-[#17306b]">Calculation Details</CardTitle>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Full formula breakdown for the current APP, NPPI, and bidder set.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="Average Bid Price" value={hasCalculation ? formatCurrency(metrics.averageBid) : "--"} />
          <MetricCard title="NPPI Amount" value={hasCalculation ? formatCurrency(metrics.nppiAmount) : "--"} />
          <MetricCard title="Weighted Average" value={hasCalculation ? formatCurrency(metrics.weightedAverage) : "--"} />
          <MetricCard title="Standard Deviation" value={hasCalculation ? formatCurrency(metrics.standardDeviation) : "--"} />
          <MetricCard title="SLT Price" value={hasCalculation ? formatCurrency(metrics.sltPrice) : "--"} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-5">
            <div className="mb-4 flex items-center gap-2 text-[#17306b]">
              <Sigma className="size-4" />
              <h3 className="font-semibold">Applied Formulas</h3>
            </div>
            <ul className="space-y-3 text-sm leading-7 text-slate-700">
              <li>Average Bid Price = Sum of all valid bidding amounts / Number of valid bidders</li>
              <li>NPPI Amount = APP × NPPI / 100</li>
              <li>Weighted Average = (0.5 × Average Bid) + (0.2 × APP) + (0.3 × NPPI Amount)</li>
              <li>Standard Deviation = sqrt(Σ(bidAmount - weightedAverage)^2 / valid bidders)</li>
              <li>SLT Bidding Price = Weighted Average - Standard Deviation</li>
            </ul>
          </div>

          <div className="rounded-[1.25rem] border border-slate-200 bg-white p-5">
            <h3 className="mb-4 font-semibold text-[#17306b]">Current Inputs Snapshot</h3>
            <dl className="space-y-3 text-sm">
              <SnapshotRow label="APP Amount" value={formatCurrency(metrics.appAmount)} />
              <SnapshotRow label="NPPI" value={formatPercent(metrics.nppiPercent)} />
              <SnapshotRow label="Valid Bidders" value={formatNumber(metrics.totalValidBidders)} />
            </dl>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface MetricCardProps {
  title: string
  value: string
}

function MetricCard({ title, value }: MetricCardProps) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="metric-mono mt-3 text-xl font-bold text-[#17306b]">{value}</p>
    </div>
  )
}

interface SnapshotRowProps {
  label: string
  value: string
}

function SnapshotRow({ label, value }: SnapshotRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="metric-mono font-semibold text-slate-800">{value}</dd>
    </div>
  )
}
