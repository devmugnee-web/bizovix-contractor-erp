-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('WORK_ORDER', 'CONTRACT_AGREEMENT', 'PURCHASE_ORDER', 'SERVICE_CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProjectBudgetStatus" AS ENUM ('DRAFT', 'APPROVED', 'REVISED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "project_contracts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenderId" TEXT,
    "cmsWorkId" TEXT NOT NULL,
    "pgBgWorkflowId" TEXT,
    "organizationMasterId" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL DEFAULT 'WORK_ORDER',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "contractDate" TIMESTAMP(3),
    "originalContractValue" DECIMAL(18,2) NOT NULL,
    "currentContractValue" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "commencementDate" TIMESTAMP(3) NOT NULL,
    "originalCompletionDate" TIMESTAMP(3) NOT NULL,
    "currentCompletionDate" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER,
    "dlpDays" INTEGER,
    "retentionPct" DECIMAL(5,2),
    "securityDepositPct" DECIMAL(5,2),
    "clientContactName" TEXT,
    "responsiblePerson" TEXT,
    "scopeOfWork" TEXT,
    "remarks" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_budgets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cmsWorkId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProjectBudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "totalBudget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "revisionNote" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_budget_lines" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "expenseHeadId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boq_sections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cmsWorkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boq_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boq_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cmsWorkId" TEXT NOT NULL,
    "sectionId" TEXT,
    "itemCode" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "contractQty" DECIMAL(18,3) NOT NULL,
    "unitRate" DECIMAL(18,2) NOT NULL,
    "contractAmount" DECIMAL(18,2) NOT NULL,
    "executedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "executedValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "specification" TEXT,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boq_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_contracts_organizationId_status_idx" ON "project_contracts"("organizationId", "status");

-- CreateIndex
CREATE INDEX "project_contracts_organizationId_currentCompletionDate_idx" ON "project_contracts"("organizationId", "currentCompletionDate");

-- CreateIndex
CREATE INDEX "project_contracts_organizationId_cmsWorkId_idx" ON "project_contracts"("organizationId", "cmsWorkId");

-- CreateIndex
CREATE UNIQUE INDEX "project_contracts_organizationId_contractNo_key" ON "project_contracts"("organizationId", "contractNo");

-- CreateIndex
CREATE INDEX "project_budgets_organizationId_cmsWorkId_status_idx" ON "project_budgets"("organizationId", "cmsWorkId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_budgets_organizationId_cmsWorkId_version_key" ON "project_budgets"("organizationId", "cmsWorkId", "version");

-- CreateIndex
CREATE INDEX "project_budget_lines_budgetId_idx" ON "project_budget_lines"("budgetId");

-- CreateIndex
CREATE INDEX "project_budget_lines_expenseHeadId_idx" ON "project_budget_lines"("expenseHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "boq_sections_cmsWorkId_name_key" ON "boq_sections"("cmsWorkId", "name");

-- CreateIndex
CREATE INDEX "boq_items_organizationId_cmsWorkId_idx" ON "boq_items"("organizationId", "cmsWorkId");

-- CreateIndex
CREATE UNIQUE INDEX "boq_items_cmsWorkId_itemCode_key" ON "boq_items"("cmsWorkId", "itemCode");

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_pgBgWorkflowId_fkey" FOREIGN KEY ("pgBgWorkflowId") REFERENCES "pg_bg_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES "organization_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_budget_lines" ADD CONSTRAINT "project_budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "project_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_budget_lines" ADD CONSTRAINT "project_budget_lines_expenseHeadId_fkey" FOREIGN KEY ("expenseHeadId") REFERENCES "expense_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_sections" ADD CONSTRAINT "boq_sections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_sections" ADD CONSTRAINT "boq_sections_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "boq_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

