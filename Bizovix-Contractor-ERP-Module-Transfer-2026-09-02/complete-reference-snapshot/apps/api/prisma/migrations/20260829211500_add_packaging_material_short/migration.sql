-- Persist a real packaging-order exception instead of losing the order when
-- its packaging materials cannot yet be reserved.
ALTER TYPE "ManufacturingPackagingOrderStatus" ADD VALUE 'MATERIAL_SHORT' BEFORE 'DRAFT';

ALTER TABLE "ManufacturingPackagingOrder"
ADD COLUMN "materialShortage" JSONB;
