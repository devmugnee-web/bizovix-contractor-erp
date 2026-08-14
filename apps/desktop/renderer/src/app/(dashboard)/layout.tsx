"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FilePlus2, Plus, Settings } from "lucide-react";
import { tokenStorage, useDashboard, useMe } from "@bizovix/api-client";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { BreadcrumbProvider, useBreadcrumbContext } from "@/components/providers/BreadcrumbContext";
import { getGreeting } from "@/lib/greeting";

function ActionToolbar({ userName }: { userName: string }) {
  return (
    <div className="flex min-h-[62px] shrink-0 items-center justify-between gap-3 border-b border-biz-border bg-white px-4 py-2 sm:px-5">
      <div className="min-w-0">
        <h1 className="truncate text-[14px] font-bold text-biz-navy">{getGreeting()}, {userName} <span aria-hidden="true">👋</span></h1>
        <p className="mt-0.5 hidden text-[9px] text-biz-muted sm:block">Here&apos;s what&apos;s happening with your business today.</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link href="/cms" className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-biz-orange px-3 text-[10px] font-bold text-white shadow-sm hover:brightness-95">
          <FilePlus2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Tender</span>
          <span className="sm:hidden">Tender</span>
        </Link>
        <Link href="/expenses" className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-biz-blue px-3 text-[10px] font-bold text-white shadow-sm hover:bg-biz-blue-hover">
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Expense</span>
          <span className="sm:hidden">Expense</span>
        </Link>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-biz-border bg-white text-biz-navy shadow-sm hover:bg-biz-bg"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const dashboard = useDashboard();
  const { breadcrumb } = useBreadcrumbContext();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    if (!tokenStorage.getAccessToken()) {
      router.replace("/login");
    }
  }, [router]);

  React.useEffect(() => {
    if (me.isError) {
      router.replace("/login");
    }
  }, [me.isError, router]);

  if (!tokenStorage.getAccessToken() || me.isLoading || !me.data) {
    return (
      <div className="flex h-screen items-center justify-center bg-biz-bg">
        <span className="text-[13px] text-biz-muted">Loading...</span>
      </div>
    );
  }

  const remindersCount = dashboard.data?.remindersCount ?? 0;

  return (
    <div className="flex h-screen flex-col">
      <Topbar
        user={me.data}
        notificationCount={remindersCount}
        onToggleSidebar={() => {
          if (window.matchMedia("(max-width: 767px)").matches) setMobileSidebarOpen((value) => !value);
          else setSidebarCollapsed((value) => !value);
        }}
        breadcrumb={breadcrumb ?? undefined}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar remindersCount={remindersCount} collapsed={sidebarCollapsed} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          {pathname === "/dashboard" && <ActionToolbar userName={me.data.name} />}
          <main className="flex-1 overflow-y-auto bg-biz-bg p-3 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <BreadcrumbProvider>
      <DashboardShell>{children}</DashboardShell>
    </BreadcrumbProvider>
  );
}
