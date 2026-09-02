import { PrismaClient } from "../src/generated/prisma/index.js";
import { accountGroupSeeds, systemAccountSeeds, voucherTypeSeeds } from "../src/platform/bootstrap/defaults.js";

const prisma = new PrismaClient();

function slugFallback(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "branch"
  );
}

async function backfillCompany(company: { id: string; tenantId: string; name: string }) {
  const accountGroupIdByCode = new Map<string, string>();
  for (const accountGroup of accountGroupSeeds) {
    const record = await prisma.accountGroup.upsert({
      where: { companyId_code: { companyId: company.id, code: accountGroup.code } },
      update: {},
      create: {
        tenantId: company.tenantId,
        companyId: company.id,
        code: accountGroup.code,
        name: accountGroup.name,
        nature: accountGroup.nature,
      },
    });
    accountGroupIdByCode.set(record.code, record.id);
  }

  for (const voucherType of voucherTypeSeeds) {
    await prisma.voucherType.upsert({
      where: { companyId_code: { companyId: company.id, code: voucherType.code } },
      update: {},
      create: {
        tenantId: company.tenantId,
        companyId: company.id,
        code: voucherType.code,
        name: voucherType.name,
        shortCode: voucherType.shortCode,
      },
    });
  }

  let accountsCreated = 0;
  for (const systemAccount of systemAccountSeeds) {
    const accountGroupId = accountGroupIdByCode.get(systemAccount.groupCode);
    if (!accountGroupId) {
      continue;
    }

    const existing = await prisma.account.findUnique({
      where: { companyId_code: { companyId: company.id, code: systemAccount.code } },
    });

    if (!existing) {
      accountsCreated += 1;
    }

    await prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: systemAccount.code } },
      update: {},
      create: {
        tenantId: company.tenantId,
        companyId: company.id,
        accountGroupId,
        code: systemAccount.code,
        name: systemAccount.name,
        nature: systemAccount.nature,
        isSystem: true,
        isControlAccount: systemAccount.isControlAccount,
      },
    });
  }

  await prisma.accountingSettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      tenantId: company.tenantId,
      companyId: company.id,
    },
  });

  const workspaces = await prisma.workspace.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true, slug: true },
  });

  let branchesCreated = 0;
  for (const workspace of workspaces) {
    const existingBranch = await prisma.branch.findUnique({ where: { workspaceId: workspace.id } });
    if (!existingBranch) {
      branchesCreated += 1;
    }

    await prisma.branch.upsert({
      where: { workspaceId: workspace.id },
      update: {},
      create: {
        tenantId: company.tenantId,
        companyId: company.id,
        workspaceId: workspace.id,
        name: workspace.name,
        code: slugFallback(workspace.slug || workspace.name),
        isDefault: true,
      },
    });
  }

  return { accountsCreated, branchesCreated, workspaceCount: workspaces.length };
}

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, tenantId: true, name: true },
  });

  console.log(`Backfilling accounting foundation for ${companies.length} existing companies...`);

  for (const company of companies) {
    const result = await backfillCompany(company);
    console.log(
      `- ${company.name} (${company.id}): +${result.accountsCreated} accounts, +${result.branchesCreated} branches (of ${result.workspaceCount} workspaces)`,
    );
  }

  console.log("Backfill complete.");
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
