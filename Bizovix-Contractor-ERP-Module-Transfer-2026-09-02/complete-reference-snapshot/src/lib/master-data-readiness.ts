import type {
  AppDataset,
  MasterDataCheckItem,
  MasterDataReadinessResult,
} from "@/types/domain";
import { moneyToMinorUnits } from "@/lib/money";

export function evaluateMasterDataReadiness(
  dataset: AppDataset,
  workspaceId?: string | null,
): MasterDataReadinessResult {
  const currentWorkspace =
    dataset.workspaces.find((ws) => ws.id === workspaceId) || dataset.workspaces[0];

  const checks: MasterDataCheckItem[] = [
    {
      id: "accounting_masters",
      title: "Chart of Accounts & Ledgers",
      description: "Must have valid general ledger accounts for Assets, Liabilities, Income, and Expense posting.",
      category: "accounting_masters",
      isReady: (dataset.trialBalance || []).length > 0,
      requiredForPosting: true,
      actionRoute: "/app/reports/trial-balance",
      actionLabel: "View Trial Balance",
      details: dataset.trialBalance?.length
        ? `${dataset.trialBalance.length} ledger accounts configured`
        : "No general ledger accounts configured",
    },
    {
      id: "inventory_masters",
      title: "Inventory Stock Items",
      description: "Must have active stock items defined with unit rates for stock and voucher movement.",
      category: "inventory_masters",
      isReady: (dataset.stockItems || []).length > 0,
      requiredForPosting: true,
      actionRoute: "/app/vouchers/sales/new",
      actionLabel: "Manage Inventory",
      details: dataset.stockItems?.length
        ? `${dataset.stockItems.length} inventory items configured`
        : "No stock item masters registered",
    },
    {
      id: "party_masters",
      title: "Customer & Supplier Parties",
      description: "Must have registered party masters with contact and credit parameters.",
      category: "party_masters",
      isReady: (dataset.parties || []).length > 0,
      requiredForPosting: true,
      actionRoute: "/app/vouchers/sales/new",
      actionLabel: "Manage Parties",
      details: dataset.parties?.length
        ? `${dataset.parties.length} party records registered`
        : "No customer or supplier parties registered",
    },
    {
      id: "employee_masters",
      title: "Staff & Employee Masters",
      description: "Must have user profiles or employee records registered for transaction authorization and audit.",
      category: "employee_masters",
      isReady: (dataset.users || []).length > 0,
      requiredForPosting: false,
      actionRoute: "/app/dashboard",
      actionLabel: "View Team Users",
      details: dataset.users?.length
        ? `${dataset.users.length} active authorized users`
        : "No employee/user records configured",
    },
    {
      id: "bank_accounts",
      title: "Bank & Cash Ledgers",
      description: "Must have cash-in-hand or bank accounts configured for payment and receipt vouchers.",
      category: "bank_accounts",
      isReady: (dataset.trialBalance || []).some(
        (row) =>
          row.ledger.toLowerCase().includes("bank") ||
          row.ledger.toLowerCase().includes("cash") ||
          row.group.toLowerCase().includes("bank") ||
          row.group.toLowerCase().includes("cash"),
      ),
      requiredForPosting: true,
      actionRoute: "/app/reports/trial-balance",
      actionLabel: "Check Bank Ledgers",
      details: (dataset.trialBalance || []).some(
        (row) =>
          row.ledger.toLowerCase().includes("bank") ||
          row.ledger.toLowerCase().includes("cash") ||
          row.group.toLowerCase().includes("bank") ||
          row.group.toLowerCase().includes("cash"),
      )
        ? "Bank & cash accounts active"
        : "Missing Cash / Bank account masters",
    },
    {
      id: "tax_settings",
      title: "Tax & Duty Parameters",
      description: "Must have tax settings or duty ledger accounts configured for compliant invoicing.",
      category: "tax_settings",
      isReady: (dataset.trialBalance || []).some(
        (row) =>
          row.ledger.toLowerCase().includes("tax") ||
          row.ledger.toLowerCase().includes("vat") ||
          row.ledger.toLowerCase().includes("gst") ||
          row.ledger.toLowerCase().includes("duty") ||
          row.group.toLowerCase().includes("tax"),
      ),
      requiredForPosting: true,
      actionRoute: "/app/reports/trial-balance",
      actionLabel: "Configure Tax Ledgers",
      details: (dataset.trialBalance || []).some(
        (row) =>
          row.ledger.toLowerCase().includes("tax") ||
          row.ledger.toLowerCase().includes("vat") ||
          row.ledger.toLowerCase().includes("gst") ||
          row.group.toLowerCase().includes("tax"),
      )
        ? "Tax ledgers active"
        : "No tax or VAT ledgers configured",
    },
    {
      id: "financial_year",
      title: "Financial Year & Open Period",
      description: "Active workspace must have a valid financial year and open posting period defined.",
      category: "financial_year",
      isReady: Boolean(currentWorkspace?.financialYear && currentWorkspace?.openPeriod),
      requiredForPosting: true,
      actionRoute: "/app/dashboard",
      actionLabel: "Workspace Config",
      details: currentWorkspace?.financialYear
        ? `FY: ${currentWorkspace.financialYear}`
        : "Financial year not set",
    },
    {
      id: "opening_balances",
      title: "Opening Balances Setup",
      description: "Opening balances must be posted and verified for trial balance integrity.",
      category: "opening_balances",
      isReady: (dataset.trialBalance || []).some(
        (row) => moneyToMinorUnits(row.debit) !== 0 || moneyToMinorUnits(row.credit) !== 0,
      ),
      requiredForPosting: false,
      actionRoute: "/app/reports/trial-balance",
      actionLabel: "Opening Balances",
      details: (dataset.trialBalance || []).some(
        (row) => moneyToMinorUnits(row.debit) !== 0 || moneyToMinorUnits(row.credit) !== 0,
      )
        ? "Opening ledger balances recorded"
        : "Trial balance has 0 opening balances",
    },
  ];

  const totalChecks = checks.length;
  const passedChecks = checks.filter((c) => c.isReady).length;
  const criticalMissingCount = checks.filter((c) => !c.isReady && c.requiredForPosting).length;
  const isReadyForTransactions = criticalMissingCount === 0;

  return {
    isReadyForTransactions,
    totalChecks,
    passedChecks,
    criticalMissingCount,
    checks,
  };
}
