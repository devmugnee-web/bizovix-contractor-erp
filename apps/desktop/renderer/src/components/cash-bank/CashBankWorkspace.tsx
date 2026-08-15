"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Landmark,
  Plus,
  RefreshCw,
  Search,
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
  useFinancialAccounts,
  useFundTransfers,
  useReconciliations,
  useReplenishPettyCash,
  useUpdateChequeStatus,
} from "@bizovix/api-client";
import type { CashBankQuery, ChequeRecord, FinancialTransactionRecord } from "@bizovix/types";
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
const money = (v: unknown) =>
  `BDT ${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  onSave: () => void;
  busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-biz-navy/35 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">{children}</div>
        <div className="flex justify-end gap-2 border-t p-4">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={busy} onClick={onSave}>
            Save
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
              "Debit",
              "Credit",
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

export function CashBankWorkspace({ view }: { view: CashBankView }) {
  const [title, subtitle] = titles[view];
  useSetBreadcrumb([
    { label: "Cash & Bank", href: "/cash-bank" },
    ...(view === "overview" ? [] : [{ label: title }]),
  ]);
  const summary = useCashBankSummary(),
    accounts = useFinancialAccounts();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const q: CashBankQuery = { page, limit: 10, search };
  const ledger = useCashLedger(
    view === "petty-cash" ? "petty-cash" : view === "transactions" ? "transactions" : "main-cash",
    q,
  );
  const transfers = useFundTransfers(q);
  const recons = useReconciliations();
  const cheques = useCheques();
  const createAccount = useCreateBankAccount(),
    createCash = useCreateMainCash(),
    createPetty = useCreatePettyExpense(),
    replenish = useReplenishPettyCash(),
    createTransfer = useCreateFundTransfer(),
    createRecon = useCreateReconciliation(),
    createCheque = useCreateCheque();
  const [modal, setModal] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState("");
  const [form, setForm] = React.useState<Record<string, string>>({});
  const open = (kind: string, defaults: Record<string, string> = {}) => {
    setForm({ date: today(), amount: "", ...defaults });
    setModal(kind);
  };
  const val = (name: string, label: string, type = "text", required = true) => (
    <label className="text-[11px] font-semibold">
      {label}
      {required && <b className="text-red-500"> *</b>}
      <input
        className={cn(field, "mt-2 w-full")}
        type={type}
        value={form[name] ?? ""}
        onChange={(e) => setForm((v) => ({ ...v, [name]: e.target.value }))}
      />
    </label>
  );
  const sel = (name: string, label: string, opts: Array<[string, string]>) => (
    <label className="text-[11px] font-semibold">
      {label}
      <select
        className={cn(field, "mt-2 w-full")}
        value={form[name] ?? ""}
        onChange={(e) => setForm((v) => ({ ...v, [name]: e.target.value }))}
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
      if (!form.amount && modal !== "recon") throw new Error();
      const amount = Number(form.amount);
      if (modal !== "recon" && amount <= 0) throw new Error();
      if (modal === "account")
        await createAccount.mutateAsync({
          bankName: form.bankName,
          accountName: form.accountName,
          accountNumber: form.accountNumber,
          branch: form.branch,
          routingNumber: form.routingNumber,
          bankAccountType: form.bankAccountType,
          openingBalance: amount,
          openingBalanceDate: form.date,
          currency: "BDT",
          remarks: form.remarks,
          status: "Active",
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
      if (modal === "petty")
        await createPetty.mutateAsync({
          transactionDate: form.date,
          amount,
          category: form.category,
          party: form.party,
          description: form.description,
          referenceNo: form.referenceNo,
        });
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
      setNotice("Saved successfully.");
      setTimeout(() => setNotice(""), 2500);
    } catch {
      setNotice("Complete all required fields with a valid amount.");
    }
  }
  const bankAccounts = (accounts.data ?? []).filter((a) => a.accountType === "BANK");
  const allAccounts = (accounts.data ?? []).map(
    (a) =>
      [a.id, `${a.accountName}${a.accountNumber ? ` (${a.accountNumber})` : ""}`] as [
        string,
        string,
      ],
  );
  const action =
    view === "main-cash"
      ? ["Add Cash Transaction", "cash"]
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
  const ledgerIn = (ledger.data?.items ?? []).filter((row) => row.direction === "IN").reduce((sum, row) => sum + Number(row.amount), 0);
  const ledgerOut = (ledger.data?.items ?? []).filter((row) => row.direction === "OUT").reduce((sum, row) => sum + Number(row.amount), 0);
  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <div className="fixed right-5 top-16 z-[60] rounded bg-biz-navy px-4 py-2 text-[12px] text-white">
          {notice}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-page-title text-biz-text">{title}</h1>
          <p className="mt-1 text-[13px] text-biz-muted">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          {view === "petty-cash" && (
            <SecondaryButton onClick={() => open("replenish")}>
              <RefreshCw className="h-4 w-4" />
              Replenish
            </SecondaryButton>
          )}
          {action && (
            <PrimaryButton onClick={() => open(action[1]!)}>
              <Plus className="h-4 w-4" />
              {action[0]}
            </PrimaryButton>
          )}
        </div>
      </div>
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
        <>
          <Kpis
            items={[
              ["Total Bank Accounts", bankAccounts.length, "text-blue-600"],
              ["Active Accounts", bankAccounts.filter((a) => a.isActive).length, "text-green-700"],
              ["Total Bank Balance", summary.data?.totalBankBalance, "text-green-700"],
              [
                "Loan / OD Balance",
                bankAccounts
                  .filter((a) => ["Loan", "OD"].includes(a.bankAccountType ?? ""))
                  .reduce((n, a) => n + Number(a.currentBalance), 0),
                "text-orange-600",
              ],
            ]}
          />
          <section className="overflow-hidden rounded-lg border bg-white shadow-card">
            <State
              loading={accounts.isLoading}
              error={accounts.isError}
              empty={!bankAccounts.length}
              retry={() => accounts.refetch()}
            />
            {!!bankAccounts.length && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-[11px]">
                  <thead className="bg-[#f4f7fb]">
                    <tr>
                      {[
                        "SL",
                        "Bank",
                        "Account Name",
                        "Account Number",
                        "Branch",
                        "Account Type",
                        "Current Balance",
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
                    {bankAccounts.map((a, i) => (
                      <tr key={a.id} className="border-t">
                        <td className="p-3">{i + 1}</td>
                        <td>{a.bankName}</td>
                        <td className="font-semibold">{a.accountName}</td>
                        <td>{a.accountNumber}</td>
                        <td>{a.branch}</td>
                        <td>{a.bankAccountType}</td>
                        <td className="font-semibold">{money(a.currentBalance)}</td>
                        <td>
                          <span className={a.isActive ? "text-green-700" : "text-red-600"}>
                            {a.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <button title="View details" className="rounded border p-1.5">
                            <Search className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {(view === "main-cash" || view === "petty-cash" || view === "transactions") && (
        <>
          <Kpis
            items={
              view === "transactions"
                ? [
                    ["Total Cash In", ledgerIn, "text-green-700"],
                    ["Total Cash Out", ledgerOut, "text-red-600"],
                    [
                      "Net Movement",
                      ledgerIn - ledgerOut,
                      "text-blue-600",
                    ],
                    ["Total Entries", ledger.data?.meta.total, "text-biz-text"],
                  ]
                : [
                    ["Opening Balance", 0, "text-biz-text"],
                    ["Cash In", ledgerIn, "text-green-700"],
                    ["Cash Out", ledgerOut, "text-red-600"],
                    [
                      "Current Balance",
                      view === "main-cash"
                        ? summary.data?.mainCashBalance
                        : summary.data?.pettyCashBalance,
                      "text-blue-600",
                    ],
                  ]
            }
          />
          <section className="overflow-hidden rounded-lg border bg-white shadow-card">
            <div className="flex items-center justify-between p-4">
              <h2 className="font-bold">Transaction History</h2>
              <TextInput
                icon={Search}
                placeholder="Search transactions..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
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
            {!!ledger.data?.items.length && <LedgerTable rows={ledger.data.items} />}
          </section>
        </>
      )}
      {view === "transfers" && (
        <section className="overflow-hidden rounded-lg border bg-white shadow-card">
          <State
            loading={transfers.isLoading}
            error={transfers.isError}
            empty={!transfers.data?.items.length}
            retry={() => transfers.refetch()}
          />
          {!!transfers.data?.items.length && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-[11px]">
                <thead className="bg-[#f4f7fb]">
                  <tr>
                    {[
                      "SL",
                      "Date",
                      "Transfer No.",
                      "Transfer From",
                      "Transfer To",
                      "Amount",
                      "Bank Charge",
                      "Reference",
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
                  {transfers.data.items.map((r, i) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">{i + 1}</td>
                      <td>{date(r.transferDate)}</td>
                      <td className="text-biz-blue">{r.transferNo}</td>
                      <td>{r.fromAccount.accountName}</td>
                      <td>{r.toAccount.accountName}</td>
                      <td>{money(r.amount)}</td>
                      <td>{money(r.bankCharge)}</td>
                      <td>{r.referenceNo ?? "-"}</td>
                      <td className="text-green-700">{r.status}</td>
                      <td>
                        <ArrowRightLeft className="h-4 w-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
            modal === "account"
              ? "Add Bank Account"
              : modal === "cash"
                ? "Add Main Cash Transaction"
                : modal === "petty"
                  ? "Add Petty Cash Expense"
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
          busy={[
            createAccount,
            createCash,
            createPetty,
            replenish,
            createTransfer,
            createRecon,
            createCheque,
          ].some((m) => m.isPending)}
        >
          {modal === "account" && (
            <>
              {val("bankName", "Bank Name")}
              {val("accountName", "Account Name")}
              {val("accountNumber", "Account Number")}
              {val("branch", "Branch")}
              {val("routingNumber", "Routing Number", "text", false)}
              {sel(
                "bankAccountType",
                "Account Type",
                ["Current", "Savings", "SND", "OD", "Loan", "Other"].map((v) => [v, v]),
              )}
              {val("amount", "Opening Balance", "number")}
              {val("date", "Opening Balance Date", "date")}
              {val("remarks", "Remarks", "text", false)}
            </>
          )}
          {modal === "cash" && (
            <>
              {sel("direction", "Transaction Type", [
                ["IN", "Cash In"],
                ["OUT", "Cash Out"],
              ])}
              {val("date", "Transaction Date", "date")}
              {val("amount", "Amount (BDT)", "number")}
              {val("category", "Category")}
              {val("party", "Received From / Paid To")}
              {val("referenceType", "Reference Type", "text", false)}
              {val("referenceNo", "Reference No.", "text", false)}
              {val("description", "Description / Remarks", "text", false)}
            </>
          )}
          {modal === "petty" && (
            <>
              {val("date", "Expense Date", "date")}
              {val("amount", "Amount (BDT)", "number")}
              {sel(
                "category",
                "Category",
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
                ].map((v) => [v, v]),
              )}
              {val("party", "Expense By")}
              {val("description", "Description")}
              {val("referenceNo", "Reference", "text", false)}
            </>
          )}
          {modal === "replenish" && (
            <>
              {val("date", "Date", "date")}
              {val("amount", "Amount (BDT)", "number")}
              {sel(
                "fromAccountId",
                "Transfer From",
                allAccounts.filter(([id]) => !id.endsWith(":Petty Cash")),
              )}
              {val("description", "Remarks", "text", false)}
            </>
          )}
          {modal === "transfer" && (
            <>
              {val("date", "Transfer Date", "date")}
              {sel("fromAccountId", "Transfer From", allAccounts)}
              {sel("toAccountId", "Transfer To", allAccounts)}
              {val("amount", "Amount (BDT)", "number")}
              {val("bankCharge", "Bank Charge", "number", false)}
              {val("referenceNo", "Reference No.", "text", false)}
              {val("description", "Description / Remarks", "text", false)}
            </>
          )}
          {modal === "recon" && (
            <>
              {sel(
                "accountId",
                "Bank Account",
                bankAccounts.map((a) => [a.id, a.accountName]),
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
