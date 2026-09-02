import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import {
  CalculatePayrollDto,
  CandidateDto,
  CreateEmployeeDto,
  DecisionDto,
  EmployeeChangeDto,
  EmployeeLoanDto,
  ExitProcessDto,
  ExpenseClaimDto,
  GradeDto,
  HolidayDto,
  ImportAttendanceDto,
  JobApplicationDto,
  JobOpeningDto,
  LeaveRequestDto,
  LeaveTypeDto,
  LoanRepaymentDto,
  NamedLookupDto,
  OnboardingDto,
  PayrollSettingsDto,
  ShiftDto,
  UpdateEmployeeDto,
  UpdateExitProcessDto,
  UpdateJobApplicationDto,
  UpdateJobOpeningDto,
} from "./dto/hr.dto";
import { HrService } from "./hr.service";

@Controller("hr")
export class HrController {
  constructor(private readonly service: HrService) {}

  @Get("payroll-settings") @RequirePermissions("hr.employee.view")
  payrollSettings(@CurrentUser() u: AuthUser) { return this.service.getPayrollSettings(u.organizationId); }
  @Patch("payroll-settings") @RequirePermissions("hr.payroll.manage")
  savePayrollSettings(@Body() d: PayrollSettingsDto, @CurrentUser() u: AuthUser) { return this.service.updatePayrollSettings(u.organizationId, u.id, d); }

  @Get("departments") @RequirePermissions("hr.employee.view")
  departments(@CurrentUser() u: AuthUser) { return this.service.listDepartments(u.organizationId); }
  @Post("departments") @RequirePermissions("hr.employee.create")
  createDepartment(@Body() d: NamedLookupDto, @CurrentUser() u: AuthUser) { return this.service.createDepartment(u.organizationId, u.id, d); }
  @Delete("departments/:id") @RequirePermissions("hr.employee.delete")
  deleteDepartment(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteDepartment(u.organizationId, u.id, id); }

  @Get("designations") @RequirePermissions("hr.employee.view")
  designations(@CurrentUser() u: AuthUser) { return this.service.listDesignations(u.organizationId); }
  @Post("designations") @RequirePermissions("hr.employee.create")
  createDesignation(@Body() d: NamedLookupDto, @CurrentUser() u: AuthUser) { return this.service.createDesignation(u.organizationId, u.id, d); }
  @Delete("designations/:id") @RequirePermissions("hr.employee.delete")
  deleteDesignation(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteDesignation(u.organizationId, u.id, id); }

  @Get("grades") @RequirePermissions("hr.employee.view")
  grades(@CurrentUser() u: AuthUser) { return this.service.listGrades(u.organizationId); }
  @Post("grades") @RequirePermissions("hr.employee.create")
  createGrade(@Body() d: GradeDto, @CurrentUser() u: AuthUser) { return this.service.createGrade(u.organizationId, u.id, d); }
  @Delete("grades/:id") @RequirePermissions("hr.employee.delete")
  deleteGrade(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteGrade(u.organizationId, u.id, id); }

  @Get("business-units") @RequirePermissions("hr.employee.view")
  businessUnits(@CurrentUser() u: AuthUser) { return this.service.listBusinessUnits(u.organizationId); }
  @Post("business-units") @RequirePermissions("hr.employee.create")
  createBusinessUnit(@Body() d: NamedLookupDto, @CurrentUser() u: AuthUser) { return this.service.createBusinessUnit(u.organizationId, u.id, d); }
  @Delete("business-units/:id") @RequirePermissions("hr.employee.delete")
  deleteBusinessUnit(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteBusinessUnit(u.organizationId, u.id, id); }

  @Get("divisions") @RequirePermissions("hr.employee.view")
  divisions(@CurrentUser() u: AuthUser) { return this.service.listDivisions(u.organizationId); }
  @Post("divisions") @RequirePermissions("hr.employee.create")
  createDivision(@Body() d: NamedLookupDto, @CurrentUser() u: AuthUser) { return this.service.createDivision(u.organizationId, u.id, d); }
  @Delete("divisions/:id") @RequirePermissions("hr.employee.delete")
  deleteDivision(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteDivision(u.organizationId, u.id, id); }

