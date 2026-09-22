# Offline desktop sync, authorization and financial rules

Status: **full-product architecture proposal and implementation checklist**. Categories, Units of Measurement and Payment Terms now have local storage and cloud synchronization; see [implementation status](implementation-status.md). Financial offline sync and the full product described here are not complete.

Prepared against the repository inspected on 2026-09-21. This document does not change the PostgreSQL datasource, migrate customer data, enable offline business writes or establish a running cloud service. References describe the inspected code; proposed paths and model names below do not imply those components already exist.

The target product is an Electron desktop application with local SQLite storage, a NestJS cloud API backed by PostgreSQL, and an authenticated mobile/web view of accepted cloud data. Installation must create the local storage automatically. Customers must not install PostgreSQL or configure database connection strings.

## 1. Safety contract

1. Existing PostgreSQL records, identifiers, balances, audit history and uploaded files remain intact throughout development. No reset, seed, destructive schema replacement or automatic deletion of the legacy database is part of this migration.
2. Business services remain the authority on permission checks, workflow transitions, accounting entries, inventory effects and project lifecycle restrictions. Sync is another entry point into those rules, not a generic table upload endpoint.
3. A locally saved entry and an accepted cloud posting are separate states. The UI must make the difference visible without losing the user's work.
4. Every acknowledged local save must include its durable sync intent in the same SQLite transaction. Every accepted cloud command must include its durable receipt and change event in the same PostgreSQL transaction as the business effect.
5. Retries must retain the original operation identity. A retry cannot allocate another receipt, payment, journal, inventory movement or voucher number.
6. Amounts and quantities retain exact decimal semantics and their existing scale. Never transport monetary values through JavaScript floating-point calculations merely to fit SQLite.
7. Rollback means restoring a verified application/database pair and reconciling commands. It does not mean replacing a database with an older file while ignoring newer cloud effects.
8. No software can guarantee the absence of every hardware or database failure. Release acceptance is based on recovery tests, observed durability, business parity and controlled rollout, not that promise.

## 2. Existing implementation and change map

| Existing path | Verified responsibility | Proposed work |
| --- | --- | --- |
| `packages/database/prisma/schema.prisma` | PostgreSQL domain models, tenant relations, monetary columns and financial uniqueness constraints | Keep cloud schema. Add sync metadata through additive migrations; define SQLite migrations separately. |
| `apps/api/src/modules/prisma/prisma.service.ts` | One generated PostgreSQL Prisma client | Keep cloud client; do not replace its provider globally to obtain a desktop database. |
| `apps/api/src/modules/auth/auth.service.ts` | Login, refresh-token rotation, active user/membership/role lookup | Add authenticated device registration and offline grants through an explicit service; keep cloud membership validation. |
| `apps/api/src/modules/auth/strategies/jwt-access.strategy.ts` | Reloads active user and organization permissions on authenticated requests | Reuse on sync endpoints. Never trust a client-supplied role or organization. |
| `apps/api/src/common/guards/permissions.guard.ts` | Route permission enforcement | Apply equivalent permission mapping to each registered sync command and read projection. |
| `apps/api/src/modules/vendor-licensing/vendor-license-client.controller.ts` | Public license key/device ID activation, verification and heartbeat | This is not tenant authentication. Bind a licensed installation to an authenticated organization before granting data access. |
| `apps/api/src/modules/vendor-licensing/vendor-license-client.service.ts` | Server-side license assessment and device limit enforcement, including a PostgreSQL row lock during activation | Retain cloud-only enforcement; add signed offline entitlement response through the authenticated registration flow. |
| `packages/api-client/src/http-client.ts` | Fetch-based HTTP transport and access-token refresh | Add explicit desktop transport routing for approved local commands. Do not queue every failed HTTP mutation automatically. |
| `packages/api-client/src/token-storage.ts` | Renderer localStorage token persistence | Desktop credentials move behind narrowly scoped Electron IPC and OS-protected main-process storage. Browser/mobile token policy remains a separate decision. |
| `apps/desktop/electron/src/main.ts` and `preload.ts` | Electron window and renderer bridge with context isolation and Node integration disabled | Supervise `apps/desktop/local-service`, establish its private startup/session channel, and broker device credentials through `electron/src/security`. Keep SQLite and sync work in the local service; maintain the renderer isolation boundary. |
| `apps/api/src/modules/master-categories/` | Small tenant-scoped reference-data service and DTO/controller | First business pilot; make its service transaction-aware and add stable identity/version guards. |
| `apps/api/src/modules/audit-logs/audit-log.service.ts` | Audit writer can accept a Prisma transaction | Ensure approved sync handlers pass the same transaction as the domain mutation. |
| `apps/api/src/modules/accounting/accounting.service.ts` | Journal balancing, ledger validation, source deduplication and reversal | Retain these rules. Refactor command transaction boundaries only after regression coverage exists. |
| `apps/api/src/modules/cash-bank/cash-bank.service.ts` | Balance updates and financial transaction creation | Preserve atomic posting. Introduce stable command/source IDs for entry points that currently generate a new source ID per call. |
| `apps/api/src/modules/receipts/receipts.service.ts` | Receipt allocation and serializable transactions | Keep allocation business checks and transaction isolation; make receipt creation replay-safe. |
| `apps/api/src/modules/project-bills/project-bills.service.ts` | Project locks and serializable bill certification workflow | Cloud finalization in the initial offline release; preserve certification rules. |
| `apps/api/src/modules/prisma/project-lifecycle-guard.service.ts` | Prevents operational mutations on completed, archived or cancelled projects | Recheck when accepting queued changes; an old offline snapshot cannot override a later closure. |
| `apps/api/src/modules/sales-quotations/sales-quotations.service.ts` and `apps/api/src/modules/work-ious/work-ious.service.ts` | Existing compare-and-swap version checks | Reuse the version contract and extend it to approved command types. |
| `apps/api/src/modules/settings-numbering/numbering.service.ts` | Shared number configuration and PostgreSQL atomic number allocation | Keep final numbers cloud-authoritative initially. Verify all called helpers use the supplied transaction; `next()` currently calls `ensureDefaults()` on the root client. |
| `apps/api/src/modules/documents/document-storage.service.ts` | API-local file storage behind an adapter | Add file-transfer state and durable storage configuration; future cloud object storage can retain the adapter contract. |
| `apps/api/src/app.module.ts` | Module registration and global auth/permission guards | Register a new authenticated sync module only after its schema and tests exist. |

