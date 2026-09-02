ALTER TABLE "VoucherEntry" ADD COLUMN "sourceVoucherId" TEXT;

CREATE INDEX "VoucherEntry_sourceVoucherId_idx" ON "VoucherEntry"("sourceVoucherId");
