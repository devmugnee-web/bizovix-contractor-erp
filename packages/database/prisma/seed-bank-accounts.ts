import { PrismaClient } from "@prisma/client";
import { seedDemoBankAccounts } from "../src/demo-bank-seed";

const prisma = new PrismaClient();

async function snapshot(organizationId: string) {
  const [banks, financialTransactions, journals] = await Promise.all([
    prisma.bankAccount.findMany({ where: { organizationId }, orderBy: { id: "asc" }, select: { id: true, isActive: true, openingBalance: true, currentBalance: true } }),
    prisma.financialTransaction.count({ where: { organizationId } }),
    prisma.journalEntry.count({ where: { organizationId } }),
  ]);
  return { bankAccounts: banks.length, activeBankAccounts: banks.filter((x) => x.isActive).length, financialTransactions, journals, balances: banks.map((x) => `${x.id}|${x.openingBalance.toFixed(2)}|${x.currentBalance.toFixed(2)}|${x.isActive}`) };
}

async function main() {
  const [database] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  if (!database || database.name !== "bizovix_contractor_erp_db") throw new Error(`Refusing demo seed verification against ${database?.name ?? "unknown"}`);
  const organization = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!organization) throw new Error("No organization found");
  await seedDemoBankAccounts(prisma, organization.id);
  const first = await snapshot(organization.id);
  await seedDemoBankAccounts(prisma, organization.id);
  const second = await snapshot(organization.id);
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("Demo bank seed is not idempotent");
  const setting = await prisma.financeSetting.findUnique({ where: { organizationId: organization.id } });
  const settingIds = setting ? [setting.defaultCashAccountId, setting.defaultPettyCashAccountId, setting.defaultBankChargeAccountId, setting.defaultReceivableAccountId, setting.defaultPayableAccountId, setting.defaultProjectRevenueAccountId, setting.defaultGeneralExpenseAccountId, setting.defaultTenderDocumentExpenseAccountId, setting.defaultCreditCommitmentChargeAccountId].filter((x): x is string => Boolean(x)) : [];
  const validSettings = !settingIds.length || await prisma.ledgerAccount.count({ where: { id: { in: settingIds }, organizationId: organization.id, OR: [{ linkedBankAccountId: null }, { bankAccount: { isActive: true } }] } }) === new Set(settingIds).size;
  if (!validSettings) throw new Error("Finance settings reference an inactive or invalid ledger account");
  process.stdout.write(`${JSON.stringify({ database: database.name, first, second, unchanged: true, settingsValid: validSettings }, null, 2)}\n`);
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
