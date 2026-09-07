"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  FileText,
  Info,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import {
  useCreateWorkIou,
  useMe,
  useSubmitWorkIou,
  useUpdateWorkIou,
  useUploadWorkIouAttachments,
  useWorkIou,
  useWorkIouOptions,
} from "@bizovix/api-client";
import type { CreateWorkIouInput, WorkIouPaymentMethod, WorkIouRecord } from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

type ExpenseFor = "TENDER" | "PROJECT";

interface WorkIouItem {
  id: string;
  date: string;
  description: string;
  expenseHeadId: string;
  paidTo: string;
  reference: string;
  amount: number;
}

interface LocalAttachment {
  id: string;
  name: string;
  size: number;
  file: File;
}

const FIELD =
  "h-[32px] w-full rounded-[5px] border border-[#dbe3ef] bg-white px-2.5 text-[9px] font-medium text-[#10244c] outline-none transition focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10 disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#8a97aa]";
const TABLE_FIELD =
  "h-[29px] w-full rounded-[4px] border border-[#dbe3ef] bg-white px-2 text-[8px] font-medium text-[#10244c] outline-none focus:border-[#1769e8] focus:ring-1 focus:ring-[#1769e8]/15";
const CARD = "overflow-hidden rounded-[6px] border border-[#dfe6f1] bg-white";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "pdf", "doc", "docx"]);

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function blankItem(date = localToday()): WorkIouItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date,
    description: "",
    expenseHeadId: "",
    paidTo: "",
    reference: "",
    amount: 0,
  };
}

