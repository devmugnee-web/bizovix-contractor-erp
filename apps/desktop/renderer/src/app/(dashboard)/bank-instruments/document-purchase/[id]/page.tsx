"use client";

import { useParams, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useDeleteDocumentPurchase, useDocumentPurchase } from "@bizovix/api-client";
import { PageHeader, PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
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
