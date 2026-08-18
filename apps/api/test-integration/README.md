# PostgreSQL integration tests

These suites run against a real, dedicated PostgreSQL database. They never fall back to the development `DATABASE_URL`.

1. Create an empty database whose name contains `test` (for example, `bizovix_contractor_erp_test_db`).
2. Set `TEST_DATABASE_URL` to that database. Do not make it equal to `DATABASE_URL`.
3. Run `pnpm test:integration` from the repository root.

The runner validates the target name, rejects the development URL, applies all committed migrations with `prisma migrate deploy`, then runs the suites serially. Fixture cleanup checks `current_database()` again before truncating application tables. `_prisma_migrations` is preserved.

Use `pnpm test:e2e` as the CI alias. Copy `.env.test.example` only as a template; never commit real credentials.
