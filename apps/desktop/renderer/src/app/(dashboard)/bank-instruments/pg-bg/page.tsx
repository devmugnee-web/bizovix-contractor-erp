"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  Info,
  Lightbulb,
  Search,
} from "lucide-react";
import {
  useAcceptNoa,
  useBankAccounts,
  useEligiblePgBgTenders,
  useFinalizePgBg,
  useOrganizationContacts,
  usePgBgWorkflowByDocument,
  useSavePgBgDraft,
  useWorkCategories,
} from "@bizovix/api-client";
import type { EligiblePgBgTender, PgBgEligibleQuery, SavePgBgWorkflowInput } from "@bizovix/types";
import { pgBgWorkflowSchema, type PgBgWorkflowFormValues } from "@bizovix/validation";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const DEFAULT_QUERY: PgBgEligibleQuery = { page: 1, limit: 5 };
const STEPS = [
  ["Select Tender", "Required"],
  ["NOA Information", "Enter NOA details"],
  ["Accept NOA", "Confirm & proceed"],
  ["PG/BG Details", "Setup guarantee"],
  ["Review & Save", "Finalize"],
] as const;

function money(value: number | string | undefined) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Field({ label, error, children }: { label: React.ReactNode; error?: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1 block text-[12px] font-semibold leading-4 text-biz-navy">{label}</span>{children}{error && <span className="mt-1 block text-[11px] font-medium text-biz-danger">{error}</span>}</label>;
}

const inputClass = "h-9 w-full rounded-md border border-biz-border bg-white px-2.5 text-[12px] font-medium text-biz-navy outline-none placeholder:font-normal placeholder:text-biz-muted focus:border-biz-blue";

function ChoiceCard({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 text-left text-[11px] font-semibold leading-4", selected ? "border-biz-blue bg-biz-blue-soft text-biz-blue" : "border-biz-border bg-white text-biz-navy")}><span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border", selected ? "border-biz-blue" : "border-[#B8C3D6]")}>{selected && <span className="h-1.5 w-1.5 rounded-full bg-biz-blue" />}</span>{label}</button>;
}

