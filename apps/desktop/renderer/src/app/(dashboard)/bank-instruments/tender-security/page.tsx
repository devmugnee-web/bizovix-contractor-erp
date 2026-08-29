"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CircleX,
  Eye,
  FileText,
  Filter,
  Landmark,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import {
  useAllOrganizations,
  useBankAccounts,
  useCreateTenderSecurity,
  useMarkTenderSecurityNotRequired,
  usePendingTenderSecurities,
  useTenderBankSettings,
} from "@bizovix/api-client";
import type { FundingType, PendingTenderSecurity, SecurityType, TenderSecurityPendingQuery, TenderStatus } from "@bizovix/types";
import { Button, DateInput, IconButton, SelectInput, TextInput, cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { SuccessPopup } from "@/components/layout/SuccessPopup";

type SelectedTender = PendingTenderSecurity & {
  securityAmount: string;
  marginPercentage: string;
  referenceNo: string;
};

const DEFAULT_QUERY: TenderSecurityPendingQuery = { page: 1, limit: 5 };
const ACTIVE_TENDER_STATUS_OPTIONS: Array<{ label: string; value: TenderStatus }> = [
  { label: "Draft", value: "DRAFT" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Document Purchased", value: "DOCUMENT_PURCHASED" },
  { label: "Preparing", value: "PREPARING" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Opened", value: "OPENED" },
  { label: "Under Evaluation", value: "UNDER_PROCESS" },
  { label: "NOA", value: "NOA" },
];

const TENDER_STATUS_LABELS = Object.fromEntries(ACTIVE_TENDER_STATUS_OPTIONS.map((option) => [option.value, option.label]));
const SECURITY_STATUS_META = {
  PENDING: { label: "Security Not Given", className: "bg-biz-orange-soft text-biz-orange" },
  CREATED: { label: "Security Created", className: "bg-biz-success-soft text-biz-success" },
  NOT_REQUIRED: { label: "Not Required", className: "bg-slate-100 text-slate-600" },
  NO_DOCUMENT_PURCHASE: { label: "Document Purchase Required", className: "bg-biz-danger-soft text-biz-danger" },
} as const;

function money(value: number | string) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isoDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function displayDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function addMonths(date: string, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return isoDateInput(next);
}

function makeReference(tenderId: string | null, securityType: SecurityType) {
  const suffix = (tenderId ?? "0000").slice(-4);
  return `${securityType === "BANK_GUARANTEE" ? "BG" : "PO"}-${suffix}/24-25`;
}

function toSelectedTender(
  row: PendingTenderSecurity,
  securityType: SecurityType,
  defaultMarginPct = "10.00",
): SelectedTender {
  return {
    ...row,
    securityAmount: Number(row.securityAmount).toFixed(2),
    marginPercentage: defaultMarginPct,
    referenceNo: makeReference(row.tenderId, securityType),
  };
}

function Checkbox({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      title={disabled ? label : undefined}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50",
        checked ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border bg-white text-transparent",
      )}
    >
      <Check className="h-3 w-3" />
    </button>
  );
}

function RadioCard({
  selected,
  label,
  icon,
  onClick,
}: {
  selected: boolean;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-2 rounded-md border px-3 text-left text-[12px] font-semibold",
        selected ? "border-biz-blue bg-biz-blue-soft text-biz-blue" : "border-biz-border bg-white text-biz-text",
      )}
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 items-center justify-center rounded-full border",
          selected ? "border-biz-blue" : "border-biz-border",
        )}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-biz-blue" />}
      </span>
      {icon}
      {label}
    </button>
  );
}

