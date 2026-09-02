import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { CalculatePayrollDto } from "./dto/calculate-payroll.dto.js";
import { CreateBusinessUnitDto } from "./dto/create-business-unit.dto.js";
import { CreateCandidateDto } from "./dto/create-candidate.dto.js";
import { CreateCostCenterDto } from "./dto/create-cost-center.dto.js";
import { CreateDepartmentDto } from "./dto/create-department.dto.js";
import { CreateDesignationDto } from "./dto/create-designation.dto.js";
import { CreateDivisionDto } from "./dto/create-division.dto.js";
import { CreateEmployeeChangeDto } from "./dto/create-employee-change.dto.js";
import { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import { CreateEmployeeLoanDto } from "./dto/create-employee-loan.dto.js";
import { CreateExitProcessDto } from "./dto/create-exit-process.dto.js";
import { CreateExpenseClaimDto } from "./dto/create-expense-claim.dto.js";
import { CreateGradeDto } from "./dto/create-grade.dto.js";
import { CreateHolidayDto } from "./dto/create-holiday.dto.js";
import { CreateJobApplicationDto } from "./dto/create-job-application.dto.js";
import { CreateJobOpeningDto } from "./dto/create-job-opening.dto.js";
import { CreateLeaveRequestDto } from "./dto/create-leave-request.dto.js";
import { CreateLeaveTypeDto } from "./dto/create-leave-type.dto.js";
import { CreateLoanRepaymentDto } from "./dto/create-loan-repayment.dto.js";
import { CreateLocationDto } from "./dto/create-location.dto.js";
import { CreateShiftDto } from "./dto/create-shift.dto.js";
import { DecideExpenseClaimDto } from "./dto/decide-expense-claim.dto.js";
import { DecideLeaveRequestDto } from "./dto/decide-leave-request.dto.js";
import { ImportAttendanceDto } from "./dto/import-attendance.dto.js";
import { UpdateEmployeeDto } from "./dto/update-employee.dto.js";
import { UpdateExitProcessDto } from "./dto/update-exit-process.dto.js";
import { UpdateJobApplicationDto } from "./dto/update-job-application.dto.js";
import { UpdateJobOpeningDto } from "./dto/update-job-opening.dto.js";
import { UpdateOnboardingChecklistDto } from "./dto/update-onboarding-checklist.dto.js";
import { UpdatePayrollSettingsDto } from "./dto/update-payroll-settings.dto.js";
import { HrService } from "./hr.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("hr")
export class HrController {
  constructor(@Inject(HrService) private readonly hrService: HrService) {}

  @Get("payroll-settings")
  @RequirePermission("hr.employee.view")
  async getPayrollSettings(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.getPayrollSettings(currentUser);
  }

  @Patch("payroll-settings")
  @RequirePermission("hr.payroll.manage")
  async updatePayrollSettings(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: UpdatePayrollSettingsDto) {
    return this.hrService.updatePayrollSettings(currentUser, dto);
  }

  @Get("departments")
  @RequirePermission("hr.employee.view")
  async listDepartments(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listDepartments(currentUser);
  }

  @Post("departments")
  @RequirePermission("hr.employee.create")
  async createDepartment(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateDepartmentDto) {
    return this.hrService.createDepartment(currentUser, dto);
  }

  @Delete("departments/:id")
  @RequirePermission("hr.employee.delete")
  async deleteDepartment(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteDepartment(currentUser, id);
  }

  @Get("designations")
  @RequirePermission("hr.employee.view")
  async listDesignations(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listDesignations(currentUser);
  }

  @Post("designations")
  @RequirePermission("hr.employee.create")
  async createDesignation(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateDesignationDto) {
    return this.hrService.createDesignation(currentUser, dto);
  }

  @Delete("designations/:id")
  @RequirePermission("hr.employee.delete")
  async deleteDesignation(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteDesignation(currentUser, id);
  }

  @Get("grades")
  @RequirePermission("hr.employee.view")
  async listGrades(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listGrades(currentUser);
  }

  @Post("grades")
  @RequirePermission("hr.employee.create")
  async createGrade(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateGradeDto) {
    return this.hrService.createGrade(currentUser, dto);
  }

  @Delete("grades/:id")
  @RequirePermission("hr.employee.delete")
  async deleteGrade(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteGrade(currentUser, id);
  }

  @Get("business-units")
  @RequirePermission("hr.employee.view")
  async listBusinessUnits(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listBusinessUnits(currentUser);
  }

  @Post("business-units")
  @RequirePermission("hr.employee.create")
  async createBusinessUnit(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateBusinessUnitDto) {
    return this.hrService.createBusinessUnit(currentUser, dto);
  }

  @Delete("business-units/:id")
  @RequirePermission("hr.employee.delete")
  async deleteBusinessUnit(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteBusinessUnit(currentUser, id);
  }

  @Get("divisions")
  @RequirePermission("hr.employee.view")
  async listDivisions(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listDivisions(currentUser);
  }

  @Post("divisions")
  @RequirePermission("hr.employee.create")
  async createDivision(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateDivisionDto) {
    return this.hrService.createDivision(currentUser, dto);
  }

  @Delete("divisions/:id")
  @RequirePermission("hr.employee.delete")
  async deleteDivision(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteDivision(currentUser, id);
  }

  @Get("locations")
  @RequirePermission("hr.employee.view")
  async listLocations(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listLocations(currentUser);
  }

  @Post("locations")
  @RequirePermission("hr.employee.create")
  async createLocation(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateLocationDto) {
    return this.hrService.createLocation(currentUser, dto);
  }

  @Delete("locations/:id")
  @RequirePermission("hr.employee.delete")
  async deleteLocation(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteLocation(currentUser, id);
  }

  @Get("cost-centers")
  @RequirePermission("hr.employee.view")
  async listCostCenters(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listCostCenters(currentUser);
  }

  @Post("cost-centers")
  @RequirePermission("hr.employee.create")
  async createCostCenter(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateCostCenterDto) {
    return this.hrService.createCostCenter(currentUser, dto);
  }

  @Delete("cost-centers/:id")
  @RequirePermission("hr.employee.delete")
  async deleteCostCenter(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteCostCenter(currentUser, id);
  }

  @Get("employees")
  @RequirePermission("hr.employee.view")
  async listEmployees(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listEmployees(currentUser);
  }

  @Post("employees")
  @RequirePermission("hr.employee.create")
  async createEmployee(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateEmployeeDto) {
    return this.hrService.createEmployee(currentUser, dto);
  }

  @Patch("employees/:id")
  @RequirePermission("hr.employee.update")
  async updateEmployee(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.hrService.updateEmployee(currentUser, id, dto);
  }

  @Delete("employees/:id")
  @RequirePermission("hr.employee.delete")
  async deleteEmployee(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteEmployee(currentUser, id);
  }

  @Get("employees/:id/changes")
  @RequirePermission("hr.employee.view")
  async listEmployeeChanges(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.listEmployeeChanges(currentUser, id);
  }

  @Post("employee-changes")
  @RequirePermission("hr.employee.update")
  async createEmployeeChange(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateEmployeeChangeDto) {
    return this.hrService.createEmployeeChange(currentUser, dto);
  }

  @Get("employees/:id/exit-process")
  @RequirePermission("hr.employee.view")
  async getExitProcess(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.getExitProcess(currentUser, id);
  }

  @Post("exit-processes")
  @RequirePermission("hr.employee.update")
  async createExitProcess(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateExitProcessDto) {
    return this.hrService.createExitProcess(currentUser, dto);
  }

  @Patch("exit-processes/:id")
  @RequirePermission("hr.employee.update")
  async updateExitProcess(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: UpdateExitProcessDto) {
    return this.hrService.updateExitProcess(currentUser, id, dto);
  }

  @Get("expense-claims")
  @RequirePermission("hr.expense.view")
  async listExpenseClaims(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listExpenseClaims(currentUser);
  }

  @Post("expense-claims")
  @RequirePermission("hr.expense.manage")
  async createExpenseClaim(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateExpenseClaimDto) {
    return this.hrService.createExpenseClaim(currentUser, dto);
  }

  @Patch("expense-claims/:id/approve")
  @RequirePermission("hr.expense.approve")
  async approveExpenseClaim(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.approveExpenseClaim(currentUser, id);
  }

  @Patch("expense-claims/:id/reject")
  @RequirePermission("hr.expense.approve")
  async rejectExpenseClaim(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: DecideExpenseClaimDto) {
    return this.hrService.rejectExpenseClaim(currentUser, id, dto);
  }

  @Patch("expense-claims/:id/mark-reimbursed")
  @RequirePermission("hr.expense.approve")
  async markExpenseReimbursed(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.markExpenseReimbursed(currentUser, id);
  }

  @Delete("expense-claims/:id")
  @RequirePermission("hr.expense.manage")
  async deleteExpenseClaim(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteExpenseClaim(currentUser, id);
  }

  @Get("employee-loans")
  @RequirePermission("hr.loan.view")
  async listEmployeeLoans(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listEmployeeLoans(currentUser);
  }

  @Post("employee-loans")
  @RequirePermission("hr.loan.manage")
  async createEmployeeLoan(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateEmployeeLoanDto) {
    return this.hrService.createEmployeeLoan(currentUser, dto);
  }

  @Patch("employee-loans/:id/approve")
  @RequirePermission("hr.loan.approve")
  async approveEmployeeLoan(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.approveEmployeeLoan(currentUser, id);
  }

  @Patch("employee-loans/:id/reject")
  @RequirePermission("hr.loan.approve")
  async rejectEmployeeLoan(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.rejectEmployeeLoan(currentUser, id);
  }

  @Patch("employee-loans/:id/disburse")
  @RequirePermission("hr.loan.approve")
  async disburseEmployeeLoan(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.disburseEmployeeLoan(currentUser, id);
  }

  @Post("employee-loans/:id/repayments")
  @RequirePermission("hr.loan.manage")
  async createLoanRepayment(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: CreateLoanRepaymentDto) {
    return this.hrService.createLoanRepayment(currentUser, id, dto);
  }

  @Get("job-openings")
  @RequirePermission("hr.recruitment.view")
  async listJobOpenings(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listJobOpenings(currentUser);
  }

  @Post("job-openings")
  @RequirePermission("hr.recruitment.manage")
  async createJobOpening(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateJobOpeningDto) {
    return this.hrService.createJobOpening(currentUser, dto);
  }

  @Patch("job-openings/:id")
  @RequirePermission("hr.recruitment.manage")
  async updateJobOpening(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: UpdateJobOpeningDto) {
    return this.hrService.updateJobOpening(currentUser, id, dto);
  }

  @Get("candidates")
  @RequirePermission("hr.recruitment.view")
  async listCandidates(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listCandidates(currentUser);
  }

  @Post("candidates")
  @RequirePermission("hr.recruitment.manage")
  async createCandidate(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateCandidateDto) {
    return this.hrService.createCandidate(currentUser, dto);
  }

  @Get("job-applications")
  @RequirePermission("hr.recruitment.view")
  async listJobApplications(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listJobApplications(currentUser);
  }

  @Post("job-applications")
  @RequirePermission("hr.recruitment.manage")
  async createJobApplication(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateJobApplicationDto) {
    return this.hrService.createJobApplication(currentUser, dto);
  }

  @Patch("job-applications/:id")
  @RequirePermission("hr.recruitment.manage")
  async updateJobApplication(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: UpdateJobApplicationDto) {
    return this.hrService.updateJobApplication(currentUser, id, dto);
  }

  @Get("employees/:id/onboarding")
  @RequirePermission("hr.employee.view")
  async getOnboardingChecklist(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.getOnboardingChecklist(currentUser, id);
  }

  @Patch("employees/:id/onboarding")
  @RequirePermission("hr.employee.update")
  async updateOnboardingChecklist(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: UpdateOnboardingChecklistDto) {
    return this.hrService.updateOnboardingChecklist(currentUser, id, dto);
  }

  @Get("attendance")
  @RequirePermission("hr.employee.view")
  async listAttendance(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listAttendance(currentUser);
  }

  @Post("attendance/import")
  @RequirePermission("hr.employee.update")
  async importAttendance(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: ImportAttendanceDto) {
    return this.hrService.importAttendance(currentUser, dto);
  }

  @Get("payroll-runs")
  @RequirePermission("hr.employee.view")
  async listPayrollRuns(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listPayrollRuns(currentUser);
  }

  @Post("payroll-runs/calculate")
  @RequirePermission("hr.payroll.manage")
  async calculatePayroll(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CalculatePayrollDto) {
    return this.hrService.calculatePayroll(currentUser, dto);
  }

  @Delete("payroll-runs/:id")
  @RequirePermission("hr.payroll.manage")
  async deletePayrollRun(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deletePayrollRun(currentUser, id);
  }

  @Patch("payroll-runs/:id/approve")
  @RequirePermission("hr.payroll.approve")
  async approvePayrollRun(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.approvePayrollRun(currentUser, id);
  }

  @Patch("payslips/:id/mark-paid")
  @RequirePermission("hr.payroll.approve")
  async markPayslipPaid(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.markPayslipPaid(currentUser, id);
  }

  @Get("provident-fund")
  @RequirePermission("hr.employee.view")
  async getProvidentFundSummary(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.getProvidentFundSummary(currentUser);
  }

  @Get("leave-types")
  @RequirePermission("hr.leave.view")
  async listLeaveTypes(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listLeaveTypes(currentUser);
  }

  @Post("leave-types")
  @RequirePermission("hr.leave.manage")
  async createLeaveType(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateLeaveTypeDto) {
    return this.hrService.createLeaveType(currentUser, dto);
  }

  @Delete("leave-types/:id")
  @RequirePermission("hr.leave.manage")
  async deleteLeaveType(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteLeaveType(currentUser, id);
  }

  @Get("leave-requests")
  @RequirePermission("hr.leave.view")
  async listLeaveRequests(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listLeaveRequests(currentUser);
  }

  @Get("leave-balances")
  @RequirePermission("hr.leave.view")
  async listLeaveBalances(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listLeaveBalances(currentUser);
  }

  @Post("leave-requests")
  @RequirePermission("hr.leave.manage")
  async createLeaveRequest(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateLeaveRequestDto) {
    return this.hrService.createLeaveRequest(currentUser, dto);
  }

  @Patch("leave-requests/:id/approve")
  @RequirePermission("hr.leave.approve")
  async approveLeaveRequest(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.approveLeaveRequest(currentUser, id);
  }

  @Patch("leave-requests/:id/reject")
  @RequirePermission("hr.leave.approve")
  async rejectLeaveRequest(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: DecideLeaveRequestDto) {
    return this.hrService.rejectLeaveRequest(currentUser, id, dto);
  }

  @Patch("leave-requests/:id/cancel")
  @RequirePermission("hr.leave.manage")
  async cancelLeaveRequest(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.cancelLeaveRequest(currentUser, id);
  }

  @Get("shifts")
  @RequirePermission("hr.employee.view")
  async listShifts(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listShifts(currentUser);
  }

  @Post("shifts")
  @RequirePermission("hr.employee.create")
  async createShift(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateShiftDto) {
    return this.hrService.createShift(currentUser, dto);
  }

  @Delete("shifts/:id")
  @RequirePermission("hr.employee.delete")
  async deleteShift(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteShift(currentUser, id);
  }

  @Get("holidays")
  @RequirePermission("hr.employee.view")
  async listHolidays(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.hrService.listHolidays(currentUser);
  }

  @Post("holidays")
  @RequirePermission("hr.employee.create")
  async createHoliday(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateHolidayDto) {
    return this.hrService.createHoliday(currentUser, dto);
  }

  @Delete("holidays/:id")
  @RequirePermission("hr.employee.delete")
  async deleteHoliday(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.hrService.deleteHoliday(currentUser, id);
  }
}
