import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DesktopStore, inspectDesktopBackup, normalizeMasterInput } from "../src/index.mjs";

const profile = { environmentId: "fixture", organizationId: "org", userId: "user", deviceId: "pc" };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const date = "2026-09-21T00:00:00.000Z";
const inputs = { uom: { code: "KG", name: "Kilogram", symbol: "kg", isActive: true }, paymentTerm: { name: "30 Days", days: 30, description: "Invoice date", isActive: true } };
const record = (type, overrides = {}) => ({ id: `${type}-one`, ...inputs[type], version: 1, createdAt: date, updatedAt: date, ...overrides });
const acknowledgement = (command, overrides = {}) => record(command.entityType, { id: command.entityId, ...command.payload, version: (command.expectedVersion ?? 0) + 1, ...overrides });

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bizovix-master-storage-"));
  const opened = [];
  const open = (bound = profile, directory = root) => {
    const store = new DesktopStore({ rootDirectory: directory, profile: bound }); opened.push(store); return store;
  };
  t.after(() => {
    for (const store of opened) store.close();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("bizovix-master-storage-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, open };
}

function legacyFixture(root) {
  const sql = fs.readFileSync(new URL("./fixtures/schema-v1.sql", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const checksum = "f5ebe73c3c0a8eed3ba38b265321c6eb104883b0a94a0e8720aff85966f2bd4f";
  assert.equal(sha256(sql), checksum, "Version-one fixture must remain the original migration");
  const profileJson = JSON.stringify(profile), directory = path.join(root, sha256(profileJson));
  fs.mkdirSync(directory);
  const databasePath = path.join(directory, "desktop.sqlite"), db = new DatabaseSync(databasePath);
  const payload = { type: "MATERIAL", name: "Saved category", description: null, isActive: true };
  const accepted = { id: "accepted-category", ...payload, version: 1, createdAt: date, updatedAt: date };
  try {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE local_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)");
    db.exec(sql);
    db.prepare("INSERT INTO local_migrations VALUES(1,?,?)").run(checksum, date);
    db.prepare("INSERT INTO store_metadata VALUES(1,?,?,?,?)").run(profileJson, sha256(profileJson), "original-cursor", date);
    db.exec("PRAGMA application_id=1113211987; PRAGMA user_version=1");
    db.prepare("INSERT INTO category_entities VALUES(?)").run(accepted.id);
    db.prepare("INSERT INTO accepted_categories VALUES(?,?,1,1)").run(accepted.id, JSON.stringify(accepted));
    for (const [id, status] of [["offline-category", "PENDING"], ["rejected-category", "REJECTED"]]) {
      db.prepare("INSERT INTO category_entities VALUES(?)").run(id);
      db.prepare("INSERT INTO category_outbox(operation_id,device_id,schema_version,command_type,entity_id,expected_version,payload,status,rejection_kind,rejection_message,created_at) VALUES(?,?,1,'masterCategory.create',?,NULL,?,?,?,?,?)")
        .run(`operation-${id}`, profile.deviceId, id, JSON.stringify({ ...payload, name: id }), status, status === "REJECTED" ? "DUPLICATE" : null, status === "REJECTED" ? "Please review" : null, date);
      db.prepare("INSERT INTO category_drafts VALUES(?,?,?)").run(id, `operation-${id}`, JSON.stringify({ id, ...payload, name: id, version: 0, createdAt: date, updatedAt: date }));
    }
    const saved = db.prepare("SELECT * FROM category_outbox ORDER BY sequence").all();
    return { databasePath, directory, checksum, saved };
  } finally { db.close(); }
}

test("additive migrations preserve v1 categories, queued bytes and checksum after a verified pre-upgrade backup", (t) => {
  const { root, open } = fixture(t), old = legacyFixture(root);
  assert.deepEqual(inspectDesktopBackup(old.databasePath, profile), { schemaVersion: 1, profile, pendingCount: 1, rejectedCount: 1 });
  const store = open();
  assert.equal(store.status().schemaVersion, 4);
  assert.equal(store.readCursor(), "original-cursor");
  assert.equal(store.readMasterCursor("uom"), null);
  assert.equal(store.readMasterCursor("paymentTerm"), null);
  assert.equal(store.listCategories().length, 3);
  const backups = fs.readdirSync(path.join(old.directory, "migration-backups"));
  assert.equal(backups.length, 1);
  const backupPath = path.join(old.directory, "migration-backups", backups[0]);
  assert.equal(inspectDesktopBackup(backupPath, profile).schemaVersion, 1);
  for (const file of [old.databasePath, backupPath]) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      assert.deepEqual(db.prepare("SELECT * FROM category_outbox ORDER BY sequence").all(), old.saved);
      assert.equal(db.prepare("SELECT checksum FROM local_migrations WHERE version=1").get().checksum, old.checksum);
      assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    } finally { db.close(); }
  }
  store.close(); open();
  assert.equal(fs.readdirSync(path.join(old.directory, "migration-backups")).length, 1, "Reopen must not repeat an already completed upgrade");
});

test("failed pre-upgrade backup durability check leaves the v1 schema and all commands intact", (t) => {
  const { root, open } = fixture(t), old = legacyFixture(root);
  const original = fs.fsyncSync;
  fs.fsyncSync = () => { throw new Error("simulated backup fsync failure"); };
  try { assert.throws(() => open(), { code: "DATABASE_OPEN" }); }
  finally { fs.fsyncSync = original; }
  assert.equal(inspectDesktopBackup(old.databasePath, profile).schemaVersion, 1);
  const db = new DatabaseSync(old.databasePath, { readOnly: true });
  try {
    assert.deepEqual(db.prepare("SELECT * FROM category_outbox ORDER BY sequence").all(), old.saved);
    assert.equal(db.prepare("SELECT count(*) AS n FROM local_migrations").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='master_outbox'").get().n, 0);
  } finally { db.close(); }
  assert.equal(open().status().schemaVersion, 4);
});

test("a v1 checksum mismatch is rejected before any upgrade or backup", (t) => {
  const { root, open } = fixture(t), old = legacyFixture(root), db = new DatabaseSync(old.databasePath);
  db.prepare("UPDATE local_migrations SET checksum='tampered'").run(); db.close();
  assert.throws(() => open(), { code: "MIGRATION_MISMATCH" });
  assert.equal(fs.existsSync(path.join(old.directory, "migration-backups")), false);
});

test("master normalization preserves DTO defaults, immutable UOM codes, nulls and omitted update fields", () => {
  assert.deepEqual(normalizeMasterInput("uom", { code: " kg ", name: " Kilogram " }), { code: "KG", name: "Kilogram", symbol: null, isActive: true });
  assert.deepEqual(normalizeMasterInput("uom", { code: "changed", name: "New name", isActive: null }, record("uom")), { code: "KG", name: "New name", symbol: "kg", isActive: true });
  assert.equal(normalizeMasterInput("uom", { code: "KG", name: "Kilogram", symbol: null }, record("uom")).symbol, null);
  assert.deepEqual(normalizeMasterInput("paymentTerm", { name: " Now ", days: null }), { name: "Now", days: 0, description: null, isActive: true });
  assert.deepEqual(normalizeMasterInput("paymentTerm", { name: "Renamed" }, record("paymentTerm")), { name: "Renamed", days: 30, description: "Invoice date", isActive: true });
  assert.equal(normalizeMasterInput("paymentTerm", { name: "Text DTO days", days: "45" }).days, 45);
  assert.equal(normalizeMasterInput("paymentTerm", { name: "Large name ".repeat(2000) }).name.length, 21999);
  for (const input of [{ name: "x", days: -1 }, { name: "x", days: 1.5 }, { name: "x", days: 2147483648 }, { name: "x", days: [] }, { name: "x", isActive: "false" }, { name: "x", id: "injected" }, { name: "x", organizationId: "other" }]) {
    assert.throws(() => normalizeMasterInput("paymentTerm", input), { code: "INVALID_MASTER" });
  }
  assert.throws(() => normalizeMasterInput("uom", { name: "No code" }, record("uom")), { code: "INVALID_MASTER" });
});

for (const type of ["uom", "paymentTerm"]) {
  test(`${type}: commands survive reopen, immutable SQL history and account isolation`, (t) => {
    const { open } = fixture(t), store = open();
    const staged = store.stageMasterCreate(type, inputs[type]);
    const originalCommand = structuredClone(staged.command);
    staged.command.payload.name = "changed outside storage";
    assert.deepEqual(store.pendingMasterCommands(type), [originalCommand]);
    assert.throws(() => store.stageMasterUpdate(type, staged.record.id, inputs[type]), { code: "COMMAND_PENDING" });
    const db = new DatabaseSync(store.status().databasePath);
    try {
      assert.throws(() => db.exec("UPDATE master_outbox SET payload='{}'"), /immutable/);
      assert.throws(() => db.exec("DELETE FROM master_outbox"), /retained/);
    } finally { db.close(); }
    store.close();
    assert.deepEqual(open().pendingMasterCommands(type), [originalCommand]);
    assert.equal(open({ ...profile, userId: "other-user" }).listMasters(type).length, 0);
    assert.equal(open({ ...profile, organizationId: "other-org" }).listMasters(type).length, 0);
  });

  test(`${type}: cloud changes preserve the pending overlay and explicit correction uses the newer version`, (t) => {
    const { open } = fixture(t), store = open(), accepted = record(type);
    store.applyMasterSnapshot(type, [accepted], "first");
    const { command } = store.stageMasterUpdate(type, accepted.id, { ...inputs[type], name: "Offline input" });
    store.applyMasterChanges(type, [{ kind: "upsert", record: { ...accepted, name: "Other PC", version: 2 }, cursor: "second", operationId: null }], "second");
    let view = store.listMasters(type)[0];
    assert.equal(view.name, "Offline input"); assert.equal(view.cloudRecord.name, "Other PC");
    assert.equal(view.createdAt, date); assert.equal(store.pendingMasterCommands(type)[0].expectedVersion, 1);
    store.rejectMasterCommand(command.operationId, "CONFLICT", "Review the other PC's edit");
    view = store.listMasters(type)[0];
    assert.equal(view.syncStatus, "REJECTED"); assert.equal(view.syncError.kind, "CONFLICT");
    assert.equal(store.status().rejectedCount, 1);
    const correction = store.stageMasterUpdate(type, accepted.id, { ...inputs[type], name: "Reviewed" });
    assert.equal(correction.command.expectedVersion, 2);
    assert.notEqual(correction.command.operationId, command.operationId);
    assert.equal(store.status().rejectedCount, 0);
    const db = new DatabaseSync(store.status().databasePath, { readOnly: true });
    try { assert.equal(JSON.parse(db.prepare("SELECT payload FROM master_outbox WHERE operation_id=?").get(command.operationId).payload).name, "Offline input"); }
    finally { db.close(); }
  });

  test(`${type}: rejected creates keep their identity and authorize the actual create command before correction`, (t) => {
    const { open } = fixture(t), store = open(), staged = store.stageMasterCreate(type, inputs[type]);
    store.rejectMasterCommand(staged.command.operationId, "DUPLICATE", "Use another value");
    const revised = { ...inputs[type], name: "Revised", ...(type === "uom" ? { code: "NEW" } : {}) };
    assert.throws(() => store.stageMasterUpdate(type, staged.record.id, revised, { authorizeCommand(commandType) {
      assert.equal(commandType, `${type}.create`); throw new Error("permission denied");
    } }), /permission denied/);
    assert.equal(store.status().rejectedCount, 1); assert.equal(store.pendingMasterCommands(type).length, 0);
    const correction = store.stageMasterUpdate(type, staged.record.id, revised);
    assert.equal(correction.record.id, staged.record.id); assert.equal(correction.record.createdAt, staged.record.createdAt);
    assert.equal(correction.command.expectedVersion, null); assert.equal(correction.command.commandType, `${type}.create`);
    if (type === "uom") assert.equal(correction.record.code, "NEW");
  });

  test(`${type}: acknowledgements bind ID, content and exact version and cannot clear a later draft`, (t) => {
    const { open } = fixture(t), store = open(), { command } = store.stageMasterCreate(type, inputs[type]);
    const cloud = acknowledgement(command);
    for (const [override, code] of [[{ id: "wrong" }, "COMMAND_MISMATCH"], [{ name: "Wrong operation result" }, "COMMAND_MISMATCH"], [{ version: 2 }, "INVALID_VERSION"]]) {
      assert.throws(() => store.acceptMasterCommand(command.operationId, { ...cloud, ...override }), { code });
      assert.equal(store.pendingMasterCommands(type).length, 1);
    }
    const otherType = type === "uom" ? "paymentTerm" : "uom";
    assert.throws(() => store.acceptMasterCommand(command.operationId, record(otherType, { id: command.entityId })), { code: "INVALID_MASTER" });
    store.acceptMasterCommand(command.operationId, cloud); store.acceptMasterCommand(command.operationId, cloud);
    assert.equal(store.listMasters(type)[0].syncStatus, "SYNCED");
    const next = store.stageMasterUpdate(type, cloud.id, { ...inputs[type], name: "Next edit" });
    store.acceptMasterCommand(command.operationId, cloud);
    assert.deepEqual(store.pendingMasterCommands(type), [next.command]);
    store.applyMasterChanges(type, [{ kind: "upsert", record: { ...cloud, name: "Later cloud", version: 3 } }], "later");
    store.acceptMasterCommand(next.command.operationId, acknowledgement(next.command));
    assert.equal(store.listMasters(type)[0].name, "Later cloud");
    assert.throws(() => store.rejectMasterCommand(command.operationId, "late", "Must not change success"), { code: "COMMAND_RESOLVED" });
  });

  test(`${type}: duplicate checks include pending and inactive records without discarding input`, (t) => {
    const { open } = fixture(t), store = open();
    const first = store.stageMasterCreate(type, inputs[type]);
    const duplicate = type === "uom" ? { ...inputs[type], code: " kg ", name: "Different label" } : { name: "  30 dAYS  ", days: 45 };
    assert.throws(() => store.stageMasterCreate(type, duplicate), { code: "MASTER_DUPLICATE" });
    assert.deepEqual(store.pendingMasterCommands(type), [first.command]);
    store.acceptMasterCommand(first.command.operationId, acknowledgement(first.command));
    store.applyMasterChanges(type, [{ kind: "upsert", record: acknowledgement(first.command, { isActive: false, version: 2 }) }], "inactive");
    assert.throws(() => store.stageMasterCreate(type, duplicate), { code: "MASTER_DUPLICATE" });
  });
}

test("master outbox failure rolls back entity, command and draft together", (t) => {
  const { open } = fixture(t), store = open(), db = new DatabaseSync(store.status().databasePath);
  try {
    db.exec("CREATE TRIGGER injected_master_failure BEFORE INSERT ON master_outbox BEGIN SELECT RAISE(ABORT,'injected write failure'); END");
    assert.throws(() => store.stageMasterCreate("uom", inputs.uom), /injected write failure/);
    for (const table of ["master_entities", "master_outbox", "master_drafts"]) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  } finally { db.close(); }
});

test("snapshots and cursors are independent, atomic, and retain pending/rejected drafts when records disappear", (t) => {
  const { open } = fixture(t), store = open();
  store.applyMasterSnapshot("uom", [record("uom")], "units-1");
  store.applyMasterSnapshot("paymentTerm", [record("paymentTerm")], "terms-1");
  const draft = store.stageMasterCreate("uom", { code: "M", name: "Metre" });
  const rejected = store.stageMasterUpdate("uom", "uom-one", { ...inputs.uom, name: "Rejected edit" });
  store.rejectMasterCommand(rejected.command.operationId, "CONFLICT", "Review");
  assert.throws(() => store.applyMasterChanges("uom", [
    { kind: "upsert", record: record("uom", { id: "new-cloud", code: "TON" }) },
    { kind: "upsert", record: record("uom", { name: "Same version conflict" }) },
  ], "invalid"), { code: "VERSION_COLLISION" });
  assert.equal(store.readMasterCursor("uom"), "units-1");
  assert.equal(store.listMasters("uom").some((row) => row.id === "new-cloud"), false);
  assert.throws(() => store.applyMasterSnapshot("uom", [record("uom"), record("uom")], "duplicates"), /duplicate IDs/);
  store.applyMasterSnapshot("uom", [], "units-empty");
  assert.equal(store.listMasters("uom").length, 2);
  assert.ok(store.listMasters("uom").every((row) => row.cloudRecord === undefined));
  assert.equal(store.listMasters("uom").find((row) => row.id === draft.record.id).syncStatus, "PENDING");
  assert.equal(store.readMasterCursor("paymentTerm"), "terms-1"); assert.equal(store.listMasters("paymentTerm").length, 1);
  assert.equal(store.readCursor(), null);
});

test("legacy blank and long accepted master fields are preserved without new limits", (t) => {
  const { open } = fixture(t), store = open();
  const original = record("uom", { code: "", name: "", symbol: "x".repeat(30000) });
  store.applyMasterSnapshot("uom", [original], "legacy");
  assert.deepEqual(store.listMasters("uom")[0], { ...original, syncStatus: "SYNCED" });
  assert.throws(() => normalizeMasterInput("uom", { code: " ", name: "Valid name" }), { code: "INVALID_MASTER" });
  assert.throws(() => normalizeMasterInput("uom", { code: "KG", name: " " }), { code: "INVALID_MASTER" });
  assert.throws(() => normalizeMasterInput("paymentTerm", { name: " " }), { code: "INVALID_MASTER" });
});

test("backup inspection combines all streams, refuses overwrite and restores exact pending operations", async (t) => {
  const { root, open } = fixture(t), store = open();
  store.stageCategoryCreate({ type: "MATERIAL", name: "Category" });
  const uom = store.stageMasterCreate("uom", inputs.uom);
  const term = store.stageMasterCreate("paymentTerm", inputs.paymentTerm);
  store.rejectMasterCommand(term.command.operationId, "DUPLICATE", "Keep saved input");
  store.applyMasterSnapshot("paymentTerm", [], "terms-current");
  assert.equal(store.status().pendingCount, 2); assert.equal(store.status().rejectedCount, 1);
  const backupPath = path.join(root, "complete.sqlite"), info = await store.backup(backupPath);
  assert.equal(info.sha256, sha256(fs.readFileSync(backupPath)));
  assert.deepEqual(inspectDesktopBackup(backupPath, profile), { schemaVersion: 4, profile, pendingCount: 2, rejectedCount: 1 });
  await assert.rejects(store.backup(backupPath), { code: "EEXIST" });
  const restoredRoot = path.join(root, "restored"), restoredDirectory = path.join(restoredRoot, sha256(JSON.stringify(profile)));
  fs.mkdirSync(restoredDirectory, { recursive: true }); fs.copyFileSync(backupPath, path.join(restoredDirectory, "desktop.sqlite"), fs.constants.COPYFILE_EXCL);
  const restored = open(profile, restoredRoot);
  assert.deepEqual(restored.pendingMasterCommands("uom"), [uom.command]);
  assert.equal(restored.listMasters("paymentTerm")[0].syncError.message, "Keep saved input");
  assert.equal(restored.readMasterCursor("paymentTerm"), "terms-current");
});
