export type Gender = "MALE" | "FEMALE" | "OTHER";
export type EmploymentType = "PERMANENT" | "PROBATION" | "CONTRACTUAL" | "INTERN";
export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "RESIGNED" | "TERMINATED";
export type SalaryPaymentMethod = "CASH" | "BANK" | "MFS";
export type PayrollRunStatus = "DRAFT" | "APPROVED" | "PAID";
export type PayslipPaymentStatus = "PENDING" | "PAID";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LEAVE" | "HOLIDAY";

export interface SalaryComponent {
  name: string;
  percent: number;
}

export interface PayslipComponent extends SalaryComponent {
  amount: number;
}

export interface DepartmentRecord {
  id: string;
  name: string;
}

export interface DesignationRecord {
  id: string;
  name: string;
}

export interface GradeRecord {
  id: string;
  name: string;
  level: number | null;
}

export interface BusinessUnitRecord {
  id: string;
  name: string;
}

export interface DivisionRecord {
  id: string;
  name: string;
}

export interface LocationRecord {
  id: string;
  name: string;
}

export interface CostCenterRecord {
  id: string;
  name: string;
}

export interface EmployeeRecord {
  id: string;
  employeeCode: string;
  name: string;
  fatherOrSpouseName: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  presentAddress: string | null;
  permanentAddress: string | null;
  nationalId: string | null;
  departmentId: string | null;
  designationId: string | null;
  gradeId: string | null;
  businessUnitId: string | null;
  divisionId: string | null;
  locationId: string | null;
  costCenterId: string | null;
  reportingManagerId: string | null;
  department: DepartmentRecord | null;
  designation: DesignationRecord | null;
  grade: GradeRecord | null;
  businessUnit: BusinessUnitRecord | null;
  division: DivisionRecord | null;
  location: LocationRecord | null;
  costCenter: CostCenterRecord | null;
  reportingManager: { id: string; name: string; employeeCode: string } | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  joiningDate: string;
  probationEndDate: string | null;
  contractEndDate: string | null;
  resignationDate: string | null;
  grossSalary: string;
  salaryComponents: SalaryComponent[];
  pfRate: string | null;
  paymentMethod: SalaryPaymentMethod;
  bankName: string | null;
  bankAccountNumber: string | null;
  mfsProvider: string | null;
  mfsAccountNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceImportRow {
  employeeCode?: string;
  employeeName?: string;
  date: string;
  status?: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  lateMinutes?: number;
  overtimeMinutes?: number;
  notes?: string;
}

export interface AttendanceImportError {
  row: number;
  identifier: string;
  reason: string;
}

export interface AttendanceImportResult {
  imported: number;
  skipped: number;
  errors: AttendanceImportError[];
}

export interface AttendanceRecord {
  id: string;
  attendanceDate: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  notes: string | null;
  employee: Pick<EmployeeRecord, "id" | "employeeCode" | "name" | "department" | "designation">;
}

export interface CreateEmployeeInput {
  employeeCode?: string;
  name: string;
  fatherOrSpouseName?: string;
  gender?: Gender;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  presentAddress?: string;
  permanentAddress?: string;
  nationalId?: string;
  departmentId?: string;
  designationId?: string;
  gradeId?: string;
  businessUnitId?: string;
  divisionId?: string;
  locationId?: string;
  costCenterId?: string;
  reportingManagerId?: string;
  employmentType?: EmploymentType;
  status?: EmployeeStatus;
  joiningDate: string;
  probationEndDate?: string;
  contractEndDate?: string;
  grossSalary: number;
  salaryComponents: SalaryComponent[];
  pfRate?: number;
  paymentMethod?: SalaryPaymentMethod;
  bankName?: string;
  bankAccountNumber?: string;
  mfsProvider?: string;
  mfsAccountNumber?: string;
  notes?: string;
}

type NullableEmployeeLookupFields =
  | "departmentId"
  | "designationId"
  | "gradeId"
  | "businessUnitId"
  | "divisionId"
  | "locationId"
  | "costCenterId"
  | "reportingManagerId"
  | "pfRate"
  | "probationEndDate"
  | "contractEndDate";

export type UpdateEmployeeInput = Omit<Partial<CreateEmployeeInput>, NullableEmployeeLookupFields> & {
  departmentId?: string | null;
  designationId?: string | null;
  gradeId?: string | null;
  businessUnitId?: string | null;
  divisionId?: string | null;
  locationId?: string | null;
  costCenterId?: string | null;
  reportingManagerId?: string | null;
  resignationDate?: string | null;
  probationEndDate?: string | null;
  contractEndDate?: string | null;
  pfRate?: number | null;
};

export interface PayslipRecord {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string | null;
  designation: string | null;
  grossSalary: string;
  components: PayslipComponent[];
  totalWorkingDays: string;
  presentDays: string;
  proratedGross: string;
  providentFund: string;
  employerPfContribution: string;
  iouDeduction: string;
  loanDeduction: string;
  fineDeduction: string;
  lunchBillDeduction: string;
  totalDeduction: string;
  netPayable: string;
  paymentMethod: SalaryPaymentMethod;
  paymentStatus: PayslipPaymentStatus;
  paidAt: string | null;
}

export interface PayrollRunRecord {
  id: string;
  periodYear: number;
  periodMonth: number;
  totalWorkingDays: string;
  status: PayrollRunStatus;
  totalGross: string;
  totalDeduction: string;
  totalNetPayable: string;
  approvedAt: string | null;
  createdAt: string;
  payslips: PayslipRecord[];
}

export interface PayrollEntryInput {
  employeeId: string;
  presentDays: number;
  iouDeduction?: number;
  loanDeduction?: number;
  fineDeduction?: number;
  lunchBillDeduction?: number;
}

export interface CalculatePayrollInput {
  periodYear: number;
  periodMonth: number;
  totalWorkingDays: number;
  entries: PayrollEntryInput[];
}

export interface ProvidentFundSummaryRecord {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  companyName: string | null;
  department: string | null;
  designation: string | null;
  pfRate: number | null;
  employeeContribution: number;
  companyContribution: number;
  totalDeposited: number;
  lastContribution: { periodYear: number; periodMonth: number } | null;
}

export type LeaveRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface LeaveTypeRecord {
  id: string;
  name: string;
  daysPerYear: string;
}

export interface LeaveRequestRecord {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalDays: string;
  reason: string | null;
  status: LeaveRequestStatus;
  decidedByUserId: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  employee: Pick<EmployeeRecord, "id" | "employeeCode" | "name">;
  leaveType: LeaveTypeRecord;
}

export interface LeaveBalance {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  daysPerYear: number;
  used: number;
  remaining: number;
  year: number;
}

export type EmployeeChangeType =
  | "PROMOTION"
  | "TRANSFER"
  | "DEPARTMENT_CHANGE"
  | "DESIGNATION_CHANGE"
  | "GRADE_CHANGE"
  | "SALARY_REVISION"
  | "REPORTING_MANAGER_CHANGE"
  | "LOCATION_CHANGE"
  | "EMPLOYMENT_TYPE_CHANGE";

export interface EmployeeChangeRecord {
  id: string;
  employeeId: string;
  changeType: EmployeeChangeType;
  effectiveDate: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
}

export interface CreateEmployeeChangeInput {
  employeeId: string;
  changeType: EmployeeChangeType;
  effectiveDate: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
}

export type SeparationType = "RESIGNATION" | "TERMINATION" | "RETIREMENT" | "CONTRACT_EXPIRY";
export type ExitProcessStatus = "IN_PROGRESS" | "COMPLETED";

export interface ExitProcessRecord {
  id: string;
  employeeId: string;
  separationType: SeparationType;
  noticeStartDate: string | null;
  lastWorkingDate: string | null;
  departmentClearance: boolean;
  assetClearance: boolean;
  financeClearance: boolean;
  hrClearance: boolean;
  finalSettlementAmount: string | null;
  exitInterviewNotes: string | null;
  status: ExitProcessStatus;
}

export interface CreateExitProcessInput {
  employeeId: string;
  separationType: SeparationType;
  noticeStartDate?: string;
  lastWorkingDate?: string;
}

export interface UpdateExitProcessInput {
  separationType?: SeparationType;
  noticeStartDate?: string | null;
  lastWorkingDate?: string | null;
  departmentClearance?: boolean;
  assetClearance?: boolean;
  financeClearance?: boolean;
  hrClearance?: boolean;
  finalSettlementAmount?: number | null;
  exitInterviewNotes?: string | null;
  status?: ExitProcessStatus;
}

export interface CreateLeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface ShiftRecord {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  gracePeriodMinutes: number;
  weeklyOffDays: number[];
  isDefault: boolean;
}

export interface PayrollSettingsRecord {
  id: string;
  cycleType: "CALENDAR_MONTH" | "CUSTOM_CUTOFF";
  cycleStartDay: number;
  paymentDay: number;
  salaryComponents: SalaryComponent[];
}

export interface UpdatePayrollSettingsInput {
  cycleType: "CALENDAR_MONTH" | "CUSTOM_CUTOFF";
  cycleStartDay: number;
  paymentDay: number;
  salaryComponents?: SalaryComponent[];
}

export interface CreateShiftInput {
  name: string;
  startTime: string;
  endTime: string;
  gracePeriodMinutes?: number;
  weeklyOffDays: number[];
  isDefault?: boolean;
}

export interface HolidayRecord {
  id: string;
  name: string;
  date: string;
  isRecurringYearly: boolean;
}

export interface CreateHolidayInput {
  name: string;
  date: string;
  isRecurringYearly?: boolean;
}

export type ExpenseCategory = "TRAVEL" | "MEAL" | "TRANSPORTATION" | "ACCOMMODATION" | "OTHER";
export type ExpenseStatus = "PENDING" | "APPROVED" | "REJECTED" | "REIMBURSED";

export interface ExpenseClaimRecord {
  id: string;
  employeeId: string;
  employee: { id: string; employeeCode: string; name: string };
  category: ExpenseCategory;
  amount: string;
  expenseDate: string;
  description: string | null;
  status: ExpenseStatus;
  decisionNote: string | null;
  reimbursedAt: string | null;
  createdAt: string;
}

export interface CreateExpenseClaimInput {
  employeeId: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  description?: string;
}

export type EmployeeLoanType = "LOAN" | "SALARY_ADVANCE" | "EXPENSE_ADVANCE";
export type EmployeeLoanStatus = "PENDING" | "APPROVED" | "REJECTED" | "DISBURSED" | "SETTLED";

export interface LoanRepaymentRecord {
  id: string;
  loanId: string;
  amount: string;
  paidDate: string;
  note: string | null;
  createdAt: string;
}

export interface EmployeeLoanRecord {
  id: string;
  employeeId: string;
  employee: { id: string; employeeCode: string; name: string };
  loanType: EmployeeLoanType;
  principalAmount: string;
  reason: string | null;
  applicationDate: string;
  status: EmployeeLoanStatus;
  disbursedAt: string | null;
  repayments: LoanRepaymentRecord[];
  totalRepaid: number;
  remainingBalance: number;
  createdAt: string;
}

export interface CreateEmployeeLoanInput {
  employeeId: string;
  loanType: EmployeeLoanType;
  principalAmount: number;
  reason?: string;
  applicationDate: string;
}

export interface CreateLoanRepaymentInput {
  amount: number;
  paidDate: string;
  note?: string;
}

export type JobOpeningStatus = "OPEN" | "ON_HOLD" | "CLOSED";

export interface JobOpeningRecord {
  id: string;
  title: string;
  departmentId: string | null;
  designationId: string | null;
  department: DepartmentRecord | null;
  designation: DesignationRecord | null;
  numberOfPositions: number;
  status: JobOpeningStatus;
  description: string | null;
  _count: { applications: number };
  createdAt: string;
}

export interface CreateJobOpeningInput {
  title: string;
  departmentId?: string;
  designationId?: string;
  numberOfPositions?: number;
  description?: string;
}

export interface UpdateJobOpeningInput {
  title?: string;
  departmentId?: string | null;
  designationId?: string | null;
  numberOfPositions?: number;
  description?: string | null;
  status?: JobOpeningStatus;
}

export interface CandidateRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  resumeNote: string | null;
  createdAt: string;
}

