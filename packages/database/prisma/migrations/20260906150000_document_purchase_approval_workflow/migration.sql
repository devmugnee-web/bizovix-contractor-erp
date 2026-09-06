CREATE TYPE "DocumentPurchaseRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PURCHASED');

CREATE TABLE "document_purchase_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "costingId" TEXT NOT NULL,
    "status" "DocumentPurchaseRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "documentPurchaseId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_purchase_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_purchase_requests_documentPurchaseId_key" ON "document_purchase_requests"("documentPurchaseId");
CREATE UNIQUE INDEX "document_purchase_requests_organizationId_id_key" ON "document_purchase_requests"("organizationId", "id");
CREATE UNIQUE INDEX "document_purchase_requests_organizationId_tenderId_key" ON "document_purchase_requests"("organizationId", "tenderId");
CREATE UNIQUE INDEX "document_purchase_requests_organizationId_costingId_key" ON "document_purchase_requests"("organizationId", "costingId");
CREATE INDEX "document_purchase_requests_organizationId_status_updatedAt_idx" ON "document_purchase_requests"("organizationId", "status", "updatedAt");

ALTER TABLE "document_purchase_requests" ADD CONSTRAINT "document_purchase_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_purchase_requests" ADD CONSTRAINT "document_purchase_requests_organizationId_tenderId_fkey" FOREIGN KEY ("organizationId", "tenderId") REFERENCES "tenders"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_purchase_requests" ADD CONSTRAINT "document_purchase_requests_organizationId_costingId_fkey" FOREIGN KEY ("organizationId", "costingId") REFERENCES "tender_costings"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_purchase_requests" ADD CONSTRAINT "document_purchase_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_purchase_requests" ADD CONSTRAINT "document_purchase_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_purchase_requests" ADD CONSTRAINT "document_purchase_requests_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_purchase_requests" ADD CONSTRAINT "document_purchase_requests_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES "document_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "document_purchase_requests" (
  "id", "organizationId", "tenderId", "costingId", "status", "requestedById", "requestedAt",
  "approvedById", "approvedAt", "documentPurchaseId", "createdAt", "updatedAt"
)
SELECT
  'dpr-' || md5(tc."organizationId" || ':' || tc."tenderId"),
  tc."organizationId",
  tc."tenderId",
  tc."id",
  CASE WHEN dp."id" IS NULL THEN 'PENDING_APPROVAL'::"DocumentPurchaseRequestStatus" ELSE 'PURCHASED'::"DocumentPurchaseRequestStatus" END,
  tc."approvedForCostingById",
  tc."approvedForCostingAt",
  CASE WHEN dp."id" IS NULL THEN NULL ELSE tc."approvedForCostingById" END,
  CASE WHEN dp."id" IS NULL THEN NULL ELSE tc."approvedForCostingAt" END,
  dp."id",
  tc."createdAt",
  GREATEST(tc."updatedAt", COALESCE(dp."updatedAt", tc."updatedAt"))
FROM "tender_costings" tc
LEFT JOIN LATERAL (
  SELECT candidate."id", candidate."updatedAt"
  FROM "document_purchases" candidate
  WHERE candidate."organizationId" = tc."organizationId"
    AND candidate."linkedTenderId" = tc."tenderId"
  ORDER BY candidate."createdAt" ASC, candidate."id" ASC
  LIMIT 1
) dp ON TRUE
ON CONFLICT ("organizationId", "tenderId") DO NOTHING;

INSERT INTO "permissions" ("id", "key", "group", "description")
VALUES ('perm-document-purchase-approve', 'document_purchase.approve', 'document_purchase', 'Approve or reject document purchase requests')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId")
SELECT 'rp-' || md5(r."id" || p."id"), r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."isSystem" = true AND p."key" = 'document_purchase.approve'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
