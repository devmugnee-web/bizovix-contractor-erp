"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileDown,
  Landmark,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildWorkspaceRoute } from "@/config/routes";
import { useSessionContext } from "@/hooks/use-session-context";
import { useMoneyAccountsQuery } from "@/hooks/use-accounts-query";
import { createVoucher, updateVoucher } from "@/services/voucher.service";
import { downloadCsv } from "@/lib/download";
import { formatCurrency, formatDate } from "@/lib/format";
import { moneyToMinorUnits, roundMoney, sumMoney } from "@/lib/money";
import { openPrintWindow as openPrintableWindow, printWindowWhenReady } from "@/lib/print";
import { cn } from "@/lib/utils";
import { AppDateInput } from "@/components/shared/app-date-input";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { TablePagination } from "@/components/shared/table-pagination";
import type { VoucherFormInput, VoucherRecord } from "@/types/domain";

type TransferAccount = {
  id: string;
  name: string;
  subtitle: string;
  kind: "bank" | "cash" | "mfs";
  openingBalance: number;
};

type BankTransferRecord = {
  id: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  transferDate: string;
  reference: string;
  notes: string;
  createdAt: string;
};

type TransferFormState = {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  transferDate: string;
  reference: string;
  notes: string;
};

type StoredBankAccount = {
  id?: unknown;
  displayName?: unknown;
  bankName?: unknown;
  branchName?: unknown;
  accountNumber?: unknown;
  openingBalance?: unknown;
};

const cashAccounts: TransferAccount[] = [
  { id: "cash-main", name: "Cash in Hand", subtitle: "Main cash drawer", kind: "cash", openingBalance: 0 },
  { id: "cash-petty", name: "Petty Cash", subtitle: "Daily office spending", kind: "cash", openingBalance: 0 },
];

function buildDefaultFormState(): TransferFormState {
  return {
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    transferDate: new Date().toISOString().slice(0, 10),
    reference: "",
    notes: "",
  };
}

function normalizeAmount(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim() || 0);
  return roundMoney(Number.isFinite(parsed) ? parsed : 0);
}

function formatTransferDate(value: string) {
  return value ? formatDate(value) : "-";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readBankAccounts(storageKey: string): TransferAccount[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as StoredBankAccount[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry) => typeof entry?.id === "string" && typeof entry?.displayName === "string")
      .map((entry) => {
        const bankName = typeof entry.bankName === "string" ? entry.bankName : "";
        const branchName = typeof entry.branchName === "string" ? entry.branchName : "";
        const accountNumber = typeof entry.accountNumber === "string" ? entry.accountNumber : "";
        const subtitle = [bankName || "Bank details not added", branchName, accountNumber].filter(Boolean).join(" · ");

        return {
          id: String(entry.id),
          name: String(entry.displayName),
          subtitle,
          kind: "bank" as const,
          openingBalance:
            typeof entry.openingBalance === "number" && Number.isFinite(entry.openingBalance)
              ? roundMoney(entry.openingBalance)
              : 0,
        };
      });
  } catch {
    return [];
  }
}

