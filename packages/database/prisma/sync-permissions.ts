import { PrismaClient } from "@prisma/client";
import { syncPermissions } from "./lib/sync-permissions";

const prisma = new PrismaClient();

async function main() {
  const result = await syncPermissions(prisma);
  console.log(`Synced permissions. permissions=${result.permissionCount} systemRoles=${result.roleCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
