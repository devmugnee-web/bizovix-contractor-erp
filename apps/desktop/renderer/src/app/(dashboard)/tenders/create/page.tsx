"use client";

import { TenderForm } from "@/components/tenders/TenderForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function CreateTenderPage() {
  useSetBreadcrumb([{ label: "Tenders", href: "/tenders" }, { label: "Add Tender" }]);
  return <TenderForm mode="create" />;
}
