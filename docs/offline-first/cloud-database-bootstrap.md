# Safe fresh cloud database bootstrap

This is a PostgreSQL **cloud/server** setup tool. The desktop installer continues to own its bundled SQLite database; customers do not install PostgreSQL or run these commands.

The fresh-server path is `node scripts/bootstrap-cloud-database.mjs`. It creates a uniquely named new PostgreSQL 18 database, restores the checked baseline, verifies the schema and empty business tables, and records the original migration history using Prisma 6.19.3 `migrate resolve --applied`. It prints the new database name only after each verified phase. It never changes `.env`, starts an application against the new database, or replaces an existing database.

## Why a separate baseline exists

Two original migration files begin with non-SQL Prisma CLI warning text:

- `20260820160000_rename_device_osinfo_to_platform/migration.sql`
- `20260820163000_add_trial_device_id/migration.sql`

They prevent a normal fresh `prisma migrate deploy`. Several older migrations also insert demo records. Rewriting files that other installations may already have applied would change their historical checksums. All earlier source migration files remain unchanged, including the independently added bank-account EMI date and document-purchase bank-charge migrations. The current 74-file history includes three UOM/payment-term sync metadata tables and the additive widening of their three entity-type CHECKs for Organizations/Clients.

The audit replay removes only these two exact warning prefixes **in memory**, then executes all 74 migrations in a newly created scratch database. It does not read the application's schema or records. A checked reconciliation file aligns the scratch schema's foreign-key actions/names, generated names, and timestamp default with current Prisma. SQL-only CHECK constraints, partial/expression indexes, and the `cms_works_organizationId_closedAt_idx` and `dlp_defects_organizationId_priority_status_idx` lookup indexes remain present. The reviewed reconciliation starts with an executable database-name guard accepting only generated `bizovix_test_history_...` scratch names; it is not a repair script for existing customer installations.

The generator uses PostgreSQL `pg_dump --schema-only --no-owner --no-privileges` on that scratch database. The result has 178 business/metadata tables, 2,658 columns, 530 indexes, 102 enums, 53 CHECK constraints, six partial/expression indexes, and 462 foreign keys. Only the 257 permission keys from the source permission catalog and three existing standard plan definitions are separately initialized. No demo users, passwords, companies, customer data, ledger entries, licenses, or sessions are copied.

