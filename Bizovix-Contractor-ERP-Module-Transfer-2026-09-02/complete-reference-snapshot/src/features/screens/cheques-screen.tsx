"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  CheckCheck,
  CheckCircle2,
  Clock3,
  Eye,
  FileSpreadsheet,
  MoreVertical,
  Pencil,
  Printer,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AppDateInput } from "@/components/shared/app-date-input";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { TablePagination } from "@/components/shared/table-pagination";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildWorkspaceRoute } from "@/config/routes";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import { openPrintWindow, printWindowWhenReady } from "@/lib/print";
import { cn } from "@/lib/utils";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { useMoneyAccountsQuery } from "@/hooks/use-accounts-query";
import { useDayBookQuery } from "@/hooks/use-app-query";

type ChequeStatus = "Issued" | "Deposited" | "Cleared" | "Bounced" | "Cancelled" | "Post Dated";
type ChequeDirection = "Payment" | "Receipt";

type ChequeRecord = {
  id: string;
  chequeNo: string;
  bankAccount: string;
  payee: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: ChequeStatus;
  direction: ChequeDirection;
  memo: string;
  createdAt: string;
};

type ChequeDraft = {
  chequeNo: string;
  bankAccount: string;
  payee: string;
  amount: string;
  issueDate: string;
  dueDate: string;
  status: ChequeStatus;
  direction: ChequeDirection;
  memo: string;
};

const demoBankOptions = [
  "Dutch Bangla Bank - 105.221.778541",
  "BRAC Bank - 221.778.004521",
  "City Bank - 889.145.003214",
] as const;

function buildDefaultDraft(): ChequeDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    chequeNo: "",
    bankAccount: "",
    payee: "",
    amount: "",
    issueDate: today,
    dueDate: today,
    status: "Issued",
    direction: "Payment",
    memo: "",
  };
}

