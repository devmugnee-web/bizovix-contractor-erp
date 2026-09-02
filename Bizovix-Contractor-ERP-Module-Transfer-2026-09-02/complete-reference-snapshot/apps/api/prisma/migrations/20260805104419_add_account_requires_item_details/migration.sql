-- DropIndex
DROP INDEX "VoucherEntry_sourceVoucherId_idx";

-- DropIndex
DROP INDEX "VoucherEntry_workspaceId_documentKind_idx";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "requiresItemDetails" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "WorkspaceAppSettings" ALTER COLUMN "backupHistory" DROP DEFAULT,
ALTER COLUMN "taxRates" DROP DEFAULT,
ALTER COLUMN "taxGroups" DROP DEFAULT,
ALTER COLUMN "currencies" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;
