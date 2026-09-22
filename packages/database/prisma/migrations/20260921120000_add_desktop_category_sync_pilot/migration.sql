-- Additive only. Apply to an isolated validation database before any rollout.
-- Feature remains disabled unless DESKTOP_SYNC_ENABLED=true.
CREATE TABLE "desktop_sync_devices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "desktop_sync_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "desktop_sync_devices_membership_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "organization_users"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "desktop_sync_devices_organizationId_userId_idx" ON "desktop_sync_devices"("organizationId", "userId");

CREATE TABLE "desktop_sync_clocks" (
    "organizationId" TEXT NOT NULL,
    "epoch" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "desktop_sync_clocks_pkey" PRIMARY KEY ("organizationId"),
    CONSTRAINT "desktop_sync_clocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "desktop_sync_clocks_sequence_check" CHECK ("sequence" >= 0)
);

CREATE TABLE "desktop_sync_category_versions" (
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "desktop_sync_category_versions_pkey" PRIMARY KEY ("organizationId", "categoryId"),
    CONSTRAINT "desktop_sync_category_versions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "master_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "desktop_sync_category_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "desktop_sync_category_versions_version_check" CHECK ("version" > 0)
);

CREATE TABLE "desktop_sync_receipts" (
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "desktop_sync_receipts_pkey" PRIMARY KEY ("organizationId", "deviceId", "operationId"),
    CONSTRAINT "desktop_sync_receipts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "desktop_sync_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "desktop_sync_receipts_membership_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "organization_users"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "desktop_sync_changes" (
    "organizationId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "operationId" TEXT,
    "category" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "desktop_sync_changes_pkey" PRIMARY KEY ("organizationId", "sequence"),
    CONSTRAINT "desktop_sync_changes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "desktop_sync_changes_sequence_check" CHECK ("sequence" > 0)
);
