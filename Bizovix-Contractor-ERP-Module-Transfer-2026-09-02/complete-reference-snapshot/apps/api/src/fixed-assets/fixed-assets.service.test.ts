import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { CreateFixedAssetDto } from "./dto/create-fixed-asset.dto.js";
import { FixedAssetsService } from "./fixed-assets.service.js";

const currentUser: AuthenticatedRequestUser = {
  id: "user-1",
  email: "owner@example.com",
  name: "Owner",
  initials: "OW",
  tenantId: "tenant-1",
  organizationId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

function creditAssetInput(): CreateFixedAssetDto {
  return {
    workspaceId: "workspace-1",
    name: "Delivery Van",
    purchaseDate: "2026-08-31",
    purchaseCost: 100_000,
    transportationCost: 0,
    installationCost: 0,
    importDuty: 0,
    registrationCost: 0,
    otherCapitalizedCost: 0,
    discountAmount: 0,
    salvageValue: 0,
    usefulLifeMonths: 60,
    fundingMode: "CREDIT",
    supplierId: "supplier-1",
  };
}

type FixedAssetInternals = {
  ensureFixedAssetChartSetup(user: AuthenticatedRequestUser): Promise<{ fixedAssetsCategoryId: string }>;
  ensureCategoryLedgers(user: AuthenticatedRequestUser, categoryId: string): Promise<{
    assetCategoryNodeId: string;
    accumulatedDepreciationLedgerId: string;
    accumulatedDepreciationLedgerName: string;
    depreciationExpenseLedgerId: string;
    depreciationExpenseLedgerName: string;
  }>;
};

function buildHarness(options?: { ledgerAccountId?: string | null; supplierLedgerValid?: boolean }) {
  const ledgerAccountId = options?.ledgerAccountId === undefined ? "supplier-ap-1" : options.ledgerAccountId;
  const supplierLedgerValid = options?.supplierLedgerValid ?? true;
  const voucherCreate = vi.fn(async (
    user: AuthenticatedRequestUser,
    payload: { lines: Array<Record<string, unknown>> },
  ) => {
    void user;
    void payload;
    return { id: "asset-journal-1" };
  });
  const accountCreate = vi.fn(async () => ({ id: "asset-ledger-1", code: "1100010" }));
  const fixedAssetCreate = vi.fn(async () => ({
    id: "asset-1",
    assetCode: "AST-GEN-0001",
    name: "Delivery Van",
    category: null,
    categoryId: null,
    assetCategory: null,
    location: null,
    department: null,
    assignedToName: null,
    brand: null,
    model: null,
    manufacturer: null,
    serialNumber: null,
    registrationNumber: null,
    condition: "GOOD",
    operationalStatus: "AVAILABLE",
    acquisitionType: "PURCHASE_ORDER",
    supplierId: "supplier-1",
    supplier: { name: "Supplier Display Name" },
    notes: null,
    purchaseDate: new Date("2026-08-31T00:00:00.000Z"),
    purchaseCost: 100_000,
    transportationCost: 0,
    installationCost: 0,
    importDuty: 0,
    registrationCost: 0,
    otherCapitalizedCost: 0,
    discountAmount: 0,
    capitalizedCost: 100_000,
    salvageValue: 0,
    usefulLifeMonths: 60,
    depreciationMethod: "STRAIGHT_LINE",
    status: "ACTIVE",
    disposalDate: null,
    disposalProceeds: null,
    assetLedgerId: "asset-ledger-1",
    assetLedger: { code: "1100010" },
    depreciationEntries: [],
    createdAt: new Date("2026-08-31T00:00:00.000Z"),
  }));
  const accountFindFirst = vi.fn(async () => supplierLedgerValid
    ? { id: "supplier-ap-1", name: "Supplier AP Ledger" }
    : null);
  const prisma = {
    workspace: {
      findUnique: vi.fn(async () => ({ id: "workspace-1", tenantId: "tenant-1", companyId: "company-1" })),
    },
    party: {
      findFirst: vi.fn(async () => ({ id: "supplier-1", name: "Supplier Display Name", ledgerAccountId })),
    },
    account: { findFirst: accountFindFirst },
    fixedAsset: {
      findMany: vi.fn(async () => []),
      create: fixedAssetCreate,
    },
  };
  const postingEngine = { transitionStatus: vi.fn(async () => ({})) };
  const service = new FixedAssetsService(
    prisma as never,
    { create: accountCreate } as never,
    { create: voucherCreate } as never,
    postingEngine as never,
    {} as never,
  );
  vi.spyOn(service as unknown as FixedAssetInternals, "ensureFixedAssetChartSetup")
    .mockResolvedValue({ fixedAssetsCategoryId: "fixed-assets-category" });
  return { service, voucherCreate, accountCreate, accountFindFirst, fixedAssetCreate, postingEngine };
}

describe("FixedAssetsService credit acquisition posting", () => {
  it("posts the supplier side with the Party-owned AP account id", async () => {
    const { service, voucherCreate, postingEngine } = buildHarness();

    await service.create(currentUser, creditAssetInput());

    const voucherPayload = voucherCreate.mock.calls[0]?.[1];
    expect(voucherPayload?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "asset-acquisition-payable",
        accountId: "supplier-ap-1",
        ledger: "Supplier AP Ledger",
        debit: 0,
        credit: 100_000,
      }),
    ]));
    expect(postingEngine.transitionStatus).toHaveBeenCalledTimes(2);
  });

  it("rejects a supplier that has no linked AP ledger before creating the asset ledger", async () => {
    const { service, accountCreate, fixedAssetCreate } = buildHarness({ ledgerAccountId: null });

    await expect(service.create(currentUser, creditAssetInput()))
      .rejects.toThrow(/not linked to an Accounts Payable ledger/i);
    expect(accountCreate).not.toHaveBeenCalled();
    expect(fixedAssetCreate).not.toHaveBeenCalled();
  });

  it("rejects an inactive, cross-company, non-ledger, or non-AP linked account", async () => {
    const { service, accountFindFirst, accountCreate } = buildHarness({ supplierLedgerValid: false });

    await expect(service.create(currentUser, creditAssetInput()))
      .rejects.toThrow(/missing, inactive, or invalid/i);
    expect(accountFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "supplier-ap-1",
        companyId: "company-1",
        level: "LEDGER",
        status: "ACTIVE",
        accountGroup: { code: "AP" },
      }),
    }));
    expect(accountCreate).not.toHaveBeenCalled();
  });
});

