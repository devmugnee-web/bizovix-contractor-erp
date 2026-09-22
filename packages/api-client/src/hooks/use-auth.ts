import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthUser, LoginPayload, LoginResult } from "@bizovix/types";
import { apiRequest } from "../http-client";
import { tokenStorage } from "../token-storage";
import { queryKeys } from "./query-keys";
import { isLocalDesktop } from "../desktop-runtime";

let authenticationAttempt = 0;

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: () => ({ attempt: ++authenticationAttempt, session: tokenStorage.snapshot() }),
    mutationFn: (payload: LoginPayload & { previousPassword?: string }) =>
      apiRequest<LoginResult>("/auth/login", { method: "POST", body: isLocalDesktop() ? payload : { email: payload.email, password: payload.password }, skipAuth: true }),
    onSuccess: (result, _variables, context) => {
      if (!context || context.attempt !== authenticationAttempt || !tokenStorage.isSameSession(context.session)) return;
      queryClient.clear();
      tokenStorage.setTokens(result.accessToken, result.refreshToken);
      queryClient.setQueryData(queryKeys.me, result.user);
    },
  });
}

export function useDevLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: () => ({ attempt: ++authenticationAttempt, session: tokenStorage.snapshot() }),
    mutationFn: () => apiRequest<LoginResult>("/auth/dev-login", { method: "POST", skipAuth: true }),
    onSuccess: (result, _variables, context) => {
      if (!context || context.attempt !== authenticationAttempt || !tokenStorage.isSameSession(context.session)) return;
      queryClient.clear();
      tokenStorage.setTokens(result.accessToken, result.refreshToken);
      queryClient.setQueryData(queryKeys.me, result.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: () => ({ attempt: ++authenticationAttempt, session: tokenStorage.snapshot() }),
    mutationFn: () => {
      const refreshToken = tokenStorage.getRefreshToken();
      return apiRequest<null>("/auth/logout", {
        method: "POST",
        body: { refreshToken: refreshToken ?? "" },
      });
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context || context.attempt !== authenticationAttempt) return;
      const current = tokenStorage.snapshot();
      // A failed authenticated logout may already have cleared its own tokens.
      // Its cached data still needs clearing, while a newer account must survive.
      if (!tokenStorage.isSameSession(context.session) && (current.accessToken || current.refreshToken)) return;
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
