import { BanknoteArrowUp, CircleDollarSign, FileMinus2, ReceiptText, ShoppingCart, WalletCards, type LucideIcon } from "lucide-react";

import type { VoucherType } from "@/types/domain";

export type PurchaseWorkspaceSection =
  | "bills"
  | "receipt-notes"
  | "payment-out"
  | "expenses"
  | "orders"
  | "debit-notes"
  | "revenue";

export type PurchaseWorkspaceConfig = {
  slug: PurchaseWorkspaceSection;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  accent: "sky" | "emerald" | "amber" | "indigo" | "red" | "teal";
  sourceVoucherTypes: VoucherType[];
  fallbackVoucherTypes?: VoucherType[];
  createVoucherType: VoucherType;
  createLabel: string;
  documentPrefix: string;
  workflowLabel: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
};

export const purchaseWorkspaceSections: PurchaseWorkspaceConfig[] = [
  {
    slug: "bills",
    label: "Purchase Bills",
    shortLabel: "Bills",
    description: "Track supplier bills, paid amounts, due balances, and follow-up actions in one accountant-friendly desk.",
    icon: ReceiptText,
    accent: "sky",
    sourceVoucherTypes: ["purchase"],
    createVoucherType: "purchase",
    createLabel: "Add Purchase Bill",
    documentPrefix: "PB",
    workflowLabel: "Bill",
    emptyStateTitle: "No purchase bills found",
    emptyStateDescription: "Create your first purchase bill to track supplier payables, stock value, and draft postings.",
  },
  {
    slug: "receipt-notes",
    label: "Receipt Notes",
    shortLabel: "Receipt Notes",
    description: "Track supplier receipt notes, received stock references, and follow-up billing steps in one place.",
    icon: ReceiptText,
    accent: "teal",
    sourceVoucherTypes: ["purchase"],
    createVoucherType: "purchase",
    createLabel: "Add Receipt Note",
    documentPrefix: "RN",
    workflowLabel: "Receipt Note",
    emptyStateTitle: "No receipt notes found",
    emptyStateDescription: "Create your first receipt note to track received supplier stock before final billing.",
  },
  {
    slug: "payment-out",
    label: "Payment-Out",
    shortLabel: "Payment-Out",
    description: "Record supplier payments and outgoing cash movement without leaving the purchase workspace.",
    icon: BanknoteArrowUp,
    accent: "emerald",
    // No fallback to plain purchase vouchers: editing one of those fallback rows saves
    // through updateVoucher(row.sourceId, {voucherType: "payment", ...}) — since
    // row.sourceId is the real purchase bill's id, that would silently overwrite the
    // bill itself and turn it into a payment voucher. Only real payments belong here.
    sourceVoucherTypes: ["payment"],
    createVoucherType: "payment",
    createLabel: "Add Payment-Out",
    documentPrefix: "POUT",
    workflowLabel: "Payment",
    emptyStateTitle: "No Payment-Out transactions yet",
    emptyStateDescription: "Record supplier payments, operating payments, or other outgoing transactions from this workspace.",
  },
  {
    slug: "expenses",
    label: "Expenses",
    shortLabel: "Expenses",
    description: "Capture operating expenses with cleaner payment context, category visibility, and tax-ready registers.",
    icon: WalletCards,
    accent: "amber",
    sourceVoucherTypes: ["expense"],
    createVoucherType: "expense",
    createLabel: "Add Expense",
    documentPrefix: "EXP",
    workflowLabel: "Expense",
    emptyStateTitle: "Add your first expense",
    emptyStateDescription: "Record operating costs to understand your actual business profit and payment movement.",
  },
  {
    slug: "orders",
    label: "Purchase Orders",
    shortLabel: "Orders",
    description: "Keep supplier order intent visible before conversion, receipt, and billing.",
    icon: ShoppingCart,
    accent: "indigo",
    sourceVoucherTypes: ["purchase"],
    createVoucherType: "purchase",
    createLabel: "Add Purchase Order",
    documentPrefix: "PO",
    workflowLabel: "Order",
    emptyStateTitle: "Create your first purchase order",
    emptyStateDescription: "Prepare supplier orders, monitor expected delivery, and convert approved orders into purchase bills.",
  },
  {
    slug: "debit-notes",
    label: "Purchase Returns",
    shortLabel: "Purchase Return",
    description: "Handle purchase returns, supplier adjustments, and overbilling recovery in a focused return workflow.",
    icon: FileMinus2,
    accent: "red",
    // No fallback to plain purchase vouchers here — a debit note is only ever created
    // explicitly for a return/adjustment, so this list must stay empty until one exists
    // rather than relabeling every unrelated purchase bill as a "Purchase Return".
    sourceVoucherTypes: ["debit-note"],
    createVoucherType: "debit-note",
    createLabel: "Add Purchase Return",
    documentPrefix: "PR",
    workflowLabel: "Purchase Return",
    emptyStateTitle: "No purchase returns found",
    emptyStateDescription: "Create purchase returns for returned goods, supplier adjustments, or overcharges.",
  },
  {
    slug: "revenue",
    label: "Revenue",
    shortLabel: "Revenue",
    description: "Track other-income postings — interest, commission, and one-off earnings outside regular sales.",
    icon: CircleDollarSign,
    accent: "emerald",
    sourceVoucherTypes: ["revenue"],
    createVoucherType: "revenue",
    createLabel: "Add Revenue",
    documentPrefix: "REV",
    workflowLabel: "Revenue",
    emptyStateTitle: "No revenue entries found",
    emptyStateDescription: "Record interest, commission, or other income to keep other-income ledgers up to date.",
  },
];

export function isPurchaseWorkspaceSection(value: string): value is PurchaseWorkspaceSection {
  return purchaseWorkspaceSections.some((section) => section.slug === value);
}

export function getPurchaseWorkspaceSection(section: PurchaseWorkspaceSection) {
  return purchaseWorkspaceSections.find((entry) => entry.slug === section)!;
}
