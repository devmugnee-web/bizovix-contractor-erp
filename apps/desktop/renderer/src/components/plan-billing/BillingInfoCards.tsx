"use client";
import * as React from "react";
import { PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { useBillingProfile, useUpdateBillingProfile } from "@bizovix/api-client";
import type { SaveBillingProfileInput } from "@bizovix/types";
import { useSyncedForm } from "@/components/settings/shared";
import { Card, Field } from "./shared";

const PAYMENT_METHODS = [
  { value: "MANUAL", label: "Manual" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CARD", label: "Card" },
  { value: "MOBILE_FINANCIAL_SERVICE", label: "Mobile Financial Service" },
];

export function BillingInfoCards({ notify }: { notify: (m: string) => void }) {
  const query = useBillingProfile();
  const update = useUpdateBillingProfile();
  const [editingInfo, setEditingInfo] = React.useState(false);
  const [editingPayment, setEditingPayment] = React.useState(false);

  function toInput(d: NonNullable<typeof query.data>): SaveBillingProfileInput {
    return {
      billingName: d.billingName ?? "",
      billingEmail: d.billingEmail ?? "",
      phone: d.phone ?? "",
      billingAddress: d.billingAddress ?? "",
      tinNumber: d.tinNumber ?? "",
      binNumber: d.binNumber ?? "",
      paymentMethodType: d.paymentMethodType,
      paymentMethodLabel: d.paymentMethodLabel ?? "",
    };
  }
  const [form, setForm] = useSyncedForm(query.data, toInput);

  async function save(closeEditor: () => void) {
    if (!form) return;
    try {
      await update.mutateAsync(form);
      notify("Billing information updated successfully.");
      closeEditor();
    } catch {
      notify("Failed to update billing information.");
    }
  }

  if (query.isLoading || !form) return <div className="h-52 animate-pulse rounded-lg bg-slate-100 lg:col-span-2" />;

  return (
    <>
      <Card
        title="Billing Information"
        headerRight={
          !editingInfo && (
            <SecondaryButton onClick={() => setEditingInfo(true)}>Edit Billing Information</SecondaryButton>
          )
        }
      >
        {editingInfo ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Billing Name">
              <TextInput value={form.billingName ?? ""} onChange={(e) => setForm({ ...form, billingName: e.target.value })} />
            </Field>
            <Field label="Billing Email">
              <TextInput type="email" value={form.billingEmail ?? ""} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} />
            </Field>
            <Field label="Phone">
              <TextInput value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="TIN">
              <TextInput value={form.tinNumber ?? ""} onChange={(e) => setForm({ ...form, tinNumber: e.target.value })} />
            </Field>
            <Field label="Billing Address">
              <TextInput value={form.billingAddress ?? ""} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} />
            </Field>
            <Field label="BIN / VAT Number">
              <TextInput value={form.binNumber ?? ""} onChange={(e) => setForm({ ...form, binNumber: e.target.value })} />
            </Field>
            <div className="col-span-full flex justify-end gap-2">
              <SecondaryButton onClick={() => { setEditingInfo(false); if (query.data) setForm(toInput(query.data)); }}>Cancel</SecondaryButton>
              <PrimaryButton disabled={update.isPending} onClick={() => save(() => setEditingInfo(false))}>
                {update.isPending ? "Saving..." : "Save Changes"}
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-[12px]">
            {[
              ["Billing Name", query.data?.billingName],
              ["Billing Email", query.data?.billingEmail],
              ["Phone", query.data?.phone],
              ["TIN", query.data?.tinNumber],
              ["Billing Address", query.data?.billingAddress],
              ["BIN / VAT Number", query.data?.binNumber],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-semibold text-biz-muted">{label}</dt>
                <dd className="mt-0.5 text-biz-text">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card
        title="Payment Method"
        headerRight={
          !editingPayment && <SecondaryButton onClick={() => setEditingPayment(true)}>Edit</SecondaryButton>
        }
      >
        {editingPayment ? (
          <div className="grid gap-3">
            <Field label="Payment Method Type">
              <SelectInput
                value={form.paymentMethodType}
                onChange={(e) => setForm({ ...form, paymentMethodType: e.target.value })}
                options={PAYMENT_METHODS}
              />
            </Field>
            <Field label="Details" required={false}>
              <TextInput
                placeholder="e.g. DBBL - A/C 1234567"
                value={form.paymentMethodLabel ?? ""}
                onChange={(e) => setForm({ ...form, paymentMethodLabel: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => { setEditingPayment(false); if (query.data) setForm(toInput(query.data)); }}>Cancel</SecondaryButton>
              <PrimaryButton disabled={update.isPending} onClick={() => save(() => setEditingPayment(false))}>
                {update.isPending ? "Saving..." : "Save"}
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-biz-text">
                {PAYMENT_METHODS.find((m) => m.value === query.data?.paymentMethodType)?.label ?? "Manual"}
              </p>
              <p className="text-[11px] text-biz-muted">{query.data?.paymentMethodLabel || "No additional details provided."}</p>
            </div>
            <StatusBadge label={query.data?.paymentVerified ? "Verified" : "Pending"} tone={query.data?.paymentVerified ? "success" : "warning"} />
          </div>
        )}
      </Card>
    </>
  );
}
