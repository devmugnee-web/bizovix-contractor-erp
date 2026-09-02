"use client";

import { readDataset, writeDataset } from "@/services/browser-dataset";
import { apiRequest } from "@/services/api-client";
import { roundMoney } from "@/lib/money";
import type { DataMode, PartyRecord, StockItemRecord, VoucherRecord, Workspace } from "@/types/domain";

type LocalMode = Exclude<DataMode, "api">;
export type RecycleBinEntryKind = "voucher" | "party" | "item";

type RecycleSnapshotMap = {
  voucher: VoucherRecord;
  party: PartyRecord;
  item: StockItemRecord;
};

export interface RecycleBinEntry<TKind extends RecycleBinEntryKind = RecycleBinEntryKind> {
  id: string;
  workspaceId: string;
  workspaceName: string;
  kind: TKind;
  transactionDate: string;
  refNo: string;
  partyName: string;
  txnType: string;
  paymentType: string;
  amount: number;
  deletedOn: string;
  deletedBy: string;
  snapshot: RecycleSnapshotMap[TKind];
}

const STORAGE_KEYS: Record<LocalMode, string> = {
  mock: "bizovix:mock:recycle-bin:v1",
  demo: "bizovix:demo:recycle-bin:v1",
};

function dispatchRecycleEvent(name: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(name));
}

