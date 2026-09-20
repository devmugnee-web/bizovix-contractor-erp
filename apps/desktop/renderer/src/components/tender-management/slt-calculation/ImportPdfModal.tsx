"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { Button } from "@bizovix/ui";
import { parseNumber } from "./calculator";
import { createPdfImportedRow, extractTenderRowsFromPdf } from "./pdf-import";
import type { ImportMode, PdfImportedBidderRow } from "./types";

interface ImportPdfModalProps {
  open: boolean;
  hasExistingRows: boolean;
  onClose: () => void;
  onImport: (rows: PdfImportedBidderRow[], mode: ImportMode) => void;
}

export function ImportPdfModal({ open, hasExistingRows, onClose, onImport }: ImportPdfModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PdfImportedBidderRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const blocking = useMemo(
    () =>
      rows.some(
        (row) => !/^\d+$/.test(row.serial) || !row.name.trim() || parseNumber(row.amount) <= 0,
      ),
    [rows],
  );
  const canImport = rows.length > 0 && !blocking && !reading;

  const closeModal = useCallback(() => {
    setRows([]);
    setFileName("");
    setReading(false);
    setDragging(false);
    setMessage("");
    setError("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && !reading && closeModal();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, reading, closeModal]);
  if (!open) return null;

  async function processFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose an e-GP Tender Opening Report PDF.");
      return;
    }
    setFileName(file.name);
    setRows([]);
    setError("");
    setReading(true);
    setMessage("Searching all pages for Opening Report Header…");
    try {
      const extracted = await extractTenderRowsFromPdf(file, setMessage);
      setRows(extracted);
      if (!extracted.length)
        setError("Opening Report Header or usable bidder rows were not found.");
    } catch (reason) {
      console.error(reason);
      setError("This PDF could not be read. Please use a valid e-GP opening report.");
    } finally {
      setReading(false);
    }
  }

  function updateRow(id: string, field: "name" | "amount", value: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? createPdfImportedRow(
              row.serial,
              field === "name" ? value : row.name,
              field === "amount" ? value : row.amount,
              false,
              row.id,
            )
          : row,
      ),
    );
  }
  function finish(mode: ImportMode) {
    onImport(rows, mode);
    closeModal();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px]">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-biz-border bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-biz-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-biz-text">Import bidders from PDF</h2>
            <p className="mt-1 text-xs text-slate-500">
              Reads the table below “Opening Report Header”; scanned PDFs use OCR.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close PDF import"
            disabled={reading}
            onClick={closeModal}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div>
            <div
              role="button"
              tabIndex={0}
              className={`flex min-h-[210px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${dragging ? "border-biz-blue bg-biz-blue-soft" : "border-biz-border bg-slate-50 hover:border-biz-blue"}`}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) =>
                (event.key === "Enter" || event.key === " ") && inputRef.current?.click()
              }
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void processFile(file);
              }}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-biz-blue text-white">
                <FileUp className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-biz-text">Drop PDF here or browse</p>
              <p className="mt-1 text-xs text-slate-500">All pages are checked automatically</p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-md border border-biz-border bg-white px-3 py-2 text-xs font-semibold text-biz-blue">
                <Upload className="h-4 w-4" />
                Choose PDF
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void processFile(file);
                  event.target.value = "";
                }}
              />
            </div>
            {fileName && (
              <p className="mt-3 break-all rounded-lg border border-biz-border bg-white p-3 text-xs font-medium text-biz-text">
                {fileName}
              </p>
            )}
            {reading && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-biz-blue-soft p-3 text-xs font-medium text-biz-blue">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {message}
              </p>
            )}
            {error && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-biz-danger/10 p-3 text-xs font-medium text-biz-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
          </div>
          <div className="min-h-[280px] overflow-hidden rounded-xl border border-biz-border">
            <div className="flex items-center justify-between border-b border-biz-border bg-slate-50 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-biz-text">Import review</h3>
                <p className="text-[11px] text-slate-500">
                  Verify names and final bidding amounts before importing.
                </p>
              </div>
              <span className="rounded-full bg-biz-blue-soft px-2 py-1 text-[11px] font-semibold text-biz-blue">
                {rows.length} bidders
              </span>
            </div>
            <div className="max-h-[48vh] overflow-auto">
              <table className="w-full min-w-[700px] text-xs">
                <thead className="sticky top-0 z-10 bg-biz-bg text-left text-[10px] uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2">SL</th>
                    <th className="px-3 py-2">Bidder name</th>
                    <th className="px-3 py-2">Bidding amount (BDT)</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!rows.length && !reading && (
                    <tr>
                      <td colSpan={5} className="h-44 text-center text-slate-500">
                        Upload a PDF to review extracted bidders.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-biz-border align-top">
                      <td className="px-3 py-3 font-semibold text-biz-text">{row.serial}</td>
                      <td className="px-3 py-2">
                        <input
                          className="h-9 w-full rounded-md border border-biz-border px-3 outline-none focus:border-biz-blue focus:ring-2 focus:ring-biz-blue/10"
                          value={row.name}
                          onChange={(event) => updateRow(row.id, "name", event.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="h-9 w-full rounded-md border border-biz-border px-3 font-semibold tabular-nums outline-none focus:border-biz-blue focus:ring-2 focus:ring-biz-blue/10"
                          value={row.amount}
                          inputMode="decimal"
                          onChange={(event) => updateRow(row.id, "amount", event.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${row.status === "Ready" ? "bg-biz-success-soft text-biz-success" : "bg-biz-warning-soft text-biz-warning"}`}
                        >
                          {row.status === "Ready" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {row.status}
                        </span>
                        {row.notes.length > 0 && (
                          <p className="mt-1 max-w-48 text-[10px] text-slate-500">
                            {row.notes.join(" ")}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove bidder ${row.serial}`}
                          onClick={() =>
                            setRows((current) => current.filter((item) => item.id !== row.id))
                          }
                        >
                          <Trash2 className="h-4 w-4 text-biz-danger" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-biz-border bg-slate-50 px-5 py-3">
          <Button variant="outline" onClick={closeModal} disabled={reading}>
            Cancel
          </Button>
          {hasExistingRows && (
            <Button variant="outline-blue" disabled={!canImport} onClick={() => finish("append")}>
              Append bidders
            </Button>
          )}
          <Button disabled={!canImport} onClick={() => finish("replace")}>
            {hasExistingRows ? "Replace bidders" : "Add to calculator"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
