export type CategoryType = "VENDOR" | "MATERIAL" | "SUBCONTRACTOR_TRADE" | "DOCUMENT_PURCHASE";
export interface StoreProfile { environmentId: string; organizationId: string; userId: string; deviceId: string }
export interface CategoryInput { type: CategoryType; name: string; description?: string | null; isActive?: boolean }
export interface Category { id: string; type: CategoryType; name: string; description: string | null; isActive: boolean; version: number; createdAt: string; updatedAt: string }
export interface CategoryView extends Category {
  syncStatus: "SYNCED" | "PENDING" | "REJECTED";
  operationId?: string;
  syncError?: { kind: string; message: string };
  cloudCategory?: Category;
}
export interface SyncCommand {
  operationId: string; deviceId: string; schemaVersion: 1;
  commandType: "masterCategory.create" | "masterCategory.update";
  entityId: string; expectedVersion: number | null; payload: Required<CategoryInput>;
}
export type CategoryChange = { kind: "upsert"; category: Category } | { kind: "delete"; id: string };
export type MasterEntityType = "uom" | "paymentTerm" | "organizationMaster";
export interface UomInput { code: string; name: string; symbol?: string | null; isActive?: boolean | null }
export interface PaymentTermInput { name: string; days?: number | null; description?: string | null; isActive?: boolean | null }
export interface OrganizationMasterInput { shortName: string; fullName: string }
export interface UomPayload { code: string; name: string; symbol: string | null; isActive: boolean }
export interface PaymentTermPayload { name: string; days: number; description: string | null; isActive: boolean }
export interface OrganizationMasterPayload { shortName: string; fullName: string }
export interface OrganizationQueryIndex { formatVersion: 1; orderedIds: string[]; caseMappings: Array<[string, string]> }
export interface MasterMetadata { id: string; version: number; createdAt: string; updatedAt: string }
export interface MasterInputs { uom: UomInput; paymentTerm: PaymentTermInput; organizationMaster: OrganizationMasterInput }
export interface MasterPayloads { uom: UomPayload; paymentTerm: PaymentTermPayload; organizationMaster: OrganizationMasterPayload }
export type MasterRecord<T extends MasterEntityType = MasterEntityType> = MasterPayloads[T] & MasterMetadata;
export type MasterView<T extends MasterEntityType = MasterEntityType> = MasterRecord<T> & {
  syncStatus: "SYNCED" | "PENDING" | "REJECTED"; operationId?: string;
  syncError?: { kind: string; message: string }; cloudRecord?: MasterRecord<T>;
};
export interface MasterCommand<T extends MasterEntityType = MasterEntityType> {
  operationId: string; deviceId: string; schemaVersion: 1; entityType: T;
  commandType: T extends "organizationMaster" ? "organizationMaster.create" : `${T}.create` | `${T}.update`; entityId: string;
  expectedVersion: number | null; payload: MasterPayloads[T];
}
export interface MasterChange<T extends MasterEntityType = MasterEntityType> {
  kind: "upsert"; record: MasterRecord<T>; cursor?: string; operationId?: string | null;
}
export function normalizeMasterInput<T extends MasterEntityType>(entityType: T, input: MasterInputs[T], current?: MasterRecord<T>): MasterPayloads[T];
export interface StoreStatus {
  schemaVersion: number; profile: StoreProfile; databasePath: string;
  pendingCount: number; rejectedCount: number; cursor: string | null;
}
export class DesktopStoreError extends Error { readonly code: string }
export function inspectDesktopBackup(file: string, profile: StoreProfile): { schemaVersion: number; profile: StoreProfile; pendingCount: number; rejectedCount: number };
/** Storage only: the caller must enforce authenticated profile binding and offline permissions. */
export class DesktopStore {
  constructor(options: { rootDirectory: string; profile: StoreProfile });
  close(): void;
  status(): StoreStatus;
  backup(destination: string): Promise<{ path: string; sha256: string; size: number }>;
  listCategories(type?: CategoryType): CategoryView[];
  stageCategoryCreate(payload: CategoryInput): { category: CategoryView; command: SyncCommand };
  stageCategoryUpdate(id: string, payload: CategoryInput, options?: { authorizeCommand?: (commandType: SyncCommand["commandType"]) => void }): { category: CategoryView; command: SyncCommand };
  pendingCommands(limit?: number): SyncCommand[];
  rejectedCommands(limit?: number): Array<SyncCommand & { rejection: { kind: string; message: string } }>;
  acceptCommand(operationId: string, category: Category): void;
  rejectCommand(operationId: string, kind: string, message: string): void;
  applyCategorySnapshot(categories: Category[], cursor: string | null): void;
  applyCategoryChanges(changes: CategoryChange[], cursor: string | null): void;
  readCursor(): string | null;
  listMasters<T extends MasterEntityType>(entityType: T, options?: { includeLocalDrafts?: boolean }): MasterView<T>[];
  stageMasterCreate<T extends MasterEntityType>(entityType: T, payload: MasterInputs[T]): { record: MasterView<T>; command: MasterCommand<T> };
  stageMasterUpdate<T extends Exclude<MasterEntityType, "organizationMaster">>(entityType: T, id: string, payload: MasterInputs[T], options?: { authorizeCommand?: (commandType: MasterCommand<T>["commandType"]) => void }): { record: MasterView<T>; command: MasterCommand<T> };
  stageMasterCreateRevision<T extends MasterEntityType>(entityType: T, id: string, payload: MasterInputs[T], options?: { authorizeCommand?: (commandType: `${T}.create`) => void }): { record: MasterView<T>; command: MasterCommand<T> };
  pendingMasterCommands<T extends MasterEntityType>(entityType: T, limit?: number): MasterCommand<T>[];
  acceptMasterCommand<T extends MasterEntityType>(operationId: string, record: MasterRecord<T>): void;
  rejectMasterCommand(operationId: string, kind: string, message: string): void;
  applyMasterSnapshot<T extends MasterEntityType>(entityType: T, records: MasterRecord<T>[], cursor: string | null, queryIndex?: OrganizationQueryIndex): void;
  applyMasterChanges<T extends MasterEntityType>(entityType: T, changes: MasterChange<T>[], cursor: string | null, queryIndex?: OrganizationQueryIndex): void;
  readOrganizationQueryIndex(): OrganizationQueryIndex | null;
  readMasterCursor(entityType: MasterEntityType): string | null;
}
/** Rejects excess scale/precision; never rounds or converts decimal amounts through Number. */
export function canonicalDecimal(input: string, precision: number, scale: number): string;
export function decimalAdd(left: string, right: string, precision: number, scale: number): string;
