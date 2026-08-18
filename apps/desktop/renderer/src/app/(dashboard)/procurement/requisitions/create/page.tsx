"use client";

import { PurchaseRequisitionForm } from "@/components/procurement/PurchaseRequisitionForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function CreatePurchaseRequisitionPage() {
  useSetBreadcrumb([{ label: "Procurement" }, { label: "Purchase Requisitions", href: "/procurement/requisitions" }, { label: "New" }]);
  return <PurchaseRequisitionForm mode="create" />;
}
