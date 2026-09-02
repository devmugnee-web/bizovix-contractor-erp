import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/services/api-client";
import {
  endManufacturingDowntime,
  listManufacturingDowntimeCandidates,
  listManufacturingDowntimeEvents,
  startManufacturingDowntime,
} from "@/services/manufacturing-downtime.service";

vi.mock("@/services/api-client", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

describe("manufacturing downtime service API contract", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({} as never);
  });

  it("reads real operation/resource candidates and persisted events by workspace", async () => {
    await listManufacturingDowntimeCandidates("workspace / 1");
    await listManufacturingDowntimeEvents("workspace / 1", "OPEN");

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/downtime/candidates?workspaceId=workspace+%2F+1",
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/downtime/events?workspaceId=workspace+%2F+1&status=OPEN",
    );
  });

  it("posts lifecycle commands with their client-held idempotency keys", async () => {
    const start = {
      workspaceId: "workspace-1",
      orderId: "order-1",
      operationExecutionId: "execution-1",
      resourceId: "resource-1",
      reason: "Motor stopped",
      transactionDate: "2026-09-10T08:00:00.000Z",
      idempotencyKey: "start-key",
    };
    const end = {
      workspaceId: "workspace-1",
      transactionDate: "2026-09-10T09:00:00.000Z",
      idempotencyKey: "end-key",
      endNote: "Motor reset",
    };

    await startManufacturingDowntime(start);
    await endManufacturingDowntime("down / 1", end);

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/downtime/events/start",
      { method: "POST", body: JSON.stringify(start) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/downtime/events/down%20%2F%201/end",
      { method: "POST", body: JSON.stringify(end) },
    );
  });
});
