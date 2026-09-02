-- Audited manufacturing blueprint controls.
-- This migration is schema-only: it intentionally inserts no demo, seed, account,
-- document-number, readiness, approval, calendar, plan or period data.

-- CreateEnum
CREATE TYPE "ManufacturingResourceKind" AS ENUM ('WORK_CENTER', 'PRODUCTION_LINE', 'ROOM', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "ManufacturingReadinessState" AS ENUM ('READY', 'DUE_SOON', 'BLOCKED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "ManufacturingCleaningState" AS ENUM ('CLEAN', 'DUE', 'BLOCKED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "ManufacturingCalendarStatus" AS ENUM ('AVAILABLE', 'NON_WORKING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ManufacturingControlRecordKind" AS ENUM ('DEMAND_PLAN', 'MASTER_PRODUCTION_SCHEDULE', 'CAMPAIGN', 'QUALITY_SPECIFICATION', 'TEST_METHOD', 'PACKAGING_CONFIGURATION', 'ARTWORK_SPECIFICATION', 'REASON_CODE');

-- CreateEnum
CREATE TYPE "ManufacturingControlRecordStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManufacturingDocumentKind" AS ENUM ('DEMAND_PLAN', 'MASTER_PRODUCTION_SCHEDULE', 'CAMPAIGN', 'PRODUCTION_PLAN', 'PRODUCTION_ORDER', 'MATERIAL_REQUISITION', 'MATERIAL_ISSUE', 'MATERIAL_RETURN', 'QC_INSPECTION', 'PACKAGING_ORDER', 'FINISHED_GOODS_RECEIPT', 'QA_RELEASE', 'CAPACITY_CHECK');

-- CreateEnum
CREATE TYPE "ManufacturingCapacityCheckStatus" AS ENUM ('READY', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ManufacturingPeriodStatus" AS ENUM ('OPEN', 'LOCKED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ManufacturingResource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "ManufacturingResourceKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentResourceId" TEXT,
    "warehouseId" TEXT,
    "locationId" TEXT,
    "capacityMinutesPerDay" INTEGER NOT NULL DEFAULT 0,
    "qualificationState" "ManufacturingReadinessState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "qualificationValidUntil" DATE,
    "calibrationState" "ManufacturingReadinessState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "calibrationDueAt" DATE,
    "maintenanceState" "ManufacturingReadinessState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "maintenanceDueAt" DATE,
    "cleaningState" "ManufacturingCleaningState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "lastCleanedAt" TIMESTAMP(3),
    "readinessEvidenceReference" TEXT,
    "readinessNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingCalendarSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "availableMinutes" INTEGER NOT NULL,
    "status" "ManufacturingCalendarStatus" NOT NULL DEFAULT 'AVAILABLE',
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingCalendarSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOperationResourceRequirement" (
    "id" TEXT NOT NULL,
    "routingOperationId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "requiredUnits" INTEGER NOT NULL DEFAULT 1,
    "capacityMultiplier" DECIMAL(9,6) NOT NULL DEFAULT 1,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingOperationResourceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingControlRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "ManufacturingControlRecordKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "ManufacturingControlRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceRecordId" TEXT,
    "planId" TEXT,
    "inventoryItemId" TEXT,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "payload" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingControlRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingControlRecordLine" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "requiredDate" DATE,
    "plannedStartDate" DATE,
    "plannedEndDate" DATE,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingControlRecordLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingDocumentSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentKind" "ManufacturingDocumentKind" NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "resetAnnually" BOOLEAN NOT NULL DEFAULT true,
    "lastIssuedYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingDocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingDocumentNumber" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "documentKind" "ManufacturingDocumentKind" NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "issuedYear" INTEGER NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "issuedByUserId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManufacturingDocumentNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingCapacityCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "checkNumber" TEXT NOT NULL,
    "status" "ManufacturingCapacityCheckStatus" NOT NULL,
    "asOfDate" DATE NOT NULL,
    "requiredMinutes" DECIMAL(24,4) NOT NULL DEFAULT 0,
    "availableMinutes" DECIMAL(24,4) NOT NULL DEFAULT 0,
    "result" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManufacturingCapacityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "ManufacturingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "lastValidation" JSONB,
    "lastValidatedAt" TIMESTAMP(3),
    "lockedByUserId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockReason" TEXT,
    "archivedByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManufacturingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingResource_workspaceId_code_key" ON "ManufacturingResource"("workspaceId", "code");
CREATE UNIQUE INDEX "ManufacturingResource_workspaceId_kind_name_key" ON "ManufacturingResource"("workspaceId", "kind", "name");
CREATE INDEX "ManufacturingResource_workspaceId_kind_isActive_idx" ON "ManufacturingResource"("workspaceId", "kind", "isActive");
CREATE INDEX "ManufacturingResource_parentResourceId_idx" ON "ManufacturingResource"("parentResourceId");

CREATE UNIQUE INDEX "ManufacturingShift_workspaceId_code_key" ON "ManufacturingShift"("workspaceId", "code");
CREATE UNIQUE INDEX "ManufacturingShift_workspaceId_name_key" ON "ManufacturingShift"("workspaceId", "name");
CREATE INDEX "ManufacturingShift_workspaceId_isActive_idx" ON "ManufacturingShift"("workspaceId", "isActive");

CREATE UNIQUE INDEX "ManufacturingCalendarSlot_resourceId_shiftId_workDate_key" ON "ManufacturingCalendarSlot"("resourceId", "shiftId", "workDate");
CREATE INDEX "ManufacturingCalendarSlot_workspaceId_workDate_status_idx" ON "ManufacturingCalendarSlot"("workspaceId", "workDate", "status");
CREATE INDEX "ManufacturingCalendarSlot_shiftId_idx" ON "ManufacturingCalendarSlot"("shiftId");

CREATE UNIQUE INDEX "ManufacturingOperationResourceRequirement_routingOperationId_resourceId_key" ON "ManufacturingOperationResourceRequirement"("routingOperationId", "resourceId");
CREATE INDEX "ManufacturingOperationResourceRequirement_resourceId_idx" ON "ManufacturingOperationResourceRequirement"("resourceId");

CREATE UNIQUE INDEX "ManufacturingControlRecord_workspaceId_kind_code_versionNumber_key" ON "ManufacturingControlRecord"("workspaceId", "kind", "code", "versionNumber");
CREATE INDEX "ManufacturingControlRecord_workspaceId_kind_status_idx" ON "ManufacturingControlRecord"("workspaceId", "kind", "status");
CREATE INDEX "ManufacturingControlRecord_sourceRecordId_idx" ON "ManufacturingControlRecord"("sourceRecordId");
CREATE INDEX "ManufacturingControlRecord_planId_idx" ON "ManufacturingControlRecord"("planId");
CREATE INDEX "ManufacturingControlRecord_inventoryItemId_idx" ON "ManufacturingControlRecord"("inventoryItemId");

CREATE UNIQUE INDEX "ManufacturingControlRecordLine_recordId_sequence_key" ON "ManufacturingControlRecordLine"("recordId", "sequence");
CREATE INDEX "ManufacturingControlRecordLine_inventoryItemId_idx" ON "ManufacturingControlRecordLine"("inventoryItemId");

CREATE UNIQUE INDEX "ManufacturingDocumentSequence_workspaceId_documentKind_key" ON "ManufacturingDocumentSequence"("workspaceId", "documentKind");
CREATE UNIQUE INDEX "ManufacturingDocumentSequence_workspaceId_prefix_key" ON "ManufacturingDocumentSequence"("workspaceId", "prefix");
CREATE INDEX "ManufacturingDocumentSequence_workspaceId_isActive_idx" ON "ManufacturingDocumentSequence"("workspaceId", "isActive");

CREATE UNIQUE INDEX "ManufacturingDocumentNumber_workspaceId_documentNumber_key" ON "ManufacturingDocumentNumber"("workspaceId", "documentNumber");
CREATE UNIQUE INDEX "ManufacturingDocumentNumber_workspaceId_idempotencyKey_key" ON "ManufacturingDocumentNumber"("workspaceId", "idempotencyKey");
CREATE INDEX "ManufacturingDocumentNumber_workspaceId_documentKind_issuedAt_idx" ON "ManufacturingDocumentNumber"("workspaceId", "documentKind", "issuedAt");
CREATE INDEX "ManufacturingDocumentNumber_entityType_entityId_idx" ON "ManufacturingDocumentNumber"("entityType", "entityId");

CREATE UNIQUE INDEX "ManufacturingCapacityCheck_workspaceId_checkNumber_key" ON "ManufacturingCapacityCheck"("workspaceId", "checkNumber");
CREATE UNIQUE INDEX "ManufacturingCapacityCheck_workspaceId_idempotencyKey_key" ON "ManufacturingCapacityCheck"("workspaceId", "idempotencyKey");
CREATE INDEX "ManufacturingCapacityCheck_workspaceId_planId_createdAt_idx" ON "ManufacturingCapacityCheck"("workspaceId", "planId", "createdAt");
CREATE INDEX "ManufacturingCapacityCheck_workspaceId_status_asOfDate_idx" ON "ManufacturingCapacityCheck"("workspaceId", "status", "asOfDate");

CREATE UNIQUE INDEX "ManufacturingPeriod_workspaceId_periodYear_periodMonth_key" ON "ManufacturingPeriod"("workspaceId", "periodYear", "periodMonth");
CREATE INDEX "ManufacturingPeriod_workspaceId_status_periodStart_idx" ON "ManufacturingPeriod"("workspaceId", "status", "periodStart");

-- AddForeignKey
ALTER TABLE "ManufacturingResource" ADD CONSTRAINT "ManufacturingResource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingResource" ADD CONSTRAINT "ManufacturingResource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingResource" ADD CONSTRAINT "ManufacturingResource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingResource" ADD CONSTRAINT "ManufacturingResource_parentResourceId_fkey" FOREIGN KEY ("parentResourceId") REFERENCES "ManufacturingResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingShift" ADD CONSTRAINT "ManufacturingShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingShift" ADD CONSTRAINT "ManufacturingShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingShift" ADD CONSTRAINT "ManufacturingShift_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingCalendarSlot" ADD CONSTRAINT "ManufacturingCalendarSlot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCalendarSlot" ADD CONSTRAINT "ManufacturingCalendarSlot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCalendarSlot" ADD CONSTRAINT "ManufacturingCalendarSlot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCalendarSlot" ADD CONSTRAINT "ManufacturingCalendarSlot_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ManufacturingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCalendarSlot" ADD CONSTRAINT "ManufacturingCalendarSlot_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "ManufacturingShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOperationResourceRequirement" ADD CONSTRAINT "ManufacturingOperationResourceRequirement_routingOperationId_fkey" FOREIGN KEY ("routingOperationId") REFERENCES "ManufacturingRoutingOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOperationResourceRequirement" ADD CONSTRAINT "ManufacturingOperationResourceRequirement_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ManufacturingResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingControlRecord" ADD CONSTRAINT "ManufacturingControlRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingControlRecord" ADD CONSTRAINT "ManufacturingControlRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingControlRecord" ADD CONSTRAINT "ManufacturingControlRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingControlRecord" ADD CONSTRAINT "ManufacturingControlRecord_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "ManufacturingControlRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingControlRecordLine" ADD CONSTRAINT "ManufacturingControlRecordLine_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ManufacturingControlRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingControlRecordLine" ADD CONSTRAINT "ManufacturingControlRecordLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingDocumentSequence" ADD CONSTRAINT "ManufacturingDocumentSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDocumentSequence" ADD CONSTRAINT "ManufacturingDocumentSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDocumentSequence" ADD CONSTRAINT "ManufacturingDocumentSequence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingDocumentNumber" ADD CONSTRAINT "ManufacturingDocumentNumber_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDocumentNumber" ADD CONSTRAINT "ManufacturingDocumentNumber_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDocumentNumber" ADD CONSTRAINT "ManufacturingDocumentNumber_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDocumentNumber" ADD CONSTRAINT "ManufacturingDocumentNumber_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "ManufacturingDocumentSequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingCapacityCheck" ADD CONSTRAINT "ManufacturingCapacityCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCapacityCheck" ADD CONSTRAINT "ManufacturingCapacityCheck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCapacityCheck" ADD CONSTRAINT "ManufacturingCapacityCheck_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCapacityCheck" ADD CONSTRAINT "ManufacturingCapacityCheck_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ManufacturingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingPeriod" ADD CONSTRAINT "ManufacturingPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPeriod" ADD CONSTRAINT "ManufacturingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPeriod" ADD CONSTRAINT "ManufacturingPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
