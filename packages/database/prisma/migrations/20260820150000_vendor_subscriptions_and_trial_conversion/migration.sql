-- CreateEnum
CREATE TYPE "VendorBillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "VendorSubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "vendor_license_packages" ADD COLUMN     "billingCycle" "VendorBillingCycle";

-- AlterTable
ALTER TABLE "vendor_license_keys" ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "convertedToLicenseId" TEXT;

-- AlterTable
ALTER TABLE "vendor_device_activations" ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vendor_license_events" ADD COLUMN     "actorAdminId" TEXT;

-- CreateTable
CREATE TABLE "vendor_subscriptions" (
    "id" TEXT NOT NULL,
    "licenseKeyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "billingCycle" "VendorBillingCycle" NOT NULL,
    "status" "VendorSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_subscriptions_licenseKeyId_key" ON "vendor_subscriptions"("licenseKeyId");

-- CreateIndex
CREATE INDEX "vendor_subscriptions_customerId_idx" ON "vendor_subscriptions"("customerId");

-- CreateIndex
CREATE INDEX "vendor_subscriptions_status_idx" ON "vendor_subscriptions"("status");

-- CreateIndex
CREATE INDEX "vendor_subscriptions_currentPeriodEnd_idx" ON "vendor_subscriptions"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_license_keys_convertedToLicenseId_key" ON "vendor_license_keys"("convertedToLicenseId");

-- AddForeignKey
ALTER TABLE "vendor_license_keys" ADD CONSTRAINT "vendor_license_keys_convertedToLicenseId_fkey" FOREIGN KEY ("convertedToLicenseId") REFERENCES "vendor_license_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_subscriptions" ADD CONSTRAINT "vendor_subscriptions_licenseKeyId_fkey" FOREIGN KEY ("licenseKeyId") REFERENCES "vendor_license_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_subscriptions" ADD CONSTRAINT "vendor_subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "vendor_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_subscriptions" ADD CONSTRAINT "vendor_subscriptions_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "vendor_license_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

