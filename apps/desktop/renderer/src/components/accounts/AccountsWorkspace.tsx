"use client";
import * as React from "react";
import { BookOpen, Building2, Plus, RefreshCw, Search, WalletCards, X } from "lucide-react";
import {
  useAccountingSummary,
  useBankAccounts,
  useChartOfAccounts,
  useCmsWorks,
  useCreateJournal,
  useCreateLedgerAccount,
  useCreateOpeningBalance,
  useCreatePayable,
  useGeneralLedger,
  useJournals,
  useOpeningBalances,
  usePartyLedger,
  usePayPayable,
  usePayables,
  useProjectAccounts,
  useReceivables,
} from "@bizovix/api-client";
import type { AccountingQuery, JournalRecord, LedgerAccountRecord } from "@bizovix/types";
import { PrimaryButton, SecondaryButton, SelectInput, TextInput, cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
export type AccountsView =
  | "overview"
  | "chart"
  | "journals"
  | "ledger"
  | "receivables"
  | "payables"
  | "projects"
  | "party"
  | "openings";
const titles: Record<AccountsView, [string, string]> = {
  overview: [
    "Accounts",
    "Manage accounting, receivables, payables, ledgers and project financials.",
  ],
  chart: ["Chart of Accounts", "Manage the hierarchical accounting classification structure."],
  journals: ["Journal Entries", "Create balanced manual and adjustment accounting entries."],
  ledger: ["Account Activity", "Review every posted increase, decrease and balance by account."],
  receivables: ["Receivables", "Track project and organization amounts still receivable."],
  payables: ["Payables", "Track vendor, supplier and subcontractor liabilities."],
  projects: ["Project Accounts", "Analyze project-wise collections, cost and profitability."],
  party: ["Party Ledger", "Review customer, vendor and organization account history."],
  openings: ["Opening Balances", "Post balanced initial accounting balances."],
};
const money = (v: unknown) =>
  `BDT ${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString("en-GB") : "-");
const today = () => new Date().toISOString().slice(0, 10);
const normalBalanceForType = (accountType: string | undefined) =>
  ["ASSET", "EXPENSE"].includes(accountType ?? "") ? "DEBIT" : "CREDIT";
const isIncrease = (account: LedgerAccountRecord, debit: unknown, credit: unknown) =>
  account.normalBalance === "DEBIT" ? debit : credit;
const isDecrease = (account: LedgerAccountRecord, debit: unknown, credit: unknown) =>
  account.normalBalance === "DEBIT" ? credit : debit;
function Modal({
  title,
  onClose,
  onSave,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-biz-navy/35 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
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
        "grid gap-3 sm:grid-cols-2",
        items.length >= 5 ? "xl:grid-cols-5" : "xl:grid-cols-4",
      )}
    >
      {items.map(([label, value, tone]) => (
        <div key={label} className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
          <p className="text-[11px] font-semibold text-biz-muted">{label}</p>
          <p className={cn("mt-2 text-[18px] font-bold", tone)}>
            {typeof value === "number" && label.toLowerCase().includes("project")
              ? value
              : money(value)}
          </p>
        </div>
      ))}
    </div>
  );
}
function State({
  query,
  empty,
}: {
  query: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  empty: boolean;
}) {
  if (query.isLoading)
    return (
      <>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mx-4 my-3 h-8 animate-pulse bg-slate-100" />
        ))}
      </>
    );
  if (query.isError)
    return (
      <div className="p-12 text-center text-red-600">
        Unable to load accounting data.{" "}
        <button onClick={() => query.refetch()} className="font-semibold underline">
          Retry
        </button>
      </div>
    );
  if (empty)
    return <div className="p-14 text-center text-biz-muted">No accounting records found.</div>;
  return null;
}
const Head = ({ labels }: { labels: string[] }) => (
  <thead className="bg-[#f4f7fb] text-[10px]">
    <tr>
      {labels.map((h, i) => (
        <th key={`${h}-${i}`} className="px-3 py-3">
          {h}
        </th>
      ))}
    </tr>
  </thead>
);
export function AccountsWorkspace({ view }: { view: AccountsView }) {
  const [title, subtitle] = titles[view];
  useSetBreadcrumb([
    { label: "Accounts", href: "/accounts" },
    ...(view === "overview" ? [] : [{ label: title }]),
  ]);
  const [page, setPage] = React.useState(1),
    [search, setSearch] = React.useState(""),
    [accountId, setAccountId] = React.useState(""),
    [projectId, setProjectId] = React.useState(""),
    [party, setParty] = React.useState("");
  const q: AccountingQuery = { page, limit: 10, search, accountId, projectId, party };
  const summary = useAccountingSummary(),
    chart = useChartOfAccounts(),
    journals = useJournals(q),
    ledger = useGeneralLedger(q),
    receivables = useReceivables(q),
    payables = usePayables(q),
    projects = useProjectAccounts(q),
    partyLedger = usePartyLedger(q),
    openings = useOpeningBalances(q),
    works = useCmsWorks({ page: 1, limit: 100, status: "ONGOING" }),
    bankAccounts = useBankAccounts();
  const createAccount = useCreateLedgerAccount(),
    createJournal = useCreateJournal(),
    createPayable = useCreatePayable(),
    createOpening = useCreateOpeningBalance();
  const [modal, setModal] = React.useState<string | null>(null),
    [selectedPayable, setSelectedPayable] = React.useState(""),
    [notice, setNotice] = React.useState(""),
    [form, setForm] = React.useState<Record<string, string>>({}),
    [lines, setLines] = React.useState([
      { accountId: "", debit: "", credit: "", description: "" },
      { accountId: "", debit: "", credit: "", description: "" },
    ]);
  const payPayable = usePayPayable(selectedPayable);
  const open = (m: string) => {
    setForm({ date: today(), post: "true" });
    setLines([
      { accountId: "", debit: "", credit: "", description: "" },
      { accountId: "", debit: "", credit: "", description: "" },
    ]);
    setModal(m);
  };
  const input = (name: string, label: string, type = "text") => (
    <label className="text-[11px] font-semibold">
      {label}
      <input
        className="mt-1 h-10 w-full rounded-md border px-3 text-[12px]"
        type={type}
        value={form[name] ?? ""}
        onChange={(e) => setForm((v) => ({ ...v, [name]: e.target.value }))}
      />
    </label>
  );
  const select = (name: string, label: string, opts: Array<[string, string]>) => (
    <label className="text-[11px] font-semibold">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-md border px-3 text-[12px]"
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
      if (modal === "account")
        await createAccount.mutateAsync({
          code: form.code,
          name: form.name,
          parentId: form.parentId || undefined,
          accountType: form.accountType,
          normalBalance: normalBalanceForType(form.accountType),
          description: form.description,
          isActive: true,
        });
      if (modal === "journal" || modal === "opening") {
        const journalLines = lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: l.description,
        }));
        if (
          journalLines.some(
            (line) =>
              !line.accountId ||
              (line.debit <= 0 && line.credit <= 0) ||
              (line.debit > 0 && line.credit > 0),
          )
        ) {
          setNotice("Select an account and enter either an increase or a decrease on every line.");
          return;
        }
        const difference = journalLines.reduce(
          (total, line) => total + line.debit - line.credit,
          0,
        );
        if (Math.abs(difference) >= 0.005) {
          setNotice("The entry is not balanced yet. Adjust the increase or decrease amounts.");
          return;
        }
        if (modal === "journal")
          await createJournal.mutateAsync({
            journalDate: form.date!,
            referenceNo: form.referenceNo,
            description: form.description!,
            post: form.post === "true",
            lines: journalLines,
          });
        else
          await createOpening.mutateAsync({
            openingDate: form.date!,
            referenceNo: form.referenceNo,
            description: form.description!,
            lines: journalLines,
          });
      }
      if (modal === "payable")
        await createPayable.mutateAsync({
          partyName: form.partyName,
          partyType: form.partyType || "VENDOR",
          projectId: form.projectId || undefined,
          billNo: form.billNo,
          billDate: form.date,
          amount: Number(form.amount),
          dueDate: form.dueDate || undefined,
          description: form.description,
        });
      if (modal === "payment")
        await payPayable.mutateAsync({
          accountId: form.accountId,
          amount: Number(form.amount),
          paymentDate: form.date,
          referenceNo: form.referenceNo,
        });
      setModal(null);
      setNotice("Saved successfully.");
      setTimeout(() => setNotice(""), 2500);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save accounting record.";
      setNotice(
        /\b(debit|credit)\b/i.test(message)
          ? "The entry could not be saved. Check that every line has one amount and the entry is balanced."
          : message,
      );
    }
  }
  const accountOpts = (chart.data ?? [])
      .filter((a) => a.isActive)
      .map((a) => [a.id, `${a.code} - ${a.name}`] as [string, string]),
    projectOpts = (works.data?.items ?? []).map((w) => [w.id, w.workName] as [string, string]);
  const action =
    view === "chart"
      ? ["Add Account", "account"]
      : view === "journals"
        ? ["New Journal Entry", "journal"]
        : view === "payables"
          ? ["Add Payable", "payable"]
          : view === "openings"
            ? ["Add Opening Balance", "opening"]
            : null;
  const commonFilter = (
    <section className="rounded-lg border bg-white p-4 shadow-card">
      <div className="grid items-end gap-3 md:grid-cols-4">
        <TextInput
          icon={Search}
          placeholder="Search..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <SelectInput
          placeholder="All Accounts"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={(chart.data ?? []).map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))}
        />
        <SelectInput
          placeholder="All Projects"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          options={(works.data?.items ?? []).map((w) => ({ value: w.id, label: w.workName }))}
        />
        <SecondaryButton
          onClick={() => {
            setSearch("");
            setAccountId("");
            setProjectId("");
            setParty("");
            setPage(1);
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Clear Filters
        </SecondaryButton>
      </div>
    </section>
  );
  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <div className="fixed right-5 top-16 z-[60] rounded bg-biz-navy px-4 py-2 text-[12px] text-white">
          {notice}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-page-title">{title}</h1>
          <p className="mt-1 text-[13px] text-biz-muted">{subtitle}</p>
        </div>
        {action && (
          <PrimaryButton onClick={() => open(action[1]!)}>
            <Plus className="h-4 w-4" />
            {action[0]}
          </PrimaryButton>
        )}
      </div>
      {view === "overview" && (
        <>
          <Kpis
            items={[
              ["Total Receivable", summary.data?.totalReceivable, "text-blue-600"],
              ["Total Payable", summary.data?.totalPayable, "text-red-600"],
              ["This Month Income", summary.data?.thisMonthIncome, "text-green-700"],
              ["This Month Expense", summary.data?.thisMonthExpense, "text-orange-600"],
              ["Net Financial Position", summary.data?.netFinancialPosition, "text-purple-600"],
            ]}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-lg border bg-white p-4 shadow-card">
              <h2 className="font-bold">Receivable Aging</h2>
              {[
                ["Current", receivables.data?.summary?.current],
                ["Overdue", receivables.data?.summary?.overdue],
                ["Outstanding Projects", summary.data?.outstandingProjects],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between border-b py-3 text-[12px]">
                  <span>{l}</span>
                  <b>{l === "Outstanding Projects" ? String(v ?? 0) : money(v)}</b>
                </div>
              ))}
            </section>
            <section className="rounded-lg border bg-white p-4 shadow-card">
              <h2 className="font-bold">Recent Journal Entries</h2>
              {(summary.data?.recentJournals ?? []).map((j) => (
                <div key={j.id} className="flex justify-between border-b py-3 text-[12px]">
                  <span>
                    <b>{j.journalNo}</b>
                    <small className="block text-biz-muted">{j.description}</small>
                  </span>
                  <span>{j.status}</span>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
      {view !== "overview" && view !== "chart" && commonFilter}
      {view === "chart" && (
        <section className="overflow-hidden rounded-lg border bg-white shadow-card">
          <State query={chart} empty={!chart.data?.length} />
          {!!chart.data?.length && (
            <table className="w-full text-left text-[11px]">
              <Head labels={["Code", "Account Name", "Type", "Status", "System", "Transactions"]} />
              <tbody>
                {chart.data.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-3 font-semibold text-biz-blue">{a.code}</td>
                    <td className="px-3" style={{ paddingLeft: `${12 + (a.parentId ? 18 : 0)}px` }}>
                      {a.parentId ? "- " : ""}
                      {a.name}
                    </td>
                    <td>{a.accountType}</td>
                    <td className={a.isActive ? "text-green-700" : "text-red-600"}>
                      {a.isActive ? "Active" : "Inactive"}
                    </td>
                    <td>{a.isSystem ? "System" : "Custom"}</td>
                    <td>{a._count?.journalLines ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {view === "journals" && <JournalTable rows={journals.data?.items ?? []} query={journals} />}{" "}
      {view === "openings" && <JournalTable rows={openings.data?.items ?? []} query={openings} />}
      {view === "ledger" && (
        <>
          <Kpis
            items={[
              ["Opening Balance", ledger.data?.summary?.openingBalance, "text-biz-text"],
              [
                "Total Movement",
                Number(ledger.data?.summary?.totalDebit ?? 0) +
                  Number(ledger.data?.summary?.totalCredit ?? 0),
                "text-green-700",
              ],
              ["Closing Balance", ledger.data?.summary?.closingBalance, "text-blue-600"],
            ]}
          />
          <section className="overflow-hidden rounded-lg border bg-white shadow-card">
            <State query={ledger} empty={!ledger.data?.items.length} />
            {!!ledger.data?.items.length && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-[11px]">
                  <Head
                    labels={[
                      "Date",
                      "Voucher / Journal No.",
                      "Account",
                      "Reference",
                      "Description",
                      "Source",
                      "Increase",
                      "Decrease",
                      "Running Balance",
                    ]}
                  />
                  <tbody>
                    {ledger.data.items.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="p-3">{date(l.journalEntry.journalDate)}</td>
                        <td className="text-biz-blue">{l.journalEntry.journalNo}</td>
                        <td>{l.account.name}</td>
                        <td>{l.journalEntry.referenceNo ?? "-"}</td>
                        <td>{l.description ?? l.journalEntry.description}</td>
                        <td>{l.journalEntry.sourceModule}</td>
                        <td>{money(isIncrease(l.account, l.debit, l.credit))}</td>
                        <td>{money(isDecrease(l.account, l.debit, l.credit))}</td>
                        <td className="font-semibold">{money(l.runningBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {view === "receivables" && (
        <>
          <Kpis
            items={[
              ["Total Receivable", receivables.data?.summary?.totalReceivable, "text-blue-600"],
              ["Current", receivables.data?.summary?.current, "text-green-700"],
              ["Overdue", receivables.data?.summary?.overdue, "text-red-600"],
              ["Projects Outstanding", receivables.data?.summary?.projects, "text-orange-600"],
            ]}
          />
          <section className="overflow-hidden rounded-lg border bg-white shadow-card">
            <State query={receivables} empty={!receivables.data?.items.length} />
            {!!receivables.data?.items.length && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-[11px]">
                  <Head
                    labels={[
                      "SL",
                      "Project",
                      "Organization",
                      "Contract Value",
                      "Total Received",
                      "Outstanding",
                      "Due Date",
                      "Overdue Days",
                      "Status",
                    ]}
                  />
                  <tbody>
                    {receivables.data.items.map((r, i) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-3">{i + 1}</td>
                        <td className="font-semibold">{r.project}</td>
                        <td>{r.organization}</td>
                        <td>{money(r.contractValue)}</td>
                        <td>{money(r.totalReceived)}</td>
                        <td className="font-semibold text-red-600">{money(r.outstanding)}</td>
                        <td>{date(r.dueDate)}</td>
                        <td>{r.overdueDays}</td>
                        <td>{r.status.replaceAll("_", " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {view === "payables" && (
        <>
          <Kpis
            items={[
              ["Total Payable", payables.data?.summary?.totalPayable, "text-red-600"],
              ["Due This Week", 0, "text-orange-600"],
              ["Overdue", 0, "text-red-600"],
              ["Paid This Month", 0, "text-green-700"],
            ]}
          />
          <section className="overflow-hidden rounded-lg border bg-white shadow-card">
            <State query={payables} empty={!payables.data?.items.length} />
            {!!payables.data?.items.length && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left text-[11px]">
                  <Head
                    labels={[
                      "SL",
                      "Party",
                      "Project",
                      "Bill No.",
                      "Bill Date",
                      "Amount",
                      "Paid",
                      "Outstanding",
                      "Due Date",
                      "Status",
                      "Action",
                    ]}
                  />
                  <tbody>
                    {payables.data.items.map((r, i) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-3">{i + 1}</td>
                        <td>{r.partyName}</td>
                        <td>{r.project?.workName ?? "-"}</td>
                        <td className="text-biz-blue">{r.billNo}</td>
                        <td>{date(r.billDate)}</td>
                        <td>{money(r.amount)}</td>
                        <td>{money(r.paidAmount)}</td>
                        <td>{money(Number(r.amount) - Number(r.paidAmount))}</td>
                        <td>{date(r.dueDate)}</td>
                        <td>{r.status.replaceAll("_", " ")}</td>
                        <td>
                          {r.status !== "PAID" && (
                            <button
                              className="rounded border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-600"
                              onClick={() => {
                                setSelectedPayable(r.id);
                                setForm({
                                  date: today(),
                                  amount: String(Number(r.amount) - Number(r.paidAmount)),
                                  accountId: "",
                                  referenceNo: r.billNo,
                                });
                                setModal("payment");
                              }}
                            >
                              Pay
                            </button>
                          )}
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
      {view === "projects" && (
        <section className="overflow-hidden rounded-lg border bg-white shadow-card">
          <State query={projects} empty={!projects.data?.length} />
          {!!projects.data?.length && (
            <>
              <div className="grid gap-3 p-3 sm:grid-cols-2 xl:hidden">
                {projects.data.map((r) => {
                  const financialCharges =
                    Number(r.tenderSecurityCost) +
                    Number(r.creditCommitmentCost) +
                    Number(r.pgBgCost) +
                    Number(r.bankCharges) +
                    Number(r.otherCosts);
                  return (
                    <article key={r.id} className="min-w-0 rounded-lg border border-biz-border bg-white p-4 shadow-sm">
                      <h3
                        className="line-clamp-2 cursor-help break-words text-[13px] font-bold leading-5 text-biz-navy"
                        title={r.project}
                      >
                        {r.project}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-biz-muted" title={r.organization}>
                        {r.organization}
                      </p>
                      <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-1 text-[9px] font-semibold text-biz-blue">
                        {r.category}
                      </span>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-biz-border pt-3 text-[10px]">
                        {[
                          ["Contract Value", money(r.contractValue)],
                          ["Received", money(r.totalReceived)],
                          ["Outstanding", money(r.outstanding)],
                          ["Project Expense", money(r.projectExpense)],
                          ["Financial Charges", money(financialCharges)],
                          ["Total Cost", money(r.totalCost)],
                          ["Estimated Profit", money(r.estimatedProfit)],
                          ["Margin", `${Number(r.profitMargin).toFixed(2)}%`],
                        ].map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <dt className="text-[9px] text-biz-muted">{label}</dt>
                            <dd className={cn("mt-0.5 break-words font-semibold tabular-nums text-biz-navy", label === "Estimated Profit" && "text-green-700")}>
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  );
                })}
              </div>
              <div className="hidden xl:block">
              <table className="w-full table-fixed text-left text-[9px]">
                <colgroup>
                  <col className="w-[20%]" />
                  <col className="w-[12%]" />
                  <col className="w-[6%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[7%]" />
                  <col className="w-[8%]" />
                  <col className="w-[5%]" />
                </colgroup>
                <Head
                  labels={[
                    "Project",
                    "Organization",
                    "Category",
                    "Contract Value",
                    "Received",
                    "Outstanding",
                    "Project Expense",
                    "Financial Charges",
                    "Total Cost",
                    "Estimated Profit",
                    "Margin",
                  ]}
                />
                <tbody>
                  {projects.data.map((r) => (
                    <tr key={r.id} className="border-t border-biz-border align-top hover:bg-blue-50/30">
                      <td className="px-2 py-3 font-semibold">
                        <p className="line-clamp-2 cursor-help break-words leading-4" title={r.project}>{r.project}</p>
                      </td>
                      <td className="break-words px-2 py-3 leading-4">{r.organization}</td>
                      <td className="break-words px-2 py-3">{r.category}</td>
                      <td className="break-words px-2 py-3 tabular-nums">{money(r.contractValue)}</td>
                      <td className="break-words px-2 py-3 tabular-nums">{money(r.totalReceived)}</td>
                      <td className="break-words px-2 py-3 tabular-nums">{money(r.outstanding)}</td>
                      <td className="break-words px-2 py-3 tabular-nums">{money(r.projectExpense)}</td>
                      <td className="break-words px-2 py-3 tabular-nums">
                        {money(
                          Number(r.tenderSecurityCost) +
                            Number(r.creditCommitmentCost) +
                            Number(r.pgBgCost) +
                            Number(r.bankCharges) +
                            Number(r.otherCosts),
                        )}
                      </td>
                      <td className="break-words px-2 py-3 tabular-nums">{money(r.totalCost)}</td>
                      <td className="break-words px-2 py-3 font-semibold tabular-nums text-green-700">{money(r.estimatedProfit)}</td>
                      <td className="px-2 py-3 tabular-nums">{Number(r.profitMargin).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </section>
      )}
      {view === "party" && (
        <>
          <section className="rounded-lg border bg-white p-4">
            <TextInput
              placeholder="Enter exact party name..."
              value={party}
              onChange={(e) => setParty(e.target.value)}
            />
          </section>
          <section className="overflow-hidden rounded-lg border bg-white shadow-card">
            <State query={partyLedger} empty={!partyLedger.data?.items.length} />
            {!!partyLedger.data?.items.length && (
              <table className="w-full text-left text-[11px]">
                <Head
                  labels={[
                    "Date",
                    "Reference",
                    "Source",
                    "Description",
                    "Increase",
                    "Decrease",
                    "Running Balance",
                  ]}
                />
                <tbody>
                  {partyLedger.data.items.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-3">{date(l.journalEntry.journalDate)}</td>
                      <td>{l.journalEntry.referenceNo}</td>
                      <td>{l.journalEntry.sourceModule}</td>
                      <td>{l.description ?? l.journalEntry.description}</td>
                      <td>{money(isIncrease(l.account, l.debit, l.credit))}</td>
                      <td>{money(isDecrease(l.account, l.debit, l.credit))}</td>
                      <td>{money(l.runningBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
      {modal && (
        <Modal
          title={
            modal === "account"
              ? "Add Ledger Account"
              : modal === "journal"
                ? "New Journal Entry"
                : modal === "payable"
                  ? "Add Payable"
                  : modal === "payment"
                    ? "Pay Outstanding Bill"
                    : "Post Opening Balances"
          }
          onClose={() => setModal(null)}
          onSave={save}
          busy={[createAccount, createJournal, createPayable, createOpening, payPayable].some(
            (m) => m.isPending,
          )}
        >
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {modal === "account" && (
              <>
                {input("code", "Account Code")}
                {input("name", "Account Name")}
                {select("parentId", "Parent Account", accountOpts)}
                {select(
                  "accountType",
                  "Account Type",
                  ["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"].map((v) => [v, v]),
                )}
                {input("description", "Description")}
              </>
            )}
            {modal === "payable" && (
              <>
                {input("partyName", "Party")}
                {select(
                  "partyType",
                  "Party Type",
                  ["SUPPLIER", "VENDOR", "SUBCONTRACTOR", "OTHER"].map((v) => [v, v]),
                )}
                {select("projectId", "Project", projectOpts)}
                {input("billNo", "Bill No.")}
                {input("date", "Bill Date", "date")}
                {input("amount", "Amount", "number")}
                {input("dueDate", "Due Date", "date")}
                {input("description", "Description")}
              </>
            )}
            {modal === "payment" && (
              <>
                {select(
                  "accountId",
                  "Pay From",
                  (bankAccounts.data ?? []).map((a) => [a.id, a.accountName]),
                )}
                {input("amount", "Payment Amount", "number")}
                {input("date", "Payment Date", "date")}
                {input("referenceNo", "Reference")}
              </>
            )}
            {(modal === "journal" || modal === "opening") && (
              <>
                {input("date", modal === "opening" ? "Opening Date" : "Journal Date", "date")}
                {input("referenceNo", "Reference")}
                {input("description", "Description")}{" "}
                {modal === "journal" &&
                  select("post", "Status", [
                    ["false", "Save as Draft"],
                    ["true", "Post Journal"],
                  ])}
              </>
            )}
          </div>
          {(modal === "journal" || modal === "opening") && (
            <div className="px-5 pb-5">
              <div className="mb-2 grid grid-cols-[1.8fr_1fr_1fr_2fr_32px] gap-2 text-[10px] font-semibold">
                <span>Account</span>
                <span>Increase</span>
                <span>Decrease</span>
                <span>Description</span>
                <span />
              </div>
              {lines.map((l, i) => {
                const selectedAccount = chart.data?.find((account) => account.id === l.accountId);
                const increasesOnDebit = selectedAccount?.normalBalance !== "CREDIT";
                const increaseValue = increasesOnDebit ? l.debit : l.credit;
                const decreaseValue = increasesOnDebit ? l.credit : l.debit;
                return (
                  <div key={i} className="mb-2 grid grid-cols-[1.8fr_1fr_1fr_2fr_32px] gap-2">
                    <select
                      title="Account"
                      className="h-9 rounded border px-2 text-[11px]"
                      value={l.accountId}
                      onChange={(e) =>
                        setLines((v) =>
                          v.map((x, j) => (j === i ? { ...x, accountId: e.target.value } : x)),
                        )
                      }
                    >
                      <option value="">Select account</option>
                      {accountOpts.map(([v, n]) => (
                        <option key={v} value={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <input
                      title="Increase"
                      className="h-9 rounded border px-2 text-[11px]"
                      type="number"
                      value={increaseValue}
                      onChange={(e) =>
                        setLines((v) =>
                          v.map((x, j) =>
                            j === i
                              ? increasesOnDebit
                                ? {
                                    ...x,
                                    debit: e.target.value,
                                    credit: e.target.value ? "" : x.credit,
                                  }
                                : {
                                    ...x,
                                    credit: e.target.value,
                                    debit: e.target.value ? "" : x.debit,
                                  }
                              : x,
                          ),
                        )
                      }
                    />
                    <input
                      title="Decrease"
                      className="h-9 rounded border px-2 text-[11px]"
                      type="number"
                      value={decreaseValue}
                      onChange={(e) =>
                        setLines((v) =>
                          v.map((x, j) =>
                            j === i
                              ? increasesOnDebit
                                ? {
                                    ...x,
                                    credit: e.target.value,
                                    debit: e.target.value ? "" : x.debit,
                                  }
                                : {
                                    ...x,
                                    debit: e.target.value,
                                    credit: e.target.value ? "" : x.credit,
                                  }
                              : x,
                          ),
                        )
                      }
                    />
                    <input
                      title="Line description"
                      className="h-9 rounded border px-2 text-[11px]"
                      value={l.description}
                      onChange={(e) =>
                        setLines((v) =>
                          v.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                        )
                      }
                    />
                    <button
                      title="Remove line"
                      onClick={() => setLines((v) => v.filter((_, j) => j !== i))}
                      className="text-red-600"
                    >
                      x
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center justify-between">
                <SecondaryButton
                  onClick={() =>
                    setLines((v) => [
                      ...v,
                      { accountId: "", debit: "", credit: "", description: "" },
                    ])
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add Line
                </SecondaryButton>
                <div className="text-[12px] font-semibold">
                  {Math.abs(
                    lines.reduce((n, l) => n + Number(l.debit || 0) - Number(l.credit || 0), 0),
                  ) < 0.005
                    ? "Entry balanced"
                    : `Adjustment needed: ${money(Math.abs(lines.reduce((n, l) => n + Number(l.debit || 0) - Number(l.credit || 0), 0)))}`}
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function JournalTable({
  rows,
  query,
}: {
  rows: JournalRecord[];
  query: { isLoading: boolean; isError: boolean; refetch: () => unknown };
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-white shadow-card">
      <State query={query} empty={!rows.length} />
      {!!rows.length && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-[11px]">
            <Head
              labels={[
                "SL",
                "Date",
                "Journal No.",
                "Reference",
                "Description",
                "Source",
                "Total Amount",
                "Status",
              ]}
            />
            <tbody>
              {rows.map((r, i) => {
                const totalAmount = r.lines.reduce((n, l) => n + Number(l.debit), 0);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">{i + 1}</td>
                    <td>{date(r.journalDate)}</td>
                    <td className="font-semibold text-biz-blue">{r.journalNo}</td>
                    <td>{r.referenceNo ?? "-"}</td>
                    <td>{r.description}</td>
                    <td>{r.sourceModule.replaceAll("_", " ")}</td>
                    <td>{money(totalAmount)}</td>
                    <td>{r.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
