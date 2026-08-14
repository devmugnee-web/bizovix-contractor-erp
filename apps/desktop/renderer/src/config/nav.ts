import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Building2,
  Database,
  FileText,
  FolderOpen,
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
  { label: "CMS", subtitle: "Contract Management System", icon: FileText, children: [
    { label: "Ongoing Works", href: "/cms/ongoing-works" },
    { label: "Archived Works", href: "/cms/archived-works" },
  ] },
  { label: "Expenses", href: "/expenses", icon: Wallet },
  { label: "Receipts", href: "/receipts", icon: Receipt },
  { label: "Accounts", href: "/bank-accounts", icon: Building2 },
  { label: "Reports", href: "/reports", icon: BarChart3 },
];

export const NAV_ITEMS_LOWER: NavItem[] = [
  { label: "Masters", href: "/masters", icon: Database },
  { label: "Reminders", href: "/reminders", icon: Bell, badgeKey: "reminders" },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Settings", href: "/settings", icon: Settings },
];
