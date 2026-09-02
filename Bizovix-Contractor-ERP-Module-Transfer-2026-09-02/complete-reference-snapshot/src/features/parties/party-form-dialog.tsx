"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Settings2, X } from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { WhatsAppIcon } from "@/components/shared/brand-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildWhatsAppChatUrl } from "@/lib/app-actions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError, apiRequest } from "@/services/api-client";
import type { DataMode, PartyRecord } from "@/types/domain";

/**
 * The one party entry form in the product. It lives here rather than inside the
 * Customer & Suppliers screen because vouchers open the very same form mid-entry —
 * a purchase bill's "+ Add Supplier" must collect every field the masters screen
 * collects, not a reduced copy of it that silently drops addresses and credit terms.
 *
 * The dialog owns the form values and the write; the caller owns the surrounding
 * bookkeeping (its own list, selection, field-visibility settings) and receives the
 * saved record through onSaved.
 */

export type PartySettingsState = {
  grouping: boolean;
  shippingAddress: boolean;
  manageStatus: boolean;
  paymentReminder: boolean;
  reminderDays: string;
  additionalFields: Array<{
    enabled: boolean;
    label: string;
    print: boolean;
  }>;
};

export type PartyFormState = {
  name: string;
  partyCategory: "business" | "individual";
  type: PartyRecord["type"];
  contactPerson: string;
  contact: string;
  whatsappNumber: string;
  dateOfBirth: string;
  marriageDate: string;
  email: string;
  billingAddress: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  postalCode: string;
  country: string;
  shippingAddress: string;
  creditLimit: string;
  openingBalance: string;
  billMaturityDays: string;
  taxId: string;
  notes: string;
  tags: string;
};

export type PartyFormTab = "basic" | "address" | "credit" | "additional";

/** What the Balance Snapshot panel shows. Only the caller knows these totals. */
export type PartyBalanceSnapshot = {
  outstanding: number;
  transactionCount: number;
  status: string;
};

const defaultSettings: PartySettingsState = {
  grouping: true,
  shippingAddress: false,
  manageStatus: false,
  paymentReminder: true,
  reminderDays: "1",
  additionalFields: [
    { enabled: false, label: "", print: false },
    { enabled: false, label: "", print: false },
    { enabled: false, label: "", print: false },
  ],
};

function cloneDefaultSettings(): PartySettingsState {
  return {
    grouping: defaultSettings.grouping,
    shippingAddress: defaultSettings.shippingAddress,
    manageStatus: defaultSettings.manageStatus,
    paymentReminder: defaultSettings.paymentReminder,
    reminderDays: defaultSettings.reminderDays,
    additionalFields: defaultSettings.additionalFields.map((field) => ({ ...field })),
  };
}

function normalizePartySettings(value: unknown): PartySettingsState {
  if (!value || typeof value !== "object") {
    return cloneDefaultSettings();
  }

  const record = value as Partial<PartySettingsState>;
  return {
    grouping: Boolean(record.grouping ?? defaultSettings.grouping),
    shippingAddress: Boolean(record.shippingAddress ?? defaultSettings.shippingAddress),
    manageStatus: Boolean(record.manageStatus ?? defaultSettings.manageStatus),
    paymentReminder: Boolean(record.paymentReminder ?? defaultSettings.paymentReminder),
    reminderDays:
      typeof record.reminderDays === "string" && record.reminderDays.trim().length > 0
        ? record.reminderDays
        : defaultSettings.reminderDays,
    additionalFields: Array.from({ length: 3 }, (_, index) => {
      const sourceField = record.additionalFields?.[index];
      return {
        enabled: Boolean(sourceField?.enabled),
        label: typeof sourceField?.label === "string" ? sourceField.label : "",
        print: Boolean(sourceField?.print),
      };
    }),
  };
}

function getPartySettingsStorageKey(mode: DataMode, workspaceId: string, partyType: PartyRecord["type"]) {
  return `bizovix:party-settings:${mode}:${workspaceId || "workspace"}:${partyType}`;
}

export function cloneDefaultPartySettings(): PartySettingsState {
  return cloneDefaultSettings();
}

export { normalizePartySettings, getPartySettingsStorageKey };

