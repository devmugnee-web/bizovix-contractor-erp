"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useCreateParty, useMasterCategories, usePaymentTerms, useUpdateParty } from "@bizovix/api-client";
import { CurrencyInput, FormField, PageHeader, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import type { PartyDetail, PartyRole } from "@bizovix/types";
import { PAYEE_PARTY_ROLE_OPTIONS, PARTY_STATUS_OPTIONS } from "@/lib/parties";

interface PartyFormProps {
  mode: "create" | "edit";
  variant: "vendor" | "subcontractor";
  party?: PartyDetail;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
      <h3 className="mb-4 text-[15px] font-semibold text-biz-text">{title}</h3>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

export function PartyForm({ mode, variant, party }: PartyFormProps) {
  const router = useRouter();
  const listPath = variant === "vendor" ? "/masters/vendors" : "/masters/subcontractors";
  const createMutation = useCreateParty();
  const updateMutation = useUpdateParty();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const vendorCategories = useMasterCategories("VENDOR");
  const tradeCategories = useMasterCategories("SUBCONTRACTOR_TRADE");
  const paymentTerms = usePaymentTerms();

  const [code, setCode] = React.useState(party?.code ?? "");
  const [name, setName] = React.useState(party?.name ?? "");
  const [displayName, setDisplayName] = React.useState(party?.displayName ?? "");
  const [roles, setRoles] = React.useState<PartyRole[]>(party?.roles ?? [variant === "vendor" ? "VENDOR" : "SUBCONTRACTOR"]);
  const [status, setStatus] = React.useState(party?.status ?? "ACTIVE");
  const [contactPerson, setContactPerson] = React.useState(party?.contactPerson ?? "");
  const [phone, setPhone] = React.useState(party?.phone ?? "");
  const [alternatePhone, setAlternatePhone] = React.useState(party?.alternatePhone ?? "");
  const [email, setEmail] = React.useState(party?.email ?? "");
  const [website, setWebsite] = React.useState(party?.website ?? "");
  const [address, setAddress] = React.useState(party?.address ?? "");
  const [district, setDistrict] = React.useState(party?.district ?? "");
  const [country, setCountry] = React.useState(party?.country ?? "");
  const [binVat, setBinVat] = React.useState(party?.binVat ?? "");
  const [tinNo, setTinNo] = React.useState(party?.tinNo ?? "");
  const [tradeLicenseNo, setTradeLicenseNo] = React.useState(party?.tradeLicenseNo ?? "");
  const [registrationNo, setRegistrationNo] = React.useState(party?.registrationNo ?? "");
  const [bankName, setBankName] = React.useState(party?.bankName ?? "");
  const [bankAccountName, setBankAccountName] = React.useState(party?.bankAccountName ?? "");
  const [bankAccountNo, setBankAccountNo] = React.useState(party?.bankAccountNo ?? "");
  const [bankBranch, setBankBranch] = React.useState(party?.bankBranch ?? "");
  const [bankRoutingSwift, setBankRoutingSwift] = React.useState(party?.bankRoutingSwift ?? "");
  const [paymentTermId, setPaymentTermId] = React.useState(party?.paymentTermId ?? "");
  const [defaultCurrency, setDefaultCurrency] = React.useState(party?.defaultCurrency ?? "BDT");
  const [creditLimit, setCreditLimit] = React.useState(party?.creditLimit ?? "");
  const [categoryId, setCategoryId] = React.useState(party?.categoryId ?? "");
  const [notes, setNotes] = React.useState(party?.notes ?? "");

  const [tradeCategoryId, setTradeCategoryId] = React.useState(party?.subcontractorProfile?.tradeCategoryId ?? "");
  const [specialization, setSpecialization] = React.useState(party?.subcontractorProfile?.specialization ?? "");
  const [defaultRetentionPct, setDefaultRetentionPct] = React.useState(party?.subcontractorProfile?.defaultRetentionPct ?? "");
  const [performanceRating, setPerformanceRating] = React.useState(party?.subcontractorProfile?.performanceRating ?? "");

  const [error, setError] = React.useState<string | null>(null);

  const isSubcontractor = roles.includes("SUBCONTRACTOR");

  function toggleRole(role: PartyRole) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!roles.length) return setError("Select at least one role.");

    const payload = {
      code: code.trim() || undefined,
      name: name.trim(),
      displayName: displayName.trim() || undefined,
      roles,
      status,
      contactPerson: contactPerson.trim() || undefined,
      phone: phone.trim() || undefined,
      alternatePhone: alternatePhone.trim() || undefined,
      email: email.trim() || undefined,
      website: website.trim() || undefined,
      address: address.trim() || undefined,
      district: district.trim() || undefined,
      country: country.trim() || undefined,
      binVat: binVat.trim() || undefined,
      tinNo: tinNo.trim() || undefined,
      tradeLicenseNo: tradeLicenseNo.trim() || undefined,
      registrationNo: registrationNo.trim() || undefined,
      bankName: bankName.trim() || undefined,
      bankAccountName: bankAccountName.trim() || undefined,
      bankAccountNo: bankAccountNo.trim() || undefined,
      bankBranch: bankBranch.trim() || undefined,
      bankRoutingSwift: bankRoutingSwift.trim() || undefined,
      paymentTermId: paymentTermId || undefined,
      defaultCurrency: defaultCurrency.trim() || undefined,
      creditLimit: creditLimit === "" ? undefined : Number(creditLimit),
      categoryId: categoryId || undefined,
      notes: notes.trim() || undefined,
      subcontractor: isSubcontractor
        ? {
            tradeCategoryId: tradeCategoryId || undefined,
            specialization: specialization.trim() || undefined,
            defaultRetentionPct: defaultRetentionPct === "" ? undefined : Number(defaultRetentionPct),
            performanceRating: performanceRating === "" ? undefined : Number(performanceRating),
          }
        : undefined,
    };

    // Duplicate detection is a non-blocking warning (never blocks, never merges) — by the
    // time we see the response the record is already saved, so we always navigate onward
    // and simply surface the warning first rather than inviting a re-submit that would
    // create a second record.
    if (mode === "create") {
      createMutation.mutate(payload, {
        onSuccess: (record) => {
          if (record.duplicateWarnings?.length) window.alert(`Saved, but possible duplicate detected:\n\n${record.duplicateWarnings.join("\n")}`);
          router.push(`${listPath}/${record.id}`);
        },
        onError: () => setError("Failed to save. Please check the form and try again."),
      });
    } else if (party) {
      updateMutation.mutate(
        { id: party.id, payload },
        {
          onSuccess: (record) => {
            if (record.duplicateWarnings?.length) window.alert(`Saved, but possible duplicate detected:\n\n${record.duplicateWarnings.join("\n")}`);
            router.push(`${listPath}/${party.id}`);
          },
          onError: () => setError("Failed to save. Please check the form and try again."),
        },
      );
    }
  }

  const heading = variant === "vendor" ? "Vendor / Supplier" : "Subcontractor";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={mode === "create" ? `Add ${heading}` : `Edit ${heading}`}
        subtitle={variant === "vendor" ? "Manage approved suppliers, vendors and service providers." : "Manage subcontractors engaged for project execution."}
      />

      <form onSubmit={submit} className="flex flex-col gap-6">
        <Section title="Basic Information">
          <FormField label="Code" helper="Leave blank to auto-generate">
            <TextInput placeholder={variant === "vendor" ? "Auto (VEN-####)" : "Auto (SUB-####)"} value={code} onChange={(e) => setCode(e.target.value)} disabled={mode === "edit"} />
          </FormField>
          <FormField label="Name" required>
            <TextInput placeholder="Legal / registered name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Display Name">
            <TextInput placeholder="Optional short name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </FormField>
          <FormField label="Status">
            <SelectInput options={PARTY_STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} />
          </FormField>
          <FormField label="Category">
            <SelectInput placeholder="None" options={(vendorCategories.data ?? []).map((c) => ({ label: c.name, value: c.id }))} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
          </FormField>
          <div className="md:col-span-2 lg:col-span-3">
            <FormField label="Party Type / Roles" required helper="A party may carry more than one role (e.g. Supplier and Subcontractor)">
              <div className="flex flex-wrap gap-4">
                {PAYEE_PARTY_ROLE_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-[13px] text-biz-text">
                    <input type="checkbox" checked={roles.includes(option.value)} onChange={() => toggleRole(option.value)} className="h-4 w-4 rounded border-biz-border" />
                    {option.label}
                  </label>
                ))}
              </div>
            </FormField>
          </div>
        </Section>

        <Section title="Contact">
          <FormField label="Contact Person">
            <TextInput value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormField label="Alternate Phone">
            <TextInput value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} />
          </FormField>
          <FormField label="Email">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField label="Website">
            <TextInput value={website} onChange={(e) => setWebsite(e.target.value)} />
          </FormField>
        </Section>

        <Section title="Address">
          <div className="md:col-span-2 lg:col-span-3">
            <FormField label="Address">
              <textarea
                rows={2}
                className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </FormField>
          </div>
          <FormField label="District">
            <TextInput value={district} onChange={(e) => setDistrict(e.target.value)} />
          </FormField>
          <FormField label="Country">
            <TextInput value={country} onChange={(e) => setCountry(e.target.value)} />
          </FormField>
        </Section>

        <Section title="Tax & Registration">
          <FormField label="BIN / VAT Registration">
            <TextInput value={binVat} onChange={(e) => setBinVat(e.target.value)} />
          </FormField>
          <FormField label="TIN / Tax ID">
            <TextInput value={tinNo} onChange={(e) => setTinNo(e.target.value)} />
          </FormField>
          <FormField label="Trade License No.">
            <TextInput value={tradeLicenseNo} onChange={(e) => setTradeLicenseNo(e.target.value)} />
          </FormField>
          <FormField label="Registration No.">
            <TextInput value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} />
          </FormField>
        </Section>

        <Section title="Bank Details">
          <FormField label="Bank Name">
            <TextInput value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </FormField>
          <FormField label="Bank Account Name">
            <TextInput value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} />
          </FormField>
          <FormField label="Bank Account No.">
            <TextInput value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} />
          </FormField>
          <FormField label="Branch">
            <TextInput value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} />
          </FormField>
          <FormField label="Routing / SWIFT">
            <TextInput value={bankRoutingSwift} onChange={(e) => setBankRoutingSwift(e.target.value)} />
          </FormField>
        </Section>

        <Section title="Commercial">
          <FormField label="Payment Terms">
            <SelectInput placeholder="None" options={(paymentTerms.data ?? []).map((t) => ({ label: t.name, value: t.id }))} value={paymentTermId} onChange={(e) => setPaymentTermId(e.target.value)} />
          </FormField>
          <FormField label="Default Currency">
            <TextInput value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} />
          </FormField>
          <FormField label="Credit Limit" helper="Optional">
            <CurrencyInput value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
          </FormField>
          <div className="md:col-span-2 lg:col-span-3">
            <FormField label="Notes">
              <textarea
                rows={2}
                className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </FormField>
          </div>
        </Section>

        {isSubcontractor && (
          <Section title="Subcontractor Details">
            <FormField label="Trade / Work Category">
              <SelectInput placeholder="None" options={(tradeCategories.data ?? []).map((c) => ({ label: c.name, value: c.id }))} value={tradeCategoryId} onChange={(e) => setTradeCategoryId(e.target.value)} />
            </FormField>
            <FormField label="Specialization">
              <TextInput value={specialization} onChange={(e) => setSpecialization(e.target.value)} />
            </FormField>
            <FormField label="Default Retention %" helper="Falls back to the project contract's retention rate if left blank">
              <TextInput type="number" step="0.01" value={defaultRetentionPct} onChange={(e) => setDefaultRetentionPct(e.target.value)} />
            </FormField>
            <FormField label="Performance Rating" helper="0 to 5">
              <TextInput type="number" step="0.1" min="0" max="5" value={performanceRating} onChange={(e) => setPerformanceRating(e.target.value)} />
            </FormField>
          </Section>
        )}

        {error && <p className="text-[13px] text-biz-danger">{error}</p>}

        <div className="flex items-center justify-end gap-3 border-t border-biz-border pt-5">
          <SecondaryButton type="button" onClick={() => router.push(party ? `${listPath}/${party.id}` : listPath)}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending}>
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
