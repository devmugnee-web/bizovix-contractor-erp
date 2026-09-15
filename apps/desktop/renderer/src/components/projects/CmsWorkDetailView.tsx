"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, FileEdit, Plus, RotateCcw } from "lucide-react";
import { useArchiveCmsWork, useCmsWork, useContracts, useRestoreCmsWork } from "@bizovix/api-client";
import { PageHeader, PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { CONTRACT_STATUS_META, CONTRACT_TYPE_META } from "@/lib/contracts";
import { ProjectBudgetPanel } from "@/components/projects/ProjectBudgetPanel";
import { BoqPanel } from "@/components/projects/BoqPanel";
import { BudgetVsActualPanel } from "@/components/projects/BudgetVsActualPanel";
import { ProjectProgressPanel } from "@/components/projects/ProjectProgressPanel";
import { RunningBillsPanel } from "@/components/bills/RunningBillsPanel";
import { VariationsPanel } from "@/components/variations/VariationsPanel";
import { TimeExtensionsPanel } from "@/components/time-extensions/TimeExtensionsPanel";
import { ProjectCloseoutPanel } from "@/components/projects/ProjectCloseoutPanel";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-biz-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[13px] text-biz-muted">{label}</span>
      <span className="text-[13px] font-medium text-biz-text sm:text-right">{value}</span>
    </div>
  );
}

const TABS = [
  "Overview",
  "Contract",
  "Budget",
  "BOQ",
  "Progress",
  "Running Bills",
  "Budget vs Actual",
  "Variations",
  "Time Extensions",
  "Completion & Closeout",
] as const;
type Tab = (typeof TABS)[number];

/**
 * Shared project detail view for both Ongoing and Archived Works — an archived work must stay
 * fully readable/reportable (Contract, Budget, BOQ, bills, variations, closeout), not collapse to
 * a flat summary, so both routes render this same component rather than diverging.
 */
export function CmsWorkDetailView({ workId, listHref }: { workId: string; listHref: string }) {
  const router = useRouter();
  const work = useCmsWork(workId);
  const archiveWork = useArchiveCmsWork();
  const restoreWork = useRestoreCmsWork();
  const [tab, setTab] = React.useState<Tab>("Overview");

  if (work.isLoading) return <p className="text-[13px] text-biz-muted">Loading work details...</p>;
  if (work.isError || !work.data)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] text-biz-danger">
        Work details could not be loaded.
      </div>
    );
  const record = work.data;

  function archive() {
    if (!window.confirm("Archive this work?")) return;
    archiveWork.mutate(record.id, { onSuccess: () => router.push("/cms/ongoing-works") });
  }

  function restore() {
    if (!window.confirm("Restore this work to Ongoing Works?")) return;
    restoreWork.mutate(record.id, { onSuccess: () => router.push("/cms/ongoing-works") });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Work Details"
        subtitle={record.workName}
        actions={
          <>
            <SecondaryButton onClick={() => router.push(listHref)}>Back to List</SecondaryButton>
            {record.status === "ONGOING" && (
              <SecondaryButton onClick={archive} disabled={archiveWork.isPending}>
                <Archive className="h-4 w-4" /> Archive
              </SecondaryButton>
            )}
            {record.status === "ARCHIVED" && (
              <SecondaryButton onClick={restore} disabled={restoreWork.isPending}>
                <RotateCcw className="h-4 w-4" /> {restoreWork.isPending ? "Restoring..." : "Restore to Ongoing"}
              </SecondaryButton>
            )}
          </>
        }
      />

      <div className="flex flex-wrap gap-1 border-b border-biz-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "border-b-2 border-biz-blue px-4 py-2 text-[13px] font-semibold text-biz-blue"
                : "border-b-2 border-transparent px-4 py-2 text-[13px] font-medium text-biz-muted hover:text-biz-text"
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="max-w-3xl rounded-lg border border-biz-border bg-biz-surface px-6 py-2 shadow-card">
          <DetailRow
            label="Status"
            value={<StatusBadge label={record.status} tone={record.status === "ONGOING" ? "success" : "neutral"} />}
          />
          <DetailRow label="Work / Project Name" value={record.workName} />
          <DetailRow
            label="Organization"
            value={`${record.organizationMaster.shortName} - ${record.organizationMaster.fullName}`}
          />
          <DetailRow label="Work Category" value={record.workCategory} />
          <DetailRow
            label="Contract Value"
            value={formatBDT(record.contractValue)}
          />
          <DetailRow label="Start Date" value={record.startDate ? formatDate(record.startDate) : "Not set"} />
          <DetailRow
            label="Expected Completion"
            value={record.expectedCompletionDate ? formatDate(record.expectedCompletionDate) : "Not set"}
          />
        </div>
      )}

      {tab === "Contract" && <ContractTab cmsWorkId={record.id} />}
      {tab === "Budget" && <ProjectBudgetPanel workId={record.id} />}
      {tab === "BOQ" && <BoqPanel workId={record.id} />}
      {tab === "Progress" && <ProjectProgressPanel workId={record.id} />}
      {tab === "Running Bills" && <RunningBillsPanel workId={record.id} />}
      {tab === "Budget vs Actual" && <BudgetVsActualPanel workId={record.id} />}
      {tab === "Variations" && <VariationsPanel workId={record.id} />}
      {tab === "Time Extensions" && <TimeExtensionsPanel workId={record.id} />}
      {tab === "Completion & Closeout" && <ProjectCloseoutPanel workId={record.id} />}
    </div>
  );
}

function ContractTab({ cmsWorkId }: { cmsWorkId: string }) {
  const contracts = useContracts({ cmsWorkId, limit: 1 });

  if (contracts.isLoading) return <p className="text-[13px] text-biz-muted">Loading contract...</p>;

  const contract = contracts.data?.items[0];
  if (!contract) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-biz-border bg-biz-surface p-8 text-center">
        <p className="text-[13px] text-biz-muted">No Contract / Work Order linked to this project yet.</p>
        <Link href={`/cms/contracts/create?cmsWorkId=${cmsWorkId}`}>
          <PrimaryButton>
            <Plus className="h-4 w-4" />
            Add Contract / Work Order
          </PrimaryButton>
        </Link>
      </div>
    );
  }

  const statusMeta = CONTRACT_STATUS_META[contract.status];

  return (
    <div className="max-w-3xl rounded-lg border border-biz-border bg-biz-surface px-6 py-2 shadow-card">
      <div className="flex items-center justify-between py-3">
        <h2 className="text-[14px] font-semibold text-biz-text">{contract.contractNo}</h2>
        <div className="flex items-center gap-2">
          <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          <Link href={`/cms/contracts/${contract.id}/edit`}>
            <SecondaryButton>
              <FileEdit className="h-4 w-4" />
              Edit
            </SecondaryButton>
          </Link>
        </div>
      </div>
      <DetailRow label="Contract Type" value={CONTRACT_TYPE_META[contract.contractType]} />
      <DetailRow label="Original Contract Value" value={formatBDT(contract.originalContractValue)} />
      <DetailRow label="Current Contract Value" value={formatBDT(contract.currentContractValue)} />
      <DetailRow label="Commencement Date" value={formatDate(contract.commencementDate)} />
      <DetailRow label="Completion Date" value={formatDate(contract.currentCompletionDate)} />
      <DetailRow label="Duration" value={contract.durationDays ? `${contract.durationDays} days` : "—"} />
      <div className="py-3">
        <Link href={`/cms/contracts/${contract.id}`} className="text-[13px] font-medium text-biz-blue hover:underline">
          View Full Contract Details →
        </Link>
      </div>
    </div>
  );
}
