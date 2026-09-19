CREATE TABLE "hidden_report_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "hiddenById" TEXT,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hidden_report_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hidden_report_transactions_organizationId_journalEntryId_key" ON "hidden_report_transactions"("organizationId", "journalEntryId");
CREATE INDEX "hidden_report_transactions_organizationId_hiddenAt_idx" ON "hidden_report_transactions"("organizationId", "hiddenAt");
ALTER TABLE "hidden_report_transactions" ADD CONSTRAINT "hidden_report_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
