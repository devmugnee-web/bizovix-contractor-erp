
CREATE TABLE organization_master_entities (
  entity_type TEXT NOT NULL CHECK(entity_type='organizationMaster'),
  entity_id TEXT NOT NULL, PRIMARY KEY(entity_type,entity_id)
);
CREATE TABLE accepted_organization_masters (
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK(json_valid(body)),
  version INTEGER NOT NULL CHECK(version>0),
  visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
  PRIMARY KEY(entity_type,entity_id),
  FOREIGN KEY(entity_type,entity_id) REFERENCES organization_master_entities(entity_type,entity_id),
  CHECK(json_type(body,'$.id') IS 'text' AND json_extract(body,'$.id')=entity_id),
  CHECK(json_type(body,'$.version') IS 'integer' AND json_extract(body,'$.version')=version)
);
CREATE TABLE organization_master_outbox (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  entity_type TEXT NOT NULL, command_type TEXT NOT NULL CHECK(command_type='organizationMaster.create'),
  entity_id TEXT NOT NULL, expected_version INTEGER CHECK(expected_version IS NULL),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED')),
  rejection_kind TEXT, rejection_message TEXT, created_at TEXT NOT NULL, resolved_at TEXT,
  FOREIGN KEY(entity_type,entity_id) REFERENCES organization_master_entities(entity_type,entity_id),
  UNIQUE(operation_id,entity_type,entity_id),
  CHECK(status!='REJECTED' OR (rejection_kind IS NOT NULL AND rejection_message IS NOT NULL))
);
CREATE UNIQUE INDEX one_pending_organization_master_operation ON organization_master_outbox(entity_type,entity_id) WHERE status='PENDING';
CREATE INDEX organization_master_outbox_status_sequence ON organization_master_outbox(entity_type,status,sequence);
CREATE TABLE organization_master_drafts (
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE, body TEXT NOT NULL CHECK(json_valid(body)),
  PRIMARY KEY(entity_type,entity_id),
  FOREIGN KEY(entity_type,entity_id) REFERENCES organization_master_entities(entity_type,entity_id),
  FOREIGN KEY(operation_id,entity_type,entity_id) REFERENCES organization_master_outbox(operation_id,entity_type,entity_id),
  CHECK(json_type(body,'$.id') IS 'text' AND json_extract(body,'$.id')=entity_id)
);
CREATE TABLE organization_master_cursors (
  entity_type TEXT PRIMARY KEY NOT NULL CHECK(entity_type='organizationMaster'), cursor TEXT
);
INSERT INTO organization_master_cursors(entity_type) VALUES('organizationMaster');
CREATE TRIGGER immutable_organization_master_command BEFORE UPDATE OF operation_id,device_id,schema_version,entity_type,command_type,entity_id,expected_version,payload,created_at ON organization_master_outbox
BEGIN SELECT RAISE(ABORT,'Queued command content is immutable'); END;
CREATE TRIGGER retained_organization_master_command BEFORE DELETE ON organization_master_outbox
BEGIN SELECT RAISE(ABORT,'Queued command history must be retained'); END;
