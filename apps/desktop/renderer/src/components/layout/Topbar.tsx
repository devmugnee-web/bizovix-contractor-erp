"use client";

import * as React from "react";
import Image from "next/image";
import { Bell, ChevronDown, CircleHelp, Menu, MessageCircle, Search } from "lucide-react";
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
  showHelp?: boolean;
}

export function Topbar({ user, notificationCount = 0, onToggleSidebar, breadcrumb, showWhatsApp = true, showHelp = true }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-biz-border bg-white px-3 shadow-[0_1px_3px_rgba(13,27,62,0.04)] sm:px-4">
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

      <div className="hidden min-w-0 flex-1 md:block">
        {breadcrumb?.length ? (
          <Breadcrumb items={breadcrumb} className="min-w-0 text-[11px]" />
        ) : (
        <label className="relative block max-w-[410px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-biz-muted" />
          <input
            type="search"
            placeholder="Search anything..."
            className="h-9 w-full rounded-sm border border-biz-border bg-biz-bg pl-9 pr-16 text-[11px] text-biz-text outline-none transition focus:border-biz-blue focus:bg-white"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-semibold text-biz-muted">Ctrl + K</span>
        </label>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
        <div className={cn("hidden items-center gap-2 xl:flex", !showWhatsApp && "xl:hidden")}>
          <MessageCircle className="h-5 w-5 text-biz-success" />
          <div className="leading-tight">
            <p className="text-[10px] font-bold text-biz-navy">WhatsApp Support</p>
            <p className="text-[9px] font-semibold text-biz-muted">+880 1700 000000</p>
          </div>
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
        {showHelp && <button type="button" className="flex h-8 w-8 items-center justify-center rounded-sm text-biz-navy hover:bg-biz-bg" aria-label="Help" title="Help"><CircleHelp className="h-4 w-4" /></button>}
        <span className="hidden h-7 w-px bg-biz-border sm:block" />
        <button type="button" className="flex items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-biz-bg" aria-label="Open profile menu">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-biz-navy text-[11px] font-bold text-white">
              {user.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="hidden leading-tight sm:block">
            <span className="block max-w-[120px] truncate text-[10px] font-bold text-biz-navy">{user.name}</span>
            <span className="block text-[9px] text-biz-muted">{user.roleName}</span>
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-biz-navy sm:block" />
        </button>
      </div>
    </header>
  );
}
