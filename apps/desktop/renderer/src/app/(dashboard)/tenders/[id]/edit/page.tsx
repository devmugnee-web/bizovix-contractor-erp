"use client";

import { useParams } from "next/navigation";
import { useTender } from "@bizovix/api-client";
import { TenderForm } from "@/components/tenders/TenderForm";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function EditTenderPage() {
  const params = useParams<{ id: string }>();
  const tender = useTender(params.id);
  useSetBreadcrumb([{ label: "Tenders", href: "/tenders" }, { label: tender.data?.workName ?? "Edit Tender" }]);

  if (tender.isLoading) {
    return <div className="p-12 text-center text-biz-muted">Loading tender...</div>;
  }
  if (!tender.data) {
    return <div className="p-12 text-center text-biz-muted">Tender not found.</div>;
  }

  return <TenderForm mode="edit" tender={tender.data} />;
}
