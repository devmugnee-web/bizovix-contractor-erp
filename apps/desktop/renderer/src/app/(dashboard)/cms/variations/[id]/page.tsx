"use client";

import { useParams } from "next/navigation";
import { CheckCircle2, ThumbsDown } from "lucide-react";
import { useApproveVariationOrder, useRejectVariationOrder, useSubmitVariationOrder, useVariationOrder } from "@bizovix/api-client";
import { DataTable, PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import type { VariationItemRecord } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { VARIATION_STATUS_META, VARIATION_TYPE_META } from "@/lib/variations";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[160px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

export default function VariationDetailPage() {
  const params = useParams<{ id: string }>();
  const variation = useVariationOrder(params.id);
  const submitMutation = useSubmitVariationOrder();
  const approveMutation = useApproveVariationOrder();
  const rejectMutation = useRejectVariationOrder();
  useSetBreadcrumb([{ label: "CMS" }, { label: "Variations" }, { label: variation.data?.variationNo ?? "Variation Order" }]);

  if (variation.isLoading) return <div className="p-12 text-center text-biz-muted">Loading variation order...</div>;
  if (!variation.data) return <div className="p-12 text-center text-biz-muted">Variation Order not found.</div>;

  const v = variation.data;
  const statusMeta = VARIATION_STATUS_META[v.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-biz-text">{v.variationNo}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">
            {v.title} · {v.cmsWork.workName} · {v.contract.contractNo} · {VARIATION_TYPE_META[v.variationType]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {v.status === "DRAFT" && (
            <PrimaryButton disabled={submitMutation.isPending} onClick={() => submitMutation.mutate(v.id)}>
              Submit
            </PrimaryButton>
          )}
          {v.status === "SUBMITTED" && (
            <>
              <SecondaryButton disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate(v.id)}>
                <ThumbsDown className="h-4 w-4" />
                Reject
              </SecondaryButton>
              <PrimaryButton disabled={approveMutation.isPending} onClick={() => approveMutation.mutate({ id: v.id })}>
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </PrimaryButton>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <InfoCard label="Requested Amount" value={formatBDT(v.requestedAmount)} />
        <InfoCard label="Approved Amount" value={v.approvedAmount ? formatBDT(v.approvedAmount) : "Pending"} />
        <InfoCard label="Original Contract Value" value={formatBDT(v.contract.originalContractValue)} />
        <InfoCard label="Current Contract Value" value={formatBDT(v.contract.currentContractValue)} />
        <InfoCard label="Request Date" value={formatDate(v.requestDate)} />
      </div>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">BOQ Impact</h3>
        </div>
        <DataTable<VariationItemRecord>
          data={v.items}
          rowKey={(row) => row.id}
          columns={[
            { key: "description", header: "Description", render: (row) => row.description },
            { key: "unit", header: "Unit", render: (row) => row.unit ?? "—" },
            { key: "originalQty", header: "Original Qty", render: (row) => row.originalQty ?? "—" },
            { key: "originalRate", header: "Original Rate", render: (row) => (row.originalRate ? formatBDT(row.originalRate) : "—") },
            { key: "revisedQty", header: "Revised Qty", render: (row) => row.revisedQty ?? "—" },
            { key: "revisedRate", header: "Revised Rate", render: (row) => (row.revisedRate ? formatBDT(row.revisedRate) : "—") },
            { key: "amount", header: "Net Amount", render: (row) => formatBDT(row.amount) },
          ]}
        />
      </section>

      <section className="rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
        <h2 className="mb-2 text-[14px] font-semibold text-biz-text">Reason</h2>
        <p className="mb-4 text-[13px] text-biz-muted">{v.reason}</p>
        {v.description && (
          <>
            <h2 className="mb-2 text-[14px] font-semibold text-biz-text">Description</h2>
            <p className="text-[13px] text-biz-muted">{v.description}</p>
          </>
        )}
      </section>
    </div>
  );
}
