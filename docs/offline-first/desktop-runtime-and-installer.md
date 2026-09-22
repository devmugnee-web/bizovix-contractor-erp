# Desktop runtime and installer migration plan

> This is the pre-implementation audit and full-product target. Runtime pilot code now exists; see [implementation status](implementation-status.md) and [validation evidence](validation-evidence.md) for current results. Historical "current state" observations below describe the original source baseline.

Status: **design and repository audit only; not implemented or release-ready.**

Audit date: 2026-09-21. This document describes the work needed for a Windows desktop installation that stores supported business data locally, synchronizes with a future cloud service, and does not ask customers to install or configure a database. No production database, existing business rule, renderer behavior, or installer was changed for this audit. No packaged application or clean-PC installation was executed. Proposed performance numbers below are acceptance targets, not measured results.

The existing PostgreSQL system remains the source of truth until a separate migration process has produced a verified local copy and the corresponding workflow has passed acceptance. Installing an empty SQLite file must never silently replace existing records or make an incomplete offline workflow look complete.

This plan follows the component boundaries in the [main migration blueprint](README.md). Read it alongside [database compatibility](database-compatibility.md), [sync/auth and financial rules](sync-auth-and-financial-rules.md), and the [validation evidence](validation-evidence.md). All four links resolve within `docs/offline-first/`.

## 1. Verified current state

| Repository location | What exists now | Consequence for the desktop release |
| --- | --- | --- |
| `apps/desktop/electron/src/main.ts` | Development loads `http://localhost:3010`; production spawns a Next server through `process.execPath` and `ELECTRON_RUN_AS_NODE=1`. | The production build depends on the bundled Electron runtime supporting this launch mode; a separate Node installation must not be required. |
| `apps/desktop/electron/src/main.ts` | Production uses fixed port 3010 and checks whether a TCP connection succeeds. | An unrelated listener can satisfy the check. Readiness must prove ownership and actual app health. |
| `apps/desktop/electron/src/main.ts` | Expects `<resources>/renderer/server.js`. | This disagrees with the actual monorepo standalone output inspected below. |
| `apps/desktop/electron/electron-builder.yml` | Copies the complete renderer standalone tree but copies static/public files into `<resources>/renderer/.next/static` and `<resources>/renderer/public`. | Assets land outside the directory of this build's actual server entry. |
| `apps/desktop/electron/electron-builder.yml` | Packages Electron `dist/**` and renderer resources; no local API or database runtime is declared. | Installing the current package cannot provide the full local ERP backend. |
| `apps/desktop/electron/src/main.ts` | BrowserWindow disables Node integration and enables context isolation and sandboxing. | Retain these settings when adding local storage. |
| `apps/desktop/electron/src/main.ts` | No single-instance lock; startup promise has no application error screen; child termination is attempted on close/quit. | Add explicit ownership, graceful shutdown, failure reporting, and restart behavior. |
| `apps/desktop/electron/src/preload.ts` | Exposes only platform and a version string. | No local data or session bridge exists yet. |
| `apps/desktop/renderer/src/config/env.ts` | Uses a build-time public API URL or derives a host with port 4000. | A packaged desktop requires runtime API discovery; a mobile website requires a cloud HTTPS endpoint. |
| `apps/desktop/renderer/next.config.ts` | Standalone output; backend rewrite targets `127.0.0.1:4000`. | This rewrite cannot identify an arbitrary desktop service port. Do not ship it as the offline routing mechanism. |
| `apps/desktop/renderer/src/components/providers/AppProviders.tsx` | Configures the API client at module load; React Query cache is in memory. | Desktop transport/session initialization must finish before requests start. Query cache is not the local database. |
| `packages/api-client/src/token-storage.ts` | Access and refresh tokens use browser localStorage. | Add a desktop credential adapter; changing renderer origins/ports must not lose desktop login state. |
| `packages/api-client/src/hooks/use-auth.ts` | Login, refresh, current user, and logout call API endpoints. | Offline sign-in/unlock requires a distinct local authenticated session and entitlement policy. |
| `apps/desktop/renderer/src/app/(dashboard)/layout.tsx` | Current-user errors redirect to login; a missing current-user response blocks the shell. | A network outage cannot remain equivalent to an invalid local session. |
| `apps/api/src/modules/documents/document-storage.service.ts` | Documents are stored relative to `process.cwd()/storage/documents`. | Installation resources are not the durable writable data directory. Attachments also require migration, backup, and sync. |
| `apps/api/src/modules/vendor-licensing/vendor-license-client.service.ts` | Online activation/validation and device records exist. | Reuse relevant contracts; signed offline user authorization and license leases are not present in this desktop integration. |
| `pnpm-lock.yaml`, Electron package manifest | No SQLite driver was found. The Electron package version is 43.4.0. | A driver/runtime decision and packaged compatibility test are still required. |

