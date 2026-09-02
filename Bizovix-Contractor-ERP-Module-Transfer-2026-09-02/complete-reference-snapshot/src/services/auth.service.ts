import { getDataProvider } from "@/services/data-provider";
import { apiRequest } from "@/services/api-client";
import type { AuthCredentials } from "@/types/api";
import type { AppAuthSession, SignupInput } from "@/types/api";
import type { DataMode } from "@/types/domain";

function toAuthSession(snapshot: AppAuthSession) {
  return snapshot;
}

export async function login(mode: DataMode, credentials: AuthCredentials): Promise<AppAuthSession> {
  if (mode === "api") {
    return toAuthSession(await apiRequest<AppAuthSession>("/auth/login", { method: "POST", body: JSON.stringify(credentials) }));
  }

  const user = await getDataProvider(mode).auth.login(credentials);
  return {
    user,
    tenant: {
      id: "tenant-mock",
      name: "Bizovix Preview Tenant",
      onboardingStep: "COMPLETED",
    },
    organization: {
      id: "org-mock",
      name: "Bizovix Preview Organization",
    },
    company: {
      id: "company-mock",
      name: "Bizovix Trading Limited",
    },
    workspaceId: "ws-trading",
    shouldCompleteOnboarding: false,
  };
}

export function demoLogin() {
  return getDataProvider("demo").auth.demoLogin();
}

export function getCurrentSession() {
  return apiRequest<AppAuthSession>("/auth/me");
}

/**
 * Desktop builds have no sign-in screen. This asks the local API to issue a
 * session for the machine's owner account; it only works when the API runs with
 * DESKTOP_MODE enabled.
 */
export function desktopSession() {
  return apiRequest<AppAuthSession>("/auth/desktop-session", { method: "POST" });
}

export async function signup(input: SignupInput): Promise<AppAuthSession> {
  const signupResult = await apiRequest<{ verificationToken: string }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return apiRequest<AppAuthSession>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: signupResult.verificationToken }),
  });
}

export async function logout(mode: DataMode) {
  if (mode !== "api") {
    return;
  }

  await apiRequest("/auth/logout", { method: "POST" });
}

