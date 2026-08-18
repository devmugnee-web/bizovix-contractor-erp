"use client";

import { useParams } from "next/navigation";
import { useParty } from "@bizovix/api-client";
import { PartyForm } from "@/components/parties/PartyForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function EditSubcontractorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: party, isLoading } = useParty(id);
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Subcontractors", href: "/masters/subcontractors" }, { label: "Edit Subcontractor" }]);

  if (isLoading || !party) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;
  return <PartyForm mode="edit" variant="subcontractor" party={party} />;
}
