"use client";

import * as React from "react";
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
} from "lucide-react";
import {
  useBankAccounts,
  useCreateTenderSecurity,
  useMarkTenderSecurityNotRequired,
  usePendingTenderSecurities,
} from "@bizovix/api-client";
import type { FundingType, PendingTenderSecurity, SecurityType, TenderSecurityPendingQuery } from "@bizovix/types";
import { Button, DateInput, IconButton, SelectInput, TextInput, cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

type SelectedTender = PendingTenderSecurity & {
  securityAmount: string;
  marginPercentage: string;
  referenceNo: string;
};

const DEFAULT_QUERY: TenderSecurityPendingQuery = { page: 1, limit: 5 };

const fallbackPending: PendingTenderSecurity[] = [
  {
    id: "demo-1024587",
    tenderId: "1024587",
    organizationMasterId: "demo-dphe",
    organizationMaster: { id: "demo-dphe", shortName: "DPHE", fullName: "Department of Public Health Engineering" },
    tenderWorkName: "Supply of LED Display at Patuakhali",
    purchaseDate: "2024-05-10T00:00:00.000Z",
    securityAmount: "500000.00",
    status: "Security Not Given",
  },
  {
    id: "demo-1024523",
    tenderId: "1024523",
    organizationMasterId: "demo-pwd",
    organizationMaster: { id: "demo-pwd", shortName: "PWD", fullName: "Public Works Department" },
    tenderWorkName: "Electrical Works at Cox's Bazar",
    purchaseDate: "2024-05-08T00:00:00.000Z",
    securityAmount: "300000.00",
    status: "Security Not Given",
  },
  {
    id: "demo-1024480",
    tenderId: "1024480",
    organizationMasterId: "demo-lged",
    organizationMaster: { id: "demo-lged", shortName: "LGED", fullName: "Local Government Engineering Department" },
    tenderWorkName: "Road Improvement Work",
    purchaseDate: "2024-05-02T00:00:00.000Z",
    securityAmount: "750000.00",
    status: "Security Not Given",
  },
  {
    id: "demo-1024401",
    tenderId: "1024401",
    organizationMasterId: "demo-rhd",
    organizationMaster: { id: "demo-rhd", shortName: "RHD", fullName: "Roads and Highways Department" },
    tenderWorkName: "Rehabilitation of Road",
    purchaseDate: "2024-04-28T00:00:00.000Z",
    securityAmount: "400000.00",
    status: "Security Not Given",
  },
  {
    id: "demo-1024322",
    tenderId: "1024322",
    organizationMasterId: "demo-dphe",
    organizationMaster: { id: "demo-dphe", shortName: "DPHE", fullName: "Department of Public Health Engineering" },
    tenderWorkName: "Drilling of Deep Tube Well",
    purchaseDate: "2024-04-20T00:00:00.000Z",
    securityAmount: "250000.00",
    status: "Security Not Given",
  },
];

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

function toSelectedTender(row: PendingTenderSecurity, securityType: SecurityType): SelectedTender {
  return {
    ...row,
    securityAmount: Number(row.securityAmount).toFixed(2),
    marginPercentage: "10.00",
    referenceNo: makeReference(row.tenderId, securityType),
  };
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onChange}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded border transition-colors",
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
  const pendingQuery = usePendingTenderSecurities(query);
  const bankAccounts = useBankAccounts();
  const createTenderSecurity = useCreateTenderSecurity();
  const markNotRequired = useMarkTenderSecurityNotRequired();

  const [securityType, setSecurityType] = React.useState<SecurityType>("PAY_ORDER");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(fallbackPending.slice(0, 3).map((item) => item.id)),
  );
  const [selectedRows, setSelectedRows] = React.useState<SelectedTender[]>(() =>
    fallbackPending.slice(0, 3).map((item) => toSelectedTender(item, "PAY_ORDER")),
  );
  const [fundingType, setFundingType] = React.useState<FundingType>("LOAN");
  const [bankId, setBankId] = React.useState("");
  const [chargeFromAccountId, setChargeFromAccountId] = React.useState("");
  const [issueDate, setIssueDate] = React.useState("2024-05-13");
  const [validityMonths, setValidityMonths] = React.useState("4");
  const [interestRate, setInterestRate] = React.useState("15.00");
  const [remarks, setRemarks] = React.useState("PO will be issued for selected tenders");
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const pendingItems = pendingQuery.data?.items?.length ? pendingQuery.data.items : fallbackPending;
  const meta = pendingQuery.data?.meta ?? { page: 1, limit: 5, total: 12, totalPages: 3 };
  const expiryDate = addMonths(issueDate, Number(validityMonths || 0));
  const firstBank = bankAccounts.data?.find((account) => account.accountType === "BANK") ?? bankAccounts.data?.[0];
  const effectiveBankId = bankId || firstBank?.id || "";
  const effectiveChargeFromAccountId = chargeFromAccountId || firstBank?.id || "";

  function toggleRow(row: PendingTenderSecurity) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
    setSelectedRows((rows) => {
      if (rows.some((item) => item.id === row.id)) return rows.filter((item) => item.id !== row.id);
      return [...rows, toSelectedTender(row, securityType)];
    });
  }

  function toggleAll() {
    const allSelected = pendingItems.every((item) => selectedIds.has(item.id));
    if (allSelected) {
      setSelectedIds(new Set());
      setSelectedRows([]);
    } else {
      setSelectedIds(new Set(pendingItems.map((item) => item.id)));
      setSelectedRows(pendingItems.map((item) => toSelectedTender(item, securityType)));
    }
  }

  function setSelectedValue(id: string, key: keyof Pick<SelectedTender, "securityAmount" | "marginPercentage" | "referenceNo">, value: string) {
    setSelectedRows((rows) => rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }

  function updateSecurityType(next: SecurityType) {
    setSecurityType(next);
    setSelectedRows((rows) => rows.map((row) => ({ ...row, referenceNo: makeReference(row.tenderId, next) })));
  }

  const totals = selectedRows.reduce(
    (acc, row) => {
      const securityAmount = Number(row.securityAmount || 0);
      const marginAmount = (securityAmount * Number(row.marginPercentage || 0)) / 100;
      return {
        security: acc.security + securityAmount,
        margin: acc.margin + marginAmount,
        finance: acc.finance + securityAmount - marginAmount,
      };
    },
    { security: 0, margin: 0, finance: 0 },
  );

  async function save() {
    setMessage(null);
    try {
      await createTenderSecurity.mutateAsync({
        securityType,
        bankId: effectiveBankId,
        fundingType,
        issueDate,
        validityMonths: Number(validityMonths),
        expiryDate,
        interestRate: Number(interestRate),
        chargeFromAccountId: effectiveChargeFromAccountId,
        remarks,
        items: selectedRows.map((row) => ({
          documentPurchaseId: row.id,
          securityAmount: Number(row.securityAmount),
          marginPercentage: Number(row.marginPercentage),
          referenceNo: row.referenceNo,
        })),
      });
      setMessage({ type: "success", text: "Tender security saved successfully." });
      setSelectedIds(new Set());
      setSelectedRows([]);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save tender security." });
    }
  }

  async function markSelectedNotRequired() {
    setMessage(null);
    try {
      await markNotRequired.mutateAsync({ documentPurchaseIds: Array.from(selectedIds) });
      setMessage({ type: "success", text: "Selected tenders marked as not required." });
      setSelectedIds(new Set());
      setSelectedRows([]);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to update selected tenders." });
    }
  }

  return (
    <div className="flex flex-col gap-3 text-biz-text">
      <div>
        <h1 className="text-[22px] font-bold leading-7 text-biz-navy">Tender Security</h1>
        <p className="text-[13px] text-biz-muted">
          Select one or more tenders to create Tender Security (Pay Order / Bank Guarantee)
        </p>
      </div>

      {message && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-[12px] font-medium",
            message.type === "success"
              ? "border-biz-success/20 bg-biz-success-soft text-biz-success"
              : "border-biz-danger/20 bg-biz-danger-soft text-biz-danger",
          )}
        >
          {message.text}
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-[15px] font-bold text-biz-navy">
            1. Pending Tender Security <span className="ml-2 rounded-md bg-biz-blue-soft px-2 py-1 text-[12px] text-biz-blue">12</span>
          </h2>
          <div className="flex items-center gap-2">
            <IconButton aria-label="Refresh" onClick={() => pendingQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-t border-biz-border text-[12px]">
            <thead className="bg-[#F7FAFF] text-[11px] font-semibold text-biz-navy">
              <tr className="border-b border-biz-border">
                <th className="w-10 px-4 py-2 text-left">
                  <Checkbox checked={pendingItems.every((item) => selectedIds.has(item.id))} onChange={toggleAll} label="Select all" />
                </th>
                <th className="px-3 py-2 text-left">SL</th>
                <th className="px-3 py-2 text-left">Tender ID</th>
                <th className="px-3 py-2 text-left">Organization</th>
                <th className="px-3 py-2 text-left">Work / Tender Name</th>
                <th className="px-3 py-2 text-left">Document Purchase Date</th>
                <th className="px-3 py-2 text-right">Security Amount (৳)</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingQuery.isLoading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-biz-muted">Loading pending tenders...</td></tr>
              ) : pendingItems.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-biz-muted">No pending tender security found.</td></tr>
              ) : (
                pendingItems.map((row, index) => (
                  <tr key={row.id} className="border-b border-biz-border last:border-b-0">
                    <td className="px-4 py-2"><Checkbox checked={selectedIds.has(row.id)} onChange={() => toggleRow(row)} label={`Select ${row.tenderId}`} /></td>
                    <td className="px-3 py-2">{index + 1}</td>
                    <td className="px-3 py-2 font-semibold text-biz-navy">{row.tenderId ?? "N/A"}</td>
                    <td className="px-3 py-2 font-semibold">{row.organizationMaster.shortName}</td>
                    <td className="px-3 py-2">{row.tenderWorkName}</td>
                    <td className="px-3 py-2">{displayDate(row.purchaseDate)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(row.securityAmount)}</td>
                    <td className="px-3 py-2"><span className="rounded-md bg-biz-orange-soft px-2 py-1 text-[11px] font-medium text-biz-orange">Security Not Given</span></td>
                    <td className="px-4 py-2 text-center"><IconButton aria-label="View"><Eye className="h-4 w-4 text-biz-navy" /></IconButton></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-biz-border px-4 py-3 text-[12px]">
          <span className="text-biz-muted">Showing 1 to {pendingItems.length} of {meta.total} entries</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-biz-blue-soft px-4 py-2 font-semibold text-biz-blue">{selectedRows.length} Selected</span>
            <Button variant="outline" size="sm" disabled={selectedRows.length === 0 || markNotRequired.isPending} onClick={markSelectedNotRequired}>
              <CircleX className="h-4 w-4" />
              Mark as Not Required
            </Button>
            <Button size="sm" disabled={selectedRows.length === 0}>
              <FileText className="h-4 w-4" />
              Create Tender Security
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {["‹", "1", "2", "3", "›"].map((page) => (
              <button key={page} className={cn("h-8 min-w-8 rounded-md border px-2 text-[12px] font-semibold", page === "1" ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border bg-white text-biz-navy")}>{page}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
        <h2 className="mb-3 text-[15px] font-bold text-biz-navy">2. Tender Security Information <span className="font-semibold">(For Selected Tenders)</span></h2>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_1.2fr_1.4fr_1.2fr_1fr_1.2fr]">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Security Type <span className="text-biz-danger">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              <RadioCard selected={securityType === "PAY_ORDER"} label="Pay Order" onClick={() => updateSecurityType("PAY_ORDER")} />
              <RadioCard selected={securityType === "BANK_GUARANTEE"} label="Bank Guarantee" onClick={() => updateSecurityType("BANK_GUARANTEE")} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Bank <span className="text-biz-danger">*</span></label>
            <SelectInput value={effectiveBankId} onChange={(e) => setBankId(e.target.value)} options={(bankAccounts.data ?? []).map((account) => ({ label: account.bankName ?? account.accountName, value: account.id }))} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Funding Type <span className="text-biz-danger">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              <RadioCard selected={fundingType === "LOAN"} label="Loan" icon={<Landmark className="h-4 w-4" />} onClick={() => setFundingType("LOAN")} />
              <RadioCard selected={fundingType === "CASH"} label="Cash" onClick={() => setFundingType("CASH")} />
            </div>
          </div>
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
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" />
              <input value={displayDate(expiryDate)} readOnly className="h-11 w-full rounded-sm border border-biz-border bg-white px-3 pl-9 text-[13px] text-biz-text" />
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_1.7fr_4fr]">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Interest Rate (% p.a.) <span className="text-biz-danger">*</span></label>
            <div className="flex">
              <TextInput value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className="rounded-r-none text-right" />
              <span className="flex h-11 w-10 items-center justify-center rounded-r-sm border border-l-0 border-biz-border bg-biz-bg text-[13px] font-semibold">%</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Charge From (Margin & Bank Charge) <span className="text-biz-danger">*</span></label>
            <SelectInput value={effectiveChargeFromAccountId} onChange={(e) => setChargeFromAccountId(e.target.value)} options={(bankAccounts.data ?? []).map((account) => ({ label: `${account.bankName ?? account.accountName}${account.accountNumber ? ` - ${account.accountNumber}` : ""}`, value: account.id }))} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-biz-navy">Remarks (optional)</label>
            <TextInput value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>

        <h3 className="mb-2 mt-4 text-[14px] font-bold text-biz-navy">3. Selected Tenders</h3>
        <div className="overflow-x-auto rounded-md border border-biz-border">
          <table className="w-full min-w-[1120px] text-[12px]">
            <thead className="bg-[#F7FAFF] text-[11px] font-semibold text-biz-navy">
              <tr className="border-b border-biz-border">
                {["SL", "Tender ID", "Organization", "Work / Tender Name", "Security Amount (৳)", "Margin %", "Margin Amount (৳)", "Bank Finance (৳)", `Reference No. (${securityType === "BANK_GUARANTEE" ? "BG No." : "PO No."})`].map((header) => (
                  <th key={header} className="px-3 py-2 text-left">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-biz-muted">No selected tenders. Select one or more pending tenders above.</td></tr>
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
                      <td className="px-3 py-1.5"><input value={row.securityAmount} onChange={(e) => setSelectedValue(row.id, "securityAmount", e.target.value)} className="h-8 w-32 rounded border border-biz-border px-2 text-right" /></td>
                      <td className="px-3 py-1.5"><div className="flex"><input value={row.marginPercentage} onChange={(e) => setSelectedValue(row.id, "marginPercentage", e.target.value)} className="h-8 w-20 rounded-l border border-biz-border px-2 text-right" /><span className="flex h-8 w-8 items-center justify-center rounded-r border border-l-0 border-biz-border bg-biz-bg">%</span></div></td>
                      <td className="px-3 py-1.5"><input readOnly value={money(marginAmount)} className="h-8 w-32 rounded border border-biz-border bg-white px-2 text-right" /></td>
                      <td className="px-3 py-1.5"><input readOnly value={money(bankFinance)} className="h-8 w-32 rounded border border-biz-border bg-white px-2 text-right" /></td>
                      <td className="px-3 py-1.5"><input value={row.referenceNo} onChange={(e) => setSelectedValue(row.id, "referenceNo", e.target.value)} className="h-8 w-40 rounded border border-biz-border px-2" /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex justify-center">
          <div className="grid w-full max-w-[650px] grid-cols-3 overflow-hidden rounded-md border border-biz-border bg-[#F7FAFF] text-center text-[12px]">
            <div className="border-r border-biz-border px-4 py-3"><div className="font-semibold text-biz-blue">Total Security Amount (৳)</div><div className="mt-1 text-[17px] font-bold text-biz-blue">{money(totals.security)}</div></div>
            <div className="border-r border-biz-border px-4 py-3"><div className="font-semibold text-biz-success">Total Margin (৳)</div><div className="mt-1 text-[17px] font-bold text-biz-success">{money(totals.margin)}</div></div>
            <div className="px-4 py-3"><div className="font-semibold text-biz-navy">Bank Finance Amount (৳)</div><div className="mt-1 text-[17px] font-bold text-biz-navy">{money(totals.finance)}</div></div>
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-3">
          <Button variant="outline" className="w-28">Cancel</Button>
          <Button className="w-44" disabled={selectedRows.length === 0 || createTenderSecurity.isPending} onClick={save}>
            <Save className="h-4 w-4" />
            {createTenderSecurity.isPending ? "Saving..." : "Save Tender Security"}
          </Button>
        </div>
      </section>
    </div>
  );
}
