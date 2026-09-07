"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useCmsWork, useCmsWorkOverview, useTender } from "@bizovix/api-client";
import { ContractForm } from "@/components/contracts/ContractForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function CreateContractPageInner() {
  useSetBreadcrumb([{ label: "CMS" }, { label: "Contracts / Work Orders", href: "/cms/contracts" }, { label: "Add Contract" }]);
  const searchParams = useSearchParams();
  const cmsWorkId = searchParams.get("cmsWorkId") ?? undefined;
  const work = useCmsWork(cmsWorkId);
  const overview = useCmsWorkOverview(cmsWorkId);
  const tender = useTender(work.data?.tenderId ?? undefined);

  if (
    cmsWorkId &&
    (work.isLoading || overview.isLoading || (Boolean(work.data?.tenderId) && tender.isLoading))
  ) {
    return <p className="text-[13px] text-biz-muted">Loading...</p>;
  }

  return (
    <ContractForm
      mode="create"
      initialWork={
        work.data
          ? {
              id: cmsWorkId!,
              workName: work.data.workName,
              tender: tender.data
                ? { id: tender.data.id, workName: tender.data.workName }
                : undefined,
              contractValue: work.data.contractValue,
              startDate: work.data.startDate,
              expectedCompletionDate: work.data.expectedCompletionDate,
              clientContactName: overview.data?.primaryContact?.name ?? undefined,
            }
          : undefined
      }
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
