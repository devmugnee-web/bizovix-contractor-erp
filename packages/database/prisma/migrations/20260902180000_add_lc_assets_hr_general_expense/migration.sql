-- CreateEnum
CREATE TYPE "ExpenseNature" AS ENUM ('DIRECT', 'INDIRECT');

-- CreateEnum
CREATE TYPE "ExpensePaymentMode" AS ENUM ('CASH_BANK', 'PAYABLE');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "AssetOperationalStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'ACTIVE', 'UNDER_MAINTENANCE', 'DAMAGED', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetAcquisitionType" AS ENUM ('DIRECT_PURCHASE', 'PURCHASE_ORDER', 'OPENING_ASSET', 'DONATION', 'TRANSFER_IN', 'INTERNALLY_CONSTRUCTED', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetFundingMode" AS ENUM ('CASH_BANK', 'CREDIT', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "FixedAssetDepreciationMethod" AS ENUM ('STRAIGHT_LINE');

-- CreateEnum
CREATE TYPE "FixedAssetStatus" AS ENUM ('ACTIVE', 'DISPOSED', 'FULLY_DEPRECIATED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'PROBATION', 'CONTRACTUAL', 'INTERN');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "SalaryPaymentMethod" AS ENUM ('CASH', 'BANK', 'MFS');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "PayslipPaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmployeeChangeType" AS ENUM ('PROMOTION', 'TRANSFER', 'DEPARTMENT_CHANGE', 'DESIGNATION_CHANGE', 'GRADE_CHANGE', 'SALARY_REVISION', 'REPORTING_MANAGER_CHANGE', 'LOCATION_CHANGE', 'EMPLOYMENT_TYPE_CHANGE');

-- CreateEnum
CREATE TYPE "SeparationType" AS ENUM ('RESIGNATION', 'TERMINATION', 'RETIREMENT', 'CONTRACT_EXPIRY');

-- CreateEnum
CREATE TYPE "ExitProcessStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "HrExpenseCategory" AS ENUM ('TRAVEL', 'MEAL', 'TRANSPORTATION', 'ACCOMMODATION', 'OTHER');

-- CreateEnum
CREATE TYPE "HrExpenseClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REIMBURSED');

-- CreateEnum
CREATE TYPE "EmployeeLoanType" AS ENUM ('LOAN', 'SALARY_ADVANCE', 'EXPENSE_ADVANCE');

-- CreateEnum
CREATE TYPE "EmployeeLoanStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISBURSED', 'SETTLED');

-- CreateEnum
CREATE TYPE "JobOpeningStatus" AS ENUM ('OPEN', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('APPLIED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'ASSESSMENT', 'REFERENCE_CHECK', 'SELECTED', 'OFFER_SENT', 'OFFER_ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LcStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COSTING_PENDING', 'ALLOCATION_PENDING', 'READY_TO_FINALIZE', 'FINALIZED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LcCostCategory" AS ENUM ('LC_BANKING', 'ORIGIN', 'FREIGHT', 'INSURANCE', 'CUSTOMS', 'TAX', 'CNF', 'PORT', 'DESTINATION_TRANSPORT', 'LOCAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LcAllocationBasis" AS ENUM ('PURCHASE_VALUE', 'USD_VALUE', 'QUANTITY', 'WEIGHT', 'CBM', 'EQUAL');

-- CreateEnum
CREATE TYPE "LcAllocationMode" AS ENUM ('AUTO', 'MANUAL_AMOUNT', 'MANUAL_PERCENTAGE', 'HYBRID', 'DIRECT_PRODUCT');

-- CreateEnum
CREATE TYPE "LcLandedCostStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateEnum
CREATE TYPE "LcProfitMode" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('LC_RECEIPT', 'LC_REVERSAL', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- AlterTable
ALTER TABLE "expense_heads" ADD COLUMN     "ledgerAccountId" TEXT,
ADD COLUMN     "nature" "ExpenseNature" NOT NULL DEFAULT 'INDIRECT';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "expenseLedgerAccountId" TEXT,
ADD COLUMN     "expenseNature" "ExpenseNature" NOT NULL DEFAULT 'INDIRECT',
ADD COLUMN     "payableId" TEXT,
ADD COLUMN     "payablePartyId" TEXT,
ADD COLUMN     "paymentMode" "ExpensePaymentMode" NOT NULL DEFAULT 'CASH_BANK';

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "defaultUsefulLifeMonths" INTEGER,
    "defaultSalvageValue" DECIMAL(18,4),
    "defaultDepreciationMethod" "FixedAssetDepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "assetLedgerId" TEXT,
    "accumulatedDepreciationLedgerId" TEXT,
    "depreciationExpenseLedgerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetLedgerId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "categoryId" TEXT,
    "supplierId" TEXT,
    "fundingMode" "AssetFundingMode" NOT NULL DEFAULT 'CASH_BANK',
    "fundingBankAccountId" TEXT,
    "payableId" TEXT,
    "acquisitionJournalId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "location" TEXT,
    "department" TEXT,
    "assignedToName" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "manufacturer" TEXT,
    "serialNumber" TEXT,
    "registrationNumber" TEXT,
    "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
    "operationalStatus" "AssetOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
    "acquisitionType" "AssetAcquisitionType" NOT NULL DEFAULT 'DIRECT_PURCHASE',
    "notes" TEXT,
    "purchaseDate" DATE NOT NULL,
    "purchaseCost" DECIMAL(18,4) NOT NULL,
    "transportationCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "installationCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "importDuty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "registrationCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "otherCapitalizedCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "capitalizedCost" DECIMAL(18,4) NOT NULL,
    "salvageValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" "FixedAssetDepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "useManualDepreciation" BOOLEAN NOT NULL DEFAULT false,
    "manualDepreciationAmount" DECIMAL(18,4),
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "disposalDate" DATE,
    "disposalProceeds" DECIMAL(18,4),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset_depreciation_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fixedAssetId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "postedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_asset_depreciation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_departments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_designations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_grades" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_business_units" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_business_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_divisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_locations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_cost_centers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employees" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fatherOrSpouseName" TEXT,
    "gender" "Gender",
    "dateOfBirth" DATE,
    "phone" TEXT,
    "email" TEXT,
    "presentAddress" TEXT,
    "permanentAddress" TEXT,
    "nationalId" TEXT,
    "departmentId" TEXT,
    "designationId" TEXT,
    "gradeId" TEXT,
    "businessUnitId" TEXT,
    "divisionId" TEXT,
    "locationId" TEXT,
    "costCenterId" TEXT,
    "reportingManagerId" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'PERMANENT',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "joiningDate" DATE NOT NULL,
    "probationEndDate" DATE,
    "contractEndDate" DATE,
    "resignationDate" DATE,
    "grossSalary" DECIMAL(18,4) NOT NULL,
    "salaryComponents" JSONB NOT NULL,
    "pfRate" DECIMAL(5,2),
    "paymentMethod" "SalaryPaymentMethod" NOT NULL DEFAULT 'CASH',
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "mfsProvider" TEXT,
    "mfsAccountNumber" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_attendance_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "checkIn" TEXT,
    "checkOut" TEXT,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_payroll_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "totalWorkingDays" DECIMAL(5,2) NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "totalGross" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalNetPayable" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_payslips" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "department" TEXT,
    "designation" TEXT,
    "grossSalary" DECIMAL(18,4) NOT NULL,
    "components" JSONB NOT NULL,
    "totalWorkingDays" DECIMAL(5,2) NOT NULL,
    "presentDays" DECIMAL(5,2) NOT NULL,
    "proratedGross" DECIMAL(18,4) NOT NULL,
    "providentFund" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "employerPfContribution" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iouDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "loanDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "fineDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lunchBillDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(18,4) NOT NULL,
    "paymentMethod" "SalaryPaymentMethod" NOT NULL,
    "paymentStatus" "PayslipPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "daysPerYear" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "totalDays" DECIMAL(5,2) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_shifts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 0,
    "weeklyOffDays" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_payroll_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleType" TEXT NOT NULL DEFAULT 'CALENDAR_MONTH',
    "cycleStartDay" INTEGER NOT NULL DEFAULT 1,
    "paymentDay" INTEGER NOT NULL DEFAULT 1,
    "salaryComponents" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_payroll_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_holidays" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isRecurringYearly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employee_change_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "changeType" "EmployeeChangeType" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_employee_change_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_exit_processes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "separationType" "SeparationType" NOT NULL,
    "noticeStartDate" DATE,
    "lastWorkingDate" DATE,
    "departmentClearance" BOOLEAN NOT NULL DEFAULT false,
    "assetClearance" BOOLEAN NOT NULL DEFAULT false,
    "financeClearance" BOOLEAN NOT NULL DEFAULT false,
    "hrClearance" BOOLEAN NOT NULL DEFAULT false,
    "finalSettlementAmount" DECIMAL(18,4),
    "exitInterviewNotes" TEXT,
    "status" "ExitProcessStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_exit_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_expense_claims" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" "HrExpenseCategory" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "expenseDate" DATE NOT NULL,
    "description" TEXT,
    "status" "HrExpenseClaimStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "reimbursedAt" TIMESTAMP(3),
    "reimbursedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_expense_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employee_loans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "loanType" "EmployeeLoanType" NOT NULL,
    "principalAmount" DECIMAL(18,4) NOT NULL,
    "reason" TEXT,
    "applicationDate" DATE NOT NULL,
    "status" "EmployeeLoanStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_employee_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_loan_repayments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "paidDate" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_loan_repayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_job_openings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" TEXT,
    "designationId" TEXT,
    "numberOfPositions" INTEGER NOT NULL DEFAULT 1,
    "status" "JobOpeningStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_candidates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "resumeNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_job_applications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobOpeningId" TEXT NOT NULL,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'APPLIED',
    "appliedDate" DATE NOT NULL,
    "interviewDate" TIMESTAMP(3),
    "interviewNotes" TEXT,
    "assessmentScore" DECIMAL(5,2),
    "referenceCheckNotes" TEXT,
    "offeredSalary" DECIMAL(18,4),
    "offerDate" DATE,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_onboarding_checklists" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "documentsCollected" BOOLEAN NOT NULL DEFAULT false,
    "joiningFormSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "idCardIssued" BOOLEAN NOT NULL DEFAULT false,
    "emailAccountCreated" BOOLEAN NOT NULL DEFAULT false,
    "accessGranted" BOOLEAN NOT NULL DEFAULT false,
    "deviceAllocated" BOOLEAN NOT NULL DEFAULT false,
    "workspaceAllocated" BOOLEAN NOT NULL DEFAULT false,
    "probationReviewDate" DATE,
    "probationReviewNotes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_onboarding_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(24,6) NOT NULL,
    "totalCost" DECIMAL(24,6) NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "referenceNo" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_masters" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lcNumber" TEXT NOT NULL,
    "lcDate" DATE NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT NOT NULL,
    "supplierCountry" TEXT,
    "purchaseOrderRef" TEXT,
    "piReference" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "lcType" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" DECIMAL(18,6) NOT NULL,
    "incoterm" TEXT,
    "originCountry" TEXT,
    "originPort" TEXT,
    "destinationPort" TEXT,
    "destinationWarehouseId" TEXT,
    "lastShipmentDate" DATE,
    "expiryDate" DATE,
    "remarks" TEXT,
    "purchasePaymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "purchasePaidAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paymentReference" TEXT,
    "paymentAllocations" JSONB,
    "purchaseJournalId" TEXT,
    "purchasePayableId" TEXT,
    "purchasePostingVersion" INTEGER NOT NULL DEFAULT 1,
    "paymentJournalIds" JSONB,
    "status" "LcStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lc_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_status_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "fromStatus" "LcStatus",
    "toStatus" "LcStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lc_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "itemId" TEXT,
    "productName" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "quantity" DECIMAL(18,4) NOT NULL,
    "foreignUnitPrice" DECIMAL(18,4) NOT NULL,
    "exchangeRate" DECIMAL(18,6) NOT NULL,
    "calculatedBdtUnitPrice" DECIMAL(18,4) NOT NULL,
    "acceptedBdtUnitPrice" DECIMAL(18,4),
    "totalPurchaseCostBdt" DECIMAL(18,4) NOT NULL,
    "weight" DECIMAL(18,4),
    "cbm" DECIMAL(18,4),
    "hsCode" TEXT,
    "receivedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "landedCostAmount" DECIMAL(18,4),
    "landedCostPerUnit" DECIMAL(18,4),
    "profitMode" "LcProfitMode",
    "profitValue" DECIMAL(18,4),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lc_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_inventory_postings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "lcItemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(24,6) NOT NULL,
    "totalCost" DECIMAL(24,6) NOT NULL,
    "postedById" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lc_inventory_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_shipments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "transportMode" TEXT DEFAULT 'SEA',
    "shipmentNumber" TEXT,
    "blAwbNumber" TEXT,
    "etd" DATE,
    "eta" DATE,
    "containerNumber" TEXT,
    "forwarderName" TEXT,
    "shippingLine" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lc_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_cost_heads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "LcCostCategory" NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'BDT',
    "defaultAllocationMethod" "LcAllocationBasis" NOT NULL DEFAULT 'PURCHASE_VALUE',
    "fallbackAllocationMethod" "LcAllocationBasis",
    "recommendedAllocationMode" "LcAllocationMode",
    "includeInLandedCost" BOOLEAN NOT NULL DEFAULT true,
    "manualOverrideAllowed" BOOLEAN NOT NULL DEFAULT true,
    "glAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lc_cost_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_cost_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "costHeadId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "vendorName" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "foreignAmount" DECIMAL(18,4),
    "exchangeRate" DECIMAL(18,6),
    "bdtAmount" DECIMAL(18,4) NOT NULL,
    "allocationMode" "LcAllocationMode" NOT NULL DEFAULT 'AUTO',
    "allocationBasis" "LcAllocationBasis",
    "includeInLandedCost" BOOLEAN NOT NULL DEFAULT true,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "remarks" TEXT,
    "paymentMethod" TEXT,
    "paidFromAccountId" TEXT,
    "creditPayeeName" TEXT,
    "paymentAllocations" JSONB,
    "paymentJournalId" TEXT,
    "payableId" TEXT,
    "postingVersion" INTEGER NOT NULL DEFAULT 1,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lc_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_cost_allocations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "costEntryId" TEXT NOT NULL,
    "lcItemId" TEXT NOT NULL,
    "basisValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "basisPercentage" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "autoSuggestedAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "manualAmount" DECIMAL(18,4),
    "finalAmount" DECIMAL(18,4) NOT NULL,
    "isDirect" BOOLEAN NOT NULL DEFAULT false,
    "isOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "originalMode" "LcAllocationMode",
    "originalBasis" "LcAllocationBasis",
    "originalAutoAmount" DECIMAL(18,4),
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lc_cost_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_grns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "receivedDate" DATE NOT NULL,
    "warehouseId" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lc_grns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_grn_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "lcItemId" TEXT NOT NULL,
    "expectedQuantity" DECIMAL(18,4) NOT NULL,
    "receivedQuantity" DECIMAL(18,4) NOT NULL,
    "shortQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "excessQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "damagedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lc_grn_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_landed_costs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "purchaseCostTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "importCostTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "landedCostTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "allocationDifference" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "LcLandedCostStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "journalEntryId" TEXT,
    "postingVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lc_landed_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lc_landed_cost_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "landedCostId" TEXT NOT NULL,
    "lcItemId" TEXT NOT NULL,
    "purchaseCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lcBankingCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "originCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "freightCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "insuranceCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "customsCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cnfCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "portCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "destinationTransportCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "localCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalLandedCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "receivedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitLandedCost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "lc_landed_cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_categories_organizationId_isActive_idx" ON "asset_categories"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "asset_categories_parentId_idx" ON "asset_categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_organizationId_code_key" ON "asset_categories"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_assetLedgerId_key" ON "fixed_assets"("assetLedgerId");

-- CreateIndex
CREATE INDEX "fixed_assets_organizationId_status_idx" ON "fixed_assets"("organizationId", "status");

-- CreateIndex
CREATE INDEX "fixed_assets_organizationId_categoryId_idx" ON "fixed_assets"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "fixed_assets_organizationId_supplierId_idx" ON "fixed_assets"("organizationId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_organizationId_assetCode_key" ON "fixed_assets"("organizationId", "assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_depreciation_entries_journalEntryId_key" ON "fixed_asset_depreciation_entries"("journalEntryId");

-- CreateIndex
CREATE INDEX "fixed_asset_depreciation_entries_organizationId_periodEnd_idx" ON "fixed_asset_depreciation_entries"("organizationId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_depreciation_entries_fixedAssetId_periodEnd_key" ON "fixed_asset_depreciation_entries"("fixedAssetId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "hr_departments_organizationId_name_key" ON "hr_departments"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hr_designations_organizationId_name_key" ON "hr_designations"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hr_grades_organizationId_name_key" ON "hr_grades"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hr_business_units_organizationId_name_key" ON "hr_business_units"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hr_divisions_organizationId_name_key" ON "hr_divisions"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hr_locations_organizationId_name_key" ON "hr_locations"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hr_cost_centers_organizationId_name_key" ON "hr_cost_centers"("organizationId", "name");

-- CreateIndex
CREATE INDEX "hr_employees_organizationId_status_idx" ON "hr_employees"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hr_employees_organizationId_employeeCode_key" ON "hr_employees"("organizationId", "employeeCode");

-- CreateIndex
CREATE INDEX "hr_attendance_records_organizationId_attendanceDate_idx" ON "hr_attendance_records"("organizationId", "attendanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "hr_attendance_records_organizationId_employeeId_attendanceD_key" ON "hr_attendance_records"("organizationId", "employeeId", "attendanceDate");

-- CreateIndex
CREATE INDEX "hr_payroll_runs_organizationId_status_idx" ON "hr_payroll_runs"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hr_payroll_runs_organizationId_periodYear_periodMonth_key" ON "hr_payroll_runs"("organizationId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "hr_payslips_organizationId_employeeId_idx" ON "hr_payslips"("organizationId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "hr_payslips_payrollRunId_employeeId_key" ON "hr_payslips"("payrollRunId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "hr_leave_types_organizationId_name_key" ON "hr_leave_types"("organizationId", "name");

-- CreateIndex
CREATE INDEX "hr_leave_requests_organizationId_status_idx" ON "hr_leave_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "hr_leave_requests_organizationId_employeeId_leaveTypeId_idx" ON "hr_leave_requests"("organizationId", "employeeId", "leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "hr_shifts_organizationId_name_key" ON "hr_shifts"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hr_payroll_settings_organizationId_key" ON "hr_payroll_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "hr_holidays_organizationId_date_name_key" ON "hr_holidays"("organizationId", "date", "name");

-- CreateIndex
CREATE INDEX "hr_employee_change_records_organizationId_employeeId_idx" ON "hr_employee_change_records"("organizationId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "hr_exit_processes_employeeId_key" ON "hr_exit_processes"("employeeId");

-- CreateIndex
CREATE INDEX "hr_exit_processes_organizationId_status_idx" ON "hr_exit_processes"("organizationId", "status");

-- CreateIndex
CREATE INDEX "hr_expense_claims_organizationId_status_idx" ON "hr_expense_claims"("organizationId", "status");

-- CreateIndex
CREATE INDEX "hr_employee_loans_organizationId_status_idx" ON "hr_employee_loans"("organizationId", "status");

-- CreateIndex
CREATE INDEX "hr_loan_repayments_organizationId_loanId_idx" ON "hr_loan_repayments"("organizationId", "loanId");

-- CreateIndex
CREATE INDEX "hr_job_openings_organizationId_status_idx" ON "hr_job_openings"("organizationId", "status");

-- CreateIndex
CREATE INDEX "hr_candidates_organizationId_name_idx" ON "hr_candidates"("organizationId", "name");

-- CreateIndex
CREATE INDEX "hr_job_applications_organizationId_stage_idx" ON "hr_job_applications"("organizationId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "hr_job_applications_candidateId_jobOpeningId_key" ON "hr_job_applications"("candidateId", "jobOpeningId");

-- CreateIndex
CREATE UNIQUE INDEX "hr_onboarding_checklists_employeeId_key" ON "hr_onboarding_checklists"("employeeId");

-- CreateIndex
CREATE INDEX "hr_onboarding_checklists_organizationId_idx" ON "hr_onboarding_checklists"("organizationId");

-- CreateIndex
CREATE INDEX "warehouses_organizationId_isActive_idx" ON "warehouses"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_organizationId_code_key" ON "warehouses"("organizationId", "code");

-- CreateIndex
CREATE INDEX "stock_movements_organizationId_itemId_warehouseId_occurredA_idx" ON "stock_movements"("organizationId", "itemId", "warehouseId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_organizationId_sourceModule_sourceType_sour_key" ON "stock_movements"("organizationId", "sourceModule", "sourceType", "sourceId", "itemId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "lc_masters_purchasePayableId_key" ON "lc_masters"("purchasePayableId");

-- CreateIndex
CREATE INDEX "lc_masters_organizationId_status_idx" ON "lc_masters"("organizationId", "status");

-- CreateIndex
CREATE INDEX "lc_masters_organizationId_supplierId_idx" ON "lc_masters"("organizationId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "lc_masters_organizationId_lcNumber_key" ON "lc_masters"("organizationId", "lcNumber");

-- CreateIndex
CREATE INDEX "lc_status_history_organizationId_lcId_changedAt_idx" ON "lc_status_history"("organizationId", "lcId", "changedAt");

-- CreateIndex
CREATE INDEX "lc_items_organizationId_lcId_idx" ON "lc_items"("organizationId", "lcId");

-- CreateIndex
CREATE INDEX "lc_items_organizationId_itemId_idx" ON "lc_items"("organizationId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "lc_inventory_postings_lcItemId_key" ON "lc_inventory_postings"("lcItemId");

-- CreateIndex
CREATE UNIQUE INDEX "lc_inventory_postings_stockMovementId_key" ON "lc_inventory_postings"("stockMovementId");

-- CreateIndex
CREATE INDEX "lc_inventory_postings_organizationId_lcId_postedAt_idx" ON "lc_inventory_postings"("organizationId", "lcId", "postedAt");

-- CreateIndex
CREATE INDEX "lc_inventory_postings_organizationId_warehouseId_postedAt_idx" ON "lc_inventory_postings"("organizationId", "warehouseId", "postedAt");

-- CreateIndex
CREATE INDEX "lc_shipments_organizationId_lcId_idx" ON "lc_shipments"("organizationId", "lcId");

-- CreateIndex
CREATE INDEX "lc_cost_heads_organizationId_category_isActive_idx" ON "lc_cost_heads"("organizationId", "category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "lc_cost_heads_organizationId_code_key" ON "lc_cost_heads"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "lc_cost_entries_payableId_key" ON "lc_cost_entries"("payableId");

-- CreateIndex
CREATE INDEX "lc_cost_entries_organizationId_lcId_idx" ON "lc_cost_entries"("organizationId", "lcId");

-- CreateIndex
CREATE INDEX "lc_cost_entries_organizationId_costHeadId_idx" ON "lc_cost_entries"("organizationId", "costHeadId");

-- CreateIndex
CREATE INDEX "lc_cost_allocations_organizationId_lcItemId_idx" ON "lc_cost_allocations"("organizationId", "lcItemId");

-- CreateIndex
CREATE UNIQUE INDEX "lc_cost_allocations_costEntryId_lcItemId_key" ON "lc_cost_allocations"("costEntryId", "lcItemId");

-- CreateIndex
CREATE INDEX "lc_grns_organizationId_lcId_idx" ON "lc_grns"("organizationId", "lcId");

-- CreateIndex
CREATE UNIQUE INDEX "lc_grns_lcId_grnNumber_key" ON "lc_grns"("lcId", "grnNumber");

-- CreateIndex
CREATE INDEX "lc_grn_items_organizationId_lcItemId_idx" ON "lc_grn_items"("organizationId", "lcItemId");

-- CreateIndex
CREATE UNIQUE INDEX "lc_grn_items_grnId_lcItemId_key" ON "lc_grn_items"("grnId", "lcItemId");

-- CreateIndex
CREATE UNIQUE INDEX "lc_landed_costs_lcId_key" ON "lc_landed_costs"("lcId");

-- CreateIndex
CREATE INDEX "lc_landed_costs_organizationId_status_idx" ON "lc_landed_costs"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lc_landed_cost_items_lcItemId_key" ON "lc_landed_cost_items"("lcItemId");

-- CreateIndex
CREATE INDEX "lc_landed_cost_items_organizationId_landedCostId_idx" ON "lc_landed_cost_items"("organizationId", "landedCostId");

-- CreateIndex
CREATE INDEX "expense_heads_organizationId_ledgerAccountId_idx" ON "expense_heads"("organizationId", "ledgerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_payableId_key" ON "expenses"("payableId");

-- CreateIndex
CREATE INDEX "expenses_organizationId_expenseLedgerAccountId_idx" ON "expenses"("organizationId", "expenseLedgerAccountId");

-- CreateIndex
CREATE INDEX "expenses_organizationId_payablePartyId_idx" ON "expenses"("organizationId", "payablePartyId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expenseLedgerAccountId_fkey" FOREIGN KEY ("expenseLedgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payablePartyId_fkey" FOREIGN KEY ("payablePartyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_heads" ADD CONSTRAINT "expense_heads_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_assetLedgerId_fkey" FOREIGN KEY ("assetLedgerId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_accumulatedDepreciationLedgerId_fkey" FOREIGN KEY ("accumulatedDepreciationLedgerId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_depreciationExpenseLedgerId_fkey" FOREIGN KEY ("depreciationExpenseLedgerId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_assetLedgerId_fkey" FOREIGN KEY ("assetLedgerId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_depreciation_entries" ADD CONSTRAINT "fixed_asset_depreciation_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_depreciation_entries" ADD CONSTRAINT "fixed_asset_depreciation_entries_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_departments" ADD CONSTRAINT "hr_departments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_designations" ADD CONSTRAINT "hr_designations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_grades" ADD CONSTRAINT "hr_grades_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_business_units" ADD CONSTRAINT "hr_business_units_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_divisions" ADD CONSTRAINT "hr_divisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_locations" ADD CONSTRAINT "hr_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_cost_centers" ADD CONSTRAINT "hr_cost_centers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "hr_designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "hr_grades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "hr_business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "hr_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "hr_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "hr_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_attendance_records" ADD CONSTRAINT "hr_attendance_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_attendance_records" ADD CONSTRAINT "hr_attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_payroll_runs" ADD CONSTRAINT "hr_payroll_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_payslips" ADD CONSTRAINT "hr_payslips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_payslips" ADD CONSTRAINT "hr_payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "hr_payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_payslips" ADD CONSTRAINT "hr_payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_leave_types" ADD CONSTRAINT "hr_leave_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "hr_leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_shifts" ADD CONSTRAINT "hr_shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_payroll_settings" ADD CONSTRAINT "hr_payroll_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_holidays" ADD CONSTRAINT "hr_holidays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_change_records" ADD CONSTRAINT "hr_employee_change_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_change_records" ADD CONSTRAINT "hr_employee_change_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_exit_processes" ADD CONSTRAINT "hr_exit_processes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_exit_processes" ADD CONSTRAINT "hr_exit_processes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_expense_claims" ADD CONSTRAINT "hr_expense_claims_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_expense_claims" ADD CONSTRAINT "hr_expense_claims_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_loans" ADD CONSTRAINT "hr_employee_loans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_loans" ADD CONSTRAINT "hr_employee_loans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_loan_repayments" ADD CONSTRAINT "hr_loan_repayments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_loan_repayments" ADD CONSTRAINT "hr_loan_repayments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "hr_employee_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_job_openings" ADD CONSTRAINT "hr_job_openings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_job_openings" ADD CONSTRAINT "hr_job_openings_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_job_openings" ADD CONSTRAINT "hr_job_openings_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "hr_designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_candidates" ADD CONSTRAINT "hr_candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_job_applications" ADD CONSTRAINT "hr_job_applications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_job_applications" ADD CONSTRAINT "hr_job_applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "hr_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_job_applications" ADD CONSTRAINT "hr_job_applications_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "hr_job_openings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_onboarding_checklists" ADD CONSTRAINT "hr_onboarding_checklists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_onboarding_checklists" ADD CONSTRAINT "hr_onboarding_checklists_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_masters" ADD CONSTRAINT "lc_masters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_masters" ADD CONSTRAINT "lc_masters_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_masters" ADD CONSTRAINT "lc_masters_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_masters" ADD CONSTRAINT "lc_masters_purchasePayableId_fkey" FOREIGN KEY ("purchasePayableId") REFERENCES "payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_status_history" ADD CONSTRAINT "lc_status_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_status_history" ADD CONSTRAINT "lc_status_history_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "lc_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_items" ADD CONSTRAINT "lc_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_items" ADD CONSTRAINT "lc_items_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "lc_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_items" ADD CONSTRAINT "lc_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_inventory_postings" ADD CONSTRAINT "lc_inventory_postings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_inventory_postings" ADD CONSTRAINT "lc_inventory_postings_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "lc_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_inventory_postings" ADD CONSTRAINT "lc_inventory_postings_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES "lc_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_inventory_postings" ADD CONSTRAINT "lc_inventory_postings_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_inventory_postings" ADD CONSTRAINT "lc_inventory_postings_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_shipments" ADD CONSTRAINT "lc_shipments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_shipments" ADD CONSTRAINT "lc_shipments_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "lc_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_cost_heads" ADD CONSTRAINT "lc_cost_heads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_cost_heads" ADD CONSTRAINT "lc_cost_heads_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_cost_entries" ADD CONSTRAINT "lc_cost_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_cost_entries" ADD CONSTRAINT "lc_cost_entries_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "lc_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_cost_entries" ADD CONSTRAINT "lc_cost_entries_costHeadId_fkey" FOREIGN KEY ("costHeadId") REFERENCES "lc_cost_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_cost_entries" ADD CONSTRAINT "lc_cost_entries_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "lc_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_cost_entries" ADD CONSTRAINT "lc_cost_entries_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_cost_allocations" ADD CONSTRAINT "lc_cost_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_cost_allocations" ADD CONSTRAINT "lc_cost_allocations_costEntryId_fkey" FOREIGN KEY ("costEntryId") REFERENCES "lc_cost_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_cost_allocations" ADD CONSTRAINT "lc_cost_allocations_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES "lc_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_grns" ADD CONSTRAINT "lc_grns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_grns" ADD CONSTRAINT "lc_grns_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "lc_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_grns" ADD CONSTRAINT "lc_grns_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_grn_items" ADD CONSTRAINT "lc_grn_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_grn_items" ADD CONSTRAINT "lc_grn_items_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "lc_grns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_grn_items" ADD CONSTRAINT "lc_grn_items_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES "lc_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_landed_costs" ADD CONSTRAINT "lc_landed_costs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_landed_costs" ADD CONSTRAINT "lc_landed_costs_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "lc_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_landed_cost_items" ADD CONSTRAINT "lc_landed_cost_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_landed_cost_items" ADD CONSTRAINT "lc_landed_cost_items_landedCostId_fkey" FOREIGN KEY ("landedCostId") REFERENCES "lc_landed_costs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lc_landed_cost_items" ADD CONSTRAINT "lc_landed_cost_items_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES "lc_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Register module permissions without changing custom roles. Existing system
-- roles receive the new permissions, matching the repository's established
-- permission-migration convention.
WITH permission_keys(key_name) AS (VALUES
  ('general_expense.read'),
  ('general_expense.create'),
  ('general_expense.update'),
  ('general_expense.delete'),
  ('general_expense.export'),
  ('lc.view'),
  ('lc.create'),
  ('lc.edit'),
  ('lc.delete'),
  ('lc.cost.enter'),
  ('lc.cost.edit'),
  ('lc.cost.allocate'),
  ('lc.finalize'),
  ('lc.finalize.reopen'),
  ('lc.reports.view'),
  ('lc.configure'),
  ('asset.read'),
  ('asset.create'),
  ('asset.update'),
  ('asset.delete'),
  ('asset.depreciation.post'),
  ('asset.reports.view'),
  ('hr.employee.view'),
  ('hr.employee.create'),
  ('hr.employee.update'),
  ('hr.employee.delete'),
  ('hr.payroll.manage'),
  ('hr.payroll.approve'),
  ('hr.leave.view'),
  ('hr.leave.manage'),
  ('hr.leave.approve'),
  ('hr.expense.view'),
  ('hr.expense.manage'),
  ('hr.expense.approve'),
  ('hr.loan.view'),
  ('hr.loan.manage'),
  ('hr.loan.approve'),
  ('hr.recruitment.view'),
  ('hr.recruitment.manage')
)
INSERT INTO "permissions" ("id", "key", "group", "description")
SELECT 'perm-' || md5(key_name), key_name, split_part(key_name, '.', 1), 'Bizovix module permission: ' || key_name
FROM permission_keys
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || md5(role."id" || permission."id"), role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."isSystem" = true
  AND (
    permission."key" LIKE 'general_expense.%'
    OR permission."key" LIKE 'lc.%'
    OR permission."key" LIKE 'asset.%'
    OR permission."key" LIKE 'hr.%'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
