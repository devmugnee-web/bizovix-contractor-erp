"use client";

import { PartyForm } from "@/components/parties/PartyForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function CreateVendorPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Vendors & Suppliers", href: "/masters/vendors" }, { label: "Add Vendor" }]);
  return <PartyForm mode="create" variant="vendor" />;
}
