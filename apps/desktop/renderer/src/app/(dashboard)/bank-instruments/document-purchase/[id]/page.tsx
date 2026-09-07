"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, FileText, Pencil, Save, Trash2 } from "lucide-react";
import { useDeleteDocumentPurchase, useDocumentPurchase, useMasterCategories, useUpdateDocumentPurchase } from "@bizovix/api-client";
import { MasterCategoryType } from "@bizovix/types";
import { FormField, PageHeader, PrimaryButton, SecondaryButton, SelectInput, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-[50px] flex-col justify-center gap-0.5 rounded-lg border border-[#e4ebf5] bg-[#fbfdff] px-3 py-2 transition-colors hover:border-biz-blue/25 hover:bg-white sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[11px] font-medium uppercase tracking-wide text-biz-muted">{label}</span>
      <span className="text-[13px] font-semibold text-biz-navy sm:max-w-[65%] sm:text-right">{value}</span>
    </div>
  );
}

export default function DocumentPurchaseViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const documentPurchase = useDocumentPurchase(params.id);
  const deleteMutation = useDeleteDocumentPurchase();
  const updateMutation = useUpdateDocumentPurchase();
  const categories = useMasterCategories(MasterCategoryType.DOCUMENT_PURCHASE);
  const [category, setCategory] = React.useState("");
  const [categoryError, setCategoryError] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState(false);

  React.useEffect(() => {
    if (!documentPurchase.data) return;
    const record = documentPurchase.data;
    const timer = window.setTimeout(() => {
      setCategory(record.category ?? "");
      setEditingCategory(!record.category);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [documentPurchase.data]);

  useSetBreadcrumb([
    { label: "Bank Instruments" },
    { label: "Document Purchase", href: "/bank-instruments/document-purchase" },
    { label: "View" },
  ]);

  function handleDelete() {
    if (!documentPurchase.data) return;
    if (!window.confirm("Delete this document purchase? This cannot be undone.")) return;
    deleteMutation.mutate(documentPurchase.data.id, {
      onSuccess: () => router.push("/bank-instruments/document-purchase"),
    });
  }

  function saveCategory() {
    const value = category.trim();
    if (!value) {
      setCategoryError("Work category is required before continuing to PG/BG.");
      return;
    }
    setCategoryError("");
    setSaved(false);
    updateMutation.mutate(
      { id: params.id, payload: { category: value } },
      {
        onSuccess: () => {
          const returnTo = new URLSearchParams(window.location.search).get("returnTo");
          if (returnTo?.startsWith("/")) {
            router.push(returnTo);
            return;
          }
          setSaved(true);
          setEditingCategory(false);
        },
      },
    );
  }

  if (documentPurchase.isLoading) {
    return <p className="text-[13px] text-biz-muted">Loading...</p>;
  }

  if (documentPurchase.isError || !documentPurchase.data) {
    return <p className="text-[13px] text-biz-danger">Document purchase not found.</p>;
  }

  const record = documentPurchase.data;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl border border-biz-blue/15 bg-gradient-to-r from-[#eef5ff] via-white to-[#f2fbf6] px-4 py-2.5 shadow-sm">
        <div className="absolute inset-y-0 left-0 w-1 bg-biz-blue" />
        <PageHeader
          title="Document Purchase Details"
          subtitle={record.tenderWorkName}
          actions={
            <>
              <SecondaryButton onClick={() => router.push("/bank-instruments/document-purchase")}>
                Back to List
              </SecondaryButton>
              <SecondaryButton onClick={handleDelete} disabled={deleteMutation.isPending}>
                <Trash2 className="h-4 w-4 text-biz-danger" />
                Delete
              </SecondaryButton>
            </>
          }
        />
      </div>

      <div className="grid w-full grid-cols-1 gap-2 rounded-xl border border-biz-border bg-white p-4 shadow-card lg:grid-cols-2">
        <div className="col-span-full flex items-center justify-between border-b border-biz-border pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue"><FileText className="h-4 w-4" /></span>
            <div>
              <h2 className="text-[14px] font-bold text-biz-navy">Purchase Information</h2>
              <p className="text-[10px] text-biz-muted">Tender document purchase and payment details</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Purchased</span>
        </div>
        <DetailRow
          label="Purchase Type"
          value={
            <StatusBadge
              label={record.purchaseType === "EGP" ? "e-GP" : "Manual"}
              tone={record.purchaseType === "EGP" ? "success" : "warning"}
            />
          }
        />
        <DetailRow label="Tender ID (e-GP)" value={record.tenderId ?? "N/A"} />
        <DetailRow label="Organization" value={`${record.organizationMaster.shortName} — ${record.organizationMaster.fullName}`} />
        <DetailRow label="Purchase Date" value={formatDate(record.purchaseDate)} />
        <DetailRow label="Document Price" value={formatBDT(record.documentPrice)} />
        <DetailRow label="Payment From" value={record.paymentFromAccount.accountName} />
        <div className="min-h-[50px] rounded-lg border border-[#e4ebf5] bg-[#fbfdff] px-3 py-2">
          {editingCategory ? (
            <FormField label="Work Category" required error={categoryError || undefined} helper="Required for the PG/BG and Ongoing Work workflow.">
              <div className="flex flex-col gap-2 sm:flex-row">
                <SelectInput
                  className="flex-1"
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setCategoryError("");
                    setSaved(false);
                  }}
                  placeholder="Select work category"
                  options={(categories.data ?? []).filter((item) => item.isActive).map((item) => ({ label: item.name, value: item.name }))}
                />
                <PrimaryButton type="button" onClick={saveCategory} disabled={updateMutation.isPending}>
                  <Save className="h-4 w-4" />
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </PrimaryButton>
              </div>
            </FormField>
          ) : (
            <div className="flex h-full items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-biz-muted">Work Category</p>
                <span className="mt-1 inline-flex rounded-full bg-biz-blue-soft px-3 py-1 text-[12px] font-bold text-biz-blue">{category}</span>
              </div>
              <button type="button" onClick={() => setEditingCategory(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-biz-border bg-white px-3 text-[11px] font-semibold text-biz-navy hover:border-biz-blue hover:text-biz-blue">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            </div>
          )}
          {saved && <p className="mt-2 text-[11px] font-medium text-emerald-700">Work category updated successfully.</p>}
          {updateMutation.isError && <p className="mt-2 text-[11px] font-medium text-biz-danger">Could not save work category. Please try again.</p>}
        </div>
        <DetailRow label="Created At" value={formatDate(record.createdAt)} />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-[#d9e7f8] bg-gradient-to-r from-[#f5f9ff] to-white px-4 py-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-biz-blue text-white"><ArrowRight className="h-4 w-4" /></span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-biz-blue">Workflow ready</p>
            <h3 className="text-[13px] font-bold text-biz-navy">Document purchase information is complete</h3>
            <p className="mt-0.5 text-[10px] text-biz-muted">This tender can continue through Tender Security, Credit Commitment and PG/BG.</p>
          </div>
        </div>
        <PrimaryButton onClick={() => router.push("/bank-instruments/document-purchase/create")}>
          Add Another Purchase
        </PrimaryButton>
      </div>
    </div>
  );
}
