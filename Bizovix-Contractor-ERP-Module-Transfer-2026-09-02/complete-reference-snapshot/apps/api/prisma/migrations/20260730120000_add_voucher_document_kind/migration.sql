ALTER TABLE "VoucherEntry" ADD COLUMN "documentKind" TEXT;

CREATE INDEX "VoucherEntry_workspaceId_documentKind_idx" ON "VoucherEntry"("workspaceId", "documentKind");
