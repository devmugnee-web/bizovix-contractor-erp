import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog, client, readServer, sha256, rawSha256, verifyManifest } from '../lib/cloud-bootstrap.mjs';

test('source manifest is portable across Git CRLF/LF checkout while Prisma raw checksums remain distinct', () => {
  assert.equal(sha256(Buffer.from('a\r\nb\r\n')), sha256('a\nb\n'));
  assert.notEqual(rawSha256(Buffer.from('a\r\nb\r\n')), rawSha256('a\nb\n'));
  assert.equal(verifyManifest().hashNormalization, 'LF');
});

test('database target rejects configured source, system names and SQL-shaped names', () => {
  const server = new URL('postgresql://fixture:fixture@127.0.0.1/source_db');
  for (const target of ['source_db', 'postgres', 'template0', 'template1', 'invalid;DROP DATABASE x', 'x'.repeat(64)]) assert.throws(() => client(server, target), /new, separately named/);
});

test('loopback server validation rejects remote PostgreSQL host', () => {
  const previous = process.env.BIZOVIX_CLOUD_BOOTSTRAP_URL;
  try {
    process.env.BIZOVIX_CLOUD_BOOTSTRAP_URL = 'postgresql://fixture:fixture@remote.example/source_db';
    assert.throws(() => readServer(), /loopback server URL/);
  } finally {
    if (previous === undefined) delete process.env.BIZOVIX_CLOUD_BOOTSTRAP_URL;
    else process.env.BIZOVIX_CLOUD_BOOTSTRAP_URL = previous;
  }
});

test('inherited libpq routing and URL options cannot redirect child connections', () => {
  const malicious = { PGHOSTADDR: '203.0.113.8', PGSERVICE: 'remote', PGSERVICEFILE: 'some-file', PGOPTIONS: '-c search_path=other', PGPASSFILE: 'another-file', PGDATABASE: 'customer_data', PGHOST: 'remote.example', PGUSER: 'wrong-user', PGPORT: '6543' };
  const previous = Object.fromEntries(Object.keys(malicious).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, malicious);
    const connection = client(new URL('postgresql://fixture:fixture@127.0.0.1:5432/source_db?host=remote.example&options=bad&schema=public'), 'new_isolated_database');
    assert.equal(connection.targetUrl.hostname, '127.0.0.1');
    assert.equal(connection.targetUrl.search, '?schema=public');
    // A plain Node child exposes only synthetic fixture variables. No PostgreSQL is started.
    const result = connection.run(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("PG")))))']);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { PGHOST: '127.0.0.1', PGPORT: '5432', PGUSER: 'fixture', PGPASSWORD: 'fixture', PGDATABASE: 'new_isolated_database', PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '10' });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('schema catalog comparisons do not depend on PostgreSQL cluster collation', () => {
  const unsorted = { tables: ['z_table', 'a_table'], columns: [{ table: 'z_table', name: 'z_first' }, { table: 'a_table', name: 'z_first' }, { table: 'a_table', name: 'a_second' }], indexes: [{ name: 'z_index' }, { name: 'a_index' }], specialIndexes: [{ name: 'z_special' }, { name: 'a_special' }], checks: [{ table: 'z_table', name: 'a_check' }, { table: 'a_table', name: 'z_check' }, { table: 'a_table', name: 'a_check' }], foreignKeys: [{ table: 'z_table', name: 'key' }, { table: 'a_table', name: 'key' }], enums: { ZStatus: ['LATER', 'EARLIER'], AStatus: ['ONE', 'TWO'] } };
  const ordered = catalog({ checkedSql: () => JSON.stringify(unsorted) });
  assert.deepEqual(ordered.tables, ['a_table', 'z_table']);
  assert.deepEqual(ordered.columns.map(column => column.name), ['z_first', 'a_second', 'z_first']);
  assert.deepEqual(ordered.indexes.map(index => index.name), ['a_index', 'z_index']);
  assert.deepEqual(ordered.checks.map(check => check.name), ['a_check', 'z_check', 'a_check']);
  assert.deepEqual(Object.keys(ordered.enums), ['AStatus', 'ZStatus']);
  assert.deepEqual(ordered.enums.ZStatus, ['LATER', 'EARLIER']);
});
