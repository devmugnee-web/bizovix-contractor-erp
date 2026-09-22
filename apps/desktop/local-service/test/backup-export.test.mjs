import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { DesktopStore } from "../../../../packages/desktop-storage/src/index.mjs";
import { createProfileBackup, exportProfileBackup, restoreProfileBackup, verifyProfileBackup } from "../src/backups.mjs";
import { LocalError, canonicalJson, createVaultKey, saveVault, vaultLocation } from "../src/security.mjs";

const keys = generateKeyPairSync("ed25519");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const password = "Isolated export fixture password";
const profile = { environmentId: "https://backup-export.example.invalid", organizationId: "org-export", userId: "user-export", deviceId: "device-export" };
const now = Date.parse("2026-09-22T00:00:00.000Z");

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bizovix-export-test-"));
  const rootDirectory = path.join(root, "active"), destinationDirectory = path.join(root, "external");
  fs.mkdirSync(destinationDirectory);
  const store = new DesktopStore({ rootDirectory, profile });
  const opened = [store];
  t.after(() => {
    t.mock.restoreAll();
    for (const entry of opened) entry.close();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("bizovix-export-test-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const user = { id: profile.userId, organizationId: profile.organizationId, email: "export@example.invalid", permissions: ["masters.read"] };
  const payload = { formatVersion: 1, issuer: profile.environmentId, audience: "bizovix-desktop", deviceId: profile.deviceId,
    organizationId: profile.organizationId, userId: profile.userId, user, permissions: user.permissions, capabilities: ["organizationMaster.read"],
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString() };
  const grant = { payload, signature: sign(null, Buffer.from(canonicalJson(payload)), keys.privateKey).toString("base64url") };
  const vaultFile = vaultLocation(rootDirectory, profile.environmentId, user.email);
  const material = createVaultKey(password);
  try { saveVault(vaultFile, { deviceId: profile.deviceId, grant, lastUsedAt: now }, material); }
  finally { material.key.fill(0); }
  const pending = store.stageCategoryCreate({ type: "MATERIAL", name: "Pending steel" });
  const rejected = store.stageMasterCreate("organizationMaster", { shortName: "Retain", fullName: "Keep rejected organization" });
  store.rejectMasterCommand(rejected.command.operationId, "CONFLICT", "Retained review history");
  const backup = await createProfileBackup(store, vaultFile, now);
  const backupDirectory = path.join(path.dirname(store.status().databasePath), "backups", backup.id);
  const config = { cloudApiUrl: `${profile.environmentId}/api/v1`, cloudIssuer: profile.environmentId,
    cloudPublicKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString() };
  return { root, rootDirectory, destinationDirectory, store, opened, pending, rejected, backupDirectory, config };
}

test("export copies only the verified standalone bundle and restores exact pending/rejected work without touching the active store", async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.backupDirectory, "unrelated-secret.txt"), "Do not export unrelated files");
  const names = ["desktop.sqlite", "credentials.vault", "manifest.json"];
  const original = Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(f.backupDirectory, name)))]));
  const result = await exportProfileBackup({ backupDirectory: f.backupDirectory, destinationDirectory: f.destinationDirectory, now });
  assert.equal(path.dirname(result.directory), f.destinationDirectory);
  assert.match(result.id, /^backup-\d{13}-[0-9a-f-]{36}$/);
  assert.deepEqual(fs.readdirSync(result.directory).sort(), names.sort());
  assert.equal(result.pendingCount, 1); assert.equal(result.rejectedCount, 1);
  assert.equal(Object.hasOwn(result, "credentialBytes"), false);
  assert.equal(result.bytes, names.reduce((size, name) => size + fs.statSync(path.join(result.directory, name)).size, 0));
  for (const name of names) {
    assert.equal(hash(fs.readFileSync(path.join(f.backupDirectory, name))), original[name]);
    assert.equal(hash(fs.readFileSync(path.join(result.directory, name))), original[name]);
  }
  assert.deepEqual(f.store.pendingCommands(), [f.pending.command]);
  const verified = await verifyProfileBackup(result.directory);
  assert.equal(verified.storage.pendingCount, 1); assert.equal(verified.storage.rejectedCount, 1);
  const targetRoot = path.join(f.root, "recovered");
  await restoreProfileBackup({ backupDirectory: result.directory, targetRoot, password, config: f.config });
  const restored = new DesktopStore({ rootDirectory: targetRoot, profile }); f.opened.push(restored);
  assert.deepEqual(restored.pendingCommands(), [f.pending.command]);
  assert.deepEqual(restored.listMasters("organizationMaster"), f.store.listMasters("organizationMaster"));
  await assert.rejects(restoreProfileBackup({ backupDirectory: result.directory, targetRoot: f.rootDirectory, password, config: f.config }), { code: "RESTORE_DESTINATION_EXISTS" });
  assert.deepEqual(f.store.pendingCommands(), [f.pending.command]);
});

