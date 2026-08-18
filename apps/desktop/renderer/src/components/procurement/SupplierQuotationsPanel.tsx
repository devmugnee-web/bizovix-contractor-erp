"use client";

import * as React from "react";
import { useSupplierQuotations, useWithdrawSupplierQuotation } from "@bizovix/api-client";
import { SecondaryButton, SelectInput, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import type { RfqRecord } from "@bizovix/types";
import { QUOTATION_STATUS_META } from "@/lib/procurement";
import { SupplierQuotationForm } from "@/components/procurement/SupplierQuotationForm";

interface SupplierQuotationsPanelProps {
  rfq: RfqRecord;
}

export function SupplierQuotationsPanel({ rfq }: SupplierQuotationsPanelProps) {
  const quotations = useSupplierQuotations({ rfqId: rfq.id });
  const withdrawMutation = useWithdrawSupplierQuotation();

  const [recordForSupplier, setRecordForSupplier] = React.useState("");
  const [reviseId, setReviseId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const items = quotations.data ?? [];
  const activeSupplierIds = new Set(items.filter((quotation) => quotation.status === "RECEIVED").map((quotation) => quotation.supplierId));
  const eligibleSuppliers = rfq.suppliers.filter((supplier) => !activeSupplierIds.has(supplier.supplierId));
  const reviseTarget = reviseId ? items.find((quotation) => quotation.id === reviseId) : undefined;

  function withdraw(id: string) {
    if (!window.confirm("Withdraw this quotation? It can no longer be considered for evaluation.")) return;
    withdrawMutation.mutate(id, { onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Failed to withdraw the quotation.") });
  }

  return (
    <section className="flex flex-col gap-4">
      {rfq.status !== "ISSUED" && (
        <p className="rounded-sm border border-biz-border bg-biz-bg px-4 py-3 text-[13px] text-biz-muted">
          Quotations can only be recorded while the RFQ is Issued.
        </p>
      )}

      {rfq.status === "ISSUED" && !recordForSupplier && !reviseId && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-biz-border bg-biz-surface p-4 shadow-card">
          <span className="text-[13px] font-medium text-biz-text">Record a quotation for:</span>
          <div className="w-72">
            <SelectInput
              placeholder="Select supplier..."
              value=""
              onChange={(event) => event.target.value && setRecordForSupplier(event.target.value)}
              options={eligibleSuppliers.map((supplier) => ({ value: supplier.supplierId, label: supplier.supplier.code + " — " + supplier.supplier.name }))}
            />
          </div>
          {eligibleSuppliers.length === 0 && <span className="text-[12px] text-biz-muted">Every invited supplier already has an active quotation.</span>}
        </div>
      )}

      {recordForSupplier && (
        <SupplierQuotationForm
          rfq={rfq}
          supplierId={recordForSupplier}
          supplierLabel={rfq.suppliers.find((supplier) => supplier.supplierId === recordForSupplier)?.supplier.name ?? ""}
          onDone={() => setRecordForSupplier("")}
          onCancel={() => setRecordForSupplier("")}
        />
      )}

      {reviseTarget && (
        <SupplierQuotationForm
          rfq={rfq}
          supplierId={reviseTarget.supplierId}
          supplierLabel={reviseTarget.supplier.name}
          existing={reviseTarget}
          onDone={() => setReviseId(null)}
          onCancel={() => setReviseId(null)}
        />
      )}

      {error && <p className="rounded-sm border border-biz-danger bg-biz-danger-soft px-4 py-3 text-[13px] text-biz-danger">{error}</p>}

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="bg-biz-bg">
                <th className="px-4 py-2.5 font-medium text-biz-muted">Supplier</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Ref.</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Date</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Revision</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Total Amount</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Status</th>
                <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-biz-muted">
                    No quotations recorded yet.
                  </td>
                </tr>
              ) : (
                items.map((quotation) => (
                  <tr key={quotation.id} className="border-t border-biz-border">
                    <td className="px-4 py-3 text-biz-text">
                      {quotation.supplier.code} — {quotation.supplier.name}
                    </td>
                    <td className="px-4 py-3 text-biz-muted">{quotation.quotationRef}</td>
                    <td className="px-4 py-3 text-biz-muted">{formatDate(quotation.quotationDate)}</td>
                    <td className="px-4 py-3 text-biz-muted">Rev {quotation.revisionNo}</td>
                    <td className="px-4 py-3 font-medium text-biz-text">{formatBDT(quotation.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge label={QUOTATION_STATUS_META[quotation.status].label} tone={QUOTATION_STATUS_META[quotation.status].tone} />
                    </td>
                    <td className="px-4 py-3">
                      {quotation.status === "RECEIVED" && (
                        <div className="flex items-center gap-2">
                          <SecondaryButton size="sm" onClick={() => setReviseId(quotation.id)}>
                            Revise
                          </SecondaryButton>
                          <SecondaryButton size="sm" onClick={() => withdraw(quotation.id)} disabled={withdrawMutation.isPending}>
                            Withdraw
                          </SecondaryButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </section>
  );
}
