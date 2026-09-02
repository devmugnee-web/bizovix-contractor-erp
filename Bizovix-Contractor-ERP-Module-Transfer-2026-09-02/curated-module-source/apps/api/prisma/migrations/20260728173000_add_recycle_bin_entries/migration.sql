CREATE TYPE "RecycleBinEntryKind" AS ENUM ('VOUCHER', 'PARTY', 'ITEM');

CREATE TABLE "RecycleBinEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "RecycleBinEntryKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "refNo" TEXT,
    "partyName" TEXT NOT NULL,
    "txnType" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "deletedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedByUserId" TEXT,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "RecycleBinEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecycleBinEntry_workspaceId_kind_deletedOn_idx" ON "RecycleBinEntry"("workspaceId", "kind", "deletedOn");
CREATE INDEX "RecycleBinEntry_workspaceId_entityId_idx" ON "RecycleBinEntry"("workspaceId", "entityId");

ALTER TABLE "RecycleBinEntry" ADD CONSTRAINT "RecycleBinEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecycleBinEntry" ADD CONSTRAINT "RecycleBinEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecycleBinEntry" ADD CONSTRAINT "RecycleBinEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecycleBinEntry" ADD CONSTRAINT "RecycleBinEntry_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
