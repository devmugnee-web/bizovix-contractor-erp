import { apiRequest } from "@/services/api-client";
import type {
  AccountDetail,
  AccountLevel,
  AccountNature,
  AccountNode,
  AccountSearchResult,
  CreateAccountInput,
  CreateExpenseLedgerInput,
  CreateLedgerItemInput,
  LedgerItem,
  LedgerOption,
  MoneyAccountOption,
  MoneyAccountType,
  UpdateAccountInput,
  UpdateLedgerItemInput,
} from "@/types/accounts";

// The Chart of Accounts hierarchy is a real-backend feature — it reflects each
// company's actual posting structure, so unlike dashboard/day-book/trial-balance
// it is not offered against the mock/demo datasets.
export function getAccountTree(includeInactiveHistory = false) {
  const suffix = includeInactiveHistory ? "?includeInactiveHistory=true" : "";
  return apiRequest<AccountNode[]>(`/accounts/tree${suffix}`);
}

export function getPostableLedgers() {
  return apiRequest<LedgerOption[]>("/accounts/ledgers");
}

export function getMoneyAccounts(type?: MoneyAccountType) {
  const suffix = type ? `?type=${encodeURIComponent(type)}` : "";
  return apiRequest<MoneyAccountOption[]>(`/accounts/money-accounts${suffix}`);
}

export function suggestAccountCode(params: { level: AccountLevel; nature: AccountNature; parentId: string | null; name: string }) {
  const query = new URLSearchParams({ level: params.level, nature: params.nature });
  if (params.parentId) query.set("parentId", params.parentId);
  if (params.name.trim()) query.set("name", params.name.trim());
  return apiRequest<{ code: string }>(`/accounts/suggest-code?${query.toString()}`);
}

export function searchAccounts(params: { q?: string; level?: string; status?: string }) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.level) query.set("level", params.level);
  if (params.status) query.set("status", params.status);
  const suffix = query.toString();
  return apiRequest<AccountSearchResult[]>(`/accounts/search${suffix ? `?${suffix}` : ""}`);
}

export function getAccountDetail(id: string) {
  return apiRequest<AccountDetail>(`/accounts/${encodeURIComponent(id)}`);
}

export function createAccount(input: CreateAccountInput) {
  return apiRequest<AccountNode>("/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createExpenseLedger(input: CreateExpenseLedgerInput) {
  return apiRequest<AccountNode>("/accounts/expense-ledgers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAccount(id: string, input: UpdateAccountInput) {
  return apiRequest<AccountNode>(`/accounts/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function reparentAccount(id: string, parentId: string | null) {
  return apiRequest<AccountNode>(`/accounts/${encodeURIComponent(id)}/reparent`, {
    method: "POST",
    body: JSON.stringify({ parentId }),
  });
}

export function setAccountStatus(id: string, status: "ACTIVE" | "INACTIVE") {
  return apiRequest<AccountNode>(`/accounts/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export function deleteAccount(id: string) {
  return apiRequest<{ success: boolean; id: string }>(`/accounts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function listLedgerItems(accountId: string) {
  return apiRequest<LedgerItem[]>(`/accounts/${encodeURIComponent(accountId)}/items`);
}

export function createLedgerItem(accountId: string, input: CreateLedgerItemInput) {
  return apiRequest<LedgerItem>(`/accounts/${encodeURIComponent(accountId)}/items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateLedgerItem(accountId: string, itemId: string, input: UpdateLedgerItemInput) {
  return apiRequest<LedgerItem>(`/accounts/${encodeURIComponent(accountId)}/items/${encodeURIComponent(itemId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteLedgerItem(accountId: string, itemId: string) {
  return apiRequest<{ success: boolean; id: string }>(`/accounts/${encodeURIComponent(accountId)}/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}
