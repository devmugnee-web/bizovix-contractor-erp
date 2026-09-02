import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import {
  CreateLcDto,
  InventoryPostingDto,
  LcCostEntryDto,
  LcCostHeadDto,
  LcGrnDto,
  LcStatusDto,
  ProfitDto,
  ReopenLcDto,
  SaveAllocationDto,
  ShipmentDto,
  UpdateInventoryPostingDto,
  UpdateLcCostEntryDto,
  UpdateLcCostHeadDto,
  UpdateLcDto,
  WarehouseDto,
} from "./dto/lc.dto";
import { LcService } from "./lc.service";

@Controller("lc")
export class LcController {
  constructor(private readonly service: LcService) {}

  @Get("dashboard") @RequirePermissions("lc.view")
  dashboard(@CurrentUser() u: AuthUser) { return this.service.dashboard(u.organizationId); }
  @Get("warehouses") @RequirePermissions("lc.view")
  warehouses(@CurrentUser() u: AuthUser) { return this.service.listWarehouses(u.organizationId); }
  @Post("warehouses") @RequirePermissions("lc.configure")
  createWarehouse(@Body() d: WarehouseDto, @CurrentUser() u: AuthUser) { return this.service.createWarehouse(u.organizationId, u.id, d); }
  @Get("cost-heads") @RequirePermissions("lc.view")
  costHeads(@CurrentUser() u: AuthUser) { return this.service.listCostHeads(u.organizationId); }
  @Post("cost-heads") @RequirePermissions("lc.configure")
  createCostHead(@Body() d: LcCostHeadDto, @CurrentUser() u: AuthUser) { return this.service.createCostHead(u.organizationId, u.id, d); }
  @Patch("cost-heads/:id") @RequirePermissions("lc.configure")
  updateCostHead(@Param("id") id: string, @Body() d: UpdateLcCostHeadDto, @CurrentUser() u: AuthUser) { return this.service.updateCostHead(u.organizationId, u.id, id, d); }
  @Delete("cost-heads/:id") @RequirePermissions("lc.configure")
  deleteCostHead(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.deleteCostHead(u.organizationId, u.id, id); }
  @Get("reports/register") @RequirePermissions("lc.reports.view")
  register(@CurrentUser() u: AuthUser) { return this.service.registerReport(u.organizationId); }
  @Get("reports/by-category") @RequirePermissions("lc.reports.view")
  byCategory(@Query("category") category: string, @CurrentUser() u: AuthUser) { return this.service.categoryReport(u.organizationId, category); }

  @Get() @RequirePermissions("lc.view")
  list(@CurrentUser() u: AuthUser) { return this.service.list(u.organizationId); }
  @Post() @RequirePermissions("lc.create")
  create(@Body() d: CreateLcDto, @CurrentUser() u: AuthUser) { return this.service.create(u.organizationId, u.id, d); }
  @Get(":id") @RequirePermissions("lc.view")
  one(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.findOne(u.organizationId, id); }
  @Patch(":id") @RequirePermissions("lc.edit")
  update(@Param("id") id: string, @Body() d: UpdateLcDto, @CurrentUser() u: AuthUser) { return this.service.update(u.organizationId, u.id, id, d); }
  @Patch(":id/status") @RequirePermissions("lc.edit")
  status(@Param("id") id: string, @Body() d: LcStatusDto, @CurrentUser() u: AuthUser) { return this.service.setStatus(u.organizationId, u.id, id, d); }
  @Delete(":id") @RequirePermissions("lc.delete")
  remove(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.remove(u.organizationId, u.id, id); }

  @Post(":id/shipments") @RequirePermissions("lc.edit")
  shipment(@Param("id") id: string, @Body() d: ShipmentDto, @CurrentUser() u: AuthUser) { return this.service.addShipment(u.organizationId, u.id, id, d); }
  @Delete(":id/shipments/:shipmentId") @RequirePermissions("lc.edit")
  deleteShipment(@Param("id") id: string, @Param("shipmentId") shipmentId: string, @CurrentUser() u: AuthUser) { return this.service.deleteShipment(u.organizationId, u.id, id, shipmentId); }

