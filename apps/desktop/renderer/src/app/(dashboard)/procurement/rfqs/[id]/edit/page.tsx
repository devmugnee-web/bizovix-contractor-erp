"use client";

import { useParams } from "next/navigation";
import { useRfq } from "@bizovix/api-client";
import { RfqForm } from "@/components/procurement/RfqForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function EditRfqPage() {
  const { id } = useParams<{ id: string }>();
  const { data: rfq, isLoading } = useRfq(id);
  useSetBreadcrumb([
    { label: "Procurement" },
    { label: "RFQs", href: "/procurement/rfqs" },
    { label: rfq?.rfqNo ?? "RFQ", href: rfq ? "/procurement/rfqs/" + rfq.id : undefined },
    { label: "Edit" },
  ]);

  if (isLoading || !rfq) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;
  if (rfq.status !== "DRAFT") return <div className="p-12 text-center text-biz-muted">Only a Draft RFQ can be edited.</div>;
  return <RfqForm mode="edit" rfq={rfq} />;
}
