import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { baselineRoot } from '../lib/cloud-bootstrap.mjs';
import { ensureSnapshotSyncSchema, planSnapshotSyncMigrations, SNAPSHOT_SYNC_FAMILIES } from '../lib/snapshot-sync-schema.mjs';

const expected = JSON.parse(fs.readFileSync(path.join(baselineRoot, 'catalog.json'), 'utf8'));
function without(source, tables) {
  const names = new Set(tables);
  return { ...source, tables: source.tables.filter(table => !names.has(table)), ...Object.fromEntries(['columns', 'indexes', 'checks', 'specialIndexes', 'foreignKeys'].map(key => [key, source[key].filter(row => !names.has(row.table))])) };
}
const [categories, masters] = SNAPSHOT_SYNC_FAMILIES;

test('absent families select only their reviewed additive migrations; matching tables are skipped', () => {
  assert.deepEqual(planSnapshotSyncMigrations(without(expected, [...categories.tables, ...masters.tables]), expected), [categories.migration, masters.migration, masters.upgrade]);
  assert.deepEqual(planSnapshotSyncMigrations(without(expected, masters.tables), expected), [masters.migration, masters.upgrade]);
  assert.deepEqual(planSnapshotSyncMigrations(without(expected, categories.tables), expected), [categories.migration]);
  assert.deepEqual(planSnapshotSyncMigrations(expected, expected), []);
});

test('every partially present family is refused before a migration plan can be returned', () => {
  for (const family of SNAPSHOT_SYNC_FAMILIES) {
    for (const absentTable of family.tables) assert.throws(() => planSnapshotSyncMigrations(without(expected, [absentTable]), expected), /Partial snapshot sync schema/);
  }
});

test('matching table names do not hide changed column, default, CHECK, index or FK semantics', () => {
  for (const [key, field, value] of [
    ['columns', 'type', 'text'], ['columns', 'default', '999'], ['columns', 'nullable', true],
    ['checks', 'definition', 'CHECK (true)'], ['indexes', 'unique', false], ['foreignKeys', 'definition', 'FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE CASCADE'],
  ]) {
    const actual = structuredClone(expected);
    const row = actual[key].find(entry => masters.tables.includes(entry.table) && (key !== 'columns' || entry.name === 'sequence'));
    assert(row, `Fixture contains ${key}`);
    assert.notEqual(row[field], value);
    row[field] = value;
    assert.throws(() => planSnapshotSyncMigrations(actual, expected), /Mismatched snapshot sync schema/);
  }
});

test('non-generated and wrong live database identities are rejected without DDL', () => {
  assert.throws(() => ensureSnapshotSyncSchema({ databaseName: 'application_db', checkedSql() { assert.fail('Unexpected database access'); } }), /exact generated isolated/);
  const calls = [];
  assert.throws(() => ensureSnapshotSyncSchema({ databaseName: 'bizovix_test_bootstrap_123456_abcdef', checkedSql(sql) { calls.push(sql); return 'application_db'; } }), /wrong isolated database/);
  assert.deepEqual(calls, ['SELECT current_database();']);
});

