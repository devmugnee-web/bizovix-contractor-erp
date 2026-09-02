import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { VoucherEntryStatus } from "../generated/prisma/index.js";
import { ReportsService } from "./reports.service.js";

const currentUser: AuthenticatedRequestUser = {
  id: "user-1",
  email: "tester@example.com",
  name: "Test User",
  initials: "TU",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

function stockMovement(
  id: string,
  warehouseId: string,
  quantity: number,
  inputUnitCost: number,
  createdAt: string,
  balanceQuantity: number,
  balanceValue: number,
  averageCost: number,
) {
  return {
    id,
    tenantId: "tenant-1",
    companyId: "company-1",
    workspaceId: "workspace-1",
    warehouseId,
    inventoryItemId: "phone",
    transactionType: "PURCHASE",
    transactionId: id,
    transactionLineId: `${id}-line`,
    referenceNo: id,
    movementType: "IN" as const,
    quantity,
    unit: "pcs",
    unitConversion: null,
    inputUnitCost,
    unitCost: inputUnitCost,
    movementValue: quantity * inputUnitCost,
    balanceQuantity,
    balanceValue,
    averageCost,
    costingVersion: 2,
    reversalOfId: null,
    transactionDate: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date(createdAt),
  };
}

describe("ReportsService closing-stock valuation", () => {
  it("uses warehouse MWA balances and aggregates their values instead of multiplying by the item master rate", async () => {
    const items = [
      { id: "phone", itemName: "Phone", itemCode: "PHONE", category: "Mobile", unit: "pcs", openingQty: 0, openingRate: 999, reorderLevel: 0, status: "ACTIVE" },
      { id: "television", itemName: "Television", itemCode: "TV", category: "Television", unit: "pcs", openingQty: 0, openingRate: 777, reorderLevel: 0, status: "ACTIVE" },
    ];
    const movements = [
      stockMovement("warehouse-a-opening", "warehouse-a", 10, 100, "2026-01-01T01:00:00.000Z", 10, 1_000, 100),
      stockMovement("warehouse-a-purchase", "warehouse-a", 10, 200, "2026-01-01T02:00:00.000Z", 20, 3_000, 150),
      stockMovement("warehouse-b-opening", "warehouse-b", 5, 50, "2026-01-01T01:00:00.000Z", 5, 250, 50),
    ];
    const prisma = {
      workspaceMember: { findFirst: vi.fn(async () => ({ id: "membership-1" })) },
      workspace: { findUnique: vi.fn(async () => ({ companyId: "company-1" })) },
      accountingSettings: {
        findUnique: vi.fn(async () => ({
          costingMethod: "MOVING_WEIGHTED_AVERAGE",
          negativeStockPolicy: "BLOCKED",
        })),
      },
      inventoryItem: {
        findMany: vi.fn(async (args: { select?: { openingRate?: boolean } }) =>
          args.select?.openingRate
            ? items.map(({ id, openingRate }) => ({ id, openingRate }))
            : items,
        ),
      },
      voucherInventoryItem: { findMany: vi.fn(async () => []) },
      inventoryAdjustment: { findMany: vi.fn(async () => []) },
      inventoryCostRevaluation: { findMany: vi.fn(async () => []) },
      stockMovement: {
        findMany: vi.fn(async () => movements),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const target = movements.find((movement) => movement.id === where.id);
          Object.assign(target!, data);
          return target;
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    };
    const service = new ReportsService(prisma as never);

    const result = await service.getClosingStock(currentUser, "workspace-1");

    expect(result).toEqual([
      { item: "Phone", closingQty: 25, unit: "pcs", rate: 130, closingValue: 3250 },
      { item: "Television", closingQty: 0, unit: "pcs", rate: 0, closingValue: 0 },
    ]);
    expect(prisma.stockMovement.update).not.toHaveBeenCalled();
  });
});

describe("ReportsService trial-balance audit pairs", () => {
  it("loads both posted mirrors and reversed originals so a reversal nets to zero", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = {
      workspaceMember: { findFirst: vi.fn(async () => ({ id: "membership-1" })) },
      voucherEntry: { findMany },
      account: { findMany: vi.fn(async () => []) },
    };
    const service = new ReportsService(prisma as never);

    await service.getTrialBalance(currentUser, "workspace-1");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: "workspace-1",
        status: { in: expect.arrayContaining([VoucherEntryStatus.POSTED, VoucherEntryStatus.REVERSED]) },
      }),
    }));
  });
});

describe("ReportsService user-activity presentation", () => {
  it("summarizes large configuration arrays instead of exposing raw audit JSON", async () => {
    const prisma = {
      workspaceMember: { findFirst: vi.fn(async () => ({ id: "membership-1" })) },
      auditLog: {
        findMany: vi.fn(async () => [{
          createdAt: new Date("2026-09-01T00:45:00.000Z"),
          userId: "user-1",
          user: { name: "Test User" },
          action: "MANUFACTURING_WORKFLOW_CONFIGURATION_CHANGED",
          entityType: "WORKSPACE_APP_SETTINGS",
          entityId: "workspace-settings-1",
          oldValues: {
            revision: 1,
            hiddenStepCodes: ["04.01", "04.02", "04.03", "04.04"],
            hiddenStepSerials: [1, 2, 3, 4],
            salesWorkflow: "DIRECT",
          },
          newValues: {
            revision: 2,
            hiddenStepCodes: [],
            hiddenStepSerials: [],
            salesWorkflow: "ORDER_BASED",
            presentationOnly: true,
            _actor: { role: "Owner" },
          },
        }]),
      },
      voucherEntry: { findMany: vi.fn(async () => []) },
      account: { findMany: vi.fn(async () => []) },
      userRole: { findMany: vi.fn(async () => []) },
    };
    const service = new ReportsService(prisma as never);

    const result = await service.getUserActivityLog(currentUser, "workspace-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      user: "Test User",
      role: "Owner",
      action: "Manufacturing Workflow Configuration Changed",
    });
    expect(result[0]?.details).toContain("Workspace App Settings record");
    expect(result[0]?.details).toContain("Revision: 1.00 to 2.00");
    expect(result[0]?.details).toContain("Hidden Steps: 4 hidden steps to None");
    expect(result[0]?.details).toContain("Sales Workflow: Direct to Order Based");
    expect(result[0]?.details).toContain("Presentation Mode: None to Yes");
    expect(result[0]?.details).not.toContain("Hidden Step Codes");
    expect(result[0]?.details).not.toContain("04.01");
    expect(result[0]?.details).not.toContain("[");
  });
});
