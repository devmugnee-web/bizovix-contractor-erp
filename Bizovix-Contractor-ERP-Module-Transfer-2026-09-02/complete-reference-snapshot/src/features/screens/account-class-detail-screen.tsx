"use client";

import { ArrowLeft, BookOpen, FolderTree, Layers, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAccountTreeQuery } from "@/hooks/use-accounts-query";
import type { AccountNode } from "@/types/accounts";

interface FlatAccountRow {
  account: AccountNode;
  depth: number;
  path: string;
}

function findClass(nodes: AccountNode[], id: string): AccountNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const match = findClass(node.children, id);
    if (match) return match;
  }
  return null;
}

function flattenClass(node: AccountNode): FlatAccountRow[] {
  const rows: FlatAccountRow[] = [];
  const walk = (children: AccountNode[], depth: number, parents: string[]) => {
    children.forEach((child) => {
      const path = [...parents, child.name];
      rows.push({ account: child, depth, path: path.join(" > ") });
      walk(child.children, depth + 1, path);
    });
  };
  walk(node.children, 0, [node.name]);
  return rows;
}

export function AccountClassDetailScreen({ classId }: { classId: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const treeQuery = useAccountTreeQuery(true);
  const accountClass = useMemo(() => findClass(treeQuery.data ?? [], classId), [classId, treeQuery.data]);
  const rows = useMemo(() => accountClass ? flattenClass(accountClass) : [], [accountClass]);
  const categoryCount = rows.filter((row) => row.account.level === "CATEGORY").length;
  const ledgerCount = rows.filter((row) => row.account.level === "LEDGER").length;
  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(({ account, path }) =>
      `${account.name} ${account.code} ${account.nature} ${path}`.toLowerCase().includes(term),
    );
  }, [rows, search]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#f6f8fb] p-3">
      <div className="rounded-xl border border-[#d7dfeb] bg-white shadow-[0_4px_16px_rgba(31,50,83,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" size="icon" variant="outline" aria-label="Back to chart of accounts" onClick={() => router.push("/app/reports/chart-of-accounts")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8aa2]">
              Account Class <span className="rounded-full bg-[#e9f8ef] px-2 py-0.5 tracking-normal text-[#16824b]">Active</span>
            </div>
            <h1 className="truncate text-xl font-bold text-[#1f3253]">{accountClass?.name ?? "Account Class"}</h1>
          </div>
        </div>
        {accountClass ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-[#eef4ff] px-3 py-1.5 font-medium text-[#2563eb]">{categoryCount} Categories</span>
            <span className="rounded-full bg-[#fff4e8] px-3 py-1.5 font-medium text-[#c95708]">{ledgerCount} Ledgers</span>
          </div>
        ) : null}
        </div>
        <div className="border-t border-[#e4eaf2] px-4 py-2.5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#74839a]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search categories, ledgers or account codes..."
              className="h-9 w-full rounded-lg border border-[#cfd9e7] bg-[#fbfcfe] pl-9 pr-3 text-sm outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-[#d7dfeb] bg-white shadow-[0_4px_16px_rgba(31,50,83,0.04)]">
        {treeQuery.isLoading ? (
          <div className="p-12 text-center text-sm text-muted">Loading class accounts...</div>
        ) : !accountClass || accountClass.level !== "MAIN_CATEGORY" ? (
          <div className="p-12 text-center text-sm text-[#b42318]">This account class could not be found.</div>
        ) : (
          <div className="text-sm">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(220px,1fr)_90px_110px] items-center border-b border-[#dce4ef] bg-[#f7f9fc] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#6f7e96] md:grid-cols-[minmax(260px,1.4fr)_100px_130px_120px_minmax(160px,1fr)]">
              <span>Category / Ledger</span><span>Type</span><span>Code</span><span className="hidden md:block">Nature</span><span className="hidden md:block">Location</span>
            </div>
            {visibleRows.map(({ account, depth, path }) => {
                const Icon = account.level === "LEDGER" ? BookOpen : account.level === "MAIN_CATEGORY" ? FolderTree : Layers;
                return (
                  <div key={account.id} className="grid grid-cols-[minmax(220px,1fr)_90px_110px] items-center border-b border-[#e7edf5] px-4 py-2.5 transition-colors hover:bg-[#f7faff] md:grid-cols-[minmax(260px,1.4fr)_100px_130px_120px_minmax(160px,1fr)]">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-[#223553]" style={{ paddingLeft: `${Math.min(depth, 3) * 18}px` }}>
                      <span className={account.level === "LEDGER" ? "rounded-md bg-[#fff3e8] p-1.5 text-[#d8620a]" : "rounded-md bg-[#edf4ff] p-1.5 text-[#2563eb]"}><Icon className="h-3.5 w-3.5" /></span>
                      <span className="truncate">{account.name}</span>
                    </span>
                    <span className={account.level === "LEDGER" ? "w-fit rounded-full bg-[#fff3e8] px-2 py-1 text-xs font-medium text-[#bd5207]" : "w-fit rounded-full bg-[#edf4ff] px-2 py-1 text-xs font-medium text-[#2563eb]"}>{account.level === "LEDGER" ? "Ledger" : "Category"}</span>
                    <span className="truncate font-medium text-[#334155]">{account.code}</span>
                    <span className="hidden truncate text-xs text-[#52627b] md:block">{account.nature.replace(/_/g, " ")}</span>
                    <span className="hidden min-w-0 items-center gap-2 md:flex"><span className="truncate text-xs text-[#7a889e]">{path}</span><span className={account.status === "ACTIVE" ? "shrink-0 rounded-full bg-[#e9f8ef] px-2 py-1 text-[11px] font-semibold text-[#16824b]" : "shrink-0 rounded-full bg-[#fff0f0] px-2 py-1 text-[11px] font-semibold text-[#b42318]"}>{account.status === "ACTIVE" ? "Active" : "Inactive"}</span></span>
                  </div>
                );
              })}
              {!visibleRows.length ? <div className="px-4 py-16 text-center text-sm text-muted">{search ? "No matching categories or ledgers found." : "No categories or ledgers exist under this class yet."}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}
