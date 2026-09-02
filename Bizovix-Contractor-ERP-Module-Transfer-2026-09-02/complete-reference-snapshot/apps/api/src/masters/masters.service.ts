import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { InventoryItemKind, InventoryItemStatus, PartyStatus, PartyType, Prisma, StockMovementType } from "../generated/prisma/index.js";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PermissionsService } from "../common/services/permissions.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RecycleBinService } from "../recycle-bin/recycle-bin.service.js";
import {
  readMovingAverageCosts,
  rebuildMovingAverageCosts,
} from "../inventory/moving-average.js";
import { InventoryService } from "../inventory/inventory.service.js";
import { roundMoney } from "../accounting/money.util.js";
import { ensurePartyAccount } from "./party-account-sync.js";

/** Party contact/date extras arrive as plain strings from the web client; keep empty
 * strings out of the column and reject junk dates instead of writing Invalid Date. */
function normalizeOptionalText(value?: string | null) {
  if (value == null) return null;
  return String(value).trim() || null;
}

function normalizeOptionalDate(value?: string | null) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException("Date must be a valid calendar date");
  }
  return parsed;
}

@Injectable()
export class MastersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RecycleBinService) private readonly recycleBinService: RecycleBinService,
    @Inject(PermissionsService) private readonly permissionsService: PermissionsService,
    @Optional() @Inject(InventoryService) private readonly inventoryService?: InventoryService,
  ) {}

  private mapInventoryStatus(value?: string | null) {
    return String(value ?? "").trim().toLowerCase() === "inactive" ? InventoryItemStatus.INACTIVE : InventoryItemStatus.ACTIVE;
  }

  private normalizeBillMaturityDays(value?: number | null) {
    if (value == null || String(value).trim() === "") return 30;
    const days = Number(value);
    if (!Number.isInteger(days) || days < 0 || days > 3650) {
      throw new BadRequestException("Bill maturity days must be a whole number between 0 and 3650");
    }
    return days;
  }

  private toInventoryItemOutput(item: {
    id: string;
    itemCode: string;
    itemName: string;
    kind: InventoryItemKind;
    alias: string | null;
    category: string;
    categoryId: string | null;
    unit: string;
    alternateUnit: string | null;
    alternateUnitConversion: Prisma.Decimal | number | null;
    description: string | null;
    languageAlias: string | null;
    partNumber: string | null;
    notes: string | null;
    openingQty: Prisma.Decimal | number;
    openingRate: Prisma.Decimal | number;
    reorderLevel: Prisma.Decimal | number;
    expiryDate: Date | null;
    trackBatchExpiry: boolean;
    status: InventoryItemStatus;
    createdAt: Date;
  }) {
    return {
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      kind: item.kind === InventoryItemKind.SERVICE ? "service" : "product",
      alias: item.alias ?? "",
      category: item.category,
      categoryId: item.categoryId,
      unit: item.unit,
      alternateUnit: item.alternateUnit ?? "",
      alternateUnitConversion: item.alternateUnitConversion == null ? 0 : Number(item.alternateUnitConversion),
      description: item.description ?? "",
      languageAlias: item.languageAlias ?? "",
      partNumber: item.partNumber ?? "",
      notes: item.notes ?? "",
      openingQty: Number(item.openingQty),
      openingRate: Number(item.openingRate),
      quantity: Number(item.openingQty),
      rate: Number(item.openingRate),
      reorderLevel: Number(item.reorderLevel),
      expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null,
      trackBatchExpiry: item.trackBatchExpiry,
      status: item.status === InventoryItemStatus.INACTIVE ? "inactive" : "active",
      createdAt: item.createdAt.toISOString(),
    };
  }

  async listParties(currentUser: AuthenticatedRequestUser, workspaceId?: string, type?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    const granted = await this.permissionsService.getGrantedKeys(currentUser);
    const scope = this.permissionsService.resolveScope(granted, "party", "view");
    if (scope === "none") {
      throw new ForbiddenException("You do not have permission to view parties");
    }

    return this.prisma.party.findMany({
      where: {
        workspaceId: targetWorkspaceId,
        status: PartyStatus.ACTIVE,
        type: type ? (type.toLowerCase() === "supplier" ? PartyType.SUPPLIER : PartyType.CUSTOMER) : undefined,
        createdByUserId: scope === "own" ? currentUser.id : undefined,
      },
      orderBy: { name: "asc" },
    });
  }

  async createParty(
    currentUser: AuthenticatedRequestUser,
    payload?: {
      workspaceId?: string;
      name?: string;
      partyCategory?: string;
      type?: string;
      contact?: string | null;
      contactPerson?: string | null;
      whatsappNumber?: string | null;
      dateOfBirth?: string | null;
      marriageDate?: string | null;
      address?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      district?: string | null;
      postalCode?: string | null;
      country?: string | null;
      creditLimit?: number;
      openingBalance?: number;
      openingBalanceDate?: string | null;
      billMaturityDays?: number;
    },
  ) {
    const targetWorkspaceId = payload?.workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    const nextName = String(payload?.name ?? "").trim();
    if (!nextName) {
      throw new BadRequestException("Party name is required");
    }

    const nextType = String(payload?.type ?? "customer").toLowerCase() === "supplier" ? PartyType.SUPPLIER : PartyType.CUSTOMER;
    const nextPartyCategory = String(payload?.partyCategory ?? "business").trim().toLowerCase();
    if (nextPartyCategory !== "business" && nextPartyCategory !== "individual") {
      throw new BadRequestException("Party type must be Business or Individual");
    }

    const duplicate = await this.prisma.party.findUnique({
      where: {
        workspaceId_type_name: {
          workspaceId: targetWorkspaceId,
          type: nextType,
          name: nextName,
        },
      },
    });

    if (duplicate) {
      throw new BadRequestException("A party with this name already exists");
    }

    const openingBalance = Number.isFinite(Number(payload?.openingBalance)) ? roundMoney(payload?.openingBalance) : 0;
    const openingBalanceDate = openingBalance === 0
      ? null
      : normalizeOptionalDate(payload?.openingBalanceDate) ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: {
          tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId: targetWorkspaceId,
          name: nextName, partyCategory: nextPartyCategory.toUpperCase(), type: nextType,
          contact: payload?.contact == null ? null : String(payload.contact).trim() || null,
          contactPerson: normalizeOptionalText(payload?.contactPerson),
          whatsappNumber: normalizeOptionalText(payload?.whatsappNumber),
          dateOfBirth: normalizeOptionalDate(payload?.dateOfBirth),
          marriageDate: normalizeOptionalDate(payload?.marriageDate),
          address: payload?.address == null ? null : String(payload.address).trim() || null,
          addressLine1: normalizeOptionalText(payload?.addressLine1),
          addressLine2: normalizeOptionalText(payload?.addressLine2),
          city: normalizeOptionalText(payload?.city),
          district: normalizeOptionalText(payload?.district),
          postalCode: normalizeOptionalText(payload?.postalCode),
          country: normalizeOptionalText(payload?.country),
          creditLimit: Number.isFinite(Number(payload?.creditLimit)) ? roundMoney(payload?.creditLimit) : 0,
          openingBalance,
          openingBalanceDate,
          billMaturityDays: this.normalizeBillMaturityDays(payload?.billMaturityDays),
          status: PartyStatus.ACTIVE,
          createdByUserId: currentUser.id,
        },
      });
      const ledgerAccount = await ensurePartyAccount(tx, party, currentUser.id);
      return { ...party, ledgerAccountId: ledgerAccount.id };
    });
  }

  async importParties(
    currentUser: AuthenticatedRequestUser,
    payload?: {
      workspaceId?: string;
      parties?: Array<{
        name?: string;
        type?: string;
        contact?: string | null;
        email?: string | null;
        address?: string | null;
        creditLimit?: number;
        openingBalance?: number;
        openingBalanceDate?: string | null;
        billMaturityDays?: number;
        status?: string;
      }>;
    },
  ) {
    const targetWorkspaceId = payload?.workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    const rows = Array.isArray(payload?.parties) ? payload.parties : [];
    if (!rows.length) {
      throw new BadRequestException("No parties found in the import file");
    }

    if (rows.length > 1000) {
      throw new BadRequestException("You can import up to 1000 parties at a time");
    }

    const existingParties = await this.prisma.party.findMany({
      where: { workspaceId: targetWorkspaceId },
      select: { name: true, type: true },
    });
    const seen = new Set(existingParties.map((party) => `${party.type}:${party.name.trim().toLowerCase()}`));
    const imported: string[] = [];
    const skipped: Array<{ row: number; name: string; reason: string }> = [];

    const data: Prisma.PartyCreateManyInput[] = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const name = String(row?.name ?? "").trim();
      const rawType = String(row?.type ?? "customer").trim().toLowerCase();
      const type = rawType === "supplier" ? PartyType.SUPPLIER : PartyType.CUSTOMER;
      const status = String(row?.status ?? "active").trim().toLowerCase();

      if (!name) {
        skipped.push({ row: rowNumber, name: "", reason: "Party name is required" });
        return;
      }

      if (status === "inactive") {
        skipped.push({ row: rowNumber, name, reason: "Inactive parties were skipped" });
        return;
      }

      const duplicateKey = `${type}:${name.toLowerCase()}`;
      if (seen.has(duplicateKey)) {
        skipped.push({ row: rowNumber, name, reason: "Duplicate party in file or database" });
        return;
      }

      seen.add(duplicateKey);
      imported.push(name);
      const openingBalance = Number.isFinite(Number(row?.openingBalance)) ? roundMoney(row?.openingBalance) : 0;
      data.push({
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: targetWorkspaceId,
        name,
        type,
        contact: row?.contact == null ? null : String(row.contact).trim() || null,
        address: [row?.address, row?.email ? `Email: ${String(row.email).trim()}` : ""]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
          .join("\n") || null,
        creditLimit: Number.isFinite(Number(row?.creditLimit)) ? roundMoney(row?.creditLimit) : 0,
        openingBalance,
        openingBalanceDate: openingBalance === 0
          ? null
          : normalizeOptionalDate(row?.openingBalanceDate) ?? new Date(),
        billMaturityDays: this.normalizeBillMaturityDays(row?.billMaturityDays),
        status: PartyStatus.ACTIVE,
        createdByUserId: currentUser.id,
      });
    });

    if (data.length) {
      await this.prisma.$transaction(async (tx) => {
        for (const row of data) {
          const party = await tx.party.create({ data: row });
          await ensurePartyAccount(tx, party, currentUser.id);
        }
      });
    }

    return {
      success: true,
      totalRows: rows.length,
      importedCount: data.length,
      skippedCount: skipped.length,
      imported,
      skipped,
    };
  }

  async updateParty(
    currentUser: AuthenticatedRequestUser,
    partyId: string,
    payload?: {
      name?: string;
      partyCategory?: string;
      contact?: string | null;
      contactPerson?: string | null;
      whatsappNumber?: string | null;
      dateOfBirth?: string | null;
      marriageDate?: string | null;
      address?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      district?: string | null;
      postalCode?: string | null;
      country?: string | null;
      creditLimit?: number;
      openingBalance?: number;
      openingBalanceDate?: string | null;
      billMaturityDays?: number;
    },
  ) {
    const existingParty = await this.prisma.party.findUnique({
      where: { id: partyId },
    });

    if (!existingParty) {
      throw new NotFoundException("Party not found");
    }

    await this.ensureWorkspaceAccess(currentUser, existingParty.workspaceId);
    await this.assertRecordScope(currentUser, "party", "edit", existingParty.createdByUserId);

    const nextName = String(payload?.name ?? existingParty.name).trim();
    if (!nextName) {
      throw new BadRequestException("Party name is required");
    }


    const nextPartyCategory = String(payload?.partyCategory ?? existingParty.partyCategory).trim().toLowerCase();
    if (nextPartyCategory !== "business" && nextPartyCategory !== "individual") {
      throw new BadRequestException("Party type must be Business or Individual");
    }

    const nextContact = payload?.contact == null ? null : String(payload.contact).trim() || null;
    const nextContactPerson = payload?.contactPerson === undefined ? existingParty.contactPerson : normalizeOptionalText(payload.contactPerson);
    const nextWhatsappNumber = payload?.whatsappNumber === undefined ? existingParty.whatsappNumber : normalizeOptionalText(payload.whatsappNumber);
    const nextDateOfBirth = payload?.dateOfBirth === undefined ? existingParty.dateOfBirth : normalizeOptionalDate(payload.dateOfBirth);
    const nextMarriageDate = payload?.marriageDate === undefined ? existingParty.marriageDate : normalizeOptionalDate(payload.marriageDate);
    const nextAddress = payload?.address == null ? null : String(payload.address).trim() || null;
    const nextAddressLine1 = payload?.addressLine1 === undefined ? existingParty.addressLine1 : normalizeOptionalText(payload.addressLine1);
    const nextAddressLine2 = payload?.addressLine2 === undefined ? existingParty.addressLine2 : normalizeOptionalText(payload.addressLine2);
    const nextCity = payload?.city === undefined ? existingParty.city : normalizeOptionalText(payload.city);
    const nextDistrict = payload?.district === undefined ? existingParty.district : normalizeOptionalText(payload.district);
    const nextPostalCode = payload?.postalCode === undefined ? existingParty.postalCode : normalizeOptionalText(payload.postalCode);
    const nextCountry = payload?.country === undefined ? existingParty.country : normalizeOptionalText(payload.country);
    const nextCreditLimit = Number.isFinite(Number(payload?.creditLimit)) ? roundMoney(payload?.creditLimit) : roundMoney(existingParty.creditLimit);
    const nextOpeningBalance = Number.isFinite(Number(payload?.openingBalance))
      ? roundMoney(payload?.openingBalance)
      : roundMoney(existingParty.openingBalance);
    const nextOpeningBalanceDate = nextOpeningBalance === 0
      ? null
      : payload?.openingBalanceDate === undefined
        ? existingParty.openingBalanceDate ?? new Date()
        : normalizeOptionalDate(payload.openingBalanceDate) ?? new Date();
    const nextBillMaturityDays = payload?.billMaturityDays === undefined
      ? existingParty.billMaturityDays
      : this.normalizeBillMaturityDays(payload.billMaturityDays);

    const updatedParty = await this.prisma.$transaction(async (tx) => {
      const party = await tx.party.update({
        where: { id: partyId },
        data: {
          name: nextName,
          partyCategory: nextPartyCategory.toUpperCase(),
          contact: nextContact,
          contactPerson: nextContactPerson,
          whatsappNumber: nextWhatsappNumber,
          dateOfBirth: nextDateOfBirth,
          marriageDate: nextMarriageDate,
          address: nextAddress,
          addressLine1: nextAddressLine1,
          addressLine2: nextAddressLine2,
          city: nextCity,
          district: nextDistrict,
          postalCode: nextPostalCode,
          country: nextCountry,
          creditLimit: nextCreditLimit,
          openingBalance: nextOpeningBalance,
          openingBalanceDate: nextOpeningBalanceDate,
          billMaturityDays: nextBillMaturityDays,
        },
      });

      if (party.name !== existingParty.name) {
        await tx.voucherEntry.updateMany({
          where: {
            workspaceId: existingParty.workspaceId,
            partyId: existingParty.id,
          },
          data: {
            partyName: party.name,
          },
        });
      }

      const ledgerAccount = await ensurePartyAccount(tx, party, currentUser.id);

      return { ...party, ledgerAccountId: ledgerAccount.id };
    });

    return updatedParty;
  }

  async deleteParty(currentUser: AuthenticatedRequestUser, partyId: string) {
    const existing = await this.prisma.party.findUnique({
      where: { id: partyId },
      include: {
        voucherEntries: {
          take: 1,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("Party not found");
    }

    await this.ensureWorkspaceAccess(currentUser, existing.workspaceId);
    await this.assertRecordScope(currentUser, "party", "delete", existing.createdByUserId);

    await this.recycleBinService.movePartyToRecycleBin(currentUser, existing.id);
    return { success: true, id: existing.id, recycled: true };
  }

  async listInventory(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    const granted = await this.permissionsService.getGrantedKeys(currentUser);
    const viewScope = this.permissionsService.resolveScope(granted, "item", "view");
    if (viewScope === "none") {
      throw new ForbiddenException("You do not have permission to view items");
    }

    const { items, adjustments, valuation } = await this.prisma.$transaction(
      async (tx) => {
        const valuation = await readMovingAverageCosts(tx, targetWorkspaceId);
        await this.assertValuationStockPolicy(tx, targetWorkspaceId, valuation.movements);
        const [items, adjustments] = await Promise.all([
          tx.inventoryItem.findMany({
            where: {
              workspaceId: targetWorkspaceId,
              status: InventoryItemStatus.ACTIVE,
            },
            orderBy: { itemName: "asc" },
          }),
          tx.inventoryAdjustment.findMany({
            where: { workspaceId: targetWorkspaceId },
            orderBy: [{ adjustmentDate: "asc" }, { createdAt: "asc" }],
          }),
        ]);
        return { items, adjustments, valuation };
      },
    );
    const balanceByItem = new Map<string, { quantity: number; value: number }>();
    for (const balance of valuation.balances.values()) {
      const current = balanceByItem.get(balance.inventoryItemId) ?? { quantity: 0, value: 0 };
      current.quantity += balance.quantity;
      current.value += balance.value;
      balanceByItem.set(balance.inventoryItemId, current);
    }
    const adjustmentsByItem = new Map<string, typeof adjustments>();
    for (const adjustment of adjustments) {
      adjustmentsByItem.set(adjustment.inventoryItemId, [...(adjustmentsByItem.get(adjustment.inventoryItemId) ?? []), adjustment]);
    }

    // Valuation above must always run across every item in the workspace —
    // moving-average costing is a workspace-wide computation, not scoped to
    // one user's records. "Limited" only narrows which items this response
    // actually lists, never what the costing math is based on.
    const visibleItems = viewScope === "own" ? items.filter((item) => item.createdByUserId === currentUser.id) : items;

    return visibleItems.map((item) => {
      const base = this.toInventoryItemOutput(item);
      const balance = balanceByItem.get(item.id) ?? { quantity: 0, value: 0 };
      return {
        ...base,
        quantity: balance.quantity,
        rate: balance.quantity === 0 ? 0 : balance.value / balance.quantity,
        stockValue: roundMoney(balance.value),
        adjustments: (adjustmentsByItem.get(item.id) ?? []).map((adjustment) => ({
          id: adjustment.id,
          quantity: Number(adjustment.quantity),
          unitPrice: Number(adjustment.unitPrice),
          note: adjustment.note,
          reason: adjustment.reason,
          adjustmentDate: adjustment.adjustmentDate.toISOString(),
          warehouseId: adjustment.warehouseId,
        })),
      };
    });
  }

  async createInventoryAdjustment(
    currentUser: AuthenticatedRequestUser,
    itemId: string,
    payload?: {
      quantity?: number;
      unitPrice?: number;
      note?: string;
      reason?: string;
      adjustmentDate?: string;
      warehouseId?: string;
      batchNumber?: string;
      manufacturedAt?: string;
      expiresAt?: string;
    },
  ) {
    const existing = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
    });

    if (!existing) {
      throw new NotFoundException("Inventory item not found");
    }

    await this.ensureWorkspaceAccess(currentUser, existing.workspaceId);

    const quantity = Number(payload?.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) {
      throw new BadRequestException("Adjustment quantity must be a non-zero number");
    }

    const snapshot = await this.listInventory(currentUser, existing.workspaceId);
    const currentRow = snapshot.find((row) => row.id === itemId);
    const currentQuantity = currentRow?.quantity ?? Number(existing.openingQty);

    if (currentQuantity + quantity < 0) {
      throw new BadRequestException("Reduce quantity cannot be greater than current stock");
    }

    const adjustmentDate = payload?.adjustmentDate ? new Date(payload.adjustmentDate) : new Date();
    if (Number.isNaN(adjustmentDate.getTime())) {
      throw new BadRequestException("Invalid adjustment date");
    }
    const batch = this.parseBatchTracking(existing.trackBatchExpiry, true, payload);

    if (!payload?.warehouseId) throw new BadRequestException("Warehouse is required for stock adjustment");
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: payload.warehouseId, workspaceId: existing.workspaceId, isActive: true, deletedAt: null } });
    if (!warehouse) throw new BadRequestException("Select an active warehouse for this adjustment");
    if (quantity < 0) {
      const movements = await this.prisma.stockMovement.groupBy({ by: ["movementType"], where: { workspaceId: existing.workspaceId, warehouseId: warehouse.id, inventoryItemId: existing.id, voidedAt: null, ...(existing.trackBatchExpiry ? { batchNumber: batch.batchNumber, expiresAt: batch.expiresAt } : {}) }, _sum: { quantity: true } });
      const warehouseQuantity = movements.reduce((sum, movement) => sum + Number(movement._sum.quantity ?? 0) * (movement.movementType === StockMovementType.IN ? 1 : -1), 0);
      if (warehouseQuantity + quantity < 0) throw new BadRequestException(`Insufficient stock in ${warehouse.name}. Available: ${warehouseQuantity}, Required: ${Math.abs(quantity)}.`);
    }

    const latestWarehouseMovement = quantity < 0
      ? await this.prisma.stockMovement.findFirst({
          where: { workspaceId: existing.workspaceId, warehouseId: warehouse.id, inventoryItemId: existing.id, voidedAt: null },
          orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
          select: { averageCost: true },
        })
      : null;
    const adjustmentUnitCost = quantity < 0
      ? Number(latestWarehouseMovement?.averageCost ?? currentRow?.rate ?? existing.openingRate)
      : Number(payload?.unitPrice ?? currentRow?.rate ?? existing.openingRate);
    if (!Number.isFinite(adjustmentUnitCost) || adjustmentUnitCost < 0) {
      throw new BadRequestException("Adjustment rate must be zero or greater");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.inventoryAdjustment.create({ data: {
        tenantId: existing.tenantId,
        companyId: existing.companyId,
        workspaceId: existing.workspaceId,
        inventoryItemId: existing.id,
        warehouseId: warehouse.id,
        quantity,
        unitPrice: adjustmentUnitCost,
        note: payload?.note?.trim() || null,
        reason: payload?.reason?.trim() || null,
        adjustmentDate,
        batchNumber: batch.batchNumber,
        manufacturedAt: batch.manufacturedAt,
        expiresAt: batch.expiresAt,
        createdByUserId: currentUser.id,
      } });
      await tx.stockMovement.create({ data: {
        tenantId: existing.tenantId, companyId: existing.companyId, workspaceId: existing.workspaceId,
        warehouseId: warehouse.id, inventoryItemId: existing.id, transactionType: "STOCK_ADJUSTMENT",
        transactionId: adjustment.id, transactionLineId: adjustment.id, referenceNo: adjustment.reason || adjustment.note,
        movementType: quantity > 0 ? StockMovementType.IN : StockMovementType.OUT, quantity: Math.abs(quantity),
        unit: existing.unit, inputUnitCost: quantity > 0 ? adjustment.unitPrice : null, transactionDate: adjustmentDate, postedByUserId: currentUser.id,
        idempotencyKey: `adjustment:${adjustment.id}`,
        batchNumber: batch.batchNumber, manufacturedAt: batch.manufacturedAt, expiresAt: batch.expiresAt,
      } });
      const valuation = await rebuildMovingAverageCosts(tx, existing.workspaceId, [existing.id]);
      await this.assertValuationStockPolicy(tx, existing.workspaceId, valuation.movements);
      await this.inventoryService?.reconcileMovingAverageLedger(tx, existing.workspaceId, valuation.movements, currentUser.id);
      return adjustment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return {
      id: created.id,
      quantity: Number(created.quantity),
      unitPrice: Number(created.unitPrice),
      note: created.note,
      reason: created.reason,
      adjustmentDate: created.adjustmentDate.toISOString(),
      warehouseId: created.warehouseId,
      batchNumber: created.batchNumber,
      manufacturedAt: created.manufacturedAt?.toISOString() ?? null,
      expiresAt: created.expiresAt?.toISOString() ?? null,
    };
  }

  async updateInventoryAdjustment(
    currentUser: AuthenticatedRequestUser,
    itemId: string,
    adjustmentId: string,
    payload?: {
      quantity?: number;
      unitPrice?: number;
      note?: string;
      reason?: string;
      adjustmentDate?: string;
      warehouseId?: string;
      batchNumber?: string;
      manufacturedAt?: string;
      expiresAt?: string;
    },
  ) {
    const existingAdjustment = await this.prisma.inventoryAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!existingAdjustment || existingAdjustment.inventoryItemId !== itemId) {
      throw new NotFoundException("Inventory adjustment not found");
    }

    await this.ensureWorkspaceAccess(currentUser, existingAdjustment.workspaceId);

    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException("Inventory item not found");
    }

    const quantity = payload?.quantity !== undefined ? Number(payload.quantity) : Number(existingAdjustment.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) {
      throw new BadRequestException("Adjustment quantity must be a non-zero number");
    }

    const snapshot = await this.listInventory(currentUser, item.workspaceId);
    const currentRow = snapshot.find((row) => row.id === itemId);
    const currentQuantity = currentRow?.quantity ?? Number(item.openingQty);
    const quantityWithoutExistingAdjustment = currentQuantity - Number(existingAdjustment.quantity);

    if (quantityWithoutExistingAdjustment + quantity < 0) {
      throw new BadRequestException("Reduce quantity cannot be greater than current stock");
    }

    const adjustmentDate = payload?.adjustmentDate ? new Date(payload.adjustmentDate) : existingAdjustment.adjustmentDate;
    if (Number.isNaN(adjustmentDate.getTime())) {
      throw new BadRequestException("Invalid adjustment date");
    }
    const batch = this.parseBatchTracking(item.trackBatchExpiry, true, {
      batchNumber: payload?.batchNumber ?? existingAdjustment.batchNumber ?? undefined,
      manufacturedAt: payload?.manufacturedAt ?? existingAdjustment.manufacturedAt?.toISOString(),
      expiresAt: payload?.expiresAt ?? existingAdjustment.expiresAt?.toISOString(),
    });
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: payload?.warehouseId ?? existingAdjustment.warehouseId, workspaceId: item.workspaceId, isActive: true, deletedAt: null },
    });
    if (!warehouse) throw new BadRequestException("Select an active warehouse for this adjustment");
    const latestWarehouseMovement = quantity < 0
      ? await this.prisma.stockMovement.findFirst({
          where: { workspaceId: item.workspaceId, warehouseId: warehouse.id, inventoryItemId: item.id, voidedAt: null },
          orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
          select: { averageCost: true },
        })
      : null;
    const unitPrice = quantity < 0
      ? Number(latestWarehouseMovement?.averageCost ?? existingAdjustment.unitPrice)
      : payload?.unitPrice !== undefined ? Number(payload.unitPrice) : Number(existingAdjustment.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new BadRequestException("Adjustment rate must be zero or greater");
    }
    if (quantity < 0) {
      const movements = await this.prisma.stockMovement.groupBy({
        by: ["movementType"],
        where: { workspaceId: item.workspaceId, warehouseId: warehouse.id, inventoryItemId: item.id, voidedAt: null, ...(item.trackBatchExpiry ? { batchNumber: batch.batchNumber, expiresAt: batch.expiresAt } : {}) },
        _sum: { quantity: true },
      });
      const currentWarehouseQuantity = movements.reduce(
        (sum, movement) => sum + Number(movement._sum.quantity ?? 0) * (movement.movementType === StockMovementType.IN ? 1 : -1),
        0,
      );
      const sameTrackedBatch = !item.trackBatchExpiry || (
        existingAdjustment.batchNumber === batch.batchNumber &&
        existingAdjustment.expiresAt?.getTime() === batch.expiresAt?.getTime()
      );
      const quantityWithoutExisting = currentWarehouseQuantity - (warehouse.id === existingAdjustment.warehouseId && sameTrackedBatch ? Number(existingAdjustment.quantity) : 0);
      if (quantityWithoutExisting + quantity < 0) {
        throw new BadRequestException(`Insufficient stock in ${warehouse.name}. Available: ${Math.max(0, quantityWithoutExisting)}, Required: ${Math.abs(quantity)}.`);
      }
    }
    const adjustmentRevision = Date.now();

    const updated = await this.prisma.$transaction(async (tx) => {
      const activeMovements = await tx.stockMovement.findMany({ where: { transactionType: "STOCK_ADJUSTMENT", transactionId: adjustmentId, reversals: { none: {} } } });
      for (const movement of activeMovements) await tx.stockMovement.create({ data: {
        tenantId: movement.tenantId, companyId: movement.companyId, workspaceId: movement.workspaceId,
        warehouseId: movement.warehouseId, inventoryItemId: movement.inventoryItemId, transactionType: "STOCK_ADJUSTMENT_REVERSAL",
        transactionId: adjustmentId, transactionLineId: adjustmentId, referenceNo: movement.referenceNo,
        movementType: movement.movementType === StockMovementType.IN ? StockMovementType.OUT : StockMovementType.IN,
        quantity: movement.quantity, unit: movement.unit, inputUnitCost: null, transactionDate: existingAdjustment.adjustmentDate, postedByUserId: currentUser.id,
        reversalOfId: movement.id, idempotencyKey: `adjustment-reversal:${movement.id}`,
        batchNumber: movement.batchNumber, manufacturedAt: movement.manufacturedAt, expiresAt: movement.expiresAt,
      } });
      const adjustment = await tx.inventoryAdjustment.update({ where: { id: adjustmentId }, data: {
        quantity,
        unitPrice,
        note: payload?.note !== undefined ? payload.note.trim() || null : existingAdjustment.note,
        reason: payload?.reason !== undefined ? payload.reason.trim() || null : existingAdjustment.reason,
        adjustmentDate,
        warehouseId: warehouse.id,
        batchNumber: batch.batchNumber,
        manufacturedAt: batch.manufacturedAt,
        expiresAt: batch.expiresAt,
      } });
      const ledgerQuantity = activeMovements.length ? quantity : quantity - Number(existingAdjustment.quantity);
      if (ledgerQuantity !== 0) await tx.stockMovement.create({ data: {
        tenantId: item.tenantId, companyId: item.companyId, workspaceId: item.workspaceId,
        warehouseId: adjustment.warehouseId, inventoryItemId: item.id, transactionType: "STOCK_ADJUSTMENT",
        transactionId: adjustment.id, transactionLineId: adjustment.id, referenceNo: adjustment.reason || adjustment.note,
        movementType: ledgerQuantity > 0 ? StockMovementType.IN : StockMovementType.OUT, quantity: Math.abs(ledgerQuantity),
        unit: item.unit, inputUnitCost: ledgerQuantity > 0 ? adjustment.unitPrice : null, transactionDate: adjustmentDate, postedByUserId: currentUser.id,
        idempotencyKey: `adjustment:${adjustment.id}:revision:${adjustmentRevision}`,
        batchNumber: batch.batchNumber, manufacturedAt: batch.manufacturedAt, expiresAt: batch.expiresAt,
      } });
      const valuation = await rebuildMovingAverageCosts(tx, item.workspaceId, [item.id]);
      await this.assertValuationStockPolicy(tx, item.workspaceId, valuation.movements);
      await this.inventoryService?.reconcileMovingAverageLedger(tx, item.workspaceId, valuation.movements, currentUser.id);
      return adjustment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return {
      id: updated.id,
      quantity: Number(updated.quantity),
      unitPrice: Number(updated.unitPrice),
      note: updated.note,
      reason: updated.reason,
      adjustmentDate: updated.adjustmentDate.toISOString(),
      warehouseId: updated.warehouseId,
      batchNumber: updated.batchNumber,
      manufacturedAt: updated.manufacturedAt?.toISOString() ?? null,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
    };
  }

  async deleteInventoryAdjustment(currentUser: AuthenticatedRequestUser, itemId: string, adjustmentId: string) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id: adjustmentId },
    });

    if (!adjustment || adjustment.inventoryItemId !== itemId) {
      throw new NotFoundException("Inventory adjustment not found");
    }

    await this.ensureWorkspaceAccess(currentUser, adjustment.workspaceId);

    await this.prisma.$transaction(async (tx) => {
      const activeMovements = await tx.stockMovement.findMany({ where: { transactionType: "STOCK_ADJUSTMENT", transactionId: adjustmentId, reversals: { none: {} } } });
      for (const movement of activeMovements) await tx.stockMovement.create({ data: {
        tenantId: movement.tenantId, companyId: movement.companyId, workspaceId: movement.workspaceId,
        warehouseId: movement.warehouseId, inventoryItemId: movement.inventoryItemId, transactionType: "STOCK_ADJUSTMENT_REVERSAL",
        transactionId: adjustmentId, transactionLineId: adjustmentId, referenceNo: movement.referenceNo,
        movementType: movement.movementType === StockMovementType.IN ? StockMovementType.OUT : StockMovementType.IN,
        quantity: movement.quantity, unit: movement.unit, inputUnitCost: null, transactionDate: adjustment.adjustmentDate, postedByUserId: currentUser.id,
        reversalOfId: movement.id, idempotencyKey: `adjustment-delete-reversal:${movement.id}`,
        batchNumber: movement.batchNumber, manufacturedAt: movement.manufacturedAt, expiresAt: movement.expiresAt,
      } });
      if (!activeMovements.length) {
        const legacyQuantity = Number(adjustment.quantity);
        const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: adjustment.inventoryItemId } });
        await tx.stockMovement.create({ data: {
          tenantId: adjustment.tenantId, companyId: adjustment.companyId, workspaceId: adjustment.workspaceId,
          warehouseId: adjustment.warehouseId, inventoryItemId: adjustment.inventoryItemId, transactionType: "STOCK_ADJUSTMENT_REVERSAL",
          transactionId: adjustmentId, transactionLineId: adjustmentId, referenceNo: adjustment.reason || adjustment.note,
          movementType: legacyQuantity > 0 ? StockMovementType.OUT : StockMovementType.IN, quantity: Math.abs(legacyQuantity),
          unit: item.unit, inputUnitCost: legacyQuantity < 0 ? adjustment.unitPrice : null, transactionDate: adjustment.adjustmentDate, postedByUserId: currentUser.id,
          idempotencyKey: `legacy-adjustment-delete:${adjustment.id}`,
          batchNumber: adjustment.batchNumber, manufacturedAt: adjustment.manufacturedAt, expiresAt: adjustment.expiresAt,
        } });
      }
      await tx.inventoryAdjustment.delete({ where: { id: adjustmentId } });
      const valuation = await rebuildMovingAverageCosts(tx, adjustment.workspaceId, [adjustment.inventoryItemId]);
      await this.assertValuationStockPolicy(tx, adjustment.workspaceId, valuation.movements);
      await this.inventoryService?.reconcileMovingAverageLedger(tx, adjustment.workspaceId, valuation.movements, currentUser.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { success: true, id: adjustmentId };
  }

  async createInventory(
    currentUser: AuthenticatedRequestUser,
    payload?: {
      workspaceId?: string;
      itemCode?: string;
      itemName?: string;
      kind?: string;
      alias?: string;
      category?: string;
      unit?: string;
      alternateUnit?: string;
      alternateUnitConversion?: number;
      description?: string;
      languageAlias?: string;
      partNumber?: string;
      notes?: string;
      openingQty?: number;
      openingRate?: number;
      reorderLevel?: number;
      trackBatchExpiry?: boolean;
      openingBatchNumber?: string;
      openingManufacturedAt?: string;
      openingExpiresAt?: string;
      status?: string;
    },
  ) {
    const targetWorkspaceId = payload?.workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    const nextItemCode = String(payload?.itemCode ?? "").trim();
    const nextItemName = String(payload?.itemName ?? "").trim();
    const nextCategory = String(payload?.category ?? "").trim();
    if (!nextItemCode || !nextItemName) {
      throw new BadRequestException("Item code and item name are required");
    }

    if (!nextCategory) {
      throw new BadRequestException("Category is required");
    }

    const nextCategoryId = await this.ensureValidInventoryCategory(targetWorkspaceId, nextCategory);

    const duplicate = await this.prisma.inventoryItem.findFirst({
      where: {
        workspaceId: targetWorkspaceId,
        OR: [{ itemCode: nextItemCode }, { itemName: nextItemName }],
      },
    });

    if (duplicate) {
      throw new BadRequestException("This item code or item name already exists");
    }

    const itemKind = String(payload?.kind ?? "product").toLowerCase() === "service" ? InventoryItemKind.SERVICE : InventoryItemKind.PRODUCT;
    const openingQty = Number(payload?.openingQty ?? 0);
    const openingRate = Number(payload?.openingRate ?? 0);
    if (!Number.isFinite(openingQty) || openingQty < 0) {
      throw new BadRequestException("Opening quantity must be zero or greater");
    }
    if (!Number.isFinite(openingRate) || openingRate < 0) {
      throw new BadRequestException("Opening rate must be zero or greater");
    }
    if (itemKind === InventoryItemKind.SERVICE && openingQty !== 0) {
      throw new BadRequestException("Service items cannot have an opening stock quantity");
    }
    const trackBatchExpiry = itemKind === InventoryItemKind.PRODUCT && Boolean(payload?.trackBatchExpiry);
    const openingBatch = this.parseBatchTracking(trackBatchExpiry, openingQty > 0, {
      batchNumber: payload?.openingBatchNumber,
      manufacturedAt: payload?.openingManufacturedAt,
      expiresAt: payload?.openingExpiresAt,
    });
    const defaultWarehouse = itemKind === InventoryItemKind.PRODUCT && openingQty !== 0
      ? await this.prisma.warehouse.findFirst({ where: { workspaceId: targetWorkspaceId, isDefault: true, isActive: true, deletedAt: null } })
      : null;
    if (itemKind === InventoryItemKind.PRODUCT && openingQty !== 0 && !defaultWarehouse) throw new BadRequestException("Default warehouse is not configured");

    const created = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({ data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: targetWorkspaceId,
        itemCode: nextItemCode,
        itemName: nextItemName,
        kind: itemKind,
        alias: payload?.alias?.trim() || null,
        category: nextCategory,
        categoryId: nextCategoryId,
        unit: String(payload?.unit ?? "").trim() || "pcs",
        alternateUnit: payload?.alternateUnit?.trim() || null,
        alternateUnitConversion: Number.isFinite(Number(payload?.alternateUnitConversion)) && Number(payload?.alternateUnitConversion) > 0 ? Number(payload?.alternateUnitConversion) : null,
        description: payload?.description?.trim() || null,
        languageAlias: payload?.languageAlias?.trim() || null,
        partNumber: payload?.partNumber?.trim() || null,
        notes: payload?.notes?.trim() || null,
        openingQty,
        openingRate,
        reorderLevel: Number(payload?.reorderLevel ?? 0) || 0,
        expiryDate: null,
        trackBatchExpiry,
        status: this.mapInventoryStatus(payload?.status),
        createdByUserId: currentUser.id,
      } });
      if (defaultWarehouse && openingQty !== 0) await tx.stockMovement.create({ data: {
        tenantId: currentUser.tenantId, companyId: currentUser.companyId, workspaceId: targetWorkspaceId,
        warehouseId: defaultWarehouse.id, inventoryItemId: item.id, transactionType: "OPENING_STOCK",
        transactionId: item.id, transactionLineId: item.id, referenceNo: item.itemCode,
        movementType: openingQty > 0 ? StockMovementType.IN : StockMovementType.OUT, quantity: Math.abs(openingQty),
        unit: item.unit, inputUnitCost: openingQty > 0 ? item.openingRate : null, transactionDate: new Date(), postedByUserId: currentUser.id, idempotencyKey: `opening-stock:${item.id}`,
        batchNumber: openingBatch.batchNumber, manufacturedAt: openingBatch.manufacturedAt, expiresAt: openingBatch.expiresAt,
      } });
      if (defaultWarehouse && openingQty !== 0) {
        const valuation = await rebuildMovingAverageCosts(tx, targetWorkspaceId, [item.id]);
        await this.assertValuationStockPolicy(tx, targetWorkspaceId, valuation.movements);
        await this.inventoryService?.reconcileMovingAverageLedger(tx, targetWorkspaceId, valuation.movements, currentUser.id);
      }
      return item;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return this.toInventoryItemOutput(created);
  }

  private parseOptionalDate(value: string | null | undefined) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Invalid date");
    }

    return parsed;
  }

  private parseBatchTracking(
    enabled: boolean,
    requireReceiptDetails: boolean,
    payload?: { batchNumber?: string | null; manufacturedAt?: string | null; expiresAt?: string | null },
  ) {
    if (!enabled) return { batchNumber: null, manufacturedAt: null, expiresAt: null };
    const batchNumber = payload?.batchNumber?.trim() || null;
    const manufacturedAt = this.parseOptionalDate(payload?.manufacturedAt);
    const expiresAt = this.parseOptionalDate(payload?.expiresAt);
    if (requireReceiptDetails && !expiresAt) {
      throw new BadRequestException("Expiry Date is required for this item");
    }
    if (manufacturedAt && expiresAt && manufacturedAt > expiresAt) {
      throw new BadRequestException("Manufacturing Date cannot be after Expiry Date");
    }
    return { batchNumber, manufacturedAt, expiresAt };
  }

  async updateInventory(
    currentUser: AuthenticatedRequestUser,
    itemId: string,
    payload?: {
      itemCode?: string;
      itemName?: string;
      kind?: string;
      alias?: string;
      category?: string;
      unit?: string;
      alternateUnit?: string;
      alternateUnitConversion?: number;
      description?: string;
      languageAlias?: string;
      partNumber?: string;
      notes?: string;
      openingQty?: number;
      openingRate?: number;
      reorderLevel?: number;
      trackBatchExpiry?: boolean;
      openingBatchNumber?: string | null;
      openingManufacturedAt?: string | null;
      openingExpiresAt?: string | null;
      status?: string;
    },
  ) {
    const existing = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
    });

    if (!existing) {
      throw new NotFoundException("Inventory item not found");
    }

    await this.ensureWorkspaceAccess(currentUser, existing.workspaceId);
    await this.assertRecordScope(currentUser, "item", "edit", existing.createdByUserId);

    const nextItemCode = String(payload?.itemCode ?? existing.itemCode).trim();
    const nextItemName = String(payload?.itemName ?? existing.itemName).trim();
    const nextCategory = String(payload?.category ?? existing.category).trim();
    if (!nextItemCode || !nextItemName) {
      throw new BadRequestException("Item code and item name are required");
    }

    if (!nextCategory) {
      throw new BadRequestException("Category is required");
    }

    const nextCategoryId = await this.ensureValidInventoryCategory(existing.workspaceId, nextCategory);

    const duplicate = await this.prisma.inventoryItem.findFirst({
      where: {
        workspaceId: existing.workspaceId,
        id: { not: existing.id },
        OR: [{ itemCode: nextItemCode }, { itemName: nextItemName }],
      },
    });

    if (duplicate) {
      throw new BadRequestException("This item code or item name already exists");
    }

    const nextOpeningQty = Number(payload?.openingQty ?? existing.openingQty);
    const nextOpeningRate = Number(payload?.openingRate ?? existing.openingRate);
    const nextItemKind = payload?.kind !== undefined
      ? String(payload.kind).toLowerCase() === "service"
        ? InventoryItemKind.SERVICE
        : InventoryItemKind.PRODUCT
      : existing.kind;
    if (!Number.isFinite(nextOpeningQty) || nextOpeningQty < 0) {
      throw new BadRequestException("Opening quantity must be zero or greater");
    }
    if (!Number.isFinite(nextOpeningRate) || nextOpeningRate < 0) {
      throw new BadRequestException("Opening rate must be zero or greater");
    }
    if (nextItemKind === InventoryItemKind.SERVICE && nextOpeningQty !== 0) {
      throw new BadRequestException("Service items cannot have an opening stock quantity");
    }
    const openingChanged =
      nextOpeningQty !== Number(existing.openingQty) ||
      nextOpeningRate !== Number(existing.openingRate);
    const nextTrackBatchExpiry = nextItemKind === InventoryItemKind.PRODUCT
      ? payload?.trackBatchExpiry ?? existing.trackBatchExpiry
      : false;
    const openingMovement = openingChanged
      ? await this.prisma.stockMovement.findFirst({
          where: {
            workspaceId: existing.workspaceId,
            inventoryItemId: existing.id,
            transactionType: { in: ["OPENING_STOCK", "MIGRATION_OPENING"] },
            reversalOfId: null,
          },
          orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
        })
      : null;
    if (openingChanged) {
      const laterStockMovement = await this.prisma.stockMovement.findFirst({
        where: {
          workspaceId: existing.workspaceId,
          inventoryItemId: existing.id,
          transactionType: { notIn: ["OPENING_STOCK", "MIGRATION_OPENING"] },
        },
        select: { id: true },
      });
      if (laterStockMovement) {
        throw new BadRequestException("Opening quantity/rate is locked after stock transactions. Use a dated stock adjustment instead.");
      }
    }
    if (nextItemKind !== existing.kind) {
      const hasStockHistory = await this.prisma.stockMovement.findFirst({
        where: { workspaceId: existing.workspaceId, inventoryItemId: existing.id },
        select: { id: true },
      });
      if (hasStockHistory) throw new BadRequestException("An item with stock history cannot be changed between Product and Service");
    }
    const defaultWarehouse = openingChanged && nextOpeningQty > 0 && !openingMovement
      ? await this.prisma.warehouse.findFirst({ where: { workspaceId: existing.workspaceId, isDefault: true, isActive: true, deletedAt: null } })
      : null;
    if (openingChanged && nextOpeningQty > 0 && !openingMovement && !defaultWarehouse) {
      throw new BadRequestException("Default warehouse is not configured");
    }
    const openingBatch = this.parseBatchTracking(nextTrackBatchExpiry, openingChanged && nextOpeningQty > 0, {
      batchNumber: payload?.openingBatchNumber ?? openingMovement?.batchNumber,
      manufacturedAt: payload?.openingManufacturedAt ?? openingMovement?.manufacturedAt?.toISOString(),
      expiresAt: payload?.openingExpiresAt ?? openingMovement?.expiresAt?.toISOString(),
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.update({
        where: { id: existing.id },
        data: {
          itemCode: nextItemCode,
          itemName: nextItemName,
          kind: nextItemKind,
          alias: payload?.alias !== undefined ? payload.alias.trim() || null : existing.alias,
          category: nextCategory,
          categoryId: nextCategoryId,
          unit: String(payload?.unit ?? existing.unit).trim() || "pcs",
          alternateUnit: payload?.alternateUnit !== undefined ? payload.alternateUnit.trim() || null : existing.alternateUnit,
          alternateUnitConversion:
            payload?.alternateUnitConversion !== undefined
              ? Number.isFinite(Number(payload.alternateUnitConversion)) && Number(payload.alternateUnitConversion) > 0
                ? Number(payload.alternateUnitConversion)
                : null
              : existing.alternateUnitConversion,
          description: payload?.description !== undefined ? payload.description.trim() || null : existing.description,
          languageAlias: payload?.languageAlias !== undefined ? payload.languageAlias.trim() || null : existing.languageAlias,
          partNumber: payload?.partNumber !== undefined ? payload.partNumber.trim() || null : existing.partNumber,
          notes: payload?.notes !== undefined ? payload.notes.trim() || null : existing.notes,
          openingQty: nextOpeningQty,
          openingRate: nextOpeningRate,
          reorderLevel: Number(payload?.reorderLevel ?? existing.reorderLevel) || 0,
          expiryDate: null,
          trackBatchExpiry: nextTrackBatchExpiry,
          status: payload?.status ? this.mapInventoryStatus(payload.status) : existing.status,
        },
      });

      if (item.itemName !== existing.itemName) {
        await tx.voucherInventoryItem.updateMany({
          where: { inventoryItemId: existing.id },
          data: { itemName: item.itemName },
        });
      }

      if (openingChanged && openingMovement) {
        await tx.stockMovement.update({
          where: { id: openingMovement.id },
          data: {
            quantity: nextOpeningQty,
            movementType: StockMovementType.IN,
            inputUnitCost: nextOpeningRate,
            costingVersion: 0,
            unit: item.unit,
            referenceNo: item.itemCode,
            batchNumber: openingBatch.batchNumber,
            manufacturedAt: openingBatch.manufacturedAt,
            expiresAt: openingBatch.expiresAt,
          },
        });
      } else if (openingChanged && defaultWarehouse && nextOpeningQty > 0) {
        await tx.stockMovement.create({ data: {
          tenantId: item.tenantId, companyId: item.companyId, workspaceId: item.workspaceId,
          warehouseId: defaultWarehouse.id, inventoryItemId: item.id, transactionType: "OPENING_STOCK",
          transactionId: item.id, transactionLineId: item.id, referenceNo: item.itemCode,
          movementType: StockMovementType.IN, quantity: nextOpeningQty,
          unit: item.unit, inputUnitCost: nextOpeningRate, transactionDate: item.createdAt, postedByUserId: currentUser.id,
          idempotencyKey: `opening-stock:${item.id}`,
          batchNumber: openingBatch.batchNumber, manufacturedAt: openingBatch.manufacturedAt, expiresAt: openingBatch.expiresAt,
        } });
      }

      if (openingChanged) {
        const valuation = await rebuildMovingAverageCosts(tx, item.workspaceId, [item.id]);
        await this.assertValuationStockPolicy(tx, item.workspaceId, valuation.movements);
        await this.inventoryService?.reconcileMovingAverageLedger(tx, item.workspaceId, valuation.movements, currentUser.id);
      }

      return item;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return this.toInventoryItemOutput(updated);
  }

  async deleteInventory(currentUser: AuthenticatedRequestUser, itemId: string) {
    const existing = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      include: {
        voucherItems: {
          take: 1,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("Inventory item not found");
    }

    await this.ensureWorkspaceAccess(currentUser, existing.workspaceId);
    await this.assertRecordScope(currentUser, "item", "delete", existing.createdByUserId);

    await this.recycleBinService.moveItemToRecycleBin(currentUser, existing.id);
    return { success: true, id: existing.id, recycled: true };
  }

  async listInventoryCategories(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    const [categories, items] = await Promise.all([
      this.prisma.inventoryCategory.findMany({
        where: { workspaceId: targetWorkspaceId },
        orderBy: { name: "asc" },
      }),
      this.prisma.inventoryItem.groupBy({
        by: ["category"],
        where: { workspaceId: targetWorkspaceId },
        _count: { _all: true },
      }),
    ]);

    const itemCounts = new Map(items.map((row) => [row.category, row._count._all]));
    const categoryNamesById = new Map(categories.map((category) => [category.id, category.name]));

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      itemCount: itemCounts.get(category.name) ?? 0,
      parentId: category.parentId,
      parentName: category.parentId ? categoryNamesById.get(category.parentId) ?? null : null,
    }));
  }

  async createInventoryCategory(
    currentUser: AuthenticatedRequestUser,
    payload?: { workspaceId?: string; name?: string; parentId?: string | null },
  ) {
    const targetWorkspaceId = payload?.workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    const nextName = String(payload?.name ?? "").trim();
    if (!nextName) {
      throw new BadRequestException("Category name is required");
    }

    const nextParentId = payload?.parentId ? String(payload.parentId).trim() || null : null;
    if (nextParentId) {
      const parent = await this.prisma.inventoryCategory.findUnique({ where: { id: nextParentId } });
      if (!parent || parent.workspaceId !== targetWorkspaceId) {
        throw new BadRequestException("Parent category not found");
      }

      if (parent.parentId) {
        throw new BadRequestException("A subcategory cannot be used as a parent category");
      }
    }

    const duplicate = await this.prisma.inventoryCategory.findFirst({
      where: { workspaceId: targetWorkspaceId, name: nextName },
    });

    if (duplicate) {
      throw new BadRequestException("This category name already exists");
    }

    const created = await this.prisma.inventoryCategory.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: targetWorkspaceId,
        name: nextName,
        parentId: nextParentId,
      },
    });

    return {
      id: created.id,
      name: created.name,
      itemCount: 0,
      parentId: created.parentId,
      parentName: nextParentId ? (await this.prisma.inventoryCategory.findUnique({ where: { id: nextParentId } }))?.name ?? null : null,
    };
  }

  async updateInventoryCategory(
    currentUser: AuthenticatedRequestUser,
    categoryId: string,
    payload?: { name?: string; parentId?: string | null },
  ) {
    const existing = await this.prisma.inventoryCategory.findUnique({ where: { id: categoryId } });
    if (!existing) {
      throw new NotFoundException("Category not found");
    }

    await this.ensureWorkspaceAccess(currentUser, existing.workspaceId);

    const nextName = String(payload?.name ?? existing.name).trim();
    if (!nextName) {
      throw new BadRequestException("Category name is required");
    }

    const nextParentId =
      payload?.parentId !== undefined ? (payload.parentId ? String(payload.parentId).trim() || null : null) : existing.parentId;

    if (nextParentId) {
      if (nextParentId === existing.id) {
        throw new BadRequestException("A category cannot be its own parent");
      }

      const parent = await this.prisma.inventoryCategory.findUnique({ where: { id: nextParentId } });
      if (!parent || parent.workspaceId !== existing.workspaceId) {
        throw new BadRequestException("Parent category not found");
      }

      if (parent.parentId) {
        throw new BadRequestException("A subcategory cannot be used as a parent category");
      }

      const hasChildren = await this.prisma.inventoryCategory.findFirst({ where: { parentId: existing.id } });
      if (hasChildren) {
        throw new BadRequestException("This category has subcategories, so it cannot be moved under another category");
      }
    }

    const duplicate = await this.prisma.inventoryCategory.findFirst({
      where: { workspaceId: existing.workspaceId, name: nextName, id: { not: existing.id } },
    });

    if (duplicate) {
      throw new BadRequestException("This category name already exists");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const category = await tx.inventoryCategory.update({
        where: { id: existing.id },
        data: { name: nextName, parentId: nextParentId },
      });

      if (nextName !== existing.name) {
        await tx.inventoryItem.updateMany({
          where: { workspaceId: existing.workspaceId, category: existing.name },
          data: { category: nextName },
        });
      }

      return category;
    });

    const itemCount = await this.prisma.inventoryItem.count({ where: { workspaceId: existing.workspaceId, category: updated.name } });
    const parentName = updated.parentId
      ? ((await this.prisma.inventoryCategory.findUnique({ where: { id: updated.parentId } }))?.name ?? null)
      : null;

    return {
      id: updated.id,
      name: updated.name,
      itemCount,
      parentId: updated.parentId,
      parentName,
    };
  }

  async deleteInventoryCategory(currentUser: AuthenticatedRequestUser, categoryId: string) {
    const existing = await this.prisma.inventoryCategory.findUnique({ where: { id: categoryId } });
    if (!existing) {
      throw new NotFoundException("Category not found");
    }

    await this.ensureWorkspaceAccess(currentUser, existing.workspaceId);

    const [affectedItemsCount, affectedChildrenCount] = await this.prisma.$transaction(async (tx) => {
      const itemsResult = await tx.inventoryItem.updateMany({
        where: { workspaceId: existing.workspaceId, category: existing.name },
        data: { category: "Uncategorized", categoryId: null },
      });

      const childrenResult = await tx.inventoryCategory.updateMany({
        where: { parentId: existing.id },
        data: { parentId: null },
      });

      await tx.inventoryCategory.delete({ where: { id: existing.id } });

      return [itemsResult.count, childrenResult.count];
    });

    return {
      success: true,
      id: existing.id,
      reassignedItemCount: affectedItemsCount,
      promotedSubcategoryCount: affectedChildrenCount,
    };
  }

  async listInventoryUnits(currentUser: AuthenticatedRequestUser, workspaceId?: string) {
    const targetWorkspaceId = workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    const [units, items] = await Promise.all([
      this.prisma.inventoryUnit.findMany({
        where: { workspaceId: targetWorkspaceId },
        orderBy: { name: "asc" },
      }),
      this.prisma.inventoryItem.groupBy({
        by: ["unit"],
        where: { workspaceId: targetWorkspaceId },
        _count: { _all: true },
      }),
    ]);

    const itemCounts = new Map(items.map((row) => [row.unit, row._count._all]));

    return units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      itemCount: itemCounts.get(unit.name) ?? 0,
      alternateUnit: unit.alternateUnit ?? "",
      alternateUnitConversion: unit.alternateUnitConversion == null ? 0 : Number(unit.alternateUnitConversion),
    }));
  }

  async createInventoryUnit(
    currentUser: AuthenticatedRequestUser,
    payload?: { workspaceId?: string; name?: string; alternateUnit?: string; alternateUnitConversion?: number },
  ) {
    const targetWorkspaceId = payload?.workspaceId ?? currentUser.workspaceId;
    if (!targetWorkspaceId) {
      throw new ForbiddenException("No active workspace");
    }

    await this.ensureWorkspaceAccess(currentUser, targetWorkspaceId);

    const nextName = String(payload?.name ?? "").trim();
    if (!nextName) {
      throw new BadRequestException("Unit name is required");
    }

    const duplicate = await this.prisma.inventoryUnit.findUnique({
      where: { workspaceId_name: { workspaceId: targetWorkspaceId, name: nextName } },
    });

    if (duplicate) {
      throw new BadRequestException("This unit already exists");
    }

    const created = await this.prisma.inventoryUnit.create({
      data: {
        tenantId: currentUser.tenantId,
        companyId: currentUser.companyId,
        workspaceId: targetWorkspaceId,
        name: nextName,
        alternateUnit: payload?.alternateUnit?.trim() || null,
        alternateUnitConversion:
          Number.isFinite(Number(payload?.alternateUnitConversion)) && Number(payload?.alternateUnitConversion) > 0
            ? Number(payload?.alternateUnitConversion)
            : null,
      },
    });

    return {
      id: created.id,
      name: created.name,
      itemCount: 0,
      alternateUnit: created.alternateUnit ?? "",
      alternateUnitConversion: created.alternateUnitConversion == null ? 0 : Number(created.alternateUnitConversion),
    };
  }

  async updateInventoryUnit(
    currentUser: AuthenticatedRequestUser,
    unitId: string,
    payload?: { name?: string; alternateUnit?: string; alternateUnitConversion?: number },
  ) {
    const existing = await this.prisma.inventoryUnit.findUnique({ where: { id: unitId } });
    if (!existing) {
      throw new NotFoundException("Unit not found");
    }

    await this.ensureWorkspaceAccess(currentUser, existing.workspaceId);

    const nextName = String(payload?.name ?? existing.name).trim();
    if (!nextName) {
      throw new BadRequestException("Unit name is required");
    }

    if (nextName !== existing.name) {
      const duplicate = await this.prisma.inventoryUnit.findUnique({
        where: { workspaceId_name: { workspaceId: existing.workspaceId, name: nextName } },
      });

      if (duplicate) {
        throw new BadRequestException("This unit already exists");
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const unit = await tx.inventoryUnit.update({
        where: { id: existing.id },
        data: {
          name: nextName,
          alternateUnit: payload?.alternateUnit !== undefined ? payload.alternateUnit.trim() || null : existing.alternateUnit,
          alternateUnitConversion:
            payload?.alternateUnitConversion !== undefined
              ? Number.isFinite(Number(payload.alternateUnitConversion)) && Number(payload.alternateUnitConversion) > 0
                ? Number(payload.alternateUnitConversion)
                : null
              : existing.alternateUnitConversion,
        },
      });

      if (nextName !== existing.name) {
        await tx.inventoryItem.updateMany({
          where: { workspaceId: existing.workspaceId, unit: existing.name },
          data: { unit: nextName },
        });
      }

      return unit;
    });

    const itemCount = await this.prisma.inventoryItem.count({ where: { workspaceId: existing.workspaceId, unit: updated.name } });

    return {
      id: updated.id,
      name: updated.name,
      itemCount,
      alternateUnit: updated.alternateUnit ?? "",
      alternateUnitConversion: updated.alternateUnitConversion == null ? 0 : Number(updated.alternateUnitConversion),
    };
  }

  async deleteInventoryUnit(currentUser: AuthenticatedRequestUser, unitId: string) {
    const existing = await this.prisma.inventoryUnit.findUnique({ where: { id: unitId } });
    if (!existing) {
      throw new NotFoundException("Unit not found");
    }

    await this.ensureWorkspaceAccess(currentUser, existing.workspaceId);

    const reassignedItemCount = await this.prisma.$transaction(async (tx) => {
      const affectedItemCount = await tx.inventoryItem.count({
        where: { workspaceId: existing.workspaceId, unit: existing.name },
      });

      if (affectedItemCount > 0) {
        // The fallback must always be a unit that actually exists in this
        // workspace's taxonomy — a hardcoded "pcs"/"unit" string here would
        // silently point items at a unit that was itself already deleted
        // (or never existed), leaving them with a name absent from the Units
        // list. Reuse any other real unit, or create one if this was the last.
        const fallbackUnit =
          (await tx.inventoryUnit.findFirst({
            where: { workspaceId: existing.workspaceId, id: { not: existing.id } },
            orderBy: { createdAt: "asc" },
          })) ??
          (await tx.inventoryUnit.create({
            data: {
              tenantId: existing.tenantId,
              companyId: existing.companyId,
              workspaceId: existing.workspaceId,
              name: "pcs",
            },
          }));

        await tx.inventoryItem.updateMany({
          where: { workspaceId: existing.workspaceId, unit: existing.name },
          data: { unit: fallbackUnit.name },
        });
      }

      await tx.inventoryUnit.delete({ where: { id: existing.id } });

      return affectedItemCount;
    });

    return { success: true, id: existing.id, reassignedItemCount };
  }

  private async assertValuationStockPolicy(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    movements: Array<{ balanceQuantity: number }>,
  ) {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { companyId: true } });
    const settings = workspace
      ? await tx.accountingSettings.findUnique({ where: { companyId: workspace.companyId }, select: { negativeStockPolicy: true } })
      : null;
    if (movements.some((movement) => movement.balanceQuantity < -0.000001)) {
      if (settings?.negativeStockPolicy === "ALLOW_NEGATIVE") return;
      throw new BadRequestException("This adjustment would make historical warehouse stock negative. Correct the date or quantity first.");
    }
  }

  private async ensureWorkspaceAccess(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId,
      },
    });

    if (!membership) {
      throw new ForbiddenException("Workspace access denied");
    }
  }

  /** "Limited" in the Users & Roles permission matrix means the user may only
   * edit/delete/share records they personally created — PermissionGuard can
   * only check whether a key exists, not whose record this is, so that
   * second check has to live here, against the actual row being mutated. */
  private async assertRecordScope(
    currentUser: AuthenticatedRequestUser,
    resource: string,
    action: "view" | "edit" | "share" | "delete",
    recordCreatedByUserId: string | null,
  ) {
    const granted = await this.permissionsService.getGrantedKeys(currentUser);
    const scope = this.permissionsService.resolveScope(granted, resource, action);
    if (scope === "none") {
      throw new ForbiddenException(`You do not have permission to ${action} this ${resource}`);
    }
    if (scope === "own" && recordCreatedByUserId !== currentUser.id) {
      throw new ForbiddenException(`You can only ${action} ${resource} records you created`);
    }
  }

  private async ensureValidInventoryCategory(workspaceId: string, categoryName: string) {
    const category = await this.prisma.inventoryCategory.findFirst({
      where: { workspaceId, name: categoryName },
    });

    if (!category) {
      throw new BadRequestException("Category must be selected from an existing category");
    }

    return category.id;
  }
}
