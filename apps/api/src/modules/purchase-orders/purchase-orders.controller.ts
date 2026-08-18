import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { SavePurchaseOrderDto } from "./dto/save-purchase-order.dto";
import { QueryPurchaseOrderDto } from "./dto/query-purchase-order.dto";

@Controller("purchase-orders")
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  @RequirePermissions("procurement.read")
  findAll(@Query() query: QueryPurchaseOrderDto, @CurrentUser() user: AuthUser) {
    return this.purchaseOrdersService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("procurement.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.purchaseOrdersService.stats(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("procurement.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.purchaseOrdersService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("po.create")
  @ResponseMessage("Purchase Order created successfully")
  create(@Body() dto: SavePurchaseOrderDto, @CurrentUser() user: AuthUser) {
    return this.purchaseOrdersService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("po.update")
  @ResponseMessage("Purchase Order updated successfully")
  update(@Param("id") id: string, @Body() dto: SavePurchaseOrderDto, @CurrentUser() user: AuthUser) {
    return this.purchaseOrdersService.update(user.organizationId, user.id, id, dto);
  }

  @Post(":id/approve")
  @RequirePermissions("po.approve")
  @ResponseMessage("Purchase Order approved successfully")
  approve(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.purchaseOrdersService.approve(user.organizationId, user.id, id);
  }

  @Post(":id/issue")
  @RequirePermissions("po.issue")
  @ResponseMessage("Purchase Order issued successfully")
  issue(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.purchaseOrdersService.issue(user.organizationId, user.id, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("po.update")
  @ResponseMessage("Purchase Order cancelled successfully")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.purchaseOrdersService.cancel(user.organizationId, user.id, id);
  }

  @Post(":id/close")
  @RequirePermissions("po.update")
  @ResponseMessage("Purchase Order closed successfully")
  close(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.purchaseOrdersService.close(user.organizationId, user.id, id);
  }
}