test("a corrupt source backup fails verification before reserving an export directory", async t => {
  const f = await fixture(t);
  fs.appendFileSync(path.join(f.backupDirectory, "credentials.vault"), "damaged");
  await assert.rejects(exportProfileBackup(f), { code: "BACKUP_INVALID" });
  assert.deepEqual(fs.readdirSync(f.destinationDirectory), []);
  assert.deepEqual(f.store.pendingCommands(), [f.pending.command]);
});

test("export refuses source containment, directory links and insufficient free space", async t => {
  const f = await fixture(t);
  const inside = path.join(f.backupDirectory, "inside"); fs.mkdirSync(inside);
  for (const destinationDirectory of [f.backupDirectory, inside]) {
    await assert.rejects(exportProfileBackup({ ...f, destinationDirectory }), { code: "EXPORT_DESTINATION_INVALID" });
  }
  const linked = path.join(f.root, "linked");
  fs.symlinkSync(f.destinationDirectory, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(exportProfileBackup({ ...f, destinationDirectory: linked }), { code: "BACKUP_INVALID" });
  const linkedSource = path.join(f.root, "linked-source");
  fs.symlinkSync(f.backupDirectory, linkedSource, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(exportProfileBackup({ ...f, backupDirectory: linkedSource }), { code: "BACKUP_INVALID" });
  t.mock.method(fs, "statfsSync", () => ({ bavail: 0n, bsize: 4096n }));
  await assert.rejects(exportProfileBackup(f), { code: "BACKUP_DISK_SPACE" });
  assert.deepEqual(fs.readdirSync(f.destinationDirectory), []);
});

test("an exclusive export-directory collision cannot overwrite a pre-existing destination", async t => {
  const f = await fixture(t), mkdir = fs.mkdirSync;
  let collision;
  t.mock.method(fs, "mkdirSync", (directory, options) => {
    if (path.dirname(directory) === f.destinationDirectory) {
      mkdir(directory, options); collision = directory;
      fs.writeFileSync(path.join(directory, "keep.txt"), "Keep existing destination");
    }
    return mkdir(directory, options);
  });
  await assert.rejects(exportProfileBackup(f), { code: "EEXIST" });
  assert.deepEqual(fs.readdirSync(collision), ["keep.txt"]);
  assert.equal(fs.readFileSync(path.join(collision, "keep.txt"), "utf8"), "Keep existing destination");
});

test("copy and target-hash failures retain partial folders without a completion manifest", async t => {
  const f = await fixture(t), copy = fs.copyFileSync;
  for (const fault of ["copy", "hash"]) {
    t.mock.method(fs, "copyFileSync", (source, destination, flags) => {
      if (fault === "copy" && source.endsWith("credentials.vault")) throw Object.assign(new Error("Injected disk error"), { code: "ENOSPC" });
      copy(source, destination, flags);
      if (fault === "hash" && source.endsWith("desktop.sqlite")) fs.appendFileSync(destination, "Unexpected copy bytes");
    });
    await assert.rejects(exportProfileBackup(f), { code: "BACKUP_EXPORT_FAILED" });
    t.mock.restoreAll();
  }
  const directories = fs.readdirSync(f.destinationDirectory); assert.equal(directories.length, 2);
  for (const name of directories) assert.equal(fs.existsSync(path.join(f.destinationDirectory, name, "manifest.json")), false);
  await verifyProfileBackup(f.backupDirectory);
  assert.deepEqual(f.store.pendingCommands(), [f.pending.command]);
});

test("a source changed after copying cannot publish a complete export", async t => {
  const f = await fixture(t), copy = fs.copyFileSync;
  t.mock.method(fs, "copyFileSync", (source, destination, flags) => {
    copy(source, destination, flags);
    if (source.endsWith("credentials.vault")) fs.appendFileSync(source, "Source changed during export");
  });
  await assert.rejects(exportProfileBackup(f), { code: "BACKUP_EXPORT_FAILED" });
  const [name] = fs.readdirSync(f.destinationDirectory);
  assert.equal(fs.existsSync(path.join(f.destinationDirectory, name, "manifest.json")), false);
  assert.deepEqual(f.store.pendingCommands(), [f.pending.command]);
});

test("authorization cancellation during copying prevents publication and preserves the source", async t => {
  const f = await fixture(t), copy = fs.copyFileSync;
  let cancelled = false;
  t.mock.method(fs, "copyFileSync", (source, destination, flags) => { copy(source, destination, flags); cancelled = true; });
  await assert.rejects(exportProfileBackup({ ...f, assertAuthorized() {
    if (cancelled) throw new LocalError(401, "Account changed", "LOGIN_CANCELLED");
  } }), { code: "BACKUP_EXPORT_FAILED", status: 401 });
  const [name] = fs.readdirSync(f.destinationDirectory);
  assert.equal(fs.existsSync(path.join(f.destinationDirectory, name, "manifest.json")), false);
  await verifyProfileBackup(f.backupDirectory);
  assert.deepEqual(f.store.pendingCommands(), [f.pending.command]);
});
