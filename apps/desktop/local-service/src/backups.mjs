import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { inspectDesktopBackup } from "../../../../packages/desktop-storage/src/index.mjs";
import { LocalError, unlockVaultBytes, validateCloudConfiguration, vaultLocation, verifyOfflineGrant } from "./security.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const backupId = /^backup-\d{13}-[0-9a-f-]{36}$/;
const failure = () => new LocalError(409, "The backup could not be verified. No existing data was replaced.", "BACKUP_INVALID");

function safePath(target) {
  if (!path.isAbsolute(target)) throw failure();
  let current = path.resolve(target);
  for (;;) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw failure();
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function durableWrite(file, data) {
  const descriptor = fs.openSync(file, "wx", 0o600);
  try { fs.writeFileSync(descriptor, data); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}
function removeInspectionSqliteSidecars(directory) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const file = path.join(directory, `desktop.sqlite${suffix}`);
    safePath(file);
    if (!fs.existsSync(file)) continue;
    const status = fs.lstatSync(file);
    if (!status.isFile()) throw failure();
    // This directory was empty and exclusively reserved by this export, and
    // none of these paths existed before our read-only inspection. SQLite can
    // create a nonempty shared-memory index even though it writes no DB data.
    fs.unlinkSync(file);
  }
}
async function checksum(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function readManifest(directory) {
  safePath(directory);
  const file = path.join(directory, "manifest.json");
  safePath(file);
  if (fs.statSync(file).size > 16_384) throw failure();
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (manifest.formatVersion !== 1 || !["master-categories", "master-data"].includes(manifest.scope) ||
      (manifest.scope === "master-data" && (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 2)) ||
      !Number.isFinite(Date.parse(manifest.createdAt)) ||
      !manifest.profile || ["environmentId", "organizationId", "userId", "deviceId"].some((key) => typeof manifest.profile[key] !== "string" || !manifest.profile[key]) ||
      !/^[a-f0-9]{64}\.vault$/.test(manifest.vaultName) ||
      [manifest.database, manifest.credentials].some((entry) => !Number.isSafeInteger(entry?.size) || entry.size <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256))) throw failure();
  return manifest;
}

export async function latestProfileBackup(store) {
  const status = store.status(), directory = path.join(path.dirname(status.databasePath), "backups");
  if (!fs.existsSync(directory)) return null;
  try {
    safePath(directory);
    for (const name of fs.readdirSync(directory).filter((name) => backupId.test(name)).sort().reverse()) {
      try {
        const { manifest, storage } = await verifyProfileBackup(path.join(directory, name));
        // Keep older backups, but a backup taken before a schema upgrade must
        // not suppress the first automatic backup of the newly supported data.
        if (storage.schemaVersion === status.schemaVersion && JSON.stringify(manifest.profile) === JSON.stringify(status.profile)) return { id: name, createdAt: manifest.createdAt };
      } catch { /* An interrupted or invalid backup is never treated as complete. */ }
    }
  } catch { /* The next backup attempt reports the unavailable directory in status. */ }
  return null;
}

export async function createProfileBackup(store, vaultFile, now = Date.now()) {
  const status = store.status();
  const directory = path.join(path.dirname(status.databasePath), "backups");
  safePath(directory); safePath(vaultFile);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const free = fs.statfsSync(directory, { bigint: true });
  if (free.bavail * free.bsize < BigInt(fs.statSync(status.databasePath).size) * 2n + 16_777_216n) {
    throw new LocalError(507, "There is not enough free disk space for a verified backup.", "BACKUP_DISK_SPACE");
  }
  // Capture the small encrypted vault without retaining clear tokens/passwords in the bundle.
  if (fs.statSync(vaultFile).size > 2 * 1024 * 1024) throw failure();
  const credentials = fs.readFileSync(vaultFile);
  const id = `backup-${now}-${randomUUID()}`, target = path.join(directory, id);
  fs.mkdirSync(target, { mode: 0o700 });
  const database = await store.backup(path.join(target, "desktop.sqlite"));
  const descriptor = fs.openSync(database.path, "r+");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  durableWrite(path.join(target, "credentials.vault"), credentials);
  const manifest = { formatVersion: 1, scope: "master-data", schemaVersion: status.schemaVersion, createdAt: new Date(now).toISOString(), profile: status.profile,
    vaultName: path.basename(vaultFile), database: { size: database.size, sha256: database.sha256 },
    credentials: { size: credentials.length, sha256: digest(credentials) } };
  // Written last: directories without a manifest are incomplete and cannot be restored.
  durableWrite(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 2));
  await verifyProfileBackup(target);
  return { id, createdAt: manifest.createdAt };
}

