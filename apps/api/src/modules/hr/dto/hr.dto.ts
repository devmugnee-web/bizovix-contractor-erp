import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class NamedLookupDto { @IsString() @MinLength(1) name!: string; }
export class GradeDto extends NamedLookupDto { @IsOptional() @Type(() => Number) @IsInt() level?: number; }

export class SalaryComponentDto {
  @IsString() @MinLength(1) name!: string;
  @Type(() => Number) @IsNumber() @Min(0) percent!: number;
}

export class CreateEmployeeDto {
  @IsOptional() @IsString() employeeCode?: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() fatherOrSpouseName?: string;
  @IsOptional() @IsIn(["MALE", "FEMALE", "OTHER"]) gender?: "MALE" | "FEMALE" | "OTHER";
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() presentAddress?: string;
  @IsOptional() @IsString() permanentAddress?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() designationId?: string;
  @IsOptional() @IsString() gradeId?: string;
  @IsOptional() @IsString() businessUnitId?: string;
  @IsOptional() @IsString() divisionId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() costCenterId?: string;
  @IsOptional() @IsString() reportingManagerId?: string;
  @IsOptional() @IsIn(["PERMANENT", "PROBATION", "CONTRACTUAL", "INTERN"]) employmentType?: "PERMANENT" | "PROBATION" | "CONTRACTUAL" | "INTERN";
  @IsOptional() @IsIn(["ACTIVE", "INACTIVE", "RESIGNED", "TERMINATED"]) status?: "ACTIVE" | "INACTIVE" | "RESIGNED" | "TERMINATED";
  @IsDateString() joiningDate!: string;
  @IsOptional() @IsDateString() probationEndDate?: string;
  @IsOptional() @IsDateString() contractEndDate?: string;
  @Type(() => Number) @IsNumber() @Min(0.01) grossSalary!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SalaryComponentDto) salaryComponents!: SalaryComponentDto[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) pfRate?: number;
  @IsOptional() @IsIn(["CASH", "BANK", "MFS"]) paymentMethod?: "CASH" | "BANK" | "MFS";
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccountNumber?: string;
  @IsOptional() @IsString() mfsProvider?: string;
  @IsOptional() @IsString() mfsAccountNumber?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() fatherOrSpouseName?: string;
  @IsOptional() @IsIn(["MALE", "FEMALE", "OTHER"]) gender?: "MALE" | "FEMALE" | "OTHER";
  @IsOptional() @IsDateString() dateOfBirth?: string | null;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() presentAddress?: string;
  @IsOptional() @IsString() permanentAddress?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() designationId?: string | null;
  @IsOptional() @IsString() gradeId?: string | null;
  @IsOptional() @IsString() businessUnitId?: string | null;
  @IsOptional() @IsString() divisionId?: string | null;
  @IsOptional() @IsString() locationId?: string | null;
  @IsOptional() @IsString() costCenterId?: string | null;
  @IsOptional() @IsString() reportingManagerId?: string | null;
  @IsOptional() @IsIn(["PERMANENT", "PROBATION", "CONTRACTUAL", "INTERN"]) employmentType?: "PERMANENT" | "PROBATION" | "CONTRACTUAL" | "INTERN";
  @IsOptional() @IsIn(["ACTIVE", "INACTIVE", "RESIGNED", "TERMINATED"]) status?: "ACTIVE" | "INACTIVE" | "RESIGNED" | "TERMINATED";
  @IsOptional() @IsDateString() joiningDate?: string;
  @IsOptional() @IsDateString() probationEndDate?: string | null;
  @IsOptional() @IsDateString() contractEndDate?: string | null;
  @IsOptional() @IsDateString() resignationDate?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) grossSalary?: number;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SalaryComponentDto) salaryComponents?: SalaryComponentDto[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) pfRate?: number | null;
  @IsOptional() @IsIn(["CASH", "BANK", "MFS"]) paymentMethod?: "CASH" | "BANK" | "MFS";
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccountNumber?: string;
  @IsOptional() @IsString() mfsProvider?: string;
  @IsOptional() @IsString() mfsAccountNumber?: string;
  @IsOptional() @IsString() notes?: string;
}

export class EmployeeChangeDto {
  @IsString() employeeId!: string;
  @IsIn(["PROMOTION", "TRANSFER", "DEPARTMENT_CHANGE", "DESIGNATION_CHANGE", "GRADE_CHANGE", "SALARY_REVISION", "REPORTING_MANAGER_CHANGE", "LOCATION_CHANGE", "EMPLOYMENT_TYPE_CHANGE"]) changeType!: string;
  @IsDateString() effectiveDate!: string;
  @IsOptional() @IsString() previousValue?: string;
  @IsOptional() @IsString() newValue?: string;
  @IsOptional() @IsString() reason?: string;
}

export class ExitProcessDto {
  @IsString() employeeId!: string;
  @IsIn(["RESIGNATION", "TERMINATION", "RETIREMENT", "CONTRACT_EXPIRY"]) separationType!: string;
  @IsOptional() @IsDateString() noticeStartDate?: string;
  @IsOptional() @IsDateString() lastWorkingDate?: string;
}
export class UpdateExitProcessDto {
  @IsOptional() @IsIn(["RESIGNATION", "TERMINATION", "RETIREMENT", "CONTRACT_EXPIRY"]) separationType?: string;
  @IsOptional() @IsDateString() noticeStartDate?: string;
  @IsOptional() @IsDateString() lastWorkingDate?: string;
  @IsOptional() @IsBoolean() departmentClearance?: boolean;
  @IsOptional() @IsBoolean() assetClearance?: boolean;
  @IsOptional() @IsBoolean() financeClearance?: boolean;
  @IsOptional() @IsBoolean() hrClearance?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) finalSettlementAmount?: number | null;
  @IsOptional() @IsString() exitInterviewNotes?: string | null;
  @IsOptional() @IsIn(["IN_PROGRESS", "COMPLETED"]) status?: string;
}

