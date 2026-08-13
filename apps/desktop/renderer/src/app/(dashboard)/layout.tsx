"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, FilePlus2, Plus, Search } from "lucide-react";
import { tokenStorage, useDashboard, useMe } from "@bizovix/api-client";
import { TextInput } from "@bizovix/ui";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { BreadcrumbProvider, useBreadcrumbContext } from "@/components/providers/BreadcrumbContext";

function ActionToolbar({ notificationCount }: { notificationCount: number }) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-biz-border bg-gradient-to-r from-white via-white to-biz-bg px-3 shadow-sm">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {searchOpen ? (
          <TextInput
            ref={searchInputRef}
            icon={Search}
            placeholder="Search anything..."
            className="h-8 w-full max-w-[320px] rounded-full"
            onBlur={() => setSearchOpen(false)}
          />
        ) : (
          <button
            type="button"
            aria-label="Open search"
            onClick={() => setSearchOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-biz-blue text-white shadow-sm ring-4 ring-biz-blue-soft transition-colors hover:bg-biz-blue-hover"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link href="/cms" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-biz-orange px-3 text-[11px] font-bold text-white shadow-sm hover:brightness-95">
          <FilePlus2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Tender</span>
          <span className="sm:hidden">Tender</span>
        </Link>
        <Link href="/expenses" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-biz-blue px-3 text-[11px] font-bold text-white shadow-sm hover:bg-biz-blue-hover">
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Expense</span>
          <span className="sm:hidden">Expense</span>
        </Link>
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-full border border-biz-border bg-biz-surface text-biz-muted shadow-sm hover:bg-biz-bg hover:text-biz-text"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {notificationCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-biz-orange px-1 text-[9px] font-semibold text-white">
              {notificationCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const dashboard = useDashboard();
  const { breadcrumb } = useBreadcrumbContext();

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
        breadcrumb={breadcrumb ?? undefined}
        notificationCount={remindersCount}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar remindersCount={remindersCount} />
        <div className="flex min-w-0 flex-1 flex-col">
          <ActionToolbar notificationCount={remindersCount} />
          <main className="flex-1 overflow-y-auto bg-biz-bg p-6">{children}</main>
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
