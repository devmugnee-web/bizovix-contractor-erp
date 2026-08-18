"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, FileEdit, ScrollText, Send, XCircle } from "lucide-react";
import { useCancelRfq, useCloseRfq, useCreateComparativeStatement, useIssueRfq, useRfq } from "@bizovix/api-client";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { LinkedDocumentsCard } from "@/components/procurement/LinkedDocumentsCard";
import { SupplierQuotationsPanel } from "@/components/procurement/SupplierQuotationsPanel";
import { RFQ_STATUS_META, formatQty } from "@/lib/procurement";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

const TABS = ["Overview", "Suppliers", "Items", "Supplier Quotations", "Documents"] as const;
type Tab = (typeof TABS)[number];

export default function RfqDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rfq = useRfq(params.id);
  const [tab, setTab] = React.useState<Tab>("Overview");

  const issueMutation = useIssueRfq();
  const closeMutation = useCloseRfq();
  const cancelMutation = useCancelRfq();
  const createCsMutation = useCreateComparativeStatement();

  const [error, setError] = React.useState<string | null>(null);

  useSetBreadcrumb([{ label: "Procurement" }, { label: "RFQs", href: "/procurement/rfqs" }, { label: rfq.data?.rfqNo ?? "RFQ" }]);

  if (rfq.isLoading) return <div className="p-12 text-center text-biz-muted">Loading RFQ...</div>;
  if (!rfq.data) return <div className="p-12 text-center text-biz-muted">RFQ not found.</div>;

  const record = rfq.data;
  const statusMeta = RFQ_STATUS_META[record.status];
  const onError = (mutationError: unknown) => setError(mutationError instanceof Error ? mutationError.message : "The action could not be completed.");
  const isMutating = issueMutation.isPending || closeMutation.isPending || cancelMutation.isPending || createCsMutation.isPending;
  const canBuildCs = ["ISSUED", "CLOSED"].includes(record.status) && !record.comparativeStatement && record.respondedSupplierIds.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-biz-text">{record.rfqNo}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">
            {record.cmsWork?.workName ?? "General procurement"} · Issued {formatDate(record.issueDate)} · Deadline {formatDate(record.submissionDeadline)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record.status === "DRAFT" && (
            <>
              <Link href={"/procurement/rfqs/" + record.id + "/edit"}>
                <SecondaryButton>
                  <FileEdit className="h-4 w-4" />
                  Edit Draft
                </SecondaryButton>
              </Link>
              <PrimaryButton disabled={isMutating} onClick={() => issueMutation.mutate(record.id, { onError })}>
                <Send className="h-4 w-4" />
                {issueMutation.isPending ? "Issuing..." : "Issue RFQ"}
              </PrimaryButton>
            </>
          )}
          {record.status === "ISSUED" && (
            <SecondaryButton disabled={isMutating} onClick={() => closeMutation.mutate(record.id, { onError })}>
              {closeMutation.isPending ? "Closing..." : "Close RFQ"}
            </SecondaryButton>
          )}
          {record.comparativeStatement ? (
            <Link href={"/procurement/comparative-statements/" + record.comparativeStatement.id}>
              <PrimaryButton>
                <ScrollText className="h-4 w-4" />
                View Comparative Statement
              </PrimaryButton>
            </Link>
          ) : (
            canBuildCs && (
              <PrimaryButton
                disabled={isMutating}
                onClick={() => createCsMutation.mutate({ rfqId: record.id }, { onSuccess: (cs) => router.push("/procurement/comparative-statements/" + cs.id), onError })}
              >
                <ScrollText className="h-4 w-4" />
                {createCsMutation.isPending ? "Building..." : "Build Comparative Statement"}
              </PrimaryButton>
            )
          )}
          {!["AWARDED", "CANCELLED"].includes(record.status) && (
            <SecondaryButton disabled={isMutating} onClick={() => cancelMutation.mutate(record.id, { onError })}>
              <XCircle className="h-4 w-4" />
              Cancel
            </SecondaryButton>
          )}
        </div>
      </div>

      {error && <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">{error}</p>}

      <div className="flex flex-wrap gap-4">
        <InfoCard label="Invited Suppliers" value={String(record.suppliers.length)} />
        <InfoCard label="Responded" value={String(record.respondedSupplierIds.length)} />
        <InfoCard label="Items" value={String(record.items.length)} />
        <InfoCard label="Source PR" value={record.purchaseRequisition?.prNo ?? "—"} />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-biz-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "border-b-2 border-biz-blue px-4 py-2 text-[13px] font-semibold text-biz-blue"
                : "border-b-2 border-transparent px-4 py-2 text-[13px] font-medium text-biz-muted hover:text-biz-text"
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <section className="rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-medium text-biz-muted">Delivery Location</dt>
              <dd className="mt-1 text-[13px] text-biz-text">{record.deliveryLocation ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-biz-muted">Payment Terms</dt>
              <dd className="mt-1 text-[13px] text-biz-text">{record.paymentTerms ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-medium text-biz-muted">Terms & Conditions</dt>
              <dd className="mt-1 whitespace-pre-line text-[13px] text-biz-text">{record.termsConditions ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-medium text-biz-muted">Remarks</dt>
              <dd className="mt-1 whitespace-pre-line text-[13px] text-biz-text">{record.remarks ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}

      {tab === "Suppliers" && (
        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Supplier</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Invited</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Responded</th>
                </tr>
              </thead>
              <tbody>
                {record.suppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-t border-biz-border">
                    <td className="px-4 py-3 text-biz-text">
                      {supplier.supplier.code} — {supplier.supplier.name}
                    </td>
                    <td className="px-4 py-3 text-biz-muted">{formatDate(supplier.invitedAt)}</td>
                    <td className="px-4 py-3">
                      {record.respondedSupplierIds.includes(supplier.supplierId) ? (
                        <StatusBadge label="Responded" tone="success" />
                      ) : (
                        <StatusBadge label="Pending" tone="neutral" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "Items" && (
        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-[13px]">
              <thead>
                <tr className="bg-biz-bg">
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Item</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Unit</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Requested Qty</th>
                  <th className="px-4 py-2.5 font-medium text-biz-muted">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {record.items.map((item) => (
                  <tr key={item.id} className="border-t border-biz-border">
                    <td className="px-4 py-3 text-biz-text">{item.itemNameSnapshot}</td>
                    <td className="px-4 py-3 text-biz-muted">{item.unitSnapshot}</td>
                    <td className="px-4 py-3 text-biz-text">{formatQty(item.requestedQty)}</td>
                    <td className="px-4 py-3 text-biz-muted">{item.remarks ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "Supplier Quotations" && <SupplierQuotationsPanel rfq={record} />}

      {tab === "Documents" && <LinkedDocumentsCard filter={{ rfqId: record.id }} />}
    </div>
  );
}
