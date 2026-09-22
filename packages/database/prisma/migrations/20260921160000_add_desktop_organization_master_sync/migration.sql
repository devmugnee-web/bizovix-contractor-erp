-- Add the independent create-only Organizations / Clients stream.
-- Existing rows, IDs, versions, category v1 and master stream clocks are retained.
ALTER TABLE "desktop_master_sync_clocks"
  DROP CONSTRAINT "desktop_master_sync_clocks_entityType_check",
  ADD CONSTRAINT "desktop_master_sync_clocks_entityType_check" CHECK ("entityType" IN ('uom', 'paymentTerm', 'organizationMaster'));
ALTER TABLE "desktop_master_sync_versions"
  DROP CONSTRAINT "desktop_master_sync_versions_entityType_check",
  ADD CONSTRAINT "desktop_master_sync_versions_entityType_check" CHECK ("entityType" IN ('uom', 'paymentTerm', 'organizationMaster'));
ALTER TABLE "desktop_master_sync_changes"
  DROP CONSTRAINT "desktop_master_sync_changes_entityType_check",
  ADD CONSTRAINT "desktop_master_sync_changes_entityType_check" CHECK ("entityType" IN ('uom', 'paymentTerm', 'organizationMaster'));
