"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Cake,
  CalendarCheck2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Edit2,
  FileBarChart,
  FileText,
  FileSpreadsheet,
  Filter,
  Gift,
  HandCoins,
  History,
  LayoutDashboard,
  ListChecks,
  Plus,
  Receipt,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { HrEmptyState } from "@/components/shared/hr-empty-state";
import { AddEmployeeDialog } from "@/features/screens/add-employee-dialog";
import { ApplyLeaveDialog } from "@/features/screens/apply-leave-dialog";
import { AttendanceImportDialog } from "@/features/screens/attendance-import-dialog";
import { DepartmentDesignationManagerDialog } from "@/features/screens/department-designation-manager-dialog";
import { LeaveTypeManagerDialog } from "@/features/screens/leave-type-manager-dialog";
import { EmployeeLifecycleDialog } from "@/features/screens/employee-lifecycle-dialog";
import { EmployeeLeaveTrackerReport } from "@/features/screens/employee-leave-tracker-report";
import { EmployeeLoansSection } from "@/features/screens/employee-loans-section";
import { ExpenseClaimsSection } from "@/features/screens/expense-claims-section";
import { RecruitmentSection } from "@/features/screens/recruitment-section";
import { HrReportsDialog, type HrReportKey } from "@/features/screens/hr-reports-dialog";
import { PayrollRunDetailDialog } from "@/features/screens/payroll-run-detail-dialog";
import { PayrollRulesForm } from "@/features/screens/payroll-rules-form";
import { SalaryComponentsForm } from "@/features/screens/salary-components-form";
import { ProvidentFundDialog } from "@/features/screens/provident-fund-dialog";
import {
  useApproveLeaveRequestMutation,
  useAttendanceQuery,
  useCancelLeaveRequestMutation,
  useDeleteEmployeeMutation,
  useDeletePayrollRunMutation,
  useDepartmentsQuery,
  useDesignationsQuery,
  useEmployeesQuery,
  useLeaveRequestsQuery,
  usePayrollRunsQuery,
  useRejectLeaveRequestMutation,
} from "@/hooks/use-hr-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatCurrency, formatDate, formatHoursFromMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EmployeeRecord, PayrollRunRecord } from "@/types/hr";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type HrSection = "overview" | "employees" | "attendance" | "leave" | "payroll" | "expenses" | "loans" | "recruitment" | "approvals" | "reports" | "settings";

const sections: Array<{ id: HrSection; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "employees", label: "Employees", icon: Users },
  { id: "attendance", label: "Attendance", icon: CalendarCheck2 },
  { id: "leave", label: "Leave", icon: CalendarClock },
  { id: "payroll", label: "Payroll", icon: Banknote },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "loans", label: "Loans", icon: HandCoins },
  { id: "recruitment", label: "Recruitment", icon: BriefcaseBusiness },
  { id: "approvals", label: "Approvals", icon: ListChecks },
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "settings", label: "Settings", icon: Settings2 },
];

function getHrSection(value: string | null): HrSection {
  return sections.some((section) => section.id === value)
    ? (value as HrSection)
    : "overview";
}

const sectionCopy: Record<HrSection, { title: string; description?: string; action?: string }> = {
  overview: { title: "HR & Payroll" },
  employees: { title: "Employees", description: "Maintain employee profiles, employment details and salary assignments.", action: "Add Employee" },
  attendance: { title: "Attendance", description: "Review daily attendance, shifts, late arrivals and overtime.", action: "Import Excel" },
  leave: { title: "Leave Management", description: "Manage leave requests, balances, policies and the team calendar.", action: "New Leave Request" },
  payroll: { title: "Payroll", description: "Calculate, review, approve and pay salaries by payroll period.", action: "Run Payroll" },
  expenses: { title: "Expense Management", description: "Submit, approve and reimburse employee expense claims.", action: "New Expense Claim" },
  loans: { title: "Loan & Advance", description: "Apply, approve, disburse and track repayment of employee loans and advances.", action: "New Loan / Advance" },
  recruitment: { title: "Recruitment", description: "Post job openings, track candidates and manage the hiring pipeline." },
  approvals: { title: "Approval Center", description: "Review pending HR, attendance, leave and payroll decisions." },
  reports: { title: "HR & Payroll Reports", description: "Open employee, attendance, leave and payroll reports." },
  settings: { title: "HR Settings", description: "Configure the organization before employees and payroll are added." },
};

type MetricTone = "blue" | "green" | "amber" | "violet";
type EmployeeQuickFilter = "probation-ending" | "contract-ending" | "new-joiners" | null;
const metricCards: Array<{ label: string; icon: LucideIcon; tone: MetricTone; section: HrSection; quickFilter?: EmployeeQuickFilter }> = [
  { label: "Total Employees", icon: Users, tone: "blue", section: "employees" },
  { label: "Present Today", icon: UserCheck, tone: "green", section: "attendance" },
  { label: "Absent Today", icon: UserCheck, tone: "amber", section: "attendance" },
  { label: "On Leave Today", icon: CalendarClock, tone: "amber", section: "leave" },
  { label: "Late Today", icon: Clock3, tone: "amber", section: "attendance" },
  { label: "New Joiners (This Month)", icon: UserPlus, tone: "blue", section: "employees", quickFilter: "new-joiners" },
  { label: "Pending Approvals", icon: ListChecks, tone: "violet", section: "approvals" },
  { label: "Employment Ending Soon", icon: BadgeCheck, tone: "violet", section: "employees" },
];

const toneClasses = {
  blue: "border-[#d6e4ff] bg-[#f7faff] text-[#2563eb]",
  green: "border-[#cfe9dc] bg-[#f6fcf8] text-[#15925f]",
  amber: "border-[#f3dfbd] bg-[#fffaf2] text-[#d6800d]",
  violet: "border-[#e0d9f8] bg-[#faf8ff] text-[#7355d9]",
};

const toneGradients = {
  blue: "linear-gradient(135deg, #4f8bff 0%, #2f67e8 100%)",
  green: "linear-gradient(135deg, #34d399 0%, #0f9d63 100%)",
  amber: "linear-gradient(135deg, #fbbf5c 0%, #e08a1a 100%)",
  violet: "linear-gradient(135deg, #a78bfa 0%, #7c5ce0 100%)",
} as const;

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const setupItems = [
  { title: "Departments", description: "Create the teams employees belong to.", icon: BriefcaseBusiness },
  { title: "Designations", description: "Define employee job titles and reporting structure.", icon: BadgeCheck },
  { title: "Shifts & Holidays", description: "Set working hours, weekends and company holidays.", icon: Clock3 },
  { title: "Leave Types", description: "Configure annual, sick and other leave policies.", icon: CalendarClock },
  { title: "Salary Components", description: "Define earnings, deductions and calculation rules.", icon: CircleDollarSign },
  { title: "Payroll Rules", description: "Set periods, rounding, overtime and approval flow.", icon: SlidersHorizontal },
];

type ReportGroupId = "people" | "payroll";

