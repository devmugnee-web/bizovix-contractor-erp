import { Check, CheckCircle2, X, XCircle } from "lucide-react"

import type { ClassifiedBidder } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNumber, formatPercent } from "@/utils/calculator"

interface BidderStatusTableProps {
  title: string
  description?: string
  bidders: ClassifiedBidder[]
  tone: "success" | "danger"
}

export function BidderStatusTable({
  title,
  description,
  bidders,
  tone
}: BidderStatusTableProps) {
  const isSuccess = tone === "success"

  return (
    <Card
      className={
        isSuccess
          ? "rounded-[1.75rem] border border-[#d9f1df] bg-[linear-gradient(180deg,#fbfffc,#ffffff)] shadow-[var(--shadow-card)]"
          : "rounded-[1.75rem] border border-[#f8d4d4] bg-[linear-gradient(180deg,#fffafa,#ffffff)] shadow-[var(--shadow-card)]"
      }
    >
      <CardHeader className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className={`flex items-center gap-4 ${isSuccess ? "text-[#12904b]" : "text-[#ef2f2f]"}`}>
            <div
              className={`flex size-14 items-center justify-center rounded-full ${
                isSuccess ? "bg-[#15924c]" : "bg-[#ef2f2f]"
              } text-white shadow-sm`}
            >
              {isSuccess ? <Check className="size-7" /> : <X className="size-7" />}
            </div>
            <div>
              <CardTitle className="text-[1.8rem] font-bold">{title}</CardTitle>
              {description ? <p className="text-sm leading-6 text-[#7080aa]">{description}</p> : null}
            </div>
          </div>
        </div>
        <div
          className={`rounded-full px-5 py-3 text-lg font-bold ${
            isSuccess ? "bg-[#edf8f0] text-[#12904b]" : "bg-[#fff0f0] text-[#ef2f2f]"
          }`}
        >
          {bidders.length} Bidders
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="overflow-hidden rounded-[1.1rem] border border-slate-200 bg-white">
          <table className="w-full table-fixed border-collapse">
            <thead className={isSuccess ? "bg-[#12904b]" : "bg-[#ef2f2f]"}>
              <tr>
                <th className="w-[12%] px-3 py-3 text-center text-[15px] font-semibold text-white">SL No</th>
                <th className="w-[24%] px-3 py-3 text-center text-[15px] font-semibold text-white">Bidder Name</th>
                <th className="w-[30%] px-3 py-3 text-center text-[15px] font-semibold text-white">Bidding Amount (BDT)</th>
                <th className="w-[19%] px-3 py-3 text-center text-[15px] font-semibold text-white">Vs. APP</th>
                <th className="w-[15%] px-3 py-3 text-center text-[15px] font-semibold text-white">Status</th>
              </tr>
            </thead>
            <tbody>
              {bidders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No bidders in this section yet.
                  </td>
                </tr>
              ) : (
                bidders.map((bidder) => {
                  const comparison = bidder.vsApp ?? 0

                  return (
                    <tr key={bidder.id} className="border-t border-slate-100">
                      <td className="px-3 py-3 text-center text-sm font-semibold text-[#132b72]">{bidder.serial}</td>
                      <td className="px-3 py-3 text-center text-sm font-semibold break-words text-[#132b72]">{bidder.name}</td>
                      <td className="metric-mono px-3 py-3 text-center text-sm font-semibold text-[#132b72]">
                        {formatNumber(bidder.amount)}
                      </td>
                      <td className="metric-mono px-3 py-3 text-center text-sm font-semibold text-[#132b72]">
                        {formatPercent(comparison, { signed: true })}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge variant={isSuccess ? "success" : "danger"} className="mx-auto min-w-0 justify-center px-2 py-0.5 text-xs">
                          {isSuccess ? "Pass" : "Fail"}
                        </Badge>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div
          className={`flex items-center justify-center gap-3 rounded-2xl px-4 py-4 text-center font-semibold ${
            isSuccess ? "bg-[#edf8f0] text-[#12904b]" : "bg-[#fff0f0] text-[#ef2f2f]"
          }`}
        >
          {isSuccess ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
          {isSuccess ? "Total Responsive Bidders" : "Total Non Responsive Bidders"}: {bidders.length}
        </div>
      </CardContent>
    </Card>
  )
}
