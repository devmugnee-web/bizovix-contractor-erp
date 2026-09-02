"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/services/api-client";
import {
  approveEmployeeLoan,
  approveExpenseClaim,
  approveLeaveRequest,
  approvePayrollRun,
  calculatePayroll,
  deletePayrollRun,
  cancelLeaveRequest,
  createBusinessUnit,
  createCostCenter,
  createDepartment,
  createDesignation,
  createCandidate,
  createDivision,
  createEmployee,
  createEmployeeChange,
  createEmployeeLoan,
  createExitProcess,
  createExpenseClaim,
  createGrade,
  createHoliday,
  createJobApplication,
  createJobOpening,
  createLeaveRequest,
  createLeaveType,
  createLoanRepayment,
  createLocation,
  createShift,
  deleteBusinessUnit,
  deleteCostCenter,
  deleteDepartment,
  deleteDesignation,
  deleteDivision,
  deleteEmployee,
  deleteExpenseClaim,
  deleteGrade,
  deleteHoliday,
  deleteLeaveType,
  deleteLocation,
  deleteShift,
  disburseEmployeeLoan,
  getBusinessUnits,
  getCandidates,
  getCostCenters,
  getDepartments,
  getAttendance,
  getDesignations,
  getDivisions,
  getEmployeeChanges,
  getEmployeeLoans,
  getEmployees,
  getExitProcess,
  getExpenseClaims,
  getGrades,
  getHolidays,
  getJobApplications,
  getJobOpenings,
  getLeaveBalances,
  getLeaveRequests,
  getLeaveTypes,
  getLocations,
  getOnboardingChecklist,
  getPayrollRuns,
  getPayrollSettings,
  getProvidentFundSummary,
  getShifts,
  markExpenseReimbursed,
  markPayslipPaid,
  importAttendance,
  rejectEmployeeLoan,
  rejectExpenseClaim,
  rejectLeaveRequest,
  updateEmployee,
  updateExitProcess,
  updateJobApplication,
  updateJobOpening,
  updateOnboardingChecklist,
  updatePayrollSettings,
} from "@/services/hr.service";
import type {
  AttendanceImportRow,
  CalculatePayrollInput,
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
  EmployeeRecord,
  UpdateEmployeeInput,
  UpdateExitProcessInput,
  UpdateJobApplicationInput,
  UpdateJobOpeningInput,
  UpdateOnboardingChecklistInput,
  UpdatePayrollSettingsInput,
} from "@/types/hr";

const employeesKey = ["hr", "employees"] as const;
const payrollRunsKey = ["hr", "payroll-runs"] as const;
const payrollSettingsKey = ["hr", "payroll-settings"] as const;
const departmentsKey = ["hr", "departments"] as const;
const designationsKey = ["hr", "designations"] as const;
const gradesKey = ["hr", "grades"] as const;
const businessUnitsKey = ["hr", "business-units"] as const;
const divisionsKey = ["hr", "divisions"] as const;
const locationsKey = ["hr", "locations"] as const;
const costCentersKey = ["hr", "cost-centers"] as const;
const attendanceKey = ["hr", "attendance"] as const;
const leaveTypesKey = ["hr", "leave-types"] as const;
const leaveRequestsKey = ["hr", "leave-requests"] as const;
const leaveBalancesKey = ["hr", "leave-balances"] as const;
const providentFundKey = ["hr", "provident-fund"] as const;
const shiftsKey = ["hr", "shifts"] as const;
const holidaysKey = ["hr", "holidays"] as const;
const expenseClaimsKey = ["hr", "expense-claims"] as const;
const employeeLoansKey = ["hr", "employee-loans"] as const;
const jobOpeningsKey = ["hr", "job-openings"] as const;
const candidatesKey = ["hr", "candidates"] as const;
const jobApplicationsKey = ["hr", "job-applications"] as const;

export function usePayrollSettingsQuery(enabled: boolean) {
  return useQuery({ queryKey: payrollSettingsKey, queryFn: getPayrollSettings, enabled });
}

export function useUpdatePayrollSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePayrollSettingsInput) => updatePayrollSettings(input),
    onSuccess: (data) => queryClient.setQueryData(payrollSettingsKey, data),
  });
}

export function useAttendanceQuery(enabled: boolean) {
  return useQuery({ queryKey: attendanceKey, queryFn: getAttendance, enabled, retry: shouldRetry });
}

export function useImportAttendanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: AttendanceImportRow[]) => importAttendance(rows),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: attendanceKey }),
  });
}

