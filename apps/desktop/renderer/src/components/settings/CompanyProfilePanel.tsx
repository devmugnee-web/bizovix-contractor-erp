"use client";
import * as React from "react";
import { Upload } from "lucide-react";
import { TextInput } from "@bizovix/ui";
import {
  useCompanyAssetUrl,
  useCompanyProfile,
  useUpdateCompanyProfile,
  useUploadCompanyAsset,
} from "@bizovix/api-client";
import type { CompanyAssetKind, SaveCompanyProfileInput } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Field, SaveBar, SettingsCard, SettingsSectionHeader, isDirty, useSettingsNotice, useSyncedForm } from "./shared";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_SIZE = 2 * 1024 * 1024;

function AssetUpload({ kind, label, hasAsset }: { kind: CompanyAssetKind; label: string; hasAsset: boolean }) {
  const url = useCompanyAssetUrl(kind, hasAsset);
  const upload = useUploadCompanyAsset();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState("");

  async function onFile(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) return setError("Only PNG, JPG, WEBP or SVG images are allowed.");
    if (file.size > MAX_SIZE) return setError("File must be smaller than 2 MB.");
    await upload.mutateAsync({ kind, file });
  }

  return (
    <div className="flex items-center gap-3 rounded border border-biz-border p-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed border-biz-border bg-biz-bg">
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-contain" />
        ) : (
          <Upload className="h-5 w-5 text-biz-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-biz-text">{label}</p>
        <p className="text-[10px] text-biz-muted">PNG, JPG, WEBP or SVG. Max 2 MB.</p>
        {error && <p className="mt-1 text-[10px] text-biz-danger">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="mt-1.5 rounded border border-biz-border px-2.5 py-1 text-[10px] font-semibold text-biz-text hover:bg-biz-bg disabled:opacity-50"
        >
          {upload.isPending ? "Uploading..." : hasAsset ? "Replace" : "Upload"}
        </button>
      </div>
    </div>
  );
}

export function CompanyProfilePanel() {
  useSetBreadcrumb([{ label: "Settings", href: "/settings" }, { label: "Company Profile" }]);
  const query = useCompanyProfile();
  const update = useUpdateCompanyProfile();
  const { notify, Notice } = useSettingsNotice();
  const [form, setForm] = useSyncedForm(query.data, toInput);

  function toInput(d: NonNullable<typeof query.data>): SaveCompanyProfileInput {
    return {
      legalName: d.legalName ?? "",
      displayName: d.displayName ?? "",
      address: d.address ?? "",
      phone: d.phone ?? "",
      email: d.email ?? "",
      website: d.website ?? "",
      tradeLicenseNo: d.tradeLicenseNo ?? "",
      tinNumber: d.tinNumber ?? "",
      binNumber: d.binNumber ?? "",
      registrationNumber: d.registrationNumber ?? "",
      signatoryName: d.signatoryName ?? "",
      signatoryDesignation: d.signatoryDesignation ?? "",
    };
  }

  const dirty = !!(query.data && form && isDirty(toInput(query.data), form));

  async function save() {
    if (!form) return;
    try {
      await update.mutateAsync(form);
      notify("Company profile updated successfully.");
    } catch {
      notify("Failed to update company profile.");
    }
  }

  if (query.isLoading || !form || !query.data) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;

  return (
    <div className="flex flex-col gap-4">
      {Notice}
      <SettingsSectionHeader
        title="Company Profile"
        description="Legal identity, contact details and branding assets reused across reports, receipts and generated documents."
      />
      <SettingsCard title="Branding">
        <div className="grid gap-3 sm:grid-cols-3">
          <AssetUpload kind="logo" label="Company Logo" hasAsset={query.data.hasLogo} />
          <AssetUpload kind="signature" label="Signature" hasAsset={query.data.hasSignature} />
          <AssetUpload kind="seal" label="Company Seal" hasAsset={query.data.hasSeal} />
        </div>
      </SettingsCard>
      <SettingsCard title="Company Details">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Legal Company Name">
            <TextInput value={form.legalName ?? ""} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
          </Field>
          <Field label="Display Name">
            <TextInput value={form.displayName ?? ""} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </Field>
          <Field label="Phone">
            <TextInput value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <TextInput type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Website">
            <TextInput value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </Field>
          <Field label="Address">
            <TextInput value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
        </div>
      </SettingsCard>
      <SettingsCard title="Registration & Tax">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Trade License Number">
            <TextInput value={form.tradeLicenseNo ?? ""} onChange={(e) => setForm({ ...form, tradeLicenseNo: e.target.value })} />
          </Field>
          <Field label="TIN Number">
            <TextInput value={form.tinNumber ?? ""} onChange={(e) => setForm({ ...form, tinNumber: e.target.value })} />
          </Field>
          <Field label="BIN / VAT Number">
            <TextInput value={form.binNumber ?? ""} onChange={(e) => setForm({ ...form, binNumber: e.target.value })} />
          </Field>
          <Field label="Registration / Incorporation Number">
            <TextInput value={form.registrationNumber ?? ""} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
          </Field>
        </div>
      </SettingsCard>
      <SettingsCard title="Authorized Signatory">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Signatory Name">
            <TextInput value={form.signatoryName ?? ""} onChange={(e) => setForm({ ...form, signatoryName: e.target.value })} />
          </Field>
          <Field label="Signatory Designation">
            <TextInput value={form.signatoryDesignation ?? ""} onChange={(e) => setForm({ ...form, signatoryDesignation: e.target.value })} />
          </Field>
        </div>
        <div className="mt-5">
          <SaveBar dirty={dirty} saving={update.isPending} onSave={save} onReset={() => setForm(toInput(query.data!))} />
        </div>
      </SettingsCard>
    </div>
  );
}
