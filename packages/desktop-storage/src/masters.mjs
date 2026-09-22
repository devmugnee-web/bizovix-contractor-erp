import { randomUUID } from "node:crypto";
import { organizationQueryIndex } from "./organization-query-index.mjs";
import { fail } from "./errors.mjs";

export const MASTER_MIGRATION = { version: 2, sql: `
CREATE TABLE master_entities (
  entity_type TEXT NOT NULL CHECK(entity_type IN ('uom','paymentTerm')),
  entity_id TEXT NOT NULL, PRIMARY KEY(entity_type,entity_id)
);
CREATE TABLE accepted_masters (
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK(json_valid(body)),
  version INTEGER NOT NULL CHECK(version>0),
  visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
  PRIMARY KEY(entity_type,entity_id),
  FOREIGN KEY(entity_type,entity_id) REFERENCES master_entities(entity_type,entity_id),
  CHECK(json_type(body,'$.id') IS 'text' AND json_extract(body,'$.id')=entity_id),
  CHECK(json_type(body,'$.version') IS 'integer' AND json_extract(body,'$.version')=version)
);
CREATE TABLE master_outbox (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  entity_type TEXT NOT NULL, command_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, expected_version INTEGER,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED')),
  rejection_kind TEXT, rejection_message TEXT, created_at TEXT NOT NULL, resolved_at TEXT,
  FOREIGN KEY(entity_type,entity_id) REFERENCES master_entities(entity_type,entity_id),
  UNIQUE(operation_id,entity_type,entity_id),
  CHECK((command_type=entity_type||'.create' AND expected_version IS NULL) OR
        (command_type=entity_type||'.update' AND expected_version>0)),
  CHECK(status!='REJECTED' OR (rejection_kind IS NOT NULL AND rejection_message IS NOT NULL))
);
CREATE UNIQUE INDEX one_pending_master_operation ON master_outbox(entity_type,entity_id) WHERE status='PENDING';
CREATE INDEX master_outbox_status_sequence ON master_outbox(entity_type,status,sequence);
CREATE TABLE master_drafts (
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE, body TEXT NOT NULL CHECK(json_valid(body)),
  PRIMARY KEY(entity_type,entity_id),
  FOREIGN KEY(entity_type,entity_id) REFERENCES master_entities(entity_type,entity_id),
  FOREIGN KEY(operation_id,entity_type,entity_id) REFERENCES master_outbox(operation_id,entity_type,entity_id),
  CHECK(json_type(body,'$.id') IS 'text' AND json_extract(body,'$.id')=entity_id)
);
CREATE TABLE master_cursors (
  entity_type TEXT PRIMARY KEY NOT NULL CHECK(entity_type IN ('uom','paymentTerm')), cursor TEXT
);
INSERT INTO master_cursors(entity_type) VALUES('uom'),('paymentTerm');
CREATE TRIGGER immutable_master_command BEFORE UPDATE OF operation_id,device_id,schema_version,entity_type,command_type,entity_id,expected_version,payload,created_at ON master_outbox
BEGIN SELECT RAISE(ABORT,'Queued command content is immutable'); END;
CREATE TRIGGER retained_master_command BEFORE DELETE ON master_outbox
BEGIN SELECT RAISE(ABORT,'Queued command history must be retained'); END;
` };

const FIELDS = {
  uom: ["code", "name", "symbol", "isActive"],
  paymentTerm: ["name", "days", "description", "isActive"],
  organizationMaster: ["shortName", "fullName"],
};
function entityType(value) {
  if (typeof value !== "string" || !Object.hasOwn(FIELDS, value)) fail("INVALID_MASTER", "Unknown offline master type");
  return value;
}
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_MASTER", `${label} must be an object`);
}
function text(value, label, max = Infinity) {
  if (typeof value !== "string" || !value.length || value.length > max || value.includes("\0")) fail("INVALID_MASTER", `${label} must be nonempty text${Number.isFinite(max) ? ` of at most ${max} characters` : ""}`);
  return value;
}
function nullableText(value, label) {
  if (value !== null && (typeof value !== "string" || value.includes("\0"))) fail("INVALID_MASTER", `${label} must be text or null`);
  return value;
}
function daysValue(value) {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) fail("INVALID_MASTER", "Payment term days must be a nonnegative 32-bit integer");
  return value;
}

