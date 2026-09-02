CREATE TABLE "PayrollSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cycleType" TEXT NOT NULL DEFAULT 'CALENDAR_MONTH',
    "cycleStartDay" INTEGER NOT NULL DEFAULT 1,
    "paymentDay" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollSettings_workspaceId_key" ON "PayrollSettings"("workspaceId");
CREATE INDEX "PayrollSettings_tenantId_idx" ON "PayrollSettings"("tenantId");
CREATE INDEX "PayrollSettings_companyId_idx" ON "PayrollSettings"("companyId");

ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
