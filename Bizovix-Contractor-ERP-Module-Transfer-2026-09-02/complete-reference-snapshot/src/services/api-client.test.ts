import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/services/api-client";
import type { ApiError } from "@/services/api-client";

vi.mock("@/config/app", () => ({
  appConfig: { apiBaseUrl: "http://api.example.test" },
}));

vi.mock("@/stores/session-store", () => ({
  useSessionStore: {
    getState: () => ({
      setSession: vi.fn(),
      clearSession: vi.fn(),
    }),
  },
}));

function successfulResponse(body: string, status = 200) {
  return {
    ok: true,
    status,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("apiRequest successful-response parsing", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("parses a normal JSON response", async () => {
    fetchMock.mockResolvedValue(successfulResponse('{"configured":true}'));

    await expect(
      apiRequest<{ configured: boolean }>("/manufacturing/settings"),
    ).resolves.toEqual({ configured: true });
  });

  it("returns null for an empty successful response", async () => {
    fetchMock.mockResolvedValue(successfulResponse(""));

    await expect(
      apiRequest<null>("/manufacturing/settings"),
    ).resolves.toBeNull();
  });

  it("does not hide a malformed non-empty success payload", async () => {
    fetchMock.mockResolvedValue(successfulResponse("not-json"));

    await expect(apiRequest("/manufacturing/settings")).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: "ApiError",
        status: 200,
        message: "The API returned an invalid JSON response.",
      }),
    );
  });
});
