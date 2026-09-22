import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import { DesktopStoreError, fail } from "./errors.mjs";
import { MASTER_MIGRATION, MasterOperations, masterCounts } from "./masters.mjs";
import { ORGANIZATION_MIGRATION } from "./organization-migration.mjs";
import { ORGANIZATION_QUERY_INDEX_MIGRATION } from "./organization-query-index.mjs";
export { DesktopStoreError } from "./errors.mjs";
export { normalizeMasterInput } from "./masters.mjs";

const APPLICATION_ID = 0x425a4453;
const CATEGORY_TYPES = new Set(["VENDOR", "MATERIAL", "SUBCONTRACTOR_TRADE", "DOCUMENT_PURCHASE"]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const MIGRATIONS = [{ version: 1, sql: `
CREATE TABLE store_metadata (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1), profile_json TEXT NOT NULL,
  profile_hash TEXT NOT NULL, cursor TEXT, created_at TEXT NOT NULL
);
CREATE TABLE category_entities (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE accepted_categories (
  entity_id TEXT PRIMARY KEY NOT NULL REFERENCES category_entities(id),
  body TEXT NOT NULL CHECK(json_valid(body)), version INTEGER NOT NULL CHECK(version>0),
  visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
  CHECK(json_extract(body,'$.id')=entity_id), CHECK(json_extract(body,'$.version')=version)
);
CREATE TABLE category_outbox (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  command_type TEXT NOT NULL CHECK(command_type IN ('masterCategory.create','masterCategory.update')),
  entity_id TEXT NOT NULL REFERENCES category_entities(id), expected_version INTEGER,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED')),
  rejection_kind TEXT, rejection_message TEXT, created_at TEXT NOT NULL, resolved_at TEXT,
  UNIQUE(operation_id,entity_id),
  CHECK((command_type='masterCategory.create' AND expected_version IS NULL) OR
        (command_type='masterCategory.update' AND expected_version>0)),
  CHECK(status!='REJECTED' OR (rejection_kind IS NOT NULL AND rejection_message IS NOT NULL))
);
CREATE UNIQUE INDEX one_pending_category_operation ON category_outbox(entity_id) WHERE status='PENDING';
CREATE INDEX category_outbox_status_sequence ON category_outbox(status,sequence);
CREATE TABLE category_drafts (
  entity_id TEXT PRIMARY KEY NOT NULL REFERENCES category_entities(id),
  operation_id TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL CHECK(json_valid(body)), CHECK(json_extract(body,'$.id')=entity_id),
  FOREIGN KEY(operation_id,entity_id) REFERENCES category_outbox(operation_id,entity_id)
);
CREATE TRIGGER immutable_category_command BEFORE UPDATE OF operation_id,device_id,schema_version,command_type,entity_id,expected_version,payload,created_at ON category_outbox
BEGIN SELECT RAISE(ABORT,'Queued command content is immutable'); END;
CREATE TRIGGER retained_category_command BEFORE DELETE ON category_outbox
BEGIN SELECT RAISE(ABORT,'Queued command history must be retained'); END;
` }, MASTER_MIGRATION, ORGANIZATION_MIGRATION, ORGANIZATION_QUERY_INDEX_MIGRATION];
const CURRENT_VERSION = MIGRATIONS.at(-1).version;

function string(value, label, max = 10000) {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) fail("INVALID_INPUT", `${label} must be a nonempty string of at most ${max} characters`);
  return value;
}
function profileValue(input) {
  if (!input || typeof input !== "object") fail("INVALID_PROFILE", "A bound desktop profile is required");
  return Object.fromEntries(["environmentId", "organizationId", "userId", "deviceId"].map((key) => [key, string(input[key], key, 512)]));
}
function categoryInput(input, current) {
  if (!input || typeof input !== "object" || !CATEGORY_TYPES.has(input.type)) fail("INVALID_CATEGORY", "Unknown master category type");
  if (current && input.type !== current.type) fail("INVALID_CATEGORY", "A category's type cannot be changed");
  const name = string(input.name, "Category name").trim();
  if (input.description !== undefined && input.description !== null && typeof input.description !== "string") fail("INVALID_CATEGORY", "Category description must be text or null");
  if (input.isActive !== undefined && typeof input.isActive !== "boolean") fail("INVALID_CATEGORY", "Category active state must be boolean");
  return { type: input.type, name, description: input.description === undefined ? current?.description ?? null : input.description, isActive: input.isActive ?? current?.isActive ?? true };
}
function categoryValue(input) {
  const id = string(input?.id, "Category ID", 512);
  const payload = categoryInput(input);
  if (!Number.isSafeInteger(input.version) || input.version < 1) fail("INVALID_CATEGORY", "A cloud category must have a positive integer version");
  const timestamp = (value, label) => {
    const raw = string(value, label, 64);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(raw) || !Number.isFinite(Date.parse(raw))) fail("INVALID_CATEGORY", "Category timestamps must be ISO date-time text");
    return new Date(raw).toISOString();
  };
  return { id, ...payload, version: input.version, createdAt: timestamp(input.createdAt, "Category creation timestamp"), updatedAt: timestamp(input.updatedAt, "Category update timestamp") };
}
function cursorValue(cursor) { return cursor === null ? null : string(cursor, "Sync cursor", 4096); }
function limitValue(limit) { if (!Number.isInteger(limit) || limit < 1 || limit > 1000) fail("INVALID_INPUT", "Command limit must be between 1 and 1000"); return limit; }
function commandValue(row) {
  return { operationId: row.operation_id, deviceId: row.device_id, schemaVersion: row.schema_version, commandType: row.command_type, entityId: row.entity_id, expectedVersion: row.expected_version, payload: JSON.parse(row.payload) };
}
function noSymlink(file) { if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) fail("UNSAFE_PATH", "Desktop storage paths must not be symbolic links"); }
function integrity(connection) {
  const rows = connection.prepare("PRAGMA integrity_check").all();
  if (rows.length !== 1 || rows[0].integrity_check !== "ok" || connection.prepare("PRAGMA foreign_key_check").all().length) fail("DATABASE_INTEGRITY", "Desktop database integrity verification failed; the existing file was preserved");
}
function verifyExisting(connection, profileJson, profileHash) {
  if (connection.prepare("PRAGMA application_id").get().application_id !== APPLICATION_ID) fail("UNKNOWN_DATABASE", "This file is not a Bizovix desktop store; it was preserved");
  const version = connection.prepare("PRAGMA user_version").get().user_version;
  if (version > CURRENT_VERSION) fail("NEWER_SCHEMA", "This database requires a newer application; it was preserved");
  if (version < 1) fail("INCOMPLETE_SCHEMA", "Desktop database initialization is incomplete; the file was preserved");
  const metadata = connection.prepare("SELECT * FROM store_metadata WHERE singleton=1").get();
  if (!metadata || metadata.profile_json !== profileJson || metadata.profile_hash !== profileHash) fail("PROFILE_MISMATCH", "Desktop database belongs to a different account, device, or environment");
  const applied = connection.prepare("SELECT version,checksum FROM local_migrations ORDER BY version").all();
  if (applied.length !== version) fail("MIGRATION_MISMATCH", "Desktop migration history is incomplete");
  for (let index = 0; index < applied.length; index++) {
    const migration = MIGRATIONS[index];
    if (!migration || applied[index].version !== migration.version || applied[index].checksum !== hash(migration.sql)) fail("MIGRATION_MISMATCH", "Desktop migration checksum does not match this application");
  }
  integrity(connection);
  return version;
}

