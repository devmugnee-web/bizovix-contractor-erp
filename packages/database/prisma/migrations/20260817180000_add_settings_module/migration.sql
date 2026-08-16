-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "referenceNo" TEXT;

-- CreateTable
CREATE TABLE "general_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyDisplayName" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'BDT',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "numberFormat" TEXT NOT NULL DEFAULT 'STANDARD',
    "financialYearStartMonth" INTEGER NOT NULL DEFAULT 7,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "country" TEXT NOT NULL DEFAULT 'Bangladesh',
    "defaultPageSize" INTEGER NOT NULL DEFAULT 10,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "general_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legalName" TEXT,
    "displayName" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "tradeLicenseNo" TEXT,
    "tinNumber" TEXT,
    "binNumber" TEXT,
    "registrationNumber" TEXT,
    "signatoryName" TEXT,
    "signatoryDesignation" TEXT,
    "logoMimeType" TEXT,
    "logoData" BYTEA,
    "signatureMimeType" TEXT,
    "signatureData" BYTEA,
    "sealMimeType" TEXT,
    "sealData" BYTEA,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_bank_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenderValidityDays" INTEGER NOT NULL DEFAULT 90,
    "tenderOpeningReminderDays" INTEGER NOT NULL DEFAULT 7,
    "tenderExpiryReminderDays" INTEGER NOT NULL DEFAULT 7,
    "tsDefaultSecurityPct" DECIMAL(8,2) NOT NULL DEFAULT 2,
    "tsDefaultMarginPct" DECIMAL(8,2) NOT NULL DEFAULT 10,
    "tsDefaultValidityMonths" INTEGER NOT NULL DEFAULT 6,
    "tsExpiryReminderDays" INTEGER NOT NULL DEFAULT 15,
    "pgBgDefaultMarginPct" DECIMAL(8,2) NOT NULL DEFAULT 10,
    "pgBgDefaultValidityMonths" INTEGER NOT NULL DEFAULT 12,
    "pgBgDefaultInterestRate" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "pgBgExpiryReminderDays" INTEGER NOT NULL DEFAULT 30,
    "pgBgMaturityReminderDays" INTEGER NOT NULL DEFAULT 15,
    "creditCommitmentDefaultCharge" DECIMAL(18,2) NOT NULL DEFAULT 100,
    "sdDefaultPct" DECIMAL(8,2) NOT NULL DEFAULT 10,
    "sdDefaultValidityMonths" INTEGER NOT NULL DEFAULT 12,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_bank_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "defaultCashAccountId" TEXT,
    "defaultPettyCashAccountId" TEXT,
    "defaultBankChargeAccountId" TEXT,
    "defaultReceivableAccountId" TEXT,
    "defaultPayableAccountId" TEXT,
    "defaultProjectRevenueAccountId" TEXT,
    "defaultGeneralExpenseAccountId" TEXT,
    "defaultTenderDocumentExpenseAccountId" TEXT,
    "defaultCreditCommitmentChargeAccountId" TEXT,
    "autoPostApproved" BOOLEAN NOT NULL DEFAULT false,
    "requireApprovalBeforePosting" BOOLEAN NOT NULL DEFAULT true,
    "allowBackdatedTransactions" BOOLEAN NOT NULL DEFAULT true,
    "allowFutureDatedTransactions" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "includeYear" BOOLEAN NOT NULL DEFAULT true,
    "yearFormat" TEXT NOT NULL DEFAULT 'YYYY',
    "separator" TEXT NOT NULL DEFAULT '-',
    "sequenceLength" INTEGER NOT NULL DEFAULT 4,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "lastYearUsed" INTEGER,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_rule_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultPriority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "offsetDays" INTEGER[] DEFAULT ARRAY[7]::INTEGER[],
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_rule_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "allowedFileTypes" TEXT[] DEFAULT ARRAY['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'JPG', 'JPEG', 'PNG']::TEXT[],
    "maxFileSizeMb" INTEGER NOT NULL DEFAULT 10,
    "defaultExpiryReminderDays" INTEGER NOT NULL DEFAULT 30,
    "enableVersionControl" BOOLEAN NOT NULL DEFAULT false,
    "enableExpiryTracking" BOOLEAN NOT NULL DEFAULT true,
    "autoArchiveExpired" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "transactionType" TEXT,
    "minAmount" DECIMAL(18,2),
    "maxAmount" DECIMAL(18,2),
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "approverRole" TEXT NOT NULL,
    "approvalLevel" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "minPasswordLength" INTEGER NOT NULL DEFAULT 8,
    "requireUppercase" BOOLEAN NOT NULL DEFAULT true,
    "requireLowercase" BOOLEAN NOT NULL DEFAULT true,
    "requireNumber" BOOLEAN NOT NULL DEFAULT true,
    "requireSpecialChar" BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeoutMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxFailedLoginAttempts" INTEGER NOT NULL DEFAULT 5,
    "accountLockDurationMinutes" INTEGER NOT NULL DEFAULT 15,
    "forcePasswordChangeDays" INTEGER,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "featureToggles" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "general_settings_organizationId_key" ON "general_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_organizationId_key" ON "company_profiles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "tender_bank_settings_organizationId_key" ON "tender_bank_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_settings_organizationId_key" ON "finance_settings"("organizationId");

-- CreateIndex
CREATE INDEX "accounting_periods_organizationId_startDate_endDate_idx" ON "accounting_periods"("organizationId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_organizationId_label_key" ON "accounting_periods"("organizationId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_organizationId_moduleKey_key" ON "number_sequences"("organizationId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_rule_settings_organizationId_reminderType_key" ON "reminder_rule_settings"("organizationId", "reminderType");

-- CreateIndex
CREATE UNIQUE INDEX "document_settings_organizationId_key" ON "document_settings"("organizationId");

-- CreateIndex
CREATE INDEX "approval_rules_organizationId_module_isActive_idx" ON "approval_rules"("organizationId", "module", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "security_settings_organizationId_key" ON "security_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_organizationId_key" ON "system_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_organizationId_referenceNo_key" ON "expenses"("organizationId", "referenceNo");

-- AddForeignKey
ALTER TABLE "general_settings" ADD CONSTRAINT "general_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_bank_settings" ADD CONSTRAINT "tender_bank_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_rule_settings" ADD CONSTRAINT "reminder_rule_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_settings" ADD CONSTRAINT "document_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_settings" ADD CONSTRAINT "security_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
