"use client";

import { useParams, useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { useCmsWork, useRestoreCmsWork } from "@bizovix/api-client";
import { PageHeader, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex flex-col gap-1 border-b border-biz-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"><span className="text-[13px] text-biz-muted">{label}</span><span className="text-[13px] font-medium text-biz-text sm:text-right">{value}</span></div>;
}

export default function ArchivedWorkDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const work = useCmsWork(params.id);
  const restoreWork = useRestoreCmsWork();
  useSetBreadcrumb([{ label: "CMS" }, { label: "Archived Works", href: "/cms/archived-works" }, { label: "View Details" }]);

  if (work.isLoading) return <p className="text-[13px] text-biz-muted">Loading work details...</p>;
  if (work.isError || !work.data || work.data.status !== "ARCHIVED") return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] text-biz-danger">Archived work details could not be loaded.</div>;
  const record = work.data;

  function restore() {
    if (!window.confirm("Restore this work to Ongoing Works?")) return;
    restoreWork.mutate(record.id, { onSuccess: () => router.push("/cms/ongoing-works") });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Archived Work Details" subtitle={record.workName} actions={<><SecondaryButton onClick={() => router.push("/cms/archived-works")}>Back to List</SecondaryButton><SecondaryButton onClick={restore} disabled={restoreWork.isPending}><RotateCcw className="h-4 w-4" /> {restoreWork.isPending ? "Restoring..." : "Restore to Ongoing"}</SecondaryButton></>} />
      <div className="max-w-3xl rounded-lg border border-biz-border bg-biz-surface px-6 py-2 shadow-card">
        <DetailRow label="Status" value={<StatusBadge label="ARCHIVED" tone="neutral" />} />
        <DetailRow label="Work / Project Name" value={record.workName} />
        <DetailRow label="Organization" value={`${record.organizationMaster.shortName} - ${record.organizationMaster.fullName}`} />
        <DetailRow label="Work Category" value={record.workCategory} />
        <DetailRow label="Contract Value" value={`BDT ${Number(record.contractValue).toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
        <DetailRow label="Start Date" value={record.startDate ? formatDate(record.startDate) : "Not set"} />
        <DetailRow label="Completion Date" value={record.completionDate ? formatDate(record.completionDate) : "Not set"} />
      </div>
    </div>
  );
}
