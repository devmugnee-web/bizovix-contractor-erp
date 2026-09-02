import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from "@nestjs/common";
import {
  ManufacturingItemRole,
  ManufacturingLocationDisposition,
  ManufacturingMakeBuy,
  ManufacturingSerialStatus,
  Prisma,
  StockMovementType,
  VoucherEntryStatus,
  VoucherEntryType,
  VoucherWorkflowOrigin,
  WarehouseTransferStatus,
} from "../generated/prisma/index.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { AuditService } from "../audit/audit.service.js";
import { moneyEquals, roundMoney, sumMoney } from "../accounting/money.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateWarehouseTransferDto, SaveWarehouseDto } from "./dto/warehouse.dto.js";
import {
  MOVING_AVERAGE_COSTING_VERSION,
  readMovingAverageCosts,
  rebuildMovingAverageCosts,
  resolveNegativeStockPolicy,
} from "./moving-average.js";

type DbClient = Prisma.TransactionClient | PrismaService;

type RevaluablePurchaseLine = {
  id: string;
  inventoryItemId: string | null;
  warehouseId: string | null;
  sourceInventoryLineId: string | null;
  itemName: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
};

type SourcedSalesInvoiceLine = {
  sourceInventoryLineId: string | null;
  inventoryItemId: string | null;
  itemName: string;
  quantity: Prisma.Decimal;
};

type ReceiptBackedPurchaseBill = {
  id: string;
  tenantId: string;
  companyId: string;
  workspaceId: string;
  voucherType: VoucherEntryType;
  documentKind: string | null;
  sourceVoucherId: string | null;
  voucherNumber: string;
  voucherDate: Date;
  status: VoucherEntryStatus;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  discountAmount: Prisma.Decimal | null;
  inventoryItems: RevaluablePurchaseLine[];
  lines: Array<{ billReference: string | null }>;
};

type ManufacturingSalesProfile = {
  role: ManufacturingItemRole;
  makeBuy: ManufacturingMakeBuy;
  lotTracked: boolean;
  serialTracked: boolean;
  isActive: boolean;
} | null;

type ManufacturingSalesLine = {
  id: string;
  inventoryItemId: string | null;
  warehouseId: string | null;
  sourceInventoryLineId: string | null;
  manufacturingInventoryLotId: string | null;
  manufacturingSerialIds: string[];
  itemName: string;
  quantity: Prisma.Decimal;
  inventoryItem: {
    id: string;
    unit: string;
    manufacturingProfile: ManufacturingSalesProfile;
  } | null;
};

type InventoryValuationMovement = {
  id?: string;
  tenantId?: string;
  companyId?: string;
  workspaceId?: string;
  warehouseId?: string;
  transactionId: string;
  transactionLineId?: string;
  transactionType: string;
  movementType: StockMovementType;
  unitCost?: number;
  movementValue: number;
  transactionDate?: Date | string;
  postedByUserId?: string | null;
  referenceNo?: string | null;
};

const INVENTORY_VALUATION_COST_CENTER = "INVENTORY_VALUATION";
const INVENTORY_COST_REVALUATION_SOURCE = "INVENTORY_COST_REVALUATION";
const INVENTORY_CONTROL_ACCOUNT_CODE = "1210001";
const DELIVERED_INVENTORY_PENDING_ACCOUNT_CODE = "1232001";
const PURCHASE_BILL_PENDING_ACCOUNT_CODE = "2212001";
const COGS_ACCOUNT_CODE = "5110001";
const OPENING_BALANCE_EQUITY_ACCOUNT_CODE = "3100001";
const INVENTORY_ADJUSTMENT_GAIN_ACCOUNT_CODE = "4200001";
const INVENTORY_ADJUSTMENT_LOSS_ACCOUNT_CODE = "5210008";
const COGS_MOVEMENT_TRANSACTION_TYPES = new Set(["SALES", "CREDIT_NOTE"]);
const DELIVERY_NOTE_TRANSACTION_TYPE = "DELIVERY_NOTE";
const OPENING_LEDGER_TRANSACTION_TYPES = new Set([
  "OPENING_STOCK",
  "MIGRATION_OPENING",
  "OPENING_STOCK_ADJUSTMENT",
  "OPENING_STOCK_REVERSAL",
  "MIGRATION_OPENING_REVERSAL",
]);
const ADJUSTMENT_LEDGER_TRANSACTION_TYPES = new Set(["STOCK_ADJUSTMENT", "STOCK_ADJUSTMENT_REVERSAL"]);
const INVENTORY_OPENING_VALUATION_SOURCE = "INVENTORY_OPENING_VALUATION";
const INVENTORY_ADJUSTMENT_VALUATION_SOURCE = "INVENTORY_ADJUSTMENT_VALUATION";
const PURCHASE_BILL_COST_VARIANCE_SOURCE = "PURCHASE_BILL_COST_VARIANCE";
const PURCHASE_COST_VARIANCE_COST_CENTER = "PURCHASE_COST_VARIANCE";
const DELIVERY_NOTE_VALUATION_SOURCE = "DELIVERY_NOTE_INVENTORY_REVALUATION";
const SALES_INVOICE_DELIVERY_COST_SOURCE = "SALES_INVOICE_DELIVERY_COST_REVALUATION";
const DELIVERY_NOTE_VALUATION_COST_CENTER = "DELIVERY_NOTE_INVENTORY_VALUATION";
const SALES_INVOICE_DELIVERY_COST_CENTER = "SALES_INVOICE_DELIVERY_COST";

