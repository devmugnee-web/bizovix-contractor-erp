import { apiRequest } from "@/services/api-client";
import type {
  CalculatePayrollInput,
  AttendanceImportResult,
  AttendanceImportRow,
  AttendanceRecord,
  BusinessUnitRecord,
  CandidateRecord,
  CostCenterRecord,
  CreateCandidateInput,
  CreateEmployeeChangeInput,
  CreateEmployeeInput,
  CreateEmployeeLoanInput,
  CreateExitProcessInput,
  CreateExpenseClaimInput,
  CreateHolidayInput,
  CreateJobApplicationInput,
  CreateJobOpeningInput,
  CreateLeaveRequestInput,
  CreateLoanRepaymentInput,
  CreateShiftInput,
  DepartmentRecord,
  DesignationRecord,
  DivisionRecord,
  EmployeeChangeRecord,
  EmployeeLoanRecord,
  EmployeeRecord,
  ExitProcessRecord,
  ExpenseClaimRecord,
  GradeRecord,
  HolidayRecord,
  JobApplicationRecord,
  JobOpeningRecord,
  LeaveBalance,
  LeaveRequestRecord,
  LeaveTypeRecord,
  LocationRecord,
  OnboardingChecklistRecord,
  PayrollRunRecord,
  PayrollSettingsRecord,
  PayslipRecord,
  ProvidentFundSummaryRecord,
  ShiftRecord,
  UpdateEmployeeInput,
  UpdateExitProcessInput,
  UpdateJobApplicationInput,
  UpdateJobOpeningInput,
  UpdateOnboardingChecklistInput,
  UpdatePayrollSettingsInput,
} from "@/types/hr";

export function getAttendance() {
  return apiRequest<AttendanceRecord[]>("/hr/attendance");
}

export function getPayrollSettings() {
  return apiRequest<PayrollSettingsRecord>("/hr/payroll-settings");
}

export function updatePayrollSettings(input: UpdatePayrollSettingsInput) {
  return apiRequest<PayrollSettingsRecord>("/hr/payroll-settings", { method: "PATCH", body: JSON.stringify(input) });
}

