"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProvidentFundSummaryQuery } from "@/hooks/use-hr-query";
import { formatCurrency } from "@/lib/format";
import { sumMoney } from "@/lib/money";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function ProvidentFundDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: rows = [], isLoading } = useProvidentFundSummaryQuery(open);
  const grandTotal = sumMoney(rows.map((row) => row.totalDeposited));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1080px)] max-h-[90vh] overflow-y-auto rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">Provident Fund Report</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-[#77869c]">
            Company-wise, employee-wise Provident Fund rate and accumulated balance from approved payroll runs.
          </DialogDescription>
        </div>

        <div className="px-5 py-4">
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-[10px] border border-[#dbe6fb] bg-[#f5f9ff] p-3 text-[12px] sm:max-w-md">
            <div><span className="text-[#7b8aa1]">Employees on PF</span><div className="font-semibold text-[#223754]">{rows.filter((row) => row.pfRate !== null).length}</div></div>
            <div><span className="text-[#7b8aa1]">Total Deposited</span><div className="font-semibold text-[#1f8a4d]">{formatCurrency(grandTotal)}</div></div>
          </div>

          <div className="overflow-x-auto rounded-[12px] border border-[#e1e7f0]">
            <table className="w-full min-w-[1040px] border-collapse text-[12px]">
              <thead className="bg-[#f7f9fc] text-[#5b6b83]">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Employee Name</th>
                  <th className="px-3 py-2 text-left font-semibold">Company</th>
                  <th className="px-3 py-2 text-left font-semibold">Department</th>
                  <th className="px-3 py-2 text-left font-semibold">Designation</th>
                  <th className="px-3 py-2 text-right font-semibold">PF Contribution</th>
                  <th className="px-3 py-2 text-right font-semibold">Company Contribution</th>
                  <th className="px-3 py-2 text-right font-semibold">Total Deposited</th>
                  <th className="px-3 py-2 text-left font-semibold">Last Contribution</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-[#8592a5]">Loading...</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-[#8592a5]">No employees found.</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.employeeId} className="border-t border-[#eef1f6]">
                      <td className="px-3 py-2">
                        <div className="font-medium text-[#223754]">{row.employeeName}</div>
                        <div className="text-[10px] text-[#8592a5]">{row.employeeCode}{row.pfRate !== null ? ` · ${row.pfRate}% rate` : ""}</div>
                      </td>
                      <td className="px-3 py-2 text-[#4a5b73]">{row.companyName ?? "—"}</td>
                      <td className="px-3 py-2 text-[#4a5b73]">{row.department ?? "—"}</td>
                      <td className="px-3 py-2 text-[#4a5b73]">{row.designation ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-[#4a5b73]">{formatCurrency(row.employeeContribution)}</td>
                      <td className="px-3 py-2 text-right text-[#4a5b73]">{formatCurrency(row.companyContribution)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[#1f8a4d]">{formatCurrency(row.totalDeposited)}</td>
                      <td className="px-3 py-2 text-[#4a5b73]">
                        {row.lastContribution ? `${MONTH_NAMES[row.lastContribution.periodMonth - 1]} ${row.lastContribution.periodYear}` : "—"}
                      </td>
                    </tr>
                  ))
                )}
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
