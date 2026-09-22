const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bizovix-electron-sqlite-probe-"));
const file = path.join(directory, "probe.sqlite");
let database;
try {
  database = new DatabaseSync(file);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; CREATE TABLE entry (id TEXT PRIMARY KEY, amount TEXT NOT NULL);");
  database.prepare("INSERT INTO entry VALUES (?, ?)").run("proof", "999999999999999999.999999");
  database.exec("BEGIN IMMEDIATE; INSERT INTO entry VALUES ('rolled-back', '1'); ROLLBACK;");
  const sqlite = database.prepare("SELECT sqlite_version() AS version").get().version;
  database.close();
  database = new DatabaseSync(file);
  assert.equal(database.prepare("SELECT amount FROM entry WHERE id = ?").get("proof").amount, "999999999999999999.999999");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM entry").get().count, 1);
  assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  console.log(JSON.stringify({ result: "passed", electron: process.versions.electron, node: process.versions.node, sqlite, architecture: process.arch, checks: ["bundled-driver", "disk-reopen", "exact-text-roundtrip", "rollback", "integrity"], scope: "runtime storage probe; not full ERP or installer acceptance" }));
} finally {
  database?.close();
  // Only the fresh directory created by this probe is removed.
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) === tempRoot && path.basename(resolved).startsWith("bizovix-electron-sqlite-probe-")) fs.rmSync(resolved, { recursive: true, force: true });
}
