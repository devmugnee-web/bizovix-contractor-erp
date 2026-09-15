"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, Save, Trash2 } from "lucide-react";
import {
  apiRequest,
  useCreateJobOpening,
  useHrAttendance,
  useHrCommand,
  useHrDepartments,
  useHrDesignations,
  useHrEmployees,
  useHrExpenseClaims,
  useHrHolidays,
  useHrJobOpenings,
  useHrLeaveRequests,
  useHrLeaveTypes,
  useHrLoans,
  useHrPayrollRuns,
  useHrShifts,
} from "@bizovix/api-client";
import type { HrJobOpening, HrLookup } from "@bizovix/types";
import { FormField, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { formatAmount } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: string | number | undefined) => formatAmount(value ?? 0);
const titleCase = (value: string) => value.replace(/([A-Z])/g, "_$1").replaceAll("_", " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
const useHrResource = <T,>(path: string, enabled = true) => useQuery({ queryKey: ["hr", path], queryFn: () => apiRequest<T>(`/hr/${path}`), enabled });

function Shell({ title, subtitle, notice, children }: { title: string; subtitle: string; notice?: string; children: React.ReactNode }) {
  return <div className="space-y-4">
    <div><h1 className="text-page-title text-biz-text">{title}</h1><p className="mt-1 text-sm text-biz-muted">{subtitle}</p></div>
    {notice && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-biz-blue">{notice}</div>}
    {children}
  </div>;
}

export function HrStructuresWorkspace() {
  useSetBreadcrumb([{ label: "HR & Payroll", href: "/hr-payroll" }, { label: "Organization Structure" }]);
  const departments = useHrDepartments();
  const designations = useHrDesignations();
  const grades = useHrResource<HrLookup[]>("grades");
  const units = useHrResource<HrLookup[]>("business-units");
  const divisions = useHrResource<HrLookup[]>("divisions");
  const locations = useHrResource<HrLookup[]>("locations");
  const centers = useHrResource<HrLookup[]>("cost-centers");
  const command = useHrCommand();
  const [notice, setNotice] = React.useState("");
  const [form, setForm] = React.useState({ type: "departments", name: "", level: "" });
  const groups = [
    { path: "departments", name: "Departments", rows: departments.data ?? [] },
    { path: "designations", name: "Designations", rows: designations.data ?? [] },
    { path: "grades", name: "Grades", rows: grades.data ?? [] },
    { path: "business-units", name: "Business Units", rows: units.data ?? [] },
    { path: "divisions", name: "Divisions", rows: divisions.data ?? [] },
    { path: "locations", name: "Locations", rows: locations.data ?? [] },
    { path: "cost-centers", name: "Cost Centers", rows: centers.data ?? [] },
  ];

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await command.mutateAsync({ path: form.type, body: { name: form.name, ...(form.type === "grades" && form.level ? { level: Number(form.level) } : {}) } });
      setForm({ ...form, name: "", level: "" });
      setNotice("Organization structure saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save structure."); }
  }

  async function remove(path: string, id: string) {
    try { await command.mutateAsync({ path: `${path}/${id}`, method: "DELETE" }); setNotice("Unused structure record deleted."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "This record is in use."); }
  }

  return <Shell title="Organization Structure" subtitle="Departments, designations, grades, business units, divisions, locations and cost centers" notice={notice}>
    <form onSubmit={save} className="grid gap-3 rounded-lg border border-biz-border bg-white p-4 md:grid-cols-4">
      <FormField label="Structure Type"><SelectInput value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} options={groups.map((group) => ({ value: group.path, label: group.name }))} /></FormField>
      <FormField label="Name" required><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></FormField>
      {form.type === "grades" && <FormField label="Grade Level"><TextInput type="number" min="1" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} /></FormField>}
      <div className="flex items-end"><PrimaryButton type="submit"><Save className="h-4 w-4" /> Save</PrimaryButton></div>
    </form>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{groups.map((group) => <section key={group.path} className="rounded-lg border border-biz-border bg-white p-4">
      <div className="flex items-center justify-between"><h2 className="font-bold">{group.name}</h2><span className="text-xs text-biz-muted">{group.rows.length}</span></div>
      {!group.rows.length ? <p className="mt-3 text-xs text-biz-muted">No records yet.</p> : group.rows.map((row) => <div key={row.id} className="mt-3 flex items-center justify-between border-t border-biz-border pt-3 text-sm"><span>{row.name}{row.level ? ` · Level ${row.level}` : ""}</span><button type="button" className="text-red-600" onClick={() => remove(group.path, row.id)} aria-label={`Delete ${row.name}`}><Trash2 className="h-4 w-4" /></button></div>)}
    </section>)}</div>
  </Shell>;
}

