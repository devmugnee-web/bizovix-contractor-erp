import { appConfig } from "@/config/app";
import { useSessionStore } from "@/stores/session-store";
import type { AppAuthSession } from "@/types/api";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function isLocalDevelopmentHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function getApiBaseUrl() {
  const configuredBaseUrl = appConfig.apiBaseUrl.replace(/\/$/, "");

  if (typeof window === "undefined" || !configuredBaseUrl) {
    return configuredBaseUrl;
  }

  try {
    const apiUrl = new URL(configuredBaseUrl);

    // The desktop app's NEXT_PUBLIC_API_BASE_URL is baked in at build time as
    // http://localhost:4001 — fine for a single PC, but the LAN "server mode"
    // feature serves the exact same built bundle to other PCs at this
    // machine's LAN IP instead. Rewriting a configured localhost/private-IP
    // API host to match window.location.hostname at runtime (previously only
    // done outside production, which meant it never ran in the packaged app
    // at all) makes the one bundle self-adjust to whichever host actually
    // served it — localhost stays localhost (no-op), a LAN IP becomes that
    // same LAN IP, so the client PC calls the server's API instead of its own
    // nonexistent local one. isLocalDevelopmentHost() keeps this a no-op for
    // the real hosted/cloud deployment, whose configured API host is a public
    // domain, not localhost or a private IP.
    if (apiUrl.protocol === "http:" && isLocalDevelopmentHost(apiUrl.hostname)) {
      apiUrl.hostname = window.location.hostname;
    }

    return apiUrl.toString().replace(/\/$/, "");
  } catch {
    return configuredBaseUrl;
  }
}

function buildUrl(path: string) {
  const baseUrl = getApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function parseApiError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return new ApiError(response.status, payload?.error?.message ?? "Request failed");
}

async function parseApiSuccess<T>(response: Response): Promise<T> {
  const body = await response.text();

  // Nest's Express adapter sends an empty successful response when a
  // controller returns null. That is a legitimate "not configured yet"
  // result for nullable reads such as manufacturing settings, and must not be
  // handed to Response.json(), which throws on an empty body.
  if (!body.trim()) return null as T;

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ApiError(
      response.status,
      "The API returned an invalid JSON response.",
    );
  }
}

function buildRequestInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  };
}

function shouldSkipRefresh(path: string) {
  return path.startsWith("/auth/login") || path.startsWith("/auth/signup") || path.startsWith("/auth/verify-email") || path.startsWith("/auth/refresh") || path.startsWith("/auth/logout");
}

let refreshRequest: Promise<void> | null = null;
let desktopSessionRequest: Promise<void> | null = null;

async function refreshApiSession() {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      const response = await fetch(buildUrl("/auth/refresh"), buildRequestInit({ method: "POST" }));

      if (!response.ok) {
        throw await parseApiError(response);
      }

      const snapshot = (await response.json()) as AppAuthSession;
      useSessionStore.getState().setSession("api", snapshot.user, snapshot.workspaceId ?? "");
    })().finally(() => {
      refreshRequest = null;
    });
  }

  return refreshRequest;
}

async function recoverDesktopApiSession() {
  if (!desktopSessionRequest) {
    desktopSessionRequest = (async () => {
      const response = await fetch(buildUrl("/auth/desktop-session"), buildRequestInit({ method: "POST" }));
      if (!response.ok) throw await parseApiError(response);

      // Do not publish the session to client state until the original
      // authenticated request succeeds. A Set-Cookie response can be accepted
      // while the cookie is still unavailable to a cross-site retry; exposing
      // it early would start another batch of protected queries.
      await response.json();
    })().finally(() => {
      desktopSessionRequest = null;
    });
  }

  return desktopSessionRequest;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await fetch(buildUrl(path), buildRequestInit(init));

  if (!response.ok && (response.status === 401 || response.status === 403) && !shouldSkipRefresh(path)) {
    try {
      await refreshApiSession();
      response = await fetch(buildUrl(path), buildRequestInit(init));
    } catch (refreshError) {
      // Only a confirmed 401/403 FROM the refresh call itself means the
      // refresh_token is actually invalid/expired. A network blip, timeout,
      // or 5xx while calling /auth/refresh (far more likely over a LAN
      // client PC's real network link than over loopback) says nothing about
      // token validity — treating it as an auth failure would wrongly force
      // a still-validly-authenticated LAN client back to /login.
      if (refreshError instanceof ApiError && (refreshError.status === 401 || refreshError.status === 403)) {
        try {
          await recoverDesktopApiSession();
          response = await fetch(buildUrl(path), buildRequestInit(init));
        } catch {
          // A persisted Zustand session can outlive both auth cookies (for
          // example after an API restart). Keeping that stale client session
          // leaves the app shell visible while every report shows a
          // misleading data-load error. Clearing it lets AppShell mint/
          // recover the local desktop session and reset authenticated
          // queries normally.
          useSessionStore.getState().clearSession("api");
          throw await parseApiError(response);
        }
      } else {
        throw refreshError;
      }
    }
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return parseApiSuccess<T>(response);
}
