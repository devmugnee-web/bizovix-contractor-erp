"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useCreateUom, useUoms, useUpdateUom } from "@bizovix/api-client";
import { PageHeader, PrimaryButton, SecondaryButton, StatusBadge, TextInput } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function UnitsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Units of Measurement" }]);
  const uoms = useUoms();
  const createUom = useCreateUom();
  const updateUom = useUpdateUom();
  const [form, setForm] = React.useState({ code: "", name: "", symbol: "" });
  const [error, setError] = React.useState<string | null>(null);

  async function add() {
    setError(null);
    try {
      await createUom.mutateAsync({ code: form.code, name: form.name, symbol: form.symbol || undefined });
      setForm({ code: "", name: "", symbol: "" });
    } catch {
      setError("Failed to create unit — the code may already be in use.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Units of Measurement" subtitle="Reusable units for materials and items (PCS, KG, TON, M, SQM, CFT, LITER, LOT, DAY, MONTH, JOB, or your own)." />

      <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <h3 className="mb-4 text-[15px] font-semibold text-biz-text">Add Unit</h3>
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <TextInput placeholder="Code (e.g. KG)" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          <TextInput placeholder="Name (e.g. Kilogram)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <TextInput placeholder="Symbol (optional)" value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))} />
          <PrimaryButton disabled={!form.code || !form.name || createUom.isPending} onClick={add}>
            <Plus className="h-4 w-4" />
            Add Unit
          </PrimaryButton>
        </div>
        {error && <p className="text-[13px] text-biz-danger">{error}</p>}

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
                <td className="px-3 py-2.5">{uom.name}</td>
                <td className="px-3 py-2.5">{uom.symbol ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge label={uom.isActive ? "Active" : "Inactive"} tone={uom.isActive ? "success" : "neutral"} />
                </td>
                <td className="px-3 py-2.5">
                  <SecondaryButton onClick={() => updateUom.mutate({ id: uom.id, payload: { code: uom.code, name: uom.name, symbol: uom.symbol ?? undefined, isActive: !uom.isActive } })}>
                    {uom.isActive ? "Deactivate" : "Activate"}
                  </SecondaryButton>
                </td>
              </tr>
            ))}
            {!uoms.data?.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-biz-muted">
                  No units defined yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
