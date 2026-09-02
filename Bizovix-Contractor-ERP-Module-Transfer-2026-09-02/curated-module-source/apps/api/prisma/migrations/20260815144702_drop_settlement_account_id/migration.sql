/*
  Warnings:

  - You are about to drop the column `settlementAccountId` on the `VoucherEntry` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "VoucherEntry" DROP CONSTRAINT "VoucherEntry_settlementAccountId_fkey";

-- DropIndex
DROP INDEX "VoucherEntry_settlementAccountId_idx";

-- AlterTable
ALTER TABLE "VoucherEntry" DROP COLUMN "settlementAccountId";
