CREATE TABLE "WorkspaceAppSettings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "settings" JSONB NOT NULL,
  "backupHistory" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "taxRates" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "taxGroups" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "currencies" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkspaceAppSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceAppSettings_workspaceId_namespace_key" ON "WorkspaceAppSettings"("workspaceId", "namespace");
CREATE INDEX "WorkspaceAppSettings_tenantId_companyId_idx" ON "WorkspaceAppSettings"("tenantId", "companyId");
CREATE INDEX "WorkspaceAppSettings_workspaceId_updatedAt_idx" ON "WorkspaceAppSettings"("workspaceId", "updatedAt");