export async function verifyProfileBackup(directory) {
  const manifest = readManifest(directory);
  const assertStandalone = () => {
    for (const suffix of ["-wal", "-journal"]) {
      const sidecar = path.join(directory, `desktop.sqlite${suffix}`);
      safePath(sidecar);
      if (fs.existsSync(sidecar) && fs.statSync(sidecar).size > 0) throw failure();
    }
  };
  assertStandalone();
  let credentialBytes;
  for (const [name, expected] of [["desktop.sqlite", manifest.database], ["credentials.vault", manifest.credentials]]) {
    const file = path.join(directory, name);
    safePath(file);
    if (!fs.statSync(file).isFile() || fs.statSync(file).size !== expected.size || await checksum(file) !== expected.sha256) throw failure();
    if (name === "credentials.vault") {
      if (expected.size > 2 * 1024 * 1024) throw failure();
      credentialBytes = fs.readFileSync(file);
      if (digest(credentialBytes) !== expected.sha256) throw failure();
    }
  }
  const storage = inspectDesktopBackup(path.join(directory, "desktop.sqlite"), manifest.profile);
  if ((manifest.schemaVersion !== undefined && manifest.schemaVersion !== storage.schemaVersion) ||
      (manifest.scope === "master-categories" && storage.schemaVersion !== 1)) throw failure();
  assertStandalone();
  return { manifest, storage, credentialBytes };
}

/** Copy one verified standalone backup to a new folder; never copy a live database. */
export async function exportProfileBackup({ backupDirectory, destinationDirectory, now = Date.now(), assertAuthorized = () => {} }) {
  assertAuthorized();
  safePath(backupDirectory); safePath(destinationDirectory);
  const source = path.resolve(backupDirectory), parent = path.resolve(destinationDirectory);
  const relative = path.relative(source, parent);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new LocalError(409, "Choose a destination outside the backup being exported.", "EXPORT_DESTINATION_INVALID");
  }
  if (!fs.statSync(parent).isDirectory() || !Number.isSafeInteger(now) || !/^\d{13}$/.test(String(now))) {
    throw new LocalError(409, "A valid existing destination folder is required.", "EXPORT_DESTINATION_INVALID");
  }
  const verified = await verifyProfileBackup(source);
  assertAuthorized();
  const { manifest, storage } = verified;
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  const bytes = manifest.database.size + manifest.credentials.size + manifestBytes.length;
  const free = fs.statfsSync(parent, { bigint: true });
  if (free.bavail * free.bsize < BigInt(bytes) + 16_777_216n) {
    throw new LocalError(507, "There is not enough free disk space to export this backup.", "BACKUP_DISK_SPACE");
  }
  const id = `backup-${now}-${randomUUID()}`, directory = path.join(parent, id);
  // mkdir without recursive mode is the exclusive reservation. A collision,
  // failure or interrupted copy leaves every existing file untouched.
  assertAuthorized();
  fs.mkdirSync(directory, { mode: 0o700 });
  try {
    for (const [name, expected] of [["desktop.sqlite", manifest.database], ["credentials.vault", manifest.credentials]]) {
      const original = path.join(source, name), copied = path.join(directory, name);
      assertAuthorized();
      safePath(original); safePath(copied);
      fs.copyFileSync(original, copied, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(copied, 0o600);
      const descriptor = fs.openSync(copied, "r+");
      try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
      const copiedHash = await checksum(copied);
      assertAuthorized();
      if (fs.statSync(copied).size !== expected.size || copiedHash !== expected.sha256) throw failure();
    }
    const copiedStorage = inspectDesktopBackup(path.join(directory, "desktop.sqlite"), manifest.profile);
    if (JSON.stringify(copiedStorage) !== JSON.stringify(storage)) throw failure();
    // Node's read-only SQLite inspection can leave empty WAL/SHM files on some
    // runtimes. They contain no data and are not part of a standalone bundle.
    removeInspectionSqliteSidecars(directory);
    if (fs.statSync(path.join(directory, "desktop.sqlite")).size !== manifest.database.size ||
        await checksum(path.join(directory, "desktop.sqlite")) !== manifest.database.sha256) throw failure();
    assertAuthorized();
    // A source modified during copying cannot be reported as a successful export.
    const sourceAfter = await verifyProfileBackup(source);
    assertAuthorized();
    if (JSON.stringify(sourceAfter.manifest) !== JSON.stringify(manifest) || JSON.stringify(sourceAfter.storage) !== JSON.stringify(storage)) throw failure();
    // Last file is the completion marker; unfinished copies are never restorable.
    // No asynchronous boundary follows this authorization check and publication.
    assertAuthorized();
    durableWrite(path.join(directory, "manifest.json"), manifestBytes);
    if (JSON.stringify(readManifest(directory)) !== JSON.stringify(manifest)) throw failure();
    return { directory, id, createdAt: manifest.createdAt, exportedAt: new Date(now).toISOString(),
      pendingCount: storage.pendingCount, rejectedCount: storage.rejectedCount, bytes };
  } catch (cause) {
    // Preserve partial copies for inspection. The caller gets no success result
    // and must not imply the user's working profile or previous backup was lost.
    throw new LocalError(cause?.status ?? 409, "Backup export could not be verified. Existing data and backups were preserved; an incomplete export folder may remain.", "BACKUP_EXPORT_FAILED");
  }
}