/** Reads the field-visibility settings a workspace saved for this party type. */
export function readStoredPartySettings(mode: DataMode, workspaceId: string, partyType: PartyRecord["type"]): PartySettingsState {
  if (typeof window === "undefined") {
    return cloneDefaultSettings();
  }

  try {
    const saved = window.localStorage.getItem(getPartySettingsStorageKey(mode, workspaceId, partyType));
    return saved ? normalizePartySettings(JSON.parse(saved)) : cloneDefaultSettings();
  } catch {
    return cloneDefaultSettings();
  }
}

/** Everything downstream (invoices, party header, reports) reads the single `address`
 * column, so the detailed fields stay the input surface and this renders them back into
 * the plain text those screens expect. */
export function composeDetailedPartyAddress(
  form: Pick<PartyFormState, "addressLine1" | "addressLine2" | "city" | "district" | "postalCode" | "country">,
) {
  const locality = [form.city, form.district].map((value) => value.trim()).filter(Boolean).join(", ");
  const localityLine = [locality, form.postalCode.trim()].filter(Boolean).join(" - ");
  return [form.addressLine1.trim(), form.addressLine2.trim(), localityLine, form.country.trim()].filter(Boolean).join("\n");
}

export function createDefaultPartyFormState(type: PartyRecord["type"] = "customer"): PartyFormState {
  return {
    name: "",
    partyCategory: "business",
    type,
    contactPerson: "",
    contact: "",
    whatsappNumber: "",
    dateOfBirth: "",
    marriageDate: "",
    email: "",
    billingAddress: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    district: "",
    postalCode: "",
    country: "",
    shippingAddress: "",
    creditLimit: "",
    openingBalance: "",
    billMaturityDays: "30",
    taxId: "",
    notes: "",
    tags: "",
  };
}

function partyErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function PartyFormDialog({
  open,
  onOpenChange,
  mode,
  workspaceId,
  seed,
  editingParty,
  summary,
  settings,
  onSettingsChange,
  onOpenSettings,
  onSaved,
  onTypeChange,
  lockType = false,
  showSaveAndNew = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DataMode;
  workspaceId: string;
  /** Values the form opens with. Re-read every time the dialog is opened. */
  seed: PartyFormState;
  /** The record being edited, or null when creating. */
  editingParty: PartyRecord | null;
  summary?: PartyBalanceSnapshot | null;
  settings: PartySettingsState;
  onSettingsChange: (updater: (current: PartySettingsState) => PartySettingsState) => void;
  /** Omitted (voucher context) hides the settings gear. */
  onOpenSettings?: () => void;
  onSaved: (party: PartyRecord, context: { previous: PartyRecord | null; keepOpen: boolean }) => void;
  onTypeChange?: (type: PartyRecord["type"]) => void;
  lockType?: boolean;
  /** Bulk entry only makes sense on the masters screen; a voucher wants one party. */
  showSaveAndNew?: boolean;
}) {
  const [partyForm, setPartyForm] = useState<PartyFormState>(seed);
  const [formTabs, setFormTabs] = useState<Record<PartyRecord["type"], PartyFormTab>>({ customer: "address", supplier: "address" });
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  /* A new seed object is how a caller says "this is a fresh entry" — opening for a
   * different party, or clearing after a save. Keyed on the seed rather than on `open`
   * so that a round trip through the settings drawer, which closes and reopens this
   * dialog, comes back to the half-filled form instead of a blank one. */
  useEffect(() => {
    setPartyForm(seed);
    setTagInput("");
    setFormTabs({ customer: "address", supplier: "address" });
  }, [seed]);

  const settingsState = settings;
  const editingPartyId = editingParty?.id ?? null;
  const formTab = formTabs[partyForm.type];
  const formEntityLabel = partyForm.type === "supplier" ? "Supplier" : "Customer";
  const partyDialogTitle = editingPartyId ? formEntityLabel : `Add ${formEntityLabel}`;
  const partyNameLabel = partyForm.partyCategory === "business" ? "Company Name" : "Customer Name";
  const partyTagsLabel = `${formEntityLabel} Tags`;
  const canSaveParty = partyForm.name.trim().length > 0;

  /** Customer and Supplier are two different data-entry contexts, so each side remembers
   * its own open tab — flipping the type toggle must not drag the other one's tab along. */
  function setFormTab(tab: PartyFormTab) {
    setFormTabs((current) => ({ ...current, [partyForm.type]: tab }));
  }

  function changePartyType(type: PartyRecord["type"]) {
    setPartyForm((current) => (type === "supplier" ? { ...current, type, creditLimit: "" } : { ...current, type }));
    onTypeChange?.(type);
  }

  function getPartyTags(value = partyForm.tags) {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  function commitPartyTag(rawValue = tagInput) {
    const candidates = rawValue.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (!candidates.length) {
      setTagInput("");
      return;
    }

    setPartyForm((current) => {
      const existing = getPartyTags(current.tags);
      const seen = new Set(existing.map((tag) => tag.toLocaleLowerCase()));
      const uniqueCandidates = candidates.filter((tag) => {
        const key = tag.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { ...current, tags: [...existing, ...uniqueCandidates].join(", ") };
    });
    setTagInput("");
  }

  function removePartyTag(tagToRemove: string) {
    setPartyForm((current) => ({
      ...current,
      tags: getPartyTags(current.tags).filter((tag) => tag !== tagToRemove).join(", "),
    }));
  }

  function handleSaveParty() {
    return saveParty(false);
  }

  function handleSaveAndNewParty() {
    return saveParty(true);
  }

  async function saveParty(openFreshForm: boolean) {
    if (!workspaceId) {
      toast.error("Active workspace not found");
      return;
    }

    if (!partyForm.name.trim()) {
      toast.error(`${partyNameLabel} is required`);
      setFormTab("address");
      return;
    }

    const billMaturityDays = partyForm.billMaturityDays.trim() === "" ? 30 : Number(partyForm.billMaturityDays);
    if (!Number.isInteger(billMaturityDays) || billMaturityDays < 0 || billMaturityDays > 3650) {
      toast.error("Bill Maturity Days must be a whole number between 0 and 3650");
      setFormTab("credit");
      return;
    }

    const existingParty = editingParty;
    const nextParty: PartyRecord = {
      id: existingParty?.id ?? `party-${Date.now()}`,
      workspaceId,
      name: partyForm.name.trim(),
      partyCategory: partyForm.partyCategory,
      type: partyForm.type,
      contact: partyForm.contact.trim(),
      contactPerson: partyForm.contactPerson.trim(),
      whatsappNumber: partyForm.whatsappNumber.trim(),
      dateOfBirth: partyForm.dateOfBirth.trim(),
      marriageDate: partyForm.marriageDate.trim(),
      address: composeDetailedPartyAddress(partyForm) || partyForm.billingAddress.trim(),
      addressLine1: partyForm.addressLine1.trim(),
      addressLine2: partyForm.addressLine2.trim(),
      city: partyForm.city.trim(),
      district: partyForm.district.trim(),
      postalCode: partyForm.postalCode.trim(),
      country: partyForm.country.trim(),
      creditLimit: partyForm.type === "supplier" ? 0 : Number(partyForm.creditLimit || 0),
      openingBalance: Number(partyForm.openingBalance || 0),
      billMaturityDays,
      status: existingParty?.status ?? "active",
    };

    setSaving(true);
    try {
      if (mode === "api") {
        try {
          if (existingParty) {
            await apiRequest(`/parties/${encodeURIComponent(existingParty.id)}`, {
              method: "PUT",
              body: JSON.stringify({
                name: nextParty.name,
                partyCategory: nextParty.partyCategory,
                contact: nextParty.contact,
                contactPerson: nextParty.contactPerson ?? "",
                whatsappNumber: nextParty.whatsappNumber ?? "",
                dateOfBirth: nextParty.dateOfBirth || null,
                marriageDate: nextParty.marriageDate || null,
                address: nextParty.address,
                addressLine1: nextParty.addressLine1 ?? "",
                addressLine2: nextParty.addressLine2 ?? "",
                city: nextParty.city ?? "",
                district: nextParty.district ?? "",
                postalCode: nextParty.postalCode ?? "",
                country: nextParty.country ?? "",
                creditLimit: nextParty.creditLimit,
                openingBalance: nextParty.openingBalance,
                billMaturityDays: nextParty.billMaturityDays,
              }),
            });
          } else {
            const created = (await apiRequest(`/parties`, {
              method: "POST",
              body: JSON.stringify({
                workspaceId: workspaceId,
                name: nextParty.name,
                partyCategory: nextParty.partyCategory,
                type: nextParty.type,
                contact: nextParty.contact,
                contactPerson: nextParty.contactPerson ?? "",
                whatsappNumber: nextParty.whatsappNumber ?? "",
                dateOfBirth: nextParty.dateOfBirth || null,
                marriageDate: nextParty.marriageDate || null,
                address: nextParty.address,
                addressLine1: nextParty.addressLine1 ?? "",
                addressLine2: nextParty.addressLine2 ?? "",
                city: nextParty.city ?? "",
                district: nextParty.district ?? "",
                postalCode: nextParty.postalCode ?? "",
                country: nextParty.country ?? "",
                creditLimit: nextParty.creditLimit,
                openingBalance: nextParty.openingBalance,
                billMaturityDays: nextParty.billMaturityDays,
              }),
            })) as Record<string, unknown>;
            nextParty.id = String(created.id ?? nextParty.id);
          }
        } catch (error) {
          toast.error(partyErrorMessage(error, "This party could not be saved."));
          return;
        }
      }
    } finally {
      setSaving(false);
    }

    const savedLabel = existingParty ? `${nextParty.name} updated` : `${nextParty.name} saved`;
    toast.success(openFreshForm ? `${savedLabel} — form cleared for the next one` : savedLabel);

    onSaved(nextParty, { previous: existingParty, keepOpen: openFreshForm });

    if (openFreshForm) {
      /* Bulk entry stays on the side you were already on — flipping a supplier run back
       * to Customer on every save made the button useless for anything but customers. */
      setPartyForm(createDefaultPartyFormState(nextParty.type));
      setTagInput("");
      setFormTabs({ customer: "address", supplier: "address" });
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[76vh] w-[min(96vw,960px)] max-w-[960px] overflow-hidden rounded-[4px] border border-[#dfe5ee] p-0 shadow-[0_28px_70px_rgba(15,23,42,0.22)]">
        <div className="flex max-h-[76vh] flex-col bg-white">
          <div className="border-b border-[#d9e1ec] bg-white px-7 py-5">
            <div className="flex items-start justify-between gap-4 pr-12">
              <div>
                <DialogTitle className="text-[1.12rem] font-semibold text-[#314968]">{partyDialogTitle}</DialogTitle>
                <DialogDescription className="hidden">
                  {partyForm.name || (partyForm.type === "supplier" ? "New supplier" : "New customer")} · {editingPartyId ? "Edit mode" : "Create mode"}
                </DialogDescription>
              </div>
              {lockType ? null : (
                <div className="inline-flex rounded-full border border-[#dce5f1] bg-[#f8fbff] p-1">
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-semibold transition",
                      partyForm.type === "customer" ? "bg-white text-[#1463b8] shadow-sm" : "text-[#64748b] hover:text-[#1f2937]",
                    )}
                    onClick={() => changePartyType("customer")}
                  >
                    Customer
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-semibold transition",
                      partyForm.type === "supplier" ? "bg-white text-[#1463b8] shadow-sm" : "text-[#64748b] hover:text-[#1f2937]",
                    )}
                    onClick={() => changePartyType("supplier")}
                  >
                    Supplier
                  </button>
                </div>
              )}
              {onOpenSettings ? (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#a3acb8] transition hover:bg-[#f5f7fb] hover:text-[#55657d]"
                  onClick={onOpenSettings}
                  aria-label="Open settings"
                >
                  <Settings2 className="h-5 w-5" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-white">
            <div className="grid gap-5 px-7 py-5">
              <fieldset className="flex flex-wrap items-center gap-5">
                <legend className="mb-2 text-[13px] font-medium text-[#55657d]">Party Type</legend>
                {(["business", "individual"] as const).map((category) => (
                  <label key={category} className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#334155]">
                    <input
                      type="radio"
                      name="party-category"
                      value={category}
                      checked={partyForm.partyCategory === category}
                      onChange={() =>
                        setPartyForm((current) => ({
                          ...current,
                          partyCategory: category,
                          contactPerson: category === "individual" ? "" : current.contactPerson,
                        }))
                      }
                      className="h-4 w-4 accent-[#1463b8]"
                    />
                    {category === "business" ? "Business" : "Individual"}
                  </label>
                ))}
              </fieldset>

              <div className={cn("grid gap-5 md:grid-cols-2", partyForm.partyCategory === "business" ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
                <label className="grid gap-1.5">
                  <span className="text-[13px] text-[#8d9cb3]">
                    {partyNameLabel} <span className="font-semibold text-[#e11d48]">*</span>
                  </span>
                  <Input
                    value={partyForm.name}
                    onChange={(event) => setPartyForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={partyNameLabel}
                    className="h-9 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                  />
                </label>
                {partyForm.partyCategory === "business" ? <label className="grid gap-1.5">
                  <span className="text-[13px] text-[#8d9cb3]">Primary Contact Person</span>
                  <Input
                    value={partyForm.contactPerson}
                    onChange={(event) => setPartyForm((current) => ({ ...current, contactPerson: event.target.value }))}
                    placeholder="Primary Contact Person"
                    className="h-9 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                  />
                </label> : null}
                <label className="grid gap-1.5">
                  <span className="text-[13px] text-[#8d9cb3]">Mobile Number</span>
                  <Input
                    value={partyForm.contact}
                    onChange={(event) => setPartyForm((current) => ({ ...current, contact: event.target.value }))}
                    placeholder="Mobile Number"
                    className="h-9 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[13px] text-[#8d9cb3]">WhatsApp Number</span>
                  <div className="flex items-center gap-2">
                    <Input
                      value={partyForm.whatsappNumber}
                      onChange={(event) => setPartyForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                      placeholder="WhatsApp Number"
                      className="h-9 min-w-0 flex-1 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                    />
                    {buildWhatsAppChatUrl(partyForm.whatsappNumber) ? (
                      <a
                        href={buildWhatsAppChatUrl(partyForm.whatsappNumber) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-[#25D366]/40 bg-[#f2fff6] text-[#20a953] transition hover:bg-[#e4fbea]"
                        aria-label="Open this number in WhatsApp"
                        title="Open this number in WhatsApp"
                      >
                        <WhatsAppIcon className="h-4.5 w-4.5" />
                      </a>
                    ) : null}
                    {/* Literal hex, not the bg-primary-* tokens — globals.css whitewashes any
                      * class containing "bg-primary" and strips its border. */}
                    <button
                      type="button"
                      className="h-9 shrink-0 whitespace-nowrap rounded-[4px] border border-[#e67817] bg-[#fff1e2] px-3 text-[11px] font-semibold text-[#c2610c] transition hover:bg-[#ffe2c4] disabled:cursor-not-allowed disabled:border-[#e2e8f0] disabled:bg-[#f6f8fb] disabled:text-[#a5afbf]"
                      onClick={() => setPartyForm((current) => ({ ...current, whatsappNumber: current.contact.trim() }))}
                      disabled={!partyForm.contact.trim()}
                      title={partyForm.contact.trim() ? "Copy the mobile number into WhatsApp" : "Enter a mobile number first"}
                    >
                      Same
                    </button>
                  </div>
                </label>
              </div>

              <div className="mt-2 border-b border-[#d7e1ee]">
                <div className="flex flex-wrap items-center gap-8">
                  {[
                    { id: "address", label: "Address" },
                    { id: "credit", label: "Credit & Balance" },
                    { id: "additional", label: "Additional Fields" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={cn(
                        "flex items-center gap-2 border-b-[3px] px-1 pb-2.5 pt-1 text-[13px] font-semibold transition",
                        formTab === tab.id || (tab.id === "address" && formTab === "basic")
                          ? "border-[#2383f2] text-[#2383f2]"
                          : "border-transparent text-[#b0b7c4] hover:text-[#6b7a90]",
                      )}
                      onClick={() => setFormTab(tab.id as PartyFormTab)}
                    >
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-[220px] pt-5">
                {formTab === "address" || formTab === "basic" ? (
                  <div className="grid gap-6 xl:grid-cols-[230px_1px_minmax(0,1fr)_250px]">
                    <label className="grid gap-2">
                      <span className="text-[13px] font-medium text-[#4c5d78]">Email ID</span>
                      <Input
                        value={partyForm.email}
                        onChange={(event) => setPartyForm((current) => ({ ...current, email: event.target.value }))}
                        placeholder="Email ID"
                        className="h-9 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                      />
                    </label>

                    <div className="hidden w-px self-stretch bg-[#d7e1ee] xl:block" />

                    <div className="space-y-3">
                        <div className="grid gap-3">
                          <span className="text-[13px] font-semibold text-[#4c5d78]">Billing Address</span>
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="grid gap-1.5 md:col-span-2">
                              <span className="text-[12px] text-[#8d9cb3]">House / Road / Street</span>
                              <Input
                                value={partyForm.addressLine1}
                                onChange={(event) => setPartyForm((current) => ({ ...current, addressLine1: event.target.value }))}
                                placeholder="House 12, Road 5"
                                className="h-9 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                              />
                            </label>
                            <label className="grid gap-1.5 md:col-span-2">
                              <span className="text-[12px] text-[#8d9cb3]">Area / Landmark</span>
                              <Input
                                value={partyForm.addressLine2}
                                onChange={(event) => setPartyForm((current) => ({ ...current, addressLine2: event.target.value }))}
                                placeholder="Banani"
                                className="h-9 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                              />
                            </label>
                            <label className="grid gap-1.5">
                              <span className="text-[12px] text-[#8d9cb3]">City / Thana</span>
                              <Input
                                value={partyForm.city}
                                onChange={(event) => setPartyForm((current) => ({ ...current, city: event.target.value }))}
                                placeholder="Dhaka"
                                className="h-9 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                              />
                            </label>
                            <label className="grid gap-1.5">
                              <span className="text-[12px] text-[#8d9cb3]">District / State</span>
                              <Input
                                value={partyForm.district}
                                onChange={(event) => setPartyForm((current) => ({ ...current, district: event.target.value }))}
                                placeholder="Dhaka"
                                className="h-9 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                              />
                            </label>
                            <label className="grid gap-1.5">
                              <span className="text-[12px] text-[#8d9cb3]">Post Code</span>
                              <Input
                                value={partyForm.postalCode}
                                onChange={(event) => setPartyForm((current) => ({ ...current, postalCode: event.target.value }))}
                                placeholder="1213"
                                className="h-9 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                              />
                            </label>
                            <label className="grid gap-1.5">
                              <span className="text-[12px] text-[#8d9cb3]">Country</span>
                              <Input
                                value={partyForm.country}
                                onChange={(event) => setPartyForm((current) => ({ ...current, country: event.target.value }))}
                                placeholder="Bangladesh"
                                className="h-9 rounded-[4px] border-[#cfd9e8] bg-white px-3 text-[13px]"
                              />
                            </label>
                          </div>
                        </div>
                    </div>

                    {settingsState.shippingAddress ? (
                      <div className="space-y-3">
                        <label className="grid gap-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[13px] font-semibold text-[#4c5d78]">Shipping Address</span>
                            <button
                              type="button"
                              className="text-[12px] font-medium text-[#8d9cb3] transition hover:text-[#0f6cf6]"
                              onClick={() => onSettingsChange((current) => ({ ...current, shippingAddress: false }))}
                            >
                              Remove
                            </button>
                          </div>
                          <textarea
                            className="min-h-[86px] rounded-[4px] border border-[#cfd9e8] bg-white px-3 py-3 text-[13px] text-foreground"
                            value={partyForm.shippingAddress}
                            onChange={(event) => setPartyForm((current) => ({ ...current, shippingAddress: event.target.value }))}
                            placeholder="Shipping Address"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="flex items-start">
                        {/* Turning the field on is the whole intent of this click, so flip the
                          * setting inline — the settings drawer stays behind its own button. */}
                        <button
                          type="button"
                          className="text-left text-[13px] font-medium text-[#0f6cf6]"
                          onClick={() => onSettingsChange((current) => ({ ...current, shippingAddress: true }))}
                        >
                          + Enable shipping address
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}

                {formTab === "credit" ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[4px] border border-[#e3eaf4] bg-white p-4">
                      <div className="text-[15px] font-semibold text-[#314968]">
                        {partyForm.type === "supplier" ? "Balance Setup" : "Credit Setup"}
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {partyForm.type === "customer" ? (
                          <label className="grid gap-2">
                            <span className="text-sm font-medium text-[#334155]">Credit Limit</span>
                            <Input
                              money
                              value={partyForm.creditLimit}
                              onChange={(event) => setPartyForm((current) => ({ ...current, creditLimit: event.target.value }))}
                              placeholder="0.00"
                              className="h-10 rounded-[4px] border-[#d8e1ea] bg-white"
                            />
                          </label>
                        ) : null}
                        <label className="grid gap-2">
                          <span className="text-sm font-medium text-[#334155]">Opening Balance</span>
                          <Input
                            money
                            value={partyForm.openingBalance}
                            onChange={(event) => setPartyForm((current) => ({ ...current, openingBalance: event.target.value }))}
                            placeholder="0.00"
                            className="h-10 rounded-[4px] border-[#d8e1ea] bg-white"
                          />
                        </label>
                        <label className="grid gap-2 md:col-span-2">
                          <span className="text-sm font-medium text-[#334155]">Bill Maturity Days</span>
                          <Input
                            type="number"
                            min="0"
                            max="3650"
                            step="1"
                            value={partyForm.billMaturityDays}
                            onChange={(event) => setPartyForm((current) => ({ ...current, billMaturityDays: event.target.value }))}
                            placeholder="30"
                            className="h-10 rounded-[4px] border-[#d8e1ea] bg-white"
                          />
                          <span className="text-xs text-[#64748b]">If left blank, 30 days will be used.</span>
                        </label>
                        <label className="grid gap-2 md:col-span-2">
                          <span className="text-sm font-medium text-[#334155]">Tax ID / BIN / VAT</span>
                          <Input
                            value={partyForm.taxId}
                            onChange={(event) => setPartyForm((current) => ({ ...current, taxId: event.target.value }))}
                            className="h-10 rounded-[4px] border-[#d8e1ea] bg-white"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="rounded-[4px] border border-[#e3eaf4] bg-white p-4">
                      <div className="text-[15px] font-semibold text-[#314968]">Balance Snapshot</div>
                      <div className="mt-4 grid gap-3">
                        <div className="flex items-center justify-between rounded-[4px] border border-[#e8edf4] bg-white px-4 py-3">
                          <span className="text-sm text-[#64748b]">Outstanding</span>
                          <span className="font-semibold tabular-nums text-[#17263c]">
                            {formatCurrency(summary?.outstanding ?? Number(partyForm.openingBalance || 0))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-[4px] border border-[#e8edf4] bg-white px-4 py-3">
                          <span className="text-sm text-[#64748b]">Transactions</span>
                          <span className="font-semibold text-[#17263c]">{summary?.transactionCount ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-[4px] border border-[#e8edf4] bg-white px-4 py-3">
                          <span className="text-sm text-[#64748b]">Status</span>
                          <span className="font-semibold capitalize text-[#17263c]">{summary?.status ?? "active"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {formTab === "additional" ? (
                  <div className="grid gap-4 xl:grid-cols-[clamp(210px,16.3vw,280px)_minmax(0,1fr)]">
                    <div className="rounded-[4px] border border-[#e3eaf4] bg-white p-4">
                      <div className="text-[15px] font-semibold text-[#314968]">Tags</div>
                      <label className="mt-4 grid gap-2">
                        <span className="text-sm font-medium text-[#334155]">{partyTagsLabel}</span>
                        <div
                          className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[4px] border border-[#d8e1ea] bg-white px-2 py-1.5 focus-within:border-[#8ebcff] focus-within:ring-2 focus-within:ring-[#dbeafe]"
                        >
                          {getPartyTags().map((tag) => (
                            <span key={tag} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#eaf3ff] px-2.5 py-1 text-xs font-medium text-[#245b91]">
                              <span className="truncate">{tag}</span>
                              <button
                                type="button"
                                onClick={() => removePartyTag(tag)}
                                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#5f7fa3] hover:bg-[#cfe3fb] hover:text-[#173f68]"
                                aria-label={`Remove ${tag} tag`}
                              >
                                <X className="h-3 w-3" strokeWidth={2.5} />
                              </button>
                            </span>
                          ))}
                          <input
                            value={tagInput}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value.includes(",")) commitPartyTag(value);
                              else setTagInput(value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === ",") {
                                event.preventDefault();
                                commitPartyTag();
                              } else if (event.key === "Backspace" && !tagInput && getPartyTags().length) {
                                const tags = getPartyTags();
                                removePartyTag(tags[tags.length - 1]);
                              }
                            }}
                            onBlur={() => commitPartyTag()}
                            placeholder={getPartyTags().length ? "Add tag" : "Type a tag and press Enter"}
                            className="h-7 min-w-[120px] flex-1 border-0 bg-transparent px-1 text-sm text-[#334155] outline-none placeholder:text-[#94a3b8]"
                            aria-label={`${partyTagsLabel} input`}
                          />
                        </div>
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-[4px] border border-[#e3eaf4] bg-white p-4 md:col-span-2">
                        <div className="text-[15px] font-semibold text-[#314968]">
                          {partyForm.partyCategory === "business" ? "Primary Contact Person — Important Dates" : "Important Dates"}
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="grid gap-2">
                            <span className="text-sm font-medium text-[#334155]">Date of Birth</span>
                            <AppDateInput
                              value={partyForm.dateOfBirth}
                              onChange={(value) => setPartyForm((current) => ({ ...current, dateOfBirth: value }))}
                              className="h-10 rounded-[4px] border-[#d8e1ea] bg-white"
                            />
                          </label>
                          <label className="grid gap-2">
                            <span className="text-sm font-medium text-[#334155]">Wedding Anniversary</span>
                            <AppDateInput
                              value={partyForm.marriageDate}
                              onChange={(value) => setPartyForm((current) => ({ ...current, marriageDate: value }))}
                              className="h-10 rounded-[4px] border-[#d8e1ea] bg-white"
                            />
                          </label>
                        </div>
                      </div>

                      {settingsState.additionalFields.some((field) => field.enabled) ? (
                        settingsState.additionalFields.map((field, index) =>
                          !field.enabled ? null : (
                            <div key={`field-${index}`} className="rounded-[4px] border border-[#e3eaf4] bg-white p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold text-[#17263c]">{field.label.trim() || `${formEntityLabel} Field ${index + 1}`}</div>
                                <input
                                  type="checkbox"
                                  checked={field.enabled}
                                  onChange={(event) =>
                                    onSettingsChange((current) => ({
                                      ...current,
                                      additionalFields: current.additionalFields.map((entry, entryIndex) =>
                                        entryIndex === index ? { ...entry, enabled: event.target.checked } : entry,
                                      ),
                                    }))
                                  }
                                />
                              </div>
                              <Input
                                className="mt-3 h-10 rounded-[4px] border-[#d8e1ea] bg-white"
                                placeholder={field.label.trim() || "Field label"}
                                value={field.label}
                                onChange={(event) =>
                                  onSettingsChange((current) => ({
                                    ...current,
                                    additionalFields: current.additionalFields.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, label: event.target.value } : entry,
                                    ),
                                  }))
                                }
                              />
                            </div>
                          ),
                        )
                      ) : (
                        <div className="rounded-[4px] border border-dashed border-[#d8e1ea] bg-[#fbfdff] p-5 text-sm text-[#64748b] md:col-span-2">
                          No additional {formEntityLabel.toLowerCase()} fields enabled yet. Open settings to turn them on.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t border-[#d9e1ec] bg-white px-7 py-5">
            <div className="flex items-center justify-end gap-4">
              {showSaveAndNew ? (
                <Button
                  variant="outline"
                  className="h-10 rounded-[10px] border-[#8ebcff] px-7 text-[#0f6cf6] hover:bg-[#f4f9ff]"
                  onClick={handleSaveAndNewParty}
                  disabled={!canSaveParty || saving}
                  title={canSaveParty ? "Save this one and keep the form open for the next entry" : `${partyNameLabel} is required`}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {editingPartyId ? "Update & New" : "Save & New"}
                </Button>
              ) : null}
              <Button
                className="h-10 rounded-[10px] px-10"
                onClick={handleSaveParty}
                disabled={!canSaveParty || saving}
                title={canSaveParty ? "Save and close" : `${partyNameLabel} is required`}
              >
                <CheckCircle2 className="h-5 w-5" />
                {editingPartyId ? "Update" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
