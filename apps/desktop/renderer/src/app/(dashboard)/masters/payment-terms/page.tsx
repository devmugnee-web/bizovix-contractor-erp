"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useCreatePaymentTerm, usePaymentTerms, useUpdatePaymentTerm } from "@bizovix/api-client";
import { PageHeader, PrimaryButton, SecondaryButton, StatusBadge, TextInput } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function PaymentTermsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Payment Terms" }]);
  const terms = usePaymentTerms();
  const createTerm = useCreatePaymentTerm();
  const updateTerm = useUpdatePaymentTerm();
  const [form, setForm] = React.useState({ name: "", days: "", description: "" });
  const [error, setError] = React.useState<string | null>(null);

  async function add() {
    setError(null);
    try {
      await createTerm.mutateAsync({ name: form.name, days: form.days === "" ? undefined : Number(form.days), description: form.description || undefined });
      setForm({ name: "", days: "", description: "" });
    } catch {
      setError("Failed to create payment term — the name may already be in use.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payment Terms" subtitle="Reusable payment terms (Immediate, 7/15/30/45/60 Days, Custom) for vendors, suppliers and subcontractors." />

      <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <h3 className="mb-4 text-[15px] font-semibold text-biz-text">Add Payment Term</h3>
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <TextInput placeholder="Name (e.g. 30 Days)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <TextInput type="number" min="0" placeholder="Days" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} />
          <TextInput placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <PrimaryButton disabled={!form.name || createTerm.isPending} onClick={add}>
            <Plus className="h-4 w-4" />
            Add Term
          </PrimaryButton>
        </div>
        {error && <p className="text-[13px] text-biz-danger">{error}</p>}

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
                <td className="px-3 py-2.5 font-medium">{term.name}</td>
                <td className="px-3 py-2.5">{term.days}</td>
                <td className="px-3 py-2.5">{term.description ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge label={term.isActive ? "Active" : "Inactive"} tone={term.isActive ? "success" : "neutral"} />
                </td>
                <td className="px-3 py-2.5">
                  <SecondaryButton onClick={() => updateTerm.mutate({ id: term.id, payload: { name: term.name, days: term.days, description: term.description ?? undefined, isActive: !term.isActive } })}>
                    {term.isActive ? "Deactivate" : "Activate"}
                  </SecondaryButton>
                </td>
              </tr>
            ))}
            {!terms.data?.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-biz-muted">
                  No payment terms defined yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
