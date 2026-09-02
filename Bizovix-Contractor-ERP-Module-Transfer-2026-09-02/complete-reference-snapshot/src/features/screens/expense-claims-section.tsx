"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { HrEmptyState } from "@/components/shared/hr-empty-state";
import { Receipt, Trash2 } from "lucide-react";
import {
  useApproveExpenseClaimMutation,
  useCreateExpenseClaimMutation,
  useDeleteExpenseClaimMutation,
  useEmployeesQuery,
  useExpenseClaimsQuery,
  useMarkExpenseReimbursedMutation,
  useRejectExpenseClaimMutation,
} from "@/hooks/use-hr-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ExpenseCategory, ExpenseClaimRecord } from "@/types/hr";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  TRAVEL: "Travel",
  MEAL: "Meal",
  TRANSPORTATION: "Transportation",
  ACCOMMODATION: "Accommodation",
  OTHER: "Other",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function NewExpenseClaimDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const employeesQuery = useEmployeesQuery(open);
  const createMutation = useCreateExpenseClaimMutation();
  const [employeeId, setEmployeeId] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("TRAVEL");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [description, setDescription] = useState("");

  async function handleSubmit() {
    if (!employeeId) {
      toast.error("Select an employee.");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    try {
      await createMutation.mutateAsync({ employeeId, category, amount: Number(amount), expenseDate, description: description.trim() || undefined });
      toast.success("Expense claim submitted.");
      setEmployeeId("");
      setAmount("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit this expense claim.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,520px)] rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">New Expense Claim</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-[#77869c]">Submit an expense for approval and reimbursement.</DialogDescription>
        </div>
        <div className="space-y-3 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Employee</label>
            <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select employee...</option>
              {(employeesQuery.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.employeeCode})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Category</label>
              <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Amount</label>
              <Input className="h-9 rounded-[8px] text-[13px]" money value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Expense Date</label>
            <AppDateInput className="h-9 rounded-[8px] text-[13px]" value={expenseDate} onChange={setExpenseDate} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Description</label>
            <Input className="h-9 rounded-[8px] text-[13px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={createMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">
            {createMutation.isPending ? "Submitting..." : "Submit Claim"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseClaimsSection({ addOpen, onAddOpenChange }: { addOpen: boolean; onAddOpenChange: (open: boolean) => void }) {
  const claimsQuery = useExpenseClaimsQuery(true);
  const approveMutation = useApproveExpenseClaimMutation();
  const rejectMutation = useRejectExpenseClaimMutation();
  const reimbursedMutation = useMarkExpenseReimbursedMutation();
  const deleteMutation = useDeleteExpenseClaimMutation();
  const [deleteTarget, setDeleteTarget] = useState<ExpenseClaimRecord | null>(null);

  const claims = claimsQuery.data ?? [];

  async function handleApprove(id: string) {
    try {
      await approveMutation.mutateAsync(id);
      toast.success("Expense claim approved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve this claim.");
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectMutation.mutateAsync({ expenseClaimId: id });
      toast.success("Expense claim rejected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reject this claim.");
    }
  }

  async function handleReimburse(id: string) {
    try {
      await reimbursedMutation.mutateAsync(id);
      toast.success("Marked as reimbursed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this claim.");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success("Expense claim deleted.");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this claim.");
    }
  }

  return (
    <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white lg:m-5">
      {claims.length === 0 ? (
        <HrEmptyState icon={Receipt} title="No expense claims yet" description="Submit the first expense claim to see it here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-[12px]">
            <thead className="bg-[#f7f9fc] text-[#5b6b83]">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Employee</th>
                <th className="px-4 py-2.5 text-left font-semibold">Category</th>
                <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="border-t border-[#eef1f6]">
                  <td className="px-4 py-2.5"><div className="font-medium text-[#223754]">{claim.employee.name}</div><div className="text-[10px] text-[#8592a5]">{claim.employee.employeeCode}</div></td>
                  <td className="px-4 py-2.5 text-[#4a5b73]">{CATEGORY_LABELS[claim.category]}</td>
                  <td className="px-4 py-2.5 text-[#4a5b73]">{formatDate(claim.expenseDate)}</td>
                  <td className="px-4 py-2.5 text-right text-[#223754]">{formatCurrency(Number(claim.amount))}</td>
                  <td className="px-4 py-2.5 text-[#4a5b73]">{claim.description ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      title={claim.status === "REJECTED" ? claim.decisionNote ?? undefined : claim.status === "REIMBURSED" && claim.reimbursedAt ? `Reimbursed ${formatDate(claim.reimbursedAt)}` : undefined}
                      className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[10px] font-semibold",
                      claim.status === "REIMBURSED" ? "bg-[#e7f7ee] text-[#15925f]" : claim.status === "APPROVED" ? "bg-[#eef4ff] text-[#255fcf]" : claim.status === "REJECTED" ? "bg-[#fdecec] text-[#c2410c]" : "bg-[#fff3e0] text-[#b96b09]")}>
                      {claim.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {claim.status === "PENDING" ? (
                        <>
                          <Button onClick={() => void handleApprove(claim.id)} className="h-7 rounded-[7px] bg-[#2f67e8] px-2.5 text-[11px] text-white hover:bg-[#2459ce]">Approve</Button>
                          <Button variant="outline" onClick={() => void handleReject(claim.id)} className="h-7 rounded-[7px] px-2.5 text-[11px]">Reject</Button>
                        </>
                      ) : claim.status === "APPROVED" ? (
                        <Button onClick={() => void handleReimburse(claim.id)} className="h-7 rounded-[7px] bg-[#1f8a4d] px-2.5 text-[11px] text-white hover:bg-[#176b3b]">Mark Reimbursed</Button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(claim)}
                        aria-label="Delete expense claim"
                        className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#8592a5] hover:bg-[#fdecec] hover:text-[#c2410c]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewExpenseClaimDialog open={addOpen} onOpenChange={onAddOpenChange} />

      <ConfirmationDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete expense claim?"
        description={deleteTarget ? `${CATEGORY_LABELS[deleteTarget.category]} claim of ${formatCurrency(Number(deleteTarget.amount))} for ${deleteTarget.employee.name} will be permanently removed.` : "Please confirm this action."}
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        tone="danger"
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
