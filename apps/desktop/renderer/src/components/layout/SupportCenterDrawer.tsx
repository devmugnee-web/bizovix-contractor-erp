"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, Headphones, MessageCircle, Paperclip, Plus, Send, X } from "lucide-react";
import {
  downloadSupportAttachment,
  useCreateSupportTicket,
  useReplySupportTicket,
  useSupportTicket,
  useSupportTickets,
  useUpdateSupportTicketStatus,
} from "@bizovix/api-client";
import type { SupportTicketIssueType, SupportTicketPriority, SupportTicketStatus, SupportTicketSummary } from "@bizovix/types";

const WHATSAPP_URL = "https://wa.me/8801700000000";
const ISSUE_TYPES: { value: SupportTicketIssueType; label: string }[] = [
  { value: "TECHNICAL", label: "Technical issue" },
  { value: "HOW_TO", label: "How to use" },
  { value: "DATA", label: "Data or calculation" },
  { value: "FEATURE", label: "Feature request" },
  { value: "ACCOUNT", label: "Account or access" },
];
const STATUSES: Record<SupportTicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_FOR_CUSTOMER: "Your reply needed",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

function moduleFromPath(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0];
  const names: Record<string, string> = {
    tenders: "Tender List",
    "tender-management": "Tender Management",
    reminders: "Reminders",
    expenses: "Purchases & Expenses",
    projects: "Projects",
    reports: "Reports",
    settings: "Settings",
    dashboard: "Dashboard",
  };
  return names[segment ?? ""] ?? (segment ? segment.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "General");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });
}

function fileError(files: File[]): string | null {
  if (files.length > 5) return "You can attach up to 5 files.";
  if (files.some((file) => file.size > 5 * 1024 * 1024)) return "Each file must be 5 MB or smaller.";
  if (files.some((file) => !["image/png", "image/jpeg", "application/pdf"].includes(file.type))) {
    return "Only PNG, JPG and PDF files are supported.";
  }
  return null;
}

function addFiles(current: File[], incoming: FileList | null, setFiles: (files: File[]) => void, setError: (error: string) => void) {
  if (!incoming) return;
  const next = [...current, ...Array.from(incoming)];
  const problem = fileError(next);
  if (problem) setError(problem);
  else { setError(""); setFiles(next); }
}

function FilePicker({ files, setFiles, setError }: { files: File[]; setFiles: (files: File[]) => void; setError: (error: string) => void }) {
  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-biz-blue/40 bg-biz-blue/5 px-3 py-2 text-xs font-semibold text-biz-blue hover:bg-biz-blue/10">
        <Paperclip className="h-4 w-4" /> Attach screenshots or PDF
        <input type="file" accept=".png,.jpg,.jpeg,.pdf" multiple className="sr-only" onChange={(event) => { addFiles(files, event.target.files, setFiles, setError); event.target.value = ""; }} />
      </label>
      <span className="ml-2 text-[11px] text-biz-muted">Up to 5 files, 5 MB each</span>
      {files.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{files.map((file, index) => (
        <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] text-biz-navy">
          <span className="max-w-40 truncate">{file.name}</span>
          <button type="button" onClick={() => setFiles(files.filter((_, itemIndex) => index !== itemIndex))} aria-label={`Remove ${file.name}`} className="rounded hover:text-red-600"><X className="h-3 w-3" /></button>
        </span>
      ))}</div>}
    </div>
  );
}

function TicketRow({ ticket, onClick }: { ticket: SupportTicketSummary; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-xl border border-biz-border bg-white p-3 text-left transition hover:border-biz-blue/40 hover:bg-biz-blue/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-biz-navy">{ticket.subject}</span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-biz-navy">{STATUSES[ticket.status]}</span>
      </div>
      <p className="mt-1 truncate text-xs text-biz-muted">#{ticket.number} · {ticket.moduleName} · {ticket.lastMessagePreview}</p>
      <p className="mt-1 text-[11px] text-biz-muted">Updated {formatDate(ticket.lastActivityAt)}</p>
    </button>
  );
}

