"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpDown,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Eye,
  Filter,
  FileText,
  History,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Rows4,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { BankIllustration } from "@/components/shared/bank-illustration";
import { TablePagination } from "@/components/shared/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildWorkspaceRoute } from "@/config/routes";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { moneyToMinorUnits, roundMoney, sumMoney } from "@/lib/money";
import { openPrintWindow, printWindowWhenReady } from "@/lib/print";
import { cn } from "@/lib/utils";

type LoanTransactionType = "Opening Loan" | "Loan Payment" | "Loan Top Up" | "Charge on Loan";
type LoanActionMode = "payment" | "top-up" | "charge";
type FilterableTransactionColumnId = "type" | "date" | "principal" | "charges" | "total";
type ColumnFilterOperator = "contains" | "equals" | "starts-with";

type LoanTransactionRecord = {
  id: string;
  type: LoanTransactionType;
  date: string;
  principal: number;
  interestAndCharges: number;
  totalAmount: number;
  note: string;
  createdAt: string;
};

type LoanAccountRecord = {
  id: string;
  accountName: string;
  lenderBank: string;
  accountNumber: string;
  description: string;
  currentBalance: number;
  balanceAsOf: string;
  loanReceivedIn: string;
  interestRate: number;
  termMonths: number;
  processingFee: number;
  processingFeePaidFrom: string;
  status: "Running" | "Closed";
  createdAt: string;
  transactions: LoanTransactionRecord[];
};

type LoanAccountDraft = {
  accountName: string;
  lenderBank: string;
  accountNumber: string;
  description: string;
  currentBalance: string;
  balanceAsOf: string;
  loanReceivedIn: string;
  interestRate: string;
  termMonths: string;
  processingFee: string;
  processingFeePaidFrom: string;
};

type LoanTransactionDraft = {
  principal: string;
  interestAndCharges: string;
  date: string;
  note: string;
};

type ColumnFilterValue = {
  operator: ColumnFilterOperator;
  value: string;
};

type ColumnFilterPopoverState = {
  columnId: FilterableTransactionColumnId;
  left: number;
  top: number;
};

const currencySymbol = "\u09F3";

const featureCards = [
  {
    title: "All Loans, One Dashboard",
    description: "Easily track business loans kept separate from the daily transactions.",
    icon: Rows4,
  },
  {
    title: "Auto EMI Calculation with Every Entry",
    description: "Add loan details and the system instantly breaks it down into EMIs.",
    icon: Calculator,
  },
  {
    title: "Manual Flexibility",
    description: "Add notes, interest details etc. Keeps it flexible for varied use cases.",
    icon: FileText,
  },
] as const;

const defaultColumnFilter: ColumnFilterValue = {
  operator: "contains",
  value: "",
};

function buildDefaultAccountDraft(): LoanAccountDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    accountName: "",
    lenderBank: "",
    accountNumber: "",
    description: "",
    currentBalance: "",
    balanceAsOf: today,
    loanReceivedIn: "Cash",
    interestRate: "",
    termMonths: "",
    processingFee: "",
    processingFeePaidFrom: "Cash",
  };
}

function buildDefaultTransactionDraft(mode: LoanActionMode): LoanTransactionDraft {
  return {
    principal: mode === "charge" ? "0" : "",
    interestAndCharges: "",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  };
}

