"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateLeaveTypeMutation, useDeleteLeaveTypeMutation, useLeaveTypesQuery } from "@/hooks/use-hr-query";

export function LeaveTypeManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const leaveTypesQuery = useLeaveTypesQuery(open);
  const createMutation = useCreateLeaveTypeMutation();
  const deleteMutation = useDeleteLeaveTypeMutation();
  const [name, setName] = useState("");
  const [daysPerYear, setDaysPerYear] = useState("");

  async function addLeaveType() {
    const trimmedName = name.trim();
    const days = Number(daysPerYear);
    if (!trimmedName) {
      toast.error("Leave type name is required.");
      return;
    }
    if (!Number.isFinite(days) || days <= 0) {
      toast.error("Days per year must be greater than zero.");
      return;
    }
    try {
      await createMutation.mutateAsync({ name: trimmedName, daysPerYear: days });
      setName("");
      setDaysPerYear("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add leave type.");
    }
  }

  async function removeLeaveType(id: string) {
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete leave type.");
    }
  }

  const leaveTypes = leaveTypesQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,560px)] rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">Leave Types</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-[#77869c]">
            Each type grants every active employee this many days per calendar year.
          </DialogDescription>
        </div>
        <div className="px-5 py-5">
          <div className="mb-3 flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Name</label>
              <Input className="h-9 rounded-[8px] text-[13px]" placeholder="e.g. Casual Leave" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="w-28">
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Days / Year</label>
              <Input className="h-9 rounded-[8px] text-[13px]" type="number" min={0} value={daysPerYear} onChange={(event) => setDaysPerYear(event.target.value)} />
            </div>
            <Button onClick={() => void addLeaveType()} disabled={createMutation.isPending} className="h-9 shrink-0 rounded-[8px] bg-[#2f67e8] px-3 text-white hover:bg-[#2459ce]">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[320px] overflow-y-auto rounded-[10px] border border-[#e3e9f1]">
            {leaveTypes.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-[#8592a5]">No leave types yet.</p>
            ) : (
              <ul className="divide-y divide-[#eef1f6]">
                {leaveTypes.map((leaveType) => (
                  <li key={leaveType.id} className="flex items-center justify-between px-3 py-2 text-[13px] text-[#223754]">
                    <span>{leaveType.name}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-[11px] text-[#8592a5]">{leaveType.daysPerYear} days/year</span>
                      <button
                        type="button"
                        onClick={() => void removeLeaveType(leaveType.id)}
                        disabled={deleteMutation.isPending}
                        className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#8592a5] hover:bg-[#fdecec] hover:text-[#c2410c]"
                        aria-label={`Delete ${leaveType.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex justify-end border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
