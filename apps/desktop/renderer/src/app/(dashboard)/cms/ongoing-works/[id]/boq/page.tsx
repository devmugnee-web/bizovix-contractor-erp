"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCmsWork } from "@bizovix/api-client";
import { BoqPanel } from "@/components/projects/BoqPanel";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function ContractBoqPage() {
  const { id } = useParams<{ id: string }>();
  const work = useCmsWork(id);
  useSetBreadcrumb([{ label: "Projects", href: "/cms/ongoing-works" }, { label: "Bill Submission", href: "/cms/documentation/bill-submission" }, { label: "Contract BOQ" }]);
  if (work.isLoading) return <p className="p-6 text-biz-muted">Loading project…</p>;
  if (!work.data) return <p className="p-6 text-biz-danger">Project could not be loaded.</p>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-page-title">Contract BOQ</h1><p className="mt-1 text-sm text-biz-muted">{work.data.workName}</p></div><Link href="/cms/documentation/bill-submission" className="text-sm font-semibold text-biz-blue">← Bill Submission</Link></div>
    <p className="text-xs text-biz-muted">Use the agreed contract quantities and billing rates. Internal purchase costs are not billing rates.</p>
    <BoqPanel workId={id} />
  </div>;
}
