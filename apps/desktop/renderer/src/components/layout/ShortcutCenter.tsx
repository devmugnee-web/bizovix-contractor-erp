"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Command, Keyboard, Search, X } from "lucide-react";
import { useMe } from "@bizovix/api-client";
import type { Permission } from "@bizovix/types";
import { NAV_ITEMS, NAV_ITEMS_LOWER, type NavItem, type NavLeaf } from "@/config/nav";

type Mode = "list" | "palette";
type Action = "new" | "save" | "filters" | "export" | "upload";
type Shortcut = { id: string; label: string; keys: string; group: string; run: () => void; available?: boolean };

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]');
}

function visibleRoute(route: string, permissions: Set<Permission>) {
  function hasRoute(items: (NavItem | NavLeaf)[]): boolean {
    return items.some((item) => {
      if (item.permissions?.length && !item.permissions.some((permission) => permissions.has(permission))) return false;
      return (!("disabled" in item && item.disabled) && item.href?.split("?")[0] === route) || (item.children ? hasRoute(item.children) : false);
    });
  }
  return hasRoute([...NAV_ITEMS, ...NAV_ITEMS_LOWER]);
}

function actionElement(action: Action) {
  const selector = `[data-shortcut-action="${action}"]`;
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]:not([data-shortcut-center]), [aria-modal="true"]:not([data-shortcut-center])'))
    .filter((element) => element.getClientRects().length > 0);
  const scope = dialogs.at(-1) ?? document;
  const element = scope.querySelector<HTMLElement>(selector);
  return element && element.getClientRects().length && !element.matches(":disabled, [aria-disabled='true']") ? element : null;
}

