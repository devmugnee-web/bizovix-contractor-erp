"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  BadgePercent,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsLeftRight,
  CircleDollarSign,
  CreditCard,
  Crown,
  FileText,
  FileClock,
  FileSpreadsheet,
  Factory,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildSalesInvoiceCreateRoute, buildSalesInvoiceRoute, buildWorkspaceRoute } from "@/config/routes";
import { useCurrentSessionQuery, useSubscriptionQuery, useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import {
  COMPANY_PROFILE_UPDATED_EVENT,
  defaultCompanyProfile,
  readCompanyProfile,
  type CompanyProfileSnapshot,
} from "@/services/company-profile";
import { getWorkspaceSubscriptionSnapshot } from "@/lib/workspace-subscription";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { cn } from "@/lib/utils";
import { readDataset } from "@/services/browser-dataset";
import { defaultWorkflowSettings } from "@/services/workflow-settings.service";
import { useUiStore } from "@/stores/ui-store";
import type { DataMode } from "@/types/domain";

type SidebarChildItem = {
  label: string;
  path?: string;
  createPath?: string;
  icon: typeof LayoutDashboard;
  end: "plus" | "arrow" | "none";
  children?: SidebarGrandchildItem[];
};

type SidebarGrandchildItem = {
  label: string;
  path: string;
  createPath?: string;
  icon: typeof LayoutDashboard;
  end: "plus" | "arrow" | "none";
};

type SidebarMenuItem = {
  label: string;
  icon: typeof LayoutDashboard;
  path?: string;
  createPath?: string;
  end?: "plus" | "arrow" | "none";
  children?: SidebarChildItem[];
};

/**
 * Sidebar row states. The old flat `#252d59` washed out against the navy panel
 * and read as dull grey, so an active row now gets a deeper indigo gradient with
 * the brand amber edge already used by the child connector line, and hover gets a
 * clearly bluer lift plus a soft amber hint so it reads as interactive.
 */
const navRowActiveClass =
  "bg-[linear-gradient(90deg,#4257d6_0%,#28348f_100%)] shadow-[inset_4px_0_0_0_#f59e0b] ring-1 ring-inset ring-white/20";
const navRowHoverClass =
  "transition-colors hover:bg-[#28336e] hover:shadow-[inset_3px_0_0_0_#f59e0b] hover:ring-1 hover:ring-inset hover:ring-white/10";
const navRowIconActiveClass = "bg-[#f59e0b]/20 ring-1 ring-inset ring-[#f59e0b]/45";
const navRowIconIdleClass = "bg-white/[0.07]";
// Applied alongside navRowActiveClass wherever a row's label text needs the
// same "you are here" cue — plain white text made active vs. hover states too
// hard to tell apart at a glance, so the active label also gets the brand
// amber accent and extra weight.
const navRowActiveTextClass = "text-[#ffd166] font-semibold";

const sidebarMenu: SidebarMenuItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard", end: "none" },
  {
    label: "Customer & Suppliers",
    icon: Users,
    end: "arrow",
    children: [
      { label: "Customers", icon: Users, path: "/masters/customers", createPath: "/masters/customers?create=customer", end: "plus" },
      { label: "Suppliers", icon: BriefcaseBusiness, path: "/masters/suppliers", createPath: "/masters/suppliers?create=supplier", end: "plus" },
      { label: "Loyalty Points", icon: BadgePercent, path: "/masters/loyalty-points", end: "none" },
    ],
  },
  { label: "Products & Services", icon: Package, path: "/masters/inventory", createPath: "/masters/inventory?create=product", end: "plus" },
  { label: "LC Management", icon: BriefcaseBusiness, path: "/lc-management/dashboard", end: "none" },
  { label: "Manufacturing", icon: Factory, path: "/manufacturing/dashboard", end: "none" },
  {
    label: "Purchases & Expenses",
    icon: ShoppingCart,
    end: "arrow",
    children: [
      { label: "Purchase Orders", icon: FileClock, path: "/purchase/orders", createPath: "/vouchers/purchase/new?workflow=purchase-order", end: "plus" },
      { label: "Receipt Notes", icon: Package, path: "/purchase/receipt-notes", end: "none" },
      { label: "Purchase Bills", icon: Package, path: "/purchase/bills", createPath: "/vouchers/purchase/new", end: "plus" },
      { label: "Purchase Returns", icon: RotateCcw, path: "/purchase/debit-notes", createPath: "/vouchers/debit-note/new", end: "plus" },
      { label: "Payments", icon: CreditCard, path: "/purchase/payment-out", createPath: "/vouchers/payment/new", end: "plus" },
      { label: "Expenses", icon: HandCoins, path: "/purchase/expenses", createPath: "/vouchers/expense/new", end: "plus" },
    ],
  },
  {
    label: "Sales & Revenue",
    icon: TrendingUp,
    end: "arrow",
    children: [
      { label: "Quotations", icon: FileText, path: "/sales/quotation", createPath: "/sales/quotation?create=1", end: "plus" },
      { label: "Proforma Invoices", icon: FileSpreadsheet, path: "/sales/proforma", createPath: "/sales/proforma?create=1", end: "plus" },
      { label: "Sales Orders", icon: FileClock, path: "/sales/sale-order", createPath: "/sales/sale-order?create=1", end: "plus" },
      { label: "Delivery Notes", icon: Package, path: "/sales/delivery-challan", end: "none" },
      { label: "Sales Invoices", icon: ShoppingCart, path: "/sales/invoices", createPath: "/sales/invoices?create=1", end: "plus" },
      { label: "Sales Returns", icon: RotateCcw, path: "/sales/credit-note", createPath: "/sales/credit-note?create=1", end: "plus" },
      { label: "Customer Receipts", icon: ReceiptText, path: "/sales/payment-in", createPath: "/sales/payment-in?create=1", end: "plus" },
      { label: "Revenue", icon: CircleDollarSign, path: "/sales/revenue", createPath: "/vouchers/revenue/new", end: "plus" },
    ],
  },
  {
    label: "Cash & Bank",
    icon: Landmark,
    end: "arrow",
    children: [
      {
        label: "Cash",
        icon: Landmark,
        end: "arrow",
        children: [
          { label: "Main Cash", icon: Landmark, path: "/utilities/cash-in-hand?account=main", createPath: "/utilities/cash-in-hand?account=main&create=1", end: "plus" },
          { label: "Petty Cash", icon: Landmark, path: "/utilities/cash-in-hand?account=petty", createPath: "/utilities/cash-in-hand?account=petty&create=1", end: "plus" },
        ],
      },
      { label: "Bank Accounts", icon: Building2, path: "/utilities/bank-accounts", createPath: "/utilities/bank-accounts?create=1", end: "plus" },
      { label: "MFS", icon: Smartphone, path: "/utilities/mfs-accounts", createPath: "/utilities/mfs-accounts?create=1", end: "plus" },
      { label: "Bank Transfers", icon: RefreshCw, path: "/utilities/bank-transfers", createPath: "/utilities/bank-transfers?create=1", end: "plus" },
      { label: "Cheque Management", icon: FileSpreadsheet, path: "/utilities/cheques", end: "none" },
      { label: "Loan Accounts", icon: ShieldCheck, path: "/utilities/loan-accounts", createPath: "/utilities/loan-accounts?create=1", end: "plus" },
    ],
  },
  { label: "Assets Management", icon: Landmark, path: "/assets-management", end: "none" },
  { label: "HR & Payroll", icon: Users, path: "/payroll-hr", end: "none" },
  {
    label: "Reports",
    icon: FileSpreadsheet,
    path: "/reports/balance-sheet",
    end: "none",
  },
  {
    label: "Business Tools",
    icon: Settings,
    end: "arrow",
    children: [
      { label: "Journal (Adjustment Posting)", icon: FileClock, path: "/vouchers/journal/new?adjustment=1&returnTo=/app/reports/balance-sheet", end: "none" },
      { label: "Import Items", icon: Package, path: "/utilities/import-items", end: "none" },
      { label: "Update Items In Bulk", icon: RefreshCw, path: "/utilities/update-items-bulk", end: "none" },
      { label: "Import Parties", icon: Users, path: "/utilities/import-parties", end: "none" },
      { label: "Tally Import & Export", icon: BriefcaseBusiness, path: "/utilities/export-to-tally", end: "none" },
      { label: "Export Items", icon: FileSpreadsheet, path: "/utilities/export-items", end: "none" },
      { label: "Verify My Data", icon: ShieldCheck, path: "/utilities/verify-my-data", end: "none" },
      { label: "Recycle Bin", icon: RotateCcw, path: "/utilities/recycle-bin", end: "none" },
      { label: "Close Financial Year", icon: Landmark, path: "/utilities/close-financial-year", end: "none" },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    end: "arrow",
    children: [
      { label: "General Settings", icon: Settings, path: "/masters/settings", end: "none" },
      { label: "Users & Roles", icon: Users, path: "/utilities/sync-share", end: "none" },
      {
        label: "Backup & Sync",
        icon: RefreshCw,
        path: "/utilities/auto-backup",
        end: "arrow",
        children: [
          { label: "Automatic Backup", icon: RefreshCw, path: "/utilities/auto-backup", end: "none" },
          { label: "Backup To Computer", icon: RefreshCw, path: "/utilities/backup-to-computer", end: "none" },
          { label: "Backup to Cloud", icon: RefreshCw, path: "/utilities/backup-to-drive", end: "none" },
          { label: "Restore Backup", icon: RefreshCw, path: "/utilities/restore-backup", end: "none" },
        ],
      },
      {
        label: "Activity Log",
        icon: FileClock,
        end: "arrow",
        children: [
          { label: "User Activity", icon: FileClock, path: "/reports/user-activity-log", end: "none" },
          { label: "Login History", icon: ShieldCheck, path: "/reports/login-history", end: "none" },
          { label: "Data Changes", icon: FileSpreadsheet, path: "/reports/edited-transactions", end: "none" },
          { label: "Deleted Records", icon: RotateCcw, path: "/reports/deleted-transactions", end: "none" },
          { label: "Posting / Approval History", icon: ShieldCheck, path: "/reports/approval-history", end: "none" },
        ],
      },
    ],
  },
  { label: "Plan & Billing", icon: ShieldCheck, path: "/subscription", end: "none" },
];

export function SidebarNav({
  mode,
  mobile = false,
  companyName = "Bizovix Trading Limited",
}: {
  mode: DataMode;
  mobile?: boolean;
  companyName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session } = useSessionContext();
  const workspaceId = session?.workspaceId ?? "workspace";
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const setCreateMenuOpen = useUiStore((state) => state.setCreateMenuOpen);
  const sidebarScrollRef = useTransientScrollbar<HTMLDivElement>();
  const subscriptionQuery = useSubscriptionQuery(mode, session?.workspaceId ?? null);
  const currentSessionQuery = useCurrentSessionQuery(mode);
  const workflowSettingsQuery = useWorkflowSettingsQuery(
    mode,
    session?.workspaceId ?? (mode === "api" ? null : "workspace"),
  );
  const workflowSettings = workflowSettingsQuery.data ?? defaultWorkflowSettings;
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileSnapshot>(defaultCompanyProfile);

  const compact = mobile ? false : collapsed;
  const companyProfileHref = buildWorkspaceRoute(mode, "/company-profile");
  const subscriptionHref = buildWorkspaceRoute(mode, "/subscription");
  const fallbackSubscription = useMemo(
    () =>
      getWorkspaceSubscriptionSnapshot(
        readDataset(mode === "demo" ? "demo" : "mock"),
        session?.workspaceId ?? null,
      ),
    [mode, session?.workspaceId],
  );
  const subscriptionSnapshot = subscriptionQuery.data ?? fallbackSubscription;
  const companyLogoSrc = companyProfile.logoDataUrl;
  const realCompanyName = currentSessionQuery.data?.company.name.trim();
  // In api mode the backend's own company record is authoritative — the locally
  // stored companyProfile name defaults to the static placeholder and would
  // otherwise always win, showing the wrong tenant's name in the sidebar.
  const displayCompanyName = mode === "api" ? realCompanyName || companyName : companyProfile.companyName.trim() || companyName;
  const trialDurationDays = 30;
  const isTrialPlan = subscriptionSnapshot.currentPlan.code.startsWith("FREE");
  const trialDaysRemaining = isTrialPlan ? Math.min(trialDurationDays, Math.max(0, subscriptionSnapshot.daysRemaining)) : Math.max(0, subscriptionSnapshot.daysRemaining);
  const hasTrialExpired = isTrialPlan && trialDaysRemaining === 0;
  const trialProgress = isTrialPlan ? Math.max(8, Math.min(100, (trialDaysRemaining / trialDurationDays) * 100)) : 100;
  const subscriptionCardTitle = isTrialPlan
    ? hasTrialExpired
      ? "30 days free trial ended"
      : `${trialDaysRemaining} days left in your free trial`
    : `${subscriptionSnapshot.currentPlan.name} Plan`;
  const subscriptionCardCta = isTrialPlan ? "Upgrade to Premium" : "Manage Subscription";
  const grantedPermissions = new Set(session?.user.permissions ?? []);
  const permissionDataAvailable = session?.user.permissions !== undefined;
  const hasPermission = (permission: string) => mode !== "api" || session?.user.role === "Owner" || !permissionDataAvailable || grantedPermissions.has(permission);
  const canCreateVoucher = hasPermission("accounting.voucher.create");
  const canCreateLedger = hasPermission("accounting.ledger.create");
  const canCreateStockItem = hasPermission("inventory.stock_item.create");
  const canManageWorkspace = hasPermission("workspace.manage");
  const canViewActivityLog = hasPermission("accounting.report.trial_balance") || hasPermission("dashboard.view");
  const canUseCreatePath = (path: string | undefined) => {
    if (!path) return false;
    if (path.includes("/masters/customers") || path.includes("/masters/suppliers")) return canCreateLedger;
    if (path.includes("/masters/inventory")) return canCreateStockItem;
    return canCreateVoucher;
  };
  const workflowAllowsChild = (parentLabel: string, childLabel: string) => {
    if (
      parentLabel === "Purchases & Expenses" &&
      workflowSettings.purchaseWorkflow === "DIRECT" &&
      (childLabel === "Purchase Orders" || childLabel === "Receipt Notes")
    ) {
      return false;
    }
    if (
      parentLabel === "Sales & Revenue" &&
      workflowSettings.salesWorkflow === "DIRECT" &&
      (childLabel === "Sales Orders" || childLabel === "Delivery Notes")
    ) {
      return false;
    }
    return true;
  };
  const workflowAllowsCreate = (parentLabel: string, childLabel: string) => {
    // Receipt/Delivery Notes are children of a real PO/SO. Their forms keep the
    // source reference read-only, so a blank "+" route can never produce a valid
    // document. Operators start these from the matching Order row instead.
    if (
      (parentLabel === "Purchases & Expenses" && childLabel === "Receipt Notes") ||
      (parentLabel === "Sales & Revenue" && childLabel === "Delivery Notes")
    ) {
      return false;
    }
    if (parentLabel === "Purchases & Expenses" && childLabel === "Purchase Bills") {
      return workflowSettings.purchaseWorkflow !== "ORDER_BASED";
    }
    if (parentLabel === "Sales & Revenue" && childLabel === "Sales Invoices") {
      return workflowSettings.salesWorkflow !== "ORDER_BASED";
    }
    return true;
  };
  const menuItems = sidebarMenu.filter((item) => {
    if (item.label === "Dashboard") return hasPermission("dashboard.view");
    if (item.label === "Reports") return canViewActivityLog;
    if (item.label === "Settings") return canManageWorkspace || canViewActivityLog;
    if (item.label === "Business Tools") return hasPermission("accounting.voucher.post") || hasPermission("workspace.manage");
    return true;
  }).map((item) => ({
    ...item,
    path: item.path ? (item.path === "/sales/invoices" ? buildSalesInvoiceRoute(mode) : buildWorkspaceRoute(mode, item.path)) : undefined,
    createPath:
      item.createPath && canUseCreatePath(item.createPath)
        ? item.createPath === "/sales/invoices?create=1"
          ? buildSalesInvoiceCreateRoute(mode)
          : buildWorkspaceRoute(mode, item.createPath)
        : undefined,
    children: item.children?.filter((child) => {
      if (!workflowAllowsChild(item.label, child.label)) return false;
      if (item.label !== "Settings") return true;
      if (child.label === "Activity Log") return canViewActivityLog;
      return canManageWorkspace;
    }).map((child) => ({
      ...child,
      path: child.path ? (child.path === "/sales/invoices" ? buildSalesInvoiceRoute(mode) : buildWorkspaceRoute(mode, child.path)) : undefined,
      createPath:
        child.createPath && workflowAllowsCreate(item.label, child.label) && canUseCreatePath(child.createPath)
          ? child.createPath === "/sales/invoices?create=1"
            ? buildSalesInvoiceCreateRoute(mode)
            : buildWorkspaceRoute(mode, child.createPath)
          : undefined,
      children: child.children?.map((grandchild) => ({
        ...grandchild,
        path: grandchild.path === "/sales/invoices" ? buildSalesInvoiceRoute(mode) : buildWorkspaceRoute(mode, grandchild.path),
        createPath:
          grandchild.createPath && canUseCreatePath(grandchild.createPath)
            ? grandchild.createPath === "/sales/invoices?create=1"
              ? buildSalesInvoiceCreateRoute(mode)
              : buildWorkspaceRoute(mode, grandchild.createPath)
            : undefined,
      })),
    })),
  }));
  const activeGroupLabel =
    menuItems.find((item) => {
      if (!item.children?.length) {
        return false;
      }

      if (matchesSidebarPath(item.path, item.createPath)) {
        return true;
      }

      return item.children.some((child) =>
        child.children?.length
          ? child.children.some((grandchild) => matchesSidebarPath(grandchild.path, grandchild.createPath))
          : matchesSidebarPath(child.path, child.createPath),
      );
    })?.label ?? null;
  const [openGroupLabel, setOpenGroupLabel] = useState<string | null>(activeGroupLabel);
  const activeNestedGroupLabel = useMemo(() => {
    const activeParent = menuItems.find((item) => item.label === activeGroupLabel);
    const activeNestedChild = activeParent?.children?.find((child) =>
      child.children?.some((grandchild) => matchesSidebarPath(grandchild.path, grandchild.createPath)),
    );
    return activeNestedChild ? `${activeParent?.label}:${activeNestedChild.label}` : null;
  }, [activeGroupLabel, menuItems, pathname]);
  const [openNestedGroupLabel, setOpenNestedGroupLabel] = useState<string | null>(activeNestedGroupLabel);

  useEffect(() => {
    if (compact) {
      return;
    }

    setOpenGroupLabel(activeGroupLabel);
  }, [activeGroupLabel, compact]);

  useEffect(() => {
    if (compact) {
      return;
    }

    setOpenNestedGroupLabel(activeNestedGroupLabel);
  }, [activeNestedGroupLabel, compact]);

  useEffect(() => {
    const syncCompanyProfile = () => {
      setCompanyProfile(readCompanyProfile(mode, workspaceId));
    };

    const handleCompanyProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ mode: DataMode; workspaceId: string; profile: CompanyProfileSnapshot }>).detail;
      if (!detail || detail.mode !== mode || detail.workspaceId !== workspaceId) {
        return;
      }

      setCompanyProfile(detail.profile);
    };

    syncCompanyProfile();
    window.addEventListener(COMPANY_PROFILE_UPDATED_EVENT, handleCompanyProfileUpdated as EventListener);
    return () => window.removeEventListener(COMPANY_PROFILE_UPDATED_EVENT, handleCompanyProfileUpdated as EventListener);
  }, [mode, workspaceId]);

  function buildActionHref(path: string) {
    return `${path}${path.includes("?") ? "&" : "?"}open=${Date.now()}`;
  }

  function handleCreateNavigation(path: string) {
    const actionHref = buildActionHref(path);
    router.push(actionHref);
    setCreateMenuOpen(false);
    setMobileNavOpen(false);
  }

  function isGroupExpanded(groupLabel: string) {
    if (compact) {
      return false;
    }

    return openGroupLabel === groupLabel;
  }

  function matchesSidebarPath(targetPath: string | undefined, alternatePath?: string) {
    return matchesSingleSidebarPath(targetPath) || matchesSingleSidebarPath(alternatePath);
  }

  function matchesSingleSidebarPath(targetPath: string | undefined) {
    if (!targetPath) {
      return false;
    }

    const [normalizedTargetPath, targetQueryString] = targetPath.split("?");
    const reportsRoot = normalizedTargetPath.endsWith("/reports/balance-sheet")
      ? normalizedTargetPath.slice(0, -"/balance-sheet".length)
      : null;
    const auditReportPath = ["user-activity-log", "login-history", "edited-transactions", "deleted-transactions", "approval-history"]
      .some((slug) => pathname.endsWith(`/reports/${slug}`));
    const canonicalDayBookPath = reportsRoot ? `${reportsRoot.slice(0, -"/reports".length)}/day-book` : null;
    const pathMatches =
      pathname === normalizedTargetPath ||
      pathname.startsWith(`${normalizedTargetPath}/`) ||
      Boolean(reportsRoot && !auditReportPath && (pathname === reportsRoot || pathname.startsWith(`${reportsRoot}/`) || pathname === canonicalDayBookPath));

    if (!pathMatches) {
      return false;
    }

    const targetQuery = new URLSearchParams(targetQueryString ?? "");

    // Several sidebar entries (Purchase Orders, Receipt Notes, Purchase Bills) share the same
    // /vouchers/purchase/new pathname and are only distinguished by the "workflow" query param.
    // Plain subset matching would let an entry with no "workflow" in its own path match ANY
    // workflow variant, so require the current and target "workflow" values to agree exactly
    // (including both being absent) before falling back to subset matching for the rest.
    if (searchParams.get("workflow") !== targetQuery.get("workflow")) {
      return false;
    }

    if (!targetQueryString) {
      return true;
    }

    return Array.from(targetQuery.entries()).every(([key, value]) => searchParams.get(key) === value);
  }

  function renderEndIcon(type: "plus" | "arrow" | "none" | undefined, expanded?: boolean) {
    if (type === "plus") {
      return <Plus className="h-4 w-4 text-white" />;
    }

    if (type === "arrow") {
      return <ChevronDown className={cn("h-4 w-4 text-white transition-transform", expanded ? "rotate-180" : "")} />;
    }

    return null;
  }

  return (
    <div
      className={cn(
        "group/sidebar relative z-30 overflow-visible",
        mobile ? "h-full" : "sticky top-0 h-full self-start",
        compact ? "w-[68px]" : "w-[clamp(180px,37px+11.2vw,252px)]",
        mobile ? "w-[286px]" : "",
      )}
    >
      <aside className="erp-sidebar relative flex h-full flex-col border-r border-[#2a3158] bg-[#171c34] text-white">
        {mobile ? (
          <div className="flex items-center justify-end px-3 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-[#2b3672] hover:text-white"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close menu"
            >
              <ChevronsLeftRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        <div
          ref={sidebarScrollRef}
          className="transient-scrollbar min-h-0 flex-1 overflow-y-auto"
          // The shared .transient-scrollbar class reserves gutter space on the right only,
          // which pushes the icon column off-center in the narrow collapsed rail. Reserving
          // the gutter on both edges here (inline, so it wins the cascade) keeps icons
          // centered whether or not the list scrolls.
          style={compact ? { scrollbarGutter: "stable both-edges" } : undefined}
        >
          <nav className={cn(mobile ? "py-1.5" : "py-2", compact ? "px-2" : "px-2.5")}>
            {menuItems.map((item) => {
              const childPaths = item.children?.flatMap((child) => [child.path, child.createPath]) ?? [];
              const expanded = item.children ? isGroupExpanded(item.label) : false;
              const active = item.path ? matchesSidebarPath(item.path, item.createPath) : childPaths.some((path) => matchesSidebarPath(path));

              if (item.children?.length) {
                if (compact) {
                  return (
                    <div key={item.label} className="mb-2">
                      <button
                        type="button"
                        title={item.label}
                        aria-label={item.label}
                        className={cn(
                          "flex h-14 w-full items-center justify-center rounded-2xl transition-colors",
                          active ? navRowActiveClass : navRowHoverClass,
                        )}
                        onClick={toggleSidebar}
                      >
                        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", active ? navRowIconActiveClass : navRowIconIdleClass)}>
                          <item.icon className="h-4 w-4 shrink-0 text-white" />
                        </div>
                      </button>
                    </div>
                  );
                }

                const childItems = item.children;
                return (
                  <div key={item.label} className="mb-1 space-y-1.5">
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-xl px-[clamp(7px,3px+0.31vw,10px)] py-[clamp(4px,2px+0.2vw,6px)] text-left text-[clamp(10.5px,7.5px+0.23vw,12.5px)] font-medium leading-tight transition-colors",
                        expanded || active ? cn(navRowActiveClass, navRowActiveTextClass) : cn("text-white hover:text-white", navRowHoverClass),
                      )}
                      onClick={() => setOpenGroupLabel((current) => (current === item.label ? null : item.label))}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-[clamp(6px,3px+0.24vw,10px)]">
                        <div className={cn("flex h-[clamp(28px,22px+0.52vw,32px)] w-[clamp(28px,22px+0.52vw,32px)] shrink-0 items-center justify-center rounded-lg transition-colors", expanded || active ? navRowIconActiveClass : navRowIconIdleClass)}>
                          <item.icon className="h-[clamp(13px,9px+0.31vw,16px)] w-[clamp(13px,9px+0.31vw,16px)] shrink-0 text-white" />
                        </div>
                        <span className="min-w-0 flex-1 truncate whitespace-nowrap">{item.label}</span>
                      </span>
                      {renderEndIcon("arrow", expanded)}
                    </button>
                    <div
                      aria-hidden={!expanded}
                      className={cn(
                        "grid overflow-hidden transition-all duration-300 ease-out",
                        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                      )}
                    >
                      <div
                        className={cn(
                          "min-h-0 overflow-hidden pl-5 transition-transform duration-300 ease-out",
                          expanded ? "translate-y-0 pt-0.5" : "-translate-y-1",
                        )}
                      >
                        <div className="relative space-y-1 pl-3 before:absolute before:left-[5px] before:top-0 before:h-[calc(100%-18px)] before:w-px before:bg-[#f59e0b]/70">
                          {childItems.map((child, childIndex) => {
                            const nestedGroupKey = `${item.label}:${child.label}`;
                            const childHasCurrentDescendant = child.children?.some((grandchild) =>
                              matchesSidebarPath(grandchild.path, grandchild.createPath),
                            ) ?? false;
                            const childIsCurrentPage =
                              !child.children?.length && item.label !== "Reports" && matchesSidebarPath(child.path, child.createPath);
                            const childActive = childIsCurrentPage || childHasCurrentDescendant;
                            const nestedExpanded = child.children?.length ? openNestedGroupLabel === nestedGroupKey : false;
                            const isLastChild = childIndex === childItems.length - 1;

                            if (child.children?.length) {
                              const grandchildItems = child.children;
                              return (
                                <div
                                  key={child.label}
                                  className={cn(
                                    "relative space-y-1 before:absolute before:-left-3 before:top-[18px] before:h-px before:w-3 before:bg-[#f59e0b]/70 after:absolute after:-left-[14px] after:top-[18px] after:h-1.5 after:w-1.5 after:-translate-y-1/2 after:rounded-full after:bg-[#f59e0b]",
                                    isLastChild ? "shadow-[0_-18px_0_-17px_rgba(255,255,255,0.18)]" : "",
                                  )}
                                >
                                  <button
                                    type="button"
                                    className={cn(
                                      "flex w-full items-center justify-between gap-1.5 rounded-xl px-2 py-[clamp(4px,2px+0.2vw,6px)] text-[clamp(10px,6.5px+0.31vw,12.5px)] font-medium transition-colors",
                                      childHasCurrentDescendant
                                        ? cn(navRowActiveClass, navRowActiveTextClass)
                                        : cn("text-white/96 hover:text-white", navRowHoverClass),
                                    )}
                                    onClick={() => setOpenNestedGroupLabel((current) => (current === nestedGroupKey ? null : nestedGroupKey))}
                                  >
                                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                      <span
                                        className={cn(
                                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl",
                                          childHasCurrentDescendant ? navRowIconActiveClass : navRowIconIdleClass,
                                        )}
                                      >
                                        <child.icon className="h-4 w-4 shrink-0 text-white" />
                                      </span>
                                      <span className="whitespace-nowrap">{child.label}</span>
                                    </span>
                                    {renderEndIcon("arrow", nestedExpanded)}
                                  </button>
                                  <div
                                    aria-hidden={!nestedExpanded}
                                    className={cn(
                                      "grid overflow-hidden transition-all duration-300 ease-out",
                                      nestedExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "min-h-0 overflow-hidden pl-2 transition-transform duration-300 ease-out",
                                        nestedExpanded ? "translate-y-0" : "-translate-y-1",
                                      )}
                                    >
                                      <div className="relative space-y-1 pl-3 before:absolute before:left-[5px] before:top-0 before:h-[calc(100%-18px)] before:w-px before:bg-[#f59e0b]/70">
                                        {grandchildItems.map((grandchild, grandchildIndex) => {
                                          const grandchildActive = matchesSidebarPath(grandchild.path, grandchild.createPath);
                                          const isLastGrandchild = grandchildIndex === grandchildItems.length - 1;
                                          return (
                                            <div
                                              key={grandchild.label}
                                              className={cn(
                                                "group relative flex items-center gap-1.5 rounded-2xl px-2 py-[clamp(7px,4px+0.31vw,10px)] text-[clamp(9px,5.5px+0.31vw,11.5px)] font-medium transition-colors before:absolute before:-left-3 before:top-1/2 before:h-px before:w-3 before:bg-[#f59e0b]/70 after:absolute after:-left-[14px] after:top-1/2 after:h-1.5 after:w-1.5 after:-translate-y-1/2 after:rounded-full after:bg-[#f59e0b]",
                                                grandchildActive
                                                  ? "bg-[#394178] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                                                  : "text-white/92 hover:bg-[#283160] hover:text-white",
                                                isLastGrandchild
                                                  ? "shadow-[0_-18px_0_-17px_rgba(255,255,255,0.22)]"
                                                  : "",
                                              )}
                                            >
                                              <Link
                                                href={grandchild.path}
                                                tabIndex={nestedExpanded ? 0 : -1}
                                                className="button-effect-off flex min-w-0 flex-1 items-center gap-1.5 focus-visible:shadow-none focus-visible:outline-none"
                                                onClick={() => {
                                                  setCreateMenuOpen(false);
                                                  setMobileNavOpen(false);
                                                }}
                                              >
                                                <span
                                                  className={cn(
                                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                                                    grandchildActive ? navRowIconActiveClass : navRowIconIdleClass,
                                                  )}
                                                >
                                                  <grandchild.icon className="h-3.5 w-3.5 shrink-0 text-white" />
                                                </span>
                                                <span className="min-w-0 flex-1 whitespace-nowrap">{grandchild.label}</span>
                                              </Link>
                                              {grandchild.end === "plus" && grandchild.createPath ? (
                                                <button
                                                  type="button"
                                                  aria-label={`Add ${grandchild.label}`}
                                                  tabIndex={nestedExpanded ? 0 : -1}
                                                  className="button-effect-off flex h-[clamp(24px,16px+0.63vw,30px)] w-[clamp(24px,16px+0.63vw,30px)] shrink-0 items-center justify-center rounded-full text-white transition hover:bg-[#f59e0b]/25 focus-visible:shadow-none focus-visible:outline-none"
                                                  onClick={() => handleCreateNavigation(grandchild.createPath!)}
                                                >
                                                  <Plus className="h-4 w-4" />
                                                </button>
                                              ) : (
                                                <span className="flex h-[clamp(24px,16px+0.63vw,30px)] w-[clamp(24px,16px+0.63vw,30px)] shrink-0 items-center justify-center text-white">{renderEndIcon(grandchild.end)}</span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={child.label}
                                className={cn(
                                  "group relative flex items-center gap-1.5 rounded-xl px-2 py-[clamp(4px,2px+0.2vw,6px)] text-[clamp(10px,6.5px+0.31vw,12.5px)] font-medium transition-colors before:absolute before:-left-3 before:top-1/2 before:h-px before:w-3 before:bg-[#f59e0b]/70 after:absolute after:-left-[14px] after:top-1/2 after:h-1.5 after:w-1.5 after:-translate-y-1/2 after:rounded-full after:bg-[#f59e0b]",
                                  childActive
                                    ? cn(navRowActiveClass, navRowActiveTextClass)
                                    : cn("text-white/96 hover:text-white", navRowHoverClass),
                                  isLastChild ? "shadow-[0_-18px_0_-17px_rgba(255,255,255,0.18)]" : "",
                                )}
                              >
                                <Link
                                  href={child.path ?? buildWorkspaceRoute(mode, "/dashboard")}
                                  tabIndex={expanded ? 0 : -1}
                                  className="button-effect-off flex min-w-0 flex-1 items-center gap-1.5 focus-visible:shadow-none focus-visible:outline-none"
                                  onClick={() => {
                                    setCreateMenuOpen(false);
                                    setMobileNavOpen(false);
                                  }}
                                >
                                  <span
                                    className={cn(
                                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl",
                                      childActive ? navRowIconActiveClass : navRowIconIdleClass,
                                    )}
                                  >
                                    <child.icon className="h-4 w-4 shrink-0 text-white" />
                                  </span>
                                  <span className="min-w-0 flex-1 whitespace-nowrap">{child.label}</span>
                                </Link>
                                {child.end === "plus" && child.createPath ? (
                                  <button
                                    type="button"
                                    aria-label={`Add ${child.label}`}
                                    tabIndex={expanded ? 0 : -1}
                                    className="button-effect-off flex h-[clamp(24px,16px+0.63vw,30px)] w-[clamp(24px,16px+0.63vw,30px)] shrink-0 items-center justify-center rounded-full text-white transition hover:bg-[#f59e0b]/25 focus-visible:shadow-none focus-visible:outline-none"
                                    onClick={() => handleCreateNavigation(child.createPath!)}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <span className="flex h-[clamp(24px,16px+0.63vw,30px)] w-[clamp(24px,16px+0.63vw,30px)] shrink-0 items-center justify-center text-white">{renderEndIcon(child.end)}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={item.label} className="mb-1">
                  <div
                    className={cn(
                      "relative flex items-center gap-2 rounded-xl pr-2 transition-colors",
                      compact ? "justify-center px-0 pr-0" : "",
                      active ? navRowActiveClass : navRowHoverClass,
                    )}
                  >
                    <Link
                      href={item.path ?? buildWorkspaceRoute(mode, "/dashboard")}
                      title={compact ? item.label : undefined}
                      className={cn(
                        "button-effect-off flex min-w-0 flex-1 items-center text-[clamp(10.5px,7.5px+0.23vw,12.5px)] leading-tight focus-visible:shadow-none focus-visible:outline-none",
                        active ? navRowActiveTextClass : "font-medium text-white",
                        compact
                          ? "justify-center px-0 py-[clamp(4px,2px+0.2vw,6px)]"
                          : "gap-[clamp(6px,3px+0.24vw,10px)] px-[clamp(7px,3px+0.31vw,10px)] py-[clamp(4px,2px+0.2vw,6px)]",
                      )}
                      onClick={() => {
                        setCreateMenuOpen(false);
                        setMobileNavOpen(false);
                      }}
                    >
                      <div className={cn("flex h-[clamp(28px,22px+0.52vw,32px)] w-[clamp(28px,22px+0.52vw,32px)] shrink-0 items-center justify-center rounded-lg transition-colors", active ? navRowIconActiveClass : navRowIconIdleClass)}>
                        <item.icon className="h-[clamp(13px,9px+0.31vw,16px)] w-[clamp(13px,9px+0.31vw,16px)] shrink-0 text-white" />
                      </div>
                      {!compact ? (
                        <>
                          <span className="min-w-0 flex-1 truncate whitespace-nowrap">{item.label}</span>
                        </>
                      ) : null}
                    </Link>
                    {!compact && item.end === "plus" && item.createPath ? (
                      <button
                        type="button"
                        aria-label={`Add ${item.label}`}
                        className="button-effect-off flex h-[clamp(26px,18px+0.63vw,32px)] w-[clamp(26px,18px+0.63vw,32px)] shrink-0 items-center justify-center rounded-full text-white transition hover:bg-[#f59e0b]/25 focus-visible:shadow-none focus-visible:outline-none"
                        onClick={() => handleCreateNavigation(item.createPath!)}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    ) : !compact && item.label !== "Reports" ? (
                      <div className="flex h-[clamp(26px,18px+0.63vw,32px)] w-[clamp(26px,18px+0.63vw,32px)] shrink-0 items-center justify-center text-white">{renderEndIcon(item.end)}</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>
        <div className={cn("px-2.5 pt-2", mobile ? "pb-2" : "pb-4")}>
          {!compact ? (
            <Link
              href={subscriptionHref}
              className={cn(
                "block overflow-hidden border border-[#3c4778] bg-[#20284d] shadow-[0_8px_20px_rgba(11,18,44,0.16)] transition hover:border-[#5b6698] hover:bg-[#27315d]",
                mobile ? "mb-2 rounded-xl" : "mb-3 rounded-xl",
              )}
              onClick={() => {
                setCreateMenuOpen(false);
                setMobileNavOpen(false);
              }}
            >
              <div className={cn("flex items-center gap-2", mobile ? "px-2.5 py-2.5" : "px-2.5 py-2.5")}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#403817] text-[#ffd34f] ring-1 ring-[#746327]/70">
                  <Crown className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />
                </span>
                <div
                  className={cn(
                    "min-w-0 flex-1 truncate whitespace-nowrap font-semibold text-white",
                    mobile ? "text-[11px]" : "text-[10.5px]",
                  )}
                >
                  {subscriptionCardTitle}{!isTrialPlan ? <><span className="text-[#8794ad]"> · </span><span className="text-[#38d276]">Active ✓</span></> : null}
                </div>
                <div className="hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      isTrialPlan ? "bg-[linear-gradient(90deg,#ff8a1a_0%,#f26b0f_100%)]" : "bg-[linear-gradient(90deg,#22c55e_0%,#16a34a_100%)]",
                    )}
                    style={{ width: `${trialProgress}%` }}
                  />
                </div>
              </div>
              <div
                className={cn(
                  "hidden items-center justify-between gap-2 bg-[#232a52] text-[#ffd76b]",
                  mobile ? "px-3 py-2" : "px-[clamp(10px,4px+0.63vw,16px)] py-[clamp(6px,3px+0.31vw,10px)]",
                )}
              >
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-2 truncate whitespace-nowrap font-semibold [&>span:nth-of-type(2)]:hidden",
                    mobile ? "text-[clamp(11px,7.5px+0.31vw,13.5px)]" : "text-[clamp(10px,7px+0.31vw,13px)]",
                  )}
                >
                  <span className="flex h-[clamp(20px,16px+0.16vw,24px)] w-[clamp(20px,16px+0.16vw,24px)] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#ffd76b_0%,#e99a08_100%)] text-[#3b2a05] shadow-[0_2px_8px_rgba(246,179,35,0.35)] ring-1 ring-[#ffe59a]/70">
                    <Crown className="h-[70%] w-[70%]" strokeWidth={2.4} aria-hidden="true" />
                  </span>
                  <span className="flex h-[clamp(18px,14px+0.16vw,24px)] w-[clamp(18px,14px+0.16vw,24px)] shrink-0 items-center justify-center rounded-full bg-[#f6b323] text-[#fff8e8]">▼</span>
                  <span className="truncate">{subscriptionCardCta}</span>
                </div>
                <ChevronRight className={cn("shrink-0", mobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
              </div>
            </Link>
          ) : null}
          {!compact ? (
            <Link
              href={companyProfileHref}
              className={cn(
                "group flex items-center gap-2.5 rounded-2xl text-white transition hover:bg-[#2b3672] hover:text-white",
                mobile ? "px-2.5 py-2" : "px-3 py-2.5",
              )}
              onClick={() => {
                setCreateMenuOpen(false);
                setMobileNavOpen(false);
              }}
            >
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-white/10",
                  mobile ? "h-8 w-8" : "h-9 w-9",
                )}
              >
                {companyLogoSrc ? (
                  <img src={companyLogoSrc} alt={displayCompanyName} className="h-full w-full object-cover" />
                ) : (
                  <Image src="/site-logo.png" alt="Bizovix" width={36} height={36} className="h-full w-full object-contain" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn("truncate font-semibold text-white", mobile ? "text-[clamp(11px,7.5px+0.31vw,13.5px)]" : "text-[clamp(12px,9px+0.31vw,15px)]")}>{displayCompanyName}</div>
              </div>
              <div className={cn("flex shrink-0 items-center justify-center rounded-full text-white/90 transition group-hover:bg-[#f59e0b]/25", mobile ? "h-7 w-7" : "h-8 w-8")}>
                <ChevronRight className={cn(mobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
              </div>
            </Link>
          ) : (
            <Link
              href={companyProfileHref}
              title={companyName}
              className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] text-sm font-semibold text-white transition hover:bg-[#2b3672]"
              onClick={() => {
                setCreateMenuOpen(false);
                setMobileNavOpen(false);
              }}
            >
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white">
                {companyLogoSrc ? (
                  <img src={companyLogoSrc} alt={displayCompanyName} className="h-full w-full object-cover" />
                ) : (
                  <Image src="/site-logo.png" alt="Bizovix" width={36} height={36} className="h-full w-full object-contain" />
                )}
              </span>
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}