function readEntries(mode: LocalMode) {
  if (typeof window === "undefined") {
    return [] as RecycleBinEntry[];
  }

  const raw = window.localStorage.getItem(STORAGE_KEYS[mode]);
  if (!raw) {
    return [] as RecycleBinEntry[];
  }

  try {
    const parsed = JSON.parse(raw) as RecycleBinEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(mode: LocalMode, entries: RecycleBinEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS[mode], JSON.stringify(entries));
  dispatchRecycleEvent("bizovix-recycle-bin-changed");
}

function getWorkspaceName(mode: LocalMode, workspaceId: string) {
  const dataset = readDataset(mode);
  return dataset.workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "Current Workspace";
}

function appendEntry(mode: LocalMode, entry: RecycleBinEntry) {
  const entries = readEntries(mode);
  writeEntries(mode, [entry, ...entries]);
}

function isoNow() {
  return new Date().toISOString();
}

export function readRecycleBin(mode: DataMode, workspaceId: string) {
  if (mode === "api") {
    return [] as RecycleBinEntry[];
  }

  return readEntries(mode)
    .filter((entry) => entry.workspaceId === workspaceId)
    .sort((left, right) => right.deletedOn.localeCompare(left.deletedOn));
}

export function listApiRecycleBin(workspaceId: string) {
  return apiRequest<RecycleBinEntry[]>(`/recycle-bin?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export function readAllRecycleBin(mode: DataMode) {
  if (mode === "api") {
    return [] as RecycleBinEntry[];
  }

  return readEntries(mode).sort((left, right) => right.deletedOn.localeCompare(left.deletedOn));
}

export function listRecycleBinWorkspaces(mode: DataMode) {
  if (mode === "api") {
    return [] as Workspace[];
  }

  return readDataset(mode).workspaces;
}

export function moveVoucherToRecycleBin(mode: DataMode, voucher: VoucherRecord, deletedBy: string) {
  if (mode === "api") {
    return;
  }

  appendEntry(mode, {
    id: `recycle-voucher-${voucher.id}-${Date.now()}`,
    workspaceId: voucher.workspaceId,
    workspaceName: getWorkspaceName(mode, voucher.workspaceId),
    kind: "voucher",
    transactionDate: voucher.voucherDate,
    refNo: voucher.reference?.trim() || voucher.voucherNumber,
    partyName: voucher.partyName || "-",
    txnType: voucher.voucherType,
    paymentType:
      voucher.settlementMode === "cash"
        ? "Cash"
        : voucher.settlementMode === "bank"
          ? "Bank"
          : voucher.settlementMode === "accounts-payable"
            ? "Credit"
            : "Cash",
    amount: roundMoney(Number(voucher.amount || 0)),
    deletedOn: isoNow(),
    deletedBy,
    snapshot: voucher,
  });
}

export function movePartyToRecycleBin(mode: DataMode, party: PartyRecord, deletedBy: string) {
  if (mode === "api") {
    return;
  }

  appendEntry(mode, {
    id: `recycle-party-${party.id}-${Date.now()}`,
    workspaceId: party.workspaceId,
    workspaceName: getWorkspaceName(mode, party.workspaceId),
    kind: "party",
    transactionDate: isoNow(),
    refNo: party.contact || party.id,
    partyName: party.name,
    txnType: party.type,
    paymentType: party.status,
    amount: roundMoney(Number(party.creditLimit || 0)),
    deletedOn: isoNow(),
    deletedBy,
    snapshot: party,
  });
}

export function moveItemToRecycleBin(mode: DataMode, item: StockItemRecord, deletedBy: string) {
  if (mode === "api") {
    return;
  }

  appendEntry(mode, {
    id: `recycle-item-${item.id}-${Date.now()}`,
    workspaceId: item.workspaceId,
    workspaceName: getWorkspaceName(mode, item.workspaceId),
    kind: "item",
    transactionDate: isoNow(),
    refNo: item.itemCode,
    partyName: item.itemName,
    txnType: item.category || "item",
    paymentType: item.status,
    amount: roundMoney(Number(item.openingQty || 0) * Number(item.openingRate || 0)),
    deletedOn: isoNow(),
    deletedBy,
    snapshot: item,
  });
}

export function restoreRecycleBinEntry(mode: DataMode, workspaceId: string, entryId: string) {
  if (mode === "api") {
    return null;
  }

  const entries = readEntries(mode);
  const target = entries.find((entry) => entry.id === entryId && entry.workspaceId === workspaceId);
  if (!target) {
    return null;
  }

  const dataset = readDataset(mode);

  if (target.kind === "voucher" && !dataset.vouchers.some((entry) => entry.id === target.snapshot.id)) {
    writeDataset(mode, { ...dataset, vouchers: [target.snapshot as VoucherRecord, ...dataset.vouchers] });
  }

  if (target.kind === "party" && !dataset.parties.some((entry) => entry.id === target.snapshot.id)) {
    writeDataset(mode, { ...dataset, parties: [target.snapshot as PartyRecord, ...dataset.parties] });
  }

  if (target.kind === "item" && !dataset.stockItems.some((entry) => entry.id === target.snapshot.id)) {
    writeDataset(mode, { ...dataset, stockItems: [target.snapshot as StockItemRecord, ...dataset.stockItems] });
  }

  writeEntries(
    mode,
    entries.filter((entry) => entry.id !== entryId),
  );
  dispatchRecycleEvent("bizovix-recycle-bin-restored");
  return target;
}

export function restoreApiRecycleBinEntry(entryId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/recycle-bin/${encodeURIComponent(entryId)}/restore`, {
    method: "POST",
  });
}

export function deleteRecycleBinEntry(mode: DataMode, workspaceId: string, entryId: string) {
  if (mode === "api") {
    return null;
  }

  const entries = readEntries(mode);
  const target = entries.find((entry) => entry.id === entryId && entry.workspaceId === workspaceId);
  if (!target) {
    return null;
  }

  writeEntries(
    mode,
    entries.filter((entry) => entry.id !== entryId),
  );
  return target;
}

export function deleteApiRecycleBinEntry(entryId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/recycle-bin/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
  });
}

export function emptyRecycleBin(mode: DataMode, workspaceId: string | "all") {
  if (mode === "api") {
    return 0;
  }

  const entries = readEntries(mode);
  const removedCount =
    workspaceId === "all"
      ? entries.length
      : entries.filter((entry) => entry.workspaceId === workspaceId).length;
  writeEntries(
    mode,
    workspaceId === "all" ? [] : entries.filter((entry) => entry.workspaceId !== workspaceId),
  );
  return removedCount;
}

export function emptyApiRecycleBin(workspaceId: string) {
  return apiRequest<{ success: boolean; removedCount: number }>(`/recycle-bin?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: "DELETE",
  });
}
