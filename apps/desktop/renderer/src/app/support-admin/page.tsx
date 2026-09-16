"use client";

import * as React from "react";
import { ArrowLeft, Download, Headphones, LogOut, Paperclip, RefreshCw, Send } from "lucide-react";
import type { SupportTicketDetail, SupportTicketStatus, SupportTicketSummary } from "@bizovix/types";
import { API_BASE_URL } from "@/config/env";

const TOKEN_KEY = "bizovix-vendor-support-token";
const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  OPEN: "Open", IN_PROGRESS: "In progress", WAITING_FOR_CUSTOMER: "Waiting for customer", RESOLVED: "Resolved", CLOSED: "Closed",
};
const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as [SupportTicketStatus, string][];
const subscribeToHydration = () => () => {};

interface ListResult { items: SupportTicketSummary[]; meta: { page: number; total: number; totalPages: number } }
class VendorRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function vendorRequest<T>(path: string, token: string | null, options: { method?: string; body?: BodyInit; json?: unknown } = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    cache: "no-store",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { message?: string } | null;
    throw new VendorRequestError(data?.message ?? `Request failed (${response.status})`, response.status);
  }
  const result = await response.json() as { data: T; meta?: ListResult["meta"] };
  if (result.meta) return { items: result.data, meta: result.meta } as T;
  return result.data;
}

