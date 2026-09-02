"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePayrollSettingsQuery, useUpdatePayrollSettingsMutation } from "@/hooks/use-hr-query";
import type { SalaryComponent } from "@/types/hr";

export function SalaryComponentsForm({ onClose }: { onClose: () => void }) {
  const settingsQuery = usePayrollSettingsQuery(true);
  const updateMutation = useUpdatePayrollSettingsMutation();
  const [components, setComponents] = useState<Array<{ name: string; percent: string }>>([]);

  useEffect(() => {
    if (settingsQuery.data) setComponents((settingsQuery.data.salaryComponents ?? []).map((item) => ({ name: item.name, percent: String(item.percent) })));
  }, [settingsQuery.data]);

  const total = useMemo(() => components.reduce((sum, item) => sum + (Number(item.percent) || 0), 0), [components]);

  async function handleSave() {
    const normalized: SalaryComponent[] = components.map((item) => ({ name: item.name.trim(), percent: Number(item.percent) || 0 }));
    if (normalized.some((item) => !item.name)) return void toast.error("Every component needs a name.");
    if (Math.abs(total - 100) > 0.001) return void toast.error("Salary component percentages must total 100%.");
    if (!settingsQuery.data) return;
    try {
      await updateMutation.mutateAsync({
        cycleType: settingsQuery.data.cycleType,
        cycleStartDay: settingsQuery.data.cycleStartDay,
        paymentDay: settingsQuery.data.paymentDay,
        salaryComponents: normalized,
      });
      toast.success("Default salary structure saved.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save salary components.");
    }
  }

  if (settingsQuery.isLoading) return <div className="px-5 py-10 text-center text-[12px] text-[#74839a]">Loading salary components...</div>;

  return (
    <>
      <div className="space-y-3 px-5 py-5">
        <div className="flex items-center justify-between rounded-[11px] border border-[#d9e5fb] bg-[#f5f8ff] px-3.5 py-3">
          <div><p className="text-[12px] font-semibold text-[#294361]">Default earning structure</p><p className="mt-0.5 text-[10px] text-[#74839a]">Applied automatically when a new employee is created.</p></div>
          <span className={`text-[16px] font-bold ${Math.abs(total - 100) < 0.001 ? "text-[#15925f]" : "text-[#dc2626]"}`}>{total}%</span>
        </div>
        <div className="space-y-2">
          {components.map((component, index) => (
            <div key={index} className="grid grid-cols-[1fr_100px_34px] gap-2">
              <Input value={component.name} placeholder="Component name" onChange={(event) => setComponents((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} className="h-9 rounded-[8px] text-[12px]" />
              <div className="relative"><Input type="number" min={0} max={100} step="0.01" value={component.percent} onChange={(event) => setComponents((items) => items.map((item, i) => i === index ? { ...item, percent: event.target.value } : item))} className="h-9 rounded-[8px] pr-7 text-[12px]" /><span className="absolute right-2.5 top-2.5 text-[11px] text-[#8491a5]">%</span></div>
              <button type="button" aria-label={`Remove ${component.name || "component"}`} disabled={components.length === 1} onClick={() => setComponents((items) => items.filter((_, i) => i !== index))} className="grid h-9 place-items-center rounded-[8px] border border-[#e1e7f0] text-[#9aa6b7] hover:border-[#fecaca] hover:text-[#dc2626] disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setComponents((items) => [...items, { name: "", percent: "0" }])} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2f67e8]"><Plus className="h-3.5 w-3.5" /> Add component</button>
        <p className="text-[10px] leading-5 text-[#7d8ba0]">Existing employees keep their own saved salary structure. This default is used only for newly added employees.</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
        <Button variant="outline" onClick={onClose} className="h-9 rounded-[9px] px-4 text-[12px]">Cancel</Button>
        <Button onClick={() => void handleSave()} disabled={updateMutation.isPending || Math.abs(total - 100) > 0.001} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[12px] text-white hover:bg-[#2459ce]">{updateMutation.isPending ? "Saving..." : "Save Components"}</Button>
      </div>
    </>
  );
}