function normalizeAmount(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim() || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildStatusTone(status: ChequeStatus) {
  if (status === "Cleared") {
    return "bg-[#e8fff4] text-[#0f9f63]";
  }

  if (status === "Deposited" || status === "Post Dated") {
    return "bg-[#eef7ff] text-[#1d66b1]";
  }

  if (status === "Bounced") {
    return "bg-[#fff1f1] text-[#dc2626]";
  }

  if (status === "Cancelled") {
    return "bg-[#f3f5f8] text-[#697791]";
  }

  return "bg-[#fff7ef] text-primary";
}

export function ChequesScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, session } = useSessionContext();
  const createRequestRef = useRef("");
  const storageKey = `bizovix:cheques:${mode}:${session?.workspaceId ?? "default"}`;
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ChequeStatus | "All">("All");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChequeDraft>(() => buildDefaultDraft());
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [deleteChequeId, setDeleteChequeId] = useState<string | null>(null);
  const [detailChequeId, setDetailChequeId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedPaymentSourceId, setSelectedPaymentSourceId] = useState("");
  const bankAccountsQuery = useMoneyAccountsQuery(mode === "api" && Boolean(session?.workspaceId), "BANK");
  const paymentsQuery = useDayBookQuery(mode, { workspaceId: session?.workspaceId, status: "posted" });

  const bankOptions = useMemo(
    () => mode === "api"
      ? (bankAccountsQuery.data ?? []).filter((account) => account.status === "ACTIVE").map((account) => ({ id: account.id, name: account.name }))
      : demoBankOptions.map((name) => ({ id: name, name })),
    [bankAccountsQuery.data, mode],
  );

  const chequePaymentSources = useMemo(() => {
    const vouchers = paymentsQuery.data ?? [];
    return vouchers.flatMap((voucher) => {
      if (voucher.voucherType !== "payment" && voucher.voucherType !== "expense") return [];
      return voucher.lines.flatMap((line, lineIndex) => {
        if (line.moneyAccountType !== "BANK" || Number(line.credit || 0) <= 0 || !/^Cheque\s/i.test(line.description ?? "")) return [];
        const referenceFromDescription = line.description?.match(/\(([^()]*)\)\s*$/)?.[1]?.trim();
        const chequeNo = referenceFromDescription || voucher.reference?.trim() || "";
        if (!chequeNo) return [];
        return [{
          id: `${voucher.id}:${line.id || lineIndex}`,
          chequeNo,
          bankAccount: line.accountId || line.ledger,
          bankName: line.ledger,
          payee: voucher.partyName,
          amount: Number(line.credit || 0),
          date: voucher.voucherDate,
          narration: voucher.narration?.trim() || line.description?.trim() || "",
          voucherNumber: voucher.voucherNumber,
        }];
      });
    }).sort((left, right) => right.date.localeCompare(left.date) || left.chequeNo.localeCompare(right.chequeNo));
  }, [paymentsQuery.data]);

  useEffect(() => {
    if (!editorOpen || editingId || draft.bankAccount || !bankOptions.length) return;
    setDraft((current) => ({ ...current, bankAccount: bankOptions[0]!.name }));
  }, [bankOptions, draft.bankAccount, editingId, editorOpen]);

  function applyChequePaymentSource(sourceId: string) {
    const source = chequePaymentSources.find((item) => item.id === sourceId);
    if (!source) return;
    const matchedBank = bankOptions.find((bank) => bank.id === source.bankAccount || bank.name === source.bankName);
    setSelectedPaymentSourceId(sourceId);
    setDraft((current) => ({
      ...current,
      chequeNo: source.chequeNo,
      bankAccount: matchedBank?.name ?? source.bankName,
      payee: source.payee,
      amount: String(source.amount),
      issueDate: source.date,
      dueDate: source.date,
      direction: "Payment",
      memo: source.narration,
    }));
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setCheques([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as ChequeRecord[];
      setCheques(Array.isArray(parsed) ? parsed : []);
    } catch {
      window.localStorage.removeItem(storageKey);
      setCheques([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(cheques));
  }, [cheques, storageKey]);

  useEffect(() => {
    const createValue = searchParams.get("create");
    if (createValue !== "1" && createValue !== "true") {
      return;
    }

    const requestKey = `cheques:${searchParams.get("open") ?? "initial"}`;
    if (createRequestRef.current === requestKey) {
      return;
    }

    openEditor();
    createRequestRef.current = requestKey;
  }, [searchParams]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-cheque-header-menu], [data-cheque-row-menu]")) {
        return;
      }

      setHeaderMenuOpen(false);
      setRowMenuId(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const filteredCheques = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return [...cheques]
      .filter((cheque) => {
        const matchesSearch =
          !needle ||
          [cheque.chequeNo, cheque.bankAccount, cheque.payee, cheque.status, cheque.direction, formatDate(cheque.issueDate)].some((value) =>
            value.toLowerCase().includes(needle),
          );
        const matchesStatus = statusFilter === "All" || cheque.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.issueDate.localeCompare(left.issueDate));
  }, [cheques, search, statusFilter]);

  const paginatedCheques = useMemo(
    () => filteredCheques.slice((page - 1) * pageSize, page * pageSize),
    [filteredCheques, page, pageSize],
  );

  useEffect(() => setPage(1), [search, statusFilter, pageSize]);
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredCheques.length / pageSize));
    setPage((current) => Math.min(current, lastPage));
  }, [filteredCheques.length, pageSize]);

  const summary = useMemo(
    () => ({
      total: cheques.length,
      issued: cheques.filter((cheque) => cheque.status === "Issued" || cheque.status === "Post Dated").length,
      cleared: cheques.filter((cheque) => cheque.status === "Cleared").length,
      amount: sumMoney(cheques.map((cheque) => cheque.amount)),
    }),
    [cheques],
  );

  const detailCheque = useMemo(
    () => cheques.find((cheque) => cheque.id === detailChequeId) ?? null,
    [cheques, detailChequeId],
  );

  function clearCreateQuery() {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (!nextParams.has("create") && !nextParams.has("open")) {
      return;
    }

    nextParams.delete("create");
    nextParams.delete("open");
    const nextQuery = nextParams.toString();
    const target = buildWorkspaceRoute(mode, "/utilities/cheques");
    router.replace(nextQuery ? `${target}?${nextQuery}` : target, { scroll: false });
  }

  function updateDraft<Key extends keyof ChequeDraft>(field: Key, value: ChequeDraft[Key]) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openEditor(cheque?: ChequeRecord) {
    setSelectedPaymentSourceId("");
    setEditingId(cheque?.id ?? null);
    setDraft(
      cheque
        ? {
            chequeNo: cheque.chequeNo,
            bankAccount: cheque.bankAccount,
            payee: cheque.payee,
            amount: String(cheque.amount),
            issueDate: cheque.issueDate,
            dueDate: cheque.dueDate,
            status: cheque.status,
            direction: cheque.direction,
            memo: cheque.memo,
          }
        : buildDefaultDraft(),
    );
    setEditorOpen(true);
    setHeaderMenuOpen(false);
    setRowMenuId(null);
  }

  function closeEditor(nextOpen = false) {
    setEditorOpen(nextOpen);
    if (!nextOpen) {
      setEditingId(null);
      setSelectedPaymentSourceId("");
      setDraft(buildDefaultDraft());
      clearCreateQuery();
    }
  }

  function handleSaveCheque() {
    if (!draft.bankAccount.trim()) {
      toast.error("Bank name is required");
      return;
    }

    if (!draft.issueDate) {
      toast.error("Cheque date is required");
      return;
    }

    if (!draft.chequeNo.trim()) {
      toast.error("Cheque number is required");
      return;
    }

    if (!draft.payee.trim()) {
      toast.error("Payee name is required");
      return;
    }

    const amount = normalizeAmount(draft.amount);
    if (amount <= 0) {
      toast.error("Enter a valid cheque amount");
      return;
    }

    const duplicateCheque = cheques.find(
      (cheque) =>
        cheque.id !== editingId &&
        cheque.bankAccount.trim().toLowerCase() === draft.bankAccount.trim().toLowerCase() &&
        cheque.chequeNo.trim().toLowerCase() === draft.chequeNo.trim().toLowerCase(),
    );
    if (duplicateCheque) {
      toast.error("This cheque number is already recorded for the selected bank");
      return;
    }

    const payload: ChequeRecord = {
      id: editingId ?? crypto.randomUUID(),
      chequeNo: draft.chequeNo.trim(),
      bankAccount: draft.bankAccount,
      payee: draft.payee.trim(),
      amount,
      issueDate: draft.issueDate,
      dueDate: draft.dueDate,
      status: draft.status,
      direction: draft.direction,
      memo: draft.memo.trim(),
      createdAt: editingId ? cheques.find((item) => item.id === editingId)?.createdAt ?? new Date().toISOString() : new Date().toISOString(),
    };

    setCheques((current) => {
      if (editingId) {
        return current.map((cheque) => (cheque.id === editingId ? payload : cheque));
      }

      return [payload, ...current];
    });

    toast.success(editingId ? "Cheque updated" : "Cheque issued");
    closeEditor(false);
  }

  function handleDeleteCheque(chequeId: string) {
    setDeleteChequeId(chequeId);
    setRowMenuId(null);
  }

  function confirmDeleteCheque() {
    if (!deleteChequeId) {
      return;
    }

    setCheques((current) => current.filter((item) => item.id !== deleteChequeId));
    setDeleteChequeId(null);
    toast.success("Cheque deleted");
  }

  function updateChequeStatus(chequeId: string, status: ChequeStatus) {
    setCheques((current) => current.map((item) => (item.id === chequeId ? { ...item, status } : item)));
    setRowMenuId(null);
    toast.success(`Cheque marked as ${status.toLowerCase()}`);
  }

  function handlePrintCheque(cheque: ChequeRecord) {
    const printWindow = openPrintWindow("width=720,height=680");
    if (!printWindow) {
      toast.error("Allow popups to print cheque details");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Cheque Details</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #1f3253; }
            h1 { margin: 0 0 24px; font-size: 28px; }
            .grid { display: grid; grid-template-columns: 180px 1fr; gap: 12px 18px; }
            .label { color: #6d7b94; font-weight: 600; }
            .value { font-weight: 600; }
          </style>
        </head>
        <body>
          <h1>Cheque Details</h1>
          <div class="grid">
            <div class="label">Cheque No</div><div class="value">${cheque.chequeNo}</div>
            <div class="label">Bank Account</div><div class="value">${cheque.bankAccount}</div>
            <div class="label">Payee</div><div class="value">${cheque.payee}</div>
            <div class="label">Amount</div><div class="value">${formatCurrency(cheque.amount)}</div>
            <div class="label">Issue Date</div><div class="value">${formatDate(cheque.issueDate)}</div>
            <div class="label">Due Date</div><div class="value">${formatDate(cheque.dueDate)}</div>
            <div class="label">Status</div><div class="value">${cheque.status}</div>
            <div class="label">Direction</div><div class="value">${cheque.direction}</div>
            <div class="label">Memo</div><div class="value">${cheque.memo || "-"}</div>
          </div>
        </body>
      </html>
    `);
    printWindowWhenReady(printWindow);
    setRowMenuId(null);
  }

  const deleteTargetCheque = cheques.find((cheque) => cheque.id === deleteChequeId) ?? null;

  return (
    <div data-cheques-screen="true" className="flex h-full min-h-0 flex-col">
      <ConfirmationDialog
        open={Boolean(deleteChequeId)}
        onOpenChange={(open) => setDeleteChequeId(open ? deleteChequeId : null)}
        title="Delete this cheque?"
        description={`Cheque ${deleteTargetCheque?.chequeNo ?? ""} will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete Cheque"
        tone="danger"
        onConfirm={confirmDeleteCheque}
      />
      <div data-cheques-workspace="true" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d7dfeb] bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-[#d7dfeb] px-4 py-4">
          <div className="text-[18px] font-semibold text-[#1f3253]">Cheque Details</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(230,120,23,0.22)] hover:bg-[#cf670f]"
              onClick={() => openEditor()}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Add Cheque
            </button>
          <div className="relative" data-cheque-header-menu>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#697791] transition hover:bg-[#f4f7fb]"
              onClick={() => setHeaderMenuOpen((current) => !current)}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {headerMenuOpen ? (
              <div className="absolute right-0 top-10 z-20 min-w-[200px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                <MenuActionButton icon={FileSpreadsheet} label="Issue Cheque" onClick={() => openEditor()} />
                <MenuActionButton icon={Search} label="Focus Search" onClick={() => (document.getElementById("cheque-search") as HTMLInputElement | null)?.focus()} />
                <MenuActionButton icon={Printer} label="Print List" onClick={() => window.print()} />
              </div>
            ) : null}
          </div>
          </div>
        </div>

        {!cheques.length ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-[radial-gradient(circle,#d9ebff_0%,#d9ebff_55%,#edf5ff_56%,#edf5ff_100%)]">
                <div className="absolute left-7 top-7 h-7 w-12 rounded-[7px] bg-[#67aefb] shadow-[0_8px_18px_rgba(103,174,251,0.22)]" />
                <div className="absolute left-9 top-[34px] h-2 w-2 rounded-[3px] bg-white" />
                <div className="absolute left-[52px] top-[36px] h-1.5 w-5 rounded-full bg-white" />
                <div className="absolute left-5 top-[47px] h-7 w-12 rounded-[7px] bg-[#4094f5]" />
                <div className="absolute left-7 top-[54px] h-2 w-2 rounded-[3px] bg-white" />
                <div className="absolute left-[50px] top-[56px] h-1.5 w-5 rounded-full bg-white" />
                <div className="absolute left-9 top-[66px] h-7 w-12 rounded-[7px] bg-[#8fc2ff]" />
                <div className="absolute left-11 top-[73px] h-2 w-2 rounded-[3px] bg-[#eef6ff]" />
                <div className="absolute left-[54px] top-[75px] h-1.5 w-5 rounded-full bg-[#eef6ff]" />
              </div>
              <div className="mt-5 text-[17px] font-semibold text-[#263a61]">No Cheques to Show</div>
              <div className="mt-2 max-w-[280px] text-[15px] leading-7 text-[#8a96b3]">
                You haven&apos;t added any Cheque transactions yet.
              </div>
              <button
                type="button"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#cf670f]"
                onClick={() => openEditor()}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Add First Cheque
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <CollapsibleSearch
                  value={search}
                  onChange={setSearch}
                  label="Search cheques"
                  placeholder="Search by cheque no, payee, bank account"
                  expandedWidth="w-full"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as ChequeStatus | "All")}
                  className="h-11 rounded-full border border-[#d8e0ee] bg-white px-4 text-sm text-[#24365a] outline-none"
                >
                  {["All", "Issued", "Deposited", "Cleared", "Bounced", "Cancelled", "Post Dated"].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]"
                onClick={() => openEditor()}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Issue Cheque
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <SummaryCard label="Total Cheques" value={String(summary.total)} note="All saved cheque entries" icon={FileSpreadsheet} tone="blue" />
              <SummaryCard label="Open Cheques" value={String(summary.issued)} note="Issued or post dated items" icon={Clock3} tone="orange" />
              <SummaryCard label="Cleared" value={String(summary.cleared)} note="Successfully settled cheques" icon={BadgeCheck} tone="emerald" />
              <SummaryCard label="Cheque Amount" value={formatCurrency(summary.amount)} note="Total value under tracking" icon={Building2} tone="blue" />
            </div>

            <div className="overflow-hidden rounded-[16px] border border-[#d7dfeb]">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#f7f9fd] text-left text-[#61708a]">
                    <tr>
                      {["Cheque No", "Bank Account", "Payee", "Issue Date", "Due Date", "Amount", "Status", "Actions"].map((column) => (
                        <th key={column} className={cn("whitespace-nowrap border-b border-[#d7dfeb] px-4 py-3 font-semibold", column === "Actions" ? "text-right" : "text-left")}>
                          {column === "Actions" ? <MoreVertical className="ml-auto h-4 w-4" aria-label="More actions" /> : column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCheques.length ? (
                      paginatedCheques.map((cheque) => (
                        <tr key={cheque.id} className="border-b border-[#edf1f7] last:border-b-0">
                          <td className="px-4 py-3 font-semibold text-[#24365a]">{cheque.chequeNo}</td>
                          <td className="px-4 py-3 text-[#364760]">{cheque.bankAccount}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-[#24365a]">{cheque.payee}</div>
                            <div className="mt-1 text-xs text-[#7d8aa2]">{cheque.direction}</div>
                          </td>
                          <td className="px-4 py-3 text-[#364760]">{formatDate(cheque.issueDate)}</td>
                          <td className="px-4 py-3 text-[#364760]">{formatDate(cheque.dueDate)}</td>
                          <td className="px-4 py-3 font-medium text-[#24365a]">{formatCurrency(cheque.amount)}</td>
                          <td className="px-4 py-3">
                            <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", buildStatusTone(cheque.status))}>
                              {cheque.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="relative inline-flex" data-cheque-row-menu>
                              <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d7dfeb] text-[#61708a] transition hover:bg-[#f4f7fb]"
                                onClick={() => setRowMenuId((current) => (current === cheque.id ? null : cheque.id))}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                              {rowMenuId === cheque.id ? (
                                <div className="absolute right-0 top-10 z-20 min-w-[210px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                                  <MenuActionButton icon={Eye} label="View Details" onClick={() => { setDetailChequeId(cheque.id); setRowMenuId(null); }} />
                                  <MenuActionButton icon={Pencil} label="Edit" onClick={() => openEditor(cheque)} />
                                  <MenuActionButton icon={CheckCheck} label="Mark Cleared" onClick={() => updateChequeStatus(cheque.id, "Cleared")} />
                                  <MenuActionButton icon={XCircle} label="Mark Bounced" onClick={() => updateChequeStatus(cheque.id, "Bounced")} />
                                  <MenuActionButton icon={Printer} label="Print" onClick={() => handlePrintCheque(cheque)} />
                                  <MenuActionButton icon={Trash2} label="Delete" danger onClick={() => handleDeleteCheque(cheque.id)} />
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-sm text-[#6f7f98]">
                          No cheques matched your current search or status filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={page}
                pageSize={pageSize}
                totalItems={filteredCheques.length}
                pageSizeOptions={[10, 25, 50]}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                dense
                iconOnlyNavigation
              />
            </div>
          </div>
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={closeEditor}>
        <DialogContent submitOnEnter className="w-[min(92vw,760px)] rounded-[18px] border border-[#d7dfeb] p-0">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveCheque();
            }}
          >
            <div className="border-b border-[#d7dfeb] px-5 py-4">
              <DialogTitle className="text-[22px] font-semibold text-[#24365a]">
                {editingId ? "Edit Cheque" : "Add Cheque"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-[#6d7b94]">
                Enter bank, payee, cheque number, amount and narration. Required fields are marked with *.
              </DialogDescription>
            </div>

            <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">Bank Name <span className="text-[#ef4444]">*</span></span>
                <select value={draft.bankAccount} onChange={(event) => updateDraft("bankAccount", event.target.value)} className="h-11 rounded-[10px] border border-[#c9d5e8] bg-white px-3 text-sm text-[#1f3253] outline-none">
                  {!bankOptions.length ? <option value="">{bankAccountsQuery.isLoading ? "Loading bank ledgers..." : "No active Bank ledger in Chart of Accounts"}</option> : null}
                  {bankOptions.map((option) => (
                    <option key={option.id} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">Date <span className="text-[#ef4444]">*</span></span>
                <AppDateInput aria-label="Date" value={draft.issueDate} onChange={(value) => updateDraft("issueDate", value)} inputClassName="h-11 rounded-[10px] border-[#c9d5e8] pr-10" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">Payee To / Received From <span className="text-[#ef4444]">*</span></span>
                <Input value={draft.payee} onChange={(event) => updateDraft("payee", event.target.value)} placeholder="Enter payee or payer name" className="h-11 rounded-[10px] border-[#c9d5e8]" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">Cheque Number <span className="text-[#ef4444]">*</span></span>
                {editingId ? (
                  <Input value={draft.chequeNo} readOnly className="h-11 rounded-[10px] border-[#c9d5e8] bg-[#f5f8fc]" />
                ) : (
                  <select
                    value={selectedPaymentSourceId}
                    onChange={(event) => applyChequePaymentSource(event.target.value)}
                    className="h-11 rounded-[10px] border border-[#c9d5e8] bg-white px-3 text-sm text-[#1f3253] outline-none"
                  >
                    <option value="">{paymentsQuery.isLoading ? "Loading cheque references..." : "Select Payment-Out / Expense reference"}</option>
                    {chequePaymentSources
                      .filter((source) => !cheques.some((cheque) => cheque.chequeNo.toLowerCase() === source.chequeNo.toLowerCase() && cheque.bankAccount.toLowerCase() === source.bankName.toLowerCase()))
                      .map((source) => (
                        <option key={source.id} value={source.id}>{source.chequeNo} — {source.voucherNumber} — {formatCurrency(source.amount)}</option>
                      ))}
                  </select>
                )}
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">Amount <span className="text-[#ef4444]">*</span></span>
                <Input money value={draft.amount} readOnly={Boolean(selectedPaymentSourceId)} onChange={(event) => updateDraft("amount", event.target.value)} placeholder="Select a payment reference" className={cn("h-11 rounded-[10px] border-[#c9d5e8]", selectedPaymentSourceId && "bg-[#f5f8fc]")} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">Due Date</span>
                <AppDateInput aria-label="Due Date" value={draft.dueDate} onChange={(value) => updateDraft("dueDate", value)} inputClassName="h-11 rounded-[10px] border-[#c9d5e8] pr-10" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">Direction</span>
                <select value={draft.direction} onChange={(event) => updateDraft("direction", event.target.value as ChequeDirection)} className="h-11 rounded-[10px] border border-[#c9d5e8] bg-white px-3 text-sm text-[#1f3253] outline-none">
                  <option value="Payment">Payment</option>
                  <option value="Receipt">Receipt</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">Status</span>
                <select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as ChequeStatus)} className="h-11 rounded-[10px] border border-[#c9d5e8] bg-white px-3 text-sm text-[#1f3253] outline-none">
                  {["Issued", "Deposited", "Cleared", "Bounced", "Cancelled", "Post Dated"].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 md:col-span-2">
                <span className="text-sm text-[#697791]">Description / Narration</span>
                <textarea
                  value={draft.memo}
                  onChange={(event) => updateDraft("memo", event.target.value)}
                  placeholder="Enter cheque description, purpose or narration"
                  className="min-h-[110px] rounded-[10px] border border-[#c9d5e8] bg-white px-3 py-3 text-sm text-[#1f3253] outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#d7dfeb] bg-white px-5 py-4">
              <Button type="button" variant="outline" className="rounded-full border-[#eef1f6] px-6 text-[#66748f]" onClick={() => closeEditor(false)}>
                Cancel
              </Button>
              <button type="submit" data-enter-submit className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]">
                <CheckCircle2 className="h-5 w-5" />
                {editingId ? "Save Changes" : "Save Cheque"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailCheque)} onOpenChange={(open) => (!open ? setDetailChequeId(null) : null)}>
        <DialogContent className="w-[min(92vw,560px)] rounded-[18px] border border-[#d7dfeb] p-0">
          <div className="border-b border-[#d7dfeb] px-5 py-4">
            <DialogTitle className="text-[22px] font-semibold text-[#24365a]">Cheque Details</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#6d7b94]">
              Full cheque record and current settlement status.
            </DialogDescription>
          </div>

          {detailCheque ? (
            <div className="space-y-4 px-5 py-5">
              <DetailRow label="Cheque Number" value={detailCheque.chequeNo} />
              <DetailRow label="Bank Account" value={detailCheque.bankAccount} />
              <DetailRow label="Payee" value={detailCheque.payee} />
              <DetailRow label="Amount" value={formatCurrency(detailCheque.amount)} />
              <DetailRow label="Issue Date" value={formatDate(detailCheque.issueDate)} />
              <DetailRow label="Due Date" value={formatDate(detailCheque.dueDate)} />
              <DetailRow label="Status" value={detailCheque.status} />
              <DetailRow label="Direction" value={detailCheque.direction} />
              <DetailRow label="Memo" value={detailCheque.memo || "-"} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof FileSpreadsheet;
  tone: "blue" | "orange" | "emerald";
}) {
  const toneClasses =
    tone === "blue"
      ? "bg-[#e7f2ff] text-[#1674ff]"
      : tone === "orange"
        ? "bg-[#fff1e2] text-[#e67817]"
        : "bg-[#e8fff4] text-[#0f9f63]";

  return (
    <div className="rounded-[18px] border border-[#d7dfeb] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#7d8aa2]">{label}</div>
          <div className="mt-3 text-[30px] font-semibold text-[#24365a]">{value}</div>
          <div className="mt-2 text-sm text-[#697791]">{note}</div>
        </div>
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-full", toneClasses)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function MenuActionButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof FileSpreadsheet;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-[#f7f9fd]",
        danger ? "text-[#dc2626]" : "text-[#24365a]",
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-[12px] border border-[#e5ebf4] bg-[#fbfcff] px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7c8ba4]">{label}</div>
      <div className="text-sm font-medium text-[#24365a]">{value}</div>
    </div>
  );
}

