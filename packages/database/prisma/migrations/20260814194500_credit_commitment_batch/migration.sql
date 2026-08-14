ALTER TABLE "document_purchases"
ADD COLUMN "estimatedTenderAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "credit_commitments"
ADD COLUMN "paymentFromAccountId" TEXT,
ADD COLUMN "paymentDate" TIMESTAMP(3),
ADD COLUMN "remarks" TEXT,
ADD COLUMN "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

CREATE TABLE "credit_commitment_items" (
    "id" TEXT NOT NULL,
    "creditCommitmentId" TEXT NOT NULL,
    "documentPurchaseId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "chargeAmount" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "credit_commitment_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_commitment_items_documentPurchaseId_key"
ON "credit_commitment_items"("documentPurchaseId");
CREATE INDEX "credit_commitment_items_creditCommitmentId_idx"
ON "credit_commitment_items"("creditCommitmentId");
CREATE INDEX "credit_commitments_organizationId_paymentDate_idx"
ON "credit_commitments"("organizationId", "paymentDate");

ALTER TABLE "credit_commitments"
ADD CONSTRAINT "credit_commitments_paymentFromAccountId_fkey"
FOREIGN KEY ("paymentFromAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_commitment_items"
ADD CONSTRAINT "credit_commitment_items_creditCommitmentId_fkey"
FOREIGN KEY ("creditCommitmentId") REFERENCES "credit_commitments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_commitment_items"
ADD CONSTRAINT "credit_commitment_items_documentPurchaseId_fkey"
FOREIGN KEY ("documentPurchaseId") REFERENCES "document_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_commitment_items"
ADD CONSTRAINT "credit_commitment_items_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "document_purchases" SET "estimatedTenderAmount" = 8500000, "purchaseDate" = '2024-05-10' WHERE "egpTenderId" = '1024587';
UPDATE "document_purchases" SET "estimatedTenderAmount" = 12750000, "purchaseDate" = '2024-05-08' WHERE "egpTenderId" = '1024523';
UPDATE "document_purchases" SET "estimatedTenderAmount" = 9200000, "purchaseDate" = '2024-05-02' WHERE "egpTenderId" = '1024480';
UPDATE "document_purchases" SET "estimatedTenderAmount" = 6400000, "purchaseDate" = '2024-04-28' WHERE "egpTenderId" = '1024401';
UPDATE "document_purchases" SET "estimatedTenderAmount" = 4800000, "purchaseDate" = '2024-04-20' WHERE "egpTenderId" = '1024322';

INSERT INTO "document_purchases" (
  "id", "organizationId", "purchaseType", "egpTenderId", "organizationMasterId",
  "paymentFromAccountId", "tenderWorkName", "purchaseDate", "documentPrice",
  "estimatedTenderAmount", "tenderSecurityStatus", "createdAt", "updatedAt"
)
SELECT
  seed.id, org.id, 'EGP'::"PurchaseType", seed.tender_id, master.id,
  account.id, seed.work_name, seed.purchase_date, seed.document_price,
  seed.estimated_amount, 'PENDING'::"TenderSecurityDocumentStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" org
CROSS JOIN LATERAL (
  SELECT id FROM "bank_accounts" WHERE "organizationId" = org.id AND "accountType" = 'BANK'::"AccountType" ORDER BY "createdAt" LIMIT 1
) account
CROSS JOIN (VALUES
  ('seed-credit-doc-1024176', '1024176', 'DPHE', 'Water Treatment Plant Equipment', '2024-03-26'::timestamp, 4200::numeric, 10500000::numeric),
  ('seed-credit-doc-1024155', '1024155', 'PWD', 'Government Office Renovation', '2024-03-22'::timestamp, 2800::numeric, 7800000::numeric),
  ('seed-credit-doc-1024120', '1024120', 'LGED', 'Rural Market Development', '2024-03-17'::timestamp, 3200::numeric, 9750000::numeric),
  ('seed-credit-doc-1024098', '1024098', 'RHD', 'Highway Lighting Installation', '2024-03-11'::timestamp, 5500::numeric, 13200000::numeric),
  ('seed-credit-doc-1024051', '1024051', 'DPHE', 'Rural Water Supply Scheme', '2024-03-02'::timestamp, 3900::numeric, 8900000::numeric),
  ('seed-credit-doc-1024012', '1024012', 'PWD', 'District Office Electrical Upgrade', '2024-02-25'::timestamp, 3600::numeric, 8250000::numeric)
) AS seed(id, tender_id, master_name, work_name, purchase_date, document_price, estimated_amount)
JOIN "organization_masters" master ON master."organizationId" = org.id AND master."shortName" = seed.master_name
WHERE org.id = 'seed-org-bizovix'
ON CONFLICT ("id") DO NOTHING;