  @Get("locations") @RequirePermissions("hr.employee.view")
  locations(@CurrentUser() u: AuthUser) { return this.service.listLocations(u.organizationId); }
  @Post("locations") @RequirePermissions("hr.employee.create")
  createLocation(@Body() d: NamedLookupDto, @CurrentUser() u: AuthUser) { return this.service.createLocation(u.organizationId, u.id, d); }
  @Delete("locations/:id") @RequirePermissions("hr.employee.delete")
  deleteLocation(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteLocation(u.organizationId, u.id, id); }

  @Get("cost-centers") @RequirePermissions("hr.employee.view")
  costCenters(@CurrentUser() u: AuthUser) { return this.service.listCostCenters(u.organizationId); }
  @Post("cost-centers") @RequirePermissions("hr.employee.create")
  createCostCenter(@Body() d: NamedLookupDto, @CurrentUser() u: AuthUser) { return this.service.createCostCenter(u.organizationId, u.id, d); }
  @Delete("cost-centers/:id") @RequirePermissions("hr.employee.delete")
  deleteCostCenter(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteCostCenter(u.organizationId, u.id, id); }

  @Get("employees") @RequirePermissions("hr.employee.view")
  employees(@CurrentUser() u: AuthUser) { return this.service.listEmployees(u.organizationId); }
  @Post("employees") @RequirePermissions("hr.employee.create")
  createEmployee(@Body() d: CreateEmployeeDto, @CurrentUser() u: AuthUser) { return this.service.createEmployee(u.organizationId, u.id, d); }
  @Patch("employees/:id") @RequirePermissions("hr.employee.update")
  updateEmployee(@Param("id") id: string, @Body() d: UpdateEmployeeDto, @CurrentUser() u: AuthUser) { return this.service.updateEmployee(u.organizationId, u.id, id, d); }
  @Delete("employees/:id") @RequirePermissions("hr.employee.delete")
  deleteEmployee(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteEmployee(u.organizationId, u.id, id); }
  @Get("employees/:id/changes") @RequirePermissions("hr.employee.view")
  employeeChanges(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.listEmployeeChanges(u.organizationId, id); }
  @Post("employee-changes") @RequirePermissions("hr.employee.update")
  createEmployeeChange(@Body() d: EmployeeChangeDto, @CurrentUser() u: AuthUser) { return this.service.createEmployeeChange(u.organizationId, u.id, d); }
  @Get("employees/:id/exit-process") @RequirePermissions("hr.employee.view")
  exitProcess(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.getExitProcess(u.organizationId, id); }
  @Post("exit-processes") @RequirePermissions("hr.employee.update")
  createExitProcess(@Body() d: ExitProcessDto, @CurrentUser() u: AuthUser) { return this.service.createExitProcess(u.organizationId, u.id, d); }
  @Patch("exit-processes/:id") @RequirePermissions("hr.employee.update")
  updateExitProcess(@Param("id") id: string, @Body() d: UpdateExitProcessDto, @CurrentUser() u: AuthUser) { return this.service.updateExitProcess(u.organizationId, u.id, id, d); }
  @Get("employees/:id/onboarding") @RequirePermissions("hr.employee.view")
  onboarding(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.getOnboardingChecklist(u.organizationId, id); }
  @Patch("employees/:id/onboarding") @RequirePermissions("hr.employee.update")
  updateOnboarding(@Param("id") id: string, @Body() d: OnboardingDto, @CurrentUser() u: AuthUser) { return this.service.updateOnboardingChecklist(u.organizationId, u.id, id, d); }

  @Get("expense-claims") @RequirePermissions("hr.expense.view")
  claims(@CurrentUser() u: AuthUser) { return this.service.listExpenseClaims(u.organizationId); }
  @Post("expense-claims") @RequirePermissions("hr.expense.manage")
  createClaim(@Body() d: ExpenseClaimDto, @CurrentUser() u: AuthUser) { return this.service.createExpenseClaim(u.organizationId, u.id, d); }
  @Patch("expense-claims/:id/approve") @RequirePermissions("hr.expense.approve")
  approveClaim(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.approveExpenseClaim(u.organizationId, u.id, id); }
  @Patch("expense-claims/:id/reject") @RequirePermissions("hr.expense.approve")
  rejectClaim(@Param("id") id: string, @Body() d: DecisionDto, @CurrentUser() u: AuthUser) { return this.service.rejectExpenseClaim(u.organizationId, u.id, id, d); }
  @Patch("expense-claims/:id/mark-reimbursed") @RequirePermissions("hr.expense.approve")
  reimburseClaim(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.markExpenseReimbursed(u.organizationId, u.id, id); }
  @Delete("expense-claims/:id") @RequirePermissions("hr.expense.manage")
  deleteClaim(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteExpenseClaim(u.organizationId, u.id, id); }

