"use client";

import { useSearchParams } from "next/navigation";
import { GrnForm } from "@/components/procurement/GrnForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function CreateGrnPage() {
  const searchParams = useSearchParams();
  const purchaseOrderId = searchParams.get("purchaseOrderId") ?? undefined;
  useSetBreadcrumb([{ label: "Procurement" }, { label: "Goods Receipts", href: "/procurement/grns" }, { label: "New" }]);
  return <GrnForm purchaseOrderId={purchaseOrderId} />;
}