function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 400 || error.status === 403)) {
    return false;
  }
  return failureCount < 2;
}

export function useDepartmentsQuery(enabled: boolean) {
  return useQuery({ queryKey: departmentsKey, queryFn: getDepartments, enabled, retry: shouldRetry });
}

export function useCreateDepartmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createDepartment(name),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: departmentsKey }),
  });
}

export function useDeleteDepartmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (departmentId: string) => deleteDepartment(departmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: departmentsKey });
      void queryClient.invalidateQueries({ queryKey: employeesKey });
    },
  });
}

export function useDesignationsQuery(enabled: boolean) {
  return useQuery({ queryKey: designationsKey, queryFn: getDesignations, enabled, retry: shouldRetry });
}

export function useCreateDesignationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createDesignation(name),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: designationsKey }),
  });
}

export function useDeleteDesignationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (designationId: string) => deleteDesignation(designationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: designationsKey });
      void queryClient.invalidateQueries({ queryKey: employeesKey });
    },
  });
}

export function useGradesQuery(enabled: boolean) {
  return useQuery({ queryKey: gradesKey, queryFn: getGrades, enabled, retry: shouldRetry });
}

export function useCreateGradeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; level?: number }) => createGrade(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: gradesKey }),
  });
}

export function useDeleteGradeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (gradeId: string) => deleteGrade(gradeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gradesKey });
      void queryClient.invalidateQueries({ queryKey: employeesKey });
    },
  });
}

export function useBusinessUnitsQuery(enabled: boolean) {
  return useQuery({ queryKey: businessUnitsKey, queryFn: getBusinessUnits, enabled, retry: shouldRetry });
}

export function useCreateBusinessUnitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createBusinessUnit(name),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: businessUnitsKey }),
  });
}

export function useDeleteBusinessUnitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (businessUnitId: string) => deleteBusinessUnit(businessUnitId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: businessUnitsKey });
      void queryClient.invalidateQueries({ queryKey: employeesKey });
    },
  });
}

export function useDivisionsQuery(enabled: boolean) {
  return useQuery({ queryKey: divisionsKey, queryFn: getDivisions, enabled, retry: shouldRetry });
}

export function useCreateDivisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createDivision(name),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: divisionsKey }),
  });
}

export function useDeleteDivisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (divisionId: string) => deleteDivision(divisionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: divisionsKey });
      void queryClient.invalidateQueries({ queryKey: employeesKey });
    },
  });
}

export function useLocationsQuery(enabled: boolean) {
  return useQuery({ queryKey: locationsKey, queryFn: getLocations, enabled, retry: shouldRetry });
}

export function useCreateLocationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createLocation(name),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: locationsKey }),
  });
}

export function useDeleteLocationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (locationId: string) => deleteLocation(locationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: locationsKey });
      void queryClient.invalidateQueries({ queryKey: employeesKey });
    },
  });
}

export function useCostCentersQuery(enabled: boolean) {
  return useQuery({ queryKey: costCentersKey, queryFn: getCostCenters, enabled, retry: shouldRetry });
}

export function useCreateCostCenterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createCostCenter(name),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: costCentersKey }),
  });
}

export function useDeleteCostCenterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (costCenterId: string) => deleteCostCenter(costCenterId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: costCentersKey });
      void queryClient.invalidateQueries({ queryKey: employeesKey });
    },
  });
}

export function useEmployeesQuery(enabled: boolean) {
  return useQuery({
    queryKey: employeesKey,
    queryFn: getEmployees,
    enabled,
    retry: shouldRetry,
  });
}

export function usePayrollRunsQuery(enabled: boolean) {
  return useQuery({
    queryKey: payrollRunsKey,
    queryFn: getPayrollRuns,
    enabled,
    retry: shouldRetry,
  });
}

export function useCreateEmployeeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => createEmployee(input),
    onSuccess: (employee) => {
      queryClient.setQueryData<EmployeeRecord[]>(employeesKey, (current) => current ? [employee, ...current.filter((item) => item.id !== employee.id)] : [employee]);
      void queryClient.invalidateQueries({ queryKey: employeesKey });
    },
  });
}

export function useUpdateEmployeeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, input }: { employeeId: string; input: UpdateEmployeeInput }) => updateEmployee(employeeId, input),
    onSuccess: (employee) => {
      queryClient.setQueryData<EmployeeRecord[]>(employeesKey, (current) => current?.map((item) => item.id === employee.id ? employee : item) ?? [employee]);
      void queryClient.invalidateQueries({ queryKey: employeesKey });
    },
  });
}