  @Get("employee-loans") @RequirePermissions("hr.loan.view")
  loans(@CurrentUser() u: AuthUser) { return this.service.listEmployeeLoans(u.organizationId); }
  @Post("employee-loans") @RequirePermissions("hr.loan.manage")
  createLoan(@Body() d: EmployeeLoanDto, @CurrentUser() u: AuthUser) { return this.service.createEmployeeLoan(u.organizationId, u.id, d); }
  @Patch("employee-loans/:id/approve") @RequirePermissions("hr.loan.approve")
  approveLoan(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.approveEmployeeLoan(u.organizationId, u.id, id); }
  @Patch("employee-loans/:id/reject") @RequirePermissions("hr.loan.approve")
  rejectLoan(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.rejectEmployeeLoan(u.organizationId, u.id, id); }
  @Patch("employee-loans/:id/disburse") @RequirePermissions("hr.loan.approve")
  disburseLoan(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.disburseEmployeeLoan(u.organizationId, u.id, id); }
  @Post("employee-loans/:id/repayments") @RequirePermissions("hr.loan.manage")
  repayLoan(@Param("id") id: string, @Body() d: LoanRepaymentDto, @CurrentUser() u: AuthUser) { return this.service.createLoanRepayment(u.organizationId, u.id, id, d); }

  @Get("job-openings") @RequirePermissions("hr.recruitment.view")
  jobs(@CurrentUser() u: AuthUser) { return this.service.listJobOpenings(u.organizationId); }
  @Post("job-openings") @RequirePermissions("hr.recruitment.manage")
  createJob(@Body() d: JobOpeningDto, @CurrentUser() u: AuthUser) { return this.service.createJobOpening(u.organizationId, u.id, d); }
  @Patch("job-openings/:id") @RequirePermissions("hr.recruitment.manage")
  updateJob(@Param("id") id: string, @Body() d: UpdateJobOpeningDto, @CurrentUser() u: AuthUser) { return this.service.updateJobOpening(u.organizationId, u.id, id, d); }
  @Get("candidates") @RequirePermissions("hr.recruitment.view")
  candidates(@CurrentUser() u: AuthUser) { return this.service.listCandidates(u.organizationId); }
  @Post("candidates") @RequirePermissions("hr.recruitment.manage")
  createCandidate(@Body() d: CandidateDto, @CurrentUser() u: AuthUser) { return this.service.createCandidate(u.organizationId, u.id, d); }
  @Get("job-applications") @RequirePermissions("hr.recruitment.view")
  applications(@CurrentUser() u: AuthUser) { return this.service.listJobApplications(u.organizationId); }
  @Post("job-applications") @RequirePermissions("hr.recruitment.manage")
  createApplication(@Body() d: JobApplicationDto, @CurrentUser() u: AuthUser) { return this.service.createJobApplication(u.organizationId, u.id, d); }
  @Patch("job-applications/:id") @RequirePermissions("hr.recruitment.manage")
  updateApplication(@Param("id") id: string, @Body() d: UpdateJobApplicationDto, @CurrentUser() u: AuthUser) { return this.service.updateJobApplication(u.organizationId, u.id, id, d); }

  @Get("attendance") @RequirePermissions("hr.employee.view")
  attendance(@CurrentUser() u: AuthUser) { return this.service.listAttendance(u.organizationId); }
  @Post("attendance/import") @RequirePermissions("hr.employee.update")
  importAttendance(@Body() d: ImportAttendanceDto, @CurrentUser() u: AuthUser) { return this.service.importAttendance(u.organizationId, u.id, d); }

