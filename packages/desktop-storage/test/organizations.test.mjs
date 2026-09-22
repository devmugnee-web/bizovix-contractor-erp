import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DesktopStore, inspectDesktopBackup, normalizeMasterInput } from "../src/index.mjs";
import { MASTER_MIGRATION, MasterOperations } from "../src/masters.mjs";
import { ORGANIZATION_MIGRATION } from "../src/organization-migration.mjs";

const type = "organizationMaster";
const profile = { environmentId: "fixture", organizationId: "org", userId: "user", deviceId: "pc" };
const date = "2026-09-21T00:00:00.000Z";
const hash = value => createHash("sha256").update(value).digest("hex");
const input = (shortName = "ABC") => ({ shortName, fullName: `Full ${shortName}` });
const record = (id = "accepted-org", values = {}) => ({ id, ...input(), version: 1, createdAt: date, updatedAt: date, ...values });
const acknowledge = command => record(command.entityId, command.payload);
const oldChecksums = ["f5ebe73c3c0a8eed3ba38b265321c6eb104883b0a94a0e8720aff85966f2bd4f", "9a7c96d4cd022b014f909e3f4a23a7d0ea7e6d887dba5a68a843b5f7b7d2b7a8", "7f0147cf5be3cac797116a3b54ba2ca52b9dbd2e49adea658f0418f5a96a1172"];
const queryIndex = (orderedIds = [], caseMappings = []) => ({ formatVersion: 1, orderedIds, caseMappings });

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bizovix-organization-storage-")), opened = [];
  const open = (bound = profile, directory = root) => {
    const store = new DesktopStore({ rootDirectory: directory, profile: bound }); opened.push(store); return store;
  };
  t.after(() => {
    for (const store of opened) store.close();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("bizovix-organization-storage-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, open };
}

function withDb(file, action, readOnly = true) {
  const db = new DatabaseSync(file, { readOnly });
  try { return action(db); } finally { db.close(); }
}

function createV2Fixture(root) {
  const directory = path.join(root, hash(JSON.stringify(profile)));
  fs.mkdirSync(directory);
  const file = path.join(directory, "desktop.sqlite");
  const oldTables = ["store_metadata", "category_entities", "accepted_categories", "category_outbox", "category_drafts", "master_entities", "accepted_masters", "master_outbox", "master_drafts", "master_cursors"];
  const saved = withDb(file, db => {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE local_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
    for (const version of [1, 2]) {
      const sql = fs.readFileSync(new URL(`./fixtures/schema-v${version}.sql`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
      assert.equal(hash(sql), oldChecksums[version - 1]);
      if (version === 2) assert.equal(MASTER_MIGRATION.sql, sql, "Original v2 migration text is unchanged");
      db.exec(sql);
      db.prepare("INSERT INTO local_migrations VALUES(?,?,?)").run(version, oldChecksums[version - 1], date);
    }
    db.prepare("INSERT INTO store_metadata VALUES(1,?,?,?,?)").run(JSON.stringify(profile), hash(JSON.stringify(profile)), "category:old", date);
    db.exec("PRAGMA application_id=1113211987; PRAGMA user_version=2");
    const category = { id: "local-category", type: "MATERIAL", name: "Pending category", description: null, isActive: true, version: 0, createdAt: date, updatedAt: date };
    db.prepare("INSERT INTO category_entities VALUES(?)").run(category.id);
    db.prepare("INSERT INTO category_outbox(operation_id,device_id,schema_version,command_type,entity_id,payload,created_at) VALUES(?,?,1,'masterCategory.create',?,?,?)").run("old-category-op", profile.deviceId, category.id, JSON.stringify({ type: category.type, name: category.name, description: null, isActive: true }), date);
    db.prepare("INSERT INTO category_drafts VALUES(?,?,?)").run(category.id, "old-category-op", JSON.stringify(category));
    const masters = new MasterOperations(db, profile);
    masters.snapshot("uom", [{ id: "old-uom", code: "KG", name: "Kilogram", symbol: "kg", isActive: true, version: 1, createdAt: date, updatedAt: date }], "uom:old");
    masters.snapshot("paymentTerm", [{ id: "old-term", name: "Net 15", days: 15, description: null, isActive: true, version: 1, createdAt: date, updatedAt: date }], "term:old");
    masters.update("uom", "old-uom", { code: "KG", name: "Pending kilogram" });
    const rejected = masters.create("paymentTerm", { name: "Rejected term", days: 30 });
    masters.reject(rejected.command.operationId, "CONFLICT", "Original rejection");
    return {
      rows: Object.fromEntries(oldTables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])),
      migrations: db.prepare("SELECT * FROM local_migrations ORDER BY version").all(),
      schema: db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),
    };
  }, false);
  return { directory, file, ...saved };
}

function assertOriginalRows(file, saved) {
  withDb(file, db => {
    for (const [table, rows] of Object.entries(saved.rows)) assert.deepEqual(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), rows, `${table} bytes/values preserved`);
    assert.deepEqual(db.prepare("SELECT * FROM local_migrations WHERE version<=? ORDER BY version").all(saved.migrations.at(-1).version), saved.migrations);
    for (const row of saved.schema) assert.deepEqual(db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name=?").get(row.name), row);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  });
}

test("migration three preserves populated v2 schemas, exact operations and cursors after a verified v2 backup", t => {
  const { root, open } = fixture(t), saved = createV2Fixture(root);
  assert.deepEqual(inspectDesktopBackup(saved.file, profile), { schemaVersion: 2, profile, pendingCount: 2, rejectedCount: 1 });
  const store = open();
  assert.equal(store.status().schemaVersion, 4);
  assert.equal(store.status().pendingCount, 2); assert.equal(store.status().rejectedCount, 1);
  assert.equal(store.readCursor(), "category:old");
  assert.equal(store.readMasterCursor("uom"), "uom:old"); assert.equal(store.readMasterCursor("paymentTerm"), "term:old");
  assert.equal(store.readMasterCursor(type), null); assert.deepEqual(store.listMasters(type), []);
  assertOriginalRows(saved.file, saved);
  const backups = fs.readdirSync(path.join(saved.directory, "migration-backups"));
  assert.equal(backups.length, 1); assert.match(backups[0], /^schema-2-/);
  const backup = path.join(saved.directory, "migration-backups", backups[0]);
  assert.equal(inspectDesktopBackup(backup, profile).schemaVersion, 2); assertOriginalRows(backup, saved);
  store.close(); open();
  assert.equal(fs.readdirSync(path.join(saved.directory, "migration-backups")).length, 1);
});

test("failed v2 backup durability and changed v2 checksum prevent migration three without resetting data", t => {
  const { root, open } = fixture(t), saved = createV2Fixture(root), original = fs.fsyncSync;
  fs.fsyncSync = () => { throw new Error("simulated full disk during migration backup"); };
  try { assert.throws(() => open(), { code: "DATABASE_OPEN" }); } finally { fs.fsyncSync = original; }
  assert.equal(inspectDesktopBackup(saved.file, profile).schemaVersion, 2); assertOriginalRows(saved.file, saved);
  withDb(saved.file, db => db.prepare("UPDATE local_migrations SET checksum='changed' WHERE version=2").run(), false);
  assert.throws(() => open(), { code: "MIGRATION_MISMATCH" });
  withDb(saved.file, db => {
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 2);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='organization_master_outbox'").get().n, 0);
    db.prepare("UPDATE local_migrations SET checksum=? WHERE version=2").run(oldChecksums[1]);
  }, false);
  assert.equal(open().status().schemaVersion, 4);
});

test("migration four preserves populated schema three and verifies its complete pre-upgrade backup", t => {
  const { root, open } = fixture(t), saved = createV2Fixture(root);
  withDb(saved.file, db => {
    const sql = fs.readFileSync(new URL("./fixtures/schema-v3.sql", import.meta.url), "utf8").replaceAll("\r\n", "\n");
    assert.equal(hash(sql), oldChecksums[2]); assert.equal(ORGANIZATION_MIGRATION.sql, sql);
    db.exec(sql);
    db.prepare("INSERT INTO local_migrations VALUES(3,?,?)").run(oldChecksums[2], date);
    db.exec("PRAGMA user_version=3");
    const accepted = record("schema-three", { shortName: "\u1E9E", fullName: "Original accepted organization" });
    db.prepare("INSERT INTO organization_master_entities VALUES(?,?)").run(type, accepted.id);
    db.prepare("INSERT INTO accepted_organization_masters VALUES(?,?,?,?,1)").run(type, accepted.id, JSON.stringify(accepted), accepted.version);
    db.prepare("UPDATE organization_master_cursors SET cursor=?").run("org:schema-three");
    const operations = new MasterOperations(db, profile, true);
    operations.create(type, input("Pending organization"));
    const rejected = operations.create(type, input("Rejected organization"));
    operations.reject(rejected.command.operationId, "CONFLICT", "Existing review");
    for (const table of ["organization_master_entities", "accepted_organization_masters", "organization_master_outbox", "organization_master_drafts", "organization_master_cursors"]) saved.rows[table] = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
    saved.migrations = db.prepare("SELECT * FROM local_migrations ORDER BY version").all();
    saved.schema = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  }, false);
  assert.deepEqual(inspectDesktopBackup(saved.file, profile), { schemaVersion: 3, profile, pendingCount: 3, rejectedCount: 2 });
  const store = open();
  assert.equal(store.status().schemaVersion, 4); assert.equal(store.readOrganizationQueryIndex(), null);
  assert.equal(store.readMasterCursor(type), "org:schema-three"); assertOriginalRows(saved.file, saved);
  assert.equal(store.status().pendingCount, 3); assert.equal(store.status().rejectedCount, 2);
  const backups = fs.readdirSync(path.join(saved.directory, "migration-backups"));
  assert.equal(backups.length, 1); assert.match(backups[0], /^schema-3-/);
  const backup = path.join(saved.directory, "migration-backups", backups[0]);
  assert.equal(inspectDesktopBackup(backup, profile).schemaVersion, 3); assertOriginalRows(backup, saved);
  store.close(); open(); assert.equal(fs.readdirSync(path.join(saved.directory, "migration-backups")).length, 1);
});

test("organization inputs preserve exact names and match Unicode length, required fields and case-sensitive uniqueness", t => {
  const { open } = fixture(t), store = open();
  for (const value of [input(" abc "), { shortName: " ", fullName: "  " }, { shortName: "😀".repeat(50), fullName: "😀".repeat(200) }]) assert.deepEqual(normalizeMasterInput(type, value), value);
  for (const value of [{ shortName: null, fullName: "A" }, { shortName: "A" }, { shortName: "", fullName: "A" }, input("😀".repeat(51)), { shortName: "A", fullName: "😀".repeat(201) }, input("a\0b"), { ...input(), name: "unrecognized" }, { ...input(), isActive: true }]) assert.throws(() => store.stageMasterCreate(type, value), { code: "INVALID_MASTER" });
  store.applyMasterSnapshot(type, [record()], "org:initial");
  assert.throws(() => store.stageMasterCreate(type, input("ABC")), { code: "MASTER_DUPLICATE" });
  store.stageMasterCreate(type, input("abc")); store.stageMasterCreate(type, input(" ABC "));
  assert.equal(store.status().pendingCount, 2);
  assert.throws(() => store.stageMasterCreate(type, input("abc")), { code: "MASTER_DUPLICATE" });
  assert.deepEqual(store.listMasters(type, { includeLocalDrafts: false }).map(row => row.shortName), ["ABC"]);
});

test("organization name limits retain cloud validator presentation-sequence semantics without changing stored text", t => {
  const { open } = fixture(t); let store = open();
  const valid = [
    { shortName: "\u2611\uFE0F".repeat(50), fullName: "\u2611\uFE0E".repeat(200) },
    { shortName: "\u{1F600}\uFE0E".repeat(50), fullName: "\u{1F600}\uFE0F".repeat(200) },
    // Unattached and consecutive selectors are not all removed by validator.js.
    { shortName: "\uFE0F".repeat(50), fullName: "\uFE0E".repeat(200) },
    { shortName: "x\uFE0F\uFE0F".repeat(25), fullName: "x\uFE0E\uFE0E".repeat(100) },
  ];
  const staged = valid.map(value => {
    assert.deepEqual(normalizeMasterInput(type, value), value);
    return store.stageMasterCreate(type, value);
  });
  for (const invalid of [
    { shortName: "\u2611\uFE0F".repeat(51), fullName: "Valid" },
    { shortName: "Valid", fullName: "\u2611\uFE0E".repeat(201) },
    { shortName: "\u{1F600}\uFE0E".repeat(51), fullName: "Valid" },
    { shortName: "\uFE0F".repeat(51), fullName: "Valid" },
    { shortName: "Valid", fullName: "\uFE0E".repeat(201) },
    { shortName: "x\uFE0F\uFE0F".repeat(26), fullName: "Valid" },
  ]) assert.throws(() => store.stageMasterCreate(type, invalid), { code: "INVALID_MASTER" });
  assert.equal(store.status().pendingCount, valid.length, "invalid input cannot enqueue a command");
  store.close(); store = open();
  assert.deepEqual(store.pendingMasterCommands(type).map(command => command.payload), valid);
  for (const saved of staged) store.acceptMasterCommand(saved.command.operationId, acknowledge(saved.command));
  const accepted = new Map(store.listMasters(type, { includeLocalDrafts: false }).map(row => [row.id, row]));
  for (const saved of staged) {
    const { shortName, fullName } = accepted.get(saved.record.id);
    assert.deepEqual({ shortName, fullName }, saved.command.payload);
  }
  assert.equal(store.status().pendingCount, 0);
});

test("organization create survives restart and cannot be rewritten or deleted from its outbox", t => {
  const { open } = fixture(t); let store = open();
  const staged = store.stageMasterCreate(type, input(" Exact "));
  assert.equal(staged.command.commandType, "organizationMaster.create"); assert.equal(staged.command.expectedVersion, null);
  const original = structuredClone(staged.command); staged.command.payload.shortName = "Modified caller object";
  const file = store.status().databasePath;
  store.close(); store = open();
  assert.deepEqual(store.pendingMasterCommands(type), [original]);
  withDb(file, db => {
    assert.throws(() => db.exec("UPDATE organization_master_outbox SET payload='{}'"), /immutable/);
    assert.throws(() => db.exec("DELETE FROM organization_master_outbox"), /retained/);
  }, false);
  assert.throws(() => store.stageMasterCreateRevision(type, original.entityId, input("Retry")), { code: "COMMAND_PENDING" });
  assert.throws(() => store.stageMasterUpdate(type, original.entityId, input()), { code: "MASTER_UPDATE_UNSUPPORTED" });
  assert.deepEqual(store.pendingMasterCommands(type), [original]);
});

test("rejected organization correction preserves identity, original command and draft until authorized", t => {
  const { open } = fixture(t), store = open(), first = store.stageMasterCreate(type, input("Taken"));
  store.rejectMasterCommand(first.command.operationId, "CONFLICT", "Name used by another PC");
  store.applyMasterChanges(type, [{ kind: "upsert", record: record("another-pc", input("Taken")) }], "org:other");
  const before = withDb(store.status().databasePath, db => db.prepare("SELECT * FROM organization_master_outbox").get());
  const rejected = store.listMasters(type).find(row => row.id === first.record.id);
  assert.equal(rejected.syncStatus, "REJECTED"); assert.equal(rejected.shortName, "Taken");
  assert.deepEqual(store.listMasters(type, { includeLocalDrafts: false }).map(row => row.id), ["another-pc"]);
  assert.throws(() => store.stageMasterCreateRevision(type, first.record.id, input("Corrected"), { authorizeCommand: commandType => { assert.equal(commandType, "organizationMaster.create"); throw new Error("permission denied"); } }), /permission denied/);
  assert.deepEqual(withDb(store.status().databasePath, db => db.prepare("SELECT * FROM organization_master_outbox").get()), before);
  const next = store.stageMasterCreateRevision(type, first.record.id, input("Corrected"));
  assert.equal(next.record.id, first.record.id); assert.equal(next.record.createdAt, first.record.createdAt);
  assert.notEqual(next.command.operationId, first.command.operationId); assert.equal(next.command.commandType, "organizationMaster.create");
  assert.deepEqual(withDb(store.status().databasePath, db => db.prepare("SELECT * FROM organization_master_outbox WHERE operation_id=?").get(first.command.operationId)), before);
  assert.throws(() => store.acceptMasterCommand(first.command.operationId, acknowledge(first.command)), { code: "COMMAND_RESOLVED" });
  store.acceptMasterCommand(next.command.operationId, acknowledge(next.command));
  assert.equal(store.status().pendingCount, 0); assert.equal(store.status().rejectedCount, 0);
});

test("organization acknowledgements bind operation identity, exact untrimmed payload and version; replay is harmless", t => {
  const { open } = fixture(t), store = open(), staged = store.stageMasterCreate(type, input(" Exact "));
  const accepted = acknowledge(staged.command);
  for (const mismatch of [{ ...accepted, id: "other" }, { ...accepted, shortName: "Exact" }, { ...accepted, fullName: "Changed" }, { ...accepted, version: 2 }, { ...accepted, isActive: true }]) {
    assert.throws(() => store.acceptMasterCommand(staged.command.operationId, mismatch));
    assert.deepEqual(store.pendingMasterCommands(type), [staged.command]);
  }
  assert.throws(() => store.acceptMasterCommand("unknown-operation", accepted), { code: "COMMAND_NOT_FOUND" });
  store.acceptMasterCommand(staged.command.operationId, accepted); store.acceptMasterCommand(staged.command.operationId, accepted);
  assert.equal(store.status().pendingCount, 0); assert.equal(store.listMasters(type).length, 1);
  assert.equal(store.listMasters(type)[0].createdAt, date);
  assert.throws(() => store.rejectMasterCommand(staged.command.operationId, "CONFLICT", "Too late"), { code: "COMMAND_RESOLVED" });
  assert.throws(() => store.stageMasterCreateRevision(type, staged.record.id, input("Edited")), { code: "COMMAND_RESOLVED" });
  assert.throws(() => store.stageMasterUpdate(type, staged.record.id, input("Edited")), { code: "MASTER_UPDATE_UNSUPPORTED" });
});

test("snapshots retain rejected organization drafts and hidden accepted identity prevents creating an update", t => {
  const { open } = fixture(t), store = open(), staged = store.stageMasterCreate(type, input("Local"));
  store.rejectMasterCommand(staged.command.operationId, "CONFLICT", "Review");
  store.applyMasterSnapshot(type, [record(staged.record.id, input("Cloud"))], "org:1");
  assert.equal(store.listMasters(type)[0].cloudRecord.shortName, "Cloud");
  assert.throws(() => store.stageMasterCreateRevision(type, staged.record.id, input("Retry")), { code: "COMMAND_RESOLVED" });
  store.applyMasterSnapshot(type, [], "org:2");
  assert.equal(store.listMasters(type)[0].shortName, "Local"); assert.deepEqual(store.listMasters(type, { includeLocalDrafts: false }), []);
  assert.throws(() => store.stageMasterCreateRevision(type, staged.record.id, input("Retry")), { code: "COMMAND_RESOLVED" });
  assert.equal(store.status().rejectedCount, 1);
  const invalid = record("bad", { fullName: null });
  assert.throws(() => store.applyMasterSnapshot(type, [record("valid"), invalid], "org:bad"));
  assert.equal(store.readMasterCursor(type), "org:2"); assert.equal(store.listMasters(type).length, 1);
  assert.throws(() => store.applyMasterChanges(type, [{ kind: "upsert", record: record("valid") }, { kind: "upsert", record: invalid }], "org:bad"));
  assert.equal(store.readMasterCursor(type), "org:2"); assert.equal(store.listMasters(type).length, 1);
});

test("organization projections preserve legacy names, reject same-version collisions and do not downgrade newer data", t => {
  const { open } = fixture(t), store = open();
  const legacy = record("legacy", { shortName: " ", fullName: "x".repeat(250) });
  store.applyMasterSnapshot(type, [legacy], "org:1");
  assert.deepEqual(store.listMasters(type)[0], { ...legacy, syncStatus: "SYNCED" });
  assert.throws(() => store.applyMasterChanges(type, [{ kind: "upsert", record: { ...legacy, fullName: "different" } }], "org:bad"), { code: "VERSION_COLLISION" });
  assert.equal(store.readMasterCursor(type), "org:1");
  store.applyMasterChanges(type, [{ kind: "upsert", record: { ...legacy, version: 2, fullName: "Current" } }], "org:2");
  store.applyMasterChanges(type, [{ kind: "upsert", record: legacy }], "org:older-page");
  assert.equal(store.listMasters(type)[0].fullName, "Current");
});

test("organization outbox failure rolls back its entity and draft without affecting other streams", t => {
  const { open } = fixture(t), store = open(), file = store.status().databasePath;
  const unit = store.stageMasterCreate("uom", { code: "KG", name: "Kilogram" });
  withDb(file, db => db.exec("CREATE TRIGGER injected_organization_failure BEFORE INSERT ON organization_master_outbox BEGIN SELECT RAISE(ABORT,'injected organization write failure'); END"), false);
  assert.throws(() => store.stageMasterCreate(type, input()), /injected organization write failure/);
  withDb(file, db => { for (const table of ["organization_master_entities", "organization_master_outbox", "organization_master_drafts"]) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0); });
  assert.deepEqual(store.pendingMasterCommands("uom"), [unit.command]);
  assert.equal(store.status().pendingCount, 1);
});

test("organization pending data and cursors are isolated across user, company, device and environment", t => {
  const { open } = fixture(t), store = open();
  store.applyMasterSnapshot(type, [record()], "org:isolated"); const staged = store.stageMasterCreate(type, input("Local"));
  for (const field of ["userId", "organizationId", "deviceId", "environmentId"]) {
    const other = open({ ...profile, [field]: `${profile[field]}-other` });
    assert.deepEqual(other.listMasters(type), []); assert.deepEqual(other.pendingMasterCommands(type), []); assert.equal(other.readMasterCursor(type), null);
    assert.throws(() => other.acceptMasterCommand(staged.command.operationId, acknowledge(staged.command)), { code: "COMMAND_NOT_FOUND" });
  }
  assert.deepEqual(store.pendingMasterCommands(type), [staged.command]);
});

test("verified current backup combines all streams and restores exact organization work into a new root", async t => {
  const { root, open } = fixture(t), store = open();
  store.applyMasterSnapshot(type, [record()], "org:backup");
  const pending = store.stageMasterCreate(type, input("Pending"));
  const rejected = store.stageMasterCreate(type, input("Rejected")); store.rejectMasterCommand(rejected.command.operationId, "CONFLICT", "Saved review");
  store.stageMasterCreate("uom", { code: "EA", name: "Each" });
  store.stageCategoryCreate({ type: "MATERIAL", name: "Material" });
  const backupPath = path.join(root, "all-streams.sqlite");
  await store.backup(backupPath);
  assert.deepEqual(inspectDesktopBackup(backupPath, profile), { schemaVersion: 4, profile, pendingCount: 3, rejectedCount: 1 });
  await assert.rejects(store.backup(backupPath), { code: "EEXIST" });
  const restoredRoot = path.join(root, "restored"), restoredDirectory = path.join(restoredRoot, hash(JSON.stringify(profile)));
  fs.mkdirSync(restoredDirectory, { recursive: true }); fs.copyFileSync(backupPath, path.join(restoredDirectory, "desktop.sqlite"), fs.constants.COPYFILE_EXCL);
  const restored = open(profile, restoredRoot);
  assert.deepEqual(restored.pendingMasterCommands(type), [pending.command]);
  assert.deepEqual(restored.listMasters(type), store.listMasters(type));
  assert.equal(restored.readMasterCursor(type), "org:backup"); assert.equal(restored.status().pendingCount, 3); assert.equal(restored.status().rejectedCount, 1);
});

test("organization query index retains cloud order and case mappings through paging and restart", t => {
  const { open } = fixture(t); let store = open();
  const first = record("a", { shortName: "\u0130", fullName: "\u1E9E" });
  const second = record("b", { shortName: "A", fullName: "Road" });
  // This order is supplied by PostgreSQL rather than the host JS collator.
  const index = queryIndex(["b", "a", "c"], [["A", "a"], ["\u0130", "i"], ["\u1E9E", "\u1E9E"], ["\u{1F600}", "\u{1F600}"]]);
  assert.equal(store.readOrganizationQueryIndex(), null);
  store.applyMasterSnapshot(type, [first], "org:1", index);
  index.orderedIds.reverse(); index.caseMappings[0][1] = "caller mutation";
  const retained = queryIndex(["b", "a", "c"], [["A", "a"], ["\u0130", "i"], ["\u1E9E", "\u1E9E"], ["\u{1F600}", "\u{1F600}"]]);
  assert.deepEqual(store.readOrganizationQueryIndex(), retained);
  store.applyMasterChanges(type, [{ kind: "upsert", record: second }], "org:2", retained);
  assert.deepEqual(store.readOrganizationQueryIndex(), retained, "extra ordered IDs support not-yet-received feed pages");
  const returned = store.readOrganizationQueryIndex(); returned.orderedIds.length = 0;
  store.close(); store = open();
  assert.deepEqual(store.readOrganizationQueryIndex(), retained); assert.equal(store.readMasterCursor(type), "org:2");
  assert.equal(store.listMasters(type, { includeLocalDrafts: false }).length, 2);
  const updatedOrder = queryIndex(["a", "b"], retained.caseMappings);
  store.applyMasterChanges(type, [], "org:2", updatedOrder);
  assert.deepEqual(store.readOrganizationQueryIndex(), updatedOrder, "no-change pull can refresh query metadata at the same cursor");
});

test("malformed organization query metadata rolls back records, visibility and cursor together", t => {
  const { open } = fixture(t), store = open(), original = record("a"), next = record("b");
  const previousIndex = queryIndex(["a"], [["A", "a"]]);
  store.applyMasterSnapshot(type, [original], "org:before", previousIndex);
  const staged = store.stageMasterCreate(type, input("Keep pending"));
  const base = queryIndex(["a", "b"], [["A", "a"]]);
  const badIndices = [
    null, {}, { ...base, formatVersion: 2 }, { ...base, extra: true },
    { ...base, orderedIds: ["a", "b", "b"] }, { ...base, orderedIds: ["a"] },
    ...["", "\0", "\uD800", "x".repeat(513)].map(id => ({ ...base, orderedIds: ["a", "b", id] })),
    ...[["", "a"], ["AB", "ab"], ["\uD800", "a"], ["\0", "a"], ["A", ""], ["A", "\0"], ["A", "\uDC00"], ["A"], ["A", "a", "extra"]].map(pair => ({ ...base, caseMappings: [pair] })),
    { ...base, caseMappings: [["A", "a"], ["A", "other"]] },
    { ...base, caseMappings: {} }, { ...base, orderedIds: {} },
    { ...base, caseMappings: Array(1) }, { ...base, orderedIds: [...base.orderedIds, ...Array(1)] },
  ];
  for (const invalid of badIndices) {
    assert.throws(() => store.applyMasterSnapshot(type, [next], "org:bad-snapshot", invalid), { code: "INVALID_MASTER" });
    assert.throws(() => store.applyMasterChanges(type, [{ kind: "upsert", record: next }], "org:bad-change", invalid), { code: "INVALID_MASTER" });
    assert.deepEqual(store.listMasters(type, { includeLocalDrafts: false }), [{ ...original, syncStatus: "SYNCED" }]);
    assert.equal(store.readMasterCursor(type), "org:before");
    assert.deepEqual(store.readOrganizationQueryIndex(), previousIndex);
    assert.deepEqual(store.pendingMasterCommands(type), [staged.command]);
  }
  // A change feed must retain IDs for already accepted rows, not just this page.
  assert.throws(() => store.applyMasterChanges(type, [{ kind: "upsert", record: next }], "org:bad-coverage", queryIndex(["b"])), /omits an accepted/);
  assert.equal(store.readMasterCursor(type), "org:before");
  assert.deepEqual(store.readOrganizationQueryIndex(), previousIndex);
});

test("late index persistence failure rolls back its projection and keeps queued work", t => {
  const { open } = fixture(t), store = open(), original = record("a");
  const index = queryIndex(["a"], [["A", "a"]]);
  store.applyMasterSnapshot(type, [original], "org:old", index);
  const pending = store.stageMasterCreate(type, input("Pending"));
  withDb(store.status().databasePath, db => db.exec("CREATE TRIGGER injected_query_index_failure BEFORE UPDATE ON organization_query_index BEGIN SELECT RAISE(ABORT,'injected query index persistence failure'); END"), false);
  assert.throws(() => store.applyMasterSnapshot(type, [record("b")], "org:new", queryIndex(["b"])), /injected query index/);
  assert.throws(() => store.applyMasterChanges(type, [{ kind: "upsert", record: record("b") }], "org:new", queryIndex(["a", "b"])), /injected query index/);
  assert.throws(() => store.acceptMasterCommand(pending.command.operationId, acknowledge(pending.command)), /injected query index/);
  assert.deepEqual(store.listMasters(type, { includeLocalDrafts: false }), [{ ...original, syncStatus: "SYNCED" }]);
  assert.deepEqual(store.readOrganizationQueryIndex(), index); assert.equal(store.readMasterCursor(type), "org:old");
  assert.deepEqual(store.pendingMasterCommands(type), [pending.command]);
});

test("unsupported legacy applies and organization ACKs invalidate only the organization query index", t => {
  const { open } = fixture(t), store = open(), accepted = record("a"), index = queryIndex(["a"]);
  store.applyMasterSnapshot(type, [accepted], "org:1", index);
  store.applyMasterChanges("uom", [], "uom:1");
  store.applyMasterSnapshot("paymentTerm", [], "term:1");
  const unit = store.stageMasterCreate("uom", { code: "EA", name: "Each" });
  store.acceptMasterCommand(unit.command.operationId, { id: unit.record.id, ...unit.command.payload, version: 1, createdAt: date, updatedAt: date });
  assert.deepEqual(store.readOrganizationQueryIndex(), index);
  const local = store.stageMasterCreate(type, input("Local"));
  assert.deepEqual(store.readOrganizationQueryIndex(), index, "drafts do not change the accepted query index");
  store.acceptMasterCommand(local.command.operationId, acknowledge(local.command));
  assert.equal(store.readOrganizationQueryIndex(), null);
  const both = queryIndex(["a", local.record.id]);
  store.applyMasterChanges(type, [], "org:2", both);
  store.applyMasterChanges(type, [], "org:2");
  assert.equal(store.readOrganizationQueryIndex(), null, "old caller cannot retain a stale index");
  store.applyMasterSnapshot(type, [accepted], "org:3", index);
  store.applyMasterSnapshot(type, [accepted], "org:4");
  assert.equal(store.readOrganizationQueryIndex(), null);
  assert.throws(() => store.applyMasterChanges("uom", [], "uom:bad", index), { code: "INVALID_MASTER" });
  assert.equal(store.readMasterCursor("uom"), "uom:1");
});

test("organization query metadata stays profile-bound and is preserved by verified backup", async t => {
  const { root, open } = fixture(t), store = open(), index = queryIndex(["a"], [["\u0130", "i"]]);
  store.applyMasterSnapshot(type, [record("a")], "org:backup-index", index);
  for (const field of ["userId", "organizationId", "deviceId", "environmentId"]) {
    const other = open({ ...profile, [field]: `other-${profile[field]}` });
    assert.equal(other.readOrganizationQueryIndex(), null);
  }
  const file = path.join(root, "query-index-backup.sqlite"); await store.backup(file);
  assert.equal(inspectDesktopBackup(file, profile).schemaVersion, 4);
  const restoredRoot = path.join(root, "index-restored"), directory = path.join(restoredRoot, hash(JSON.stringify(profile)));
  fs.mkdirSync(directory, { recursive: true }); fs.copyFileSync(file, path.join(directory, "desktop.sqlite"), fs.constants.COPYFILE_EXCL);
  const restored = open(profile, restoredRoot);
  assert.deepEqual(restored.readOrganizationQueryIndex(), index); assert.equal(restored.readMasterCursor(type), "org:backup-index");
});
