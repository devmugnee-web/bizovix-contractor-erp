"use client";

import { useSearchParams } from "next/navigation";
import { RfqForm } from "@/components/procurement/RfqForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function CreateRfqPage() {
  const searchParams = useSearchParams();
  const purchaseRequisitionId = searchParams.get("purchaseRequisitionId") ?? undefined;
  useSetBreadcrumb([{ label: "Procurement" }, { label: "RFQs", href: "/procurement/rfqs" }, { label: "New" }]);
  return <RfqForm mode="create" purchaseRequisitionId={purchaseRequisitionId} />;
}
