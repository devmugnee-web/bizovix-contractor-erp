"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock3, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import { HrEmptyState } from "@/components/shared/hr-empty-state";
import {
  useCreateHolidayMutation,
  useCreateShiftMutation,
  useDeleteHolidayMutation,
  useDeleteShiftMutation,
  useHolidaysQuery,
  useShiftsQuery,
} from "@/hooks/use-hr-query";
import { formatDate } from "@/lib/format";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function emptyShiftForm() {
  return { name: "", startTime: "09:00", endTime: "18:00", gracePeriodMinutes: "15", weeklyOffDays: [5] as number[], isDefault: false };
}

function emptyHolidayForm() {
  return { name: "", date: "", isRecurringYearly: false };
}

export function ShiftsHolidaysScreen() {
  const router = useRouter();
  const shiftsQuery = useShiftsQuery(true);
  const holidaysQuery = useHolidaysQuery(true);
  const createShiftMutation = useCreateShiftMutation();
  const deleteShiftMutation = useDeleteShiftMutation();
  const createHolidayMutation = useCreateHolidayMutation();
  const deleteHolidayMutation = useDeleteHolidayMutation();

  const [shiftForm, setShiftForm] = useState(emptyShiftForm());
  const [holidayForm, setHolidayForm] = useState(emptyHolidayForm());

  const shifts = shiftsQuery.data ?? [];
  const holidays = holidaysQuery.data ?? [];

  function toggleWeeklyOffDay(day: number) {
    setShiftForm((prev) => ({
      ...prev,
      weeklyOffDays: prev.weeklyOffDays.includes(day) ? prev.weeklyOffDays.filter((d) => d !== day) : [...prev.weeklyOffDays, day].sort(),
    }));
  }

  async function handleAddShift() {
    const name = shiftForm.name.trim();
    if (!name) {
      toast.error("Shift name is required.");
      return;
    }
    if (!shiftForm.startTime || !shiftForm.endTime) {
      toast.error("Start and end time are required.");
      return;
    }
    try {
      await createShiftMutation.mutateAsync({
        name,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        gracePeriodMinutes: Number(shiftForm.gracePeriodMinutes) || 0,
        weeklyOffDays: shiftForm.weeklyOffDays,
        isDefault: shiftForm.isDefault,
      });
      setShiftForm(emptyShiftForm());
      toast.success(`${name} shift added.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this shift.");
    }
  }

  async function handleDeleteShift(id: string, name: string) {
    try {
      await deleteShiftMutation.mutateAsync(id);
      toast.success(`${name} shift removed.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove this shift.");
    }
  }

  async function handleAddHoliday() {
    const name = holidayForm.name.trim();
    if (!name) {
      toast.error("Holiday name is required.");
      return;
    }
    if (!holidayForm.date) {
      toast.error("Holiday date is required.");
      return;
    }
    try {
      await createHolidayMutation.mutateAsync({ name, date: holidayForm.date, isRecurringYearly: holidayForm.isRecurringYearly });
      setHolidayForm(emptyHolidayForm());
      toast.success(`${name} added to holidays.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this holiday.");
    }
  }

  async function handleDeleteHoliday(id: string, name: string) {
    try {
      await deleteHolidayMutation.mutateAsync(id);
      toast.success(`${name} removed.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove this holiday.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto rounded-[8px] border border-[#d9e1ed] bg-[#f7f9fc] shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <header className="flex items-center gap-3 border-b border-[#dce4ef] bg-white px-5 py-4">
        <button
          type="button"
          onClick={() => router.push("/app/payroll-hr?section=settings")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#3e4f70] transition hover:bg-[#f4f8fc]"
          aria-label="Back to HR & Payroll Settings"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-[20px] font-semibold leading-tight text-[#192c4d]">Shifts & Holidays</h1>
          <p className="mt-0.5 text-[12px] text-[#71809a]">Set office working hours, grace period, weekly off days and company holidays.</p>
        </div>
      </header>

      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-2 lg:p-5">
        <section className="flex flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e1e7f0] px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#eef4ff] text-[#2f67e8]"><Clock3 className="h-4 w-4" /></span>
            <h2 className="text-[14px] font-semibold text-[#223754]">Shifts</h2>
          </div>

          <div className="border-b border-[#eef1f6] px-4 py-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Name</label>
                <Input className="h-9 rounded-[8px] text-[13px]" placeholder="e.g. General Shift" value={shiftForm.name} onChange={(e) => setShiftForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Start Time</label>
                <input type="time" className="h-9 w-full rounded-[8px] border border-border bg-white px-2 text-[13px]" value={shiftForm.startTime} onChange={(e) => setShiftForm((p) => ({ ...p, startTime: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">End Time</label>
                <input type="time" className="h-9 w-full rounded-[8px] border border-border bg-white px-2 text-[13px]" value={shiftForm.endTime} onChange={(e) => setShiftForm((p) => ({ ...p, endTime: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Grace (min)</label>
                <Input className="h-9 rounded-[8px] text-[13px]" type="number" min={0} step={1} value={shiftForm.gracePeriodMinutes} onChange={(e) => setShiftForm((p) => ({ ...p, gracePeriodMinutes: e.target.value }))} />
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1.5 block text-[11px] font-medium text-[#5b6b83]">Weekly Off Days</label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleWeeklyOffDay(index)}
                    className={`h-8 rounded-[7px] px-3 text-[11px] font-medium transition ${shiftForm.weeklyOffDays.includes(index) ? "bg-[#2f67e8] text-white" : "border border-[#d7e0ec] bg-white text-[#5b6b83] hover:bg-[#f5f9ff]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-3 flex items-center gap-2 text-[12px] text-[#4a5b73]">
              <input type="checkbox" checked={shiftForm.isDefault} onChange={(e) => setShiftForm((p) => ({ ...p, isDefault: e.target.checked }))} className="h-4 w-4 rounded border-[#c5d1dd] text-[#2f67e8]" />
              Set as default shift
            </label>

            <Button onClick={() => void handleAddShift()} disabled={createShiftMutation.isPending} className="mt-3 h-9 rounded-[8px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">
              {createShiftMutation.isPending ? "Adding..." : "Add Shift"}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {shifts.length === 0 ? (
              <HrEmptyState compact icon={Clock3} title="No shifts added yet" description="Create a shift and select its weekly off days." />
            ) : (
              <ul className="divide-y divide-[#eef1f6]">
                {shifts.map((shift) => (
                  <li key={shift.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[#223754]">{shift.name}</span>
                        {shift.isDefault ? <span className="inline-flex h-5 items-center rounded-full bg-[#eef4ff] px-2 text-[10px] font-semibold text-[#255fcf]">Default</span> : null}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#8592a5]">
                        {shift.startTime} – {shift.endTime} · {shift.gracePeriodMinutes}m grace
                        {shift.weeklyOffDays.length > 0 ? ` · Off: ${shift.weeklyOffDays.map((d) => DAY_LABELS[d]).join(", ")}` : ""}
                      </div>
                    </div>
                    <button type="button" onClick={() => void handleDeleteShift(shift.id, shift.name)} disabled={deleteShiftMutation.isPending} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[#8592a5] hover:bg-[#fdecec] hover:text-[#c2410c]" aria-label={`Delete ${shift.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="flex flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e1e7f0] px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#eef4ff] text-[#2f67e8]"><CalendarDays className="h-4 w-4" /></span>
            <h2 className="text-[14px] font-semibold text-[#223754]">Holidays</h2>
          </div>

          <div className="border-b border-[#eef1f6] px-4 py-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Name</label>
                <Input className="h-9 rounded-[8px] text-[13px]" placeholder="e.g. Independence Day" value={holidayForm.name} onChange={(e) => setHolidayForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[#5b6b83]">Date</label>
                <AppDateInput aria-label="Date" value={holidayForm.date} onChange={(value) => setHolidayForm((p) => ({ ...p, date: value }))} inputClassName="h-9 rounded-[8px] text-[13px]" />
              </div>
            </div>

            <label className="mt-3 flex items-center gap-2 text-[12px] text-[#4a5b73]">
              <input type="checkbox" checked={holidayForm.isRecurringYearly} onChange={(e) => setHolidayForm((p) => ({ ...p, isRecurringYearly: e.target.checked }))} className="h-4 w-4 rounded border-[#c5d1dd] text-[#2f67e8]" />
              Repeats every year
            </label>

            <Button onClick={() => void handleAddHoliday()} disabled={createHolidayMutation.isPending} className="mt-3 h-9 rounded-[8px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">
              {createHolidayMutation.isPending ? "Adding..." : "Add Holiday"}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {holidays.length === 0 ? (
              <HrEmptyState compact icon={CalendarDays} title="No holidays added yet" description="Add company holidays to the HR calendar." />
            ) : (
              <ul className="divide-y divide-[#eef1f6]">
                {holidays.map((holiday) => (
                  <li key={holiday.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[#223754]">{holiday.name}</span>
                        {holiday.isRecurringYearly ? <span className="inline-flex h-5 items-center rounded-full bg-[#fff3e0] px-2 text-[10px] font-semibold text-[#c2740d]">Yearly</span> : null}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#8592a5]">{formatDate(holiday.date)}</div>
                    </div>
                    <button type="button" onClick={() => void handleDeleteHoliday(holiday.id, holiday.name)} disabled={deleteHolidayMutation.isPending} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[#8592a5] hover:bg-[#fdecec] hover:text-[#c2410c]" aria-label={`Delete ${holiday.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
