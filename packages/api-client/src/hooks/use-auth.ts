import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthUser, LoginPayload, LoginResult } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { tokenStorage } from "../token-storage";
import { queryKeys } from "./query-keys";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LoginPayload) =>
      apiRequest<LoginResult>("/auth/login", { method: "POST", body: payload, skipAuth: true }),
    onSuccess: (result) => {
      tokenStorage.setTokens(result.accessToken, result.refreshToken);
      queryClient.setQueryData(queryKeys.me, result.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      const refreshToken = tokenStorage.getRefreshToken();
      return apiRequest<null>("/auth/logout", {
        method: "POST",
        body: { refreshToken: refreshToken ?? "" },
      });
    },
    onSettled: () => {
      tokenStorage.clear();
      queryClient.clear();
    },
  });
}

export function useMe(enabled = true) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiRequest<AuthUser>("/auth/me"),
    enabled: enabled && !!tokenStorage.getAccessToken(),
    retry: false,
  });
}
