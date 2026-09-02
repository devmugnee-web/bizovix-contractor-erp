import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { ManufacturingService } from "./manufacturing.service.js";
import type { UpdateManufacturingSettingsDto } from "./manufacturing.dto.js";

const user: AuthenticatedRequestUser = {
  id: "user-1",
  email: "owner@example.test",
  name: "Owner",
  initials: "OW",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

const now = new Date("2026-09-01T06:00:00.000Z");
const inventoryControlAccountId = "account-inventory-control";
const inventoryControlLedger = {
  id: inventoryControlAccountId,
  name: "Inventory Control",
  code: "1210001",
  nature: "ASSET",
  isSystem: true,
  isControlAccount: true,
};

function accountForId(id: string) {
  if (id === inventoryControlAccountId) return inventoryControlLedger;
  return {
    id,
    name: id,
    code: id,
    nature: id.includes("variance") ? "DIRECT_EXPENSE" : "ASSET",
    isSystem: false,
    isControlAccount: false,
  };
}

const validDto = (): UpdateManufacturingSettingsDto => ({
  workspaceId: user.workspaceId!,
  mode: "GENERAL",
  rawMaterialWarehouseId: "warehouse-rm",
  wipWarehouseId: "warehouse-wip",
  finishedGoodsQualityWarehouseId: "warehouse-fgq",
  finishedGoodsReleasedWarehouseId: "warehouse-fgr",
  rejectedWarehouseId: "warehouse-rejected",
  scrapWarehouseId: "warehouse-scrap",
  rawMaterialInventoryAccountId: inventoryControlAccountId,
  packagingInventoryAccountId: inventoryControlAccountId,
  wipInventoryAccountId: "account-wip",
  finishedGoodsInventoryAccountId: inventoryControlAccountId,
  manufacturingVarianceAccountId: "account-variance",
  labourClearingAccountId: "account-labour",
  overheadAbsorptionAccountId: "account-overhead",
  scrapRecoveryAccountId: inventoryControlAccountId,
  reservationRequired: true,
  issueBeforeProduction: true,
  negativeStockAllowed: false,
  serialTrackingRequired: false,
  qualityReleaseRequired: true,
  partialProductionAllowed: true,
  electronicSignatureRequired: true,
  approvalRequired: true,
  settings: {
    defaultRawMaterialLocationId: "location-rm",
    defaultWipLocationId: "location-wip",
    defaultFinishedGoodsHoldLocationId: "location-fgq",
    defaultFinishedGoodsReleaseLocationId: "location-fgr",
  },
});

const unchangedSettingsDto = (): UpdateManufacturingSettingsDto => ({
  ...validDto(),
  rejectedWarehouseId: undefined,
  scrapWarehouseId: undefined,
  packagingInventoryAccountId: undefined,
  manufacturingVarianceAccountId: undefined,
  labourClearingAccountId: undefined,
  overheadAbsorptionAccountId: undefined,
  scrapRecoveryAccountId: undefined,
  qualityReleaseRequired: false,
});

const settingsRow = (overrides: Record<string, unknown> = {}) => ({
  id: "settings-1",
  tenantId: user.tenantId,
  companyId: user.companyId,
  workspaceId: user.workspaceId,
  mode: "GENERAL",
  currency: "BDT",
  quantityScale: 4,
  costScale: 6,
  blockNegativeStock: true,
  reservationRequired: true,
  issueBeforeOperationStart: true,
  allowPartialCompletion: true,
  allowProvisionalCost: true,
  requireQcBeforeRelease: false,
  requireSerialBeforeRelease: false,
  electronicSignatureRequired: true,
  approvalRequired: true,
  defaultRawMaterialWarehouseId: "warehouse-rm",
  defaultWipWarehouseId: "warehouse-wip",
  defaultFinishedGoodsWarehouseId: "warehouse-fgq",
  defaultFinishedGoodsReleasedWarehouseId: "warehouse-fgr",
  defaultRejectedWarehouseId: null,
  defaultScrapWarehouseId: null,
  defaultRawMaterialLocationId: "location-rm",
  defaultWipLocationId: "location-wip",
  defaultFinishedGoodsHoldLocationId: "location-fgq",
  defaultFinishedGoodsReleaseLocationId: "location-fgr",
  rawMaterialInventoryAccountId: inventoryControlAccountId,
  packagingInventoryAccountId: null,
  wipInventoryAccountId: "account-wip",
  finishedGoodsInventoryAccountId: inventoryControlAccountId,
  manufacturingVarianceAccountId: null,
  labourClearingAccountId: null,
  overheadAbsorptionAccountId: null,
  scrapRecoveryAccountId: null,
  updatedByUserId: user.id,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const workspace = {
  id: user.workspaceId,
  tenantId: user.tenantId,
  companyId: user.companyId,
};

const coreDocumentKinds = [
  "BOM",
  "PRODUCTION_ORDER",
  "MATERIAL_REQUISITION",
  "MATERIAL_ISSUE",
  "MATERIAL_RETURN",
  "FINISHED_GOODS_RECEIPT",
  "QA_RELEASE",
];

function serviceWithPrisma(prisma: Record<string, unknown>) {
  return new ManufacturingService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

type FindFirstArgs = {
  where: { id: string; warehouseId?: string };
};

type ReadinessCheck = {
  code: string;
  state: string;
  count: number;
  message: string | null;
  actionView: string;
};

function readinessCheck(result: { checks: unknown[] }, code: string) {
  const match = result.checks.find(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      "code" in candidate &&
      candidate.code === code,
  );
  if (!match) throw new Error(`Readiness check ${code} was not returned.`);
  return match as ReadinessCheck;
}

describe("manufacturing settings absence", () => {
  it("returns null without creating defaults when the workspace has no settings row", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const upsert = vi.fn();
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: user.workspaceId,
          tenantId: user.tenantId,
          companyId: user.companyId,
        }),
      },
      manufacturingSettings: { findUnique, upsert },
    };
    const service = new ManufacturingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getSettings(user, "workspace-1")).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
    });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("manufacturing settings reference hardening", () => {
  it("rejects a stock mapping that is not the protected Inventory Control ledger", async () => {
    const dto = validDto();
    dto.rawMaterialInventoryAccountId = "account-custom-rm";
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(workspace) },
      warehouse: {
        findFirst: vi.fn().mockImplementation(({ where }: FindFirstArgs) =>
          Promise.resolve({
            id: where.id,
            name: where.id,
            code: where.id,
            type: where.id.includes("wip")
              ? "WIP"
              : where.id.includes("fg")
                ? "FINISHED_GOODS"
                : where.id.includes("rejected")
                  ? "REJECTED"
                  : where.id.includes("scrap")
                    ? "SCRAP"
                    : "RAW_MATERIAL",
            allowMaterialIssue: true,
          }),
        ),
      },
      account: {
        findFirst: vi.fn().mockImplementation(({ where }: FindFirstArgs) =>
          Promise.resolve(
            where.id === "account-custom-rm"
              ? null
              : accountForId(where.id),
          ),
        ),
      },
      manufacturingLocation: { findFirst: vi.fn() },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
      manufacturingOrder: { findFirst: vi.fn().mockResolvedValue(null) },
      manufacturingRun: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(
      serviceWithPrisma(prisma).updateSettings(user, dto),
    ).rejects.toThrow(
      "Raw-material inventory account must reference this company's active protected Inventory Control (1210001) ASSET LEDGER account.",
    );
    expect(prisma.manufacturingSettings.upsert).not.toHaveBeenCalled();
  });

  it("rejects a location outside its selected warehouse or required disposition", async () => {
    const dto = validDto();
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(workspace) },
      warehouse: {
        findFirst: vi.fn().mockImplementation(({ where }: FindFirstArgs) =>
          Promise.resolve({
            id: where.id,
            name: where.id,
            code: where.id,
            type: where.id.includes("wip")
              ? "WIP"
              : where.id.includes("fg")
                ? "FINISHED_GOODS"
                : where.id.includes("rejected")
                  ? "REJECTED"
                  : where.id.includes("scrap")
                    ? "SCRAP"
                    : "RAW_MATERIAL",
            allowMaterialIssue: true,
          }),
        ),
      },
      account: {
        findFirst: vi.fn().mockImplementation(({ where }: FindFirstArgs) =>
          Promise.resolve(accountForId(where.id)),
        ),
      },
      manufacturingLocation: {
        findFirst: vi.fn().mockImplementation(({ where }: FindFirstArgs) =>
          Promise.resolve({
            id: where.id,
            name: where.id,
            warehouseId: where.warehouseId,
            disposition: where.id === "location-wip" ? "STAGING" : "RELEASED",
          }),
        ),
      },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
      manufacturingOrder: { findFirst: vi.fn().mockResolvedValue(null) },
      manufacturingRun: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(
      serviceWithPrisma(prisma).updateSettings(user, dto),
    ).rejects.toThrow("WIP default location must use the WIP disposition.");
    expect(prisma.manufacturingSettings.upsert).not.toHaveBeenCalled();
  });

  it("rejects pharmaceutical settings that disable quality release", async () => {
    const dto = validDto();
    dto.mode = "PHARMACEUTICAL";
    dto.qualityReleaseRequired = false;
    dto.rawMaterialWarehouseId = undefined;
    dto.wipWarehouseId = undefined;
    dto.finishedGoodsQualityWarehouseId = undefined;
    dto.finishedGoodsReleasedWarehouseId = undefined;
    dto.rejectedWarehouseId = undefined;
    dto.scrapWarehouseId = undefined;
    dto.rawMaterialInventoryAccountId = undefined;
    dto.packagingInventoryAccountId = undefined;
    dto.wipInventoryAccountId = undefined;
    dto.finishedGoodsInventoryAccountId = undefined;
    dto.manufacturingVarianceAccountId = undefined;
    dto.labourClearingAccountId = undefined;
    dto.overheadAbsorptionAccountId = undefined;
    dto.scrapRecoveryAccountId = undefined;
    dto.settings = {};
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(workspace) },
      warehouse: { findFirst: vi.fn() },
      account: { findFirst: vi.fn() },
      manufacturingLocation: { findFirst: vi.fn() },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
      manufacturingOrder: { findFirst: vi.fn().mockResolvedValue(null) },
      manufacturingRun: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(
      serviceWithPrisma(prisma).updateSettings(user, dto),
    ).rejects.toThrow(
      "Pharmaceutical and hybrid manufacturing require quality release controls.",
    );
    expect(prisma.manufacturingSettings.upsert).not.toHaveBeenCalled();
  });

  it("blocks a mode change while a nonterminal manufacturing order exists", async () => {
    const dto = unchangedSettingsDto();
    dto.mode = "PHARMACEUTICAL";
    const upsert = vi.fn();
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(workspace) },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(settingsRow()),
        upsert,
      },
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue({
          id: "order-1",
          orderNumber: "MO-001",
          status: "IN_PRODUCTION",
        }),
      },
      manufacturingRun: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(
      serviceWithPrisma(prisma).updateSettings(user, dto),
    ).rejects.toThrow(
      "Manufacturing settings cannot be changed while active manufacturing orders or workflow runs exist. Close or cancel the active work first",
    );
    expect(prisma.manufacturingOrder.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: user.workspaceId,
        status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
      },
      select: { id: true, orderNumber: true, status: true },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("blocks an FG-Q warehouse or location remap while a workflow run is active", async () => {
    const dto = unchangedSettingsDto();
    dto.finishedGoodsQualityWarehouseId = "warehouse-fgq-next";
    dto.settings = {
      ...dto.settings,
      defaultFinishedGoodsHoldLocationId: "location-fgq-next",
    };
    const upsert = vi.fn();
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(workspace) },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(settingsRow()),
        upsert,
      },
      manufacturingOrder: { findFirst: vi.fn().mockResolvedValue(null) },
      manufacturingRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: "run-1",
          status: "FG_Q",
        }),
      },
    };

    await expect(
      serviceWithPrisma(prisma).updateSettings(user, dto),
    ).rejects.toThrow("Close or cancel the active work first");
    expect(prisma.manufacturingRun.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: user.workspaceId,
        status: { notIn: ["CLOSED", "CANCELLED", "PERIOD_LOCKED"] },
      },
      select: { id: true, status: true },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("allows an exact settings re-save without querying active work", async () => {
    const dto = unchangedSettingsDto();
    const existing = settingsRow();
    const upsert = vi.fn().mockResolvedValue(existing);
    const prisma = {
      workspace: { findFirst: vi.fn().mockResolvedValue(workspace) },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(existing),
        upsert,
      },
      manufacturingOrder: { findFirst: vi.fn() },
      manufacturingRun: { findFirst: vi.fn() },
      warehouse: {
        findFirst: vi.fn().mockImplementation(({ where }: FindFirstArgs) =>
          Promise.resolve({
            id: where.id,
            name: where.id,
            code: where.id,
            type: where.id.includes("wip")
              ? "WIP"
              : where.id.includes("fg")
                ? "FINISHED_GOODS"
                : "RAW_MATERIAL",
            allowMaterialIssue: true,
          }),
        ),
      },
      account: {
        findFirst: vi.fn().mockImplementation(({ where }: FindFirstArgs) =>
          Promise.resolve(accountForId(where.id)),
        ),
      },
      manufacturingLocation: {
        findFirst: vi.fn().mockImplementation(({ where }: FindFirstArgs) =>
          Promise.resolve({
            id: where.id,
            name: where.id,
            warehouseId: where.warehouseId,
            disposition: where.id.includes("wip")
              ? "WIP"
              : where.id.includes("fgq")
                ? "QC_HOLD"
                : "RELEASED",
          }),
        ),
      },
    };

    await expect(
      serviceWithPrisma(prisma).updateSettings(user, dto),
    ).resolves.toMatchObject({ id: "settings-1", mode: "GENERAL" });
    expect(prisma.manufacturingOrder.findFirst).not.toHaveBeenCalled();
    expect(prisma.manufacturingRun.findFirst).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledOnce();
  });
});

