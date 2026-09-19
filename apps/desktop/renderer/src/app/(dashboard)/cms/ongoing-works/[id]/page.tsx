"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  Archive,
  ArrowLeft,
  Eye,
  FilePenLine,
  Plus,
  RotateCcw,
  Search,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  useAddCmsWorkContact,
  useArchiveCmsWork,
  useCmsWorkOverview,
  useRestoreCmsWork,
} from "@bizovix/api-client";
import type { CmsWorkOverviewTransaction } from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const money = (value: string | number | null | undefined) =>
  value == null ? "Not Configured" : formatBDT(value);
const dateText = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
        new Date(value),
      )
    : "Not set";
const inputClass =
  "h-9 min-w-0 rounded-md border border-biz-border bg-white px-3 text-[12px] text-biz-text outline-none focus:border-biz-blue";

function InfoRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="grid grid-cols-[95px_minmax(0,1fr)] gap-2 py-px text-[12px] leading-snug">
      <span className="text-biz-muted">{label}</span>
      <span className={strong ? "font-bold text-biz-navy" : "font-semibold text-biz-text"}>
        {value}
      </span>
    </div>
  );
}

function SecurityDetail({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-tight text-biz-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 break-words text-[12px] font-semibold leading-tight text-biz-text",
          strong && "font-bold text-biz-navy",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FinancialMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "primary" | "success";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border px-2.5 py-1",
        tone === "primary"
          ? "border-blue-200 bg-blue-50/60"
          : tone === "success"
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-slate-200 bg-slate-50/70",
      )}
    >
      <p className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-biz-muted">{label}</p>
      <p className="mt-1 text-[13px] font-bold leading-tight text-biz-navy">{value}</p>
    </div>
  );
}

export default function OngoingWorkDetailsPage() {
  const { id } = useParams<{ id: string }>();
  return <ApprovedWorkDetails workId={id} mode="ONGOING" />;
}

