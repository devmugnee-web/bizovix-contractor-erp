# Bizovix Contractor ERP — Module Transfer Package

Source project: Mugnee ERP  
Prepared: 2026-09-02

This package contains the complete source reference needed to port:

1. LC Management
2. Asset Management
3. HR & Payroll Management
4. General Expense Management

## Start here

1. Open `docs/CODEX-IMPLEMENTATION-PROMPT.md` and give its full contents to Codex while Codex is opened in the Bizovix Contractor ERP repository.
2. Keep this transfer folder available and replace `<TRANSFER_PACKAGE_PATH>` in the prompt with this folder's absolute path.
3. Let Codex inspect the target project before changing it. The source is a behavioral reference; target conventions win for layout, authentication, tenant scoping, permissions, API wrappers, error handling, and styling.
4. Apply database changes through a new target-project migration. Never blindly replace the target `schema.prisma`, seed, or migration history.

## Folder map

- `curated-module-source/`: module-focused frontend/backend source, routes, migrations, and integration files.
- `complete-reference-snapshot/`: clean source-of-truth snapshot of the source project's application code and configuration. Use this to resolve shared dependencies omitted from the curated view.
- `docs/PORTING-GUIDE.md`: architecture, integration checklist, and validation requirements.
- `docs/FILE-MANIFEST.csv`: every packaged file with size and SHA-256 hash.
- `docs/SOURCE-GIT-STATE.txt`: source commit/worktree context at packaging time.

## Security and data policy

No `.env` files, credentials, database dumps, runtime databases, user uploads, `node_modules`, `.git`, build output, logs, or generated Prisma client are included. The package contains source code and database definitions only.

The fixed Chart of Accounts backbone (`Account.isSystem = true`) is protected. Do not delete, rename, deactivate, re-parent, demote, or unlock those accounts. Expense/asset/LC integrations must resolve or create only allowed custom ledgers under the target project's normal validation rules.

## Important interpretation

“General Expense Management” is represented by the operational Expenses workspace plus EXPENSE voucher entry/accounting flow and reports. HR employee reimbursement claims are also included under HR, but they are a separate workflow.
