"use client"

import { useMemo, useState } from "react"
import { Building2, ChartColumnBig, ClipboardList } from "lucide-react"

import type { BidderRow, CalculationMetrics } from "@/types"
import { ActionButtons } from "@/components/ActionButtons"
import { AppInputCard } from "@/components/AppInputCard"
import { BidderTable } from "@/components/BidderTable"
import { ImportPdfModal } from "@/components/ImportPdfModal"
import { NonResponsiveBidderTable } from "@/components/NonResponsiveBidderTable"
import { ResponsiveBidderTable } from "@/components/ResponsiveBidderTable"
import { SLTResultCard } from "@/components/SLTResultCard"
import { SummaryCard } from "@/components/SummaryCard"
import {
  calculateAverageBid,
  calculateNPPIAmount,
  calculateSLT,
  calculateStandardDeviation,
  calculateWeightedAverage,
  classifyBidders,
  normalizeNumericInput,
  parseNumber
} from "@/utils/calculator"
import { formatPdfAmountForCalculator, type PdfImportedBidderRow } from "@/utils/tenderPdfImport"

function createBidderRow(): BidderRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    amount: "",
    checked: true
  }
}

export function SLTCalculator() {
  const [appAmountInput, setAppAmountInput] = useState("")
  const [nppiInput, setNppiInput] = useState("89")
  const [bidders, setBidders] = useState<BidderRow[]>(() => [createBidderRow()])
  const [isPdfImportModalOpen, setIsPdfImportModalOpen] = useState(false)

  const calculatedAt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date()),
    []
  )

  const metrics = useMemo(() => {
    const appAmount = parseNumber(appAmountInput)
    const nppiPercent = parseNumber(nppiInput)
    const classified = classifyBidders(bidders, appAmount, Number.POSITIVE_INFINITY)
    const amounts = classified.validBidders.map((bidder) => bidder.amount)
    const averageBid = calculateAverageBid(amounts)
    const nppiAmount = calculateNPPIAmount(appAmount, nppiPercent)
    const weightedAverage = calculateWeightedAverage(averageBid, appAmount, nppiAmount)
    const standardDeviation = calculateStandardDeviation(amounts, weightedAverage)
    const sltPrice = calculateSLT(weightedAverage, standardDeviation)

    return {
      appAmount,
      nppiPercent,
      averageBid,
      nppiAmount,
      weightedAverage,
      standardDeviation,
      sltPrice,
      totalValidBidders: classified.validBidders.length
    } satisfies CalculationMetrics
  }, [appAmountInput, bidders, nppiInput])

  const hasCalculation = metrics.appAmount > 0 && nppiInput.trim() !== "" && metrics.totalValidBidders > 0

  const bidderGroups = useMemo(
    () =>
      hasCalculation
        ? classifyBidders(bidders, metrics.appAmount, metrics.sltPrice)
        : { responsive: [], nonResponsive: [], validBidders: [] },
    [bidders, hasCalculation, metrics.appAmount, metrics.sltPrice]
  )

  function updateBidder(id: string, field: "name" | "amount", value: string) {
    setBidders((currentBidders) =>
      currentBidders.map((bidder) =>
        bidder.id === id
          ? {
              ...bidder,
              [field]:
                field === "amount"
                  ? normalizeNumericInput(value, { allowDecimal: true, maxDecimals: 2 })
                  : value
            }
          : bidder
      )
    )
  }

  function toggleBidder(id: string) {
    setBidders((currentBidders) =>
      currentBidders.map((bidder) =>
        bidder.id === id
          ? {
              ...bidder,
              checked: bidder.checked === false
            }
          : bidder
      )
    )
  }

  function addBidder() {
    setBidders((currentBidders) => [...currentBidders, createBidderRow()])
  }

  function deleteBidder(id: string) {
    setBidders((currentBidders) => {
      if (currentBidders.length === 1) {
        return currentBidders
      }

      return currentBidders.filter((bidder) => bidder.id !== id)
    })
  }

  function importPdfBidderRows(rows: PdfImportedBidderRow[], mode: "replace" | "append") {
    const importedRows = rows.map((row) => ({
      id: crypto.randomUUID(),
      name: row.name.trim(),
      amount: formatPdfAmountForCalculator(row.amount),
      checked: true
    }))

    setBidders((currentBidders) => {
      const hasExistingData = currentBidders.some((bidder) => bidder.name.trim() || parseNumber(bidder.amount) > 0)
      return mode === "append" && hasExistingData ? [...currentBidders, ...importedRows] : importedRows
    })
  }

  function resetAll() {
    setAppAmountInput("")
    setNppiInput("89")
    setBidders([createBidderRow()])
  }

  function showPlaceholderExport(type: "PDF" | "Excel") {
    window.alert(`${type} export will be connected in the next step.`)
  }

  return (
    <main className="min-h-screen px-3 py-4 sm:px-5 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1520px] rounded-[2rem] border border-white/80 bg-white/90 p-4 shadow-[var(--shadow-soft)] backdrop-blur md:p-6 xl:p-8">
        <section className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-22 shrink-0 items-center justify-center rounded-[1.7rem] bg-[linear-gradient(180deg,#0b2c79,#08235f)] text-white shadow-[0_14px_28px_rgba(9,33,94,0.24)]">
              <Building2 className="size-11" />
            </div>
            <div className="pt-1">
              <h1 className="text-[30px] leading-none font-black tracking-[-0.04em] text-[#132b72]">
                SLT Bidding Price Calculator
              </h1>
              <p className="mt-3 text-[16px] text-[#67789f] sm:text-[18px]">
                Simplified Tender Evaluation &amp; Cut-off Price Analysis
              </p>
            </div>
          </div>
          <ActionButtons
            onExportPdf={() => showPlaceholderExport("PDF")}
            onExportExcel={() => showPlaceholderExport("Excel")}
            onPrint={() => window.print()}
            onReset={resetAll}
          />
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_0.95fr_1.9fr]">
          <AppInputCard
            title="APP Amount (BDT)"
            value={appAmountInput}
            placeholder="0"
            icon={<ClipboardList className="size-8 text-[#2563eb]" />}
            accentClassName="border-[#d8e4ff] bg-[#f3f7ff]"
            onChange={(value) => setAppAmountInput(normalizeNumericInput(value, { allowDecimal: true, maxDecimals: 2 }))}
          />
          <AppInputCard
            title="NPPI (%)"
            value={nppiInput}
            placeholder="0"
            icon={<ChartColumnBig className="size-8 text-[#0f9a48]" />}
            accentClassName="border-[#d7f5df] bg-[#eefbf3]"
            suffix="%"
            onChange={(value) => setNppiInput(normalizeNumericInput(value, { allowDecimal: true, maxDecimals: 4 }))}
          />
          <SLTResultCard sltPrice={metrics.sltPrice} hasCalculation={hasCalculation} />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.95fr_0.85fr]">
          <BidderTable
            bidders={bidders}
            onNameChange={(id, value) => updateBidder(id, "name", value)}
            onAmountChange={(id, value) => updateBidder(id, "amount", value)}
            onToggleBidder={toggleBidder}
            onAddBidder={addBidder}
            onDeleteBidder={deleteBidder}
            onImportPdf={() => setIsPdfImportModalOpen(true)}
          />
          <SummaryCard
            totalBidders={bidderGroups.validBidders.length}
            responsiveBidders={bidderGroups.responsive.length}
            nonResponsiveBidders={bidderGroups.nonResponsive.length}
          />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-2">
          <ResponsiveBidderTable bidders={bidderGroups.responsive} />
          <NonResponsiveBidderTable bidders={bidderGroups.nonResponsive} />
        </section>

        <section className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-5 text-sm text-[#67789f] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>All amounts in BDT</span>
            <span>Bidders with amount less than or equal to 0 are not considered in calculation.</span>
          </div>
          <p>Calculated on {calculatedAt}</p>
        </section>
      </div>
      <ImportPdfModal
        isOpen={isPdfImportModalOpen}
        onClose={() => setIsPdfImportModalOpen(false)}
        onImport={importPdfBidderRows}
      />
    </main>
  )
}
