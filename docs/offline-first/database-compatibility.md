# Database compatibility and preservation audit

> This is the original 170-model architecture audit, with an explicit correction below for a previously omitted enum array. Additive Categories/UOM/Payment Terms implementation is tracked in [implementation status](implementation-status.md); the complete ERP storage port described here remains pending.

Audited on 2026-09-21 against the current source tree. Scope: `packages/database`, API database access, financial persistence, migration constraints, and the tests needed for an offline desktop implementation.

**Status: architecture and implementation specification only. Full SQLite business-data runtime conversion is NOT implemented by this document. No application database was connected to, exported, migrated, reset, seeded, or modified during this audit.** Counts describe source declarations and migration files, not the contents or deployed schema of a running database.

## Decision

Keep the existing PostgreSQL schema, generated client, migrations, and running application unchanged while adding an independently validated SQLite implementation. SQLite remains the target for a self-contained desktop installation; PostgreSQL remains the authoritative cloud storage when a VPS is available.

Changing `provider = "postgresql"` to `sqlite` is not a safe implementation. The existing application relies on exact PostgreSQL numeric operations, database constraints, row locks, transaction semantics, arrays, and provider-specific query options. The business rules and calculations should be reused; the current Prisma persistence implementation cannot be reused unchanged.

The safe implementation boundary is a shared application command and calculation layer with PostgreSQL and SQLite repositories and an explicit transaction context. Move one complete workflow at a time across that boundary and require equivalent observable results before enabling it in a desktop release. A generic JSON record cache, a new empty SQLite file, or an HTTP retry queue does not establish offline ERP behavior.

## Verified inventory

Source: [schema.prisma](../../packages/database/prisma/schema.prisma), [database package](../../packages/database/package.json), and [lockfile](../../pnpm-lock.yaml).

| Item | Verified count or value |
| --- | --- |
| Prisma models | 170 |
| Prisma enums | 102 |
| Decimal fields | 347 |
| JSON fields | 17 |
| PostgreSQL native type annotations | 384: 347 Decimal, 30 Date, 6 VarChar, 1 Text |
| Non-relational scalar/enum lists | 4: three built-in scalar lists and one enum list (corrected from the original count of 3) |
| Existing migration directories containing migration.sql | 69 |
| Explicit CHECK clauses in migration SQL | 43 |
| Partial/expression unique indexes found in migration SQL | 6 |
| Production service files with `mode: "insensitive"` | 47 |
| Prisma version resolved by lockfile | 6.19.3 |

The built-in scalar lists are `Document.tags` (`String[]`, original schema line 3217), `ReminderRuleSetting.offsetDays` (`Int[]`, original line 3496), and `DocumentSetting.allowedFileTypes` (`String[]`, original line 3512). The original audit script omitted the fourth non-relational list: `Party.roles` (`PartyRole[]`), which already existed in migration `20260818140000_add_masters_vendor_foundation`. The script now recognizes declared enum arrays separately from relationship arrays. The original `source-inventory.json` remains the historical 170-model snapshot; its three-array field is incomplete and must be read with this correction. Relations written as `SomeModel[]` are not scalar lists and must not be converted to JSON.

`Party.roles` must preserve all roles, empty-list behavior and `hasSome` membership filtering. Supplier/subcontractor numbering and profile handling depend on these roles. A single enum value cannot replace this field; its SQLite representation and queries need explicit parity tests before the party workflow is ported.

