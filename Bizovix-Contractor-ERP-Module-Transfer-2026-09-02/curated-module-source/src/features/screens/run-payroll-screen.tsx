"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAttendanceQuery, useCalculatePayrollMutation, useEmployeesQuery, usePayrollRunsQuery, useShiftsQuery } from "@/hooks/use-hr-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { moneyToMinorUnits, roundMoney, sumMoney } from "@/lib/money";
import { openPrintWindow, printWindowWhenReady } from "@/lib/print";
import { cn } from "@/lib/utils";
import type { EmployeeRecord } from "@/types/hr";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

interface RowState {
  presentDays: string;
  iouDeduction: string;
  loanDeduction: string;
  fineDeduction: string;
  lunchBillDeduction: string;
}

function emptyRow(totalWorkingDays: string): RowState {
  return {
    presentDays: totalWorkingDays,
    iouDeduction: "0",
    loanDeduction: "0",
    fineDeduction: "0",
    lunchBillDeduction: "0",
  };
}

function daysInMonth(year: string, month: string) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) return "30";
  return String(new Date(numericYear, numericMonth, 0).getDate());
}

function basicSalary(employee: EmployeeRecord, proratedGross: number) {
  const basicComponent = employee.salaryComponents.find((component) => component.name.trim().toLowerCase() === "basic");
  return roundMoney(
    basicComponent ? (proratedGross * Number(basicComponent.percent)) / 100 : proratedGross,
  );
}

