"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Save, Trash2 } from "lucide-react";
import { apiRequest, useCalculatePayroll, useHrCommand, useHrEmployees, useHrPayrollRuns } from "@bizovix/api-client";
import { FormField, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { formatAmount } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

type PayrollSettings = { cycleType: string; cycleStartDay: number; paymentDay: number; salaryComponents: Array<{ name: string; percent: number }>; updatedAt?: string };
type Entry = { presentDays: string; iouDeduction: string; loanDeduction: string; fineDeduction: string; lunchBillDeduction: string };
const money = (value: string | number | undefined) => formatAmount(value ?? 0);

export function HrPayrollWorkspace() {
  useSetBreadcrumb([{ label: "HR & Payroll", href: "/hr-payroll" }, { label: "Payroll" }]);
  const employees = useHrEmployees(), runs = useHrPayrollRuns(), calculate = useCalculatePayroll(), command = useHrCommand();
  const settings = useQuery({ queryKey: ["hr", "payroll-settings"], queryFn: () => apiRequest<PayrollSettings>("/hr/payroll-settings") });
  const now = new Date();
  const [period, setPeriod] = React.useState({ year: String(now.getFullYear()), month: String(now.getMonth() + 1), workingDays: "26" });
  const [entries, setEntries] = React.useState<Record<string, Entry>>({});
  const [notice, setNotice] = React.useState("");

  function updateEntry(id: string, key: keyof Entry, value: string) { setEntries((current) => ({ ...current, [id]: { ...current[id]!, [key]: value } })); }
  async function runPayroll() {
    try {
      await calculate.mutateAsync({ periodYear: Number(period.year), periodMonth: Number(period.month), totalWorkingDays: Number(period.workingDays), entries: (employees.data ?? []).filter((employee) => employee.status === "ACTIVE").map((employee) => { const row = entries[employee.id] ?? { presentDays: period.workingDays, iouDeduction: "0", loanDeduction: "0", fineDeduction: "0", lunchBillDeduction: "0" }; return { employeeId: employee.id, presentDays: Number(row.presentDays), iouDeduction: Number(row.iouDeduction), loanDeduction: Number(row.loanDeduction), fineDeduction: Number(row.fineDeduction), lunchBillDeduction: Number(row.lunchBillDeduction) }; }) });
      setNotice("Payroll calculated as draft.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Payroll calculation failed."); }
  }
  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const salaryComponents = [{ name: "Basic", percent: Number(values.get("basic")) }, { name: "House Rent", percent: Number(values.get("house")) }, { name: "Medical Allowance", percent: Number(values.get("medical")) }, { name: "Conveyance", percent: Number(values.get("conveyance")) }];
    try { await command.mutateAsync({ path: "payroll-settings", method: "PATCH", body: { cycleType: String(values.get("cycleType")), cycleStartDay: Number(values.get("cycleStartDay")), paymentDay: Number(values.get("paymentDay")), salaryComponents } }); setNotice("Payroll settings saved."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not save payroll settings."); }
  }

  return <div className="space-y-4">
    <div><h1 className="text-page-title text-biz-text">Payroll Management</h1><p className="mt-1 text-sm text-biz-muted">Settings, employee deductions, calculation, approval and payment status</p></div>
    {notice && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-biz-blue">{notice}</div>}
    {settings.data ? <form key={settings.data.updatedAt ?? settings.data.paymentDay} onSubmit={saveSettings} className="rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">Payroll Settings</h2><div className="mt-3 grid gap-3 md:grid-cols-4 xl:grid-cols-7"><FormField label="Cycle"><SelectInput name="cycleType" defaultValue={settings.data.cycleType} options={[{ value: "CALENDAR_MONTH", label: "Calendar Month" }, { value: "CUSTOM_CUTOFF", label: "Custom Cutoff" }]} /></FormField><FormField label="Cycle Start"><TextInput name="cycleStartDay" type="number" min="1" max="28" defaultValue={settings.data.cycleStartDay} /></FormField><FormField label="Payment Day"><TextInput name="paymentDay" type="number" min="1" max="28" defaultValue={settings.data.paymentDay} /></FormField>{[["Basic %", "basic", "basic", 50], ["House %", "house", "house", 25], ["Medical %", "medical", "medical", 15], ["Conveyance %", "conveyance", "conveyance", 10]].map(([fieldLabel, name, find, fallback]) => <FormField key={String(name)} label={String(fieldLabel)}><TextInput name={String(name)} type="number" min="0" defaultValue={settings.data.salaryComponents.find((row) => row.name.toLowerCase().includes(String(find)))?.percent ?? Number(fallback)} /></FormField>)}</div><div className="mt-3 flex justify-end"><SecondaryButton type="submit"><Save className="h-4 w-4" /> Save Settings</SecondaryButton></div></form> : <div className="rounded-lg border border-biz-border bg-white p-4 text-sm text-biz-muted">Loading payroll settings...</div>}
    <section className="rounded-lg border border-biz-border bg-white p-4"><div className="grid gap-3 md:grid-cols-4"><FormField label="Year"><TextInput type="number" value={period.year} onChange={(event) => setPeriod({ ...period, year: event.target.value })} /></FormField><FormField label="Month"><TextInput type="number" min="1" max="12" value={period.month} onChange={(event) => setPeriod({ ...period, month: event.target.value })} /></FormField><FormField label="Working Days"><TextInput type="number" min="1" value={period.workingDays} onChange={(event) => setPeriod({ ...period, workingDays: event.target.value })} /></FormField><div className="flex items-end"><PrimaryButton onClick={runPayroll} disabled={calculate.isPending}>{calculate.isPending ? "Calculating..." : "Calculate Draft"}</PrimaryButton></div></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[950px] text-left text-xs"><thead className="bg-biz-bg"><tr>{["Employee", "Present", "IOU", "Loan", "Fine", "Lunch", "Gross"].map((name) => <th key={name} className="px-3 py-2">{name}</th>)}</tr></thead><tbody>{(employees.data ?? []).filter((row) => row.status === "ACTIVE").map((employee) => { const entry = entries[employee.id] ?? { presentDays: period.workingDays, iouDeduction: "0", loanDeduction: "0", fineDeduction: "0", lunchBillDeduction: "0" }; return <tr key={employee.id} className="border-t"><td className="px-3 py-2"><b>{employee.employeeCode}</b> · {employee.name}</td>{(["presentDays", "iouDeduction", "loanDeduction", "fineDeduction", "lunchBillDeduction"] as Array<keyof Entry>).map((key) => <td key={key} className="px-2 py-2"><TextInput type="number" min="0" className="h-8 w-24" value={entry[key]} onChange={(event) => updateEntry(employee.id, key, event.target.value)} /></td>)}<td className="px-3 py-2 text-right font-semibold">৳ {money(employee.grossSalary)}</td></tr>; })}</tbody></table></div>
    </section>
    <div className="space-y-3">{(runs.data ?? []).map((run) => <section key={run.id} className="rounded-lg border border-biz-border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><b>{run.periodMonth}/{run.periodYear}</b><span className="ml-2 text-xs text-biz-muted">{run.status}</span></div><div className="flex items-center gap-2"><b>Net ৳ {money(run.totalNetPayable)}</b>{run.status === "DRAFT" && <><SecondaryButton size="sm" onClick={() => command.mutate({ path: `payroll-runs/${run.id}/approve`, method: "PATCH" })}><Check className="h-4 w-4" /> Approve</SecondaryButton><button className="text-red-600" onClick={() => command.mutate({ path: `payroll-runs/${run.id}`, method: "DELETE" })}><Trash2 className="h-4 w-4" /></button></>}</div></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-xs"><thead><tr>{["Employee", "Gross", "Deduction", "Net", "Payment", "Action"].map((name) => <th key={name} className="border-b px-3 py-2 text-left">{name}</th>)}</tr></thead><tbody>{run.payslips.map((payslip) => <tr key={payslip.id}><td className="px-3 py-2">{payslip.employeeCode} · {payslip.employeeName}</td><td className="px-3 py-2">{money(payslip.proratedGross)}</td><td className="px-3 py-2">{money(payslip.totalDeduction)}</td><td className="px-3 py-2 font-semibold">{money(payslip.netPayable)}</td><td className="px-3 py-2">{payslip.paymentStatus}</td><td className="px-3 py-2">{run.status === "APPROVED" && payslip.paymentStatus === "PENDING" && <button className="font-semibold text-biz-blue underline" onClick={() => command.mutate({ path: `payslips/${payslip.id}/mark-paid`, method: "PATCH" })}>Mark Paid</button>}</td></tr>)}</tbody></table></div></section>)}</div>
  </div>;
}
