"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  Search,
  ShieldOff,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useAccountDetailQuery,
  useAccountSearchQuery,
  useAccountTreeQuery,
  useCreateAccountMutation,
  useCreateLedgerItemMutation,
  useDeleteAccountMutation,
  useDeleteLedgerItemMutation,
  useLedgerItemsQuery,
  useReparentAccountMutation,
  useSetAccountStatusMutation,
  useSuggestAccountCodeQuery,
  useUpdateAccountMutation,
  useUpdateLedgerItemMutation,
} from "@/hooks/use-accounts-query";
import { ApiError } from "@/services/api-client";
import { cn } from "@/lib/utils";
import { formatAmount, formatDateTime } from "@/lib/format";
import { moneyAmountsEqual, sumMoney } from "@/lib/money";
import { useSessionContext } from "@/hooks/use-session-context";
import { getTrialBalance } from "@/services/reports.service";
import type { AccountLevel, AccountNature, AccountNode, AccountSearchResult, BankAccountDetails, LedgerItem } from "@/types/accounts";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { AppDateInput } from "@/components/shared/app-date-input";
import bankBranchRecords from "@/data/bangladesh-bank-branches.json";

const LEVEL_LABELS: Record<AccountLevel, string> = {
  MAIN_CATEGORY: "Main Category",
  CATEGORY: "Category",
  LEDGER: "Ledger",
};

const LEVEL_OPTIONS: AccountLevel[] = ["MAIN_CATEGORY", "CATEGORY", "LEDGER"];

// A Category may nest under a Main Category or another Category to unlimited
// depth; a Ledger is the one exception that may sit under any non-ledger
// level (Section 3).
const REQUIRED_CHILD_LEVEL: Partial<Record<AccountLevel, AccountLevel>> = {
  MAIN_CATEGORY: "CATEGORY",
  CATEGORY: "CATEGORY",
};

const COMMON_UNITS = ["pcs", "box", "ream", "pack", "set", "dozen", "kg", "g", "liter", "ml", "meter", "unit"];

interface BankBranchRecord {
  bank: string;
  district: string;
  branch: string;
  routingNumber: string;
}

const BANGLADESH_BANK_BRANCHES = bankBranchRecords as BankBranchRecord[];
const BANGLADESH_BANKS = [...new Set(BANGLADESH_BANK_BRANCHES.map((record) => record.bank))]
  .sort((a, b) => a.localeCompare(b));

const NATURE_OPTIONS: { value: AccountNature; label: string }[] = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "INCOME", label: "Income" },
  { value: "DIRECT_EXPENSE", label: "Direct Expense" },
  { value: "INDIRECT_EXPENSE", label: "Indirect Expense" },
];

