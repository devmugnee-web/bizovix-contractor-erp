-- Additive, versioned A-to-K workflow reference configuration and run state.
-- This migration creates no production plans, orders, runs, stock, journals,
-- quality results, serials, approvals, or other business/demo records.

CREATE TYPE "ManufacturingWorkflowStepType" AS ENUM (
  'OPERATIONAL', 'MONITORING', 'APPROVAL', 'POSTING', 'CONTROL', 'REPORT'
);
CREATE TYPE "ManufacturingWorkflowApplicabilityType" AS ENUM (
  'REQUIRED', 'CONDITIONAL', 'MODE_SPECIFIC', 'MONITORING', 'PERIODIC', 'NOT_APPLICABLE'
);
CREATE TYPE "ManufacturingWorkflowPostingEffect" AS ENUM (
  'NONE', 'INVENTORY_ONLY', 'GENERAL_LEDGER_ONLY', 'INVENTORY_AND_GL'
);
CREATE TYPE "ManufacturingWorkflowIdempotencyPolicy" AS ENUM (
  'NOT_APPLICABLE', 'REQUIRED'
);
CREATE TYPE "ManufacturingWorkflowDependencyType" AS ENUM (
  'HARD', 'CONDITIONAL', 'GROUP_GATE', 'POSTING_PRECONDITION'
);
CREATE TYPE "ManufacturingWorkflowStepStatus" AS ENUM (
  'BLOCKED', 'READY', 'IN_PROGRESS', 'PENDING_APPROVAL', 'APPROVED',
  'POSTING', 'POSTED', 'COMPLETED', 'ON_HOLD', 'REJECTED', 'FAILED',
  'N_A', 'CANCELLED', 'CLOSED', 'LOCKED'
);
CREATE TYPE "ManufacturingRunStatus" AS ENUM (
  'DRAFT', 'PLANNED', 'PENDING_APPROVAL', 'APPROVED', 'MATERIAL_QC_PENDING',
  'MATERIAL_READY', 'RESERVED', 'STAGED', 'ISSUED', 'IN_PRODUCTION',
  'PRODUCTION_COMPLETE', 'QC_PENDING', 'QC_PASSED', 'PACKAGING',
  'PACKAGING_RECONCILED', 'FG_Q', 'RELEASE_READY', 'FG_R',
  'COST_FINALIZED', 'CLOSED', 'PERIOD_LOCKED', 'CANCELLED', 'ON_HOLD'
);
CREATE TYPE "ManufacturingEvidenceVerificationStatus" AS ENUM (
  'PENDING', 'VERIFIED', 'REJECTED'
);

