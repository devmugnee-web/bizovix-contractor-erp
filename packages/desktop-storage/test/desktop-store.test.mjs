import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { DesktopStore, canonicalDecimal, decimalAdd } from "../src/index.mjs";

const profile = { environmentId: "test", organizationId: "org-a", userId: "user-a", deviceId: "pc-a" };
const input = { type: "MATERIAL", name: "Steel", description: "Rebar", isActive: true };
const category = (overrides = {}) => ({ id: "cat-a", ...input, version: 1, createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z", ...overrides });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bizovix-storage-test-"));
  const stores = [];
  const open = (bound = profile) => { const store = new DesktopStore({ rootDirectory: root, profile: bound }); stores.push(store); return store; };
  t.after(() => {
    for (const store of stores) store.close();
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("bizovix-storage-test-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { root, open };
}
function inspection(store) { return new DatabaseSync(store.status().databasePath); }

test("automatic initialization binds a hashed profile and survives close/reopen with the same command", (t) => {
  const { open } = fixture(t); const store = open();
  const result = store.stageCategoryCreate(input), db = inspection(store);
  try {
    assert.equal(db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 4);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
  assert.match(path.basename(path.dirname(store.status().databasePath)), /^[a-f0-9]{64}$/);
  assert.equal(result.category.version, 0); assert.equal(result.category.syncStatus, "PENDING");
  store.close(); store.close();
  assert.throws(() => store.listCategories(), { code: "STORE_CLOSED" });
  const reopened = open(); assert.deepEqual(reopened.pendingCommands(), [result.command]);
  assert.equal(reopened.listCategories()[0].name, "Steel");
});

test("outbox failure rolls back entity and draft writes together", (t) => {
  const { open } = fixture(t); const store = open(), db = inspection(store);
  try {
    db.exec("CREATE TRIGGER injected_outbox_failure BEFORE INSERT ON category_outbox BEGIN SELECT RAISE(ABORT,'injected disk write failure'); END");
    assert.throws(() => store.stageCategoryCreate(input), /injected disk write failure/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM category_entities").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM category_drafts").get().n, 0);
    assert.deepEqual(store.pendingCommands(), []);
    db.exec("DROP TRIGGER injected_outbox_failure");
    assert.equal(store.stageCategoryCreate(input).category.name, "Steel");
  } finally { db.close(); }
});

test("queued commands are durable and immutable, and another local edit cannot replace one", (t) => {
  const { open } = fixture(t); const store = open();
  store.applyCategorySnapshot([category()], "cursor-1");
  const staged = store.stageCategoryUpdate("cat-a", { ...input, name: "Edited" });
  staged.command.payload.name = "Tampered return value";
  assert.equal(store.pendingCommands()[0].payload.name, "Edited");
  assert.throws(() => store.stageCategoryUpdate("cat-a", input), { code: "COMMAND_PENDING" });
  const db = inspection(store);
  try {
    assert.throws(() => db.prepare("UPDATE category_outbox SET payload=?").run("{}"), /immutable/);
    assert.throws(() => db.exec("DELETE FROM category_outbox"), /retained/);
  } finally { db.close(); }
});

test("duplicate category names are rejected locally without discarding existing input", (t) => {
  const { open } = fixture(t); const store = open();
  store.stageCategoryCreate(input);
  assert.throws(() => store.stageCategoryCreate({ ...input, name: "  sTEEL  " }), { code: "CATEGORY_DUPLICATE" });
  assert.equal(store.pendingCommands().length, 1);
  assert.equal(store.stageCategoryCreate({ ...input, type: "VENDOR" }).category.type, "VENDOR");
  assert.throws(() => store.stageCategoryCreate({ ...input, type: "SUPPLIER" }), { code: "INVALID_CATEGORY" });
});

test("cloud refresh and rejection preserve the local overlay and original immutable operation", (t) => {
  const { open } = fixture(t); const store = open();
  store.applyCategorySnapshot([category()], "one");
  const { command } = store.stageCategoryUpdate("cat-a", { ...input, name: "Local input" });
  store.applyCategoryChanges([{ kind: "upsert", category: category({ name: "Cloud input", version: 2 }) }], "two");
  assert.equal(store.listCategories()[0].name, "Local input");
  assert.equal(store.listCategories()[0].cloudCategory.name, "Cloud input");
  assert.equal(store.listCategories()[0].cloudCategory.version, 2);
  assert.equal(store.listCategories()[0].createdAt, "2026-09-20T00:00:00.000Z");
  assert.equal(store.pendingCommands()[0].expectedVersion, 1);
  store.rejectCommand(command.operationId, "VERSION_CONFLICT", "Another device changed this category");
  assert.equal(store.listCategories()[0].syncStatus, "REJECTED");
  assert.equal(store.listCategories()[0].syncError.kind, "VERSION_CONFLICT");
  assert.equal(store.listCategories()[0].cloudCategory.name, "Cloud input");
  assert.deepEqual(store.pendingCommands(), []);
  assert.equal(store.rejectedCommands()[0].payload.name, "Local input");
  const revised = store.stageCategoryUpdate("cat-a", { ...input, name: "Reviewed edit" });
  assert.equal(revised.command.expectedVersion, 2);
  assert.notEqual(revised.command.operationId, command.operationId);
  assert.equal(store.rejectedCommands().length, 1);
  assert.equal(store.status().rejectedCount, 0);
});

test("acceptance is repeatable, clears only its draft and cannot downgrade a newer accepted projection", (t) => {
  const { open } = fixture(t); const store = open();
  const { command } = store.stageCategoryCreate(input);
  const accepted = category({ id: command.entityId });
  store.acceptCommand(command.operationId, accepted);
  store.acceptCommand(command.operationId, accepted);
  assert.equal(store.listCategories()[0].syncStatus, "SYNCED");
  assert.equal(store.status().pendingCount, 0);
  store.applyCategoryChanges([{ kind: "upsert", category: { ...accepted, name: "Newer", version: 2 } }], "two");
  store.acceptCommand(command.operationId, accepted);
  assert.equal(store.listCategories()[0].name, "Newer");
  assert.throws(() => store.rejectCommand(command.operationId, "CONFLICT", "late rejection"), { code: "COMMAND_RESOLVED" });
});

test("a rejected creation can be revised without changing its rejected operation or losing its identity", (t) => {
  const { open } = fixture(t); const store = open();
  const original = store.stageCategoryCreate(input);
  store.rejectCommand(original.command.operationId, "DUPLICATE", "Choose a different name");
  const revision = store.stageCategoryUpdate(original.command.entityId, { ...input, name: "Revised steel" });
  assert.equal(revision.command.commandType, "masterCategory.create");
  assert.equal(revision.command.expectedVersion, null);
  assert.equal(revision.command.entityId, original.command.entityId);
  assert.notEqual(revision.command.operationId, original.command.operationId);
  assert.equal(store.rejectedCommands()[0].payload.name, "Steel");
  assert.equal(store.listCategories()[0].name, "Revised steel");
});

test("actual command authorization runs before any correction is committed", (t) => {
  const { open } = fixture(t); const store = open();
  store.applyCategorySnapshot([category()], "one");
  assert.throws(() => store.stageCategoryUpdate("cat-a", { ...input, name: "Unauthorized edit" }, {
    authorizeCommand(type) { assert.equal(type, "masterCategory.update"); throw new Error("permission denied"); },
  }), /permission denied/);
  assert.deepEqual(store.pendingCommands(), []);
  assert.equal(store.listCategories()[0].name, "Steel");
  const original = store.stageCategoryCreate({ ...input, name: "Rejected creation" });
  store.rejectCommand(original.command.operationId, "DUPLICATE", "Please correct");
  const revised = store.stageCategoryUpdate(original.command.entityId, { ...input, name: "Corrected creation" }, {
    authorizeCommand(type) { assert.equal(type, "masterCategory.create"); },
  });
  assert.equal(revised.command.commandType, "masterCategory.create");
  assert.equal(revised.category.createdAt, original.category.createdAt);
});

test("cloud creation dates are preserved and may fill an older pilot projection without invented dates", (t) => {
  const { open } = fixture(t); const store = open(); const expected = category();
  store.applyCategorySnapshot([expected], "one");
  const db = inspection(store);
  try {
    const { createdAt: _createdAt, ...legacy } = expected;
    db.prepare("UPDATE accepted_categories SET body=? WHERE entity_id=?").run(JSON.stringify(legacy), expected.id);
  } finally { db.close(); }
  store.applyCategorySnapshot([expected], "same-version-with-date");
  assert.equal(store.listCategories()[0].createdAt, expected.createdAt);
  const staged = store.stageCategoryUpdate(expected.id, { ...input, name: "Change name only" });
  assert.equal(staged.category.createdAt, expected.createdAt);
  assert.equal(store.listCategories()[0].cloudCategory.createdAt, expected.createdAt);
  const { createdAt: _createdAt, ...missing } = category({ id: "missing-date" });
  assert.throws(() => store.applyCategorySnapshot([missing], "invalid-date"), /creation timestamp/);
  assert.equal(store.readCursor(), "same-version-with-date");
});

test("snapshot/changes are atomic with cursor and retain drafts absent from cloud visibility", (t) => {
  const { open } = fixture(t); const store = open();
  store.applyCategorySnapshot([category()], "one");
  const draft = store.stageCategoryCreate({ ...input, name: "Offline" });
  assert.throws(() => store.applyCategoryChanges([
    { kind: "upsert", category: category({ id: "cat-b", name: "Other" }) },
    { kind: "upsert", category: category({ name: "Conflicting same version" }) },
  ], "invalid"), { code: "VERSION_COLLISION" });
  assert.equal(store.readCursor(), "one");
  assert.equal(store.listCategories().some((row) => row.id === "cat-b"), false);
  store.applyCategorySnapshot([], "empty");
  assert.deepEqual(store.listCategories().map((row) => row.id), [draft.command.entityId]);
  assert.equal(store.pendingCommands().length, 1);
  assert.equal(store.listCategories()[0].cloudCategory, undefined);
  assert.throws(() => store.applyCategorySnapshot([category(), category()], "dupes"), /duplicate IDs/);
  assert.equal(store.readCursor(), "empty");
});

test("user, organization, device and environment profiles isolate their files and commands", (t) => {
  const { open } = fixture(t); const first = open(); first.stageCategoryCreate(input);
  for (const key of ["userId", "organizationId", "deviceId", "environmentId"]) {
    const other = open({ ...profile, [key]: `other-${key}` });
    assert.notEqual(other.status().databasePath, first.status().databasePath);
    assert.deepEqual(other.listCategories(), []); assert.deepEqual(other.pendingCommands(), []);
  }
});

test("profile components cannot escape the storage root and directory links fail closed", (t) => {
  const { root, open } = fixture(t);
  const store = open({ ...profile, organizationId: "../outside/organization" });
  assert.equal(path.dirname(path.dirname(store.status().databasePath)), root);
  assert.throws(() => new DesktopStore({ rootDirectory: "relative/path", profile }), { code: "UNSAFE_PATH" });
  const target = path.join(root, "linked-target"), link = path.join(root, "linked-root");
  fs.mkdirSync(target); fs.symlinkSync(target, link, "junction");
  assert.throws(() => new DesktopStore({ rootDirectory: link, profile }), { code: "UNSAFE_PATH" });
  assert.deepEqual(fs.readdirSync(target), []);
});

test("profile mismatch, future schema and changed migration checksums fail without resets", (t) => {
  const { open } = fixture(t); const store = open(); store.stageCategoryCreate(input);
  const dbPath = store.status().databasePath; store.close();
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA user_version=999");
    assert.throws(() => open(), { code: "NEWER_SCHEMA" });
    assert.equal(db.prepare("SELECT count(*) AS n FROM category_outbox").get().n, 1);
    db.exec("PRAGMA user_version=4");
    const metadata = db.prepare("SELECT profile_json FROM store_metadata").get().profile_json;
    db.prepare("UPDATE store_metadata SET profile_json=?").run("{}");
    assert.throws(() => open(), { code: "PROFILE_MISMATCH" });
    db.prepare("UPDATE store_metadata SET profile_json=?").run(metadata);
    const checksum = db.prepare("SELECT checksum FROM local_migrations WHERE version=1").get().checksum;
    db.prepare("UPDATE local_migrations SET checksum='changed' WHERE version=1").run();
    assert.throws(() => open(), { code: "MIGRATION_MISMATCH" });
    db.prepare("UPDATE local_migrations SET checksum=? WHERE version=1").run(checksum);
  } finally { db.close(); }
  assert.equal(open().pendingCommands().length, 1);
});

test("corrupt database bytes are preserved and never replaced by an empty database", (t) => {
  const { open } = fixture(t); const store = open(), dbPath = store.status().databasePath; store.close();
  const corrupt = Buffer.from("deliberately corrupt test database\n"); fs.writeFileSync(dbPath, corrupt);
  assert.throws(() => open(), { code: "DATABASE_OPEN" });
  assert.deepEqual(fs.readFileSync(dbPath), corrupt);
});

test("backup refuses overwrite, reopens with exact profile/commands and passes integrity checks", async (t) => {
  const { open, root } = fixture(t); const store = open();
  const { command } = store.stageCategoryCreate(input); store.applyCategorySnapshot([], "backup-cursor");
  const target = path.join(root, "new-backup.sqlite"), result = await store.backup(target);
  assert.equal(result.sha256, createHash("sha256").update(fs.readFileSync(target)).digest("hex"));
  assert.ok(result.size > 0);
  await assert.rejects(store.backup(target), { code: "EEXIST" });
  const db = new DatabaseSync(target, { readOnly: true });
  try {
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("SELECT operation_id FROM category_outbox").get().operation_id, command.operationId);
    assert.equal(db.prepare("SELECT cursor FROM store_metadata").get().cursor, "backup-cursor");
    assert.deepEqual(JSON.parse(db.prepare("SELECT profile_json FROM store_metadata").get().profile_json), profile);
  } finally { db.close(); }
});

test("exact decimal codec handles declared precision and scale without floating point", () => {
  assert.equal(canonicalDecimal("000012.3", 18, 2), "12.30");
  assert.equal(canonicalDecimal("-0.00", 18, 2), "0.00");
  assert.equal(canonicalDecimal("999999999999999999.999999", 24, 6), "999999999999999999.999999");
  assert.equal(decimalAdd("999999999999999999.999998", "0.000001", 24, 6), "999999999999999999.999999");
  assert.equal(decimalAdd("0.1", "0.2", 18, 2), "0.30");
  assert.equal(decimalAdd("-9.5", "2.25", 18, 2), "-7.25");
  assert.equal(decimalAdd("-10", "10", 18, 0), "0");
  assert.throws(() => canonicalDecimal("1.001", 18, 2), { code: "DECIMAL_SCALE" });
  assert.throws(() => canonicalDecimal("1e3", 18, 2), { code: "INVALID_DECIMAL" });
  assert.throws(() => decimalAdd("999999999999999999.999999", "0.000001", 24, 6), { code: "DECIMAL_PRECISION" });
});