export default function TenderSecurityPage() {
  useSetBreadcrumb([{ label: "Bank Instruments" }, { label: "Tender Security" }]);

  const [query, setQuery] = React.useState<TenderSecurityPendingQuery>(DEFAULT_QUERY);
  const [search, setSearch] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const pendingQuery = usePendingTenderSecurities(query);
  const organizations = useAllOrganizations();
  const bankAccounts = useBankAccounts();
  const tenderBankSettings = useTenderBankSettings();
  const createTenderSecurity = useCreateTenderSecurity();
  const defaultMarginPct = tenderBankSettings.data
    ? Number(tenderBankSettings.data.tsDefaultMarginPct).toFixed(2)
    : "10.00";
  const markNotRequired = useMarkTenderSecurityNotRequired();

  const [securityType, setSecurityType] = React.useState<SecurityType>("PAY_ORDER");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [selectedRows, setSelectedRows] = React.useState<SelectedTender[]>([]);
  const [showDetails, setShowDetails] = React.useState(false);
  const [fundingType, setFundingType] = React.useState<FundingType>("LOAN");
  const [companyAccountId, setCompanyAccountId] = React.useState("");
  const [issueDate, setIssueDate] = React.useState(() => isoDateInput(new Date()));
  const [validityMonths, setValidityMonths] = React.useState("4");
  const [interestRate, setInterestRate] = React.useState("15.00");
  const [remarks, setRemarks] = React.useState("PO will be issued for selected tenders");
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const appliedDefaultValidity = React.useRef(false);

  React.useEffect(() => {
    if (tenderBankSettings.data && !appliedDefaultValidity.current) {
      appliedDefaultValidity.current = true;
      setValidityMonths(String(tenderBankSettings.data.tsDefaultValidityMonths));
    }
  }, [tenderBankSettings.data]);

  const pendingItems = pendingQuery.data?.items ?? [];
  const meta = pendingQuery.data?.meta ?? { page: 1, limit: 5, total: 0, totalPages: 1 };
  const expiryDate = addMonths(issueDate, Number(validityMonths || 0));
  const activeBankAccounts = React.useMemo(
    () => (bankAccounts.data ?? []).filter((account) => account.accountType === "BANK" && account.isActive && account.bankName?.trim()),
    [bankAccounts.data],
  );
  const effectiveCompanyAccountId = activeBankAccounts.some((account) => account.id === companyAccountId)
    ? companyAccountId
    : activeBankAccounts[0]?.id ?? "";
  const section2Ref = React.useRef<HTMLDivElement>(null);

  function toggleRow(row: PendingTenderSecurity) {
    if (!row.eligible || !row.documentPurchaseId) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
    setSelectedRows((rows) => {
      if (rows.some((item) => item.id === row.id)) return rows.filter((item) => item.id !== row.id);
      return [...rows, toSelectedTender(row, securityType, defaultMarginPct)];
    });
  }

  function toggleAll() {
    const eligibleItems = pendingItems.filter((item) => item.eligible && item.documentPurchaseId);
    const allSelected = eligibleItems.length > 0 && eligibleItems.every((item) => selectedIds.has(item.id));
    if (allSelected) {
      const pageIds = new Set(eligibleItems.map((item) => item.id));
      setSelectedIds((current) => new Set([...current].filter((id) => !pageIds.has(id))));
      setSelectedRows((rows) => rows.filter((row) => !pageIds.has(row.id)));
    } else {
      setSelectedIds((current) => new Set([...current, ...eligibleItems.map((item) => item.id)]));
      setSelectedRows((rows) => [
        ...rows,
        ...eligibleItems
          .filter((item) => !rows.some((row) => row.id === item.id))
          .map((item) => toSelectedTender(item, securityType, defaultMarginPct)),
      ]);
    }
  }

  function setSelectedValue(id: string, key: keyof Pick<SelectedTender, "securityAmount" | "marginPercentage" | "referenceNo">, value: string) {
    setSelectedRows((rows) => rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }

  function updateSecurityType(next: SecurityType) {
    setSecurityType(next);
    setSelectedRows((rows) => rows.map((row) => ({ ...row, referenceNo: makeReference(row.tenderId, next) })));
  }

  function openDetails() {
    if (selectedRows.length === 0) {
      setMessage({ type: "error", text: "Select one or more tenders first." });
      return;
    }
    setMessage(null);
    setShowDetails(true);
    window.requestAnimationFrame(() => {
      section2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      section2Ref.current?.focus({ preventScroll: true });
    });
  }

  const totals = selectedRows.reduce(
    (acc, row) => {
      const securityAmount = Number(row.securityAmount || 0);
      const marginAmount = (securityAmount * Number(row.marginPercentage || 0)) / 100;
      return {
        security: acc.security + securityAmount,
        margin: acc.margin + marginAmount,
        finance: acc.finance + (fundingType === "LOAN" ? securityAmount - marginAmount : 0),
      };
    },
    { security: 0, margin: 0, finance: 0 },
  );
  const hasInvalidSecurityAmount = selectedRows.some((row) => !Number.isFinite(Number(row.securityAmount)) || Number(row.securityAmount) <= 0);
  const hasInvalidMargin = selectedRows.some((row) => !Number.isFinite(Number(row.marginPercentage)) || Number(row.marginPercentage) < 0 || Number(row.marginPercentage) > 100);
  const hasMissingReference = selectedRows.some((row) => !row.referenceNo.trim());
  const hasInvalidValidity = !Number.isFinite(Number(validityMonths)) || Number(validityMonths) < 1;
  const hasInvalidInterest = fundingType === "LOAN" && (!Number.isFinite(Number(interestRate)) || Number(interestRate) < 0);
  const canSave = selectedRows.length > 0
    && !!effectiveCompanyAccountId
    && !hasInvalidSecurityAmount
    && !hasInvalidMargin
    && !hasMissingReference
    && !hasInvalidValidity
    && !hasInvalidInterest;

  function removeSelectedTender(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setSelectedRows((rows) => rows.filter((row) => row.id !== id));
  }

  async function save() {
    setMessage(null);
    try {
      await createTenderSecurity.mutateAsync({
        securityType,
        bankId: effectiveCompanyAccountId,
        fundingType,
        issueDate,
        validityMonths: Number(validityMonths),
        expiryDate,
        interestRate: fundingType === "LOAN" ? Number(interestRate) : 0,
        chargeFromAccountId: effectiveCompanyAccountId,
        remarks,
        items: selectedRows.map((row) => ({
          documentPurchaseId: row.documentPurchaseId!,
          securityAmount: Number(row.securityAmount),
          marginPercentage: Number(row.marginPercentage),
          referenceNo: row.referenceNo,
        })),
      });
      setMessage({ type: "success", text: "Tender security saved successfully." });
      setSelectedIds(new Set());
      setSelectedRows([]);
      setShowDetails(false);
      await pendingQuery.refetch();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save tender security." });
    }
  }

  async function markSelectedNotRequired() {
    setMessage(null);
    try {
      await markNotRequired.mutateAsync({ documentPurchaseIds: selectedRows.map((row) => row.documentPurchaseId!) });
      setMessage({ type: "success", text: "Selected tenders marked as not required." });
      setSelectedIds(new Set());
      setSelectedRows([]);
      setShowDetails(false);
      await pendingQuery.refetch();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to update selected tenders." });
    }
  }

  return (
    <div className="flex flex-col gap-3 text-biz-text">
      <SuccessPopup
        open={message?.type === "success"}
        message={message?.text ?? ""}
        onClose={() => setMessage(null)}
      />
      <div>
        <h1 className="text-[22px] font-bold leading-7 text-biz-navy">Tender Security</h1>
        <p className="text-[13px] text-biz-muted">
          Select one or more tenders to create Tender Security (Pay Order / Bank Guarantee)
        </p>
      </div>

      {message?.type === "error" && (
        <div className="rounded-md border border-biz-danger/20 bg-biz-danger-soft px-3 py-2 text-[12px] font-medium text-biz-danger">
          {message.text}
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-[15px] font-bold text-biz-navy">
            1. Active Tenders <span className="ml-2 rounded-md bg-biz-blue-soft px-2 py-1 text-[12px] text-biz-blue">{meta.total}</span>
          </h2>
          <div className="flex items-center gap-2">
            <IconButton aria-label="Refresh" onClick={() => pendingQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen((open) => !open)}>
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-biz-border bg-[#FBFCFE] px-4 py-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-[11px] font-medium text-biz-muted">Search Tender ID / Work / Organization</label>
            <TextInput
              icon={Search}
              placeholder="Search active tenders..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setQuery((current) => ({ ...current, page: 1, search: search.trim() || undefined }));
              }}
            />
          </div>
          <Button size="sm" onClick={() => setQuery((current) => ({ ...current, page: 1, search: search.trim() || undefined }))}>
            <Search className="h-4 w-4" /> Search
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch("");
              setQuery(DEFAULT_QUERY);
            }}
          >
            Reset
          </Button>
        </div>

        {filtersOpen && (
          <div className="grid grid-cols-1 gap-3 border-t border-biz-border bg-white px-4 py-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-biz-muted">Organization</label>
              <SelectInput
                placeholder="All Organizations"
                value={query.organizationId ?? ""}
                onChange={(event) => setQuery((current) => ({ ...current, page: 1, organizationId: event.target.value || undefined }))}
                options={(organizations.data ?? []).map((organization) => ({ value: organization.id, label: organization.shortName }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-biz-muted">Tender Status</label>
              <SelectInput
                placeholder="All Active Statuses"
                value={query.tenderStatus ?? ""}
                onChange={(event) => setQuery((current) => ({ ...current, page: 1, tenderStatus: (event.target.value || undefined) as TenderStatus | undefined }))}
                options={ACTIVE_TENDER_STATUS_OPTIONS}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-biz-muted">Security Status</label>
              <SelectInput
                placeholder="All Security Statuses"
                value={query.securityStatus ?? ""}
                onChange={(event) => setQuery((current) => ({ ...current, page: 1, securityStatus: (event.target.value || undefined) as TenderSecurityPendingQuery["securityStatus"] }))}
                options={Object.entries(SECURITY_STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
              />
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-t border-biz-border text-[12px]">
            <thead className="bg-[#F7FAFF] text-[11px] font-semibold text-biz-navy">
              <tr className="border-b border-biz-border">
                <th className="w-10 px-4 py-2 text-left">
                  <Checkbox
                    checked={pendingItems.some((item) => item.eligible) && pendingItems.filter((item) => item.eligible).every((item) => selectedIds.has(item.id))}
                    onChange={toggleAll}
                    label="Select all eligible tenders on this page"
                    disabled={!pendingItems.some((item) => item.eligible)}
                  />
                </th>
                <th className="px-3 py-2 text-left">SL</th>
                <th className="px-3 py-2 text-left">Tender ID</th>
                <th className="px-3 py-2 text-left">Organization</th>
                <th className="px-3 py-2 text-left">Work / Tender Name</th>
                <th className="px-3 py-2 text-left">Tender Status</th>
                <th className="px-3 py-2 text-left">Submission Deadline</th>
                <th className="px-3 py-2 text-right">Security Amount (৳)</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingQuery.isLoading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-biz-muted">Loading active tenders...</td></tr>
              ) : pendingItems.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-biz-muted">No active tenders match the selected filters.</td></tr>
              ) : (
                pendingItems.map((row, index) => (
                  <tr key={row.id} className="border-b border-biz-border last:border-b-0">
                    <td className="px-4 py-2">
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleRow(row)}
                        label={row.eligible ? `Select ${row.tenderId ?? row.tenderWorkName}` : row.ineligibleReason ?? "Not eligible"}
                        disabled={!row.eligible}
                      />
                    </td>
                    <td className="px-3 py-2">{index + 1}</td>
                    <td className="px-3 py-2 font-semibold text-biz-navy">{row.tenderId ?? "N/A"}</td>
                    <td className="px-3 py-2 font-semibold">{row.organizationMaster.shortName}</td>
                    <td className="px-3 py-2">{row.tenderWorkName}</td>
                    <td className="px-3 py-2"><span className="rounded-md bg-biz-blue-soft px-2 py-1 text-[11px] font-medium text-biz-blue">{TENDER_STATUS_LABELS[row.tenderStatus] ?? row.tenderStatus}</span></td>
                    <td className="px-3 py-2">{row.submissionDeadline ? displayDate(row.submissionDeadline) : "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(row.securityAmount)}</td>
                    <td className="px-3 py-2">
                      <span className={cn("rounded-md px-2 py-1 text-[11px] font-medium", SECURITY_STATUS_META[row.securityStatus].className)}>
                        {SECURITY_STATUS_META[row.securityStatus].label}
                      </span>
                      {!row.eligible && row.ineligibleReason && <p className="mt-1 text-[10px] text-biz-muted">{row.ineligibleReason}</p>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Link href={`/tenders/${row.tenderRecordId}`}>
                        <IconButton aria-label={`View ${row.tenderId ?? row.tenderWorkName}`}><Eye className="h-4 w-4 text-biz-navy" /></IconButton>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-biz-border px-4 py-3 text-[12px]">
          <span className="text-biz-muted">
            {meta.total === 0
              ? "No active tender records found."
              : `Showing ${(meta.page - 1) * meta.limit + 1} to ${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} entries`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-biz-blue-soft px-4 py-2 font-semibold text-biz-blue">{selectedRows.length} Selected</span>
            <Button variant="outline" size="sm" disabled={selectedRows.length === 0 || markNotRequired.isPending} onClick={markSelectedNotRequired}>
              <CircleX className="h-4 w-4" />
              Mark as Not Required
            </Button>
            <Button
              size="sm"
              disabled={selectedRows.length === 0}
              onClick={openDetails}
            >
              <FileText className="h-4 w-4" />
              Create Tender Security
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={meta.page <= 1}
              onClick={() => setQuery((q) => ({ ...q, page: Math.max(1, (q.page ?? 1) - 1) }))}
              className="h-8 min-w-8 rounded-md border border-biz-border bg-white px-2 text-[12px] font-semibold text-biz-navy disabled:opacity-40"
            >
              ‹
            </button>
            <span className="px-2 text-[12px] font-semibold text-biz-navy">Page {meta.page} of {meta.totalPages}</span>
            <button
              type="button"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setQuery((q) => ({ ...q, page: Math.min(meta.totalPages, (q.page ?? 1) + 1) }))}
              className="h-8 min-w-8 rounded-md border border-biz-border bg-white px-2 text-[12px] font-semibold text-biz-navy disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      </section>

      {showDetails && <section ref={section2Ref} tabIndex={-1} className="rounded-lg border border-biz-border bg-white p-4 shadow-card outline-none">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-bold text-biz-navy">2. Configure Tender Security</h2>
            <p className="text-[11px] text-biz-muted">Complete the common setup, then review the tender-wise amounts before saving.</p>
          </div>
          <span className="rounded-full bg-biz-blue-soft px-3 py-1 text-[11px] font-semibold text-biz-blue">{selectedRows.length} Selected</span>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <div className="rounded-md border border-biz-border bg-[#FBFCFE] p-3">
            <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-biz-muted">A. Instrument &amp; Account</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Security Type <span className="text-biz-danger">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  <RadioCard selected={securityType === "PAY_ORDER"} label="Pay Order" onClick={() => updateSecurityType("PAY_ORDER")} />
                  <RadioCard selected={securityType === "BANK_GUARANTEE"} label="Bank Guarantee" onClick={() => updateSecurityType("BANK_GUARANTEE")} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Issuing Bank / Company Account <span className="text-biz-danger">*</span></label>
                <SelectInput
                  placeholder="Select bank account"
                  value={effectiveCompanyAccountId}
                  onChange={(e) => setCompanyAccountId(e.target.value)}
                  options={activeBankAccounts.map((account) => ({
                    label: `${account.bankName} — ${account.accountName}${account.accountNumber ? ` - ${account.accountNumber}` : ""}`,
                    value: account.id,
                  }))}
                />
                {activeBankAccounts.length === 0 && <p className="mt-1 text-[11px] font-medium text-biz-danger">No active bank account is available.</p>}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-biz-border bg-[#FBFCFE] p-3">
            <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-biz-muted">B. Funding &amp; Validity</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Funding Type <span className="text-biz-danger">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  <RadioCard selected={fundingType === "LOAN"} label="Loan" icon={<Landmark className="h-4 w-4" />} onClick={() => setFundingType("LOAN")} />
                  <RadioCard selected={fundingType === "CASH"} label="Cash" onClick={() => setFundingType("CASH")} />
                </div>
              </div>
              {fundingType === "LOAN" && <div>
                <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Bank Loan Interest Rate (% p.a.) <span className="text-biz-danger">*</span></label>
                <div className="flex"><TextInput type="number" min={0} value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className="rounded-r-none text-right" /><span className="flex h-11 w-10 items-center justify-center rounded-r-sm border border-l-0 border-biz-border bg-biz-bg text-[13px] font-semibold">%</span></div>
              </div>}
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Issue Date <span className="text-biz-danger">*</span></label>
                <DateInput value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Validity (Months) <span className="text-biz-danger">*</span></label>
                <TextInput type="number" min={1} value={validityMonths} onChange={(e) => setValidityMonths(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Expiry Date</label>
                <div className="relative"><Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" /><input value={displayDate(expiryDate)} readOnly className="h-11 w-full rounded-sm border border-biz-border bg-slate-50 px-3 pl-9 text-[13px] text-biz-text" /></div>
              </div>
              <div className={fundingType === "CASH" ? "md:col-span-2 xl:col-span-1" : "md:col-span-2"}>
                <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Remarks (optional)</label>
                <TextInput value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="mb-2 mt-4">
          <h3 className="text-[14px] font-bold text-biz-navy">C. Tender-wise Amounts</h3>
          <p className="text-[11px] text-biz-muted">Enter each security amount and company cash margin. Bank finance is calculated automatically.</p>
        </div>
        <div className="overflow-x-auto rounded-md border border-biz-border">
          <table className="w-full min-w-[1120px] text-[12px]">
            <thead className="bg-[#F7FAFF] text-[11px] font-semibold text-biz-navy">
              <tr className="border-b border-biz-border">
                {["SL", "Tender ID", "Organization", "Work / Tender Name", "Security Amount (৳)", "Company Cash Margin %", "Company Margin Amount (৳)", ...(fundingType === "LOAN" ? ["Bank Finance (৳)"] : []), `Reference No. (${securityType === "BANK_GUARANTEE" ? "BG No." : "PO No."})`].map((header) => (
                  <th key={header} className="px-3 py-2 text-left">{header}</th>
                ))}
                <th className="px-3 py-2 text-center">Remove</th>
              </tr>
            </thead>
            <tbody>
              {selectedRows.length === 0 ? (
                <tr><td colSpan={fundingType === "LOAN" ? 10 : 9} className="px-4 py-8 text-center text-biz-muted">No selected tenders. Select one or more eligible tenders above.</td></tr>
              ) : (
                selectedRows.map((row, index) => {
                  const securityAmount = Number(row.securityAmount || 0);
                  const marginAmount = (securityAmount * Number(row.marginPercentage || 0)) / 100;
                  const bankFinance = securityAmount - marginAmount;
                  return (
                    <tr key={row.id} className="border-b border-biz-border last:border-b-0">
                      <td className="px-3 py-1.5">{index + 1}</td>
                      <td className="px-3 py-1.5 font-semibold text-biz-navy">{row.tenderId}</td>
                      <td className="px-3 py-1.5 font-semibold">{row.organizationMaster.shortName}</td>
                      <td className="px-3 py-1.5">{row.tenderWorkName}</td>
                      <td className="px-3 py-1.5"><input type="number" min={0.01} value={row.securityAmount} onFocus={() => { if (Number(row.securityAmount) === 0) setSelectedValue(row.id, "securityAmount", ""); }} onChange={(e) => setSelectedValue(row.id, "securityAmount", e.target.value)} className="h-8 w-32 rounded border border-biz-border px-2 text-right" /></td>
                      <td className="px-3 py-1.5"><div className="flex"><input type="number" min={0} max={100} value={row.marginPercentage} onChange={(e) => setSelectedValue(row.id, "marginPercentage", e.target.value)} className="h-8 w-20 rounded-l border border-biz-border px-2 text-right" /><span className="flex h-8 w-8 items-center justify-center rounded-r border border-l-0 border-biz-border bg-biz-bg">%</span></div></td>
                      <td className="px-3 py-1.5"><input readOnly value={money(marginAmount)} className="h-8 w-32 rounded border border-biz-border bg-slate-50 px-2 text-right" /></td>
                      {fundingType === "LOAN" && <td className="px-3 py-1.5"><input readOnly value={money(bankFinance)} className="h-8 w-32 rounded border border-biz-border bg-slate-50 px-2 text-right" /></td>}
                      <td className="px-3 py-1.5"><input value={row.referenceNo} onChange={(e) => setSelectedValue(row.id, "referenceNo", e.target.value)} className="h-8 w-40 rounded border border-biz-border px-2" /></td>
                      <td className="px-3 py-1.5 text-center"><IconButton aria-label={`Remove ${row.tenderId ?? row.tenderWorkName}`} onClick={() => removeSelectedTender(row.id)}><Trash2 className="h-4 w-4 text-biz-danger" /></IconButton></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="sticky bottom-0 z-10 mt-3 rounded-md border border-biz-border bg-white/95 p-3 shadow-[0_-6px_18px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="flex justify-center">
          <div className={`grid w-full max-w-[650px] ${fundingType === "LOAN" ? "grid-cols-3" : "grid-cols-2"} overflow-hidden rounded-md border border-biz-border bg-[#F7FAFF] text-center text-[12px]`}>
            <div className="border-r border-biz-border px-4 py-3"><div className="font-semibold text-biz-blue">Total Security Amount (৳)</div><div className="mt-1 text-[17px] font-bold text-biz-blue">{money(totals.security)}</div></div>
            <div className="border-r border-biz-border px-4 py-3"><div className="font-semibold text-biz-success">Total Company Margin (৳)</div><div className="mt-1 text-[17px] font-bold text-biz-success">{money(totals.margin)}</div></div>
            {fundingType === "LOAN" && <div className="px-4 py-3"><div className="font-semibold text-biz-navy">Bank Finance Amount (৳)</div><div className="mt-1 text-[17px] font-bold text-biz-navy">{money(totals.finance)}</div></div>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-3 border-t border-biz-border pt-3">
          <Button variant="outline" className="w-28" onClick={() => setShowDetails(false)}>Cancel</Button>
          <Button className="min-w-52" disabled={!canSave || createTenderSecurity.isPending} onClick={save}>
            <Save className="h-4 w-4" />
            {createTenderSecurity.isPending ? "Saving..." : `Save Tender Security (${selectedRows.length})`}
          </Button>
        </div>
        </div>
      </section>}
    </div>
  );
}
