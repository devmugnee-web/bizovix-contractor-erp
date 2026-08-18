"use client";

import * as React from "react";
import type { ProjectClosingOverview } from "@bizovix/types";
import {
  useArchiveProject,
  useCloseProject,
  useCompleteDlp,
  useCompleteHandover,
  useCompletionCertificateStatus,
  useCreateCompletionCertificate,
  useCreateDefect,
  useCreateDlp,
  useCreateHandover,
  useCreateRetentionRelease,
  useDefectStatus,
  useReleaseRetention,
  useReopenProject,
} from "@bizovix/api-client";
import { Modal } from "@/components/layout/Modal";

type Mode = "certificate" | "dlp" | "defect" | "retention" | "handover" | null;
const inputClass = "h-9 w-full rounded-md border border-biz-border bg-biz-surface px-3 text-[12px] outline-none focus:border-biz-blue";
const actionClass = "rounded-md border border-biz-border bg-biz-surface px-3 py-2 text-[12px] font-medium hover:border-biz-blue hover:text-biz-blue";
const primaryClass = "rounded-md bg-biz-blue px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50";

function CertificateActions({ workId, id, status }: { workId: string; id: string; status: string }) {
  const mutation = useCompletionCertificateStatus(workId, id);
  const next = status === "DRAFT" || status === "REJECTED" ? "SUBMITTED" : status === "SUBMITTED" ? "APPROVED" : null;
  if (!next) return null;
  return <button className={actionClass} disabled={mutation.isPending} onClick={() => mutation.mutate({ status: next })}>{next === "SUBMITTED" ? "Submit" : "Approve"}</button>;
}

function DefectActions({ workId, id, status }: { workId: string; id: string; status: string }) {
  const mutation = useDefectStatus(workId, id);
  const next = { OPEN: "IN_PROGRESS", IN_PROGRESS: "RECTIFIED", RECTIFIED: "VERIFIED", VERIFIED: "CLOSED" }[status];
  if (!next) return null;
  return <button className={actionClass} disabled={mutation.isPending} onClick={() => mutation.mutate({ status: next })}>{next.replaceAll("_", " ")}</button>;
}

