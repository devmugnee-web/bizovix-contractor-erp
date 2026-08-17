"use client";

import { useParams } from "next/navigation";
import { useContract } from "@bizovix/api-client";
import { ContractForm } from "@/components/contracts/ContractForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function EditContractPage() {
  const params = useParams<{ id: string }>();
  const contract = useContract(params.id);
  useSetBreadcrumb([
    { label: "CMS" },
    { label: "Contracts / Work Orders", href: "/cms/contracts" },
    { label: contract.data?.contractNo ?? "Edit Contract" },
  ]);

  if (contract.isLoading) return <p className="text-[13px] text-biz-muted">Loading contract...</p>;
  if (!contract.data) return <div className="p-12 text-center text-biz-muted">Contract not found.</div>;

  return <ContractForm mode="edit" contract={contract.data} />;
}
