"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/services/api-client";
import {
  createAccount,
  createExpenseLedger,
  createLedgerItem,
  deleteAccount,
  deleteLedgerItem,
  getAccountDetail,
  getAccountTree,
  getPostableLedgers,
  getMoneyAccounts,
  listLedgerItems,
  reparentAccount,
  searchAccounts,
  setAccountStatus,
  suggestAccountCode,
  updateAccount,
  updateLedgerItem,
} from "@/services/accounts.service";
import type {
  AccountLevel,
  AccountNature,
  CreateAccountInput,
  CreateExpenseLedgerInput,
  CreateLedgerItemInput,
  UpdateAccountInput,
  UpdateLedgerItemInput,
} from "@/types/accounts";
import type { MoneyAccountType } from "@/types/accounts";

const treeKey = ["accounts", "tree"] as const;
const ledgersKey = ["accounts", "ledgers"] as const;

function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
    return false;
  }
  return failureCount < 2;
}

export function useAccountTreeQuery(enabled: boolean, includeInactiveHistory = false) {
  return useQuery({
    queryKey: [...treeKey, includeInactiveHistory ? "with-inactive-history" : "active"],
    queryFn: () => getAccountTree(includeInactiveHistory),
    enabled,
    retry: shouldRetry,
  });
}

export function usePostableLedgersQuery(enabled: boolean) {
  return useQuery({
    queryKey: ledgersKey,
    queryFn: getPostableLedgers,
    enabled,
    retry: shouldRetry,
  });
}

export function useMoneyAccountsQuery(enabled: boolean, type?: MoneyAccountType) {
  return useQuery({
    queryKey: ["accounts", "money-accounts", type ?? "all"],
    queryFn: () => getMoneyAccounts(type),
    enabled,
    retry: shouldRetry,
  });
}

export function useAccountSearchQuery(params: { q?: string; level?: string; status?: string }, enabled: boolean) {
  return useQuery({
    queryKey: ["accounts", "search", params],
    queryFn: () => searchAccounts(params),
    enabled,
    retry: shouldRetry,
  });
}

export function useSuggestAccountCodeQuery(params: { level: AccountLevel; nature: AccountNature; parentId: string | null; name: string }, enabled: boolean) {
  return useQuery({
    queryKey: ["accounts", "suggest-code", params],
    queryFn: () => suggestAccountCode(params),
    enabled,
    retry: shouldRetry,
    staleTime: 0,
  });
}

export function useAccountDetailQuery(id: string | null) {
  return useQuery({
    queryKey: ["accounts", "detail", id],
    queryFn: () => getAccountDetail(id!),
    enabled: Boolean(id),
    retry: shouldRetry,
  });
}

function useInvalidateAccounts() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    // Account opening balances create/update real posted journals. Refresh all
    // report, dashboard, day-book and cash/bank queries in the active client.
    void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "accounts" });
  };
}

export function useCreateAccountMutation() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => createAccount(input),
    onSuccess: invalidate,
  });
}

export function useCreateExpenseLedgerMutation() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: (input: CreateExpenseLedgerInput) => createExpenseLedger(input),
    onSuccess: invalidate,
  });
}

export function useUpdateAccountMutation() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAccountInput }) => updateAccount(id, input),
    onSuccess: invalidate,
  });
}

export function useReparentAccountMutation() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) => reparentAccount(id, parentId),
    onSuccess: invalidate,
  });
}

export function useSetAccountStatusMutation() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) => setAccountStatus(id, status),
    onSuccess: invalidate,
  });
}

export function useDeleteAccountMutation() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: invalidate,
  });
}

export function useLedgerItemsQuery(accountId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["accounts", "items", accountId],
    queryFn: () => listLedgerItems(accountId!),
    enabled: Boolean(accountId) && enabled,
    retry: shouldRetry,
  });
}

function useInvalidateLedgerItems(accountId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["accounts", "items", accountId] });
  };
}

export function useCreateLedgerItemMutation(accountId: string | null) {
  const invalidate = useInvalidateLedgerItems(accountId);
  return useMutation({
    mutationFn: (input: CreateLedgerItemInput) => createLedgerItem(accountId!, input),
    onSuccess: invalidate,
  });
}

export function useUpdateLedgerItemMutation(accountId: string | null) {
  const invalidate = useInvalidateLedgerItems(accountId);
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: UpdateLedgerItemInput }) => updateLedgerItem(accountId!, itemId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteLedgerItemMutation(accountId: string | null) {
  const invalidate = useInvalidateLedgerItems(accountId);
  return useMutation({
    mutationFn: (itemId: string) => deleteLedgerItem(accountId!, itemId),
    onSuccess: invalidate,
  });
}
