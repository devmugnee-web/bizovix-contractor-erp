"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
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
} from "@bizovix/api-client";
import type {
  EligiblePgBgTender,
  PgBgEligibleQuery,
  SavePgBgWorkflowInput,
} from "@bizovix/types";
import { pgBgWorkflowSchema, type PgBgWorkflowFormValues } from "@bizovix/validation";
import { cn } from "@bizovix/ui";
import { SuccessPopup } from "@/components/layout/SuccessPopup";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

type UiStep = 1 | 2 | 3;

type CompletionState = {
  title: string;
  message: string;
  cmsWorkId: string | null;
};

type GuaranteeDraft = {
  type: "PG" | "BG";
  bankAccountId: string;
  instrumentNo: string;
  amount: string;
  issueDate: string;
  expiryDate: string;
};

const DEFAULT_QUERY: PgBgEligibleQuery = { page: 1, limit: 5 };
const STEPS = [
  ["Select Tender", "Choose one tender"],
  ["NOA & Decision", "Enter NOA and contact details"],
  ["PG/BG & Finish", "Review and create the work"],
] as const;

function money(value: number | string | undefined) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function displayDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isoDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function initialGuarantee(): GuaranteeDraft {
  return {
    type: "PG",
    bankAccountId: "",
    instrumentNo: "",
    amount: "",
    issueDate: isoDateInput(new Date()),
    expiryDate: isoDateInput(addMonths(new Date(), 12)),
  };
}

function initialContact(contact?: EligiblePgBgTender["paContact"]) {
  return {
    name: contact?.name ?? "", designation: contact?.designation ?? "",
    mobile: contact?.mobile ?? "", email: contact?.email ?? "", address: contact?.address ?? "",
  };
}

function initialForm(tender?: EligiblePgBgTender | null): PgBgWorkflowFormValues {
  return {
    documentPurchaseId: tender?.id ?? "",
    noaDate: "",
    noaAmount: 0,
    workCategory: tender?.category ?? "",
    contact: initialContact(tender?.paContact),
    acceptNoa: true,
    pgBgRequired: true,
    currentStep: 1,
  };
}

function paginationWindow(currentPage: number, totalPages: number) {
  const size = Math.min(5, totalPages);
  const maximumStart = Math.max(1, totalPages - size + 1);
  const start = Math.min(Math.max(1, currentPage - 2), maximumStart);
  return Array.from({ length: size }, (_, index) => start + index);
}

function Field({
  label,
  error,
  children,
}: {
  label: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12px] font-semibold leading-4 text-biz-navy">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] font-medium text-biz-danger">{error}</span>}
    </label>
  );
}

const inputClass =
  "h-9 w-full rounded-md border border-biz-border bg-white px-2.5 text-[12px] font-medium text-biz-navy outline-none placeholder:font-normal placeholder:text-biz-muted focus:border-biz-blue";

function ChoiceCard({
  selected,
  label,
  onClick,
  disabled = false,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-md border px-3 py-1.5 text-left text-[11px] font-semibold leading-4 disabled:cursor-not-allowed disabled:opacity-45",
        selected
          ? "border-biz-blue bg-biz-blue-soft text-biz-blue"
          : "border-biz-border bg-white text-biz-navy",
      )}
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-biz-blue" : "border-[#B8C3D6]",
        )}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-biz-blue" />}
      </span>
      {label}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[0.85fr_1.15fr] gap-2 border-t border-biz-border py-2 text-[10px]">
      <span className="text-biz-muted">{label}</span>
      <span className="break-words text-right font-semibold text-biz-navy">{value || "-"}</span>
    </div>
  );
}

