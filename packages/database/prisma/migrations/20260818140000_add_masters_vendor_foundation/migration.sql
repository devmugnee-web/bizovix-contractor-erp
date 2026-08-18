-- Masters + Vendor/Supplier/Subcontractor/Item Foundation
-- Purely additive: new enums, new tables, and nullable new columns on existing tables.
-- Does not touch the Tender->Closeout backbone (ProjectContract/ProjectBill/CompletionCertificate/
-- DefectLiabilityPeriod/RetentionRelease/ProjectHandover and friends are untouched).

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('CLIENT', 'VENDOR', 'SUPPLIER', 'SUBCONTRACTOR', 'SERVICE_PROVIDER', 'OTHER');

-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MasterCategoryType" AS ENUM ('VENDOR', 'MATERIAL', 'SUBCONTRACTOR_TRADE');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('MATERIAL', 'SERVICE', 'EQUIPMENT', 'CONSUMABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable: additive nullable column, no backfill needed
ALTER TABLE "documents" ADD COLUMN "partyId" TEXT;

-- AlterTable: additive nullable columns + relax organizationMasterId to optional
-- (existing rows keep their organizationMasterId; new Party-linked contacts leave it NULL)
ALTER TABLE "organization_contacts"
  ADD COLUMN "contactRole" TEXT,
  ADD COLUMN "partyId" TEXT,
  ALTER COLUMN "organizationMasterId" DROP NOT NULL;

-- AlterTable: additive nullable column, no backfill needed
ALTER TABLE "payables" ADD COLUMN "partyId" TEXT;

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "roles" "PartyRole"[],
    "status" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "contactPerson" TEXT,
    "phone" TEXT,
    "alternatePhone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "address" TEXT,
    "district" TEXT,
    "country" TEXT,
    "binVat" TEXT,
    "tinNo" TEXT,
    "tradeLicenseNo" TEXT,
    "registrationNo" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNo" TEXT,
    "bankBranch" TEXT,
    "bankRoutingSwift" TEXT,
    "paymentTermId" TEXT,
    "defaultCurrency" TEXT DEFAULT 'BDT',
    "creditLimit" DECIMAL(18,2),
    "categoryId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "tradeCategoryId" TEXT,
    "specialization" TEXT,
    "defaultRetentionPct" DECIMAL(5,2),
    "performanceRating" DECIMAL(3,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "MasterCategoryType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units_of_measurement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_of_measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "itemType" "ItemType" NOT NULL DEFAULT 'MATERIAL',
    "categoryId" TEXT,
    "uomId" TEXT,
    "defaultPurchaseRate" DECIMAL(18,2),
    "preferredVendorId" TEXT,
    "specification" TEXT,
    "brandModel" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parties_organizationId_status_idx" ON "parties"("organizationId", "status");

-- CreateIndex
CREATE INDEX "parties_organizationId_name_idx" ON "parties"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "parties_organizationId_code_key" ON "parties"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "subcontractor_profiles_partyId_key" ON "subcontractor_profiles"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "master_categories_organizationId_type_name_key" ON "master_categories"("organizationId", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measurement_organizationId_code_key" ON "units_of_measurement"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_organizationId_name_key" ON "payment_terms"("organizationId", "name");

-- CreateIndex
CREATE INDEX "items_organizationId_status_idx" ON "items"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "items_organizationId_itemCode_key" ON "items"("organizationId", "itemCode");

-- CreateIndex
CREATE INDEX "organization_contacts_organizationId_partyId_idx" ON "organization_contacts"("organizationId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_contacts_organizationId_partyId_mobile_key" ON "organization_contacts"("organizationId", "partyId", "mobile");

-- CreateIndex
CREATE INDEX "payables_organizationId_partyId_idx" ON "payables"("organizationId", "partyId");

-- AddForeignKey
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "master_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_profiles" ADD CONSTRAINT "subcontractor_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_profiles" ADD CONSTRAINT "subcontractor_profiles_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_profiles" ADD CONSTRAINT "subcontractor_profiles_tradeCategoryId_fkey" FOREIGN KEY ("tradeCategoryId") REFERENCES "master_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_categories" ADD CONSTRAINT "master_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units_of_measurement" ADD CONSTRAINT "units_of_measurement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "master_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "units_of_measurement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_preferredVendorId_fkey" FOREIGN KEY ("preferredVendorId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