The following paths were checked directly in the existing build tree; these are build-output observations, not proof that a fresh build succeeds:

```text
apps/desktop/renderer/.next/standalone/
  server.js                                      absent
  apps/desktop/renderer/server.js                  present
  apps/desktop/renderer/.next/                     present
  apps/desktop/renderer/.next/static/              absent
  apps/desktop/renderer/public/                    absent
```

For that tree shape, preserve the traced monorepo tree and use:

```text
<resources>/renderer/apps/desktop/renderer/server.js
<resources>/renderer/apps/desktop/renderer/.next/static/
<resources>/renderer/apps/desktop/renderer/public/
```

A packaging preflight must derive/validate this layout on every fresh build, rather than relying on today's generated output. The installed Next documentation confirms that standalone output does not include `public` and `.next/static` automatically: `apps/desktop/renderer/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`.

The local development Node executable reported v24.13.0. The installed Electron package did not contain `dist` or `path.txt` during inspection; its loader can try downloading a missing binary. `pnpm-workspace.yaml` does not list `electron` in `allowBuilds`, but that alone does not establish the download failure's cause. No attempt was made to launch or repair Electron. Consequently, the version of Node actually embedded in an executable has **not** been measured here.

## 2. Target process ownership

Retain the current Next UI and Electron shell initially to reduce business/UI regression risk. Evaluate removing the Next server only after measuring a working application; a framework rewrite is not required to add SQLite safely.

```text
Electron main process
  owns application lifecycle, window, runtime discovery and credentials
  ├─ packaged Next standalone process, bound to loopback
  └─ local service process / utility process: apps/desktop/local-service
       owns tenant session and authorization
       runs approved business commands and queries
       uses packages/desktop-storage for SQLite repositories and migrations
       coordinates durable outbox, sync and attachment jobs

Sandboxed renderer
  calls the established application API contract through a desktop transport
  receives status and results; does not receive arbitrary SQL or filesystem access

Future cloud HTTPS API
  authenticates the device/user/tenant again
  processes supported commands idempotently
  provides authorized changes and mobile/web queries
```

Run synchronous SQLite operations outside the Electron main/UI processes so a long query, backup, or migration does not freeze the window. Electron main must not import/open `node:sqlite` for application persistence; it supervises the `apps/desktop/local-service` process and its IPC/security boundary. That service consumes `packages/desktop-storage`, which owns repositories, schema/migrations, transaction/outbox/inbox-cursor storage and backup/restore. Keep one local service responsible for writes to a tenant database. Concurrency from several UI windows is queued through that service rather than opening independent write connections in each renderer.

The local service must execute the same tested business rules as the cloud workflow. A generic “save this JSON row” IPC API is insufficient for payments, approvals, stock, and accounting. Extract shared validation/calculation rules incrementally into `packages/domain`, used by the local service and existing cloud services; local persistence adapters need separate SQLite-compatible transactions and exact money handling. Shared DTOs stay in `packages/types` and shared input contracts in `packages/validation`. Unsupported workflows must remain unavailable in an offline pilot, with an honest explanation, until parity is verified. They must not fall back to untracked localStorage writes or silently split related financial records between local and remote databases.

