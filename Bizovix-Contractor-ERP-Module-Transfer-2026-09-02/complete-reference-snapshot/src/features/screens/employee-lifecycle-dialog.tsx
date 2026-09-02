"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import {
  useCreateEmployeeChangeMutation,
  useCreateExitProcessMutation,
  useEmployeeChangesQuery,
  useExitProcessQuery,
  useOnboardingChecklistQuery,
  useUpdateExitProcessMutation,
  useUpdateOnboardingChecklistMutation,
} from "@/hooks/use-hr-query";
import { formatCurrency, formatDate } from "@/lib/format";
import type { EmployeeChangeType, EmployeeRecord, SeparationType } from "@/types/hr";

const CHANGE_TYPE_LABELS: Record<EmployeeChangeType, string> = {
  PROMOTION: "Promotion",
  TRANSFER: "Transfer",
  DEPARTMENT_CHANGE: "Department Change",
  DESIGNATION_CHANGE: "Designation Change",
  GRADE_CHANGE: "Grade Change",
  SALARY_REVISION: "Salary Revision",
  REPORTING_MANAGER_CHANGE: "Reporting Manager Change",
  LOCATION_CHANGE: "Location Change",
  EMPLOYMENT_TYPE_CHANGE: "Employment Type Change",
};

const SEPARATION_TYPE_LABELS: Record<SeparationType, string> = {
  RESIGNATION: "Resignation",
  TERMINATION: "Termination",
  RETIREMENT: "Retirement",
  CONTRACT_EXPIRY: "Contract Expiry",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function EmployeeLifecycleDialog({ employee, onOpenChange }: { employee: EmployeeRecord | null; onOpenChange: (open: boolean) => void }) {
  const open = employee !== null;
  const changesQuery = useEmployeeChangesQuery(employee?.id ?? null);
  const exitProcessQuery = useExitProcessQuery(employee?.id ?? null);
  const createChangeMutation = useCreateEmployeeChangeMutation();
  const createExitMutation = useCreateExitProcessMutation();
  const updateExitMutation = useUpdateExitProcessMutation();

  const [changeType, setChangeType] = useState<EmployeeChangeType>("PROMOTION");
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [previousValue, setPreviousValue] = useState("");
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");

  const [separationType, setSeparationType] = useState<SeparationType>("RESIGNATION");
  const [noticeStartDate, setNoticeStartDate] = useState("");
  const [lastWorkingDate, setLastWorkingDate] = useState("");

  const exitProcess = exitProcessQuery.data ?? null;

  async function handleAddChange() {
    if (!employee) return;
    if (!newValue.trim()) {
      toast.error("New value is required.");
      return;
    }
    try {
      await createChangeMutation.mutateAsync({
        employeeId: employee.id,
        changeType,
        effectiveDate,
        previousValue: previousValue.trim() || undefined,
        newValue: newValue.trim(),
        reason: reason.trim() || undefined,
      });
      setPreviousValue("");
      setNewValue("");
      setReason("");
      toast.success("Change recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record this change.");
    }
  }

  async function handleStartExit() {
    if (!employee) return;
    try {
      await createExitMutation.mutateAsync({ employeeId: employee.id, separationType, noticeStartDate: noticeStartDate || undefined, lastWorkingDate: lastWorkingDate || undefined });
      toast.success("Exit process started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the exit process.");
    }
  }

  async function toggleClearance(field: "departmentClearance" | "assetClearance" | "financeClearance" | "hrClearance") {
    if (!exitProcess) return;
    try {
      await updateExitMutation.mutateAsync({ exitProcessId: exitProcess.id, input: { [field]: !exitProcess[field] } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update clearance.");
    }
  }

  async function handleSaveSettlement(amount: string, notes: string) {
    if (!exitProcess) return;
    try {
      await updateExitMutation.mutateAsync({
        exitProcessId: exitProcess.id,
        input: { finalSettlementAmount: amount.trim() ? Number(amount) : null, exitInterviewNotes: notes.trim() || null },
      });
      toast.success("Exit process updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the exit process.");
    }
  }

  async function handleMarkCompleted() {
    if (!exitProcess) return;
    try {
      await updateExitMutation.mutateAsync({ exitProcessId: exitProcess.id, input: { status: "COMPLETED" } });
      toast.success("Exit process marked completed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the exit process.");
    }
  }

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,900px)] max-h-[88vh] overflow-y-auto rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">{employee.name} — Lifecycle</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-[#77869c]">{employee.employeeCode} · Change history and separation & exit.</DialogDescription>
        </div>

        <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#8592a5]">Onboarding</h3>
            <OnboardingPanel employeeId={employee.id} />
          </section>

          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#8592a5]">Record a Change</h3>
            <div className="space-y-2">
              <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={changeType} onChange={(e) => setChangeType(e.target.value as EmployeeChangeType)}>
                {Object.entries(CHANGE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Effective Date</label>
                <AppDateInput className="h-9 rounded-[8px] text-[13px]" value={effectiveDate} onChange={setEffectiveDate} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Previous Value</label>
                  <Input className="h-9 rounded-[8px] text-[13px]" placeholder="e.g. Officer" value={previousValue} onChange={(e) => setPreviousValue(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">New Value</label>
                  <Input className="h-9 rounded-[8px] text-[13px]" placeholder="e.g. Senior Officer" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Reason</label>
                <Input className="h-9 rounded-[8px] text-[13px]" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <Button onClick={() => void handleAddChange()} disabled={createChangeMutation.isPending} className="h-9 w-full rounded-[8px] bg-[#2f67e8] text-[12px] text-white hover:bg-[#2459ce]">
                {createChangeMutation.isPending ? "Saving..." : "Record Change"}
              </Button>
              <p className="text-[10px] text-[#8592a5]">This logs a history entry. To also update the employee&apos;s live record (e.g. designation or salary), edit the employee directly.</p>
            </div>

            <h3 className="mb-2 mt-4 text-[12px] font-semibold uppercase tracking-wide text-[#8592a5]">History</h3>
            <div className="max-h-[220px] overflow-y-auto rounded-[10px] border border-[#e3e9f1]">
              {(changesQuery.data ?? []).length === 0 ? (
                <p className="px-3 py-4 text-center text-[12px] text-[#8592a5]">No changes recorded yet.</p>
              ) : (
                <ul className="divide-y divide-[#eef1f6]">
                  {(changesQuery.data ?? []).map((change) => (
                    <li key={change.id} className="px-3 py-2 text-[12px]">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#223754]">{CHANGE_TYPE_LABELS[change.changeType]}</span>
                        <span className="text-[10px] text-[#8592a5]">{formatDate(change.effectiveDate)}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#4a5b73]">
                        {change.previousValue ? `${change.previousValue} → ` : ""}{change.newValue ?? "—"}
                      </div>
                      {change.reason ? <div className="mt-0.5 text-[10px] text-[#8592a5]">{change.reason}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#8592a5]">Separation & Exit</h3>
            {!exitProcess ? (
              <div className="space-y-2 rounded-[10px] border border-[#e3e9f1] p-3">
                <p className="text-[11px] text-[#8592a5]">No exit process started for this employee.</p>
                <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={separationType} onChange={(e) => setSeparationType(e.target.value as SeparationType)}>
                  {Object.entries(SEPARATION_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Notice Start Date</label>
                  <AppDateInput className="h-9 rounded-[8px] text-[13px]" value={noticeStartDate} onChange={setNoticeStartDate} />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Last Working Date</label>
                  <AppDateInput className="h-9 rounded-[8px] text-[13px]" value={lastWorkingDate} onChange={setLastWorkingDate} />
                </div>
                <Button onClick={() => void handleStartExit()} disabled={createExitMutation.isPending} className="h-9 w-full rounded-[8px] bg-[#c2410c] text-[12px] text-white hover:bg-[#a8380a]">
                  {createExitMutation.isPending ? "Starting..." : "Start Exit Process"}
                </Button>
              </div>
            ) : (
              <ExitProcessPanel
                exitProcess={exitProcess}
                onToggleClearance={(field) => void toggleClearance(field)}
                onSaveSettlement={(amount, notes) => void handleSaveSettlement(amount, notes)}
                onMarkCompleted={() => void handleMarkCompleted()}
                saving={updateExitMutation.isPending}
              />
            )}
          </section>
        </div>

        <div className="flex justify-end border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExitProcessPanel({
  exitProcess,
  onToggleClearance,
  onSaveSettlement,
  onMarkCompleted,
  saving,
}: {
  exitProcess: NonNullable<ReturnType<typeof useExitProcessQuery>["data"]>;
  onToggleClearance: (field: "departmentClearance" | "assetClearance" | "financeClearance" | "hrClearance") => void;
  onSaveSettlement: (amount: string, notes: string) => void;
  onMarkCompleted: () => void;
  saving: boolean;
}) {
  const [amount, setAmount] = useState(exitProcess.finalSettlementAmount ?? "");
  const [notes, setNotes] = useState(exitProcess.exitInterviewNotes ?? "");

  const clearanceItems: Array<{ key: "departmentClearance" | "assetClearance" | "financeClearance" | "hrClearance"; label: string }> = [
    { key: "departmentClearance", label: "Department Clearance" },
    { key: "assetClearance", label: "Asset Clearance" },
    { key: "financeClearance", label: "Finance Clearance" },
    { key: "hrClearance", label: "HR Clearance" },
  ];

  return (
    <div className="space-y-3 rounded-[10px] border border-[#e3e9f1] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[#223754]">{SEPARATION_TYPE_LABELS[exitProcess.separationType]}</span>
        <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[10px] font-semibold ${exitProcess.status === "COMPLETED" ? "bg-[#e7f7ee] text-[#15925f]" : "bg-[#fff3e0] text-[#c2740d]"}`}>
          {exitProcess.status === "COMPLETED" ? "Completed" : "In Progress"}
        </span>
      </div>
      {exitProcess.noticeStartDate ? <p className="text-[11px] text-[#8592a5]">Notice start: {formatDate(exitProcess.noticeStartDate)}</p> : null}
      {exitProcess.lastWorkingDate ? <p className="text-[11px] text-[#8592a5]">Last working date: {formatDate(exitProcess.lastWorkingDate)}</p> : null}

      <div className="space-y-1.5">
        {clearanceItems.map((item) => (
          <label key={item.key} className="flex items-center gap-2 text-[12px] text-[#4a5b73]">
            <input type="checkbox" checked={exitProcess[item.key]} onChange={() => onToggleClearance(item.key)} className="h-4 w-4 rounded border-[#c5d1dd] text-[#2f67e8]" />
            {item.label}
          </label>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Final Settlement Amount</label>
        <Input className="h-9 rounded-[8px] text-[13px]" money value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Exit Interview Notes</label>
        <textarea className="min-h-[70px] w-full rounded-[8px] border border-border bg-white px-3 py-2 text-[13px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onSaveSettlement(String(amount), notes)} disabled={saving} className="h-9 flex-1 rounded-[8px] bg-[#2f67e8] text-[12px] text-white hover:bg-[#2459ce]">
          Save
        </Button>
        {exitProcess.status !== "COMPLETED" ? (
          <Button onClick={onMarkCompleted} disabled={saving} variant="outline" className="h-9 flex-1 rounded-[8px] text-[12px]">
            Mark Completed
          </Button>
        ) : null}
      </div>
      {exitProcess.finalSettlementAmount ? <p className="text-[11px] text-[#8592a5]">Current settlement: {formatCurrency(Number(exitProcess.finalSettlementAmount))}</p> : null}
    </div>
  );
}

const ONBOARDING_ITEMS: Array<{ key: "documentsCollected" | "joiningFormSubmitted" | "idCardIssued" | "emailAccountCreated" | "accessGranted" | "deviceAllocated" | "workspaceAllocated"; label: string }> = [
  { key: "documentsCollected", label: "Documents Collected" },
  { key: "joiningFormSubmitted", label: "Joining Form Submitted" },
  { key: "idCardIssued", label: "ID Card Issued" },
  { key: "emailAccountCreated", label: "Email Account Created" },
  { key: "accessGranted", label: "Access Granted" },
  { key: "deviceAllocated", label: "Device Allocated" },
  { key: "workspaceAllocated", label: "Workspace Allocated" },
];

function OnboardingPanel({ employeeId }: { employeeId: string }) {
  const checklistQuery = useOnboardingChecklistQuery(employeeId);
  const updateMutation = useUpdateOnboardingChecklistMutation();
  const checklist = checklistQuery.data;

  if (!checklist) {
    return <p className="text-[11px] text-[#8592a5]">Loading...</p>;
  }

  return <OnboardingChecklistForm employeeId={employeeId} checklist={checklist} updateMutation={updateMutation} />;
}

function OnboardingChecklistForm({
  employeeId,
  checklist,
  updateMutation,
}: {
  employeeId: string;
  checklist: NonNullable<ReturnType<typeof useOnboardingChecklistQuery>["data"]>;
  updateMutation: ReturnType<typeof useUpdateOnboardingChecklistMutation>;
}) {
  const [probationReviewDate, setProbationReviewDate] = useState(checklist.probationReviewDate?.slice(0, 10) ?? "");
  const [probationReviewNotes, setProbationReviewNotes] = useState(checklist.probationReviewNotes ?? "");

  async function toggleItem(key: (typeof ONBOARDING_ITEMS)[number]["key"]) {
    try {
      await updateMutation.mutateAsync({ employeeId, input: { [key]: !checklist[key] } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update onboarding.");
    }
  }

  async function handleSaveProbationReview() {
    try {
      await updateMutation.mutateAsync({
        employeeId,
        input: { probationReviewDate: probationReviewDate || undefined, probationReviewNotes: probationReviewNotes.trim() || undefined },
      });
      toast.success("Probation review saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the probation review.");
    }
  }

  async function toggleConfirmed() {
    try {
      await updateMutation.mutateAsync({ employeeId, input: { confirmed: !checklist.confirmedAt } });
      toast.success(checklist.confirmedAt ? "Confirmation reverted." : "Employee confirmed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update confirmation.");
    }
  }

  return (
    <div className="space-y-2">
      {ONBOARDING_ITEMS.map((item) => (
        <label key={item.key} className="flex items-center gap-2 text-[12px] text-[#4a5b73]">
          <input type="checkbox" checked={checklist[item.key]} onChange={() => void toggleItem(item.key)} className="h-4 w-4 rounded border-[#c5d1dd] text-[#2f67e8]" />
          {item.label}
        </label>
      ))}

      <div className="mt-3 border-t border-[#eef1f6] pt-3">
        <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Probation Review Date</label>
        <AppDateInput className="h-8 rounded-[7px] text-[12px]" value={probationReviewDate} onChange={setProbationReviewDate} />
        <label className="mb-1 mt-2 block text-[11px] font-medium text-[#5b6b83]">Probation Review Notes</label>
        <Input className="h-8 rounded-[7px] text-[12px]" value={probationReviewNotes} onChange={(e) => setProbationReviewNotes(e.target.value)} />
        <Button onClick={() => void handleSaveProbationReview()} disabled={updateMutation.isPending} className="mt-2 h-8 w-full rounded-[7px] bg-[#2f67e8] text-[11px] text-white hover:bg-[#2459ce]">Save Review</Button>
        {checklist.probationReviewDate ? <p className="mt-1 text-[10px] text-[#8592a5]">Last reviewed: {formatDate(checklist.probationReviewDate)}</p> : null}
      </div>

      <div className="border-t border-[#eef1f6] pt-3">
        <Button onClick={() => void toggleConfirmed()} disabled={updateMutation.isPending} variant={checklist.confirmedAt ? "outline" : "default"} className={checklist.confirmedAt ? "h-8 w-full rounded-[7px] text-[11px]" : "h-8 w-full rounded-[7px] bg-[#1f8a4d] text-[11px] text-white hover:bg-[#176b3b]"}>
          {checklist.confirmedAt ? `Confirmed on ${formatDate(checklist.confirmedAt)} — Revert` : "Confirm Employee"}
        </Button>
      </div>
    </div>
  );
}
