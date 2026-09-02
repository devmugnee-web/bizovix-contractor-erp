import {
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Package,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

import type { VoucherType } from "@/types/domain";

export type SalesWorkspaceSection =
  | "invoices"
  | "quotation"
  | "proforma"
  | "payment-in"
  | "sale-order"
  | "delivery-challan"
  | "credit-note"
  | "pos";

export type SalesWorkspaceConfig = {
  slug: SalesWorkspaceSection;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  accent: "rose" | "amber" | "sky" | "emerald" | "indigo" | "orange" | "red" | "teal";
  sourceVoucherTypes: VoucherType[];
  createVoucherType: VoucherType;
  createLabel: string;
  documentPrefix: string;
  workflowLabel: string;
  spotlightTitle: string;
  spotlightDescription: string;
};

export const salesWorkspaceSections: SalesWorkspaceConfig[] = [
  {
    slug: "quotation",
    label: "Quotations",
    shortLabel: "Quotation",
    description: "Shape a confident pre-sales flow with quote visibility, approval cues, and next-step actions.",
    icon: FileText,
    accent: "amber",
    sourceVoucherTypes: ["sales"],
    createVoucherType: "sales",
    createLabel: "New Quote",
    documentPrefix: "QTN",
    workflowLabel: "Quotation",
    spotlightTitle: "Pre-sales pipeline",
    spotlightDescription: "Keep pending quotations visible so the team can follow up before deals go cold.",
  },
  {
    slug: "proforma",
    label: "Proforma Invoices",
    shortLabel: "Proforma",
    description: "Present professional pre-billing documents that still feel connected to the final invoice workflow.",
    icon: FileSpreadsheet,
    accent: "sky",
    sourceVoucherTypes: ["sales"],
    createVoucherType: "sales",
    createLabel: "New Proforma",
    documentPrefix: "PFI",
    workflowLabel: "Proforma",
    spotlightTitle: "Pre-bill control",
    spotlightDescription: "Use a clear proforma stage for pricing confirmation, advance requests, and customer sign-off.",
  },
  {
    slug: "sale-order",
    label: "Sales Orders",
    shortLabel: "Sale Order",
    description: "Review confirmed customer intent before dispatch and billing with better order-stage visibility.",
    icon: ClipboardList,
    accent: "indigo",
    sourceVoucherTypes: ["sales"],
    createVoucherType: "sales",
    createLabel: "Sales Order",
    documentPrefix: "SO",
    workflowLabel: "Order",
    spotlightTitle: "Order orchestration",
    spotlightDescription: "Keep commitment dates, conversion pace, and commercial readiness visible across the team.",
  },
  {
    slug: "delivery-challan",
    label: "Delivery Notes",
    shortLabel: "Delivery Note",
    description: "Give dispatch teams a crisp operational page for delivery paperwork, handover status, and billing linkage.",
    icon: Package,
    accent: "orange",
    sourceVoucherTypes: ["sales"],
    createVoucherType: "sales",
    createLabel: "Delivery Note",
    documentPrefix: "DC",
    workflowLabel: "Dispatch",
    spotlightTitle: "Dispatch control",
    spotlightDescription: "Visualize goods-out activity and keep challan references ready before final invoicing.",
  },
  {
    slug: "invoices",
    label: "Sales Invoices",
    shortLabel: "Invoices",
    description: "Monitor billing, payment status, and collection progress from one polished sales desk.",
    icon: ShoppingCart,
    accent: "rose",
    sourceVoucherTypes: ["sales"],
    createVoucherType: "sales",
    createLabel: "Add Sale",
    documentPrefix: "INV",
    workflowLabel: "Invoice",
    spotlightTitle: "Revenue desk",
    spotlightDescription: "Track issued invoices, follow-ups, and outstanding balances with a cleaner commercial workspace.",
  },
  {
    slug: "payment-in",
    label: "Customer Receipts",
    shortLabel: "Customer Receipts",
    description: "See collections, due recovery, and receipt movement in a simpler cash-in experience.",
    icon: ReceiptText,
    accent: "emerald",
    sourceVoucherTypes: ["receipt"],
    createVoucherType: "receipt",
    createLabel: "Add Receipt",
    documentPrefix: "RCV",
    workflowLabel: "Collection",
    spotlightTitle: "Collections desk",
    spotlightDescription: "Bring cash and bank receipts together so the team can settle dues faster.",
  },
  {
    slug: "credit-note",
    label: "Sales Returns",
    shortLabel: "Sales Return",
    description: "Handle returns, adjustments, and customer credits with a calmer after-sales workflow.",
    icon: RotateCcw,
    accent: "red",
    sourceVoucherTypes: ["credit-note"],
    createVoucherType: "credit-note",
    createLabel: "New Credit Note",
    documentPrefix: "CRN",
    workflowLabel: "Return",
    spotlightTitle: "After-sales recovery",
    spotlightDescription: "Keep adjustments transparent so credits and return requests never get lost in the inbox.",
  },
  {
    slug: "pos",
    label: "Bizovix POS",
    shortLabel: "POS",
    description: "Give fast-moving counter sales a lightweight command center with quick access to live documents.",
    icon: CreditCard,
    accent: "teal",
    sourceVoucherTypes: ["sales"],
    createVoucherType: "sales",
    createLabel: "Open POS",
    documentPrefix: "POS",
    workflowLabel: "Counter Sale",
    spotlightTitle: "Counter sales pulse",
    spotlightDescription: "Keep high-speed retail billing aligned with the same sales theme without losing simplicity.",
  },
];

export function isSalesWorkspaceSection(value: string): value is SalesWorkspaceSection {
  return salesWorkspaceSections.some((section) => section.slug === value);
}

export function getSalesWorkspaceSection(section: SalesWorkspaceSection) {
  return salesWorkspaceSections.find((entry) => entry.slug === section)!;
}

