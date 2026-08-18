import { AccountType, PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "bankAccount">;

async function byAccountNumber(prisma: Db, organizationId: string, definition: { id: string; accountName: string; bankName: string; accountNumber: string }) {
  const existing = await prisma.bankAccount.findFirst({ where: { organizationId, accountNumber: definition.accountNumber, isActive: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (existing) return prisma.bankAccount.update({ where: { id: existing.id }, data: { accountName: definition.accountName, bankName: definition.bankName, accountType: AccountType.BANK } });
  return prisma.bankAccount.create({ data: { ...definition, organizationId, accountType: AccountType.BANK, openingBalance: 0, currentBalance: 0 } });
}

/** Idempotent identity setup only. Balances must come from normal accounting workflows. */
export async function seedDemoBankAccounts(prisma: Db, organizationId: string) {
  const [dbbl, primeBank, cash, pettyCash, islamiBank] = await Promise.all([
    byAccountNumber(prisma, organizationId, { id: `${organizationId}:bank:dbbl`, accountName: "DBBL A/C", bankName: "Dutch-Bangla Bank", accountNumber: "1012000045781" }),
    byAccountNumber(prisma, organizationId, { id: `${organizationId}:bank:prime`, accountName: "Prime Bank A/C", bankName: "Prime Bank PLC", accountNumber: "2091000078452" }),
    prisma.bankAccount.upsert({ where: { id: `${organizationId}:Main Cash` }, update: { isActive: true }, create: { id: `${organizationId}:Main Cash`, organizationId, accountName: "Main Cash", accountType: AccountType.CASH, openingBalance: 0, currentBalance: 0, openingBalanceDate: new Date(), currency: "BDT" } }),
    prisma.bankAccount.upsert({ where: { id: `${organizationId}:Petty Cash` }, update: { isActive: true }, create: { id: `${organizationId}:Petty Cash`, organizationId, accountName: "Petty Cash", accountType: AccountType.CASH, openingBalance: 0, currentBalance: 0, openingBalanceDate: new Date(), currency: "BDT" } }),
    byAccountNumber(prisma, organizationId, { id: `${organizationId}:bank:islami`, accountName: "Islami Bank - 01", bankName: "Islami Bank Bangladesh PLC", accountNumber: "120100022345" }),
  ]);
  return { dbbl, primeBank, cash, pettyCash, islamiBank };
}
