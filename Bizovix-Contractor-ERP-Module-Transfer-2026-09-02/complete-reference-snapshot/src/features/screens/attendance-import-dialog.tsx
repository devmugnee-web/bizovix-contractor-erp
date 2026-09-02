"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useImportAttendanceMutation } from "@/hooks/use-hr-query";
import { formatDate, formatHoursFromMinutes } from "@/lib/format";
import type { AttendanceImportRow, AttendanceStatus } from "@/types/hr";

const allowedStatuses = new Set<AttendanceStatus>(["PRESENT", "ABSENT", "LEAVE", "HOLIDAY"]);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

interface SkippedRow {
  row: number;
  reason: string;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function normalizedKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// A single value may legitimately be missing from a given sheet (not every
// export has "Notes", say) — pick() just tries every alias this app knows
// for that field and returns the first one the sheet actually has.
function pick(values: Map<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (values.has(key)) {
      const value = values.get(key);
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
  }
  return undefined;
}

function normalizeYear(text: string) {
  const value = Number(text);
  return value < 100 ? 2000 + value : value;
}

// Every biometric/HR tool exports dates its own way — this covers actual
// Date cells (from xlsx's cellDates), Excel serial numbers, ISO text,
// "01-Jul-26"/"01-Jul-2026", and DD/MM/YYYY or MM/DD/YYYY slashes/dashes —
// before falling back to whatever the JS Date constructor can manage.
function parseFlexibleDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{2,4})$/.exec(text);
  if (named) {
    const monthIndex = MONTHS.indexOf(named[2].toLowerCase().slice(0, 3));
    if (monthIndex >= 0) {
      return `${normalizeYear(named[3])}-${pad(monthIndex + 1)}-${pad(Number(named[1]))}`;
    }
  }

  const slashed = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (slashed) {
    let day = Number(slashed[1]);
    let month = Number(slashed[2]);
    if (month > 12 && day <= 12) [day, month] = [month, day];
    const year = normalizeYear(slashed[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`;
  }

  const asSerial = Number(text);
  if (Number.isFinite(asSerial) && asSerial > 20000 && asSerial < 80000) {
    const millis = Math.round((asSerial - 25569) * 86400 * 1000);
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  const native = new Date(text);
  if (!Number.isNaN(native.getTime())) return `${native.getFullYear()}-${pad(native.getMonth() + 1)}-${pad(native.getDate())}`;
  return null;
}

// Check-in/out is a time-of-day, not a duration — accepts "10:17", "10:17
// AM/PM", a Date cell, or an Excel time-of-day fraction (e.g. 0.4284 == 10:17).
function parseTimeOfDay(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;

  const clock = /^(\d{1,2}):([0-5]\d)(?::\d{2})?\s*(AM|PM|am|pm)?$/.exec(text);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2]);
    const meridiem = clock[3]?.toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23) return `${pad(hour)}:${pad(minute)}`;
  }

  const fraction = Number(text);
  if (Number.isFinite(fraction) && fraction >= 0 && fraction < 1) {
    const totalMinutes = Math.round(fraction * 24 * 60);
    return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
  }
  return null;
}

// Late/overtime is a duration — "01:17" means 77 minutes here, not 1:17am,
// so it gets its own parser rather than reusing parseTimeOfDay.
function parseDurationMinutes(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const text = String(value).trim();
  const duration = /^(\d{1,3}):([0-5]\d)$/.exec(text);
  if (duration) return Number(duration[1]) * 60 + Number(duration[2]);
  const asNumber = Number(text);
  return Number.isFinite(asNumber) && asNumber >= 0 ? Math.round(asNumber) : 0;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "y" || text === "1";
}

async function parseAttendanceFile(file: File) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The workbook does not contain a sheet.");
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });

  const rows: AttendanceImportRow[] = [];
  const skipped: SkippedRow[] = [];

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; // account for the header row
    const values = new Map(Object.entries(raw).map(([key, value]) => [normalizedKey(key), value]));

    const employeeCode = String(pick(values, ["employeecode", "code", "empcode", "staffcode", "staffid", "id"]) ?? "").trim() || undefined;
    const employeeName = String(pick(values, ["name", "employeename", "empname", "staffname"]) ?? "").trim() || undefined;
    if (!employeeCode && !employeeName) {
      skipped.push({ row: rowNumber, reason: "No employee code or name column found for this row." });
      return;
    }

    const dateValue = pick(values, ["date", "attendancedate", "workdate", "day"]);
    const date = parseFlexibleDate(dateValue);
    if (!date) {
      skipped.push({ row: rowNumber, reason: `Could not read a date from "${String(dateValue ?? "")}".` });
      return;
    }

    const checkIn = parseTimeOfDay(pick(values, ["checkin", "clockin", "timein", "in"]));
    const checkOut = parseTimeOfDay(pick(values, ["checkout", "clockout", "timeout", "out"]));
    const lateMinutes = parseDurationMinutes(pick(values, ["lateminutes", "late", "latetime", "latehours", "latemins"]));
    const overtimeMinutes = parseDurationMinutes(pick(values, ["overtimeminutes", "overtime", "ot", "othours", "otmins"]));
    const absentFlag = parseBoolean(pick(values, ["absent", "isabsent"]));
    const leaveFlag = parseBoolean(pick(values, ["leave", "onleave", "isleave"]));
    const holidayFlag = parseBoolean(pick(values, ["holiday", "isholiday"]));
    const explicitStatus = String(pick(values, ["status", "attendancestatus"]) ?? "").trim().toUpperCase();

    let status: AttendanceStatus;
    if (allowedStatuses.has(explicitStatus as AttendanceStatus)) status = explicitStatus as AttendanceStatus;
    else if (absentFlag) status = "ABSENT";
    else if (leaveFlag) status = "LEAVE";
    else if (holidayFlag) status = "HOLIDAY";
    else if (checkIn || checkOut) status = "PRESENT";
    else {
      skipped.push({ row: rowNumber, reason: "No status, check-in/out or absent marker — nothing to import from this row." });
      return;
    }

    rows.push({
      employeeCode,
      employeeName,
      date,
      status,
      checkIn: checkIn ?? undefined,
      checkOut: checkOut ?? undefined,
      lateMinutes,
      overtimeMinutes,
      notes: String(pick(values, ["notes", "remarks", "comment"]) ?? "").trim() || undefined,
    });
  });

  return { rows, skipped };
}

export function AttendanceImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<AttendanceImportRow[]>([]);
  const [skippedRows, setSkippedRows] = useState<SkippedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const importMutation = useImportAttendanceMutation();
  const preview = useMemo(() => rows.slice(0, 8), [rows]);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet([
      { "Employee Code": "EMP-0001", Name: "", Date: new Date().toISOString().slice(0, 10), "Check In": "09:00", "Check Out": "18:00", Late: "00:00", Overtime: "00:00", Absent: "", Notes: "" },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Attendance");
    XLSX.writeFile(workbook, "attendance-import-template.xlsx");
  }

  async function selectFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error("Select an .xlsx, .xls, or .csv file.");
      return;
    }
    try {
      setParsing(true);
      const { rows: parsed, skipped } = await parseAttendanceFile(file);
      if (!parsed.length) throw new Error("No usable attendance rows were found in this sheet.");
      setFileName(file.name);
      setRows(parsed);
      setSkippedRows(skipped);
    } catch (error) {
      setFileName("");
      setRows([]);
      setSkippedRows([]);
      toast.error(error instanceof Error ? error.message : "Could not read the attendance file.");
    } finally {
      setParsing(false);
    }
  }

  async function importRows() {
    try {
      const result = await importMutation.mutateAsync(rows);
      const skippedTotal = skippedRows.length + result.skipped;
      toast.success(
        skippedTotal > 0
          ? `${result.imported} row${result.imported === 1 ? "" : "s"} imported, ${skippedTotal} skipped.`
          : `${result.imported} attendance row${result.imported === 1 ? "" : "s"} imported.`,
      );
      setRows([]);
      setSkippedRows([]);
      setFileName("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attendance import failed.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,860px)] max-h-[88vh] overflow-y-auto overflow-x-hidden rounded-[16px] p-0">
        <div className="flex items-start justify-between border-b border-[#e1e7f0] px-5 py-4 pr-12">
          <div>
            <DialogTitle className="text-[18px] font-semibold text-[#203553]">Import Attendance from Excel</DialogTitle>
            <DialogDescription className="mt-1 text-[12px] text-[#77869c]">
              Any layout works — column names, order and date/time format don&apos;t matter. We detect Employee Code or Name, Date, Check In/Out, Late, Overtime and Absent automatically.
            </DialogDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => void downloadTemplate()} className="h-9 shrink-0 rounded-[9px] text-[11px]"><Download className="h-4 w-4" /> Download Template</Button>
        </div>
        <div className="space-y-4 p-5">
          <label className="flex min-h-[130px] cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed border-[#b8c8e3] bg-[#f8fbff] text-center transition hover:border-[#6f9af0]">
            <FileSpreadsheet className="h-8 w-8 text-[#2f67e8]" />
            <span className="mt-2 text-[13px] font-semibold text-[#30435e]">{parsing ? "Reading file…" : fileName || "Choose attendance Excel sheet"}</span>
            <span className="mt-1 text-[11px] text-[#7b8aa1]">.xlsx, .xls or .csv · any column layout · maximum 5,000 rows</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={parsing} onChange={(event) => void selectFile(event.target.files?.[0])} />
          </label>

          {preview.length ? (
            <div className="overflow-hidden rounded-[12px] border border-[#dce4ef]">
              <div className="flex items-center justify-between bg-[#f7f9fc] px-3 py-2 text-[11px] font-semibold text-[#52647f]"><span>Preview</span><span>{rows.length} rows ready</span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[11px]">
                  <thead>
                    <tr className="border-t border-[#e3e9f1] bg-white text-[#66768d]">
                      <th className="px-3 py-2 text-left">Employee</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Check In</th>
                      <th className="px-3 py-2 text-left">Check Out</th>
                      <th className="px-3 py-2 text-right">Late</th>
                      <th className="px-3 py-2 text-right">Overtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, index) => (
                      <tr key={`${row.employeeCode ?? row.employeeName}-${row.date}-${index}`} className="border-t border-[#edf1f6]">
                        <td className="px-3 py-2 font-medium">{row.employeeCode ?? row.employeeName}</td>
                        <td className="px-3 py-2">{formatDate(row.date)}</td>
                        <td className="px-3 py-2">{row.status}</td>
                        <td className="px-3 py-2">{row.checkIn ?? "—"}</td>
                        <td className="px-3 py-2">{row.checkOut ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{row.lateMinutes ?? 0}m</td>
                        <td className="px-3 py-2 text-right">{formatHoursFromMinutes(row.overtimeMinutes ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {skippedRows.length ? (
            <div className="overflow-hidden rounded-[12px] border border-[#f3dfbd] bg-[#fffaf2]">
              <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-[#a1650b]">
                <AlertTriangle className="h-3.5 w-3.5" /> {skippedRows.length} row{skippedRows.length === 1 ? "" : "s"} couldn&apos;t be read and will be skipped
              </div>
              <ul className="max-h-[120px] overflow-y-auto divide-y divide-[#f3e4c6] px-3 py-1 text-[11px] text-[#8a6a2a]">
                {skippedRows.slice(0, 20).map((entry) => (
                  <li key={entry.row} className="py-1">Row {entry.row}: {entry.reason}</li>
                ))}
                {skippedRows.length > 20 ? <li className="py-1">…and {skippedRows.length - 20} more.</li> : null}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3"><Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px]">Cancel</Button><Button disabled={!rows.length || importMutation.isPending} onClick={() => void importRows()} className="h-9 rounded-[9px] bg-[#2f67e8] text-white hover:bg-[#2459ce]"><Upload className="h-4 w-4" /> {importMutation.isPending ? "Importing…" : `Import ${rows.length || ""} Rows`}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
