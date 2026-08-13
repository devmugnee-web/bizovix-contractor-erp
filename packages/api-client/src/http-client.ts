import type { ApiErrorResponse, ApiSuccessResponse, PaginatedResponse, PaginationMeta } from "@bizovix/types";
import { getApiClientConfig } from "./config";
import { tokenStorage } from "./token-storage";
import { ApiError } from "./errors";

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  skipAuth?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const { baseUrl } = getApiClientConfig();
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//, ""), normalizedBase);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const accessToken = tokenStorage.getAccessToken();
  return fetch(buildUrl(path, options.params), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken && !options.skipAuth ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

async function tryRefreshToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = tokenStorage.getRefreshToken();
      if (!refreshToken) return false;
      try {
        const response = await rawRequest("/auth/refresh", {
          method: "POST",
          body: { refreshToken },
          skipAuth: true,
        });
        if (!response.ok) return false;
        const json = (await response.json()) as ApiSuccessResponse<{
          accessToken: string;
          refreshToken: string;
        }>;
        tokenStorage.setTokens(json.data.accessToken, json.data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function requestEnvelope(path: string, options: RequestOptions): Promise<Record<string, unknown>> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && !options.skipAuth && tokenStorage.getRefreshToken()) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      response = await rawRequest(path, options);
    }
  }

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    if (response.status === 401) tokenStorage.clear();
    const errorBody = json as unknown as ApiErrorResponse | null;
    throw new ApiError(errorBody?.message ?? "Request failed", response.status, errorBody?.errors);
  }

  return json ?? {};
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const envelope = (await requestEnvelope(path, options)) as unknown as ApiSuccessResponse<T>;
  return envelope.data;
}

export async function apiRequestPaginated<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ items: T[]; meta: PaginationMeta }> {
  const envelope = (await requestEnvelope(path, options)) as unknown as PaginatedResponse<T>;
  return { items: envelope.data, meta: envelope.meta };
}
