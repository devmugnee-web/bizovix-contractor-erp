CREATE TYPE "ManufacturingDowntimeStatus" AS ENUM ('OPEN', 'ENDED');

CREATE TABLE "ManufacturingDowntimeEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "operationExecutionId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "status" "ManufacturingDowntimeStatus" NOT NULL DEFAULT 'OPEN',
  "reasonCode" TEXT,
  "reason" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "durationMinutes" DECIMAL(18,4),
  "startIdempotencyKey" TEXT NOT NULL,
  "endIdempotencyKey" TEXT,
  "startedByUserId" TEXT NOT NULL,
  "endedByUserId" TEXT,
  "startSignatureMeaning" TEXT,
  "endSignatureMeaning" TEXT,
  "startSignatureHash" TEXT,
  "endSignatureHash" TEXT,
  "startSignatureEvidence" JSONB,
  "endSignatureEvidence" JSONB,
  "endNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ManufacturingDowntimeEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManufacturingDowntimeEvent_workspaceId_startIdempotencyKey_key"
  ON "ManufacturingDowntimeEvent"("workspaceId", "startIdempotencyKey");
CREATE UNIQUE INDEX "ManufacturingDowntimeEvent_workspaceId_endIdempotencyKey_key"
  ON "ManufacturingDowntimeEvent"("workspaceId", "endIdempotencyKey");
CREATE INDEX "ManufacturingDowntimeEvent_workspaceId_status_startedAt_idx"
  ON "ManufacturingDowntimeEvent"("workspaceId", "status", "startedAt");
CREATE INDEX "ManufacturingDowntimeEvent_orderId_startedAt_idx"
  ON "ManufacturingDowntimeEvent"("orderId", "startedAt");
CREATE INDEX "ManufacturingDowntimeEvent_operationExecutionId_status_idx"
  ON "ManufacturingDowntimeEvent"("operationExecutionId", "status");
CREATE INDEX "ManufacturingDowntimeEvent_resourceId_startedAt_idx"
  ON "ManufacturingDowntimeEvent"("resourceId", "startedAt");

-- Exactly one active stop may own an operation or assigned resource at a time.
CREATE UNIQUE INDEX "ManufacturingDowntimeEvent_one_open_operation_key"
  ON "ManufacturingDowntimeEvent"("operationExecutionId")
  WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "ManufacturingDowntimeEvent_one_open_resource_key"
  ON "ManufacturingDowntimeEvent"("resourceId")
  WHERE "status" = 'OPEN';

ALTER TABLE "ManufacturingDowntimeEvent"
  ADD CONSTRAINT "ManufacturingDowntimeEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDowntimeEvent"
  ADD CONSTRAINT "ManufacturingDowntimeEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDowntimeEvent"
  ADD CONSTRAINT "ManufacturingDowntimeEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDowntimeEvent"
  ADD CONSTRAINT "ManufacturingDowntimeEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDowntimeEvent"
  ADD CONSTRAINT "ManufacturingDowntimeEvent_operationExecutionId_fkey"
  FOREIGN KEY ("operationExecutionId") REFERENCES "ManufacturingOperationExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDowntimeEvent"
  ADD CONSTRAINT "ManufacturingDowntimeEvent_resourceId_fkey"
  FOREIGN KEY ("resourceId") REFERENCES "ManufacturingResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDowntimeEvent"
  ADD CONSTRAINT "ManufacturingDowntimeEvent_startedByUserId_fkey"
  FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingDowntimeEvent"
  ADD CONSTRAINT "ManufacturingDowntimeEvent_endedByUserId_fkey"
  FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
