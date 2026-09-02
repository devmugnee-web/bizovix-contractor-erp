import { z } from "zod";

import { apiRequest } from "@/services/api-client";
import type { DataMode } from "@/types/domain";

export const TALLY_SYNC_SCHEMA_VERSION = 1 as const;
export const TALLY_SYNC_APP_SETTINGS_NAMESPACE = "tally-sync" as const;

const API_STATE_MAX_BYTES = 900_000;
const LOCAL_STATE_MAX_BYTES = 4_000_000;

export type TallyMappingDirection = "bidirectional" | "export-only" | "import-only";
export type TallyLedgerMappingStatus = "active" | "needs-review" | "disabled";
export type BizovixLedgerKind = "account" | "party";

/**
 * A workspace-scoped, explicit link between a Tally ledger and the Bizovix
 * identity that owns postings for it. `bizovixLedgerId` is an Account id when
 * `bizovixLedgerKind` is `account`, and a Party id when it is `party`.
 * `bizovixAccountId` can additionally identify the party's control account.
 */
export interface TallyLedgerMapping {
  id: string;
  tallyLedgerName: string;
  tallyLedgerGuid: string | null;
  tallyParentName: string | null;
  bizovixLedgerKind: BizovixLedgerKind;
  bizovixLedgerId: string;
  bizovixLedgerName: string;
  bizovixAccountId: string | null;
  bizovixAccountCode: string | null;
  direction: TallyMappingDirection;
  status: TallyLedgerMappingStatus;
  createdAt: string;
  updatedAt: string;
}

export type TallySyncDirection = "export-to-tally" | "import-from-tally";
export type TallySyncTransport = "xml-file" | "tally-http";
export type TallySyncBatchStatus =
  | "preparing"
  | "prepared"
  | "processing"
  | "exported"
  | "imported"
  | "partially-succeeded"
  | "failed"
  | "cancelled";

export interface TallySyncBatchError {
  code: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  tallyRemoteId: string | null;
}

/** An immutable audit snapshot for one file or direct-HTTP sync attempt. */
export interface TallySyncBatchRecord {
  id: string;
  direction: TallySyncDirection;
  transport: TallySyncTransport;
  status: TallySyncBatchStatus;
  companyName: string;
  companyGuid: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  fileName: string | null;
  checksumSha256: string | null;
  selectedCount: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  totalDebit: number;
  totalCredit: number;
  bizovixEntityIds: string[];
  errors: TallySyncBatchError[];
  createdById: string | null;
  createdByName: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TallyRemoteEntityType =
  | "voucher"
  | "ledger"
  | "stock-item"
  | "stock-group"
  | "unit"
  | "godown"
  | "cost-centre";

export type TallyRemoteLinkStatus = "active" | "cancelled" | "deleted";
export type TallyRemoteLinkOrigin = "imported-from-tally" | "exported-to-tally";

/**
 * Durable de-duplication/link record for an entity observed in Tally. Tally
 * numeric ids are strings deliberately, so large MASTERID/ALTERID values are
 * never rounded by JavaScript.
 */
export interface TallyImportedRemoteRecord {
  id: string;
  tallyEntityType: TallyRemoteEntityType;
  tallyRemoteId: string;
  tallyGuid: string | null;
  tallyMasterId: string | null;
  tallyAlterId: string | null;
  tallyVoucherKey: string | null;
  bizovixEntityType: string;
  bizovixEntityId: string;
  batchId: string;
  origin: TallyRemoteLinkOrigin;
  status: TallyRemoteLinkStatus;
  fingerprint: string | null;
  sourceUpdatedAt: string | null;
  importedAt: string;
  lastSeenAt: string;
}

export interface TallyCompanyIdentity {
  name: string;
  guid: string | null;
  lastVerifiedAt: string | null;
}

export interface TallySyncState {
  schemaVersion: typeof TALLY_SYNC_SCHEMA_VERSION;
  workspaceId: string;
  company: TallyCompanyIdentity | null;
  ledgerMappings: TallyLedgerMapping[];
  batches: TallySyncBatchRecord[];
  importedRemoteIds: TallyImportedRemoteRecord[];
  updatedAt: string | null;
}

export interface TallySyncAppSettingsRecord {
  id?: string;
  workspaceId: string;
  namespace: typeof TALLY_SYNC_APP_SETTINGS_NAMESPACE;
  settings: TallySyncState | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type TallyLedgerMappingInput = Omit<TallyLedgerMapping, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<TallyLedgerMapping, "id" | "createdAt" | "updatedAt">>;

export type TallySyncBatchInput = Omit<TallySyncBatchRecord, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<TallySyncBatchRecord, "id" | "createdAt" | "updatedAt">>;

export type TallyImportedRemoteInput = Omit<TallyImportedRemoteRecord, "id" | "importedAt" | "lastSeenAt"> &
  Partial<Pick<TallyImportedRemoteRecord, "id" | "importedAt" | "lastSeenAt">>;

export type TallySyncStateUpdater = (state: TallySyncState) => TallySyncState | Promise<TallySyncState>;

export type TallySyncPersistenceErrorCode =
  | "INVALID_WORKSPACE"
  | "INVALID_STATE"
  | "UNSUPPORTED_STATE_VERSION"
  | "STORAGE_UNAVAILABLE"
  | "STATE_TOO_LARGE";

export class TallySyncPersistenceError extends Error {
  readonly code: TallySyncPersistenceErrorCode;

