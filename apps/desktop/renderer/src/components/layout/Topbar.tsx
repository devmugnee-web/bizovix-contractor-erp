"use client";

import * as React from "react";
import { Building2, CircleHelp, Headphones, RefreshCw, ShieldCheck, Tag, Zap } from "lucide-react";
import { Breadcrumb, type BreadcrumbItem } from "@bizovix/ui";

export interface TopbarUser {
  name: string;
  roleName: string;
  avatarUrl?: string | null;
}

export interface TopbarProps {
  breadcrumb?: BreadcrumbItem[];
  user?: TopbarUser;
  notificationCount?: number;
  onToggleSidebar?: () => void;
}

export function Topbar({ breadcrumb }: TopbarProps) {
  return (
    <header className="flex h-[30px] shrink-0 items-center justify-between border-b border-biz-border bg-biz-surface px-3 shadow-[0_1px_0_rgba(13,27,62,0.03)]">
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <div className="flex shrink-0 items-center gap-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-biz-blue-soft text-[16px] font-extrabold leading-none text-biz-blue">
            X
          </span>
          <span className="text-[11px] font-extrabold text-biz-navy">Bizovix</span>
          <span className="hidden rounded-full bg-biz-bg px-2 py-0.5 text-[9px] font-semibold text-biz-muted sm:inline-flex">
            Tender ERP
          </span>
        </div>

        <nav className="hidden items-center gap-4 text-[10px] font-semibold text-biz-muted md:flex">
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            Company
          </span>
          <span className="inline-flex items-center gap-1">
            <CircleHelp className="h-3 w-3" />
            Help
          </span>
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3 w-3" />
            Versions
          </span>
          <span className="inline-flex items-center gap-1 text-biz-success">
            <ShieldCheck className="h-3 w-3" />
            Secure Session
          </span>
          <RefreshCw className="h-3 w-3 text-biz-muted" />
        </nav>

        {breadcrumb && <Breadcrumb items={breadcrumb} className="min-w-0 flex-1 text-[12px]" />}
      </div>

      <div className="flex shrink-0 items-center gap-4 pl-4 text-[10px] font-semibold text-biz-muted">
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-biz-success-soft text-biz-success">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.2-.1-.4-.1-.6.1-.2.2-.6.9-.8 1-.2.2-.3.2-.6.1-.9-.4-1.9-1-2.7-1.9-.7-.8-1.2-1.7-1.5-2.2-.1-.2 0-.4.1-.5.1-.1.5-.6.6-.8.1-.2.1-.4 0-.6-.1-.2-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4-.2.3-.9 1-.9 2.3 0 1.3.9 2.6 1.1 2.8.2.2 1.7 2.6 4.1 3.6 2.4 1 2.4.7 2.8.6.4-.1 1.3-.5 1.5-1 .2-.5.2-.9.1-1z" />
            </svg>
          </span>
          <span>WhatsApp Chat Support (+880) 1700 000000</span>
        </div>
        <span className="hidden items-center gap-1 sm:inline-flex">
          <Headphones className="h-3 w-3 text-biz-blue" />
          Tender Support
        </span>
        <span className="hidden items-center gap-1 lg:inline-flex">
          <Zap className="h-3 w-3" />
          Get Instant Online Support
        </span>
      </div>
    </header>
  );
}
