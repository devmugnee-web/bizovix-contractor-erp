import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { CreateLcCostEntryDto } from "./dto/create-cost-entry.dto.js";
import { CreateLcCostHeadDto } from "./dto/create-cost-head.dto.js";
import { CreateLcDto } from "./dto/create-lc.dto.js";
import { CreateLcGrnDto } from "./dto/create-grn.dto.js";
import { CreateLcShipmentDto } from "./dto/create-shipment.dto.js";
import { ReopenLcLandedCostDto } from "./dto/reopen-lc.dto.js";
import { PostLcInventoryDto, UpdateLcInventoryPostingDto } from "./dto/post-lc-inventory.dto.js";
import { SaveLcAllocationDto } from "./dto/save-allocation.dto.js";
import { SetLcStatusDto } from "./dto/set-lc-status.dto.js";
import { UpdateLcCostEntryDto } from "./dto/update-cost-entry.dto.js";
import { UpdateLcCostHeadDto } from "./dto/update-cost-head.dto.js";
import { UpdateLcDto } from "./dto/update-lc.dto.js";
import { UpdateLcProfitDto } from "./dto/update-lc-profit.dto.js";
import { LcService } from "./lc.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("lc")
export class LcController {
  constructor(@Inject(LcService) private readonly lcService: LcService) {}

  @Get("dashboard")
  @RequirePermission("lc.view")
  async getDashboard(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.lcService.getDashboard(currentUser, workspaceId);
  }

  @Get("cost-heads")
  @RequirePermission("lc.configure")
  async listCostHeads(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId: string) {
    return this.lcService.listCostHeads(currentUser, workspaceId);
  }

  @Post("cost-heads")
  @RequirePermission("lc.configure")
  async createCostHead(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateLcCostHeadDto) {
    return this.lcService.createCostHead(currentUser, dto);
  }

  @Patch("cost-heads/:id")
  @RequirePermission("lc.configure")
  async updateCostHead(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: UpdateLcCostHeadDto) {
    return this.lcService.updateCostHead(currentUser, id, dto);
  }

  @Delete("cost-heads/:id")
  @RequirePermission("lc.configure")
  async deleteCostHead(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.lcService.deleteCostHead(currentUser, id);
  }

  @Get("reports/register")
  @RequirePermission("lc.reports.view")
  async getLcRegister(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.lcService.getLcRegister(currentUser, workspaceId);
  }

  @Get("reports/by-category")
  @RequirePermission("lc.reports.view")
  async getCostReportByCategory(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId: string,
    @Query("category") category: string,
  ) {
    return this.lcService.getCostReportByCategory(currentUser, workspaceId, category);
  }

  @Get()
  @RequirePermission("lc.view")
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.lcService.list(currentUser, workspaceId);
  }

  @Post()
  @RequirePermission("lc.create")
  async create(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateLcDto) {
    return this.lcService.create(currentUser, dto);
  }

  @Get(":id")
  @RequirePermission("lc.view")
  async getById(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.lcService.getById(currentUser, id);
  }

  @Patch(":id")
  @RequirePermission("lc.edit")
  async update(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: UpdateLcDto) {
    return this.lcService.update(currentUser, id, dto);
  }

  @Patch(":id/status")
  @RequirePermission("lc.edit")
  async setStatus(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: SetLcStatusDto) {
    return this.lcService.setStatus(currentUser, id, dto);
  }

  @Delete(":id")
  @RequirePermission("lc.delete")
  async delete(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.lcService.delete(currentUser, id);
  }

  @Post(":id/shipments")
  @RequirePermission("lc.edit")
  async addShipment(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: CreateLcShipmentDto) {
    return this.lcService.addShipment(currentUser, id, dto);
  }

  @Delete(":id/shipments/:shipmentId")
  @RequirePermission("lc.edit")
  async deleteShipment(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Param("shipmentId") shipmentId: string) {
    return this.lcService.deleteShipment(currentUser, id, shipmentId);
  }

  @Post(":id/cost-entries")
  @RequirePermission("lc.cost.enter")
  async createCostEntry(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: CreateLcCostEntryDto) {
    return this.lcService.createCostEntry(currentUser, id, dto);
  }

  @Patch(":id/cost-entries/:costEntryId")
  @RequirePermission("lc.cost.edit")
  async updateCostEntry(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Param("costEntryId") costEntryId: string,
    @Body() dto: UpdateLcCostEntryDto,
  ) {
    return this.lcService.updateCostEntry(currentUser, id, costEntryId, dto);
  }

  @Delete(":id/cost-entries/:costEntryId")
  @RequirePermission("lc.cost.edit")
  async deleteCostEntry(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Param("costEntryId") costEntryId: string) {
    return this.lcService.deleteCostEntry(currentUser, id, costEntryId);
  }

  @Get(":id/cost-entries/:costEntryId/allocation")
  @RequirePermission("lc.cost.allocate")
  async previewAllocation(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Param("costEntryId") costEntryId: string,
    @Query("allocationBasis") allocationBasis?: string,
  ) {
    return this.lcService.previewAllocation(currentUser, id, costEntryId, allocationBasis);
  }

  @Post(":id/cost-entries/:costEntryId/allocation")
  @RequirePermission("lc.cost.allocate")
  async saveAllocation(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Param("costEntryId") costEntryId: string,
    @Body() dto: SaveLcAllocationDto,
  ) {
    return this.lcService.saveAllocation(currentUser, id, costEntryId, dto);
  }

  @Post(":id/grns")
  @RequirePermission("lc.edit")
  async createGrn(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: CreateLcGrnDto) {
    return this.lcService.createGrn(currentUser, id, dto);
  }

  @Patch(":id/grns/:grnId")
  @RequirePermission("lc.edit")
  async updateGrn(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Param("grnId") grnId: string,
    @Body() dto: CreateLcGrnDto,
  ) {
    return this.lcService.updateGrn(currentUser, id, grnId, dto);
  }

  @Get(":id/landed-cost")
  @RequirePermission("lc.view")
  async previewLandedCost(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.lcService.previewLandedCost(currentUser, id);
  }

  @Patch(":id/landed-cost/profit")
  @RequirePermission("lc.edit")
  async updateLandedCostProfit(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: UpdateLcProfitDto) {
    return this.lcService.updateLandedCostProfit(currentUser, id, dto);
  }

  @Post(":id/landed-cost/finalize")
  @RequirePermission("lc.finalize")
  async finalizeLandedCost(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.lcService.finalizeLandedCost(currentUser, id);
  }

  @Post(":id/landed-cost/post-inventory")
  @RequirePermission("lc.finalize")
  async postInventory(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: PostLcInventoryDto) {
    return this.lcService.postFinalizedInventory(currentUser, id, dto);
  }

  @Patch(":id/landed-cost/inventory-posting")
  @RequirePermission("lc.finalize")
  async updateInventoryPosting(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: UpdateLcInventoryPostingDto) {
    return this.lcService.updateFinalizedInventoryPosting(currentUser, id, dto);
  }

  @Post(":id/landed-cost/reopen")
  @RequirePermission("lc.finalize.reopen")
  async reopenLandedCost(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: ReopenLcLandedCostDto) {
    return this.lcService.reopenLandedCost(currentUser, id, dto);
  }

  @Get(":id/reports/cost-sheet")
  @RequirePermission("lc.reports.view")
  async getCompleteLcCostSheet(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.lcService.getCompleteLcCostSheet(currentUser, id);
  }

  @Get(":id/reports/allocation")
  @RequirePermission("lc.reports.view")
  async getAllocationReport(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.lcService.getAllocationReport(currentUser, id);
  }
}