export function RunPayrollScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId");

  const employeesQuery = useEmployeesQuery(true);
  const payrollRunsQuery = usePayrollRunsQuery(Boolean(runId));
  const attendanceQuery = useAttendanceQuery(!runId);
  const shiftsQuery = useShiftsQuery(!runId);
  const calculateMutation = useCalculatePayrollMutation();

  const employees = employeesQuery.data ?? [];
  const existingRun = useMemo(() => (runId ? payrollRunsQuery.data?.find((run) => run.id === runId) ?? null : null), [runId, payrollRunsQuery.data]);

  const now = new Date();
  const [periodYear, setPeriodYear] = useState(String(now.getFullYear()));
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1));
  const [totalWorkingDays, setTotalWorkingDays] = useState(String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()));
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const printReportRef = useRef<() => void>(() => undefined);

  const activeEmployees = useMemo(() => employees.filter((employee) => employee.status === "ACTIVE"), [employees]);
  const departmentOptions = useMemo(
    () => Array.from(new Set(activeEmployees.map((employee) => employee.department?.name).filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b)),
    [activeEmployees],
  );
  const visibleEmployees = useMemo(
    () => departmentFilter === "ALL" ? activeEmployees : activeEmployees.filter((employee) => employee.department?.name === departmentFilter),
    [activeEmployees, departmentFilter],
  );
  const attendanceSummary = useMemo(() => {
    const numericYear = Number(periodYear);
    const numericMonth = Number(periodMonth);
    const calendarDays = Number(daysInMonth(periodYear, periodMonth));
    const shift = (shiftsQuery.data ?? []).find((entry) => entry.isDefault) ?? shiftsQuery.data?.[0];
    const weeklyOffDays = new Set(shift?.weeklyOffDays?.length ? shift.weeklyOffDays : [5]);
    const weeklyHolidayDates = new Set<string>();
    const presentDatesByEmployee = new Map<string, Set<string>>();

    if (Number.isInteger(numericYear) && Number.isInteger(numericMonth)) {
      for (let day = 1; day <= calendarDays; day += 1) {
        const date = new Date(numericYear, numericMonth - 1, day);
        if (weeklyOffDays.has(date.getDay())) {
          weeklyHolidayDates.add(`${numericYear}-${String(numericMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
        }
      }
    }

    const periodPrefix = `${periodYear}-${periodMonth.padStart(2, "0")}`;
    for (const record of attendanceQuery.data ?? []) {
      const date = record.attendanceDate.slice(0, 10);
      if (record.status !== "PRESENT" || !date.startsWith(periodPrefix)) continue;
      const dates = presentDatesByEmployee.get(record.employee.id) ?? new Set<string>();
      dates.add(date);
      presentDatesByEmployee.set(record.employee.id, dates);
    }

    return { calendarDays, weeklyOffDays, weeklyHolidayDates, presentDatesByEmployee };
  }, [attendanceQuery.data, periodMonth, periodYear, shiftsQuery.data]);
  // Ordered by first appearance across employees (Basic first, since every
  // default salary structure lists it first) rather than a hardcoded set, so a
  // custom component name added later shows up here too instead of being
  // silently dropped from the payroll preview.
  const componentColumns = useMemo(() => {
    const names: string[] = [];
    for (const employee of activeEmployees) {
      for (const component of employee.salaryComponents) {
        if (!names.includes(component.name)) {
          names.push(component.name);
        }
      }
    }
    return names;
  }, [activeEmployees]);

  useEffect(() => {
    if (existingRun) {
      setPeriodYear(String(existingRun.periodYear));
      setPeriodMonth(String(existingRun.periodMonth));
      setTotalWorkingDays(existingRun.totalWorkingDays);
      const nextRows: Record<string, RowState> = {};
      for (const payslip of existingRun.payslips) {
        nextRows[payslip.employeeId] = {
          presentDays: payslip.presentDays,
          iouDeduction: payslip.iouDeduction,
          loanDeduction: payslip.loanDeduction,
          fineDeduction: payslip.fineDeduction,
          lunchBillDeduction: payslip.lunchBillDeduction,
        };
      }
      setRows(nextRows);
    }
  }, [existingRun]);

  useEffect(() => {
    if (existingRun) return;
    const maximumPaidDays = Number(totalWorkingDays) || attendanceSummary.calendarDays;
    setRows((current) => {
      const next = { ...current };
      for (const employee of activeEmployees) {
        const paidDates = new Set(attendanceSummary.presentDatesByEmployee.get(employee.id) ?? []);
        for (const date of attendanceSummary.weeklyHolidayDates) paidDates.add(date);
        next[employee.id] = {
          ...(current[employee.id] ?? emptyRow(totalWorkingDays)),
          presentDays: String(Math.min(paidDates.size, maximumPaidDays)),
        };
      }
      return next;
    });
  }, [activeEmployees, attendanceSummary, existingRun, totalWorkingDays]);

  function rowFor(employeeId: string): RowState {
    return rows[employeeId] ?? emptyRow(totalWorkingDays);
  }

  function updateRow(employeeId: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [employeeId]: { ...rowFor(employeeId), ...patch } }));
  }

  function updateWorkingDays(nextWorkingDays: string) {
    setRows((previousRows) => {
      const nextRows: Record<string, RowState> = {};
      for (const [employeeId, row] of Object.entries(previousRows)) {
        nextRows[employeeId] = {
          ...row,
          presentDays: row.presentDays === totalWorkingDays ? nextWorkingDays : row.presentDays,
        };
      }
      return nextRows;
    });
    setTotalWorkingDays(nextWorkingDays);
  }

  function handlePeriodMonthChange(nextMonth: string) {
    setPeriodMonth(nextMonth);
    updateWorkingDays(daysInMonth(periodYear, nextMonth));
  }

  function handlePeriodYearChange(nextYear: string) {
    setPeriodYear(nextYear);
    if (/^\d{4}$/.test(nextYear)) updateWorkingDays(daysInMonth(nextYear, periodMonth));
  }

  function computeNet(employee: EmployeeRecord, row: RowState) {
    const gross = roundMoney(Number(employee.grossSalary) || 0);
    const workingDays = Number(totalWorkingDays) || 0;
    const presentDays = Math.min(Number(row.presentDays) || 0, workingDays || Number(row.presentDays) || 0);
    const proratedGross = workingDays > 0 ? roundMoney((gross * presentDays) / workingDays) : 0;
    const fixedBasic = basicSalary(employee, gross);
    const providentFund = employee.pfRate ? roundMoney((fixedBasic * Number(employee.pfRate)) / 100) : 0;
    const iouDeduction = roundMoney(Number(row.iouDeduction) || 0);
    const loanDeduction = roundMoney(Number(row.loanDeduction) || 0);
    const fineDeduction = roundMoney(Number(row.fineDeduction) || 0);
    const lunchBillDeduction = roundMoney(Number(row.lunchBillDeduction) || 0);
    const deductions = sumMoney([
      providentFund,
      iouDeduction,
      loanDeduction,
      fineDeduction,
      lunchBillDeduction,
    ]);
    const componentAmounts: Record<string, number> = {};
    for (const component of employee.salaryComponents) {
      componentAmounts[component.name] = roundMoney((gross * Number(component.percent)) / 100);
    }
    return {
      proratedGross,
      providentFund,
      deductions,
      netPayable: sumMoney([proratedGross, -deductions]),
      componentAmounts,
    };
  }

  const totals = useMemo(() => {
    return visibleEmployees.reduce(
      (acc, employee) => {
        const row = rowFor(employee.id);
        const { proratedGross, providentFund, deductions, netPayable, componentAmounts } = computeNet(employee, row);
        for (const name of componentColumns) {
          acc.components[name] = sumMoney([acc.components[name] ?? 0, componentAmounts[name] ?? 0]);
        }
        acc.salary = sumMoney([acc.salary, roundMoney(Number(employee.grossSalary) || 0)]);
        acc.payable = sumMoney([acc.payable, proratedGross]);
        acc.providentFund = sumMoney([acc.providentFund, providentFund]);
        acc.iou = sumMoney([acc.iou, roundMoney(Number(row.iouDeduction) || 0)]);
        acc.loan = sumMoney([acc.loan, roundMoney(Number(row.loanDeduction) || 0)]);
        acc.fine = sumMoney([acc.fine, roundMoney(Number(row.fineDeduction) || 0)]);
        acc.lunchBill = sumMoney([acc.lunchBill, roundMoney(Number(row.lunchBillDeduction) || 0)]);
        acc.deductions = sumMoney([acc.deductions, deductions]);
        acc.net = sumMoney([acc.net, netPayable]);
        return acc;
      },
      {
        components: {} as Record<string, number>,
        salary: 0,
        payable: 0,
        providentFund: 0,
        iou: 0,
        loan: 0,
        fine: 0,
        lunchBill: 0,
        deductions: 0,
        net: 0,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentColumns, rows, totalWorkingDays, visibleEmployees]);

  function goBack() {
    router.push("/app/payroll-hr?section=payroll");
  }

  async function handleSubmit() {
    if (activeEmployees.length === 0) {
      toast.error("Add at least one active employee before running payroll.");
      return;
    }
    const workingDays = Number(totalWorkingDays);
    if (!workingDays || workingDays <= 0) {
      toast.error("Total working days must be greater than zero.");
      return;
    }

    try {
      await calculateMutation.mutateAsync({
        periodYear: Number(periodYear),
        periodMonth: Number(periodMonth),
        totalWorkingDays: workingDays,
        entries: activeEmployees.map((employee) => {
          const row = rowFor(employee.id);
          return {
            employeeId: employee.id,
            presentDays: Number(row.presentDays) || 0,
            iouDeduction: roundMoney(Number(row.iouDeduction) || 0),
            loanDeduction: roundMoney(Number(row.loanDeduction) || 0),
            fineDeduction: roundMoney(Number(row.fineDeduction) || 0),
            lunchBillDeduction: roundMoney(Number(row.lunchBillDeduction) || 0),
          };
        }),
      });
      toast.success(`Payroll calculated for ${MONTH_NAMES[Number(periodMonth) - 1]} ${periodYear}.`);
      goBack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not calculate payroll.");
    }
  }

  function printPayrollReport() {
    const printWindow = openPrintWindow("width=1400,height=900");
    if (!printWindow) {
      toast.error("Allow pop-ups to print this payroll report.");
      return;
    }

    const componentHeaders = componentColumns.map((name) => `<th>${escapeHtml(name)}</th>`).join("");
    const bodyRows = visibleEmployees.map((employee, index) => {
      const row = rowFor(employee.id);
      const { proratedGross, providentFund, deductions, netPayable, componentAmounts } = computeNet(employee, row);
      return `<tr>
        <td>${index + 1}</td>
        <td class="employee"><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(employee.employeeCode)}</small></td>
        <td>${escapeHtml(employee.department?.name ?? "—")}</td>
        <td>${escapeHtml(employee.designation?.name ?? "—")}</td>
        <td>${escapeHtml(formatDate(employee.joiningDate))}</td>
        ${componentColumns.map((name) => `<td class="money">${escapeHtml(formatCurrency(componentAmounts[name] ?? 0))}</td>`).join("")}
        <td class="money">${escapeHtml(formatCurrency(roundMoney(Number(employee.grossSalary))))}</td>
        <td>${escapeHtml(totalWorkingDays)}</td>
        <td>${escapeHtml(row.presentDays)}</td>
        <td class="money payable">${escapeHtml(formatCurrency(proratedGross))}</td>
        <td class="money">${escapeHtml(formatCurrency(providentFund))}</td>
        <td class="money">${escapeHtml(formatCurrency(roundMoney(Number(row.iouDeduction) || 0)))}</td>
        <td class="money">${escapeHtml(formatCurrency(roundMoney(Number(row.loanDeduction) || 0)))}</td>
        <td class="money">${escapeHtml(formatCurrency(roundMoney(Number(row.fineDeduction) || 0)))}</td>
        <td class="money">${escapeHtml(formatCurrency(roundMoney(Number(row.lunchBillDeduction) || 0)))}</td>
        <td class="money">${escapeHtml(formatCurrency(deductions))}</td>
        <td class="money payable">${escapeHtml(formatCurrency(netPayable))}</td>
      </tr>`;
    }).join("");

    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(MONTH_NAMES[Number(periodMonth) - 1])} ${escapeHtml(periodYear)} Payroll</title><style>
      @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#1f3152}header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #2f67e8;padding-bottom:8px;margin-bottom:10px}h1{margin:0;font-size:18px}.subtitle{margin-top:3px;font-size:9px;color:#6b7890}.period{text-align:right;font-size:11px;font-weight:700}.meta{display:flex;gap:18px;margin-bottom:10px;padding:7px 9px;border:1px solid #d7dfeb;background:#f7f9fc;font-size:9px}.meta b{color:#25365b}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6.8px}th,td{border:1px solid #aebbcf;padding:5px 3px;text-align:right;vertical-align:middle}th{background:#edf3fb;color:#41536f;font-weight:700;text-align:center;line-height:1.25}td:first-child{text-align:center}.employee{text-align:left}.employee strong,.employee small{display:block}.employee small{margin-top:2px;color:#7b879a;font-size:6px}td:nth-child(3),td:nth-child(4){text-align:left}.money{white-space:nowrap;font-size:6.3px}.payable{color:#15834f;font-weight:700}tfoot td{background:#eaf1fb;font-weight:700;border-top:2px solid #879bb7}.notes{margin-top:10px;border:1px solid #d7e3f3;background:#f7faff;padding:7px 9px;font-size:8px;line-height:1.5}.notes p{margin:0 0 3px}.notes p:last-child{margin-bottom:0}</style></head><body>
      <header><div><h1>Run Payroll</h1><div class="subtitle">Gross components are fixed; Salary Payable is attendance-based before deductions.</div></div><div class="period">${escapeHtml(MONTH_NAMES[Number(periodMonth) - 1])} ${escapeHtml(periodYear)}</div></header>
      <div class="meta"><span><b>Month:</b> ${escapeHtml(MONTH_NAMES[Number(periodMonth) - 1])}</span><span><b>Year:</b> ${escapeHtml(periodYear)}</span><span><b>Department:</b> ${escapeHtml(departmentFilter === "ALL" ? "All Departments" : departmentFilter)}</span><span><b>Total Working Days:</b> ${escapeHtml(totalWorkingDays)}</span><span><b>Weekly Holidays:</b> ${attendanceSummary.weeklyHolidayDates.size}</span></div>
      <table><thead><tr><th>Sl.</th><th>Employee</th><th>Department</th><th>Designation</th><th>Joining Date</th>${componentHeaders}<th>Total Salary</th><th>Working Day</th><th>Present</th><th>Salary Payable</th><th>PF</th><th>IOU</th><th>Loan</th><th>Fine</th><th>Lunch Bill</th><th>Total Deduct</th><th>Net Payable</th></tr></thead><tbody>${bodyRows}</tbody><tfoot><tr><td colspan="${5 + componentColumns.length}">Total</td><td class="money">${escapeHtml(formatCurrency(totals.salary))}</td><td></td><td></td><td class="money payable">${escapeHtml(formatCurrency(totals.payable))}</td><td class="money">${escapeHtml(formatCurrency(totals.providentFund))}</td><td class="money">${escapeHtml(formatCurrency(totals.iou))}</td><td class="money">${escapeHtml(formatCurrency(totals.loan))}</td><td class="money">${escapeHtml(formatCurrency(totals.fine))}</td><td class="money">${escapeHtml(formatCurrency(totals.lunchBill))}</td><td class="money">${escapeHtml(formatCurrency(totals.deductions))}</td><td class="money payable">${escapeHtml(formatCurrency(totals.net))}</td></tr></tfoot></table>
      <div class="notes"><p><b>Weekly holidays:</b> ${attendanceSummary.weeklyHolidayDates.size} days in ${escapeHtml(MONTH_NAMES[Number(periodMonth) - 1])} ${escapeHtml(periodYear)}. Included as paid working/present days.</p><p><b>Attendance calculation:</b> Paid present days = unique PRESENT attendance dates + weekly holidays, without duplicate dates.</p></div>
    </body></html>`);
    printWindowWhenReady(printWindow, { delayMs: 150 });
  }

  printReportRef.current = printPayrollReport;

  useEffect(() => {
    const handlePrintRequest = (event: Event) => {
      event.preventDefault();
      printReportRef.current();
    };
    window.addEventListener("erp-print-request", handlePrintRequest);
    return () => window.removeEventListener("erp-print-request", handlePrintRequest);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto rounded-[8px] border border-[#d9e1ed] bg-[#f7f9fc] shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <header className="flex items-center justify-between gap-3 border-b border-[#dce4ef] bg-white px-5 py-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight text-[#192c4d]">{existingRun ? "Recalculate Payroll" : "Run Payroll"}</h1>
          <p className="mt-0.5 text-[12px] text-[#71809a]">Gross salary and its components stay fixed. Salary Payable is calculated from paid present vs. working days, then deductions are applied to get Net Payable.</p>
        </div>
        <button
          type="button"
          onClick={goBack}
          aria-label="Close Run Payroll"
          title="Close"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ffc5cc] bg-[#fff1f3] text-[#dc3545] shadow-sm transition hover:border-[#ff9daa] hover:bg-[#ffe4e8] hover:text-[#b91c2c]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 p-4 lg:p-5">
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-2xl lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Month</label>
              <select className="h-9 w-full rounded-[8px] border border-border bg-white px-2 text-[13px]" value={periodMonth} onChange={(e) => handlePeriodMonthChange(e.target.value)} disabled={Boolean(existingRun)}>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Year</label>
              <Input className="h-9 rounded-[8px] text-[13px]" value={periodYear} onChange={(e) => handlePeriodYearChange(e.target.value)} disabled={Boolean(existingRun)} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Total Working Days</label>
              <Input className="h-9 rounded-[8px] text-[13px]" type="number" min={0} step="0.5" value={totalWorkingDays} onChange={(e) => updateWorkingDays(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Department</label>
              <select className="h-9 w-full rounded-[8px] border border-border bg-white px-2 text-[13px]" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                <option value="ALL">All Departments</option>
                {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-[#aebccf]">
            <table className="w-full table-fixed border-collapse text-[10px] xl:text-[11px] [&_input]:h-7 [&_input]:min-w-0 [&_input]:w-full [&_input]:px-1 [&_td]:border [&_td]:border-[#c0cad9] [&_td]:px-1.5 [&_th]:border [&_th]:border-[#aebccf] [&_th]:break-words [&_th]:px-1.5">
              <colgroup>
                <col className="w-[3%]" />
                <col className="w-[8%]" />
                <col className="w-[6%]" />
                <col className="w-[6%]" />
                <col className="w-[6%]" />
                {componentColumns.map((name) => <col key={name} className="w-[5%]" />)}
                <col className="w-[5.5%]" />
                <col className="w-[4.5%]" />
                <col className="w-[5%]" />
                <col className="w-[5.5%]" />
                <col className="w-[5%]" />
                <col className="w-[4.5%]" />
                <col className="w-[4.5%]" />
                <col className="w-[4%]" />
                <col className="w-[5%]" />
                <col className="w-[5.5%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead className="bg-[#f7f9fc] text-[#5b6b83]">
                <tr>
                  <th rowSpan={2} className="border-b border-[#e1e7f0] px-3 py-2 text-left font-semibold align-bottom">Sl.<br />No</th>
                  <th rowSpan={2} className="border-b border-[#e1e7f0] px-3 py-2 text-left font-semibold align-bottom">Name of Employee</th>
                  <th rowSpan={2} className="border-b border-[#e1e7f0] px-3 py-2 text-left font-semibold align-bottom">Department</th>
                  <th rowSpan={2} className="border-b border-[#e1e7f0] px-3 py-2 text-left font-semibold align-bottom">Designation</th>
                  <th rowSpan={2} className="border-b border-[#e1e7f0] px-3 py-2 text-left font-semibold align-bottom">Joining Date</th>
                  <th colSpan={componentColumns.length} className="border-b border-l border-[#e1e7f0] px-3 py-1.5 text-center font-semibold">Gross Salary</th>
                  <th rowSpan={2} className="border-b border-l border-[#e1e7f0] px-3 py-2 text-right font-semibold align-bottom">Total Salary</th>
                  <th rowSpan={2} className="border-b border-l border-[#e1e7f0] px-3 py-2 text-right font-semibold align-bottom">Working Day</th>
                  <th rowSpan={2} className="border-b border-[#e1e7f0] px-3 py-2 text-right font-semibold align-bottom">Working Day<br />(Present)</th>
                  <th rowSpan={2} className="border-b border-l border-[#e1e7f0] px-3 py-2 text-right font-semibold align-bottom">Salary Payable</th>
                  <th colSpan={6} className="border-b border-l border-[#e1e7f0] px-3 py-1.5 text-center font-semibold">Deductions</th>
                  <th rowSpan={2} className="border-b border-l border-[#e1e7f0] px-3 py-2 text-right font-semibold align-bottom">Net Payable</th>
                </tr>
                <tr>
                  {componentColumns.map((name, index) => (
                    <th key={name} className={cn("px-3 py-1.5 text-right font-medium", index === 0 ? "border-l border-[#e1e7f0]" : "")}>{name}</th>
                  ))}
                  <th className="border-l border-[#e1e7f0] px-3 py-1.5 text-right font-medium">Provident Fund</th>
                  <th className="px-3 py-1.5 text-right font-medium">IOU</th>
                  <th className="px-3 py-1.5 text-right font-medium">Loan</th>
                  <th className="px-3 py-1.5 text-right font-medium">Fine</th>
                  <th className="px-3 py-1.5 text-right font-medium">Lunch Bill</th>
                  <th className="border-l border-[#e1e7f0] px-3 py-1.5 text-right font-medium">Total Deduct</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={15 + componentColumns.length} className="px-3 py-6 text-center text-[#8592a5]">No active employees to pay.</td>
                  </tr>
                ) : (
                  visibleEmployees.map((employee, index) => {
                    const row = rowFor(employee.id);
                    const { proratedGross, providentFund, deductions, netPayable, componentAmounts } = computeNet(employee, row);
                    return (
                      <tr key={employee.id} className="border-t border-[#eef1f6]">
                        <td className="px-3 py-2 text-[#4a5b73]">{index + 1}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-[#223754]">{employee.name}</div>
                          <div className="text-[10px] text-[#8592a5]">{employee.employeeCode}</div>
                        </td>
                        <td className="px-3 py-2 text-[#4a5b73]">{employee.department?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-[#4a5b73]">{employee.designation?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-[#4a5b73]">{formatDate(employee.joiningDate)}</td>
                        {componentColumns.map((name, componentIndex) => (
                          <td key={name} className={cn("px-3 py-2 text-right text-[#8592a5]", componentIndex === 0 ? "border-l border-[#eef1f6]" : "")}>
                            {componentAmounts[name] !== undefined ? formatCurrency(componentAmounts[name]) : "—"}
                          </td>
                        ))}
                        <td className="border-l border-[#eef1f6] px-3 py-2 text-right text-[#4a5b73]">{formatCurrency(roundMoney(Number(employee.grossSalary)))}</td>
                        <td className="border-l border-[#eef1f6] px-3 py-2 text-right text-[#4a5b73]">{totalWorkingDays}</td>
                        <td className="px-3 py-1 text-right"><Input className="ml-auto h-8 w-20 rounded-[6px] bg-[#f4f7fb] text-right text-[12px]" type="number" value={row.presentDays} readOnly aria-label={`${employee.name} paid present days from attendance`} /></td>
                        <td className="border-l border-[#eef1f6] px-3 py-2 text-right font-semibold text-[#1f8a4d]">{formatCurrency(proratedGross)}</td>
                        <td className="border-l border-[#eef1f6] px-3 py-2 text-right text-[#4a5b73]" title={employee.pfRate ? `${employee.pfRate}% of fixed Basic Salary` : "No PF rate set for this employee"}>{formatCurrency(providentFund)}</td>
                        <td className="px-3 py-1 text-right"><Input className="ml-auto h-8 w-20 rounded-[6px] text-right text-[12px]" money value={row.iouDeduction} onChange={(e) => updateRow(employee.id, { iouDeduction: e.target.value })} /></td>
                        <td className="px-3 py-1 text-right"><Input className="ml-auto h-8 w-20 rounded-[6px] text-right text-[12px]" money value={row.loanDeduction} onChange={(e) => updateRow(employee.id, { loanDeduction: e.target.value })} /></td>
                        <td className="px-3 py-1 text-right"><Input className="ml-auto h-8 w-20 rounded-[6px] text-right text-[12px]" money value={row.fineDeduction} onChange={(e) => updateRow(employee.id, { fineDeduction: e.target.value })} /></td>
                        <td className="px-3 py-1 text-right"><Input className="ml-auto h-8 w-20 rounded-[6px] text-right text-[12px]" money value={row.lunchBillDeduction} onChange={(e) => updateRow(employee.id, { lunchBillDeduction: e.target.value })} /></td>
                        <td className="border-l border-[#eef1f6] px-3 py-2 text-right font-medium text-[#4a5b73]">{formatCurrency(deductions)}</td>
                        <td className={cn("border-l border-[#eef1f6] px-3 py-2 text-right font-semibold", moneyToMinorUnits(netPayable) < 0 ? "text-[#e11d2f]" : "text-[#1f8a4d]")}>{formatCurrency(netPayable)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {visibleEmployees.length > 0 ? (
                <tfoot className="border-t-2 border-[#cbd7e8] bg-[#f3f7fd] font-semibold text-[#223754]">
                  <tr>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-left">Total</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                    {componentColumns.map((name, index) => (
                      <td key={name} className={cn("px-3 py-2.5 text-right", index === 0 ? "border-l border-[#dce4ef]" : "")}>
                        {formatCurrency(totals.components[name] ?? 0)}
                      </td>
                    ))}
                    <td className="border-l border-[#dce4ef] px-3 py-2.5 text-right">{formatCurrency(totals.salary)}</td>
                    <td className="border-l border-[#dce4ef] px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="border-l border-[#dce4ef] px-3 py-2.5 text-right text-[#1f8a4d]">{formatCurrency(totals.payable)}</td>
                    <td className="border-l border-[#dce4ef] px-3 py-2.5 text-right">{formatCurrency(totals.providentFund)}</td>
                    <td className="px-3 py-2.5 text-right">{formatCurrency(totals.iou)}</td>
                    <td className="px-3 py-2.5 text-right">{formatCurrency(totals.loan)}</td>
                    <td className="px-3 py-2.5 text-right">{formatCurrency(totals.fine)}</td>
                    <td className="px-3 py-2.5 text-right">{formatCurrency(totals.lunchBill)}</td>
                    <td className="border-l border-[#dce4ef] px-3 py-2.5 text-right">{formatCurrency(totals.deductions)}</td>
                    <td className={cn("border-l border-[#dce4ef] px-3 py-2.5 text-right", moneyToMinorUnits(totals.net) < 0 ? "text-[#e11d2f]" : "text-[#1f8a4d]")}>{formatCurrency(totals.net)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          <div className="mt-3 space-y-1.5 rounded-[10px] border border-[#dbe6f7] bg-[#f7faff] px-4 py-3 text-[11px] leading-5 text-[#52647f]">
            <p><span className="font-semibold text-[#294361]">Weekly holidays:</span> {attendanceSummary.weeklyHolidayDates.size} day{attendanceSummary.weeklyHolidayDates.size === 1 ? "" : "s"} in {MONTH_NAMES[Number(periodMonth) - 1]} {periodYear}. These days are included as paid working/present days for every employee.</p>
            {Number(totalWorkingDays) !== attendanceSummary.calendarDays ? (
              <p><span className="font-semibold text-[#b45f16]">Working-day difference:</span> This month has {attendanceSummary.calendarDays} calendar days, but Total Working Days is {Number(totalWorkingDays) || 0}. It has been manually adjusted by {Math.abs(attendanceSummary.calendarDays - (Number(totalWorkingDays) || 0))} day{Math.abs(attendanceSummary.calendarDays - (Number(totalWorkingDays) || 0)) === 1 ? "" : "s"}.</p>
            ) : null}
            <p><span className="font-semibold text-[#294361]">Attendance calculation:</span> Paid present days = unique PRESENT attendance dates + weekly holidays, without counting an overlapping date twice.</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-white px-5 py-3">
        <Button variant="outline" onClick={goBack} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
        <Button onClick={handleSubmit} disabled={calculateMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">
          {calculateMutation.isPending ? "Calculating..." : existingRun ? "Recalculate Payroll" : "Calculate Payroll"}
        </Button>
      </div>
    </div>
  );
}
