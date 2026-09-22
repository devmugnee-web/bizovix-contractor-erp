"use client";

import * as React from "react";
import { formatBDT } from "@bizovix/utils";
import {
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Landmark,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  useCashBankSummary,
  useCashLedger,
  useCheques,
  useCreateBankAccount,
  useCreateCheque,
  useCreateFundTransfer,
  useCreateMainCash,
  useCreatePettyExpense,
  useCreateReconciliation,
  useDeleteBankAccount,
  useFinancialAccounts,
  useFundTransfers,
  useReconciliations,
  useReplenishPettyCash,
  useUpdateBankAccount,
  useUpdateChequeStatus,
} from "@bizovix/api-client";
import type {
  CashBankQuery,
  ChequeRecord,
  FinancialAccount,
  FinancialTransactionRecord,
} from "@bizovix/types";
import { PrimaryButton, SecondaryButton, SelectInput, TextInput, cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export type CashBankView =
  | "overview"
  | "main-cash"
  | "petty-cash"
  | "bank-accounts"
  | "transfers"
  | "transactions"
  | "reconciliation"
  | "cheques";
const titles: Record<CashBankView, [string, string]> = {
  overview: [
    "Cash & Bank",
    "Manage company cash, bank accounts, transfers and financial transactions.",
  ],
  "main-cash": ["Main Cash", "Manage the company's main physical cash."],
  "petty-cash": ["Petty Cash", "Manage small daily operational cash expenses."],
  "bank-accounts": ["Bank Accounts", "Manage all company bank accounts."],
  transfers: ["Bank Transfer", "Transfer funds safely between company cash and bank accounts."],
  transactions: ["Financial Transactions", "Central ledger for every cash and bank movement."],
  reconciliation: ["Bank Reconciliation", "Match ERP balances with real bank statement balances."],
  cheques: ["Cheque Management", "Track issued and received cheque lifecycles."],
};
const money = (v: unknown) => formatBDT(Number(v ?? 0));
const date = (v: string) => new Date(v).toLocaleDateString("en-GB");
const today = () => new Date().toISOString().slice(0, 10);
const field =
  "h-10 rounded-md border border-biz-border px-3 text-[12px] outline-none focus:border-biz-blue";

function Modal({
  title,
  onClose,
  children,
  onSave,
  busy,
  wide,
  compact,
  subtitle,
  saveLabel,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  onSave: () => void;
  busy?: boolean;
  wide?: boolean;
  compact?: boolean;
  subtitle?: string;
  saveLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-biz-navy/35 p-4">
      <div
        className={cn(
          "max-h-[92vh] w-full overflow-auto rounded-lg border border-biz-border bg-white shadow-xl",
          wide ? "max-w-6xl" : compact ? "max-w-xl" : "max-w-3xl",
        )}
      >
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-[17px] font-bold">{title}</h2>
            {subtitle && <p className="mt-1 text-[11px] text-biz-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className={cn(
            "grid grid-cols-1 gap-4 p-5",
            wide ? "sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-4 lg:gap-y-5" : "sm:grid-cols-2",
          )}
        >
          {children}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-biz-border bg-white p-4">
          <SecondaryButton className={cn((wide || compact) && "rounded-full px-6")} onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            className={cn((wide || compact) && "rounded-full bg-orange-500 px-6 hover:bg-orange-600")}
            disabled={busy}
            onClick={onSave}
          >
            {busy ? "Saving..." : (saveLabel ?? (wide ? "Save Details" : "Save"))}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
function Kpis({ items }: { items: Array<[string, unknown, string]> }) {
  return (
    <div
      className={cn(
        "grid gap-3",
        items.length === 5 ? "sm:grid-cols-2 xl:grid-cols-5" : "sm:grid-cols-2 xl:grid-cols-4",
      )}
    >
      {items.map(([label, value, tone]) => (
        <div key={label} className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
          <p className="text-[11px] font-semibold text-biz-muted">{label}</p>
          <p className={cn("mt-2 text-[19px] font-bold tabular-nums", tone)}>{money(value)}</p>
        </div>
      ))}
    </div>
  );
}
function State({
  loading,
  error,
  empty,
  retry,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  retry: () => void;
}) {
  if (loading)
    return (
      <>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mx-4 my-3 h-8 animate-pulse bg-slate-100" />
        ))}
      </>
    );
  if (error)
    return (
      <div className="p-10 text-center text-red-600">
        Unable to load data.{" "}
        <button className="font-semibold underline" onClick={retry}>
          Retry
        </button>
      </div>
    );
  if (empty) return <div className="p-12 text-center text-biz-muted">No records found.</div>;
  return null;
}
function LedgerTable({ rows }: { rows: FinancialTransactionRecord[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] text-left text-[11px]">
        <thead className="bg-[#f4f7fb] text-[10px]">
          <tr>
            {[
              "SL",
              "Date",
              "Transaction No.",
              "Account",
              "Type",
              "Source",
              "Reference",
              "Description",
              "Money Out",
              "Money In",
              "Balance",
              "Action",
            ].map((h, i) => (
              <th key={`${h}-${i}`} className="px-3 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-biz-border">
              <td className="px-3 py-3">{i + 1}</td>
              <td className="px-3">{date(r.transactionDate)}</td>
              <td className="px-3 font-semibold text-biz-blue">{r.transactionNo}</td>
              <td className="px-3">{r.account.accountName}</td>
              <td className="px-3">
                <span
                  className={cn(
                    "rounded px-2 py-1 font-semibold",
                    r.direction === "IN" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600",
                  )}
                >
                  {r.direction}
                </span>
              </td>
              <td className="px-3">{r.sourceModule.replaceAll("_", " ")}</td>
              <td className="px-3">{r.referenceNo ?? "-"}</td>
              <td className="max-w-56 px-3">{r.description}</td>
              <td className="px-3 text-right">{r.direction === "OUT" ? money(r.amount) : "-"}</td>
              <td className="px-3 text-right">{r.direction === "IN" ? money(r.amount) : "-"}</td>
              <td className="px-3 text-right font-semibold">{money(r.balanceAfter)}</td>
              <td className="px-3">
                <button
                  title="View"
                  className="rounded border border-blue-100 bg-blue-50 p-1.5 text-blue-600"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BankAccountLedger({ rows }: { rows: FinancialTransactionRecord[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-[11px]">
        <thead className="bg-[#f4f7fb] text-[9px] uppercase tracking-wide text-biz-muted">
          <tr>
            {[
              "Date",
              "Transaction No.",
              "Description",
              "Money Out",
              "Money In",
              "Balance",
            ].map((heading) => (
              <th key={heading} className="px-3 py-3 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-biz-border hover:bg-blue-50/30">
              <td className="whitespace-nowrap px-3 py-3">{date(row.transactionDate)}</td>
              <td className="whitespace-nowrap px-3 font-semibold text-biz-blue">
                {row.transactionNo}
              </td>
              <td className="max-w-64 px-3">
                <p className="truncate" title={row.description}>{row.description}</p>
                {row.referenceNo && <p className="mt-0.5 text-[9px] text-biz-muted">Ref: {row.referenceNo}</p>}
              </td>
              <td className="px-3 text-right tabular-nums">
                {row.direction === "OUT" ? money(row.amount) : "-"}
              </td>
              <td className="px-3 text-right tabular-nums">
                {row.direction === "IN" ? money(row.amount) : "-"}
              </td>
              <td className="px-3 text-right font-bold tabular-nums text-biz-navy">
                {money(row.balanceAfter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CashMovementTable({ rows }: { rows: FinancialTransactionRecord[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] table-fixed text-left text-[11px]">
        <colgroup>
          <col className="w-[125px]" />
          <col />
          <col className="w-[190px]" />
          <col className="w-[165px]" />
          <col className="w-[165px]" />
          <col className="w-[180px]" />
        </colgroup>
        <thead className="bg-[#f4f7fb] text-[9px] uppercase tracking-wide text-biz-muted">
          <tr>
            {([
              ["Date", false],
              ["Description", false],
              ["Reference", false],
              ["Cash In", true],
              ["Cash Out", true],
              ["Current Balance", true],
            ] as const).map(([heading, numeric]) => (
              <th
                key={heading}
                className={cn("px-3 py-3 font-semibold", numeric && "text-right")}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-biz-border hover:bg-blue-50/30">
              <td className="whitespace-nowrap px-3 py-3 font-semibold">{date(row.transactionDate)}</td>
              <td className="min-w-0 px-3">
                <p className="truncate" title={row.description}>{row.description}</p>
                <p className="mt-0.5 text-[9px] text-biz-muted">{row.sourceModule.replaceAll("_", " ")}</p>
              </td>
              <td className="truncate px-3 text-biz-blue" title={row.referenceNo ?? row.transactionNo}>
                {row.referenceNo ?? row.transactionNo}
              </td>
              <td className="px-3 text-right font-semibold tabular-nums text-emerald-700">
                {row.direction === "IN" ? money(row.amount) : "-"}
              </td>
              <td className="px-3 text-right font-semibold tabular-nums text-red-600">
                {row.direction === "OUT" ? money(row.amount) : "-"}
              </td>
              <td className="px-3 text-right font-bold tabular-nums text-biz-navy">
                {money(row.balanceAfter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CashBankWorkspace({ view }: { view: CashBankView }) {
  const [title, subtitle] = titles[view];
  useSetBreadcrumb([
    { label: "Cash & Bank", href: "/cash-bank" },
    ...(view === "overview" ? [] : [{ label: title }]),
  ]);
  const summary = useCashBankSummary(),
    accounts = useFinancialAccounts();
  const bankAccounts = React.useMemo(
    () => (accounts.data ?? []).filter((account) => account.accountType === "BANK"),
    [accounts.data],
  );
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [selectedBankAccountId, setSelectedBankAccountId] = React.useState("");
  const [selectedTransferAccountId, setSelectedTransferAccountId] = React.useState("");
  const effectiveBankAccountId = bankAccounts.some(
    (account) => account.id === selectedBankAccountId,
  )
    ? selectedBankAccountId
    : (bankAccounts[0]?.id ?? "");
  const q: CashBankQuery = {
    page,
    limit: view === "bank-accounts" ? 20 : view === "transfers" ? 100 : 10,
    search,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    accountId:
      view === "bank-accounts"
        ? effectiveBankAccountId || undefined
        : view === "transfers"
          ? selectedTransferAccountId || undefined
          : undefined,
  };
  const ledger = useCashLedger(
    view === "petty-cash"
      ? "petty-cash"
      : view === "transactions" || view === "bank-accounts"
        ? "transactions"
        : "main-cash",
    q,
  );
  const transfers = useFundTransfers(q);
  const recons = useReconciliations();
  const cheques = useCheques();
  const createAccount = useCreateBankAccount(),
    updateAccount = useUpdateBankAccount(),
    deleteAccount = useDeleteBankAccount(),
    createCash = useCreateMainCash(),
    createPetty = useCreatePettyExpense(),
    replenish = useReplenishPettyCash(),
    createTransfer = useCreateFundTransfer(),
    createRecon = useCreateReconciliation(),
    createCheque = useCreateCheque();
  const [modal, setModal] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState("");
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, boolean>>({});
  const setValue = (name: string, value: string) => {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };
  const open = (kind: string, defaults: Record<string, string> = {}) => {
    setForm({
      date: today(),
      amount: "",
      ...(kind === "cash" || kind === "petty" ? { direction: "IN" } : {}),
      ...defaults,
    });
    setFieldErrors({});
    setNotice("");
    setModal(kind);
  };
  const val = (name: string, label: string, type = "text", required = true, className = "") => (
    <label
      className={cn(
        "text-[11px] font-semibold text-biz-muted",
        fieldErrors[name] && "text-red-600",
        className,
      )}
    >
      {label}
      {required && <b className="text-red-500"> *</b>}
      <input
        className={cn(
          field,
          "mt-2 w-full",
          fieldErrors[name] &&
            "!border-red-500 !bg-red-50 ring-1 ring-red-500 focus:!border-red-500",
        )}
        type={type}
        value={form[name] ?? ""}
        aria-invalid={fieldErrors[name] || undefined}
        onChange={(e) => setValue(name, e.target.value)}
      />
    </label>
  );
  const notes = (
    name: string,
    label: string,
    className = "sm:col-span-2 lg:col-span-3",
  ) => (
    <label className={cn("text-[11px] font-semibold text-biz-muted", className)}>
      {label}
      <textarea
        className={cn(field, "mt-2 min-h-28 w-full resize-y py-3")}
        value={form[name] ?? ""}
        onChange={(event) => setValue(name, event.target.value)}
        placeholder="Add account notes"
      />
    </label>
  );
  const sel = (name: string, label: string, opts: Array<[string, string]>, required = true) => (
    <label className={cn("text-[11px] font-semibold", fieldErrors[name] && "text-red-600")}>
      {label}
      {required && <b className="text-red-500"> *</b>}
      <select
        className={cn(
          field,
          "mt-2 w-full",
          fieldErrors[name] &&
            "!border-red-500 !bg-red-50 ring-1 ring-red-500 focus:!border-red-500",
        )}
        value={form[name] ?? ""}
        aria-invalid={fieldErrors[name] || undefined}
        onChange={(e) => setValue(name, e.target.value)}
      >
        <option value="">Select...</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  async function save() {
    try {
      const requiredFields: Record<string, string[]> = {
        account: [
          "bankName",
          "accountName",
          "accountNumber",
          "branch",
          "bankAccountType",
          "amount",
          "date",
        ],
        "account-edit": [
          "bankName",
          "accountName",
          "accountNumber",
          "branch",
          "bankAccountType",
          "currentBalance",
          "status",
        ],
        cash: ["direction", "date", "amount", "category", "party"],
        petty: ["direction", "date", "amount"],
        replenish: ["date", "amount", "fromAccountId"],
        transfer: ["date", "fromAccountId", "toAccountId", "amount"],
        recon: ["accountId", "from", "to", "statementBalance"],
        cheque: ["type", "chequeNo", "date", "bankName", "party", "amount"],
      };
      const nextErrors: Record<string, boolean> = {};
      for (const name of requiredFields[modal ?? ""] ?? []) {
        if (!form[name]?.trim()) nextErrors[name] = true;
      }
      if (modal === "petty") {
        const pettyFields =
          form.direction === "IN"
            ? ["fromAccountId"]
            : ["category", "party", "description"];
        for (const name of pettyFields) {
          if (!form[name]?.trim()) nextErrors[name] = true;
        }
      }
      const amount = Number(form.amount);
      if (modal === "account" && form.amount?.trim() && (!Number.isFinite(amount) || amount < 0))
        nextErrors.amount = true;
      if (
        modal === "account-edit" &&
        form.currentBalance?.trim() &&
        !Number.isFinite(Number(form.currentBalance))
      )
        nextErrors.currentBalance = true;
      if (
        modal === "recon" &&
        form.statementBalance?.trim() &&
        !Number.isFinite(Number(form.statementBalance))
      )
        nextErrors.statementBalance = true;
      if (
        !["account", "account-edit", "recon"].includes(modal ?? "") &&
        form.amount?.trim() &&
        (!Number.isFinite(amount) || amount <= 0)
      )
        nextErrors.amount = true;
      if (modal === "transfer" && form.fromAccountId && form.fromAccountId === form.toAccountId) {
        nextErrors.fromAccountId = true;
        nextErrors.toAccountId = true;
      }
      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        setNotice("");
        return;
      }
      setFieldErrors({});
      if (modal === "account")
        await createAccount.mutateAsync({
          bankName: form.bankName,
          accountName: form.accountName,
          accountNumber: form.accountNumber,
          branch: form.branch,
          routingNumber: form.routingNumber,
          bankAccountType: form.bankAccountType,
          emiDate: form.bankAccountType === "OD" ? form.emiDate || null : null,
          openingBalance: amount,
          openingBalanceDate: form.date,
          currency: "BDT",
          remarks: form.remarks,
          status: "Active",
        });
      if (modal === "account-edit")
        await updateAccount.mutateAsync({
          id: form.accountId!,
          body: {
            bankName: form.bankName,
            accountName: form.accountName,
            accountNumber: form.accountNumber,
            branch: form.branch,
            routingNumber: form.routingNumber,
            bankAccountType: form.bankAccountType,
            emiDate: form.bankAccountType === "OD" ? form.emiDate || null : null,
            currency: "BDT",
            remarks: form.remarks,
            status: form.status,
            currentBalance: Number(form.currentBalance),
          },
        });
      if (modal === "cash")
        await createCash.mutateAsync({
          direction: form.direction,
          transactionDate: form.date,
          amount,
          category: form.category,
          party: form.party,
          referenceType: form.referenceType,
          referenceNo: form.referenceNo,
          description: form.description,
        });
      if (modal === "petty") {
        if (form.direction === "IN") {
          await replenish.mutateAsync({
            transferDate: form.date,
            fromAccountId: form.fromAccountId,
            amount,
            bankCharge: 0,
            description: form.description,
          });
        } else {
          await createPetty.mutateAsync({
            transactionDate: form.date,
            amount,
            category: form.category,
            party: form.party,
            description: form.description,
            referenceNo: form.referenceNo,
          });
        }
      }
      if (modal === "replenish")
        await replenish.mutateAsync({
          transferDate: form.date,
          fromAccountId: form.fromAccountId,
          amount,
          bankCharge: 0,
          description: form.description,
        });
      if (modal === "transfer")
        await createTransfer.mutateAsync({
          transferDate: form.date,
          fromAccountId: form.fromAccountId,
          toAccountId: form.toAccountId,
          amount,
          bankCharge: Number(form.bankCharge || 0),
          referenceNo: form.referenceNo,
          description: form.description,
        });
      if (modal === "recon")
        await createRecon.mutateAsync({
          accountId: form.accountId,
          statementFrom: form.from,
          statementTo: form.to,
          statementBalance: Number(form.statementBalance),
        });
      if (modal === "cheque")
        await createCheque.mutateAsync({
          chequeNo: form.chequeNo,
          type: form.type,
          accountId: form.accountId || undefined,
          bankName: form.bankName,
          branch: form.branch,
          party: form.party,
          amount,
          chequeDate: form.date,
          actionDate: form.actionDate || undefined,
          referenceNo: form.referenceNo,
          remarks: form.remarks,
        });
      setModal(null);
      setFieldErrors({});
      setNotice("Saved successfully.");
      setTimeout(() => setNotice(""), 2500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setNotice(
        message === "Validation failed" ? "" : message || "Unable to save. Please try again.",
      );
    }
  }
  async function removeBankAccount(id: string, accountName: string) {
    if (!window.confirm(`Delete bank account "${accountName}"?`)) return;
    try {
      await deleteAccount.mutateAsync(id);
      setNotice("Bank account deleted successfully.");
      setTimeout(() => setNotice(""), 2500);
    } catch (error) {
      setNotice(
        error instanceof Error && error.message
          ? error.message
          : "Unable to delete this bank account.",
      );
    }
  }
  function openBankAccountEditor(account: FinancialAccount) {
    open("account-edit", {
      accountId: account.id,
      bankName: account.bankName ?? "",
      accountName: account.accountName,
      accountNumber: account.accountNumber ?? "",
      branch: account.branch ?? "",
      routingNumber: account.routingNumber ?? "",
      bankAccountType: account.bankAccountType ?? "",
      emiDate: account.emiDate?.slice(0, 10) ?? "",
      amount: String(account.openingBalance ?? 0),
      currentBalance: String(account.currentBalance ?? 0),
      date: account.openingBalanceDate?.slice(0, 10) ?? today(),
      remarks: account.remarks ?? "",
      status: account.isActive ? "Active" : "Inactive",
    });
  }
  const selectedBankAccount =
    bankAccounts.find((account) => account.id === effectiveBankAccountId) ?? bankAccounts[0];
  const allAccounts = (accounts.data ?? []).map(
    (a) =>
      [a.id, `${a.accountName}${a.accountNumber ? ` (${a.accountNumber})` : ""}`] as [
        string,
        string,
      ],
  );
  const pettyCashSources = (accounts.data ?? [])
    .filter((account) => account.cashRole !== "PETTY_CASH")
    .map(
      (account) =>
        [
          account.id,
          `${account.accountName}${account.accountNumber ? ` (${account.accountNumber})` : ""}`,
        ] as [string, string],
    );
  const action =
    view === "main-cash"
      ? ["Adjust Main Cash", "cash"]
      : view === "petty-cash"
        ? ["Add Expense", "petty"]
        : view === "bank-accounts"
          ? ["Add Bank Account", "account"]
          : view === "transfers"
            ? ["New Transfer", "transfer"]
            : view === "reconciliation"
              ? ["Start Reconciliation", "recon"]
              : view === "cheques"
                ? ["Add Cheque", "cheque"]
                : null;
  const baseKpis: Array<[string, unknown, string]> = [
    ["Main Cash Balance", summary.data?.mainCashBalance, "text-blue-600"],
    ["Petty Cash Balance", summary.data?.pettyCashBalance, "text-purple-600"],
    ["Total Bank Balance", summary.data?.totalBankBalance, "text-green-700"],
    ["Today's Cash In", summary.data?.todayCashIn, "text-green-700"],
    ["Today's Cash Out", summary.data?.todayCashOut, "text-red-600"],
  ];
  const ledgerIn = (ledger.data?.items ?? [])
    .filter((row) => row.direction === "IN")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const ledgerOut = (ledger.data?.items ?? [])
    .filter((row) => row.direction === "OUT")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const transferRows = transfers.data?.items ?? [];
  const transferredAmount = transferRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const currentMonth = today().slice(0, 7);
  const transferredThisMonth = transferRows
    .filter((row) => row.transferDate.slice(0, 7) === currentMonth)
    .reduce((sum, row) => sum + Number(row.amount), 0);
  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <div className="fixed right-5 top-16 z-[60] rounded bg-biz-navy px-4 py-2 text-[12px] text-white">
          {notice}
        </div>
      )}
      {view !== "main-cash" && view !== "petty-cash" && <div className="flex items-start justify-between">
        <div>
          <h1 className="text-page-title text-biz-text">{title}</h1>
          <p className="mt-1 text-[13px] text-biz-muted">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          {action && (
            <PrimaryButton onClick={() => open(action[1]!)}>
              <Plus className="h-4 w-4" />
              {action[0]}
            </PrimaryButton>
          )}
        </div>
      </div>}
      {view === "overview" && (
        <>
          <Kpis items={baseKpis} />
          <div className="grid gap-4 xl:grid-cols-3">
            <section className="rounded-lg border bg-white p-4 shadow-card">
              <h2 className="font-bold">Account Balance Summary</h2>
              {(accounts.data ?? []).slice(0, 6).map((a) => (
                <div key={a.id} className="flex justify-between border-b py-3 text-[12px]">
                  <span>{a.accountName}</span>
                  <b>{money(a.currentBalance)}</b>
                </div>
              ))}
            </section>
            <section className="xl:col-span-2 overflow-hidden rounded-lg border bg-white shadow-card">
              <div className="p-4 font-bold">Recent Transactions</div>
              <LedgerTable rows={(ledger.data?.items ?? []).slice(0, 5)} />
            </section>
          </div>
        </>
      )}
      {view === "bank-accounts" && (
        <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
          <State
            loading={accounts.isLoading}
            error={accounts.isError}
            empty={!bankAccounts.length}
            retry={() => accounts.refetch()}
          />
          {!!bankAccounts.length && selectedBankAccount && (
            <>
              <div className="grid grid-cols-2 divide-x divide-biz-border border-b border-biz-border bg-slate-50/70 text-[11px] sm:flex sm:divide-x-0">
                <div className="px-4 py-3 sm:border-r sm:border-biz-border">
                  <span className="text-biz-muted">Accounts</span>{" "}
                  <b className="ml-1 text-biz-navy">{bankAccounts.length}</b>
                </div>
                <div className="px-4 py-3">
                  <span className="text-biz-muted">Total Balance</span>{" "}
                  <b className="ml-1 text-biz-navy">{money(summary.data?.totalBankBalance)}</b>
                </div>
              </div>

              <div className="grid min-h-[510px] lg:grid-cols-[235px_minmax(0,1fr)]">
                <aside className="border-b border-biz-border bg-slate-50/40 lg:border-b-0 lg:border-r">
                  <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-biz-muted">
                      Accounts
                    </p>
                    <span className="text-[10px] font-semibold text-biz-muted">
                      {bankAccounts.length}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto lg:max-h-[465px]">
                    {bankAccounts.map((account) => {
                      const active = account.id === selectedBankAccount.id;
                      return (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => {
                            setSelectedBankAccountId(account.id);
                            setSearch("");
                            setPage(1);
                          }}
                          className={cn(
                            "flex w-full items-start justify-between gap-3 border-b border-biz-border px-4 py-3 text-left transition-colors",
                            active ? "bg-blue-100/80" : "hover:bg-blue-50/60",
                          )}
                        >
                          <span className="min-w-0">
                            <span className={cn("block truncate text-[12px] font-semibold", active ? "text-biz-blue" : "text-biz-navy")}>
                              {account.accountName}
                            </span>
                            <span className="mt-1 block truncate text-[10px] text-biz-muted">
                              {account.bankName} · {account.branch}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[11px] font-bold tabular-nums text-biz-navy">
                              {money(account.currentBalance)}
                            </span>
                            <span className={cn("mt-1 block text-[9px]", account.isActive ? "text-emerald-700" : "text-red-600")}>
                              {account.isActive ? "Active" : "Inactive"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <div className="min-w-0">
                  <div className="flex flex-col gap-3 border-b border-biz-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-[16px] font-bold text-biz-navy">
                          {selectedBankAccount.accountName}
                        </h2>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-biz-muted">
                          {selectedBankAccount.bankAccountType ?? "Bank Account"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-biz-muted">
                        {selectedBankAccount.bankName} · {selectedBankAccount.branch}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        title="Edit bank account"
                        className="rounded-full border border-biz-border p-2 text-biz-navy hover:bg-blue-50"
                        onClick={() => openBankAccountEditor(selectedBankAccount)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete bank account"
                        className="rounded-full border border-biz-border p-2 text-red-600 hover:bg-red-50"
                        disabled={deleteAccount.isPending}
                        onClick={() =>
                          void removeBankAccount(selectedBankAccount.id, selectedBankAccount.accountName)
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 border-b border-biz-border sm:grid-cols-3 xl:grid-cols-6">
                    {[
                      ["Current Balance", money(selectedBankAccount.currentBalance)],
                      ["Bank Name", selectedBankAccount.bankName ?? "-"],
                      ["Account Number", selectedBankAccount.accountNumber ?? "-"],
                      ["Branch", selectedBankAccount.branch ?? "-"],
                      ["Routing Number", selectedBankAccount.routingNumber ?? "-"],
                      ["Currency", selectedBankAccount.currency ?? "BDT"],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 border-b border-r border-biz-border px-3 py-3 xl:border-b-0">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-biz-muted">{label}</p>
                        <p className="mt-1 truncate text-[11px] font-bold text-biz-navy" title={String(value)}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-3 border-b border-biz-border bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-[12px] font-bold text-biz-navy">Account Transactions</h3>
                      <p className="text-[9px] text-biz-muted">{ledger.data?.meta.total ?? 0} entries</p>
                    </div>
                    <TextInput
                      icon={Search}
                      placeholder="Search transactions..."
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <State
                    loading={ledger.isLoading}
                    error={ledger.isError}
                    empty={!ledger.data?.items.length}
                    retry={() => ledger.refetch()}
                  />
                  {!!ledger.data?.items.length && <BankAccountLedger rows={ledger.data.items} />}
                </div>
              </div>
            </>
          )}
        </section>
      )}
      {(view === "main-cash" || view === "petty-cash") && (
        <>
          <section className="min-h-[500px] overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
            <div className="flex flex-col gap-3 border-b border-biz-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[18px] font-bold text-biz-navy">{view === "main-cash" ? "Main Cash" : "Petty Cash"}</h2>
                <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-[9px] font-semibold text-orange-600">
                  {view === "main-cash" ? "Primary Cash Account" : "Daily Expense Account"}
                </span>
                <strong className="text-[16px] tabular-nums text-orange-600">
                  {money(view === "main-cash" ? summary.data?.mainCashBalance : summary.data?.pettyCashBalance)}
                </strong>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-full border border-biz-border bg-white p-1 shadow-sm">
                  <a href="/cash-bank/main-cash" className={cn("rounded-full px-3 py-1.5 text-[10px] font-semibold", view === "main-cash" ? "bg-orange-500 text-white" : "text-biz-muted")}>Main Cash</a>
                  <a href="/cash-bank/petty-cash" className={cn("rounded-full px-3 py-1.5 text-[10px] font-semibold", view === "petty-cash" ? "bg-orange-500 text-white" : "text-biz-muted")}>Petty Cash</a>
                </div>
                <PrimaryButton className="rounded-full bg-orange-500 hover:bg-orange-600" onClick={() => open(view === "main-cash" ? "cash" : "petty")}>
                  <Plus className="h-4 w-4" />{view === "main-cash" ? "Adjust Main Cash" : "Adjust Petty Cash"}
                </PrimaryButton>
              </div>
            </div>
            <div className="border-b border-biz-border px-4 py-3"><h3 className="text-[13px] font-bold text-biz-navy">Transactions</h3></div>
            <div className="grid gap-3 border-b border-biz-border bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_160px_160px_auto]">
              <TextInput icon={Search} placeholder="Search description or reference..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
              <TextInput type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
              <TextInput type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
              <SecondaryButton onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setPage(1); }}>Clear Filters</SecondaryButton>
            </div>
            <State
              loading={ledger.isLoading}
              error={ledger.isError}
              empty={!ledger.data?.items.length}
              retry={() => ledger.refetch()}
            />
            {!!ledger.data?.items.length && <CashMovementTable rows={ledger.data.items} />}
          </section>
        </>
      )}
      {view === "transactions" && (
        <>
          <Kpis items={[["Total Cash In", ledgerIn, "text-green-700"], ["Total Cash Out", ledgerOut, "text-red-600"], ["Net Movement", ledgerIn - ledgerOut, "text-blue-600"], ["Total Entries", ledger.data?.meta.total, "text-biz-text"]]} />
          <section className="overflow-hidden rounded-lg border bg-white shadow-card">
            <div className="flex items-center justify-between p-4">
              <h2 className="font-bold">Transaction History</h2>
              <TextInput icon={Search} placeholder="Search transactions..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            </div>
            <State loading={ledger.isLoading} error={ledger.isError} empty={!ledger.data?.items.length} retry={() => ledger.refetch()} />
            {!!ledger.data?.items.length && <LedgerTable rows={ledger.data.items} />}
          </section>
        </>
      )}
      {view === "transfers" && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Transfers", transfers.data?.meta.total ?? 0, "Matching current filter"],
              ["Transferred Amount", money(transferredAmount), "Sum of listed transfers"],
              ["This Month", money(transferredThisMonth), "Transfers in current month"],
            ].map(([label, value, help]) => (
              <div key={label} className="rounded-xl border border-biz-border bg-white p-4 shadow-card">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-biz-muted">{label}</p>
                <p className="mt-1 text-[18px] font-bold tabular-nums text-biz-navy">{value}</p>
                <p className="mt-1 text-[9px] text-biz-muted">{help}</p>
              </div>
            ))}
          </div>

          <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
            <div className="grid min-h-[445px] lg:grid-cols-[220px_minmax(0,1fr)]">
              <aside className="border-b border-biz-border bg-slate-50/40 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-biz-muted">
                    Account Balances
                  </p>
                  <span className="text-[10px] font-semibold text-biz-muted">
                    {accounts.data?.length ?? 0}
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto lg:max-h-[405px]">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTransferAccountId("");
                      setPage(1);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between border-b border-biz-border px-4 py-3 text-left",
                      !selectedTransferAccountId ? "bg-blue-100/80" : "hover:bg-blue-50/60",
                    )}
                  >
                    <span className="text-[11px] font-semibold text-biz-navy">All accounts</span>
                    <span className="text-[10px] text-biz-muted">{transfers.data?.meta.total ?? 0}</span>
                  </button>
                  {(accounts.data ?? []).map((account) => {
                    const active = selectedTransferAccountId === account.id;
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => {
                          setSelectedTransferAccountId(account.id);
                          setPage(1);
                        }}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 border-b border-biz-border px-4 py-3 text-left transition-colors",
                          active ? "bg-blue-100/80" : "hover:bg-blue-50/60",
                        )}
                      >
                        <span className="min-w-0">
                          <span className={cn("block truncate text-[11px] font-semibold", active ? "text-biz-blue" : "text-biz-navy")}>
                            {account.accountName}
                          </span>
                          <span className="mt-1 block truncate text-[9px] text-biz-muted">
                            {account.accountType === "CASH" ? "Cash Account" : account.bankName}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] font-bold tabular-nums text-biz-navy">
                          {money(account.currentBalance)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="min-w-0">
                <div className="flex flex-col gap-3 border-b border-biz-border bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-biz-muted">
                      Transfers · {selectedTransferAccountId ? (accounts.data ?? []).find((account) => account.id === selectedTransferAccountId)?.accountName : "All Accounts"}
                    </h2>
                    <p className="mt-1 text-[9px] text-biz-muted">{transfers.data?.meta.total ?? 0} entries</p>
                  </div>
                  <TextInput
                    icon={Search}
                    placeholder="Search transfers..."
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <State
                  loading={transfers.isLoading}
                  error={transfers.isError}
                  empty={!transferRows.length}
                  retry={() => transfers.refetch()}
                />
                {!!transferRows.length && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-[11px]">
                      <thead className="bg-[#f4f7fb] text-[9px] uppercase tracking-wide text-biz-muted">
                        <tr>
                          {[
                            "Date",
                            "From",
                            "To",
                            "Reference",
                            "Amount",
                            "Bank Charge",
                          ].map((heading) => (
                            <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {transferRows.map((row) => (
                          <tr key={row.id} className="border-t border-biz-border hover:bg-blue-50/30">
                            <td className="whitespace-nowrap px-3 py-3">{date(row.transferDate)}</td>
                            <td className="px-3 font-medium text-biz-navy">{row.fromAccount.accountName}</td>
                            <td className="px-3 font-medium text-biz-navy">{row.toAccount.accountName}</td>
                            <td className="px-3">
                              <span className="block text-biz-blue">{row.transferNo}</span>
                              <span className="text-[9px] text-biz-muted">{row.referenceNo ?? "-"}</span>
                            </td>
                            <td className="px-3 text-right font-bold tabular-nums">{money(row.amount)}</td>
                            <td className="px-3 text-right tabular-nums">{Number(row.bankCharge) ? money(row.bankCharge) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
      {view === "reconciliation" && (
        <section className="overflow-hidden rounded-lg border bg-white shadow-card">
          <State
            loading={recons.isLoading}
            error={recons.isError}
            empty={!recons.data?.length}
            retry={() => recons.refetch()}
          />
          {!!recons.data?.length && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[11px]">
                <thead className="bg-[#f4f7fb]">
                  <tr>
                    {[
                      "SL",
                      "Reconciliation Date",
                      "Bank Account",
                      "Statement Period",
                      "ERP Balance",
                      "Statement Balance",
                      "Difference",
                      "Status",
                      "Action",
                    ].map((h, i) => (
                      <th key={`${h}-${i}`} className="p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recons.data.map((r, i) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">{i + 1}</td>
                      <td>{date(r.createdAt)}</td>
                      <td>{r.account.accountName}</td>
                      <td>
                        {date(r.statementFrom)} - {date(r.statementTo)}
                      </td>
                      <td>{money(r.erpBalance)}</td>
                      <td>{money(r.statementBalance)}</td>
                      <td className={Number(r.difference) ? "text-red-600" : "text-green-700"}>
                        {money(r.difference)}
                      </td>
                      <td>{r.status.replaceAll("_", " ")}</td>
                      <td>
                        <CheckCircle2 className="h-4 w-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {view === "cheques" && (
        <ChequeTable
          rows={cheques.data ?? []}
          loading={cheques.isLoading}
          error={cheques.isError}
          retry={() => cheques.refetch()}
        />
      )}
      {modal && (
        <Modal
          title={
            modal === "account" || modal === "account-edit"
              ? modal === "account-edit"
                ? "Edit Bank Account"
                : "Add Bank Account"
              : modal === "cash"
                ? "Adjust Main Cash"
                : modal === "petty"
                  ? "Adjust Petty Cash"
                  : modal === "replenish"
                    ? "Replenish Petty Cash"
                    : modal === "transfer"
                      ? "New Fund Transfer"
                      : modal === "recon"
                        ? "Start Reconciliation"
                        : "Add Cheque"
          }
          onClose={() => setModal(null)}
          onSave={save}
          wide={modal === "account" || modal === "account-edit"}
          compact={modal === "transfer" || modal === "cash" || modal === "petty"}
          subtitle={
            modal === "transfer"
              ? "Move money between your cash and bank accounts."
              : modal === "cash" || modal === "petty"
                ? "Add or reduce the physical cash balance with a clear reason."
                : undefined
          }
          saveLabel={modal === "transfer" ? "Save Transfer" : modal === "cash" || modal === "petty" ? "Save Adjustment" : undefined}
          busy={[
            createAccount,
            updateAccount,
            deleteAccount,
            createCash,
            createPetty,
            replenish,
            createTransfer,
            createRecon,
            createCheque,
          ].some((m) => m.isPending)}
        >
          {(modal === "account" || modal === "account-edit") && (
            <>
              {val("accountName", "Account Display Name")}
              {modal === "account" && val("amount", "Opening Balance", "number")}
              {modal === "account" && val("date", "As of Date", "date")}
              {modal === "account-edit" && val("currentBalance", "Current Balance", "number")}
              {modal === "account-edit" &&
                sel("status", "Status", [
                  ["Active", "Active"],
                  ["Inactive", "Inactive"],
                ])}
              {val("bankName", "Bank Name")}
              {val("accountNumber", "Account Number")}
              {val("branch", "Branch Name")}
              {val("routingNumber", "Routing Number", "text", false)}
              {sel(
                "bankAccountType",
                "Account Type",
                ["Current", "Savings", "SND", "OD", "Loan", "Other"].map((v) => [v, v]),
              )}
              {form.bankAccountType === "OD" && val("emiDate", "EMI Date", "date", false)}
              {notes("remarks", "Notes")}
            </>
          )}
          {modal === "cash" && (
            <>
              <div className="flex gap-5 text-[12px] font-medium text-biz-navy sm:col-span-2">
                {([[
                  "IN",
                  "Add Cash",
                ], ["OUT", "Reduce Cash"]] as const).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="cashDirection"
                      checked={form.direction === value}
                      onChange={() => {
                        setValue("direction", value);
                        setValue("category", "");
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {val("amount", "Amount", "number")}
              {val("date", "Adjustment Date", "date")}
              {sel(
                "category",
                "Reason / Purpose",
                (form.direction === "OUT"
                  ? [
                      "Office Expense",
                      "Supplier Payment",
                      "Staff Advance",
                      "Owner Withdrawal",
                      "Other Cash Out",
                    ]
                  : [
                      "Owner Investment",
                      "Cash Sale",
                      "Customer Payment",
                      "Refund Received",
                      "Other Cash In",
                    ]
                ).map((value) => [value, value]),
              )}
              {val("party", form.direction === "OUT" ? "Paid To" : "Received From")}
              {val("referenceNo", "Reference", "text", false, "sm:col-span-2")}
              {notes("description", "Description", "sm:col-span-2 lg:col-span-2")}
            </>
          )}
          {modal === "petty" && (
            <>
              <div className="flex gap-5 text-[12px] font-medium text-biz-navy sm:col-span-2">
                {([[
                  "IN",
                  "Add Cash",
                ], ["OUT", "Reduce Cash"]] as const).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="pettyCashDirection"
                      checked={form.direction === value}
                      onChange={() => {
                        setValue("direction", value);
                        setValue("category", "");
                        setValue("fromAccountId", "");
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {val("amount", "Amount", "number")}
              {val("date", "Adjustment Date", "date")}
              {form.direction === "IN" ? (
                <>
                  {sel("fromAccountId", "Transfer From", pettyCashSources)}
                  {val("description", "Description", "text", false)}
                </>
              ) : (
                <>
                  {sel(
                    "category",
                    "Reason / Purpose",
                    [
                      "Tea & Refreshment",
                      "Local Transport",
                      "Stationery",
                      "Courier",
                      "Cleaning",
                      "Office Supplies",
                      "Minor Repair",
                      "Emergency Purchase",
                      "Miscellaneous",
                    ].map((value) => [value, value]),
                  )}
                  {val("party", "Paid To / Expense By")}
                  {val("description", "Description")}
                  {val("referenceNo", "Reference", "text", false)}
                </>
              )}
            </>
          )}
          {modal === "replenish" && (
            <>
              {val("date", "Date", "date")}
              {val("amount", "Amount (BDT)", "number")}
              {sel(
                "fromAccountId",
                "Transfer From",
                pettyCashSources,
              )}
              {val("description", "Remarks", "text", false)}
            </>
          )}
          {modal === "transfer" && (
            <>
              {sel("fromAccountId", "Transfer From", allAccounts)}
              {sel("toAccountId", "Transfer To", allAccounts)}
              {val("amount", "Amount", "number")}
              {val("date", "Transfer Date", "date")}
              {val("referenceNo", "Reference", "text", false, "sm:col-span-2")}
              {val("bankCharge", "Bank Charge (optional)", "number", false)}
              {notes("description", "Notes", "sm:col-span-2 lg:col-span-2")}
            </>
          )}
          {modal === "recon" && (
            <>
              {sel(
                "accountId",
                "Bank Account",
                bankAccounts.map((a) => [a.id, a.accountName]),
                false,
              )}
              {val("from", "Statement From", "date")}
              {val("to", "Statement To", "date")}
              {val("statementBalance", "Statement Closing Balance", "number")}
            </>
          )}
          {modal === "cheque" && (
            <>
              {sel("type", "Cheque Type", [
                ["RECEIVED", "Received"],
                ["ISSUED", "Issued"],
              ])}
              {val("chequeNo", "Cheque Number")}
              {val("date", "Cheque Date", "date")}
              {sel(
                "accountId",
                "Bank Account",
                bankAccounts.map((a) => [a.id, a.accountName]),
              )}
              {val("bankName", "Bank")}
              {val("branch", "Branch", "text", false)}
              {val("party", form.type === "ISSUED" ? "Payee" : "Received From")}
              {val("amount", "Amount (BDT)", "number")}
              {val("referenceNo", "Reference", "text", false)}
              {val("remarks", "Remarks", "text", false)}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function ChequeTable({
  rows,
  loading,
  error,
  retry,
}: {
  rows: ChequeRecord[];
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-white shadow-card">
      <State loading={loading} error={error} empty={!rows.length} retry={retry} />
      {!!rows.length && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-[11px]">
            <thead className="bg-[#f4f7fb]">
              <tr>
                {[
                  "SL",
                  "Cheque Date",
                  "Cheque No.",
                  "Type",
                  "Bank",
                  "Party",
                  "Reference",
                  "Amount",
                  "Deposit / Issue Date",
                  "Status",
                  "Action",
                ].map((h, i) => (
                  <th key={`${h}-${i}`} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <ChequeRow key={r.id} row={r} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function ChequeRow({ row, index }: { row: ChequeRecord; index: number }) {
  const update = useUpdateChequeStatus(row.id);
  return (
    <tr className="border-t">
      <td className="p-3">{index + 1}</td>
      <td>{date(row.chequeDate)}</td>
      <td className="font-semibold text-biz-blue">{row.chequeNo}</td>
      <td>{row.type}</td>
      <td>{row.bankName}</td>
      <td>{row.party}</td>
      <td>{row.referenceNo ?? "-"}</td>
      <td>{money(row.amount)}</td>
      <td>{row.actionDate ? date(row.actionDate) : "-"}</td>
      <td>{row.status}</td>
      <td>
        <select
          title="Update cheque status"
          className="rounded border p-1"
          value={row.status}
          onChange={(e) => update.mutate({ status: e.target.value, actionDate: today() })}
        >
          {["PENDING", "DEPOSITED", "CLEARED", "BOUNCED", "CANCELLED"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </td>
    </tr>
  );
}
