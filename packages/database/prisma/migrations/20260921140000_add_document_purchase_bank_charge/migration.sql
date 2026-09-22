ALTER TABLE "document_purchases"
ADD COLUMN "bankCharge" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "document_purchases"
ADD CONSTRAINT "document_purchases_bankCharge_nonnegative" CHECK ("bankCharge" >= 0);