function date(value: string) { return new Date(value).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" }); }
function errorText(error: unknown) { return error instanceof Error ? error.message : "Request failed"; }

export default function VendorSupportPage() {
  const ready = React.useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [tokenOverride, setTokenOverride] = React.useState<string | null | undefined>(undefined);
  const token = tokenOverride === undefined && ready ? sessionStorage.getItem(TOKEN_KEY) : tokenOverride ?? null;
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [adminName, setAdminName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [list, setList] = React.useState<ListResult | null>(null);
  const [detail, setDetail] = React.useState<SupportTicketDetail | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<SupportTicketStatus | "">("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [reply, setReply] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);

  const loadList = React.useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    const result = await vendorRequest<ListResult>(`/vendor-admin/support-tickets?${params}`, token);
    setList(result);
  }, [token, page, status, search]);

  const loadDetail = React.useCallback(async (id: string) => {
    if (!token) return;
    setDetail(await vendorRequest<SupportTicketDetail>(`/vendor-admin/support-tickets/${id}`, token));
  }, [token]);

  React.useEffect(() => {
    if (!token) return;
    let active = true;
    const refresh = async () => {
      try { await loadList(); if (selectedId) await loadDetail(selectedId); if (active) setError(""); }
      catch (cause) {
        if (!active) return;
        if (cause instanceof VendorRequestError && cause.status === 401) {
          sessionStorage.removeItem(TOKEN_KEY);
          setTokenOverride(null);
          setError("Your support session expired. Please sign in again.");
        } else setError(errorText(cause));
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, loadList, loadDetail, selectedId]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await vendorRequest<{ admin: { name: string }; accessToken: string }>("/vendor-admin/auth/login", null, { method: "POST", json: { email, password } });
      sessionStorage.setItem(TOKEN_KEY, result.accessToken);
      setAdminName(result.admin.name); setTokenOverride(result.accessToken); setPassword("");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault(); if (!token || !selectedId || !reply.trim()) return;
    setBusy(true); setError("");
    try {
      const data = new FormData(); data.append("body", reply.trim()); files.forEach((file) => data.append("files", file));
      const result = await vendorRequest<SupportTicketDetail>(`/vendor-admin/support-tickets/${selectedId}/replies`, token, { method: "POST", body: data });
      setDetail(result); setReply(""); setFiles([]); await loadList();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function updateStatus(next: SupportTicketStatus) {
    if (!token || !selectedId) return;
    setBusy(true); setError("");
    try {
      const result = await vendorRequest<SupportTicketDetail>(`/vendor-admin/support-tickets/${selectedId}/status`, token, { method: "PATCH", json: { status: next } });
      setDetail(result); await loadList();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function download(attachmentId: string, fileName: string) {
    if (!token || !selectedId) return;
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/vendor-admin/support-tickets/${selectedId}/attachments/${attachmentId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Could not download attachment");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(errorText(cause)); }
  }

  if (!ready) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading support workspace...</main>;
  if (!token) return <main className="grid min-h-screen place-items-center bg-[#f5f8ff] p-5"><form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-biz-border bg-white p-6 shadow-lg"><div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-biz-blue/10 p-2 text-biz-blue"><Headphones className="h-6 w-6" /></span><div><h1 className="text-lg font-bold text-biz-navy">Bizovix Support</h1><p className="text-xs text-biz-muted">Vendor team sign in</p></div></div>{error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}<label className="mb-3 block text-xs font-semibold text-biz-navy">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-biz-border px-3 text-sm" /></label><label className="mb-4 block text-xs font-semibold text-biz-navy">Password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-biz-border px-3 text-sm" /></label><button disabled={busy} className="h-10 w-full rounded-lg bg-biz-blue text-sm font-bold text-white disabled:opacity-50">{busy ? "Signing in..." : "Sign in"}</button></form></main>;

  return <main className="min-h-screen bg-[#f5f8ff] text-biz-navy">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-biz-border bg-white px-4 py-3 sm:px-6"><div className="flex items-center gap-2"><span className="rounded-lg bg-biz-blue/10 p-2 text-biz-blue"><Headphones className="h-5 w-5" /></span><div><h1 className="text-lg font-bold">Support Inbox</h1><p className="text-xs text-biz-muted">Customer tickets · {adminName || "Vendor team"}</p></div></div><button type="button" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setTokenOverride(null); setDetail(null); setSelectedId(null); }} className="inline-flex items-center gap-1 rounded-lg border border-biz-border px-3 py-2 text-xs font-semibold hover:bg-slate-50"><LogOut className="h-3.5 w-3.5" /> Sign out</button></header>
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">{error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-xl border border-biz-border bg-white shadow-sm"><div className="border-b border-biz-border p-3"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">Tickets {list ? `(${list.meta.total})` : ""}</h2><button type="button" aria-label="Refresh tickets" onClick={() => { void loadList().catch((cause) => setError(errorText(cause))); }} className="rounded-md p-1.5 text-biz-blue hover:bg-blue-50"><RefreshCw className="h-4 w-4" /></button></div><div className="mt-2 flex gap-2"><input aria-label="Search tickets" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search subject, company or number" className="min-w-0 flex-1 rounded-lg border border-biz-border px-2 py-2 text-xs" /><select aria-label="Filter status" value={status} onChange={(event) => { setStatus(event.target.value as SupportTicketStatus | ""); setPage(1); }} className="w-28 rounded-lg border border-biz-border px-1 text-xs"><option value="">All</option>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div><div className="max-h-[65vh] overflow-y-auto">{list?.items.length ? list.items.map((ticket) => <button type="button" key={ticket.id} onClick={() => { setSelectedId(ticket.id); setDetail(null); }} className={`block w-full border-b border-biz-border p-3 text-left hover:bg-blue-50 ${selectedId === ticket.id ? "bg-blue-50" : ""}`}><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold">{ticket.subject}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{STATUS_LABELS[ticket.status]}</span></div><p className="mt-1 truncate text-xs text-biz-muted">#{ticket.number} · {ticket.organizationName} · {ticket.createdByName}</p><p className="mt-1 truncate text-[11px] text-biz-muted">{ticket.lastMessagePreview}</p><p className="mt-1 text-[10px] text-biz-muted">{date(ticket.lastActivityAt)}</p></button>) : <p className="p-8 text-center text-sm text-biz-muted">No matching tickets</p>}</div>{list && list.meta.totalPages > 1 && <div className="flex items-center justify-between border-t border-biz-border p-3 text-xs"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Previous</button><span>{page} / {list.meta.totalPages}</span><button type="button" disabled={page >= list.meta.totalPages} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next</button></div>}</section>
        <section className="min-w-0 rounded-xl border border-biz-border bg-white shadow-sm">{!selectedId ? <div className="grid h-full min-h-64 place-items-center p-6 text-center text-sm text-biz-muted">Choose a ticket to read and reply.</div> : !detail ? <div className="grid min-h-64 place-items-center text-sm text-biz-muted">Loading ticket...</div> : <><div className="border-b border-biz-border p-4"><button type="button" onClick={() => setSelectedId(null)} className="mb-2 inline-flex items-center gap-1 text-xs text-biz-blue lg:hidden"><ArrowLeft className="h-3 w-3" /> Back to list</button><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold">#{detail.number} · {detail.subject}</h2><p className="mt-1 text-xs text-biz-muted">{detail.organizationName} · {detail.createdByName} · {detail.moduleName} · {date(detail.createdAt)}</p>{detail.pagePath && <p className="mt-1 text-[11px] text-biz-muted">Page: {detail.pagePath} · Version: {detail.appVersion ?? "Unknown"}</p>}</div><select aria-label="Ticket status" disabled={busy} value={detail.status} onChange={(event) => void updateStatus(event.target.value as SupportTicketStatus)} className="rounded-lg border border-biz-border p-2 text-xs font-semibold">{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div><div className="max-h-[52vh] space-y-3 overflow-y-auto bg-[#f8faff] p-4">{detail.messages.map((message) => <article key={message.id} className={`rounded-xl border p-3 ${message.authorType === "SUPPORT" ? "ml-4 border-blue-200 bg-blue-50" : "mr-4 border-biz-border bg-white"}`}><div className="flex flex-wrap justify-between gap-1 text-xs"><strong>{message.authorName}{message.authorType === "SUPPORT" ? " · Support" : ""}</strong><time className="text-biz-muted">{date(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.body}</p>{message.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{message.attachments.map((attachment) => <button key={attachment.id} type="button" onClick={() => void download(attachment.id, attachment.fileName)} className="inline-flex items-center gap-1 rounded-md border border-biz-border bg-white px-2 py-1 text-xs text-biz-blue"><Download className="h-3 w-3" /> {attachment.fileName}</button>)}</div>}</article>)}</div><form onSubmit={sendReply} className="space-y-2 border-t border-biz-border p-4"><label htmlFor="vendor-reply" className="text-xs font-bold">Reply to customer</label><textarea id="vendor-reply" rows={3} maxLength={5000} required value={reply} onChange={(event) => setReply(event.target.value)} className="w-full rounded-lg border border-biz-border p-2 text-sm" placeholder="Write a clear response..." /><div className="flex flex-wrap items-center justify-between gap-2"><label className="inline-flex cursor-pointer items-center gap-1 text-xs text-biz-blue"><Paperclip className="h-3.5 w-3.5" /> {files.length ? `${files.length} file(s) selected` : "Attach files"}<input type="file" multiple accept=".png,.jpg,.jpeg,.pdf" className="sr-only" onChange={(event) => { const incoming = Array.from(event.target.files ?? []); if (incoming.length > 5 || incoming.some((file) => file.size > 5 * 1024 * 1024)) setError("Up to 5 files, 5 MB each."); else { setError(""); setFiles(incoming); } }} /></label><button type="submit" disabled={busy || !reply.trim()} className="inline-flex items-center gap-1 rounded-lg bg-biz-blue px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" /> Send reply</button></div></form></>}</section>
      </div>
    </div>
  </main>;
}
