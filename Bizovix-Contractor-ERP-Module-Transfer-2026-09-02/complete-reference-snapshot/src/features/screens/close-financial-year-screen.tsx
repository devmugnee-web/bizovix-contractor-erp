"use client";

import { CheckCircle2, CircleAlert, Download, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import { buildWorkspaceBackup, downloadWorkspaceBackup } from "@/services/workspace-backup";
import { listWorkspaces } from "@/services/workspace.service";
import { deleteVoucher, listDayBook } from "@/services/voucher.service";

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getToday() {
  return toDateInputValue(new Date());
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function buildNextFinancialYear(closingDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) return { financialYear: "—", openPeriod: "—" };
  const start = parseLocalDate(closingDate);
  if (Number.isNaN(start.getTime())) return { financialYear: "—", openPeriod: "—" };
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  const openPeriodEnd = new Date(start);
  openPeriodEnd.setMonth(openPeriodEnd.getMonth() + 1);
  openPeriodEnd.setDate(openPeriodEnd.getDate() - 1);
  return {
    financialYear: `${formatDate(start)} - ${formatDate(end)}`,
    openPeriod: `${formatDate(start)} - ${formatDate(openPeriodEnd)}`,
  };
}

export function CloseFinancialYearScreen() {
  const { mode, session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "";
  const [closingDate, setClosingDate] = useState(getToday);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [backupDownloading, setBackupDownloading] = useState(false);
  const nextYear = buildNextFinancialYear(closingDate);

  const workspacesQuery = useQuery({
    queryKey: [mode, "workspaces"],
    queryFn: () => listWorkspaces(mode),
    enabled: Boolean(workspaceId),
  });
  const workspaceName = workspacesQuery.data?.find((workspace) => workspace.id === workspaceId)?.name ?? "Current Workspace";

  const vouchersQuery = useQuery({
    queryKey: [mode, "close-financial-year-vouchers", workspaceId],
    queryFn: () => listDayBook(mode, { workspaceId }),
    enabled: Boolean(workspaceId),
  });

  const affectedVouchers = useMemo(
    () => (vouchersQuery.data ?? []).filter((voucher) => voucher.voucherDate <= closingDate),
    [closingDate, vouchersQuery.data],
  );
  const affectedAmount = sumMoney(affectedVouchers.map((voucher) => voucher.amount));

  async function handleDownloadBackup() {
    if (!workspaceId) return toast.error("Active workspace not found");
    setBackupDownloading(true);
    try {
      const backup = await buildWorkspaceBackup(mode, workspaceId);
      downloadWorkspaceBackup(backup);
      toast.success("Backup downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Backup could not be created");
    } finally {
      setBackupDownloading(false);
    }
  }

  function handleStartFreshClick() {
    if (!workspaceId) return toast.error("Active workspace not found");
    if (!closingDate || closingDate > getToday()) return toast.error("Closing date cannot be in the future");
    if (!affectedVouchers.length) return toast.error("No transaction found up to the selected closing date");
    setConfirmOpen(true);
  }

  async function confirmStartFresh() {
    setConfirmOpen(false);
    setProcessing(true);
    let movedCount = 0;
    try {
      const backup = await buildWorkspaceBackup(mode, workspaceId);
      downloadWorkspaceBackup(backup);
      for (const voucher of affectedVouchers) {
        await deleteVoucher(mode, voucher.id, workspaceId);
        movedCount += 1;
      }
      await vouchersQuery.refetch();
      toast.success(`Backup downloaded and ${movedCount} transaction${movedCount === 1 ? "" : "s"} moved to Recycle Bin.`);
    } catch (error) {
      await vouchersQuery.refetch();
      toast.error(movedCount
        ? `${movedCount} transaction${movedCount === 1 ? " was" : "s were"} moved before the operation stopped. Remaining records were not changed.`
        : error instanceof Error ? error.message : "Could not complete the financial year close");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-[10px] border border-[#d9e1ed] bg-[#f7f9fc] shadow-[0_16px_36px_rgba(15,23,42,0.04)]">
      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Close the financial year?"
        description={`A full backup of ${workspaceName} downloads first. Then ${affectedVouchers.length} transaction${affectedVouchers.length === 1 ? "" : "s"} totalling ${formatCurrency(affectedAmount)} on or before ${formatDate(closingDate)} will move to the Recycle Bin. Nothing is permanently deleted.`}
        confirmLabel="Backup & Move to Recycle Bin"
        tone="danger"
        onConfirm={() => void confirmStartFresh()}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe6ef] bg-white px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef5ff] text-[#2f6fc5]"><ShieldCheck className="h-5 w-5" /></span>
          <div className="min-w-0"><h1 className="text-xl font-semibold text-[#20344f]">Close Financial Year</h1><p className="truncate text-xs text-[#71839a]">{workspaceName} · backup first, then move closed transactions to Recycle Bin</p></div>
        </div>
        <Button type="button" variant="outline" onClick={() => void handleDownloadBackup()} disabled={backupDownloading || processing} className="h-9 rounded-lg"><Download className="h-4 w-4" />{backupDownloading ? "Preparing..." : "Backup Only"}</Button>
      </div>

      <div className="grid flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <section className="rounded-xl border border-[#e1e8f1] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[#dfe7f1] bg-[#f9fbfe] p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-[#7f8fa7]">Closing date</div><div className="mt-1.5 font-semibold text-[#20344f]">{closingDate ? formatDate(closingDate) : "—"}</div></div>
            <div className="rounded-lg border border-[#f0dfcf] bg-[#fffaf5] p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-[#a4734d]">Affected</div><div className="mt-1.5 font-semibold text-[#c75c0a]">{vouchersQuery.isLoading ? "Checking..." : `${affectedVouchers.length} transactions`}</div></div>
            <div className="rounded-lg border border-[#dfe7f1] bg-[#f9fbfe] p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-[#7f8fa7]">Total amount</div><div className="mt-1.5 truncate font-semibold text-[#20344f]">{formatCurrency(affectedAmount)}</div></div>
          </div>

          <div className="mt-4 rounded-xl border border-[#f1ddca] bg-[#fffaf5] p-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#b85a12]">Select closing date</label>
            <div className="mt-2 grid gap-3 sm:grid-cols-[220px_1fr] sm:items-center">
              <AppDateInput aria-label="Select closing date" value={closingDate} max={getToday()} onChange={(value) => setClosingDate(value)} inputClassName="h-11 rounded-lg border-[#d5deea] bg-white px-3 pr-10 text-sm font-medium text-[#20344f] focus:border-[#e27b28]" />
              <div className="text-sm text-[#667892]">Next financial year: <span className="font-semibold text-[#20344f]">{nextYear.financialYear}</span></div>
            </div>
          </div>

          {vouchersQuery.isError ? <div className="mt-4 rounded-lg border border-[#f3c9c4] bg-[#fff5f4] px-4 py-3 text-sm text-[#c63f37]">Transactions could not be loaded. Refresh before closing the year.</div> : null}
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#cfe3ff] bg-[#eff6ff] px-4 py-3 text-sm leading-5 text-[#2467bb]"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>A complete workspace backup downloads before any transaction is moved. Closed records remain recoverable from Recycle Bin.</span></div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ecf3] pt-4">
            <div className="text-sm text-[#667892]">Open period after close: <span className="font-semibold text-[#20344f]">{nextYear.openPeriod}</span></div>
            <Button type="button" onClick={handleStartFreshClick} disabled={processing || vouchersQuery.isLoading || vouchersQuery.isError || !affectedVouchers.length} className="h-11 rounded-lg bg-primary px-6 font-semibold text-white shadow-[0_10px_24px_rgba(234,88,12,0.18)] hover:bg-primary/90">{processing ? "Closing year..." : `Backup & Close (${affectedVouchers.length})`}</Button>
          </div>
        </section>

        <aside className="rounded-xl border border-[#e1e8f1] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <h2 className="text-base font-semibold text-[#20344f]">Before you close</h2>
          <div className="mt-4 space-y-3">
            {["Run Verify My Data and resolve critical voucher issues.", "Confirm the date and affected transaction count.", "Save the downloaded backup somewhere safe."].map((item) => <div key={item} className="flex items-start gap-2.5 text-sm leading-5 text-[#667892]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1a9b5b]" /><span>{item}</span></div>)}
          </div>
          <div className="mt-5 rounded-lg border border-[#f1ddca] bg-[#fffaf5] p-3 text-xs leading-5 text-[#805d42]"><span className="font-semibold text-[#b85a12]">What changes:</span> Active lists stop showing the selected transactions. Parties, items, accounts, and protected system accounts are not deleted or modified.</div>
        </aside>
      </div>
    </div>
  );
}
