import { useQuery } from "@tanstack/react-query";
import type { BankAccountOption } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { queryKeys } from "./query-keys";

export function useBankAccounts() {
  return useQuery({
    queryKey: queryKeys.bankAccounts,
    queryFn: () => apiRequest<BankAccountOption[]>("/bank-accounts"),
  });
}
