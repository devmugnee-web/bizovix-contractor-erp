"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VariationForm } from "@/components/variations/VariationForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function CreateVariationPageInner() {
  useSetBreadcrumb([{ label: "CMS" }, { label: "Variations" }, { label: "Add Variation Order" }]);
  const searchParams = useSearchParams();
  const cmsWorkId = searchParams.get("cmsWorkId");

  if (!cmsWorkId) {
    return <div className="p-12 text-center text-biz-muted">No project selected. Open a project&apos;s Variations tab to add a variation order.</div>;
  }

  return <VariationForm cmsWorkId={cmsWorkId} />;
}

export default function CreateVariationPage() {
  return (
    <Suspense fallback={null}>
      <CreateVariationPageInner />
    </Suspense>
  );
}
