import type { ApiErrorResponse, ApiSuccessResponse, PaginatedResponse, PaginationMeta } from "@bizovix/types";
import { getApiClientConfig } from "./config";
import { tokenStorage, type TokenSnapshot } from "./token-storage";
import { ApiError } from "./errors";
import { getDesktopRuntime, type DesktopRuntimeInfo } from "./desktop-runtime";

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  skipAuth?: boolean;
}

let refreshFlight: { sessionId: string | null; refreshToken: string; promise: Promise<boolean> } | null = null;

function assertSession(session: TokenSnapshot): void {
  if (!tokenStorage.isSameSession(session)) throw new ApiError("The signed-in account changed. Please review the current account before trying again.", 401, undefined, "SESSION_CHANGED");
}

function buildUrl(path: string, params?: RequestOptions["params"], desktopBaseUrl?: string): string {
  const baseUrl = desktopBaseUrl ?? getApiClientConfig().baseUrl;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//, ""), normalizedBase);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function rawRequest(path: string, options: RequestOptions, session: TokenSnapshot, desktop: DesktopRuntimeInfo | null): Promise<Response> {
  assertSession(session);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  return fetch(buildUrl(path, options.params, desktop?.localApiUrl), {
    method: options.method ?? "GET",
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...(session.accessToken && !options.skipAuth ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...(desktop?.localCapability ? { "X-Bizovix-Local-Capability": desktop.localCapability } : {}),
    },
    body: options.body !== undefined ? (isFormData ? options.body as FormData : JSON.stringify(options.body)) : undefined,
  });
}

async function tryRefreshToken(session: TokenSnapshot, desktop: DesktopRuntimeInfo | null): Promise<boolean> {
  assertSession(session);
  const current = tokenStorage.snapshot();
  // A concurrent request may have rotated this session while our denial was in flight.
  if (current.accessToken !== session.accessToken) return Boolean(current.accessToken);
  if (!current.refreshToken) return false;
  if (refreshFlight?.sessionId === current.sessionId && refreshFlight.refreshToken === current.refreshToken) return refreshFlight.promise;
  const flight = { sessionId: current.sessionId, refreshToken: current.refreshToken, promise: Promise.resolve(false) };
  flight.promise = (async () => {
    try {
      const response = await rawRequest("/auth/refresh", { method: "POST", body: { refreshToken: current.refreshToken }, skipAuth: true }, current, desktop);
      if (!response.ok) return false;
      const json = await response.json() as ApiSuccessResponse<{ accessToken: string; refreshToken: string }>;
      if (json?.success !== true || typeof json.data?.accessToken !== "string" || !json.data.accessToken || typeof json.data.refreshToken !== "string" || !json.data.refreshToken) return false;
      return tokenStorage.replaceIfCurrent(current, json.data.accessToken, json.data.refreshToken);
    } catch {
      return false;
    } finally {
      if (refreshFlight === flight) refreshFlight = null;
    }
  })();
  refreshFlight = flight;
  return flight.promise;
}

async function isGuardDenial(response: Response, desktop: DesktopRuntimeInfo | null): Promise<boolean> {
  const denial = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
  if (denial?.success !== false) return false;
  // Only the current pre-controller guards permit replay. Unknown business 401s
  // and network failures never authorize retrying a potentially committed write.
  return desktop
    ? denial.code === "LOCAL_REQUEST_FAILED" && denial.message === "Please sign in."
    : denial.code === undefined && denial.message === "Unauthorized";
}

async function requestWithRefresh(path: string, options: RequestOptions): Promise<{ response: Response; session: TokenSnapshot }> {
  let session = tokenStorage.snapshot();
  const desktop = await getDesktopRuntime();
  let response = await rawRequest(path, options, session, desktop);
  assertSession(session);
  if (response.status === 401 && !options.skipAuth && session.refreshToken && await isGuardDenial(response, desktop)) {
    assertSession(session);
    const refreshed = await tryRefreshToken(session, desktop);
    assertSession(session);
    if (refreshed) {
      await response.body?.cancel();
      assertSession(session);
      session = tokenStorage.snapshot();
      response = await rawRequest(path, options, session, desktop);
      assertSession(session);
    }
  }
  return { response, session };
}

async function requestEnvelope(path: string, options: RequestOptions): Promise<Record<string, unknown>> {
  const { response, session } = await requestWithRefresh(path, options);
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  assertSession(session);
  if (!response.ok) {
    if (response.status === 401 && !options.skipAuth) tokenStorage.clearIfCurrent(session);
    const errorBody = json as unknown as ApiErrorResponse | null;
    throw new ApiError(errorBody?.message ?? "Request failed", response.status, errorBody?.errors, typeof json?.code === "string" ? json.code : undefined);
  }
  return json ?? {};
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const envelope = (await requestEnvelope(path, options)) as unknown as ApiSuccessResponse<T>;
  return envelope.data;
}

export async function apiRequestPaginated<T>(path: string, options: RequestOptions = {}): Promise<{ items: T[]; meta: PaginationMeta }> {
  const envelope = (await requestEnvelope(path, options)) as unknown as PaginatedResponse<T>;
  return { items: envelope.data, meta: envelope.meta };
}

export async function apiRequestPaginatedWithSummary<T, S>(path: string, options: RequestOptions = {}): Promise<{ items: T[]; meta: PaginationMeta; summary: S }> {
  const envelope = (await requestEnvelope(path, options)) as unknown as PaginatedResponse<T> & { summary: S };
  return { items: envelope.data, meta: envelope.meta, summary: envelope.summary };
}

/** For binary downloads (file bytes, not a JSON envelope) — e.g. document/invoice downloads. */
export async function apiRequestBlob(path: string, options: RequestOptions = {}): Promise<{ blob: Blob; fileName: string | null }> {
  const { response, session } = await requestWithRefresh(path, options);
  if (!response.ok) {
    const json = await response.json().catch(() => null) as Record<string, unknown> | null;
    assertSession(session);
    if (response.status === 401 && !options.skipAuth) tokenStorage.clearIfCurrent(session);
    throw new ApiError(typeof json?.message === "string" ? json.message : "Failed to download file", response.status, undefined, typeof json?.code === "string" ? json.code : undefined);
  }
  const disposition = response.headers.get("Content-Disposition");
  const match = disposition ? /filename="?([^"]+)"?/.exec(disposition) : null;
  const fileName = match?.[1] ? decodeURIComponent(match[1]) : null;
  const blob = await response.blob();
  assertSession(session);
  return { blob, fileName };
}
