CREATE TABLE "CloudWorkspaceBackup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceName" TEXT NOT NULL,
    "sourceDeviceId" TEXT NOT NULL,
    "backupVersion" INTEGER NOT NULL,
    "exportType" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "counts" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CloudWorkspaceBackup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CloudWorkspaceBackup_workspaceId_checksumSha256_key" ON "CloudWorkspaceBackup"("workspaceId", "checksumSha256");
CREATE INDEX "CloudWorkspaceBackup_tenantId_companyId_idx" ON "CloudWorkspaceBackup"("tenantId", "companyId");
CREATE INDEX "CloudWorkspaceBackup_workspaceId_createdAt_idx" ON "CloudWorkspaceBackup"("workspaceId", "createdAt");
