const ACCESS_TOKEN_KEY = "bizovix_access_token";
const REFRESH_TOKEN_KEY = "bizovix_refresh_token";
const SESSION_KEY = "bizovix_session_id";

export interface TokenSnapshot {
  sessionId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export const tokenStorage = {
  snapshot(): TokenSnapshot {
    if (!isBrowser()) return { sessionId: null, accessToken: null, refreshToken: null };
    const accessToken = this.getAccessToken(), refreshToken = this.getRefreshToken();
    let sessionId = window.localStorage.getItem(SESSION_KEY);
    if (!sessionId && (accessToken || refreshToken)) {
      sessionId = crypto.randomUUID();
      window.localStorage.setItem(SESSION_KEY, sessionId);
    }
    return { sessionId, accessToken, refreshToken };
  },
  isSameSession(previous: TokenSnapshot): boolean {
    return this.snapshot().sessionId === previous.sessionId;
  },
  isCurrent(previous: TokenSnapshot): boolean {
    const current = this.snapshot();
    return current.sessionId === previous.sessionId && current.accessToken === previous.accessToken && current.refreshToken === previous.refreshToken;
  },
  getAccessToken(): string | null {
    return isBrowser() ? window.localStorage.getItem(ACCESS_TOKEN_KEY) : null;
  },
  getRefreshToken(): string | null {
    return isBrowser() ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null;
  },
  setTokens(accessToken: string, refreshToken: string): void {
    if (!isBrowser()) return;
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    window.localStorage.setItem(SESSION_KEY, crypto.randomUUID());
  },
  replaceIfCurrent(previous: TokenSnapshot, accessToken: string, refreshToken: string): boolean {
    if (!isBrowser() || !this.isCurrent(previous)) return false;
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    return true;
  },
  clearIfCurrent(previous: TokenSnapshot): boolean {
    if (!this.isCurrent(previous)) return false;
    this.clear();
    return true;
  },
  clear(): void {
    if (!isBrowser()) return;
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  },
};
