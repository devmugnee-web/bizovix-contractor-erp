import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/services/api-client";
import {
  approveManufacturingSupplySuggestion,
  cancelManufacturingSupplySuggestion,
  convertManufacturingSupplySuggestion,
  createManufacturingSupplySuggestion,
  listManufacturingSupplySuggestions,
} from "@/services/manufacturing-supply.service";

vi.mock("@/services/api-client", () => ({ apiRequest: vi.fn() }));

const apiRequestMock = vi.mocked(apiRequest);

describe("manufacturing supply suggestion service API contract", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({} as never);
  });

  it("lists suggestions with encoded workspace, type, status and MRP filters", async () => {
    await listManufacturingSupplySuggestions({
      workspaceId: "workspace / one",
      type: "STOCK_TRANSFER",
      status: "APPROVED",
      mrpRunId: "mrp / 7",
    });

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/manufacturing/supply-suggestions?workspaceId=workspace+%2F+one&type=STOCK_TRANSFER&status=APPROVED&mrpRunId=mrp+%2F+7",
    );
  });

  it("creates a suggestion with the exact planning payload", async () => {
    const input = {
      workspaceId: "workspace-1",
      mrpRequirementId: "requirement-1",
      type: "PURCHASE_REQUISITION" as const,
      requestedQuantity: 12.5,
      destinationWarehouseId: "warehouse-1",
      transactionDate: "2026-08-30",
      idempotencyKey: "create-pr-1",
      note: "Cover the confirmed MRP shortage",
    };

    await createManufacturingSupplySuggestion(input);

    expect(apiRequestMock).toHaveBeenCalledWith(
      "/manufacturing/supply-suggestions",
      { method: "POST", body: JSON.stringify(input) },
    );
  });

  it("posts approve, convert and cancel actions to encoded suggestion routes", async () => {
    const approve = {
      workspaceId: "workspace-1",
      transactionDate: "2026-08-30",
      idempotencyKey: "approve-1",
      signatureMeaning: "I approve this suggestion",
      reauthenticationPassword: "secret",
      note: "Checked against MRP",
    };
    const convert = {
      workspaceId: "workspace-1",
      transactionDate: "2026-08-30",
      idempotencyKey: "convert-1",
      externalReference: "PR-2026-10",
      expectedReceiptDate: "2026-09-05",
      note: "Converted after approval",
    };
    const cancel = {
      workspaceId: "workspace-1",
      transactionDate: "2026-08-30",
      idempotencyKey: "cancel-1",
      reason: "MRP plan was superseded",
    };

    await approveManufacturingSupplySuggestion("suggestion / 1", approve);
    await convertManufacturingSupplySuggestion("suggestion / 1", convert);
    await cancelManufacturingSupplySuggestion("suggestion / 1", cancel);

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      "/manufacturing/supply-suggestions/suggestion%20%2F%201/approve",
      { method: "POST", body: JSON.stringify(approve) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      "/manufacturing/supply-suggestions/suggestion%20%2F%201/convert",
      { method: "POST", body: JSON.stringify(convert) },
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      "/manufacturing/supply-suggestions/suggestion%20%2F%201/cancel",
      { method: "POST", body: JSON.stringify(cancel) },
    );
  });
});