Proposed new component boundaries:

```text
packages/types/                          shared command/sync/session types and versioned result contracts
packages/validation/                     shared command payload and protocol validation
packages/domain/                         extracted pure rules when needed by both runtimes
packages/desktop-storage/                SQLite repositories, migrations, outbox/inbox, cursors and backups
apps/desktop/local-service/              local command/query handlers and background sync worker
apps/desktop/electron/src/security/       device credentials, offline grants and profile isolation
apps/desktop/electron/src/preload.ts      constrained renderer process bridge
apps/api/src/modules/sync/                authenticated command registry, receipts and change feed
apps/api/src/modules/sync/desktop-devices* organization-bound device registration/grant controller and service
packages/database/prisma/migrations/     additive cloud sync metadata migrations
```

These boundaries follow the canonical [implementation map](README.md). Extend the existing `packages/types` and `packages/validation` packages instead of introducing a separate sync-contract package. `packages/desktop-storage` owns persistence and transaction primitives, including persisted conflict/attachment metadata; `apps/desktop/local-service` coordinates commands, queries, sync retries and pull application through that package. Electron main/security/preload own the process and credential boundary rather than a second business-service or SQLite implementation. The `desktop-devices*` notation names proposed files within the sync module, not another top-level module. If implementation changes the canonical map, update both documents together.

## 3. Identity, authorization and local profiles

### Cloud authority

`OrganizationUser` associates users with an organization and role. Cloud sync derives `organizationId` and `userId` from the authenticated session. A command body may identify an entity but cannot choose its tenant, author or effective permission set.

For each push and pull, check active user, active membership, current permission scope, registered device state and subscription/entitlement policy. Device registration must prove control of a generated device key and bind it to the authenticated organization. A hostname, hardware fingerprint, license key or random device ID alone is insufficient authorization.

The existing vendor licensing domain is intentionally separate from tenant authentication. `VendorCustomer.organizationId` is an optional string with no foreign key. Establish and verify an explicit binding before a vendor activation can grant organization access. Do not infer ownership from matching email addresses or accept an organization ID submitted by an unauthenticated activation request.

### Local profiles

Use an application-owned directory beneath Electron `userData`. Identify a profile by a canonical cloud-environment identifier, organization ID and user ID; persist the registered device identity separately. Use generated or hashed path components instead of untrusted names. Development, staging and production must not share a queue or profile accidentally.

The default is separate user profiles, even when two people use the same Windows login. Each profile contains only the data that user is allowed to read. A shared company database inside a single Windows account requires a separately reviewed authorization/encryption design; a UI filter is not sufficient isolation.

The renderer cannot execute arbitrary SQL, choose filesystem paths, read device private keys or invoke arbitrary HTTP requests carrying privileged credentials. IPC exposes allowlisted, validated operations. Main-process handlers validate sender/window origin and active profile.

