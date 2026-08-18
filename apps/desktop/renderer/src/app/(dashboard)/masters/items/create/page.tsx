"use client";

import { ItemForm } from "@/components/items/ItemForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function CreateItemPage() {
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Materials & Items", href: "/masters/items" }, { label: "Add Item" }]);
  return <ItemForm mode="create" />;
}
