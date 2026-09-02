"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, Download, FileSpreadsheet, Plus, Printer, Settings2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCurrentSessionQuery } from "@/hooks/use-app-query";
import {
  useAttendanceQuery,
  useEmployeesQuery,
  useHolidaysQuery,
  useLeaveRequestsQuery,
  useShiftsQuery,
} from "@/hooks/use-hr-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { openPrintWindow, printWindowWhenReady } from "@/lib/print";
import type { AttendanceRecord, EmployeeRecord, HolidayRecord, LeaveRequestRecord } from "@/types/hr";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const LEAVE_CODES = ["C", "S", "P", "D", "O", "U"] as const;
type LeaveCode = (typeof LEAVE_CODES)[number];
type TrackerView = "summary" | "monthly";

const LEGEND = "C = Casual / Vacation, S = Sick, P = Personal, D = Maternity / Paternity, O = Special / Other, U = Unpaid";

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function leaveCode(value: string | null | undefined): LeaveCode {
  const text = (value ?? "").trim().toLowerCase();
  if (/\b(sick|medical)\b/.test(text)) return "S";
  if (/\b(personal)\b/.test(text)) return "P";
  if (/\b(maternity|paternity|parental)\b/.test(text)) return "D";
  if (/\b(unpaid|without pay|lop)\b/.test(text)) return "U";
  if (/\b(casual|annual|vacation|earned)\b/.test(text)) return "C";
  return "O";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isHoliday(date: string, holidays: HolidayRecord[]) {
  const monthDay = date.slice(5, 10);
  return holidays.some((holiday) => holiday.date.slice(0, 10) === date || (holiday.isRecurringYearly && holiday.date.slice(5, 10) === monthDay));
}

function buildLeaveMap(
  year: number,
  attendance: AttendanceRecord[],
  requests: LeaveRequestRecord[],
  weeklyOffDays: Set<number>,
  holidays: HolidayRecord[],
) {
  const result = new Map<string, LeaveCode>();

  for (const record of attendance) {
    const date = record.attendanceDate.slice(0, 10);
    if (record.status === "LEAVE" && Number(date.slice(0, 4)) === year) {
      result.set(`${record.employee.id}:${date}`, leaveCode(record.notes));
    }
  }

  for (const request of requests) {
    if (request.status !== "APPROVED") continue;
    const start = new Date(`${request.startDate.slice(0, 10)}T00:00:00`);
    const end = new Date(`${request.endDate.slice(0, 10)}T00:00:00`);
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      if (cursor.getFullYear() !== year || weeklyOffDays.has(cursor.getDay())) continue;
      const date = isoDate(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      if (!isHoliday(date, holidays)) result.set(`${request.employeeId}:${date}`, leaveCode(request.leaveType.name));
    }
  }

  return result;
}

function employeeTotals(employeeId: string, leaveMap: Map<string, LeaveCode>) {
  const totals = Object.fromEntries(LEAVE_CODES.map((code) => [code, 0])) as Record<LeaveCode, number>;
  for (const [key, code] of leaveMap) if (key.startsWith(`${employeeId}:`)) totals[code] += 1;
  return totals;
}

function LeaveTrackerEmptyIllustration() {
  return (
    <div className="relative mb-5 h-44 w-64" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#dcefe1_0%,#edf6ef_58%,transparent_72%)]" />
      <div className="absolute left-1/2 top-1/2 w-48 -translate-x-1/2 -translate-y-1/2 rotate-[-3deg] rounded-[18px] border border-[#b8d2bf] bg-white p-3 shadow-[0_18px_45px_rgba(42,91,58,0.13)]">
        <div className="flex items-center justify-between border-b border-[#deebe1] pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#397849] text-white"><CalendarDays className="h-4 w-4" /></span>
            <div><div className="h-1.5 w-16 rounded-full bg-[#397849]" /><div className="mt-1 h-1 w-10 rounded-full bg-[#bdd4c3]" /></div>
          </div>
          <Sparkles className="h-4 w-4 text-[#e3a42c]" />
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {Array.from({ length: 21 }, (_, index) => (
            <span key={index} className={`flex h-4 items-center justify-center rounded-[3px] text-[7px] ${index === 8 || index === 16 ? "bg-[#397849] text-white" : index % 7 === 5 ? "bg-[#e8ece9] text-[#789080]" : "bg-[#eff6f1] text-[#8ca092]"}`}>
              {index === 8 ? "C" : index === 16 ? "S" : ""}
            </span>
          ))}
        </div>
      </div>
      <span className="absolute bottom-1 left-5 flex h-11 w-11 items-center justify-center rounded-[13px] border border-[#cfe0d3] bg-white text-[#397849] shadow-[0_10px_25px_rgba(42,91,58,0.12)]"><FileSpreadsheet className="h-5 w-5" /></span>
      <span className="absolute right-5 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#e9f5ec] text-[#397849] shadow-[0_8px_20px_rgba(42,91,58,0.1)]"><Check className="h-4 w-4" /></span>
    </div>
  );
}

function MonthlyTable({
  year,
  month,
  employees,
  weeklyOffDays,
  holidays,
  leaveMap,
}: {
  year: number;
  month: number;
  employees: EmployeeRecord[];
  weeklyOffDays: Set<number>;
  holidays: HolidayRecord[];
  leaveMap: Map<string, LeaveCode>;
}) {
  const days = Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1);
  const dayTotals = days.map(() => 0);
  const codeTotals = Object.fromEntries(LEAVE_CODES.map((code) => [code, 0])) as Record<LeaveCode, number>;
  for (const employee of employees) {
    for (const [dayIndex, day] of days.entries()) {
      const code = leaveMap.get(`${employee.id}:${isoDate(year, month, day)}`);
      if (code) {
        dayTotals[dayIndex] += 1;
        codeTotals[code] += 1;
      }
    }
  }
  return (
    <div className="overflow-x-auto rounded-[12px] border border-[#9db9a4] bg-white">
      <table className="w-full min-w-[1080px] border-collapse text-[10px] text-[#163b2a]">
        <thead>
          <tr className="bg-[#397849] text-white">
            <th className="w-12 border border-[#77a583] px-2 py-2 text-center">ID</th>
            <th className="min-w-40 border border-[#77a583] px-2 py-2 text-left">Employee</th>
            <th colSpan={days.length} className="border border-[#77a583] px-2 py-2 text-center">{LEGEND}</th>
            <th colSpan={LEAVE_CODES.length} className="border border-[#77a583] px-2 py-2 text-center">Totals</th>
          </tr>
          <tr className="bg-[#a9d3b2]">
            <th className="border border-[#b7c9bb]" />
            <th className="border border-[#b7c9bb]" />
            {days.map((day) => {
              const date = new Date(year, month, day);
              return <th key={`weekday-${day}`} className={`border border-[#b7c9bb] px-0.5 py-1 ${weeklyOffDays.has(date.getDay()) ? "bg-[#e8ece9] text-[#8a3c31]" : ""}`}>{DAY_NAMES[date.getDay()]}</th>;
            })}
            {LEAVE_CODES.map((code) => <th key={code} rowSpan={2} className="border border-[#8fb69a] bg-[#a9d3b2] px-1">{code}</th>)}
          </tr>
          <tr className="bg-[#d6ead9]">
            <th className="border border-[#b7c9bb] px-1 py-1">#</th>
            <th className="border border-[#b7c9bb] px-2 py-1 text-left">Name</th>
            {days.map((day) => {
              const date = new Date(year, month, day);
              return <th key={day} className={`border border-[#b7c9bb] px-0.5 py-1 ${weeklyOffDays.has(date.getDay()) ? "bg-[#edf0ee]" : ""}`}>{day}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map((employee, index) => {
            const monthTotals = Object.fromEntries(LEAVE_CODES.map((code) => [code, 0])) as Record<LeaveCode, number>;
            return (
              <tr key={employee.id} className="odd:bg-white even:bg-[#fbfdfb]">
                <td className="border border-[#ccd7ce] px-1 py-1.5 text-center">{employee.employeeCode || index + 1}</td>
                <td className="whitespace-nowrap border border-[#ccd7ce] px-2 py-1.5 font-medium text-[#203e2e]">{employee.name}</td>
                {days.map((day) => {
                  const dateObject = new Date(year, month, day);
                  const date = isoDate(year, month, day);
                  const code = leaveMap.get(`${employee.id}:${date}`);
                  if (code) monthTotals[code] += 1;
                  const off = weeklyOffDays.has(dateObject.getDay());
                  const holiday = isHoliday(date, holidays);
                  return <td key={day} title={holiday ? "Company holiday" : off ? "Weekly off" : undefined} className={`border border-[#d4dcd5] px-0.5 py-1.5 text-center font-semibold ${off ? "bg-[#eef0ef]" : holiday ? "bg-[#fff1cc]" : ""}`}>{code ?? ""}</td>;
                })}
                {LEAVE_CODES.map((code) => <td key={code} className="border border-[#9fc1a7] bg-[#d8ebdc] px-1 py-1.5 text-center tabular-nums">{monthTotals[code] || "-"}</td>)}
              </tr>
            );
          })}
        </tbody>
        {employees.length > 0 ? (
          <tfoot>
            <tr className="bg-[#c3dfc9] font-semibold text-[#163b2a]">
              <td className="border border-[#9fc1a7] px-1 py-1.5 text-center" colSpan={2}>Total</td>
              {dayTotals.map((total, index) => (
                <td key={days[index]} className="border border-[#9fc1a7] px-0.5 py-1.5 text-center tabular-nums">{total || "-"}</td>
              ))}
              {LEAVE_CODES.map((code) => (
                <td key={code} className="border border-[#8fb69a] bg-[#a9d3b2] px-1 py-1.5 text-center tabular-nums">{codeTotals[code] || "-"}</td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function SummaryTable({ employees, leaveMap }: { employees: EmployeeRecord[]; leaveMap: Map<string, LeaveCode> }) {
  const grandTotals = Object.fromEntries(LEAVE_CODES.map((code) => [code, 0])) as Record<LeaveCode, number>;
  const employeeRows = employees.map((employee) => {
    const totals = employeeTotals(employee.id, leaveMap);
    for (const code of LEAVE_CODES) grandTotals[code] += totals[code];
    return { employee, totals, total: LEAVE_CODES.reduce((sum, code) => sum + totals[code], 0) };
  });
  const totalLeaveDays = LEAVE_CODES.reduce((sum, code) => sum + grandTotals[code], 0);

  return (
    <div className="min-h-full overflow-auto rounded-[12px] border border-[#9db9a4] bg-white">
      <table className="w-full min-w-[820px] border-collapse text-[12px] text-[#163b2a]">
        <thead>
          <tr className="bg-white">
            <th colSpan={LEAVE_CODES.length + 3} className="border-b border-[#9db9a4] px-5 py-4 text-center text-[11px] font-semibold italic">{LEGEND}</th>
          </tr>
          <tr className="bg-[#397849] text-white">
            <th colSpan={2} className="border border-[#77a583] px-4 py-2.5 text-center font-semibold">Employee</th>
            <th colSpan={LEAVE_CODES.length + 1} className="border border-[#77a583] px-4 py-2.5 text-center font-semibold">Year Totals</th>
          </tr>
          <tr className="bg-[#d6ead9] text-[#163b2a]">
            <th className="w-32 border border-[#b7c9bb] px-4 py-2.5 text-center font-semibold">ID</th>
            <th className="border border-[#b7c9bb] px-4 py-2.5 text-left font-semibold">Name</th>
            {LEAVE_CODES.map((code) => <th key={code} className="w-24 border border-[#b7c9bb] px-3 py-2.5 text-center font-semibold">{code}</th>)}
            <th className="w-28 border border-[#8fb69a] bg-[#a9d3b2] px-3 py-2.5 text-center font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {employeeRows.map(({ employee, totals, total }) => (
            <tr key={employee.id} className="odd:bg-white even:bg-[#fbfdfb] hover:bg-[#f1f8f3]">
              <td className="border border-[#ccd7ce] px-4 py-3 text-center font-medium">{employee.employeeCode}</td>
              <td className="border border-[#ccd7ce] px-4 py-3"><div className="font-semibold text-[#203e2e]">{employee.name}</div><div className="mt-0.5 text-[10px] text-[#718477]">{employee.department?.name ?? "No department"}{employee.designation ? ` · ${employee.designation.name}` : ""}</div></td>
              {LEAVE_CODES.map((code) => <td key={code} className="border border-[#ccd7ce] px-3 py-3 text-center tabular-nums">{totals[code] || "-"}</td>)}
              <td className="border border-[#9fc1a7] bg-[#d8ebdc] px-3 py-3 text-center font-semibold tabular-nums">{total || "-"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="bg-[#c3dfc9] font-semibold text-[#163b2a]"><td colSpan={2} className="border border-[#9fc1a7] px-4 py-3 text-center">Totals</td>{LEAVE_CODES.map((code) => <td key={code} className="border border-[#9fc1a7] px-3 py-3 text-center tabular-nums">{grandTotals[code] || "-"}</td>)}<td className="border border-[#8fb69a] bg-[#a9d3b2] px-3 py-3 text-center tabular-nums">{totalLeaveDays || "-"}</td></tr></tfoot>
      </table>
    </div>
  );
}

export function EmployeeLeaveTrackerReport({ onClose, onAddEmployee }: { onClose: () => void; onAddEmployee: () => void }) {
  const now = new Date();
  const router = useRouter();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<TrackerView>("summary");
  const [exporting, setExporting] = useState(false);
  const [weeklyOffOverride, setWeeklyOffOverride] = useState<number[] | null>(null);
  const { mode, session } = useSessionContext();
  const enabled = Boolean(session?.workspaceId);
  const employeesQuery = useEmployeesQuery(enabled);
  const attendanceQuery = useAttendanceQuery(enabled);
  const leaveRequestsQuery = useLeaveRequestsQuery(enabled);
  const shiftsQuery = useShiftsQuery(enabled);
  const holidaysQuery = useHolidaysQuery(enabled);
  const sessionQuery = useCurrentSessionQuery(mode, enabled);

  const employees = useMemo(() => {
    const attendanceEmployeeIds = new Set(
      (attendanceQuery.data ?? [])
        .filter((record) => Number(record.attendanceDate.slice(0, 4)) === year)
        .map((record) => record.employee.id),
    );
    const leaveEmployeeIds = new Set(
      (leaveRequestsQuery.data ?? [])
        .filter((request) => {
          if (request.status !== "APPROVED") return false;
          const startYear = Number(request.startDate.slice(0, 4));
          const endYear = Number(request.endDate.slice(0, 4));
          return startYear <= year && endYear >= year;
        })
        .map((request) => request.employeeId),
    );

    return (employeesQuery.data ?? []).filter(
      (employee) => attendanceEmployeeIds.has(employee.id) || leaveEmployeeIds.has(employee.id),
    );
  }, [attendanceQuery.data, employeesQuery.data, leaveRequestsQuery.data, year]);
  const configuredWeeklyOffDays = useMemo(() => {
    const shift = (shiftsQuery.data ?? []).find((entry) => entry.isDefault) ?? shiftsQuery.data?.[0];
    return shift?.weeklyOffDays?.length ? shift.weeklyOffDays : [5];
  }, [shiftsQuery.data]);
  const weeklyOffDays = useMemo(
    () => new Set(weeklyOffOverride ?? configuredWeeklyOffDays),
    [configuredWeeklyOffDays, weeklyOffOverride],
  );
  const holidays = holidaysQuery.data ?? [];
  const leaveMap = useMemo(
    () => buildLeaveMap(year, attendanceQuery.data ?? [], leaveRequestsQuery.data ?? [], weeklyOffDays, holidays),
    [attendanceQuery.data, holidays, leaveRequestsQuery.data, weeklyOffDays, year],
  );
  const companyName = sessionQuery.data?.company.name?.trim() || "Company";
  const loading = employeesQuery.isLoading || attendanceQuery.isLoading || leaveRequestsQuery.isLoading || shiftsQuery.isLoading || holidaysQuery.isLoading;
  const years = Array.from({ length: 9 }, (_, index) => now.getFullYear() - 4 + index);

  function toggleWeeklyOff(day: number) {
    setWeeklyOffOverride((current) => {
      const selected = current ?? configuredWeeklyOffDays;
      return selected.includes(day) ? selected.filter((entry) => entry !== day) : [...selected, day].sort((a, b) => a - b);
    });
  }

  async function exportWorkbook() {
    try {
      setExporting(true);
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const summaryRows: Array<Array<string | number>> = [
        ["Employee Leave Tracker", "", "", "", "", "", "", companyName],
        ["Year", year],
        [],
        [LEGEND],
        [],
        ["ID", "Employee", ...LEAVE_CODES, "Total"],
      ];
      for (const employee of employees) {
        const totals = employeeTotals(employee.id, leaveMap);
        summaryRows.push([employee.employeeCode, employee.name, ...LEAVE_CODES.map((code) => totals[code] || "-"), LEAVE_CODES.reduce((sum, code) => sum + totals[code], 0)]);
      }
      const summary = XLSX.utils.aoa_to_sheet(summaryRows);
      summary["!cols"] = [{ wch: 14 }, { wch: 26 }, ...LEAVE_CODES.map(() => ({ wch: 8 })), { wch: 11 }];
      summary["!merges"] = [XLSX.utils.decode_range("A1:D1"), XLSX.utils.decode_range("H1:I1"), XLSX.utils.decode_range("A4:I4")];
      XLSX.utils.book_append_sheet(workbook, summary, "Summary");

      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const days = Array.from({ length: daysInMonth(year, monthIndex) }, (_, index) => index + 1);
        const rows: Array<Array<string | number>> = [
          [`${MONTH_NAMES[monthIndex]} ${year}`, "", "", "", "", companyName],
          [],
          ["Employee", "", LEGEND],
          ["ID", "Name", ...days.map((day) => DAY_NAMES[new Date(year, monthIndex, day).getDay()]), ...LEAVE_CODES],
          ["", "", ...days, ...LEAVE_CODES],
        ];
        for (const employee of employees) {
          const totals = Object.fromEntries(LEAVE_CODES.map((code) => [code, 0])) as Record<LeaveCode, number>;
          const marks = days.map((day) => {
            const code = leaveMap.get(`${employee.id}:${isoDate(year, monthIndex, day)}`);
            if (code) totals[code] += 1;
            return code ?? "";
          });
          rows.push([employee.employeeCode, employee.name, ...marks, ...LEAVE_CODES.map((code) => totals[code] || "-")]);
        }
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        sheet["!cols"] = [{ wch: 13 }, { wch: 24 }, ...days.map(() => ({ wch: 4 })), ...LEAVE_CODES.map(() => ({ wch: 5 }))];
        sheet["!freeze"] = { xSplit: 2, ySplit: 5, topLeftCell: "C6", activePane: "bottomRight", state: "frozen" };
        sheet["!margins"] = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0, footer: 0 };
        sheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
        XLSX.utils.book_append_sheet(workbook, sheet, MONTH_NAMES[monthIndex].slice(0, 3));
      }
      XLSX.writeFile(workbook, `employee-leave-tracker-${year}.xlsx`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the leave tracker.");
    } finally {
      setExporting(false);
    }
  }

  function printReport() {
    const printWindow = openPrintWindow("width=1400,height=900");
    if (!printWindow) {
      toast.error("Allow pop-ups to print this report.");
      return;
    }
    if (view === "summary") {
      const grandTotals = Object.fromEntries(LEAVE_CODES.map((code) => [code, 0])) as Record<LeaveCode, number>;
      const rows = employees.map((employee) => {
        const totals = employeeTotals(employee.id, leaveMap);
        for (const code of LEAVE_CODES) grandTotals[code] += totals[code];
        const total = LEAVE_CODES.reduce((sum, code) => sum + totals[code], 0);
        return `<tr><td>${escapeHtml(employee.employeeCode)}</td><td class="name">${escapeHtml(employee.name)}</td>${LEAVE_CODES.map((code) => `<td>${totals[code] || "-"}</td>`).join("")}<td class="total">${total || "-"}</td></tr>`;
      }).join("");
      const grandTotal = LEAVE_CODES.reduce((sum, code) => sum + grandTotals[code], 0);
      printWindow.document.write(`<!doctype html><html><head><title>${year} Leave Summary</title><style>@page{size:landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#173b29;margin:0}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:14px}h1{font-size:22px;margin:0}.company{font-size:18px}.legend{text-align:center;border:1px solid #aebcaf;padding:9px;font-size:11px;font-style:italic}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #aebcaf;text-align:center;padding:7px 5px}thead{background:#397849;color:white}.subhead{background:#d6ead9;color:#173b29}.name{text-align:left}.total{background:#d6ead9;font-weight:bold}tfoot{background:#c3dfc9;font-weight:bold}</style></head><body><header><h1>${year} — Employee Leave Summary</h1><div class="company">${escapeHtml(companyName)}</div></header><div class="legend">${escapeHtml(LEGEND)}</div><table><thead><tr><th colspan="2">Employee</th><th colspan="7">Year Totals</th></tr><tr class="subhead"><th>ID</th><th>Name</th>${LEAVE_CODES.map((code) => `<th>${code}</th>`).join("")}<th>Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Totals</td>${LEAVE_CODES.map((code) => `<td>${grandTotals[code] || "-"}</td>`).join("")}<td>${grandTotal || "-"}</td></tr></tfoot></table></body></html>`);
      printWindowWhenReady(printWindow, { delayMs: 120 });
      return;
    }
    const days = Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1);
    const rows = employees.map((employee) => {
      const totals = Object.fromEntries(LEAVE_CODES.map((code) => [code, 0])) as Record<LeaveCode, number>;
      const marks = days.map((day) => {
        const dateObject = new Date(year, month, day);
        const date = isoDate(year, month, day);
        const code = leaveMap.get(`${employee.id}:${date}`);
        if (code) totals[code] += 1;
        return `<td class="${weeklyOffDays.has(dateObject.getDay()) ? "off" : isHoliday(date, holidays) ? "holiday" : ""}">${code ?? ""}</td>`;
      }).join("");
      return `<tr><td>${escapeHtml(employee.employeeCode)}</td><td class="name">${escapeHtml(employee.name)}</td>${marks}${LEAVE_CODES.map((code) => `<td class="total">${totals[code] || "-"}</td>`).join("")}</tr>`;
    }).join("");
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(MONTH_NAMES[month])} ${year} Leave Tracker</title><style>@page{size:landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#173b29;margin:0}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:14px}h1{font-size:22px;margin:0}.company{font-size:18px}.legend{text-align:center;background:#75b485;color:white;padding:7px;font-size:10px}table{width:100%;border-collapse:collapse;font-size:8px}th,td{border:1px solid #aebcaf;text-align:center;padding:4px 2px}thead{background:#397849;color:white}.name{text-align:left;white-space:nowrap}.off{background:#e5e7e6}.holiday{background:#fff0c2}.total{background:#d6ead9}.note{font-size:9px;color:#516b5b;margin-top:8px}</style></head><body><header><h1>${escapeHtml(MONTH_NAMES[month])} ${year} — Employee Leave Tracker</h1><div class="company">${escapeHtml(companyName)}</div></header><div class="legend">${escapeHtml(LEGEND)}</div><table><thead><tr><th rowspan="2">ID</th><th rowspan="2">Employee</th>${days.map((day) => `<th>${DAY_NAMES[new Date(year, month, day).getDay()]}</th>`).join("")}${LEAVE_CODES.map((code) => `<th rowspan="2">${code}</th>`).join("")}</tr><tr>${days.map((day) => `<th>${day}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table><div class="note">Weekly off: ${Array.from(weeklyOffDays).map((day) => DAY_NAMES[day]).join(", ")} · Generated from ERP attendance and approved leave records.</div></body></html>`);
    printWindowWhenReady(printWindow, { delayMs: 120 });
  }

  return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[8px] border border-[#d9e1ed] bg-[#f7f9fc] shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-3 border-b border-[#dce4ef] bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf1ff] text-[#2f67e8]"><CalendarDays className="h-5 w-5" /></span>
            <div>
              <h1 className="text-[21px] font-semibold text-[#1f3152]">Employee Leave Tracker</h1>
              <p className="mt-1 text-[12px] text-[#71809a]">Review yearly leave usage and drill into the monthly calendar.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onAddEmployee} className="h-9 rounded-[8px] bg-[#ed711c] px-3 text-[11px] text-white shadow-[0_6px_14px_rgba(237,113,28,0.2)] hover:bg-[#d76013]"><Plus className="h-3.5 w-3.5" /> Add Employee</Button>
            <select aria-label="Report year" value={year} onChange={(event) => setYear(Number(event.target.value))} className="h-9 rounded-[8px] border border-[#d7dfeb] bg-white px-3 text-[12px] font-medium text-[#34435f] outline-none focus:border-[#7ba7e8]">{years.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <Button variant="outline" onClick={printReport} disabled={loading} className="h-9 rounded-[8px] px-3 text-[11px]"><Printer className="h-3.5 w-3.5" /> Print</Button>
            <Button onClick={() => void exportWorkbook()} disabled={loading || exporting} className="h-9 rounded-[8px] bg-[#2f67e8] px-3 text-[11px] text-white hover:bg-[#285bcf]"><Download className="h-3.5 w-3.5" /> {exporting ? "Exporting..." : "Export Excel"}</Button>
            <button type="button" onClick={onClose} aria-label="Close leave tracker" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d7dfeb] bg-white text-[#61708a] transition hover:bg-[#f4f7fb]"><X className="h-4 w-4" /></button>
          </div>
        </div>
        {view === "monthly" ? <div className="flex flex-col gap-3 border-b border-[#dce4ef] bg-[#f8fbff] px-5 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-semibold text-[#345340]">Weekly off ({weeklyOffDays.size} day{weeklyOffDays.size === 1 ? "" : "s"})</span>
            {DAY_NAMES.map((name, day) => (
              <button
                key={name}
                type="button"
                aria-pressed={weeklyOffDays.has(day)}
                onClick={() => toggleWeeklyOff(day)}
                className={`h-8 min-w-10 rounded-[7px] border px-2 text-[10px] font-semibold transition ${weeklyOffDays.has(day) ? "border-[#397849] bg-[#397849] text-white" : "border-[#cfdbd2] bg-white text-[#65776a] hover:bg-[#f0f5f1]"}`}
              >
                {name}
              </button>
            ))}
            {weeklyOffOverride !== null ? <button type="button" onClick={() => setWeeklyOffOverride(null)} className="ml-1 text-[10px] font-medium text-[#397849] hover:underline">Use shift default</button> : null}
          </div>
          <Button variant="outline" onClick={() => router.push("/app/payroll-hr/shifts-holidays")} className="h-8 rounded-[8px] px-3 text-[10px]"><Settings2 className="h-3.5 w-3.5" /> Manage shifts & holidays</Button>
        </div> : null}
        {view === "monthly" ? <div className="flex items-center justify-between border-b border-[#dce4ef] bg-white px-5 py-3">
          <div><h2 className="text-[17px] font-semibold text-[#25365b]">{MONTH_NAMES[month]} {year}</h2><p className="mt-0.5 text-[10px] text-[#7b8aa1]">Day-by-day employee leave calendar</p></div>
          <div className="text-right"><div className="text-[14px] font-semibold text-[#25365b]">{companyName}</div><div className="text-[10px] text-[#71809a]">Weekly off: {Array.from(weeklyOffDays).map((day) => DAY_NAMES[day]).join(", ")}</div></div>
        </div> : null}
        <div className="min-h-0 flex-1 overflow-auto bg-[#f7f9fc] p-4">
          {loading ? <div className="flex min-h-80 items-center justify-center text-sm text-[#708176]">Preparing leave tracker...</div> : employees.length ? (view === "summary" ? <SummaryTable employees={employees} leaveMap={leaveMap} /> : <MonthlyTable year={year} month={month} employees={employees} weeklyOffDays={weeklyOffDays} holidays={holidays} leaveMap={leaveMap} />) : <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[18px] border border-dashed border-[#cbdccf] bg-[linear-gradient(180deg,#fbfdfb_0%,#f4f8f5_100%)] px-6 text-center text-sm text-[#708176]"><LeaveTrackerEmptyIllustration /><div className="text-[16px] font-semibold text-[#31543c]">No leave tracker data for {year}</div><div className="mt-2 max-w-[420px] text-[11px] leading-5 text-[#7f9185]">Import employee attendance or approve a leave request. The monthly calendar and yearly Excel report will be generated automatically.</div></div>}
        </div>
        <div className="shrink-0 border-t border-[#d7dfeb] bg-white px-4 py-2.5 shadow-[0_-8px_22px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-1 overflow-x-auto" aria-label="Leave tracker period navigation">
            <button type="button" onClick={() => setView("summary")} className={`h-8 shrink-0 rounded-[8px] px-3 text-[10px] font-semibold transition ${view === "summary" ? "bg-[#2f67e8] text-white shadow-[0_5px_12px_rgba(47,103,232,0.22)]" : "border border-[#d7dfeb] bg-white text-[#607089] hover:border-[#a9bfe8] hover:bg-[#f5f8ff]"}`}>Year Summary</button>
            <span className="mx-1 h-5 w-px shrink-0 bg-[#dce4ef]" />
            {MONTH_NAMES.map((name, index) => (
              <button
                key={name}
                type="button"
                onClick={() => { setMonth(index); setView("monthly"); }}
                aria-current={view === "monthly" && month === index ? "page" : undefined}
                className={`h-8 min-w-[62px] flex-1 shrink-0 rounded-[8px] px-2 text-[10px] font-semibold transition ${view === "monthly" && month === index ? "bg-[#2f67e8] text-white shadow-[0_5px_12px_rgba(47,103,232,0.22)]" : "border border-[#d7dfeb] bg-white text-[#607089] hover:border-[#a9bfe8] hover:bg-[#f5f8ff]"}`}
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>
  );
}
