"use client";

import { useParams } from "next/navigation";
import { usePurchaseRequisition } from "@bizovix/api-client";
import { PurchaseRequisitionForm } from "@/components/procurement/PurchaseRequisitionForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function EditPurchaseRequisitionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: requisition, isLoading } = usePurchaseRequisition(id);
  useSetBreadcrumb([
    { label: "Procurement" },
    { label: "Purchase Requisitions", href: "/procurement/requisitions" },
    { label: requisition?.prNo ?? "Requisition", href: requisition ? "/procurement/requisitions/" + requisition.id : undefined },
    { label: "Edit" },
  ]);

  if (isLoading || !requisition) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;
  if (requisition.status !== "DRAFT") return <div className="p-12 text-center text-biz-muted">Only a Draft requisition can be edited.</div>;
  return <PurchaseRequisitionForm mode="edit" requisition={requisition} />;
}
