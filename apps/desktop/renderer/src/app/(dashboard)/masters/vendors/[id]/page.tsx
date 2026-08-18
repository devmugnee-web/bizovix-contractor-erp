"use client";

import { useParams } from "next/navigation";
import { PartyDetailView } from "@/components/parties/PartyDetailView";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Vendors & Suppliers", href: "/masters/vendors" }, { label: "Vendor Details" }]);
  return <PartyDetailView variant="vendor" id={id} listPath="/masters/vendors" />;
}
