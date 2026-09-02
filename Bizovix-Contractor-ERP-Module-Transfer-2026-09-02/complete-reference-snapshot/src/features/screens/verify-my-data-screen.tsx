"use client";

import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  CircleAlert,
  Download,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSessionContext } from "@/hooks/use-session-context";
import { downloadCsv } from "@/lib/download";
import { formatAmount, formatDateTime } from "@/lib/format";
import { moneyAmountsEqual, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { listWorkspaces } from "@/services/workspace.service";
import { listDayBook } from "@/services/voucher.service";
import { loadParties } from "@/features/screens/parties-screen";
import { loadInventoryItems } from "@/features/screens/inventory-screen";
import type { PartyRecord, StockItemRecord, VoucherRecord } from "@/types/domain";

type CheckStatus = "passed" | "warning" | "critical";

interface VerificationCheck {
  id: string;
  name: string;
  coverage: string;
  issues: number;
  status: CheckStatus;
  lastRun: string;
  summary: string;
  recommendation: string;
  issueLog: string[];
}

function formatTimestamp(value: Date) {
  return formatDateTime(value);
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function createVoucherBalanceCheck(vouchers: VoucherRecord[], lastRun: string): VerificationCheck {
  const issueLog = vouchers.flatMap((voucher) => {
    const issues: string[] = [];
    if (!moneyAmountsEqual(voucher.debit, voucher.credit)) {
      issues.push(
        `${voucher.voucherNumber}: debit ${formatAmount(voucher.debit)} and credit ${formatAmount(voucher.credit)} do not match.`,
      );
    }

    const lineDebit = sumMoney(voucher.lines.map((line) => line.debit));
    const lineCredit = sumMoney(voucher.lines.map((line) => line.credit));
    if (!moneyAmountsEqual(lineDebit, lineCredit)) {
      issues.push(
        `${voucher.voucherNumber}: voucher lines are imbalanced (${formatAmount(lineDebit)} vs ${formatAmount(lineCredit)}).`,
      );
    }

    return issues;
  });

  return {
    id: "voucher-balance-check",
    name: "Voucher Balance Check",
    coverage: "Current Workspace",
    issues: issueLog.length,
    status: issueLog.length ? "critical" : "passed",
    lastRun,
    summary: issueLog.length
      ? `${issueLog.length} balance problem${issueLog.length > 1 ? "s" : ""} detected in vouchers.`
      : "All voucher totals and line balances are aligned.",
    recommendation: issueLog.length
      ? "Open each affected voucher and align debit, credit, and line totals before export or closing."
      : "No action needed.",
    issueLog,
  };
}

function createPartyDuplicateCheck(parties: PartyRecord[], lastRun: string): VerificationCheck {
  const seen = new Map<string, PartyRecord[]>();
  for (const party of parties) {
    const key = normalizeName(party.name);
    const group = seen.get(key) ?? [];
    group.push(party);
    seen.set(key, group);
  }

  const issueLog = Array.from(seen.values())
    .filter((group) => group.length > 1)
    .map((group) => {
      const sample = group.map((party) => `${party.name} (${party.type})`).join(", ");
      return `Duplicate party group found: ${sample}.`;
    });

  return {
    id: "party-duplicate-scan",
    name: "Party Duplicate Scan",
    coverage: "Customers + Suppliers",
    issues: issueLog.length,
    status: issueLog.length ? "warning" : "passed",
    lastRun,
    summary: issueLog.length
      ? `${issueLog.length} duplicate party group${issueLog.length > 1 ? "s" : ""} found.`
      : "No duplicate party names found in this workspace.",
    recommendation: issueLog.length
      ? "Merge or rename duplicates so statements, reminders, and reports stay clean."
      : "No action needed.",
    issueLog,
  };
}

function createStockIntegrityCheck(items: StockItemRecord[], lastRun: string): VerificationCheck {
  const issueLog = items.flatMap((item) => {
    const issues: string[] = [];
    if (!item.itemName.trim()) {
      issues.push(`${item.itemCode || item.id}: item name is missing.`);
    }
    if (!item.itemCode.trim()) {
      issues.push(`${item.itemName || item.id}: item code is missing.`);
    }
    if (item.openingRate < 0) {
      issues.push(`${item.itemName}: purchase/opening rate cannot be negative.`);
    }
    if (item.reorderLevel < 0) {
      issues.push(`${item.itemName}: minimum stock cannot be negative.`);
    }
    return issues;
  });

  return {
    id: "stock-integrity-review",
    name: "Stock Integrity Review",
    coverage: "Inventory Items",
    issues: issueLog.length,
    status: issueLog.length ? "warning" : "passed",
    lastRun,
    summary: issueLog.length
      ? `${issueLog.length} stock master issue${issueLog.length > 1 ? "s" : ""} detected.`
      : "Item master data looks healthy for current stock controls.",
    recommendation: issueLog.length
      ? "Fix missing item identity fields and invalid stock configuration before barcode, bulk edit, or reports."
      : "No action needed.",
    issueLog,
  };
}

function createPartyContactCheck(parties: PartyRecord[], lastRun: string): VerificationCheck {
  const issueLog = parties
    .filter((party) => !party.contact.trim())
    .map((party) => `${party.name}: contact number or email is empty.`);

  return {
    id: "empty-party-contact-check",
    name: "Empty Party Contact Check",
    coverage: "Customer + Supplier Master",
    issues: issueLog.length,
    status: issueLog.length ? "warning" : "passed",
    lastRun,
    summary: issueLog.length
      ? `${issueLog.length} part${issueLog.length > 1 ? "ies have" : "y has"} missing contact information.`
      : "Every party has a contact value saved.",
    recommendation: issueLog.length
      ? "Update missing contact details before using Sync & Share, reminders, or WhatsApp workflows."
      : "No action needed.",
    issueLog,
  };
}

function createNegativeStockCheck(items: StockItemRecord[], lastRun: string): VerificationCheck {
  const issueLog = items
    .filter((item) => item.openingQty < 0)
    .map((item) => `${item.itemName}: opening quantity is ${item.openingQty}.`);

  return {
    id: "negative-stock-watch",
    name: "Negative Stock Watch",
    coverage: "Opening Stock + Inventory",
    issues: issueLog.length,
    status: issueLog.length ? "critical" : "passed",
    lastRun,
    summary: issueLog.length
      ? `${issueLog.length} item${issueLog.length > 1 ? "s are" : " is"} below zero stock.`
      : "No negative opening stock detected.",
    recommendation: issueLog.length
      ? "Adjust stock quantities before export, barcode generation, or purchase analysis."
      : "No action needed.",
    issueLog,
  };
}

function createReferenceCoverageCheck(vouchers: VoucherRecord[], lastRun: string): VerificationCheck {
  const issueLog = vouchers.flatMap((voucher) => {
    const issues: string[] = [];
    const needsParty = ["sales", "purchase", "credit-note", "debit-note"].includes(voucher.voucherType);
    if (needsParty && !voucher.partyName.trim()) {
      issues.push(`${voucher.voucherNumber}: party name is missing.`);
    }

    if (!voucher.reference?.trim()) {
      issues.push(`${voucher.voucherNumber}: reference number is empty.`);
    }

    if (!voucher.lines.length) {
      issues.push(`${voucher.voucherNumber}: no accounting lines found.`);
    }

    return issues;
  });

  return {
    id: "reference-coverage-check",
    name: "Reference Coverage Check",
    coverage: "Voucher Header + Ledger Lines",
    issues: issueLog.length,
    status: issueLog.length ? "warning" : "passed",
    lastRun,
    summary: issueLog.length
      ? `${issueLog.length} voucher reference or line issue${issueLog.length > 1 ? "s" : ""} found.`
      : "References and ledger lines are present across vouchers.",
    recommendation: issueLog.length
      ? "Complete voucher references and ledger lines so audit trails remain usable."
      : "No action needed.",
    issueLog,
  };
}

function buildVerificationChecks(
  vouchers: VoucherRecord[],
  parties: PartyRecord[],
  items: StockItemRecord[],
  lastRun: string,
) {
  return [
    createVoucherBalanceCheck(vouchers, lastRun),
    createPartyDuplicateCheck(parties, lastRun),
    createStockIntegrityCheck(items, lastRun),
    createPartyContactCheck(parties, lastRun),
    createNegativeStockCheck(items, lastRun),
    createReferenceCoverageCheck(vouchers, lastRun),
  ];
}

function statusMeta(status: CheckStatus) {
  if (status === "passed") {
    return {
      icon: BadgeCheck,
      label: "Passed",
      badgeClass: "bg-[#e9f9ef] text-[#0f9d57]",
      cardClass: "border-[#dff2e6] bg-[#f8fdf9]",
      iconClass: "text-[#0f9d57]",
    };
  }

  if (status === "critical") {
    return {
      icon: CircleAlert,
      label: "Critical",
      badgeClass: "bg-[#fff0ed] text-[#e05243]",
      cardClass: "border-[#ffd8d1] bg-[#fffaf8]",
      iconClass: "text-[#e05243]",
    };
  }

  return {
    icon: AlertTriangle,
    label: "Needs Attention",
    badgeClass: "bg-[#fff6e7] text-[#d9822b]",
    cardClass: "border-[#ffe6be] bg-[#fffdf8]",
    iconClass: "text-[#d9822b]",
  };
}

const STATUS_PRIORITY: Record<CheckStatus, number> = { critical: 0, warning: 1, passed: 2 };

export function VerifyMyDataScreen() {
  const { mode, session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "";
  const [lastRunAt, setLastRunAt] = useState(() => new Date());
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());

  const vouchersQuery = useQuery({
    queryKey: [mode, "verify-data-vouchers", workspaceId],
    queryFn: () => listDayBook(mode, { workspaceId }),
    enabled: Boolean(workspaceId),
  });
  const partiesQuery = useQuery({
    queryKey: [mode, "verify-data-parties", workspaceId],
    queryFn: () => loadParties(mode, workspaceId),
    enabled: Boolean(workspaceId),
  });
  const itemsQuery = useQuery({
    queryKey: [mode, "verify-data-items", workspaceId],
    queryFn: () => loadInventoryItems(mode, workspaceId),
    enabled: Boolean(workspaceId),
  });
  const workspacesQuery = useQuery({
    queryKey: [mode, "workspaces"],
    queryFn: () => listWorkspaces(mode),
    enabled: Boolean(workspaceId),
  });

  const workspaceAudit = useMemo(() => {
    const items: StockItemRecord[] = (itemsQuery.data ?? []).map((item) => ({
      id: item.id,
      workspaceId,
      itemCode: item.itemCode,
      itemName: item.itemName,
      category: item.category,
      unit: item.unit,
      openingQty: item.openingQty,
      openingRate: item.rate,
      reorderLevel: item.reorderLevel,
      status: item.status,
    }));

    return {
      workspaceName: workspacesQuery.data?.find((workspace) => workspace.id === workspaceId)?.name ?? "Current Workspace",
      vouchers: vouchersQuery.data ?? ([] as VoucherRecord[]),
      parties: partiesQuery.data ?? ([] as PartyRecord[]),
      items,
    };
  }, [itemsQuery.data, partiesQuery.data, vouchersQuery.data, workspaceId, workspacesQuery.data]);

  const auditLoading = vouchersQuery.isFetching || partiesQuery.isFetching || itemsQuery.isFetching;

  const checks = useMemo(
    () =>
      buildVerificationChecks(
        workspaceAudit.vouchers,
        workspaceAudit.parties,
        workspaceAudit.items,
        formatTimestamp(lastRunAt),
      ),
    [lastRunAt, workspaceAudit.items, workspaceAudit.parties, workspaceAudit.vouchers],
  );

  const failedChecks = useMemo(() => checks.filter((check) => check.issues > 0), [checks]);
  const passedChecks = checks.length - failedChecks.length;
  const totalIssues = failedChecks.reduce((sum, check) => sum + check.issues, 0);
  const sortedChecks = useMemo(
    () => [...checks].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]),
    [checks],
  );

  async function handleRunVerification() {
    await Promise.all([vouchersQuery.refetch(), partiesQuery.refetch(), itemsQuery.refetch()]);
    setLastRunAt(new Date());
    toast.success("Workspace data verification completed");
  }

  function toggleCheckExpanded(id: string) {
    setExpandedChecks((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function isCheckExpanded(check: VerificationCheck) {
    const defaultExpanded = check.status !== "passed";
    return expandedChecks.has(check.id) ? !defaultExpanded : defaultExpanded;
  }

  function handleDownloadAuditReport() {
    const rows = checks.flatMap((check) => {
      if (!check.issueLog.length) {
        return [
          {
            "Check Name": check.name,
            Coverage: check.coverage,
            Status: check.status,
            "Issues Found": String(check.issues),
            "Last Run": check.lastRun,
            Detail: "No issue found",
            Recommendation: check.recommendation,
          },
        ];
      }

      return check.issueLog.map((detail) => ({
        "Check Name": check.name,
        Coverage: check.coverage,
        Status: check.status,
        "Issues Found": String(check.issues),
        "Last Run": check.lastRun,
        Detail: detail,
        Recommendation: check.recommendation,
      }));
    });

    downloadCsv(
      `${workspaceAudit.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-verify-my-data-audit.csv`,
      rows,
    );
    toast.success("Audit report downloaded");
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="rounded-[8px] border border-[#d9e1ed] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf2f7] px-5 py-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#fff7ef] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
              <ShieldCheck className="h-4 w-4" />
              Workspace Audit
            </div>
            <div>
              <h1 className="text-[24px] font-semibold text-[#1d2d4a]">Verify My Data</h1>
              <p className="mt-1 max-w-[760px] text-[14px] leading-6 text-[#667892]">
                Audit vouchers, parties, and inventory of <span className="font-semibold text-[#20344f]">{workspaceAudit.workspaceName}</span> before backup, export, closing, or team sharing.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadAuditReport}
              className="h-10 rounded-full border-[#d8e2ef] px-4 text-[#2f4566]"
            >
              <Download className="h-4 w-4" />
              Download Report
            </Button>
            <Button
              type="button"
              onClick={() => void handleRunVerification()}
              disabled={auditLoading}
              className="h-10 rounded-full bg-primary px-5 text-white hover:bg-[#cf670f]"
            >
              <RefreshCcw className={cn("h-4 w-4", auditLoading ? "animate-spin" : "")} />
              {auditLoading ? "Verifying..." : "Run Verification"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[8px] border border-[#dce7f3] bg-[#fbfdff] px-4 py-3">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#7f8fa8]">Checks Run</div>
            <div className="mt-2 text-[24px] font-semibold text-[#1f314d]">{checks.length}</div>
            <div className="mt-1 text-[13px] text-[#74839a]">Vouchers, parties, stock, references</div>
          </div>

          <div className="rounded-[8px] border border-[#dce7f3] bg-[#fbfdff] px-4 py-3">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#7f8fa8]">Passed</div>
            <div className="mt-2 text-[24px] font-semibold text-[#12965b]">{passedChecks}</div>
            <div className="mt-1 text-[13px] text-[#74839a]">Healthy checks</div>
          </div>

          <div className="rounded-[8px] border border-[#dce7f3] bg-[#fbfdff] px-4 py-3">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#7f8fa8]">Issues Found</div>
            <div className="mt-2 text-[24px] font-semibold text-[#e16a3d]">{totalIssues}</div>
            <div className="mt-1 text-[13px] text-[#74839a]">Need cleanup</div>
          </div>

          <div className="rounded-[8px] border border-[#dce7f3] bg-[#fbfdff] px-4 py-3">
            <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-[#7f8fa8]">Last Run</div>
            <div className="mt-2 text-[18px] font-semibold text-[#1f314d]">{formatTimestamp(lastRunAt)}</div>
            <div className="mt-1 text-[13px] text-[#74839a]">Fresh snapshot</div>
          </div>
        </div>
      </div>

      {failedChecks.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-[#cfe0f3] bg-[#f9fcff] px-5 py-10 text-center shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
          <BadgeCheck className="mx-auto h-10 w-10 text-[#14a25f]" />
          <div className="mt-3 text-[18px] font-semibold text-[#1f314d]">No issue found</div>
          <p className="mt-1 text-[14px] leading-6 text-[#73839a]">
            This workspace is clean for backup, reports, export, and next-step accounting work.
          </p>
        </div>
      ) : null}

      <div className="min-w-0 rounded-[8px] border border-[#d9e1ed] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf2f7] pb-3">
          <div>
            <h2 className="text-[19px] font-semibold text-[#1d2d4a]">Verification Results</h2>
            <p className="mt-1 text-[13px] text-[#72839a]">Live records from the {workspaceAudit.workspaceName} workspace, most urgent first.</p>
          </div>
          <div className="rounded-full bg-[#eef4ff] px-3 py-1 text-[13px] font-medium text-[#476b9c]">
            {failedChecks.length ? `${failedChecks.length} need attention` : "All checks healthy"}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {sortedChecks.map((check) => {
            const meta = statusMeta(check.status);
            const StatusIcon = meta.icon;
            const expanded = isCheckExpanded(check);

            return (
              <div key={check.id} className={cn("rounded-[8px] border", meta.cardClass)}>
                <button
                  type="button"
                  onClick={() => toggleCheckExpanded(check.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusIcon className={cn("h-4 w-4 shrink-0", meta.iconClass)} />
                    <h3 className="text-[15px] font-semibold text-[#213652]">{check.name}</h3>
                    <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", meta.badgeClass)}>
                      {check.status === "passed" ? meta.label : `${check.issues} ${meta.label}`}
                    </span>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#8391a7] transition-transform", expanded ? "rotate-180" : "")} />
                </button>

                {expanded ? (
                  <div className="border-t border-white/60 px-4 pb-3 pt-2">
                    <div className="text-[13px] font-medium text-[#6f8097]">{check.coverage}</div>
                    <p className="mt-1 text-[13px] leading-5 text-[#5f6f86]">{check.summary}</p>

                    {check.issueLog.length ? (
                      <div className="mt-2 space-y-1.5">
                        {check.issueLog.map((issue, index) => (
                          <div key={`${check.id}-${index}`} className="rounded-[6px] border border-white/60 bg-white/80 px-3 py-2 text-[13px] leading-5 text-[#4f627b]">
                            {issue}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-2 rounded-[6px] bg-white/70 px-3 py-2 text-[12px] leading-5 text-[#54657e]">
                      <span className="font-semibold text-[#20344f]">What to do:</span> {check.recommendation}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

