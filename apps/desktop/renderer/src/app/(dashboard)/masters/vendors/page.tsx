"use client";

import { PartyListPage } from "@/components/parties/PartyListPage";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function VendorsPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Vendors & Suppliers" }]);
  return (
    <PartyListPage
      variant="vendor"
      roles="VENDOR,SUPPLIER,SERVICE_PROVIDER,OTHER"
      title="Vendors & Suppliers"
      subtitle="Manage approved suppliers, vendors and service providers."
      createHref="/masters/vendors/create"
      detailBasePath="/masters/vendors"
    />
  );
}
