"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { cn } from "@bizovix/ui";
import { REPORT_CATEGORIES } from "@/config/reports";

export function ReportNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const visible = REPORT_CATEGORIES.map((group) => ({
    ...group,
    reports: group.reports.filter((report) =>
      `${group.title} ${report.title}`.toLowerCase().includes(search.toLowerCase()),
    ),
  })).filter((group) => group.reports.length);

  return (
    <div className="flex min-h-[calc(100vh-110px)] flex-col overflow-hidden rounded-lg border border-blue-100 bg-white shadow-card md:flex-row print:block print:border-0 print:shadow-none">
      <aside className={cn("w-full shrink-0 border-r border-blue-100 bg-white md:w-56 lg:w-64 print:hidden", open ? "block" : "hidden md:block")}>
        <div className="border-b border-blue-100 p-2">
          <label className="flex items-center gap-2 rounded-full border border-blue-200 px-2.5 py-1.5 text-slate-500">
            <Search className="h-3.5 w-3.5" />
            <input aria-label="Search reports" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports..." className="w-full bg-transparent text-xs outline-none" />
          </label>
        </div>
        <nav className="max-h-[calc(100vh-160px)] overflow-y-auto pb-3" aria-label="Report navigation">
          {visible.map((group, index) => (
            <div key={group.slug}>
              <Link href={`/reports/${group.slug}`} onClick={() => setOpen(false)} className="block bg-sky-100/80 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-sky-200/70">
                {index + 1}. {group.title}
              </Link>
              {group.reports.map((report) => {
                const href = `/reports/${group.slug}/${report.slug}`;
                return <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("block truncate border-l-2 py-2 pl-7 pr-3 text-sm text-slate-700 hover:bg-blue-50", pathname === href ? "border-blue-500 bg-blue-100 font-semibold" : "border-transparent")} title={report.title}>
                  <span className="mr-1 text-blue-300">•</span>{report.title}
                </Link>;
              })}
            </div>
          ))}
          {!visible.length && <p className="p-4 text-xs text-slate-500">No matching reports.</p>}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => setOpen((value) => !value)} className="m-2 inline-flex items-center gap-2 rounded border border-blue-200 px-2 py-1 text-xs text-slate-700 md:hidden print:hidden">
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />} Reports
        </button>
        <div className="p-2 sm:p-3">{children}</div>
      </div>
    </div>
  );
}
