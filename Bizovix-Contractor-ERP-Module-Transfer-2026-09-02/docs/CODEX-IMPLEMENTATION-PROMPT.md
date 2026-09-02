# Prompt for Codex in the Bizovix Contractor ERP repository

You are working inside the **Bizovix Contractor ERP** repository. Implement four production-ready modules by porting behavior from this source package:

`<TRANSFER_PACKAGE_PATH>`

Modules:

1. LC Management
2. Asset Management
3. HR & Payroll Management
4. General Expense Management

The target uses the same general stack, but do **not** blindly overwrite files. First inspect the whole target architecture, `AGENTS.md`, package versions, auth/tenant model, Prisma schema and migrations, API conventions, route/layout conventions, shared UI, accounting/inventory services, permission system, and menu construction. Read `<TRANSFER_PACKAGE_PATH>/README.md` and `docs/PORTING-GUIDE.md`, then inspect `curated-module-source`. Use `complete-reference-snapshot` whenever a dependency or behavior is outside the curated set.

Your goal is behavioral parity and native Bizovix integration—not a disconnected visual copy. Preserve all source workflows, validation, calculations, transaction boundaries, idempotency, permissions, reports, error states, empty/loading states, and tests, while adapting names/imports/layout/styling to Bizovix conventions.

Mandatory workflow:

1. Produce a concise source-to-target mapping and implementation plan after inspection; then continue implementation without waiting unless a genuinely product-changing ambiguity cannot be resolved from the repositories.
2. Reconcile database models/enums/relations/indexes with Bizovix. Reuse existing Organization/User/Account/Contact/Product/Warehouse/Inventory/Voucher/FiscalPeriod roots. Do not create duplicate platform roots. Create new target migrations; never replace Bizovix's full Prisma schema or migration history.
3. Port and register the Nest backend logic for LC, fixed assets, and HR. Adapt guards, permission decorators, tenant resolution, DTO validation, error format, accounting, inventory, fiscal-period, and audit conventions to Bizovix.
4. Port the frontend types, services, hooks, screens, dialogs, and App Router pages. Prefer Bizovix shared components and API client, but retain every action and state.
5. Add permission-aware menu/navigation entries in the correct native menu positions:
   - LC Management
   - Assets Management
   - HR & Payroll
   - Purchases & Expenses > Expenses, with Add Expense action if the menu pattern supports it
6. Implement General Expense Management as the operational Expenses workspace plus balanced EXPENSE voucher/accounting/report flow. Keep HR employee Expense Claims as a separate HR reimbursement workflow unless Bizovix already has an explicit posting bridge.
7. Preserve all LC connections: suppliers, products, warehouses, GRN, shipments, cost heads/entries, payment allocation, landed cost, voucher posting, inventory posting, status transitions/reopen, profit information, permissions, and reports.
8. Preserve all Asset connections: categories, register, acquisition, custodian/location/status/condition, depreciation settings and schedules, depreciation posting, vouchers, permissions, and reports.
9. Preserve the full HR surface: organization structures, employees, attendance/import, shifts, holidays, leave types/requests/approval, payroll settings/calculation/runs, employee changes, exit process, claims, loans/repayments, recruitment, candidates/applications, onboarding, and reports.
10. Add/adapt unit and integration tests. Verify with Prisma validate/generate, migrations against a safe development database, typecheck, lint, relevant tests, production web/API builds, and focused E2E smoke tests. Fix failures caused by the port.

Critical safety rule: every Account row with `isSystem = true` is the protected fixed Chart of Accounts backbone. Never delete, rename, deactivate, re-parent, demote, or unlock it. Never add a UI/API bypass. Resolve existing ledgers safely and create only allowed custom accounts through normal target validation. Do not delete/reset existing Bizovix data, roles, permissions, migrations, or user changes.

Quality bar:

- No placeholders, coming-soon pages, mocked persistence, skipped handlers, or TODO-only implementations.
- Server-side tenant isolation and authorization for every endpoint.
- Atomic, balanced, idempotent financial/inventory postings with duplicate-post prevention.
- Existing Bizovix behavior remains backward compatible.
- Responsive UI consistent with the target design system.
- Final handoff must list changed files, migrations, menu/routes, permission keys, tests run/results, and any remaining risk. Do not claim completion while required checks are failing.

Begin by reading the target instructions and both repositories, then implement end-to-end.
