"use client";

import { useParams } from "next/navigation";
import { usePurchaseOrder } from "@bizovix/api-client";
import { PurchaseOrderForm } from "@/components/procurement/PurchaseOrderForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function EditPurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading } = usePurchaseOrder(id);
  useSetBreadcrumb([
    { label: "Procurement" },
    { label: "Purchase Orders", href: "/procurement/purchase-orders" },
    { label: order?.poNo ?? "Purchase Order", href: order ? "/procurement/purchase-orders/" + order.id : undefined },
    { label: "Edit" },
  ]);

  if (isLoading || !order) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;
  if (order.status !== "DRAFT") return <div className="p-12 text-center text-biz-muted">Only a Draft purchase order can be edited.</div>;
  return <PurchaseOrderForm mode="edit" order={order} />;
}