describe("manufacturing setup readiness", () => {
  function readinessPrisma(
    settings: ReturnType<typeof settingsRow>,
    overrides: {
      warehouses?: Array<Record<string, unknown>>;
      locations?: Array<Record<string, unknown>>;
      ledgers?: Array<Record<string, unknown>>;
      documents?: string[];
      signaturePolicy?: Record<string, unknown> | null;
    } = {},
  ) {
    return {
      workspace: { findFirst: vi.fn().mockResolvedValue(workspace) },
      manufacturingSettings: {
        findUnique: vi.fn().mockResolvedValue(settings),
      },
      manufacturingItemProfile: { count: vi.fn().mockResolvedValue(1) },
      manufacturingBomVersion: { count: vi.fn().mockResolvedValue(1) },
      manufacturingRoutingVersion: { count: vi.fn().mockResolvedValue(1) },
      manufacturingDocumentSequence: {
        findMany: vi.fn().mockResolvedValue(
          (overrides.documents ?? coreDocumentKinds).map((documentKind) => ({
            documentKind,
          })),
        ),
      },
      manufacturingControlRecord: {
        findFirst: vi.fn().mockResolvedValue(
          overrides.signaturePolicy === undefined
            ? {
                id: "signature-policy-1",
                code: "ESIG-001",
                versionNumber: 1,
                payload: {
                  signatureMeanings: ["Approved"],
                  reauthenticationRequired: true,
                  sessionTimeoutMinutes: 15,
                  mfaRequired: false,
                },
              }
            : overrides.signaturePolicy,
        ),
      },
      warehouse: {
        findMany: vi.fn().mockResolvedValue(
          overrides.warehouses ?? [
            {
              id: "warehouse-rm",
              type: "RAW_MATERIAL",
              allowMaterialIssue: true,
            },
            { id: "warehouse-wip", type: "WIP", allowMaterialIssue: true },
            {
              id: "warehouse-fgq",
              type: "FINISHED_GOODS",
              allowMaterialIssue: false,
            },
            {
              id: "warehouse-fgr",
              type: "FINISHED_GOODS",
              allowMaterialIssue: false,
            },
          ],
        ),
      },
      manufacturingLocation: {
        findMany: vi.fn().mockResolvedValue(
          overrides.locations ?? [
            {
              id: "location-rm",
              warehouseId: "warehouse-rm",
              disposition: "RELEASED",
            },
            {
              id: "location-wip",
              warehouseId: "warehouse-wip",
              disposition: "WIP",
            },
            {
              id: "location-fgq",
              warehouseId: "warehouse-fgq",
              disposition: "QC_HOLD",
            },
            {
              id: "location-fgr",
              warehouseId: "warehouse-fgr",
              disposition: "RELEASED",
            },
          ],
        ),
      },
      account: {
        findMany: vi.fn().mockResolvedValue(
          overrides.ledgers ?? [
            inventoryControlLedger,
            {
              id: "account-wip",
              code: "WIP-001",
              nature: "ASSET",
              isSystem: false,
              isControlAccount: false,
            },
          ],
        ),
      },
    };
  }

  it("is ready only when the configured IDs resolve to eligible live records", async () => {
    const result = await serviceWithPrisma(
      readinessPrisma(settingsRow()),
    ).getReadiness(user, user.workspaceId!);

    expect(result.ready).toBe(true);
    expect(result.blockerCount).toBe(0);
    expect(readinessCheck(result, "WAREHOUSES")).toMatchObject({
      state: "READY",
      count: 4,
    });
    expect(readinessCheck(result, "LEDGERS")).toMatchObject({
      state: "READY",
      count: 3,
    });
    expect(readinessCheck(result, "LOGICAL_LOCATIONS").actionView).toBe(
      "status-configuration",
    );
  });

  it("blocks stale IDs, wrong warehouse roles and non-asset inventory ledgers", async () => {
    const prisma = readinessPrisma(settingsRow(), {
      warehouses: [
        { id: "warehouse-rm", type: "SHOWROOM", allowMaterialIssue: false },
        { id: "warehouse-wip", type: "WIP", allowMaterialIssue: true },
        {
          id: "warehouse-fgq",
          type: "FINISHED_GOODS",
          allowMaterialIssue: false,
        },
      ],
      locations: [
        {
          id: "location-rm",
          warehouseId: "warehouse-rm",
          disposition: "RELEASED",
        },
        {
          id: "location-wip",
          warehouseId: "warehouse-wip",
          disposition: "STAGING",
        },
      ],
      ledgers: [
        {
          ...inventoryControlLedger,
          nature: "DIRECT_EXPENSE",
        },
        {
          id: "account-wip",
          code: "WIP-001",
          nature: "ASSET",
          isSystem: false,
          isControlAccount: false,
        },
      ],
    });

    const result = await serviceWithPrisma(prisma).getReadiness(
      user,
      user.workspaceId!,
    );

    expect(result.ready).toBe(false);
    expect(readinessCheck(result, "WAREHOUSES").state).toBe("BLOCKED");
    expect(readinessCheck(result, "LOGICAL_LOCATIONS").state).toBe("BLOCKED");
    expect(readinessCheck(result, "LEDGERS").state).toBe("BLOCKED");
  });

  it("blocks readiness when the configured scrap inventory/recovery ledger is not an ASSET", async () => {
    const result = await serviceWithPrisma(
      readinessPrisma(
        settingsRow({ scrapRecoveryAccountId: "account-scrap" }),
        {
          ledgers: [
            inventoryControlLedger,
            {
              id: "account-wip",
              code: "WIP-001",
              nature: "ASSET",
              isSystem: false,
              isControlAccount: false,
            },
            {
              id: "account-scrap",
              code: "SCRAP-001",
              nature: "ASSET",
              isSystem: false,
              isControlAccount: false,
            },
          ],
        },
      ),
    ).getReadiness(user, user.workspaceId!);

    expect(result.ready).toBe(false);
    expect(readinessCheck(result, "LEDGERS").state).toBe("BLOCKED");
  });

  it("requires pharmaceutical packaging and quality-control readiness", async () => {
    const pharmaceutical = settingsRow({
      mode: "PHARMACEUTICAL",
      requireQcBeforeRelease: true,
      packagingInventoryAccountId: null,
    });
    const result = await serviceWithPrisma(
      readinessPrisma(pharmaceutical),
    ).getReadiness(user, user.workspaceId!);

    expect(result.ready).toBe(false);
    expect(readinessCheck(result, "LEDGERS").state).toBe("BLOCKED");
    expect(readinessCheck(result, "DOCUMENT_NUMBERING").message).toContain(
      "QC_INSPECTION",
    );
    expect(readinessCheck(result, "DOCUMENT_NUMBERING").message).toContain(
      "PACKAGING_ORDER",
    );
  });

  it("blocks readiness when electronic signatures are required without a valid approved policy", async () => {
    const result = await serviceWithPrisma(
      readinessPrisma(settingsRow(), { signaturePolicy: null }),
    ).getReadiness(user, user.workspaceId!);

    expect(result.ready).toBe(false);
    expect(readinessCheck(result, "ELECTRONIC_SIGNATURE_POLICY")).toMatchObject(
      {
        state: "BLOCKED",
        count: 0,
        actionView: "electronic-signature-settings",
      },
    );
  });

  it("queries only signature policies effective on the current UTC day", async () => {
    const prisma = readinessPrisma(settingsRow());

    await serviceWithPrisma(prisma).getReadiness(user, user.workspaceId!);

    const where = prisma.manufacturingControlRecord.findFirst.mock.calls[0]![0]
      .where as any;
    const fromDay = where.AND[0].OR[1].effectiveFrom.lte as Date;
    const toDay = where.AND[1].OR[1].effectiveTo.gte as Date;
    expect(fromDay).toEqual(toDay);
    expect(fromDay.getUTCHours()).toBe(0);
    expect(fromDay.getUTCMinutes()).toBe(0);
    expect(fromDay.getUTCSeconds()).toBe(0);
    expect(fromDay.getUTCMilliseconds()).toBe(0);
  });

  it("blocks readiness when no approved routing with operations exists", async () => {
    const prisma = readinessPrisma(settingsRow());
    prisma.manufacturingRoutingVersion.count.mockResolvedValue(0);

    const result = await serviceWithPrisma(prisma).getReadiness(
      user,
      user.workspaceId!,
    );

    expect(readinessCheck(result, "ROUTING")).toMatchObject({
      state: "BLOCKED",
      count: 0,
    });
    expect(
      prisma.manufacturingRoutingVersion.count.mock.calls[0]![0].where,
    ).toMatchObject({ operations: { some: {} } });
  });

  it("does not require a signature policy when electronic signatures are disabled", async () => {
    const result = await serviceWithPrisma(
      readinessPrisma(settingsRow({ electronicSignatureRequired: false }), {
        signaturePolicy: null,
      }),
    ).getReadiness(user, user.workspaceId!);

    expect(readinessCheck(result, "ELECTRONIC_SIGNATURE_POLICY")).toMatchObject(
      {
        state: "READY",
        count: 0,
      },
    );
  });
});
