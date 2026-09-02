ALTER TABLE "LcMaster"
ADD COLUMN "purchasePaymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
ADD COLUMN "purchasePaidAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN "paymentReference" TEXT;

ALTER TABLE "LcMaster"
ADD CONSTRAINT "LcMaster_purchasePaymentStatus_check"
CHECK ("purchasePaymentStatus" IN ('UNPAID', 'PARTIAL', 'PAID'));

ALTER TABLE "LcMaster"
ADD CONSTRAINT "LcMaster_purchasePaidAmount_check"
CHECK ("purchasePaidAmount" >= 0);
