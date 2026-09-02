import { PrismaClient } from "../src/generated/prisma/index.js";
import { accountGroupSeeds } from "../src/platform/bootstrap/defaults.js";
import { seedAccountHierarchy } from "../src/platform/bootstrap/seed-accounts.js";

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, tenantId: true, name: true } });
  console.log(`Backfilling Chart of Accounts hierarchy for ${companies.length} existing companies...`);

  for (const company of companies) {
    const accountGroupIdByCode = new Map<string, string>();
    for (const group of accountGroupSeeds) {
      const record = await prisma.accountGroup.findUnique({
        where: { companyId_code: { companyId: company.id, code: group.code } },
      });
      if (record) {
        accountGroupIdByCode.set(record.code, record.id);
      }
    }

    const created = await seedAccountHierarchy(prisma, company.tenantId, company.id, accountGroupIdByCode);
    console.log(`- ${company.name} (${company.id}): +${created} new accounts (categories + re-parented ledgers)`);
  }

  console.log("Chart of Accounts backfill complete.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
