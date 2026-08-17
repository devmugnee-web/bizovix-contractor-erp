"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useCmsWork } from "@bizovix/api-client";
import { ContractForm } from "@/components/contracts/ContractForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function CreateContractPageInner() {
  useSetBreadcrumb([{ label: "CMS" }, { label: "Contracts / Work Orders", href: "/cms/contracts" }, { label: "Add Contract" }]);
  const searchParams = useSearchParams();
  const cmsWorkId = searchParams.get("cmsWorkId") ?? undefined;
  const work = useCmsWork(cmsWorkId);

  if (cmsWorkId && work.isLoading) {
    return <p className="text-[13px] text-biz-muted">Loading...</p>;
  }

  return (
    <ContractForm
      mode="create"
      initialWork={work.data ? { id: cmsWorkId!, workName: work.data.workName } : undefined}
    />
  );
}

export default function CreateContractPage() {
  return (
    <Suspense fallback={null}>
      <CreateContractPageInner />
    </Suspense>
  );
}
