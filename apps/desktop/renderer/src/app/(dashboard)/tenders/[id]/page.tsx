"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ArrowRight,
  Award,
  Check,
  FileEdit,
  FileText,
  FolderOpen,
  Gavel,
  Landmark,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useRecordTenderOpening, useSubmitTender, useTender } from "@bizovix/api-client";
import {
  recordTenderOpeningSchema,
  submitTenderSchema,
  type RecordTenderOpeningFormValues,
  type SubmitTenderFormValues,
} from "@bizovix/validation";
import { DateInput, FormField, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { CurrencyInput } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Modal } from "@/components/layout/Modal";
import { TENDER_STATUS_META } from "@/lib/tenders";

const TIMELINE_STEPS = [
  "Tender Created",
  "Document Purchased",
  "Tender Security",
  "Credit Commitment",
  "Submitted",
  "Opening",
  "NOA",
  "PG/BG",
  "Project",
] as const;

export default function TenderDetailPage() {
  const params = useParams<{ id: string }>();
  const tender = useTender(params.id);
  useSetBreadcrumb([{ label: "Tenders", href: "/tenders" }, { label: tender.data?.workName ?? "Tender Details" }]);

  const [submitOpen, setSubmitOpen] = React.useState(false);
  const [openingOpen, setOpeningOpen] = React.useState(false);

  if (tender.isLoading) {
    return <div className="p-12 text-center text-biz-muted">Loading tender...</div>;
  }
  if (!tender.data) {
    return <div className="p-12 text-center text-biz-muted">Tender not found.</div>;
  }

  const t = tender.data;
  const statusMeta = TENDER_STATUS_META[t.status];
  const hasDocumentPurchase = t.linked.documentPurchases.length > 0;
  const hasSubmitted = !!t.submittedAt;
  const hasOpening = !!t.openingDate;
  const hasNoa = ["NOA", "AWARDED", "ONGOING", "COMPLETED"].includes(t.status);
  const hasPgBg = t.linked.performanceGuarantees.length > 0;
  const hasProject = t.linked.cmsWorks.length > 0;
  const completed = [
    true,
    hasDocumentPurchase,
    t.linked.tenderSecurities.length > 0,
    t.linked.creditCommitments.length > 0,
    hasSubmitted,
    hasOpening,
    hasNoa,
    hasPgBg,
    hasProject,
  ];
  const canSubmit = !["AWARDED", "ONGOING", "COMPLETED", "CANCELLED"].includes(t.status);
  const canRecordOpening = hasSubmitted;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-biz-text">{t.workName}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">
            {t.organizationMaster.shortName} — {t.organizationMaster.fullName}
            {t.egpTenderId ? ` · e-GP ID: ${t.egpTenderId}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/tenders/${t.id}/edit`}>
            <SecondaryButton>
              <FileEdit className="h-4 w-4" />
              Edit
            </SecondaryButton>
          </Link>
          {canSubmit && (
            <PrimaryButton onClick={() => setSubmitOpen(true)}>
              <FileText className="h-4 w-4" />
              Submit Tender
            </PrimaryButton>
          )}
          {canRecordOpening && (
            <PrimaryButton onClick={() => setOpeningOpen(true)}>
              <Gavel className="h-4 w-4" />
              Record Opening / Result
            </PrimaryButton>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <InfoCard label="Estimated Value" value={formatBDT(t.contractValue)} />
        <InfoCard label="Submission Deadline" value={t.submissionDeadline ? formatDate(t.submissionDeadline) : "—"} />
        <InfoCard label="Opening Date" value={t.openingDate ? formatDate(t.openingDate) : "—"} />
        <InfoCard label="Quoted Amount" value={t.quotedAmount ? formatBDT(t.quotedAmount) : "—"} />
        <InfoCard label="Assigned To" value={t.assignedToName ?? "Unassigned"} />
      </div>

      <section className="rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
        <h2 className="mb-4 text-[14px] font-semibold text-biz-text">Tender Lifecycle</h2>
        <div className="flex flex-wrap gap-2">
          {TIMELINE_STEPS.map((step, index) => (
            <React.Fragment key={step}>
              <div className="flex items-center gap-2">
                <span
                  className={
                    completed[index]
                      ? "flex h-7 w-7 items-center justify-center rounded-full bg-biz-success text-white"
                      : "flex h-7 w-7 items-center justify-center rounded-full border border-biz-border bg-biz-bg text-biz-muted"
                  }
                >
                  {completed[index] ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className={completed[index] ? "text-[12px] font-semibold text-biz-text" : "text-[12px] text-biz-muted"}>
                  {step}
                </span>
              </div>
              {index < TIMELINE_STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 self-center text-biz-border" />}
            </React.Fragment>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <LinkedCard
          icon={Landmark}
          title="Document Purchase"
          count={t.linked.documentPurchases.length}
          emptyAction={
            <Link href={`/bank-instruments/document-purchase/create?tenderId=${t.id}`}>
              <SecondaryButton>
                <Plus className="h-4 w-4" />
                Purchase Document
              </SecondaryButton>
            </Link>
          }
          viewHref="/bank-instruments/document-purchase"
        >
          {t.linked.documentPurchases.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-[12px]">
              <span className="text-biz-text">{d.tenderWorkName}</span>
              <span className="text-biz-muted">{formatBDT(d.documentPrice)}</span>
            </div>
          ))}
        </LinkedCard>

        <LinkedCard icon={ShieldCheck} title="Tender Security" count={t.linked.tenderSecurities.length} viewHref="/bank-instruments/tender-security">
          {t.linked.tenderSecurities.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-[12px]">
              <span className="text-biz-text">{s.instrumentNo ?? "Pending Instrument No."}</span>
              <span className="text-biz-muted">{formatBDT(s.amount)}</span>
            </div>
          ))}
        </LinkedCard>

        <LinkedCard icon={Wallet} title="Credit Commitment" count={t.linked.creditCommitments.length} viewHref="/bank-instruments/credit-commitment">
          {t.linked.creditCommitments.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-[12px]">
              <span className="text-biz-text">{c.isCharged ? "Charged" : "Pending"}</span>
              <span className="text-biz-muted">{formatBDT(c.amount)}</span>
            </div>
          ))}
        </LinkedCard>

        <LinkedCard icon={Award} title="PG / BG" count={t.linked.performanceGuarantees.length} viewHref="/bank-instruments/pg-bg">
          {t.linked.performanceGuarantees.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-[12px]">
              <span className="text-biz-text">{p.type} — {p.instrumentNo ?? "Pending"}</span>
              <span className="text-biz-muted">{formatBDT(p.amount)}</span>
            </div>
          ))}
        </LinkedCard>

        <LinkedCard icon={FolderOpen} title="Project (CMS)" count={t.linked.cmsWorks.length} viewHref="/cms/ongoing-works">
          {t.linked.cmsWorks.map((w) => (
            <div key={w.id} className="flex items-center justify-between text-[12px]">
              <span className="text-biz-text">{w.workName}</span>
              <span className="text-biz-muted">{formatBDT(w.contractValue)}</span>
            </div>
          ))}
        </LinkedCard>

        <LinkedCard icon={FileText} title="Documents" count={t.linked.documents.length} viewHref="/documents/tenders">
          {t.linked.documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-[12px]">
              <span className="text-biz-text">{d.name}</span>
              <span className="text-biz-muted">{d.expiryDate ? formatDate(d.expiryDate) : "No expiry"}</span>
            </div>
          ))}
        </LinkedCard>
      </div>

      {t.description && (
        <section className="rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
          <h2 className="mb-2 text-[14px] font-semibold text-biz-text">Description / Remarks</h2>
          <p className="text-[13px] text-biz-muted">{t.description}</p>
        </section>
      )}

      <SubmitTenderModal open={submitOpen} onClose={() => setSubmitOpen(false)} tenderId={t.id} />
      <RecordOpeningModal open={openingOpen} onClose={() => setOpeningOpen(false)} tenderId={t.id} />
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[160px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

function LinkedCard({
  icon: Icon,
  title,
  count,
  viewHref,
  emptyAction,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  viewHref: string;
  emptyAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-biz-blue" />
          <h3 className="text-[13px] font-semibold text-biz-text">{title}</h3>
          <span className="rounded-full bg-biz-blue-soft px-2 py-0.5 text-[11px] font-semibold text-biz-blue">{count}</span>
        </div>
        <Link href={viewHref} className="text-[11px] font-medium text-biz-blue hover:underline">
          View
        </Link>
      </div>
      {count === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[12px] text-biz-muted">No records linked yet.</p>
          {emptyAction}
        </div>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </div>
  );
}

function SubmitTenderModal({ open, onClose, tenderId }: { open: boolean; onClose: () => void; tenderId: string }) {
  const submitMutation = useSubmitTender();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubmitTenderFormValues>({
    resolver: zodResolver(submitTenderSchema),
    defaultValues: { submissionDate: new Date().toISOString().slice(0, 10), submissionMethod: "Online (e-GP)" },
  });

  function onSubmit(values: SubmitTenderFormValues) {
    submitMutation.mutate(
      { id: tenderId, payload: { ...values, quotedAmount: Number(values.quotedAmount) } },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Submit Tender">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField label="Submission Date" required error={errors.submissionDate?.message}>
          <DateInput {...register("submissionDate")} />
        </FormField>
        <FormField label="Submission Method" required error={errors.submissionMethod?.message}>
          <SelectInput
            options={[
              { label: "Online (e-GP)", value: "Online (e-GP)" },
              { label: "Physical / Hand Delivery", value: "Physical / Hand Delivery" },
              { label: "Postal", value: "Postal" },
            ]}
            {...register("submissionMethod")}
          />
        </FormField>
        <FormField label="Quoted Amount" required error={errors.quotedAmount?.message}>
          <CurrencyInput {...register("quotedAmount")} />
        </FormField>
        <FormField label="Submitted By" error={errors.submittedByName?.message}>
          <TextInput placeholder="Name of the person who submitted" {...register("submittedByName")} />
        </FormField>
        <FormField label="Submission Reference" error={errors.submissionReference?.message}>
          <TextInput placeholder="e.g. e-GP submission ID" {...register("submissionReference")} />
        </FormField>
        <FormField label="Checklist Status" error={errors.checklistStatus?.message}>
          <SelectInput
            placeholder="Not tracked"
            options={[
              { label: "Not Started", value: "Not Started" },
              { label: "In Progress", value: "In Progress" },
              { label: "Completed", value: "Completed" },
            ]}
            {...register("checklistStatus")}
          />
        </FormField>
        <FormField label="Remarks" error={errors.submissionRemarks?.message}>
          <TextInput placeholder="Optional remarks" {...register("submissionRemarks")} />
        </FormField>
        <div className="mt-2 flex justify-end gap-3">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={submitMutation.isPending}>
            {submitMutation.isPending ? "Saving..." : "Confirm Submission"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

function RecordOpeningModal({ open, onClose, tenderId }: { open: boolean; onClose: () => void; tenderId: string }) {
  const openingMutation = useRecordTenderOpening();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RecordTenderOpeningFormValues>({
    resolver: zodResolver(recordTenderOpeningSchema),
    defaultValues: { openingDate: new Date().toISOString().slice(0, 10), status: "OPENED" },
  });

  function onSubmit(values: RecordTenderOpeningFormValues) {
    openingMutation.mutate(
      {
        id: tenderId,
        payload: {
          ...values,
          lowestBidAmount: values.lowestBidAmount ? Number(values.lowestBidAmount) : undefined,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Opening / Result">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField label="Opening Date" required error={errors.openingDate?.message}>
          <DateInput {...register("openingDate")} />
        </FormField>
        <FormField label="Result Status" required error={errors.status?.message}>
          <SelectInput
            options={[
              { label: "Opened", value: "OPENED" },
              { label: "Under Evaluation", value: "UNDER_PROCESS" },
              { label: "Awarded", value: "AWARDED" },
              { label: "Unsuccessful", value: "REJECTED" },
            ]}
            {...register("status")}
          />
        </FormField>
        <FormField label="Opening Result / Position" error={errors.openingResult?.message}>
          <TextInput placeholder="e.g. Lowest, 2nd Lowest" {...register("openingResult")} />
        </FormField>
        <FormField label="Lowest Bid Amount" error={errors.lowestBidAmount?.message}>
          <CurrencyInput placeholder="If known" {...register("lowestBidAmount")} />
        </FormField>
        <FormField label="Lowest Bidder" error={errors.lowestBidder?.message}>
          <TextInput placeholder="If known" {...register("lowestBidder")} />
        </FormField>
        <FormField label="Remarks" error={errors.resultRemarks?.message}>
          <TextInput placeholder="Optional remarks" {...register("resultRemarks")} />
        </FormField>
        <div className="mt-2 flex justify-end gap-3">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={openingMutation.isPending}>
            {openingMutation.isPending ? "Saving..." : "Save Result"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
