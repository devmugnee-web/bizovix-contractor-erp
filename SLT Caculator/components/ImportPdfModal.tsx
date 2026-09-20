"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, FileText, Loader2, Trash2, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { ScreenshotImportMode } from "@/types"
import { parseNumber } from "@/utils/calculator"
import {
  createPdfImportedRow,
  extractTenderRowsFromPdf,
  type PdfImportedBidderRow
} from "@/utils/tenderPdfImport"

interface ImportPdfModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (rows: PdfImportedBidderRow[], mode: ScreenshotImportMode) => void
}

export function ImportPdfModal({ isOpen, onClose, onImport }: ImportPdfModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<PdfImportedBidderRow[]>([])
  const [fileName, setFileName] = useState("")
  const [isReading, setIsReading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const sequentialSerials = useMemo(
    () => rows.every((row, index) => Number(row.serial) === index + 1),
    [rows]
  )
  const hasBlockingRows = rows.some(
    (row) => !/^\d+$/.test(row.serial) || Number(row.serial) <= 0 || !row.name.trim() || parseNumber(row.amount) <= 0
  )
  const canImport = rows.length > 0 && !hasBlockingRows && !isReading

  useEffect(() => {
    if (!isOpen) reset()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isReading) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isOpen, isReading, onClose])

  if (!isOpen) return null

  async function processFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file only.")
      return
    }

    setFileName(file.name)
    setRows([])
    setError("")
    setIsReading(true)
    setMessage("Searching all PDF pages for Opening Report Header...")
    try {
      const extractedRows = await extractTenderRowsFromPdf(file, setMessage)
      if (extractedRows.length === 0) {
        setError("Opening Report Header was not found, or no usable bidder rows could be extracted.")
      } else {
        setRows(extractedRows)
      }
    } catch (reason) {
      console.error(reason)
      setError("The PDF could not be read. Please use a valid e-GP Tender Opening Report PDF.")
    } finally {
      setIsReading(false)
    }
  }

  function updateRow(id: string, field: "name" | "amount", value: string) {
    setRows((current) => current.map((row) => row.id === id
      ? createPdfImportedRow(row.serial, field === "name" ? value : row.name, field === "amount" ? value : row.amount, false, row.id)
      : row))
  }

  function reset() {
    setRows([])
    setFileName("")
    setIsReading(false)
    setIsDragging(false)
    setMessage("")
    setError("")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.48)] p-3 sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
          <div className="space-y-2">
            <h2 className="text-[1.65rem] font-black tracking-[-0.03em] text-[#132b72]">Import Bidders from PDF</h2>
            <p className="max-w-[780px] text-sm leading-6 text-[#6f81ad] sm:text-[15px]">
              Data is read only from the table beneath Opening Report Header. Text PDFs are read directly; OCR is used only for scanned pages.
            </p>
          </div>
          <button type="button" aria-label="Close PDF import modal" className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
            <div className="space-y-4">
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "flex min-h-[250px] flex-col items-center justify-center gap-4 rounded-[1.75rem] border border-dashed px-5 py-8 text-center transition",
                  isDragging
                    ? "scale-[1.01] border-[#2346d8] bg-[#eaf0ff] shadow-[0_16px_32px_rgba(35,70,216,0.14)]"
                    : "border-[#cfd9ef] bg-[#f8fbff] hover:border-[#2346d8] hover:bg-[#f2f6ff]"
                )}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click()
                }}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = "copy"
                  setIsDragging(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragging(false)
                  const file = Array.from(event.dataTransfer.files).find(
                    (candidate) => candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf")
                  )
                  if (file) {
                    void processFile(file)
                  } else {
                    setError("Please drop a PDF file only.")
                  }
                }}
              >
                <div className="flex size-18 items-center justify-center rounded-full bg-[#0b2c79] text-white shadow-[0_12px_28px_rgba(11,44,121,0.24)]"><FileText className="size-7" /></div>
                <div>
                  <p className="text-lg font-bold text-[#132b72]">
                    {isDragging ? "Drop the PDF here" : "Choose or drag and drop a PDF"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#6f81ad]">All pages will be searched automatically.</p>
                </div>
                <Button type="button" size="lg" className="h-11 rounded-2xl bg-[#0b2c79] px-5"><Upload className="size-4" />Upload PDF</Button>
                <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void processFile(file)
                  event.target.value = ""
                }} />
              </div>
              {fileName ? <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)]"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f81ad]">Selected File</p><p className="mt-1 break-all text-sm font-semibold text-[#132b72]">{fileName}</p></div> : null}
            </div>

            <div className="space-y-4">
              {isReading ? <div className="flex items-center gap-3 rounded-[1.4rem] border border-[#dfe8fb] bg-[#f7faff] px-4 py-5 text-sm font-semibold text-[#132b72]"><Loader2 className="size-5 animate-spin text-[#2346d8]" />{message}</div> : null}
              {error ? <div className="flex items-start gap-3 rounded-[1.4rem] border border-[#ffd5d5] bg-[#fff5f5] px-4 py-4 text-sm text-[#c24141]"><AlertTriangle className="size-5 shrink-0" />{error}</div> : null}
              {!sequentialSerials && rows.length > 0 ? <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Serial numbers are valid but not sequential. Please verify the extracted rows.</div> : null}
              <div className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[var(--shadow-card)]">
                <div className="border-b border-slate-200 px-4 py-4"><p className="text-base font-bold text-[#132b72]">PDF Import Review</p><p className="mt-1 text-sm text-[#6f81ad]">Edit bidder names or amounts before adding them.</p></div>
                <div className="overflow-x-auto">
                  <table className="min-w-[820px] w-full border-collapse">
                    <thead className="bg-[#0b2c79] text-left"><tr>{["SL No", "Bidder Name", "Bidding Amount (BDT)", "Status", "Action"].map((heading) => <th key={heading} className="px-4 py-3 text-sm font-semibold text-white">{heading}</th>)}</tr></thead>
                    <tbody>
                      {rows.length === 0 && !isReading ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[#6f81ad]">Upload a PDF to generate the review table.</td></tr> : null}
                      {rows.map((row) => <tr key={row.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-4 text-sm font-semibold text-[#132b72]">{row.serial}</td>
                        <td className="px-4 py-3"><Input value={row.name} className="h-11 rounded-xl border-slate-200 font-semibold text-[#132b72]" onChange={(event) => updateRow(row.id, "name", event.target.value)} /></td>
                        <td className="px-4 py-3"><Input value={row.amount} inputMode="decimal" className="metric-mono h-11 rounded-xl border-slate-200 font-semibold text-[#132b72]" onChange={(event) => updateRow(row.id, "amount", event.target.value)} /></td>
                        <td className="px-4 py-3"><div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em]", row.status === "Ready" ? "bg-[#effaf3] text-[#0f9a48]" : "bg-[#fff4f2] text-[#ef4444]")}>{row.status === "Ready" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}{row.status}</div>{row.notes.length ? <p className="mt-2 max-w-[200px] text-xs leading-5 text-[#8a5c57]">{row.notes.join(" ")}</p> : null}</td>
                        <td className="px-4 py-3"><button type="button" aria-label={`Remove bidder ${row.serial}`} className="flex size-10 items-center justify-center rounded-xl border border-[#ffd5d5] text-[#ef4444] hover:bg-[#fff1f2]" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 className="size-4" /></button></td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-5 sm:flex-row sm:justify-end sm:px-7">
          <Button type="button" variant="outline" size="lg" className="h-12 rounded-2xl border-slate-200 px-6 text-[#132b72]" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="green" size="lg" className="h-12 rounded-2xl px-6" disabled={!canImport} onClick={() => { onImport(rows, "replace"); onClose() }}>Add to Calculator</Button>
        </div>
      </div>
    </div>
  )
}
