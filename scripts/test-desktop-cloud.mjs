/** All modes create a NEW isolated PostgreSQL test database. Existing data is never migrated. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { bootstrapCloudDatabase } from './bootstrap-cloud-database.mjs';
import { verifyCloudBootstrapSafety } from './test-cloud-baseline.mjs';
import { ensureSnapshotSyncSchema } from './lib/snapshot-sync-schema.mjs';
import { root, schemaPath, prismaPath, readServer, client, newDatabaseName } from './lib/cloud-bootstrap.mjs';

const arguments_ = process.argv.slice(2);
const allIntegration = arguments_.includes('--all-integration');
const schemaModes = arguments_.filter(argument => argument !== '--all-integration');
if (arguments_.some(argument => !['--baseline', '--schema-snapshot', '--legacy-migrations', '--all-integration'].includes(argument)) || new Set(arguments_).size !== arguments_.length || schemaModes.length > 1 || (allIntegration && schemaModes.some(argument => argument !== '--baseline'))) throw new Error('Choose one schema mode; --all-integration is available only with the default source baseline');
let connection;
if (!arguments_.includes('--schema-snapshot') && !arguments_.includes('--legacy-migrations')) {
  // Default is source-only: no dependency on the configured application's catalog.
  ({ connection } = bootstrapCloudDatabase({ databaseName: newDatabaseName('test_bootstrap') }));
  verifyCloudBootstrapSafety(connection);
} else {
  const server = readServer();
  connection = client(server, newDatabaseName('test_bootstrap'));
  connection.create();
  console.log(`Created isolated legacy-validation database: ${connection.databaseName}`);
  const checked = (command, args, options) => {
    const result = connection.run(command, args, undefined, options);
    if (result.status !== 0) throw new Error(`Isolated legacy validation failed in ${path.basename(command)} (exit ${result.status}); database retained: ${connection.databaseName}`);
  };
  if (arguments_.includes('--schema-snapshot')) {
    // Explicit fallback only: read catalog definitions, never user rows, from the
    // source using enforced read-only PGOPTIONS. Routing still uses the shared
    // sanitized PG environment; inherited hostaddr/service/options cannot redirect it.
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bizovix-desktop-schema-test-'));
    const schemaFile = path.join(temporary, 'schema.sql');
    try {
      checked(connection.binary('pg_dump'), ['--no-password', '--schema-only', '--no-owner', '--no-privileges', '--exclude-table=public._prisma_migrations', '--dbname', decodeURIComponent(server.pathname.slice(1)), '--file', schemaFile], { env: { PGOPTIONS: '-c default_transaction_read_only=on' } });
      checked(connection.binary('psql'), ['--no-psqlrc', '--no-password', '--quiet', '--set=ON_ERROR_STOP=1', '--single-transaction', '--dbname', connection.databaseName, '--file', schemaFile]);
      const syncSchema = ensureSnapshotSyncSchema(connection);
      console.log(`Verified all ${syncSchema.verifiedTables.length} snapshot sync tables. Applied wholly absent families: ${syncSchema.applied.join(', ') || 'none'}.`);
    } finally {
      if (path.dirname(path.resolve(temporary)) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('bizovix-desktop-schema-test-')) throw new Error('Unsafe temporary path');
      fs.rmSync(schemaFile, { force: true });
      fs.rmdirSync(temporary);
    }
  } else {
    checked(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', schemaPath]);
  }
}

const resultDirectory = path.join(root, '.temp');
fs.mkdirSync(resultDirectory, { recursive: true });
const resultFile = path.join(resultDirectory, `${connection.databaseName}-${allIntegration ? 'business' : 'desktop'}-integration.json`);
const testArguments = allIntegration
  ? []
  : ['test-integration/desktop-(sync|master-sync|organization-sync|capture|roundtrip)\\.integration-spec\\.ts$'];
const logFile = resultFile.replace(/\.json$/, '.log');
console.log(`Running ${allIntegration ? 'all business and desktop' : 'desktop sync'} integration suites. Results: ${resultFile}; live log: ${logFile}`);
const logDescriptor = fs.openSync(logFile, 'wx');
let result;
try {
  result = connection.run(process.execPath, [path.join(root, 'apps/api/node_modules/jest/bin/jest.js'), '--config', 'jest.integration.config.js', '--runInBand', '--json', '--outputFile', resultFile, ...testArguments], undefined, {
    cwd: path.join(root, 'apps/api'),
    timeoutMs: allIntegration ? 1_800_000 : 180_000,
    stdio: ['ignore', logDescriptor, logDescriptor],
    env: { INTEGRATION_DB_VALIDATED: '1', BIZOVIX_ISOLATED_DATABASE_NAME: connection.databaseName, APP_ENV: 'test', JWT_ACCESS_SECRET: 'isolated-desktop-access', JWT_REFRESH_SECRET: 'isolated-desktop-refresh', VENDOR_ADMIN_JWT_SECRET: 'isolated-desktop-vendor', ...(allIntegration ? { BIZOVIX_PW_MODULE: '', BIZOVIX_PW_CHROME: '', DESKTOP_SYNC_ENABLED: 'false' } : {}) },
  });
} finally {
  fs.closeSync(logDescriptor);
}
process.stdout.write(fs.readFileSync(logFile, 'utf8'));
if (result.status !== 0) throw new Error(`Isolated ${allIntegration ? 'business' : 'desktop'} tests failed; fixture database retained: ${connection.databaseName}; evidence: ${resultFile}`);
process.stdout.write(`PASS: isolated cloud schema and real ${allIntegration ? 'business' : 'desktop sync'} tests. Fixture database retained: ${connection.databaseName}\n`);
