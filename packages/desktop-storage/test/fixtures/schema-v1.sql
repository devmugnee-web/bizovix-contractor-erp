
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
