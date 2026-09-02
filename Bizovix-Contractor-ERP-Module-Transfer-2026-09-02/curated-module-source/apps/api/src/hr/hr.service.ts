import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { roundMoney, sumMoney, toPaisa } from "../accounting/money.util.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CalculatePayrollDto } from "./dto/calculate-payroll.dto.js";
import type { CreateBusinessUnitDto } from "./dto/create-business-unit.dto.js";
import type { CreateCandidateDto } from "./dto/create-candidate.dto.js";
import type { CreateCostCenterDto } from "./dto/create-cost-center.dto.js";
import type { CreateDepartmentDto } from "./dto/create-department.dto.js";
import type { CreateDesignationDto } from "./dto/create-designation.dto.js";
import type { CreateDivisionDto } from "./dto/create-division.dto.js";
import type { CreateEmployeeChangeDto } from "./dto/create-employee-change.dto.js";
import type { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import type { CreateEmployeeLoanDto } from "./dto/create-employee-loan.dto.js";
import type { CreateExitProcessDto } from "./dto/create-exit-process.dto.js";
import type { CreateExpenseClaimDto } from "./dto/create-expense-claim.dto.js";
import type { CreateGradeDto } from "./dto/create-grade.dto.js";
import type { CreateJobApplicationDto } from "./dto/create-job-application.dto.js";
import type { CreateJobOpeningDto } from "./dto/create-job-opening.dto.js";
import type { CreateLeaveRequestDto } from "./dto/create-leave-request.dto.js";
import type { CreateHolidayDto } from "./dto/create-holiday.dto.js";
import type { CreateLeaveTypeDto } from "./dto/create-leave-type.dto.js";
import type { CreateLoanRepaymentDto } from "./dto/create-loan-repayment.dto.js";
import type { CreateLocationDto } from "./dto/create-location.dto.js";
import type { CreateShiftDto } from "./dto/create-shift.dto.js";
import type { DecideExpenseClaimDto } from "./dto/decide-expense-claim.dto.js";
import type { DecideLeaveRequestDto } from "./dto/decide-leave-request.dto.js";
import type { ImportAttendanceDto } from "./dto/import-attendance.dto.js";
import type { SalaryComponentDto } from "./dto/salary-component.dto.js";
import type { UpdateEmployeeDto } from "./dto/update-employee.dto.js";
import type { UpdateExitProcessDto } from "./dto/update-exit-process.dto.js";
import type { UpdateJobApplicationDto } from "./dto/update-job-application.dto.js";
import type { UpdateJobOpeningDto } from "./dto/update-job-opening.dto.js";
import type { UpdateOnboardingChecklistDto } from "./dto/update-onboarding-checklist.dto.js";
import type { UpdatePayrollSettingsDto } from "./dto/update-payroll-settings.dto.js";
import { calculateAttendanceDurations } from "./attendance-time.util.js";

const employeeInclude = {
  department: true,
  designation: true,
  grade: true,
  businessUnit: true,
  division: true,
  location: true,
  costCenter: true,
  reportingManager: { select: { id: true, name: true, employeeCode: true } },
} as const;
const leaveRequestInclude = { employee: { select: { id: true, employeeCode: true, name: true } }, leaveType: true } as const;
const jobApplicationInclude = {
  candidate: true,
  jobOpening: { include: { department: true, designation: true } },
} as const;

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  return Number(value);
}

function tokenize(text: string) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function normalizeComponents(components: SalaryComponentDto[]) {
  const trimmed = components.map((component) => ({ name: component.name.trim(), percent: Number(component.percent) }));
  if (trimmed.some((component) => !component.name)) {
    throw new BadRequestException("Every salary component needs a name.");
  }
  const total = trimmed.reduce((sum, component) => sum + component.percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new BadRequestException(`Salary components must add up to 100% — currently ${total.toFixed(2)}%.`);
  }
  return trimmed;
}