function levelIcon(level: AccountLevel) {
  if (level === "LEDGER") return BookOpen;
  if (level === "MAIN_CATEGORY") return FolderTree;
  return Layers;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export interface FormState {
  code: string;
  name: string;
  nature: AccountNature;
  isControlAccount: boolean;
  requiresItemDetails: boolean;
  openingBalance: string;
  openingBalanceDate: string;
  openingBalanceSources: Array<{ accountId: string; amount: string }>;
  bankDetails: BankAccountDetails;
}

export const emptyBankDetails: BankAccountDetails = {
  bankName: "", accountNumber: "", branchName: "", routingNumber: "", swiftCode: "",
  country: "Bangladesh", rmName: "", rmNumber: "", note: "",
};

export const emptyForm: FormState = {
  code: "", name: "", nature: "ASSET", isControlAccount: false, requiresItemDetails: true, openingBalance: "0", openingBalanceDate: "", openingBalanceSources: [{ accountId: "", amount: "" }],
  bankDetails: emptyBankDetails,
};

export function findAccountPath(nodes: AccountNode[], id: string, parents: AccountNode[] = []): AccountNode[] {
  for (const node of nodes) {
    const path = [...parents, node];
    if (node.id === id) return path;
    const childPath = findAccountPath(node.children, id, path);
    if (childPath.length) return childPath;
  }
  return [];
}

export function ChartOfAccountsPanel() {
  const router = useRouter();
  const { mode, session } = useSessionContext();
  const treeQuery = useAccountTreeQuery(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showBalances, setShowBalances] = useState(false);
  const balanceQuery = useQuery({
    queryKey: [mode, "chart-of-accounts-balances", session?.workspaceId],
    queryFn: () => getTrialBalance(mode, session!.workspaceId),
    enabled: showBalances && Boolean(session?.workspaceId),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formLevel, setFormLevel] = useState<AccountLevel>("MAIN_CATEGORY");
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [requestedEditId, setRequestedEditId] = useState<string | null>(null);
  const [manageItemsAccount, setManageItemsAccount] = useState<{ id: string; name: string } | null>(null);

  const searchActive = search.trim().length > 0 || levelFilter !== "all" || statusFilter !== "all";
  const searchQuery = useAccountSearchQuery({ q: search.trim() || undefined, level: levelFilter, status: statusFilter }, searchActive);
  const detailQuery = useAccountDetailQuery(selectedId);
  const selectedIsManagedPartyLedger = Boolean(
    detailQuery.data?.bankDetails
    && typeof detailQuery.data.bankDetails === "object"
    && !Array.isArray(detailQuery.data.bankDetails)
    && (detailQuery.data.bankDetails as unknown as Record<string, unknown>).partyMaster,
  );

  const createMutation = useCreateAccountMutation();
  const updateMutation = useUpdateAccountMutation();
  const reparentMutation = useReparentAccountMutation();
  const statusMutation = useSetAccountStatusMutation();
  const deleteMutation = useDeleteAccountMutation();

  const tree = treeQuery.data ?? [];
  const accountBalances = useMemo(() => {
    const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const nodesByName = new Map<string, AccountNode>();
    const ownBalances = new Map<string, number>();
    const trialBalanceRows = balanceQuery.data ?? [];
    const index = (node: AccountNode) => {
      const key = normalize(node.name);
      const existing = nodesByName.get(key);
      // When a category and ledger share a display name, postings belong to
      // the ledger. Category totals are calculated from their descendants.
      if (!existing || node.level === "LEDGER") nodesByName.set(key, node);
      node.children.forEach(index);
    };
    tree.forEach(index);
    const nodes = Array.from(nodesByName.values());
    const mainCategory = (nature: AccountNode["nature"]) =>
      nodes.find((candidate) => candidate.level === "MAIN_CATEGORY" && candidate.nature === nature);
    const firstNamed = (...names: string[]) => names.map((name) => nodesByName.get(normalize(name))).find(Boolean);
    trialBalanceRows.forEach((row) => {
      const ledgerKey = normalize(row.ledger);
      const groupKey = normalize(row.group);
      // Purchases use perpetual inventory. Old name-only purchase rows therefore
      // belong to Inventory Control, not to a user-created expense category.
      if (ledgerKey === "purchase account" || ledgerKey === "purchase accounts" || ledgerKey === "purchase return") {
        const inventoryControl = firstNamed("Inventory Control", "Inventory") ?? mainCategory("ASSET");
        if (inventoryControl) {
          ownBalances.set(inventoryControl.id, (ownBalances.get(inventoryControl.id) ?? 0) + Number(row.debit || 0) - Number(row.credit || 0));
          return;
        }
      }
      let node = nodesByName.get(ledgerKey);
      if (!node && (groupKey.includes("sundry creditor") || groupKey.includes("payable"))) {
        node = nodesByName.get("accounts payable supplier")
          ?? Array.from(nodesByName.values()).find((candidate) => candidate.nature === "LIABILITY" && normalize(candidate.name).includes("accounts payable"));
      }
      if (!node && (groupKey.includes("sundry debtor") || groupKey.includes("receivable"))) {
        node = Array.from(nodesByName.values()).find((candidate) => candidate.level === "LEDGER" && candidate.nature === "ASSET" && normalize(candidate.name).includes("accounts receivable"));
      }
      // Trial-balance ledgers may retain historical/free-text names while the
      // structured COA uses modern control-account names. Group fallbacks keep
      // every accounting side represented instead of silently dropping rows.
      if (!node && groupKey === "revenue") {
        node = nodesByName.get("sales revenue") ?? nodesByName.get("operating income") ?? nodesByName.get("income");
      }
      if (!node && groupKey === "direct expenses") {
        node = nodesByName.get("direct expenses") ?? nodesByName.get("expenses");
      }
      if (!node && (groupKey.includes("indirect expense") || groupKey === "expenses")) {
        node = firstNamed("Indirect Expenses", "Expenses") ?? mainCategory("INDIRECT_EXPENSE");
      }
      if (!node && (groupKey.includes("other income") || groupKey === "income")) {
        node = firstNamed("Other Income", "Income") ?? mainCategory("INCOME");
      }
      if (!node && (groupKey === "cash in hand" || groupKey === "bank accounts" || groupKey === "current assets")) {
        node = nodesByName.get(groupKey) ?? nodesByName.get("current assets") ?? nodesByName.get("assets");
      }
      if (!node && groupKey.includes("sundry creditor")) {
        node = nodesByName.get("accounts payable control") ?? nodesByName.get("payables") ?? nodesByName.get("liabilities");
      }
      if (!node && groupKey.includes("sundry debtor")) {
        node = nodesByName.get("accounts receivable control") ?? nodesByName.get("receivables advances") ?? nodesByName.get("assets");
      }
      // Common historical ledgers can carry the generic "General Ledger"
      // group. Classify only when their accounting nature is unambiguous.
      if (!node && groupKey === "general ledger") {
        if (/capital|equity|drawing|retained earning|opening balance adjustment/.test(ledgerKey)) node = mainCategory("EQUITY");
        else if (/revenue|income|sales/.test(ledgerKey)) node = mainCategory("INCOME");
        else if (/cost of goods|carriage inward|freight|loading|unloading/.test(ledgerKey)) node = mainCategory("DIRECT_EXPENSE");
        else if (/expense|rent|stationery|maintenance|charge|commission paid|marketing|advertisement/.test(ledgerKey)) node = mainCategory("INDIRECT_EXPENSE");
        else if (/payable|loan|advance from customer|liabilit/.test(ledgerKey)) node = mainCategory("LIABILITY");
        else if (/cash|bank|inventory|stock|receivable|asset|furniture|equipment|vehicle|advance to|prepaid/.test(ledgerKey)) node = mainCategory("ASSET");
      }
      if (node) ownBalances.set(node.id, sumMoney([ownBalances.get(node.id) ?? 0, Number(row.debit || 0), -Number(row.credit || 0)]));
    });
    const totals = new Map<string, number>();
    const totalNode = (node: AccountNode): number => {
      const total = sumMoney([ownBalances.get(node.id) ?? 0, ...node.children.map(totalNode)]);
      totals.set(node.id, total);
      return total;
    };
    tree.forEach(totalNode);
    return totals;
  }, [balanceQuery.data, tree]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (requestedEditId && detailQuery.data?.id === requestedEditId) {
      openEditForm();
      setRequestedEditId(null);
    }
  }, [detailQuery.data?.id, requestedEditId]);

  function openContextMenu(id: string, x: number, y: number) {
    setSelectedId(id);
    setContextMenu({ id, x: Math.min(x, window.innerWidth - 170), y: Math.min(y, window.innerHeight - 110) });
  }

  function openAccountClass(id: string) {
    router.push(`/app/account-classes/${id}`);
  }

  useEffect(() => {
    if (!selectedId && tree.length) {
      setSelectedId(tree[0].id);
    }
  }, [selectedId, tree]);

  useEffect(() => {
    if (!tree.length) return;
    setExpanded((prev) => {
      if (prev.size) return prev;
      const next = new Set<string>();
      tree.forEach((node) => {
        if (node.children.length) next.add(node.id);
      });
      return next;
    });
  }, [tree]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function expandAll() {
    const ids = new Set<string>();
    const walk = (nodes: AccountNode[]) => {
      nodes.forEach((node) => {
        if (node.children.length) {
          ids.add(node.id);
          walk(node.children);
        }
      });
    };
    walk(tree);
    setExpanded(ids);
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function openCreateForm(level: AccountLevel, parentId: string | null, natureHint?: AccountNature) {
    setFormMode("create");
    setFormLevel(level);
    setFormParentId(parentId);
    setFormValues({ ...emptyForm, bankDetails: { ...emptyBankDetails }, nature: natureHint ?? emptyForm.nature });
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm() {
    if (!detailQuery.data) return;
    setFormMode("edit");
    setFormLevel(detailQuery.data.level);
    setFormParentId(detailQuery.data.parentId);
    setFormValues({
      code: detailQuery.data.code,
      name: detailQuery.data.name,
      nature: detailQuery.data.nature,
      isControlAccount: detailQuery.data.isControlAccount,
      requiresItemDetails: detailQuery.data.requiresItemDetails,
      openingBalance: String(detailQuery.data.openingBalance ?? 0),
      openingBalanceDate: detailQuery.data.openingBalanceDate ?? "",
      openingBalanceSources: detailQuery.data.openingBalanceSources?.length
        ? detailQuery.data.openingBalanceSources.map((source) => ({ accountId: source.accountId, amount: String(source.amount) }))
        : detailQuery.data.openingBalanceSourceAccountId
          ? [{ accountId: detailQuery.data.openingBalanceSourceAccountId, amount: String(detailQuery.data.openingBalance ?? 0) }]
          : [{ accountId: "", amount: "" }],
      bankDetails: { ...emptyBankDetails, ...(detailQuery.data.bankDetails ?? {}) },
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submitForm() {
    setFormError(null);
    if (!formValues.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    const parentPath = formParentId ? findAccountPath(tree, formParentId) : [];
    const editingBankLedger = formMode === "edit" && Boolean(detailQuery.data?.bankDetails);
    const isBankLedger = formLevel === "LEDGER" && (editingBankLedger || parentPath.some((node) => node.name.trim().toLowerCase() === "bank & mfs accounts"));
    if (isBankLedger) {
      const required = [formValues.bankDetails.bankName, formValues.bankDetails.accountNumber, formValues.bankDetails.country, formValues.bankDetails.routingNumber];
      if (required.some((value) => !value.trim())) {
        setFormError("Bank name, account number, country, and routing number are required.");
        return;
      }
    }
    const openingBalanceSources = (formValues.openingBalanceSources ?? [])
      .filter((source) => source.accountId || Number(source.amount) > 0)
      .map((source) => ({ accountId: source.accountId, amount: Number(source.amount) }));
    const allocatedTotal = sumMoney(openingBalanceSources.map((source) => source.amount));
    if (formLevel === "LEDGER" && Number(formValues.openingBalance || 0) > 0 && openingBalanceSources.some((source) => !source.accountId || !Number.isFinite(source.amount) || source.amount <= 0)) {
      setFormError("Select a Cash/Bank ledger and enter a valid amount for every allocation.");
      return;
    }
    if (formLevel === "LEDGER" && Number(formValues.openingBalance || 0) > 0 && !moneyAmountsEqual(allocatedTotal, Number(formValues.openingBalance))) {
      setFormError(`Cash/Bank allocation total must equal the Opening Balance (${formatAmount(formValues.openingBalance)}).`);
      return;
    }
    if (formLevel === "LEDGER" && Number(formValues.openingBalance || 0) > 0 && !formValues.openingBalanceDate) {
      setFormError("Opening Balance Date is required.");
      return;
    }

    try {
      if (formMode === "create") {
        const created = await createMutation.mutateAsync({
          level: formLevel,
          parentId: formParentId,
          name: formValues.name.trim(),
          nature: formValues.nature,
          isControlAccount: formValues.isControlAccount,
          requiresItemDetails: isBankLedger ? false : formValues.requiresItemDetails,
          openingBalance: Number(formValues.openingBalance || 0),
          openingBalanceDate: formValues.openingBalanceDate || null,
          openingBalanceSources,
          bankDetails: isBankLedger ? formValues.bankDetails : null,
        });
        toast.success(`${LEVEL_LABELS[formLevel]} created`);
        setFormOpen(false);
        setSelectedId(created.id);
        if (formParentId) {
          setExpanded((prev) => new Set(prev).add(formParentId));
        }
        if (formLevel === "LEDGER" && formValues.requiresItemDetails && !isBankLedger) {
          setManageItemsAccount({ id: created.id, name: created.name });
        }
      } else if (selectedId) {
        const itemDetailsWereDisabled = !detailQuery.data?.requiresItemDetails;
        await updateMutation.mutateAsync({
          id: selectedId,
          input: {
            name: formValues.name.trim(),
            isControlAccount: formValues.isControlAccount,
            requiresItemDetails: isBankLedger ? false : formValues.requiresItemDetails,
            openingBalance: Number(formValues.openingBalance || 0),
            openingBalanceDate: formValues.openingBalanceDate || null,
            openingBalanceSources,
            bankDetails: isBankLedger ? formValues.bankDetails : null,
          },
        });
        if (formLevel !== "MAIN_CATEGORY" && formParentId !== detailQuery.data?.parentId) {
          await reparentMutation.mutateAsync({ id: selectedId, parentId: formParentId });
        }
        toast.success("Account updated");
        setFormOpen(false);
        if (formLevel === "LEDGER" && formValues.requiresItemDetails && !isBankLedger && itemDetailsWereDisabled) {
          setManageItemsAccount({ id: selectedId, name: formValues.name.trim() });
        }
      }
    } catch (error) {
      setFormError(errorMessage(error, "Could not save this account."));
    }
  }

  async function handleToggleStatus() {
    if (!detailQuery.data || !selectedId) return;
    const nextStatus = detailQuery.data.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await statusMutation.mutateAsync({ id: selectedId, status: nextStatus });
      toast.success(nextStatus === "ACTIVE" ? "Account activated" : "Account deactivated");
    } catch (error) {
      toast.error(errorMessage(error, "Could not change account status."));
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    try {
      await deleteMutation.mutateAsync(selectedId);
      toast.success("Account deleted");
      setConfirmDelete(false);
      setSelectedId(null);
    } catch (error) {
      toast.error(errorMessage(error, "This account cannot be deleted."));
      setConfirmDelete(false);
    }
  }

  const childLevelForCreate = detailQuery.data ? REQUIRED_CHILD_LEVEL[detailQuery.data.level] : undefined;
  const canAddLedgerUnderSelected = Boolean(detailQuery.data && detailQuery.data.level !== "LEDGER");
  const canAddChildUnderSelected = Boolean(detailQuery.data && childLevelForCreate);
  const contextAccount = contextMenu ? findAccountPath(tree, contextMenu.id).at(-1) : undefined;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="flex min-h-0 flex-col rounded-[6px] border border-[#d7dfeb] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#d7dfeb] bg-[#fbfcff] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[15px] font-semibold text-[#1f3253]">Chart of Accounts</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={expandAll}>
                Expand All
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={collapseAll}>
                Collapse All
              </Button>
              <Button type="button" size="sm" onClick={() => openCreateForm("MAIN_CATEGORY", null)}>
                <Plus className="h-4 w-4" />
                Add Main Category
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CollapsibleSearch
              value={search}
              onChange={setSearch}
              label="Search accounts"
              placeholder="Search accounts by name or code"
              expandedWidth="min-w-[180px] flex-1"
            />
            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value)}
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-foreground"
            >
              <option value="all">All levels</option>
              {LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
            <label className="ml-auto inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium text-[#34435f]">
              <input type="checkbox" checked={showBalances} onChange={(event) => setShowBalances(event.target.checked)} className="h-4 w-4 accent-[#2563eb]" />
              Show Balance
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm text-foreground"
            >
              <option value="all">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {treeQuery.isLoading ? (
            <div className="px-3 py-10 text-center text-sm text-[#6d7b94]">Loading chart of accounts...</div>
          ) : treeQuery.isError ? (
            <div className="px-3 py-10 text-center text-sm text-[#b42318]">Could not load the chart of accounts.</div>
          ) : searchActive ? (
            <SearchResultsList results={searchQuery.data ?? []} selectedId={selectedId} onSelect={setSelectedId} onContextMenu={openContextMenu} onOpenClass={openAccountClass} loading={searchQuery.isLoading} showBalances={showBalances} balances={accountBalances} balancesLoading={balanceQuery.isLoading} />
          ) : (
            <TreeList nodes={tree} depth={0} expanded={expanded} selectedId={selectedId} onToggle={toggleExpand} onSelect={setSelectedId} onContextMenu={openContextMenu} onOpenClass={openAccountClass} showBalances={showBalances} balances={accountBalances} balancesLoading={balanceQuery.isLoading} />
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col rounded-[6px] border border-[#d7dfeb] bg-white">
        {detailQuery.isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-[#6d7b94]">Loading account details...</div>
        ) : !detailQuery.data ? (
          <div className="px-4 py-10 text-center text-sm text-[#6d7b94]">Select an account to see its details.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d7dfeb] bg-[#fbfcff] px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#74839b]">
                  {LEVEL_LABELS[detailQuery.data.level]}
                  {detailQuery.data.isControlAccount ? (
                    <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[11px] font-semibold text-[#1d66b1]">Control</span>
                  ) : null}
                  {detailQuery.data.isSystem ? (
                    <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#475569]">System</span>
                  ) : null}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      detailQuery.data.status === "ACTIVE" ? "bg-[#eefaf3] text-[#16824b]" : "bg-[#fff1f0] text-[#b42318]",
                    )}
                  >
                    {detailQuery.data.status === "ACTIVE" ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-1 truncate text-[19px] font-semibold text-[#1f3253]">{detailQuery.data.name}</div>
                <div className="mt-1 truncate text-[13px] text-[#697791]">{detailQuery.data.path}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!detailQuery.data.isSystem && !selectedIsManagedPartyLedger ? <Button type="button" size="sm" className="border-[#2563eb] bg-[#2563eb] text-white hover:bg-[#1d4ed8]" onClick={openEditForm}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button> : null}
                {detailQuery.data.level === "LEDGER" && detailQuery.data.requiresItemDetails && !detailQuery.data.bankDetails ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setManageItemsAccount({ id: detailQuery.data!.id, name: detailQuery.data!.name })}
                  >
                    <ListChecks className="h-4 w-4" />
                    Manage Items
                  </Button>
                ) : null}
                {!detailQuery.data.isSystem && !selectedIsManagedPartyLedger && detailQuery.data.level !== "MAIN_CATEGORY" ? <Button
                  type="button"
                  size="sm"
                  title={detailQuery.data.status === "ACTIVE" && detailQuery.data.hasPostingHistory ? "Accounts with transactions cannot be deactivated" : undefined}
                  className={detailQuery.data.status === "ACTIVE"
                    ? "border-[#f59e0b] bg-[#f59e0b] text-white hover:bg-[#d97706] disabled:bg-[#f8d99a]"
                    : "border-[#16a34a] bg-[#16a34a] text-white hover:bg-[#15803d]"}
                  onClick={handleToggleStatus}
                  disabled={selectedIsManagedPartyLedger || statusMutation.isPending || (detailQuery.data.status === "ACTIVE" && detailQuery.data.hasPostingHistory)}
                >
                  {detailQuery.data.status === "ACTIVE" ? (
                    <>
                      <ShieldOff className="h-4 w-4" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Activate
                    </>
                  )}
                </Button> : null}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
                <DetailField label="Account Code" value={detailQuery.data.code} />
                <DetailField label="Account Nature" value={detailQuery.data.nature.replace(/_/g, " ")} />
                <DetailField label="Parent Account" value={detailQuery.data.parentName ?? "None (top level)"} />
                {detailQuery.data.level === "LEDGER" && !detailQuery.data.bankDetails ? (
                  <DetailField
                    label="Item Details on Expense"
                    value={detailQuery.data.requiresItemDetails ? "Required" : "Not required"}
                  />
                ) : null}
                <DetailField label="Sort Order" value={String(detailQuery.data.sortOrder)} />
                <DetailField label="Child Accounts" value={String(detailQuery.data.childCount)} />
                <DetailField label="Posting History" value={detailQuery.data.hasPostingHistory ? "Has postings" : "No postings yet"} />
                <DetailField label="Created" value={formatDateTime(detailQuery.data.createdAt)} />
                <DetailField label="Last Updated" value={formatDateTime(detailQuery.data.updatedAt)} />
                {detailQuery.data.bankDetails && !selectedIsManagedPartyLedger ? (
                  <>
                    <DetailField label="Bank Name" value={detailQuery.data.bankDetails.bankName} />
                    <DetailField label="Account Number" value={detailQuery.data.bankDetails.accountNumber} />
                    <DetailField label="Branch Name" value={detailQuery.data.bankDetails.branchName} />
                    <DetailField label="Routing Number" value={detailQuery.data.bankDetails.routingNumber} />
                    <DetailField label="SWIFT Code" value={detailQuery.data.bankDetails.swiftCode || "Not provided"} />
                    <DetailField label="Country" value={detailQuery.data.bankDetails.country || "Not provided"} />
                    <DetailField label="RM Name" value={detailQuery.data.bankDetails.rmName || "Not provided"} />
                    <DetailField label="RM Number" value={detailQuery.data.bankDetails.rmNumber || "Not provided"} />
                    <DetailField label="Note" value={detailQuery.data.bankDetails.note || "Not provided"} />
                  </>
                ) : null}
              </dl>

              <div className="mt-5 flex flex-wrap gap-2 border-t border-[#eef2f7] pt-4">
                {canAddChildUnderSelected && childLevelForCreate ? (
                  <Button
                    type="button"
                    size="sm"
                    className="border-[#e76412] bg-[#fff5eb] text-[#c95708] hover:bg-[#ffe8d1]"
                    onClick={() => openCreateForm(childLevelForCreate, selectedId, detailQuery.data?.nature)}
                  >
                    <Plus className="h-4 w-4" />
                    Add {LEVEL_LABELS[childLevelForCreate]}
                  </Button>
                ) : null}
                {canAddLedgerUnderSelected ? (
                  <Button
                    type="button"
                    size="sm"
                    className="border-[#e76412] bg-[#fff5eb] text-[#c95708] hover:bg-[#ffe8d1]"
                    onClick={() => openCreateForm("LEDGER", selectedId, detailQuery.data?.nature)}
                  >
                    <Plus className="h-4 w-4" />
                    Add Ledger
                  </Button>
                ) : null}
                {!detailQuery.data.isSystem && !selectedIsManagedPartyLedger && detailQuery.data.level !== "MAIN_CATEGORY" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto border-[#e76412] bg-[#e76412] text-white hover:border-[#cf570b] hover:bg-[#cf570b]"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>

      {contextMenu && !contextAccount?.isSystem && !(
        contextAccount?.bankDetails
        && typeof contextAccount.bankDetails === "object"
        && !Array.isArray(contextAccount.bankDetails)
        && (contextAccount.bankDetails as unknown as Record<string, unknown>).partyMaster
      ) ? (
        <div
          className="fixed z-[100] w-40 rounded-lg border border-[#dbe3ef] bg-white p-1.5 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[#28365b] hover:bg-[#f1f5f9]"
            onClick={() => {
              setRequestedEditId(contextMenu.id);
              setSelectedId(contextMenu.id);
              setContextMenu(null);
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#dc2626] hover:bg-[#fff1f2]"
            onClick={() => {
              setSelectedId(contextMenu.id);
              setContextMenu(null);
              setConfirmDelete(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      ) : null}

      <AccountFormDialog
        open={formOpen}
        mode={formMode}
        level={formLevel}
        parentId={formParentId}
        tree={tree}
        values={formValues}
        error={formError}
        submitting={createMutation.isPending || updateMutation.isPending || reparentMutation.isPending}
        onChange={setFormValues}
        onParentChange={setFormParentId}
        onCancel={() => setFormOpen(false)}
        onSubmit={submitForm}
        onManageItems={formMode === "edit" && formLevel === "LEDGER" && selectedId && detailQuery.data?.requiresItemDetails
          ? () => {
              setFormOpen(false);
              setManageItemsAccount({ id: selectedId, name: formValues.name.trim() || detailQuery.data?.name || "Ledger" });
            }
          : undefined}
      />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="w-[min(92vw,420px)]">
          <DialogTitle className="text-lg font-semibold">Delete this account?</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted">
            This cannot be undone. Ledgers with posting history and categories with child accounts cannot be deleted.
            {detailQuery.data?.isSystem ? " This is a default account that other features (like quick-add ledgers) may expect to exist." : ""}
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleDelete} disabled={deleteMutation.isPending} className="border-[#b42318] bg-[#b42318] hover:bg-[#93190f]">
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ManageLedgerItemsDialog account={manageItemsAccount} onClose={() => setManageItemsAccount(null)} />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">{label}</dt>
      <dd className="mt-0.5 truncate text-[#28365b]">{value}</dd>
    </div>
  );
}

function TreeList({
  nodes,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  onContextMenu,
  onOpenClass,
  showBalances,
  balances,
  balancesLoading,
}: {
  nodes: AccountNode[];
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onOpenClass: (id: string) => void;
  showBalances: boolean;
  balances: Map<string, number>;
  balancesLoading: boolean;
}) {
  if (!nodes.length) {
    return depth === 0 ? <div className="px-3 py-10 text-center text-sm text-[#6d7b94]">No accounts yet.</div> : null;
  }

  return (
    <div className={depth > 0 ? "ml-[10px] border-l border-[#e2e8f2] pl-[16px]" : undefined}>
      {nodes.map((node) => {
        const Icon = levelIcon(node.level);
        const isExpanded = expanded.has(node.id);
        const hasChildren = node.children.length > 0;
        const isSelected = node.id === selectedId;

        return (
          <div key={node.id} className="relative">
            {depth > 0 ? (
              <span className="pointer-events-none absolute left-[-16px] top-[17px] h-px w-[16px] bg-[#e2e8f2]" />
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              onDoubleClick={() => {
                if (node.level === "MAIN_CATEGORY") onOpenClass(node.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu(node.id, event.clientX, event.clientY);
              }}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-[14px] transition",
                isSelected ? "bg-[#eef4ff] font-semibold text-[#1d66b1]" : "text-black hover:bg-[#f8fafc]",
                node.status === "INACTIVE" ? "opacity-60" : "",
              )}
            >
              <span
                role="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                  if (hasChildren) onToggle(node.id);
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center text-[#94a3b8]"
              >
                {hasChildren ? (
                  isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )
                ) : (
                  <span className="block h-1.5 w-1.5 rounded-full bg-[#c4ccdb]" />
                )}
              </span>
              <Icon className="h-4 w-4 shrink-0 text-[#7c8aa3]" />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {showBalances ? <AccountBalanceValue value={balances.get(node.id) ?? 0} loading={balancesLoading} /> : null}
              {hasChildren ? (
                <span className="shrink-0 rounded-full bg-[#f1f5f9] px-1.5 py-0.5 text-[11px] font-medium text-[#7c8aa3]">
                  {node.children.length}
                </span>
              ) : null}
            </button>
            {hasChildren && isExpanded ? (
              <TreeList nodes={node.children} depth={depth + 1} expanded={expanded} selectedId={selectedId} onToggle={onToggle} onSelect={onSelect} onContextMenu={onContextMenu} onOpenClass={onOpenClass} showBalances={showBalances} balances={balances} balancesLoading={balancesLoading} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SearchResultsList({
  results,
  selectedId,
  onSelect,
  onContextMenu,
  onOpenClass,
  loading,
  showBalances,
  balances,
  balancesLoading,
}: {
  results: AccountSearchResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onOpenClass: (id: string) => void;
  loading: boolean;
  showBalances: boolean;
  balances: Map<string, number>;
  balancesLoading: boolean;
}) {
  if (loading) {
    return <div className="px-3 py-10 text-center text-sm text-[#6d7b94]">Searching...</div>;
  }
  if (!results.length) {
    return <div className="px-3 py-10 text-center text-sm text-[#6d7b94]">No matching accounts.</div>;
  }

  return (
    <div>
      {results.map((account) => {
        const Icon = levelIcon(account.level);
        const isSelected = account.id === selectedId;
        return (
          <button
            key={account.id}
            type="button"
            onClick={() => onSelect(account.id)}
            onDoubleClick={() => {
              if (account.level === "MAIN_CATEGORY") onOpenClass(account.id);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              onContextMenu(account.id, event.clientX, event.clientY);
            }}
            className={cn(
              "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left text-[14px] transition",
              isSelected ? "bg-[#eef4ff] text-[#1d66b1]" : "text-[#28365b] hover:bg-[#f8fafc]",
              account.status === "INACTIVE" ? "opacity-60" : "",
            )}
          >
            <span className="flex w-full items-center gap-1.5 font-medium">
              <Icon className="h-4 w-4 shrink-0 text-[#7c8aa3]" />
              <span className="min-w-0 flex-1 truncate">{account.code} · {account.name}</span>
              {showBalances ? <AccountBalanceValue value={balances.get(account.id) ?? 0} loading={balancesLoading} /> : null}
            </span>
            <span className="truncate pl-5 text-[12px] text-[#8a97ad]">{account.path}</span>
          </button>
        );
      })}
    </div>
  );
}

function AccountBalanceValue({ value, loading }: { value: number; loading: boolean }) {
  if (loading) return <span className="shrink-0 text-[12px] font-normal text-[#94a3b8]">...</span>;
  const side = value > 0 ? "Dr" : value < 0 ? "Cr" : "";
  return (
    <span className={cn("shrink-0 text-[12px] font-semibold tabular-nums", value < 0 ? "text-[#b45309]" : "text-[#2563eb]")}>
      {formatAmount(Math.abs(value))}{side ? ` ${side}` : ""}
    </span>
  );
}

function SearchableBankOption({
  value,
  placeholder,
  disabled,
  options,
  onSelect,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  options: Array<{ key: string; value: string; label: string; meta?: string }>;
  onSelect: (option: { key: string; value: string; label: string; meta?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options
      .filter((option) => !needle || `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 150);
  }, [options, query]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const chooseOption = (index: number, moveToNextField = false) => {
    const option = filtered[index];
    if (!option) return;
    onSelect(option);
    setQuery(option.value);
    setOpen(false);
    if (moveToNextField) {
      const currentInput = rootRef.current?.querySelector("input");
      const dialog = rootRef.current?.closest('[role="dialog"]');
      const fields = dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)'))
        : [];
      const currentIndex = currentInput ? fields.indexOf(currentInput) : -1;
      window.requestAnimationFrame(() => fields[currentIndex + 1]?.focus());
    }
  };

  return (
    <div ref={rootRef} className="relative mt-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8190a8]" />
        <Input
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          className="h-9 bg-white pl-9 pr-8"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onFocus={() => { setActiveIndex(0); setOpen(true); }}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!open) setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) setOpen(true);
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Home" && open) {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === "End" && open) {
              event.preventDefault();
              setActiveIndex(Math.max(filtered.length - 1, 0));
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === "Enter" && open && filtered[activeIndex]) {
              event.preventDefault();
              chooseOption(activeIndex, true);
            }
          }}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8190a8]" />
      </div>
      {open && !disabled ? (
        <div className="absolute z-[80] mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-[#d8e1ee] bg-white p-1 shadow-xl">
          {filtered.length ? filtered.map((option, index) => (
            <button
              key={option.key}
              type="button"
              ref={(element) => { optionRefs.current[index] = element; }}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left",
                index === activeIndex ? "bg-[#f0f5ff]" : "hover:bg-[#f7f9fc]",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => chooseOption(index)}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-[#1f3253]">{option.label}</span>
                {option.meta ? <span className="block truncate text-xs text-[#7887a0]">{option.meta}</span> : null}
              </span>
              {value === option.value ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#e76412]" /> : null}
            </button>
          )) : <div className="px-3 py-5 text-center text-sm text-muted">No matching option found</div>}
        </div>
      ) : null}
    </div>
  );
}

export function AccountFormDialog({
  open,
  mode,
  level,
  parentId,
  tree,
  values,
  error,
  submitting,
  onChange,
  onParentChange,
  onCancel,
  onSubmit,
  onManageItems,
  allowParentPicker,
}: {
  open: boolean;
  mode: "create" | "edit";
  level: AccountLevel;
  parentId: string | null;
  tree: AccountNode[];
  values: FormState;
  error: string | null;
  submitting: boolean;
  onChange: (values: FormState) => void;
  onParentChange: (parentId: string | null) => void;
  onCancel: () => void;
  onSubmit: () => void;
  /** Opens the existing ledger-scoped item manager from the edit dialog. */
  onManageItems?: () => void;
  /** Lets a "create" caller (e.g. the voucher screens' quick "Add Ledger") expose
   * the same parent-category search used when editing, instead of a fixed
   * parentId — for callers where the operator hasn't already navigated to the
   * right Class/Category in a tree view first. Editing a ledger always shows it. */
  allowParentPicker?: boolean;
}) {
  const openingBalanceSources = values.openingBalanceSources?.length
    ? values.openingBalanceSources
    : [{ accountId: "", amount: "" }];
  const parentName = useMemo(() => {
    if (!parentId) return null;
    const flat: AccountNode[] = [];
    const walk = (nodes: AccountNode[]) => nodes.forEach((node) => { flat.push(node); walk(node.children); });
    walk(tree);
    return flat.find((node) => node.id === parentId)?.name ?? null;
  }, [parentId, tree]);
  const isBankLedger = useMemo(() => {
    if (level !== "LEDGER") return false;
    if (mode === "edit" && values.bankDetails.bankName) return true;
    return parentId
      ? findAccountPath(tree, parentId).some((node) => node.name.trim().toLowerCase() === "bank & mfs accounts")
      : false;
  }, [level, mode, parentId, tree, values.bankDetails.bankName]);
  const selectedBankBranches = useMemo(
    () => BANGLADESH_BANK_BRANCHES.filter((record) => record.bank === values.bankDetails.bankName),
    [values.bankDetails.bankName],
  );
  const parentOptions = useMemo(() => {
    const options: Array<{ key: string; value: string; label: string; meta: string }> = [];
    const walk = (nodes: AccountNode[], parents: string[]) => nodes.forEach((node) => {
      const path = [...parents, node.name];
      if (node.level !== "LEDGER") {
        options.push({ key: node.id, value: node.name, label: node.name, meta: `${path.join(" > ")} · ${node.nature.replace(/_/g, " ")}` });
      }
      walk(node.children, path);
    });
    walk(tree, []);
    return options;
  }, [tree]);
  const openingBalanceSourceOptions = useMemo(() => {
    const options: Array<{ id: string; label: string }> = [];
    const walk = (nodes: AccountNode[], parents: string[]) => nodes.forEach((node) => {
      const path = [...parents, node.name];
      const normalizedPath = path.join(" > ").toLowerCase();
      if (node.level === "LEDGER" && node.status === "ACTIVE" && (node.name.toLowerCase().includes("cash") || normalizedPath.includes("bank & mfs accounts"))) {
        options.push({ id: node.id, label: node.name });
      }
      walk(node.children, path);
    });
    walk(tree, []);
    return options;
  }, [tree]);

  // Account Code is always server-generated — this is a read-only preview of
  // what AccountsService.suggestCode (and, at submit time, create()) will
  // assign, following the chart-of-accounts numbering convention. It's never
  // user-editable, so the positional scheme's invariants can't be broken by
  // a typo.
  const [debouncedName, setDebouncedName] = useState(values.name);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(values.name), 400);
    return () => clearTimeout(timer);
  }, [values.name]);

  const suggestQuery = useSuggestAccountCodeQuery(
    { level, nature: values.nature, parentId, name: debouncedName },
    open && mode === "create",
  );

  useEffect(() => {
    if (open && mode === "create" && suggestQuery.data?.code) {
      onChange({ ...values, code: suggestQuery.data.code });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestQuery.data?.code, open, mode]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className={cn("max-h-[92vh] overflow-y-auto", isBankLedger ? "w-[min(92vw,680px)]" : "w-[min(92vw,520px)]")} submitOnEnter>
        <DialogTitle className="text-lg font-semibold">
          {mode === "create" ? `Add ${LEVEL_LABELS[level]}` : `Edit ${LEVEL_LABELS[level]}`}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted">
          {level === "MAIN_CATEGORY" ? "Main categories sit at the top of the chart of accounts." : `Parent: ${parentName ?? "—"}`}
        </DialogDescription>

        <div className="mt-3 space-y-2.5">
          <div>
            <label className="text-xs font-medium text-muted">{level === "LEDGER" ? "Ledger Name" : "Account Name"}<span className="text-[#e76412]"> *</span></label>
            <Input value={values.name} onChange={(event) => onChange({ ...values, name: event.target.value })} className="mt-1 h-9" autoFocus />
          </div>
          {(mode === "edit" || allowParentPicker) && level === "LEDGER" ? (
            <div>
              <label className="text-xs font-medium text-muted">Parent Class / Category<span className="text-[#e76412]"> *</span></label>
              <SearchableBankOption
                value={parentName ?? ""}
                placeholder="Search and select a parent"
                options={parentOptions}
                onSelect={(option) => onParentChange(option.key)}
              />
              <p className="mt-1 text-xs text-muted">
                {mode === "edit" ? "Move this ledger to any Class or Category." : "Search any Class or Category."} Its account nature will follow the selected parent.
              </p>
            </div>
          ) : null}
          <div>
            <label className="text-xs font-medium text-muted">Account Code</label>
            <div className="mt-1 flex h-9 items-center rounded-xl border border-border bg-[#f5f7fb] px-3 text-sm text-foreground">
              {values.code || "—"}
            </div>
            <p className="mt-1 text-xs text-muted">Auto-generated from the chart of accounts — cannot be edited.</p>
          </div>
          {isBankLedger ? (
            <div className="rounded-xl border border-[#dce5f1] bg-[#f8fafc] p-3">
              <div className="mb-2">
                <div className="text-sm font-semibold text-[#1f3253]">Bank & MFS Account Information</div>
              </div>
              <div className="grid gap-x-2.5 gap-y-2 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-muted">Bank Name<span className="text-[#e76412]"> *</span></span>
                  <SearchableBankOption
                    value={values.bankDetails.bankName}
                    placeholder="Search and select a bank"
                    options={BANGLADESH_BANKS.map((bank) => ({ key: bank, value: bank, label: bank }))}
                    onSelect={(option) => onChange({
                      ...values,
                      bankDetails: { ...values.bankDetails, bankName: option.value, branchName: "", routingNumber: "" },
                    })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Account Number<span className="text-[#e76412]"> *</span></span>
                  <Input
                    value={values.bankDetails.accountNumber}
                    onChange={(event) => onChange({ ...values, bankDetails: { ...values.bankDetails, accountNumber: event.target.value } })}
                    className="mt-1 h-9 bg-white"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Country<span className="text-[#e76412]"> *</span></span>
                  <Input
                    value={values.bankDetails.country}
                    onChange={(event) => onChange({ ...values, bankDetails: { ...values.bankDetails, country: event.target.value } })}
                    className="mt-1 h-9 bg-white"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted">Branch Name</span>
                  <SearchableBankOption
                    value={values.bankDetails.branchName}
                    placeholder={values.bankDetails.bankName ? "Search and select a branch" : "Select a bank first"}
                    disabled={!values.bankDetails.bankName}
                    options={selectedBankBranches.map((record) => ({
                      key: record.routingNumber,
                      value: record.branch,
                      label: record.branch,
                      meta: `${record.district} · Routing: ${record.routingNumber}`,
                    }))}
                    onSelect={(option) => onChange({
                      ...values,
                      bankDetails: { ...values.bankDetails, branchName: option.value, routingNumber: option.key },
                    })}
                  />
                </label>
                {([
                  ["routingNumber", "Routing Number", true],
                  ["swiftCode", "SWIFT Code", false],
                  ["rmName", "RM Name", false],
                  ["rmNumber", "RM Number", false],
                  ["note", "Note", false],
                ] as const).map(([key, label, required]) => (
                  <label key={key} className={cn("block", key === "note" && "sm:col-span-2")}>
                    <span className="text-xs font-medium text-muted">{label}{required ? <span className="text-[#e76412]"> *</span> : null}</span>
                    <Input
                      value={values.bankDetails[key]}
                      onChange={(event) => onChange({ ...values, bankDetails: { ...values.bankDetails, [key]: event.target.value } })}
                      className="mt-1 h-9 bg-white"
                      required={required}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {level === "LEDGER" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted">Opening Balance</label>
                <Input
                  money
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.openingBalance}
                  onChange={(event) => onChange({ ...values, openingBalance: event.target.value })}
                  className="mt-1 h-10 text-right"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted">Opening Balance Date</label>
                <AppDateInput
                  className="mt-1"
                  aria-label="Opening Balance Date"
                  value={values.openingBalanceDate}
                  onChange={(openingBalanceDate) => onChange({ ...values, openingBalanceDate })}
                />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted">Cash / Bank Allocation{Number(values.openingBalance || 0) > 0 ? <span className="text-[#e76412]"> *</span> : null}</label>
                  <span className="text-xs text-muted">Allocated: {formatAmount(sumMoney(openingBalanceSources.map((source) => Number(source.amount || 0))))}</span>
                </div>
                <div className="mt-1 space-y-2">
                  {openingBalanceSources.map((source, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_130px_32px] gap-2">
                      <select
                        value={source.accountId}
                        onChange={(event) => onChange({ ...values, openingBalanceSources: openingBalanceSources.map((row, rowIndex) => rowIndex === index ? { ...row, accountId: event.target.value } : row) })}
                        className="h-10 min-w-0 rounded-xl border border-border bg-white px-3 text-sm text-foreground"
                      >
                        <option value="">Select Cash / Bank</option>
                        {openingBalanceSourceOptions.filter((option) => option.id === source.accountId || !openingBalanceSources.some((row, rowIndex) => rowIndex !== index && row.accountId === option.id)).map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                      <Input
                        money
                        type="number"
                        min="0"
                        step="0.01"
                        value={source.amount}
                        onChange={(event) => onChange({ ...values, openingBalanceSources: openingBalanceSources.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value } : row) })}
                        className="h-10 text-right"
                        placeholder="Amount"
                      />
                      <button
                        type="button"
                        aria-label="Remove allocation"
                        disabled={openingBalanceSources.length === 1}
                        onClick={() => onChange({ ...values, openingBalanceSources: openingBalanceSources.filter((_, rowIndex) => rowIndex !== index) })}
                        className="flex h-10 items-center justify-center rounded-xl border border-border text-muted disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onChange({ ...values, openingBalanceSources: [...openingBalanceSources, { accountId: "", amount: "" }] })}>
                  <Plus className="mr-1 h-4 w-4" /> Add Cash / Bank
                </Button>
                <p className="mt-1 text-xs text-muted">Cash/Bank amounts together must equal the Opening Balance.</p>
              </div>
            </div>
          ) : null}
          {mode === "create" ? (
            <div>
              <label className="text-xs font-medium text-muted">Account Nature</label>
              {parentId ? (
                <>
                  <div className="mt-1 flex h-9 items-center rounded-xl border border-border bg-[#f5f7fb] px-3 text-sm text-foreground">
                    {parentName ?? "—"}
                  </div>
                  <p className="mt-1 text-xs text-muted">Inherited from the parent account — cannot be changed.</p>
                </>
              ) : (
                <select
                  value={values.nature}
                  onChange={(event) => onChange({ ...values, nature: event.target.value as AccountNature })}
                  className="mt-1 h-9 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground"
                >
                  {NATURE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : null}
          {level === "LEDGER" && !isBankLedger ? (
            <label className="flex items-center gap-2 text-sm text-[#28365b]">
              <input
                type="checkbox"
                checked={values.isControlAccount}
                onChange={(event) => onChange({ ...values, isControlAccount: event.target.checked })}
              />
              This is a control account (e.g. Accounts Receivable, Inventory Control)
            </label>
          ) : null}
          {level === "LEDGER" && !isBankLedger ? (
            <div className="rounded-xl border border-[#dce5f1] bg-[#f8fafc] p-3">
              <label className="flex items-center gap-2 text-sm text-[#28365b]">
                <input
                  type="checkbox"
                  checked={values.requiresItemDetails}
                  onChange={(event) => onChange({ ...values, requiresItemDetails: event.target.checked })}
                />
                Require item details on Expense entries (e.g. Office Stationery, Inventory Purchases)
              </label>
              {mode === "edit" && values.requiresItemDetails && onManageItems ? (
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#e5ebf3] pt-2">
                  <p className="text-xs text-muted">Add, edit or remove the items selectable for this ledger.</p>
                  <Button type="button" size="sm" variant="outline" onClick={onManageItems}>
                    <ListChecks className="h-4 w-4" />
                    Manage Items
                  </Button>
                </div>
              ) : null}
              {mode === "edit" && values.requiresItemDetails && !onManageItems ? (
                <p className="mt-2 border-t border-[#e5ebf3] pt-2 text-xs text-muted">Save this setting first; item management will then become available.</p>
              ) : null}
            </div>
          ) : null}
          {error ? <div className="rounded-lg bg-[#fff1f0] px-3 py-2 text-sm text-[#b42318]">{error}</div> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" onClick={onSubmit} disabled={submitting}>
            <CheckCircle2 className="h-5 w-5" />
            {mode === "create" ? "Create" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The predefined item list scoped to one Ledger (e.g. "Office Stationery" ->
 * "A4 Paper", "Pen", "Stapler") — separate from the company-wide Products &
 * Services inventory master. Opens automatically right after a Ledger is
 * created with "Require item details" checked, and is reachable afterwards
 * via the "Manage Items" button on the ledger's detail panel.
 */
function ManageLedgerItemsDialog({ account, onClose }: { account: { id: string; name: string } | null; onClose: () => void }) {
  const itemsQuery = useLedgerItemsQuery(account?.id ?? null, Boolean(account));
  const createMutation = useCreateLedgerItemMutation(account?.id ?? null);
  const updateMutation = useUpdateLedgerItemMutation(account?.id ?? null);
  const deleteMutation = useDeleteLedgerItemMutation(account?.id ?? null);

  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("pcs");
  const [unitSuggestionsOpen, setUnitSuggestionsOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const unitInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (account) {
      setNewName("");
      setNewUnit("pcs");
      setConfirmClose(false);
      setUnitSuggestionsOpen(false);
      setError(null);
      // Dialog just opened (or switched to a different ledger) — ready to
      // type the first item straight away, no click needed.
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [account]);

  const unitOptions = useMemo(() => {
    const used = (itemsQuery.data ?? []).map((item) => item.unit);
    return Array.from(new Set([...COMMON_UNITS, ...used]));
  }, [itemsQuery.data]);

  const filteredUnitOptions = useMemo(() => {
    const query = newUnit.trim().toLowerCase();
    const options = query ? unitOptions.filter((option) => option.toLowerCase().includes(query)) : unitOptions;
    return options.slice(0, 8);
  }, [newUnit, unitOptions]);

  // Tally-style rapid entry: Enter on Name -> Unit; Enter on Unit -> adds the
  // item and jumps back to Name for the next one; Enter on an EMPTY Name asks
  // to confirm finishing (Enter again = Done, Esc/Backspace = keep adding).
  async function commitItem() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      await createMutation.mutateAsync({ name, unit: newUnit.trim() || "pcs" });
      setNewName("");
      setNewUnit("pcs");
      setUnitSuggestionsOpen(false);
      nameInputRef.current?.focus();
    } catch (err) {
      setError(errorMessage(err, "Could not add this item."));
      unitInputRef.current?.focus();
    }
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (confirmClose) {
      if (event.key === "Enter") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        setConfirmClose(false);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (!newName.trim()) {
        setConfirmClose(true);
        return;
      }
      setUnitSuggestionsOpen(true);
      unitInputRef.current?.focus();
      unitInputRef.current?.select();
    }
  }

  function handleUnitKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitItem();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setUnitSuggestionsOpen(false);
    } else if (event.key === "Backspace" && !newUnit) {
      nameInputRef.current?.focus();
    }
  }

  async function handleUpdateItem(itemId: string, input: { name?: string; unit?: string }) {
    setError(null);
    try {
      await updateMutation.mutateAsync({ itemId, input });
    } catch (err) {
      setError(errorMessage(err, "Could not update this item."));
    }
  }

  async function handleDelete(itemId: string) {
    setError(null);
    try {
      await deleteMutation.mutateAsync(itemId);
    } catch (err) {
      setError(errorMessage(err, "Could not remove this item."));
    }
  }

  return (
    <Dialog open={Boolean(account)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(92vw,480px)]">
        <DialogTitle className="text-lg font-semibold">Manage Items</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted">
          {account ? `Only these items will be selectable when recording an expense against "${account.name}".` : ""}
        </DialogDescription>

        <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto">
          {itemsQuery.isLoading ? (
            <div className="py-6 text-center text-sm text-muted">Loading items...</div>
          ) : !itemsQuery.data?.length ? (
            <div className="py-6 text-center text-sm text-muted">No items yet — add one below.</div>
          ) : (
            itemsQuery.data.map((item) => (
              <LedgerItemRow
                key={item.id}
                item={item}
                onUpdate={(input) => handleUpdateItem(item.id, input)}
                onDelete={() => handleDelete(item.id)}
                deleting={deleteMutation.isPending}
              />
            ))
          )}
        </div>

        {/* The Name input stays mounted (and focused) even while the confirm
            banner shows, so the very next Enter/Esc/Backspace keypress is still
            captured by handleNameKeyDown without needing to refocus anything. */}
        <div className={cn("mt-3 flex items-end gap-2 border-t border-[#eef2f7] pt-3", confirmClose ? "pointer-events-none opacity-40" : "")}>
          <div className="flex-1">
            <label className="text-xs font-medium text-muted">Item Name</label>
            <Input
              ref={nameInputRef}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={handleNameKeyDown}
              className="mt-1 h-9"
              placeholder="e.g. A4 Paper"
            />
          </div>
          <div className="relative w-28">
            <label className="text-xs font-medium text-muted">Unit</label>
            <Input
              ref={unitInputRef}
              value={newUnit}
              onChange={(event) => {
                setNewUnit(event.target.value);
                setUnitSuggestionsOpen(true);
              }}
              onFocus={() => setUnitSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setUnitSuggestionsOpen(false), 150)}
              onKeyDown={handleUnitKeyDown}
              className="mt-1 h-9"
              placeholder="pcs"
            />
            {unitSuggestionsOpen && filteredUnitOptions.length ? (
              <div className="absolute left-0 top-full z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-md">
                {filteredUnitOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setNewUnit(option);
                      setUnitSuggestionsOpen(false);
                      unitInputRef.current?.focus();
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-[#f5f7fb]"
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Button type="button" size="sm" onClick={() => void commitItem()} disabled={confirmClose || !newName.trim() || createMutation.isPending}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {confirmClose ? (
          <div className="mt-3 rounded-lg border border-[#f7dcae] bg-[#fff9ec] px-3 py-2.5 text-sm text-[#8a5a00]">
            All done? Press <kbd className="rounded border border-[#f0d6a0] bg-white px-1 py-0.5 font-mono text-xs">Enter</kbd> to save and close, or{" "}
            <kbd className="rounded border border-[#f0d6a0] bg-white px-1 py-0.5 font-mono text-xs">Esc</kbd> /{" "}
            <kbd className="rounded border border-[#f0d6a0] bg-white px-1 py-0.5 font-mono text-xs">Backspace</kbd> to keep adding items.
          </div>
        ) : null}

        {error ? <div className="mt-2 rounded-lg bg-[#fff1f0] px-3 py-2 text-sm text-[#b42318]">{error}</div> : null}

        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LedgerItemRow({
  item,
  onUpdate,
  onDelete,
  deleting,
}: {
  item: LedgerItem;
  onUpdate: (input: { name?: string; unit?: string }) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);

  useEffect(() => setName(item.name), [item.name]);
  useEffect(() => setUnit(item.unit), [item.unit]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#eef2f7] px-2 py-1.5">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed && trimmed !== item.name) onUpdate({ name: trimmed });
          else setName(item.name);
        }}
        className="h-8 flex-1"
      />
      <Input
        value={unit}
        onChange={(event) => setUnit(event.target.value)}
        onBlur={() => {
          const trimmed = unit.trim();
          if (trimmed && trimmed !== item.unit) onUpdate({ unit: trimmed });
          else setUnit(item.unit);
        }}
        className="h-8 w-20"
      />
      <button type="button" onClick={onDelete} disabled={deleting} className="shrink-0 text-[#b42318] hover:text-[#93190f] disabled:opacity-50">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
