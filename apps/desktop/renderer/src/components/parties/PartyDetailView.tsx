"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileEdit, Plus, Trash2 } from "lucide-react";
import { useAddPartyContact, useChangePartyStatus, useParty, useRemovePartyContact } from "@bizovix/api-client";
import { IconButton, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import type { PartyStatus } from "@bizovix/types";
import { CONTACT_ROLE_OPTIONS, PARTY_STATUS_META, PARTY_STATUS_OPTIONS, partyRolesLabel } from "@/lib/parties";

const TABS = ["Overview", "Contacts", "Bank Details", "Documents", "Payables", "Projects"] as const;

interface PartyDetailViewProps {
  variant: "vendor" | "subcontractor";
  id: string;
  listPath: string;
}

export function PartyDetailView({ variant, id, listPath }: PartyDetailViewProps) {
  const router = useRouter();
  const { data: party, isLoading } = useParty(id);
  const changeStatus = useChangePartyStatus();
  const addContact = useAddPartyContact();
  const removeContact = useRemovePartyContact();
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("Overview");
  const [contactForm, setContactForm] = React.useState({ contactRole: "Primary", name: "", designation: "", mobile: "", email: "", address: "" });

  if (isLoading || !party) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;

  const heading = variant === "vendor" ? "Vendor / Supplier" : "Subcontractor";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button onClick={() => router.push(listPath)} className="mb-2 text-[13px] text-biz-blue hover:underline">
            ← Back to List
          </button>
          <h1 className="text-page-title text-biz-text">{party.displayName || party.name}</h1>
          <p className="mt-1 text-[13px] text-biz-muted">
            {party.code} · {partyRolesLabel(party.roles)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge label={PARTY_STATUS_META[party.status].label} tone={PARTY_STATUS_META[party.status].tone} />
          <SelectInput
            className="w-[160px]"
            options={PARTY_STATUS_OPTIONS}
            value={party.status}
            onChange={(e) => changeStatus.mutate({ id, status: e.target.value as PartyStatus })}
          />
          <Link href={`${listPath}/${id}/edit`}>
            <PrimaryButton>
              <FileEdit className="h-4 w-4" />
              Edit
            </PrimaryButton>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-biz-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-md px-4 py-2 text-[13px] font-medium ${tab === t ? "border-b-2 border-biz-blue text-biz-blue" : "text-biz-muted hover:text-biz-text"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
            <h3 className="mb-4 text-[15px] font-semibold text-biz-text">Basic Information</h3>
            <dl className="grid grid-cols-2 gap-4 text-[13px]">
              <Field label="Name" value={party.name} />
              <Field label="Display Name" value={party.displayName ?? "—"} />
              <Field label="Category" value={party.category?.name ?? "—"} />
              <Field label="Contact Person" value={party.contactPerson ?? "—"} />
              <Field label="Phone" value={party.phone ?? "—"} />
              <Field label="Email" value={party.email ?? "—"} />
              <Field label="Website" value={party.website ?? "—"} />
              <Field label="Address" value={party.address ?? "—"} />
              <Field label="District" value={party.district ?? "—"} />
              <Field label="Country" value={party.country ?? "—"} />
            </dl>
          </div>
          <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
            <h3 className="mb-4 text-[15px] font-semibold text-biz-text">Tax, Registration & Commercial</h3>
            <dl className="grid grid-cols-2 gap-4 text-[13px]">
              <Field label="BIN / VAT" value={party.binVat ?? "—"} />
              <Field label="TIN" value={party.tinNo ?? "—"} />
              <Field label="Trade License No." value={party.tradeLicenseNo ?? "—"} />
              <Field label="Registration No." value={party.registrationNo ?? "—"} />
              <Field label="Payment Terms" value={party.paymentTerm ? `${party.paymentTerm.name} (${party.paymentTerm.days} days)` : "—"} />
              <Field label="Default Currency" value={party.defaultCurrency ?? "—"} />
              <Field label="Credit Limit" value={party.creditLimit ? formatBDT(party.creditLimit) : "—"} />
            </dl>
            {party.subcontractorProfile && (
              <>
                <h3 className="mb-4 mt-6 text-[15px] font-semibold text-biz-text">Subcontractor Details</h3>
                <dl className="grid grid-cols-2 gap-4 text-[13px]">
                  <Field label="Trade Category" value={party.subcontractorProfile.tradeCategory?.name ?? "—"} />
                  <Field label="Specialization" value={party.subcontractorProfile.specialization ?? "—"} />
                  <Field label="Default Retention %" value={party.subcontractorProfile.defaultRetentionPct ? `${party.subcontractorProfile.defaultRetentionPct}%` : "—"} />
                  <Field label="Performance Rating" value={party.subcontractorProfile.performanceRating ?? "—"} />
                </dl>
              </>
            )}
            {party.notes && (
              <>
                <h3 className="mb-2 mt-6 text-[15px] font-semibold text-biz-text">Notes</h3>
                <p className="text-[13px] text-biz-muted">{party.notes}</p>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "Contacts" && (
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <h3 className="mb-4 text-[15px] font-semibold text-biz-text">Add Contact</h3>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SelectInput options={CONTACT_ROLE_OPTIONS.map((r) => ({ label: r, value: r }))} value={contactForm.contactRole} onChange={(e) => setContactForm((f) => ({ ...f, contactRole: e.target.value }))} />
            <TextInput placeholder="Name" value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} />
            <TextInput placeholder="Designation" value={contactForm.designation} onChange={(e) => setContactForm((f) => ({ ...f, designation: e.target.value }))} />
            <TextInput placeholder="Mobile" value={contactForm.mobile} onChange={(e) => setContactForm((f) => ({ ...f, mobile: e.target.value }))} />
            <TextInput placeholder="Email (optional)" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} />
            <TextInput placeholder="Address" value={contactForm.address} onChange={(e) => setContactForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <PrimaryButton
            disabled={!contactForm.name || !contactForm.designation || !contactForm.mobile || !contactForm.address || addContact.isPending}
            onClick={async () => {
              await addContact.mutateAsync({ id, payload: contactForm });
              setContactForm({ contactRole: "Primary", name: "", designation: "", mobile: "", email: "", address: "" });
            }}
          >
            <Plus className="h-4 w-4" />
            Add Contact
          </PrimaryButton>

          <table className="mt-6 w-full text-left text-[13px]">
            <thead className="bg-[#f4f7fb] text-[11px] text-biz-muted">
              <tr>
                {["Role", "Name", "Designation", "Mobile", "Email", "Address", "Action"].map((h) => (
                  <th key={h} className="px-3 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {party.contacts.map((contact) => (
                <tr key={contact.id} className="border-t border-biz-border">
                  <td className="px-3 py-2.5">{contact.contactRole ?? "—"}</td>
                  <td className="px-3 py-2.5 font-medium">{contact.name}</td>
                  <td className="px-3 py-2.5">{contact.designation}</td>
                  <td className="px-3 py-2.5">{contact.mobile}</td>
                  <td className="px-3 py-2.5">{contact.email ?? "—"}</td>
                  <td className="px-3 py-2.5">{contact.address}</td>
                  <td className="px-3 py-2.5">
                    <IconButton aria-label="Remove" onClick={() => removeContact.mutate({ id, contactId: contact.id })}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </td>
                </tr>
              ))}
              {!party.contacts.length && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-biz-muted">
                    No contacts added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Bank Details" && (
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <dl className="grid grid-cols-2 gap-4 text-[13px] lg:grid-cols-3">
            <Field label="Bank Name" value={party.bankName ?? "—"} />
            <Field label="Account Name" value={party.bankAccountName ?? "—"} />
            <Field label="Account No." value={party.bankAccountNo ?? "—"} />
            <Field label="Branch" value={party.bankBranch ?? "—"} />
            <Field label="Routing / SWIFT" value={party.bankRoutingSwift ?? "—"} />
          </dl>
        </div>
      )}

      {tab === "Documents" && (
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-biz-text">Linked Documents</h3>
            <Link href="/documents">
              <SecondaryButton>Open Document Center</SecondaryButton>
            </Link>
          </div>
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#f4f7fb] text-[11px] text-biz-muted">
              <tr>
                {["Name", "Category", "Expiry", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {party.linked.documents.map((doc) => (
                <tr key={doc.id} className="border-t border-biz-border">
                  <td className="px-3 py-2.5 font-medium">{doc.name}</td>
                  <td className="px-3 py-2.5">{doc.category ?? "—"}</td>
                  <td className="px-3 py-2.5">{doc.expiryDate ? formatDate(doc.expiryDate) : "—"}</td>
                  <td className="px-3 py-2.5">{doc.status}</td>
                </tr>
              ))}
              {!party.linked.documents.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-biz-muted">
                    No documents linked yet. Trade License, TIN, BIN, Bank Certificate and Agreement documents can be uploaded from the Document Center and linked to this {variant}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Payables" && (
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#f4f7fb] text-[11px] text-biz-muted">
              <tr>
                {["Bill No.", "Bill Date", "Amount", "Paid", "Outstanding", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {party.linked.payables.map((payable) => (
                <tr key={payable.id} className="border-t border-biz-border">
                  <td className="px-3 py-2.5 font-medium">{payable.billNo}</td>
                  <td className="px-3 py-2.5">{formatDate(payable.billDate)}</td>
                  <td className="px-3 py-2.5">{formatBDT(payable.amount)}</td>
                  <td className="px-3 py-2.5">{formatBDT(payable.paidAmount)}</td>
                  <td className="px-3 py-2.5">{formatBDT(String(Number(payable.amount) - Number(payable.paidAmount)))}</td>
                  <td className="px-3 py-2.5">{payable.status}</td>
                </tr>
              ))}
              {!party.linked.payables.length && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-biz-muted">
                    No payables recorded for this {variant} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Projects" && (
        <div className="rounded-lg border border-biz-border bg-biz-surface p-6 text-center text-biz-muted">
          No project assignment model exists yet — this is foundation-phase master data only. Procurement/subcontractor billing phases will populate real project associations here.
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-biz-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-biz-text">{value}</dd>
    </div>
  );
}
