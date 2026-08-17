"use client";

import { useParams } from "next/navigation";
import { useProjectBill } from "@bizovix/api-client";
import { BillForm } from "@/components/bills/BillForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function EditBillPage() {
  const params = useParams<{ id: string }>();
  const bill = useProjectBill(params.id);
  useSetBreadcrumb([{ label: "CMS" }, { label: "Running Bills" }, { label: bill.data?.billNo ?? "Edit Bill" }]);

  if (bill.isLoading) return <p className="text-[13px] text-biz-muted">Loading bill...</p>;
  if (!bill.data) return <div className="p-12 text-center text-biz-muted">Running Bill not found.</div>;

  return <BillForm mode="edit" cmsWorkId={bill.data.cmsWorkId} bill={bill.data} />;
}
