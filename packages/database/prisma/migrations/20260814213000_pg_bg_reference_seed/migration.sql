INSERT INTO "organization_masters" ("id", "organizationId", "shortName", "fullName", "createdAt", "updatedAt")
SELECT seed.id, org.id, seed.short_name, seed.full_name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" org
CROSS JOIN (VALUES
  ('seed-master-btv', 'BTV', 'Bangladesh Television'),
  ('seed-master-sreda', 'SREDA', 'Sustainable and Renewable Energy Development Authority'),
  ('seed-master-bksp', 'BKSP', 'Bangladesh Krira Shikkha Protishtan')
) AS seed(id, short_name, full_name)
WHERE org.id = 'seed-org-bizovix'
ON CONFLICT ("organizationId", "shortName") DO NOTHING;

INSERT INTO "document_purchases" (
  "id", "organizationId", "purchaseType", "egpTenderId", "organizationMasterId", "paymentFromAccountId",
  "tenderWorkName", "purchaseDate", "documentPrice", "estimatedTenderAmount", "tenderSecurityStatus", "createdAt", "updatedAt"
)
SELECT seed.id, org.id, 'EGP'::"PurchaseType", seed.tender_id, master.id, account.id,
  seed.work_name, seed.purchase_date, seed.document_price, seed.estimated_amount,
  'PENDING'::"TenderSecurityDocumentStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" org
CROSS JOIN LATERAL (
  SELECT id FROM "bank_accounts" WHERE "organizationId" = org.id AND "accountType" = 'BANK'::"AccountType" ORDER BY "createdAt" LIMIT 1
) account
CROSS JOIN (VALUES
  ('seed-pg-bg-1024122', '1024122', 'LGED', 'Electrical Work at Barisal Office', '2024-04-18'::timestamp, 3000::numeric, 7500000::numeric),
  ('seed-pg-bg-1023988', '1023988', 'BTV', 'ICT Equipment Supply at BTV', '2024-04-16'::timestamp, 2500::numeric, 6800000::numeric),
  ('seed-pg-bg-1023781', '1023781', 'SREDA', 'Solar System at Rajshahi', '2024-04-14'::timestamp, 4000::numeric, 9600000::numeric),
  ('seed-pg-bg-1023675', '1023675', 'BKSP', 'Supply of PA System at BKSP', '2024-04-12'::timestamp, 2800::numeric, 5900000::numeric)
) AS seed(id, tender_id, master_name, work_name, purchase_date, document_price, estimated_amount)
JOIN "organization_masters" master ON master."organizationId" = org.id AND master."shortName" = seed.master_name
WHERE org.id = 'seed-org-bizovix'
ON CONFLICT ("id") DO NOTHING;