export function ShortcutCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const permissions = React.useMemo(() => new Set(me.data?.permissions ?? []), [me.data?.permissions]);
  const [mode, setMode] = React.useState<Mode | null>(null);
  const [modePath, setModePath] = React.useState(pathname);
  const activeMode = modePath === pathname ? mode : null;
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState(0);
  const mounted = typeof document !== "undefined";
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (activeMode === "palette") inputRef.current?.focus();
  }, [activeMode]);
  React.useEffect(() => {
    if (!activeMode) return;
    const previous = document.activeElement as HTMLElement | null;
    if (activeMode === "list") dialogRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    function keepFocus(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keepFocus);
    return () => { document.removeEventListener("keydown", keepFocus); previous?.focus(); };
  }, [activeMode]);

  const open = (next: Mode) => {
    setQuery("");
    setSelected(0);
    setModePath(pathname);
    setMode(next);
  };
  const close = () => {
    setMode(null);
  };
  const navigate = (href: string) => {
    setMode(null);
    router.push(href);
  };
  const runAction = (action: Action) => {
    const element = actionElement(action);
    if (!element) return;
    setMode(null);
    if (action === "filters") element.focus();
    else element.click();
  };
  const runNew = () => {
    if (pathname === "/tenders") navigate("/tenders?addTender=1");
    else if (pathname === "/expenses/project-expense") navigate("/expenses/project-expense/create");
    else if (pathname === "/cms/ongoing-works") navigate("/cms/ongoing-works/create");
    else runAction("new");
  };
  const canCreateHere = ["/tenders", "/expenses/project-expense", "/cms/ongoing-works"].includes(pathname) || (mounted && !!actionElement("new"));

  const navigation = [
    ["Dashboard", "/dashboard"],
    ["Reminders", "/reminders"],
    ["Tender Management", "/tender-management"],
    ["Bank Instruments", "/bank-instruments/document-purchase"],
    ["Quotation / Sales", "/quotation-sales"],
    ["Projects", "/cms/ongoing-works"],
    ["Purchases & Expenses", "/expenses/project-expense"],
    ["Bank & Accounts", "/cash-bank/main-cash"],
    ["Reports", "/reports"],
  ] as const;
  const shortcuts: Shortcut[] = [
    { id: "palette", label: "Search pages and actions", keys: "Ctrl + K", group: "Global", run: () => open("palette") },
    { id: "search", label: "Go to search", keys: "Alt + G", group: "Global", run: () => open("palette") },
    { id: "new", label: "Create new on this page", keys: "Alt + N", group: "Global", run: runNew, available: canCreateHere },
    { id: "save", label: "Save / Save Draft", keys: "Ctrl + S", group: "Global", run: () => runAction("save"), available: mounted && !!actionElement("save") },
    { id: "filters", label: "Focus search or filters", keys: "Alt + F", group: "Global", run: () => runAction("filters"), available: mounted && !!actionElement("filters") },
    { id: "export", label: "Export current list", keys: "Alt + E", group: "Global", run: () => runAction("export"), available: mounted && !!actionElement("export") },
    { id: "print", label: "Print current page", keys: "Alt + P", group: "Global", run: () => { setMode(null); window.print(); } },
    { id: "dismiss", label: "Close shortcuts", keys: "Esc", group: "Global", run: close },
    { id: "help", label: "Show keyboard shortcuts", keys: "Shift + ?", group: "Global", run: () => open("list") },
    ...navigation.map(([label, href], index): Shortcut => ({
      id: `nav-${index + 1}`, label, keys: `Alt + ${index + 1}`, group: "Quick navigation",
      run: () => navigate(href), available: visibleRoute(href, permissions) || (label === "Reports" && NAV_ITEMS.some((item) => item.label === "Reports")),
    })),
    { id: "tender", label: "Add New Tender", keys: "Alt + T", group: "Tender workflow", run: () => navigate("/tenders?addTender=1"), available: visibleRoute("/tenders", permissions) },
    { id: "costing", label: "Tender Costing", keys: "Alt + C", group: "Tender workflow", run: () => navigate("/tender-management/tender-costing"), available: visibleRoute("/tender-management/tender-costing", permissions) },
    { id: "history", label: "Item Price History", keys: "Alt + I", group: "Tender workflow", run: () => navigate("/tender-management/item-price-history"), available: visibleRoute("/tender-management/item-price-history", permissions) },
    { id: "quotation", label: "Create Quotation", keys: "Alt + Q", group: "Tender workflow", run: () => navigate("/quotation-sales/quotation?new=1"), available: visibleRoute("/quotation-sales/quotation", permissions) },
    { id: "reminder", label: "Add Reminder", keys: "Alt + R", group: "Tender workflow", run: () => navigate("/reminders?new=1"), available: visibleRoute("/reminders", permissions) },
    { id: "upload", label: "Upload BOQ PDF", keys: "Alt + U", group: "Tender workflow", run: () => runAction("upload"), available: pathname === "/tender-management/tender-costing/add" && mounted && !!actionElement("upload") },
  ];
  const paletteCommands = shortcuts.filter((item) => item.id !== "dismiss" && item.id !== "help");
  const results = paletteCommands.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase().trim()));
  const groups = ["Global", "Quick navigation", "Tender workflow"];

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && activeMode) { event.preventDefault(); close(); return; }
      if (activeMode) return;
      const key = event.key.toLowerCase();
      const control = (event.ctrlKey || event.metaKey) && !event.altKey;
      const pageDialogOpen = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]:not([data-shortcut-center]), [aria-modal="true"]:not([data-shortcut-center])'))
        .some((element) => element.getClientRects().length > 0);
      if (control && key === "k" && !pageDialogOpen) { event.preventDefault(); open("palette"); return; }
      if (event.key === "?" && event.shiftKey && !isEditable(event.target)) { event.preventDefault(); open("list"); return; }
      const editable = isEditable(event.target);
      if (control && key === "s") { event.preventDefault(); if (actionElement("save")) runAction("save"); else if (!pageDialogOpen) open("list"); return; }
      if (editable || pageDialogOpen || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const shortcut = shortcuts.find((item) => item.keys.toLowerCase() === `alt + ${key}`);
      if (shortcut && shortcut.available !== false) { event.preventDefault(); shortcut.run(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <>
      <button
        type="button"
        onClick={() => open("list")}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (Shift + ?)"
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[10px] font-semibold text-biz-navy hover:bg-biz-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue/40"
      >
        <Keyboard className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Shortcuts</span>
      </button>
      {mounted && activeMode && createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-biz-navy/35 px-3 pt-[min(12vh,80px)]" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section ref={dialogRef} role="dialog" aria-modal="true" data-shortcut-center aria-label={activeMode === "list" ? "Keyboard shortcuts" : "Command palette"} className="flex max-h-[min(78vh,680px)] w-full max-w-[720px] flex-col overflow-hidden rounded-xl border border-biz-border bg-white shadow-[0_20px_60px_rgba(9,30,66,0.22)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-biz-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue">{activeMode === "list" ? <Keyboard className="h-4 w-4" /> : <Command className="h-4 w-4" />}</span>
                <div className="min-w-0"><h2 className="text-[14px] font-bold text-biz-navy">{activeMode === "list" ? "Keyboard Shortcuts" : "Search pages and actions"}</h2><p className="text-[10px] text-biz-muted">{activeMode === "list" ? "Available actions respond to the current page." : "Type a page or action, then press Enter."}</p></div>
              </div>
              <button type="button" onClick={close} aria-label="Close shortcuts" className="flex h-7 w-7 items-center justify-center rounded-md border border-biz-border text-biz-muted hover:bg-biz-bg"><X className="h-4 w-4" /></button>
            </div>
            {activeMode === "palette" && <div className="relative shrink-0 border-b border-biz-border p-3"><Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(value + 1, results.length - 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(value - 1, 0)); }
              if (event.key === "Enter") { event.preventDefault(); const item = results[selected]; if (item && item.available !== false) item.run(); }
            }} placeholder="Search tender, costing, reminder..." className="h-9 w-full rounded-md border border-biz-border bg-white pl-9 pr-3 text-[12px] outline-none focus:border-biz-blue" /></div>}
            <div className="scrollbar-hidden min-h-0 overflow-y-auto p-3">
              {activeMode === "list" ? groups.map((group) => <div key={group} className="mb-4 last:mb-0"><h3 className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-biz-muted">{group}</h3><div className="grid gap-1.5 sm:grid-cols-2">{shortcuts.filter((item) => item.group === group).map((item) => <ShortcutRow key={item.id} item={item} />)}</div></div>) : results.length ? results.map((item, index) => <ShortcutRow key={item.id} item={item} highlighted={selected === index} onHover={() => setSelected(index)} />) : <p className="py-8 text-center text-[12px] text-biz-muted">No matching page or action.</p>}
            </div>
            <p className="shrink-0 border-t border-biz-border px-4 py-2 text-[10px] text-biz-muted">Shortcuts pause while typing. In tables, Tab to a row, use ↑/↓ to move and Enter/Space to open. Final submissions use their normal confirmation.</p>
          </section>
        </div>, document.body,
      )}
    </>
  );
}

function ShortcutRow({ item, highlighted, onHover }: { item: Shortcut; highlighted?: boolean; onHover?: () => void }) {
  return <button type="button" disabled={item.available === false} onMouseEnter={onHover} onClick={item.run} className={`flex min-h-9 w-full items-center justify-between gap-3 rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors ${highlighted ? "border-biz-blue/30 bg-biz-blue-soft" : "border-biz-border hover:border-biz-blue/30 hover:bg-biz-bg"} disabled:cursor-not-allowed disabled:opacity-45`}><span className="truncate text-biz-text" title={item.label}>{item.label}</span><kbd className="shrink-0 whitespace-nowrap rounded border border-biz-border bg-white px-1.5 py-0.5 font-mono text-[9px] text-biz-blue">{item.keys}</kbd></button>;
}