describe("FixedAssetsService account identity", () => {
  function buildIdentityHarness() {
    const globalAccounts = {
      FIXED_ASSET_ACCUMULATED_DEPRECIATION: {
        id: "global-accumulated",
        name: "Renamed Global Contra Asset",
        managedRole: "FIXED_ASSET_ACCUMULATED_DEPRECIATION",
        level: "LEDGER",
        parentId: "fixed-assets-category",
        nature: "ASSET",
        status: "ACTIVE",
        isSystem: false,
      },
      FIXED_ASSET_DEPRECIATION_EXPENSE: {
        id: "global-depreciation-expense",
        name: "Renamed Global Depreciation Cost",
        managedRole: "FIXED_ASSET_DEPRECIATION_EXPENSE",
        level: "LEDGER",
        parentId: "indirect-expenses-category",
        nature: "INDIRECT_EXPENSE",
        status: "ACTIVE",
        isSystem: false,
      },
    } as const;
    const mappedAccounts: Record<string, Record<string, unknown>> = {
      "shared-asset-node": { id: "shared-asset-node", name: "Shared Asset Node", level: "CATEGORY", nature: "ASSET", status: "ACTIVE" },
      "shared-accumulated": { id: "shared-accumulated", name: "Shared Contra Asset", level: "LEDGER", nature: "ASSET", status: "ACTIVE" },
      "shared-depreciation-expense": { id: "shared-depreciation-expense", name: "Shared Depreciation Cost", level: "LEDGER", nature: "INDIRECT_EXPENSE", status: "ACTIVE" },
    };
    const accountFindFirst = vi.fn(async ({ where }: { where: { code?: string; managedRole?: keyof typeof globalAccounts; id?: string } }) => {
      if (where.code === "1100000") return { id: "fixed-assets-category", name: "Renamed Fixed Assets", isSystem: true };
      if (where.code === "5200000") return { id: "indirect-expenses-category", name: "Renamed Indirect Expenses", isSystem: true };
      if (where.managedRole) return globalAccounts[where.managedRole];
      if (where.id) return mappedAccounts[where.id] ?? null;
      return null;
    });
    const assetCategoryFindFirst = vi.fn(async () => ({
      id: "asset-category-1",
      companyId: "company-1",
      name: "Vehicles",
      assetLedgerId: "shared-asset-node",
      accumulatedDepreciationLedgerId: "shared-accumulated",
      depreciationExpenseLedgerId: "shared-depreciation-expense",
    }));
    const assetCategoryUpdate = vi.fn(async () => ({}));
    const prisma = {
      account: { findFirst: accountFindFirst },
      assetCategory: { findFirst: assetCategoryFindFirst, update: assetCategoryUpdate },
    };
    const accountsService = { createManagedAccount: vi.fn() };
    const service = new FixedAssetsService(
      prisma as never,
      accountsService as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, accountsService, accountFindFirst, assetCategoryUpdate };
  }

  it("resolves renamed global ledgers by managedRole under fixed-code anchors", async () => {
    const { service, accountsService, accountFindFirst } = buildIdentityHarness();

    const result = await service.ensureFixedAssetChartSetup(currentUser);

    expect(result).toEqual(expect.objectContaining({
      fixedAssetsCategoryId: "fixed-assets-category",
      accumulatedDepreciationLedgerId: "global-accumulated",
      accumulatedDepreciationLedgerName: "Renamed Global Contra Asset",
      depreciationExpenseLedgerId: "global-depreciation-expense",
      depreciationExpenseLedgerName: "Renamed Global Depreciation Cost",
    }));
    expect(accountsService.createManagedAccount).not.toHaveBeenCalled();
    expect(accountFindFirst.mock.calls.every((call) => !("name" in call[0].where))).toBe(true);
  });

  it("keeps existing AssetCategory account IDs authoritative, including shared common ledgers", async () => {
    const { service, accountsService, assetCategoryUpdate } = buildIdentityHarness();

    const result = await (service as unknown as FixedAssetInternals).ensureCategoryLedgers(currentUser, "asset-category-1");

    expect(result).toEqual({
      assetCategoryNodeId: "shared-asset-node",
      accumulatedDepreciationLedgerId: "shared-accumulated",
      accumulatedDepreciationLedgerName: "Shared Contra Asset",
      depreciationExpenseLedgerId: "shared-depreciation-expense",
      depreciationExpenseLedgerName: "Shared Depreciation Cost",
    });
    expect(assetCategoryUpdate).not.toHaveBeenCalled();
    expect(accountsService.createManagedAccount).not.toHaveBeenCalled();
  });
});

