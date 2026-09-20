"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import type { LedgerAccountRecord } from "@bizovix/types";

const ROOT_TONES: Record<string, string> = {
  ASSET: "border-blue-200 bg-blue-50 text-blue-800",
  LIABILITY: "border-orange-200 bg-orange-50 text-orange-800",
  EQUITY: "border-violet-200 bg-violet-50 text-violet-800",
  EXPENSE: "border-rose-200 bg-rose-50 text-rose-800",
  INCOME: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export function ChartOfAccountsTree({ accounts, onAddLedger }: { accounts: LedgerAccountRecord[]; onAddLedger: (category: LedgerAccountRecord) => void }) {
  const [search, setSearch] = React.useState("");
  const [collapsed, setCollapsed] = React.useState<string[]>([]);
  const children = React.useMemo(() => {
    const map = new Map<string | null, LedgerAccountRecord[]>();
    for (const account of accounts) {
      const key = account.parentId && accounts.some((candidate) => candidate.id === account.parentId) ? account.parentId : null;
      map.set(key, [...(map.get(key) ?? []), account]);
    }
    for (const rows of map.values()) rows.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    return map;
  }, [accounts]);
  const term = search.trim().toLowerCase();
  const matches = (account: LedgerAccountRecord): boolean =>
    !term || `${account.code} ${account.name}`.toLowerCase().includes(term) ||
    (children.get(account.id) ?? []).some(matches);
  const roots = children.get(null) ?? [];
  const renderRow = (account: LedgerAccountRecord, depth: number): React.ReactNode => {
    if (!matches(account)) return null;
    const descendants = children.get(account.id) ?? [];
    const isCollapsed = !term && collapsed.includes(account.id);
    const isRoot = !account.parentId && account.isSystem && /^\d{7}$/.test(account.code);
    const isCategory = !!account.parentId && account.isSystem && /^\d{7}$/.test(account.code);
    return <React.Fragment key={account.id}>
      <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_85px_110px_70px] ${isRoot ? `border-t ${ROOT_TONES[account.accountType] ?? "bg-slate-50"}` : depth === 1 ? "bg-slate-50/70 font-semibold" : "bg-white"}`}>
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${Math.min(depth, 5) * 16}px` }}>
          {descendants.length ? <button type="button" onClick={() => setCollapsed((current) => current.includes(account.id) ? current.filter((id) => id !== account.id) : [...current, account.id])} aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${account.name}`} className="rounded p-0.5 hover:bg-black/5">{isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button> : <span className="w-[18px] shrink-0" />}
          <span className="shrink-0 font-mono text-[11px] font-bold text-blue-700">{account.code}</span>
          <span className="min-w-0 break-words text-xs">{account.name}</span>
          {(isRoot || isCategory) && <button type="button" onClick={() => onAddLedger(account)} aria-label={`Add ledger under ${account.name}`} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-50"><Plus className="h-3 w-3" />Add ledger</button>}
          {!account.isActive && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] text-red-700">Inactive</span>}
        </div>
        <span className="text-right text-[10px] text-slate-500">{isRoot ? "Main class" : isCategory ? "Category" : "Ledger"}</span>
        <span className="hidden text-right text-[10px] font-semibold tabular-nums text-slate-700 sm:block">BDT {Number(account.balance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span className="hidden text-right text-[10px] text-slate-500 sm:block">{account._count?.journalLines ?? 0} entries</span>
      </div>
      {!isCollapsed && descendants.map((child) => renderRow(child, depth + 1))}
    </React.Fragment>;
  };

  return <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
      <div><h2 className="text-sm font-bold">Account hierarchy</h2><p className="text-[11px] text-biz-muted">{accounts.length} accounts across five main classes</p></div>
      <label className="flex h-8 w-full items-center gap-2 rounded-md border px-2 text-slate-400 sm:w-60"><Search className="h-3.5 w-3.5" /><input aria-label="Search chart of accounts" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code or ledger..." className="w-full bg-transparent text-xs text-slate-700 outline-none" /></label>
    </div>
    <div className="max-h-[calc(100vh-230px)] overflow-auto">{roots.map((account) => renderRow(account, 0))}{term && !roots.some(matches) && <p className="p-8 text-center text-xs text-biz-muted">No matching accounts.</p>}</div>
  </section>;
}
