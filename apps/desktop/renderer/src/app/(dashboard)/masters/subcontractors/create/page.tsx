"use client";

import { PartyForm } from "@/components/parties/PartyForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function CreateSubcontractorPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Subcontractors", href: "/masters/subcontractors" }, { label: "Add Subcontractor" }]);
  return <PartyForm mode="create" variant="subcontractor" />;
}