export class ExpenseClaimDto {
  @IsString() employeeId!: string;
  @IsIn(["TRAVEL", "MEAL", "TRANSPORTATION", "ACCOMMODATION", "OTHER"]) category!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsDateString() expenseDate!: string;
  @IsOptional() @IsString() description?: string;
}
export class DecisionDto { @IsOptional() @IsString() note?: string; }

export class EmployeeLoanDto {
  @IsString() employeeId!: string;
  @IsIn(["LOAN", "SALARY_ADVANCE", "EXPENSE_ADVANCE"]) loanType!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) principalAmount!: number;
  @IsOptional() @IsString() reason?: string;
  @IsDateString() applicationDate!: string;
}
export class LoanRepaymentDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsDateString() paidDate!: string;
  @IsOptional() @IsString() note?: string;
}

export class JobOpeningDto {
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() designationId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) numberOfPositions?: number;
  @IsOptional() @IsString() description?: string;
}
export class UpdateJobOpeningDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() designationId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) numberOfPositions?: number;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(["OPEN", "ON_HOLD", "CLOSED"]) status?: string;
}
export class CandidateDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() resumeNote?: string;
}
export class JobApplicationDto { @IsString() candidateId!: string; @IsString() jobOpeningId!: string; @IsDateString() appliedDate!: string; }
export class UpdateJobApplicationDto {
  @IsOptional() @IsIn(["APPLIED", "SCREENING", "SHORTLISTED", "INTERVIEW", "ASSESSMENT", "REFERENCE_CHECK", "SELECTED", "OFFER_SENT", "OFFER_ACCEPTED", "REJECTED", "WITHDRAWN"]) stage?: string;
  @IsOptional() @IsDateString() interviewDate?: string | null;
  @IsOptional() @IsString() interviewNotes?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) assessmentScore?: number | null;
  @IsOptional() @IsString() referenceCheckNotes?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) offeredSalary?: number | null;
  @IsOptional() @IsDateString() offerDate?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}
export class OnboardingDto {
  @IsOptional() @IsBoolean() documentsCollected?: boolean;
  @IsOptional() @IsBoolean() joiningFormSubmitted?: boolean;
  @IsOptional() @IsBoolean() idCardIssued?: boolean;
  @IsOptional() @IsBoolean() emailAccountCreated?: boolean;
  @IsOptional() @IsBoolean() accessGranted?: boolean;
  @IsOptional() @IsBoolean() deviceAllocated?: boolean;
  @IsOptional() @IsBoolean() workspaceAllocated?: boolean;
  @IsOptional() @IsDateString() probationReviewDate?: string | null;
  @IsOptional() @IsString() probationReviewNotes?: string | null;
  @IsOptional() @IsBoolean() confirmed?: boolean;
}

export class AttendanceRowDto {
  @IsOptional() @IsString() employeeCode?: string;
  @IsOptional() @IsString() employeeName?: string;
  @IsDateString() date!: string;
  @IsOptional() @IsIn(["PRESENT", "ABSENT", "LEAVE", "HOLIDAY"]) status?: string;
  @IsOptional() @IsString() checkIn?: string;
  @IsOptional() @IsString() checkOut?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) lateMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) overtimeMinutes?: number;
  @IsOptional() @IsString() notes?: string;
}
export class ImportAttendanceDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => AttendanceRowDto) rows!: AttendanceRowDto[]; }

export class PayrollEntryDto {
  @IsString() employeeId!: string;
  @Type(() => Number) @IsNumber() @Min(0) presentDays!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) iouDeduction?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) loanDeduction?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fineDeduction?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lunchBillDeduction?: number;
}
export class CalculatePayrollDto {
  @Type(() => Number) @IsInt() @Min(2000) periodYear!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) periodMonth!: number;
  @Type(() => Number) @IsNumber() @Min(1) totalWorkingDays!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PayrollEntryDto) entries!: PayrollEntryDto[];
}

export class LeaveTypeDto { @IsString() @MinLength(1) name!: string; @Type(() => Number) @IsNumber() @Min(0) daysPerYear!: number; }
export class LeaveRequestDto {
  @IsString() employeeId!: string;
  @IsString() leaveTypeId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsString() reason?: string;
}
export class PayrollSettingsDto {
  @IsIn(["CALENDAR_MONTH", "CUSTOM_CUTOFF"]) cycleType!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(28) cycleStartDay!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(28) paymentDay!: number;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SalaryComponentDto) salaryComponents?: SalaryComponentDto[];
}
export class ShiftDto {
  @IsString() name!: string;
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/) endTime!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(180) gracePeriodMinutes?: number;
  @IsArray() @ArrayUnique() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weeklyOffDays!: number[];
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
export class HolidayDto { @IsString() name!: string; @IsDateString() date!: string; @IsOptional() @IsBoolean() isRecurringYearly?: boolean; }