test('an absent category family and partial master family perform no DDL', () => {
  const actual = without(expected, [...categories.tables, masters.tables[0]]);
  const calls = [];
  const databaseName = 'bizovix_test_bootstrap_123456_abcdef';
  assert.throws(() => ensureSnapshotSyncSchema({ databaseName, checkedSql(sql) { calls.push(sql); if (sql === 'SELECT current_database();') return databaseName; if (sql.startsWith('SELECT EXISTS (')) return 'f'; assert.match(sql, /^SELECT json_build_object\(/); return JSON.stringify(actual); } }), /Partial snapshot sync schema/);
  assert.equal(calls.length, 3);
});

test('already matching families perform catalog verification without replaying any DDL', () => {
  const databaseName = 'bizovix_test_bootstrap_123456_abcdef';
  let reads = 0;
  const result = ensureSnapshotSyncSchema({ databaseName, checkedSql(sql) { if (sql === 'SELECT current_database();') return databaseName; if (sql.startsWith('SELECT EXISTS (')) return 'f'; assert.match(sql, /^SELECT json_build_object\(/); reads++; return JSON.stringify(expected); } });
  assert.deepEqual(result.applied, []);
  assert.equal(result.verifiedTables.length, 8);
  assert.equal(reads, 2);
});

test('missing families use one guarded public-schema transaction and require complete post-DDL verification', () => {
  const databaseName = 'bizovix_test_bootstrap_123456_abcdef';
  const missing = without(expected, masters.tables);
  let wrote = false;
  const result = ensureSnapshotSyncSchema({ databaseName, checkedSql(sql, options) {
    if (sql === 'SELECT current_database();') return databaseName;
    if (sql.startsWith('SELECT EXISTS (')) return 'f';
    if (sql.startsWith('SELECT json_build_object(')) return JSON.stringify(wrote ? expected : missing);
    assert.equal(wrote, false);
    assert.deepEqual(options, { transaction: true });
    assert.match(sql, /SET LOCAL search_path = public/);
    assert.match(sql, /current_database\(\) <> 'bizovix_test_bootstrap_123456_abcdef'/);
    assert.match(sql, /CREATE TABLE "desktop_master_sync_clocks"/);
    assert.doesNotMatch(sql, /CREATE TABLE "desktop_sync_devices"/);
    wrote = true;
    return '';
  } });
  assert.equal(wrote, true);
  assert.deepEqual(result.applied, [masters.migration, masters.upgrade]);
});

test('only the exact reviewed old master CHECK family receives the organization upgrade', () => {
  const previous = structuredClone(expected);
  const checks = previous.checks.filter(row => masters.tables.includes(row.table) && row.name === `${row.table}_entityType_check`);
  assert.equal(checks.length, 3);
  for (const row of checks) {
    assert.match(row.definition, /organizationMaster/);
    row.definition = row.definition.replace(", 'organizationMaster'::text", '');
  }
  assert.deepEqual(planSnapshotSyncMigrations(previous, expected), [masters.upgrade]);
  const partial = structuredClone(previous);
  partial.checks.find(row => row.name === checks[0].name).definition = expected.checks.find(row => row.name === checks[0].name).definition;
  assert.throws(() => planSnapshotSyncMigrations(partial, expected), /Mismatched snapshot sync schema/);
  previous.columns.find(row => masters.tables.includes(row.table) && row.name === 'sequence').default = '999';
  assert.throws(() => planSnapshotSyncMigrations(previous, expected), /Mismatched snapshot sync schema/);
});

test('a successful SQL call cannot mask missing tables in the final catalog', () => {
  const databaseName = 'bizovix_test_bootstrap_123456_abcdef';
  const missing = without(expected, masters.tables);
  let writes = 0;
  assert.throws(() => ensureSnapshotSyncSchema({ databaseName, checkedSql(sql, options) {
    if (sql === 'SELECT current_database();') return databaseName;
    if (sql.startsWith('SELECT EXISTS (')) return 'f';
    if (sql.startsWith('SELECT json_build_object(')) return JSON.stringify(missing);
    assert.deepEqual(options, { transaction: true });
    writes++;
    return '';
  } }), /verification failed after additive setup/);
  assert.equal(writes, 1);
});

test('deferrable or invalid sync indexes are refused before catalog planning or DDL', () => {
  const databaseName = 'bizovix_test_bootstrap_123456_abcdef';
  let calls = 0;
  assert.throws(() => ensureSnapshotSyncSchema({ databaseName, checkedSql(sql) {
    calls++;
    if (sql === 'SELECT current_database();') return databaseName;
    assert.match(sql, /^SELECT EXISTS \(/);
    assert.match(sql, /NOT i.indimmediate OR NOT i.indisvalid OR NOT i.indisready/);
    assert.match(sql, /c.condeferrable OR c.condeferred/);
    return 't';
  } }), /index or primary-key state/);
  assert.equal(calls, 2);
});
