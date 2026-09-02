ALTER TABLE "ManufacturingRoutingOperation"
ADD COLUMN "responsibleUserId" TEXT;

CREATE INDEX "ManufacturingRoutingOperation_responsibleUserId_idx"
ON "ManufacturingRoutingOperation"("responsibleUserId");

ALTER TABLE "ManufacturingRoutingOperation"
ADD CONSTRAINT "ManufacturingRoutingOperation_responsibleUserId_fkey"
FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
