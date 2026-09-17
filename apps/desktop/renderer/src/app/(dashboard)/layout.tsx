"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { tokenStorage, useDevLogin, useMe, useReminderStats, useSubscription } from "@bizovix/api-client";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { BreadcrumbProvider } from "@/components/providers/BreadcrumbContext";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const devAuthBypass = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";
  const devLogin = useDevLogin();
  const me = useMe();
  const reminderStats = useReminderStats();
  const subscription = useSubscription();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [devAuthAttempt, setDevAuthAttempt] = React.useState(0);
  const [devAuthFailed, setDevAuthFailed] = React.useState(false);
  const devLoginMutateAsync = devLogin.mutateAsync;

  React.useEffect(() => {
    if (!devAuthBypass || (tokenStorage.getAccessToken() && !me.isError)) return;
    let cancelled = false;
    let startTimer: number | undefined;

    async function createDevSession() {
      setDevAuthFailed(false);
      for (let attempt = 0; attempt < 30 && !cancelled; attempt += 1) {
        try {
          await devLoginMutateAsync();
          return;
        } catch {
          if (cancelled) return;
          if (attempt === 29) {
            setDevAuthFailed(true);
            return;
          }
          const retryDelay = Math.min(1_000 + attempt * 250, 3_000);
          await new Promise<void>((resolve) => window.setTimeout(resolve, retryDelay));
        }
      }
    }

    startTimer = window.setTimeout(() => void createDevSession(), 0);
    return () => {
      cancelled = true;
      if (startTimer !== undefined) window.clearTimeout(startTimer);
    };
  }, [devAuthAttempt, devAuthBypass, devLoginMutateAsync, me.isError]);

  React.useEffect(() => {
    if (!devAuthBypass && !tokenStorage.getAccessToken()) {
      router.replace("/login");
    }
  }, [devAuthBypass, router]);

  React.useEffect(() => {
    if (!devAuthBypass && me.isError) {
      router.replace("/login");
    }
  }, [devAuthBypass, me.isError, router]);

  if (devAuthBypass && devAuthFailed) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-biz-bg px-4 text-center">
        <p className="text-[13px] font-semibold text-biz-danger">Could not start the ERP server session.</p>
        <button
          type="button"
          onClick={() => {
            devLogin.reset();
            setDevAuthAttempt((attempt) => attempt + 1);
          }}
          className="h-9 rounded-md bg-biz-blue px-4 text-[12px] font-semibold text-white hover:bg-biz-blue-hover"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!tokenStorage.getAccessToken() || me.isLoading || !me.data) {
    return <div className="h-screen bg-biz-bg" aria-label="Starting ERP" />;
  }

  const activeRemindersCount = reminderStats.data
    ? reminderStats.data.dueToday + reminderStats.data.upcoming + reminderStats.data.overdue
    : 0;

  const trial =
    subscription.data && (subscription.data.status === "TRIALING" || subscription.data.status === "EXPIRED")
      ? {
          daysLeft: Math.max(0, subscription.data.trialDaysRemaining ?? 0),
          totalDays: subscription.data.trialDaysTotal ?? 30,
        }
      : null;

  return (
    <div className="flex h-screen flex-col print:block print:h-auto">
      <Topbar
        user={me.data}
        onToggleSidebar={() => {
          if (window.matchMedia("(max-width: 767px)").matches) setMobileSidebarOpen((value) => !value);
          else setSidebarCollapsed((value) => !value);
        }}
        showWhatsApp={
          !pathname.startsWith("/bank-instruments/pg-bg") &&
          !pathname.startsWith("/cms") &&
          !pathname.startsWith("/expenses/project-expense") &&
          !pathname.startsWith("/quotation-sales")
        }
      />
      <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
        <Sidebar
          remindersCount={activeRemindersCount}
          trial={trial}
          onUpgradeClick={() => router.push("/plan-billing")}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col print:block">
          <main className={`min-h-0 flex-1 overflow-y-auto bg-biz-bg p-2 sm:p-3 print:overflow-visible print:bg-white print:p-0 ${pathname === "/dashboard" ? "md:overflow-hidden" : pathname === "/cms/ongoing-works" ? "lg:overflow-hidden" : ""}`}>{children}</main>
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
