-- Reconcile manufacturing schema integrity after early deployments of the
-- actual-cost and serial/packaging foundations. This migration is additive:
-- it does not create, update, rename, deactivate, re-parent, or delete any
-- Chart of Accounts row (including protected system accounts).

-- Preserve high-precision evidence for quantity/rate calculations. Posted GL
-- amounts continue to be rounded to the currency minor unit by application code.
ALTER TABLE "ManufacturingActualCostPosting"
  ALTER COLUMN "basisQuantity" SET DATA TYPE DECIMAL(18,6),
  ALTER COLUMN "rate" SET DATA TYPE DECIMAL(24,8);

ALTER TABLE "ManufacturingCostAllocation"
  ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,6),
  ALTER COLUMN "previousUnitCost" SET DATA TYPE DECIMAL(24,8),
  ALTER COLUMN "revisedUnitCost" SET DATA TYPE DECIMAL(24,8);

ALTER TABLE "ManufacturingCostDriver"
  ALTER COLUMN "rate" SET DATA TYPE DECIMAL(24,8);

ALTER TABLE "ManufacturingStandardCostLine"
  ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,6),
  ALTER COLUMN "rate" SET DATA TYPE DECIMAL(24,8);

ALTER TABLE "ManufacturingStandardCostVersion"
  ALTER COLUMN "totalUnitCost" SET DATA TYPE DECIMAL(24,8);

-- One serial may be represented by at most one label inside a packaging order.
-- Nullable serial IDs remain allowed for unassigned labels.
DROP INDEX IF EXISTS "ManufacturingPackagingLabel_packagingOrderId_serialId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingPackagingLabel_packagingOrderId_serialId_key"
  ON "ManufacturingPackagingLabel"("packagingOrderId", "serialId");

-- Some early databases received only the core packaging foreign keys. Add the
-- complete tenant/workspace/user/item protection without rewriting business data.
DO $manufacturing_integrity$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingSerialRule_tenantId_fkey') THEN
    ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingSerialRule_companyId_fkey') THEN
    ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingSerialRule_workspaceId_fkey') THEN
    ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingSerialRule_inventoryItemId_fkey') THEN
    ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_inventoryItemId_fkey"
      FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingSerialRule_createdByUserId_fkey') THEN
    ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingSerialRule_activatedByUserId_fkey') THEN
    ALTER TABLE "ManufacturingSerialRule" ADD CONSTRAINT "ManufacturingSerialRule_activatedByUserId_fkey"
      FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackagingOrder_tenantId_fkey') THEN
    ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackagingOrder_companyId_fkey') THEN
    ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackagingOrder_workspaceId_fkey') THEN
    ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackagingOrder_lineClearedByUserId_fkey') THEN
    ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_lineClearedByUserId_fkey"
      FOREIGN KEY ("lineClearedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackagingOrder_createdByUserId_fkey') THEN
    ALTER TABLE "ManufacturingPackagingOrder" ADD CONSTRAINT "ManufacturingPackagingOrder_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackagingReconciliation_inventoryItemId_fkey') THEN
    ALTER TABLE "ManufacturingPackagingReconciliation" ADD CONSTRAINT "ManufacturingPackagingReconciliation_inventoryItemId_fkey"
      FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackagingEvent_createdByUserId_fkey') THEN
    ALTER TABLE "ManufacturingPackagingEvent" ADD CONSTRAINT "ManufacturingPackagingEvent_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackagingLabel_workspaceId_fkey') THEN
    ALTER TABLE "ManufacturingPackagingLabel" ADD CONSTRAINT "ManufacturingPackagingLabel_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackagingLabel_createdByUserId_fkey') THEN
    ALTER TABLE "ManufacturingPackagingLabel" ADD CONSTRAINT "ManufacturingPackagingLabel_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackagingLabel_updatedByUserId_fkey') THEN
    ALTER TABLE "ManufacturingPackagingLabel" ADD CONSTRAINT "ManufacturingPackagingLabel_updatedByUserId_fkey"
      FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackageUnit_workspaceId_fkey') THEN
    ALTER TABLE "ManufacturingPackageUnit" ADD CONSTRAINT "ManufacturingPackageUnit_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ManufacturingPackageUnit_createdByUserId_fkey') THEN
    ALTER TABLE "ManufacturingPackageUnit" ADD CONSTRAINT "ManufacturingPackageUnit_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$manufacturing_integrity$;

-- Re-apply the complete permission catalogue idempotently. This repairs early
-- databases that were migrated before the quality-master permission was added.
WITH permission_seed("key", "resource", "action") AS (
  VALUES
    ('manufacturing.view', 'manufacturing', 'view'),
    ('manufacturing.configure', 'settings', 'configure'),
    ('manufacturing.master.manage', 'master', 'manage'),
    ('manufacturing.plan.manage', 'production-plan', 'manage'),
    ('manufacturing.order.create', 'production-order', 'create'),
    ('manufacturing.order.approve', 'production-order', 'approve'),
    ('manufacturing.material.reserve', 'material-reservation', 'create'),
    ('manufacturing.material.issue', 'material-issue', 'post'),
    ('manufacturing.production.execute', 'production-execution', 'post'),
    ('manufacturing.quality.manage', 'quality-master', 'manage'),
    ('manufacturing.quality.inspect', 'quality-inspection', 'post'),
    ('manufacturing.quality.release', 'quality-release', 'approve'),
    ('manufacturing.packaging.execute', 'packaging', 'post'),
    ('manufacturing.cost.post', 'production-cost', 'post'),
    ('manufacturing.close', 'production-order', 'close'),
    ('manufacturing.reports.view', 'manufacturing-report', 'view'),
    ('manufacturing.audit.review', 'workflow-review', 'review')
)
INSERT INTO "Permission" ("id", "key", "moduleKey", "resource", "action", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."key", 'manufacturing', p."resource", p."action", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM permission_seed p
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "allowed")
SELECT gen_random_uuid()::text, r."id", p."id", true
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."moduleKey" = 'manufacturing'
  AND (
    r."code" IN ('OWNER', 'SUPER_ADMIN', 'ADMIN')
    OR (
      r."code" IN ('INVENTORY_MANAGER', 'STORE_KEEPER')
      AND p."key" IN (
        'manufacturing.view', 'manufacturing.material.reserve',
        'manufacturing.material.issue', 'manufacturing.production.execute',
        'manufacturing.packaging.execute', 'manufacturing.reports.view'
      )
    )
    OR (
      r."code" = 'ACCOUNTS_MANAGER'
      AND p."key" IN (
        'manufacturing.view', 'manufacturing.cost.post',
        'manufacturing.close', 'manufacturing.reports.view',
        'manufacturing.audit.review'
      )
    )
    OR (
      r."code" = 'ACCOUNTS_OFFICER'
      AND p."key" IN (
        'manufacturing.view', 'manufacturing.cost.post',
        'manufacturing.reports.view'
      )
    )
    OR (
      r."code" IN ('QUALITY_MANAGER', 'QA_MANAGER', 'QC_MANAGER', 'QUALITY_OFFICER', 'QA_OFFICER', 'QC_OFFICER')
      AND p."key" IN (
        'manufacturing.view', 'manufacturing.quality.manage',
        'manufacturing.quality.inspect', 'manufacturing.quality.release',
        'manufacturing.audit.review', 'manufacturing.reports.view'
      )
    )
  )
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "allowed" = true;
