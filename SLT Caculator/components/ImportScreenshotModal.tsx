"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Clipboard, Loader2, Trash2, Upload, X } from "lucide-react"

import type { ImportedBidderRow, ScreenshotImportMode } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { parseNumber } from "@/utils/calculator"
import {
  chooseBestBidderSerials,
  FINAL_AMOUNT_COLUMN_REGION,
  FINAL_AMOUNT_FALLBACK_COLUMN_REGION,
  NAME_COLUMN_REGION,
  SERIAL_NUMBER_COLUMN_REGION,
  createImportedBidderRow,
  cropImageRegion,
  mergeAmountFields,
  pairNamesWithAmounts,
  pairRowsBySerials,
  parseBidAmounts,
  parseBidderNames,
  parseBidderSerials,
  readOpeningReportScreenshot,
  readTenderRowsByDetectedBands,
  runOCR
} from "@/utils/tenderScreenshotImport"

interface ImportScreenshotModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (rows: ImportedBidderRow[], mode: ScreenshotImportMode) => void
}

const DEFAULT_ERROR_MESSAGE =
  "No bidder data detected. Please upload a clear screenshot in the standard tender opening format."

export function ImportScreenshotModal({ isOpen, onClose, onImport }: ImportScreenshotModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewRows, setPreviewRows] = useState<ImportedBidderRow[]>([])
  const [selectedFileName, setSelectedFileName] = useState("")
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState("")
  const [importMode, setImportMode] = useState<ScreenshotImportMode>("replace")
  const [isDragging, setIsDragging] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [loadingMessage, setLoadingMessage] = useState("Reading screenshot...")

  const totalDetectedRows = previewRows.length
  const needsReviewCount = previewRows.filter((row) => row.status === "Needs Review").length
  const hasBlockingRows = previewRows.some((row) => row.name.trim().length === 0 || parseNumber(row.amount) <= 0)

  const canAddToCalculator = !isReading && previewRows.length > 0 && !hasBlockingRows

  const validRowCount = useMemo(
    () => previewRows.filter((row) => row.name.trim().length > 0 && parseNumber(row.amount) > 0).length,
    [previewRows]
  )

  useEffect(() => {
    if (!selectedFilePreviewUrl) {
      return
    }

    return () => URL.revokeObjectURL(selectedFilePreviewUrl)
  }, [selectedFilePreviewUrl])

  useEffect(() => {
    if (!isOpen) {
      resetState()
      return
    }

    function handlePaste(event: ClipboardEvent) {
      const items = Array.from(event.clipboardData?.items ?? [])
      const imageItem = items.find((item) => item.type.startsWith("image/"))

      if (!imageItem) {
        return
      }

      const file = imageItem.getAsFile()

      if (!file) {
        return
      }

      event.preventDefault()
      void processScreenshotFile(file)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isReading) {
        onClose()
      }
    }

    window.addEventListener("paste", handlePaste)
    window.addEventListener("keydown", handleEscape)

    return () => {
      window.removeEventListener("paste", handlePaste)
      window.removeEventListener("keydown", handleEscape)
    }
  }, [isOpen, isReading, onClose])

  if (!isOpen) {
    return null
  }

  async function processScreenshotFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setErrorMessage(DEFAULT_ERROR_MESSAGE)
      return
    }

    setSelectedFileName(file.name)
    setSelectedFilePreviewUrl((currentValue) => {
      if (currentValue) {
        URL.revokeObjectURL(currentValue)
      }

      return URL.createObjectURL(file)
    })
    setErrorMessage("")
    setPreviewRows([])
    setIsReading(true)
    setLoadingMessage("Reading screenshot...")

    try {
      const sectionRows = await readOpeningReportScreenshot(file, (progress) => {
        setLoadingMessage(`Locating Opening Report table... ${Math.max(5, Math.round(progress * 100))}%`)
      })

      if (sectionRows.length > 0) {
        setPreviewRows(sectionRows)
        return
      }

      setLoadingMessage("Trying legacy screenshot extraction...")
      const bandRows = await readTenderRowsByDetectedBands(file, (progress) => {
        setLoadingMessage(`Reading screenshot... ${Math.max(5, Math.round(progress * 100))}%`)
      })

      if (bandRows.length > 0) {
        setPreviewRows(bandRows)
        return
      }

      setLoadingMessage("Reading screenshot...")
      const serialCanvas = await cropImageRegion(file, SERIAL_NUMBER_COLUMN_REGION)
      const nameCanvas = await cropImageRegion(file, NAME_COLUMN_REGION)
      const amountCanvas = await cropImageRegion(file, FINAL_AMOUNT_COLUMN_REGION)
      const fallbackAmountCanvas = await cropImageRegion(file, FINAL_AMOUNT_FALLBACK_COLUMN_REGION)

      setLoadingMessage("Reading screenshot...")
      const serialsResult = await runOCR(serialCanvas, {
        variant: "amounts",
        onProgress: ({ progress }) => {
          setLoadingMessage(`Reading screenshot... ${Math.max(5, Math.round(progress * 20))}%`)
        }
      })

      const namesResult = await runOCR(nameCanvas, {
        variant: "names",
        onProgress: ({ progress, status }) => {
          setLoadingMessage(`Reading screenshot... ${20 + Math.max(5, Math.round(progress * 35))}%`)

          if (status) {
            setLoadingMessage(`Reading screenshot... ${20 + Math.max(5, Math.round(progress * 35))}%`)
          }
        }
      })

      const amountsResult = await runOCR(amountCanvas, {
        variant: "amounts",
        onProgress: ({ progress }) => {
          setLoadingMessage(`Reading screenshot... ${55 + Math.max(0, Math.round(progress * 25))}%`)
        }
      })

      const fallbackAmountsResult = await runOCR(fallbackAmountCanvas, {
        variant: "amounts",
        onProgress: ({ progress }) => {
          setLoadingMessage(`Reading screenshot... ${80 + Math.max(0, Math.round(progress * 20))}%`)
        }
      })

      const detectedNames = parseBidderNames(namesResult)
      const detectedAmounts = mergeAmountFields(parseBidAmounts(amountsResult), parseBidAmounts(fallbackAmountsResult))
      const detectedSerials = chooseBestBidderSerials(
        parseBidderSerials(serialsResult),
        parseBidderSerials(namesResult),
        detectedNames,
        detectedAmounts
      )
      const rows =
        detectedSerials.length > 0
          ? pairRowsBySerials(detectedSerials, detectedNames, detectedAmounts)
          : pairNamesWithAmounts(detectedNames, detectedAmounts)
      const usableRows = rows.filter((row) => row.name.trim().length > 0 || parseNumber(row.amount) > 0)

      if (usableRows.length === 0) {
        setErrorMessage(DEFAULT_ERROR_MESSAGE)
        setPreviewRows([])
        return
      }

      setPreviewRows(usableRows)
    } catch (error) {
      console.error(error)
      setErrorMessage(DEFAULT_ERROR_MESSAGE)
      setPreviewRows([])
    } finally {
      setIsReading(false)
    }
  }

  async function handlePasteFromClipboard() {
    if (!navigator.clipboard?.read) {
      setErrorMessage("Clipboard image access is not available here. Press Ctrl+V inside this modal instead.")
      return
    }

    try {
      const clipboardItems = await navigator.clipboard.read()

      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith("image/"))

        if (!imageType) {
          continue
        }

        const blob = await item.getType(imageType)
        const extension = imageType.split("/")[1] ?? "png"
        const file = new File([blob], `clipboard-screenshot.${extension}`, { type: imageType })

        await processScreenshotFile(file)
        return
      }

      setErrorMessage("No image found in the clipboard. Copy the screenshot first, then try again.")
    } catch (error) {
      console.error(error)
      setErrorMessage("Clipboard image access was blocked. Press Ctrl+V inside this modal instead.")
    }
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    void processScreenshotFile(file)
    event.target.value = ""
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)

    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("image/"))

    if (!file) {
      setErrorMessage(DEFAULT_ERROR_MESSAGE)
      return
    }

    void processScreenshotFile(file)
  }

  function updatePreviewRow(id: string, field: "name" | "amount", value: string) {
    setPreviewRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== id) {
          return row
        }

        return createImportedBidderRow(field === "name" ? value : row.name, field === "amount" ? value : row.amount, {
          id: row.id
        })
      })
    )
  }

  function removePreviewRow(id: string) {
    setPreviewRows((currentRows) => currentRows.filter((row) => row.id !== id))
  }

  function handleImportToCalculator() {
    if (!canAddToCalculator) {
      return
    }

    onImport(previewRows, importMode)
    onClose()
  }

  function resetState() {
    setPreviewRows([])
    setSelectedFileName("")
    setSelectedFilePreviewUrl((currentValue) => {
      if (currentValue) {
        URL.revokeObjectURL(currentValue)
      }

      return ""
    })
    setImportMode("replace")
    setIsDragging(false)
    setIsReading(false)
    setErrorMessage("")
    setLoadingMessage("Reading screenshot...")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.48)] p-3 sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
          <div className="space-y-2">
            <h2 className="text-[1.65rem] font-black tracking-[-0.03em] text-[#132b72]">
              Import Bidders from Tender Screenshot
            </h2>
            <p className="max-w-[760px] text-sm leading-6 text-[#6f81ad] sm:text-[15px]">
              Upload a clear screenshot of the tender opening table. The system will read bidder names from the left
              Name of Tenderer column and final quoted amounts from the rightmost Quoted Amount with Discount column.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close import screenshot modal"
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
              <div className="space-y-4">
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "flex min-h-[280px] w-full flex-col items-center justify-center gap-4 rounded-[1.75rem] border border-dashed px-5 py-8 text-center transition",
                  isDragging
                    ? "border-[#2346d8] bg-[#eef3ff] shadow-[0_16px_32px_rgba(35,70,216,0.12)]"
                    : "border-[#cfd9ef] bg-[#f8fbff] hover:border-[#2346d8] hover:bg-[#f2f6ff]"
                )}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  setIsDragging(false)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <div className="flex size-18 items-center justify-center rounded-full bg-[#0b2c79] text-white shadow-[0_12px_28px_rgba(11,44,121,0.24)]">
                  <Upload className="size-7" />
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-bold text-[#132b72]">Upload, drag and drop, or paste a screenshot</p>
                  <p className="text-sm leading-6 text-[#6f81ad]">
                    Click here to choose an image file, drag the tender screenshot into this area, or press Ctrl+V to
                    paste it from your clipboard.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button type="button" variant="default" size="lg" className="h-11 rounded-2xl bg-[#0b2c79] px-5">
                    <Upload className="size-4" />
                    Upload Image
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-11 rounded-2xl border-[#cfd9ef] px-5 text-[#132b72]"
                    onClick={(event) => {
                      event.stopPropagation()
                      void handlePasteFromClipboard()
                    }}
                  >
                    <Clipboard className="size-4" />
                    Paste Screenshot
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelection}
                />
              </div>

              {selectedFileName ? (
                <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f81ad]">Selected File</p>
                      <p className="mt-1 text-sm font-semibold text-[#132b72]">{selectedFileName}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[#cfd9ef] px-4 text-[#132b72]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose Another
                    </Button>
                  </div>
                  {selectedFilePreviewUrl ? (
                    <img
                      src={selectedFilePreviewUrl}
                      alt="Tender screenshot preview"
                      className="mt-4 max-h-[220px] w-full rounded-[1.15rem] border border-slate-200 object-contain"
                    />
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-[1.4rem] border border-[#dfe8fb] bg-[#f7faff] p-4 text-sm leading-6 text-[#5e709d]">
                The importer supports both the original tender screenshot and the full Opening Report table. For the
                full table, it locates the header and footer first, then reads the detected Name of Tenderer and
                rightmost Quoted Amount with Discount columns.
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-semibold text-[#2346d8]">
                  <a href="/samples/tender-screenshot-sample.png" target="_blank" rel="noreferrer" className="hover:underline">
                    View Sample Screenshot 1
                  </a>
                  <a href="/samples/tender-screenshot-sample-2.png" target="_blank" rel="noreferrer" className="hover:underline">
                    View Sample Screenshot 2
                  </a>
                </div>
              </div>
              </div>

              <div className="space-y-4 pb-2">
              <div className="flex flex-wrap items-center gap-3 rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)]">
                <div className="min-w-[150px] rounded-2xl bg-[#eef3ff] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f81ad]">Total Detected Rows</p>
                  <p className="mt-2 text-[1.85rem] font-black text-[#132b72]">{totalDetectedRows}</p>
                </div>
                <div className="min-w-[150px] rounded-2xl bg-[#effaf3] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a9272]">Ready to Import</p>
                  <p className="mt-2 text-[1.85rem] font-black text-[#0f9a48]">{validRowCount}</p>
                </div>
                <div className="min-w-[150px] rounded-2xl bg-[#fff4f2] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b66b62]">Needs Review</p>
                  <p className="mt-2 text-[1.85rem] font-black text-[#ef4444]">{needsReviewCount}</p>
                </div>
              </div>

              <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)]">
                <p className="text-sm font-semibold text-[#132b72]">Import Options</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    className={cn(
                      "rounded-[1.2rem] border px-4 py-4 text-left transition",
                      importMode === "replace"
                        ? "border-[#2346d8] bg-[#eef3ff] shadow-[0_14px_28px_rgba(35,70,216,0.12)]"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    )}
                    onClick={() => setImportMode("replace")}
                  >
                    <p className="text-sm font-bold text-[#132b72]">Replace Existing Bidders</p>
                    <p className="mt-1 text-sm leading-6 text-[#6f81ad]">Default option. Replace the current bidder list with the imported rows.</p>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-[1.2rem] border px-4 py-4 text-left transition",
                      importMode === "append"
                        ? "border-[#2346d8] bg-[#eef3ff] shadow-[0_14px_28px_rgba(35,70,216,0.12)]"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    )}
                    onClick={() => setImportMode("append")}
                  >
                    <p className="text-sm font-bold text-[#132b72]">Append to Existing Bidders</p>
                    <p className="mt-1 text-sm leading-6 text-[#6f81ad]">Keep the current bidder list and add these imported rows after it.</p>
                  </button>
                </div>
              </div>

              {isReading ? (
                <div className="rounded-[1.4rem] border border-[#dfe8fb] bg-[#f7faff] px-4 py-5 text-[#132b72] shadow-[var(--shadow-card)]">
                  <div className="flex items-center gap-3 text-sm font-semibold">
                    <Loader2 className="size-5 animate-spin text-[#2346d8]" />
                    <span>{loadingMessage}</span>
                  </div>
                </div>
              ) : null}

              {errorMessage ? (
                <div className="rounded-[1.4rem] border border-[#ffd5d5] bg-[#fff5f5] px-4 py-4 text-sm leading-6 text-[#c24141] shadow-[var(--shadow-card)]">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                    <p>{errorMessage}</p>
                  </div>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[var(--shadow-card)]">
                <div className="border-b border-slate-200 px-4 py-4">
                  <p className="text-base font-bold text-[#132b72]">Editable Preview</p>
                  <p className="mt-1 text-sm leading-6 text-[#6f81ad]">
                    Review the OCR result before importing. You can edit bidder names, adjust amounts, or remove wrong rows.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[860px] w-full border-collapse">
                    <thead className="bg-[#0b2c79] text-left">
                      <tr>
                        <th className="px-4 py-3 text-sm font-semibold text-white">SL No</th>
                        <th className="px-4 py-3 text-sm font-semibold text-white">Bidder Name</th>
                        <th className="px-4 py-3 text-sm font-semibold text-white">Bidding Amount (BDT)</th>
                        <th className="px-4 py-3 text-sm font-semibold text-white">Status</th>
                        <th className="px-4 py-3 text-sm font-semibold text-white">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {previewRows.length === 0 && !isReading ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#6f81ad]">
                            Upload a tender screenshot to generate the preview table.
                          </td>
                        </tr>
                      ) : null}
                      {previewRows.map((row, index) => (
                        <tr key={row.id} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3 text-sm font-semibold text-[#132b72]">{index + 1}</td>
                          <td className="px-4 py-3">
                            <Input
                              value={row.name}
                              placeholder="Bidder name"
                              className="h-11 rounded-xl border-slate-200 px-3 text-[15px] font-semibold text-[#132b72]"
                              onChange={(event) => updatePreviewRow(row.id, "name", event.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              value={row.amount}
                              inputMode="numeric"
                              placeholder="Final quoted amount"
                              className="metric-mono h-11 rounded-xl border-slate-200 px-3 text-[15px] font-semibold text-[#132b72]"
                              onChange={(event) => updatePreviewRow(row.id, "amount", event.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div
                              className={cn(
                                "inline-flex min-w-[132px] items-center gap-2 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em]",
                                row.status === "Ready"
                                  ? "bg-[#effaf3] text-[#0f9a48]"
                                  : "bg-[#fff4f2] text-[#ef4444]"
                              )}
                            >
                              {row.status === "Ready" ? (
                                <CheckCircle2 className="size-4" />
                              ) : (
                                <AlertTriangle className="size-4" />
                              )}
                              {row.status}
                            </div>
                            {row.notes.length > 0 ? (
                              <p className="mt-2 max-w-[220px] text-xs leading-5 text-[#8a5c57]">{row.notes.join(" ")}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="flex size-10 items-center justify-center rounded-xl border border-[#ffd5d5] text-[#ef4444] transition hover:bg-[#fff1f2]"
                              onClick={() => removePreviewRow(row.id)}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {hasBlockingRows && previewRows.length > 0 ? (
                <div className="rounded-[1.2rem] border border-[#ffd5d5] bg-[#fff8f6] px-4 py-3 text-sm leading-6 text-[#b04d42]">
                  Please fix or remove rows that are missing a bidder name or a final bidding amount before adding them to the calculator.
                </div>
              ) : null}
              </div>
            </div>
          </div>

          <div className="mt-5 flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white pt-5 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 rounded-2xl border-slate-200 px-6 text-[#132b72]"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="green"
              size="lg"
              className="h-12 rounded-2xl px-6"
              disabled={!canAddToCalculator}
              onClick={handleImportToCalculator}
            >
              Add to Calculator
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
