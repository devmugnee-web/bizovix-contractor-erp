"use client";

import { useParams } from "next/navigation";
import { useSupplierBill } from "@bizovix/api-client";
import { SupplierBillForm } from "@/components/procurement/SupplierBillForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function EditSupplierBillPage() {
  const params = useParams<{ id: string }>();
  const bill = useSupplierBill(params.id);
  useSetBreadcrumb([
    { label: "Procurement" },
    { label: "Supplier Bills", href: "/procurement/supplier-bills" },
    { label: bill.data?.billNo ?? "Bill", href: bill.data ? `/procurement/supplier-bills/${bill.data.id}` : undefined },
    { label: "Edit" },
  ]);

  if (bill.isLoading) return <div className="p-12 text-center text-biz-muted">Loading supplier bill...</div>;
  if (!bill.data) return <div className="p-12 text-center text-biz-muted">Supplier Bill not found.</div>;
  if (bill.data.status !== "DRAFT") {
    return <div className="p-12 text-center text-biz-muted">Only a draft supplier bill can be edited.</div>;
  }
  return <SupplierBillForm mode="edit" bill={bill.data} />;
}
