import { Prisma } from "../generated/prisma/index.js";
import { describe, expect, it, vi } from "vitest";

import { ManufacturingMaterialsService } from "./manufacturing-materials.service.js";
import { ManufacturingService } from "./manufacturing.service.js";

const user = {
  id: "user-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
} as any;

function requisitionRow(data: any) {
  const createdAt = new Date("2026-09-01T00:00:00.000Z");
  return {
    id: data.id,
    transactionNumber: data.transactionNumber,
    status: data.status,
    transactionDate: data.transactionDate,
    orderId: data.orderId,
    fromWarehouseId: data.fromWarehouseId,
    fromLocationId: data.fromLocationId,
    notes: data.notes,
    createdAt,
    order: { orderNumber: "MO-001", status: "APPROVED" },
    reservation: null,
    lines: data.lines.create.map((line: any, index: number) => ({
      id: `line-${index + 1}`,
      ...line,
      inventoryItem: { itemCode: "RM-STEEL", itemName: "Steel" },
      sourceInventoryLot: {
        id: line.sourceInventoryLotId,
        lotNumber: "STEEL-LOT-1",
        expiresAt: null,
        availableQuantity: new Prisma.Decimal("10"),
        reservedQuantity: new Prisma.Decimal(0),
      },
    })),
  };
}

describe("ManufacturingMaterialsService UOM normalization", () => {
  it("accepts an alternate-unit requisition but reserves authoritative stock/base quantity", async () => {
    const transactionCreate = vi.fn(async ({ data }: any) =>
      requisitionRow(data),
    );
    const reviewCreate = vi.fn(async ({ data }: any) => data);
    const tx: any = {
      manufacturingPeriod: { findUnique: vi.fn(async () => null) },
      manufacturingOrder: {
        findFirst: vi.fn(async () => ({
          id: "order-1",
          orderNumber: "MO-001",
          status: "APPROVED",
          issueWarehouseId: "warehouse-rm",
          issueLocationId: "location-rm",
          materials: [
            {
              id: "order-material-1",
              inventoryItemId: "material-steel",
              plannedQuantity: new Prisma.Decimal("10"),
              reservedQuantity: new Prisma.Decimal(0),
              issuedQuantity: new Prisma.Decimal(0),
              unit: "kg",
              inventoryItem: {
                id: "material-steel",
                itemCode: "RM-STEEL",
                itemName: "Steel",
                unit: "kg",
                alternateUnit: "g",
                alternateUnitConversion: new Prisma.Decimal("1000"),
              },
            },
          ],
        })),
      },
      manufacturingInventoryLot: {
        findMany: vi.fn(async () => [
          {
            id: "inventory-lot-1",
            inventoryItemId: "material-steel",
            warehouseId: "warehouse-rm",
            lotNumber: "STEEL-LOT-1",
            unit: "kg",
            holdQuantity: new Prisma.Decimal(0),
            availableQuantity: new Prisma.Decimal("10"),
            reservedQuantity: new Prisma.Decimal(0),
            expiresAt: null,
          },
        ]),
      },
      manufacturingTransaction: { create: transactionCreate },
      manufacturingWorkflowReview: { create: reviewCreate },
    };
    const prisma: any = {
      workspace: {
        findFirst: vi.fn(async () => ({
          id: "workspace-1",
          tenantId: "tenant-1",
          companyId: "company-1",
        })),
      },
      manufacturingTransaction: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (operation: any) => operation(tx)),
    };
    const permissions: any = {
      getGrantedKeys: vi.fn(
        async () => new Set(["manufacturing.material.reserve"]),
      ),
    };
    const service = new ManufacturingMaterialsService(prisma, permissions);
    (service as any).issueDocumentNumber = vi.fn(async () => "MRQ-001");

    const result = await service.createRequisition(user, {
      workspaceId: "workspace-1",
      orderId: "order-1",
      transactionDate: "2026-09-01T00:00:00.000Z",
      idempotencyKey: "req-uom-1",
      lines: [
        {
          orderMaterialId: "order-material-1",
          inventoryLotId: "inventory-lot-1",
          quantity: 2500,
          unit: "g",
        },
      ],
      note: "Alternate-unit request",
    });

    const persistedLine =
      transactionCreate.mock.calls[0]![0].data.lines.create[0];
    expect(persistedLine.quantity.toString()).toBe("2.5");
    expect(persistedLine.unit).toBe("kg");
    expect(result.requisition.lines[0]).toMatchObject({
      quantity: 2.5,
      unit: "kg",
    });
    expect(
      reviewCreate.mock.calls[0]![0].data.evidence.unitConversions,
    ).toEqual([
      expect.objectContaining({
        sourceQuantity: "2500",
        sourceUnit: "g",
        targetQuantity: "2.5",
        targetUnit: "kg",
        baseQuantity: "2.5",
        direction: "ALTERNATE_TO_BASE",
      }),
    ]);
  });
});

