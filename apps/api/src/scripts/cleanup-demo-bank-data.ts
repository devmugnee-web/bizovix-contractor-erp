import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../modules/prisma/prisma.service";
import { AccountingService } from "../modules/accounting/accounting.service";
import { DemoBankCleanupService } from "../modules/accounting/demo-bank-cleanup.service";

async function main() {
  const dryRun = process.argv.includes("--dry-run"), apply = process.argv.includes("--apply");
  if (dryRun === apply) throw new Error("Specify exactly one of --dry-run or --apply");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"], abortOnError: false });
  try {
    const prisma = app.get(PrismaService);
    const [database] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    if (!database || database.name !== "bizovix_contractor_erp_db") throw new Error(`Refusing cleanup against ${database?.name ?? "unknown"}`);
    const organization = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    if (!organization) throw new Error("No organization found");
    const service = new DemoBankCleanupService(prisma, app.get(AccountingService));
    const result = dryRun ? await service.plan(organization.id) : await service.apply(organization.id);
    process.stdout.write(`${JSON.stringify({ mode: dryRun ? "DRY_RUN" : "APPLY", database: database.name, result }, null, 2)}\n`);
  } finally { await app.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