/** Owns one user/company/device projection. Authentication is enforced by the local service. */
export function inspectDesktopBackup(file, profile) {
  if (!path.isAbsolute(file)) fail("UNSAFE_PATH", "Backup path must be absolute");
  noSymlink(file);
  const normalized = profileValue(profile), profileJson = JSON.stringify(normalized);
  const connection = new DatabaseSync(file, { readOnly: true });
  try {
    const schemaVersion = verifyExisting(connection, profileJson, hash(profileJson));
    const masters = masterCounts(connection, schemaVersion);
    return { schemaVersion, profile: normalized,
      pendingCount: masters.pendingCount + connection.prepare("SELECT count(*) AS n FROM category_outbox WHERE status='PENDING'").get().n,
      rejectedCount: masters.rejectedCount + connection.prepare("SELECT count(*) AS n FROM category_drafts d JOIN category_outbox o ON o.operation_id=d.operation_id WHERE o.status='REJECTED'").get().n };
  } finally { connection.close(); }
}

export class DesktopStore {
  #db; #masters; #organizations; #profile; #databasePath; #closed = false; #backupInProgress = false;
  constructor({ rootDirectory, profile } = {}) {
    string(rootDirectory, "Storage root");
    if (!path.isAbsolute(rootDirectory)) fail("UNSAFE_PATH", "Desktop storage root must be an absolute path");
    this.#profile = profileValue(profile);
    const profileJson = JSON.stringify(this.#profile), profileHash = hash(profileJson);
    const root = path.resolve(rootDirectory), directory = path.join(root, profileHash);
    noSymlink(root); noSymlink(directory);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.#databasePath = path.join(directory, "desktop.sqlite");
    noSymlink(this.#databasePath);
    let version = 0;
    try {
      if (fs.existsSync(this.#databasePath)) {
        const inspection = new DatabaseSync(this.#databasePath, { readOnly: true });
        try { version = verifyExisting(inspection, profileJson, profileHash); } finally { inspection.close(); }
      }
      this.#db = new DatabaseSync(this.#databasePath);
      this.#db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
      if (version > 0 && version < CURRENT_VERSION) {
        const backupDirectory = path.join(directory, "migration-backups");
        noSymlink(backupDirectory); fs.mkdirSync(backupDirectory, { mode: 0o700, recursive: true });
        const previousVersionBackup = path.join(backupDirectory, `schema-${version}-${randomUUID()}.sqlite`);
        const reservation = fs.openSync(previousVersionBackup, "wx", 0o600); fs.closeSync(reservation);
        // VACUUM INTO creates a consistent snapshot without copying a live WAL file.
        this.#db.prepare("VACUUM INTO ?").run(previousVersionBackup);
        const verification = new DatabaseSync(previousVersionBackup, { readOnly: true });
        try { verifyExisting(verification, profileJson, profileHash); } finally { verification.close(); }
        const durableBackup = fs.openSync(previousVersionBackup, "r+");
        try { fs.fsyncSync(durableBackup); } finally { fs.closeSync(durableBackup); }
        if (process.platform !== "win32") {
          for (const parent of [backupDirectory, directory]) {
            const descriptor = fs.openSync(parent, "r");
            try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
          }
        }
      }
      for (const migration of MIGRATIONS.filter((entry) => entry.version > version)) {
        this.#transaction(() => {
          this.#db.exec("CREATE TABLE IF NOT EXISTS local_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
          this.#db.exec(migration.sql);
          if (migration.version === 1) this.#db.prepare("INSERT INTO store_metadata VALUES(1,?,?,NULL,?)").run(profileJson, profileHash, new Date().toISOString());
          this.#db.prepare("INSERT INTO local_migrations VALUES(?,?,?)").run(migration.version, hash(migration.sql), new Date().toISOString());
          this.#db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${migration.version};`);
        });
      }
      verifyExisting(this.#db, profileJson, profileHash);
      this.#masters = new MasterOperations(this.#db, this.#profile);
      this.#organizations = new MasterOperations(this.#db, this.#profile, true);
    } catch (error) {
      this.#db?.close(); this.#closed = true;
      if (error instanceof DesktopStoreError) throw error;
      throw new DesktopStoreError("DATABASE_OPEN", "Desktop database could not be opened safely; existing data was preserved", { cause: error });
    }
  }
  #ready() { if (this.#closed || !this.#db) fail("STORE_CLOSED", "Desktop database is closed"); }
  #transaction(work) {
    this.#ready(); this.#db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.#db.exec("COMMIT"); return result; }
    catch (error) { this.#db.exec("ROLLBACK"); throw error; }
  }
  close() {
    if (this.#backupInProgress) fail("BACKUP_IN_PROGRESS", "Wait for the current backup before closing the desktop database");
    if (!this.#closed) { this.#db?.close(); this.#closed = true; }
  }
  status() {
    this.#ready();
    const masters = masterCounts(this.#db, CURRENT_VERSION);
    return { schemaVersion: CURRENT_VERSION, profile: { ...this.#profile }, databasePath: this.#databasePath,
      pendingCount: masters.pendingCount + this.#db.prepare("SELECT count(*) AS n FROM category_outbox WHERE status='PENDING'").get().n,
      rejectedCount: masters.rejectedCount + this.#db.prepare("SELECT count(*) AS n FROM category_drafts d JOIN category_outbox o ON o.operation_id=d.operation_id WHERE o.status='REJECTED'").get().n,
      cursor: this.readCursor() };
  }
  readCursor() { this.#ready(); return this.#db.prepare("SELECT cursor FROM store_metadata WHERE singleton=1").get().cursor; }
  #masterStore(entityType) { this.#ready(); return entityType === "organizationMaster" ? this.#organizations : this.#masters; }
  #operationStore(operationId) {
    this.#ready();
    const owners = [this.#masters, this.#organizations].filter((store) => store.ownsOperation(operationId));
    if (!owners.length) fail("COMMAND_NOT_FOUND", "The queued operation was not found");
    if (owners.length !== 1) fail("COMMAND_MISMATCH", "Operation identity is ambiguous; local work was preserved");
    return owners[0];
  }
  listMasters(entityType, options) { return this.#masterStore(entityType).list(entityType, options); }
  stageMasterCreate(entityType, payload) { return this.#masterStore(entityType).create(entityType, payload); }
  stageMasterUpdate(entityType, id, payload, options) { return this.#masterStore(entityType).update(entityType, id, payload, options); }
  stageMasterCreateRevision(entityType, id, payload, options) { return this.#masterStore(entityType).reviseCreate(entityType, id, payload, options); }
  pendingMasterCommands(entityType, limit) { return this.#masterStore(entityType).pending(entityType, limit); }
  acceptMasterCommand(operationId, record) { return this.#operationStore(operationId).accept(operationId, record); }
  rejectMasterCommand(operationId, kind, message) { return this.#operationStore(operationId).reject(operationId, kind, message); }
  applyMasterSnapshot(entityType, records, cursor, queryIndex) { return this.#masterStore(entityType).snapshot(entityType, records, cursor, queryIndex); }
  applyMasterChanges(entityType, changes, cursor, queryIndex) { return this.#masterStore(entityType).changes(entityType, changes, cursor, queryIndex); }
  readOrganizationQueryIndex() { this.#ready(); return this.#organizations.readQueryIndex(); }
  readMasterCursor(entityType) { return this.#masterStore(entityType).readCursor(entityType); }
  listCategories(type) {
    this.#ready();
    if (type !== undefined && !CATEGORY_TYPES.has(type)) fail("INVALID_CATEGORY", "Unknown category type");
    const accepted = new Map(this.#db.prepare("SELECT body FROM accepted_categories WHERE visible=1").all().map((row) => {
      const category = JSON.parse(row.body); return [category.id, category];
    }));
    const categories = new Map([...accepted].map(([id, category]) => [id, { ...category, syncStatus: "SYNCED" }]));
    const drafts = this.#db.prepare("SELECT d.body,o.operation_id,o.status,o.rejection_kind,o.rejection_message,o.command_type,o.created_at FROM category_drafts d JOIN category_outbox o ON o.operation_id=d.operation_id").all();
    for (const row of drafts) {
      const category = JSON.parse(row.body), cloudCategory = accepted.get(category.id);
      // An older pilot draft can recover an actual recorded creation time; do not
      // invent creation dates for cloud records that have not yet been refreshed.
      if (!category.createdAt && cloudCategory?.createdAt) category.createdAt = cloudCategory.createdAt;
      else if (!category.createdAt && row.command_type === "masterCategory.create") category.createdAt = row.created_at;
      categories.set(category.id, { ...category, syncStatus: row.status, operationId: row.operation_id,
        ...(cloudCategory ? { cloudCategory } : {}),
        ...(row.status === "REJECTED" ? { syncError: { kind: row.rejection_kind, message: row.rejection_message } } : {}) });
    }
    return [...categories.values()].filter((row) => !type || row.type === type).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }
  stageCategoryCreate(payload) { return this.#stage(randomUUID(), payload, true); }
  stageCategoryUpdate(id, payload, { authorizeCommand } = {}) { return this.#stage(string(id, "Category ID", 512), payload, false, authorizeCommand); }
  #stage(id, payload, create, authorizeCommand) {
    return this.#transaction(() => {
      if (this.#db.prepare("SELECT 1 FROM category_outbox WHERE entity_id=? AND status='PENDING'").get(id)) fail("COMMAND_PENDING", "This category already has a pending change. Sync it before editing again.");
      const existing = this.#db.prepare("SELECT body FROM accepted_categories WHERE entity_id=? AND visible=1").get(id);
      const rejectedCreation = !create && !existing ? this.#db.prepare("SELECT d.body FROM category_drafts d JOIN category_outbox o ON o.operation_id=d.operation_id WHERE d.entity_id=? AND o.status='REJECTED' AND o.command_type='masterCategory.create'").get(id) : null;
      if (!create && !existing && !rejectedCreation) fail("CATEGORY_NOT_FOUND", "The accepted category or rejected local creation was not found");
      // Revising a rejected creation creates a new immutable create command for the same ID.
      const createsOnServer = create || Boolean(rejectedCreation);
      const current = existing ? JSON.parse(existing.body) : rejectedCreation ? JSON.parse(rejectedCreation.body) : null, normalized = categoryInput(payload, current);
      const clash = this.listCategories(normalized.type).find((row) => row.id !== id && row.name.toLocaleLowerCase("en-US") === normalized.name.toLocaleLowerCase("en-US"));
      if (clash) fail("CATEGORY_DUPLICATE", "A category with this name already exists; sync and resolve any pending conflicts first");
      const operationId = randomUUID(), timestamp = new Date().toISOString();
      const command = { operationId, deviceId: this.#profile.deviceId, schemaVersion: 1, commandType: `masterCategory.${createsOnServer ? "create" : "update"}`, entityId: id, expectedVersion: createsOnServer ? null : current.version, payload: normalized };
      authorizeCommand?.(command.commandType);
      const category = { id, ...normalized, version: current?.version ?? 0,
        ...(current?.createdAt ? { createdAt: current.createdAt } : createsOnServer ? { createdAt: timestamp } : {}), updatedAt: timestamp };
      this.#db.prepare("INSERT INTO category_entities(id) VALUES(?) ON CONFLICT(id) DO NOTHING").run(id);
      this.#db.prepare("INSERT INTO category_outbox(operation_id,device_id,schema_version,command_type,entity_id,expected_version,payload,created_at) VALUES(?,?,1,?,?,?,?,?)")
        .run(operationId, command.deviceId, command.commandType, id, command.expectedVersion, JSON.stringify(normalized), timestamp);
      this.#db.prepare("INSERT INTO category_drafts VALUES(?,?,?) ON CONFLICT(entity_id) DO UPDATE SET operation_id=excluded.operation_id,body=excluded.body").run(id, operationId, JSON.stringify(category));
      return { category: { ...category, syncStatus: "PENDING", operationId }, command };
    });
  }
  pendingCommands(limit = 100) { this.#ready(); return this.#db.prepare("SELECT * FROM category_outbox WHERE status='PENDING' ORDER BY sequence LIMIT ?").all(limitValue(limit)).map(commandValue); }
  rejectedCommands(limit = 100) { this.#ready(); return this.#db.prepare("SELECT * FROM category_outbox WHERE status='REJECTED' ORDER BY sequence DESC LIMIT ?").all(limitValue(limit)).map((row) => ({ ...commandValue(row), rejection: { kind: row.rejection_kind, message: row.rejection_message } })); }
  #upsert(category) {
    const previous = this.#db.prepare("SELECT body,version FROM accepted_categories WHERE entity_id=?").get(category.id);
    if (previous && previous.version === category.version && previous.body !== JSON.stringify(category)) {
      const old = JSON.parse(previous.body), { createdAt: _createdAt, ...withoutCreationTime } = category;
      // Compatibility with the unreleased pilot's original projection: the server
      // may fill its real createdAt without changing a business version.
      if (old.createdAt || JSON.stringify(old) !== JSON.stringify(withoutCreationTime)) fail("VERSION_COLLISION", "Cloud returned different category content for the same version");
    }
    if (previous && previous.version > category.version) return;
    this.#db.prepare("INSERT INTO category_entities VALUES(?) ON CONFLICT(id) DO NOTHING").run(category.id);
    this.#db.prepare("INSERT INTO accepted_categories VALUES(?,?,?,1) ON CONFLICT(entity_id) DO UPDATE SET body=excluded.body,version=excluded.version,visible=1").run(category.id, JSON.stringify(category), category.version);
  }
  acceptCommand(operationId, value) {
    const category = categoryValue(value);
    this.#transaction(() => {
      const command = this.#db.prepare("SELECT * FROM category_outbox WHERE operation_id=?").get(string(operationId, "Operation ID", 512));
      if (!command || command.entity_id !== category.id) fail("COMMAND_MISMATCH", "Cloud acknowledgement does not match a stored operation");
      if (command.status === "REJECTED") fail("COMMAND_RESOLVED", "A rejected operation cannot be accepted without explicit reconciliation");
      if (category.version <= (command.expected_version ?? 0)) fail("INVALID_VERSION", "Cloud acknowledgement must advance the category version");
      this.#upsert(category);
      this.#db.prepare("UPDATE category_outbox SET status='ACCEPTED',resolved_at=? WHERE operation_id=?").run(new Date().toISOString(), operationId);
      this.#db.prepare("DELETE FROM category_drafts WHERE operation_id=?").run(operationId);
    });
  }
  rejectCommand(operationId, kind, message) {
    string(kind, "Rejection kind", 128); string(message, "Rejection message", 10000);
    this.#transaction(() => {
      const row = this.#db.prepare("SELECT status FROM category_outbox WHERE operation_id=?").get(string(operationId, "Operation ID", 512));
      if (!row) fail("COMMAND_NOT_FOUND", "The queued operation was not found");
      if (row.status === "ACCEPTED") fail("COMMAND_RESOLVED", "An accepted operation cannot be rejected");
      this.#db.prepare("UPDATE category_outbox SET status='REJECTED',rejection_kind=?,rejection_message=?,resolved_at=? WHERE operation_id=?").run(kind, message, new Date().toISOString(), operationId);
    });
  }
  applyCategorySnapshot(values, cursor) {
    if (!Array.isArray(values)) fail("INVALID_INPUT", "Category snapshot must be an array");
    const categories = values.map(categoryValue), nextCursor = cursorValue(cursor);
    if (new Set(categories.map((category) => category.id)).size !== categories.length) fail("INVALID_INPUT", "Category snapshot contains duplicate IDs");
    this.#transaction(() => {
      this.#db.exec("UPDATE accepted_categories SET visible=0");
      for (const category of categories) {
        this.#upsert(category);
        this.#db.prepare("UPDATE accepted_categories SET visible=1 WHERE entity_id=?").run(category.id);
      }
      this.#db.prepare("UPDATE store_metadata SET cursor=? WHERE singleton=1").run(nextCursor);
    });
  }
  applyCategoryChanges(values, cursor) {
    if (!Array.isArray(values)) fail("INVALID_INPUT", "Category changes must be an array");
    const changes = values.map((change) => {
      if (change?.kind === "upsert") return { kind: "upsert", category: categoryValue(change.category) };
      if (change?.kind === "delete") return { kind: "delete", id: string(change.id, "Category ID", 512) };
      fail("INVALID_INPUT", "Unknown category change kind");
    }), nextCursor = cursorValue(cursor);
    this.#transaction(() => {
      for (const change of changes) {
        if (change.kind === "upsert") this.#upsert(change.category);
        else this.#db.prepare("UPDATE accepted_categories SET visible=0 WHERE entity_id=?").run(change.id);
      }
      this.#db.prepare("UPDATE store_metadata SET cursor=? WHERE singleton=1").run(nextCursor);
    });
  }
  async backup(destination) {
    this.#ready(); string(destination, "Backup destination");
    if (this.#backupInProgress) fail("BACKUP_IN_PROGRESS", "A desktop database backup is already running");
    if (!path.isAbsolute(destination)) fail("UNSAFE_PATH", "Backup destination must be an absolute path");
    const target = path.resolve(destination);
    // Exclusive reservation prevents overwriting a source, existing backup, or symlink target.
    const reservation = fs.openSync(target, "wx", 0o600); fs.closeSync(reservation);
    this.#backupInProgress = true;
    try {
      await sqliteBackup(this.#db, target);
      const verification = new DatabaseSync(target, { readOnly: true });
      try { verifyExisting(verification, JSON.stringify(this.#profile), hash(JSON.stringify(this.#profile))); } finally { verification.close(); }
      const checksum = createHash("sha256");
      for await (const chunk of fs.createReadStream(target)) checksum.update(chunk);
      return { path: target, sha256: checksum.digest("hex"), size: fs.statSync(target).size };
    } finally { this.#backupInProgress = false; }
  }
}

export function canonicalDecimal(input, precision, scale) {
  if (!Number.isInteger(precision) || precision < 1 || precision > 1000 || !Number.isInteger(scale) || scale < 0 || scale > precision) fail("INVALID_DECIMAL_FORMAT", "Decimal precision and scale are invalid");
  if (typeof input !== "string" || input.length > 2100 || !/^-?\d+(?:\.\d+)?$/.test(input)) fail("INVALID_DECIMAL", "Decimal input must be plain decimal text");
  const negative = input.startsWith("-"), [whole, fraction = ""] = (negative ? input.slice(1) : input).split(".");
  if (fraction.length > scale) fail("DECIMAL_SCALE", "Decimal has excess scale; an explicit rounding decision is required");
  const integer = whole.replace(/^0+(?=\d)/, "");
  if ((integer === "0" ? 0 : integer.length) > precision - scale) fail("DECIMAL_PRECISION", "Decimal exceeds its declared precision");
  const fractional = fraction.padEnd(scale, "0"), isZero = BigInt(integer + fractional) === 0n;
  return `${negative && !isZero ? "-" : ""}${integer}${scale ? `.${fractional}` : ""}`;
}
export function decimalAdd(left, right, precision, scale) {
  const a = canonicalDecimal(left, precision, scale), b = canonicalDecimal(right, precision, scale);
  const total = BigInt(a.replace(".", "")) + BigInt(b.replace(".", ""));
  const negative = total < 0n, digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  return canonicalDecimal(`${negative ? "-" : ""}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`, precision, scale);
}