/** Recovery creates a NEW directory only. It never rolls back an active database. */
export async function restoreProfileBackup({ backupDirectory, targetRoot, password, config }) {
  safePath(targetRoot);
  if (fs.existsSync(targetRoot) || !fs.statSync(path.dirname(targetRoot)).isDirectory()) throw new LocalError(409, "Recovery requires a new destination directory. Existing data was preserved.", "RESTORE_DESTINATION_EXISTS");
  const { manifest, storage, credentialBytes } = await verifyProfileBackup(backupDirectory);
  const { key } = validateCloudConfiguration(config);
  const unlocked = unlockVaultBytes(credentialBytes, password);
  try {
    // Verify signature and bindings even for an expired grant; expiry still blocks ordinary offline login.
    const grant = verifyOfflineGrant(unlocked.data.grant, { key, issuer: config.cloudIssuer, deviceId: manifest.profile.deviceId, now: Date.parse(unlocked.data.grant?.payload?.issuedAt) });
    if (unlocked.data.deviceId !== manifest.profile.deviceId || grant.issuer !== manifest.profile.environmentId || grant.organizationId !== manifest.profile.organizationId || grant.userId !== manifest.profile.userId ||
        path.basename(vaultLocation(targetRoot, grant.issuer, grant.user.email)) !== manifest.vaultName) throw failure();
    fs.mkdirSync(targetRoot, { mode: 0o700 });
    const profileDirectory = path.join(targetRoot, digest(JSON.stringify(storage.profile)));
    fs.mkdirSync(profileDirectory, { mode: 0o700 });
    const database = path.join(profileDirectory, "desktop.sqlite");
    fs.copyFileSync(path.join(backupDirectory, "desktop.sqlite"), database, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(database, 0o600);
    const descriptor = fs.openSync(database, "r+");
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    const vault = vaultLocation(targetRoot, grant.issuer, grant.user.email);
    fs.mkdirSync(path.dirname(vault), { mode: 0o700 });
    durableWrite(vault, credentialBytes);
    // Recheck the destination; leave any failed attempt for inspection rather than deleting files.
    if (await checksum(database) !== manifest.database.sha256 || await checksum(vault) !== manifest.credentials.sha256) throw failure();
    inspectDesktopBackup(database, storage.profile);
    durableWrite(path.join(targetRoot, "recovery.json"), JSON.stringify({ recoveredAt: new Date().toISOString(), backupCreatedAt: manifest.createdAt, scope: manifest.scope, pendingCount: storage.pendingCount, rejectedCount: storage.rejectedCount }));
    return { rootDirectory: targetRoot, backupCreatedAt: manifest.createdAt, ...storage };
  } finally { unlocked.material.key.fill(0); }
}