describe("FixedAssetsService deletion accounting", () => {
  it("preserves posted opening history, uses its linked reversal, and deactivates the ledger", async () => {
    const accountDelete = vi.fn(async () => ({}));
    const accountUpdate = vi.fn(async () => ({}));
    const fixedAssetDelete = vi.fn(async () => ({}));
    const voucherEntryLineCount = vi.fn(async () => 2);
    const tx = {
      voucherEntryLine: { count: voucherEntryLineCount },
      fixedAsset: { delete: fixedAssetDelete },
      account: { delete: accountDelete, update: accountUpdate },
    };
    const prisma = {
      fixedAsset: {
        findFirst: vi.fn(async () => ({
          id: "asset-1",
          assetCode: "AST-GEN-0001",
          name: "Delivery Van",
          workspaceId: "workspace-1",
          assetLedgerId: "asset-ledger-1",
          assetLedger: { name: "Renamed Delivery Van Ledger", isSystem: false, voucherEntryLines: [{ id: "line-1" }] },
        })),
      },
      voucherEntry: {
        findFirst: vi.fn(async () => ({
          id: "opening-v1",
          status: "POSTED",
          postingVersion: 1,
          lines: [
            { id: "target", accountId: "asset-ledger-1", ledger: "Old Delivery Van Ledger", debit: 100_000, credit: 0 },
            { id: "cash", accountId: "cash-1", ledger: "Cash", debit: 0, credit: 100_000 },
          ],
        })),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const reverseVoucher = vi.fn(async () => ({ id: "opening-v1-reversal" }));
    const service = new FixedAssetsService(
      prisma as never,
      {} as never,
      { create: vi.fn() } as never,
      { reverseVoucher, transitionStatus: vi.fn() } as never,
      { log: vi.fn(async () => ({})) } as never,
    );

    await service.delete(currentUser, "asset-1");

    expect(reverseVoucher).toHaveBeenCalledWith(currentUser, "opening-v1", expect.stringContaining("Delivery Van"));
    expect(fixedAssetDelete).toHaveBeenCalledWith({ where: { id: "asset-1" } });
    expect(accountUpdate).toHaveBeenCalledWith({ where: { id: "asset-ledger-1" }, data: { status: "INACTIVE" } });
    expect(accountDelete).not.toHaveBeenCalled();
    expect(voucherEntryLineCount).toHaveBeenCalledWith({
      where: {
        voucher: { companyId: "company-1" },
        OR: [
          { accountId: "asset-ledger-1" },
          { accountId: null, ledger: "Renamed Delivery Van Ledger" },
        ],
      },
    });
  });

  it("never deletes or deactivates a protected system account linked by historical data", async () => {
    const accountDelete = vi.fn(async () => ({}));
    const accountUpdate = vi.fn(async () => ({}));
    const fixedAssetDelete = vi.fn(async () => ({}));
    const tx = {
      voucherEntryLine: { count: vi.fn(async () => 0) },
      fixedAsset: { delete: fixedAssetDelete },
      account: { delete: accountDelete, update: accountUpdate },
    };
    const prisma = {
      fixedAsset: {
        findFirst: vi.fn(async () => ({
          id: "asset-legacy",
          assetCode: "AST-LEGACY-0001",
          name: "Legacy Asset",
          workspaceId: "workspace-1",
          assetLedgerId: "protected-account",
          assetLedger: { name: "Protected Fixed Assets", isSystem: true, voucherEntryLines: [] },
        })),
      },
      voucherEntry: { findFirst: vi.fn(async () => null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new FixedAssetsService(
      prisma as never,
      {} as never,
      { create: vi.fn() } as never,
      { reverseVoucher: vi.fn(), transitionStatus: vi.fn() } as never,
      { log: vi.fn(async () => ({})) } as never,
    );

    await service.delete(currentUser, "asset-legacy");

    expect(fixedAssetDelete).toHaveBeenCalledWith({ where: { id: "asset-legacy" } });
    expect(accountDelete).not.toHaveBeenCalled();
    expect(accountUpdate).not.toHaveBeenCalled();
  });
});
