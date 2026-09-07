"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { useDeleteDocumentPurchase, useDocumentPurchase, useMasterCategories, useUpdateDocumentPurchase } from "@bizovix/api-client";
import { MasterCategoryType } from "@bizovix/types";
import { FormField, PageHeader, PrimaryButton, SecondaryButton, SelectInput, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-biz-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[13px] text-biz-muted">{label}</span>
      <span className="text-[13px] font-medium text-biz-text">{value}</span>
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

  React.useEffect(() => {
    if (documentPurchase.data) setCategory(documentPurchase.data.category ?? "");
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
          router.push("/bank-instruments/pg-bg");
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
    <div className="flex flex-col gap-6">
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

      <div className="max-w-2xl rounded-lg border border-biz-border bg-biz-surface p-6">
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
        <DetailRow label="Tender / Work Name" value={record.tenderWorkName} />
        <DetailRow label="Purchase Date" value={formatDate(record.purchaseDate)} />
        <DetailRow label="Document Price" value={formatBDT(record.documentPrice)} />
        <DetailRow label="Payment From" value={record.paymentFromAccount.accountName} />
        <div className="border-b border-biz-border py-4">
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
                {updateMutation.isPending ? "Saving..." : "Save Category"}
              </PrimaryButton>
            </div>
          </FormField>
          {saved && <p className="mt-2 text-[12px] font-medium text-emerald-700">Work category saved. This purchase can now continue to PG/BG.</p>}
          {updateMutation.isError && <p className="mt-2 text-[12px] font-medium text-biz-danger">Could not save work category. Please try again.</p>}
        </div>
        <DetailRow label="Created At" value={formatDate(record.createdAt)} />
      </div>

      <div>
        <PrimaryButton onClick={() => router.push("/bank-instruments/document-purchase/create")}>
          Add Another Document Purchase
        </PrimaryButton>
      </div>
    </div>
  );
}