type ShiftRow = { id: string; name: string; startTime: string; endTime: string; gracePeriodMinutes: number; weeklyOffDays: number[]; isDefault: boolean };
type HolidayRow = { id: string; name: string; date: string; isRecurringYearly: boolean };

export function HrSchedulesWorkspace() {
  useSetBreadcrumb([{ label: "HR & Payroll", href: "/hr-payroll" }, { label: "Shifts & Holidays" }]);
  const shifts = useHrShifts();
  const holidays = useHrHolidays();
  const command = useHrCommand();
  const [notice, setNotice] = React.useState("");
  const [shift, setShift] = React.useState({ name: "", startTime: "09:00", endTime: "18:00", gracePeriodMinutes: "10", weeklyOffDays: "5,6", isDefault: false });
  const [holiday, setHoliday] = React.useState({ name: "", date: today(), isRecurringYearly: false });

  async function addShift(event: React.FormEvent) {
    event.preventDefault();
    try {
      await command.mutateAsync({ path: "shifts", body: { ...shift, gracePeriodMinutes: Number(shift.gracePeriodMinutes), weeklyOffDays: shift.weeklyOffDays.split(",").map(Number).filter((day) => day >= 0 && day <= 6) } });
      setShift({ ...shift, name: "" }); setNotice("Shift saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save shift."); }
  }

  async function addHoliday(event: React.FormEvent) {
    event.preventDefault();
    try { await command.mutateAsync({ path: "holidays", body: holiday }); setHoliday({ ...holiday, name: "" }); setNotice("Holiday saved."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not save holiday."); }
  }

  return <Shell title="Shifts & Holidays" subtitle="Work schedules, grace periods, weekly offs and holiday calendar" notice={notice}>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">Shift Setup</h2>
        <form onSubmit={addShift} className="mt-3 grid gap-3 sm:grid-cols-2">
          <FormField label="Shift Name"><TextInput value={shift.name} onChange={(event) => setShift({ ...shift, name: event.target.value })} required /></FormField>
          <FormField label="Start"><TextInput type="time" value={shift.startTime} onChange={(event) => setShift({ ...shift, startTime: event.target.value })} /></FormField>
          <FormField label="End"><TextInput type="time" value={shift.endTime} onChange={(event) => setShift({ ...shift, endTime: event.target.value })} /></FormField>
          <FormField label="Grace (minutes)"><TextInput type="number" min="0" max="180" value={shift.gracePeriodMinutes} onChange={(event) => setShift({ ...shift, gracePeriodMinutes: event.target.value })} /></FormField>
          <FormField label="Weekly Off (0-6, comma separated)"><TextInput value={shift.weeklyOffDays} onChange={(event) => setShift({ ...shift, weeklyOffDays: event.target.value })} /></FormField>
          <div className="flex items-end"><PrimaryButton type="submit"><Plus className="h-4 w-4" /> Add Shift</PrimaryButton></div>
        </form>
        <div className="mt-4">{((shifts.data ?? []) as ShiftRow[]).map((row) => <div key={row.id} className="flex items-center justify-between border-t py-3 text-xs"><div><b>{row.name}</b><p>{row.startTime}–{row.endTime} · grace {row.gracePeriodMinutes}m{row.isDefault ? " · Default" : ""}</p></div><button className="text-red-600" onClick={() => command.mutate({ path: `shifts/${row.id}`, method: "DELETE" })}><Trash2 className="h-4 w-4" /></button></div>)}</div>
      </section>
      <section className="rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">Holiday Calendar</h2>
        <form onSubmit={addHoliday} className="mt-3 grid gap-3 sm:grid-cols-2">
          <FormField label="Holiday"><TextInput value={holiday.name} onChange={(event) => setHoliday({ ...holiday, name: event.target.value })} required /></FormField>
          <FormField label="Date"><TextInput type="date" value={holiday.date} onChange={(event) => setHoliday({ ...holiday, date: event.target.value })} required /></FormField>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={holiday.isRecurringYearly} onChange={(event) => setHoliday({ ...holiday, isRecurringYearly: event.target.checked })} /> Repeat yearly</label>
          <div className="flex items-end"><PrimaryButton type="submit">Add Holiday</PrimaryButton></div>
        </form>
        <div className="mt-4">{((holidays.data ?? []) as HolidayRow[]).map((row) => <div key={row.id} className="flex items-center justify-between border-t py-3 text-xs"><div><b>{row.name}</b><p>{new Date(row.date).toLocaleDateString()}{row.isRecurringYearly ? " · Recurring" : ""}</p></div><button className="text-red-600" onClick={() => command.mutate({ path: `holidays/${row.id}`, method: "DELETE" })}><Trash2 className="h-4 w-4" /></button></div>)}</div>
      </section>
    </div>
  </Shell>;
}

type Candidate = { id: string; name: string; email: string | null; phone: string | null };
type Application = { id: string; stage: string; appliedDate: string; candidate: Candidate; jobOpening: Pick<HrJobOpening, "id" | "title"> };

export function HrRecruitmentWorkspace() {
  useSetBreadcrumb([{ label: "HR & Payroll", href: "/hr-payroll" }, { label: "Recruitment" }]);
  const jobs = useHrJobOpenings();
  const candidates = useHrResource<Candidate[]>("candidates");
  const applications = useHrResource<Application[]>("job-applications");
  const createJob = useCreateJobOpening();
  const command = useHrCommand();
  const [notice, setNotice] = React.useState("");
  const [job, setJob] = React.useState({ title: "", numberOfPositions: "1", description: "" });
  const [candidate, setCandidate] = React.useState({ name: "", email: "", phone: "", source: "" });
  const [application, setApplication] = React.useState({ candidateId: "", jobOpeningId: "", appliedDate: today() });

  async function saveJob(event: React.FormEvent) { event.preventDefault(); await createJob.mutateAsync({ ...job, numberOfPositions: Number(job.numberOfPositions) }); setJob({ ...job, title: "", description: "" }); setNotice("Job opening created."); }
  async function saveCandidate(event: React.FormEvent) { event.preventDefault(); await command.mutateAsync({ path: "candidates", body: { ...candidate, email: candidate.email || undefined, phone: candidate.phone || undefined, source: candidate.source || undefined } }); setCandidate({ ...candidate, name: "", email: "", phone: "" }); setNotice("Candidate added."); }
  async function saveApplication(event: React.FormEvent) { event.preventDefault(); await command.mutateAsync({ path: "job-applications", body: application }); setNotice("Application added to pipeline."); }
  async function advance(row: Application) {
    const stages = ["APPLIED", "SCREENING", "SHORTLISTED", "INTERVIEW", "ASSESSMENT", "REFERENCE_CHECK", "SELECTED", "OFFER_SENT", "OFFER_ACCEPTED"];
    const next = stages[Math.min(stages.indexOf(row.stage) + 1, stages.length - 1)];
    await command.mutateAsync({ path: `job-applications/${row.id}`, method: "PATCH", body: { stage: next } });
  }

  return <Shell title="Recruitment" subtitle="Job openings, candidates, applications and selection pipeline" notice={notice}>
    <div className="grid gap-4 xl:grid-cols-3">
      <form onSubmit={saveJob} className="space-y-3 rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">Open Position</h2><FormField label="Job Title"><TextInput value={job.title} onChange={(event) => setJob({ ...job, title: event.target.value })} required /></FormField><FormField label="Positions"><TextInput type="number" min="1" value={job.numberOfPositions} onChange={(event) => setJob({ ...job, numberOfPositions: event.target.value })} /></FormField><FormField label="Description"><TextInput value={job.description} onChange={(event) => setJob({ ...job, description: event.target.value })} /></FormField><PrimaryButton type="submit">Create Opening</PrimaryButton></form>
      <form onSubmit={saveCandidate} className="space-y-3 rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">Add Candidate</h2><FormField label="Name"><TextInput value={candidate.name} onChange={(event) => setCandidate({ ...candidate, name: event.target.value })} required /></FormField><FormField label="Email"><TextInput type="email" value={candidate.email} onChange={(event) => setCandidate({ ...candidate, email: event.target.value })} /></FormField><FormField label="Phone"><TextInput value={candidate.phone} onChange={(event) => setCandidate({ ...candidate, phone: event.target.value })} /></FormField><PrimaryButton type="submit">Save Candidate</PrimaryButton></form>
      <form onSubmit={saveApplication} className="space-y-3 rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">New Application</h2><FormField label="Candidate"><SelectInput value={application.candidateId} onChange={(event) => setApplication({ ...application, candidateId: event.target.value })} options={(candidates.data ?? []).map((row) => ({ value: row.id, label: row.name }))} required /></FormField><FormField label="Job Opening"><SelectInput value={application.jobOpeningId} onChange={(event) => setApplication({ ...application, jobOpeningId: event.target.value })} options={(jobs.data ?? []).filter((row) => row.status === "OPEN").map((row) => ({ value: row.id, label: row.title }))} required /></FormField><FormField label="Applied Date"><TextInput type="date" value={application.appliedDate} onChange={(event) => setApplication({ ...application, appliedDate: event.target.value })} /></FormField><PrimaryButton type="submit">Add to Pipeline</PrimaryButton></form>
    </div>
    <section className="overflow-x-auto rounded-lg border border-biz-border bg-white"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-biz-bg"><tr>{["Candidate", "Position", "Applied", "Stage", "Action"].map((item) => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead><tbody>{(applications.data ?? []).map((row) => <tr key={row.id} className="border-t"><td className="px-4 py-3 font-semibold">{row.candidate.name}</td><td className="px-4 py-3">{row.jobOpening.title}</td><td className="px-4 py-3">{new Date(row.appliedDate).toLocaleDateString()}</td><td className="px-4 py-3">{titleCase(row.stage)}</td><td className="px-4 py-3"><SecondaryButton size="sm" onClick={() => advance(row)} disabled={["OFFER_ACCEPTED", "REJECTED", "WITHDRAWN"].includes(row.stage)}><Check className="h-4 w-4" /> Advance</SecondaryButton></td></tr>)}</tbody></table></section>
  </Shell>;
}

type EmployeeChange = { id: string; changeType: string; effectiveDate: string; previousValue: string | null; newValue: string | null };
type ExitProcess = { id: string; separationType: string; lastWorkingDate: string | null; status: string; departmentClearance: boolean; assetClearance: boolean; financeClearance: boolean; hrClearance: boolean } | null;
type Onboarding = { documentsCollected: boolean; joiningFormSubmitted: boolean; idCardIssued: boolean; emailAccountCreated: boolean; accessGranted: boolean; deviceAllocated: boolean; workspaceAllocated: boolean; confirmed: boolean };

export function HrLifecycleWorkspace() {
  useSetBreadcrumb([{ label: "HR & Payroll", href: "/hr-payroll" }, { label: "Employee Lifecycle" }]);
  const employees = useHrEmployees();
  const command = useHrCommand();
  const [employeeId, setEmployeeId] = React.useState("");
  const changes = useHrResource<EmployeeChange[]>(`employees/${employeeId}/changes`, Boolean(employeeId));
  const exit = useHrResource<ExitProcess>(`employees/${employeeId}/exit-process`, Boolean(employeeId));
  const onboarding = useHrResource<Onboarding>(`employees/${employeeId}/onboarding`, Boolean(employeeId));
  const [notice, setNotice] = React.useState("");
  const [change, setChange] = React.useState({ changeType: "PROMOTION", effectiveDate: today(), previousValue: "", newValue: "", reason: "" });
  const [exitForm, setExitForm] = React.useState({ separationType: "RESIGNATION", lastWorkingDate: today() });

  async function saveChange(event: React.FormEvent) { event.preventDefault(); await command.mutateAsync({ path: "employee-changes", body: { employeeId, ...change } }); setNotice("Employee change recorded."); }
  async function startExit(event: React.FormEvent) { event.preventDefault(); await command.mutateAsync({ path: "exit-processes", body: { employeeId, ...exitForm } }); setNotice("Exit process started."); }
  async function updateOnboarding(field: keyof Onboarding, value: boolean) { await command.mutateAsync({ path: `employees/${employeeId}/onboarding`, method: "PATCH", body: { [field]: value } }); }

  return <Shell title="Employee Lifecycle" subtitle="Changes, promotions, transfers, onboarding and exit clearance" notice={notice}>
    <FormField label="Employee"><SelectInput value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} options={(employees.data ?? []).map((row) => ({ value: row.id, label: `${row.employeeCode} - ${row.name}` }))} placeholder="Select employee" /></FormField>
    {employeeId && <div className="grid gap-4 xl:grid-cols-3">
      <section className="rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">Record Change</h2><form onSubmit={saveChange} className="mt-3 space-y-3"><FormField label="Change Type"><SelectInput value={change.changeType} onChange={(event) => setChange({ ...change, changeType: event.target.value })} options={["PROMOTION", "TRANSFER", "DEPARTMENT_CHANGE", "DESIGNATION_CHANGE", "GRADE_CHANGE", "SALARY_REVISION", "REPORTING_MANAGER_CHANGE", "LOCATION_CHANGE", "EMPLOYMENT_TYPE_CHANGE"].map((value) => ({ value, label: titleCase(value) }))} /></FormField><FormField label="Effective Date"><TextInput type="date" value={change.effectiveDate} onChange={(event) => setChange({ ...change, effectiveDate: event.target.value })} /></FormField><div className="grid grid-cols-2 gap-2"><TextInput placeholder="Previous value" value={change.previousValue} onChange={(event) => setChange({ ...change, previousValue: event.target.value })} /><TextInput placeholder="New value" value={change.newValue} onChange={(event) => setChange({ ...change, newValue: event.target.value })} /></div><PrimaryButton type="submit">Save Change</PrimaryButton></form><div className="mt-4">{(changes.data ?? []).map((row) => <div key={row.id} className="border-t py-3 text-xs"><b>{titleCase(row.changeType)}</b><p>{new Date(row.effectiveDate).toLocaleDateString()} · {row.previousValue ?? "—"} → {row.newValue ?? "—"}</p></div>)}</div></section>
      <section className="rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">Onboarding Checklist</h2><div className="mt-3 space-y-2">{(["documentsCollected", "joiningFormSubmitted", "idCardIssued", "emailAccountCreated", "accessGranted", "deviceAllocated", "workspaceAllocated", "confirmed"] as Array<keyof Onboarding>).map((field) => <label key={field} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(onboarding.data?.[field])} onChange={(event) => updateOnboarding(field, event.target.checked)} /> {titleCase(field)}</label>)}</div></section>
      <section className="rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">Exit Process</h2>{exit.data ? <div className="mt-3 text-sm"><p><b>{titleCase(exit.data.separationType)}</b> · {titleCase(exit.data.status)}</p><p className="mt-2 text-xs">Last working day: {exit.data.lastWorkingDate ? new Date(exit.data.lastWorkingDate).toLocaleDateString() : "Not set"}</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><span>Department: {exit.data.departmentClearance ? "Done" : "Pending"}</span><span>Assets: {exit.data.assetClearance ? "Done" : "Pending"}</span><span>Finance: {exit.data.financeClearance ? "Done" : "Pending"}</span><span>HR: {exit.data.hrClearance ? "Done" : "Pending"}</span></div></div> : <form onSubmit={startExit} className="mt-3 space-y-3"><FormField label="Separation Type"><SelectInput value={exitForm.separationType} onChange={(event) => setExitForm({ ...exitForm, separationType: event.target.value })} options={["RESIGNATION", "TERMINATION", "RETIREMENT", "CONTRACT_EXPIRY"].map((value) => ({ value, label: titleCase(value) }))} /></FormField><FormField label="Last Working Date"><TextInput type="date" value={exitForm.lastWorkingDate} onChange={(event) => setExitForm({ ...exitForm, lastWorkingDate: event.target.value })} /></FormField><PrimaryButton type="submit">Start Exit</PrimaryButton></form>}</section>
    </div>}
  </Shell>;
}

