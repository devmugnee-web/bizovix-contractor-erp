# Workspace Safety Rules

## Permanently protected Chart of Accounts

- Every `Account` row with `isSystem = true` is part of the fixed Chart of Accounts backbone and must be treated as protected data.
- Never delete, rename, deactivate, re-parent, demote, or unlock a protected account during resets, cleanup, testing, seeding, or bulk master-data deletion.
- A request such as "delete all accounts", "reset everything", or "delete all master data" does not authorize deletion of protected accounts.
- Before any direct database operation whose scope could include accounts, inspect and report the exact protected-account count and explicitly exclude those rows.
- If the user explicitly requests deletion of protected accounts, do not act on the first request. Explain that database protection must be bypassed, report the exact affected scope, and ask for a separate explicit confirmation naming the fixed Chart of Accounts. Do not infer confirmation from a general "yes" or "delete all" response.
- Normal application users and API calls must never be offered a bypass. Custom accounts (`isSystem = false`) may be managed under the normal validation rules.

