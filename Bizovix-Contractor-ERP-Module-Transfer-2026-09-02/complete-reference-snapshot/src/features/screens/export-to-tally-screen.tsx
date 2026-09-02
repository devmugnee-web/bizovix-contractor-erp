"use client";

import { AlertCircle, CheckCircle2, Download, FileUp, Filter, History, ReceiptText, Settings2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSessionContext } from "@/hooks/use-session-context";
import { listDayBook } from "@/services/voucher.service";
import { cn } from "@/lib/utils";
import type { VoucherRecord, VoucherType } from "@/types/domain";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { AppDateInput } from "@/components/shared/app-date-input";
import { formatAmount, formatDate } from "@/lib/format";
import { roundMoney, sumMoney } from "@/lib/money";
import { buildTallyAccountingXml, parseTallyExportXml, validateVoucherForTallyExport, type TallyVoucherPreviewRecord, type TallyXmlParseResult } from "@/lib/tally-xml";
import { getPostableLedgers } from "@/services/accounts.service";
import { apiRequest } from "@/services/api-client";
import { createVoucher } from "@/services/voucher.service";
import {
  createEmptyTallySyncState,
  findTallyRemoteRecord,
  loadTallySyncState,
  markTallyRemoteImported,
  recordTallySyncBatch,
  saveTallySyncState,
  upsertTallyLedgerMapping,
  type TallyImportedRemoteInput,
  type TallySyncState,
} from "@/services/tally-sync.service";
import type { LedgerOption } from "@/types/accounts";
import type { PartyRecord, VoucherFormInput } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ExportTypeFilter = "sales" | "credit-note" | "purchase" | "debit-note" | "receipt" | "payment" | "journal" | "contra" | "sales-cancelled";

const FILTER_LABELS: Array<{ id: ExportTypeFilter; label: string }> = [
  { id: "sales", label: "Sale" },
  { id: "credit-note", label: "Credit Note" },
  { id: "purchase", label: "Purchase" },
  { id: "debit-note", label: "Purchase Return" },
  { id: "receipt", label: "Receipt" },
  { id: "payment", label: "Payment" },
  { id: "journal", label: "Journal" },
  { id: "contra", label: "Contra" },
  { id: "sales-cancelled", label: "Sale[Cancelled]" },
];

type DatePreset = "this-month" | "last-month" | "this-year" | "custom";

const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: "this-month", label: "This Month" },
  { id: "last-month", label: "Last Month" },
  { id: "this-year", label: "This Year" },
  { id: "custom", label: "Custom Range" },
];

type ColumnId = "date" | "invoiceNo" | "partyName" | "transactionType" | "paymentType" | "amount" | "balance" | "exportStatus";

const COLUMNS: Array<{ id: ColumnId; label: string }> = [
  { id: "date", label: "DATE" },
  { id: "invoiceNo", label: "INVOICE NO." },
  { id: "partyName", label: "PARTY NAME" },
  { id: "transactionType", label: "TRANSACTION TYPE" },
  { id: "paymentType", label: "PAYMENT TYPE" },
  { id: "amount", label: "AMOUNT" },
  { id: "balance", label: "BALANCE" },
  { id: "exportStatus", label: "EXPORT STATUS" },
];

function toDateInputValue(date: Date) {
  // Deliberately built from local date parts, not toISOString() — that converts to
  // UTC first, which silently shifts the date by one day for any timezone ahead of
  // UTC (e.g. "Aug 1 local midnight" becomes "Jul 31" in UTC).
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeForPreset(preset: DatePreset): { from: string; to: string } {
  const today = new Date();

  if (preset === "this-month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDateInputValue(start), to: toDateInputValue(today) };
  }

  if (preset === "last-month") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: toDateInputValue(start), to: toDateInputValue(end) };
  }

  if (preset === "this-year") {
    const start = new Date(today.getFullYear(), 0, 1);
    return { from: toDateInputValue(start), to: toDateInputValue(today) };
  }

  return { from: toDateInputValue(today), to: toDateInputValue(today) };
}

function formatTableDate(dateValue: string) {
  return formatDate(dateValue);
}

function formatVoucherType(value: VoucherType) {
  switch (value) {
    case "sales":
      return "Sale";
    case "purchase":
      return "Purchase";
    case "credit-note":
      return "Credit Note";
    case "debit-note":
      return "Debit Note";
    case "payment":
      return "Payment";
    case "receipt":
      return "Receipt";
    case "journal":
      return "Journal";
    case "expense":
      return "Expense";
    case "revenue":
      return "Revenue";
    case "contra":
      return "Contra";
    default:
      return value;
  }
}

function formatVoucherTypeForDisplay(value: VoucherType) {
  return value === "debit-note" ? "Purchase Return" : formatVoucherType(value);
}

function matchesTypeFilter(voucher: VoucherRecord, filterId: ExportTypeFilter) {
  if (filterId === "sales-cancelled") {
    return voucher.voucherType === "sales" && voucher.status === "cancelled";
  }

  return voucher.voucherType === filterId;
}

