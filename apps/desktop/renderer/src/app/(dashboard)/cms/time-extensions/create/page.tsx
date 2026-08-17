"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TimeExtensionForm } from "@/components/time-extensions/TimeExtensionForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function CreateTimeExtensionPageInner() {
  useSetBreadcrumb([{ label: "CMS" }, { label: "Time Extensions" }, { label: "Add Time Extension" }]);
  const searchParams = useSearchParams();
  const cmsWorkId = searchParams.get("cmsWorkId");

  if (!cmsWorkId) {
    return <div className="p-12 text-center text-biz-muted">No project selected. Open a project&apos;s Time Extensions tab to add a request.</div>;
  }

  return <TimeExtensionForm cmsWorkId={cmsWorkId} />;
}

export default function CreateTimeExtensionPage() {
  return (
    <Suspense fallback={null}>
      <CreateTimeExtensionPageInner />
    </Suspense>
  );
}