const reportItems: Array<{ title: string; description: string; icon: LucideIcon; group: ReportGroupId; output: string }> = [
  { title: "Employee Directory", description: "Employee profiles arranged by department, designation and status.", icon: Users, group: "people", output: "Directory" },
  { title: "Attendance Summary", description: "Present, absent, late arrival and overtime details.", icon: CalendarCheck2, group: "people", output: "Summary" },
  { title: "Employee Leave Tracker", description: "Monthly leave calendar with weekly offs and yearly totals.", icon: FileSpreadsheet, group: "people", output: "Excel + Print" },
  { title: "Leave Balance", description: "Allocated, used and remaining leave by employee and type.", icon: CalendarClock, group: "people", output: "Balance" },
  { title: "Payroll Register", description: "Gross pay, deductions, net payable and payment status.", icon: FileText, group: "payroll", output: "Register" },
  { title: "Salary Sheet", description: "Period-wise salary component and prorated gross breakdown.", icon: Banknote, group: "payroll", output: "Salary" },
  { title: "Payroll Cost", description: "Month-wise workforce cost and employee payment totals.", icon: BarChart3, group: "payroll", output: "Analysis" },
  { title: "Provident Fund", description: "Employee and company PF rate with accumulated balances.", icon: ShieldCheck, group: "payroll", output: "Compliance" },
];

const reportGroups: Array<{ id: ReportGroupId; title: string; description: string; icon: LucideIcon }> = [
  { id: "people", title: "People, Time & Leave", description: "Employee, attendance and leave reports", icon: Users },
  { id: "payroll", title: "Payroll & Compliance", description: "Salary, payroll cost and statutory reports", icon: Banknote },
];

function EmptyWorkspace({ section, onSetup }: { section: HrSection; onSetup: () => void }) {
  const content: Record<Exclude<HrSection, "overview" | "reports" | "settings">, { title: string; description: string; icon: LucideIcon; action?: string }> = {
    employees: { title: "No employees yet", description: "Add your first employee to start building salary structures and payroll.", icon: UserPlus, action: "Add Employee" },
    attendance: { title: "No attendance records yet", description: "Import the attendance Excel template to add daily employee records.", icon: CalendarCheck2, action: "Import Excel" },
    leave: { title: "No leave activity yet", description: "Apply for leave against an employee's remaining balance.", icon: CalendarClock, action: "New Leave Request" },
    payroll: { title: "No payroll run yet", description: "Add employees with a salary structure, then run payroll for a period.", icon: Banknote, action: "Run Payroll" },
    expenses: { title: "No expense claims yet", description: "Submit the first expense claim to see it here.", icon: Receipt, action: "New Expense Claim" },
    loans: { title: "No loans or advances yet", description: "Submit the first application to see it here.", icon: HandCoins, action: "New Loan / Advance" },
    recruitment: { title: "No job openings yet", description: "Post the first job opening to start tracking candidates.", icon: BriefcaseBusiness },
    approvals: { title: "You're all caught up", description: "Pending leave, attendance and payroll requests will appear here.", icon: ShieldCheck },
  };
  const detail = content[section as keyof typeof content];
  return (
    <div className="flex min-h-[420px] flex-1 border-t border-[#e2e8f1] bg-white">
      <HrEmptyState icon={detail.icon} title={detail.title} description={detail.description} actionLabel={section !== "approvals" ? detail.action ?? "Open HR Settings" : undefined} onAction={section !== "approvals" ? onSetup : undefined} />
    </div>
  );
}