/** Matches the existing save DTO/service semantics, without permitting metadata in input. */
export function normalizeMasterInput(type, input, current) {
  entityType(type); object(input, "Master input");
  if (Object.keys(input).some((key) => !FIELDS[type].includes(key))) fail("INVALID_MASTER", "Master input contains unsupported fields");
  if (type === "organizationMaster") {
    // Match the original DTO's pinned validator.js isLength rule: paired
    // surrogates and VS15/VS16 presentation sequences each reduce the UTF-16
    // length by one. Preserve the supplied text, including whitespace and case.
    const name = (value, label, maximum) => {
      text(value, label);
      const presentationSequences = value.match(/[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g) || [];
      const surrogatePairs = value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || [];
      const length = value.length - presentationSequences.length - surrogatePairs.length;
      if (length > maximum) fail("INVALID_MASTER", `${label} must contain at most ${maximum} characters`);
      return value;
    };
    return { shortName: name(input.shortName, "Organization short name", 50), fullName: name(input.fullName, "Organization full name", 200) };
  }
  if (input.isActive !== undefined && input.isActive !== null && typeof input.isActive !== "boolean") fail("INVALID_MASTER", "Master active state must be boolean");
  const name = text(input.name, "Master name").trim();
  if (!name) fail("INVALID_MASTER", "Master name cannot be blank");
  const isActive = input.isActive ?? current?.isActive ?? true;
  if (type === "uom") {
    const suppliedCode = text(input.code, "Unit code").trim().toUpperCase();
    if (!suppliedCode) fail("INVALID_MASTER", "Unit code cannot be blank");
    return { code: current?.code ?? suppliedCode, name,
      symbol: nullableText(input.symbol === undefined ? current?.symbol ?? null : input.symbol, "Unit symbol"), isActive };
  }
  // The existing DTO applies class-transformer's Number conversion before IsInt.
  const suppliedDays = input.days == null ? current?.days ?? 0
    : ["number", "string", "boolean"].includes(typeof input.days) ? Number(input.days) : NaN;
  return { name, days: daysValue(suppliedDays),
    description: nullableText(input.description === undefined ? current?.description ?? null : input.description, "Payment term description"), isActive };
}

function timestamp(value, label) {
  const raw = text(value, label, 64);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw) || !Number.isFinite(Date.parse(raw))) fail("INVALID_MASTER", `${label} must be ISO date-time text`);
  return new Date(raw).toISOString();
}
function masterValue(type, input) {
  entityType(type); object(input, "Cloud master");
  const allowed = [...FIELDS[type], "id", "version", "createdAt", "updatedAt"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) fail("INVALID_MASTER", "Cloud master contains unsupported fields");
  if (!Number.isSafeInteger(input.version) || input.version < 1) fail("INVALID_MASTER", "Cloud master version must be a positive safe integer");
  if (type === "organizationMaster") {
    // Accepted historical values are not revalidated against today's form limits.
    for (const field of FIELDS[type]) if (typeof input[field] !== "string" || input[field].includes("\0")) fail("INVALID_MASTER", `Cloud organization ${field} must be text`);
    return { id: text(input.id, "Master ID", 512), shortName: input.shortName, fullName: input.fullName, version: input.version,
      createdAt: timestamp(input.createdAt, "Master creation timestamp"), updatedAt: timestamp(input.updatedAt, "Master update timestamp") };
  }
  if (typeof input.isActive !== "boolean") fail("INVALID_MASTER", "Cloud master active state must be boolean");
  // Preserve accepted data exactly; normalization belongs to commands, not cloud projections.
  if (typeof input.name !== "string" || input.name.includes("\0")) fail("INVALID_MASTER", "Cloud master name must be text");
  const fields = type === "uom"
    ? { code: typeof input.code === "string" && !input.code.includes("\0") ? input.code : fail("INVALID_MASTER", "Cloud unit code must be text"), name: input.name, symbol: nullableText(input.symbol, "Unit symbol"), isActive: input.isActive }
    : { name: input.name, days: daysValue(input.days), description: nullableText(input.description, "Payment term description"), isActive: input.isActive };
  return { id: text(input.id, "Master ID", 512), ...fields, version: input.version,
    createdAt: timestamp(input.createdAt, "Master creation timestamp"), updatedAt: timestamp(input.updatedAt, "Master update timestamp") };
}
function cursorValue(cursor) { return cursor === null ? null : text(cursor, "Master cursor", 4096); }
function limitValue(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) fail("INVALID_INPUT", "Command limit must be between 1 and 1000");
  return limit;
}
function commandValue(row) {
  return { operationId: row.operation_id, deviceId: row.device_id, schemaVersion: row.schema_version,
    entityType: row.entity_type, commandType: row.command_type, entityId: row.entity_id,
    expectedVersion: row.expected_version, payload: JSON.parse(row.payload) };
}
export function masterCounts(db, schemaVersion) {
  if (schemaVersion < 2) return { pendingCount: 0, rejectedCount: 0 };
  const families = [MASTER_TABLES, ...(schemaVersion >= 3 ? [ORGANIZATION_TABLES] : [])];
  return families.reduce((counts, tables) => ({
    pendingCount: counts.pendingCount + db.prepare(`SELECT count(*) AS n FROM ${tables.outbox} WHERE status='PENDING'`).get().n,
    rejectedCount: counts.rejectedCount + db.prepare(`SELECT count(*) AS n FROM ${tables.drafts} d JOIN ${tables.outbox} o ON o.operation_id=d.operation_id WHERE o.status='REJECTED'`).get().n,
  }), { pendingCount: 0, rejectedCount: 0 });
}

