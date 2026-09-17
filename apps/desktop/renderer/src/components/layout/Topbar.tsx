"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Headphones, Menu, MessageCircle, Plus, Search } from "lucide-react";
import { cn } from "@bizovix/ui";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@bizovix/api-client";
import type { NotificationRecord } from "@bizovix/types";
import { ShortcutCenter } from "./ShortcutCenter";
import { SupportCenterDrawer } from "./SupportCenterDrawer";

export interface TopbarUser {
  name: string;
  roleName: string;
  avatarUrl?: string | null;
}

export interface TopbarProps {
  user: TopbarUser;
  onToggleSidebar: () => void;
  showWhatsApp?: boolean;
}

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-biz-danger",
  HIGH: "bg-biz-orange",
  MEDIUM: "bg-biz-blue",
  LOW: "bg-biz-muted",
};

const SUPPORT_WHATSAPP_URL = "https://wa.me/8801700000000";

function timeAgo(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function Topbar({ onToggleSidebar, showWhatsApp = true }: TopbarProps) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [supportOpen, setSupportOpen] = React.useState(false);
  const [supportTicketId, setSupportTicketId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"all" | "unread">("all");
  const closeSupport = React.useCallback(() => { setSupportOpen(false); setSupportTicketId(null); }, []);

  const unreadCount = useUnreadNotificationCount();
  const notifications = useNotifications({ limit: 8, isRead: tab === "unread" ? false : undefined });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  React.useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  function openNotification(item: NotificationRecord) {
    if (!item.isRead) markRead.mutate(item.id);
    setNotifOpen(false);
    if (item.sourceModule === "SUPPORT" && item.sourceId) {
      setSupportTicketId(item.sourceId);
      setSupportOpen(true);
      return;
    }
    router.push(item.reminderId ? `/reminders?open=${item.reminderId}` : "/reminders");
  }

  return (
    <header className="relative flex h-7 shrink-0 items-center border-b border-biz-border bg-white px-3 shadow-[0_1px_3px_rgba(13,27,62,0.04)] sm:px-4 print:hidden">
      <div className="flex w-[204px] shrink-0 items-center gap-2">
        <div className="flex items-center gap-1.5" aria-label="Bizovix Contractor ERP">
          <span className="text-[16px] font-black leading-none text-biz-blue">X</span>
          <span className="whitespace-nowrap leading-none">
            <span className="block text-[10px] font-extrabold leading-[10px] text-biz-blue">BIZOVIX</span>
            <span className="block text-center text-[9px] font-bold leading-[10px] text-biz-navy">Contractor ERP</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-biz-navy hover:bg-biz-bg"
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <Menu className="h-3.5 w-3.5" />
        </button>
        <ShortcutCenter />
      </div>

      <div className="hidden min-w-0 flex-1 items-center md:flex">
          <div
            className={cn(
              "relative flex h-6 shrink-0 items-center transition-all duration-300 ease-out",
              searchOpen ? "w-[290px]" : "w-10",
            )}
          >
            {!searchOpen && (
              <span className="pointer-events-none absolute inset-0 rounded-full bg-biz-blue/15 shadow-[0_0_0_0_rgba(0,79,255,0.28)] animate-ping" />
            )}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={cn(
                "absolute left-0 top-0 z-10 flex h-6 w-10 items-center justify-center rounded-full transition duration-300",
                searchOpen
                  ? "text-biz-blue"
                  : "border border-biz-blue/15 bg-[#F3F7FF] text-biz-blue shadow-[0_6px_18px_rgba(0,79,255,0.12)] hover:bg-biz-blue hover:text-white",
              )}
              aria-label="Open search"
              title="Search"
            >
              <Search className={cn("h-4 w-4 transition-transform duration-300", !searchOpen && "animate-pulse")} />
            </button>
            <input
              ref={searchInputRef}
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onBlur={() => {
                if (!searchValue) setSearchOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchValue("");
                  setSearchOpen(false);
                }
              }}
              placeholder="Search anything..."
              className={cn(
                "h-6 rounded-full border bg-white pl-10 pr-4 text-[10px] font-medium text-biz-text outline-none shadow-[0_8px_22px_rgba(13,27,62,0.08)] transition-all duration-300 placeholder:text-biz-muted focus:border-biz-blue",
                searchOpen ? "w-full border-biz-blue/30 opacity-100" : "w-10 cursor-pointer border-transparent opacity-0",
              )}
            />
          </div>
      </div>

      <div className="absolute left-1/2 hidden h-7 -translate-x-1/2 items-center whitespace-nowrap xl:flex">
        <span className="text-[11px] font-semibold text-biz-navy/75">Need Help?</span>
        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open Bizovix support chat in WhatsApp"
          title="Chat with Bizovix Support on WhatsApp"
          className="ml-2 inline-flex h-6 items-center gap-1 rounded px-1 text-[11px] font-semibold text-[#128C4A] transition-colors hover:bg-emerald-50 hover:text-[#075E35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          WhatsApp
        </a>
        <span className="mx-2 h-3.5 w-px bg-biz-border" aria-hidden="true" />
        <button
          type="button"
          onClick={() => { setSupportTicketId(null); setSupportOpen(true); }}
          className="inline-flex h-6 items-center gap-1 rounded px-1 text-[11px] font-semibold text-biz-navy hover:bg-biz-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue/40"
          title="Bizovix Support Center"
        >
          <Headphones className="h-3.5 w-3.5 text-biz-muted" aria-hidden="true" />
          Support Center
        </button>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
        <button type="button" onClick={() => { setSupportTicketId(null); setSupportOpen(true); }} className="flex h-6 w-6 items-center justify-center rounded-sm text-biz-navy hover:bg-biz-bg xl:hidden" aria-label="Support Center" title="Support Center"><Headphones className="h-3.5 w-3.5" /></button>
        <div className={cn("hidden items-center gap-2 md:flex", !showWhatsApp && "md:hidden")}>
          <Link
            href="/tenders?addTender=1"
            className="flex h-6 items-center gap-1 rounded-md bg-biz-orange px-2 text-[9px] font-bold text-white shadow-card hover:bg-biz-orange/90"
          >
            <Plus className="h-3 w-3" />
            Add Tender
          </Link>
          <Link
            href="/expenses"
            className="flex h-6 items-center gap-1 rounded-md bg-biz-blue px-2 text-[9px] font-bold text-white shadow-card hover:bg-biz-blue-dark"
          >
            <Plus className="h-3 w-3" />
            Add Expense
          </Link>
        </div>
        <span className={cn("hidden h-5 w-px bg-biz-border xl:block", !showWhatsApp && "xl:hidden")} />
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className="relative flex h-6 w-6 items-center justify-center rounded-sm text-biz-navy hover:bg-biz-bg"
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell className="h-3.5 w-3.5" />
            {(unreadCount.data?.count ?? 0) > 0 && (
              <span className="absolute right-0 top-0 flex h-3 min-w-3 items-center justify-center rounded-full bg-biz-orange px-0.5 text-[7px] font-bold text-white">
                {unreadCount.data?.count}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] rounded-md border border-biz-border bg-white shadow-card-hover">
                <div className="flex items-center justify-between border-b border-biz-border px-3 py-2.5">
                  <span className="text-[12px] font-bold text-biz-navy">Notifications</span>
                  <button
                    type="button"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending || !(unreadCount.data?.count ?? 0)}
                    className="flex items-center gap-1 text-[10px] font-semibold text-biz-blue hover:underline disabled:opacity-40 disabled:no-underline"
                  >
                    <Check className="h-3 w-3" />
                    Mark all as read
                  </button>
                </div>
                <div className="flex gap-1 border-b border-biz-border px-3 py-2">
                  {(["all", "unread"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize",
                        tab === t ? "bg-biz-blue text-white" : "text-biz-muted hover:bg-biz-bg",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.isLoading ? (
                    <p className="p-6 text-center text-[11px] text-biz-muted">Loading...</p>
                  ) : !notifications.data?.items.length ? (
                    <p className="p-6 text-center text-[11px] text-biz-muted">No new notifications.</p>
                  ) : (
                    notifications.data.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openNotification(item)}
                        className={cn(
                          "flex w-full items-start gap-2.5 border-b border-biz-border px-3 py-2.5 text-left last:border-0 hover:bg-biz-bg",
                          !item.isRead && "bg-biz-blue-soft/40",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                            item.isRead ? "bg-transparent" : (PRIORITY_DOT[item.priority] ?? "bg-biz-blue"),
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-bold text-biz-navy">{item.title}</span>
                          <span className="block truncate text-[10px] text-biz-muted">{item.message}</span>
                          <span className="mt-0.5 block text-[9px] text-biz-muted">{timeAgo(item.createdAt)}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
                <Link
                  href="/reminders"
                  onClick={() => setNotifOpen(false)}
                  className="block border-t border-biz-border px-3 py-2 text-center text-[11px] font-semibold text-biz-blue hover:bg-biz-bg"
                >
                  View All Notifications
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
      {supportOpen && <SupportCenterDrawer key={supportTicketId ?? "new"} open onClose={closeSupport} ticketId={supportTicketId} />}
    </header>
  );
}
