"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import { HrEmptyState } from "@/components/shared/hr-empty-state";
import { HandCoins } from "lucide-react";
import {
  useApproveEmployeeLoanMutation,
  useCreateEmployeeLoanMutation,
  useCreateLoanRepaymentMutation,
  useDisburseEmployeeLoanMutation,
  useEmployeeLoansQuery,
  useEmployeesQuery,
  useRejectEmployeeLoanMutation,
} from "@/hooks/use-hr-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EmployeeLoanRecord, EmployeeLoanType } from "@/types/hr";

const LOAN_TYPE_LABELS: Record<EmployeeLoanType, string> = {
  LOAN: "Loan",
  SALARY_ADVANCE: "Salary Advance",
  EXPENSE_ADVANCE: "Expense Advance",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function NewLoanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const employeesQuery = useEmployeesQuery(open);
  const createMutation = useCreateEmployeeLoanMutation();
  const [employeeId, setEmployeeId] = useState("");
  const [loanType, setLoanType] = useState<EmployeeLoanType>("LOAN");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [applicationDate, setApplicationDate] = useState(todayIso());
  const [reason, setReason] = useState("");

  async function handleSubmit() {
    if (!employeeId) {
      toast.error("Select an employee.");
      return;
    }
    if (!principalAmount || Number(principalAmount) <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }
    try {
      await createMutation.mutateAsync({ employeeId, loanType, principalAmount: Number(principalAmount), applicationDate, reason: reason.trim() || undefined });
      toast.success("Loan application submitted.");
      setEmployeeId("");
      setPrincipalAmount("");
      setReason("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit this application.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,520px)] rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">New Loan / Advance</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-[#77869c]">Apply on behalf of an employee for approval.</DialogDescription>
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
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Type</label>
              <select className="h-9 w-full rounded-[8px] border border-border bg-white px-3 text-[13px]" value={loanType} onChange={(e) => setLoanType(e.target.value as EmployeeLoanType)}>
                {Object.entries(LOAN_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Amount</label>
              <Input className="h-9 rounded-[8px] text-[13px]" money value={principalAmount} onChange={(e) => setPrincipalAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Application Date</label>
            <AppDateInput className="h-9 rounded-[8px] text-[13px]" value={applicationDate} onChange={setApplicationDate} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Reason</label>
            <Input className="h-9 rounded-[8px] text-[13px]" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={createMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">
            {createMutation.isPending ? "Submitting..." : "Submit Application"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RepaymentRow({ loan }: { loan: EmployeeLoanRecord }) {
  const createRepaymentMutation = useCreateLoanRepaymentMutation();
  const [amount, setAmount] = useState("");

  async function handleAdd() {
    if (!amount || Number(amount) <= 0) {
      toast.error("Repayment amount must be greater than zero.");
      return;
    }
    try {
      await createRepaymentMutation.mutateAsync({ loanId: loan.id, input: { amount: Number(amount), paidDate: todayIso() } });
      setAmount("");
      toast.success("Repayment recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record this repayment.");
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Input className="h-7 w-24 rounded-[6px] text-right text-[11px]" money value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Repay" />
      <Button onClick={() => void handleAdd()} disabled={createRepaymentMutation.isPending} className="h-7 rounded-[7px] bg-[#2f67e8] px-2.5 text-[11px] text-white hover:bg-[#2459ce]">Record</Button>
    </div>
  );
}

export function EmployeeLoansSection({ addOpen, onAddOpenChange }: { addOpen: boolean; onAddOpenChange: (open: boolean) => void }) {
  const loansQuery = useEmployeeLoansQuery(true);
  const approveMutation = useApproveEmployeeLoanMutation();
  const rejectMutation = useRejectEmployeeLoanMutation();
  const disburseMutation = useDisburseEmployeeLoanMutation();

  const loans = loansQuery.data ?? [];

  async function handleApprove(id: string) {
    try {
      await approveMutation.mutateAsync(id);
      toast.success("Loan approved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve this loan.");
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectMutation.mutateAsync(id);
      toast.success("Loan rejected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reject this loan.");
    }
  }

  async function handleDisburse(id: string) {
    try {
      await disburseMutation.mutateAsync(id);
      toast.success("Loan marked as disbursed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this loan.");
    }
  }

  return (
    <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white lg:m-5">
      {loans.length === 0 ? (
        <HrEmptyState icon={HandCoins} title="No loans or advances yet" description="Submit the first application to see it here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-[12px]">
            <thead className="bg-[#f7f9fc] text-[#5b6b83]">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Employee</th>
                <th className="px-4 py-2.5 text-left font-semibold">Type</th>
                <th className="px-4 py-2.5 text-left font-semibold">Applied</th>
                <th className="px-4 py-2.5 text-right font-semibold">Principal</th>
                <th className="px-4 py-2.5 text-right font-semibold">Repaid</th>
                <th className="px-4 py-2.5 text-right font-semibold">Remaining</th>
                <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id} className="border-t border-[#eef1f6]">
                  <td className="px-4 py-2.5"><div className="font-medium text-[#223754]">{loan.employee.name}</div><div className="text-[10px] text-[#8592a5]">{loan.employee.employeeCode}</div></td>
                  <td className="px-4 py-2.5 text-[#4a5b73]" title={loan.reason ?? undefined}>{LOAN_TYPE_LABELS[loan.loanType]}</td>
                  <td className="px-4 py-2.5 text-[#4a5b73]">{formatDate(loan.applicationDate)}</td>
                  <td className="px-4 py-2.5 text-right text-[#223754]">{formatCurrency(Number(loan.principalAmount))}</td>
                  <td className="px-4 py-2.5 text-right text-[#1f8a4d]">{formatCurrency(loan.totalRepaid)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[#223754]">{formatCurrency(loan.remainingBalance)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[10px] font-semibold",
                      loan.status === "SETTLED" ? "bg-[#e7f7ee] text-[#15925f]" : loan.status === "DISBURSED" ? "bg-[#eef4ff] text-[#255fcf]" : loan.status === "REJECTED" ? "bg-[#fdecec] text-[#c2410c]" : loan.status === "APPROVED" ? "bg-[#f5f0ff] text-[#7355d9]" : "bg-[#fff3e0] text-[#b96b09]")}>
                      {loan.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {loan.status === "PENDING" ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button onClick={() => void handleApprove(loan.id)} className="h-7 rounded-[7px] bg-[#2f67e8] px-2.5 text-[11px] text-white hover:bg-[#2459ce]">Approve</Button>
                        <Button variant="outline" onClick={() => void handleReject(loan.id)} className="h-7 rounded-[7px] px-2.5 text-[11px]">Reject</Button>
                      </div>
                    ) : loan.status === "APPROVED" ? (
                      <Button onClick={() => void handleDisburse(loan.id)} className="h-7 rounded-[7px] bg-[#1f8a4d] px-2.5 text-[11px] text-white hover:bg-[#176b3b]">Disburse</Button>
                    ) : loan.status === "DISBURSED" ? (
                      <RepaymentRow loan={loan} />
                    ) : (
                      <span className="text-[11px] text-[#a1adbd]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewLoanDialog open={addOpen} onOpenChange={onAddOpenChange} />
    </div>
  );
}