export default function PgBgPage() {
  const router = useRouter();
  useSetBreadcrumb([
    { label: "Bank Instruments" },
    { label: "PG/BG Management", href: "/bank-instruments/pg-bg" },
    { label: "Accept NOA & Create PG/BG" },
  ]);

  const [query, setQuery] = React.useState<PgBgEligibleQuery>(DEFAULT_QUERY);
  const eligible = useEligiblePgBgTenders(query);
  const [selected, setSelected] = React.useState<EligiblePgBgTender | null>(null);
  const [uiStep, setUiStep] = React.useState<UiStep>(1);
  const [message, setMessage] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [completion, setCompletion] = React.useState<CompletionState | null>(null);
  const [guarantee, setGuarantee] = React.useState<GuaranteeDraft>(initialGuarantee);

  const workflowQuery = usePgBgWorkflowByDocument(selected?.id ?? "");
  const contacts = useOrganizationContacts(selected?.organizationMaster.id);
  const bankAccounts = useBankAccounts();
  const saveDraftMutation = useSavePgBgDraft();
  const acceptNoaMutation = useAcceptNoa();
  const finalizeMutation = useFinalizePgBg();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<PgBgWorkflowFormValues>({
    resolver: zodResolver(pgBgWorkflowSchema),
    defaultValues: initialForm(),
  });
  const values = useWatch({ control });
  const contactNameField = register("contact.name");

  React.useEffect(() => {
    const draft = workflowQuery.data;
    if (!selected || !draft || draft.documentPurchaseId !== selected.id) return;

    const timer = window.setTimeout(() => {
      reset({
        documentPurchaseId: draft.documentPurchaseId,
        noaDate: draft.noaDate?.slice(0, 10) ?? "",
        noaAmount: Number(draft.noaAmount ?? 0),
        workCategory: selected.category ?? "",
        contact: draft.contact
          ? {
              name: draft.contact.name,
              designation: draft.contact.designation,
              mobile: draft.contact.mobile,
              email: draft.contact.email ?? "",
              address: draft.contact.address,
            }
          : initialContact(selected.paContact),
        acceptNoa: draft.acceptNoa ?? true,
        pgBgRequired: draft.pgBgRequired ?? true,
        currentStep: draft.currentStep,
      });

      if (draft.status === "NOA_ACCEPTED" && draft.pgBgRequired) setUiStep(3);
      else if (draft.currentStep >= 2) setUiStep(2);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [reset, selected, workflowQuery.data]);

  const meta = eligible.data?.meta ?? { page: 1, limit: 5, total: 0, totalPages: 1 };
  const pageItems = eligible.data?.items ?? [];
  const visiblePages = paginationWindow(meta.page, meta.totalPages);
  const isDraftLookupPending = Boolean(selected) &&
    (workflowQuery.isLoading || workflowQuery.isFetching);
  const isWorking =
    saveDraftMutation.isPending || acceptNoaMutation.isPending || finalizeMutation.isPending;

  function selectTender(row: EligiblePgBgTender) {
    if (selected?.id === row.id) return;
    setSelected(row);
    setUiStep(1);
    setMessage(null);
    setCompletion(null);
    setGuarantee(initialGuarantee());
    reset(initialForm(row));
  }

  function resetFlow() {
    setSelected(null);
    setUiStep(1);
    setMessage(null);
    setCompletion(null);
    setGuarantee(initialGuarantee());
    setQuery(DEFAULT_QUERY);
    reset(initialForm());
  }

  function changeTender() {
    setSelected(null);
    setUiStep(1);
    setMessage(null);
    setCompletion(null);
    setGuarantee(initialGuarantee());
    reset(initialForm());
  }

  function draftPayload(step: number): SavePgBgWorkflowInput {
    const form = getValues();
    return {
      ...form,
      documentPurchaseId: selected?.id ?? form.documentPurchaseId,
      currentStep: step,
    };
  }

  async function saveDraft() {
    if (!selected) {
      setMessage({ type: "error", text: "Select a tender first." });
      return;
    }
    if (workflowQuery.isError) {
      setMessage({ type: "error", text: "Could not check the saved workflow. Retry first." });
      return;
    }

    setMessage(null);
    try {
      await saveDraftMutation.mutateAsync(draftPayload(2));
      setMessage({ type: "success", text: "Draft saved successfully." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save draft.",
      });
    }
  }

  const continueFromNoa = handleSubmit(async (form) => {
    if (!selected) return;
    setMessage(null);

    if (form.acceptNoa && form.pgBgRequired) {
      try {
        await saveDraftMutation.mutateAsync({
          ...form,
          documentPurchaseId: selected.id,
          currentStep: 2,
        });
        setUiStep(3);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Could not save the NOA information.",
        });
      }
      return;
    }

    try {
      const draft = await saveDraftMutation.mutateAsync({
        ...form,
        documentPurchaseId: selected.id,
        currentStep: 2,
      });
      const decided = await acceptNoaMutation.mutateAsync({
        id: draft.id,
        acceptNoa: form.acceptNoa,
        pgBgRequired: form.pgBgRequired,
      });

      setCompletion(
        form.acceptNoa
          ? {
              title: "Work Created Successfully",
              message: `NOA accepted successfully and “${selected.tenderWorkName}” has been moved to Ongoing Works.`,
              cmsWorkId: decided.cmsWorkId,
            }
          : {
              title: "NOA Decision Saved",
              message: `The NOA rejection for “${selected.tenderWorkName}” has been saved successfully.`,
              cmsWorkId: null,
            },
      );
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Could not complete the NOA decision.",
      });
    }
  });

  const finalizeWorkflow = handleSubmit(async (form) => {
    if (!selected) return;
    setMessage(null);

    const guaranteeAmount = Number(guarantee.amount);
    if (!guarantee.bankAccountId) {
      setMessage({ type: "error", text: "Select a bank account for the PG/BG." });
      return;
    }
    if (!Number.isFinite(guaranteeAmount) || guaranteeAmount <= 0) {
      setMessage({ type: "error", text: "Enter a valid PG/BG amount greater than 0." });
      return;
    }
    if (!guarantee.issueDate || !guarantee.expiryDate) {
      setMessage({ type: "error", text: "Issue date and expiry date are required." });
      return;
    }
    if (guarantee.expiryDate <= guarantee.issueDate) {
      setMessage({ type: "error", text: "Expiry date must be after the issue date." });
      return;
    }

    try {
      const draft = await saveDraftMutation.mutateAsync({
        ...form,
        documentPurchaseId: selected.id,
        currentStep: 4,
      });
      if (draft.status !== "NOA_ACCEPTED") {
        await acceptNoaMutation.mutateAsync({
          id: draft.id,
          acceptNoa: true,
          pgBgRequired: true,
        });
      }
      const finalized = await finalizeMutation.mutateAsync({
        id: draft.id,
        payload: { ...guarantee, amount: guaranteeAmount },
      });

      setCompletion({
        title: "Work Created Successfully",
        message: `PG/BG created successfully and “${selected.tenderWorkName}” has been moved to Ongoing Works.`,
        cmsWorkId: finalized.cmsWorkId,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to create PG/BG and ongoing work.",
      });
    }
  });

  function openCreatedWork() {
    const workId = completion?.cmsWorkId;
    setCompletion(null);
    router.push(workId ? `/cms/ongoing-works/${workId}` : "/cms/ongoing-works");
  }

  return (
    <div id="pg-bg-page" className="flex flex-col gap-3 text-biz-text antialiased">
      <style jsx global>{`
        #pg-bg-page { text-rendering: optimizeLegibility; }
        #pg-bg-page .text-\\[9px\\] { font-size: 10px; line-height: 14px; }
        #pg-bg-page .text-\\[10px\\] { font-size: 11px; line-height: 16px; }
        #pg-bg-page .text-\\[11px\\] { font-size: 12px; line-height: 17px; }
        #pg-bg-page .text-\\[12px\\] { font-size: 13px; line-height: 18px; }
        #pg-bg-page .text-biz-muted { font-weight: 500; }
        #pg-bg-page input, #pg-bg-page select, #pg-bg-page button { letter-spacing: 0; }
      `}</style>

      <SuccessPopup
        open={completion !== null}
        title={completion?.title}
        message={completion?.message ?? ""}
        onClose={resetFlow}
        primaryLabel={completion?.cmsWorkId ? "View Ongoing Work" : "Back to Tender Selection"}
        onPrimary={completion?.cmsWorkId ? openCreatedWork : resetFlow}
        secondaryLabel={completion?.cmsWorkId ? "Back to Tender Selection" : undefined}
        onSecondary={resetFlow}
        dismissOnBackdrop={false}
        dismissOnEscape={false}
      />

      <div>
        <h1 className="text-[23px] font-bold leading-7 text-biz-navy">
          Accept NOA &amp; Create PG/BG
        </h1>
        <p className="text-[12px] text-biz-muted">
          Complete the guided steps to create PG/BG and move the awarded work to Ongoing Works.
        </p>
      </div>

      {message && (
        <div
          role={message.type === "error" ? "alert" : "status"}
          className={cn(
            "rounded-md border px-3 py-2 text-[11px] font-medium",
            message.type === "success"
              ? "border-biz-success/20 bg-biz-success-soft text-biz-success"
              : "border-biz-danger/20 bg-biz-danger-soft text-biz-danger",
          )}
        >
          {message.text}
        </div>
      )}

      <div className="rounded-md border border-biz-border bg-white px-4 py-3 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-0">
          {STEPS.map(([title, subtitle], index) => {
            const step = (index + 1) as UiStep;
            const active = step === uiStep;
            const complete = step < uiStep;
            return (
              <div key={title} className="relative flex items-center gap-2 sm:pr-4">
                <span
                  className={cn(
                    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                    active || complete
                      ? "border-biz-blue bg-biz-blue text-white"
                      : "border-[#A9B7CC] bg-white text-biz-navy",
                  )}
                >
                  {complete ? <Check className="h-4 w-4" /> : step}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-[11px] font-bold",
                      active ? "text-biz-blue" : "text-biz-navy",
                    )}
                  >
                    {title}
                  </span>
                  <span className="block truncate text-[9px] text-biz-muted">{subtitle}</span>
                </span>
                {index < STEPS.length - 1 && (
                  <span className="absolute left-[calc(100%-14px)] top-4 hidden h-px w-7 bg-[#CCD7E7] sm:block" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-3">
          {uiStep === 1 && (
            <section className="overflow-hidden rounded-md border border-biz-border bg-white shadow-card">
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-[14px] font-bold text-biz-navy">
                    1. Select Tender <span className="ml-1 text-[10px] text-biz-blue">Required</span>
                  </h2>
                  <p className="mt-0.5 text-[10px] text-biz-muted">
                    Choose the awarded tender you want to process. Nothing is selected automatically.
                  </p>
                </div>
                <label className="relative block w-full sm:w-[330px]">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-biz-muted" />
                  <input
                    aria-label="Search eligible tenders"
                    value={query.search ?? ""}
                    onChange={(event) =>
                      setQuery({ ...query, page: 1, search: event.target.value })
                    }
                    placeholder="Search by Tender ID or Work Name..."
                    className={`${inputClass} pl-9`}
                  />
                </label>
              </div>

              <div className="overflow-x-auto border-y border-biz-border">
                <table className="w-full min-w-[720px] text-[10px]">
                  <thead className="bg-[#F7FAFF] font-semibold text-biz-navy">
                    <tr>
                      <th className="w-9 px-3 py-2" />
                      <th className="px-3 py-2 text-left">Tender ID</th>
                      <th className="px-3 py-2 text-left">Work / Project Name</th>
                      <th className="px-3 py-2 text-left">Organization</th>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligible.isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-biz-muted">
                          Loading eligible tenders...
                        </td>
                      </tr>
                    ) : eligible.isError ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-biz-danger">
                          <p className="font-semibold">Could not load eligible tenders.</p>
                          <button
                            type="button"
                            onClick={() => void eligible.refetch()}
                            className="mt-2 rounded border border-biz-danger/30 px-3 py-1 font-semibold"
                          >
                            Retry
                          </button>
                        </td>
                      </tr>
                    ) : pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-biz-muted">
                          No eligible tenders found.
                        </td>
                      </tr>
                    ) : (
                      pageItems.map((row) => {
                        const active = selected?.id === row.id;
                        const hasCategory = Boolean(row.category?.trim());
                        return (
                          <tr
                            key={row.id}
                            onClick={() => {
                              if (hasCategory) selectTender(row);
                            }}
                            className={cn(
                              "border-t border-biz-border transition-colors",
                              hasCategory
                                ? "cursor-pointer hover:bg-biz-blue-soft/30"
                                : "cursor-not-allowed bg-biz-bg/60 text-biz-muted",
                              active && "bg-biz-blue-soft/40",
                            )}
                          >
                            <td className="px-3 py-2.5">
                              <span
                                className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded-full border",
                                  active ? "border-biz-blue" : "border-[#B8C3D6]",
                                )}
                              >
                                {active && <span className="h-2 w-2 rounded-full bg-biz-blue" />}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-biz-navy">
                              {row.tenderId ?? "Manual"}
                            </td>
                            <td className="px-3 py-2.5">{row.tenderWorkName}</td>
                            <td className="px-3 py-2.5 font-semibold">
                              {row.organizationMaster.shortName}
                            </td>
                            <td className="px-3 py-2.5">{row.category ?? "Not set"}</td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                aria-pressed={active}
                                disabled={active || !hasCategory}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  selectTender(row);
                                }}
                                className={cn(
                                  "rounded border px-3 py-1 font-semibold",
                                  active
                                    ? "border-biz-success/30 bg-biz-success-soft text-biz-success"
                                    : "border-biz-blue text-biz-blue",
                                )}
                              >
                                {active ? "Selected" : hasCategory ? "Select" : "Add Category First"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2 px-3 py-2 text-[10px] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-biz-muted">
                    Showing {meta.total ? (meta.page - 1) * meta.limit + 1 : 0} to{" "}
                    {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} entries
                  </span>
                  <label className="flex items-center gap-1.5 font-medium text-biz-muted">
                    Show
                    <select
                      aria-label="Tenders per page"
                      value={meta.limit}
                      onChange={(event) =>
                        setQuery({ ...query, page: 1, limit: Number(event.target.value) })
                      }
                      className="h-7 rounded border border-biz-border bg-white px-2 text-[10px] font-semibold text-biz-navy outline-none focus:border-biz-blue"
                    >
                      {[5, 10, 20, 50].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    entries
                  </label>
                </div>
                {meta.totalPages > 1 && (
                  <div className="flex gap-1 self-end sm:self-auto">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={meta.page <= 1}
                    onClick={() => setQuery({ ...query, page: meta.page - 1 })}
                    className="flex h-7 w-7 items-center justify-center rounded border border-biz-border disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {visiblePages.map((page) => (
                    <button
                      type="button"
                      key={page}
                      aria-label={`Go to page ${page}`}
                      aria-current={page === meta.page ? "page" : undefined}
                      onClick={() => setQuery({ ...query, page })}
                      className={cn(
                        "h-7 min-w-7 rounded border px-1",
                        page === meta.page
                          ? "border-biz-blue bg-biz-blue text-white"
                          : "border-biz-border",
                      )}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={meta.page >= meta.totalPages}
                    onClick={() => setQuery({ ...query, page: meta.page + 1 })}
                    className="flex h-7 w-7 items-center justify-center rounded border border-biz-border disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  </div>
                )}
              </div>

              {selected && (isDraftLookupPending || workflowQuery.isError) && (
                <div
                  role={workflowQuery.isError ? "alert" : "status"}
                  className={cn(
                    "mx-3 mb-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[10px]",
                    workflowQuery.isError
                      ? "border-biz-danger/20 bg-biz-danger-soft text-biz-danger"
                      : "border-biz-blue/20 bg-biz-blue-soft text-biz-blue",
                  )}
                >
                  <span>
                    {workflowQuery.isError
                      ? "Could not check whether this tender has a saved workflow."
                      : "Checking for saved NOA information..."}
                  </span>
                  {workflowQuery.isError && (
                    <button
                      type="button"
                      onClick={() => void workflowQuery.refetch()}
                      className="shrink-0 rounded border border-current/30 px-3 py-1 font-semibold"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}

            </section>
          )}

          {uiStep > 1 && selected && (
            <section className="flex flex-col gap-3 rounded-md border border-biz-border bg-white px-4 py-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-biz-muted">
                  Selected Tender
                </p>
                <p className="mt-1 text-[13px] font-bold text-biz-navy">
                  {selected.tenderId ?? "Manual"} · {selected.tenderWorkName}
                </p>
                <p className="mt-0.5 text-[10px] text-biz-muted">
                  {selected.organizationMaster.shortName} · {selected.category ?? "Category not set"}
                </p>
              </div>
              <button
                type="button"
                disabled={isWorking}
                onClick={changeTender}
                className="h-8 rounded-md border border-biz-border bg-white px-3 text-[10px] font-semibold text-biz-blue disabled:opacity-50"
              >
                Change Tender
              </button>
            </section>
          )}

          {uiStep === 2 && selected && (
            <section className="rounded-md border border-biz-border bg-white p-4 shadow-card">
              <div className="mb-4">
                <h2 className="text-[14px] font-bold text-biz-navy">2. NOA &amp; Decision</h2>
                <p className="mt-0.5 text-[10px] text-biz-muted">
                  Enter the NOA, contact and acceptance decision for the selected tender.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Tender / Work Name">
                  <input
                    readOnly
                    value={selected.tenderWorkName}
                    className={`${inputClass} bg-biz-bg`}
                  />
                </Field>
                <Field label="Organization">
                  <input
                    readOnly
                    value={selected.organizationMaster.shortName}
                    className={`${inputClass} bg-biz-bg`}
                  />
                </Field>
                <Field
                  label={
                    <>
                      NOA Date <span className="text-biz-danger">*</span>
                    </>
                  }
                  error={errors.noaDate?.message}
                >
                  <span className="relative block">
                    <CalendarDays className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-biz-muted" />
                    <input
                      type="date"
                      {...register("noaDate")}
                      className={`${inputClass} pl-8`}
                    />
                  </span>
                </Field>
                <Field
                  label={
                    <>
                      NOA Amount (BDT) <span className="text-biz-danger">*</span>
                    </>
                  }
                  error={errors.noaAmount?.message}
                >
                  <input
                    type="number"
                    {...register("noaAmount", { valueAsNumber: true })}
                    className={`${inputClass} text-right`}
                  />
                </Field>
              </div>

              <div className="mt-3 max-w-sm">
                <Field
                  label="Work Category (From Document Purchase)"
                  error={errors.workCategory?.message}
                >
                  <input
                    readOnly
                    value={values.workCategory ?? ""}
                    placeholder="No category set in Document Purchase"
                    className={`${inputClass} cursor-default bg-biz-bg`}
                  />
                </Field>
                <p className="mt-1 text-[9px] font-medium text-biz-muted">
                  Automatically taken from the selected Document Purchase.
                </p>
              </div>

              <div className="my-4 border-t border-biz-border" />
              <h3 className="mb-2 text-[12px] font-bold text-biz-blue">PE / Contact Person</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field
                  label={
                    <>
                      PE Name <span className="text-biz-danger">*</span>
                    </>
                  }
                  error={errors.contact?.name?.message}
                >
                  <input
                    list="contact-names"
                    {...contactNameField}
                    onChange={(event) => {
                      contactNameField.onChange(event);
                      const matched = contacts.data?.find(
                        (contact) => contact.name === event.target.value,
                      );
                      if (!matched) return;
                      setValue("contact.designation", matched.designation, { shouldValidate: true });
                      setValue("contact.mobile", matched.mobile, { shouldValidate: true });
                      setValue("contact.email", matched.email ?? "", { shouldValidate: true });
                      setValue("contact.address", matched.address, { shouldValidate: true });
                    }}
                    className={inputClass}
                  />
                  <datalist id="contact-names">
                    {contacts.data?.map((contact) => (
                      <option key={contact.id} value={contact.name} />
                    ))}
                  </datalist>
                </Field>
                <Field
                  label={
                    <>
                      Designation <span className="text-biz-danger">*</span>
                    </>
                  }
                  error={errors.contact?.designation?.message}
                >
                  <input {...register("contact.designation")} className={inputClass} />
                </Field>
                <Field
                  label={
                    <>
                      Mobile Number <span className="text-biz-danger">*</span>
                    </>
                  }
                  error={errors.contact?.mobile?.message}
                >
                  <input {...register("contact.mobile")} className={inputClass} />
                </Field>
                <Field label="Email (Optional)" error={errors.contact?.email?.message}>
                  <input type="email" {...register("contact.email")} className={inputClass} />
                </Field>
              </div>
              <div className="mt-3">
                <Field
                  label={
                    <>
                      Address <span className="text-biz-danger">*</span>
                    </>
                  }
                  error={errors.contact?.address?.message}
                >
                  <input {...register("contact.address")} className={inputClass} />
                </Field>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-md bg-biz-success-soft px-3 py-2 text-[10px] font-medium text-biz-success">
                <Check className="h-3.5 w-3.5" />
                PE / Contact information will be saved in {selected.organizationMaster.shortName}
                contact list.
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 border-t border-biz-border pt-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-[12px] font-bold text-biz-navy">Accept NOA?</h3>
                  <p className="mb-2 mt-1 text-[10px] text-biz-muted">
                    Confirm whether the awarded NOA will be accepted.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <ChoiceCard
                      selected={values.acceptNoa === true}
                      label="Yes, Accept NOA"
                      onClick={() => setValue("acceptNoa", true, { shouldValidate: true })}
                    />
                    <ChoiceCard
                      selected={values.acceptNoa === false}
                      label="No, Reject NOA"
                      onClick={() => {
                        setValue("acceptNoa", false, { shouldValidate: true });
                        setValue("pgBgRequired", false, { shouldValidate: true });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-[12px] font-bold text-biz-navy">PG/BG Required?</h3>
                  <p className="mb-2 mt-1 text-[10px] text-biz-muted">
                    This choice is available only when the NOA is accepted.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <ChoiceCard
                      selected={values.pgBgRequired === true}
                      label="Yes, PG/BG Required"
                      disabled={values.acceptNoa === false}
                      onClick={() => setValue("pgBgRequired", true, { shouldValidate: true })}
                    />
                    <ChoiceCard
                      selected={values.pgBgRequired === false}
                      label="No, Not Required"
                      disabled={values.acceptNoa === false}
                      onClick={() => setValue("pgBgRequired", false, { shouldValidate: true })}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-md bg-biz-blue-soft px-3 py-2 text-[10px] text-biz-blue">
                <Info className="h-3.5 w-3.5 shrink-0" />
                {values.acceptNoa === false
                  ? "Rejecting the NOA will save the decision without creating an Ongoing Work."
                  : values.pgBgRequired
                    ? "Continue to enter PG/BG details, then finalize the complete workflow once."
                    : "The work will move directly to Ongoing Works after this decision is saved."}
              </div>
            </section>
          )}

          {uiStep === 3 && selected && (
            <section className="rounded-md border border-biz-border bg-white p-4 shadow-card">
              <div className="mb-4">
                <h2 className="text-[14px] font-bold text-biz-navy">3. PG/BG Details &amp; Final Review</h2>
                <p className="mt-0.5 text-[10px] text-biz-muted">
                  Enter the guarantee details and review everything before creating the ongoing work.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Field label="Type *">
                  <select
                    value={guarantee.type}
                    onChange={(event) =>
                      setGuarantee({ ...guarantee, type: event.target.value as "PG" | "BG" })
                    }
                    className={inputClass}
                  >
                    <option value="PG">Performance Guarantee (PG)</option>
                    <option value="BG">Bank Guarantee (BG)</option>
                  </select>
                </Field>
                <Field label="Bank Account *">
                  <select
                    value={guarantee.bankAccountId}
                    onChange={(event) =>
                      setGuarantee({ ...guarantee, bankAccountId: event.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="">Select bank account</option>
                    {bankAccounts.data
                      ?.filter((account) => account.accountType === "BANK" && account.isActive)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.bankName ?? account.accountName}
                          {account.accountNumber ? ` — ${account.accountNumber}` : ""}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Instrument No. (Optional)">
                  <input
                    value={guarantee.instrumentNo}
                    onChange={(event) =>
                      setGuarantee({ ...guarantee, instrumentNo: event.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Guarantee Amount (BDT) *">
                  <input
                    type="number"
                    min="0"
                    value={guarantee.amount}
                    onChange={(event) =>
                      setGuarantee({ ...guarantee, amount: event.target.value })
                    }
                    className={`${inputClass} text-right`}
                  />
                </Field>
                <Field label="Issue Date *">
                  <input
                    type="date"
                    value={guarantee.issueDate}
                    onChange={(event) =>
                      setGuarantee({ ...guarantee, issueDate: event.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Expiry Date *">
                  <input
                    type="date"
                    value={guarantee.expiryDate}
                    onChange={(event) =>
                      setGuarantee({ ...guarantee, expiryDate: event.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="mt-5 rounded-md border border-biz-border bg-[#F8FAFD] p-4">
                <h3 className="text-[12px] font-bold text-biz-navy">Final Review</h3>
                <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                  <SummaryRow label="Tender" value={selected.tenderId ?? "Manual"} />
                  <SummaryRow label="Organization" value={selected.organizationMaster.shortName} />
                  <SummaryRow label="Work" value={selected.tenderWorkName} />
                  <SummaryRow label="NOA Date" value={displayDate(values.noaDate)} />
                  <SummaryRow label="NOA Amount" value={`BDT ${money(values.noaAmount)}`} />
                  <SummaryRow label="Category" value={values.workCategory} />
                  <SummaryRow label="PE / Contact" value={values.contact?.name} />
                  <SummaryRow label="Guarantee Type" value={guarantee.type} />
                  <SummaryRow
                    label="Guarantee Amount"
                    value={`BDT ${money(guarantee.amount)}`}
                  />
                </div>
              </div>

            </section>
          )}
        </div>

        <aside className="space-y-3">
          <section className="rounded-md border border-biz-border bg-white p-3 shadow-card">
            <h2 className="mb-2 text-[12px] font-bold text-biz-navy">Work Summary</h2>
            <SummaryRow label="Organization" value={selected?.organizationMaster.shortName} />
            <SummaryRow label="Tender / Work" value={selected?.tenderWorkName} />
            <SummaryRow label="Tender ID" value={selected?.tenderId} />
            <SummaryRow label="NOA Date" value={displayDate(values.noaDate)} />
            <SummaryRow label="NOA Amount" value={money(values.noaAmount)} />
            <SummaryRow label="Work Category" value={values.workCategory} />
            <SummaryRow label="PE Name" value={values.contact?.name} />
          </section>

        </aside>
      </div>

      <div className="sticky bottom-0 z-20 flex flex-col gap-2 rounded-md border border-biz-border bg-white/95 px-4 py-3 shadow-card backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        {(uiStep > 1 || selected) && (
          <button
            type="button"
            disabled={isWorking}
            onClick={uiStep === 1 ? changeTender : () => setUiStep((uiStep - 1) as UiStep)}
            className="flex h-9 items-center justify-center gap-2 rounded-md border border-biz-border bg-white px-5 text-[11px] font-semibold text-biz-navy disabled:opacity-50"
          >
            {uiStep > 1 && <ArrowLeft className="h-3.5 w-3.5" />}
            {uiStep === 1 ? "Clear Selection" : "Back"}
          </button>
        )}

        <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
          {uiStep === 2 && (
            <button
              type="button"
              onClick={saveDraft}
              disabled={isWorking}
              className="flex h-9 items-center justify-center gap-2 rounded-md border border-biz-blue bg-white px-4 text-[11px] font-semibold text-biz-blue disabled:opacity-50"
            >
              <FileText className="h-3.5 w-3.5" />
              {saveDraftMutation.isPending ? "Saving..." : "Save as Draft"}
            </button>
          )}

          {uiStep === 1 && (
            <button
              type="button"
              disabled={!selected || isDraftLookupPending || workflowQuery.isError}
              onClick={() => {
                setMessage(null);
                setUiStep(2);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="flex h-9 items-center justify-center gap-2 rounded-md bg-biz-blue px-5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isDraftLookupPending ? "Checking Saved Workflow..." : "Continue to NOA Information"}
              {!isDraftLookupPending && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          )}

          {uiStep === 2 && (
            <button
              type="button"
              onClick={continueFromNoa}
              disabled={isWorking}
              className="flex h-9 items-center justify-center gap-2 rounded-md bg-biz-blue px-5 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {isWorking
                ? "Processing..."
                : values.acceptNoa === false
                  ? "Save NOA Rejection"
                  : values.pgBgRequired
                    ? "Continue to PG/BG & Review"
                    : "Accept NOA & Create Ongoing Work"}
              {!isWorking && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          )}

          {uiStep === 3 && (
            <button
              type="button"
              onClick={finalizeWorkflow}
              disabled={isWorking}
              className="flex h-9 items-center justify-center gap-2 rounded-md bg-biz-blue px-5 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {isWorking ? "Creating PG/BG..." : "Create PG/BG & Move to Ongoing Works"}
              {!isWorking && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
