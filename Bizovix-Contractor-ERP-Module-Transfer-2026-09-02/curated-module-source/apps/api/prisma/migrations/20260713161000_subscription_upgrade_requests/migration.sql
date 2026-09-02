CREATE TYPE "SubscriptionUpgradeRequestStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "SubscriptionUpgradeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "requestedPlanId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "SubscriptionUpgradeRequestStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionUpgradeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionUpgradeRequest_tenantId_workspaceId_status_idx" ON "SubscriptionUpgradeRequest"("tenantId", "workspaceId", "status");
CREATE INDEX "SubscriptionUpgradeRequest_subscriptionId_createdAt_idx" ON "SubscriptionUpgradeRequest"("subscriptionId", "createdAt");

ALTER TABLE "SubscriptionUpgradeRequest" ADD CONSTRAINT "SubscriptionUpgradeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionUpgradeRequest" ADD CONSTRAINT "SubscriptionUpgradeRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionUpgradeRequest" ADD CONSTRAINT "SubscriptionUpgradeRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionUpgradeRequest" ADD CONSTRAINT "SubscriptionUpgradeRequest_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionUpgradeRequest" ADD CONSTRAINT "SubscriptionUpgradeRequest_requestedPlanId_fkey" FOREIGN KEY ("requestedPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionUpgradeRequest" ADD CONSTRAINT "SubscriptionUpgradeRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
