import fs from 'node:fs';
import path from 'node:path';
import { baselineRoot, migrationRoot, catalog, quoteSql, verifyManifest } from './cloud-bootstrap.mjs';

export const SNAPSHOT_SYNC_FAMILIES = Object.freeze([
  Object.freeze({ migration: '20260921120000_add_desktop_category_sync_pilot', tables: Object.freeze(['desktop_sync_devices', 'desktop_sync_clocks', 'desktop_sync_category_versions', 'desktop_sync_receipts', 'desktop_sync_changes']) }),
  Object.freeze({ migration: '20260921150000_add_desktop_master_sync', upgrade: '20260921160000_add_desktop_organization_master_sync', tables: Object.freeze(['desktop_master_sync_clocks', 'desktop_master_sync_versions', 'desktop_master_sync_changes']) }),
]);

function familyCatalog(source, tables) {
  const names = new Set(tables);
  return {
    tables: source.tables.filter(table => names.has(table)),
    ...Object.fromEntries(['columns', 'indexes', 'checks', 'specialIndexes', 'foreignKeys'].map(key => [key, source[key].filter(row => names.has(row.table))])),
  };
}

/** Pure preflight: do not repair partial or different schemas with CREATE IF NOT EXISTS. */
export function planSnapshotSyncMigrations(actual, expected) {
  const missing = [];
  for (const family of SNAPSHOT_SYNC_FAMILIES) {
    if (!family.tables.every(table => expected.tables.includes(table))) throw new Error('Reviewed baseline is missing a required sync table family');
    const present = family.tables.filter(table => actual.tables.includes(table));
    if (present.length === 0) {
      missing.push(family.migration);
      if (family.upgrade) missing.push(family.upgrade);
      continue;
    }
    if (present.length !== family.tables.length) throw new Error(`Partial snapshot sync schema: ${family.migration}; isolated database retained`);
    const target = familyCatalog(expected, family.tables);
    const current = JSON.stringify(familyCatalog(actual, family.tables));
    if (current === JSON.stringify(target)) continue;
    if (family.upgrade) {
      // The sole reviewed historical master shape differs in these three CHECKs.
      // Every other column/key/index/constraint must still match exactly.
      const previous = structuredClone(target);
      const checks = previous.checks.filter(row => row.name === `${row.table}_entityType_check`);
      if (checks.length !== 3 || checks.some(row => !row.definition.includes(", 'organizationMaster'::text"))) throw new Error('Reviewed organization stream CHECK definitions are unavailable');
      for (const row of checks) row.definition = row.definition.replace(", 'organizationMaster'::text", '');
      if (current === JSON.stringify(previous)) { missing.push(family.upgrade); continue; }
    }
    throw new Error(`Mismatched snapshot sync schema: ${family.migration}; isolated database retained`);
  }
  return missing;
}

function verifySyncIndexes(connection) {
  const tableNames = SNAPSHOT_SYNC_FAMILIES.flatMap(family => family.tables).map(quoteSql).join(', ');
  // pg_get_indexdef does not expose deferred/invalid index state. In particular,
  // ON CONFLICT requires the immediate primary keys in the original migrations.
  const unsafeIndexes = connection.checkedSql(`SELECT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname IN (${tableNames}) AND (NOT i.indimmediate OR NOT i.indisvalid OR NOT i.indisready)
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname IN (${tableNames}) AND c.contype IN ('p','u') AND (c.condeferrable OR c.condeferred)
  );`);
  if (unsafeIndexes !== 'f') throw new Error('Mismatched snapshot sync index or primary-key state; isolated database retained');
}

/** Called only after the runner creates a new target and imports a read-only schema dump. */
export function ensureSnapshotSyncSchema(connection) {
  const manifest = verifyManifest();
  if (!/^bizovix_test_bootstrap_[0-9]+_[a-f0-9]{6}$/.test(connection.databaseName)) throw new Error('Snapshot sync setup requires an exact generated isolated database');
  if (connection.checkedSql('SELECT current_database();') !== connection.databaseName) throw new Error('Snapshot sync setup connected to the wrong isolated database');
  for (const family of SNAPSHOT_SYNC_FAMILIES) {
    for (const name of [family.migration, ...(family.upgrade ? [family.upgrade] : [])]) {
      if (!manifest.migrations.some(migration => migration.name === name)) throw new Error('Sync migration is absent from the verified source manifest');
    }
  }
  verifySyncIndexes(connection);
  const expected = JSON.parse(fs.readFileSync(path.join(baselineRoot, 'catalog.json'), 'utf8'));
  // Validate both families completely before performing any DDL.
  const missing = planSnapshotSyncMigrations(catalog(connection), expected);
  if (missing.length) {
    const scripts = missing.map(name => fs.readFileSync(path.join(migrationRoot, name, 'migration.sql'), 'utf8'));
    connection.checkedSql(`SET LOCAL search_path = public;
DO $$ BEGIN
  IF current_database() <> ${quoteSql(connection.databaseName)} THEN RAISE EXCEPTION 'Wrong isolated snapshot target'; END IF;
END $$;
${scripts.join('\n')}`, { transaction: true });
  }
  if (planSnapshotSyncMigrations(catalog(connection), expected).length) throw new Error('Snapshot sync table verification failed after additive setup');
  verifySyncIndexes(connection);
  verifyManifest();
  return { applied: missing, verifiedTables: SNAPSHOT_SYNC_FAMILIES.flatMap(family => family.tables) };
}
