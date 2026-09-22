# Desktop storage

Real local persistence for Categories, Units of Measurement, Payment Terms and Organizations / Clients. Organizations retain the existing create/read workflow; accepted organizations cannot be edited. This package does not convert the other ERP modules to SQLite or implement cloud authorization. The local service must verify its signed-in account, device identity, offline grant, and permissions before opening or using a store.

The package has no external dependencies. It uses `node:sqlite` and requires Node 24.13 or newer. Test the actual packaged Electron runtime separately: the development Node version does not establish Electron driver availability, ABI compatibility, or release readiness.

```js
import { DesktopStore } from "@bizovix/desktop-storage";

const store = new DesktopStore({
  rootDirectory: absoluteApplicationDataDirectory,
  profile: { environmentId, organizationId, userId, deviceId },
});
const { category, command } = store.stageCategoryCreate({ type: "MATERIAL", name: "Steel" });
```

Each environment/company/user/device tuple has its own SHA-256-named directory and bound metadata. The database is not encrypted by this package; filesystem/OS access and authentication remain separate controls. Do not place the store in installation resources or a shared/network/OneDrive folder.

The connection enables foreign keys, WAL, `synchronous=FULL`, and a five-second busy timeout. All local command, draft, and entity writes commit in one `BEGIN IMMEDIATE` transaction. Outbox payloads and identities are immutable and retained; pending updates cannot replace another pending operation for the same entity. Returned objects can be modified without altering the stored command.

Accepted cloud categories and local overlays are separate. Incoming snapshots and changes update accepted visibility and the cursor atomically. Pending/rejected input stays visible until its own command is accepted or the user revises a rejected input. Revision adds a new command while retaining the rejected one; a revised rejected creation remains a create command using its original entity ID. A new local category has version 0; cloud-accepted versions must be positive integers.

Draft rows include `cloudCategory` when an accepted visible record exists. The categories workspace can compare these accepted values with the local edit. Selectors used by cloud-only modules must use `cloudCategory` for a draft row and exclude unsynced creations, so a local-only category ID is not sent to an online business service. Cloud `createdAt` is preserved exactly; downloaded records without a creation date are not assigned a fabricated date. An older pilot projection can receive that real field from a fresh snapshot without changing its business version.

`stageCategoryUpdate` accepts an optional synchronous `authorizeCommand` callback. It runs before any write after selecting the actual command kind. The local service uses it so a correction to a rejected creation checks create permission, whereas an edit of an accepted category checks update permission. A thrown authorization error rolls back the transaction without adding an outbox entry.

Only definitive cloud rejections should call `rejectCommand`. A network failure or unknown commit result must leave the original operation pending for idempotent replay. The sync coordinator must bind acknowledgements to the original request/account/device and serialize cursor application; opaque cursors are not ordered by this package. Delete changes alter accepted visibility and preserve local command history. Do not replay stale delete events out of cursor order.

Startup first inspects existing stores read-only, checks application/profile identity, rejects newer schemas, verifies migration checksums, and performs integrity/FK checks. It never resets or replaces an unknown, corrupt, mismatched, or newer store. Migration 2 adds the UOM/Payment Term projections, immutable commands, drafts and independent cursors. Migration 3 adds a separate OrganizationMaster table family without rebuilding the earlier tables. The original migration 1 and 2 SQL/checksums are unchanged. Before upgrading a v1/v2 store, startup exclusively reserves a separate SQLite snapshot, verifies and fsyncs it, then applies additive migrations transactionally. Tests cover populated older stores, unchanged command bytes and schemas, retained backups, and failed backup durability checks that leave the original version intact. Uninstall/update tooling must preserve the profile directory.

`listMasters`, `stageMasterCreate`, `pendingMasterCommands`, `acceptMasterCommand`, `rejectMasterCommand`, `applyMasterSnapshot`, `applyMasterChanges` and `readMasterCursor` support `uom`, `paymentTerm` and `organizationMaster`. Their draft overlays use `cloudRecord`; `listMasters(type, { includeLocalDrafts: false })` returns only authoritative accepted records for cloud-backed selectors. `stageMasterUpdate` supports only UOM and Payment Terms. Existing UOM codes stay immutable, omitted optional values are retained, and explicit empty/null text is distinguished from omission. New UOM/Payment Term commands reject whitespace-only names/codes; accepted legacy blank fields remain readable.

Organization inputs retain the original exact `shortName`/`fullName`, including case and whitespace, with required-string and Unicode-character length limits of 50/200. Short-name duplicate checks are case-sensitive. `stageMasterCreateRevision(type, id, payload, { authorizeCommand })` corrects only a rejected local creation: it keeps the original entity ID and creation date, creates a new immutable command, and preserves the old rejected operation. Any accepted record, including a hidden projection, prevents this revision. The caller must explicitly authorize the actual create command. Financial repositories and arbitrary JSON/HTTP command replay are not implemented.

`backup(absoluteNewFile)` exclusively reserves a new target, takes an online SQLite snapshot, reopens it read-only, verifies integrity/profile/migrations, and returns its SHA-256 and size. Existing paths are refused. A failed backup may leave its reserved candidate file for diagnosis; it is not a verified backup. The store cannot close while backup verification is in progress. This is database backup only; attachment backup and a user-facing restore workflow are outside this package.

`inspectDesktopBackup(absoluteFile, profile)` performs the same schema/profile/integrity checks without opening a writable store. Bundle hashes, standalone-file validation, encrypted vault backup, daily scheduling and recovery into a new directory belong to `apps/desktop/local-service/src/backups.mjs`.

`canonicalDecimal` and `decimalAdd` use exact decimal strings and BigInt arithmetic. They preserve declared precision/scale including Decimal(24,6), reject excess fractional digits, and never round or convert monetary values through Number. They are a codec foundation; the package does not yet implement financial repositories, decimal SQL aggregates, numeric ordering, or the ERP accounting flows.

Run the temp-only tests with:

```powershell
node --test packages/desktop-storage/test/*.test.mjs
```

In an environment that blocks test worker process creation, Node 24 can run the same cases without a child process:

```powershell
node --test --test-isolation=none packages/desktop-storage/test/*.test.mjs
```

Tests create new OS temporary directories, never read `.env`, never connect to PostgreSQL, and never use the application's user-data directory.
