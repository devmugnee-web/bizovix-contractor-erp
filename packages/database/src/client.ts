import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __bizovixPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__bizovixPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__bizovixPrisma = prisma;
}