No live VPS is required to develop the isolated runtime and protocol tests. A public release still needs the vendor-configured HTTPS cloud URL, server authentication/sync support, TLS, backup and deployment checks. Customers should only sign in/activate; they should never type a database URL, port, SQL password, or server configuration.

## 3. Startup, ownership and failure behavior

1. Acquire the Electron single-instance lock before opening the local database. A second launch focuses the existing window.
2. Resolve a stable application data root. Never derive live data paths from the installer directory or current working directory.
3. Load non-secret settings and device identity; detect unsupported/newer schema without modifying it. Open an explicit recovery screen when safe startup is impossible.
4. Start the owned local service using the packaged runtime. Establish a private parent/child handshake with a per-launch nonce; receive the bound loopback endpoint, process identity, service/protocol version and database readiness.
5. Bind a port through the service itself, or retry an owned listener on address conflicts. Avoid “find free port, close probe, assume it stays free” as the complete solution. Never kill whatever process occupies a preferred port.
6. Start the packaged renderer on loopback with its verified entry and resource paths. Preserve the process handle and reject readiness if that child exits. A port-open check alone is not health evidence.
7. Make a bounded application health request that verifies the launch identity and compatible runtime version. Establish renderer configuration before any business hooks execute.
8. Open the application window and show local availability separately from cloud connectivity. A cloud outage must not prevent an already authorized user from opening their valid local workspace.
9. On normal quit, stop accepting new commands, finish or roll back the active transaction, persist queue state, close database handles and terminate only owned child processes. Do not require a successful cloud sync to close safely.
10. On process crash, do not report a pending command as successful. Reopen and inspect transaction/outbox state; retry only through idempotent command identity. Present actionable retry/diagnostics without database credentials or stack traces in the normal UI.

Select one desktop origin strategy during implementation. A stable application protocol can keep browser storage independent of random ports, but must be validated with the existing Next routes, navigation, cookies, RSC requests and downloads. If HTTP origins change between launches, desktop credentials and tenant state must live in the main/local service, not origin-scoped browser storage. Do not introduce an unverified custom protocol solely to avoid choosing this explicitly.

## 4. Local transport and security boundary

Prefer an authenticated loopback service for initial compatibility with existing request/response and binary-download contracts; use narrow IPC for runtime discovery and native actions. Scope the capability to the approved local window/session. If an IPC request transport is selected instead, it must preserve the complete API envelope, errors, multipart uploads and streaming/download behavior before replacing HTTP.

- Bind local HTTP listeners to `127.0.0.1`, not `0.0.0.0`. A mobile device accesses the cloud API, not another PC's SQLite endpoint.
- Require a per-launch local capability and valid local user session for business requests. Validate Host/Origin as appropriate and reject requests from unapproved origins; CORS alone is not authentication.
- Keep cloud refresh credentials outside renderer localStorage. Use Electron `safeStorage` or an appropriate OS-backed credential store after validating availability; do not silently fall back to plaintext secrets. Never log tokens or include them in URLs.
- Validate each IPC sender, main-frame origin and payload. Expose explicit operations rather than arbitrary channel forwarding, shell commands, filesystem paths or SQL.
- Retain `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`. Restrict navigation/new windows, deny unneeded permissions, and add a tested Content Security Policy.
- Use HTTPS for cloud access. Configure the vendor endpoint in the release/runtime configuration with an explicit update policy; do not accept an arbitrary renderer-controlled URL that could receive credentials.
- Redact passwords, tokens, customer records and document contents from logs. Bound local log size and let diagnostics be exported by an intentional user action.
- Treat `safeStorage` as secret protection, not encryption of the entire SQLite database. Plain SQLite files and attachment files are not encrypted merely because credentials are protected. Decide and test local data encryption/key recovery separately before making an encryption claim.

These boundaries follow the [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security). They supplement tenant/business authorization; they do not replace it.

