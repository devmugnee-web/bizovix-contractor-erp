import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const baselineRoot = path.join(root, 'packages/database/cloud-baseline');
export const migrationRoot = path.join(root, 'packages/database/prisma/migrations');
export const schemaPath = path.join(root, 'packages/database/prisma/schema.prisma');
export const prismaPath = path.join(root, 'packages/database/node_modules/prisma/build/index.js');
export const rawSha256 = value => createHash('sha256').update(value).digest('hex');
// Git's Windows/Linux checkout conversion must not invalidate the source manifest.
// Prisma's DB history is separately compared with the real byte hashes on this host.
export const sha256 = value => rawSha256(value.toString().replaceAll('\r\n', '\n'));
export const quoteSql = value => `'${value.replaceAll("'", "''")}'`;
export const migrationFiles = ({ raw = false } = {}) => fs.readdirSync(migrationRoot).filter(name => fs.existsSync(path.join(migrationRoot, name, 'migration.sql'))).sort().map(name => ({ name, sha256: (raw ? rawSha256 : sha256)(fs.readFileSync(path.join(migrationRoot, name, 'migration.sql'))) }));

export function readServer() {
  // The configured database is never connected to. Only its local server credentials are used.
  const line = process.env.BIZOVIX_CLOUD_BOOTSTRAP_URL ?? /^\s*DATABASE_URL\s*=\s*(.+)$/m.exec(fs.readFileSync(path.join(root, '.env'), 'utf8'))?.[1]?.trim();
  if (!line) throw new Error('A local PostgreSQL server URL is required');
  const url = new URL(line.replace(/^(["'])(.*)\1$/, '$2'));
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Run this helper on the PostgreSQL host using a loopback server URL');
  if (url.searchParams.get('schema') && url.searchParams.get('schema') !== 'public') throw new Error('Only the public schema is supported');
  return url;
}

export function newDatabaseName(kind = 'cloud') {
  if (!['cloud', 'test_history', 'test_bootstrap'].includes(kind)) throw new Error('Unknown isolated database kind');
  return `bizovix_${kind}_${Date.now()}_${randomBytes(3).toString('hex')}`;
}

export function client(server, databaseName) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName) || ['postgres', 'template0', 'template1', decodeURIComponent(server.pathname.slice(1))].includes(databaseName)) throw new Error('Target must be a new, separately named database');
  const targetUrl = new URL(server);
  targetUrl.pathname = `/${databaseName}`;
  // Copy only the explicitly validated endpoint and credentials. URL query options
  // must not supply a socket/service/alternate host to Prisma while libpq uses localhost.
  targetUrl.search = '';
  targetUrl.searchParams.set('schema', 'public');
  const binaryRoot = process.env.BIZOVIX_POSTGRES_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '/usr/bin');
  // In particular PGHOSTADDR takes routing precedence over PGHOST. Inherit no PG*
  // variables, then supply one endpoint for createdb, psql, pg_dump and Prisma.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('PG')));
  const env = { ...inherited, PGHOST: server.hostname.replace(/^\[|\]$/g, ''), PGPORT: server.port || '5432', PGUSER: decodeURIComponent(server.username), PGPASSWORD: decodeURIComponent(server.password), PGDATABASE: databaseName, PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '10', DATABASE_URL: targetUrl.toString(), TEST_DATABASE_URL: targetUrl.toString() };
  const binary = name => path.join(binaryRoot, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  const run = (command, args, input, options = {}) => {
    const result = spawnSync(command, args, { cwd: options.cwd ?? root, env: { ...env, ...options.env }, input, encoding: 'utf8', stdio: options.stdio ?? 'pipe', windowsHide: true, shell: false, maxBuffer: 32 * 1024 * 1024, timeout: options.timeoutMs ?? 180_000 });
    if (result.error) throw new Error(`Could not execute ${path.basename(command)}: ${result.error.code ?? 'unknown error'}`);
    return result;
  };
  const sql = (input, { transaction = false } = {}) => run(binary('psql'), ['--no-psqlrc', '--no-password', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', ...(transaction ? ['--single-transaction'] : []), '--dbname', databaseName], input);
  const checkedSql = (input, options) => {
    const result = sql(input, options);
    if (result.status !== 0) throw new Error(`SQL step failed in isolated database ${databaseName}: ${result.stderr.trim()}`);
    return result.stdout.trim();
  };
  return { databaseName, targetUrl, binary, run, sql, checkedSql, create() {
    const result = run(binary('createdb'), ['--no-password', '--maintenance-db=postgres', '--template=template0', '--encoding=UTF8', databaseName]);
    // No --if-not-exists, fallback, DROP, or connection to an existing target is allowed.
    if (result.status !== 0) throw new Error(`Database creation refused or failed: ${databaseName}. Existing databases were not changed.`);
    const version = Number(checkedSql('SHOW server_version_num;'));
    if (version < 180000 || version >= 190000) throw new Error(`Baseline is validated for PostgreSQL 18; new empty database retained: ${databaseName}`);
  } };
}

export const emptyDatabaseGuard = `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%')
     OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'c', 'r', 'm'))
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
     OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public', 'pg_catalog', 'information_schema') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%')
  THEN RAISE EXCEPTION 'Bootstrap requires a completely empty database'; END IF;
END $$;
`;

export const scratchDatabaseGuard = `-- SAFETY: this reconciliation is executable only in disposable history-audit databases.
DO $$ BEGIN
  IF current_database() !~ '^bizovix_test_history_[0-9]+_[a-f0-9]{6}$' THEN
    RAISE EXCEPTION 'Prisma reconciliation requires an isolated history-audit database';
  END IF;
END $$;

`;

export function catalog(connection) {
  const result = JSON.parse(connection.checkedSql(`SELECT json_build_object(
    'tables', (SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'),
    'columns', (SELECT json_agg(json_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname <> '_prisma_migrations' AND a.attnum>0 AND NOT a.attisdropped),
    'indexes', (SELECT json_agg(json_build_object('table',t.relname,'name',i.relname,'primary',x.indisprimary,'unique',x.indisunique,'definition',pg_get_indexdef(i.oid)) ORDER BY i.relname) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname <> '_prisma_migrations'),
    'enums', (SELECT json_object_agg(typname, labels ORDER BY typname) FROM (SELECT t.typname, json_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname) e),
    'checks', (SELECT json_agg(json_build_object('table', r.relname, 'name', c.conname, 'definition', pg_get_constraintdef(c.oid)) ORDER BY r.relname,c.conname) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND c.contype='c'),
    'specialIndexes', (SELECT json_agg(json_build_object('table', t.relname, 'name', i.relname, 'definition', pg_get_indexdef(i.oid)) ORDER BY i.relname) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND (x.indpred IS NOT NULL OR x.indexprs IS NOT NULL)),
    'foreignKeys', (SELECT json_agg(json_build_object('table', r.relname, 'name', c.conname, 'definition', pg_get_constraintdef(c.oid)) ORDER BY r.relname,c.conname) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND c.contype='f')
  );`));
  // Cluster locale differs across Windows/Linux. Keep comparisons independent of
  // database collation while retaining each table's physical column order.
  // A sparse legacy schema may have no enums, CHECKs, FKs or special indexes.
  for (const key of ['tables', 'columns', 'indexes', 'checks', 'specialIndexes', 'foreignKeys']) result[key] ??= [];
  result.enums ??= {};
  const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  result.tables.sort(compare);
  result.columns.sort((left, right) => compare(left.table, right.table));
  for (const key of ['indexes', 'specialIndexes']) result[key].sort((left, right) => compare(left.name, right.name));
  for (const key of ['checks', 'foreignKeys']) result[key].sort((left, right) => compare(left.table, right.table) || compare(left.name, right.name));
  result.enums = Object.fromEntries(Object.entries(result.enums).sort(([left], [right]) => compare(left, right)));
  return result;
}

export function verifyManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(baselineRoot, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1 || manifest.hashNormalization !== 'LF' || manifest.postgresqlMajor !== 18 || manifest.prismaVersion !== '6.19.3') throw new Error('Unsupported baseline manifest');
  for (const [name, expected] of Object.entries(manifest.files)) if (sha256(fs.readFileSync(path.join(baselineRoot, name))) !== expected) throw new Error(`Baseline artifact checksum mismatch: ${name}`);
  if (sha256(fs.readFileSync(schemaPath)) !== manifest.schemaSha256) throw new Error('Prisma schema changed; regenerate and review the baseline first');
  if (JSON.stringify(migrationFiles()) !== JSON.stringify(manifest.migrations)) throw new Error('Migration history changed; regenerate and review the baseline first');
  if (sha256(fs.readFileSync(path.join(root, 'packages/types/src/permissions.ts'))) !== manifest.permissionsSha256) throw new Error('Permission catalog changed; regenerate and review the baseline first');
  return manifest;
}

export function verifyPrismaShape(connection) {
  const result = connection.run(process.execPath, [prismaPath, 'migrate', 'diff', '--from-schema-datasource', schemaPath, '--to-schema-datamodel', schemaPath, '--script']);
  if (result.status !== 0) throw new Error('Could not verify baseline against current Prisma');
  // Two reviewed SQL-only lookup indexes are intentional supersets of the Prisma model.
  const remaining = result.stdout.replace(/-- DropIndex\r?\nDROP INDEX "(?:cms_works_organizationId_closedAt_idx|dlp_defects_organizationId_priority_status_idx)";\r?\n/g, '').trim();
  if (remaining && remaining !== '-- This is an empty migration.') throw new Error('Unexpected Prisma schema drift in fresh baseline');
}