export function useDeleteEmployeeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string) => deleteEmployee(employeeId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: employeesKey }),
  });
}

export function useEmployeeChangesQuery(employeeId: string | null) {
  return useQuery({
    queryKey: ["hr", "employee-changes", employeeId] as const,
    queryFn: () => getEmployeeChanges(employeeId as string),
    enabled: Boolean(employeeId),
    retry: shouldRetry,
  });
}

export function useCreateEmployeeChangeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmployeeChangeInput) => createEmployeeChange(input),
    onSuccess: (_result, variables) => void queryClient.invalidateQueries({ queryKey: ["hr", "employee-changes", variables.employeeId] }),
  });
}

export function useExitProcessQuery(employeeId: string | null) {
  return useQuery({
    queryKey: ["hr", "exit-process", employeeId] as const,
    queryFn: () => getExitProcess(employeeId as string),
    enabled: Boolean(employeeId),
    retry: shouldRetry,
  });
}

export function useCreateExitProcessMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExitProcessInput) => createExitProcess(input),
    onSuccess: (_result, variables) => void queryClient.invalidateQueries({ queryKey: ["hr", "exit-process", variables.employeeId] }),
  });
}

export function useUpdateExitProcessMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ exitProcessId, input }: { exitProcessId: string; input: UpdateExitProcessInput }) => updateExitProcess(exitProcessId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["hr", "exit-process"] }),
  });
}

export function useCalculatePayrollMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CalculatePayrollInput) => calculatePayroll(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: payrollRunsKey }),
  });
}

export function useDeletePayrollRunMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payrollRunId: string) => deletePayrollRun(payrollRunId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: payrollRunsKey }),
  });
}

export function useApprovePayrollRunMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payrollRunId: string) => approvePayrollRun(payrollRunId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: payrollRunsKey });
      void queryClient.invalidateQueries({ queryKey: providentFundKey });
    },
  });
}

export function useMarkPayslipPaidMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payslipId: string) => markPayslipPaid(payslipId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: payrollRunsKey }),
  });
}

export function useProvidentFundSummaryQuery(enabled: boolean) {
  return useQuery({ queryKey: providentFundKey, queryFn: getProvidentFundSummary, enabled, retry: shouldRetry });
}

export function useLeaveTypesQuery(enabled: boolean) {
  return useQuery({ queryKey: leaveTypesKey, queryFn: getLeaveTypes, enabled, retry: shouldRetry });
}

export function useCreateLeaveTypeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; daysPerYear: number }) => createLeaveType(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: leaveTypesKey }),
  });
}

export function useDeleteLeaveTypeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leaveTypeId: string) => deleteLeaveType(leaveTypeId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: leaveTypesKey }),
  });
}

export function useLeaveRequestsQuery(enabled: boolean) {
  return useQuery({ queryKey: leaveRequestsKey, queryFn: getLeaveRequests, enabled, retry: shouldRetry });
}

export function useLeaveBalancesQuery(enabled: boolean) {
  return useQuery({ queryKey: leaveBalancesKey, queryFn: getLeaveBalances, enabled, retry: shouldRetry });
}

function useInvalidateLeave() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: leaveRequestsKey });
    void queryClient.invalidateQueries({ queryKey: leaveBalancesKey });
  };
}

export function useCreateLeaveRequestMutation() {
  const invalidate = useInvalidateLeave();
  return useMutation({
    mutationFn: (input: CreateLeaveRequestInput) => createLeaveRequest(input),
    onSuccess: invalidate,
  });
}

export function useApproveLeaveRequestMutation() {
  const invalidate = useInvalidateLeave();
  return useMutation({
    mutationFn: (leaveRequestId: string) => approveLeaveRequest(leaveRequestId),
    onSuccess: invalidate,
  });
}

export function useRejectLeaveRequestMutation() {
  const invalidate = useInvalidateLeave();
  return useMutation({
    mutationFn: ({ leaveRequestId, note }: { leaveRequestId: string; note?: string }) => rejectLeaveRequest(leaveRequestId, note),
    onSuccess: invalidate,
  });
}

export function useCancelLeaveRequestMutation() {
  const invalidate = useInvalidateLeave();
  return useMutation({
    mutationFn: (leaveRequestId: string) => cancelLeaveRequest(leaveRequestId),
    onSuccess: invalidate,
  });
}

export function useShiftsQuery(enabled: boolean) {
  return useQuery({ queryKey: shiftsKey, queryFn: getShifts, enabled, retry: shouldRetry });
}

