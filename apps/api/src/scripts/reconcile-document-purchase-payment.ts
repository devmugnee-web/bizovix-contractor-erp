import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../modules/prisma/prisma.service";
import { DocumentPurchasesService } from "../modules/document-purchases/document-purchases.service";

// Repair one explicitly selected local purchase through normal posting services.
// Existing journals remain intact; the purchase row lock makes reruns idempotent.
async function main() {
  const argument = (name: string) => {
    const index = process.argv.indexOf(name);
    const value = index < 0 ? undefined : process.argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Required argument: ${name}`);
    return value;
  };
  const apply = process.argv.includes("--apply");
  if (apply === process.argv.includes("--dry-run")) throw new Error("Specify exactly one of --dry-run or --apply");
  const databaseName = argument("--database");
  const organizationId = argument("--organization-id");
  const purchaseId = argument("--purchase-id");
  const userId = argument("--user-id");
  const endpoint = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname) || decodeURIComponent(endpoint.pathname.slice(1)) !== databaseName) {
    throw new Error("Database URL must match the explicitly selected local database");
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"], abortOnError: false });
  try {
    const prisma = app.get(PrismaService);
    const [database] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    if (database?.name !== databaseName) throw new Error("Connected database does not match --database");
    await prisma.organizationUser.findFirstOrThrow({ where: { organizationId, userId, user: { isActive: true } } });
    const purchase = await prisma.documentPurchase.findFirstOrThrow({ where: { id: purchaseId, organizationId } });
    const snapshot = async () => ({
      bankBalance: (await prisma.bankAccount.findUniqueOrThrow({ where: { id: purchase.paymentFromAccountId } })).currentBalance.toFixed(2),
      journals: await prisma.journalEntry.findMany({
        where: { organizationId, sourceModule: "DOCUMENT_PURCHASE", OR: [{ sourceId: purchaseId }, { sourceId: { startsWith: `${purchaseId}:` } }] },
        select: { journalNo: true, sourceType: true, status: true, lines: { select: { debit: true, credit: true, account: { select: { code: true, name: true } } } } },
      }),
    });
    const before = await snapshot();
    const posted = apply ? await app.get(DocumentPurchasesService).reconcilePayment(organizationId, userId, purchaseId) : false;
    process.stdout.write(`${JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", database: databaseName, purchaseId,
      documentPrice: purchase.documentPrice.toFixed(2), bankCharge: purchase.bankCharge.toFixed(2),
      totalPayment: purchase.documentPrice.add(purchase.bankCharge).toFixed(2), posted, before,
      ...(apply ? { after: await snapshot() } : {}),
    }, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
