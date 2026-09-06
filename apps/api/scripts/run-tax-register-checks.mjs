// Own a new, local-only test database. Never reset or seed a development database.
import { PrismaClient } from "@bizovix/database";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(api, "../..");
const connection = new URL(process.env.DATABASE_URL || "");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(connection.hostname)) throw new Error("Only a local PostgreSQL server is allowed for this check");
const databaseName = `bizovix_vat_tax_test_${randomUUID().replaceAll("-", "")}`;
if (!/^bizovix_vat_tax_test_[0-9a-f]{32}$/.test(databaseName)) throw new Error("Invalid test database name");
const adminUrl = new URL(connection); adminUrl.pathname = "/postgres";
const testUrl = new URL(connection); testUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
let created = false, status = 1;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const env = { ...process.env, DATABASE_URL: testUrl.toString(), TEST_DATABASE_URL: testUrl.toString(), INTEGRATION_DB_VALIDATED: "1", APP_ENV: "test", BIZOVIX_TAX_TEST_DATABASE: databaseName, BIZOVIX_PW_MODULE: process.argv[2] || "", BIZOVIX_PW_CHROME: process.argv[3] || "" };
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); created = true;
  console.log(`Created isolated database: ${databaseName}`);
  // Historical migration 20260820160000 contains CLI warning text and cannot
  // bootstrap a fresh database. Do not alter previously applied migrations.
  // Build only this newly owned empty database, then exercise our exact SQL.
  const schema = spawnSync(pnpm, ["--filter", "@bizovix/database", "exec", "prisma", "db", "push", "--skip-generate"], { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  if (schema.status !== 0) throw new Error("Isolated schema setup failed");
  const isolated = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
  try {
    const [identity] = await isolated.$queryRaw`SELECT current_database() AS name`;
    if (!created || identity.name !== databaseName) throw new Error("Refusing to prepare migration outside the newly owned test database");
    await isolated.$executeRawUnsafe('DROP TABLE "tender_vat_tax_entries"');
    await isolated.$executeRawUnsafe('DROP TYPE "TenderVatTaxEntryKind"');
  } finally { await isolated.$disconnect(); }
  const migration = spawnSync(pnpm, ["--filter", "@bizovix/database", "exec", "prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--file", "prisma/migrations/20260906010000_tender_vat_tax_register/migration.sql"], { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  if (migration.status !== 0) throw new Error("VAT Tax migration failed in the isolated database");
  const check = spawnSync(pnpm, ["exec", "jest", "--config", "jest.integration.config.js", "--runInBand", "tender-vat-tax.integration-spec.ts"], { cwd: api, env, stdio: "inherit", shell: process.platform === "win32" });
  status = check.status ?? 1;
} finally {
  if (created) { await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`); console.log(`Removed only the isolated test database: ${databaseName}`); }
  await admin.$disconnect();
}
process.exitCode = status;
