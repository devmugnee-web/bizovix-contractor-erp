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
