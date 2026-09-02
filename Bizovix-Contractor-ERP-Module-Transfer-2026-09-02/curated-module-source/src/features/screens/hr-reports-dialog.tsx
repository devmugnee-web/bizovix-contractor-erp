"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HrEmptyState } from "@/components/shared/hr-empty-state";
import { FileBarChart } from "lucide-react";
import { useAttendanceQuery, useEmployeesQuery, useLeaveBalancesQuery, usePayrollRunsQuery } from "@/hooks/use-hr-query";
import { formatCurrency, formatHoursFromMinutes } from "@/lib/format";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type HrReportKey = "Employee Directory" | "Attendance Summary" | "Employee Leave Tracker" | "Leave Balance" | "Payroll Register" | "Salary Sheet" | "Payroll Cost";

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-[#e1e7f0]">
      <table className="w-full min-w-[700px] border-collapse text-[12px]">
        <thead className="bg-[#f7f9fc] text-[#5b6b83]">
          <tr>{head.map((label, index) => <th key={label} className={`px-3 py-2 font-semibold ${index === 0 ? "text-left" : "text-right"}`}>{label}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function HrReportsDialog({ reportKey, onOpenChange }: { reportKey: HrReportKey | null; onOpenChange: (open: boolean) => void }) {
  const open = reportKey !== null;
  const employeesQuery = useEmployeesQuery(open && reportKey === "Employee Directory");
  const attendanceQuery = useAttendanceQuery(open && reportKey === "Attendance Summary");
  const leaveBalancesQuery = useLeaveBalancesQuery(open && reportKey === "Leave Balance");
  const payrollRunsQuery = usePayrollRunsQuery(open && (reportKey === "Payroll Register" || reportKey === "Salary Sheet" || reportKey === "Payroll Cost"));

  const employees = employeesQuery.data ?? [];
  const payrollRuns = payrollRunsQuery.data ?? [];
  const payslips = payrollRuns.flatMap((run) => run.payslips.map((payslip) => ({ ...payslip, periodYear: run.periodYear, periodMonth: run.periodMonth })));
  const reportIsEmpty =
    (reportKey === "Employee Directory" && employees.length === 0) ||
    (reportKey === "Attendance Summary" && (attendanceQuery.data?.length ?? 0) === 0) ||
    (reportKey === "Leave Balance" && (leaveBalancesQuery.data?.length ?? 0) === 0) ||
    ((reportKey === "Payroll Register" || reportKey === "Salary Sheet") && payslips.length === 0) ||
    (reportKey === "Payroll Cost" && payrollRuns.length === 0);

  function renderBody() {
    if (reportKey === "Employee Directory") {
      return (
        <Table head={["Employee", "Department", "Designation", "Status", "Type"]}>
          {employees.map((employee) => (
            <tr key={employee.id} className="border-t border-[#eef1f6]">
              <td className="px-3 py-2"><div className="font-medium text-[#223754]">{employee.name}</div><div className="text-[10px] text-[#8592a5]">{employee.employeeCode}</div></td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{employee.department?.name ?? "—"}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{employee.designation?.name ?? "—"}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{employee.status}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{employee.employmentType}</td>
            </tr>
          ))}
        </Table>
      );
    }
    if (reportKey === "Attendance Summary") {
      const records = attendanceQuery.data ?? [];
      const byEmployee = new Map<string, { id: string; name: string; present: number; absent: number; leave: number; late: number; overtime: number }>();
      const datesByEmployee = new Map<string, Set<string>>();
      const allDates = new Set<string>();
      for (const record of records) {
        const key = record.employee.id;
        const entry = byEmployee.get(key) ?? { id: key, name: record.employee.name, present: 0, absent: 0, leave: 0, late: 0, overtime: 0 };
        if (record.status === "PRESENT") entry.present += 1;
        if (record.status === "ABSENT") entry.absent += 1;
        if (record.status === "LEAVE") entry.leave += 1;
        if (record.lateMinutes > 0) entry.late += 1;
        entry.overtime += record.overtimeMinutes;
        byEmployee.set(key, entry);

        // Biometric-device exports only log actual check-ins — a day nobody
        // swiped never gets its own row, let alone an ABSENT one, so counting
        // just explicit ABSENT rows above showed 0 absences for every real
        // import. Any date at least one employee has a record for is a date
        // the company was tracking; an employee with no record at all for
        // that date was absent, even though no row says so directly.
        const date = record.attendanceDate.slice(0, 10);
        allDates.add(date);
        const employeeDates = datesByEmployee.get(key) ?? new Set<string>();
        employeeDates.add(date);
        datesByEmployee.set(key, employeeDates);
      }
      for (const [key, entry] of byEmployee) {
        const employeeDates = datesByEmployee.get(key) ?? new Set<string>();
        for (const date of allDates) {
          if (!employeeDates.has(date)) {
            entry.absent += 1;
          }
        }
      }
      const rows = Array.from(byEmployee.values());
      return (
        <Table head={["Employee", "Present", "Absent", "Leave", "Late Days", "Overtime (hours)"]}>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[#eef1f6]">
              <td className="px-3 py-2 font-medium text-[#223754]">{row.name}</td>
              <td className="px-3 py-2 text-right text-[#1f8a4d]">{row.present}</td>
              <td className="px-3 py-2 text-right text-[#c2410c]">{row.absent}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{row.leave}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{row.late}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{formatHoursFromMinutes(row.overtime)}</td>
            </tr>
          ))}
        </Table>
      );
    }
    if (reportKey === "Leave Balance") {
      const balances = leaveBalancesQuery.data ?? [];
      return (
        <Table head={["Employee", "Leave Type", "Allocated", "Used", "Remaining"]}>
          {balances.map((balance) => (
            <tr key={`${balance.employeeId}:${balance.leaveTypeId}`} className="border-t border-[#eef1f6]">
              <td className="px-3 py-2"><div className="font-medium text-[#223754]">{balance.employeeName}</div><div className="text-[10px] text-[#8592a5]">{balance.employeeCode}</div></td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{balance.leaveTypeName}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{balance.daysPerYear}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{balance.used}</td>
              <td className="px-3 py-2 text-right font-semibold text-[#1f8a4d]">{balance.remaining}</td>
            </tr>
          ))}
        </Table>
      );
    }
    if (reportKey === "Payroll Register") {
      return (
        <Table head={["Employee", "Period", "Gross", "Deduction", "Net Payable", "Status"]}>
          {payslips.map((payslip) => (
            <tr key={payslip.id} className="border-t border-[#eef1f6]">
              <td className="px-3 py-2 font-medium text-[#223754]">{payslip.employeeName}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{MONTH_NAMES[payslip.periodMonth - 1]} {payslip.periodYear}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{formatCurrency(Number(payslip.grossSalary))}</td>
              <td className="px-3 py-2 text-right text-[#c2410c]">-{formatCurrency(Number(payslip.totalDeduction))}</td>
              <td className="px-3 py-2 text-right font-semibold text-[#1f8a4d]">{formatCurrency(Number(payslip.netPayable))}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{payslip.paymentStatus}</td>
            </tr>
          ))}
        </Table>
      );
    }
    if (reportKey === "Salary Sheet") {
      return (
        <Table head={["Employee", "Period", "Salary Components", "Prorated Gross"]}>
          {payslips.map((payslip) => (
            <tr key={payslip.id} className="border-t border-[#eef1f6]">
              <td className="px-3 py-2 font-medium text-[#223754]">{payslip.employeeName}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{MONTH_NAMES[payslip.periodMonth - 1]} {payslip.periodYear}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">
                {payslip.components.map((component) => `${component.name}: ${formatCurrency(component.amount)}`).join(" · ")}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-[#223754]">{formatCurrency(Number(payslip.proratedGross))}</td>
            </tr>
          ))}
        </Table>
      );
    }
    if (reportKey === "Payroll Cost") {
      const byMonth = new Map<string, { label: string; gross: number; net: number; count: number }>();
      for (const run of payrollRuns) {
        const key = `${run.periodYear}-${run.periodMonth}`;
        byMonth.set(key, { label: `${MONTH_NAMES[run.periodMonth - 1]} ${run.periodYear}`, gross: Number(run.totalGross), net: Number(run.totalNetPayable), count: run.payslips.length });
      }
      const rows = Array.from(byMonth.values());
      return (
        <Table head={["Period", "Employees Paid", "Total Gross", "Total Net Payable"]}>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-[#eef1f6]">
              <td className="px-3 py-2 font-medium text-[#223754]">{row.label}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{row.count}</td>
              <td className="px-3 py-2 text-right text-[#4a5b73]">{formatCurrency(row.gross)}</td>
              <td className="px-3 py-2 text-right font-semibold text-[#1f8a4d]">{formatCurrency(row.net)}</td>
            </tr>
          ))}
        </Table>
      );
    }
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1080px)] max-h-[90vh] overflow-y-auto rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">{reportKey}</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-[#77869c]">
            {reportKey === "Employee Directory" ? `${employees.length} employees` : reportKey === "Payroll Register" || reportKey === "Salary Sheet" ? `${payslips.length} payslip rows across all payroll runs` : "Generated from live HR data."}
          </DialogDescription>
        </div>
        <div className="px-5 py-4">{reportIsEmpty ? <HrEmptyState icon={FileBarChart} title={`No ${reportKey?.toLowerCase()} data yet`} description="Records will appear here after the related HR activity is completed." /> : renderBody()}</div>
        <div className="flex justify-end border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
