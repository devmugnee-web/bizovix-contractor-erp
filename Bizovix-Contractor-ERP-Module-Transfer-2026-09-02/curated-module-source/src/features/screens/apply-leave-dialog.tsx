"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import { useCreateLeaveRequestMutation, useCreateLeaveTypeMutation, useLeaveBalancesQuery, useLeaveTypesQuery } from "@/hooks/use-hr-query";
import type { EmployeeRecord, LeaveTypeRecord } from "@/types/hr";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inclusiveDays(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

const selectClass = "h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px] text-foreground";
const fieldLabel = "mb-1.5 block text-[11px] font-medium text-[#5b6b83]";

function LeaveTypeField({
  value,
  options,
  onChange,
  onCreate,
  creating,
}: {
  value: string;
  options: LeaveTypeRecord[];
  onChange: (id: string) => void;
  onCreate: (name: string, daysPerYear: number) => Promise<{ id: string } | null>;
  creating: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDays, setDraftDays] = useState("");

  async function confirmAdd() {
    const name = draftName.trim();
    const days = Number(draftDays);
    if (!name) {
      toast.error("Leave type name is required.");
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      toast.error("Days per year must be greater than zero.");
      return;
    }
    const created = await onCreate(name, days);
    if (created) {
      onChange(created.id);
      setDraftName("");
      setDraftDays("");
      setAdding(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-[11px] font-medium text-[#5b6b83]">Leave Type</label>
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#2f67e8] hover:underline">
          <Plus className="h-3 w-3" /> New
        </button>
      </div>
      {adding ? (
        <div className="flex items-center gap-1.5">
          <Input autoFocus className="h-9 flex-1 rounded-[8px] text-[13px]" placeholder="Name" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          <Input className="h-9 w-20 rounded-[8px] text-[13px]" type="number" min={0} step="0.5" placeholder="Days" value={draftDays} onChange={(event) => setDraftDays(event.target.value)} />
          <button
            type="button"
            onClick={() => void confirmAdd()}
            disabled={creating}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#2f67e8] text-white hover:bg-[#2459ce] disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setDraftName(""); setDraftDays(""); }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#d7e0ec] text-[#5b6b83] hover:bg-[#f5f7fb]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">— Select —</option>
          {options.map((leaveType) => (
            <option key={leaveType.id} value={leaveType.id}>{leaveType.name} ({leaveType.daysPerYear} days/yr)</option>
          ))}
        </select>
      )}
    </div>
  );
}

export function ApplyLeaveDialog({
  open,
  onOpenChange,
  employees,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeRecord[];
}) {
  const leaveTypesQuery = useLeaveTypesQuery(open);
  const balancesQuery = useLeaveBalancesQuery(open);
  const createMutation = useCreateLeaveRequestMutation();
  const createLeaveTypeMutation = useCreateLeaveTypeMutation();

  async function createLeaveType(name: string, daysPerYear: number) {
    try {
      return await createLeaveTypeMutation.mutateAsync({ name, daysPerYear });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add leave type.");
      return null;
    }
  }

  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [reason, setReason] = useState("");

  const activeEmployees = useMemo(() => employees.filter((employee) => employee.status === "ACTIVE"), [employees]);
  const leaveTypes = leaveTypesQuery.data ?? [];

  useEffect(() => {
    if (open) {
      setEmployeeId(activeEmployees[0]?.id ?? "");
      setLeaveTypeId(leaveTypesQuery.data?.[0]?.id ?? "");
      setStartDate(todayIso());
      setEndDate(todayIso());
      setReason("");
    }
  }, [open]);

  const requestedDays = inclusiveDays(startDate, endDate);
  const balance = (balancesQuery.data ?? []).find((entry) => entry.employeeId === employeeId && entry.leaveTypeId === leaveTypeId);

  async function handleSubmit() {
    if (!employeeId) {
      toast.error("Select an employee.");
      return;
    }
    if (!leaveTypeId) {
      toast.error("Select a leave type.");
      return;
    }
    if (requestedDays <= 0) {
      toast.error("End date must be on or after the start date.");
      return;
    }
    try {
      await createMutation.mutateAsync({ employeeId, leaveTypeId, startDate, endDate, reason: reason.trim() || undefined });
      toast.success("Leave request submitted.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit this leave request.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,600px)] rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">New Leave Request</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-[#77869c]">Apply for leave against an employee&apos;s remaining balance.</DialogDescription>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Employee</label>
              <select className={selectClass} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                <option value="">— Select —</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>
            </div>
            <LeaveTypeField
              value={leaveTypeId}
              options={leaveTypes}
              onChange={setLeaveTypeId}
              onCreate={createLeaveType}
              creating={createLeaveTypeMutation.isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Start Date</label>
              <AppDateInput className="h-9 rounded-[8px] text-[13px]" value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <label className={fieldLabel}>End Date</label>
              <AppDateInput className="h-9 rounded-[8px] text-[13px]" value={endDate} onChange={setEndDate} />
            </div>
          </div>

          <div>
            <label className={fieldLabel}>Reason</label>
            <Input className="h-9 rounded-[8px] text-[13px]" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional" />
          </div>

          <div className={`grid grid-cols-3 gap-2 rounded-[10px] border p-3 text-[12px] ${balance && requestedDays > balance.remaining ? "border-[#f3c1a8] bg-[#fff6f1]" : "border-[#dbe6fb] bg-[#f5f9ff]"}`}>
            <div><span className="text-[#7b8aa1]">Requested</span><div className="font-semibold text-[#223754]">{requestedDays} day{requestedDays === 1 ? "" : "s"}</div></div>
            <div><span className="text-[#7b8aa1]">Allocated</span><div className="font-semibold text-[#223754]">{balance ? `${balance.daysPerYear} days` : "—"}</div></div>
            <div><span className="text-[#7b8aa1]">Remaining</span><div className="font-semibold text-[#1f8a4d]">{balance ? `${balance.remaining} days` : "—"}</div></div>
            {balance && requestedDays > balance.remaining ? (
              <p className="col-span-3 text-[11px] font-medium text-[#c2410c]">This exceeds the remaining balance — the request will be rejected by the server.</p>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={createMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">
            {createMutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
