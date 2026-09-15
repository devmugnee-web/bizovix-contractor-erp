"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ArrowLeft,
  Award,
  Banknote,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardList,
  FileEdit,
  FileText,
  FolderOpen,
  Gavel,
  Hash,
  Landmark,
  Plus,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { useRecordTenderOpening, useSubmitTender, useTender } from "@bizovix/api-client";
import {
  recordTenderOpeningSchema,
  submitTenderSchema,
  type RecordTenderOpeningFormValues,
  type SubmitTenderFormValues,
} from "@bizovix/validation";
import {
  DateInput,
  FormField,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
} from "@bizovix/ui";
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
  const router = useRouter();
  const tender = useTender(params.id);
  useSetBreadcrumb([{ label: "Tenders", href: "/tenders" }]);

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
  const canCreateWork = ["AWARDED", "NOA", "ONGOING"].includes(t.status) && !hasProject;
  const completedCount = completed.filter(Boolean).length;
  const nextStepIndex = completed.findIndex((isComplete) => !isComplete);
  const organizationName = t.organizationMaster
    ? `${t.organizationMaster.shortName} — ${t.organizationMaster.fullName}`
    : "Organization not set";
  const remarks = t.remarks || t.description;

  return (
    <div className="scrollbar-hidden flex min-h-full flex-col gap-2 overflow-y-auto subpixel-antialiased lg:h-full lg:min-h-0 lg:overflow-hidden 2xl:gap-3">
      <section className="shrink-0 overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
        <div className="grid grid-cols-1 gap-2.5 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center xl:px-4 2xl:px-5 2xl:py-3">
          <div className="relative z-20 order-2 flex w-full flex-wrap gap-2 sm:col-start-2 sm:row-start-1 sm:w-auto sm:justify-end [&_button]:h-9 [&_button]:text-[11px] 2xl:[&_button]:h-10 2xl:[&_button]:text-[13px]">
            <SecondaryButton type="button" onClick={() => router.push("/tenders")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </SecondaryButton>
            <Link href={`/tenders/${t.id}/edit`}>
              <SecondaryButton>
                <FileEdit className="h-4 w-4" />
                Edit Tender
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

          <div className="order-1 min-w-0 sm:col-start-1 sm:row-start-1">
            <div className="relative pl-11 2xl:pl-12">
              <span className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue 2xl:h-10 2xl:w-10">
                <ClipboardList className="h-[18px] w-[18px] 2xl:h-5 2xl:w-5" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 xl:text-[11px] 2xl:text-[12px]">
                  Tender record
                </p>
                <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
              </div>
              <h1 className="mt-0.5 break-words text-[18px] font-bold leading-tight text-biz-text xl:text-[20px] 2xl:text-[24px]">
                {t.workName}
              </h1>
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-500 xl:text-[12px] 2xl:text-[13px]">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate" title={organizationName}>
                  {organizationName}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-t border-biz-border bg-biz-border sm:grid-cols-3 xl:grid-cols-6">
          <DetailItem icon={Hash} label="e-GP Tender ID" value={t.egpTenderId ?? "Not set"} />
          <DetailItem
            icon={ClipboardList}
            label="Procurement Nature"
            value={t.tenderType ?? "Not set"}
          />
          <DetailItem icon={Landmark} label="Procurement Method" value={t.procurementMethod} />
          <DetailItem
            icon={UserRound}
            label="Found By"
            value={t.foundByName ?? t.foundBy?.name ?? "Not set"}
          />
          <DetailItem
            icon={CalendarDays}
            label="Finding Date"
            value={t.findingDate ? formatDate(t.findingDate) : "Not set"}
          />
          <DetailItem
            icon={CalendarClock}
            label="Published Date"
            value={t.publishedDate ? formatDate(t.publishedDate) : "Not set"}
          />
        </div>
      </section>

      <main className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto rounded-xl border border-biz-border bg-slate-50/70 shadow-card">
        <div className="flex flex-col gap-2.5 p-2.5 xl:gap-3 xl:p-3 2xl:gap-4 2xl:p-4">
          <section
            className="order-3 overflow-hidden rounded-lg border border-biz-border bg-white"
            aria-labelledby="notice-details-title"
          >
            <SectionHeading
              id="notice-details-title"
              title="Notice & PA Information"
              description="Tender notice, procuring authority and contact details"
            />
            <dl className="grid grid-cols-1 gap-px bg-biz-border sm:grid-cols-2 lg:grid-cols-4 lg:[&>div:last-child]:col-span-2">
              {[
                ["Document Fee", t.documentFee != null ? formatBDT(t.documentFee) : "Not set"],
                [
                  "Tender Security Amount",
                  t.estimatedTenderSecurityAmount != null
                    ? formatBDT(t.estimatedTenderSecurityAmount)
                    : "Not set",
                ],
                [
                  "Meeting End (Bangladesh Time)",
                  t.preBidEndDate
                    ? new Date(t.preBidEndDate).toLocaleString("en-GB", {
                        timeZone: "Asia/Dhaka",
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Not set",
                ],
                ["PA Name", t.paName || "Not set"],
                ["PA Designation", t.paDesignation || "Not set"],
                ["PA Phone", t.paPhone || "Not set"],
                ["PE Address", t.paAddress || "Not set"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 bg-white px-3 py-2.5 2xl:px-4 2xl:py-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 xl:text-[11px] 2xl:text-[12px]">
                    {label}
                  </dt>
                  <dd className="mt-1 break-words text-[12px] font-semibold leading-4 text-biz-text xl:text-[13px] 2xl:text-[14px] 2xl:leading-5">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            className="order-1 overflow-hidden rounded-lg border border-biz-border bg-white"
            aria-labelledby="tender-summary-title"
          >
            <SectionHeading
              id="tender-summary-title"
              title="Tender Summary"
              description="Important financial and submission details"
            />
            <div className="grid grid-cols-1 gap-px bg-biz-border sm:grid-cols-2 sm:[&>div:last-child]:col-span-2 lg:grid-cols-3 lg:[&>div:last-child]:col-span-2 xl:grid-cols-5 xl:[&>div:last-child]:col-span-1">
              <InfoCard
                icon={Banknote}
                label="Estimated Value"
                value={formatBDT(t.contractValue)}
              />
              <InfoCard
                icon={CalendarClock}
                label="Submission Deadline"
                value={t.submissionDeadline ? formatDate(t.submissionDeadline) : "Not set"}
              />
              <InfoCard
                icon={CalendarDays}
                label="Opening Date"
                value={t.openingDate ? formatDate(t.openingDate) : "Not set"}
              />
              <InfoCard
                icon={Wallet}
                label="Quoted Amount"
                value={t.quotedAmount != null ? formatBDT(t.quotedAmount) : "Not set"}
              />
              <InfoCard
                icon={UserRound}
                label="Assigned To"
                value={t.assignedToName ?? "Unassigned"}
              />
            </div>
          </section>

          <section className="order-2 overflow-hidden rounded-lg border border-biz-border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border bg-slate-50/60 px-3 py-2 2xl:px-4 2xl:py-2.5">
              <div className="min-w-0">
                <h2 className="text-[12px] font-bold text-biz-text xl:text-[13px] 2xl:text-[15px]">
                  Tender Lifecycle
                </h2>
                <p className="text-[10px] font-medium text-slate-500 xl:text-[11px] 2xl:text-[12px]">
                  Track this tender from creation to project handover.
                </p>
              </div>
              <p className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 xl:text-[11px] 2xl:text-[12px]">
                {completedCount} of {TIMELINE_STEPS.length} completed
              </p>
            </div>

            <div className="p-3 2xl:p-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-biz-success transition-all"
                  style={{ width: `${(completedCount / TIMELINE_STEPS.length) * 100}%` }}
                />
              </div>

              <ol className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 2xl:gap-2">
                {TIMELINE_STEPS.map((step, index) => {
                  const isComplete = completed[index];
                  const isNext = index === nextStepIndex;

                  return (
                    <li
                      key={step}
                      className={
                        isComplete
                          ? "flex min-h-[54px] items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/80 px-2 py-1.5 2xl:min-h-[62px] 2xl:px-2.5"
                          : isNext
                            ? "flex min-h-[54px] items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-2 py-1.5 2xl:min-h-[62px] 2xl:px-2.5"
                            : "flex min-h-[54px] items-center gap-2 rounded-md border border-biz-border bg-slate-50 px-2 py-1.5 2xl:min-h-[62px] 2xl:px-2.5"
                      }
                    >
                      <span
                        className={
                          isComplete
                            ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-biz-success text-white 2xl:h-7 2xl:w-7"
                            : isNext
                              ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-biz-blue text-white 2xl:h-7 2xl:w-7"
                              : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-biz-border bg-white text-[10px] font-bold text-slate-500 2xl:h-7 2xl:w-7"
                        }
                      >
                        {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <span
                        className={
                          isComplete || isNext
                            ? "text-[10px] font-bold leading-[1.25] text-biz-text xl:text-[11px] 2xl:text-[12px]"
                            : "text-[10px] font-semibold leading-[1.25] text-slate-500 xl:text-[11px] 2xl:text-[12px]"
                        }
                      >
                        {step}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          {remarks && (
            <section className="order-4 rounded-lg border border-biz-border bg-white p-3 2xl:p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-biz-blue-soft text-biz-blue 2xl:h-9 2xl:w-9">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[12px] font-bold text-biz-text xl:text-[13px] 2xl:text-[15px]">
                    Remarks
                  </h2>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] font-medium leading-4 text-slate-600 xl:text-[12px] xl:leading-5 2xl:text-[13px]">
                    {remarks}
                  </p>
                </div>
              </div>
            </section>
          )}

          <section
            className="order-5 overflow-hidden rounded-lg border border-biz-border bg-white"
            aria-labelledby="related-records-title"
          >
            <SectionHeading
              id="related-records-title"
              title="Related Records"
              description="Documents, securities and project records linked with this tender"
            />
            <div className="grid grid-cols-1 gap-2 p-2.5 md:grid-cols-2 xl:grid-cols-3 2xl:gap-3 2xl:p-3">
              <LinkedCard
                icon={Landmark}
                title="Document Purchase"
                count={t.linked.documentPurchases.length}
                emptyAction={
                  <Link
                    href={
                      t.costingApprovalStatus === "APPROVED"
                        ? "/bank-instruments/document-purchase"
                        : `/bank-instruments/document-purchase/create?tenderId=${t.id}`
                    }
                  >
                    <SecondaryButton>
                      <Plus className="h-4 w-4" />
                      {t.costingApprovalStatus === "APPROVED"
                        ? "Review Purchase Request"
                        : "Purchase Document"}
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

              <LinkedCard
                icon={ShieldCheck}
                title="Tender Security"
                count={t.linked.tenderSecurities.length}
                viewHref="/bank-instruments/tender-security"
              >
                {t.linked.tenderSecurities.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-[12px]">
                    <span className="text-biz-text">
                      {s.instrumentNo ?? "Pending Instrument No."}
                    </span>
                    <span className="text-biz-muted">{formatBDT(s.amount)}</span>
                  </div>
                ))}
              </LinkedCard>

              <LinkedCard
                icon={Wallet}
                title="Credit Commitment"
                count={t.linked.creditCommitments.length}
                viewHref="/bank-instruments/credit-commitment"
              >
                {t.linked.creditCommitments.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-[12px]">
                    <span className="text-biz-text">{c.isCharged ? "Charged" : "Pending"}</span>
                    <span className="text-biz-muted">{formatBDT(c.amount)}</span>
                  </div>
                ))}
              </LinkedCard>

              <LinkedCard
                icon={Award}
                title="PG / BG"
                count={t.linked.performanceGuarantees.length}
                viewHref="/bank-instruments/pg-bg"
              >
                {t.linked.performanceGuarantees.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-[12px]">
                    <span className="text-biz-text">
                      {p.type} — {p.instrumentNo ?? "Pending"}
                    </span>
                    <span className="text-biz-muted">{formatBDT(p.amount)}</span>
                  </div>
                ))}
              </LinkedCard>

              <LinkedCard
                icon={FolderOpen}
                title="Project (CMS)"
                count={t.linked.cmsWorks.length}
                viewHref="/cms/ongoing-works"
                emptyAction={
                  canCreateWork ? (
                    <Link href={`/cms/ongoing-works/create?tenderId=${t.id}`}>
                      <SecondaryButton>
                        <Plus className="h-4 w-4" />
                        Create Ongoing Work
                      </SecondaryButton>
                    </Link>
                  ) : undefined
                }
              >
                {t.linked.cmsWorks.map((w) => (
                  <div key={w.id} className="flex items-center justify-between text-[12px]">
                    <span className="text-biz-text">{w.workName}</span>
                    <span className="text-biz-muted">{formatBDT(w.contractValue)}</span>
                  </div>
                ))}
              </LinkedCard>

              <LinkedCard
                icon={FileText}
                title="Documents"
                count={t.linked.documents.length}
                viewHref="/documents/tenders"
              >
                {t.linked.documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-[12px]">
                    <span className="text-biz-text">{d.name}</span>
                    <span className="text-biz-muted">
                      {d.expiryDate ? formatDate(d.expiryDate) : "No expiry"}
                    </span>
                  </div>
                ))}
              </LinkedCard>
            </div>
          </section>
        </div>
      </main>

      <SubmitTenderModal open={submitOpen} onClose={() => setSubmitOpen(false)} tenderId={t.id} />
      <RecordOpeningModal
        open={openingOpen}
        onClose={() => setOpeningOpen(false)}
        tenderId={t.id}
      />
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-biz-border bg-slate-50/60 px-3 py-2 2xl:px-4 2xl:py-2.5">
      <h2 id={id} className="text-[12px] font-bold text-biz-text xl:text-[13px] 2xl:text-[15px]">
        {title}
      </h2>
      <p className="text-[10px] font-medium text-slate-500 xl:text-[11px] 2xl:text-[12px]">
        {description}
      </p>
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 bg-slate-50/70 px-3 py-2.5 2xl:px-4 2xl:py-3">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-biz-blue 2xl:h-4 2xl:w-4" />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 xl:text-[10px] 2xl:text-[11px]">
          {label}
        </p>
        <p className="mt-1 break-words text-[11px] font-semibold leading-4 text-biz-text xl:text-[12px] 2xl:text-[13px]">
          {value}
        </p>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 bg-white px-3 py-2.5 2xl:px-4 2xl:py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-biz-blue-soft text-biz-blue 2xl:h-9 2xl:w-9">
        <Icon className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
          {label}
        </p>
        <p className="mt-0.5 break-words text-[12px] font-bold leading-4 text-biz-text xl:text-[13px] 2xl:text-[15px] 2xl:leading-5">
          {value}
        </p>
      </div>
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
    <div className="flex min-h-[126px] min-w-0 flex-col rounded-lg border border-biz-border bg-white p-3 transition-colors hover:border-blue-200 hover:bg-blue-50/20 2xl:min-h-[140px] 2xl:p-3.5">
      <div className="mb-2.5 flex items-start justify-between gap-3 2xl:mb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-biz-blue-soft text-biz-blue 2xl:h-8 2xl:w-8">
            <Icon className="h-3.5 w-3.5 2xl:h-4 2xl:w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[11px] font-bold text-biz-text xl:text-[12px] 2xl:text-[14px]">
              {title}
            </h3>
            <p className="mt-0.5 text-[9px] font-medium text-slate-500 xl:text-[10px] 2xl:text-[11px]">
              {count} linked {count === 1 ? "record" : "records"}
            </p>
          </div>
        </div>
        <Link
          href={viewHref}
          className="shrink-0 text-[10px] font-semibold text-biz-blue hover:underline 2xl:text-[12px]"
        >
          View all
        </Link>
      </div>
      {count === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-2 rounded-md bg-slate-50 px-2.5 py-2 [&_button]:h-8 [&_button]:text-[10px]">
          <p className="text-[10px] font-medium text-slate-500 xl:text-[11px] 2xl:text-[12px]">
            No records linked to this tender yet.
          </p>
          {emptyAction}
        </div>
      ) : (
        <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-md bg-slate-50 px-2.5 py-2 [&>div]:min-w-0 [&>div]:gap-3 [&>div]:text-[10px] [&>div]:font-medium [&>div>span:first-child]:truncate [&>div>span:last-child]:shrink-0 xl:[&>div]:text-[11px] 2xl:[&>div]:text-[12px]">
          {children}
        </div>
      )}
    </div>
  );
}

function SubmitTenderModal({
  open,
  onClose,
  tenderId,
}: {
  open: boolean;
  onClose: () => void;
  tenderId: string;
}) {
  const submitMutation = useSubmitTender();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubmitTenderFormValues>({
    resolver: zodResolver(submitTenderSchema),
    defaultValues: {
      submissionDate: new Date().toISOString().slice(0, 10),
      submissionMethod: "Online (e-GP)",
    },
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
          <TextInput
            placeholder="Name of the person who submitted"
            {...register("submittedByName")}
          />
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

function RecordOpeningModal({
  open,
  onClose,
  tenderId,
}: {
  open: boolean;
  onClose: () => void;
  tenderId: string;
}) {
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
