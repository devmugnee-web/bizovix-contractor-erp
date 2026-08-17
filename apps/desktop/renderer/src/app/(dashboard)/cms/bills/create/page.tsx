"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BillForm } from "@/components/bills/BillForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function CreateBillPageInner() {
  useSetBreadcrumb([{ label: "CMS" }, { label: "Running Bills" }, { label: "Add Bill" }]);
  const searchParams = useSearchParams();
  const cmsWorkId = searchParams.get("cmsWorkId");

  if (!cmsWorkId) {
    return <div className="p-12 text-center text-biz-muted">No project selected. Open a project&apos;s Running Bills tab to add a bill.</div>;
  }

  return <BillForm mode="create" cmsWorkId={cmsWorkId} />;
}

export default function CreateBillPage() {
  return (
    <Suspense fallback={null}>
      <CreateBillPageInner />
    </Suspense>
  );
}