@Injectable()
export class HrService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  private requireWorkspaceId(currentUser: AuthenticatedRequestUser) {
    if (!currentUser.workspaceId) {
      throw new BadRequestException("Select an active workspace before managing employees or payroll.");
    }
    return currentUser.workspaceId;
  }

  private async requireEmployee(workspaceId: string, employeeId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: employeeInclude });
    if (!employee || employee.workspaceId !== workspaceId) {
      throw new NotFoundException("Employee not found");
    }
    return employee;
  }

  private async resolveLookup(
    model: "department" | "designation" | "grade" | "businessUnit" | "division" | "location" | "costCenter",
    workspaceId: string,
    id: string | null | undefined,
  ) {
    if (!id) return null;
    let record: { workspaceId: string } | null;
    switch (model) {
      case "department":
        record = await this.prisma.department.findUnique({ where: { id } });
        break;
      case "designation":
        record = await this.prisma.designation.findUnique({ where: { id } });
        break;
      case "grade":
        record = await this.prisma.grade.findUnique({ where: { id } });
        break;
      case "businessUnit":
        record = await this.prisma.businessUnit.findUnique({ where: { id } });
        break;
      case "division":
        record = await this.prisma.division.findUnique({ where: { id } });
        break;
      case "location":
        record = await this.prisma.location.findUnique({ where: { id } });
        break;
      case "costCenter":
        record = await this.prisma.costCenter.findUnique({ where: { id } });
        break;
    }
    if (!record || record.workspaceId !== workspaceId) {
      throw new BadRequestException(`Selected ${model} was not found in this workspace.`);
    }
    return id;
  }

  private async resolveReportingManager(workspaceId: string, employeeId: string | undefined, managerId: string | null | undefined) {
    if (!managerId) return null;
    if (managerId === employeeId) {
      throw new BadRequestException("An employee cannot be their own reporting manager.");
    }
    const manager = await this.prisma.employee.findUnique({ where: { id: managerId } });
    if (!manager || manager.workspaceId !== workspaceId) {
      throw new BadRequestException("Selected reporting manager was not found in this workspace.");
    }
    return managerId;
  }

  private async nextEmployeeCode(workspaceId: string) {
    const count = await this.prisma.employee.count({ where: { workspaceId } });
    let sequence = count + 1;
    for (;;) {
      const candidate = `EMP-${String(sequence).padStart(4, "0")}`;
      const existing = await this.prisma.employee.findUnique({
        where: { workspaceId_employeeCode: { workspaceId, employeeCode: candidate } },
      });
      if (!existing) return candidate;
      sequence += 1;
    }
  }

  // --- Departments ---

  async listDepartments(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.department.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  }

  async createDepartment(currentUser: AuthenticatedRequestUser, dto: CreateDepartmentDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const name = dto.name.trim();
    const existing = await this.prisma.department.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
    if (existing) return existing;
    return this.prisma.department.create({
      data: { tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId, name },
    });
  }

  async deleteDepartment(currentUser: AuthenticatedRequestUser, departmentId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!department || department.workspaceId !== workspaceId) {
      throw new NotFoundException("Department not found");
    }
    await this.prisma.department.delete({ where: { id: departmentId } });
    return { success: true, id: departmentId };
  }

  // --- Designations ---

  async listDesignations(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.designation.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  }

  async createDesignation(currentUser: AuthenticatedRequestUser, dto: CreateDesignationDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const name = dto.name.trim();
    const existing = await this.prisma.designation.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
    if (existing) return existing;
    return this.prisma.designation.create({
      data: { tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId, name },
    });
  }

  async deleteDesignation(currentUser: AuthenticatedRequestUser, designationId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const designation = await this.prisma.designation.findUnique({ where: { id: designationId } });
    if (!designation || designation.workspaceId !== workspaceId) {
      throw new NotFoundException("Designation not found");
    }
    await this.prisma.designation.delete({ where: { id: designationId } });
    return { success: true, id: designationId };
  }

  // --- Org & Job Structure (Grade, Business Unit, Division, Location, Cost Center) ---
  // Same flat, no-hierarchy pick-list shape as Department/Designation above.

  async listGrades(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.grade.findMany({ where: { workspaceId }, orderBy: [{ level: "asc" }, { name: "asc" }] });
  }

  async createGrade(currentUser: AuthenticatedRequestUser, dto: CreateGradeDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const name = dto.name.trim();
    const existing = await this.prisma.grade.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
    if (existing) return existing;
    return this.prisma.grade.create({
      data: { tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId, name, level: dto.level ?? null },
    });
  }

  async deleteGrade(currentUser: AuthenticatedRequestUser, gradeId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const grade = await this.prisma.grade.findUnique({ where: { id: gradeId } });
    if (!grade || grade.workspaceId !== workspaceId) {
      throw new NotFoundException("Grade not found");
    }
    await this.prisma.grade.delete({ where: { id: gradeId } });
    return { success: true, id: gradeId };
  }

  async listBusinessUnits(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.businessUnit.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  }

  async createBusinessUnit(currentUser: AuthenticatedRequestUser, dto: CreateBusinessUnitDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const name = dto.name.trim();
    const existing = await this.prisma.businessUnit.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
    if (existing) return existing;
    return this.prisma.businessUnit.create({ data: { tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId, name } });
  }

  async deleteBusinessUnit(currentUser: AuthenticatedRequestUser, businessUnitId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const businessUnit = await this.prisma.businessUnit.findUnique({ where: { id: businessUnitId } });
    if (!businessUnit || businessUnit.workspaceId !== workspaceId) {
      throw new NotFoundException("Business unit not found");
    }
    await this.prisma.businessUnit.delete({ where: { id: businessUnitId } });
    return { success: true, id: businessUnitId };
  }

  async listDivisions(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.division.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  }

  async createDivision(currentUser: AuthenticatedRequestUser, dto: CreateDivisionDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const name = dto.name.trim();
    const existing = await this.prisma.division.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
    if (existing) return existing;
    return this.prisma.division.create({ data: { tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId, name } });
  }

  async deleteDivision(currentUser: AuthenticatedRequestUser, divisionId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const division = await this.prisma.division.findUnique({ where: { id: divisionId } });
    if (!division || division.workspaceId !== workspaceId) {
      throw new NotFoundException("Division not found");
    }
    await this.prisma.division.delete({ where: { id: divisionId } });
    return { success: true, id: divisionId };
  }

  async listLocations(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.location.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  }

  async createLocation(currentUser: AuthenticatedRequestUser, dto: CreateLocationDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const name = dto.name.trim();
    const existing = await this.prisma.location.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
    if (existing) return existing;
    return this.prisma.location.create({ data: { tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId, name } });
  }

  async deleteLocation(currentUser: AuthenticatedRequestUser, locationId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location || location.workspaceId !== workspaceId) {
      throw new NotFoundException("Location not found");
    }
    await this.prisma.location.delete({ where: { id: locationId } });
    return { success: true, id: locationId };
  }

  async listCostCenters(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.costCenter.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  }

  async createCostCenter(currentUser: AuthenticatedRequestUser, dto: CreateCostCenterDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const name = dto.name.trim();
    const existing = await this.prisma.costCenter.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
    if (existing) return existing;
    return this.prisma.costCenter.create({ data: { tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId, name } });
  }

  async deleteCostCenter(currentUser: AuthenticatedRequestUser, costCenterId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const costCenter = await this.prisma.costCenter.findUnique({ where: { id: costCenterId } });
    if (!costCenter || costCenter.workspaceId !== workspaceId) {
      throw new NotFoundException("Cost center not found");
    }
    await this.prisma.costCenter.delete({ where: { id: costCenterId } });
    return { success: true, id: costCenterId };
  }

  // --- Employees ---

  async listEmployees(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.employee.findMany({ where: { workspaceId }, include: employeeInclude, orderBy: { createdAt: "desc" } });
  }

  async createEmployee(currentUser: AuthenticatedRequestUser, dto: CreateEmployeeDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const salaryComponents = normalizeComponents(dto.salaryComponents);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Employee name is required.");
    }
    const departmentId = await this.resolveLookup("department", workspaceId, dto.departmentId);
    const designationId = await this.resolveLookup("designation", workspaceId, dto.designationId);
    const gradeId = await this.resolveLookup("grade", workspaceId, dto.gradeId);
    const businessUnitId = await this.resolveLookup("businessUnit", workspaceId, dto.businessUnitId);
    const divisionId = await this.resolveLookup("division", workspaceId, dto.divisionId);
    const locationId = await this.resolveLookup("location", workspaceId, dto.locationId);
    const costCenterId = await this.resolveLookup("costCenter", workspaceId, dto.costCenterId);
    const reportingManagerId = await this.resolveReportingManager(workspaceId, undefined, dto.reportingManagerId);

    const employeeCode = dto.employeeCode?.trim() || (await this.nextEmployeeCode(workspaceId));
    const existing = await this.prisma.employee.findUnique({
      where: { workspaceId_employeeCode: { workspaceId, employeeCode } },
    });
    if (existing) {
      throw new BadRequestException(`Employee code "${employeeCode}" is already in use.`);
    }

    const employee = await this.prisma.employee.create({
      include: employeeInclude,
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        employeeCode,
        name,
        fatherOrSpouseName: dto.fatherOrSpouseName?.trim() || null,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        presentAddress: dto.presentAddress?.trim() || null,
        permanentAddress: dto.permanentAddress?.trim() || null,
        nationalId: dto.nationalId?.trim() || null,
        departmentId,
        designationId,
        gradeId,
        businessUnitId,
        divisionId,
        locationId,
        costCenterId,
        reportingManagerId,
        employmentType: dto.employmentType ?? "PERMANENT",
        status: dto.status ?? "ACTIVE",
        joiningDate: new Date(dto.joiningDate),
        probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : null,
        contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : null,
        grossSalary: roundMoney(dto.grossSalary),
        salaryComponents,
        pfRate: dto.pfRate ?? null,
        paymentMethod: dto.paymentMethod ?? "CASH",
        bankName: dto.bankName?.trim() || null,
        bankAccountNumber: dto.bankAccountNumber?.trim() || null,
        mfsProvider: dto.mfsProvider?.trim() || null,
        mfsAccountNumber: dto.mfsAccountNumber?.trim() || null,
        notes: dto.notes?.trim() || null,
        createdByUserId: currentUser.id,
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "EMPLOYEE_CREATED",
      entityType: "Employee",
      entityId: employee.id,
      newValues: { employeeCode: employee.employeeCode, name: employee.name },
    });

    return employee;
  }

  async updateEmployee(currentUser: AuthenticatedRequestUser, employeeId: string, dto: UpdateEmployeeDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    await this.requireEmployee(workspaceId, employeeId);
    const salaryComponents = dto.salaryComponents ? normalizeComponents(dto.salaryComponents) : undefined;

    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException("Employee name cannot be empty.");
    }

    const departmentId = dto.departmentId !== undefined ? await this.resolveLookup("department", workspaceId, dto.departmentId) : undefined;
    const designationId = dto.designationId !== undefined ? await this.resolveLookup("designation", workspaceId, dto.designationId) : undefined;
    const gradeId = dto.gradeId !== undefined ? await this.resolveLookup("grade", workspaceId, dto.gradeId) : undefined;
    const businessUnitId = dto.businessUnitId !== undefined ? await this.resolveLookup("businessUnit", workspaceId, dto.businessUnitId) : undefined;
    const divisionId = dto.divisionId !== undefined ? await this.resolveLookup("division", workspaceId, dto.divisionId) : undefined;
    const locationId = dto.locationId !== undefined ? await this.resolveLookup("location", workspaceId, dto.locationId) : undefined;
    const costCenterId = dto.costCenterId !== undefined ? await this.resolveLookup("costCenter", workspaceId, dto.costCenterId) : undefined;
    const reportingManagerId = dto.reportingManagerId !== undefined ? await this.resolveReportingManager(workspaceId, employeeId, dto.reportingManagerId) : undefined;

    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      include: employeeInclude,
      data: {
        name: dto.name?.trim(),
        fatherOrSpouseName: dto.fatherOrSpouseName !== undefined ? dto.fatherOrSpouseName?.trim() || null : undefined,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth !== undefined ? new Date(dto.dateOfBirth) : undefined,
        phone: dto.phone !== undefined ? dto.phone?.trim() || null : undefined,
        email: dto.email !== undefined ? dto.email?.trim() || null : undefined,
        presentAddress: dto.presentAddress !== undefined ? dto.presentAddress?.trim() || null : undefined,
        permanentAddress: dto.permanentAddress !== undefined ? dto.permanentAddress?.trim() || null : undefined,
        nationalId: dto.nationalId !== undefined ? dto.nationalId?.trim() || null : undefined,
        departmentId,
        designationId,
        gradeId,
        businessUnitId,
        divisionId,
        locationId,
        costCenterId,
        reportingManagerId,
        employmentType: dto.employmentType,
        status: dto.status,
        joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined,
        probationEndDate: dto.probationEndDate !== undefined ? (dto.probationEndDate ? new Date(dto.probationEndDate) : null) : undefined,
        contractEndDate: dto.contractEndDate !== undefined ? (dto.contractEndDate ? new Date(dto.contractEndDate) : null) : undefined,
        resignationDate: dto.resignationDate !== undefined ? (dto.resignationDate ? new Date(dto.resignationDate) : null) : undefined,
        grossSalary: dto.grossSalary === undefined ? undefined : roundMoney(dto.grossSalary),
        salaryComponents,
        pfRate: dto.pfRate,
        paymentMethod: dto.paymentMethod,
        bankName: dto.bankName !== undefined ? dto.bankName?.trim() || null : undefined,
        bankAccountNumber: dto.bankAccountNumber !== undefined ? dto.bankAccountNumber?.trim() || null : undefined,
        mfsProvider: dto.mfsProvider !== undefined ? dto.mfsProvider?.trim() || null : undefined,
        mfsAccountNumber: dto.mfsAccountNumber !== undefined ? dto.mfsAccountNumber?.trim() || null : undefined,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "EMPLOYEE_UPDATED",
      entityType: "Employee",
      entityId: updated.id,
      newValues: { employeeCode: updated.employeeCode, name: updated.name, status: updated.status },
    });

    return updated;
  }

  async deleteEmployee(currentUser: AuthenticatedRequestUser, employeeId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const employee = await this.requireEmployee(workspaceId, employeeId);
    const payslipCount = await this.prisma.payslip.count({ where: { employeeId } });
    if (payslipCount > 0) {
      throw new BadRequestException("This employee already has payroll history and cannot be deleted. Mark them Resigned/Terminated instead.");
    }
    await this.prisma.employee.delete({ where: { id: employeeId } });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "EMPLOYEE_DELETED",
      entityType: "Employee",
      entityId: employeeId,
      oldValues: { employeeCode: employee.employeeCode, name: employee.name },
    });

    return { success: true, id: employeeId };
  }

  // --- Employee Changes ---
  // A dated, human-readable history log (previousValue/newValue are display
  // strings). It does not itself apply the field change to Employee — the
  // caller updates the actual record via updateEmployee separately (usually
  // in the same UI action) and logs the change here for history purposes.

  async listEmployeeChanges(currentUser: AuthenticatedRequestUser, employeeId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    await this.requireEmployee(workspaceId, employeeId);
    return this.prisma.employeeChangeRecord.findMany({
      where: { employeeId },
      orderBy: { effectiveDate: "desc" },
    });
  }

  async createEmployeeChange(currentUser: AuthenticatedRequestUser, dto: CreateEmployeeChangeDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    await this.requireEmployee(workspaceId, dto.employeeId);
    return this.prisma.employeeChangeRecord.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        employeeId: dto.employeeId,
        changeType: dto.changeType,
        effectiveDate: new Date(dto.effectiveDate),
        previousValue: dto.previousValue?.trim() || null,
        newValue: dto.newValue?.trim() || null,
        reason: dto.reason?.trim() || null,
        createdByUserId: currentUser.id,
      },
    });
  }

  // --- Separation & Exit ---
  // One ExitProcess per employee (unique employeeId). Clearance flags are a
  // plain checklist, not an approval workflow; finalSettlementAmount is
  // entered by hand, same as the other manually-computed payroll deductions.

  async getExitProcess(currentUser: AuthenticatedRequestUser, employeeId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    await this.requireEmployee(workspaceId, employeeId);
    return this.prisma.exitProcess.findUnique({ where: { employeeId } });
  }

  async createExitProcess(currentUser: AuthenticatedRequestUser, dto: CreateExitProcessDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    await this.requireEmployee(workspaceId, dto.employeeId);
    const existing = await this.prisma.exitProcess.findUnique({ where: { employeeId: dto.employeeId } });
    if (existing) {
      throw new BadRequestException("An exit process already exists for this employee.");
    }
    return this.prisma.exitProcess.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        employeeId: dto.employeeId,
        separationType: dto.separationType,
        noticeStartDate: dto.noticeStartDate ? new Date(dto.noticeStartDate) : null,
        lastWorkingDate: dto.lastWorkingDate ? new Date(dto.lastWorkingDate) : null,
        createdByUserId: currentUser.id,
      },
    });
  }

  async updateExitProcess(currentUser: AuthenticatedRequestUser, exitProcessId: string, dto: UpdateExitProcessDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const exitProcess = await this.prisma.exitProcess.findUnique({ where: { id: exitProcessId } });
    if (!exitProcess || exitProcess.workspaceId !== workspaceId) {
      throw new NotFoundException("Exit process not found");
    }
    return this.prisma.exitProcess.update({
      where: { id: exitProcessId },
      data: {
        separationType: dto.separationType,
        noticeStartDate: dto.noticeStartDate !== undefined ? (dto.noticeStartDate ? new Date(dto.noticeStartDate) : null) : undefined,
        lastWorkingDate: dto.lastWorkingDate !== undefined ? (dto.lastWorkingDate ? new Date(dto.lastWorkingDate) : null) : undefined,
        departmentClearance: dto.departmentClearance,
        assetClearance: dto.assetClearance,
        financeClearance: dto.financeClearance,
        hrClearance: dto.hrClearance,
        finalSettlementAmount: dto.finalSettlementAmount === undefined ? undefined : roundMoney(dto.finalSettlementAmount),
        exitInterviewNotes: dto.exitInterviewNotes !== undefined ? dto.exitInterviewNotes?.trim() || null : undefined,
        status: dto.status,
      },
    });
  }

  // --- Expense Management ---

  async listExpenseClaims(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.expenseClaim.findMany({
      where: { workspaceId },
      include: { employee: { select: { id: true, employeeCode: true, name: true } } },
      orderBy: { expenseDate: "desc" },
    });
  }

  async createExpenseClaim(currentUser: AuthenticatedRequestUser, dto: CreateExpenseClaimDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    await this.requireEmployee(workspaceId, dto.employeeId);
    return this.prisma.expenseClaim.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        employeeId: dto.employeeId,
        category: dto.category,
        amount: roundMoney(dto.amount),
        expenseDate: new Date(dto.expenseDate),
        description: dto.description?.trim() || null,
        createdByUserId: currentUser.id,
      },
      include: { employee: { select: { id: true, employeeCode: true, name: true } } },
    });
  }

  private async requireExpenseClaim(workspaceId: string, expenseClaimId: string) {
    const claim = await this.prisma.expenseClaim.findUnique({ where: { id: expenseClaimId } });
    if (!claim || claim.workspaceId !== workspaceId) {
      throw new NotFoundException("Expense claim not found");
    }
    return claim;
  }

  async approveExpenseClaim(currentUser: AuthenticatedRequestUser, expenseClaimId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const claim = await this.requireExpenseClaim(workspaceId, expenseClaimId);
    if (claim.status !== "PENDING") {
      throw new BadRequestException("Only a pending expense claim can be approved.");
    }
    return this.prisma.expenseClaim.update({
      where: { id: expenseClaimId },
      data: { status: "APPROVED", decidedByUserId: currentUser.id, decidedAt: new Date() },
      include: { employee: { select: { id: true, employeeCode: true, name: true } } },
    });
  }

  async rejectExpenseClaim(currentUser: AuthenticatedRequestUser, expenseClaimId: string, dto: DecideExpenseClaimDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const claim = await this.requireExpenseClaim(workspaceId, expenseClaimId);
    if (claim.status !== "PENDING") {
      throw new BadRequestException("Only a pending expense claim can be rejected.");
    }
    return this.prisma.expenseClaim.update({
      where: { id: expenseClaimId },
      data: { status: "REJECTED", decidedByUserId: currentUser.id, decidedAt: new Date(), decisionNote: dto.note?.trim() || null },
      include: { employee: { select: { id: true, employeeCode: true, name: true } } },
    });
  }

  async markExpenseReimbursed(currentUser: AuthenticatedRequestUser, expenseClaimId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const claim = await this.requireExpenseClaim(workspaceId, expenseClaimId);
    if (claim.status !== "APPROVED") {
      throw new BadRequestException("Only an approved expense claim can be marked reimbursed.");
    }
    return this.prisma.expenseClaim.update({
      where: { id: expenseClaimId },
      data: { status: "REIMBURSED", reimbursedAt: new Date() },
      include: { employee: { select: { id: true, employeeCode: true, name: true } } },
    });
  }

  async deleteExpenseClaim(currentUser: AuthenticatedRequestUser, expenseClaimId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    await this.requireExpenseClaim(workspaceId, expenseClaimId);
    await this.prisma.expenseClaim.delete({ where: { id: expenseClaimId } });
    return { success: true, id: expenseClaimId };
  }

  // --- Loan & Advance ---
  // remainingBalance is derived on read (principal minus the sum of
  // repayments), never stored — same approach as Leave Balance and the
  // Provident Fund summary.

  async listEmployeeLoans(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const loans = await this.prisma.employeeLoan.findMany({
      where: { workspaceId },
      include: {
        employee: { select: { id: true, employeeCode: true, name: true } },
        repayments: { orderBy: { paidDate: "desc" } },
      },
      orderBy: { applicationDate: "desc" },
    });
    return loans.map((loan) => {
      const principalAmount = roundMoney(loan.principalAmount);
      const totalRepaid = sumMoney(loan.repayments.map((repayment) => repayment.amount));
      return { ...loan, totalRepaid, remainingBalance: roundMoney(principalAmount - totalRepaid) };
    });
  }

  async createEmployeeLoan(currentUser: AuthenticatedRequestUser, dto: CreateEmployeeLoanDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    await this.requireEmployee(workspaceId, dto.employeeId);
    return this.prisma.employeeLoan.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        employeeId: dto.employeeId,
        loanType: dto.loanType,
        principalAmount: roundMoney(dto.principalAmount),
        reason: dto.reason?.trim() || null,
        applicationDate: new Date(dto.applicationDate),
        createdByUserId: currentUser.id,
      },
      include: { employee: { select: { id: true, employeeCode: true, name: true } } },
    });
  }

  private async requireEmployeeLoan(workspaceId: string, loanId: string) {
    const loan = await this.prisma.employeeLoan.findUnique({ where: { id: loanId } });
    if (!loan || loan.workspaceId !== workspaceId) {
      throw new NotFoundException("Loan not found");
    }
    return loan;
  }

  async approveEmployeeLoan(currentUser: AuthenticatedRequestUser, loanId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const loan = await this.requireEmployeeLoan(workspaceId, loanId);
    if (loan.status !== "PENDING") {
      throw new BadRequestException("Only a pending loan can be approved.");
    }
    return this.prisma.employeeLoan.update({
      where: { id: loanId },
      data: { status: "APPROVED", decidedByUserId: currentUser.id, decidedAt: new Date() },
    });
  }

  async rejectEmployeeLoan(currentUser: AuthenticatedRequestUser, loanId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const loan = await this.requireEmployeeLoan(workspaceId, loanId);
    if (loan.status !== "PENDING") {
      throw new BadRequestException("Only a pending loan can be rejected.");
    }
    return this.prisma.employeeLoan.update({
      where: { id: loanId },
      data: { status: "REJECTED", decidedByUserId: currentUser.id, decidedAt: new Date() },
    });
  }

  async disburseEmployeeLoan(currentUser: AuthenticatedRequestUser, loanId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const loan = await this.requireEmployeeLoan(workspaceId, loanId);
    if (loan.status !== "APPROVED") {
      throw new BadRequestException("Only an approved loan can be disbursed.");
    }
    return this.prisma.employeeLoan.update({
      where: { id: loanId },
      data: { status: "DISBURSED", disbursedAt: new Date() },
    });
  }

  async createLoanRepayment(currentUser: AuthenticatedRequestUser, loanId: string, dto: CreateLoanRepaymentDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const loan = await this.requireEmployeeLoan(workspaceId, loanId);
    if (loan.status !== "DISBURSED") {
      throw new BadRequestException("Only a disbursed loan can have repayments recorded against it — it is already fully settled.");
    }

    const existingRepayments = await this.prisma.loanRepayment.findMany({ where: { loanId } });
    const principalAmount = roundMoney(loan.principalAmount);
    const repaymentAmount = roundMoney(dto.amount);
    const alreadyRepaid = sumMoney(existingRepayments.map((repayment) => repayment.amount));
    const remainingBeforeThis = roundMoney(principalAmount - alreadyRepaid);
    if (toPaisa(repaymentAmount) > toPaisa(remainingBeforeThis)) {
      throw new BadRequestException(`This repayment (${repaymentAmount.toFixed(2)}) exceeds the remaining balance (${remainingBeforeThis.toFixed(2)}).`);
    }

    await this.prisma.loanRepayment.create({
      data: {
        loanId,
        amount: repaymentAmount,
        paidDate: new Date(dto.paidDate),
        note: dto.note?.trim() || null,
        createdByUserId: currentUser.id,
      },
    });

    const totalRepaid = sumMoney([alreadyRepaid, repaymentAmount]);
    const remainingBalance = roundMoney(principalAmount - totalRepaid);
    if (toPaisa(remainingBalance) <= 0n) {
      await this.prisma.employeeLoan.update({ where: { id: loanId }, data: { status: "SETTLED" } });
    }

    return { totalRepaid, remainingBalance };
  }

  // --- Recruitment ---

  async listJobOpenings(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.jobOpening.findMany({
      where: { workspaceId },
      include: { department: true, designation: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createJobOpening(currentUser: AuthenticatedRequestUser, dto: CreateJobOpeningDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const departmentId = await this.resolveLookup("department", workspaceId, dto.departmentId);
    const designationId = await this.resolveLookup("designation", workspaceId, dto.designationId);
    return this.prisma.jobOpening.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        title: dto.title.trim(),
        departmentId,
        designationId,
        numberOfPositions: dto.numberOfPositions ?? 1,
        description: dto.description?.trim() || null,
        createdByUserId: currentUser.id,
      },
      include: { department: true, designation: true, _count: { select: { applications: true } } },
    });
  }

  private async requireJobOpening(workspaceId: string, jobOpeningId: string) {
    const jobOpening = await this.prisma.jobOpening.findUnique({ where: { id: jobOpeningId } });
    if (!jobOpening || jobOpening.workspaceId !== workspaceId) {
      throw new NotFoundException("Job opening not found");
    }
    return jobOpening;
  }

  async updateJobOpening(currentUser: AuthenticatedRequestUser, jobOpeningId: string, dto: UpdateJobOpeningDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    await this.requireJobOpening(workspaceId, jobOpeningId);
    const departmentId = dto.departmentId !== undefined ? await this.resolveLookup("department", workspaceId, dto.departmentId) : undefined;
    const designationId = dto.designationId !== undefined ? await this.resolveLookup("designation", workspaceId, dto.designationId) : undefined;
    return this.prisma.jobOpening.update({
      where: { id: jobOpeningId },
      data: {
        title: dto.title?.trim(),
        departmentId,
        designationId,
        numberOfPositions: dto.numberOfPositions,
        description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
        status: dto.status,
      },
      include: { department: true, designation: true, _count: { select: { applications: true } } },
    });
  }

  async listCandidates(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.candidate.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
  }

  async createCandidate(currentUser: AuthenticatedRequestUser, dto: CreateCandidateDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.candidate.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        name: dto.name.trim(),
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        source: dto.source?.trim() || null,
        resumeNote: dto.resumeNote?.trim() || null,
        createdByUserId: currentUser.id,
      },
    });
  }

  async listJobApplications(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.jobApplication.findMany({
      where: { workspaceId },
      include: jobApplicationInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async createJobApplication(currentUser: AuthenticatedRequestUser, dto: CreateJobApplicationDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const candidate = await this.prisma.candidate.findUnique({ where: { id: dto.candidateId } });
    if (!candidate || candidate.workspaceId !== workspaceId) {
      throw new BadRequestException("Candidate not found in this workspace.");
    }
    const jobOpening = await this.requireJobOpening(workspaceId, dto.jobOpeningId);
    if (jobOpening.status !== "OPEN") {
      throw new BadRequestException("This job opening is not open for new applications.");
    }
    const existing = await this.prisma.jobApplication.findUnique({
      where: { candidateId_jobOpeningId: { candidateId: dto.candidateId, jobOpeningId: dto.jobOpeningId } },
    });
    if (existing) {
      throw new BadRequestException("This candidate has already applied to this job opening.");
    }
    try {
      return await this.prisma.jobApplication.create({
        data: {
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          workspaceId,
          candidateId: dto.candidateId,
          jobOpeningId: dto.jobOpeningId,
          appliedDate: new Date(dto.appliedDate),
          createdByUserId: currentUser.id,
        },
        include: jobApplicationInclude,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new BadRequestException("This candidate has already applied to this job opening.");
      }
      throw error;
    }
  }

  async updateJobApplication(currentUser: AuthenticatedRequestUser, jobApplicationId: string, dto: UpdateJobApplicationDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const application = await this.prisma.jobApplication.findUnique({ where: { id: jobApplicationId } });
    if (!application || application.workspaceId !== workspaceId) {
      throw new NotFoundException("Job application not found");
    }
    return this.prisma.jobApplication.update({
      where: { id: jobApplicationId },
      data: {
        stage: dto.stage,
        interviewDate: dto.interviewDate !== undefined ? (dto.interviewDate ? new Date(dto.interviewDate) : null) : undefined,
        interviewNotes: dto.interviewNotes !== undefined ? dto.interviewNotes?.trim() || null : undefined,
        assessmentScore: dto.assessmentScore,
        referenceCheckNotes: dto.referenceCheckNotes !== undefined ? dto.referenceCheckNotes?.trim() || null : undefined,
        offeredSalary: dto.offeredSalary === undefined ? undefined : roundMoney(dto.offeredSalary),
        offerDate: dto.offerDate !== undefined ? (dto.offerDate ? new Date(dto.offerDate) : null) : undefined,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
      },
      include: jobApplicationInclude,
    });
  }

  // --- Onboarding ---
  // Auto-created on first read — every employee has a checklist from day
  // one, no explicit "start onboarding" action needed.

  async getOnboardingChecklist(currentUser: AuthenticatedRequestUser, employeeId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    await this.requireEmployee(workspaceId, employeeId);
    return this.prisma.onboardingChecklist.upsert({
      where: { employeeId },
      update: {},
      create: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        employeeId,
      },
    });
  }

  async updateOnboardingChecklist(currentUser: AuthenticatedRequestUser, employeeId: string, dto: UpdateOnboardingChecklistDto) {
    const checklist = await this.getOnboardingChecklist(currentUser, employeeId);
    return this.prisma.onboardingChecklist.update({
      where: { id: checklist.id },
      data: {
        documentsCollected: dto.documentsCollected,
        joiningFormSubmitted: dto.joiningFormSubmitted,
        idCardIssued: dto.idCardIssued,
        emailAccountCreated: dto.emailAccountCreated,
        accessGranted: dto.accessGranted,
        deviceAllocated: dto.deviceAllocated,
        workspaceAllocated: dto.workspaceAllocated,
        probationReviewDate: dto.probationReviewDate !== undefined ? (dto.probationReviewDate ? new Date(dto.probationReviewDate) : null) : undefined,
        probationReviewNotes: dto.probationReviewNotes !== undefined ? dto.probationReviewNotes?.trim() || null : undefined,
        confirmedAt: dto.confirmed !== undefined ? (dto.confirmed ? new Date() : null) : undefined,
      },
    });
  }

  async listAttendance(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const [records, attendanceShift] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { workspaceId },
        include: { employee: { select: { id: true, employeeCode: true, name: true, department: true, designation: true } } },
        orderBy: [{ attendanceDate: "desc" }, { employee: { name: "asc" } }],
      }),
      this.prisma.shift.findFirst({
        where: { workspaceId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { startTime: true, endTime: true, gracePeriodMinutes: true },
      }),
    ]);

    if (!attendanceShift) return records;

    return records.map((record) => ({
      ...record,
      ...calculateAttendanceDurations(record.checkIn, record.checkOut, attendanceShift),
    }));
  }

  // Every sheet a real customer uploads has different columns and a
  // different way of spelling an employee's identity — some only ever
  // recorded a name (biometric machine exports), some use a staff code.
  // A single bad or unmatched row must not sink the other 4,999, so this
  // resolves and upserts each row independently and reports the casualties
  // instead of throwing.
  async importAttendance(currentUser: AuthenticatedRequestUser, dto: ImportAttendanceDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const attendanceShift = await this.prisma.shift.findFirst({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { startTime: true, endTime: true, gracePeriodMinutes: true },
    });
    const employees = await this.prisma.employee.findMany({
      where: { workspaceId },
      select: { id: true, employeeCode: true, name: true },
    });
    const byCode = new Map(employees.map((employee) => [employee.employeeCode.trim().toLowerCase(), employee]));
    const byName = new Map<string, typeof employees>();
    for (const employee of employees) {
      const key = employee.name.trim().toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), employee]);
    }

    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    let imported = 0;
    const errors: Array<{ row: number; identifier: string; reason: string }> = [];

    for (let index = 0; index < dto.rows.length; index += 1) {
      const row = dto.rows[index];
      const rowNumber = index + 1;
      const identifier = row.employeeCode?.trim() || row.employeeName?.trim() || "(no identifier)";

      let employee: { id: string } | undefined;
      if (row.employeeCode?.trim()) {
        employee = byCode.get(row.employeeCode.trim().toLowerCase());
        if (!employee) {
          errors.push({ row: rowNumber, identifier, reason: `No employee with code "${row.employeeCode.trim()}".` });
          continue;
        }
      } else if (row.employeeName?.trim()) {
        const sheetName = row.employeeName.trim();
        let matches = byName.get(sheetName.toLowerCase()) ?? [];
        if (matches.length === 0) {
          // Biometric device exports frequently truncate to a first name or
          // short label ("Sharif" for "Sharif Uddin") — fall back to a
          // word-token match: every word the sheet gave must appear
          // somewhere in the employee's full name.
          const sheetTokens = tokenize(sheetName);
          matches = employees.filter((employee) => sheetTokens.every((token) => tokenize(employee.name).includes(token)));
        }
        if (matches.length === 0) {
          errors.push({ row: rowNumber, identifier, reason: `No employee named "${sheetName}".` });
          continue;
        }
        if (matches.length > 1) {
          errors.push({ row: rowNumber, identifier, reason: `"${sheetName}" matches more than one employee (${matches.map((m) => m.name).join(", ")}) — use employee code instead.` });
          continue;
        }
        employee = matches[0];
      } else {
        errors.push({ row: rowNumber, identifier, reason: "Missing employee code or name." });
        continue;
      }

      const attendanceDate = new Date(row.date);
      if (Number.isNaN(attendanceDate.getTime())) {
        errors.push({ row: rowNumber, identifier, reason: `Unrecognized date "${row.date}".` });
        continue;
      }

      const checkIn = row.checkIn?.trim() && timePattern.test(row.checkIn.trim()) ? row.checkIn.trim() : null;
      const checkOut = row.checkOut?.trim() && timePattern.test(row.checkOut.trim()) ? row.checkOut.trim() : null;
      const status = row.status ?? (checkIn || checkOut ? "PRESENT" : "ABSENT");
      const calculatedDurations = attendanceShift
        ? calculateAttendanceDurations(checkIn, checkOut, attendanceShift)
        : { lateMinutes: row.lateMinutes ?? 0, overtimeMinutes: row.overtimeMinutes ?? 0 };

      const data = {
        status,
        checkIn,
        checkOut,
        ...calculatedDurations,
        notes: row.notes?.trim() || null,
      };

      try {
        await this.prisma.attendanceRecord.upsert({
          where: { workspaceId_employeeId_attendanceDate: { workspaceId, employeeId: employee.id, attendanceDate } },
          create: {
            ...data,
            tenantId: currentUser.tenantId,
            companyId: currentUser.companyId,
            workspaceId,
            employeeId: employee.id,
            attendanceDate,
            createdByUserId: currentUser.id,
          },
          update: data,
        });
        imported += 1;
      } catch {
        errors.push({ row: rowNumber, identifier, reason: "Could not save this row." });
      }
    }

    return { imported, skipped: errors.length, errors: errors.slice(0, 50) };
  }

  async listPayrollRuns(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.payrollRun.findMany({
      where: { workspaceId },
      include: { payslips: { orderBy: { employeeName: "asc" } } },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    });
  }

  private async requirePayrollRun(workspaceId: string, payrollRunId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: payrollRunId }, include: { payslips: true } });
    if (!run || run.workspaceId !== workspaceId) {
      throw new NotFoundException("Payroll run not found");
    }
    return run;
  }

  // Recomputes every payslip in the run from each employee's live salary
  // structure — safe to call repeatedly while the run is still DRAFT, since a
  // fresh calculation always replaces the previous draft's line items rather
  // than layering on top of them.
  async calculatePayroll(currentUser: AuthenticatedRequestUser, dto: CalculatePayrollDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const employees = await this.prisma.employee.findMany({
      where: { workspaceId, id: { in: dto.entries.map((entry) => entry.employeeId) } },
      include: employeeInclude,
    });
    const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
    if (employeeMap.size === 0) {
      throw new BadRequestException("No valid employees were supplied for this payroll run.");
    }

    return this.prisma.$transaction(async (transaction) => {
      const existingRun = await transaction.payrollRun.findUnique({
        where: { workspaceId_periodYear_periodMonth: { workspaceId, periodYear: dto.periodYear, periodMonth: dto.periodMonth } },
      });
      if (existingRun && existingRun.status !== "DRAFT") {
        throw new BadRequestException("This payroll period is already approved and can no longer be recalculated.");
      }

      const run = await transaction.payrollRun.upsert({
        where: { workspaceId_periodYear_periodMonth: { workspaceId, periodYear: dto.periodYear, periodMonth: dto.periodMonth } },
        update: { totalWorkingDays: dto.totalWorkingDays },
        create: {
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          workspaceId,
          periodYear: dto.periodYear,
          periodMonth: dto.periodMonth,
          totalWorkingDays: dto.totalWorkingDays,
          createdByUserId: currentUser.id,
        },
      });

      await transaction.payslip.deleteMany({ where: { payrollRunId: run.id } });

      let totalGross = 0;
      let totalDeduction = 0;
      let totalNetPayable = 0;
      const workingDays = Number(dto.totalWorkingDays);

      for (const entry of dto.entries) {
        const employee = employeeMap.get(entry.employeeId);
        if (!employee) continue;

        const gross = roundMoney(employee.grossSalary);
        const rawComponents = Array.isArray(employee.salaryComponents) ? (employee.salaryComponents as Array<{ name: string; percent: number }>) : [];
        const components = rawComponents.map((component) => ({
          name: component.name,
          percent: Number(component.percent),
          amount: roundMoney((gross * Number(component.percent)) / 100),
        }));
        if (components.length > 0) {
          const componentResidue = toPaisa(gross) - toPaisa(sumMoney(components.map((component) => component.amount)));
          if (componentResidue !== 0n) {
            const last = components[components.length - 1];
            last.amount = roundMoney(last.amount + Number(componentResidue) / 100);
          }
        }
        const presentDays = Math.min(Math.max(entry.presentDays, 0), workingDays);
        const proratedGross = roundMoney(workingDays > 0 ? (gross * presentDays) / workingDays : 0);
        const basicComponent = rawComponents.find((component) => component.name.trim().toLowerCase() === "basic");
        const fixedBasic = roundMoney(basicComponent ? (gross * Number(basicComponent.percent)) / 100 : gross);
        // PF follows the same two-decimal, half-away-from-zero rule as every
        // other monetary value. Keep the server result aligned with the preview.
        const providentFund = roundMoney((fixedBasic * toNumber(employee.pfRate)) / 100);
        // Employer matches the employee's PF rate 1:1 — a company cost on top of
        // salary, not a deduction from it, so it never touches totalDeduction/netPayable.
        const employerPfContribution = providentFund;
        const iouDeduction = roundMoney(entry.iouDeduction);
        const loanDeduction = roundMoney(entry.loanDeduction);
        const fineDeduction = roundMoney(entry.fineDeduction);
        const lunchBillDeduction = roundMoney(entry.lunchBillDeduction);
        const totalDeductionForEmployee = sumMoney([providentFund, iouDeduction, loanDeduction, fineDeduction, lunchBillDeduction]);
        const netPayable = roundMoney(proratedGross - totalDeductionForEmployee);

        totalGross = sumMoney([totalGross, proratedGross]);
        totalDeduction = sumMoney([totalDeduction, totalDeductionForEmployee]);
        totalNetPayable = sumMoney([totalNetPayable, netPayable]);

        await transaction.payslip.create({
          data: {
            payrollRunId: run.id,
            employeeId: employee.id,
            employeeCode: employee.employeeCode,
            employeeName: employee.name,
            department: employee.department?.name ?? null,
            designation: employee.designation?.name ?? null,
            grossSalary: gross,
            components,
            totalWorkingDays: workingDays,
            presentDays,
            proratedGross,
            providentFund,
            employerPfContribution,
            iouDeduction,
            loanDeduction,
            fineDeduction,
            lunchBillDeduction,
            totalDeduction: totalDeductionForEmployee,
            netPayable,
            paymentMethod: employee.paymentMethod,
          },
        });
      }

      return transaction.payrollRun.update({
        where: { id: run.id },
        data: { totalGross, totalDeduction, totalNetPayable },
        include: { payslips: { orderBy: { employeeName: "asc" } } },
      });
    });
  }

  async deletePayrollRun(currentUser: AuthenticatedRequestUser, payrollRunId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const run = await this.requirePayrollRun(workspaceId, payrollRunId);
    if (run.status !== "DRAFT") {
      throw new BadRequestException("Only a draft payroll run can be deleted.");
    }

    await this.prisma.payrollRun.delete({ where: { id: payrollRunId } });
    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "PAYROLL_DELETED",
      entityType: "PayrollRun",
      entityId: payrollRunId,
      oldValues: {
        periodYear: run.periodYear,
        periodMonth: run.periodMonth,
        totalNetPayable: roundMoney(run.totalNetPayable),
      },
    });

    return { id: payrollRunId };
  }

  async approvePayrollRun(currentUser: AuthenticatedRequestUser, payrollRunId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const run = await this.requirePayrollRun(workspaceId, payrollRunId);
    if (run.status !== "DRAFT") {
      throw new BadRequestException("Only a draft payroll run can be approved.");
    }
    if (run.payslips.length === 0) {
      throw new BadRequestException("Calculate this payroll run before approving it.");
    }
    const approved = await this.prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: { status: "APPROVED", approvedAt: new Date() },
      include: { payslips: { orderBy: { employeeName: "asc" } } },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "PAYROLL_APPROVED",
      entityType: "PayrollRun",
      entityId: payrollRunId,
      newValues: { periodYear: approved.periodYear, periodMonth: approved.periodMonth, totalNetPayable: roundMoney(approved.totalNetPayable) },
    });

    return approved;
  }

  async markPayslipPaid(currentUser: AuthenticatedRequestUser, payslipId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const payslip = await this.prisma.payslip.findUnique({ where: { id: payslipId }, include: { payrollRun: true } });
    if (!payslip || payslip.payrollRun.workspaceId !== workspaceId) {
      throw new NotFoundException("Payslip not found");
    }
    if (payslip.payrollRun.status !== "APPROVED" && payslip.payrollRun.status !== "PAID") {
      throw new ForbiddenException("Approve the payroll run before recording payments.");
    }

    const updated = await this.prisma.payslip.update({
      where: { id: payslipId },
      data: { paymentStatus: "PAID", paidAt: new Date() },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "PAYSLIP_PAID",
      entityType: "Payslip",
      entityId: payslipId,
      newValues: { employeeName: payslip.employeeName, netPayable: roundMoney(payslip.netPayable) },
    });

    const remainingUnpaid = await this.prisma.payslip.count({
      where: { payrollRunId: payslip.payrollRunId, paymentStatus: { not: "PAID" } },
    });
    if (remainingUnpaid === 0) {
      await this.prisma.payrollRun.update({ where: { id: payslip.payrollRunId }, data: { status: "PAID" } });
    }

    return updated;
  }

  // PF balance is always computed live from posted payslips, never stored — the
  // same "no stored balance, derive on read" approach as listLeaveBalances,
  // so a payslip can never drift out of sync with the total it contributed to.
  async getProvidentFundSummary(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const [employees, contributions] = await Promise.all([
      this.prisma.employee.findMany({
        where: { workspaceId },
        include: { ...employeeInclude, company: { select: { name: true } } },
        orderBy: { name: "asc" },
      }),
      this.prisma.payslip.findMany({
        where: { payrollRun: { workspaceId, status: { in: ["APPROVED", "PAID"] } } },
        select: { employeeId: true, providentFund: true, employerPfContribution: true, payrollRun: { select: { periodYear: true, periodMonth: true } } },
      }),
    ]);

    const employeeContributionByEmployee = new Map<string, number>();
    const companyContributionByEmployee = new Map<string, number>();
    const lastPeriodByEmployee = new Map<string, { periodYear: number; periodMonth: number }>();
    for (const contribution of contributions) {
      employeeContributionByEmployee.set(contribution.employeeId, sumMoney([employeeContributionByEmployee.get(contribution.employeeId), contribution.providentFund]));
      companyContributionByEmployee.set(contribution.employeeId, sumMoney([companyContributionByEmployee.get(contribution.employeeId), contribution.employerPfContribution]));
      const lastPeriod = lastPeriodByEmployee.get(contribution.employeeId);
      const thisPeriod = contribution.payrollRun;
      if (!lastPeriod || thisPeriod.periodYear > lastPeriod.periodYear || (thisPeriod.periodYear === lastPeriod.periodYear && thisPeriod.periodMonth > lastPeriod.periodMonth)) {
        lastPeriodByEmployee.set(contribution.employeeId, thisPeriod);
      }
    }

    return employees.map((employee) => {
      const employeeContribution = employeeContributionByEmployee.get(employee.id) ?? 0;
      const companyContribution = companyContributionByEmployee.get(employee.id) ?? 0;
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        employeeName: employee.name,
        companyName: employee.company?.name ?? null,
        department: employee.department?.name ?? null,
        designation: employee.designation?.name ?? null,
        pfRate: employee.pfRate !== null ? toNumber(employee.pfRate) : null,
        employeeContribution,
        companyContribution,
        totalDeposited: sumMoney([employeeContribution, companyContribution]),
        lastContribution: lastPeriodByEmployee.get(employee.id) ?? null,
      };
    });
  }

  // --- Leave Management ---

  async listLeaveTypes(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.leaveType.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  }

  async createLeaveType(currentUser: AuthenticatedRequestUser, dto: CreateLeaveTypeDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const name = dto.name.trim();
    const existing = await this.prisma.leaveType.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
    if (existing) return existing;
    return this.prisma.leaveType.create({
      data: { tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId, name, daysPerYear: dto.daysPerYear },
    });
  }

  async deleteLeaveType(currentUser: AuthenticatedRequestUser, leaveTypeId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType || leaveType.workspaceId !== workspaceId) {
      throw new NotFoundException("Leave type not found");
    }
    const requestCount = await this.prisma.leaveRequest.count({ where: { leaveTypeId } });
    if (requestCount > 0) {
      throw new BadRequestException("This leave type already has requests recorded against it and cannot be deleted.");
    }
    await this.prisma.leaveType.delete({ where: { id: leaveTypeId } });
    return { success: true, id: leaveTypeId };
  }

  async listLeaveRequests(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.leaveRequest.findMany({
      where: { workspaceId },
      include: leaveRequestInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  // A remaining balance is always computed on read from approved requests
  // rather than stored — so a request that's still pending never reserves
  // days, and an edited LeaveType day-count takes effect immediately for
  // every future request.
  private async computeLeaveBalance(workspaceId: string, employeeId: string, leaveTypeId: string, year: number, excludeRequestId?: string) {
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType || leaveType.workspaceId !== workspaceId) {
      throw new BadRequestException("Leave type not found in this workspace.");
    }
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const approved = await this.prisma.leaveRequest.findMany({
      where: {
        workspaceId,
        employeeId,
        leaveTypeId,
        status: "APPROVED",
        startDate: { gte: yearStart, lte: yearEnd },
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      },
    });
    const used = approved.reduce((sum, request) => sum + toNumber(request.totalDays), 0);
    const daysPerYear = toNumber(leaveType.daysPerYear);
    return { leaveType, daysPerYear, used, remaining: daysPerYear - used };
  }

  async listLeaveBalances(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const year = new Date().getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));

    const [employees, leaveTypes, approvedRequests] = await Promise.all([
      this.prisma.employee.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { id: true, employeeCode: true, name: true } }),
      this.prisma.leaveType.findMany({ where: { workspaceId } }),
      this.prisma.leaveRequest.findMany({ where: { workspaceId, status: "APPROVED", startDate: { gte: yearStart, lte: yearEnd } } }),
    ]);

    const usedByKey = new Map<string, number>();
    for (const request of approvedRequests) {
      const key = `${request.employeeId}:${request.leaveTypeId}`;
      usedByKey.set(key, (usedByKey.get(key) ?? 0) + toNumber(request.totalDays));
    }

    return employees.flatMap((employee) =>
      leaveTypes.map((leaveType) => {
        const used = usedByKey.get(`${employee.id}:${leaveType.id}`) ?? 0;
        const daysPerYear = toNumber(leaveType.daysPerYear);
        return {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          employeeName: employee.name,
          leaveTypeId: leaveType.id,
          leaveTypeName: leaveType.name,
          daysPerYear,
          used,
          remaining: daysPerYear - used,
          year,
        };
      }),
    );
  }

  private async requireLeaveRequest(workspaceId: string, leaveRequestId: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id: leaveRequestId }, include: leaveRequestInclude });
    if (!request || request.workspaceId !== workspaceId) {
      throw new NotFoundException("Leave request not found");
    }
    return request;
  }

  async createLeaveRequest(currentUser: AuthenticatedRequestUser, dto: CreateLeaveRequestDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const employee = await this.requireEmployee(workspaceId, dto.employeeId);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException("End date cannot be before start date.");
    }
    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;

    const year = startDate.getUTCFullYear();
    const balance = await this.computeLeaveBalance(workspaceId, employee.id, dto.leaveTypeId, year);
    if (totalDays > balance.remaining) {
      throw new BadRequestException(
        `${employee.name} has ${balance.remaining} day(s) of ${balance.leaveType.name} remaining in ${year}, but this request needs ${totalDays}.`,
      );
    }

    return this.prisma.leaveRequest.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        employeeId: employee.id,
        leaveTypeId: dto.leaveTypeId,
        startDate,
        endDate,
        totalDays,
        reason: dto.reason?.trim() || null,
        createdByUserId: currentUser.id,
      },
      include: leaveRequestInclude,
    });
  }

  async approveLeaveRequest(currentUser: AuthenticatedRequestUser, leaveRequestId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const request = await this.requireLeaveRequest(workspaceId, leaveRequestId);
    if (request.status !== "PENDING") {
      throw new BadRequestException("Only a pending request can be approved.");
    }

    const year = request.startDate.getUTCFullYear();
    const balance = await this.computeLeaveBalance(workspaceId, request.employeeId, request.leaveTypeId, year, request.id);
    if (toNumber(request.totalDays) > balance.remaining) {
      throw new BadRequestException(`Not enough ${request.leaveType.name} balance remaining to approve this request.`);
    }

    const approved = await this.prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "APPROVED", decidedByUserId: currentUser.id, decidedAt: new Date() },
      include: leaveRequestInclude,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "LEAVE_REQUEST_APPROVED",
      entityType: "LeaveRequest",
      entityId: leaveRequestId,
      newValues: { employeeName: approved.employee.name, leaveType: approved.leaveType.name },
    });

    return approved;
  }

  async rejectLeaveRequest(currentUser: AuthenticatedRequestUser, leaveRequestId: string, dto: DecideLeaveRequestDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const request = await this.requireLeaveRequest(workspaceId, leaveRequestId);
    if (request.status !== "PENDING") {
      throw new BadRequestException("Only a pending request can be rejected.");
    }
    const rejected = await this.prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "REJECTED", decidedByUserId: currentUser.id, decidedAt: new Date(), decisionNote: dto.note?.trim() || null },
      include: leaveRequestInclude,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "LEAVE_REQUEST_REJECTED",
      entityType: "LeaveRequest",
      entityId: leaveRequestId,
      newValues: { employeeName: rejected.employee.name, leaveType: rejected.leaveType.name, note: dto.note ?? null },
    });

    return rejected;
  }

  async cancelLeaveRequest(currentUser: AuthenticatedRequestUser, leaveRequestId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const request = await this.requireLeaveRequest(workspaceId, leaveRequestId);
    if (request.status !== "PENDING") {
      throw new BadRequestException("Only a pending request can be cancelled.");
    }
    return this.prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "CANCELLED" },
      include: leaveRequestInclude,
    });
  }

  // --- Shifts & Holidays ---

  async getPayrollSettings(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.payrollSettings.upsert({
      where: { workspaceId },
      update: {},
      create: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        salaryComponents: [
          { name: "Basic", percent: 50 },
          { name: "House Rent", percent: 25 },
          { name: "Medical Allowance", percent: 15 },
          { name: "Conveyance", percent: 10 },
        ],
      },
    });
  }

  async updatePayrollSettings(currentUser: AuthenticatedRequestUser, dto: UpdatePayrollSettingsDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const cycleStartDay = dto.cycleType === "CALENDAR_MONTH" ? 1 : dto.cycleStartDay;
    const salaryComponents = dto.salaryComponents ? normalizeComponents(dto.salaryComponents) : undefined;
    return this.prisma.payrollSettings.upsert({
      where: { workspaceId },
      update: { cycleType: dto.cycleType, cycleStartDay, paymentDay: dto.paymentDay, salaryComponents },
      create: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        cycleType: dto.cycleType,
        cycleStartDay,
        paymentDay: dto.paymentDay,
        salaryComponents: salaryComponents ?? [
          { name: "Basic", percent: 50 },
          { name: "House Rent", percent: 25 },
          { name: "Medical Allowance", percent: 15 },
          { name: "Conveyance", percent: 10 },
        ],
      },
    });
  }

  async listShifts(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.shift.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  }

  async createShift(currentUser: AuthenticatedRequestUser, dto: CreateShiftDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const name = dto.name.trim();
    const existing = await this.prisma.shift.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
    if (existing) return existing;

    return this.prisma.$transaction(async (transaction) => {
      if (dto.isDefault) {
        await transaction.shift.updateMany({ where: { workspaceId, isDefault: true }, data: { isDefault: false } });
      }

      return transaction.shift.create({
        data: {
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          workspaceId,
          name,
          startTime: dto.startTime,
          endTime: dto.endTime,
          gracePeriodMinutes: dto.gracePeriodMinutes ?? 0,
          weeklyOffDays: dto.weeklyOffDays,
          isDefault: dto.isDefault ?? false,
        },
      });
    });
  }

  async deleteShift(currentUser: AuthenticatedRequestUser, shiftId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.workspaceId !== workspaceId) {
      throw new NotFoundException("Shift not found");
    }
    await this.prisma.shift.delete({ where: { id: shiftId } });
    return { success: true, id: shiftId };
  }

  async listHolidays(currentUser: AuthenticatedRequestUser) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    return this.prisma.holiday.findMany({ where: { workspaceId }, orderBy: { date: "asc" } });
  }

  async createHoliday(currentUser: AuthenticatedRequestUser, dto: CreateHolidayDto) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const name = dto.name.trim();
    const date = new Date(dto.date);
    const existing = await this.prisma.holiday.findUnique({ where: { workspaceId_date_name: { workspaceId, date, name } } });
    if (existing) return existing;

    return this.prisma.holiday.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId,
        name,
        date,
        isRecurringYearly: dto.isRecurringYearly ?? false,
      },
    });
  }

  async deleteHoliday(currentUser: AuthenticatedRequestUser, holidayId: string) {
    const workspaceId = this.requireWorkspaceId(currentUser);
    const holiday = await this.prisma.holiday.findUnique({ where: { id: holidayId } });
    if (!holiday || holiday.workspaceId !== workspaceId) {
      throw new NotFoundException("Holiday not found");
    }
    await this.prisma.holiday.delete({ where: { id: holidayId } });
    return { success: true, id: holidayId };
  }
}