export function ProjectCloseoutActions({ workId, data }: { workId: string; data: ProjectClosingOverview }) {
  const [mode, setMode] = React.useState<Mode>(null);
  const createCertificate = useCreateCompletionCertificate(workId);
  const createDlp = useCreateDlp(workId);
  const createDefect = useCreateDefect(workId);
  const createRetention = useCreateRetentionRelease(workId);
  const createHandover = useCreateHandover(workId);
  const close = useCloseProject(workId);
  const reopen = useReopenProject(workId);
  const archive = useArchiveProject(workId);
  const contract = data.contracts[0];
  const approvedCertificate = data.certificates.find((item) => item.status === "APPROVED");
  const activeDlp = data.dlps.find((item) => item.status !== "COMPLETED");
  const locked = ["COMPLETED", "ARCHIVED"].includes(data.readiness.project.status);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ""));
    if (mode === "certificate") await createCertificate.mutateAsync(payload);
    if (mode === "dlp") await createDlp.mutateAsync({ ...payload, durationDays: Number(payload.durationDays) });
    if (mode === "defect") await createDefect.mutateAsync({ ...payload, mandatory: true });
    if (mode === "retention") await createRetention.mutateAsync({ ...payload, amount: Number(payload.amount) });
    if (mode === "handover") await createHandover.mutateAsync(payload);
    setMode(null);
  };
  const pending = createCertificate.isPending || createDlp.isPending || createDefect.isPending || createRetention.isPending || createHandover.isPending;
  return <>
    {locked && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">This project is {data.readiness.project.status === "ARCHIVED" ? "archived" : "closed"}. Reopen the project to make operational changes.</div>}
    <div className="flex flex-wrap gap-2">
      {!locked && <><button className={actionClass} onClick={() => setMode("certificate")}>Create Certificate</button>
      <button className={actionClass} disabled={!approvedCertificate} onClick={() => setMode("dlp")}>Start DLP</button>
      <button className={actionClass} disabled={!activeDlp} onClick={() => setMode("defect")}>Add Defect</button>
      <button className={actionClass} disabled={!contract} onClick={() => setMode("retention")}>Request Retention Release</button>
      <button className={actionClass} disabled={!contract} onClick={() => setMode("handover")}>Create Handover</button>
      {data.readiness.status !== "NOT_READY" && <button className={primaryClass} disabled={close.isPending} onClick={() => close.mutate({})}>Close Project</button>}</>}
      <button className={actionClass} disabled={reopen.isPending} onClick={() => { const reason = window.prompt("Reason for reopening"); if (reason?.trim()) reopen.mutate({ reason }); }}>Reopen</button>
      <button className={actionClass} disabled={archive.isPending} onClick={() => { const reason = window.prompt("Reason for archiving"); if (reason?.trim()) archive.mutate({ reason }); }}>Archive</button>
    </div>

    {!locked && <div className="space-y-2">
      {data.certificates.map((item) => <div key={item.id} className="flex items-center justify-between rounded border border-biz-border p-2 text-[12px]"><span>{item.certificateNo} · {item.status}</span><CertificateActions workId={workId} id={item.id} status={item.status} /></div>)}
      {data.defects.map((item) => <div key={item.id} className="flex items-center justify-between rounded border border-biz-border p-2 text-[12px]"><span>{item.defectNo} · {item.status}</span><DefectActions workId={workId} id={item.id} status={item.status} /></div>)}
      {data.dlps.filter((item) => item.status !== "COMPLETED").map((item) => <DlpCompleteButton key={item.id} workId={workId} id={item.id} />)}
      {data.releases.filter((item) => item.status !== "RELEASED").map((item) => <RetentionReleaseButton key={item.id} workId={workId} id={item.id} label={item.releaseNo} />)}
      {data.handovers.filter((item) => item.status !== "COMPLETED").map((item) => <HandoverCompleteButton key={item.id} workId={workId} id={item.id} label={item.handoverNo} />)}
    </div>}

    <Modal open={mode !== null} onClose={() => setMode(null)} title={{ certificate: "Completion Certificate", dlp: "Start DLP", defect: "Record Defect", retention: "Retention Release", handover: "Project Handover" }[mode ?? "certificate"]}>
      <form className="space-y-3" onSubmit={submit}>
        {(mode === "certificate" || mode === "retention" || mode === "handover") && <input type="hidden" name="contractId" value={contract?.id ?? ""} />}
        {mode === "certificate" && <><input className={inputClass} name="applicationDate" type="date" required /><input className={inputClass} name="actualCompletionDate" type="date" required /><input className={inputClass} name="certifiedCompletionDate" type="date" /><input className={inputClass} name="certificateDate" type="date" /><input className={inputClass} name="issuingAuthority" placeholder="Issuing authority" /><textarea className={inputClass} name="remarks" placeholder="Remarks" /></>}
        {mode === "dlp" && <><input type="hidden" name="completionCertificateId" value={approvedCertificate?.id ?? ""} /><input className={inputClass} name="startDate" type="date" /><input className={inputClass} name="durationDays" type="number" min="1" defaultValue={contract?.dlpDays ?? 365} required /><textarea className={inputClass} name="remarks" placeholder="Remarks" /></>}
        {mode === "defect" && <><input type="hidden" name="dlpId" value={activeDlp?.id ?? ""} /><textarea className={inputClass} name="description" placeholder="Defect description" required /><input className={inputClass} name="reportedDate" type="date" required /><input className={inputClass} name="responsiblePerson" placeholder="Responsible person" /><input className={inputClass} name="targetRectificationDate" type="date" /><select className={inputClass} name="priority" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></>}
        {mode === "retention" && <><input className={inputClass} name="amount" type="number" min="0.01" step="0.01" placeholder="Release amount" required /><input className={inputClass} name="releaseDueDate" type="date" /><input className={inputClass} name="reference" placeholder="Release reference" /><textarea className={inputClass} name="remarks" placeholder="Remarks" /></>}
        {mode === "handover" && <><input type="hidden" name="completionCertificateId" value={approvedCertificate?.id ?? ""} /><input type="hidden" name="handoverType" value="FINAL" /><input className={inputClass} name="handoverDate" type="date" required /><input className={inputClass} name="handedOverBy" placeholder="Handed over by" required /><input className={inputClass} name="receivedBy" placeholder="Received by" required /><input className={inputClass} name="authority" placeholder="Receiving authority" required /><textarea className={inputClass} name="remarks" placeholder="Remarks" /></>}
        <div className="flex justify-end gap-2"><button type="button" className={actionClass} onClick={() => setMode(null)}>Cancel</button><button className={primaryClass} disabled={pending}>Save</button></div>
      </form>
    </Modal>
  </>;
}

function DlpCompleteButton({ workId, id }: { workId: string; id: string }) { const mutation = useCompleteDlp(workId, id); return <button className={actionClass} disabled={mutation.isPending} onClick={() => mutation.mutate({})}>Complete DLP</button>; }
function RetentionReleaseButton({ workId, id, label }: { workId: string; id: string; label: string }) { const mutation = useReleaseRetention(workId, id); return <button className={actionClass} disabled={mutation.isPending} onClick={() => mutation.mutate({})}>Record {label} Released</button>; }
function HandoverCompleteButton({ workId, id, label }: { workId: string; id: string; label: string }) { const mutation = useCompleteHandover(workId, id); return <button className={actionClass} disabled={mutation.isPending} onClick={() => mutation.mutate({})}>Complete {label}</button>; }
