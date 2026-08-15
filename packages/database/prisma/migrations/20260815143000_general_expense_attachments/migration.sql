CREATE TABLE "expense_attachments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_attachments_organizationId_expenseId_idx"
ON "expense_attachments"("organizationId", "expenseId");

ALTER TABLE "expense_attachments"
ADD CONSTRAINT "expense_attachments_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expense_attachments"
ADD CONSTRAINT "expense_attachments_expenseId_fkey"
FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