  constructor(code: TallySyncPersistenceErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "TallySyncPersistenceError";
    this.code = code;
  }
}

const requiredString = z.string().trim().min(1);
const nullableString = requiredString.nullable();
const nonNegativeInteger = z.number().int().nonnegative();
const finiteNumber = z.number().finite();

const tallyLedgerMappingSchema = z.object({
  id: requiredString,
  tallyLedgerName: requiredString,
  tallyLedgerGuid: nullableString,
  tallyParentName: nullableString,
  bizovixLedgerKind: z.enum(["account", "party"]),
  bizovixLedgerId: requiredString,
  bizovixLedgerName: requiredString,
  bizovixAccountId: nullableString,
  bizovixAccountCode: nullableString,
  direction: z.enum(["bidirectional", "export-only", "import-only"]),
  status: z.enum(["active", "needs-review", "disabled"]),
  createdAt: requiredString,
  updatedAt: requiredString,
});

const tallySyncBatchErrorSchema = z.object({
  code: requiredString,
  message: requiredString,
  entityType: nullableString,
  entityId: nullableString,
  tallyRemoteId: nullableString,
});

const tallySyncBatchSchema = z.object({
  id: requiredString,
  direction: z.enum(["export-to-tally", "import-from-tally"]),
  transport: z.enum(["xml-file", "tally-http"]),
  status: z.enum([
    "preparing",
    "prepared",
    "processing",
    "exported",
    "imported",
    "partially-succeeded",
    "failed",
    "cancelled",
  ]),
  companyName: requiredString,
  companyGuid: nullableString,
  dateFrom: nullableString,
  dateTo: nullableString,
  fileName: nullableString,
  checksumSha256: nullableString,
  selectedCount: nonNegativeInteger,
  successCount: nonNegativeInteger,
  skippedCount: nonNegativeInteger,
  failedCount: nonNegativeInteger,
  totalDebit: finiteNumber,
  totalCredit: finiteNumber,
  bizovixEntityIds: z.array(requiredString),
  errors: z.array(tallySyncBatchErrorSchema),
  createdById: nullableString,
  createdByName: nullableString,
  startedAt: requiredString,
  completedAt: nullableString,
  createdAt: requiredString,
  updatedAt: requiredString,
});

const tallyImportedRemoteRecordSchema = z.object({
  id: requiredString,
  tallyEntityType: z.enum(["voucher", "ledger", "stock-item", "stock-group", "unit", "godown", "cost-centre"]),
  tallyRemoteId: requiredString,
  tallyGuid: nullableString,
  tallyMasterId: nullableString,
  tallyAlterId: nullableString,
  tallyVoucherKey: nullableString,
  bizovixEntityType: requiredString,
  bizovixEntityId: requiredString,
  batchId: requiredString,
  origin: z.enum(["imported-from-tally", "exported-to-tally"]),
  status: z.enum(["active", "cancelled", "deleted"]),
  fingerprint: nullableString,
  sourceUpdatedAt: nullableString,
  importedAt: requiredString,
  lastSeenAt: requiredString,
});

const tallyCompanyIdentitySchema = z.object({
  name: requiredString,
  guid: nullableString,
  lastVerifiedAt: nullableString,
});

const tallySyncStateSchema = z.object({
  schemaVersion: z.literal(TALLY_SYNC_SCHEMA_VERSION),
  workspaceId: requiredString,
  company: tallyCompanyIdentitySchema.nullable(),
  ledgerMappings: z.array(tallyLedgerMappingSchema),
  batches: z.array(tallySyncBatchSchema),
  importedRemoteIds: z.array(tallyImportedRemoteRecordSchema),
  updatedAt: nullableString,
});

const mutationQueues = new Map<string, Promise<unknown>>();

function assertWorkspaceId(workspaceId: string) {
  const normalized = workspaceId.trim();
  if (!normalized) {
    throw new TallySyncPersistenceError("INVALID_WORKSPACE", "A workspace is required to persist Tally sync data.");
  }
  return normalized;
}

function endpoint(workspaceId: string) {
  return `/workspaces/${encodeURIComponent(workspaceId)}/app-settings/${TALLY_SYNC_APP_SETTINGS_NAMESPACE}`;
}

function storageKey(mode: Exclude<DataMode, "api">, workspaceId: string) {
  return `bizovix:tally-sync:v${TALLY_SYNC_SCHEMA_VERSION}:${mode}:${workspaceId}`;
}

function queueKey(mode: DataMode, workspaceId: string) {
  return `${mode}:${workspaceId}`;
}

function createId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}_${uuid}` : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function serializeState(mode: DataMode, state: TallySyncState) {
  let serialized: string;
  try {
    serialized = JSON.stringify(state);
  } catch (error) {
    throw new TallySyncPersistenceError("INVALID_STATE", "Tally sync data could not be serialized.", error);
  }

  const maximumBytes = mode === "api" ? API_STATE_MAX_BYTES : LOCAL_STATE_MAX_BYTES;
  const size = byteLength(serialized);
  if (size > maximumBytes) {
    throw new TallySyncPersistenceError(
      "STATE_TOO_LARGE",
      `Tally sync history is ${size.toLocaleString()} bytes; the safe limit is ${maximumBytes.toLocaleString()} bytes. Archive older sync batches before saving.`,
    );
  }
  return serialized;
}

function unwrapApiSettings(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value) && "settings" in value) {
    return (value as { settings?: unknown }).settings;
  }
  return value;
}

function parseState(value: unknown, workspaceId: string): TallySyncState {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const version = (value as { schemaVersion?: unknown }).schemaVersion;
    if (version !== undefined && version !== TALLY_SYNC_SCHEMA_VERSION) {
      throw new TallySyncPersistenceError(
        "UNSUPPORTED_STATE_VERSION",
        `Tally sync data version ${String(version)} is not supported by this application version.`,
      );
    }
  }

  const parsed = tallySyncStateSchema.safeParse(value);
  if (!parsed.success) {
    throw new TallySyncPersistenceError("INVALID_STATE", "Stored Tally sync data is invalid.", parsed.error);
  }
  if (parsed.data.workspaceId !== workspaceId) {
    throw new TallySyncPersistenceError("INVALID_WORKSPACE", "Stored Tally sync data belongs to a different workspace.");
  }
  return parsed.data;
}

function prepareState(state: TallySyncState, workspaceId: string): TallySyncState {
  if (state.workspaceId !== workspaceId) {
    throw new TallySyncPersistenceError("INVALID_WORKSPACE", "Tally sync data cannot be saved into a different workspace.");
  }
  return parseState({ ...state, updatedAt: new Date().toISOString() }, workspaceId);
}

function cloneState(state: TallySyncState) {
  return parseState(JSON.parse(JSON.stringify(state)) as unknown, state.workspaceId);
}

function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  mutationQueues.set(key, next);
  void next.then(
    () => {
      if (mutationQueues.get(key) === next) mutationQueues.delete(key);
    },
    () => {
      if (mutationQueues.get(key) === next) mutationQueues.delete(key);
    },
  );
  return next;
}

async function persistState(mode: DataMode, workspaceId: string, state: TallySyncState) {
  const prepared = prepareState(state, workspaceId);
  const serialized = serializeState(mode, prepared);

  if (mode === "api") {
    const response = await apiRequest<unknown>(endpoint(workspaceId), {
      method: "PUT",
      body: JSON.stringify({ settings: prepared }),
    });
    const responseSettings = unwrapApiSettings(response);
    return responseSettings == null ? prepared : parseState(responseSettings, workspaceId);
  }

  if (typeof window === "undefined") {
    throw new TallySyncPersistenceError("STORAGE_UNAVAILABLE", "Browser storage is unavailable for Tally sync data.");
  }

  try {
    window.localStorage.setItem(storageKey(mode, workspaceId), serialized);
  } catch (error) {
    throw new TallySyncPersistenceError("STORAGE_UNAVAILABLE", "Tally sync data could not be saved in browser storage.", error);
  }
  return prepared;
}

export function createEmptyTallySyncState(workspaceId: string): TallySyncState {
  const normalizedWorkspaceId = assertWorkspaceId(workspaceId);
  return {
    schemaVersion: TALLY_SYNC_SCHEMA_VERSION,
    workspaceId: normalizedWorkspaceId,
    company: null,
    ledgerMappings: [],
    batches: [],
    importedRemoteIds: [],
    updatedAt: null,
  };
}

/** Parse an API/file payload with full runtime validation. */
export function parseTallySyncState(value: unknown, workspaceId: string) {
  return parseState(value, assertWorkspaceId(workspaceId));
}

export async function loadTallySyncState(mode: DataMode, workspaceId: string): Promise<TallySyncState> {
  const normalizedWorkspaceId = assertWorkspaceId(workspaceId);

  if (mode === "api") {
    const response = await apiRequest<unknown>(endpoint(normalizedWorkspaceId));
    const settings = unwrapApiSettings(response);
    return settings == null ? createEmptyTallySyncState(normalizedWorkspaceId) : parseState(settings, normalizedWorkspaceId);
  }

  if (typeof window === "undefined") return createEmptyTallySyncState(normalizedWorkspaceId);

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKey(mode, normalizedWorkspaceId));
  } catch (error) {
    throw new TallySyncPersistenceError("STORAGE_UNAVAILABLE", "Tally sync data could not be read from browser storage.", error);
  }
  if (!raw) return createEmptyTallySyncState(normalizedWorkspaceId);

  try {
    return parseState(JSON.parse(raw) as unknown, normalizedWorkspaceId);
  } catch (error) {
    if (error instanceof TallySyncPersistenceError) throw error;
    throw new TallySyncPersistenceError("INVALID_STATE", "Stored Tally sync data is not valid JSON.", error);
  }
}

export function saveTallySyncState(mode: DataMode, workspaceId: string, state: TallySyncState): Promise<TallySyncState> {
  const normalizedWorkspaceId = assertWorkspaceId(workspaceId);
  return enqueue(queueKey(mode, normalizedWorkspaceId), () => persistState(mode, normalizedWorkspaceId, state));
}

/**
 * Serialized read-modify-write helper. It prevents two mutations in the same
 * browser tab from dropping each other's mapping or history changes.
 */
export function updateTallySyncState(mode: DataMode, workspaceId: string, updater: TallySyncStateUpdater): Promise<TallySyncState> {
  const normalizedWorkspaceId = assertWorkspaceId(workspaceId);
  return enqueue(queueKey(mode, normalizedWorkspaceId), async () => {
    const current = await loadTallySyncState(mode, normalizedWorkspaceId);
    const next = await updater(cloneState(current));
    return persistState(mode, normalizedWorkspaceId, next);
  });
}

function normalizeLedgerName(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function isSameTallyLedger(left: TallyLedgerMapping, right: TallyLedgerMapping) {
  if (left.id === right.id) return true;
  if (left.tallyLedgerGuid && right.tallyLedgerGuid) return left.tallyLedgerGuid === right.tallyLedgerGuid;
  return normalizeLedgerName(left.tallyLedgerName) === normalizeLedgerName(right.tallyLedgerName);
}

export function upsertTallyLedgerMapping(
  mode: DataMode,
  workspaceId: string,
  input: TallyLedgerMappingInput,
): Promise<TallySyncState> {
  const now = new Date().toISOString();
  const candidate = tallyLedgerMappingSchema.parse({
    ...input,
    id: input.id ?? createId("tally_map"),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  });

  return updateTallySyncState(mode, workspaceId, (state) => {
    const existing = state.ledgerMappings.find((mapping) => isSameTallyLedger(mapping, candidate));
    const mapping = existing ? { ...candidate, id: existing.id, createdAt: existing.createdAt } : candidate;
    return {
      ...state,
      ledgerMappings: [mapping, ...state.ledgerMappings.filter((item) => !isSameTallyLedger(item, mapping))],
    };
  });
}

export function removeTallyLedgerMapping(mode: DataMode, workspaceId: string, mappingId: string): Promise<TallySyncState> {
  const normalizedId = requiredString.parse(mappingId);
  return updateTallySyncState(mode, workspaceId, (state) => ({
    ...state,
    ledgerMappings: state.ledgerMappings.filter((mapping) => mapping.id !== normalizedId),
  }));
}

export function recordTallySyncBatch(mode: DataMode, workspaceId: string, input: TallySyncBatchInput): Promise<TallySyncState> {
  const now = new Date().toISOString();
  const candidate = tallySyncBatchSchema.parse({
    ...input,
    id: input.id ?? createId("tally_batch"),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  });

  return updateTallySyncState(mode, workspaceId, (state) => {
    const existing = state.batches.find((batch) => batch.id === candidate.id);
    const batch = existing ? { ...candidate, createdAt: existing.createdAt } : candidate;
    return { ...state, batches: [batch, ...state.batches.filter((item) => item.id !== batch.id)] };
  });
}

function isSameRemoteRecord(left: TallyImportedRemoteRecord, right: TallyImportedRemoteRecord) {
  return left.tallyEntityType === right.tallyEntityType && left.tallyRemoteId === right.tallyRemoteId;
}

export function markTallyRemoteImported(
  mode: DataMode,
  workspaceId: string,
  input: TallyImportedRemoteInput | TallyImportedRemoteInput[],
): Promise<TallySyncState> {
  const now = new Date().toISOString();
  const candidates = (Array.isArray(input) ? input : [input]).map((item) =>
    tallyImportedRemoteRecordSchema.parse({
      ...item,
      id: item.id ?? createId("tally_remote"),
      importedAt: item.importedAt ?? now,
      lastSeenAt: now,
    }),
  );

  return updateTallySyncState(mode, workspaceId, (state) => {
    const next = [...state.importedRemoteIds];
    for (const candidate of candidates) {
      const index = next.findIndex((item) => isSameRemoteRecord(item, candidate));
      if (index < 0) {
        next.push(candidate);
        continue;
      }
      next[index] = {
        ...candidate,
        id: next[index].id,
        importedAt: next[index].importedAt,
      };
    }
    next.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
    return { ...state, importedRemoteIds: next };
  });
}

export function findTallyRemoteRecord(
  state: TallySyncState,
  tallyEntityType: TallyRemoteEntityType,
  tallyRemoteId: string,
) {
  const normalizedRemoteId = tallyRemoteId.trim();
  return state.importedRemoteIds.find(
    (record) => record.tallyEntityType === tallyEntityType && record.tallyRemoteId === normalizedRemoteId,
  );
}
