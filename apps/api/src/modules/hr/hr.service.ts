import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ApplicationStage,
  EmployeeChangeType,
  EmployeeLoanStatus,
  EmployeeLoanType,
  EmployeeStatus,
  EmploymentType,
  ExitProcessStatus,
  Gender,
  HrExpenseCategory,
  JobOpeningStatus,
  Prisma,
  SalaryPaymentMethod,
  SeparationType,
} from "@bizovix/database";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { NumberingService } from "../settings-numbering/numbering.service";
import { calculateAttendanceDuration, calculatePayrollAmounts, normalizeSalaryComponents } from "./hr.calculations";
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

const D = (value: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(value ?? 0);
const employeeInclude = {
  department: true,
  designation: true,
  grade: true,
  businessUnit: true,
  division: true,
  location: true,
  costCenter: true,
  reportingManager: { select: { id: true, employeeCode: true, name: true } },
};
const employeeBrief = { id: true, employeeCode: true, name: true };

function clockMinutes(value?: string | null) {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService, private readonly numbering: NumberingService) {}

  private async log(org: string, userId: string, action: string, entityType: string, entityId?: string, value?: unknown) {
    await this.audit.record({ organizationId: org, userId, action, entityType, entityId, newValue: value });
  }

  private async employee(org: string, id: string) {
    const row = await this.prisma.employee.findFirst({ where: { id, organizationId: org }, include: employeeInclude });
    if (!row) throw new NotFoundException("Employee not found");
    return row;
  }

  private async assertEmployeeRefs(org: string, dto: Pick<CreateEmployeeDto | UpdateEmployeeDto, "departmentId" | "designationId" | "gradeId" | "businessUnitId" | "divisionId" | "locationId" | "costCenterId" | "reportingManagerId">, ownId?: string) {
    const checks: Array<[string, string | null | undefined, Promise<{ id: string } | null>]> = [
      ["Department", dto.departmentId, dto.departmentId ? this.prisma.department.findFirst({ where: { id: dto.departmentId, organizationId: org }, select: { id: true } }) : Promise.resolve(null)],
      ["Designation", dto.designationId, dto.designationId ? this.prisma.designation.findFirst({ where: { id: dto.designationId, organizationId: org }, select: { id: true } }) : Promise.resolve(null)],
      ["Grade", dto.gradeId, dto.gradeId ? this.prisma.grade.findFirst({ where: { id: dto.gradeId, organizationId: org }, select: { id: true } }) : Promise.resolve(null)],
      ["Business unit", dto.businessUnitId, dto.businessUnitId ? this.prisma.businessUnit.findFirst({ where: { id: dto.businessUnitId, organizationId: org }, select: { id: true } }) : Promise.resolve(null)],
      ["Division", dto.divisionId, dto.divisionId ? this.prisma.hrDivision.findFirst({ where: { id: dto.divisionId, organizationId: org }, select: { id: true } }) : Promise.resolve(null)],
      ["Location", dto.locationId, dto.locationId ? this.prisma.hrLocation.findFirst({ where: { id: dto.locationId, organizationId: org }, select: { id: true } }) : Promise.resolve(null)],
      ["Cost center", dto.costCenterId, dto.costCenterId ? this.prisma.costCenter.findFirst({ where: { id: dto.costCenterId, organizationId: org }, select: { id: true } }) : Promise.resolve(null)],
      ["Reporting manager", dto.reportingManagerId, dto.reportingManagerId ? this.prisma.employee.findFirst({ where: { id: dto.reportingManagerId, organizationId: org }, select: { id: true } }) : Promise.resolve(null)],
    ];
    for (const [label, id, promise] of checks) if (id && !(await promise)) throw new BadRequestException(`${label} not found in this organization`);
    if (ownId && dto.reportingManagerId === ownId) throw new BadRequestException("An employee cannot report to themselves");
  }

  listDepartments(org: string) { return this.prisma.department.findMany({ where: { organizationId: org }, orderBy: { name: "asc" } }); }
  listDesignations(org: string) { return this.prisma.designation.findMany({ where: { organizationId: org }, orderBy: { name: "asc" } }); }
  listGrades(org: string) { return this.prisma.grade.findMany({ where: { organizationId: org }, orderBy: [{ level: "asc" }, { name: "asc" }] }); }
  listBusinessUnits(org: string) { return this.prisma.businessUnit.findMany({ where: { organizationId: org }, orderBy: { name: "asc" } }); }
  listDivisions(org: string) { return this.prisma.hrDivision.findMany({ where: { organizationId: org }, orderBy: { name: "asc" } }); }
  listLocations(org: string) { return this.prisma.hrLocation.findMany({ where: { organizationId: org }, orderBy: { name: "asc" } }); }
  listCostCenters(org: string) { return this.prisma.costCenter.findMany({ where: { organizationId: org }, orderBy: { name: "asc" } }); }

  private async createNamed(org: string, userId: string, kind: "department" | "designation" | "businessUnit" | "hrDivision" | "hrLocation" | "costCenter", dto: NamedLookupDto) {
    const name = dto.name.trim();
    const delegate = this.prisma[kind] as unknown as { findFirst(args: object): Promise<{ id: string; name: string } | null>; create(args: object): Promise<{ id: string; name: string }> };
    const existing = await delegate.findFirst({ where: { organizationId: org, name: { equals: name, mode: "insensitive" } } });
    if (existing) return existing;
    const row = await delegate.create({ data: { organizationId: org, name } });
    await this.log(org, userId, "HR_LOOKUP_CREATED", kind, row.id, row);
    return row;
  }
  createDepartment(org: string, userId: string, dto: NamedLookupDto) { return this.createNamed(org, userId, "department", dto); }
  createDesignation(org: string, userId: string, dto: NamedLookupDto) { return this.createNamed(org, userId, "designation", dto); }
  createBusinessUnit(org: string, userId: string, dto: NamedLookupDto) { return this.createNamed(org, userId, "businessUnit", dto); }
  createDivision(org: string, userId: string, dto: NamedLookupDto) { return this.createNamed(org, userId, "hrDivision", dto); }
  createLocation(org: string, userId: string, dto: NamedLookupDto) { return this.createNamed(org, userId, "hrLocation", dto); }
  createCostCenter(org: string, userId: string, dto: NamedLookupDto) { return this.createNamed(org, userId, "costCenter", dto); }
  async createGrade(org: string, userId: string, dto: GradeDto) {
    const existing = await this.prisma.grade.findFirst({ where: { organizationId: org, name: { equals: dto.name.trim(), mode: "insensitive" } } });
    if (existing) return existing;
    const row = await this.prisma.grade.create({ data: { organizationId: org, name: dto.name.trim(), level: dto.level } });
    await this.log(org, userId, "HR_GRADE_CREATED", "Grade", row.id, row);
    return row;
  }

  private async removeLookup(org: string, userId: string, kind: "department" | "designation" | "grade" | "businessUnit" | "hrDivision" | "hrLocation" | "costCenter", id: string) {
    const delegate = this.prisma[kind] as unknown as { findFirst(args: object): Promise<{ id: string } | null>; delete(args: object): Promise<unknown> };
    if (!(await delegate.findFirst({ where: { id, organizationId: org } }))) throw new NotFoundException("HR lookup not found");
    const used = await this.prisma.employee.count({ where: { organizationId: org, [`${kind === "hrDivision" ? "division" : kind === "hrLocation" ? "location" : kind}Id`]: id } });
    if (used) throw new ConflictException("This value is assigned to employees and cannot be deleted");
    await delegate.delete({ where: { id } });
    await this.log(org, userId, "HR_LOOKUP_DELETED", kind, id);
    return { id, success: true };
  }
  deleteDepartment(org: string, user: string, id: string) { return this.removeLookup(org, user, "department", id); }
  deleteDesignation(org: string, user: string, id: string) { return this.removeLookup(org, user, "designation", id); }
  deleteGrade(org: string, user: string, id: string) { return this.removeLookup(org, user, "grade", id); }
  deleteBusinessUnit(org: string, user: string, id: string) { return this.removeLookup(org, user, "businessUnit", id); }
  deleteDivision(org: string, user: string, id: string) { return this.removeLookup(org, user, "hrDivision", id); }
  deleteLocation(org: string, user: string, id: string) { return this.removeLookup(org, user, "hrLocation", id); }
  deleteCostCenter(org: string, user: string, id: string) { return this.removeLookup(org, user, "costCenter", id); }

  listEmployees(org: string) { return this.prisma.employee.findMany({ where: { organizationId: org }, include: employeeInclude, orderBy: { createdAt: "desc" } }); }

  async createEmployee(org: string, userId: string, dto: CreateEmployeeDto) {
    await this.assertEmployeeRefs(org, dto);
    const salaryComponents = normalizeSalaryComponents(dto.salaryComponents);
    const employeeCode = dto.employeeCode?.trim().toUpperCase() || await this.numbering.next(org, "EMPLOYEE");
    if (await this.prisma.employee.findFirst({ where: { organizationId: org, employeeCode } })) throw new ConflictException("Employee code is already in use");
    const row = await this.prisma.employee.create({ data: {
      organizationId: org, employeeCode, name: dto.name.trim(), fatherOrSpouseName: dto.fatherOrSpouseName?.trim(), gender: dto.gender as Gender,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined, phone: dto.phone?.trim(), email: dto.email?.trim(), presentAddress: dto.presentAddress?.trim(), permanentAddress: dto.permanentAddress?.trim(), nationalId: dto.nationalId?.trim(),
      departmentId: dto.departmentId, designationId: dto.designationId, gradeId: dto.gradeId, businessUnitId: dto.businessUnitId, divisionId: dto.divisionId, locationId: dto.locationId, costCenterId: dto.costCenterId, reportingManagerId: dto.reportingManagerId,
      employmentType: dto.employmentType as EmploymentType, status: dto.status as EmployeeStatus, joiningDate: new Date(dto.joiningDate), probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : undefined, contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : undefined,
      grossSalary: D(dto.grossSalary).toDecimalPlaces(4), salaryComponents, pfRate: dto.pfRate, paymentMethod: dto.paymentMethod as SalaryPaymentMethod, bankName: dto.bankName?.trim(), bankAccountNumber: dto.bankAccountNumber?.trim(), mfsProvider: dto.mfsProvider?.trim(), mfsAccountNumber: dto.mfsAccountNumber?.trim(), notes: dto.notes?.trim(), createdById: userId,
    }, include: employeeInclude });
    await this.log(org, userId, "EMPLOYEE_CREATED", "Employee", row.id, { employeeCode: row.employeeCode, name: row.name });
    return row;
  }

  async updateEmployee(org: string, userId: string, id: string, dto: UpdateEmployeeDto) {
    const old = await this.employee(org, id);
    await this.assertEmployeeRefs(org, dto, id);
    const row = await this.prisma.employee.update({ where: { id }, data: {
      name: dto.name?.trim(), fatherOrSpouseName: dto.fatherOrSpouseName !== undefined ? dto.fatherOrSpouseName?.trim() || null : undefined, gender: dto.gender as Gender,
      dateOfBirth: dto.dateOfBirth !== undefined ? dto.dateOfBirth ? new Date(dto.dateOfBirth) : null : undefined, phone: dto.phone !== undefined ? dto.phone?.trim() || null : undefined, email: dto.email !== undefined ? dto.email?.trim() || null : undefined, presentAddress: dto.presentAddress !== undefined ? dto.presentAddress?.trim() || null : undefined, permanentAddress: dto.permanentAddress !== undefined ? dto.permanentAddress?.trim() || null : undefined, nationalId: dto.nationalId !== undefined ? dto.nationalId?.trim() || null : undefined,
      departmentId: dto.departmentId, designationId: dto.designationId, gradeId: dto.gradeId, businessUnitId: dto.businessUnitId, divisionId: dto.divisionId, locationId: dto.locationId, costCenterId: dto.costCenterId, reportingManagerId: dto.reportingManagerId,
      employmentType: dto.employmentType as EmploymentType, status: dto.status as EmployeeStatus, joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined, probationEndDate: dto.probationEndDate !== undefined ? dto.probationEndDate ? new Date(dto.probationEndDate) : null : undefined, contractEndDate: dto.contractEndDate !== undefined ? dto.contractEndDate ? new Date(dto.contractEndDate) : null : undefined, resignationDate: dto.resignationDate !== undefined ? dto.resignationDate ? new Date(dto.resignationDate) : null : undefined,
      grossSalary: dto.grossSalary === undefined ? undefined : D(dto.grossSalary).toDecimalPlaces(4), salaryComponents: dto.salaryComponents ? normalizeSalaryComponents(dto.salaryComponents) : undefined, pfRate: dto.pfRate, paymentMethod: dto.paymentMethod as SalaryPaymentMethod,
      bankName: dto.bankName !== undefined ? dto.bankName?.trim() || null : undefined, bankAccountNumber: dto.bankAccountNumber !== undefined ? dto.bankAccountNumber?.trim() || null : undefined, mfsProvider: dto.mfsProvider !== undefined ? dto.mfsProvider?.trim() || null : undefined, mfsAccountNumber: dto.mfsAccountNumber !== undefined ? dto.mfsAccountNumber?.trim() || null : undefined, notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
    }, include: employeeInclude });
    await this.audit.record({ organizationId: org, userId, action: "EMPLOYEE_UPDATED", entityType: "Employee", entityId: id, oldValue: { name: old.name, status: old.status }, newValue: { name: row.name, status: row.status } });
    return row;
  }

  async deleteEmployee(org: string, userId: string, id: string) {
    const old = await this.employee(org, id);
    if (await this.prisma.payslip.count({ where: { organizationId: org, employeeId: id } })) throw new ConflictException("Employee has payroll history; mark them resigned or terminated instead");
    await this.prisma.employee.delete({ where: { id } });
    await this.log(org, userId, "EMPLOYEE_DELETED", "Employee", id, { employeeCode: old.employeeCode, name: old.name });
    return { id, success: true };
  }

  async listEmployeeChanges(org: string, employeeId: string) {
    await this.employee(org, employeeId);
    return this.prisma.employeeChangeRecord.findMany({ where: { organizationId: org, employeeId }, orderBy: { effectiveDate: "desc" } });
  }

  async createEmployeeChange(org: string, userId: string, dto: EmployeeChangeDto) {
    await this.employee(org, dto.employeeId);
    const row = await this.prisma.employeeChangeRecord.create({ data: { organizationId: org, employeeId: dto.employeeId, changeType: dto.changeType as EmployeeChangeType, effectiveDate: new Date(dto.effectiveDate), previousValue: dto.previousValue?.trim(), newValue: dto.newValue?.trim(), reason: dto.reason?.trim(), createdById: userId } });
    await this.log(org, userId, "EMPLOYEE_CHANGE_RECORDED", "EmployeeChangeRecord", row.id, row);
    return row;
  }

  async getExitProcess(org: string, employeeId: string) {
    await this.employee(org, employeeId);
    return this.prisma.exitProcess.findFirst({ where: { organizationId: org, employeeId } });
  }

  async createExitProcess(org: string, userId: string, dto: ExitProcessDto) {
    await this.employee(org, dto.employeeId);
    if (await this.prisma.exitProcess.findFirst({ where: { organizationId: org, employeeId: dto.employeeId } })) throw new ConflictException("An exit process already exists for this employee");
    const row = await this.prisma.exitProcess.create({ data: { organizationId: org, employeeId: dto.employeeId, separationType: dto.separationType as SeparationType, noticeStartDate: dto.noticeStartDate ? new Date(dto.noticeStartDate) : undefined, lastWorkingDate: dto.lastWorkingDate ? new Date(dto.lastWorkingDate) : undefined, createdById: userId } });
    await this.log(org, userId, "EXIT_PROCESS_CREATED", "ExitProcess", row.id, row);
    return row;
  }

  async updateExitProcess(org: string, userId: string, id: string, dto: UpdateExitProcessDto) {
    const existing = await this.prisma.exitProcess.findFirst({ where: { id, organizationId: org } });
    if (!existing) throw new NotFoundException("Exit process not found");
    const clearances = {
      departmentClearance: dto.departmentClearance ?? existing.departmentClearance,
      assetClearance: dto.assetClearance ?? existing.assetClearance,
      financeClearance: dto.financeClearance ?? existing.financeClearance,
      hrClearance: dto.hrClearance ?? existing.hrClearance,
    };
    if (dto.status === "COMPLETED" && Object.values(clearances).some((value) => !value)) throw new BadRequestException("All clearances are required before completing an exit process");
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.exitProcess.update({ where: { id }, data: { separationType: dto.separationType as SeparationType, noticeStartDate: dto.noticeStartDate !== undefined ? new Date(dto.noticeStartDate) : undefined, lastWorkingDate: dto.lastWorkingDate !== undefined ? new Date(dto.lastWorkingDate) : undefined, ...clearances, finalSettlementAmount: dto.finalSettlementAmount === undefined ? undefined : D(dto.finalSettlementAmount).toDecimalPlaces(4), exitInterviewNotes: dto.exitInterviewNotes !== undefined ? dto.exitInterviewNotes?.trim() || null : undefined, status: dto.status as ExitProcessStatus } });
      if (updated.status === "COMPLETED") await tx.employee.update({ where: { id: updated.employeeId }, data: { status: updated.separationType === "TERMINATION" ? "TERMINATED" : "RESIGNED", resignationDate: updated.lastWorkingDate } });
      return updated;
    });
    await this.log(org, userId, "EXIT_PROCESS_UPDATED", "ExitProcess", row.id, { status: row.status });
    return row;
  }

  listExpenseClaims(org: string) { return this.prisma.hrExpenseClaim.findMany({ where: { organizationId: org }, include: { employee: { select: employeeBrief } }, orderBy: { expenseDate: "desc" } }); }
  async createExpenseClaim(org: string, userId: string, dto: ExpenseClaimDto) {
    await this.employee(org, dto.employeeId);
    const row = await this.prisma.hrExpenseClaim.create({ data: { organizationId: org, employeeId: dto.employeeId, category: dto.category as HrExpenseCategory, amount: D(dto.amount).toDecimalPlaces(4), expenseDate: new Date(dto.expenseDate), description: dto.description?.trim(), createdById: userId }, include: { employee: { select: employeeBrief } } });
    await this.log(org, userId, "HR_EXPENSE_CLAIM_CREATED", "HrExpenseClaim", row.id, { amount: row.amount.toFixed(4) });
    return row;
  }
  private async expenseClaim(org: string, id: string) { const row = await this.prisma.hrExpenseClaim.findFirst({ where: { id, organizationId: org } }); if (!row) throw new NotFoundException("Expense claim not found"); return row; }
  async approveExpenseClaim(org: string, userId: string, id: string) { const old = await this.expenseClaim(org, id); if (old.status !== "PENDING") throw new BadRequestException("Only pending claims can be approved"); const row = await this.prisma.hrExpenseClaim.update({ where: { id }, data: { status: "APPROVED", decidedById: userId, decidedAt: new Date() }, include: { employee: { select: employeeBrief } } }); await this.log(org, userId, "HR_EXPENSE_CLAIM_APPROVED", "HrExpenseClaim", id); return row; }
  async rejectExpenseClaim(org: string, userId: string, id: string, dto: DecisionDto) { const old = await this.expenseClaim(org, id); if (old.status !== "PENDING") throw new BadRequestException("Only pending claims can be rejected"); const row = await this.prisma.hrExpenseClaim.update({ where: { id }, data: { status: "REJECTED", decidedById: userId, decidedAt: new Date(), decisionNote: dto.note?.trim() }, include: { employee: { select: employeeBrief } } }); await this.log(org, userId, "HR_EXPENSE_CLAIM_REJECTED", "HrExpenseClaim", id); return row; }
  async markExpenseReimbursed(org: string, userId: string, id: string) { const old = await this.expenseClaim(org, id); if (old.status !== "APPROVED") throw new BadRequestException("Only approved claims can be reimbursed"); const row = await this.prisma.hrExpenseClaim.update({ where: { id }, data: { status: "REIMBURSED", reimbursedAt: new Date(), reimbursedById: userId }, include: { employee: { select: employeeBrief } } }); await this.log(org, userId, "HR_EXPENSE_CLAIM_REIMBURSED", "HrExpenseClaim", id); return row; }
  async deleteExpenseClaim(org: string, userId: string, id: string) { const old = await this.expenseClaim(org, id); if (old.status !== "PENDING") throw new ConflictException("Only pending claims can be deleted"); await this.prisma.hrExpenseClaim.delete({ where: { id } }); await this.log(org, userId, "HR_EXPENSE_CLAIM_DELETED", "HrExpenseClaim", id); return { id, success: true }; }

  async listEmployeeLoans(org: string) {
    const rows = await this.prisma.employeeLoan.findMany({ where: { organizationId: org }, include: { employee: { select: employeeBrief }, repayments: { orderBy: { paidDate: "desc" } } }, orderBy: { applicationDate: "desc" } });
    return rows.map((row) => { const totalRepaid = row.repayments.reduce((sum, repayment) => sum.add(repayment.amount), D(0)); return { ...row, totalRepaid: totalRepaid.toFixed(4), remainingBalance: Prisma.Decimal.max(D(0), row.principalAmount.sub(totalRepaid)).toFixed(4) }; });
  }
  async createEmployeeLoan(org: string, userId: string, dto: EmployeeLoanDto) { await this.employee(org, dto.employeeId); const row = await this.prisma.employeeLoan.create({ data: { organizationId: org, employeeId: dto.employeeId, loanType: dto.loanType as EmployeeLoanType, principalAmount: D(dto.principalAmount).toDecimalPlaces(4), reason: dto.reason?.trim(), applicationDate: new Date(dto.applicationDate), createdById: userId }, include: { employee: { select: employeeBrief } } }); await this.log(org, userId, "EMPLOYEE_LOAN_CREATED", "EmployeeLoan", row.id); return row; }
  private async loan(org: string, id: string) { const row = await this.prisma.employeeLoan.findFirst({ where: { id, organizationId: org }, include: { repayments: true } }); if (!row) throw new NotFoundException("Employee loan not found"); return row; }
  private async changeLoanStatus(org: string, userId: string, id: string, from: EmployeeLoanStatus, to: EmployeeLoanStatus) { const old = await this.loan(org, id); if (old.status !== from) throw new BadRequestException(`Only ${from.toLowerCase()} loans can be changed to ${to.toLowerCase()}`); const row = await this.prisma.employeeLoan.update({ where: { id }, data: { status: to, decidedById: ["APPROVED", "REJECTED"].includes(to) ? userId : undefined, decidedAt: ["APPROVED", "REJECTED"].includes(to) ? new Date() : undefined, disbursedAt: to === "DISBURSED" ? new Date() : undefined } }); await this.log(org, userId, `EMPLOYEE_LOAN_${to}`, "EmployeeLoan", id); return row; }
  approveEmployeeLoan(org: string, user: string, id: string) { return this.changeLoanStatus(org, user, id, "PENDING", "APPROVED"); }
  rejectEmployeeLoan(org: string, user: string, id: string) { return this.changeLoanStatus(org, user, id, "PENDING", "REJECTED"); }
  disburseEmployeeLoan(org: string, user: string, id: string) { return this.changeLoanStatus(org, user, id, "APPROVED", "DISBURSED"); }
  async createLoanRepayment(org: string, userId: string, id: string, dto: LoanRepaymentDto) {
    const loan = await this.loan(org, id);
    if (loan.status !== "DISBURSED") throw new BadRequestException("Only disbursed loans can accept repayments");
    const total = loan.repayments.reduce((sum, repayment) => sum.add(repayment.amount), D(0));
    const amount = D(dto.amount).toDecimalPlaces(4), remaining = loan.principalAmount.sub(total);
    if (amount.gt(remaining)) throw new BadRequestException(`Repayment exceeds remaining balance ${remaining.toFixed(4)}`);
    const result = await this.prisma.$transaction(async (tx) => { const repayment = await tx.loanRepayment.create({ data: { organizationId: org, loanId: id, amount, paidDate: new Date(dto.paidDate), note: dto.note?.trim(), createdById: userId } }); const after = remaining.sub(amount); if (after.lte(0)) await tx.employeeLoan.update({ where: { id }, data: { status: "SETTLED" } }); return { repayment, totalRepaid: total.add(amount).toFixed(4), remainingBalance: Prisma.Decimal.max(D(0), after).toFixed(4) }; });
    await this.log(org, userId, "EMPLOYEE_LOAN_REPAYMENT", "EmployeeLoan", id, { amount: amount.toFixed(4) });
    return result;
  }

  listJobOpenings(org: string) { return this.prisma.jobOpening.findMany({ where: { organizationId: org }, include: { department: true, designation: true, _count: { select: { applications: true } } }, orderBy: { createdAt: "desc" } }); }
  async createJobOpening(org: string, userId: string, dto: JobOpeningDto) { if (dto.departmentId && !(await this.prisma.department.findFirst({ where: { id: dto.departmentId, organizationId: org } }))) throw new NotFoundException("Department not found"); if (dto.designationId && !(await this.prisma.designation.findFirst({ where: { id: dto.designationId, organizationId: org } }))) throw new NotFoundException("Designation not found"); const row = await this.prisma.jobOpening.create({ data: { organizationId: org, title: dto.title.trim(), departmentId: dto.departmentId, designationId: dto.designationId, numberOfPositions: dto.numberOfPositions, description: dto.description?.trim(), createdById: userId } }); await this.log(org, userId, "JOB_OPENING_CREATED", "JobOpening", row.id); return row; }
  async updateJobOpening(org: string, userId: string, id: string, dto: UpdateJobOpeningDto) { const old = await this.prisma.jobOpening.findFirst({ where: { id, organizationId: org } }); if (!old) throw new NotFoundException("Job opening not found"); if (dto.departmentId && !(await this.prisma.department.findFirst({ where: { id: dto.departmentId, organizationId: org } }))) throw new NotFoundException("Department not found"); if (dto.designationId && !(await this.prisma.designation.findFirst({ where: { id: dto.designationId, organizationId: org } }))) throw new NotFoundException("Designation not found"); const row = await this.prisma.jobOpening.update({ where: { id }, data: { ...dto, title: dto.title?.trim(), description: dto.description !== undefined ? dto.description?.trim() || null : undefined, status: dto.status as JobOpeningStatus } }); await this.log(org, userId, "JOB_OPENING_UPDATED", "JobOpening", id); return row; }
  listCandidates(org: string) { return this.prisma.candidate.findMany({ where: { organizationId: org }, include: { applications: { include: { jobOpening: { select: { id: true, title: true } } } } }, orderBy: { createdAt: "desc" } }); }
  async createCandidate(org: string, userId: string, dto: CandidateDto) { const row = await this.prisma.candidate.create({ data: { organizationId: org, name: dto.name.trim(), email: dto.email?.trim(), phone: dto.phone?.trim(), source: dto.source?.trim(), resumeNote: dto.resumeNote?.trim(), createdById: userId } }); await this.log(org, userId, "CANDIDATE_CREATED", "Candidate", row.id); return row; }
  listJobApplications(org: string) { return this.prisma.jobApplication.findMany({ where: { organizationId: org }, include: { candidate: true, jobOpening: true }, orderBy: { createdAt: "desc" } }); }
  async createJobApplication(org: string, userId: string, dto: JobApplicationDto) { const [candidate, opening] = await Promise.all([this.prisma.candidate.findFirst({ where: { id: dto.candidateId, organizationId: org } }), this.prisma.jobOpening.findFirst({ where: { id: dto.jobOpeningId, organizationId: org, status: "OPEN" } })]); if (!candidate || !opening) throw new NotFoundException("Candidate or open job position not found"); const row = await this.prisma.jobApplication.create({ data: { organizationId: org, candidateId: candidate.id, jobOpeningId: opening.id, appliedDate: new Date(dto.appliedDate), createdById: userId }, include: { candidate: true, jobOpening: true } }); await this.log(org, userId, "JOB_APPLICATION_CREATED", "JobApplication", row.id); return row; }
  async updateJobApplication(org: string, userId: string, id: string, dto: UpdateJobApplicationDto) { if (!(await this.prisma.jobApplication.findFirst({ where: { id, organizationId: org } }))) throw new NotFoundException("Job application not found"); const row = await this.prisma.jobApplication.update({ where: { id }, data: { stage: dto.stage as ApplicationStage, interviewDate: dto.interviewDate !== undefined ? dto.interviewDate ? new Date(dto.interviewDate) : null : undefined, interviewNotes: dto.interviewNotes !== undefined ? dto.interviewNotes?.trim() || null : undefined, assessmentScore: dto.assessmentScore, referenceCheckNotes: dto.referenceCheckNotes !== undefined ? dto.referenceCheckNotes?.trim() || null : undefined, offeredSalary: dto.offeredSalary, offerDate: dto.offerDate !== undefined ? dto.offerDate ? new Date(dto.offerDate) : null : undefined, notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined }, include: { candidate: true, jobOpening: true } }); await this.log(org, userId, "JOB_APPLICATION_UPDATED", "JobApplication", id, { stage: row.stage }); return row; }

  async getOnboardingChecklist(org: string, employeeId: string) { await this.employee(org, employeeId); return this.prisma.onboardingChecklist.upsert({ where: { employeeId }, update: {}, create: { organizationId: org, employeeId } }); }
  async updateOnboardingChecklist(org: string, userId: string, employeeId: string, dto: OnboardingDto) { await this.employee(org, employeeId); const { confirmed, ...values } = dto; const row = await this.prisma.onboardingChecklist.upsert({ where: { employeeId }, update: { ...values, probationReviewDate: values.probationReviewDate !== undefined ? values.probationReviewDate ? new Date(values.probationReviewDate) : null : undefined, probationReviewNotes: values.probationReviewNotes !== undefined ? values.probationReviewNotes?.trim() || null : undefined, confirmedAt: confirmed === undefined ? undefined : confirmed ? new Date() : null }, create: { organizationId: org, employeeId, ...values, probationReviewDate: values.probationReviewDate ? new Date(values.probationReviewDate) : undefined, probationReviewNotes: values.probationReviewNotes?.trim(), confirmedAt: confirmed ? new Date() : undefined } }); await this.log(org, userId, "ONBOARDING_UPDATED", "OnboardingChecklist", row.id); return row; }

  async listAttendance(org: string) {
    const [rows, shift] = await Promise.all([
      this.prisma.attendanceRecord.findMany({ where: { organizationId: org }, include: { employee: { select: { ...employeeBrief, department: true, designation: true } } }, orderBy: [{ attendanceDate: "desc" }, { employee: { name: "asc" } }] }),
      this.prisma.shift.findFirst({ where: { organizationId: org }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    ]);
    return rows.map((row) => ({ ...row, ...calculateAttendanceDuration(row.checkIn, row.checkOut, shift) }));
  }

  async importAttendance(org: string, userId: string, dto: ImportAttendanceDto) {
    const [employees, shift] = await Promise.all([
      this.prisma.employee.findMany({ where: { organizationId: org }, select: employeeBrief }),
      this.prisma.shift.findFirst({ where: { organizationId: org }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    ]);
    const byCode = new Map(employees.map((employee) => [employee.employeeCode.trim().toLowerCase(), employee]));
    let imported = 0;
    const errors: Array<{ row: number; identifier: string; reason: string }> = [];
    for (let index = 0; index < dto.rows.length; index += 1) {
      const input = dto.rows[index];
      const identifier = input.employeeCode?.trim() || input.employeeName?.trim() || "(missing identifier)";
      let employee = input.employeeCode ? byCode.get(input.employeeCode.trim().toLowerCase()) : undefined;
      if (!employee && input.employeeName) {
        const name = input.employeeName.trim().toLowerCase();
        const exact = employees.filter((candidate) => candidate.name.trim().toLowerCase() === name);
        const tokens = name.split(/\s+/).filter(Boolean);
        const matches = exact.length ? exact : employees.filter((candidate) => tokens.every((token) => candidate.name.toLowerCase().split(/\s+/).includes(token)));
        if (matches.length === 1) employee = matches[0];
        else if (matches.length > 1) { errors.push({ row: index + 1, identifier, reason: "Employee name is ambiguous; use employee code" }); continue; }
      }
      if (!employee) { errors.push({ row: index + 1, identifier, reason: "Employee not found" }); continue; }
      const date = new Date(input.date);
      if (Number.isNaN(date.getTime())) { errors.push({ row: index + 1, identifier, reason: "Invalid attendance date" }); continue; }
      const checkIn = clockMinutes(input.checkIn) === null ? null : input.checkIn!.trim();
      const checkOut = clockMinutes(input.checkOut) === null ? null : input.checkOut!.trim();
      const duration = shift ? calculateAttendanceDuration(checkIn, checkOut, shift) : { lateMinutes: input.lateMinutes ?? 0, overtimeMinutes: input.overtimeMinutes ?? 0 };
      try {
        await this.prisma.attendanceRecord.upsert({ where: { organizationId_employeeId_attendanceDate: { organizationId: org, employeeId: employee.id, attendanceDate: date } }, update: { status: (input.status ?? (checkIn || checkOut ? "PRESENT" : "ABSENT")) as never, checkIn, checkOut, lateMinutes: duration.lateMinutes, overtimeMinutes: duration.overtimeMinutes, notes: input.notes?.trim() }, create: { organizationId: org, employeeId: employee.id, attendanceDate: date, status: (input.status ?? (checkIn || checkOut ? "PRESENT" : "ABSENT")) as never, checkIn, checkOut, lateMinutes: duration.lateMinutes, overtimeMinutes: duration.overtimeMinutes, notes: input.notes?.trim(), createdById: userId } });
        imported += 1;
      } catch { errors.push({ row: index + 1, identifier, reason: "Could not save attendance row" }); }
    }
    await this.log(org, userId, "ATTENDANCE_IMPORTED", "AttendanceRecord", undefined, { imported, skipped: errors.length });
    return { imported, skipped: errors.length, errors: errors.slice(0, 50) };
  }

  listPayrollRuns(org: string) { return this.prisma.payrollRun.findMany({ where: { organizationId: org }, include: { payslips: { orderBy: { employeeName: "asc" } } }, orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }] }); }
  private async payroll(org: string, id: string) { const row = await this.prisma.payrollRun.findFirst({ where: { id, organizationId: org }, include: { payslips: true } }); if (!row) throw new NotFoundException("Payroll run not found"); return row; }

  async calculatePayroll(org: string, userId: string, dto: CalculatePayrollDto) {
    const employees = await this.prisma.employee.findMany({ where: { organizationId: org, status: "ACTIVE", id: { in: dto.entries.map((entry) => entry.employeeId) } }, include: employeeInclude });
    const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
    if (!employeeMap.size) throw new BadRequestException("No active employees were supplied");
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.payrollRun.findUnique({ where: { organizationId_periodYear_periodMonth: { organizationId: org, periodYear: dto.periodYear, periodMonth: dto.periodMonth } } });
      if (existing && existing.status !== "DRAFT") throw new ConflictException("This payroll period is already approved");
      const run = await tx.payrollRun.upsert({ where: { organizationId_periodYear_periodMonth: { organizationId: org, periodYear: dto.periodYear, periodMonth: dto.periodMonth } }, update: { totalWorkingDays: dto.totalWorkingDays }, create: { organizationId: org, periodYear: dto.periodYear, periodMonth: dto.periodMonth, totalWorkingDays: dto.totalWorkingDays, createdById: userId } });
      await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
      let totalGross = D(0), totalDeduction = D(0), totalNet = D(0);
      for (const input of dto.entries) {
        const employee = employeeMap.get(input.employeeId); if (!employee) continue;
        const workingDays = D(dto.totalWorkingDays);
        const components = (Array.isArray(employee.salaryComponents) ? employee.salaryComponents : []) as Array<{ name: string; percent: number }>;
        const componentAmounts = components.map((component) => ({ ...component, amount: employee.grossSalary.mul(component.percent).div(100).toDecimalPlaces(4).toNumber() }));
        const basic = components.find((component) => component.name.trim().toLowerCase() === "basic");
        let calculated;
        try { calculated = calculatePayrollAmounts({ grossSalary: employee.grossSalary, presentDays: input.presentDays, workingDays, basicPercent: basic?.percent, pfRate: employee.pfRate, iouDeduction: input.iouDeduction, loanDeduction: input.loanDeduction, fineDeduction: input.fineDeduction, lunchBillDeduction: input.lunchBillDeduction }); }
        catch (error) { if (error instanceof BadRequestException && error.message === "Deductions exceed prorated gross") throw new BadRequestException(`Deductions exceed prorated gross for ${employee.name}`); throw error; }
        const { presentDays, proratedGross: prorated, providentFund: pf, iouDeduction: iou, loanDeduction: loan, fineDeduction: fine, lunchBillDeduction: lunch, totalDeduction: deductions, netPayable: net } = calculated;
        totalGross = totalGross.add(prorated); totalDeduction = totalDeduction.add(deductions); totalNet = totalNet.add(net);
        await tx.payslip.create({ data: { organizationId: org, payrollRunId: run.id, employeeId: employee.id, employeeCode: employee.employeeCode, employeeName: employee.name, department: employee.department?.name, designation: employee.designation?.name, grossSalary: employee.grossSalary, components: componentAmounts, totalWorkingDays: workingDays, presentDays, proratedGross: prorated, providentFund: pf, employerPfContribution: pf, iouDeduction: iou, loanDeduction: loan, fineDeduction: fine, lunchBillDeduction: lunch, totalDeduction: deductions, netPayable: net, paymentMethod: employee.paymentMethod } });
      }
      return tx.payrollRun.update({ where: { id: run.id }, data: { totalGross, totalDeduction, totalNetPayable: totalNet }, include: { payslips: { orderBy: { employeeName: "asc" } } } });
    });
    await this.log(org, userId, "PAYROLL_CALCULATED", "PayrollRun", row.id, { periodYear: row.periodYear, periodMonth: row.periodMonth });
    return row;
  }

  async deletePayrollRun(org: string, userId: string, id: string) { const run = await this.payroll(org, id); if (run.status !== "DRAFT") throw new ConflictException("Only draft payroll runs can be deleted"); await this.prisma.payrollRun.delete({ where: { id } }); await this.log(org, userId, "PAYROLL_DELETED", "PayrollRun", id); return { id, success: true }; }
  async approvePayrollRun(org: string, userId: string, id: string) { const run = await this.payroll(org, id); if (run.status !== "DRAFT" || !run.payslips.length) throw new BadRequestException("Only a calculated draft payroll can be approved"); const row = await this.prisma.payrollRun.update({ where: { id }, data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() }, include: { payslips: { orderBy: { employeeName: "asc" } } } }); await this.log(org, userId, "PAYROLL_APPROVED", "PayrollRun", id); return row; }
  async markPayslipPaid(org: string, userId: string, id: string) {
    const payslip = await this.prisma.payslip.findFirst({ where: { id, organizationId: org }, include: { payrollRun: true } }); if (!payslip) throw new NotFoundException("Payslip not found");
    if (!(["APPROVED", "PAID"] as string[]).includes(payslip.payrollRun.status)) throw new ForbiddenException("Approve the payroll run before recording payments");
    const row = await this.prisma.payslip.update({ where: { id }, data: { paymentStatus: "PAID", paidAt: new Date(), paidById: userId } });
    if (!(await this.prisma.payslip.count({ where: { payrollRunId: payslip.payrollRunId, paymentStatus: { not: "PAID" } } }))) await this.prisma.payrollRun.update({ where: { id: payslip.payrollRunId }, data: { status: "PAID" } });
    await this.log(org, userId, "PAYSLIP_PAID", "Payslip", id); return row;
  }

  async getProvidentFundSummary(org: string) {
    const [employees, payslips] = await Promise.all([this.prisma.employee.findMany({ where: { organizationId: org }, include: employeeInclude, orderBy: { name: "asc" } }), this.prisma.payslip.findMany({ where: { organizationId: org, payrollRun: { status: { in: ["APPROVED", "PAID"] } } }, include: { payrollRun: { select: { periodYear: true, periodMonth: true } } } })]);
    return employees.map((employee) => { const rows = payslips.filter((row) => row.employeeId === employee.id); const employeeContribution = rows.reduce((sum, row) => sum.add(row.providentFund), D(0)); const companyContribution = rows.reduce((sum, row) => sum.add(row.employerPfContribution), D(0)); const latest = rows.sort((a, b) => b.payrollRun.periodYear - a.payrollRun.periodYear || b.payrollRun.periodMonth - a.payrollRun.periodMonth)[0]; return { employeeId: employee.id, employeeCode: employee.employeeCode, employeeName: employee.name, pfRate: employee.pfRate?.toFixed(2) ?? null, employeeContribution: employeeContribution.toFixed(4), companyContribution: companyContribution.toFixed(4), totalDeposited: employeeContribution.add(companyContribution).toFixed(4), lastContribution: latest?.payrollRun ?? null }; });
  }

  listLeaveTypes(org: string) { return this.prisma.leaveType.findMany({ where: { organizationId: org }, orderBy: { name: "asc" } }); }
  async createLeaveType(org: string, userId: string, dto: LeaveTypeDto) { const existing = await this.prisma.leaveType.findFirst({ where: { organizationId: org, name: { equals: dto.name.trim(), mode: "insensitive" } } }); if (existing) return existing; const row = await this.prisma.leaveType.create({ data: { organizationId: org, name: dto.name.trim(), daysPerYear: dto.daysPerYear } }); await this.log(org, userId, "LEAVE_TYPE_CREATED", "LeaveType", row.id); return row; }
  async deleteLeaveType(org: string, userId: string, id: string) { const row = await this.prisma.leaveType.findFirst({ where: { id, organizationId: org }, include: { _count: { select: { requests: true } } } }); if (!row) throw new NotFoundException("Leave type not found"); if (row._count.requests) throw new ConflictException("Leave type has request history and cannot be deleted"); await this.prisma.leaveType.delete({ where: { id } }); await this.log(org, userId, "LEAVE_TYPE_DELETED", "LeaveType", id); return { id, success: true }; }
  listLeaveRequests(org: string) { return this.prisma.leaveRequest.findMany({ where: { organizationId: org }, include: { employee: { select: employeeBrief }, leaveType: true }, orderBy: { createdAt: "desc" } }); }
  private async leaveRequest(org: string, id: string) { const row = await this.prisma.leaveRequest.findFirst({ where: { id, organizationId: org }, include: { employee: { select: employeeBrief }, leaveType: true } }); if (!row) throw new NotFoundException("Leave request not found"); return row; }
  private async leaveBalance(org: string, employeeId: string, leaveTypeId: string, year: number, excludeId?: string) { const type = await this.prisma.leaveType.findFirst({ where: { id: leaveTypeId, organizationId: org } }); if (!type) throw new NotFoundException("Leave type not found"); const used = await this.prisma.leaveRequest.aggregate({ where: { organizationId: org, employeeId, leaveTypeId, status: "APPROVED", startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) }, ...(excludeId ? { id: { not: excludeId } } : {}) }, _sum: { totalDays: true } }); const usedDays = used._sum.totalDays ?? D(0); return { leaveType: type, used: usedDays, remaining: Prisma.Decimal.max(D(0), type.daysPerYear.sub(usedDays)) }; }
  async listLeaveBalances(org: string) { const year = new Date().getUTCFullYear(); const [employees, types, requests] = await Promise.all([this.prisma.employee.findMany({ where: { organizationId: org, status: "ACTIVE" }, select: employeeBrief }), this.prisma.leaveType.findMany({ where: { organizationId: org } }), this.prisma.leaveRequest.findMany({ where: { organizationId: org, status: "APPROVED", startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } } })]); return employees.flatMap((employee) => types.map((type) => { const used = requests.filter((row) => row.employeeId === employee.id && row.leaveTypeId === type.id).reduce((sum, row) => sum.add(row.totalDays), D(0)); return { employeeId: employee.id, employeeCode: employee.employeeCode, employeeName: employee.name, leaveTypeId: type.id, leaveTypeName: type.name, daysPerYear: type.daysPerYear.toFixed(2), used: used.toFixed(2), remaining: Prisma.Decimal.max(D(0), type.daysPerYear.sub(used)).toFixed(2), year }; })); }
  async createLeaveRequest(org: string, userId: string, dto: LeaveRequestDto) { await this.employee(org, dto.employeeId); const start = new Date(dto.startDate), end = new Date(dto.endDate); if (end < start) throw new BadRequestException("End date cannot be before start date"); const totalDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1; const balance = await this.leaveBalance(org, dto.employeeId, dto.leaveTypeId, start.getUTCFullYear()); if (D(totalDays).gt(balance.remaining)) throw new BadRequestException(`Only ${balance.remaining.toFixed(2)} leave days remain`); const row = await this.prisma.leaveRequest.create({ data: { organizationId: org, employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, startDate: start, endDate: end, totalDays, reason: dto.reason?.trim(), createdById: userId }, include: { employee: { select: employeeBrief }, leaveType: true } }); await this.log(org, userId, "LEAVE_REQUEST_CREATED", "LeaveRequest", row.id); return row; }
  async approveLeaveRequest(org: string, userId: string, id: string) { const request = await this.leaveRequest(org, id); if (request.status !== "PENDING") throw new BadRequestException("Only pending leave requests can be approved"); const balance = await this.leaveBalance(org, request.employeeId, request.leaveTypeId, request.startDate.getUTCFullYear(), id); if (request.totalDays.gt(balance.remaining)) throw new BadRequestException("Insufficient leave balance"); const row = await this.prisma.leaveRequest.update({ where: { id }, data: { status: "APPROVED", decidedById: userId, decidedAt: new Date() }, include: { employee: { select: employeeBrief }, leaveType: true } }); await this.log(org, userId, "LEAVE_REQUEST_APPROVED", "LeaveRequest", id); return row; }
  async rejectLeaveRequest(org: string, userId: string, id: string, dto: DecisionDto) { const request = await this.leaveRequest(org, id); if (request.status !== "PENDING") throw new BadRequestException("Only pending leave requests can be rejected"); const row = await this.prisma.leaveRequest.update({ where: { id }, data: { status: "REJECTED", decidedById: userId, decidedAt: new Date(), decisionNote: dto.note?.trim() }, include: { employee: { select: employeeBrief }, leaveType: true } }); await this.log(org, userId, "LEAVE_REQUEST_REJECTED", "LeaveRequest", id); return row; }
  async cancelLeaveRequest(org: string, userId: string, id: string) { const request = await this.leaveRequest(org, id); if (request.status !== "PENDING") throw new BadRequestException("Only pending leave requests can be cancelled"); const row = await this.prisma.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" }, include: { employee: { select: employeeBrief }, leaveType: true } }); await this.log(org, userId, "LEAVE_REQUEST_CANCELLED", "LeaveRequest", id); return row; }

  getPayrollSettings(org: string) { return this.prisma.payrollSetting.upsert({ where: { organizationId: org }, update: {}, create: { organizationId: org, salaryComponents: [{ name: "Basic", percent: 50 }, { name: "House Rent", percent: 25 }, { name: "Medical Allowance", percent: 15 }, { name: "Conveyance", percent: 10 }] } }); }
  async updatePayrollSettings(org: string, userId: string, dto: PayrollSettingsDto) { const components = dto.salaryComponents ? normalizeSalaryComponents(dto.salaryComponents) : undefined; const row = await this.prisma.payrollSetting.upsert({ where: { organizationId: org }, update: { cycleType: dto.cycleType, cycleStartDay: dto.cycleType === "CALENDAR_MONTH" ? 1 : dto.cycleStartDay, paymentDay: dto.paymentDay, salaryComponents: components }, create: { organizationId: org, cycleType: dto.cycleType, cycleStartDay: dto.cycleType === "CALENDAR_MONTH" ? 1 : dto.cycleStartDay, paymentDay: dto.paymentDay, salaryComponents: components ?? [{ name: "Basic", percent: 50 }, { name: "House Rent", percent: 25 }, { name: "Medical Allowance", percent: 15 }, { name: "Conveyance", percent: 10 }] } }); await this.log(org, userId, "PAYROLL_SETTINGS_UPDATED", "PayrollSetting", row.id); return row; }
  listShifts(org: string) { return this.prisma.shift.findMany({ where: { organizationId: org }, orderBy: { name: "asc" } }); }
  async createShift(org: string, userId: string, dto: ShiftDto) { const existing = await this.prisma.shift.findFirst({ where: { organizationId: org, name: { equals: dto.name.trim(), mode: "insensitive" } } }); if (existing) return existing; const row = await this.prisma.$transaction(async (tx) => { if (dto.isDefault) await tx.shift.updateMany({ where: { organizationId: org, isDefault: true }, data: { isDefault: false } }); return tx.shift.create({ data: { organizationId: org, name: dto.name.trim(), startTime: dto.startTime, endTime: dto.endTime, gracePeriodMinutes: dto.gracePeriodMinutes, weeklyOffDays: dto.weeklyOffDays, isDefault: dto.isDefault } }); }); await this.log(org, userId, "SHIFT_CREATED", "Shift", row.id); return row; }
  async deleteShift(org: string, userId: string, id: string) { if (!(await this.prisma.shift.findFirst({ where: { id, organizationId: org } }))) throw new NotFoundException("Shift not found"); await this.prisma.shift.delete({ where: { id } }); await this.log(org, userId, "SHIFT_DELETED", "Shift", id); return { id, success: true }; }
  listHolidays(org: string) { return this.prisma.holiday.findMany({ where: { organizationId: org }, orderBy: { date: "asc" } }); }
  async createHoliday(org: string, userId: string, dto: HolidayDto) { const date = new Date(dto.date), name = dto.name.trim(); const row = await this.prisma.holiday.upsert({ where: { organizationId_date_name: { organizationId: org, date, name } }, update: { isRecurringYearly: dto.isRecurringYearly }, create: { organizationId: org, date, name, isRecurringYearly: dto.isRecurringYearly } }); await this.log(org, userId, "HOLIDAY_SAVED", "Holiday", row.id); return row; }
  async deleteHoliday(org: string, userId: string, id: string) { if (!(await this.prisma.holiday.findFirst({ where: { id, organizationId: org } }))) throw new NotFoundException("Holiday not found"); await this.prisma.holiday.delete({ where: { id } }); await this.log(org, userId, "HOLIDAY_DELETED", "Holiday", id); return { id, success: true }; }
}
