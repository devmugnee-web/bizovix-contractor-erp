"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, ShoppingCart, XCircle } from "lucide-react";
import {
  useApproveComparativeStatement,
  useCancelComparativeStatement,
  useComparativeStatement,
  useComparativeStatementItemComparison,
  useEvaluateComparativeStatement,
  usePurchaseOrders,
  useSelectComparativeStatementSupplier,
} from "@bizovix/api-client";
import { PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { CsSupplierEvaluationInput, TechnicalComplianceStatus } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { CS_STATUS_META, TECHNICAL_STATUS_META, TECHNICAL_STATUS_OPTIONS, formatQty } from "@/lib/procurement";

interface EvalDraft {
  commercialAdjustment: string;
  technicalStatus: TechnicalComplianceStatus;
  recommended: boolean;
  remarks: string;
}

export default function ComparativeStatementDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cs = useComparativeStatement(params.id);
  const itemComparison = useComparativeStatementItemComparison(params.id);
  const existingPo = usePurchaseOrders({ comparativeStatementId: params.id, limit: 1 });

  const evaluateMutation = useEvaluateComparativeStatement();
  const selectMutation = useSelectComparativeStatementSupplier();
  const approveMutation = useApproveComparativeStatement();
  const cancelMutation = useCancelComparativeStatement();

  const [evalDrafts, setEvalDrafts] = React.useState<Record<string, EvalDraft>>({});
  const [selectingSupplierId, setSelectingSupplierId] = React.useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  useSetBreadcrumb([{ label: "Procurement" }, { label: "Comparative Statements", href: "/procurement/comparative-statements" }, { label: cs.data?.csNo ?? "CS" }]);

  if (cs.isLoading) return <div className="p-12 text-center text-biz-muted">Loading Comparative Statement...</div>;
  if (!cs.data) return <div className="p-12 text-center text-biz-muted">Comparative Statement not found.</div>;

  const record = cs.data;
  const statusMeta = CS_STATUS_META[record.status];
  const isEditable = !["APPROVED", "CANCELLED"].includes(record.status);
  const lowestEvaluated = record.suppliers.reduce<string | null>((lowestId, supplier) => {
    if (lowestId === null) return supplier.supplierId;
    const current = record.suppliers.find((s) => s.supplierId === lowestId)!;
    return Number(supplier.evaluatedTotal) < Number(current.evaluatedTotal) ? supplier.supplierId : lowestId;
  }, null);
  const hasSelected = record.suppliers.some((supplier) => supplier.isSelected);
  const onError = (mutationError: unknown) => setError(mutationError instanceof Error ? mutationError.message : "The action could not be completed.");
  const isMutating = evaluateMutation.isPending || selectMutation.isPending || approveMutation.isPending || cancelMutation.isPending;

  function draftFor(supplier: (typeof record.suppliers)[number]): EvalDraft {
    return evalDrafts[supplier.supplierId] ?? { commercialAdjustment: supplier.commercialAdjustment, technicalStatus: supplier.technicalStatus, recommended: supplier.recommended, remarks: supplier.remarks ?? "" };
  }

  function patchDraft(supplier: (typeof record.suppliers)[number], patch: Partial<EvalDraft>) {
    setEvalDrafts((prev) => ({ ...prev, [supplier.supplierId]: { ...draftFor(supplier), ...patch } }));
  }

  function saveEvaluation() {
    setError(null);
    const suppliers: CsSupplierEvaluationInput[] = record.suppliers.map((supplier) => {
      const draft = draftFor(supplier);
      return {
        supplierId: supplier.supplierId,
        commercialAdjustment: Number(draft.commercialAdjustment || 0),
        technicalStatus: draft.technicalStatus,
        recommended: draft.recommended,
        remarks: draft.remarks.trim() || undefined,
      };
    });
    evaluateMutation.mutate({ id: record.id, payload: { rfqId: record.rfqId, suppliers } }, { onError });
  }

  function confirmSelection(supplierId: string) {
    setError(null);
    const isLowest = supplierId === lowestEvaluated;
    if (!isLowest && !decisionNotes.trim()) {
      setError("Selecting a supplier that is not the lowest evaluated offer requires an explicit decision note.");
      return;
    }
    selectMutation.mutate(
      { id: record.id, payload: { supplierId, decisionNotes: decisionNotes.trim() || undefined } },
      { onSuccess: () => { setSelectingSupplierId(null); setDecisionNotes(""); }, onError },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-biz-text">{record.csNo}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">
            RFQ {record.rfq.rfqNo} · {record.cmsWork?.workName ?? "General procurement"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record.status === "EVALUATED" && (
            <PrimaryButton disabled={isMutating || !hasSelected} onClick={() => approveMutation.mutate(record.id, { onError })}>
              <CheckCircle2 className="h-4 w-4" />
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </PrimaryButton>
          )}
          {record.status === "APPROVED" &&
            (existingPo.data?.items[0] ? (
              <Link href={"/procurement/purchase-orders/" + existingPo.data.items[0].id}>
                <PrimaryButton>
                  <ShoppingCart className="h-4 w-4" />
                  View Purchase Order
                </PrimaryButton>
              </Link>
            ) : (
              <Link href={"/procurement/purchase-orders/create?comparativeStatementId=" + record.id}>
                <PrimaryButton>
                  <ShoppingCart className="h-4 w-4" />
                  Raise Purchase Order
                </PrimaryButton>
              </Link>
            ))}
          {!["APPROVED", "CANCELLED"].includes(record.status) && (
            <SecondaryButton disabled={isMutating} onClick={() => cancelMutation.mutate(record.id, { onError })}>
              <XCircle className="h-4 w-4" />
              Cancel
            </SecondaryButton>
          )}
        </div>
      </div>

      {error && <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">{error}</p>}
      {record.decisionNotes && (
        <p className="rounded-sm border border-biz-border bg-biz-bg px-4 py-3 text-[13px] text-biz-text">
          <span className="font-semibold">Decision Notes:</span> {record.decisionNotes}
        </p>
      )}

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Supplier Summary</h3>
          {isEditable && (
            <PrimaryButton onClick={saveEvaluation} disabled={isMutating}>
              {evaluateMutation.isPending ? "Saving..." : "Save Evaluation"}
            </PrimaryButton>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-[13px]">
            <thead>
              <tr className="bg-biz-bg">
                <th className="px-3 py-2.5 font-medium text-biz-muted">Supplier</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Quoted Total</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Adjustment</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Evaluated Total</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Delivery</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Payment Terms</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Technical</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Rank</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Selected</th>
              </tr>
            </thead>
            <tbody>
              {record.suppliers.map((supplier) => {
                const draft = draftFor(supplier);
                const isLowest = supplier.supplierId === lowestEvaluated;
                return (
                  <tr key={supplier.id} className="border-t border-biz-border align-top">
                    <td className="px-3 py-2.5 text-biz-text">
                      {supplier.supplier.code} — {supplier.supplier.name}
                      {isLowest && <span className="ml-1.5 rounded-sm bg-biz-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-biz-success">Lowest</span>}
                    </td>
                    <td className="px-3 py-2.5 text-biz-text">{formatBDT(supplier.quotedTotal)}</td>
                    <td className="px-3 py-2.5">
                      {isEditable ? (
                        <TextInput
                          className="h-9 w-28"
                          type="number"
                          value={draft.commercialAdjustment}
                          onChange={(event) => patchDraft(supplier, { commercialAdjustment: event.target.value })}
                        />
                      ) : (
                        formatBDT(supplier.commercialAdjustment)
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-biz-text">{formatBDT(supplier.evaluatedTotal)}</td>
                    <td className="px-3 py-2.5 text-biz-muted">{supplier.deliveryDays ? formatQty(supplier.deliveryDays) + " days" : "—"}</td>
                    <td className="px-3 py-2.5 text-biz-muted">{supplier.paymentTerms ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {isEditable ? (
                        <SelectInput
                          className="h-9 w-40"
                          value={draft.technicalStatus}
                          onChange={(event) => patchDraft(supplier, { technicalStatus: event.target.value as TechnicalComplianceStatus })}
                          options={TECHNICAL_STATUS_OPTIONS}
                        />
                      ) : (
                        <StatusBadge label={TECHNICAL_STATUS_META[supplier.technicalStatus].label} tone={TECHNICAL_STATUS_META[supplier.technicalStatus].tone} />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-biz-muted">{supplier.rank ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {supplier.isSelected ? (
                        <StatusBadge label="Selected" tone="success" />
                      ) : record.status === "EVALUATED" ? (
                        selectingSupplierId === supplier.supplierId ? (
                          <div className="flex flex-col gap-2">
                            <TextInput
                              className="h-9 w-48"
                              placeholder={isLowest ? "Decision note (optional)" : "Decision note (required)"}
                              value={decisionNotes}
                              onChange={(event) => setDecisionNotes(event.target.value)}
                            />
                            <div className="flex gap-1.5">
                              <SecondaryButton size="sm" onClick={() => confirmSelection(supplier.supplierId)} disabled={isMutating}>
                                Confirm
                              </SecondaryButton>
                              <SecondaryButton size="sm" onClick={() => { setSelectingSupplierId(null); setDecisionNotes(""); }}>
                                Cancel
                              </SecondaryButton>
                            </div>
                          </div>
                        ) : (
                          <SecondaryButton size="sm" onClick={() => setSelectingSupplierId(supplier.supplierId)}>
                            Select
                          </SecondaryButton>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">Item Comparison</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13px]">
            <thead>
              <tr className="bg-biz-bg">
                <th className="px-3 py-2.5 font-medium text-biz-muted">Item</th>
                <th className="px-3 py-2.5 font-medium text-biz-muted">Qty</th>
                {record.suppliers.map((supplier) => (
                  <th key={supplier.id} className="px-3 py-2.5 font-medium text-biz-muted">
                    {supplier.supplier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(itemComparison.data ?? []).map((row) => (
                <tr key={row.rfqItemId} className="border-t border-biz-border">
                  <td className="px-3 py-2.5 text-biz-text">{row.itemName}</td>
                  <td className="px-3 py-2.5 text-biz-muted">
                    {formatQty(row.requestedQty)} {row.unit}
                  </td>
                  {record.suppliers.map((supplier) => {
                    const offer = row.offers.find((candidate) => candidate.supplierId === supplier.supplierId);
                    return (
                      <td key={supplier.id} className="px-3 py-2.5">
                        {offer ? (
                          <div className={offer.isLowest ? "font-semibold text-biz-success" : "text-biz-text"}>
                            {formatBDT(offer.lineAmount)}
                            <div className="text-[11px] font-normal text-biz-muted">
                              {formatQty(offer.offeredQty)} @ {formatBDT(offer.unitRate)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-biz-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
