import { apiRequest } from "@/services/api-client";
import type { DataProvider } from "@/types/api";

export const apiProvider: DataProvider = {
  auth: {
    login: () => Promise.reject(new Error("Use auth.service for API login")),
    demoLogin: () => Promise.reject(new Error("Demo login remains isolated from production API")),
  },
  workspaces: {
    list: () => apiRequest("/workspaces"),
    listShareUsers: (workspaceId) => apiRequest(`/workspaces/${encodeURIComponent(workspaceId)}/share-users`),
    createShareUser: (workspaceId, input) =>
      apiRequest(`/workspaces/${encodeURIComponent(workspaceId)}/share-users`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateShareUser: (workspaceId, userId, input) =>
      apiRequest(`/workspaces/${encodeURIComponent(workspaceId)}/share-users/${encodeURIComponent(userId)}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    removeShareUser: (workspaceId, userId) =>
      apiRequest(`/workspaces/${encodeURIComponent(workspaceId)}/share-users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      }),
    resetShareUserPassword: (workspaceId, userId) =>
      apiRequest(`/workspaces/${encodeURIComponent(workspaceId)}/share-users/${encodeURIComponent(userId)}/reset-password`, {
        method: "POST",
      }),
  },
  dashboard: {
    get: (workspaceId) => apiRequest(`/dashboard?workspaceId=${encodeURIComponent(workspaceId)}`),
  },
  vouchers: {
    listDayBook: (filters) =>
      apiRequest(
        `/vouchers/day-book?${new URLSearchParams(
          Object.entries(filters).reduce<Record<string, string>>((accumulator, [key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
              accumulator[key] = String(value);
            }
            return accumulator;
          }, {}),
        ).toString()}`,
      ),
    getById: (voucherId, workspaceId) =>
      apiRequest(`/vouchers/${encodeURIComponent(voucherId)}?workspaceId=${encodeURIComponent(workspaceId)}`),
    create: (input) =>
      apiRequest("/vouchers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (voucherId, input) =>
      apiRequest(`/vouchers/${encodeURIComponent(voucherId)}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    delete: (voucherId, workspaceId) =>
      apiRequest(`/vouchers/${encodeURIComponent(voucherId)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "DELETE",
      }),
  },
  reports: {
    getTrialBalance: (workspaceId) => apiRequest(`/reports/trial-balance?workspaceId=${encodeURIComponent(workspaceId)}`),
  },
  subscription: {
    get: (workspaceId) =>
      apiRequest(
        `/subscriptions/current${
          workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ""
        }`,
      ),
    requestUpgrade: (input, workspaceId) =>
      apiRequest("/subscriptions/upgrade-requests", {
        method: "POST",
        body: JSON.stringify(workspaceId ? { ...input, workspaceId } : input),
      }),
  },
  demo: {
    reset: () => Promise.reject(new Error("Demo reset stays on isolated demo mode.")),
  },
};