export function ApprovedWorkDetails({
  workId: id,
  mode,
}: {
  workId: string;
  mode: "ONGOING" | "ARCHIVED";
}) {
  const router = useRouter();
  const overview = useCmsWorkOverview(id);
  const archiveWork = useArchiveCmsWork();
  const restoreWork = useRestoreCmsWork();
  const addContact = useAddCmsWorkContact(id);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [contactError, setContactError] = React.useState("");
  const [contactForm, setContactForm] = React.useState({
    name: "",
    designation: "",
    mobile: "",
    email: "",
    address: "",
  });
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState<"ALL" | "EXPENSE" | "RECEIPT">("ALL");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const archived = mode === "ARCHIVED";
  const listHref = archived ? "/cms/archived-works" : "/cms/ongoing-works";
  useSetBreadcrumb([
    { label: "CMS" },
    { label: archived ? "Archived Works" : "Ongoing Works", href: listHref },
    { label: "Work Details" },
  ]);

  if (overview.isLoading)
    return <p className="text-[13px] text-biz-muted">Loading work details...</p>;
  if (overview.isError || !overview.data)
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-biz-danger">
        Work details could not be loaded.
      </div>
    );
  const data = overview.data;
  const { project, financial, summary } = data;
  const normalizedSearch = search.trim().toLowerCase();
  const rows = data.transactions.filter((row) => {
    if (type !== "ALL" && row.type !== type) return false;
    const day = row.date.slice(0, 10);
    if (fromDate && day < fromDate) return false;
    if (toDate && day > toDate) return false;
    return (
      !normalizedSearch ||
      [row.item, row.party, row.referenceNo, row.remarks].some((value) =>
        value?.toLowerCase().includes(normalizedSearch),
      )
    );
  });
  const returnTo = `${listHref}/${id}`;
  const sdLabel =
    financial.securityDeposit.state === "NOT_APPLICABLE"
      ? "Not Applicable"
      : financial.securityDeposit.state === "NOT_CONFIGURED"
        ? "Not Configured"
        : "Configured";

  async function archive() {
    if (!window.confirm("Archive this work?")) return;
    await archiveWork.mutateAsync(id);
    router.push(listHref);
  }

  async function restore() {
    if (!window.confirm("Restore this work to Ongoing Works?")) return;
    await restoreWork.mutateAsync(id);
    router.push(`/cms/ongoing-works/${id}`);
  }

  async function saveContact(event: React.FormEvent) {
    event.preventDefault();
    setContactError("");
    if (!contactForm.name.trim() || !contactForm.designation.trim() || !contactForm.mobile.trim()) {
      setContactError("Name, designation and mobile are required.");
      return;
    }
    try {
      await addContact.mutateAsync(contactForm);
      setContactForm({ name: "", designation: "", mobile: "", email: "", address: "" });
      setContactOpen(false);
    } catch (error) {
      setContactError(error instanceof Error ? error.message : "Could not add contact.");
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-2.5 text-biz-text xl:h-full xl:min-h-0 xl:overflow-hidden">
      <header className="rounded-xl border border-blue-100 bg-gradient-to-r from-white via-blue-50/45 to-emerald-50/35 px-4 py-2.5 shadow-sm">
        <div className="flex items-start gap-2.5">
          <h1
            className="min-w-0 flex-1 text-[18px] font-bold leading-snug text-biz-navy"
            title={project.workName}
          >
            {project.workName}
          </h1>
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
              archived
                ? "border-purple-200 bg-purple-50 text-purple-700"
                : "border-green-200 bg-green-50 text-green-700",
            )}
          >
            {project.status}
          </span>
        </div>
        <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11px] text-biz-muted">
            <span>
              Tender ID: <b className="text-biz-navy">{project.tenderNumber ?? "Manual Work"}</b>
            </span>
            <span>
              Work Category: <b className="text-biz-navy">{project.workCategory}</b>
            </span>
            <span>
              Started: <b className="text-biz-navy">{dateText(project.startDate)}</b>
            </span>
            {archived ? (
              <>
                <span>
                  Completed: <b className="text-biz-navy">{dateText(project.completionDate)}</b>
                </span>
                <span>
                  Completion Date:{" "}
                  <b className="text-biz-navy">{dateText(project.completionDate)}</b>
                </span>
              </>
            ) : (
              <span>
                Expected Completion:{" "}
                <b className="text-biz-navy">{dateText(project.expectedCompletionDate)}</b>
              </span>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            {archived && (
              <Link
                href={listHref}
                className="flex h-8 items-center gap-2 rounded-md border border-biz-border bg-white px-3 text-[12px] font-semibold"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to List
              </Link>
            )}
            {!archived && (
              <button
                onClick={archive}
                disabled={archiveWork.isPending}
                className="flex h-8 items-center gap-2 rounded-md border border-biz-border bg-white px-3 text-[12px] font-semibold"
              >
                <Archive className="h-4 w-4" />
                Archive
              </button>
            )}
            {archived && (
              <button
                onClick={restore}
                disabled={restoreWork.isPending}
                className="flex h-8 items-center gap-2 rounded-md border border-biz-blue bg-white px-3 text-[12px] font-semibold text-biz-blue disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {restoreWork.isPending ? "Restoring..." : "Restore to Ongoing"}
              </button>
            )}
            <Link
              href={
                archived
                  ? "#"
                  : `/expenses/project-expense?workId=${id}&returnTo=${encodeURIComponent(returnTo)}`
              }
              aria-disabled={archived}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md bg-biz-blue px-3 text-[12px] font-semibold text-white",
                archived && "pointer-events-none opacity-40",
              )}
            >
              <Plus className="h-4 w-4" />
              Add Expense
            </Link>
            <Link
              href={`/receipts/add?workId=${id}&returnTo=${encodeURIComponent(returnTo)}`}
              className="flex h-8 items-center gap-2 rounded-md bg-green-700 px-3 text-[12px] font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Add Receipt
            </Link>
          </div>
        </div>
      </header>

      <div className="grid items-stretch gap-2.5 lg:grid-cols-2 xl:min-h-0 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.4fr)_minmax(220px,0.9fr)]">
        <section className="flex min-w-0 flex-col rounded-xl border border-biz-border bg-white px-2.5 py-2 shadow-sm xl:min-h-0 xl:overflow-y-auto">
          <h2 className="mb-1 flex items-center gap-2 border-b border-slate-100 pb-1 text-[13px] font-bold text-biz-navy">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-biz-blue">
              <UserRound className="h-4 w-4" />
            </span>
            Project &amp; Contact Information
          </h2>
          <div className="grid gap-1.5">
            <div className="rounded-lg bg-slate-50/70 px-2.5 py-1">
              <InfoRow label="Organization" value={project.organizationMaster.shortName} />
              <InfoRow label="PE Name" value={data.primaryContact?.name ?? "Not Configured"} />
              <InfoRow
                label="Designation"
                value={data.primaryContact?.designation ?? "Not Configured"}
              />
              <InfoRow label="Mobile" value={data.primaryContact?.mobile ?? "Not Configured"} />
              <InfoRow label="Address" value={data.primaryContact?.address ?? "Not Configured"} />
            </div>
            <div>
              <div className="mb-1 flex h-6 items-center justify-between">
                <h3 className="text-[12px] font-bold text-biz-navy">Other Contacts</h3>
                <button
                  type="button"
                  onClick={() => {
                    setContactError("");
                    setContactOpen(true);
                  }}
                  className="flex h-6 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-biz-blue transition-colors hover:bg-blue-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Contact
                </button>
              </div>
              <div className="overflow-hidden rounded-md border border-biz-border xl:max-h-[90px] xl:overflow-y-auto">
                {data.otherContacts.length ? (
                  data.otherContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between border-b border-biz-border px-2.5 py-0.5 last:border-0"
                    >
                      <div>
                        <div className="text-[12px] font-semibold text-biz-navy">
                          {contact.name}
                        </div>
                        <div className="text-[11px] text-biz-muted">{contact.designation}</div>
                      </div>
                      <span className="text-[11px] font-semibold">{contact.mobile}</span>
                    </div>
                  ))
                ) : (
                  <p className="p-3 text-center text-[11px] text-biz-muted">
                    No other contacts configured.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
        <section className="flex min-w-0 flex-col rounded-xl border border-biz-border bg-white px-2.5 py-2 shadow-sm xl:min-h-0 xl:overflow-y-auto">
          <div className="mb-1 flex flex-col gap-2 border-b border-slate-100 pb-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-[13px] font-bold text-biz-navy">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <WalletCards className="h-4 w-4" />
              </span>
              Project Financial Information
            </h2>
            <div className="w-full sm:w-auto">
              <Link
                href={
                  project.contractId
                    ? `/cms/contracts/${project.contractId}/edit`
                    : archived
                      ? "#"
                      : `/cms/contracts/create?cmsWorkId=${id}`
                }
                aria-disabled={archived && !project.contractId}
                className={cn(
                  "flex h-7 w-full items-center justify-center gap-2 rounded-md border border-biz-blue bg-biz-blue px-3 text-[11px] font-semibold text-white transition-colors hover:border-[#0B55D8] hover:bg-[#0B55D8] sm:w-auto",
                  archived && !project.contractId && "pointer-events-none opacity-50",
                )}
              >
                {project.contractId ? (
                  <FilePenLine className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {project.contractId
                  ? archived
                    ? "View Contract & Financials"
                    : "Edit Contract & Financials"
                  : archived
                    ? "Contract Unavailable"
                    : "Set Up Contract & Financials"}
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 2xl:grid-cols-4">
            <FinancialMetric
              label="Contract Value (Incl. VAT & Tax)"
              value={money(financial.contractValue)}
              tone="primary"
            />
            <FinancialMetric
              label="Value After VAT & Tax"
              value={money(financial.valueAfterVatTax)}
              tone="success"
            />
            <FinancialMetric
              label={`VAT${financial.vatRate ? ` (${Number(financial.vatRate)}%)` : ""}`}
              value={money(financial.vatAmount)}
            />
            <FinancialMetric
              label={`Tax${financial.taxRate ? ` (${Number(financial.taxRate)}%)` : ""}`}
              value={money(financial.taxAmount)}
            />
          </div>
          <div className="mt-1 rounded-lg border border-emerald-200 bg-emerald-50/40 px-2.5 py-1">
            <div className="mb-0.5 flex items-center justify-between text-[12px] font-bold text-biz-navy">
              <span>Security Deposit (SD)</span>
              <span>{sdLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
              <SecurityDetail
                label="Applicable?"
                value={financial.securityDeposit.state === "NOT_APPLICABLE" ? "No" : "Yes"}
              />
              <SecurityDetail
                label="Security Method"
                value={financial.securityDeposit.method?.replaceAll("_", " ") ?? sdLabel}
              />
              <SecurityDetail
                label={`SD Rate${
                  financial.securityDeposit.rate
                    ? ` (${Number(financial.securityDeposit.rate)}%)`
                    : ""
                }`}
                value={money(financial.securityDeposit.amount)}
              />
              <SecurityDetail
                label="SD Status"
                value={financial.securityDeposit.status?.replaceAll("_", " ") ?? sdLabel}
              />
              {financial.securityDeposit.releasedDate &&
                financial.securityDeposit.status !== "HELD" && (
                  <SecurityDetail
                    label="SD Released Date"
                    value={dateText(financial.securityDeposit.releasedDate)}
                  />
                )}
              <SecurityDetail
                label="Net Receivable After SD"
                value={money(financial.netReceivableAfterSd)}
                strong
              />
            </div>
          </div>
        </section>
        <section className="flex min-w-0 flex-col rounded-xl border border-biz-border bg-white px-2.5 py-2 shadow-sm lg:col-span-2 xl:col-span-1 xl:min-h-0 xl:overflow-y-auto">
          <h2 className="mb-1 flex items-center gap-2 border-b border-slate-100 pb-1 text-[13px] font-bold text-biz-navy">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
              <Activity className="h-4 w-4" />
            </span>
            Financial Snapshot
          </h2>
          <div className="grid flex-1 gap-1 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-1 xl:grid-rows-5">
            {[
              ["Total Expense", money(summary.totalExpense), "text-red-600"],
              ["Total Receipt / Bill", money(summary.totalReceipt), "text-green-700"],
              ["SD Held", money(summary.securityDepositHeld), "text-biz-blue"],
              ["Receivable Balance", money(summary.balanceReceivable), "text-orange-600"],
              [
                "Current Margin (Indicative)",
                summary.currentMarginPct == null
                  ? "Not Configured"
                  : `${Number(summary.currentMarginPct).toFixed(2)}%`,
                "text-purple-600",
              ],
            ].map(([label, value, tone]) => (
              <div
                key={label}
                className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-biz-border bg-slate-50/60 px-2.5 py-1"
              >
                <span className="text-[11px] font-medium text-biz-text">{label}</span>
                <span className={cn("shrink-0 text-[12px] font-bold", tone)}>{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="flex min-h-[250px] flex-col overflow-hidden rounded-xl border border-biz-border bg-white shadow-sm xl:min-h-[150px] xl:flex-1">
        <div className="grid grid-cols-2 items-center gap-2 border-b border-biz-border p-2.5 xl:grid-cols-[auto_minmax(170px,1fr)_125px_95px_95px_128px_128px_36px]">
          <h2 className="col-span-2 flex items-center gap-2 whitespace-nowrap text-[13px] font-bold text-biz-navy xl:col-span-1">
            Transaction History
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-biz-blue">
              {rows.length}
            </span>
          </h2>
          <label className="relative col-span-2 xl:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by item, description, party, voucher no..."
              className={`${inputClass} w-full pl-9`}
            />
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className={`${inputClass} col-span-2 w-full sm:col-span-1`}
          >
            <option value="ALL">All Transactions</option>
            <option value="EXPENSE">Expense</option>
            <option value="RECEIPT">Receipt</option>
          </select>
          <button
            onClick={() => setType("EXPENSE")}
            className={cn(
              inputClass,
              "w-full text-red-600",
              type === "EXPENSE" && "border-red-300 bg-red-50",
            )}
          >
            ↓ Expense
          </button>
          <button
            onClick={() => setType("RECEIPT")}
            className={cn(
              inputClass,
              "w-full text-green-700",
              type === "RECEIPT" && "border-green-300 bg-green-50",
            )}
          >
            ↑ Receipt
          </button>
          <input
            aria-label="From Date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={`${inputClass} w-full`}
          />
          <input
            aria-label="To Date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={`${inputClass} w-full`}
          />
          <button
            aria-label="Reset filters"
            onClick={() => {
              setSearch("");
              setType("ALL");
              setFromDate("");
              setToDate("");
            }}
            className={`${inputClass} w-9 justify-self-end px-0`}
          >
            <RotateCcw className="mx-auto h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-[90px] flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="divide-y divide-biz-border xl:hidden">
              {rows.length ? (
                rows.map((row) => <TransactionCard key={`${row.type}-${row.id}`} row={row} />)
              ) : (
                <p className="px-3 py-8 text-center text-[12px] text-biz-muted">
                  No valid project transactions found.
                </p>
              )}
            </div>
            <table className="hidden w-full min-w-[1030px] table-fixed text-[12px] xl:table">
              <colgroup>
                <col className="w-[100px]" />
                <col className="w-[88px]" />
                <col className="w-[18%]" />
                <col className="w-[110px]" />
                <col className="w-[120px]" />
                <col className="w-[145px]" />
                <col />
                <col className="w-[60px]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-biz-bg text-biz-navy">
                <tr>
                  {[
                    "Date",
                    "Type",
                    "Item / Purpose",
                    "Amount (BDT)",
                    "By / From",
                    "Reference / Bill No.",
                    "Remarks",
                    "Action",
                  ].map((head) => (
                    <th key={head} className="px-2 py-1.5 text-left">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => <TransactionRow key={`${row.type}-${row.id}`} row={row} />)
                ) : (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-biz-muted">
                      No valid project transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      {contactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-biz-navy/40 p-4">
          <form onSubmit={saveContact} className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-biz-border px-5 py-4">
              <div>
                <h2 className="text-[16px] font-bold text-biz-navy">Add Contact</h2>
                <p className="mt-1 text-[12px] text-biz-muted">
                  This contact will be added under {project.organizationMaster.shortName}.
                </p>
              </div>
              <button type="button" onClick={() => setContactOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <label className="text-[12px] font-semibold">
                Name *
                <input
                  autoFocus
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <label className="text-[12px] font-semibold">
                Designation *
                <input
                  value={contactForm.designation}
                  onChange={(e) => setContactForm({ ...contactForm, designation: e.target.value })}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <label className="text-[12px] font-semibold">
                Mobile *
                <input
                  value={contactForm.mobile}
                  onChange={(e) => setContactForm({ ...contactForm, mobile: e.target.value })}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <label className="text-[12px] font-semibold">
                Email
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <label className="text-[12px] font-semibold sm:col-span-2">
                Address
                <input
                  value={contactForm.address}
                  onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              {contactError && (
                <p className="text-[12px] font-semibold text-biz-danger sm:col-span-2">
                  {contactError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-biz-border px-5 py-4">
              <button
                type="button"
                onClick={() => setContactOpen(false)}
                className="h-9 rounded-md border border-biz-border px-4 text-[12px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addContact.isPending}
                className="h-9 rounded-md bg-biz-blue px-4 text-[12px] font-semibold text-white"
              >
                {addContact.isPending ? "Saving..." : "Save Contact"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function TransactionRow({ row }: { row: CmsWorkOverviewTransaction }) {
  return (
    <tr className="border-t border-biz-border">
      <td className="whitespace-nowrap px-2 py-1.5">{dateText(row.date)}</td>
      <td className="px-2 py-1.5">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-semibold",
            row.type === "EXPENSE" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700",
          )}
        >
          {row.type === "EXPENSE" ? "Expense" : "Receipt"}
        </span>
      </td>
      <td className="px-2 py-1.5 font-semibold text-biz-navy" title={row.item}>
        <span className="block truncate">{row.item}</span>
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-2 py-1.5 font-bold",
          row.type === "EXPENSE" ? "text-red-600" : "text-green-700",
        )}
      >
        {money(row.amount).replace("BDT ", "")}
      </td>
      <td className="px-2 py-1.5" title={row.party}>
        <span className="block truncate">{row.party}</span>
      </td>
      <td className="px-2 py-1.5" title={row.referenceNo ?? undefined}>
        <span className="block truncate">{row.referenceNo ?? "-"}</span>
      </td>
      <td className="px-2 py-1.5" title={row.remarks ?? undefined}>
        <span className="block truncate">{row.remarks ?? "-"}</span>
      </td>
      <td className="px-2 py-1.5">
        <Eye className="h-4 w-4 text-biz-blue" />
      </td>
    </tr>
  );
}

function TransactionCard({ row }: { row: CmsWorkOverviewTransaction }) {
  return (
    <div className="space-y-2 px-3 py-2.5 text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-semibold",
              row.type === "EXPENSE" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700",
            )}
          >
            {row.type === "EXPENSE" ? "Expense" : "Receipt"}
          </span>
          <span className="text-biz-muted">{dateText(row.date)}</span>
        </div>
        <span
          className={cn("font-bold", row.type === "EXPENSE" ? "text-red-600" : "text-green-700")}
        >
          {money(row.amount)}
        </span>
      </div>
      <p className="font-semibold text-biz-navy">{row.item}</p>
      <div className="grid gap-x-3 gap-y-1 text-biz-muted sm:grid-cols-2">
        <span>
          By / From: <b className="font-semibold text-biz-text">{row.party}</b>
        </span>
        <span>
          Reference / Bill No.:{" "}
          <b className="font-semibold text-biz-text">{row.referenceNo ?? "-"}</b>
        </span>
        <span>
          Remarks: <b className="font-semibold text-biz-text">{row.remarks ?? "-"}</b>
        </span>
        <span className="flex items-center gap-1">
          Action: <Eye className="h-4 w-4 text-biz-blue" />
        </span>
      </div>
    </div>
  );
}
