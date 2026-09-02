# Porting Guide

## Source stack

- Web: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- Client data: TanStack Query 5, React Hook Form, Zod
- API: NestJS 11, Prisma 6, PostgreSQL-compatible schema
- UI support: Radix UI, Lucide, Sonner, Recharts, XLSX

## Module boundaries

### LC Management

Frontend routes live under `src/app/app/lc-management`; screens, dialogs, hooks, services, types, currency configuration, and empty states are included. Backend behavior lives under `apps/api/src/lc`. The workflow covers LC master/detail/edit, status history, shipments, cost heads, cost entries, mixed payment allocations, GRN, landed-cost allocation, purchase-payment state, inventory posting, reopening, and permission checks.

LC is not isolated: it integrates with contacts/suppliers, products, warehouses, inventory, vouchers, accounts, fiscal periods, permissions, and organization scoping. Preserve transaction boundaries and idempotency around voucher/inventory posting.

### Asset Management

The frontend route, screen, query hook, service, and types are included. Backend behavior lives under `apps/api/src/fixed-assets`. It covers categories, asset register, acquisition/source information, assignment/location/custodian fields, condition/status, depreciation configuration, depreciation posting, and accounting voucher integration.

Do not duplicate depreciation postings. Preserve accumulated-depreciation and depreciation-expense ledger behavior, fiscal-period checks, and organization scoping.

### HR & Payroll

Frontend material includes the HR workspace and all supporting employee, leave, attendance, lifecycle, shift/holiday, payroll, loan, recruitment, onboarding, reporting, and expense-claim screens. Backend behavior lives under `apps/api/src/hr`.

Port the complete workflow: organization structures, employee lifecycle, attendance import/time rules, shifts/holidays, leave types and approval, payroll settings/calculation/runs, employee changes/exits, expense claims, employee loans/repayments, recruitment/applications, onboarding, permissions, and reports. Payroll money and date calculations must retain source rounding and boundary behavior.

### General Expense Management

The general operational expense flow is shared across the purchase workspace, voucher entry, accounts, reports, API voucher/account modules, and Prisma models. The curated bundle includes the primary frontend integration files; the complete snapshot includes every referenced API/accounting dependency.

Required behavior includes expense listing/filtering, creating EXPENSE vouchers, debit expense ledger/credit cash-bank-or-payable balancing, tax/party/reference fields when supported, editing/deleting under fiscal and permission rules, account-ledger creation through normal validation, and expense reports/drill-down. HR `ExpenseClaim` is a separate employee reimbursement workflow and must not be merged into general vouchers unless the target project explicitly models reimbursement posting.

## Database integration rules

1. Inspect the Bizovix schema and migration history first.
2. Extract only required enums/models/relations/indexes from the supplied `apps/api/prisma/schema.prisma` and relevant migrations.
3. Reconcile names with existing Bizovix Organization/User/Account/Product/Warehouse/Voucher models; do not create parallel identity, tenancy, accounting, or inventory roots.
4. Generate one or more new migrations in Bizovix. Never copy migration history blindly and never replace its full schema.
5. Backfill safely if target tables already contain data. Add nullable fields first when required, backfill, then constrain.
6. Seed permissions idempotently. Preserve all existing roles and grants.
7. Protected accounts where `isSystem = true` are immutable. Do not provide an application/API bypass.

## Integration points

- Register `LcModule`, `FixedAssetsModule`, and `HrModule` in the target Nest application module (or target equivalents).
- Add target-style API routes, auth guards, organization/tenant scope, permission decorators, validation pipe behavior, and Swagger metadata.
- Add App Router pages using target layout conventions.
- Add sidebar/menu items for LC Management, Assets Management, HR & Payroll, and Purchases & Expenses > Expenses. Respect the target permission-driven menu system.
- Reuse target shared UI primitives and API client where possible; adapt visual composition without removing behavior.
- Connect LC to supplier/product/warehouse/inventory/voucher/account services.
- Connect assets and expenses to accounting/fiscal-period services.
- Connect HR to users only where the target already supports employee-user linkage.

## Recommended implementation order

1. Inventory target architecture and produce a source-to-target mapping.
2. Reconcile Prisma models/enums and migrate permissions.
3. Port backend modules and tests; wire shared services.
4. Port types/services/hooks.
5. Port routes/screens/dialogs and target-style menu entries.
6. Port general expense voucher/report integrations.
7. Run Prisma validation/generation, typecheck, lint, unit tests, build, and focused end-to-end smoke tests.

## Acceptance checklist

- All four menu entries are visible only to authorized users and route correctly.
- Every list/create/view/edit/approve/post action from the source has a working target equivalent.
- Organization boundaries prevent cross-tenant reads/writes.
- Permissions are enforced on the server, not only hidden in the UI.
- LC GRN, landed cost, payment, voucher, and inventory posting are transactional and cannot double-post.
- Asset depreciation cannot double-post and produces balanced accounting entries.
- Payroll calculations, leave balances, attendance imports, expense claims, loans, recruitment, onboarding, changes, and exits work.
- General expense vouchers remain balanced and appear in ledger, day book, expense reports, P&L, and cash/bank movements as applicable.
- Existing Bizovix features and data remain intact.
- No protected system account is mutated.
- Typecheck, lint, relevant unit tests, production builds, and smoke tests pass.

## Package completeness

The curated directory is intentionally focused. If an import or business rule points outside it, use the same relative path in `complete-reference-snapshot`. `FILE-MANIFEST.csv` can verify that a copied file is byte-identical to this package.
