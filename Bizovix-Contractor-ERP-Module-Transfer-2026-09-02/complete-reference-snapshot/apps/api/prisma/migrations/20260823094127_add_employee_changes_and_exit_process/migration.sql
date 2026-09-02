-- CreateEnum
CREATE TYPE "EmployeeChangeType" AS ENUM ('PROMOTION', 'TRANSFER', 'DEPARTMENT_CHANGE', 'DESIGNATION_CHANGE', 'GRADE_CHANGE', 'SALARY_REVISION', 'REPORTING_MANAGER_CHANGE', 'LOCATION_CHANGE', 'EMPLOYMENT_TYPE_CHANGE');

-- CreateEnum
CREATE TYPE "SeparationType" AS ENUM ('RESIGNATION', 'TERMINATION', 'RETIREMENT', 'CONTRACT_EXPIRY');

-- CreateEnum
CREATE TYPE "ExitProcessStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "reportingManagerId" TEXT;

-- CreateTable
CREATE TABLE "EmployeeChangeRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "changeType" "EmployeeChangeType" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeChangeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExitProcess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
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
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExitProcess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeChangeRecord_workspaceId_employeeId_idx" ON "EmployeeChangeRecord"("workspaceId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExitProcess_employeeId_key" ON "ExitProcess"("employeeId");

-- CreateIndex
CREATE INDEX "ExitProcess_workspaceId_status_idx" ON "ExitProcess"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeChangeRecord" ADD CONSTRAINT "EmployeeChangeRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeChangeRecord" ADD CONSTRAINT "EmployeeChangeRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeChangeRecord" ADD CONSTRAINT "EmployeeChangeRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeChangeRecord" ADD CONSTRAINT "EmployeeChangeRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeChangeRecord" ADD CONSTRAINT "EmployeeChangeRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitProcess" ADD CONSTRAINT "ExitProcess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitProcess" ADD CONSTRAINT "ExitProcess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitProcess" ADD CONSTRAINT "ExitProcess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitProcess" ADD CONSTRAINT "ExitProcess_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitProcess" ADD CONSTRAINT "ExitProcess_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
