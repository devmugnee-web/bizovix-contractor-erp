export const PERMISSIONS = [
  "dashboard.view",

  "document_purchase.create",
  "document_purchase.read",
  "document_purchase.update",
  "document_purchase.delete",
  "document_purchase.export",

  "tender_security.create",
  "tender_security.read",
  "tender_security.update",
  "tender_security.mark_not_required",

  "credit_commitment.create",
  "credit_commitment.read",
  "credit_commitment.update",
  "credit_commitment.delete",

  "pg_bg.read",
  "pg_bg.create",
  "pg_bg.update",
  "pg_bg.accept_noa",
  "pg_bg.save_draft",

  "cms.work.read",
  "cms.work.create",
  "cms.work.update",
  "cms.work.archive",
  "cms.work.export",
  "cms.work.restore",

  "expense.create",
  "expense.read",
  "expense.approve",

  "receipt.create",
  "receipt.read",

  "report.view",
  "report.export",

  "user.manage",
  "role.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
