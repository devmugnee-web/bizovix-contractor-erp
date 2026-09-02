"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { AppDateInput } from "@/components/shared/app-date-input";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatAmount as formatCanonicalAmount, formatDate, formatDateTime } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import {
  deleteRecycleBinEntry,
  deleteApiRecycleBinEntry,
  emptyRecycleBin,
  emptyApiRecycleBin,
  listApiRecycleBin,
  listRecycleBinWorkspaces,
  readAllRecycleBin,
  readRecycleBin,
  restoreRecycleBinEntry,
  restoreApiRecycleBinEntry,
  type RecycleBinEntry,
} from "@/services/recycle-bin";

function formatDeletedOn(value: string) {
  return formatDateTime(value);
}

function formatAmount(value: number) {
  return `${formatCanonicalAmount(value)} Tk`;
}

function toDateInputValue(date: Date) {
  // Deliberately built from local date parts, not toISOString() — that converts to
  // UTC first, which silently shifts the date by one day for any timezone ahead of
  // UTC (e.g. "Aug 1 local midnight" becomes "Jul 31" in UTC).
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthStart() {
  const date = new Date();
  date.setDate(1);
  return toDateInputValue(date);
}

function getToday() {
  return toDateInputValue(new Date());
}

export function RecycleBinScreen() {
  const { mode, session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "";
  const [entries, setEntries] = useState<RecycleBinEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchWorking, setBatchWorking] = useState(false);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState(() => getCurrentMonthStart());
  const [toDate, setToDate] = useState(() => getToday());
  const [workspaceFilter, setWorkspaceFilter] = useState(workspaceId || "all");
  const [emptyTrashDialogOpen, setEmptyTrashDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    setWorkspaceFilter(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    const syncEntries = () => {
      if (mode === "api") {
        void listApiRecycleBin(workspaceFilter === "all" ? workspaceId : workspaceFilter || workspaceId)
          .then(setEntries)
          .catch(() => setEntries([]));
        return;
      }

      setEntries(
        workspaceFilter === "all"
          ? readAllRecycleBin(mode)
          : readRecycleBin(mode, workspaceFilter || workspaceId),
      );
    };

    syncEntries();
    window.addEventListener("bizovix-recycle-bin-changed", syncEntries);
    window.addEventListener("bizovix-recycle-bin-restored", syncEntries);

    return () => {
      window.removeEventListener("bizovix-recycle-bin-changed", syncEntries);
      window.removeEventListener("bizovix-recycle-bin-restored", syncEntries);
    };
  }, [mode, workspaceFilter, workspaceId]);

  const workspaces = useMemo(() => (mode === "api" && workspaceId ? [{ id: workspaceId, name: "Current Firm" }] : listRecycleBinWorkspaces(mode)), [mode, workspaceId]);

  const filteredEntries = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();

    return entries.filter((entry) => {
      if (workspaceFilter !== "all" && entry.workspaceId !== workspaceFilter) {
        return false;
      }

      if (fromDate && entry.deletedOn.slice(0, 10) < fromDate) {
        return false;
      }

      if (toDate && entry.deletedOn.slice(0, 10) > toDate) {
        return false;
      }

      if (!needle) {
        return true;
      }

      const haystack = `${entry.refNo} ${entry.partyName} ${entry.txnType} ${entry.paymentType}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [entries, fromDate, searchTerm, toDate, workspaceFilter]);

  const selectedEntries = entries.filter((entry) => selectedIds.includes(entry.id));
  const visibleSelectedCount = filteredEntries.filter((entry) => selectedIds.includes(entry.id)).length;
  const allVisibleSelected = filteredEntries.length > 0 && visibleSelectedCount === filteredEntries.length;
  const totalAmount = sumMoney(filteredEntries.map((entry) => Number(entry.amount || 0)));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = visibleSelectedCount > 0 && !allVisibleSelected;
    }
  }, [allVisibleSelected, visibleSelectedCount]);

  function toggleEntry(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((entryId) => entryId !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    const visibleIds = filteredEntries.map((entry) => entry.id);
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])));
  }

  async function handleRestore() {
    if (!selectedEntries.length) {
      toast.error("Select at least one row first");
      return;
    }

    setBatchWorking(true);
    const restoredIds: string[] = [];
    try {
      for (const entry of selectedEntries) {
        if (mode === "api") {
          await restoreApiRecycleBinEntry(entry.id);
          restoredIds.push(entry.id);
        } else if (restoreRecycleBinEntry(mode, entry.workspaceId, entry.id)) {
          restoredIds.push(entry.id);
        }
      }
      setEntries((current) => current.filter((entry) => !restoredIds.includes(entry.id)));
      setSelectedIds((current) => current.filter((id) => !restoredIds.includes(id)));
      toast.success(`${restoredIds.length} recycled entr${restoredIds.length === 1 ? "y" : "ies"} restored`);
    } catch (error) {
      setEntries((current) => current.filter((entry) => !restoredIds.includes(entry.id)));
      setSelectedIds((current) => current.filter((id) => !restoredIds.includes(id)));
      toast.error(error instanceof Error ? error.message : "Some selected records could not be restored");
    } finally {
      setBatchWorking(false);
    }
  }

  async function handleDeletePermanently() {
    if (!selectedEntries.length) {
      toast.error("Select at least one row first");
      return;
    }

    setBatchWorking(true);
    const deletedIds: string[] = [];
    try {
      for (const entry of selectedEntries) {
        if (mode === "api") {
          await deleteApiRecycleBinEntry(entry.id);
          deletedIds.push(entry.id);
        } else if (deleteRecycleBinEntry(mode, entry.workspaceId, entry.id)) {
          deletedIds.push(entry.id);
        }
      }
      setEntries((current) => current.filter((entry) => !deletedIds.includes(entry.id)));
      setSelectedIds((current) => current.filter((id) => !deletedIds.includes(id)));
      toast.success(`${deletedIds.length} recycled entr${deletedIds.length === 1 ? "y" : "ies"} permanently deleted`);
    } catch (error) {
      setEntries((current) => current.filter((entry) => !deletedIds.includes(entry.id)));
      setSelectedIds((current) => current.filter((id) => !deletedIds.includes(id)));
      toast.error(error instanceof Error ? error.message : "Some selected records could not be deleted");
    } finally {
      setBatchWorking(false);
    }
  }

  async function handleEmptyTrash() {
    if (!workspaceId && workspaceFilter !== "all") {
      toast.error("Workspace not found");
      return;
    }

    if (mode === "api") {
      const result = await emptyApiRecycleBin(workspaceFilter === "all" ? workspaceId : workspaceFilter);
      setEntries([]);
      setSelectedIds([]);
      toast.success(`Removed ${result.removedCount} recycled entr${result.removedCount > 1 ? "ies" : "y"}`);
      return;
    }

    const removedCount = emptyRecycleBin(mode, workspaceFilter === "all" ? "all" : workspaceFilter);
    setSelectedIds([]);

    if (!removedCount) {
      toast.error("Recycle bin is already empty");
      return;
    }

    toast.success(`Removed ${removedCount} recycled entr${removedCount > 1 ? "ies" : "y"}`);
  }

  return (
    <div data-recycle-bin-screen className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[8px] border border-[#d9e1ed] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
      <ConfirmationDialog
        open={emptyTrashDialogOpen}
        onOpenChange={setEmptyTrashDialogOpen}
        title="Empty the recycle bin?"
        description={`This permanently removes all ${filteredEntries.length} recycled entr${filteredEntries.length === 1 ? "y" : "ies"} shown in the current filter. This cannot be undone.`}
        confirmLabel="Empty Trash"
        tone="danger"
        onConfirm={() => {
          setEmptyTrashDialogOpen(false);
          void handleEmptyTrash();
        }}
      />
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={`Delete ${selectedEntries.length} selected ${selectedEntries.length === 1 ? "record" : "records"} permanently?`}
        description={`The selected ${selectedEntries.length === 1 ? "record" : "records"} will be permanently deleted and cannot be restored.`}
        confirmLabel="Delete Permanently"
        tone="danger"
        onConfirm={() => {
          setDeleteDialogOpen(false);
          void handleDeletePermanently();
        }}
      />
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#e6edf5] bg-[#fafafa] px-4 py-3 shadow-[0_2px_6px_rgba(15,23,42,0.04)] 2xl:px-5 2xl:py-4">
        <div className="min-w-0">
          <div className="text-[18px] font-semibold text-[#20344f]">Recycle Bin</div>
          <p className="mt-1 text-[13px] text-[#71839f]">
            Deleted vouchers, parties, and items stay here until restored or permanently removed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRestore()}
            disabled={!selectedEntries.length || batchWorking}
            className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-primary px-3 text-[12px] font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-[#c9cfdd] disabled:text-white/80 2xl:h-10 2xl:px-4 2xl:text-[13px]"
          >
            <RotateCcw className="h-4 w-4" />
            Restore{selectedEntries.length ? ` (${selectedEntries.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!selectedEntries.length || batchWorking}
            className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-[#f1c4bf] bg-white px-3 text-[12px] font-semibold text-[#d6453d] transition hover:bg-[#fff5f4] disabled:cursor-not-allowed disabled:border-[#e6ebf2] disabled:text-[#b8c1d0] 2xl:h-10 2xl:px-4 2xl:text-[13px]"
          >
            <Trash2 className="h-4 w-4" />
            Delete Permanently{selectedEntries.length ? ` (${selectedEntries.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setEmptyTrashDialogOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[#d6453d] px-3 text-[12px] font-semibold text-white transition hover:bg-[#c03a32] 2xl:h-10 2xl:px-4 2xl:text-[13px]"
          >
            <Trash2 className="h-4 w-4" />
            Empty Trash
          </button>
        </div>
      </div>

      <div className="border-b border-[#edf2f7] bg-white px-4 py-3 2xl:px-5 2xl:py-4">
        <div data-recycle-bin-filters className="grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_36px] md:items-center xl:grid-cols-[auto_minmax(330px,450px)_36px_minmax(160px,220px)_minmax(140px,1fr)] 2xl:gap-3 2xl:grid-cols-[auto_minmax(360px,520px)_36px_minmax(180px,240px)_1fr]">
          <div className="text-[18px] font-semibold text-[#20344f]">Custom</div>

          <div className="grid overflow-hidden rounded-[6px] border border-[#c7d0da] bg-white sm:inline-grid sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <span className="flex h-10 items-center bg-[#315b8f] px-3 text-[13px] font-semibold text-white">Between</span>
            <AppDateInput
              value={fromDate}
              onChange={setFromDate}
              className="min-w-0"
              inputClassName="h-10 min-w-0 rounded-none border-0 px-3 pr-9 text-[14px] text-[#23344d] focus:ring-0"
              aria-label="Recycle Bin from date"
            />
            <span className="flex h-10 items-center px-3 text-[14px] text-[#687c9d]">To</span>
            <AppDateInput
              value={toDate}
              onChange={setToDate}
              className="min-w-0"
              inputClassName="h-10 min-w-0 rounded-none border-0 px-3 pr-9 text-[14px] text-[#23344d] focus:ring-0"
              aria-label="Recycle Bin to date"
            />
          </div>

          <CollapsibleSearch
            value={searchTerm}
            onChange={setSearchTerm}
            label="Search deleted records"
            placeholder="Search deleted records"
            expandedWidth="w-full"
          />

          <select
            value={workspaceFilter}
            onChange={(event) => setWorkspaceFilter(event.target.value)}
            className="h-10 min-w-0 rounded-[6px] border border-[#cfd8e4] bg-white px-4 text-[14px] text-[#23344d] outline-none md:col-span-2 xl:col-span-1"
          >
            <option value="all">ALL FIRM</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-2 md:justify-end xl:justify-end">
            <span className="rounded-full bg-[#eef5ff] px-3 py-1 text-[12px] font-semibold text-[#2f6fc5]">
              {filteredEntries.length} recycled
            </span>
            <span className="rounded-full bg-[#fff5eb] px-3 py-1 text-[12px] font-semibold text-[#c75c0a]">
              {formatAmount(totalAmount)}
            </span>
          </div>
        </div>
      </div>

      <div data-recycle-bin-table-viewport className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-white">
        <table data-recycle-bin-table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[4.5%]" />
            <col className="w-[11%]" />
            <col className="w-[12%]" />
            <col className="w-[19%]" />
            <col className="w-[11%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
            <col className="w-[17.5%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[#fbfcff] text-[10px] font-semibold uppercase leading-tight text-[#687c9d] 2xl:text-[12px]">
            <tr>
              <th className="border-b border-r border-[#dfe7f1] px-1.5 py-3 text-center 2xl:px-3 2xl:py-4"><input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} disabled={!filteredEntries.length || batchWorking} onChange={toggleAllVisible} aria-label="Select all visible recycled entries" className="h-4 w-4 cursor-pointer rounded-[2px] accent-[#e96f0b] disabled:cursor-not-allowed" /></th>
              <th className="break-words border-b border-r border-[#dfe7f1] px-2 py-3 2xl:px-3 2xl:py-4">Transaction Date</th>
              <th className="break-words border-b border-r border-[#dfe7f1] px-2 py-3 2xl:px-3 2xl:py-4">Ref. No.</th>
              <th className="break-words border-b border-r border-[#dfe7f1] px-2 py-3 2xl:px-3 2xl:py-4">Party Name</th>
              <th className="break-words border-b border-r border-[#dfe7f1] px-2 py-3 2xl:px-3 2xl:py-4">TXN Type</th>
              <th className="break-words border-b border-r border-[#dfe7f1] px-2 py-3 2xl:px-3 2xl:py-4">Payment Type</th>
              <th className="break-words border-b border-r border-[#dfe7f1] px-2 py-3 text-right 2xl:px-3 2xl:py-4">Amount</th>
              <th className="break-words border-b px-2 py-3 2xl:px-3 2xl:py-4">Deleted On</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length ? (
              filteredEntries.map((entry) => (
                <tr
                  key={entry.id}
                  className={`border-b border-[#edf2f7] text-[12px] text-[#20344f] transition 2xl:text-[14px] ${
                    selectedIds.includes(entry.id) ? "bg-[#fff7ed]" : "hover:bg-[#fbfcff]"
                  }`}
                >
                  <td className="border-r border-[#dfe7f1] px-1.5 py-3 text-center 2xl:px-3 2xl:py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(entry.id)}
                      onChange={() => toggleEntry(entry.id)}
                      disabled={batchWorking}
                      className="h-4 w-4 cursor-pointer rounded-[2px] accent-[#e96f0b] disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="border-r border-[#dfe7f1] px-2 py-3 2xl:px-3 2xl:py-4">{formatDate(entry.transactionDate)}</td>
                  <td className="break-words border-r border-[#dfe7f1] px-2 py-3 2xl:px-3 2xl:py-4">{entry.refNo || "---"}</td>
                  <td className="break-words border-r border-[#dfe7f1] px-2 py-3 font-semibold 2xl:px-3 2xl:py-4">{entry.partyName}</td>
                  <td className="break-words border-r border-[#dfe7f1] px-2 py-3 capitalize 2xl:px-3 2xl:py-4">{entry.txnType}</td>
                  <td className="break-words border-r border-[#dfe7f1] px-2 py-3 2xl:px-3 2xl:py-4">{entry.paymentType}</td>
                  <td className="break-words border-r border-[#dfe7f1] px-2 py-3 text-right tabular-nums 2xl:px-3 2xl:py-4">{formatAmount(entry.amount)}</td>
                  <td className="break-words px-2 py-3 leading-4 2xl:px-3 2xl:py-4">{formatDeletedOn(entry.deletedOn)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <div className="mx-auto flex max-w-[360px] flex-col items-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#eef5ff] text-[#2f6fc5]">
                      <RotateCcw className="h-6 w-6" />
                    </div>
                    <div className="mt-4 text-[16px] font-semibold text-[#20344f]">No deleted entries found</div>
                    <p className="mt-2 text-[13px] leading-5 text-[#7b8aa2]">
                      Deleted vouchers, parties, and items will appear here for the selected date range.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