export function importAttendance(rows: AttendanceImportRow[]) {
  return apiRequest<AttendanceImportResult>("/hr/attendance/import", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

export function getDepartments() {
  return apiRequest<DepartmentRecord[]>("/hr/departments");
}

export function createDepartment(name: string) {
  return apiRequest<DepartmentRecord>("/hr/departments", { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteDepartment(departmentId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/departments/${departmentId}`, { method: "DELETE" });
}

export function getDesignations() {
  return apiRequest<DesignationRecord[]>("/hr/designations");
}

export function createDesignation(name: string) {
  return apiRequest<DesignationRecord>("/hr/designations", { method: "POST", body: JSON.stringify({ name }) });
}

export function getGrades() {
  return apiRequest<GradeRecord[]>("/hr/grades");
}

export function createGrade(input: { name: string; level?: number }) {
  return apiRequest<GradeRecord>("/hr/grades", { method: "POST", body: JSON.stringify(input) });
}

export function deleteGrade(gradeId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/grades/${gradeId}`, { method: "DELETE" });
}

export function getBusinessUnits() {
  return apiRequest<BusinessUnitRecord[]>("/hr/business-units");
}

export function createBusinessUnit(name: string) {
  return apiRequest<BusinessUnitRecord>("/hr/business-units", { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteBusinessUnit(businessUnitId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/business-units/${businessUnitId}`, { method: "DELETE" });
}

export function getDivisions() {
  return apiRequest<DivisionRecord[]>("/hr/divisions");
}

export function createDivision(name: string) {
  return apiRequest<DivisionRecord>("/hr/divisions", { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteDivision(divisionId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/divisions/${divisionId}`, { method: "DELETE" });
}

export function getLocations() {
  return apiRequest<LocationRecord[]>("/hr/locations");
}

export function createLocation(name: string) {
  return apiRequest<LocationRecord>("/hr/locations", { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteLocation(locationId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/locations/${locationId}`, { method: "DELETE" });
}

export function getCostCenters() {
  return apiRequest<CostCenterRecord[]>("/hr/cost-centers");
}

export function createCostCenter(name: string) {
  return apiRequest<CostCenterRecord>("/hr/cost-centers", { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteCostCenter(costCenterId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/cost-centers/${costCenterId}`, { method: "DELETE" });
}

export function deleteDesignation(designationId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/designations/${designationId}`, { method: "DELETE" });
}

export function getEmployees() {
  return apiRequest<EmployeeRecord[]>("/hr/employees");
}

export function createEmployee(input: CreateEmployeeInput) {
  return apiRequest<EmployeeRecord>("/hr/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEmployee(employeeId: string, input: UpdateEmployeeInput) {
  return apiRequest<EmployeeRecord>(`/hr/employees/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteEmployee(employeeId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/employees/${employeeId}`, {
    method: "DELETE",
  });
}

export function getEmployeeChanges(employeeId: string) {
  return apiRequest<EmployeeChangeRecord[]>(`/hr/employees/${employeeId}/changes`);
}

export function createEmployeeChange(input: CreateEmployeeChangeInput) {
  return apiRequest<EmployeeChangeRecord>("/hr/employee-changes", { method: "POST", body: JSON.stringify(input) });
}

export function getExitProcess(employeeId: string) {
  return apiRequest<ExitProcessRecord | null>(`/hr/employees/${employeeId}/exit-process`);
}

export function createExitProcess(input: CreateExitProcessInput) {
  return apiRequest<ExitProcessRecord>("/hr/exit-processes", { method: "POST", body: JSON.stringify(input) });
}

export function updateExitProcess(exitProcessId: string, input: UpdateExitProcessInput) {
  return apiRequest<ExitProcessRecord>(`/hr/exit-processes/${exitProcessId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getPayrollRuns() {
  return apiRequest<PayrollRunRecord[]>("/hr/payroll-runs");
}

export function calculatePayroll(input: CalculatePayrollInput) {
  return apiRequest<PayrollRunRecord>("/hr/payroll-runs/calculate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deletePayrollRun(payrollRunId: string) {
  return apiRequest<{ id: string }>(`/hr/payroll-runs/${payrollRunId}`, {
    method: "DELETE",
  });
}

export function approvePayrollRun(payrollRunId: string) {
  return apiRequest<PayrollRunRecord>(`/hr/payroll-runs/${payrollRunId}/approve`, {
    method: "PATCH",
  });
}

export function markPayslipPaid(payslipId: string) {
  return apiRequest<PayslipRecord>(`/hr/payslips/${payslipId}/mark-paid`, {
    method: "PATCH",
  });
}

export function getProvidentFundSummary() {
  return apiRequest<ProvidentFundSummaryRecord[]>("/hr/provident-fund");
}

export function getLeaveTypes() {
  return apiRequest<LeaveTypeRecord[]>("/hr/leave-types");
}

export function createLeaveType(input: { name: string; daysPerYear: number }) {
  return apiRequest<LeaveTypeRecord>("/hr/leave-types", { method: "POST", body: JSON.stringify(input) });
}

export function deleteLeaveType(leaveTypeId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/leave-types/${leaveTypeId}`, { method: "DELETE" });
}

export function getLeaveRequests() {
  return apiRequest<LeaveRequestRecord[]>("/hr/leave-requests");
}

export function getLeaveBalances() {
  return apiRequest<LeaveBalance[]>("/hr/leave-balances");
}

export function createLeaveRequest(input: CreateLeaveRequestInput) {
  return apiRequest<LeaveRequestRecord>("/hr/leave-requests", { method: "POST", body: JSON.stringify(input) });
}

export function approveLeaveRequest(leaveRequestId: string) {
  return apiRequest<LeaveRequestRecord>(`/hr/leave-requests/${leaveRequestId}/approve`, { method: "PATCH" });
}

export function rejectLeaveRequest(leaveRequestId: string, note?: string) {
  return apiRequest<LeaveRequestRecord>(`/hr/leave-requests/${leaveRequestId}/reject`, { method: "PATCH", body: JSON.stringify({ note }) });
}

export function cancelLeaveRequest(leaveRequestId: string) {
  return apiRequest<LeaveRequestRecord>(`/hr/leave-requests/${leaveRequestId}/cancel`, { method: "PATCH" });
}

export function getShifts() {
  return apiRequest<ShiftRecord[]>("/hr/shifts");
}

export function createShift(input: CreateShiftInput) {
  return apiRequest<ShiftRecord>("/hr/shifts", { method: "POST", body: JSON.stringify(input) });
}

export function deleteShift(shiftId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/shifts/${shiftId}`, { method: "DELETE" });
}

export function getHolidays() {
  return apiRequest<HolidayRecord[]>("/hr/holidays");
}

export function createHoliday(input: CreateHolidayInput) {
  return apiRequest<HolidayRecord>("/hr/holidays", { method: "POST", body: JSON.stringify(input) });
}

export function deleteHoliday(holidayId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/holidays/${holidayId}`, { method: "DELETE" });
}

export function getExpenseClaims() {
  return apiRequest<ExpenseClaimRecord[]>("/hr/expense-claims");
}

export function createExpenseClaim(input: CreateExpenseClaimInput) {
  return apiRequest<ExpenseClaimRecord>("/hr/expense-claims", { method: "POST", body: JSON.stringify(input) });
}

export function approveExpenseClaim(expenseClaimId: string) {
  return apiRequest<ExpenseClaimRecord>(`/hr/expense-claims/${expenseClaimId}/approve`, { method: "PATCH" });
}

export function rejectExpenseClaim(expenseClaimId: string, note?: string) {
  return apiRequest<ExpenseClaimRecord>(`/hr/expense-claims/${expenseClaimId}/reject`, { method: "PATCH", body: JSON.stringify({ note }) });
}

export function markExpenseReimbursed(expenseClaimId: string) {
  return apiRequest<ExpenseClaimRecord>(`/hr/expense-claims/${expenseClaimId}/mark-reimbursed`, { method: "PATCH" });
}

export function deleteExpenseClaim(expenseClaimId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/hr/expense-claims/${expenseClaimId}`, { method: "DELETE" });
}

export function getEmployeeLoans() {
  return apiRequest<EmployeeLoanRecord[]>("/hr/employee-loans");
}

export function createEmployeeLoan(input: CreateEmployeeLoanInput) {
  return apiRequest<EmployeeLoanRecord>("/hr/employee-loans", { method: "POST", body: JSON.stringify(input) });
}

export function approveEmployeeLoan(loanId: string) {
  return apiRequest<EmployeeLoanRecord>(`/hr/employee-loans/${loanId}/approve`, { method: "PATCH" });
}

export function rejectEmployeeLoan(loanId: string) {
  return apiRequest<EmployeeLoanRecord>(`/hr/employee-loans/${loanId}/reject`, { method: "PATCH" });
}

export function disburseEmployeeLoan(loanId: string) {
  return apiRequest<EmployeeLoanRecord>(`/hr/employee-loans/${loanId}/disburse`, { method: "PATCH" });
}

export function createLoanRepayment(loanId: string, input: CreateLoanRepaymentInput) {
  return apiRequest<{ totalRepaid: number; remainingBalance: number }>(`/hr/employee-loans/${loanId}/repayments`, { method: "POST", body: JSON.stringify(input) });
}

export function getJobOpenings() {
  return apiRequest<JobOpeningRecord[]>("/hr/job-openings");
}

export function createJobOpening(input: CreateJobOpeningInput) {
  return apiRequest<JobOpeningRecord>("/hr/job-openings", { method: "POST", body: JSON.stringify(input) });
}

export function updateJobOpening(jobOpeningId: string, input: UpdateJobOpeningInput) {
  return apiRequest<JobOpeningRecord>(`/hr/job-openings/${jobOpeningId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getCandidates() {
  return apiRequest<CandidateRecord[]>("/hr/candidates");
}

export function createCandidate(input: CreateCandidateInput) {
  return apiRequest<CandidateRecord>("/hr/candidates", { method: "POST", body: JSON.stringify(input) });
}

export function getJobApplications() {
  return apiRequest<JobApplicationRecord[]>("/hr/job-applications");
}

export function createJobApplication(input: CreateJobApplicationInput) {
  return apiRequest<JobApplicationRecord>("/hr/job-applications", { method: "POST", body: JSON.stringify(input) });
}

export function updateJobApplication(jobApplicationId: string, input: UpdateJobApplicationInput) {
  return apiRequest<JobApplicationRecord>(`/hr/job-applications/${jobApplicationId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function getOnboardingChecklist(employeeId: string) {
  return apiRequest<OnboardingChecklistRecord>(`/hr/employees/${employeeId}/onboarding`);
}

export function updateOnboardingChecklist(employeeId: string, input: UpdateOnboardingChecklistInput) {
  return apiRequest<OnboardingChecklistRecord>(`/hr/employees/${employeeId}/onboarding`, { method: "PATCH", body: JSON.stringify(input) });
}
