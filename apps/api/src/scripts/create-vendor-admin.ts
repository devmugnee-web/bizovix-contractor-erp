#!/usr/bin/env node

/**
 * Creates (or updates the password of) a vendor-admin login for the
 * license/tracking admin panel. This identity is completely separate from
 * the tenant Organization/User/Role system — it only signs in to
 * /vendor-admin/* routes.
 *
 * Usage:
 *   node dist/scripts/create-vendor-admin.js --email=you@example.com --password=Secret123 --name="Your Name"
 */

import { PrismaClient } from "@bizovix/database";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function main() {
  const email = readArg("email");
  const password = readArg("password");
  const name = readArg("name") ?? "Vendor Admin";

  if (!email || !password) {
    console.error('Usage: --email=you@example.com --password=Secret123 [--name="Your Name"]');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("Password must be at least 6 characters");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.vendorAdminUser.upsert({
    where: { email },
    update: { passwordHash, name, isActive: true },
    create: { email, passwordHash, name },
  });

  console.log(`Vendor admin ready: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
