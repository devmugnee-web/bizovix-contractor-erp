"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CalendarCheck, CalendarClock, CalendarDays, CalendarRange, Check, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePayrollSettingsQuery, useUpdatePayrollSettingsMutation } from "@/hooks/use-hr-query";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const CYCLE_OPTIONS = [
  { value: "CALENDAR_MONTH", title: "Calendar month", note: "From the 1st to month end", icon: CalendarDays },
  { value: "CUSTOM_CUTOFF", title: "Custom cut-off", note: "Choose your office cycle day", icon: CalendarClock },
] as const;

function periodPreview(startDay: number) {
  if (startDay === 1) return "1st day to last day of every month";
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - (today.getDate() < startDay ? 1 : 0), startDay);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, startDay - 1);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function PayrollRulesForm({ onClose }: { onClose: () => void }) {
  const settingsQuery = usePayrollSettingsQuery(true);
  const updateMutation = useUpdatePayrollSettingsMutation();
  const [cycleType, setCycleType] = useState<"CALENDAR_MONTH" | "CUSTOM_CUTOFF">("CALENDAR_MONTH");
  const [cycleStartDay, setCycleStartDay] = useState("1");
  const [paymentDay, setPaymentDay] = useState("1");

  useEffect(() => {
    if (!settingsQuery.data) return;
    setCycleType(settingsQuery.data.cycleType);
    setCycleStartDay(String(settingsQuery.data.cycleStartDay));
    setPaymentDay(String(settingsQuery.data.paymentDay));
  }, [settingsQuery.data]);

  const startDay = Math.min(28, Math.max(1, Number(cycleStartDay) || 1));
  const preview = useMemo(() => periodPreview(cycleType === "CALENDAR_MONTH" ? 1 : startDay), [cycleType, startDay]);

  async function handleSave() {
    const payDay = Number(paymentDay);
    if (!Number.isInteger(payDay) || payDay < 1 || payDay > 28) {
      toast.error("Payment day must be between 1 and 28.");
      return;
    }
    try {
      await updateMutation.mutateAsync({ cycleType, cycleStartDay: cycleType === "CALENDAR_MONTH" ? 1 : startDay, paymentDay: payDay });
      toast.success("Payroll cycle saved.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save payroll rules.");
    }
  }

  if (settingsQuery.isLoading) return <div className="px-5 py-10 text-center text-[12px] text-[#74839a]">Loading payroll rules...</div>;

  return (
    <>
      <div className="space-y-5 px-5 py-5">
        <div>
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[12px] font-semibold text-[#314764]">Choose payroll cycle</p><p className="mt-0.5 text-[10px] text-[#7d8ba0]">How attendance days are grouped for salary calculation.</p></div>
            <span className="rounded-full bg-[#edf3ff] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#3569dc]">Required</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {CYCLE_OPTIONS.map(({ value, title, note, icon: Icon }) => {
              const selected = cycleType === value;
              return (
                <button key={value} type="button" aria-pressed={selected} onClick={() => setCycleType(value)} className={cn("group relative flex min-h-[76px] items-center gap-3 rounded-[13px] border p-3 text-left transition-all", selected ? "border-[#4d7fee] bg-[#f3f7ff] shadow-[0_4px_14px_rgba(47,103,232,0.10)] ring-1 ring-[#4d7fee]" : "border-[#dfe6ef] bg-white hover:border-[#b9cdf5] hover:bg-[#fbfdff]")}>
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] transition-colors", selected ? "bg-[#2f67e8] text-white" : "bg-[#eef3fb] text-[#6680a5] group-hover:text-[#2f67e8]")}><Icon className="h-[19px] w-[19px]" /></span>
                  <span className="min-w-0"><span className="block text-[12px] font-semibold text-[#263b59]">{title}</span><span className="mt-1 block text-[10px] leading-4 text-[#7d8ba0]">{note}</span></span>
                  {selected ? <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#dce8ff] text-[#2f67e8]"><Check className="h-3 w-3" strokeWidth={3} /></span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="payroll-cycle-start" className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#5b6b83]"><CalendarDays className="h-3.5 w-3.5 text-[#4d7fee]" />Cycle starts</label>
            <Input id="payroll-cycle-start" type="number" min={1} max={28} disabled={cycleType === "CALENDAR_MONTH"} value={cycleType === "CALENDAR_MONTH" ? "1" : cycleStartDay} onChange={(event) => setCycleStartDay(event.target.value)} className="h-10 rounded-[9px] text-[13px]" />
          </div>
          <div>
            <label htmlFor="payroll-cycle-end" className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#5b6b83]"><CalendarCheck className="h-3.5 w-3.5 text-[#4d7fee]" />Cycle ends</label>
            <Input id="payroll-cycle-end" disabled value={cycleType === "CALENDAR_MONTH" ? "Month end" : String(startDay === 1 ? "Month end" : startDay - 1)} className="h-10 rounded-[9px] bg-[#f5f7fa] text-[13px]" />
          </div>
          <div>
            <label htmlFor="payroll-payment-day" className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#5b6b83]"><Banknote className="h-3.5 w-3.5 text-[#20a36a]" />Salary paid on</label>
            <Input id="payroll-payment-day" type="number" min={1} max={28} value={paymentDay} onChange={(event) => setPaymentDay(event.target.value)} className="h-10 rounded-[9px] border-[#cfe8dc] bg-[#fbfffd] text-[13px] focus-visible:ring-[#20a36a]/25" />
          </div>
        </div>

        <div className="rounded-[13px] border border-[#d7e3fb] bg-white p-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-white text-[#2f67e8] shadow-sm"><CalendarRange className="h-[19px] w-[19px]" /></span>
            <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#7486a1]">Current attendance & salary period</p><p className="mt-1 text-[13px] font-semibold text-[#294361]">{preview}</p></div>
          </div>
          <div className="mt-3 flex items-start gap-2 border-t border-[#e2eafb] pt-3 text-[10px] leading-4 text-[#657790]"><CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4d7fee]" /><p>End date is calculated automatically to prevent duplicate days. Example: a start day of 21 creates a cycle from 21 July to 20 August.</p></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
        <Button variant="outline" onClick={onClose} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
        <Button onClick={() => void handleSave()} disabled={updateMutation.isPending} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]"><Save className="h-3.5 w-3.5" />{updateMutation.isPending ? "Saving..." : "Save Payroll Rules"}</Button>
      </div>
    </>
  );
}
