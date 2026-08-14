"use client";

import { useParams, useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { useArchiveCmsWork, useCmsWork } from "@bizovix/api-client";
import { PageHeader, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex flex-col gap-1 border-b border-biz-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"><span className="text-[13px] text-biz-muted">{label}</span><span className="text-[13px] font-medium text-biz-text sm:text-right">{value}</span></div>;
}

export default function OngoingWorkDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const work = useCmsWork(params.id);
  const archiveWork = useArchiveCmsWork();
  useSetBreadcrumb([{ label: "CMS" }, { label: "Ongoing Works", href: "/cms/ongoing-works" }, { label: "View Details" }]);

  if (work.isLoading) return <p className="text-[13px] text-biz-muted">Loading work details...</p>;
  if (work.isError || !work.data) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] text-biz-danger">Work details could not be loaded.</div>;
  const record = work.data;

  function archive() {
    if (!window.confirm("Archive this work?")) return;
    archiveWork.mutate(record.id, { onSuccess: () => router.push("/cms/ongoing-works") });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Work Details" subtitle={record.workName} actions={<><SecondaryButton onClick={() => router.push("/cms/ongoing-works")}>Back to List</SecondaryButton>{record.status === "ONGOING" && <SecondaryButton onClick={archive} disabled={archiveWork.isPending}><Archive className="h-4 w-4" /> Archive</SecondaryButton>}</>} />
      <div className="max-w-3xl rounded-lg border border-biz-border bg-biz-surface px-6 py-2 shadow-card">
        <DetailRow label="Status" value={<StatusBadge label={record.status} tone={record.status === "ONGOING" ? "success" : "neutral"} />} />
        <DetailRow label="Work / Project Name" value={record.workName} />
        <DetailRow label="Organization" value={`${record.organizationMaster.shortName} - ${record.organizationMaster.fullName}`} />
        <DetailRow label="Work Category" value={record.workCategory} />
        <DetailRow label="Contract Value" value={`BDT ${Number(record.contractValue).toLocaleString("en-US", { minimumFractionDigits: 2 })}`} />
        <DetailRow label="Start Date" value={record.startDate ? formatDate(record.startDate) : "Not set"} />
        <DetailRow label="Expected Completion" value={record.expectedCompletionDate ? formatDate(record.expectedCompletionDate) : "Not set"} />
      </div>
    </div>
  );
}
