import { ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";

const categoryTables = ["desktop_sync_devices", "desktop_sync_clocks", "desktop_sync_category_versions", "desktop_sync_receipts", "desktop_sync_changes"];
const masterTables = ["desktop_master_sync_clocks", "desktop_master_sync_versions", "desktop_master_sync_changes"];

/** Taken before any stream lock, including enrollment and pre-migration web writes. */
export async function lockDesktopCaptureBoundary(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bizovix:desktop-capture:${organizationId}`}, 0))`;
}

/** Never cache absence: another compatible API instance may enroll after this tx. */
export async function desktopCaptureAvailable(tx: Prisma.TransactionClient, entityType: "category" | "uom" | "paymentTerm" | "organizationMaster") {
  const tables = entityType === "category" ? categoryTables : masterTables;
  const found = await tx.$queryRaw<Array<{ name: string; kind: string }>>`
    SELECT c.relname AS name, c.relkind::text AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname = ANY(${tables}::text[])
  `;
  if (found.length === 0 && process.env.DESKTOP_SYNC_ENABLED !== "true") return false;
  if (found.length !== tables.length || found.some(row => row.kind !== "r")) {
    throw new ServiceUnavailableException("Desktop change capture requires the complete reviewed sync migration; no master change was saved");
  }
  if (entityType === "organizationMaster") {
    const names = masterTables.map(table => `${table}_entityType_check`);
    const checks = await tx.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname = ANY(${masterTables}::text[])
        AND c.conname = ANY(${names}::text[]) AND c.contype='c' AND c.convalidated
    `;
    if (checks.length !== 3 || checks.some(row => !row.definition.includes("'organizationMaster'::text"))) {
      throw new ServiceUnavailableException("Organizations/Clients sync migration must be applied before writing this master");
    }
  }
  // Once metadata is installed, capture continues even while external sync is off.
  return true;
}
