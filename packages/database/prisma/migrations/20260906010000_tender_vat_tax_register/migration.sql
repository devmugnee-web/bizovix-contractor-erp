CREATE TYPE "TenderVatTaxEntryKind" AS ENUM ('SELF_DEPOSIT', 'BILL_DEDUCTION');

CREATE TABLE "tender_vat_tax_entries" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tenderId" TEXT NOT NULL,
  "taxType" "VatTaxCertificateType" NOT NULL,
  "entryKind" "TenderVatTaxEntryKind" NOT NULL,
  "entryDate" DATE NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "referenceNo" TEXT NOT NULL,
  "referenceKey" TEXT NOT NULL,
  "notes" TEXT,
  "requestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tender_vat_tax_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tender_vat_tax_entries_tender_fkey" FOREIGN KEY ("organizationId", "tenderId") REFERENCES "tenders" ("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tender_vat_tax_entries_positive_amount" CHECK ("amount" > 0),
  CONSTRAINT "tender_vat_tax_entries_reference_required" CHECK (length(trim("referenceKey")) > 0),
  CONSTRAINT "tender_vat_tax_entries_void_reason" CHECK ("voidedAt" IS NULL OR ("voidReason" IS NOT NULL AND length(trim("voidReason")) > 0))
);
CREATE UNIQUE INDEX "tender_vat_tax_entries_organizationId_requestId_key" ON "tender_vat_tax_entries" ("organizationId", "requestId");
CREATE UNIQUE INDEX "tender_vat_tax_entries_active_reference_key" ON "tender_vat_tax_entries" ("organizationId", "tenderId", "taxType", "referenceKey") WHERE "voidedAt" IS NULL;
CREATE INDEX "tender_vat_tax_entries_organizationId_tenderId_entryDate_idx" ON "tender_vat_tax_entries" ("organizationId", "tenderId", "entryDate");
CREATE INDEX "tender_vat_tax_entries_organizationId_entryDate_voidedAt_idx" ON "tender_vat_tax_entries" ("organizationId", "entryDate", "voidedAt");