Store refresh credentials and private key material using OS-protected storage through Electron main. Electron `safeStorage` encrypts selected values; it does not encrypt a SQLite database or automatically protect its backups. Full database encryption, key recovery and cross-user protection require a separate implementation and threat-model decision. See [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

### Offline grants

After online authentication and device registration, issue a cloud-signed grant containing its ID, issuer/audience, user, organization, device-key identifier, permission revision, allowed offline capabilities, schema compatibility, issued time and expiry. The desktop verifies with an embedded public key. Do not ship the cloud signing secret, reuse the server's JWT secret locally or persist cloud password hashes for offline login.

Bind a local unlock mechanism to the enrolled profile and protect its verifier/key material. Refreshing the grant is an online operation. Clock rollback detection and last trusted server time are useful defenses, but a disconnected client cannot learn a new server-side revocation immediately. The approved offline window is a product/security policy; it must be explicit before release rather than hidden in code.

At grant expiry, pause new operations that require the expired grant and preserve all saved work. Provide an authenticated recovery/reconnection path. A subscription problem must not erase customer data or silently drop its queue.

On logout or account change, close the active profile and stop its sync worker. Do not relabel its queued commands with the next user. Its original actor remains attached permanently. If the actor loses access, a support/admin reconciliation workflow may inspect command status under separately authorized access; another user's normal login cannot silently replay the command as their own.

## 4. Proposed durable metadata

The following are logical schemas, not a Prisma patch. Every foreign key and uniqueness constraint must be reviewed in the actual migration.

### Cloud PostgreSQL

| Model | Principal fields and constraints | Purpose |
| --- | --- | --- |
| `DesktopDevice` | ID, organization ID, public key/key ID, enrollment actor, status, supported protocol, registration/revocation times | Authenticated organization-bound installation; membership is still checked for every actor. |
| `DesktopDeviceUser` | Device ID, user ID, organization ID, enrollment/revocation state | Optional explicit enrollment binding for multiple user profiles on one registered installation. |
| `OfflineGrant` | ID, organization/user/device IDs, permission revision, issued/expiry times, revocation state | Auditable signed capability issuance; grants contain no cloud secrets. |
| `SyncOperationReceipt` | Organization/device/operation IDs, original user ID, canonical request hash, command/schema version, resulting entity ID/version, outcome and response, committed time | Unique `(organizationId, deviceId, operationId)`; durable deduplication and acknowledgement lookup. |
| `TenantSyncClock` | Organization ID primary key, epoch, last committed sequence | Transactional serialization point for a commit-ordered pilot change feed. |
| `SyncChange` | Organization ID, epoch, sequence, event ID, entity type/ID/version, operation ID, event kind, minimum read scope | Unique `(organizationId, epoch, sequence)`; authorized changes, invalidations and tombstones. |
| `DeviceSyncCursor` | Organization/user/device IDs, epoch, permission revision, last acknowledged applied sequence | Tracks applied progress and permits retention decisions. An acknowledgement cannot exceed the cursor issued to that profile. |
| `SyncSnapshot` | Snapshot ID, bound profile/scope, epoch, permission revision, high-water sequence, artifact integrity and expiry | Consistent, paged bootstrap or resnapshot without holding a database transaction open across client requests. |
| `AttachmentTransfer` | Organization, actor/device, attachment ID, expected byte count/hash, storage key, upload state and verified time | Idempotent binary transfer and authorized linking. |

Receipt identities must survive change-log pruning. If full historical response bodies are archived, retain a minimal immutable acceptance/deduplication record and a supported result lookup. Never expire receipts while a device is still allowed to retry old commands; re-enrollment or an old-device rejection boundary must precede any such expiry.

### Local SQLite

These tables and their migrations/repositories belong to `packages/desktop-storage`; application policy and sync orchestration belong to `apps/desktop/local-service`.

| Table family | Purpose |
| --- | --- |
| `local_profile` / `device_metadata` | Immutable tenant/user/environment binding, local installation identity and protocol compatibility. |
| `schema_migrations` | Applied migration ID, checksum, application version and completion metadata. |
| Domain projection tables | Last accepted cloud state with stable entity IDs and server versions; typed local fields preserve precision and relationships. |
| `pending_commands` | Original command ID, actor/device scope, canonical payload/hash, expected version, dependencies, order, lifecycle and retry metadata. |
| Pending draft/overlay tables | User changes layered over accepted projections without replacing them. |
| `sync_conflicts` | Original input, accepted cloud version, validation/conflict reason and explicit resolution history. |
| `sync_cursors` | Current epoch, permission revision and atomically applied server cursor. |
| `sync_inbox` | Persisted event/group identities needed for idempotent pull application and incomplete-group recovery. |
| `attachment_manifest` / transfer queue | Local durable file references, byte count/hash and upload/download/link state. |

Use `QUEUED`, `IN_FLIGHT`, `ACCEPTED`, `CONFLICT`, `REJECTED` and `BLOCKED_DEPENDENCY` as distinguishable states, or equivalent explicit names. An interrupted in-flight operation becomes retryable with the same ID. A business rejection is not repeatedly retried as a connectivity failure.

## 5. Push API and durable single business effects

Proposed endpoints, all authenticated except the existing login/refresh surfaces:

| Route | Contract |
| --- | --- |
| `POST /api/v1/desktop-devices/register` | Bind device key to authenticated organization and entitled installation. |
| `POST /api/v1/desktop-devices/offline-grant` | Issue/renew a signed grant under fresh membership and entitlement checks. |
| `POST /api/v1/sync/commands` | Bounded ordered batch of allowlisted commands, with per-command results. |
| `GET /api/v1/sync/operations/:operationId` | Authorized status/receipt lookup for the bound device and original actor. |
| `POST /api/v1/sync/snapshots` | Create a consistent snapshot for the current scope. |
| `GET /api/v1/sync/snapshots/:id/pages/:page` | Retrieve verified snapshot pages bound to the same identity and scope. |
| `GET /api/v1/sync/changes?cursor=...` | Ordered authorized change page with an opaque next cursor. |
| `POST /api/v1/sync/ack` | Acknowledge a cursor after successful local transactional application. |
| `POST /api/v1/sync/attachments/initiate` and related complete/status endpoints | Authorized resumable file-transfer workflow. |

Example command envelope:

```json
{
  "operationId": "stable-client-generated-uuid",
  "deviceId": "registered-device-id",
  "schemaVersion": 1,
  "commandType": "masterCategory.create",
  "entityId": "stable-client-generated-entity-id",
  "expectedVersion": null,
  "dependsOn": [],
  "payload": { "type": "MATERIAL", "name": "Example category", "isActive": true }
}
```

A command registry binds type, DTO validation, minimum permission, handler, result serializer and supported schema version. Reject unknown commands, extra privileged fields, excessive batches and unsupported versions before domain mutation.

Transport delivery is at least once. The design target is one durable business effect per accepted operation, not an assumption that the network delivers exactly once.

### Cloud transaction algorithm

1. Authenticate and perform outer request/device checks. Canonicalize the validated envelope and compute a server-side hash including command type, payload, entity ID, expected version, dependencies and schema version. Do not hash a client-provided digest without verifying it.
2. Start the module-appropriate transaction. Recheck transaction-sensitive authorization/device state using the same ordering/locks as membership and device revocation writers. A permission revision or locking protocol must prevent stale authorization from being accepted across a concurrent revocation.
3. Acquire the tenant clock row first for pilot writes. Every participating REST/web/sync writer follows this same lock ordering. Check receipt identity under this serialization boundary before allocating any number or domain source ID.
4. An existing receipt with the same actor and hash returns the stored authorized result. A different actor, command or hash under the same ID is rejected. A revoked actor does not regain read access merely because a receipt exists.
5. Invoke the real service handler with a supplied transaction and stable identifiers. Recheck references, expected versions, project lifecycle and all financial/workflow rules. Do not call a normal controller that opens and commits an unrelated transaction.
6. Write mutation, audit, receipt and ordered change event through that transaction. Increment `TenantSyncClock.lastSequence` transactionally; hold the clock lock until commit. All paths that produce relevant changes participate.
7. Commit before returning `ACCEPTED`. A process/network failure before commit rolls everything back; one after commit leaves a durable receipt for the next retry.
8. Serialization/deadlock retries rerun the entire transaction with the same command identity, bounded backoff and fresh reads. Do not perform email, uploads or other external side effects inside this retryable transaction; use a separately idempotent server outbox for those effects.

For a deterministic business rejection/conflict, preserve the command and its reason locally. If rejection outcomes are retained server-side, store them without committing a partial domain write. A deliberately revised command receives a new operation ID and records which command it supersedes. Temporary infrastructure failures remain retryable.

The tenant lock is a deliberately simple pilot correctness boundary. It limits write concurrency within one organization and requires short transactions. Before increasing concurrency, replace it only with a reviewed commit-ordered feed design and equivalent uniqueness/authorization guarantees. Do not remove the lock while continuing to assume an ordinary sequence is commit-ordered.

### Isolation and service adaptation

Existing receipts and bill certification use serializable transactions; retaining that behavior matters. PostgreSQL serializable execution can require complete transaction retries. Ordinary sequences are not transactional counters and cannot alone establish commit order. See [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

Use one transaction owner per command. Existing services can expose an internal `execute...WithinTransaction(tx, context, input)` operation while the normal HTTP method opens a transaction and calls it. Do not emulate atomicity by committing a business service first and adding a sync receipt afterward. Helpers called by the handler must honor its transaction; inspect number allocation, audit, account setup, notifications and attachment linking for root-client calls.

Category name checks currently use case-insensitive matching while their unique key uses the stored name. Serialize participating category writers and preserve matching semantics; define and test a normalized uniqueness policy before increasing concurrency. Do not introduce an aggressive normalization that merges existing customer categories automatically.

## 6. Local-first reads, saves and conflicts

Render the last accepted projection with a pending overlay for the active user. Local save validates the approved domain rules, then writes the draft/overlay and command in one short SQLite transaction. Return success only after commit. Sync I/O occurs outside that transaction.

SQLite permits one simultaneous writer; use a dedicated local writer/worker, bounded busy handling and explicit transactions rather than several independent writers hidden behind UI components. Never leave a write transaction open while waiting for cloud responses. See [SQLite transactions](https://www.sqlite.org/lang_transaction.html).

When push accepts a command, atomically store its cloud result/version, mark that exact command accepted and reconcile its overlay. A lost acknowledgement retries the same ID. Pulling a record changed by another device updates the accepted projection but does not overwrite local input. If a new cloud version invalidates an overlay, store a conflict containing both versions and the user's original values.

Commands that depend on another local create reference stable IDs and explicit dependencies. Submit in dependency order. If a parent is rejected, block dependent commands; do not generate different IDs or drop the child input. When a second edit is made before the first is acknowledged, either keep a mutable unsent draft outside the durable command boundary or create a new dependent command with an explicit base-version resolution rule. Never modify the payload behind an operation ID already eligible for transmission.

Local lists and reports distinguish accepted amounts from pending amounts. A combined preview can be useful, but must not masquerade as a final ledger, bank balance, stock balance or mobile report. Conflict resolution is an auditable user action, with no silent replacement of authoritative records.

## 7. Pull ordering, snapshots, retention and permission changes

### Commit-ordered cursor

A naive `id > lastId` feed backed by a sequence can miss a transaction that obtains a lower ID and commits after a higher ID has already been delivered. For the pilot, every approved cloud write locks the same tenant clock, allocates its feed sequence within that transaction and holds the lock to commit. Allocation and business changes therefore share commit order within that organization.

Cursor contents are server-owned and bound to tenant, epoch, user/read scope and permission revision. A page reports its highest scanned position, including events omitted by authorization filtering; it must not leak their payloads. Pull application updates projections, tombstones and cursor in one local transaction. Only then acknowledge that cursor to the server.

Store immutable event payloads or versioned invalidations with a specified fetch contract. Do not label an arbitrary current row as the historical version of an older event. Multi-row business effects are delivered/applied as one bounded operation group, or mark an incomplete group so intermediate states cannot appear as a balanced final report.

### Consistent bootstrap

Create a materialized snapshot from one consistent PostgreSQL snapshot with its matching committed high-water sequence and permission revision. It must cover only authorized projections. Paginate the materialized result; do not take each page from a newly changing live query or leave a transaction open while waiting for a desktop download.

Desktop downloads into staging, verifies page counts/digests/schema, then atomically installs the accepted projection and starting cursor. Preserve pending drafts, queued commands, receipts and local attachments outside that replaced projection. Replay overlays against the new base; identify conflicts rather than blindly replaying raw rows.

### Retention and resnapshot

Configure feed retention separately from operation-receipt retention, backups and accounting retention. A device that falls behind the retained feed receives an explicit `RESNAPSHOT_REQUIRED` result; never return a newer cursor while omitting missing changes.

Before resnapshot, look up statuses for uncertain commands using their original IDs. Download a new accepted snapshot; preserve all unsent/rejected/conflicting local work. Cursor expiry is not permission to delete a customer's only copy of pending data.

If cloud is restored to an earlier backup, change the dataset epoch and enter a controlled recovery mode. Reconcile cloud receipts/financial effects with devices before accepting retries. A restored database may have lost receipts for effects already acknowledged to a client; normal sync must not guess. Maintain recoverable server transaction history/backups and document the recovery point policy.

### Deletion and authorization tombstones

Separate three events:

| Event | Meaning and local treatment |
| --- | --- |
| Domain deletion/voiding | An explicitly authorized business operation, with existing domain retention/reversal rules. Emit a tombstone or void state. Sync infrastructure must not invent a delete operation for a module that does not support it. |
| Permission/scope removal | Remove the projection from the user's accessible view or lock its encrypted profile/cache; this is not a request to delete the authoritative business record. Stop commands requiring the revoked scope. |
| Cache eviction | Storage housekeeping for acknowledged, reproducible data only; never evict an unuploaded attachment or sole pending draft. |

A user may cease to qualify for an ordinary entity event, so filtering only the entity's new state is insufficient to communicate loss of access. Permission changes must increment a scope revision and force a scoped resnapshot, or produce user-specific access-removal invalidations based on the previous visibility set. Tombstone metadata must reveal no newly unauthorized content.

Pending work affected by revocation is retained in an inaccessible/quarantined state according to the security policy and is recoverable by an authorized owner/support workflow. Keeping readable copies indefinitely after revocation is not acceptable isolation. Offline enforcement of a new revocation waits for reconnection or grant expiry; document that boundary.

## 8. Financial and workflow offline matrix

This is the proposed **initial release policy**, not a claim about implemented offline capability. Every listed offline save must still be implemented with matching validation and tested before being enabled. Cloud acceptance reruns current domain rules. Later offline finalization is a separate feature requiring a proven allocation/ownership protocol.

| Operation | Permitted locally while offline | Cloud acceptance/finalization | Conflict or rejection behavior |
| --- | --- | --- | --- |
| Master categories, units, party/item drafts | Create/edit a pending record for authorized local use; stable ID and dependencies | Uniqueness, references, permission and version checked | Preserve input; resolve duplicate/version conflict explicitly. |
| Tender entry and costing drafts | Draft entry and exact-decimal calculations; clearly provisional totals | Revalidate tender uniqueness, required fields and workflow version | Preserve draft and show changed upstream data. |
| Tender submission, approval, document purchase, security/guarantee issuance | Prepare a request; no final approval or account movement | Run existing approval, bank/instrument and accounting services | Block stale approvals or duplicate source posting. |
| Sales quotation / purchase requisition / purchase order drafts | Draft and preview; optional provisional local reference | Allocate authoritative number and apply send/approve/issue transition online | Do not imply an unaccepted order is issued. |
| Expense / general expense entry | Save a pending entry and attachments | Create payable/cash effect and journal together through service rules | Never merge payable totals or post twice on retry. |
| Cash-in, cash-out, petty expense, bank transfer | Record a pending transaction intent; show provisional balance separately | One stable source/operation ID; balance, financial transaction, journal, audit and receipt commit together | Insufficient funds or conflicting restrictions preserve the intent for review. |
| Customer receipt and bill allocation | Prepare receipt/allocation intent against cached data | Recheck outstanding amounts, allocation caps, account validity and serializable rules | Two devices allocating the same balance cannot both silently succeed. |
| Supplier payment and payable settlement | Prepare payment intent | Recheck payable/outstanding state and create all postings atomically | No last-write-wins on paid amount or balance. |
| Journal entry | Prepare balanced draft using exact decimals | Validate ledgers/control accounts, period and posting rules; finalize once | Posted journals remain immutable under existing reversal policy. |
| Posted transaction edit, cancellation or reversal | Prepare an explicit correction request if that workflow is supported | Execute reversal/replacement service with audit trail | Never overwrite or delete accepted journal/financial rows through sync. |
| Project bill calculation | Draft/preview using cached contract/BOQ/progress | Certification remains a single cloud business event with current project locks and limits | Changed BOQ, prior certification or closed work becomes a conflict. |
| Challan payment release / retention release | Prepare request and supporting files | Current approval and project lifecycle checks, then posting | Prevent duplicate release through stable identity and existing constraints. |
| GRN, stock issue, transfer and LC receipt | Draft receipt/issue and provisional stock view | Validate current stock, PO/LC limits and generate authoritative stock/cost effects | Never merge stock totals or independently accepted stock consumption. |
| Payroll calculation and depreciation | Draft calculation for a selected period | Finalize only after period/entity uniqueness and posting checks | Repeat operation returns original effect; changed inputs require explicit revision. |
| Work IOU changes | Draft and pending request with expected version | Existing version/status and related posting rules apply | Keep conflicts explicit; do not bypass version checks. |
| Bank reconciliation / opening balances / period or project close | View cached data and prepare inputs | Online-only final action in initial release | Recheck all dependencies and financial integrity. |
| Reports / dashboard / PDF preview | Read accepted cached data with last-sync indicator; preview pending separately | Mobile/web reports show accepted cloud state | A PDF representing an unaccepted document is visibly a draft. |
| Users, roles, subscriptions, device activation and numbering settings | Cached read only where permitted | Online-only authorization/control-plane changes | No offline grant may promote its own permissions. |

An offline expense record can be useful and durable without claiming that a bank payment occurred. A real-world payment made while disconnected must be entered as a pending reconciliation item and reviewed on acceptance if another device has changed the same obligation. Do not silently discard evidence of that payment when validation fails.

### Precision and numbering

Use explicit decimal string serialization and a shared exact-decimal library, or fixed-scale integers where the domain scale and safe range are defined. Monetary minor units alone are insufficient for every quantity, unit price, exchange rate or percentage in this ERP. Preserve original scale, rounding stage and totals; parity tests must cover representative existing calculations.

Stable entity and operation IDs are independent from human-facing numbers. Use clearly provisional local references until the cloud allocates the final number transactionally. Do not derive numbers from a local row count or reuse the last downloaded sequence. If offline final document numbering is later required, design reserved device ranges or another explicit allocation scheme and preserve the mapping permanently.

## 9. Attachments and documents

Binary data needs its own state machine; a successful metadata sync does not prove the file has reached the cloud.

1. Copy a selected file into an app-owned staging location, compute size/hash and flush it before atomically moving it to its durable local location. A durable manifest references that local file. A crash can leave a staged orphan, but must not produce a successful save pointing to an absent sole copy.
2. Upload via authenticated, organization-bound transfer IDs. Support retry/resume with bounded chunks and hashes. The cloud verifies complete bytes before marking a transfer ready.
3. Link a ready attachment through the existing business command and permission checks. Attachment upload does not itself authorize linking it to any entity.
4. Download files only through the user's current read scope. Verify integrity and commit the local manifest after the file is durable. Do not expose filesystem storage keys or accept path traversal through a sync request.
5. Keep unuploaded local files and failed transfers until an explicit authorized recovery/removal action. Clean only verified, unreferenced staging artifacts after a retention period; never infer deletability merely from age.

For reports generated from authoritative data, regenerate accepted PDFs from the accepted version when possible. Retain the document version and source version mapping. Required supporting attachments must be complete before the command is finalized, or the business state must explicitly remain incomplete.

## 10. Legacy data, backups and later cloud deployment

The existing PostgreSQL database is the source of truth for legacy data until a verified migration/cutover declares otherwise. A new SQLite file must not be treated as an empty replacement and then synchronized as though missing rows meant deletion.

Migration work must inventory database tables, tenant ownership, uploaded files, monetary scales, external references and user/role mappings. Take a verified PostgreSQL backup plus attachment manifest/copy. Export a consistent dataset, import into a separate staging target, preserve IDs and precision, and reconcile counts, relations, balances, posted sources and representative reports. Keep the source unchanged and available for rollback.

Avoid an unreviewed period in which the legacy database and the new cloud database both independently accept authoritative writes to the same dataset. Use a recorded cutover epoch and either a controlled freeze/reconciliation window or a proven change-capture process. Do not regenerate existing voucher numbers, synthesize posting history or upload user password/refresh-token tables into desktop profiles.

Use a supported SQLite backup API or a tested database-aware snapshot process for live local backups. Copying only the main file while writes continue is not an adequate backup procedure. Verify restore into an isolated profile, including the pending queue and required attachment manifest. See [SQLite backup API](https://www.sqlite.org/backup.html).

The cloud VPS phase comes after a local/cloud protocol pilot passes. Its deliverables include:

- Stable HTTPS API origin embedded in signed application configuration; no user-entered database host or password.
- PostgreSQL private to the server, service credentials outside installers, and deliberate staging/production separation.
- Durable attachment storage through the existing adapter, or an object-storage replacement; ephemeral deployment disk is not a backup.
- Automated PostgreSQL and attachment backups with demonstrated restoration and an explicit recovery-point policy.
- Cloud migrations, schema/protocol compatibility gates, logs that exclude credentials and customer payloads by default, and monitoring of failed/conflicting queues.
- A mobile/web authenticated interface reading the same cloud API and permissions. A disconnected PC's unaccepted changes are unavailable on mobile until sync succeeds.
- Signed desktop releases and an updater/migration policy that preserves profile data and can recover from interrupted upgrades.

No hosting account, domain, deployment, signing certificate, production secret or VPS configuration is created by this document.

## 11. Ordered implementation and verification plan

| Phase | Work | Exit evidence |
| --- | --- | --- |
| 0. Baseline and recovery | Record clean/dirty repository state; inventory data and service behavior; verify backups without resetting live data | Restore into an isolated target; baseline business reports and balances documented. |
| 1. Desktop storage boundary | Automatic profile directory, SQLite initialization, checksummed migrations, transaction manager, backup/recovery and constrained IPC | Fresh supported Windows VM with no PostgreSQL/Node/pnpm configured; app creates storage; restart, disk-full and interrupted-migration behavior verified. |
| 2. Identity and enrollment | Cloud device binding, protected credentials, offline grants, profile switching and permission revisions | Spoofed tenant/device/user rejection; expired/revoked policy; no cross-profile data or queue leakage. |
| 3. Command and feed foundations | Receipts, commit-ordered tenant clock, command registry, bootstrap/pull/cursors and overlay preservation | Crash injection before/after commits; retries/concurrency; late-commit cursor test; resnapshot with preserved pending work. |
| 4. Master Categories pilot | Transaction-aware existing service, stable IDs, versions, local drafts and accepted projection | Real service flow across two isolated devices; duplicate/case/version conflicts; web updates visible to devices; no financial modules enabled. |
| 5. Reference data and draft modules | Expand one domain at a time, including dependent IDs and exact calculations | Current online regression checks plus module-specific offline/restart/conflict tests. |
| 6. Financial command adapters | Stable command/source identity and a single transaction through balances, journals, audit and receipts | Real services and isolated data prove no duplicate effects, balanced journals, no cross-tenant writes and correct lifecycle rejection. |
| 7. Attachments and recovery | Transfer state machine, file integrity, legacy import rehearsal and cloud-restore epoch handling | Interrupted transfer, corrupted file, restored-old-cloud and restored-old-device tests retain/reconcile work. |
| 8. Packaging, VPS and mobile | Signed installer/updater, production configuration, backups, mobile cloud views and restricted rollout | Fresh-machine installation, uninstall/reinstall data-retention behavior, upgrade rollback, two devices plus mobile, and recovery drill. |

### Required failure and business scenarios

1. Local process terminates before commit, after commit and while transmitting. Acknowledged entries survive; uncommitted entries are not falsely reported saved.
2. Cloud commits but the response is lost. Retry produces the original result and no second posting or number allocation.
3. Two concurrent copies of one command arrive; a reused ID with a different payload/actor is rejected.
4. Two devices edit the same record from one base version. One succeeds and the other retains a resolvable conflict.
5. A cloud REST/mobile mutation occurs between desktop pulls. It appears in the same authorized change feed.
6. An earlier transaction is deliberately delayed while a later writer runs. The cursor cannot advance past an unseen lower-sequence committed change.
7. An account loses read/write access while a device is offline and reconnects with queued work. Fresh cloud authorization applies; pending work is preserved for authorized reconciliation.
8. A cursor expires, the permission scope changes or the cloud epoch changes. Resnapshot cannot silently drop local drafts or attachments.
9. Two devices try to settle the same bill, certify beyond remaining quantities, consume limited stock or finalize the same payroll/depreciation period. Existing domain constraints decide the outcome.
10. Replaying a financial command does not change cash balance twice and does not duplicate journal/stock/source rows. Journal debit/credit equality and protected system-ledger rules still hold.
11. A project closes after a local draft is saved. Sync rejects the prohibited operation without changing the closed project or deleting the draft.
12. Decimal/rounding parity covers money, unit prices, quantities, rates, taxes, deductions and exchange calculations.
13. Device restart, Windows restart, full disk, file lock and interrupted update produce recoverable states and clear messages.
14. Restore an older local backup against the current cloud, and restore an older cloud backup against current devices. Commands and receipts reconcile without silently recreating already accepted effects.

Use isolated databases/profiles and real business services for financial acceptance. Mock-only tests are insufficient evidence for transaction, constraint and accounting behavior. Do not reset or seed the user's active database to make tests pass.

## 12. Pilot-specific acceptance details

Master Categories currently enforces `masters.read`, `vendor.create` and `vendor.update`; preserve these existing permission keys unless an independently reviewed permission migration changes them. Preserve create defaults, trimmed names, case-insensitive duplicate checks and immutable category type during update.

The service currently writes its audit after the category mutation and has no expected-version field. Adapt both normal REST and sync paths to one shared transaction-aware operation. Add version state additively, returning it to older-compatible callers while requiring it for the new sync update command. Define how any legacy REST update obtains and checks its version so it cannot overwrite a participating sync writer silently.

Pass criteria are a new offline category surviving restart, successful cloud acceptance, visibility to a second authorized desktop/mobile read, exact-retry idempotence, rejection of spoofed tenant/device identity, retained duplicate/version conflict, web-to-desktop propagation, and intact legacy PostgreSQL data. Only then is this pilot evidence for expanding the architecture; it is not evidence that the whole ERP is offline-ready.
