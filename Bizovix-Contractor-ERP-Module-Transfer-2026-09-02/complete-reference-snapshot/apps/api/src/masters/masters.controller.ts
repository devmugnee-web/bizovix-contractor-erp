import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { MastersService } from "./masters.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller()
export class MastersController {
  constructor(@Inject(MastersService) private readonly mastersService: MastersService) {}

  @Get("parties")
  async listParties(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
    @Query("type") type?: string,
  ) {
    return this.mastersService.listParties(currentUser, workspaceId, type);
  }

  @Post("parties")
  @RequirePermission("party.create")
  async createParty(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Body()
    body?: {
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
    return this.mastersService.createParty(currentUser, body);
  }

  @Post("parties/import")
  @RequirePermission("party.create")
  async importParties(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Body()
    body?: {
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
    return this.mastersService.importParties(currentUser, body);
  }

  @Put("parties/:partyId")
  async updateParty(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("partyId") partyId: string,
    @Body()
    body?: {
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
    return this.mastersService.updateParty(currentUser, partyId, body);
  }

  @Delete("parties/:partyId")
  async deleteParty(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("partyId") partyId: string) {
    return this.mastersService.deleteParty(currentUser, partyId);
  }

  @Get("inventory/items")
  async listInventory(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.mastersService.listInventory(currentUser, workspaceId);
  }

  @Post("inventory/items")
  @RequirePermission("item.create")
  async createInventory(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Body()
    body?: {
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
    return this.mastersService.createInventory(currentUser, body);
  }

  @Put("inventory/items/:itemId")
  async updateInventory(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("itemId") itemId: string,
    @Body()
    body?: {
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
    return this.mastersService.updateInventory(currentUser, itemId, body);
  }

  @Delete("inventory/items/:itemId")
  async deleteInventory(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("itemId") itemId: string,
  ) {
    return this.mastersService.deleteInventory(currentUser, itemId);
  }

  @Post("inventory/items/:itemId/adjustments")
  @RequirePermission("inventory.stock_item.create")
  async createInventoryAdjustment(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("itemId") itemId: string,
    @Body()
    body?: {
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
    return this.mastersService.createInventoryAdjustment(currentUser, itemId, body);
  }

  @Put("inventory/items/:itemId/adjustments/:adjustmentId")
  @RequirePermission("inventory.stock_item.create")
  async updateInventoryAdjustment(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("itemId") itemId: string,
    @Param("adjustmentId") adjustmentId: string,
    @Body()
    body?: {
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
    return this.mastersService.updateInventoryAdjustment(currentUser, itemId, adjustmentId, body);
  }

  @Delete("inventory/items/:itemId/adjustments/:adjustmentId")
  @RequirePermission("inventory.stock_item.create")
  async deleteInventoryAdjustment(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("itemId") itemId: string,
    @Param("adjustmentId") adjustmentId: string,
  ) {
    return this.mastersService.deleteInventoryAdjustment(currentUser, itemId, adjustmentId);
  }

  @Get("inventory/categories")
  async listInventoryCategories(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.mastersService.listInventoryCategories(currentUser, workspaceId);
  }

  @Post("inventory/categories")
  @RequirePermission("inventory.stock_item.create")
  async createInventoryCategory(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Body() body?: { workspaceId?: string; name?: string; parentId?: string | null },
  ) {
    return this.mastersService.createInventoryCategory(currentUser, body);
  }

  @Put("inventory/categories/:categoryId")
  @RequirePermission("inventory.stock_item.create")
  async updateInventoryCategory(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("categoryId") categoryId: string,
    @Body() body?: { name?: string; parentId?: string | null },
  ) {
    return this.mastersService.updateInventoryCategory(currentUser, categoryId, body);
  }

  @Delete("inventory/categories/:categoryId")
  @RequirePermission("inventory.stock_item.create")
  async deleteInventoryCategory(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("categoryId") categoryId: string) {
    return this.mastersService.deleteInventoryCategory(currentUser, categoryId);
  }

  @Get("inventory/units")
  async listInventoryUnits(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.mastersService.listInventoryUnits(currentUser, workspaceId);
  }

  @Post("inventory/units")
  @RequirePermission("inventory.stock_item.create")
  async createInventoryUnit(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Body() body?: { workspaceId?: string; name?: string; alternateUnit?: string; alternateUnitConversion?: number },
  ) {
    return this.mastersService.createInventoryUnit(currentUser, body);
  }

  @Put("inventory/units/:unitId")
  @RequirePermission("inventory.stock_item.create")
  async updateInventoryUnit(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("unitId") unitId: string,
    @Body() body?: { name?: string; alternateUnit?: string; alternateUnitConversion?: number },
  ) {
    return this.mastersService.updateInventoryUnit(currentUser, unitId, body);
  }

  @Delete("inventory/units/:unitId")
  @RequirePermission("inventory.stock_item.create")
  async deleteInventoryUnit(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("unitId") unitId: string) {
    return this.mastersService.deleteInventoryUnit(currentUser, unitId);
  }
}
