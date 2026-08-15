import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Banknote,
  Building2,
  CreditCard,
  Database,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  Receipt,
  Landmark,
  Settings,
  Wallet,
} from "lucide-react";

export interface NavLeaf {
  label: string;
  href: string;
}

export interface NavItem {
  label: string;
  href?: string;
  subtitle?: string;
  icon: LucideIcon;
  badgeKey?: "reminders";
  children?: NavLeaf[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "CMS", subtitle: "Contract Management System", icon: FileText, children: [
    { label: "Ongoing Works", href: "/cms/ongoing-works" },
    { label: "Archived Works", href: "/cms/archived-works" },
  ] },
  {
    label: "Bank Instruments",
    icon: Landmark,
    children: [
      { label: "Document Purchase", href: "/bank-instruments/document-purchase" },
      { label: "Tender Security", href: "/bank-instruments/tender-security" },
      { label: "Credit Commitment", href: "/bank-instruments/credit-commitment" },
      { label: "PG / BG", href: "/bank-instruments/pg-bg" },
    ],
  },
  { label: "Purchases & Expense", icon: Wallet, children: [
    { label: "Project Expense", href: "/expenses/project-expense" },
    { label: "General Expense", href: "/expenses/general-expense" },
  ] },
  { label: "Receipts", href: "/receipts", icon: Receipt },
  { label: "Accounts", href: "/bank-accounts", icon: Building2 },
  { label: "Cash & Bank", icon: Banknote, children: [
    { label: "Main Cash", href: "/cash-bank/main-cash" },
    { label: "Petty Cash", href: "/cash-bank/petty-cash" },
    { label: "Bank Accounts", href: "/bank-accounts" },
    { label: "Bank Transfer", href: "/cash-bank/bank-transfer" },
  ] },
  { label: "Reports", href: "/reports", icon: BarChart3 },
];

export const NAV_ITEMS_LOWER: NavItem[] = [
  { label: "Business Tools", href: "/masters", icon: Database },
  { label: "Reminders", href: "/reminders", icon: Bell, badgeKey: "reminders" },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Activity Log", href: "/activity-log", icon: History },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Plan & Billing", href: "/plan-billing", icon: CreditCard },
];
