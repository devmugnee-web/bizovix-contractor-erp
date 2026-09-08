"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
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
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const money = (value: string | number | null | undefined) =>
  value == null
    ? "Not Configured"
    : `BDT ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
        new Date(value),
      )
    : "Not set";
const inputClass =
  "h-9 rounded-md border border-biz-border bg-white px-3 text-[11px] outline-none focus:border-biz-blue";

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
    <div className="grid grid-cols-[130px_1fr] gap-2 py-1.5 text-[11px]">
      <span className="text-biz-muted">{label}</span>
      <span className={strong ? "font-bold text-biz-navy" : "font-semibold text-biz-text"}>
        {value}
      </span>
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
    <div className="space-y-3 text-biz-text">
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-bold text-biz-navy">{project.workName}</h1>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-[10px] font-bold",
                archived
                  ? "border-purple-200 bg-purple-50 text-purple-700"
                  : "border-green-200 bg-green-50 text-green-700",
              )}
            >
              {project.status}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-biz-muted">
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
        </div>
        <div className="flex flex-wrap gap-2">
          {archived && (
            <Link
              href={listHref}
              className="flex h-9 items-center gap-2 rounded-md border border-biz-border bg-white px-4 text-[11px] font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to List
            </Link>
          )}
          {!archived && (
            <button
              onClick={archive}
              disabled={archiveWork.isPending}
              className="flex h-9 items-center gap-2 rounded-md border border-biz-border bg-white px-4 text-[11px] font-semibold"
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
          )}
          {archived && (
            <button
              onClick={restore}
              disabled={restoreWork.isPending}
              className="flex h-9 items-center gap-2 rounded-md border border-biz-blue bg-white px-4 text-[11px] font-semibold text-biz-blue disabled:opacity-50"
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
              "flex h-9 items-center gap-2 rounded-md bg-biz-blue px-4 text-[11px] font-semibold text-white",
              archived && "pointer-events-none opacity-40",
            )}
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </Link>
          <Link
            href={`/receipts/add?workId=${id}&returnTo=${encodeURIComponent(returnTo)}`}
            className="flex h-9 items-center gap-2 rounded-md bg-green-700 px-4 text-[11px] font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Add Receipt
          </Link>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-biz-navy">
            <UserRound className="h-5 w-5 text-biz-blue" />
            Project &amp; Contact Information
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
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
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-biz-navy">Other Contacts</h3>
                <button
                  type="button"
                  onClick={() => {
                    setContactError("");
                    setContactOpen(true);
                  }}
                  className="flex h-8 items-center gap-1 rounded border border-biz-blue px-2 text-[10px] font-semibold text-biz-blue"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Contact
                </button>
              </div>
              <div className="overflow-hidden rounded-md border border-biz-border">
                {data.otherContacts.length ? (
                  data.otherContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between border-b border-biz-border px-3 py-2 last:border-0"
                    >
                      <div>
                        <div className="text-[11px] font-semibold text-biz-navy">
                          {contact.name}
                        </div>
                        <div className="text-[9px] text-biz-muted">{contact.designation}</div>
                      </div>
                      <span className="text-[10px] font-semibold">{contact.mobile}</span>
                    </div>
                  ))
                ) : (
                  <p className="p-4 text-center text-[10px] text-biz-muted">
                    No other contacts configured.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
        <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-[13px] font-bold text-biz-navy">
              <WalletCards className="h-5 w-5 text-green-700" />
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
                  "flex h-9 w-full items-center justify-center gap-2 rounded-md border border-biz-blue bg-biz-blue px-4 text-[11px] font-semibold text-white shadow-[0_6px_16px_rgba(18,98,255,0.22)] transition-colors hover:border-[#0B55D8] hover:bg-[#0B55D8] sm:w-auto",
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
          <InfoRow
            label="Contract Value (Including VAT & Tax)"
            value={money(financial.contractValue)}
            strong
          />
          <InfoRow
            label={`VAT${financial.vatRate ? ` (${Number(financial.vatRate)}%)` : ""}`}
            value={money(financial.vatAmount)}
          />
          <InfoRow
            label={`Tax${financial.taxRate ? ` (${Number(financial.taxRate)}%)` : ""}`}
            value={money(financial.taxAmount)}
          />
          <InfoRow label="Value After VAT & Tax" value={money(financial.valueAfterVatTax)} strong />
          <div className="mt-2 rounded-md border border-green-200 bg-green-50/40 p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-biz-navy">
              <span>Security Deposit (SD)</span>
              <span>{sdLabel}</span>
            </div>
            <InfoRow
              label="Applicable?"
              value={financial.securityDeposit.state === "NOT_APPLICABLE" ? "No" : "Yes"}
            />
            <InfoRow
              label="Security Method"
              value={financial.securityDeposit.method?.replaceAll("_", " ") ?? sdLabel}
            />
            <InfoRow
              label={`SD Rate${
                financial.securityDeposit.rate
                  ? ` (${Number(financial.securityDeposit.rate)}%)`
                  : ""
              }`}
              value={money(financial.securityDeposit.amount)}
            />
            <InfoRow
              label="SD Status"
              value={financial.securityDeposit.status?.replaceAll("_", " ") ?? sdLabel}
            />
            {financial.securityDeposit.releasedDate &&
              financial.securityDeposit.status !== "HELD" && (
              <InfoRow
                label="SD Released Date"
                value={dateText(financial.securityDeposit.releasedDate)}
              />
            )}
            <InfoRow
              label="Net Receivable After SD"
              value={money(financial.netReceivableAfterSd)}
              strong
            />
          </div>
        </section>
      </div>

      <div className="grid gap-2 rounded-lg border border-biz-border bg-white p-3 shadow-card md:grid-cols-[minmax(240px,1fr)_150px_auto_auto_145px_145px_auto]">
        <label className="relative">
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
          className={inputClass}
        >
          <option value="ALL">All Transactions</option>
          <option value="EXPENSE">Expense</option>
          <option value="RECEIPT">Receipt</option>
        </select>
        <button
          onClick={() => setType("EXPENSE")}
          className={cn(
            inputClass,
            "text-red-600",
            type === "EXPENSE" && "border-red-300 bg-red-50",
          )}
        >
          ↓ Expense
        </button>
        <button
          onClick={() => setType("RECEIPT")}
          className={cn(
            inputClass,
            "text-green-700",
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
          className={inputClass}
        />
        <input
          aria-label="To Date"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className={inputClass}
        />
        <button
          aria-label="Reset filters"
          onClick={() => {
            setSearch("");
            setType("ALL");
            setFromDate("");
            setToDate("");
          }}
          className={inputClass}
        >
          <RotateCcw className="mx-auto h-4 w-4" />
        </button>
      </div>

      <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
        <h2 className="px-3 py-2 text-[13px] font-bold text-biz-navy">Transaction History</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-[10px]">
            <thead className="bg-biz-bg text-biz-navy">
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
                  <th key={head} className="px-3 py-2 text-left">
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
      </section>

      <section className="rounded-lg border border-biz-border bg-white p-3 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
            <div key={label} className="rounded-md border border-biz-border bg-biz-bg/40 p-3">
              <div className="text-[10px] font-semibold text-biz-navy">{label}</div>
              <div className={cn("mt-2 text-[14px] font-bold", tone)}>{value}</div>
            </div>
          ))}
        </div>
      </section>
      {contactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-biz-navy/40 p-4">
          <form onSubmit={saveContact} className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-biz-border px-5 py-4">
              <div>
                <h2 className="text-[16px] font-bold text-biz-navy">Add Contact</h2>
                <p className="mt-1 text-[11px] text-biz-muted">
                  This contact will be added under {project.organizationMaster.shortName}.
                </p>
              </div>
              <button type="button" onClick={() => setContactOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <label className="text-[11px] font-semibold">
                Name *
                <input
                  autoFocus
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <label className="text-[11px] font-semibold">
                Designation *
                <input
                  value={contactForm.designation}
                  onChange={(e) => setContactForm({ ...contactForm, designation: e.target.value })}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <label className="text-[11px] font-semibold">
                Mobile *
                <input
                  value={contactForm.mobile}
                  onChange={(e) => setContactForm({ ...contactForm, mobile: e.target.value })}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <label className="text-[11px] font-semibold">
                Email
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              <label className="text-[11px] font-semibold sm:col-span-2">
                Address
                <input
                  value={contactForm.address}
                  onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                  className={`${inputClass} mt-1 w-full`}
                />
              </label>
              {contactError && (
                <p className="text-[11px] font-semibold text-biz-danger sm:col-span-2">
                  {contactError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-biz-border px-5 py-4">
              <button
                type="button"
                onClick={() => setContactOpen(false)}
                className="h-9 rounded-md border border-biz-border px-4 text-[11px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addContact.isPending}
                className="h-9 rounded-md bg-biz-blue px-4 text-[11px] font-semibold text-white"
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
      <td className="px-3 py-2">{dateText(row.date)}</td>
      <td className="px-3 py-2">
        <span
          className={cn(
            "rounded-full px-2 py-1 font-semibold",
            row.type === "EXPENSE" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700",
          )}
        >
          {row.type === "EXPENSE" ? "Expense" : "Receipt"}
        </span>
      </td>
      <td className="px-3 py-2 font-semibold text-biz-navy">{row.item}</td>
      <td
        className={cn(
          "px-3 py-2 font-bold",
          row.type === "EXPENSE" ? "text-red-600" : "text-green-700",
        )}
      >
        {money(row.amount).replace("BDT ", "")}
      </td>
      <td className="px-3 py-2">{row.party}</td>
      <td className="px-3 py-2">{row.referenceNo ?? "-"}</td>
      <td className="px-3 py-2">{row.remarks ?? "-"}</td>
      <td className="px-3 py-2">
        <Eye className="h-4 w-4 text-biz-blue" />
      </td>
    </tr>
  );
}
