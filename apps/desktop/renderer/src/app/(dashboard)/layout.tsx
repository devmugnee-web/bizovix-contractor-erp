"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { tokenStorage, useDashboard, useMe } from "@bizovix/api-client";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { BreadcrumbProvider, useBreadcrumbContext } from "@/components/providers/BreadcrumbContext";

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
        showWhatsApp={
          !pathname.startsWith("/bank-instruments/pg-bg") &&
          !pathname.startsWith("/cms") &&
          !pathname.startsWith("/expenses/project-expense")
        }
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          remindersCount={remindersCount}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
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
