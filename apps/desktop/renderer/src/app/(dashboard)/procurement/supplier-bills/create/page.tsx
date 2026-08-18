"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SupplierBillForm } from "@/components/procurement/SupplierBillForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function CreateSupplierBillPageInner() {
  useSetBreadcrumb([{ label: "Procurement" }, { label: "Supplier Bills", href: "/procurement/supplier-bills" }, { label: "New" }]);
  const searchParams = useSearchParams();
  return <SupplierBillForm mode="create" initialPurchaseOrderId={searchParams.get("purchaseOrderId") ?? undefined} />;
}

export default function CreateSupplierBillPage() {
  return (
    <Suspense fallback={null}>
      <CreateSupplierBillPageInner />
    </Suspense>
  );
}