type ProvidentFundRow = { employeeId: string; employeeCode: string; employeeName: string; total: string };

export function HrReportsWorkspace() {
  useSetBreadcrumb([{ label: "HR & Payroll", href: "/hr-payroll" }, { label: "Reports" }]);
  const employees = useHrEmployees();
  const attendance = useHrAttendance();
  const payroll = useHrPayrollRuns();
  const leaves = useHrLeaveRequests();
  const leaveTypes = useHrLeaveTypes();
  const claims = useHrExpenseClaims();
  const loans = useHrLoans();
  const fund = useHrResource<ProvidentFundRow[]>("provident-fund");
  const active = (employees.data ?? []).filter((row) => row.status === "ACTIVE").length;
  const netPayroll = (payroll.data ?? []).reduce((sum, row) => sum + Number(row.totalNetPayable), 0);
  const outstandingLoans = (loans.data ?? []).reduce((sum, row) => sum + Number(row.remainingBalance), 0);
  const pendingClaims = (claims.data ?? []).filter((row) => row.status === "PENDING").reduce((sum, row) => sum + Number(row.amount), 0);

  return <Shell title="HR Reports" subtitle="Workforce, attendance, leave, payroll, provident fund, claims and loan summaries">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Active Employees", active], ["Payroll Net", `৳ ${money(netPayroll)}`], ["Pending Claims", `৳ ${money(pendingClaims)}`], ["Loan Balance", `৳ ${money(outstandingLoans)}`]].map(([name, value]) => <div key={name} className="rounded-lg border border-biz-border bg-white p-4"><p className="text-xs text-biz-muted">{name}</p><p className="mt-2 text-xl font-bold">{value}</p></div>)}</div>
    <div className="grid gap-4 xl:grid-cols-2"><section className="rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">Operational Summary</h2><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><span>Attendance records <b className="float-right">{attendance.data?.length ?? 0}</b></span><span>Leave types <b className="float-right">{leaveTypes.data?.length ?? 0}</b></span><span>Leave requests <b className="float-right">{leaves.data?.length ?? 0}</b></span><span>Payroll runs <b className="float-right">{payroll.data?.length ?? 0}</b></span></div></section><section className="rounded-lg border border-biz-border bg-white p-4"><h2 className="font-bold">Provident Fund</h2>{!(fund.data?.length) ? <p className="mt-3 text-xs text-biz-muted">No approved payroll contribution yet.</p> : fund.data.map((row) => <div key={row.employeeId} className="mt-3 flex justify-between border-t pt-3 text-xs"><span>{row.employeeCode} · {row.employeeName}</span><b>৳ {money(row.total)}</b></div>)}</section></div>
  </Shell>;
}