function normalizeAmount(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim() || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMoneyAmount(value: string) {
  return roundMoney(normalizeAmount(value));
}

function normalizePositiveInteger(value: string) {
  const parsed = Number(value.trim() || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function estimateMonthlyInstallment(principal: number, rate: number, termMonths: number) {
  if (moneyToMinorUnits(principal) <= 0 || termMonths <= 0) {
    return 0;
  }

  const monthlyRate = rate / 100 / 12;
  if (monthlyRate <= 0) {
    return roundMoney(principal / termMonths);
  }

  const factor = Math.pow(1 + monthlyRate, termMonths);
  return roundMoney((principal * monthlyRate * factor) / (factor - 1));
}

function formatLoanTableAmount(value: number) {
  return `${new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value))} ${currencySymbol}`;
}

function getActionModeFromTransaction(type: LoanTransactionType): LoanActionMode | null {
  if (type === "Loan Payment") {
    return "payment";
  }

  if (type === "Loan Top Up") {
    return "top-up";
  }

  if (type === "Charge on Loan") {
    return "charge";
  }

  return null;
}

function getTransactionTypeFromAction(mode: LoanActionMode): LoanTransactionType {
  if (mode === "payment") {
    return "Loan Payment";
  }

  if (mode === "top-up") {
    return "Loan Top Up";
  }

  return "Charge on Loan";
}

function getActionLabels(mode: LoanActionMode) {
  if (mode === "payment") {
    return {
      title: "Make Payment",
      principalLabel: "Principal Amount",
      chargesLabel: "Interest & Other Charges",
      submitLabel: "Save Payment",
    };
  }

  if (mode === "top-up") {
    return {
      title: "Take More Loan",
      principalLabel: "Top Up Amount",
      chargesLabel: "Processing / Other Charges",
      submitLabel: "Save Top Up",
    };
  }

  return {
    title: "Charges on Loan",
    principalLabel: "Principal Amount",
    chargesLabel: "Charge Amount",
    submitLabel: "Save Charge",
  };
}

function buildOpeningTransaction(account: {
  currentBalance: number;
  balanceAsOf: string;
  description: string;
  createdAt?: string;
}) {
  const currentBalance = roundMoney(account.currentBalance);
  return {
    id: crypto.randomUUID(),
    type: "Opening Loan" as const,
    date: account.balanceAsOf,
    principal: currentBalance,
    interestAndCharges: 0,
    totalAmount: currentBalance,
    note: account.description.trim(),
    createdAt: account.createdAt ?? new Date().toISOString(),
  };
}

function computeOutstandingBalance(transactions: LoanTransactionRecord[]) {
  return sumMoney(
    transactions.map((transaction) => {
      if (transaction.type === "Opening Loan" || transaction.type === "Loan Top Up") {
        return transaction.principal;
      }

      if (transaction.type === "Loan Payment") {
        return -transaction.principal;
      }

      return 0;
    }),
  );
}

function syncAccountBalance(account: LoanAccountRecord): LoanAccountRecord {
  return {
    ...account,
    currentBalance: roundMoney(Math.max(0, computeOutstandingBalance(account.transactions))),
  };
}

function normalizeLoanAccountRecord(raw: LoanAccountRecord) {
  const openingTransaction =
    Array.isArray(raw.transactions) && raw.transactions.length
      ? raw.transactions
      : [
          buildOpeningTransaction({
            currentBalance: raw.currentBalance,
            balanceAsOf: raw.balanceAsOf,
            description: raw.description,
            createdAt: raw.createdAt,
          }),
        ];

  return syncAccountBalance({
    ...raw,
    currentBalance: roundMoney(raw.currentBalance),
    processingFee: roundMoney(raw.processingFee),
    transactions: openingTransaction.map((transaction) => {
      const principal = roundMoney(transaction.principal);
      const interestAndCharges = roundMoney(transaction.interestAndCharges);
      return {
        ...transaction,
        principal,
        interestAndCharges,
        totalAmount: sumMoney([principal, interestAndCharges]),
        note: transaction.note ?? "",
      };
    }),
  });
}

function getTransactionColumnValue(transaction: LoanTransactionRecord, columnId: FilterableTransactionColumnId) {
  if (columnId === "type") {
    return transaction.type;
  }

  if (columnId === "date") {
    return `${transaction.date} ${formatDate(transaction.date)}`;
  }

  if (columnId === "principal") {
    return `${transaction.principal} ${formatLoanTableAmount(transaction.principal)}`;
  }

  if (columnId === "charges") {
    return `${transaction.interestAndCharges} ${formatLoanTableAmount(transaction.interestAndCharges)}`;
  }

  return `${transaction.totalAmount} ${formatLoanTableAmount(transaction.totalAmount)}`;
}

function matchesColumnFilter(value: string, filter: ColumnFilterValue) {
  const haystack = value.trim().toLowerCase();
  const needle = filter.value.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  if (filter.operator === "equals") {
    return haystack === needle;
  }

  if (filter.operator === "starts-with") {
    return haystack.startsWith(needle);
  }

  return haystack.includes(needle);
}

function transactionFilterLabel(columnId: FilterableTransactionColumnId) {
  if (columnId === "type") {
    return "Type";
  }

  if (columnId === "date") {
    return "Date";
  }

  if (columnId === "principal") {
    return "Principal";
  }

  if (columnId === "charges") {
    return "Interest & Other Charges";
  }

  return "Total Amount";
}

export function LoanAccountsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, session } = useSessionContext();
  const createRequestRef = useRef("");
  const transactionSearchInputRef = useRef<HTMLInputElement | null>(null);
  const storageKey = `bizovix:loan-accounts:${mode}:${session?.workspaceId ?? "default"}`;
  const [accounts, setAccounts] = useState<LoanAccountRecord[]>([]);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<LoanAccountRecord | null>(null);
  const [deleteTransactionTarget, setDeleteTransactionTarget] = useState<LoanTransactionRecord | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountQuery, setAccountQuery] = useState("");
  const [transactionQuery, setTransactionQuery] = useState("");
  const [transactionSearchOpen, setTransactionSearchOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState<LoanAccountDraft>(() => buildDefaultAccountDraft());
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionMode, setActionMode] = useState<LoanActionMode>("payment");
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [transactionDraft, setTransactionDraft] = useState<LoanTransactionDraft>(() => buildDefaultTransactionDraft("payment"));
  const [historyTransactionId, setHistoryTransactionId] = useState<string | null>(null);
  const [dateSortDirection, setDateSortDirection] = useState<"desc" | "asc">("desc");
  const [columnFilters, setColumnFilters] = useState<Partial<Record<FilterableTransactionColumnId, ColumnFilterValue>>>({});
  const [columnFilterPopover, setColumnFilterPopover] = useState<ColumnFilterPopoverState | null>(null);
  const [columnFilterDraft, setColumnFilterDraft] = useState<ColumnFilterValue>(defaultColumnFilter);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionPageSize, setTransactionPageSize] = useState(10);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setAccounts([]);
      setHydratedKey(storageKey);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as LoanAccountRecord[];
      setAccounts(Array.isArray(parsed) ? parsed.map(normalizeLoanAccountRecord) : []);
    } catch {
      window.localStorage.removeItem(storageKey);
      setAccounts([]);
    }

    setHydratedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    // Never write before the stored accounts have been read back for this key,
    // otherwise the initial empty state overwrites whatever the user already saved.
    if (typeof window === "undefined" || hydratedKey !== storageKey) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(accounts));
  }, [accounts, hydratedKey, storageKey]);

  useEffect(() => {
    const createValue = searchParams.get("create");
    if (createValue !== "1" && createValue !== "true") {
      return;
    }

    const requestKey = `loan-accounts:${searchParams.get("open") ?? "initial"}`;
    if (createRequestRef.current === requestKey) {
      return;
    }

    openEditor();
    createRequestRef.current = requestKey;
  }, [searchParams]);

  useEffect(() => {
    if (!accounts.length) {
      setSelectedAccountId(null);
      return;
    }

    const hasSelected = accounts.some((account) => account.id === selectedAccountId);
    if (!hasSelected) {
      setSelectedAccountId(accounts[0]?.id ?? null);
    }
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest("[data-loan-page-menu]") ||
        target?.closest("[data-loan-row-menu]") ||
        target?.closest("[data-loan-action-menu]") ||
        target?.closest("[data-loan-column-filter]")
      ) {
        return;
      }

      setPageMenuOpen(false);
      setRowMenuId(null);
      setActionDropdownOpen(false);
      setColumnFilterPopover(null);
    }

    function closePopover() {
      setColumnFilterPopover(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", closePopover, true);
    window.addEventListener("resize", closePopover);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", closePopover, true);
      window.removeEventListener("resize", closePopover);
    };
  }, []);

  useEffect(() => {
    if (!transactionSearchOpen) {
      return;
    }

    transactionSearchInputRef.current?.focus();
  }, [transactionSearchOpen]);

  const visibleAccounts = useMemo(() => {
    const needle = accountQuery.trim().toLowerCase();
    if (!needle) {
      return accounts;
    }

    return accounts.filter((account) => {
      const amountText = formatLoanTableAmount(account.currentBalance).toLowerCase();
      return [account.accountName, account.lenderBank, account.accountNumber, amountText].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [accountQuery, accounts]);

  useEffect(() => {
    if (!visibleAccounts.length) {
      return;
    }

    const hasVisibleSelection = visibleAccounts.some((account) => account.id === selectedAccountId);
    if (!hasVisibleSelection) {
      setSelectedAccountId(visibleAccounts[0]?.id ?? null);
    }
  }, [selectedAccountId, visibleAccounts]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? visibleAccounts[0] ?? null,
    [accounts, selectedAccountId, visibleAccounts],
  );

  const selectedTransactions = useMemo(() => {
    if (!selectedAccount) {
      return [];
    }

    const needle = transactionQuery.trim().toLowerCase();
    return [...selectedAccount.transactions]
      .filter((transaction) => {
        if (needle) {
          const matchesSearch = [
            transaction.type,
            transaction.note,
            formatDate(transaction.date),
            formatLoanTableAmount(transaction.principal),
            formatLoanTableAmount(transaction.totalAmount),
          ].some((value) => value.toLowerCase().includes(needle));

          if (!matchesSearch) {
            return false;
          }
        }

        return Object.entries(columnFilters).every(([columnId, filter]) => {
          if (!filter) {
            return true;
          }

          return matchesColumnFilter(getTransactionColumnValue(transaction, columnId as FilterableTransactionColumnId), filter);
        });
      })
      .sort((left, right) => {
        const createdDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        const dateDiff = new Date(left.date).getTime() - new Date(right.date).getTime();
        const diff = createdDiff === 0 ? dateDiff : createdDiff;
        return dateSortDirection === "asc" ? diff : -diff;
      });
  }, [columnFilters, dateSortDirection, selectedAccount, transactionQuery]);

  const paginatedSelectedTransactions = useMemo(
    () => selectedTransactions.slice((transactionPage - 1) * transactionPageSize, transactionPage * transactionPageSize),
    [selectedTransactions, transactionPage, transactionPageSize],
  );

  useEffect(() => {
    setTransactionPage(1);
  }, [selectedAccountId, transactionQuery, columnFilters, dateSortDirection, transactionPageSize]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(selectedTransactions.length / transactionPageSize));
    if (transactionPage > lastPage) {
      setTransactionPage(lastPage);
    }
  }, [selectedTransactions.length, transactionPage, transactionPageSize]);

  const totalOutstanding = useMemo(
    () => sumMoney(accounts.map((account) => account.currentBalance)),
    [accounts],
  );
  const runningCount = useMemo(
    () => accounts.filter((account) => account.status === "Running").length,
    [accounts],
  );
  const totalInstallmentProjection = useMemo(
    () =>
      sumMoney(
        accounts.map((account) =>
          estimateMonthlyInstallment(account.currentBalance, account.interestRate, account.termMonths),
        ),
      ),
    [accounts],
  );

  const loanPreview = useMemo(() => {
    const principal = normalizeMoneyAmount(accountDraft.currentBalance);
    const rate = normalizeAmount(accountDraft.interestRate);
    const term = normalizePositiveInteger(accountDraft.termMonths);
    return estimateMonthlyInstallment(principal, rate, term);
  }, [accountDraft.currentBalance, accountDraft.interestRate, accountDraft.termMonths]);

  const actionEditingTransaction = useMemo(() => {
    if (!selectedAccount || !editingTransactionId) {
      return null;
    }

    return selectedAccount.transactions.find((transaction) => transaction.id === editingTransactionId) ?? null;
  }, [editingTransactionId, selectedAccount]);

  const historyTransaction = useMemo(() => {
    if (!selectedAccount || !historyTransactionId) {
      return null;
    }

    return selectedAccount.transactions.find((transaction) => transaction.id === historyTransactionId) ?? null;
  }, [historyTransactionId, selectedAccount]);

  const actionPreviewBalance = useMemo(() => {
    if (!selectedAccount) {
      return 0;
    }

    const baseBalance = actionEditingTransaction
      ? syncAccountBalance({
          ...selectedAccount,
          transactions: selectedAccount.transactions.filter((transaction) => transaction.id !== actionEditingTransaction.id),
        }).currentBalance
      : selectedAccount.currentBalance;

    const principal = normalizeMoneyAmount(transactionDraft.principal);
    if (actionMode === "payment") {
      return sumMoney([baseBalance, -principal]);
    }

    if (actionMode === "top-up") {
      return sumMoney([baseBalance, principal]);
    }

    return baseBalance;
  }, [actionEditingTransaction, actionMode, selectedAccount, transactionDraft.principal]);

  function clearCreateQuery() {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (!nextParams.has("create") && !nextParams.has("open")) {
      return;
    }

    nextParams.delete("create");
    nextParams.delete("open");
    const nextQuery = nextParams.toString();
    const target = buildWorkspaceRoute(mode, "/utilities/loan-accounts");
    router.replace(nextQuery ? `${target}?${nextQuery}` : target, { scroll: false });
  }

  function updateAccountDraft<Key extends keyof LoanAccountDraft>(field: Key, value: LoanAccountDraft[Key]) {
    setAccountDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateTransactionDraft<Key extends keyof LoanTransactionDraft>(field: Key, value: LoanTransactionDraft[Key]) {
    setTransactionDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openEditor(account?: LoanAccountRecord) {
    setEditingId(account?.id ?? null);
    setAccountDraft(
      account
        ? {
            accountName: account.accountName,
            lenderBank: account.lenderBank,
            accountNumber: account.accountNumber,
            description: account.description,
            currentBalance: String(roundMoney(account.currentBalance) || ""),
            balanceAsOf: account.balanceAsOf,
            loanReceivedIn: account.loanReceivedIn,
            interestRate: String(account.interestRate || ""),
            termMonths: String(account.termMonths || ""),
            processingFee: String(roundMoney(account.processingFee) || ""),
            processingFeePaidFrom: account.processingFeePaidFrom,
          }
        : buildDefaultAccountDraft(),
    );
    setEditorOpen(true);
    setPageMenuOpen(false);
  }

  function closeEditor(nextOpen = false) {
    setEditorOpen(nextOpen);
    if (!nextOpen) {
      setEditingId(null);
      setAccountDraft(buildDefaultAccountDraft());
      clearCreateQuery();
    }
  }

  function handleSaveAccount() {
    if (!accountDraft.accountName.trim()) {
      toast.error("Account name is required");
      return;
    }

    const currentBalance = normalizeMoneyAmount(accountDraft.currentBalance);
    if (moneyToMinorUnits(currentBalance) <= 0) {
      toast.error("Current balance is required");
      return;
    }

    const existingAccount = editingId ? accounts.find((item) => item.id === editingId) ?? null : null;
    const openingTransaction = existingAccount?.transactions.find((transaction) => transaction.type === "Opening Loan") ?? null;
    const createdAt = existingAccount?.createdAt ?? new Date().toISOString();
    const transactions = existingAccount?.transactions?.length
      ? existingAccount.transactions.map((transaction) => {
          if (!openingTransaction || transaction.id !== openingTransaction.id) {
            return transaction;
          }

          return {
            ...transaction,
            date: accountDraft.balanceAsOf,
            principal: currentBalance,
            totalAmount: currentBalance,
            note: accountDraft.description.trim(),
          };
        })
      : [
          buildOpeningTransaction({
            currentBalance,
            balanceAsOf: accountDraft.balanceAsOf,
            description: accountDraft.description,
            createdAt,
          }),
        ];

    const payload = syncAccountBalance({
      id: editingId ?? crypto.randomUUID(),
      accountName: accountDraft.accountName.trim(),
      lenderBank: accountDraft.lenderBank.trim(),
      accountNumber: accountDraft.accountNumber.trim(),
      description: accountDraft.description.trim(),
      currentBalance,
      balanceAsOf: accountDraft.balanceAsOf,
      loanReceivedIn: accountDraft.loanReceivedIn,
      interestRate: normalizeAmount(accountDraft.interestRate),
      termMonths: normalizePositiveInteger(accountDraft.termMonths),
      processingFee: normalizeMoneyAmount(accountDraft.processingFee),
      processingFeePaidFrom: accountDraft.processingFeePaidFrom,
      status: existingAccount?.status ?? "Running",
      createdAt,
      transactions,
    });

    setAccounts((current) => {
      if (editingId) {
        return current.map((account) => (account.id === editingId ? payload : account));
      }

      return [payload, ...current];
    });
    setSelectedAccountId(payload.id);
    toast.success(editingId ? "Loan account updated" : "Loan account saved");
    closeEditor(false);
  }

  function requestDeleteAccount(accountId: string) {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) {
      return;
    }

    setPageMenuOpen(false);
    setDeleteAccountTarget(account);
  }

  function confirmDeleteAccount() {
    if (!deleteAccountTarget) {
      return;
    }

    setAccounts((current) => current.filter((item) => item.id !== deleteAccountTarget.id));
    setDeleteAccountTarget(null);
    toast.success("Loan account deleted");
  }

  function markAccountClosed(accountId: string) {
    setAccounts((current) => current.map((item) => (item.id === accountId ? { ...item, status: "Closed" } : item)));
    setPageMenuOpen(false);
    toast.success("Loan account marked as closed");
  }

  function printSelectedAccount() {
    if (!selectedAccount) {
      return;
    }

    const printWindow = openPrintWindow("width=860,height=760");
    if (!printWindow) {
      toast.error("Allow popups to print loan details");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Loan Account Print</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 28px; color: #1f3253; }
            h1 { margin: 0 0 8px; font-size: 28px; }
            p { margin: 0 0 18px; color: #61708a; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #d7dfeb; padding: 10px; text-align: left; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>${selectedAccount.accountName}</h1>
          <p>${selectedAccount.lenderBank || "No lender bank added"} | ${selectedAccount.accountNumber || "No account number added"}</p>
          <p>Outstanding Balance: ${formatLoanTableAmount(selectedAccount.currentBalance)}</p>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Date</th>
                <th>Principal</th>
                <th>Interest & Other Charges</th>
                <th>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${selectedAccount.transactions
                .map(
                  (transaction) => `
                    <tr>
                      <td>${transaction.type}</td>
                      <td>${formatDate(transaction.date)}</td>
                      <td>${formatLoanTableAmount(transaction.principal)}</td>
                      <td>${formatLoanTableAmount(transaction.interestAndCharges)}</td>
                      <td>${formatLoanTableAmount(transaction.totalAmount)}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindowWhenReady(printWindow);
    setPageMenuOpen(false);
  }

  function openActionDialog(nextMode: LoanActionMode, transaction?: LoanTransactionRecord) {
    setActionMode(nextMode);
    setEditingTransactionId(transaction?.id ?? null);
    setTransactionDraft(
      transaction
        ? {
            principal: String(roundMoney(transaction.principal) || ""),
            interestAndCharges: String(roundMoney(transaction.interestAndCharges) || ""),
            date: transaction.date,
            note: transaction.note,
          }
        : buildDefaultTransactionDraft(nextMode),
    );
    setActionDialogOpen(true);
    setActionDropdownOpen(false);
    setRowMenuId(null);
  }

  function closeActionDialog(nextOpen = false) {
    setActionDialogOpen(nextOpen);
    if (!nextOpen) {
      setEditingTransactionId(null);
      setTransactionDraft(buildDefaultTransactionDraft(actionMode));
    }
  }

  function handleSaveTransaction() {
    if (!selectedAccount) {
      toast.error("Select a loan account first");
      return;
    }

    const principal = normalizeMoneyAmount(transactionDraft.principal);
    const charges = normalizeMoneyAmount(transactionDraft.interestAndCharges);
    const totalAmount = sumMoney([principal, charges]);
    const principalMinorUnits = moneyToMinorUnits(principal);
    const chargesMinorUnits = moneyToMinorUnits(charges);

    if (actionMode === "payment") {
      if (principalMinorUnits <= 0 && chargesMinorUnits <= 0) {
        toast.error("Enter a payment amount");
        return;
      }

      if (moneyToMinorUnits(actionPreviewBalance) < 0) {
        toast.error("Payment principal cannot exceed outstanding balance");
        return;
      }
    }

    if (actionMode === "top-up" && principalMinorUnits <= 0) {
      toast.error("Enter a top up amount");
      return;
    }

    if (actionMode === "charge" && chargesMinorUnits <= 0) {
      toast.error("Enter a charge amount");
      return;
    }

    if (actionMode === "charge" && principalMinorUnits > 0) {
      toast.error("Charges on loan should not contain principal amount");
      return;
    }

    const nextTransaction: LoanTransactionRecord = {
      id: editingTransactionId ?? crypto.randomUUID(),
      type: getTransactionTypeFromAction(actionMode),
      date: transactionDraft.date,
      principal: actionMode === "charge" ? 0 : principal,
      interestAndCharges: charges,
      totalAmount,
      note: transactionDraft.note.trim(),
      createdAt: actionEditingTransaction?.createdAt ?? new Date().toISOString(),
    };

    setAccounts((current) =>
      current.map((account) => {
        if (account.id !== selectedAccount.id) {
          return account;
        }

        const nextTransactions = editingTransactionId
          ? account.transactions.map((transaction) => (transaction.id === editingTransactionId ? nextTransaction : transaction))
          : [nextTransaction, ...account.transactions];

        return syncAccountBalance({
          ...account,
          transactions: nextTransactions,
        });
      }),
    );

    toast.success(
      editingTransactionId
        ? "Loan transaction updated"
        : actionMode === "payment"
          ? "Loan payment saved"
          : actionMode === "top-up"
            ? "Additional loan saved"
            : "Loan charge saved",
    );
    closeActionDialog(false);
  }

  function requestDeleteTransaction(transactionId: string) {
    if (!selectedAccount) {
      return;
    }

    const transaction = selectedAccount.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      return;
    }

    setRowMenuId(null);

    if (transaction.type === "Opening Loan") {
      toast.error("Opening loan entry cannot be deleted. Edit the account instead.");
      return;
    }

    setDeleteTransactionTarget(transaction);
  }

  function confirmDeleteTransaction() {
    if (!selectedAccount || !deleteTransactionTarget) {
      return;
    }

    const transactionId = deleteTransactionTarget.id;
    setAccounts((current) =>
      current.map((account) => {
        if (account.id !== selectedAccount.id) {
          return account;
        }

        return syncAccountBalance({
          ...account,
          transactions: account.transactions.filter((item) => item.id !== transactionId),
        });
      }),
    );
    setDeleteTransactionTarget(null);
    toast.success("Loan transaction deleted");
  }

  function handleEditTransaction(transaction: LoanTransactionRecord) {
    if (transaction.type === "Opening Loan") {
      openEditor(selectedAccount ?? undefined);
      return;
    }

    const mode = getActionModeFromTransaction(transaction.type);
    if (!mode) {
      return;
    }

    openActionDialog(mode, transaction);
  }

  function handleViewHistory(transactionId: string) {
    setHistoryTransactionId(transactionId);
    setRowMenuId(null);
  }

  function handlePrintTransaction(transaction: LoanTransactionRecord) {
    const printWindow = openPrintWindow("width=720,height=680");
    if (!printWindow) {
      toast.error("Allow popups to print transaction details");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Loan Transaction Print</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #1f3253; }
            h1 { margin: 0 0 24px; font-size: 28px; }
            .grid { display: grid; grid-template-columns: 200px 1fr; gap: 12px 18px; }
            .label { color: #6d7b94; font-weight: 600; }
            .value { font-weight: 600; }
          </style>
        </head>
        <body>
          <h1>Loan Transaction</h1>
          <div class="grid">
            <div class="label">Type</div><div class="value">${transaction.type}</div>
            <div class="label">Date</div><div class="value">${formatDate(transaction.date)}</div>
            <div class="label">Principal</div><div class="value">${formatLoanTableAmount(transaction.principal)}</div>
            <div class="label">Interest & Other Charges</div><div class="value">${formatLoanTableAmount(transaction.interestAndCharges)}</div>
            <div class="label">Total Amount</div><div class="value">${formatLoanTableAmount(transaction.totalAmount)}</div>
            <div class="label">Description</div><div class="value">${transaction.note || "-"}</div>
            <div class="label">Created At</div><div class="value">${formatDateTime(transaction.createdAt)}</div>
          </div>
        </body>
      </html>
    `);
    printWindowWhenReady(printWindow);
    setRowMenuId(null);
  }

  function openColumnFilter(columnId: FilterableTransactionColumnId, event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    if (columnFilterPopover?.columnId === columnId) {
      setColumnFilterPopover(null);
      return;
    }

    const current = columnFilters[columnId] ?? defaultColumnFilter;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const popoverWidth = 260;
    const maxLeft = Math.max(16, viewportWidth - popoverWidth - 16);
    const centeredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const preferredLeft = rect.right + popoverWidth > viewportWidth - 16 ? rect.right - popoverWidth : centeredLeft;
    setColumnFilterDraft(current);
    setColumnFilterPopover({
      columnId,
      left: Math.min(Math.max(16, preferredLeft), maxLeft),
      top: rect.bottom + 8,
    });
  }

  function applyColumnFilter() {
    if (!columnFilterPopover) {
      return;
    }

    setColumnFilters((current) => {
      const next = { ...current };
      if (!columnFilterDraft.value.trim()) {
        delete next[columnFilterPopover.columnId];
      } else {
        next[columnFilterPopover.columnId] = { ...columnFilterDraft };
      }
      return next;
    });
    setColumnFilterPopover(null);
  }

  if (!accounts.length) {
    return (
      <>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d7dfeb] bg-white">
            <div className="flex items-center justify-between border-b border-[#d7dfeb] px-4 py-4">
              <div className="text-[18px] font-semibold text-[#1f3253]">Loan Accounts</div>
              <div className="relative" data-loan-page-menu>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e1e8f2] text-[#697791] transition hover:bg-[#f4f7fb]"
                  onClick={() => setPageMenuOpen((current) => !current)}
                  aria-label="Loan account actions"
                  aria-expanded={pageMenuOpen}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {pageMenuOpen ? (
                  <div className="absolute right-0 top-11 z-30 min-w-[210px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_16px_36px_rgba(15,23,42,0.14)]">
                    <MenuActionButton icon={Plus} label="Add Loan Account" onClick={() => openEditor()} />
                    <MenuActionButton
                      icon={Printer}
                      label="Print Account"
                      onClick={() => {
                        setPageMenuOpen(false);
                        toast.error("Add a loan account before printing");
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
              <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center text-center">
                <div className="max-w-[640px]">
                  <h2 className="text-[20px] font-semibold text-[#24365a]">Manage Your Loan Accounts</h2>
                  <p className="mt-2 text-[15px] leading-7 text-[#697791]">
                    Add your loan accounts and check all loan transactions at one place
                  </p>
                </div>

                <BankIllustration className="mt-6" />

                <div className="mt-8 grid w-full gap-6 lg:grid-cols-3">
                  {featureCards.map((item) => (
                    <Card
                      key={item.title}
                      className="rounded-[12px] border-[#d7dfeb] bg-white shadow-none hover:translate-y-0 hover:shadow-none"
                    >
                      <CardContent className="flex items-start gap-4 px-4 py-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e7f2ff] text-[#1674ff]">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <div className="text-left">
                          <div className="text-[15px] font-semibold text-[#24365a]">{item.title}</div>
                          <div className="mt-2 text-[14px] leading-6 text-[#697791]">{item.description}</div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <button
                  type="button"
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-[15px] font-semibold text-white shadow-[0_14px_30px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]"
                  onClick={() => openEditor()}
                >
                  <Plus className="h-4 w-4" />
                  Add Loan Account
                </button>
              </div>
            </div>
          </div>
        </div>

        <LoanEditorDialog
          open={editorOpen}
          editingId={editingId}
          draft={accountDraft}
          loanPreview={loanPreview}
          onOpenChange={closeEditor}
          onUpdateDraft={updateAccountDraft}
          onSubmit={handleSaveAccount}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-[#d7dfeb] bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-[#d7dfeb] px-4 py-2.5">
            <div className="text-[18px] font-semibold text-[#1f3253]">Loan Accounts</div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]"
                onClick={() => openEditor()}
              >
                <Plus className="h-4 w-4" />
                Add Loan Account
              </button>

              <div className="relative" data-loan-page-menu>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#697791] transition hover:bg-[#f4f7fb]"
                  onClick={() => setPageMenuOpen((current) => !current)}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {pageMenuOpen && selectedAccount ? (
                  <div className="absolute right-0 top-11 z-20 min-w-[210px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                    <MenuActionButton icon={Pencil} label="Edit Account" onClick={() => openEditor(selectedAccount)} />
                    <MenuActionButton icon={Printer} label="Print Account" onClick={printSelectedAccount} />
                    <MenuActionButton
                      icon={ShieldCheck}
                      label={selectedAccount.status === "Closed" ? "Loan Closed" : "Mark Closed"}
                      onClick={() => markAccountClosed(selectedAccount.id)}
                    />
                    <MenuActionButton icon={Trash2} label="Delete Account" danger onClick={() => requestDeleteAccount(selectedAccount.id)} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-b border-[#d7dfeb] px-4 py-3 lg:grid-cols-3">
            <LoanSummaryCard
              label="Total Outstanding"
              value={formatLoanTableAmount(totalOutstanding)}
              note={`Across ${accounts.length} loan account${accounts.length === 1 ? "" : "s"}`}
              icon={Rows4}
              tone="orange"
            />
            <LoanSummaryCard
              label="Running Loans"
              value={String(runningCount)}
              note={`${accounts.length - runningCount} closed`}
              icon={ShieldCheck}
              tone="blue"
            />
            <LoanSummaryCard
              label="Estimated Monthly EMI"
              value={totalInstallmentProjection ? formatCurrency(totalInstallmentProjection) : "Add rate & term"}
              note="Based on rate and remaining term"
              icon={Calculator}
              tone="emerald"
            />
          </div>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[clamp(220px,18vw,308px)_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col border-r border-[#d7dfeb] bg-white">
              <div className="border-b border-[#d7dfeb] px-3 py-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b96bc]" />
                  <Input
                    value={accountQuery}
                    onChange={(event) => setAccountQuery(event.target.value)}
                    placeholder="Search by Account/Amount"
                    className="h-10 rounded-full border-[#d8e0ee] bg-white pl-11 pr-4 text-[14px] text-[#24365a] placeholder:text-[#8f96ab]"
                  />
                </label>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="grid grid-cols-[1fr_94px] border-b border-[#d7dfeb] bg-[#fbfbfd] text-[13px] font-semibold text-[#61708a]">
                  <div className="flex items-center gap-1.5 border-r border-[#d7dfeb] px-3 py-3">
                    <span>Account Name</span>
                    <ArrowUpDown className="h-3 w-3 text-[#6b86c7]" />
                  </div>
                  <div className="px-3 py-3 text-left">Amount</div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {visibleAccounts.length ? (
                    visibleAccounts.map((account) => {
                      const isSelected = selectedAccount?.id === account.id;
                      return (
                        <button
                          key={account.id}
                          type="button"
                          className={cn(
                            "grid w-full grid-cols-[1fr_94px] border-b border-[#edf1f7] text-left transition last:border-b-0",
                            isSelected ? "bg-[#cfe7f6]" : "bg-white hover:bg-[#f8fbff]",
                          )}
                          onClick={() => setSelectedAccountId(account.id)}
                        >
                          <div className="border-r border-[#edf1f7] px-3 py-4 text-[14px] font-medium text-[#10284b]">
                            <div>{account.accountName}</div>
                          </div>
                          <div className="truncate px-3 py-4 text-right text-[14px] font-medium text-[#10284b]">
                            {formatLoanTableAmount(account.currentBalance)}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-4 py-12 text-center text-sm text-[#6f7f98]">No loan accounts matched your search.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-col">
              {selectedAccount ? (
                <>
                  <div className="border-b border-[#d7dfeb] px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-7 gap-y-2">
                        <div className="truncate text-[22px] font-semibold text-[#24365a]">{selectedAccount.accountName}</div>
                        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-sm">
                          <DetailInfo label="Lending Bank / Agency" value={selectedAccount.lenderBank || "-"} />
                          <DetailInfo label="Account Number" value={selectedAccount.accountNumber || "-"} />
                          <DetailInfo label="Balance Amount" value={formatLoanTableAmount(selectedAccount.currentBalance)} />
                        </div>
                      </div>

                      <div className="relative flex items-center gap-3" data-loan-action-menu>
                        <div className="inline-flex items-stretch overflow-hidden rounded-full border border-[#ff8448] bg-white shadow-[0_8px_20px_rgba(230,120,23,0.08)]">
                          <button
                            type="button"
                            className="inline-flex items-center px-5 py-2.5 text-sm font-semibold text-primary hover:bg-[#fff6ef]"
                            onClick={() => openActionDialog("payment")}
                          >
                            Make Payment
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center border-l border-[#ffd3bd] px-3 text-primary hover:bg-[#fff6ef]"
                            onClick={() => setActionDropdownOpen((current) => !current)}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>

                        {actionDropdownOpen ? (
                          <div className="absolute right-0 top-[52px] z-20 min-w-[170px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                            <MenuActionButton icon={Rows4} label="Take more loan" onClick={() => openActionDialog("top-up")} />
                            <MenuActionButton icon={FileText} label="Charges on Loan" onClick={() => openActionDialog("charge")} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d7dfeb] px-4 py-3">
                      <div className="flex items-center gap-2 text-[17px] font-semibold text-[#24365a]"><ReceiptText className="h-[18px] w-[18px] text-primary" aria-hidden="true" />Transactions</div>

                      <div className="flex items-center gap-2">
                        {transactionSearchOpen ? (
                          <Input
                            ref={transactionSearchInputRef}
                            value={transactionQuery}
                            onChange={(event) => setTransactionQuery(event.target.value)}
                            placeholder="Search Transactions"
                            className="h-10 w-[240px] rounded-full border-[#d8e0ee] px-4"
                          />
                        ) : null}
                        <button
                          type="button"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#6f7f98] hover:bg-[#f7f9fd]"
                          onClick={() => {
                            if (transactionSearchOpen && transactionQuery) {
                              setTransactionQuery("");
                            }
                            setTransactionSearchOpen((current) => !current);
                          }}
                        >
                          <Search className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-white text-[#5d6c86]">
                          <tr>
                            <TransactionTableHeader
                              label="Type"
                              filterActive={Boolean(columnFilters.type?.value.trim())}
                              onFilter={(event) => openColumnFilter("type", event)}
                            />
                            <TransactionTableHeader
                              label="Date"
                              sortDirection={dateSortDirection}
                              onSort={() => setDateSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                              filterActive={Boolean(columnFilters.date?.value.trim())}
                              onFilter={(event) => openColumnFilter("date", event)}
                            />
                            <TransactionTableHeader
                              label="Principal"
                              filterActive={Boolean(columnFilters.principal?.value.trim())}
                              onFilter={(event) => openColumnFilter("principal", event)}
                            />
                            <TransactionTableHeader
                              label="Interest & Other Charges"
                              filterActive={Boolean(columnFilters.charges?.value.trim())}
                              onFilter={(event) => openColumnFilter("charges", event)}
                            />
                            <TransactionTableHeader
                              label="Total Amount"
                              filterActive={Boolean(columnFilters.total?.value.trim())}
                              onFilter={(event) => openColumnFilter("total", event)}
                            />
                            <th className="w-[44px] border-b border-[#d7dfeb] px-3 py-3 text-right font-semibold" />
                          </tr>
                        </thead>

                        <tbody>
                          {selectedTransactions.length ? (
                            paginatedSelectedTransactions.map((transaction) => {
                              const isOpeningRow = transaction.type === "Opening Loan";
                              return (
                                <tr
                                  key={transaction.id}
                                  className="border-b border-[#edf1f7] bg-white transition last:border-b-0 hover:bg-[#f7fbff]"
                                >
                                  <td className="border-r border-[#edf1f7] px-3 py-5 text-[15px] font-medium text-[#10284b]">
                                    {transaction.type}
                                  </td>
                                  <td className="border-r border-[#edf1f7] px-3 py-5 text-[15px] font-medium text-[#10284b]">
                                    {formatDate(transaction.date)}
                                  </td>
                                  <td className="border-r border-[#edf1f7] px-3 py-5 text-[15px] font-medium text-[#10284b]">
                                    {moneyToMinorUnits(transaction.principal) !== 0
                                      ? formatLoanTableAmount(transaction.principal)
                                      : ""}
                                  </td>
                                  <td className="border-r border-[#edf1f7] px-3 py-5 text-[15px] font-medium text-[#10284b]">
                                    {moneyToMinorUnits(transaction.interestAndCharges) !== 0
                                      ? formatLoanTableAmount(transaction.interestAndCharges)
                                      : ""}
                                  </td>
                                  <td className="border-r border-[#edf1f7] px-3 py-5 text-[15px] font-medium text-[#10284b]">
                                    {formatLoanTableAmount(transaction.totalAmount)}
                                  </td>
                                  <td className="px-2 py-5 text-right">
                                    <div className="relative inline-flex" data-loan-row-menu>
                                      <button
                                        type="button"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6f7f98] hover:bg-white"
                                        onClick={() => setRowMenuId((current) => (current === transaction.id ? null : transaction.id))}
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </button>

                                      {rowMenuId === transaction.id ? (
                                        <div className="absolute right-0 top-10 z-20 min-w-[190px] overflow-hidden rounded-[14px] border border-[#d7dfeb] bg-white py-2 text-left shadow-[0_16px_36px_rgba(15,23,42,0.12)]">
                                          <MenuActionButton
                                            icon={Pencil}
                                            label="Edit"
                                            onClick={() => handleEditTransaction(transaction)}
                                          />
                                          <MenuActionButton
                                            icon={Trash2}
                                            label="Delete"
                                            danger={isOpeningRow}
                                            onClick={() => requestDeleteTransaction(transaction.id)}
                                          />
                                          <MenuActionButton
                                            icon={Printer}
                                            label="Print"
                                            onClick={() => handlePrintTransaction(transaction)}
                                          />
                                          <MenuActionButton
                                            icon={History}
                                            label="View History"
                                            onClick={() => handleViewHistory(transaction.id)}
                                          />
                                        </div>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={6} className="px-4 py-14 text-center text-sm text-[#6f7f98]">
                                No transactions matched your search.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <TablePagination
                      page={transactionPage}
                      pageSize={transactionPageSize}
                      totalItems={selectedTransactions.length}
                      pageSizeOptions={[10, 25, 50]}
                      onPageChange={setTransactionPage}
                      onPageSizeChange={setTransactionPageSize}
                      dense
                      iconOnlyNavigation
                    />
                  </div>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-[#6f7f98]">
                  Select a loan account to view its transaction flow.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <LoanEditorDialog
        open={editorOpen}
        editingId={editingId}
        draft={accountDraft}
        loanPreview={loanPreview}
        onOpenChange={closeEditor}
        onUpdateDraft={updateAccountDraft}
        onSubmit={handleSaveAccount}
      />

      <LoanTransactionDialog
        open={actionDialogOpen}
        mode={actionMode}
        draft={transactionDraft}
        previewBalance={actionPreviewBalance}
        editingTransactionId={editingTransactionId}
        onOpenChange={closeActionDialog}
        onUpdateDraft={updateTransactionDraft}
        onSubmit={handleSaveTransaction}
      />

      <Dialog open={Boolean(historyTransaction)} onOpenChange={(open) => (!open ? setHistoryTransactionId(null) : null)}>
        <DialogContent className="w-[min(92vw,520px)] rounded-[16px] border border-[#d7dfeb] p-0">
          <div className="border-b border-[#d7dfeb] px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-[20px] font-semibold text-[#24365a]">
              <Eye className="h-5 w-5 text-primary" />
              View History
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#6d7b94]">
              Transaction timeline and saved details for the selected loan activity.
            </DialogDescription>
          </div>

          {historyTransaction ? (
            <div className="space-y-4 px-5 py-5">
              <HistoryRow label="Type" value={historyTransaction.type} />
              <HistoryRow label="Date" value={formatDate(historyTransaction.date)} />
              <HistoryRow label="Principal" value={formatLoanTableAmount(historyTransaction.principal)} />
              <HistoryRow
                label="Interest & Other Charges"
                value={formatLoanTableAmount(historyTransaction.interestAndCharges)}
              />
              <HistoryRow label="Total Amount" value={formatLoanTableAmount(historyTransaction.totalAmount)} />
              <HistoryRow label="Description" value={historyTransaction.note || "-"} />
              <HistoryRow label="Created At" value={formatDateTime(historyTransaction.createdAt)} />
              <HistoryRow label="Record ID" value={historyTransaction.id} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteAccountTarget)} onOpenChange={(open) => (open ? null : setDeleteAccountTarget(null))}>
        <DialogContent className="w-[min(92vw,460px)]" submitOnEnter>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fee2e2] text-[#dc2626]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold text-[#24365a]">Delete this loan account?</DialogTitle>
              <DialogDescription className="mt-1.5 text-sm leading-6 text-[#697791]">
                The loan account and all of its transactions will be permanently removed. This action cannot be undone.
              </DialogDescription>
            </div>
          </div>

          {deleteAccountTarget ? (
            <div className="mt-4 rounded-[14px] border border-[#e5eaf2] bg-[#fbfcff] px-4 py-3">
              <div className="text-sm font-semibold text-[#24365a]">{deleteAccountTarget.accountName}</div>
              <div className="mt-0.5 text-xs text-[#7d8aa2]">
                {deleteAccountTarget.lenderBank || "Lender not added"}
                {deleteAccountTarget.accountNumber ? ` · ${deleteAccountTarget.accountNumber}` : ""}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#61708a]">
                <span>
                  Outstanding: <strong className="font-semibold text-[#24365a]">{formatLoanTableAmount(deleteAccountTarget.currentBalance)}</strong>
                </span>
                <span>
                  {deleteAccountTarget.transactions.length} transaction{deleteAccountTarget.transactions.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-full border-[#eef1f6] px-6 text-[#66748f]" onClick={() => setDeleteAccountTarget(null)}>
              Cancel
            </Button>
            <button
              type="button"
              data-enter-submit
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#dc2626] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#b91c1c]"
              onClick={confirmDeleteAccount}
            >
              <Trash2 className="h-4 w-4" />
              Yes, delete
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTransactionTarget)} onOpenChange={(open) => (open ? null : setDeleteTransactionTarget(null))}>
        <DialogContent className="w-[min(92vw,460px)]" submitOnEnter>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#fee2e2] text-[#dc2626]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold text-[#24365a]">Delete this transaction?</DialogTitle>
              <DialogDescription className="mt-1.5 text-sm leading-6 text-[#697791]">
                The entry will be removed and the outstanding balance will be recalculated. This action cannot be undone.
              </DialogDescription>
            </div>
          </div>

          {deleteTransactionTarget ? (
            <div className="mt-4 rounded-[14px] border border-[#e5eaf2] bg-[#fbfcff] px-4 py-3">
              <div className="text-sm font-semibold text-[#24365a]">{deleteTransactionTarget.type}</div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#61708a]">
                <span>{formatDate(deleteTransactionTarget.date)}</span>
                <span>
                  Total: <strong className="font-semibold text-[#24365a]">{formatLoanTableAmount(deleteTransactionTarget.totalAmount)}</strong>
                </span>
                {deleteTransactionTarget.note ? <span>{deleteTransactionTarget.note}</span> : null}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-full border-[#eef1f6] px-6 text-[#66748f]" onClick={() => setDeleteTransactionTarget(null)}>
              Cancel
            </Button>
            <button
              type="button"
              data-enter-submit
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#dc2626] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#b91c1c]"
              onClick={confirmDeleteTransaction}
            >
              <Trash2 className="h-4 w-4" />
              Yes, delete
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {columnFilterPopover
        ? createPortal(
            <div
              data-loan-column-filter
              className="fixed z-[70] w-[260px] rounded-[22px] border border-[#d5dfeb] bg-white p-3 shadow-[0_20px_42px_rgba(15,23,42,0.16)]"
              style={{ left: columnFilterPopover.left, top: columnFilterPopover.top }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#74839b]">Select category</div>
                  <select
                    value={columnFilterDraft.operator}
                    onChange={(event) =>
                      setColumnFilterDraft((current) => ({
                        ...current,
                        operator: event.target.value as ColumnFilterOperator,
                      }))
                    }
                    className="mt-2 h-10 w-full rounded-xl border border-[#f0c9a4] px-3 text-sm text-[#173152]"
                  >
                    <option value="contains">Contains</option>
                    <option value="equals">Equals</option>
                    <option value="starts-with">Starts With</option>
                  </select>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-sm text-[#61708a]">{transactionFilterLabel(columnFilterPopover.columnId)}</span>
                  <Input
                    value={columnFilterDraft.value}
                    onChange={(event) =>
                      setColumnFilterDraft((current) => ({
                        ...current,
                        value: event.target.value,
                      }))
                    }
                    placeholder="Enter filter value"
                    className="h-10 rounded-xl border-[#f0c9a4]"
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1 rounded-xl"
                    onClick={() => {
                      setColumnFilterDraft(defaultColumnFilter);
                      setColumnFilters((current) => {
                        const next = { ...current };
                        delete next[columnFilterPopover.columnId];
                        return next;
                      });
                      setColumnFilterPopover(null);
                    }}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    className="h-10 flex-1 rounded-xl bg-primary text-white hover:bg-[#cf670f]"
                    onClick={applyColumnFilter}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function LoanEditorDialog({
  open,
  editingId,
  draft,
  loanPreview,
  onOpenChange,
  onUpdateDraft,
  onSubmit,
}: {
  open: boolean;
  editingId: string | null;
  draft: LoanAccountDraft;
  loanPreview: number;
  onOpenChange: (open: boolean) => void;
  onUpdateDraft: <Key extends keyof LoanAccountDraft>(field: Key, value: LoanAccountDraft[Key]) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent submitOnEnter className="w-[min(92vw,760px)] rounded-[18px] border border-[#d7dfeb] p-0">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="border-b border-[#d7dfeb] px-5 py-4">
            <DialogTitle className="text-[22px] font-semibold text-[#24365a]">
              {editingId ? "Edit Loan Account" : "Add Loan Account"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#6d7b94]">
              Capture loan source, interest, tenure, and processing cost in one place.
            </DialogDescription>
          </div>

          <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">
                Account Name <span className="text-[#ef4444]">*</span>
              </span>
              <Input
                value={draft.accountName}
                onChange={(event) => onUpdateDraft("accountName", event.target.value)}
                placeholder="Account Name"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Lender Bank</span>
              <Input
                value={draft.lenderBank}
                onChange={(event) => onUpdateDraft("lenderBank", event.target.value)}
                placeholder="Lender Bank"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Account Number</span>
              <Input
                value={draft.accountNumber}
                onChange={(event) => onUpdateDraft("accountNumber", event.target.value)}
                placeholder="Account Number"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Description</span>
              <Input
                value={draft.description}
                onChange={(event) => onUpdateDraft("description", event.target.value)}
                placeholder="Description"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">
                Current Balance <span className="text-[#ef4444]">*</span>
              </span>
              <Input
                money
                value={draft.currentBalance}
                onChange={(event) => onUpdateDraft("currentBalance", event.target.value)}
                placeholder="Current Balance"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Balance as of</span>
              <AppDateInput
                aria-label="Balance as of"
                value={draft.balanceAsOf}
                onChange={(value) => onUpdateDraft("balanceAsOf", value)}
                inputClassName="h-11 rounded-[10px] border-[#c9d5e8] pr-10"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Loan received in</span>
              <select
                value={draft.loanReceivedIn}
                onChange={(event) => onUpdateDraft("loanReceivedIn", event.target.value)}
                className="h-11 rounded-[10px] border border-[#c9d5e8] bg-white px-3 text-sm text-[#1f3253] outline-none"
              >
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="Loan Transfer">Loan Transfer</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Interest Rate</span>
              <Input
                value={draft.interestRate}
                onChange={(event) => onUpdateDraft("interestRate", event.target.value)}
                placeholder="% per annum"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Term Duration (in Months)</span>
              <Input
                value={draft.termMonths}
                onChange={(event) => onUpdateDraft("termMonths", event.target.value)}
                placeholder="Term Duration(in Months)"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Processing Fee</span>
              <Input
                money
                value={draft.processingFee}
                onChange={(event) => onUpdateDraft("processingFee", event.target.value)}
                placeholder="Processing Fee"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Processing Fee Paid from</span>
              <select
                value={draft.processingFeePaidFrom}
                onChange={(event) => onUpdateDraft("processingFeePaidFrom", event.target.value)}
                className="h-11 rounded-[10px] border border-[#c9d5e8] bg-white px-3 text-sm text-[#1f3253] outline-none"
              >
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="Owner Fund">Owner Fund</option>
              </select>
            </label>
          </div>

          <div className="border-t border-[#d7dfeb] bg-[#fbfcff] px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="rounded-[14px] border border-[#e6ecf4] bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7c8ba4]">Estimated EMI</div>
                <div className="mt-2 text-lg font-semibold text-[#24365a]">
                  {loanPreview ? formatCurrency(loanPreview) : "Enter balance, rate and term"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-[#eef1f6] px-6 text-[#66748f]"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <button
                  type="submit"
                  data-enter-submit
                  className="inline-flex items-center justify-center rounded-full bg-primary px-7 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LoanTransactionDialog({
  open,
  mode,
  draft,
  previewBalance,
  editingTransactionId,
  onOpenChange,
  onUpdateDraft,
  onSubmit,
}: {
  open: boolean;
  mode: LoanActionMode;
  draft: LoanTransactionDraft;
  previewBalance: number;
  editingTransactionId: string | null;
  onOpenChange: (open: boolean) => void;
  onUpdateDraft: <Key extends keyof LoanTransactionDraft>(field: Key, value: LoanTransactionDraft[Key]) => void;
  onSubmit: () => void;
}) {
  const labels = getActionLabels(mode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent submitOnEnter className="w-[min(92vw,460px)] rounded-[18px] border border-[#d7dfeb] p-0">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="border-b border-[#d7dfeb] px-5 py-4">
            <DialogTitle className="text-[22px] font-semibold text-[#24365a]">
              {editingTransactionId ? `Edit ${labels.title}` : labels.title}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#6d7b94]">
              Keep the loan register aligned with real payments, additional loans, and charges.
            </DialogDescription>
          </div>

          <div className="space-y-4 px-5 py-5">
            {mode !== "charge" ? (
              <label className="grid gap-1.5">
                <span className="text-sm text-[#697791]">
                  {labels.principalLabel} <span className="text-[#ef4444]">*</span>
                </span>
                <Input
                  money
                  value={draft.principal}
                  onChange={(event) => onUpdateDraft("principal", event.target.value)}
                  placeholder="0"
                  className="h-11 rounded-[10px] border-[#c9d5e8]"
                />
              </label>
            ) : (
              <input type="hidden" value={draft.principal} readOnly />
            )}

            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">
                {labels.chargesLabel}
                {mode === "charge" ? <span className="text-[#ef4444]"> *</span> : null}
              </span>
              <Input
                money
                value={draft.interestAndCharges}
                onChange={(event) => onUpdateDraft("interestAndCharges", event.target.value)}
                placeholder="0"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>

            <div className="rounded-[14px] border border-[#e6ecf4] bg-[#fbfcff] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7c8ba4]">Updated Outstanding</div>
              <div
                className={cn(
                  "mt-2 text-lg font-semibold",
                  moneyToMinorUnits(previewBalance) < 0 ? "text-[#dc2626]" : "text-[#24365a]",
                )}
              >
                {formatLoanTableAmount(Math.abs(previewBalance))}
                {moneyToMinorUnits(previewBalance) < 0 ? " (Overpaid)" : ""}
              </div>
            </div>

            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Transaction Date</span>
              <AppDateInput
                aria-label="Transaction Date"
                value={draft.date}
                onChange={(value) => onUpdateDraft("date", value)}
                inputClassName="h-11 rounded-[10px] border-[#c9d5e8] pr-10"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-sm text-[#697791]">Description</span>
              <Input
                value={draft.note}
                onChange={(event) => onUpdateDraft("note", event.target.value)}
                placeholder="Enter description"
                className="h-11 rounded-[10px] border-[#c9d5e8]"
              />
            </label>
          </div>

          <div className="border-t border-[#d7dfeb] bg-[#fbfcff] px-5 py-4">
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-[#eef1f6] px-6 text-[#66748f]"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <button
                type="submit"
                data-enter-submit
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(230,120,23,0.24)] hover:bg-[#cf670f]"
              >
                <CheckCircle2 className="h-5 w-5" />
                {labels.submitLabel}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LoanSummaryCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Rows4;
  tone: "blue" | "orange" | "emerald";
}) {
  const toneClasses =
    tone === "blue"
      ? "bg-[#e7f2ff] text-[#1674ff]"
      : tone === "orange"
        ? "bg-[#fff1e2] text-[#e67817]"
        : "bg-[#e8fff4] text-[#0f9f63]";

  return (
    <div className="rounded-[14px] border border-[#d7dfeb] bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7d8aa2]">{label}</div>
          <div className="mt-1 truncate text-[22px] font-semibold leading-tight text-[#24365a]">{value}</div>
          <div className="mt-0.5 truncate text-xs text-[#697791]">{note}</div>
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", toneClasses)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function DetailInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[13px] text-[#9aa6bf]">{label}</div>
      <div className="mt-1 text-[15px] font-medium text-[#10284b]">{value}</div>
    </div>
  );
}

function MenuActionButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof Pencil;
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

function HistoryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-[12px] border border-[#e5ebf4] bg-[#fbfcff] px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7c8ba4]">{label}</div>
      <div className="text-sm font-medium text-[#24365a]">{value}</div>
    </div>
  );
}

function TransactionTableHeader({
  label,
  onFilter,
  filterActive = false,
  onSort,
  sortDirection,
}: {
  label: string;
  onFilter?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  filterActive?: boolean;
  onSort?: () => void;
  sortDirection?: "asc" | "desc";
}) {
  return (
    <th className="border-b border-[#d7dfeb] px-3 py-3 font-semibold">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>{label}</span>
          {onSort ? (
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#6b86c7] hover:bg-[#f3f6fb]"
              onClick={onSort}
            >
              <ArrowUpDown className={cn("h-3.5 w-3.5", sortDirection === "asc" ? "rotate-180" : "")} />
            </button>
          ) : null}
        </div>

        {onFilter ? (
          <button
            type="button"
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-full transition hover:bg-[#f3f6fb]",
              filterActive ? "text-primary" : "text-[#7d8aa2]",
            )}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onFilter}
          >
            <Filter className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </th>
  );
}