## 5. Packaged SQLite/runtime proof

`node:sqlite` is provisionally selected for evaluation because a supported embedded Node runtime can avoid shipping a separately rebuilt SQLite native addon. This is not a production compatibility approval: the packaged Electron runtime has not been verified, and importing it under the developer's `node` does not prove that compatibility. Load the driver through `packages/desktop-storage` inside `apps/desktop/local-service`, outside the main/UI event loops. The [Node SQLite API](https://nodejs.org/api/sqlite.html) documents the runtime interface; use the documentation matching the embedded Node version for the release decision.

Run the following proof under the actual unpacked and installed application executable, with no system Node on PATH, for every supported Windows architecture:

| Probe | Required evidence |
| --- | --- |
| Runtime identity | Record Electron, embedded Node, architecture and SQLite engine versions in the release report. |
| Driver availability | Import `node:sqlite` successfully inside the selected service process; no runtime download or compile step. |
| SQLite semantics | Verify foreign keys, WAL mode, configured busy timeout, explicit transaction rollback and restart persistence. |
| Precision | Round-trip exact monetary values using the approved integer/decimal representation; do not accept IEEE floating point for financial storage by accident. |
| Crash recovery | Terminate the service during an isolated write, restart it, and verify either the full business transaction and outbox item or neither. |
| Backup/reopen | Make an online-consistent snapshot, restore it into a new test directory, and verify integrity, business totals and pending commands. |
| Resource layout | Locate the worker, Next entry, static assets, migrations and all required dependencies in the installed package. |
| Fuse/launch compatibility | Verify the selected Electron child/utility-process mode still works with the chosen security fuse settings. |

If the packaged runtime fails these probes, pin a tested compatible runtime or evaluate a maintained SQLite driver with platform-specific packaging/rebuild checks. The fallback must still ship prebuilt dependencies; an end user must never install Python, a C++ compiler, SQLite, PostgreSQL or Node to repair the application.

## 6. Durable data layout and recovery

Proposed logical layout, resolved from a stable application-owned location under `app.getPath("userData")`:

```text
<userData>/
  runtime/                    non-secret device/configuration metadata
  credentials/                OS-protected secret blobs, never normal logs
  tenants/<stable-tenant-id>/
    database/business.sqlite
    documents/                attachment payloads and verified temporary stages
    snapshots/                local recovery snapshots and manifests
  logs/                       rotated and redacted runtime diagnostics
```

The tenant identifier must come from a validated identity/entitlement, never from a freely supplied file path. Confirm how existing customer/organization fields map to a SaaS tenant before reusing them. Users in the same authorized tenant may share its local data with role enforcement; a different account must not inherit a previous account's query cache or unlocked workspace. Clear session/query state on account switch without deleting business files or unsynced work.

Keep the active SQLite database on a local supported filesystem, outside OneDrive/network-share synchronization paths. Synchronize logical authorized changes over the application protocol rather than uploading a live database file. Do not place WAL/SHM sidecars under installer cleanup directories.

Before every schema-changing migration: verify free space, finish active transactions, make and validate a consistent snapshot, then execute the migration with a ledger/checksum and failure recovery. If backup fails or a newer schema is found, stop migration without resetting the database. Never use `db push --force-reset`, seed replacement, drop-and-recreate recovery, or automatic conversion of the live PostgreSQL database as installer behavior.

For WAL databases, copying only the main `.sqlite` file while writes continue is not a sufficient backup design. Use the engine's supported snapshot mechanism or a correctly quiesced/checkpointed procedure. The [SQLite backup documentation](https://www.sqlite.org/backup.html) describes consistent snapshots. Verify the chosen implementation in the actual driver/runtime. Include attachment references, hashes, schema version, device/tenant metadata and unresolved outbox/conflict state in a recovery manifest.