const MASTER_TABLES = Object.freeze({ entities: "master_entities", accepted: "accepted_masters", outbox: "master_outbox", drafts: "master_drafts", cursors: "master_cursors" });
const ORGANIZATION_TABLES = Object.freeze({ entities: "organization_master_entities", accepted: "accepted_organization_masters", outbox: "organization_master_outbox", drafts: "organization_master_drafts", cursors: "organization_master_cursors" });

/** Internal transaction owner, bound to the containing DesktopStore's verified connection. */
export class MasterOperations {
  constructor(db, profile, organizationFamily = false) {
    this.db = db; this.profile = profile; this.organizationFamily = organizationFamily;
    // Table identifiers are fixed application constants, never request input.
    this.tables = organizationFamily ? ORGANIZATION_TABLES : MASTER_TABLES;
  }
  checkType(type) {
    entityType(type);
    if ((type === "organizationMaster") !== this.organizationFamily) fail("INVALID_MASTER", "Master type does not match its storage family");
    return type;
  }
  ownsOperation(operationId) {
    text(operationId, "Operation ID", 512);
    return Boolean(this.db.prepare(`SELECT 1 FROM ${this.tables.outbox} WHERE operation_id=?`).get(operationId));
  }
  transaction(work) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  readCursor(type) {
    return this.db.prepare(`SELECT cursor FROM ${this.tables.cursors} WHERE entity_type=?`).get(this.checkType(type)).cursor;
  }
  readQueryIndex() {
    if (!this.organizationFamily) fail("INVALID_MASTER", "Query metadata belongs to the organization stream");
    const row = this.db.prepare("SELECT body FROM organization_query_index WHERE singleton=1").get();
    if (!row) fail("INVALID_MASTER", "Organization query index metadata is missing");
    return row.body === null ? null : organizationQueryIndex(JSON.parse(row.body));
  }
  prepareQueryIndex(type, value) {
    if (type !== "organizationMaster") {
      if (value !== undefined) fail("INVALID_MASTER", "Query metadata belongs to the organization stream");
      return null;
    }
    return value === undefined ? null : organizationQueryIndex(value);
  }
  writeQueryIndex(type, value) {
    if (type !== "organizationMaster") return;
    if (value) {
      const ids = new Set(value.orderedIds);
      const visible = this.db.prepare(`SELECT entity_id FROM ${this.tables.accepted} WHERE visible=1`).all();
      if (visible.some(row => !ids.has(row.entity_id))) fail("INVALID_MASTER", "Organization query index omits an accepted record");
    }
    // A caller without index support must not leave a previously trusted index
    // attached to changed records. The local HTTP layer will require bootstrap.
    const saved = this.db.prepare("UPDATE organization_query_index SET body=? WHERE singleton=1").run(value === null ? null : JSON.stringify(value));
    if (saved.changes !== 1) fail("INVALID_MASTER", "Organization query index metadata is missing");
  }
  list(type, { includeLocalDrafts = true } = {}) {
    this.checkType(type);
    if (typeof includeLocalDrafts !== "boolean") fail("INVALID_INPUT", "includeLocalDrafts must be boolean");
    const accepted = new Map(this.db.prepare(`SELECT body FROM ${this.tables.accepted} WHERE entity_type=? AND visible=1`).all(type).map((row) => {
      const record = JSON.parse(row.body); return [record.id, record];
    }));
    const records = new Map([...accepted].map(([id, record]) => [id, { ...record, syncStatus: "SYNCED" }]));
    const drafts = includeLocalDrafts ? this.db.prepare(`SELECT d.body,o.operation_id,o.status,o.rejection_kind,o.rejection_message FROM ${this.tables.drafts} d JOIN ${this.tables.outbox} o ON o.operation_id=d.operation_id WHERE d.entity_type=?`).all(type) : [];
    for (const row of drafts) {
      const record = JSON.parse(row.body), cloudRecord = accepted.get(record.id);
      records.set(record.id, { ...record, syncStatus: row.status, operationId: row.operation_id,
        ...(cloudRecord ? { cloudRecord } : {}),
        ...(row.status === "REJECTED" ? { syncError: { kind: row.rejection_kind, message: row.rejection_message } } : {}) });
    }
    const values = [...records.values()];
    // Organization typeahead/paginated ordering belongs to its route adapter.
    return type === "organizationMaster" ? values : values.sort((left, right) => (type === "uom" ? left.code.localeCompare(right.code) : left.days - right.days) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }
  create(type, payload) { return this.stage(this.checkType(type), randomUUID(), payload, true); }
  update(type, id, payload, { authorizeCommand } = {}) {
    this.checkType(type);
    if (type === "organizationMaster") fail("MASTER_UPDATE_UNSUPPORTED", "Accepted organizations do not support editing");
    return this.stage(type, text(id, "Master ID", 512), payload, false, authorizeCommand);
  }
  reviseCreate(type, id, payload, { authorizeCommand } = {}) {
    this.checkType(type);
    return this.stage(type, text(id, "Master ID", 512), payload, false, authorizeCommand, true);
  }
  stage(type, id, payload, create, authorizeCommand, revisionOnly = false) {
    const tables = this.tables;
    return this.transaction(() => {
      if (this.db.prepare(`SELECT 1 FROM ${tables.outbox} WHERE entity_type=? AND entity_id=? AND status='PENDING'`).get(type, id)) fail("COMMAND_PENDING", "This record already has a pending change. Sync it before editing again.");
      if (revisionOnly && this.db.prepare(`SELECT 1 FROM ${tables.accepted} WHERE entity_type=? AND entity_id=?`).get(type, id)) fail("COMMAND_RESOLVED", "An accepted record cannot be revised as a local creation");
      const existing = this.db.prepare(`SELECT body FROM ${tables.accepted} WHERE entity_type=? AND entity_id=? AND visible=1`).get(type, id);
      const rejected = !create && !existing ? this.db.prepare(`SELECT d.body FROM ${tables.drafts} d JOIN ${tables.outbox} o ON o.operation_id=d.operation_id WHERE d.entity_type=? AND d.entity_id=? AND o.status='REJECTED' AND o.command_type=?`).get(type, id, `${type}.create`) : null;
      if (!create && !existing && !rejected) fail("MASTER_NOT_FOUND", "The accepted record or rejected local creation was not found");
      const current = existing ? JSON.parse(existing.body) : rejected ? JSON.parse(rejected.body) : null;
      const createsOnServer = create || Boolean(rejected);
      const normalized = normalizeMasterInput(type, payload, createsOnServer ? undefined : current);
      const duplicateKey = (record) => type === "organizationMaster" ? record.shortName : type === "uom" ? record.code : record.name.toLocaleLowerCase("en-US");
      if (this.list(type).some((row) => row.id !== id && duplicateKey(row) === duplicateKey(normalized))) fail("MASTER_DUPLICATE", type === "organizationMaster" ? "This organization short name already exists; review pending changes before retrying" : type === "uom" ? "This unit code already exists; review pending changes before retrying" : "This payment term name already exists; review pending changes before retrying");
      const operationId = randomUUID(), now = new Date().toISOString();
      const command = { operationId, deviceId: this.profile.deviceId, schemaVersion: 1, entityType: type,
        commandType: `${type}.${createsOnServer ? "create" : "update"}`, entityId: id,
        expectedVersion: createsOnServer ? null : current.version, payload: normalized };
      authorizeCommand?.(command.commandType);
      const record = { id, ...normalized, version: current?.version ?? 0, createdAt: current?.createdAt ?? now, updatedAt: now };
      this.db.prepare(`INSERT INTO ${tables.entities} VALUES(?,?) ON CONFLICT DO NOTHING`).run(type, id);
      this.db.prepare(`INSERT INTO ${tables.outbox}(operation_id,device_id,schema_version,entity_type,command_type,entity_id,expected_version,payload,created_at) VALUES(?,?,1,?,?,?,?,?,?)`)
        .run(operationId, command.deviceId, type, command.commandType, id, command.expectedVersion, JSON.stringify(normalized), now);
      this.db.prepare(`INSERT INTO ${tables.drafts} VALUES(?,?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET operation_id=excluded.operation_id,body=excluded.body`).run(type, id, operationId, JSON.stringify(record));
      return { record: { ...record, syncStatus: "PENDING", operationId, ...(existing ? { cloudRecord: current } : {}) }, command };
    });
  }
  pending(type, limit = 100) {
    return this.db.prepare(`SELECT * FROM ${this.tables.outbox} WHERE entity_type=? AND status='PENDING' ORDER BY sequence LIMIT ?`).all(this.checkType(type), limitValue(limit)).map(commandValue);
  }
  upsert(type, record) {
    const body = JSON.stringify(record);
    const previous = this.db.prepare(`SELECT body,version FROM ${this.tables.accepted} WHERE entity_type=? AND entity_id=?`).get(type, record.id);
    if (previous && previous.version === record.version && previous.body !== body) fail("VERSION_COLLISION", "Cloud returned different master content for the same version");
    if (previous && previous.version > record.version) return;
    this.db.prepare(`INSERT INTO ${this.tables.entities} VALUES(?,?) ON CONFLICT DO NOTHING`).run(type, record.id);
    this.db.prepare(`INSERT INTO ${this.tables.accepted} VALUES(?,?,?,?,1) ON CONFLICT(entity_type,entity_id) DO UPDATE SET body=excluded.body,version=excluded.version,visible=1`).run(type, record.id, body, record.version);
  }
  accept(operationId, input) {
    text(operationId, "Operation ID", 512);
    this.transaction(() => {
      const command = this.db.prepare(`SELECT * FROM ${this.tables.outbox} WHERE operation_id=?`).get(operationId);
      if (!command) fail("COMMAND_NOT_FOUND", "The queued operation was not found");
      this.checkType(command.entity_type);
      const record = masterValue(command.entity_type, input), payload = JSON.parse(command.payload);
      if (command.entity_id !== record.id || FIELDS[command.entity_type].some((key) => payload[key] !== record[key])) fail("COMMAND_MISMATCH", "Cloud acknowledgement does not match the queued master operation");
      if (command.status === "REJECTED") fail("COMMAND_RESOLVED", "A rejected operation cannot be accepted without explicit reconciliation");
      if (record.version !== (command.expected_version ?? 0) + 1) fail("INVALID_VERSION", "Cloud acknowledgement must advance the master version exactly once");
      this.upsert(command.entity_type, record);
      // An ACK does not carry a complete database order/folding index. Keep
      // query access closed until a matching pull or snapshot supplies one.
      this.writeQueryIndex(command.entity_type, null);
      this.db.prepare(`UPDATE ${this.tables.outbox} SET status='ACCEPTED',resolved_at=? WHERE operation_id=?`).run(new Date().toISOString(), operationId);
      this.db.prepare(`DELETE FROM ${this.tables.drafts} WHERE operation_id=?`).run(operationId);
    });
  }
  reject(operationId, kind, message) {
    text(operationId, "Operation ID", 512); text(kind, "Rejection kind", 128); text(message, "Rejection message");
    this.transaction(() => {
      const row = this.db.prepare(`SELECT status FROM ${this.tables.outbox} WHERE operation_id=?`).get(operationId);
      if (!row) fail("COMMAND_NOT_FOUND", "The queued operation was not found");
      if (row.status === "ACCEPTED") fail("COMMAND_RESOLVED", "An accepted operation cannot be rejected");
      this.db.prepare(`UPDATE ${this.tables.outbox} SET status='REJECTED',rejection_kind=?,rejection_message=?,resolved_at=? WHERE operation_id=?`).run(kind, message, new Date().toISOString(), operationId);
    });
  }
  snapshot(type, values, cursor, queryIndex) {
    this.checkType(type);
    if (!Array.isArray(values)) fail("INVALID_INPUT", "Master snapshot must be an array");
    const records = values.map((value) => masterValue(type, value)), nextCursor = cursorValue(cursor);
    const nextIndex = this.prepareQueryIndex(type, queryIndex);
    if (new Set(records.map((record) => record.id)).size !== records.length) fail("INVALID_INPUT", "Master snapshot contains duplicate IDs");
    this.transaction(() => {
      this.db.prepare(`UPDATE ${this.tables.accepted} SET visible=0 WHERE entity_type=?`).run(type);
      for (const record of records) {
        this.upsert(type, record);
        this.db.prepare(`UPDATE ${this.tables.accepted} SET visible=1 WHERE entity_type=? AND entity_id=?`).run(type, record.id);
      }
      this.writeQueryIndex(type, nextIndex);
      this.db.prepare(`UPDATE ${this.tables.cursors} SET cursor=? WHERE entity_type=?`).run(nextCursor, type);
    });
  }
  changes(type, values, cursor, queryIndex) {
    this.checkType(type);
    if (!Array.isArray(values)) fail("INVALID_INPUT", "Master changes must be an array");
    const records = values.map((change) => {
      if (change?.kind !== "upsert") fail("INVALID_INPUT", "Unknown master change kind");
      return masterValue(type, change.record);
    }), nextCursor = cursorValue(cursor);
    const nextIndex = this.prepareQueryIndex(type, queryIndex);
    this.transaction(() => {
      for (const record of records) this.upsert(type, record);
      this.writeQueryIndex(type, nextIndex);
      this.db.prepare(`UPDATE ${this.tables.cursors} SET cursor=? WHERE entity_type=?`).run(nextCursor, type);
    });
  }
}
