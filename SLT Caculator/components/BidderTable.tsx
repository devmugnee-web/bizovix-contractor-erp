"use client"

import { useLayoutEffect, useRef } from "react"
import type { ChangeEvent } from "react"
import { Check, FileText, Plus, Trash2, UsersRound } from "lucide-react"

import type { BidderRow } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface BidderTableProps {
  bidders: BidderRow[]
  onNameChange: (id: string, value: string) => void
  onAmountChange: (id: string, value: string) => void
  onToggleBidder: (id: string) => void
  onAddBidder: () => void
  onDeleteBidder: (id: string) => void
  onImportPdf: () => void
}

export function BidderTable({
  bidders,
  onNameChange,
  onAmountChange,
  onToggleBidder,
  onAddBidder,
  onDeleteBidder,
  onImportPdf
}: BidderTableProps) {
  return (
    <Card className="rounded-[1.75rem] border border-slate-200 bg-white shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-[#0b2c79] text-white">
              <UsersRound className="size-6" />
            </div>
            <div>
              <CardTitle className="text-[2rem] font-bold text-[#132b72]">Bidder List</CardTitle>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="default"
            size="lg"
            className="h-12 whitespace-nowrap rounded-2xl border border-[#183bc4] bg-[#2346d8] px-5 font-bold text-white shadow-[0_10px_22px_rgba(35,70,216,0.28)] transition hover:bg-[#1939bd] hover:shadow-[0_12px_26px_rgba(35,70,216,0.34)]"
            onClick={onImportPdf}
          >
            <FileText className="size-4" />
            Import PDF
          </Button>
          <Button
            variant="default"
            size="lg"
            className="h-12 whitespace-nowrap rounded-2xl bg-[#0b2c79] px-6"
            onClick={onAddBidder}
          >
            <Plus className="size-4" />
            Add Bidder
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">
        <div className="overflow-x-auto rounded-[1.15rem] border border-slate-200">
          <table className="min-w-[760px] w-full border-collapse">
            <thead className="bg-[#0b2c79] text-left">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-white">SL No</th>
                <th className="px-6 py-4 text-sm font-semibold text-white">Bidder Name</th>
                <th className="px-6 py-4 text-sm font-semibold text-white">Bidding Amount (BDT)</th>
                <th className="px-6 py-4 text-sm font-semibold text-white print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {bidders.map((bidder, index) => (
                <tr key={bidder.id} className="border-t border-slate-100">
                  {(() => {
                    const isChecked = bidder.checked !== false

                    return (
                      <>
                  <td className="px-6 py-3 text-sm font-semibold text-[#132b72]">{index + 1}</td>
                  <td className="px-6 py-3">
                    <Input
                      value={bidder.name}
                      placeholder="Enter bidder name"
                      onChange={(event) => onNameChange(bidder.id, event.target.value)}
                        className={`h-11 rounded-xl border-transparent bg-transparent px-2 text-[15px] font-semibold text-[#132b72] focus:border-slate-200 ${
                          isChecked ? "" : "opacity-45"
                        }`}
                    />
                  </td>
                  <td className="px-6 py-3">
                    <FormattedAmountInput
                      value={bidder.amount}
                      placeholder="Enter bidding amount"
                      onChange={(value) => onAmountChange(bidder.id, value)}
                      className={`metric-mono h-11 rounded-xl border-transparent bg-transparent px-2 text-[15px] font-semibold text-[#132b72] focus:border-slate-200 ${
                          isChecked ? "" : "opacity-45"
                        }`}
                    />
                  </td>
                  <td className="px-6 py-3 print:hidden">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                          aria-label={`${isChecked ? "Uncheck" : "Check"} bidder row ${index + 1}`}
                          className={`flex size-9 items-center justify-center rounded-lg border transition ${
                            isChecked
                              ? "border-[#cdebd7] bg-[#effaf3] text-[#16a34a]"
                              : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
                          }`}
                          onClick={() => onToggleBidder(bidder.id)}
                      >
                          {isChecked ? <Check className="size-4" /> : null}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete bidder row ${index + 1}`}
                        className="flex size-9 items-center justify-center rounded-lg border border-[#ffd5d5] text-[#ef4444] transition hover:bg-[#fff1f2]"
                        onClick={() => onDeleteBidder(bidder.id)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                      </>
                    )
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-[#f7faff] px-4 py-3 text-sm text-[#6f81ad]">
          <span className="flex size-5 items-center justify-center rounded-full border border-[#cedcf8] text-[11px] font-bold">i</span>
          Enter valid bidder amounts only. Unchecked bidders and bidders with amount less than or equal to 0 are not considered.
        </div>
      </CardContent>
    </Card>
  )
}

interface FormattedAmountInputProps {
  value: string
  placeholder: string
  className: string
  onChange: (value: string) => void
}

function FormattedAmountInput({
  value,
  placeholder,
  className,
  onChange
}: FormattedAmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaretTokensRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (pendingCaretTokensRef.current === null || !inputRef.current) {
      return
    }

    const nextCaretPosition = getCaretPositionFromTokenCount(value, pendingCaretTokensRef.current)
    inputRef.current.setSelectionRange(nextCaretPosition, nextCaretPosition)
    pendingCaretTokensRef.current = null
  }, [value])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const caretPosition = event.target.selectionStart ?? event.target.value.length
    pendingCaretTokensRef.current = countValueTokens(event.target.value.slice(0, caretPosition))
    onChange(event.target.value)
  }

  return (
    <Input
      ref={inputRef}
      value={value}
      inputMode="decimal"
      placeholder={placeholder}
      onChange={handleChange}
      className={className}
    />
  )
}

function countValueTokens(value: string) {
  return value.replace(/,/g, "").length
}

function getCaretPositionFromTokenCount(value: string, tokenCount: number) {
  if (tokenCount <= 0) {
    return 0
  }

  let seenTokens = 0

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== ",") {
      seenTokens += 1
    }

    if (seenTokens >= tokenCount) {
      return index + 1
    }
  }

  return value.length
}