  @Get("payroll-runs") @RequirePermissions("hr.employee.view")
  payrollRuns(@CurrentUser() u: AuthUser) { return this.service.listPayrollRuns(u.organizationId); }
  @Post("payroll-runs/calculate") @RequirePermissions("hr.payroll.manage")
  calculatePayroll(@Body() d: CalculatePayrollDto, @CurrentUser() u: AuthUser) { return this.service.calculatePayroll(u.organizationId, u.id, d); }
  @Delete("payroll-runs/:id") @RequirePermissions("hr.payroll.manage")
  deletePayroll(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deletePayrollRun(u.organizationId, u.id, id); }
  @Patch("payroll-runs/:id/approve") @RequirePermissions("hr.payroll.approve")
  approvePayroll(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.approvePayrollRun(u.organizationId, u.id, id); }
  @Patch("payslips/:id/mark-paid") @RequirePermissions("hr.payroll.approve")
  markPaid(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.markPayslipPaid(u.organizationId, u.id, id); }
  @Get("provident-fund") @RequirePermissions("hr.employee.view")
  providentFund(@CurrentUser() u: AuthUser) { return this.service.getProvidentFundSummary(u.organizationId); }

  @Get("leave-types") @RequirePermissions("hr.leave.view")
  leaveTypes(@CurrentUser() u: AuthUser) { return this.service.listLeaveTypes(u.organizationId); }
  @Post("leave-types") @RequirePermissions("hr.leave.manage")
  createLeaveType(@Body() d: LeaveTypeDto, @CurrentUser() u: AuthUser) { return this.service.createLeaveType(u.organizationId, u.id, d); }
  @Delete("leave-types/:id") @RequirePermissions("hr.leave.manage")
  deleteLeaveType(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteLeaveType(u.organizationId, u.id, id); }
  @Get("leave-requests") @RequirePermissions("hr.leave.view")
  leaveRequests(@CurrentUser() u: AuthUser) { return this.service.listLeaveRequests(u.organizationId); }
  @Get("leave-balances") @RequirePermissions("hr.leave.view")
  leaveBalances(@CurrentUser() u: AuthUser) { return this.service.listLeaveBalances(u.organizationId); }
  @Post("leave-requests") @RequirePermissions("hr.leave.manage")
  createLeave(@Body() d: LeaveRequestDto, @CurrentUser() u: AuthUser) { return this.service.createLeaveRequest(u.organizationId, u.id, d); }
  @Patch("leave-requests/:id/approve") @RequirePermissions("hr.leave.approve")
  approveLeave(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.approveLeaveRequest(u.organizationId, u.id, id); }
  @Patch("leave-requests/:id/reject") @RequirePermissions("hr.leave.approve")
  rejectLeave(@Param("id") id: string, @Body() d: DecisionDto, @CurrentUser() u: AuthUser) { return this.service.rejectLeaveRequest(u.organizationId, u.id, id, d); }
  @Patch("leave-requests/:id/cancel") @RequirePermissions("hr.leave.manage")
  cancelLeave(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.cancelLeaveRequest(u.organizationId, u.id, id); }

  @Get("shifts") @RequirePermissions("hr.employee.view")
  shifts(@CurrentUser() u: AuthUser) { return this.service.listShifts(u.organizationId); }
  @Post("shifts") @RequirePermissions("hr.employee.create")
  createShift(@Body() d: ShiftDto, @CurrentUser() u: AuthUser) { return this.service.createShift(u.organizationId, u.id, d); }
  @Delete("shifts/:id") @RequirePermissions("hr.employee.delete")
  deleteShift(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteShift(u.organizationId, u.id, id); }
  @Get("holidays") @RequirePermissions("hr.employee.view")
  holidays(@CurrentUser() u: AuthUser) { return this.service.listHolidays(u.organizationId); }
  @Post("holidays") @RequirePermissions("hr.employee.create")
  createHoliday(@Body() d: HolidayDto, @CurrentUser() u: AuthUser) { return this.service.createHoliday(u.organizationId, u.id, d); }
  @Delete("holidays/:id") @RequirePermissions("hr.employee.delete")
  deleteHoliday(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteHoliday(u.organizationId, u.id, id); }
}