@Injectable()
export class InventoryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    const bootstrapStartedAt = Date.now();
    const [movementWorkspaces, revaluationWorkspaces] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: {
          voidedAt: null,
          OR: [
            { costingVersion: { lt: MOVING_AVERAGE_COSTING_VERSION } },
            // Historical opening/adjustment/Delivery Note movements may already
            // carry the current costing version but predate their GL bridges.
            // Revisit their workspaces; reconciliation itself is delta-idempotent.
            {
              transactionType: {
                in: [
                  ...OPENING_LEDGER_TRANSACTION_TYPES,
                  ...ADJUSTMENT_LEDGER_TRANSACTION_TYPES,
                  DELIVERY_NOTE_TRANSACTION_TYPE,
                  `${DELIVERY_NOTE_TRANSACTION_TYPE}_REVERSAL`,
                ],
              },
            },
          ],
        },
        distinct: ["workspaceId"],
        select: { workspaceId: true },
      }),
      // Receipt-backed bills created before the Inventory/Purchase Bill
      // Pending variance pair was introduced can already be fully costed.
      // Their active revaluation rows are therefore a separate repair signal.
      this.prisma.inventoryCostRevaluation.findMany({
        where: { isActive: true },
        distinct: ["workspaceId"],
        select: { workspaceId: true },
      }),
    ]);
    const pendingWorkspaces = [...new Map(
      [...movementWorkspaces, ...revaluationWorkspaces]
        .map((workspace) => [workspace.workspaceId, workspace] as const),
    ).values()];
    this.logger.log(
      `[startup-timing] Inventory costing/GL repair workspace scan: ${Date.now() - bootstrapStartedAt}ms (${pendingWorkspaces.length} pending workspace(s))`,
    );
    for (const { workspaceId } of pendingWorkspaces) {
      try {
        const rebuildStartedAt = Date.now();
        await this.prisma.$transaction(
          async (tx) => {
            const valuation = await rebuildMovingAverageCosts(tx, workspaceId);
            await this.assertValuationStockPolicy(tx, workspaceId, valuation.movements);
            await this.reconcileMovingAverageLedger(tx, workspaceId, valuation.movements);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        this.logger.log(`[startup-timing] Moving average costing rebuild for workspace ${workspaceId}: ${Date.now() - rebuildStartedAt}ms`);
      } catch (error) {
        // One workspace's unresolved data-integrity issue must never block the
        // whole API from starting — every other workspace still needs to boot.
        // This workspace simply retries its costing rebuild on the next start.
        this.logger.error(`Inventory costing/GL repair failed for workspace ${workspaceId} — server startup continues, this workspace retries on the next start.`, error instanceof Error ? error.stack : error);
      }
    }
    this.logger.log(`[startup-timing] onApplicationBootstrap total: ${Date.now() - bootstrapStartedAt}ms`);
  }

  private async assertWorkspace(user: AuthenticatedRequestUser, workspaceId: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, tenantId: user.tenantId, companyId: user.companyId, memberships: { some: { userId: user.id } } },
    });
    if (!workspace) throw new ForbiddenException("Workspace access denied");
    return workspace;
  }

  async ensureDefaultWarehouse(workspaceId: string, db: DbClient = this.prisma) {
    const existing = await db.warehouse.findFirst({ where: { workspaceId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
    if (existing) {
      if (!existing.isDefault) return db.warehouse.update({ where: { id: existing.id }, data: { isDefault: true, isActive: true } });
      return existing;
    }
    const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    return db.warehouse.create({ data: { tenantId: workspace.tenantId, companyId: workspace.companyId, workspaceId, name: "Main Warehouse", code: "WH-MAIN", isDefault: true, isActive: true } });
  }

  async listWarehouses(user: AuthenticatedRequestUser, workspaceId: string, activeOnly = false) {
    await this.assertWorkspace(user, workspaceId);
    await this.ensureDefaultWarehouse(workspaceId);
    return this.prisma.warehouse.findMany({
      where: { workspaceId, deletedAt: null, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  async manufacturingSaleProvenance(user: AuthenticatedRequestUser, workspaceId: string) {
    await this.assertWorkspace(user, workspaceId);
    const profiles = await this.prisma.manufacturingItemProfile.findMany({
      where: {
        workspaceId,
        isActive: true,
        role: ManufacturingItemRole.FINISHED_GOOD,
        OR: [
          { makeBuy: { in: [ManufacturingMakeBuy.MAKE, ManufacturingMakeBuy.BOTH] } },
          { lotTracked: true },
          { serialTracked: true },
        ],
      },
      select: {
        inventoryItemId: true,
        serialTracked: true,
        inventoryItem: { select: { itemCode: true, itemName: true } },
      },
    });
    const trackedItemIds = profiles.map((profile) => profile.inventoryItemId);
    const settings = await this.prisma.manufacturingSettings.findUnique({
      where: { workspaceId },
      select: {
        defaultFinishedGoodsReleasedWarehouseId: true,
        defaultFinishedGoodsReleaseLocationId: true,
        requireSerialBeforeRelease: true,
      },
    });
    if (!trackedItemIds.length || !settings?.defaultFinishedGoodsReleasedWarehouseId) {
      return {
        trackedItemIds,
        trackedItems: profiles.map((profile) => ({
          id: profile.inventoryItemId,
          itemCode: profile.inventoryItem.itemCode,
          itemName: profile.inventoryItem.itemName,
          serialTracked: profile.serialTracked || Boolean(settings?.requireSerialBeforeRelease),
        })),
        lots: [],
      };
    }
    const serialTrackedByItemId = new Map(
      profiles.map((profile) => [
        profile.inventoryItemId,
        profile.serialTracked || settings.requireSerialBeforeRelease,
      ]),
    );
    const lots = await this.prisma.manufacturingInventoryLot.findMany({
      where: {
        workspaceId,
        inventoryItemId: { in: trackedItemIds },
        warehouseId: settings.defaultFinishedGoodsReleasedWarehouseId,
        holdQuantity: 0,
        rejectedQuantity: 0,
        // Keep an otherwise-valid FG-R lot visible for an exact sales return
        // even if new sales were disabled on the warehouse after the original
        // issue. Direct sales still enforce allowSales in postVoucherMovements.
        warehouse: { isActive: true, deletedAt: null },
        location: {
          is: {
            workspaceId,
            warehouseId: settings.defaultFinishedGoodsReleasedWarehouseId,
            disposition: ManufacturingLocationDisposition.RELEASED,
            isActive: true,
            ...(settings.defaultFinishedGoodsReleaseLocationId
              ? { id: settings.defaultFinishedGoodsReleaseLocationId }
              : {}),
          },
        },
      },
      include: {
        inventoryItem: { select: { id: true, itemCode: true, itemName: true, unit: true } },
        warehouse: { select: { id: true, code: true, name: true, allowSales: true } },
        location: { select: { id: true, code: true, name: true } },
        serials: {
          where: { status: { in: [ManufacturingSerialStatus.RELEASED, ManufacturingSerialStatus.CONSUMED] } },
          select: { id: true, serialNumber: true, status: true },
          orderBy: [{ serialNumber: "asc" }],
        },
      },
      orderBy: [{ manufacturedAt: "asc" }, { createdAt: "asc" }, { lotNumber: "asc" }],
    });
    return {
      trackedItemIds,
      trackedItems: profiles.map((profile) => ({
        id: profile.inventoryItemId,
        itemCode: profile.inventoryItem.itemCode,
        itemName: profile.inventoryItem.itemName,
        serialTracked: profile.serialTracked || settings.requireSerialBeforeRelease,
      })),
      lots: lots.map((lot) => ({
        id: lot.id,
        lotNumber: lot.lotNumber,
        inventoryItemId: lot.inventoryItemId,
        itemCode: lot.inventoryItem.itemCode,
        itemName: lot.inventoryItem.itemName,
        unit: lot.unit || lot.inventoryItem.unit,
        warehouse: lot.warehouse,
        location: lot.location,
        availableQuantity: Number(lot.availableQuantity),
        reservedQuantity: Number(lot.reservedQuantity),
        serialTracked: serialTrackedByItemId.get(lot.inventoryItemId) ?? false,
        serials: lot.serials,
      })),
    };
  }

  async createWarehouse(user: AuthenticatedRequestUser, workspaceId: string, dto: SaveWarehouseDto) {
    const workspace = await this.assertWorkspace(user, workspaceId);
    const name = dto.name.trim(); const code = dto.code.trim().toUpperCase();
    if (!name || !code) throw new BadRequestException("Warehouse name and code are required");
    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) await tx.warehouse.updateMany({ where: { workspaceId, isDefault: true }, data: { isDefault: false } });
        return tx.warehouse.create({ data: { tenantId: workspace.tenantId, companyId: workspace.companyId, workspaceId, name, code, address: dto.address?.trim() || null, description: dto.description?.trim() || null, type: dto.type, allowGrn: dto.allowGrn ?? true, allowSales: dto.allowSales ?? true, allowMaterialIssue: dto.allowMaterialIssue ?? false, isDefault: dto.isDefault ?? false, isActive: dto.isDefault ? true : dto.isActive ?? true } });
      });
    } catch (error) { if ((error as { code?: string }).code === "P2002") throw new ConflictException("Warehouse name or code already exists"); throw error; }
    await this.audit.log({ tenantId: user.tenantId, companyId: user.companyId, workspaceId, userId: user.id, action: "WAREHOUSE_CREATED", entityType: "Warehouse", entityId: created.id, newValues: created });
    return created;
  }

  async updateWarehouse(user: AuthenticatedRequestUser, id: string, dto: SaveWarehouseDto) {
    const existing = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException("Warehouse not found");
    await this.assertWorkspace(user, existing.workspaceId);
    if (existing.isDefault && dto.isActive === false) throw new BadRequestException("Default warehouse cannot be deactivated");
    if (existing.isDefault && dto.isDefault === false) throw new BadRequestException("Set another warehouse as default instead");
    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) await tx.warehouse.updateMany({ where: { workspaceId: existing.workspaceId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
        return tx.warehouse.update({ where: { id }, data: { name: dto.name.trim(), code: dto.code.trim().toUpperCase(), address: dto.address?.trim() || null, description: dto.description?.trim() || null, type: dto.type ?? existing.type, allowGrn: dto.allowGrn ?? existing.allowGrn, allowSales: dto.allowSales ?? existing.allowSales, allowMaterialIssue: dto.allowMaterialIssue ?? existing.allowMaterialIssue, isDefault: dto.isDefault ?? existing.isDefault, isActive: dto.isDefault ? true : dto.isActive ?? existing.isActive } });
      });
    } catch (error) { if ((error as { code?: string }).code === "P2002") throw new ConflictException("Warehouse name or code already exists"); throw error; }
    await this.audit.log({ tenantId: user.tenantId, companyId: user.companyId, workspaceId: existing.workspaceId, userId: user.id, action: "WAREHOUSE_UPDATED", entityType: "Warehouse", entityId: id, oldValues: existing, newValues: updated });
    return updated;
  }

  async deleteWarehouse(user: AuthenticatedRequestUser, id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id }, include: { _count: { select: { movements: true, vouchers: true, voucherItems: true, transfersFrom: true, transfersTo: true } } } });
    if (!warehouse || warehouse.deletedAt) throw new NotFoundException("Warehouse not found");
    await this.assertWorkspace(user, warehouse.workspaceId);
    if (warehouse.isDefault) throw new BadRequestException("Default warehouse cannot be deleted");
    const used = Object.values(warehouse._count).some((count) => count > 0);
    if (used) throw new BadRequestException("A warehouse used in transactions can only be deactivated");
    await this.prisma.warehouse.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, companyId: user.companyId, workspaceId: warehouse.workspaceId, userId: user.id, action: "WAREHOUSE_DELETED", entityType: "Warehouse", entityId: id, oldValues: warehouse });
    return { success: true };
  }

  async stockSummary(user: AuthenticatedRequestUser, workspaceId: string, warehouseId?: string, productId?: string, to?: string) {
    await this.assertWorkspace(user, workspaceId);
    const valuation = await this.prisma.$transaction(
      async (tx) => {
        const result = await readMovingAverageCosts(tx, workspaceId, productId ? [productId] : undefined);
        await this.assertValuationStockPolicy(tx, workspaceId, result.movements);
        return result;
      },
    );
    const asOf = to
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to)
      : null;
    if (asOf && Number.isNaN(asOf.getTime())) throw new BadRequestException("Invalid stock as-of date");
    const balances = asOf
      ? new Map(
          valuation.movements
            .filter((movement) => new Date(movement.transactionDate).getTime() <= asOf.getTime())
            .map((movement) => [
              `${movement.warehouseId}:${movement.inventoryItemId}`,
              {
                warehouseId: movement.warehouseId,
                inventoryItemId: movement.inventoryItemId,
                quantity: movement.balanceQuantity,
                value: movement.balanceValue,
                averageCost: movement.averageCost,
              },
            ]),
        )
      : valuation.balances;
    const selectedBalances = [...balances.values()].filter((balance) => !warehouseId || balance.warehouseId === warehouseId);
    const warehouseIds = [...new Set(selectedBalances.map((balance) => balance.warehouseId))];
    const itemIds = [...new Set(selectedBalances.map((balance) => balance.inventoryItemId))];
    const [warehouses, items] = await Promise.all([
      this.prisma.warehouse.findMany({ where: { id: { in: warehouseIds }, workspaceId, deletedAt: null } }),
      this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds }, ...(productId ? { id: productId } : {}) } }),
    ]);
    const warehouseById = new Map(warehouses.map((entry) => [entry.id, entry]));
    const itemById = new Map(items.map((entry) => [entry.id, entry]));
    return selectedBalances
      .filter((balance) => warehouseById.has(balance.warehouseId) && itemById.has(balance.inventoryItemId))
      .map((balance) => {
        const warehouse = warehouseById.get(balance.warehouseId)!;
        const item = itemById.get(balance.inventoryItemId)!;
        return {
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          warehouseCode: warehouse.code,
          inventoryItemId: item.id,
          itemCode: item.itemCode,
          itemName: item.itemName,
          category: item.category,
          unit: item.unit,
          quantity: balance.quantity,
          averageCost: balance.averageCost,
          stockValue: roundMoney(balance.value),
        };
      });
  }

  async ledger(user: AuthenticatedRequestUser, workspaceId: string, query: { warehouseId?: string; productId?: string; transactionType?: string; reference?: string; from?: string; to?: string }) {
    await this.assertWorkspace(user, workspaceId);
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.to) ? `${query.to}T23:59:59.999Z` : query.to)
      : undefined;
    if (fromDate && Number.isNaN(fromDate.getTime())) throw new BadRequestException("Invalid stock-ledger from date");
    if (toDate && Number.isNaN(toDate.getTime())) throw new BadRequestException("Invalid stock-ledger to date");
    await this.prisma.$transaction(async (tx) => {
      const valuation = await readMovingAverageCosts(
        tx,
        workspaceId,
        query.productId ? [query.productId] : undefined,
      );
      await this.assertValuationStockPolicy(
        tx,
        workspaceId,
        valuation.movements,
      );
    });
    const movements = await this.prisma.stockMovement.findMany({ where: { workspaceId, voidedAt: null, warehouseId: query.warehouseId, inventoryItemId: query.productId, transactionType: query.transactionType, referenceNo: query.reference ? { contains: query.reference, mode: "insensitive" } : undefined, transactionDate: { gte: fromDate, lte: toDate } }, include: { warehouse: true, inventoryItem: true }, orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }] });
    return movements.map((movement) => ({
      ...movement,
      // Keep quantity and valuation-rate precision internally; these extensions
      // are currency amounts and must leave the API at BDT minor-unit precision.
      movementValue: roundMoney(movement.movementValue),
      balanceValue: roundMoney(movement.balanceValue),
    }));
  }

  async postVoucherMovements(tx: Prisma.TransactionClient, voucherId: string, userId: string) {
    const voucher = await tx.voucherEntry.findUniqueOrThrow({
      where: { id: voucherId },
      include: {
        inventoryItems: {
          include: {
            inventoryItem: { include: { manufacturingProfile: true } },
            warehouse: true,
          },
        },
        lines: { select: { billReference: true } },
        warehouse: true,
      },
    });
    const productLines = voucher.inventoryItems.filter((line) => line.inventoryItem?.kind === "PRODUCT" && Number(line.quantity) > 0);
    if (!productLines.length) return;
    if (this.isOrderFlowSalesInvoice(voucher)) {
      // The Delivery Note already moved physical stock. The invoice recognizes
      // COGS from each exact source DN line without creating another movement.
      await this.postSourcedSalesInvoiceValuationLedgerEntry(tx, voucher, productLines);
      return;
    }
    const effect = await this.resolveVoucherEffect(tx, voucher);
    if (!effect) {
      if (voucher.voucherType === VoucherEntryType.PURCHASE && voucher.documentKind === "bill" && voucher.sourceVoucherId) {
        await this.postPurchaseBillRevaluations(tx, voucher, productLines);
      }
      return;
    }

    const stockLines = productLines.map((line) => {
      const warehouseId = line.warehouseId ?? voucher.warehouseId;
      const warehouse = line.warehouse ?? (warehouseId === voucher.warehouseId ? voucher.warehouse : null);
      if (!warehouseId || !warehouse || warehouse.id !== warehouseId || warehouse.workspaceId !== voucher.workspaceId || !warehouse.isActive || warehouse.deletedAt) {
        throw new BadRequestException(`Select an active warehouse for ${line.itemName} before posting this stock transaction`);
      }
      if (
        effect === StockMovementType.OUT &&
        (voucher.voucherType === VoucherEntryType.SALES || voucher.voucherType === VoucherEntryType.DELIVERY_NOTE) &&
        warehouse.allowSales === false
      ) {
        throw new BadRequestException(`${warehouse.name} is not enabled for sales`);
      }
      if (effect === StockMovementType.IN && line.inventoryItem?.trackBatchExpiry && !line.expiresAt) {
        throw new BadRequestException(`${line.itemName}: Expiry Date is required before receiving stock`);
      }
      if (line.manufacturedAt && line.expiresAt && line.manufacturedAt > line.expiresAt) {
        throw new BadRequestException(`${line.itemName}: Manufacturing Date cannot be after Expiry Date`);
      }
      return { line, warehouseId, warehouseName: warehouse.name };
    });

    const movementKeys = stockLines.map(
      ({ line }) => `voucher:${voucher.id}:line:${line.id}:${effect}`,
    );
    const existingLineMovements = await tx.stockMovement.findMany({
      where: {
        workspaceId: voucher.workspaceId,
        idempotencyKey: { in: movementKeys },
        voidedAt: null,
      },
      select: { idempotencyKey: true },
    });
    const postedMovementKeys = new Set(
      existingLineMovements.map((movement) => movement.idempotencyKey),
    );
    const pendingStockLines = stockLines.filter(
      ({ line }) => !postedMovementKeys.has(`voucher:${voucher.id}:line:${line.id}:${effect}`),
    );

    if (effect === StockMovementType.OUT) {
      const requirements = new Map<string, { warehouseId: string; itemId: string; required: number; warehouseName: string }>();
      for (const { line, warehouseId, warehouseName } of pendingStockLines) {
        const key = `${warehouseId}:${line.inventoryItemId}`;
        const existing = requirements.get(key);
        if (existing) existing.required += Number(line.quantity);
        else requirements.set(key, { warehouseId, itemId: line.inventoryItemId!, required: Number(line.quantity), warehouseName });
      }
      for (const requirement of requirements.values()) {
        await this.assertAvailable(tx, voucher.workspaceId, requirement.warehouseId, requirement.itemId, requirement.required, requirement.warehouseName);
      }
    }

    const isSalesIssue =
      effect === StockMovementType.OUT &&
      (voucher.voucherType === VoucherEntryType.SALES || voucher.voucherType === VoucherEntryType.DELIVERY_NOTE);
    if (isSalesIssue) {
      for (const { line, warehouseId } of pendingStockLines) {
        if (this.requiresManufacturingSalesProvenance(line.inventoryItem?.manufacturingProfile ?? null)) {
          await this.consumeReleasedManufacturingStock(
            tx,
            voucher.workspaceId,
            line as ManufacturingSalesLine,
            warehouseId,
          );
        } else if (line.manufacturingInventoryLotId || (line.manufacturingSerialIds?.length ?? 0)) {
          throw new BadRequestException(`${line.itemName}: manufacturing lot/serial provenance is not valid for this item`);
        }
      }
    }
    if (effect === StockMovementType.IN && voucher.voucherType === VoucherEntryType.CREDIT_NOTE) {
      for (const { line, warehouseId } of pendingStockLines) {
        if (
          this.requiresManufacturingSalesProvenance(line.inventoryItem?.manufacturingProfile ?? null) ||
          line.manufacturingInventoryLotId ||
          (line.manufacturingSerialIds?.length ?? 0)
        ) {
          await this.restoreManufacturingSalesReturn(
            tx,
            voucher.workspaceId,
            line as ManufacturingSalesLine,
            warehouseId,
          );
        }
      }
    }
    const grossInventoryValue = sumMoney(
      stockLines.map(({ line }) => roundMoney(Number(line.quantity) * Number(line.unitPrice ?? 0))),
    );
    const netInventoryValue = Math.max(0, sumMoney([grossInventoryValue, new Prisma.Decimal(voucher.discountAmount ?? 0).negated()]));
    const acquisitionFactor = grossInventoryValue > 0 ? netInventoryValue / grossInventoryValue : 1;
    for (const { line, warehouseId } of pendingStockLines) await tx.stockMovement.upsert({ where: { workspaceId_idempotencyKey: { workspaceId: voucher.workspaceId, idempotencyKey: `voucher:${voucher.id}:line:${line.id}:${effect}` } }, update: {}, create: { tenantId: voucher.tenantId, companyId: voucher.companyId, workspaceId: voucher.workspaceId, warehouseId, inventoryItemId: line.inventoryItemId!, transactionType: this.transactionType(voucher), transactionId: voucher.id, transactionLineId: line.id, referenceNo: voucher.voucherNumber, movementType: effect, quantity: line.quantity, unit: line.inventoryItem!.unit, inputUnitCost: effect === StockMovementType.IN && (voucher.voucherType === VoucherEntryType.PURCHASE || voucher.voucherType === VoucherEntryType.RECEIPT_NOTE) ? Number(line.unitPrice ?? 0) * acquisitionFactor : null, transactionDate: voucher.voucherDate, postedByUserId: userId, idempotencyKey: `voucher:${voucher.id}:line:${line.id}:${effect}`, batchNumber: line.batchNumber, manufacturedAt: line.manufacturedAt, expiresAt: line.expiresAt } });
    const valuation = await rebuildMovingAverageCosts(tx, voucher.workspaceId, stockLines.map(({ line }) => line.inventoryItemId!));
    await this.assertValuationStockPolicy(tx, voucher.workspaceId, valuation.movements);

    // A Sale (or a Sales Return reversing one) has a real inventory/COGS effect
    // in addition to its revenue-side lines — post it into the GL at the exact
    // MWA-costed value so Gross Profit/P&L/Balance Sheet reconcile against a
    // real posted journal, not just the report engine's own recomputation.
    if (voucher.voucherType === VoucherEntryType.SALES || voucher.voucherType === VoucherEntryType.DELIVERY_NOTE || voucher.voucherType === VoucherEntryType.CREDIT_NOTE) {
      const postedValue = sumMoney(
        valuation.movements
          .filter((movement) => movement.transactionId === voucher.id)
          .map((movement) => movement.movementValue),
      );
      const direction = this.transactionType(voucher) === DELIVERY_NOTE_TRANSACTION_TYPE
        ? "delivery"
        : effect === StockMovementType.OUT
          ? "issue"
          : "return";
      await this.postInventoryValuationLedgerEntry(tx, voucher, direction, postedValue);
    }
    await this.reconcileMovingAverageLedger(tx, voucher.workspaceId, valuation.movements, userId);
  }

  private requiresManufacturingSalesProvenance(profile: ManufacturingSalesProfile) {
    return Boolean(
      profile?.isActive &&
      profile.role === ManufacturingItemRole.FINISHED_GOOD &&
      (
        profile.makeBuy === ManufacturingMakeBuy.MAKE ||
        profile.makeBuy === ManufacturingMakeBuy.BOTH ||
        profile.lotTracked ||
        profile.serialTracked
      ),
    );
  }

  private manufacturingSerialIds(line: Pick<ManufacturingSalesLine, "itemName" | "manufacturingSerialIds">) {
    const values = (line.manufacturingSerialIds ?? []).map((serialId) => serialId.trim()).filter(Boolean);
    if (new Set(values).size !== values.length) {
      throw new BadRequestException(`${line.itemName}: manufacturing serial numbers must be unique`);
    }
    return values;
  }

  private async releasedManufacturingLot(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    line: ManufacturingSalesLine,
    warehouseId: string,
  ) {
    const lotId = line.manufacturingInventoryLotId?.trim();
    if (!lotId) {
      throw new BadRequestException(`${line.itemName}: select the exact released manufacturing lot before posting`);
    }
    const settings = await tx.manufacturingSettings.findUnique({
      where: { workspaceId },
      select: {
        defaultFinishedGoodsReleasedWarehouseId: true,
        defaultFinishedGoodsReleaseLocationId: true,
        requireSerialBeforeRelease: true,
      },
    });
    if (!settings?.defaultFinishedGoodsReleasedWarehouseId) {
      throw new BadRequestException("Configure the FG-R warehouse before selling manufactured finished goods");
    }
    if (warehouseId !== settings.defaultFinishedGoodsReleasedWarehouseId) {
      throw new BadRequestException(`${line.itemName}: manufactured finished goods can be sold only from the configured FG-R warehouse`);
    }
    const lot = await tx.manufacturingInventoryLot.findFirst({
      where: {
        id: lotId,
        workspaceId,
        inventoryItemId: line.inventoryItemId ?? undefined,
        warehouseId,
      },
      include: { location: true },
    });
    if (!lot) {
      throw new BadRequestException(`${line.itemName}: the selected manufacturing lot does not match this item and warehouse`);
    }
    if (
      !lot.locationId ||
      !lot.location ||
      !lot.location.isActive ||
      lot.location.workspaceId !== workspaceId ||
      lot.location.warehouseId !== warehouseId ||
      lot.location.disposition !== ManufacturingLocationDisposition.RELEASED ||
      (settings.defaultFinishedGoodsReleaseLocationId &&
        lot.locationId !== settings.defaultFinishedGoodsReleaseLocationId)
    ) {
      throw new BadRequestException(`${line.itemName}: the selected lot is not in the active FG-R released location`);
    }
    if (new Prisma.Decimal(lot.holdQuantity).greaterThan(0) || new Prisma.Decimal(lot.rejectedQuantity).greaterThan(0)) {
      throw new BadRequestException(`${line.itemName}: held or rejected manufacturing stock cannot be sold`);
    }
    return { lot, settings };
  }

  private async assertManufacturingSerials(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    line: ManufacturingSalesLine,
    warehouseId: string,
    locationId: string,
    expectedStatus: ManufacturingSerialStatus,
    requireSerialBeforeRelease: boolean,
  ) {
    const serialIds = this.manufacturingSerialIds(line);
    const serialRequired = Boolean(
      line.inventoryItem?.manufacturingProfile?.serialTracked || requireSerialBeforeRelease,
    );
    const quantity = new Prisma.Decimal(line.quantity);
    if (serialRequired || serialIds.length) {
      if (!quantity.isInteger() || serialIds.length !== Number(quantity.toFixed(0))) {
        throw new BadRequestException(`${line.itemName}: select exactly ${quantity.toString()} serial number(s)`);
      }
    }
    if (!serialIds.length) return serialIds;

    const serials = await tx.manufacturingSerial.findMany({
      where: { id: { in: serialIds } },
      select: {
        id: true,
        workspaceId: true,
        inventoryItemId: true,
        inventoryLotId: true,
        warehouseId: true,
        locationId: true,
        status: true,
      },
    });
    if (
      serials.length !== serialIds.length ||
      serials.some(
        (serial) =>
          serial.workspaceId !== workspaceId ||
          serial.inventoryItemId !== line.inventoryItemId ||
          serial.inventoryLotId !== line.manufacturingInventoryLotId ||
          serial.warehouseId !== warehouseId ||
          serial.locationId !== locationId ||
          serial.status !== expectedStatus,
      )
    ) {
      throw new ConflictException(
        `${line.itemName}: every selected serial must belong to this lot in FG-R and be ${expectedStatus.toLowerCase()}`,
      );
    }
    return serialIds;
  }

  private async consumeReleasedManufacturingStock(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    line: ManufacturingSalesLine,
    warehouseId: string,
  ) {
    const { lot, settings } = await this.releasedManufacturingLot(tx, workspaceId, line, warehouseId);
    const quantity = new Prisma.Decimal(line.quantity);
    const salableQuantity = new Prisma.Decimal(lot.availableQuantity).sub(lot.reservedQuantity);
    if (salableQuantity.lessThan(quantity)) {
      throw new ConflictException(
        `${line.itemName}: released lot ${lot.lotNumber} has ${salableQuantity.toString()} available, but ${quantity.toString()} was requested`,
      );
    }
    const serialIds = await this.assertManufacturingSerials(
      tx,
      workspaceId,
      line,
      warehouseId,
      lot.locationId!,
      ManufacturingSerialStatus.RELEASED,
      settings.requireSerialBeforeRelease,
    );
    const updatedLot = await tx.manufacturingInventoryLot.updateMany({
      where: {
        id: lot.id,
        workspaceId,
        inventoryItemId: line.inventoryItemId!,
        warehouseId,
        locationId: lot.locationId,
        availableQuantity: lot.availableQuantity,
        reservedQuantity: lot.reservedQuantity,
        holdQuantity: 0,
        rejectedQuantity: 0,
      },
      data: { availableQuantity: { decrement: quantity } },
    });
    if (updatedLot.count !== 1) {
      throw new ConflictException(`${line.itemName}: released lot availability changed; reload and try again`);
    }
    if (serialIds.length) {
      const consumedAt = new Date();
      const updatedSerials = await tx.manufacturingSerial.updateMany({
        where: {
          id: { in: serialIds },
          workspaceId,
          inventoryItemId: line.inventoryItemId!,
          inventoryLotId: lot.id,
          warehouseId,
          locationId: lot.locationId,
          status: ManufacturingSerialStatus.RELEASED,
        },
        data: { status: ManufacturingSerialStatus.CONSUMED, consumedAt },
      });
      if (updatedSerials.count !== serialIds.length) {
        throw new ConflictException(`${line.itemName}: one or more serials were already consumed`);
      }
    }
  }

  private async restoreConsumedManufacturingStock(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    line: ManufacturingSalesLine,
    warehouseId: string,
  ) {
    const { lot, settings } = await this.releasedManufacturingLot(tx, workspaceId, line, warehouseId);
    const quantity = new Prisma.Decimal(line.quantity);
    const serialIds = await this.assertManufacturingSerials(
      tx,
      workspaceId,
      line,
      warehouseId,
      lot.locationId!,
      ManufacturingSerialStatus.CONSUMED,
      settings.requireSerialBeforeRelease,
    );
    const updatedLot = await tx.manufacturingInventoryLot.updateMany({
      where: {
        id: lot.id,
        workspaceId,
        inventoryItemId: line.inventoryItemId!,
        warehouseId,
        locationId: lot.locationId,
        availableQuantity: lot.availableQuantity,
        reservedQuantity: lot.reservedQuantity,
        holdQuantity: 0,
        rejectedQuantity: 0,
      },
      data: { availableQuantity: { increment: quantity } },
    });
    if (updatedLot.count !== 1) {
      throw new ConflictException(`${line.itemName}: released lot availability changed; reload and try again`);
    }
    if (serialIds.length) {
      const updatedSerials = await tx.manufacturingSerial.updateMany({
        where: {
          id: { in: serialIds },
          workspaceId,
          inventoryItemId: line.inventoryItemId!,
          inventoryLotId: lot.id,
          warehouseId,
          locationId: lot.locationId,
          status: ManufacturingSerialStatus.CONSUMED,
        },
        data: { status: ManufacturingSerialStatus.RELEASED, consumedAt: null },
      });
      if (updatedSerials.count !== serialIds.length) {
        throw new ConflictException(`${line.itemName}: one or more serials have already been restored`);
      }
    }
  }

  private async restoreManufacturingSalesReturn(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    line: ManufacturingSalesLine,
    warehouseId: string,
  ) {
    if (!line.sourceInventoryLineId) {
      throw new BadRequestException(`${line.itemName}: select the exact source sales line for this return`);
    }
    const sourceLine = await tx.voucherInventoryItem.findFirst({
      where: { id: line.sourceInventoryLineId, voucher: { workspaceId } },
      select: {
        id: true,
        inventoryItemId: true,
        warehouseId: true,
        quantity: true,
        manufacturingInventoryLotId: true,
        manufacturingSerialIds: true,
        voucher: { select: { voucherType: true, status: true } },
      },
    });
    if (
      !sourceLine ||
      sourceLine.voucher.voucherType !== VoucherEntryType.SALES ||
      sourceLine.voucher.status !== VoucherEntryStatus.POSTED ||
      sourceLine.inventoryItemId !== line.inventoryItemId ||
      sourceLine.warehouseId !== warehouseId ||
      sourceLine.manufacturingInventoryLotId !== line.manufacturingInventoryLotId
    ) {
      throw new BadRequestException(`${line.itemName}: source sale lot, item or warehouse does not match`);
    }
    const requestedSerialIds = this.manufacturingSerialIds(line);
    const sourceSerialIds = new Set(sourceLine.manufacturingSerialIds);
    if (
      requestedSerialIds.some((serialId) => !sourceSerialIds.has(serialId)) ||
      (sourceSerialIds.size > 0 && requestedSerialIds.length !== Number(new Prisma.Decimal(line.quantity).toFixed(0)))
    ) {
      throw new BadRequestException(`${line.itemName}: return must restore the exact serials consumed by the source sale line`);
    }
    const previousReturns = await tx.voucherInventoryItem.aggregate({
      where: {
        sourceInventoryLineId: sourceLine.id,
        id: { not: line.id },
        voucher: { voucherType: VoucherEntryType.CREDIT_NOTE, status: VoucherEntryStatus.POSTED },
      },
      _sum: { quantity: true },
    });
    const totalReturned = new Prisma.Decimal(previousReturns._sum.quantity ?? 0).add(line.quantity);
    if (totalReturned.greaterThan(sourceLine.quantity)) {
      throw new ConflictException(`${line.itemName}: return quantity exceeds the source sale quantity`);
    }
    await this.restoreConsumedManufacturingStock(tx, workspaceId, line, warehouseId);
  }

  private isOrderFlowSalesInvoice(voucher: {
    workflowOrigin: VoucherWorkflowOrigin;
    voucherType: VoucherEntryType;
    documentKind: string | null;
  }) {
    return voucher.workflowOrigin === VoucherWorkflowOrigin.ORDER_FLOW &&
      voucher.voucherType === VoucherEntryType.SALES &&
      !["quotation", "proforma", "sale-order", "delivery-note"].includes(voucher.documentKind ?? "");
  }

  private async resolveSourcedSalesInvoiceCost(
    tx: Prisma.TransactionClient,
    invoice: {
      id: string;
      companyId: string;
      workspaceId: string;
      voucherNumber: string;
      inventoryItems: SourcedSalesInvoiceLine[];
    },
  ) {
    const sourceLineIds = [...new Set(invoice.inventoryItems.map((line) =>
      line.sourceInventoryLineId?.trim() || "",
    ))];
    const missingSource = invoice.inventoryItems.find((line) => !line.sourceInventoryLineId?.trim());
    if (missingSource) {
      throw new BadRequestException(`${missingSource.itemName}: select the exact Delivery Note line`);
    }
    const sourceLines = await tx.voucherInventoryItem.findMany({
      where: { id: { in: sourceLineIds } },
      select: {
        id: true,
        inventoryItemId: true,
        voucher: {
          select: {
            id: true,
            companyId: true,
            workspaceId: true,
            voucherType: true,
            documentKind: true,
            voucherNumber: true,
            status: true,
          },
        },
      },
    });
    const sourceById = new Map(sourceLines.map((line) => [line.id, line]));
    const missingSourceId = sourceLineIds.find((sourceLineId) => !sourceById.has(sourceLineId));
    if (missingSourceId) {
      throw new BadRequestException(`Sales Invoice ${invoice.voucherNumber} has a missing Delivery Note source line`);
    }
    for (const sourceLine of sourceLines) {
      const sourceVoucher = sourceLine.voucher;
      const isDeliveryNote = sourceVoucher.voucherType === VoucherEntryType.DELIVERY_NOTE ||
        (sourceVoucher.voucherType === VoucherEntryType.SALES && sourceVoucher.documentKind === "delivery-note");
      if (
        !isDeliveryNote ||
        sourceVoucher.workspaceId !== invoice.workspaceId ||
        sourceVoucher.companyId !== invoice.companyId ||
        sourceVoucher.status !== VoucherEntryStatus.POSTED
      ) {
        throw new BadRequestException(
          `Sales Invoice ${invoice.voucherNumber} must use posted Delivery Note lines from the same company workspace`,
        );
      }
    }

    const sourceMovements = await tx.stockMovement.findMany({
      where: {
        workspaceId: invoice.workspaceId,
        transactionLineId: { in: sourceLineIds },
        transactionType: DELIVERY_NOTE_TRANSACTION_TYPE,
        movementType: StockMovementType.OUT,
        reversalOfId: null,
        voidedAt: null,
      },
      select: {
        id: true,
        companyId: true,
        workspaceId: true,
        transactionId: true,
        transactionLineId: true,
        unitCost: true,
      },
    });
    const movementsByLineId = new Map<string, typeof sourceMovements>();
    for (const movement of sourceMovements) {
      movementsByLineId.set(
        movement.transactionLineId,
        [...(movementsByLineId.get(movement.transactionLineId) ?? []), movement],
      );
    }

    let totalCost = new Prisma.Decimal(0);
    for (const invoiceLine of invoice.inventoryItems) {
      const sourceLineId = invoiceLine.sourceInventoryLineId!.trim();
      const sourceLine = sourceById.get(sourceLineId)!;
      const sourceLineMovements = movementsByLineId.get(sourceLineId) ?? [];
      if (
        sourceLine.inventoryItemId !== invoiceLine.inventoryItemId ||
        sourceLineMovements.length !== 1 ||
        sourceLineMovements[0]!.transactionId !== sourceLine.voucher.id ||
        sourceLineMovements[0]!.companyId !== invoice.companyId ||
        sourceLineMovements[0]!.workspaceId !== invoice.workspaceId
      ) {
        throw new BadRequestException(
          `${invoiceLine.itemName}: exact Delivery Note inventory cost could not be resolved`,
        );
      }
      totalCost = totalCost.add(
        new Prisma.Decimal(invoiceLine.quantity).mul(sourceLineMovements[0]!.unitCost),
      );
    }
    return roundMoney(totalCost);
  }

  private async postSourcedSalesInvoiceValuationLedgerEntry(
    tx: Prisma.TransactionClient,
    voucher: {
      id: string;
      companyId: string;
      workspaceId: string;
      voucherNumber: string;
      inventoryItems: SourcedSalesInvoiceLine[];
    },
    productLines: SourcedSalesInvoiceLine[],
  ) {
    const roundedValue = await this.resolveSourcedSalesInvoiceCost(tx, {
      ...voucher,
      inventoryItems: productLines,
    });
    if (roundedValue <= 0) return;
    const [cogsAccount, pendingAccount] = await Promise.all([
      tx.account.findUnique({ where: { companyId_code: { companyId: voucher.companyId, code: COGS_ACCOUNT_CODE } } }),
      tx.account.findUnique({ where: { companyId_code: { companyId: voucher.companyId, code: DELIVERED_INVENTORY_PENDING_ACCOUNT_CODE } } }),
    ]);
    if (
      !cogsAccount || !pendingAccount ||
      !cogsAccount.isSystem || !pendingAccount.isSystem ||
      cogsAccount.level !== "LEDGER" || pendingAccount.level !== "LEDGER" ||
      cogsAccount.status !== "ACTIVE" || pendingAccount.status !== "ACTIVE" ||
      cogsAccount.code !== COGS_ACCOUNT_CODE ||
      pendingAccount.code !== DELIVERED_INVENTORY_PENDING_ACCOUNT_CODE
    ) {
      throw new BadRequestException("Required Cost of Goods Sold or Delivered Inventory Pending system account is missing");
    }
    const alreadyPosted = await tx.voucherEntryLine.findFirst({
      where: {
        voucherId: voucher.id,
        accountId: { in: [cogsAccount.id, pendingAccount.id] },
        costCenter: SALES_INVOICE_DELIVERY_COST_CENTER,
      },
      select: { id: true },
    });
    if (alreadyPosted) return;
    await tx.voucherEntryLine.createMany({
      data: [
        {
          voucherId: voucher.id,
          accountId: cogsAccount.id,
          ledger: cogsAccount.name,
          description: `Delivered inventory recognized as COGS - ${voucher.voucherNumber}`,
          debit: roundedValue,
          credit: 0,
          costCenter: SALES_INVOICE_DELIVERY_COST_CENTER,
        },
        {
          voucherId: voucher.id,
          accountId: pendingAccount.id,
          ledger: pendingAccount.name,
          description: `Delivered inventory cleared on invoice - ${voucher.voucherNumber}`,
          debit: 0,
          credit: roundedValue,
          costCenter: SALES_INVOICE_DELIVERY_COST_CENTER,
        },
      ],
    });
  }

  /** Debit Cost of Goods Sold / Credit Inventory Control for a sale (or the
   * mirror-image for a sales return), at the exact value the MWA engine just
   * computed. Missing protected control ledgers fail the posting instead of
   * silently producing incomplete books. An existing pair is skipped so a
   * retried posting never creates a duplicate journal pair. */
  private async postInventoryValuationLedgerEntry(
    tx: Prisma.TransactionClient,
    voucher: { id: string; companyId: string; voucherNumber: string },
    direction: "issue" | "delivery" | "return",
    totalValue: number,
  ) {
    const roundedValue = roundMoney(totalValue);
    if (roundedValue <= 0) return;

    const offsetAccountCode = direction === "delivery"
      ? DELIVERED_INVENTORY_PENDING_ACCOUNT_CODE
      : COGS_ACCOUNT_CODE;
    const [offsetAccount, inventoryAccount] = await Promise.all([
      tx.account.findUnique({ where: { companyId_code: { companyId: voucher.companyId, code: offsetAccountCode } } }),
      tx.account.findUnique({ where: { companyId_code: { companyId: voucher.companyId, code: INVENTORY_CONTROL_ACCOUNT_CODE } } }),
    ]);
    if (
      !offsetAccount || !inventoryAccount ||
      !offsetAccount.isSystem || !inventoryAccount.isSystem ||
      offsetAccount.level !== "LEDGER" || inventoryAccount.level !== "LEDGER" ||
      offsetAccount.status !== "ACTIVE" || inventoryAccount.status !== "ACTIVE" ||
      offsetAccount.code !== offsetAccountCode ||
      inventoryAccount.code !== INVENTORY_CONTROL_ACCOUNT_CODE
    ) {
      throw new BadRequestException(
        direction === "delivery"
          ? "Required Inventory Control or Delivered Inventory Pending system account is missing"
          : "Required Inventory Control or Cost of Goods Sold system account is missing",
      );
    }

    const costCenter = direction === "delivery"
      ? DELIVERY_NOTE_VALUATION_COST_CENTER
      : INVENTORY_VALUATION_COST_CENTER;
    const alreadyPosted = await tx.voucherEntryLine.findFirst({
      where: {
        voucherId: voucher.id,
        accountId: { in: [offsetAccount.id, inventoryAccount.id] },
        OR: [
          { costCenter },
          { description: { contains: "Cost of goods sold", mode: "insensitive" } },
          { description: { contains: "Inventory issued", mode: "insensitive" } },
          { description: { contains: "Inventory restored", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    if (alreadyPosted) return;

    const isIssue = direction === "issue";
    const isDelivery = direction === "delivery";
    const debitAccount = direction === "return" ? inventoryAccount : offsetAccount;
    const creditAccount = direction === "return" ? offsetAccount : inventoryAccount;
    await tx.voucherEntryLine.createMany({
      data: [
        {
          voucherId: voucher.id,
          accountId: debitAccount.id,
          ledger: debitAccount.name,
          description: isIssue
            ? `Cost of goods sold — ${voucher.voucherNumber}`
            : isDelivery
              ? `Inventory delivered pending invoice — ${voucher.voucherNumber}`
              : `Inventory restored — ${voucher.voucherNumber}`,
          debit: roundedValue,
          credit: 0,
          costCenter,
        },
        {
          voucherId: voucher.id,
          accountId: creditAccount.id,
          ledger: creditAccount.name,
          description: direction === "return"
            ? `Cost of goods sold reversed — ${voucher.voucherNumber}`
            : `Inventory issued — ${voucher.voucherNumber}`,
          debit: 0,
          credit: roundedValue,
          costCenter,
        },
      ],
    });
  }

  /**
   * Makes the posted Inventory Control / COGS general-ledger value agree with
   * the latest moving-average replay without rewriting an already-posted
   * voucher. A backdated receipt, purchase-price finalization, return or stock
   * reversal can change the cost of a later issue. Each difference is posted
   * as a new immutable adjustment journal; prior adjustments remain as the
   * audit trail and are included in the next reconciliation, making retries
   * idempotent.
   *
   * Account codes are used only to resolve the company's protected ledgers.
   * Every persisted line carries the resolved account id as its authority;
   * names are snapshots for display only.
   */
  async reconcileMovingAverageLedger(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    movements: InventoryValuationMovement[],
    preferredUserId?: string,
    anticipatedReversalOfId?: string,
  ) {
    const desiredCogsByVoucherId = new Map<string, number>();
    const desiredDeliveredByVoucherId = new Map<string, number>();
    const inventoryLedgerMovements: InventoryValuationMovement[] = [];
    const costedMovementIds = new Set<string>();
    for (const movement of movements) {
      if (movement.id) costedMovementIds.add(movement.id);
      if (
        OPENING_LEDGER_TRANSACTION_TYPES.has(movement.transactionType) ||
        ADJUSTMENT_LEDGER_TRANSACTION_TYPES.has(movement.transactionType)
      ) {
        inventoryLedgerMovements.push(movement);
      }
      const baseTransactionType = movement.transactionType.replace(/_REVERSAL$/, "");
      if (baseTransactionType === DELIVERY_NOTE_TRANSACTION_TYPE) {
        const signedValue = movement.movementType === StockMovementType.OUT
          ? Number(movement.movementValue)
          : -Number(movement.movementValue);
        desiredDeliveredByVoucherId.set(
          movement.transactionId,
          sumMoney([desiredDeliveredByVoucherId.get(movement.transactionId) ?? 0, signedValue]),
        );
        continue;
      }
      if (!COGS_MOVEMENT_TRANSACTION_TYPES.has(baseTransactionType)) continue;
      const signedValue = movement.movementType === StockMovementType.OUT
        ? Number(movement.movementValue)
        : -Number(movement.movementValue);
      desiredCogsByVoucherId.set(
        movement.transactionId,
        sumMoney([desiredCogsByVoucherId.get(movement.transactionId) ?? 0, signedValue]),
      );
    }
    if (
      !desiredCogsByVoucherId.size &&
      !desiredDeliveredByVoucherId.size &&
      !inventoryLedgerMovements.length &&
      !costedMovementIds.size &&
      !anticipatedReversalOfId
    ) return;

    // A replay that had stale StockMovement rows already holds the MWA lock,
    // but a healthy-cost replay can still discover a legacy GL gap. This
    // second transaction-level lock makes two concurrent reconciliation reads
    // serialize as well, so both can never post the same delta.
    const lockClient = tx as unknown as { $executeRaw?: (query: Prisma.Sql) => Promise<unknown> };
    if (typeof lockClient.$executeRaw === "function") {
      await lockClient.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-gl-reconcile:${workspaceId}`}, 0))`,
      );
    }

    if (desiredCogsByVoucherId.size) {
      const affectedVoucherIds = [...desiredCogsByVoucherId.keys()];
      const completeVoucherMovements = await tx.stockMovement.findMany({
        where: {
          workspaceId,
          transactionId: { in: affectedVoucherIds },
          voidedAt: null,
        },
        select: {
          transactionId: true,
          transactionType: true,
          movementType: true,
          movementValue: true,
        },
      });
      const wholeCogsByVoucherId = new Map<string, number>();
      for (const movement of completeVoucherMovements) {
        const baseTransactionType = movement.transactionType.replace(/_REVERSAL$/, "");
        if (!COGS_MOVEMENT_TRANSACTION_TYPES.has(baseTransactionType)) continue;
        const signedValue = movement.movementType === StockMovementType.OUT
          ? Number(movement.movementValue)
          : -Number(movement.movementValue);
        wholeCogsByVoucherId.set(
          movement.transactionId,
          sumMoney([wholeCogsByVoucherId.get(movement.transactionId) ?? 0, signedValue]),
        );
      }
      for (const [voucherId, fallbackValue] of desiredCogsByVoucherId) {
        if (!wholeCogsByVoucherId.has(voucherId)) wholeCogsByVoucherId.set(voucherId, fallbackValue);
      }
      desiredCogsByVoucherId.clear();
      for (const [voucherId, value] of wholeCogsByVoucherId) desiredCogsByVoucherId.set(voucherId, value);
    }

    if (desiredCogsByVoucherId.size) {
    const sourceVoucherIds = [...desiredCogsByVoucherId.keys()].sort();
    const roots = await tx.voucherEntry.findMany({
      where: { workspaceId, id: { in: sourceVoucherIds } },
      select: {
        id: true,
        tenantId: true,
        companyId: true,
        workspaceId: true,
        createdByUserId: true,
        workflowOrigin: true,
        voucherNumber: true,
        voucherDate: true,
        partyName: true,
        currency: true,
        fiscalYearId: true,
        branchId: true,
        warehouseId: true,
        lines: {
          select: {
            accountId: true,
            description: true,
            costCenter: true,
            debit: true,
            credit: true,
          },
        },
      },
    });
    const rootById = new Map(roots.map((root) => [root.id, root]));
    const missingRootId = sourceVoucherIds.find((sourceVoucherId) => !rootById.has(sourceVoucherId));
    if (missingRootId) {
      throw new BadRequestException(`Inventory valuation source voucher ${missingRootId} was not found`);
    }

    const companyIds = [...new Set(roots.map((root) => root.companyId))];
    if (companyIds.length !== 1) {
      throw new BadRequestException("Inventory valuation replay crossed company boundaries");
    }
    const companyId = companyIds[0]!;
    const [cogsAccount, inventoryAccount] = await Promise.all([
      tx.account.findUnique({ where: { companyId_code: { companyId, code: COGS_ACCOUNT_CODE } } }),
      tx.account.findUnique({ where: { companyId_code: { companyId, code: INVENTORY_CONTROL_ACCOUNT_CODE } } }),
    ]);
    if (
      !cogsAccount || !inventoryAccount ||
      !cogsAccount.isSystem || !inventoryAccount.isSystem ||
      cogsAccount.level !== "LEDGER" || inventoryAccount.level !== "LEDGER" ||
      cogsAccount.status !== "ACTIVE" || inventoryAccount.status !== "ACTIVE"
    ) {
      throw new BadRequestException("Required Inventory Control or Cost of Goods Sold system account is missing");
    }

    const related = await tx.voucherEntry.findMany({
      where: {
        workspaceId,
        status: { in: [VoucherEntryStatus.POSTED, VoucherEntryStatus.REVERSED] },
        OR: [
          { reversalOfId: { in: sourceVoucherIds } },
          { sourceType: INVENTORY_COST_REVALUATION_SOURCE, sourceId: { in: sourceVoucherIds } },
        ],
      },
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        reversalOfId: true,
        postingVersion: true,
        lines: {
          select: {
            accountId: true,
            description: true,
            costCenter: true,
            debit: true,
            credit: true,
          },
        },
      },
    });

    const isValuationLine = (line: {
      accountId: string | null;
      description: string | null;
      costCenter: string | null;
    }) => {
      if (line.accountId !== cogsAccount.id && line.accountId !== inventoryAccount.id) return false;
      if (line.costCenter === INVENTORY_VALUATION_COST_CENTER) return true;
      const description = line.description?.toLowerCase() ?? "";
      return description.includes("cost of goods sold") ||
        description.includes("inventory issued") ||
        description.includes("inventory restored");
    };

    for (const sourceVoucherId of sourceVoucherIds) {
      const root = rootById.get(sourceVoucherId)!;
      const relatedEntries = related.filter((entry) =>
        entry.reversalOfId === sourceVoucherId ||
        (entry.sourceType === INVENTORY_COST_REVALUATION_SOURCE && entry.sourceId === sourceVoucherId),
      );
      const valuationLines = [root, ...relatedEntries]
        .flatMap((entry) => entry.lines)
        .filter(isValuationLine);
      let currentCogs = roundMoney(sumMoney(
        valuationLines
          .filter((line) => line.accountId === cogsAccount.id)
          .map((line) => Number(line.debit) - Number(line.credit)),
      ));
      let currentInventory = roundMoney(sumMoney(
        valuationLines
          .filter((line) => line.accountId === inventoryAccount.id)
          .map((line) => Number(line.debit) - Number(line.credit)),
      ));
      if (anticipatedReversalOfId === sourceVoucherId) {
        // PostingEngine creates the mirror GL voucher immediately after this
        // stock reversal. Include that pending mirror in this calculation so
        // we cancel only accumulated cost adjustments, not the base valuation
        // pair that the pending reversal itself is about to cancel.
        const rootValuationLines = root.lines.filter(isValuationLine);
        currentCogs = roundMoney(currentCogs - sumMoney(
          rootValuationLines
            .filter((line) => line.accountId === cogsAccount.id)
            .map((line) => Number(line.debit) - Number(line.credit)),
        ));
        currentInventory = roundMoney(currentInventory - sumMoney(
          rootValuationLines
            .filter((line) => line.accountId === inventoryAccount.id)
            .map((line) => Number(line.debit) - Number(line.credit)),
        ));
      }
      if (roundMoney(sumMoney([currentCogs, currentInventory])) !== 0) {
        throw new BadRequestException(
          `Inventory valuation lines for ${root.voucherNumber} are not a balanced Inventory/COGS pair`,
        );
      }

      const desiredCogs = roundMoney(desiredCogsByVoucherId.get(sourceVoucherId) ?? 0);
      const cogsDelta = roundMoney(desiredCogs - currentCogs);
      if (cogsDelta === 0) continue;

      const priorVersions = relatedEntries
        .filter((entry) => entry.sourceType === INVENTORY_COST_REVALUATION_SOURCE)
        .map((entry) => entry.postingVersion);
      const postingVersion = Math.max(0, ...priorVersions) + 1;
      const adjustmentValue = Math.abs(cogsDelta);
      const increasesCogs = cogsDelta > 0;
      const now = new Date();
      const createdByUserId = preferredUserId ?? root.createdByUserId;
      await tx.voucherEntry.create({
        data: {
          tenantId: root.tenantId,
          companyId: root.companyId,
          workspaceId: root.workspaceId,
          createdByUserId,
          voucherType: VoucherEntryType.JOURNAL,
          documentKind: "inventory-cost-adjustment",
          workflowOrigin: root.workflowOrigin,
          voucherNumber: `ICR-${root.id}-${postingVersion}`,
          voucherDate: root.voucherDate,
          partyName: root.partyName || "Inventory Cost Revaluation",
          reference: root.voucherNumber,
          narration: `Moving-average cost adjustment for ${root.voucherNumber}: ${currentCogs.toFixed(2)} to ${desiredCogs.toFixed(2)}`,
          status: VoucherEntryStatus.POSTED,
          totalAmount: adjustmentValue,
          debit: adjustmentValue,
          credit: adjustmentValue,
          currency: root.currency,
          fiscalYearId: root.fiscalYearId,
          branchId: root.branchId,
          warehouseId: root.warehouseId,
          sourceType: INVENTORY_COST_REVALUATION_SOURCE,
          sourceId: root.id,
          postingVersion,
          approvedByUserId: createdByUserId,
          approvedAt: now,
          postedAt: now,
          idempotencyKey: `inventory-cost-revaluation:${root.id}:${postingVersion}`,
          revisionGroupId: `inventory-cost-revaluation:${root.id}`,
          lines: {
            create: [
              {
                accountId: increasesCogs ? cogsAccount.id : inventoryAccount.id,
                ledger: increasesCogs ? cogsAccount.name : inventoryAccount.name,
                description: `MWA cost adjustment — ${root.voucherNumber}`,
                debit: adjustmentValue,
                credit: 0,
                costCenter: INVENTORY_VALUATION_COST_CENTER,
              },
              {
                accountId: increasesCogs ? inventoryAccount.id : cogsAccount.id,
                ledger: increasesCogs ? inventoryAccount.name : cogsAccount.name,
                description: `MWA cost adjustment — ${root.voucherNumber}`,
                debit: 0,
                credit: adjustmentValue,
                costCenter: INVENTORY_VALUATION_COST_CENTER,
              },
            ],
          },
        },
      });
    }
    }

    if (inventoryLedgerMovements.length) {
      await this.reconcileInventoryMovementLedgers(
        tx,
        workspaceId,
        inventoryLedgerMovements,
        preferredUserId,
      );
    }
    await this.reconcileDeliveryNoteAndSourcedInvoiceLedgers(
      tx,
      workspaceId,
      desiredDeliveredByVoucherId,
      preferredUserId,
      anticipatedReversalOfId,
    );
    await this.reconcileHistoricalPurchaseBillCostVariances(
      tx,
      workspaceId,
      [...costedMovementIds],
      preferredUserId,
      anticipatedReversalOfId,
    );
  }

  private async reconcileDeliveryNoteAndSourcedInvoiceLedgers(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    desiredDeliveredByVoucherId: Map<string, number>,
    preferredUserId?: string,
    anticipatedReversalOfId?: string,
  ) {
    const affectedDeliveryNoteIds = [...desiredDeliveredByVoucherId.keys()];
    const completeDeliveryMovements = affectedDeliveryNoteIds.length
      ? await tx.stockMovement.findMany({
          where: {
            workspaceId,
            transactionId: { in: affectedDeliveryNoteIds },
            voidedAt: null,
          },
          select: {
            transactionId: true,
            transactionType: true,
            movementType: true,
            movementValue: true,
          },
        })
      : [];
    const wholeDeliveredByVoucherId = new Map<string, number>();
    for (const movement of completeDeliveryMovements) {
      if (movement.transactionType.replace(/_REVERSAL$/, "") !== DELIVERY_NOTE_TRANSACTION_TYPE) continue;
      const signedValue = movement.movementType === StockMovementType.OUT
        ? Number(movement.movementValue)
        : -Number(movement.movementValue);
      wholeDeliveredByVoucherId.set(
        movement.transactionId,
        sumMoney([wholeDeliveredByVoucherId.get(movement.transactionId) ?? 0, signedValue]),
      );
    }
    // Every affected root must be valued as a whole document. Targeted MWA
    // replays may contain only one item from a multi-item Delivery Note.
    for (const [voucherId, fallbackValue] of desiredDeliveredByVoucherId) {
      if (!wholeDeliveredByVoucherId.has(voucherId)) {
        wholeDeliveredByVoucherId.set(voucherId, fallbackValue);
      }
    }

    if (wholeDeliveredByVoucherId.size) {
      const deliveryTargets = new Map<string, Map<string, number>>();
      for (const [voucherId, deliveredValue] of wholeDeliveredByVoucherId) {
        const desiredValue = roundMoney(deliveredValue);
        deliveryTargets.set(voucherId, new Map([
          [DELIVERED_INVENTORY_PENDING_ACCOUNT_CODE, desiredValue],
          [INVENTORY_CONTROL_ACCOUNT_CODE, -desiredValue],
          [COGS_ACCOUNT_CODE, 0],
        ]));
      }
      await this.reconcileInventoryVoucherTargets(
        tx,
        workspaceId,
        deliveryTargets,
        {
          accountCodes: [
            INVENTORY_CONTROL_ACCOUNT_CODE,
            DELIVERED_INVENTORY_PENDING_ACCOUNT_CODE,
            COGS_ACCOUNT_CODE,
          ],
          sourceType: DELIVERY_NOTE_VALUATION_SOURCE,
          costCenters: [DELIVERY_NOTE_VALUATION_COST_CENTER, INVENTORY_VALUATION_COST_CENTER],
          documentKind: "delivery-note-inventory-adjustment",
          voucherPrefix: "DNV",
          label: "Delivery Note Inventory Valuation",
          idempotencyStem: "delivery-note-inventory-revaluation",
        },
        preferredUserId,
        anticipatedReversalOfId,
      );
    }

    const deliveryNoteIds = [...wholeDeliveredByVoucherId.keys()];
    const deliveryLines = deliveryNoteIds.length
      ? await tx.voucherInventoryItem.findMany({
          where: { voucherId: { in: deliveryNoteIds } },
          select: { id: true },
        })
      : [];
    const deliveryLineIds = deliveryLines.map((line) => line.id);
    const invoiceReferences = deliveryLineIds.length
      ? await tx.voucherInventoryItem.findMany({
          where: {
            sourceInventoryLineId: { in: deliveryLineIds },
            voucher: {
              workspaceId,
              status: VoucherEntryStatus.POSTED,
            },
          },
          select: {
            voucherId: true,
            voucher: {
              select: {
                id: true,
                workflowOrigin: true,
                voucherType: true,
                documentKind: true,
                status: true,
              },
            },
          },
        })
      : [];
    const sourcedInvoiceIds = new Set(invoiceReferences
      .filter((reference) =>
        reference.voucher.status === VoucherEntryStatus.POSTED &&
        this.isOrderFlowSalesInvoice(reference.voucher),
      )
      .map((reference) => reference.voucherId));

    if (anticipatedReversalOfId) {
      const anticipated = await tx.voucherEntry.findUnique({
        where: { id: anticipatedReversalOfId },
        select: {
          id: true,
          workspaceId: true,
          workflowOrigin: true,
          voucherType: true,
          documentKind: true,
          inventoryItems: {
            where: { sourceInventoryLineId: { not: null } },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        anticipated?.workspaceId === workspaceId &&
        this.isOrderFlowSalesInvoice(anticipated) &&
        anticipated.inventoryItems.length > 0
      ) {
        sourcedInvoiceIds.add(anticipated.id);
      }
    }
    if (!sourcedInvoiceIds.size) return;

    const invoiceIds = [...sourcedInvoiceIds].sort();
    const invoices = await tx.voucherEntry.findMany({
      where: { workspaceId, id: { in: invoiceIds } },
      select: {
        id: true,
        companyId: true,
        workspaceId: true,
        voucherNumber: true,
        workflowOrigin: true,
        voucherType: true,
        documentKind: true,
        status: true,
        inventoryItems: {
          select: {
            sourceInventoryLineId: true,
            inventoryItemId: true,
            itemName: true,
            quantity: true,
          },
        },
      },
    });
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const missingInvoiceId = invoiceIds.find((invoiceId) => !invoiceById.has(invoiceId));
    if (missingInvoiceId) {
      throw new BadRequestException(`Sourced Sales Invoice ${missingInvoiceId} was not found`);
    }
    const invoiceTargets = new Map<string, Map<string, number>>();
    for (const invoiceId of invoiceIds) {
      const invoice = invoiceById.get(invoiceId)!;
      if (!this.isOrderFlowSalesInvoice(invoice)) {
        throw new BadRequestException(`Voucher ${invoice.voucherNumber} is not an Order Based Sales Invoice`);
      }
      if (
        invoiceId !== anticipatedReversalOfId &&
        invoice.status !== VoucherEntryStatus.POSTED
      ) {
        continue;
      }
      const desiredCost = invoiceId === anticipatedReversalOfId
        ? 0
        : await this.resolveSourcedSalesInvoiceCost(tx, invoice);
      invoiceTargets.set(invoiceId, new Map([
        [COGS_ACCOUNT_CODE, desiredCost],
        [DELIVERED_INVENTORY_PENDING_ACCOUNT_CODE, -desiredCost],
      ]));
    }
    if (!invoiceTargets.size) return;
    await this.reconcileInventoryVoucherTargets(
      tx,
      workspaceId,
      invoiceTargets,
      {
        accountCodes: [COGS_ACCOUNT_CODE, DELIVERED_INVENTORY_PENDING_ACCOUNT_CODE],
        sourceType: SALES_INVOICE_DELIVERY_COST_SOURCE,
        costCenters: [SALES_INVOICE_DELIVERY_COST_CENTER],
        documentKind: "sales-invoice-delivery-cost-adjustment",
        voucherPrefix: "SIC",
        label: "Sales Invoice Delivered Inventory Cost",
        idempotencyStem: "sales-invoice-delivery-cost-revaluation",
      },
      preferredUserId,
      anticipatedReversalOfId,
    );
  }

  private async reconcileInventoryVoucherTargets(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    desiredByVoucherId: Map<string, Map<string, number>>,
    config: {
      accountCodes: string[];
      sourceType: string;
      costCenters: string[];
      documentKind: string;
      voucherPrefix: string;
      label: string;
      idempotencyStem: string;
    },
    preferredUserId?: string,
    anticipatedReversalOfId?: string,
  ) {
    if (!desiredByVoucherId.size) return;
    const sourceVoucherIds = [...desiredByVoucherId.keys()].sort();
    const roots = await tx.voucherEntry.findMany({
      where: { workspaceId, id: { in: sourceVoucherIds } },
      select: {
        id: true,
        tenantId: true,
        companyId: true,
        workspaceId: true,
        createdByUserId: true,
        workflowOrigin: true,
        voucherNumber: true,
        voucherDate: true,
        partyName: true,
        fiscalYearId: true,
        branchId: true,
        warehouseId: true,
        status: true,
        lines: {
          select: {
            accountId: true,
            description: true,
            costCenter: true,
            debit: true,
            credit: true,
          },
        },
      },
    });
    const rootById = new Map(roots.map((root) => [root.id, root]));
    const missingRootId = sourceVoucherIds.find((sourceVoucherId) => !rootById.has(sourceVoucherId));
    if (missingRootId) {
      throw new BadRequestException(`${config.label} source voucher ${missingRootId} was not found`);
    }
    const companyIds = [...new Set(roots.map((root) => root.companyId))];
    if (companyIds.length !== 1) {
      throw new BadRequestException(`${config.label} replay crossed company boundaries`);
    }
    const companyId = companyIds[0]!;
    const [company, ...accounts] = await Promise.all([
      tx.company.findUnique({ where: { id: companyId }, select: { currencyCode: true } }),
      ...config.accountCodes.map((code) =>
        tx.account.findUnique({ where: { companyId_code: { companyId, code } } }),
      ),
    ]);
    if (!company?.currencyCode) {
      throw new BadRequestException(`${config.label} cannot resolve the company currency`);
    }
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      const code = config.accountCodes[index]!;
      if (
        !account || !account.isSystem || account.code !== code ||
        account.level !== "LEDGER" || account.status !== "ACTIVE"
      ) {
        throw new BadRequestException(`Required protected inventory ledger ${code} is missing or inactive`);
      }
    }
    const accountByCode = new Map(accounts.map((account) => [account!.code, account!]));
    const accountById = new Map(accounts.map((account) => [account!.id, account!]));
    const related = await tx.voucherEntry.findMany({
      where: {
        workspaceId,
        status: { in: [VoucherEntryStatus.POSTED, VoucherEntryStatus.REVERSED] },
        OR: [
          { reversalOfId: { in: sourceVoucherIds } },
          { sourceType: config.sourceType, sourceId: { in: sourceVoucherIds } },
        ],
      },
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        reversalOfId: true,
        postingVersion: true,
        lines: {
          select: {
            accountId: true,
            description: true,
            costCenter: true,
            debit: true,
            credit: true,
          },
        },
      },
    });
    const costCenters = new Set(config.costCenters);
    const descriptionLooksLikeInventoryValuation = (description: string | null) => {
      const normalizedDescription = description?.toLowerCase() ?? "";
      return normalizedDescription.includes("cost of goods sold") ||
        normalizedDescription.includes("inventory issued") ||
        normalizedDescription.includes("inventory delivered pending") ||
        normalizedDescription.includes("delivered inventory recognized") ||
        normalizedDescription.includes("delivered inventory cleared");
    };
    const isTargetLine = (line: {
      accountId: string | null;
      description: string | null;
      costCenter: string | null;
    }) => Boolean(
      line.accountId &&
      accountById.has(line.accountId) &&
      (Boolean(line.costCenter && costCenters.has(line.costCenter)) || descriptionLooksLikeInventoryValuation(line.description)),
    );

    for (const sourceVoucherId of sourceVoucherIds) {
      const root = rootById.get(sourceVoucherId)!;
      const relatedEntries = related.filter((entry) =>
        entry.reversalOfId === sourceVoucherId ||
        (entry.sourceType === config.sourceType && entry.sourceId === sourceVoucherId),
      );
      const correctionEntries = relatedEntries.filter((entry) =>
        entry.sourceType === config.sourceType && entry.sourceId === sourceVoucherId,
      );
      const rootAndMirrorEntries = [root, ...relatedEntries.filter((entry) => entry.reversalOfId === sourceVoucherId)];
      const suspiciousRootLine = rootAndMirrorEntries
        .flatMap((entry) => entry.lines)
        .find((line) =>
          (Number(line.debit) !== 0 || Number(line.credit) !== 0) &&
          Boolean(line.costCenter && costCenters.has(line.costCenter)) &&
          (!line.accountId || !accountById.has(line.accountId)),
        );
      const suspiciousCorrectionLine = correctionEntries
        .flatMap((entry) => entry.lines)
        .find((line) =>
          (Number(line.debit) !== 0 || Number(line.credit) !== 0) &&
          (
            !line.accountId ||
            !accountById.has(line.accountId) ||
            !line.costCenter ||
            !costCenters.has(line.costCenter)
          ),
        );
      if (suspiciousRootLine || suspiciousCorrectionLine) {
        throw new BadRequestException(`${config.label} for ${root.voucherNumber} contains an unexpected ledger`);
      }

      const currentByAccountId = new Map<string, number>();
      const valuationLines = [...rootAndMirrorEntries, ...correctionEntries]
        .flatMap((entry) => entry.lines)
        .filter(isTargetLine);
      for (const line of valuationLines) {
        currentByAccountId.set(
          line.accountId!,
          sumMoney([
            currentByAccountId.get(line.accountId!) ?? 0,
            Number(line.debit) - Number(line.credit),
          ]),
        );
      }
      if (anticipatedReversalOfId === sourceVoucherId) {
        for (const line of root.lines.filter(isTargetLine)) {
          currentByAccountId.set(
            line.accountId!,
            sumMoney([
              currentByAccountId.get(line.accountId!) ?? 0,
              Number(line.credit) - Number(line.debit),
            ]),
          );
        }
      }
      if (!moneyEquals(sumMoney([...currentByAccountId.values()]), 0)) {
        throw new BadRequestException(`${config.label} lines for ${root.voucherNumber} are not balanced`);
      }

      const desiredByAccountId = new Map<string, number>();
      for (const [code, amount] of desiredByVoucherId.get(sourceVoucherId) ?? []) {
        const account = accountByCode.get(code);
        if (!account) {
          throw new BadRequestException(`Required protected inventory ledger ${code} is missing or inactive`);
        }
        desiredByAccountId.set(account.id, roundMoney(amount));
      }
      if (!moneyEquals(sumMoney([...desiredByAccountId.values()]), 0)) {
        throw new BadRequestException(`${config.label} target for ${root.voucherNumber} is not balanced`);
      }
      const deltaByAccountId = new Map([...accountById.keys()].map((accountId) => [
        accountId,
        roundMoney((desiredByAccountId.get(accountId) ?? 0) - (currentByAccountId.get(accountId) ?? 0)),
      ]));
      const deltaLines = [...deltaByAccountId]
        .filter(([, delta]) => delta !== 0)
        .sort(([leftId], [rightId]) => accountById.get(leftId)!.code.localeCompare(accountById.get(rightId)!.code));
      if (!deltaLines.length) continue;
      const debitTotal = sumMoney(deltaLines.filter(([, delta]) => delta > 0).map(([, delta]) => delta));
      const creditTotal = sumMoney(deltaLines.filter(([, delta]) => delta < 0).map(([, delta]) => Math.abs(delta)));
      if (!moneyEquals(debitTotal, creditTotal) || debitTotal <= 0) {
        throw new BadRequestException(`${config.label} delta for ${root.voucherNumber} is not balanced`);
      }
      if (root.status !== VoucherEntryStatus.POSTED && root.status !== VoucherEntryStatus.REVERSED) {
        throw new BadRequestException(`${config.label} must be embedded before ${root.voucherNumber} is posted`);
      }

      const postingVersion = Math.max(
        0,
        ...correctionEntries.map((entry) => Number(entry.postingVersion ?? 0)),
      ) + 1;
      const createdByUserId = preferredUserId ?? root.createdByUserId;
      const now = new Date();
      await tx.voucherEntry.create({
        data: {
          tenantId: root.tenantId,
          companyId: root.companyId,
          workspaceId: root.workspaceId,
          createdByUserId,
          voucherType: VoucherEntryType.JOURNAL,
          documentKind: config.documentKind,
          workflowOrigin: root.workflowOrigin,
          voucherNumber: `${config.voucherPrefix}-${root.id}-${postingVersion}`,
          voucherDate: root.voucherDate,
          partyName: root.partyName || config.label,
          reference: root.voucherNumber,
          narration: `${config.label} delta for ${root.voucherNumber}`,
          status: VoucherEntryStatus.POSTED,
          totalAmount: debitTotal,
          debit: debitTotal,
          credit: creditTotal,
          currency: company.currencyCode,
          fiscalYearId: root.fiscalYearId,
          branchId: root.branchId,
          warehouseId: root.warehouseId,
          sourceType: config.sourceType,
          sourceId: root.id,
          postingVersion,
          approvedByUserId: createdByUserId,
          approvedAt: now,
          postedAt: now,
          idempotencyKey: `${config.idempotencyStem}:${root.id}:${postingVersion}`,
          revisionGroupId: `${config.idempotencyStem}:${root.id}`,
          lines: {
            create: deltaLines.map(([accountId, delta]) => {
              const account = accountById.get(accountId)!;
              return {
                accountId,
                ledger: account.name,
                description: `${config.label} — ${root.voucherNumber}`,
                debit: delta > 0 ? delta : 0,
                credit: delta < 0 ? Math.abs(delta) : 0,
                costCenter: config.costCenters[0],
                billReference: root.voucherNumber,
              };
            }),
          },
        },
      });
    }
  }

  private async reconcileInventoryMovementLedgers(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    movements: InventoryValuationMovement[],
    preferredUserId?: string,
  ) {
    const movementById = new Map<string, InventoryValuationMovement>();
    for (const movement of movements) {
      if (!movement.id) {
        throw new BadRequestException("Inventory valuation movement identity is missing");
      }
      if (
        !movement.tenantId || !movement.companyId || !movement.workspaceId ||
        !movement.transactionDate
      ) {
        throw new BadRequestException(`Inventory valuation movement ${movement.id} has incomplete posting provenance`);
      }
      if (movement.workspaceId !== workspaceId) {
        throw new BadRequestException(`Inventory valuation movement ${movement.id} crossed workspace boundaries`);
      }
      movementById.set(movement.id, movement);
    }
    const scopedMovements = [...movementById.values()].sort((left, right) => left.id!.localeCompare(right.id!));
    const companyIds = [...new Set(scopedMovements.map((movement) => movement.companyId!))];
    if (companyIds.length !== 1) {
      throw new BadRequestException("Inventory valuation replay crossed company boundaries");
    }
    const companyId = companyIds[0]!;
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { currencyCode: true },
    });
    if (!company?.currencyCode) {
      throw new BadRequestException("Inventory valuation cannot resolve the company currency");
    }
    const fallbackUserId = preferredUserId ||
      scopedMovements.find((movement) => movement.postedByUserId)?.postedByUserId ||
      (await tx.workspaceMember.findFirst({
        where: { workspaceId },
        orderBy: { joinedAt: "asc" },
        select: { userId: true },
      }))?.userId;
    if (!fallbackUserId) {
      throw new BadRequestException("Inventory valuation cannot resolve a posting user");
    }

    const requiredCodes = new Set<string>([INVENTORY_CONTROL_ACCOUNT_CODE]);
    if (scopedMovements.some((movement) => OPENING_LEDGER_TRANSACTION_TYPES.has(movement.transactionType))) {
      requiredCodes.add(OPENING_BALANCE_EQUITY_ACCOUNT_CODE);
    }
    if (scopedMovements.some((movement) => ADJUSTMENT_LEDGER_TRANSACTION_TYPES.has(movement.transactionType))) {
      requiredCodes.add(INVENTORY_ADJUSTMENT_GAIN_ACCOUNT_CODE);
      requiredCodes.add(INVENTORY_ADJUSTMENT_LOSS_ACCOUNT_CODE);
    }
    const accounts = await Promise.all([...requiredCodes].map((code) =>
      tx.account.findUnique({ where: { companyId_code: { companyId, code } } }),
    ));
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      const code = [...requiredCodes][index]!;
      if (
        !account || !account.isSystem || account.level !== "LEDGER" ||
        account.status !== "ACTIVE" || account.code !== code
      ) {
        throw new BadRequestException(`Required protected inventory ledger ${code} is missing or inactive`);
      }
    }
    const accountByCode = new Map(accounts.map((account) => [account!.code, account!]));
    const accountById = new Map(accounts.map((account) => [account!.id, account!]));
    const movementIds = scopedMovements.map((movement) => movement.id!);
    const existingEntries = await tx.voucherEntry.findMany({
      where: {
        workspaceId,
        sourceType: { in: [INVENTORY_OPENING_VALUATION_SOURCE, INVENTORY_ADJUSTMENT_VALUATION_SOURCE] },
        sourceId: { in: movementIds },
        status: { in: [VoucherEntryStatus.POSTED, VoucherEntryStatus.REVERSED] },
      },
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        postingVersion: true,
        lines: {
          select: {
            accountId: true,
            debit: true,
            credit: true,
          },
        },
      },
    });

    for (const movement of scopedMovements) {
      const isOpening = OPENING_LEDGER_TRANSACTION_TYPES.has(movement.transactionType);
      const sourceType = isOpening
        ? INVENTORY_OPENING_VALUATION_SOURCE
        : INVENTORY_ADJUSTMENT_VALUATION_SOURCE;
      const inventoryAccount = accountByCode.get(INVENTORY_CONTROL_ACCOUNT_CODE)!;
      const desiredByAccountId = new Map<string, number>();
      const movementValue = roundMoney(movement.movementValue);
      const inventoryValue = movement.movementType === StockMovementType.IN
        ? movementValue
        : -movementValue;
      desiredByAccountId.set(inventoryAccount.id, inventoryValue);

      if (isOpening) {
        const equityAccount = accountByCode.get(OPENING_BALANCE_EQUITY_ACCOUNT_CODE)!;
        desiredByAccountId.set(equityAccount.id, -inventoryValue);
      } else {
        const isReversal = movement.transactionType === "STOCK_ADJUSTMENT_REVERSAL";
        const usesGain = isReversal
          ? movement.movementType === StockMovementType.OUT
          : movement.movementType === StockMovementType.IN;
        const offsetAccount = usesGain
          ? accountByCode.get(INVENTORY_ADJUSTMENT_GAIN_ACCOUNT_CODE)!
          : accountByCode.get(INVENTORY_ADJUSTMENT_LOSS_ACCOUNT_CODE)!;
        desiredByAccountId.set(offsetAccount.id, -inventoryValue);
      }

      const priorEntries = existingEntries.filter((entry) =>
        entry.sourceType === sourceType && entry.sourceId === movement.id,
      );
      const currentByAccountId = new Map<string, number>();
      for (const entry of priorEntries) {
        for (const line of entry.lines) {
          const lineValue = roundMoney(Number(line.debit) - Number(line.credit));
          if (lineValue === 0) continue;
          if (!line.accountId || !accountById.has(line.accountId)) {
            throw new BadRequestException(`Inventory valuation journal ${entry.id} contains an unexpected ledger`);
          }
          currentByAccountId.set(
            line.accountId,
            sumMoney([currentByAccountId.get(line.accountId) ?? 0, lineValue]),
          );
        }
      }
      if (!moneyEquals(sumMoney([...currentByAccountId.values()]), 0)) {
        throw new BadRequestException(`Inventory valuation journals for movement ${movement.id} are not balanced`);
      }

      const affectedAccountIds = [...new Set([
        ...desiredByAccountId.keys(),
        ...currentByAccountId.keys(),
      ])];
      const deltaByAccountId = new Map(affectedAccountIds.map((accountId) => [
        accountId,
        roundMoney((desiredByAccountId.get(accountId) ?? 0) - (currentByAccountId.get(accountId) ?? 0)),
      ]));
      const deltaLines = [...deltaByAccountId]
        .filter(([, delta]) => delta !== 0)
        .sort(([leftId], [rightId]) => accountById.get(leftId)!.code.localeCompare(accountById.get(rightId)!.code));
      if (!deltaLines.length) continue;

      const debitTotal = sumMoney(deltaLines.filter(([, delta]) => delta > 0).map(([, delta]) => delta));
      const creditTotal = sumMoney(deltaLines.filter(([, delta]) => delta < 0).map(([, delta]) => Math.abs(delta)));
      if (!moneyEquals(debitTotal, creditTotal) || debitTotal <= 0) {
        throw new BadRequestException(`Inventory valuation delta for movement ${movement.id} is not balanced`);
      }

      const postingVersion = Math.max(0, ...priorEntries.map((entry) => entry.postingVersion)) + 1;
      const voucherDate = new Date(movement.transactionDate!);
      if (Number.isNaN(voucherDate.getTime())) {
        throw new BadRequestException(`Inventory valuation movement ${movement.id} has an invalid transaction date`);
      }
      const createdByUserId = preferredUserId ?? movement.postedByUserId ?? fallbackUserId;
      const label = isOpening ? "Inventory Opening Valuation" : "Inventory Adjustment Valuation";
      const sourcePrefix = isOpening ? "IOV" : "IAV";
      const documentKind = isOpening ? "inventory-opening-valuation" : "inventory-adjustment-valuation";
      const now = new Date();
      await tx.voucherEntry.create({
        data: {
          tenantId: movement.tenantId!,
          companyId: movement.companyId!,
          workspaceId,
          createdByUserId,
          voucherType: VoucherEntryType.JOURNAL,
          documentKind,
          voucherNumber: `${sourcePrefix}-${movement.id}-${postingVersion}`,
          voucherDate,
          partyName: label,
          reference: movement.referenceNo || movement.transactionId,
          narration: `${label} delta for stock movement ${movement.id}`,
          status: VoucherEntryStatus.POSTED,
          totalAmount: debitTotal,
          debit: debitTotal,
          credit: creditTotal,
          currency: company.currencyCode,
          warehouseId: movement.warehouseId,
          sourceType,
          sourceId: movement.id,
          postingVersion,
          approvedByUserId: createdByUserId,
          approvedAt: now,
          postedAt: now,
          idempotencyKey: `${sourceType.toLowerCase()}:${movement.id}:${postingVersion}`,
          revisionGroupId: `${sourceType.toLowerCase()}:${movement.id}`,
          lines: {
            create: deltaLines.map(([accountId, delta]) => {
              const account = accountById.get(accountId)!;
              return {
                accountId,
                ledger: account.name,
                description: `${label} — ${movement.referenceNo || movement.transactionId}`,
                debit: delta > 0 ? delta : 0,
                credit: delta < 0 ? Math.abs(delta) : 0,
                costCenter: INVENTORY_VALUATION_COST_CENTER,
              };
            }),
          },
        },
      });
    }
  }

  /**
   * Repairs receipt-backed Purchase Bills posted before their acquisition-cost
   * variance was bridged from Purchase Bill Pending into Inventory Control.
   * Posted bills are immutable: every repair/re-cost/reversal is represented by
   * a new versioned JOURNAL, and the account ids (not display names) determine
   * the accumulated balance.
   */
  private async reconcileHistoricalPurchaseBillCostVariances(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    sourceMovementIds: string[],
    preferredUserId?: string,
    anticipatedReversalOfBillId?: string,
  ) {
    const impactedRevaluations = sourceMovementIds.length
      ? await tx.inventoryCostRevaluation.findMany({
          where: {
            workspaceId,
            sourceMovementId: { in: sourceMovementIds },
            isActive: true,
          },
          select: { billingVoucherId: true },
        })
      : [];
    const anticipatedBillRevaluations = anticipatedReversalOfBillId
      ? await tx.inventoryCostRevaluation.findMany({
          where: {
            workspaceId,
            billingVoucherId: anticipatedReversalOfBillId,
          },
          select: { billingVoucherId: true },
          take: 1,
        })
      : [];
    const billIds = [...new Set([
      ...impactedRevaluations.map((revaluation) => revaluation.billingVoucherId),
      ...anticipatedBillRevaluations.map((revaluation) => revaluation.billingVoucherId),
    ])].sort();
    if (!billIds.length) return;

    // Once one receipt movement identifies a bill, aggregate every active row
    // for that bill. This avoids posting a partial variance when a multi-GRN
    // bill spans inventory items outside a targeted MWA rebuild.
    const activeRevaluations = await tx.inventoryCostRevaluation.findMany({
      where: {
        workspaceId,
        billingVoucherId: { in: billIds },
        isActive: true,
      },
      select: {
        billingVoucherId: true,
        varianceAmount: true,
      },
    });
    const desiredByBillId = new Map<string, Prisma.Decimal>();
    for (const revaluation of activeRevaluations) {
      desiredByBillId.set(
        revaluation.billingVoucherId,
        (desiredByBillId.get(revaluation.billingVoucherId) ?? new Prisma.Decimal(0))
          .add(revaluation.varianceAmount),
      );
    }

    const bills = await tx.voucherEntry.findMany({
      where: { workspaceId, id: { in: billIds } },
      select: {
        id: true,
        tenantId: true,
        companyId: true,
        workspaceId: true,
        createdByUserId: true,
        workflowOrigin: true,
        voucherNumber: true,
        voucherDate: true,
        partyName: true,
        currency: true,
        fiscalYearId: true,
        branchId: true,
        warehouseId: true,
        status: true,
        lines: {
          select: {
            accountId: true,
            costCenter: true,
            debit: true,
            credit: true,
          },
        },
      },
    });
    const billById = new Map(bills.map((bill) => [bill.id, bill]));
    const missingBillId = billIds.find((billId) => !billById.has(billId));
    if (missingBillId) {
      throw new BadRequestException(`Purchase cost revaluation source bill ${missingBillId} was not found`);
    }
    const companyIds = [...new Set(bills.map((bill) => bill.companyId))];
    if (companyIds.length !== 1) {
      throw new BadRequestException("Purchase cost variance replay crossed company boundaries");
    }
    const companyId = companyIds[0]!;
    const [inventoryAccount, pendingAccount] = await Promise.all([
      tx.account.findUnique({
        where: { companyId_code: { companyId, code: INVENTORY_CONTROL_ACCOUNT_CODE } },
      }),
      tx.account.findUnique({
        where: { companyId_code: { companyId, code: PURCHASE_BILL_PENDING_ACCOUNT_CODE } },
      }),
    ]);
    if (
      !inventoryAccount || !pendingAccount ||
      !inventoryAccount.isSystem || !pendingAccount.isSystem ||
      inventoryAccount.level !== "LEDGER" || pendingAccount.level !== "LEDGER" ||
      inventoryAccount.status !== "ACTIVE" || pendingAccount.status !== "ACTIVE" ||
      inventoryAccount.code !== INVENTORY_CONTROL_ACCOUNT_CODE ||
      pendingAccount.code !== PURCHASE_BILL_PENDING_ACCOUNT_CODE
    ) {
      throw new BadRequestException("Required Inventory Control or Purchase Bill Pending system account is missing");
    }

    const relatedEntries = await tx.voucherEntry.findMany({
      where: {
        workspaceId,
        sourceType: PURCHASE_BILL_COST_VARIANCE_SOURCE,
        sourceId: { in: billIds },
        status: { in: [VoucherEntryStatus.POSTED, VoucherEntryStatus.REVERSED] },
      },
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        postingVersion: true,
        lines: {
          select: {
            accountId: true,
            costCenter: true,
            debit: true,
            credit: true,
          },
        },
      },
    });
    const correctionEntries = relatedEntries.filter((entry) =>
      entry.sourceType === PURCHASE_BILL_COST_VARIANCE_SOURCE &&
      Boolean(entry.sourceId && billById.has(entry.sourceId)),
    );
    const allowedAccountIds = new Set([inventoryAccount.id, pendingAccount.id]);
    const signedBalance = (
      lines: Array<{ accountId: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal }>,
      accountId: string,
    ) => roundMoney(lines
      .filter((line) => line.accountId === accountId)
      .reduce(
        (total, line) => total.add(line.debit).sub(line.credit),
        new Prisma.Decimal(0),
      ));

    for (const billId of billIds) {
      const bill = billById.get(billId)!;
      const embeddedLines = bill.lines.filter((line) =>
        line.costCenter === PURCHASE_COST_VARIANCE_COST_CENTER,
      );
      const billCorrections = correctionEntries.filter((entry) => entry.sourceId === billId);
      const correctionLines = billCorrections.flatMap((entry) => entry.lines);
      const unexpectedEmbeddedLine = embeddedLines.find((line) =>
        (Number(line.debit) !== 0 || Number(line.credit) !== 0) &&
        (!line.accountId || !allowedAccountIds.has(line.accountId)),
      );
      const unexpectedCorrectionLine = correctionLines.find((line) =>
        (Number(line.debit) !== 0 || Number(line.credit) !== 0) &&
        (
          line.costCenter !== PURCHASE_COST_VARIANCE_COST_CENTER ||
          !line.accountId ||
          !allowedAccountIds.has(line.accountId)
        ),
      );
      if (unexpectedEmbeddedLine || unexpectedCorrectionLine) {
        throw new BadRequestException(`Purchase cost variance for ${bill.voucherNumber} contains an unexpected ledger`);
      }

      const embeddedInventory = signedBalance(embeddedLines, inventoryAccount.id);
      const embeddedPending = signedBalance(embeddedLines, pendingAccount.id);
      if (!moneyEquals(sumMoney([embeddedInventory, embeddedPending]), 0)) {
        throw new BadRequestException(`Embedded purchase cost variance for ${bill.voucherNumber} is not balanced`);
      }
      const correctionInventory = signedBalance(correctionLines, inventoryAccount.id);
      const correctionPending = signedBalance(correctionLines, pendingAccount.id);
      if (!moneyEquals(sumMoney([correctionInventory, correctionPending]), 0)) {
        throw new BadRequestException(`Purchase cost variance journals for ${bill.voucherNumber} are not balanced`);
      }

      const isAnticipatedReversal = anticipatedReversalOfBillId === billId;
      // PostingEngine will mirror the original bill immediately after stock
      // reversal. Its embedded pair therefore cancels itself; separate repair
      // journals are not part of that mirror and need an explicit zeroing delta.
      const currentInventory = roundMoney(
        correctionInventory + (isAnticipatedReversal ? 0 : embeddedInventory),
      );
      const currentPending = roundMoney(
        correctionPending + (isAnticipatedReversal ? 0 : embeddedPending),
      );
      const desiredInventory = isAnticipatedReversal
        ? 0
        : roundMoney(desiredByBillId.get(billId) ?? 0);
      const inventoryDelta = roundMoney(desiredInventory - currentInventory);
      const pendingDelta = roundMoney(-desiredInventory - currentPending);
      if (inventoryDelta === 0 && pendingDelta === 0) continue;
      if (!moneyEquals(inventoryDelta, -pendingDelta)) {
        throw new BadRequestException(`Purchase cost variance delta for ${bill.voucherNumber} is not balanced`);
      }
      if (bill.status !== VoucherEntryStatus.POSTED && bill.status !== VoucherEntryStatus.REVERSED) {
        throw new BadRequestException(
          `Unposted Purchase Bill ${bill.voucherNumber} must keep its cost variance on the source voucher`,
        );
      }

      const postingVersion = Math.max(
        0,
        ...billCorrections.map((entry) => Number(entry.postingVersion ?? 0)),
      ) + 1;
      const varianceValue = Math.abs(inventoryDelta);
      const inventoryIncreases = inventoryDelta > 0;
      const createdByUserId = preferredUserId ?? bill.createdByUserId;
      const now = new Date();
      await tx.voucherEntry.create({
        data: {
          tenantId: bill.tenantId,
          companyId: bill.companyId,
          workspaceId: bill.workspaceId,
          createdByUserId,
          voucherType: VoucherEntryType.JOURNAL,
          documentKind: "purchase-cost-variance-adjustment",
          workflowOrigin: bill.workflowOrigin,
          voucherNumber: `PCV-${bill.id}-${postingVersion}`,
          voucherDate: bill.voucherDate,
          partyName: bill.partyName || "Purchase Cost Variance",
          reference: bill.voucherNumber,
          narration: `Receipt cost variance adjustment for ${bill.voucherNumber}: ${currentInventory.toFixed(2)} to ${desiredInventory.toFixed(2)}`,
          status: VoucherEntryStatus.POSTED,
          totalAmount: varianceValue,
          debit: varianceValue,
          credit: varianceValue,
          currency: bill.currency,
          fiscalYearId: bill.fiscalYearId,
          branchId: bill.branchId,
          warehouseId: bill.warehouseId,
          sourceType: PURCHASE_BILL_COST_VARIANCE_SOURCE,
          sourceId: bill.id,
          postingVersion,
          approvedByUserId: createdByUserId,
          approvedAt: now,
          postedAt: now,
          idempotencyKey: `purchase-bill-cost-variance:${bill.id}:${postingVersion}`,
          revisionGroupId: `purchase-bill-cost-variance:${bill.id}`,
          lines: {
            create: [
              {
                accountId: inventoryIncreases ? inventoryAccount.id : pendingAccount.id,
                ledger: inventoryIncreases ? inventoryAccount.name : pendingAccount.name,
                description: `Receipt cost variance adjustment â€” ${bill.voucherNumber}`,
                debit: varianceValue,
                credit: 0,
                costCenter: PURCHASE_COST_VARIANCE_COST_CENTER,
                billReference: bill.voucherNumber,
              },
              {
                accountId: inventoryIncreases ? pendingAccount.id : inventoryAccount.id,
                ledger: inventoryIncreases ? pendingAccount.name : inventoryAccount.name,
                description: `Receipt cost variance adjustment â€” ${bill.voucherNumber}`,
                debit: 0,
                credit: varianceValue,
                costCenter: PURCHASE_COST_VARIANCE_COST_CENTER,
                billReference: bill.voucherNumber,
              },
            ],
          },
        },
      });
    }
  }

  async reverseVoucherMovements(tx: Prisma.TransactionClient, voucherId: string, userId: string) {
    const movements = await tx.stockMovement.findMany({ where: { transactionId: voucherId, reversalOfId: null, voidedAt: null } });
    const existingReversals = movements.length
      ? await tx.stockMovement.findMany({
          where: { reversalOfId: { in: movements.map((movement) => movement.id) }, voidedAt: null },
          select: { reversalOfId: true },
        })
      : [];
    const reversedMovementIds = new Set(
      existingReversals
        .map((movement) => movement.reversalOfId)
        .filter((movementId): movementId is string => Boolean(movementId)),
    );
    const pendingMovements = movements.filter((movement) => !reversedMovementIds.has(movement.id));
    const sourceLines = pendingMovements.length
      ? await tx.voucherInventoryItem.findMany({
          where: { id: { in: pendingMovements.map((movement) => movement.transactionLineId) } },
          select: {
            id: true,
            inventoryItemId: true,
            warehouseId: true,
            sourceInventoryLineId: true,
            manufacturingInventoryLotId: true,
            manufacturingSerialIds: true,
            itemName: true,
            quantity: true,
            inventoryItem: {
              select: {
                id: true,
                unit: true,
                manufacturingProfile: true,
              },
            },
            voucher: { select: { voucherType: true } },
          },
        })
      : [];
    const sourceLineById = new Map(sourceLines.map((line) => [line.id, line]));
    const revaluations = await tx.inventoryCostRevaluation.findMany({
      where: { billingVoucherId: voucherId, isActive: true },
      select: { id: true, workspaceId: true, sourceMovementId: true, inventoryItemId: true },
    });
    if (revaluations.length) {
      const reversedAt = new Date();
      await tx.inventoryCostRevaluation.updateMany({
        where: { id: { in: revaluations.map((revaluation) => revaluation.id) }, isActive: true },
        data: { isActive: false, reversedAt },
      });
      await tx.stockMovement.updateMany({
        where: { id: { in: revaluations.map((revaluation) => revaluation.sourceMovementId) }, voidedAt: null },
        data: { costingVersion: 0 },
      });
    }
    for (const movement of pendingMovements) {
      const sourceLine = sourceLineById.get(movement.transactionLineId);
      if (
        !sourceLine &&
        movement.movementType === StockMovementType.OUT &&
        ["SALES", "DELIVERY_NOTE"].includes(movement.transactionType)
      ) {
        throw new ConflictException("Cannot reverse this sale because its exact stock-line provenance is missing");
      }
      if (
        sourceLine &&
        (
          this.requiresManufacturingSalesProvenance(sourceLine.inventoryItem?.manufacturingProfile ?? null) ||
          sourceLine.manufacturingInventoryLotId ||
          sourceLine.manufacturingSerialIds.length
        )
      ) {
        const manufacturingLine = sourceLine as ManufacturingSalesLine;
        const isSaleIssue =
          movement.movementType === StockMovementType.OUT &&
          (sourceLine.voucher.voucherType === VoucherEntryType.SALES ||
            sourceLine.voucher.voucherType === VoucherEntryType.DELIVERY_NOTE);
        const isSalesReturn =
          movement.movementType === StockMovementType.IN &&
          sourceLine.voucher.voucherType === VoucherEntryType.CREDIT_NOTE;
        if (isSaleIssue) {
          await this.restoreConsumedManufacturingStock(
            tx,
            movement.workspaceId,
            manufacturingLine,
            movement.warehouseId,
          );
        } else if (isSalesReturn) {
          await this.consumeReleasedManufacturingStock(
            tx,
            movement.workspaceId,
            manufacturingLine,
            movement.warehouseId,
          );
        }
      }
      await tx.stockMovement.upsert({ where: { workspaceId_idempotencyKey: { workspaceId: movement.workspaceId, idempotencyKey: `reversal:${movement.id}` } }, update: {}, create: { tenantId: movement.tenantId, companyId: movement.companyId, workspaceId: movement.workspaceId, warehouseId: movement.warehouseId, inventoryItemId: movement.inventoryItemId, transactionType: `${movement.transactionType}_REVERSAL`, transactionId: voucherId, transactionLineId: movement.transactionLineId, referenceNo: movement.referenceNo, movementType: movement.movementType === StockMovementType.IN ? StockMovementType.OUT : StockMovementType.IN, quantity: movement.quantity, unit: movement.unit, unitConversion: movement.unitConversion, inputUnitCost: null, transactionDate: new Date(), postedByUserId: userId, reversalOfId: movement.id, idempotencyKey: `reversal:${movement.id}`, batchNumber: movement.batchNumber, manufacturedAt: movement.manufacturedAt, expiresAt: movement.expiresAt } });
    }
    const stocklessVoucher = !movements.length && !revaluations.length
      ? await tx.voucherEntry.findUnique({
          where: { id: voucherId },
          select: {
            workspaceId: true,
            workflowOrigin: true,
            voucherType: true,
            documentKind: true,
            inventoryItems: {
              where: { sourceInventoryLineId: { not: null } },
              select: { id: true },
              take: 1,
            },
          },
        })
      : null;
    const sourcedInvoiceWorkspaceId = stocklessVoucher &&
      this.isOrderFlowSalesInvoice(stocklessVoucher) &&
      stocklessVoucher.inventoryItems.length > 0
      ? stocklessVoucher.workspaceId
      : undefined;
    const workspaceId = movements[0]?.workspaceId ?? revaluations[0]?.workspaceId ?? sourcedInvoiceWorkspaceId;
    if (workspaceId) {
      const inventoryItemIds = [
        ...new Set([
          ...movements.map((movement) => movement.inventoryItemId),
          ...revaluations.map((revaluation) => revaluation.inventoryItemId),
        ]),
      ];
      if (inventoryItemIds.length) {
        const valuation = await rebuildMovingAverageCosts(tx, workspaceId, inventoryItemIds);
        await this.assertValuationStockPolicy(tx, workspaceId, valuation.movements);
        await this.reconcileMovingAverageLedger(tx, workspaceId, valuation.movements, userId, voucherId);
      } else {
        // A sourced Sales Invoice owns no stock movement. Its generic voucher
        // mirror reverses the embedded base pair; reconciliation cancels only
        // immutable recost corrections linked to the exact SI source lines.
        await this.reconcileMovingAverageLedger(tx, workspaceId, [], userId, voucherId);
      }
    }
  }

  private async postPurchaseBillRevaluations(
    tx: Prisma.TransactionClient,
    voucher: ReceiptBackedPurchaseBill,
    productLines: RevaluablePurchaseLine[],
  ) {
    const grossInventoryValue = voucher.inventoryItems.reduce(
      (sum, line) => sum.add(new Prisma.Decimal(line.quantity).mul(line.unitPrice)),
      new Prisma.Decimal(0),
    );
    const netInventoryValue = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      grossInventoryValue.sub(voucher.discountAmount ?? 0),
    );
    const acquisitionFactor = grossInventoryValue.isPositive()
      ? netInventoryValue.div(grossInventoryValue)
      : new Prisma.Decimal(1);

    const resolved = [] as Array<{
      line: RevaluablePurchaseLine;
      sourceMovement: Awaited<ReturnType<InventoryService["resolvePhysicalReceiptMovement"]>>["sourceMovement"];
      sourceInventoryLineId: string;
      revisedUnitCost: Prisma.Decimal;
    }>;
    for (const line of productLines) {
      const source = await this.resolvePhysicalReceiptMovement(tx, voucher.workspaceId, line);
      resolved.push({
        line,
        ...source,
        revisedUnitCost: new Prisma.Decimal(line.unitPrice)
          .mul(acquisitionFactor)
          .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP),
      });
    }

    const sourceMovementIds = [...new Set(resolved.map((entry) => entry.sourceMovement.id))];
    const priorRevaluations = await tx.inventoryCostRevaluation.findMany({
      where: {
        sourceMovementId: { in: sourceMovementIds },
        isActive: true,
        billingVoucherId: { not: voucher.id },
      },
      select: { sourceMovementId: true, quantity: true },
    });
    const quantityBySourceMovement = new Map<string, Prisma.Decimal>();
    for (const revaluation of priorRevaluations) {
      quantityBySourceMovement.set(
        revaluation.sourceMovementId,
        (quantityBySourceMovement.get(revaluation.sourceMovementId) ?? new Prisma.Decimal(0)).add(revaluation.quantity),
      );
    }
    for (const entry of resolved) {
      quantityBySourceMovement.set(
        entry.sourceMovement.id,
        (quantityBySourceMovement.get(entry.sourceMovement.id) ?? new Prisma.Decimal(0)).add(entry.line.quantity),
      );
    }
    for (const sourceMovementId of sourceMovementIds) {
      const sourceMovement = resolved.find((entry) => entry.sourceMovement.id === sourceMovementId)!.sourceMovement;
      if ((quantityBySourceMovement.get(sourceMovementId) ?? new Prisma.Decimal(0)).greaterThan(sourceMovement.quantity)) {
        throw new BadRequestException("Purchase Bill quantity exceeds its source Receipt Note quantity");
      }
    }

    const varianceAmounts: Prisma.Decimal[] = [];
    for (const entry of resolved) {
      const sourceUnitCost = new Prisma.Decimal(entry.sourceMovement.inputUnitCost ?? entry.sourceMovement.unitCost ?? 0)
        .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
      const varianceAmount = new Prisma.Decimal(entry.line.quantity)
        .mul(entry.revisedUnitCost.sub(sourceUnitCost))
        .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
      varianceAmounts.push(varianceAmount);
      const idempotencyKey = `purchase-bill-revaluation:${voucher.id}:${entry.line.id}`;
      await tx.inventoryCostRevaluation.upsert({
        where: { workspaceId_idempotencyKey: { workspaceId: voucher.workspaceId, idempotencyKey } },
        update: {
          quantity: entry.line.quantity,
          sourceUnitCost,
          revisedUnitCost: entry.revisedUnitCost,
          varianceAmount,
          effectiveDate: voucher.voucherDate,
          isActive: true,
          reversedAt: null,
        },
        create: {
          tenantId: voucher.tenantId,
          companyId: voucher.companyId,
          workspaceId: voucher.workspaceId,
          warehouseId: entry.sourceMovement.warehouseId,
          inventoryItemId: entry.sourceMovement.inventoryItemId,
          sourceMovementId: entry.sourceMovement.id,
          sourceInventoryLineId: entry.sourceInventoryLineId,
          billingVoucherId: voucher.id,
          billingInventoryLineId: entry.line.id,
          quantity: entry.line.quantity,
          sourceUnitCost,
          revisedUnitCost: entry.revisedUnitCost,
          varianceAmount,
          effectiveDate: voucher.voucherDate,
          idempotencyKey,
        },
      });
    }
    const aggregateVariance = varianceAmounts
      .reduce((sum, variance) => sum.add(variance), new Prisma.Decimal(0))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();
    await this.postPurchaseBillCostVarianceLedgerEntry(tx, voucher, aggregateVariance);
    await tx.stockMovement.updateMany({
      where: { id: { in: sourceMovementIds }, voidedAt: null },
      data: { costingVersion: 0 },
    });
    const valuation = await rebuildMovingAverageCosts(
      tx,
      voucher.workspaceId,
      [...new Set(resolved.map((entry) => entry.sourceMovement.inventoryItemId))],
    );
    await this.assertValuationStockPolicy(tx, voucher.workspaceId, valuation.movements);
    await this.reconcileMovingAverageLedger(tx, voucher.workspaceId, valuation.movements);
  }

  private async postPurchaseBillCostVarianceLedgerEntry(
    tx: Prisma.TransactionClient,
    voucher: ReceiptBackedPurchaseBill,
    totalVariance: number,
  ) {
    const desiredInventory = roundMoney(totalVariance);
    const [inventoryAccount, pendingAccount] = await Promise.all([
      tx.account.findUnique({
        where: { companyId_code: { companyId: voucher.companyId, code: INVENTORY_CONTROL_ACCOUNT_CODE } },
      }),
      tx.account.findUnique({
        where: { companyId_code: { companyId: voucher.companyId, code: PURCHASE_BILL_PENDING_ACCOUNT_CODE } },
      }),
    ]);
    if (
      !inventoryAccount || !pendingAccount ||
      !inventoryAccount.isSystem || !pendingAccount.isSystem ||
      inventoryAccount.level !== "LEDGER" || pendingAccount.level !== "LEDGER" ||
      inventoryAccount.status !== "ACTIVE" || pendingAccount.status !== "ACTIVE"
    ) {
      throw new BadRequestException("Required Inventory Control or Purchase Bill Pending system account is missing");
    }

    const existingLines = await tx.voucherEntryLine.findMany({
      where: {
        voucherId: voucher.id,
        costCenter: PURCHASE_COST_VARIANCE_COST_CENTER,
      },
      select: { accountId: true, debit: true, credit: true },
    });
    const allowedAccountIds = new Set([inventoryAccount.id, pendingAccount.id]);
    const unexpectedLine = existingLines.find((line) =>
      (Number(line.debit) !== 0 || Number(line.credit) !== 0) &&
      (!line.accountId || !allowedAccountIds.has(line.accountId)),
    );
    if (unexpectedLine) {
      throw new BadRequestException(`Purchase cost variance for ${voucher.voucherNumber} contains an unexpected ledger`);
    }
    const currentInventory = sumMoney(existingLines
      .filter((line) => line.accountId === inventoryAccount.id)
      .map((line) => Number(line.debit) - Number(line.credit)));
    const currentPending = sumMoney(existingLines
      .filter((line) => line.accountId === pendingAccount.id)
      .map((line) => Number(line.debit) - Number(line.credit)));
    if (!moneyEquals(sumMoney([currentInventory, currentPending]), 0)) {
      throw new BadRequestException(`Purchase cost variance for ${voucher.voucherNumber} is not balanced`);
    }

    const inventoryDelta = roundMoney(desiredInventory - currentInventory);
    const pendingDelta = roundMoney(-desiredInventory - currentPending);
    if (inventoryDelta === 0 && pendingDelta === 0) return;
    if (!moneyEquals(inventoryDelta, -pendingDelta)) {
      throw new BadRequestException(`Purchase cost variance delta for ${voucher.voucherNumber} is not balanced`);
    }
    if (voucher.status === VoucherEntryStatus.POSTED || voucher.status === VoucherEntryStatus.REVERSED) {
      throw new BadRequestException(
        `Posted Purchase Bill ${voucher.voucherNumber} requires a separate cost-variance correction journal`,
      );
    }

    const varianceValue = Math.abs(inventoryDelta);
    const inventoryIncreases = inventoryDelta > 0;
    const billReference = voucher.lines?.find((line) => line.billReference)?.billReference ?? voucher.voucherNumber;
    await tx.voucherEntryLine.createMany({
      data: [
        {
          voucherId: voucher.id,
          accountId: inventoryIncreases ? inventoryAccount.id : pendingAccount.id,
          ledger: inventoryIncreases ? inventoryAccount.name : pendingAccount.name,
          description: `Receipt cost variance — ${voucher.voucherNumber}`,
          debit: varianceValue,
          credit: 0,
          costCenter: PURCHASE_COST_VARIANCE_COST_CENTER,
          billReference,
        },
        {
          voucherId: voucher.id,
          accountId: inventoryIncreases ? pendingAccount.id : inventoryAccount.id,
          ledger: inventoryIncreases ? pendingAccount.name : inventoryAccount.name,
          description: `Receipt cost variance — ${voucher.voucherNumber}`,
          debit: 0,
          credit: varianceValue,
          costCenter: PURCHASE_COST_VARIANCE_COST_CENTER,
          billReference,
        },
      ],
    });
    // The document amount remains the supplier bill total. debit/credit are
    // the gross journal totals, so include this additional balanced pair.
    await tx.voucherEntry.update({
      where: { id: voucher.id },
      data: {
        debit: { increment: varianceValue },
        credit: { increment: varianceValue },
      },
    });
  }

  private async resolvePhysicalReceiptMovement(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    line: RevaluablePurchaseLine,
  ) {
    let sourceInventoryLineId = line.sourceInventoryLineId;
    const visited = new Set<string>();
    while (sourceInventoryLineId && !visited.has(sourceInventoryLineId)) {
      visited.add(sourceInventoryLineId);
      const sourceLine = await tx.voucherInventoryItem.findFirst({
        where: { id: sourceInventoryLineId, voucher: { workspaceId } },
        select: {
          id: true,
          inventoryItemId: true,
          warehouseId: true,
          sourceInventoryLineId: true,
          voucher: { select: { status: true, documentKind: true } },
        },
      });
      if (!sourceLine) throw new BadRequestException(`${line.itemName}: source Receipt Note line was not found`);
      const sourceMovement = await tx.stockMovement.findFirst({
        where: {
          workspaceId,
          transactionLineId: sourceLine.id,
          movementType: StockMovementType.IN,
          reversalOfId: null,
          voidedAt: null,
        },
        orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      });
      if (sourceMovement) {
        if (sourceLine.voucher.status !== "POSTED" || sourceLine.voucher.documentKind !== "receipt-note") {
          throw new BadRequestException(`${line.itemName}: source must be a posted Receipt Note line`);
        }
        if (
          !line.inventoryItemId ||
          sourceMovement.inventoryItemId !== line.inventoryItemId ||
          (line.warehouseId && sourceMovement.warehouseId !== line.warehouseId)
        ) {
          throw new BadRequestException(`${line.itemName}: source Receipt Note item or warehouse does not match`);
        }
        return { sourceMovement, sourceInventoryLineId: sourceLine.id };
      }
      sourceInventoryLineId = sourceLine.sourceInventoryLineId;
    }
    throw new BadRequestException(`${line.itemName}: select the exact received Receipt Note line before posting the bill`);
  }

  private async assertValuationStockPolicy(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    movements: Array<{ balanceQuantity: number; inventoryItemId: string; warehouseId: string }>,
  ) {
    const negative = movements.find((movement) => movement.balanceQuantity < -0.000001);
    if (!negative) {
      return;
    }
    // ALLOW_NEGATIVE means the costing replay itself (rebuildMovingAverageCosts,
    // called just before this) already accepted the shortfall and froze the
    // average cost instead of dividing by a negative quantity — this pre-check
    // must agree, or a posting the engine just allowed would still get rejected
    // here right after.
    if (await resolveNegativeStockPolicy(tx, workspaceId)) {
      return;
    }
    throw new BadRequestException("This posting would make historical warehouse stock negative. Correct the date, quantity, or earlier receipt first.");
  }

  private transactionType(v: { voucherType: VoucherEntryType; documentKind: string | null }) { return (v.documentKind || v.voucherType).replaceAll("-", "_").toUpperCase(); }
  private async resolveVoucherEffect(tx: Prisma.TransactionClient, v: { voucherType: VoucherEntryType; documentKind: string | null; sourceVoucherId: string | null }) {
    const kind = v.documentKind ?? "";
    if (["purchase-order", "sale-order", "quotation", "proforma"].includes(kind)) return null;
    if (v.voucherType === VoucherEntryType.CREDIT_NOTE) return StockMovementType.IN;
    if (v.voucherType === VoucherEntryType.DEBIT_NOTE) return StockMovementType.OUT;
    if (v.voucherType === VoucherEntryType.PURCHASE || v.voucherType === VoucherEntryType.RECEIPT_NOTE) {
      if (v.sourceVoucherId) { const source = await tx.voucherEntry.findUnique({ where: { id: v.sourceVoucherId }, select: { documentKind: true } }); if (source?.documentKind === "receipt-note") return null; }
      return StockMovementType.IN;
    }
    if (v.voucherType === VoucherEntryType.SALES || v.voucherType === VoucherEntryType.DELIVERY_NOTE) {
      if (v.sourceVoucherId) { const source = await tx.voucherEntry.findUnique({ where: { id: v.sourceVoucherId }, select: { documentKind: true } }); if (source?.documentKind === "delivery-note") return null; }
      return StockMovementType.OUT;
    }
    return null;
  }

  private async assertAvailable(tx: Prisma.TransactionClient, workspaceId: string, warehouseId: string, itemId: string, required: number, warehouseName: string) {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { companyId: true } });
    const settings = workspace ? await tx.accountingSettings.findUnique({ where: { companyId: workspace.companyId }, select: { negativeStockPolicy: true } }) : null;
    if (settings?.negativeStockPolicy === "ALLOW_NEGATIVE") return;
    const rows = await tx.stockMovement.groupBy({ by: ["movementType"], where: { workspaceId, warehouseId, inventoryItemId: itemId, voidedAt: null }, _sum: { quantity: true } });
    const available = rows.reduce((sum, row) => sum + Number(row._sum.quantity ?? 0) * (row.movementType === StockMovementType.IN ? 1 : -1), 0);
    if (available < required) throw new BadRequestException(`Insufficient stock in ${warehouseName}. Available: ${available}, Required: ${required}.`);
  }

  private async assertGenericTransferManufacturingSafety(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    companyId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    inventoryItemIds: string[],
  ) {
    const settings = await tx.manufacturingSettings.findFirst({
      where: { workspaceId, companyId },
      select: { defaultWipWarehouseId: true },
    });
    if (
      settings?.defaultWipWarehouseId &&
      [fromWarehouseId, toWarehouseId].includes(
        settings.defaultWipWarehouseId,
      )
    ) {
      throw new BadRequestException(
        "Generic warehouse transfers cannot enter or leave the configured WIP warehouse. Use the controlled manufacturing material issue or return workflow.",
      );
    }

    const [activeLot, activeSerial] = await Promise.all([
      tx.manufacturingInventoryLot.findFirst({
        where: {
          workspaceId,
          companyId,
          warehouseId: fromWarehouseId,
          inventoryItemId: { in: inventoryItemIds },
          OR: [
            { availableQuantity: { gt: 0 } },
            { reservedQuantity: { gt: 0 } },
            { holdQuantity: { gt: 0 } },
            { rejectedQuantity: { gt: 0 } },
          ],
        },
        select: { id: true, inventoryItemId: true, lotNumber: true },
      }),
      tx.manufacturingSerial.findFirst({
        where: {
          workspaceId,
          companyId,
          warehouseId: fromWarehouseId,
          inventoryItemId: { in: inventoryItemIds },
          status: {
            in: [
              ManufacturingSerialStatus.CREATED,
              ManufacturingSerialStatus.QC_HOLD,
              ManufacturingSerialStatus.RELEASED,
              ManufacturingSerialStatus.REWORK,
            ],
          },
        },
        select: { id: true, inventoryItemId: true, serialNumber: true },
      }),
    ]);
    if (activeLot || activeSerial) {
      throw new BadRequestException(
        "Generic warehouse transfer is blocked because source stock is represented by active manufacturing lot or serial records that this transfer cannot relocate. Use a controlled manufacturing stock movement.",
      );
    }
  }

  async createTransfer(user: AuthenticatedRequestUser, dto: CreateWarehouseTransferDto) {
    await this.assertWorkspace(user, dto.workspaceId);
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException("From and To warehouses must be different");
    if (!dto.lines.length) throw new BadRequestException("Add at least one product");
    if (new Set(dto.lines.map((line) => line.inventoryItemId)).size !== dto.lines.length) throw new BadRequestException("Each product can appear only once in a transfer");
    const transfer = await this.prisma.$transaction(async (tx) => {
      const warehouses = await tx.warehouse.findMany({ where: { id: { in: [dto.fromWarehouseId, dto.toWarehouseId] }, workspaceId: dto.workspaceId, isActive: true, deletedAt: null } });
      if (warehouses.length !== 2) throw new BadRequestException("Both warehouses must be active");
      const items = await tx.inventoryItem.findMany({ where: { id: { in: dto.lines.map((x) => x.inventoryItemId) }, workspaceId: dto.workspaceId, kind: "PRODUCT" } });
      if (items.length !== dto.lines.length) throw new BadRequestException("Transfers can contain only valid stock products");
      await this.assertGenericTransferManufacturingSafety(
        tx,
        dto.workspaceId,
        user.companyId,
        dto.fromWarehouseId,
        dto.toWarehouseId,
        items.map((item) => item.id),
      );
      const from = warehouses.find((x) => x.id === dto.fromWarehouseId)!;
      for (const line of dto.lines) await this.assertAvailable(tx, dto.workspaceId, dto.fromWarehouseId, line.inventoryItemId, line.quantity, from.name);
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: dto.workspaceId } });
      const count = await tx.warehouseTransfer.count({ where: { workspaceId: dto.workspaceId } });
      const created = await tx.warehouseTransfer.create({ data: { tenantId: workspace.tenantId, companyId: workspace.companyId, workspaceId: dto.workspaceId, transferNo: dto.transferNo?.trim() || `WT-${String(count + 1).padStart(5, "0")}`, transferDate: new Date(dto.transferDate), fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, notes: dto.notes?.trim() || null, status: WarehouseTransferStatus.POSTED, postedAt: new Date(), createdByUserId: user.id, lines: { create: dto.lines.map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: line.quantity, unit: items.find((x) => x.id === line.inventoryItemId)!.unit })) } }, include: { lines: true } });
      for (const line of created.lines) for (const [warehouseId, movementType, suffix] of [[created.fromWarehouseId, StockMovementType.OUT, "OUT"], [created.toWarehouseId, StockMovementType.IN, "IN"]] as const) await tx.stockMovement.create({ data: { tenantId: created.tenantId, companyId: created.companyId, workspaceId: created.workspaceId, warehouseId, inventoryItemId: line.inventoryItemId, transactionType: `STOCK_TRANSFER_${suffix}`, transactionId: created.id, transactionLineId: line.id, referenceNo: created.transferNo, movementType, quantity: line.quantity, unit: line.unit, inputUnitCost: null, transactionDate: created.transferDate, postedByUserId: user.id, idempotencyKey: `transfer:${created.id}:line:${line.id}:${suffix}` } });
      const valuation = await rebuildMovingAverageCosts(tx, dto.workspaceId, created.lines.map((line) => line.inventoryItemId));
      await this.assertValuationStockPolicy(tx, dto.workspaceId, valuation.movements);
      await this.reconcileMovingAverageLedger(tx, dto.workspaceId, valuation.movements, user.id);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit.log({ tenantId: user.tenantId, companyId: user.companyId, workspaceId: dto.workspaceId, userId: user.id, action: "WAREHOUSE_TRANSFER_POSTED", entityType: "WarehouseTransfer", entityId: transfer.id, newValues: transfer });
    return transfer;
  }
}
