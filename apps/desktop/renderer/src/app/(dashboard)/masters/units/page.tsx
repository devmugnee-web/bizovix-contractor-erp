"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { ApiError, useCreateUom, useUoms, useUpdateUom } from "@bizovix/api-client";
import type { UomRecord } from "@bizovix/types";
import { PageHeader, PrimaryButton, SecondaryButton, StatusBadge, TextInput } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { MasterSyncReview, MasterSyncState } from "@/components/masters/MasterSyncNotice";

export default function UnitsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Units of Measurement" }]);
  const uoms = useUoms({ includeLocal: true });
  const createUom = useCreateUom();
  const updateUom = useUpdateUom();
  const [form, setForm] = React.useState({ code: "", name: "", symbol: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [review, setReview] = React.useState<UomRecord | null>(null);
  const [reviewActive, setReviewActive] = React.useState(true);
  const savedReview = review ? uoms.data?.find((record) => record.id === review.id) ?? review : null;
  const saving = createUom.isPending || updateUom.isPending;
  const locked = savedReview?.syncStatus === "PENDING";

  function finishReview() {
    setReview(null);
    setForm({ code: "", name: "", symbol: "" });
    setError(null);
  }

  async function add() {
    if (saving || locked) return;
    setError(null);
    try {
      const payload = { code: form.code, name: form.name, symbol: review ? form.symbol : form.symbol || undefined };
      if (review) await updateUom.mutateAsync({ id: review.id, payload: { ...payload, isActive: reviewActive } });
      else await createUom.mutateAsync(payload);
      finishReview();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The unit could not be saved. Your existing data is unchanged.");
    }
  }

  async function toggle(uom: UomRecord) {
    if (saving || uom.syncStatus === "PENDING") return;
    setError(null);
    try {
      await updateUom.mutateAsync({ id: uom.id, payload: { code: uom.code, name: uom.name, symbol: uom.symbol ?? undefined, isActive: !uom.isActive } });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The unit could not be updated.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Units of Measurement" subtitle="Reusable units for materials and items (PCS, KG, TON, M, SQM, CFT, LITER, LOT, DAY, MONTH, JOB, or your own)." />

      <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <h3 className="mb-4 text-[15px] font-semibold text-biz-text">{review ? "Review saved unit" : "Add Unit"}</h3>
        {savedReview && <MasterSyncReview error={savedReview.syncError?.message} hasCloudRecord={!!savedReview.cloudRecord} fields={[
          { label: "Code", local: savedReview.code, cloud: savedReview.cloudRecord?.code },
          { label: "Name", local: savedReview.name, cloud: savedReview.cloudRecord?.name },
          { label: "Symbol", local: savedReview.symbol ?? "", cloud: savedReview.cloudRecord?.symbol ?? "" },
          { label: "Status", local: savedReview.isActive ? "Active" : "Inactive", cloud: savedReview.cloudRecord?.isActive ? "Active" : "Inactive" },
        ]} />}
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <TextInput disabled={saving || locked || !!savedReview?.cloudRecord} placeholder="Code (e.g. KG)" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          <TextInput disabled={saving || locked} placeholder="Name (e.g. Kilogram)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <TextInput disabled={saving || locked} placeholder="Symbol (optional)" value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))} />
          <PrimaryButton disabled={!form.code.trim() || !form.name.trim() || saving || locked} onClick={add}>
            <Plus className="h-4 w-4" />
            {review ? "Queue reviewed change" : "Add Unit"}
          </PrimaryButton>
        </div>
        {review && <div className="mb-3 flex items-center gap-4 text-[13px]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={reviewActive} disabled={saving || locked} onChange={(event) => setReviewActive(event.target.checked)} />Active</label>
          <SecondaryButton disabled={saving} onClick={finishReview}>Close review</SecondaryButton>
        </div>}
        {error && <p className="text-[13px] text-biz-danger">{error}</p>}
        {uoms.isError && <p className="text-[13px] text-biz-danger">{uoms.error instanceof ApiError ? uoms.error.message : "Units could not be loaded."}</p>}

        <table className="mt-4 w-full text-left text-[13px]">
          <thead className="bg-[#f4f7fb] text-[11px] text-biz-muted">
            <tr>
              {["Code", "Name", "Symbol", "Status", "Action"].map((h) => (
                <th key={h} className="px-3 py-2.5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(uoms.data ?? []).map((uom) => (
              <tr key={uom.id} className="border-t border-biz-border">
                <td className="px-3 py-2.5 font-medium">{uom.code}</td>
                <td className="px-3 py-2.5">{uom.name}<MasterSyncState record={uom} /></td>
                <td className="px-3 py-2.5">{uom.symbol ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge label={uom.isActive ? "Active" : "Inactive"} tone={uom.isActive ? "success" : "neutral"} />
                </td>
                <td className="px-3 py-2.5">
                  {uom.syncStatus === "REJECTED" ? <SecondaryButton disabled={saving} onClick={() => { setReview(uom); setReviewActive(uom.isActive); setForm({ code: uom.code, name: uom.name, symbol: uom.symbol ?? "" }); setError(null); }}>Review saved change</SecondaryButton> : <SecondaryButton disabled={saving || uom.syncStatus === "PENDING"} onClick={() => void toggle(uom)}>
                    {uom.isActive ? "Deactivate" : "Activate"}
                  </SecondaryButton>}
                </td>
              </tr>
            ))}
            {!uoms.data?.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-biz-muted">
                  {uoms.isPending ? "Loading units…" : uoms.isError ? "Units are unavailable." : "No units defined yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
