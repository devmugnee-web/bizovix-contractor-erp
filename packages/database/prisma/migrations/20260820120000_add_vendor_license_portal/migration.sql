-- CreateEnum
CREATE TYPE "VendorLicenseType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION', 'TRIAL');

-- CreateEnum
CREATE TYPE "VendorLicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "VendorDeviceStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "vendor_admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_license_packages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "VendorLicenseType" NOT NULL DEFAULT 'SUBSCRIPTION',
    "maxDevices" INTEGER NOT NULL DEFAULT 3,
    "durationDays" INTEGER,
    "price" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "features" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_license_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_customers" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "organizationId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_license_keys" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "type" "VendorLicenseType" NOT NULL,
    "status" "VendorLicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxDevices" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_license_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_device_activations" (
    "id" TEXT NOT NULL,
    "licenseKeyId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "hostname" TEXT,
    "osInfo" TEXT,
    "appVersion" TEXT,
    "ipAddress" TEXT,
    "status" "VendorDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_device_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_license_events" (
    "id" TEXT NOT NULL,
    "licenseKeyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_license_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_download_events" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT,
    "companyName" TEXT,
    "version" TEXT,
    "platform" TEXT,
    "ipAddress" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_download_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_admin_users_email_key" ON "vendor_admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_license_packages_code_key" ON "vendor_license_packages"("code");

-- CreateIndex
CREATE INDEX "vendor_customers_email_idx" ON "vendor_customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_license_keys_licenseKey_key" ON "vendor_license_keys"("licenseKey");

-- CreateIndex
CREATE INDEX "vendor_license_keys_customerId_idx" ON "vendor_license_keys"("customerId");

-- CreateIndex
CREATE INDEX "vendor_license_keys_status_idx" ON "vendor_license_keys"("status");

-- CreateIndex
CREATE INDEX "vendor_license_keys_expiresAt_idx" ON "vendor_license_keys"("expiresAt");

-- CreateIndex
CREATE INDEX "vendor_device_activations_lastSeenAt_idx" ON "vendor_device_activations"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_device_activations_licenseKeyId_deviceId_key" ON "vendor_device_activations"("licenseKeyId", "deviceId");

-- CreateIndex
CREATE INDEX "vendor_license_events_licenseKeyId_idx" ON "vendor_license_events"("licenseKeyId");

-- CreateIndex
CREATE INDEX "vendor_license_events_createdAt_idx" ON "vendor_license_events"("createdAt");

-- CreateIndex
CREATE INDEX "vendor_download_events_createdAt_idx" ON "vendor_download_events"("createdAt");

-- AddForeignKey
ALTER TABLE "vendor_license_keys" ADD CONSTRAINT "vendor_license_keys_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "vendor_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_license_keys" ADD CONSTRAINT "vendor_license_keys_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "vendor_license_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_device_activations" ADD CONSTRAINT "vendor_device_activations_licenseKeyId_fkey" FOREIGN KEY ("licenseKeyId") REFERENCES "vendor_license_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_license_events" ADD CONSTRAINT "vendor_license_events_licenseKeyId_fkey" FOREIGN KEY ("licenseKeyId") REFERENCES "vendor_license_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_download_events" ADD CONSTRAINT "vendor_download_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "vendor_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