function money(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayDate(value: string, fallback = "dd MMM yyyy") {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function fileSize(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function requiredLabel(label: string) {
  return (
    <span className="mb-1.5 block text-[8.5px] font-semibold text-[#173563]">
      {label} <span className="text-[#e43f4f]">*</span>
    </span>
  );
}

function optionalLabel(label: string) {
  return <span className="mb-1.5 block text-[8.5px] font-semibold text-[#173563]">{label}</span>;
}

function DateControl({
  value,
  onChange,
  compact = false,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  placeholder?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex items-center rounded-[5px] border border-[#dbe3ef] bg-white pl-2.5 pr-8 font-medium text-[#10244c]",
        compact ? "h-[29px] text-[8px]" : "h-[32px] text-[9px]",
      )}
    >
      {displayDate(value, placeholder)}
      <CalendarDays className="absolute right-2.5 h-3.5 w-3.5 text-[#36547f]" />
      <input
        type="date"
        aria-label="Select date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </span>
  );
}

function MoneyInput({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  ariaLabel: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={editing ? draft : money(value)}
      onFocus={() => {
        setDraft(value.toFixed(2));
        setEditing(true);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const parsed = Number(draft.replace(/,/g, ""));
        onChange(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
        setEditing(false);
      }}
      className={className}
    />
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-[40px] items-center justify-between border-b border-[#dfe6f1] px-3.5">
      <h2 className="text-[10.5px] font-bold text-[#10244c]">{title}</h2>
      {action}
    </div>
  );
}

export default function NewWorkIouPage() {
  const router = useRouter();
  const [editId, setEditId] = React.useState<string>();
  useSetBreadcrumb([
    { label: "Expenses" },
    { label: "IOU" },
    { label: "Work IOU" },
    { label: "New Work IOU" },
  ]);

  const me = useMe();
  const options = useWorkIouOptions();
  const existing = useWorkIou(editId);
  const createWorkIou = useCreateWorkIou();
  const updateWorkIou = useUpdateWorkIou();
  const submitWorkIou = useSubmitWorkIou();
  const uploadAttachments = useUploadWorkIouAttachments();
  const projectRows = options.data?.projects ?? [];
  const tenderRows = options.data?.tenders ?? [];
  const people = options.data?.people ?? [];
  const expenseHeads = options.data?.expenseHeads ?? [];

  const [contextProjectId, setContextProjectId] = React.useState("");
  const [iouDate, setIouDate] = React.useState(localToday);
  const [paidOn, setPaidOn] = React.useState(localToday);
  const [paidById, setPaidById] = React.useState("");
  const [paidToName, setPaidToName] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<WorkIouPaymentMethod>("CASH");
  const [referenceNo, setReferenceNo] = React.useState("");
  const [expenseFor, setExpenseFor] = React.useState<ExpenseFor>("TENDER");
  const [tenderId, setTenderId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [items, setItems] = React.useState<WorkIouItem[]>(() => [blankItem()]);
  const [remarks, setRemarks] = React.useState("");
  const [attachments, setAttachments] = React.useState<LocalAttachment[]>([]);
  const [otherCharges, setOtherCharges] = React.useState(0);
  const [discount, setDiscount] = React.useState(0);
  const [expectedSettlementDate, setExpectedSettlementDate] = React.useState("");
  const [settlementRemarks, setSettlementRemarks] = React.useState("");
  const [notice, setNotice] = React.useState<{ tone: "error" | "info"; text: string }>();
  const [persistedDraft, setPersistedDraft] = React.useState<WorkIouRecord | null>(null);
  const [success, setSuccess] = React.useState<{ title: string; text: string }>();
  const [saveMenuOpen, setSaveMenuOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const hydratedIdRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const id = new URLSearchParams(window.location.search).get("id");
      setEditId(id || undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    if (paidById || !me.data?.id) return;
    const userId = me.data.id;
    const timer = window.setTimeout(() => setPaidById(userId), 0);
    return () => window.clearTimeout(timer);
  }, [me.data?.id, paidById]);

  React.useEffect(() => {
    const record = existing.data;
    if (!record || hydratedIdRef.current === record.id) return;
    hydratedIdRef.current = record.id;
    setPersistedDraft(record);
    setIouDate(record.iouDate.slice(0, 10));
    setPaidOn(record.paidOn.slice(0, 10));
    setPaidById(record.paidById);
    setPaidToName(record.paidToName);
    setPaymentMethod(record.paymentMethod);
    setReferenceNo(record.referenceNo ?? "");
    setExpenseFor(record.expenseFor);
    setTenderId(record.tenderId ?? "");
    setProjectId(record.workId ?? "");
    setContextProjectId(record.workId ?? "");
    setPurpose(record.purpose);
    setRemarks(record.remarks ?? "");
    setOtherCharges(Number(record.otherCharges));
    setDiscount(Number(record.discount));
    setExpectedSettlementDate(record.expectedSettlementDate?.slice(0, 10) ?? "");
    setSettlementRemarks(record.settlementRemarks ?? "");
    setItems(
      record.items.length
        ? record.items.map((item) => ({
            id: item.id,
            date: item.expenseDate.slice(0, 10),
            description: item.description,
            expenseHeadId: item.expenseHeadId,
            paidTo: item.paidToName,
            reference: item.referenceNo ?? "",
            amount: Number(item.amount),
          }))
        : [blankItem(record.paidOn.slice(0, 10))],
    );
  }, [existing.data]);

  const selectedTender = tenderRows.find((row) => row.id === tenderId);
  const selectedProject = projectRows.find((row) => row.id === projectId);
  const payeeNames = React.useMemo(() => Array.from(new Set(people.map((person) => person.name))), [people]);

  const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalAmount = Math.max(0, subtotal + (Number(otherCharges) || 0) - (Number(discount) || 0));
  const dueAmount = totalAmount;

  function updateItem(id: string, patch: Partial<WorkIouItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    const item = { ...blankItem(paidOn || iouDate), paidTo: paidToName.trim() };
    setItems((current) => [...current, item]);
    window.requestAnimationFrame(() => document.getElementById(`iou-description-${item.id}`)?.focus());
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function handleFiles(fileList: FileList | File[]) {
    const accepted: LocalAttachment[] = [];
    const errors: string[] = [];
    const availableSlots = Math.max(
      0,
      10 - (persistedDraft?.attachments.length ?? 0) - attachments.length,
    );
    Array.from(fileList).forEach((file) => {
      if (accepted.length >= availableSlots) {
        if (!errors.includes("A Work IOU can have at most 10 attachments")) {
          errors.push("A Work IOU can have at most 10 attachments");
        }
        return;
      }
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ACCEPTED_EXTENSIONS.has(extension)) {
        errors.push(`${file.name}: unsupported file type`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: file is larger than 10MB`);
        return;
      }
      if (file.name.length > 255) {
        errors.push(`${file.name}: file name is too long`);
        return;
      }
      accepted.push({ id: `${Date.now()}-${file.name}-${file.size}`, name: file.name, size: file.size, file });
    });
    if (accepted.length) setAttachments((current) => [...current, ...accepted]);
    setNotice(
      errors.length
        ? { tone: "error", text: errors.join(". ") }
        : { tone: "info", text: "Files are ready and will be uploaded when the Work IOU is saved." },
    );
  }

  function hasItemContent(item: WorkIouItem) {
    return Boolean(
      item.description.trim() ||
        item.expenseHeadId ||
        item.paidTo.trim() ||
        item.reference.trim() ||
        item.amount > 0,
    );
  }

  function activeItems() {
    return items.filter(hasItemContent);
  }

  function missingFields(mode: "draft" | "submit") {
    const rows = activeItems();
    const missing = [
      !iouDate && "IOU Date",
      !paidOn && "Paid On",
      !paidById && "Paid By",
      !paidToName.trim() && "Paid To",
      !paymentMethod && "Payment Method",
      expenseFor === "TENDER" && !tenderId && "Tender",
      expenseFor === "PROJECT" && !projectId && "Project",
      !purpose.trim() && "Purpose / Description",
      mode === "submit" && rows.length === 0 && "at least one Expense Item",
      rows.some((item) => !item.date || !item.description.trim() || !item.expenseHeadId || !item.paidTo.trim() || item.amount <= 0) &&
        "complete Expense Item fields",
      discount > subtotal + otherCharges && "Discount cannot exceed subtotal plus other charges",
    ].filter(Boolean);
    return missing as string[];
  }

  function buildPayload(): CreateWorkIouInput {
    return {
      iouDate,
      paidOn,
      paidById,
      paidToName: paidToName.trim(),
      paymentMethod,
      referenceNo: referenceNo.trim() || null,
      expenseFor,
      tenderId: expenseFor === "TENDER" ? tenderId : null,
      workId: expenseFor === "PROJECT" ? projectId : null,
      purpose: purpose.trim(),
      remarks: remarks.trim() || null,
      otherCharges: otherCharges.toFixed(2),
      discount: discount.toFixed(2),
      expectedSettlementDate: expectedSettlementDate || null,
      settlementRemarks: settlementRemarks.trim() || null,
      items: activeItems().map((item) => ({
        expenseDate: item.date,
        description: item.description.trim(),
        expenseHeadId: item.expenseHeadId,
        paidToName: item.paidTo.trim(),
        referenceNo: item.reference.trim() || null,
        amount: item.amount.toFixed(2),
      })),
    };
  }

  async function handleSave(mode: "draft" | "submit") {
    setSaveMenuOpen(false);
    const missing = missingFields(mode);
    if (missing.length) {
      setNotice({ tone: "error", text: `Complete the required fields: ${missing.join(", ")}.` });
      return;
    }

    setNotice(undefined);
    let saved = persistedDraft;
    let currentChangesSaved = false;
    try {
      const payload = buildPayload();
      saved = saved
        ? await updateWorkIou.mutateAsync({
            id: saved.id,
            body: { ...payload, expectedVersion: saved.version },
          })
        : await createWorkIou.mutateAsync(payload);
      setPersistedDraft(saved);
      currentChangesSaved = true;

      if (attachments.length) {
        saved = await uploadAttachments.mutateAsync({
          id: saved.id,
          expectedVersion: saved.version,
          files: attachments.map((attachment) => attachment.file),
        });
        setPersistedDraft(saved);
        setAttachments([]);
      }

      if (mode === "submit") {
        saved = await submitWorkIou.mutateAsync({
          id: saved.id,
          body: { expectedVersion: saved.version },
        });
        setPersistedDraft(saved);
      }

      setSuccess({
        title: mode === "submit" ? "Work IOU submitted" : "Draft saved",
        text:
          mode === "submit"
            ? `${saved.iouNo} was saved and submitted successfully.`
            : `${saved.iouNo} was saved successfully as a draft.`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not save the Work IOU.";
      setNotice({
        tone: "error",
        text: currentChangesSaved && saved
          ? `${saved.iouNo} is saved as a draft, but the remaining action failed: ${detail}`
          : detail,
      });
    }
  }

  const isSaving =
    createWorkIou.isPending ||
    updateWorkIou.isPending ||
    submitWorkIou.isPending ||
    uploadAttachments.isPending ||
    Boolean(editId && existing.isLoading);

  return (
    <div className="min-h-full bg-[#f8faff] pb-3 text-[#0b1f4b]">
      {success && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#07152d]/40 p-4 backdrop-blur-[1px]">
          <div role="dialog" aria-modal="true" aria-labelledby="work-iou-success-title" className="w-full max-w-[390px] rounded-xl border border-[#dbe5f2] bg-white p-6 text-center shadow-2xl">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <h2 id="work-iou-success-title" className="mt-4 text-[18px] font-bold text-[#10244c]">{success.title}</h2>
            <p className="mt-2 text-[11px] leading-5 text-[#526887]">{success.text}</p>
            <p className="mt-2 text-[9px] text-[#718096]">No project expense, cash/bank transaction or journal entry was posted.</p>
            <button type="button" onClick={() => router.push("/expenses/iou/work")} className="mt-5 h-10 w-full rounded-md bg-[#0867e8] text-[11px] font-semibold text-white hover:bg-[#075bcf]">
              Go to Work IOU List
            </button>
          </div>
        </div>
      )}
      <header className="relative min-h-[118px] sm:min-h-[91px]">
        <div className="pt-1">
          <h1 className="text-[23px] font-bold leading-tight">{editId ? "Edit Work IOU" : "New Work IOU"}</h1>
          <p className="mt-1 text-[10px] text-[#40577f]">
            Record work/office related expenses paid on behalf of the organization.
          </p>
        </div>
        <label className="relative mt-2 block h-[43px] w-full rounded-[6px] border bg-white px-3 pt-1.5 sm:absolute sm:-top-[23px] sm:right-0 sm:mt-0 sm:w-[230px]">
          <span className="block text-[8px] text-[#38547f]">Select Project</span>
          <select
            value={contextProjectId}
            onChange={(event) => {
              const value = event.target.value;
              setContextProjectId(value);
              if (value) {
                setExpenseFor("PROJECT");
                setProjectId(value);
                setTenderId("");
              } else if (expenseFor === "PROJECT") {
                setProjectId("");
              }
            }}
            className="absolute inset-0 h-full w-full appearance-none bg-transparent px-3 pt-4 text-[10px] font-bold outline-none"
          >
            <option value="">Select Project</option>
            {projectRows.map((project) => (
              <option key={project.id} value={project.id}>{project.workName}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        </label>
        <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:absolute sm:bottom-0 sm:right-0 sm:mt-0 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <Link
            href="/expenses/iou/work"
            className="flex h-[33px] w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border border-[#d6deea] bg-white px-4 text-[9px] font-semibold text-[#173563] sm:w-auto"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Work IOU List
          </Link>
          <button
            type="button"
            onClick={() => handleSave("draft")}
            disabled={isSaving}
            className="flex h-[33px] w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border border-[#d6deea] bg-white px-4 text-[9px] font-semibold text-[#173563] disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            <Save className="h-3.5 w-3.5" /> {isSaving ? "Saving..." : "Save as Draft"}
          </button>
          <div className="relative flex h-[33px] w-full shrink-0 rounded-[5px] bg-[#0867e8] text-white sm:w-auto">
            <button
              type="button"
              onClick={() => handleSave("submit")}
              disabled={isSaving}
              className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-4 text-[9px] font-semibold disabled:cursor-wait disabled:opacity-60 sm:flex-none"
            >
              <Send className="h-3.5 w-3.5" /> {isSaving ? "Saving..." : "Save & Submit"}
            </button>
            <button
              type="button"
              aria-label="More save options"
              aria-expanded={saveMenuOpen}
              disabled={isSaving}
              onClick={() => setSaveMenuOpen((open) => !open)}
              className="flex w-9 items-center justify-center border-l border-white/25"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {saveMenuOpen && (
              <div className="absolute right-0 top-9 z-30 w-36 rounded-[5px] border bg-white p-1 text-[8.5px] text-[#173563] shadow-lg">
                <button type="button" onClick={() => handleSave("draft")} className="flex h-8 w-full items-center gap-2 rounded px-2 hover:bg-[#f2f6fc]">
                  <Save className="h-3.5 w-3.5" /> Save as Draft
                </button>
                <button type="button" onClick={() => handleSave("submit")} className="flex h-8 w-full items-center gap-2 rounded px-2 hover:bg-[#f2f6fc]">
                  <Send className="h-3.5 w-3.5" /> Save & Submit
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {notice && (
        <div
          className={cn(
            "mb-2 rounded-[5px] border px-3 py-2 text-[9px]",
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-blue-200 bg-blue-50 text-[#174a9b]",
          )}
        >
          {notice.text}
        </div>
      )}

      {options.isError && (
        <div className="mb-2 flex items-center justify-between rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-[9px] text-red-700">
          <span>Could not load people, tender, project and expense-category options.</span>
          <button type="button" onClick={() => options.refetch()} className="font-semibold underline">Retry</button>
        </div>
      )}
      {editId && existing.isError && (
        <div className="mb-2 flex items-center justify-between rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-[9px] text-red-700">
          <span>Could not load this Work IOU draft.</span>
          <button type="button" onClick={() => existing.refetch()} className="font-semibold underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,4fr)_minmax(250px,1fr)]">
        <main className="min-w-0 space-y-3">
          <section className={CARD}>
            <SectionHeader title="Work IOU Information" />
            <div className="space-y-3 p-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_.8fr]">
                <div>
                  {optionalLabel("IOU No.")}
                  <div className="flex h-[32px] items-center text-[9px] font-bold text-[#173563]">{persistedDraft?.iouNo ?? "Auto Generated"}</div>
                </div>
                <label>
                  {requiredLabel("IOU Date")}
                  <DateControl value={iouDate} onChange={setIouDate} />
                </label>
                <label>
                  {requiredLabel("Paid On")}
                  <DateControl value={paidOn} onChange={setPaidOn} />
                </label>
                <div>
                  {optionalLabel("Status")}
                  <div className="flex h-[32px] items-center">
                    <span className="rounded-[4px] bg-[#e7f1ff] px-2.5 py-1 text-[8px] font-semibold text-[#1169e8]">{persistedDraft?.status ?? "DRAFT"}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1.2fr_1fr]">
                <label>
                  {requiredLabel("Paid By (You)")}
                  <select value={paidById} onChange={(event) => setPaidById(event.target.value)} className={FIELD}>
                    {!people.some((person) => person.id === me.data?.id) && me.data?.id && (
                      <option value={me.data.id}>{me.data.name}</option>
                    )}
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>{person.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {requiredLabel("Paid To (On Behalf Of)")}
                  <input list="work-iou-header-payees" value={paidToName} onChange={(event) => setPaidToName(event.target.value)} placeholder="Enter person / company" className={FIELD} />
                  <datalist id="work-iou-header-payees">{payeeNames.map((name) => <option key={name} value={name} />)}</datalist>
                </label>
                <label>
                  {requiredLabel("Payment Method")}
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as WorkIouPaymentMethod)} className={FIELD}>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CARD">Card</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="MOBILE_BANKING">Mobile Financial Service</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label>
                  {optionalLabel("Reference No.")}
                  <input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} placeholder="e.g. Invoice No., Bill No." className={FIELD} />
                </label>
              </div>

              <fieldset>
                <legend>{requiredLabel("Expense For")}</legend>
                <div className="flex flex-wrap gap-8 text-[9px] font-medium text-[#173563]">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="expenseFor" checked={expenseFor === "TENDER"} onChange={() => { setExpenseFor("TENDER"); setProjectId(""); setContextProjectId(""); }} className="h-3.5 w-3.5 accent-[#0867e8]" />
                    Under Tender
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="expenseFor" checked={expenseFor === "PROJECT"} onChange={() => { setExpenseFor("PROJECT"); setTenderId(""); }} className="h-3.5 w-3.5 accent-[#0867e8]" />
                    Under Project
                  </label>
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label>
                  {optionalLabel("Tender ID")}
                  <select value={tenderId} onChange={(event) => setTenderId(event.target.value)} disabled={expenseFor !== "TENDER"} className={FIELD}>
                    <option value="">Select Tender</option>
                    {tenderRows.map((tender) => (
                      <option key={tender.id} value={tender.id}>{tender.tenderId || tender.id.slice(0, 8)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {optionalLabel("Tender Name")}
                  <input value={selectedTender?.workName ?? ""} readOnly className={FIELD} />
                </label>
                <label>
                  {optionalLabel("Project ID")}
                  <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setContextProjectId(event.target.value); }} disabled={expenseFor !== "PROJECT"} className={FIELD}>
                    <option value="">Select Project</option>
                    {projectRows.map((project) => (
                      <option key={project.id} value={project.id}>{project.id.slice(0, 8)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {optionalLabel("Project Name")}
                  <input value={selectedProject?.workName ?? ""} readOnly className={FIELD} />
                </label>
              </div>

              <label className="block">
                {requiredLabel("Purpose / Description")}
                <span className="relative block">
                  <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={500} className="h-[56px] w-full resize-none rounded-[5px] border border-[#dbe3ef] px-3 py-2 text-[9px] outline-none focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10" />
                  <span className="absolute bottom-1.5 right-2 text-[7.5px] text-[#64748b]">{purpose.length} / 500</span>
                </span>
              </label>
            </div>
          </section>

          <section className={CARD}>
            <SectionHeader
              title="Expense Items"
              action={
                <button type="button" onClick={addItem} className="flex h-[29px] items-center gap-1 rounded-[4px] bg-[#0867e8] px-3 text-[8.5px] font-semibold text-white">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
              }
            />
            <datalist id="work-iou-payees">
              {payeeNames.map((name) => <option key={name} value={name} />)}
            </datalist>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed text-left">
                <colgroup>
                  <col className="w-[34px]" />
                  <col className="w-[118px]" />
                  <col className="w-[178px]" />
                  <col className="w-[145px]" />
                  <col className="w-[158px]" />
                  <col className="w-[110px]" />
                  <col className="w-[120px]" />
                  <col className="w-[72px]" />
                </colgroup>
                <thead className="bg-[#f7f9fc] text-[7.5px] text-[#173563]">
                  <tr className="h-[34px] border-b border-[#dfe6f1]">
                    <th className="px-2.5">SL</th>
                    <th className="px-1.5">Date</th>
                    <th className="px-1.5">Description <span className="text-red-500">*</span></th>
                    <th className="px-1.5">Category <span className="text-red-500">*</span></th>
                    <th className="px-1.5">Paid To <span className="text-red-500">*</span></th>
                    <th className="px-1.5">Reference</th>
                    <th className="px-1.5 text-right">Amount (BDT) <span className="text-red-500">*</span></th>
                    <th className="px-1.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id} className="h-[38px] border-b border-[#e7edf5]">
                      <td className="px-2.5 text-[8px]">{index + 1}</td>
                      <td className="px-1.5"><DateControl value={item.date} onChange={(value) => updateItem(item.id, { date: value })} compact /></td>
                      <td className="px-1.5"><input id={`iou-description-${item.id}`} value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} className={TABLE_FIELD} /></td>
                      <td className="px-1.5">
                        <select value={item.expenseHeadId} onChange={(event) => updateItem(item.id, { expenseHeadId: event.target.value })} className={TABLE_FIELD}>
                          <option value="">Select category</option>
                          {expenseHeads.map((head) => <option key={head.id} value={head.id}>{head.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1.5"><input list="work-iou-payees" value={item.paidTo} onChange={(event) => updateItem(item.id, { paidTo: event.target.value })} className={TABLE_FIELD} /></td>
                      <td className="px-1.5"><input value={item.reference} onChange={(event) => updateItem(item.id, { reference: event.target.value })} className={TABLE_FIELD} /></td>
                      <td className="px-1.5">
                        <MoneyInput
                          ariaLabel={`Amount for item ${index + 1}`}
                          value={item.amount}
                          onChange={(amount) => updateItem(item.id, { amount })}
                          className={cn(TABLE_FIELD, "text-right font-semibold")}
                        />
                      </td>
                      <td className="px-1.5">
                        <div className="flex justify-center gap-1.5">
                          <button type="button" aria-label={`Edit item ${index + 1}`} onClick={() => document.getElementById(`iou-description-${item.id}`)?.focus()} className="rounded p-1 text-[#1169e8] hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" aria-label={`Delete item ${index + 1}`} onClick={() => removeItem(item.id)} className="rounded p-1 text-[#e43f4f] hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!items.length && (
                    <tr><td colSpan={8} className="h-16 text-center text-[8.5px] text-[#64748b]">No expense items. Use Add Item to create one.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="h-[34px] bg-[#fbfcfe] text-[8.5px] font-bold">
                    <td colSpan={5} className="px-3">Total Items: {activeItems().length}</td>
                    <td colSpan={2} className="px-2 text-right">Total Amount (BDT)</td>
                    <td className="px-3 text-right">{money(subtotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className={CARD}>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="border-b p-3 lg:border-b-0 lg:border-r">
                {optionalLabel("Remarks")}
                <span className="relative block">
                  <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={500} placeholder="Add any additional remarks..." className="h-[84px] w-full resize-none rounded-[5px] border border-[#dbe3ef] px-3 py-2 text-[8.5px] outline-none focus:border-[#1769e8]" />
                  <span className="absolute bottom-1.5 right-2 text-[7.5px] text-[#64748b]">{remarks.length} / 500</span>
                </span>
              </div>
              <div className="p-3">
                {optionalLabel("Attachments")}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); handleFiles(event.dataTransfer.files); }}
                  className="flex h-[56px] cursor-pointer flex-col items-center justify-center rounded-[5px] border border-dashed border-[#c9d5e5] bg-[#fbfcfe] text-center text-[8px] text-[#38547f]"
                >
                  <span className="flex items-center gap-2"><CloudUpload className="h-4 w-4 text-[#7486a3]" /> Drag & drop files here or <span className="font-semibold text-[#1169e8]">click to browse</span></span>
                  <span className="mt-1 text-[7.5px] text-[#718096]">Supported files: JPG, PNG, PDF, DOC, DOCX (Max 10MB)</span>
                </div>
                <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" onChange={(event) => { if (event.target.files) handleFiles(event.target.files); event.target.value = ""; }} className="hidden" />
                <div className="mt-2 space-y-1.5">
                  {(persistedDraft?.attachments ?? []).map((attachment) => (
                    <div key={attachment.id} className="flex min-h-[39px] items-center gap-2 rounded-[4px] border border-[#e1e7f0] px-2.5">
                      <FileText className="h-5 w-5 shrink-0 text-[#1169e8]" />
                      <span className="min-w-0 flex-1"><strong className="block truncate text-[8px]">{attachment.fileName}</strong><span className="block text-[7.5px] text-[#718096]">{fileSize(attachment.fileSize)} · Uploaded</span></span>
                    </div>
                  ))}
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex min-h-[39px] items-center gap-2 rounded-[4px] border border-[#e1e7f0] px-2.5">
                      <FileText className="h-5 w-5 shrink-0 text-[#e43f4f]" />
                      <span className="min-w-0 flex-1"><strong className="block truncate text-[8px]">{attachment.name}</strong><span className="block text-[7.5px] text-[#718096]">{fileSize(attachment.size)}</span></span>
                      <button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((file) => file.id !== attachment.id))} className="rounded p-1 text-[#e43f4f] hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>

        <aside className="min-w-0 space-y-3">
          <section className={CARD}>
            <SectionHeader title="Work IOU Summary" />
            <div className="space-y-4 p-4 text-[9px]">
              <div className="flex justify-between"><span>Total Items</span><strong>{activeItems().length}</strong></div>
              <div className="flex justify-between"><span>Subtotal (BDT)</span><strong>{money(subtotal)}</strong></div>
              <label className="flex items-center justify-between gap-3"><span>Other Charges (+)</span><MoneyInput ariaLabel="Other Charges" value={otherCharges} onChange={setOtherCharges} className={cn(FIELD, "w-[102px] text-right font-semibold")} /></label>
              <label className="flex items-center justify-between gap-3"><span>Discount (-)</span><MoneyInput ariaLabel="Discount" value={discount} onChange={setDiscount} className={cn(FIELD, "w-[102px] text-right font-semibold")} /></label>
              <div className="border-t pt-4">
                <div className="flex items-center justify-between"><strong>Total Amount (BDT)</strong><strong className="text-[18px] text-[#0867e8]">{money(totalAmount)}</strong></div>
              </div>
            </div>
          </section>

          <section className={CARD}>
            <SectionHeader title="Settlement Information" />
            <div className="space-y-4 p-4 text-[9px]">
              <div className="flex items-center justify-between"><span>Settlement Status</span><span className="rounded-[4px] bg-[#fff2d8] px-2.5 py-1 text-[8px] font-semibold text-[#ca8610]">Pending</span></div>
              <div className="flex items-center justify-between gap-3"><span>Settled Amount (BDT)</span><strong>0.00</strong></div>
              <div className="flex items-center justify-between"><span>Due Amount (BDT)</span><strong className="text-[#e43f4f]">{money(dueAmount)}</strong></div>
              <label className="block">
                {optionalLabel("Expected Settlement Date")}
                <DateControl value={expectedSettlementDate} onChange={setExpectedSettlementDate} placeholder="dd MMM yyyy" />
              </label>
              <label className="block">
                {optionalLabel("Remarks")}
                <span className="relative block">
                  <textarea value={settlementRemarks} onChange={(event) => setSettlementRemarks(event.target.value)} maxLength={300} placeholder="Add settlement remarks..." className="h-[88px] w-full resize-none rounded-[5px] border border-[#dbe3ef] px-2.5 py-2 text-[8.5px] outline-none focus:border-[#1769e8]" />
                  <span className="absolute bottom-1.5 right-2 text-[7.5px] text-[#64748b]">{settlementRemarks.length} / 300</span>
                </span>
              </label>
            </div>
          </section>
        </aside>
      </div>

      <div className="mt-3 flex min-h-[37px] items-center gap-3 rounded-[5px] border border-[#dbe7f7] bg-[#f1f6fe] px-3 text-[8.5px] text-[#29466f]">
        <Info className="h-4 w-4 shrink-0 text-[#1169e8]" />
        <span>This IOU will be settled when the amount is paid back to you. You can track settlement from Work IOU list.</span>
      </div>
    </div>
  );
}
