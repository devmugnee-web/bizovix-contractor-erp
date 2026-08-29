CREATE TYPE "VatTaxCertificateType" AS ENUM (
  'VAT',
  'TAX'
);

CREATE TYPE "VatTaxCertificateStatus" AS ENUM (
  'PENDING',
  'UNDER_PROCESSING',
  'ISSUED',
  'NOT_ISSUED',
  'REJECTED',
  'RETURNED'
);

CREATE TABLE "vat_tax_certificates" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "cmsWorkId" TEXT NOT NULL,
  "contractId" TEXT,
  "certificateType" "VatTaxCertificateType" NOT NULL,
  "applicationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "certificateNo" TEXT,
  "issueDate" TIMESTAMP(3),
  "validTill" TIMESTAMP(3),
  "amount" DECIMAL(18,2),
  "issuingAuthority" TEXT,
  "status" "VatTaxCertificateStatus" NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vat_tax_certificates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vat_tax_certificates_certificateNo_not_blank_check"
    CHECK ("certificateNo" IS NULL OR btrim("certificateNo") <> ''),
  CONSTRAINT "vat_tax_certificates_amount_nonnegative_check"
    CHECK ("amount" IS NULL OR "amount" >= 0),
  CONSTRAINT "vat_tax_certificates_validity_check"
    CHECK ("validTill" IS NULL OR ("issueDate" IS NOT NULL AND "validTill" >= "issueDate")),
  CONSTRAINT "vat_tax_certificates_issued_fields_check"
    CHECK (
      "status" <> 'ISSUED'
      OR (
        "certificateNo" IS NOT NULL
        AND "issueDate" IS NOT NULL
        AND "validTill" IS NOT NULL
        AND "amount" IS NOT NULL
        AND "amount" > 0
      )
    )
);

ALTER TABLE "documents" ADD COLUMN "vatTaxCertificateId" TEXT;

CREATE INDEX "vat_tax_cert_org_type_no_idx"
  ON "vat_tax_certificates"("organizationId", "certificateType", "certificateNo");
CREATE INDEX "vat_tax_certificates_organizationId_cmsWorkId_status_idx"
  ON "vat_tax_certificates"("organizationId", "cmsWorkId", "status");
CREATE INDEX "vat_tax_certificates_organizationId_contractId_idx"
  ON "vat_tax_certificates"("organizationId", "contractId");
CREATE INDEX "vat_tax_certificates_organizationId_certificateType_status_idx"
  ON "vat_tax_certificates"("organizationId", "certificateType", "status");
CREATE INDEX "vat_tax_certificates_organizationId_applicationDate_idx"
  ON "vat_tax_certificates"("organizationId", "applicationDate");
CREATE INDEX "vat_tax_certificates_organizationId_issueDate_idx"
  ON "vat_tax_certificates"("organizationId", "issueDate");
CREATE INDEX "vat_tax_certificates_organizationId_updatedAt_idx"
  ON "vat_tax_certificates"("organizationId", "updatedAt");

-- Certificate numbers come from an external authority. Treat case-only variants as the same
-- number within one tenant and certificate type, while allowing multiple pending NULL numbers.
CREATE UNIQUE INDEX "vat_tax_cert_org_type_no_ci_key"
  ON "vat_tax_certificates"("organizationId", "certificateType", lower(btrim("certificateNo")))
  WHERE "certificateNo" IS NOT NULL;

CREATE INDEX "documents_vatTaxCertificateId_idx" ON "documents"("vatTaxCertificateId");

-- One active file occupies one evidence slot; archived rows remain as history and allow a
-- replacement upload. DocumentVersion remains the preferred path for replacing the same slot.
CREATE UNIQUE INDEX "documents_vatTaxCertificateId_documentType_active_key"
  ON "documents"("vatTaxCertificateId", "documentType")
  WHERE "vatTaxCertificateId" IS NOT NULL
    AND "documentType" IS NOT NULL
    AND "status" <> 'ARCHIVED';

ALTER TABLE "vat_tax_certificates"
  ADD CONSTRAINT "vat_tax_certificates_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vat_tax_certificates_cmsWorkId_fkey"
  FOREIGN KEY ("cmsWorkId") REFERENCES "cms_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "vat_tax_certificates_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "project_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_vatTaxCertificateId_fkey"
  FOREIGN KEY ("vatTaxCertificateId") REFERENCES "vat_tax_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "group", "description") VALUES
  ('perm-vat-tax-certificate-read', 'vat_tax_certificate.read', 'vat_tax_certificate', 'View VAT and Tax certificates'),
  ('perm-vat-tax-certificate-create', 'vat_tax_certificate.create', 'vat_tax_certificate', 'Create VAT and Tax certificates'),
  ('perm-vat-tax-certificate-update', 'vat_tax_certificate.update', 'vat_tax_certificate', 'Update VAT and Tax certificates'),
  ('perm-vat-tax-certificate-export', 'vat_tax_certificate.export', 'vat_tax_certificate', 'Export VAT and Tax certificates')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || md5(r."id" || p."id"), r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."isSystem" = true AND p."key" LIKE 'vat_tax_certificate.%'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
