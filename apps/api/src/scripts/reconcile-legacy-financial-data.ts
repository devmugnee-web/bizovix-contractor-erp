import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../modules/prisma/prisma.service";
import { CashBankService } from "../modules/cash-bank/cash-bank.service";
import { AccountingService } from "../modules/accounting/accounting.service";
import { LegacyFinancialBackfillService } from "../modules/accounting/legacy-financial-backfill.service";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");
  if (dryRun === apply) throw new Error("Specify exactly one of --dry-run or --apply");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"], abortOnError: false });
  try {
    const prisma = app.get(PrismaService);
    const [database] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    if (!database) throw new Error("Cannot determine current database");
    if (apply && database.name !== "bizovix_contractor_erp_db" && !database.name.toLowerCase().includes("test")) throw new Error(`Refusing apply against ${database.name}`);
    const organization = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    if (!organization) throw new Error("No organization found");
    const membership = await prisma.organizationUser.findFirst({ where: { organizationId: organization.id, user: { isActive: true } }, orderBy: { createdAt: "asc" } });
    if (!membership) throw new Error("No active organization user found for audit attribution");
    const service = new LegacyFinancialBackfillService(prisma, app.get(CashBankService), app.get(AccountingService));
    const result = dryRun ? await service.plan(organization.id) : await service.apply(organization.id, membership.userId);
    process.stdout.write(`${JSON.stringify({ mode: dryRun ? "DRY_RUN" : "APPLY", database: database.name, result }, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
