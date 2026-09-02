"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileDown,
  Info,
  Landmark,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { BankIllustration } from "@/components/shared/bank-illustration";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { useSessionContext } from "@/hooks/use-session-context";
import { useDayBookQuery } from "@/hooks/use-app-query";
import { useAccountTreeQuery, useCreateAccountMutation, useMoneyAccountsQuery, useSetAccountStatusMutation, useUpdateAccountMutation } from "@/hooks/use-accounts-query";
import { downloadCsv } from "@/lib/download";
import { formatCurrency, formatDate } from "@/lib/format";
import { roundMoney, sumMoney } from "@/lib/money";
import { openPrintWindow as openPrintableWindow, printWindowWhenReady } from "@/lib/print";
import { cn } from "@/lib/utils";
import { AppDateInput } from "@/components/shared/app-date-input";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";

type BankAccountRecord = {
  id: string;
  displayName: string;
  openingBalance: number;
  asOfDate: string;
  printOnInvoices: boolean;
  bankName: string;
  accountNumber: string;
  branchName: string;
  accountHolderName: string;
  routingNumber: string;
  swiftCode: string;
  notes: string;
  createdAt: string;
};

type BankAccountFormState = {
  displayName: string;
  openingBalance: string;
  asOfDate: string;
  printOnInvoices: boolean;
  bankName: string;
  accountNumber: string;
  branchName: string;
  accountHolderName: string;
  routingNumber: string;
  swiftCode: string;
  notes: string;
};

const featureCards = [
  {
    title: "Print Bank Details on Invoices",
    description: "Share your bank account information on invoices so customers can pay you easily.",
    icon: Printer,
  },
  {
    title: "Unlimited Payment Types",
    description: "Record payments received through banks, transfers, cards, or any method you prefer.",
    icon: Landmark,
  },
  {
    title: "Maintain Accurate Records",
    description: "Keep your financial entries organised for better clarity and reporting.",
    icon: CreditCard,
  },
] as const;

function buildDefaultFormState(): BankAccountFormState {
  return {
    displayName: "",
    openingBalance: "",
    asOfDate: new Date().toISOString().slice(0, 10),
    printOnInvoices: false,
    bankName: "",
    accountNumber: "",
    branchName: "",
    accountHolderName: "",
    routingNumber: "",
    swiftCode: "",
    notes: "",
  };
}