Restore into a separate staging directory and verify integrity, foreign keys, counts, financial balances, attachment hashes and pending operations before switching the active workspace. Keep the previous directory intact. A database snapshot is not a complete product backup if referenced attachments are missing. Local snapshots also do not protect against loss of the entire disk; cloud backup/retention is a separate release requirement from sync.

An application rollback is allowed only when the older version supports the current schema. Restoring an old snapshot over new committed work to make an old binary start would lose data and is forbidden. Prefer forward-compatible additive migration windows and a recovery build that understands the newer schema.

## 7. Install, update and uninstall contract

| Event | Required behavior |
| --- | --- |
| First install | Install per user where feasible; create writable data directories automatically. Ship every runtime dependency and initialize the local schema without a terminal or DB password. |
| First activation | Internet may be required to authenticate and bind the correct account/device. Show that requirement clearly; zero configuration does not mean a new identity can be verified without any connection. |
| Normal launch offline | Previously provisioned user with valid local authorization can open supported workflows and save atomically. Show pending sync status. |
| Schema update | Verify package signature, runtime/schema compatibility, disk space and recovery snapshot before migration. Never erase the previous data on migration failure. |
| Interrupted update | Retain a usable application/recovery path and all committed local records. No partial installer cleanup may touch tenant data. |
| Reinstall/repair | Replace binaries only. Reopen the existing compatible workspace, pending sync jobs and attachments. |
| Normal uninstall | Preserve tenant databases, attachments and backups. Explicitly configure retention (including NSIS `deleteAppDataOnUninstall: false`) and verify actual installer behavior. |
| Deliberate data removal | Separate from routine uninstall, require an explicit user action and account/data context; never infer it from uninstall or logout. |
| Windows account change | Do not silently grant another Windows user access to protected credentials. Provide a documented authenticated restore/provisioning path. |

