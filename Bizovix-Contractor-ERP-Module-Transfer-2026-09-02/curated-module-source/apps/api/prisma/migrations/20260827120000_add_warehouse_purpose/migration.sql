CREATE TYPE "WarehouseType" AS ENUM (
  'GENERAL',
  'RAW_MATERIAL',
  'WIP',
  'FINISHED_GOODS',
  'REJECTED',
  'SCRAP',
  'SHOWROOM'
);

ALTER TABLE "Warehouse"
  ADD COLUMN "type" "WarehouseType" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "allowGrn" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowSales" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowMaterialIssue" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Warehouse_workspaceId_type_isActive_idx"
  ON "Warehouse"("workspaceId", "type", "isActive");
