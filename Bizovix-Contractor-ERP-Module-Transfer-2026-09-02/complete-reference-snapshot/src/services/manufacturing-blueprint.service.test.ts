import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/services/api-client";
import { assignManufacturingOperationResource } from "@/services/manufacturing-blueprint.service";

vi.mock("@/services/api-client", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

describe("manufacturing blueprint service API contract", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({} as never);
  });

  it("assigns or updates a real resource requirement on a routing operation", async () => {
    const input = {
      workspaceId: "workspace / one",
      resourceId: "resource / assembly line",
      requiredUnits: 2,
      capacityMultiplier: 1.25,
      isMandatory: true,
      note: "Two qualified operators are required.",
    };

    await assignManufacturingOperationResource("operation / body", input);

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/manufacturing/blueprint/routing-operations/operation%20%2F%20body/resources",
      { method: "POST", body: JSON.stringify(input) },
    );
  });
});
