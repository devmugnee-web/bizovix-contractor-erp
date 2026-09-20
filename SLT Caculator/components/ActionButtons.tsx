"use client"

import { FileSpreadsheet, FileText, Printer, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"

interface ActionButtonsProps {
  onExportPdf: () => void
  onExportExcel: () => void
  onPrint: () => void
  onReset: () => void
}

export function ActionButtons({
  onExportPdf,
  onExportExcel,
  onPrint,
  onReset
}: ActionButtonsProps) {
  return (
    <div className="flex flex-wrap justify-end gap-3 print:hidden">
      <Button variant="outline" size="lg" className="h-12 rounded-2xl border-slate-200 px-5 shadow-sm" onClick={onExportExcel}>
        <FileSpreadsheet className="size-4 text-[#16a34a]" />
        Export Excel
      </Button>
      <Button variant="outline" size="lg" className="h-12 rounded-2xl border-slate-200 px-5 shadow-sm" onClick={onExportPdf}>
        <FileText className="size-4 text-[#ef4444]" />
        Export PDF
      </Button>
      <Button variant="outline" size="lg" className="h-12 rounded-2xl border-slate-200 px-5 shadow-sm" onClick={onPrint}>
        <Printer className="size-4 text-[#2563eb]" />
        Print Report
      </Button>
      <Button variant="outline" size="lg" className="h-12 rounded-2xl border-slate-200 px-5 shadow-sm" onClick={onReset}>
        <RotateCcw className="size-4 text-slate-500" />
        Reset All
      </Button>
    </div>
  )
}
