-- AlterTable
ALTER TABLE "FixedAsset" ADD COLUMN     "manualDepreciationAmount" DECIMAL(18,4),
ADD COLUMN     "useManualDepreciation" BOOLEAN NOT NULL DEFAULT false;
