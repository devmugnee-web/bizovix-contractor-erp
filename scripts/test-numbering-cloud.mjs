/** Validate shared numbering only in a NEW source-baseline database. */
import fs from 'node:fs';
import path from 'node:path';
import { bootstrapCloudDatabase } from './bootstrap-cloud-database.mjs';
import { root, newDatabaseName } from './lib/cloud-bootstrap.mjs';

if (process.argv.length !== 2) throw new Error('No existing database or other arguments are accepted');
const { connection } = bootstrapCloudDatabase({ databaseName: newDatabaseName('test_bootstrap') });
const resultFile = path.join(root, '.temp', `${connection.databaseName}-numbering-integration.json`);
const logFile = resultFile.replace(/\.json$/, '.log');
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
const log = fs.openSync(logFile, 'wx');
console.log(`Running numbering ownership/concurrency and existing master regressions. Evidence: ${resultFile}`);
let result;
try {
  result = connection.run(process.execPath, [path.join(root, 'apps/api/node_modules/jest/bin/jest.js'), '--config', 'jest.integration.config.js', '--runInBand', '--json', '--outputFile', resultFile, 'test-integration/(numbering-transaction|masters)\\.integration-spec\\.ts$'], undefined, {
    cwd: path.join(root, 'apps/api'), timeoutMs: 180_000, stdio: ['ignore', log, log],
    env: { INTEGRATION_DB_VALIDATED: '1', BIZOVIX_ISOLATED_DATABASE_NAME: connection.databaseName, APP_ENV: 'test', JWT_ACCESS_SECRET: 'isolated-numbering-access', JWT_REFRESH_SECRET: 'isolated-numbering-refresh', VENDOR_ADMIN_JWT_SECRET: 'isolated-numbering-vendor', DESKTOP_SYNC_ENABLED: 'false' },
  });
} finally { fs.closeSync(log); }
process.stdout.write(fs.readFileSync(logFile, 'utf8'));
if (result.status !== 0) throw new Error(`Isolated numbering verification failed; fixture database retained: ${connection.databaseName}`);
console.log(`PASS: numbering and master business tests; isolated fixture retained: ${connection.databaseName}`);
