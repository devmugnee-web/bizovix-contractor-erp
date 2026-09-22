/**
 * Disposable architecture proof. This does NOT run the ERP on SQLite.
 * Requires a Node runtime with node:sqlite; creates only a fresh temp directory.
 * Does not read .env, application databases, credentials or user documents.
 * Usage: node scripts/probe-offline-sqlite.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync, backup } from "node:sqlite";

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bizovix-sqlite-proof-"));
const dbPath = path.join(testRoot, "proof.sqlite");
const backupPath = path.join(testRoot, "proof-backup.sqlite");
const results = [];
let db;

function passed(name) {
  results.push(name);
  process.stdout.write(`PASS ${name}\n`);
}
function open(file) {
  const connection = new DatabaseSync(file);
  connection.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
  return connection;
}
function canonicalUnits(value, scale) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error("Expected a decimal string");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  if (fraction.length > scale) throw new Error("Explicit rounding decision required");
  const magnitude = BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
  return negative ? -magnitude : magnitude;
}

try {
  db = open(dbPath);
  db.exec(`
    CREATE TABLE proof_decimal (id INTEGER PRIMARY KEY, affinity_decimal DECIMAL(24,6), exact_text TEXT NOT NULL);
    CREATE TABLE proof_records (org TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(org,id));
    CREATE TABLE proof_outbox (
      org TEXT NOT NULL, device TEXT NOT NULL, operation TEXT NOT NULL, entity TEXT NOT NULL,
      payload TEXT NOT NULL, PRIMARY KEY(org,device,operation),
      FOREIGN KEY(org,entity) REFERENCES proof_records(org,id)
    );
  `);
  const exact = "999999999999999999.999999";
  db.prepare("INSERT INTO proof_decimal VALUES (?, ?, ?)").run(1, exact, exact);
  const stored = db.prepare("SELECT typeof(affinity_decimal) AS storage_type, CAST(affinity_decimal AS TEXT) AS numeric_text, exact_text FROM proof_decimal").get();
  assert.equal(stored.exact_text, exact);
  assert.notEqual(stored.numeric_text, exact);
  passed("SQLite DECIMAL affinity loses this valid Decimal(24,6) value; TEXT preserves it (migration blocker reproduced)");

  const units = canonicalUnits(exact, 6);
  assert.equal((units + 1n).toString(), "1000000000000000000000000");
  assert.ok(units > 9_223_372_036_854_775_807n);
  assert.throws(() => db.prepare("INSERT INTO proof_decimal(id, exact_text) VALUES (?, ?)").run(units, exact));
  assert.throws(() => canonicalUnits("1.001", 2), /rounding decision/);
  passed("Arbitrary-precision arithmetic is exact; SQLite int64 cannot represent every declared ERP amount; excess scale is rejected");

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO proof_records VALUES (?, ?, ?)").run("org-a", "rollback", "local value");
    db.prepare("INSERT INTO proof_outbox VALUES (?, ?, ?, ?, ?)").run("org-a", "pc-a", "rollback", "missing-record", "{}");
    assert.fail("Foreign key violation should abort the unit of work");
  } catch (error) {
    db.exec("ROLLBACK");
    assert.match(String(error), /FOREIGN KEY/);
  }
  assert.equal(db.prepare("SELECT count(*) AS total FROM proof_records WHERE id='rollback'").get().total, 0);
  passed("Record and outbox transaction rolls back together when the second write fails");

  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO proof_records VALUES (?, ?, ?)").run("org-a", "record-a", "10.50");
  db.prepare("INSERT INTO proof_outbox VALUES (?, ?, ?, ?, ?)").run("org-a", "pc-a", "op-a", "record-a", '{"amount":"10.50"}');
  db.exec("COMMIT");
  assert.throws(() => db.prepare("INSERT INTO proof_outbox VALUES (?, ?, ?, ?, ?)").run("org-a", "pc-a", "op-a", "record-a", "{}"), /UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO proof_outbox VALUES (?, ?, ?, ?, ?)").run("org-b", "pc-b", "op-b", "record-a", "{}"), /FOREIGN KEY/);
  passed("Local operation key prevents duplicate queue insertion; composite foreign key prevents cross-organization linkage");
  db.close();
  db = undefined;

  function crashProbe(commit) {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { DatabaseSync } from 'node:sqlite';
      const d = new DatabaseSync(process.argv[1]);
      d.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
      d.prepare('INSERT INTO proof_records VALUES (?, ?, ?)').run('org-a', process.argv[2], 'restart proof');
      d.prepare('INSERT INTO proof_outbox VALUES (?, ?, ?, ?, ?)').run('org-a','pc-a',process.argv[2],process.argv[2],'{}');
      if (process.argv[3] === 'commit') d.exec('COMMIT');
      process.exit(29);
    `, dbPath, commit ? "committed-child" : "uncommitted-child", commit ? "commit" : "rollback"], {
      encoding: "utf8", windowsHide: true, timeout: 15_000,
    });
    if (child.error) throw child.error;
    assert.equal(child.status, 29, child.stderr);
  }
  crashProbe(false);
  crashProbe(true);
  db = open(dbPath);
  assert.equal(db.prepare("SELECT count(*) AS total FROM proof_records WHERE id='uncommitted-child'").get().total, 0);
  assert.equal(db.prepare("SELECT count(*) AS total FROM proof_outbox WHERE operation='uncommitted-child'").get().total, 0);
  assert.equal(db.prepare("SELECT count(*) AS total FROM proof_records WHERE id='committed-child'").get().total, 1);
  assert.equal(db.prepare("SELECT count(*) AS total FROM proof_outbox WHERE operation='committed-child'").get().total, 1);
  passed("Abrupt process exit preserves committed record+outbox and discards the uncommitted pair on restart");

  await backup(db, backupPath);
  const restored = new DatabaseSync(backupPath, { readOnly: true });
  try {
    assert.equal(restored.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(), []);
    assert.deepEqual(restored.prepare("SELECT * FROM proof_records ORDER BY org,id").all(), db.prepare("SELECT * FROM proof_records ORDER BY org,id").all());
    assert.deepEqual(restored.prepare("SELECT * FROM proof_outbox ORDER BY org,device,operation").all(), db.prepare("SELECT * FROM proof_outbox ORDER BY org,device,operation").all());
    assert.equal(restored.prepare("SELECT exact_text FROM proof_decimal WHERE id=1").get().exact_text, exact);
  } finally {
    restored.close();
  }
  passed("SQLite backup reopens with matching records/outbox, exact amount text, integrity and foreign-key checks");
  process.stdout.write(`\n${results.length} isolated storage proofs passed on Node ${process.version}.\n`);
  process.stdout.write("Not tested here: packaged Electron, real ERP business services, cloud sync, authorization, installer, power-loss hardware behavior.\n");
} finally {
  db?.close();
  // Delete only named files inside this freshly allocated proof directory.
  // No recursive deletion, no application database paths, no environment URLs.
  const resolved = path.resolve(testRoot);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("bizovix-sqlite-proof-"));
  for (const name of ["proof.sqlite", "proof.sqlite-wal", "proof.sqlite-shm", "proof-backup.sqlite", "proof-backup.sqlite-wal", "proof-backup.sqlite-shm"]) {
    const candidate = path.resolve(testRoot, name);
    assert.equal(path.dirname(candidate), resolved);
    fs.rmSync(candidate, { force: true });
  }
  fs.rmdirSync(testRoot);
}
