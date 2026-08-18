"use client";

import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useFinalProjectProfitability, useProjectClosing } from "@bizovix/api-client";
import { formatBDT, formatDate } from "@bizovix/utils";
import { ProjectCloseoutActions } from "./ProjectCloseoutActions";

const moneyFields = [
  ["Original Contract", "originalContractValue"],
  ["Approved Variations", "approvedVariations"],
  ["Current Contract", "currentContractValue"],
  ["Certified Revenue", "totalCertified"],
  ["Cash Collected", "totalReceived"],
  ["Outstanding Receivable", "outstandingReceivable"],
  ["Retention Outstanding", "retentionOutstanding"],
  ["Final Project Cost", "finalProjectCost"],
  ["Gross Profit / Loss", "grossProfitLoss"],
] as const;

export function ProjectCloseoutPanel({ workId }: { workId: string }) {
  const closing = useProjectClosing(workId);
  const profitability = useFinalProjectProfitability(workId);
  if (closing.isLoading)
    return (
      <div className="flex items-center gap-2 text-[13px] text-biz-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading closeout data...
      </div>
    );
  if (!closing.data)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] text-biz-danger">
        Closeout data could not be loaded.
      </div>
    );
  const data = closing.data;
  return (
    <div className="space-y-5">
      <ProjectCloseoutActions workId={workId} data={data} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Completion", data.certificates.find((item) => item.status === "APPROVED")?.status ?? "PENDING"],
          ["DLP", data.dlps[0]?.status ?? "NOT APPLICABLE"],
          ["Open Defects", data.defects.filter((item) => !["VERIFIED", "CLOSED"].includes(item.status)).length],
          ["Retention Outstanding", formatBDT(data.retention.outstandingRetention)],
          ["Final Bill", data.readiness.items.find((item) => item.key === "final_bill")?.status ?? "PENDING"],
          ["Outstanding Receivable", data.readiness.items.find((item) => item.key === "receivable")?.value ?? "0.00"],
          ["Guarantees", data.guarantees.some((item) => ["ACTIVE", "RELEASE_REQUESTED", "EXPIRED"].includes(item.status)) ? "ACTIVE" : "RESOLVED"],
          ["Readiness", data.readiness.status.replaceAll("_", " ")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
            <div className="text-[11px] text-biz-muted">{label}</div>
            <div className="mt-1 text-[13px] font-semibold text-biz-text">{value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-biz-border bg-biz-surface p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-biz-text">Project closeout readiness</h2>
            <p className="text-[12px] text-biz-muted">
              Execution → Final Bill → Completion → DLP → Release → Handover → Close
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${data.readiness.status === "READY_TO_CLOSE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
          >
            {data.readiness.status.replaceAll("_", " ")}
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {data.readiness.items.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-2 rounded-md border border-biz-border px-3 py-2 text-[12px]"
            >
              {item.passed ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <CircleAlert className="h-4 w-4 text-amber-600" />
              )}
              <span className="flex-1">{item.label}</span>
              {item.value !== undefined && <span className="font-medium">{item.value}</span>}
              {item.status === "NOT_APPLICABLE" && <span className="text-biz-muted">Not applicable</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-biz-border bg-biz-surface p-4">
          <h3 className="mb-3 text-[13px] font-semibold">Completion & DLP</h3>
          {data.certificates.length ? (
            data.certificates.map((c) => (
              <div key={c.id} className="border-b border-biz-border py-2 text-[12px] last:border-0">
                <div className="flex justify-between">
                  <b>{c.certificateNo}</b>
                  <span>{c.status}</span>
                </div>
                <div className="text-biz-muted">Actual: {formatDate(c.actualCompletionDate)}</div>
              </div>
            ))
          ) : (
            <p className="text-[12px] text-biz-muted">No Completion Certificate.</p>
          )}
          {data.dlps.map((d) => (
            <div key={d.id} className="mt-2 rounded bg-biz-bg p-2 text-[12px]">
              DLP {d.status}: {formatDate(d.startDate)} – {formatDate(d.endDate)}
            </div>
          ))}
        </section>
        <section className="rounded-lg border border-biz-border bg-biz-surface p-4">
          <h3 className="mb-3 text-[13px] font-semibold">Defects</h3>
          {data.defects.length ? (
            data.defects.map((d) => (
              <div key={d.id} className="border-b border-biz-border py-2 text-[12px] last:border-0">
                <div className="flex justify-between">
                  <b>{d.defectNo}</b>
                  <span>{d.status}</span>
                </div>
                <p className="text-biz-muted">{d.description}</p>
              </div>
            ))
          ) : (
            <p className="text-[12px] text-biz-muted">No defects recorded.</p>
          )}
        </section>
        <section className="rounded-lg border border-biz-border bg-biz-surface p-4">
          <h3 className="mb-3 text-[13px] font-semibold">Retention</h3>
          <div className="space-y-2 text-[12px]">
            <div className="flex justify-between">
              <span>Deducted</span>
              <b>{formatBDT(data.retention.totalRetentionDeducted)}</b>
            </div>
            <div className="flex justify-between">
              <span>Released</span>
              <b>{formatBDT(data.retention.previouslyReleased)}</b>
            </div>
            <div className="flex justify-between border-t border-biz-border pt-2">
              <span>Outstanding</span>
              <b>{formatBDT(data.retention.outstandingRetention)}</b>
            </div>
          </div>
        </section>
      </div>

      {profitability.data && (
        <section className="rounded-lg border border-biz-border bg-biz-surface p-5 shadow-card">
          <h3 className="mb-3 text-[13px] font-semibold">Final Project Profitability</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {moneyFields.map(([label, field]) => (
              <div key={field} className="rounded-md bg-biz-bg p-3">
                <div className="text-[11px] text-biz-muted">{label}</div>
                <div className="text-[14px] font-semibold">
                  {formatBDT(profitability.data![field])}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-biz-muted">
            Contract value, certified revenue, cash collected, and profit are shown separately.
            Margin: {profitability.data.profitMarginPct ?? "N/A"}%
          </p>
        </section>
      )}
    </div>
  );
}
