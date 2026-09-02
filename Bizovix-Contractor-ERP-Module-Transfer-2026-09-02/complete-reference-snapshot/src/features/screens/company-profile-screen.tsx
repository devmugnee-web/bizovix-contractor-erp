"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, PencilLine, Save, UploadCloud, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { businessCategoryOptions, businessTypeOptions } from "@/config/business-workspaces";
import { useCurrentSessionQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { cn } from "@/lib/utils";
import {
  defaultCompanyProfile,
  readCompanyProfile,
  type CompanyProfileSnapshot,
  writeCompanyProfile,
} from "@/services/company-profile";
import { updateCompanyName } from "@/services/workspace.service";

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <label className="text-sm font-medium text-[#5d6b84]">
      {label}
      {required ? <span className="text-[#ff2440]">*</span> : null}
    </label>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

export function CompanyProfileScreen() {
  const { mode, session } = useSessionContext();
  const queryClient = useQueryClient();
  const workspaceId = session?.workspaceId ?? "workspace";
  const logoInputRef = useRef<HTMLInputElement>(null);
  const invoicePadInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<CompanyProfileSnapshot>(defaultCompanyProfile);
  const [savedProfile, setSavedProfile] = useState<CompanyProfileSnapshot>(defaultCompanyProfile);
  const [isReady, setIsReady] = useState(false);
  const currentSessionQuery = useCurrentSessionQuery(mode);

  useEffect(() => {
    const snapshot = readCompanyProfile(mode, workspaceId);
    setProfile(snapshot);
    setSavedProfile(snapshot);
    setIsReady(true);
  }, [mode, workspaceId]);

  // The locally cached profile snapshot has no backend column for the company
  // name — `Company.name` itself is the only source of truth (same one the
  // sidebar reads via the session). Once it loads, it overrides whatever was
  // cached here, so this form and the sidebar can never show two different
  // names for the same company.
  useEffect(() => {
    if (mode !== "api") return;
    const realName = currentSessionQuery.data?.company.name?.trim();
    if (!realName) return;
    setProfile((current) => (current.companyName === realName ? current : { ...current, companyName: realName }));
    setSavedProfile((current) => (current.companyName === realName ? current : { ...current, companyName: realName }));
  }, [mode, currentSessionQuery.data?.company.name]);

  const isDirty = useMemo(() => JSON.stringify(profile) !== JSON.stringify(savedProfile), [profile, savedProfile]);

  function updateField<Key extends keyof CompanyProfileSnapshot>(field: Key, value: CompanyProfileSnapshot[Key]) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    field: "logoDataUrl" | "invoicePadDataUrl" | "signatureDataUrl",
    label: "Logo" | "Invoice Pad" | "Signature",
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error(`${label} must be an image file`);
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error(`${label} image should be under 2 MB`);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateField(field, dataUrl);
      toast.success(`${label} uploaded`);
    } catch {
      toast.error(`Could not upload ${label.toLowerCase()}`);
    }
  }

  function handleCancel() {
    setProfile(savedProfile);
    toast.message("Unsaved changes discarded");
  }

  function handleSave() {
    const normalizedProfile: CompanyProfileSnapshot = {
      ...profile,
      companyName: profile.companyName.trim(),
      phoneNumber: profile.phoneNumber.trim(),
      emailAddress: profile.emailAddress.trim(),
      businessType: profile.businessType.trim(),
      businessCategory: profile.businessCategory.trim(),
      businessAddress: profile.businessAddress.trim(),
      pincode: profile.pincode.trim(),
    };

    if (!normalizedProfile.companyName) {
      toast.error("Business name is required");
      return;
    }

    if (!normalizedProfile.phoneNumber) {
      toast.error("Phone number is required");
      return;
    }

    if (
      normalizedProfile.emailAddress &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedProfile.emailAddress)
    ) {
      toast.error("Enter a valid email address");
      return;
    }

    const snapshot = writeCompanyProfile(mode, workspaceId, normalizedProfile);
    setProfile(snapshot);
    setSavedProfile(snapshot);

    void (async () => {
      try {
        await updateCompanyName(mode, workspaceId, snapshot.companyName);
        // The sidebar and document headers read the company off the session, so
        // it has to be refetched for the new name to show without a reload.
        await queryClient.invalidateQueries({ queryKey: [mode, "current-session"] });
        toast.success("Company profile saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Business name could not be updated everywhere");
      }
    })();
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col gap-3 overflow-hidden">
      <div className="shrink-0 space-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground sm:text-[28px]">Edit Profile</h1>
        <p className="text-sm text-muted">
          Update your business identity, contact details, and print assets from one place.
        </p>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[#d8e3f1] bg-white shadow-[0_20px_40px_rgba(15,23,42,0.05)]">
        <div className="border-t-4 border-[#d7e5f7]" />

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 gap-7 overflow-hidden px-5 py-5 lg:grid-cols-[clamp(190px,14.6vw,250px)_minmax(0,1fr)] xl:px-7 xl:py-5">
            <div className="min-h-0 space-y-4 overflow-hidden">
              <div className="relative mx-auto w-fit lg:mx-0">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border-[4px] border-[#1d76f2] bg-[#eaf3ff] text-[#8192b8] shadow-[0_10px_24px_rgba(29,118,242,0.12)]"
                >
                  {profile.logoDataUrl ? (
                    <img src={profile.logoDataUrl} alt="Company logo" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-center text-[22px] font-medium leading-[1.2]">
                      Add
                      <br />
                      Logo
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="absolute bottom-1 right-1 flex h-11 w-11 items-center justify-center rounded-full border border-[#e3e9f3] bg-white text-[#7f8db0] shadow-[0_10px_18px_rgba(15,23,42,0.1)] transition hover:text-[#1d76f2]"
                  aria-label="Change logo"
                >
                  <PencilLine className="h-5 w-5" />
                </button>

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void handleImageChange(event, "logoDataUrl", "Logo")}
                />
              </div>

                <div className="space-y-2 text-sm text-[#6e7d95]">
                  <p>This logo will appear on invoices, vouchers, and printable documents.</p>
                  {profile.logoDataUrl ? (
                  <button
                    type="button"
                    onClick={() => updateField("logoDataUrl", null)}
                    className="inline-flex items-center gap-2 rounded-full border border-[#f0d6d9] px-3 py-1.5 text-[#d54557] transition hover:bg-[#fff5f6]"
                  >
                    <X className="h-4 w-4" />
                    Remove Logo
                  </button>
                  ) : null}
                </div>

                <div className="rounded-[18px] border border-[#e4ebf5] bg-[#fbfdff] p-4">
                  <div className="flex flex-col gap-3">
                    <div className="min-w-0">
                      <div className="text-[0.95rem] font-semibold leading-5 text-[#243453]">Invoice Pad / Letterhead</div>
                      <div className="mt-1 text-[0.9rem] leading-5 text-[#5f6f88]">Upload your own invoice pad so invoice preview and print follow your business stationery.</div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full justify-center rounded-full border-[#d7e2f0] bg-white px-4 text-[#243453] hover:bg-[#f8fbff]"
                      onClick={() => invoicePadInputRef.current?.click()}
                    >
                      <UploadCloud className="h-4 w-4" />
                      {profile.invoicePadDataUrl ? "Change Pad" : "Upload Pad"}
                    </Button>
                  </div>

                  <input
                    ref={invoicePadInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void handleImageChange(event, "invoicePadDataUrl", "Invoice Pad")}
                  />

                  <div className="mt-4 overflow-hidden rounded-[16px] border border-dashed border-[#d6deea] bg-white">
                    {profile.invoicePadDataUrl ? (
                      <img src={profile.invoicePadDataUrl} alt="Invoice pad preview" className="h-[150px] w-full bg-white object-contain object-top" />
                    ) : (
                      <div className="flex h-[150px] flex-col items-center justify-center gap-3 px-5 text-center text-[#8593aa]">
                        <ImagePlus className="h-8 w-8" />
                        <div className="text-sm">Upload a full invoice background or letterhead image.</div>
                      </div>
                    )}
                  </div>

                  {profile.invoicePadDataUrl ? (
                    <button
                      type="button"
                      onClick={() => updateField("invoicePadDataUrl", null)}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#f0d6d9] px-3 py-1.5 text-sm text-[#d54557] transition hover:bg-[#fff5f6]"
                    >
                      <X className="h-4 w-4" />
                      Remove Invoice Pad
                    </button>
                  ) : null}
                </div>
              </div>

            <div className="grid min-h-0 gap-7 xl:grid-cols-3">
              <div className="space-y-5">
                <h2 className="text-[15px] font-semibold text-[#243453]">Business Details</h2>

                <div className="space-y-2">
                  <FieldLabel label="Business Name" required />
                  <Input
                    value={profile.companyName}
                    onChange={(event) => updateField("companyName", event.target.value)}
                    placeholder="Enter business name"
                    className="h-11 rounded-[12px] border-[#b9cae7] px-4 text-[15px] focus-visible:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <FieldLabel label="Phone Number" required />
                  <Input
                    value={profile.phoneNumber}
                    onChange={(event) => updateField("phoneNumber", event.target.value)}
                    placeholder="Enter phone number"
                    className="h-11 rounded-[12px] border-[#b9cae7] px-4 text-[15px]"
                  />
                </div>

                <div className="space-y-2">
                  <FieldLabel label="Email ID" />
                  <Input
                    value={profile.emailAddress}
                    onChange={(event) => updateField("emailAddress", event.target.value)}
                    placeholder="Enter Email ID"
                    className="h-11 rounded-[12px] border-[#b9cae7] px-4 text-[15px]"
                  />
                </div>

                <div className="space-y-2 pt-10">
                  <FieldLabel label="Account Books Beginning Date" />
                  <AppDateInput
                    aria-label="Account Books Beginning Date"
                    value={profile.booksBeginningDate}
                    onChange={(value) => updateField("booksBeginningDate", value)}
                    inputClassName="h-11 rounded-[12px] border-[#b9cae7] px-4 pr-12 text-[15px]"
                  />
                </div>
              </div>

              <div className="space-y-5">
                <h2 className="text-[15px] font-semibold text-[#243453]">More Details</h2>

                <div className="space-y-2">
                  <FieldLabel label="Business Type" />
                  <select
                    value={profile.businessType}
                    onChange={(event) => updateField("businessType", event.target.value)}
                    className="flex h-11 w-full rounded-[12px] border border-[#b9cae7] bg-white px-4 text-[15px] text-foreground"
                  >
                    {businessTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <FieldLabel label="Business Category" />
                  <select
                    value={profile.businessCategory}
                    onChange={(event) => updateField("businessCategory", event.target.value)}
                    className="flex h-11 w-full rounded-[12px] border border-[#b9cae7] bg-white px-4 text-[15px] text-foreground"
                  >
                    {businessCategoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <FieldLabel label="Pincode" />
                  <Input
                    value={profile.pincode}
                    onChange={(event) => updateField("pincode", event.target.value)}
                    placeholder="Enter Pincode"
                    className="h-11 rounded-[12px] border-[#b9cae7] px-4 text-[15px]"
                  />
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <FieldLabel label="Business Address" />
                  <textarea
                    value={profile.businessAddress}
                    onChange={(event) => updateField("businessAddress", event.target.value)}
                    placeholder="Enter Business Address"
                    className="min-h-[112px] w-full rounded-[12px] border border-[#b9cae7] bg-white px-4 py-3 text-[15px] text-foreground placeholder:text-muted/90"
                  />
                </div>

                <div className="space-y-2">
                  <FieldLabel label="Add Signature" />
                  <button
                    type="button"
                    onClick={() => signatureInputRef.current?.click()}
                    className={cn(
                      "flex min-h-[112px] w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed px-4 py-5 text-sm transition",
                      profile.signatureDataUrl
                        ? "border-[#c9d8ef] bg-[#f8fbff] text-[#243453]"
                        : "border-[#bccae2] bg-white text-[#8b9ab8] hover:bg-[#fbfdff]",
                    )}
                  >
                    {profile.signatureDataUrl ? (
                      <>
                        <img
                          src={profile.signatureDataUrl}
                          alt="Signature preview"
                          className="max-h-[56px] w-auto max-w-full object-contain"
                        />
                        <span className="font-medium text-[#6a7b99]">Replace Signature</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-8 w-8" />
                        <span>Upload Signature</span>
                      </>
                    )}
                  </button>

                  <input
                    ref={signatureInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void handleImageChange(event, "signatureDataUrl", "Signature")}
                  />

                  {profile.signatureDataUrl ? (
                    <button
                      type="button"
                      onClick={() => updateField("signatureDataUrl", null)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#f0d6d9] px-3 py-1.5 text-sm text-[#d54557] transition hover:bg-[#fff5f6]"
                    >
                      <X className="h-4 w-4" />
                      Remove Signature
                    </button>
                  ) : null}
                </div>

                <div className="rounded-[16px] border border-[#e4ebf5] bg-[#fbfdff] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef5ff] text-[#1d76f2]">
                      <ImagePlus className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#243453]">Saved Brand Preview</div>
                      <div className="text-sm text-[#6c7a93]">{profile.companyName || "Business name will appear here"}</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-[#56657f]">
                    <div>{profile.phoneNumber || "Phone number"}</div>
                    <div>{profile.emailAddress || "Email address"}</div>
                    <div>{profile.businessCategory || "Business category"}</div>
                    <div>{profile.businessAddress || "Business address"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-[#e6edf6] bg-[#fcfdff] px-6 py-3 xl:px-8">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={!isDirty}
              className="rounded-full border border-[#e5e9f1] bg-white px-6 text-[#697690] hover:bg-[#f8fbff] hover:text-[#243453]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!isReady || !isDirty}
              className="rounded-full bg-primary px-6 text-white hover:bg-[#cf670f]"
            >
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