Prisma 6.19.3 is newer than the SQLite enum/JSON support introduction; treating every enum or JSON field as categorically unsupported would be incorrect. SQLite does not enforce Prisma enums as PostgreSQL native enum types, however, and scalar lists still need a deliberate representation. See the [Prisma v6 SQLite connector](https://docs.prisma.io/docs/orm/v6/overview/databases/sqlite) and [schema reference](https://docs.prisma.io/docs/orm/reference/prisma-schema-reference).

The existing client boundary is:

- [PrismaService](../../apps/api/src/modules/prisma/prisma.service.ts): directly extends the one PostgreSQL-generated `PrismaClient` and connects during module initialization.
- [PrismaModule](../../apps/api/src/modules/prisma/prisma.module.ts): globally provides that service.
- [database exports](../../packages/database/src/index.ts) and [client singleton](../../packages/database/src/client.ts): export the generated client, enums, Prisma namespace, and a singleton. Services, DTOs, and calculations import these types throughout the application.
- [database package scripts](../../packages/database/package.json): migration and seed commands load the existing root environment. These scripts must never be repurposed as desktop first-run initialization.

## Exact decimal handling is a release blocker

PostgreSQL `NUMERIC(p,s)` and SQLite `DECIMAL` do not provide equivalent storage guarantees. SQLite uses type affinity; a `DECIMAL` declaration does not create an arbitrary-precision decimal storage engine. Converting a decimal to `Prisma.Decimal` after a read cannot recover precision already lost in storage or a SQL aggregate. See [SQLite datatypes](https://www.sqlite.org/datatype3.html) and [floating-point behavior](https://www.sqlite.org/floatingpoint.html).

The schema's complete decimal declaration inventory is:

| Declaration | Fields |
| --- | ---: |
| Decimal(18,2) | 170 |
| Decimal(5,2) | 18 |
| Decimal(18,3) | 32 |
| Decimal(7,4) | 12 |
| Decimal(18,6) | 5 |
| Decimal(18,4) | 81 |
| Decimal(8,2) | 7 |
| Decimal(8,4) | 7 |
| Decimal(12,2) | 9 |
| Decimal(3,2) | 1 |
| Decimal(24,6) | 4 |
| Decimal(9,6) | 1 |

The four `Decimal(24,6)` fields are `StockMovement.unitCost`, `StockMovement.totalCost`, `LcInventoryPosting.unitCost`, and `LcInventoryPosting.totalCost` at schema lines 5472-5473 and 5614-5615. Their full declared range does not fit a signed 64-bit integer after multiplying by 10^6. A blanket conversion to cents or SQLite INTEGER would therefore narrow the existing model.

### Required local representation

Use a checked field manifest containing model, field, precision, scale, nullability, and default. The manifest must be generated from the checked-in schema and reviewed; a schema change that lacks a local mapping must fail the build.

The least surprising initial representation is canonical fixed-scale decimal **TEXT** for all 347 fields, decoded to the same arbitrary-precision decimal value type used by the current calculations. For example, a money field serializes as `"1234.50"`, quantity as `"2.375"`, and exchange rate as `"120.123456"`. Do not use SQLite NUMERIC affinity for these columns. Preserve null separately from zero. Retain the exact current rounding rules at each calculation and persistence boundary, verified against PostgreSQL; do not globally round every input to two places.

This representation requires explicit repository operations:

| Current operation | SQLite implementation contract |
| --- | --- |
| Insert/update Decimal | Validate field precision/scale; encode exact fixed-scale text; bind as text |
| Read Decimal | Decode text to the shared Decimal value type before invoking existing calculations |
| `increment` / `decrement` | Read and calculate with Decimal within the same exclusive write transaction; validate result; write canonical text |
| `_sum`, grouped totals | Stream relevant exact values into a Decimal accumulator per group, or use a bundled, tested exact-decimal aggregate; never SQLite `SUM` over decimal text |
| Numeric comparison/filter | Use an exact comparator or a validated sortable numeric key; never lexicographic text comparison or a cast to REAL |
| Numeric ordering with pagination | Order using an exact sortable representation before pagination, or implement a tested decimal collation; sorting only the returned page is incorrect |
| Cross-field CHECK arithmetic | Preserve the rule with exact command validation plus equivalent exact database enforcement where supported by the selected local driver |

At first, repository-level accumulation is easier to verify than adding a native extension. If performance measurements justify an extension, pin and package it with the installer; users must not install it. Preserve SQL empty-set/null behavior at the repository boundary. SQLite `SUM` can overflow even when individual INTEGER rows fit; `TOTAL` is floating point, and `decimal_sum` is an extension rather than a core feature. See [SQLite aggregate functions](https://www.sqlite.org/lang_aggfunc.html).

A later optimization may store fields with precision at most 18 as scaled INTEGER using JavaScript BigInt end-to-end. It requires proven input/result range checks, exact handling of sums that exceed 64 bits, and an explicit conversion boundary back to Decimal. It cannot cover the four precision-24 fields. Native addition can promote overflowing integer arithmetic to REAL, so unchecked SQL `balance + delta` is not acceptable. Do not introduce this optimization before parity tests.

### Financial invariants already present

- [CashBankService.post](../../apps/api/src/modules/cash-bank/cash-bank.service.ts), lines 73-78: validates positive amounts, changes `BankAccount.currentBalance`, and creates a source transaction in one caller-supplied transaction. These effects and their eventual outbox entry must commit together.
- [AccountingService](../../apps/api/src/modules/accounting/accounting.service.ts), lines 286-386: checks positive balanced journal lines, finds an existing source posting, checks the accounting period, resolves tenant-scoped ledger/project references, and creates the journal. Lines 452 onward protect system accounts. Preserve every rule locally and on cloud acceptance.
- The `financial_transactions_source_post_key` and `journal_entries_source_key` unique constraints protect source posting identity. Receipt, payment, bank balance, and journal records are one business operation; synchronizing each table independently is unsafe.
- [ReceiptsService](../../apps/api/src/modules/receipts/receipts.service.ts), lines 213-320: allocates numbering, checks outstanding receivable, posts cash and journal entries, and performs a compare-and-update on received amount within Serializable isolation. Its amendment/cancellation paths use reversal entries. Preserve history instead of overwriting posted entries during conflict resolution.
- [TendersService](../../apps/api/src/modules/tenders/tenders.service.ts), including lines 697, 767, and 867: uses version-checked updates. Versions must participate in sync commands, not be discarded during an upsert.
- [Accounting reconciliation](../../apps/api/src/modules/accounting/accounting.service.ts), lines 773-798: compares subledgers, bank balances and the general ledger and detects unbalanced journals. Run equivalent reports before and after every migration rehearsal.

## Production SQL and provider-specific query inventory

Paths in this table are relative to `apps/api/src/modules/`. Line numbers describe the audited source and may move after edits. The table includes every raw-query call found in production module TypeScript, including SQL that may be portable but needs a contract test.

| Location | Existing behavior | Required local treatment |
| --- | --- | --- |
| `vendor-licensing/vendor-license-client.service.ts:72` | Locks `vendor_license_keys` with `FOR UPDATE` before device count/write | Keep licensing issuance/device authority in the cloud; use signed offline entitlement locally |
| `vendor-licensing/vendor-dashboard.service.ts:151` | `DATE(createdAt)`, grouped COUNT, driver Date/BigInt result mapping | Cloud vendor analytics; exclude from customer desktop DB |
| `vat-tax-certificates/vat-tax-certificates.service.ts:500` | Locks certificate row with `FOR UPDATE` | Local write transaction plus fresh state validation |
| `vat-tax-certificates/tender-vat-tax.service.ts:78` | Locks tax entry with `FOR UPDATE` | Local write transaction plus state/version check |
| `project-closing/project-closing.service.ts:952` | Locks tenant's work before final closeout | Local write transaction; retain cross-module closeout checks |
| `project-bills/project-bills.service.ts:129` | Locks `cms_works` for bill operations | Local write transaction; preserve bill quantity and final-bill exclusivity |
| `documents/documents.service.ts:361` | Joined challan/work query, enum `::text` casts, `FOR UPDATE OF c` | Repository query + local transaction; preserve tenant join and mutable-state guards |
| `documents/documents.service.ts:434` | Joined certificate/work/contract query with enum casts and row lock | Same; preserve all referenced state checks |
| `documents/documents.service.ts:469` | Locks document row for version allocation | Atomic local version allocation and unique constraint |
| `settings-numbering/numbering.service.ts:190` | Atomic UPDATE RETURNING; `IS DISTINCT FROM`, booleans, `now()`, year rollover | Explicit numbering repository and device-safe numbering protocol |
| `reports/reports.service.ts:146` | INSERT hidden report transaction with ON CONFLICT DO NOTHING | Preserve idempotency and required timestamp defaults in local schema |
| `reports/reports.service.ts:161` | Tenant-scoped hidden transaction SELECT | Portable query semantics; verify result type and tenant scope |
| `settings-system/system-settings.service.ts:15` | `SELECT 1` for database health | Local health must check actual local store readiness, not cloud reachability |

Numbering currently assumes one shared database. Two offline PCs cannot safely consume the same `ReceiptSequence` or `NumberSequence`. Keep existing historical numbers unchanged. New offline commands need a stable client operation ID and either preallocated per-device ranges or an explicit device-qualified provisional number with a separate canonical cloud number. Final printed/document identifiers must follow the chosen product rule; do not silently rename already-issued vouchers during sync.

### Explicit transaction isolation sites

| Location | Existing isolation |
| --- | --- |
| `vat-tax-certificates/tender-vat-tax.service.ts:51,65,146` | RepeatableRead |
| `project-closing/project-closing.service.ts:672,1016` | Serializable |
| `project-bills/project-bills.service.ts:884` | Serializable, 15-second timeout |
| `supplier-bills/supplier-bills.service.ts:516` | Serializable |
| `grn/grn.service.ts:166` | Serializable |
| `accounting/legacy-financial-backfill.service.ts:213` | Serializable, 20-second timeout |
| `accounting/demo-bank-cleanup.service.ts:112` | Serializable, 120-second timeout |
| `receipts/receipts.service.ts:314,473,503` | Serializable |

The cleanup and historical backfill services are maintenance operations, not desktop startup work. SQLite requires a different locking strategy; preserving the word Serializable does not reproduce PostgreSQL row locking. Use one local database owner, short write transactions, a bounded busy retry policy, and transaction-wide retry only for idempotent commands. `BEGIN IMMEDIATE` is a candidate in the selected SQLite driver to obtain write ownership before dependent reads; do not remove locks and hope default transactions suffice. WAL allows concurrent readers but only one writer. See [SQLite WAL](https://www.sqlite.org/wal.html) and [transaction control](https://www.sqlite.org/lang_transaction.html).

`roles/roles.service.ts:70` and `lc/lc.service.ts:268` use `createMany({skipDuplicates:true})`. Implement constraint-targeted upsert/conflict handling locally; do not suppress unrelated FK/check errors. Prisma's [v6 client reference](https://docs.prisma.io/docs/orm/v6/reference/prisma-client-reference) documents the SQLite limitation.

### Case-insensitive search and uniqueness

There are 47 production service files using `mode: "insensitive"`. They are:

```text
accounting/accounting.service.ts
audit-logs/activity-logs.service.ts
cash-bank/cash-bank.service.ts
challan-submissions/challan-submissions.service.ts
challan-submissions/tender-challan.service.ts
cms-works/cms-works.service.ts
contracts/contracts.service.ts
credit-commitments/credit-commitments.service.ts
document-purchases/document-purchases.service.ts
documents/documents.service.ts
fixed-assets/fixed-assets.service.ts
general-expenses/general-expenses.service.ts
grn/grn.service.ts
hr/hr.service.ts
items/items.service.ts
master-categories/master-categories.service.ts
organizations/organizations.service.ts
parties/parties.service.ts
payment-terms/payment-terms.service.ts
pg-bg/pg-bg.service.ts
project-bills/bill-workspace.service.ts
project-bills/project-bills.service.ts
project-bills/project-costing-report.service.ts
project-closing/project-closing.service.ts
project-closing/work-completion-certificates.service.ts
project-expenses/project-expenses.service.ts
purchase-orders/purchase-orders.service.ts
purchase-requisitions/purchase-requisitions.service.ts
receipts/receipts.service.ts
reminders/reminders.service.ts
reports/reports.service.ts
rfqs/rfqs.service.ts
sales-quotations/sales-quotations.service.ts
supplier-bills/supplier-bills.service.ts
supplier-payments/supplier-payments.service.ts
support-tickets/support-tickets.service.ts
tender-costings/tender-costings.service.ts
tender-securities/tender-securities.service.ts
tenders/tenders.service.ts
users/users.service.ts
vat-tax-certificates/tender-vat-tax.service.ts
vat-tax-certificates/vat-tax-certificates.service.ts
vendor-licensing/vendor-customers.service.ts
vendor-licensing/vendor-devices.service.ts
vendor-licensing/vendor-licenses.service.ts
vendor-licensing/vendor-subscriptions.service.ts
work-ious/work-ious.service.ts
```

Removing `mode` changes behavior. SQLite's built-in NOCASE support is ASCII-limited, so define and test normalized search/unique keys appropriate for the actual Bangla/English data and preserve PostgreSQL behavior where promised. Do not equate JavaScript lowercasing, SQLite NOCASE, and PostgreSQL collation without comparison tests. See [Prisma v6 case sensitivity](https://docs.prisma.io/docs/orm/v6/prisma-client/queries/case-sensitivity).

### Maintenance SQL must stay out of the installer

Raw SQL also exists in these non-runtime paths:

- `apps/api/src/scripts/reconcile-legacy-financial-data.ts:15`, `cleanup-demo-bank-data.ts:13`, and `packages/database/prisma/seed-bank-accounts.ts:16` call PostgreSQL `current_database()`.
- `apps/api/src/scripts/demo-reset-complete.ts:177`; `demo-reset-business-data.ts:192,238,316,352`; `demo-reset-business-data-v2.ts:396,1016`; `cleanup-demo-fk-sql.ts:127`; `cleanup-final.ts:99`; `cleanup-demo-sql-joined.ts:158` contain table-counting or destructive cleanup SQL. They are not migration/export utilities for this task and must never run in desktop initialization.
- Existing PostgreSQL migration SQL includes native enum DDL, enum casts, JSONB, scalar array defaults, ALTER TABLE operations, and data backfills. Keep that migration history for PostgreSQL. Build an independently reviewed SQLite baseline and upgrade history.

## Constraints not reproduced by copying schema.prisma

The six partial/expression unique indexes are:

| Migration directory | Constraint and invariant |
| --- | --- |
| `20260817230000_project_closing_contract_completion` | `project_bills_one_active_final_per_project`: one FINAL bill per company/work excluding CANCELLED/REJECTED |
| `20260829170000_harden_challan_document_integrity` | `documents_challanSubmissionId_documentType_active_key`: one non-archived document per challan/evidence slot |
| `20260829200000_add_vat_tax_certificates` | `vat_tax_cert_org_type_no_ci_key`: case/trim normalized certificate number unique by company/type when non-null |
| `20260829200000_add_vat_tax_certificates` | `documents_vatTaxCertificateId_documentType_active_key`: one non-archived document per tax certificate/evidence slot |
| `20260829221000_one_active_final_wcc_per_work` | `completion_certificates_one_active_final_per_work_key`: one non-cancelled FINAL certificate per company/work, normalized completion type |
| `20260906010000_tender_vat_tax_register` | `tender_vat_tax_entries_active_reference_key`: one active tax reference per company/tender/tax type |

SQLite supports partial indexes, but predicates, normalization, enum/text values, and exact numeric expressions require reviewed local SQL. Also preserve `document_versions_documentId_version_key`, added in `20260829170000_harden_challan_document_integrity`, regardless of whether a generated baseline happens to include it.

The 43 CHECK clauses are grouped below. The SQL files in [the migration directory](../../packages/database/prisma/migrations) are the authoritative definitions; preserve their complete predicates, not only these summaries.

| Migration directory | CHECK count | Rules |
| --- | ---: | --- |
| `20260829200000_add_vat_tax_certificates` | 4 | Nonblank certificate number, nonnegative amount, valid date range, mandatory issued fields |
| `20260829220000_add_work_completion_tracking` | 2 | Source/EGP status consistency and required ordered EGP dates |
| `20260830120000_add_sales_quotation_workflow` | 6 | Date range, nonnegative totals, VAT range, result fields, item values, overhead amount |
| `20260830180000_add_work_ious` | 8 | Work/tender context, nonnegative money, exact totals, settlement state, positive version/item amount, nonnegative sort order, attachment size |
| `20260830200000_add_tender_intake_costing_workflow` | 6 | Business identifier, pay order requirements, positive version, costing approval state, costing/item value validity |
| `20260831180000_add_tender_costing_budget` | 1 | Positive budget when supplied |
| `20260831190000_add_tender_costing_item_sourcing` | 2 | Sourcing mode and applicable source values |
| `20260901190000_add_tender_costing_shipping_method` | 3 | Shipping method, positive transit days when present, nonnegative door-to-door charge |
| `20260901200000_add_detailed_door_shipping_costs` | 7 | Shipping rate basis and six nonnegative charges/measurements |
| `20260903150000_add_tender_costing_lc_container_settings` | 1 | Allowed container allocation method |
| `20260906010000_tender_vat_tax_register` | 3 | Positive amount, nonblank reference key, reason required for voiding |

Primary keys, ordinary unique indexes, composite tenant foreign keys, delete behavior, and required/default values remain mandatory too. A tenant relation must be validated from authenticated company context and related IDs; a child table without its own `organizationId` must inherit scope through a verified parent. Global user identity does not make all companies' user data available to a desktop.

## Service reuse and atomic sync boundary

Introduce explicit abstractions such as `UnitOfWork`, exact decimal field codecs, repository methods, and application command handlers. These names describe planned responsibilities, not existing implemented packages.

1. Keep the existing PostgreSQL adapter and public API behavior as the baseline.
2. Extract pure calculation and validation code without changing expected DTO results. Examples already exist in tender costing, sales quotations, GRN, supplier quotation, HR, fixed assets, LC allocation, and receipt settlement helpers.
3. Move database-specific queries and aggregates into repositories. A SQLite implementation must return the exact domain types the calculation layer expects, not silently replace Decimal with Number.
4. Pass the same transaction context through domain writes, sequence allocation, accounting, cash posting, audit, and sync bookkeeping.
5. Save one immutable command/outbox entry in the same local transaction as all its business changes. Its identity includes company, device, operation ID, payload version, user, aggregate ID, and expected aggregate version.
6. On cloud receipt, derive company/user scope from authentication, verify current permissions, and apply the command through existing business rules. Store its idempotency receipt and resulting change record in the same PostgreSQL transaction.
7. Applying a cloud change locally must be atomic with the inbound cursor update. Preserve pending local operations and rejected/conflicting commands; do not overwrite or delete unsynced records.

Current services cannot simply be wrapped by one outer transaction: many open their own transactions, and collaborators sometimes access `this.prisma` independently. For example, ReceiptsService audits after commit; NumberingService.next calls `ensureDefaults` outside its supplied transaction; AccountingService.post checks settings through a separate service. [AuditLogService.record](../../apps/api/src/modules/audit-logs/audit-log.service.ts) already has an optional transaction parameter and is a useful starting point.

Audit rows and `updatedAt` timestamps are not a reliable sync journal: not every mutation records a complete replayable payload, timestamps do not establish a lossless cursor, and physical deletion may leave no record. Add explicit tombstones/change records, durable per-device checkpoints, and schema-versioned commands.

Cloud licensing administration, package/subscription issuance, vendor customers, vendor device management, and platform download analytics stay cloud-side. Desktop bootstrap gets only the user's authorized company data and a signed offline entitlement. Do not distribute vendor admin records, cloud JWT signing secrets, password hashes of other users, or unrestricted refresh-token tables.

Two disconnected devices cannot enforce a global payment ceiling, final-bill exclusivity, or unique sequential number using local data alone. Financial operations therefore need an explicit pending-cloud-acceptance state or a preallocated authority/reservation scheme. Preserve the local user's work when cloud acceptance fails, with a resolvable conflict; never silently call it globally final and later remove it.

## Local storage and upgrade requirements

- Use a per-company/device database under the app's writable user-data directory, outside installation resources. App upgrades and ordinary uninstall must not erase this data.
- One app-owned process performs SQLite writes. Run long reports/imports away from the Electron UI thread.
- Initialize schema and reference defaults transactionally; do not run demo seeds or copy a developer database into an installer.
- Enable and verify foreign-key enforcement on every connection. Choose WAL, a bounded busy timeout, and a durability policy consistent with financial saves; `synchronous=FULL` is the initial candidate, subject to measured performance. Avoid placing the live file in a network/OneDrive shared folder.
- Migration files are versioned and checksummed. Before an upgrade, create and verify a recoverable backup; apply the local migration in a transaction where supported. On error, preserve the old store and open a recovery flow; do not auto-reset the database.
- If a database appears corrupted, do not replace it with an empty file. Preserve the original and WAL artifacts, stop writes, and offer restoration from a verified copy.
- Before release, pin and validate the exact embedded SQLite version and native binding for every supported Electron/Windows architecture. Recheck official release advisories rather than assuming the Node/Prisma development version matches the packaged binary.

## Safe export, migration, and recovery procedure

These steps are future implementation/acceptance requirements. None was run on the current database during this audit.

### 1. Preserve the source

Keep PostgreSQL active while constructing a new target. Do not change its provider, run reset/push/seed commands, or overwrite/delete historical migration files. First inventory the actual deployed schema, migration history, row counts, constraints, decimal scale distributions, and missing relations using read-only access. Source-file inspection does not establish deployed database health.

Create a PostgreSQL archive backup with a version-compatible `pg_dump` and an attachments manifest. A dump is not a SQLite import script. `pg_dump` provides a consistent database snapshot; attachment storage needs its own corresponding immutable-file manifest or a controlled upload freeze. See [PostgreSQL pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html). Store credentials through a protected mechanism, not literal shell arguments or application logs.

### 2. Prove restore before conversion

Restore that archive into a newly created isolated PostgreSQL database, never into the source. Validate the archive list, all expected tables/constraints, row counts, relation integrity, and financial reconciliations. Verify every required attachment by size and content hash. Record backup checksum, schema version, organization scope, and restore test evidence. A nonempty backup file alone is not evidence that it can restore.

### 3. Export a consistent authorized snapshot

Build a dedicated exporter that uses an explicit read-only transaction at a consistent snapshot and an allowlist of company-owned entities. Follow relation closure for parent-scoped children and allowed shared reference data. Export stable IDs, historical numbers, version values, status, timestamps, deletions/history, and exact decimal strings. Do not call application GET services to export because some GET paths create default rows.

The export manifest includes protocol/schema versions, company identity, snapshot identity, per-entity counts, deterministic ordered hashes, file hashes, and decimal field definitions. Partition vendor control-plane tables and secrets out of customer exports. Never stringify a Decimal by first converting it to JavaScript Number.

For a live source, establish a durable change-log position consistent with the snapshot and replay all later mutations. If no such change capture exists, require a controlled write-freeze for the final snapshot/cutover. A best-effort timestamp scan cannot close the race. PostgreSQL remains authoritative until target validation and catch-up complete.

### 4. Import into a fresh target

Import into a new temporary SQLite file, not an existing customer store. Use the reviewed local baseline, exact codecs, dependency-aware ordering and a transaction strategy that preserves foreign-key guarantees. Handle cycles explicitly with reviewed deferred relationships/staging; do not leave foreign-key checks disabled. Preserve source IDs and tenant boundaries. A resumed import must detect its original snapshot and be idempotent.

Generate import reports before exposing the target. Compare all manifest counts and canonical hashes; each field's null/empty/default state must survive. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` separately because the former does not replace FK verification. See [SQLite integrity checks](https://www.sqlite.org/pragma.html#pragma_integrity_check).

### 5. Verify semantic parity

Require equal trial balance, total debits/credits, cash/bank balances, payable/receivable outstanding, receipt allocations, inventory quantities/cost, project bill totals, retention/security balances, and relevant module reports. Evaluate every CHECK and unique-index invariant on the imported store. Reopen the app and exercise real services against the new store before enabling it for users.

### 6. Cut over with a recoverable route

Activate only a fully verified store using a small durable manifest/pointer update after all handles are closed. Retain the old source and import backup. After new local writes start, reverting requires preserving/replaying those operations; switching back to an old snapshot would lose work. App/schema rollback must never discard a pending outbox.

### 7. Ongoing backup and restore

Use SQLite's online backup API or another documented consistent-snapshot method; copying only the main file while WAL writes are active is insufficient. Restore into a fresh candidate, validate it, close active connections, and then activate the candidate while retaining the displaced data. Include attachment blobs, pending operations, device sync state, schema metadata, and encryption recovery material where applicable. See the [SQLite backup API](https://www.sqlite.org/backup.html).

Restoring an old backup must not cause previously accepted cloud operations to post again. Stable operation IDs and cloud inbox idempotency receipts must survive restores. Detect device/checkpoint regression and reconcile before enabling outbound replay. Sync is not a substitute for independently retained backups.

## Acceptance tests required before runtime conversion

The existing integration runner at [run-integration-tests.mjs](../../apps/api/scripts/run-integration-tests.mjs) and [setup-env.ts](../../apps/api/test-integration/setup-env.ts) refuses to fall back to the normal database and requires a distinct `TEST_DATABASE_URL` with a test database name. Preserve that guard. SQLite tests must create unique temporary directories and refuse the app's real data directory. Do not reset or seed the user's database to obtain a passing test.

| Test group | Required evidence |
| --- | --- |
| Schema manifest | All original 170 models classified local/cloud/shared; all 347 decimal mappings, four non-relational lists (three built-in and one enum array), 43 checks and six special indexes explicitly covered; include subsequent additive schema changes separately |
| Decimal fidelity | Every declared scale/precision, precision-24 maximum-range values, negatives where allowed, nulls, half-rounding boundaries, sums beyond 64 bits, exact increments and repeated reversal; compare PostgreSQL results |
| Query behavior | Exact aggregate/grouping/ordering with pagination, no-row totals, mixed Bangla/English search, normalized duplicates, DATE-only and timezone boundaries |
| Workflow parity | Real Tender -> document purchase -> security/PG/BG -> contract/budget -> bill/receipt -> closeout; procurement -> supplier bill/payment; HR/payroll; assets; LC/inventory; general expense |
| Accounting integrity | Double-entry balance, source idempotency, protected accounts, closed-period rejection, cash/subledger/GL equality, overpayment/over-receipt rejection, reversal history |
| Transaction failure | Inject failures before/after every financial write and outbox/inbox write; prove full rollback or full commit, including audit where required |
| Local concurrency | Concurrent save/report, duplicate command delivery, stale version, busy/locked DB retry, app single-instance ownership |
| Multi-device sync | Two devices offline editing same aggregate, duplicate financial replay, forbidden tenant IDs, permission revoked while offline, out-of-order messages, reconnect, invalid payload version |
| Migration | Fresh initialization, upgrade from every supported local schema, interrupted migration, failed migration preserves prior store, backup restore round-trip |
| Crash/storage | Kill process during commit, restart, disk full, read-only/locked file, corrupt candidate file, WAL recovery, no automatic data deletion |
| Attachments | Restart during upload/download, checksum mismatch, duplicate file, unavailable file, backups include referenced versions |
| Restore and replay | Restore old snapshot then reconnect; already accepted operations are not duplicated; unsynced local operations remain recoverable |
| Packaging | Clean Windows account without PostgreSQL/Node/pnpm; offline launch after activation; upgrade/uninstall/reinstall data retention; measured startup/memory/save latency on minimum supported hardware |

Reuse the existing PostgreSQL service-driven suites in [test-integration](../../apps/api/test-integration), particularly `financial`, `procure-to-pay-regression`, `procurement`, `supplier-bill-ap`, `project-closeout-lifecycle`, `sales-quotations`, `transferred-modules`, `tender-vat-tax`, and tenant API coverage. Add the same domain acceptance fixtures through both repository implementations; do not replace them with mocks that merely mirror new adapter code.

No claim that all data is safe, every workflow is offline-ready, or the installer is configuration-free is justified until these gates have runtime evidence. The immediate safe outcome of this audit is a concrete conversion map that preserves the present application while exposing the work still required.
