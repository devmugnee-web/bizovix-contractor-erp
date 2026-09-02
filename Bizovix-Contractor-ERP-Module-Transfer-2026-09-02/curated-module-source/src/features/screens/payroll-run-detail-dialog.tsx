"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useApprovePayrollRunMutation, useMarkPayslipPaidMutation } from "@/hooks/use-hr-query";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PayrollRunRecord } from "@/types/hr";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function paymentMethodLabel(method: string) {
  if (method === "BANK") return "Bank";
  if (method === "MFS") return "MFS";
  return "Cash";
}

export function PayrollRunDetailDialog({
  open,
  onOpenChange,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: PayrollRunRecord | null;
}) {
  const approveMutation = useApprovePayrollRunMutation();
  const markPaidMutation = useMarkPayslipPaidMutation();

  if (!run) return null;

  async function handleApprove() {
    try {
      await approveMutation.mutateAsync(run!.id);
      toast.success("Payroll run approved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve this payroll run.");
    }
  }

  async function handleMarkPaid(payslipId: string, employeeName: string) {
    try {
      await markPaidMutation.mutateAsync(payslipId);
      toast.success(`${employeeName} marked as paid.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record this payment.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1080px)] max-h-[90vh] overflow-y-auto rounded-[16px] p-0">
        <div className="flex items-center justify-between border-b border-[#e1e7f0] px-5 py-4">
          <div>
            <DialogTitle className="text-[18px] font-semibold text-[#203553]">
              Payroll — {MONTH_NAMES[run.periodMonth - 1]} {run.periodYear}
            </DialogTitle>
            <DialogDescription className="mt-1 text-[12px] text-[#77869c]">
              {run.totalWorkingDays} working days · {run.payslips.length} employee{run.payslips.length === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          {run.status === "DRAFT" ? (
            <Button onClick={handleApprove} disabled={approveMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">
              {approveMutation.isPending ? "Approving..." : "Approve Payroll"}
            </Button>
          ) : (
            <span className={`inline-flex h-8 items-center rounded-full px-3 text-[11px] font-semibold ${run.status === "PAID" ? "bg-[#e7f7ee] text-[#15925f]" : "bg-[#eef4ff] text-[#255fcf]"}`}>
              {run.status === "PAID" ? "Fully Paid" : "Approved"}
            </span>
          )}
        </div>

        <div className="px-5 py-4">
          <div className="mb-4 grid grid-cols-3 gap-3 rounded-[10px] border border-[#dbe6fb] bg-[#f5f9ff] p-3 text-[12px] sm:max-w-lg">
            <div><span className="text-[#7b8aa1]">Total Gross</span><div className="font-semibold text-[#223754]">{formatCurrency(Number(run.totalGross))}</div></div>
            <div><span className="text-[#7b8aa1]">Total Deduction</span><div className="font-semibold text-[#223754]">{formatCurrency(Number(run.totalDeduction))}</div></div>
            <div><span className="text-[#7b8aa1]">Total Net Payable</span><div className={cn("font-semibold", Number(run.totalNetPayable) < 0 ? "text-[#e11d2f]" : "text-[#1f8a4d]")}>{formatCurrency(Number(run.totalNetPayable))}</div></div>
          </div>

          <div className="overflow-x-auto rounded-[12px] border border-[#e1e7f0]">
            <table className="w-full min-w-[900px] border-collapse text-[12px]">
              <thead className="bg-[#f7f9fc] text-[#5b6b83]">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Employee</th>
                  <th className="px-3 py-2 text-left font-semibold">Salary Components</th>
                  <th className="px-3 py-2 text-right font-semibold">Deduction</th>
                  <th className="px-3 py-2 text-right font-semibold">Net Payable</th>
                  <th className="px-3 py-2 text-center font-semibold">Pay Via</th>
                  <th className="px-3 py-2 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {run.payslips.map((payslip) => (
                  <tr key={payslip.id} className="border-t border-[#eef1f6]">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[#223754]">{payslip.employeeName}</div>
                      <div className="text-[10px] text-[#8592a5]">{payslip.employeeCode} · {payslip.presentDays}/{payslip.totalWorkingDays} days</div>
                    </td>
                    <td className="px-3 py-2 text-[#4a5b73]">
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {payslip.components.map((component) => (
                          <span key={component.name} className="whitespace-nowrap text-[11px]">
                            {component.name}: <span className="font-medium text-[#223754]">{formatCurrency(component.amount)}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-[#c2410c]">-{formatCurrency(Number(payslip.totalDeduction))}</td>
                    <td className={cn("px-3 py-2 text-right font-semibold", Number(payslip.netPayable) < 0 ? "text-[#e11d2f]" : "text-[#1f8a4d]")}>{formatCurrency(Number(payslip.netPayable))}</td>
                    <td className="px-3 py-2 text-center text-[#4a5b73]">{paymentMethodLabel(payslip.paymentMethod)}</td>
                    <td className="px-3 py-2 text-center">
                      {payslip.paymentStatus === "PAID" ? (
                        <span className="inline-flex h-7 items-center rounded-full bg-[#e7f7ee] px-3 text-[11px] font-semibold text-[#15925f]">Paid</span>
                      ) : run.status === "APPROVED" ? (
                        <Button
                          variant="outline"
                          onClick={() => handleMarkPaid(payslip.id, payslip.employeeName)}
                          disabled={markPaidMutation.isPending}
                          className="h-7 rounded-[7px] px-2.5 text-[11px]"
                        >
                          Mark Paid
                        </Button>
                      ) : (
                        <span className="text-[11px] text-[#a1adbd]">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
