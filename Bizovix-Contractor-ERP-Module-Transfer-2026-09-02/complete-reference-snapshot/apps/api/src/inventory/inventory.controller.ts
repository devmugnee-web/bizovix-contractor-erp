import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { CreateWarehouseTransferDto, SaveWarehouseDto } from "./dto/warehouse.dto.js";
import { InventoryService } from "./inventory.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("inventory")
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get("warehouses")
  list(@CurrentUser() user: AuthenticatedRequestUser, @Query("workspaceId") workspaceId: string, @Query("activeOnly") activeOnly?: string) { return this.inventory.listWarehouses(user, workspaceId, activeOnly === "true"); }

  @Get("manufacturing-sale-provenance")
  manufacturingSaleProvenance(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId: string,
  ) { return this.inventory.manufacturingSaleProvenance(user, workspaceId); }

  @Post("warehouses")
  @RequirePermission("warehouse.create")
  create(@CurrentUser() user: AuthenticatedRequestUser, @Query("workspaceId") workspaceId: string, @Body() dto: SaveWarehouseDto) { return this.inventory.createWarehouse(user, workspaceId, dto); }

  @Put("warehouses/:id")
  @RequirePermission("warehouse.update")
  update(@CurrentUser() user: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: SaveWarehouseDto) { return this.inventory.updateWarehouse(user, id, dto); }

  @Delete("warehouses/:id")
  @RequirePermission("warehouse.deactivate")
  remove(@CurrentUser() user: AuthenticatedRequestUser, @Param("id") id: string) { return this.inventory.deleteWarehouse(user, id); }

  @Get("warehouse-stock")
  stock(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId: string,
    @Query("warehouseId") warehouseId?: string,
    @Query("productId") productId?: string,
    @Query("to") to?: string,
  ) { return this.inventory.stockSummary(user, workspaceId, warehouseId, productId, to); }

  @Get("stock-ledger")
  ledger(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: { workspaceId: string; warehouseId?: string; productId?: string; transactionType?: string; reference?: string; from?: string; to?: string }) { return this.inventory.ledger(user, query.workspaceId, query); }

  @Post("warehouse-transfers")
  @RequirePermission("warehouse.transfer")
  transfer(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: CreateWarehouseTransferDto) { return this.inventory.createTransfer(user, dto); }
}
