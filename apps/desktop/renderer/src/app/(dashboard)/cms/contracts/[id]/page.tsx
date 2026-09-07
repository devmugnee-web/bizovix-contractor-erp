"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileEdit, FileText, FolderKanban } from "lucide-react";
import { useActivateContract, useContract } from "@bizovix/api-client";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { CONTRACT_STATUS_META, CONTRACT_TYPE_META } from "@/lib/contracts";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg border border-biz-border bg-white p-3 shadow-card">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-biz-blue" />
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-biz-muted">{label}</p>
      <p className="mt-1 truncate text-[15px] font-bold text-biz-navy" title={value}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-biz-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[13px] text-biz-muted">{label}</span>
      <span className="text-[13px] font-medium text-biz-text sm:text-right">{value}</span>
    </div>
  );
}

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const contract = useContract(params.id);
  const activateMutation = useActivateContract();
  useSetBreadcrumb([
    { label: "CMS" },
    { label: "Contracts / Work Orders", href: "/cms/contracts" },
    { label: contract.data?.contractNo ?? "Contract Details" },
  ]);

  if (contract.isLoading)
    return <div className="p-12 text-center text-biz-muted">Loading contract...</div>;
  if (!contract.data)
    return <div className="p-12 text-center text-biz-muted">Contract not found.</div>;

  const c = contract.data;
  const statusMeta = CONTRACT_STATUS_META[c.status];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/cms/ongoing-works/${c.cmsWorkId}`}
        className="flex h-9 w-fit items-center gap-2 rounded-md border border-biz-border bg-white px-4 text-[11px] font-semibold text-biz-navy shadow-sm transition-colors hover:border-biz-blue hover:bg-biz-blue-soft hover:text-biz-blue"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Ongoing Work
      </Link>

      <div className="relative flex flex-col gap-4 overflow-hidden rounded-xl border border-biz-border bg-gradient-to-br from-white via-white to-biz-blue-soft/60 p-4 shadow-card sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <span className="absolute inset-y-0 left-0 w-1 bg-biz-blue" />
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title text-biz-text">{c.contractNo}</h1>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <p className="mt-1 text-[13px] text-biz-muted">
            {c.cmsWork.workName} · {c.organizationMaster.shortName} ·{" "}
            {CONTRACT_TYPE_META[c.contractType]}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link href={`/cms/ongoing-works/${c.cmsWorkId}`}>
            <SecondaryButton className="w-full justify-center sm:w-auto">
              <FolderKanban className="h-4 w-4" />
              Open Project
            </SecondaryButton>
          </Link>
          <Link href={`/cms/contracts/${c.id}/edit`}>
            <SecondaryButton className="w-full justify-center sm:w-auto">
              <FileEdit className="h-4 w-4" />
              Edit
            </SecondaryButton>
          </Link>
          {c.status === "DRAFT" && (
            <PrimaryButton
              disabled={activateMutation.isPending}
              onClick={() => activateMutation.mutate(c.id)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {activateMutation.isPending ? "Activating..." : "Activate Contract"}
            </PrimaryButton>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <InfoCard label="Original Contract Value" value={formatBDT(c.originalContractValue)} />
        <InfoCard label="Current Contract Value" value={formatBDT(c.currentContractValue)} />
        <InfoCard label="Commencement Date" value={formatDate(c.commencementDate)} />
        <InfoCard label="Completion Date" value={formatDate(c.currentCompletionDate)} />
        <InfoCard label="Duration" value={c.durationDays ? `${c.durationDays} days` : "—"} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="rounded-lg border border-biz-border bg-white px-4 py-2 shadow-card sm:px-5">
          <h2 className="mb-1 mt-3 text-[14px] font-bold text-biz-navy">Contract Details</h2>
          <DetailRow label="Contract Type" value={CONTRACT_TYPE_META[c.contractType]} />
          <DetailRow label="Issue Date" value={formatDate(c.issueDate)} />
          <DetailRow
            label="Contract Date"
            value={c.contractDate ? formatDate(c.contractDate) : "Not set"}
          />
          <DetailRow label="Linked Tender" value={c.tender ? c.tender.workName : "Not linked"} />
          <DetailRow
            label="Original Completion Date"
            value={formatDate(c.originalCompletionDate)}
          />
          <DetailRow
            label="Defect Liability Period"
            value={c.dlpDays ? `${c.dlpDays} days` : "Not set"}
          />
          <DetailRow
            label="Retention %"
            value={c.retentionPct ? `${c.retentionPct}%` : "Not set"}
          />
          <DetailRow
            label="Security Deposit %"
            value={c.securityDepositPct ? `${c.securityDepositPct}%` : "Not set"}
          />
          <DetailRow
            label="SD Release Due Date"
            value={
              c.securityDepositReleaseDueDate
                ? formatDate(c.securityDepositReleaseDueDate)
                : "Not set"
            }
          />
          <DetailRow label="Client Contact / PE" value={c.clientContactName ?? "Not set"} />
          <DetailRow label="Responsible Person" value={c.responsiblePerson ?? "Not set"} />
        </section>

        <div className="self-start rounded-lg border border-biz-border bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-biz-blue" />
              <h3 className="text-[13px] font-semibold text-biz-text">Documents</h3>
              <span className="rounded-full bg-biz-blue-soft px-2 py-0.5 text-[11px] font-semibold text-biz-blue">
                {c.linked.documents.length}
              </span>
            </div>
            <Link
              href="/documents/projects"
              className="text-[11px] font-medium text-biz-blue hover:underline"
            >
              View
            </Link>
          </div>
          {c.linked.documents.length === 0 ? (
            <p className="text-[12px] text-biz-muted">No documents linked yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {c.linked.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-[12px]">
                  <span className="text-biz-text">{d.name}</span>
                  <span className="text-biz-muted">
                    {d.expiryDate ? formatDate(d.expiryDate) : "No expiry"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(c.scopeOfWork || c.remarks) && (
        <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
          {c.scopeOfWork && (
            <>
              <h2 className="mb-2 text-[14px] font-semibold text-biz-text">Scope of Work</h2>
              <p className="mb-4 text-[13px] text-biz-muted">{c.scopeOfWork}</p>
            </>
          )}
          {c.remarks && (
            <>
              <h2 className="mb-2 text-[14px] font-semibold text-biz-text">Remarks</h2>
              <p className="text-[13px] text-biz-muted">{c.remarks}</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
