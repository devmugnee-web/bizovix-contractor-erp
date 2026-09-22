"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { ApiError, useCreatePaymentTerm, usePaymentTerms, useUpdatePaymentTerm } from "@bizovix/api-client";
import type { PaymentTermRecord } from "@bizovix/types";
import { PageHeader, PrimaryButton, SecondaryButton, StatusBadge, TextInput } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { MasterSyncReview, MasterSyncState } from "@/components/masters/MasterSyncNotice";

export default function PaymentTermsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Payment Terms" }]);
  const terms = usePaymentTerms({ includeLocal: true });
  const createTerm = useCreatePaymentTerm();
  const updateTerm = useUpdatePaymentTerm();
  const [form, setForm] = React.useState({ name: "", days: "", description: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [review, setReview] = React.useState<PaymentTermRecord | null>(null);
  const [reviewActive, setReviewActive] = React.useState(true);
  const savedReview = review ? terms.data?.find((record) => record.id === review.id) ?? review : null;
  const saving = createTerm.isPending || updateTerm.isPending;
  const locked = savedReview?.syncStatus === "PENDING";

  function finishReview() {
    setReview(null);
    setForm({ name: "", days: "", description: "" });
    setError(null);
  }

  async function add() {
    if (saving || locked) return;
    setError(null);
    try {
      const payload = { name: form.name, days: form.days === "" ? undefined : Number(form.days), description: review ? form.description : form.description || undefined };
      if (review) await updateTerm.mutateAsync({ id: review.id, payload: { ...payload, isActive: reviewActive } });
      else await createTerm.mutateAsync(payload);
      finishReview();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The payment term could not be saved. Your existing data is unchanged.");
    }
  }

  async function toggle(term: PaymentTermRecord) {
    if (saving || term.syncStatus === "PENDING") return;
    setError(null);
    try {
      await updateTerm.mutateAsync({ id: term.id, payload: { name: term.name, days: term.days, description: term.description ?? undefined, isActive: !term.isActive } });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The payment term could not be updated.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payment Terms" subtitle="Reusable payment terms (Immediate, 7/15/30/45/60 Days, Custom) for vendors, suppliers and subcontractors." />

      <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <h3 className="mb-4 text-[15px] font-semibold text-biz-text">{review ? "Review saved payment term" : "Add Payment Term"}</h3>
        {savedReview && <MasterSyncReview error={savedReview.syncError?.message} hasCloudRecord={!!savedReview.cloudRecord} fields={[
          { label: "Name", local: savedReview.name, cloud: savedReview.cloudRecord?.name },
          { label: "Days", local: String(savedReview.days), cloud: savedReview.cloudRecord ? String(savedReview.cloudRecord.days) : undefined },
          { label: "Description", local: savedReview.description ?? "", cloud: savedReview.cloudRecord?.description ?? "" },
          { label: "Status", local: savedReview.isActive ? "Active" : "Inactive", cloud: savedReview.cloudRecord?.isActive ? "Active" : "Inactive" },
        ]} />}
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <TextInput disabled={saving || locked} placeholder="Name (e.g. 30 Days)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <TextInput disabled={saving || locked} type="number" min="0" placeholder="Days" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} />
          <TextInput disabled={saving || locked} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <PrimaryButton disabled={!form.name.trim() || saving || locked} onClick={add}>
            <Plus className="h-4 w-4" />
            {review ? "Queue reviewed change" : "Add Term"}
          </PrimaryButton>
        </div>
        {review && <div className="mb-3 flex items-center gap-4 text-[13px]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={reviewActive} disabled={saving || locked} onChange={(event) => setReviewActive(event.target.checked)} />Active</label>
          <SecondaryButton disabled={saving} onClick={finishReview}>Close review</SecondaryButton>
        </div>}
        {error && <p className="text-[13px] text-biz-danger">{error}</p>}
        {terms.isError && <p className="text-[13px] text-biz-danger">{terms.error instanceof ApiError ? terms.error.message : "Payment terms could not be loaded."}</p>}

        <table className="mt-4 w-full text-left text-[13px]">
          <thead className="bg-[#f4f7fb] text-[11px] text-biz-muted">
            <tr>
              {["Name", "Days", "Description", "Status", "Action"].map((h) => (
                <th key={h} className="px-3 py-2.5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(terms.data ?? []).map((term) => (
              <tr key={term.id} className="border-t border-biz-border">
                <td className="px-3 py-2.5 font-medium">{term.name}<MasterSyncState record={term} /></td>
                <td className="px-3 py-2.5">{term.days}</td>
                <td className="px-3 py-2.5">{term.description ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge label={term.isActive ? "Active" : "Inactive"} tone={term.isActive ? "success" : "neutral"} />
                </td>
                <td className="px-3 py-2.5">
                  {term.syncStatus === "REJECTED" ? <SecondaryButton disabled={saving} onClick={() => { setReview(term); setReviewActive(term.isActive); setForm({ name: term.name, days: String(term.days), description: term.description ?? "" }); setError(null); }}>Review saved change</SecondaryButton> : <SecondaryButton disabled={saving || term.syncStatus === "PENDING"} onClick={() => void toggle(term)}>
                    {term.isActive ? "Deactivate" : "Activate"}
                  </SecondaryButton>}
                </td>
              </tr>
            ))}
            {!terms.data?.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-biz-muted">
                  {terms.isPending ? "Loading payment terms…" : terms.isError ? "Payment terms are unavailable." : "No payment terms defined yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
