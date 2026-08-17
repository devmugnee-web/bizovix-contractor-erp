"use client";

import { useParams } from "next/navigation";
import { CheckCircle2, ThumbsDown, XCircle } from "lucide-react";
import { useApproveTimeExtension, useRejectTimeExtension, useSubmitTimeExtension, useTimeExtension } from "@bizovix/api-client";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { EOT_STATUS_META } from "@/lib/time-extensions";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-biz-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[13px] text-biz-muted">{label}</span>
      <span className="text-[13px] font-medium text-biz-text sm:text-right">{value}</span>
    </div>
  );
}

export default function TimeExtensionDetailPage() {
  const params = useParams<{ id: string }>();
  const eot = useTimeExtension(params.id);
  const submitMutation = useSubmitTimeExtension();
  const approveMutation = useApproveTimeExtension();
  const rejectMutation = useRejectTimeExtension();
  useSetBreadcrumb([{ label: "CMS" }, { label: "Time Extensions" }, { label: eot.data?.eotNo ?? "Time Extension" }]);

  if (eot.isLoading) return <div className="p-12 text-center text-biz-muted">Loading time extension...</div>;
  if (!eot.data) return <div className="p-12 text-center text-biz-muted">Time Extension not found.</div>;

  const e = eot.data;
  const statusMeta = EOT_STATUS_META[e.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-biz-text">{e.eotNo}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">{e.cmsWork.workName} · {e.contract.contractNo}</p>
        </div>
        <div className="flex items-center gap-2">
          {e.status === "DRAFT" && (
            <PrimaryButton disabled={submitMutation.isPending} onClick={() => submitMutation.mutate(e.id)}>
              Submit
            </PrimaryButton>
          )}
          {e.status === "SUBMITTED" && (
            <>
              <SecondaryButton disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate(e.id)}>
                <ThumbsDown className="h-4 w-4" />
                Reject
              </SecondaryButton>
              <PrimaryButton disabled={approveMutation.isPending} onClick={() => approveMutation.mutate({ id: e.id })}>
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </PrimaryButton>
            </>
          )}
        </div>
      </div>

      <div className="max-w-2xl rounded-lg border border-biz-border bg-biz-surface px-6 py-2 shadow-card">
        <DetailRow label="Request Date" value={formatDate(e.requestDate)} />
        <DetailRow label="Requested Days" value={`${e.requestedDays} days`} />
        <DetailRow label="Reason" value={e.reason} />
        <DetailRow label="Original Completion Date" value={formatDate(e.originalCompletionDate)} />
        <DetailRow label="Previous Completion Date" value={formatDate(e.previousCompletionDate)} />
        <DetailRow
          label="Approved Days"
          value={e.approvedDays !== null ? `${e.approvedDays} days` : <XCircle className="inline h-4 w-4 text-biz-muted" />}
        />
        <DetailRow label="Revised Completion Date" value={e.revisedCompletionDate ? formatDate(e.revisedCompletionDate) : "Not yet approved"} />
      </div>

      {e.description && (
        <section className="max-w-2xl rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
          <h2 className="mb-2 text-[14px] font-semibold text-biz-text">Description</h2>
          <p className="text-[13px] text-biz-muted">{e.description}</p>
        </section>
      )}
    </div>
  );
}