export default function PgBgPage() {
  useSetBreadcrumb([
    { label: "Bank Instruments" },
    { label: "PG/BG Management", href: "/bank-instruments/pg-bg" },
    { label: "Accept NOA & Create PG/BG" },
  ]);

  const [query, setQuery] = React.useState<PgBgEligibleQuery>(DEFAULT_QUERY);
  const eligible = useEligiblePgBgTenders(query);
  const [selectedState, setSelectedState] = React.useState<EligiblePgBgTender | null>(null);
  const selected = selectedState ?? eligible.data?.items[0] ?? null;
  const workflowQuery = usePgBgWorkflowByDocument(selected?.id ?? "");
  const categories = useWorkCategories();
  const contacts = useOrganizationContacts(selected?.organizationMaster.id);
  const bankAccounts = useBankAccounts();
  const saveDraftMutation = useSavePgBgDraft();
  const acceptNoaMutation = useAcceptNoa();
  const finalizeMutation = useFinalizePgBg();
  const [currentStep, setCurrentStep] = React.useState(1);
  const [pgDetailsOpen, setPgDetailsOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [workflowId, setWorkflowId] = React.useState("");
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const [guarantee, setGuarantee] = React.useState({ type: "PG" as "PG" | "BG", bankAccountId: "", instrumentNo: "", amount: "", issueDate: "2024-05-16", expiryDate: "2025-05-15" });

  const { control, register, handleSubmit, setValue, getValues, reset, formState: { errors } } = useForm<PgBgWorkflowFormValues>({
    resolver: zodResolver(pgBgWorkflowSchema),
    defaultValues: {
      documentPurchaseId: "",
      noaDate: "2024-05-15",
      noaAmount: 12500000,
      workCategory: "LED Display",
      contact: { name: "Md. Mahbubur Rahman", designation: "Executive Engineer", mobile: "01712-345678", email: "mahbub.dphe@gov.bd", address: "DPHE Office, Patuakhali, Patuakhali Sadar, Patuakhali - 8600, Bangladesh" },
      acceptNoa: true,
      pgBgRequired: true,
      currentStep: 1,
    },
  });
  const values = useWatch({ control });

  React.useEffect(() => {
    if (!selected) return;
    setValue("documentPurchaseId", selected.id);
  }, [selected, setValue]);

  React.useEffect(() => {
    const draft = workflowQuery.data;
    if (!draft) return;
    const timer = window.setTimeout(() => {
      setWorkflowId(draft.id);
      setCurrentStep(draft.currentStep);
      reset({
        documentPurchaseId: draft.documentPurchaseId,
        noaDate: draft.noaDate?.slice(0, 10) ?? "",
        noaAmount: Number(draft.noaAmount ?? 0),
        workCategory: draft.workCategory ?? "",
        contact: draft.contact ? { name: draft.contact.name, designation: draft.contact.designation, mobile: draft.contact.mobile, email: draft.contact.email ?? "", address: draft.contact.address } : { name: "", designation: "", mobile: "", email: "", address: "" },
        acceptNoa: draft.acceptNoa ?? true,
        pgBgRequired: draft.pgBgRequired ?? true,
        currentStep: draft.currentStep,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workflowQuery.data, reset]);

  function payload(step = currentStep): SavePgBgWorkflowInput {
    const form = getValues();
    return { ...form, documentPurchaseId: selected?.id ?? form.documentPurchaseId, currentStep: step };
  }

  async function saveDraft() {
    if (!selected) return setMessage({ type: "error", text: "Select a tender first." });
    try {
      const draft = await saveDraftMutation.mutateAsync(payload());
      setWorkflowId(draft.id);
      setMessage({ type: "success", text: "Draft saved successfully." });
    } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save draft." }); }
  }

  const proceed = handleSubmit(async (form) => {
    if (!selected) return;
    try {
      const nextStep = form.acceptNoa ? (form.pgBgRequired ? 4 : 5) : 3;
      const draft = await saveDraftMutation.mutateAsync({ ...form, documentPurchaseId: selected.id, currentStep: nextStep });
      const decided = await acceptNoaMutation.mutateAsync({ id: draft.id, acceptNoa: form.acceptNoa, pgBgRequired: form.pgBgRequired });
      setWorkflowId(decided.id);
      setCurrentStep(nextStep);
      setValue("currentStep", nextStep);
      if (form.acceptNoa && form.pgBgRequired) setPgDetailsOpen(true);
      setMessage({ type: "success", text: form.acceptNoa ? (form.pgBgRequired ? "NOA accepted. Complete PG/BG details." : "NOA accepted and work moved to ongoing works.") : "NOA rejection saved." });
    } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not continue workflow." }); }
  });

  async function finalize() {
    if (!workflowId) return setMessage({ type: "error", text: "Accept the NOA before finalizing PG/BG." });
    try {
      await finalizeMutation.mutateAsync({ id: workflowId, payload: { ...guarantee, amount: Number(guarantee.amount) } });
      setCurrentStep(5); setReviewOpen(true); setMessage({ type: "success", text: "PG/BG created and work finalized successfully." });
    } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to finalize PG/BG." }); }
  }

  const meta = eligible.data?.meta ?? { page: 1, limit: 5, total: 0, totalPages: 1 };
  const pageItems = eligible.data?.items ?? [];
  const timelineStep = Math.max(1, Math.min(currentStep, 5));

  return <div id="pg-bg-page" className="flex flex-col gap-3 text-biz-text antialiased">
    <style jsx global>{`
      #pg-bg-page { text-rendering: optimizeLegibility; }
      #pg-bg-page .text-\\[8px\\] { font-size: 10px; line-height: 14px; }
      #pg-bg-page .text-\\[9px\\] { font-size: 11px; line-height: 16px; }
      #pg-bg-page .text-\\[10px\\] { font-size: 11px; line-height: 16px; }
      #pg-bg-page .text-\\[11px\\] { font-size: 12px; line-height: 17px; }
      #pg-bg-page .text-\\[12px\\] { font-size: 13px; line-height: 18px; }
      #pg-bg-page .text-biz-muted { font-weight: 500; }
      #pg-bg-page input, #pg-bg-page select, #pg-bg-page button { letter-spacing: 0; }
    `}</style>
    <div><h1 className="text-[23px] font-bold leading-7 text-biz-navy">Accept NOA &amp; Create PG/BG</h1><p className="text-[12px] text-biz-muted">Select an existing tender, accept NOA and setup PG/BG details.</p></div>
    {message && <div className={cn("rounded-md border px-3 py-2 text-[11px] font-medium", message.type === "success" ? "border-biz-success/20 bg-biz-success-soft text-biz-success" : "border-biz-danger/20 bg-biz-danger-soft text-biz-danger")}>{message.text}</div>}

    <div className="rounded-md border border-biz-border bg-white px-4 py-3 shadow-card">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:gap-0">{STEPS.map(([title, subtitle], index) => { const step = index + 1; const active = step === timelineStep; const complete = step < timelineStep; return <div key={title} className="relative flex items-center gap-2 sm:pr-3"><span className={cn("relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold", active || complete ? "border-biz-blue bg-biz-blue text-white" : "border-[#A9B7CC] bg-white text-biz-navy")}>{complete ? <Check className="h-3.5 w-3.5" /> : step}</span><span className="min-w-0"><span className={cn("block truncate text-[10px] font-bold", active ? "text-biz-blue" : "text-biz-navy")}>{title}</span><span className={cn("block truncate text-[8px]", active ? "text-biz-blue" : "text-biz-muted")}>{subtitle}</span></span>{index < 4 && <span className="absolute left-[calc(100%-10px)] top-3.5 hidden h-px w-5 bg-[#CCD7E7] sm:block" />}</div>; })}</div>
    </div>

    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,4.2fr)_minmax(220px,1fr)]">
      <div className="min-w-0 space-y-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.45fr)]">
          <section className="overflow-hidden rounded-md border border-biz-border bg-white shadow-card">
            <div className="px-4 py-3"><h2 className="text-[13px] font-bold text-biz-navy">1. Select Tender <span className="ml-1 text-[10px] text-biz-blue">Required</span></h2><p className="mt-0.5 text-[9px] text-biz-muted">Select a tender from Document Purchase list.</p><label className="relative mt-2 block"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-biz-muted" /><input value={query.search ?? ""} onChange={(event) => setQuery({ ...query, page: 1, search: event.target.value })} placeholder="Search by Tender ID or Work Name..." className={`${inputClass} pl-9`} /></label></div>
            <div className="overflow-x-auto border-y border-biz-border"><table className="w-full min-w-[520px] text-[9px]"><thead className="bg-[#F7FAFF] font-semibold text-biz-navy"><tr><th className="w-7 px-2 py-2" /><th className="px-2 py-2 text-left">Tender ID</th><th className="px-2 py-2 text-left">Work / Project Name</th><th className="px-2 py-2 text-left">Organization</th><th className="px-2 py-2 text-right">Tender Sec.</th><th className="px-2 py-2 text-center">Action</th></tr></thead><tbody>{eligible.isLoading ? <tr><td colSpan={6} className="px-3 py-8 text-center text-biz-muted">Loading eligible tenders...</td></tr> : pageItems.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-biz-muted">No eligible tenders found.</td></tr> : pageItems.map((row) => { const active = selected?.id === row.id; return <tr key={row.id} className="border-t border-biz-border"><td className="px-2 py-2"><button type="button" onClick={() => { setSelectedState(row); setWorkflowId(""); setCurrentStep(1); }} className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-full border", active ? "border-biz-blue" : "border-[#B8C3D6]")}>{active && <span className="h-1.5 w-1.5 rounded-full bg-biz-blue" />}</button></td><td className="px-2 py-2 font-semibold text-biz-navy">{row.tenderId}</td><td className="max-w-[145px] truncate px-2 py-2">{row.tenderWorkName}</td><td className="px-2 py-2 font-semibold">{row.organizationMaster.shortName}</td><td className="px-2 py-2 text-right">BDT {money(row.tenderSecurityAmount)}</td><td className="px-2 py-2 text-center"><button type="button" onClick={() => setSelectedState(row)} className={cn("rounded border px-2 py-1 font-semibold", active ? "border-biz-success/30 bg-biz-success-soft text-biz-success" : "border-biz-blue text-biz-blue")}>{active ? "Selected" : "Select"}</button></td></tr>; })}</tbody></table></div>
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-[9px]"><span className="text-biz-muted">Showing {meta.total ? (meta.page - 1) * meta.limit + 1 : 0} to {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} entries</span><div className="flex gap-1"><button disabled={meta.page <= 1} onClick={() => setQuery({ ...query, page: meta.page - 1 })} className="flex h-6 w-6 items-center justify-center rounded border border-biz-border"><ChevronLeft className="h-3 w-3" /></button>{Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => i + 1).map((page) => <button key={page} onClick={() => setQuery({ ...query, page })} className={cn("h-6 min-w-6 rounded border px-1", page === meta.page ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border")}>{page}</button>)}<button disabled={meta.page >= meta.totalPages} onClick={() => setQuery({ ...query, page: meta.page + 1 })} className="flex h-6 w-6 items-center justify-center rounded border border-biz-border"><ChevronRight className="h-3 w-3" /></button></div></div>
            <div className="mx-3 mb-3 flex items-start gap-2 rounded-md border border-biz-blue/20 bg-biz-blue-soft px-3 py-2 text-[9px] text-biz-blue"><Info className="h-3.5 w-3.5 shrink-0" /><span>If you don&apos;t find the tender here, please purchase the document first from Document Purchase.</span></div>
          </section>

          <section className="rounded-md border border-biz-border bg-white p-4 shadow-card">
            <h2 className="mb-3 text-[13px] font-bold text-biz-navy">2. NOA Information</h2>
            <div className="grid grid-cols-[1.6fr_0.8fr] gap-2"><Field label="Tender / Work Name"><input readOnly value={selected?.tenderWorkName ?? ""} className={`${inputClass} bg-biz-bg`} /></Field><Field label="Organization"><input readOnly value={selected?.organizationMaster.shortName ?? ""} className={`${inputClass} bg-biz-bg`} /></Field></div>
            <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-4"><Field label="Tender ID (Optional)"><input readOnly value={selected?.tenderId ?? ""} className={`${inputClass} bg-biz-bg`} /></Field><Field label="Tender Security (BDT)"><input readOnly value={money(selected?.tenderSecurityAmount)} className={`${inputClass} bg-biz-bg text-right`} /></Field><Field label={<>NOA Date <span className="text-biz-danger">*</span></>} error={errors.noaDate?.message}><span className="relative block"><CalendarDays className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-biz-muted" /><input type="date" {...register("noaDate")} className={`${inputClass} pl-8`} /></span></Field><Field label={<>NOA Amount (BDT) <span className="text-biz-danger">*</span></>} error={errors.noaAmount?.message}><input type="number" {...register("noaAmount", { valueAsNumber: true })} className={`${inputClass} text-right`} /></Field></div>
            <div className="mt-2 w-full sm:w-[240px]"><Field label={<>Work Category <span className="text-biz-danger">*</span></>} error={errors.workCategory?.message}><select {...register("workCategory")} className={inputClass}>{(["LED Display", ...(categories.data ?? [])].filter((item, index, all) => all.indexOf(item) === index)).map((item) => <option key={item}>{item}</option>)}</select></Field></div>
            <div className="my-3 border-t border-biz-border" /><h3 className="mb-2 text-[11px] font-bold text-biz-blue">PE / Contact Person</h3>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4"><Field label={<>PE Name <span className="text-biz-danger">*</span></>} error={errors.contact?.name?.message}><input list="contact-names" {...register("contact.name")} className={inputClass} /><datalist id="contact-names">{contacts.data?.map((contact) => <option key={contact.id} value={contact.name} />)}</datalist></Field><Field label={<>Designation <span className="text-biz-danger">*</span></>} error={errors.contact?.designation?.message}><input {...register("contact.designation")} className={inputClass} /></Field><Field label={<>Mobile Number <span className="text-biz-danger">*</span></>} error={errors.contact?.mobile?.message}><input {...register("contact.mobile")} className={inputClass} /></Field><Field label="Email (Optional)" error={errors.contact?.email?.message}><input type="email" {...register("contact.email")} className={inputClass} /></Field></div>
            <div className="mt-2"><Field label={<>Address <span className="text-biz-danger">*</span></>} error={errors.contact?.address?.message}><input {...register("contact.address")} className={inputClass} /></Field></div>
            <div className="mt-2 flex items-center gap-2 rounded-md bg-biz-success-soft px-3 py-2 text-[9px] font-medium text-biz-success"><Check className="h-3.5 w-3.5" />PE / Contact information will be saved in {selected?.organizationMaster.shortName ?? "organization"} contact list.</div>
            <div className="mt-3 grid grid-cols-1 gap-4 border-t border-biz-border pt-3 sm:grid-cols-2"><div><h3 className="text-[11px] font-bold text-biz-navy">3. Accept NOA</h3><p className="mb-2 mt-1 text-[9px] text-biz-muted">Do you want to accept this NOA?</p><div className="grid grid-cols-2 gap-2"><ChoiceCard selected={values.acceptNoa === true} label="Yes, Accept NOA" onClick={() => setValue("acceptNoa", true)} /><ChoiceCard selected={values.acceptNoa === false} label="No, Do not accept" onClick={() => setValue("acceptNoa", false)} /></div></div><div><h3 className="text-[11px] font-bold text-biz-navy">4. PG/BG Required?</h3><p className="mb-2 mt-1 text-[9px] text-biz-muted">Is PG or BG required for this work?</p><div className="grid grid-cols-2 gap-2"><ChoiceCard selected={values.pgBgRequired === true} label="Yes, PG/BG is required" onClick={() => setValue("pgBgRequired", true)} /><ChoiceCard selected={values.pgBgRequired === false} label="No, not required" onClick={() => setValue("pgBgRequired", false)} /></div></div></div>
            <div className="mt-3 flex items-start gap-2 rounded-md bg-biz-blue-soft px-3 py-2 text-[9px] text-biz-blue"><Info className="h-3.5 w-3.5 shrink-0" />Most tender/work requires PG or BG. If not required, the work will be moved to Ongoing Works (CMS) after saving.</div>
          </section>
        </div>

        <section className="rounded-md border border-biz-border bg-white shadow-card"><button type="button" onClick={() => setPgDetailsOpen((open) => !open)} className="flex w-full items-center gap-3 px-4 py-3 text-left"><span className="text-[12px] font-bold text-biz-navy">5. PG/BG Details</span><span className="flex-1 text-[10px] text-biz-muted">Enter PG/BG information, bank, loan/cash, margin, interest etc.</span>{pgDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{pgDetailsOpen && <div className="grid grid-cols-2 gap-3 border-t border-biz-border p-4 lg:grid-cols-6"><Field label="Type"><select value={guarantee.type} onChange={(e) => setGuarantee({ ...guarantee, type: e.target.value as "PG" | "BG" })} className={inputClass}><option value="PG">PG</option><option value="BG">BG</option></select></Field><Field label="Bank"><select value={guarantee.bankAccountId} onChange={(e) => setGuarantee({ ...guarantee, bankAccountId: e.target.value })} className={inputClass}><option value="">Select bank</option>{bankAccounts.data?.filter((a) => a.accountType === "BANK").map((a) => <option key={a.id} value={a.id}>{a.bankName}</option>)}</select></Field><Field label="Instrument No."><input value={guarantee.instrumentNo} onChange={(e) => setGuarantee({ ...guarantee, instrumentNo: e.target.value })} className={inputClass} /></Field><Field label="Amount"><input type="number" value={guarantee.amount} onChange={(e) => setGuarantee({ ...guarantee, amount: e.target.value })} className={inputClass} /></Field><Field label="Issue Date"><input type="date" value={guarantee.issueDate} onChange={(e) => setGuarantee({ ...guarantee, issueDate: e.target.value })} className={inputClass} /></Field><Field label="Expiry Date"><input type="date" value={guarantee.expiryDate} onChange={(e) => setGuarantee({ ...guarantee, expiryDate: e.target.value })} className={inputClass} /></Field><div className="col-span-full flex justify-end"><button type="button" onClick={finalize} disabled={finalizeMutation.isPending} className="h-8 rounded-md bg-biz-blue px-4 text-[10px] font-semibold text-white">{finalizeMutation.isPending ? "Saving..." : "Create PG/BG"}</button></div></div>}</section>
        <section className="rounded-md border border-biz-border bg-white shadow-card"><button type="button" onClick={() => setReviewOpen((open) => !open)} className="flex w-full items-center gap-3 px-4 py-3 text-left"><span className="text-[12px] font-bold text-biz-navy">6. Review &amp; Save</span><span className="flex-1 text-[10px] text-biz-muted">Review all information and save.</span>{reviewOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{reviewOpen && <div className="border-t border-biz-border px-4 py-3 text-[10px] text-biz-success">Workflow information is ready for final review.</div>}</section>
      </div>

      <aside className="space-y-3">
        <section className="rounded-md border border-biz-border bg-white p-3 shadow-card"><h2 className="mb-2 text-[12px] font-bold text-biz-navy">Work Summary</h2>{[["Organization", selected?.organizationMaster.shortName], ["Tender / Work", selected?.tenderWorkName], ["Tender ID", selected?.tenderId], ["NOA Date", displayDate(values.noaDate)], ["NOA Amount (BDT)", money(values.noaAmount)], ["Work Category", values.workCategory], ["PE Name", values.contact?.name]].map(([label, value]) => <div key={label} className="grid grid-cols-[0.85fr_1.15fr] gap-2 border-t border-biz-border py-2 text-[9px]"><span className="text-biz-muted">{label}</span><span className="break-words text-right font-semibold text-biz-navy">{value || "-"}</span></div>)}</section>
        <section className="rounded-md border border-biz-border bg-white p-3 shadow-card"><h2 className="mb-3 text-[12px] font-bold text-biz-navy">Process Timeline</h2><div>{STEPS.map(([title], index) => { const step = index + 1; const active = step === timelineStep; const complete = step < timelineStep; return <div key={title} className="relative flex gap-2 pb-3 last:pb-0"><span className={cn("relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold", active || complete ? "border-biz-blue bg-biz-blue text-white" : "border-[#B8C3D6] bg-white text-biz-muted")}>{complete ? <Check className="h-3 w-3" /> : step}</span>{step < 5 && <span className="absolute left-[11px] top-6 h-[calc(100%-18px)] w-px bg-biz-border" />}<div className={cn("flex-1 rounded px-2 py-1", active && "bg-biz-blue-soft")}><p className={cn("text-[9px] font-semibold", active ? "text-biz-blue" : "text-biz-navy")}>{title}</p><p className={cn("text-[8px]", active ? "text-biz-blue" : complete ? "text-biz-success" : "text-biz-muted")}>{active ? "In Progress" : complete ? "Completed" : "Pending"}</p></div></div>; })}</div></section>
        <section className="rounded-md border border-biz-warning/30 bg-biz-warning-soft p-3"><h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold text-biz-navy"><Lightbulb className="h-4 w-4 text-biz-warning" />Important Notes</h2><ul className="space-y-2 text-[9px] leading-4 text-biz-navy"><li>• You must select a tender from Document Purchase list.</li><li>• After accepting NOA, PG/BG can be created if required.</li><li>• All steps will be logged in the system.</li></ul></section>
      </aside>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 pb-2"><button type="button" className="h-9 rounded-md border border-biz-border bg-white px-5 text-[11px] font-semibold text-biz-navy">Cancel</button><div className="flex gap-2"><button type="button" onClick={saveDraft} disabled={saveDraftMutation.isPending} className="flex h-9 items-center gap-2 rounded-md border border-biz-blue bg-white px-4 text-[11px] font-semibold text-biz-blue"><FileText className="h-3.5 w-3.5" />{saveDraftMutation.isPending ? "Saving..." : "Save as Draft"}</button><button type="button" onClick={proceed} disabled={acceptNoaMutation.isPending} className="flex h-9 items-center gap-2 rounded-md bg-biz-blue px-5 text-[11px] font-semibold text-white">Next: PG/BG Details <ArrowRight className="h-3.5 w-3.5" /></button></div></div>
  </div>;
}