export function PayrollHrScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const { session } = useSessionContext();
  const employeesQuery = useEmployeesQuery(Boolean(session?.workspaceId));
  const payrollRunsQuery = usePayrollRunsQuery(Boolean(session?.workspaceId));
  const departmentsQuery = useDepartmentsQuery(Boolean(session?.workspaceId));
  const designationsQuery = useDesignationsQuery(Boolean(session?.workspaceId));
  const attendanceQuery = useAttendanceQuery(Boolean(session?.workspaceId));
  const leaveRequestsQuery = useLeaveRequestsQuery(Boolean(session?.workspaceId));
  const deleteEmployeeMutation = useDeleteEmployeeMutation();
  const deletePayrollRunMutation = useDeletePayrollRunMutation();
  const approveLeaveRequestMutation = useApproveLeaveRequestMutation();
  const rejectLeaveRequestMutation = useRejectLeaveRequestMutation();
  const cancelLeaveRequestMutation = useCancelLeaveRequestMutation();
  const employees = employeesQuery.data ?? [];
  const payrollRuns = payrollRunsQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const designations = designationsQuery.data ?? [];
  const attendanceRecords = attendanceQuery.data ?? [];
  const leaveRequests = leaveRequestsQuery.data ?? [];

  const [activeSection, setActiveSection] = useState<HrSection>(() =>
    getHrSection(sectionParam),
  );

  useEffect(() => {
    const nextSection = getHrSection(sectionParam);
    setActiveSection((currentSection) =>
      currentSection === nextSection ? currentSection : nextSection,
    );
  }, [sectionParam]);

  function selectSection(section: HrSection) {
    setActiveSection(section);

    const params = new URLSearchParams(searchParams.toString());
    if (section === "overview") {
      params.delete("section");
    } else {
      params.set("section", section);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }
  const [setupDialog, setSetupDialog] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [employeeQuickFilter, setEmployeeQuickFilter] = useState<"probation-ending" | "contract-ending" | "new-joiners" | null>(null);
  const [employeeFiltersOpen, setEmployeeFiltersOpen] = useState(false);
  const [employeeDepartmentFilter, setEmployeeDepartmentFilter] = useState("all");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("all");
  const [employeePaymentFilter, setEmployeePaymentFilter] = useState("all");
  const copy = sectionCopy[activeSection];
  const companyName = "the active workspace";

  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null);
  const [deleteEmployeeTarget, setDeleteEmployeeTarget] = useState<EmployeeRecord | null>(null);
  const [deletePayrollRunTarget, setDeletePayrollRunTarget] = useState<PayrollRunRecord | null>(null);
  const [payrollRunDetail, setPayrollRunDetail] = useState<PayrollRunRecord | null>(null);
  const [providentFundOpen, setProvidentFundOpen] = useState(false);
  const [hrReportOpen, setHrReportOpen] = useState<HrReportKey | null>(null);
  const [lifecycleEmployee, setLifecycleEmployee] = useState<EmployeeRecord | null>(null);
  const [newExpenseClaimOpen, setNewExpenseClaimOpen] = useState(false);
  const [newLoanOpen, setNewLoanOpen] = useState(false);
  const [lookupManagerOpen, setLookupManagerOpen] = useState(false);
  const [attendanceImportOpen, setAttendanceImportOpen] = useState(false);
  const [applyLeaveOpen, setApplyLeaveOpen] = useState(false);
  const [leaveTypeManagerOpen, setLeaveTypeManagerOpen] = useState(false);

  const openSetup = (title: string) => setSetupDialog(title);

  function handleSetupItemClick(title: string) {
    if (title === "Departments" || title === "Designations") {
      setLookupManagerOpen(true);
      return;
    }
    if (title === "Leave Types") {
      setLeaveTypeManagerOpen(true);
      return;
    }
    if (title === "Shifts & Holidays") {
      router.push("/app/payroll-hr/shifts-holidays");
      return;
    }
    openSetup(title);
  }

  async function handleApproveLeaveRequest(id: string, employeeName: string) {
    try {
      await approveLeaveRequestMutation.mutateAsync(id);
      toast.success(`Leave approved for ${employeeName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve this leave request.");
    }
  }

  async function handleRejectLeaveRequest(id: string, employeeName: string) {
    try {
      await rejectLeaveRequestMutation.mutateAsync({ leaveRequestId: id });
      toast.success(`Leave rejected for ${employeeName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reject this leave request.");
    }
  }

  async function handleCancelLeaveRequest(id: string, employeeName: string) {
    try {
      await cancelLeaveRequestMutation.mutateAsync(id);
      toast.success(`Leave request for ${employeeName} cancelled.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel this leave request.");
    }
  }

  const recentEmployees = useMemo(() => employees.slice(0, 5), [employees]);
  const lastCheckInByEmployee = useMemo(() => {
    const checkIns = new Map<string, { date: string; time: string }>();

    for (const record of attendanceRecords) {
      if (record.checkIn && !checkIns.has(record.employee.id)) {
        checkIns.set(record.employee.id, {
          date: record.attendanceDate,
          time: record.checkIn,
        });
      }
    }

    return checkIns;
  }, [attendanceRecords]);

  const upcomingEvents = useMemo(() => {
    function daysUntilNextOccurrence(isoDate: string | null) {
      if (!isoDate) return null;
      const source = new Date(isoDate);
      if (Number.isNaN(source.getTime())) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const next = new Date(today.getFullYear(), source.getMonth(), source.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      return Math.round((next.getTime() - today.getTime()) / 86400000);
    }

    const birthdays = employees
      .map((employee) => ({ employee, days: daysUntilNextOccurrence(employee.dateOfBirth) }))
      .filter((entry): entry is { employee: EmployeeRecord; days: number } => entry.days !== null && entry.days <= 30)
      .sort((a, b) => a.days - b.days);

    const anniversaries = employees
      .map((employee) => ({ employee, days: daysUntilNextOccurrence(employee.joiningDate) }))
      .filter((entry): entry is { employee: EmployeeRecord; days: number } => entry.days !== null && entry.days <= 30)
      .sort((a, b) => a.days - b.days);

    return { birthdays, anniversaries };
  }, [employees]);

  const probationCount = useMemo(() => employees.filter((employee) => employee.employmentType === "PROBATION" && employee.status === "ACTIVE").length, [employees]);
  const latestPayrollRun = payrollRuns[0] ?? null;
  const pendingLeaveRequests = useMemo(() => leaveRequests.filter((request) => request.status === "PENDING"), [leaveRequests]);
  const pendingPayrollRuns = useMemo(() => payrollRuns.filter((run) => run.status === "DRAFT"), [payrollRuns]);

  const dashboardMetrics = useMemo(() => {
    // Pure string comparison on YYYY-MM-DD throughout — avoids new Date(isoString)
    // parsing date-only strings as UTC midnight while "today" is computed in the
    // browser's local timezone, which silently disagreed for part of every day.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const todayIso = toIso(now);
    const in30DaysIso = toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
    const todayRecords = attendanceRecords.filter((record) => record.attendanceDate.slice(0, 10) === todayIso);
    const presentToday = todayRecords.filter((record) => record.status === "PRESENT").length;
    const lateToday = todayRecords.filter((record) => record.lateMinutes > 0).length;
    const onLeaveToday = leaveRequests.filter((request) => request.status === "APPROVED" && request.startDate.slice(0, 10) <= todayIso && request.endDate.slice(0, 10) >= todayIso).length;
    // Attendance imports (biometric-device exports especially) only log actual
    // check-ins — nobody writes an explicit ABSENT row for a day someone just
    // didn't show up — so counting todayRecords with status "ABSENT" showed 0
    // every single day regardless of real attendance. Every active employee
    // not accounted for by a present check-in or an approved leave today is
    // the actual absent count.
    const activeEmployeeCount = employees.filter((employee) => employee.status === "ACTIVE").length;
    const absentToday = Math.max(0, activeEmployeeCount - presentToday - onLeaveToday);
    const pendingLeaveApprovals = leaveRequests.filter((request) => request.status === "PENDING").length;
    const pendingPayrollApprovals = payrollRuns.filter((run) => run.status === "DRAFT").length;
    const newJoinersThisMonth = employees.filter((employee) => employee.joiningDate.slice(0, 7) === todayIso.slice(0, 7)).length;
    const withinNext30Days = (isoDate: string | null) => {
      if (!isoDate) return false;
      const dateOnly = isoDate.slice(0, 10);
      return dateOnly >= todayIso && dateOnly <= in30DaysIso;
    };
    const probationExpiring = employees.filter((employee) => employee.status === "ACTIVE" && withinNext30Days(employee.probationEndDate)).length;
    const contractExpiring = employees.filter((employee) => employee.status === "ACTIVE" && withinNext30Days(employee.contractEndDate)).length;
    return {
      presentToday,
      absentToday,
      lateToday,
      onLeaveToday,
      pendingApprovals: pendingLeaveApprovals + pendingPayrollApprovals,
      newJoinersThisMonth,
      probationExpiring,
      contractExpiring,
      todayIso,
      in30DaysIso,
      withinNext30Days,
    };
  }, [attendanceRecords, leaveRequests, payrollRuns, employees]);

  const setupChecklist = useMemo(
    () => [
      { title: "Departments", done: departments.length > 0, detail: departments.length > 0 ? `${departments.length} added` : "Not added yet", onClick: () => setLookupManagerOpen(true) },
      { title: "Designations", done: designations.length > 0, detail: designations.length > 0 ? `${designations.length} added` : "Not added yet", onClick: () => setLookupManagerOpen(true) },
      { title: "Employees", done: employees.length > 0, detail: employees.length > 0 ? `${employees.length} added` : "Not added yet", onClick: () => { setEditingEmployee(null); setAddEmployeeOpen(true); } },
      { title: "First Payroll Run", done: payrollRuns.length > 0, detail: payrollRuns.length > 0 ? "Calculated" : "Not run yet", onClick: () => router.push("/app/payroll-hr/run-payroll") },
    ],
    [departments.length, designations.length, employees.length, payrollRuns.length],
  );
  const setupCompletedCount = setupChecklist.filter((item) => item.done).length;

  function handlePrimaryAction() {
    if (activeSection === "employees") {
      setEditingEmployee(null);
      setAddEmployeeOpen(true);
      return;
    }
    if (activeSection === "payroll") {
      router.push("/app/payroll-hr/run-payroll");
      return;
    }
    if (activeSection === "attendance") {
      setAttendanceImportOpen(true);
      return;
    }
    if (activeSection === "leave") {
      setApplyLeaveOpen(true);
      return;
    }
    if (activeSection === "expenses") {
      setNewExpenseClaimOpen(true);
      return;
    }
    if (activeSection === "loans") {
      setNewLoanOpen(true);
      return;
    }
    openSetup(copy.action ?? copy.title);
  }

  async function handleConfirmDeleteEmployee() {
    if (!deleteEmployeeTarget) return;
    try {
      await deleteEmployeeMutation.mutateAsync(deleteEmployeeTarget.id);
      toast.success(`${deleteEmployeeTarget.name} removed.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove this employee.");
    } finally {
      setDeleteEmployeeTarget(null);
    }
  }

  async function handleConfirmDeletePayrollRun() {
    if (!deletePayrollRunTarget) return;
    try {
      await deletePayrollRunMutation.mutateAsync(deletePayrollRunTarget.id);
      toast.success(`${MONTH_NAMES[deletePayrollRunTarget.periodMonth - 1]} ${deletePayrollRunTarget.periodYear} payroll deleted.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this payroll run.");
    } finally {
      setDeletePayrollRunTarget(null);
    }
  }

  if (hrReportOpen === "Employee Leave Tracker") {
    return (
      <>
        <EmployeeLeaveTrackerReport
          onClose={() => setHrReportOpen(null)}
          onAddEmployee={() => {
            setEditingEmployee(null);
            setAddEmployeeOpen(true);
          }}
        />
        <AddEmployeeDialog open={addEmployeeOpen} onOpenChange={setAddEmployeeOpen} employee={editingEmployee} />
      </>
    );
  }

  return (
    <div data-payroll-hr-screen="true" className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto rounded-[8px] border border-[#d9e1ed] bg-[#f7f9fc] shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <header data-hr-header="true" className="border-b border-[#dce4ef] bg-white px-5 pt-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf1ff] text-[#2f67e8]">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-[24px] font-semibold leading-tight text-[#192c4d]">{copy.title}</h1>
              {copy.description ? <p className="mt-1 text-[12px] text-[#71809a]">{copy.description}</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {employees.length === 0 ? (
              <span className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#dce4ef] bg-[#fbfcfe] px-3 text-[12px] font-medium text-[#52647f]">
                <CalendarClock className="h-4 w-4 text-[#2f67e8]" /> Payroll setup required
              </span>
            ) : null}
            {copy.action ? (
              <Button onClick={handlePrimaryAction} className="h-9 rounded-[10px] bg-[#ed711c] px-4 text-white hover:bg-[#d76013]">
                {activeSection === "attendance" ? <FileSpreadsheet className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {copy.action}
              </Button>
            ) : null}
          </div>
        </div>

        <nav data-hr-navigation="true" className="mt-5 flex gap-1 overflow-x-auto" aria-label="Payroll and HR sections">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => selectSection(section.id)}
                className={cn(
                  "relative inline-flex h-10 shrink-0 items-center gap-2 rounded-t-[9px] px-3.5 text-[12px] font-medium transition",
                  active ? "bg-[#eef4ff] text-[#255fcf]" : "text-[#64748b] hover:bg-[#f5f7fb] hover:text-[#27456f]",
                )}
              >
                <Icon className="h-4 w-4" /> {section.label}
                {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#2f67e8]" /> : null}
              </button>
            );
          })}
        </nav>
      </header>

      {activeSection === "overview" ? (
        <div data-hr-overview="true" className="flex flex-1 flex-col gap-3 p-3 lg:p-4 xl:min-h-0 xl:overflow-hidden">
          <section data-hr-metrics="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((metric) => {
              const Icon = metric.icon;
              const values: Record<string, { value: string; note: string }> = {
                "Total Employees": { value: String(employees.length), note: employees.length === 0 ? "No employees added" : `${employees.filter((e) => e.status === "ACTIVE").length} active` },
                "Present Today": { value: String(dashboardMetrics.presentToday), note: "From today's attendance" },
                "Absent Today": { value: String(dashboardMetrics.absentToday), note: "From today's attendance" },
                "On Leave Today": { value: String(dashboardMetrics.onLeaveToday), note: "Approved leave covering today" },
                "Late Today": { value: String(dashboardMetrics.lateToday), note: "Checked in past grace period" },
                "New Joiners (This Month)": { value: String(dashboardMetrics.newJoinersThisMonth), note: "Joined this calendar month" },
                "Pending Approvals": { value: String(dashboardMetrics.pendingApprovals), note: "Leave + payroll waiting" },
                "Employment Ending Soon": {
                  value: String(dashboardMetrics.probationExpiring + dashboardMetrics.contractExpiring),
                  note: `${dashboardMetrics.probationExpiring} probation · ${dashboardMetrics.contractExpiring} contract`,
                },
              };
              const { value, note } = values[metric.label] ?? { value: "0", note: "" };
              return (
                <button
                  data-hr-metric-card="true"
                  key={metric.label}
                  type="button"
                  onClick={() => { setEmployeeQuickFilter(metric.quickFilter ?? null); selectSection(metric.section); }}
                  className={cn("group relative overflow-hidden rounded-[14px] border bg-white p-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]", toneClasses[metric.tone])}
                >
                  <span className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.10]" style={{ background: toneGradients[metric.tone] }} />
                  <div className="relative flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-[#8a96ab]">{metric.label}</p>
                      <p className="mt-1.5 text-[25px] font-bold leading-none text-[#182642]">{value}</p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-white shadow-[0_7px_14px_rgba(15,23,42,0.16)]" style={{ background: toneGradients[metric.tone] }}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                  </div>
                  <p className="relative mt-2 text-[10px] font-medium text-[#8290a5]">{note}</p>
                </button>
              );
            })}
          </section>

          <section
            data-hr-setup="true"
            className={cn(
              "overflow-hidden rounded-[14px] border p-3",
              setupCompletedCount === setupChecklist.length ? "border-[#bfe3cf] bg-[linear-gradient(135deg,#f2fbf6_0%,#f7fdfa_100%)]" : "border-[#dbe6fb] bg-white",
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[13px] font-semibold text-[#203553]">
                  {setupCompletedCount === setupChecklist.length ? "Workspace is fully set up" : "Getting your workspace ready"}
                </h2>
                <p className="mt-0.5 text-[11px] text-[#5b6b83]">{setupCompletedCount} of {setupChecklist.length} steps done</p>
              </div>
              <span className={cn("text-[20px] font-bold", setupCompletedCount === setupChecklist.length ? "text-[#15925f]" : "text-[#2f67e8]")}>
                {Math.round((setupCompletedCount / setupChecklist.length) * 100)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
              <div
                className={cn("h-full rounded-full transition-all", setupCompletedCount === setupChecklist.length ? "bg-[linear-gradient(90deg,#34d399,#0f9d63)]" : "bg-[linear-gradient(90deg,#2f67e8,#5b8def)]")}
                style={{ width: `${(setupCompletedCount / setupChecklist.length) * 100}%` }}
              />
            </div>
            <div data-hr-setup-checklist="true" className="mt-2.5 grid gap-2 sm:grid-cols-4">
              {setupChecklist.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={item.onClick}
                  className={cn("flex items-center gap-2 rounded-[9px] border px-2.5 py-2 text-left transition hover:border-[#b9cdf5]", item.done ? "border-[#bfe3cf] bg-white/70" : "border-white bg-white")}
                >
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", item.done ? "bg-[#1f8a4d] text-white" : "bg-[#eef1f6] text-[#98a6bb]")}>
                    {item.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-semibold text-[#30435e]">{item.title}</span>
                    <span className="block text-[10px] text-[#8794a7]">{item.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section data-hr-overview-bottom="true" className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[1.45fr_0.75fr]">
            <div data-hr-recent-employees="true" className="h-full overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white">
              <div data-hr-panel-header="true" className="flex items-center justify-between border-b border-[#e3e9f1] px-4 py-3.5">
                <div><h2 className="text-[14px] font-semibold text-[#223754]">Recent Employees</h2><p className="mt-0.5 text-[11px] text-[#7b8aa1]">Latest additions to {companyName}</p></div>
                <Button variant="outline" onClick={() => selectSection("employees")} className="h-8 rounded-[9px] px-3 text-[11px]">View all <ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
              {recentEmployees.length === 0 ? (
                <div className="grid min-h-[160px] place-items-center px-6 py-3 text-center xl:min-h-0 xl:h-full">
                  <div>
                    <Users className="mx-auto h-9 w-9 text-[#9cb6eb]" strokeWidth={1.5} />
                    <p className="mt-2 text-[13px] font-semibold text-[#344863]">No employees yet</p>
                    <p className="mt-1 text-[11px] text-[#8491a5]">Add your first employee to see them here.</p>
                    <Button onClick={() => { setEditingEmployee(null); setAddEmployeeOpen(true); }} className="mt-3 h-8 rounded-[9px] bg-[#2f67e8] px-4 text-[11px] text-white hover:bg-[#2459ce]">
                      <Plus className="h-4 w-4" /> Add Employee
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[#edf1f6]">
                  {recentEmployees.map((employee) => {
                    const lastCheckIn = lastCheckInByEmployee.get(employee.id);

                    return (
                    <button data-hr-employee-row="true" key={employee.id} type="button" onClick={() => { setEditingEmployee(employee); setAddEmployeeOpen(true); }} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#f8faff]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: toneGradients.blue }}>
                        {initialsFor(employee.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-[#223754]">{employee.name}</span>
                        <span className="block truncate text-[10px] text-[#8592a5]">
                          {employee.department?.name ?? "No department"}{employee.designation ? ` · ${employee.designation.name}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[12px] font-semibold text-[#223754]">
                          Last in: {lastCheckIn ? `${formatDate(lastCheckIn.date)} · ${lastCheckIn.time}` : "—"}
                        </span>
                        <span className={cn("mt-0.5 inline-flex h-5 items-center rounded-full px-2 text-[9px] font-semibold", employee.status === "ACTIVE" ? "bg-[#e7f7ee] text-[#15925f]" : "bg-[#f1f4f8] text-[#65758c]")}>
                          {employee.status}
                        </span>
                      </span>
                    </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div data-hr-side-panels="true" className="flex min-h-0 h-full flex-col gap-3">
              <div data-hr-upcoming-payroll="true" className="flex flex-1 flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white">
                <div data-hr-panel-header="true" className="border-b border-[#e3e9f1] px-4 py-3.5"><h2 className="text-[14px] font-semibold text-[#223754]">Upcoming Payroll</h2></div>
                <div data-hr-panel-body="true" className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white" style={{ background: toneGradients.violet }}>
                    <Banknote className="h-[18px] w-[18px]" />
                  </span>
                  {latestPayrollRun ? (
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[#344863]">
                        {MONTH_NAMES[latestPayrollRun.periodMonth - 1]} {latestPayrollRun.periodYear}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#8491a5]">
                        {latestPayrollRun.status === "PAID" ? "Fully paid" : latestPayrollRun.status === "APPROVED" ? "Approved · awaiting payment" : "Draft · not yet approved"} · {formatCurrency(Number(latestPayrollRun.totalNetPayable))}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[12px] font-semibold text-[#344863]">Not scheduled</p>
                      <p className="mt-0.5 text-[11px] text-[#8491a5]">Run payroll once employees are added.</p>
                    </div>
                  )}
                </div>
              </div>

              {probationCount > 0 ? (
                <div data-hr-probation-panel="true" className="flex items-center gap-3 rounded-[14px] border border-[#dfe6ef] bg-white p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white" style={{ background: toneGradients.amber }}>
                    <BriefcaseBusiness className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold text-[#344863]">Probation & Contracts</p>
                    <p className="mt-0.5 text-[11px] text-[#8491a5]">{probationCount} employee{probationCount === 1 ? "" : "s"} currently on probation</p>
                  </div>
                </div>
              ) : null}

              <div data-hr-events-panel="true" className="overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white">
                <div data-hr-panel-header="true" className="border-b border-[#e3e9f1] px-4 py-3.5"><h2 className="text-[14px] font-semibold text-[#223754]">Birthdays & Anniversaries</h2><p className="mt-0.5 text-[11px] text-[#7b8aa1]">Next 30 days</p></div>
                {upcomingEvents.birthdays.length === 0 && upcomingEvents.anniversaries.length === 0 ? (
                  <div data-hr-panel-body="true" className="flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#f1f5fb] text-[#4b70b6]"><Gift className="h-[18px] w-[18px]" /></span>
                    <p className="text-[11px] text-[#8491a5]">No upcoming events.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#edf1f6]">
                    {upcomingEvents.birthdays.map(({ employee, days }) => (
                      <div key={`birthday-${employee.id}`} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fff1e6] text-[#d6800d]"><Cake className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-[#344863]">{employee.name}&apos;s birthday</span>
                        <span className="shrink-0 text-[10px] font-medium text-[#8491a5]">{days === 0 ? "Today" : `in ${days}d`}</span>
                      </div>
                    ))}
                    {upcomingEvents.anniversaries.map(({ employee, days }) => (
                      <div key={`anniversary-${employee.id}`} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[#2f67e8]"><Gift className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-[#344863]">{employee.name}&apos;s work anniversary</span>
                        <span className="shrink-0 text-[10px] font-medium text-[#8491a5]">{days === 0 ? "Today" : `in ${days}d`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : activeSection === "settings" ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 lg:p-5">
          {setupItems.map((item) => <button key={item.title} type="button" onClick={() => handleSetupItemClick(item.title)} className="group flex min-h-[128px] items-start gap-4 rounded-[15px] border border-[#dce4ef] bg-white p-4 text-left shadow-[0_8px_20px_rgba(15,23,42,0.03)] transition hover:border-[#b9cdf5] hover:shadow-[0_12px_26px_rgba(47,103,232,0.08)]"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-[#eef4ff] text-[#2f67e8]"><item.icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold text-[#293e5c]">{item.title}</span><span className="mt-1.5 block text-[11px] leading-5 text-[#7b899e]">{item.description}</span><span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#2f67e8]">Configure <ChevronRight className="h-3.5 w-3.5" /></span></span></button>)}
        </div>
      ) : activeSection === "reports" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
          <div className="space-y-4">
            {reportGroups.map((group) => {
              const GroupIcon = group.icon;
              const items = reportItems.filter((item) => item.group === group.id);
              return (
                <section key={group.id} className="overflow-hidden rounded-[16px] border border-[#dce4ef] bg-white shadow-[0_7px_20px_rgba(26,44,73,0.035)]">
                  <div className="flex items-center gap-3 border-b border-[#e6ebf2] bg-[#fbfcfe] px-4 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#eef4ff] text-[#2f67e8]"><GroupIcon className="h-[17px] w-[17px]" /></span>
                    <div><h2 className="text-[13px] font-semibold text-[#2d425f]">{group.title}</h2><p className="mt-0.5 text-[10px] text-[#8592a5]">{group.description}</p></div>
                    <span className="ml-auto text-[10px] font-medium text-[#93a0b2]">{items.length} reports</span>
                  </div>
                  <div className="grid gap-px bg-[#e7ecf3] sm:grid-cols-2 xl:grid-cols-4">
                    {items.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => item.title === "Provident Fund" ? setProvidentFundOpen(true) : setHrReportOpen(item.title as HrReportKey)}
                        className="group flex min-h-[150px] flex-col bg-white p-4 text-left transition hover:bg-[#f8faff]"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-[11px] border border-[#dce7fb] bg-[#f1f6ff] text-[#3269dc] transition group-hover:border-[#bcd0f5] group-hover:bg-[#e8f0ff]"><item.icon className="h-[18px] w-[18px]" /></span>
                        <span className="mt-3 block text-[13px] font-semibold text-[#30435e]">{item.title}</span>
                        <span className="mt-1 block min-h-8 text-[10px] leading-4 text-[#8290a4]">{item.description}</span>
                        <span className="mt-auto flex items-end justify-between pt-3"><span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8b98aa]">{item.output}</span><span className="flex h-6 w-6 items-center justify-center rounded-full text-[#a0acbc] transition group-hover:bg-[#e8f0ff] group-hover:text-[#3269dc]"><ChevronRight className="h-3.5 w-3.5" /></span></span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : activeSection === "employees" ? (
        <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white lg:m-5">
          <div className="flex flex-col gap-3 bg-[#fbfcfe] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full shrink-0 sm:w-[320px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91a0b5]" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees..." className="h-9 w-full rounded-[9px] border border-[#d7e0ec] bg-white pl-9 pr-3 text-[12px] outline-none transition focus:border-[#79a3f5] focus:ring-2 focus:ring-[#dce9ff]" />
              </div>
              {employeeFiltersOpen ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <select value={employeeDepartmentFilter} onChange={(event) => setEmployeeDepartmentFilter(event.target.value)} className="h-9 min-w-[160px] flex-1 rounded-[8px] border border-[#d7e0ec] bg-white px-3 text-[12px] text-[#40536f] outline-none focus:border-[#79a3f5]" aria-label="Filter by department">
                    <option value="all">All departments</option>
                    {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                  </select>
                  <select value={employeeStatusFilter} onChange={(event) => setEmployeeStatusFilter(event.target.value)} className="h-9 min-w-[135px] flex-1 rounded-[8px] border border-[#d7e0ec] bg-white px-3 text-[12px] text-[#40536f] outline-none focus:border-[#79a3f5]" aria-label="Filter by employee status">
                    <option value="all">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="RESIGNED">Resigned</option>
                    <option value="TERMINATED">Terminated</option>
                  </select>
                  <select value={employeePaymentFilter} onChange={(event) => setEmployeePaymentFilter(event.target.value)} className="h-9 min-w-[160px] flex-1 rounded-[8px] border border-[#d7e0ec] bg-white px-3 text-[12px] text-[#40536f] outline-none focus:border-[#79a3f5]" aria-label="Filter by payment method">
                    <option value="all">All payment methods</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank</option>
                    <option value="MFS">MFS</option>
                  </select>
                  <Button type="button" variant="outline" className="h-9 rounded-[8px] px-3 text-[11px]" onClick={() => { setEmployeeDepartmentFilter("all"); setEmployeeStatusFilter("all"); setEmployeePaymentFilter("all"); setEmployeeQuickFilter(null); }}>
                    Clear
                  </Button>
                </div>
              ) : null}
              <Button
                variant="outline"
                className={cn("ml-auto h-9 rounded-[9px] px-3 text-[11px]", employeeFiltersOpen ? "border-[#8fb3ed] bg-[#eef5ff] text-[#255fcf]" : "")}
                onClick={() => setEmployeeFiltersOpen((current) => !current)}
                aria-expanded={employeeFiltersOpen}
              >
                <Filter className="h-3.5 w-3.5" /> Filters
              </Button>
            </div>
            {employeeQuickFilter ? (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#eef4ff] px-3 font-semibold text-[#255fcf]">
                  {employeeQuickFilter === "probation-ending" ? "Probation ending within 30 days" : employeeQuickFilter === "contract-ending" ? "Contract ending within 30 days" : "Joined this month"}
                  <button type="button" onClick={() => setEmployeeQuickFilter(null)} className="ml-1 hover:text-[#c2410c]" aria-label="Clear filter">×</button>
                </span>
              </div>
            ) : null}
          </div>
          {employees.length === 0 ? (
            <EmptyWorkspace section="employees" onSetup={() => { setEditingEmployee(null); setAddEmployeeOpen(true); }} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-[12px] [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-[#e7ecf3] [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-[#dfe6ef]">
                <thead className="bg-[#f7f9fc] text-[#5b6b83]">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Employee</th>
                    <th className="px-4 py-2.5 text-left font-semibold">
                      <div className="flex items-center justify-between gap-2">
                        <span>Department / Designation</span>
                        <button type="button" className={cn("rounded-full p-1 transition hover:bg-white hover:text-[#255fcf]", employeeDepartmentFilter !== "all" ? "bg-white text-[#255fcf]" : "text-[#7c8ba1]")} onClick={() => setEmployeeFiltersOpen(true)} aria-label="Filter by department" title="Filter by department">
                          <Filter className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold">Joined</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Probation / Contract End</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Gross Salary</th>
                    <th className="px-4 py-2.5 font-semibold">
                      <div className="flex items-center justify-between gap-2">
                        <span>Pay Via</span>
                        <button type="button" className={cn("rounded-full p-1 transition hover:bg-white hover:text-[#255fcf]", employeePaymentFilter !== "all" ? "bg-white text-[#255fcf]" : "text-[#7c8ba1]")} onClick={() => setEmployeeFiltersOpen(true)} aria-label="Filter by payment method" title="Filter by payment method">
                          <Filter className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </th>
                    <th className="px-4 py-2.5 font-semibold">
                      <div className="flex items-center justify-between gap-2">
                        <span>Status</span>
                        <button type="button" className={cn("rounded-full p-1 transition hover:bg-white hover:text-[#255fcf]", employeeStatusFilter !== "all" ? "bg-white text-[#255fcf]" : "text-[#7c8ba1]")} onClick={() => setEmployeeFiltersOpen(true)} aria-label="Filter by employee status" title="Filter by employee status">
                          <Filter className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees
                    .filter((employee) => {
                      const term = search.trim().toLowerCase();
                      const matchesSearch = !term ||
                        employee.name.toLowerCase().includes(term) ||
                        employee.employeeCode.toLowerCase().includes(term) ||
                        (employee.department?.name ?? "").toLowerCase().includes(term) ||
                        (employee.designation?.name ?? "").toLowerCase().includes(term);
                      if (!matchesSearch) return false;
                      if (employeeDepartmentFilter !== "all" && employee.department?.id !== employeeDepartmentFilter) return false;
                      if (employeeStatusFilter !== "all" && employee.status !== employeeStatusFilter) return false;
                      if (employeePaymentFilter !== "all" && employee.paymentMethod !== employeePaymentFilter) return false;
                      if (employeeQuickFilter === "probation-ending") return employee.status === "ACTIVE" && dashboardMetrics.withinNext30Days(employee.probationEndDate);
                      if (employeeQuickFilter === "contract-ending") return employee.status === "ACTIVE" && dashboardMetrics.withinNext30Days(employee.contractEndDate);
                      if (employeeQuickFilter === "new-joiners") return employee.joiningDate.slice(0, 7) === dashboardMetrics.todayIso.slice(0, 7);
                      return true;
                    })
                    .map((employee) => (
                      <tr
                        key={employee.id}
                        onClick={() => { setEditingEmployee(employee); setAddEmployeeOpen(true); }}
                        className="cursor-pointer border-t border-[#eef1f6] transition hover:bg-[#f8faff]"
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-[#223754]">{employee.name}</div>
                          <div className="text-[10px] text-[#8592a5]">{employee.employeeCode}</div>
                        </td>
                        <td className="px-4 py-2.5 text-[#4a5b73]">
                          {employee.department?.name || "—"}{employee.designation ? ` · ${employee.designation.name}` : ""}
                        </td>
                        <td className="px-4 py-2.5 text-[#4a5b73]">{formatDate(employee.joiningDate)}</td>
                        <td className="px-4 py-2.5 text-[#4a5b73]">
                          {employee.employmentType === "PROBATION" && employee.probationEndDate ? formatDate(employee.probationEndDate) : employee.employmentType === "CONTRACTUAL" && employee.contractEndDate ? formatDate(employee.contractEndDate) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[#223754]">{formatCurrency(Number(employee.grossSalary))}</td>
                        <td className="px-4 py-2.5 text-center text-[#4a5b73]">{employee.paymentMethod === "BANK" ? "Bank" : employee.paymentMethod === "MFS" ? "MFS" : "Cash"}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[10px] font-semibold", employee.status === "ACTIVE" ? "bg-[#e7f7ee] text-[#15925f]" : "bg-[#f1f4f8] text-[#65758c]")}>
                            {employee.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button type="button" onClick={(event) => { event.stopPropagation(); setLifecycleEmployee(employee); }} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#5b6b83] hover:bg-[#f5f0ff] hover:text-[#7355d9]" aria-label={`View ${employee.name}'s change history and exit process`}>
                              <History className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); setEditingEmployee(employee); setAddEmployeeOpen(true); }} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#5b6b83] hover:bg-[#eef4ff] hover:text-[#2f67e8]" aria-label={`Edit ${employee.name}`}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteEmployeeTarget(employee); }} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#5b6b83] hover:bg-[#fdecec] hover:text-[#c2410c]" aria-label={`Remove ${employee.name}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeSection === "attendance" ? (
        <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white lg:m-5">
          <div className="flex flex-col gap-3 bg-[#fbfcfe] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-[320px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91a0b5]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search attendance..." className="h-9 w-full rounded-[9px] border border-[#d7e0ec] bg-white pl-9 pr-3 text-[12px] outline-none focus:border-[#79a3f5] focus:ring-2 focus:ring-[#dce9ff]" /></div>
            <Button onClick={() => setAttendanceImportOpen(true)} className="h-9 rounded-[9px] bg-[#2f67e8] px-4 text-[11px] text-white hover:bg-[#2459ce]"><FileSpreadsheet className="h-4 w-4" /> Import Excel</Button>
          </div>
          {attendanceRecords.length === 0 ? (
            <EmptyWorkspace section="attendance" onSetup={() => setAttendanceImportOpen(true)} />
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[900px] border-collapse text-[12px]">
                <thead className="sticky top-0 bg-[#f7f9fc] text-[#5b6b83]"><tr><th className="px-4 py-2.5 text-left">Date</th><th className="px-4 py-2.5 text-left">Employee</th><th className="px-4 py-2.5 text-left">Department / Designation</th><th className="px-4 py-2.5 text-center">Status</th><th className="px-4 py-2.5 text-center">Check In</th><th className="px-4 py-2.5 text-center">Check Out</th><th className="px-4 py-2.5 text-right">Late</th><th className="px-4 py-2.5 text-right">Overtime</th></tr></thead>
                <tbody>{attendanceRecords.filter((record) => { const term = search.trim().toLowerCase(); return !term || record.employee.name.toLowerCase().includes(term) || record.employee.employeeCode.toLowerCase().includes(term) || record.status.toLowerCase().includes(term); }).map((record) => <tr key={record.id} className="border-t border-[#edf1f6] hover:bg-[#f8faff]"><td className="px-4 py-2.5">{formatDate(record.attendanceDate)}</td><td className="px-4 py-2.5"><div className="font-medium text-[#223754]">{record.employee.name}</div><div className="text-[10px] text-[#8592a5]">{record.employee.employeeCode}</div></td><td className="px-4 py-2.5 text-[#4a5b73]">{record.employee.department?.name ?? "—"}{record.employee.designation ? ` · ${record.employee.designation.name}` : ""}</td><td className="px-4 py-2.5 text-center"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold", record.status === "PRESENT" ? "bg-[#e7f7ee] text-[#15925f]" : record.status === "ABSENT" ? "bg-[#fdecec] text-[#c2410c]" : "bg-[#fff3e0] text-[#b96b09]")}>{record.status}</span></td><td className="px-4 py-2.5 text-center">{record.checkIn ?? "—"}</td><td className="px-4 py-2.5 text-center">{record.checkOut ?? "—"}</td><td className="px-4 py-2.5 text-right">{record.lateMinutes}m</td><td className="px-4 py-2.5 text-right">{formatHoursFromMinutes(record.overtimeMinutes)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeSection === "payroll" ? (
        <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white lg:m-5">
          {payrollRuns.length === 0 ? (
            <EmptyWorkspace section="payroll" onSetup={() => router.push("/app/payroll-hr/run-payroll")} />
          ) : (
            <div className="divide-y divide-[#edf1f6]">
              {payrollRuns.map((run) => (
                <div key={run.id} role="button" tabIndex={0} onClick={() => setPayrollRunDetail(run)} onKeyDown={(event) => { if (event.key === "Enter") setPayrollRunDetail(run); }} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#f8faff]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2f67e8]"><Banknote className="h-[18px] w-[18px]" /></span>
                    <div>
                      <p className="text-[13px] font-semibold text-[#223754]">{MONTH_NAMES[run.periodMonth - 1]} {run.periodYear}</p>
                      <p className="mt-0.5 text-[11px] text-[#8592a5]">{run.payslips.length} employees · {run.totalWorkingDays} working days</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[11px] text-[#8592a5]">Net Payable</p>
                      <p className={cn("text-[13px] font-semibold", Number(run.totalNetPayable) < 0 ? "text-[#e11d2f]" : "text-[#1f8a4d]")}>{formatCurrency(Number(run.totalNetPayable))}</p>
                    </div>
                    <span className={cn("inline-flex h-7 items-center rounded-full px-3 text-[11px] font-semibold", run.status === "PAID" ? "bg-[#e7f7ee] text-[#15925f]" : run.status === "APPROVED" ? "bg-[#eef4ff] text-[#255fcf]" : "bg-[#fff3e0] text-[#c2740d]")}>
                      {run.status === "DRAFT" ? "Draft" : run.status === "APPROVED" ? "Approved" : "Paid"}
                    </span>
                    {run.status === "DRAFT" ? (
                      <button
                        type="button"
                        aria-label={`Delete ${MONTH_NAMES[run.periodMonth - 1]} ${run.periodYear} payroll`}
                        title="Delete payroll"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeletePayrollRunTarget(run);
                        }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-[#ffc5cc] bg-[#fff1f3] text-[#dc3545] transition hover:border-[#ff9daa] hover:bg-[#ffe4e8] hover:text-[#b91c2c]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                    <ChevronRight className="h-4 w-4 text-[#a1adbd]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeSection === "leave" ? (
        <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white lg:m-5">
          {leaveRequests.length === 0 ? (
            <EmptyWorkspace section="leave" onSetup={() => setApplyLeaveOpen(true)} />
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[920px] border-collapse text-[12px]">
                <thead className="sticky top-0 bg-[#f7f9fc] text-[#5b6b83]">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Employee</th>
                    <th className="px-4 py-2.5 text-left">Leave Type</th>
                    <th className="px-4 py-2.5 text-left">Dates</th>
                    <th className="px-4 py-2.5 text-right">Days</th>
                    <th className="px-4 py-2.5 text-left">Reason</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveRequests.map((request) => (
                    <tr key={request.id} className="border-t border-[#edf1f6] hover:bg-[#f8faff]">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-[#223754]">{request.employee.name}</div>
                        <div className="text-[10px] text-[#8592a5]">{request.employee.employeeCode}</div>
                      </td>
                      <td className="px-4 py-2.5 text-[#4a5b73]">{request.leaveType.name}</td>
                      <td className="px-4 py-2.5 text-[#4a5b73]">{formatDate(request.startDate)} – {formatDate(request.endDate)}</td>
                      <td className="px-4 py-2.5 text-right text-[#223754]">{request.totalDays}</td>
                      <td className="px-4 py-2.5 text-[#4a5b73]">{request.reason || "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={cn(
                            "inline-flex h-6 items-center rounded-full px-2.5 text-[10px] font-semibold",
                            request.status === "APPROVED" ? "bg-[#e7f7ee] text-[#15925f]" : request.status === "REJECTED" ? "bg-[#fdecec] text-[#c2410c]" : request.status === "CANCELLED" ? "bg-[#f1f4f8] text-[#65758c]" : "bg-[#fff3e0] text-[#b96b09]",
                          )}
                        >
                          {request.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {request.status === "PENDING" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button onClick={() => void handleApproveLeaveRequest(request.id, request.employee.name)} className="h-7 rounded-[7px] bg-[#2f67e8] px-2.5 text-[11px] text-white hover:bg-[#2459ce]">Approve</Button>
                            <Button variant="outline" onClick={() => void handleRejectLeaveRequest(request.id, request.employee.name)} className="h-7 rounded-[7px] px-2.5 text-[11px]">Reject</Button>
                            <button type="button" onClick={() => void handleCancelLeaveRequest(request.id, request.employee.name)} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#8592a5] hover:bg-[#fdecec] hover:text-[#c2410c]" aria-label="Cancel request">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#a1adbd]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeSection === "expenses" ? (
        <ExpenseClaimsSection addOpen={newExpenseClaimOpen} onAddOpenChange={setNewExpenseClaimOpen} />
      ) : activeSection === "loans" ? (
        <EmployeeLoansSection addOpen={newLoanOpen} onAddOpenChange={setNewLoanOpen} />
      ) : activeSection === "recruitment" ? (
        <RecruitmentSection />
      ) : activeSection === "approvals" ? (
        <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white lg:m-5">
          {pendingLeaveRequests.length === 0 && pendingPayrollRuns.length === 0 ? (
            <HrEmptyState icon={ListChecks} title="You're all caught up" description="No pending leave requests or payroll runs right now." />
          ) : (
            <div className="divide-y divide-[#edf1f6]">
              {pendingLeaveRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#fff3e0] text-[#c2740d]"><CalendarClock className="h-4 w-4" /></span>
                    <div>
                      <p className="text-[13px] font-medium text-[#223754]">{request.employee.name} · {request.leaveType.name}</p>
                      <p className="text-[11px] text-[#8592a5]">{formatDate(request.startDate)} – {formatDate(request.endDate)} · {request.totalDays} day(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button onClick={() => void handleApproveLeaveRequest(request.id, request.employee.name)} className="h-7 rounded-[7px] bg-[#2f67e8] px-2.5 text-[11px] text-white hover:bg-[#2459ce]">Approve</Button>
                    <Button variant="outline" onClick={() => void handleRejectLeaveRequest(request.id, request.employee.name)} className="h-7 rounded-[7px] px-2.5 text-[11px]">Reject</Button>
                  </div>
                </div>
              ))}
              {pendingPayrollRuns.map((run) => (
                <button key={run.id} type="button" onClick={() => setPayrollRunDetail(run)} className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-[#f8faff]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#eef4ff] text-[#2f67e8]"><Banknote className="h-4 w-4" /></span>
                    <div>
                      <p className="text-[13px] font-medium text-[#223754]">Payroll — {MONTH_NAMES[run.periodMonth - 1]} {run.periodYear}</p>
                      <p className="text-[11px] text-[#8592a5]">{run.payslips.length} employees · {formatCurrency(Number(run.totalNetPayable))} net payable</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#a1adbd]" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-[15px] border border-[#dce4ef] bg-white lg:m-5">
          <div className="flex flex-col gap-3 bg-[#fbfcfe] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-[320px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91a0b5]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${sections.find((item) => item.id === activeSection)?.label.toLowerCase()}...`} className="h-9 w-full rounded-[9px] border border-[#d7e0ec] bg-white pl-9 pr-3 text-[12px] outline-none transition focus:border-[#79a3f5] focus:ring-2 focus:ring-[#dce9ff]" /></div>
            <Button variant="outline" className="h-9 rounded-[9px] px-3 text-[11px]"><Filter className="h-3.5 w-3.5" /> Filters</Button>
          </div>
          <EmptyWorkspace section={activeSection} onSetup={() => openSetup(copy.title)} />
        </div>
      )}

      <Dialog open={Boolean(setupDialog)} onOpenChange={(open) => !open && setSetupDialog(null)}>
        <DialogContent className="w-[min(92vw,560px)] rounded-[18px] p-0">
          <div className="border-b border-[#e1e7f0] px-5 py-4">
            <DialogTitle className="text-[18px] font-semibold text-[#203553]">{setupDialog}</DialogTitle>
            <DialogDescription className="mt-1 text-[12px] text-[#77869c]">HR & Payroll module setup</DialogDescription>
          </div>
          {setupDialog === "Payroll Rules" ? <PayrollRulesForm onClose={() => setSetupDialog(null)} /> : setupDialog === "Salary Components" ? <SalaryComponentsForm onClose={() => setSetupDialog(null)} /> : <div className="px-5 py-6">
            <div className="flex gap-3 rounded-[13px] border border-[#d9e5fb] bg-[#f5f8ff] p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#2f67e8]" />
              <div><p className="text-[13px] font-semibold text-[#2a4265]">Safe module foundation is ready</p><p className="mt-1 text-[11px] leading-5 text-[#6f8099]">This screen does not create temporary or fake HR records. The {setupDialog?.toLowerCase()} form will be connected when the HR database and permission layer are added.</p></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {["Workspace scoped", "Permission controlled", "Audit ready"].map((label) => <div key={label} className="rounded-[10px] border border-[#e3e9f1] bg-white px-3 py-2.5 text-center text-[10px] font-medium text-[#64748b]">{label}</div>)}
            </div>
          </div>}
          {setupDialog !== "Payroll Rules" && setupDialog !== "Salary Components" ? <div className="flex justify-end border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3"><Button variant="outline" onClick={() => setSetupDialog(null)} className="h-9 rounded-[9px] px-4 text-[12px]">Close</Button></div> : null}
        </DialogContent>
      </Dialog>

      <AddEmployeeDialog open={addEmployeeOpen} onOpenChange={setAddEmployeeOpen} employee={editingEmployee} />

      <DepartmentDesignationManagerDialog open={lookupManagerOpen} onOpenChange={setLookupManagerOpen} />

      <AttendanceImportDialog open={attendanceImportOpen} onOpenChange={setAttendanceImportOpen} />


      <PayrollRunDetailDialog open={Boolean(payrollRunDetail)} onOpenChange={(open) => !open && setPayrollRunDetail(null)} run={payrollRunDetail} />

      <ProvidentFundDialog open={providentFundOpen} onOpenChange={setProvidentFundOpen} />

      <HrReportsDialog reportKey={hrReportOpen} onOpenChange={(open) => !open && setHrReportOpen(null)} />

      <EmployeeLifecycleDialog employee={lifecycleEmployee} onOpenChange={(open) => !open && setLifecycleEmployee(null)} />

      <ApplyLeaveDialog open={applyLeaveOpen} onOpenChange={setApplyLeaveOpen} employees={employees} />

      <LeaveTypeManagerDialog open={leaveTypeManagerOpen} onOpenChange={setLeaveTypeManagerOpen} />

      <ConfirmationDialog
        open={Boolean(deleteEmployeeTarget)}
        onOpenChange={(open) => !open && setDeleteEmployeeTarget(null)}
        title="Remove employee?"
        description={`${deleteEmployeeTarget?.name ?? "This employee"} will be permanently removed. Employees with payroll history cannot be removed — mark them Resigned/Terminated instead.`}
        confirmLabel="Remove"
        tone="danger"
        onConfirm={handleConfirmDeleteEmployee}
      />
      <ConfirmationDialog
        open={Boolean(deletePayrollRunTarget)}
        onOpenChange={(open) => !open && setDeletePayrollRunTarget(null)}
        title="Delete draft payroll?"
        description={`${deletePayrollRunTarget ? `${MONTH_NAMES[deletePayrollRunTarget.periodMonth - 1]} ${deletePayrollRunTarget.periodYear}` : "This payroll"} and all of its payslips will be permanently deleted.`}
        confirmLabel={deletePayrollRunMutation.isPending ? "Deleting..." : "Delete"}
        tone="danger"
        onConfirm={() => void handleConfirmDeletePayrollRun()}
      />
    </div>
  );
}
