-- DropIndex
DROP INDEX "vendor_customers_email_idx";

-- CreateIndex
CREATE UNIQUE INDEX "vendor_customers_email_key" ON "vendor_customers"("email");