describe("ManufacturingService material-action UOM normalization", () => {
  it("normalizes BOM output and component quantities to their stock/base units with audit evidence", async () => {
    const versionCreate = vi.fn(async ({ data }: any) => {
      const now = new Date("2026-09-01T00:00:00.000Z");
      return {
        id: "bom-version-1",
        bomId: data.bomId,
        versionNumber: data.versionNumber,
        status: "DRAFT",
        outputQuantity: data.outputQuantity,
        outputUnit: data.outputUnit,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
        changeReason: data.changeReason,
        approvedAt: null,
        approvedBy: null,
        createdAt: now,
        updatedAt: now,
        components: data.components.create.map(
          (component: any, index: number) => ({
            id: `component-${index + 1}`,
            ...component,
            inventoryItem: {
              itemCode: "RM-STEEL",
              itemName: "Steel",
              manufacturingProfile: { role: "RAW_MATERIAL" },
            },
            issueLocation: null,
          }),
        ),
      };
    });
    const reviewCreate = vi.fn(async ({ data }: any) => data);
    const tx: any = {
      manufacturingItemProfile: { upsert: vi.fn(async () => ({})) },
      manufacturingBomVersion: { create: versionCreate },
      manufacturingWorkflowReview: { create: reviewCreate },
    };
    const prisma: any = {
      workspace: {
        findFirst: vi.fn(async () => ({
          id: "workspace-1",
          tenantId: "tenant-1",
          companyId: "company-1",
        })),
      },
      manufacturingBom: {
        findFirst: vi.fn(async () => ({
          id: "bom-1",
          finishedProductId: "fridge",
          finishedProduct: {
            id: "fridge",
            itemCode: "FG-FRIDGE",
            itemName: "Fridge",
            unit: "pcs",
            alternateUnit: null,
            alternateUnitConversion: null,
          },
        })),
      },
      inventoryItem: {
        findMany: vi.fn(async () => [
          {
            id: "material-steel",
            itemCode: "RM-STEEL",
            itemName: "Steel",
            unit: "kg",
            alternateUnit: "g",
            alternateUnitConversion: new Prisma.Decimal("1000"),
          },
        ]),
      },
      manufacturingBomVersion: {
        aggregate: vi.fn(async () => ({ _max: { versionNumber: null } })),
      },
      $transaction: vi.fn(async (operation: any) => operation(tx)),
    };
    const service = new ManufacturingService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.createBomVersion(user, "bom-1", {
      workspaceId: "workspace-1",
      outputQuantity: 10,
      outputUnit: "pcs",
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      components: [
        {
          inventoryItemId: "material-steel",
          quantity: 1000,
          unit: "g",
        },
      ],
    });

    expect(result).toMatchObject({ outputQuantity: 10, outputUnit: "pcs" });
    expect(result.components[0]).toMatchObject({ quantity: 1, unit: "kg" });
    expect(versionCreate.mock.calls[0]![0].data).toMatchObject({
      outputQuantity: expect.objectContaining({}),
      outputUnit: "pcs",
    });
    expect(versionCreate.mock.calls[0]![0].data.outputQuantity.toString()).toBe(
      "10",
    );
    expect(
      versionCreate.mock.calls[0]![0].data.components.create[0].quantityPerOutput.toString(),
    ).toBe("1");
    expect(reviewCreate.mock.calls[0]![0].data.evidence).toMatchObject({
      stockBaseUnitAuthoritative: true,
      output: { direction: "BASE_TO_BASE", baseQuantity: "10" },
      components: [
        {
          direction: "ALTERNATE_TO_BASE",
          sourceQuantity: "1000",
          sourceUnit: "g",
          baseQuantity: "1",
          baseUnit: "kg",
        },
      ],
    });
  });

  it("normalizes an alternate-unit issue line before stock and reservation posting", () => {
    const service = new ManufacturingService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const evidence: any[] = [];
    const order = {
      materials: [
        {
          id: "order-material-1",
          inventoryItemId: "material-steel",
          plannedQuantity: new Prisma.Decimal("10"),
          reservedQuantity: new Prisma.Decimal("10"),
          issuedQuantity: new Prisma.Decimal(0),
          returnedQuantity: new Prisma.Decimal(0),
          consumedQuantity: new Prisma.Decimal(0),
          scrappedQuantity: new Prisma.Decimal(0),
          unit: "kg",
          inventoryItem: {
            id: "material-steel",
            itemCode: "RM-STEEL",
            itemName: "Steel",
            unit: "kg",
            alternateUnit: "g",
            alternateUnitConversion: new Prisma.Decimal("1000"),
            manufacturingProfile: {
              role: "RAW_MATERIAL",
              lotTracked: false,
            },
          },
        },
      ],
    };

    const lines = (service as any).resolveMaterialLines(
      order,
      {
        kind: "ISSUE_MATERIALS",
        lines: [
          {
            orderMaterialId: "order-material-1",
            quantity: 2500,
            unit: "g",
          },
        ],
      },
      "ISSUE",
      ["RAW_MATERIAL"],
      true,
      evidence,
    );

    expect(lines[0].quantity.toString()).toBe("2.5");
    expect(lines[0].unit).toBe("kg");
    expect(evidence).toEqual([
      expect.objectContaining({
        sourceQuantity: "2500",
        sourceUnit: "g",
        targetQuantity: "2.5",
        targetUnit: "kg",
        direction: "ALTERNATE_TO_BASE",
      }),
    ]);
  });
});