  @Post(":id/cost-entries") @RequirePermissions("lc.cost.enter")
  costEntry(@Param("id") id: string, @Body() d: LcCostEntryDto, @CurrentUser() u: AuthUser) { return this.service.createCostEntry(u.organizationId, u.id, id, d); }
  @Patch(":id/cost-entries/:costEntryId") @RequirePermissions("lc.cost.edit")
  updateCostEntry(@Param("id") id: string, @Param("costEntryId") costEntryId: string, @Body() d: UpdateLcCostEntryDto, @CurrentUser() u: AuthUser) { return this.service.updateCostEntry(u.organizationId, u.id, id, costEntryId, d); }
  @Delete(":id/cost-entries/:costEntryId") @RequirePermissions("lc.cost.edit")
  deleteCostEntry(@Param("id") id: string, @Param("costEntryId") costEntryId: string, @CurrentUser() u: AuthUser) { return this.service.deleteCostEntry(u.organizationId, u.id, id, costEntryId); }
  @Get(":id/cost-entries/:costEntryId/allocation") @RequirePermissions("lc.cost.allocate")
  previewAllocation(@Param("id") id: string, @Param("costEntryId") costEntryId: string, @Query("allocationBasis") basis: string | undefined, @CurrentUser() u: AuthUser) { return this.service.previewAllocation(u.organizationId, id, costEntryId, basis); }
  @Post(":id/cost-entries/:costEntryId/allocation") @RequirePermissions("lc.cost.allocate")
  saveAllocation(@Param("id") id: string, @Param("costEntryId") costEntryId: string, @Body() d: SaveAllocationDto, @CurrentUser() u: AuthUser) { return this.service.saveAllocation(u.organizationId, u.id, id, costEntryId, d); }

  @Post(":id/grns") @RequirePermissions("lc.edit")
  grn(@Param("id") id: string, @Body() d: LcGrnDto, @CurrentUser() u: AuthUser) { return this.service.createGrn(u.organizationId, u.id, id, d); }
  @Patch(":id/grns/:grnId") @RequirePermissions("lc.edit")
  updateGrn(@Param("id") id: string, @Param("grnId") grnId: string, @Body() d: LcGrnDto, @CurrentUser() u: AuthUser) { return this.service.updateGrn(u.organizationId, u.id, id, grnId, d); }

  @Get(":id/landed-cost") @RequirePermissions("lc.view")
  landedCost(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.previewLandedCost(u.organizationId, id); }
  @Patch(":id/landed-cost/profit") @RequirePermissions("lc.edit")
  profit(@Param("id") id: string, @Body() d: ProfitDto, @CurrentUser() u: AuthUser) { return this.service.updateProfit(u.organizationId, u.id, id, d); }
  @Post(":id/landed-cost/finalize") @RequirePermissions("lc.finalize")
  finalize(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.finalize(u.organizationId, u.id, id); }
  @Post(":id/landed-cost/post-inventory") @RequirePermissions("lc.finalize")
  postInventory(@Param("id") id: string, @Body() d: InventoryPostingDto, @CurrentUser() u: AuthUser) { return this.service.postInventory(u.organizationId, u.id, id, d); }
  @Patch(":id/landed-cost/inventory-posting") @RequirePermissions("lc.finalize")
  updateInventory(@Param("id") id: string, @Body() d: UpdateInventoryPostingDto, @CurrentUser() u: AuthUser) { return this.service.updateInventoryPosting(u.organizationId, u.id, id, d); }
  @Post(":id/landed-cost/reopen") @RequirePermissions("lc.finalize.reopen")
  reopen(@Param("id") id: string, @Body() d: ReopenLcDto, @CurrentUser() u: AuthUser) { return this.service.reopen(u.organizationId, u.id, id, d); }
  @Get(":id/reports/cost-sheet") @RequirePermissions("lc.reports.view")
  costSheet(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.costSheet(u.organizationId, id); }
  @Get(":id/reports/allocation") @RequirePermissions("lc.reports.view")
  allocationReport(@Param("id") id: string, @CurrentUser() u: AuthUser) { return this.service.allocationReport(u.organizationId, id); }
}
