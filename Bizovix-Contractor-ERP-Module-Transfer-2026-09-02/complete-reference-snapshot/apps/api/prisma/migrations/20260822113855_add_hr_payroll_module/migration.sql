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

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
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
    "department" TEXT,
    "designation" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'PERMANENT',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "joiningDate" DATE NOT NULL,
    "resignationDate" DATE,
    "grossSalary" DECIMAL(18,4) NOT NULL,
    "basicPercent" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "houseRentPercent" DECIMAL(5,2) NOT NULL DEFAULT 25,
    "medicalPercent" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "conveyancePercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "paymentMethod" "SalaryPaymentMethod" NOT NULL DEFAULT 'CASH',
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "mfsProvider" TEXT,
    "mfsAccountNumber" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "totalWorkingDays" DECIMAL(5,2) NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "totalGross" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalNetPayable" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "department" TEXT,
    "designation" TEXT,
    "grossSalary" DECIMAL(18,4) NOT NULL,
    "basicSalary" DECIMAL(18,4) NOT NULL,
    "houseRent" DECIMAL(18,4) NOT NULL,
    "medicalAllowance" DECIMAL(18,4) NOT NULL,
    "conveyance" DECIMAL(18,4) NOT NULL,
    "totalWorkingDays" DECIMAL(5,2) NOT NULL,
    "presentDays" DECIMAL(5,2) NOT NULL,
    "proratedGross" DECIMAL(18,4) NOT NULL,
    "providentFund" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "iouDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "loanDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "fineDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lunchBillDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalDeduction" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(18,4) NOT NULL,
    "paymentMethod" "SalaryPaymentMethod" NOT NULL,
    "paymentStatus" "PayslipPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_workspaceId_status_idx" ON "Employee"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_workspaceId_employeeCode_key" ON "Employee"("workspaceId", "employeeCode");

-- CreateIndex
CREATE INDEX "PayrollRun_workspaceId_status_idx" ON "PayrollRun"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_workspaceId_periodYear_periodMonth_key" ON "PayrollRun"("workspaceId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "Payslip_employeeId_idx" ON "Payslip"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_payrollRunId_employeeId_key" ON "Payslip"("payrollRunId", "employeeId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
