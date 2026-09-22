-- Additive UOM / Payment Term streams. Original category metadata remains unchanged.
CREATE TABLE "desktop_master_sync_clocks" (
  "organizationId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "epoch" TEXT NOT NULL,
  "sequence" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "desktop_master_sync_clocks_pkey" PRIMARY KEY ("organizationId", "entityType"),
  CONSTRAINT "desktop_master_sync_clocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "desktop_master_sync_clocks_entityType_check" CHECK ("entityType" IN ('uom', 'paymentTerm')),
  CONSTRAINT "desktop_master_sync_clocks_sequence_check" CHECK ("sequence" >= 0)
);
CREATE TABLE "desktop_master_sync_versions" (
  "organizationId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "desktop_master_sync_versions_pkey" PRIMARY KEY ("organizationId", "entityType", "entityId"),
  CONSTRAINT "desktop_master_sync_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "desktop_master_sync_versions_entityType_check" CHECK ("entityType" IN ('uom', 'paymentTerm')),
  CONSTRAINT "desktop_master_sync_versions_version_check" CHECK ("version" > 0)
);
CREATE TABLE "desktop_master_sync_changes" (
  "organizationId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "sequence" BIGINT NOT NULL,
  "entityId" TEXT NOT NULL,
  "operationId" TEXT,
  "record" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "desktop_master_sync_changes_pkey" PRIMARY KEY ("organizationId", "entityType", "sequence"),
  CONSTRAINT "desktop_master_sync_changes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "desktop_master_sync_changes_entityType_check" CHECK ("entityType" IN ('uom', 'paymentTerm')),
  CONSTRAINT "desktop_master_sync_changes_sequence_check" CHECK ("sequence" > 0)
);
