import { describe, expect, it, vi } from "vitest";

import { Prisma } from "../generated/prisma/index.js";
import { ManufacturingService } from "./manufacturing.service.js";

const workspaceScope = {
  id: "workspace-1",
  companyId: "company-1",
};

function service() {
  return new ManufacturingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    assertNoOpenQualityCasesAtClose: (
      tx: Prisma.TransactionClient,
      workspaceId: string,
      order: { id: string; finishedProductId: string },
    ) => Promise<void>;
    assertActualCostPostingsReadyForClose: (
      tx: Prisma.TransactionClient,
      scope: typeof workspaceScope,
      orderId: string,
    ) => Promise<void>;
  };
}

const amount = new Prisma.Decimal("125.45");

function voucher(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "voucher-1",
    workspaceId: workspaceScope.id,
    companyId: workspaceScope.companyId,
    sourceType: "MANUFACTURING_ACTUAL_COST",
    sourceId: "order-1",
    voucherType: "JOURNAL",
    documentKind: "MANUFACTURING_ACTUAL_COST",
    status: "POSTED",
    totalAmount: amount,
    debit: amount,
    credit: amount,
    currency: "BDT",
    fiscalYearId: "fiscal-year-1",
    reversalOfId: null,
    lines: [
      {
        accountId: "wip-account-1",
        ledger: "WIP Inventory",
        costCenter: null,
        project: null,
        billReference: null,
        debit: amount,
        credit: new Prisma.Decimal(0),
      },
      {
        accountId: "clearing-account-1",
        ledger: "Labour Clearing",
        costCenter: null,
        project: null,
        billReference: null,
        debit: new Prisma.Decimal(0),
        credit: amount,
      },
    ],
    reversedBy: [],
    ...overrides,
  };
}

function actualCostPosting(overrides: Record<string, unknown> = {}) {
  const voucherEntry = voucher();
  return {
    id: "actual-cost-1",
    workspaceId: workspaceScope.id,
    companyId: workspaceScope.companyId,
    orderId: "order-1",
    amount,
    wipAccountId: "wip-account-1",
    clearingAccountId: "clearing-account-1",
    finalizedSnapshotId: null,
    voucherEntryId: voucherEntry.id,
    voucherEntry,
    transactionDate: new Date("2026-08-30T00:00:00.000Z"),
    createdAt: new Date("2026-08-30T00:00:00.000Z"),
    ...overrides,
  };
}

describe("manufacturing close safety", () => {
  it("rechecks and blocks an order-linked quality case opened after QA release", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        code: "OOS-001",
        name: "Compressor pressure out of specification",
        status: "APPROVED",
        inventoryItemId: null,
        payload: {
          details: {
            state: "OPEN",
            orderId: "order-1",
          },
        },
      },
    ]);
    const tx = {
      manufacturingControlRecord: { findMany },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service().assertNoOpenQualityCasesAtClose(tx, workspaceScope.id, {
        id: "order-1",
        finishedProductId: "finished-product-1",
      }),
    ).rejects.toThrow(/CLOSE is blocked by open quality case\(s\): OOS-001/);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: workspaceScope.id,
          kind: "QUALITY_CASE",
        }),
      }),
    );
  });

  it("does not block a resolved quality case", async () => {
    const tx = {
      manufacturingControlRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            code: "CAPA-001",
            name: "Resolved corrective action",
            status: "APPROVED",
            inventoryItemId: null,
            payload: { state: "RESOLVED", productionOrderId: "order-1" },
          },
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service().assertNoOpenQualityCasesAtClose(tx, workspaceScope.id, {
        id: "order-1",
        finishedProductId: "finished-product-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("blocks an actual-cost posting that is neither finalized nor reversed", async () => {
    const findMany = vi.fn().mockResolvedValue([actualCostPosting()]);
    const tx = {
      manufacturingActualCostPosting: { findMany },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service().assertActualCostPostingsReadyForClose(
        tx,
        workspaceScope,
        "order-1",
      ),
    ).rejects.toThrow(
      /must be finalized into finished goods or validly reversed/,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: workspaceScope.id, orderId: "order-1" },
      }),
    );
  });

  it("allows a finalized posting with its valid posted voucher", async () => {
    const tx = {
      manufacturingActualCostPosting: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            actualCostPosting({ finalizedSnapshotId: "snapshot-1" }),
          ]),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service().assertActualCostPostingsReadyForClose(
        tx,
        workspaceScope,
        "order-1",
      ),
    ).resolves.toBeUndefined();
  });

  it("allows an unfinalized posting only when it has one valid posted reversal", async () => {
    const reversal = voucher({
      id: "reversal-voucher-1",
      reversalOfId: "voucher-1",
      lines: [
        {
          accountId: "wip-account-1",
          ledger: "WIP Inventory",
          costCenter: null,
          project: null,
          billReference: null,
          debit: new Prisma.Decimal(0),
          credit: amount,
        },
        {
          accountId: "clearing-account-1",
          ledger: "Labour Clearing",
          costCenter: null,
          project: null,
          billReference: null,
          debit: amount,
          credit: new Prisma.Decimal(0),
        },
      ],
    });
    const reversedVoucher = voucher({
      status: "REVERSED",
      reversedBy: [reversal],
    });
    const tx = {
      manufacturingActualCostPosting: {
        findMany: vi.fn().mockResolvedValue([
          actualCostPosting({
            voucherEntry: reversedVoucher,
          }),
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service().assertActualCostPostingsReadyForClose(
        tx,
        workspaceScope,
        "order-1",
      ),
    ).resolves.toBeUndefined();
  });

  it("blocks a finalized posting whose voucher is not exact and balanced", async () => {
    const invalidVoucher = voucher({
      credit: new Prisma.Decimal("125.44"),
    });
    const tx = {
      manufacturingActualCostPosting: {
        findMany: vi.fn().mockResolvedValue([
          actualCostPosting({
            finalizedSnapshotId: "snapshot-1",
            voucherEntry: invalidVoucher,
          }),
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service().assertActualCostPostingsReadyForClose(
        tx,
        workspaceScope,
        "order-1",
      ),
    ).rejects.toThrow(/source-linked, balanced voucher/);
  });

  it("blocks a reversal voucher that does not mirror the original lines", async () => {
    const nonMirroringReversal = voucher({
      id: "reversal-voucher-1",
      reversalOfId: "voucher-1",
    });
    const tx = {
      manufacturingActualCostPosting: {
        findMany: vi.fn().mockResolvedValue([
          actualCostPosting({
            voucherEntry: voucher({
              status: "REVERSED",
              reversedBy: [nonMirroringReversal],
            }),
          }),
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service().assertActualCostPostingsReadyForClose(
        tx,
        workspaceScope,
        "order-1",
      ),
    ).rejects.toThrow(/does not exactly mirror the original/);
  });
});