The PostgreSQL dump preserves schema objects beyond Prisma's representation; see [PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html). Recording already-created schema as applied uses Prisma's documented [v6 baselining workflow](https://docs.prisma.io/docs/orm/v6/prisma-migrate/getting-started).

## Commands

Run from the repository root on the PostgreSQL host. Node and the repository's pinned Prisma dependencies must already be installed.

```powershell
# Offline artifact/source validation; no database connection.
node scripts/bootstrap-cloud-database.mjs --verify-artifacts

# Create a new, automatically named cloud database.
node scripts/bootstrap-cloud-database.mjs

# Or request a specific NEW database name; existing names are refused.
node scripts/bootstrap-cloud-database.mjs --create-name bizovix_cloud_new

# Isolated bootstrap, financial constraint, safety, and migration-history checks.
node scripts/test-cloud-baseline.mjs

# No-DB safety checks, including hostile inherited PGHOSTADDR and CRLF/LF portability.
node --test --test-isolation=none scripts/test/cloud-bootstrap.test.mjs

# No-DB compatibility preflight checks for legacy schema snapshots.
node --test --test-isolation=none scripts/test/snapshot-sync-schema.test.mjs

# Populated legacy metadata upgrade proof, in a NEW guarded fixture database.
node scripts/test-snapshot-sync-schema.mjs

# Real desktop/cloud service integration tests, defaulting to this source-only baseline.
node scripts/test-desktop-cloud.mjs --baseline

# All business and desktop integration suites, in a NEW exact-name-guarded fixture DB.
node scripts/test-desktop-cloud.mjs --all-integration

# Reproduce and audit source migration replay in a new scratch database.
node scripts/audit-cloud-migration-history.mjs

# Regenerate artifacts only after reviewing any reported schema differences.
node scripts/audit-cloud-migration-history.mjs --build-baseline
```

The helper uses the local server credentials from `BIZOVIX_CLOUD_BOOTSTRAP_URL`, or the root `.env` `DATABASE_URL` when no override is set. It never connects to the database named in that URL. Only loopback PostgreSQL hosts and the `public` schema are accepted. Inherited `PG*` variables are replaced with a controlled endpoint and credentials; URL query options cannot redirect Prisma to another host or socket. The database user needs permission to create a new database. `BIZOVIX_POSTGRES_BIN` can point to the PostgreSQL 18 binaries; defaults are `C:\Program Files\PostgreSQL\18\bin` on Windows and `/usr/bin` on Linux. A future VPS deployment runs this helper on that server with its own credentials.

`--schema-snapshot` remains an explicit legacy option on the desktop integration runner, and reads only the existing local application's catalog. The source connection is read-only and no rows are copied. After importing into its exact newly created test database, the runner verifies the five category-sync and three master-sync tables against the reviewed baseline, including column types/nullability/defaults, primary keys/indexes, CHECKs and foreign keys. It also refuses deferred primary/unique keys or invalid/not-ready indexes, which ordinary index-definition text does not expose. A wholly absent family receives the reviewed additive migrations; an already matching family is skipped. A complete, exactly recognized pre-organization master family can receive only migration 74's three-CHECK upgrade. Other partial or mismatched families are refused before sync DDL runs. Missing families and the recognized upgrade apply in one guarded public-schema transaction and are verified afterward. This does not repair unrelated legacy domain-schema drift; integration tests may still fail if the source catalog is incompatible with current services. `--legacy-migrations` intentionally exercises the old deployment path and reproduces the malformed-file blocker. Neither is the default.

The current snapshot compatibility helper passes ten focused no-database tests plus the five bootstrap safety tests. The reproducible `node scripts/test-snapshot-sync-schema.mjs` proof passed six real PostgreSQL checks in 12.607 seconds on newly created `bizovix_test_bootstrap_1789997399066_e86065`. It verifies the recognized populated pre-organization schema upgrade, preserving fixture rows, versions, clocks, feed JSON and receipts across all 11 fixture tables. It also refuses partial/default-mismatched schemas, a real deferrable key, and a wrong live database identity before helper DDL. Evidence is `.temp/bizovix_test_bootstrap_1789997399066_e86065-snapshot-upgrade-proof.json`.

The earlier baseline-73 helper proof on `bizovix_test_bootstrap_1789990251876_fa9939` also remains: six checks covered absent-family apply, matching-family skip and the four unsafe states above, with all 11 fixture tables empty. Its evidence is `.temp/bizovix_test_bootstrap_1789990251876_fa9939-snapshot-helper-proof.json`. These prove helper behavior, not the complete optional snapshot CLI: the combined application-catalog dump/import and integration-test mode has not been rerun during the current desktop packaging freeze. The default desktop integration path was exercised against fresh source baseline 74 and does not need the application's catalog.

`--all-integration` uses only the source baseline and runs every integration specification, including desktop sync. Existing suites may clear their own fixtures and exercise test-only bank identity seeding, but setup and cleanup must match the exact newly generated database name. They never reset an existing application or test database. Optional browser E2E checks are disabled. JSON results and logs are retained under the ignored `.temp` directory, together with the isolated database for inspection.

## Preservation and acceptance boundaries

- An existing target database is always refused, even if empty. These helpers do not drop databases, reset/truncate customer data, fall back to an existing database, or automatically clean up retained test databases. Historical schema ALTER/DROP statements run only during the guarded scratch replay.
- The schema SQL itself starts with an empty-database guard. The bootstrap applies schema and reference values in one transaction. Source/artifact mismatches fail before creating the target.
- A manifest pins the schema, permission catalog, every original migration, and generated artifacts. Changed sources require regeneration and review. Source/artifact hashes normalize CRLF to LF so a legitimate Windows/Linux checkout remains portable; Prisma history is checked against each host's actual migration bytes. A complete catalog comparison includes columns/types/defaults/nullability, every ordinary/unique/primary/special index, all CHECK definitions, enum labels, and all foreign keys. Catalog ordering is independent of the server's text collation. A separate Prisma diff allows only the two deliberately retained SQL-only lookup indexes.
- Prisma records each original migration using its supported baseline command, then the helper verifies those recorded checksums. If a step fails, the newly created database is retained for inspection; it must not be configured as the application database until a complete run passes.
- Acceptance checks reject the configured source database, existing targets, and nonempty direct SQL replay. They exercise rejection of a negative tax amount, rejection of a duplicate active financial reference, retention of voided history with a replacement reference, exact `numeric(24,6)` storage, and a subsequent Prisma deploy with no pending migrations.

This establishes a clean schema and public reference catalog. It does not onboard real companies/admins, deploy a VPS, migrate an existing customer's records, issue SaaS licenses, or prove the full ERP can work offline. The current data-preserving master sync and remaining domain conversion are tracked separately in [implementation status](implementation-status.md).
