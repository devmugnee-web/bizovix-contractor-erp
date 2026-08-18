"use client";

import { PartyListPage } from "@/components/parties/PartyListPage";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function SubcontractorsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Subcontractors" }]);
  return (
    <PartyListPage
      variant="subcontractor"
      roles="SUBCONTRACTOR"
      title="Subcontractors"
      subtitle="Manage subcontractors engaged for project execution."
      createHref="/masters/subcontractors/create"
      detailBasePath="/masters/subcontractors"
    />
  );
}
