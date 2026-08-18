"use client";

import { useParams } from "next/navigation";
import { useItem } from "@bizovix/api-client";
import { ItemForm } from "@/components/items/ItemForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const { data: item, isLoading } = useItem(id);
  useSetBreadcrumb([{ label: "Masters", href: "/masters" }, { label: "Materials & Items", href: "/masters/items" }, { label: "Edit Item" }]);

  if (isLoading || !item) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;
  return <ItemForm mode="edit" item={item} />;
}