function downloadTallyXml(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/xml;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ExportToTallyButtonContent() {
  return (
    <div className="inline-flex h-11 items-center gap-2.5 rounded-lg bg-[#e96f0b] px-5 text-white shadow-[0_8px_20px_rgba(233,111,11,0.2)] transition hover:bg-[#d96308]">
      <Download className="h-[18px] w-[18px]" aria-hidden="true" />
      <span className="text-[15px] font-semibold">Export to Tally</span>
    </div>
  );
}

type TransferDirection = "export" | "import";

type ResolvedLedgerMapping = {
  kind: "account" | "party";
  id: string;
  name: string;
  accountId: string | null;
  accountCode: string | null;
};

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function requiredPartyType(voucherType: VoucherType | null): PartyRecord["type"] | null {
  if (voucherType === "sales" || voucherType === "receipt") return "customer";
  if (voucherType === "purchase" || voucherType === "payment") return "supplier";
  return null;
}

function createClientId(prefix: string) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

export function ExportToTallyScreen() {
  const { mode, session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "";
  const [datePreset, setDatePreset] = useState<DatePreset>("this-month");
  const [dateFrom, setDateFrom] = useState(() => rangeForPreset("this-month").from);
  const [dateTo, setDateTo] = useState(() => rangeForPreset("this-month").to);
  const [searchTerm, setSearchTerm] = useState("");
  const [enabledFilters, setEnabledFilters] = useState<ExportTypeFilter[]>([
    "sales",
    "credit-note",
    "purchase",
    "debit-note",
    "receipt",
    "payment",
    "journal",
    "contra",
    "sales-cancelled",
  ]);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColumnId, string>>>({});
  const [openFilterColumn, setOpenFilterColumn] = useState<ColumnId | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [direction, setDirection] = useState<TransferDirection>("export");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncState, setSyncState] = useState<TallySyncState | null>(null);
  const [companyNameDraft, setCompanyNameDraft] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSaving, setSyncSaving] = useState(false);
  const [ledgerOptions, setLedgerOptions] = useState<LedgerOption[]>([]);
  const [partyOptions, setPartyOptions] = useState<PartyRecord[]>([]);
  const [importParseResult, setImportParseResult] = useState<TallyXmlParseResult | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number } | null>(null);
  const [importOutcomes, setImportOutcomes] = useState<Record<string, { status: "created" | "failed"; message: string }>>({});

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    setSyncLoading(true);
    void loadTallySyncState(mode, workspaceId)
      .then((state) => {
        if (!active) return;
        setSyncState(state);
        setCompanyNameDraft(state.company?.name ?? "");
      })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Tally sync settings could not be loaded"); })
      .finally(() => { if (active) setSyncLoading(false); });
    return () => { active = false; };
  }, [mode, workspaceId]);

  useEffect(() => {
    if (mode !== "api" || !workspaceId) {
      setLedgerOptions([]);
      setPartyOptions([]);
      return;
    }
    let active = true;
    void Promise.all([
      getPostableLedgers(),
      apiRequest<PartyRecord[]>(`/parties?workspaceId=${encodeURIComponent(workspaceId)}`),
    ]).then(([ledgers, parties]) => {
      if (!active) return;
      setLedgerOptions(ledgers.filter((ledger) => ledger.status === "ACTIVE"));
      setPartyOptions(parties.map((party) => ({
        ...party,
        type: String(party.type).toLowerCase() === "supplier" ? "supplier" : "customer",
        status: String(party.status).toLowerCase() === "inactive" ? "inactive" : "active",
      })).filter((party): party is PartyRecord => party.status === "active"));
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Ledger and party mappings could not be loaded"); });
    return () => { active = false; };
  }, [mode, workspaceId]);

  const vouchersQuery = useQuery({
    queryKey: [mode, "export-to-tally-vouchers", workspaceId],
    queryFn: () => listDayBook(mode, { workspaceId }),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const targetElement = event.target instanceof Element ? event.target : null;
      if (targetElement?.closest('button[aria-label^="Filter "]')) {
        return;
      }
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
        setOpenFilterColumn(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function applyDatePreset(preset: DatePreset) {
    setDatePreset(preset);
    if (preset === "custom") {
      return;
    }

    const range = rangeForPreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  const rows = useMemo(
    () =>
      (vouchersQuery.data ?? []).map((voucher) => {
        const issues = validateVoucherForTallyExport(voucher).filter((issue) => issue.severity === "error");
        return {
          voucher,
          date: formatTableDate(voucher.voucherDate),
          invoiceNo: voucher.voucherNumber,
          partyName: voucher.partyName || "-",
          transactionType: voucher.status === "cancelled" && voucher.voucherType === "sales" ? "Sale[Cancelled]" : formatVoucherTypeForDisplay(voucher.voucherType),
          paymentType: voucher.settlementMode === "accounts-payable" ? "Credit" : voucher.settlementMode === "bank" ? "Bank" : "Cash",
          amount: formatAmount(voucher.amount),
          balance: formatAmount(Math.max(voucher.debit, voucher.credit)),
          exportStatus: issues.length ? "Blocked" : "Ready",
          exportIssue: issues.map((issue) => issue.message).join(" · "),
        };
      }),
    [vouchersQuery.data],
  );

  const filteredRows = useMemo(() => {
    const fromTime = new Date(dateFrom).getTime();
    const toTime = new Date(dateTo).getTime();
    const needle = searchTerm.trim().toLowerCase();
    const activeColumnFilters = Object.entries(columnFilters).filter(([, value]) => value?.trim());

    return rows.filter((row) => {
      const voucherTime = new Date(row.voucher.voucherDate).getTime();
      const inRange =
        (Number.isNaN(fromTime) || voucherTime >= fromTime) &&
        (Number.isNaN(toTime) || voucherTime <= toTime);
      const typeAllowed = enabledFilters.some((filterId) => matchesTypeFilter(row.voucher, filterId));
      const searchAllowed =
        !needle ||
        row.invoiceNo.toLowerCase().includes(needle) ||
        row.partyName.toLowerCase().includes(needle) ||
        row.transactionType.toLowerCase().includes(needle);
      const columnsAllowed = activeColumnFilters.every(([columnId, value]) =>
        row[columnId as ColumnId].toLowerCase().includes((value ?? "").trim().toLowerCase()),
      );

      return inRange && typeAllowed && searchAllowed && columnsAllowed;
    });
  }, [columnFilters, dateFrom, dateTo, enabledFilters, rows, searchTerm]);

  const exportAmount = sumMoney(filteredRows.map((row) => row.voucher.amount));
  const tallyCompanyName = syncState?.company?.name.trim() ?? "";
  function tallyLedgerNameForBizovix(bizovixLedgerName: string) {
    const mapping = syncState?.ledgerMappings.find((entry) => entry.status === "active" && entry.direction !== "import-only" && normalizeName(entry.bizovixLedgerName) === normalizeName(bizovixLedgerName));
    return mapping?.tallyLedgerName ?? bizovixLedgerName;
  }
  const exportPackage = useMemo(
    () => tallyCompanyName ? buildTallyAccountingXml(filteredRows.map((row) => ({ ...row.voucher, partyName: tallyLedgerNameForBizovix(row.voucher.partyName), lines: row.voucher.lines.map((line) => ({ ...line, ledger: tallyLedgerNameForBizovix(line.ledger) })) })), { companyName: tallyCompanyName }) : null,
    [filteredRows, syncState?.ledgerMappings, tallyCompanyName],
  );

  const importLedgerNames = useMemo(
    () => Array.from(new Set((importParseResult?.vouchers ?? []).flatMap((voucher) => voucher.ledgerEntries.map((entry) => entry.ledgerName.trim())).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [importParseResult],
  );

  function resolveLedgerMapping(tallyLedgerName: string): ResolvedLedgerMapping | null {
    const normalized = normalizeName(tallyLedgerName);
    const saved = syncState?.ledgerMappings.find((mapping) => mapping.status === "active" && normalizeName(mapping.tallyLedgerName) === normalized);
    if (saved) {
      const mappedParty = saved.bizovixLedgerKind === "party"
        ? partyOptions.find((party) => party.id === saved.bizovixLedgerId)
        : null;
      return {
        kind: saved.bizovixLedgerKind,
        id: saved.bizovixLedgerId,
        name: saved.bizovixLedgerName,
        accountId: saved.bizovixAccountId ?? mappedParty?.ledgerAccountId ?? null,
        accountCode: saved.bizovixAccountCode,
      };
    }
    const exactParty = partyOptions.find((party) => normalizeName(party.name) === normalized);
    if (exactParty) return { kind: "party", id: exactParty.id, name: exactParty.name, accountId: exactParty.ledgerAccountId ?? null, accountCode: null };
    const exactAccount = ledgerOptions.find((ledger) => normalizeName(ledger.name) === normalized);
    if (exactAccount) return { kind: "account", id: exactAccount.id, name: exactAccount.name, accountId: exactAccount.id, accountCode: exactAccount.code };
    return null;
  }

  function partyMappingForVoucher(voucher: TallyVoucherPreviewRecord) {
    const requiredType = requiredPartyType(voucher.bizovixVoucherType);
    if (!requiredType) return null;
    const preferred = voucher.partyLedgerName ? resolveLedgerMapping(voucher.partyLedgerName) : null;
    const candidate = preferred?.kind === "party"
      ? preferred
      : voucher.ledgerEntries.map((entry) => resolveLedgerMapping(entry.ledgerName)).find((mapping) => mapping?.kind === "party") ?? null;
    if (!candidate) return null;
    const party = partyOptions.find((entry) => entry.id === candidate.id && entry.type === requiredType);
    return party ? candidate : null;
  }

  function importBlockingReasons(voucher: TallyVoucherPreviewRecord) {
    const reasons = voucher.validationIssues.filter((entry) => entry.severity === "error").map((entry) => entry.message);
    if (mode !== "api") reasons.push("Real Tally import is available only in an API workspace.");
    if (!voucher.guid) reasons.push("A Tally GUID/REMOTEID is required for duplicate-safe import.");
    if (voucher.bizovixVoucherType === "credit-note" || voucher.bizovixVoucherType === "debit-note") reasons.push("Credit/Debit Notes need their original Bizovix invoice or bill mapping and are not auto-imported yet.");
    if (voucher.guid && syncState && findTallyRemoteRecord(syncState, "voucher", voucher.guid)) reasons.push("This Tally voucher has already been linked to Bizovix.");
    const unmapped = voucher.ledgerEntries.filter((entry) => !resolveLedgerMapping(entry.ledgerName)).map((entry) => entry.ledgerName);
    if (unmapped.length) reasons.push(`Map these ledgers first: ${Array.from(new Set(unmapped)).join(", ")}`);
    if (requiredPartyType(voucher.bizovixVoucherType) && !partyMappingForVoucher(voucher)) reasons.push(`Map the party ledger to an existing ${requiredPartyType(voucher.bizovixVoucherType)}.`);
    if (requiredPartyType(voucher.bizovixVoucherType) && partyMappingForVoucher(voucher)?.accountId == null) reasons.push("The mapped party is not linked to a Chart of Accounts ledger.");
    return Array.from(new Set(reasons));
  }

  const readyImportVouchers = (importParseResult?.vouchers ?? []).filter((voucher) => importBlockingReasons(voucher).length === 0);

  function toggleFilter(filterId: ExportTypeFilter) {
    setEnabledFilters((current) =>
      current.includes(filterId) ? current.filter((value) => value !== filterId) : [...current, filterId],
    );
  }

  async function handleExport() {
    if (!filteredRows.length) {
      toast.error("No vouchers available to export");
      return;
    }
    if (!tallyCompanyName || !exportPackage) {
      setSettingsOpen(true);
      toast.error("Enter the exact Tally company name before exporting.");
      return;
    }
    if (!exportPackage.exportedVouchers.length) {
      toast.error("No posted, balanced accounting vouchers are ready. Review the blocked rows.");
      return;
    }
    const fileName = `bizovix-tally-export-${dateFrom}-to-${dateTo}.xml`;
    downloadTallyXml(fileName, exportPackage.xml);
    const batchId = createClientId("tally_batch");
    try {
      let next = await recordTallySyncBatch(mode, workspaceId, {
        id: batchId,
        direction: "export-to-tally",
        transport: "xml-file",
        status: "exported",
        companyName: tallyCompanyName,
        companyGuid: syncState?.company?.guid ?? null,
        dateFrom,
        dateTo,
        fileName,
        checksumSha256: null,
        selectedCount: filteredRows.length,
        successCount: exportPackage.exportedVouchers.length,
        skippedCount: exportPackage.excludedVouchers.length,
        failedCount: 0,
        totalDebit: exportPackage.totalDebit,
        totalCredit: exportPackage.totalCredit,
        bizovixEntityIds: exportPackage.exportedVouchers.map((voucher) => voucher.voucherId),
        errors: exportPackage.excludedVouchers.flatMap((voucher) => voucher.issues.map((entry) => ({ code: entry.code, message: entry.message, entityType: "voucher", entityId: voucher.voucherId, tallyRemoteId: null }))),
        createdById: session?.user.id ?? null,
        createdByName: session?.user.name ?? null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      next = await markTallyRemoteImported(mode, workspaceId, exportPackage.exportedVouchers.map((voucher) => ({
        tallyEntityType: "voucher",
        tallyRemoteId: voucher.guid,
        tallyGuid: voucher.guid,
        tallyMasterId: null,
        tallyAlterId: null,
        tallyVoucherKey: voucher.voucherNumber,
        bizovixEntityType: "VoucherEntry",
        bizovixEntityId: voucher.voucherId,
        batchId,
        origin: "exported-to-tally",
        status: "active",
        fingerprint: null,
        sourceUpdatedAt: null,
      })));
      setSyncState(next);
    } catch (error) {
      toast.warning(error instanceof Error ? `File downloaded, but export history was not saved: ${error.message}` : "File downloaded, but export history was not saved.");
    }
    toast.success(`${exportPackage.exportedVouchers.length} balanced voucher(s) exported${exportPackage.excludedVouchers.length ? `; ${exportPackage.excludedVouchers.length} blocked` : ""}.`);
  }

  async function saveCompanySettings() {
    if (!workspaceId || !companyNameDraft.trim()) {
      toast.error("Enter the company name exactly as it appears in TallyPrime.");
      return;
    }
    setSyncSaving(true);
    try {
      const base = syncState ?? createEmptyTallySyncState(workspaceId);
      const saved = await saveTallySyncState(mode, workspaceId, { ...base, company: { name: companyNameDraft.trim(), guid: base.company?.guid ?? null, lastVerifiedAt: null } });
      setSyncState(saved);
      setSettingsOpen(false);
      toast.success("Tally company settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tally settings could not be saved.");
    } finally {
      setSyncSaving(false);
    }
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xml")) {
      toast.error("Select an XML file exported from TallyPrime.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("The XML file is larger than the safe 15 MB browser import limit.");
      return;
    }
    try {
      const parsed = parseTallyExportXml(await file.text());
      setImportFileName(file.name);
      setImportParseResult(parsed);
      setImportOutcomes({});
      if (parsed.validationIssues.length) toast.error(parsed.validationIssues[0]?.message ?? "Tally XML could not be read.");
      else toast.success(`${parsed.vouchers.length} Tally voucher(s) loaded for dry-run validation.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tally XML could not be read.");
    }
  }

  async function handleLedgerMappingChange(tallyLedgerName: string, value: string) {
    if (!workspaceId || !value) return;
    const [kind, id] = value.split(":", 2) as ["account" | "party", string];
    const account = kind === "account" ? ledgerOptions.find((entry) => entry.id === id) : null;
    const party = kind === "party" ? partyOptions.find((entry) => entry.id === id) : null;
    if (!account && !party) return;
    try {
      const next = await upsertTallyLedgerMapping(mode, workspaceId, {
        tallyLedgerName,
        tallyLedgerGuid: null,
        tallyParentName: null,
        bizovixLedgerKind: kind,
        bizovixLedgerId: (account ?? party)!.id,
        bizovixLedgerName: (account ?? party)!.name,
        bizovixAccountId: account?.id ?? party?.ledgerAccountId ?? null,
        bizovixAccountCode: account?.code ?? null,
        direction: "bidirectional",
        status: "active",
      });
      setSyncState(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ledger mapping could not be saved.");
    }
  }

  async function importReadyVouchers() {
    if (!workspaceId || mode !== "api" || !syncState || !readyImportVouchers.length) {
      toast.error("No validated Tally vouchers are ready to import.");
      return;
    }
    const batchId = createClientId("tally_batch");
    const startedAt = new Date().toISOString();
    const outcomes: Record<string, { status: "created" | "failed"; message: string }> = {};
    const importedLinks: TallyImportedRemoteInput[] = [];
    const createdIds: string[] = [];
    const errors: Array<{ code: string; message: string; entityType: string | null; entityId: string | null; tallyRemoteId: string | null }> = [];
    setImporting(true);
    setImportProgress({ completed: 0, total: readyImportVouchers.length });
    for (let index = 0; index < readyImportVouchers.length; index += 1) {
      const voucher = readyImportVouchers[index];
      try {
        const partyMapping = partyMappingForVoucher(voucher);
        const lines = voucher.ledgerEntries.map((entry, lineIndex) => {
          const mapping = resolveLedgerMapping(entry.ledgerName)!;
          return { id: `tally-line-${lineIndex + 1}`, accountId: mapping.accountId ?? undefined, ledger: mapping.name, description: `Imported from Tally ${voucher.voucherType} ${voucher.voucherNumber}`, debit: entry.debit, credit: entry.credit, billReference: voucher.voucherNumber };
        });
        const payload: VoucherFormInput = {
          workspaceId,
          voucherType: voucher.bizovixVoucherType!,
          voucherDate: voucher.date,
          partyName: partyMapping?.name ?? "Tally Import",
          partyId: partyMapping?.id,
          reference: voucher.voucherNumber,
          narration: voucher.narration || `Imported from Tally (${voucher.voucherType} ${voucher.voucherNumber})`,
          status: "draft",
          idempotencyKey: `tally:${syncState.company?.guid ?? normalizeName(syncState.company?.name ?? "company")}:${voucher.guid}`,
          settlementMode: voucher.bizovixVoucherType === "receipt" || voucher.bizovixVoucherType === "payment" ? "cash" : "accounts-payable",
          subtotal: roundMoney(Math.max(voucher.debit, voucher.credit)),
          totalAmount: roundMoney(Math.max(voucher.debit, voucher.credit)),
          lines,
        };
        const created = await createVoucher("api", payload);
        createdIds.push(created.id);
        importedLinks.push({ tallyEntityType: "voucher", tallyRemoteId: voucher.guid, tallyGuid: voucher.guid, tallyMasterId: null, tallyAlterId: null, tallyVoucherKey: voucher.voucherNumber || null, bizovixEntityType: "VoucherEntry", bizovixEntityId: created.id, batchId, origin: "imported-from-tally", status: "active", fingerprint: null, sourceUpdatedAt: null });
        outcomes[voucher.guid] = { status: "created", message: `Created as draft ${created.voucherNumber}` };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Import failed";
        outcomes[voucher.guid] = { status: "failed", message };
        errors.push({ code: "IMPORT_FAILED", message, entityType: "voucher", entityId: null, tallyRemoteId: voucher.guid });
      }
      setImportOutcomes({ ...outcomes });
      setImportProgress({ completed: index + 1, total: readyImportVouchers.length });
    }
    try {
      let next = await recordTallySyncBatch(mode, workspaceId, { id: batchId, direction: "import-from-tally", transport: "xml-file", status: errors.length ? (createdIds.length ? "partially-succeeded" : "failed") : "imported", companyName: syncState.company?.name ?? "Tally", companyGuid: syncState.company?.guid ?? null, dateFrom: null, dateTo: null, fileName: importFileName || null, checksumSha256: null, selectedCount: readyImportVouchers.length, successCount: createdIds.length, skippedCount: 0, failedCount: errors.length, totalDebit: sumMoney(readyImportVouchers.map((voucher) => voucher.debit)), totalCredit: sumMoney(readyImportVouchers.map((voucher) => voucher.credit)), bizovixEntityIds: createdIds, errors, createdById: session?.user.id ?? null, createdByName: session?.user.name ?? null, startedAt, completedAt: new Date().toISOString() });
      if (importedLinks.length) next = await markTallyRemoteImported(mode, workspaceId, importedLinks);
      setSyncState(next);
    } catch (error) {
      toast.warning(error instanceof Error ? `Vouchers were processed, but sync history failed: ${error.message}` : "Vouchers were processed, but sync history failed.");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
    if (createdIds.length) toast.success(`${createdIds.length} Tally voucher(s) imported safely as drafts.`);
    if (errors.length) toast.error(`${errors.length} voucher(s) failed. Review the row messages.`);
  }

  const importPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid flex-none gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <button type="button" onClick={() => importFileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void handleImportFile(event.dataTransfer.files[0]); }} className="flex min-h-[150px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#9fc2ea] bg-[#f7fbff] px-6 py-5 text-center transition hover:border-[#4d91df] hover:bg-[#f1f8ff]">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e6f2ff] text-[#2674c8]"><FileUp className="h-6 w-6" /></span>
          <span className="mt-3 text-base font-semibold text-[#203550]">Upload XML exported from TallyPrime</span>
          <span className="mt-1 text-sm text-[#71819a]">Click or drop a file here · dry-run only until you confirm import</span>
          {importFileName ? <span className="mt-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#315b8f] shadow-sm">{importFileName}</span> : null}
          <input ref={importFileRef} type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={(event) => void handleImportFile(event.target.files?.[0])} />
        </button>
        <div className="rounded-xl border border-[#dce4ef] bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#203550]"><ShieldCheck className="h-5 w-5 text-[#16804a]" />Safe import rules</div>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-[#65758d]"><li>• Every debit and credit must balance.</li><li>• Every Tally ledger must map to an active Bizovix ledger or party.</li><li>• GUID prevents the same voucher being imported twice.</li><li>• Valid records are created as Draft—not silently posted.</li><li>• Protected system accounts are mapped only and never modified.</li></ul>
        </div>
      </div>

      {importParseResult ? (
        <>
          {importLedgerNames.length ? (
            <div className="flex-none rounded-xl border border-[#dce4ef] bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold text-[#203550]">Ledger mapping</div><div className="text-xs text-[#71819a]">Exact matches are selected automatically. Review every mapping before import.</div></div><span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-semibold text-[#315b8f]">{importLedgerNames.length} Tally ledgers</span></div>
              <div className="grid max-h-[210px] gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                {importLedgerNames.map((ledgerName) => {
                  const mapping = resolveLedgerMapping(ledgerName);
                  return (
                    <label key={ledgerName} className={cn("rounded-lg border p-3", mapping ? "border-[#cce8d6] bg-[#f8fdf9]" : "border-[#f1c8b1] bg-[#fffaf6]")}>
                      <span className="mb-2 block truncate text-xs font-semibold text-[#33465f]" title={ledgerName}>{ledgerName}</span>
                      <select value={mapping ? `${mapping.kind}:${mapping.id}` : ""} onChange={(event) => void handleLedgerMappingChange(ledgerName, event.target.value)} className="h-9 w-full rounded-md border border-[#d5dfeb] bg-white px-2 text-xs text-[#203550]"><option value="">Select Bizovix ledger...</option><optgroup label="Accounts">{ledgerOptions.map((ledger) => <option key={`account:${ledger.id}`} value={`account:${ledger.id}`}>{ledger.name} ({ledger.code})</option>)}</optgroup><optgroup label="Customers & Suppliers">{partyOptions.map((party) => <option key={`party:${party.id}`} value={`party:${party.id}`}>{party.name} · {party.type}</option>)}</optgroup></select>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#dce4ef] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4ebf3] px-4 py-3"><div><div className="font-semibold text-[#203550]">Dry-run preview</div><div className="text-xs text-[#71819a]">Nothing is written until you confirm the ready vouchers.</div></div><div className="flex items-center gap-2"><span className="rounded-full bg-[#eaf8ef] px-3 py-1 text-xs font-semibold text-[#16804a]">{readyImportVouchers.length} ready</span><span className="rounded-full bg-[#fff4e8] px-3 py-1 text-xs font-semibold text-[#b45309]">{importParseResult.vouchers.length - readyImportVouchers.length} blocked</span><Button type="button" className="h-9 rounded-lg" disabled={importing || !readyImportVouchers.length} onClick={() => void importReadyVouchers()}>{importing && importProgress ? `Importing ${importProgress.completed}/${importProgress.total}` : "Import from Tally"}</Button></div></div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm"><thead className="sticky top-0 bg-[#f8fafc]"><tr>{["Status", "Date", "Voucher", "Type", "Debit", "Credit", "Details"].map((label) => <th key={label} className="border-b border-[#dce4ef] px-3 py-2.5 text-left text-xs font-semibold uppercase text-[#71819a]">{label}</th>)}</tr></thead>
                <tbody>{importParseResult.vouchers.map((voucher, index) => { const reasons = importBlockingReasons(voucher); const outcome = importOutcomes[voucher.guid]; const ready = reasons.length === 0; return <tr key={`${voucher.guid || voucher.voucherNumber}-${index}`} className="border-b border-[#edf1f6] last:border-0"><td className="px-3 py-3">{outcome ? <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold", outcome.status === "created" ? "bg-[#eaf8ef] text-[#16804a]" : "bg-[#fff0f0] text-[#c43d3d]")}>{outcome.status === "created" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}{outcome.status}</span> : <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold", ready ? "bg-[#eaf8ef] text-[#16804a]" : "bg-[#fff4e8] text-[#b45309]")}>{ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}{ready ? "Ready" : "Blocked"}</span>}</td><td className="px-3 py-3 text-[#33465f]">{voucher.date}</td><td className="px-3 py-3 font-medium text-[#203550]">{voucher.voucherNumber || "—"}</td><td className="px-3 py-3 text-[#33465f]">{voucher.voucherType || "—"}</td><td className="px-3 py-3 tabular-nums">{formatAmount(voucher.debit)}</td><td className="px-3 py-3 tabular-nums">{formatAmount(voucher.credit)}</td><td className="max-w-[360px] px-3 py-3 text-xs text-[#71819a]">{outcome?.message ?? (reasons.length ? reasons.join(" · ") : `${voucher.ledgerEntries.length} balanced ledger entries`)}</td></tr>; })}</tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="flex h-full min-h-[620px] flex-col gap-3">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#dce4ef] bg-white px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
        <div className="flex rounded-lg bg-[#f1f5fa] p-1">
          <button type="button" onClick={() => setDirection("export")} className={cn("inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold transition", direction === "export" ? "bg-white text-[#164f8f] shadow-sm" : "text-[#64748b]")}><Download className="h-4 w-4" />Bizovix → Tally</button>
          <button type="button" onClick={() => setDirection("import")} className={cn("inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold transition", direction === "import" ? "bg-white text-[#164f8f] shadow-sm" : "text-[#64748b]")}><FileUp className="h-4 w-4" />Tally → Bizovix</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-[#71819a] sm:inline-flex"><History className="h-4 w-4" />{syncState?.batches.length ?? 0} sync batches</span>
          <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => setSettingsOpen((current) => !current)}><Settings2 className="h-4 w-4" />Tally Setup</Button>
        </div>
      </div>

      {settingsOpen ? (
        <div className="flex flex-none flex-wrap items-end gap-4 rounded-[10px] border border-[#f0cf9e] bg-[#fffaf2] p-4">
          <label className="min-w-[260px] flex-1"><span className="mb-1.5 block text-sm font-semibold text-[#273a55]">Exact Tally company name</span><Input value={companyNameDraft} onChange={(event) => setCompanyNameDraft(event.target.value)} placeholder="Example: Mugnee Multiple Limited" className="h-10 bg-white" /></label>
          <div className="max-w-[460px] text-xs leading-5 text-[#756149]">This must match the company currently open in TallyPrime. The first release is accounting-only; inventory vouchers remain blocked until stock item, unit, and warehouse mappings are configured.</div>
          <Button type="button" className="h-10 rounded-lg" disabled={syncSaving || syncLoading} onClick={() => void saveCompanySettings()}>{syncSaving ? "Saving..." : "Save Setup"}</Button>
        </div>
      ) : null}

      {direction === "export" ? (
        <>
      <div className="flex-none rounded-[4px] border border-[#dce4ef] bg-white px-6 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <select
              value={datePreset}
              onChange={(event) => applyDatePreset(event.target.value as DatePreset)}
              className="h-10 rounded-[4px] border border-[#d4deeb] px-3 text-[15px] font-semibold text-[#203550] outline-none"
            >
              {DATE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <span className="rounded-[2px] bg-[#315b8f] px-4 py-2 text-[15px] font-semibold text-white">Between</span>
            <div className="flex flex-wrap items-center gap-3 rounded-[4px] border border-[#d4deeb] px-3 py-2">
              <AppDateInput
                value={dateFrom}
                onChange={(value) => {
                  setDateFrom(value);
                  setDatePreset("custom");
                }}
                className="w-[136px]"
                inputClassName="h-7 border-0 bg-transparent px-0 pr-7 text-[15px] text-[#203550] focus:ring-0"
                aria-label="Tally export from date"
              />
              <span className="text-[#677993]">To</span>
              <AppDateInput
                value={dateTo}
                onChange={(value) => {
                  setDateTo(value);
                  setDatePreset("custom");
                }}
                className="w-[136px]"
                inputClassName="h-7 border-0 bg-transparent px-0 pr-7 text-[15px] text-[#203550] focus:ring-0"
                aria-label="Tally export to date"
              />
            </div>
          </div>
          <button type="button" onClick={handleExport}>
            <ExportToTallyButtonContent />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#dce4ef] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
        <div className="flex flex-none flex-wrap items-center justify-between gap-4 px-5 py-5 xl:max-2xl:flex-nowrap xl:max-2xl:gap-2">
          <div className="flex flex-wrap items-center gap-5 xl:max-2xl:min-w-0 xl:max-2xl:flex-1 xl:max-2xl:flex-nowrap xl:max-2xl:gap-2">
            <span className="flex shrink-0 items-center gap-2 text-[16px] font-semibold uppercase text-[#22344e] xl:max-2xl:text-[14px]"><ReceiptText className="h-[18px] w-[18px] text-primary xl:max-2xl:h-4 xl:max-2xl:w-4" aria-hidden="true" />Transactions</span>
            {FILTER_LABELS.map((filter) => (
              <label key={filter.id} className="flex shrink-0 cursor-pointer items-center gap-3 whitespace-nowrap text-[15px] text-[#20344f] xl:max-2xl:gap-1.5 xl:max-2xl:text-[13px]">
                <span className="relative flex h-5 w-5 items-center justify-center xl:max-2xl:h-4 xl:max-2xl:w-4">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={enabledFilters.includes(filter.id)}
                    onChange={() => toggleFilter(filter.id)}
                  />
                  <span className="h-5 w-5 rounded-[4px] border border-[#7b91b0] bg-white peer-checked:border-[#1677ff] peer-checked:bg-[#1677ff] xl:max-2xl:h-4 xl:max-2xl:w-4" />
                  <span className="absolute text-[13px] font-bold text-white opacity-0 peer-checked:opacity-100 xl:max-2xl:text-[11px]">✓</span>
                </span>
                <span>{filter.label}</span>
              </label>
            ))}
          </div>
          <CollapsibleSearch value={searchTerm} onChange={setSearchTerm} label="Search entries" expandedWidth="w-[150px] 2xl:w-[230px]" />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-[#fbfcfe]">
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.id}
                    className="relative border-b border-r border-[#dde6f0] px-3 py-3 text-left text-[14px] font-semibold text-[#6a7d9b] last:border-r-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span>{column.label}</span>
                      <button
                        type="button"
                        aria-label={`Filter ${column.label}`}
                        onClick={() => setOpenFilterColumn((current) => (current === column.id ? null : column.id))}
                        className={cn(
                          "rounded p-0.5 transition",
                          columnFilters[column.id]?.trim() ? "bg-[#edf4ff] text-[#1d66b1]" : "text-[#6d7f9b] hover:bg-[#f4f7fb]",
                        )}
                      >
                        <Filter className="h-4 w-4" />
                      </button>
                    </div>
                    {openFilterColumn === column.id ? (
                      <div
                        ref={filterPopoverRef}
                        className="absolute left-0 top-full z-20 mt-1 w-[200px] rounded-[10px] border border-[#d7dfeb] bg-white p-3 text-left normal-case shadow-[0_16px_36px_rgba(15,23,42,0.14)]"
                      >
                        <input
                          autoFocus
                          type="text"
                          value={columnFilters[column.id] ?? ""}
                          onChange={(event) => setColumnFilters((current) => ({ ...current, [column.id]: event.target.value }))}
                          placeholder={`Filter ${column.label.toLowerCase()}`}
                          className="h-9 w-full rounded-[6px] border border-[#d7dfeb] px-2 text-[13px] text-[#20344f] outline-none focus:border-[#1677ff]"
                        />
                        <button
                          type="button"
                          onClick={() => setColumnFilters((current) => ({ ...current, [column.id]: "" }))}
                          className="mt-2 text-[12px] font-medium text-[#6a7d9b] hover:text-[#20344f]"
                        >
                          Clear
                        </button>
                      </div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vouchersQuery.isLoading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-6 py-20 text-center text-[15px] text-[#7a8ca7]">
                    Loading transactions...
                  </td>
                </tr>
              ) : filteredRows.length ? (
                filteredRows.map((row) => (
                  <tr key={row.voucher.id} className="bg-white transition hover:bg-[#f7fbff]">
                    <td className="border-r border-[#dde6f0] px-3 py-3 text-[14px] text-[#122742]">{row.date}</td>
                    <td className="border-r border-[#dde6f0] px-3 py-3 text-[14px] text-[#122742]">{row.invoiceNo}</td>
                    <td className="border-r border-[#dde6f0] px-3 py-3 text-[14px] text-[#122742]">{row.partyName}</td>
                    <td className="border-r border-[#dde6f0] px-3 py-3 text-[14px] text-[#122742]">{row.transactionType}</td>
                    <td className="border-r border-[#dde6f0] px-3 py-3 text-[14px] text-[#122742]">{row.paymentType}</td>
                    <td className="border-r border-[#dde6f0] px-3 py-3 text-[14px] text-[#122742]">{row.amount}</td>
                    <td className="px-3 py-3 text-[14px] text-[#122742]">{row.balance}</td>
                    <td className="px-3 py-3 text-[14px]" title={row.exportIssue}><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", row.exportStatus === "Ready" ? "bg-[#eaf8ef] text-[#16804a]" : "bg-[#fff4e8] text-[#b45309]")}>{row.exportStatus}</span></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-6 py-16 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center">
                      <div className="relative mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-[#eef6ff] ring-8 ring-[#f7faff]">
                        <ReceiptText className="h-11 w-11 text-[#4e86c7]" strokeWidth={1.6} aria-hidden="true" />
                        <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-[#e96f0b] text-white shadow-sm">
                          <Download className="h-4 w-4" aria-hidden="true" />
                        </span>
                      </div>
                      <p className="text-base font-semibold text-[#203550]">No transactions ready for Tally</p>
                      <p className="mt-1.5 text-sm leading-6 text-[#7a8ca7]">
                        Posted accounting vouchers within the selected date range will appear here.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          applyDatePreset("this-year");
                          setEnabledFilters(FILTER_LABELS.map((filter) => filter.id));
                          setSearchTerm("");
                          setColumnFilters({});
                        }}
                        className="mt-5 rounded-lg border border-[#cfdbea] bg-white px-4 py-2 text-sm font-semibold text-[#315b8c] transition hover:border-[#a9c2df] hover:bg-[#f7faff]"
                      >
                        Show all this year
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-none flex-wrap items-center justify-between gap-4 border-t border-[#e8eef6] px-5 py-4">
            <div className="text-[14px] text-[#6880a3]">
              Ready vouchers: <span className="font-semibold text-[#16804a]">{exportPackage?.exportedVouchers.length ?? 0}</span>
              {" · "}
              Blocked: <span className="font-semibold text-[#b45309]">{exportPackage?.excludedVouchers.length ?? filteredRows.length}</span>
              {" · "}
              Export amount: <span className="font-semibold text-[#203550]">{formatAmount(exportPackage?.totalDebit ?? exportAmount)}</span>
            </div>
        </div>
      </div>
        </>
      ) : importPanel}
    </div>
  );
}