export interface SupportCenterDrawerProps {
  open: boolean;
  onClose: () => void;
  ticketId?: string | null;
}

export function SupportCenterDrawer({ open, onClose, ticketId }: SupportCenterDrawerProps) {
  const pathname = usePathname();
  const [tab, setTab] = React.useState<"new" | "mine">(ticketId ? "mine" : "new");
  const [selectedId, setSelectedId] = React.useState<string | null>(ticketId ?? null);
  const [subject, setSubject] = React.useState("");
  const [issueType, setIssueType] = React.useState<SupportTicketIssueType>("TECHNICAL");
  const [moduleName, setModuleName] = React.useState(moduleFromPath(pathname));
  const [priority, setPriority] = React.useState<SupportTicketPriority>("NORMAL");
  const [description, setDescription] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [reply, setReply] = React.useState("");
  const [replyFiles, setReplyFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState("");
  const [ticketPage, setTicketPage] = React.useState(1);
  const opener = React.useRef<HTMLElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLElement>(null);
  const list = useSupportTickets({ page: ticketPage, limit: 20 }, open && tab === "mine");
  const detail = useSupportTicket(selectedId, open && tab === "mine");
  const create = useCreateSupportTicket();
  const sendReply = useReplySupportTicket();
  const updateStatus = useUpdateSupportTicketStatus();

  React.useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && dialogRef.current) {
        const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", onKeyDown); opener.current?.focus(); };
  }, [open, onClose]);

  async function createTicket(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (subject.trim().length < 5 || description.trim().length < 10 || moduleName.trim().length < 2) {
      setError("Add a subject (5+ characters), module and description (10+ characters)."); return;
    }
    try {
      const ticket = await create.mutateAsync({ subject: subject.trim(), issueType, moduleName: moduleName.trim(), priority, description: description.trim(), pagePath: pathname, appVersion: "1.0.0", files });
      setSubject(""); setDescription(""); setFiles([]); setPriority("NORMAL");
      setTab("mine"); setSelectedId(ticket.id);
    } catch (cause) { setError(errorText(cause)); }
  }

  async function replyToTicket(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setError("");
    try {
      await sendReply.mutateAsync({ id: selectedId, body: reply.trim(), files: replyFiles });
      setReply(""); setReplyFiles([]);
    } catch (cause) { setError(errorText(cause)); }
  }

  async function changeStatus(status: SupportTicketStatus) {
    if (!selectedId) return;
    setError("");
    try { await updateStatus.mutateAsync({ id: selectedId, status }); }
    catch (cause) { setError(errorText(cause)); }
  }

  async function download(ticket: string, attachmentId: string, attachmentName: string) {
    setError("");
    try {
      const { blob } = await downloadSupportAttachment(ticket, attachmentId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = attachmentName; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(errorText(cause)); }
  }

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100]" role="presentation">
      <div className="absolute inset-0 bg-slate-950/40" onClick={onClose} />
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="support-center-title" className="absolute inset-y-0 right-0 flex w-full max-w-[500px] flex-col border-l border-biz-border bg-white shadow-2xl">
        <header className="shrink-0 border-b border-biz-border bg-white px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-biz-blue/10 text-biz-blue"><Headphones className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1"><h2 id="support-center-title" className="text-base font-bold text-biz-navy">Support Center</h2><p className="text-xs text-biz-muted">Create a ticket and track the reply in one place.</p></div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close Support Center" className="rounded-lg p-1.5 text-biz-muted hover:bg-slate-100 hover:text-biz-navy"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Support Center tabs">
            <button type="button" role="tab" aria-selected={tab === "new"} onClick={() => { setTab("new"); setSelectedId(null); setError(""); }} className={`rounded-md py-2 text-xs font-semibold ${tab === "new" ? "bg-white text-biz-blue shadow-sm" : "text-biz-muted"}`}>New Ticket</button>
            <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => { setTab("mine"); setError(""); }} className={`rounded-md py-2 text-xs font-semibold ${tab === "mine" ? "bg-white text-biz-blue shadow-sm" : "text-biz-muted"}`}>My Tickets</button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8faff] px-4 py-4 sm:px-5">
          {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          {tab === "new" ? (
            <form id="new-support-ticket" onSubmit={createTicket} className="space-y-4">
              <div><label htmlFor="support-subject" className="mb-1 block text-xs font-semibold text-biz-navy">Subject <span className="text-red-600">*</span></label><input id="support-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={180} required placeholder="Briefly describe the problem" className="h-10 w-full rounded-lg border border-biz-border bg-white px-3 text-sm outline-none focus:border-biz-blue" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="support-type" className="mb-1 block text-xs font-semibold text-biz-navy">Issue type</label><select id="support-type" value={issueType} onChange={(event) => setIssueType(event.target.value as SupportTicketIssueType)} className="h-10 w-full rounded-lg border border-biz-border bg-white px-2 text-sm">{ISSUE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                <div><label htmlFor="support-priority" className="mb-1 block text-xs font-semibold text-biz-navy">Priority</label><select id="support-priority" value={priority} onChange={(event) => setPriority(event.target.value as SupportTicketPriority)} className="h-10 w-full rounded-lg border border-biz-border bg-white px-2 text-sm"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></div>
              </div>
              <div><label htmlFor="support-module" className="mb-1 block text-xs font-semibold text-biz-navy">Module <span className="text-red-600">*</span></label><input id="support-module" value={moduleName} onChange={(event) => setModuleName(event.target.value)} maxLength={100} required className="h-10 w-full rounded-lg border border-biz-border bg-white px-3 text-sm outline-none focus:border-biz-blue" /></div>
              <div><label htmlFor="support-description" className="mb-1 block text-xs font-semibold text-biz-navy">What happened? <span className="text-red-600">*</span></label><textarea id="support-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} required rows={6} placeholder="What were you trying to do, what happened, and what did you expect?" className="w-full resize-y rounded-lg border border-biz-border bg-white p-3 text-sm outline-none focus:border-biz-blue" /></div>
              <FilePicker files={files} setFiles={setFiles} setError={setError} />
              <p className="rounded-lg bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-biz-muted">Current page and app version will be included so support can identify where the issue occurred. Do not include passwords or sensitive financial data.</p>
            </form>
          ) : selectedId ? (
            <div>
              <button type="button" onClick={() => { setSelectedId(null); setError(""); }} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-biz-blue hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> My Tickets</button>
              {detail.isLoading ? <p className="py-10 text-center text-sm text-biz-muted">Loading ticket...</p> : detail.isError ? <p className="text-sm text-red-600">{errorText(detail.error)}</p> : detail.data && <>
                <div className="rounded-xl border border-biz-border bg-white p-4">
                  <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-bold text-biz-navy">{detail.data.subject}</h3><span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-biz-blue">{STATUSES[detail.data.status]}</span></div>
                  <p className="mt-1 text-xs text-biz-muted">Ticket #{detail.data.number} · {detail.data.moduleName} · {formatDate(detail.data.createdAt)}</p>
                  <div className="mt-3 flex gap-2">{detail.data.status === "RESOLVED" && <button type="button" disabled={updateStatus.isPending} onClick={() => changeStatus("CLOSED")} className="rounded-md border border-biz-border px-2.5 py-1.5 text-xs font-semibold text-biz-navy hover:bg-slate-50">Close ticket</button>}{["RESOLVED", "CLOSED"].includes(detail.data.status) && <button type="button" disabled={updateStatus.isPending} onClick={() => changeStatus("OPEN")} className="rounded-md border border-biz-border px-2.5 py-1.5 text-xs font-semibold text-biz-blue hover:bg-blue-50">Reopen</button>}</div>
                </div>
                <div className="mt-4 space-y-3">{detail.data.messages.map((message) => <article key={message.id} className={`rounded-xl border p-3 ${message.authorType === "SUPPORT" ? "border-blue-200 bg-blue-50" : "border-biz-border bg-white"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-biz-navy">{message.authorName}{message.authorType === "SUPPORT" ? " · Support" : ""}</span><time className="text-[10px] text-biz-muted">{formatDate(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm text-biz-navy">{message.body}</p>{message.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{message.attachments.map((attachment) => <button key={attachment.id} type="button" onClick={() => download(detail.data!.id, attachment.id, attachment.fileName)} className="inline-flex max-w-full items-center gap-1 rounded-md border border-biz-border bg-white px-2 py-1 text-[11px] text-biz-blue hover:bg-blue-50"><Download className="h-3 w-3" /><span className="max-w-48 truncate">{attachment.fileName}</span></button>)}</div>}</article>)}</div>
                {detail.data.status !== "CLOSED" && <form onSubmit={replyToTicket} className="mt-4 space-y-3 rounded-xl border border-biz-border bg-white p-3"><label htmlFor="support-reply" className="text-xs font-bold text-biz-navy">Reply to support</label><textarea id="support-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={5000} rows={3} required placeholder="Write your reply..." className="mt-1 w-full resize-y rounded-lg border border-biz-border p-2 text-sm outline-none focus:border-biz-blue" /><FilePicker files={replyFiles} setFiles={setReplyFiles} setError={setError} /><button type="submit" disabled={sendReply.isPending || !reply.trim()} className="inline-flex items-center gap-1 rounded-lg bg-biz-blue px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" /> {sendReply.isPending ? "Sending..." : "Send reply"}</button></form>}
              </>}
            </div>
          ) : (
            <div className="space-y-2">{list.isLoading ? <p className="py-10 text-center text-sm text-biz-muted">Loading tickets...</p> : list.isError ? <p className="text-sm text-red-600">{errorText(list.error)}</p> : list.data?.items.length ? <>{list.data.items.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} onClick={() => setSelectedId(ticket.id)} />)}{list.data.meta.totalPages > 1 && <div className="flex items-center justify-between pt-2 text-xs text-biz-muted"><button type="button" disabled={ticketPage <= 1} onClick={() => setTicketPage(ticketPage - 1)} className="rounded-md border border-biz-border bg-white px-2 py-1 disabled:opacity-40">Previous</button><span>{ticketPage} / {list.data.meta.totalPages}</span><button type="button" disabled={ticketPage >= list.data.meta.totalPages} onClick={() => setTicketPage(ticketPage + 1)} className="rounded-md border border-biz-border bg-white px-2 py-1 disabled:opacity-40">Next</button></div>}</> : <div className="rounded-xl border border-dashed border-biz-border bg-white px-5 py-10 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-biz-blue/50" /><p className="mt-2 text-sm font-semibold text-biz-navy">No tickets yet</p><p className="mt-1 text-xs text-biz-muted">Create a ticket to get help and track replies here.</p><button type="button" onClick={() => setTab("new")} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-biz-blue px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> New Ticket</button></div>}</div>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-biz-border bg-white px-4 py-3 sm:px-5">
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#128C4A] hover:underline"><MessageCircle className="h-4 w-4" /> WhatsApp instead</a>
          {tab === "new" && <button type="submit" form="new-support-ticket" disabled={create.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-biz-blue px-4 py-2 text-xs font-bold text-white hover:bg-biz-blue-dark disabled:opacity-50"><Send className="h-3.5 w-3.5" /> {create.isPending ? "Submitting..." : "Submit ticket"}</button>}
        </footer>
      </section>
    </div>, document.body,
  );
}
