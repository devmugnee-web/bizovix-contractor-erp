"use client";

import { useMemo, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  Download,
  FileUp,
  Plus,
  Printer,
  RotateCcw,
  Sigma,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingDown,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  calculateMetrics,
  classifyBidders,
  formatNumber,
  formatPercent,
  normalizeNumericInput,
  parseNumber,
} from "./calculator";
import { ImportPdfModal } from "./ImportPdfModal";
import { formatPdfAmount } from "./pdf-import";
import type { BidderRow, ClassifiedBidder, ImportMode, PdfImportedBidderRow } from "./types";

function makeBidder(): BidderRow {
  return { id: crypto.randomUUID(), name: "", amount: "", included: true };
}

function ResultTable({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: ClassifiedBidder[];
  tone: "success" | "danger";
}) {
  const positive = tone === "success";
  return (
    <section className="flex min-h-[190px] flex-1 flex-col overflow-hidden rounded-lg border border-biz-border bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-biz-border bg-slate-50/70 px-3 py-2">
        <h3 className="flex items-center gap-2 text-xs font-bold text-biz-text">
          {positive ? (
            <CheckCircle2 className="h-4 w-4 text-biz-success" />
          ) : (
            <XCircle className="h-4 w-4 text-biz-danger" />
          )}
          {title}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${positive ? "bg-biz-success-soft text-biz-success" : "bg-biz-danger/10 text-biz-danger"}`}
        >
          {rows.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[360px] text-[10px] xl:min-w-[500px] xl:text-[11px]">
          <thead className="sticky top-0 bg-biz-bg text-left text-[9px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 xl:px-3">SL</th>
              <th className="px-2 py-2 xl:px-3">Bidder</th>
              <th className="px-2 py-2 text-right xl:px-3">Amount (BDT)</th>
              <th className="px-2 py-2 text-right xl:px-3">vs APP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-biz-border">
                  <td className="px-2 py-2 text-slate-500 xl:px-3">{row.serial}</td>
                  <td
                    className="max-w-[150px] truncate px-2 py-2 font-medium text-biz-text xl:max-w-[220px] xl:px-3"
                    title={row.name}
                  >
                    {row.name}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums text-biz-text xl:px-3">
                    {formatNumber(row.amount)}
                  </td>
                  <td
                    className={`px-2 py-2 text-right font-semibold tabular-nums xl:px-3 ${(row.vsApp ?? 0) < 0 ? "text-biz-danger" : "text-biz-success"}`}
                  >
                    {row.vsApp === null ? "—" : formatPercent(row.vsApp)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="h-24 text-center text-slate-500">
                  No {title.toLowerCase()} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SltCalculatorWorkspace() {
  useSetBreadcrumb([
    { label: "Tender Management", href: "/tender-management" },
    { label: "SLT Calculation" },
  ]);
  const [appAmount, setAppAmount] = useState("");
  const [nppiPercent, setNppiPercent] = useState("89");
  const [bidders, setBidders] = useState<BidderRow[]>(() => [makeBidder()]);
  const [importOpen, setImportOpen] = useState(false);
  const app = parseNumber(appAmount);
  const nppi = parseNumber(nppiPercent);
  const metrics = useMemo(() => calculateMetrics(bidders, app, nppi), [bidders, app, nppi]);
  const classification = useMemo(
    () => classifyBidders(bidders, app, metrics.sltPrice),
    [bidders, app, metrics.sltPrice],
  );
  const calculated = app > 0 && metrics.totalValidBidders > 0;
  const existingRows = bidders.some(
    (bidder) => bidder.name.trim() || parseNumber(bidder.amount) > 0,
  );

  function updateBidder(id: string, patch: Partial<BidderRow>) {
    setBidders((current) =>
      current.map((bidder) => (bidder.id === id ? { ...bidder, ...patch } : bidder)),
    );
  }
  function removeBidder(id: string) {
    setBidders((current) =>
      current.length === 1 ? [makeBidder()] : current.filter((bidder) => bidder.id !== id),
    );
  }
  function importRows(rows: PdfImportedBidderRow[], mode: ImportMode) {
    const imported = rows.map((row) => ({
      id: crypto.randomUUID(),
      name: row.name,
      amount: formatPdfAmount(row.amount),
      included: true,
    }));
    setBidders((current) =>
      mode === "append"
        ? [...current.filter((row) => row.name || row.amount), ...imported]
        : imported,
    );
  }
  function reset() {
    setAppAmount("");
    setNppiPercent("89");
    setBidders([makeBidder()]);
  }
  function exportCsv() {
    const lines: string[][] = [
      ["SLT Calculation Report"],
      ["APP Amount", String(metrics.appAmount)],
      ["NPPI %", String(metrics.nppiPercent)],
      ["Average Bid", String(metrics.averageBid)],
      ["NPPI Amount", String(metrics.nppiAmount)],
      ["Weighted Average", String(metrics.weightedAverage)],
      ["Standard Deviation", String(metrics.standardDeviation)],
      ["SLT Price", String(metrics.sltPrice)],
      [],
      ["SL", "Bidder", "Bidding Amount", "vs APP", "Status"],
      ...classification.valid.map((row, index) => [
        String(index + 1),
        row.name,
        String(row.amount),
        row.vsApp === null ? "" : String(row.vsApp),
        row.status,
      ]),
    ];
    const csv = lines
      .map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "slt-calculation.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="scrollbar-hidden flex min-h-full flex-col gap-2 overflow-y-auto subpixel-antialiased lg:h-full lg:min-h-0 lg:overflow-hidden 2xl:gap-3">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-biz-border bg-white px-3 py-2.5 shadow-card print:border-0 print:shadow-none xl:px-4 2xl:px-5 2xl:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue">
            <Calculator className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold leading-tight text-biz-text xl:text-[22px] 2xl:text-[26px]">
              SLT Calculation
            </h1>
            <p className="truncate text-[11px] font-medium text-slate-500 xl:text-xs">
              Calculate the significantly low tender threshold and evaluate bidders
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto print:hidden [&_button]:h-9 [&_button]:text-[11px]">
          <Button variant="outline-blue" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" />
            Import PDF
          </Button>
          <Button variant="outline" disabled={!classification.valid.length} onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button variant="outline" disabled={!calculated} onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print / PDF
          </Button>
          <Button variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </header>

      <section className="grid shrink-0 grid-cols-2 gap-2 xl:grid-cols-6 2xl:gap-3">
        <label className="rounded-lg border border-biz-border bg-white px-3 py-2 shadow-card xl:col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            APP amount (BDT)
          </span>
          <input
            className="mt-1 h-7 w-full bg-transparent text-lg font-bold tabular-nums text-biz-text outline-none placeholder:text-slate-300"
            inputMode="decimal"
            placeholder="Enter APP amount"
            value={appAmount}
            onChange={(event) => setAppAmount(normalizeNumericInput(event.target.value, 2))}
          />
        </label>
        <label className="rounded-lg border border-biz-border bg-white px-3 py-2 shadow-card">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            NPPI rate
          </span>
          <div className="mt-1 flex items-center">
            <input
              className="h-7 min-w-0 flex-1 bg-transparent text-lg font-bold tabular-nums text-biz-text outline-none"
              inputMode="decimal"
              value={nppiPercent}
              onChange={(event) => setNppiPercent(normalizeNumericInput(event.target.value, 2))}
            />
            <span className="text-sm font-semibold text-slate-500">%</span>
          </div>
        </label>
        <div className="rounded-lg border border-biz-border bg-white px-3 py-2 shadow-card">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Valid bidders
          </span>
          <p className="mt-1 flex items-center gap-2 text-lg font-bold text-biz-text">
            <Users className="h-4 w-4 text-biz-blue" />
            {metrics.totalValidBidders}
          </p>
        </div>
        <div className="rounded-lg border border-biz-success/30 bg-biz-success-soft px-3 py-2 shadow-card xl:col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-biz-success">
            SLT cut-off price
          </span>
          <p
            className="mt-1 truncate text-lg font-bold tabular-nums text-biz-success"
            title={formatNumber(metrics.sltPrice)}
          >
            {calculated ? `BDT ${formatNumber(metrics.sltPrice)}` : "Complete inputs"}
          </p>
        </div>
      </section>

      <div className="grid min-h-[360px] flex-1 gap-2 lg:min-h-0 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.65fr)] 2xl:gap-3">
        <section className="flex min-h-[360px] flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card lg:min-h-0">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-biz-border bg-slate-50/70 px-3 py-2">
            <div>
              <h2 className="text-sm font-bold text-biz-text">Bidder entry</h2>
              <p className="text-[10px] text-slate-500">
                Only included bidders with a valid amount are used.
              </p>
            </div>
            <Button size="sm" onClick={() => setBidders((current) => [...current, makeBidder()])}>
              <Plus className="h-4 w-4" />
              Add bidder
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[500px] text-xs">
              <thead className="sticky top-0 z-10 bg-biz-bg text-left text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-12 px-2 py-2 text-center xl:px-3">Use</th>
                  <th className="w-10 px-2 py-2 xl:px-3">SL</th>
                  <th className="px-2 py-2 xl:px-3">Bidder name</th>
                  <th className="w-40 px-2 py-2 xl:w-56 xl:px-3">Bidding amount (BDT)</th>
                  <th className="w-12 px-2 py-2 text-center xl:w-16 xl:px-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {bidders.map((bidder, index) => (
                  <tr
                    key={bidder.id}
                    className={`border-t border-biz-border ${!bidder.included ? "bg-slate-50 opacity-60" : ""}`}
                  >
                    <td className="px-2 py-2 text-center xl:px-3">
                      <button
                        type="button"
                        aria-label={bidder.included ? "Exclude bidder" : "Include bidder"}
                        className={bidder.included ? "text-biz-blue" : "text-slate-400"}
                        onClick={() => updateBidder(bidder.id, { included: !bidder.included })}
                      >
                        {bidder.included ? (
                          <ToggleRight className="h-6 w-6" />
                        ) : (
                          <ToggleLeft className="h-6 w-6" />
                        )}
                      </button>
                    </td>
                    <td className="px-2 py-2 font-semibold text-slate-500 xl:px-3">{index + 1}</td>
                    <td className="px-2 py-2 xl:px-3">
                      <input
                        className="h-9 w-full rounded-md border border-biz-border px-3 font-medium outline-none focus:border-biz-blue focus:ring-2 focus:ring-biz-blue/10"
                        placeholder={`Bidder ${index + 1} name`}
                        value={bidder.name}
                        onChange={(event) => updateBidder(bidder.id, { name: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2 xl:px-3">
                      <input
                        className="h-9 w-full rounded-md border border-biz-border px-3 text-right font-semibold tabular-nums outline-none focus:border-biz-blue focus:ring-2 focus:ring-biz-blue/10"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={bidder.amount}
                        onChange={(event) =>
                          updateBidder(bidder.id, {
                            amount: normalizeNumericInput(event.target.value, 2),
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-center xl:px-3">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete bidder ${index + 1}`}
                        onClick={() => removeBidder(bidder.id)}
                      >
                        <Trash2 className="h-4 w-4 text-biz-danger" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-biz-border bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
            <span>
              {bidders.length} rows · {metrics.totalValidBidders} included in calculation
            </span>
            <span className="hidden sm:inline">Amounts are evaluated live</span>
          </div>
        </section>

        <aside className="flex min-h-[360px] flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card lg:min-h-0">
          <div className="flex shrink-0 items-center gap-2 border-b border-biz-border bg-slate-50/70 px-3 py-2">
            <Sigma className="h-4 w-4 text-biz-blue" />
            <h2 className="text-sm font-bold text-biz-text">Calculation summary</h2>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Average bid", metrics.averageBid],
                ["NPPI amount", metrics.nppiAmount],
                ["Weighted average", metrics.weightedAverage],
                ["Standard deviation", metrics.standardDeviation],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="min-w-0 rounded-md border border-biz-border px-2.5 py-2"
                >
                  <span className="block truncate text-[10px] font-medium text-slate-500">
                    {label}
                  </span>
                  <span
                    className="mt-0.5 block truncate text-xs font-bold tabular-nums text-biz-text"
                    title={calculated ? formatNumber(Number(value)) : "—"}
                  >
                    {calculated ? formatNumber(Number(value)) : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="hidden rounded-lg border border-biz-blue/20 bg-biz-blue-soft p-3 xl:block">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-biz-blue">
                Formula
              </p>
              <p className="mt-2 text-[11px] leading-5 text-slate-600">
                Weighted average = (50% × Average Bid) + (20% × APP) + (30% × NPPI Amount)
              </p>
              <div className="my-2 border-t border-biz-blue/15" />
              <p className="text-[11px] font-semibold text-biz-text">
                SLT = Weighted Average − Standard Deviation
              </p>
            </div>
            <div className="hidden grid-cols-2 gap-2 xl:grid">
              <div className="rounded-lg bg-biz-success-soft p-3">
                <p className="text-[10px] font-medium text-biz-success">Responsive</p>
                <p className="mt-1 text-xl font-bold text-biz-success">
                  {classification.responsive.length}
                </p>
              </div>
              <div className="rounded-lg bg-biz-danger/10 p-3">
                <p className="text-[10px] font-medium text-biz-danger">Non-responsive</p>
                <p className="mt-1 text-xl font-bold text-biz-danger">
                  {classification.nonResponsive.length}
                </p>
              </div>
            </div>
            {!calculated && (
              <div className="flex gap-2 rounded-lg border border-biz-warning/30 bg-biz-warning-soft p-3 text-[11px] text-biz-warning">
                <TrendingDown className="h-4 w-4 shrink-0" />
                <span>Enter the APP amount and at least one bidder amount to calculate SLT.</span>
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="grid shrink-0 gap-2 lg:max-h-[230px] lg:grid-cols-2 2xl:gap-3 print:max-h-none">
        <ResultTable title="Responsive bidders" rows={classification.responsive} tone="success" />
        <ResultTable
          title="Non-responsive bidders"
          rows={classification.nonResponsive}
          tone="danger"
        />
      </div>
      <ImportPdfModal
        open={importOpen}
        hasExistingRows={existingRows}
        onClose={() => setImportOpen(false)}
        onImport={importRows}
      />
    </div>
  );
}