CREATE TABLE "ManufacturingWorkflowDefinition" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "effectiveFrom" DATE NOT NULL,
  "totalGroups" INTEGER NOT NULL DEFAULT 11,
  "totalSteps" INTEGER NOT NULL DEFAULT 159,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManufacturingWorkflowDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingWorkflowGroup" (
  "id" TEXT NOT NULL,
  "workflowDefinitionId" TEXT NOT NULL,
  "legacyGroupCode" TEXT NOT NULL,
  "flowGroupCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "flowGroupOrder" INTEGER NOT NULL,
  "expectedStepCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManufacturingWorkflowGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingWorkflowStepDefinition" (
  "id" TEXT NOT NULL,
  "workflowDefinitionId" TEXT NOT NULL,
  "workflowGroupId" TEXT NOT NULL,
  "legacyStepCode" TEXT NOT NULL,
  "flowSerial" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  "executionOrder" INTEGER NOT NULL,
  "stepType" "ManufacturingWorkflowStepType" NOT NULL,
  "applicabilityType" "ManufacturingWorkflowApplicabilityType" NOT NULL,
  "repeatable" BOOLEAN NOT NULL DEFAULT false,
  "postingEffect" "ManufacturingWorkflowPostingEffect" NOT NULL DEFAULT 'NONE',
  "idempotencyPolicy" "ManufacturingWorkflowIdempotencyPolicy" NOT NULL DEFAULT 'NOT_APPLICABLE',
  "route" TEXT NOT NULL,
  "permissionKey" TEXT NOT NULL,
  "completionRule" JSONB NOT NULL,
  "allowedModes" TEXT[] NOT NULL,
  "isBlocking" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManufacturingWorkflowStepDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingStepDependency" (
  "id" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "prerequisiteStepId" TEXT NOT NULL,
  "requiredStatus" "ManufacturingWorkflowStepStatus" NOT NULL,
  "dependencyType" "ManufacturingWorkflowDependencyType" NOT NULL DEFAULT 'HARD',
  "conditionExpression" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingStepDependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workflowDefinitionId" TEXT NOT NULL,
  "productionPlanId" TEXT,
  "productionOrderId" TEXT,
  "productId" TEXT,
  "manufacturingMode" "ManufacturingMode" NOT NULL,
  "status" "ManufacturingRunStatus" NOT NULL DEFAULT 'DRAFT',
  "currentGroup" TEXT,
  "currentStepSerial" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManufacturingRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingRunStep" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stepDefinitionId" TEXT NOT NULL,
  "occurrenceKey" TEXT NOT NULL DEFAULT 'PRIMARY',
  "status" "ManufacturingWorkflowStepStatus" NOT NULL DEFAULT 'READY',
  "applicable" BOOLEAN NOT NULL DEFAULT true,
  "blockerReason" TEXT,
  "naReason" TEXT,
  "sourceRecordType" TEXT,
  "sourceRecordId" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "completedBy" TEXT,
  "approvedBy" TEXT,
  "signatureReference" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManufacturingRunStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingRunStepTransition" (
  "id" TEXT NOT NULL,
  "runStepId" TEXT NOT NULL,
  "fromStatus" "ManufacturingWorkflowStepStatus" NOT NULL,
  "toStatus" "ManufacturingWorkflowStepStatus" NOT NULL,
  "sourceAction" TEXT NOT NULL,
  "reason" TEXT,
  "performedByUserId" TEXT NOT NULL,
  "sourceRecordType" TEXT,
  "sourceRecordId" TEXT,
  "signatureReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingRunStepTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingPostingLink" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "runId" TEXT,
  "sourceDocumentType" TEXT NOT NULL,
  "sourceDocumentId" TEXT NOT NULL,
  "postingType" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "stockMovementId" TEXT,
  "journalId" TEXT,
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingPostingLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingEvidence" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "runStepId" TEXT,
  "stepDefinitionId" TEXT NOT NULL,
  "fileReference" TEXT NOT NULL,
  "verifiedMimeType" TEXT NOT NULL,
  "verifiedFileSize" INTEGER NOT NULL,
  "sha256Checksum" TEXT NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "verifiedBy" TEXT,
  "verificationStatus" "ManufacturingEvidenceVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "ManufacturingEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManufacturingWorkflowDefinition_version_key" ON "ManufacturingWorkflowDefinition"("version");
CREATE INDEX "ManufacturingWorkflowDefinition_isActive_effectiveFrom_idx" ON "ManufacturingWorkflowDefinition"("isActive", "effectiveFrom");
CREATE UNIQUE INDEX "ManufacturingWorkflowGroup_workflowDefinitionId_legacyGroupCode_key" ON "ManufacturingWorkflowGroup"("workflowDefinitionId", "legacyGroupCode");
CREATE UNIQUE INDEX "ManufacturingWorkflowGroup_workflowDefinitionId_flowGroupCode_key" ON "ManufacturingWorkflowGroup"("workflowDefinitionId", "flowGroupCode");
CREATE UNIQUE INDEX "ManufacturingWorkflowGroup_workflowDefinitionId_flowGroupOrder_key" ON "ManufacturingWorkflowGroup"("workflowDefinitionId", "flowGroupOrder");
CREATE UNIQUE INDEX "ManufacturingWorkflowStepDefinition_workflowDefinitionId_legacyStepCode_key" ON "ManufacturingWorkflowStepDefinition"("workflowDefinitionId", "legacyStepCode");
CREATE UNIQUE INDEX "ManufacturingWorkflowStepDefinition_workflowDefinitionId_flowSerial_key" ON "ManufacturingWorkflowStepDefinition"("workflowDefinitionId", "flowSerial");
CREATE UNIQUE INDEX "ManufacturingWorkflowStepDefinition_workflowDefinitionId_route_key" ON "ManufacturingWorkflowStepDefinition"("workflowDefinitionId", "route");
CREATE UNIQUE INDEX "ManufacturingWorkflowStepDefinition_workflowGroupId_displayOrder_key" ON "ManufacturingWorkflowStepDefinition"("workflowGroupId", "displayOrder");
CREATE INDEX "ManufacturingWorkflowStepDefinition_workflowDefinitionId_executionOrder_isActive_idx" ON "ManufacturingWorkflowStepDefinition"("workflowDefinitionId", "executionOrder", "isActive");
CREATE INDEX "ManufacturingWorkflowStepDefinition_workflowGroupId_applicabilityType_idx" ON "ManufacturingWorkflowStepDefinition"("workflowGroupId", "applicabilityType");
CREATE UNIQUE INDEX "ManufacturingStepDependency_stepId_prerequisiteStepId_dependencyType_key" ON "ManufacturingStepDependency"("stepId", "prerequisiteStepId", "dependencyType");
CREATE INDEX "ManufacturingStepDependency_prerequisiteStepId_idx" ON "ManufacturingStepDependency"("prerequisiteStepId");
CREATE UNIQUE INDEX "ManufacturingRun_workspaceId_idempotencyKey_key" ON "ManufacturingRun"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "ManufacturingRun_workspaceId_productionOrderId_key" ON "ManufacturingRun"("workspaceId", "productionOrderId");
CREATE INDEX "ManufacturingRun_workspaceId_status_updatedAt_idx" ON "ManufacturingRun"("workspaceId", "status", "updatedAt");
CREATE INDEX "ManufacturingRun_workflowDefinitionId_status_idx" ON "ManufacturingRun"("workflowDefinitionId", "status");
CREATE INDEX "ManufacturingRun_productionPlanId_idx" ON "ManufacturingRun"("productionPlanId");
CREATE INDEX "ManufacturingRun_productId_idx" ON "ManufacturingRun"("productId");
CREATE UNIQUE INDEX "ManufacturingRunStep_runId_stepDefinitionId_occurrenceKey_key" ON "ManufacturingRunStep"("runId", "stepDefinitionId", "occurrenceKey");
CREATE INDEX "ManufacturingRunStep_runId_status_applicable_idx" ON "ManufacturingRunStep"("runId", "status", "applicable");
CREATE INDEX "ManufacturingRunStep_stepDefinitionId_status_idx" ON "ManufacturingRunStep"("stepDefinitionId", "status");
CREATE INDEX "ManufacturingRunStep_sourceRecordType_sourceRecordId_idx" ON "ManufacturingRunStep"("sourceRecordType", "sourceRecordId");
CREATE UNIQUE INDEX "ManufacturingRunStepTransition_runStepId_idempotencyKey_key" ON "ManufacturingRunStepTransition"("runStepId", "idempotencyKey");
CREATE INDEX "ManufacturingRunStepTransition_runStepId_createdAt_idx" ON "ManufacturingRunStepTransition"("runStepId", "createdAt");
CREATE INDEX "ManufacturingRunStepTransition_performedByUserId_createdAt_idx" ON "ManufacturingRunStepTransition"("performedByUserId", "createdAt");
CREATE INDEX "ManufacturingRunStepTransition_sourceRecordType_sourceRecordId_idx" ON "ManufacturingRunStepTransition"("sourceRecordType", "sourceRecordId");
CREATE UNIQUE INDEX "ManufacturingPostingLink_workspaceId_idempotencyKey_key" ON "ManufacturingPostingLink"("workspaceId", "idempotencyKey");
CREATE UNIQUE INDEX "ManufacturingPostingLink_workspaceId_sourceDocumentType_sourceDocumentId_postingType_key" ON "ManufacturingPostingLink"("workspaceId", "sourceDocumentType", "sourceDocumentId", "postingType");
CREATE INDEX "ManufacturingPostingLink_workspaceId_runId_postedAt_idx" ON "ManufacturingPostingLink"("workspaceId", "runId", "postedAt");
CREATE INDEX "ManufacturingPostingLink_stockMovementId_idx" ON "ManufacturingPostingLink"("stockMovementId");
CREATE INDEX "ManufacturingPostingLink_journalId_idx" ON "ManufacturingPostingLink"("journalId");
CREATE INDEX "ManufacturingPostingLink_reversedById_idx" ON "ManufacturingPostingLink"("reversedById");
CREATE UNIQUE INDEX "ManufacturingEvidence_workspaceId_runId_stepDefinitionId_sha256Checksum_key" ON "ManufacturingEvidence"("workspaceId", "runId", "stepDefinitionId", "sha256Checksum");
CREATE INDEX "ManufacturingEvidence_runId_runStepId_idx" ON "ManufacturingEvidence"("runId", "runStepId");
CREATE INDEX "ManufacturingEvidence_workspaceId_verificationStatus_createdAt_idx" ON "ManufacturingEvidence"("workspaceId", "verificationStatus", "createdAt");
CREATE INDEX "ManufacturingEvidence_sha256Checksum_idx" ON "ManufacturingEvidence"("sha256Checksum");

ALTER TABLE "ManufacturingWorkflowGroup" ADD CONSTRAINT "ManufacturingWorkflowGroup_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "ManufacturingWorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingWorkflowStepDefinition" ADD CONSTRAINT "ManufacturingWorkflowStepDefinition_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "ManufacturingWorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingWorkflowStepDefinition" ADD CONSTRAINT "ManufacturingWorkflowStepDefinition_workflowGroupId_fkey" FOREIGN KEY ("workflowGroupId") REFERENCES "ManufacturingWorkflowGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingStepDependency" ADD CONSTRAINT "ManufacturingStepDependency_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ManufacturingWorkflowStepDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingStepDependency" ADD CONSTRAINT "ManufacturingStepDependency_prerequisiteStepId_fkey" FOREIGN KEY ("prerequisiteStepId") REFERENCES "ManufacturingWorkflowStepDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingRun" ADD CONSTRAINT "ManufacturingRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingRun" ADD CONSTRAINT "ManufacturingRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingRun" ADD CONSTRAINT "ManufacturingRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingRun" ADD CONSTRAINT "ManufacturingRun_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "ManufacturingWorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingRun" ADD CONSTRAINT "ManufacturingRun_productionPlanId_fkey" FOREIGN KEY ("productionPlanId") REFERENCES "ManufacturingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingRun" ADD CONSTRAINT "ManufacturingRun_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingRun" ADD CONSTRAINT "ManufacturingRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingRunStep" ADD CONSTRAINT "ManufacturingRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ManufacturingRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingRunStep" ADD CONSTRAINT "ManufacturingRunStep_stepDefinitionId_fkey" FOREIGN KEY ("stepDefinitionId") REFERENCES "ManufacturingWorkflowStepDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingRunStepTransition" ADD CONSTRAINT "ManufacturingRunStepTransition_runStepId_fkey" FOREIGN KEY ("runStepId") REFERENCES "ManufacturingRunStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPostingLink" ADD CONSTRAINT "ManufacturingPostingLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPostingLink" ADD CONSTRAINT "ManufacturingPostingLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPostingLink" ADD CONSTRAINT "ManufacturingPostingLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPostingLink" ADD CONSTRAINT "ManufacturingPostingLink_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ManufacturingRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPostingLink" ADD CONSTRAINT "ManufacturingPostingLink_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPostingLink" ADD CONSTRAINT "ManufacturingPostingLink_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "VoucherEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingPostingLink" ADD CONSTRAINT "ManufacturingPostingLink_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "ManufacturingPostingLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingEvidence" ADD CONSTRAINT "ManufacturingEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingEvidence" ADD CONSTRAINT "ManufacturingEvidence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingEvidence" ADD CONSTRAINT "ManufacturingEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingEvidence" ADD CONSTRAINT "ManufacturingEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ManufacturingRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingEvidence" ADD CONSTRAINT "ManufacturingEvidence_runStepId_fkey" FOREIGN KEY ("runStepId") REFERENCES "ManufacturingRunStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingEvidence" ADD CONSTRAINT "ManufacturingEvidence_stepDefinitionId_fkey" FOREIGN KEY ("stepDefinitionId") REFERENCES "ManufacturingWorkflowStepDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Canonical definition v1. These are fixed reference/configuration rows, not
-- manufacturing transactions or UAT/demo records.
INSERT INTO "ManufacturingWorkflowDefinition" (
  "id", "version", "isActive", "effectiveFrom", "totalGroups", "totalSteps", "updatedAt"
) VALUES ('mwf-a-k-v1', 1, true, DATE '2026-08-30', 11, 159, CURRENT_TIMESTAMP);

INSERT INTO "ManufacturingWorkflowGroup" (
  "id", "workflowDefinitionId", "legacyGroupCode", "flowGroupCode", "name",
  "flowGroupOrder", "expectedStepCount", "updatedAt"
) VALUES
  ('mwfg-a-k-v1-A', 'mwf-a-k-v1', '01', 'A', 'Dashboard & Control Center', 1, 7, CURRENT_TIMESTAMP),
  ('mwfg-a-k-v1-B', 'mwf-a-k-v1', '11', 'B', 'Setup, Workflow & Security', 2, 9, CURRENT_TIMESTAMP),
  ('mwfg-a-k-v1-C', 'mwf-a-k-v1', '02', 'C', 'Products, Formula & Resources', 3, 20, CURRENT_TIMESTAMP),
  ('mwfg-a-k-v1-D', 'mwf-a-k-v1', '03', 'D', 'Planning, MRP & Scheduling', 4, 12, CURRENT_TIMESTAMP),
  ('mwfg-a-k-v1-E', 'mwf-a-k-v1', '04', 'E', 'Production Orders & Pre-Production Readiness', 5, 10, CURRENT_TIMESTAMP),
  ('mwfg-a-k-v1-F', 'mwf-a-k-v1', '05', 'F', 'Raw Material Quality & Material Preparation', 6, 20, CURRENT_TIMESTAMP),
  ('mwfg-a-k-v1-G', 'mwf-a-k-v1', '06', 'G', 'Production Execution & In-Process Control', 7, 18, CURRENT_TIMESTAMP),
  ('mwfg-a-k-v1-H', 'mwf-a-k-v1', '07', 'H', 'Finished Product Quality & Compliance', 8, 11, CURRENT_TIMESTAMP),
  ('mwfg-a-k-v1-I', 'mwf-a-k-v1', '08', 'I', 'Packaging, Finished Goods & QA Release', 9, 20, CURRENT_TIMESTAMP),
  ('mwfg-a-k-v1-J', 'mwf-a-k-v1', '09', 'J', 'Costing & Accounts', 10, 16, CURRENT_TIMESTAMP),
  ('mwfg-a-k-v1-K', 'mwf-a-k-v1', '10', 'K', 'Reports, Audit, Close & Archive', 11, 16, CURRENT_TIMESTAMP);

WITH raw("flowSerial", "legacyStepCode", "title") AS (VALUES
  (1, '01.01', 'Manufacturing Dashboard'),
  (2, '01.02', 'Production Control Center'),
  (3, '01.03', 'Pending Approvals'),
  (4, '01.04', 'Material Shortage Alerts'),
  (5, '01.05', 'Quality & Compliance Alerts'),
  (6, '01.06', 'Equipment and Calibration Alerts'),
  (7, '01.07', 'Batch Release Queue'),
  (8, '11.01', 'Manufacturing Settings'),
  (9, '11.02', 'Approval Workflow'),
  (10, '11.03', 'User Roles and Permissions'),
  (11, '11.04', 'Electronic Signature Settings'),
  (12, '11.05', 'Document Numbering'),
  (13, '11.06', 'Status Configuration'),
  (14, '11.07', 'Alert and Notification Rules'),
  (15, '11.08', 'Print Templates'),
  (16, '11.09', 'Integration Settings'),
  (17, '02.01', 'Manufactured Products'),
  (18, '02.02', 'Raw Material Master'),
  (19, '02.03', 'Packaging Material Master'),
  (20, '02.04', 'Intermediate and Bulk Products'),
  (21, '02.09', 'Work Centers'),
  (22, '02.10', 'Rooms and Production Lines'),
  (23, '02.11', 'Equipment and Machines'),
  (24, '02.12', 'Tools, Dies and Moulds'),
  (25, '02.20', 'Manufacturing Calendar and Shifts'),
  (26, '02.08', 'Operations and Process Stages'),
  (27, '02.07', 'Production Routing'),
  (28, '02.05', 'BOM / Master Formula'),
  (29, '02.06', 'Formula Versions'),
  (30, '02.13', 'Quality Specifications'),
  (31, '02.14', 'Test Methods'),
  (32, '02.15', 'Packaging Configurations'),
  (33, '02.16', 'Label and Artwork Versions'),
  (34, '02.17', 'Batch and Serial Number Rules'),
  (35, '02.19', 'Reason Codes'),
  (36, '02.18', 'Cost Drivers and Overhead Rules'),
  (37, '03.01', 'Demand Plan'),
  (38, '03.02', 'Master Production Schedule'),
  (39, '03.11', 'Campaign Planning'),
  (40, '03.03', 'Material Requirement Planning'),
  (41, '03.07', 'Material Availability'),
  (42, '03.08', 'Material Shortage'),
  (43, '03.09', 'Suggested Purchase Requisition'),
  (44, '03.10', 'Suggested Stock Transfer'),
  (45, '03.12', 'What-if Production Planning'),
  (46, '03.04', 'Production Plan'),
  (47, '03.05', 'Capacity Planning'),
  (48, '03.06', 'Production Schedule Calendar'),
  (49, '04.01', 'All Production Orders'),
  (50, '04.02', 'Assembly Production Orders'),
  (51, '04.03', 'Pharmaceutical Batch Orders'),
  (52, '04.07', 'Subcontract Production Orders'),
  (53, '04.08', 'Production Order Approvals'),
  (54, '04.09', 'Production Order Amendments'),
  (55, '07.21', 'Qualification and Validation'),
  (56, '07.18', 'Environmental Monitoring'),
  (57, '07.19', 'Water and Utility Monitoring'),
  (58, '07.20', 'Cleaning and Line Clearance'),
  (59, '07.01', 'Incoming Material Sampling'),
  (60, '07.02', 'QC Sample Management'),
  (61, '07.03', 'Test Result Entry'),
  (62, '07.04', 'Material Release or Rejection'),
  (63, '05.02', 'Material Requisition'),
  (64, '05.11', 'Batch/Lot Allocation'),
  (65, '05.12', 'FEFO Allocation'),
  (66, '05.01', 'Material Reservation'),
  (67, '05.06', 'Material Staging'),
  (68, '05.04', 'Weighing and Dispensing'),
  (69, '05.05', 'Dispensing Verification'),
  (70, '05.03', 'Material Issue'),
  (71, '05.07', 'Material Consumption'),
  (72, '05.08', 'Additional Material Issue'),
  (73, '05.09', 'Material Substitution'),
  (74, '05.10', 'Unused Material Return'),
  (75, '05.13', 'Material Reconciliation'),
  (76, '05.14', 'Stock Status Transfer'),
  (77, '05.15', 'Rejected Material and Destruction'),
  (78, '07.24', 'Destruction Approval'),
  (79, '06.01', 'Active Production'),
  (80, '06.02', 'Electronic Batch Manufacturing Record — eBMR'),
  (81, '06.04', 'Operation Execution'),
  (82, '06.05', 'Process Parameter Entry'),
  (83, '06.06', 'In-process Checks'),
  (84, '07.05', 'In-process Quality Control'),
  (85, '06.07', 'Stage-wise Yield'),
  (86, '06.08', 'WIP Transfer'),
  (87, '06.10', 'Partial Production Completion'),
  (88, '07.06', 'Bulk Product Testing'),
  (89, '06.09', 'Bulk Product Transfer'),
  (90, '06.11', 'Downtime Entry'),
  (91, '06.12', 'Damage and Scrap'),
  (92, '04.05', 'Rework Orders'),
  (93, '04.06', 'Reprocessing Orders'),
  (94, '06.13', 'Rework and Reprocessing'),
  (95, '06.15', 'Operator Handover'),
  (96, '06.14', 'Production Completion'),
  (97, '08.09', 'Serialisation — Preallocation'),
  (98, '07.07', 'Finished Product Testing'),
  (99, '07.11', 'Out of Specification — OOS'),
  (100, '07.12', 'Out of Trend — OOT'),
  (101, '07.13', 'Deviations'),
  (102, '07.14', 'CAPA'),
  (103, '07.15', 'Change Control'),
  (104, '07.16', 'Stability Studies'),
  (105, '07.17', 'Retention Samples'),
  (106, '07.22', 'Product Quality Review — PQR/APR'),
  (107, '07.23', 'Complaints and Recalls'),
  (108, '08.01', 'Packaging Plan'),
  (109, '04.04', 'Packaging Orders — Order Register'),
  (110, '08.02', 'Packaging Order'),
  (111, '06.03', 'Batch Packaging Record — eBPR'),
  (112, '08.03', 'Packaging Line Clearance'),
  (113, '08.04', 'Packaging Material Issue'),
  (114, '08.05', 'Coding and Printing'),
  (115, '08.06', 'Label Control'),
  (116, '08.07', 'Packaging Execution'),
  (117, '08.10', 'Parent-child Aggregation'),
  (118, '08.11', 'Carton and Shipper Packing'),
  (119, '08.12', 'Palletisation'),
  (120, '08.08', 'Packaging Reconciliation'),
  (121, '08.13', 'Finished Goods Receipt'),
  (122, '08.14', 'Finished Goods Quarantine'),
  (123, '07.08', 'QA Batch Review'),
  (124, '07.09', 'Final Batch Release'),
  (125, '07.10', 'Certificate of Analysis'),
  (126, '08.15', 'QA Release'),
  (127, '08.16', 'Released Finished Goods'),
  (128, '09.01', 'Estimated Production Cost'),
  (129, '09.02', 'Standard Cost'),
  (130, '09.04', 'Material Consumption Cost'),
  (131, '09.05', 'Labour Cost'),
  (132, '09.06', 'Machine Cost'),
  (133, '09.07', 'Factory Overhead'),
  (134, '09.08', 'Packaging Cost'),
  (135, '09.09', 'Subcontract Cost'),
  (136, '09.10', 'WIP Valuation'),
  (137, '09.12', 'Yield Loss Cost'),
  (138, '09.13', 'Scrap and Rejection Cost'),
  (139, '09.03', 'Actual Batch Cost'),
  (140, '09.11', 'Production Variance'),
  (141, '09.14', 'Cost of Goods Manufactured'),
  (142, '09.15', 'Accounting Journal Preview'),
  (143, '09.16', 'Posted Manufacturing Journals'),
  (144, '10.01', 'Production Reports'),
  (145, '10.02', 'Material Reports'),
  (146, '10.03', 'WIP Reports'),
  (147, '10.04', 'Batch and Lot Reports'),
  (148, '10.05', 'Costing Reports'),
  (149, '10.06', 'Quality Reports'),
  (150, '10.07', 'Compliance Reports'),
  (151, '10.08', 'Packaging Reports'),
  (152, '10.09', 'Traceability Reports'),
  (153, '10.10', 'Executive Analytics'),
  (154, '11.10', 'Audit Trail'),
  (155, '11.14', 'Validation Documents'),
  (156, '11.11', 'Audit Trail Review'),
  (157, '04.10', 'Cancelled and Closed Orders'),
  (158, '11.12', 'Period Lock'),
  (159, '11.13', 'Data Retention and Archive')
), shaped AS (
  SELECT raw.*,
    CASE
      WHEN "flowSerial" <= 7 THEN 'A' WHEN "flowSerial" <= 16 THEN 'B'
      WHEN "flowSerial" <= 36 THEN 'C' WHEN "flowSerial" <= 48 THEN 'D'
      WHEN "flowSerial" <= 58 THEN 'E' WHEN "flowSerial" <= 78 THEN 'F'
      WHEN "flowSerial" <= 96 THEN 'G' WHEN "flowSerial" <= 107 THEN 'H'
      WHEN "flowSerial" <= 127 THEN 'I' WHEN "flowSerial" <= 143 THEN 'J'
      ELSE 'K'
    END AS group_code,
    CASE
      WHEN "flowSerial" IN (1,2,3,4,5,6,7,41,42,49,79,109,127,143) THEN 'MONITORING'
      WHEN "flowSerial" IN (104,105,106) THEN 'PERIODIC'
      WHEN "flowSerial" IN (50,51) THEN 'MODE_SPECIFIC'
      WHEN "flowSerial" IN (20,39,43,44,45,52,54,55,56,57,72,73,74,77,78,88,89,90,91,92,93,94,95,99,100,101,102,103,107,113,119,125,129,131,132,133,134,135,137,138,140) THEN 'CONDITIONAL'
      ELSE 'REQUIRED'
    END AS applicability_type,
    CASE
      WHEN "flowSerial" IN (67,76,86,89,126) THEN 'INVENTORY_ONLY'
      WHEN "flowSerial" = 139 THEN 'GENERAL_LEDGER_ONLY'
      WHEN "flowSerial" IN (70,72,74,77,91,113,121) THEN 'INVENTORY_AND_GL'
      ELSE 'NONE'
    END AS posting_effect
  FROM raw
), typed AS (
  SELECT shaped.*,
    CASE
      WHEN posting_effect <> 'NONE' THEN 'POSTING'
      WHEN "flowSerial" IN (1,2,3,4,5,6,7,41,42,49,79,109,127,143) THEN 'MONITORING'
      WHEN "flowSerial" BETWEEN 144 AND 154 THEN 'REPORT'
      WHEN "flowSerial" IN (53,69,78,123,124,142,156,158) THEN 'APPROVAL'
      WHEN "flowSerial" BETWEEN 8 AND 16 OR "flowSerial" >= 155 THEN 'CONTROL'
      ELSE 'OPERATIONAL'
    END AS step_type
  FROM shaped
)
INSERT INTO "ManufacturingWorkflowStepDefinition" (
  "id", "workflowDefinitionId", "workflowGroupId", "legacyStepCode", "flowSerial",
  "title", "displayOrder", "executionOrder", "stepType", "applicabilityType",
  "repeatable", "postingEffect", "idempotencyPolicy", "route", "permissionKey",
  "completionRule", "allowedModes", "isBlocking", "isActive", "updatedAt"
)
SELECT
  'mwfs-a-k-v1-' || lpad("flowSerial"::text, 3, '0'),
  'mwf-a-k-v1',
  'mwfg-a-k-v1-' || group_code,
  "legacyStepCode", "flowSerial", "title",
  CASE group_code
    WHEN 'A' THEN "flowSerial" WHEN 'B' THEN "flowSerial" - 7
    WHEN 'C' THEN "flowSerial" - 16 WHEN 'D' THEN "flowSerial" - 36
    WHEN 'E' THEN "flowSerial" - 48 WHEN 'F' THEN "flowSerial" - 58
    WHEN 'G' THEN "flowSerial" - 78 WHEN 'H' THEN "flowSerial" - 96
    WHEN 'I' THEN "flowSerial" - 107 WHEN 'J' THEN "flowSerial" - 127
    ELSE "flowSerial" - 143
  END,
  "flowSerial",
  step_type::"ManufacturingWorkflowStepType",
  applicability_type::"ManufacturingWorkflowApplicabilityType",
  ("flowSerial" BETWEEN 59 AND 78 OR "flowSerial" BETWEEN 81 AND 95 OR
   "flowSerial" BETWEEN 98 AND 107 OR "flowSerial" BETWEEN 110 AND 126 OR
   "flowSerial" BETWEEN 130 AND 140),
  posting_effect::"ManufacturingWorkflowPostingEffect",
  CASE WHEN posting_effect = 'NONE' THEN 'NOT_APPLICABLE' ELSE 'REQUIRED' END::"ManufacturingWorkflowIdempotencyPolicy",
  '/app/manufacturing/dashboard?section=' ||
    CASE group_code WHEN 'A' THEN 'dashboard' WHEN 'B' THEN 'setup'
      WHEN 'C' THEN 'masters' WHEN 'D' THEN 'planning' WHEN 'E' THEN 'orders'
      WHEN 'F' THEN 'materials' WHEN 'G' THEN 'execution' WHEN 'H' THEN 'quality'
      WHEN 'I' THEN 'packaging' WHEN 'J' THEN 'costing' ELSE 'reports' END ||
    '&view=' || lower(trim(both '-' from regexp_replace("title", '[^A-Za-z0-9]+', '-', 'g'))),
  CASE
    WHEN "flowSerial" <= 7 THEN 'manufacturing.view'
    WHEN "flowSerial" <= 16 THEN CASE WHEN "flowSerial" = 10 THEN 'manufacturing.audit.review' ELSE 'manufacturing.configure' END
    WHEN "flowSerial" <= 36 THEN 'manufacturing.master.manage'
    WHEN "flowSerial" <= 48 THEN 'manufacturing.plan.manage'
    WHEN "flowSerial" <= 58 THEN CASE WHEN "flowSerial" = 53 THEN 'manufacturing.order.approve' ELSE 'manufacturing.order.create' END
    WHEN "flowSerial" <= 62 THEN 'manufacturing.quality.inspect'
    WHEN "flowSerial" <= 69 THEN 'manufacturing.material.reserve'
    WHEN "flowSerial" <= 78 THEN CASE WHEN "flowSerial" = 78 THEN 'manufacturing.quality.manage' ELSE 'manufacturing.material.issue' END
    WHEN "flowSerial" <= 96 THEN 'manufacturing.production.execute'
    WHEN "flowSerial" <= 107 THEN CASE WHEN "flowSerial" = 98 THEN 'manufacturing.quality.inspect' ELSE 'manufacturing.quality.manage' END
    WHEN "flowSerial" <= 122 THEN 'manufacturing.packaging.execute'
    WHEN "flowSerial" <= 127 THEN 'manufacturing.quality.release'
    WHEN "flowSerial" <= 143 THEN 'manufacturing.cost.post'
    WHEN "flowSerial" <= 153 THEN 'manufacturing.reports.view'
    WHEN "flowSerial" <= 156 THEN 'manufacturing.audit.review'
    WHEN "flowSerial" = 157 THEN 'manufacturing.close'
    ELSE 'manufacturing.configure'
  END,
  jsonb_build_object(
    'kind', CASE WHEN posting_effect <> 'NONE' THEN 'DOMAIN_POSTING'
      WHEN step_type = 'APPROVAL' THEN 'APPROVAL'
      WHEN step_type IN ('MONITORING', 'REPORT') THEN 'OBSERVED'
      ELSE 'DOMAIN_COMPLETION' END,
    'requiredStatus', CASE WHEN posting_effect <> 'NONE' THEN 'POSTED'
      WHEN step_type = 'APPROVAL' THEN 'APPROVED' ELSE 'COMPLETED' END
  ),
  CASE WHEN "flowSerial" = 50 THEN ARRAY['GENERAL','HYBRID']::text[]
    WHEN "flowSerial" = 51 THEN ARRAY['PHARMACEUTICAL','HYBRID']::text[]
    ELSE ARRAY['GENERAL','PHARMACEUTICAL','HYBRID']::text[] END,
  applicability_type NOT IN ('MONITORING', 'PERIODIC'),
  true,
  CURRENT_TIMESTAMP
FROM typed;

WITH raw(step_serial, prerequisite_serial, dependency_type) AS (VALUES
  (9,8,'HARD'),(10,8,'HARD'),(11,8,'HARD'),(12,8,'HARD'),(13,8,'HARD'),(14,8,'HARD'),(15,8,'HARD'),(16,8,'HARD'),
  (17,8,'GROUP_GATE'),(17,9,'GROUP_GATE'),(17,10,'GROUP_GATE'),(17,11,'GROUP_GATE'),(17,12,'GROUP_GATE'),(17,13,'GROUP_GATE'),(17,14,'GROUP_GATE'),(17,15,'GROUP_GATE'),(17,16,'GROUP_GATE'),
  (22,21,'HARD'),(23,21,'HARD'),(25,21,'HARD'),(26,21,'HARD'),(27,21,'HARD'),(27,22,'HARD'),(27,23,'HARD'),(27,26,'HARD'),
  (28,17,'HARD'),(28,18,'HARD'),(29,28,'HARD'),(30,17,'HARD'),(31,30,'HARD'),(32,19,'HARD'),(33,32,'HARD'),(34,17,'HARD'),(36,17,'HARD'),(36,21,'HARD'),
  (37,17,'GROUP_GATE'),(37,18,'GROUP_GATE'),(37,19,'GROUP_GATE'),(37,21,'GROUP_GATE'),(37,22,'GROUP_GATE'),(37,23,'GROUP_GATE'),(37,24,'GROUP_GATE'),(37,25,'GROUP_GATE'),(37,26,'GROUP_GATE'),(37,27,'GROUP_GATE'),(37,28,'GROUP_GATE'),(37,29,'GROUP_GATE'),(37,30,'GROUP_GATE'),(37,31,'GROUP_GATE'),(37,32,'GROUP_GATE'),(37,33,'GROUP_GATE'),(37,34,'GROUP_GATE'),(37,35,'GROUP_GATE'),(37,36,'GROUP_GATE'),
  (38,37,'HARD'),(39,38,'CONDITIONAL'),(40,38,'HARD'),(40,28,'HARD'),(41,40,'HARD'),(42,41,'HARD'),(43,42,'CONDITIONAL'),(44,42,'CONDITIONAL'),(45,40,'CONDITIONAL'),(46,40,'HARD'),(46,42,'HARD'),(47,46,'HARD'),(47,27,'HARD'),(47,25,'HARD'),(48,46,'HARD'),(48,47,'HARD'),
  (49,48,'GROUP_GATE'),(50,46,'HARD'),(50,48,'HARD'),(51,46,'HARD'),(51,48,'HARD'),(52,46,'CONDITIONAL'),(52,48,'CONDITIONAL'),(53,46,'HARD'),(53,48,'HARD'),(54,53,'HARD'),(55,53,'CONDITIONAL'),(56,53,'CONDITIONAL'),(57,53,'CONDITIONAL'),(58,53,'HARD'),
  (59,53,'GROUP_GATE'),(59,58,'GROUP_GATE'),(60,59,'HARD'),(61,60,'HARD'),(62,61,'HARD'),(63,53,'HARD'),(63,62,'HARD'),(64,63,'HARD'),(65,64,'HARD'),(66,63,'HARD'),(66,64,'HARD'),(66,65,'HARD'),(67,66,'HARD'),(68,67,'HARD'),(69,68,'HARD'),(70,69,'POSTING_PRECONDITION'),(71,70,'HARD'),(72,70,'CONDITIONAL'),(73,66,'CONDITIONAL'),(74,70,'CONDITIONAL'),(75,70,'HARD'),(75,71,'HARD'),(76,70,'HARD'),(77,62,'CONDITIONAL'),(78,77,'CONDITIONAL'),
  (79,70,'GROUP_GATE'),(80,70,'HARD'),(81,70,'HARD'),(81,58,'HARD'),(82,81,'HARD'),(83,82,'HARD'),(84,83,'HARD'),(85,83,'HARD'),(85,84,'HARD'),(86,85,'HARD'),(87,86,'HARD'),(88,87,'CONDITIONAL'),(89,88,'CONDITIONAL'),(90,81,'CONDITIONAL'),(91,81,'CONDITIONAL'),(92,91,'CONDITIONAL'),(93,91,'CONDITIONAL'),(94,91,'CONDITIONAL'),(95,81,'CONDITIONAL'),(96,75,'HARD'),(96,81,'HARD'),(96,83,'HARD'),(96,84,'HARD'),(96,85,'HARD'),
  (97,96,'GROUP_GATE'),(98,97,'HARD'),(99,98,'CONDITIONAL'),(100,98,'CONDITIONAL'),(101,98,'CONDITIONAL'),(102,101,'CONDITIONAL'),(103,101,'CONDITIONAL'),(104,98,'CONDITIONAL'),(105,98,'CONDITIONAL'),(106,98,'CONDITIONAL'),(107,98,'CONDITIONAL'),
  (108,98,'GROUP_GATE'),(109,108,'HARD'),(110,108,'HARD'),(111,110,'HARD'),(112,110,'HARD'),(113,112,'POSTING_PRECONDITION'),(114,113,'HARD'),(115,114,'HARD'),(116,115,'HARD'),(117,116,'HARD'),(118,117,'HARD'),(119,118,'CONDITIONAL'),(120,113,'HARD'),(120,115,'HARD'),(120,116,'HARD'),(121,120,'POSTING_PRECONDITION'),(121,98,'HARD'),(122,121,'HARD'),(123,121,'HARD'),(123,98,'HARD'),(124,123,'HARD'),(125,124,'CONDITIONAL'),(126,121,'POSTING_PRECONDITION'),(126,124,'HARD'),(127,126,'HARD'),
  (128,127,'GROUP_GATE'),(129,128,'CONDITIONAL'),(130,70,'HARD'),(130,121,'HARD'),(131,130,'CONDITIONAL'),(132,130,'CONDITIONAL'),(133,130,'CONDITIONAL'),(134,130,'CONDITIONAL'),(135,130,'CONDITIONAL'),(136,130,'CONDITIONAL'),(137,130,'CONDITIONAL'),(138,130,'CONDITIONAL'),(139,130,'HARD'),(139,136,'HARD'),(139,121,'HARD'),(140,139,'CONDITIONAL'),(141,139,'HARD'),(142,141,'HARD'),(143,142,'HARD'),
  (144,143,'GROUP_GATE'),(145,143,'GROUP_GATE'),(146,143,'GROUP_GATE'),(147,143,'GROUP_GATE'),(148,143,'GROUP_GATE'),(149,143,'GROUP_GATE'),(150,143,'GROUP_GATE'),(151,143,'GROUP_GATE'),(152,143,'GROUP_GATE'),(153,143,'GROUP_GATE'),(154,143,'GROUP_GATE'),
  (155,144,'HARD'),(155,145,'HARD'),(155,146,'HARD'),(155,147,'HARD'),(155,148,'HARD'),(155,149,'HARD'),(155,150,'HARD'),(155,151,'HARD'),(155,152,'HARD'),(155,153,'HARD'),(155,154,'HARD'),
  (156,154,'HARD'),(156,155,'HARD'),(157,143,'HARD'),(157,156,'HARD'),(158,155,'HARD'),(158,156,'HARD'),(158,157,'HARD'),(159,158,'HARD')
)
INSERT INTO "ManufacturingStepDependency" (
  "id", "stepId", "prerequisiteStepId", "requiredStatus", "dependencyType", "conditionExpression"
)
SELECT
  'mwfd-a-k-v1-' || lpad(step_serial::text, 3, '0') || '-' || lpad(prerequisite_serial::text, 3, '0') || '-' || lower(dependency_type),
  'mwfs-a-k-v1-' || lpad(step_serial::text, 3, '0'),
  'mwfs-a-k-v1-' || lpad(prerequisite_serial::text, 3, '0'),
  (prerequisite."completionRule" ->> 'requiredStatus')::"ManufacturingWorkflowStepStatus",
  dependency_type::"ManufacturingWorkflowDependencyType",
  CASE WHEN dependency_type = 'CONDITIONAL'
    THEN jsonb_build_object('whenStepApplicable', step_serial) ELSE NULL END
FROM raw
JOIN "ManufacturingWorkflowStepDefinition" prerequisite
  ON prerequisite."workflowDefinitionId" = 'mwf-a-k-v1'
 AND prerequisite."flowSerial" = prerequisite_serial;

-- Fail the entire migration when the canonical reference catalog is not exact.
DO $$
DECLARE
  definition_id TEXT := 'mwf-a-k-v1';
  group_count INTEGER;
  step_count INTEGER;
  dependency_count INTEGER;
BEGIN
  SELECT count(*) INTO group_count
  FROM "ManufacturingWorkflowGroup" WHERE "workflowDefinitionId" = definition_id;
  SELECT count(*) INTO step_count
  FROM "ManufacturingWorkflowStepDefinition" WHERE "workflowDefinitionId" = definition_id;
  IF group_count <> 11 THEN
    RAISE EXCEPTION 'A-K workflow migration expected 11 groups, found %', group_count;
  END IF;
  IF step_count <> 159 THEN
    RAISE EXCEPTION 'A-K workflow migration expected 159 steps, found %', step_count;
  END IF;
  IF (
    SELECT md5(string_agg(
      format('%s:%s:%s', "flowSerial", "legacyStepCode", "title"),
      chr(10) ORDER BY "flowSerial"
    ))
    FROM "ManufacturingWorkflowStepDefinition"
    WHERE "workflowDefinitionId" = definition_id
  ) IS DISTINCT FROM '1098b6ce8f4879631176b997f1f8ebc0' THEN
    RAISE EXCEPTION 'A-K workflow exact serial, legacy-code and title mapping mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "ManufacturingWorkflowGroup" g
    LEFT JOIN "ManufacturingWorkflowStepDefinition" s ON s."workflowGroupId" = g."id"
    WHERE g."workflowDefinitionId" = definition_id
    GROUP BY g."id", g."expectedStepCount"
    HAVING count(s."id") <> g."expectedStepCount"
  ) THEN RAISE EXCEPTION 'A-K workflow group step count mismatch'; END IF;
  IF EXISTS (
    SELECT serial FROM generate_series(1,159) AS expected(serial)
    EXCEPT
    SELECT "flowSerial" FROM "ManufacturingWorkflowStepDefinition"
    WHERE "workflowDefinitionId" = definition_id
  ) THEN RAISE EXCEPTION 'A-K workflow global serial has a gap'; END IF;
  IF EXISTS (
    SELECT "legacyStepCode" FROM "ManufacturingWorkflowStepDefinition"
    WHERE "workflowDefinitionId" = definition_id
    GROUP BY "legacyStepCode" HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'A-K workflow has duplicate legacy step codes'; END IF;
  IF EXISTS (
    SELECT "flowSerial" FROM "ManufacturingWorkflowStepDefinition"
    WHERE "workflowDefinitionId" = definition_id
    GROUP BY "flowSerial" HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'A-K workflow has duplicate global serials'; END IF;
  IF EXISTS (
    SELECT 1
    FROM "ManufacturingWorkflowStepDefinition" s
    JOIN "ManufacturingWorkflowGroup" g ON g."id" = s."workflowGroupId"
    WHERE s."workflowDefinitionId" = definition_id
      AND (s."route" <> '/app/manufacturing/dashboard?section=' ||
        CASE g."flowGroupCode" WHEN 'A' THEN 'dashboard' WHEN 'B' THEN 'setup'
          WHEN 'C' THEN 'masters' WHEN 'D' THEN 'planning' WHEN 'E' THEN 'orders'
          WHEN 'F' THEN 'materials' WHEN 'G' THEN 'execution' WHEN 'H' THEN 'quality'
          WHEN 'I' THEN 'packaging' WHEN 'J' THEN 'costing' ELSE 'reports' END ||
        '&view=' || lower(trim(both '-' from regexp_replace(s."title", '[^A-Za-z0-9]+', '-', 'g')))
        OR s."permissionKey" NOT IN (
          'manufacturing.view', 'manufacturing.configure',
          'manufacturing.master.manage', 'manufacturing.plan.manage',
          'manufacturing.order.create', 'manufacturing.order.approve',
          'manufacturing.material.reserve', 'manufacturing.material.issue',
          'manufacturing.production.execute', 'manufacturing.quality.manage',
          'manufacturing.quality.inspect', 'manufacturing.quality.release',
          'manufacturing.packaging.execute', 'manufacturing.cost.post',
          'manufacturing.close', 'manufacturing.reports.view',
          'manufacturing.audit.review'
        ))
  ) THEN RAISE EXCEPTION 'A-K workflow contains an invalid route or permission'; END IF;
  IF EXISTS (
    SELECT 1 FROM "ManufacturingWorkflowStepDefinition"
    WHERE "workflowDefinitionId" = definition_id
      AND "postingEffect" <> 'NONE'
      AND "idempotencyPolicy" <> 'REQUIRED'
  ) THEN RAISE EXCEPTION 'A-K posting step is missing required idempotency'; END IF;
  IF EXISTS (
    SELECT 1 FROM "ManufacturingStepDependency" d
    LEFT JOIN "ManufacturingWorkflowStepDefinition" s ON s."id" = d."stepId"
    LEFT JOIN "ManufacturingWorkflowStepDefinition" p ON p."id" = d."prerequisiteStepId"
    WHERE s."id" IS NULL OR p."id" IS NULL
      OR s."workflowDefinitionId" <> definition_id
      OR p."workflowDefinitionId" <> definition_id
  ) THEN RAISE EXCEPTION 'A-K workflow dependency references a missing/cross-version step'; END IF;
  SELECT count(*) INTO dependency_count
  FROM "ManufacturingStepDependency" d
  JOIN "ManufacturingWorkflowStepDefinition" s ON s."id" = d."stepId"
  WHERE s."workflowDefinitionId" = definition_id;
  IF dependency_count <> 218 THEN
    RAISE EXCEPTION 'A-K workflow migration expected 218 dependencies, found %', dependency_count;
  END IF;
  IF (
    SELECT md5(string_agg(
      format('%s:%s:%s', s."flowSerial", p."flowSerial", d."dependencyType"::text),
      chr(10) ORDER BY s."flowSerial", p."flowSerial", d."dependencyType"::text
    ))
    FROM "ManufacturingStepDependency" d
    JOIN "ManufacturingWorkflowStepDefinition" s ON s."id" = d."stepId"
    JOIN "ManufacturingWorkflowStepDefinition" p ON p."id" = d."prerequisiteStepId"
    WHERE s."workflowDefinitionId" = definition_id
  ) IS DISTINCT FROM 'c247c8e833c3ac50b5a29fb6d371720b' THEN
    RAISE EXCEPTION 'A-K workflow exact dependency mapping mismatch';
  END IF;
  IF EXISTS (
    WITH RECURSIVE reach(step_id, prerequisite_id) AS (
      SELECT d."stepId", d."prerequisiteStepId"
      FROM "ManufacturingStepDependency" d
      JOIN "ManufacturingWorkflowStepDefinition" s ON s."id" = d."stepId"
      WHERE s."workflowDefinitionId" = definition_id
      UNION
      SELECT reach.step_id, d."prerequisiteStepId"
      FROM reach
      JOIN "ManufacturingStepDependency" d ON d."stepId" = reach.prerequisite_id
    )
    SELECT 1 FROM reach WHERE step_id = prerequisite_id LIMIT 1
  ) THEN RAISE EXCEPTION 'A-K workflow dependencies contain a cycle'; END IF;
END $$;

-- Keep every run step pinned to its run's definition version. Non-repeatable
-- definitions may only have the canonical PRIMARY row; repeat occurrences are
-- reserved for definitions explicitly marked repeatable.
CREATE FUNCTION "enforceManufacturingRunStepDefinition"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  run_definition_id TEXT;
  step_definition_id TEXT;
  step_is_repeatable BOOLEAN;
BEGIN
  SELECT r."workflowDefinitionId", sd."workflowDefinitionId", sd."repeatable"
    INTO run_definition_id, step_definition_id, step_is_repeatable
  FROM "ManufacturingRun" r
  CROSS JOIN "ManufacturingWorkflowStepDefinition" sd
  WHERE r."id" = NEW."runId" AND sd."id" = NEW."stepDefinitionId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing run step references a missing run or definition step';
  END IF;
  IF run_definition_id <> step_definition_id THEN
    RAISE EXCEPTION 'Manufacturing run step must use the workflow definition pinned to its run';
  END IF;
  IF btrim(NEW."occurrenceKey") = '' THEN
    RAISE EXCEPTION 'Manufacturing run step occurrence key cannot be blank';
  END IF;
  IF NEW."occurrenceKey" <> btrim(NEW."occurrenceKey") THEN
    RAISE EXCEPTION 'Manufacturing run step occurrence key must be trimmed';
  END IF;
  IF upper(NEW."occurrenceKey") = 'PRIMARY' AND NEW."occurrenceKey" <> 'PRIMARY' THEN
    RAISE EXCEPTION 'The PRIMARY manufacturing occurrence key is reserved';
  END IF;
  IF NOT step_is_repeatable AND NEW."occurrenceKey" <> 'PRIMARY' THEN
    RAISE EXCEPTION 'Non-repeatable manufacturing steps only allow the PRIMARY occurrence';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "ManufacturingRunStep_definition_guard"
BEFORE INSERT OR UPDATE OF "runId", "stepDefinitionId", "occurrenceKey"
ON "ManufacturingRunStep"
FOR EACH ROW EXECUTE FUNCTION "enforceManufacturingRunStepDefinition"();

-- Workflow versions are append-only reference data. A definition may only be
-- activated/deactivated; its identity and catalog contents must never change
-- underneath an existing run. Future mappings are installed as a new version.
CREATE FUNCTION "preventManufacturingWorkflowDefinitionRewrite"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Manufacturing workflow definitions are append-only';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['isActive', 'updatedAt'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['isActive', 'updatedAt']) THEN
    RAISE EXCEPTION 'Manufacturing workflow definition metadata is immutable; install a new version';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "ManufacturingWorkflowDefinition_append_only"
BEFORE UPDATE OR DELETE ON "ManufacturingWorkflowDefinition"
FOR EACH ROW EXECUTE FUNCTION "preventManufacturingWorkflowDefinitionRewrite"();

CREATE FUNCTION "preventManufacturingWorkflowCatalogRewrite"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  definition_id TEXT;
  related_definition_id TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Manufacturing workflow catalog rows are immutable; install a new definition version';
  END IF;

  IF TG_TABLE_NAME = 'ManufacturingWorkflowGroup' THEN
    definition_id := NEW."workflowDefinitionId";
  ELSIF TG_TABLE_NAME = 'ManufacturingWorkflowStepDefinition' THEN
    definition_id := NEW."workflowDefinitionId";
    SELECT "workflowDefinitionId" INTO related_definition_id
    FROM "ManufacturingWorkflowGroup" WHERE "id" = NEW."workflowGroupId";
    IF related_definition_id IS DISTINCT FROM definition_id THEN
      RAISE EXCEPTION 'Manufacturing workflow step and group must belong to the same definition version';
    END IF;
  ELSIF TG_TABLE_NAME = 'ManufacturingStepDependency' THEN
    SELECT "workflowDefinitionId" INTO definition_id
    FROM "ManufacturingWorkflowStepDefinition" WHERE "id" = NEW."stepId";
    SELECT "workflowDefinitionId" INTO related_definition_id
    FROM "ManufacturingWorkflowStepDefinition" WHERE "id" = NEW."prerequisiteStepId";
    IF related_definition_id IS DISTINCT FROM definition_id THEN
      RAISE EXCEPTION 'Manufacturing workflow dependencies cannot cross definition versions';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "ManufacturingRun"
    WHERE "workflowDefinitionId" = definition_id
  ) THEN
    RAISE EXCEPTION 'A workflow definition used by a manufacturing run is immutable; install a new version';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "ManufacturingWorkflowGroup_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "ManufacturingWorkflowGroup"
FOR EACH ROW EXECUTE FUNCTION "preventManufacturingWorkflowCatalogRewrite"();

CREATE TRIGGER "ManufacturingWorkflowStepDefinition_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "ManufacturingWorkflowStepDefinition"
FOR EACH ROW EXECUTE FUNCTION "preventManufacturingWorkflowCatalogRewrite"();

CREATE TRIGGER "ManufacturingStepDependency_append_only"
BEFORE INSERT OR UPDATE OR DELETE ON "ManufacturingStepDependency"
FOR EACH ROW EXECUTE FUNCTION "preventManufacturingWorkflowCatalogRewrite"();
