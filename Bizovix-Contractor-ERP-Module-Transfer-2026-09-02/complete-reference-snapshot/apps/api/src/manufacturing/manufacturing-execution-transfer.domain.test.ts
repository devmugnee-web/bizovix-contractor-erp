import { describe, expect, it } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import {
  executionTransferLotNumber,
  isExecutionTransferDestinationAllowed,
  isExecutionTransferItemRoleAllowed,
  isExecutionTransferOrderStateAllowed,
  isExecutionTransferSourceDispositionAllowed,
  resolveExecutionTransferQuantity,
  shouldMoveWholeExecutionLot,
} from "./manufacturing-execution-transfer.domain.js";

function lot(input: {
  disposition?: string;
  available?: number;
  reserved?: number;
  hold?: number;
  rejected?: number;
}) {
  return {
    availableQuantity: new Prisma.Decimal(input.available ?? 0),
    reservedQuantity: new Prisma.Decimal(input.reserved ?? 0),
    holdQuantity: new Prisma.Decimal(input.hold ?? 0),
    rejectedQuantity: new Prisma.Decimal(input.rejected ?? 0),
    location: { disposition: input.disposition ?? "WIP" },
  };
}

describe("manufacturing execution transfer rules", () => {
  it("keeps WIP and bulk order, role and source-location scopes explicit", () => {
    expect(
      isExecutionTransferOrderStateAllowed("WIP_TRANSFER", "IN_PRODUCTION"),
    ).toBe(true);
    expect(
      isExecutionTransferOrderStateAllowed("WIP_TRANSFER", "QA_RELEASED"),
    ).toBe(false);
    expect(
      isExecutionTransferOrderStateAllowed(
        "BULK_PRODUCT_TRANSFER",
        "QA_RELEASED",
      ),
    ).toBe(true);
    expect(
      isExecutionTransferItemRoleAllowed("WIP_TRANSFER", "INTERMEDIATE"),
    ).toBe(true);
    expect(
      isExecutionTransferItemRoleAllowed(
        "BULK_PRODUCT_TRANSFER",
        "FINISHED_GOOD",
      ),
    ).toBe(false);
    expect(
      isExecutionTransferItemRoleAllowed("BULK_PRODUCT_TRANSFER", "BULK"),
    ).toBe(true);
    expect(
      isExecutionTransferSourceDispositionAllowed("WIP_TRANSFER", "RELEASED"),
    ).toBe(false);
    expect(
      isExecutionTransferSourceDispositionAllowed(
        "BULK_PRODUCT_TRANSFER",
        "RELEASED",
      ),
    ).toBe(true);
  });

  it("moves only the unreserved available balance from an ordinary WIP lot", () => {
    const resolved = resolveExecutionTransferQuantity(
      lot({ available: 10, reserved: 3 }),
    );
    expect(resolved.bucket).toBe("AVAILABLE");
    expect(resolved.quantity.toString()).toBe("7");
    expect(
      shouldMoveWholeExecutionLot(
        lot({ available: 10, reserved: 3 }),
        resolved.bucket,
        7,
      ),
    ).toBe(false);
  });

  it("preserves quality hold and only permits a QC-hold destination", () => {
    const source = lot({ disposition: "QC_HOLD", hold: 4 });
    const resolved = resolveExecutionTransferQuantity(source);
    expect(resolved.bucket).toBe("HOLD");
    expect(resolved.quantity.toString()).toBe("4");
    expect(
      isExecutionTransferDestinationAllowed("WIP_TRANSFER", "HOLD", "QC_HOLD"),
    ).toBe(true);
    expect(
      isExecutionTransferDestinationAllowed("WIP_TRANSFER", "HOLD", "WIP"),
    ).toBe(false);
    expect(shouldMoveWholeExecutionLot(source, "HOLD", 4)).toBe(true);
  });

  it("allows released destinations for bulk only and generates traceable child numbers", () => {
    expect(
      isExecutionTransferDestinationAllowed(
        "WIP_TRANSFER",
        "AVAILABLE",
        "RELEASED",
      ),
    ).toBe(false);
    expect(
      isExecutionTransferDestinationAllowed(
        "BULK_PRODUCT_TRANSFER",
        "AVAILABLE",
        "RELEASED",
      ),
    ).toBe(true);
    expect(
      executionTransferLotNumber("LOT-001", "WIP_TRANSFER", "abcdef123456"),
    ).toBe("LOT-001-WIP-ABCDEF1234");
    expect(
      executionTransferLotNumber(
        "LOT-001",
        "BULK_PRODUCT_TRANSFER",
        "abcdef123456",
      ),
    ).toBe("LOT-001-BLK-ABCDEF1234");
  });
});