export function BankTransfersScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, session } = useSessionContext();
  const createRequestRef = useRef("");
  const editRequestRef = useRef("");
  const workspaceId = session?.workspaceId ?? "default";
  const storageKey = `bizovix:bank-transfers:${mode}:${workspaceId}`;
  const bankAccountsKey = `bizovix:bank-accounts:${mode}:${workspaceId}`;

  const [transfers, setTransfers] = useState<BankTransferRecord[]>([]);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<TransferAccount[]>([]);
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TransferFormState>(() => buildDefaultFormState());
  const [deleteTarget, setDeleteTarget] = useState<BankTransferRecord | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const moneyAccountsQuery = useMoneyAccountsQuery(mode === "api");

  const accounts = useMemo(() => mode === "api" ? bankAccounts : [...bankAccounts, ...cashAccounts], [bankAccounts, mode]);

  const refreshBankAccounts = useCallback(() => {
    if (mode === "api") return;
    setBankAccounts(readBankAccounts(bankAccountsKey));
  }, [bankAccountsKey, mode]);

  useEffect(() => {
    if (mode !== "api") return;
    setBankAccounts((moneyAccountsQuery.data ?? []).map((account) => ({
      id: account.id,
      name: account.name,
      subtitle: account.path,
      kind: account.type === "CASH" ? "cash" : account.type === "MFS" ? "mfs" : "bank",
      openingBalance: roundMoney(account.currentBalance),
    })));
  }, [mode, moneyAccountsQuery.data]);

  useEffect(() => {
    refreshBankAccounts();

    function handleFocus() {
      refreshBankAccounts();
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [refreshBankAccounts]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setTransfers([]);
      setHydratedKey(storageKey);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as BankTransferRecord[];
      setTransfers(
        Array.isArray(parsed)
          ? parsed.map((transfer) => ({
              ...transfer,
              amount: roundMoney(transfer.amount),
            }))
          : [],
      );
    } catch {
      window.localStorage.removeItem(storageKey);
      setTransfers([]);
    }

    setHydratedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    // Never write before the stored transfers have been read back for this key,
    // otherwise the initial empty state overwrites whatever the user already saved.
    if (typeof window === "undefined" || hydratedKey !== storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(transfers));
  }, [transfers, hydratedKey, storageKey]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-transfer-header-menu]")) {
        return;
      }

      setHeaderMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const accountBalances = useMemo(() => {
    const balances = new Map<string, number>();
    accounts.forEach((account) => balances.set(account.id, roundMoney(account.openingBalance)));

    transfers.forEach((transfer) => {
      if (balances.has(transfer.fromAccountId)) {
        balances.set(
          transfer.fromAccountId,
          sumMoney([balances.get(transfer.fromAccountId) ?? 0, -roundMoney(transfer.amount)]),
        );
      }
      if (balances.has(transfer.toAccountId)) {
        balances.set(
          transfer.toAccountId,
          sumMoney([balances.get(transfer.toAccountId) ?? 0, roundMoney(transfer.amount)]),
        );
      }
    });

    return balances;
  }, [accounts, transfers]);

  const sortedTransfers = useMemo(
    () =>
      [...transfers].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.transferDate.localeCompare(left.transferDate)),
    [transfers],
  );

  const filteredTransfers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sortedTransfers.filter((transfer) => {
      if (accountFilter && transfer.fromAccountId !== accountFilter && transfer.toAccountId !== accountFilter) {
        return false;
      }

      if (!needle) {
        return true;
      }

      return [transfer.fromAccountName, transfer.toAccountName, transfer.reference, transfer.notes, formatTransferDate(transfer.transferDate)]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(needle));
    });
  }, [sortedTransfers, accountFilter, search]);

  const paginatedTransfers = useMemo(
    () => filteredTransfers.slice((page - 1) * pageSize, page * pageSize),
    [filteredTransfers, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [accountFilter, search, pageSize]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredTransfers.length / pageSize));
    if (page > lastPage) {
      setPage(lastPage);
    }
  }, [filteredTransfers.length, page, pageSize]);

  const totalTransferred = useMemo(
    () => sumMoney(filteredTransfers.map((transfer) => transfer.amount)),
    [filteredTransfers],
  );
  const thisMonthTotal = useMemo(() => {
    const prefix = new Date().toISOString().slice(0, 7);
    return sumMoney(
      transfers
        .filter((transfer) => transfer.transferDate.startsWith(prefix))
        .map((transfer) => transfer.amount),
    );
  }, [transfers]);

  const availableFromBalance = form.fromAccountId ? accountBalances.get(form.fromAccountId) ?? 0 : null;
  const fromAccountKind = accounts.find((account) => account.id === form.fromAccountId)?.kind ?? null;

  function clearEditorQuery() {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (!nextParams.has("create") && !nextParams.has("open") && !nextParams.has("edit")) {
      return;
    }

    nextParams.delete("create");
    nextParams.delete("open");
    nextParams.delete("edit");
    const nextQuery = nextParams.toString();
    const target = buildWorkspaceRoute(mode, "/utilities/bank-transfers");
    router.replace(nextQuery ? `${target}?${nextQuery}` : target, { scroll: false });
  }

  const openCreateForm = useCallback(() => {
    setEditingId(null);
    setForm(buildDefaultFormState());
    setHeaderMenuOpen(false);
    setEditorOpen(true);
  }, []);

  useEffect(() => {
    const createValue = searchParams.get("create");
    if (createValue !== "1" && createValue !== "true") {
      return;
    }

    const requestKey = `bank-transfers:${searchParams.get("open") ?? "initial"}`;
    if (createRequestRef.current === requestKey) {
      return;
    }

    openCreateForm();
    createRequestRef.current = requestKey;
  }, [searchParams, openCreateForm]);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || editRequestRef.current === editId) {
      return;
    }

    const transfer = transfers.find((item) => item.id === editId);
    if (!transfer) {
      return;
    }

    handleEditTransfer(transfer);
    editRequestRef.current = editId;
  }, [searchParams, transfers]);

  function updateFormField<Key extends keyof TransferFormState>(field: Key, value: TransferFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setForm(buildDefaultFormState());
    clearEditorQuery();
  }

  async function handleSaveTransfer() {
    const fromAccount = accounts.find((account) => account.id === form.fromAccountId);
    const toAccount = accounts.find((account) => account.id === form.toAccountId);

    if (!fromAccount) {
      toast.error("Select the account money is transferred from");
      return;
    }

    if (!toAccount) {
      toast.error("Select the account money is transferred to");
      return;
    }

    if (fromAccount.id === toAccount.id) {
      toast.error("From and To accounts must be different");
      return;
    }

    const amount = normalizeAmount(form.amount);
    if (moneyToMinorUnits(amount) <= 0) {
      toast.error("Enter a transfer amount greater than zero");
      return;
    }

    if (!form.transferDate) {
      toast.error("Select a transfer date");
      return;
    }

    if (fromAccount.kind === "bank") {
      const editingAmount = editingId ? transfers.find((transfer) => transfer.id === editingId) : undefined;
      const alreadyDeducted = editingAmount && editingAmount.fromAccountId === fromAccount.id ? editingAmount.amount : 0;
      const available = sumMoney([accountBalances.get(fromAccount.id) ?? 0, alreadyDeducted]);
      if (moneyToMinorUnits(amount) > moneyToMinorUnits(available)) {
        toast.error(`Not enough balance in ${fromAccount.name}. Available: ${formatCurrency(available)}`);
        return;
      }
    }

    if (mode === "api" && session) {
      try {
        const voucherInput: VoucherFormInput = {
          workspaceId: session.workspaceId,
          voucherType: "contra",
          voucherDate: form.transferDate,
          partyName: `${fromAccount.name} to ${toAccount.name}`,
          reference: form.reference.trim() || undefined,
          narration: form.notes.trim() || `Transfer from ${fromAccount.name} to ${toAccount.name}`,
          status: "posted",
          totalAmount: amount,
          lines: [
            { id: `transfer-to-${toAccount.id}`, accountId: toAccount.id, moneyAccountType: toAccount.kind === "cash" ? "CASH" : toAccount.kind === "mfs" ? "MFS" : "BANK", ledger: toAccount.name, description: "Transfer received", debit: amount, credit: 0 },
            { id: `transfer-from-${fromAccount.id}`, accountId: fromAccount.id, moneyAccountType: fromAccount.kind === "cash" ? "CASH" : fromAccount.kind === "mfs" ? "MFS" : "BANK", ledger: fromAccount.name, description: "Transfer sent", debit: 0, credit: amount },
          ],
        };
        let replacedReversedTransfer = false;
        let saved: VoucherRecord;
        if (editingId) {
          try {
            saved = await updateVoucher(mode, editingId, voucherInput);
          } catch (updateError) {
            const message = updateError instanceof Error ? updateError.message.toLowerCase() : "";
            if (!message.includes("reversed voucher cannot be edited")) {
              throw updateError;
            }

            // The original voucher already has an immutable reversal in the ledger.
            // Create the user's correction as a fresh posted voucher and keep that
            // reversal audit trail intact instead of trying to overwrite history.
            saved = await createVoucher(mode, voucherInput);
            replacedReversedTransfer = true;
          }
        } else {
          saved = await createVoucher(mode, voucherInput);
        }
        const savedTransfer = { id: saved.id, fromAccountId: fromAccount.id, fromAccountName: fromAccount.name, toAccountId: toAccount.id, toAccountName: toAccount.name, amount, transferDate: form.transferDate, reference: form.reference.trim(), notes: form.notes.trim(), createdAt: saved.createdAt };
        setTransfers((current) => editingId
          ? current.map((item) => (item.id === editingId ? savedTransfer : item))
          : [savedTransfer, ...current]);
        toast.success(replacedReversedTransfer
          ? "Corrected transfer posted; the original reversal was preserved"
          : editingId
            ? "Transfer updated and ledgers reposted"
            : "Transfer posted to both Chart of Accounts ledgers");
        closeEditor();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Transfer could not be posted");
      }
      return;
    }

    const payload: BankTransferRecord = {
      id: editingId ?? crypto.randomUUID(),
      fromAccountId: fromAccount.id,
      fromAccountName: fromAccount.name,
      toAccountId: toAccount.id,
      toAccountName: toAccount.name,
      amount,
      transferDate: form.transferDate,
      reference: form.reference.trim(),
      notes: form.notes.trim(),
      createdAt: editingId ? transfers.find((item) => item.id === editingId)?.createdAt ?? new Date().toISOString() : new Date().toISOString(),
    };

    setTransfers((current) => (editingId ? current.map((item) => (item.id === editingId ? payload : item)) : [payload, ...current]));
    toast.success(editingId ? "Transfer updated" : "Transfer recorded");
    closeEditor();
  }

  function handleEditTransfer(transfer: BankTransferRecord) {
    setEditingId(transfer.id);
    setForm({
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amount: String(roundMoney(transfer.amount) || ""),
      transferDate: transfer.transferDate,
      reference: transfer.reference,
      notes: transfer.notes,
    });
    setEditorOpen(true);
  }

  function confirmDeleteTransfer() {
    if (!deleteTarget) {
      return;
    }

    setTransfers((current) => current.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success("Transfer deleted");
  }

  function openPrintWindow(title: string, body: string) {
    const printWindow = openPrintableWindow("width=900,height=650");
    if (!printWindow) {
      toast.error("Allow pop-ups to print");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #24365a; padding: 28px; }
            h1 { font-size: 20px; margin: 0 0 4px; }
            .meta { color: #697791; font-size: 13px; margin-bottom: 18px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th { text-align: left; background: #f7f9fd; color: #61708a; border-bottom: 1px solid #d7dfeb; padding: 9px 10px; }
            td { border-bottom: 1px solid #edf1f7; padding: 9px 10px; vertical-align: top; }
            td.right, th.right { text-align: right; }
            tfoot td { font-weight: 700; border-top: 2px solid #d7dfeb; }
            .detail { display: grid; grid-template-columns: 190px 1fr; border: 1px solid #d7dfeb; border-radius: 6px; overflow: hidden; font-size: 13px; }
            .detail .label { background: #f7f9fd; color: #61708a; font-weight: 600; padding: 9px 12px; border-bottom: 1px solid #edf1f7; }
            .detail .value { padding: 9px 12px; border-bottom: 1px solid #edf1f7; }
            .detail .label:last-of-type, .detail .value:last-of-type { border-bottom: 0; }
          </style>
        </head>
        <body>${body}</body>
      </html>
    `);
    printWindowWhenReady(printWindow);
  }

  function printTransferReceipt(transfer: BankTransferRecord) {
    const fields: Array<[string, string]> = [
      ["Transfer Date", formatTransferDate(transfer.transferDate)],
      ["From Account", transfer.fromAccountName],
      ["To Account", transfer.toAccountName],
      ["Amount", formatCurrency(transfer.amount)],
      ["Reference", transfer.reference || "-"],
      ["Notes", transfer.notes || "-"],
    ];

    openPrintWindow(
      `Transfer ${formatTransferDate(transfer.transferDate)}`,
      `
        <h1>Bank Transfer Receipt</h1>
        <div class="meta">${escapeHtml(transfer.fromAccountName)} &rarr; ${escapeHtml(transfer.toAccountName)}</div>
        <div class="detail">
          ${fields.map(([label, value]) => `<div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div>`).join("")}
        </div>
      `,
    );
  }

  function printTransferList() {
    setHeaderMenuOpen(false);
    if (!filteredTransfers.length) {
      toast.error("There is no transfer to print");
      return;
    }

    const rows = filteredTransfers
      .map(
        (transfer) => `
          <tr>
            <td>${escapeHtml(formatTransferDate(transfer.transferDate))}</td>
            <td>${escapeHtml(transfer.fromAccountName)}</td>
            <td>${escapeHtml(transfer.toAccountName)}</td>
            <td>${escapeHtml(transfer.reference || "-")}</td>
            <td class="right">${escapeHtml(formatCurrency(transfer.amount))}</td>
          </tr>`,
      )
      .join("");

    openPrintWindow(
      "Bank Transfers",
      `
        <h1>Bank Transfers</h1>
        <div class="meta">${filteredTransfers.length} transfer${filteredTransfers.length === 1 ? "" : "s"} &middot; Total ${escapeHtml(formatCurrency(totalTransferred))}</div>
        <table>
          <thead>
            <tr><th>Date</th><th>From</th><th>To</th><th>Reference</th><th class="right">Amount</th></tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="4">Total</td><td class="right">${escapeHtml(formatCurrency(totalTransferred))}</td></tr></tfoot>
        </table>
      `,
    );
  }

  function exportTransfers() {
    setHeaderMenuOpen(false);
    if (!filteredTransfers.length) {
      toast.error("There is no transfer to export");
      return;
    }

    downloadCsv(
      "bank-transfers.csv",
      filteredTransfers.map((transfer) => ({
        Date: formatTransferDate(transfer.transferDate),
        "From Account": transfer.fromAccountName,
        "To Account": transfer.toAccountName,
        Amount: roundMoney(transfer.amount),
        Reference: transfer.reference || "",
        Notes: transfer.notes || "",
      })),
    );
    toast.success("Transfers exported");
  }

  function focusSearch() {
    setHeaderMenuOpen(false);
    window.setTimeout(() => {
      (document.getElementById("bank-transfer-search") as HTMLInputElement | null)?.focus();
    }, 0);
  }

  function renderHeaderMenu() {
    return (
      <div className="relative" data-transfer-header-menu>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e1e8f2] text-[#697791] transition hover:bg-[#f4f7fb]"
          onClick={() => setHeaderMenuOpen((current) => !current)}
          aria-label="Transfer actions"
          aria-expanded={headerMenuOpen}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {headerMenuOpen ? (
          <div className="absolute right-0 top-11 z-30 min-w-[210px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_16px_36px_rgba(15,23,42,0.14)]">
            <MenuActionButton icon={Plus} label="New Transfer" onClick={openCreateForm} />
            {transfers.length ? <MenuActionButton icon={Search} label="Focus Search" onClick={focusSearch} /> : null}
            <MenuActionButton icon={FileDown} label="Export to Excel" onClick={exportTransfers} />
            <MenuActionButton icon={Printer} label="Print Transfer List" onClick={printTransferList} />
          </div>
        ) : null}
      </div>
    );
  }

  const editorDialog = (
    <Dialog open={editorOpen} onOpenChange={(open) => (open ? null : closeEditor())}>
      <DialogContent className="w-[min(94vw,620px)]">
        <DialogTitle className="text-lg font-semibold text-[#24365a]">{editingId ? "Edit Transfer" : "New Transfer"}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-[#697791]">Move money between your bank accounts and cash drawers.</DialogDescription>

        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSaveTransfer();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">
                From <span className="text-[#ef4444]">*</span>
              </span>
              <select
                value={form.fromAccountId}
                onChange={(event) => updateFormField("fromAccountId", event.target.value)}
                className="h-11 rounded-[10px] border border-[#c9d5e8] bg-white px-3 text-sm text-[#1f3253] outline-none"
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                    {account.kind === "cash" ? " (Cash)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="hidden pb-3 text-[#9aa7bb] sm:block">
              <ArrowRight className="h-5 w-5" />
            </div>

            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">
                To <span className="text-[#ef4444]">*</span>
              </span>
              <select
                value={form.toAccountId}
                onChange={(event) => updateFormField("toAccountId", event.target.value)}
                className="h-11 rounded-[10px] border border-[#c9d5e8] bg-white px-3 text-sm text-[#1f3253] outline-none"
              >
                <option value="">Select account</option>
                {accounts
                  .filter((account) => account.id !== form.fromAccountId)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.kind === "cash" ? " (Cash)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {availableFromBalance !== null && fromAccountKind === "bank" ? (
            <div className="rounded-[10px] bg-[#f4f8ff] px-3 py-2 text-xs">
              <span className="text-[#61708a]">Available in this account: </span>
              <strong className="font-semibold text-[#24365a]">{formatCurrency(availableFromBalance)}</strong>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">
                Amount <span className="text-[#ef4444]">*</span>
              </span>
              <Input
                money
                value={form.amount}
                onChange={(event) => updateFormField("amount", event.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Transfer Date</span>
              <AppDateInput
                aria-label="Transfer Date"
                value={form.transferDate}
                onChange={(value) => updateFormField("transferDate", value)}
                inputClassName="h-11 rounded-[10px] border-[#c9d5e8] pr-10"
              />
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm text-[#697791]">Reference</span>
            <Input
              value={form.reference}
              onChange={(event) => updateFormField("reference", event.target.value)}
              placeholder="Cheque no, slip no, or purpose"
              className="h-11 rounded-[10px] border-[#c9d5e8]"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm text-[#697791]">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => updateFormField("notes", event.target.value)}
              placeholder="Add transfer notes"
              className="min-h-[84px] rounded-[10px] border border-[#c9d5e8] bg-white px-3 py-2.5 text-sm text-[#1f3253] outline-none"
            />
          </label>

          <div className="flex items-center justify-end gap-3 pt-1">
            <Button type="button" variant="outline" className="rounded-full border-[#eef1f6] px-6 text-[#66748f]" onClick={closeEditor}>
              Cancel
            </Button>
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]">
              <CheckCircle2 className="h-5 w-5" />
              {editingId ? "Update Transfer" : "Save Transfer"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  const deleteDialog = (
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (open ? null : setDeleteTarget(null))}>
      <DialogContent className="w-[min(92vw,460px)]" submitOnEnter>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fee2e2] text-[#dc2626]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-lg font-semibold text-[#24365a]">Delete this transfer?</DialogTitle>
            <DialogDescription className="mt-1.5 text-sm leading-6 text-[#697791]">
              The transfer entry will be removed and both account balances will be recalculated. This action cannot be undone.
            </DialogDescription>
          </div>
        </div>

        {deleteTarget ? (
          <div className="mt-4 rounded-[14px] border border-[#e5eaf2] bg-[#fbfcff] px-4 py-3">
            <div className="text-sm font-semibold text-[#24365a]">
              {deleteTarget.fromAccountName} → {deleteTarget.toAccountName}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#61708a]">
              <span>{formatTransferDate(deleteTarget.transferDate)}</span>
              <span>
                Amount: <strong className="font-semibold text-[#24365a]">{formatCurrency(deleteTarget.amount)}</strong>
              </span>
              {deleteTarget.reference ? <span>Ref: {deleteTarget.reference}</span> : null}
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-full border-[#eef1f6] px-6 text-[#66748f]" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <button
            type="button"
            data-enter-submit
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#dc2626] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#b91c1c]"
            onClick={confirmDeleteTransfer}
          >
            <Trash2 className="h-4 w-4" />
            Yes, delete
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!transfers.length) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d7dfeb] bg-white">
          <div className="flex items-center justify-between border-b border-[#d7dfeb] px-4 py-2">
            <div className="text-[17px] font-semibold text-[#1f3253]">Bank Transfers</div>
            {renderHeaderMenu()}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto flex w-full max-w-[560px] flex-col items-center text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#eef4ff] text-[#1674ff]">
                <ArrowRightLeft className="h-10 w-10" />
              </div>
              <h2 className="mt-5 text-[20px] font-semibold text-[#24365a]">No transfers recorded yet</h2>
              <p className="mt-2 text-[15px] leading-7 text-[#697791]">
                Record money moved between your bank accounts and cash drawers. Every transfer updates both account balances instantly.
              </p>

              {bankAccounts.length ? (
                <button
                  type="button"
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-[15px] font-semibold text-white shadow-[0_14px_30px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]"
                  onClick={openCreateForm}
                >
                  <Plus className="h-4 w-4" />
                  New Transfer
                </button>
              ) : (
                <div className="mt-6 w-full rounded-[14px] border border-[#ffe0bd] bg-[#fff8f0] px-4 py-4 text-sm text-[#8a5a1d]">
                  Add at least one bank account first, then you can transfer money between accounts.
                  <div className="mt-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#cf670f]"
                      onClick={() => router.push(buildWorkspaceRoute(mode, "/utilities/bank-accounts?create=1"))}
                    >
                      <Building2 className="h-4 w-4" />
                      Add Bank Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {editorDialog}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d7dfeb] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d7dfeb] px-4 py-2">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold text-[#1f3253]">Bank Transfers</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CollapsibleSearch
              value={search}
              onChange={setSearch}
              label="Search transfers"
              placeholder="Search account, reference, date..."
              expandedWidth="w-[250px]"
              size="sm"
            />
            <button type="button" className="inline-flex h-8 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(230,120,23,0.22)] hover:bg-[#cf670f]" onClick={openCreateForm}>
              <Plus className="h-4 w-4" />
              New Transfer
            </button>
            {renderHeaderMenu()}
          </div>
        </div>

        <div className="grid gap-2 border-b border-[#e7edf5] px-3 py-2 lg:grid-cols-3 2xl:gap-3 2xl:px-4 2xl:py-3">
          <SummaryCard label="Transfers" value={String(filteredTransfers.length)} note={accountFilter ? "Matching current filter" : "Recorded movements"} icon={ArrowRightLeft} tone="blue" />
          <SummaryCard label="Transferred Amount" value={formatCurrency(totalTransferred)} note="Sum of listed transfers" icon={Banknote} tone="orange" />
          <SummaryCard label="This Month" value={formatCurrency(thisMonthTotal)} note="Transfers in current month" icon={CalendarDays} tone="emerald" />
        </div>

        <div
          data-bank-transfers-layout="true"
          className="grid min-h-0 flex-1 lg:grid-cols-[minmax(205px,220px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]"
        >
          <div className="flex min-h-0 flex-col border-b border-[#e7edf5] lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7d8aa2]">
              <span>Account Balances</span>
              <span>{accounts.length}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-[12px] border px-3 py-2.5 text-left text-sm font-semibold transition",
                  accountFilter === null ? "border-[#c6dcff] bg-[#eef5ff] text-[#1674ff]" : "border-transparent text-[#24365a] hover:border-[#e2e9f3] hover:bg-[#f8fafd]",
                )}
                onClick={() => setAccountFilter(null)}
              >
                <span>All accounts</span>
                <span className="text-xs font-semibold text-[#7d8aa2]">{transfers.length}</span>
              </button>

              {accounts.map((account) => {
                const active = accountFilter === account.id;
                const balance = accountBalances.get(account.id) ?? 0;
                const movements = transfers.filter((transfer) => transfer.fromAccountId === account.id || transfer.toAccountId === account.id).length;
                return (
                  <button
                    key={account.id}
                    type="button"
                    className={cn(
                      "flex w-full items-start justify-between gap-3 rounded-[12px] border px-3 py-2.5 text-left transition",
                      active ? "border-[#c6dcff] bg-[#eef5ff]" : "border-transparent hover:border-[#e2e9f3] hover:bg-[#f8fafd]",
                    )}
                    onClick={() => setAccountFilter(active ? null : account.id)}
                  >
                    <div className="min-w-0">
                      <div className={cn("flex items-center gap-1.5 truncate text-sm font-semibold", active ? "text-[#1674ff]" : "text-[#24365a]")}>
                        {account.kind === "cash" ? <Wallet className="h-3.5 w-3.5 shrink-0" /> : <Landmark className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate">{account.name}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[#7d8aa2]">{account.subtitle}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={cn("text-sm font-semibold tabular-nums", balance < 0 ? "text-[#d34848]" : "text-[#24365a]")}>{formatCurrency(balance)}</div>
                      <div className="mt-0.5 text-[11px] text-[#9aa7bb]">
                        {movements} transfer{movements === 1 ? "" : "s"}
                      </div>
                    </div>
                  </button>
                );
              })}

              {accounts.length === cashAccounts.length ? (
                <div className="mt-2 rounded-[12px] border border-[#ffe0bd] bg-[#fff8f0] px-3 py-2.5 text-xs leading-5 text-[#8a5a1d]">
                  No bank account added yet. Cash drawer balances only reflect transfers recorded here.
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7d8aa2]">
              <span>{accountFilter ? `Transfers · ${accounts.find((account) => account.id === accountFilter)?.name ?? ""}` : "All transfers"}</span>
              <span>{filteredTransfers.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
              {filteredTransfers.length ? (
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-white text-left text-[#61708a]">
                    <tr>
                      <th className="whitespace-nowrap border-b border-[#d7dfeb] py-2.5 pr-3 font-semibold">Date</th>
                      <th className="whitespace-nowrap border-b border-[#d7dfeb] px-3 py-2.5 font-semibold">From</th>
                      <th className="whitespace-nowrap border-b border-[#d7dfeb] px-3 py-2.5 font-semibold">To</th>
                      <th className="whitespace-nowrap border-b border-[#d7dfeb] px-3 py-2.5 font-semibold">Reference</th>
                      <th className="whitespace-nowrap border-b border-[#d7dfeb] px-3 py-2.5 text-right font-semibold">Amount</th>
                      <th className="whitespace-nowrap border-b border-[#d7dfeb] py-2.5 pl-3 text-right font-semibold"><MoreVertical className="ml-auto h-4 w-4" aria-label="More actions" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransfers.map((transfer) => (
                      <tr key={transfer.id} className="border-b border-[#edf1f7] last:border-b-0">
                        <td className="whitespace-nowrap py-2.5 pr-3 text-[#364760]">{formatTransferDate(transfer.transferDate)}</td>
                        <td className="px-3 py-2.5 font-medium text-[#24365a]">{transfer.fromAccountName}</td>
                        <td className="px-3 py-2.5 font-medium text-[#24365a]">{transfer.toAccountName}</td>
                        <td className="px-3 py-2.5 text-[#61708a]">{transfer.reference || "-"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-[#24365a]">{formatCurrency(transfer.amount)}</td>
                        <td className="py-2.5 pl-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7dfeb] text-[#61708a] transition hover:bg-[#f4f7fb]"
                              onClick={() => printTransferReceipt(transfer)}
                              aria-label="Print transfer"
                              title="Print this transfer"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7dfeb] text-[#61708a] transition hover:bg-[#f4f7fb]"
                              onClick={() => handleEditTransfer(transfer)}
                              aria-label="Edit transfer"
                              title="Edit this transfer"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7dfeb] text-[#d34848] transition hover:bg-[#fff3f3]"
                              onClick={() => setDeleteTarget(transfer)}
                              aria-label="Delete transfer"
                              title="Delete this transfer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex h-full items-center justify-center py-10 text-center text-sm text-[#8994a6]">
                  {search ? `No transfer matches "${search}".` : "No transfer for this account yet."}
                </div>
              )}
            </div>
            <TablePagination
              page={page}
              pageSize={pageSize}
              totalItems={filteredTransfers.length}
              pageSizeOptions={[10, 25, 50]}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              dense
              iconOnlyNavigation
            />
          </div>
        </div>
      </div>

      {editorDialog}
      {deleteDialog}
    </div>
  );
}

function MenuActionButton({ icon: Icon, label, onClick }: { icon: typeof Printer; label: string; onClick: () => void }) {
  return (
    <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#24365a] transition hover:bg-[#f7f9fd]" onClick={onClick}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Building2;
  tone: "blue" | "orange" | "emerald";
}) {
  const toneClasses =
    tone === "blue"
      ? "bg-[#e7f2ff] text-[#1674ff]"
      : tone === "orange"
        ? "bg-[#fff1e2] text-[#e67817]"
        : "bg-[#e8fff4] text-[#0f9f63]";

  return (
    <div className="rounded-[12px] border border-[#d7dfeb] bg-white px-3 py-2 2xl:rounded-[14px] 2xl:px-4 2xl:py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7d8aa2] 2xl:text-[11px] 2xl:tracking-[0.18em]">{label}</div>
          <div className="mt-0.5 truncate text-[18px] font-semibold leading-tight text-[#24365a] 2xl:mt-1 2xl:text-[22px]">{value}</div>
          <div className="truncate text-[10px] text-[#697791] 2xl:mt-0.5 2xl:text-xs">{note}</div>
        </div>
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full 2xl:h-10 2xl:w-10", toneClasses)}>
          <Icon className="h-4 w-4 2xl:h-5 2xl:w-5" />
        </div>
      </div>
    </div>
  );
}
