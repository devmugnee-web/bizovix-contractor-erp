ALTER TABLE "project_contracts"
ADD COLUMN "securityDepositReleaseDueDate" TIMESTAMP(3);

CREATE INDEX "project_contracts_organizationId_securityDepositReleaseDueDate_idx"
ON "project_contracts"("organizationId", "securityDepositReleaseDueDate");
