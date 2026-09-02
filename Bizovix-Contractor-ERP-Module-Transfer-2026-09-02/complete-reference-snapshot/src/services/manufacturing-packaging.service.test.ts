import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/services/api-client";
import { retryManufacturingPackagingMaterialReservation } from "@/services/manufacturing-packaging.service";

vi.mock("@/services/api-client", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

describe("manufacturing packaging service API contract", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({} as never);
  });

  it("retries material reservation through the encoded packaging-order endpoint", async () => {
    const input = {
      workspaceId: "workspace-1",
      idempotencyKey: "reserve-pko-1",
      transactionDate: "2026-08-29",
      signatureMeaning: "Reserve packaging materials",
      note: "Packaging stock replenished",
    };

    await retryManufacturingPackagingMaterialReservation(
      "PKO / 2026 / 1",
      input,
    );

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/manufacturing/serial-packaging/packaging-orders/PKO%20%2F%202026%20%2F%201/reserve-materials",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  });
});
