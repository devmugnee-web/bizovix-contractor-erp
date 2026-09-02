import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { AccountLevel, LcAllocationMode, LcLandedCostStatus, LcStatus, PartyType, Prisma, StockMovementType, VoucherEntryStatus } from "../generated/prisma/index.js";
import { ACCOUNT_MANAGED_ROLE } from "../accounts/account-managed-role.js";
import { AccountsService } from "../accounts/accounts.service.js";
import { roundMoneyDecimal } from "../accounting/money.util.js";
import { PostingEngineService } from "../accounting/posting-engine.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { VouchersService } from "../vouchers/vouchers.service.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { rebuildMovingAverageCosts } from "../inventory/moving-average.js";
import type { CreateLcCostEntryDto } from "./dto/create-cost-entry.dto.js";
import type { CreateLcCostHeadDto } from "./dto/create-cost-head.dto.js";
import type { CreateLcDto } from "./dto/create-lc.dto.js";
import type { CreateLcGrnDto } from "./dto/create-grn.dto.js";
import type { CreateLcShipmentDto } from "./dto/create-shipment.dto.js";
import type { ReopenLcLandedCostDto } from "./dto/reopen-lc.dto.js";
import type { PostLcInventoryDto, UpdateLcInventoryPostingDto } from "./dto/post-lc-inventory.dto.js";
import type { AllocationRowInputDto, SaveLcAllocationDto } from "./dto/save-allocation.dto.js";
import type { SetLcStatusDto } from "./dto/set-lc-status.dto.js";
import type { UpdateLcCostEntryDto } from "./dto/update-cost-entry.dto.js";
import type { UpdateLcCostHeadDto } from "./dto/update-cost-head.dto.js";
import type { UpdateLcDto } from "./dto/update-lc.dto.js";
import type { UpdateLcProfitDto } from "./dto/update-lc-profit.dto.js";
import { allocateHybrid, allocateProportionally, basisValueFor } from "./lc-allocation.util.js";
import { lcDefaultCostHeadSeeds } from "./lc-default-cost-heads.js";
import { isZero, round2, sumDecimals, toDecimal, toNumber2 } from "./lc-money.util.js";

const LC_ITEM_INCLUDE = {
  allocations: { include: { costEntry: { include: { costHead: true } } } },
  inventoryPosting: { include: { warehouse: true } },
} satisfies Prisma.LcItemInclude;

const LC_DETAIL_INCLUDE = {
  supplier: true,
  destinationWarehouse: true,
  items: { include: LC_ITEM_INCLUDE, orderBy: { sortOrder: "asc" as const } },
  shipments: { orderBy: { createdAt: "asc" as const } },
  costEntries: {
    include: { costHead: true, shipment: true, allocations: true },
    orderBy: { createdAt: "asc" as const },
  },
  grns: { include: { items: true, warehouse: true }, orderBy: { createdAt: "asc" as const } },
  statusHistory: { orderBy: { changedAt: "desc" as const } },
  landedCost: { include: { items: true } },
} satisfies Prisma.LcMasterInclude;

type LcMasterDetail = Prisma.LcMasterGetPayload<{ include: typeof LC_DETAIL_INCLUDE }>;
type LcItemRow = LcMasterDetail["items"][number];
type LcCostEntryRow = LcMasterDetail["costEntries"][number];
type LcPaymentAllocation = { accountId: string; ledger: string; amount: number; reference?: string };

