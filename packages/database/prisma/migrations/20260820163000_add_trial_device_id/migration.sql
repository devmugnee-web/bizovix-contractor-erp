warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- AlterTable
ALTER TABLE "vendor_license_keys" ADD COLUMN     "trialDeviceId" TEXT;

-- CreateIndex
CREATE INDEX "vendor_license_keys_trialDeviceId_idx" ON "vendor_license_keys"("trialDeviceId");

