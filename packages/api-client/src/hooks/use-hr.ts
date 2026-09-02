import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HrAttendance, HrEmployee, HrExpenseClaim, HrJobOpening, HrLeaveRequest, HrLoan, HrLookup, HrPayrollRun, SaveEmployeeInput } from "@bizovix/types";
import { apiRequest } from "../http-client";

const key = ["hr"] as const;
const useHrQuery = <T,>(path: string) => useQuery({ queryKey: [...key, path], queryFn: () => apiRequest<T>(`/hr/${path}`) });
export const useHrEmployees = () => useHrQuery<HrEmployee[]>("employees");
export const useHrDepartments = () => useHrQuery<HrLookup[]>("departments");
export const useHrDesignations = () => useHrQuery<HrLookup[]>("designations");
export const useHrAttendance = () => useHrQuery<HrAttendance[]>("attendance");
export const useHrPayrollRuns = () => useHrQuery<HrPayrollRun[]>("payroll-runs");
export const useHrLeaveRequests = () => useHrQuery<HrLeaveRequest[]>("leave-requests");
export const useHrLeaveTypes = () => useHrQuery<Array<HrLookup & { daysPerYear: string }>>("leave-types");
export const useHrExpenseClaims = () => useHrQuery<HrExpenseClaim[]>("expense-claims");
export const useHrLoans = () => useHrQuery<HrLoan[]>("employee-loans");
export const useHrJobOpenings = () => useHrQuery<HrJobOpening[]>("job-openings");
export const useHrShifts = () => useHrQuery<Array<Record<string, unknown>>>("shifts");
export const useHrHolidays = () => useHrQuery<Array<Record<string, unknown>>>("holidays");
function useHrMutation<T = unknown>(path: string, method: "POST" | "PATCH" | "DELETE" = "POST") { const client = useQueryClient(); return useMutation<T, Error, unknown>({ mutationFn: (body) => apiRequest<T>(`/hr/${path}`, { method, body }), onSuccess: () => client.invalidateQueries({ queryKey: key }) }); }
export const useCreateEmployee = () => { const client = useQueryClient(); return useMutation({ mutationFn: (body: SaveEmployeeInput) => apiRequest<HrEmployee>("/hr/employees", { method: "POST", body }), onSuccess: () => client.invalidateQueries({ queryKey: key }) }); };
export const useCreateHrLookup = (path: "departments" | "designations" | "grades" | "business-units" | "divisions" | "locations" | "cost-centers") => useHrMutation<HrLookup>(path);
export const useCalculatePayroll = () => useHrMutation<HrPayrollRun>("payroll-runs/calculate");
export const useImportAttendance = () => useHrMutation<{ imported: number; skipped: number }>("attendance/import");
export const useCreateLeaveRequest = () => useHrMutation<HrLeaveRequest>("leave-requests");
export const useCreateExpenseClaim = () => useHrMutation<HrExpenseClaim>("expense-claims");
export const useCreateEmployeeLoan = () => useHrMutation<HrLoan>("employee-loans");
export const useCreateJobOpening = () => useHrMutation<HrJobOpening>("job-openings");
export function useHrAction(path: string, method: "POST" | "PATCH" | "DELETE" = "PATCH") { return useHrMutation(path, method); }
export function useHrCommand() { const client = useQueryClient(); return useMutation<unknown, Error, { path: string; method?: "POST" | "PATCH" | "DELETE"; body?: unknown }>({ mutationFn: ({ path, method = "POST", body }) => apiRequest(`/hr/${path}`, { method, body }), onSuccess: () => client.invalidateQueries({ queryKey: key }) }); }
