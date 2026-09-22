/** Isolated acceptance checks for the fresh bootstrap and SQL-only invariants. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootstrapCloudDatabase } from './bootstrap-cloud-database.mjs';
import { baselineRoot, schemaPath, prismaPath, readServer, client, newDatabaseName, emptyDatabaseGuard } from './lib/cloud-bootstrap.mjs';

export function verifyCloudBootstrapSafety(connection) {
assert.match(connection.databaseName, /^bizovix_test_bootstrap_\d+_[a-f0-9]{6}$/, 'Safety fixtures require an isolated bootstrap test database');
assert.throws(() => client(readServer(), decodeURIComponent(readServer().pathname.slice(1))), /new, separately named/);
assert.throws(() => bootstrapCloudDatabase({ databaseName: connection.databaseName, log: () => {} }), /creation refused or failed/);
const guarded = connection.sql(emptyDatabaseGuard, { transaction: true });
assert.notEqual(guarded.status, 0);
assert.match(guarded.stderr, /completely empty database/);
const directReplay = connection.run(connection.binary('psql'), ['--no-psqlrc', '--no-password', '--quiet', '--set=ON_ERROR_STOP=1', '--single-transaction', '--dbname', connection.databaseName, '--file', path.join(baselineRoot, 'schema.sql')]);
assert.notEqual(directReplay.status, 0);
assert.match(directReplay.stderr, /completely empty database/);
const unsafeReconciliation = connection.run(connection.binary('psql'), ['--no-psqlrc', '--no-password', '--quiet', '--set=ON_ERROR_STOP=1', '--single-transaction', '--dbname', connection.databaseName, '--file', path.join(baselineRoot, 'reviewed-prisma-reconciliation.sql')]);
assert.notEqual(unsafeReconciliation.status, 0);
assert.match(unsafeReconciliation.stderr, /requires an isolated history-audit database/);
connection.checkedSql(`BEGIN;
CREATE TEMP TABLE tax_probe (LIKE public.tender_vat_tax_entries INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
INSERT INTO tax_probe (id,"organizationId","tenderId","taxType","entryKind","entryDate",amount,"referenceNo","referenceKey","requestId","requestHash","createdById","updatedById","updatedAt")
VALUES ('one','org','tender','VAT','SELF_DEPOSIT',CURRENT_DATE,1.25,'A','a','request-one','hash','user','user',CURRENT_TIMESTAMP);
DO $$ DECLARE constraint_name text; BEGIN
  BEGIN
    UPDATE tax_probe SET amount = -0.01 WHERE id='one';
    RAISE EXCEPTION 'Negative financial amount was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
    IF constraint_name <> 'tender_vat_tax_entries_positive_amount' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO tax_probe SELECT 'two', "organizationId", "tenderId", "taxType", "entryKind", "entryDate", amount, "referenceNo", "referenceKey", notes, 'request-two', "requestHash", version, "voidedAt", "voidReason", "createdById", "updatedById", "createdAt", "updatedAt" FROM tax_probe WHERE id='one';
    RAISE EXCEPTION 'Duplicate active financial reference was accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
UPDATE tax_probe SET "voidedAt"=CURRENT_TIMESTAMP, "voidReason"='Reversed for isolated acceptance test' WHERE id='one';
INSERT INTO tax_probe SELECT 'replacement', "organizationId", "tenderId", "taxType", "entryKind", "entryDate", amount, "referenceNo", "referenceKey", notes, 'request-replacement', "requestHash", version, NULL, NULL, "createdById", "updatedById", "createdAt", "updatedAt" FROM tax_probe WHERE id='one';
DO $$ BEGIN IF (SELECT count(*) FROM tax_probe) <> 2 THEN RAISE EXCEPTION 'Voided history/replacement reference behavior failed'; END IF; END $$;
CREATE TEMP TABLE precision_probe (value numeric(24,6));
INSERT INTO precision_probe VALUES ('999999999999999999.123456');
DO $$ BEGIN IF (SELECT value::text FROM precision_probe) <> '999999999999999999.123456' THEN RAISE EXCEPTION 'Precision-24 decimal changed'; END IF; END $$;
ROLLBACK;`);
const deploy = connection.run(process.execPath, [prismaPath, 'migrate', 'deploy', '--schema', schemaPath]);
assert.equal(deploy.status, 0, 'Prisma deploy must recognize the preserved original history');
assert.match(deploy.stdout, /No pending migrations/);
console.log('PASS: source/existing DB rejection, direct nonempty SQL rejection, scratch-only reconciliation guard, amount CHECK, active-reference uniqueness/reversal, exact numeric(24,6), and Prisma migrate deploy.');
console.log(`Isolated fixture database retained: ${connection.databaseName}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { connection } = bootstrapCloudDatabase({ databaseName: newDatabaseName('test_bootstrap') });
  verifyCloudBootstrapSafety(connection);
}