export function useCreateShiftMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShiftInput) => createShift(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: shiftsKey }),
  });
}

export function useDeleteShiftMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shiftId: string) => deleteShift(shiftId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: shiftsKey }),
  });
}

export function useHolidaysQuery(enabled: boolean) {
  return useQuery({ queryKey: holidaysKey, queryFn: getHolidays, enabled, retry: shouldRetry });
}

export function useCreateHolidayMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHolidayInput) => createHoliday(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: holidaysKey }),
  });
}

export function useDeleteHolidayMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holidayId: string) => deleteHoliday(holidayId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: holidaysKey }),
  });
}

export function useExpenseClaimsQuery(enabled: boolean) {
  return useQuery({ queryKey: expenseClaimsKey, queryFn: getExpenseClaims, enabled, retry: shouldRetry });
}

export function useCreateExpenseClaimMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseClaimInput) => createExpenseClaim(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: expenseClaimsKey }),
  });
}

export function useApproveExpenseClaimMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseClaimId: string) => approveExpenseClaim(expenseClaimId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: expenseClaimsKey }),
  });
}

export function useRejectExpenseClaimMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expenseClaimId, note }: { expenseClaimId: string; note?: string }) => rejectExpenseClaim(expenseClaimId, note),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: expenseClaimsKey }),
  });
}

export function useMarkExpenseReimbursedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseClaimId: string) => markExpenseReimbursed(expenseClaimId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: expenseClaimsKey }),
  });
}

export function useDeleteExpenseClaimMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseClaimId: string) => deleteExpenseClaim(expenseClaimId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: expenseClaimsKey }),
  });
}

export function useEmployeeLoansQuery(enabled: boolean) {
  return useQuery({ queryKey: employeeLoansKey, queryFn: getEmployeeLoans, enabled, retry: shouldRetry });
}

export function useCreateEmployeeLoanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmployeeLoanInput) => createEmployeeLoan(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: employeeLoansKey }),
  });
}

export function useApproveEmployeeLoanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) => approveEmployeeLoan(loanId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: employeeLoansKey }),
  });
}

export function useRejectEmployeeLoanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) => rejectEmployeeLoan(loanId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: employeeLoansKey }),
  });
}

export function useDisburseEmployeeLoanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) => disburseEmployeeLoan(loanId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: employeeLoansKey }),
  });
}

export function useCreateLoanRepaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, input }: { loanId: string; input: CreateLoanRepaymentInput }) => createLoanRepayment(loanId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: employeeLoansKey }),
  });
}

export function useJobOpeningsQuery(enabled: boolean) {
  return useQuery({ queryKey: jobOpeningsKey, queryFn: getJobOpenings, enabled, retry: shouldRetry });
}

export function useCreateJobOpeningMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobOpeningInput) => createJobOpening(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: jobOpeningsKey }),
  });
}

export function useUpdateJobOpeningMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobOpeningId, input }: { jobOpeningId: string; input: UpdateJobOpeningInput }) => updateJobOpening(jobOpeningId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: jobOpeningsKey }),
  });
}

export function useCandidatesQuery(enabled: boolean) {
  return useQuery({ queryKey: candidatesKey, queryFn: getCandidates, enabled, retry: shouldRetry });
}

export function useCreateCandidateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCandidateInput) => createCandidate(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: candidatesKey }),
  });
}

export function useJobApplicationsQuery(enabled: boolean) {
  return useQuery({ queryKey: jobApplicationsKey, queryFn: getJobApplications, enabled, retry: shouldRetry });
}

export function useCreateJobApplicationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobApplicationInput) => createJobApplication(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: jobApplicationsKey }),
  });
}

export function useUpdateJobApplicationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobApplicationId, input }: { jobApplicationId: string; input: UpdateJobApplicationInput }) => updateJobApplication(jobApplicationId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: jobApplicationsKey }),
  });
}

export function useOnboardingChecklistQuery(employeeId: string | null) {
  return useQuery({
    queryKey: ["hr", "onboarding", employeeId] as const,
    queryFn: () => getOnboardingChecklist(employeeId as string),
    enabled: Boolean(employeeId),
    retry: shouldRetry,
  });
}

export function useUpdateOnboardingChecklistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, input }: { employeeId: string; input: UpdateOnboardingChecklistInput }) => updateOnboardingChecklist(employeeId, input),
    onSuccess: (_result, variables) => void queryClient.invalidateQueries({ queryKey: ["hr", "onboarding", variables.employeeId] }),
  });
}