NSIS configuration is documented by [electron-builder](https://www.electron.build/nsis/). Verify the behavior of the pinned builder version in a disposable Windows profile. Future automatic updates require their own signed release channel and recovery acceptance; no updater integration was found in the current Electron source.

## 8. File-level implementation map

Paths marked **new** are proposed boundaries, not existing completed components. Package ownership matches the [main migration blueprint](README.md); Electron owns lifecycle/security, the local service owns application commands and sync execution, desktop-storage owns persistence, and domain owns shared business rules.

| File/area | Planned responsibility and regression boundary |
| --- | --- |
| `apps/desktop/electron/src/main.ts` | Single-instance ownership, lifecycle, runtime startup/failure UI, trusted window, graceful shutdown. Preserve existing desktop routes and visual shell. |
| `apps/desktop/electron/src/preload.ts` | Narrow typed discovery/status/native-action bridge; validate payloads on the receiving side. No arbitrary DB/file bridge. |
| **new** `apps/desktop/electron/src/runtime/` | Service/renderer supervisor, private startup handshake, protocol/version checks, stable data-path resolution and diagnostics. |
| **new** `apps/desktop/local-service` | Tenant-scoped authenticated local command/query runtime, business orchestration and background sync worker. Runs outside Electron's main/UI loops; uses desktop-storage repositories and domain rules. |
| **new** `packages/desktop-storage` | SQLite repositories, versioned schema/migrations, connection/transaction lifecycle, exact-value persistence, durable outbox/inbox/cursors, snapshot/restore and integrity helpers. Do not replace `packages/database/prisma/schema.prisma` to implement this. |
| **new** `packages/domain` | Incrementally extracted shared business validation, calculations and lifecycle rules for both local and cloud services. Preserve current rounding, permissions and business outcomes; do not copy divergent rule implementations into the local service. |
| `apps/desktop/electron/electron-builder.yml` | Correct monorepo renderer entry/assets, include local service and migrations, preserve user data, packaged verification hooks. |
| `apps/desktop/electron/package.json` and `pnpm-workspace.yaml` | Reproducible build/package scripts and audited runtime dependency installation. No runtime downloads on customers' machines. |
| **new** packaging verification script | Fail builds when server/static/service/migration files or required production dependencies are absent; verify development auth bypass is disabled. |
| `apps/desktop/renderer/next.config.ts` | Preserve standalone output; separate desktop backend routing from the current fixed-port rewrite. Follow the installed Next guides before editing. |
| `apps/desktop/renderer/src/config/env.ts` | Resolve a validated desktop runtime configuration; retain cloud/web configuration behavior. Avoid mobile API URLs derived from `localhost`. |
| `apps/desktop/renderer/src/components/providers/AppProviders.tsx` | Initialize transport/session before hooks render; clear query data on tenant switches. Avoid accidental requests to default localhost during initialization. |
| `packages/api-client/src/config.ts` and `http-client.ts` | Injectable desktop/web transport or headers without changing public business API envelopes. Preserve refresh, validation errors, pagination, summaries, multipart and blobs. |
| `packages/api-client/src/token-storage.ts` | Separate web token storage from the desktop credential/session adapter; no cross-account leakage. |
| `packages/api-client/src/hooks/use-auth.ts` | Local unlock/session, online authentication and explicit sign-out semantics; do not clear durable business data. |
| `apps/desktop/renderer/src/app/login/page.tsx` | First online provisioning versus offline local unlock, with recovery/status messages appropriate for the user. |
| `apps/desktop/renderer/src/app/(dashboard)/layout.tsx` | Distinguish invalid authorization from cloud/network unavailability; preserve roles/sidebar and existing routes. |
| `apps/desktop/renderer/src/components/layout/Topbar.tsx` | Compact local-save/sync state, last successful sync and actionable conflicts. “Saved on this PC” must differ from “Available in cloud.” |
| `packages/api-client/src/hooks/use-settings.ts` and `use-billing.ts` | Existing direct fetch paths for assets/PDFs must use the chosen desktop authorization/transport too. |
| `apps/desktop/renderer/src/app/support-admin/page.tsx` | Explicit cloud-only vendor surface; do not expose vendor administration through a customer's local tenant service. |
| `apps/api/src/modules/documents/document-storage.service.ts` | Keep cloud storage behavior compatible; introduce a configured storage interface/local adapter and attachment sync with tenant validation. Audit other file-writing modules as well. |
| `apps/api/src/modules/auth/` and `vendor-licensing/` | Cloud-issued signed offline authorization/lease and device lifecycle; cloud continues to authenticate every sync request independently. |
| `packages/types/` and `packages/validation/` | Versioned runtime/sync/session contracts; share validation without weakening existing business constraints. |

Also migrate the existing business-tool localStorage drafts deliberately: `renderer/src/components/business-tools/OperationalTools.tsx` and `DocumentsAndWords.tsx`. Changing origin or replacing browser state must not silently strand those drafts. Copy into tenant-scoped storage only after identifying the correct account, preserve originals until verified, and keep import idempotent.

## 9. Lightweight operation: proposed measurement budgets

Electron includes Chromium and a Node runtime; SQLite removes a separate database server but does not make the entire ERP tiny automatically. Measure the complete process tree, including renderer, GPU, local service and Next. Do not advertise “smooth on every PC” without a supported hardware/OS baseline.

Initial benchmark profile: supported Windows x64 version, standard user, 4 CPU cores, 8 GB RAM, SSD, 100,000 representative business rows plus realistic indexes and attachments. Record the exact OS, hardware, release build, dataset and antivirus conditions. Include a lower-spec device if it will be sold as supported. Use at least 20 repeatable samples for percentile-based timing.

| Metric | Initial engineering target, subject to measurement |
| --- | --- |
| Warm launch to usable local dashboard | p95 at or below 4 seconds, excluding first provisioning/schema migration. |
| Cold launch to usable local dashboard | p95 at or below 8 seconds on the reference machine. |
| Idle total working set | At or below 600 MB after stabilization; report actual process totals and investigate regressions. |
| Idle CPU while offline/no work pending | Average below 1% total machine CPU over five minutes; no busy polling. |
| Common indexed list/query | p95 at or below 250 ms in the local service for a normal paginated view. |
| Typical local save | p95 at or below 300 ms through durable transaction commit for the chosen pilot workflow. |
| Background sync | Bounded batches, exponential backoff with jitter, capped concurrency, and no sustained UI blocking. |
| Installer and installed size | Record compressed/unpacked sizes; reject unexplained release-to-release growth above 10%. Set an absolute product budget after the first valid complete package exists. |

Exclude synthetic in-memory SQLite results from desktop performance claims. Measure persistence and relevant durability settings. Large imports, backup, recovery, OCR, PDFs and reports need separate progress/cancellation behavior; do not disable transactional safety to meet timing targets.

## 10. Acceptance matrix and rollout gates

All cases run with isolated fixture tenants/databases and reversible test profiles; none require resetting the existing customer's PostgreSQL database.

| Scenario | Pass evidence |
| --- | --- |
| Clean Windows install without PostgreSQL/Node/pnpm | Installer completes, starts the bundled runtime, initializes local schema and reaches activation without manual environment configuration or runtime download. |
| Existing unrelated process on 3010 or 4000 | App starts its own compatible endpoint or reports a safe actionable error; never opens/kills the unrelated service. |
| Double launch | One database owner, second window focuses the existing instance, no duplicate startup migrations. |
| First activation and existing-user offline restart | Correct account/tenant binding online; valid local session opens after network removal and full process restart. |
| Local save then forced process termination | Verified committed business records/outbox persist; incomplete transaction has no partial side effects. |
| Disk full/read-only directory | Save reports failure accurately, existing data remains readable, no empty replacement database is created. |
| Offline editing followed by sync retry | Same business operation is accepted once; status distinguishes pending, acknowledged and conflict. |
| Account/tenant switching | No stale query data, files or permissions leak; unsynced work remains associated with its original tenant. |
| Attachment add/restart/sync/download | Bytes and hashes match; metadata never claims an absent local/cloud file is available. |
| Local backup and staging restore | Counts, financial totals, integrity, attachments and pending sync match; original workspace preserved. |
| Update with pending work | Data and outbox survive; schema migration is recorded; failure retains a working recovery path. |
| Reinstall and uninstall/reinstall | Existing committed records, documents and pending sync remain; no installer cleanup removes the data root. |
| Newer database opened by old app | Explicit compatibility/recovery state; no automatic reset or downgrade that discards later work. |
| Packaged runtime/security | Actual embedded runtime passes SQLite probes; unauthorized IPC and loopback requests fail; secrets are absent from diagnostics. |
| Performance | Release report contains measured timings/process memory/CPU/package size on the declared reference machine. |
| Cloud/mobile later | Only successfully synchronized authorized records appear through the cloud API; tenant isolation and stale-data indication verified. |

Rollout gates:

1. **Audit/proof gate:** Agree on tenant identity, local persistence precision, command boundaries and recovery behavior. Build isolated runtime/database proofs without touching production paths. This document belongs to this gate.
2. **Pilot gate:** Complete one end-to-end workflow, including existing rule parity, local restart, authorization, files if applicable, sync retries/conflicts and verified restore. Do not switch the full ERP to the pilot transport.
3. **Coverage gate:** Mark every module read/write/approval/financial operation as supported or deliberately unavailable offline. Release scope must match actual coverage; no generic row replication bypasses a business service.
4. **Installer gate:** Build and sign the complete runtime; run the clean-PC, repair/update/uninstall and performance matrix. Only then claim zero database configuration for customers.
5. **Cloud rollout gate:** Deploy the compatible authenticated cloud protocol, backup/restore and mobile API on the vendor infrastructure. Provision a limited customer cohort from verified copies; retain a tested recovery path and original source until reconciliation is complete.

An acceptance checklist describes required evidence; it is not a report of tests already passed. The present repository audit establishes concrete work locations and current blockers, not completion of an offline SaaS ERP.