function toDateOnly(value: string | Date): Date {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function itemForBasis(item: { totalPurchaseCostBdt: Prisma.Decimal; usdUnitPrice: Prisma.Decimal; quantity: Prisma.Decimal; weight: Prisma.Decimal | null; cbm: Prisma.Decimal | null }) {
  return {
    totalPurchaseCostBdt: item.totalPurchaseCostBdt,
    usdUnitPrice: item.usdUnitPrice,
    quantity: item.quantity,
    weight: item.weight,
    cbm: item.cbm,
  };
}

function serializeItem(item: LcItemRow) {
  return {
    id: item.id,
    inventoryItemId: item.inventoryItemId,
    productName: item.productName,
    description: item.description,
    unit: item.unit,
    quantity: Number(item.quantity),
    usdUnitPrice: Number(item.usdUnitPrice),
    exchangeRate: Number(item.exchangeRate),
    calculatedBdtUnitPrice: Number(item.calculatedBdtUnitPrice),
    acceptedBdtUnitPrice: item.acceptedBdtUnitPrice ? Number(item.acceptedBdtUnitPrice) : null,
    effectiveBdtUnitPrice: Number(item.acceptedBdtUnitPrice ?? item.calculatedBdtUnitPrice),
    totalPurchaseCostBdt: Number(item.totalPurchaseCostBdt),
    weight: item.weight ? Number(item.weight) : null,
    cbm: item.cbm ? Number(item.cbm) : null,
    hsCode: item.hsCode,
    receivedQuantity: Number(item.receivedQuantity),
    landedCostAmount: item.landedCostAmount ? Number(item.landedCostAmount) : null,
    landedCostPerUnit: item.landedCostPerUnit ? Number(item.landedCostPerUnit) : null,
    profitMode: item.profitMode,
    profitValue: item.profitValue ? Number(item.profitValue) : null,
    inventoryPosting: item.inventoryPosting ? {
      id: item.inventoryPosting.id,
      warehouseId: item.inventoryPosting.warehouseId,
      warehouseName: item.inventoryPosting.warehouse.name,
      quantity: Number(item.inventoryPosting.quantity),
      unitCost: Number(item.inventoryPosting.unitCost),
      totalCost: Number(item.inventoryPosting.totalCost),
      postedAt: item.inventoryPosting.postedAt,
    } : null,
  };
}

function serializeCostEntry(entry: LcCostEntryRow) {
  const allocatedTotal = sumDecimals(entry.allocations.map((allocation) => allocation.finalAmount));
  return {
    id: entry.id,
    costHeadId: entry.costHeadId,
    costHeadName: entry.costHead.name,
    category: entry.costHead.category,
    shipmentId: entry.shipmentId,
    vendorName: entry.vendorName,
    invoiceNumber: entry.invoiceNumber,
    invoiceDate: entry.invoiceDate,
    currency: entry.currency,
    foreignAmount: entry.foreignAmount ? Number(entry.foreignAmount) : null,
    exchangeRate: entry.exchangeRate ? Number(entry.exchangeRate) : null,
    bdtAmount: Number(entry.bdtAmount),
    allocationMode: entry.allocationMode,
    allocationBasis: entry.allocationBasis,
    includeInLandedCost: entry.includeInLandedCost,
    attachmentUrl: entry.attachmentUrl,
    attachmentName: entry.attachmentName,
    remarks: entry.remarks,
    paymentMethod: entry.paymentMethod as "CREDIT" | "CASH_BANK_MFS" | null,
    creditPayeeName: entry.creditPayeeName,
    paymentAllocations: Array.isArray(entry.paymentAllocations) ? entry.paymentAllocations : [],
    paymentGlVoucherId: entry.paymentGlVoucherId,
    isLocked: entry.isLocked,
    createdAt: entry.createdAt,
    allocatedTotal: toNumber2(allocatedTotal),
    remainingAmount: toNumber2(toDecimal(entry.bdtAmount).sub(allocatedTotal)),
    isFullyAllocated: isZero(toDecimal(entry.bdtAmount).sub(allocatedTotal)),
    allocations: entry.allocations.map((allocation) => ({
      id: allocation.id,
      lcItemId: allocation.lcItemId,
      basisValue: Number(allocation.basisValue),
      basisPercentage: Number(allocation.basisPercentage),
      autoSuggestedAmount: Number(allocation.autoSuggestedAmount),
      manualAmount: allocation.manualAmount ? Number(allocation.manualAmount) : null,
      finalAmount: Number(allocation.finalAmount),
      isDirect: allocation.isDirect,
      isOverridden: allocation.isOverridden,
      overrideReason: allocation.overrideReason,
    })),
  };
}

@Injectable()
export class LcService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountsService) private readonly accountsService: AccountsService,
    @Inject(VouchersService) private readonly vouchersService: VouchersService,
    @Inject(PostingEngineService) private readonly postingEngine: PostingEngineService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(InventoryService) private readonly inventoryService?: InventoryService,
  ) {}

  private requireInventoryService() {
    if (!this.inventoryService) throw new Error("InventoryService is required for LC inventory valuation reconciliation");
    return this.inventoryService;
  }

  private async ensureWorkspaceAccess(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace || workspace.companyId !== currentUser.companyId || workspace.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException("Workspace access denied");
    }
    return workspace;
  }

  private async loadLc(currentUser: AuthenticatedRequestUser, lcId: string): Promise<LcMasterDetail> {
    const lc = await this.prisma.lcMaster.findFirst({
      where: { id: lcId, companyId: currentUser.companyId },
      include: LC_DETAIL_INCLUDE,
    });
    if (!lc) {
      throw new NotFoundException("LC not found");
    }
    return lc;
  }

  private async recordStatusChange(
    currentUser: AuthenticatedRequestUser,
    lcId: string,
    fromStatus: LcStatus | null,
    toStatus: LcStatus,
    reason?: string | null,
  ) {
    await this.prisma.lcStatusHistory.create({
      data: { lcId, fromStatus, toStatus, reason: reason ?? null, changedByUserId: currentUser.id },
    });
  }

  // ===========================================================================
  // Cost head configuration (Configuration > Cost Heads)
  // ===========================================================================

  /** Idempotently seeds the spec's default named cost heads for a workspace
   * the first time the LC module is touched — mirrors ensureFixedAssetChartSetup's
   * find-or-create-once pattern so a fresh tenant can use the module immediately. */
  async ensureDefaultCostHeads(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const existingCodes = new Set((await this.prisma.lcCostHead.findMany({ where: { workspaceId }, select: { code: true } })).map((head) => head.code));
    const missingSeeds = lcDefaultCostHeadSeeds.filter((seed) => !existingCodes.has(seed.code));
    if (missingSeeds.length) {
      await this.prisma.lcCostHead.createMany({
        data: missingSeeds.map((seed) => ({
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          workspaceId,
          name: seed.name,
          code: seed.code,
          category: seed.category,
          defaultAllocationMethod: seed.defaultAllocationMethod,
          fallbackAllocationMethod: seed.fallbackAllocationMethod ?? null,
          recommendedAllocationMode: seed.recommendedAllocationMode ?? null,
          includeInLandedCost: seed.includeInLandedCost ?? true,
          isSystem: true,
          sortOrder: (lcDefaultCostHeadSeeds.indexOf(seed) + 1) * 10,
        })),
      });
    }

    await Promise.all(lcDefaultCostHeadSeeds.map((seed, index) => this.prisma.lcCostHead.updateMany({
      where: { workspaceId, code: seed.code, isSystem: true },
      data: { sortOrder: (index + 1) * 10 },
    })));
  }

  async listCostHeads(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    await this.ensureWorkspaceAccess(currentUser, workspaceId);
    await this.ensureDefaultCostHeads(currentUser, workspaceId);
    const costHeads = await this.prisma.lcCostHead.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return costHeads.map((head) => ({
      id: head.id,
      name: head.name,
      code: head.code,
      category: head.category,
      defaultCurrency: head.defaultCurrency,
      defaultAllocationMethod: head.defaultAllocationMethod,
      fallbackAllocationMethod: head.fallbackAllocationMethod,
      recommendedAllocationMode: head.recommendedAllocationMode,
      includeInLandedCost: head.includeInLandedCost,
      manualOverrideAllowed: head.manualOverrideAllowed,
      glAccountId: head.glAccountId,
      isActive: head.isActive,
      isSystem: head.isSystem,
      sortOrder: head.sortOrder,
    }));
  }

  async createCostHead(currentUser: AuthenticatedRequestUser, dto: CreateLcCostHeadDto) {
    await this.ensureWorkspaceAccess(currentUser, dto.workspaceId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("Cost head name is required.");
    const code = (dto.code?.trim() || name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/(^_|_$)+/g, "").slice(0, 40) || "COST_HEAD";

    const existing = await this.prisma.lcCostHead.findFirst({ where: { workspaceId: dto.workspaceId, code } });
    if (existing) throw new BadRequestException(`A cost head with code "${code}" already exists.`);

    const siblingCount = await this.prisma.lcCostHead.count({ where: { workspaceId: dto.workspaceId } });
    const head = await this.prisma.lcCostHead.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: dto.workspaceId,
        name,
        code,
        category: dto.category,
        defaultCurrency: dto.defaultCurrency ?? "BDT",
        defaultAllocationMethod: dto.defaultAllocationMethod ?? "PURCHASE_VALUE",
        fallbackAllocationMethod: dto.fallbackAllocationMethod ?? null,
        includeInLandedCost: dto.includeInLandedCost ?? true,
        manualOverrideAllowed: dto.manualOverrideAllowed ?? true,
        glAccountId: dto.glAccountId ?? null,
        isSystem: false,
        sortOrder: (siblingCount + 1) * 10,
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: dto.workspaceId,
      userId: currentUser.id,
      action: "LC_COST_HEAD_CREATED",
      entityType: "LcCostHead",
      entityId: head.id,
      newValues: { name: head.name, category: head.category },
    });

    return head;
  }

  async updateCostHead(currentUser: AuthenticatedRequestUser, id: string, dto: UpdateLcCostHeadDto) {
    const existing = await this.prisma.lcCostHead.findFirst({ where: { id, companyId: currentUser.companyId } });
    if (!existing) throw new NotFoundException("Cost head not found");

    const updated = await this.prisma.lcCostHead.update({
      where: { id },
      data: {
        name: dto.name?.trim() || undefined,
        defaultAllocationMethod: dto.defaultAllocationMethod,
        fallbackAllocationMethod: dto.fallbackAllocationMethod,
        includeInLandedCost: dto.includeInLandedCost,
        manualOverrideAllowed: dto.manualOverrideAllowed,
        glAccountId: dto.glAccountId,
        isActive: dto.isActive,
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      action: "LC_COST_HEAD_UPDATED",
      entityType: "LcCostHead",
      entityId: id,
      oldValues: { name: existing.name, isActive: existing.isActive },
      newValues: { name: updated.name, isActive: updated.isActive },
    });

    return updated;
  }

  async deleteCostHead(currentUser: AuthenticatedRequestUser, id: string) {
    const existing = await this.prisma.lcCostHead.findFirst({ where: { id, companyId: currentUser.companyId } });
    if (!existing) throw new NotFoundException("Cost head not found");
    if (existing.isSystem) throw new BadRequestException("Default cost heads cannot be deleted. Deactivate it instead.");

    const usageCount = await this.prisma.lcCostEntry.count({ where: { costHeadId: id } });
    if (usageCount > 0) throw new BadRequestException(`This cost head has ${usageCount} cost entr${usageCount === 1 ? "y" : "ies"}. Deactivate instead of deleting.`);

    await this.prisma.lcCostHead.delete({ where: { id } });
    return { success: true, id };
  }

  // ===========================================================================
  // LC CRUD
  // ===========================================================================

  async list(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const lcs = await this.prisma.lcMaster.findMany({
      where: { companyId: currentUser.companyId, workspaceId: workspaceId || undefined },
      include: { items: true, costEntries: { include: { costHead: true } }, landedCost: true },
      orderBy: { createdAt: "desc" },
    });

    return lcs.map((lc) => {
      const purchaseCost = sumDecimals(lc.items.map((item) => item.totalPurchaseCostBdt));
      const importCost = sumDecimals(lc.costEntries.filter((entry) => entry.includeInLandedCost).map((entry) => entry.bdtAmount));
      const landedCost = lc.landedCost ? toDecimal(lc.landedCost.landedCostTotal) : purchaseCost.add(importCost);
      return {
        id: lc.id,
        lcNumber: lc.lcNumber,
        lcDate: lc.lcDate,
        supplierName: lc.supplierName,
        supplierCountry: lc.supplierCountry,
        currency: lc.currency,
        exchangeRate: Number(lc.exchangeRate),
        status: lc.status,
        itemCount: lc.items.length,
        costPostingCount: lc.costEntries.length,
        purchaseCost: toNumber2(purchaseCost),
        importCost: toNumber2(importCost),
        landedCost: toNumber2(landedCost),
        landedCostStatus: lc.landedCost?.status ?? "DRAFT",
      };
    });
  }

  async getDashboard(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const allLcs = await this.list(currentUser, workspaceId);
    const allDetailed = await this.prisma.lcMaster.findMany({
      where: { companyId: currentUser.companyId, workspaceId: workspaceId || undefined },
      include: { items: true, grns: true, costEntries: { include: { costHead: true } }, landedCost: true },
    });
    const lcs = allLcs.filter((lc) => lc.status !== "CLOSED" && lc.status !== "CANCELLED");
    const detailed = allDetailed.filter((lc) => lc.status !== "CLOSED" && lc.status !== "CANCELLED");

    const paymentDueRows = detailed.map((lc) => {
      const purchaseTotal = sumDecimals(lc.items.map((item) => item.totalPurchaseCostBdt));
      return { lc, due: round2(purchaseTotal.sub(lc.purchasePaidAmount)) };
    }).filter((row) => row.due.greaterThan(0));

    return {
      activeLc: lcs.filter((lc) => lc.status === "ACTIVE").length,
      totalLcValue: toNumber2(sumDecimals(lcs.map((lc) => lc.landedCost))),
      goodsInTransit: lcs.filter((lc) => ["ACTIVE", "COSTING_PENDING", "ALLOCATION_PENDING"].includes(lc.status)).length,
      pendingCustoms: detailed.filter((lc) => lc.status !== "FINALIZED" && !lc.costEntries.some((entry) => entry.costHead.category === "CUSTOMS")).length,
      pendingGrn: detailed.filter((lc) => lc.items.some((item) => Number(item.receivedQuantity) < Number(item.quantity))).length,
      pendingCosting: lcs.filter((lc) => lc.status === "COSTING_PENDING" || lc.status === "DRAFT").length,
      pendingAllocation: lcs.filter((lc) => lc.status === "ALLOCATION_PENDING").length,
      paymentDueLc: paymentDueRows.length,
      totalPaymentDue: toNumber2(sumDecimals(paymentDueRows.map((row) => row.due))),
      readyToFinalize: lcs.filter((lc) => lc.status === "READY_TO_FINALIZE").length,
      finalizedLc: lcs.filter((lc) => lc.status === "FINALIZED").length,
      totalImportCost: toNumber2(sumDecimals(lcs.map((lc) => lc.importCost))),
      recentLcs: lcs.slice(0, 10),
    };
  }

  async getById(currentUser: AuthenticatedRequestUser, id: string) {
    const lc = await this.loadLc(currentUser, id);
    return this.serializeDetail(lc);
  }

  private serializeDetail(lc: LcMasterDetail) {
    const purchaseCostTotal = sumDecimals(lc.items.map((item) => item.totalPurchaseCostBdt));
    const importCostTotal = sumDecimals(lc.costEntries.filter((entry) => entry.includeInLandedCost).map((entry) => entry.bdtAmount));

    return {
      id: lc.id,
      workspaceId: lc.workspaceId,
      lcNumber: lc.lcNumber,
      lcDate: lc.lcDate,
      supplierId: lc.supplierId,
      supplierName: lc.supplierName,
      supplierCountry: lc.supplierCountry,
      purchaseOrderRef: lc.purchaseOrderRef,
      piReference: lc.piReference,
      bankName: lc.bankName,
      bankBranch: lc.bankBranch,
      lcType: lc.lcType,
      currency: lc.currency,
      exchangeRate: Number(lc.exchangeRate),
      incoterm: lc.incoterm,
      originCountry: lc.originCountry,
      originPort: lc.originPort,
      destinationPort: lc.destinationPort,
      destinationWarehouseId: lc.destinationWarehouseId,
      destinationWarehouseName: lc.destinationWarehouse?.name ?? null,
      lastShipmentDate: lc.lastShipmentDate,
      expiryDate: lc.expiryDate,
      remarks: lc.remarks,
      purchasePaymentStatus: lc.purchasePaymentStatus,
      purchasePaidAmount: toNumber2(lc.purchasePaidAmount),
      purchasePayableAmount: Math.max(0, toNumber2(purchaseCostTotal.sub(lc.purchasePaidAmount))),
      paymentReference: lc.paymentReference,
      paymentAllocations: this.readPaymentAllocations(lc.paymentAllocations),
      status: lc.status,
      createdAt: lc.createdAt,
      items: lc.items.map(serializeItem),
      shipments: lc.shipments.map((shipment) => ({
        id: shipment.id,
        transportMode: shipment.transportMode,
        shipmentNumber: shipment.shipmentNumber,
        blAwbNumber: shipment.blAwbNumber,
        etd: shipment.etd,
        eta: shipment.eta,
        containerNumber: shipment.containerNumber,
        forwarderName: shipment.forwarderName,
        shippingLine: shipment.shippingLine,
        remarks: shipment.remarks,
        createdAt: shipment.createdAt,
      })),
      costEntries: lc.costEntries.map(serializeCostEntry),
      grns: lc.grns.map((grn) => ({
        id: grn.id,
        grnNumber: grn.grnNumber,
        receivedDate: grn.receivedDate,
        warehouseId: grn.warehouseId,
        warehouseName: grn.warehouse?.name ?? null,
        remarks: grn.remarks,
        createdAt: grn.createdAt,
        items: grn.items.map((item) => ({
          id: item.id,
          lcItemId: item.lcItemId,
          expectedQuantity: Number(item.expectedQuantity),
          receivedQuantity: Number(item.receivedQuantity),
          shortQuantity: Number(item.shortQuantity),
          excessQuantity: Number(item.excessQuantity),
          damagedQuantity: Number(item.damagedQuantity),
          rejectedQuantity: Number(item.rejectedQuantity),
        })),
      })),
      statusHistory: lc.statusHistory.map((entry) => ({
        id: entry.id,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        reason: entry.reason,
        changedAt: entry.changedAt,
      })),
      purchaseCostTotal: toNumber2(purchaseCostTotal),
      importCostTotal: toNumber2(importCostTotal),
      landedCostTotalPreview: toNumber2(purchaseCostTotal.add(importCostTotal)),
      landedCost: lc.landedCost
        ? {
            id: lc.landedCost.id,
            status: lc.landedCost.status,
            purchaseCostTotal: Number(lc.landedCost.purchaseCostTotal),
            importCostTotal: Number(lc.landedCost.importCostTotal),
            landedCostTotal: Number(lc.landedCost.landedCostTotal),
            allocationDifference: Number(lc.landedCost.allocationDifference),
            finalizedAt: lc.landedCost.finalizedAt,
            reopenedAt: lc.landedCost.reopenedAt,
            reopenReason: lc.landedCost.reopenReason,
            items: lc.landedCost.items.map((item) => ({
              lcItemId: item.lcItemId,
              purchaseCost: Number(item.purchaseCost),
              lcBankingCost: Number(item.lcBankingCost),
              originCost: Number(item.originCost),
              freightCost: Number(item.freightCost),
              insuranceCost: Number(item.insuranceCost),
              customsCost: Number(item.customsCost),
              taxCost: Number(item.taxCost),
              cnfCost: Number(item.cnfCost),
              portCost: Number(item.portCost),
              destinationTransportCost: Number(item.destinationTransportCost),
              localCost: Number(item.localCost),
              otherCost: Number(item.otherCost),
              totalLandedCost: Number(item.totalLandedCost),
              receivedQuantity: Number(item.receivedQuantity),
              unitLandedCost: Number(item.unitLandedCost),
            })),
          }
        : null,
    };
  }

  private readPaymentAllocations(value: Prisma.JsonValue | null): LcPaymentAllocation[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const row = entry as Record<string, unknown>;
      const accountId = String(row.accountId ?? "").trim();
      const ledger = String(row.ledger ?? "").trim();
      const amount = toNumber2(row.amount as Prisma.Decimal | number | string | null | undefined);
      if (!accountId || !ledger || !Number.isFinite(amount) || amount <= 0) return [];
      const reference = String(row.reference ?? "").trim();
      return [{ accountId, ledger, amount, ...(reference ? { reference } : {}) }];
    });
  }

  private readStringList(value: Prisma.JsonValue | null): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())) : [];
  }

  private async validatePaymentAllocations(
    currentUser: AuthenticatedRequestUser,
    rows: Array<{ accountId: string; amount: number; reference?: string }> | undefined,
    paidAmount: Prisma.Decimal,
  ): Promise<LcPaymentAllocation[]> {
    const input = (rows ?? []).filter((row) => Number(row.amount) > 0);
    const allocationTotal = sumDecimals(input.map((row) => round2(row.amount)));
    if (!allocationTotal.equals(paidAmount)) {
      throw new BadRequestException("Payment allocation total must exactly match the paid amount.");
    }
    if (paidAmount.equals(0)) return [];
    const accountIds = [...new Set(input.map((row) => row.accountId))];
    const moneyAccounts = await this.accountsService.getMoneyAccounts(currentUser);
    const selectedAccounts = moneyAccounts.filter((account) => accountIds.includes(account.id));
    if (selectedAccounts.length !== accountIds.length) {
      throw new BadRequestException("LC payments can only use Cash, Bank, or MFS ledgers under Cash & Cash Equivalents.");
    }
    const accountById = new Map(selectedAccounts.map((account) => [account.id, account]));
    return input.map((row) => ({
      accountId: row.accountId,
      ledger: accountById.get(row.accountId)!.name,
      amount: toNumber2(toDecimal(row.amount)),
      ...(row.reference?.trim() ? { reference: row.reference.trim() } : {}),
    }));
  }

  /** Posts a paid LC cost immediately so the selected Cash/Bank/MFS balance is
   * reduced when the cost is recorded, rather than waiting for landed-cost
   * finalization. The voucher id makes the operation idempotent and prevents
   * the same payment from being credited again during finalization. */
  private async postCostPaymentAccounting(
    currentUser: AuthenticatedRequestUser,
    lc: { workspaceId: string; lcNumber: string; supplierName: string },
    entry: LcCostEntryRow,
    revisionKey?: string,
  ) {
    const existingVoucherId = (entry as LcCostEntryRow & { paymentGlVoucherId?: string | null }).paymentGlVoucherId;
    if (entry.paymentMethod !== "CASH_BANK_MFS" || existingVoucherId) return existingVoucherId ?? null;

    const paymentRows = this.readPaymentAllocations(entry.paymentAllocations);
    const paidAmount = sumDecimals(paymentRows.map((row) => row.amount));
    if (paidAmount.equals(0)) return null;

    const { importCostPayableLedgerId, importCostPayableLedgerName, goodsInTransitLedgerId, goodsInTransitLedgerName } = await this.ensureLcChartSetup(currentUser);
    const settlesLcPayable = entry.costHead.code === "LC_PAYMENT" || entry.costHead.code === "TT_PAYMENT";
    const debitAccountId = entry.includeInLandedCost
      ? goodsInTransitLedgerId
      : settlesLcPayable
        ? importCostPayableLedgerId
        : entry.costHead.glAccountId;
    const debitLedger = entry.includeInLandedCost
      ? goodsInTransitLedgerName
      : settlesLcPayable
        ? importCostPayableLedgerName
        : entry.costHead.name;
    if (!debitAccountId) {
      throw new BadRequestException(`Cost head "${entry.costHead.name}" needs a GL account before its Cash/Bank/MFS payment can be posted.`);
    }
    const voucher = await this.vouchersService.create(currentUser, {
      workspaceId: lc.workspaceId,
      voucherType: "journal",
      voucherNumber: `LC-COST-${entry.id}${revisionKey ? `-${revisionKey}` : ""}`,
      idempotencyKey: `lc-cost-payment:${entry.id}${revisionKey ? `:${revisionKey}` : ""}`,
      voucherDate: entry.invoiceDate?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      partyName: entry.vendorName || lc.supplierName,
      reference: entry.invoiceNumber || lc.lcNumber,
      narration: `LC cost paid - ${entry.costHead.name} - ${lc.lcNumber}`,
      status: "draft",
      totalAmount: toNumber2(paidAmount),
      lines: [
        { id: "lc-cost-debit", accountId: debitAccountId, ledger: debitLedger, description: `${entry.costHead.name} - ${lc.lcNumber}`, debit: toNumber2(paidAmount), credit: 0 },
        ...paymentRows.map((row, index) => ({ id: `lc-cost-payment-${index}`, accountId: row.accountId, ledger: row.ledger, description: row.reference ? `${entry.costHead.name} - ${row.reference}` : `${entry.costHead.name} paid`, debit: 0, credit: row.amount })),
      ],
    });
    await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.PENDING);
    await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.POSTED);
    await this.prisma.lcCostEntry.update({ where: { id: entry.id }, data: { paymentGlVoucherId: voucher.id } });
    return voucher.id;
  }

  private async postInitialPurchaseAccounting(
    currentUser: AuthenticatedRequestUser,
    lc: { id: string; workspaceId: string; lcNumber: string; lcDate: Date; supplierName: string },
    purchaseCostTotal: Prisma.Decimal,
    paymentAllocations: LcPaymentAllocation[],
  ) {
    const { goodsInTransitLedgerId, goodsInTransitLedgerName, importCostPayableLedgerId, importCostPayableLedgerName } = await this.ensureLcChartSetup(currentUser);
    const paidAmount = sumDecimals(paymentAllocations.map((row) => toDecimal(row.amount)));
    const payableAmount = round2(purchaseCostTotal.sub(paidAmount));
    const lines = [
      {
        id: "lc-purchase-inventory",
        accountId: goodsInTransitLedgerId,
        ledger: goodsInTransitLedgerName,
        description: `LC purchase - ${lc.lcNumber}`,
        debit: toNumber2(purchaseCostTotal),
        credit: 0,
      },
      ...paymentAllocations.map((row, index) => ({
        id: `lc-payment-${index}`,
        accountId: row.accountId,
        ledger: row.ledger,
        description: row.reference ? `LC ${lc.lcNumber} - ${row.reference}` : `LC payment - ${lc.lcNumber}`,
        debit: 0,
        credit: row.amount,
      })),
      ...(payableAmount.greaterThan(0) ? [{
        id: "lc-purchase-payable",
        accountId: importCostPayableLedgerId,
        ledger: importCostPayableLedgerName,
        description: `LC purchase payable - ${lc.lcNumber}`,
        debit: 0,
        credit: toNumber2(payableAmount),
      }] : []),
    ];
    const voucher = await this.vouchersService.create(currentUser, {
      workspaceId: lc.workspaceId,
      voucherType: "journal",
      voucherNumber: `LC-PUR-${lc.id}`,
      idempotencyKey: `lc-purchase:${lc.id}`,
      voucherDate: lc.lcDate.toISOString().slice(0, 10),
      partyName: lc.supplierName,
      reference: lc.lcNumber,
      narration: `LC purchase and payment position for ${lc.lcNumber}`,
      status: "draft",
      totalAmount: toNumber2(purchaseCostTotal),
      lines,
    });
    await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.PENDING);
    await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.POSTED);
    await this.prisma.lcMaster.update({ where: { id: lc.id }, data: { purchaseGlVoucherId: voucher.id } });
  }

  private async postAdditionalPurchasePayments(
    currentUser: AuthenticatedRequestUser,
    lc: { workspaceId: string; lcNumber: string; supplierName: string },
    previousRows: LcPaymentAllocation[],
    nextRows: LcPaymentAllocation[],
  ) {
    const previousByAccount = new Map<string, number>();
    for (const row of previousRows) {
      previousByAccount.set(row.accountId, toNumber2(sumDecimals([previousByAccount.get(row.accountId) ?? 0, row.amount])));
    }
    const nextByAccount = new Map<string, LcPaymentAllocation>();
    for (const row of nextRows) {
      const current = nextByAccount.get(row.accountId);
      nextByAccount.set(row.accountId, {
        ...row,
        amount: toNumber2(sumDecimals([current?.amount ?? 0, row.amount])),
      });
    }
    const deltas = [...nextByAccount.values()].map((row) => ({ ...row, amount: round2(toDecimal(row.amount).sub(previousByAccount.get(row.accountId) ?? 0)) }));
    if (deltas.some((row) => row.amount.lessThan(0))) {
      throw new BadRequestException("Previously posted LC payments cannot be reduced or moved to another ledger.");
    }
    const positiveDeltas = deltas.filter((row) => row.amount.greaterThan(0));
    const total = sumDecimals(positiveDeltas.map((row) => row.amount));
    if (total.equals(0)) return null;
    const { importCostPayableLedgerId, importCostPayableLedgerName } = await this.ensureLcChartSetup(currentUser);
    const voucher = await this.vouchersService.create(currentUser, {
      workspaceId: lc.workspaceId,
      voucherType: "payment",
      voucherDate: new Date().toISOString().slice(0, 10),
      partyName: lc.supplierName,
      reference: lc.lcNumber,
      narration: `LC payable settlement for ${lc.lcNumber}`,
      status: "draft",
      totalAmount: toNumber2(total),
      lines: [
        { id: "lc-payable-settlement", accountId: importCostPayableLedgerId, ledger: importCostPayableLedgerName, description: `LC payable settled - ${lc.lcNumber}`, debit: toNumber2(total), credit: 0 },
        ...positiveDeltas.map((row, index) => ({ id: `lc-settlement-source-${index}`, accountId: row.accountId, ledger: row.ledger, description: row.reference ? `LC ${lc.lcNumber} - ${row.reference}` : `LC payment - ${lc.lcNumber}`, debit: 0, credit: toNumber2(row.amount) })),
      ],
    });
    await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.PENDING);
    await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.POSTED);
    return voucher.id;
  }

  async create(currentUser: AuthenticatedRequestUser, dto: CreateLcDto) {
    await this.ensureWorkspaceAccess(currentUser, dto.workspaceId);
    await this.ensureDefaultCostHeads(currentUser, dto.workspaceId);

    if (!dto.items?.length) throw new BadRequestException("Add at least one product to the LC.");

    const lcNumber = dto.lcNumber.trim();
    const existing = await this.prisma.lcMaster.findFirst({ where: { workspaceId: dto.workspaceId, lcNumber } });
    if (existing) throw new BadRequestException(`LC number "${lcNumber}" already exists.`);

    if (dto.supplierId) {
      const supplier = await this.prisma.party.findFirst({ where: { id: dto.supplierId, workspaceId: dto.workspaceId, type: PartyType.SUPPLIER } });
      if (!supplier) throw new BadRequestException("Selected supplier was not found.");
    }

    const lcExchangeRate = toDecimal(dto.exchangeRate);
    if (lcExchangeRate.lessThanOrEqualTo(0)) throw new BadRequestException("Exchange rate must be greater than zero.");
    const itemData = dto.items.map((item, index) => this.buildItemData(item, lcExchangeRate, index));
    const purchaseCostTotal = sumDecimals(itemData.map((item) => item.totalPurchaseCostBdt));
    const purchasePaymentStatus = dto.purchasePaymentStatus ?? "UNPAID";
    const purchasePaidAmount = round2(dto.purchasePaidAmount ?? (purchasePaymentStatus === "PAID" ? purchaseCostTotal : 0));
    if (purchasePaidAmount.lessThan(0) || purchasePaidAmount.greaterThan(purchaseCostTotal)) {
      throw new BadRequestException("Paid amount must be between zero and the total purchase value.");
    }
    if (purchasePaymentStatus === "UNPAID" && !purchasePaidAmount.equals(0)) {
      throw new BadRequestException("An unpaid LC cannot have a paid amount.");
    }
    if (purchasePaymentStatus === "PARTIAL" && (purchasePaidAmount.lessThanOrEqualTo(0) || purchasePaidAmount.greaterThanOrEqualTo(purchaseCostTotal))) {
      throw new BadRequestException("A partially paid LC needs a paid amount greater than zero and less than the purchase value.");
    }
    if (purchasePaymentStatus === "PAID" && !purchasePaidAmount.equals(purchaseCostTotal)) {
      throw new BadRequestException("A paid LC must have its full purchase value marked as paid.");
    }
    const paymentAllocations = await this.validatePaymentAllocations(currentUser, dto.paymentAllocations, purchasePaidAmount);

    const lc = await this.prisma.lcMaster.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: dto.workspaceId,
        lcNumber,
        lcDate: toDateOnly(dto.lcDate),
        supplierId: dto.supplierId ?? null,
        supplierName: dto.supplierName.trim(),
        supplierCountry: dto.supplierCountry?.trim() || null,
        purchaseOrderRef: dto.purchaseOrderRef?.trim() || null,
        piReference: dto.piReference?.trim() || null,
        bankName: dto.bankName?.trim() || null,
        bankBranch: dto.bankBranch?.trim() || null,
        lcType: dto.lcType?.trim() || null,
        currency: dto.currency?.trim() || "USD",
        exchangeRate: lcExchangeRate,
        incoterm: dto.incoterm?.trim() || null,
        originCountry: dto.originCountry?.trim() || null,
        originPort: dto.originPort?.trim() || null,
        destinationPort: dto.destinationPort?.trim() || null,
        destinationWarehouseId: dto.destinationWarehouseId || null,
        lastShipmentDate: dto.lastShipmentDate ? toDateOnly(dto.lastShipmentDate) : null,
        expiryDate: dto.expiryDate ? toDateOnly(dto.expiryDate) : null,
        remarks: dto.remarks?.trim() || null,
        purchasePaymentStatus,
        purchasePaidAmount,
        paymentReference: dto.paymentReference?.trim() || null,
        paymentAllocations: paymentAllocations as unknown as Prisma.InputJsonValue,
        status: LcStatus.DRAFT,
        createdByUserId: currentUser.id,
        items: {
          create: itemData,
        },
      },
    });

    await this.postInitialPurchaseAccounting(currentUser, lc, purchaseCostTotal, paymentAllocations);

    await this.recordStatusChange(currentUser, lc.id, null, LcStatus.DRAFT);
    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: dto.workspaceId,
      userId: currentUser.id,
      action: "LC_CREATED",
      entityType: "LcMaster",
      entityId: lc.id,
      newValues: { lcNumber: lc.lcNumber, supplierName: lc.supplierName, itemCount: dto.items.length },
    });

    return this.getById(currentUser, lc.id);
  }

  private buildItemData(item: CreateLcDto["items"][number], lcExchangeRate: Prisma.Decimal, sortOrder: number) {
    const quantity = toDecimal(item.quantity);
    const usdUnitPrice = toDecimal(item.usdUnitPrice);
    const exchangeRate = toDecimal(item.usdUnitPrice !== undefined ? lcExchangeRate : lcExchangeRate);
    const calculatedBdtUnitPrice = round2(usdUnitPrice.mul(exchangeRate));
    const acceptedBdtUnitPrice = item.acceptedBdtUnitPrice !== undefined && item.acceptedBdtUnitPrice !== null ? round2(item.acceptedBdtUnitPrice) : null;
    const effectiveUnitPrice = acceptedBdtUnitPrice ?? calculatedBdtUnitPrice;
    const totalPurchaseCostBdt = round2(effectiveUnitPrice.mul(quantity));

    return {
      inventoryItemId: item.inventoryItemId || null,
      productName: item.productName.trim(),
      description: item.description?.trim() || null,
      unit: item.unit?.trim() || "pcs",
      quantity,
      usdUnitPrice,
      exchangeRate,
      calculatedBdtUnitPrice,
      acceptedBdtUnitPrice,
      totalPurchaseCostBdt,
      weight: item.weight !== undefined && item.weight !== null ? toDecimal(item.weight) : null,
      cbm: item.cbm !== undefined && item.cbm !== null ? toDecimal(item.cbm) : null,
      hsCode: item.hsCode?.trim() || null,
      sortOrder,
    };
  }

  async update(currentUser: AuthenticatedRequestUser, id: string, dto: UpdateLcDto) {
    const lc = await this.loadLc(currentUser, id);
    if (lc.status === LcStatus.FINALIZED || lc.status === LcStatus.CLOSED) throw new BadRequestException("Finalized or closed LCs cannot be edited.");
    if (dto.items !== undefined && dto.paymentAllocations !== undefined) {
      throw new BadRequestException("Save product changes first, then adjust payment allocations separately.");
    }

    let newItemData: ReturnType<LcService["buildItemData"]>[] | null = null;
    if (dto.items !== undefined) {
      if (!dto.items.length) throw new BadRequestException("Add at least one product to the LC.");
      if (lc.grns.length > 0) {
        throw new BadRequestException("Products cannot be edited after a GRN has been recorded for this LC.");
      }
      const itemExchangeRate = dto.exchangeRate !== undefined ? toDecimal(dto.exchangeRate) : lc.exchangeRate;
      if (itemExchangeRate.lessThanOrEqualTo(0)) throw new BadRequestException("Exchange rate must be greater than zero.");
      newItemData = dto.items.map((item, index) => this.buildItemData(item, itemExchangeRate, index));
    }
    const itemsChanged = newItemData !== null;
    const purchaseCostTotal = itemsChanged ? sumDecimals(newItemData!.map((item) => item.totalPurchaseCostBdt)) : sumDecimals(lc.items.map((item) => item.totalPurchaseCostBdt));
    const purchasePaymentStatus = dto.purchasePaymentStatus ?? lc.purchasePaymentStatus;
    const previousPurchasePaidAmount = round2(lc.purchasePaidAmount);
    const purchasePaidAmount = dto.purchasePaidAmount !== undefined ? round2(dto.purchasePaidAmount) : previousPurchasePaidAmount;
    if (purchasePaidAmount.lessThan(0) || purchasePaidAmount.greaterThan(purchaseCostTotal)) {
      throw new BadRequestException("Paid amount must be between zero and the total purchase value.");
    }
    if (purchasePaymentStatus === "UNPAID" && !purchasePaidAmount.equals(0)) {
      throw new BadRequestException("An unpaid LC cannot have a paid amount.");
    }
    if (purchasePaymentStatus === "PARTIAL" && (purchasePaidAmount.lessThanOrEqualTo(0) || purchasePaidAmount.greaterThanOrEqualTo(purchaseCostTotal))) {
      throw new BadRequestException("A partially paid LC needs a paid amount greater than zero and less than the purchase value.");
    }
    if (purchasePaymentStatus === "PAID" && !purchasePaidAmount.equals(purchaseCostTotal)) {
      throw new BadRequestException("A paid LC must have its full purchase value marked as paid.");
    }
    const paymentReference = dto.paymentReference !== undefined ? dto.paymentReference.trim() : lc.paymentReference;
    const previousPaymentAllocations = this.readPaymentAllocations(lc.paymentAllocations);
    let nextPaymentAllocations = previousPaymentAllocations;
    if (dto.paymentAllocations !== undefined) {
      if (purchasePaidAmount.lessThan(previousPurchasePaidAmount)) {
        throw new BadRequestException("Previously posted LC payments cannot be reduced.");
      }
      nextPaymentAllocations = await this.validatePaymentAllocations(currentUser, dto.paymentAllocations, purchasePaidAmount);
      const paymentVoucherId = await this.postAdditionalPurchasePayments(currentUser, lc, previousPaymentAllocations, nextPaymentAllocations);
      if (paymentVoucherId) {
        await this.prisma.lcMaster.update({
          where: { id },
          data: { paymentGlVoucherIds: [...this.readStringList(lc.paymentGlVoucherIds), paymentVoucherId] as Prisma.InputJsonValue },
        });
      }
    } else if (!purchasePaidAmount.equals(previousPurchasePaidAmount)) {
      throw new BadRequestException("Changing the paid amount requires payment ledger allocations.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (itemsChanged && newItemData) {
        await tx.lcItem.deleteMany({ where: { lcId: id } });
        await tx.lcItem.createMany({ data: newItemData.map((item) => ({ ...item, lcId: id })) });
      }
      return tx.lcMaster.update({
        where: { id },
        data: {
          lcDate: dto.lcDate ? toDateOnly(dto.lcDate) : undefined,
          supplierId: dto.supplierId,
          supplierName: dto.supplierName?.trim(),
          supplierCountry: dto.supplierCountry?.trim(),
          purchaseOrderRef: dto.purchaseOrderRef?.trim(),
          piReference: dto.piReference?.trim(),
          bankName: dto.bankName?.trim(),
          bankBranch: dto.bankBranch?.trim(),
          lcType: dto.lcType?.trim(),
          exchangeRate: dto.exchangeRate !== undefined ? toDecimal(dto.exchangeRate) : undefined,
          incoterm: dto.incoterm?.trim(),
          originCountry: dto.originCountry?.trim(),
          originPort: dto.originPort?.trim(),
          destinationPort: dto.destinationPort?.trim(),
          destinationWarehouseId: dto.destinationWarehouseId,
          lastShipmentDate: dto.lastShipmentDate ? toDateOnly(dto.lastShipmentDate) : undefined,
          expiryDate: dto.expiryDate ? toDateOnly(dto.expiryDate) : undefined,
          remarks: dto.remarks?.trim(),
          purchasePaymentStatus,
          purchasePaidAmount,
          paymentReference: paymentReference || null,
          paymentAllocations: dto.paymentAllocations !== undefined ? nextPaymentAllocations as unknown as Prisma.InputJsonValue : undefined,
        },
      });
    });

    if (itemsChanged) {
      // The purchase GL voucher posted at creation carries the old total —
      // reverse it and post a fresh one for the new total, same pattern
      // finalizeLandedCost/reopenLandedCost already use for GL corrections.
      if (lc.purchaseGlVoucherId) {
        await this.postingEngine.reverseVoucher(currentUser, lc.purchaseGlVoucherId, `LC ${lc.lcNumber} products edited`);
      }
      await this.postInitialPurchaseAccounting(
        currentUser,
        { id, workspaceId: lc.workspaceId, lcNumber: updated.lcNumber, lcDate: updated.lcDate, supplierName: updated.supplierName },
        purchaseCostTotal,
        previousPaymentAllocations,
      );

      // Cost entries left in AUTO mode need their allocation re-split across
      // the new item set so they stay reconciled; manual/hybrid/direct-product
      // entries are left untouched (their rows for removed items already
      // cascade-deleted with the items above).
      const refreshedLc = await this.loadLc(currentUser, id);
      for (const entry of refreshedLc.costEntries) {
        if (entry.allocationMode === LcAllocationMode.AUTO) {
          await this.applyAllocation(refreshedLc.items, entry.id, entry.bdtAmount, {
            allocationMode: LcAllocationMode.AUTO,
            allocationBasis: entry.allocationBasis ?? "PURCHASE_VALUE",
            rows: refreshedLc.items.map((item) => ({ lcItemId: item.id })),
          });
        }
      }
    }

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      action: "LC_UPDATED",
      entityType: "LcMaster",
      entityId: id,
      oldValues: { supplierName: lc.supplierName, exchangeRate: Number(lc.exchangeRate) },
      newValues: { supplierName: updated.supplierName, exchangeRate: Number(updated.exchangeRate) },
    });

    return this.getById(currentUser, id);
  }

  async setStatus(currentUser: AuthenticatedRequestUser, id: string, dto: SetLcStatusDto) {
    const lc = await this.loadLc(currentUser, id);
    if (lc.status === dto.status) return this.serializeDetail(lc);
    if (lc.status === LcStatus.CLOSED) {
      throw new BadRequestException("Closed LCs cannot be changed.");
    }
    if (lc.status === LcStatus.FINALIZED && dto.status !== LcStatus.CLOSED) {
      throw new BadRequestException("A finalized LC can only move to Closed. Use Reopen to make further changes.");
    }
    if (dto.status === LcStatus.CLOSED) {
      if (lc.status !== LcStatus.FINALIZED || lc.landedCost?.status !== LcLandedCostStatus.FINALIZED) {
        throw new BadRequestException("Finalize the landed cost before closing this LC.");
      }
      if (!isZero(lc.landedCost.allocationDifference)) {
        throw new BadRequestException("Allocation difference must be zero before closing this LC.");
      }
      const unpostedItems = lc.items.filter((item) => !item.inventoryPosting);
      if (unpostedItems.length) {
        throw new BadRequestException(`Post every LC item to inventory before closing. ${unpostedItems.length} item(s) remain.`);
      }
    }

    await this.prisma.lcMaster.update({ where: { id }, data: { status: dto.status } });
    await this.recordStatusChange(currentUser, id, lc.status, dto.status, dto.reason);
    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      action: "LC_STATUS_CHANGED",
      entityType: "LcMaster",
      entityId: id,
      oldValues: { status: lc.status },
      newValues: { status: dto.status, reason: dto.reason ?? null },
    });

    return this.getById(currentUser, id);
  }

  /**
   * Deletes an LC and everything under it (items, shipments, cost entries,
   * allocations, GRNs, landed-cost snapshot, status history — all cascade via
   * the schema's onDelete: Cascade). If the landed cost was already finalized,
   * the GL journal entry is reversed first so the books stay balanced —
   * mirrors FixedAssetsService.delete()'s "auto-reverse posted voucher, then
   * hard-delete" pattern rather than blocking the delete outright.
   */
  async delete(currentUser: AuthenticatedRequestUser, lcId: string) {
    const lc = await this.loadLc(currentUser, lcId);

    if (lc.costEntries.length > 0) {
      throw new BadRequestException(`This LC has ${lc.costEntries.length} cost posting${lc.costEntries.length === 1 ? "" : "s"}. Delete those cost postings before deleting the LC.`);
    }

    if (lc.landedCost?.status === LcLandedCostStatus.FINALIZED && lc.landedCost.glVoucherId) {
      await this.postingEngine.reverseVoucher(currentUser, lc.landedCost.glVoucherId, `LC ${lc.lcNumber} deleted`);
    }
    for (const voucherId of [...this.readStringList(lc.paymentGlVoucherIds)].reverse()) {
      await this.postingEngine.reverseVoucher(currentUser, voucherId, `LC ${lc.lcNumber} deleted`);
    }
    if (lc.purchaseGlVoucherId) {
      await this.postingEngine.reverseVoucher(currentUser, lc.purchaseGlVoucherId, `LC ${lc.lcNumber} deleted`);
    }

    await this.prisma.lcMaster.delete({ where: { id: lcId } });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: lc.workspaceId,
      userId: currentUser.id,
      action: "LC_DELETED",
      entityType: "LcMaster",
      entityId: lcId,
      oldValues: { lcNumber: lc.lcNumber, supplierName: lc.supplierName, status: lc.status },
    });

    return { success: true, id: lcId };
  }

  // ===========================================================================
  // Shipments
  // ===========================================================================

  async addShipment(currentUser: AuthenticatedRequestUser, lcId: string, dto: CreateLcShipmentDto) {
    const lc = await this.loadLc(currentUser, lcId);
    if (lc.status === LcStatus.FINALIZED || lc.status === LcStatus.CLOSED) throw new BadRequestException("Finalized or closed LCs cannot be edited.");

    await this.prisma.lcShipment.create({
      data: {
        lcId,
        transportMode: dto.transportMode ?? "SEA",
        shipmentNumber: dto.shipmentNumber?.trim() || null,
        blAwbNumber: dto.blAwbNumber?.trim() || null,
        etd: dto.etd ? toDateOnly(dto.etd) : null,
        eta: dto.eta ? toDateOnly(dto.eta) : null,
        containerNumber: dto.containerNumber?.trim() || null,
        forwarderName: dto.forwarderName?.trim() || null,
        shippingLine: dto.shippingLine?.trim() || null,
        remarks: dto.remarks?.trim() || null,
      },
    });
    return this.getById(currentUser, lcId);
  }

  async deleteShipment(currentUser: AuthenticatedRequestUser, lcId: string, shipmentId: string) {
    const lc = await this.loadLc(currentUser, lcId);
    if (lc.status === LcStatus.FINALIZED || lc.status === LcStatus.CLOSED) throw new BadRequestException("Finalized or closed LCs cannot be edited.");
    const shipment = lc.shipments.find((entry) => entry.id === shipmentId);
    if (!shipment) throw new NotFoundException("Shipment not found");
    await this.prisma.lcShipment.delete({ where: { id: shipmentId } });
    return this.getById(currentUser, lcId);
  }

  // ===========================================================================
  // Cost entries + allocation engine
  // ===========================================================================

  async createCostEntry(currentUser: AuthenticatedRequestUser, lcId: string, dto: CreateLcCostEntryDto) {
    const lc = await this.loadLc(currentUser, lcId);
    if (lc.status === LcStatus.FINALIZED || lc.status === LcStatus.CLOSED) throw new BadRequestException("Finalized or closed LCs cannot be edited.");
    if (!lc.items.length) throw new BadRequestException("Add products to the LC before entering costs.");

    const costHead = await this.prisma.lcCostHead.findFirst({ where: { id: dto.costHeadId, workspaceId: lc.workspaceId } });
    if (!costHead) throw new BadRequestException("Selected cost head was not found.");

    const currency = dto.currency?.trim() || costHead.defaultCurrency;
    let bdtAmount: Prisma.Decimal;
    let foreignAmount: Prisma.Decimal | null = null;
    let exchangeRate: Prisma.Decimal | null = null;

    if (currency.toUpperCase() === "BDT") {
      if (dto.bdtAmount === undefined) throw new BadRequestException("Enter the BDT amount for this cost entry.");
      bdtAmount = round2(dto.bdtAmount);
    } else {
      if (dto.foreignAmount === undefined || dto.exchangeRate === undefined) {
        throw new BadRequestException("Enter the foreign amount and exchange rate for this cost entry.");
      }
      foreignAmount = roundMoneyDecimal(dto.foreignAmount);
      exchangeRate = toDecimal(dto.exchangeRate);
      const calculated = round2(foreignAmount.mul(exchangeRate));
      bdtAmount = dto.bdtAmount !== undefined ? round2(dto.bdtAmount) : calculated;
    }
    if (bdtAmount.lessThan(0)) throw new BadRequestException("Cost amount cannot be negative.");

    const allocationMode = (dto.allocationMode as LcAllocationMode | undefined) ?? costHead.recommendedAllocationMode ?? LcAllocationMode.AUTO;
    const allocationBasis = dto.allocationBasis ?? costHead.defaultAllocationMethod;
    if (!dto.paymentMethod) throw new BadRequestException("Select Credit or Cash/Bank/MFS as the payment option.");
    const creditPayeeName = dto.creditPayeeName?.trim() || null;
    if (dto.paymentMethod === "CREDIT" && !creditPayeeName) throw new BadRequestException("Enter who will receive the credit payment.");
    const costPaymentAllocations = dto.paymentMethod === "CASH_BANK_MFS"
      ? await this.validatePaymentAllocations(currentUser, dto.paymentAllocations, bdtAmount)
      : [];

    // A voucher-posting failure can occur after the cost row was persisted
    // (for example an old duplicate voucher-number rule). Retrying the same
    // form must finish that payment instead of creating a duplicate cost.
    if (dto.paymentMethod === "CASH_BANK_MFS") {
      const recoverableEntry = [...lc.costEntries].reverse().find((candidate) => {
        const paymentVoucherId = (candidate as LcCostEntryRow & { paymentGlVoucherId?: string | null }).paymentGlVoucherId;
        const savedRows = this.readPaymentAllocations(candidate.paymentAllocations);
        return !paymentVoucherId
          && candidate.costHeadId === dto.costHeadId
          && round2(candidate.bdtAmount).equals(bdtAmount)
          && candidate.paymentMethod === "CASH_BANK_MFS"
          && savedRows.length === costPaymentAllocations.length
          && savedRows.every((saved) => costPaymentAllocations.some(
            (input) => input.accountId === saved.accountId && round2(input.amount).equals(round2(saved.amount)),
          ));
      });
      if (recoverableEntry) {
        await this.postCostPaymentAccounting(currentUser, lc, recoverableEntry);
        return this.getById(currentUser, lcId);
      }
    }

    const entry = await this.prisma.lcCostEntry.create({
      data: {
        lcId,
        costHeadId: dto.costHeadId,
        shipmentId: dto.shipmentId || null,
        vendorName: dto.vendorName?.trim() || null,
        invoiceNumber: dto.invoiceNumber?.trim() || null,
        invoiceDate: dto.invoiceDate ? toDateOnly(dto.invoiceDate) : null,
        currency,
        foreignAmount,
        exchangeRate,
        bdtAmount,
        allocationMode,
        allocationBasis,
        includeInLandedCost: dto.includeInLandedCost ?? costHead.includeInLandedCost,
        attachmentUrl: dto.attachmentUrl?.trim() || null,
        attachmentName: dto.attachmentName?.trim() || null,
        remarks: dto.remarks?.trim() || null,
        paymentMethod: dto.paymentMethod,
        creditPayeeName,
        paymentAllocations: costPaymentAllocations as unknown as Prisma.InputJsonValue,
        createdByUserId: currentUser.id,
      },
    });

    // Allocation remains a preview until the user explicitly clicks
    // "Save Allocation". This keeps cost/payment posting and product-wise
    // allocation as two deliberate steps instead of silently persisting AUTO.

    if (dto.paymentMethod === "CASH_BANK_MFS") {
      const payableEntry = await this.prisma.lcCostEntry.findUniqueOrThrow({ where: { id: entry.id }, include: { costHead: true, shipment: true, allocations: true } });
      await this.postCostPaymentAccounting(currentUser, lc, payableEntry as LcCostEntryRow);
    }

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: lc.workspaceId,
      userId: currentUser.id,
      action: "LC_COST_ENTRY_CREATED",
      entityType: "LcCostEntry",
      entityId: entry.id,
      newValues: { costHead: costHead.name, bdtAmount: toNumber2(bdtAmount) },
    });

    return this.getById(currentUser, lcId);
  }

  async updateCostEntry(currentUser: AuthenticatedRequestUser, lcId: string, costEntryId: string, dto: UpdateLcCostEntryDto) {
    const lc = await this.loadLc(currentUser, lcId);
    const entry = lc.costEntries.find((row) => row.id === costEntryId);
    if (!entry) throw new NotFoundException("Cost entry not found");
    if (entry.isLocked) throw new BadRequestException("This cost entry is locked by a finalized landed cost. Reopen it first.");
    const paymentGlVoucherId = (entry as LcCostEntryRow & { paymentGlVoucherId?: string | null }).paymentGlVoucherId;

    let bdtAmount = entry.bdtAmount;
    let foreignAmount = entry.foreignAmount ? roundMoneyDecimal(entry.foreignAmount) : null;
    let exchangeRate = entry.exchangeRate;
    if (dto.foreignAmount !== undefined) foreignAmount = roundMoneyDecimal(dto.foreignAmount);
    if (dto.exchangeRate !== undefined) exchangeRate = toDecimal(dto.exchangeRate);
    if (dto.bdtAmount !== undefined) {
      bdtAmount = round2(dto.bdtAmount);
    } else if ((dto.foreignAmount !== undefined || dto.exchangeRate !== undefined) && foreignAmount && exchangeRate) {
      bdtAmount = round2(foreignAmount.mul(exchangeRate));
    }
    const paymentMethod = dto.paymentMethod ?? entry.paymentMethod;
    if (paymentMethod !== "CREDIT" && paymentMethod !== "CASH_BANK_MFS") throw new BadRequestException("Select Credit or Cash/Bank/MFS as the payment option.");
    const creditPayeeName = dto.creditPayeeName !== undefined ? dto.creditPayeeName.trim() : entry.creditPayeeName;
    if (paymentMethod === "CREDIT" && !creditPayeeName) throw new BadRequestException("Enter who will receive the credit payment.");
    const costPaymentAllocations = paymentMethod === "CASH_BANK_MFS"
      ? await this.validatePaymentAllocations(currentUser, dto.paymentAllocations ?? this.readPaymentAllocations(entry.paymentAllocations), bdtAmount)
      : [];

    if (paymentGlVoucherId) {
      await this.postingEngine.reverseVoucher(currentUser, paymentGlVoucherId, `LC ${lc.lcNumber} cost payment corrected: ${entry.costHead.name}`);
    }

    await this.prisma.lcCostEntry.update({
      where: { id: costEntryId },
      data: {
        vendorName: dto.vendorName?.trim(),
        invoiceNumber: dto.invoiceNumber?.trim(),
        invoiceDate: dto.invoiceDate ? toDateOnly(dto.invoiceDate) : undefined,
        foreignAmount,
        exchangeRate,
        bdtAmount,
        includeInLandedCost: dto.includeInLandedCost,
        attachmentUrl: dto.attachmentUrl?.trim(),
        attachmentName: dto.attachmentName?.trim(),
        remarks: dto.remarks?.trim(),
        paymentMethod,
        creditPayeeName: paymentMethod === "CREDIT" ? creditPayeeName : null,
        paymentAllocations: costPaymentAllocations as unknown as Prisma.InputJsonValue,
        paymentGlVoucherId: null,
      },
    });

    if (paymentMethod === "CASH_BANK_MFS") {
      const updatedEntry = await this.prisma.lcCostEntry.findUniqueOrThrow({ where: { id: costEntryId }, include: { costHead: true, shipment: true, allocations: true } });
      await this.postCostPaymentAccounting(currentUser, lc, updatedEntry as LcCostEntryRow, `R${Date.now()}`);
    }

    // Re-run AUTO allocation against the new amount so the entry stays
    // reconciled; manual/hybrid/direct entries keep whatever the user set
    // until they explicitly revisit the Allocation screen.
    if (entry.allocationMode === LcAllocationMode.AUTO && !bdtAmount.equals(entry.bdtAmount)) {
      await this.applyAllocation(lc.items, costEntryId, bdtAmount, {
        allocationMode: LcAllocationMode.AUTO,
        allocationBasis: entry.allocationBasis ?? "PURCHASE_VALUE",
        rows: lc.items.map((item) => ({ lcItemId: item.id })),
      });
    }

    return this.getById(currentUser, lcId);
  }

  async deleteCostEntry(currentUser: AuthenticatedRequestUser, lcId: string, costEntryId: string) {
    const lc = await this.loadLc(currentUser, lcId);
    const entry = lc.costEntries.find((row) => row.id === costEntryId);
    if (!entry) throw new NotFoundException("Cost entry not found");
    if (entry.isLocked) throw new BadRequestException("This cost entry is locked by a finalized landed cost. Reopen it first.");

    const paymentGlVoucherId = (entry as LcCostEntryRow & { paymentGlVoucherId?: string | null }).paymentGlVoucherId;
    if (paymentGlVoucherId) {
      await this.postingEngine.reverseVoucher(currentUser, paymentGlVoucherId, `LC ${lc.lcNumber} cost entry deleted: ${entry.costHead.name}`);
    }

    await this.prisma.lcCostEntry.delete({ where: { id: costEntryId } });
    return this.getById(currentUser, lcId);
  }

  /** Computes what AUTO would suggest right now for every item, without
   * persisting anything — powers the Allocation screen's live preview. */
  private computeAutoSuggestion(items: LcItemRow[], basis: string, fallbackBasis: string | null): Array<{ id: string; basisValue: Prisma.Decimal }> {
    const basisKey = basis as Parameters<typeof basisValueFor>[0];
    let targets = items.map((item) => ({ id: item.id, basisValue: basisValueFor(basisKey, itemForBasis(item)) }));
    const basisTotal = sumDecimals(targets.map((target) => target.basisValue));
    if (basisTotal.lessThanOrEqualTo(0) && fallbackBasis) {
      const fallbackKey = fallbackBasis as Parameters<typeof basisValueFor>[0];
      targets = items.map((item) => ({ id: item.id, basisValue: basisValueFor(fallbackKey, itemForBasis(item)) }));
    }
    return targets;
  }

  async previewAllocation(currentUser: AuthenticatedRequestUser, lcId: string, costEntryId: string, requestedBasis?: string) {
    const lc = await this.loadLc(currentUser, lcId);
    const entry = lc.costEntries.find((row) => row.id === costEntryId);
    if (!entry) throw new NotFoundException("Cost entry not found");

    const validBases = new Set(["PURCHASE_VALUE", "USD_VALUE", "QUANTITY", "WEIGHT", "CBM", "EQUAL"]);
    if (requestedBasis && !validBases.has(requestedBasis)) throw new BadRequestException("Invalid allocation basis.");
    const basis = requestedBasis ?? entry.allocationBasis ?? "PURCHASE_VALUE";
    const targets = this.computeAutoSuggestion(lc.items, basis, entry.costHead.fallbackAllocationMethod);
    const suggestion = allocateProportionally(entry.bdtAmount, targets);
    const existingByItem = new Map(entry.allocations.map((allocation) => [allocation.lcItemId, allocation]));

    return {
      costEntryId,
      bdtAmount: toNumber2(entry.bdtAmount),
      allocationMode: entry.allocationMode,
      allocationBasis: basis,
      rows: lc.items.map((item) => {
        const auto = suggestion.find((row) => row.id === item.id)!;
        const existing = existingByItem.get(item.id);
        return {
          lcItemId: item.id,
          productName: item.productName,
          basisValue: toNumber2(auto.basisValue),
          basisPercentage: Number(auto.basisPercentage.toDecimalPlaces(4)),
          autoSuggestedAmount: toNumber2(auto.amount),
          manualAmount: existing?.manualAmount ? Number(existing.manualAmount) : null,
          finalAmount: existing ? Number(existing.finalAmount) : 0,
        };
      }),
    };
  }

  private async applyAllocation(
    items: LcItemRow[],
    costEntryId: string,
    bdtAmount: Prisma.Decimal,
    dto: { allocationMode: string; allocationBasis: string; rows: Array<Pick<AllocationRowInputDto, "lcItemId" | "manualAmount" | "manualPercentage" | "overrideReason">> },
    changedByUserId?: string,
  ) {
    const entry = await this.prisma.lcCostEntry.findUniqueOrThrow({ where: { id: costEntryId }, include: { costHead: true } });
    const targets = this.computeAutoSuggestion(items, dto.allocationBasis, entry.costHead.fallbackAllocationMethod);
    const autoRows = allocateProportionally(bdtAmount, targets);
    const autoByItem = new Map(autoRows.map((row) => [row.id, row]));
    const inputByItem = new Map(dto.rows.map((row) => [row.lcItemId, row]));

    let finalRows: Array<{ lcItemId: string; basisValue: Prisma.Decimal; basisPercentage: Prisma.Decimal; autoSuggestedAmount: Prisma.Decimal; manualAmount: Prisma.Decimal | null; finalAmount: Prisma.Decimal; isDirect: boolean }>;

    if (dto.allocationMode === LcAllocationMode.MANUAL_AMOUNT) {
      finalRows = items.map((item) => {
        const input = inputByItem.get(item.id);
        if (!input || input.manualAmount === undefined || input.manualAmount === null) {
          throw new BadRequestException(`Enter a manual amount for "${item.productName}".`);
        }
        const auto = autoByItem.get(item.id)!;
        return {
          lcItemId: item.id,
          basisValue: auto.basisValue,
          basisPercentage: auto.basisPercentage,
          autoSuggestedAmount: auto.amount,
          manualAmount: round2(input.manualAmount),
          finalAmount: round2(input.manualAmount),
          isDirect: false,
        };
      });
    } else if (dto.allocationMode === LcAllocationMode.MANUAL_PERCENTAGE) {
      const totalPercentage = sumDecimals(items.map((item) => inputByItem.get(item.id)?.manualPercentage ?? 0));
      if (!isZero(totalPercentage.sub(100), 0.01)) {
        throw new BadRequestException(`Allocation percentages must total 100% (currently ${totalPercentage.toFixed(2)}%).`);
      }
      const percentRows = allocateProportionally(
        bdtAmount,
        items.map((item) => ({ id: item.id, basisValue: inputByItem.get(item.id)?.manualPercentage ?? 0 })),
      );
      finalRows = items.map((item) => {
        const auto = autoByItem.get(item.id)!;
        const percentRow = percentRows.find((row) => row.id === item.id)!;
        return {
          lcItemId: item.id,
          basisValue: percentRow.basisValue,
          basisPercentage: percentRow.basisPercentage,
          autoSuggestedAmount: auto.amount,
          manualAmount: percentRow.amount,
          finalAmount: percentRow.amount,
          isDirect: false,
        };
      });
    } else if (dto.allocationMode === LcAllocationMode.HYBRID) {
      const hybridRows = allocateHybrid(
        bdtAmount,
        items.map((item) => ({ id: item.id, basisValue: targets.find((t) => t.id === item.id)!.basisValue, manualAmount: inputByItem.get(item.id)?.manualAmount })),
      );
      finalRows = items.map((item) => {
        const auto = autoByItem.get(item.id)!;
        const row = hybridRows.find((r) => r.id === item.id)!;
        const isFixed = inputByItem.get(item.id)?.manualAmount !== undefined && inputByItem.get(item.id)?.manualAmount !== null;
        return {
          lcItemId: item.id,
          basisValue: auto.basisValue,
          basisPercentage: auto.basisPercentage,
          autoSuggestedAmount: auto.amount,
          manualAmount: isFixed ? row.amount : null,
          finalAmount: row.amount,
          isDirect: false,
        };
      });
    } else if (dto.allocationMode === LcAllocationMode.DIRECT_PRODUCT) {
      finalRows = items
        .filter((item) => inputByItem.get(item.id)?.manualAmount !== undefined && inputByItem.get(item.id)?.manualAmount !== null)
        .map((item) => {
          const input = inputByItem.get(item.id)!;
          const auto = autoByItem.get(item.id)!;
          return {
            lcItemId: item.id,
            basisValue: auto.basisValue,
            basisPercentage: auto.basisPercentage,
            autoSuggestedAmount: auto.amount,
            manualAmount: round2(input.manualAmount!),
            finalAmount: round2(input.manualAmount!),
            isDirect: true,
          };
        });
    } else {
      // AUTO
      finalRows = items.map((item) => {
        const auto = autoByItem.get(item.id)!;
        return {
          lcItemId: item.id,
          basisValue: auto.basisValue,
          basisPercentage: auto.basisPercentage,
          autoSuggestedAmount: auto.amount,
          manualAmount: null,
          finalAmount: auto.amount,
          isDirect: false,
        };
      });
    }

    for (const row of finalRows) {
      if (row.finalAmount.lessThan(0)) throw new BadRequestException("Allocation amounts cannot be negative.");
    }
    const allocatedTotal = sumDecimals(finalRows.map((row) => row.finalAmount));
    if (!isZero(allocatedTotal.sub(bdtAmount))) {
      throw new BadRequestException(`Allocated amount must equal ${bdtAmount.toFixed(2)} (currently ${allocatedTotal.toFixed(2)}).`);
    }

    const isOverridden = dto.allocationMode !== LcAllocationMode.AUTO;
    if (isOverridden) {
      const missingReason = finalRows.some((row) => {
        const input = inputByItem.get(row.lcItemId);
        const touchedManually = input?.manualAmount !== undefined && input?.manualAmount !== null;
        return touchedManually && !input?.overrideReason?.trim();
      });
      if (missingReason) {
        throw new BadRequestException("An override reason is required when manually changing an allocation.");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lcCostAllocation.deleteMany({ where: { costEntryId } });
      if (finalRows.length) {
        await tx.lcCostAllocation.createMany({
          data: finalRows.map((row) => ({
            costEntryId,
            lcItemId: row.lcItemId,
            basisValue: row.basisValue,
            basisPercentage: row.basisPercentage,
            autoSuggestedAmount: row.autoSuggestedAmount,
            manualAmount: row.manualAmount,
            finalAmount: row.finalAmount,
            isDirect: row.isDirect,
            isOverridden,
            overrideReason: isOverridden ? inputByItem.get(row.lcItemId)?.overrideReason?.trim() || null : null,
            originalMode: isOverridden ? LcAllocationMode.AUTO : null,
            originalBasis: isOverridden ? (dto.allocationBasis as never) : null,
            originalAutoAmount: isOverridden ? row.autoSuggestedAmount : null,
            changedByUserId: isOverridden ? (changedByUserId ?? null) : null,
            changedAt: isOverridden ? new Date() : null,
          })),
        });
      }
      await tx.lcCostEntry.update({ where: { id: costEntryId }, data: { allocationMode: dto.allocationMode as LcAllocationMode, allocationBasis: dto.allocationBasis as never } });
    });
  }

  async saveAllocation(currentUser: AuthenticatedRequestUser, lcId: string, costEntryId: string, dto: SaveLcAllocationDto) {
    const lc = await this.loadLc(currentUser, lcId);
    const entry = lc.costEntries.find((row) => row.id === costEntryId);
    if (!entry) throw new NotFoundException("Cost entry not found");
    if (entry.isLocked) throw new BadRequestException("This cost entry is locked by a finalized landed cost. Reopen it first.");
    if (!entry.costHead.manualOverrideAllowed && dto.allocationMode !== LcAllocationMode.AUTO) {
      throw new BadRequestException(`"${entry.costHead.name}" does not allow manual allocation overrides.`);
    }

    await this.applyAllocation(
      lc.items,
      costEntryId,
      entry.bdtAmount,
      { allocationMode: dto.allocationMode, allocationBasis: dto.allocationBasis ?? entry.allocationBasis ?? "PURCHASE_VALUE", rows: dto.rows },
      currentUser.id,
    );

    // Backfill payment accounting for cost entries created before immediate
    // Cash/Bank/MFS posting was introduced. The persisted voucher id keeps
    // repeated allocation saves idempotent.
    await this.postCostPaymentAccounting(currentUser, lc, entry);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      action: "LC_ALLOCATION_SAVED",
      entityType: "LcCostEntry",
      entityId: costEntryId,
      newValues: { allocationMode: dto.allocationMode, allocationBasis: dto.allocationBasis ?? null },
    });

    return this.getById(currentUser, lcId);
  }

  // ===========================================================================
  // GRN
  // ===========================================================================

  async createGrn(currentUser: AuthenticatedRequestUser, lcId: string, dto: CreateLcGrnDto) {
    const lc = await this.loadLc(currentUser, lcId);
    if (lc.status === LcStatus.FINALIZED || lc.status === LcStatus.CLOSED) throw new BadRequestException("Finalized or closed LCs cannot be edited.");
    if (!dto.items?.length) throw new BadRequestException("Add at least one product to the GRN.");

    const itemsById = new Map(lc.items.map((item) => [item.id, item]));
    const receivedSoFarByItem = new Map<string, Prisma.Decimal>();
    for (const grn of lc.grns) {
      for (const grnItem of grn.items) {
        receivedSoFarByItem.set(grnItem.lcItemId, (receivedSoFarByItem.get(grnItem.lcItemId) ?? toDecimal(0)).add(grnItem.receivedQuantity));
      }
    }

    const grnNumber = dto.grnNumber?.trim() || `GRN-${lc.lcNumber}-${lc.grns.length + 1}`;

    const grnItemsData = dto.items.map((input) => {
      const lcItem = itemsById.get(input.lcItemId);
      if (!lcItem) throw new BadRequestException("One of the selected products does not belong to this LC.");
      const alreadyReceived = receivedSoFarByItem.get(input.lcItemId) ?? toDecimal(0);
      const expectedQuantity = toDecimal(lcItem.quantity).sub(alreadyReceived);
      const receivedQuantity = toDecimal(input.receivedQuantity);
      const damagedQuantity = toDecimal(input.damagedQuantity ?? 0);
      const rejectedQuantity = toDecimal(input.rejectedQuantity ?? 0);
      const shortQuantity = Prisma.Decimal.max(0, expectedQuantity.sub(receivedQuantity));
      const excessQuantity = Prisma.Decimal.max(0, receivedQuantity.sub(expectedQuantity));

      return {
        lcItemId: input.lcItemId,
        expectedQuantity,
        receivedQuantity,
        shortQuantity,
        excessQuantity,
        damagedQuantity,
        rejectedQuantity,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.lcGrn.create({
        data: {
          lcId,
          grnNumber,
          receivedDate: toDateOnly(dto.receivedDate),
          warehouseId: dto.warehouseId || null,
          remarks: dto.remarks?.trim() || null,
          createdByUserId: currentUser.id,
          items: { create: grnItemsData },
        },
      });

      for (const grnItem of grnItemsData) {
        const totalReceived = (receivedSoFarByItem.get(grnItem.lcItemId) ?? toDecimal(0)).add(grnItem.receivedQuantity);
        await tx.lcItem.update({ where: { id: grnItem.lcItemId }, data: { receivedQuantity: totalReceived } });
      }
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: lc.workspaceId,
      userId: currentUser.id,
      action: "LC_GRN_CREATED",
      entityType: "LcGrn",
      entityId: lcId,
      newValues: { grnNumber, itemCount: dto.items.length },
    });

    return this.getById(currentUser, lcId);
  }

  // ===========================================================================
  // Landed cost engine
  // ===========================================================================

  private categoryFieldMap: Record<string, string> = {
    LC_BANKING: "lcBankingCost",
    ORIGIN: "originCost",
    FREIGHT: "freightCost",
    INSURANCE: "insuranceCost",
    CUSTOMS: "customsCost",
    TAX: "taxCost",
    CNF: "cnfCost",
    PORT: "portCost",
    DESTINATION_TRANSPORT: "destinationTransportCost",
    LOCAL: "localCost",
    OTHER: "otherCost",
  };

  private computeLandedCost(lc: LcMasterDetail) {
    const purchaseCostTotal = sumDecimals(lc.items.map((item) => item.totalPurchaseCostBdt));
    const eligibleEntries = lc.costEntries.filter((entry) => entry.includeInLandedCost);
    const importCostTotal = sumDecimals(eligibleEntries.map((entry) => entry.bdtAmount));
    const landedCostTotal = purchaseCostTotal.add(importCostTotal);

    const allocationDifference = sumDecimals(
      eligibleEntries.map((entry) => entry.bdtAmount.sub(sumDecimals(entry.allocations.map((allocation) => allocation.finalAmount)))),
    );

    interface CostBucket {
      purchaseCost: Prisma.Decimal;
      lcBankingCost: Prisma.Decimal;
      originCost: Prisma.Decimal;
      freightCost: Prisma.Decimal;
      insuranceCost: Prisma.Decimal;
      customsCost: Prisma.Decimal;
      taxCost: Prisma.Decimal;
      cnfCost: Prisma.Decimal;
      portCost: Prisma.Decimal;
      destinationTransportCost: Prisma.Decimal;
      localCost: Prisma.Decimal;
      otherCost: Prisma.Decimal;
      [key: string]: Prisma.Decimal;
    }

    const perItem = new Map<string, CostBucket>();
    for (const item of lc.items) {
      perItem.set(item.id, {
        purchaseCost: toDecimal(item.totalPurchaseCostBdt),
        lcBankingCost: toDecimal(0),
        originCost: toDecimal(0),
        freightCost: toDecimal(0),
        insuranceCost: toDecimal(0),
        customsCost: toDecimal(0),
        taxCost: toDecimal(0),
        cnfCost: toDecimal(0),
        portCost: toDecimal(0),
        destinationTransportCost: toDecimal(0),
        localCost: toDecimal(0),
        otherCost: toDecimal(0),
      });
    }

    for (const entry of eligibleEntries) {
      const field = this.categoryFieldMap[entry.costHead.category] ?? "otherCost";
      for (const allocation of entry.allocations) {
        const bucket = perItem.get(allocation.lcItemId);
        if (!bucket) continue;
        bucket[field] = bucket[field].add(allocation.finalAmount);
      }
    }

    const items = lc.items.map((item) => {
      const bucket = perItem.get(item.id)!;
      const totalLandedCost = Object.values(bucket).reduce((sum, value) => sum.add(value), toDecimal(0));
      const receivedQuantity = toDecimal(item.receivedQuantity);
      // Landed unit cost belongs to stock actually received through GRN. Using
      // ordered quantity understates unit cost whenever goods are short/lost.
      const costingQuantity = receivedQuantity;
      const unitLandedCost = costingQuantity.greaterThan(0) ? totalLandedCost.div(costingQuantity) : toDecimal(0);
      const profitMode = item.profitMode ?? null;
      const profitValue = item.profitValue ? toDecimal(item.profitValue) : toDecimal(0);
      const sellingPricePerUnit =
        profitMode === "FIXED"
          ? unitLandedCost.add(profitValue)
          : profitMode === "PERCENTAGE"
            ? unitLandedCost.mul(toDecimal(1).add(profitValue.div(100)))
            : toDecimal(0);
      const sellingPriceTotal = sellingPricePerUnit.mul(costingQuantity);
      return {
        lcItemId: item.id,
        ...bucket,
        totalLandedCost,
        receivedQuantity,
        unitLandedCost,
        profitMode,
        profitValue,
        sellingPricePerUnit,
        sellingPriceTotal,
      };
    });

    return { purchaseCostTotal, importCostTotal, landedCostTotal, allocationDifference, items };
  }

  async previewLandedCost(currentUser: AuthenticatedRequestUser, lcId: string) {
    const lc = await this.loadLc(currentUser, lcId);
    const computed = this.computeLandedCost(lc);
    return {
      purchaseCostTotal: toNumber2(computed.purchaseCostTotal),
      importCostTotal: toNumber2(computed.importCostTotal),
      landedCostTotal: toNumber2(computed.landedCostTotal),
      allocationDifference: toNumber2(computed.allocationDifference),
      items: computed.items.map((item) => ({
        lcItemId: item.lcItemId,
        purchaseCost: toNumber2(item.purchaseCost),
        lcBankingCost: toNumber2(item.lcBankingCost),
        originCost: toNumber2(item.originCost),
        freightCost: toNumber2(item.freightCost),
        insuranceCost: toNumber2(item.insuranceCost),
        customsCost: toNumber2(item.customsCost),
        taxCost: toNumber2(item.taxCost),
        cnfCost: toNumber2(item.cnfCost),
        portCost: toNumber2(item.portCost),
        destinationTransportCost: toNumber2(item.destinationTransportCost),
        localCost: toNumber2(item.localCost),
        otherCost: toNumber2(item.otherCost),
        totalLandedCost: toNumber2(item.totalLandedCost),
        receivedQuantity: Number(item.receivedQuantity.toDecimalPlaces(4)),
        unitLandedCost: Number(item.unitLandedCost.toDecimalPlaces(4)),
        profitMode: item.profitMode,
        profitValue: item.profitMode === "FIXED" ? toNumber2(item.profitValue) : Number(item.profitValue.toDecimalPlaces(4)),
        sellingPricePerUnit: Number(item.sellingPricePerUnit.toDecimalPlaces(4)),
        sellingPriceTotal: toNumber2(item.sellingPriceTotal),
      })),
    };
  }

  /** Product-wise profit is a pricing input, independent of the GL-affecting
   * cost/finalize flow — it can be set or changed any time (draft or
   * finalized) without reversing any voucher. Selling price is always
   * derived live from the current unit landed cost, never stored, so it
   * can never go stale if cost entries change afterwards. */
  async updateLandedCostProfit(currentUser: AuthenticatedRequestUser, lcId: string, dto: UpdateLcProfitDto) {
    const lc = await this.loadLc(currentUser, lcId);
    if (lc.landedCost?.status === LcLandedCostStatus.FINALIZED) {
      throw new BadRequestException("Reopen the finalized landed cost before changing profit.");
    }
    const validIds = new Set(lc.items.map((item) => item.id));
    for (const row of dto.items) {
      if (!validIds.has(row.lcItemId)) {
        throw new BadRequestException("One of the selected products does not belong to this LC.");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const row of dto.items) {
        await tx.lcItem.update({
          where: { id: row.lcItemId },
          data: { profitMode: row.profitMode, profitValue: row.profitMode === "FIXED" ? round2(toDecimal(row.profitValue)) : toDecimal(row.profitValue) },
        });
      }
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: lc.workspaceId,
      userId: currentUser.id,
      action: "LC_PROFIT_UPDATED",
      entityType: "LcMaster",
      entityId: lcId,
      newValues: { items: dto.items },
    });

    return this.getById(currentUser, lcId);
  }

  private validateFinalizationGates(lc: LcMasterDetail, computed: ReturnType<LcService["computeLandedCost"]>) {
    const problems: string[] = [];

    const purchaseCostTotal = sumDecimals(lc.items.map((item) => item.totalPurchaseCostBdt));
    const purchaseDue = round2(purchaseCostTotal.sub(lc.purchasePaidAmount));
    if (lc.purchasePaymentStatus !== "PAID" || purchaseDue.greaterThan(0)) {
      problems.push(`Purchase payment is still due (${toNumber2(purchaseDue)}). Pay the full purchase value before finalizing landed cost.`);
    }

    if (!lc.items.length) problems.push("Add at least one product to the LC.");
    for (const item of lc.items) {
      if (toDecimal(item.totalPurchaseCostBdt).lessThanOrEqualTo(0)) {
        problems.push(`"${item.productName}" has no confirmed purchase cost.`);
      }
      if (toDecimal(item.receivedQuantity).lessThanOrEqualTo(0)) {
        problems.push(`"${item.productName}" has no GRN received quantity yet.`);
      }
    }

    for (const entry of lc.costEntries.filter((row) => row.includeInLandedCost)) {
      const allocated = sumDecimals(entry.allocations.map((allocation) => allocation.finalAmount));
      if (!isZero(entry.bdtAmount.sub(allocated))) {
        problems.push(`"${entry.costHead.name}" is not fully allocated (remaining ${toNumber2(entry.bdtAmount.sub(allocated))}).`);
      }
      if (entry.bdtAmount.lessThan(0)) problems.push(`"${entry.costHead.name}" has a negative amount.`);
      if (entry.paymentMethod === "CASH_BANK_MFS") {
        const paid = sumDecimals(this.readPaymentAllocations(entry.paymentAllocations).map((row) => row.amount));
        if (!isZero(entry.bdtAmount.sub(paid))) problems.push(`"${entry.costHead.name}" payment allocations do not match its cost amount.`);
      }
    }

    if (!isZero(computed.allocationDifference)) {
      problems.push(`Allocation difference must be zero (currently ${toNumber2(computed.allocationDifference)}).`);
    }

    return problems;
  }

  /** Resolve protected anchors by immutable code and module-created ledgers by
   * company-scoped managedRole. Caption changes never split GL history. */
  private async ensureLcChartSetup(currentUser: AuthenticatedRequestUser) {
    const inventoryControl = await this.prisma.account.findFirst({
      where: { companyId: currentUser.companyId, code: "1210001", level: AccountLevel.LEDGER, status: "ACTIVE", isSystem: true },
    });
    if (!inventoryControl) {
      throw new BadRequestException(
        "This company's Chart of Accounts has no 'Inventory Control' ledger yet — set up Accounting before finalizing landed cost.",
      );
    }

    const goodsInTransitParent = await this.prisma.account.findFirst({
      where: {
        companyId: currentUser.companyId,
        code: "1250000",
        level: AccountLevel.CATEGORY,
        status: "ACTIVE",
        isSystem: true,
      },
    });
    if (!goodsInTransitParent) {
      throw new BadRequestException("This company's Chart of Accounts has no 'Goods in Transit' category under Current Assets.");
    }
    const payableParent = await this.prisma.account.findFirst({
      where: { companyId: currentUser.companyId, code: "2212000", level: AccountLevel.CATEGORY, status: "ACTIVE", isSystem: true },
    });
    if (!payableParent) {
      throw new BadRequestException("This company's Chart of Accounts has no protected Others Payable category (2212000).");
    }
    const goodsInTransitLedger = await this.ensureManagedLcLedger(
      currentUser,
      ACCOUNT_MANAGED_ROLE.LC_GOODS_IN_TRANSIT,
      goodsInTransitParent.id,
      "Goods in Transit (LC Expenses)",
      "ASSET",
    );
    const importCostPayableLedger = await this.ensureManagedLcLedger(
      currentUser,
      ACCOUNT_MANAGED_ROLE.LC_IMPORT_COST_PAYABLE,
      payableParent.id,
      "Import Cost Payable (LC)",
      "LIABILITY",
    );
    return {
      inventoryControlLedgerId: inventoryControl.id,
      inventoryControlLedgerName: inventoryControl.name,
      importCostPayableLedgerId: importCostPayableLedger.id,
      importCostPayableLedgerName: importCostPayableLedger.name,
      goodsInTransitLedgerId: goodsInTransitLedger.id,
      goodsInTransitLedgerName: goodsInTransitLedger.name,
    };
  }

  private async ensureManagedLcLedger(
    currentUser: AuthenticatedRequestUser,
    managedRole: string,
    parentId: string,
    defaultName: string,
    nature: "ASSET" | "LIABILITY",
  ) {
    const existing = await this.prisma.account.findFirst({
      where: { companyId: currentUser.companyId, managedRole },
    });
    const candidate = existing ?? await this.accountsService.createManagedAccount(currentUser, managedRole, {
      level: "LEDGER",
      parentId,
      name: defaultName,
      nature,
      requiresItemDetails: false,
    });
    if (
      candidate.managedRole !== managedRole
      || candidate.level !== AccountLevel.LEDGER
      || candidate.parentId !== parentId
      || candidate.nature !== nature
      || candidate.status !== "ACTIVE"
      || candidate.isSystem
    ) {
      throw new BadRequestException(`Managed LC account role ${managedRole} conflicts with the protected Chart of Accounts structure.`);
    }
    return candidate;
  }

  async finalizeLandedCost(currentUser: AuthenticatedRequestUser, lcId: string) {
    const lc = await this.loadLc(currentUser, lcId);
    if (lc.landedCost?.status === LcLandedCostStatus.FINALIZED) {
      throw new BadRequestException("This LC's landed cost is already finalized.");
    }

    const computed = this.computeLandedCost(lc);
    const problems = this.validateFinalizationGates(lc, computed);
    if (problems.length) {
      throw new BadRequestException(`Cannot finalize landed cost: ${problems.join(" ")}`);
    }

    const landedCostTotal = round2(computed.landedCostTotal);
    let landedCostVoucherId: string | null = null;
    const entriesToPostAtFinalization = lc.costEntries.filter((entry) => {
      if (!entry.includeInLandedCost) return false;
      const paymentVoucherId = (entry as LcCostEntryRow & { paymentGlVoucherId?: string | null }).paymentGlVoucherId;
      return entry.paymentMethod !== "CASH_BANK_MFS" || !paymentVoucherId;
    });
    const finalizationPostingTotal = round2(sumDecimals(entriesToPostAtFinalization.map((entry) => entry.bdtAmount)));
    if (finalizationPostingTotal.greaterThan(0)) {
      const { goodsInTransitLedgerId, goodsInTransitLedgerName, importCostPayableLedgerId, importCostPayableLedgerName } = await this.ensureLcChartSetup(currentUser);
      const creditLines = entriesToPostAtFinalization.flatMap((entry, entryIndex) => {
        if (entry.paymentMethod === "CASH_BANK_MFS") {
          return this.readPaymentAllocations(entry.paymentAllocations).map((row, rowIndex) => ({ id: `lc-landed-cost-payment-${entryIndex}-${rowIndex}`, accountId: row.accountId, ledger: row.ledger, description: row.reference ? `${entry.costHead.name} - ${row.reference}` : `${entry.costHead.name} paid`, debit: 0, credit: row.amount }));
        }
        return [{ id: `lc-landed-cost-payable-${entryIndex}`, accountId: importCostPayableLedgerId, ledger: importCostPayableLedgerName, description: `${entry.costHead.name} payable${entry.creditPayeeName ? ` to ${entry.creditPayeeName}` : ""}`, debit: 0, credit: Number(entry.bdtAmount) }];
      });
      const voucher = await this.vouchersService.create(currentUser, {
        workspaceId: lc.workspaceId,
        voucherType: "journal",
        voucherNumber: `LC-LANDED-${lc.id}`,
        idempotencyKey: `lc-landed-cost:${lc.id}`,
        voucherDate: new Date().toISOString().slice(0, 10),
        partyName: lc.supplierName,
        narration: `Additional landed cost finalized for LC ${lc.lcNumber}`,
        status: "draft",
        totalAmount: toNumber2(finalizationPostingTotal),
        lines: [
          { id: "lc-landed-cost-inventory", accountId: goodsInTransitLedgerId, ledger: goodsInTransitLedgerName, description: `Additional landed cost - LC ${lc.lcNumber}`, debit: toNumber2(finalizationPostingTotal), credit: 0 },
          ...creditLines,
        ],
      });
      await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.PENDING);
      await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.POSTED);
      landedCostVoucherId = voucher.id;
    }

    await this.prisma.$transaction(async (tx) => {
      const landedCost = await tx.lcLandedCost.upsert({
        where: { lcId },
        create: {
          lcId,
          purchaseCostTotal: computed.purchaseCostTotal,
          importCostTotal: computed.importCostTotal,
          landedCostTotal,
          allocationDifference: computed.allocationDifference,
          status: LcLandedCostStatus.FINALIZED,
          finalizedByUserId: currentUser.id,
          finalizedAt: new Date(),
          glVoucherId: landedCostVoucherId,
        },
        update: {
          purchaseCostTotal: computed.purchaseCostTotal,
          importCostTotal: computed.importCostTotal,
          landedCostTotal,
          allocationDifference: computed.allocationDifference,
          status: LcLandedCostStatus.FINALIZED,
          finalizedByUserId: currentUser.id,
          finalizedAt: new Date(),
          reopenedAt: null,
          reopenReason: null,
          glVoucherId: landedCostVoucherId,
        },
      });

      await tx.lcLandedCostItem.deleteMany({ where: { landedCostId: landedCost.id } });
      await tx.lcLandedCostItem.createMany({
        data: computed.items.map((item) => ({
          landedCostId: landedCost.id,
          lcItemId: item.lcItemId,
          purchaseCost: item.purchaseCost,
          lcBankingCost: item.lcBankingCost,
          originCost: item.originCost,
          freightCost: item.freightCost,
          insuranceCost: item.insuranceCost,
          customsCost: item.customsCost,
          taxCost: item.taxCost,
          cnfCost: item.cnfCost,
          portCost: item.portCost,
          destinationTransportCost: item.destinationTransportCost,
          localCost: item.localCost,
          otherCost: item.otherCost,
          totalLandedCost: item.totalLandedCost,
          receivedQuantity: item.receivedQuantity,
          unitLandedCost: item.unitLandedCost,
        })),
      });

      for (const item of computed.items) {
        await tx.lcItem.update({
          where: { id: item.lcItemId },
          data: { landedCostAmount: item.totalLandedCost, landedCostPerUnit: item.unitLandedCost },
        });
      }

      await tx.lcCostEntry.updateMany({ where: { lcId }, data: { isLocked: true } });
      await tx.lcMaster.update({ where: { id: lcId }, data: { status: LcStatus.FINALIZED } });
    });

    await this.recordStatusChange(currentUser, lcId, lc.status, LcStatus.FINALIZED, "Landed cost finalized");
    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: lc.workspaceId,
      userId: currentUser.id,
      action: "LC_LANDED_COST_FINALIZED",
      entityType: "LcMaster",
      entityId: lcId,
      newValues: { landedCostTotal: toNumber2(landedCostTotal), glVoucherId: landedCostVoucherId },
    });

    return this.getById(currentUser, lcId);
  }

  async updateGrn(currentUser: AuthenticatedRequestUser, lcId: string, grnId: string, dto: CreateLcGrnDto) {
    const lc = await this.loadLc(currentUser, lcId);
    if (lc.status === LcStatus.FINALIZED || lc.status === LcStatus.CLOSED) throw new BadRequestException("Reopen the LC before editing a GRN.");
    if (!dto.items?.length) throw new BadRequestException("Add at least one product to the GRN.");

    const existingGrn = lc.grns.find((grn) => grn.id === grnId);
    if (!existingGrn) throw new NotFoundException("GRN not found.");

    const itemsById = new Map(lc.items.map((item) => [item.id, item]));
    const receivedOutsideThisGrn = new Map<string, Prisma.Decimal>();
    for (const grn of lc.grns) {
      if (grn.id === grnId) continue;
      for (const item of grn.items) {
        receivedOutsideThisGrn.set(item.lcItemId, (receivedOutsideThisGrn.get(item.lcItemId) ?? toDecimal(0)).add(item.receivedQuantity));
      }
    }

    const seenItemIds = new Set<string>();
    const grnItemsData = dto.items.map((input) => {
      const lcItem = itemsById.get(input.lcItemId);
      if (!lcItem) throw new BadRequestException("One of the selected products does not belong to this LC.");
      if (seenItemIds.has(input.lcItemId)) throw new BadRequestException("A product can appear only once in a GRN.");
      seenItemIds.add(input.lcItemId);
      const expectedQuantity = Prisma.Decimal.max(0, toDecimal(lcItem.quantity).sub(receivedOutsideThisGrn.get(input.lcItemId) ?? toDecimal(0)));
      const receivedQuantity = toDecimal(input.receivedQuantity);
      const damagedQuantity = toDecimal(input.damagedQuantity ?? 0);
      const rejectedQuantity = toDecimal(input.rejectedQuantity ?? 0);
      if (receivedQuantity.isNegative() || damagedQuantity.isNegative() || rejectedQuantity.isNegative()) throw new BadRequestException("GRN quantities cannot be negative.");
      if (damagedQuantity.add(rejectedQuantity).greaterThan(receivedQuantity)) throw new BadRequestException("Damaged and rejected quantity cannot exceed received quantity.");
      return {
        lcItemId: input.lcItemId,
        expectedQuantity,
        receivedQuantity,
        shortQuantity: Prisma.Decimal.max(0, expectedQuantity.sub(receivedQuantity)),
        excessQuantity: Prisma.Decimal.max(0, receivedQuantity.sub(expectedQuantity)),
        damagedQuantity,
        rejectedQuantity,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.lcGrn.update({
        where: { id: grnId },
        data: {
          receivedDate: toDateOnly(dto.receivedDate),
          warehouseId: dto.warehouseId || null,
          remarks: dto.remarks?.trim() || null,
          items: { deleteMany: {}, create: grnItemsData },
        },
      });
      for (const item of lc.items) {
        const replacement = grnItemsData.find((row) => row.lcItemId === item.id)?.receivedQuantity ?? toDecimal(0);
        const totalReceived = (receivedOutsideThisGrn.get(item.id) ?? toDecimal(0)).add(replacement);
        await tx.lcItem.update({ where: { id: item.id }, data: { receivedQuantity: totalReceived } });
      }
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: lc.workspaceId,
      userId: currentUser.id,
      action: "LC_GRN_UPDATED",
      entityType: "LcGrn",
      entityId: grnId,
      oldValues: { grnNumber: existingGrn.grnNumber },
      newValues: { itemCount: dto.items.length, receivedDate: dto.receivedDate, warehouseId: dto.warehouseId || null },
    });

    return this.getById(currentUser, lcId);
  }

  async postFinalizedInventory(currentUser: AuthenticatedRequestUser, lcId: string, dto: PostLcInventoryDto) {
    const lc = await this.loadLc(currentUser, lcId);
    if (lc.status === LcStatus.CLOSED) throw new BadRequestException("Closed LCs cannot be posted to inventory.");
    if (!lc.landedCost || lc.landedCost.status !== LcLandedCostStatus.FINALIZED) {
      throw new BadRequestException("Finalize landed cost before posting items to inventory.");
    }
    if (!dto.items?.length) throw new BadRequestException("Select at least one LC item for inventory posting.");

    const uniqueItemIds = new Set(dto.items.map((row) => row.lcItemId));
    if (uniqueItemIds.size !== dto.items.length) throw new BadRequestException("Each LC item can be selected only once.");
    const itemsById = new Map(lc.items.map((item) => [item.id, item]));
    const resolvedInputs = await Promise.all(dto.items.map(async (row) => {
      const lcItem = itemsById.get(row.lcItemId);
      if (!lcItem) throw new BadRequestException("One of the selected items does not belong to this LC.");
      if (row.postingType === "EXISTING") {
        if (!row.inventoryItemId) throw new BadRequestException(`${lcItem.productName}: select an existing Products & Services item.`);
        return row;
      }

      const oneTime = row.postingType === "ONE_TIME";
      const itemName = oneTime ? `${lcItem.productName} - One-time ${lc.lcNumber}` : lcItem.productName;
      const duplicate = await this.prisma.inventoryItem.findFirst({
        where: { workspaceId: lc.workspaceId, itemName },
        select: { id: true },
      });
      if (duplicate) {
        if (!oneTime) throw new BadRequestException(`${lcItem.productName} already exists. Choose Existing Product instead.`);
        return { ...row, inventoryItemId: duplicate.id };
      }
      const codePrefix = oneTime ? "OT" : "LC";
      const inventoryItem = await this.prisma.inventoryItem.create({
        data: {
          tenantId: lc.tenantId,
          companyId: lc.companyId,
          workspaceId: lc.workspaceId,
          itemCode: `${codePrefix}-${lcItem.id.slice(0, 8).toUpperCase()}`,
          itemName,
          kind: "PRODUCT",
          category: oneTime ? "One-time LC Items" : "LC Imports",
          unit: lcItem.unit || "pcs",
          notes: oneTime
            ? `One-time inventory item created from LC ${lc.lcNumber}. Do not reorder.`
            : `Created from LC ${lc.lcNumber}.`,
          reorderLevel: 0,
          createdByUserId: currentUser.id,
        },
      });
      return { ...row, inventoryItemId: inventoryItem.id };
    }));
    const requestedInventoryItemIds = [...new Set(resolvedInputs.map((row) => row.inventoryItemId).filter((id): id is string => Boolean(id)))];
    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: { id: { in: requestedInventoryItemIds }, workspaceId: lc.workspaceId, status: "ACTIVE" },
      select: { id: true },
    });
    const validInventoryItemIds = new Set(inventoryItems.map((item) => item.id));
    const selected = resolvedInputs.map((row) => {
      const item = itemsById.get(row.lcItemId);
      if (!item) throw new BadRequestException("One of the selected items does not belong to this LC.");
      if (item.inventoryPosting) throw new BadRequestException(`${item.productName} is already posted to ${item.inventoryPosting.warehouse.name}.`);
      const inventoryItemId = row.inventoryItemId ?? item.inventoryItemId;
      if (!inventoryItemId) throw new BadRequestException(`${item.productName} is not linked to a Products & Services inventory item.`);
      if (row.inventoryItemId && !validInventoryItemIds.has(row.inventoryItemId)) throw new BadRequestException(`${item.productName}: select an active Products & Services inventory item.`);
      const quantity = toDecimal(item.receivedQuantity);
      const totalCost = round2(toDecimal(item.landedCostAmount ?? 0));
      if (quantity.lessThanOrEqualTo(0)) throw new BadRequestException(`${item.productName} has no received quantity.`);
      if (totalCost.lessThanOrEqualTo(0)) throw new BadRequestException(`${item.productName} has no finalized landed cost.`);
      const unitCost = totalCost.div(quantity).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
      return { input: row, item, inventoryItemId, quantity, unitCost, totalCost };
    });

    const warehouseIds = [...new Set(dto.items.map((row) => row.warehouseId))];
    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: warehouseIds }, workspaceId: lc.workspaceId, isActive: true, deletedAt: null, allowGrn: true },
    });
    const warehousesById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    for (const row of selected) {
      if (!warehousesById.has(row.input.warehouseId)) {
        throw new BadRequestException(`${row.item.productName}: select an active warehouse that allows GRN.`);
      }
    }

    const postingTotal = round2(sumDecimals(selected.map((row) => row.totalCost)));
    const postingItemKey = selected.map((row) => row.item.id).sort().join(",");
    const postingReference = selected.map((row) => row.item.id.slice(0, 8)).sort().join("-");
    const { goodsInTransitLedgerId, goodsInTransitLedgerName, inventoryControlLedgerId, inventoryControlLedgerName } = await this.ensureLcChartSetup(currentUser);
    const voucher = await this.vouchersService.create(currentUser, {
      workspaceId: lc.workspaceId,
      voucherType: "journal",
      voucherNumber: `LC-INV-${lc.id.slice(0, 8)}-${postingReference}`,
      idempotencyKey: `lc-inventory:${lc.id}:${postingItemKey}`,
      voucherDate: new Date().toISOString().slice(0, 10),
      partyName: lc.supplierName,
      narration: `Finalized LC inventory received - ${lc.lcNumber}`,
      status: "draft",
      totalAmount: toNumber2(postingTotal),
      lines: [
        { id: "lc-inventory-control", accountId: inventoryControlLedgerId, ledger: inventoryControlLedgerName, description: `Inventory received from LC ${lc.lcNumber}`, debit: toNumber2(postingTotal), credit: 0 },
        { id: "lc-goods-in-transit", accountId: goodsInTransitLedgerId, ledger: goodsInTransitLedgerName, description: `Transferred to warehouse from LC ${lc.lcNumber}`, debit: 0, credit: toNumber2(postingTotal) },
      ],
    });
    await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.PENDING);
    await this.postingEngine.transitionStatus(currentUser, voucher.id, VoucherEntryStatus.POSTED);

    await this.prisma.$transaction(async (tx) => {
      for (const row of selected) {
        if (row.item.inventoryItemId !== row.inventoryItemId) {
          await tx.lcItem.update({ where: { id: row.item.id }, data: { inventoryItemId: row.inventoryItemId } });
        }
        const posting = await tx.lcInventoryPosting.create({
          data: {
            lcId,
            lcItemId: row.item.id,
            warehouseId: row.input.warehouseId,
            quantity: row.quantity,
            unitCost: row.unitCost,
            totalCost: row.totalCost,
            postedByUserId: currentUser.id,
          },
        });
        const movement = await tx.stockMovement.create({
          data: {
            tenantId: lc.tenantId,
            companyId: lc.companyId,
            workspaceId: lc.workspaceId,
            warehouseId: row.input.warehouseId,
            inventoryItemId: row.inventoryItemId,
            transactionType: "LC_GRN_FINALIZED",
            transactionId: lcId,
            transactionLineId: posting.id,
            referenceNo: lc.lcNumber,
            movementType: StockMovementType.IN,
            quantity: row.quantity,
            unit: row.item.unit,
            inputUnitCost: row.unitCost,
            transactionDate: new Date(),
            postedByUserId: currentUser.id,
            idempotencyKey: `lc-inventory:${lcId}:item:${row.item.id}`,
          },
        });
        await tx.lcInventoryPosting.update({ where: { id: posting.id }, data: { stockMovementId: movement.id } });
      }
      const valuation = await rebuildMovingAverageCosts(tx, lc.workspaceId, selected.map((row) => row.inventoryItemId));
      await this.requireInventoryService().reconcileMovingAverageLedger(tx, lc.workspaceId, valuation.movements, currentUser.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: lc.workspaceId,
      userId: currentUser.id,
      action: "LC_INVENTORY_POSTED",
      entityType: "LcMaster",
      entityId: lcId,
      newValues: { totalCost: toNumber2(postingTotal), items: selected.map((row) => ({ lcItemId: row.item.id, warehouseId: row.input.warehouseId, quantity: Number(row.quantity), unitCost: Number(row.unitCost) })) },
    });

    return this.getById(currentUser, lcId);
  }

  async updateFinalizedInventoryPosting(currentUser: AuthenticatedRequestUser, lcId: string, dto: UpdateLcInventoryPostingDto) {
    const lc = await this.loadLc(currentUser, lcId);
    if (lc.status === LcStatus.CLOSED) throw new BadRequestException("Closed LC inventory postings cannot be edited.");
    const postedItems = lc.items.filter((item) => item.inventoryPosting);
    if (!postedItems.length) throw new BadRequestException("This LC has not been posted to inventory yet.");
    if (dto.items.length !== postedItems.length || new Set(dto.items.map((row) => row.lcItemId)).size !== postedItems.length) {
      throw new BadRequestException("Submit every posted LC item exactly once.");
    }

    const inventoryItemIds = [...new Set(dto.items.map((row) => row.inventoryItemId))];
    const warehouseIds = [...new Set(dto.items.map((row) => row.warehouseId))];
    const [inventoryItems, warehouses] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: { id: { in: inventoryItemIds }, workspaceId: lc.workspaceId, status: "ACTIVE" }, select: { id: true } }),
      this.prisma.warehouse.findMany({ where: { id: { in: warehouseIds }, workspaceId: lc.workspaceId, isActive: true, deletedAt: null, allowGrn: true }, select: { id: true } }),
    ]);
    const validInventoryIds = new Set(inventoryItems.map((item) => item.id));
    const validWarehouseIds = new Set(warehouses.map((warehouse) => warehouse.id));
    const postedById = new Map(postedItems.map((item) => [item.id, item]));
    for (const row of dto.items) {
      const item = postedById.get(row.lcItemId);
      if (!item?.inventoryPosting) throw new BadRequestException("One of the selected items is not an inventory posting from this LC.");
      if (!item.inventoryPosting.stockMovementId) throw new BadRequestException(`${item.productName} has no editable stock movement.`);
      if (!validInventoryIds.has(row.inventoryItemId)) throw new BadRequestException(`${item.productName}: select an active Products & Services item.`);
      if (!validWarehouseIds.has(row.warehouseId)) throw new BadRequestException(`${item.productName}: select an active warehouse that allows GRN.`);
    }

    const affectedInventoryIds = new Set<string>([
      ...inventoryItemIds,
      ...postedItems.map((item) => item.inventoryItemId).filter((id): id is string => Boolean(id)),
    ]);
    await this.prisma.$transaction(async (tx) => {
      for (const row of dto.items) {
        const item = postedById.get(row.lcItemId)!;
        const posting = item.inventoryPosting!;
        await tx.lcItem.update({ where: { id: item.id }, data: { inventoryItemId: row.inventoryItemId } });
        await tx.lcInventoryPosting.update({ where: { id: posting.id }, data: { warehouseId: row.warehouseId } });
        await tx.stockMovement.update({
          where: { id: posting.stockMovementId! },
          data: { warehouseId: row.warehouseId, inventoryItemId: row.inventoryItemId },
        });
      }
      const valuation = await rebuildMovingAverageCosts(tx, lc.workspaceId, [...affectedInventoryIds]);
      await this.requireInventoryService().reconcileMovingAverageLedger(tx, lc.workspaceId, valuation.movements, currentUser.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId: lc.workspaceId,
      userId: currentUser.id,
      action: "LC_INVENTORY_POSTING_UPDATED",
      entityType: "LcMaster",
      entityId: lcId,
      newValues: { items: dto.items },
    });
    return this.getById(currentUser, lcId);
  }

  async reopenLandedCost(currentUser: AuthenticatedRequestUser, lcId: string, dto: ReopenLcLandedCostDto) {
    const lc = await this.loadLc(currentUser, lcId);
    if (!lc.landedCost || lc.landedCost.status !== LcLandedCostStatus.FINALIZED) {
      throw new BadRequestException("This LC's landed cost is not finalized.");
    }
    if (!dto.reason?.trim()) throw new BadRequestException("A reason is required to reopen a finalized landed cost.");
    if (lc.items.some((item) => item.inventoryPosting)) {
      throw new BadRequestException("This LC has already been posted to inventory and cannot be reopened. Reverse the inventory receipt first.");
    }

    if (lc.landedCost.glVoucherId) {
      await this.postingEngine.reverseVoucher(currentUser, lc.landedCost.glVoucherId, `Reopened LC ${lc.lcNumber}: ${dto.reason}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lcLandedCost.update({
        where: { lcId },
        data: { status: LcLandedCostStatus.DRAFT, reopenedByUserId: currentUser.id, reopenedAt: new Date(), reopenReason: dto.reason },
      });
      await tx.lcCostEntry.updateMany({ where: { lcId }, data: { isLocked: false } });
      await tx.lcMaster.update({ where: { id: lcId }, data: { status: LcStatus.READY_TO_FINALIZE } });
    });

    await this.recordStatusChange(currentUser, lcId, LcStatus.FINALIZED, LcStatus.READY_TO_FINALIZE, dto.reason);
    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      userId: currentUser.id,
      action: "LC_LANDED_COST_REOPENED",
      entityType: "LcMaster",
      entityId: lcId,
      newValues: { reason: dto.reason },
    });

    return this.getById(currentUser, lcId);
  }

  // ===========================================================================
  // Reports
  // ===========================================================================

  async getLcRegister(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    return this.list(currentUser, workspaceId);
  }

  async getCostReportByCategory(currentUser: AuthenticatedRequestUser, workspaceId: string, category: string) {
    const entries = await this.prisma.lcCostEntry.findMany({
      where: { costHead: { ...(category === "ALL" ? {} : { category: category as never }), workspaceId }, lc: { companyId: currentUser.companyId } },
      include: { costHead: true, lc: true, allocations: true },
      orderBy: { createdAt: "desc" },
    });
    return entries.map((entry) => {
      const allocatedTotal = sumDecimals(entry.allocations.map((allocation) => allocation.finalAmount));
      const remainingAmount = toDecimal(entry.bdtAmount).sub(allocatedTotal);
      return {
        id: entry.id,
        lcId: entry.lcId,
        lcNumber: entry.lc.lcNumber,
        supplierName: entry.lc.supplierName,
        costHeadName: entry.costHead.name,
        vendorName: entry.vendorName,
        invoiceNumber: entry.invoiceNumber,
        invoiceDate: entry.invoiceDate,
        currency: entry.currency,
        foreignAmount: entry.foreignAmount ? Number(entry.foreignAmount) : null,
        exchangeRate: entry.exchangeRate ? Number(entry.exchangeRate) : null,
        bdtAmount: Number(entry.bdtAmount),
        allocatedTotal: toNumber2(allocatedTotal),
        remainingAmount: toNumber2(remainingAmount),
        isFullyAllocated: isZero(remainingAmount),
        isLocked: entry.isLocked,
        remarks: entry.remarks,
        paymentMethod: entry.paymentMethod as "CREDIT" | "CASH_BANK_MFS" | null,
        creditPayeeName: entry.creditPayeeName,
        paymentAllocations: this.readPaymentAllocations(entry.paymentAllocations),
        createdAt: entry.createdAt,
      };
    });
  }

  async getProductLandedCostReport(currentUser: AuthenticatedRequestUser, lcId: string) {
    return this.previewLandedCost(currentUser, lcId);
  }

  async getCompleteLcCostSheet(currentUser: AuthenticatedRequestUser, lcId: string) {
    const detail = await this.getById(currentUser, lcId);
    const landedCost = await this.previewLandedCost(currentUser, lcId);
    return { lc: detail, landedCost };
  }

  async getAllocationReport(currentUser: AuthenticatedRequestUser, lcId: string) {
    const lc = await this.loadLc(currentUser, lcId);
    return lc.costEntries.map(serializeCostEntry);
  }
}
