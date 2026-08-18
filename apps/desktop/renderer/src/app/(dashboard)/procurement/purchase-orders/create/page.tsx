"use client";

import { useSearchParams } from "next/navigation";
import { PurchaseOrderForm } from "@/components/procurement/PurchaseOrderForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function CreatePurchaseOrderPage() {
  const searchParams = useSearchParams();
  const comparativeStatementId = searchParams.get("comparativeStatementId") ?? undefined;
  useSetBreadcrumb([{ label: "Procurement" }, { label: "Purchase Orders", href: "/procurement/purchase-orders" }, { label: "New" }]);

  if (!comparativeStatementId) {
    return <div className="p-12 text-center text-biz-muted">A Purchase Order must be raised from an Approved Comparative Statement.</div>;
  }
  return <PurchaseOrderForm mode="create" comparativeStatementId={comparativeStatementId} />;
}
