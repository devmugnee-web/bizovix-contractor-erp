WITH permission_seed("key", "resource", "action", "moduleKey") AS (
  VALUES
    ('sale.view', 'sale', 'view', 'accounting'),
    ('sale.view.own', 'sale', 'view_own', 'accounting'),
    ('sale.create', 'sale', 'create', 'accounting'),
    ('sale.edit', 'sale', 'edit', 'accounting'),
    ('sale.edit.own', 'sale', 'edit_own', 'accounting'),
    ('sale.share', 'sale', 'share', 'accounting'),
    ('sale.share.own', 'sale', 'share_own', 'accounting'),
    ('sale.delete', 'sale', 'delete', 'accounting'),
    ('sale.delete.own', 'sale', 'delete_own', 'accounting'),
    ('payment_in.view', 'payment_in', 'view', 'accounting'),
    ('payment_in.view.own', 'payment_in', 'view_own', 'accounting'),
    ('payment_in.create', 'payment_in', 'create', 'accounting'),
    ('payment_in.edit', 'payment_in', 'edit', 'accounting'),
    ('payment_in.edit.own', 'payment_in', 'edit_own', 'accounting'),
    ('payment_in.share', 'payment_in', 'share', 'accounting'),
    ('payment_in.share.own', 'payment_in', 'share_own', 'accounting'),
    ('payment_in.delete', 'payment_in', 'delete', 'accounting'),
    ('payment_in.delete.own', 'payment_in', 'delete_own', 'accounting'),
    ('sale_order.view', 'sale_order', 'view', 'accounting'),
    ('sale_order.view.own', 'sale_order', 'view_own', 'accounting'),
    ('sale_order.create', 'sale_order', 'create', 'accounting'),
    ('sale_order.edit', 'sale_order', 'edit', 'accounting'),
    ('sale_order.edit.own', 'sale_order', 'edit_own', 'accounting'),
    ('sale_order.share', 'sale_order', 'share', 'accounting'),
    ('sale_order.share.own', 'sale_order', 'share_own', 'accounting'),
    ('sale_order.delete', 'sale_order', 'delete', 'accounting'),
    ('sale_order.delete.own', 'sale_order', 'delete_own', 'accounting'),
    ('credit_note.view', 'credit_note', 'view', 'accounting'),
    ('credit_note.view.own', 'credit_note', 'view_own', 'accounting'),
    ('credit_note.create', 'credit_note', 'create', 'accounting'),
    ('credit_note.edit', 'credit_note', 'edit', 'accounting'),
    ('credit_note.edit.own', 'credit_note', 'edit_own', 'accounting'),
    ('credit_note.share', 'credit_note', 'share', 'accounting'),
    ('credit_note.share.own', 'credit_note', 'share_own', 'accounting'),
    ('credit_note.delete', 'credit_note', 'delete', 'accounting'),
    ('credit_note.delete.own', 'credit_note', 'delete_own', 'accounting'),
    ('delivery_challan.view', 'delivery_challan', 'view', 'accounting'),
    ('delivery_challan.view.own', 'delivery_challan', 'view_own', 'accounting'),
    ('delivery_challan.create', 'delivery_challan', 'create', 'accounting'),
    ('delivery_challan.edit', 'delivery_challan', 'edit', 'accounting'),
    ('delivery_challan.edit.own', 'delivery_challan', 'edit_own', 'accounting'),
    ('delivery_challan.share', 'delivery_challan', 'share', 'accounting'),
    ('delivery_challan.share.own', 'delivery_challan', 'share_own', 'accounting'),
    ('delivery_challan.delete', 'delivery_challan', 'delete', 'accounting'),
    ('delivery_challan.delete.own', 'delivery_challan', 'delete_own', 'accounting'),
    ('estimate.view', 'estimate', 'view', 'accounting'),
    ('estimate.view.own', 'estimate', 'view_own', 'accounting'),
    ('estimate.create', 'estimate', 'create', 'accounting'),
    ('estimate.edit', 'estimate', 'edit', 'accounting'),
    ('estimate.edit.own', 'estimate', 'edit_own', 'accounting'),
    ('estimate.share', 'estimate', 'share', 'accounting'),
    ('estimate.share.own', 'estimate', 'share_own', 'accounting'),
    ('estimate.delete', 'estimate', 'delete', 'accounting'),
    ('estimate.delete.own', 'estimate', 'delete_own', 'accounting'),
    ('expense.view', 'expense', 'view', 'accounting'),
    ('expense.view.own', 'expense', 'view_own', 'accounting'),
    ('expense.create', 'expense', 'create', 'accounting'),
    ('expense.edit', 'expense', 'edit', 'accounting'),
    ('expense.edit.own', 'expense', 'edit_own', 'accounting'),
    ('expense.share', 'expense', 'share', 'accounting'),
    ('expense.share.own', 'expense', 'share_own', 'accounting'),
    ('expense.delete', 'expense', 'delete', 'accounting'),
    ('expense.delete.own', 'expense', 'delete_own', 'accounting'),
    ('party.view', 'party', 'view', 'accounting'),
    ('party.view.own', 'party', 'view_own', 'accounting'),
    ('party.create', 'party', 'create', 'accounting'),
    ('party.edit', 'party', 'edit', 'accounting'),
    ('party.edit.own', 'party', 'edit_own', 'accounting'),
    ('party.share', 'party', 'share', 'accounting'),
    ('party.share.own', 'party', 'share_own', 'accounting'),
    ('party.delete', 'party', 'delete', 'accounting'),
    ('party.delete.own', 'party', 'delete_own', 'accounting'),
    ('item.view', 'item', 'view', 'inventory'),
    ('item.view.own', 'item', 'view_own', 'inventory'),
    ('item.create', 'item', 'create', 'inventory'),
    ('item.edit', 'item', 'edit', 'inventory'),
    ('item.edit.own', 'item', 'edit_own', 'inventory'),
    ('item.share', 'item', 'share', 'inventory'),
    ('item.share.own', 'item', 'share_own', 'inventory'),
    ('item.delete', 'item', 'delete', 'inventory'),
    ('item.delete.own', 'item', 'delete_own', 'inventory'),
    ('proforma.view', 'proforma', 'view', 'accounting'),
    ('proforma.view.own', 'proforma', 'view_own', 'accounting'),
    ('proforma.create', 'proforma', 'create', 'accounting'),
    ('proforma.edit', 'proforma', 'edit', 'accounting'),
    ('proforma.edit.own', 'proforma', 'edit_own', 'accounting'),
    ('proforma.share', 'proforma', 'share', 'accounting'),
    ('proforma.share.own', 'proforma', 'share_own', 'accounting'),
    ('proforma.delete', 'proforma', 'delete', 'accounting'),
    ('proforma.delete.own', 'proforma', 'delete_own', 'accounting')
)
INSERT INTO "Permission" ("id", "key", "moduleKey", "resource", "action", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."key", p."moduleKey", p."resource", p."action", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM permission_seed p
ON CONFLICT ("key") DO NOTHING;

-- Backfill only OWNER/SUPER_ADMIN/ADMIN with the 50 FULL (non-".own") keys —
-- these roles already have unrestricted access under the old coarse keys
-- (accounting.voucher.create/post/delete, accounting.ledger.create,
-- inventory.stock_item.create), which this migration does not remove.
-- The ".own" keys are intentionally NOT granted to these roles: having the
-- full key already satisfies the guard's "full OR own" check, so granting
-- ".own" too would be redundant, not more permissive.
--
-- Per-user "sync_share_<userId>" roles (created by the Add User screen) are
-- NOT touched here — their RolePermission rows are regenerated at save time
-- by WorkspacesService.saveShareUser from the owner-configured matrix, which
-- is exactly the behavior this whole change is meant to make real.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "allowed")
SELECT gen_random_uuid()::text, r."id", p."id", true
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."code" IN ('OWNER', 'SUPER_ADMIN', 'ADMIN')
  AND p."key" IN (
    'sale.view', 'sale.create', 'sale.edit', 'sale.share', 'sale.delete',
    'payment_in.view', 'payment_in.create', 'payment_in.edit', 'payment_in.share', 'payment_in.delete',
    'sale_order.view', 'sale_order.create', 'sale_order.edit', 'sale_order.share', 'sale_order.delete',
    'credit_note.view', 'credit_note.create', 'credit_note.edit', 'credit_note.share', 'credit_note.delete',
    'delivery_challan.view', 'delivery_challan.create', 'delivery_challan.edit', 'delivery_challan.share', 'delivery_challan.delete',
    'estimate.view', 'estimate.create', 'estimate.edit', 'estimate.share', 'estimate.delete',
    'expense.view', 'expense.create', 'expense.edit', 'expense.share', 'expense.delete',
    'party.view', 'party.create', 'party.edit', 'party.share', 'party.delete',
    'item.view', 'item.create', 'item.edit', 'item.share', 'item.delete',
    'proforma.view', 'proforma.create', 'proforma.edit', 'proforma.share', 'proforma.delete'
  )
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "allowed" = true;
