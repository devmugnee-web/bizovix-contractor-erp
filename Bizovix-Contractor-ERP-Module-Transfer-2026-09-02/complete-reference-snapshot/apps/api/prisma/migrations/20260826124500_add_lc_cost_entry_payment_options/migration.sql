ALTER TABLE "LcCostEntry"
ADD COLUMN "paymentMethod" TEXT,
ADD COLUMN "creditPayeeName" TEXT,
ADD COLUMN "paymentAllocations" JSONB;
