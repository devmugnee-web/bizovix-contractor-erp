CREATE TYPE "InventoryItemKind" AS ENUM ('PRODUCT', 'SERVICE');

ALTER TABLE "InventoryItem"
ADD COLUMN "kind" "InventoryItemKind" NOT NULL DEFAULT 'PRODUCT';

CREATE INDEX "InventoryItem_workspaceId_kind_status_idx"
ON "InventoryItem"("workspaceId", "kind", "status");
