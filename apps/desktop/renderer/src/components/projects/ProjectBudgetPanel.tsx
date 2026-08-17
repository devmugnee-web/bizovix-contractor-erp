"use client";

import * as React from "react";
import { CheckCircle2, Plus, Save, Trash2 } from "lucide-react";
import {
  useApproveProjectBudget,
  useProjectBudgetSummary,
  useProjectBudgets,
  useSaveProjectBudgetDraft,
} from "@bizovix/api-client";
import { CurrencyInput, PrimaryButton, SecondaryButton, SelectInput, StatusBadge, TextInput } from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { BUDGET_CATEGORIES, type ProjectBudgetVersion } from "@bizovix/types";

interface DraftLine {
  key: string;
  category: string;
  description: string;
  amount: string;
  remarks: string;
}

function toDraftLine(line: ProjectBudgetVersion["lines"][number]): DraftLine {
  return { key: line.id, category: line.category, description: line.description ?? "", amount: line.amount, remarks: line.remarks ?? "" };
}

function emptyLine(): DraftLine {
  return { key: crypto.randomUUID(), category: BUDGET_CATEGORIES[0], description: "", amount: "0", remarks: "" };
}

const CATEGORY_OPTIONS = BUDGET_CATEGORIES.map((c) => ({ label: c, value: c }));

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card">
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-biz-text">{value}</p>
    </div>
  );
}

export function ProjectBudgetPanel({ workId }: { workId: string }) {
  const summary = useProjectBudgetSummary(workId);
  const versions = useProjectBudgets(workId);

  if (versions.isLoading || summary.isLoading) {
    return <p className="text-[13px] text-biz-muted">Loading budget...</p>;
  }

  const versionList = versions.data ?? [];
  const draftVersion = versionList.find((v) => v.status === "DRAFT");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <InfoCard label="Contract Value" value={formatBDT(summary.data?.contractValue ?? "0")} />
        <InfoCard label="Total Budget" value={formatBDT(summary.data?.totalBudget ?? "0")} />
        <InfoCard label="Contingency" value={formatBDT(summary.data?.contingency ?? "0")} />
        <InfoCard label="Unallocated Value" value={formatBDT(summary.data?.unallocated ?? "0")} />
        <InfoCard label="Expected Gross Margin" value={formatBDT(summary.data?.expectedGrossMargin ?? "0")} />
        <InfoCard label="Expected Margin %" value={`${summary.data?.expectedMarginPct ?? "0.00"}%`} />
      </div>

      <BudgetEditor key={draftVersion?.id ?? "new"} workId={workId} draftVersion={draftVersion} />

      {versionList.length > 0 && (
        <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
          <div className="border-b border-biz-border px-4 py-3">
            <h3 className="text-[15px] font-semibold text-biz-text">Budget Version History</h3>
          </div>
          <div className="flex flex-col divide-y divide-biz-border">
            {versionList.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px]">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-biz-text">Version {v.version}</span>
                  <StatusBadge
                    label={v.status}
                    tone={v.status === "DRAFT" ? "neutral" : v.status === "ARCHIVED" ? "danger" : "success"}
                  />
                  <span className="text-biz-muted">{formatBDT(v.totalBudget)}</span>
                </div>
                <span className="text-biz-muted">
                  {v.approvedAt ? `Approved ${formatDate(v.approvedAt)}` : `Created ${formatDate(v.createdAt)}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BudgetEditor({ workId, draftVersion }: { workId: string; draftVersion?: ProjectBudgetVersion }) {
  const [lines, setLines] = React.useState<DraftLine[]>(() =>
    draftVersion && draftVersion.lines.length > 0 ? draftVersion.lines.map(toDraftLine) : [emptyLine()],
  );
  const [revisionNote, setRevisionNote] = React.useState(draftVersion?.revisionNote ?? "");
  const saveDraft = useSaveProjectBudgetDraft(workId);
  const approve = useApproveProjectBudget(workId);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function handleSave() {
    saveDraft.mutate({
      revisionNote: revisionNote || undefined,
      lines: lines.map((l) => ({
        category: l.category,
        description: l.description || undefined,
        amount: Number(l.amount) || 0,
        remarks: l.remarks || undefined,
      })),
    });
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  return (
    <section className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
      <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
        <h3 className="text-[15px] font-semibold text-biz-text">
          {draftVersion ? `Draft Budget (v${draftVersion.version})` : "New Budget Draft"}
        </h3>
        <span className="text-[13px] font-semibold text-biz-text">{formatBDT(total)}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead>
            <tr className="bg-biz-bg">
              <th className="px-4 py-2.5 font-medium text-biz-muted">Category</th>
              <th className="px-4 py-2.5 font-medium text-biz-muted">Description</th>
              <th className="px-4 py-2.5 font-medium text-biz-muted">Budgeted Amount</th>
              <th className="px-4 py-2.5 font-medium text-biz-muted">Remarks</th>
              <th className="px-4 py-2.5 font-medium text-biz-muted">Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="border-t border-biz-border">
                <td className="px-4 py-2">
                  <SelectInput
                    options={CATEGORY_OPTIONS}
                    value={line.category}
                    onChange={(e) => updateLine(line.key, { category: e.target.value })}
                  />
                </td>
                <td className="px-4 py-2">
                  <TextInput
                    placeholder="Optional"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                </td>
                <td className="px-4 py-2">
                  <CurrencyInput
                    value={line.amount}
                    onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                  />
                </td>
                <td className="px-4 py-2">
                  <TextInput
                    placeholder="Optional"
                    value={line.remarks}
                    onChange={(e) => updateLine(line.key, { remarks: e.target.value })}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="text-biz-danger hover:opacity-70"
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-biz-border px-4 py-3">
        <SecondaryButton type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
          <Plus className="h-4 w-4" />
          Add Line
        </SecondaryButton>
        <div className="flex flex-1 items-center gap-3">
          <TextInput
            className="flex-1"
            placeholder="Revision note (optional)"
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <PrimaryButton type="button" disabled={saveDraft.isPending} onClick={handleSave}>
            <Save className="h-4 w-4" />
            {saveDraft.isPending ? "Saving..." : "Save Draft"}
          </PrimaryButton>
          {draftVersion && (
            <PrimaryButton
              type="button"
              disabled={approve.isPending}
              onClick={() => approve.mutate(draftVersion.id)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {approve.isPending ? "Approving..." : "Approve Budget"}
            </PrimaryButton>
          )}
        </div>
      </div>
    </section>
  );
}