export interface CreateCandidateInput {
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  resumeNote?: string;
}

export type ApplicationStage =
  | "APPLIED"
  | "SCREENING"
  | "SHORTLISTED"
  | "INTERVIEW"
  | "ASSESSMENT"
  | "REFERENCE_CHECK"
  | "SELECTED"
  | "OFFER_SENT"
  | "OFFER_ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN";

export interface JobApplicationRecord {
  id: string;
  candidateId: string;
  jobOpeningId: string;
  candidate: CandidateRecord;
  jobOpening: JobOpeningRecord;
  stage: ApplicationStage;
  appliedDate: string;
  interviewDate: string | null;
  interviewNotes: string | null;
  assessmentScore: string | null;
  referenceCheckNotes: string | null;
  offeredSalary: string | null;
  offerDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateJobApplicationInput {
  candidateId: string;
  jobOpeningId: string;
  appliedDate: string;
}

export interface UpdateJobApplicationInput {
  stage?: ApplicationStage;
  interviewDate?: string | null;
  interviewNotes?: string | null;
  assessmentScore?: number | null;
  referenceCheckNotes?: string | null;
  offeredSalary?: number | null;
  offerDate?: string | null;
  notes?: string | null;
}

export interface OnboardingChecklistRecord {
  id: string;
  employeeId: string;
  documentsCollected: boolean;
  joiningFormSubmitted: boolean;
  idCardIssued: boolean;
  emailAccountCreated: boolean;
  accessGranted: boolean;
  deviceAllocated: boolean;
  workspaceAllocated: boolean;
  probationReviewDate: string | null;
  probationReviewNotes: string | null;
  confirmedAt: string | null;
}

export interface UpdateOnboardingChecklistInput {
  documentsCollected?: boolean;
  joiningFormSubmitted?: boolean;
  idCardIssued?: boolean;
  emailAccountCreated?: boolean;
  accessGranted?: boolean;
  deviceAllocated?: boolean;
  workspaceAllocated?: boolean;
  probationReviewDate?: string | null;
  probationReviewNotes?: string | null;
  confirmed?: boolean;
}
