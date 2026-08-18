"use client";

import { useParams } from "next/navigation";
import { PartyDetailView } from "@/components/parties/PartyDetailView";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function SubcontractorDetailPage() {
  const { id } = useParams<{ id: string }>();
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Subcontractors", href: "/masters/subcontractors" }, { label: "Subcontractor Details" }]);
  return <PartyDetailView variant="subcontractor" id={id} listPath="/masters/subcontractors" />;
}
