ALTER TABLE "audit_logs"
ADD COLUMN "module" TEXT NOT NULL DEFAULT 'System',
ADD COLUMN "description" TEXT NOT NULL DEFAULT 'System activity',
ADD COLUMN "referenceNo" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN "userAgent" TEXT;

CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");
CREATE INDEX "audit_logs_organizationId_userId_idx" ON "audit_logs"("organizationId", "userId");
CREATE INDEX "audit_logs_organizationId_module_idx" ON "audit_logs"("organizationId", "module");
CREATE INDEX "audit_logs_organizationId_action_idx" ON "audit_logs"("organizationId", "action");
CREATE INDEX "audit_logs_organizationId_status_idx" ON "audit_logs"("organizationId", "status");
