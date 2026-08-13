export const queryKeys = {
  me: ["auth", "me"] as const,
  dashboard: ["dashboard"] as const,
  organizations: (search?: string) => ["organizations", search ?? ""] as const,
  bankAccounts: ["bank-accounts"] as const,
  documentPurchases: (params?: unknown) => ["document-purchases", params ?? {}] as const,
  documentPurchaseStats: ["document-purchases", "stats"] as const,
  documentPurchase: (id: string) => ["document-purchases", id] as const,
};