function normalizeAmount(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim() || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAsOfDate(value: string) {
  return value ? formatDate(value) : "-";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function BankAccountsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, session } = useSessionContext();
  const createRequestRef = useRef("");
  const storageKey = `bizovix:bank-accounts:${mode}:${session?.workspaceId ?? "default"}`;
  const [accounts, setAccounts] = useState<BankAccountRecord[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [form, setForm] = useState<BankAccountFormState>(() => buildDefaultFormState());
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionHydratedKey, setSelectionHydratedKey] = useState("");
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BankAccountRecord | null>(null);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [accountContextMenu, setAccountContextMenu] = useState<{ account: BankAccountRecord; left: number; top: number } | null>(null);
  const moneyAccountsQuery = useMoneyAccountsQuery(mode === "api", "BANK");
  const accountTreeQuery = useAccountTreeQuery(mode === "api");
  const createAccountMutation = useCreateAccountMutation();
  const updateAccountMutation = useUpdateAccountMutation();
  const setAccountStatusMutation = useSetAccountStatusMutation();
  const ledgerVouchersQuery = useDayBookQuery(mode, { workspaceId: session?.workspaceId, status: "posted" });

  useEffect(() => {
    const key = `${storageKey}:selected`;
    setSelectedId(window.localStorage.getItem(key));
    setSelectionHydratedKey(key);
  }, [storageKey]);

  useEffect(() => {
    const key = `${storageKey}:selected`;
    if (selectionHydratedKey !== key) return;
    if (selectedId) window.localStorage.setItem(key, selectedId);
    else window.localStorage.removeItem(key);
  }, [selectedId, selectionHydratedKey, storageKey]);

  useEffect(() => {
    if (mode !== "api") return;
    setAccounts((moneyAccountsQuery.data ?? []).map((account) => ({
      id: account.id,
      displayName: account.name,
      openingBalance: account.currentBalance,
      asOfDate: account.openingBalanceDate ?? "",
      printOnInvoices: Boolean(account.printOnInvoices),
      bankName: account.bankDetails?.bankName ?? "",
      accountNumber: account.bankDetails?.accountNumber ?? "",
      branchName: account.bankDetails?.branchName ?? "",
      accountHolderName: account.bankDetails?.accountHolderName ?? "",
      routingNumber: account.bankDetails?.routingNumber ?? "",
      swiftCode: account.bankDetails?.swiftCode ?? "",
      notes: account.bankDetails?.note ?? "",
      createdAt: account.createdAt,
    })));
  }, [mode, moneyAccountsQuery.data]);

  useEffect(() => {
    if (mode === "api" || typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setAccounts([]);
      setHydratedKey(storageKey);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as BankAccountRecord[];
      setAccounts(Array.isArray(parsed) ? parsed : []);
    } catch {
      window.localStorage.removeItem(storageKey);
      setAccounts([]);
    }

    setHydratedKey(storageKey);
  }, [mode, storageKey]);

  useEffect(() => {
    // Never write before the stored accounts have been read back for this key,
    // otherwise the initial empty state overwrites whatever the user already saved.
    if (mode === "api" || typeof window === "undefined" || hydratedKey !== storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(accounts));
  }, [accounts, hydratedKey, mode, storageKey]);

  useEffect(() => {
    const createValue = searchParams.get("create");
    if (createValue !== "1" && createValue !== "true") {
      return;
    }

    const requestKey = `bank-accounts:${searchParams.get("open") ?? "initial"}`;
    if (createRequestRef.current === requestKey) {
      return;
    }

    openCreateForm();
    createRequestRef.current = requestKey;
  }, [searchParams]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-bank-header-menu]")) {
        return;
      }

      setHeaderMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const totalBalance = useMemo(() => sumMoney(accounts.map((account) => account.openingBalance)), [accounts]);
  const printableCount = useMemo(() => accounts.filter((account) => account.printOnInvoices).length, [accounts]);

  const filteredAccounts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return accounts;
    }

    return accounts.filter((account) =>
      [account.displayName, account.bankName, account.accountNumber, account.branchName, account.accountHolderName, account.routingNumber, account.swiftCode]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(needle)),
    );
  }, [accounts, search]);

  const selectedAccount = useMemo(() => {
    if (!filteredAccounts.length) {
      return null;
    }

    return filteredAccounts.find((account) => account.id === selectedId) ?? filteredAccounts[0];
  }, [filteredAccounts, selectedId]);

  const selectedLedgerTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    let runningBalance = 0;
    return [...(ledgerVouchersQuery.data ?? [])]
      .sort((left, right) => left.voucherDate.localeCompare(right.voucherDate) || left.createdAt.localeCompare(right.createdAt))
      .flatMap((voucher) => voucher.lines
        .filter((line) => line.accountId === selectedAccount.id)
        .map((line) => {
          const debit = roundMoney(line.debit);
          const credit = roundMoney(line.credit);
          runningBalance = sumMoney([runningBalance, debit, -credit]);
          return { id: `${voucher.id}-${line.id}`, voucherId: voucher.id, voucherType: voucher.voucherType, documentKind: voucher.documentKind, date: voucher.voucherDate, voucherNumber: voucher.voucherNumber, particulars: line.description || voucher.narration || voucher.partyName, debit, credit, balance: runningBalance };
        }));
  }, [ledgerVouchersQuery.data, selectedAccount]);

  function clearCreateQuery() {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (!nextParams.has("create") && !nextParams.has("open")) {
      return;
    }

    nextParams.delete("create");
    nextParams.delete("open");
    const nextQuery = nextParams.toString();
    const target = buildWorkspaceRoute(mode, "/utilities/bank-accounts");
    router.replace(nextQuery ? `${target}?${nextQuery}` : target, { scroll: false });
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(buildDefaultFormState());
    setShowMoreFields(false);
    setHeaderMenuOpen(false);
    setEditorOpen(true);
  }

  function updateFormField<Key extends keyof BankAccountFormState>(field: Key, value: BankAccountFormState[Key]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setForm(buildDefaultFormState());
    setShowMoreFields(false);
    clearCreateQuery();
  }

  async function handleSaveAccount() {
    const displayName = form.displayName.trim();
    if (!displayName) {
      toast.error("Account display name is required");
      return;
    }

    const duplicateName = accounts.find(
      (account) => account.id !== editingId && account.displayName.trim().toLowerCase() === displayName.toLowerCase(),
    );
    if (duplicateName) {
      toast.error("This account display name already exists");
      return;
    }

    const accountNumber = form.accountNumber.trim();
    if (accountNumber) {
      const duplicateNumber = accounts.find(
        (account) => account.id !== editingId && account.accountNumber.trim().toLowerCase() === accountNumber.toLowerCase(),
      );
      if (duplicateNumber) {
        toast.error(`This account number is already used by ${duplicateNumber.displayName}`);
        return;
      }
    }

    if (mode === "api") {
      const bankName = form.bankName.trim() || displayName;
      const routingNumber = form.routingNumber.trim();
      const bankDetails = { bankName, accountNumber, branchName: form.branchName.trim(), accountHolderName: form.accountHolderName.trim(), routingNumber, swiftCode: form.swiftCode.trim(), country: "Bangladesh", rmName: "", rmNumber: "", note: form.notes.trim(), accountKind: "BANK" as const };
      try {
        if (editingId) {
          await updateAccountMutation.mutateAsync({ id: editingId, input: { name: displayName, bankDetails, printOnInvoices: form.printOnInvoices } });
        } else {
          const findNode = (nodes: typeof accountTreeQuery.data, name: string): string | null => {
            for (const node of nodes ?? []) {
              if (node.name.trim().toLowerCase() === name) return node.id;
              const nested = findNode(node.children, name);
              if (nested) return nested;
            }
            return null;
          };
          const parentId = findNode(accountTreeQuery.data, "bank accounts");
          if (!parentId) throw new Error("Bank Accounts category was not found in Chart of Accounts");
          await createAccountMutation.mutateAsync({ level: "LEDGER", parentId, name: displayName, nature: "ASSET", requiresItemDetails: false, bankDetails });
        }
        setSearch("");
        toast.success(editingId ? "Bank ledger updated" : "Bank ledger created in Chart of Accounts");
        closeEditor();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Bank account could not be saved");
      }
      return;
    }

    const payload: BankAccountRecord = {
      id: editingId ?? crypto.randomUUID(),
      displayName,
      openingBalance: normalizeAmount(form.openingBalance),
      asOfDate: form.asOfDate,
      printOnInvoices: form.printOnInvoices,
      bankName: form.bankName.trim(),
      accountNumber,
      branchName: form.branchName.trim(),
      accountHolderName: form.accountHolderName.trim(),
      routingNumber: form.routingNumber.trim(),
      swiftCode: form.swiftCode.trim(),
      notes: form.notes.trim(),
      createdAt: editingId ? accounts.find((item) => item.id === editingId)?.createdAt ?? new Date().toISOString() : new Date().toISOString(),
    };

    setAccounts((current) => {
      if (editingId) {
        return current.map((account) => (account.id === editingId ? payload : account));
      }

      return [payload, ...current];
    });

    setSelectedId(payload.id);
    setSearch("");
    toast.success(editingId ? "Bank account updated" : "Bank account saved");
    closeEditor();
  }

  function handleEditAccount(account: BankAccountRecord) {
    setEditingId(account.id);
    setForm({
      displayName: account.displayName,
      openingBalance: String(account.openingBalance || ""),
      asOfDate: account.asOfDate,
      printOnInvoices: account.printOnInvoices,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      branchName: account.branchName,
      accountHolderName: account.accountHolderName,
      routingNumber: account.routingNumber,
      swiftCode: account.swiftCode,
      notes: account.notes,
    });
    setShowMoreFields(
      Boolean(
        account.bankName ||
          account.accountNumber ||
          account.branchName ||
          account.accountHolderName ||
          account.routingNumber ||
          account.swiftCode ||
          account.notes,
      ),
    );
    setEditorOpen(true);
  }

  async function confirmDeleteAccount() {
    if (!deleteTarget) {
      return;
    }

    if (mode === "api") {
      try {
        await setAccountStatusMutation.mutateAsync({ id: deleteTarget.id, status: "INACTIVE" });
        setDeleteTarget(null);
        toast.success("Bank ledger deactivated; transaction history remains intact");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Bank ledger could not be deactivated");
      }
      return;
    }
    setAccounts((current) => current.filter((item) => item.id !== deleteTarget.id));
    setSelectedId((current) => (current === deleteTarget.id ? null : current));
    setDeleteTarget(null);
    toast.success("Bank account deleted");
  }

  async function togglePrintOnInvoices(account: BankAccountRecord) {
    if (mode === "api") {
      try {
        await updateAccountMutation.mutateAsync({ id: account.id, input: { printOnInvoices: !account.printOnInvoices } });
        toast.success(account.printOnInvoices ? `${account.displayName} hidden from invoices` : `${account.displayName} will print on invoices`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Invoice visibility could not be updated");
      }
      return;
    }
    setAccounts((current) =>
      current.map((item) => (item.id === account.id ? { ...item, printOnInvoices: !item.printOnInvoices } : item)),
    );
    toast.success(account.printOnInvoices ? `${account.displayName} hidden from invoices` : `${account.displayName} will print on invoices`);
  }

  function exportAccounts() {
    setHeaderMenuOpen(false);
    if (!accounts.length) {
      toast.error("Add a bank account before exporting");
      return;
    }

    downloadCsv(
      "bank-accounts.csv",
      accounts.map((account) => ({
        "Display Name": account.displayName,
        "Bank Name": account.bankName || "-",
        "Account Number": account.accountNumber || "-",
        "Account Holder": account.accountHolderName || "-",
        Branch: account.branchName || "-",
        "Routing Number": account.routingNumber || "-",
        "SWIFT Code": account.swiftCode || "-",
        "As of Date": formatAsOfDate(account.asOfDate),
        "Opening Balance": account.openingBalance,
        "Print on Invoices": account.printOnInvoices ? "Enabled" : "Disabled",
        Notes: account.notes || "",
      })),
    );
    toast.success("Bank accounts exported");
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
            .sub { color: #7d8aa2; font-size: 11px; margin-top: 2px; }
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

  function printAccountDetails(account: BankAccountRecord) {
    const fields: Array<[string, string]> = [
      ["Account Display Name", account.displayName],
      ["Bank Name", account.bankName || "-"],
      ["Branch", account.branchName || "-"],
      ["Account Holder", account.accountHolderName || "-"],
      ["Account Number", account.accountNumber || "-"],
      ["Routing Number", account.routingNumber || "-"],
      ["SWIFT Code", account.swiftCode || "-"],
      ["Opening Balance", formatCurrency(account.openingBalance)],
      ["As of Date", formatAsOfDate(account.asOfDate)],
      ["Print on Invoices", account.printOnInvoices ? "Enabled" : "Disabled"],
      ["Notes", account.notes || "-"],
    ];

    openPrintWindow(
      `${account.displayName} - Bank Account`,
      `
        <h1>${escapeHtml(account.displayName)}</h1>
        <div class="meta">${escapeHtml(account.bankName || "Bank details not added yet")}${account.branchName ? ` &middot; ${escapeHtml(account.branchName)}` : ""}</div>
        <div class="detail">
          ${fields.map(([label, value]) => `<div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div>`).join("")}
        </div>
      `,
    );
  }

  function printAccountList() {
    setHeaderMenuOpen(false);
    if (!accounts.length) {
      toast.error("Add a bank account before printing");
      return;
    }

    const rows = accounts
      .map(
        (account) => `
          <tr>
            <td><strong>${escapeHtml(account.displayName)}</strong><div class="sub">${escapeHtml(account.accountHolderName || "Primary business account")}</div></td>
            <td>${escapeHtml(account.bankName || "-")}</td>
            <td>${escapeHtml(account.branchName || "-")}</td>
            <td>${escapeHtml(account.accountNumber || "-")}</td>
            <td>${escapeHtml(formatAsOfDate(account.asOfDate))}</td>
            <td class="right">${escapeHtml(formatCurrency(account.openingBalance))}</td>
            <td>${account.printOnInvoices ? "Enabled" : "Disabled"}</td>
          </tr>`,
      )
      .join("");

    openPrintWindow(
      "Bank Accounts",
      `
        <h1>Bank Accounts</h1>
        <div class="meta">${accounts.length} account${accounts.length === 1 ? "" : "s"} &middot; Combined opening balance ${escapeHtml(formatCurrency(totalBalance))}</div>
        <table>
          <thead>
            <tr>
              <th>Display Name</th><th>Bank Name</th><th>Branch</th><th>Account Number</th><th>As of Date</th><th class="right">Opening Balance</th><th>Invoice Print</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr><td colspan="5">Total</td><td class="right">${escapeHtml(formatCurrency(totalBalance))}</td><td></td></tr>
          </tfoot>
        </table>
      `,
    );
  }

  function focusSearch() {
    setHeaderMenuOpen(false);
    window.setTimeout(() => {
      (document.getElementById("bank-account-search") as HTMLInputElement | null)?.focus();
    }, 0);
  }

  function renderHeaderMenu() {
    return (
      <div className="relative" data-bank-header-menu>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e1e8f2] text-[#697791] transition hover:bg-[#f4f7fb]"
          onClick={() => setHeaderMenuOpen((current) => !current)}
          aria-label="Bank account actions"
          aria-expanded={headerMenuOpen}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {headerMenuOpen ? (
          <div className="absolute right-0 top-11 z-30 min-w-[210px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_16px_36px_rgba(15,23,42,0.14)]">
            <MenuActionButton icon={Plus} label="Add Bank Account" onClick={openCreateForm} />
            {accounts.length ? <MenuActionButton icon={Search} label="Focus Search" onClick={focusSearch} /> : null}
            <MenuActionButton icon={FileDown} label="Export to Excel" onClick={exportAccounts} />
            <MenuActionButton icon={Printer} label="Print Bank List" onClick={printAccountList} />
          </div>
        ) : null}
      </div>
    );
  }

  if (editorOpen) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d7dfeb] bg-white"
          onSubmit={(event) => {
            event.preventDefault();
            handleSaveAccount();
          }}
        >
          <div className="flex items-center justify-between border-b border-[#d7dfeb] px-4 py-3">
            <div className="text-[18px] font-semibold text-[#1f3253]">{editingId ? "Edit Bank Account" : "Add Bank Account"}</div>
            <button
              type="button"
              onClick={closeEditor}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d7dfeb] bg-white text-[#24365a] transition hover:border-[#fca5a5] hover:bg-[#fee2e2] hover:text-[#dc2626]"
              aria-label="Close bank account form"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="grid gap-5 md:grid-cols-3">
              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">
                  Account Display Name <span className="text-[#ef4444]">*</span>
                </span>
                <Input value={form.displayName} onChange={(event) => updateFormField("displayName", event.target.value)} placeholder="Enter Account Display Name" className="h-11 rounded-[10px] border-[#c9d5e8]" />
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">Opening Balance</span>
                <Input money value={form.openingBalance} onChange={(event) => updateFormField("openingBalance", event.target.value)} placeholder="Enter Opening Balance" className="h-11 rounded-[10px] border-[#c9d5e8]" />
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">As of Date</span>
                <AppDateInput aria-label="As of Date" value={form.asOfDate} onChange={(value) => updateFormField("asOfDate", value)} inputClassName="h-11 rounded-[10px] border-[#c9d5e8] pr-10" />
              </label>
            </div>

            <button type="button" className="mt-5 inline-flex items-center gap-2 text-[15px] font-semibold text-[#1674ff]" onClick={() => setShowMoreFields((current) => !current)}>
              <Plus className={cn("h-4 w-4 transition-transform", showMoreFields ? "rotate-45" : "")} />
              Add more fields
            </button>

            {showMoreFields ? (
              <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-1.5">
                  <span className="text-sm text-[#697791]">Bank Name</span>
                  <Input value={form.bankName} onChange={(event) => updateFormField("bankName", event.target.value)} placeholder="Enter Bank Name" className="h-11 rounded-[10px] border-[#c9d5e8]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm text-[#697791]">Account Number</span>
                  <Input value={form.accountNumber} onChange={(event) => updateFormField("accountNumber", event.target.value)} placeholder="Enter Account Number" className="h-11 rounded-[10px] border-[#c9d5e8]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm text-[#697791]">Branch Name</span>
                  <Input value={form.branchName} onChange={(event) => updateFormField("branchName", event.target.value)} placeholder="Enter Branch Name" className="h-11 rounded-[10px] border-[#c9d5e8]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm text-[#697791]">Account Holder Name</span>
                  <Input value={form.accountHolderName} onChange={(event) => updateFormField("accountHolderName", event.target.value)} placeholder="Enter Account Holder Name" className="h-11 rounded-[10px] border-[#c9d5e8]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm text-[#697791]">Routing Number</span>
                  <Input value={form.routingNumber} onChange={(event) => updateFormField("routingNumber", event.target.value)} placeholder="Enter Routing Number" className="h-11 rounded-[10px] border-[#c9d5e8]" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm text-[#697791]">SWIFT Code</span>
                  <Input value={form.swiftCode} onChange={(event) => updateFormField("swiftCode", event.target.value)} placeholder="Enter SWIFT Code" className="h-11 rounded-[10px] border-[#c9d5e8]" />
                </label>
                <label className="grid gap-1.5 md:col-span-2 xl:col-span-3">
                  <span className="text-sm text-[#697791]">Notes</span>
                  <textarea
                    value={form.notes}
                    onChange={(event) => updateFormField("notes", event.target.value)}
                    placeholder="Add account notes"
                    className="min-h-[110px] rounded-[10px] border border-[#c9d5e8] bg-white px-3 py-3 text-sm text-[#1f3253] outline-none"
                  />
                </label>
              </div>
            ) : null}

            <TooltipProvider delayDuration={120}>
              <label className="mt-5 flex items-center gap-2 text-[15px] text-[#364760]">
                <input type="checkbox" checked={form.printOnInvoices} onChange={(event) => updateFormField("printOnInvoices", event.target.checked)} className="h-4 w-4 rounded border-[#9aa9c0]" />
                <span>Print Bank Details on Invoices</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#72829e]">
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Enable this to show bank account details in invoice footers.</TooltipContent>
                </Tooltip>
              </label>
            </TooltipProvider>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#d7dfeb] bg-white px-4 py-3">
            <Button type="button" variant="outline" className="rounded-full border-[#eef1f6] px-6 text-[#66748f]" onClick={closeEditor}>
              Cancel
            </Button>
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]">
              <CheckCircle2 className="h-5 w-5" />
              Save Details
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!accounts.length) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d7dfeb] bg-white">
          <div className="flex items-center justify-between border-b border-[#d7dfeb] px-4 py-4">
            <div className="text-[18px] font-semibold text-[#1f3253]">Banks</div>
            {renderHeaderMenu()}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center text-center">
              <div className="max-w-[640px]">
                <h2 className="text-[20px] font-semibold text-[#24365a]">Manage Multiple Bank Accounts</h2>
                <p className="mt-2 text-[15px] leading-7 text-[#697791]">With Bizovix, you can organize multiple bank accounts and track all your business transactions in one place.</p>
              </div>

              <BankIllustration className="mt-6" />

              <div className="mt-8 grid w-full gap-6 lg:grid-cols-3">
                {featureCards.map((item) => (
                  <Card key={item.title} className="rounded-[12px] border-[#d7dfeb] bg-white shadow-none hover:translate-y-0 hover:shadow-none">
                    <CardContent className="flex items-start gap-4 px-4 py-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e7f2ff] text-[#1674ff]">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <div className="text-[15px] font-semibold text-[#24365a]">{item.title}</div>
                        <div className="mt-2 text-[14px] leading-6 text-[#697791]">{item.description}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <button type="button" className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-[15px] font-semibold text-white shadow-[0_14px_30px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]" onClick={openCreateForm}>
                <Plus className="h-4 w-4" />
                Add Bank Account
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d7dfeb] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d7dfeb] px-4 py-2">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold text-[#1f3253]">Banks</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CollapsibleSearch
              value={search}
              onChange={setSearch}
              label="Search bank accounts"
              placeholder="Search bank, account no, branch..."
              expandedWidth="w-[250px]"
              size="sm"
            />
            <button type="button" className="inline-flex h-8 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(230,120,23,0.22)] hover:bg-[#cf670f]" onClick={openCreateForm}>
              <Plus className="h-4 w-4" />
              Add Bank Account
            </button>
            {renderHeaderMenu()}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-[#d7dfeb] bg-[#f8fbff] px-4 py-2.5 text-sm">
          <span className="text-[#61708a]">Accounts <strong className="ml-1 text-[#24365a]">{accounts.length}</strong></span>
          <span className="text-[#61708a]">Current Balance <strong className="ml-1 text-[#24365a]">{formatCurrency(totalBalance)}</strong></span>
          <span className="text-[#61708a]">On Invoices <strong className="ml-1 text-[#24365a]">{printableCount}</strong></span>
        </div>

        <div
          data-bank-accounts-layout="true"
          className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(205px,220px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(260px,310px)_minmax(0,1fr)]"
        >
          <div className="flex min-h-0 flex-col overflow-hidden border-b border-[#e7edf5] lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 items-center justify-between border-b border-[#e7edf5] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7d8aa2]">
              <span>Accounts</span>
              <span>{filteredAccounts.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
              {filteredAccounts.length ? (
                filteredAccounts.map((account) => {
                  const active = selectedAccount?.id === account.id;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      className={cn(
                        "flex w-full items-start justify-between gap-3 border-b border-[#edf2f7] px-3 py-3 text-left transition",
                        active ? "bg-[#b9d7ed]" : "bg-white hover:bg-[#f7fbff]",
                      )}
                      onClick={() => setSelectedId(account.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        const menuWidth = 176;
                        const menuHeight = 88;
                        setSelectedId(account.id);
                        setAccountContextMenu({
                          account,
                          left: Math.min(window.innerWidth - menuWidth - 12, Math.max(12, event.clientX)),
                          top: Math.min(window.innerHeight - menuHeight - 12, Math.max(12, event.clientY)),
                        });
                      }}
                    >
                      <div className="min-w-0">
                        <div className={cn("truncate text-sm font-semibold", active ? "text-[#1674ff]" : "text-[#24365a]")}>{account.displayName}</div>
                        <div className="mt-0.5 truncate text-xs text-[#7d8aa2]">
                          {account.bankName || "Bank details not added"}
                          {account.branchName ? ` · ${account.branchName}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums text-[#24365a]">{formatCurrency(account.openingBalance)}</div>
                        <div className={cn("mt-0.5 text-[11px] font-semibold", account.printOnInvoices ? "text-[#0f9f63]" : "text-[#9aa7bb]")}>
                          {account.printOnInvoices ? "On invoice" : "Internal"}
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-8 text-center text-sm text-[#8994a6]">No account matches &quot;{search}&quot;.</div>
              )}
            </div>
          </div>

          <div data-bank-account-detail="true" className="min-h-0 overflow-y-auto lg:flex lg:flex-col lg:overflow-hidden">
            {selectedAccount ? (
              <div data-bank-account-content="true" className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#d7dfeb] bg-[#fbfdff] px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="text-[16px] font-semibold text-[#24365a]">{selectedAccount.displayName}</h3>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                          selectedAccount.printOnInvoices ? "bg-[#e8fff4] text-[#0f9f63]" : "bg-[#f3f5f8] text-[#697791]",
                        )}
                      >
                        {selectedAccount.printOnInvoices ? "Invoice Visible" : "Internal Only"}
                      </span>
                    </div>
                    <div className="text-sm text-[#6d7b94]">
                      {selectedAccount.bankName || "Bank details not added yet"}
                      {selectedAccount.branchName ? ` · ${selectedAccount.branchName}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                        selectedAccount.printOnInvoices
                          ? "border-[#bdebd4] bg-[#e8fff4] text-[#0f9f63] hover:bg-[#d8fbeb]"
                          : "border-[#d7dfeb] text-[#61708a] hover:bg-[#f4f7fb]",
                      )}
                      onClick={() => togglePrintOnInvoices(selectedAccount)}
                    >
                      <Receipt className="h-4 w-4" />
                      {selectedAccount.printOnInvoices ? "Showing on invoices" : "Show on invoices"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d7dfeb] text-[#61708a] transition hover:bg-[#f4f7fb]"
                      onClick={() => printAccountDetails(selectedAccount)}
                      aria-label="Print bank account details"
                      title="Print this account"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d7dfeb] text-[#61708a] transition hover:bg-[#f4f7fb]"
                      onClick={() => handleEditAccount(selectedAccount)}
                      aria-label="Edit bank account"
                      title="Edit this account"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d7dfeb] text-[#d34848] transition hover:bg-[#fff3f3]"
                      onClick={() => setDeleteTarget(selectedAccount)}
                      aria-label="Delete bank account"
                      title="Delete this account"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid shrink-0 border-b border-[#d7dfeb] sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                  <AccountInfo label="Current Balance" value={formatCurrency(selectedAccount.openingBalance)} />
                  <AccountInfo label="As of Date" value={formatAsOfDate(selectedAccount.asOfDate)} />
                  <AccountInfo label="Bank Name" value={selectedAccount.bankName || "-"} />
                  <AccountInfo label="Account Number" value={selectedAccount.accountNumber || "-"} />
                  <AccountInfo label="Account Holder" value={selectedAccount.accountHolderName || "-"} />
                  <AccountInfo label="Branch" value={selectedAccount.branchName || "-"} />
                  <AccountInfo label="Routing Number" value={selectedAccount.routingNumber || "-"} />
                  <AccountInfo label="SWIFT Code" value={selectedAccount.swiftCode || "-"} />
                </div>

                {selectedAccount.notes ? (
                  <div className="border-b border-[#e5eaf2] bg-[#fbfcff] px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7d8aa2]">Notes</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#3f4f65]">{selectedAccount.notes}</div>
                  </div>
                ) : null}

                <div data-bank-account-ledger="true" className="border-t border-[#d7dfeb] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                  <div className="flex items-center justify-between border-b border-[#d7dfeb] bg-[#f8fbff] px-4 py-2.5">
                    <div className="text-sm font-semibold text-[#24365a]">Ledger Transactions</div>
                    <div className="text-xs text-[#697791]">{selectedLedgerTransactions.length} entries</div>
                  </div>
                  <div data-bank-account-ledger-scroll="true" className="max-h-[360px] overflow-auto lg:min-h-0 lg:flex-1 lg:max-h-none">
                    <table className="w-full min-w-[760px] border-collapse text-sm">
                      <thead className="sticky top-0 z-10 bg-[#f3f7fc] text-[11px] uppercase tracking-[0.08em] text-[#6b7b94]">
                        <tr><th className="border-b px-4 py-2 text-left">Date</th><th className="border-b px-4 py-2 text-left">Voucher No.</th><th className="border-b px-4 py-2 text-left">Particulars</th><th className="border-b px-4 py-2 text-right">Debit</th><th className="border-b px-4 py-2 text-right">Credit</th><th className="border-b px-4 py-2 text-right">Balance</th><th className="border-b px-4 py-2 text-center">Action</th></tr>
                      </thead>
                      <tbody>
                        {ledgerVouchersQuery.isLoading ? (
                          <tr><td colSpan={7} className="px-4 py-10 text-center text-[#8994a6]">Loading ledger transactions...</td></tr>
                        ) : selectedLedgerTransactions.length ? selectedLedgerTransactions.map((entry) => (
                          <tr key={entry.id} className="border-b border-[#edf2f7] hover:bg-[#f8fbff]">
                            <td className="whitespace-nowrap px-4 py-2.5">{formatDate(entry.date)}</td><td className="px-4 py-2.5">{entry.documentKind === "opening-balance" ? <span className="font-medium text-[#52637f]">{entry.voucherNumber}</span> : <button type="button" className="font-medium text-[#245b96] hover:underline" onClick={() => router.push(entry.voucherType === "contra" ? `${buildWorkspaceRoute(mode, "/utilities/bank-transfers")}?edit=${encodeURIComponent(entry.voucherId)}` : `${buildVoucherRoute(mode, entry.voucherType)}?edit=${encodeURIComponent(entry.voucherId)}`)}>{entry.voucherNumber}</button>}</td><td className="px-4 py-2.5">{entry.particulars}</td><td className="px-4 py-2.5 text-right tabular-nums">{entry.debit ? formatCurrency(entry.debit) : "-"}</td><td className="px-4 py-2.5 text-right tabular-nums">{entry.credit ? formatCurrency(entry.credit) : "-"}</td><td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatCurrency(entry.balance)}</td><td className="px-4 py-2.5 text-center">{entry.documentKind === "opening-balance" ? <span className="text-xs text-[#8994a6]">Account Edit</span> : <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#245b96] hover:bg-[#eaf2ff]" aria-label={`Edit ${entry.voucherNumber}`} onClick={() => router.push(entry.voucherType === "contra" ? `${buildWorkspaceRoute(mode, "/utilities/bank-transfers")}?edit=${encodeURIComponent(entry.voucherId)}` : `${buildVoucherRoute(mode, entry.voucherType)}?edit=${encodeURIComponent(entry.voucherId)}`)}><Pencil className="h-4 w-4" /></button>}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={7} className="px-4 py-10 text-center text-[#8994a6]">No posted transactions for this ledger.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#8994a6]">Select an account to see its details.</div>
            )}
          </div>
        </div>
      </div>

      {accountContextMenu && typeof document !== "undefined" ? createPortal(
        <>
          <div className="fixed inset-0 z-[58]" onMouseDown={() => setAccountContextMenu(null)} aria-hidden="true" />
          <div role="menu" className="fixed z-[59] w-44 overflow-hidden rounded-[6px] border border-[#d7e1ee] bg-white p-1.5 shadow-[0_14px_34px_rgba(15,23,42,0.18)]" style={{ left: accountContextMenu.left, top: accountContextMenu.top }} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" role="menuitem" className="flex h-9 w-full items-center gap-2 rounded-[4px] px-3 text-left text-sm font-medium text-[#24364f] hover:bg-[#eef5ff] hover:text-[#1455a0]" onClick={() => { const account = accountContextMenu.account; setAccountContextMenu(null); handleEditAccount(account); }}>
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button type="button" role="menuitem" className="flex h-9 w-full items-center gap-2 rounded-[4px] px-3 text-left text-sm font-medium text-[#b42318] hover:bg-[#fff1f0]" onClick={() => { setDeleteTarget(accountContextMenu.account); setAccountContextMenu(null); }}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </>,
        document.body,
      ) : null}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (open ? null : setDeleteTarget(null))}>
        <DialogContent className="w-[min(92vw,460px)]" submitOnEnter>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fee2e2] text-[#dc2626]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold text-[#24365a]">Deactivate this bank ledger?</DialogTitle>
              <DialogDescription className="mt-1.5 text-sm leading-6 text-[#697791]">
                It will stop appearing in new transactions, while all historical journal entries and balances remain intact.
              </DialogDescription>
            </div>
          </div>

          {deleteTarget ? (
            <div className="mt-4 rounded-[14px] border border-[#e5eaf2] bg-[#fbfcff] px-4 py-3">
              <div className="text-sm font-semibold text-[#24365a]">{deleteTarget.displayName}</div>
              <div className="mt-0.5 text-xs text-[#7d8aa2]">
                {deleteTarget.bankName || "Bank details not added"}
                {deleteTarget.branchName ? ` · ${deleteTarget.branchName}` : ""}
                {deleteTarget.accountNumber ? ` · ${deleteTarget.accountNumber}` : ""}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#61708a]">
                <span>
                  Opening balance: <strong className="font-semibold text-[#24365a]">{formatCurrency(deleteTarget.openingBalance)}</strong>
                </span>
                {deleteTarget.printOnInvoices ? <span className="font-semibold text-[#b45309]">Currently printing on invoices</span> : null}
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
              onClick={confirmDeleteAccount}
            >
              <Trash2 className="h-4 w-4" />
              Yes, delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MenuActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Printer;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#24365a] transition hover:bg-[#f7f9fd]" onClick={onClick}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function AccountInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-[54px] border-r border-b border-[#e5eaf2] bg-white px-3 py-2">
      <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-normal text-[#7d8aa2] 2xl:tracking-[0.14em]">{label}</div>
      <div className="mt-1 break-words text-[12px] font-medium leading-4 text-[#24365a] 2xl:text-[13px]">{value}</div>
    </div>
  );
}
