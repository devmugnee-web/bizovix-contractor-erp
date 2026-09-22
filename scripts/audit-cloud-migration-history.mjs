/** Reproduce source history only in a NEW local database. Never connect to application data. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { root, baselineRoot, migrationRoot, migrationFiles, schemaPath, prismaPath, readServer, client, newDatabaseName, sha256, catalog, quoteSql, emptyDatabaseGuard, scratchDatabaseGuard, verifyPrismaShape } from './lib/cloud-bootstrap.mjs';

if (process.argv.slice(2).some(argument => argument !== '--build-baseline')) throw new Error('Only --build-baseline is supported');
const connection = client(readServer(), newDatabaseName('test_history'));
connection.create();
console.log(`Created isolated history-audit database: ${connection.databaseName}`);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bizovix-cloud-history-'));
const migrations = migrationFiles();
const removableWarning = /^warn The configuration property `package\.json#prisma` is deprecated and will be removed in Prisma 7\. Please migrate to a Prisma config file \(e\.g\., `prisma\.config\.ts`\)\.\r?\nFor more information, see: https:\/\/pris\.ly\/prisma-config\r?\n\r?\n/;
const warningMigrations = new Set(['20260820160000_rename_device_osinfo_to_platform', '20260820163000_add_trial_device_id']);
const copiedWarningHeadersRemoved = [];
let replay = emptyDatabaseGuard;
for (const { name, sha256: checksum } of migrations) {
  const original = fs.readFileSync(path.join(migrationRoot, name, 'migration.sql'));
  if (sha256(original) !== checksum) throw new Error(`Migration changed during audit: ${name}`);
  let sql = original.toString('utf8');
  if (warningMigrations.has(name)) {
    if (!removableWarning.test(sql)) throw new Error(`Reviewed warning prefix changed: ${name}`);
    sql = sql.replace(removableWarning, '');
    copiedWarningHeadersRemoved.push(name);
  }
  // Individual statements commit as in Prisma's default PostgreSQL migration behavior.
  replay += `\n\\echo MIGRATION:${name}\n${sql}\n`;
}
const result = connection.sql(replay);
const applied = [...result.stdout.matchAll(/^MIGRATION:(.+)$/gm)].map(match => match[1]);
const report = { databaseName: connection.databaseName, migrationCount: migrations.length, copiedWarningHeadersRemoved, failed: result.status === 0 ? null : { name: applied.at(-1), diagnostic: result.stderr.trim() } };
fs.writeFileSync(path.join(temporary, 'audit.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(`Audit report: ${path.join(temporary, 'audit.json')}`);
if (result.status !== 0) throw new Error(`Isolated replay failed at ${report.failed.name}: ${report.failed.diagnostic}`);
console.log(`PASS: all ${migrations.length} source migrations replayed; only two reviewed non-SQL headers removed in memory.`);

if (process.argv.includes('--build-baseline')) {
  const before = catalog(connection);
  const difference = connection.run(process.execPath, [prismaPath, 'migrate', 'diff', '--from-schema-datasource', schemaPath, '--to-schema-datamodel', schemaPath, '--script']);
  if (difference.status !== 0) throw new Error('Could not compare isolated replay against current Prisma schema');
  fs.writeFileSync(path.join(temporary, 'schema-reconciliation.sql'), difference.stdout, { flag: 'wx' });
  const reviewedPath = path.join(baselineRoot, 'reviewed-prisma-reconciliation.sql');
  const normalize = text => text.replaceAll('\r\n', '\n').trim();
  const reviewed = fs.readFileSync(reviewedPath, 'utf8').replaceAll('\r\n', '\n');
  if (!reviewed.startsWith(scratchDatabaseGuard) || normalize(reviewed.slice(scratchDatabaseGuard.length)) !== normalize(difference.stdout)) throw new Error(`Guard/schema differences need review. Candidate: ${path.join(temporary, 'schema-reconciliation.sql')}`);
  // These two SQL-only lookup indexes intentionally remain in the baseline.
  const reconciliation = difference.stdout.replace(/-- DropIndex\r?\nDROP INDEX "(?:cms_works_organizationId_closedAt_idx|dlp_defects_organizationId_priority_status_idx)";\r?\n/g, '');
  connection.checkedSql(`${scratchDatabaseGuard}${reconciliation}`, { transaction: true });
  const after = catalog(connection);
  verifyPrismaShape(connection);
  for (const key of ['checks', 'specialIndexes']) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) throw new Error(`Reconciliation changed SQL-only ${key}; review is required`);
  // Reviewed additive UOM/PaymentTerm clocks, versions and changes add three tables.
  if (after.tables.length !== 178 || Object.keys(after.enums).length !== 102 || after.specialIndexes.length !== 6) throw new Error('Unexpected schema inventory; review is required');
  const schemaFile = path.join(temporary, 'schema.sql');
  const dump = connection.run(connection.binary('pg_dump'), ['--no-password', '--schema-only', '--no-owner', '--no-privileges', '--exclude-table=public._prisma_migrations', '--dbname', connection.databaseName, '--file', schemaFile]);
  if (dump.status !== 0) throw new Error('Could not export isolated schema-only baseline');
  let sql = fs.readFileSync(schemaFile, 'utf8');
  sql = sql.replace(/^\\(?:un)?restrict .+\r?\n/gm, '').replace(/^-- Dumped (?:from database|by pg_dump) version .+\r?\n/gm, '');
  if (/^(?:COPY |INSERT |UPDATE |DELETE |DROP |\\)/m.test(sql)) throw new Error('Unexpected data, destructive SQL, or psql commands in schema artifact');
  sql = `-- Generated from isolated migration replay plus reviewed current-Prisma reconciliation.\n-- CLEAN DATABASE ONLY. See docs/offline-first/cloud-database-bootstrap.md.\n${emptyDatabaseGuard}\n${sql}`;
  const { PERMISSIONS } = await import(pathToFileURL(path.join(root, 'packages/types/src/permissions.ts')));
  if (!Array.isArray(PERMISSIONS) || new Set(PERMISSIONS).size !== PERMISSIONS.length || PERMISSIONS.some(key => !/^[a-z_]+(?:\.[a-z_]+)+$/.test(key))) throw new Error('Invalid permission catalog');
  const permissionsSql = `INSERT INTO "permissions" ("id", "key", "group") VALUES\n${PERMISSIONS.map(key => `(${quoteSql(`bootstrap-perm-${key}`)}, ${quoteSql(key)}, ${quoteSql(key.split('.')[0])})`).join(',\n')};\n`;
  const plansSource = fs.readFileSync(path.join(migrationRoot, '20260817190000_add_plan_billing/migration.sql'), 'utf8');
  const plansSql = /INSERT INTO "plans"[\s\S]+?;/.exec(plansSource)?.[0];
  if (!plansSql || !plansSql.includes("'plan-enterprise'")) throw new Error('Reviewed standard-plan seed changed');
  const referenceSql = `-- Only public permission and plan reference values. No users, passwords, companies or transactions.\n${permissionsSql}\n${plansSql}\n`;
  const catalogJson = `${JSON.stringify(after, null, 2)}\n`;
  fs.writeFileSync(path.join(baselineRoot, 'schema.sql'), sql);
  fs.writeFileSync(path.join(baselineRoot, 'reference-data.sql'), referenceSql);
  fs.writeFileSync(path.join(baselineRoot, 'catalog.json'), catalogJson);
  const files = Object.fromEntries(['schema.sql', 'reference-data.sql', 'catalog.json', 'reviewed-prisma-reconciliation.sql'].map(name => [name, sha256(fs.readFileSync(path.join(baselineRoot, name)))]));
  const manifest = { formatVersion: 1, hashNormalization: 'LF', postgresqlMajor: 18, prismaVersion: '6.19.3', schemaSha256: sha256(fs.readFileSync(schemaPath)), permissionsSha256: sha256(fs.readFileSync(path.join(root, 'packages/types/src/permissions.ts'))), files, migrations, copiedWarningHeadersRemoved, counts: { tables: after.tables.length, columns: after.columns.length, indexes: after.indexes.length, enums: Object.keys(after.enums).length, checks: after.checks.length, specialIndexes: after.specialIndexes.length, foreignKeys: after.foreignKeys.length, permissions: PERMISSIONS.length, plans: 3 } };
  fs.writeFileSync(path.join(baselineRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated reviewable baseline: ${JSON.stringify(manifest.counts)}`);
}
console.log('Isolated database retained. Existing databases and original migration files were not modified.');
