"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Menu, MessageCircle, Plus, Search } from "lucide-react";
import { Breadcrumb, cn, type BreadcrumbItem } from "@bizovix/ui";

export interface TopbarUser {
  name: string;
  roleName: string;
  avatarUrl?: string | null;
}

export interface TopbarProps {
  user: TopbarUser;
  notificationCount?: number;
  onToggleSidebar: () => void;
  breadcrumb?: BreadcrumbItem[];
  showWhatsApp?: boolean;
}

export function Topbar({ notificationCount = 0, onToggleSidebar, breadcrumb, showWhatsApp = true }: TopbarProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  return (
    <header className="relative flex h-14 shrink-0 items-center border-b border-biz-border bg-white px-3 shadow-[0_1px_3px_rgba(13,27,62,0.04)] sm:px-4">
      <div className="flex w-[204px] shrink-0 items-center gap-4">
        <div className="flex items-center gap-2" aria-label="Bizovix Contractor ERP">
          <span className="text-[26px] font-black leading-none text-biz-blue">X</span>
          <span className="leading-none">
            <span className="block text-[15px] font-extrabold text-biz-blue">BIZOVIX</span>
            <span className="block text-center text-[7px] font-semibold text-biz-blue">Contractor ERP</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-biz-navy hover:bg-biz-bg"
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      <div className="hidden min-w-0 flex-1 items-center md:flex">
        {breadcrumb?.length ? (
          <Breadcrumb items={breadcrumb} className="min-w-0 text-[11px]" />
        ) : (
          <div
            className={cn(
              "relative flex h-9 shrink-0 items-center transition-all duration-300 ease-out",
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
                "absolute left-0 top-0 z-10 flex h-9 w-10 items-center justify-center rounded-full transition duration-300",
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
                "h-9 rounded-full border bg-white pl-10 pr-4 text-[11px] font-medium text-biz-text outline-none shadow-[0_8px_22px_rgba(13,27,62,0.08)] transition-all duration-300 placeholder:text-biz-muted focus:border-biz-blue",
                searchOpen ? "w-full border-biz-blue/30 opacity-100" : "w-10 cursor-pointer border-transparent opacity-0",
              )}
            />
          </div>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
        <div className={cn("hidden items-center gap-2 md:flex", !showWhatsApp && "md:hidden")}>
          <Link
            href="/cms"
            className="flex h-8 items-center gap-1.5 rounded-md bg-biz-orange px-3 text-[10px] font-bold text-white shadow-card hover:bg-biz-orange/90"
          >
            <Plus className="h-3 w-3" />
            Add Tender
          </Link>
          <Link
            href="/expenses"
            className="flex h-8 items-center gap-1.5 rounded-md bg-biz-blue px-3 text-[10px] font-bold text-white shadow-card hover:bg-biz-blue-dark"
          >
            <Plus className="h-3 w-3" />
            Add Expense
          </Link>
        </div>
        <span className={cn("hidden h-7 w-px bg-biz-border xl:block", !showWhatsApp && "xl:hidden")} />
        <button type="button" className="relative flex h-8 w-8 items-center justify-center rounded-sm text-biz-navy hover:bg-biz-bg" aria-label="Notifications" title="Notifications">
          <Bell className="h-4 w-4" />
          {notificationCount > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-biz-orange px-1 text-[8px] font-bold text-white">
              {notificationCount}
            </span>
          )}
        </button>
        <div className={cn("hidden items-center gap-2 rounded-full border border-biz-success/15 bg-biz-success-soft/60 px-3 py-1.5 lg:flex", !showWhatsApp && "lg:hidden")}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-biz-success shadow-card">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-[10px] font-bold text-biz-navy">WhatsApp Support</span>
            <span className="block text-[9px] font-semibold text-biz-success">+880 1700 000000</span>
          </span>
        </div>
      </div>
    </header>
  );
}
